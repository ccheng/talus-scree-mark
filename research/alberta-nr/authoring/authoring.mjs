import { importWorkingImage } from '../../../app/src/image.js';
import { pageTransform, proposePageCorners } from '../../../app/src/markerless-registration.js';
import { grayAt, toGrayImage } from '../../../app/src/omr-image.js';
import { cross, project } from '../../../app/src/projective.js';
import { discoverWithOutlineRecovery, inspectBoundedAlberta } from '../outline-recovery.mjs';
import { teacherGrid, validateResearchMapping } from './grid.mjs';

const get = (id) => document.getElementById(id);
const canvas = get('sheet');
const context = canvas.getContext('2d');
const page = { width: 612, height: 792, units: 'pt', origin: 'top-left', orientation: 'portrait' };
const pageFrame = { x: 0, y: 0, width: page.width, height: page.height };
const cornerNames = ['upper left', 'upper right', 'lower right', 'lower left'];
const anchorNames = ['0 in the left column', '0 in the right column', '9 in the left column', 'left decimal bubble'];
const storageKey = 'scree-research-alberta-nr-draft-v1';
const missingCount = (slots) => slots.flatMap(({ choices }) => choices).filter(({ observed }) => !observed).length;
let state;
let request;
const say = (message) => { get('status').textContent = message; };

function loadDraft() {
  return JSON.parse(localStorage.getItem(storageKey) ?? 'null');
}

function savedSummary() {
  try {
    get('reopen').hidden = true;
    const draft = loadDraft();
    if (!draft) return;
    validateResearchMapping(draft.slots, draft.region);
    get('saved').textContent = 'Local draft available · ' +
      draft.slots.reduce((total, { choices }) => total + choices.length, 0) + ' mapped positions across four columns.';
    if (draft.blankDigest && draft.blankDigest === state?.blankDigest) get('reopen').hidden = false;
    else if (draft.blankDigest) get('saved').textContent += ' Reimport the same blank photo to edit it.';
  } catch {
    get('saved').textContent = 'The saved draft could not be reopened.';
  }
}

function currentFrame() {
  if (state.mode === 'corners') return { x: 0, y: 0, width: state.image.width, height: state.image.height };
  return state.region && ['review', 'manual', 'correct'].includes(state.mode) ? state.region : pageFrame;
}

function displayPoint(point, frame) {
  return { x: (point.x - frame.x) * canvas.width / frame.width, y: (point.y - frame.y) * canvas.height / frame.height };
}

