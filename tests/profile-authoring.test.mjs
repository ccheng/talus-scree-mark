import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capturePrintedFeatures, pageTransform } from '../app/src/markerless-registration.js';
import { createMarkerlessProfile, manualGrid, proposeGrid } from '../app/src/profile-authoring.js';
import { readProfileSheet } from '../app/src/profile-omr.js';
import { enrollRegistrationEvidence, readStructuredRegistration, validateRegistrationEvidence } from '../app/src/psa-registration/engine.js';

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

function syntheticImage({
  filled = false, incidentalPrint = false, shift = 0, missingRow, extraRow = false, hiddenCell = false,
  continuation = false, continuationChoices = 4, columnShift = 0, pinch = 0,
} = {}) {
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
  const added = extraRow ? grid.cells.filter(({ row }) => row === 0)
    .map((cell) => ({ ...cell, y: cell.y + grid.rowSpacing / 2, row: -1 })) : [];
  if (continuation) added.push(...grid.cells.filter(({ row, column }) => row === 2 && column < continuationChoices)
    .map((cell) => ({ ...cell, y: cell.y + grid.rowSpacing, row: 3 })));
  for (const cell of [...grid.cells, ...added]) {
    if (cell.row === missingRow || (hiddenCell && cell.row === 0 && cell.column === 3)) continue;
    const xCenter = cell.x + shift + (cell.column === 3 ? columnShift : 0) +
      (cell.column === 1 ? pinch : cell.column === 2 ? -pinch : 0);
    const r = cell.radius + .6;
    paint(xCenter - r, cell.y - r, r * 2, r * 2, (x, y) => {
      const distance = Math.hypot(xCenter - x, cell.y - y);
      return Math.abs(distance - cell.radius) <= .55 || (filled && cell.column === 2 && cell.row === 0 && distance < cell.radius);
    });
  }
  featureRegions.forEach(({ x, y, width, height }, index) => {
    const code = incidentalPrint ? inkCodes[(index + 2) % inkCodes.length] : inkCodes[index];
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

const authorized = (profile) => ({ profileId: profile.id, revision: profile.revision });

test('only the exact batch profile can authorize a read and incidental printed text cannot change the map', () => {
  const profile = create();
  const image = syntheticImage({ filled: true });
  for (const batch of [undefined, { profileId: profile.id, revision: 2 }, { profileId: 'wrong', revision: 1 }]) {
    const blocked = readProfileSheet(image, profile, { corners, batch });
    assert.deepEqual(blocked.registration.reasons, ['batch-not-confirmed']);
    assert.deepEqual(blocked.items, []);
  }
  const options = { corners, batch: authorized(profile) };
  const before = readProfileSheet(image, profile, options);
  const changedPrint = readProfileSheet(syntheticImage({ filled: true, incidentalPrint: true }), profile, options);
  assert.equal(before.registration.authorization, 'teacher-confirmed-batch');
  assert.equal(changedPrint.status, 'read');
  assert.deepEqual(changedPrint.items, before.items);
  assert.deepEqual(before.items.map(({ rawText, status }) => [rawText, status]), [['C', 'single'], [null, 'blank'], [null, 'blank']]);

  const reassigned = structuredClone(blocks);
  [reassigned[0].items[0].choices[1].symbol, reassigned[0].items[0].choices[2].symbol] =
    [reassigned[0].items[0].choices[2].symbol, reassigned[0].items[0].choices[1].symbol];
  const alternate = create({ components: reassigned, id: 'separate-layout' });
  assert.equal(readProfileSheet(image, alternate, options).status, 'retake');
  const explicitlySelected = readProfileSheet(image, alternate, { corners, batch: authorized(alternate) });
  assert.equal(explicitlySelected.items[0].rawText, 'B');
  assert(!Object.hasOwn(explicitlySelected, 'answerKeyId'));
});

test('older saved print descriptors are ignored when a stored layout is authorized for a batch', () => {
  const features = capturePrintedFeatures(syntheticImage(), matrix, featureRegions);
  const legacy = create({ features, allowManualIdentity: true });
  const expected = readProfileSheet(syntheticImage({ incidentalPrint: true }), legacy, { corners, batch: authorized(legacy) });
  assert.equal(expected.status, 'read');
  assert(expected.items.every(({ status, review }) => status === 'blank' && !review));
});

test('required response geometry is independently checked even with manual corners', () => {
  const profile = create();
  for (const [missingGeometry, field, count] of [
    [{ shift: 14 }, 'missingRows', 3],
    [{ missingRow: 1 }, 'missingRows', 1],
    [{ extraRow: true }, 'extraRows', 1],
  ]) {
    const image = syntheticImage(missingGeometry);
    const result = readProfileSheet(image, profile, { corners, batch: authorized(profile) });
    assert.equal(result.status, 'retake');
    assert.deepEqual(result.registration.reasons, ['response-geometry']);
    assert.deepEqual(result.items, []);
    assert.equal(result.registration.geometry.blocks[0][field], count);
  }
});

test('locally obscured outlines cannot produce a clear blank or a silent single', () => {
  const profile = create();
  const result = readProfileSheet(syntheticImage({ filled: true, hiddenCell: true }), profile,
    { corners, batch: authorized(profile) });
  assert.equal(result.status, 'read');
  assert.equal(result.registration.geometry.verified, true);
  const [obscured, clear] = result.items;
  assert.equal(obscured.status, 'unreadable');
  assert.equal(obscured.review, true);
  assert.equal(obscured.rawText, null);
  assert.equal(clear.status, 'blank');
  assert.equal(clear.review, false);
});

test('adjacent extra row and repeated choice displacement fail the same geometry gate', () => {
  const calibrated = structuredClone(blocks);
  calibrated[0].bounds.height = 80;
  const profile = create({ components: calibrated });
  for (const [caseOptions, metric] of [
    [{ continuation: true }, 'extraRows'], [{ columnShift: 9 }, 'missingColumns'],
  ]) {
    const image = syntheticImage(caseOptions);
    for (const adjusted of [undefined, corners]) {
      const result = readProfileSheet(image, profile, { corners: adjusted, batch: authorized(profile) });
      assert.equal(result.status, 'retake');
      assert.deepEqual(result.registration.reasons, ['response-geometry']);
      assert.deepEqual(result.items, []);
      assert.equal(result.registration.geometry.blocks[0][metric], 1);
    }
  }
  const subtle = readProfileSheet(syntheticImage({ pinch: 1.45 }), profile, { corners, batch: authorized(profile) });
  assert.equal(subtle.status, 'retake');
  assert.equal(subtle.registration.geometry.blocks[0].spacingMismatch, true);
});

test('an adjacent row in a different confirmed response block is not an extra row', () => {
  const calibrated = structuredClone(blocks);
  calibrated[0].bounds.height = 80;
  const nearbyBounds = { x: 175, y: 306, width: 162, height: 16 };
  const choices = grid.cells.filter(({ row }) => row === 2).map((choice) => ({
    ...choice, y: choice.y + grid.rowSpacing, symbol: 'ABCD'[choice.column],
  }));
  calibrated.push({ id: 'independent-row', kind: 'mc', bounds: nearbyBounds,
    items: [{ id: 'Q4', kind: 'mc', bounds: nearbyBounds, choices }],
  });
  const profile = create({ components: calibrated });
  const result = readProfileSheet(syntheticImage({ continuation: true }), profile, { corners, batch: authorized(profile) });
  assert.equal(result.status, 'read');
  assert.deepEqual(result.items.map(({ id, status }) => [id, status]), [['Q1', 'blank'], ['Q2', 'blank'], ['Q3', 'blank'], ['Q4', 'blank']]);
});

test('standalone registration preserves legacy reads and refuses to override Established safety vetoes', () => {
  const profile = create();
  const image = syntheticImage({ filled: true });
  const options = { corners, batch: authorized(profile) };
  const legacy = readProfileSheet(image, profile, options);
  assert.equal(legacy.status, 'read');
  assert.deepEqual(readStructuredRegistration(image, profile, options), legacy);

  const invalid = readStructuredRegistration(image, profile, { ...options, evidence: {} });
  assert.deepEqual(invalid.registration.reasons, ['invalid-registration-evidence']);
  assert.deepEqual(invalid.items, []);
  for (const set of [{ corners }, { ...options, corners: [corners[1], corners[0], corners[3], corners[2]] }]) {
    const veto = readProfileSheet(image, profile, set);
    assert.equal(veto.status, 'retake');
    assert.deepEqual(readStructuredRegistration(image, profile, { ...set, evidence: {} }), veto);
  }
});

test('registration enrollment survives serialization, reports missing print, and binds to its mapping', () => {
  const profile = create({ scope: 'mc-only', mcCompleteness: 'partial' });
  const blank = syntheticImage();
  const enrolled = enrollRegistrationEvidence(blank, profile, matrix);
  const evidence = JSON.parse(JSON.stringify(enrolled));
  const { coverage, missing } = validateRegistrationEvidence(evidence, profile);
  assert.deepEqual(coverage.number, { expected: 3, enrolled: 0 });
  assert.deepEqual(coverage.header, { expected: 4, enrolled: 0 });
  assert.equal(missing.length, 7);
  assert.throws(() => validateRegistrationEvidence(evidence, { ...profile, revision: 2 }), /different profile/);
  const changed = structuredClone(profile);
  changed.components[0].items[0].choices[0].symbol = 'Z';
  assert.throws(() => validateRegistrationEvidence(evidence, changed), /different profile/);

  const options = { batch: authorized(profile), corners, evidence, assessPose: true };
  const result = readStructuredRegistration(syntheticImage({ continuation: true }), profile, options);
  assert.equal(result.status, 'retake');
  assert.deepEqual(result.items, []);
  assert.equal(result.registration.diagnostics.psaRegistration.status, 'established-withheld');
});

test('localized shadow leaves Established outputs intact and reports evidence separately', async () => {
  const { enrollLocalizedShadow, evaluateLocalizedShadow } = await import('../app/src/psa-registration/localized-shadow.js');
  const profile = create({ scope: 'mc-only', mcCompleteness: 'partial' });
  const evidence = JSON.parse(JSON.stringify(enrollLocalizedShadow(syntheticImage(), profile, matrix)));
  const options = { corners, batch: authorized(profile), evidence };
  const blank = syntheticImage();
  const ordinary = evaluateLocalizedShadow(blank, profile, options);
  assert.deepEqual(ordinary.established, readProfileSheet(blank, profile, options));
  assert.equal(ordinary.shadow.structure.status, 'geometry-consistent');
  assert.equal(ordinary.shadow.structure.rows.length, 3);

  const sparse = syntheticImage({ continuation: true, continuationChoices: 2 });
  const sparseOutcome = evaluateLocalizedShadow(sparse, profile, options);
  assert.equal(sparseOutcome.shadow.structure.rows.length, 3);

  const scan = syntheticImage({ continuation: true });
  const baseline = readProfileSheet(scan, profile, options);
  assert.equal(baseline.status, 'retake');
  const observed = evaluateLocalizedShadow(scan, profile, options);
  assert.deepEqual(observed.established, baseline);
  assert.equal(observed.shadow.structure.status, 'review');
  assert.equal(observed.shadow.structure.unknown.length, 1);
  assert.equal(observed.shadow.structure.semanticAssurance, false);

  const stale = evaluateLocalizedShadow(blank, profile, { ...options, evidence: { ...evidence, binding: 'stale' } });
  assert.equal(stale.shadow.status, 'unavailable');
  assert.deepEqual(stale.established, ordinary.established);
  const veto = evaluateLocalizedShadow(blank, profile, { corners, evidence });
  assert.equal(veto.shadow.status, 'established-veto');
  assert.deepEqual(veto.established, readProfileSheet(blank, profile, { corners }));
});

test('localized scope requires affirmative blank evidence and never overrides a retake', async () => {
  const { enrollLocalizedShadow, evaluateLocalizedShadow } = await import('../app/src/psa-registration/localized-shadow.js');
  const profile = create({ scope: 'mc-only', mcCompleteness: 'partial',
    exclusions: [{ x: 180, y: 307, width: 154, height: 16 }] });
  const choices = grid.cells.filter(cell => cell.row === 2).map(({ x, y, radius }) => ({ x, y: y + grid.rowSpacing, radius }));
  const setup = { confirmedExcludedRows: [{ id: 'known-extra-row', choices }] };
  assert.throws(() => enrollLocalizedShadow(syntheticImage(), profile, matrix, setup), /not independently localized/);
  const blank = syntheticImage({ continuation: true });
  const evidence = enrollLocalizedShadow(blank, profile, matrix, setup);
  const result = evaluateLocalizedShadow(blank, profile, { corners, batch: authorized(profile), evidence });
  assert.equal(result.established.status, 'retake');
  assert.equal(result.shadow.structure.status, 'geometry-consistent');
  assert.equal(result.shadow.structure.ignored[0].enrolled, 'known-extra-row');
  assert.equal(result.shadow.structure.semanticAssurance, false);
});
