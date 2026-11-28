import { stackDecision } from './stacking.js';

export const stackThreshold = .7862137339932567;

export function compareMc(established, spatial, model) {
  const agrees = established && !established.review && ['single', 'blank'].includes(established.status) &&
    ['single', 'blank'].includes(spatial.optical) && established.symbol === spatial.symbol && spatial.evidenceComplete;
  const agreement = agrees ? { status: 'would-accept', symbol: spatial.symbol } : { status: 'review' };
  return {
    agreement,
    strictAgreement: agrees && spatial.disposition === 'would-accept' ? agreement : { status: 'review' },
    stacking: model ? stackDecision(established, spatial, model, stackThreshold) : { status: 'unavailable' },
  };
}
