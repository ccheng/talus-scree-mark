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
  const confirmIdentity = byId('confirm-identity');
  const userCorners = [];
  let selectedKey = referenceKey;
  let profiles = [];
  let latest = new Map();
  let pendingBlank = false;
  let manageAction = null;
  let activeCorners;
  let canConfirm = false;
  let refreshSequence = 0;

  function selected() {
    return profiles.find((profile) => key(profile) === selectedKey);
  }

  function label() {
    const active = selected();
    byId('profile-pin').textContent = active
      ? `${active.name}, revision ${active.revision}, remains selected for successive scans.`
      : 'Coded reference sheet selected.';
    byId('revise-profile').hidden = !active || latest.get(active.id) !== active.revision;
    byId('rename-profile').hidden = !active || latest.get(active.id) !== active.revision;
    byId('delete-profile').hidden = !active;
  }

  function actions() {
    const enabled = Boolean(image() && selected() && !editor.active);
    byId('scan-registration').hidden = !enabled;
    manual.hidden = !enabled;
    confirmIdentity.hidden = !enabled || !canConfirm;
  }

  function closeManual() {
    manualPanel.hidden = true;
    manualCanvas.width = manualCanvas.height = manualBackground.width = manualBackground.height = 1;
    userCorners.length = 0;
  }

  function resetCapture() {
    activeCorners = undefined;
    canConfirm = false;
    closeManual();
    actions();
  }

  function reset() {
    pendingBlank = false;
    editor.close();
    resetCapture();
  }

  async function refresh(want = selectedKey) {
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
      selectedKey = profiles.some((profile) => key(profile) === want) ? want : referenceKey;
      selector.value = selectedKey;
      label();
      if (previous !== selectedKey) {
        resetCapture();
        onChanged();
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
      profileStatus.textContent = `Saved ${saved.name}, revision ${saved.revision}. Choose a marked copy to scan.`;
      onEditorClosed(true);
    },
    onClose() { actions(); onEditorClosed(false); },
  });

  function beginBlank(prior) {
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
    resetCapture();
    label();
    onChanged();
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
    if (!image()) return;
    canConfirm = false;
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
    if (userCorners.length !== 4) return;
    activeCorners = userCorners.map(({ x, y }) => ({ x, y }));
    closeManual();
    read();
  });
  confirmIdentity.addEventListener('click', () => {
    if (canConfirm && image()) read(true);
  });

  function scanOptions(confirmedIdentity = false) {
    const profile = selected();
    if (!profile) return undefined;
    return {
      profile, options: { corners: activeCorners, confirmedIdentity, alternatives: profiles },
    };
  }

  function registered(result) {
    canConfirm = Boolean(result?.registration.canConfirmIdentity);
    actions();
  }

  window.addEventListener('focus', () => refresh());
  refresh();
  return { acceptImage, scanOptions, resetCapture, reset, registered, actions, get editing() { return editor.active; } };
}
