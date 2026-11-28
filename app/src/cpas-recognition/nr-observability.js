import { grayAt } from '../omr-image.js';
import { project } from '../projective.js';
import { refineSlot } from './nr-local-pose.js';

const angles = Array.from({ length: 24 }, (_, i) => i * Math.PI / 12).filter(a => Math.abs(Math.cos(a)) > .42);
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
};

// Measurements use ring and exterior samples only. Glyph cores and marks cannot guide alignment.
function inspectRing(sample, rotated = false) {
  function score(u, v) {
    const values = angles.map(angle => {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const at = scale => {
        const x = u + scale * cos, y = v + scale * sin;
        return rotated ? sample(y, -x) : sample(x, y);
      };
      return (at(1.27) - (at(.96) + at(1.04)) / 2) / 255;
    });
    return values.every(Number.isFinite) ? median(values) : NaN;
  }
  const origin = score(0, 0);
  if (!Number.isFinite(origin)) return { supported: false, reason: 'unobservable' };
  if (origin < .10) return { supported: false, reason: 'weak-outline', origin };
  let best = { u: 0, v: 0, value: origin };
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const u = i * .08, v = j * .08;
      const value = score(u, v);
      if (value > best.value) best = { u, v, value };
    }
  }
  const displaced = Math.hypot(best.u, best.v) > .16 && best.value - origin > .035;
  return { supported: !displaced, origin, ...best, displaced };
}

export function auditReferenceRing(patch, rotated) {
  const image = { width: 41, height: 41, values: patch };
  return inspectRing((x, y) => grayAt(image, 20 + 12 * x, 20 + 12 * y), rotated);
}

export function observeSlot(gray, registration, choices) {
  if (registration.status !== 'registered') return { state: 'registration-rejected', sites: [], supported: 0, total: choices.length };
  const correction = refineSlot(gray, registration, choices);
  const matrix = correction.matrix ?? registration.pageToSource;
  const sites = choices.map(bubble => ({
    symbol: bubble.symbol,
    ...inspectRing((x, y) => {
      const point = project(matrix, bubble.x + x * bubble.radius, bubble.y + y * bubble.radius);
      return point ? grayAt(gray, point.x, point.y) : NaN;
    }),
  }));
  const supported = sites.filter(site => site.supported).length;
  const reliable = supported === choices.length && ['proposed', 'no-supported-change'].includes(correction.status);
  const state = reliable ? correction.status === 'proposed' ? 'supported-correction' : 'supported-original' :
    ['unobservable', 'undersampled'].includes(correction.status) ? 'unobservable' : 'unreliable';
  return { state, correction, sites, supported, total: choices.length, matrix: reliable ? matrix : null };
}
