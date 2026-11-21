import { grayAt, quantile, toGrayImage } from './omr-image.js';
import { project } from './projective.js';

const maxGridSide = 64;
const point = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y);
const positive = (value) => Number.isFinite(value) && value > 0;
const validCount = (value) => Number.isInteger(value) && value >= 1 && value <= maxGridSide;
export const validBounds = (bounds) => point(bounds) && positive(bounds.width) && positive(bounds.height);
export const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width &&
  a.y < b.y + b.height && b.y < a.y + a.height;
const contains = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

export function manualGrid({ topLeft, topRight, bottomLeft, rows, columns, radius }) {
  if (![topLeft, topRight, bottomLeft].every(point) || !validCount(rows) || !validCount(columns) ||
      rows * columns > 600 || !positive(radius)) throw new TypeError('Use positive grid dimensions and a valid first, last, and bottom cell.');
  const along = columns === 1 ? { x: 0, y: 0 } : {
    x: (topRight.x - topLeft.x) / (columns - 1), y: (topRight.y - topLeft.y) / (columns - 1),
  };
  const down = rows === 1 ? { x: 0, y: 0 } : {
    x: (bottomLeft.x - topLeft.x) / (rows - 1), y: (bottomLeft.y - topLeft.y) / (rows - 1),
  };
  const rowSpacing = Math.hypot(down.x, down.y);
  const columnSpacing = Math.hypot(along.x, along.y);
  if ((rows > 1 && rowSpacing <= 2 * radius) || (columns > 1 && columnSpacing <= 2 * radius) ||
      (rows > 1 && columns > 1 && along.x * down.y - along.y * down.x <= rowSpacing * columnSpacing * .45)) {
    throw new TypeError('Grid directions or spacing overlap. Separate the endpoints or use a smaller radius.');
  }
  const cells = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      row, column, x: topLeft.x + column * along.x + row * down.x,
      y: topLeft.y + column * along.y + row * down.y, radius,
    };
  });
  return { rows, columns, rowSpacing, columnSpacing, cells };
}

function rasterizeRegion(gray, matrix, region) {
  const scale = Math.min(3, 840 / Math.max(region.width, region.height));
  const width = Math.max(1, Math.floor(region.width * scale));
  const height = Math.max(1, Math.floor(region.height * scale));
  const values = new Uint8Array(width * height);
  const samples = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = project(matrix, region.x + x / scale, region.y + y / scale);
      const value = source ? grayAt(gray, source.x, source.y) : NaN;
      values[y * width + x] = Number.isFinite(value) ? value : 255;
      if (!(x % 7) && !(y % 7)) samples.push(values[y * width + x]);
    }
  }
  return { width, height, values, scale, background: quantile(samples, .75) };
}

function ringCandidates(raster, region, threshold) {
  const { width, height, values, scale } = raster;
  const visited = new Uint8Array(values.length);
  const queue = new Int32Array(values.length);
  const candidates = [];
  let count;
  function queueInk(index) {
    if (visited[index] || values[index] >= threshold) return;
    visited[index] = 1;
    queue[count++] = index;
  }
  for (let origin = 0; origin < values.length; origin++) {
    if (visited[origin] || values[origin] >= threshold) continue;
    count = 0;
    queueInk(origin);
    let left = width, top = height, right = 0, bottom = 0;
    for (let head = 0; head < count; head++) {
      const index = queue[head];
      const x = index % width;
      const y = Math.floor(index / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) {
        if (y + dy < 0 || y + dy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx >= 0 && x + dx < width) queueInk(index + dy * width + dx);
        }
      }
    }
    const w = right - left + 1;
    const h = bottom - top + 1;
    const radius = (w + h) / (4 * scale);
    const fill = count / (w * h);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    if (radius < 1.5 || radius > 8 || w / h < .70 || w / h > 1.43 || fill < .14 || fill > .78 ||
        values[Math.round(cy) * width + Math.round(cx)] < threshold) continue;
    candidates.push({ x: region.x + cx / scale, y: region.y + cy / scale, radius });
  }
  return candidates;
}

function bands(points, axis, spacingTolerance) {
  const ordered = [...points].sort((a, b) => a[axis] - b[axis]);
  const groups = [];
  for (const candidate of ordered) {
    const recent = groups.at(-1);
    if (recent && candidate[axis] - recent.center < spacingTolerance) {
      recent.total += candidate[axis];
      recent.count++;
      recent.center = recent.total / recent.count;
    } else groups.push({ center: candidate[axis], total: candidate[axis], count: 1 });
  }
  return groups;
}

