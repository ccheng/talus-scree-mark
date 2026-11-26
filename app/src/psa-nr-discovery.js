import { validateAlbertaMapping } from './alberta-nr-grid.js';
import { grayAt, toGrayImage } from './omr-image.js';
import { project } from './projective.js';
import { NRWorker } from './psa-nr/worker-client.js';

const pixelsPerPoint = 3;

function rectifiedRegion(image, matrix, region) {
  const width = Math.ceil(region.width * pixelsPerPoint);
  const height = Math.ceil(region.height * pixelsPerPoint);
  const source = toGrayImage(image);
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = project(matrix, region.x + x / pixelsPerPoint, region.y + y / pixelsPerPoint);
      const gray = point && grayAt(source, point.x, point.y);
      pixels[y * width + x] = Number.isFinite(gray) ? Math.round(gray) : 255;
    }
  }
  return { pixels, width, height };
}

export function mapPsaGrid({ proposals }, region) {
  const candidates = proposals.filter(({ decision, centers, decimals }) =>
    (decision === 'accept' || decision === 'review') && centers?.length === 40 && decimals?.length === 2);
  if (candidates.length !== 1) return null;
  const { centers, decimals, rasterShape, completeOutlines, evidence, decision } = candidates[0];
  // Never let a semantic review or an inferred but absent ring silently become a profile position.
  if (!completeOutlines || evidence.svm_margin < 0) return null;
  const radius = Math.min(...(rasterShape ?? [])) / pixelsPerPoint;
  const slots = Array.from({ length: 4 }, (_, column) => {
    const choice = ([x, y], symbol) => ({
      x: region.x + x / pixelsPerPoint,
      y: region.y + y / pixelsPerPoint,
      radius, symbol, observed: decision === 'accept',
    });
    const choices = Array.from({ length: 10 }, (_, row) => choice(centers[row * 4 + column], String(row)));
    if (column === 1 || column === 2) choices.unshift(choice(decimals[column - 1], '.'));
    return { choices };
  });
  validateAlbertaMapping(slots, region);
  return slots;
}

export function startPsaDiscovery(image, matrix, region, page) {
  const worker = new NRWorker();
  const result = (async () => {
    try {
      await worker.init();
      const { pixels, width, height } = rectifiedRegion(image, matrix, region);
      return mapPsaGrid(await worker.discover(pixels.buffer, width, height, { referenceWidth: Math.min(page.width, page.height) * pixelsPerPoint }), region);
    } finally {
      worker.close();
    }
  })();
  return { result, terminate: () => worker.close() };
}
