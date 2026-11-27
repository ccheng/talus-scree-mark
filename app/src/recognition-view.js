import { importWorkingImage } from './image.js';
import { project } from './projective.js';

const messages = {
  'page-corners': 'Could not locate a reliable page outline. Use Set scan corners or retake against a contrasting background.',
  'multiple-sheets': 'More than one complete sheet fits the selected template. Retake with one sheet in the photo.',
  'ambiguous-orientation': 'More than one page orientation fits. Set scan corners to identify the correct orientation.',
  'batch-not-confirmed': 'Confirm a batch with the selected profile revision.',
  'printed-landmark-conflict': 'The answer blocks do not align with the nearby printed layout. Check the selected template or retake the photo.',
  'response-geometry': 'The bubble blocks or rows do not match the selected layout, or part of a block is obscured.',
  'missing-anchor': 'Could not find all four corner markers.',
  'ambiguous-anchor': 'Found conflicting corner markers.',
  'mirrored-registration': 'The reference sheet appears mirrored.',
  'invalid-anchor-order': 'The markers do not match the page orientation or shape.',
  'ill-conditioned-registration': 'The page is too distorted to align.',
  'clipped-content': 'Some of the answer regions are outside the photo.',
  'layout-identity': 'The sheet does not match the selected layout.',
  'missing-check': 'Some alignment checks are not visible.',
  'check-displacement': 'The answer regions could not be aligned reliably.',
  'invalid-profile': 'The reference profile is unavailable.',
  'insufficient-region-evidence': 'The bubble outlines are unclear or obscured.',
  'multiple-marks': 'More than one clear mark.',
  'competing-mark': 'A second mark may be present.',
  'weak-mark': 'A faint or partly erased mark.',
  'nr-format': 'The observed marks use an unusual slot or decimal pattern.',
};

function drawOverlay(canvas, image, registration, items) {
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  const width = Math.max(2, Math.min(image.width, image.height) / 260);
  const refined = new Map((registration.refinedBlocks ?? [])
    .flatMap(({ itemIds, matrix }) => itemIds.map((id) => [id, matrix])));
  context.lineWidth = width;
  const pose = registration.diagnostics?.pagePose;
  if (pose?.virtual && pose.corners.length === 4) {
    context.strokeStyle = '#4b5571';
    context.setLineDash([width * 4, width * 3]);
    context.beginPath();
    pose.corners.forEach(({ x, y }, index) => index === 0 ? context.moveTo(x, y) : context.lineTo(x, y));
    context.closePath();
    context.stroke();
  }
  for (const item of items) {
    const { x, y, width: regionWidth, height } = item.bounds;
    const corners = [[x, y], [x + regionWidth, y], [x + regionWidth, y + height], [x, y + height]]
      .map(([u, v]) => project(refined.get(item.id) ?? registration.pageToSource, u, v));
    if (corners.some((point) => !point)) continue;
    context.strokeStyle = item.review ? '#b43818' : '#225c8a';
    context.setLineDash(item.review ? [width * 2, width * 1.4] : []);
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    for (const point of corners.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
    context.stroke();

    context.setLineDash([]);
    const groups = item.kind === 'mc' ? [item] : item.slots;
    for (const group of groups) {
      const marked = group.choices.filter(({ symbol, score }) => group.symbol === symbol || (group.review && score >= .15));
      for (const { evidence: { source, sourceRadius } } of marked) {
        if (!source) continue;
        context.beginPath();
        context.arc(source.x, source.y, sourceRadius * 1.25, 0, 2 * Math.PI);
        context.stroke();
      }
    }
  }
  canvas.hidden = false;
}

function addItems(table, items) {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = document.createElement('tr');
    row.dataset.itemId = item.id;
    row.dataset.status = item.status;
    row.dataset.review = String(item.review);
    const id = document.createElement('th');
    id.scope = 'row';
    id.textContent = item.id;
    const observed = document.createElement('td');
    if (item.rawText !== null) observed.dataset.rawText = item.rawText;
    if (item.kind === 'mc') {
      observed.textContent = item.rawText ?? (item.status === 'blank' ? 'Blank' : '—');
    } else {
      const slots = document.createElement('span');
      slots.className = 'observed-slots';
      for (const slot of item.slots) {
        const cell = document.createElement('span');
        cell.dataset.status = slot.status;
        cell.textContent = slot.symbol ?? (slot.status === 'blank' ? '·' : '?');
        cell.setAttribute('aria-label', slot.symbol ?? (slot.status === 'blank' ? 'Empty position' : 'Unresolved position'));
        slots.append(cell);
      }
      observed.append(slots);
    }
    const review = document.createElement('td');
    review.textContent = item.review
      ? item.reasons.map((reason) => messages[reason]).filter(Boolean).join(' ')
      : item.status === 'blank' ? 'Blank' : 'Read';
    row.append(id, observed, review);
    fragment.append(row);
  }
  table.replaceChildren(fragment);
}

