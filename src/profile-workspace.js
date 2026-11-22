import { createProfileEditor, sourceOnCanvas } from './profile-editor.js';
import { deleteProfile, listProfiles, saveProfile } from './profile-store.js';

const byId = (id) => document.getElementById(id);
const referenceKey = 'reference';
const key = ({ id, revision }) => `${id}@${revision}`;

export function createProfileWorkspace({ image, onChanged, requestBlank, read, onEditorClosed }) {
  const selector = byId('profile-selector');
  const profileStatus = byId('profile-status');
  const management = byId('profile-management');
  const manualPanel = byId('scan-corner-panel');
  const manualCanvas = byId('scan-corner-canvas');
  const manualBackground = document.createElement('canvas');
  const manual = byId('manual-corners');
  const batchConfirmation = byId('batch-confirmation');
  const attestation = byId('batch-attestation');
  const startBatch = byId('start-batch');
  const endBatch = byId('end-batch');
  const userCorners = [];
  let selectedKey = referenceKey;
  let profiles = [];
  let latest = new Map();
  let pendingBlank = false;
  let manageAction = null;
  let activeCorners;
  let activeBatch;
  let offeredBatch;
  let refreshSequence = 0;

  function selected() {
    return profiles.find((profile) => key(profile) === selectedKey);
  }

  function label() {
    const active = selected();
    byId('profile-pin').textContent = active
      ? activeBatch
        ? `Batch active for ${active.name}, revision ${active.revision}.`
        : `${active.name}, revision ${active.revision}. Start a batch to read marked sheets.`
      : 'Coded reference sheet selected.';
    selector.disabled = Boolean(activeBatch);
    startBatch.hidden = !active || Boolean(activeBatch) || !batchConfirmation.hidden;
    endBatch.hidden = !activeBatch;
    byId('setup-profile').disabled = Boolean(activeBatch);
    for (const control of ['revise-profile', 'rename-profile']) {
      const button = byId(control);
      button.hidden = !active || latest.get(active.id) !== active.revision;
      button.disabled = Boolean(activeBatch);
    }
    byId('delete-profile').hidden = !active;
    byId('delete-profile').disabled = Boolean(activeBatch);
  }

  function actions() {
    const enabled = Boolean(image() && activeBatch && selected() && !editor.active);
    byId('scan-registration').hidden = !enabled;
    manual.hidden = !enabled;
  }

  function closeBatchConfirmation() {
    offeredBatch = undefined;
    batchConfirmation.hidden = true;
    attestation.checked = false;
    byId('confirm-batch').disabled = true;
  }

  function clearBatch() {
    activeBatch = undefined;
    closeBatchConfirmation();
    label();
  }

  function closeManual() {
    manualPanel.hidden = true;
    manualCanvas.width = manualCanvas.height = manualBackground.width = manualBackground.height = 1;
    userCorners.length = 0;
  }

  function resetCapture() {
    activeCorners = undefined;
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
      const target = want ?? selectedKey;
      selectedKey = profiles.some((profile) => key(profile) === target) ? target : referenceKey;
      selector.value = selectedKey;
      label();
      if (previous !== selectedKey) {
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
    async onSave(profile) {
      const saved = await saveProfile(profile);
      editor.close();
      await refresh(key(saved));
      profileStatus.textContent = `Saved ${saved.name}, revision ${saved.revision}. Start a batch to scan marked copies.`;
      onEditorClosed(true);
    },
    onClose() { actions(); onEditorClosed(false); },
  });

  function beginBlank(prior) {
    if (activeBatch) return;
    closeBatchConfirmation();
    label();
    if (editor.active) editor.close();
    const current = image();
    profileStatus.textContent = '';
    if (!current) {
      pendingBlank = { prior };
      requestBlank();
      profileStatus.textContent = 'Choose a blank JPEG or PNG to set up this profile.';
      return;
    }
    resetCapture();
    editor.open(current, prior);
    onChanged();
    actions();
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
    if (activeBatch) return;
    closeBatchConfirmation();
    label();
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
    if (activeBatch) {
      selector.value = selectedKey;
      return;
    }
    closeBatchConfirmation();
    editor.close();
    closeManagement();
    pendingBlank = false;
    selectedKey = selector.value;
    resetCapture();
    label();
    onChanged();
  });
  startBatch.addEventListener('click', () => {
    const profile = selected();
    if (!profile || activeBatch || editor.active) return;
    closeManagement();
    offeredBatch = key(profile);
    batchConfirmation.hidden = false;
    byId('batch-summary').textContent = `Confirm ${profile.name}, revision ${profile.revision}, for these scans.`;
    label();
    attestation.focus();
  });
  attestation.addEventListener('change', () => {
    byId('confirm-batch').disabled = !attestation.checked;
  });
  byId('cancel-batch').addEventListener('click', () => {
    closeBatchConfirmation();
    label();
    startBatch.focus();
  });
  byId('confirm-batch').addEventListener('click', () => {
    const profile = selected();
    if (!profile || offeredBatch !== key(profile) || !attestation.checked || editor.active) return;
    activeBatch = Object.freeze({ profileId: profile.id, revision: profile.revision });
    closeBatchConfirmation();
    label();
    resetCapture();
    onChanged();
    endBatch.focus();
  });
  endBatch.addEventListener('click', () => {
    if (!activeBatch) return;
    clearBatch();
    resetCapture();
    onChanged({ clearImage: true });
    startBatch.focus();
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
    context.lineWidth = 2;
    context.font = '15px system-ui';
    context.fillStyle = context.strokeStyle = '#aa3c19';
    for (const [index, point] of userCorners.entries()) {
      const x = point.x * manualCanvas.width / current.width;
      const y = point.y * manualCanvas.height / current.height;
      context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.stroke();
      context.fillText(String(index + 1), x + 8, y - 7);
    }
    byId('apply-scan-corners').disabled = userCorners.length !== 4;
  }

  manual.addEventListener('click', () => {
    if (!image() || !activeBatch) return;
    onChanged();
    userCorners.length = 0;
    sourceOnCanvas(manualBackground, image());
    manualPanel.hidden = false;
    showManual();
    actions();
  });
  manualCanvas.addEventListener('pointerdown', (event) => {
    if (manualPanel.hidden || !image() || event.button !== 0) return;
    const rect = manualCanvas.getBoundingClientRect();
    if (userCorners.length === 4) userCorners.length = 0;
    userCorners.push({
      x: Math.min(image().width - 1, Math.max(0, (event.clientX - rect.left) * image().width / rect.width)),
      y: Math.min(image().height - 1, Math.max(0, (event.clientY - rect.top) * image().height / rect.height)),
    });
    showManual();
  });
  byId('reset-scan-corners').addEventListener('click', () => { userCorners.length = 0; showManual(); });
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
    cancelBlank() { pendingBlank = false; },
    get editing() { return editor.active; },
    get canRead() { return selectedKey === referenceKey || Boolean(activeBatch); },
  };
}
