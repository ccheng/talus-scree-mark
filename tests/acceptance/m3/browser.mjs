import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openServer, projectPath } from '../m1/server.mjs';

const { chromium } = await import(process.env.TALUS_TEST_PLAYWRIGHT_PATH || 'playwright');
const appPath = process.argv[2];
assert(appPath, 'Provide the static app path');
const fixtureFolder = new URL('./fixtures/', import.meta.url);
const { families, orientationControl, discoveryControl, fourBoxControl } = JSON.parse(await readFile(new URL('oracles.json', fixtureFolder), 'utf8'));
assert(families.length === 3 && families.every(({ fixtures }) => fixtures.filter(({ mode }) => mode === 'standard').length >= 8));
const poses = JSON.parse(await readFile(new URL('pose-oracles.json', fixtureFolder), 'utf8'));
const interleavedCrop = JSON.parse(await readFile(new URL('interleaved-crop-oracles.json', fixtureFolder), 'utf8'));
const alberta = JSON.parse(await readFile(new URL('alberta-oracles.json', fixtureFolder), 'utf8'));
const albertaPhoto = JSON.parse(await readFile(new URL('alberta-photo-oracles.json', fixtureFolder), 'utf8'));
const cropAttachment = fileURLToPath(new URL('./inputs/cropped-interleaved-blank.jpeg', import.meta.url));
const encoded = (file) => readFile(new URL(file, fixtureFolder), 'base64');
const server = await openServer(appPath);
const target = server.origin + projectPath;
const browser = await chromium.launch({ executablePath: process.env.TALUS_TEST_CHROMIUM, headless: true });
const appSource = (file) => new URL(`src/${file}`, target).href;
const coordinateScale = 2;
const pageShape = { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' };
let failures = 0;

const scalePoint = ({ x, y }) => ({ x: x / coordinateScale, y: y / coordinateScale });
const scaleBounds = ({ x, y, width, height }) => ({ ...scalePoint({ x, y }), width: width / coordinateScale, height: height / coordinateScale });
const scaleChoice = ({ symbol, radius, ...center }) => ({ symbol, radius: radius / coordinateScale, ...scalePoint(center) });
const scaleItem = ({ id, kind, bounds, choices, slots }) => ({
  id, kind, bounds: scaleBounds(bounds),
  ...(kind === 'mc' ? { choices: choices.map(scaleChoice) } : { slots: slots.map(({ id, choices }) => ({ id, choices: choices.map(scaleChoice) })) }),
});
const scaleComponent = ({ id, kind, bounds, items }) => ({ id, kind, bounds: scaleBounds(bounds), items: items.map(scaleItem) });
const normalizeMatrix = (matrix) => matrix.map((value, index) => [2, 5, 8].includes(index) ? value : value * coordinateScale);
const fixtureFilePath = (file) => fileURLToPath(new URL(file, fixtureFolder));

async function withPage(check, contextOptions) {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 }, ...contextOptions });
  try {
    const page = await context.newPage();
    await page.goto(target);
    await page.waitForFunction(() => /^Offline ready\b/i.test(document.querySelector('#offline-status').textContent.trim()));
    await check(page, context);
  } finally { await context.close(); }
}

async function group(name, check, contextOptions) {
  try {
    await withPage(check, contextOptions);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}

async function installAdapters(page) {
  await page.evaluate(async ({ authoring, registration, recognition, storage, discovery }) => {
    window.m3qa = {
      ...(await import(authoring)), ...(await import(registration)), ...(await import(recognition)), ...(await import(storage)), ...(await import(discovery)),
      async loadImage(base64, id) {
        const bytes = Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes]));
        const canvas = document.createElement('canvas');
        const width = canvas.width = bitmap.width;
        const height = canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return { id, width, height, pixels: context.getImageData(0, 0, width, height) };
      },
    };
  }, { authoring: appSource('profile-authoring.js'), registration: appSource('markerless-registration.js'), recognition: appSource('profile-omr.js'), storage: appSource('profile-store.js'), discovery: appSource('layout-discovery.js') });
}

async function enroll(page, family) {
  return page.evaluate(({ id, page, components }) => window.m3qa.createMarkerlessProfile({
    id, revision: 1, name: `QA ${id}`, page, components, features: [],
  }), { id: family.id, page: pageShape, components: family.components.map(scaleComponent) });
}

const batchFor = ({ id, revision }) => ({ profileId: id, revision });
function point(matrix, x, y) {
  const weight = matrix[6] * x + matrix[7] * y + matrix[8];
  return { x: (matrix[0] * x + matrix[1] * y + matrix[2]) / weight, y: (matrix[3] * x + matrix[4] * y + matrix[5]) / weight };
}

const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
const pageCorners = (matrix) => [[0, 0], [pageShape.width, 0], [pageShape.width, pageShape.height], [0, pageShape.height]].map(([x, y]) => point(matrix, x, y));

function geometryErrors(profile, expected, actual) {
  const centers = profile.components.flatMap(({ items }) => items.flatMap(({ choices, slots }) => choices ?? slots.flatMap(({ choices }) => choices)));
  return centers.map(({ x, y, radius }) => {
    const fixed = point(expected, x, y);
    const pixelRadius = (distance(fixed, point(expected, x + radius, y)) + distance(fixed, point(expected, x, y + radius))) / 2;
    return distance(point(actual, x, y), fixed) / pixelRadius;
  });
}

function assertObservation(item, expected) {
  assert(item, `Missing mapped item ${expected.id}`);
  const observed = { status: item.status, value: item.rawText, review: item.review };
  assert.deepEqual(observed, { status: expected.status, value: expected.value, review: expected.review }, expected.id);
}

async function scan(page, profile, family, fixture, options = {}) {
  return page.evaluate(async ({ base64, id, profile, options }) => {
    const image = await window.m3qa.loadImage(base64, id);
    return window.m3qa.readProfileSheet(image, profile, options);
  }, { base64: await encoded(fixture.file), id: `${family.id}-${fixture.id}`, profile, options: { batch: batchFor(profile), ...options } });
}

function assertRetake(result, label, reason) {
  assert.equal(result.status, 'retake', label);
  assert.deepEqual(result.items, [], label);
  if (reason) assert(result.registration.reasons.includes(reason), `${label}: ${result.registration.reasons.join(', ')}`);
}

function assertExactRead(result, truth, label) {
  assert.equal(result.status, 'read', `${label}: ${result.registration.reasons.join(', ')}`);
  assert.equal(result.registration.authorization, 'teacher-confirmed-batch', label);
  assert.deepEqual(result.items.map(({ id }) => id), truth.map(({ id }) => id), label);
  for (const expected of truth) assertObservation(result.items.find(({ id }) => id === expected.id), expected);
}

async function selectImage(page, path, name, mimeType, control = '#choose-image') {
  const open = page.waitForEvent('filechooser');
  await page.locator(control).click();
  const chooser = await open;
  await chooser.setFiles({ name, mimeType, buffer: await readFile(path) });
}

async function confirmAndRead(page, path, name, mimeType, truth) {
  await page.locator('#scan-completed').click();
  await selectImage(page, path, name, mimeType);
  await assertReadRows(page, truth);
}

async function assertReadRows(page, truth) {
  const outcome = page.locator('#recognition-status[data-status="read"]');
  await outcome.waitFor();
  assert.equal(await outcome.getAttribute('data-authorization'), 'teacher-confirmed-batch');
  const rows = await page.locator('#recognition-results [data-item-id]').evaluateAll((elements) => elements.map((row) => ({
    id: row.dataset.itemId, status: row.dataset.status, review: row.dataset.review === 'true',
    value: row.querySelector('[data-raw-text]')?.dataset.rawText ?? null,
  })));
  assert.deepEqual(rows, truth);
}