function render() {
  const frame = currentFrame();
  const source = state.mode === 'corners' ? state.source : state.rectified;
  const scale = source.width / (state.mode === 'corners' ? state.image.width : page.width);
  canvas.width = Math.min(920, Math.round(frame.width * 3));
  canvas.height = Math.round(frame.height * canvas.width / frame.width);
  context.drawImage(source, frame.x * scale, frame.y * scale, frame.width * scale, frame.height * scale,
    0, 0, canvas.width, canvas.height);
  canvas.dataset.frame = JSON.stringify(frame);
  canvas.dataset.mode = state.mode;
  const ring = (choice, color, dashed = false) => {
    const at = displayPoint(choice, frame);
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = Math.max(2, canvas.width / 170);
    context.setLineDash(dashed ? [3, 3] : []);
    context.arc(at.x, at.y, choice.radius * canvas.width / frame.width, 0, 2 * Math.PI);
    context.stroke();
    context.setLineDash([]);
  };
  if (state.mode === 'corners') {
    for (const point of state.corners) ring({ ...point, radius: state.image.width * .009 }, '#00734e');
  }
  if (state.mode === 'manual') {
    for (const point of state.anchors) ring({ ...point, radius: 1.5 }, '#165eaa');
  }
  const selected = get('bubble').value;
  for (const [slot, { choices }] of (state.slots ?? []).entries()) {
    for (const choice of choices) {
      const selectedNow = state.mode === 'correct' && selected === `${slot}:${choice.symbol}`;
      ring(choice, selectedNow ? '#165eaa' : choice.observed ? '#006746' : '#8e4c09', !choice.observed);
    }
  }
  if (state.drag?.to) {
    const a = displayPoint(state.drag.from, frame);
    const b = displayPoint(state.drag.to, frame);
    context.strokeStyle = '#006746';
    context.lineWidth = 4;
    context.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
}

function refresh() {
  const reviewing = state.mode === 'review' && state.slots;
  get('review').hidden = !reviewing && state.mode !== 'correct';
  get('grid-actions').hidden = !state.region || !['review', 'manual', 'correct'].includes(state.mode);
  get('discard').hidden = !state.slots;
  get('manual').disabled = state.mode === 'manual';
  get('save').disabled = !reviewing || !get('verified').checked;
  canvas.hidden = false;
  render();
}

function present(slots) {
  state.slots = slots;
  state.mode = 'review';
  get('verified').checked = false;
  get('bubble').replaceChildren();
  if (slots) {
    const estimates = missingCount(slots);
    get('coverage').textContent = `${42 - estimates} detected or placed · ${estimates} estimates (dashed rings). Check all 42 positions before saving.`;
    for (const [column, { choices }] of slots.entries()) {
      for (const { symbol, observed } of choices) {
        get('bubble').add(new Option(`Column ${column + 1}, ${symbol === '.' ? 'decimal' : symbol}${observed ? '' : ' (estimate)'}`, `${column}:${symbol}`));
      }
    }
  }
  refresh();
}

function chooseRegion() {
  state.mode = 'region';
  state.region = state.slots = state.drag = null;
  say('Draw a box around one question. Include the writing boxes, decimal bubbles and all ten digit rows.');
  refresh();
}

function rectify() {
  if (!state.corners.every((corner, i) => cross(corner, state.corners[(i + 1) % 4], state.corners[(i + 2) % 4]) > 0)) {
    throw new Error('The page corners should run clockwise from the upper left.');
  }
  const matrix = pageTransform(page, state.corners);
  if (!matrix) throw new Error('Use four distinct page corners in the displayed order.');
  const gray = toGrayImage(state.image);
  const raster = document.createElement('canvas');
  const scale = 2;
  raster.width = page.width * scale;
  raster.height = page.height * scale;
  const drawing = raster.getContext('2d');
  const pixels = drawing.createImageData(raster.width, raster.height);
  for (let y = 0, i = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++, i += 4) {
      const point = project(matrix, x / scale, y / scale);
      const value = point ? grayAt(gray, point.x, point.y) : NaN;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = Number.isFinite(value) ? value : 255;
      pixels.data[i + 3] = 255;
    }
  }
  drawing.putImageData(pixels, 0, 0);
  state.matrix = matrix;
  state.rectified = raster;
  chooseRegion();
}

get('blank').addEventListener('change', async ({ target }) => {
  const file = target.files[0];
  if (!file) return;
  request?.abort();
  const pending = new AbortController();
  request = pending;
  say('Reading the blank sheet…');
  try {
    const image = await importWorkingImage(file, pending.signal);
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    pending.signal.throwIfAborted();
    const blankDigest = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    source.getContext('2d').putImageData(image.pixels, 0, 0);
    const corners = proposePageCorners(image);
    state = { image, source, blankDigest, corners: corners ?? [] };
    get('page-controls').hidden = false;
    if (corners) rectify();
    else get('corners').click();
    savedSummary();
  } catch (error) {
    if (!pending.signal.aborted) say(error.message);
  }
});

get('corners').addEventListener('click', () => {
  state.mode = 'corners';
  state.corners = [];
  state.region = state.slots = null;
  say('Tap the upper left page corner.');
  refresh();
});
get('redraw').addEventListener('click', () => {
  if (state.rectified && state.mode !== 'corners') chooseRegion();
  else say('Finish marking the page corners first.');
});

function inspect(region) {
  state.region = region;
  const args = [state.image, state.matrix, page, region];
  const complete = discoverWithOutlineRecovery(...args).block?.items[0].slots;
  const partial = complete ? null : inspectBoundedAlberta(...args, { allowMissing: true }).models;
  const slots = complete?.map(({ choices }) => ({ choices: choices.map((choice) => ({ ...choice, observed: true })) }))
    ?? (partial?.length === 1 ? partial[0].slots : null);
  try {
    if (slots) validateResearchMapping(slots, region);
    present(slots);
    say(complete ? 'A complete grid was found. Compare the overlay with the print.' : slots
      ? 'Some bubble outlines could not be verified. Check the dashed positions or place the whole grid with four taps.'
      : 'No single reliable grid was found. Place it with four taps if the printed bubbles are visible.');
  } catch (error) {
    present(null);
    say(error.message);
  }
}

