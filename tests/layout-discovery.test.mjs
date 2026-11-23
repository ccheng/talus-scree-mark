import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverBlankLayout } from '../app/src/layout-discovery.js';
import { createMarkerlessProfile } from '../app/src/profile-authoring.js';
import { readProfileSheet } from '../app/src/profile-omr.js';
import { pageTransform } from '../app/src/markerless-registration.js';
import { invertProjective, project } from '../app/src/projective.js';

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

function weakEdgePhoto(image, background = 244, {
  turn = 0, mirror = false, duplicate = false, secondary = image,
} = {}) {
  const width = duplicate ? 1880 : turn % 2 ? 1720 : 1420;
  const height = duplicate ? 1250 : turn % 2 ? 1420 : 1720;
  const frame = duplicate ? [{ x: 45, y: 51 }, { x: 905, y: 51 }, { x: 905, y: 1160 }, { x: 45, y: 1160 }] : [
    { x: 108, y: 124 }, { x: 1327, y: 70 }, { x: 1308, y: 1536 }, { x: 105, y: 1659 },
  ];
  const corners = frame.map(({ x, y }) => {
    if (turn === 2) return { x: width - 1 - x, y: height - 1 - y };
    if (turn === 3) return { x: y, y: height - 1 - x };
    return { x, y };
  });
  const alternateCorners = duplicate === 'unequal' ? [
    { x: 1000, y: 207 }, { x: 1632, y: 166 }, { x: 1661, y: 980 }, { x: 1026, y: 968 },
  ] : corners.map(({ x, y }) => ({ x: x + 935, y }));
  const inverse = invertProjective(pageTransform(page, corners));
  const alternate = duplicate && invertProjective(pageTransform(page, alternateCorners));
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const second = alternate && x > 935;
      const point = project(second ? alternate : inverse, x, y);
      if (point && mirror) point.x = page.width - point.x;
      const inside = point && point.x >= 0 && point.y >= 0 && point.x <= page.width && point.y <= page.height;
      const at = 4 * (y * width + x);
      const source = inside && (!second || secondary)
        ? 4 * (Math.round(point.y * 2) * image.width + Math.round(point.x * 2)) : null;
      const value = source === null ? background : (second ? secondary : image).pixels[source];
      pixels[at] = pixels[at + 1] = pixels[at + 2] = value;
      pixels[at + 3] = 255;
    }
  }
  return { id: 'weak-edge-photo', width, height, pixels, corners, alternateCorners };
}

test('faint page edges recover a complete blank and a verified marked pose', () => {
  const proposal = discoverBlankLayout(weakEdgePhoto(syntheticBlank({ numeric: true })), page);
  assert.equal(proposal.status, 'proposed', JSON.stringify(proposal.issues));
  assert.equal(proposal.pagePose, 'faint-boundary');
  assert.deepEqual(proposal.components.map(({ kind }) => kind), ['mc', 'nr']);
  const profile = createMarkerlessProfile({ id: 'recovered-layout', revision: 1, name: 'Synthetic', page, components: proposal.components });
  const batch = { profileId: profile.id, revision: profile.revision };
  const result = readProfileSheet(weakEdgePhoto(syntheticBlank({ numeric: true, marks: true })), profile, { batch });
  assert.equal(result.status, 'read', JSON.stringify(result.registration.reasons));
  assert.equal(result.registration.cornerPath, 'bubble-fit');
  assert.equal(result.registration.diagnostics.orientation.status, 'verified');
  assert.deepEqual(result.items.map(({ rawText }) => rawText), ['B', null, null, null, null, null, '7   ']);

  const missing = readProfileSheet(weakEdgePhoto(syntheticBlank()), profile, { batch });
  assert.equal(missing.status, 'retake');
  assert.equal(missing.registration.diagnostics.responseGeometry.status, 'failed');
  assert.deepEqual(missing.items, []);
});

test('a full-frame pose with unreliable aspect and no visible edge cannot save a partial discovery', () => {
  const uncertain = discoverBlankLayout(weakEdgePhoto(syntheticBlank({ numeric: true }), 255), page);
  assert.equal(uncertain.status, 'review');
  assert.equal(uncertain.pagePose, 'uncertain');
  assert.deepEqual(uncertain.components, []);
});

