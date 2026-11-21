import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openServer, projectPath } from '../m1/server.mjs';

const { chromium } = await import(process.env.TALUS_TEST_PLAYWRIGHT_PATH || 'playwright');
const appPath = process.argv[2];
assert(appPath, 'Provide the static app path');
const fixtureFolder = new URL('./fixtures/', import.meta.url);
const { families } = JSON.parse(await readFile(new URL('oracles.json', fixtureFolder), 'utf8'));
assert(families.length === 3 && families.every(({ fixtures }) => fixtures.filter(({ mode }) => mode === 'standard').length >= 8));
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

async function withPage(check) {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(target);
    await page.waitForFunction(() => /^Offline ready\b/i.test(document.querySelector('#offline-status').textContent.trim()));
    await check(page, context);
  } finally { await context.close(); }
}

async function group(name, check) {
  try {
    await withPage(check);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}

async function installAdapters(page) {
  await page.evaluate(async ({ authoring, registration, recognition, storage }) => {
    window.m3qa = {
      ...(await import(authoring)), ...(await import(registration)), ...(await import(recognition)), ...(await import(storage)),
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
  }, { authoring: appSource('profile-authoring.js'), registration: appSource('markerless-registration.js'), recognition: appSource('profile-omr.js'), storage: appSource('profile-store.js') });
}

async function enroll(page, family, allowManualIdentity = true) {
  const data = {
    base64: await encoded(family.blank), id: family.id, page: pageShape, components: family.components.map(scaleComponent),
    boxes: family.features.map((bounds, index) => ({ id: `check-${index + 1}`, bounds: scaleBounds(bounds) })), allowManualIdentity,
  };
  return page.evaluate(async ({ base64, id, page, components, boxes, allowManualIdentity }) => {
    const image = await window.m3qa.loadImage(base64, `${id}-blank`);
    const features = await window.m3qa.capturePrintedFeatures(image, [2, 0, 0, 0, 2, 0, 0, 0, 1], boxes);
    return window.m3qa.createMarkerlessProfile({ id, revision: 1, name: `QA ${id}`, page, components, features, allowManualIdentity });
  }, data);
}

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
  }, { base64: await encoded(fixture.file), id: `${family.id}-${fixture.id}`, profile, options });
}

function validateNoAccepted(result, label) {
  assert(!result.items?.some(({ review }) => review === false), label);
}

