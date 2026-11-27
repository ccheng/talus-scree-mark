import { circularWitness, matches } from './scope-shadow.js';
import { arbitrateFootprints } from './footprint-arbitration.js';

const maxWitnesses = 220;
const maxHypotheses = 1200;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const choice = ({ x, y, radius }) => ({ x, y, radius });
const cellSize = 3;
const key = (x, y) => Math.floor(x / cellSize) + '/' + Math.floor(y / cellSize);

export function discoverResidualFootprints(gray, matrix, observed, { arbitrate = false } = {}) {
  if (observed.status !== 'observed') return { status: 'unavailable', reason: observed.reason, rows: [], ambiguous: [] };
  const used = observed.rows.flatMap(row => row.choices);
  const points = observed.rings.filter(point => !used.some(other => distance(point, other) <= 1.5) &&
    circularWitness(gray, matrix, point)).sort((a, b) => a.x - b.x || a.y - b.y);
  if (points.length > maxWitnesses) return { status: 'unavailable', reason: 'residual-witness-limit', rows: [], ambiguous: [] };
  const cells = new Map();
  for (const [i, point] of points.entries()) {
    const cell = key(point.x, point.y);
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push(i);
  }
  function near(x, y, radius) {
    const limit = Math.max(1.5, .32 * radius);
    const hits = [];
    for (let r = Math.floor((y - limit) / cellSize); r <= Math.floor((y + limit) / cellSize); r++) {
      for (let c = Math.floor((x - limit) / cellSize); c <= Math.floor((x + limit) / cellSize); c++) {
        for (const index of cells.get(c + '/' + r) ?? []) {
          const p = points[index];
          if (Math.abs(p.radius - radius) <= .30 * radius && Math.hypot(p.x - x, p.y - y) <= limit) hits.push(index);
        }
      }
    }
    return hits.length === 1 ? hits[0] : null;
  }
  const hypotheses = new Map();
  for (const [i, a] of points.entries()) for (let j = i + 1; j < points.length; j++) {
    const b = points[j], dx = b.x - a.x, dy = b.y - a.y, radius = (a.radius + b.radius) / 2;
    if (dx < 2.8 * radius || dx > 7.5 * radius ||
        Math.abs(dy) > Math.max(1.5, .17 * dx) || Math.abs(a.radius - b.radius) > .30 * radius) continue;
    const indexes = [i, j];
    for (let k = 2; k < 8; k++) {
      const found = near(a.x + dx * k, a.y + dy * k, radius);
      if (found === null || indexes.includes(found)) break;
      indexes.push(found);
    }
    if (indexes.length < 3 && !arbitrate) continue;
    const identity = [...indexes].sort((a, b) => a - b).join(',');
    hypotheses.set(identity, indexes);
    if (hypotheses.size > maxHypotheses) return { status: 'unavailable', reason: 'residual-hypothesis-limit', rows: [], ambiguous: [] };
  }
  const all = [...hypotheses.values()];
  const maximal = all.filter(row => !all.some(other => other.length > row.length && row.every(index => other.includes(index))));
  const reference = (row, index) => ({
    id: 'residual-' + (index + 1), choices: row.map(index => choice(points[index])),
    evidence: row.length === 2 ? 'tentative-pair'
      : row.length === 3 ? 'tentative-three-ring-sequence' : 'full-ring-sequence',
  });
  if (arbitrate) {
    const grouped = arbitrateFootprints(maximal, points);
    const ids = new Map(maximal.map((row, index) => [row, index]));
    const footprint = row => reference(row, ids.get(row));
    return { status: 'observed', rows: grouped.rows.map(footprint), tentative: grouped.tentative.map(footprint),
      ambiguous: grouped.unresolved.flatMap(group => group.rows.map(row => ({ ...footprint(row), reason: group.reason }))),
      witnessCount: points.length };
  }
  const rows = [], ambiguous = [];
  for (const [index, row] of maximal.entries()) {
    const destination = maximal.some(other => other !== row && row.some(i => other.includes(i))) ? ambiguous : rows;
    destination.push(reference(row, index));
  }
  return { status: 'observed', rows, ambiguous, witnessCount: points.length };
}

export function compareFootprintInventory(reference, observed) {
  const recorded = new Set(), ambiguous = [];
  const novel = [], previouslyObserved = [];
  for (const row of observed) {
    const options = reference.filter(prior => matches(prior, row));
    if (!options.length) novel.push(row.id);
    else if (options.length !== 1 || recorded.has(options[0].id)) ambiguous.push(row.id);
    else {
      recorded.add(options[0].id);
      previouslyObserved.push({ observed: row.id, reference: options[0].id });
    }
  }
  return { novel, previouslyObserved, missing: reference.filter(row => !recorded.has(row.id)).map(row => row.id), ambiguous };
}

export function validFootprintInventory(inventory, page) {
  const ids = new Set();
  return inventory && ['observed', 'unavailable'].includes(inventory.status) &&
    Array.isArray(inventory.rows) && inventory.rows.length <= 1800 &&
    inventory.rows.every(row => {
      if (typeof row?.id !== 'string' || ids.has(row.id) || !Array.isArray(row.choices) ||
          row.choices.length < 2 || row.choices.length > 13 || row.choices.some(c =>
            ![c?.x, c?.y, c?.radius].every(Number.isFinite) || c.radius <= 0 || c.x < 0 || c.y < 0 ||
            c.x > page.width || c.y > page.height)) return false;
      ids.add(row.id);
      return true;
    });
}
