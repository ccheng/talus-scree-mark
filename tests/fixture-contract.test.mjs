import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const fixtureUrl = new URL('./fixtures/synthetic-recognition-v1.json', import.meta.url);
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
const { source, recognition, evidence, corrections } = fixture;
const fieldsById = new Map(recognition.fields.map((field) => [field.id, field]));
const evidenceById = new Map(evidence.map((region) => [region.id, region]));

test('synthetic labels identify a source and bounded evidence for each field', () => {
  assert.equal(fixture.fixtureVersion, 1);
  assert.equal(source.kind, 'synthetic-labels');
  assert.equal(recognition.sourceId, source.id);
  assert.equal(fieldsById.size, recognition.fields.length);
  assert.equal(evidenceById.size, evidence.length);
  assert.equal(fieldsById.get('MC1').kind, 'mc');
  assert.equal(fieldsById.get('MC1').rawText, 'C');

  for (const field of recognition.fields) {
    const region = evidenceById.get(field.evidenceId);
    assert.ok(region, `Missing evidence for ${field.id}`);
    assert.equal(region.sourceId, source.id);
    assert.equal(region.box.length, 4);
    assert.ok(region.box.every(Number.isFinite), `Invalid evidence box for ${field.id}`);
    const [left, top, width, height] = region.box;
    assert.ok(left >= 0 && top >= 0 && width > 0 && height > 0);
    assert.ok(left + width <= 1 && top + height <= 1);
  }
});

test('recognized NR labels preserve exact strings and all four positions', () => {
  assert.equal(fieldsById.get('NR1').rawText, '03.0');
  assert.deepEqual(fieldsById.get('NR1').slots, ['0', '3', '.', '0']);
  assert.equal(fieldsById.get('NR2').rawText, ' 7.2');
  assert.deepEqual(fieldsById.get('NR2').slots, [null, '7', '.', '2']);

  for (const field of recognition.fields.filter((item) => item.kind === 'nr')) {
    assert.equal(field.slots.length, 4, field.id);
    if (field.status === 'recognized') {
      assert.equal(field.rawText, field.slots.map((symbol) => symbol ?? ' ').join(''));
    }
  }
});

test('blank and unresolved labels retain distinct states without an asserted answer', () => {
  const expectedStatuses = {
    NR3: 'blank',
    NR4: 'ambiguous',
    NR5: 'multiple',
    NR6: 'unreadable',
  };
  for (const [fieldId, expectedStatus] of Object.entries(expectedStatuses)) {
    const field = fieldsById.get(fieldId);
    assert.equal(field.status, expectedStatus, fieldId);
    assert.equal(field.rawText, null, fieldId);
  }
  assert.deepEqual(fieldsById.get('NR3').slots, [null, null, null, null]);
});

test('a correction retains links to the original unresolved observation', () => {
  assert.equal(corrections.length, 1);
  const [correction] = corrections;
  const field = fieldsById.get(correction.fieldId);
  assert.equal(correction.recognitionId, recognition.id);
  assert.equal(correction.fieldId, 'NR4');
  assert.equal(correction.evidenceId, field.evidenceId);
  assert.equal(correction.replacementText, '12.3');
  assert.ok(correction.reason);
  assert.equal(field.status, 'ambiguous');
  assert.equal(field.rawText, null);
  assert.deepEqual(field.slots, ['1', '2', null, '3']);
});