get('manual').addEventListener('click', () => {
  state.mode = 'manual';
  state.anchors = [];
  get('verified').checked = false;
  say(`Tap the ${anchorNames[0]}.`);
  refresh();
});
get('discard').addEventListener('click', () => {
  present(null);
  get('manual').click();
});
get('correct').addEventListener('click', () => {
  state.mode = 'correct';
  get('verified').checked = false;
  say('Tap the printed center for the selected bubble. The other positions stay in place.');
  refresh();
});
get('bubble').addEventListener('change', refresh);
get('verified').addEventListener('change', refresh);

function location(event) {
  const rect = canvas.getBoundingClientRect();
  const frame = currentFrame();
  const u = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const v = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  return { x: frame.x + u * frame.width, y: frame.y + v * frame.height };
}

canvas.addEventListener('pointerdown', (event) => {
  if (state.mode !== 'region') return;
  state.drag = { from: location(event) };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!state.drag) return;
  state.drag.to = location(event);
  render();
});
canvas.addEventListener('pointercancel', () => {
  state.drag = null;
  refresh();
});
canvas.addEventListener('pointerup', (event) => {
  const point = location(event);
  if (state.mode === 'region' && state.drag) {
    const { from } = state.drag;
    state.drag = null;
    const region = { x: Math.min(from.x, point.x), y: Math.min(from.y, point.y),
      width: Math.abs(from.x - point.x), height: Math.abs(from.y - point.y) };
    if (region.height < 76 || region.width < 39 || region.height > 310 || region.width > 205) {
      say('Draw a box around one whole NR question.');
      refresh();
      return;
    }
    inspect(region);
    return;
  }
  if (state.mode === 'corners') {
    state.corners.push(point);
    if (state.corners.length === 4) {
      try { rectify(); }
      catch (error) {
        state.corners = [];
        say(error.message + ' Start at the upper left.');
        refresh();
      }
    } else {
      say(`Tap the ${cornerNames[state.corners.length]} page corner.`);
      refresh();
    }
    return;
  }
  if (state.mode === 'manual') {
    state.anchors.push(point);
    if (state.anchors.length < 4) {
      say(`Tap the ${anchorNames[state.anchors.length]}.`);
      refresh();
      return;
    }
    try {
      present(teacherGrid(state.anchors, state.region, state.slots));
      say('Check the dashed estimates against the printed bubbles.');
    } catch (error) {
      state.anchors = [];
      say(error.message + ' Start with the left 0.');
      refresh();
    }
    return;
  }
  if (state.mode === 'correct') {
    const [column, symbol] = get('bubble').value.split(':');
    const changed = structuredClone(state.slots);
    const cell = changed[column].choices.find((choice) => choice.symbol === symbol);
    Object.assign(cell, point, { observed: false });
    try {
      validateResearchMapping(changed, state.region);
      present(changed);
      say('Position moved. Check the overlay before saving.');
    } catch (error) { say(error.message); }
  }
});

get('save').addEventListener('click', () => {
  if (state.mode !== 'review' || !get('verified').checked) return;
  try {
    validateResearchMapping(state.slots, state.region);
    const slots = state.slots.map(({ choices }) => ({ choices: choices.map(({ x, y, radius, symbol }) => ({ x, y, radius, symbol })) }));
    localStorage.setItem(storageKey, JSON.stringify({ page, region: state.region, slots, corners: state.corners,
      blankDigest: state.blankDigest }));
    savedSummary();
    say('Review confirmed. The draft was saved on this device.');
  } catch (error) { say(error.message); }
});

get('reopen').addEventListener('click', () => {
  try {
    const draft = loadDraft();
    if (!draft?.blankDigest || draft.blankDigest !== state?.blankDigest) throw new Error('Reimport the original blank photo first.');
    validateResearchMapping(draft.slots, draft.region);
    state.corners = draft.corners;
    rectify();
    state.region = draft.region;
    present(draft.slots.map(({ choices }) => ({ choices: choices.map((choice) => ({ ...choice, observed: false })) })));
    say('Draft reopened. Check the overlay after editing.');
  } catch (error) { say(error.message); }
});

savedSummary();
