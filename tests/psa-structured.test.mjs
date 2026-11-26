import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileStructured } from '../app/src/psa-structured.js';
import { pageScale } from '../app/src/psa-nr-discovery.js';

const page = { width: 612, height: 792, orientation: 'portrait', origin: 'top-left', units: 'pt' };
const points = (y) => [100, 120, 140, 160, 180].map((x) => [x * pageScale, y * pageScale]);
const existingChoices = points(100).map(([x, y], index) => ({
  x: x / pageScale + .15, y: y / pageScale, radius: 4, symbol: 'ABCDE'[index],
}));
const establishedRow = {
  id: 'MC1', kind: 'mc', bounds: { x: 95, y: 95, width: 90, height: 10 }, choices: existingChoices,
};
const layout = {
  components: [{
    id: 'mc-block', kind: 'mc', bounds: { x: 90, y: 90, width: 100, height: 50 }, items: [establishedRow],
  }],
  diagnostics: [], issues: [],
};
const row = (y, observed, extra = {}) => ({ points: points(y), observed, decision: 'review', ...extra });

test('Structured recovers a partial MC row as provisional and preserves matching Established geometry', () => {
  const rows = [
    row(100, [true, true, true, true, true], { number: 1 }),
    row(120, [true, true, true, true, false], { number: 2 }),
  ];
  const outlines = rows.flatMap(({ points, observed }) => points.flatMap(([x, y], index) =>
    observed[index] ? [[x, y, 4 * pageScale]] : []));
  const proposals = { mc: { rows, outlines }, nr: { proposals: [] } };
  const result = reconcileStructured(layout, proposals, [], page);
  const [existing, recovered] = result.components[0].items;
  assert.equal(existing, establishedRow);
  assert.equal(result.psa.mcAdded, 1);
  assert.equal(result.status, 'review');
  assert.deepEqual(result.issues, ['psa-mc-review']);
  assert.deepEqual(recovered.choices.at(-1), { x: 180, y: 120, radius: 4, symbol: 'E', provenance: 'inferred' });
  assert.ok(recovered.choices.slice(0, 4).every(({ provenance }) => provenance === 'observed'));
  assert.equal(result.diagnostics.find(({ row: id }) => id === recovered.id).number, 2);
  assert.equal(reconcileStructured(layout, proposals, [recovered.bounds], page).psa.mcAdded, 0);
});

test('Structured locates competing MC/NR evidence without adding a disputed row', () => {
  const disputed = row(120, [true, true, true, true, true], { arbitration: 'unresolved' });
  const outlines = disputed.points.map(([x, y]) => [x, y, 4 * pageScale]);
  const result = reconcileStructured(layout, { mc: { rows: [disputed], outlines }, nr: { proposals: [] } }, [], page);
  assert.deepEqual(result.components, layout.components);
  assert.equal(result.conflictRegions.length, 1);
  assert.deepEqual(result.issues, ['psa-type-review']);
});
