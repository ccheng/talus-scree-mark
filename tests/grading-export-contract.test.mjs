import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { exportBackup, exportCsv, parseBackup } from '../app/src/grading-export.js';
import { addDecision, gradeScan } from '../app/src/grading.js';

const timestamp = '2026-02-03T12:00:00.000Z';
const digits = [...'0123456789'];
const template = { id: 'sample-template', name: 'Sample template', revision: 3, items: [
  { id: 'MC1', kind: 'mc', choices: ['A', 'B'] },
  { id: 'MC2', kind: 'mc', choices: ['A', 'B'] },
  { id: 'NR1', kind: 'nr', slots: [digits, ['.', ...digits], ['.', ...digits], digits] },
  { id: 'NR2', kind: 'nr', slots: [digits, ['.', ...digits], ['.', ...digits], digits] },
] };
const key = { id: 'synthetic-key', template, answers: { MC1: 'A', NR1: '4', NR2: '0' }, createdAt: timestamp };
const unused = { ...key, id: 'unused-key', answers: { MC1: 'B' } };
const scan = {
  id: 'synthetic-scan',
  label: '=TEST("①", "example")\nsecond line',
  batchId: 'synthetic-batch',
  template,
  keyId: key.id,
  createdAt: timestamp,
  updatedAt: timestamp,
  rescanOf: null,
  observation: {
    status: 'read',
    captureId: 'capture-a',
    items: [
      { id: 'MC1', kind: 'mc', status: 'single', rawText: 'A', review: false },
      { id: 'MC2', kind: 'mc', status: 'blank', rawText: null, review: false },
      { id: 'NR1', kind: 'nr', status: 'single', rawText: '004 ', review: false,
        slots: [...'004 '].map((symbol) => symbol === ' ' ? { status: 'blank', symbol: null } : { status: 'single', symbol }) },
      { id: 'NR2', kind: 'nr', status: 'blank', rawText: '    ', review: false,
        slots: Array.from({ length: 4 }, () => ({ status: 'blank', symbol: null })) },
    ],
  },
  history: [{ itemId: 'NR2', kind: 'correct', value: '0', at: timestamp }],
};
const record = { ...scan, grade: gradeScan(scan, key), photoStatus: 'deleted', photo: null };

// Independent RFC 4180-style reader for files with a required quoted field grammar.
function csvRows(csv) {
  const fields = /"((?:[^"]|"")*)"(?:(,)|(\r\n))/gy;
  const rows = [];
  let row = [];
  for (const [, value, separator, newline] of csv.matchAll(fields)) {
    row.push(value.replaceAll('""', '"'));
    if (newline) { rows.push(row); row = []; }
    assert(separator || newline);
  }
  assert.deepEqual(row, []);
  assert.equal(rows.map((items) => items.map((value) => `"${value.replaceAll('"', '""')}"`).join(',') + '\r\n').join(''), csv);
  return rows;
}

test('M4 exported CSV preserves literal slots, status, numeric score and quoted formula protection', () => {
  const [headers, ...rows] = csvRows(exportCsv([record]));
  assert.equal(rows.length, 4);
  const values = rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
  assert.equal(values[0].label, "'" + scan.label);
  assert.equal(values[0].score, '2');
  assert.equal(values[0].denominator, '3');
  assert.equal(values[0].pending, '1');
  assert.equal(values[0].grade_status, 'provisional');
  assert.deepEqual(values.map((row) => [row.question, row.raw, row.effective, row.item_status, row.item_pending, row.item_points]), [
    ['MC1', 'A', 'A', 'correct', 'false', '1'],
    ['MC2', '', '', 'unkeyed', 'false', '0'],
    ['NR1', '004 ', '004 ', 'pending', 'true', '0'],
    ['NR2', '    ', '0', 'correct', 'false', '1'],
  ]);
  for (const label of ['+1', '-1', '@SUM(A1)', '\tcell', '  =1']) {
    const rows = csvRows(exportCsv([{ ...record, label }]));
    assert.equal(rows[1][1], "'" + label);
  }
});

