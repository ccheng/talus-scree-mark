import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openServer, projectPath } from '../m1/server.mjs';

const { chromium } = await import(process.env.TALUS_TEST_PLAYWRIGHT_PATH || 'playwright');
const appPath = process.argv[2];
assert(appPath, 'Usage: node browser.mjs /absolute/candidate/app');
const server = await openServer(appPath);
const target = server.origin + projectPath;
const source = (file) => new URL(`src/${file}`, target).href;
const browser = await chromium.launch({ executablePath: process.env.TALUS_TEST_CHROMIUM, headless: true });
let failures = 0;
let backupWithDeletedPhoto;

const fixture = (name) => resolve(appPath, 'fixtures/m3', `interleaved-${name}.png`);
const appStatus = (page) => page.locator('#grading-status');

async function chooseImage(page, selector, path) {
  const event = page.waitForEvent('filechooser');
  await page.locator(selector).click();
  await (await event).setFiles(path);
}

async function recognize(page, path, expected = 'read') {
  await chooseImage(page, '#choose-image', path);
  const status = page.locator('#recognition-status:is([data-status="read"], [data-status="retake"], [data-status="error"])');
  await status.waitFor();
  assert.equal(await status.getAttribute('data-status'), expected, await status.textContent());
}

async function waitGrade(page, value) {
  const found = page.locator('#grading-score').filter({ hasText: value });
  await found.waitFor();
  assert.equal(await found.textContent(), value);
}

async function snapshot(page) {
  return page.evaluate(async (modulePath) => {
    const data = await (await import(modulePath)).loadGrading();
    return { keys: data.keys, scans: data.scans.map(({ photo, ...scan }) => ({ ...scan, bytes: photo?.size ?? 0 })) };
  }, source('grading-store.js'));
}

async function download(page, control, file) {
  await page.locator(control).click();
  const link = page.locator(`#grading-download a[download="${file}"]`);
  await link.waitFor();
  const event = page.waitForEvent('download');
  await link.click();
  const transfer = await event;
  assert.equal(transfer.suggestedFilename(), file);
  return readFile(await transfer.path(), 'utf8');
}

