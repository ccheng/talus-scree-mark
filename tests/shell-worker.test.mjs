import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { releaseId, shellAssets } from '../app/precache.generated.js';

const scope = 'https://example.test/talus-scree-mark/';
const prefix = `scree-mark-shell:${scope}:`;
const candidate = prefix + releaseId;
const previous = prefix + 'previous-release';
const sibling = 'scree-mark-shell:https://example.test/sibling/:other-release';
const assets = await Promise.all(Object.keys(shellAssets).map(async (file) => [
  new URL(file, scope).href,
  await readFile(new URL(`../app/${file}`, import.meta.url)),
]));

let workerImports = 0;
async function workerFixture(t) {
  const handlers = new Map();
  const stores = new Map([[previous, new Map()], [sibling, new Map()]]);
  const sources = new Map(assets);
  const requests = [];
  let claims = 0;

  function storeFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  }
  const endpoint = {
    registration: { scope },
    clients: { async claim() { claims++; } },
    addEventListener(type, listener) { handlers.set(type, listener); },
  };
  const cacheStorage = {
    async open(name) {
      const contents = storeFor(name);
      return {
        async put(url, response) { contents.set(url, response.clone()); },
        async match(url) { return contents.get(url)?.clone(); },
      };
    },
    async has(name) { return stores.has(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(url, { cacheName }) { return stores.get(cacheName)?.get(url)?.clone(); },
  };
  const network = async (url, options) => {
    requests.push({ url, options });
    return sources.has(url) ? new Response(sources.get(url)) : new Response('missing', { status: 404 });
  };
  const savedGlobals = { self: globalThis.self, caches: globalThis.caches, fetch: globalThis.fetch };
  Object.assign(globalThis, { self: endpoint, caches: cacheStorage, fetch: network });
  t.after(() => Object.assign(globalThis, savedGlobals));
  await import(`../app/sw.js#fixture-${++workerImports}`);

  function dispatch(type, fields = {}) {
    let pending;
    const collect = (promise) => { pending = promise; };
    handlers.get(type)({ waitUntil: collect, respondWith: collect, ...fields });
    return pending;
  }

  async function query(action, expectedRelease = releaseId) {
    let result;
    await dispatch('message', {
      data: { action, releaseId: expectedRelease },
      ports: [{ postMessage(data) { result = data; } }],
    });
    return result;
  }

  return { dispatch, query, requests, sources, stores, get claims() { return claims; } };
}

test('worker stages only the hashed shell, controls the project root and isolates its release and scope', async (t) => {
  const fixture = await workerFixture(t);
  assert.deepEqual(await fixture.query('verify-shell'), { releaseId, ready: false });
  await fixture.dispatch('install');
  assert.equal(fixture.requests.length, assets.length);
  assert.ok(fixture.requests.every(({ options }) => options.redirect === 'error' && options.cache === 'reload'));
  assert.deepEqual([...fixture.stores.get(candidate).keys()].sort(), assets.map(([url]) => url).sort());
  assert.ok(fixture.stores.has(previous));

  await fixture.dispatch('activate');
  assert.equal(fixture.claims, 1);
  assert.equal(fixture.stores.has(previous), false);
  assert.equal(fixture.stores.has(sibling), true);
  assert.deepEqual(await fixture.query('verify-shell', 'wrong-release'), { releaseId, ready: false });
  assert.deepEqual(await fixture.query('verify-shell'), { releaseId, ready: true });

  const entry = await fixture.dispatch('fetch', { request: { method: 'GET', url: scope, mode: 'navigate' } });
  assert.match(await entry.text(), new RegExp(releaseId));
  for (const request of [
    { method: 'GET', url: 'https://example.test/sibling/', mode: 'navigate' },
    { method: 'POST', url: scope + 'index.html' },
    { method: 'GET', url: scope + 'index.html?unknown=1' },
  ]) {
    assert.equal(fixture.dispatch('fetch', { request }), undefined);
  }
  assert.equal(fixture.requests.length, assets.length);
});

test('worker rejects an incomplete or mismatched install without replacing prior cached releases', async (t) => {
  const fixture = await workerFixture(t);
  const missing = scope + 'styles.css';
  fixture.sources.delete(missing);
  await assert.rejects(fixture.dispatch('install'), /release verification/);
  assert.ok(fixture.stores.has(previous));
  assert.equal(fixture.stores.has(candidate), false);

  fixture.sources.set(missing, 'same path, wrong release bytes');
  await assert.rejects(fixture.dispatch('install'), /release verification/);
  assert.ok(fixture.stores.has(previous));
  assert.equal(fixture.stores.has(candidate), false);
});

test('worker reports injected asset loss and supports verified static-cache repair', async (t) => {
  const fixture = await workerFixture(t);
  await fixture.dispatch('install');
  const lost = scope + 'assets/icon-192.png';
  fixture.stores.get(candidate).delete(lost);
  assert.deepEqual(await fixture.query('verify-shell'), { releaseId, ready: false });
  assert.deepEqual(await fixture.query('repair-shell'), { releaseId, ready: true });
  assert.equal(fixture.stores.get(candidate).size, assets.length);
});
