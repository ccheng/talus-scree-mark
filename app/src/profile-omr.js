import { readBubbleRegions, thresholdVersion } from './marks.js';
import { registerMarkerless, markerlessThresholdVersion } from './markerless-registration.js';
import { toGrayImage } from './omr-image.js';
import { createMarkerlessProfile } from './profile-authoring.js';

export const profileAlgorithmVersion = 'markerless-profile-2';

export function readProfileSheet(image, profile, options = {}) {
  const header = { captureId: image.id, profile: profile ? { id: profile.id, revision: profile.revision } : null,
    algorithmVersion: profileAlgorithmVersion, thresholdVersion, registrationThresholdVersion: markerlessThresholdVersion };
  let validated;
  try {
    if (profile?.strategy !== 'markerless' || profile.schemaVersion !== 1) throw new TypeError('Unsupported profile.');
    validated = createMarkerlessProfile(profile);
  } catch {
    return { ...header, status: 'retake', registration: { status: 'retake', reasons: ['invalid-profile'] }, items: [] };
  }
  const registration = registerMarkerless(image, validated, options);
  if (registration.status !== 'registered') return { ...header, status: 'retake', registration, items: [] };
  const items = readBubbleRegions(toGrayImage(image), registration.pageToSource, validated.components.flatMap((block) => block.items));
  return { ...header, status: 'read', registration, items };
}