test('M4 JSON backup preserves keys, raw and corrected values, and checks photo bytes on restore', async () => {
  const bytes = await readFile(new URL('../app/reference/reference-filled.png', import.meta.url));
  const photo = new Blob([bytes], { type: 'image/png' });
  const retained = { ...record, photo, photoStatus: 'retained' };
  const serialized = await exportBackup({ keys: [key, unused], scans: [retained] });
  const json = JSON.parse(serialized);
  assert.equal(json.format, 'talus-scree-mark-backup');
  assert.equal(json.version, 1);
  assert.deepEqual(json.keys, [key, unused]);
  assert.equal(json.scans[0].observation.items[2].rawText, '004 ');
  assert.equal(json.scans[0].observation.items[3].rawText, '    ');
  assert.equal(json.scans[0].grade.items[3].effective, '0');
  assert.equal(json.scans[0].photo.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(Buffer.from(json.scans[0].photo.data, 'base64'), bytes);
  const restored = await parseBackup(serialized);
  const { photo: restoredPhoto, ...restoredAudit } = restored.scans[0];
  assert.deepEqual(restored.keys, [key, unused]);
  assert.deepEqual(Buffer.from(await restoredPhoto.arrayBuffer()), bytes);
  const { photo: _unusedPhoto, ...originalAudit } = retained;
  assert.deepEqual(restoredAudit, originalAudit);
  const deleted = await parseBackup(await exportBackup({ keys: [key], scans: [record] }));
  assert.deepEqual(deleted.scans, [record]);
});

test('M4 backup parser rejects version, references, grade and photographic corruption', async () => {
  const serialized = await exportBackup({ keys: [key], scans: [record] });
  for (const modify of [
    (data) => { data.version++; },
    (data) => { data.keys = []; },
    (data) => { data.scans.push(data.scans[0]); },
    (data) => { data.scans[0].grade.score = 99; },
    (data) => { data.scans[0].observation.items[2].slots[0].symbol = '8'; },
    (data) => { data.scans[0].photoStatus = 'retained'; },
    (data) => { data.scans[0].observation.status = 'retake'; },
    (data) => { data.scans[0].photo = { type: 'image/png', sha256: 'stale', data: 'iVBORw0KGgo=' }; },
  ]) {
    const invalid = JSON.parse(serialized);
    modify(invalid);
    await assert.rejects(parseBackup(JSON.stringify(invalid)));
  }
});

test('MC-only categories partition keyed points once and survive revisioned backup and CSV', async () => {
  const mc = { ...template, scope: 'mc-only', items: template.items.slice(0, 2) };
  const categories = {
    dimensions: [{ name: 'Level', values: ['DV', 'PR'] }, { name: 'Outcome', values: ['Lab', 'Model'] }],
    assignments: { MC1: ['DV', 'Lab'], MC2: ['PR', null] },
  };
  const firstKey = { ...key, template: mc, answers: { MC1: 'A', MC2: 'B' }, categories };
  const secondKey = { ...firstKey, id: 'next-revision',
    categories: { ...categories, assignments: { ...categories.assignments, MC1: ['PR', 'Model'] } } };
  const raw = { ...scan, template: mc, history: [], photoStatus: 'deleted', photo: null,
    observation: { ...scan.observation, items: [scan.observation.items[0],
      { ...scan.observation.items[1], status: 'multiple', review: true }] } };
  const provisional = gradeScan(raw, firstKey);
  assert.equal(provisional.score, 1);
  assert.equal(provisional.denominator, 2);
  assert.equal(provisional.pending, 1);
  const corrected = addDecision(raw, 'MC2', 'correct', 'B');
  const saved = { ...corrected, grade: gradeScan(corrected, firstKey) };
  for (const dimension of [1, 2, null]) {
    const buckets = saved.grade.categories.subtotals.filter((subtotal) => subtotal.dimension === dimension);
    assert.deepEqual(buckets.map(({ score, denominator, pending }) => [score, denominator, pending]), [[1, 1, 0], [1, 1, 0]]);
  }
  const csv = csvRows(exportCsv([saved]));
  const [heading, ...rows] = csv;
  const column = (key) => heading.indexOf(key);
  assert(rows.every((row) => row.length === heading.length && row[column('grading_scope')].includes('NR and WR excluded')));
  assert.equal(rows.filter((row) => row[column('row_type')] === 'intersection').length, 2);
  assert(rows.some((row) => row[column('category_2')] === '(Unassigned)'));
  const restored = await parseBackup(await exportBackup({ keys: [firstKey, secondKey], scans: [saved] }));
  assert.deepEqual(restored.scans, [saved]);
  assert.deepEqual(restored.keys, [firstKey, secondKey]);
  assert.deepEqual(saved.grade.items[0].categories, ['DV', 'Lab']);
  assert.deepEqual(gradeScan(saved, secondKey).items[0].categories, ['PR', 'Model']);
});