async function group(name, check) {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 }, acceptDownloads: true });
  try {
    const page = await context.newPage();
    await page.goto(target);
    await page.waitForFunction(() => /^Offline ready\b/i.test(document.querySelector('#offline-status').textContent.trim()));
    await check(page, context);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}\n${error.stack}`);
  } finally {
    await context.close();
  }
}

try {
  await group('M4 offline setup, key revisions, review, rescan, photo retention and export through the app', async (page, context) => {
    const requests = [];
    context.on('request', (request) => requests.push({ method: request.method(), url: request.url(), body: request.postData() }));
    await chooseImage(page, '#setup-profile', fixture('blank'));
    const editor = page.locator('#profile-editor');
    await editor.waitFor();
    await page.locator('#profile-name').fill('Independent M4 practice template');
    await page.locator('#discovery-status[data-status="proposed"]').waitFor();
    await page.locator('#enroll-profile').click();
    await editor.waitFor({ state: 'hidden' });
    const fromHere = server.requests.length;
    await context.setOffline(true);

    const keyPanel = page.locator('#grading-key-panel');
    const keyField = (id) => keyPanel.locator(`[name="${id}"]`);
    const keySubmit = keyPanel.getByRole('button', { name: 'Save new key revision' });
    await page.locator('#grading-edit-key').click();
    await keyField('MC1').selectOption('A');
    await keyField('MC7').selectOption('C');
    await keyField('NR1').fill('004');
    await keySubmit.click();
    await appStatus(page).filter({ hasText: /invalid key for NR1/i }).waitFor();
    assert.deepEqual((await snapshot(page)).keys, []);
    await keyField('NR1').fill('4');
    await keyField('NR2').fill('7');
    await keyField('NR3').fill('0');
    await keySubmit.click();
    await appStatus(page).filter({ hasText: /new revision/i }).waitFor();

    await page.locator('#scan-completed').click();
    await recognize(page, resolve(appPath, 'assets/icon-192.png'), 'retake');
    assert.equal(await page.locator('#grading-saved option').count(), 1, 'A retake was listed as a gradeable record');
    await page.locator('#scan-next').click();
    await recognize(page, fixture('filled'));
    await waitGrade(page, '1/5 · 1 pending · provisional');
    assert.equal((await snapshot(page)).scans.length, 0, 'A scan persisted before explicit save');

    const item = page.locator('#grading-item');
    async function decision(id, kind, value, grade) {
      await item.selectOption(id);
      if (value !== undefined) await page.locator('#grading-answer').fill(value);
      await page.locator('#grading-' + kind).click();
      await appStatus(page).filter({ hasText: /review updated/i }).waitFor();
      await waitGrade(page, grade);
    }
    await decision('MC1', 'correct', 'A', '2/5 · 1 pending · provisional');
    await decision('MC1', 'undo', undefined, '1/5 · 1 pending · provisional');
    await decision('MC1', 'correct', 'A', '2/5 · 1 pending · provisional');
    await decision('NR1', 'award', undefined, '3/5 · 0 pending · final');

    await page.evaluate(() => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value) {
        const request = add.call(this, value);
        if (this.name === 'scans') {
          IDBObjectStore.prototype.add = add;
          request.addEventListener('success', () => this.transaction.abort(), { once: true });
        }
        return request;
      };
    });
    await page.locator('#grading-save').click();
    await appStatus(page).filter({ hasText: /local operation failed/i }).waitFor();
    assert.equal((await snapshot(page)).scans.length, 0);
    await waitGrade(page, '3/5 · 0 pending · final');
    await page.locator('#grading-save').click();
    await appStatus(page).filter({ hasText: /result and source photograph saved locally/i }).waitFor();
    const { keys: initialKeys, scans: [original] } = await snapshot(page);
    assert(original.bytes > 1000);
    assert.equal(original.observation.items.find(({ id }) => id === 'MC1').rawText, 'B');
    assert.equal(original.observation.items.find(({ id }) => id === 'NR1').rawText, '004 ');
    assert.deepEqual(original.history.map(({ kind }) => kind), ['correct', 'undo', 'correct', 'award']);
    assert.equal(original.keyId, initialKeys[0].id);

    await page.getByText('Result and batch actions', { exact: true }).click();
    await page.locator('#grading-edit-saved-key').click();
    await keyField('MC1').selectOption('B');
    await keySubmit.click();
    await appStatus(page).filter({ hasText: /new revision/i }).waitFor();
    assert.equal((await snapshot(page)).scans[0].keyId, original.keyId);
    await waitGrade(page, '3/5 · 0 pending · final');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#grading-regrade').click();
    await appStatus(page).filter({ hasText: /regraded against the latest key/i }).waitFor();
    await waitGrade(page, '2/5 · 0 pending · final');
    const regraded = await snapshot(page);
    assert.equal(regraded.keys.length, 2);
    assert.deepEqual(regraded.keys.find(({ id }) => id === original.keyId), initialKeys[0]);
    assert.notEqual(regraded.scans[0].keyId, original.keyId);
    assert.deepEqual(regraded.scans[0].observation, original.observation);

    async function explicitRescan(reuse) {
      await page.locator('#grading-saved').selectOption(original.id);
      const decisions = [true, reuse];
      const answer = (dialog) => decisions.shift() ? dialog.accept() : dialog.dismiss();
      page.on('dialog', answer);
      try { await page.locator('#grading-repeat').click(); }
      finally { page.off('dialog', answer); }
      assert.deepEqual(decisions, []);
      await page.locator('#grading-rescan-note').filter({ hasText: /explicit rescan/i }).waitFor();
      await page.locator('#scan-next').click();
      await recognize(page, fixture('filled'));
      await waitGrade(page, reuse ? '2/5 · 0 pending · final' : '2/5 · 1 pending · provisional');
      await page.locator('#grading-save').click();
      await appStatus(page).filter({ hasText: /result and source photograph saved locally/i }).waitFor();
    }
    await explicitRescan(false);
    await explicitRescan(true);
    const afterRescan = await snapshot(page);
    const children = afterRescan.scans.filter(({ rescanOf }) => rescanOf === original.id);
    assert.equal(children.length, 2);
    assert(children.every(({ observation, batchId }) => observation.captureId !== original.observation.captureId && batchId === original.batchId));
    assert.deepEqual(children.find(({ reusedCorrections }) => reusedCorrections).history, original.history);
    assert.deepEqual(children.find(({ reusedCorrections }) => !reusedCorrections).history, []);
    assert.deepEqual(afterRescan.scans.find(({ id }) => id === original.id).observation, original.observation);

    await page.locator('#grading-saved').selectOption(original.id);
    await page.getByText('Local export and restore', { exact: true }).click();
    const csv = await download(page, '#grading-csv', 'scree-grades.csv');
    assert(csv.includes('"NR1","004 ","004 ","correct","false","1","award"'));
    assert(csv.includes('"NR3","    ","    ","incorrect","false","0",""'));
    const withPhotos = JSON.parse(await download(page, '#grading-json', 'scree-backup.json'));
    assert.equal(withPhotos.scans.length, 3);
    assert(withPhotos.scans.every(({ photo }) => photo?.type === 'image/png' && photo.sha256.length === 64));

    await page.getByText('Source photograph and review history', { exact: true }).click();
    await page.locator('#grading-photo').waitFor();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#grading-delete-photo').click();
    await appStatus(page).filter({ hasText: /photograph deleted/i }).waitFor();
    await page.locator('#grading-photo').waitFor({ state: 'hidden' });
    await waitGrade(page, '2/5 · 0 pending · final');
    const afterPhotoDelete = (await snapshot(page)).scans.find(({ id }) => id === original.id);
    assert.equal(afterPhotoDelete.bytes, 0);
    assert.deepEqual(afterPhotoDelete.observation, original.observation);
    assert.deepEqual(afterPhotoDelete.history, original.history);
    backupWithDeletedPhoto = await download(page, '#grading-json', 'scree-backup.json');
    const noPhoto = JSON.parse(backupWithDeletedPhoto).scans.find(({ id }) => id === original.id);
    assert.equal(noPhoto.photoStatus, 'deleted');
    assert.equal(noPhoto.photo, null);
    assert.deepEqual(noPhoto.observation, original.observation);

    await page.reload();
    const saved = page.locator('#grading-saved');
    await saved.locator(`option[value="${original.id}"]`).waitFor({ state: 'attached' });
    await saved.selectOption(original.id);
    await waitGrade(page, '2/5 · 0 pending · final');
    const offline = await snapshot(page);
    assert(offline.scans.some(({ id, bytes }) => id === original.id && bytes === 0));
    assert.equal(server.requests.length, fromHere, 'Offline operations reached the static server');
    assert(requests.every(({ method, url, body }) => method === 'GET' && body === null &&
      (url.startsWith(target) || url.startsWith(`blob:${server.origin}`))), JSON.stringify(requests));
  });

  await group('M4 restores a local JSON backup without resurrecting a deleted photo or duplicating records', async (page, context) => {
    assert(backupWithDeletedPhoto, 'Prior workflow did not create a usable backup');
    const original = JSON.parse(backupWithDeletedPhoto);
    const count = server.requests.length;
    await context.setOffline(true);
    await page.getByText('Local export and restore', { exact: true }).click();
    const picker = page.locator('#grading-import');
    const upload = (backup) => picker.setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    assert.deepEqual(await snapshot(page), { keys: [], scans: [] });
    const invalid = structuredClone(original);
    invalid.scans.at(-1).grade.score = 987;
    await upload(JSON.stringify(invalid));
    await appStatus(page).filter({ hasText: /operation failed/i }).waitFor();
    assert.deepEqual(await snapshot(page), { keys: [], scans: [] });
    await upload(backupWithDeletedPhoto);
    await appStatus(page).filter({ hasText: /backup restored/i }).waitFor();
    const restored = await snapshot(page);
    assert.equal(restored.scans.length, 3);
    assert.equal(restored.keys.length, 2);
    for (const record of original.scans) {
      const found = restored.scans.find(({ id }) => id === record.id);
      assert.deepEqual(found.observation, record.observation);
      assert.deepEqual(found.grade, record.grade);
      assert.deepEqual(found.history, record.history);
      assert.equal(found.rescanOf, record.rescanOf);
      assert.equal(found.bytes, record.photo ? Buffer.from(record.photo.data, 'base64').length : 0);
    }
    await upload(backupWithDeletedPhoto);
    await appStatus(page).filter({ hasText: /operation failed/i }).waitFor();
    assert.deepEqual(await snapshot(page), restored);
    const deletedImage = original.scans.find(({ photo }) => !photo);
    await page.locator('#grading-saved').selectOption(deletedImage.id);
    await page.getByText('Source photograph and review history', { exact: true }).click();
    assert.match(await page.locator('#grading-photo-status').textContent(), /deleted/i);
    await page.getByText('Result and batch actions', { exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#grading-delete-batch').click();
    await appStatus(page).filter({ hasText: /deleted locally/i }).waitFor();
    assert.deepEqual(await snapshot(page), { keys: restored.keys, scans: [] });
    assert.equal(server.requests.length, count);
  });

  await group('M4 grading IndexedDB preserves photo and audit atomically across write failure', async (page) => {
    const mark = await readFile(resolve(appPath, 'reference/reference-filled.png'), 'base64');
    const outcome = await page.evaluate(async ({ modulePath, mark }) => {
      const store = await import(modulePath);
      const template = { id: 'atomic-template', revision: 1, name: 'Atomic QA', items: [{ id: 'MC1', kind: 'mc', choices: ['A', 'B'] }] };
      const key = { id: 'atomic-key', template, answers: { MC1: 'A' } };
      const photo = new Blob([Uint8Array.from(atob(mark), (byte) => byte.charCodeAt(0))], { type: 'image/png' });
      const first = {
        id: 'atomic-first', template, keyId: key.id, photo, updatedAt: '2026-01-01T10:00:00.000Z',
        observation: { items: [{ id: 'MC1', kind: 'mc', status: 'single', rawText: 'A', review: false }] }, history: [],
      };
      async function abortOne(method, id, run) {
        const native = IDBObjectStore.prototype[method];
        let observedFailure = false;
        let rejected = false;
        IDBObjectStore.prototype[method] = function (value) {
          const request = native.call(this, value);
          if (this.name === 'scans' && value.id === id) {
            request.addEventListener('success', () => {
              observedFailure = true;
              this.transaction.abort();
            }, { once: true });
          }
          return request;
        };
        try { await run(); } catch { rejected = true; }
        finally { IDBObjectStore.prototype[method] = native; }
        return { observedFailure, rejected };
      }
      const updates = {
        ...first, previousUpdate: first.updatedAt, updatedAt: '2026-01-01T11:00:00.000Z',
        photo: null, history: [{ itemId: 'MC1', kind: 'correct', value: 'B', at: '2026-01-01T11:00:00.000Z' }],
      };
      async function snapshot() {
        const loaded = await store.loadGrading();
        return {
          keys: loaded.keys.map(({ id }) => id),
          scans: await Promise.all(loaded.scans.map(async (scan) => ({
            id: scan.id, updatedAt: scan.updatedAt, observation: scan.observation, history: scan.history,
            photo: scan.photo ? btoa(String.fromCharCode(...new Uint8Array((await scan.photo.arrayBuffer()).slice(0, 32)))) : null,
          }))),
        };
      }
      await store.saveKey(key);
      await store.saveScan(first, { create: true });
      const before = await snapshot();
      const putFailure = await abortOne('put', first.id, () => store.saveScan(updates));
      const afterPutFailure = await snapshot();
      const added = { ...first, id: 'atomic-phantom' };
      const addFailure = await abortOne('add', added.id, () => store.saveScan(added, { create: true }));
      const afterAddFailure = await snapshot();
      await store.saveScan(updates);
      const afterDelete = await snapshot();
      let conflictingRestoreRejected = false;
      try { await store.restoreGrading({ keys: [key], scans: [added, first] }); }
      catch { conflictingRestoreRejected = true; }
      const afterConflictingRestore = await snapshot();
      await store.deleteScans([first.id]);
      return { putFailure, addFailure, before, afterPutFailure, afterAddFailure, afterDelete,
        conflictingRestoreRejected, afterConflictingRestore, afterScanDeletion: await snapshot() };
    }, { modulePath: source('grading-store.js'), mark });
    for (const result of [outcome.putFailure, outcome.addFailure]) {
      assert.deepEqual(result, { observedFailure: true, rejected: true });
    }
    assert.equal(outcome.before.scans.length, 1);
    assert(outcome.before.scans[0].photo);
    assert.deepEqual(outcome.afterPutFailure, outcome.before);
    assert.deepEqual(outcome.afterAddFailure, outcome.before);
    assert.deepEqual(outcome.afterDelete.scans[0].observation, outcome.before.scans[0].observation);
    assert.equal(outcome.afterDelete.scans[0].photo, null);
    assert.equal(outcome.afterDelete.scans[0].history[0].value, 'B');
    assert(outcome.conflictingRestoreRejected);
    assert.deepEqual(outcome.afterConflictingRestore, outcome.afterDelete);
    assert.deepEqual(outcome.afterScanDeletion, { keys: ['atomic-key'], scans: [] });
  });
} finally {
  await browser.close();
  await server.close();
}
if (failures) process.exitCode = 1;
