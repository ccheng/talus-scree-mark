import { discoverWithOutlineRecovery } from './outline-recovery.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { discoverBoxedAlberta } from '../../app/src/layout-discovery.js';
import { pageTransform } from '../../app/src/markerless-registration.js';
import { discoverStructureFirst } from './structure-first.mjs';

function image(path) {
  const bytes = execFileSync('python3', ['-c', `
from PIL import Image
import struct, sys
im = Image.open(sys.argv[1]).convert("RGBA")
sys.stdout.buffer.write(struct.pack("<II", *im.size) + im.tobytes())
`, path], { maxBuffer: 2400 ** 2 * 4 + 8 });
  return { width: bytes.readUInt32LE(0), height: bytes.readUInt32LE(4), pixels: new Uint8ClampedArray(bytes.subarray(8)) };
}

function score(result, expected) {
  const found = result.block?.items[0].slots.flatMap(({ choices }, slot) => choices.map((choice) => ({ ...choice, slot })));
  if (!found) return { complete: false, exact: false, reason: result.reason ?? (result.incomplete ? 'incomplete' : 'no-single-grid') };
  const errors = expected?.map(({ x, y, radius, symbol, slot }) => {
    const choice = found.find((choice) => choice.slot === slot && choice.symbol === symbol);
    return choice ? Math.hypot(choice.x - x, choice.y - y) / radius : Infinity;
  });
  return { complete: true, exact: Boolean(errors && errors.length === 42 && found.length === 42 && errors.every((error) => error <= .5)),
    maxCenterError: errors && (errors.every(Number.isFinite) ? Math.max(...errors) : null) };
}

const manifest = resolve(process.argv[2]);
const { page, cases } = JSON.parse(readFileSync(manifest));
for (const item of cases) {
  const input = image(resolve(dirname(manifest), item.image));
  const pose = pageTransform(page, item.corners);
  const args = [input, pose, page, item.region];
  console.log(JSON.stringify({ name: item.name, valid: Boolean(item.expected),
    existing: score(discoverBoxedAlberta(...args), item.expected),
    outlineRecovery: score(discoverWithOutlineRecovery(...args), item.expected),
    structureFirst: score(discoverStructureFirst(...args), item.expected) }));
}
