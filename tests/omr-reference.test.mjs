import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { referenceDigest, referenceProfile } from '../app/reference/profile.js';
import { inspectImage } from '../app/src/image.js';
import { readReferenceSheet, readReferenceWithGeometry } from '../app/src/omr.js';
import { fitProjective, invertProjective, project } from '../app/src/projective.js';
import { validReferenceProfile } from '../app/src/reference-contract.js';

const referenceFile = (name) => readFileSync(new URL(`../app/reference/${name}`, import.meta.url));
const example = JSON.parse(referenceFile('reference-key.json'));
const scale = 1.5;
const rectified = [scale, 0, 0, 0, scale, 0, 0, 0, 1];

function drawFixture({ readings = {}, adjustTag, duplicateTag, mirrored = false }) {
  const { page, anchors, discriminator, checks, items } = referenceProfile;
  const width = page.width * scale;
  const height = page.height * scale;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  function paint(x0, y0, x1, y1, ink, contains = () => true) {
    for (let y = Math.floor(y0 * scale); y < y1 * scale; y++) {
      for (let x = Math.floor(x0 * scale); x < x1 * scale; x++) {
        if (!contains((x + .5) / scale, (y + .5) / scale)) continue;
        const index = 4 * (y * width + (mirrored ? width - 1 - x : x));
        pixels[index] = pixels[index + 1] = pixels[index + 2] = ink;
      }
    }
  }

  function drawTag(tag) {
    const { x, y, size, code } = tag;
    const cell = size / 6;
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 6; column++) {
        if (row > 0 && row < 5 && column > 0 && column < 5 && code[row - 1][column - 1] !== '1') continue;
        const left = x - size / 2 + column * cell;
        const top = y - size / 2 + row * cell;
        paint(left, top, left + cell, top + cell, 12, (u, v) => u >= left && u < left + cell && v >= top && v < top + cell);
      }
    }
  }

  function drawBubble({ x, y, radius }, mark) {
    const edge = radius + .38;
    if (mark === 'occlude') return;
    paint(x - edge, y - edge, x + edge, y + edge, 15, (u, v) => Math.abs(Math.hypot(u - x, v - y) - radius) <= .38);
    if (typeof mark === 'number') {
      paint(x - radius, y - radius, x + radius, y + radius, mark, (u, v) => Math.hypot(u - x, v - y) <= radius * .87);
    }
  }

  for (const tag of [...anchors, discriminator]) drawTag(adjustTag ? adjustTag(tag) : tag);
  if (duplicateTag) drawTag({ ...anchors[0], x: 438, y: 273 });
  for (const { x, y, radius } of checks) {
    paint(x - radius, y - radius, x + radius, y + radius, 15, (u, v) => Math.hypot(u - x, v - y) <= radius);
  }
  for (const item of items) {
    const groups = item.kind === 'mc' ? [{ id: item.id, choices: item.choices }] : item.slots;
    for (const group of groups) {
      for (const option of group.choices) drawBubble(option, readings[group.id]?.[option.symbol]);
    }
  }
  return { id: 'generated-m2-development', width, height, pixels };
}

function exampleMarks() {
  const marks = {};
  for (const item of referenceProfile.items) {
    const { rawText } = example.items[item.id];
    if (item.kind === 'mc') {
      if (rawText) marks[item.id] = { [rawText]: 22 };
    } else {
      item.slots.forEach(({ id }, index) => {
        if (rawText[index] !== ' ') marks[id] = { [rawText[index]]: 22 };
      });
    }
  }
  return marks;
}

test('reference assets publish a single Letter profile, verified digest and literal key', () => {
  const source = referenceFile('profile.json');
  assert.equal(createHash('sha256').update(source).digest('hex'), referenceDigest);
  assert.equal(referenceFile('profile.sha256').toString(), `${referenceDigest}  profile.json\n`);
  assert.deepEqual(JSON.parse(source), referenceProfile);
  assert(validReferenceProfile(referenceProfile));
  assert.equal(example.profile.sha256, referenceDigest);
  assert.equal(referenceProfile.items.length, 16);
  assert.deepEqual(Object.keys(example.items), referenceProfile.items.map(({ id }) => id));
  assert.equal(example.items.NR1.rawText, '5.3 ');
  for (const file of ['reference-blank.pdf', 'reference-filled.pdf']) {
    assert.match(referenceFile(file).toString(), /\/MediaBox \[0 0 612 792\]/);
  }
  assert.deepEqual(inspectImage(referenceFile('reference-filled.png')), { type: 'image/png', width: 1700, height: 2200 });
  const invalid = structuredClone(referenceProfile);
  invalid.items[0].choices[0].x = -5;
  assert.equal(validReferenceProfile(invalid), false);
});

