import { fitProjectiveSamples, project } from '../projective.js';

const maxShift = 3.6;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function compose(a, b) {
  return Array.from({ length: 9 }, (_, index) => {
    const row = Math.floor(index / 3) * 3, col = index % 3;
    return a[row] * b[col] + a[row + 1] * b[col + 3] + a[row + 2] * b[col + 6];
  });
}

function safeAt(fit, x, y) {
  const p = project(fit, x, y), right = project(fit, x + 1, y), down = project(fit, x, y + 1);
  if (!p || !right || !down || Math.hypot(p.x - x, p.y - y) > maxShift) return false;
  const a = right.x - p.x, b = down.x - p.x, c = right.y - p.y, d = down.y - p.y;
  return a * d - b * c > 0 && Math.hypot(a - 1, b, c, d - 1) <= .15;
}

function estimate(block, rings, sites) {
  const choices = block.items.flatMap(item => item.choices).filter(choice => choice.provenance !== 'inferred');
  const unique = choices.flatMap(source => {
    const hits = rings.filter(point => distance(point, source) <= maxShift && Math.abs(point.radius - source.radius) <= .30 * source.radius);
    return hits.length === 1 ? [{ source, measured: hits[0] }] : [];
  });
  const pairs = unique.filter(pair => unique.filter(other => other.measured === pair.measured).length === 1);
  const training = pairs.filter((_, i) => i % 4 !== 2);
  const held = pairs.filter((_, i) => i % 4 === 2);
  const diagnostics = { matched: pairs.length, held: held.length };
  if (pairs.length < 12 || held.length < 3) return { ...diagnostics, status: 'insufficient-anchors' };
  const fit = fitProjectiveSamples(training.map(pair => pair.source), training.map(pair => pair.measured));
  if (!fit) return { ...diagnostics, status: 'degenerate' };
  const maxError = Math.max(...held.map(({ source, measured }) => {
    const p = project(fit, source.x, source.y);
    return p ? distance(p, measured) : Infinity;
  }));
  if (maxError > .9) return { ...diagnostics, status: 'held-out-disagreement', maxError: Number.isFinite(maxError) ? maxError : null };
  const xs = pairs.map(pair => pair.source.x), ys = pairs.map(pair => pair.source.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  if (right - left < 20 || bottom - top < 20 || !(right > left && bottom > top)) {
    return { ...diagnostics, status: 'insufficient-spread', maxError };
  }
  const usable = sites.filter(site => site.x >= left - (right - left) * .40 &&
    site.x <= right + (right - left) * .40 && site.y >= top - (bottom - top) * .50 &&
    site.y <= bottom + (bottom - top) * .50);
  const domain = [...pairs.map(pair => pair.source), ...usable.flatMap(({ x, y }) =>
    [-1, 1].flatMap(dx => [-1, 1].map(dy => ({ x: x + dx * 8, y: y + dy * 6 }))))];
  if (!domain.every(({ x, y }) => safeAt(fit, x, y))) return { ...diagnostics, status: 'unbounded', maxError };
  return { ...diagnostics, status: usable.length ? 'corrected' : 'outside-anchor-coverage', maxError, fit, usable };
}

export function shadowSampling(profile, registration, rings, sites) {
  const matrices = new Map();
  const blocks = profile.components.filter(block => block.kind === 'mc').map(block => {
    const local = sites.filter(site => site.block === block.id);
    if (!local.length || registration.refinedBlocks?.some(other => other.id === block.id)) {
      return { id: block.id, status: local.length ? 'existing-local-pose' : 'no-enrolled-sites', correctedSites: 0 };
    }
    const { fit, usable = [], ...diagnostics } = estimate(block, rings, local);
    if (usable.length) {
      const matrix = compose(registration.pageToSource, fit);
      usable.forEach(site => matrices.set(JSON.stringify([site.block, site.kind, site.symbol]), matrix));
    }
    return { id: block.id, ...diagnostics, correctedSites: usable.length };
  });
  return { blocks, matrixForSite: site => matrices.get(JSON.stringify([site.block, site.kind, site.symbol])) };
}
