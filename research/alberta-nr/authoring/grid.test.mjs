import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teacherGrid, validateResearchMapping } from './grid.mjs';

const region = { x: 82, y: 90, width: 76, height: 158 };
const anchors = [{ x: 92, y: 110 }, { x: 146, y: 110 }, { x: 92, y: 236 }, { x: 110, y: 96 }];

test('four anchors recover the ordinary grid even when automatic detection returned no proposal', () => {
  const slots = teacherGrid(anchors, region, null);
  assert.equal(slots.flatMap(({ choices }) => choices).length, 42);
  assert.deepEqual(slots.map(({ choices }) => choices[0].symbol), ['0', '.', '.', '0']);
  assert.deepEqual(slots[2].choices[0], { symbol: '.', x: 128, y: 96, radius: 5.04, observed: false });
});

test('a teacher fit preserves observed positions and refuses contradictory geometry', () => {
  const initial = teacherGrid(anchors, region);
  const observed = initial[3].choices[4];
  observed.x += .7;
  observed.observed = true;
  const updated = teacherGrid(anchors, region, initial);
  assert.deepEqual(updated[3].choices[4], observed);
  updated[3].choices[4].y = updated[3].choices[5].y;
  assert.throws(() => validateResearchMapping(updated, region), /overlap/);
  observed.x -= 6;
  assert.throws(() => teacherGrid(anchors, region, initial), /conflicts with detected bubbles/);
});
