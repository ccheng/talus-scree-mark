import { cross, fitProjective, invertProjective, project } from './projective.js';
import { grayAt, quantile } from './omr-image.js';

export { project } from './projective.js';

const markerGrid = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }];
const failed = (reason, evidence = {}) => ({ status: 'retake', reasons: [reason], ...evidence });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function downsample(image) {
  const divisor = Math.max(1, Math.max(image.width, image.height) / 1000);
  const width = Math.floor((image.width - 1) / divisor) + 1;
  const height = Math.floor((image.height - 1) / divisor) + 1;
  const mask = new Uint8Array(width * height);
  const background = [];
  for (let y = 0; y < height; y += 10) {
    for (let x = 0; x < width; x += 10) background.push(grayAt(image, x * divisor, y * divisor));
  }
  const threshold = Math.min(160, Math.max(53, quantile(background, .78) * .63));
  for (let y = 0; y < height; y++) {
    const row = Math.round(y * divisor) * image.width;
    for (let x = 0; x < width; x++) {
      mask[y * width + x] = image.values[row + Math.round(x * divisor)] < threshold ? 1 : 0;
    }
  }
  return { width, height, divisor, mask };
}

function hull(points) {
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (input) => {
    const result = [];
    for (const point of input) {
      while (result.length > 1 && cross(result[result.length - 2], result.at(-1), point) <= 0) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(points), ...half(points.reverse())];
}

function componentQuad(queue, count, width, minRow, maxRow, divisor) {
  const left = new Int32Array(maxRow - minRow + 1).fill(width);
  const right = new Int32Array(left.length).fill(-1);
  for (let i = 0; i < count; i++) {
    const x = queue[i] % width;
    const row = Math.floor(queue[i] / width) - minRow;
    left[row] = Math.min(left[row], x);
    right[row] = Math.max(right[row], x);
  }
  const boundary = [];
  for (let row = 0; row < left.length; row++) {
    if (right[row] === -1) continue;
    const y = (minRow + row) * divisor;
    boundary.push({ x: left[row] * divisor, y });
    if (right[row] !== left[row]) boundary.push({ x: right[row] * divisor, y });
  }
  const corners = hull(boundary);
  while (corners.length > 4) {
    let lowest = Infinity;
    let remove = 0;
    for (let i = 0; i < corners.length; i++) {
      const prev = corners[(i + corners.length - 1) % corners.length];
      const next = corners[(i + 1) % corners.length];
      const excess = Math.abs(cross(prev, corners[i], next)) / distance(prev, next);
      if (excess < lowest) {
        lowest = excess;
        remove = i;
      }
    }
    corners.splice(remove, 1);
  }
  return corners.length === 4 ? corners : null;
}

function edgeLine(image, first, second, divisor) {
  const length = distance(first, second);
  const ux = (second.x - first.x) / length;
  const uy = (second.y - first.y) / length;
  const range = Math.min(length / 7, Math.max(2.4, divisor * 2.7));
  const offsets = [];
  for (let index = 1; index <= 7; index++) {
    const distanceAlong = length * (.10 + index * .10);
    const x = first.x + distanceAlong * ux;
    const y = first.y + distanceAlong * uy;
    const sample = (offset) => grayAt(image, x + offset * uy, y - offset * ux);
    const inside = sample(-range);
    const outside = sample(range);
    if (!(outside - inside >= 25)) continue;
    const target = (inside + outside) / 2;
    let strongest = null;
    let previous = inside;
    for (let offset = -range + .40; offset <= range + .39; offset += .4) {
      const next = sample(Math.min(offset, range));
      if (previous < target && next >= target) {
        const strength = next - previous;
        const crossing = offset - .4 + .4 * (target - previous) / strength;
        if (!strongest || strength > strongest.strength) strongest = { strength, crossing };
      }
      previous = next;
    }
    if (strongest) offsets.push({ along: distanceAlong, offset: strongest.crossing });
  }
  if (offsets.length < 4) return { origin: first, direction: { x: ux, y: uy } };

  const mean = quantile(offsets.map(({ offset }) => offset), .5);
  const reliable = offsets.filter(({ offset }) => Math.abs(offset - mean) < Math.max(1.25, divisor));
  const count = reliable.length;
  if (count < 3) return { origin: first, direction: { x: ux, y: uy } };
  const centerAlong = reliable.reduce((sum, point) => sum + point.along, 0) / count;
  const centerOffset = reliable.reduce((sum, point) => sum + point.offset, 0) / count;
  const spread = reliable.reduce((sum, point) => sum + (point.along - centerAlong) ** 2, 0);
  const covariance = reliable.reduce((sum, point) => sum + (point.along - centerAlong) * (point.offset - centerOffset), 0);
  const slope = covariance / spread;
  const intercept = centerOffset - slope * centerAlong;
  return {
    origin: { x: first.x + uy * intercept, y: first.y - ux * intercept },
    direction: { x: ux + uy * slope, y: uy - ux * slope },
  };
}

function intersect(a, b) {
  const crossFactor = a.direction.x * b.direction.y - a.direction.y * b.direction.x;
  if (Math.abs(crossFactor) < .15) return null;
  const dx = b.origin.x - a.origin.x;
  const dy = b.origin.y - a.origin.y;
  const parameter = (dx * b.direction.y - dy * b.direction.x) / crossFactor;
  return { x: a.origin.x + parameter * a.direction.x, y: a.origin.y + parameter * a.direction.y };
}

function refineQuad(image, corners, divisor) {
  const edges = corners.map((point, index) => edgeLine(image, point, corners[(index + 1) % 4], divisor));
  return corners.map((coarse, index) => {
    const exact = intersect(edges[(index + 3) % 4], edges[index]);
    return exact && distance(coarse, exact) < divisor * 5 ? exact : coarse;
  });
}

function variants(markers, exactId) {
  const rotate = (grid) => grid.map((_, x) => grid.map((row) => row[x]).reverse().join(''));
  const possibilities = [];
  for (const marker of markers) {
    for (const mirrored of [false, true]) {
      let grid = mirrored ? marker.code.map((row) => [...row].reverse().join('')) : marker.code;
      for (let rotation = 0; rotation < 4; rotation++) {
        possibilities.push({ id: marker.id, bits: grid.join(''), mirrored, rotation, maxErrors: marker.id === exactId ? 0 : 1 });
        grid = rotate(grid);
      }
    }
  }
  return possibilities;
}

function decodeTag(image, corners, possibilities) {
  const transform = fitProjective(markerGrid, corners);
  if (!transform) return null;
  const border = [];
  const interior = [];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const samples = [[.5, .5], [.33, .5], [.67, .5], [.5, .33], [.5, .67]];
      const values = samples.map(([dx, dy]) => {
        const point = project(transform, x + dx, y + dy);
        return point ? grayAt(image, point.x, point.y) : NaN;
      });
      if (values.some((value) => !Number.isFinite(value))) return null;
      const destination = x === 0 || x === 5 || y === 0 || y === 5 ? border : interior;
      destination.push(quantile(values, .5));
    }
  }
  const dark = quantile(border, .5);
  const light = quantile(interior, .82);
  const contrast = light - dark;
  if (contrast < 39) return null;
  const threshold = (dark + light) / 2;
  if (border.filter((value) => value > threshold).length > 1) return null;
  const bits = interior.map((value) => value < threshold ? '1' : '0');
  const plausible = possibilities.filter((variant) => bits.reduce((errors, bit, i) => errors + (bit !== variant.bits[i]), 0) <= variant.maxErrors);
  if (plausible.length !== 1) return null;
  const { id, mirrored, rotation } = plausible[0];
  const center = project(transform, 3, 3);
  return center && { id, mirrored, rotation, center, corners, contrast, dark, light };
}

