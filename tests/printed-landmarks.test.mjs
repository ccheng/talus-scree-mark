import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPrintedLandmarks, enrollPrintedLandmarks } from '../app/src/printed-landmarks.js';

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const page = { width: 220, height: 235 };
const components = [{ id: 'MC', kind: 'mc', bounds: { x: 88, y: 70, width: 54, height: 95 } }];

function blank() {
  const { width, height } = page;
  const values = new Uint8Array(width * height).fill(244);
  for (const y of [59, 170]) {
    for (let dy = 0; dy < 2; dy++) {
      for (let x = 52; x < 165; x++) values[(y + dy) * width + x] = 23;
    }
    for (let row = y - 30; row <= y; row++) {
      values[row * width + 52] = 23;
      values[row * width + 53] = 23;
    }
  }
  return { width, height, values };
}

test('landmarks corroborate or veto a local shift only when independently localized', () => {
  const gray = blank();
  const printedLandmarks = enrollPrintedLandmarks(gray, identity, page, components);
  assert(printedLandmarks.length >= 2);
  const profile = { page, components, printedLandmarks };
  const pose = { pageToSource: identity, refined: [{ id: 'MC', dx: 0, dy: 0 }] };
  assert.equal(checkPrintedLandmarks(gray, profile, pose).status, 'corroborated');
  pose.refined[0].dx = 5;
  assert.equal(checkPrintedLandmarks(gray, profile, pose).status, 'incompatible');
  assert.equal(checkPrintedLandmarks(gray, { ...profile, printedLandmarks: printedLandmarks.slice(0, 1) }, pose).status, 'insufficient');
  const faded = { ...gray, values: gray.values.map(() => 230) };
  assert.equal(checkPrintedLandmarks(faded, profile, pose).status, 'insufficient');
  assert.equal(checkPrintedLandmarks(gray, { page, components }, pose).status, 'unavailable');
});
