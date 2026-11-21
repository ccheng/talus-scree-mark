import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.TALUS_TEST_PLAYWRIGHT_PATH || 'playwright');
import { openServer, projectPath } from './server.mjs';

const appPath = process.argv[2];
assert(appPath, 'Usage: node browser.mjs /absolute/candidate/app');
const oracle = JSON.parse(await readFile(new URL('./fixtures/oracles.json', import.meta.url), 'utf8'));
const status = '#offline-status';
const errorStatus = '#capture-status';
const visibleImage = '#image-preview:not([hidden])';
const start = '#start-camera';
const cancel = '#cancel-camera';
const shutter = '#shutter';
const foreignCache = 'independent-unrelated-cache';
const fixture = (file) => new URL(`./fixtures/${file}`, import.meta.url);
const ready = (page) => page.waitForFunction((selector) => /^Offline ready\b/i.test(document.querySelector(selector).textContent.trim()), status);
const waitText = (page, selector, pattern) => page.waitForFunction(({ selector, pattern }) => new RegExp(pattern, 'i').test(document.querySelector(selector).textContent), { selector, pattern: pattern.source });
const hiddenPreview = (page) => page.locator('#image-preview').waitFor({ state: 'hidden' });
let browser;
let server;
let target;
const checks = [];
const add = (id, f) => checks.push({ id, f });
const cdps = process.env.TALUS_TEST_CDP_URL;

async function load(context, suffix = projectPath) {
  const page = await context.newPage();
  await page.goto(`${server.origin}${suffix}`);
  return page;
}

async function scoped(f, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'allow', ...options });
  try {
    await f(context);
  } finally {
    await context.close();
  }
}

async function upload(page, file, declaredName = file, mimeType = file.endsWith('png') ? 'image/png' : 'image/jpeg') {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#choose-image').click();
  await (await chooser).setFiles({ name: declaredName, mimeType, buffer: await readFile(fixture(file)) });
}

async function assertImage(page, expected) {
  await page.locator(visibleImage).waitFor();
  await page.waitForFunction(({ width, height, corners }) => {
    const canvas = document.querySelector('#sheet-canvas');
    if (canvas.width !== width || canvas.height !== height) return false;
    const context = canvas.getContext('2d');
    const keys = [[.2, .2], [.8, .2], [.2, .8], [.8, .8]].map(([x, y]) => {
      const [r, g, b] = context.getImageData(Math.floor(x * width), Math.floor(y * height), 1, 1).data;
      if (r > 130 && g > 130 && b < 100) return 'Y';
      if (r > 130 && g < 100 && b < 100) return 'R';
      if (g > 130 && r < 100 && b < 100) return 'G';
      if (b > 130 && r < 100 && g < 100) return 'B';
      return '?';
    });
    return keys.join('') === corners.join('');
  }, expected, { timeout: 4500 });
}

async function assertScope(page, expected) {
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.scope ?? null;
  });
  assert.equal(scope, expected);
}

async function collectState(page) {
  return page.evaluate(async () => ({
    databases: (await indexedDB.databases()).map(({ name }) => name).sort(),
    locals: { ...localStorage },
    session: { ...sessionStorage },
    cache: await Promise.all((await caches.keys()).sort().map(async (name) => ({ name, keys: (await (await caches.open(name)).keys()).map((key) => key.url).sort() })))
  }));
}

async function installMock(context) {
  await context.addInitScript(() => {
    window.__cam = { pending: false, deny: false, requests: [], tracks: [], lastDeferred: null, hidden: false };
    Object.defineProperty(document, 'hidden', { get: () => window.__cam.hidden });
    Object.defineProperty(document, 'visibilityState', { get: () => window.__cam.hidden ? 'hidden' : 'visible' });
    const createStream = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      ['#e90000', '#00dc00', '#0000e9', '#ecd900'].forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect((i % 2) * 60, Math.floor(i / 2) * 40, 60, 40);
      });
      const stream = canvas.captureStream(10);
      const [track] = stream.getVideoTracks();
      window.__cam.tracks.push(track);
      track.requestFrame();
      const timer = setInterval(() => {
        if (track.readyState === 'ended') { clearInterval(timer); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 5, 5);
        track.requestFrame();
      }, 45);
      return stream;
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value(constraints) {
      window.__cam.requests.push(constraints);
      if (window.__cam.deny) return Promise.reject(new DOMException('Independent simulated denial', 'NotAllowedError'));
      if (window.__cam.pending) return new Promise((ok) => { window.__cam.lastDeferred = () => ok(createStream()); });
      return Promise.resolve(createStream());
    } });
  });
}