function discoverTags(image, markers, exactId) {
  const { width, height, divisor, mask } = downsample(image);
  const possibilities = variants(markers, exactId);
  const queue = new Int32Array(mask.length);
  const minimum = Math.max(8, Math.floor(Math.min(width, height) / 95));
  const maximum = Math.min(width, height) * .27;
  const found = [];

  let count = 0;
  function enqueue(index) {
    if (mask[index] === 1) {
      mask[index] = 0;
      queue[count++] = index;
    }
  }

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    count = 0;
    enqueue(start);
    let minColumn = width;
    let maxColumn = 0;
    let minRow = height;
    let maxRow = 0;
    for (let at = 0; at < count; at++) {
      const index = queue[at];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minColumn) minColumn = x;
      if (x > maxColumn) maxColumn = x;
      if (y < minRow) minRow = y;
      if (y > maxRow) maxRow = y;
      if (x > 0) enqueue(index - 1);
      if (x + 1 < width) enqueue(index + 1);
      if (y > 0) enqueue(index - width);
      if (y + 1 < height) enqueue(index + width);
    }
    const w = maxColumn - minColumn + 1;
    const h = maxRow - minRow + 1;
    if (w < minimum || h < minimum || w > maximum || h > maximum || w / h > 2 || h / w > 2 ||
        !minColumn || !minRow || maxColumn === width - 1 || maxRow === height - 1 || count < w * h * .30) continue;
    const quad = componentQuad(queue, count, width, minRow, maxRow, divisor);
    if (!quad) continue;
    const approximate = decodeTag(image, quad, possibilities);
    if (!approximate) continue;
    const refined = decodeTag(image, refineQuad(image, quad, divisor), possibilities);
    found.push(refined?.id === approximate.id ? refined : approximate);
  }
  return found;
}

