import { grayAt } from '../omr-image.js';
import { pageRingCandidates } from '../profile-authoring.js';
import { project } from '../projective.js';

const tolerance = 1.5;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const overlap = (a, b) => distance(a, b) <= a.radius + b.radius + tolerance;
const contains = ({ x, y, radius }, box) => x - radius - tolerance >= box.x &&
  x + radius + tolerance <= box.x + box.width && y - radius - tolerance >= box.y &&
  y + radius + tolerance <= box.y + box.height;
const crosses = ({ x, y, radius }, box) => x + radius + tolerance >= box.x &&
  x - radius - tolerance <= box.x + box.width && y + radius + tolerance >= box.y &&
  y - radius - tolerance <= box.y + box.height;
const mcRows = profile => profile.components.filter(block => block.kind === 'mc').flatMap(block => block.items);
const nrBubbles = profile => profile.components.filter(block => block.kind === 'nr')
  .flatMap(block => block.items.flatMap(item => item.slots.flatMap(slot => slot.choices)));

export function matches(enrolled, observed) {
  if (enrolled.choices.length !== observed.choices.length) return false;
  const pairs = enrolled.choices.map(choice => observed.choices.filter(actual =>
    distance(choice, actual) <= tolerance && Math.abs(choice.radius - actual.radius) <= .25 * choice.radius));
  return pairs.every(pair => pair.length === 1) && new Set(pairs.map(([choice]) => choice)).size === pairs.length;
}

export function validateExcludedRows(known, profile) {
  const ids = new Set(profile.components.flatMap(block => block.items.map(item => item.id)));
  if (!Array.isArray(known) || known.length > 64) throw new TypeError('Invalid confirmed row evidence.');
  for (const row of known) {
    if (typeof row?.id !== 'string' || !row.id || row.id.length > 80 || ids.has(row.id) ||
        !Array.isArray(row.choices) || row.choices.length < 2 || row.choices.length > 13 ||
        !row.choices.every((choice, i) => [choice?.x, choice?.y, choice?.radius].every(Number.isFinite) &&
          choice.radius > 0 && choice.x >= choice.radius && choice.y >= choice.radius &&
          choice.x + choice.radius <= profile.page.width && choice.y + choice.radius <= profile.page.height &&
          row.choices.slice(0, i).every(prior => !overlap(prior, choice)))) {
      throw new TypeError('Invalid confirmed row evidence.');
    }
    ids.add(row.id);
  }
  if (known.some((row, index) => known.slice(0, index).some(prior =>
    row.choices.some(choice => prior.choices.some(other => overlap(choice, other)))))) {
    throw new TypeError('Confirmed rows overlap.');
  }
}

function shapeOf(row) {
  const points = [...row.choices].sort((a, b) => a.x - b.x);
  const first = points[0], last = points.at(-1);
  const span = last.x - first.x;
  const slope = span > 0 ? (last.y - first.y) / span : Infinity;
  return Math.abs(slope) <= .20 ? { points, slope, x: first.x } : null;
}

// A connected ink component alone can be a printed letter. Use the same
// twelve perimeter directions as the Established extra-row guard, centered
// on each measured outline rather than on an extrapolated row location.
const directions = Array.from({ length: 12 }, (_, index) =>
  [Math.cos(index * Math.PI / 6), Math.sin(index * Math.PI / 6)]);

export function circularWitness(gray, matrix, { x, y, radius }) {
  return directions.filter(([dx, dy]) => {
    const sample = scale => {
      const point = project(matrix, x + dx * radius * scale, y + dy * radius * scale);
      return point ? grayAt(gray, point.x, point.y) : NaN;
    };
    return sample(1.55) - Math.min(sample(.88), sample(1.02), sample(1.16)) >= 26;
  }).length >= 10;
}

