import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openServer, projectPath } from '../m1/server.mjs';

const { chromium } = await import(process.env.TALUS_TEST_PLAYWRIGHT_PATH || 'playwright');
const appPath = process.argv[2];
assert(appPath, 'Usage: node browser.mjs /absolute/candidate/app');
const server = await openServer(appPath);
const target = server.origin + projectPath;
const source = (file) => new URL(`src/${file}`, target).href;
const { shellAssets } = await import(pathToFileURL(resolve(appPath, 'precache.generated.js')).href);
const shell = Object.keys(shellAssets).map((path) => path.replace(/^\.\//, ''));
const staticUrls = new Set([target, ...[...shell, 'sw.js', 'precache.generated.js'].map((path) => new URL(path, target).href)]);
const portfolioFolder = new URL('./fixtures/', import.meta.url);
const portfolio = JSON.parse(await readFile(new URL('portfolio-oracles.json', portfolioFolder), 'utf8'));
const portfolioFile = (file) => fileURLToPath(new URL(file, portfolioFolder));
const paper = { width: 612, height: 792, orientation: 'portrait', units: 'pt', origin: 'top-left' };
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

async function openOptions(page, selector) {
  const panel = page.locator(selector);
  if (!(await panel.evaluate((element) => element.open))) await panel.locator(':scope > summary').click();
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
  const link = page.locator(`#grading-download a[download="${file}"]`);
  const prior = await link.count() ? await link.getAttribute('href') : null;
  await page.locator(control).click();
  await link.waitFor();
  await page.waitForFunction(({ file, prior }) =>
    document.querySelector(`#grading-download a[download="${file}"]`)?.getAttribute('href') !== prior, { file, prior });
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
    server.fault.clear();
  }
}

try {
  for (const form of portfolio) {
    await group(`M4 supplied geometry analogue (${form.variant}) discovers, persists and grades all 18 items`, async (page) => {
      const diagnostics = await page.evaluate(async ({ url, original, paper }) => {
        const bytes = Uint8Array.from(atob(original), (byte) => byte.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes]));
        const canvas = document.createElement('canvas');
        const width = canvas.width = bitmap.width;
        const height = canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return (await import(url)).discoverBlankLayout({ width, height, pixels: ctx.getImageData(0, 0, width, height) }, paper).diagnostics;
      }, { url: source('layout-discovery.js'), original: await readFile(portfolioFile(form.blank), 'base64'), paper });
      assert.deepEqual(diagnostics.filter(({ kind }) => kind === 'nr').map(({ writingBoxes }) => writingBoxes.length), [4, 4, 4, 4]);
      await chooseImage(page, '#setup-profile', portfolioFile(form.blank));
      const editor = page.locator('#profile-editor');
      await editor.waitFor();
      const label = `Synthetic top layout ${form.variant}`;
      await page.locator('#profile-name').fill(label);
      const proposal = page.locator('#discovery-status:is([data-status="proposed"], [data-status="review"], [data-status="needs-corners"])');
      await proposal.waitFor();
      assert.equal(await proposal.getAttribute('data-status'), 'proposed', await proposal.textContent());
      assert.equal(await page.locator('#profile-blocks [data-block-kind="mc"]').count(), 2);
      assert.equal(await page.locator('#profile-blocks [data-block-kind="nr"]').count(), 4);
      await page.locator('#enroll-profile').click();
      await editor.waitFor({ state: 'hidden' });
      const profiles = await page.evaluate(async (module) => (await import(module)).listProfiles(), source('profile-store.js'));
      assert.equal(profiles.length, 1);
      const [profile] = profiles;
      const all = profile.components.flatMap(({ items }) => items);
      assert.deepEqual(all.filter(({ kind }) => kind === 'mc').map(({ id }) => id), Array.from({ length: 14 }, (_, i) => `MC${i + 1}`));
      assert.deepEqual(all.filter(({ kind }) => kind === 'nr').map(({ id }) => id), ['NR1', 'NR2', 'NR3', 'NR4']);
      assert(profile.components.every(({ bounds }) => bounds.y + bounds.height < form.writtenAreas[0].y));

      const expected = new Map(form.blocks.flatMap(({ items }) => items.map((item) => [item.id, item])));
      for (const item of all) {
        const { kind, choices, slots } = expected.get(item.id);
        assert.equal(item.kind, kind);
        const actual = kind === 'mc' ? [item.choices] : item.slots.map(({ choices }) => choices);
        const expectedSets = kind === 'mc' ? [choices] : slots.map(({ choices }) => choices);
        assert.equal(actual.length, expectedSets.length);
        for (const [n, set] of actual.entries()) {
          assert.deepEqual(set.map(({ symbol }) => symbol), expectedSets[n].map(({ symbol }) => symbol), item.id);
          for (const [index, choice] of set.entries()) {
            const center = expectedSets[n][index];
            const offset = Math.hypot(choice.x - center.x, choice.y - center.y) / center.radius;
            assert(offset <= .65, `${item.id} ${choice.symbol} shifted ${offset.toFixed(3)} local radii`);
          }
        }
      }

      await page.reload();
      const selector = page.locator('#profile-selector');
      const id = `${profile.id}@${profile.revision}`;
      await selector.locator(`option[value="${id}"]`).waitFor({ state: 'attached' });
      await selector.selectOption(id);
      await page.locator('#grading-edit-key').click();
      const key = page.locator('#grading-key-panel');
      for (const [item, value] of Object.entries(form.key)) {
        const field = key.locator(`[name="${item}"]`);
        if (item.startsWith('MC')) await field.selectOption(value);
        else await field.fill(value);
      }
      await key.getByRole('button', { name: 'Save new key revision' }).click();
      await appStatus(page).filter({ hasText: /new revision/i }).waitFor();
      await page.locator('#scan-completed').click();
      const recognitionRows = () => page.locator('#recognition-results [data-item-id]').evaluateAll((elements) => elements.map((row) => ({
        id: row.dataset.itemId, state: row.dataset.status, review: row.dataset.review === 'true',
        rawText: row.querySelector('[data-raw-text]')?.dataset.rawText ?? null,
      })));
      await recognize(page, portfolioFile(form.blank));
      const blankRows = await recognitionRows();
      assert.equal(blankRows.length, 18);
      for (const { id, kind } of form.truth) {
        assert.deepEqual(blankRows.find((row) => row.id === id), { id, state: 'blank', review: false,
          rawText: kind === 'nr' ? '    ' : null });
      }
      await waitGrade(page, '0/6 · 0 pending · final');
      await page.locator('#scan-next').click();
      await recognize(page, portfolioFile(form.marked));
      const rows = await recognitionRows();
      assert.equal(rows.length, 18);
      for (const { kind, ...literal } of form.truth) assert.deepEqual(rows.find(({ id }) => id === literal.id), literal);
      await waitGrade(page, '3/6 · 1 pending · provisional');
      await page.locator('#grading-save').click();
      await appStatus(page).filter({ hasText: /result and source photograph saved locally/i }).waitFor();
      const [saved] = (await snapshot(page)).scans;
      assert.deepEqual(saved.template.items.map(({ id }) => id), all.map(({ id }) => id));
      assert.equal(saved.grade.items.find(({ id }) => id === 'NR3').status, 'pending');
    });
  }

  await group('MC-only mixed sheet keeps a mapped block and exports revisioned category scores', async (page) => {
    const form = portfolio.find(({ variant }) => variant === 'document');
    await chooseImage(page, '#setup-profile', portfolioFile(form.blank));
    await page.locator('#discovery-status[data-status="proposed"]').waitFor();
    await page.locator('#profile-name').fill('Mixed sheet · MC only');
    const firstBlock = page.locator('#profile-blocks [data-block-kind="mc"]').first();
    const kept = await firstBlock.getAttribute('data-profile-block');
    await firstBlock.getByRole('button', { name: 'Keep block on rediscovery' }).click();
    await page.locator('#profile-mc-only').check();
    await openOptions(page, '#region-coordinate-details');
    async function box(x, y, width, height) {
      for (const [field, value] of Object.entries({ x, y, width, height })) {
        await page.locator('#region-' + field).fill(String(value));
      }
      await page.locator('#add-exclusion').click();
    }
    await box(300, 90, 300, 205);
    await box(35, 306, 550, 437);
    await page.locator('#profile-exclusions li').first().getByRole('button', { name: 'Edit' }).click();
    await page.locator('#region-y').fill('85');
    await page.locator('#add-exclusion').click();
    await page.locator('#rediscover-layout').click();
    await page.locator('#discovery-status[data-status="proposed"]').waitFor();
    assert.equal(await page.locator('#profile-exclusions li').count(), 2);
    assert.equal(await page.locator('#profile-blocks li').count(), 2);
    assert.equal(await page.locator('#profile-blocks li').first().getAttribute('data-profile-block'), kept);
    assert.equal(await page.locator('#profile-blocks [data-block-kind="nr"]').count(), 0);
    await page.locator('#enroll-profile').click();
    await page.locator('#profile-editor').waitFor({ state: 'hidden' });
    const [profile] = await page.evaluate(async (module) => (await import(module)).listProfiles(), source('profile-store.js'));
    assert.equal(profile.scope, 'mc-only');
    assert.equal(profile.exclusions[0].y, 85);
    assert.deepEqual(profile.components.flatMap(({ items }) => items.map(({ id }) => id)),
      Array.from({ length: 14 }, (_, i) => 'MC' + (i + 1)));
    await page.reload();
    await page.locator('#profile-selector').selectOption(`${profile.id}@${profile.revision}`);
    await page.locator('#grading-edit-key').click();
    await page.locator('#grading-key-inputs [name="MC1"]').selectOption('B');
    await page.locator('#grading-key-inputs [name="MC10"]').selectOption('D');
    await page.locator('#grading-categories summary').click();
    await page.locator('#grading-category-name-1').fill('Level');
    await page.locator('#grading-category-name-2').fill('Outcome');
    await page.locator('#grading-category-values-1').fill('DV\nPR');
    await page.locator('#grading-category-values-2').fill('Lab\nModel');
    await page.locator('#grading-category-refresh').click();
    await page.locator('#grading-category-through').selectOption('MC9');
    await page.locator('#grading-category-value').selectOption('DV');
    await page.locator('#grading-category-range').click();
    await page.locator('[data-category-question="MC1"] [data-category-dimension="2"]').selectOption('Lab');
    await page.locator('[data-category-question="MC10"] input').check();
    await page.locator('#grading-category-value').selectOption('PR');
    await page.locator('#grading-category-selected').click();
    await page.locator('#grading-key-panel button[type="submit"]').click();
    await appStatus(page).filter({ hasText: /new revision/i }).waitFor();
    await page.locator('#scan-completed').click();
    await recognize(page, portfolioFile(form.marked));
    await waitGrade(page, '1/2 · 0 pending · final');
    assert.match(await page.locator('#grading-scope').innerText(), /MC only.*NR and WR excluded/);
    await page.locator('#grading-subtotals-panel summary').click();
    assert.match(await page.locator('#grading-subtotals').innerText(), /Outcome — \(Unassigned\)/);
    await page.locator('#grading-item').selectOption('MC10');
    await page.locator('#grading-award').click();
    await waitGrade(page, '2/2 · 0 pending · final');
    await page.locator('#grading-save').click();
    await appStatus(page).filter({ hasText: /result and source photograph saved locally/i }).waitFor();
    await page.getByText('Local export and restore', { exact: true }).click();
    const csv = await download(page, '#grading-csv', 'scree-grades.csv');
    assert.match(csv, /"intersection","Level","DV","Outcome","Lab","1","1","0"/);
    const backup = JSON.parse(await download(page, '#grading-json', 'scree-backup.json'));
    assert.deepEqual(backup.keys[0].categories.assignments.MC10, ['PR', null]);
    assert.equal(backup.scans[0].template.scope, 'mc-only');
    assert(backup.scans[0].photo.data.length > 1000);
  });

  await group('MC-only incomplete mixed template can recover an exact map after review and manual repair', async (page) => {
    const form = portfolio.find(({ variant }) => variant === 'document');
    const right = form.blocks.find(({ kind, items }) => kind === 'mc' && items[0].id === 'MC10');
    const missing = right.items.find(({ id }) => id === 'MC11').choices.find(({ symbol }) => symbol === 'D');
    const damaged = await page.evaluate(async ({ original, missing }) => {
      const bytes = Uint8Array.from(atob(original), (byte) => byte.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes]));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const scale = canvas.width / 612;
      const edge = missing.radius + 1;
      context.fillStyle = 'rgb(250,249,247)';
      context.fillRect(Math.floor((missing.x - edge) * scale), Math.floor((missing.y - edge) * scale),
        Math.ceil(2 * edge * scale) + 1, Math.ceil(2 * edge * scale) + 1);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { original: await readFile(portfolioFile(form.blank), 'base64'), missing });
    await chooseImage(page, '#setup-profile', { name: 'synthetic-missing-mc-outline.png', mimeType: 'image/png', buffer: Buffer.from(damaged, 'base64') });
    const editor = page.locator('#profile-editor');
    const mc = page.locator('#profile-blocks [data-block-kind="mc"]');
    const save = page.locator('#enroll-profile');
    await editor.waitFor();
    await page.locator('#profile-name').fill('Synthetic incomplete MC repaired');
    await page.locator('#discovery-status:is([data-status="proposed"], [data-status="review"])').waitFor();
    await page.locator('#profile-mc-only').check();

    async function rediscover() {
      await page.locator('#rediscover-layout').click();
      await page.locator('#discovery-status[data-status="review"]').waitFor();
      assert.equal(await page.locator('#profile-blocks [data-block-kind="nr"]').count(), 0);
    }
    async function renumber(block, first) {
      await block.getByRole('button', { name: 'Renumber block' }).click();
      await page.locator('#block-first-number').fill(String(first));
      await page.locator('#apply-block-renumber').click();
    }
    await rediscover();
    assert.equal(await mc.count(), 3, 'Damaged right column should leave two incomplete fragments');
    assert.match(await mc.first().textContent(), /MC1–MC9/);
    await renumber(mc.first(), 101);
    assert.match(await mc.first().textContent(), /MC101–MC109/);
    await mc.first().getByRole('button', { name: 'Release block for rediscovery' }).click();
    await rediscover();
    assert.match(await mc.first().textContent(), /MC1–MC9/, 'Rediscovery must replace the released labels');
    assert.doesNotMatch(await page.locator('#profile-blocks').textContent(), /MC101/);
    const kept = await mc.first().getAttribute('data-profile-block');
    await mc.first().getByRole('button', { name: 'Keep block on rediscovery' }).click();
    const mask = { x: 300, y: 85, width: 300, height: 205 };
    await openOptions(page, '#region-coordinate-details');
    for (const [field, value] of Object.entries(mask)) await page.locator('#region-' + field).fill(String(value));
    await page.locator('#add-exclusion').click();
    assert.equal(await page.locator('#profile-exclusions li').count(), 1);
    await rediscover();
    assert.equal(await mc.first().getAttribute('data-profile-block'), kept);
    assert.match(await mc.first().textContent(), /MC1–MC9/);

    await page.locator('#review-discovery').click();
    const completeness = page.locator('#mc-completeness');
    await completeness.waitFor();
    assert(await save.isDisabled());
    assert.match(await page.locator('#template-save-status').textContent(), /complete|partial|choose/i);
    await completeness.selectOption('partial');
    assert(await save.isEnabled(), 'An explicitly identified partial template should be saveable');

    // Replace the incomplete upper-right fragment, leaving the other printed rows intact.
    await mc.nth(1).getByRole('button', { name: 'Remove', exact: true }).click();
    assert.equal(await mc.count(), 2);
    await renumber(mc.nth(1), 13);
    assert.match(await mc.nth(1).textContent(), /MC13–MC14/);
    const originalGrid = [right.items[0].choices[0], right.items[0].choices.at(-1), right.items[2].choices[0]];
    async function placeReplacement(first) {
      await openOptions(page, '#region-coordinate-details');
      await openOptions(page, '#legacy-grid-details');
      await page.locator('#block-kind').selectOption('mc');
      for (const [field, number] of Object.entries({ x: 198, y: 84, width: 67, height: 57 })) {
        await page.locator('#region-' + field).fill(String(number));
      }
      await page.locator('#grid-rows').fill('3');
      await page.locator('#grid-columns').fill('4');
      await page.locator('#item-prefix').fill('MC');
      await page.locator('#item-start').fill(String(first));
      await page.locator('#grid-symbols').fill('A,B,C,D');
      const endpointSummary = page.getByText('Adjust grid endpoints, spacing or angle', { exact: true });
      if (!(await page.locator('#grid-first-x').isVisible())) await endpointSummary.click();
      for (const [index, prefix] of ['first', 'across', 'down'].entries()) {
        await page.locator(`#grid-${prefix}-x`).fill(String(originalGrid[index].x));
        await page.locator(`#grid-${prefix}-y`).fill(String(originalGrid[index].y));
      }
      await page.locator('#grid-radius').fill(String(originalGrid[0].radius));
      await page.locator('#apply-grid-endpoints').click();
    }
    await placeReplacement(10);
    await page.locator('#cancel-block-edit').click();
    assert.equal(await mc.count(), 2);
    await placeReplacement(1);
    await page.locator('#confirm-block').click();
    await page.locator('#block-confirm-status').filter({ hasText: /duplicate|unique|already/i }).waitFor();
    assert.equal(await mc.count(), 2);
    assert(await save.isDisabled());
    await page.locator('#item-start').fill('10');
    await page.locator('#confirm-block').click();
    await mc.filter({ hasText: 'MC10–MC12' }).waitFor();
    await completeness.selectOption('complete');
    assert(await save.isEnabled());
    await save.click();
    await editor.waitFor({ state: 'hidden' });

    const [profile] = await page.evaluate(async (module) => (await import(module)).listProfiles(), source('profile-store.js'));
    assert.equal(profile.scope, 'mc-only');
    assert.equal(profile.mcCompleteness, 'complete');
    assert.deepEqual(profile.exclusions, [mask]);
    assert.equal(profile.components.find(({ id }) => id === kept).items.length, 9);
    assert.deepEqual(profile.components.flatMap(({ items }) => items.map(({ id }) => id))
      .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))), Array.from({ length: 14 }, (_, index) => `MC${index + 1}`));
    await page.reload();
    await page.locator('#profile-selector').selectOption(`${profile.id}@${profile.revision}`);
    await page.locator('#grading-edit-key').click();
    const key = page.locator('#grading-key-panel');
    const expected = form.truth.filter(({ kind }) => kind === 'mc');
    const graded = expected.filter(({ id }) => Number(id.slice(2)) >= 10);
    for (const { id, rawText } of graded) await key.locator(`[name="${id}"]`).selectOption(rawText);
    await key.locator('button[type="submit"]').click();
    await appStatus(page).filter({ hasText: /new revision/i }).waitFor();
    await page.locator('#scan-completed').click();
    await recognize(page, portfolioFile(form.marked));
    const rows = await page.locator('#recognition-results [data-item-id]').evaluateAll((elements) => elements.map((row) => ({
      id: row.dataset.itemId, state: row.dataset.status, review: row.dataset.review === 'true',
      rawText: row.querySelector('[data-raw-text]')?.dataset.rawText ?? null,
    })));
    assert.equal(rows.length, 14);
    for (const { kind, ...literal } of expected) assert.deepEqual(rows.find(({ id }) => id === literal.id), literal);
    await waitGrade(page, '5/5 · 0 pending · final');
  });

  await group('M4 bounded MC fit estimates one outline only after teacher acceptance', async (page) => {
    const form = portfolio.find(({ variant }) => variant === 'document');
    const missing = form.blocks.find(({ kind, items }) => kind === 'mc' && items[0].id === 'MC10')
      .items[1].choices.find(({ symbol }) => symbol === 'D');
    const damaged = await page.evaluate(async ({ raw, missing }) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(raw), (byte) => byte.charCodeAt(0))]));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const scale = canvas.width / 612;
      const edge = missing.radius + 1;
      context.fillStyle = 'rgb(250,249,247)';
      context.fillRect(Math.floor((missing.x - edge) * scale), Math.floor((missing.y - edge) * scale),
        Math.ceil(2 * edge * scale) + 1, Math.ceil(2 * edge * scale) + 1);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { raw: await readFile(portfolioFile(form.blank), 'base64'), missing });
    await chooseImage(page, '#setup-profile', { name: 'synthetic-fit-qa.png', mimeType: 'image/png', buffer: Buffer.from(damaged, 'base64') });
    await page.locator('#discovery-status:is([data-status="proposed"], [data-status="review"])').waitFor();
    await page.locator('#profile-name').fill('Synthetic bounded MC fit');
    await page.locator('#profile-mc-only').check();
    await page.locator('#mc-expected-count').fill('14');
    assert.equal(await page.locator('#region-coordinate-details').evaluate((details) => details.open), false);
    assert.equal(await page.locator('#legacy-grid-details').evaluate((details) => details.open), false);
    await page.locator('#rediscover-layout').click();
    await page.locator('#discovery-status[data-status="review"]').waitFor();
    const rows = page.locator('#profile-blocks [data-block-kind="mc"]');
    assert.equal(await rows.count(), 3);
    await page.locator('#mc-completeness').selectOption('complete');
    assert(await page.locator('#enroll-profile').isDisabled());
    assert.match(await page.locator('#template-save-status').textContent(), /Mapped 13 of 14/);
    await rows.first().getByRole('button', { name: 'Keep block on rediscovery' }).click();
    await rows.last().getByRole('button', { name: 'Renumber block' }).click();
    await page.locator('#block-first-number').fill('13');
    await page.locator('#apply-block-renumber').click();
    assert.equal(await rows.count(), 3);
    await openOptions(page, '#region-coordinate-details');
    for (const [field, number] of Object.entries({ x: 198, y: 84, width: 67, height: 57 })) {
      await page.locator('#region-' + field).fill(String(number));
    }
    await page.locator('#grid-rows').fill('3');
    await page.locator('#grid-columns').fill('4');
    await page.locator('#item-start').fill('10');
    await page.locator('#fit-mc-grid').click();
    const fitted = page.locator('#mc-fit-status');
    assert.match(await fitted.textContent(), /overlaps MC10–MC11.*remove the proposal/);
    await rows.nth(1).getByRole('button', { name: 'Remove', exact: true }).click();
    await page.locator('#fit-mc-grid').click();
    await fitted.filter({ hasText: /11 detected bubbles.*1 estimated position/i }).waitFor();
    const marker = await page.locator('#profile-canvas').evaluate((canvas, point) => {
      const scale = canvas.width / 612;
      const scaleY = canvas.height / 792;
      const edge = Math.ceil(11 * scale);
      const { data } = canvas.getContext('2d').getImageData(Math.round(point.x * scale) - edge,
        Math.round(point.y * scaleY) - edge, 2 * edge, 2 * edge);
      for (let index = 0; index < data.length; index += 4) {
        const [r, g, b] = data.slice(index, index + 3);
        if (r >= 175 && r - g > 65 && g - b > 25) return true;
      }
      return false;
    }, missing);
    assert(marker, 'Estimated choice should have an orange marker at the missing outline');
    await page.locator('#confirm-block').click();
    await page.locator('#block-confirm-status').filter({ hasText: /missing|estimated/i }).waitFor();
    assert.equal(await rows.count(), 2);
    await page.locator('#accept-mc-fit').click();
    await fitted.filter({ hasText: /1 estimated position.*accepted/i }).waitFor();
    await page.locator('#confirm-block').click();
    await rows.filter({ hasText: 'MC10–MC12' }).waitFor();
    assert.equal(await rows.count(), 3);
    assert(await page.locator('#enroll-profile').isDisabled());
    await page.locator('#mc-completeness').selectOption('complete');
    assert.match(await page.locator('#discovery-status').textContent(), /Reviewed mapping covers all 14/);
    await page.locator('#enroll-profile').click();
    await page.locator('#profile-editor').waitFor({ state: 'hidden' });
    const [profile] = await page.evaluate(async (module) => (await import(module)).listProfiles(), source('profile-store.js'));
    assert.equal(profile.mcExpectedCount, 14);
    await page.locator('#scan-completed').click();
    await recognize(page, portfolioFile(form.marked));
    const result = await page.locator('#recognition-results [data-item-id]').evaluateAll((nodes) => nodes.map((row) => [
      row.dataset.itemId, row.querySelector('[data-raw-text]')?.dataset.rawText ?? null, row.dataset.review,
    ]));
    assert.equal(result.length, 14);
    for (const { id, rawText } of form.truth.filter(({ kind }) => kind === 'mc')) {
      assert.deepEqual(result.find(([observed]) => observed === id), [id, rawText, 'false']);
    }
    console.log('  One successful fit, one attempted early confirm, one acceptance, one final block confirm.');
  });

  await group('M4 selected-box fallback preserves one Alberta grid without absorbing adjacent responses', async (page) => {
    const form = portfolio.find(({ variant }) => variant === 'document');
    await chooseImage(page, '#setup-profile', portfolioFile(form.blank));
    const editor = page.locator('#profile-editor');
    await editor.waitFor();
    await page.locator('#profile-name').fill('Synthetic selected-box template');
    await page.locator('#discovery-status[data-status="proposed"]').waitFor();
    await page.locator('#clear-discovery').click();
    await page.locator('#block-kind').selectOption('nr');
    await page.locator('#item-start').fill('2');
    async function detect(region) {
      for (const [field, value] of Object.entries(region)) await page.locator(`#region-${field}`).fill(String(value));
      await page.locator('#detect-grid').click();
    }
    await detect({ x: 306, y: 101, width: 280, height: 177 });
    await page.locator('#editor-status').filter({ hasText: /one.*(question|response|grid)|narrow/i }).waitFor();
    assert.equal(await page.locator('#profile-blocks > li').count(), 0);
    const expected = form.blocks.find(({ id }) => id === 'numeric-2');
    await detect({ x: 380, y: 101, width: 62, height: 177 });
    await page.locator('#editor-status').filter({ hasText: /42 printed NR bubbles/i }).waitFor();
    await page.locator('#confirm-block').click();
    await page.locator('#profile-blocks [data-block-kind="nr"]').waitFor();
    await page.locator('#enroll-profile').click();
    await editor.waitFor({ state: 'hidden' });
    const [saved] = await page.evaluate(async (module) => (await import(module)).listProfiles(), source('profile-store.js'));
    const [numerical] = saved.components;
    assert.equal(saved.components.length, 1);
    assert.equal(numerical.items[0].id, 'NR2');
    for (const [index, slot] of numerical.items[0].slots.entries()) {
      const physical = [...slot.choices].sort((a, b) => a.y - b.y);
      const expectedPhysical = expected.items[0].slots[index].choices;
      assert.deepEqual(physical.map(({ symbol }) => symbol), expectedPhysical.map(({ symbol }) => symbol));
      for (const [n, choice] of physical.entries()) {
        const target = expectedPhysical[n];
        const offset = Math.hypot(choice.x - target.x, choice.y - target.y) / target.radius;
        assert(offset <= .65, `Manual slot ${index + 1} ${choice.symbol} shifted ${offset.toFixed(3)} local radii`);
      }
    }
    await page.locator('#scan-completed').click();
    await recognize(page, portfolioFile(form.marked));
    const [result] = await page.locator('#recognition-results [data-item-id]').all();
    assert.equal(await page.locator('#recognition-results [data-item-id]').count(), 1);
    assert.equal(await result.getAttribute('data-item-id'), 'NR2');
    assert.equal(await result.locator('[data-raw-text]').getAttribute('data-raw-text'), '23.7');
  });

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
    await context.setOffline(true);
    const fromHere = server.requests.length;
    for (const path of [...shell, 'sw.js', 'precache.generated.js']) server.fault.set(path, { status: 503 });

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
    const samePixels = await page.evaluate(async ({ path, id }) => {
      const scans = (await (await import(path)).loadGrading()).scans;
      const source = document.getElementById('sheet-canvas');
      const saved = await createImageBitmap(scans.find((scan) => scan.id === id).photo);
      try {
        if (saved.width !== source.width || saved.height !== source.height) return false;
        const restored = document.createElement('canvas');
        restored.width = saved.width;
        restored.height = saved.height;
        restored.getContext('2d').drawImage(saved, 0, 0);
        const imageBytes = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const working = imageBytes(source);
        return imageBytes(restored).every((value, index) => value === working[index]);
      } finally { saved.close(); }
    }, { path: source('grading-store.js'), id: original.id });
    assert(samePixels, 'The retained PNG did not reproduce the exact recognition pixels');
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
    // JSON serializes negative zero as zero; its numerical transform is unchanged.
    assert.deepEqual(noPhoto.observation, JSON.parse(JSON.stringify(original.observation)));

    await page.reload();
    const saved = page.locator('#grading-saved');
    await saved.locator(`option[value="${original.id}"]`).waitFor({ state: 'attached' });
    await saved.selectOption(original.id);
    await waitGrade(page, '2/5 · 0 pending · final');
    const offline = await snapshot(page);
    assert(offline.scans.some(({ id, bytes }) => id === original.id && bytes === 0));
    const attempts = server.requests.slice(fromHere);
    assert(attempts.every(({ method, url, bytes }) => method === 'GET' && Number(bytes ?? 0) === 0 &&
      staticUrls.has(new URL(url, server.origin).href)), `Unexpected offline server request: ${JSON.stringify(attempts)}`);
    console.log(`  Offline static requests refused by server: ${attempts.map(({ method, url }) => `${method} ${url}`).join(', ') || 'none'}`);
    assert(requests.every(({ method, url, body }) => method === 'GET' && body === null &&
      (staticUrls.has(url) || url.startsWith(`blob:${server.origin}/`))), JSON.stringify(requests));
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
    await waitGrade(page, '2/5 · 0 pending · final');
    await page.locator('#grading-item').selectOption('MC1');
    await page.locator('#grading-answer').fill('B');
    await page.locator('#grading-correct').click();
    await appStatus(page).filter({ hasText: /review updated locally/i }).waitFor();
    await waitGrade(page, '3/5 · 0 pending · final');
    const exportedAgain = JSON.parse(await download(page, '#grading-json', 'scree-backup.json'));
    const corrected = exportedAgain.scans.find(({ id }) => id === deletedImage.id);
    assert.deepEqual(corrected.observation, deletedImage.observation);
    assert.equal(corrected.history.length, deletedImage.history.length + 1);
    assert.equal(corrected.grade.items.find(({ id }) => id === 'MC1').effective, 'B');
    assert.equal(corrected.photo, null);
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