test('printed outlines recover edge-free upside-down and sideways sheets when geometry is unique', () => {
  const proposal = discoverBlankLayout(syntheticBlank({ numeric: true }), page);
  const profile = createMarkerlessProfile({ id: 'edge-free', revision: 1, name: 'Synthetic', page, components: proposal.components });
  const batch = { profileId: profile.id, revision: profile.revision };
  const expected = ['B', null, null, null, null, null, '7   '];
  const marked = syntheticBlank({ numeric: true, marks: true });
  for (const turn of [2, 3]) {
    const result = readProfileSheet(weakEdgePhoto(marked, 255, { turn }), profile, { batch });
    assert.equal(result.status, 'read', JSON.stringify([...result.registration.reasons, turn]));
    assert.equal(result.registration.cornerPath, 'bubble-fit');
    assert.equal(result.registration.diagnostics.orientation.status, 'verified');
    assert(result.registration.geometry.blocks.every(({ verified }) => verified));
    assert.deepEqual(result.items.map(({ rawText }) => rawText), expected);
  }
  for (const source of [
    weakEdgePhoto(marked, 255, { turn: 2, mirror: true }),
    weakEdgePhoto(syntheticBlank({ marks: true }), 255, { turn: 3 }),
    weakEdgePhoto(marked, 255, { duplicate: true }),
  ]) {
    const result = readProfileSheet(source, profile, { batch });
    assert.equal(result.status, 'retake');
    assert.deepEqual(result.items, []);
  }
});

test('two separate complete sheets retake even when manual corners identify either sheet', () => {
  const blank = syntheticBlank({ numeric: true });
  const marked = syntheticBlank({ numeric: true, marks: true });
  const profile = createMarkerlessProfile({
    id: 'duplicates', revision: 1, name: 'Synthetic', page,
    components: discoverBlankLayout(blank, page).components,
  });
  const batch = { profileId: profile.id, revision: profile.revision };
  const duplicate = weakEdgePhoto(marked, 150, { duplicate: 'unequal', secondary: blank });
  for (const corners of [undefined, duplicate.corners, duplicate.alternateCorners]) {
    const result = readProfileSheet(duplicate, profile, { batch, corners });
    assert.equal(result.status, 'retake');
    assert.deepEqual(result.registration.reasons, ['multiple-sheets']);
    assert.equal(result.registration.canSetCorners, false);
    assert.deepEqual(result.items, []);
  }

  const single = weakEdgePhoto(marked, 150, { duplicate: 'unequal', secondary: null });
  const partial = weakEdgePhoto(marked, 150, { duplicate: 'unequal', secondary: syntheticBlank() });
  const expected = readProfileSheet(single, profile, { batch });
  const result = readProfileSheet(partial, profile, { batch });
  assert.equal(expected.status, 'read');
  assert.equal(result.status, 'read');
  assert.equal(result.items.length, 7);
  assert.deepEqual(result.items.map(({ id, rawText, status }) => [id, rawText, status]),
    expected.items.map(({ id, rawText, status }) => [id, rawText, status]));
});

test('a known profile can fit virtual corners when only margins are cropped', () => {
  const proposal = discoverBlankLayout(syntheticBlank({ numeric: true }), page);
  const profile = createMarkerlessProfile({
    id: 'margin-crop', revision: 1, name: 'Synthetic', page, components: proposal.components,
  });
  const batch = { profileId: profile.id, revision: profile.revision };
  const source = syntheticBlank({ numeric: true, marks: true });
  function crop(width) {
    const height = 1450;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const start = ((y + 112) * source.width + 18) * 4;
      pixels.set(source.pixels.subarray(start, start + width * 4), y * width * 4);
    }
    return { id: 'cropped', width, height, pixels };
  }
  const visible = readProfileSheet(crop(1160), profile, { batch });
  assert.equal(visible.status, 'read');
  assert.equal(visible.registration.cornerPath, 'virtual-corners');
  const { pagePose, responseGeometry } = visible.registration.diagnostics;
  assert(pagePose.corners.some(({ y }) => y < -1));
  assert(pagePose.witnesses.heldOut >= 4);
  assert.equal(pagePose.transform.length, 9);
  assert(responseGeometry.blocks.every(({ verified }) => verified));
  assert.deepEqual(visible.items.map(({ rawText }) => rawText), ['B', null, null, null, null, null, '7   ']);

  const clipped = readProfileSheet(crop(830), profile, { batch });
  assert.equal(clipped.status, 'retake');
  assert.equal(clipped.registration.diagnostics.responseGeometry.status, 'failed');
  assert(clipped.registration.diagnostics.pagePose.discarded.reason);
  assert.deepEqual(clipped.items, []);
});
