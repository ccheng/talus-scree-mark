import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { openServer, projectPath } from '../m1/server.mjs';

const { chromium } = await import(process.env.TALUS_TEST_PLAYWRIGHT_PATH || 'playwright');
const app = resolve(process.argv[2] ?? 'app');
const work = await mkdtemp(join(tmpdir(), 'scree-classroom-'));
const server = await openServer(app);
const url = server.origin + projectPath;
const grading = new URL('src/grading-store.js', url).href;
const size = Number(process.env.TALUS_CLASSROOM_SIZE ?? 32);
assert(Number.isInteger(size) && size >= 30);
const blank = join(app, 'fixtures/m3/interleaved-blank.png');
const completed = join(app, 'fixtures/m3/interleaved-filled.png');
const t = (n) => Math.round(n);
const contexts = new Set();

function pathFor(i) { return join(work, `synthetic-${i % 4}.png`); }
execFileSync('python3', ['-c', `
from PIL import Image, ImageChops
from random import Random
from pathlib import Path
import sys
photo = Image.open(sys.argv[1]).convert('L')
for i in range(4):
    rng = Random(14056 + i)
    noise = Image.frombytes('L', photo.size, rng.randbytes(photo.width * photo.height)).point(lambda n: n % (7+i))
    marked = ImageChops.subtract(photo, noise)
    marked.save(Path(sys.argv[2]) / f'synthetic-{i}.png')
`, completed, work]);

async function start(directory, offline = false) {
  const context = await chromium.launchPersistentContext(join(work, directory), {
    executablePath: process.env.TALUS_TEST_CHROMIUM, headless: true,
    acceptDownloads: true, viewport: { width: 390, height: 844 }, offline,
  });
  contexts.add(context);
  const page = context.pages()[0];
  await page.goto(url);
  await page.waitForFunction(() => /^Offline ready\b/i.test(document.querySelector('#offline-status').textContent.trim()));
  return { context, page };
}

async function close(context) {
  await context.close();
  contexts.delete(context);
}

async function file(page, button, path) {
  const event = page.waitForEvent('filechooser');
  await page.locator(button).click();
  await (await event).setFiles(path);
}

async function download(page, button, name) {
  const link = page.locator(`#grading-download a[download="${name}"]`);
  await page.locator(button).click();
  const event = page.waitForEvent('download');
  await link.click();
  const copy = join(work, name);
  await (await event).saveAs(copy);
  return copy;
}

async function snapshot(page) {
  return page.evaluate(async (path) => {
    const { keys, scans } = await (await import(path)).loadGrading();
    return { keys, scans: scans.map(({ photo, ...scan }) => ({ ...scan, photoBytes: photo?.size ?? 0 })),
      storage: await navigator.storage.estimate() };
  }, grading);
}

async function heap(page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Performance.enable');
    const { metrics } = await session.send('Performance.getMetrics');
    return metrics.find(({ name }) => name === 'JSHeapUsedSize')?.value;
  } finally { await session.detach(); }
}

async function waitSaved(page, sheet) {
  await page.locator('#grading-label').filter({ hasText: new RegExp(`Sheet ${sheet} · .*Saved locally`) }).waitFor();
  await page.locator('#recognition-status[data-status="read"]').waitFor();
}

