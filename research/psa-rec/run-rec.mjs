// Run from the repository root with Node 22: node research/psa-rec/run-rec.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { createPredictor } from '../../app/src/cpas-recognition/forest.js';
import { evaluateCompletion as baseline } from '../../app/src/cpas-recognition/completion.js';
import { evaluateCompletion as candidate } from './completion-with-patches.js';
import { enrollReferencePatches, openReferencePatches } from './compact-reference.js';
import { proposeHandwritingBoxes } from './handwriting-boxes.js';
import { readBubbleRegions, measureNumericalBlankInk } from '../../app/src/marks.js';
import { runCompactReferenceTests } from './rec-r1-test.mjs';
import { testBoxes } from './rec-r2-test.mjs';
import { compareRecognition } from './rec-r3-r4-pilot.mjs';
import { compareRecognition as stress } from './rec-r3-r4-stress.mjs';
const read = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const metadata = read('../../app/assets/cpas/completion-native.json');
const bytes = readFileSync(new URL('../../app/assets/cpas/completion.bin', import.meta.url));
const predict = createPredictor(metadata, bytes);
const input = { predict, evaluateCompletion: baseline, readBubbleRegions, measureNumericalBlankInk };
const actual = {
  'rec-r1-results.json': runCompactReferenceTests({ enrollReferencePatches, openReferencePatches, baseline, candidate, predict }),
  'rec-r2-results.json': testBoxes(proposeHandwritingBoxes),
  'rec-r3-r4-results.json': compareRecognition(input),
  'rec-r3-r4-stress-results.json': [0, .6, 1.2].map(displacement => stress({ ...input, displacement }))
};
for (const [file, result] of Object.entries(actual)) {
  assert.deepEqual(result, read('./' + file), file);
  console.log('PASS', file);
}
