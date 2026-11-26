import { referenceDigest, referenceProfile } from '../reference/profile.js';
import { readBubbleRegions, thresholdVersion } from './marks.js';
import { toGrayImage } from './omr-image.js';
import { validReferenceProfile } from './reference-contract.js';
import { registerSheet } from './registration.js';

export const algorithmVersion = 'coded-reference-1';
const referenceNumericalFormat = { allowLeadingZeros: true };

export function readReferenceSheet(image, profile = referenceProfile) {
  const profileValid = validReferenceProfile(profile);
  const result = {
    captureId: image.id,
    profile: profileValid ? { id: profile.id, revision: profile.revision, sha256: profile === referenceProfile ? referenceDigest : null } : null,
    algorithmVersion,
    thresholdVersion,
  };
  if (!profileValid) {
    return { ...result, status: 'retake', registration: { status: 'retake', reasons: ['invalid-profile'] }, items: [] };
  }

  const gray = toGrayImage(image);
  const registration = registerSheet(gray, profile);
  if (registration.status !== 'registered') return { ...result, status: 'retake', registration, items: [] };

  return {
    ...result, status: 'read', registration,
    items: readBubbleRegions(gray, registration.pageToSource, profile.items, referenceNumericalFormat),
  };
}

// For benchmark controls, use evaluator-supplied geometry without running marker detection.
export function readReferenceWithGeometry(image, pageToSource, profile = referenceProfile) {
  return readBubbleRegions(toGrayImage(image), pageToSource, profile.items, referenceNumericalFormat);
}
