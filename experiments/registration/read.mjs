import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { readProfileSheet } from '../../app/src/profile-omr.js';
import { readBubbleRegions } from '../../app/src/marks.js';
import { toGrayImage } from '../../app/src/omr-image.js';
import { proposePageCorners } from '../../app/src/markerless-registration.js';

const { width, height, profile, corners, transforms } = JSON.parse(process.argv[2]);
const pixels = new Uint8ClampedArray(readFileSync(0));
const image = { id: 'offline-replay', width, height, pixels };
const start = performance.now();
if (!transforms) {
  const result = readProfileSheet(image, profile, { corners, batch: { profileId: profile.id, revision: profile.revision } });
  const ms = performance.now() - start;
  const hintStart = performance.now();
  const estimatedCorners = corners ? undefined : proposePageCorners(image);
  console.log(JSON.stringify({
    accepted: result.status === 'read', items: result.items, matrix: result.registration.pageToSource,
    reasons: result.registration.reasons, ms, estimatedCorners, hintMs: performance.now() - hintStart,
  }));
} else {
  const gray = toGrayImage(image);
  const items = profile.components.flatMap((block, i) => readBubbleRegions(gray, transforms[i], block.items));
  console.log(JSON.stringify({ accepted: true, items, ms: performance.now() - start }));
}
