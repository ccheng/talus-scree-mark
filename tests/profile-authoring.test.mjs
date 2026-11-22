import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capturePrintedFeatures, pageTransform } from '../app/src/markerless-registration.js';
import { createMarkerlessProfile, manualGrid, proposeGrid } from '../app/src/profile-authoring.js';
import { readProfileSheet } from '../app/src/profile-omr.js';

const page = { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' };
const region = { x: 168, y: 225, width: 180, height: 93 };
const grid = manualGrid({
  topLeft: { x: 190, y: 247 }, topRight: { x: 324, y: 247 }, bottomLeft: { x: 190, y: 292 },
  rows: 3, columns: 4, radius: 4,
});
const blocks = [{
  id: 'block-1', kind: 'mc', bounds: region,
  items: [0, 1, 2].map((row) => ({
    id: `Q${row + 1}`, kind: 'mc', bounds: { x: 179, y: 239 + row * 22.5, width: 156, height: 15 },
    choices: grid.cells.filter((cell) => cell.row === row).map((cell) => ({ ...cell, symbol: 'ABCD'[cell.column] })),
  })),
}];
const featureRegions = [
  { x: 83, y: 81, width: 42, height: 39 },
  { x: 400, y: 115, width: 42, height: 39 },
  { x: 101, y: 480, width: 42, height: 39 },
  { x: 422, y: 518, width: 42, height: 39 },
  { x: 250, y: 695, width: 42, height: 39 },
];
const corners = [{ x: 0, y: 0 }, { x: 1224, y: 0 }, { x: 1224, y: 1584 }, { x: 0, y: 1584 }];
const matrix = pageTransform(page, corners);
const inkCodes = [
  ['101000', '100010', '111000', '101101', '101100', '111001'],
  ['101100', '110100', '010111', '110110', '101010', '110101'],
  ['101100', '010100', '011111', '110100', '101001', '110110'],
  ['111110', '100000', '111010', '010100', '110011', '010110'],
  ['101000', '101010', '100110', '101001', '100101', '111000'],
];

function syntheticImage({ filled = false, changeIdentity = false } = {}) {
  const width = 1225, height = 1585;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  function paint(x0, y0, widthPt, heightPt, covered = () => true) {
    for (let y = Math.floor(y0 * 2); y < (y0 + heightPt) * 2; y++) {
      for (let x = Math.floor(x0 * 2); x < (x0 + widthPt) * 2; x++) {
        if (!covered(x / 2, y / 2)) continue;
        const index = (y * width + x) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = 18;
      }
    }
  }
  for (const cell of grid.cells) {
    const r = cell.radius + .6;
    paint(cell.x - r, cell.y - r, r * 2, r * 2, (x, y) => {
      const distance = Math.hypot(cell.x - x, cell.y - y);
      return Math.abs(distance - cell.radius) <= .55 || (filled && cell.column === 2 && cell.row === 0 && distance < cell.radius);
    });
  }
  featureRegions.forEach(({ x, y, width, height }, index) => {
    const code = changeIdentity && index === 0 ? inkCodes[3] : inkCodes[index];
    for (const [row, line] of code.entries()) {
      for (const [column, bit] of [...line].entries()) {
        if (bit === '1') paint(x + column * width / 6, y + row * height / 6, width / 6 - .4, height / 6 - .4);
      }
    }
  });
  return { id: 'm3-development-synthetic', width, height, pixels };
}

function create({ components = blocks, features = [], allowManualIdentity = false, ...rest } = {}) {
  return createMarkerlessProfile({
    id: 'dev-profile', revision: 1, name: 'Mock only', page, components, features, allowManualIdentity, ...rest,
  });
}

test('parametric endpoints support skewed bubble grids with exact position order', () => {
  const angled = manualGrid({
    topLeft: { x: 10, y: 12 }, topRight: { x: 64, y: 18 }, bottomLeft: { x: 6, y: 38 },
    rows: 3, columns: 4, radius: 2,
  });
  assert.equal(angled.cells.length, 12);
  assert.deepEqual(angled.cells[11], { row: 2, column: 3, x: 60, y: 44, radius: 2 });
  assert(Math.abs(angled.columnSpacing - Math.hypot(18, 2)) < 1e-9);
  assert.throws(() => manualGrid({
    topLeft: { x: 10, y: 12 }, topRight: { x: 14, y: 14 }, bottomLeft: { x: 10, y: 38 },
    rows: 3, columns: 4, radius: 2,
  }), /overlap/);
});

test('blank authoring proposes observed bubbles within the chosen region', () => {
  const proposal = proposeGrid(syntheticImage(), matrix, region, { rows: 3, columns: 4 });
  assert.equal(proposal.status, 'complete');
  assert.equal(proposal.cells.length, 12);
  assert.equal(proposal.trials.length, 2);
  assert.deepEqual(proposal.missing, []);
  for (const [index, proposed] of proposal.cells.entries()) {
    const expected = grid.cells[index];
    assert(Math.hypot(proposed.x - expected.x, proposed.y - expected.y) < .5);
    assert.deepEqual([proposed.row, proposed.column], [expected.row, expected.column]);
  }
});

test('profile validation rejects overlapping IDs, unsupported symbols and feature placement inside answers', () => {
  const features = capturePrintedFeatures(syntheticImage(), matrix, featureRegions);
  assert.equal(create({ features }).components[0].items.length, 3);
  const invalid = structuredClone(blocks);
  invalid[0].items[1].id = invalid[0].items[0].id;
  assert.throws(() => create({ components: invalid, features }), /unique/);
  invalid[0].items[1].id = 'Q2';
  invalid[0].items[1].choices[1].symbol = invalid[0].items[1].choices[0].symbol;
  assert.throws(() => create({ components: invalid, features }), /unique supported/);
  const badFeature = { ...features[0], bounds: { x: 175, y: 240, width: 20, height: 20 } };
  assert.throws(() => create({ features: [badFeature, ...features.slice(1)] }), /outside all response/);
});

test('markerless readings preserve results across equal layout revisions and require identity on conflicting maps', () => {
  const blank = syntheticImage();
  const filled = syntheticImage({ filled: true });
  const features = capturePrintedFeatures(blank, matrix, featureRegions);
  const profile = create({ features });
  const equivalent = create({ features, id: 'equivalent-layout', revision: 2 });
  const result = readProfileSheet(filled, profile, { corners, alternatives: [equivalent] });
  assert.equal(result.status, 'read', JSON.stringify(result.registration));
  assert.equal(result.registration.identity, 'printed-features');
  assert.deepEqual(result.items.map(({ rawText }) => rawText), ['C', null, null]);

  const reassigned = structuredClone(blocks);
  [reassigned[0].items[0].choices[1].symbol, reassigned[0].items[0].choices[2].symbol] =
    [reassigned[0].items[0].choices[2].symbol, reassigned[0].items[0].choices[1].symbol];
  const conflict = create({ features, components: reassigned, id: 'conflicting-layout' });
  const blocked = readProfileSheet(filled, profile, { corners, alternatives: [conflict] });
  assert.equal(blocked.status, 'retake');
  assert.deepEqual(blocked.registration.reasons, ['identity-confirmation']);
  assert.deepEqual(blocked.items, []);
  const confirmed = readProfileSheet(filled, profile, { corners, alternatives: [conflict], confirmedIdentity: true });
  assert.equal(confirmed.registration.automatic, false);
  assert.equal(confirmed.registration.identity, 'teacher-confirmed');
  assert.equal(confirmed.items[0].rawText, 'C');

  const wrong = readProfileSheet(syntheticImage({ filled: true, changeIdentity: true }), profile, { corners, confirmedIdentity: true });
  assert.equal(wrong.status, 'retake');
  assert.deepEqual(wrong.items, []);
});

test('record without verifiable printed features requires both corners and per-capture teacher confirmation', () => {
  const profile = create({ allowManualIdentity: true });
  const image = syntheticImage({ filled: true });
  assert.equal(readProfileSheet(image, profile, { confirmedIdentity: true }).status, 'retake');
  const withoutDecision = readProfileSheet(image, profile, { corners });
  assert.deepEqual(withoutDecision.registration.reasons, ['identity-confirmation']);
  assert.deepEqual(withoutDecision.items, []);
  const reviewed = readProfileSheet(image, profile, { corners, confirmedIdentity: true });
  assert.equal(reviewed.status, 'read');
  assert.equal(reviewed.registration.identity, 'teacher-confirmed');
  assert.equal(reviewed.registration.automatic, false);
});