try {
  let { context, page } = await start('primary');
  await file(page, '#setup-profile', blank);
  await page.locator('#profile-name').fill('Synthetic mixed class');
  await page.locator('#discovery-status[data-status="proposed"]').waitFor();
  await page.locator('#enroll-profile').click();
  await page.locator('#profile-editor').waitFor({ state: 'hidden' });

  await page.locator('#grading-edit-key').click();
  await page.locator('#grading-key-inputs [name="MC1"]').selectOption('B');
  await page.locator('#grading-key-inputs [name="NR1"]').fill('4');
  await page.locator('#grading-key-inputs [name="NR2"]').fill('7');
  await page.locator('#grading-key-panel button[type="submit"]').click();
  await page.locator('#grading-status').filter({ hasText: /new revision/i }).waitFor();
  await page.locator('#scan-completed').click();
  await context.setOffline(true);
  const measurements = { startingHeap: await heap(page), acquisitionMs: [] };

  for (let i = 0; i < size; i++) {
    if (i) {
      const next = page.locator('#scan-next');
      if (await next.isVisible()) await next.click();
    }
    const began = performance.now();
    await file(page, '#choose-image', pathFor(i));
    await waitSaved(page, i + 1);
    measurements.acquisitionMs.push(t(performance.now() - began));
    if (i === 0 || i === 15) {
      await page.locator('#grading-item').selectOption('NR1');
      await page.locator('#grading-answer').fill('4');
      await page.locator('#grading-correct').click();
      await page.locator('#grading-score').filter({ hasText: '3/3 · 0 pending · final' }).waitFor();
    }
    if (i === 11) {
      await close(context);
      ({ context, page } = await start('primary', true));
      await page.locator('#profile-pin').filter({ hasText: /batch active/i }).waitFor();
      assert.equal((await snapshot(page)).scans.length, 12);
    }
  }

  const first = await snapshot(page);
  assert.equal(first.scans.length, size);
  assert.equal(new Set(first.scans.map(({ batchId }) => batchId)).size, 1);
  assert(first.scans.every(({ photoBytes }) => photoBytes > 100_000));
  assert.equal(first.scans.filter(({ history }) => history.length).length, 2);
  assert(first.scans.every(({ observation }) => observation.items.find(({ id }) => id === 'NR1').rawText === '004 '));
  assert.equal(first.scans.filter(({ grade }) => grade.pending === 1).length, size - 2);
  measurements.retainedBytes = first.scans.reduce((total, scan) => total + scan.photoBytes, 0);
  measurements.storageUsage = first.storage.usage;
  measurements.heapAfterClass = await heap(page);

  await page.locator('#profile-advanced > summary').click();
  await page.locator('#end-batch').click();
  await page.locator('#scan-completed').click();
  await file(page, '#choose-image', pathFor(0));
  await waitSaved(page, 1);
  const two = await snapshot(page);
  assert.equal(two.scans.length, size + 1);
  const other = two.scans.find(({ batchId }) => batchId !== first.scans[0].batchId);
  assert(other);
  await page.locator('#grading-saved').selectOption(first.scans[0].id);
  await page.getByText('Local export and restore', { exact: true }).click();
  const csv = await readFile(await download(page, '#grading-csv', 'scree-grades.csv'), 'utf8');
  assert(!csv.includes(`"${other.id}"`));
  assert.equal(csv.split('\r\n').length - 2, size * 20);
  const startBackup = performance.now();
  const backup = await download(page, '#grading-json', 'scree-backup.json');
  measurements.backupMs = t(performance.now() - startBackup);
  measurements.backupBytes = (await stat(backup)).size;
  measurements.heapAfterBackup = await heap(page);

  const restored = await start('restore');
  await restored.context.setOffline(true);
  await restored.page.getByText('Local export and restore', { exact: true }).click();
  const startRestore = performance.now();
  await restored.page.locator('#grading-import').setInputFiles(backup);
  const restoreStatus = restored.page.locator('#grading-status');
  await restoreStatus.filter({ hasText: /backup restored locally|local operation failed|local storage is full/i })
    .waitFor({ timeout: 120_000 }).catch(async (error) => {
      throw new Error(`Restore stalled at: ${await restoreStatus.textContent()}`, { cause: error });
    });
  assert.match(await restoreStatus.textContent(), /backup restored locally/i);
  measurements.restoreMs = t(performance.now() - startRestore);
  measurements.restoreHeap = await heap(restored.page);
  const imported = await snapshot(restored.page);
  assert.deepEqual(imported.keys, two.keys);
  assert.equal(imported.scans.length, two.scans.length);
  // Version 1 JSON represents negative zero as zero in geometry matrices.
  for (const [index, scan] of imported.scans.entries()) {
    assert(JSON.stringify(scan) === JSON.stringify(two.scans[index]), `Unexpected restored record ${scan.id}`);
  }
  console.log(JSON.stringify({ scanCount: size, restoredCount: size + 1, ...measurements }));
} finally {
  for (const context of contexts) await close(context);
  await server.close();
  await rm(work, { recursive: true, force: true });
}