function assertDiscoveredMapping(profile, oracle) {
  const observed = profile.components.flatMap(({ items }) => items);
  const expected = oracle.blocks.flatMap(({ items }) => items);
  assert.equal(profile.components.length, oracle.blocks.length);
  assert.deepEqual(observed.map(({ id }) => id), oracle.itemOrder);
  for (const [index, item] of observed.entries()) {
    const target = expected[index];
    assert.equal(item.kind, target.kind, item.id);
    const actualSlots = item.kind === 'mc' ? [{ choices: item.choices }] : item.slots;
    const targetSlots = target.kind === 'mc' ? [{ choices: target.choices }] : target.slots;
    assert.equal(actualSlots.length, targetSlots.length, item.id);
    for (const [slotIndex, slot] of actualSlots.entries()) {
      const expectedChoices = targetSlots[slotIndex].choices;
      assert.deepEqual(slot.choices.map(({ symbol }) => symbol).sort(), expectedChoices.map(({ symbol }) => symbol).sort(), `${item.id} slot ${slotIndex + 1}`);
      for (const choice of slot.choices) {
        const expectedChoice = expectedChoices.find(({ symbol }) => symbol === choice.symbol);
        assert(distance(choice, expectedChoice) <= expectedChoice.radius * .5, `${item.id} ${choice.symbol} bubble center`);
      }
    }
  }
}

