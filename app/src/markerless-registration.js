import { cross, fitProjective, fitProjectiveSamples, invertProjective, project } from './projective.js';
import { grayAt, quantile, toGrayImage } from './omr-image.js';
import { observeOutlines, outlinePoseProposals } from './bubble-registration.js';

export const markerlessThresholdVersion = 'batch-geometry-v4';
const registrationStrategy = 'markerless';
const outlineAdjustments = [[1, 0], [.86, 0], [1.16, 0], [1, -.14], [1, .14]];
const minimumPageSideRatio = .22;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const failure = (reason, detail = {}) => ({
  status: 'retake', strategy: registrationStrategy, reasons: [reason], ...detail,
});
const pagePoints = ({ width, height }) => [
  { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height },
];

function convexHull(points) {
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const boundary = (values) => {
    const result = [];
    for (const value of values) {
      while (result.length >= 2 && cross(result.at(-2), result.at(-1), value) <= 0) result.pop();
      result.push(value);
    }
    return result.slice(0, -1);
  };
  return [...boundary(points), ...boundary(points.reverse())];
}

function quadrilateral(points) {
  const corners = convexHull(points);
  while (corners.length > 4) {
    let leastCorner = 0;
    let lowest = Infinity;
    for (let index = 0; index < corners.length; index++) {
      const a = corners[(index + corners.length - 1) % corners.length];
      const b = corners[index];
      const c = corners[(index + 1) % corners.length];
      const height = Math.abs(cross(a, b, c)) / distance(a, c);
      if (height < lowest) { lowest = height; leastCorner = index; }
    }
    corners.splice(leastCorner, 1);
  }
  if (corners.length !== 4) return null;
  const first = corners.reduce((best, point, index) =>
    point.x + point.y < corners[best].x + corners[best].y ? index : best, 0);
  return [...corners.slice(first), ...corners.slice(0, first)];
}

function plausible(corners, image, mirrored = false, virtual = false) {
  if (!Array.isArray(corners) || corners.length !== 4 || corners.some((point) => !point ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y) || (!virtual &&
      (point.x < -1 || point.y < -1 || point.x > image.width || point.y > image.height)))) return false;
  const lengths = corners.map((point, index) => distance(point, corners[(index + 1) % 4]));
  if (Math.min(...lengths) < Math.min(image.width, image.height) * minimumPageSideRatio ||
      Math.max(...lengths) / Math.min(...lengths) > 3.65) return false;
  const sign = mirrored ? -1 : 1;
  return corners.every((point, index) =>
    sign * cross(point, corners[(index + 1) % 4], corners[(index + 2) % 4]) >
      lengths[index] * lengths[(index + 1) % 4] * .18);
}

function nativeEdge(gray, start, end, coarseStep, minimumContrast) {
  const length = distance(start, end);
  const along = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const inward = { x: -along.y, y: along.x };
  const search = Math.max(5, 3 * coarseStep);
  const samples = [];
  for (let index = 3; index <= 37; index++) {
    const t = index / 40;
    const x = start.x + t * (end.x - start.x);
    const y = start.y + t * (end.y - start.y);
    const at = (offset) => grayAt(gray, x + offset * inward.x, y + offset * inward.y);
    let best = { contrast: minimumContrast, offset: 0 };
    for (let offset = -search; offset <= search; offset += .5) {
      const contrast = at(offset + 1.25) - at(offset - 1.25);
      if (contrast > best.contrast) best = { contrast, offset };
    }
    if (best.contrast > minimumContrast) samples.push({ t, ...best });
  }
  if (samples.length < 22) return null;

  // A median slope and intercept give a stable first fit in the presence of
  // dark print, shadows and background texture crossing the search band.
  const slopes = samples.flatMap((first, index) => samples.slice(index + 1)
    .filter((second) => second.t - first.t >= .16)
    .map((second) => (second.offset - first.offset) / (second.t - first.t)));
  const slope = quantile(slopes, .5);
  const offset = quantile(samples.map((sample) => sample.offset - sample.t * slope), .5);
  const inliers = samples.filter((sample) => Math.abs(sample.offset - offset - sample.t * slope) <= 1.3);
  if (inliers.length < 20 || inliers.at(-1).t - inliers[0].t < .60 ||
      Math.max(Math.abs(offset), Math.abs(offset + slope)) > search) return null;
  const point = (p, d) => ({ x: p.x + inward.x * d, y: p.y + inward.y * d });
  return [point(start, offset), point(end, offset + slope)];
}

