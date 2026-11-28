import { createGradingView } from './grading-view.js';
import { createCamera } from './camera.js';
import { importWorkingImage, readWorkingImage, ImageInputError } from './image.js';
import { prepareOffline } from './offline.js';
import { createRecognitionView } from './recognition-view.js';
import { createProfileWorkspace } from './profile-workspace.js';

const byId = (id) => document.getElementById(id);
const start = byId('start-camera');
const shutter = byId('shutter');
const cancel = byId('cancel-camera');
const choose = byId('choose-image');
const picker = byId('image-picker');
const clear = byId('clear-image');
const status = byId('capture-status');
const retryCheckpoint = byId('retry-checkpoint');
const cameraPreview = byId('camera-preview');
const sheet = byId('image-preview');
const canvas = byId('sheet-canvas');
const caption = byId('preview-caption');
let workingImage;
let importOperation;
let pickerPending = false;
const read = byId('read-bubbles');
const scope = new URL('.', location.href).pathname;
let captureOperation;
const grading = createGradingView({ scope, async recover(entry) {
  if (workspace.activeBatch?.profileId !== entry.profileId || workspace.activeBatch?.revision !== entry.revision) {
    throw new Error('Start a batch with the original template revision before reopening this capture.');
  }
  cancelImport();
  camera.close();
  const operation = new AbortController();
  importOperation = operation;
  const batch = workspace.activeBatch;
  try {
    const bitmap = await createImageBitmap(entry.photo);
    let copy;
    try { copy = readWorkingImage(bitmap, bitmap.width, bitmap.height, 'import'); }
    finally { bitmap.close(); }
    operation.signal.throwIfAborted();
    if (importOperation !== operation || workspace.activeBatch !== batch) return;
    showWorkingImage({ ...copy, id: entry.id });
    workspace.restoreCorners(entry.corners);
    showStatus('Recovered the captured sheet.');
  } finally {
    if (importOperation === operation) importOperation = undefined;
    updatePreview();
  }
  if (workspace.activeBatch === batch) runRecognition();
} });
const recognition = createRecognitionView({
  selectedProfile: () => workspace.selectedProfile,
  button: read, status: byId('recognition-status'), results: byId('recognition-results'),
  table: byId('recognition-items'), overlay: byId('recognition-overlay'),
  diagnostics: byId('scan-diagnostics'),
  onRead(result, profile, image) { grading.observe(result, profile, image); },
  onRegistration(registration) { workspace.observeRegistration(registration); },
});
const workspace = createProfileWorkspace({
  image: () => workingImage,
  scope,
  onBatchChanged: grading.setBatch,
  onChanged({ clearImage = false } = {}) {
    grading.select(workspace.selectedProfile, clearImage);
    recognition.refreshReference();
    if (clearImage) {
      cancelImport();
      camera.close();
      workingImage = undefined;
      workspace.resetCapture();
    }
    recognition.reset();
    updatePreview();
  },
  onEditorClosed(saved) {
    grading.select(workspace.selectedProfile);
    recognition.refreshReference();
    if (saved) {
      recognition.reset();
      workingImage = undefined;
      workspace.resetCapture();
    }
    updatePreview();
  },
  requestBlank: () => choose.click(),
  onCaptureRequested() {
    cancelImport();
    camera.close();
    workingImage = undefined;
    workspace.resetCapture();
    recognition.reset();
    showStatus('Open the camera or choose a completed sheet.');
    updatePreview();
    start.focus();
  },
  read: runRecognition,
});

function showStatus(message) {
  status.textContent = message;
}

function updatePreview() {
  const focused = document.activeElement;
  start.textContent = workingImage?.source === 'camera' ? 'Retake photo' : 'Open camera';
  clear.hidden = !workingImage;
  sheet.hidden = !workingImage || camera.state !== 'closed';
  byId('marked-capture-controls').hidden = !workspace.captureVisible || workspace.editing;
  recognition.setAvailable(!sheet.hidden && !pickerPending && !importOperation && !workspace.editing && workspace.canRead, !workspace.autoRead);
  if (!workingImage) {
    retryCheckpoint.hidden = true;
    canvas.width = 1;
    canvas.height = 1;
    caption.textContent = '';
    if (focused === clear) start.focus();
  }
}

function showWorkingImage(image) {
  retryCheckpoint.hidden = true;
  recognition.reset();
  workingImage = image;
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(image.pixels, 0, 0);
  caption.textContent = `${image.width} × ${image.height} pixels`;
  workspace.acceptImage(image);
  updatePreview();
}

