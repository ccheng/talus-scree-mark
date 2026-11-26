import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mapPsaGrid, pagePsaProposals, reconcilePsaPage } from '../app/src/psa-nr-discovery.js';

const region = { x: 100, y: 200, width: 80, height: 140 };
const proposal = {
  centers: Array.from({ length: 40 }, (_, cell) => [30 + 45 * (cell % 4), 84 + 30 * Math.floor(cell / 4)]),
  decimals: [[75, 54], [120, 54]], rasterShape: [9, 10], completeOutlines: true, evidence: { svm_margin: .1 }, decision: 'accept',
};

test('PSA digit rows and decimals map to existing Alberta profile positions in page points', () => {
  const slots = mapPsaGrid({ proposals: [proposal] }, region);
  assert.deepEqual(slots.map(({ choices }) => choices.map(({ symbol }) => symbol).join('')),
    ['0123456789', '.0123456789', '.0123456789', '0123456789']);
  assert.deepEqual(slots[1].choices[0], { x: 125, y: 218, radius: 3, symbol: '.', observed: true });
  assert.deepEqual(slots[3].choices.at(-1), { x: 155, y: 318, radius: 3, symbol: '9', observed: true });
});

test('PSA review stays provisional and ambiguous, rejected or out-of-bounds candidates do not map', () => {
  const review = { ...proposal, decision: 'review' };
  assert.ok(mapPsaGrid({ proposals: [review] }, region).every(({ choices }) => choices.every(({ observed }) => !observed)));
  assert.equal(mapPsaGrid({ proposals: [review, proposal] }, region), null);
  assert.equal(mapPsaGrid({ proposals: [{ ...proposal, decision: 'reject' }] }, region), null);
  assert.equal(mapPsaGrid({ proposals: [{ ...proposal, completeOutlines: false }] }, region), null);
  assert.equal(mapPsaGrid({ proposals: [{ ...review, evidence: { svm_margin: -.1 } }] }, region), null);
  assert.throws(() => mapPsaGrid({ proposals: [{ ...proposal, decimals: [[0, 54], [120, 54]] }] }, region), /outside/);
});

test('bundled PSA weights match the frozen model and precache digest', async () => {
  const assets = new URL('../app/assets/psa-nr/', import.meta.url);
  const [weights, manifest] = await Promise.all([
    readFile(new URL('svm.f64', assets)),
    readFile(new URL('svm-meta.json', assets), 'utf8'),
  ]);
  const { shellAssets } = await import('../app/precache.generated.js');
  const digest = createHash('sha256').update(weights).digest('hex');
  assert.equal(weights.length, 8_336_736);
  assert.equal(digest, 'd70778fe1dbea80e1219ff559dd4a5171c884655e80ab44c1b7cbb56e41149c3');
  assert.equal(digest, JSON.parse(manifest).sha256);
  assert.equal(digest, shellAssets['assets/psa-nr/svm.f64']);
});

const page = { width: 612, height: 792 };
const pageGrid = (offset = 0, overrides = {}) => ({
  ...proposal, ...overrides,
  centers: proposal.centers.map(([x, y]) => [x + 2.4 * offset, y + 100]),
  decimals: proposal.decimals.map(([x, y]) => [x + 2.4 * offset, y + 100]),
});
const layout = (components) => ({
  components, diagnostics: [], issues: components.length ? [] : ['no-grid'],
});

test('whole-page PSA reconciliation adds multiple grids, replaces equivalent NR once, and retains MC', () => {
  const candidates = pagePsaProposals({ proposals: [pageGrid(200, { decision: 'review' }), pageGrid()] }, page);
  const duplicate = { ...candidates[1].block, id: 'established' };
  const mc = { id: 'mc', kind: 'mc', bounds: { x: 420, y: 70, width: 40, height: 140 } };
  const result = reconcilePsaPage(layout([mc, duplicate]), candidates, []);
  assert.deepEqual(result.components.map(({ id }) => id), [candidates[1].block.id, candidates[0].block.id, 'mc']);
  assert.equal(result.components[2], mc);
  assert.deepEqual(result.psa, { added: 2, reviewCount: 1, conflicts: 0 });
  assert.deepEqual(result.issues, ['psa-provisional-grids']);
  assert.equal(result.diagnostics.find(({ id }) => id === candidates[0].block.id).psaReview, true);
});

test('whole-page PSA preserves overlapping MC and exclusions and withholds a contradicted legacy NR', () => {
  const candidates = pagePsaProposals({ proposals: [
    pageGrid(), pageGrid(200), pageGrid(350, { completeOutlines: false }),
  ] }, page);
  const mc = { ...candidates[0].block, kind: 'mc', id: 'mc' };
  const protectedRegion = candidates[1].block.bounds;
  const duplicate = { ...candidates[2].block, id: 'established' };
  const result = reconcilePsaPage(layout([mc, duplicate]), candidates, [protectedRegion]);
  assert.deepEqual(result.components, [mc]);
  assert.deepEqual(result.psa, { added: 0, reviewCount: 0, conflicts: 2 });
  assert.deepEqual(result.issues, ['psa-conflicting-grids']);
  assert.deepEqual(reconcilePsaPage(layout([duplicate]), [], []).components, [duplicate]);
});
