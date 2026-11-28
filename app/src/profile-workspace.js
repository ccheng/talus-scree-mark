import { enrollReferencePatches } from './cpas-recognition/compact-reference.js';
import { blankReference, referenceKey as evidenceKey } from './cpas-recognition/reference-store.js';
import { toGrayImage } from './omr-image.js';
import { createProfileEditor, insetCorners, nearestCorner, paintCornerMarkers, sourceOnCanvas } from './profile-editor.js';
import { proposePageCorners } from './markerless-registration.js';
import { readActiveBatch, writeActiveBatch } from './grading-store.js';
import { deleteProfile, listProfiles, saveProfile } from './profile-store.js';

const byId = (id) => document.getElementById(id);
const referenceKey = 'reference';
const key = ({ id, revision }) => `${id}@${revision}`;

export function createProfileWorkspace({ image, onChanged, requestBlank, read, onEditorClosed, onCaptureRequested, onBatchChanged, scope }) {
  const selector = byId('profile-selector');
  const profileStatus = byId('profile-status');
  const management = byId('profile-management');
  const manualPanel = byId('scan-corner-panel');
  const manualCanvas = byId('scan-corner-canvas');
  const manualBackground = document.createElement('canvas');
  const manual = byId('manual-corners');
  const scanCompleted = byId('scan-completed');
  const scanNext = byId('scan-next');
  const endBatch = byId('end-batch');
  const userCorners = [];
  let selectedKey = referenceKey;
  let profiles = [];
  let latest = new Map();
  let pendingBlank = false;
  let manageAction = null;
  let activeCorners;
  let estimatedCorners;
  let dragCorner = -1;
  let activeBatch;
  let refreshSequence = 0;
  let resumeInitial = true;

  function selected() {
    return profiles.find((profile) => key(profile) === selectedKey);
  }

  function label() {
    const active = selected();
    byId('profile-pin').textContent = active
      ? activeBatch
        ? `Batch active for ${active.name}, revision ${active.revision}.`
        : `${active.name}, revision ${active.revision}, selected.`
      : 'Coded reference sheet selected.';
    scanCompleted.hidden = !active || Boolean(activeBatch);
    scanNext.hidden = !activeBatch || !image();
    byId('profile-advanced').hidden = !active;

    endBatch.hidden = !activeBatch;
    for (const control of ['revise-profile', 'rename-profile']) {
      const button = byId(control);
      button.hidden = !active || latest.get(active.id) !== active.revision;
    }
    byId('delete-profile').hidden = !active;
  }

  function actions() {
    const enabled = Boolean(image() && activeBatch && selected() && !editor.active);
    scanNext.hidden = !enabled;
    byId('scan-registration').hidden = !enabled;
    manual.hidden = !enabled;
  }

  function clearBatch() {
    const previous = activeBatch;
    activeBatch = undefined;
    try { writeActiveBatch(localStorage, scope, undefined, previous); }
    catch (error) { profileStatus.textContent = `Could not clear the saved batch checkpoint. ${error.message}`; }
    label();
    onBatchChanged(undefined);
  }

  function closeManual() {
    manualPanel.hidden = true;
    manualCanvas.width = manualCanvas.height = manualBackground.width = manualBackground.height = 1;
    userCorners.length = 0;
    dragCorner = -1;
  }

  function resetCapture() {
    activeCorners = undefined;
    estimatedCorners = undefined;
    closeManual();
    actions();
  }

  function reset({ end = false } = {}) {
    if (end) clearBatch();
    pendingBlank = false;
    editor.close();
    resetCapture();
  }

  async function refresh(want) {
    const transaction = ++refreshSequence;
    try {
      const all = await listProfiles({ allRevisions: true });
      if (transaction !== refreshSequence) return;
      profiles = all.sort((a, b) => a.name.localeCompare(b.name) || b.revision - a.revision);
      latest = new Map();
      for (const profile of profiles) latest.set(profile.id, Math.max(latest.get(profile.id) ?? 0, profile.revision));
      const previous = selectedKey;
      selector.replaceChildren(new Option('Coded reference sheet (M2)', referenceKey), ...profiles.map((profile) =>
        new Option(`${profile.name} (revision ${profile.revision})`, key(profile))));
      const resume = resumeInitial ? readActiveBatch(localStorage, scope) : undefined;
      resumeInitial = false;
      const target = want ?? (resume ? key({ id: resume.profileId, revision: resume.revision }) : selectedKey);
      selectedKey = profiles.some((profile) => key(profile) === target) ? target : referenceKey;
      selector.value = selectedKey;
      label();
      if (resume && selectedKey !== referenceKey && want === undefined) {
        activeBatch = Object.freeze(resume);
        label();
        resetCapture();
        onBatchChanged(activeBatch);
        onChanged();
        profileStatus.textContent = 'Resumed the saved grading batch.';
      } else if (previous !== selectedKey) {
        const wasActive = Boolean(activeBatch);
        clearBatch();
        resetCapture();
        onChanged({ clearImage: wasActive });
      }
    } catch (error) {
      profileStatus.textContent = `Saved profiles are unavailable. ${error.message}`;
    }
  }

  const editor = createProfileEditor({
    async onSave(profile, evidence) {
      const saved = await saveProfile(profile);
      let previewNote = '';
      if (evidence) {
        const key = evidenceKey(saved);
        try {
          if (evidence.reference) {
            const { image, matrix } = evidence.reference;
            const envelope = enrollReferencePatches(toGrayImage(image), saved, { status: 'registered', pageToSource: matrix },
              { confirmedBlank: true });
            if (envelope.usable.some(Boolean)) {
              await blankReference(key, 'save', envelope);
              previewNote = ' Compact recognition samples saved.';
            } else previewNote = ' The blank did not yield usable recognition samples.';
          }
          if (Object.keys(evidence.boxes).length) await blankReference('handwriting:' + key, 'save', evidence.boxes);
        } catch { previewNote += ' Experimental evidence could not be saved.'; }
      }
      editor.close();
      await refresh(key(saved));
      profileStatus.textContent = `Saved ${saved.name}, revision ${saved.revision}. Select Scan completed sheet when you are ready.${previewNote}`;
      onEditorClosed(true);
    },
    onClose() { actions(); onEditorClosed(false); },
  });

  function beginBlank(prior) {
    clearBatch();
    editor.close();
    closeManagement();
    resetCapture();
    onChanged({ clearImage: true });
    pendingBlank = { prior };
    requestBlank();
    profileStatus.textContent = 'Choose a blank JPEG or PNG to set up this profile.';
  }

  function acceptImage(next) {
    editor.close();
    resetCapture();
    if (!pendingBlank) return;
    const { prior } = pendingBlank;
    pendingBlank = false;
    editor.open(next, prior);
    onChanged();
    actions();
  }

  function closeManagement() {
    management.hidden = true;
    manageAction = null;
  }

  function selectManagement(action) {
    const profile = selected();
    if (!profile) return;
    manageAction = { action, profile };
    const rename = action === 'rename';
    management.hidden = false;
    byId('rename-profile-label').hidden = !rename;
    byId('rename-profile-name').required = rename;
    byId('rename-profile-name').value = rename ? profile.name : '';
    byId('profile-management-message').textContent = rename
      ? 'Renaming saves a new revision with unchanged bubble positions.'
      : `Delete all stored revisions of ${profile.name} from this device?`;
    (rename ? byId('rename-profile-name') : byId('confirm-profile-management')).focus();
  }

  selector.addEventListener('change', () => {
    editor.close();
    closeManagement();
    pendingBlank = false;
    selectedKey = selector.value;
    clearBatch();
    resetCapture();
    onChanged({ clearImage: true });
  });
  scanCompleted.addEventListener('click', () => {
    const profile = selected();
    if (!profile || activeBatch || editor.active) return;
    closeManagement();
    const next = Object.freeze({ id: crypto.randomUUID(), profileId: profile.id, revision: profile.revision });
    try { writeActiveBatch(localStorage, scope, next); }
    catch (error) { profileStatus.textContent = `Could not save the batch checkpoint. ${error.message}`; return; }
    activeBatch = next;
    onBatchChanged(activeBatch);
    label();
    resetCapture();
    onCaptureRequested();
  });
  scanNext.addEventListener('click', () => {
    if (!activeBatch || editor.active) return;
    resetCapture();
    onCaptureRequested();
  });
  endBatch.addEventListener('click', () => {
    if (!activeBatch) return;
    clearBatch();
    resetCapture();
    onChanged({ clearImage: true });
    scanCompleted.focus();
  });
  byId('setup-profile').addEventListener('click', () => beginBlank());
  byId('revise-profile').addEventListener('click', () => beginBlank(selected()));
  byId('rename-profile').addEventListener('click', () => selectManagement('rename'));
  byId('delete-profile').addEventListener('click', () => selectManagement('delete'));
  byId('cancel-profile-management').addEventListener('click', closeManagement);
  management.addEventListener('submit', async (event) => {
    event.preventDefault();
    const intent = manageAction;
    if (!intent) return;
    const button = byId('confirm-profile-management');
    button.disabled = true;
    try {
      const { action, profile } = intent;
      if (action === 'delete') {
        await deleteProfile(profile.id);
        await refresh(referenceKey);
        profileStatus.textContent = 'Profile and its revisions deleted.';
      } else {
        const updated = await saveProfile({
          ...profile, name: byId('rename-profile-name').value.trim(), revision: profile.revision + 1,
        });
        await refresh(key(updated));
        profileStatus.textContent = `Saved ${updated.name}, revision ${updated.revision}.`;
      }
      closeManagement();
    } catch (error) {
      profileStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  function showManual() {
    const current = image();
    if (!current) return;
    manualCanvas.width = manualBackground.width;
    manualCanvas.height = manualBackground.height;
    const context = manualCanvas.getContext('2d');
    context.drawImage(manualBackground, 0, 0);
    context.scale(manualCanvas.width / current.width, manualCanvas.height / current.height);
    paintCornerMarkers(context, current, userCorners, manualCanvas.getBoundingClientRect().width, dragCorner);
    manualCanvas.dataset.corners = JSON.stringify(userCorners);
    byId('apply-scan-corners').disabled = userCorners.length !== 4;
  }

  manual.addEventListener('click', () => {
    if (!image() || !activeBatch) return;
    onChanged();
    seedCorners();
    sourceOnCanvas(manualBackground, image());
    manualPanel.hidden = false;
    showManual();
    actions();
  });
  function seedCorners() {
    const corners = activeCorners ?? estimatedCorners ?? proposePageCorners(image()) ?? insetCorners(image());
    userCorners.splice(0, userCorners.length, ...structuredClone(corners));
  }
  function cornerPoint(event) {
    const rect = manualCanvas.getBoundingClientRect();
    return {
      x: Math.min(image().width - 1, Math.max(0, (event.clientX - rect.left) * image().width / rect.width)),
      y: Math.min(image().height - 1, Math.max(0, (event.clientY - rect.top) * image().height / rect.height)),
    };
  }
  manualCanvas.addEventListener('pointerdown', (event) => {
    if (manualPanel.hidden || !image() || event.button !== 0) return;
    dragCorner = nearestCorner(manualCanvas, image(), userCorners, cornerPoint(event));
    if (dragCorner >= 0) manualCanvas.setPointerCapture(event.pointerId);
  });
  manualCanvas.addEventListener('pointermove', (event) => {
    if (dragCorner < 0 || !image()) return;
    userCorners[dragCorner] = cornerPoint(event);
    showManual();
  });
  manualCanvas.addEventListener('pointerup', (event) => {
    if (dragCorner < 0 || !image()) return;
    userCorners[dragCorner] = cornerPoint(event);
    dragCorner = -1;
    showManual();
  });
  manualCanvas.addEventListener('pointercancel', () => { dragCorner = -1; showManual(); });
  byId('reset-scan-corners').addEventListener('click', () => { seedCorners(); showManual(); });
  byId('cancel-scan-corners').addEventListener('click', closeManual);
  byId('apply-scan-corners').addEventListener('click', () => {
    if (userCorners.length !== 4 || !activeBatch) return;
    activeCorners = userCorners.map(({ x, y }) => ({ x, y }));
    closeManual();
    read();
  });
  function scanOptions() {
    const profile = selected();
    if (!profile) return undefined;
    return { profile, options: { corners: activeCorners, batch: activeBatch } };
  }

  window.addEventListener('focus', () => refresh());
  refresh();
  return {
    acceptImage, scanOptions, resetCapture, reset,
    restoreCorners(corners) { activeCorners = corners; },
    get activeBatch() { return activeBatch; },
    get selectedProfile() { return selected(); },
    observeRegistration(registration) {
      const points = registration?.diagnostics?.pagePose?.corners;
      if (points?.length === 4) estimatedCorners = points;
    },
    cancelBlank() { pendingBlank = false; },
    get editing() { return editor.active; },
    get canRead() { return selectedKey === referenceKey || Boolean(activeBatch); },
    get autoRead() { return Boolean(activeBatch); },
    get captureVisible() { return selectedKey === referenceKey || Boolean(activeBatch); },
  };
}