function checkLandmark(image, transform, landmark) {
  const { x, y, radius } = landmark;
  const range = 2.05 * radius;
  const step = radius / 8;
  const nearby = [];
  for (let dy = -range; dy <= range; dy += step) {
    for (let dx = -range; dx <= range; dx += step) {
      const point = project(transform, x + dx, y + dy);
      const value = point && grayAt(image, point.x, point.y);
      if (!Number.isFinite(value)) return { id: landmark.id, found: false };
      nearby.push({ dx, dy, value });
    }
  }
  const values = nearby.map(({ value }) => value);
  const light = quantile(values, .80);
  const dark = quantile(values, .10);
  if (light - dark < 32) return { id: landmark.id, found: false };

  const threshold = (dark + light) / 2;
  const ink = nearby.filter(({ value }) => value < threshold);
  const relativeArea = ink.length * step * step / (Math.PI * radius * radius);
  if (relativeArea < .55 || relativeArea > 1.48) return { id: landmark.id, found: false };
  const dx = ink.reduce((sum, point) => sum + point.dx, 0) / ink.length;
  const dy = ink.reduce((sum, point) => sum + point.dy, 0) / ink.length;
  return {
    id: landmark.id,
    found: true,
    displacement: Math.hypot(dx, dy),
    expected: project(transform, x, y),
    observed: project(transform, x + dx, y + dy),
  };
}

function plausibleProjection(corners, image) {
  const lengths = corners.map((point, index) => distance(point, corners[(index + 1) % 4]));
  const short = Math.min(...lengths);
  if (short < Math.min(image.width, image.height) * .25 || Math.max(...lengths) > short * 3.5) return false;
  return corners.every((point, index) =>
    cross(point, corners[(index + 1) % 4], corners[(index + 2) % 4]) > lengths[index] * lengths[(index + 1) % 4] * .22);
}

function imageContains(point, image) {
  return point && point.x >= 0 && point.y >= 0 && point.x <= image.width - 1 && point.y <= image.height - 1;
}

function contentInFrame(profile, transform, image) {
  return profile.items.every(({ bounds }) => [
    [bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height],
  ].every(([x, y]) => imageContains(project(transform, x, y), image)));
}

export function registerSheet(image, profile) {
  const markers = discoverTags(image, [...profile.anchors, profile.discriminator], profile.discriminator.id);
  const anchorMatches = profile.anchors.map((anchor) => markers.filter((marker) => marker.id === anchor.id));
  const evidence = { markers };
  if (anchorMatches.some((matches) => matches.length > 1)) return failed('ambiguous-anchor', evidence);
  if (anchorMatches.some((matches) => matches.length === 0)) return failed('missing-anchor', evidence);
  const anchors = anchorMatches.map(([marker]) => marker);
  const corners = anchors.map(({ center }) => center);
  if (anchors.some(({ mirrored }) => mirrored)) return failed('mirrored-registration', evidence);
  if (!plausibleProjection(corners, image)) return failed('invalid-anchor-order', evidence);
  const pageToSource = fitProjective(profile.anchors, corners);
  const sourceToPage = pageToSource && invertProjective(pageToSource);
  if (!pageToSource || !sourceToPage) return failed('ill-conditioned-registration', evidence);
  if (!contentInFrame(profile, pageToSource, image)) return failed('clipped-content', evidence);

  const discriminator = markers.filter(({ id }) => id === profile.discriminator.id);
  if (discriminator.length !== 1 || discriminator[0].mirrored) return failed('layout-identity', evidence);
  const identityPosition = project(sourceToPage, discriminator[0].center.x, discriminator[0].center.y);
  if (!identityPosition || distance(identityPosition, profile.discriminator) > 2.4) return failed('layout-identity', evidence);

  const checks = profile.checks.map((landmark) => checkLandmark(image, pageToSource, landmark));
  if (checks.some(({ found }) => !found)) return failed('missing-check', { ...evidence, checks });
  if (checks.some(({ displacement }) => displacement > 1.5)) return failed('check-displacement', { ...evidence, checks });
  return { status: 'registered', reasons: [], pageToSource, sourceToPage, checks, ...evidence };
}
