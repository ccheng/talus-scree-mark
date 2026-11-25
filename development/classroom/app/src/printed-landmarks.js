import { grayAt } from './omr-image.js';
import { project } from './projective.js';

const scale = 2;
const patchRadius = 12;
const searchRadius = 20;
const patchWidth = 2 * patchRadius + 1;
const patchSize = patchWidth ** 2;
const halfWindow = patchRadius + searchRadius;
const windowWidth = 2 * halfWindow + 1;
const minimumSeparation = 11;
const maximumDistance = 70;
const maxPerBlock = 6;
const maxSites = 96;
const margin = halfWindow / scale;

function distanceToBlock(x, y, bounds) {
  return Math.hypot(Math.max(0, bounds.x - x, x - bounds.x - bounds.width),
    Math.max(0, bounds.y - y, y - bounds.y - bounds.height));
}

function outsideAnswerInk(x, y, components) {
  // Use a square exclusion because the whole sampled patch is square.
  return components.every(({ bounds }) => x < bounds.x - 7 || x > bounds.x + bounds.width + 7 ||
    y < bounds.y - 7 || y > bounds.y + bounds.height + 7);
}

function sample(gray, matrix, x, y) {
  const point = project(matrix, x, y);
  return point ? grayAt(gray, point.x, point.y) : NaN;
}

function raster(gray, matrix, x, y, width, height) {
  const values = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const intensity = sample(gray, matrix, x + col / scale, y + row / scale);
      values[row * width + col] = Number.isFinite(intensity) ? Math.round(intensity) : 255;
    }
  }
  return values;
}

function longRules(values, width, height) {
  const mask = new Uint8Array(values.length);
  // Mark straight ink spans of at least 20 points. With a full two-axis
  // corner test below, uniform line interiors supply no landmark.
  const mark = (count, length, stride, jump) => {
    for (let line = 0; line < count; line++) {
      const start = line * jump;
      for (let pos = 0; pos < length;) {
        const first = pos++;
        if (values[start + first * stride] >= 150) continue;
        while (pos < length && values[start + pos * stride] < 150) pos++;
        if (pos - first >= 40) {
          for (let i = first; i < pos; i++) mask[start + i * stride] = 1;
        }
      }
    }
  };
  mark(height, width, 1, width);
  mark(width, height, width, 1);
  return mask;
}

function cornerScore(values, width, center) {
  let xx = 0, yy = 0, xy = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const index = center + dy * width + dx;
      const gx = values[index + 1] - values[index - 1];
      const gy = values[index + width] - values[index - width];
      xx += gx * gx;
      yy += gy * gy;
      xy += gx * gy;
    }
  }
  return (xx + yy - Math.hypot(xx - yy, 2 * xy)) / 2;
}

function patchAt(values, width, x, y) {
  let patch = '';
  let sum = 0, square = 0;
  for (let dy = -patchRadius; dy <= patchRadius; dy++) {
    for (let dx = -patchRadius; dx <= patchRadius; dx++) {
      const value = values[(y + dy) * width + x + dx] >> 4;
      sum += value;
      square += value * value;
      patch += value.toString(16);
    }
  }
  return square / patchSize - (sum / patchSize) ** 2 >= (24 / 16) ** 2 ? patch : undefined;
}