test('projective mapping recovers corresponding corners and inverse and rejects a collinear fit', () => {
  const from = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 800 }, { x: 0, y: 800 }];
  const to = [{ x: 226, y: 109 }, { x: 1315, y: 196 }, { x: 1490, y: 1925 }, { x: 62, y: 1580 }];
  const matrix = fitProjective(from, to);
  const inverse = invertProjective(matrix);
  for (let index = 0; index < 4; index++) {
    const mapped = project(matrix, from[index].x, from[index].y);
    const restored = project(inverse, mapped.x, mapped.y);
    assert(Math.hypot(mapped.x - to[index].x, mapped.y - to[index].y) < 1e-8);
    assert(Math.hypot(restored.x - from[index].x, restored.y - from[index].y) < 1e-8);
  }
  const collinear = from.map(({ x }) => ({ x, y: 0 }));
  assert.equal(fitProjective(collinear, to), null);
});

test('coded registration and region recognition recover the literal reference example', () => {
  const result = readReferenceSheet(drawFixture({ readings: exampleMarks() }));
  assert.equal(result.status, 'read', JSON.stringify(result.registration.reasons));
  assert.equal(result.captureId, 'generated-m2-development');
  assert.equal(result.profile.sha256, referenceDigest);
  assert(result.registration.checks.every(({ displacement }) => displacement < .6));
  for (const item of result.items) {
    assert.deepEqual({ status: item.status, rawText: item.rawText }, example.items[item.id], item.id);
    assert.equal(item.review, false, item.id);
  }
});

test('a one-bit wrong identity, duplicate anchor, or mirrored sheet yields only a retake', () => {
  const wrongIdentity = (tag) => tag.id === referenceProfile.discriminator.id
    ? { ...tag, code: [`${tag.code[0][0] === '0' ? '1' : '0'}${tag.code[0].slice(1)}`, ...tag.code.slice(1)] }
    : tag;
  for (const [options, reason] of [
    [{ adjustTag: wrongIdentity }, 'layout-identity'],
    [{ duplicateTag: true }, 'ambiguous-anchor'],
    [{ mirrored: true }, 'mirrored-registration'],
  ]) {
    const result = readReferenceSheet(drawFixture(options));
    assert.equal(result.status, 'retake');
    assert.deepEqual(result.registration.reasons, [reason]);
    assert.deepEqual(result.items, []);
  }
});

test('oracle geometry separates ambiguous, double, blank and unreadable and preserves partial NR evidence', () => {
  const readings = {
    ...exampleMarks(),
    MC1: { A: 20, C: 20 },
    MC2: { D: 220 },
    MC3: { A: 22, B: 'occlude' },
    MC4: {},
    'NR2.1': { 1: 22 }, 'NR2.2': {}, 'NR2.3': { 3: 22 }, 'NR2.4': { 0: 22 },
    'NR3.1': { 2: 22 }, 'NR3.2': { '.': 22 }, 'NR3.3': { '.': 22 }, 'NR3.4': { 8: 22 },
    'NR4.2': { 0: 22, 7: 22 },
  };
  const items = new Map(readReferenceWithGeometry(drawFixture({ readings }), rectified).map((item) => [item.id, item]));
  for (const [id, status, rawText, review] of [
    ['MC1', 'multiple', null, true], ['MC2', 'ambiguous', null, true],
    ['MC3', 'unreadable', null, true], ['MC4', 'blank', null, false],
    ['NR1', 'single', '5.3 ', false], ['NR2', 'single', '1 30', true],
    ['NR3', 'single', '2..8', true], ['NR4', 'multiple', null, true],
  ]) {
    const { status: observed, rawText: literal, review: reviewRequired } = items.get(id);
    assert.deepEqual([observed, literal, reviewRequired], [status, rawText, review], id);
  }
  assert.deepEqual(items.get('NR4').slots.map(({ symbol }) => symbol), ['3', null, '0', '8']);
});
