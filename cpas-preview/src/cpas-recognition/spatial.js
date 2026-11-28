import { grayAt } from '../omr-image.js';

const side = 41;
const size = side * side;
const x = Float64Array.from({ length: size }, (_, i) => (i % side - 20) / 12);
const y = Float64Array.from({ length: size }, (_, i) => (Math.floor(i / side) - 20) / 12);
const disk = Array.from(x.keys()).filter(i => Math.hypot(x[i], y[i]) <= .88);
const sectors = Int8Array.from(x, (value, i) => Math.floor((Math.atan2(y[i], value) + Math.PI) / (Math.PI / 4)));
const kernel = Math.exp(-.5 / .65 ** 2);
const weights = [kernel, 1, kernel].map(n => n / (1 + 2 * kernel));
const angles = Array.from({ length: 24 }, (_, i) => [Math.cos(i * Math.PI / 12), Math.sin(i * Math.PI / 12)]);
const core = Array.from({ length: 49 }, (_, i) => [i % 7 * .22 - .66, Math.floor(i / 7) * .22 - .66])
  .filter(([dx, dy]) => Math.hypot(dx, dy) <= .68);
const quantile = (sorted, p) => {
  const i = (sorted.length - 1) * p;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1);
};
const ascending = (a, b) => a - b;
const clamp = n => Math.max(0, Math.min(1, n));

export function samplePatch(gray, matrix, bubble, rotate = false) {
  const pixels = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const px = bubble.x + bubble.radius * (rotate ? -y[i] : x[i]);
    const py = bubble.y + bubble.radius * (rotate ? x[i] : y[i]);
    const w = matrix[6] * px + matrix[7] * py + matrix[8];
    const value = grayAt(gray, (matrix[0] * px + matrix[1] * py + matrix[2]) / w,
      (matrix[3] * px + matrix[4] * py + matrix[5]) / w);
    if (!Number.isFinite(value)) return null;
    pixels[i] = Math.round(value);
  }
  return pixels;
}

export function rawCoreInk(patch) {
  const gray = { width: side, height: side, values: patch };
  const sample = (dx, dy) => grayAt(gray, 20 + 12 * dx, 20 + 12 * dy);
  const bg = angles.map(([dx, dy]) => sample(1.55 * dx, 1.55 * dy)).sort(ascending)[12];
  const outline = angles.map(([dx, dy]) => Math.min(...[.84, .96, 1.08, 1.2]
    .map(r => sample(r * dx, r * dy)))).sort(ascending);
  const contrast = bg - outline[6];
  if (contrast < 28 || outline.filter(v => bg - v >= Math.max(20, .3 * contrast)).length < 12) return -1;
  return core.reduce((sum, [dx, dy]) => sum + clamp((bg - sample(dx, dy)) / contrast), 0) / core.length;
}

function normalize(patch, strip) {
  if (!strip.length) return null;
  let sum = 0, sx = 0, sy = 0, xx = 0, yy = 0;
  for (const i of strip) {
    sum += patch[i];
    sx += patch[i] * x[i];
    sy += patch[i] * y[i];
    xx += x[i] ** 2;
    yy += y[i] ** 2;
  }
  let offset = sum / strip.length;
  const dx = xx ? sx / xx : 0, dy = sy / yy;
  const residuals = strip.map(i => patch[i] - offset - dx * x[i] - dy * y[i]).sort(ascending);
  offset += quantile(residuals, .7);
  const median = quantile(residuals, .5);
  const mad = residuals.map(v => Math.abs(v - median)).sort(ascending);
  const noise = Math.max(.7, 1.4826 * quantile(mad, .5)) / Math.max(100, offset);
  return {
    ink: Float32Array.from(patch, (value, i) => {
      const background = offset + dx * x[i] + dy * y[i];
      return Math.max(0, (background - value) / Math.max(100, background));
    }),
    noise,
  };
}

function reflected(i) {
  return i < 0 ? 1 : i === side ? side - 2 : i;
}

function filtered(ink, dilate = false) {
  const result = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const row = Math.floor(i / side), col = i % side;
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const sample = ink[reflected(row + dy) * side + reflected(col + dx)];
        v = dilate ? Math.max(v, sample) : v + sample * weights[dy + 1] * weights[dx + 1];
      }
    }
    result[i] = v;
  }
  return result;
}

function spatialFeatures(result, ink, mask, noise) {
  const distribution = mask.map(i => ink[i]).sort(ascending);
  result.push(...[.05, .15, .35, .5, .75, .95].map(p => distribution.length ? quantile(distribution, p) : 0));
  const white = new Uint8Array(size), stack = new Int16Array(size);
  const totals = new Uint16Array(8), filled = new Uint16Array(8);
  for (const i of mask) if (sectors[i] < 8) totals[sectors[i]]++;
  for (const level of [.018, .035, .06, .10, .17]) {
    const threshold = Math.max(level, 2 * noise);
    let count = 0, largest = 0, least = 1, represented = false;
    filled.fill(0);
    for (const i of mask) {
      if (ink[i] < threshold) white[i] = 1;
      else {
        count++;
        if (sectors[i] < 8) filled[sectors[i]]++;
      }
    }
    for (const i of mask) {
      if (!white[i]) continue;
      let end = 1;
      stack[0] = i;
      white[i] = 0;
      for (let head = 0; head < end; head++) {
        const j = stack[head];
        for (let dy = -side; dy <= side; dy += side) {
          for (let dx = -1; dx <= 1; dx++) {
            const next = j + dy + dx;
            if (white[next]) {
              white[next] = 0;
              stack[end++] = next;
            }
          }
        }
      }
      largest = Math.max(largest, end);
    }
    for (let sector = 0; sector < 8; sector++) {
      if (totals[sector] <= 5) continue;
      represented = true;
      least = Math.min(least, filled[sector] / totals[sector]);
    }
    result.push(mask.length ? count / mask.length : 1, largest / Math.max(1, mask.length), represented ? least : 0);
  }
}

export function backgroundStrip(pitch) {
  return Array.from(x.keys()).filter(i => Math.abs(y[i]) > 1.40 && Math.abs(x[i]) < Math.min(1.4, pitch / 2 - .06));
}

export function completionFeatures(patch, reference, strip, nr) {
  const observed = normalize(patch, strip);
  const blank = reference && normalize(reference, strip);
  if (!observed) return null;
  const { ink, noise } = observed;
  const smooth = filtered(ink);
  const ref = blank ? filtered(blank.ink) : new Float32Array(size);
  const wide = blank ? filtered(ref, true) : ref;
  const paper = disk.filter(i => ref[i] < .035);
  const strictPaper = disk.filter(i => wide[i] < .06);
  const mean = f => disk.reduce((sum, i) => sum + f(i), 0) / disk.length;
  const evidence = [Number(nr), noise, rawCoreInk(patch), reference ? rawCoreInk(reference) : -1,
    mean(i => ink[i]), mean(i => ref[i]), mean(i => ink[i] - ref[i]),
    mean(i => Math.max(0, ink[i] - ref[i])), mean(i => Math.max(0, ink[i] - wide[i])),
    paper.length / size, strictPaper.length / size];
  for (const mask of [disk, paper, strictPaper]) spatialFeatures(evidence, smooth, mask, noise);
  return Float32Array.from(evidence);
}