export function enrollPrintedLandmarks(gray, matrix, page, components) {
  if (!components.every(({ kind }) => kind === 'mc')) return [];
  const width = Math.ceil(page.width * scale);
  const height = Math.ceil(page.height * scale);
  const values = raster(gray, matrix, 0, 0, width, height);
  const rules = longRules(values, width, height);
  const candidates = [];
  const edge = halfWindow;
  for (let y = edge; y < height - edge; y++) {
    for (let x = edge; x < width - edge; x++) {
      const index = y * width + x;
      if (!rules[index] || !outsideAnswerInk(x / scale, y / scale, components)) continue;
      if (!components.some(({ bounds }) => distanceToBlock(x / scale, y / scale, bounds) <= maximumDistance)) continue;
      const score = cornerScore(values, width, index);
      if (score > 45000) candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const sites = [];
  const coverage = new Map();
  for (const { x, y } of candidates) {
    const cx = x / scale, cy = y / scale;
    if (sites.some((site) => Math.hypot(site.x - cx, site.y - cy) < minimumSeparation)) continue;
    const nearby = components.filter(({ bounds }) => distanceToBlock(cx, cy, bounds) <= maximumDistance);
    if (nearby.every(({ id }) => (coverage.get(id) ?? 0) >= maxPerBlock)) continue;
    const patch = patchAt(values, width, x, y);
    if (!patch) continue;
    sites.push({ x: cx, y: cy, patch });
    for (const { id } of nearby) coverage.set(id, (coverage.get(id) ?? 0) + 1);
    if (sites.length >= maxSites) break;
  }
  return sites;
}

export function copyPrintedLandmarks(sites, page, components) {
  if (sites === undefined) return [];
  const invalid = () => { throw new TypeError('The saved printed landmark evidence is invalid.'); };
  if (!Array.isArray(sites) || sites.length > maxSites) invalid();
  return sites.map((site, index) => {
    const { x, y, patch } = site ?? {};
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < margin || y < margin ||
        x > page.width - margin || y > page.height - margin || !outsideAnswerInk(x, y, components) ||
        typeof patch !== 'string' || patch.length !== patchSize || !/^[0-9a-f]+$/.test(patch) ||
        sites.slice(0, index).some((prior) => Math.hypot(prior.x - x, prior.y - y) < minimumSeparation)) invalid();
    return { x, y, patch };
  });
}

function match(gray, transform, { x, y, patch }) {
  const samples = [-margin, margin];
  if (samples.some((dy) => samples.some((dx) => !Number.isFinite(sample(gray, transform, x + dx, y + dy))))) return null;
  const scan = raster(gray, transform, x - margin, y - margin, windowWidth, windowWidth);
  const template = Float64Array.from(patch, (hex) => Number.parseInt(hex, 16));
  const mean = template.reduce((sum, value) => sum + value, 0) / patchSize;
  let energy = 0;
  for (let i = 0; i < patchSize; i++) {
    template[i] -= mean;
    energy += template[i] ** 2;
  }
  if (energy < patchSize * (24 / 16) ** 2) return null;
  const side = searchRadius * 2 + 1;
  const scores = new Float32Array(side ** 2);
  let best = -1, bx = 0, by = 0;
  for (let top = 0; top < side; top++) {
    for (let left = 0; left < side; left++) {
      let sum = 0, square = 0, covariance = 0;
      let i = 0;
      for (let row = 0; row < patchWidth; row++) {
        const start = (top + row) * windowWidth + left;
        for (let col = 0; col < patchWidth; col++) {
          const value = scan[start + col];
          sum += value;
          square += value * value;
          covariance += value * template[i++];
        }
      }
      const variance = square - sum ** 2 / patchSize;
      const score = variance > 0 ? covariance / Math.sqrt(variance * energy) : -1;
      scores[top * side + left] = score;
      if (score > best) {
        best = score;
        bx = left;
        by = top;
      }
    }
  }
  if (best < .78 || bx === 0 || by === 0 || bx === side - 1 || by === side - 1) return null;
  if (scores.some((value, index) => value > best - .045 &&
    (Math.abs(index % side - bx) > 3 || Math.abs(Math.floor(index / side) - by) > 3))) return null;
  return { x: (bx - searchRadius) / scale, y: (by - searchRadius) / scale, scores, best };
}

function contradicts({ x, y, scores, best }, dx, dy) {
  if (Math.hypot(x - dx, y - dy) <= 3) return false;
  const side = 2 * searchRadius + 1;
  const clamp = (value) => Math.max(0, Math.min(side - 1, Math.round(value * scale) + searchRadius));
  const atX = clamp(dx), atY = clamp(dy);
  let aligned = -1;
  for (let y = Math.max(0, atY - 2); y <= Math.min(side - 1, atY + 2); y++) {
    for (let x = Math.max(0, atX - 2); x <= Math.min(side - 1, atX + 2); x++) {
      aligned = Math.max(aligned, scores[y * side + x]);
    }
  }
  return best - aligned > .16;
}

export function checkPrintedLandmarks(gray, profile, pose) {
  const sites = profile.printedLandmarks ?? [];
  if (!sites.length) return { status: 'unavailable' };
  if (!pose.refined?.length) return { status: 'not-needed' };
  const matched = new Map();
  const blocks = pose.refined.map(({ id, dx, dy }) => {
    const { bounds } = profile.components.find((block) => block.id === id);
    let matchedCount = 0, disagreement = 0, agreement = 0;
    for (const site of sites) {
      if (distanceToBlock(site.x, site.y, bounds) > maximumDistance) continue;
      if (!matched.has(site)) matched.set(site, match(gray, pose.pageToSource, site));
      const result = matched.get(site);
      if (!result) continue;
      matchedCount++;
      if (contradicts(result, dx, dy)) disagreement++;
      if (Math.hypot(result.x - dx, result.y - dy) <= 3) agreement++;
    }
    return { id, matched: matchedCount, disagreement, agreement };
  });
  const status = blocks.some(({ disagreement }) => disagreement >= 2) ? 'incompatible'
    : blocks.every(({ agreement, disagreement }) => agreement >= 2 && disagreement === 0) ? 'corroborated' : 'insufficient';
  return { status, enrolled: sites.length, blocks };
}
