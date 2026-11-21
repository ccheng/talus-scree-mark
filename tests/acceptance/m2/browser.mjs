import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openServer, projectPath } from '../m1/server.mjs';

const { chromium } = await import(process.env.TALUS_TEST_PLAYWRIGHT_PATH || 'playwright');
const appPath = process.argv[2];
assert(appPath, 'Usage: node browser.mjs /absolute/candidate/app');
const profileBytes = await readFile(resolve(appPath, 'reference/profile.json'));
const profile = JSON.parse(profileBytes);
const release = await import(pathToFileURL(resolve(appPath, 'precache.generated.js')).href);
const fixturesUrl = new URL('./fixtures/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('oracles.json', fixturesUrl), 'utf8'));
assert.equal(manifest.profileDigest, createHash('sha256').update(profileBytes).digest('hex'));
const fixtures = manifest.fixtures;
const standards = fixtures.filter(({ mode }) => mode === 'standard');
const stressCount = fixtures.filter(({ mode }) => ['must-retake', 'must-review-items', 'characterize'].includes(mode)).length;
assert(standards.length >= 20 && stressCount >= 20);
const pageSource = fileURLToPath(new URL('standard-00.jpg', fixturesUrl));
const ready = (page) => page.waitForFunction(() => /^Offline ready\b/i.test(document.querySelector('#offline-status').textContent.trim()));
const resultStatus = '#recognition-status';
const resultRoot = '#recognition-results';
const readButton = '#read-bubbles';
const server = await openServer(appPath);
const target = server.origin + projectPath;
const browser = await chromium.launch({ executablePath: process.env.TALUS_TEST_CHROMIUM, headless: true });
let failures = 0;

async function inContext(f) {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  try { await f(context); } finally { await context.close(); }
}

async function openProject(context) {
  const page = await context.newPage();
  await page.goto(target);
  await ready(page);
  return page;
}

async function choose(page, path) {
  const event = page.waitForEvent('filechooser');
  await page.locator('#choose-image').click();
  await (await event).setFiles(path);
  await page.locator('#capture-status').filter({ hasText: /Image ready to review/i }).waitFor();
  await page.locator('#image-preview:not([hidden])').waitFor();
  await page.locator(`${readButton}:enabled`).waitFor();
}

async function runRead(page, expectedStatus) {
  await page.locator(readButton).click();
  await page.locator(`${resultStatus}[data-status="${expectedStatus}"]`).waitFor({ state: 'visible', timeout: 8000 });
}

async function disposable(name, test) {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}

function itemSummary(item) {
  return { id: item.id, status: item.status, rawText: item.rawText, review: item.review, reasons: item.reasons };
}

function verifyTruth(actual, expected, mode) {
  const summary = itemSummary(actual);
  const label = `${expected.id}: ${JSON.stringify(summary)} vs ${JSON.stringify(expected)}`;
  const normalizedStatus = expected.status === 'recognized' || expected.status === 'literal-review' ? 'single' : expected.status;
  const uncertain = !['single', 'blank'].includes(normalizedStatus) || expected.status === 'literal-review';
  if (mode === 'characterize' && (actual.review || !['single', 'blank'].includes(actual.status))) return;
  assert.equal(actual.status, normalizedStatus, label);
  assert.equal(actual.rawText, expected.rawText, label);
  assert.equal(actual.review, uncertain, label);
  if (expected.status === 'literal-review') assert(actual.reasons.includes('nr-format'), label);
  for (const group of actual.kind === 'nr' ? actual.slots : [actual]) {
    assert(Array.isArray(group.choices) && group.choices.length >= 4, label);
    assert(group.choices.every(({ score, quality, evidence }) =>
      (score === null || Number.isFinite(score) && score >= 0 && score <= 1) &&
      typeof quality?.usable === 'boolean' && Boolean(evidence?.source)), label);
  }
  if (actual.kind === 'nr') {
    assert.equal(actual.slots.length, 4, label);
    if (typeof actual.rawText === 'string') {
      assert.equal(actual.slots.map(({ symbol }) => symbol ?? ' ').join(''), actual.rawText, label);
    }
  }
}

function projection(matrix, x, y) {
  const z = matrix[6] * x + matrix[7] * y + (matrix[8] ?? 1);
  return [(matrix[0] * x + matrix[1] * y + matrix[2]) / z, (matrix[3] * x + matrix[4] * y + matrix[5]) / z];
}

function euclidean(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

const bubbleCenters = profile.items.flatMap((item) => item.kind === 'mc' ? item.choices : item.slots.flatMap((slot) => slot.choices));
const checkPoints = profile.checks.map((check) => {
  const nearest = bubbleCenters.reduce((best, point) => euclidean([check.x, check.y], [point.x, point.y]) < euclidean([check.x, check.y], [best.x, best.y]) ? point : best);
  return { ...check, radius: nearest.radius };
});

function displacement(matrix, truth, point) {
  const { x, y, radius } = point;
  const centered = projection(truth, x, y);
  const horizontal = projection(truth, x + radius, y);
  const vertical = projection(truth, x, y + radius);
  const pixelRadius = (euclidean(centered, horizontal) + euclidean(centered, vertical)) / 2;
  return euclidean(projection(matrix, x, y), centered) / pixelRadius;
}

const nonAnchorErrors = [];
const scoredResults = [];
const characterization = [];

try {
  console.log(`Desktop Chromium ${browser.version()} on ${target}, app ${release.releaseId}`);
  await disposable('M2-01 delivered reference profile, PDFs and example', () => inContext(async (context) => {
    assert.deepEqual(profile.page, { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' });
    assert.equal(profile.items.filter((item) => item.kind === 'mc').length, 12);
    assert.equal(profile.items.filter((item) => item.kind === 'nr').length, 4);
    assert.equal(new Set(profile.items.map(({ id }) => id)).size, 16);
    assert.equal(profile.anchors.length, 4);
    assert(profile.checks.length >= 6);
    assert.equal(profile.items.flatMap((item) => item.kind === 'mc' ? item.choices : item.slots).length, 64);
    const paths = ['profile.json', 'profile.sha256', 'reference-blank.pdf', 'reference-filled.pdf', 'reference-filled.png', 'reference-key.json'];
    for (const path of paths) assert((await context.request.get(`${target}reference/${path}`)).ok(), path);
    for (const pdf of ['reference-blank.pdf', 'reference-filled.pdf']) {
      assert.match(await (await context.request.get(`${target}reference/${pdf}`)).text(), /^%PDF-/);
    }
  }));

  await disposable('M2-02/03 desktop JPEG decode and direct recognition across independent fixtures', () => inContext(async (context) => {
    const page = await openProject(context);
    for (const fixture of fixtures) {
      try {
        const source = await readFile(new URL(fixture.file, fixturesUrl), 'base64');
        const result = await page.evaluate(async ({ source, id, base }) => {
          const { readReferenceSheet } = await import(new URL('src/omr.js', base));
          const bytes = Uint8Array.from(atob(source), (byte) => byte.charCodeAt(0));
          const image = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(image, 0, 0);
          image.close();
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          return readReferenceSheet({ id, width: canvas.width, height: canvas.height, pixels });
        }, { source, id: fixture.id, base: target });
        if (fixture.mode === 'must-retake') {
          assert.equal(result.status, 'retake', JSON.stringify(result.registration));
          assert.deepEqual(result.items, []);
          assert(result.registration.reasons.length > 0);
          continue;
        }
        if (fixture.mode === 'characterize') {
          characterization.push({ fixture: fixture.id, status: result.status, reasons: result.registration.reasons, reviewed: result.items.filter(({ review }) => review).length });
          if (result.status === 'retake' || fixture.truth === null) continue;
        }
        assert.equal(result.status, 'read', JSON.stringify(result.registration));
        assert.equal(result.captureId, fixture.id);
        assert.deepEqual(result.profile, { id: profile.id, revision: profile.revision, sha256: manifest.profileDigest });
        assert.equal(typeof result.algorithmVersion, 'string');
        assert.equal(typeof result.thresholdVersion, 'string');
        assert.equal(result.items.length, fixture.truth.length);
        if (fixture.mode === 'standard') {
          assert.equal(result.registration.pageToSource.length, 9);
          assert.equal(result.registration.sourceToPage.length, 9);
          const errors = [...checkPoints, ...bubbleCenters].map((point) => displacement(result.registration.pageToSource, fixture.geometry, point));
          nonAnchorErrors.push(...errors);
          assert(Math.max(...errors) <= 0.50, `maximum ${Math.max(...errors).toFixed(4)} radii`);
        }
        for (const expected of fixture.truth) verifyTruth(result.items.find((item) => item.id === expected.id), expected, fixture.mode);
        if (fixture.mode === 'standard') scoredResults.push(fixture.id);
      } catch (error) {
        failures++;
        console.error(`FAIL fixture ${fixture.id}: ${error.message.slice(0, 500)}`);
      }
    }
    nonAnchorErrors.sort((a, b) => a - b);
    assert(nonAnchorErrors.length > 0, 'No standard geometry evidence');
    const p95 = nonAnchorErrors[Math.ceil(0.95 * nonAnchorErrors.length) - 1];
    const maximum = nonAnchorErrors.at(-1);
    console.log(`  Geometry ${nonAnchorErrors.length} independent check/center observations, p95 ${p95.toFixed(4)}r, max ${maximum.toFixed(4)}r.`);
    console.log(`  ${scoredResults.length}/${standards.length} complete standard synthetic sheets match all literal answers and status oracles.`);
    console.log(`  Characterization outcomes ${JSON.stringify(characterization)}.`);
    assert(p95 <= 0.25, `p95 ${p95.toFixed(4)}r`);
    assert.equal(scoredResults.length, standards.length);
  }));

  await disposable('M2-04 a late worker response cannot overwrite cleared capture', () => inContext(async (context) => {
    await context.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.delayedRecognitionResults = [];
      function defer(handler, worker) {
        return (event) => window.delayedRecognitionResults.push(() => handler.call(worker, event));
      }
      window.Worker = class extends NativeWorker {
        addEventListener(type, handler, options) {
          return super.addEventListener(type, type === 'message' ? defer(handler, this) : handler, options);
        }
        set onmessage(handler) { super.onmessage = handler ? defer(handler, this) : handler; }
        get onmessage() { return super.onmessage; }
      };
    });
    const page = await openProject(context);
    await choose(page, pageSource);
    await page.locator(readButton).click();
    await page.waitForFunction(() => window.delayedRecognitionResults.length > 0);
    await page.locator('#clear-image').click();
    await page.evaluate(() => window.delayedRecognitionResults.splice(0).forEach((deliver) => deliver()));
    assert.equal(await page.locator(`${resultRoot} [data-item-id]`).count(), 0);
    assert.notEqual(await page.locator(resultStatus).getAttribute('data-status'), 'read');
  }));

  await disposable('M2-04 worker-backed UI, smoke privacy, cleanup and offline reread', () => inContext(async (context) => {
    const requests = [];
    context.on('request', (entry) => requests.push({ url: new URL(entry.url()), method: entry.method(), body: entry.postData() }));
    const page = await openProject(context);
    const beforeCapture = requests.length;
    const servedBeforeCapture = server.requests.length;
    await choose(page, pageSource);
    await runRead(page, 'read');
    assert.equal(await page.locator(`${resultRoot} [data-item-id]`).count(), 16);
    assert.equal(await page.locator('#recognition-overlay').count(), 1);
    const unfamiliar = fileURLToPath(new URL('alternate-layout-revision.jpg', fixturesUrl));
    await choose(page, unfamiliar);
    assert.equal(await page.locator(`${resultRoot} [data-item-id]`).count(), 0);
    await runRead(page, 'retake');
    assert.equal(await page.locator(`${resultRoot} [data-item-id]`).count(), 0);
    await page.locator('#clear-image').click();
    assert.equal(await page.locator(`${resultRoot} [data-item-id]`).count(), 0);
    const allowed = new Set(['./', ...Object.keys(release.shellAssets), 'sw.js', 'precache.generated.js'].map((asset) => new URL(asset, target).href));
    for (const { url, method, body } of requests.slice(beforeCapture)) {
      assert.equal(method, 'GET');
      assert.equal(body, null);
      assert.equal(url.origin, server.origin);
      assert(url.protocol === 'blob:' || allowed.has(url.href), url.href);
    }
    for (const entry of server.requests.slice(servedBeforeCapture)) {
      assert.equal(entry.method, 'GET');
      assert.equal(Number(entry.bytes ?? 0), 0);
      assert(allowed.has(new URL(entry.url, server.origin).href));
    }
    const state = await page.evaluate(async () => ({
      local: Object.keys(localStorage), session: Object.keys(sessionStorage), databases: await indexedDB.databases(),
      cached: (await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map(({ url }) => url)))).flat().sort(),
    }));
    assert.deepEqual(state.local, []);
    assert.deepEqual(state.session, []);
    assert.deepEqual(state.databases, []);
    assert.deepEqual(state.cached, Object.keys(release.shellAssets).map((asset) => new URL(asset, target).href).sort());
    await page.close();
    const beforeOffline = server.requests.length;
    await context.setOffline(true);
    const cold = await openProject(context);
    assert.equal(await cold.locator(`${resultRoot} [data-item-id]`).count(), 0);
    await choose(cold, pageSource);
    await runRead(cold, 'read');
    assert.equal(await cold.locator(`${resultRoot} [data-item-id]`).count(), 16);
    assert.equal(server.requests.length, beforeOffline);
  }));
} finally {
  await browser.close();
  await server.close();
}
if (failures) process.exitCode = 1;
