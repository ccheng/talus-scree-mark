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

function validatedBoxes(boxes, profile) {
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
            x < bounds.x || y < bounds.y || x + width > bounds.x + bounds.width ||
            y + height > bounds.y + bounds.height) continue;
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
  if (established.status !== 'read') return { ...established, cpas: { status: 'registration-rejected', items: [] } };
  try {
    const start = performance.now();
    const validated = createMarkerlessProfile(profile);
    let reference;
    if (options.cpasReference) {
      const alignment = registerMarkerless(options.cpasReference, validated, {
        batch: options.batch, corners: options.cpasReferenceCorners,
      });
      if (alignment.status !== 'registered') {
        return { ...established, cpas: { status: 'reference-registration-rejected', items: [] } };
      }
      reference = { ...alignment, gray: toGrayImage(options.cpasReference) };
    }
    const predict = options.cpasPredict ?? await predictor();
    const gray = toGrayImage(image);
    const boxes = validatedBoxes(options.cpasHandwritingBoxes, validated);
    const hwr = boxes.size ? (options.cpasHandwritingModel ?? await handwritingAssets()) : null;
    const handwriting = hwr ? (id, matrix) => {
      const box = boxes.get(id);
      return box ? observeHandwriting(gray, matrix, box, hwr.gate, hwr.weights) : null;
    } : undefined;
    const cpas = evaluateCompletion(gray, validated, established.registration, {
      reference, predict, established: established.items, handwriting,
    });
    cpas.handwriting = { eligibleBoxes: boxes.size, modelAvailable: Boolean(hwr) };
    return { ...established, cpas: { ...cpas, elapsedMs: performance.now() - start } };
  } catch {
    return { ...established, cpas: { status: 'unavailable', items: [] } };
  }
}