function fitLattice(candidates, rowCount, columnCount) {
  if (!candidates.length) return null;
  const radius = quantile(candidates.map((candidate) => candidate.radius), .5);
  const probable = candidates.filter((candidate) => Math.abs(candidate.radius - radius) <= radius * .39);
  const tolerance = Math.max(.7, radius * .90);
  function select(axis, count, otherCount) {
    const groups = bands(probable, axis, tolerance);
    const supported = groups.filter((group) => group.count >= Math.max(1, Math.ceil((otherCount ?? 2) * .35)));
    const ranked = supported.sort((a, b) => b.count - a.count);
    return ranked.slice(0, count).sort((a, b) => a.center - b.center);
  }
  const rows = select('y', rowCount, columnCount);
  const columns = select('x', columnCount, rowCount);
  if (!rows.length || !columns.length) return null;
  const cells = [];
  const missing = [];
  const conflicts = [];
  for (const [row, y] of rows.entries()) {
    for (const [column, x] of columns.entries()) {
      const matches = probable.filter((candidate) =>
        Math.abs(candidate.x - x.center) <= tolerance && Math.abs(candidate.y - y.center) <= tolerance);
      if (matches.length === 1) cells.push({ ...matches[0], row, column });
      else (matches.length ? conflicts : missing).push({ row, column, x: x.center, y: y.center });
    }
  }
  return { rows: rows.length, columns: columns.length, cells, missing, conflicts, radius, candidates: candidates.length };
}

export function proposeGrid(image, pageToSource, region, { rows, columns } = {}) {
  if (!validBounds(region) || (rows !== undefined && !validCount(rows)) || (columns !== undefined && !validCount(columns))) {
    throw new TypeError('Draw a region and choose valid row and column counts.');
  }
  const raster = rasterizeRegion(toGrayImage(image), pageToSource, region);
  const settings = [.65, .82].map((ratio) => ringCandidates(raster, region, raster.background * ratio));
  const fits = settings.map((candidates) => fitLattice(candidates, rows, columns)).filter(Boolean);
  const quality = (fit) => fit.cells.length - fit.conflicts.length * 2 - (fit.missing.length * .2);
  fits.sort((a, b) => quality(b) - quality(a));
  const best = fits[0];
  if (!best) return { status: 'none', rows: rows ?? 0, columns: columns ?? 0, cells: [], missing: [], conflicts: [], trials: settings.map((c) => c.length) };
  const complete = best.rows === (rows ?? best.rows) && best.columns === (columns ?? best.columns) &&
    !best.missing.length && !best.conflicts.length;
  return { status: complete ? 'complete' : 'partial', ...best, trials: settings.map((c) => c.length) };
}

function fail(condition, message) {
  if (!condition) throw new TypeError(message);
}

