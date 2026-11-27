import { grayAt } from '../omr-image.js';
import { project } from '../projective.js';
import { enrollSemanticEvidence, possibleSites } from './semantic.js';

// Frozen REG-R1 MC header operating point. Number results use the same
// exploratory point and are reported separately from the header validation.
const mismatchThreshold = .2146609521;
const step = .25;
const offsets = [-.5, 0, .5];
const shape = { header: { columns: 35, rows: 35 }, number: { columns: 49, rows: 35 } };
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function sampler(gray, matrix) {
  return (x, y) => {
    const point = project(matrix, x, y);
    return point ? grayAt(gray, point.x, point.y) : NaN;
  };
}

function patch(sample, site, dx = 0, dy = 0) {
  const { columns, rows } = shape[site.kind];
  const rx = (columns - 1) * step / 2, ry = (rows - 1) * step / 2;
  const corners = [-1, 1].flatMap(x => [-1, 1].map(y =>
    sample(site.x + x * (rx + 1.25), site.y + y * (ry + 1.25)))).sort((a, b) => a - b);
  if (corners.some(value => !Number.isFinite(value))) return null;
  const background = (corners[1] + corners[2]) / 2;
  const values = new Array(columns * rows);
  for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < columns; x++, i++) {
    const value = sample(site.x + x * step - rx + dx, site.y + y * step - ry + dy);
    if (!Number.isFinite(value)) return null;
    values[i] = Math.max(0, Math.min(255, Math.round(background - value)));
  }
  return values;
}

function resolution(matrix, site) {
  const origin = project(matrix, site.x, site.y);
  const x = project(matrix, site.x + 1, site.y);
  const y = project(matrix, site.x, site.y + 1);
  if (!origin || !x || !y) return 0;
  const a = x.x - origin.x, b = y.x - origin.x, c = x.y - origin.y, d = y.y - origin.y;
  const norm = Math.hypot(a + d, b - c) + Math.hypot(a - d, b + c);
  return norm ? 2 * Math.abs(a * d - b * c) / norm : 0;
}

function blur(values, { rows, columns }, sigma) {
  if (sigma < .125) return values;
  const radius = Math.ceil(3 * sigma / step);
  const weights = Array.from({ length: 2 * radius + 1 }, (_, i) => Math.exp(-.5 * ((i - radius) * step / sigma) ** 2));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const horizontal = values.map((_, i) => {
    const x = i % columns, start = i - x;
    return weights.reduce((sum, weight, k) => sum + weight * values[start + Math.max(0, Math.min(columns - 1, x + k - radius))], 0) / total;
  });
  return horizontal.map((_, i) => {
    const x = i % columns, y = (i - x) / columns;
    return weights.reduce((sum, weight, k) => sum + weight * horizontal[Math.max(0, Math.min(rows - 1, y + k - radius)) * columns + x], 0) / total;
  });
}

function correlation(a, b) {
  const ma = mean(a), mb = mean(b);
  let aa = 0, ab = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    aa += x * x; ab += x * y; bb += y * y;
  }
  return aa && bb ? Math.max(-1, Math.min(1, ab / Math.sqrt(aa * bb))) : 0;
}

export function enrollMcPrint(gray, matrix, profile) {
  const sample = sampler(gray, matrix);
  const mcProfile = { ...profile, components: profile.components.filter(block => block.kind === 'mc') };
  return enrollSemanticEvidence(mcProfile, sample).flatMap(({ variants, ...site }) => {
    const reference = patch(sample, site);
    const pixelsPerPoint = resolution(matrix, site);
    return reference && Math.max(...reference) > 31 && pixelsPerPoint * 6.7 >= 5
      ? [{ ...site, pixelsPerPoint, reference }] : [];
  });
}

export function validMcPrint(sites, profile) {
  const expected = possibleSites({ ...profile, components: profile.components.filter(block => block.kind === 'mc') });
  const ids = new Set();
  return Array.isArray(sites) && sites.length <= expected.length && sites.every(site => {
    const origin = expected[site?.index];
    if (!Number.isInteger(site?.index) || !origin || origin.inferred || ids.has(site.index) ||
        ['block', 'kind', 'symbol'].some(key => site[key] !== origin[key]) ||
        !Number.isFinite(site.x) || !Number.isFinite(site.y) ||
        Math.abs(site.x - origin.x) > 8 || Math.abs(site.y - origin.y) > 14 ||
        site.x < 0 || site.x > profile.page.width || site.y < 0 || site.y > profile.page.height ||
        !Number.isFinite(site.pixelsPerPoint) || site.pixelsPerPoint < 5 / 6.7) return false;
    const window = shape[origin.kind];
    if (!Array.isArray(site.reference) || site.reference.length !== window.rows * window.columns ||
        site.reference.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false;
    ids.add(site.index);
    return true;
  });
}

export function compareMcPrint(gray, registration, sites) {
  return sites.map(({ reference, pixelsPerPoint, ...site }) => {
    const matrix = registration.refinedBlocks?.find(block => block.id === site.block)?.matrix ?? registration.pageToSource;
    const sample = sampler(gray, matrix);
    const effectivePixels = resolution(matrix, site) * 6.7;
    const observed = patch(sample, site);
    const output = { ...site, effectivePixels };
    if (!observed || effectivePixels < 5 || Math.max(...observed) <= 31) {
      return { ...output, status: 'indeterminate', reason: 'weak-or-unresolved-print' };
    }
    if (mean(observed) > .45 * 255 && mean(observed) / Math.max(...observed) > .68) {
      return { ...output, status: 'obscured', reason: 'dense-ink' };
    }
    const scanScale = effectivePixels / 6.7;
    const blurFor = scale => Math.max(0, .42 / scale - .10);
    const adapted = blur(reference, shape[site.kind], Math.max(0, blurFor(scanScale) - blurFor(pixelsPerPoint)));
    let best = -1;
    for (const dx of offsets) for (const dy of offsets) {
      const candidate = patch(sample, site, dx, dy);
      if (candidate) best = Math.max(best, correlation(adapted, candidate));
    }
    const distance = 1 - best;
    return { ...output, distance, status: distance > mismatchThreshold ? 'mismatch' : 'agreement' };
  });
}