async function trackEnds(page, index) {
  await page.waitForFunction((index) => window.__cam.tracks[index]?.readyState === 'ended' && !document.querySelector('#camera-video').srcObject, index, { timeout: 4000 });
}

add('M1-01 path, scope, viewport and keyboard', async () => scoped(async (context) => {
  const page = await load(context, projectPath.slice(0, -1));
  assert.equal(new URL(page.url()).pathname, projectPath);
  const links = await page.locator('link[rel="manifest"], link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((nodes) => nodes.map((node) => node.href));
  assert.equal(links.length, 3);
  for (const href of links) assert(href.startsWith(target));
  const manifest = await (await context.request.get(links[0])).json();
  assert.equal(new URL(manifest.start_url, links[0]).href, target);
  assert.equal(new URL(manifest.scope, links[0]).href, target);
  for (const icon of manifest.icons) assert((await context.request.get(new URL(icon.src, links[0]).href)).ok());
  await ready(page);
  await assertScope(page, target);
  for (const outside of ['/', '/sibling/']) {
    const other = await load(context, outside);
    await assertScope(other, null);
    assert.equal(await other.title(), 'Independent unrelated page');
    await other.close();
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator(start).isVisible());
    assert(await page.locator('#choose-image').isVisible());
  }
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'start-camera');
  assert(await page.locator(start).evaluate((button) => getComputedStyle(button).outlineStyle !== 'none' || getComputedStyle(button).boxShadow !== 'none'));
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'choose-image');
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(resolve(fixture('corners.png').pathname));
  await assertImage(page, oracle['corners.png']);
}, { viewport: { width: 390, height: 844 } }));

add('M1-02 staging 404, invalid redirect and retry', async () => {
  for (const failure of [{ status: 404 }, { redirect: `${projectPath}assets/icon-192.png` }]) {
    server.fault.set('assets/icon-512.png', failure);
    try {
      await scoped(async (context) => {
        const page = await load(context);
        const retry = page.locator('#retry-offline');
        await retry.waitFor({ state: 'visible', timeout: 20000 });
        assert(!/^Offline ready\b/i.test(await page.locator(status).textContent()));
        assert.equal(await page.evaluate(() => navigator.serviceWorker.controller !== null), false);
        server.fault.delete('assets/icon-512.png');
        await retry.click();
        await ready(page);
        assert(await page.evaluate(() => navigator.serviceWorker.controller !== null));
      });
    } finally {
      server.fault.clear();
    }
  }
});

const releaseMeta = (page) => page.locator('meta[name="scree-release"]').getAttribute('content');

async function stageUpdate(page, fault) {
  return page.evaluate(async (fault) => {
    const registration = await navigator.serviceWorker.getRegistration();
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No complete update candidate was observed')), 15000);
      function watch(worker) {
        if (!worker) return;
        const inspect = () => {
          if (worker.state === 'installed' || worker.state === 'redundant') {
            clearTimeout(timer);
            resolve(worker.state);
          }
        };
        worker.addEventListener('statechange', inspect);
        inspect();
      }
      registration.addEventListener('updatefound', () => watch(registration.installing), { once: true });
      registration.update().then(() => watch(registration.installing ?? (!fault && registration.waiting))).catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return result;
  }, fault);
}

