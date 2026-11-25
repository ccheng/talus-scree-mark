import { grayAt, quantile, toGrayImage } from '../../app/src/omr-image.js';
import { pageRingCandidates } from '../../app/src/profile-authoring.js';
import { project } from '../../app/src/projective.js';

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

export function writingStrips(gray, matrix, region) {
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

export function columnRows(rings, { xs, bottom, pitch }) {
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

function digitsAndDecimals(rows, strip) {
  const grids = [];
  for (const [i, decimal] of rows.entries()) {
    const [a, b, c, d] = decimal.cells;
    if (a || !b || !c || d || decimal.y - strip.bottom > strip.pitch * 1.65) continue;
    const digitRows = rows.slice(i + 1).filter(({ cells }) => cells.filter(Boolean).length >= 2);
    // Identify row zero relative to the printed decimal row. A missing
    // outline never causes later digit rows to slide up and change meaning.
    for (const [index, zero] of digitRows.entries()) {
      const next = digitRows[index + 1];
      if (!next) continue;
      const step = next.y - zero.y;
      if (step < 6 || step > strip.pitch * 1.35 || zero.y - decimal.y < step * .55 ||
          zero.y - decimal.y > step * 1.55) continue;
      const lattice = Array.from({ length: 10 }, (_, row) =>
        digitRows.find(({ y }) => Math.abs(y - zero.y - row * step) <= Math.max(1.45, step * .14)));
      if (!lattice.every((row) => row?.cells.every(Boolean))) continue;
      if (digitRows.some(({ y }) => Math.abs(y - zero.y - 10 * step) <= Math.max(1.45, step * .14))) continue;
      const rings = [b, c, ...lattice.flatMap(({ cells }) => cells)];
      const typical = median(rings.map(({ radius }) => radius));
      if (rings.some(({ radius }) => Math.abs(radius - typical) > Math.max(.85, .26 * typical))) continue;
      grids.push(numericalSlots(lattice, decimal));
    }
  }
  return grids;
}

function numericalSlots(rows, decimal) {
  return decimal.cells.map((cell, column) => ({
    choices: [
      ...(cell ? [{ ...cell, symbol: '.' }] : []),
      ...rows.map(({ cells }, digit) => ({ ...cells[column], symbol: String(digit) })),
    ],
  }));
}

// Research only. Work in the teacher's bounded region with a known page pose.
export function discoverStructureFirst(image, matrix, page, region) {
  const gray = toGrayImage(image);
  const strips = writingStrips(gray, matrix, region);
  if (!strips.length) return { count: 0, reason: 'no-writing-strip' };
  const rings = pageRingCandidates(gray, matrix, page, { printedCenters: true, maxRadius: 8.6, fineOutlines: true, region });
  const grids = strips.flatMap((strip) => digitsAndDecimals(columnRows(rings, strip), strip));
  if (grids.length !== 1) return { count: grids.length, reason: grids.length ? 'ambiguous' : 'unverified-grid' };
  return { count: 1, block: { items: [{ slots: grids[0] }] } };
}