function cameraState({ status: phase, message }) {
  const focused = document.activeElement;
  start.hidden = phase !== 'closed';
  cancel.hidden = phase === 'closed';
  shutter.hidden = phase === 'closed' || phase === 'opening';
  shutter.disabled = phase !== 'ready';
  cameraPreview.hidden = phase === 'closed' || phase === 'opening';
  if (phase === 'opening' && focused === start) cancel.focus();
  if (phase === 'closed' && (focused === cancel || focused === shutter)) start.focus();
  if (phase === 'ready' && focused === cancel) shutter.focus();
  showStatus(message);
  updatePreview();
}

const camera = createCamera(byId('camera-video'), cameraState);

function cancelImport() {
  importOperation?.abort();
  importOperation = undefined;
  pickerPending = false;
  picker.value = '';
}

start.addEventListener('click', () => {
  cancelImport();
  workspace.reset();
  recognition.reset();
  camera.open();
});
cancel.addEventListener('click', () => camera.close('Camera canceled. Open it again or choose an image.'));
shutter.addEventListener('click', () => {
  try {
    const captured = camera.capture();
    if (!captured) return;
    showWorkingImage(captured);
    showStatus('Photo ready to review.');
    if (workspace.autoRead) runRecognition();
  } catch (error) {
    showStatus(error instanceof ImageInputError ? error.message : 'Could not take a photo. Reopen the camera or choose an image.');
  }
});

choose.addEventListener('click', () => {
  cancelImport();
  camera.close();
  showStatus('');
  pickerPending = true;
  updatePreview();
  picker.click();
});
picker.addEventListener('cancel', () => {
  pickerPending = false;
  workspace.cancelBlank();
  updatePreview();
});
picker.addEventListener('change', async () => {
  if (!pickerPending) return;
  const file = picker.files[0];
  cancelImport();
  updatePreview();
  if (!file) return;

  recognition.reset();
  workspace.resetCapture();
  const operation = new AbortController();
  importOperation = operation;
  updatePreview();
  showStatus('Reading the selected image…');
  let loaded = false;
  try {
    const imported = await importWorkingImage(file, operation.signal);
    if (importOperation !== operation) return;
    showWorkingImage(imported);
    loaded = true;
    showStatus('Image ready to review.');
  } catch (error) {
    if (importOperation === operation) {
      showStatus(error instanceof ImageInputError ? error.message : 'Could not read the image. Choose another JPEG or PNG.');
    }
  } finally {
    if (importOperation === operation) {
      importOperation = undefined;
      updatePreview();
      if (loaded && workspace.autoRead) runRecognition();
    }
  }
});

async function runRecognition() {
  if (workspace.editing || !workspace.canRead || !workingImage) return;
  const image = workingImage;
  const request = workspace.scanOptions();
  if (!request) {
    recognition.read(image);
    return;
  }
  const batch = workspace.activeBatch;
  if (captureOperation?.image === image) return;
  const operation = { image };
  captureOperation = operation;
  try {
    await grading.ready;
    if (workingImage !== image || workspace.activeBatch !== batch) return;
    showStatus('Saving the captured sheet locally…');
    const staged = await grading.stageCapture(request.profile, image, { corners: request.options.corners });
    if (workingImage === image && workspace.activeBatch === batch) {
      workingImage = staged;
      retryCheckpoint.hidden = true;
      showStatus('Capture saved. Reading the sheet…');
      recognition.read(staged, request);
    }
  } catch (error) {
    if (workingImage === image) {
      retryCheckpoint.hidden = false;
      showStatus(error?.name === 'QuotaExceededError'
        ? 'Local storage is full. The capture was not saved. Export your results and free storage before retrying.'
        : `The capture was not processed. ${error.message}`);
    }
  } finally {
    if (captureOperation === operation) captureOperation = undefined;
  }
}
read.addEventListener('click', () => runRecognition());
retryCheckpoint.addEventListener('click', runRecognition);

clear.addEventListener('click', () => {
  recognition.reset();
  cancelImport();
  camera.close();
  workingImage = undefined;
  workspace.reset();
  updatePreview();
  showStatus('Preview cleared.');
});

function resetPage() {
  recognition.reset();
  cancelImport();
  camera.close();
  workingImage = undefined;
  workspace.reset();
  updatePreview();
  showStatus('');
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && camera.state !== 'closed') {
    camera.close('Camera stopped while the app was in the background. Reopen it to continue.');
  }
});
window.addEventListener('pagehide', resetPage);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) resetPage();
});

const releaseId = document.querySelector('meta[name="scree-release"]').content;
byId('build-id').textContent = `Build ${releaseId.slice(0, 8)}`;
prepareOffline(byId('offline-status'), byId('retry-offline'));
