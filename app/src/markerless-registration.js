import { cross, fitProjective, invertProjective, project } from './projective.js';
import { grayAt, quantile, toGrayImage } from './omr-image.js';

export const markerlessThresholdVersion = 'printed-features-v3';
const registrationStrategy = 'markerless';
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

function plausible(corners, image, mirrored = false) {
  if (!Array.isArray(corners) || corners.length !== 4 || corners.some((point) => !point ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < -1 || point.y < -1 ||
      point.x > image.width || point.y > image.height)) return false;
  const lengths = corners.map((point, index) => distance(point, corners[(index + 1) % 4]));
  if (Math.min(...lengths) < Math.min(image.width, image.height) * .22 ||
      Math.max(...lengths) / Math.min(...lengths) > 3.65) return false;
  const sign = mirrored ? -1 : 1;
  return corners.every((point, index) =>
    sign * cross(point, corners[(index + 1) % 4], corners[(index + 2) % 4]) >
      lengths[index] * lengths[(index + 1) % 4] * .18);
}

function nativeEdge(gray, start, end, coarseStep) {
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
    let best = { contrast: 24, offset: 0 };
    for (let offset = -search; offset <= search; offset += .5) {
      const contrast = at(offset + 1.25) - at(offset - 1.25);
      if (contrast > best.contrast) best = { contrast, offset };
    }
    if (best.contrast > 24) samples.push({ t, ...best });
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

function refinePageEdges(gray, corners, coarseStep) {
  const edges = corners.map((point, index) => nativeEdge(gray, point, corners[(index + 1) % 4], coarseStep));
  if (edges.some((edge) => !edge)) return corners;
  const refined = edges.map((edge, index) => intersectEdges(edges[(index + 3) % 4], edge));
  return plausible(refined, gray) && refined.every((point, index) => distance(point, corners[index]) <= 6 * coarseStep)
    ? refined : corners;
}

function pageCorners(gray) {
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
  const cutoff = Math.max(89, Math.min(paper - 15, (ink + paper) / 2));

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
  if (filledFrame && widest >= values.length * .78) return corners;

  const outline = [];
  for (let y = 0; y < h; y++) {
    if (right[y] === -1) continue;
    outline.push({ x: left[y] * step, y: y * step }, { x: right[y] * step, y: y * step });
  }
  const proposed = quadrilateral(outline);
  return plausible(proposed, gray) ? refinePageEdges(gray, proposed, step) : null;
}

export function proposePageCorners(image) {
  return pageCorners(toGrayImage(image));
}

export function pageTransform(page, corners) {
  return fitProjective(pagePoints(page), corners);
}

const subcellOffsets = [.17, .5, .83];

function featureSamples(gray, matrix, bounds, dx = 0, dy = 0) {
  const values = [];
  // Integrate ink across each descriptor cell. A single raster sample can
  // flip when a thin printed stroke moves between PDF renderers.
  const cellWidth = bounds.width / 12;
  const cellHeight = bounds.height / 12;
  for (let row = 0; row < 12; row++) {
    for (let column = 0; column < 12; column++) {
      let total = 0;
      for (const oy of subcellOffsets) {
        for (const ox of subcellOffsets) {
          const point = project(matrix,
            bounds.x + dx + (column + ox) * cellWidth,
            bounds.y + dy + (row + oy) * cellHeight);
          const sample = point ? grayAt(gray, point.x, point.y) : NaN;
          if (!Number.isFinite(sample)) return null;
          total += sample;
        }
      }
      values.push(total / 9);
    }
  }
  const bright = quantile(values, .82);
  const dark = quantile(values, .12);
  if (bright - dark < 32) return null;
  const samples = values.map((value) => Math.round(15 * Math.max(0, Math.min(1, (bright - value) / (bright - dark)))) / 15);
  const area = samples.filter((value) => value >= .5).length;
  return area >= 14 && area <= 120 ? samples : null;
}

export function capturePrintedFeatures(image, pageToSource, regions) {
  const gray = toGrayImage(image);
  return regions.map((region, index) => {
    const { id, bounds = region } = region;
    const samples = featureSamples(gray, pageToSource, bounds);
    if (!samples) throw new TypeError(`Printed feature ${index + 1} needs contrasting, fixed printed ink and background.`);
    return { id: id ?? `feature-${index + 1}`, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, samples };
  });
}

function similarity(reference, candidate) {
  if (!candidate) return 0;
  let overlap = 0;
  let energy = 0;
  for (let i = 0; i < reference.length; i++) {
    overlap += reference[i] * candidate[i];
    energy += reference[i] ** 2 + candidate[i] ** 2;
  }
  return 2 * overlap / energy;
}

function locateFeature(gray, matrix, feature, radius = 12) {
  const { bounds, samples } = feature;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  let best = { score: -1, x: 0, y: 0 };
  const tested = [];
  function check(x, y) {
    const score = similarity(samples, featureSamples(gray, matrix, bounds, x, y));
    const rounded = Math.hypot(x, y);
    tested.push({ score, x, y });
    if (score - rounded * .001 > best.score - Math.hypot(best.x, best.y) * .001) best = { score, x, y };
  }
  for (let y = -radius; y <= radius; y += 4) {
    for (let x = -radius; x <= radius; x += 4) check(x, y);
  }
  const rough = best;
  for (let y = rough.y - 3; y <= rough.y + 3; y++) {
    for (let x = rough.x - 3; x <= rough.x + 3; x++) check(x, y);
  }
  const rival = Math.max(0, ...tested.filter((candidate) => distance(best, candidate) >= 6).map(({ score }) => score));
  const observed = project(matrix, center.x + best.x, center.y + best.y);
  return {
    id: feature.id, center, observed, score: best.score, margin: best.score - rival,
    displacement: Math.hypot(best.x, best.y),
    found: Boolean(observed) && best.score >= .80 && (best.score >= .88 || best.score - rival >= .045),
  };
}

function identify(gray, profile, matrix) {
  const identityCheck = locateFeature(gray, matrix, profile.features[0]);
  if (identityCheck.score < .80) {
    return { score: identityCheck.score, checks: [identityCheck], usable: [], verified: false };
  }
  const checks = [identityCheck, ...profile.features.slice(1).map((feature) => locateFeature(gray, matrix, feature))];
  const usable = checks.filter((check) => check.found);
  const score = checks.reduce((sum, item) => sum + item.score, 0) / checks.length;
  const identity = checks[0]?.score >= .87 && checks[0]?.found;
  return { score, checks, usable, verified: identity && usable.length >= Math.max(4, Math.ceil(checks.length * .8)) && score >= .83 };
}

const outlineDirections = Array.from({ length: 12 }, (_, index) => {
  const angle = index * Math.PI / 6;
  return [Math.cos(angle), Math.sin(angle)];
});

function printedGeometry(gray, profile, matrix) {
  const bubbles = profile.components.flatMap(({ items }) => items.flatMap((item) =>
    item.kind === 'mc' ? item.choices : item.slots.flatMap(({ choices }) => choices)));
  const partitions = new Map();
  for (const bubble of bubbles) {
    const key = Math.floor(4 * bubble.x / profile.page.width) + 4 * Math.floor(4 * bubble.y / profile.page.height);
    const group = partitions.get(key) ?? [];
    group.push(bubble);
    partitions.set(key, group);
  }
  const checks = [...partitions.values()].flatMap((group) =>
    [group[0], group[Math.floor(group.length / 2)], group.at(-1)].filter((choice, index, choices) =>
      choices.indexOf(choice) === index));
  const supported = checks.filter(({ x, y, radius }) => {
    let sectors = 0;
    for (const [dx, dy] of outlineDirections) {
      function sample(multiplier) {
        const p = project(matrix, x + dx * radius * multiplier, y + dy * radius * multiplier);
        return p ? grayAt(gray, p.x, p.y) : NaN;
      }
      if (sample(1.55) - Math.min(sample(.91), sample(1.08)) >= 26) sectors++;
    }
    return sectors >= 9;
  });
  return {
    checked: checks.length,
    supported: supported.length,
    verified: checks.length > 0 && supported.length >= Math.ceil(checks.length * .7),
  };
}

function robustRefinement(gray, profile, candidate, result) {
  const notes = result.usable;
  const originalGeometry = printedGeometry(gray, profile, candidate);
  // Paper edges supply one fit. Printed outlines verify that fit without
  // mistaking a renderer-specific shift in a text glyph for page movement.
  if (originalGeometry.verified) {
    return { matrix: candidate, checks: result.checks, geometry: originalGeometry };
  }
  // Topology of the blank is fixed. Hold at least one printed feature out of the adjusted fit.
  if (notes.length < 5) return null;
  let fit;
  let bestSpan = 0;
  for (let first = 0; first < notes.length - 3; first++) {
    for (let second = first + 1; second < notes.length - 2; second++) {
      for (let third = second + 1; third < notes.length - 1; third++) {
        for (let fourth = third + 1; fourth < notes.length; fourth++) {
          const used = [notes[first], notes[second], notes[third], notes[fourth]];
          const ordered = [...used].sort((a, b) => a.center.y - b.center.y);
          const span = Math.abs(cross(ordered[0].center, ordered[1].center, ordered[2].center)) +
            Math.abs(cross(ordered[3].center, ordered[1].center, ordered[2].center));
          if (span <= bestSpan) continue;
          const model = fitProjective(used.map((item) => item.center), used.map((item) => item.observed));
          if (!model) continue;
          bestSpan = span;
          fit = { model, ids: new Set(used.map(({ id }) => id)) };
        }
      }
    }
  }
  if (!fit || bestSpan < profile.page.width * profile.page.height * .15) return null;
  const inverse = invertProjective(fit.model);
  if (!inverse) return null;
  const checks = result.checks.map((check) => {
    if (!check.observed) return check;
    const corrected = project(inverse, check.observed.x, check.observed.y);
    return { ...check, displacement: corrected ? distance(check.center, corrected) : Infinity, fitPoint: fit.ids.has(check.id) };
  });
  const validation = checks.filter(({ found, fitPoint }) => found && !fitPoint);
  if (!validation.length || validation.some(({ displacement }) => displacement > 1.55)) return null;
  const closed = identify(gray, profile, fit.model);
  const geometry = printedGeometry(gray, profile, fit.model);
  return closed.verified && geometry.verified ? { matrix: fit.model, checks, geometry } : null;
}

function rotations(corners, mirrored) {
  const base = mirrored ? [corners[0], corners[3], corners[2], corners[1]] : corners;
  return base.map((_, index) => [...base.slice(index), ...base.slice(0, index)]);
}

function containsComponents(gray, profile, matrix) {
  return profile.components.every(({ bounds }) => [
    [bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x + bounds.width, bounds.y + bounds.height],
    [bounds.x, bounds.y + bounds.height],
  ].every(([x, y]) => {
    const point = project(matrix, x, y);
    return point && Number.isFinite(grayAt(gray, point.x, point.y));
  }));
}

function bestOrientation(gray, profile, corners, allowRotation) {
  const possible = allowRotation ? rotations(corners, false) : [corners];
  const reflected = allowRotation ? rotations(corners, true) : [];
  const candidates = [...possible, ...reflected].flatMap((quad, index) => {
    const matrix = pageTransform(profile.page, quad);
    if (!matrix) return [];
    return [{ matrix, mirrored: index >= possible.length, ...identify(gray, profile, matrix) }];
  }).sort((a, b) => b.score - a.score);
  return { first: candidates[0], second: candidates[1] };
}

export function registerMarkerless(image, profile, options = {}) {
  const { corners, confirmedIdentity = false, alternatives = [] } = options;
  const gray = toGrayImage(image);
  const measured = corners ?? pageCorners(gray);
  if (!measured) return failure('page-corners', { canSetCorners: true });
  if (!plausible(measured, gray)) {
    return failure(plausible(measured, gray, true) ? 'mirrored-registration' : 'page-corners', { canSetCorners: true });
  }
  const cornerPath = corners ? 'manual-corners' : 'page-boundary';

  if (profile.features.length === 0) {
    if (!profile.allowManualIdentity || !corners) return failure('manual-geometry-required', { canSetCorners: true });
    if (!confirmedIdentity) return failure('identity-confirmation', { canConfirmIdentity: true, canSetCorners: true });
    const pageToSource = pageTransform(profile.page, corners);
    const sourceToPage = pageToSource && invertProjective(pageToSource);
    if (!sourceToPage || !containsComponents(gray, profile, pageToSource)) return failure('clipped-content');
    return { status: 'registered', strategy: registrationStrategy, reasons: [], pageToSource, sourceToPage,
      cornerPath, identity: 'teacher-confirmed', automatic: false, checks: [], corners: measured };
  }

  const { first, second } = bestOrientation(gray, profile, measured, !corners);
  if (first?.mirrored && first.verified) return failure('mirrored-registration', { canSetCorners: true });
  if (!first?.verified) return failure('layout-identity', { checks: first?.checks ?? [], canSetCorners: true });
  if (second?.verified && first.score - second.score < .095) {
    return failure('ambiguous-orientation', { canSetCorners: true });
  }
  const adjusted = robustRefinement(gray, profile, first.matrix, first);
  if (!adjusted) return failure('check-displacement', { checks: first.checks, canSetCorners: true });
  const pageToSource = adjusted.matrix;
  const sourceToPage = invertProjective(pageToSource);
  const boundary = pagePoints(profile.page).map(({ x, y }) => project(pageToSource, x, y));
  if (!sourceToPage || boundary.some((point) => !point) || boundary.some((point, index) =>
    cross(point, boundary[(index + 1) % 4], boundary[(index + 2) % 4]) <= 0)) return failure('ill-conditioned-registration');
  if (!containsComponents(gray, profile, pageToSource)) return failure('clipped-content');

  let ambiguous = false;
  for (const alternative of alternatives) {
    if (alternative?.strategy !== registrationStrategy || !alternative.features.length ||
        (alternative.id === profile.id && alternative.revision === profile.revision)) continue;
    const competing = bestOrientation(gray, alternative, measured, !corners).first;
    if (!competing?.verified || competing.mirrored) continue;
    if (competing.score - first.score >= .095) return failure('wrong-profile', { canSetCorners: true });
    if (first.score - competing.score < .095) ambiguous = true;
  }
  if (ambiguous && !confirmedIdentity) return failure('identity-confirmation', { canConfirmIdentity: true, canSetCorners: true });
  const automatic = !ambiguous;
  return {
    status: 'registered', strategy: registrationStrategy, reasons: [], pageToSource, sourceToPage,
    identity: automatic ? 'printed-features' : 'teacher-confirmed', automatic,
    cornerPath, corners: measured, checks: adjusted.checks, geometry: adjusted.geometry,
  };
}