function intersectEdges(first, second) {
  const [a, b] = first;
  const [c, d] = second;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * (d.y - c.y) - dy * (d.x - c.x);
  if (Math.abs(denominator) < 1e-8) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function refinePageEdges(gray, corners, coarseStep, minimumContrast = 24) {
  const edges = corners.map((point, index) => nativeEdge(gray, point, corners[(index + 1) % 4], coarseStep, minimumContrast));
  if (edges.some((edge) => !edge)) return corners;
  const refined = edges.map((edge, index) => intersectEdges(edges[(index + 3) % 4], edge));
  return plausible(refined, gray) && refined.every((point, index) => distance(point, corners[index]) <= 6 * coarseStep)
    ? refined : corners;
}

function pageCorners(gray, weakEdge = false) {
  const { width, height } = gray;
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 550));
  const w = Math.floor((width - 1) / step) + 1;
  const h = Math.floor((height - 1) / step) + 1;
  const values = new Uint8Array(w * h);
  const probes = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const value = gray.values[y * step * width + x * step];
      values[y * w + x] = value;
      if (x % 5 === 0 && y % 5 === 0) probes.push(value);
    }
  }
  const ink = quantile(probes, .10);
  const paper = quantile(probes, .84);
  if (paper < 110) return null;
  // A raster of the blank or a flat scanner image can fill the entire frame.
  const corners = [
    { x: 0, y: 0 }, { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 },
  ];
  const frameBackground = corners.map(({ x, y }) => gray.values[y * width + x]);
  const filledFrame = frameBackground.every((level) => level > paper - 28);
  const outside = quantile(frameBackground, .50);
  if (weakEdge && paper - outside < 5) return null;
  const cutoff = weakEdge ? (outside + paper) / 2 : Math.max(89, Math.min(paper - 15, (ink + paper) / 2));

  const queue = new Int32Array(values.length);
  const visited = new Uint8Array(values.length);
  let count;
  function enqueue(index) {
    if (visited[index] || values[index] < cutoff) return;
    visited[index] = 1;
    queue[count++] = index;
  }
  let widest = 0;
  let second = 0;
  let left = [];
  let right = [];
  for (let start = 0; start < values.length; start++) {
    if (visited[start] || values[start] < cutoff) continue;
    count = 0;
    enqueue(start);
    for (let head = 0; head < count; head++) {
      const index = queue[head];
      const x = index % w;
      const y = Math.floor(index / w);
      if (x > 0) enqueue(index - 1);
      if (x < w - 1) enqueue(index + 1);
      if (y > 0) enqueue(index - w);
      if (y < h - 1) enqueue(index + w);
    }
    if (count <= widest) { second = Math.max(second, count); continue; }
    second = widest;
    widest = count;
    left = new Int32Array(h).fill(w);
    right = new Int32Array(h).fill(-1);
    for (let index = 0; index < count; index++) {
      const x = queue[index] % w;
      const y = Math.floor(queue[index] / w);
      left[y] = Math.min(left[y], x);
      right[y] = Math.max(right[y], x);
    }
  }
  if (widest < values.length * .21 || second > widest * .62) return null;
  if (!weakEdge && filledFrame && widest >= values.length * .78) return corners;

  const outline = [];
  for (let y = 0; y < h; y++) {
    if (right[y] === -1) continue;
    outline.push({ x: left[y] * step, y: y * step }, { x: right[y] * step, y: y * step });
  }
  const proposed = quadrilateral(outline);
  return plausible(proposed, gray) ? refinePageEdges(gray, proposed, step, weakEdge ? 4 : 24) : null;
}

function preferredPageCorners(gray) {
  const measured = pageCorners(gray);
  if (measured?.[0].x !== 0 || measured[0].y !== 0 ||
      measured[2].x !== gray.width - 1 || measured[2].y !== gray.height - 1) return measured;
  // A pale desk can look like paper at the photo corners. Prefer a physical
  // boundary over the full-frame assumption only when all four edges agree.
  const faint = pageCorners(gray, true);
  const step = Math.max(1, Math.ceil(Math.max(gray.width, gray.height) / 550));
  return faint?.every((point, index) => nativeEdge(gray, point, faint[(index + 1) % 4], step, 4))
    ? faint : measured;
}

export function proposePageCorners(image) {
  return preferredPageCorners(toGrayImage(image));
}

export function proposeWeakPageCorners(image) {
  return pageCorners(toGrayImage(image), true);
}

export function pageTransform(page, corners) {
  return fitProjective(pagePoints(page), corners);
}

const subcellOffsets = [.17, .5, .83];

function sampleInk(gray, matrix, bounds, rows, columns, offsets, dx = 0, dy = 0) {
  const values = [];
  // Integrate ink across each descriptor cell. A single raster sample can
  // flip when a thin printed stroke moves between PDF renderers.
  const cellWidth = bounds.width / columns;
  const cellHeight = bounds.height / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      let total = 0;
      for (const oy of offsets) {
        for (const ox of offsets) {
          const point = project(matrix,
            bounds.x + dx + (column + ox) * cellWidth,
            bounds.y + dy + (row + oy) * cellHeight);
          const sample = point ? grayAt(gray, point.x, point.y) : NaN;
          if (!Number.isFinite(sample)) return null;
          total += sample;
        }
      }
      values.push(total / offsets.length ** 2);
    }
  }
  return values;
}

