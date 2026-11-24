import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDecision, gradeScan, sameTemplate, templateSnapshot, validateCategories } from '../app/src/grading.js';
import { exportBackup, exportCsv, parseBackup } from '../app/src/grading-export.js';
import { discoverBlankLayout } from '../app/src/layout-discovery.js';
import { createMarkerlessProfile } from '../app/src/profile-authoring.js';
import { profileRecord } from '../app/src/profile-store.js';

const template = { id: 'independent-mc-key', revision: 1, name: 'Synthetic MC', scope: 'mc-only',
  items: Array.from({ length: 7 }, (_, index) => ({ id: `MC${index + 1}`, kind: 'mc', choices: [...'ABCD'] })) };
const now = '2026-02-01T10:00:00.000Z';
const categories = {
  dimensions: [{ name: 'Topic', values: ['North', 'South', '=Label'] }, { name: 'Reasoning', values: ['Recall', 'Explain'] }],
  assignments: {
    MC1: ['North', 'Recall'], MC2: ['North', 'Explain'], MC3: ['South', 'Explain'],
    MC4: ['South', null], MC5: ['=Label', null], MC6: [null, 'Recall'],
  },
};
const key = { id: 'original-key', template, createdAt: now, answers: { MC1:'A', MC2:'A', MC3:'C', MC4:'A', MC6:'D', MC7:'D' }, categories };
const raw = ['A', 'B', null, 'A', null, 'D', null].map((value, index) => ({
  id: `MC${index + 1}`, kind: 'mc', rawText: value, review: index === 2,
  status: index === 2 ? 'ambiguous' : value ? 'single' : 'blank',
}));
const scan = { id: 'synthetic-mc-result', template, keyId: key.id, label: 'Synthetic', batchId: 'batch',
  createdAt: now, updatedAt: now, photo: null, photoStatus: 'deleted', rescanOf: null,
  observation: { status: 'read', captureId: 'synthetic-mc-result', items: raw }, history: [] };
const triples = ({ score, denominator, pending }) => [score, denominator, pending];
const aggregate = (grade, dimension, values) => triples(grade.categories.subtotals.find((bucket) =>
  bucket.dimension === dimension && JSON.stringify(bucket.values) === JSON.stringify(values)));

test('M4 two dimensions and their intersections conserve keyed totals and update after correction and undo', () => {
  const initial = gradeScan(scan, key);
  assert.deepEqual(triples(initial), [3, 6, 1]);
  assert.deepEqual(initial.items.find(({ id }) => id === 'MC7').categories, [null, null]);
  const expected = [
    [1, ['North', null], [1, 2, 0]], [1, ['South', null], [1, 2, 1]], [1, ['=Label', null], [0, 0, 0]],
    [1, [null, null], [1, 2, 0]],
    [2, [null, 'Recall'], [2, 2, 0]], [2, [null, 'Explain'], [0, 2, 1]], [2, [null, null], [1, 2, 0]],
    [null, ['North', 'Recall'], [1, 1, 0]], [null, ['North', 'Explain'], [0, 1, 0]],
    [null, ['South', 'Explain'], [0, 1, 1]], [null, ['South', null], [1, 1, 0]], [null, ['=Label', null], [0, 0, 0]],
    [null, [null, 'Recall'], [1, 1, 0]], [null, [null, null], [0, 1, 0]],
  ];
  assert.equal(initial.categories.subtotals.length, expected.length);
  for (const [axis, values, result] of expected) assert.deepEqual(aggregate(initial, axis, values), result);
  for (const axis of [1, 2, null]) {
    const total = initial.categories.subtotals.filter(({ dimension }) => dimension === axis)
      .reduce((a, b) => a.map((value, index) => value + triples(b)[index]), [0, 0, 0]);
    assert.deepEqual(total, triples(initial));
  }
  const edited = addDecision(scan, 'MC3', 'correct', 'C');
  const corrected = gradeScan(edited, key);
  assert.deepEqual(triples(corrected), [4, 6, 0]);
  assert.deepEqual(aggregate(corrected, null, ['South', 'Explain']), [1, 1, 0]);
  assert.deepEqual(gradeScan(addDecision(edited, 'MC3', 'undo'), key), initial);
  assert.deepEqual(edited.observation, scan.observation);
});

