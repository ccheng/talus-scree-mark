// Frozen REC-R7 feature contract and inference. Grading never uses this result.
export const featureNames = [
  'establishedCandidate', 'cpasCandidate', 'establishedAccept', 'cpasAccept',
  'establishedTargetInk', 'establishedRivalInk', 'establishedMargin',
  'minimumOutlineSupport', 'minimumContrast', 'minimumSourceRadius',
  'cpasTargetComplete', 'cpasRivalBlank', 'cpasTargetIncomplete', 'cpasRivalComplete',
  'cpasTargetAddedInk', 'cpasRivalAddedInk', 'cpasMinimumRawAvailable',
  'cpasGroupConfidence', 'blankCandidate', 'cpasEvidenceComplete',
];
const finite = value => Number.isFinite(value) ? value : 0;
const max = (values, extract) => Math.max(0, ...values.map(extract));
const min = (values, extract) => Math.min(...values.map(extract));

export function candidateFeatures(established, spatial) {
  if (!established || !spatial || established.kind !== 'mc' || spatial.kind !== 'mc' ||
      established.id !== spatial.id || !Array.isArray(established.choices) ||
      !Array.isArray(spatial.bubbles) || !spatial.evidenceComplete) return [];

  const establishedAccept = !established.review && ['single', 'blank'].includes(established.status);
  const spatialLiteral = ['single', 'blank'].includes(spatial.optical);
  // Conflicting single/blank reads or explicit multiple marks require review.
  if ((establishedAccept && spatialLiteral && established.symbol !== spatial.symbol) ||
      established.status === 'multiple' || spatial.optical === 'competing') return [];
  if (!establishedAccept && !spatialLiteral) return [];

  const symbol = establishedAccept ? established.symbol : spatial.symbol;
  const establishedTarget = established.choices.find(bubble => bubble.symbol === symbol);
  const spatialTarget = spatial.bubbles.find(bubble => bubble.symbol === symbol);
  const establishedRivals = established.choices.filter(bubble => bubble.symbol !== symbol);
  const spatialRivals = spatial.bubbles.filter(bubble => bubble.symbol !== symbol);
  if ((symbol !== null && (!establishedTarget || !spatialTarget)) ||
      established.choices.some(bubble => !Number.isFinite(bubble.score) || !bubble.quality?.usable) ||
      spatial.bubbles.some(({ probabilities }) => !Array.isArray(probabilities) ||
        probabilities.length !== 3 || !probabilities.every(Number.isFinite))) return [];

  const targetInk = finite(establishedTarget?.score);
  const rivalInk = max(establishedRivals, bubble => bubble.score);
  const features = [
    Number(establishedAccept), Number(spatialLiteral), Number(establishedAccept),
    Number(spatial.disposition === 'would-accept'), targetInk, rivalInk, targetInk - rivalInk,
    min(established.choices, bubble => finite(bubble.quality.outlineSupport)),
    min(established.choices, bubble => finite(bubble.quality.contrast) / 255),
    min(established.choices, bubble => Math.min(1, finite(bubble.evidence?.sourceRadius) / 20)),
    finite(spatialTarget?.probabilities[2]), min(spatialRivals, bubble => bubble.probabilities[0]),
    finite(spatialTarget?.probabilities[1]), max(spatialRivals, bubble => bubble.probabilities[2]),
    finite(spatialTarget?.addedInk), max(spatialRivals, bubble => finite(bubble.addedInk)),
    Number(spatial.bubbles.every(bubble => bubble.rawCoreInk !== null)), finite(spatial.confidence),
    Number(symbol === null), Number(spatial.evidenceComplete),
  ];
  return features.every(Number.isFinite) ? [{ symbol, features }] : [];
}

export function score(model, features) {
  if (model.format !== 'rec-logistic-v1' || features.length !== featureNames.length ||
      model.featureNames?.join('|') !== featureNames.join('|') || !features.every(Number.isFinite) ||
      !Number.isFinite(model.bias) || [model.mean, model.sd, model.w].some(values =>
        !Array.isArray(values) || values.length !== featureNames.length || !values.every(Number.isFinite)) ||
      model.sd.some(value => value <= 0)) throw new Error('Invalid stacking input');
  const z = model.bias + features.reduce((sum, value, index) =>
    sum + (value - model.mean[index]) / model.sd[index] * model.w[index], 0);
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

export function stackDecision(established, spatial, model, threshold) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) return { status: 'review', reason: 'invalid-threshold' };
  try {
    const [candidate] = candidateFeatures(established, spatial);
    if (!candidate) return { status: 'review', reason: 'insufficient-evidence' };
    const probability = score(model, candidate.features);
    if (probability < threshold) return { status: 'review', reason: 'low-score', score: probability };
    return { status: 'would-accept', symbol: candidate.symbol, score: probability };
  } catch {
    return { status: 'review', reason: 'invalid-evidence' };
  }
}
