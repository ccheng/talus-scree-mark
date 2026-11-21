import { readBubbleRegions, thresholdVersion } from './marks.js';
import { registerMarkerless, markerlessThresholdVersion } from './markerless-registration.js';
import { toGrayImage } from './omr-image.js';
import { createMarkerlessProfile } from './profile-authoring.js';

export const profileAlgorithmVersion = 'markerless-profile-1';

function sameReadingMap(left, right) {
  if (left.page.width !== right.page.width || left.page.height !== right.page.height) return false;
  const first = left.components.flatMap(({ items }) => items);
  const second = right.components.flatMap(({ items }) => items);
  if (first.length !== second.length) return false;
  return first.every((item, index) => {
    const other = second[index];
    if (item.id !== other.id || item.kind !== other.kind) return false;
    const firstSlots = item.kind === 'mc' ? [item.choices] : item.slots.map(({ choices }) => choices);
    const secondSlots = other.kind === 'mc' ? [other.choices] : other.slots.map(({ choices }) => choices);
    return firstSlots.every((choices, slot) => choices.length === secondSlots[slot].length && choices.every((choice) => {
      const same = secondSlots[slot].find(({ symbol }) => symbol === choice.symbol);
      return same && Math.hypot(same.x - choice.x, same.y - choice.y) <= Math.min(same.radius, choice.radius) * .20 &&
        Math.abs(same.radius - choice.radius) <= Math.min(same.radius, choice.radius) * .20;
    }));
  });
}

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
  const alternatives = (options.alternatives ?? []).flatMap((candidate) => {
    try {
      if (candidate?.strategy === 'markerless') {
        const alternative = createMarkerlessProfile(candidate);
        if (!sameReadingMap(validated, alternative)) return [alternative];
      }
    } catch {
      // An unavailable or malformed alternate cannot authorize recognition.
    }
    return [];
  });
  const registration = registerMarkerless(image, validated, { ...options, alternatives });
  if (registration.status !== 'registered') return { ...header, status: 'retake', registration, items: [] };
  const items = readBubbleRegions(toGrayImage(image), registration.pageToSource, validated.components.flatMap((block) => block.items));
  return { ...header, status: 'read', registration, items };
}
