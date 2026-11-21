import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ImageInputError, MAX_FILE_BYTES, inspectImage, workingDimensions } from '../app/src/image.js';

const readFixture = (file) => readFile(new URL(`./fixtures/images/${file}`, import.meta.url));

test('image inspection identifies real PNG, baseline JPEG and progressive JPEG by bytes', async () => {
  for (const [file, type] of [
    ['colored-corners.png', 'image/png'],
    ['colored-corners.jpg', 'image/jpeg'],
    ['colored-corners-mirrored.jpg', 'image/jpeg'],
  ]) {
    assert.deepEqual(inspectImage(await readFixture(file)), { type, width: 48, height: 32 });
  }
});

test('image inspection rejects truncated, mislabeled unsupported and oversized bytes', async () => {
  const png = await readFixture('colored-corners.png');
  const jpeg = await readFixture('colored-corners.jpg');
  assert.throws(() => inspectImage(png.subarray(0, png.length - 3)), /could not be read/);
  assert.throws(() => inspectImage(jpeg.subarray(0, jpeg.length - 2)), /could not be read/);
  assert.throws(() => inspectImage(Buffer.from('Contents of a file labeled image/jpeg.')), /unsupported/);
  assert.throws(() => inspectImage(new Uint8Array(MAX_FILE_BYTES + 1)), /exceeds 20 MiB/);
  png.writeUInt32BE(8193, 16);
  assert.throws(() => inspectImage(png), /too large/);

  const frame = jpeg.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(frame > 0);
  jpeg.writeUInt16BE(5000, frame + 5);
  jpeg.writeUInt16BE(5000, frame + 7);
  assert.throws(() => inspectImage(jpeg), /too large/);
});

test('working dimensions bound the long edge, preserve aspect ratio and avoid upscaling', () => {
  assert.deepEqual(workingDimensions(4000, 3000), { width: 2400, height: 1800 });
  assert.deepEqual(workingDimensions(3000, 4000), { width: 1800, height: 2400 });
  assert.deepEqual(workingDimensions(31, 17), { width: 31, height: 17 });
  assert.deepEqual(workingDimensions(1, 3000), { width: 1, height: 2400 });
  assert.throws(() => workingDimensions(0, 150), ImageInputError);
  assert.throws(() => workingDimensions(5000, 5000), /too large/);
});