add('M1-04 failed v2, delayed activation, coherent offline v2 and repair', async () => {
  const release = await import(pathToFileURL(resolve(appPath, 'precache.generated.js')).href);
  const firstRelease = release.releaseId;
  const nextRelease = `${firstRelease}-independent-v2`;
  const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
  const changedHtml = Buffer.from((await readFile(resolve(appPath, 'index.html'), 'utf8')).replace(firstRelease, nextRelease));
  const changedStyle = Buffer.concat([await readFile(resolve(appPath, 'styles.css')), Buffer.from('\nhtml { --independent-style: candidate-v2; }\n')]);
  const nextAssets = { ...release.shellAssets, 'index.html': digest(changedHtml), 'styles.css': digest(changedStyle) };
  try {
    await scoped(async (context) => {
      let page = await load(context);
      await ready(page);
      assert.equal(await releaseMeta(page), firstRelease);
      await page.evaluate((cache) => caches.open(cache), foreignCache);
      server.override.set('index.html', changedHtml);
      server.override.set('styles.css', changedStyle);
      server.override.set('precache.generated.js', Buffer.from(`export const releaseId=${JSON.stringify(nextRelease)};\nexport const shellAssets=${JSON.stringify(nextAssets)};\n`));
      server.fault.set('styles.css', { status: 404 });
      assert.equal(await stageUpdate(page, true), 'redundant');
      assert.equal(await releaseMeta(page), firstRelease);
      await context.setOffline(true);
      await page.close();
      page = await load(context);
      await ready(page);
      assert.equal(await releaseMeta(page), firstRelease);
      const stillActive = await collectState(page);
      assert(stillActive.cache.some(({ name }) => name.endsWith(':' + firstRelease)));
      assert(stillActive.cache.some(({ name }) => name === foreignCache));
      await context.setOffline(false);
      server.fault.clear();
      assert.equal(await stageUpdate(page, false), 'installed');
      await waitText(page, status, /update is ready/);
      assert.equal(await releaseMeta(page), firstRelease);
      await page.close();
      page = await load(context);
      await ready(page);
      assert.equal(await releaseMeta(page), nextRelease);
      await context.setOffline(true);
      await page.close();
      page = await load(context);
      await ready(page);
      assert.equal(await releaseMeta(page), nextRelease);
      const newAssets = await collectState(page);
      assert(newAssets.cache.some(({ name }) => name.endsWith(':' + nextRelease)));
      assert(newAssets.cache.some(({ name }) => name === foreignCache));
      assert(!newAssets.cache.some(({ name }) => name.endsWith(':' + firstRelease)));
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--independent-style').trim()), 'candidate-v2');
      await page.evaluate(async ({ nextRelease, target }) => {
        const cache = (await caches.keys()).find((name) => name.endsWith(':' + nextRelease));
        await (await caches.open(cache)).delete(target + 'styles.css');
        document.dispatchEvent(new Event('visibilitychange'));
      }, { nextRelease, target });
      await waitText(page, status, /incomplete/);
      await context.setOffline(false);
      await page.locator('#retry-offline').click();
      await ready(page);
    });
  } finally {
    server.fault.clear();
    server.override.clear();
  }
});

add('M1-06 orientation and import rules', async () => scoped(async (context) => {
  const page = await load(context);
  for (const [file, expected] of Object.entries(oracle)) {
    await upload(page, file);
    await assertImage(page, expected);
  }
  await upload(page, 'corners-4.jpeg', 'incorrect.txt', 'text/plain');
  await assertImage(page, oracle['corners-4.jpeg']);
  for (const invalid of ['unsupported.gif', 'truncated.jpeg', 'oversized-dimension.jpeg', 'oversized-pixels.jpeg', 'oversized-encoded.jpeg']) {
    await upload(page, invalid, 'pretend.jpeg', 'image/jpeg');
    await waitText(page, errorStatus, /too large|could not be read|unsupported|exceeds|cannot read/);
    await assertImage(page, oracle['corners-4.jpeg']);
  }
  await page.locator('#clear-image').click();
  await hiddenPreview(page);
  await upload(page, 'corners.png');
  await assertImage(page, oracle['corners.png']);
  await page.reload();
  await hiddenPreview(page);
  assert.equal(await page.locator('#image-picker').inputValue(), '');
}));

