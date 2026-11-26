import { grayAt, quantile } from './omr-image.js';
import { project } from './projective.js';

export const thresholdVersion = 'reference-v1';
export const thresholds = Object.freeze({
  maximumBlankFill: .105,
  minimumClearFill: .265,
  maximumRivalFill: .144,
  minimumSeparation: .15,
  minimumOutlineContrast: 28,
  minimumOutlineSupport: .5,
});

const angles = Array.from({ length: 24 }, (_, index) => {
  const radians = index * Math.PI / 12;
  return [Math.cos(radians), Math.sin(radians)];
});
const coreOffsets = [];
for (let y = -.66; y < .67; y += .22) {
  for (let x = -.66; x < .67; x += .22) {
    if (Math.hypot(x, y) <= .68) coreOffsets.push([x, y]);
  }
}

function observeBubble(image, matrix, option) {
  const { x, y, radius, symbol } = option;
  const source = project(matrix, x, y);
  const edge = project(matrix, x + radius, y);
  const sourceRadius = source && edge ? Math.hypot(edge.x - source.x, edge.y - source.y) : 0;
  const evidence = { x, y, radius, source, sourceRadius };
  if (!source || sourceRadius < 2.5) return { symbol, score: null, quality: { usable: false }, evidence };

  function sample(dx, dy) {
    const point = project(matrix, x + dx * radius, y + dy * radius);
    return point ? grayAt(image, point.x, point.y) : NaN;
  }

  const backgroundSamples = angles.map(([cos, sin]) => sample(cos * 1.55, sin * 1.55));
  const outlineSamples = angles.map(([cos, sin]) => Math.min(
    sample(cos * .84, sin * .84), sample(cos * .96, sin * .96),
    sample(cos * 1.08, sin * 1.08), sample(cos * 1.20, sin * 1.20),
  ));
  const coreSamples = coreOffsets.map(([dx, dy]) => sample(dx, dy));
  if ([...backgroundSamples, ...outlineSamples, ...coreSamples].some((value) => !Number.isFinite(value))) {
    return { symbol, score: null, quality: { usable: false }, evidence };
  }

  const background = quantile(backgroundSamples, .53);
  const outline = quantile(outlineSamples, .27);
  const contrast = background - outline;
  const support = outlineSamples.filter((sample) => background - sample >= Math.max(20, contrast * .30)).length / angles.length;
  const usable = contrast >= thresholds.minimumOutlineContrast && support >= thresholds.minimumOutlineSupport;
  const quality = { usable, contrast, outlineSupport: support, background };

  if (!usable) return { symbol, score: null, quality, evidence };
  const darkness = coreSamples.reduce((sum, sample) =>
    sum + Math.max(0, Math.min(1, (background - sample) / contrast)), 0);
  const rawScore = darkness / coreSamples.length;
  if (option.blankInk === undefined) return { symbol, score: rawScore, quality, evidence };
  // Measure the added fill against the paper area the printed glyph leaves.
  const score = Math.max(0, (rawScore - option.blankInk) / (1 - option.blankInk));
  return { symbol, score, quality, evidence, rawScore, blankInk: option.blankInk };
}

export const maximumPrintedBlankInk = .72;
const isolatedBlankInkLimit = .55;

export function measureNumericalBlankInk(image, matrix, components) {
  return components.map((block) => block.kind === 'mc' ? block : {
    ...block,
    items: block.items.map((item) => {
      const uncalibrated = item.slots.map(({ choices, ...slot }) => ({
        ...slot, choices: choices.map(({ blankInk: _, ...choice }) => choice),
      }));
      const slots = uncalibrated.map(({ choices }) => choices.map((choice) => {
        const { score } = observeBubble(image, matrix, choice);
        return score >= .035 && score <= maximumPrintedBlankInk ? Number(score.toFixed(3)) : null;
      }));
      // A printed grid has ink in many different digits and positions. A
      // stray mark or an isolated printed dot must never become a baseline.
      const printedSlots = item.slots.filter(({ choices }, position) => choices.filter(({ symbol }, choice) =>
        /^[0-9]$/.test(symbol) && slots[position][choice] !== null).length >= 6).length;
      if (printedSlots < 3) return { ...item, slots: uncalibrated };
      // A dense glyph can cover more than half the sampled center. Only
      // allow that baseline when the same digit is dark in several slots.
      const denseDigits = new Set('0123456789'.split('').filter((digit) =>
        item.slots.filter(({ choices }, position) => {
          const index = choices.findIndex(({ symbol }) => symbol === digit);
          return slots[position][index] >= .42;
        }).length >= 3));
      return { ...item, slots: uncalibrated.map(({ choices, ...slot }, position) => ({
        ...slot,
        choices: choices.map((choice, index) => {
          const blankInk = slots[position][index];
          return blankInk === null || (blankInk > isolatedBlankInkLimit && !denseDigits.has(choice.symbol))
            ? choice : { ...choice, blankInk };
        }),
      })) };
    }),
  });
}

function observeGroup(image, matrix, choices) {
  const scores = choices.map((option) => observeBubble(image, matrix, option));
  const ranked = scores.filter(({ score }) => score !== null).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const runner = ranked[1];
  const rivalFill = runner?.score ?? 0;
  const margin = best ? best.score - rivalFill : null;
  const evidence = { choices: scores, margin };

  if (ranked.length !== scores.length) {
    return { status: 'unreadable', symbol: null, review: true, reasons: ['insufficient-region-evidence'], ...evidence };
  }
  if (runner && runner.score >= thresholds.minimumClearFill) {
    return { status: 'multiple', symbol: null, review: true, reasons: ['multiple-marks'], ...evidence };
  }
  if (best.score <= thresholds.maximumBlankFill) {
    return { status: 'blank', symbol: null, review: false, reasons: [], ...evidence };
  }
  if (best.score >= thresholds.minimumClearFill && rivalFill <= thresholds.maximumRivalFill && margin >= thresholds.minimumSeparation) {
    return { status: 'single', symbol: best.symbol, review: false, reasons: [], ...evidence };
  }
  const reason = rivalFill > thresholds.maximumRivalFill ? 'competing-mark' : 'weak-mark';
  return { status: 'ambiguous', symbol: null, review: true, reasons: [reason], ...evidence };
}

export function readBubbleRegions(image, pageToSource, items, { allowLeadingZeros = false } = {}) {
  const numericalFormat = allowLeadingZeros ? /^[0-9]+(?:\.[0-9]+)? *$/ : /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)? *$/;
  return items.map((item) => {
    const fields = { id: item.id, kind: item.kind, bounds: item.bounds };
    if (item.kind === 'mc') {
      const observation = observeGroup(image, pageToSource, item.choices);
      return { ...fields, rawText: observation.symbol, ...observation };
    }

    const slots = item.slots.map(({ id, choices }) => ({ id, ...observeGroup(image, pageToSource, choices) }));
    const unresolved = ['unreadable', 'multiple', 'ambiguous'].find((state) => slots.some(({ status }) => status === state));
    if (unresolved) {
      return { ...fields, slots, status: unresolved, rawText: null, review: true, reasons: [...new Set(slots.flatMap(({ reasons }) => reasons))] };
    }
    const rawText = slots.map(({ symbol }) => symbol ?? ' ').join('');
    const blank = rawText === '    ';
    const review = !blank && !numericalFormat.test(rawText);
    return { ...fields, slots, status: blank ? 'blank' : 'single', rawText, review, reasons: review ? ['nr-format'] : [] };
  });
}
