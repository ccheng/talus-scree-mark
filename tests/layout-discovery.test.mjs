import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverBlankLayout } from '../app/src/layout-discovery.js';
import { createMarkerlessProfile } from '../app/src/profile-authoring.js';
import { readProfileSheet } from '../app/src/profile-omr.js';

const page = { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' };

function syntheticBlank({ missing = false, marks = false, numeric = false } = {}) {
  const width = 1225, height = 1585;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  function paint(x0, y0, x1, y1, contains) {
    for (let y = Math.floor(y0 * 2); y <= y1 * 2; y++) {
      for (let x = Math.floor(x0 * 2); x <= x1 * 2; x++) {
        if (!contains(x / 2, y / 2)) continue;
        const start = 4 * (y * width + x);
        pixels[start] = pixels[start + 1] = pixels[start + 2] = 22;
      }
    }
  }
  function ring(x, y, filled = false) {
    paint(x - 4, y - 4, x + 4, y + 4, (px, py) => {
      const d = Math.hypot(x - px, y - py);
      return Math.abs(d - 3.4) < .57 || (filled && d < 3.4);
    });
  }
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 4; column++) {
      if (missing && row === 2 && column === 3) continue;
      ring(92 + column * 24, 202 + row * 19, marks && row === 0 && column === 1);
    }
  }
  if (numeric) {
    for (let pos = 0; pos < 4; pos++) {
      const x = 367 + pos * 24;
      const left = x - 8, right = x + 8, top = 413, bottom = 426;
      paint(left, top, right, bottom, (px, py) => px - left < 1 || right - px < 1 || py - top < 1 || bottom - py < 1);
      for (let digit = 0; digit < 10; digit++) ring(x, 447 + digit * 10, marks && pos === 0 && digit === 7);
      if (pos === 1 || pos === 2) ring(x, 547);
    }
  }
  return { id: 'synthetic-layout', width, height, pixels };
}

test('discovers a whole-sheet MC grid and a boxed NR grid with lower decimal positions', () => {
  const proposal = discoverBlankLayout(syntheticBlank({ numeric: true }), page);
  assert.equal(proposal.status, 'proposed', JSON.stringify(proposal.issues));
  assert.equal(proposal.corners.length, 4);
  const [mc, nr] = proposal.components;
  assert.deepEqual(proposal.components.map(({ kind }) => kind), ['mc', 'nr']);
  assert.deepEqual(mc.items.map(({ id }) => id), ['MC1', 'MC2', 'MC3', 'MC4', 'MC5', 'MC6']);
  assert.equal(proposal.diagnostics[1].writingBoxes.length, 4);
  assert.equal(proposal.diagnostics[1].mappingReview, true);
  assert.deepEqual(nr.items[0].slots.map(({ choices }) => choices.map(({ symbol }) => symbol).join('')), [
    '0123456789', '0123456789.', '0123456789.', '0123456789',
  ]);
  const profile = createMarkerlessProfile({ id: 'layout', revision: 1, name: 'Synthetic', page, components: proposal.components });
  const result = readProfileSheet(syntheticBlank({ numeric: true, marks: true }), profile,
    { batch: { profileId: 'layout', revision: 1 } });
  assert.equal(result.status, 'read');
  assert.deepEqual(result.items.map(({ rawText }) => rawText), ['B', null, null, null, null, null, '7   ']);
});

test('a missing bubble in a repeated row is exposed for teacher review', () => {
  const proposal = discoverBlankLayout(syntheticBlank({ missing: true }), page);
  assert.equal(proposal.status, 'review');
  assert(proposal.issues.includes('interrupted-grid'));
});

test('invalid or reversed corners cannot create an automatic proposal', () => {
  const corners = [{ x: 10, y: 10 }, { x: 10, y: 700 }, { x: 600, y: 700 }, { x: 600, y: 10 }];
  assert.equal(discoverBlankLayout(syntheticBlank(), page, corners).status, 'needs-corners');
});
