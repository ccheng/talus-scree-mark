import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDecision, gradeScan, normalizeAnswer, validateKey } from '../app/src/grading.js';

const digits = [...'0123456789'];
const mc = ['A', 'B', 'C', 'D'];
const template = {
  id: 'synthetic-layout',
  revision: 2,
  name: 'Synthetic assessment',
  items: [
    ...['MC1', 'MC2', 'MC3', 'MC4'].map((id) => ({ id, kind: 'mc', choices: mc })),
    ...['NR1', 'NR2', 'NR3'].map((id) => ({ id, kind: 'nr', slots: [digits, ['.', ...digits], ['.', ...digits], digits] })),
  ],
};
const raw = [
  { id: 'MC1', kind: 'mc', status: 'single', rawText: 'A', review: false },
  { id: 'MC2', kind: 'mc', status: 'blank', rawText: null, review: false },
  { id: 'MC3', kind: 'mc', status: 'ambiguous', rawText: null, review: true, reasons: ['competing-mark'] },
  { id: 'MC4', kind: 'mc', status: 'single', rawText: 'D', review: false },
  ...['7.00', '0.14', '004 '].map((literal, index) => ({
    id: `NR${index + 1}`, kind: 'nr', status: 'single', rawText: literal, review: false,
    slots: [...literal].map((symbol) => ({ status: symbol === ' ' ? 'blank' : 'single', symbol: symbol === ' ' ? null : symbol })),
  })),
];
const key = { id: 'key-v1', template, answers: { MC1: 'A', MC2: 'B', MC3: 'C', NR1: '7', NR2: '0.15', NR3: '4' } };
const scan = { id: 'audit-sheet', template, keyId: key.id, observation: { items: raw }, history: [], photo: null };
const grade = (value) => gradeScan(value, key);
const summary = ({ score, denominator, pending, status }) => ({ score, denominator, pending, status });
const lookup = ({ items }, id) => items.find((item) => item.id === id);

test('M4 exact numerical comparison applies left alignment, configured slots and leading-zero formatting', () => {
  const item = template.items.find(({ id }) => id === 'NR1');
  for (const [literal, value] of [['7.00', '7'], ['0', '0'], ['0.10', '0.1'], ['0.01', '0.01'], ['3.5 ', '3.5'], ['1234', '1234']]) {
    assert.deepEqual(normalizeAnswer(item, literal), { status: 'valid', value }, literal);
  }
  assert.deepEqual(normalizeAnswer(item, '    '), { status: 'blank', value: null });
  for (const literal of ['004 ', '03.5', '01', ' 3.5', '.5', '2 5', '2..5', '123.', '1.234', '2e1', '-.5', 42]) {
    assert.equal(normalizeAnswer(item, literal).status, 'invalid', String(literal));
  }
  const restricted = { ...item, slots: [digits, digits, ['.', ...digits], digits] };
  assert.equal(normalizeAnswer(restricted, '0.25').status, 'invalid');
  assert.deepEqual(normalizeAnswer(restricted, '23.7'), { status: 'valid', value: '23.7' });
});

test('M4 mixed scoring counts keyed denominators while preserving unresolved and literal NR evidence', () => {
  const result = grade(scan);
  assert.deepEqual(summary(result), { score: 2, denominator: 6, pending: 2, status: 'provisional' });
  assert.deepEqual(result.items.map(({ id, status, points }) => [id, status, points]), [
    ['MC1', 'correct', 1], ['MC2', 'incorrect', 0], ['MC3', 'pending', 0], ['MC4', 'unkeyed', 0],
    ['NR1', 'correct', 1], ['NR2', 'incorrect', 0], ['NR3', 'pending', 0],
  ]);
  assert.equal(lookup(result, 'NR1').raw, '7.00');
  assert.equal(lookup(result, 'NR3').raw, '004 ');
  assert.deepEqual(scan.observation.items.at(-1).slots.map(({ symbol }) => symbol), ['0', '0', '4', null]);
  const resolved = { ...scan, observation: { items: raw.filter(({ id }) => !['MC3', 'NR3'].includes(id)) },
    template: { ...template, items: template.items.filter(({ id }) => !['MC3', 'NR3'].includes(id)) } };
  assert.deepEqual(summary(gradeScan(resolved, { ...key, template: resolved.template, answers: {} })),
    { score: 0, denominator: 0, pending: 0, status: 'final' });
});

test('M4 records corrections, award and deny with reversible per-item history and immutable observations', () => {
  const initialRaw = structuredClone(scan.observation);
  const reviewed = addDecision(scan, 'MC3', 'correct', 'C');
  assert.deepEqual(summary(grade(reviewed)), { score: 3, denominator: 6, pending: 1, status: 'provisional' });
  assert.equal(lookup(grade(reviewed), 'MC3').effective, 'C');
  const awarded = addDecision(reviewed, 'NR3', 'award');
  assert.deepEqual(summary(grade(awarded)), { score: 4, denominator: 6, pending: 0, status: 'final' });
  assert.equal(lookup(grade(awarded), 'NR3').raw, '004 ');
  const denied = addDecision(awarded, 'NR3', 'deny');
  assert.deepEqual(summary(grade(denied)), { score: 3, denominator: 6, pending: 0, status: 'final' });
  const revertDeny = addDecision(denied, 'NR3', 'undo');
  assert.equal(lookup(grade(revertDeny), 'NR3').adjudication, 'award');
  const revertAward = addDecision(revertDeny, 'NR3', 'undo');
  assert.equal(lookup(grade(revertAward), 'NR3').status, 'pending');
  const allReverted = addDecision(revertAward, 'MC3', 'undo');
  assert.deepEqual(grade(allReverted), grade(scan));
  assert.deepEqual(awarded.observation, initialRaw);
  assert.equal(scan.history.length, 0);
  assert.equal(allReverted.history.length, 6);
  assert(allReverted.history.every(({ at }) => !Number.isNaN(Date.parse(at))));
  assert.throws(() => addDecision(scan, 'MC3', 'correct', 'E'));
  assert.throws(() => addDecision(scan, 'NR1', 'correct', '004 '));
});

test('M4 validates sparse keys and rejects unknown items or incompatible template revisions', () => {
  assert.deepEqual(validateKey(template, key.answers), key.answers);
  assert.deepEqual(validateKey(template, {}), {});
  for (const answers of [{ Missing: 'A' }, { MC1: 'E' }, { NR1: '004 ' }, { NR2: '    ' }, ['A']]) {
    assert.throws(() => validateKey(template, answers));
  }
  assert.throws(() => gradeScan(scan, { ...key, template: { ...template, revision: 3 } }));
  const incompatible = { ...template, items: [{ ...template.items[0], choices: ['Q', 'R'] }, ...template.items.slice(1)] };
  assert.throws(() => gradeScan(scan, { ...key, template: incompatible }));
});
