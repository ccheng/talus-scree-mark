import { backgroundStrip, completionFeatures, samplePatch } from '../../app/src/cpas-recognition/spatial.js';

const mcConfidence = .7720062862347644;
const stateNames = ['no-added-mark', 'incomplete', 'complete'];

function observeGroup(gray, matrix, reference, referenceMatrix, choices, nr, predict, established, groupId) {
  const first = choices[0], second = choices[1];
  const strip = backgroundStrip(second ? Math.hypot(second.x - first.x, second.y - first.y) / first.radius : 3);
  const rotate = second ? Math.abs(second.y - first.y) > Math.abs(second.x - first.x) : nr;
  const bubbles = choices.map(bubble => {
    const patch = samplePatch(gray, matrix, bubble, rotate);
    const blank = reference?.patchFor ? reference.patchFor(groupId, bubble.symbol) : reference && samplePatch(reference.gray, referenceMatrix, bubble, rotate);
    const features = patch && completionFeatures(patch, blank, strip, nr);
    if (!features) return { symbol: bubble.symbol, completion: 'unobservable' };
    const p = predict(features);
    return {
      symbol: bubble.symbol, completion: stateNames[p.indexOf(Math.max(...p))], probabilities: p,
      ink: features[4], referenceInk: blank ? features[5] : null, addedInk: blank ? features[7] : null,
      rawCoreInk: features[2] < 0 ? null : features[2],
      printedDigitConditionedInk: nr && bubble.blankInk !== undefined
        ? established?.choices?.find(({ symbol }) => symbol === bubble.symbol)?.score ?? null : null,
      conditioned: Boolean(blank) && features[3] >= 0,
    };
  });
  const complete = bubbles.filter(b => b.completion === 'complete');
  let optical = 'uncertain';
  if (bubbles.every(b => b.completion === 'no-added-mark')) optical = 'blank';
  else if (complete.length > 1) optical = 'competing';
  else if (bubbles.some(b => b.completion === 'incomplete')) optical = complete.length ? 'competing' : 'incomplete';
  else if (complete.length === 1 && bubbles.every(b => ['no-added-mark', 'complete'].includes(b.completion))) optical = 'single';
  const confidence = ['single', 'blank'].includes(optical)
    ? Math.min(...bubbles.map(b => b.probabilities[b.completion === 'complete' ? 2 : 0])) : null;
  return { optical, evidenceComplete: bubbles.every(b => b.conditioned && b.rawCoreInk !== null), symbol: optical === 'single' ? complete[0].symbol : null, confidence, bubbles };
}

function compareHandwriting(optical, handwriting) {
  if (!handwriting || !handwriting.confident || handwriting.symbol === null) return 'unavailable';
  if (optical.optical === 'single' && optical.symbol === handwriting.symbol) return 'corroborates';
  if (optical.optical === 'single' || optical.optical === 'blank') return 'disagreement';
  return 'optical-unresolved';
}

export function evaluateCompletion(gray, profile, registration, { reference, predict, handwriting, established = [] }) {
  if (registration.status !== 'registered') return { status: 'registration-rejected', items: [] };
  const byId = new Map(established.map(item => [item.id, item]));
  const items = profile.components.flatMap(block => {
    const matrix = registration.refinedBlocks?.find(({ id }) => id === block.id)?.matrix ?? registration.pageToSource;
    const referenceMatrix = reference?.refinedBlocks?.find(({ id }) => id === block.id)?.matrix ?? reference?.pageToSource;
    const read = (choices, nr, observed, groupId) => observeGroup(gray, matrix, reference, referenceMatrix, choices, nr, predict, observed, groupId);
    return block.items.map(item => {
      const observed = byId.get(item.id);
      if (item.kind === 'mc') {
        const optical = read(item.choices, false, observed, item.id);
        const admitted = optical.confidence !== null && optical.confidence + 1e-12 >= mcConfidence &&
          optical.evidenceComplete;
        return { id: item.id, kind: 'mc', ...optical, disposition: admitted ? 'would-accept' : 'review',
          reason: admitted ? null : optical.confidence === null ? optical.optical :
            !reference ? 'no-reference' : !optical.evidenceComplete ? 'unobservable' : 'low-confidence' };
      }
      const slots = item.slots.map((slot, index) => {
        const optical = read(slot.choices, true, observed?.slots?.[index], slot.id);
        const symbol = handwriting?.(slot.id, matrix, item.bounds);
        return { id: slot.id, ...optical, handwriting: symbol ?? null, multimodal: compareHandwriting(optical, symbol) };
      });
      const rawText = slots.every(slot => slot.optical === 'blank' || slot.optical === 'single')
        ? slots.map(slot => slot.symbol ?? ' ').join('') : null;
      const reasons = [];
      if (rawText === null) reasons.push('optical-unresolved');
      else if (rawText.trim() && !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)? *$/.test(rawText)) reasons.push('nr-format');
      if (slots.some(slot => slot.multimodal === 'disagreement')) reasons.push('handwriting-disagreement');
      return { id: item.id, kind: 'nr', slots, rawText, disposition: 'review', reasons };
    });
  });
  return { status: 'evaluated', reference: reference ? 'conditioned' : 'reference-free', items };
}
