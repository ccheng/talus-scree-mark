import { fitProjectiveSamples, project } from '../projective.js';

const patchRadius = 8;
const searchRadius = 13;
const patchWidth = 2 * patchRadius + 1;
const patchArea = patchWidth ** 2;
const maxAnchors = 40;
const anchorMargin = patchRadius + 1;
const trainingMinimum = 8;
const holdoutMinimum = 3;
const maxDisplacement = 13;

function distanceToBlock(x, y, { x: left, y: top, width, height }) {
  return Math.hypot(Math.max(left - x, 0, x - left - width), Math.max(top - y, 0, y - top - height));
}

function anchorAllowed(profile, x, y) {
  return x >= anchorMargin && x <= profile.page.width - anchorMargin &&
    y >= anchorMargin && y <= profile.page.height - anchorMargin &&
    !profile.components.some(({ bounds }) => distanceToBlock(x, y, bounds) <= 12) &&
    !(profile.exclusions ?? []).some(bounds => distanceToBlock(x, y, bounds) <= anchorMargin);
}

function patch(sample, x, y, radius) {
  const values = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const value = sample(x + dx, y + dy);
    if (!Number.isFinite(value)) return null;
    values.push(value);
  }
  return values;
}

function cornerScore(sample, x, y) {
  let xx = 0, yy = 0, xy = 0, sum = 0, square = 0, count = 0;
  for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
    const ink = sample(x + dx, y + dy);
    const gx = sample(x + dx + 1, y + dy) - sample(x + dx - 1, y + dy);
    const gy = sample(x + dx, y + dy + 1) - sample(x + dx, y + dy - 1);
    xx += gx * gx; yy += gy * gy; xy += gx * gy;
    sum += ink; square += ink * ink; count++;
  }
  return square / count - (sum / count) ** 2 > 250 ? (xx + yy - Math.hypot(xx - yy, 2 * xy)) / 2 : 0;
}

export function enrollGeometryAnchors(profile, sample) {
  const { width, height } = profile.page;
  const candidates = new Map(profile.components.map(block => [block.id, []]));
  for (let y = 20; y < height - 20; y += 3) for (let x = 20; x < width - 20; x += 3) {
    if (!anchorAllowed(profile, x, y)) continue;
    let owner, distance = 85;
    for (const block of profile.components) {
      const next = distanceToBlock(x, y, block.bounds);
      if (next < distance) { owner = block.id; distance = next; }
    }
    if (!owner) continue;
    const score = cornerScore(sample, x, y);
    if (score > 2000) candidates.get(owner).push({ x, y, score });
  }
  const anchors = [];
  for (const [block, entries] of candidates) {
    let count = 0;
    for (const { x, y } of entries.sort((a, b) => b.score - a.score)) {
      if (anchors.some(prior => Math.hypot(prior.x - x, prior.y - y) < 29)) continue;
      const values = patch(sample, x, y, patchRadius);
      if (!values) continue;
      anchors.push({ x, y, block, heldOut: count === 3, values: values.map(Math.round) });
      count++;
      if (anchors.length >= maxAnchors) return anchors;
      if (count === 4) break;
    }
  }
  return anchors;
}

export function validateGeometryAnchors(anchors, profile) {
  const ids = new Set(profile.components.map(({ id }) => id));
  if (!Array.isArray(anchors) || anchors.length > maxAnchors || anchors.some((anchor, index) =>
    !anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) ||
    !anchorAllowed(profile, anchor.x, anchor.y) || !ids.has(anchor.block) ||
    typeof anchor.heldOut !== 'boolean' || !Array.isArray(anchor.values) || anchor.values.length !== patchArea ||
    anchor.values.some(value => !Number.isInteger(value) || value < 0 || value > 255) ||
    anchors.slice(0, index).some(prior => Math.hypot(anchor.x - prior.x, anchor.y - prior.y) < 29))) {
    throw new TypeError('Invalid registration anchors.');
  }
}

function match(anchor, sample) {
  const { x, y, values } = anchor;
  const side = 2 * (patchRadius + searchRadius) + 1;
  const scan = patch(sample, x, y, patchRadius + searchRadius);
  if (!scan) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / patchArea;
  const centered = values.map(value => value - mean);
  const energy = centered.reduce((sum, value) => sum + value ** 2, 0);
  if (!energy) return null;
  const scores = [];
  for (let dy = -searchRadius; dy <= searchRadius; dy++) for (let dx = -searchRadius; dx <= searchRadius; dx++) {
    let sum = 0, square = 0, dot = 0, index = 0;
    for (let row = 0; row < patchWidth; row++) for (let column = 0; column < patchWidth; column++) {
      const value = scan[(row + dy + searchRadius) * side + column + dx + searchRadius];
      sum += value; square += value ** 2; dot += centered[index++];
    }
    const variance = square - sum ** 2 / patchArea;
    scores.push({ dx, dy, score: variance > 0 ? dot / Math.sqrt(variance * energy) : -1 });
  }
  const [best, ...rest] = scores.sort((a, b) => b.score - a.score);
  const alternative = rest.find(other => Math.hypot(best.dx - other.dx, best.dy - other.dy) > 2.5);
  if (best.score <= .73 || best.score - alternative.score <= .035 ||
      Math.max(Math.abs(best.dx), Math.abs(best.dy)) === searchRadius) return null;
  return { x, y, block: anchor.block, heldOut: anchor.heldOut, ...best };
}

export function assessGeometry(profile, anchors, sample) {
  const matches = anchors.map(anchor => match(anchor, sample)).filter(Boolean);
  const training = matches.filter(match => !match.heldOut);
  const heldOut = matches.filter(match => match.heldOut);
  const coverage = profile.components.map(({ id }) => ({
    id, enrolled: anchors.filter(anchor => anchor.block === id).length,
    matched: matches.filter(match => match.block === id).length,
  }));
  const evidence = { coverage, training: training.length, heldOut: heldOut.length };
  if (training.length < trainingMinimum || heldOut.length < holdoutMinimum ||
      coverage.some(({ matched }) => matched < 3)) return { ...evidence, status: 'insufficient' };
  const correction = fitProjectiveSamples(training, training.map(({ x, y, dx, dy }) => ({ x: x + dx, y: y + dy })));
  if (!correction) return { ...evidence, status: 'degenerate' };
  const errors = heldOut.map(({ x, y, dx, dy }) => {
    const p = project(correction, x, y);
    return p ? Math.hypot(p.x - x - dx, p.y - y - dy) : Infinity;
  });
  const maximumError = Math.max(...errors);
  if (maximumError > 2.4) return { ...evidence, status: 'held-out-disagreement',
    maximumError: Number.isFinite(maximumError) ? maximumError : null };
  const { width, height } = profile.page;
  for (let row = 0; row <= 24; row++) for (let column = 0; column <= 24; column++) {
    const x = width * column / 24, y = height * row / 24;
    const p = project(correction, x, y);
    const right = project(correction, x + 1, y);
    const down = project(correction, x, y + 1);
    if (!p || !right || !down) return { ...evidence, status: 'unbounded' };
    const ux = right.x - p.x, uy = right.y - p.y, vx = down.x - p.x, vy = down.y - p.y;
    if (Math.hypot(p.x - x, p.y - y) > maxDisplacement || ux * vy - uy * vx <= 0 ||
        Math.hypot(ux - 1, uy, vx, vy - 1) > .15) return { ...evidence, status: 'unbounded' };
  }
  return { ...evidence, status: 'bounded-proposal', maximumError, correction };
}
