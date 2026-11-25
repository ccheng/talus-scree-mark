import { discoverBoxedAlberta } from '../../app/src/layout-discovery.js';
import { grayAt, quantile, toGrayImage } from '../../app/src/omr-image.js';
import { pageRingCandidates } from '../../app/src/profile-authoring.js';
import { project } from '../../app/src/projective.js';
import { columnRows, writingStrips } from './structure-first.mjs';

const median = (values) => quantile(values, .5);
const angles = Array.from({ length: 24 }, (_, i) => [Math.cos(i * Math.PI / 12), Math.sin(i * Math.PI / 12)]);

function printAt(gray, matrix, x, y) {
  const at = project(matrix, x, y);
  return at ? grayAt(gray, at.x, at.y) : NaN;
}

// Use local contrast relative to the paper immediately outside an outline.
// View the perimeter directly, so the printed numeral can remain in place.
function outlineAt(gray, matrix, x, y, nominal) {
  let best;
  for (const ox of [-.55, 0, .55]) {
    for (const oy of [-.55, 0, .55]) {
      for (const ratio of [.83, .93, 1.03]) {
        const cx = x + ox, cy = y + oy, radius = nominal * ratio;
        const contrasts = angles.map(([dx, dy]) => {
          const at = (scale) => printAt(gray, matrix, cx + dx * radius * scale, cy + dy * radius * scale);
          const outline = Math.min(at(.95), at(1), at(1.05));
          return Math.min(at(1.24) - outline, at(.72) - outline);
        });
        if (contrasts.some((value) => !Number.isFinite(value))) continue;
        const covered = contrasts.filter((v) => v >= 7).length;
        if (covered < 17 || [0, 6, 12, 18].some((start) =>
          contrasts.slice(start, start + 6).filter((v) => v >= 7).length < 3)) continue;
        const score = covered + Math.min(20, median(contrasts)) / 20;
        if (!best || score > best.score) best = { x: cx, y: cy, radius, score };
      }
    }
  }
  if (!best) return null;
  const { x: cx, y: cy, radius } = best;
  return { x: cx, y: cy, radius };
}

function rowModels(bands, strip) {
  const models = [];
  const observed = bands.filter(({ cells }) => cells.filter(Boolean).length >= 3);
  for (const [index, first] of observed.entries()) {
    for (const last of observed.slice(index + 5)) {
      for (let span = 6; span <= 9; span++) {
        const pitch = (last.y - first.y) / span;
        if (pitch < 7 || pitch > Math.min(32, strip.pitch * 1.4)) continue;
        for (let offset = 0; offset + span < 10; offset++) {
          const start = first.y - offset * pitch;
          const decimalGap = start - pitch - strip.bottom;
          if (decimalGap < 1.7 || decimalGap > strip.pitch * 1.3) continue;
          const rows = Array.from({ length: 10 }, (_, i) =>
            bands.find(({ y }) => Math.abs(y - start - i * pitch) <= 1.25));
          const support = rows.reduce((total, row) => total + (row?.cells.filter(Boolean).length ?? 0), 0);
          if (support >= 26) models.push({ start, pitch, rows, support });
        }
      }
    }
  }
  return models.sort((a, b) => b.support - a.support)
    .filter((model, index, all) => !all.slice(0, index).some((better) =>
      Math.abs(better.start - model.start) < 1 && Math.abs(better.start + 9 * better.pitch - model.start - 9 * model.pitch) < 1));
}

function recover(gray, matrix, region, rings, strip, { allowMissing = false } = {}) {
  const bands = columnRows(rings, strip);
  return rowModels(bands, strip).slice(0, 6).flatMap(({ start, pitch, rows }) => {
    const supported = rows.flatMap((row) => row?.cells.filter(Boolean) ?? []);
    const nominal = median(supported.map(({ radius }) => radius));
    const xs = strip.xs.map((x, column) => {
      const centers = rows.map((row) => row?.cells[column]?.x).filter(Number.isFinite);
      return centers.length ? median(centers) : x;
    });
    const decimal = start - pitch;
    const inRegion = (x, y) => x - nominal >= region.x && x + nominal <= region.x + region.width &&
      y - nominal >= region.y && y + nominal <= region.y + region.height;
    const locate = (x, y, observed) => {
      if (!inRegion(x, y)) return null;
      if (observed && Math.abs(observed.radius - nominal) < nominal * .28) {
        const { x, y, radius } = observed;
        return { x, y, radius };
      }
      return outlineAt(gray, matrix, x, y, nominal);
    };
    const decimalBand = bands.find(({ y }) => Math.abs(y - decimal) <= pitch * .17);
    if ([0, 3].some((col) => locate(xs[col], decimal, decimalBand?.cells[col]))) return [];
    const next = start + 10 * pitch;
    const extra = bands.find(({ y }) => Math.abs(y - next) <= 1.25);
    if (xs.filter((x, col) => locate(x, next, extra?.cells[col])).length >= 2) return [];
    const slots = xs.map((x, col) => ({
      choices: [...([1, 2].includes(col) ? [{ symbol: '.', y: decimal, detected: decimalBand?.cells[col] }] : []),
        ...rows.map((row, index) => ({ symbol: String(index), y: start + index * pitch, detected: row?.cells[col] }))]
        .map(({ symbol, y, detected }) => {
          const center = locate(x, y, detected);
          return center ? { symbol, ...center, observed: true } : { symbol, x, y, radius: nominal, observed: false };
        }),
    }));
    const missing = slots.flatMap(({ choices }) => choices).filter(({ observed }) => !observed).length;
    return !missing || allowMissing ? [{ slots, missing }] : [];
  });
}

export function inspectBoundedAlberta(image, matrix, page, region, options) {
  const gray = toGrayImage(image);
  const strips = writingStrips(gray, matrix, region);
  const rings = pageRingCandidates(gray, matrix, page, { printedCenters: true, maxRadius: 8.6, fineOutlines: true, region });
  const models = strips.flatMap((strip) => recover(gray, matrix, region, rings, strip, options));
  const unambiguous = models.filter((model, i, all) => !all.slice(0, i).some((prior) =>
    model.slots.every(({ choices }, c) => choices.every(({ x, y }, r) =>
      Math.hypot(x - prior.slots[c].choices[r].x, y - prior.slots[c].choices[r].y) < 1.5))));
  return { models: unambiguous, strips: strips.length, rings: rings.length };
}

export function discoverWithOutlineRecovery(image, matrix, page, region) {
  const existing = discoverBoxedAlberta(image, matrix, page, region);
  if (existing.block || existing.count > 1) return existing;
  const { models } = inspectBoundedAlberta(image, matrix, page, region);
  if (models.length !== 1) return { count: models.length, reason: 'no-single-recovered-grid' };
  return { count: 1, block: { items: [{ slots: models[0].slots }] } };
}