export function createMarkerlessProfile({ id, revision, name, page, components, features, allowManualIdentity = false }) {
  fail(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id) && Number.isInteger(revision) && revision > 0,
    'The profile needs a valid ID and revision.');
  fail(typeof name === 'string' && name.trim() && name.trim().length <= 80, 'Enter a name of up to 80 characters.');
  fail(page && positive(page.width) && positive(page.height) && page.width <= 1440 && page.height <= 1440 &&
    page.units === 'pt' && page.origin === 'top-left' && ['portrait', 'landscape'].includes(page.orientation),
  'Choose a supported page size and orientation.');
  fail(Array.isArray(components) && components.length > 0 && components.length <= 24, 'Confirm one or more answer blocks.');
  const frame = { x: 0, y: 0, width: page.width, height: page.height };
  const seen = new Set();
  const allBubbles = [];
  function unique(value) {
    fail(typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,48}$/.test(value) && !seen.has(value),
      'Block, item, and slot identifiers must be unique and contain only letters, digits, periods, dashes or underscores.');
    seen.add(value);
  }
  function choices(raw, kind, bounds) {
    const result = [];
    const symbols = new Set();
    fail(Array.isArray(raw) && raw.length >= (kind === 'mc' ? 2 : 1) && raw.length <= 13, 'An item or slot has an unsupported number of symbols.');
    for (const entry of raw) {
      const { symbol, x, y, radius } = entry ?? {};
      fail(typeof symbol === 'string' && (kind === 'mc' ? /^[A-Z0-9]{1,5}$/ : /^[0-9.\-+]$/).test(symbol) &&
        !symbols.has(symbol), 'Each choice in an item or slot needs a unique supported symbol.');
      const bubbleBounds = { x: x - radius, y: y - radius, width: 2 * radius, height: 2 * radius };
      fail(point({ x, y }) && positive(radius) && radius <= 22 && contains(bounds, bubbleBounds),
        'A bubble center or radius is outside its assigned region.');
      symbols.add(symbol);
      const bubble = { symbol, x, y, radius };
      allBubbles.push(bubble);
      result.push(bubble);
    }
    return result;
  }
  const verified = [];
  for (const component of components) {
    const { id: blockId, kind, bounds, items } = component ?? {};
    unique(blockId);
    fail(['mc', 'nr'].includes(kind) && validBounds(bounds) && contains(frame, bounds) &&
      !verified.some((other) => intersects(bounds, other.bounds)), 'Answer blocks must stay on the page and may not overlap.');
    fail(Array.isArray(items) && items.length > 0 && items.length <= 64, 'Every confirmed block needs at least one item.');
    const mapped = items.map((item) => {
      unique(item?.id);
      fail(item.kind === kind && validBounds(item.bounds) && contains(bounds, item.bounds),
        'Every item must match its block type and remain inside it.');
      const base = { id: item.id, kind, bounds: { ...item.bounds } };
      if (kind === 'mc') return { ...base, choices: choices(item.choices, kind, item.bounds) };
      fail(Array.isArray(item.slots) && item.slots.length === 4, 'Each numerical response needs exactly four ordered positions.');
      return {
        ...base,
        slots: item.slots.map((slot) => {
          unique(slot?.id);
          return { id: slot.id, choices: choices(slot.choices, kind, item.bounds) };
        }),
      };
    });
    for (const [index, item] of mapped.entries()) {
      fail(!mapped.slice(0, index).some((other) => intersects(item.bounds, other.bounds)), 'Item regions in the same block may not overlap.');
    }
    verified.push({ id: blockId, kind, bounds: { ...bounds }, items: mapped });
  }
  fail(allBubbles.length <= 1200, 'This profile exceeds the supported number of bubbles.');
  for (const [index, a] of allBubbles.entries()) {
    fail(!allBubbles.slice(0, index).some((b) => Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius),
      'Two bubble positions overlap.');
  }
  fail(Array.isArray(features) && features.length <= 16 && (features.length >= 4 || (features.length === 0 && allowManualIdentity)),
    'Use at least four printed feature regions, or explicitly require manual confirmation on every scan.');
  const sanitized = features.map(({ id: featureId, bounds, samples }) => {
    unique(featureId);
    fail(validBounds(bounds) && contains(frame, bounds) && bounds.width >= 6 && bounds.height >= 6 &&
      bounds.width <= 132 && bounds.height <= 132 && !verified.some((component) => intersects(bounds, component.bounds)),
    'Printed features must be small on-page regions outside all response blocks.');
    fail(Array.isArray(samples) && samples.length === 144 && samples.every((sample) => sample === 0 || sample === 1) &&
      samples.reduce((sum, sample) => sum + sample, 0) >= 14 && samples.reduce((sum, sample) => sum + sample, 0) <= 120,
    'Each printed feature needs distinguishable printed ink and background.');
    return { id: featureId, bounds: { ...bounds }, samples: [...samples] };
  });
  for (const [index, feature] of sanitized.entries()) {
    fail(!sanitized.slice(0, index).some((other) => intersects(feature.bounds, other.bounds)), 'Printed feature regions may not overlap.');
  }
  if (sanitized.length) {
    const xs = sanitized.map(({ bounds }) => bounds.x + bounds.width / 2);
    const ys = sanitized.map(({ bounds }) => bounds.y + bounds.height / 2);
    fail(Math.max(...xs) - Math.min(...xs) >= page.width * .32 &&
      Math.max(...ys) - Math.min(...ys) >= page.height * .32, 'Spread printed features across the page.');
  }
  return {
    schemaVersion: 1, id, revision, name: name.trim(), strategy: 'markerless', page: {
      width: page.width, height: page.height, units: 'pt', origin: 'top-left', orientation: page.orientation,
    },
    components: verified, features: sanitized, allowManualIdentity: Boolean(allowManualIdentity),
    provenance: { source: 'teacher-confirmed-blank' },
  };
}
