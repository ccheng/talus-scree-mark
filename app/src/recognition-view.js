import { project } from './projective.js';

const messages = {
  'missing-anchor': 'Could not find all four corner markers.',
  'ambiguous-anchor': 'Found conflicting corner markers.',
  'mirrored-registration': 'The reference sheet appears mirrored.',
  'invalid-anchor-order': 'The markers do not match the page orientation or shape.',
  'ill-conditioned-registration': 'The page is too distorted to align.',
  'clipped-content': 'Some of the answer regions are outside the photo.',
  'layout-identity': 'The sheet does not match the supported reference revision.',
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
  const matrix = registration.pageToSource;
  context.lineWidth = width;
  for (const item of items) {
    const { x, y, width: regionWidth, height } = item.bounds;
    const corners = [[x, y], [x + regionWidth, y], [x + regionWidth, y + height], [x, y + height]]
      .map(([u, v]) => project(matrix, u, v));
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

export function createRecognitionView({ button, status, results, table, overlay }) {
  let active;
  let available = false;
  let jobId = 0;

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
    table.replaceChildren();
    results.hidden = true;
    overlay.hidden = true;
    overlay.width = 1;
    overlay.height = 1;
  }

  function read(image) {
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
      if (result.status === 'retake') {
        const explanation = result.registration.reasons.map((reason) => messages[reason]).filter(Boolean).join(' ');
        setStatus('retake', `${explanation} Retake the photo or choose a clear image of the reference sheet.`);
        return;
      }

      drawOverlay(overlay, image, result.registration, result.items);
      addItems(table, result.items);
      results.hidden = false;
      const reviewCount = result.items.filter(({ review }) => review).length;
      const summary = reviewCount === 1 ? '1 response needs review.' : `${reviewCount} responses need review.`;
      setStatus('read', reviewCount ? summary : 'All responses read.');
    }
    worker.addEventListener('message', ({ data }) => complete(data));
    worker.addEventListener('error', () => complete());
    worker.addEventListener('messageerror', () => complete());
    try {
      worker.postMessage({
        type: 'read-reference', jobId: job.id,
        image: { id: image.id, width: image.width, height: image.height, pixels: image.pixels.data },
      });
    } catch {
      complete();
    }
  }

  function setAvailable(value) {
    available = value;
    button.hidden = !value;
  }

  return { read, reset, setAvailable };
}
