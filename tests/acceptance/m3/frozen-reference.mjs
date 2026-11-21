import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// M2 deployed reference and worked fixture from the accepted installation.
const frozen = {
  'profile.json': '3c47f44df558e3b5cb693d883bfe76b9c50a66f3b1e7a049d8b5c7127764e8e8',
  'reference-filled.pdf': '04dc4f8c5c35e6c66fea5afbc716dba63cc69cf881a06bc62c613b407ae88bac',
  'reference-filled.png': 'bc3370bd9bd5007218b0180fb91f813964dc159cc5793e11edd9864501452c68',
  'reference-key.json': 'c7720e8b874b6be57019a73058f8cb0f46c7164670b744549cce0541e6a5dab7',
};
const app = process.argv[2];
assert(app, 'Provide the static app path');
for (const [file, digest] of Object.entries(frozen)) {
  const actual = createHash('sha256').update(await readFile(resolve(app, 'reference', file))).digest('hex');
  assert.equal(actual, digest, `Frozen M2 compatibility artifact changed: ${file}`);
}
console.log(`Frozen M2 profile and worked example oracles match all ${Object.keys(frozen).length} digests.`);
