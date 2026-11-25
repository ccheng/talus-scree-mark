import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [appArg, fixturesArg] = process.argv.slice(2);
const app = resolve(appArg ?? 'app');
const fixtures = resolve(fixturesArg ?? 'tests/acceptance/m4/fixtures');
const source = (file) => import(pathToFileURL(resolve(app, 'src', file)));
const { readProfileSheet } = await source('profile-omr.js');
const { createMarkerlessProfile, proposeGrid } = await source('profile-authoring.js');
const { pageTransform } = await source('markerless-registration.js');
const oracle = JSON.parse(readFileSync(resolve(fixtures, 'independent-oracle.json')));
const page = { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' };
const batch = { profileId: 'photo-regression', revision: 1 };

function image(file) {
  const raw = execFileSync('python3', ['-c',
    "import sys; from PIL import Image; sys.stdout.buffer.write(Image.open(sys.argv[1]).convert('RGBA').tobytes())",
    resolve(fixtures, file.file)], { maxBuffer: 2400 ** 2 * 4 });
  assert.equal(raw.length, file.width * file.height * 4);
  return { id: file.file, width: file.width, height: file.height, pixels: new Uint8ClampedArray(raw) };
}

// Reuse the same capture pair, paper pose and enrollment boxes as the browser
// acceptance scenario, with a compact direct harness for deeper comparisons.
const rectangles = [[70, 84, 68, 37, 2], [70, 148, 68, 142, 7], [197, 84, 68, 57, 3], [197, 168, 68, 37, 2]];
const blank = image(oracle.blank);
const pose = pageTransform(page, oracle.blank.corners);
let number = 0;
const components = rectangles.map(([x, y, width, height, rows], index) => {
  const bounds = { x, y, width, height };
  const grid = proposeGrid(blank, pose, bounds, { rows, columns: 4 });
  assert.equal(grid.cells.length, rows * 4);
  const items = Array.from({ length: rows }, (_, row) => {
    const choices = grid.cells.filter((cell) => cell.row === row).sort((a, b) => a.column - b.column)
      .map(({ x, y, radius }, column) => ({ x, y, radius, symbol: 'ABCD'[column] }));
    const x = Math.min(...choices.map((c) => c.x - c.radius));
    const y = Math.min(...choices.map((c) => c.y - c.radius));
    const right = Math.max(...choices.map((c) => c.x + c.radius));
    const bottom = Math.max(...choices.map((c) => c.y + c.radius));
    return { id: `MC${++number}`, kind: 'mc', bounds: { x, y, width: right - x + .1, height: bottom - y + .1 }, choices };
  });
  return { id: `block-${index}`, kind: 'mc', bounds, items };
});
const profile = createMarkerlessProfile({
  id: batch.profileId, revision: 1, name: 'Photo regression', scope: 'mc-only', mcCompleteness: 'complete', page, components,
});
const truth = new Map(oracle.truth.filter(({ kind }) => kind === 'mc').map(({ id, rawText }) => [id, rawText]));
for (const fixture of oracle.photographicRegression) {
  const scan = image(fixture);
  for (const mode of ['automatic', 'manual']) {
    const result = readProfileSheet(scan, profile, { batch, corners: mode === 'manual' ? fixture.corners : undefined });
    const accepted = result.status === 'read';
    const review = result.items.filter((item) => item.review).length;
    const wrong = fixture.valid ? result.items.filter((item) => !item.review && item.rawText !== truth.get(item.id)).length : null;
    assert(!wrong, `Wrong MC observation in ${fixture.name} (${mode})`);
    const pass = accepted === fixture.valid;
    console.log(JSON.stringify({ fixture: fixture.name, mode, valid: fixture.valid, accepted, exact: fixture.valid ? result.items.length - review : null,
      review, wrong, pass, path: result.registration.cornerPath, reasons: result.registration.reasons }));
    if (!pass && process.env.SCREEMARK_STRICT_PHOTOS === '1') process.exitCode = 1;
  }
}