add('M1-05 camera grant, error, cancel, late promise, background', async () => scoped(async (context) => {
  await installMock(context);
  const page = await load(context);
  assert.deepEqual(await page.evaluate(() => window.__cam.requests), []);
  await page.evaluate(() => { window.__cam.deny = true; });
  await page.locator(start).click();
  await waitText(page, errorStatus, /permission|access|denied|camera|allow/);
  await upload(page, 'corners.png');
  await assertImage(page, oracle['corners.png']);
  const firstRequest = await page.evaluate(() => window.__cam.requests[0]);
  assert.equal(firstRequest.audio, false);
  assert(JSON.stringify(firstRequest.video.facingMode).includes('environment'));
  await page.evaluate(() => { window.__cam.deny = false; });
  await page.locator(start).click();
  await page.locator(`${shutter}:enabled`).waitFor({ state: 'visible' });
  await page.locator(shutter).click();
  await trackEnds(page, 0);
  await waitText(page, errorStatus, /photo ready to review/);
  await assertImage(page, oracle['corners.png']);
  await page.locator(start).click();
  await page.locator(`${shutter}:enabled`).waitFor({ state: 'visible' });
  await page.locator(cancel).click();
  await trackEnds(page, 1);
  await page.evaluate(() => { window.__cam.pending = true; });
  await page.locator(start).click();
  await page.waitForFunction(() => window.__cam.lastDeferred !== null);
  assert(await page.locator(shutter).isDisabled());
  await page.locator(cancel).click();
  await page.evaluate(() => { window.__cam.lastDeferred(); window.__cam.pending = false; });
  await trackEnds(page, 2);
  await page.locator(start).click();
  await page.locator(`${shutter}:enabled`).waitFor({ state: 'visible' });
  await page.evaluate(() => { window.__cam.hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  await trackEnds(page, 3);
  await page.evaluate(() => { window.__cam.hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.evaluate(() => window.__cam.tracks.length), 4);
  assert(await page.locator(start).isVisible());
}));

add('M1-03 simulated offline reopen and M1-07 online/offline privacy', async () => scoped(async (context) => {
  await installMock(context);
  const requestLog = [];
  context.on('request', (request) => {
    requestLog.push({ url: request.url(), method: request.method(), worker: Boolean(request.serviceWorker()), body: request.postData() });
  });
  let page = await load(context);
  await ready(page);
  const baseline = await collectState(page);
  assert(baseline.cache.length > 0);
  assert.deepEqual(baseline.databases, []);
  assert.deepEqual(baseline.locals, {});
  assert.deepEqual(baseline.session, {});
  const onlineStart = requestLog.length;
  await upload(page, 'corners-2.jpeg', 'unique-synthetic-name.jpeg');
  await assertImage(page, oracle['corners-2.jpeg']);
  await upload(page, 'unsupported.gif', 'unique-synthetic-invalid.jpeg');
  await waitText(page, errorStatus, /unsupported|could not be read/);
  await page.locator(start).click();
  await page.locator(`${shutter}:enabled`).waitFor({ state: 'visible' });
  await page.locator(shutter).click();
  await assertImage(page, oracle['corners.png']);
  await page.locator('#clear-image').click();
  assert.deepEqual(await collectState(page), baseline);
  const onlineWorkflow = requestLog.slice(onlineStart);
  await context.setOffline(true);
  const beforeCold = server.requests.length;
  await page.close();
  page = await load(context);
  await ready(page);
  await hiddenPreview(page);
  const offlineStart = requestLog.length;
  await upload(page, 'corners-3.jpeg');
  await assertImage(page, oracle['corners-3.jpeg']);
  await page.locator(start).click();
  await page.locator(`${shutter}:enabled`).waitFor({ state: 'visible' });
  await page.locator(shutter).click();
  await assertImage(page, oracle['corners.png']);
  assert.deepEqual(await collectState(page), baseline);
  assert.equal(server.requests.length, beforeCold);
  const staticPaths = new Set([target, ...baseline.cache.flatMap(({ keys }) => keys)]);
  for (const entry of [...onlineWorkflow, ...requestLog.slice(offlineStart)]) {
    assert.equal(entry.method, 'GET');
    assert.equal(entry.body, null);
    assert(staticPaths.has(entry.url), `unexpected request ${entry.url}`);
  }
  assert(!JSON.stringify(requestLog).includes('unique-synthetic'));
  console.log(`  Observed ${requestLog.length} request event(s), ${onlineWorkflow.length} after ready online capture start, ${requestLog.length - offlineStart} during offline capture/import.`);
}));

try {
  server = await openServer(appPath);
  target = `${server.origin}${projectPath}`;
  browser = cdps
    ? await chromium.connectOverCDP(cdps)
    : await chromium.launch({ executablePath: process.env.TALUS_TEST_CHROMIUM, headless: true, args: ['--no-sandbox'] });
  console.log(`Desktop Chromium ${browser.version()} at ${target}`);
  for (const { id, f } of checks) {
    try {
      await f();
      console.log(`PASS ${id}`);
    } catch (error) {
      console.error(`FAIL ${id}\n${error.stack}`);
      process.exitCode = 1;
    }
  }
} finally {
  await browser?.close();
  await server?.close();
}
