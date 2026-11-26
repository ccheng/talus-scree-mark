import { grayAt, quantile, toGrayImage } from './omr-image.js';
import { pageRingCandidates } from './profile-authoring.js';
import { project } from './projective.js';

const scale = 2;
const median = (values) => quantile(values, .5);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

function runs(values) {
  const output = [];
  for (let i = 0; i < values.length; i++) {
    if (!values[i]) continue;
    const start = i;
    while (values[i + 1]) i++;
    output.push([start, i]);
  }
  return output;
}

function writingStrips(gray, matrix, region) {
  const width = Math.floor(region.width * scale);
  const height = Math.floor(region.height * scale);
  const raster = Array.from({ length: height }, (_, y) =>
    Uint8Array.from({ length: width }, (_, x) => {
      const source = project(matrix, region.x + x / scale, region.y + y / scale);
      return source ? grayAt(gray, source.x, source.y) || 0 : 255;
    }));
  const lines = [];
  const shortEdges = [];
  for (const [y, row] of raster.entries()) {
    const threshold = quantile(row, .96) * .72;
    const spans = runs(row.map((value) => value < threshold));
    shortEdges.push(spans.filter(([left, right]) => right - left >= 5.5 * scale && right - left <= 42 * scale));
    const longSpans = spans.filter(([left, right]) => right - left >= 9 * scale);
    const groups = [];
    for (const span of longSpans) {
      const group = groups.at(-1);
      if (group && span[0] - group[1] <= 8 * scale) group[1] = span[1];
      else groups.push([...span]);
    }
    for (const [left, right] of groups.filter(([a, b]) => b - a >= 40 * scale)) {
      lines.push({ y, left, right });
    }
  }

  const strips = [];
  for (const [index, top] of lines.entries()) {
    for (const bottom of lines.slice(index + 1)) {
      const height = bottom.y - top.y;
      if (height > 48 * scale) break;
      if (height < 8 * scale || Math.abs(top.left - bottom.left) > 3 * scale ||
          Math.abs(top.right - bottom.right) > 3 * scale) continue;
      const left = Math.max(0, Math.min(top.left, bottom.left) - 2 * scale);
      const right = Math.min(width - 1, Math.max(top.right, bottom.right) + 2 * scale);
      const support = new Uint8Array(right - left + 1);
      for (let x = left; x <= right; x++) {
        const column = raster.slice(top.y + 2, bottom.y - 1).map((row) => row[x]);
        support[x - left] = column.filter((value) => value < 145).length >= .82 * column.length;
      }
      const edges = runs(support).map(([a, b]) => left + (a + b) / 2);
      if (edges.length !== 5 && edges.length !== 8) continue;
      const shared = edges.length === 5;
      const cells = Array.from({ length: 4 }, (_, i) => edges.slice(shared ? i : i * 2, (shared ? i : i * 2) + 2));
      const widths = cells.map(([a, b]) => b - a);
      const centers = cells.map(([a, b]) => (a + b) / 2);
      const pitch = (centers[3] - centers[0]) / 3;
      if (pitch < 12 * scale || pitch > 45 * scale ||
          widths.some((w) => w < pitch * .58 || w > pitch * 1.12) ||
          centers.some((x, i) => Math.abs(x - centers[0] - pitch * i) > .12 * pitch)) continue;
      const xs = centers.map((x) => region.x + x / scale);
      const y = region.y + bottom.y / scale;
      if (!strips.some((strip) => Math.abs(strip.bottom - y) < 2 && Math.abs(strip.xs[0] - xs[0]) < 2)) {
        strips.push({ xs, bottom: y, pitch: pitch / scale });
      }
    }
  }
  for (const strip of separateBoxes(shortEdges, raster, region)) {
    if (!strips.some(({ xs, bottom }) => Math.abs(xs[0] - strip.xs[0]) < 2 && Math.abs(bottom - strip.bottom) < 2)) {
      strips.push(strip);
    }
  }
  return strips;
}

function separateBoxes(horizontalEdges, raster, region) {
  const boxes = [];
  for (const [top, edges] of horizontalEdges.entries()) {
    for (let bottom = top + 8 * scale; bottom < Math.min(horizontalEdges.length, top + 48 * scale); bottom++) {
      for (const [left, right] of edges) {
        const bottomEdge = horizontalEdges[bottom].find(([a, b]) => Math.abs(a - left) <= 2 && Math.abs(b - right) <= 2);
        if (!bottomEdge) continue;
        const side = (x) => {
          const stripe = raster.slice(top + 2, bottom - 1);
          return [x - 1, x, x + 1].some((column) =>
            stripe.filter((row) => row[column] < 160).length >= .82 * stripe.length);
        };
        if (!side(left) || !side(right)) continue;
        const x = (left + right) / 2;
        if (!boxes.some((box) => Math.abs(box.x - x) <= 2 && Math.abs(box.top - top) <= 2 && Math.abs(box.bottom - bottom) <= 2)) {
          boxes.push({ x, left, right, top, bottom });
        }
      }
    }
  }

  const strips = [];
  boxes.sort((a, b) => a.x - b.x);
  for (const [index, first] of boxes.entries()) {
    const aligned = boxes.slice(index + 1).filter((box) => Math.abs(box.top - first.top) <= 4 &&
      Math.abs(box.bottom - first.bottom) <= 4 && box.left > first.right);
    for (const second of aligned) {
      const pitch = second.x - first.x;
      if (pitch < 12 * scale || pitch > 45 * scale) continue;
      const third = aligned.find((box) => box.left > second.right && Math.abs(box.x - first.x - 2 * pitch) < .12 * pitch);
      const fourth = third && aligned.find((box) => box.left > third.right && Math.abs(box.x - first.x - 3 * pitch) < .12 * pitch);
      if (!fourth) continue;
      const cells = [first, second, third, fourth];
      const widths = cells.map(({ left, right }) => right - left);
      if (widths.some((width) => width > .94 * pitch || Math.abs(width - median(widths)) > .20 * pitch)) continue;
      strips.push({
        xs: cells.map(({ x }) => region.x + x / scale),
        bottom: region.y + mean(cells.map(({ bottom }) => bottom)) / scale,
        pitch: (fourth.x - first.x) / (3 * scale),
      });
    }
  }
  return strips;
}

function columnRows(rings, { xs, bottom, pitch }) {
  const rows = [];
  for (const ring of rings.filter(({ y }) => y > bottom + 1).sort((a, b) => a.y - b.y)) {
    const col = xs.findIndex((x) => Math.abs(ring.x - x) <= Math.min(3.2, .16 * pitch));
    if (col < 0) continue;
    let row = rows.at(-1);
    if (!row || ring.y - row.y > 1.65) {
      row = { y: ring.y, cells: [null, null, null, null] };
      rows.push(row);
    }
    const previous = row.cells[col];
    if (!previous || ring.radius > previous.radius) row.cells[col] = ring;
    row.y = mean(row.cells.filter(Boolean).map(({ y }) => y));
  }
  return rows;
}

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

