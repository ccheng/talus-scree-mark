import { releaseId, shellAssets } from './precache.generated.js';

const base = new URL(self.registration.scope);
const entry = new URL('index.html', base).href;
const cachePrefix = `scree-mark-shell:${base.href}:`;
const cacheName = cachePrefix + releaseId;
const expected = new Map(Object.entries(shellAssets).map(([file, digest]) => [new URL(file, base).href, digest]));

async function matchesDigest(response, digest) {
  if (!response?.ok || response.redirected) return false;
  const bytes = await response.clone().arrayBuffer();
  const checksum = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(checksum), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex === digest;
}

async function fetchKnown(url) {
  const response = await fetch(url, { cache: 'reload', credentials: 'same-origin', redirect: 'error' });
  if (!await matchesDigest(response, expected.get(url))) {
    throw new Error('Shell asset failed release verification.');
  }
  return response;
}

async function stageShell() {
  const responses = await Promise.all(Array.from(expected.keys(), async (url) => [url, await fetchKnown(url)]));
  const cache = await caches.open(cacheName);
  await Promise.all(responses.map(([url, response]) => cache.put(url, response)));
}

async function verifyShell() {
  if (!await caches.has(cacheName)) return false;
  const cache = await caches.open(cacheName);
  const verified = await Promise.all(Array.from(expected, async ([url, digest]) => matchesDigest(await cache.match(url), digest)));
  return verified.every(Boolean);
}

self.addEventListener('install', (event) => {
  event.waitUntil(stageShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const obsolete = (await caches.keys()).filter((name) => name.startsWith(cachePrefix) && name !== cacheName);
    await Promise.all(obsolete.map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const port = event.ports[0];
  const data = event.data;
  if (!port || !data || !['verify-shell', 'repair-shell'].includes(data.action)) return;
  event.waitUntil((async () => {
    let ready = false;
    try {
      if (data.releaseId === releaseId) {
        if (data.action === 'repair-shell') await stageShell();
        ready = await verifyShell();
      }
    } catch {
      // The page provides a retry state for either storage or delivery failure.
    }
    port.postMessage({ releaseId, ready });
  })());
});

async function serveKnown(url) {
  try {
    const cached = await caches.match(url, { cacheName });
    if (cached) return cached;
    return await fetchKnown(url);
  } catch {
    return new Response('An app resource is unavailable. Connect to the internet and reopen Talus Scree Mark.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  let url = event.request.url;
  if (event.request.mode === 'navigate' &&
      [base.href, base.href + '?cpas=preview', entry + '?cpas=preview'].includes(url)) url = entry;
  if (expected.has(url)) event.respondWith(serveKnown(url));
});
