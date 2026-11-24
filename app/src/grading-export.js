import { addDecision, gradeScan, sameTemplate, validateCategories, validateKey } from './grading.js';

const version = 1;
const format = 'talus-scree-mark-backup';
const text = (value) => typeof value === 'string' && value.length > 0;
const requireValid = (ok, message) => { if (!ok) throw new Error(message); };

function csvCell(value) {
  let string = String(value ?? '');
  if (typeof value === 'string' && /^\s*[=+\-@]|^[\t\r\n]/.test(string)) string = "'" + string;
  return '"' + string.replaceAll('"', '""') + '"';
}

export function exportCsv(scans) {
  const headings = ['scan', 'label', 'template', 'template_revision', 'key', 'score', 'denominator', 'pending',
    'grade_status', 'question', 'raw', 'effective', 'item_status', 'item_pending', 'item_points', 'adjudication',
    'grading_scope', 'row_type', 'dimension_1', 'category_1', 'dimension_2', 'category_2',
    'subtotal_score', 'subtotal_denominator', 'subtotal_pending'];
  const rows = scans.flatMap((scan) => {
    const { grade } = scan;
    const prefix = [scan.id, scan.label, scan.template.id, scan.template.revision, scan.keyId,
      grade.score, grade.denominator, grade.pending, grade.status];
    const scope = scan.template.scope === 'mc-only' ? 'MC only (NR and WR excluded)' : '';
    const dimensions = grade.categories?.dimensions;
    const category = (i, value) => [dimensions?.[i].name, dimensions ? value ?? '(Unassigned)' : ''];
    return [
      ...grade.items.map((item) => [...prefix, item.id, item.raw, item.effective, item.status,
        item.pending, item.points, item.adjudication, scope, 'item',
        ...category(0, item.categories?.[0]), ...category(1, item.categories?.[1]), '', '', '']),
      ...(grade.categories?.subtotals ?? []).map(({ dimension, values, score, denominator, pending }) => [
        ...prefix, '', '', '', '', '', '', '', scope, dimension === null ? 'intersection' : 'dimension_' + dimension,
        ...(dimension === 2 ? ['', ''] : category(0, values[0])),
        ...(dimension === 1 ? ['', ''] : category(1, values[1])), score, denominator, pending,
      ]),
    ];
  });
  return [headings, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

async function checksum(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function encodePhoto(photo) {
  if (!photo) return null;
  const bytes = new Uint8Array(await photo.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return { type: photo.type, data: btoa(binary), sha256: await checksum(bytes) };
}

async function decodePhoto(photo) {
  if (photo === null) return null;
  requireValid(photo?.type === 'image/png' && text(photo.data), 'Invalid retained photograph.');
  const bytes = Uint8Array.from(atob(photo.data), (character) => character.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  requireValid(signature.every((byte, index) => bytes[index] === byte) &&
    photo.sha256 === await checksum(bytes), 'Corrupted retained photograph.');
  const blob = new Blob([bytes], { type: photo.type });
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    bitmap.close();
  }
  return blob;
}

export async function exportBackup({ keys, scans }) {
  const used = new Set(scans.map(({ keyId }) => keyId));
  const records = await Promise.all(scans.map(async (scan) => ({
    ...scan, photo: await encodePhoto(scan.photo),
  })));
  // Keep unused answer keys, including keys saved before the first scan.
  const missing = [...used].some((id) => id !== null && !keys.some((key) => key.id === id));
  requireValid(!missing, 'A scan references an unavailable key.');
  return JSON.stringify({ format, version, keys, scans: records });
}

function unique(records, label) {
  requireValid(Array.isArray(records), `Invalid ${label} list.`);
  const ids = new Set();
  for (const record of records) {
    requireValid(text(record?.id) && !ids.has(record.id), `Duplicate or invalid ${label} ID.`);
    ids.add(record.id);
  }
}

function validateTemplate(template) {
  requireValid(text(template?.id) && text(template.name) && Number.isSafeInteger(template.revision) &&
    template.revision > 0, 'Invalid template reference.');
  unique(template.items, 'question');
  requireValid(template.scope === undefined || (template.scope === 'mc-only' &&
    template.items.every(({ kind }) => kind === 'mc')), 'Invalid grading scope.');
  requireValid(template.items.length > 0 && template.items.every((item) => {
    const valid = (symbols, pattern) => Array.isArray(symbols) && symbols.length &&
      new Set(symbols).size === symbols.length && symbols.every((symbol) => typeof symbol === 'string' && pattern.test(symbol));
    return item.kind === 'mc' ? valid(item.choices, /^[A-Z0-9]{1,5}$/)
      : item.kind === 'nr' && item.slots?.length === 4 && item.slots.every((slot) => valid(slot, /^[0-9.+-]$/));
  }), 'Invalid template mapping.');
}

const unresolvedStatuses = ['unreadable', 'ambiguous', 'multiple'];

function consistentObservation(item, raw) {
  if (raw?.kind !== item.kind || typeof raw.review !== 'boolean') return false;
  const unresolved = unresolvedStatuses.includes(raw.status);
  if (unresolved && (!raw.review || raw.rawText !== null)) return false;
  if (item.kind === 'mc') {
    if (unresolved || raw.status === 'blank') return raw.rawText === null && (raw.symbol ?? null) === null;
    return raw.status === 'single' && item.choices.includes(raw.rawText) &&
      (raw.symbol === undefined || raw.symbol === raw.rawText);
  }
  if (!Array.isArray(raw.slots) || raw.slots.length !== 4 || !raw.slots.every((slot, index) =>
    slot && (slot.symbol === null || item.slots[index].includes(slot.symbol)) &&
    (slot.status === undefined || (slot.symbol === null
      ? ['blank', ...unresolvedStatuses].includes(slot.status) : slot.status === 'single')))) return false;
  const hasUnresolved = raw.slots.some(({ status }) => unresolvedStatuses.includes(status));
  if (unresolved) return hasUnresolved;
  const literal = raw.slots.map(({ symbol }) => symbol ?? ' ').join('');
  return !hasUnresolved && raw.rawText === literal && raw.status === (literal === '    ' ? 'blank' : 'single');
}

export async function parseBackup(source) {
  const backup = JSON.parse(source);
  requireValid(backup?.format === format && backup.version === version, 'Unsupported Scree Mark backup format or version.');
  unique(backup.keys, 'answer key');
  unique(backup.scans, 'scan');
  const keys = new Map();
  for (const key of backup.keys) {
    validateTemplate(key.template);
    requireValid(text(key.createdAt), 'Invalid answer key date.');
    validateKey(key.template, key.answers);
    validateCategories(key.template, key.categories);
    keys.set(key.id, key);
  }
  const scans = [];
  for (const scan of backup.scans) {
    validateTemplate(scan.template);
    requireValid(text(scan.label) && text(scan.batchId) && text(scan.createdAt) && text(scan.updatedAt) &&
      scan.observation?.status === 'read' && text(scan.observation.captureId) && Array.isArray(scan.history),
    'Invalid saved scan.');
    unique(scan.observation.items, 'observation');
    requireValid(scan.observation.items.length === scan.template.items.length &&
      scan.template.items.every((item) => consistentObservation(item,
        scan.observation.items.find(({ id }) => id === item.id))), 'Invalid or inconsistent recognition evidence.');
    const key = scan.keyId === null ? null : keys.get(scan.keyId);
    requireValid(scan.keyId === null || key && sameTemplate(scan.template, key.template), 'Incompatible or missing answer key.');
    if (scan.regrades !== undefined) {
      requireValid(Array.isArray(scan.regrades) && scan.regrades.every((event) => text(event?.at) &&
        sameTemplate(keys.get(event.keyId)?.template, scan.template) &&
        (event.previousKeyId === null || sameTemplate(keys.get(event.previousKeyId)?.template, scan.template))) &&
        scan.regrades.at(-1)?.keyId === scan.keyId, 'Invalid regrade provenance.');
    }
    for (const event of scan.history) {
      requireValid(text(event?.at), 'Invalid review history.');
      addDecision(scan, event.itemId, event.kind, event.value);
    }
    requireValid(scan.rescanOf === null || typeof scan.rescanOf === 'string', 'Invalid rescan provenance.');
    const grade = gradeScan(scan, key);
    requireValid(JSON.stringify(scan.grade) === JSON.stringify(grade), 'Inconsistent saved grade.');
    const photo = await decodePhoto(scan.photo);
    requireValid(scan.photoStatus === (photo ? 'retained' : 'deleted'), 'Invalid photograph association.');
    scans.push({ ...scan, grade, photo });
  }
  return { keys: backup.keys, scans };
}
