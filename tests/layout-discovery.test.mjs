import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverBlankLayout } from '../app/src/layout-discovery.js';
import { conflictingResponseIds, createMarkerlessProfile, renumberProfileBlock } from '../app/src/profile-authoring.js';
import { measureNumericalBlankInk, readBubbleRegions } from '../app/src/marks.js';
import { toGrayImage } from '../app/src/omr-image.js';
import { profileRecord } from '../app/src/profile-store.js';
import { readProfileSheet } from '../app/src/profile-omr.js';
import { pageTransform } from '../app/src/markerless-registration.js';
import { invertProjective, project } from '../app/src/projective.js';

const page = { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' };

function syntheticBlank({
  missing = false, marks = false, numeric = false, digitInk = false, tallBoxes = false, mcRadius = 3.4, answer, rival,
} = {}) {
  const width = 1225, height = 1585;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  function paint(x0, y0, x1, y1, contains, level = 22) {
    for (let y = Math.floor(y0 * 2); y <= y1 * 2; y++) {
      for (let x = Math.floor(x0 * 2); x <= x1 * 2; x++) {
        if (!contains(x / 2, y / 2)) continue;
        const start = 4 * (y * width + x);
        pixels[start] = pixels[start + 1] = pixels[start + 2] = Math.min(pixels[start], level);
      }
    }
  }
  function ring(x, y, filled = false, radius = 3.4) {
    const spread = radius + .6;
    paint(x - spread, y - spread, x + spread, y + spread, (px, py) => {
      const d = Math.hypot(x - px, y - py);
      return Math.abs(d - radius) < .57 || (filled && d < radius);
    });
  }
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 4; column++) {
      if (missing && row === 2 && column === 3) continue;
      ring(92 + column * 24, 202 + row * 19, marks && row === 0 && column === 1, mcRadius);
    }
  }
  if (numeric) {
    for (let pos = 0; pos < 4; pos++) {
      const x = 367 + pos * 24;
      const halfWidth = tallBoxes ? 12 : 8;
      const left = x - halfWidth, right = x + halfWidth;
      const top = tallBoxes ? 388 : 413;
      const bottom = tallBoxes ? 422 : 426;
      paint(left, top, right, bottom, (px, py) => px - left < 1 || right - px < 1 || py - top < 1 || bottom - py < 1);
      function numericChoice(symbol, y) {
        ring(x, y, (marks && pos === 0 && symbol === '7') || answer?.[pos] === symbol);
        if (digitInk && symbol !== '.') {
          // Compact interior strokes leave a real circle separate from the glyph.
          paint(x - 1.7, y - 1.7, x + 1.7, y + 1.7, (px, py) =>
            Math.abs(px - x) <= .44 || (Math.abs(py - y) < .45 && px < x), 50);
        }
        if (rival?.position === pos && rival.symbol === symbol) {
          paint(x - 2.5, y - 2.5, x + 2.5, y + 2.5, (px, py) => Math.hypot(px - x, py - y) < 2.5, rival.level);
        }
      }
      for (let digit = 0; digit < 10; digit++) numericChoice(String(digit), 447 + digit * 10);
      if (pos === 1 || pos === 2) numericChoice('.', 547);
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

test('printed numerical centers supply a blank baseline without masking marks or reviews', () => {
  const blank = syntheticBlank({ numeric: true, digitInk: true });
  const proposal = discoverBlankLayout(blank, page);
  assert.equal(proposal.status, 'proposed');
  const matrix = pageTransform(page, proposal.corners);
  const components = measureNumericalBlankInk(toGrayImage(blank), matrix, proposal.components);
  const [mc, nr] = components;
  assert.deepEqual(mc, proposal.components[0]);
  assert(nr.items[0].slots.every(({ choices }) => choices.filter(({ blankInk }) => blankInk !== undefined).length === 10));
  const profile = createMarkerlessProfile({ id: 'digit-baseline', revision: 1, name: 'Synthetic', page, components });
  const persisted = profileRecord(profile);
  const [item] = persisted.components[1].items;
  assert.deepEqual(item.slots, nr.items[0].slots);
  const inspect = (image) => readBubbleRegions(toGrayImage(image), matrix, [item])[0];
  assert.equal(inspect(blank).rawText, '    ');
  for (const answer of ['0.25', '23.7']) {
    const found = inspect(syntheticBlank({ numeric: true, digitInk: true, answer }));
    assert.equal(found.rawText, answer);
    assert.equal(found.review, false);
  }
  for (const [level, expected] of [[195, 'ambiguous'], [22, 'multiple']]) {
    const found = inspect(syntheticBlank({ numeric: true, digitInk: true, answer: '1842',
      rival: { position: 1, symbol: '.', level } }));
    assert.equal(found.status, expected);
    assert.equal(found.rawText, null);
    assert.equal(found.review, true);
  }
  const older = readBubbleRegions(toGrayImage(blank), matrix, proposal.components[1].items)[0];
  assert.notEqual(older.status, 'blank');
  assert.equal('blankInk' in proposal.components[0].items[0].choices[0], false);
});

test('block renumbering changes saved IDs, preserves mappings and rejects cross-block collisions', () => {
  const blank = syntheticBlank({ numeric: true, digitInk: true });
  const proposal = discoverBlankLayout(blank, page);
  const components = measureNumericalBlankInk(toGrayImage(blank), pageTransform(page, proposal.corners), proposal.components);
  const [mc, nr] = components;
  const first = renumberProfileBlock(page, components, mc.id, 24);
  assert.deepEqual(first[0].items.map(({ id }) => id), ['MC24', 'MC25', 'MC26', 'MC27', 'MC28', 'MC29']);
  assert.deepEqual(first[0].items.map(({ id, ...item }) => item), mc.items.map(({ id, ...item }) => item));
  const final = renumberProfileBlock(page, first, nr.id, 7);
  assert.equal(final[1].items[0].id, 'NR7');
  assert.deepEqual(final[1].items[0].slots.map(({ id }) => id), ['NR7.1', 'NR7.2', 'NR7.3', 'NR7.4']);
  assert.deepEqual(final[1].items[0].slots.map(({ choices }) => choices), nr.items[0].slots.map(({ choices }) => choices));
  assert.equal(components[0].items[0].id, 'MC1');
  const moved = ({ y, ...bounds }) => ({ ...bounds, y: y + 350 });
  const other = { ...mc, id: 'other-mc', bounds: moved(mc.bounds), items: mc.items.map((item, index) => ({
    ...item, id: `MC${24 + index}`, bounds: moved(item.bounds), choices: item.choices.map(moved),
  })) };
  assert.throws(() => renumberProfileBlock(page, [...components, other], mc.id, 24), /identifiers must be unique/);
});

test('blank discovery keeps tall shared writing boxes and larger adjacent MC outlines', () => {
  const blank = syntheticBlank({ numeric: true, digitInk: true, tallBoxes: true, mcRadius: 7.15 });
  const proposal = discoverBlankLayout(weakEdgePhoto(blank, 154), page);
  assert.equal(proposal.status, 'proposed', JSON.stringify(proposal.issues));
  const [mc, nr] = proposal.components;
  assert.equal(mc.items.length, 6);
  assert(mc.items.every(({ choices }) => choices.length === 4));
  assert.equal(proposal.diagnostics[1].writingBoxes.length, 4);
  assert(proposal.diagnostics[1].writingBoxes.every(({ height }) => height > 29));
  assert.deepEqual(nr.items[0].slots.map(({ choices }) => choices.length), [10, 11, 11, 10]);
});

test('draft ranges can swap by holding duplicates until the next edit', () => {
  const proposal = discoverBlankLayout(syntheticBlank({ numeric: true }), page);
  const [mc, nr] = proposal.components;
  const offset = ({ y, ...fields }) => ({ ...fields, y: y + 350 });
  const second = { ...mc, id: 'second-mc', bounds: offset(mc.bounds), items: mc.items.map((item, i) => ({
    ...item, id: `MC${7 + i}`, bounds: offset(item.bounds), choices: item.choices.map(offset),
  })) };
  const source = [mc, nr, second];
  const draft = renumberProfileBlock(page, source, mc.id, 7, { draft: true });
  assert.deepEqual([...conflictingResponseIds(draft)], second.items.map(({ id }) => id));
  const validate = (components) => createMarkerlessProfile({ id: 'swap', name: 'Synthetic', revision: 1, page, components });
  assert.throws(() => validate(draft), /identifiers must be unique/);
  const updated = renumberProfileBlock(page, draft, second.id, 1, { draft: true });
  assert.equal(conflictingResponseIds(updated).size, 0);
  const stored = profileRecord(validate(updated));
  assert.deepEqual(stored.components[0].items.map(({ id }) => id), second.items.map(({ id }) => id));
  assert.deepEqual(stored.components[2].items.map(({ id }) => id), mc.items.map(({ id }) => id));
  assert.deepEqual(stored.components[0].items.map(({ choices }) => choices), mc.items.map(({ choices }) => choices));
  assert.deepEqual(stored.components[2].items.map(({ choices }) => choices), second.items.map(({ choices }) => choices));
  assert.equal(source[0].items[0].id, 'MC1');
});
