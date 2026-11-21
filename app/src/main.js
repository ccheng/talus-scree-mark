import { createCamera } from './camera.js';
import { importWorkingImage, ImageInputError } from './image.js';
import { prepareOffline } from './offline.js';
import { createRecognitionView } from './recognition-view.js';

const byId = (id) => document.getElementById(id);
const start = byId('start-camera');
const shutter = byId('shutter');
const cancel = byId('cancel-camera');
const choose = byId('choose-image');
const picker = byId('image-picker');
const clear = byId('clear-image');
const status = byId('capture-status');
const cameraPreview = byId('camera-preview');
const sheet = byId('image-preview');
const canvas = byId('sheet-canvas');
const caption = byId('preview-caption');
let workingImage;
let importOperation;
let pickerPending = false;
const read = byId('read-bubbles');
const recognition = createRecognitionView({
  button: read, status: byId('recognition-status'), results: byId('recognition-results'),
  table: byId('recognition-items'), overlay: byId('recognition-overlay'),
});

function showStatus(message) {
  status.textContent = message;
}

function updatePreview() {
  const focused = document.activeElement;
  start.textContent = workingImage?.source === 'camera' ? 'Retake photo' : 'Open camera';
  clear.hidden = !workingImage;
  sheet.hidden = !workingImage || camera.state !== 'closed';
  recognition.setAvailable(!sheet.hidden && !pickerPending && !importOperation);
  if (!workingImage) {
    canvas.width = 1;
    canvas.height = 1;
    caption.textContent = '';
    if (focused === clear) start.focus();
  }
}

function showWorkingImage(image) {
  recognition.reset();
  workingImage = image;
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(image.pixels, 0, 0);
  caption.textContent = `${image.width} × ${image.height} pixels`;
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
  updatePreview();
});
picker.addEventListener('change', async () => {
  if (!pickerPending) return;
  const file = picker.files[0];
  cancelImport();
  updatePreview();
  if (!file) return;

  recognition.reset();
  const operation = new AbortController();
  importOperation = operation;
  updatePreview();
  showStatus('Reading the selected image…');
  try {
    const imported = await importWorkingImage(file, operation.signal);
    if (importOperation !== operation) return;
    showWorkingImage(imported);
    showStatus('Image ready to review.');
  } catch (error) {
    if (importOperation === operation) {
      showStatus(error instanceof ImageInputError ? error.message : 'Could not read the image. Choose another JPEG or PNG.');
    }
  } finally {
    if (importOperation === operation) {
      importOperation = undefined;
      updatePreview();
    }
  }
});

read.addEventListener('click', () => recognition.read(workingImage));

clear.addEventListener('click', () => {
  recognition.reset();
  cancelImport();
  camera.close();
  workingImage = undefined;
  updatePreview();
  showStatus('Preview cleared.');
});

function resetPage() {
  recognition.reset();
  cancelImport();
  camera.close();
  workingImage = undefined;
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
