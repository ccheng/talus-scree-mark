import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileRecord, saveProfile } from '../app/src/profile-store.js';

test('saved profile records retain only the approved geometry and printed descriptors', () => {
  const bounds = { x: 4, y: 6, width: 20, height: 25, pixels: 'discard' };
  const choice = { symbol: 'A', x: 12, y: 18, radius: 2, mark: 'discard' };
  const profile = {
    id: 'mock', name: 'Mock layout', schemaVersion: 1, revision: 1, strategy: 'markerless',
    page: { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait', image: 'discard' },
    components: [{ id: 'C', kind: 'mc', bounds, items: [{ id: 'Q1', kind: 'mc', bounds, choices: [choice] }] }],
    features: [{ id: 'print', bounds, samples: [2, 10, 90], image: 'discard' }],
    printedLandmarks: [{ x: 36, y: 52, patch: 'a'.repeat(625), source: 'discard' }],
    allowManualIdentity: true, image: 'discard', answers: 'discard',
  };
  const record = profileRecord(profile);
  assert.equal(JSON.stringify(record).includes('discard'), false);
  assert.deepEqual(record.components[0].items[0].choices[0], { symbol: 'A', x: 12, y: 18, radius: 2 });
  assert.deepEqual(record.features[0].samples, [2, 10, 90]);
  assert.equal(record.allowManualIdentity, true);
  assert.deepEqual(record.printedLandmarks, [{ x: 36, y: 52, patch: 'a'.repeat(625) }]);
  profile.features[0].samples[0] = 'photo data';
  assert.throws(() => profileRecord(profile), /must be numeric/);
});

test('an unconfirmed profile cannot open the database for writing', async () => {
  await assert.rejects(saveProfile({ id: 'invalid', revision: 1 }), /name/);
});
