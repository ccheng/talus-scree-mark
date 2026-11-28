import { planDiscoveryIds } from './discovery-numbering.js';
import { proposeHandwritingBoxes } from './cpas-recognition/handwriting-boxes.js';
import { enrollPrintedLandmarks } from './printed-landmarks.js';
import { pageTransform, proposePageCorners } from './markerless-registration.js';
import { conflictingResponseIds, createMarkerlessProfile, intersects, manualGrid, proposeGrid, renumberProfileBlock, validBounds } from './profile-authoring.js';
import { cross, project } from './projective.js';
import { inspectBoundedAlberta } from './alberta-nr-detection.js';
import { fitAlbertaAnchors, validateAlbertaMapping } from './alberta-nr-grid.js';
import { discoverBoxedAlberta } from './layout-discovery.js';
import { measureNumericalBlankInk } from './marks.js';
import { pageScale, startPsaDiscovery } from './psa-nr-discovery.js';
import { reconcileStructured, startStructuredDiscovery } from './psa-structured.js';
import { downloadProfileDiagnostics } from './profile-diagnostics.js';
import { toGrayImage } from './omr-image.js';

const byId = (id) => document.getElementById(id);
const value = (id) => byId(id).value;
const number = (id) => byId(id).valueAsNumber;
const write = (id, next) => { byId(id).value = Number.isFinite(next) ? Number(next.toFixed(2)) : next; };
const coordinates = (x, y) => ({ x, y });
const idFor = (prefix) => prefix + '-' + crypto.randomUUID().slice(0, 8);
const cornerLabels = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
const placementColors = { observed: '#287651', inferred: '#c05224', manual: '#245c8e' };
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
  const cpas = new URLSearchParams(location.search).get('cpas') === 'preview';
  const enrollment = byId('template-cpas-enrollment');
  const boxList = byId('template-cpas-boxes');
  const boxStatus = byId('template-cpas-box-status');
  enrollment.hidden = !cpas;
  const boxBinding = () => JSON.stringify([state.matrix, state.blocks, state.exclusions]);

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
    if (state) {
      state.discoveryWorker = null;
      state.psaJob = null;
      state.pagePsaJob = null;
    }
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
    'psa-conflicting-grids': 'Some PSA NR candidates conflicted with another block or its printed symbols. Check those regions and use a bounded fit if needed.',
    'psa-mc-review': 'Check the new orange MC rows and any estimated bubbles before keeping them.',
    'psa-type-review': 'Some MC and NR interpretations compete. Check the print, remove the incorrect block, and fit that region if needed.',
    'psa-provisional-grids': 'Check the orange PSA NR grids against the print, then choose Confirm NR grid on each correct proposal.',
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
    if (state.grid || state.editing || state.rowTarget || state.mappingBlock || state.renumberBlock ||
        state.exclusionEdit !== undefined || state.endpoints) {
      return 'Confirm or cancel the open grid, numbering, or exclusion edit.';
    }
    if (state.blocks.some(block => state.provisionalNr.has(block.id))) {
      return 'Confirm or remove each provisional NR grid before saving.';
    }
    if (state.blocks.some(block => state.numberingReview.has(block.id))) {
      return 'Check the printed MC question numbers and resolve any conflicts before saving.';
    }
    if (state.conflictRegions.some(region => region.requiresResolution)) {
      return 'Resolve or explicitly omit each unresolved discovery region before saving.';
    }
    if (!state.blocks.length) return 'Confirm at least one response block before saving.';
    if (state.scope && state.blocks.some(({ kind }) => kind !== 'mc')) {
      return 'Remove numerical response blocks or rediscover with exclusions before saving an MC-only profile.';
    }
    const { expected, mapped, invalid, mismatch } = mcCoverage();
    if (invalid) return 'Enter a whole expected question count from 1 to 1536.';
    if (mismatch && !(state.scope && value('mc-completeness') === 'partial')) {
      return `Mapped ${mapped} of ${expected} expected MC questions. Correct the mapping.`;
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

  const nrAnchors = ['left 0', 'right 0', 'left 9', 'left decimal bubble'];

  function updateNumericalControls() {
    const visible = Boolean(state.matrix && !state.scope && value('block-kind') === 'nr');
    byId('nr-fit-controls').hidden = !visible;
    const cells = state.grid?.alberta ? state.grid.cells : null;
    const missing = cells?.filter((cell) => cell.missing && !cell.omit).length ?? 0;
    byId('accept-nr-fit').hidden = !cells || !missing || Boolean(state.endpoints);
    byId('cancel-nr-discovery').hidden = !state.psaJob;
    byId('fit-nr-grid').disabled = !!state.discoveryWorker;
    byId('anchor-nr-grid').disabled = !!state.discoveryWorker;
    byId('nr-fit-status').textContent = !visible ? '' : state.psaJob ? 'Searching for the printed grid…' : state.endpoints?.alberta
      ? `Tap the ${nrAnchors[state.endpoints.length]}.`
      : cells ? `${cells.length - missing} placed · ${missing} estimates. Compare all 42 overlay rings with the print.` : '';
  }

  function renderSaveStatus() {
    if (!state) return;
    updateNumericalControls();
    const blocked = saveBlocker();
    saveTemplate.disabled = Boolean(blocked);
    const coverage = mcCoverage();
    byId('mc-expected-status').textContent = coverage.invalid ? 'Enter a whole question count.' : coverage.expected === null
      ? `${coverage.mapped} MC questions mapped.`
      : `${coverage.mapped} of ${coverage.expected} expected MC questions mapped.`;
    const scope = byId('mc-completeness-panel');
    scope.hidden = !state.scope;
    byId('template-save-status').textContent = blocked || (state.scope
      ? `${mcCount(state.blocks)} MC questions mapped. ${value('mc-completeness') === 'partial'
        ? 'Only these questions will be included.' : 'Compare the overlay with the sheet before saving.'}` : '');
    byId('cancel-block-edit').hidden = !(state.grid || state.editing || state.rowTarget || state.endpoints);
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
    byId('profile-orientation').disabled = placingCorners || Boolean(state.pagePsaJob);
    byId('reset-blank-corners').disabled = state.saving || Boolean(state.discoveryWorker);
    byId('review-discovery').hidden = placingCorners || state.discoveryStale || discoveryStatus.dataset.status !== 'review' ||
      !state.discoveryIssues.length || state.discoveryIssues.includes('frame-aspect');
    renderSaveStatus();
    const finding = Boolean(state.discoveryWorker);
    byId('profile-mc-only').disabled = placingCorners || finding || Boolean(state.rowTarget);
    byId('block-kind').disabled = Boolean(state.rowTarget);
    byId('discover-psa-page').hidden = !state.matrix || placingCorners || finding;
    byId('cancel-psa-page').hidden = !state.pagePsaJob;
    blocksList.inert = Boolean(state.pagePsaJob);
    byId('profile-mc-review').hidden = !state.scope;
    byId('mc-fit-controls').hidden = !state.scope && !state.rowTarget && value('block-kind') !== 'mc';
    byId('fit-mc-grid').hidden = Boolean(state.rowTarget);
    byId('fit-mc-row').hidden = byId('place-mc-row').hidden = !state.rowTarget;
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
    renderSaveStatus();
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
      const diagnostic = state.discoveryDiagnostics.find(({ id }) => id === block.id);
      const color = diagnostic?.psaReview || state.provisionalNr.has(block.id) ? '#a94e17' : '#287651';
      box(block.bounds, color, itemLabel(block));
      for (const item of block.items) {
        if (item.kind === 'mc') {
          for (const choice of item.choices) dot(choice, choice.radius + .75, placementColors[choice.provenance] ?? placementColors.observed, `${item.id} ${choice.symbol}`);
        } else {
          for (const [slot, entry] of item.slots.entries()) {
            for (const choice of entry.choices) dot(choice, choice.radius + .75, placementColors[choice.provenance] ?? placementColors.observed, `${slot + 1}:${choice.symbol}`);
          }
        }
      }
      for (const writing of diagnostic?.writingBoxes ?? []) {
        box(writing, '#74528d', String(writing.slot));
      }
    }
    if (state.cpasProposals?.binding === boxBinding()) {
      for (const proposal of state.cpasProposals.items) {
        const chosen = state.cpasConfirmed.has(proposal.id);
        for (const [index, bounds] of proposal.boxes.entries()) box(bounds, chosen ? '#287651' : '#74528d', String(index + 1));
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
      if (!cell.omit) dot(cell, cell.radius + 1, cell.missing ? placementColors.inferred :
        placementColors[cell.provenance] ?? placementColors.manual, cell.symbol || '?');
    }
    state.endpoints?.forEach((point, index) => dot(point, 4, '#a33415', String(index + 1)));
  }

  function resetCorners() {
    stopDiscovery();
    delete canvas.dataset.pose;
    delete discoveryStatus.dataset.pose;
    state.discoveryIssues = [];
    state.conflictRegions = [];
    state.structuredDiagnostics = undefined;
    state.rowTarget = null;
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

  function findLayout(useExistingCorners = false, usePsa = false) {
    if (state.discoveryWorker || state.cornerEdit) return;
    if (state.grid || state.editing || state.rowTarget || state.mappingBlock || state.renumberBlock || state.exclusionEdit !== undefined) {
      return say('Finish the current edit before finding more blocks.');
    }
    const kept = state.blocks.filter(({ id }) => state.kept.has(id));
    const replaceable = state.blocks.filter(({ id }) => !state.kept.has(id));
    const exclusions = [...state.exclusions, ...kept.map(({ bounds }) => bounds)];
    const original = state;
    const jobId = ++nextJob;
    const worker = new Worker(new URL('./omr-worker.js', import.meta.url), { type: 'module' });
    let psaSearch;
    let layoutSettled = false;
    const job = { terminate() { worker.terminate(); psaSearch?.terminate(); } };
    state.discoveryWorker = job;
    if (usePsa) state.pagePsaJob = { progress: discoveryStatus.dataset.status, message: discoveryStatus.textContent };
    discoveryMessage('processing', 'Finding page corners and bubble blocks…');
    say('');
    show();
    async function finish(result) {
      if (state !== original || state.discoveryWorker !== job || layoutSettled) return;
      layoutSettled = true;
      worker.terminate();
      let psaSummary = '';
      if (usePsa && result?.status !== 'needs-corners' && result?.pagePose !== 'uncertain' && result?.corners?.length === 4) {
        const frame = page();
        const pose = result.poseDiagnostics?.transform ?? pageTransform(frame, result.corners);
        if (pose) {
          discoveryMessage('processing', 'Searching for structured MC and NR blocks…');
          try {
            psaSearch = startStructuredDiscovery(state.image, pose, frame, state.scope === 'mc-only');
            const proposals = await psaSearch.result;
            if (state !== original || state.discoveryWorker !== job) return;
            result = reconcileStructured(result, proposals, exclusions, frame);
            state.structuredDiagnostics = {
              summary: result.psa,
              mc: proposals.mc.rows.map(({ points, observed, number, decision, review_reasons, arbitration }) =>
                ({ points: points.map(([x, y]) => ({ x: x / pageScale, y: y / pageScale })), observed, number, decision, review_reasons, arbitration })),
              nr: proposals.nr.proposals.map(({ path, decision, completeOutlines, evidence, centers, decimals }) => ({
                path, decision, completeOutlines, status: evidence?.status, support: evidence?.support,
                digitOrderMargin: evidence?.svm_margin, digitOrderWins: evidence?.svm_wins,
                centers: centers?.map(([x, y]) => ({ x: x / pageScale, y: y / pageScale })),
                decimals: decimals?.map(([x, y]) => ({ x: x / pageScale, y: y / pageScale })),
              })),
            };
            const { added, reviewCount, mcAdded, mcRefined } = result.psa;
            psaSummary = ` PSA Structured added ${mcAdded} MC rows, corroborated ${mcRefined}, and proposed ${added} NR grids${reviewCount ? ` (${reviewCount} to review)` : ''}.`;
          } catch {
            if (state !== original || state.discoveryWorker !== job) return;
            psaSummary = ' PSA could not finish. Showing Established results. Try a bounded PSA search for individual NR blocks.';
          }
        }
      }
      if (!result?.psa) state.structuredDiagnostics = undefined;
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
      const blockIds = result.components.map((block) => {
        let id = block.id;
        while (ids.has(id)) id += '-new';
        ids.add(id);
        return id;
      });
      const plan = planDiscoveryIds(kept, result.components, result.psa ? result.diagnostics ?? [] : [], ids);
      // Keep explicit review requirements when a draft block is preserved on rediscovery.
      state.provisionalNr = new Set([...state.provisionalNr].filter(id => state.kept.has(id)));
      state.numberingReview = new Map([...state.numberingReview].filter(([id]) => state.kept.has(id)));
      const added = result.components.map((block, index) => {
        const id = blockIds[index];
        if (result.diagnostics?.some(entry => entry.id === block.id && entry.provisionalNr)) state.provisionalNr.add(id);
        const unresolved = [];
        const items = block.items.map((item) => {
          const allocated = plan.get(block.id).get(item.id);
          if (result.psa && allocated.reason) unresolved.push(allocated);
          const itemId = allocated.id;
          const slots = item.slots?.map((slot, i) => ({ ...slot, id: `${itemId}.${i + 1}` }));
          return { ...item, id: itemId, ...(slots ? { slots } : {}) };
        });
        if (unresolved.length) state.numberingReview.set(id, unresolved);
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
          ...(data.row ? { row: plan.get(data.id)?.get(data.row)?.id ?? data.row } : {}),
        })),
      ];
      state.discoveryIssues = kept.length && result.issues.length === 1 && result.issues[0] === 'no-grid' ? [] : result.issues;
      state.conflictRegions = [...state.conflictRegions.filter(region => region.requiresResolution &&
        kept.some(block => intersects(block.bounds, region.bounds))), ...(result.conflictRegions ?? [])];
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
      discoveryMessage(progress, instructions + mcSummary + psaSummary +
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
    if (state.psaJob) stopDiscovery();
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

  function numericalSlots(grid) {
    return Array.from({ length: 4 }, (_, column) => ({
      choices: grid.cells.filter((cell) => cell.column === column && !cell.omit)
        .sort((a, b) => a.row - b.row)
        .map((cell) => ({ ...cell, observed: !cell.missing })),
    }));
  }

  function showAlberta(slots, region) {
    validateAlbertaMapping(slots, region);
    const existingIds = state.editing ? state.grid?.existingIds : undefined;
    const cells = slots.flatMap(({ choices }, column) => choices.map(({ x, y, radius, symbol, observed, provenance }) => ({
      row: symbol === '.' ? 0 : Number(symbol) + 1, column, order: column, x, y, radius, symbol, missing: observed === false,
      provenance: provenance ?? (observed === false ? 'inferred' : 'observed'),
    })));
    state.grid = { cells, rows: 11, columns: 4, alberta: true, existingIds };
    byId('grid-axis').value = 'rows';
    byId('grid-symbols').value = '.,0,1,2,3,4,5,6,7,8,9';
    byId('decimal-slots').value = '2,3';
    byId('reverse-grid-order').checked = false;
    write('grid-rows', 11);
    write('grid-columns', 4);
    setRegion(region);
    updateCellSelector();
    say(cells.some(({ missing }) => missing)
      ? 'Check the orange estimates. Refit with four taps or correct an individual bubble before confirming.'
      : 'Found 42 printed NR bubbles, including decimals in slots 2 and 3. Review the mapping and confirm this block.');
  }

  async function fitPsaAlberta(region) {
    const original = state;
    const job = startPsaDiscovery(state.image, state.matrix, region, page());
    state.psaJob = job;
    state.discoveryWorker = job;
    show();
    try {
      const slots = await job.result;
      if (state !== original || state.psaJob !== job) return;
      stopDiscovery();
      if (slots) showAlberta(slots, region);
      else say('PSA did not find a single reliable NR grid. Adjust the box, choose Established, or use four taps.');
      show();
    } catch (error) {
      if (state !== original || state.psaJob !== job) return;
      stopDiscovery();
      show(`PSA search could not finish. ${error.message}. Choose Established or use four taps.`);
    }
  }

  function fitAlberta(region, { required = true } = {}) {
    if (region.width > 205 || region.height > 310) throw new Error('Narrow the box to one Alberta NR question.');

    if (state.discoveryWorker) return true;
    if (value('nr-discovery-engine') === 'psa' && !state.editing) {
      if (state.grid || state.endpoints) throw new Error('Finish or cancel the current block edit before starting another search.');
      void fitPsaAlberta(region);
      return true;
    }
    const args = [state.image, state.matrix, page(), region];
    const existing = discoverBoxedAlberta(...args);
    if (existing.count > 1) throw new Error('Found multiple NR questions. Box one at a time.');
    const complete = existing.block?.items[0].slots;
    if (complete) {
      showAlberta(complete, region);
      return true;
    }
    const { models } = inspectBoundedAlberta(...args, { allowMissing: true });
    const verified = models.filter(({ missing }) => !missing);
    const proposal = verified.length === 1 ? verified[0] : models.length === 1 ? models[0] : null;
    if (proposal) {
      showAlberta(proposal.slots, region);
      return true;
    }
    if (required || existing.incomplete) {
      say('No single reliable NR grid was found. Adjust the box or place the grid with four taps.');
      return true;
    }
    return false;
  }

  function detect() {
    const region = inputRegion();
    if (value('block-kind') === 'nr' && !state.editing && fitAlberta(region, { required: false })) return;
    const { rows, columns } = counts();
    const proposal = proposeGrid(state.image, state.matrix, region, { rows, columns, printedCenters: value('block-kind') === 'nr' });
    if (!proposal.cells.length) throw new TypeError('No reliable bubble lattice was found. Adjust the box or place the grid manually.');
    const known = new Map(proposal.cells.map((cell) => [`${cell.row}/${cell.column}`, { ...cell, provenance: 'observed' }]));
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
      return known.get(key) ?? { ...fallback, ...absent.get(key), radius, missing: true, provenance: 'inferred' };
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
    const cellsToFit = [...fit.cells.map((cell) => ({ ...cell, provenance: 'observed' })),
      ...fit.missing.map((cell) => ({ ...cell, radius: fit.radius, missing: true, provenance: 'inferred' }))];
    const retained = cellsToFit.map((cell) => {
      const nearest = previous.filter((choice) => !used.has(choice))
        .map((choice) => ({ choice, distance: Math.hypot(choice.x - cell.x, choice.y - cell.y) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest || nearest.distance > cell.radius * .60) return cell;
      used.add(nearest.choice);
      return { ...cell, ...nearest.choice, missing: false, provenance: nearest.choice.provenance ?? 'observed' };
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
      omit: byId('cell-omit').checked, missing: false, provenance: 'manual',
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
    if (state.grid.alberta && kind !== 'nr') throw new Error('Select Numerical response to confirm this Alberta NR mapping.');
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
    if (state.grid.alberta) validateAlbertaMapping(numericalSlots(state.grid), bounds);
    const orders = [...new Set(state.grid.cells.map((cell) => cell.order))].sort((a, b) => a - b);
    const groups = orders.map((order) => available.filter((cell) => cell.order === order));
    const choices = (cells) => cells.map(({ symbol, x, y, radius, provenance }) =>
      ({ symbol, x, y, radius, provenance: provenance ?? 'manual' }));
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
    if (state.rowTarget) {
      if (kind !== 'mc' || items.length !== 1) throw new Error('Place exactly one MC row.');
      insertMcRow(items[0]);
      return;
    }
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
    if (kind === 'nr') state.provisionalNr.delete(block.id);
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
    const alberta = !mc && grouped.every((choices, column) =>
      choices.map(({ symbol }) => symbol).join('') === (column === 1 || column === 2 ? '.0123456789' : '0123456789'));
    const symbols = mc ? grouped.reduce((longest, choices) => choices.length > longest.length ? choices : longest, []).map(({ symbol }) => symbol)
      : alberta ? [...'.0123456789'] : [...new Set(grouped.flatMap((choices) => choices.map(({ symbol }) => symbol)))];
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
      return { ...cell, ...choice, provenance: choice?.provenance ?? 'observed',
        symbol: choice?.symbol ?? symbols[symbolIndex], order, omit: !choice };
    });
    fallback.existingIds = { ids: items, prefix, first };
    if (alberta) fallback.alberta = true;
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
    if (state.rowTarget) throw new Error('Confirm or cancel the new row before editing another block.');
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

  function requireIdleRowEdit() {
    if (state.discoveryWorker || state.grid || state.editing || state.rowTarget || state.mappingBlock ||
        state.renumberBlock || state.exclusionEdit !== undefined || state.endpoints) {
      throw new Error('Finish or cancel the current edit first.');
    }
  }

  function beginMcRow(block, reference) {
    requireIdleRowEdit();
    state.rowTarget = block.id;
    state.region = null;
    for (const field of ['x', 'y', 'width', 'height']) byId('region-' + field).value = '';
    const [, prefix, first] = /^([A-Za-z0-9_.-]*?)([0-9]+)$/.exec(reference.id) ?? ['', 'MC', '1'];
    byId('block-kind').value = 'mc';
    byId('grid-axis').value = 'rows';
    byId('reverse-grid-order').checked = false;
    byId('grid-symbols').value = reference.choices.map(({ symbol }) => symbol).join(',');
    byId('grid-rows').value = '1';
    byId('grid-columns').value = String(reference.choices.length);
    byId('item-prefix').value = prefix;
    byId('item-start').value = String(Number(first) + 1);
    write('grid-radius', reference.choices[0].radius);
    show('Draw a box around only the new MC row. Set its printed question number, then find or place its bubbles.');
    canvas.scrollIntoView({ block: 'nearest' });
  }

  function fitMcRow() {
    const region = inputRegion();
    const { columns } = counts();
    const fit = proposeGrid(state.image, state.matrix, region, { rows: 1, columns });
    if (fit.rows !== 1 || fit.columns !== columns || fit.missing.length || fit.conflicts.length || fit.cells.length !== columns) {
      throw new Error('Could not find every bubble in this row. Tighten the box or place the row and adjust its bubbles.');
    }
    assignGrid({ ...fit, cells: fit.cells.map((cell) => ({ ...cell, provenance: 'observed' })) }, true);
  }

  function finishRowEdit(block, message) {
    state.drafts.delete(block.id);
    state.kept.add(block.id);
    clearBlockEdit();
    recheckCoverage();
    lists();
    show(message);
  }

  function insertMcRow(row) {
    const target = state.blocks.find(({ id }) => id === state.rowTarget);
    if (!target) throw new Error('The target block is no longer available.');
    if (state.exclusions.some((zone) => intersects(zone, row.bounds))) throw new Error('The row crosses an exclusion.');
    const { bounds, items } = target;
    const x = Math.min(bounds.x, row.bounds.x);
    const y = Math.min(bounds.y, row.bounds.y);
    const right = Math.max(bounds.x + bounds.width, row.bounds.x + row.bounds.width);
    const bottom = Math.max(bounds.y + bounds.height, row.bounds.y + row.bounds.height);
    const first = items[0].bounds;
    const last = items.at(-1).bounds;
    const axis = Math.abs(first.x - last.x) > Math.abs(first.y - last.y) ? 'x' : 'y';
    const direction = Math.sign(last[axis] - first[axis]) || 1;
    const updated = { ...target, bounds: { x, y, width: right - x, height: bottom - y },
      items: [...items, row].sort((a, b) => direction * (a.bounds[axis] - b.bounds[axis])) };
    const next = state.blocks.map((block) => block === target ? updated : block);
    createMarkerlessProfile({ id: 'draft', revision: 1, name: 'Draft', page: page(), components: next });
    state.blocks = next;
    finishRowEdit(target, `Inserted ${row.id}. Existing question IDs and bubble positions were preserved.`);
  }

  function addMcRowControls(row, block) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Insert or delete an MC row';
    const label = document.createElement('label');
    label.textContent = 'Reference or target row ';
    const choices = document.createElement('select');
    choices.replaceChildren(...block.items.map(({ id }, index) => {
      const diagnostic = state.discoveryDiagnostics.find((entry) => entry.id === block.id && entry.row === id);
      const suggestion = diagnostic?.number ? ` · printed number suggestion ${diagnostic.number}` : '';
      return new Option(id + suggestion, String(index));
    }));
    label.append(choices);
    const actions = document.createElement('div');
    actions.className = 'block-actions';
    for (const [caption, action] of [
      ['Insert row', () => beginMcRow(block, block.items[choices.selectedIndex])],
      ['Delete selected row', () => {
        requireIdleRowEdit();
        if (block.items.length === 1) throw new Error('Use Remove to delete a block with one row.');
        const removed = block.items[choices.selectedIndex];
        state.blocks = state.blocks.map((entry) => entry === block
          ? { ...block, items: block.items.filter((item) => item !== removed) } : entry);
        state.discoveryDiagnostics = state.discoveryDiagnostics.filter((d) => d.id !== block.id || d.row !== removed.id);
        finishRowEdit(block, `Deleted ${removed.id}. Review the remaining question IDs against the sheet.`);
      }],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = caption;
      button.onclick = () => { try { action(); } catch (error) { say(error.message); } };
      actions.append(button);
    }
    details.append(summary, label, actions);
    row.append(details);
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
    state.provisionalNr.delete(block.id);
    state.numberingReview.delete(block.id);
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
    const conflictsList = byId('profile-discovery-conflicts');
    conflictsList.replaceChildren();
    state.conflictRegions.forEach(({ bounds, reason, requiresResolution }, index) => {
      listEntry(conflictsList, reason, [['Show region', () => {
        requireIdleRowEdit();
        setRegion(bounds);
        show('Check the printed response in this region. Remove any incorrect proposal, then draw a box and fit the correct block if needed.');
        canvas.scrollIntoView({ block: 'nearest' });
      }], ...(requiresResolution ? [['Resolve region after inspection', () => {
        requireIdleRowEdit();
        const overlaps = state.blocks.filter(block => intersects(block.bounds, bounds));
        if (overlaps.some(block => !state.kept.has(block.id) || state.provisionalNr.has(block.id) ||
            state.numberingReview.has(block.id))) {
          return say('Confirm the intended overlapping block mapping or remove it before resolving this region.');
        }
        state.conflictRegions.splice(index, 1);
        lists();
        show(overlaps.length ? 'Using the confirmed mapping for this region.' : 'Unresolved region explicitly omitted from the template.');
      }]] : [])]);
    });
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
          if (state.rowTarget) throw new Error('Confirm or cancel the new row before removing a block.');
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
      const provisionalNr = state.provisionalNr.has(block.id);
      const hasEstimates = provisionalNr && block.items.some(item =>
        item.slots.some(slot => slot.choices.some(cell => cell.provenance === 'inferred')));
      const pendingNumbers = state.numberingReview.get(block.id) ?? [];
      const disputed = pendingNumbers.some(item => item.reason === 'conflict');
      const caption = (provisionalNr ? 'Provisional · ' : '') + itemLabel(block) + (block.kind === 'nr' ? ' · Numerical response' : ' · Multiple choice') +
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
        ...(provisionalNr ? [['Confirm NR grid', () => {
          requireIdleRowEdit();
          for (const item of block.items) validateAlbertaMapping(item.slots, item.bounds);
          state.provisionalNr.delete(block.id);
          for (const entry of state.discoveryDiagnostics) {
            if (entry.id === block.id) entry.psaReview = false;
          }
          if (!state.provisionalNr.size) state.discoveryIssues = state.discoveryIssues.filter(issue => issue !== 'psa-provisional-grids');
          state.kept.add(block.id);
          lists();
          show('NR grid and symbol order confirmed.');
        }]] : []),
        ...(pendingNumbers.length && !disputed ? [['Confirm displayed numbers', () => {
          requireIdleRowEdit();
          state.numberingReview.delete(block.id);
          state.kept.add(block.id);
          lists();
          show('Displayed MC question numbers confirmed.');
        }]] : []),
        ['Renumber block', () => startRenumber(block), 'renumber-block'],
        ['Edit numbering and symbols', () => editMapping(block)],
        ['Edit block', () => chooseDraft(block)],
        ...(index ? [['Move up', () => move(-1)]] : []),
        ...(index + 1 < state.blocks.length ? [['Move down', () => move(1)]] : []),
        ['Remove', () => {
          state.kept.delete(block.id);
          state.provisionalNr.delete(block.id);
          state.numberingReview.delete(block.id);
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
      row.dataset.provisionalNr = String(provisionalNr);
      row.dataset.numberingReview = disputed ? 'conflict' : pendingNumbers.length ? 'unverified' : '';
      if (provisionalNr || pendingNumbers.length) {
        const note = document.createElement('p');
        note.textContent = provisionalNr ? hasEstimates
          ? 'Compare the full inferred grid and printed symbols before confirming.'
          : 'Check the printed symbols and grid order before confirming.' :
          disputed ? `Conflicting printed numbers (${pendingNumbers.filter(item => item.reason === 'conflict')
            .flatMap(item => item.claims).join(', ')}). Edit numbering and symbols to resolve.` :
            'Check the rows whose printed numbers could not be verified.';
        row.append(note);
      }
      if (block.kind === 'mc') addMcRowControls(row, block);
      row.dataset.numberingConflict = String(conflicts.has(block.id) || block.items.some(({ id, slots }) =>
        conflicts.has(id) || slots?.some((slot) => conflicts.has(slot.id))));
    }
  }

  function handle(id, action) {
    byId(id).addEventListener('click', () => {
      if (!state) return;
      if ((state.psaJob || state.pagePsaJob) && !['cancel-psa-page', 'cancel-nr-discovery', 'cancel-profile-editor', 'editor-zoom-in', 'editor-zoom-out', 'editor-pan'].includes(id)) {
        return say('Wait for the PSA search or cancel it to continue editing.');
      }
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
  handle('discover-psa-page', () => findLayout(state.corners.length === 4, true));
  handle('export-template-diagnostics', () => downloadProfileDiagnostics({
    release: document.querySelector('meta[name="scree-release"]').content,
    page: page(), expectedMC: mcCoverage().expected, components: state.blocks, exclusions: state.exclusions,
    issues: state.discoveryIssues, conflictRegions: state.conflictRegions,
    blockDiagnostics: state.discoveryDiagnostics, discovery: state.structuredDiagnostics,
    draft: state.grid && { region: state.region, cells: state.grid.cells },
  }));
  handle('cancel-psa-page', () => {
    const { progress, message } = state.pagePsaJob;
    stopDiscovery();
    discoveryMessage(progress, message);
    show('PSA page search canceled. The current mapping is unchanged.');
  });
  handle('add-exclusion', () => {
    if (state.discoveryWorker || state.grid || state.editing || state.rowTarget) throw new Error('Finish the current block edit first.');
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
    state.conflictRegions = state.conflictRegions.filter(region => region.requiresResolution &&
      state.blocks.some(block => intersects(block.bounds, region.bounds)));
    state.structuredDiagnostics = undefined;
    state.discoveryDiagnostics = state.discoveryDiagnostics.filter(({ id }) => state.kept.has(id));
    closeMapping();
    discoveryMessage('idle');
    lists(); show(`Cleared ${removed.length} proposals, including ${mcCount(removed)} MC questions. Kept blocks remain. Draw a missing block or find blocks again.`);
  });
  handle('review-discovery', () => {
    state.discoveryIssues = [];
    if (state.scope) recheckCoverage();
    else state.blocks.forEach(({ id }) => state.kept.add(id));
    state.discoveryDiagnostics.forEach((entry) => { entry.psaReview = false; });
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
  handle('fit-nr-grid', () => { if (!state.discoveryWorker) fitAlberta(inputRegion()); });
  handle('cancel-nr-discovery', () => {
    stopDiscovery();
    show('PSA search canceled. The current mapping is unchanged.');
  });
  for (const id of ['nr-discovery-engine', 'block-kind', 'profile-orientation', 'region-x', 'region-y', 'region-width', 'region-height']) {
    byId(id).addEventListener('change', () => {
      if (state?.psaJob) {
        stopDiscovery();
        show('PSA search canceled after the editor selection changed.');
      }
    });
  }
  handle('anchor-nr-grid', () => {
    inputRegion();
    state.endpoints = Object.assign([], { alberta: true });
    say('Tap the left 0, right 0, left 9 and left decimal bubble on the sheet. Zoom in if needed.');
    paint();
  });
  handle('accept-nr-fit', () => {
    if (!state.grid?.alberta) return;
    validateAlbertaMapping(numericalSlots(state.grid), inputRegion());
    for (const cell of state.grid.cells) cell.missing = false;
    paint();
    say('Estimated positions reviewed. Confirm this block to use the mapping.');
  });
  handle('fit-mc-grid', () => {
    try { fitMcBlock(); } catch (error) {
      byId('mc-fit-status').textContent = error.message;
      throw error;
    }
  });
  handle('fit-mc-row', fitMcRow);
  handle('place-mc-row', makeDefault);
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
    state.rowTarget = null;
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
  handle('template-cpas-propose', () => {
    boxList.replaceChildren();
    if (!state?.matrix || !state.blocks.some(block => block.kind === 'nr' && state.kept.has(block.id))) {
      boxStatus.textContent = 'Confirm the page and at least one numerical-response block first.';
      return;
    }
    const draft = { page: page(), components: state.blocks };
    const result = proposeHandwritingBoxes(toGrayImage(state.image), draft,
      { status: 'registered', pageToSource: state.matrix });
    const items = result.items.filter(item => item.status === 'proposed' &&
      state.blocks.some(block => state.kept.has(block.id) && block.items.some(candidate => candidate.id === item.id)));
    state.cpasProposals = { binding: boxBinding(), items };
    state.cpasConfirmed = new Set();
    boxStatus.textContent = items.length ? 'Check the numbered outlines on the blank. Confirm only boxes that match the writing positions.' :
      'No reliable writing-box groups found. The optical comparison remains available.';
    for (const item of items) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.cpasConfirmed.add(item.id);
        else state.cpasConfirmed.delete(item.id);
        paint();
      });
      label.append(checkbox, ` Use handwriting boxes for ${item.id}`);
      boxList.append(label);
    }
    paint();
  });
  handle('enroll-profile', async () => {
    const blocked = saveBlocker();
    if (blocked) return say(blocked);
    try {
      const components = state.blocks.some(({ kind }) => kind === 'nr')
        ? measureNumericalBlankInk(toGrayImage(state.image), state.matrix, state.blocks) : state.blocks;
      const printedLandmarks = enrollPrintedLandmarks(toGrayImage(state.image), state.matrix, page(), components);
      const profile = createMarkerlessProfile({
        printedLandmarks, id: state.prior?.id ?? idFor('layout'), revision: (state.prior?.revision ?? 0) + 1,
        name: value('profile-name'), page: page(), components, scope: state.scope, exclusions: state.exclusions,
        mcCompleteness: state.scope ? value('mc-completeness') || undefined : undefined,
        mcExpectedCount: mcCoverage().expected ?? undefined,
      });
      const draft = state;
      draft.saving = true;
      saveTemplate.disabled = true;
      const acceptedBoxes = cpas && state.cpasProposals?.binding === boxBinding()
        ? state.cpasProposals.items.filter(item => state.cpasConfirmed.has(item.id)).flatMap(item => item.boxes) : [];
      const evidence = cpas ? {
        reference: byId('template-cpas-blank').checked ? { image: state.image, matrix: state.matrix } : undefined,
        boxes: Object.fromEntries(acceptedBoxes.map(({ id, x, y, width, height }) =>
          [id, { x: x + .35, y, width: width - .7, height }])),
      } : undefined;
      try { await onSave(profile, evidence); }
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
    if (state) show();
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!state || state.psaJob || state.pagePsaJob || state.pan || state.drag || (event.pointerType !== 'touch' && event.button !== 0)) return;
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
      if (state.endpoints.alberta && state.endpoints.length === 4) {
        const anchors = state.endpoints;
        state.endpoints = null;
        try {
          const region = inputRegion();
          const retained = state.grid?.alberta ? numericalSlots(state.grid) : undefined;
          showAlberta(fitAlbertaAnchors(anchors, region, retained), region);
        } catch (error) { say(error.message); }
      } else if (!state.endpoints.alberta && state.endpoints.length === 3) {
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
      provisionalNr: new Set(), numberingReview: new Map(),
      drafts: new Map(), discoveryIssues: [], discoveryDiagnostics: [], conflictRegions: [],
    };
    boxList.replaceChildren();
    boxStatus.textContent = '';
    byId('template-cpas-blank').checked = true;
    clearMcFit();
    byId('nr-discovery-engine').value = 'established';
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