export function createRecognitionView({ button, status, results, table, overlay, diagnostics, onRegistration, onRead }) {
  let active;
  let available = false;
  let jobId = 0;
  const preview = new URLSearchParams(location.search).get('cpas') === 'preview'
    ? document.getElementById('cpas-preview') : null;
  const blankInput = preview?.querySelector('#cpas-blank');
  const previewStatus = preview?.querySelector('#cpas-preview-status');
  const download = preview?.querySelector('#cpas-download');
  let blank;
  let blankImport;
  let blankProfile;
  let comparison;
  let handwritingConfig;
  if (preview) {
    preview.hidden = false;
    blankInput.addEventListener('change', async () => {
      blankImport?.abort();
      const controller = new AbortController();
      blankImport = controller;
      blank = undefined;
      blankProfile = undefined;
      const file = blankInput.files[0];
      previewStatus.textContent = file ? 'Opening blank reference…' : '';
      if (!file) return;
      try {
        const image = await importWorkingImage(file, controller.signal);
        if (controller.signal.aborted) return;
        blank = { id: image.id, width: image.width, height: image.height, pixels: image.pixels.data };
        previewStatus.textContent = 'Blank reference ready for the next scan.';
      } catch {
        if (!controller.signal.aborted) previewStatus.textContent = 'Could not open the blank reference. Choose a JPEG or PNG.';
      }
    });
    const boxInput = preview.querySelector('#cpas-handwriting');
    const boxStatus = preview.querySelector('#cpas-handwriting-status');
    let boxRequest = 0;
    boxInput.addEventListener('change', async () => {
      const operation = ++boxRequest;
      handwritingConfig = undefined;
      const file = boxInput.files[0];
      if (!file) { boxStatus.textContent = ''; return; }
      try {
        if (file.size > 100_000) throw new Error('Box map too large.');
        const config = JSON.parse(await file.text());
        if (operation !== boxRequest) return;
        if (typeof config?.profileId !== 'string' || !Number.isInteger(config.revision) ||
            !config.boxes || typeof config.boxes !== 'object' || Array.isArray(config.boxes)) throw new Error('Invalid box map.');
        handwritingConfig = config;
        boxStatus.textContent = 'Handwriting box map loaded for its matching profile revision.';
      } catch {
        if (operation === boxRequest) boxStatus.textContent = 'Could not read the handwriting box map.';
      }
    });
    download.addEventListener('click', () => {
      if (!comparison) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(comparison, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cpas-scan-diagnostics.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  function setStatus(state, message = '') {
    status.dataset.status = state;
    status.textContent = message;
    results.dataset.status = state;
    button.disabled = active !== undefined;
  }

  function reset() {
    active?.worker.terminate();
    active = undefined;
    setStatus('idle');
    comparison = undefined;
    if (download) download.hidden = true;
    for (const field of ['strategy', 'authorization', 'cornerPath', 'profileId', 'revision']) delete status.dataset[field];
    table.replaceChildren();
    results.hidden = true;
    overlay.hidden = true;
    overlay.width = 1;
    overlay.height = 1;
    diagnostics.hidden = true;
    for (const row of diagnostics.children) {
      row.textContent = '';
      delete row.dataset.status;
      delete row.dataset.path;
      delete row.dataset.discarded;
    }
  }

  function showDiagnostics(registration, profile) {
    const stages = registration.diagnostics;
    if (!stages || !profile) return;
    const stage = (name, state, detail) => {
      const row = diagnostics.querySelector(`[data-stage="${name}"]`);
      row.dataset.status = state;
      row.textContent = detail;
    };
    const pose = stages.pagePose;
    const poseText = pose.status === 'recovered' ? (pose.virtual
      ? 'recovered from bubble outlines; estimated corners extend beyond the photo'
      : pose.path?.endsWith('block-refinement') ? 'checked from page corners and verified bubble blocks'
      : 'recovered from fitted bubble centers')
      : pose.status === 'verified' ? (pose.path === 'manual-corners' ? 'checked using your corner positions' : 'located from the page edges')
      : pose.status === 'unchecked' ? 'not checked'
      : pose.discarded?.reason === 'clipped-content' ? 'a bubble fit did not keep every required response region in frame'
      : 'uncertain. Adjust corners or retake the photo.';
    stage('page-pose', pose.status, `Page pose — ${poseText}`);
    const poseRow = diagnostics.querySelector('[data-stage="page-pose"]');
    if (pose.path) poseRow.dataset.path = pose.path;
    if (pose.discarded?.reason) poseRow.dataset.discarded = pose.discarded.reason;
    const orientation = stages.orientation.status;
    stage('orientation', orientation, `Orientation — ${{
      verified: 'verified', ambiguous: 'ambiguous. Move the numbered corners to identify the upright sheet.',
      mirrored: 'the capture appears mirrored', unchecked: 'not confirmed',
    }[orientation] ?? orientation}`);
    const geometry = stages.responseGeometry;
    const row = diagnostics.querySelector('[data-stage="response-geometry"]');
    stage('response-geometry', geometry.status, 'Response geometry — ' + ({
      verified: 'all expected blocks passed', failed: 'one or more required blocks did not match', unchecked: 'not checked',
    }[geometry.status] ?? geometry.status));
    const failures = geometry.blocks.filter(({ verified }) => !verified);
    if (failures.length) {
      const list = document.createElement('ul');
      for (const block of failures) {
        const expected = profile.components.find(({ id }) => id === block.id);
        const ids = expected?.items.map(({ id }) => id) ?? [block.id];
        const label = ids.length > 1 ? `${ids[0]}–${ids.at(-1)}` : ids[0];
        const counts = [
          [block.missingRows, 'missing row'], [block.missingSlots, 'missing slot'],
          [block.missingColumns, 'missing column'], [block.extraRows, 'extra row'], [block.relocatedChoices, 'displaced choice'],
        ].flatMap(([count, reason]) => count ? [`${count} ${reason}${count === 1 ? '' : 's'}`] : []);
        if (block.spacingMismatch) counts.push('choice spacing differs');
        if (!counts.length) counts.push(`only ${block.supported} of ${block.checked} expected outlines supported`);
        const item = document.createElement('li');
        item.textContent = `${label}: ${counts.join(', ')}.`;
        list.append(item);
      }
      row.append(list);
    }
    const landmarks = stages.printedLandmarks;
    const landmarkRow = diagnostics.querySelector('[data-stage="printed-landmarks"]');
    landmarkRow.hidden = !landmarks;
    if (landmarks) stage('printed-landmarks', landmarks.status, 'Printed layout — ' + ({
      unavailable: 'no landmarks saved for this template',
      'not-needed': 'the expected blocks aligned without local corrections',
      insufficient: 'limited landmark evidence; the response geometry checks passed',
      corroborated: 'printed landmarks support the local alignment',
      incompatible: 'nearby printed landmarks disagree with the answer block positions',
    }[landmarks.status] ?? landmarks.status));
    diagnostics.hidden = false;
  }

  function read(image, request) {
    if (!available || active || !image) return;
    reset();
    let worker;
    try {
      worker = new Worker(new URL('./omr-worker.js', import.meta.url), { type: 'module' });
    } catch {
      setStatus('error', 'Recognition could not start. Reopen the app or reconnect to restore its offline files.');
      return;
    }
    const job = { id: ++jobId, worker };
    active = job;
    setStatus('processing', 'Reading bubbles…');

    function complete(response) {
      if (active !== job) return;
      if (response && response.jobId !== job.id) return;
      worker.terminate();
      active = undefined;
      const result = response?.result;
      if (!result || result.captureId !== image.id) {
        setStatus('error', 'Recognition did not finish. Try reading the bubbles again.');
        return;
      }
      if (result.cpas && preview) {
        comparison = { profile: result.profile, established: result.items, cpas: result.cpas };
        download.hidden = false;
        const mc = result.cpas.items.filter(item => item.kind === 'mc');
        const nr = result.cpas.items.filter(item => item.kind === 'nr');
        const accepted = mc.filter(item => item.disposition === 'would-accept').length;
        previewStatus.textContent = result.cpas.status === 'evaluated'
          ? `CPAS ${result.cpas.reference}. MC would accept ${accepted} of ${mc.length}. NR experimental observations ${nr.length}. Handwriting boxes evaluated ${result.cpas.handwriting.modelAvailable ? result.cpas.handwriting.eligibleBoxes : 0}.`
          : `CPAS comparison unavailable. ${result.cpas.status.replaceAll('-', ' ')}.`;
      }
      onRegistration(result.registration);
      showDiagnostics(result.registration, request?.profile);
      if (result.registration.strategy) status.dataset.strategy = result.registration.strategy;
      if (result.registration.authorization) status.dataset.authorization = result.registration.authorization;
      if (result.registration.cornerPath) status.dataset.cornerPath = result.registration.cornerPath;
      if (result.profile) {
        status.dataset.profileId = result.profile.id;
        status.dataset.revision = String(result.profile.revision);
      }
      if (result.status === 'retake') {
        const explanation = result.registration.reasons.map((reason) => messages[reason]).filter(Boolean).join(' ');
        const next = result.registration.reasons.includes('batch-not-confirmed') ? '' : request
          ? ' Check the selected profile, retake or set scan corners.'
          : ' Retake the photo or choose a clear image of the reference sheet.';
        setStatus('retake', explanation + next);
        return;
      }

      drawOverlay(overlay, image, result.registration, result.items);
      addItems(table, result.items);
      results.hidden = false;
      const reviewCount = result.items.filter(({ review }) => review).length;
      const summary = reviewCount === 1 ? '1 response needs review.' : `${reviewCount} responses need review.`;
      const path = request ? ' Read against the confirmed batch profile.' : '';
      setStatus('read', (reviewCount ? summary : 'All responses read.') + path);
      onRead?.(result, request?.profile, image);
    }
    worker.addEventListener('message', ({ data }) => complete(data));
    worker.addEventListener('error', () => complete());
    worker.addEventListener('messageerror', () => complete());
    try {
      const profileKey = request?.profile && JSON.stringify([request.profile.id, request.profile.revision]);
      if (preview && profileKey && blank) {
        blankProfile ??= profileKey;
        if (blankProfile !== profileKey) {
          blank = undefined;
          blankInput.value = '';
        }
      }
      const cpasHandwritingBoxes = handwritingConfig && request?.profile?.id === handwritingConfig.profileId &&
        request.profile.revision === handwritingConfig.revision ? handwritingConfig.boxes : undefined;
      worker.postMessage({
        type: request ? 'read-profile' : 'read-reference', jobId: job.id,
        ...request,
        ...(preview && request ? { options: { ...request.options, cpasPreview: true, cpasReference: blank, cpasHandwritingBoxes } } : {}),
        image: { id: image.id, width: image.width, height: image.height, pixels: image.pixels.data },
      });
    } catch {
      complete();
    }
  }

  function setAvailable(value, visible = true) {
    available = value;
    button.hidden = !value || !visible;
  }

  return { read, reset, setAvailable };
}
