import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mapPsaGrid } from '../app/src/psa-nr-discovery.js';

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
