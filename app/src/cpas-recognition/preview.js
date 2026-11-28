import { openReferencePatches } from './compact-reference.js';
import { decideGroup } from './recognition-convergence.js';
import { stackThreshold, compareMc } from './mc-comparison.js';
import { createPredictor } from './forest.js';
import { evaluateCompletion } from './completion.js';
import { readProfileSheet } from '../profile-omr.js';
import { registerMarkerless } from '../markerless-registration.js';
import { createMarkerlessProfile } from '../profile-authoring.js';
import { observeHandwriting } from './handwriting.js';
import { toGrayImage } from '../omr-image.js';

async function asset(file, type) {
  const response = await fetch(new URL('../../assets/cpas/' + file, import.meta.url));
  if (!response.ok) throw new Error('Recognition preview asset unavailable.');
  return response[type]();
}

let stackModel;
function stackingAssets() {
  stackModel ??= asset('rec-r7-stacking-model.json', 'json').catch(() => {
    stackModel = undefined;
    return null;
  });
  return stackModel;
}

let model;
function predictor() {
  model ??= Promise.all([asset('completion-native.json', 'json'), asset('completion.bin', 'arrayBuffer')])
    .then(([metadata, buffer]) => createPredictor(metadata, new Uint8Array(buffer)))
    .catch(error => {
      model = undefined;
      throw error;
    });
  return model;
}

let handwritingModel;
function handwritingAssets() {
  handwritingModel ??= Promise.all([asset('handwriting-gate.json', 'json'), asset('adapted.f32', 'arrayBuffer')])
    .then(([gate, buffer]) => {
      const bytes = new DataView(buffer);
      const weights = Float32Array.from({ length: buffer.byteLength / 4 }, (_, i) => bytes.getFloat32(i * 4, true));
      return { gate, weights };
    }).catch(() => {
      handwritingModel = undefined;
      return null;
    });
  return handwritingModel;
}

function slotCenter(slots, id) {
  const choices = slots.find(slot => slot.id === id).choices;
  return choices.reduce((sum, choice) => sum + choice.x, 0) / choices.length;
}

export function validatedBoxes(boxes, profile) {
  const result = new Map();
  const bubbles = profile.components.flatMap(block => block.items.flatMap(item =>
    item.choices ?? item.slots.flatMap(slot => slot.choices)));
  for (const { items, kind } of profile.components) {
    if (kind !== 'nr') continue;
    for (const { slots, bounds } of items) {
      for (const { id } of slots) {
        const box = boxes?.[id];
        if (!box) continue;
        const { x, y, width, height } = box;
        if (![x, y, width, height].every(Number.isFinite) || width < 5 || height < 5 ||
            x < Math.max(0, bounds.x - 8) || y < Math.max(0, bounds.y - 43) ||
            x + width > Math.min(profile.page.width, bounds.x + bounds.width + 8) ||
            y + height > bounds.y + bounds.height) continue;
        const center = slotCenter(slots, id);
        if (Math.abs(x + width / 2 - center) > Math.min(8, width * .45)) continue;
        if (bubbles.some(b => Math.hypot(b.x - Math.max(x, Math.min(b.x, x + width)),
          b.y - Math.max(y, Math.min(b.y, y + height))) <= b.radius)) continue;
        result.set(id, box);
      }
    }
  }
  const entries = [...result];
  for (const [id, a] of entries) {
    if (entries.some(([other, b]) => other !== id && a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height)) result.delete(id);
  }
  return result;
}

export async function readProfileSheetWithCpas(image, profile, options = {}) {
  const established = readProfileSheet(image, profile, options);
  return { ...established, cpas: await compareProfileSheet(image, profile, established, options) };
}

export async function compareProfileSheet(image, profile, established, options = {}) {
  if (established.status !== 'read') return { status: 'registration-rejected', items: [] };
  try {
    const start = performance.now();
    const validated = createMarkerlessProfile(profile);
    let reference;
    let referenceRejected = false;
    if (options.cpasReferencePatches) {
      try {
        const compact = openReferencePatches(options.cpasReferencePatches, validated);
        if (compact.usableCount) reference = compact;
        else referenceRejected = true;
      } catch { referenceRejected = true; }
    } else if (options.cpasReference) {
      const alignment = registerMarkerless(options.cpasReference, validated, {
        batch: options.batch, corners: options.cpasReferenceCorners,
      });
      if (alignment.status === 'registered') reference = { ...alignment, gray: toGrayImage(options.cpasReference) };
      else referenceRejected = true;
    }
    const [predict, stacking] = await Promise.all([
      options.cpasPredict ?? predictor(), options.cpasStackModel ?? stackingAssets(),
    ]);
    const gray = toGrayImage(image);
    const boxes = validatedBoxes(options.cpasHandwritingBoxes, validated);
    const hwr = boxes.size ? (options.cpasHandwritingModel ?? await handwritingAssets()) : null;
    const handwriting = hwr ? (id, matrix) => {
      const box = boxes.get(id);
      return box ? observeHandwriting(gray, matrix, box, hwr.gate, hwr.weights) : null;
    } : undefined;
    const cpas = evaluateCompletion(gray, validated, established.registration, {
      reference, predict, established: established.items, handwriting, localGeometry: true,
    });
    const byId = new Map(established.items.map(item => [item.id, item]));
    const groups = new Map(validated.components.flatMap(block =>
      block.kind === 'mc' ? block.items.map(item => [item.id, item.choices.map(choice => choice.symbol)]) : []));
    for (const item of cpas.items) {
      if (item.kind !== 'mc') continue;
      const est = byId.get(item.id);
      item.methods = compareMc(est, item, stacking);
      const evidence = { groupId: item.id, kind: 'mc', registration: established.registration.status,
        geometry: est?.choices?.every(choice => choice.quality.usable) ? 'supported-original' : 'unobservable',
        reference: item.evidenceComplete ? 'verified' : 'unverified', choices: groups.get(item.id), est, cpas: item };
      item.methods.unifiedAgreement = decideGroup(evidence);
      item.methods.unifiedStacking = stacking ? decideGroup({
        ...evidence, model: stacking, threshold: stackThreshold, policy: 'stack',
      }) : { status: 'unavailable' };
    }
    const bubbles = cpas.items.flatMap(item => item.bubbles ?? item.slots.flatMap(slot => slot.bubbles));
    cpas.referenceCoverage = { supported: bubbles.filter(bubble => bubble.conditioned).length, total: bubbles.length };
    cpas.referenceSource = reference?.patchFor ? 'compact' : reference ? 'image' : null;
    cpas.handwriting = { eligibleBoxes: boxes.size, modelAvailable: Boolean(hwr) };
    return { ...cpas, referenceRejected, elapsedMs: performance.now() - start };
  } catch {
    return { status: 'unavailable', items: [] };
  }
}
