import { grayAt } from '../omr-image.js';
import { project } from '../projective.js';
import { infer } from './digit-cnn.js';

const side = 38;
const size = side * side;
const quantile = (sorted, p) => {
  const i = (sorted.length - 1) * p;
  return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1);
};

function close(image) {
  function pass(input, horizontal, extreme, initial) {
    return Float32Array.from(input, (_, i) => {
      const col = i % side, row = Math.floor(i / side);
      const axis = horizontal ? col : row;
      let value = initial;
      for (let d = Math.max(-6, -axis); d <= Math.min(6, side - 1 - axis); d++) {
        value = extreme(value, input[i + d * (horizontal ? 1 : side)]);
      }
      return value;
    });
  }
  const expanded = pass(pass(image, true, Math.max, 0), false, Math.max, 0);
  return pass(pass(expanded, true, Math.min, 1), false, Math.min, 1);
}

function components(mask) {
  const groups = [];
  for (let i = 0; i < size; i++) {
    if (!mask[i]) continue;
    const group = [i];
    mask[i] = 0;
    for (let j = 0; j < group.length; j++) {
      const p = group[j], x = p % side, y = Math.floor(p / side);
      for (let dy = Math.max(-1, -y); dy <= Math.min(1, side - 1 - y); dy++) {
        for (let dx = Math.max(-1, -x); dx <= Math.min(1, side - 1 - x); dx++) {
          const q = p + dy * side + dx;
          if (!mask[q]) continue;
          group.push(q);
          mask[q] = 0;
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

function areaFeatures(ink) {
  const means = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const left = i * 9.5, top = j * 9.5;
      let sum = 0;
      for (let y = Math.floor(top); y < top + 9.5; y++) {
        const vertical = Math.min(y + 1, top + 9.5) - Math.max(y, top);
        for (let x = Math.floor(left); x < left + 9.5; x++) {
          const horizontal = Math.min(x + 1, left + 9.5) - Math.max(x, left);
          sum += horizontal * vertical * ink[y * side + x];
        }
      }
      means.push(sum / 9.5 ** 2);
    }
  }
  return means;
}

export function handwritingFeatures(paper) {
  const bg = close(paper);
  const ink = Float32Array.from(paper, (v, i) => Math.max(0, (bg[i] - v) / Math.max(bg[i], .25)));
  const sorted = ink.slice().sort();
  const peak = quantile(sorted, .99), mean = ink.reduce((a, b) => a + b, 0) / size;
  const mask = Uint8Array.from(ink, v => Number(v > Math.max(.035, .20 * peak)));
  const marked = mask.reduce((a, b) => a + b, 0);
  const groups = components(mask);
  const minSize = Math.max(3, .12 * Math.max(0, ...groups.map(g => g.length)));
  const kept = groups.filter(g => g.length >= minSize).flat();
  const xs = kept.map(i => i % side), ys = kept.map(i => Math.floor(i / side));
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = kept.length ? Math.max(...xs) - x0 + 1 : 0;
  const h = kept.length ? Math.max(...ys) - y0 + 1 : 0;
  const center = v => kept.length ? v.reduce((a, b) => a + b, 0) / kept.length / side : 0;
  const features = Float32Array.from([
    peak, mean, sorted[size - 1], w / side, h / side, center(ys), center(xs), kept.length / size, groups.length,
    Math.sqrt(ink.reduce((sum, v) => sum + (v - mean) ** 2, 0) / size), marked / size,
    quantile(sorted, .95), quantile(sorted, .90),
    ...[.025, .05, .1, .2, .4].map(t => ink.filter(v => v > t).length / size), ...areaFeatures(ink),
  ]);
  const normalized = new Float32Array(28 ** 2);
  if (kept.length) {
    const scale = 20 / Math.max(w, h);
    const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
    const raster = { width: side, height: side, values: ink };
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const px = x0 + Math.max(0, Math.min(w - 1, (x + .5) * w / nw - .5));
        const py = y0 + Math.max(0, Math.min(h - 1, (y + .5) * h / nh - .5));
        const i = (Math.floor((28 - nh) / 2) + y) * 28 + Math.floor((28 - nw) / 2) + x;
        normalized[i] = Math.min(1, grayAt(raster, px, py) / Math.max(peak, .05));
      }
    }
  }
  return { features, normalized };
}

function softmax(logits, temperature) {
  const largest = Math.max(...logits);
  const scores = logits.map(v => Math.exp((v - largest) / temperature));
  const sum = scores.reduce((a, b) => a + b, 0);
  return scores.map(v => v / sum);
}

export function classifyHandwriting(paper, gate, weights) {
  const { features, normalized } = handwritingFeatures(paper);
  const logits = [...gate.base];
  for (const [index, tree] of gate.trees.entries()) {
    let node = tree[0];
    while (node.length > 1) node = tree[features[node[0]] <= node[1] ? node[2] : node[3]];
    logits[index % 4] += node[0];
  }
  const [digit, dot, blank, other] = softmax(logits, 1.0149165551568862);
  const scores = [...softmax(infer(normalized, weights), .9714934983978653).map(p => p * digit), dot, blank, other];
  const confidence = Math.max(...scores);
  const selected = scores.indexOf(confidence);
  const symbol = selected < 10 ? String(selected) : selected === 10 ? '.' : null;
  const symbols = [...'0123456789', '.', 'blank', 'other'];
  const probabilities = Object.fromEntries(symbols.map((label, i) => [label, scores[i]]));
  return { symbol, confidence, probabilities, gate: { digit, dot, blank, other }, confident: symbol !== null && confidence >= (selected === 10 ? .9219172932330828 : .85) };
}

export function observeHandwriting(gray, matrix, box, gate, weights) {
  const paper = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i % side + 5.5) / 48, y = (Math.floor(i / side) + 5.5) / 48;
    const point = project(matrix, box.x + box.width * x, box.y + box.height * y);
    if (!point) return null;
    const value = grayAt(gray, point.x, point.y);
    if (!Number.isFinite(value)) return null;
    paper[i] = value / 255;
  }
  return classifyHandwriting(paper, gate, weights);
}
