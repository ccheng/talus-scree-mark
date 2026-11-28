import { samplePatch, rawCoreInk } from './spatial.js';
import { referenceKey } from './reference-store.js';

const patchSize = 41 * 41;
export const compactReferenceFormat = 'talus-cpas-reference-patches-v1';

function groups(profile) {
  return profile.components.flatMap(block => block.items.flatMap(item =>
    (item.kind === 'mc' ? [item] : item.slots)
      .map(group => ({ block: block.id, nr: item.kind === 'nr', id: group.id, choices: group.choices }))));
}

function checksum(pixels, usable) {
  let hash = 2166136261;
  for (const bytes of [pixels, usable]) {
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  }
  return hash >>> 0;
}

function groupKey(id, symbol) {
  return JSON.stringify([id, symbol]);
}

export function enrollReferencePatches(gray, profile, registration, { confirmedBlank = false } = {}) {
  if (!confirmedBlank || registration?.status !== 'registered') {
    throw new Error('Teacher-confirmed blank and registered pose required');
  }
  const all = groups(profile);
  const count = all.reduce((sum, group) => sum + group.choices.length, 0);
  if (count < 1 || count > 1200) throw new Error('Unsupported bubble count');
  const pixels = new Uint8Array(count * patchSize);
  const usable = new Uint8Array(count);
  const reasons = { unobservable: 0, suspectMcInk: 0 };
  let index = 0;
  for (const group of all) {
    const matrix = registration.refinedBlocks?.find(block => block.id === group.block)?.matrix ?? registration.pageToSource;
    const [first, next] = group.choices;
    const rotate = next ? Math.abs(next.y - first.y) > Math.abs(next.x - first.x) : group.nr;
    for (const bubble of group.choices) {
      const patch = samplePatch(gray, matrix, bubble, rotate);
      const ink = patch ? rawCoreInk(patch) : -1;
      if (ink < 0) reasons.unobservable++;
      // This conservative MC check excludes visibly marked patches.
      else if (!group.nr && ink > .105) reasons.suspectMcInk++;
      else {
        pixels.set(patch, index * patchSize);
        usable[index] = 1;
      }
      index++;
    }
  }
  return { format: compactReferenceFormat, binding: referenceKey(profile), count, pixels, usable, reasons,
    checksum: checksum(pixels, usable) };
}

export function openReferencePatches(envelope, profile) {
  const all = groups(profile);
  const count = all.reduce((sum, group) => sum + group.choices.length, 0);
  if (!envelope || envelope.format !== compactReferenceFormat || envelope.binding !== referenceKey(profile) ||
      envelope.count !== count || count < 1 || count > 1200 ||
      !(envelope.pixels instanceof Uint8Array) || envelope.pixels.length !== count * patchSize ||
      !(envelope.usable instanceof Uint8Array) || envelope.usable.length !== count ||
      envelope.usable.some(value => value !== 0 && value !== 1) ||
      checksum(envelope.pixels, envelope.usable) !== envelope.checksum) {
    throw new Error('Invalid or stale reference patches');
  }
  const pixels = envelope.pixels.slice();
  const usable = envelope.usable.slice();
  const lookup = new Map();
  let offset = 0;
  for (const group of all) {
    for (const bubble of group.choices) {
      const key = groupKey(group.id, bubble.symbol);
      if (lookup.has(key)) throw new Error('Duplicate bubble identity');
      lookup.set(key, offset++);
    }
  }
  return {
    patchFor(id, symbol) {
      const index = lookup.get(groupKey(id, symbol));
      return index === undefined || !usable[index] ? null : pixels.slice(index * patchSize, (index + 1) * patchSize);
    },
    usableCount: usable.reduce((sum, value) => sum + value, 0),
    count,
  };
}
