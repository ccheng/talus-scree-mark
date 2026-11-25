import { enrollPrintedLandmarks } from './printed-landmarks.js';
import { pageTransform, proposePageCorners } from './markerless-registration.js';
import { conflictingResponseIds, createMarkerlessProfile, intersects, manualGrid, proposeGrid, renumberProfileBlock, validBounds } from './profile-authoring.js';
import { cross, project } from './projective.js';
import { discoverBoxedAlberta } from './layout-discovery.js';
import { measureNumericalBlankInk } from './marks.js';
import { toGrayImage } from './omr-image.js';

const byId = (id) => document.getElementById(id);
const value = (id) => byId(id).value;
const number = (id) => byId(id).valueAsNumber;
const write = (id, next) => { byId(id).value = Number.isFinite(next) ? Number(next.toFixed(2)) : next; };
const coordinates = (x, y) => ({ x, y });
const idFor = (prefix) => prefix + '-' + crypto.randomUUID().slice(0, 8);
const cornerLabels = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
function itemLabel({ items }) {
  const ids = items.map(({ id }) => id);
  const start = /^(.*?)([0-9]+)$/.exec(ids[0]);
  const consecutive = start && ids.every((id, index) => id === start[1] + (Number(start[2]) + index));
  return consecutive && ids.length > 1 ? `${ids[0]}–${ids.at(-1)}` : ids.join(', ');
}
const dragBox = (start, end) => ({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
  width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) });

export function insetCorners({ width, height }) {
  return [
    { x: width * .08, y: height * .08 }, { x: width * .92, y: height * .08 },
    { x: width * .92, y: height * .92 }, { x: width * .08, y: height * .92 },
  ];
}

export function nearestCorner(canvas, image, points, target) {
  const { width, height } = canvas.getBoundingClientRect();
  let best = -1;
  let distance = 36;
  for (const [index, point] of points.entries()) {
    const gap = Math.hypot((point.x - target.x) * width / image.width, (point.y - target.y) * height / image.height);
    if (gap < distance) { best = index; distance = gap; }
  }
  return best;
}

export function paintCornerMarkers(ctx, image, points, displayWidth, active = -1) {
  const radius = Math.max(10, image.width * 11 / Math.max(displayWidth, 180));
  ctx.font = `600 ${radius}px system-ui`;
  for (const [index, point] of points.entries()) {
    const label = `${index + 1} ${cornerLabels[index]}`;
    const size = ctx.measureText(label).width;
    const left = Math.max(radius * .5, Math.min(image.width - size - radius, point.x + radius));
    const top = Math.max(radius, Math.min(image.height - radius, point.y + (point.y < image.height / 2 ? 2 : -1.1) * radius));
    ctx.lineWidth = radius * .19;
    ctx.strokeStyle = index === active ? '#244f73' : '#9c341c';
    ctx.fillStyle = '#fff9ef';
    ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillRect(left - .2 * radius, top - radius, size + .4 * radius, radius * 1.28);
    ctx.fillStyle = '#25231e';
    ctx.fillText(label, left, top);
  }
}

export function sourceOnCanvas(canvas, image) {
  const scale = Math.min(1, 910 / Math.max(image.width, image.height));
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  source.getContext('2d').putImageData(image.pixels, 0, 0);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.width = source.height = 1;
}

function rectifiedOnCanvas(canvas, image, matrix, page, virtual = false) {
  const factor = 840 / Math.max(page.width, page.height);
  canvas.width = Math.round(factor * page.width);
  canvas.height = Math.round(factor * page.height);
  const ctx = canvas.getContext('2d');
  const output = ctx.createImageData(canvas.width, canvas.height);
  const source = image.pixels.data;
  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      const target = project(matrix, x / factor, y / factor);
      const tx = Math.round(target?.x);
      const ty = Math.round(target?.y);
      const index = (y * output.width + x) * 4;
      if (!target || tx < 0 || ty < 0 || tx >= image.width || ty >= image.height) {
        output.data[index] = output.data[index + 1] = output.data[index + 2] = virtual ? 235 : 255;
      } else {
        const at = (ty * image.width + tx) * 4;
        output.data[index] = source[at]; output.data[index + 1] = source[at + 1]; output.data[index + 2] = source[at + 2];
      }
      output.data[index + 3] = 255;
    }
  }
  ctx.putImageData(output, 0, 0);
}

