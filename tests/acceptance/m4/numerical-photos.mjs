import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [appArg = 'app', fixturesArg = 'tests/acceptance/m4/fixtures'] = process.argv.slice(2);
const source = (file) => import(pathToFileURL(resolve(appArg, 'src', file)));
const { readProfileSheet } = await source('profile-omr.js');
const { createMarkerlessProfile } = await source('profile-authoring.js');
const { pageTransform } = await source('markerless-registration.js');
const { measureNumericalBlankInk } = await source('marks.js');
const { toGrayImage } = await source('omr-image.js');
const { normalizeAnswer, templateItems } = await source('grading.js');
const { blank, components, cases } = JSON.parse(readFileSync(resolve(fixturesArg, 'numerical-oracle.json')));

const page = { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' };
const batch = { profileId: 'numerical-photo-regression', revision: 1 };
function image(fixture) {
  const raw = execFileSync('python3', ['-c',
    "from PIL import Image; import sys; sys.stdout.buffer.write(Image.open(sys.argv[1]).convert('RGBA').tobytes())",
    resolve(fixturesArg, fixture.file)], { maxBuffer: 2400 ** 2 * 4 });
  assert.equal(raw.length, fixture.width * fixture.height * 4);
  return { id: fixture.file, width: fixture.width, height: fixture.height, pixels: new Uint8ClampedArray(raw) };
}
const calibrated = measureNumericalBlankInk(toGrayImage(image(blank)), pageTransform(page, blank.corners), components);
const profile = createMarkerlessProfile({ id: batch.profileId, revision: 1, name: 'Synthetic mixed', page, components: calibrated });
const logical = new Map(templateItems(profile).map((item) => [item.id, item]));
for (const fixture of cases) {
  const scan = image(fixture);
  for (const mode of ['automatic', 'manual']) {
    const result = readProfileSheet(scan, profile, { batch, corners: mode === 'manual' ? fixture.corners : undefined });
    const details = result.items.map(({ id, rawText, review, reasons, slots }) => {
      const parser = normalizeAnswer(logical.get(id), rawText);
      const expectedReview = fixture.review?.[id];
      const pending = review || parser.status === 'invalid';
      const exact = rawText === fixture.truth[id];
      const pass = expectedReview
        ? pending && (expectedReview === 'multiple' ? reasons.includes('multiple-marks') :
            expectedReview === 'format' ? review && exact && reasons.includes('nr-format') : reasons.some((reason) => ['weak-mark','competing-mark'].includes(reason)))
        : exact && !pending || Boolean(fixture.optionalReview?.includes(id) && review && rawText === null);
      return { id, rawText, review, pending, reasons, pass, ...(!pass && slots ? { slotScores: slots.map(({ status, choices }) =>
        ({ status, strongest: choices.filter(({ score }) => score !== null).sort((a,b) => b.score - a.score).slice(0,2)
          .map(({ symbol, score }) => [symbol, +score.toFixed(3)]) })) } : {}) };
    });
    const strongPenRead = !fixture.optionalReview?.length ||
      details.some(({ id, review, rawText }) => fixture.optionalReview.includes(id) && !review && rawText === fixture.truth[id]);
    const pass = fixture.valid ? result.status === 'read' && details.length === logical.size &&
      details.every(({ pass }) => pass) && strongPenRead
      : result.status === 'retake' && !details.length;
    console.log(JSON.stringify({ name: fixture.name, mode, valid: fixture.valid, status: result.status, pass, details,
      reasons: result.registration.reasons, blocks: result.registration.geometry?.blocks }));
    if (!pass) process.exitCode = 1;
  }
}