export function observeScopeRows(gray, matrix, profile, known = [], { includeRings = false } = {}) {
  const required = mcRows(profile);
  if (!required.length) return { status: 'unavailable', reason: 'no-mc-rows' };
  const prototypes = [...required, ...known].map(shapeOf);
  if (prototypes.some(shape => !shape)) return { status: 'unavailable', reason: 'unsupported-row-orientation' };
  const relevantRadii = prototypes.flatMap(({ points }) => points.map(({ radius }) => radius));
  const nr = nrBubbles(profile);
  const limit = 1800;
  const outlines = pageRingCandidates(gray, matrix, profile.page, {
    minRadius: Math.min(...relevantRadii) * .60, maxRadius: Math.max(...relevantRadii) * 1.4,
    markedCenters: true, fineOutlines: true, limit,
  });
  if (outlines.length === limit) return { status: 'unavailable', reason: 'outline-limit' };
  const candidates = outlines.filter(outline => !nr.some(choice => distance(choice, outline) <= Math.max(2, choice.radius)));
  const indexed = candidates.map((point, index) => ({ ...point, index }));
  const uniqueShapes = prototypes.filter(({ points, slope }, index) => !prototypes.slice(0, index).some(prior =>
    prior.points.length === points.length && Math.abs(prior.slope - slope) <= .02 &&
    prior.points.every((point, lane) => Math.abs(point.x - points[lane].x) <= tolerance)));
  const detected = new Map();
  const witness = new Map();
  for (const { points, x, slope } of uniqueShapes) {
    const members = indexed.flatMap(point => {
      const lanes = points.map((choice, index) => ({ choice, index })).filter(({ choice }) =>
        Math.abs(choice.x - point.x) <= 2 * tolerance && Math.abs(choice.radius - point.radius) <= .4 * choice.radius);
      return lanes.length === 1 ? [{ point, lane: lanes[0].index, y: point.y - slope * (point.x - x) }] : [];
    }).sort((a, b) => a.y - b.y);
    const bands = [];
    for (const member of members) {
      if (!bands.length || member.y - bands.at(-1)[0].y > 2 * tolerance) bands.push([]);
      bands.at(-1).push(member);
    }
    for (const band of bands) {
      const minimum = Math.max(2, Math.ceil(points.length * .70));
      if (band.length < minimum || new Set(band.map(({ lane }) => lane)).size !== band.length) continue;
      const hasRequiredPosition = band.some(({ point }) => required.some(row =>
        row.choices.some(choice => distance(choice, point) <= tolerance)));
      if (!hasRequiredPosition && band.filter(({ point }) => {
        if (!witness.has(point.index)) witness.set(point.index, circularWitness(gray, matrix, point));
        return witness.get(point.index);
      }).length < minimum) continue;
      const indexes = band.map(({ point }) => point.index).sort((a, b) => a - b);
      const choices = band.map(({ point: { x, y, radius } }) => ({ x, y, radius }));
      detected.set(indexes.join(','), { indexes, choices });
    }
  }
  const observations = [...detected.values()];
  const rows = observations.filter(a => !observations.some(b => b.indexes.length > a.indexes.length &&
    a.indexes.every(index => b.indexes.includes(index)))).map(({ choices }, index) => ({ id: 'observed-' + (index + 1), choices }));

  return { status: 'observed', rows, outlineCount: outlines.length,
    coverage: 'MC-aligned lanes', ...(includeRings ? { rings: candidates } : {}) };
}

export function classifyScopeEvidence(profile, known, rows) {
  const required = mcRows(profile);
  const exclusions = profile.exclusions ?? [];
  const requiredChoices = required.flatMap(row => row.choices);
  const withhold = reason => ({ status: 'withhold', reason, semanticAssurance: false });
  if (exclusions.some(box => requiredChoices.some(choice => crosses(choice, box))) ||
      known.some(row => row.choices.some(choice => requiredChoices.some(other => overlap(choice, other))))) {
    return withhold('exclusion-overlaps-required');
  }
  const indexes = new Set();
  for (const [index, row] of rows.entries()) {
    if (rows.slice(0, index).some(prior => prior.choices.some(a => row.choices.some(b => distance(a,b) <= tolerance)))) {
      return withhold('duplicate-observation');
    }
  }
  for (const row of required) {
    const candidates = rows.map((observed, index) => ({ observed, index })).filter(({ observed, index }) =>
      !indexes.has(index) && matches(row, observed));
    if (candidates.length !== 1) return { ...withhold(candidates.length ? 'ambiguous-required-row' : 'required-row-unverified'), row: row.id };
    indexes.add(candidates[0].index);
  }
  const partial = profile.scope === 'mc-only' && profile.mcCompleteness === 'partial';
  const ignored = [], unknown = [];
  for (const [index, row] of rows.entries()) {
    if (indexes.has(index)) continue;
    if (row.choices.some(choice => requiredChoices.some(other => overlap(choice, other)))) {
      return { ...withhold('extra-overlaps-required'), row: row.id };
    }
    const candidates = known.filter(other => matches(other, row) && !ignored.some(entry => entry.enrolled === other.id));
    if (partial && candidates.length === 1 && exclusions.some(box =>
      [...row.choices, ...candidates[0].choices].every(choice => contains(choice, box)))) {
      ignored.push({ observed: row.id, enrolled: candidates[0].id });
    } else unknown.push(row.id);
  }
  return { status: unknown.length ? partial ? 'review' : 'withhold' : 'geometry-consistent',
    reason: unknown.length ? 'unexpected-structure' : 'all-observed-rows-accounted-for',
    requiredMatched: required.map(row => row.id), ignored, unknown, semanticAssurance: false };
}

export function corroboratedExcludedRows(profile, rows, observed) {
  return rows.every(row => profile.exclusions?.some(box => row.choices.every(choice => contains(choice, box))) &&
    observed.filter(other => matches(row, other)).length === 1);
}