export function createProfileEditor({ onSave, onClose }) {
  const panel = byId('profile-editor');
  const canvas = byId('profile-canvas');
  const background = document.createElement('canvas');
  const status = byId('editor-status');
  const blocksList = byId('profile-blocks');
  const discoveryStatus = byId('discovery-status');
  const mappingPanel = byId('block-mapping');
  const mappingFields = byId('block-mapping-fields');
  const renumberPanel = byId('renumber-block');
  const conflictStatus = byId('numbering-conflicts');
  const saveTemplate = byId('enroll-profile');
  const say = (msg) => { status.textContent = msg; };
  let state;
  let nextJob = 0;

  function discoveryMessage(progress, message = '') {
    discoveryStatus.dataset.status = progress;
    discoveryStatus.textContent = message;
    byId('review-discovery').hidden = progress !== 'review' || !state?.discoveryIssues?.length ||
      state.discoveryIssues.includes('frame-aspect');
  }

  function stopDiscovery() {
    state?.discoveryWorker?.terminate();
    if (state) state.discoveryWorker = null;
  }

  function page() {
    const orientation = value('profile-orientation');
    return {
      width: orientation === 'portrait' ? 612 : 792, height: orientation === 'portrait' ? 792 : 612,
      units: 'pt', origin: 'top-left', orientation,
    };
  }

  function fullFrame() {
    const { width, height } = state.image;
    return [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }];
  }

  const issueText = {
    'page-corners': 'The page corners could not be resolved.',
    'frame-aspect': 'The photo frame does not fit the selected paper orientation.',
    'no-grid': 'No complete new response blocks were found.',
    'interrupted-grid': 'A repeated grid has a possible missing row.',
    'check-mc-choice-counts': 'Some MC rows appear to have missing or inconsistent choices.',
    'overlapping-grids': 'Some competing response proposals overlap.',
    'invalid-grids': 'Some proposals could not form a valid template.',
    'unassigned-print': 'Some repeated printed outlines were not mapped.',
    'unassigned-near-grid': 'There are unmapped outlines next to a response grid.',
    'unusual-nr-grid': 'A numerical grid does not have the expected digit rows.',
    'too-many-candidates': 'There are too many printed outlines to separate reliably.',
  };
  const describeIssues = (issues) => issues.map((issue) => issueText[issue] ?? issue).join(' ');
  const mcCount = (blocks) => blocks.filter(({ kind }) => kind === 'mc')
    .reduce((count, { items }) => count + items.length, 0);

  function duplicateDetails(blocks) {
    const ids = new Map();
    for (const [index, block] of blocks.entries()) {
      for (const id of [block.id, ...block.items.flatMap((item) =>
        [item.id, ...(item.slots ?? []).map((slot) => slot.id)])]) {
        if (!ids.has(id)) ids.set(id, []);
        ids.get(id).push(`Block ${index + 1} (${itemLabel(block)})`);
      }
    }
    return [...ids].filter(([, owners]) => owners.length > 1).map(([id, owners]) =>
      `${id}: ${[...new Set(owners)].join(' and ')}`).join('; ');
  }

  function mcCoverage() {
    const field = byId('mc-expected-count');
    const expected = field.value ? field.valueAsNumber : null;
    const mapped = mcCount(state.blocks);
    const invalid = !field.validity.valid;
    return { expected, mapped, invalid, mismatch: !invalid && expected !== null && expected !== mapped };
  }

  function saveBlocker() {
    if (state.saving) return 'Saving the template…';
    if (state.discoveryWorker) return 'Wait for discovery to finish.';
    if (!state.matrix) return 'Confirm the page corners before saving.';
    if (state.discoveryStale) return 'Exclusions or scope changed. Find blocks again, or clear replaceable proposals and finish manually.';
    const conflicts = duplicateDetails(state.blocks);
    if (conflicts) return `Duplicate identifiers. ${conflicts}. Renumber the affected block before saving.`;
    if (state.grid || state.editing || state.mappingBlock || state.renumberBlock ||
        state.exclusionEdit !== undefined || state.endpoints) {
      return 'Confirm or cancel the open grid, numbering, or exclusion edit.';
    }
    if (!state.blocks.length) return 'Confirm at least one response block before saving.';
    if (state.scope && state.blocks.some(({ kind }) => kind !== 'mc')) {
      return 'Remove numerical response blocks or rediscover with exclusions before saving an MC-only profile.';
    }
    const { expected, mapped, invalid, mismatch } = mcCoverage();
    if (state.scope && invalid) return 'Enter a whole expected question count from 1 to 1536.';
    if (state.scope && mismatch && value('mc-completeness') !== 'partial') {
      return `Mapped ${mapped} of ${expected} expected MC questions. Correct the mapping or explicitly save a partial profile.`;
    }
    if (state.scope && state.coverageReview && !value('mc-completeness')) {
      return 'Check the overlay and choose whether all intended MC questions are mapped or only a subset.';
    }
    if (state.discoveryIssues.length) {
      return describeIssues(state.discoveryIssues) + ' Review the discovery warning before saving.';
    }
    if (!value('profile-name').trim() || value('profile-name').trim().length > 80) {
      return 'Enter a template name of 1–80 characters.';
    }
    return '';
  }

  function renderSaveStatus() {
    if (!state) return;
    const blocked = saveBlocker();
    saveTemplate.disabled = Boolean(blocked);
    const coverage = mcCoverage();
    byId('mc-expected-status').textContent = state.scope
      ? coverage.invalid ? 'Enter a whole question count.' : coverage.expected === null
        ? `${coverage.mapped} MC questions mapped. Enter an expected count to check coverage.`
        : `${coverage.mapped} of ${coverage.expected} expected MC questions mapped.` : '';
    const scope = byId('mc-completeness-panel');
    scope.hidden = !state.scope;
    byId('template-save-status').textContent = blocked || (state.scope
      ? `${mcCount(state.blocks)} MC questions mapped. ${value('mc-completeness') === 'partial'
        ? 'Only these questions will be included.' : 'Compare the overlay with the sheet before saving.'}` : '');
    byId('cancel-block-edit').hidden = !(state.grid || state.editing || state.endpoints);
  }

  function recheckCoverage() {
    if (state.scope) {
      state.coverageReview = true;
      byId('mc-completeness').value = '';
    }
  }

  function arrangeBlockOptions() {
    const region = byId('profile-region-options');
    const block = byId('profile-block-options');
    if (state.scope) region.before(block);
    else block.before(region);
    byId('region-coordinate-details').open = !state.scope;
    byId('legacy-grid-details').open = !state.scope;
  }

  function show(message) {
    const placingCorners = Boolean(state.cornerEdit);
    byId('cancel-blank-corners').hidden = !placingCorners;
    byId('profile-orientation').disabled = placingCorners;
    byId('reset-blank-corners').disabled = state.saving || Boolean(state.discoveryWorker);
    byId('review-discovery').hidden = placingCorners || state.discoveryStale || discoveryStatus.dataset.status !== 'review' ||
      !state.discoveryIssues.length || state.discoveryIssues.includes('frame-aspect');
    renderSaveStatus();
    const finding = Boolean(state.discoveryWorker);
    byId('profile-mc-only').disabled = placingCorners || finding;
    byId('profile-mc-review').hidden = !state.scope;
    byId('mc-fit-controls').hidden = !state.scope;
    byId('review-discovery').textContent = state.scope
      ? 'Acknowledge warning and review mapping' : 'Keep found blocks and check gaps';
    byId('rediscover-layout').hidden = !state.matrix || finding ||
      !(state.scope || state.exclusions.length || state.blocks.length || state.prior);
    byId('add-exclusion').disabled = finding;
    byId('cancel-exclusion-edit').hidden = state.exclusionEdit === undefined;
    byId('block-kind').querySelector('[value="nr"]').disabled = Boolean(state.scope);
    byId('profile-grid-controls').hidden = !state.matrix;
    byId('apply-blank-corners').disabled = state.corners.length !== 4 || Boolean(state.matrix);
    byId('discover-layout').hidden = Boolean(placingCorners || state.prior || state.discoveryWorker || state.blocks.length);
    byId('clear-discovery').hidden = placingCorners || (!state.scope && Boolean(state.prior)) ||
      !state.blocks.some(({ id }) => !state.kept.has(id));
    if (message) say(message);
    paint();
  }

  function paint() {
    if (!state) return;
    canvas.width = background.width;
    canvas.height = background.height;
    canvas.dataset.zoom = String(state.zoom);
    canvas.dataset.pan = String(state.pan);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(background, 0, 0);
    const logical = state.matrix ? page() : state.image;
    ctx.scale(canvas.width / logical.width, canvas.height / logical.height);
    ctx.lineWidth = state.matrix ? 1.5 : 3 / Math.min(canvas.width / logical.width, canvas.height / logical.height);
    ctx.font = state.matrix ? '9px system-ui' : `${Math.max(15, logical.width / 52)}px system-ui`;
    function box(bounds, color, name) {
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      if (name) ctx.fillText(name, bounds.x + 2, bounds.y + 10);
    }
    function dot(point, radius, color, name) {
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI); ctx.stroke();
      if (name) ctx.fillText(name, point.x + radius + 1, point.y - radius);
    }
    if (!state.matrix) {
      canvas.dataset.draggingRegion = 'false';
      paintCornerMarkers(ctx, logical, state.corners, canvas.getBoundingClientRect().width, state.cornerDrag);
      return;
    }
    ctx.setLineDash([4, 3]);
    state.exclusions.forEach((bounds, index) => box(bounds, '#8c4519', `Excluded ${index + 1}`));
    ctx.setLineDash([]);
    for (const block of state.blocks) {
      box(block.bounds, '#287651', itemLabel(block));
      for (const item of block.items) {
        if (item.kind === 'mc') {
          for (const choice of item.choices) dot(choice, choice.radius + .75, '#287651', `${item.id} ${choice.symbol}`);
        } else {
          for (const [slot, entry] of item.slots.entries()) {
            for (const choice of entry.choices) dot(choice, choice.radius + .75, '#287651', `${slot + 1}:${choice.symbol}`);
          }
        }
      }
      for (const writing of state.discoveryDiagnostics?.find(({ id }) => id === block.id)?.writingBoxes ?? []) {
        box(writing, '#74528d', String(writing.slot));
      }
    }
    if (state.region) box(state.region, '#245c8e');
    const draggingRegion = Boolean(state.drag && !state.endpoints);
    canvas.dataset.draggingRegion = String(draggingRegion);
    if (draggingRegion) {
      ctx.setLineDash([6, 4]);
      box(dragBox(state.drag.start, state.drag.current), '#245c8e');
      ctx.setLineDash([]);
    }
    for (const cell of (state.grid?.cells ?? [])) {
      if (!cell.omit) dot(cell, cell.radius + 1, cell.missing ? '#c05224' : '#245c8e', cell.symbol || '?');
    }
    state.endpoints?.forEach((point, index) => dot(point, 4, '#a33415', String(index + 1)));
  }

  function resetCorners() {
    stopDiscovery();
    delete canvas.dataset.pose;
    delete discoveryStatus.dataset.pose;
    state.discoveryIssues = [];
    discoveryMessage('idle');
    state.matrix = null;
    state.drag = null;
    state.cornerDrag = -1;
    state.corners = [];
    state.grid = null;
    state.region = null;
    state.editing = null;
    state.endpoints = null;
    sourceOnCanvas(background, state.image);
    show('Tap the blank page corners in sheet order. Existing regions still use the same sheet coordinates.');
  }

  function beginCornerEdit() {
    if (!state.cornerEdit) state.cornerEdit = { corners: state.corners, matrix: state.matrix };
    state.matrix = null;
    state.drag = null;
    state.cornerDrag = -1;
    state.corners = proposePageCorners(state.image) ?? insetCorners(state.image);
    sourceOnCanvas(background, state.image);
    show('Drag the numbered handles, then use these corners or cancel.');
  }

  function cancelCornerEdit() {
    if (!state.cornerEdit) return;
    const { corners, matrix } = state.cornerEdit;
    state.cornerEdit = null;
    state.corners = corners;
    state.matrix = matrix;
    state.drag = null;
    state.cornerDrag = -1;
    if (matrix) {
      rectifiedOnCanvas(background, state.image, matrix, page(), canvas.dataset.pose === 'virtual-corners');
    }
    show(matrix ? 'Restored the previous corners and response adjustments.' : 'Corner placement canceled.');
  }

  function confirmCorners() {
    const ordered = state.corners.length === 4 && state.corners.every((point, index, corners) =>
      cross(point, corners[(index + 1) % 4], corners[(index + 2) % 4]) > 0);
    if (!ordered) return say('Place the corners clockwise in sheet order, starting at top left.');
    const matrix = pageTransform(page(), state.corners);
    if (!matrix) return say('The corners do not form a usable page. Place them again.');
    if (state.cornerEdit) {
      state.cornerEdit = null;
      delete canvas.dataset.pose;
      delete discoveryStatus.dataset.pose;
    }
    state.matrix = matrix;
    const remaining = state.discoveryIssues.filter((issue) => !['page-corners', 'frame-aspect'].includes(issue));
    if (remaining.length !== state.discoveryIssues.length) {
      state.discoveryIssues = remaining;
      discoveryMessage(remaining.length ? 'review' : 'manual-review', describeIssues(remaining));
      recheckCoverage();
    }
    rectifiedOnCanvas(background, state.image, matrix, page());
    show('Draw a box around one answer block.');
  }

  function findLayout(useExistingCorners = false) {
    if (state.discoveryWorker || state.cornerEdit) return;
    if (state.grid || state.editing || state.mappingBlock || state.renumberBlock || state.exclusionEdit !== undefined) {
      return say('Finish the current edit before finding more blocks.');
    }
    const kept = state.blocks.filter(({ id }) => state.kept.has(id));
    const replaceable = state.blocks.filter(({ id }) => !state.kept.has(id));
    const exclusions = [...state.exclusions, ...kept.map(({ bounds }) => bounds)];
    const original = state;
    const jobId = ++nextJob;
    const worker = new Worker(new URL('./omr-worker.js', import.meta.url), { type: 'module' });
    state.discoveryWorker = worker;
    discoveryMessage('processing', 'Finding page corners and bubble blocks…');
    say('');
    show();
    function finish(result) {
      if (state !== original || state.discoveryWorker !== worker) return;
      stopDiscovery();
      if (!result || result.status === 'needs-corners') {
        if (!state.matrix) state.corners = result?.corners ?? [];
        if (!state.blocks.length) state.discoveryIssues = ['page-corners'];
        discoveryMessage('needs-corners', 'Page corners could not be used for discovery. Place or adjust them, then find the blocks again.');
        show();
        return;
      }
      state.corners = result.corners;
      const matrix = result.poseDiagnostics?.transform ?? pageTransform(page(), state.corners);
      if (!matrix) {
        discoveryMessage('needs-corners', 'Place the page corners before finding response blocks.');
        show();
        return;
      }
      state.matrix = matrix;
      state.region = null;
      state.grid = null;
      state.editing = null;
      const ids = new Set(kept.flatMap(({ id, items }) => [id, ...items.flatMap((item) => [item.id,
        ...(item.slots ?? []).map(({ id: slot }) => slot)])]));
      const counters = { mc: 1, nr: 1 };
      const added = result.components.map((block) => {
        let id = block.id;
        while (ids.has(id)) id += '-new';
        ids.add(id);
        const items = block.items.map((item) => {
          let itemId, slots;
          do {
            itemId = item.kind.toUpperCase() + counters[item.kind]++;
            slots = item.slots?.map((slot, i) => ({ ...slot, id: `${itemId}.${i + 1}` }));
          } while (ids.has(itemId) || slots?.some((slot) => ids.has(slot.id)));
          ids.add(itemId);
          slots?.forEach((slot) => ids.add(slot.id));
          return { ...item, id: itemId, ...(slots ? { slots } : {}) };
        });
        return { ...block, id, items };
      });
      for (const id of state.drafts.keys()) if (!state.kept.has(id)) state.drafts.delete(id);
      state.blocks = [...kept, ...added];
      state.discoveryStale = false;
      if (state.scope) byId('mc-completeness').value = '';
      state.discoveryDiagnostics = [
        ...(state.discoveryDiagnostics ?? []).filter(({ id }) => state.kept.has(id)),
        ...(result.diagnostics ?? []).map((data) => ({
          ...data, id: added[result.components.findIndex(({ id }) => id === data.id)]?.id ?? data.id,
        })),
      ];
      state.discoveryIssues = kept.length && result.issues.length === 1 && result.issues[0] === 'no-grid' ? [] : result.issues;
      if (state.discoveryIssues.length) recheckCoverage();
      discoveryStatus.dataset.pose = result.pagePose ?? 'page-boundary';
      canvas.dataset.pose = discoveryStatus.dataset.pose;
      closeMapping();
      rectifiedOnCanvas(background, state.image, matrix, page(), result.pagePose === 'virtual-corners');
      lists();
      const count = state.blocks.length;
      const instructions = result.pagePose === 'uncertain'
        ? 'The page does not line up with the photo frame. Adjust the corner handles before saving a template.'
        : result.pagePose === 'virtual-corners'
        ? `Aligned ${count} response blocks from visible bubbles. Check the full layout, numbering and symbol order in the overlay.`
        : count
        ? `Found ${count} response block${count === 1 ? '' : 's'}. Check the page orientation, numbering and symbol order in the overlay.`
        : 'No complete response blocks were found. Place the expected blocks manually.';
      const progress = kept.length && !state.discoveryIssues.length ? 'proposed' : result.status;
      const mcBlocks = (blocks) => blocks.filter(({ kind }) => kind === 'mc').length;
      const describe = (blocks) => `${mcBlocks(blocks)} blocks / ${mcCount(blocks)} questions`;
      const replaced = replaceable.filter((old) => added.some((block) => block.kind === old.kind &&
        intersects(old.bounds, block.bounds)));
      const removed = replaceable.filter((block) => !replaced.includes(block));
      const mcSummary = state.scope ? ` MC mapping (${mcCount(state.blocks)} questions): preserved ${describe(kept)}; ` +
        `discovered ${describe(added)}; prior proposals replaced ${describe(replaced)}, removed ${describe(removed)}.` : '';
      discoveryMessage(progress, instructions + mcSummary +
        (state.discoveryIssues.length ? ' ' + describeIssues(state.discoveryIssues) : ''));
      show();
    }
    worker.addEventListener('message', ({ data }) => { if (data?.jobId === jobId) finish(data.result); });
    worker.addEventListener('error', () => finish());
    worker.addEventListener('messageerror', () => finish());
    try {
      worker.postMessage({
        type: 'discover-layout', jobId, page: page(),
        corners: useExistingCorners && canvas.dataset.pose !== 'virtual-corners' ? state.corners : undefined,
        options: { scope: state.scope, exclusions },
        image: { id: state.image.id, width: state.image.width, height: state.image.height, pixels: state.image.pixels.data },
      });
    } catch { finish(); }
  }

  function pointAt(event) {
    const bounds = canvas.getBoundingClientRect();
    const space = state.matrix ? page() : state.image;
    return {
      x: Math.max(0, Math.min(space.width - .01, (event.clientX - bounds.left) * space.width / bounds.width)),
      y: Math.max(0, Math.min(space.height - .01, (event.clientY - bounds.top) * space.height / bounds.height)),
    };
  }

  function setRegion(region) {
    if (!validBounds(region)) throw new TypeError('Give the box a positive width and height.');
    const frame = page();
    if (region.x < 0 || region.y < 0 || region.x + region.width > frame.width || region.y + region.height > frame.height) {
      throw new TypeError('Keep the box within the blank sheet.');
    }
    state.region = region;
    for (const [key, field] of Object.entries(region)) write('region-' + key, field);
    paint();
    return region;
  }

  function inputRegion() {
    return setRegion({ x: number('region-x'), y: number('region-y'), width: number('region-width'), height: number('region-height') });
  }

  function counts() { return { rows: number('grid-rows'), columns: number('grid-columns') }; }

  function axes() {
    return {
      topLeft: coordinates(number('grid-first-x'), number('grid-first-y')),
      topRight: coordinates(number('grid-across-x'), number('grid-across-y')),
      bottomLeft: coordinates(number('grid-down-x'), number('grid-down-y')),
      ...counts(), radius: number('grid-radius'),
    };
  }

  function setEndpoints(topLeft, topRight, bottomLeft, radius) {
    write('grid-first-x', topLeft.x); write('grid-first-y', topLeft.y);
    write('grid-across-x', topRight.x); write('grid-across-y', topRight.y);
    write('grid-down-x', bottomLeft.x); write('grid-down-y', bottomLeft.y);
    write('grid-radius', radius);
    const { rows, columns } = counts();
    const dx = topRight.x - topLeft.x, dy = topRight.y - topLeft.y;
    write('grid-column-spacing', Math.hypot(dx, dy) / Math.max(1, columns - 1));
    write('grid-row-spacing', Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y) / Math.max(1, rows - 1));
    write('grid-angle', Math.atan2(dy, dx) * 180 / Math.PI);
  }

  function defaultAxes(region, radius) {
    const inset = radius + 1;
    const first = { x: region.x + inset, y: region.y + inset };
    const across = { x: region.x + region.width - inset, y: first.y };
    const down = { x: first.x, y: region.y + region.height - inset };
    return [first, across, down];
  }

  function labelGrid(grid) {
    const kind = value('block-kind');
    const transpose = value('grid-axis') === 'columns';
    const order = value('grid-symbols').split(',').map((symbol) => symbol.trim()).filter(Boolean);
    const decimalSlots = new Set(value('decimal-slots').split(',').map((index) => Number(index.trim())));
    const slotCount = transpose ? grid.rows : grid.columns;
    if (kind === 'nr' && slotCount !== 4) throw new TypeError('An NR grid needs exactly four slot columns or rows.');
    const expectedSymbols = kind === 'mc' ? (transpose ? grid.rows : grid.columns) : (transpose ? grid.columns : grid.rows);
    if (order.length !== expectedSymbols) throw new TypeError('Enter one symbol per printed choice row or column.');
    const reversed = byId('reverse-grid-order').checked;
    for (const cell of grid.cells) {
      const symbolIndex = kind === 'mc' ? (transpose ? cell.row : cell.column) : (transpose ? cell.column : cell.row);
      const index = kind === 'mc' ? (transpose ? cell.column : cell.row) : (transpose ? cell.row : cell.column);
      const total = kind === 'mc' ? (transpose ? grid.columns : grid.rows) : slotCount;
      cell.symbol = order[symbolIndex];
      cell.order = reversed ? total - index - 1 : index;
      cell.omit = kind === 'nr' && cell.symbol === '.' && !decimalSlots.has(cell.order + 1);
    }
  }

  function assignGrid(grid, auto = false) {
    if (grid !== state.grid) clearMcFit();
    state.grid = grid;
    labelGrid(grid);
    updateCellSelector();
    paint();
    const missing = grid.cells.filter((cell) => cell.missing && !cell.omit).length;
    if (auto) say(`${grid.cells.filter((cell) => !cell.missing && !cell.omit).length} printed bubbles found. ${missing ? missing + ' expected places need adjustment.' : 'Review positions and symbols before confirming.'}`);
    else say('Check the grid overlay and correct any exceptions before confirming.');
  }

  function detect() {
    const region = inputRegion();
    if (value('block-kind') === 'nr' && !state.editing) {
      const { block, count, incomplete } = discoverBoxedAlberta(state.image, state.matrix, page(), region);
      if (count > 1 || incomplete) {
        state.grid = null;
        byId('cell-selector').replaceChildren();
        paint();
        return say(count > 1
          ? 'Found multiple NR questions. Draw around one question at a time, including its decimal bubbles.'
          : 'The NR grid is incomplete. Include all ten digit rows and both decimal bubbles, or use the grid controls to correct it.');
      }
      if (block) {
        const prefix = value('item-prefix');
        const start = number('item-start');
        restoreExisting(block);
        byId('item-prefix').value = prefix;
        write('item-start', start);
        setRegion(block.bounds);
        updateCellSelector();
        return say('Found 42 printed NR bubbles, including decimals in slots 2 and 3. Review the mapping and confirm this block.');
      }
    }
    const { rows, columns } = counts();
    const proposal = proposeGrid(state.image, state.matrix, region, { rows, columns, printedCenters: value('block-kind') === 'nr' });
    if (!proposal.cells.length) throw new TypeError('No reliable bubble lattice was found. Adjust the box or place the grid manually.');
    const known = new Map(proposal.cells.map((cell) => [`${cell.row}/${cell.column}`, cell]));
    const absent = new Map(proposal.missing.map((cell) => [`${cell.row}/${cell.column}`, cell]));
    const radius = proposal.radius;
    const estimated = defaultAxes(region, radius);
    const at = (row, column) => known.get(`${row}/${column}`) ?? absent.get(`${row}/${column}`);
    const topLeft = at(0, 0) ?? estimated[0];
    const topRight = at(0, columns - 1) ?? estimated[1];
    const bottomLeft = at(rows - 1, 0) ?? estimated[2];
    setEndpoints(topLeft, topRight, bottomLeft, radius);
    const preview = manualGrid(axes());
    preview.cells = preview.cells.map((fallback) => {
      const key = `${fallback.row}/${fallback.column}`;
      return known.get(key) ?? { ...fallback, ...absent.get(key), radius, missing: true };
    });
    assignGrid(preview, true);
  }

  function fitMcBlock() {
    const region = inputRegion();
    if (state.editing) throw new Error('Cancel the open block edit before fitting a box.');
    if (state.exclusions.some((zone) => intersects(region, zone))) {
      throw new Error('The box crosses a discovery exclusion. Tighten the box or edit the exclusion.');
    }
    const { rows, columns } = counts();
    if (!Number.isInteger(columns) || columns < 2 || columns > 13) throw new Error('Enter 2–13 choices.');
    const fit = proposeGrid(state.image, state.matrix, region, { rows, columns });
    if (fit.rows !== rows || fit.columns !== columns || fit.conflicts.length) {
      throw new Error(`Found ${fit.rows} rows and ${fit.columns} choice columns. Tighten the box or fit a smaller group. For a regular group with whole rows missing, use the three endpoints.`);
    }
    const inside = (point) => point.x >= region.x && point.x <= region.x + region.width &&
      point.y >= region.y && point.y <= region.y + region.height;
    const overlapping = state.blocks.filter((block) => intersects(region, block.bounds));
    const protectedBlock = overlapping.find((block) => state.kept.has(block.id));
    if (protectedBlock) throw new Error(`The box overlaps kept block ${itemLabel(protectedBlock)}. Release it if you intend to replace it, or tighten the box.`);
    const partlyCovered = overlapping.find((block) => block.kind !== 'mc' ||
      !block.items.every((item) => item.choices.every(inside)));
    if (partlyCovered) throw new Error(`The box overlaps ${itemLabel(partlyCovered)} and cannot replace it as drawn. ` +
      'Draw around the whole MC block, or remove the proposal if it includes incorrect rows.');
    if (fit.missing.some((missing) => fit.cells.filter(({ row }) => row === missing.row).length < 2 ||
        fit.cells.filter(({ column }) => column === missing.column).length < 2)) {
      throw new Error('Some estimated positions have too little support. Fit a smaller block or use the endpoint controls.');
    }
    const used = new Set();
    const previous = overlapping.flatMap(({ items }) => items.flatMap(({ choices }) => choices));
    const cellsToFit = [...fit.cells, ...fit.missing.map((cell) => ({ ...cell, radius: fit.radius, missing: true }))];
    const retained = cellsToFit.map((cell) => {
      const nearest = previous.filter((choice) => !used.has(choice))
        .map((choice) => ({ choice, distance: Math.hypot(choice.x - cell.x, choice.y - cell.y) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest || nearest.distance > cell.radius * .60) return cell;
      used.add(nearest.choice);
      return { ...cell, ...nearest.choice, missing: false };
    });
    const cells = retained.sort((a, b) => a.row - b.row || a.column - b.column);
    byId('block-kind').value = 'mc';
    byId('item-prefix').value = 'MC';
    byId('grid-axis').value = 'rows';
    byId('reverse-grid-order').checked = false;
    byId('grid-symbols').value = Array.from({ length: columns }, (_, i) => String.fromCharCode(65 + i)).join(',');
    const estimated = cells.filter((cell) => cell.missing).length;
    assignGrid({ rows, columns, cells }, true);
    state.fittedMc = { region: Object.fromEntries(['x', 'y', 'width', 'height'].map((field) => [field, number('region-' + field)])), replacements: overlapping.map(({ id }) => id) };
    const summary = `${cells.length - estimated} detected bubbles, ${estimated} estimated positions, ${used.size} prior positions retained. ` +
      (overlapping.length ? `Confirming replaces ${overlapping.map(itemLabel).join(', ')}. ` : '') +
      (estimated ? 'Compare the orange estimates with the sheet before accepting them.' : 'Check the overlay and confirm the block.');
    byId('mc-fit-status').textContent = summary;
    byId('accept-mc-fit').hidden = !estimated;
  }

  function clearMcFit() {
    state.fittedMc = null;
    byId('accept-mc-fit').hidden = true;
    byId('mc-fit-status').textContent = '';
  }

  function makeDefault() {
    const region = inputRegion();
    const radius = number('grid-radius');
    setEndpoints(...defaultAxes(region, radius), radius);
    assignGrid(manualGrid(axes()));
  }

  function makeSpaced() {
    const { topLeft, rows, columns, radius } = axes();
    const angle = number('grid-angle') * Math.PI / 180;
    const across = number('grid-column-spacing') * (columns - 1);
    const down = number('grid-row-spacing') * (rows - 1);
    const topRight = { x: topLeft.x + Math.cos(angle) * across, y: topLeft.y + Math.sin(angle) * across };
    const bottomLeft = { x: topLeft.x - Math.sin(angle) * down, y: topLeft.y + Math.cos(angle) * down };
    setEndpoints(topLeft, topRight, bottomLeft, radius);
    assignGrid(manualGrid(axes()));
  }

  function updateCellSelector() {
    const dropdown = byId('cell-selector');
    dropdown.replaceChildren(...state.grid.cells.map((cell, index) =>
      new Option(`Row ${cell.row + 1}, column ${cell.column + 1} · ${cell.symbol || '?'}${cell.omit ? ' (omitted)' : ''}`, String(index))));
    selectCell();
  }

  function selectCell() {
    const cell = state.grid?.cells[Number(value('cell-selector'))];
    if (!cell) return;
    write('cell-x', cell.x); write('cell-y', cell.y); write('cell-radius', cell.radius);
    byId('cell-symbol').value = cell.symbol;
    byId('cell-omit').checked = cell.omit;
  }

  function applyCell() {
    const index = Number(value('cell-selector'));
    const cell = state.grid?.cells[index];
    if (!cell) throw new TypeError('Place a grid before changing a position.');
    Object.assign(cell, {
      x: number('cell-x'), y: number('cell-y'), radius: number('cell-radius'), symbol: value('cell-symbol').trim(),
      omit: byId('cell-omit').checked, missing: false,
    });
    updateCellSelector();
    byId('cell-selector').value = String(index);
    selectCell();
    paint();
  }

  function smallerBounds(cells, enclosing) {
    const left = Math.max(enclosing.x, Math.min(...cells.map((cell) => cell.x - cell.radius * 1.30)));
    const right = Math.min(enclosing.x + enclosing.width, Math.max(...cells.map((cell) => cell.x + cell.radius * 1.30)));
    const top = Math.max(enclosing.y, Math.min(...cells.map((cell) => cell.y - cell.radius * 1.30)));
    const bottom = Math.min(enclosing.y + enclosing.height, Math.max(...cells.map((cell) => cell.y + cell.radius * 1.30)));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function confirmBlock() {
    if (!state.grid) throw new TypeError('Draw a response box and find or place a bubble grid before confirming.');
    if (state.fittedMc && (counts().rows !== state.grid.rows || counts().columns !== state.grid.columns ||
        ['x', 'y', 'width', 'height'].some((field) => state.fittedMc.region[field] !== number('region-' + field)))) {
      throw new Error('The box or grid counts changed. Fit the new box before confirming.');
    }
    const bounds = inputRegion();
    const kind = value('block-kind');
    if (state.scope && kind !== 'mc') throw new TypeError('Confirm only MC blocks in this profile.');
    const prefix = value('item-prefix').trim();
    const start = number('item-start');
    if (!/^[A-Za-z0-9_.-]{0,30}$/.test(prefix) || !Number.isInteger(start) || start < 1) {
      throw new TypeError('Use a valid item prefix and positive starting number.');
    }
    const available = state.grid.cells.filter((cell) => !cell.omit);
    const missing = available.filter((cell) => cell.missing);
    if (available.some(({ x, y, radius }) => x - radius < bounds.x || y - radius < bounds.y ||
        x + radius > bounds.x + bounds.width || y + radius > bounds.y + bounds.height)) {
      throw new TypeError('Some bubbles lie outside the response box. Expand the box or adjust the grid; the proposal is still open.');
    }
    if (missing.length) {
      const positions = missing.slice(0, 4).map(({ row, column }) => `row ${row + 1}, choice ${column + 1}`);
      throw new TypeError(`${missing.length} bubble positions are unresolved (${positions.join('; ')}). Adjust the grid or correct the missing positions before confirming.`);
    }
    const orders = [...new Set(state.grid.cells.map((cell) => cell.order))].sort((a, b) => a - b);
    const groups = orders.map((order) => available.filter((cell) => cell.order === order));
    const choices = (cells) => cells.map(({ symbol, x, y, radius }) => ({ symbol, x, y, radius }));
    const preserved = state.grid.existingIds;
    const preserveIds = preserved && prefix === preserved.prefix && start === preserved.first;
    const itemId = (index) => (preserveIds ? preserved.ids[index] : undefined) ?? `${prefix}${start + index}`;
    const items = kind === 'mc'
      ? groups.map((cells, index) => ({
        id: itemId(index), kind, bounds: smallerBounds(cells, bounds), choices: choices(cells),
      }))
      : [{ id: itemId(0), kind, bounds, slots: groups.map((cells, index) => ({
        id: `${itemId(0)}.${index + 1}`, choices: choices(cells),
      })) }];
    const block = { id: state.editing ?? idFor('block'), kind, bounds, items };
    const replaced = state.fittedMc?.replacements ?? [];
    if (replaced.some((id) => state.kept.has(id))) throw new Error('A block targeted by the fit is now kept. Refit the box.');
    const next = state.blocks.filter(({ id }) => id !== block.id && !replaced.includes(id));
    const oldIndex = state.blocks.findIndex(({ id }) => id === block.id);
    next.splice(oldIndex < 0 ? next.length : oldIndex, 0, block);
    const overlaps = next.filter((other) => other !== block && intersects(bounds, other.bounds));
    if (overlaps.length) {
      throw new TypeError(`This box overlaps ${overlaps.map(itemLabel).join(', ')}. Tighten the box or edit the existing block.`);
    }
    const duplicate = duplicateDetails(next);
    if (duplicate) throw new TypeError(`Duplicate identifiers. ${duplicate}. Change the starting number or renumber the conflicting block. The grid is still open.`);
    // Validate the mapping when each block is confirmed.
    createMarkerlessProfile({
      id: 'draft', revision: 1, name: 'Draft', page: page(), components: next,
    });
    state.blocks = next;
    for (const id of replaced) state.drafts.delete(id);
    clearMcFit();
    state.kept.add(block.id);
    if (state.blocks.every(({ id }) => state.kept.has(id))) state.discoveryStale = false;
    state.drafts.set(block.id, {
      grid: structuredClone(state.grid), fields: Object.fromEntries([
        'block-kind', 'grid-axis', 'grid-symbols', 'decimal-slots', 'item-prefix', 'item-start',
        'grid-rows', 'grid-columns', 'grid-first-x', 'grid-first-y', 'grid-across-x', 'grid-across-y',
        'grid-down-x', 'grid-down-y', 'grid-radius', 'grid-column-spacing', 'grid-row-spacing', 'grid-angle',
      ].map((id) => [id, value(id)])), reverse: byId('reverse-grid-order').checked,
    });
    state.editing = null;
    state.grid = null;
    state.region = null;
    recheckCoverage();
    byId('block-confirm-status').textContent = 'Block confirmed.';
    write('item-start', start + items.length);
    byId('cell-selector').replaceChildren();
    lists();
    show(`Confirmed ${items.length} ${kind.toUpperCase()} item${items.length === 1 ? '' : 's'}. Draw the next block or save the profile.`);
  }

  function restoreExisting(block) {
    const mc = block.kind === 'mc';
    const grouped = mc ? block.items.map(({ choices }) => choices) : block.items[0].slots.map(({ choices }) => choices);
    const symbols = mc ? grouped.reduce((longest, choices) => choices.length > longest.length ? choices : longest, []).map(({ symbol }) => symbol) :
      [...new Set(grouped.flatMap((choices) => choices.map(({ symbol }) => symbol)))];
    const rows = mc ? grouped.length : symbols.length;
    const columns = mc ? symbols.length : 4;
    const items = block.items.map(({ id }) => id);
    const numberSuffix = /^(.*?)([0-9]+)$/.exec(items[0]);
    const prefix = numberSuffix?.[1] ?? items[0];
    const first = Number(numberSuffix?.[2] ?? 1);
    const radius = grouped.flat()[0].radius;
    const [topLeft, topRight, bottomLeft] = defaultAxes(block.bounds, radius);
    const fallback = manualGrid({ topLeft, topRight, bottomLeft, rows, columns, radius });
    fallback.cells = fallback.cells.map((cell) => {
      const order = mc ? cell.row : cell.column;
      const symbolIndex = mc ? cell.column : cell.row;
      const choice = mc ? grouped[order][symbolIndex] : grouped[order].find(({ symbol }) => symbol === symbols[symbolIndex]);
      return { ...cell, ...choice, symbol: choice?.symbol ?? symbols[symbolIndex], order, omit: !choice };
    });
    fallback.existingIds = { ids: items, prefix, first };
    byId('block-kind').value = block.kind;
    byId('grid-axis').value = 'rows';
    byId('grid-symbols').value = symbols.join(',');
    byId('grid-rows').value = String(rows);
    byId('grid-columns').value = String(columns);
    byId('item-prefix').value = prefix;
    byId('item-start').value = String(first);
    byId('reverse-grid-order').checked = false;
    byId('decimal-slots').value = mc ? '' : grouped.flatMap((choices, index) =>
      choices.some(({ symbol }) => symbol === '.') ? [index + 1] : []).join(',');
    setEndpoints(topLeft, topRight, bottomLeft, radius);
    state.grid = fallback;
  }

  function chooseDraft(block) {
    clearMcFit();
    state.editing = block.id;
    try {
      const saved = state.drafts.get(block.id);
      if (saved) {
        for (const [id, content] of Object.entries(saved.fields)) byId(id).value = content;
        byId('reverse-grid-order').checked = saved.reverse;
        state.grid = structuredClone(saved.grid);
      } else restoreExisting(block);
      byId('decimal-slots-label').hidden = block.kind !== 'nr';
      setRegion(block.bounds);
      updateCellSelector();
      show('Edit the box, grid or individual bubbles, then confirm this block again.');
    } catch (error) { state.editing = null; say(error.message); }
  }

  function listEntry(list, caption, actions) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = caption;
    const controls = document.createElement('div');
    controls.className = 'block-actions';
    for (const [label, run, action] of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (action) button.dataset.action = action;
      button.addEventListener('click', () => {
        try { run(); }
        catch (error) { say(error.message); }
        finally { renderSaveStatus(); }
      });
      controls.append(button);
    }
    item.append(title, controls);
    list.append(item);
    return item;
  }

  function closeMapping() {
    mappingPanel.hidden = true;
    renumberPanel.hidden = true;
    mappingFields.replaceChildren();
    if (state) {
      state.mappingBlock = null;
      state.renumberBlock = null;
    }
  }

  function startRenumber(block) {
    if (state.grid || state.editing) return say('Confirm or cancel the open geometry edits first.');
    closeMapping();
    state.renumberBlock = block.id;
    byId('renumber-block-heading').textContent = `Renumber ${itemLabel(block)}`;
    const first = byId('block-first-number');
    first.value = /[0-9]+$/.exec(block.items[0].id)?.[0] ?? '1';
    renumberPanel.hidden = false;
    first.focus();
  }

  function saveRenumber() {
    const block = state.blocks.find(({ id }) => id === state.renumberBlock);
    if (!block) return;
    state.blocks = renumberProfileBlock(page(), state.blocks, block.id, number('block-first-number'), { draft: true });
    state.kept.add(block.id);
    state.drafts.delete(block.id);
    closeMapping();
    lists();
    paint();
    say(conflictStatus.hidden ? 'Item numbers updated. Confirm and save the template to keep them.' :
      'Item numbers updated in this draft. Resolve the duplicate numbers before saving.');
  }

  function editMapping(block) {
    closeMapping();
    state.mappingBlock = block.id;
    function field(name, current, attribute, index) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.dataset[attribute] = String(index);
      input.value = current;
      label.append(name, input);
      mappingFields.append(label);
    }
    for (const [i, item] of block.items.entries()) {
      field(`Item ${i + 1} ID`, item.id, 'mapItem', i);
      if (item.kind === 'mc') {
        field('Choice symbols in printed order', item.choices.map(({ symbol }) => symbol).join(','), 'mapChoices', i);
      } else {
        for (const [slot, entry] of item.slots.entries()) {
          field(`Slot ${slot + 1} symbols, top to bottom`, entry.choices.map(({ symbol }) => symbol).join(','),
            'mapSlot', 1 + slot + i * 4);
        }
        field('Positions in output order', '1,2,3,4', 'mapOrder', i);
      }
    }
    mappingPanel.hidden = false;
    mappingFields.querySelector('input').focus();
  }

  function saveMapping() {
    const block = state.blocks.find(({ id }) => id === state.mappingBlock);
    if (!block) return;
    const input = (attribute, index) => mappingFields.querySelector(`[data-${attribute}="${index}"]`).value.trim();
    function mappedChoices(choices, literal) {
      const symbols = literal.split(',').map((symbol) => symbol.trim());
      if (symbols.length !== choices.length || symbols.some((symbol) => !symbol)) {
        throw new TypeError('Enter one comma-separated symbol for every bubble in that position.');
      }
      return choices.map((choice, index) => ({ ...choice, symbol: symbols[index] }));
    }
    const items = block.items.map((item, index) => {
      const id = input('map-item', index);
      if (item.kind === 'mc') return { ...item, id, choices: mappedChoices(item.choices, input('map-choices', index)) };
      const order = input('map-order', index).split(',').map((slot) => Number(slot.trim()));
      if (order.length !== 4 || new Set(order).size !== 4 || order.some((slot) => ![1, 2, 3, 4].includes(slot))) {
        throw new TypeError('List all four positions once, in output order.');
      }
      const slots = order.map((physical, output) => ({
        id: `${id}.${output + 1}`,
        choices: mappedChoices(item.slots[physical - 1].choices, input('map-slot', physical + index * 4)),
      }));
      return { ...item, id, slots };
    });
    const components = state.blocks.map((entry) => entry === block ? { ...block, items } : entry);
    createMarkerlessProfile({ id: 'draft', revision: 1, name: 'Draft', page: page(), components });
    state.blocks = components;
    state.kept.add(block.id);
    state.drafts.delete(block.id);
    closeMapping();
    lists(); paint();
    say('Numbering and symbols updated. Check the overlay before saving.');
  }

  function lists() {
    const conflicts = conflictingResponseIds(state.blocks);
    conflictStatus.hidden = conflicts.size === 0;
    conflictStatus.textContent = conflicts.size ? `Duplicate identifiers. ${duplicateDetails(state.blocks)}. Renumber the affected blocks.` : '';
    renderSaveStatus();
    const zones = byId('profile-exclusions');
    zones.replaceChildren();
    state.exclusions.forEach((bounds, index) => {
      const row = listEntry(zones, `Exclusion ${index + 1}`, [
        ['Edit', () => {
          if (state.discoveryWorker || state.grid || state.editing) return;
          state.exclusionEdit = index;
          setRegion(bounds);
          show('Resize or redraw the exclusion, then save the box.');
        }],
        ['Remove', () => {
          if (state.discoveryWorker) return;
          state.exclusions.splice(index, 1);
          state.discoveryStale = state.blocks.some(({ id }) => !state.kept.has(id));
          state.exclusionEdit = undefined;
          state.region = null;
          lists();
          show('Exclusion removed. Find blocks again to search that area.');
        }],
      ]);
      row.dataset.exclusion = String(index);
    });
    blocksList.replaceChildren();
    for (const [index, block] of state.blocks.entries()) {
      const move = (delta) => {
        const target = index + delta;
        [state.blocks[index], state.blocks[target]] = [state.blocks[target], state.blocks[index]];
        lists(); paint();
      };
      const caption = itemLabel(block) + (block.kind === 'nr' ? ' · Numerical response' : ' · Multiple choice') +
        (state.kept.has(block.id) ? ' · Kept' : ' · Replaceable on rediscovery');
      const row = listEntry(blocksList, caption, [
        [state.kept.has(block.id) ? 'Release block for rediscovery' : 'Keep block on rediscovery', () => {
          if (state.discoveryWorker) return;
          const releasing = state.kept.delete(block.id);
          if (!releasing) state.kept.add(block.id);
          lists();
          say(releasing ? `${itemLabel(block)} stays on the sheet. The next discovery may replace or remove it.` :
            `${itemLabel(block)} will be preserved during discovery.`);
        }, 'keep-block'],
        ['Renumber block', () => startRenumber(block), 'renumber-block'],
        ['Edit numbering and symbols', () => editMapping(block)],
        ['Edit block', () => chooseDraft(block)],
        ...(index ? [['Move up', () => move(-1)]] : []),
        ...(index + 1 < state.blocks.length ? [['Move down', () => move(1)]] : []),
        ['Remove', () => {
          state.kept.delete(block.id);
          state.drafts.delete(block.id);
          state.blocks.splice(index, 1);
          if (state.blocks.every(({ id }) => state.kept.has(id))) state.discoveryStale = false;
          if (state.editing === block.id) clearBlockEdit();
          recheckCoverage();
          closeMapping();
          lists();
          show(`Removed ${itemLabel(block)} (${block.items.length} questions). ${mcCount(state.blocks)} MC questions remain.`);
        }],
      ]);
      row.dataset.profileBlock = block.id;
      row.dataset.blockKind = block.kind;
      row.dataset.numberingConflict = String(conflicts.has(block.id) || block.items.some(({ id, slots }) =>
        conflicts.has(id) || slots?.some((slot) => conflicts.has(slot.id))));
    }
  }

  function handle(id, action) {
    byId(id).addEventListener('click', () => {
      if (!state) return;
      try { action(); }
      catch (error) {
        say(error.message);
        if (id === 'confirm-block') byId('block-confirm-status').textContent = error.message;
      } finally {
        if (state) renderSaveStatus();
      }
    });
  }
  handle('editor-zoom-out', () => { state.zoom = Math.max(1, state.zoom - 1); paint(); });
  handle('editor-zoom-in', () => { state.zoom = Math.min(3, state.zoom + 1); paint(); });
  handle('editor-pan', () => {
    state.pan = !state.pan;
    byId('editor-pan').setAttribute('aria-pressed', String(state.pan));
    paint();
    say(state.pan ? 'Drag to pan the preview.' : 'Tap corners or drag a region on the sheet.');
  });
  handle('reset-blank-corners', beginCornerEdit);
  handle('cancel-blank-corners', cancelCornerEdit);
  handle('apply-blank-corners', confirmCorners);
  handle('discover-layout', () => findLayout(state.corners.length === 4));
  handle('rediscover-layout', () => findLayout(state.corners.length === 4));
  handle('add-exclusion', () => {
    if (state.discoveryWorker || state.grid || state.editing) throw new Error('Finish the current block edit first.');
    const bounds = inputRegion();
    if (state.exclusionEdit === undefined) {
      if (state.exclusions.length >= 24) throw new Error('Use up to 24 exclusion zones.');
      state.exclusions.push(bounds);
    } else state.exclusions[state.exclusionEdit] = bounds;
    state.exclusionEdit = undefined;
    state.region = null;
    state.discoveryStale = state.blocks.some(({ id }) => !state.kept.has(id));
    lists();
    const overlaps = state.blocks.some((block) => state.kept.has(block.id) && intersects(bounds, block.bounds));
    show(overlaps ? 'Exclusion saved. The overlapping kept block is still mapped.' :
      'Exclusion saved. Find blocks outside exclusions to update the proposal.');
  });
  handle('cancel-exclusion-edit', () => {
    state.exclusionEdit = undefined;
    state.region = null;
    show('Exclusion edit canceled.');
  });
  byId('profile-mc-only').onchange = (event) => {
    if (!state) return;
    if (event.target.checked && state.blocks.some((block) => block.kind !== 'mc' && state.kept.has(block.id))) {
      event.target.checked = false;
      return say('Remove kept NR blocks before switching this template to MC-only grading.');
    }
    state.scope = event.target.checked ? 'mc-only' : undefined;
    arrangeBlockOptions();
    byId('mc-completeness').value = '';
    state.discoveryStale = state.blocks.some(({ id }) => !state.kept.has(id));
    if (state.scope && value('block-kind') === 'nr' && !state.grid) {
      byId('block-kind').value = 'mc';
      byId('block-kind').dispatchEvent(new Event('change'));
    }
    show(state.scope ? 'Review the MC overlay, or draw a box to fit each incomplete block.' :
      'Find blocks again after updating the exclusions, or review the existing response blocks.');
  };
  handle('clear-discovery', () => {
    stopDiscovery();
    const removed = state.blocks.filter(({ id }) => !state.kept.has(id));
    state.blocks = state.blocks.filter(({ id }) => state.kept.has(id));
    if (removed.length) recheckCoverage();
    state.discoveryStale = false;
    for (const id of state.drafts.keys()) if (!state.kept.has(id)) state.drafts.delete(id);
    clearMcFit();
    state.grid = null;
    state.region = null;
    state.editing = null;
    state.endpoints = null;
    state.discoveryIssues = [];
    state.discoveryDiagnostics = state.discoveryDiagnostics.filter(({ id }) => state.kept.has(id));
    closeMapping();
    discoveryMessage('idle');
    lists(); show(`Cleared ${removed.length} proposals, including ${mcCount(removed)} MC questions. Kept blocks remain. Draw a missing block or find blocks again.`);
  });
  handle('review-discovery', () => {
    state.discoveryIssues = [];
    if (state.scope) recheckCoverage();
    else state.blocks.forEach(({ id }) => state.kept.add(id));
    state.discoveryStale = false;
    lists();
    discoveryMessage('manual-review', 'Discovery warning acknowledged. Compare the overlay with the sheet. Draw missing questions or correct a block, then review MC coverage before saving.');
  });
  handle('apply-block-mapping', saveMapping);
  handle('cancel-block-mapping', closeMapping);
  handle('apply-block-renumber', saveRenumber);
  handle('cancel-block-renumber', closeMapping);
  handle('preview-region', () => { inputRegion(); say('Box previewed.'); });
  handle('detect-grid', detect);
  handle('fit-mc-grid', () => {
    try { fitMcBlock(); } catch (error) {
      byId('mc-fit-status').textContent = error.message;
      throw error;
    }
  });
  handle('accept-mc-fit', () => {
    if (!state.fittedMc) return;
    const estimates = state.grid.cells.filter((cell) => cell.missing);
    for (const cell of estimates) cell.missing = false;
    byId('accept-mc-fit').hidden = true;
    byId('mc-fit-status').textContent = `${estimates.length} estimated positions accepted. Confirm this block to use the mapping.`;
    paint();
  });
  handle('manual-grid', makeDefault);
  handle('apply-grid-endpoints', () => assignGrid(manualGrid(axes())));
  handle('apply-grid-spacing', makeSpaced);
  handle('pick-grid-endpoints', () => { state.endpoints = []; say('Tap first cell, last in first row, then last in first column.'); });
  handle('assign-grid-labels', () => {
    if (!state.grid) throw new TypeError('Place a grid before assigning labels.');
    assignGrid(state.grid);
  });
  handle('apply-cell', applyCell);
  function clearBlockEdit() {
    clearMcFit();
    state.grid = null;
    state.editing = null;
    state.endpoints = null;
    state.region = null;
    byId('cell-selector').replaceChildren();
    byId('block-confirm-status').textContent = '';
  }
  handle('confirm-block', confirmBlock);
  handle('cancel-block-edit', () => {
    clearBlockEdit();
    show('Block edit canceled. The confirmed mappings were preserved.');
  });
  byId('profile-name').oninput = renderSaveStatus;
  byId('mc-expected-count').oninput = () => {
    byId('mc-completeness').value = '';
    renderSaveStatus();
  };
  byId('mc-completeness').onchange = () => {
    const { expected, invalid, mismatch } = mcCoverage();
    if (value('mc-completeness') === 'complete' && expected !== null && !invalid && !mismatch &&
        state.blocks.every(({ id }) => state.kept.has(id)) && state.discoveryIssues.length &&
        !state.discoveryIssues.some((issue) => issue === 'page-corners' || issue === 'frame-aspect')) {
      state.discoveryIssues = [];
      state.discoveryDiagnostics = [];
      discoveryMessage('manual-review', `Reviewed mapping covers all ${expected} expected MC questions.`);
      paint();
    }
    renderSaveStatus();
  };
  handle('cancel-profile-editor', () => { close(); onClose(); });
  handle('enroll-profile', async () => {
    const blocked = saveBlocker();
    if (blocked) return say(blocked);
    try {
      const components = state.prior || !state.blocks.some(({ kind }) => kind === 'nr') ? state.blocks :
        measureNumericalBlankInk(toGrayImage(state.image), state.matrix, state.blocks);
      const printedLandmarks = enrollPrintedLandmarks(toGrayImage(state.image), state.matrix, page(), components);
      const profile = createMarkerlessProfile({
        printedLandmarks, id: state.prior?.id ?? idFor('layout'), revision: (state.prior?.revision ?? 0) + 1,
        name: value('profile-name'), page: page(), components, scope: state.scope, exclusions: state.exclusions,
        mcCompleteness: state.scope ? value('mc-completeness') || undefined : undefined,
        mcExpectedCount: state.scope ? mcCoverage().expected ?? undefined : undefined,
      });
      const draft = state;
      draft.saving = true;
      saveTemplate.disabled = true;
      try { await onSave(profile); }
      finally {
        draft.saving = false;
        if (state === draft) renderSaveStatus();
      }
    } catch (error) {
      if (state) {
        say(error.message);
        byId('template-save-status').textContent = error.message;
      }
    }
  });
  byId('profile-orientation').addEventListener('change', (event) => {
    if (!state) return;
    if (state.exclusions.length || state.kept.size) {
      event.target.value = state.orientation;
      return say('Remove existing exclusions and release kept blocks before changing orientation.');
    }
    state.orientation = event.target.value;
    resetCorners();
  });
  byId('cell-selector').addEventListener('change', selectCell);
  byId('block-kind').addEventListener('change', () => {
    const mc = value('block-kind') === 'mc';
    byId('decimal-slots-label').hidden = mc;
    byId('grid-symbols').value = mc ? 'A,B,C,D' : '.,0,1,2,3,4,5,6,7,8,9';
    byId('item-prefix').value = mc ? 'MC' : 'NR';
    write('grid-rows', mc ? 8 : 11);
    write('grid-columns', 4);
    write('item-start', 1 + (state?.blocks.filter(({ kind }) => kind === (mc ? 'mc' : 'nr'))
      .reduce((count, block) => count + block.items.length, 0) ?? 0));
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!state || state.pan || state.drag || (event.pointerType !== 'touch' && event.button !== 0)) return;
    const start = pointAt(event);
    state.drag = { start, current: start, pointerId: event.pointerId };
    if (!state.matrix) {
      state.cornerDrag = nearestCorner(canvas, state.image, state.corners, start);
      state.drag.originalCorner = state.corners[state.cornerDrag];
    }
    canvas.setPointerCapture(event.pointerId);
    paint();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (state?.drag?.pointerId !== event.pointerId) return;
    state.drag.current = pointAt(event);
    if (!state.matrix && state.cornerDrag >= 0) state.corners[state.cornerDrag] = state.drag.current;
    paint();
  });
  canvas.addEventListener('pointerup', (event) => {
    if (state?.drag?.pointerId !== event.pointerId) return;
    const end = pointAt(event);
    const { start } = state.drag;
    state.drag = null;
    if (!state.matrix) {
      if (state.cornerDrag >= 0) state.corners[state.cornerDrag] = end;
      else if (state.corners.length < 4) state.corners.push(end);
      state.cornerDrag = -1;
      show(state.corners.length < 4 ? `${state.corners.length} of 4 corners marked.` : 'Check corner order, then use these corners.');
      return;
    }
    if (state.endpoints) {
      state.endpoints.push(end);
      if (state.endpoints.length === 3) {
        try {
          setEndpoints(...state.endpoints, number('grid-radius'));
          assignGrid(manualGrid(axes()));
        } catch (error) { say(error.message); }
        state.endpoints = null;
      }
      paint();
      return;
    }
    const region = dragBox(start, end);
    if (region.width >= 2 && region.height >= 2) {
      setRegion(region);
      say('Region selected. Find bubbles or place a grid.');
    } else paint();
  });
  function cancelDrag(event) {
    if (state?.drag?.pointerId !== event.pointerId) return;
    if (!state.matrix && state.cornerDrag >= 0) state.corners[state.cornerDrag] = state.drag.originalCorner;
    state.drag = null;
    state.cornerDrag = -1;
    paint();
  }
  canvas.addEventListener('pointercancel', cancelDrag);
  canvas.addEventListener('lostpointercapture', cancelDrag);

  function open(image, prior) {
    stopDiscovery();
    state = {
      image, prior, matrix: null, zoom: 1, pan: false, blocks: structuredClone(prior?.components ?? []),
      scope: prior?.scope, coverageReview: prior?.mcCompleteness === 'partial', exclusions: structuredClone(prior?.exclusions ?? []),
      kept: new Set(prior?.components.map(({ id }) => id)),
      drafts: new Map(), discoveryIssues: [], discoveryDiagnostics: [],
    };
    clearMcFit();
    byId('mc-expected-count').value = prior?.mcExpectedCount ?? '';
    byId('profile-name').value = prior?.name ?? '';
    byId('mc-completeness').value = prior?.mcCompleteness ?? '';
    byId('block-confirm-status').textContent = '';
    byId('profile-mc-only').checked = prior?.scope === 'mc-only';
    arrangeBlockOptions();
    byId('profile-orientation').value = prior?.page.orientation ?? (image.width > image.height ? 'landscape' : 'portrait');
    state.orientation = value('profile-orientation');
    panel.hidden = false;
    byId('editor-pan').setAttribute('aria-pressed', 'false');
    resetCorners();
    if (prior) {
      state.corners = proposePageCorners(image) ?? [];
      if (state.corners.length === 4) confirmCorners();
      else say('Place four page corners in sheet order, starting at top left.');
    } else {
      try { findLayout(); }
      catch { discoveryMessage('needs-corners', 'Discovery could not start. Place the page corners and set up the response regions manually.'); }
    }
    lists();
    byId('profile-name').focus();
  }

  function close() {
    stopDiscovery();
    closeMapping();
    state = null;
    panel.hidden = true;
    canvas.width = canvas.height = background.width = background.height = 1;
    blocksList.replaceChildren();
  }

  return { open, close, get active() { return Boolean(state); } };
}