function quantizeInk(values, darkPercentile) {
  if (!values) return null;
  const bright = quantile(values, .82);
  const dark = quantile(values, darkPercentile);
  if (bright - dark < 32) return null;
  return values.map((value) => Math.round(15 * Math.max(0, Math.min(1, (bright - value) / (bright - dark)))));
}

function featureSamples(gray, matrix, bounds, dx = 0, dy = 0) {
  const ink = quantizeInk(sampleInk(gray, matrix, bounds, 12, 12, subcellOffsets, dx, dy), .12);
  if (!ink) return null;
  const samples = ink.map((value) => value / 15);
  const area = samples.filter((value) => value >= .5).length;
  return area >= 14 && area <= 120 ? samples : null;
}

// Compatibility helper for existing calibration tools. Registration does not use
// printed text or any pixels outside the selected response blocks for identity.
export function capturePrintedFeatures(image, pageToSource, regions) {
  const gray = toGrayImage(image);
  return regions.map((region, index) => {
    const { id, bounds = region } = region;
    const samples = featureSamples(gray, pageToSource, bounds);
    if (!samples) throw new TypeError(`Printed feature ${index + 1} needs contrasting, fixed printed ink and background.`);
    return { id: id ?? `feature-${index + 1}`, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, samples };
  });
}

const outlineDirections = Array.from({ length: 12 }, (_, index) => {
  const angle = index * Math.PI / 6;
  return [Math.cos(angle), Math.sin(angle)];
});

function outlineSupport(gray, transform, { x, y, radius }) {
  let sectors = 0;
  for (const [dx, dy] of outlineDirections) {
    function sample(scale) {
      const point = project(transform, x + dx * radius * scale, y + dy * radius * scale);
      return point ? grayAt(gray, point.x, point.y) : NaN;
    }
    if (sample(1.55) - Math.min(sample(.88), sample(1.02), sample(1.16)) >= 26) sectors++;
  }
  return sectors;
}

const choicesFor = (item) => item.kind === 'mc' ? item.choices : item.slots.flatMap(({ choices }) => choices);
const supportCount = (choices, support) => choices.filter((choice) => support.get(choice) >= 8).length;