test('M4 category revisions and optional MC-only scope preserve legacy grading and reject stale mappings', () => {
  const prior = gradeScan(scan, key);
  const revised = { ...key, id: 'new-key', categories: { ...categories,
    assignments: { ...categories.assignments, MC1: ['South', 'Explain'] } } };
  assert.deepEqual(triples(gradeScan(scan, revised)), [3, 6, 1]);
  assert.deepEqual(aggregate(gradeScan(scan, revised), 1, ['South', null]), [2, 3, 1]);
  assert.deepEqual(gradeScan(scan, key), prior);
  const { categories: _ignored, ...legacy } = key;
  const grade = gradeScan(scan, legacy);
  assert.equal(Object.hasOwn(grade, 'categories'), false);
  assert.equal(Object.hasOwn(grade.items[0], 'categories'), false);
  assert.equal(sameTemplate(template, { ...template, scope: undefined }), false);
  assert.throws(() => gradeScan(scan, { ...key, template: { ...template, revision: 2 } }));
  for (const bad of [
    { ...categories, dimensions: [categories.dimensions[0]] },
    { ...categories, dimensions: [categories.dimensions[0], categories.dimensions[0]] },
    { ...categories, assignments: { NR1: ['South', 'Recall'] } },
    { ...categories, assignments: { MC1: ['Outside', 'Recall'] } },
    { ...categories, assignments: { MC1: ['South'] } },
  ]) assert.throws(() => validateCategories(template, bad));
});

test('M4 CSV labels excluded NR/WR, exports independent subtotal rows and rejects altered JSON subtotals', async () => {
  const record = { ...scan, grade: gradeScan(scan, key) };
  const csv = exportCsv([record]);
  const rows = csv.trimEnd().split('\r\n').map((row) => row.split(',').map((field) => field.slice(1, -1)));
  const [header, ...records] = rows;
  assert(records.every((row) => row.length === header.length));
  const objects = records.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index]])));
  assert.equal(objects.filter(({ row_type }) => row_type === 'item').length, 7);
  assert(objects.every(({ grading_scope }) => grading_scope === 'MC only (NR and WR excluded)'));
  assert.equal(objects.find(({ question }) => question === 'MC5').category_1, "'=Label");
  const intersection = objects.find(({ row_type, category_1, category_2 }) =>
    row_type === 'intersection' && category_1 === 'South' && category_2 === 'Explain');
  assert.deepEqual([intersection.subtotal_score, intersection.subtotal_denominator, intersection.subtotal_pending], ['0', '1', '1']);
  const backup = await exportBackup({ keys: [key], scans: [record] });
  assert.deepEqual(await parseBackup(backup), { keys: [key], scans: [record] });
  for (const change of [
    (data) => { data.scans[0].grade.categories.subtotals[0].score++; },
    (data) => { data.keys[0].categories.assignments.MC1 = ['North', 'Unknown']; },
    (data) => { delete data.scans[0].template.scope; },
  ]) {
    const corrupt = JSON.parse(backup);
    change(corrupt);
    await assert.rejects(parseBackup(JSON.stringify(corrupt)));
  }
});

test('M4 discovery masks both MC and dense NR before confirmation and persists exact scope metadata', () => {
  const page = { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' };
  const width = 1225, height = 1585;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  function ring(x, y, radius) {
    const cx = x * 2, cy = y * 2, spread = (radius + 1) * 2;
    for (let py = Math.floor(cy - spread); py <= cy + spread; py++) {
      for (let px = Math.floor(cx - spread); px <= cx + spread; px++) {
        if (Math.abs(Math.hypot(px - cx, py - cy) / 2 - radius) > .55) continue;
        pixels.fill(22, (py * width + px) * 4, (py * width + px) * 4 + 3);
      }
    }
  }
  for (const x of [82, 265]) {
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 4; column++) ring(x + column * 19, 120 + row * 24, 3.55);
    }
  }
  for (let slot = 0; slot < 4; slot++) {
    const x = 406 + slot * 16.5;
    for (let digit = 0; digit < 10; digit++) ring(x, 350 + digit * 11.8, 4.4);
    if (slot === 1 || slot === 2) ring(x, 338.2, 4.4);
  }
  const image = { id: 'geometry', width, height, pixels };
  const options = [{ x: 245, y: 102, width: 95, height: 108 }, { x: 392, y: 324, width: 89, height: 154 }];
  const all = discoverBlankLayout(image, page);
  assert.deepEqual(all.components.map(({ kind, items }) => [kind, items.length]), [['mc', 4], ['mc', 4], ['nr', 1]]);
  const masked = discoverBlankLayout(image, page, undefined, { exclusions: options });
  assert.equal(masked.status, 'proposed', masked.issues.join(', '));
  assert.deepEqual(masked.components.map(({ kind, items }) => [kind, items.length]), [['mc', 4]]);
  assert.deepEqual(masked.components[0], all.components[0]);
  const mcOnly = discoverBlankLayout(image, page, undefined, { scope: 'mc-only' });
  assert.deepEqual(mcOnly.components.map(({ kind, items }) => [kind, items.length]), [['mc', 4], ['mc', 4]]);
  const fields = { id: 'geometry-template', revision: 1, name: 'Geometry QA', page, scope: 'mc-only', exclusions: options };
  assert.throws(() => createMarkerlessProfile({ ...fields, components: all.components }), /MC-only/);
  const stored = profileRecord(createMarkerlessProfile({ ...fields, components: masked.components }));
  assert.deepEqual(stored.exclusions, options);
  assert.equal(stored.scope, 'mc-only');
  assert.equal(templateSnapshot(stored).scope, 'mc-only');
});