try {
  console.log(`Desktop Chromium ${browser.version()} at ${target}`);
  await group('M3 three calibration levels and mapping validation', async (page) => {
    await installAdapters(page);
    const family = families[0];
    const block = family.components[0];
    const levels = await page.evaluate(async ({ base64, block, profilePage, reference }) => {
      const image = await window.m3qa.loadImage(base64, 'calibration-blank');
      const proposed = await window.m3qa.proposeGrid(image, [2, 0, 0, 0, 2, 0, 0, 0, 1], block.bounds, { rows: block.rows, columns: block.columns });
      const arranged = await window.m3qa.manualGrid(block);
      const custom = structuredClone(reference);
      custom[0].items[0].choices[0].x += 1.25;
      const profile = window.m3qa.createMarkerlessProfile({ id: 'correction-test', revision: 1, name: 'Corrected cell', page: profilePage, components: custom, features: [] });
      const invalid = structuredClone(custom);
      invalid[0].items[0].choices[1].symbol = invalid[0].items[0].choices[0].symbol;
      let invalidRejected = false;
      try {
        invalidRejected = !window.m3qa.createMarkerlessProfile({ id: 'invalid-test', revision: 1, name: 'Invalid map', page: profilePage, components: invalid, features: [] });
      } catch { invalidRejected = true; }
      return { proposed, arranged, profile, invalidRejected };
    }, { base64: await encoded(family.blank), profilePage: pageShape, reference: family.components.map(scaleComponent),
      block: { topLeft: scalePoint(block.topLeft), topRight: scalePoint(block.topRight), bottomLeft: scalePoint(block.bottomLeft), radius: block.radius / coordinateScale,
        rows: block.rows, columns: block.columns, bounds: scaleBounds(block.bounds) } });
    const expected = block.items.flatMap(({ choices }) => choices).map(scaleChoice);
    const proposed = (levels.proposed?.cells ?? levels.proposed?.grid ?? levels.proposed ?? []).flat().filter(Boolean);
    const arranged = (levels.arranged?.cells ?? levels.arranged?.grid ?? levels.arranged ?? []).flat().filter(Boolean);
    assert.equal(proposed.length, expected.length, `Automatic grid returned ${proposed.length} positions`);
    assert.equal(arranged.length, expected.length, 'Parametric grid count');
    for (let i = 0; i < expected.length; i += 1) {
      assert(distance(expected[i], proposed[i]) <= expected[i].radius * .5, `auto grid index ${i}`);
      assert(distance(expected[i], arranged[i]) < .01, `parametric grid index ${i}`);
    }
    assert.equal(levels.profile.components[0].items[0].choices[0].x, expected[0].x + 1.25);
    assert.equal(levels.profile.components[0].items[0].choices[1].x, expected[1].x);
    assert(levels.invalidRejected, 'Duplicate choice mapping should be rejected');
  });

  await group('M3.2 exact readings and per-capture structural checks across three layouts', async (page) => {
    await installAdapters(page);
    for (const family of families) {
      const profile = await enroll(page, family);
      assert.deepEqual(profile.components.map(({ id }) => id), family.components.map(({ id }) => id));
      const standardized = [];
      const displacements = [];
      let accepted = 0;
      let planned = 0;
      const outcomes = [];
      for (const fixture of family.fixtures) {
        const caption = `${family.id}/${fixture.id}`;
        const result = await scan(page, profile, family, fixture);
        outcomes.push([fixture.id, result.status, result.registration?.reasons ?? []]);
        if (fixture.mode === 'must-retake') {
          assertRetake(result, caption);
          if (fixture.pageToSource) {
            const manual = await scan(page, profile, family, fixture, { corners: pageCorners(normalizeMatrix(fixture.pageToSource)) });
            assertRetake(manual, `${caption} with accurate corners`, 'response-geometry');
          }
        } else if (fixture.mode === 'must-review') {
          const verified = result.status === 'read' ? result : await scan(page, profile, family, fixture, { corners: pageCorners(normalizeMatrix(fixture.pageToSource)) });
          assert.equal(verified.status, 'read', caption);
          const double = fixture.truth.find(({ status }) => status === 'multiple');
          assertObservation(verified.items.find(({ id }) => id === double.id), double);
        } else if (fixture.mode === 'compatible-print') {
          assertExactRead(result, fixture.truth, caption);
        } else if (fixture.mode === 'standard') {
          planned += fixture.truth.length;
          const expectedMatrix = normalizeMatrix(fixture.pageToSource);
          if (result.status !== 'read') {
            assertRetake(result, caption);
            const manuallyAligned = await scan(page, profile, family, fixture, { corners: pageCorners(expectedMatrix) });
            assertExactRead(manuallyAligned, fixture.truth, `${caption} fallback`);
            assert.equal(manuallyAligned.registration.cornerPath, 'manual-corners');
            continue;
          }
          assert.equal(result.registration.authorization, 'teacher-confirmed-batch');
          assert.equal(result.registration.geometry.verified, true);
          assert.deepEqual(result.items.map(({ id }) => id), fixture.truth.map(({ id }) => id));
          for (const expected of fixture.truth) {
            const actual = result.items.find(({ id }) => id === expected.id);
            if (actual.review) continue;
            assertObservation(actual, expected);
            accepted += 1;
          }
          displacements.push(...geometryErrors(profile, expectedMatrix, result.registration.pageToSource));
          standardized.push(fixture.id);
        } else if (result.status === 'read') {
          for (const item of result.items.filter(({ review }) => !review)) {
            assertObservation(item, fixture.truth.find(({ id }) => id === item.id));
          }
        } else {
          assertRetake(result, caption);
        }
      }
      displacements.sort((a, b) => a - b);
      console.log(`  ${family.id}: ${standardized.length}/8 automatic standard reads, ${accepted}/${planned} accepted items and zero wrong accepted. p95 normalized displacement ${displacements[Math.ceil(displacements.length * .95) - 1]}. ${JSON.stringify(outcomes)}`);
      assert(standardized.length >= 1, `No automatic standard read for ${family.id}`);
    }
  });

  await group('M3.2 exact batch authorization, geometric orientation and legacy profile reuse', async (page) => {
    await installAdapters(page);
    const family = families[0];
    const fixture = family.fixtures[0];
    const profile = await enroll(page, family);
    const knownCorners = pageCorners(normalizeMatrix(fixture.pageToSource));
    for (const invalid of [null, { profileId: 'not-selected', revision: profile.revision }, { profileId: profile.id, revision: 2 }]) {
      const result = await scan(page, profile, family, fixture, { batch: invalid, corners: knownCorners });
      assertRetake(result, 'Image evidence and manual corners cannot authorize an unmatched batch', 'batch-not-confirmed');
    }
    const layoutOnly = await scan(page, profile, family, fixture, { corners: knownCorners });
    assertExactRead(layoutOnly, fixture.truth, 'Teacher-selected response map');
    assert.deepEqual(layoutOnly.profile, { id: profile.id, revision: profile.revision });
    for (const forbidden of ['assessmentId', 'answerKeyId', 'assessmentVersion', 'grade']) assert(!Object.hasOwn(layoutOnly, forbidden));

    const alternate = { ...structuredClone(profile), id: 'identical-geometry-other-map', name: 'Separate response map' };
    const marked = fixture.truth.find(({ status }) => status === 'single');
    const { choices } = alternate.components.flatMap(({ items }) => items).find(({ id }) => id === marked.id);
    const selected = choices.find(({ symbol }) => symbol === marked.value);
    const other = choices.find(({ symbol }) => symbol !== marked.value);
    const newSymbol = other.symbol;
    [selected.symbol, other.symbol] = [other.symbol, selected.symbol];
    const notAuthorized = await scan(page, alternate, family, fixture, { batch: batchFor(profile), corners: knownCorners });
    assertRetake(notAuthorized, 'Same geometry cannot automatically activate a different profile', 'batch-not-confirmed');
    const explicit = await scan(page, alternate, family, fixture, { corners: knownCorners });
    const alternateTruth = fixture.truth.map((item) => item.id === marked.id ? { ...item, value: newSymbol } : item);
    assertExactRead(explicit, alternateTruth, 'Deliberately selected alternative response map');

    const symmetricProfile = await enroll(page, orientationControl);
    const symmetricFixture = orientationControl.fixture;
    const ambiguous = await scan(page, symmetricProfile, orientationControl, symmetricFixture);
    assertRetake(ambiguous, 'Geometrically symmetric form', 'ambiguous-orientation');
    assert.equal(ambiguous.registration.diagnostics.orientation.status, 'ambiguous');
    assert.equal(ambiguous.registration.diagnostics.responseGeometry.status, 'verified');
    const supplied = await scan(page, symmetricProfile, orientationControl, symmetricFixture, { corners: pageCorners(normalizeMatrix(symmetricFixture.pageToSource)) });
    assertExactRead(supplied, symmetricFixture.truth, 'Explicit orientation still checks response geometry');
    assert.equal(supplied.registration.diagnostics.pagePose.path, 'manual-corners');
    assert.equal(supplied.registration.diagnostics.orientation.status, 'verified');

    const legacyFamily = families.at(-1);
    const geometry = await enroll(page, legacyFamily);
    const historical = JSON.parse(await readFile(new URL('legacy-interleaved-signatures.json', import.meta.url), 'utf8'));
    assert.equal(historical.fixture, legacyFamily.blank);
    assert.equal(historical.samplesByFeature.length, legacyFamily.features.length);
    const legacy = { ...geometry, id: 'legacy-printed-profile', allowManualIdentity: true,
      features: legacyFamily.features.map((bounds, index) => ({ id: `feature-${index}`, bounds: scaleBounds(bounds),
        samples: [...historical.samplesByFeature[index]].map((value) => Number.parseInt(value, 16) / 15),
      })),
    };
    const restored = await page.evaluate(async (record) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('talus-scree-mark-profiles', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('profiles', { keyPath: ['id', 'revision'] });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction('profiles', 'readwrite');
          transaction.objectStore('profiles').add(record);
          transaction.oncomplete = resolve;
          transaction.onabort = () => reject(transaction.error);
        });
      } finally { database.close(); }
      return window.m3qa.loadProfile(record.id, record.revision);
    }, legacy);
    assert.deepEqual(restored, legacy, 'Read the historical stored profile without mutating it');
    const editedTitle = legacyFamily.fixtures.find(({ id }) => id === 'changed-title-only');
    assertExactRead(await scan(page, restored, legacyFamily, editedTitle), editedTitle.truth, 'Old geometry in a fresh confirmed batch');
  });

  await group('M3.2 alternate PDF renderer characterization', async (page) => {
    await installAdapters(page);
    const reference = resolve(appPath, 'fixtures/m3');
    const key = JSON.parse(await readFile(resolve(reference, 'mc-only-key.json'), 'utf8'));
    const filled = await encoded('cross-renderer-filled.png');
    const result = await page.evaluate(async ({ key, filled }) => {
      const image = await window.m3qa.loadImage(filled, 'poppler-marked-raster');
      const components = key.blocks.map(({ kind, bounds, items }, index) => ({ id: `block-${index}`, kind, bounds, items }));
      const profile = window.m3qa.createMarkerlessProfile({ id: 'cross-renderer', revision: 1, name: 'Cross renderer',
        page: { ...key.paper, origin: 'top-left', orientation: 'portrait' }, components, features: [] });
      return window.m3qa.readProfileSheet(image, profile, { batch: { profileId: profile.id, revision: profile.revision } });
    }, { key, filled });
    if (result.status === 'read') {
      assert.deepEqual(result.items.map(({ id }) => id), key.itemOrder);
      for (const item of result.items.filter(({ review }) => !review)) {
        const expected = key.expected[item.id];
        assertObservation(item, { id: item.id, status: expected.state, value: expected.rawText, review: false });
      }
    } else assertRetake(result, 'Cross-renderer stress');
    console.log(`  Optional renderer stress ${result.status}, ${result.items.filter(({ review }) => !review).length}/${key.itemOrder.length} exact accepted items.`);
  });

  for (const fixtureId of ['mc-only', 'mixed', 'interleaved']) {
    await group(`Automatic blank discovery and exact paired batch read (${fixtureId})`, async (page) => {
      const source = resolve(appPath, 'fixtures/m3');
      const oracle = JSON.parse(await readFile(resolve(source, `${fixtureId}-key.json`), 'utf8'));
      const truth = oracle.itemOrder.map((id) => ({ id, status: oracle.expected[id].state, value: oracle.expected[id].rawText, review: false }));
      const start = performance.now();
      // Neutral filenames prevent template selection based on the supplied name.
      await selectImage(page, resolve(source, `${fixtureId}-blank.png`), 'independent-blank.png', 'image/png', '#setup-profile');
      const panel = page.locator('#profile-editor');
      await panel.waitFor();
      await page.locator('#profile-name').fill(`Discovery QA ${fixtureId}`);
      await page.locator('#discovery-status[data-status="proposed"]').waitFor();
      const proposalTime = performance.now() - start;
      assert.equal(await page.locator('#profile-blocks > li').count(), oracle.blocks.length);
      await installAdapters(page);
      assert.deepEqual(await page.evaluate(() => window.m3qa.listProfiles()), [], 'The proposal must remain unsaved before confirmation');
      // The normal path performs no corner, region, grid, or individual-cell edits.
      await page.locator('#enroll-profile').click();
      await panel.waitFor({ state: 'hidden' });
      const setupTime = performance.now() - start;
      const profiles = await page.evaluate(() => window.m3qa.listProfiles());
      assert.equal(profiles.length, 1);
      assertDiscoveredMapping(profiles[0], oracle);
      await confirmAndRead(page, resolve(source, `${fixtureId}-filled.png`), 'independent-marked.png', 'image/png', truth);
      console.log(`  ${fixtureId}: ${oracle.itemOrder.length} exact responses; zero geometry interventions; one accepted layout confirmation; scripted proposal ${Math.round(proposalTime)} ms, setup ${Math.round(setupTime)} ms.`);
    });
  }

  await group('Automatic discovery finds four writing boxes and allows explicit NR symbol ordering', async (page) => {
    const fixture = fourBoxControl;
    await installAdapters(page);
    const proposal = await page.evaluate(async ({ base64, shape }) => {
      const blank = await window.m3qa.loadImage(base64, 'four-box-control');
      return window.m3qa.discoverBlankLayout(blank, shape);
    }, { base64: await encoded(fixture.blank), shape: pageShape });
    assert.equal(proposal.status, 'proposed', proposal.issues.join(', '));
    const numerical = proposal.diagnostics.filter(({ kind }) => kind === 'nr');
    assert.deepEqual(numerical.map(({ writingBoxes, mappingReview }) => [writingBoxes.length, mappingReview]), [[4, true], [4, true]]);
    await selectImage(page, fixtureFilePath(fixture.blank), 'four-writing-boxes.png', 'image/png', '#setup-profile');
    const panel = page.locator('#profile-editor');
    await panel.waitFor();
    await page.locator('#profile-name').fill('Four writing boxes QA');
    await page.locator('#discovery-status[data-status="proposed"]').waitFor();
    const differentOrder = fixture.oracle.blocks.flatMap(({ items }) => items).find(({ id }) => id === 'NR2');
    await page.locator('#profile-blocks > li').filter({ hasText: 'NR2' }).getByRole('button', { name: 'Edit numbering and symbols' }).click();
    const mapping = page.locator('#block-mapping');
    await mapping.waitFor();
    for (const [index, slot] of differentOrder.slots.entries()) {
      const topToBottom = [...slot.choices].sort((a, b) => a.y - b.y).map(({ symbol }) => symbol).join(',');
      await mapping.locator(`[data-map-slot="${index + 1}"]`).fill(topToBottom);
    }
    await page.locator('#apply-block-mapping').click();
    await mapping.waitFor({ state: 'hidden' });
    await page.locator('#enroll-profile').click();
    await panel.waitFor({ state: 'hidden' });
    const [profile] = await page.evaluate(() => window.m3qa.listProfiles());
    const oracleInPoints = { ...fixture.oracle, blocks: fixture.oracle.blocks.map(scaleComponent) };
    assertDiscoveredMapping(profile, oracleInPoints);
    await confirmAndRead(page, fixtureFilePath(fixture.filled), 'four-writing-boxes-marked.jpg', 'image/jpeg', fixture.truth);
  });

  await group('Alberta printed numerical labels, blank and decimal readings, and geometry-preserving renumber', async (page) => {
    await installAdapters(page);
    const proposal = await page.evaluate(async ({ input, shape }) => {
      const blank = await window.m3qa.loadImage(input, 'alberta-printed-blank');
      return window.m3qa.discoverBlankLayout(blank, shape);
    }, { input: await encoded(alberta.blank), shape: pageShape });
    assert.equal(proposal.status, 'proposed', proposal.issues.join(', '));
    const numerical = proposal.diagnostics.filter(({ kind }) => kind === 'nr');
    assert.deepEqual(numerical.map(({ writingBoxes, mappingReview }) => [writingBoxes.length, mappingReview]), Array.from({ length: 4 }, () => [4, true]));
    for (const { items } of proposal.components.filter(({ kind }) => kind === 'nr')) {
      const [item] = items;
      assert.deepEqual(item.slots.map(({ choices }) => choices.map(({ symbol }) => symbol).join('')), [
        '0123456789', '.0123456789', '.0123456789', '0123456789',
      ]);
    }
    const originalFirstMc = proposal.components.find(({ kind }) => kind === 'mc');
    assert.deepEqual(originalFirstMc.items.map(({ id }) => id), ['MC1', 'MC2', 'MC3']);
    await selectImage(page, fixtureFilePath(alberta.blank), 'printed-blank.png', 'image/png', '#setup-profile');
    const editor = page.locator('#profile-editor');
    await editor.waitFor();
    await page.locator('#profile-name').fill('Alberta printed response QA');
    await page.locator('#discovery-status[data-status="proposed"]').waitFor();
    const firstMc = page.locator('#profile-blocks [data-block-kind="mc"]').first();
    await firstMc.getByRole('button', { name: /Renumber block/i }).click();
    const firstNumber = page.locator('#block-first-number');
    await firstNumber.fill('4');
    await page.locator('#apply-block-renumber').click();
    await page.locator('#numbering-conflicts').waitFor();
    assert.match(await firstMc.textContent(), /MC4–MC6/);
    assert(await page.locator('#enroll-profile').isDisabled());
    assert.deepEqual(await page.evaluate(() => window.m3qa.listProfiles()), []);
    await firstMc.getByRole('button', { name: /Renumber block/i }).click();
    await firstNumber.fill('24');
    await page.locator('#apply-block-renumber').click();
    await firstMc.filter({ hasText: 'MC24–MC26' }).waitFor();
    await page.locator('#numbering-conflicts').waitFor({ state: 'hidden' });
    await page.locator('#enroll-profile').click();
    await editor.waitFor({ state: 'hidden' });
    const [profile] = await page.evaluate(() => window.m3qa.listProfiles());
    const after = profile.components.find(({ kind }) => kind === 'mc');
    assert.deepEqual(after.items.map(({ id }) => id), ['MC24', 'MC25', 'MC26']);
    const geometry = ({ items }) => items.map(({ bounds, choices }) => ({ bounds, choices }));
    assert.deepEqual(geometry(after), geometry(originalFirstMc), 'Changing item IDs moved printed bubbles');
    const savedNumerical = profile.components.filter(({ kind }) => kind === 'nr').flatMap(({ items }) => items);
    assert(savedNumerical.every(({ slots }) => slots.every(({ choices }) => choices
      .filter(({ symbol }) => symbol !== '.').every(({ blankInk }) => Number.isFinite(blankInk)))));
    const oracle = { blocks: alberta.components.map(scaleComponent), itemOrder: alberta.components.flatMap(({ items }) => items.map(({ id }) => id)) };
    assertDiscoveredMapping(profile, oracle);

    const beforeMarks = await page.evaluate(async ({ input, profile }) => {
      const image = await window.m3qa.loadImage(input, 'alberta-labeled-blank');
      return window.m3qa.readProfileSheet(image, profile, { batch: { profileId: profile.id, revision: profile.revision } });
    }, { input: await encoded(alberta.blank), profile });
    const clean = oracle.itemOrder.map((id) => ({ id, status: 'blank', value: id.startsWith('NR') ? '    ' : null, review: false }));
    assertExactRead(beforeMarks, clean, 'Printed glyphs alone must read as blank');
    assert(beforeMarks.items.some(({ slots }) => slots?.some(({ choices }) => choices.some(({ rawScore, score }) => rawScore > .11 && score <= .105))),
      'The printed-only validation must actually exercise baseline subtraction');
    const marked = oracle.itemOrder.map((id) => alberta.truth[id]);
    await confirmAndRead(page, fixtureFilePath(alberta.marked), 'printed-marked.png', 'image/png', marked);
    const uncertain = page.locator('#recognition-results [data-item-id="NR4"]');
    assert.equal(await uncertain.getAttribute('data-review'), 'true');
    assert.equal(await uncertain.locator('[data-raw-text]').count(), 0);
    console.log('  Four writing boxes and 42 labeled bubbles in each of four numerical blocks; both decimal positions and printed-only blanks match the literal oracle.');
  });

  await group('Photographed Alberta layout supports a direct block swap without saving duplicate IDs', async (page) => {
    await installAdapters(page);
    const proposed = await page.evaluate(async ({ input, shape }) => {
      const blank = await window.m3qa.loadImage(input, 'alberta-phone-blank');
      return window.m3qa.discoverBlankLayout(blank, shape);
    }, { input: await encoded(albertaPhoto.blank), shape: pageShape });
    assert.equal(proposed.status, 'proposed', proposed.issues.join(', '));
    const written = proposed.diagnostics.filter(({ kind }) => kind === 'nr');
    assert.deepEqual(written.map(({ writingBoxes }) => writingBoxes.length), [4, 4, 4, 4]);
    assert(proposed.components.filter(({ kind }) => kind === 'nr').every(({ items: [item] }) =>
      item.slots.map(({ choices }) => choices.length).join(',') === '10,11,11,10'));

    await selectImage(page, fixtureFilePath(albertaPhoto.blank), 'camera-template.jpg', 'image/jpeg', '#setup-profile');
    const editor = page.locator('#profile-editor');
    await editor.waitFor();
    await page.locator('#profile-name').fill('Phone Alberta swapped blocks');
    await page.locator('#discovery-status[data-status="proposed"]').waitFor();
    const mc = page.locator('#profile-blocks [data-block-kind="mc"]');
    assert.equal(await mc.count(), 2);
    assert.match(await mc.nth(0).textContent(), /MC1–MC3/);
    assert.match(await mc.nth(1).textContent(), /MC4–MC6/);
    const conflicts = page.locator('#numbering-conflicts');
    const save = page.locator('#enroll-profile');
    async function renumber(block, start) {
      await mc.nth(block).getByRole('button', { name: /Renumber block/i }).click();
      await page.locator('#block-first-number').fill(String(start));
      await page.locator('#apply-block-renumber').click();
    }
    await renumber(0, 4);
    await conflicts.waitFor();
    assert.match(await conflicts.textContent(), /MC4/);
    assert.match(await mc.nth(0).textContent(), /MC4–MC6/);
    assert.match(await mc.nth(1).textContent(), /MC4–MC6/);
    assert.equal(await page.locator('#profile-blocks [data-numbering-conflict="true"]').count(), 2);
    assert(await save.isDisabled());
    assert.deepEqual(await page.evaluate(() => window.m3qa.listProfiles()), []);
    await renumber(1, 1);
    await conflicts.waitFor({ state: 'hidden' });
    assert(await save.isEnabled());
    await save.click();
    await editor.waitFor({ state: 'hidden' });
    const [profile] = await page.evaluate(() => window.m3qa.listProfiles());
    const blocks = profile.components.filter(({ kind }) => kind === 'mc');
    assert.deepEqual(blocks.map(({ items }) => items.map(({ id }) => id)), [['MC4', 'MC5', 'MC6'], ['MC1', 'MC2', 'MC3']]);
    const geometry = (entries) => entries.filter(({ kind }) => kind === 'mc').map(({ items }) =>
      items.map(({ bounds, choices }) => ({ bounds, choices })));
    assert.deepEqual(geometry(profile.components), geometry(proposed.components));
    assertDiscoveredMapping(profile, { blocks: albertaPhoto.components.map(scaleComponent), itemOrder: albertaPhoto.truth.map(({ id }) => id) });
    await page.reload();
    const selector = page.locator('#profile-selector');
    const revision = `${profile.id}@${profile.revision}`;
    await selector.locator(`option[value="${revision}"]`).waitFor({ state: 'attached' });
    await selector.selectOption(revision);
    await confirmAndRead(page, fixtureFilePath(albertaPhoto.marked), 'camera-marked.jpg', 'image/jpeg', albertaPhoto.truth);
  }, { isMobile: true, hasTouch: true });

  await group('Touch dragging paints a live template region and commits sheet coordinates', async (page, context) => {
    const fixture = resolve(appPath, 'fixtures/m3/mixed-blank.png');
    await selectImage(page, fixture, 'region-practice.png', 'image/png', '#setup-profile');
    await page.locator('#discovery-status[data-status="proposed"]').waitFor();
    const save = page.locator('#enroll-profile');
    assert(await save.isDisabled());
    assert.match(await page.locator('#template-save-status').textContent(), /template name/i);
    await page.locator('#profile-name').fill('Region and corner recovery');
    assert(await save.isEnabled());
    const canvas = page.locator('#profile-canvas');
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    assert(bounds);
    const first = { x: bounds.x + bounds.width * .13, y: bounds.y + bounds.height * .15 };
    const last = { x: bounds.x + bounds.width * .32, y: bounds.y + bounds.height * .32 };
    const region = page.locator('#region-width');
    const oldWidth = await region.inputValue();
    await canvas.evaluate((element) => { window.originalTemplateCanvas = element.toDataURL(); });
    const touch = await context.newCDPSession(page);
    async function dispatch(type, touchPoints) {
      await touch.send('Input.dispatchTouchEvent', { type, touchPoints });
    }
    await dispatch('touchStart', [first]);
    await dispatch('touchMove', [last]);
    assert.equal(await canvas.getAttribute('data-dragging-region'), 'true');
    assert(await canvas.evaluate((element) => element.toDataURL() !== window.originalTemplateCanvas), 'Canvas did not repaint during touch move');
    assert.equal(await region.inputValue(), oldWidth, 'The live touch should precede committing the fields');
    await dispatch('touchEnd', []);
    assert.notEqual(await canvas.getAttribute('data-dragging-region'), 'true');
    assert(Math.abs(Number(await region.inputValue()) - (.32 - .13) * pageShape.width) < 4);
    assert(Math.abs(Number(await page.locator('#region-height').inputValue()) - (.32 - .15) * pageShape.height) < 4);
    const selectedRegion = await region.inputValue();
    const rectified = await canvas.evaluate((element) => element.toDataURL());
    const blocks = await page.locator('#profile-blocks').innerText();
    await page.locator('#reset-blank-corners').click();
    assert.equal(await page.locator('#enroll-profile').isDisabled(), true);
    await canvas.scrollIntoViewIfNeeded();
    const raw = await canvas.boundingBox();
    assert(raw);
    await dispatch('touchStart', [{ x: raw.x + 4, y: raw.y + 4 }]);
    await dispatch('touchMove', [{ x: raw.x + 25, y: raw.y + 25 }]);
    await dispatch('touchEnd', []);
    await page.locator('#cancel-blank-corners').click();
    assert.equal(await canvas.evaluate((element) => element.toDataURL()), rectified);
    assert.equal(await region.inputValue(), selectedRegion);
    assert.equal(await page.locator('#profile-blocks').innerText(), blocks);
    assert.equal(await page.locator('#enroll-profile').isEnabled(), true);
  }, { isMobile: true, hasTouch: true });

  await group('Automatic discovery exposes incomplete geometry and permits explicit correction', async (page) => {
    const fixture = discoveryControl;
    const block = fixture.components[0];
    await selectImage(page, fixtureFilePath(fixture.blank), 'incomplete-blank.png', 'image/png', '#setup-profile');
    const panel = page.locator('#profile-editor');
    await panel.waitFor();
    await page.locator('#profile-name').fill('Recovered discovery QA');
    await page.locator('#discovery-status[data-status="review"]').waitFor();
    const save = page.locator('#enroll-profile');
    if ((await save.isVisible()) && (await save.isEnabled())) await save.click();
    await installAdapters(page);
    assert.deepEqual(await page.evaluate(() => window.m3qa.listProfiles()), [], 'An incomplete automatic proposal entered profile storage');
    const clear = page.locator('#clear-discovery');
    if (await clear.isVisible()) await clear.click();
    else await page.locator('#review-discovery').click();
    await page.locator('#profile-grid-controls').waitFor();
    const bounds = scaleBounds(block.bounds);
    const values = { 'region-x': bounds.x, 'region-y': bounds.y, 'region-width': bounds.width, 'region-height': bounds.height,
      'grid-rows': block.rows, 'grid-columns': block.columns, 'item-prefix': 'Q', 'item-start': 1, 'grid-symbols': 'A,B,C,D',
      'grid-first-x': block.topLeft.x / 2, 'grid-first-y': block.topLeft.y / 2,
      'grid-across-x': block.topRight.x / 2, 'grid-across-y': block.topRight.y / 2,
      'grid-down-x': block.bottomLeft.x / 2, 'grid-down-y': block.bottomLeft.y / 2, 'grid-radius': block.radius / 2,
    };
    await page.locator('details').filter({ hasText: 'Adjust grid endpoints' }).locator('summary').click();
    for (const [id, value] of Object.entries(values)) await page.locator(`#${id}`).fill(String(value));
    await page.locator('#apply-grid-endpoints').click();
    await page.locator('#confirm-block').click();
    assert.equal(await page.locator('#profile-blocks > li').count(), 1);
    assert.deepEqual(await page.evaluate(() => window.m3qa.listProfiles()), [], 'A corrected draft must still be explicitly saved');
    await save.click();
    await panel.waitFor({ state: 'hidden' });
    const [profile] = await page.evaluate(() => window.m3qa.listProfiles());
    assert.deepEqual(profile.components.flatMap(({ items }) => items.map(({ id }) => id)), fixture.truth.map(({ id }) => id));
    await confirmAndRead(page, fixtureFilePath(fixture.filled), 'recovery-marked.jpg', 'image/jpeg', fixture.truth);
  });

  await group('M3 teacher UI authors an automatic, parametric and individually corrected profile', async (page) => {
    const family = families[0];
    const file = fixtureFilePath(family.blank);
    const initialChooser = page.waitForEvent('filechooser');
    await page.locator('#setup-profile').click();
    await (await initialChooser).setFiles(file);
    const panel = page.locator('#profile-editor');
    await panel.waitFor();
    await page.locator('#profile-name').fill('Independent UI calibration');
    await page.locator('#discovery-status:is([data-status="proposed"], [data-status="review"], [data-status="needs-corners"])').waitFor();
    const manual = page.locator('#clear-discovery');
    if ((await manual.isVisible()) && (await manual.isEnabled())) await manual.click();
    const gridControls = page.locator('#profile-grid-controls');
    if (!(await gridControls.isVisible())) await page.locator('#apply-blank-corners').click();
    await gridControls.waitFor();

    async function entries(values) {
      for (const [key, value] of Object.entries(values)) await page.locator(`#${key}`).fill(String(value));
    }
    async function region(bounds) {
      const normalized = scaleBounds(bounds);
      await entries({ 'region-x': normalized.x, 'region-y': normalized.y, 'region-width': normalized.width, 'region-height': normalized.height });
    }
    const [detected, parametric] = family.components;
    await region(detected.bounds);
    await entries({ 'grid-rows': detected.rows, 'grid-columns': detected.columns, 'item-prefix': 'A', 'item-start': 1, 'grid-symbols': 'A,B,C,D' });
    await page.locator('#detect-grid').click();
    const positions = page.locator('#cell-selector option');
    assert.equal(await positions.count(), detected.rows * detected.columns);
    await page.locator('details').filter({ hasText: 'Correct an individual bubble' }).locator('summary').click();
    const firstX = Number(await page.locator('#cell-x').inputValue());
    const corrected = firstX + 1.25;
    await entries({ 'cell-x': corrected });
    await page.locator('#apply-cell').click();
    await page.locator('#confirm-block').click();
    assert.equal(await page.locator('#profile-blocks > li').count(), 1);

    await region(parametric.bounds);
    await entries({ 'grid-rows': parametric.rows, 'grid-columns': parametric.columns, 'item-prefix': 'B', 'item-start': 1, 'grid-symbols': 'A,B,C,D,E' });
    await page.locator('details').filter({ hasText: 'Adjust grid endpoints' }).locator('summary').click();
    await entries({ 'grid-first-x': parametric.topLeft.x / 2, 'grid-first-y': parametric.topLeft.y / 2,
      'grid-across-x': parametric.topRight.x / 2, 'grid-across-y': parametric.topRight.y / 2,
      'grid-down-x': parametric.bottomLeft.x / 2, 'grid-down-y': parametric.bottomLeft.y / 2, 'grid-radius': parametric.radius / 2 });
    await page.locator('#apply-grid-endpoints').click();
    assert.equal(await positions.count(), parametric.rows * parametric.columns);
    await page.locator('#confirm-block').click();
    assert.equal(await page.locator('#profile-blocks > li').count(), 2);
    await page.locator('#enroll-profile').click();
    await panel.waitFor({ state: 'hidden', timeout: 6000 });
    await installAdapters(page);
    const enrolled = await page.evaluate(() => window.m3qa.listProfiles());
    assert.equal(enrolled.length, 1);
    assert.deepEqual(enrolled[0].components.flatMap(({ items }) => items.map(({ id }) => id)), family.components.flatMap(({ items }) => items.map(({ id }) => id)));
    assert(Math.abs(enrolled[0].components[0].items[0].choices[0].x - corrected) < .02);
    assert.deepEqual(enrolled[0].components[1].items[0].choices.map(({ symbol }) => symbol), ['A', 'B', 'C', 'D', 'E']);
  });

  await group('Mobile viewport keeps page pose, orientation, response layout and answer reading distinct', async (page) => {
    const [weak, first, second] = poses.scenes;
    const oracle = JSON.parse(await readFile(resolve(appPath, 'fixtures/m3/mixed-key.json'), 'utf8'));
    const truth = oracle.itemOrder.map((id) => ({ id, status: oracle.expected[id].state, value: oracle.expected[id].rawText, review: false }));
    const capture = (file, control) => selectImage(page, fixtureFilePath(file), 'independent-capture.jpg', 'image/jpeg', control);
    const stage = (name) => page.locator(`#scan-diagnostics [data-stage="${name}"]`);
    const retake = page.locator('#recognition-status[data-status="retake"]');
    const rows = page.locator('#recognition-results [data-item-id]');
    const overlay = page.locator('#recognition-overlay');
    const editor = page.locator('#profile-editor');
    await installAdapters(page);
    assert(await page.evaluate(() => window.innerWidth === 390 && document.documentElement.scrollWidth <= 390 && navigator.maxTouchPoints > 0));

    // The previous runtime showed an apparently complete four-item overlay on this exact weak blank.
    await capture(weak.blank, '#setup-profile');
    await editor.waitFor();
    await page.locator('#profile-name').fill('Independent mobile template');
    await page.locator('#discovery-status[data-status="proposed"]').waitFor();
    await page.locator('#profile-canvas').waitFor();
    assert.equal(await page.locator('#profile-blocks > li').count(), oracle.blocks.length);
    assert.deepEqual(await page.evaluate(() => window.m3qa.listProfiles()), []);
    await page.locator('#enroll-profile').tap();
    await editor.waitFor({ state: 'hidden' });
    const [profile] = await page.evaluate(() => window.m3qa.listProfiles());
    assertDiscoveredMapping(profile, oracle);

    async function verifyRead(file, poseStatus) {
      await capture(file);
      await assertReadRows(page, truth);
      assert(await overlay.isVisible());
      for (const [name, status] of [['page-pose', poseStatus], ['orientation', 'verified'], ['response-geometry', 'verified']]) {
        const evidence = stage(name);
        assert(await evidence.isVisible(), `${name} must be visible`);
        assert.equal(await evidence.getAttribute('data-status'), status, name);
      }
    }
    async function next() {
      await page.locator('#scan-next').tap();
      assert.equal(await rows.count(), 0);
      assert.equal(await page.locator('#profile-selector').inputValue(), `${profile.id}@${profile.revision}`);
    }

    await page.locator('#scan-completed').tap();
    await verifyRead(first.filled, 'verified');
    await next();
    await verifyRead(weak.filled, 'recovered');
    await next();
    await capture(poses.missingBlock);
    await retake.waitFor();
    assert.equal(await rows.count(), 0);
    assert.equal(await stage('page-pose').getAttribute('data-status'), 'verified');
    assert.equal(await stage('response-geometry').getAttribute('data-status'), 'failed');
    assert.match(await stage('response-geometry').textContent(), /NR4:/);
    assert.equal(await overlay.isVisible(), false);
    await next();
    await capture(poses.mirror);
    await retake.waitFor();
    assert.equal(await rows.count(), 0);
    assert.equal(await stage('orientation').getAttribute('data-status'), 'mirrored');
    assert.equal(await overlay.isVisible(), false);
    await next();
    await verifyRead(second.filled, 'verified');
    console.log(`  390×844 Chromium touch emulation: three complete exact scans of ${truth.length} answers each, two staged retakes with zero answers.`);
  }, { isMobile: true, hasTouch: true });

  await group('Exact attached interleaved crop, virtual alignment, marked overlays and missing response safety', async (page) => {
    await installAdapters(page);
    const source = resolve(appPath, 'fixtures/m3');
    const key = JSON.parse(await readFile(resolve(source, 'interleaved-key.json'), 'utf8'));
    const blankTruth = key.itemOrder.map((id) => ({ id, status: 'blank', value: key.expected[id].kind === 'nr' ? '    ' : null, review: false }));
    const filledTruth = key.itemOrder.map((id) => ({ id, status: key.expected[id].state, value: key.expected[id].rawText, review: false }));
    const editor = page.locator('#profile-editor');
    const overlay = page.locator('#recognition-overlay');
    const status = page.locator('#recognition-status');
    const stage = (name) => page.locator(`#scan-diagnostics [data-stage="${name}"]`);
    const settled = status.and(page.locator('[data-status="read"], [data-status="retake"], [data-status="error"]'));

    async function enrollBlank(path, name, mimeType) {
      await selectImage(page, path, name, mimeType, '#setup-profile');
      await editor.waitFor();
      await page.locator('#profile-name').fill(name);
      const proposal = page.locator('#discovery-status:is([data-status="proposed"], [data-status="review"], [data-status="needs-corners"])');
      await proposal.waitFor();
      assert.equal(await proposal.getAttribute('data-status'), 'proposed', await proposal.textContent());
      await page.locator('#enroll-profile').click();
      await editor.waitFor({ state: 'hidden' });
      const profiles = await page.evaluate(() => window.m3qa.listProfiles());
      const profile = profiles.find((value) => value.name === name);
      assertDiscoveredMapping(profile, key);
      return profile;
    }

    const original = await enrollBlank(resolve(source, 'interleaved-blank.png'), 'Cropped regression original', 'image/png');
    const attached = { id: 'attachment', complete: true, ...interleavedCrop.attachment };
    const cases = [attached, ...interleavedCrop.filled];
    for (const fixture of cases) {
      const base64 = fixture === attached
        ? await readFile(cropAttachment, 'base64')
        : await encoded(fixture.file);
      const result = await page.evaluate(async ({ base64, fixture, profile }) => {
        const image = await window.m3qa.loadImage(base64, fixture.id);
        return window.m3qa.readProfileSheet(image, profile, { batch: { profileId: profile.id, revision: profile.revision } });
      }, { base64, fixture, profile: original });
      if (!fixture.complete) {
        assertRetake(result, fixture.id);
        assert(result.registration.reasons.some((reason) => ['response-geometry', 'clipped-content'].includes(reason)), result.registration.reasons.join(', '));
        assert.equal(result.registration.diagnostics.responseGeometry.status, 'failed', fixture.id);
        continue;
      }
      assertExactRead(result, fixture === attached ? blankTruth : filledTruth, fixture.id);
      const residuals = geometryErrors({ components: key.blocks }, fixture.pageToSource, result.registration.pageToSource);
      const maximum = Math.max(...residuals);
      assert(maximum <= .75, `${fixture.id} maximum projection error ${maximum.toFixed(3)} local radii`);
      assert.equal(result.registration.diagnostics.orientation.status, 'verified', fixture.id);
      assert.equal(result.registration.diagnostics.responseGeometry.status, 'verified', fixture.id);
      if (fixture.id === 'attachment' || fixture.id === 'attachment-measured') {
        assert.equal(result.registration.diagnostics.pagePose.status, 'recovered');
        assert(result.registration.diagnostics.pagePose.corners.some(({ x, y }) => x < 0 || y < 0 || x > fixture.width || y > fixture.height), 'Expected a virtual page corner beyond the image');
      }
      console.log(`  Interleaved ${fixture.id}: ${result.items.length} exact; max projection ${maximum.toFixed(3)} local radii.`);
    }

    async function capture(path, file, mimeType, expected, truth) {
      await selectImage(page, path, file, mimeType);
      await settled.waitFor();
      assert.equal(await status.getAttribute('data-status'), expected, await status.textContent());
      if (truth) await assertReadRows(page, truth);
    }
    await page.locator('#scan-completed').click();
    await capture(resolve(source, 'interleaved-filled.png'), 'plain.png', 'image/png', 'read', filledTruth);
    await page.locator('#scan-next').click();
    await capture(cropAttachment, 'mock-blank.jpeg', 'image/jpeg', 'read', blankTruth);
    assert.equal(await stage('page-pose').getAttribute('data-status'), 'recovered');
    await page.locator('#scan-next').click();
    const measured = interleavedCrop.filled.find(({ id }) => id === 'attachment-measured');
    await capture(fixtureFilePath(measured.file), 'marked.jpeg', 'image/jpeg', 'read', filledTruth);
    assert(await overlay.isVisible());
    const witnessIds = ['MC1', 'MC16', 'NR1', 'NR2'];
    const witnesses = key.blocks.flatMap(({ items }) => items).filter(({ id }) => witnessIds.includes(id)).flatMap((item) => {
      const choices = item.kind === 'mc' ? [item.choices] : item.slots.map(({ choices }) => choices);
      const answers = item.kind === 'mc' ? [key.expected[item.id].rawText] : key.expected[item.id].slots;
      return choices.flatMap((options, index) => {
        const selection = options.find(({ symbol }) => symbol === answers[index]);
        if (!selection) return [];
        const { x, y, radius } = selection;
        const center = point(measured.pageToSource, x, y);
        return [{ ...center, radius: distance(center, point(measured.pageToSource, x + radius, y)) }];
      });
    });
    const painted = await overlay.evaluate((canvas, witnesses) => {
      const context = canvas.getContext('2d');
      return witnesses.map(({ x, y, radius }) => {
        const half = Math.ceil(radius * 1.85);
        const pixels = context.getImageData(Math.round(x) - half, Math.round(y) - half, 2 * half + 1, 2 * half + 1);
        let colors = 0;
        for (let i = 0; i < pixels.data.length; i += 4) {
          const pixel = i / 4;
          const gap = Math.hypot(pixel % pixels.width - half, Math.floor(pixel / pixels.width) - half);
          if (gap >= radius * .55 && gap <= radius * 1.8 && pixels.data[i + 3] > 127) colors++;
        }
        return colors > 12;
      });
    }, witnesses);
    assert(painted.every(Boolean), `Marked overlay was displaced at ${painted.filter((value) => !value).length} of ${witnesses.length} observed centers`);
    await page.locator('#scan-next').click();
    const clipped = interleavedCrop.filled.find(({ complete }) => !complete);
    await capture(fixtureFilePath(clipped.file), 'clipped.jpeg', 'image/jpeg', 'retake');
    assert.equal(await page.locator('#recognition-results [data-item-id]').count(), 0);
    assert.equal(await overlay.isVisible(), false);
    assert.equal(await stage('response-geometry').getAttribute('data-status'), 'failed');
  });

  await group('M3.2 confirmed-batch successive scans, invalidation, privacy and offline validation', async (page, context) => {
    await installAdapters(page);
    const family = families[1];
    const profile = await enroll(page, family);
    await page.evaluate((profile) => window.m3qa.saveProfile(profile), profile);
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.delayProfileResults = false;
      window.delayedProfileResults = [];
      function intercept(handler, worker) {
        return (event) => {
          if (window.delayProfileResults) window.delayedProfileResults.push(() => handler.call(worker, event));
          else handler.call(worker, event);
        };
      }
      window.Worker = class extends NativeWorker {
        addEventListener(type, handler, options) {
          return super.addEventListener(type, type === 'message' ? intercept(handler, this) : handler, options);
        }
        set onmessage(handler) { super.onmessage = handler ? intercept(handler, this) : handler; }
        get onmessage() { return super.onmessage; }
      };
    });
    await page.reload();
    const selector = page.locator('#profile-selector');
    await selector.locator('option').filter({ hasText: 'QA mixed' }).first().waitFor({ state: 'attached' });
    const active = await selector.locator('option').filter({ hasText: 'QA mixed' }).first().getAttribute('value');
    assert.equal(active, `${profile.id}@${profile.revision}`);
    await selector.selectOption(active);
    const rows = page.locator('#recognition-results [data-item-id]');
    const observed = page.locator('#recognition-status');
    const pin = page.locator('#profile-pin');
    const activePin = pin.filter({ hasText: 'Batch active for QA mixed, revision 1.' });
    const nextSheet = page.locator('#scan-next');
    const captureControls = page.locator('#marked-capture-controls');
    const sent = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    context.on('request', (request) => sent.push({ url: new URL(request.url()), method: request.method(), data: request.postData() }));

    async function choose(fixture) {
      const chooser = page.waitForEvent('filechooser');
      await page.locator('#choose-image').click();
      await (await chooser).setFiles(fixtureFilePath(fixture.file));
      assert.equal(await selector.inputValue(), active, 'Profile selection changed between scans');
    }
    async function assertReadyForCapture() {
      await activePin.waitFor();
      await captureControls.waitFor();
      assert.equal(await nextSheet.isVisible(), false, 'An empty capture should offer capture controls');
      assert.equal(await selector.inputValue(), active);
    }
    async function next() {
      await nextSheet.waitFor();
      await nextSheet.click();
      assert.equal(await rows.count(), 0, 'Previous result carried to the next capture');
      await assertReadyForCapture();
    }
    async function start() {
      const startButton = page.locator('#scan-completed');
      await pin.filter({ hasText: 'QA mixed, revision 1, selected.' }).waitFor();
      assert.equal(await selector.inputValue(), active);
      // Use keyboard activation here. Pointer activation is covered by the enrollment and mobile flows.
      await startButton.press('Enter');
      await activePin.waitFor({ timeout: 5000 }).catch(async (error) => {
        throw new Error(`Scan session did not start. Pin: ${await pin.textContent()}. Page errors: ${pageErrors.join('; ')}`, { cause: error });
      });
      await assertReadyForCapture();
    }
    async function assertNotReading() {
      await page.locator('#scan-completed').waitFor();
      assert.equal(await page.locator('#marked-capture-controls').isVisible(), false);
      assert(!['processing', 'read'].includes(await observed.getAttribute('data-status')));
      assert.equal(await rows.count(), 0);
    }

    await assertNotReading();
    await start();
    await choose(family.fixtures[0]);
    await assertReadRows(page, family.fixtures[0].truth);
    assert.equal(await observed.getAttribute('data-strategy'), 'markerless');
    assert.equal(await observed.getAttribute('data-profile-id'), profile.id);
    assert.equal(await observed.getAttribute('data-revision'), String(profile.revision));
    const changedPrint = family.fixtures.find(({ id }) => id === 'wrong-same-grid');
    await next();
    await choose(changedPrint);
    await assertReadRows(page, changedPrint.truth);
    const missing = family.fixtures.find(({ id }) => id === 'missing-block');
    await next();
    await choose(missing);
    const retake = observed.and(page.locator('[data-status="retake"]'));
    await retake.waitFor();
    assert.equal(await rows.count(), 0);
    assert.equal(await page.locator('#scan-next').isVisible(), true, 'A retake must not end the batch');
    await page.locator('#manual-corners').click();
    await page.locator('#scan-corner-canvas').waitFor();
    await page.locator('#apply-scan-corners').click();
    await retake.waitFor();
    assert.equal(await rows.count(), 0, 'Manually supplied geometry must not excuse a missing block');
    await next();
    await choose(family.fixtures[4]);
    await assertReadRows(page, family.fixtures[4].truth);
    await page.locator('#clear-image').click();
    assert.equal(await rows.count(), 0);
    await assertReadyForCapture();
    await page.evaluate(() => { window.delayProfileResults = true; });
    await choose(family.fixtures[0]);
    await page.waitForFunction(() => window.delayedProfileResults.length > 0);
    await selector.selectOption('reference');
    await page.evaluate(() => {
      window.delayProfileResults = false;
      window.delayedProfileResults.splice(0).forEach((deliver) => deliver());
    });
    assert.equal(await rows.count(), 0, 'Batch/profile switch allowed a late result to appear');
    assert.notEqual(await observed.getAttribute('data-status'), 'read');
    await selector.selectOption(active);
    await assertNotReading();
    await start();
    await page.locator('#profile-advanced summary').click();
    await page.locator('#end-batch').click();
    await assertNotReading();
    const appRelease = await page.evaluate(async (url) => (await import(url)).shellAssets, new URL('precache.generated.js', target).href);
    const allowed = new Set(['./', ...Object.keys(appRelease), 'sw.js', 'precache.generated.js'].map((path) => new URL(path, target).href));
    for (const { url, method, data } of sent) {
      assert.equal(method, 'GET');
      assert.equal(data, null);
      assert.equal(url.origin, server.origin);
      assert(url.protocol === 'blob:' || allowed.has(url.href), `${url.href} was not an approved static resource`);
    }
    await installAdapters(page);
    const afterScopes = await page.evaluate(async () => ({
      profiles: await window.m3qa.listProfiles({ allRevisions: true }), local: Object.keys(localStorage), session: Object.keys(sessionStorage),
      dbs: (await indexedDB.databases()).map(({ name }) => name),
    }));
    assert.deepEqual(afterScopes.profiles, [profile]);
    assert.deepEqual(afterScopes.local, []);
    assert.deepEqual(afterScopes.session, []);
    assert.deepEqual(afterScopes.dbs, ['talus-scree-mark-profiles']);
    const durableKeys = await page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('talus-scree-mark-profiles', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const stores = [...database.objectStoreNames];
      database.close();
      const cachesInUse = await caches.keys();
      const assets = (await Promise.all(cachesInUse.map(async (name) => (await (await caches.open(name)).keys()).map(({ url }) => url)))).flat().sort();
      return { stores, assets };
    });
    assert.deepEqual(durableKeys.stores, ['profiles']);
    assert.deepEqual(durableKeys.assets, Object.keys(appRelease).map((path) => new URL(path, target).href).sort());

    const beforeOffline = server.requests.length;
    await context.setOffline(true);
    await page.reload();
    await selector.locator('option').filter({ hasText: 'QA mixed' }).first().waitFor({ state: 'attached' });
    assert.equal(await rows.count(), 0);
    await selector.selectOption(active);
    await assertNotReading();
    await start();
    await choose(family.fixtures[0]);
    await assertReadRows(page, family.fixtures[0].truth);
    assert.equal(server.requests.length, beforeOffline);
  });

  await group('M3 profile-only persistence, revision immutability and offline reload', async (page, context) => {
    await installAdapters(page);
    const profile = await enroll(page, families[0]);
    const lifecycle = await page.evaluate(async (profile) => {
      const modules = window.m3qa;
      const before = await indexedDB.databases();
      const beforeProfiles = await modules.listProfiles();
      const extras = { blankPixels: [71, 72, 73], capturedImage: 'MOCK-IMAGE', recognizedAnswers: ['A'], studentName: 'SYNTHETIC-INPUT' };
      await modules.saveProfile({ ...profile, ...extras });
      const first = await modules.loadProfile(profile.id, 1);
      let duplicateRejected = false;
      try { await modules.saveProfile({ ...profile, name: 'Illegal overwrite' }); } catch { duplicateRejected = true; }
      await modules.saveProfile({ ...profile, revision: 2, name: 'Intentional revision' });
      return { before, beforeProfiles, first, firstAfter: await modules.loadProfile(profile.id, 1), duplicateRejected,
        latest: await modules.listProfiles(), all: await modules.listProfiles({ allRevisions: true }) };
    }, profile);
    assert.deepEqual(lifecycle.before, []);
    assert.deepEqual(lifecycle.beforeProfiles, []);
    assert(lifecycle.duplicateRejected);
    assert.deepEqual(lifecycle.first, lifecycle.firstAfter);
    assert.deepEqual(lifecycle.latest.map(({ revision }) => revision), [2]);
    assert.deepEqual(lifecycle.all.map(({ revision }) => revision), [1, 2]);
    assert(!JSON.stringify(lifecycle.first).match(/MOCK-IMAGE|SYNTHETIC-INPUT|recognizedAnswers|blankPixels/));
    assert.deepEqual(Object.keys(lifecycle.first).sort(), ['allowManualIdentity', 'components', 'features', 'id', 'name', 'page', 'provenance', 'revision', 'schemaVersion', 'strategy']);
    assert(lifecycle.first.features.every(({ bounds, samples }) => bounds && Array.isArray(samples) && samples.every(Number.isFinite)));
    await context.setOffline(true);
    await page.reload();
    await installAdapters(page);
    const persisted = await page.evaluate(() => window.m3qa.listProfiles());
    assert.deepEqual(persisted, lifecycle.latest);
    await page.evaluate(async (id) => { await window.m3qa.deleteProfile(id); }, profile.id);
    assert.deepEqual(await page.evaluate(() => window.m3qa.listProfiles({ allRevisions: true })), []);
  });
} finally {
  await browser.close();
  await server.close();
}
if (failures) process.exitCode = 1;