try {
  console.log(`Desktop Chromium ${browser.version()} at ${target}`);
  await group('M3 three calibration levels and mapping validation', async (page) => {
    await installAdapters(page);
    const family = families[0];
    const block = family.components[0];
    const levels = await page.evaluate(async ({ base64, block, profilePage, reference, boxes }) => {
      const image = await window.m3qa.loadImage(base64, 'calibration-blank');
      const proposed = await window.m3qa.proposeGrid(image, [2, 0, 0, 0, 2, 0, 0, 0, 1], block.bounds, { rows: block.rows, columns: block.columns });
      const arranged = await window.m3qa.manualGrid(block);
      const custom = structuredClone(reference);
      custom[0].items[0].choices[0].x += 1.25;
      const features = await window.m3qa.capturePrintedFeatures(image, [2, 0, 0, 0, 2, 0, 0, 0, 1], boxes);
      const profile = window.m3qa.createMarkerlessProfile({ id: 'correction-test', revision: 1, name: 'Corrected cell', page: profilePage, components: custom, features });
      const invalid = structuredClone(custom);
      invalid[0].items[0].choices[1].symbol = invalid[0].items[0].choices[0].symbol;
      let invalidRejected = false;
      try {
        invalidRejected = !window.m3qa.createMarkerlessProfile({ id: 'invalid-test', revision: 1, name: 'Invalid map', page: profilePage, components: invalid, features });
      } catch { invalidRejected = true; }
      return { proposed, arranged, profile, invalidRejected };
    }, { base64: await encoded(family.blank), profilePage: pageShape, reference: family.components.map(scaleComponent),
      boxes: family.features.map((bounds, index) => ({ id: `check-${index + 1}`, bounds: scaleBounds(bounds) })),
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

  await group('M3 markerless registration, exact observations and layout identity safety across three independent families', async (page) => {
    await installAdapters(page);
    const profiles = [];
    for (const family of families) profiles.push(await enroll(page, family));
    for (const [index, family] of families.entries()) {
      const profile = profiles[index];
      assert.deepEqual(profile.components.map(({ id }) => id), family.components.map(({ id }) => id));
      const [nameLeft, nameTop, nameRight, nameBottom] = family.nameField.map((value) => value / coordinateScale);
      for (const { bounds } of profile.features) {
        assert(bounds.x + bounds.width <= nameLeft || bounds.x >= nameRight ||
          bounds.y + bounds.height <= nameTop || bounds.y >= nameBottom, 'A fixed-feature descriptor covered the synthetic name field');
      }

      const standardized = [];
      const displacements = [];
      let accepted = 0;
      let planned = 0;
      const outcomes = [];
      for (const fixture of family.fixtures) {
        const caption = `${family.id}/${fixture.id}`;
        const result = await scan(page, profile, family, fixture, { alternatives: profiles.filter(({ id }) => id !== family.id) });
        outcomes.push([fixture.id, result.status, result.registration?.reasons ?? []]);
        if (fixture.mode === 'must-retake') {
          assert.equal(result.status, 'retake', caption);
          validateNoAccepted(result, caption);
        } else if (fixture.mode === 'must-review-missing-block') {
          if (result.status === 'read') {
            const missing = new Set(family.components.at(-1).items.map(({ id }) => id));
            assert(!result.items.some(({ id, review }) => missing.has(id) && !review), `Missing block auto-accepted ${caption}`);
          } else validateNoAccepted(result, caption);
        } else if (fixture.mode === 'must-review') {
          const verified = result.status === 'read' ? result : await scan(page, profile, family, fixture, { corners: pageCorners(normalizeMatrix(fixture.pageToSource)) });
          assert.equal(verified.status, 'read', caption);
          const double = fixture.truth.find(({ status }) => status === 'multiple');
          assertObservation(verified.items.find(({ id }) => id === double.id), double);
        } else if (fixture.mode === 'standard') {
          planned += fixture.truth.length;
          const expectedMatrix = normalizeMatrix(fixture.pageToSource);
          if (result.status !== 'read') {
            validateNoAccepted(result, caption);
            // Independently known corners isolate registration from identity and mark reading.
            const manuallyAligned = await scan(page, profile, family, fixture, { corners: pageCorners(expectedMatrix) });
            assert.equal(manuallyAligned.status, 'read', `${caption} fallback: ${JSON.stringify(manuallyAligned.registration)}`);
            assert.equal(manuallyAligned.registration.cornerPath, 'manual-corners');
            for (const expected of fixture.truth) assertObservation(manuallyAligned.items.find(({ id }) => id === expected.id), expected);
            continue;
          }
          assert.deepEqual(result.items.map(({ id }) => id), fixture.truth.map(({ id }) => id));
          for (const expected of fixture.truth) {
            const actual = result.items.find(({ id }) => id === expected.id);
            if (actual.review) continue;
            assertObservation(actual, expected);
            accepted += 1;
          }
          displacements.push(...geometryErrors(profile, expectedMatrix, result.registration.pageToSource));
          standardized.push(fixture.id);
        }
      }
      displacements.sort((a, b) => a - b);
      console.log(`  ${family.id}: ${standardized.length}/8 standard fixtures read automatically, ${accepted}/${planned} items accepted, and zero wrong accepted items observed; p95 normalized displacement ${displacements[Math.ceil(displacements.length * .95) - 1]}; ${JSON.stringify(outcomes)}`);
      assert(standardized.length >= 1, `No automatic scan succeeded for ${family.id}`);
    }
    const family = families[0];
    const fixture = family.fixtures[0];
    const profile = profiles[0];
    const twin = { ...profile, id: 'same-structure-other-assessment', name: 'Other assessment' };
    const knownCorners = pageCorners(normalizeMatrix(fixture.pageToSource));
    const unsuitable = await scan(page, profile, family, fixture, { alternatives: [twin], corners: knownCorners });
    assert.notEqual(unsuitable.status, 'read', 'Indistinguishable known layouts cannot auto-verify');
    validateNoAccepted(unsuitable, 'Indistinguishable layout auto-read');
    assert(unsuitable.registration.reasons.includes('identity-confirmation'));
    const result = await scan(page, profile, family, fixture, { alternatives: [twin], corners: knownCorners, confirmedIdentity: true });
    assert.equal(result.status, 'read');
    assert.equal(result.registration.identity, 'teacher-confirmed');
    assert.equal(result.registration.automatic, false);
    for (const expected of fixture.truth) assertObservation(result.items.find(({ id }) => id === expected.id), expected);
    const next = family.fixtures[1];
    const second = await scan(page, profile, family, next, { alternatives: [twin], corners: pageCorners(normalizeMatrix(next.pageToSource)) });
    assert(second.registration.reasons.includes('identity-confirmation'), 'Identity decision must be per capture');
    validateNoAccepted(second, 'Identity reused on next capture');
    for (const forbidden of ['assessmentId', 'answerKeyId', 'assessmentVersion', 'grade']) assert(!Object.hasOwn(result, forbidden));
    const wrong = family.fixtures.find(({ id }) => id === 'wrong-same-grid');
    const withOverride = await scan(page, profile, family, wrong, { confirmedIdentity: true, corners: pageCorners(normalizeMatrix(wrong.pageToSource)) });
    validateNoAccepted(withOverride, 'Manual identity must not bypass a conflicting available signature');
  });

  await group('M3 teacher UI authors an automatic, parametric and individually corrected profile', async (page) => {
    const family = families[0];
    const file = fixtureFilePath(family.blank);
    const initialChooser = page.waitForEvent('filechooser');
    await page.locator('#choose-image').click();
    await (await initialChooser).setFiles(file);
    await page.locator('#capture-status').filter({ hasText: /Image ready to review/i }).waitFor();
    const panel = page.locator('#profile-editor');
    await page.locator('#setup-profile').click();
    await panel.waitFor();
    await page.locator('#profile-name').fill('Independent UI calibration');
    await page.locator('#apply-blank-corners').click();
    await page.locator('#profile-grid-controls').waitFor();

    async function entries(values) {
      for (const [key, value] of Object.entries(values)) await page.locator(`#${key}`).fill(String(value));
    }
    async function region(bounds) {
      const normalized = scaleBounds(bounds);
      await entries({ 'region-x': normalized.x, 'region-y': normalized.y, 'region-width': normalized.width, 'region-height': normalized.height });
    }
    for (const bounds of family.features.slice(0, 7)) {
      await region(bounds);
      await page.locator('#add-feature').click();
      assert.match(await page.locator('#editor-status').textContent(), /Printed feature added/i);
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
    assert.match(await page.locator('#editor-status').textContent(), /confirm.*before saving/i);
    await page.locator('#confirm-profile-preview').check();
    await page.locator('#enroll-profile').click();
    await panel.waitFor({ state: 'hidden', timeout: 6000 });
    await installAdapters(page);
    const enrolled = await page.evaluate(() => window.m3qa.listProfiles());
    assert.equal(enrolled.length, 1);
    assert.deepEqual(enrolled[0].components.flatMap(({ items }) => items.map(({ id }) => id)), family.components.flatMap(({ items }) => items.map(({ id }) => id)));
    assert(Math.abs(enrolled[0].components[0].items[0].choices[0].x - corrected) < .02);
    assert.deepEqual(enrolled[0].components[1].items[0].choices.map(({ symbol }) => symbol), ['A', 'B', 'C', 'D', 'E']);
  });

  await group('M3 worker-backed successive scans, revision switch, privacy and offline validation', async (page, context) => {
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
    const readButton = page.locator('#read-bubbles');
    const rows = page.locator('#recognition-results [data-item-id]');
    const observed = page.locator('#recognition-status');
    const sent = [];
    context.on('request', (request) => sent.push({ url: new URL(request.url()), method: request.method(), data: request.postData() }));

    async function choose(fixture) {
      const chooser = page.waitForEvent('filechooser');
      await page.locator('#choose-image').click();
      await (await chooser).setFiles(fixtureFilePath(fixture.file));
      await page.locator('#capture-status').filter({ hasText: /Image ready to review/i }).waitFor();
      assert.equal(await rows.count(), 0, 'Previous result carried to new capture');
      assert.equal(await selector.inputValue(), active, 'Profile selection changed between scans');
    }
    async function read() {
      await readButton.click();
      await page.waitForFunction(() => ['read', 'retake'].includes(document.getElementById('recognition-status').dataset.status));
      return observed.getAttribute('data-status');
    }

    await choose(family.fixtures[0]);
    assert.equal(await read(), 'read');
    assert.equal(await rows.count(), family.fixtures[0].truth.length);
    assert.equal(await observed.getAttribute('data-strategy'), 'markerless');
    assert.equal(await observed.getAttribute('data-profile-id'), profile.id);
    assert.equal(await observed.getAttribute('data-revision'), String(profile.revision));
    await choose(family.fixtures.find(({ id }) => id === 'wrong-same-grid'));
    assert.equal(await read(), 'retake');
    assert.equal(await rows.count(), 0);
    await choose(family.fixtures[4]);
    assert.equal(await read(), 'read');
    assert.equal(await rows.count(), family.fixtures[4].truth.length);
    await choose(family.fixtures[0]);
    await page.evaluate(() => { window.delayProfileResults = true; });
    await readButton.click();
    await page.waitForFunction(() => window.delayedProfileResults.length > 0);
    await selector.selectOption('reference');
    await page.evaluate(() => {
      window.delayProfileResults = false;
      window.delayedProfileResults.splice(0).forEach((deliver) => deliver());
    });
    assert.equal(await rows.count(), 0, 'Profile switch allowed a late result to appear');
    assert.notEqual(await observed.getAttribute('data-status'), 'read');
    await selector.selectOption(active);
    await page.locator('#clear-image').click();
    assert.equal(await rows.count(), 0);
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
    await choose(family.fixtures[0]);
    assert.equal(await read(), 'read');
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