function averagePoint(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function perpendicular(first, last) {
  const span = distance(first, last);
  if (span < 1) return null;
  return { x: (first.y - last.y) / span, y: (last.x - first.x) / span };
}

const position = (point, axis) => point.x * axis.x + point.y * axis.y;

function outlineCenter(gray, transform, choice) {
  const { x, y, radius } = choice;
  function at(dx, dy) {
    const point = project(transform, x + radius * dx, y + radius * dy);
    return point ? grayAt(gray, point.x, point.y) : NaN;
  }
  const background = quantile(outlineDirections.map(([dx, dy]) => at(dx * 1.63, dy * 1.63)).filter(Number.isFinite), .65);
  // An empty hole is a useful witness. Filled answers and ambiguous damage
  // keep using positional support and the existing mark/review path.
  if (!(background - at(0, 0) < 30)) return null;
  const ink = [];
  let total = 0;
  let sumX = 0;
  let sumY = 0;
  for (let row = -9; row <= 9; row++) {
    for (let column = -9; column <= 9; column++) {
      const dx = column / 6;
      const dy = row / 6;
      if (Math.hypot(dx, dy) > 1.52) continue;
      const contrast = background - at(dx, dy);
      const weight = Math.max(0, Math.min(1, (contrast - 26) / 80));
      if (!Number.isFinite(weight) || weight === 0) continue;
      ink.push({ dx, dy, weight });
      total += weight;
      sumX += dx * weight;
      sumY += dy * weight;
    }
  }
  if (total < 12 || total > 114) return null;
  const dx = sumX / total;
  const dy = sumY / total;
  const meanRadius = ink.reduce((sum, cell) => sum + Math.hypot(cell.dx - dx, cell.dy - dy) * cell.weight, 0) / total;
  if (meanRadius < .74 || meanRadius > 1.25) return null;
  const deviation = ink.reduce((sum, cell) =>
    sum + Math.abs(Math.hypot(cell.dx - dx, cell.dy - dy) - meanRadius) * cell.weight, 0) / total;
  if (deviation > .22) return null;
  const center = { x: x + dx * radius, y: y + dy * radius, radius };
  return outlineSupport(gray, transform, center) >= 9 ? center : null;
}

function recurringLanes(band) {
  if (!band) return [];
  const axis = { x: -band.axis.y, y: band.axis.x };
  const entries = band.groups.flatMap(({ choices }, row) =>
    choices.map((choice) => ({ choice, row, at: position(choice, axis) }))).sort((a, b) => a.at - b.at);
  const lanes = [];
  for (const { choice, row, at } of entries) {
    const latest = lanes.at(-1);
    if (latest && Math.abs(at - latest.at) <= choice.radius * .90 && !latest.rows.has(row)) {
      latest.choices.push(choice);
      latest.rows.add(row);
      latest.at = position(averagePoint(latest.choices), axis);
    } else lanes.push({ at, rows: new Set([row]), choices: [choice] });
  }
  return lanes;
}

function numericalBands(item) {
  const first = averagePoint(item.slots[0].choices);
  const last = averagePoint(item.slots.at(-1).choices);
  const axis = perpendicular(first, last);
  if (!axis) return null;
  const ordered = item.slots.flatMap(({ choices }, slot) =>
    choices.map((choice) => ({ choice, slot, at: position(choice, axis) }))).sort((a, b) => a.at - b.at);
  const grouped = [];
  for (const { choice, slot, at } of ordered) {
    const previous = grouped.at(-1);
    if (previous && Math.abs(at - previous.at) <= choice.radius * .9 && !previous.slots.has(slot)) {
      previous.slots.add(slot);
      previous.choices.push(choice);
      previous.at = position(averagePoint(previous.choices), axis);
    } else grouped.push({ at, slots: new Set([slot]), choices: [choice] });
  }
  return { axis, groups: grouped };
}

function multipleChoiceBands(items) {
  const widest = [...items].sort((a, b) => b.choices.length - a.choices.length)[0].choices;
  let endpoints = [widest[0], widest[1]];
  for (const first of widest) {
    for (const last of widest) {
      if (distance(first, last) > distance(...endpoints)) endpoints = [first, last];
    }
  }
  const axis = perpendicular(...endpoints);
  if (!axis) return null;
  const groups = items.map(({ choices }) => ({ choices, at: position(averagePoint(choices), axis) }));
  groups.sort((a, b) => a.at - b.at);
  return { axis, groups };
}

function extraRows(gray, transform, band, bounds, expectedChoices, neighbors, page) {
  if (!band) return 0;
  const { axis, groups } = band;
  // Use only repeated, enrolled rows to estimate pitch. A decimal in just one
  // position does not establish a row or a guard region.
  const rows = groups.filter(({ choices }) => choices.length >= 2);
  const spacing = rows.slice(1).map((row, index) => row.at - rows[index].at);
  const pitch = quantile(spacing, .5);
  if (!Number.isFinite(pitch) || pitch <= .5) return 0;
  const proposals = [
    { row: rows[0], offsets: [-spacing[0], -.80 * spacing[0], -1.20 * spacing[0]], extension: true },
    { row: rows.at(-1), offsets: [spacing.at(-1), .80 * spacing.at(-1), 1.20 * spacing.at(-1)], extension: true },
  ];
  for (const [index, gap] of spacing.entries()) {
    proposals.push({ row: rows[index], offsets: [gap / 2] });
    if (gap >= pitch * 1.75) proposals.push({ row: rows[index], offsets: [pitch] });
  }
  return proposals.filter(({ row, offsets, extension }) => offsets.some((delta) => {
    const shifted = row.choices.map(({ x, y, radius }) => ({ x: x + delta * axis.x, y: y + delta * axis.y, radius }));
    const eligible = shifted.filter(({ x, y, radius }) => {
      const margin = 1.6 * radius;
      const frame = extension ? { x: 0, y: 0, width: page.width, height: page.height } : bounds;
      const overlapsNeighbor = neighbors.some((region) => x + margin > region.x && x - margin < region.x + region.width &&
        y + margin > region.y && y - margin < region.y + region.height);
      return !overlapsNeighbor && x - margin >= frame.x && x + margin <= frame.x + frame.width &&
        y - margin >= frame.y && y + margin <= frame.y + frame.height &&
        expectedChoices.every((other) => Math.hypot(x - other.x, y - other.y) > 1.15 * (radius + other.radius));
    });
    const matching = eligible.filter((choice) => outlineSupport(gray, transform, choice) >= (extension ? 10 : 8)).length;
    return matching >= Math.max(2, Math.ceil(row.choices.length * .70));
  })).length;
}

function spacingConflicts(groups, centers) {
  const differences = groups.flatMap(({ choices }) => {
    if (choices.length < 2) return [];
    const axis = perpendicular(choices[0], choices.at(-1));
    if (!axis) return [];
    const along = { x: -axis.y, y: axis.x };
    const ordered = [...choices].sort((a, b) => position(a, along) - position(b, along));
    return ordered.slice(1).flatMap((b, index) => {
      const a = ordered[index];
      if (!centers.get(a) || !centers.get(b)) return [];
      const radius = (a.radius + b.radius) / 2;
      return [Math.abs(distance(a, b) - distance(centers.get(a), centers.get(b))) / radius];
    });
  });
  return differences.filter((difference) => difference >= .48).length >= 2 || differences.some((difference) => difference >= .80);
}

function blockGeometry(gray, profile, block, transform) {
  const choices = block.items.flatMap(choicesFor);
  const support = new Map(choices.map((choice) => [choice, outlineSupport(gray, transform, choice)]));
  const supported = supportCount(choices, support);
  const neighbors = profile.components.filter((component) => component !== block).map(({ bounds }) => bounds);
  let missingRows = 0;
  let missingSlots = 0;
  let missingColumns = 0;
  let excess = 0;
  const spacingGroups = [];
  if (block.kind === 'mc') {
    const band = multipleChoiceBands(block.items);
    missingRows = block.items.filter(({ choices: row }) => supportCount(row, support) < Math.ceil(row.length / 2)).length;
    missingColumns = recurringLanes(band).filter(({ choices: lane }) => lane.length >= 2 &&
      supportCount(lane, support) < Math.ceil(lane.length / 2)).length;
    excess = extraRows(gray, transform, band, block.bounds, choices, neighbors, profile.page);
    spacingGroups.push(...block.items);
  } else {
    for (const item of block.items) {
      missingSlots += item.slots.filter(({ choices: slot }) => supportCount(slot, support) < Math.ceil(slot.length * .65)).length;
      const band = numericalBands(item);
      if (band) {
        missingRows += band.groups.filter(({ choices: row }) => row.length >= 2 &&
          supportCount(row, support) < Math.ceil(row.length / 2)).length;
      }
      const bounds = block.items.length === 1 ? block.bounds : item.bounds;
      const siblingBounds = block.items.filter((other) => other !== item).map(({ bounds: region }) => region);
      excess += extraRows(gray, transform, band, bounds, choices, [...neighbors, ...siblingBounds], profile.page);
      spacingGroups.push(...item.slots, ...(band?.groups ?? []));
    }
  }
  const basic = supported >= Math.ceil(choices.length * .70) && !missingRows && !missingSlots && !missingColumns && !excess;
  const centers = basic ? new Map(choices.map((choice) => [choice, outlineCenter(gray, transform, choice)])) : new Map();
  const spacingMismatch = basic && spacingConflicts(spacingGroups, centers);
  const relocatedChoices = basic ? choices.filter((choice) => support.get(choice) < 8 && centers.get(choice) &&
    distance(choice, centers.get(choice)) >= .65 * choice.radius).length : 0;
  return {
    id: block.id, checked: choices.length, supported, missingRows, missingSlots, missingColumns, extraRows: excess,
    spacingMismatch, relocatedChoices, verified: basic && !spacingMismatch && !relocatedChoices,
  };
}

function containsComponents(gray, profile, transform) {
  return profile.components.every(({ bounds }) => [
    [bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
  ].every(([x, y]) => {
    const point = project(transform, x, y);
    return point && Number.isFinite(grayAt(gray, point.x, point.y));
  }));
}

function inspectPose(gray, profile, pageToSource, mirrored, corners) {
  const sourceToPage = pageToSource && invertProjective(pageToSource);
  if (!sourceToPage) return null;
  const blocks = profile.components.map((block) => blockGeometry(gray, profile, block, pageToSource));
  const total = (key) => blocks.reduce((sum, block) => sum + block[key], 0);
  const checked = total('checked');
  const supported = total('supported');
  const inFrame = containsComponents(gray, profile, pageToSource);
  const geometry = { checked, supported, verified: inFrame && blocks.every(({ verified }) => verified), blocks };
  return {
    pageToSource, sourceToPage, inFrame, geometry, mirrored, corners,
    score: supported / checked,
  };
}

function rotations(corners) {
  return corners.map((_, index) => [...corners.slice(index), ...corners.slice(0, index)]);
}

function measureHypotheses(gray, profile, measured, manual, proposeTransform) {
  const reflected = [measured[0], measured[3], measured[2], measured[1]];
  const direct = manual ? [measured] : rotations(measured);
  const mirrorVariants = manual ? [reflected] : rotations(reflected);
  return [
    ...direct.map((quad) => proposeTransform(gray, profile, quad, false)),
    ...mirrorVariants.map((quad) => proposeTransform(gray, profile, quad, true)),
  ].filter(Boolean).sort((a, b) => b.score - a.score);
}

function edgePose(gray, profile, corners, mirrored) {
  return inspectPose(gray, profile, pageTransform(profile.page, corners), mirrored, corners);
}

function bubblePose(gray, profile, corners, mirrored, provisional = false) {
  const seed = pageTransform(profile.page, corners);
  if (!seed) return null;
  const observed = [];
  for (const block of profile.components) {
    const choices = block.items.flatMap(choicesFor);
    const interval = Math.max(1, Math.floor(choices.length / 24));
    for (const [index, choice] of choices.entries()) {
      if (index % interval !== 0) continue;
      const center = outlineCenter(gray, seed, choice);
      if (!center || distance(center, choice) > .62 * choice.radius) continue;
      const actual = project(seed, center.x, center.y);
      if (actual) observed.push({ choice, actual });
    }
  }
  const sources = observed.map(({ choice }) => choice);
  if (sources.length < 12 || Math.max(...sources.map(({ x }) => x)) - Math.min(...sources.map(({ x }) => x)) < profile.page.width * .27 ||
      Math.max(...sources.map(({ y }) => y)) - Math.min(...sources.map(({ y }) => y)) < profile.page.height * .27) return null;
  const fit = observed.filter((_, i) => i % 3 !== 0);
  const hold = observed.filter((_, i) => i % 3 === 0);
  const transform = fitProjectiveSamples(fit.map(({ choice }) => choice), fit.map(({ actual }) => actual));
  const inverse = transform && invertProjective(transform);
  if (!inverse) return null;
  const residual = hold.map(({ choice, actual }) => {
    const point = project(inverse, actual.x, actual.y);
    return point ? distance(point, choice) / choice.radius : Infinity;
  });
  if (quantile(residual, .80) > .29 || Math.max(...residual) > .72) return null;
  const adjusted = pagePoints(profile.page).map(({ x, y }) => project(transform, x, y));
  if (!plausible(adjusted, gray, mirrored, provisional) ||
      adjusted.some((point, index) => distance(point, corners[index]) > Math.min(gray.width, gray.height) * .024)) return null;
  const result = inspectPose(gray, profile, transform, mirrored, adjusted);
  const coverage = (points) => {
    const axes = (axis) => points.map(({ choice }) => choice[axis]);
    return { width: (Math.max(...axes('x')) - Math.min(...axes('x'))) / profile.page.width,
      height: (Math.max(...axes('y')) - Math.min(...axes('y'))) / profile.page.height };
  };
  return result && { ...result, witnesses: { fit: fit.length, heldOut: hold.length,
    maxHeldOutErrorInRadii: Math.max(...residual), fitCoverage: coverage(fit), heldOutCoverage: coverage(hold) } };
}

export function checkProvisionalBlankPose(gray, profile, corners) {
  const pose = bubblePose(gray, profile, corners, false, true);
  if (!pose || !stableOutlineProjection(profile.page, pose.pageToSource, pose.corners, gray, false, pose.witnesses)) {
    return { discarded: { reason: 'insufficient-held-out-outline-fit' } };
  }
  const fit = { transform: pose.pageToSource, corners: pose.corners, witnesses: pose.witnesses, blocks: pose.geometry.blocks };
  if (!pose.geometry.verified) return { discarded: { ...fit, reason: pose.inFrame ? 'response-geometry' : 'clipped-content' } };
  return fit;
}

function photoBounds(points) {
  return {
    left: Math.min(...points.map(({ x }) => x)), right: Math.max(...points.map(({ x }) => x)),
    top: Math.min(...points.map(({ y }) => y)), bottom: Math.max(...points.map(({ y }) => y)),
  };
}

function responseBounds(profile, transform) {
  return photoBounds(profile.components.flatMap(({ bounds: { x, y, width, height } }) =>
    [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
      .map(([u, v]) => project(transform, u, v))));
}

function separateResponses(first, second) {
  return first.right < second.left || second.right < first.left ||
    first.bottom < second.top || second.bottom < first.top;
}

function cropGray(gray, { x, y, width, height }) {
  const values = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const start = (y + row) * gray.width + x;
    values.set(gray.values.subarray(start, start + width), row * width);
  }
  return { values, width, height };
}

function additionalSheet(gray, profile, best, candidates) {
  const response = responseBounds(profile, best.pageToSource);
  if (candidates.some((candidate) => candidate !== best &&
      separateResponses(response, responseBounds(profile, candidate.pageToSource)))) return true;

  const paper = photoBounds(best.corners);
  if (paper.left <= 1 && paper.top <= 1 && paper.right >= gray.width - 2 && paper.bottom >= gray.height - 2) return false;
  // Look beyond the first response field. A crop may include the first
  // sheet's margins, but matching those cannot verify a second grid.
  const rectangles = [
    { x: 0, y: 0, width: Math.floor(response.left), height: gray.height },
    { x: Math.ceil(response.right), y: 0, width: gray.width - Math.ceil(response.right), height: gray.height },
    { x: 0, y: 0, width: gray.width, height: Math.floor(response.top) },
    { x: 0, y: Math.ceil(response.bottom), width: gray.width, height: gray.height - Math.ceil(response.bottom) },
  ];
  const minimum = Math.min(gray.width, gray.height) * minimumPageSideRatio;
  for (const rect of rectangles) {
    if (Math.min(rect.width, rect.height) < minimum) continue;
    const crop = cropGray(gray, rect);
    function verifies(transform, mirrored, checked = false) {
      const local = pagePoints(profile.page).map(({ x, y }) => project(transform, x, y));
      if (local.some((point) => !point)) return false;
      const corners = local.map(({ x, y }) => ({ x: x + rect.x, y: y + rect.y }));
      if (!plausible(corners, gray, mirrored)) return false;
      return checked || inspectPose(crop, profile, transform, mirrored, local)?.geometry.verified;
    }
    for (const weak of [false, true]) {
      const found = pageCorners(crop, weak);
      if (found && measureHypotheses(crop, profile, found, false, edgePose).some(({ pageToSource, mirrored, geometry }) =>
        geometry.verified && verifies(pageToSource, mirrored, true))) return true;
    }
    const outlines = observeOutlines(crop, profile.page);
    if (!outlines) continue;
    for (const [ratio, shear] of outlineAdjustments) {
      if (outlinePoseProposals(crop, profile, ratio, shear, outlines).some(({ transform, mirrored }) => verifies(transform, mirrored))) return true;
    }
  }
  return false;
}

function stableOutlineProjection(page, transform, corners, gray, mirrored, witnesses) {
  if (!plausible(corners, gray, mirrored, true) ||
      [witnesses.fitCoverage, witnesses.heldOutCoverage].some(({ width, height }) => width < .27 || height < .27)) return false;
  // A projective pole anywhere in the template means the visible fit cannot
  // be extrapolated safely to the complete page.
  const denominators = pagePoints(page).map(({ x, y }) => transform[6] * x + transform[7] * y + transform[8]);
  return denominators.every((denominator) => Math.abs(denominator) > 1e-8 && Math.sign(denominator) === Math.sign(denominators[0]));
}

function stages(corners, path, pose, orientation, responseGeometry, geometry, fit) {
  return {
    pagePose: { status: pose, path, corners: corners ?? [], ...fit },
    orientation: { status: orientation },
    responseGeometry: { status: responseGeometry, blocks: geometry?.blocks ?? [] },
  };
}

export function registerMarkerless(image, profile, { corners, batch } = {}) {
  if (batch?.profileId !== profile.id || batch?.revision !== profile.revision) {
    return failure('batch-not-confirmed', { diagnostics: stages(null, null, 'unchecked', 'unchecked', 'unchecked') });
  }
  const gray = toGrayImage(image);
  const measured = corners ?? preferredPageCorners(gray);
  let path = corners ? 'manual-corners' : 'page-boundary';
  let discardedOutline;
  if (corners && !plausible(corners, gray)) {
    const mirrored = plausible(corners, gray, true);
    return failure(mirrored ? 'mirrored-registration' : 'page-corners', {
      canSetCorners: true, diagnostics: stages(corners, path, 'failed', mirrored ? 'mirrored' : 'unchecked', 'unchecked'),
    });
  }
  let candidates = measured ? measureHypotheses(gray, profile, measured, Boolean(corners), edgePose) : [];
  let eligible = candidates.filter(({ geometry }) => geometry.verified);
  if (!eligible.length && !corners) {
    const faint = pageCorners(gray, true);
    const distinct = faint && (!measured || faint.some((point, index) => distance(point, measured[index]) > 3));
    if (distinct) {
      const alternative = measureHypotheses(gray, profile, faint, false, bubblePose);
      const verified = alternative.filter(({ geometry }) => geometry.verified);
      if (verified.length) {
        path = 'bubble-fit';
        candidates = alternative;
        eligible = verified;
      }
    }
  }
  if (!eligible.length && !corners && (!measured || measured.filter((point, index) =>
    nativeEdge(gray, point, measured[(index + 1) % 4], 5, 9)).length < 3)) {
    const alternative = [];
    const outlines = observeOutlines(gray, profile.page);
    for (const [ratio, shear] of outlines ? outlineAdjustments : []) {
      for (const { transform, mirrored, witnesses } of outlinePoseProposals(gray, profile, ratio, shear, outlines)) {
        const adjusted = pagePoints(profile.page).map(({ x, y }) => project(transform, x, y));
        const virtual = !plausible(adjusted, gray, mirrored);
        const fit = { transform, corners: adjusted, witnesses, virtual };
        if (virtual && !stableOutlineProjection(profile.page, transform, adjusted, gray, mirrored, witnesses)) {
          discardedOutline ??= { ...fit, reason: 'unreliable-virtual-pose', score: -1 };
          continue;
        }
        const samePose = (entry, candidate) => entry.mirrored === candidate.mirrored &&
          entry.corners.every((point, index) => distance(point, candidate.corners[index]) < 5);
        if (alternative.some((entry) => entry.fit && samePose(entry, { mirrored, corners: adjusted }))) continue;
        const pose = inspectPose(gray, profile, transform, mirrored, adjusted);
        if (!pose?.geometry.verified) {
          if (!discardedOutline || (pose?.score ?? -1) > discardedOutline.score) {
            discardedOutline = { ...fit, reason: pose?.inFrame ? 'response-geometry' : 'clipped-content',
              blocks: pose?.geometry.blocks ?? [], score: pose?.score ?? -1 };
          }
          continue;
        }
        const existing = alternative.findIndex((entry) => samePose(entry, pose));
        if (existing < 0) alternative.push({ ...pose, fit, virtual });
        else alternative[existing] = { ...pose, fit, virtual };
        const ordered = mirrored ? [adjusted[0], adjusted[3], adjusted[2], adjusted[1]] : adjusted;
        for (const hypothesis of measureHypotheses(gray, profile, ordered, false, edgePose)) {
          if (hypothesis.geometry.verified && !alternative.some((entry) =>
            samePose(entry, hypothesis))) alternative.push({ ...hypothesis, virtual });
        }
      }
      if (alternative.length) break;
    }
    if (alternative.length) {
      candidates = alternative.sort((a, b) => b.score - a.score || Number(Boolean(b.fit)) - Number(Boolean(a.fit)));
      path = candidates[0].virtual ? 'virtual-corners' : 'bubble-fit';
      eligible = candidates;
    }
  }
  const best = eligible[0];
  if (!best) {
    const first = candidates[0];
    const outlineFailure = { discarded: discardedOutline ?? { reason: 'no-reliable-outline-fit' } };
    if (discardedOutline?.virtual && discardedOutline.blocks && discardedOutline.score > (first?.score ?? 0)) {
      return failure(discardedOutline.reason, { canSetCorners: true,
        diagnostics: stages(discardedOutline.corners, 'virtual-corners', 'review', 'unchecked', 'failed',
          { blocks: discardedOutline.blocks }, outlineFailure),
      });
    }
    if (!first) return failure('page-corners', {
      canSetCorners: true, diagnostics: stages(measured, path, 'failed', 'unchecked', 'unchecked', undefined, outlineFailure),
    });
    return failure(first?.inFrame ? 'response-geometry' : 'clipped-content', {
      canSetCorners: true, geometry: first?.geometry,
      diagnostics: stages(measured, path, first.score >= .55 ? 'verified' : 'review', 'unchecked', 'failed', first.geometry, outlineFailure),
    });
  }
  const competitor = eligible[1];
  const tied = competitor && best.score - competitor.score < .075;
  const evidence = { geometry: best.geometry, canSetCorners: true, orientationMargin: competitor ? best.score - competitor.score : null };
  const poseStatus = path === 'bubble-fit' || path === 'virtual-corners' ? 'recovered' : 'verified';
  const fitDetail = best.fit ? { ...best.fit, discarded: discardedOutline } : undefined;
  if (additionalSheet(gray, profile, best, eligible)) return failure('multiple-sheets', {
    geometry: best.geometry, canSetCorners: false, diagnostics: stages(null, path, 'review', 'unchecked', 'verified', best.geometry),
  });
  if ((tied || (path === 'virtual-corners' && !best.fit)) && !corners) return failure('ambiguous-orientation', {
    ...evidence, diagnostics: stages(best.corners, path, poseStatus, 'ambiguous', 'verified', best.geometry, fitDetail),
  });
  if (best.mirrored && !(tied && corners && !competitor.mirrored)) return failure('mirrored-registration', {
    ...evidence, diagnostics: stages(best.corners, path, poseStatus, 'mirrored', 'verified', best.geometry, fitDetail),
  });
  // Manually ordered corners resolve orientation only. The direct hypothesis
  // must have passed exactly the same complete response-geometry checks.
  const aligned = best.mirrored ? competitor : best;
  return {
    status: 'registered', strategy: registrationStrategy, reasons: [],
    pageToSource: aligned.pageToSource, sourceToPage: aligned.sourceToPage,
    authorization: 'teacher-confirmed-batch', orientationMargin: evidence.orientationMargin,
    cornerPath: path, corners: aligned.corners, geometry: aligned.geometry,
    diagnostics: stages(aligned.corners, path, poseStatus, 'verified', 'verified', aligned.geometry, fitDetail),
  };
}
