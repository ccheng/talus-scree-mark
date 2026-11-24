import { addDecision, gradeScan, sameTemplate, templateSnapshot, validateCategories, validateKey } from './grading.js';
import { deleteScans, loadGrading, restoreGrading, saveKey, saveScan } from './grading-store.js';
import { exportBackup, exportCsv, parseBackup } from './grading-export.js';

const byId = (id) => document.getElementById(id);
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

function node(tag, value) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  return element;
}

function photoOf(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').putImageData(image.pixels, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not retain this scan photograph.')), 'image/png'));
}

export function createGradingView() {
  const status = byId('grading-status');
  const say = (message) => { status.textContent = message; };
  const keyPanel = byId('grading-key-panel');
  const result = byId('grading-result');
  const picker = byId('grading-saved');
  const photo = byId('grading-photo');
  const inSession = new Map();
  let stored = { keys: [], scans: [] };
  let selected;
  let active;
  let batchId = uuid();
  let sequence = 0;
  let photoUrl;
  let renderedPhoto;
  let rescan;
  let busy = false;
  let keyTemplate;

  const keyOf = (id) => stored.keys.find((key) => key.id === id);
  const latest = (template) => stored.keys.filter((key) => sameTemplate(template, key.template))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const records = () => [...stored.scans, ...inSession.values()];
  const current = () => records().find(({ id }) => id === active);
  const isDraft = (scan) => inSession.has(scan.id);

  function renderList() {
    picker.replaceChildren(new Option('Choose a result', ''), ...records()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((scan) => new Option(`${scan.label} · ${scan.template.name} · ${isDraft(scan) ? 'in session' : 'saved'}`, scan.id)));
    picker.value = active ?? '';
  }

  function setPhoto(scan) {
    if (renderedPhoto === scan?.photo) return;
    renderedPhoto = scan?.photo;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = scan?.photo ? URL.createObjectURL(scan.photo) : undefined;
    photo.removeAttribute('src');
    if (photoUrl) photo.src = photoUrl;
    photo.hidden = !photoUrl;
  }

  function render() {
    renderList();
    const scan = current();
    result.hidden = !scan;
    setPhoto(scan);
    if (!scan) return;
    const { grade } = scan;
    const scope = byId('grading-scope');
    scope.hidden = scan.template.scope !== 'mc-only';
    scope.textContent = scope.hidden ? '' : 'MC only · NR and WR excluded';
    const categories = grade.categories;
    byId('grading-subtotals-panel').hidden = !categories;
    const names = categories?.dimensions.map(({ name }) => name);
    byId('grading-subtotals').replaceChildren(...[...(categories?.subtotals ?? [])].sort((a, b) =>
      (a.dimension ?? 3) - (b.dimension ?? 3)).map(({ dimension, values, score, denominator, pending }) => {
      const row = node('tr');
      const label = (i) => `${names[i]} — ${values[i] ?? '(Unassigned)'}`;
      row.append(node('td', dimension === null ? [label(0), label(1)].join(' × ') : label(dimension - 1)),
        node('td', `${score}/${denominator}`), node('td', pending));
      return row;
    }));
    byId('grading-score').textContent = `${grade.score}/${grade.denominator} · ${grade.pending} pending · ${grade.status}`;
    byId('grading-label').textContent = scan.label + (isDraft(scan) ? ' · In session' : ' · Saved locally');
    byId('grading-photo-status').textContent = scan.photoStatus === 'deleted' ? 'Photograph deleted.'
      : scan.photo ? 'Source image used for recognition.' : 'Preparing source image…';
    byId('grading-save').hidden = !isDraft(scan);
    byId('grading-save').disabled = !scan.photo || busy;
    byId('grading-delete-photo').disabled = isDraft(scan) || !scan.photo || busy;
    byId('grading-repeat').disabled = isDraft(scan) || !sameTemplate(scan.template, selected);
    byId('grading-regrade').disabled = !latest(scan.template) || latest(scan.template).id === scan.keyId;
    const itemPicker = byId('grading-item');
    const itemId = itemPicker.value;
    itemPicker.replaceChildren(...grade.items.map(({ id, pending }) => new Option(id + (pending ? ' · review' : ''), id)));
    if (grade.items.some(({ id }) => id === itemId)) itemPicker.value = itemId;
    byId('grading-items').replaceChildren(...grade.items.map((item) => {
      const tr = node('tr');
      for (const value of [item.id, item.raw ?? '—', item.effective ?? '—',
        item.pending ? `${item.status} · review` : item.status, item.points,
        item.pending ? item.reason : item.adjudication ?? '']) tr.append(node('td', value));
      return tr;
    }));
    byId('grading-history').replaceChildren(...scan.history.map(({ itemId, kind, value, at }) =>
      node('li', `${itemId} · ${kind}${kind === 'correct' ? ' ' + (value || '(blank)') : ''} · ${at}`)));
  }

  async function refresh() {
    stored = await loadGrading();
    render();
  }

  async function act(operation) {
    if (busy) return;
    busy = true;
    try {
      await operation();
    } catch (error) {
      say(`Local operation failed. ${error?.name === 'ConstraintError'
        ? 'A saved result already has that ID. Remove the duplicate before restoring.' : error.message}`);
    } finally {
      busy = false;
      render();
    }
  }

  function select(profile, newBatch = false) {
    const next = profile ? templateSnapshot(profile) : undefined;
    if (newBatch || (!sameTemplate(next, selected) && (next || selected))) {
      batchId = uuid();
      sequence = 0;
    }
    selected = next;
    byId('grading-edit-key').disabled = !selected;
    if (!sameTemplate(keyTemplate, selected)) keyPanel.hidden = true;
    if (rescan && (newBatch || !sameTemplate(rescan.scan.template, selected))) rescan = undefined;
    showRescan();
    render();
  }

  function showRescan() {
    byId('grading-rescan-note').textContent = rescan ? `Next completed scan is an explicit rescan of ${rescan.scan.label}.` : '';
    byId('grading-cancel-rescan').hidden = !rescan;
  }

  async function observe(observation, profile, image) {
    if (!profile || observation.status !== 'read') return;
    const template = templateSnapshot(profile);
    const id = image.id;
    const existing = records().find((scan) => scan.id === id);
    if (existing) {
      if (!isDraft(existing) || existing.history.length) {
        say('This capture already has a grading record. Use Scan next sheet or Rescan this sheet to grade a fresh capture.');
      } else {
        const updated = { ...existing, observation };
        updated.grade = gradeScan(updated, keyOf(updated.keyId));
        inSession.set(id, updated);
        active = id;
        render();
      }
      return;
    }
    const source = rescan && sameTemplate(rescan.scan.template, template) ? rescan : undefined;
    rescan = undefined;
    showRescan();
    const started = now();
    const scan = {
      id, label: source ? `Rescan of ${source.scan.label}` : `Sheet ${++sequence} · ${id.slice(0, 6)}`,
      batchId: source?.scan.batchId ?? batchId, template, observation,
      history: source?.reuse ? structuredClone(source.scan.history) : [],
      rescanOf: source?.scan.id ?? null, reusedCorrections: Boolean(source?.reuse),
      createdAt: started, updatedAt: started, keyId: null, photo: null, photoStatus: 'retained',
    };
    const key = source ? keyOf(source.scan.keyId) : latest(template);
    scan.keyId = key?.id ?? null;
    scan.grade = gradeScan(scan, key);
    inSession.set(id, scan);
    active = id;
    render();
    try {
      const blob = await photoOf(image);
      const record = inSession.get(id);
      if (record) inSession.set(id, { ...record, photo: blob });
      render();
    } catch (error) {
      say(error.message);
    }
  }

  const categoryRows = byId('grading-category-assignments');
  const categoryMessage = (text) => { byId('grading-category-status').textContent = text; };
  const categoryFields = () => [1, 2].map((i) => ({
    name: byId('grading-category-name-' + i).value.trim(),
    values: byId('grading-category-values-' + i).value.split(/\r?\n/).map((label) => label.trim()).filter(Boolean),
  }));
  const assignments = () => Object.fromEntries([...categoryRows.children].map((row) => [
    row.dataset.categoryQuestion, [...row.querySelectorAll('select')].map(({ value }) => value || null),
  ]));
  const valueOptions = (values) => [new Option('(Unassigned)', ''), ...values.map((value) => new Option(value))];
  let activeDimensions;

  function updateBulkChoices() {
    const index = Number(byId('grading-category-dimension').value);
    byId('grading-category-value').replaceChildren(...valueOptions(activeDimensions[index].values));
  }

  function renderCategoryEditor(dimensions, storedAssignments = {}) {
    activeDimensions = dimensions;
    const items = keyTemplate.items;
    byId('grading-category-controls').hidden = !dimensions;
    categoryRows.replaceChildren();
    if (!dimensions) return;
    for (const id of ['grading-category-from', 'grading-category-through']) {
      byId(id).replaceChildren(...items.map(({ id }) => new Option(id)));
    }
    byId('grading-category-through').selectedIndex = items.length - 1;
    byId('grading-category-dimension').replaceChildren(...dimensions.map(({ name }, i) => new Option(name, i)));
    updateBulkChoices();
    categoryRows.replaceChildren(...items.map(({ id }) => {
      const row = node('div');
      row.dataset.categoryQuestion = id;
      const checkLabel = node('label', id + ' ');
      const check = node('input');
      check.type = 'checkbox';
      checkLabel.append(check);
      row.append(checkLabel);
      dimensions.forEach(({ name, values }, i) => {
        const label = node('label', name + ' ');
        const input = node('select');
        input.dataset.categoryDimension = i + 1;
        input.replaceChildren(...valueOptions(values));
        const value = Object.hasOwn(storedAssignments, id) ? storedAssignments[id][i] : null;
        input.value = values.includes(value) ? value : '';
        label.append(input);
        row.append(label);
      });
      return row;
    }));
  }

  byId('grading-category-refresh').onclick = () => {
    const dimensions = categoryFields();
    if (dimensions.every(({ name, values }) => !name && !values.length)) {
      renderCategoryEditor(undefined);
      categoryMessage('Categories cleared in this draft.');
      return;
    }
    try {
      validateCategories(keyTemplate, { dimensions, assignments: {} });
      const previous = assignments();
      renderCategoryEditor(dimensions, previous);
      const cleared = Object.values(previous).some((values) =>
        values.some((value, i) => value !== null && !dimensions[i].values.includes(value)));
      categoryMessage(cleared ? 'Assignments with removed values are now unassigned.' : 'Category choices updated.');
    } catch (error) { categoryMessage(error.message); }
  };
  byId('grading-category-dimension').onchange = updateBulkChoices;
  for (const mode of ['range', 'selected']) {
    byId('grading-category-' + mode).onclick = () => {
      const rows = [...categoryRows.children];
      const first = byId('grading-category-from').selectedIndex;
      const last = byId('grading-category-through').selectedIndex;
      const targets = mode === 'range' && last >= first ? rows.slice(first, last + 1) :
        mode === 'selected' ? rows.filter((row) => row.querySelector('input').checked) : [];
      if (!targets.length) return categoryMessage('Choose questions to assign.');
      const dimension = Number(byId('grading-category-dimension').value);
      const value = byId('grading-category-value').value;
      targets.forEach((row) => { row.querySelectorAll('select')[dimension].value = value; });
      categoryMessage(`Updated ${targets.length} questions.`);
    };
  }

  function showKey(template) {
    if (!template) return;
    keyTemplate = template;
    const key = latest(template);
    byId('grading-key-title').textContent = `Answer key · ${template.name}, revision ${template.revision}`;
    byId('grading-key-inputs').replaceChildren(...template.items.map(({ id, kind, choices }) => {
      const label = node('label', id + ' ');
      const input = kind === 'mc' ? node('select') : node('input');
      if (kind === 'mc') input.replaceChildren(new Option('Unkeyed', ''), ...choices.map((choice) => new Option(choice)));
      else {
        input.maxLength = 4;
        input.inputMode = 'decimal';
      }
      input.name = id;
      input.value = key?.answers[id] ?? '';
      label.append(input);
      return label;
    }));
    for (const [i, field] of [1, 2].entries()) {
      const dimension = key?.categories?.dimensions[i];
      byId('grading-category-name-' + field).value = dimension?.name ?? '';
      byId('grading-category-values-' + field).value = dimension?.values.join('\n') ?? '';
    }
    renderCategoryEditor(key?.categories?.dimensions, key?.categories?.assignments);
    byId('grading-categories').open = Boolean(key?.categories);
    categoryMessage('');
    keyPanel.hidden = false;
  }

  byId('grading-edit-key').onclick = () => showKey(selected);
  byId('grading-edit-saved-key').onclick = () => showKey(current()?.template);
  byId('grading-key-cancel').onclick = () => { keyPanel.hidden = true; };
  keyPanel.onsubmit = (event) => {
    event.preventDefault();
    act(async () => {
      const answers = Object.fromEntries([...new FormData(keyPanel)].filter(([, value]) => value !== ''));
      const dimensions = categoryFields();
      const configured = dimensions.some(({ name, values }) => name || values.length);
      if (configured && JSON.stringify(dimensions) !== JSON.stringify(activeDimensions)) {
        throw new Error('Update category choices before saving this key.');
      }
      const categories = configured ? validateCategories(keyTemplate, { dimensions, assignments: assignments() }) : undefined;
      const key = { id: uuid(), template: keyTemplate, answers: validateKey(keyTemplate, answers), createdAt: now(),
        ...(categories ? { categories } : {}) };
      await saveKey(key);
      stored.keys.push(key);
      keyPanel.hidden = true;
      say('Answer key saved locally as a new revision.');
    });
  };

  picker.onchange = () => { active = picker.value || undefined; render(); };
  byId('grading-save').onclick = () => act(async () => {
    const scan = current();
    if (!scan?.photo || !isDraft(scan)) return;
    await saveScan(scan, { create: true });
    stored.scans.push(scan);
    inSession.delete(scan.id);
    say('Result and source photograph saved locally.');
  });

  async function update(scan, updated, key) {
    const version = uuid();
    const next = { ...updated, grade: gradeScan(updated, key), updatedAt: version };
    if (isDraft(scan)) inSession.set(scan.id, next);
    else {
      const saved = await saveScan({ ...next, previousUpdate: scan.updatedAt });
      stored.scans = stored.scans.map((old) => old.id === saved.id ? saved : old);
    }
  }

  for (const kind of ['correct', 'award', 'deny', 'undo']) {
    byId('grading-' + kind).onclick = () => act(async () => {
      const scan = current();
      if (!scan) return;
      const itemId = byId('grading-item').value;
      await update(scan, addDecision(scan, itemId, kind, byId('grading-answer').value), keyOf(scan.keyId));
      byId('grading-answer').value = '';
      say(isDraft(scan) ? 'Review updated in this session.' : 'Review updated locally.');
    });
  }

  byId('grading-regrade').onclick = () => act(async () => {
    const scan = current();
    const key = latest(scan?.template);
    if (!scan || !key || !confirm('Regrade this result using the newest compatible key?')) return;
    await update(scan, { ...scan, keyId: key.id, regrades: [...(scan.regrades ?? []),
      { previousKeyId: scan.keyId, keyId: key.id, at: now() }] }, key);
    say('Regraded against the latest key.');
  });

  byId('grading-repeat').onclick = () => {
    const scan = current();
    if (!scan || !sameTemplate(scan.template, selected) ||
        !confirm(`Confirm the next scan is the same physical sheet as ${scan.label}.`)) return;
    rescan = { scan, reuse: Boolean(scan.history.length && confirm('Reuse the previous corrections and credit decisions on this rescan?')) };
    showRescan();
  };
  byId('grading-cancel-rescan').onclick = () => { rescan = undefined; showRescan(); };
  byId('grading-delete-photo').onclick = () => act(async () => {
    const scan = current();
    if (scan && !isDraft(scan) && confirm('Delete the retained photograph from this device?')) {
      await update(scan, { ...scan, photo: null, photoStatus: 'deleted' }, keyOf(scan.keyId));
      say('Photograph deleted. The grading record remains.');
    }
  });

  function batch(scan) {
    return scan ? records().filter(({ batchId: id }) => id === scan.batchId) : [];
  }

  for (const [id, wholeBatch] of [['grading-delete-result', false], ['grading-delete-batch', true]]) {
    byId(id).onclick = () => act(async () => {
      const scan = current();
      if (!scan || !confirm(wholeBatch ? 'Delete all results and photographs in this batch?' : 'Delete this result and photograph?')) return;
      const ids = (wholeBatch ? batch(scan) : [scan]).map((record) => record.id);
      await deleteScans(ids);
      for (const id of ids) inSession.delete(id);
      stored.scans = stored.scans.filter((record) => !ids.includes(record.id));
      if (rescan && ids.includes(rescan.scan.id)) { rescan = undefined; showRescan(); }
      active = undefined;
      say('Results deleted locally.');
    });
  }

  async function download(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = node('a', 'Download ' + filename);
    link.href = url;
    link.download = filename;
    const output = byId('grading-download');
    if (output.firstChild?.href) URL.revokeObjectURL(output.firstChild.href);
    output.replaceChildren(link);
    // Keep an explicit link so iPhone can download with a fresh user gesture
    // even if building a large backup outlasted the initial gesture.
    link.focus();
    say('Export ready. Tap the download link.');
  }

  byId('grading-csv').onclick = () => act(async () => {
    const scans = batch(current());
    if (!scans.length) throw new Error('Choose a result to export its batch.');
    await download(exportCsv(scans), 'text/csv', 'scree-grades.csv');
  });
  byId('grading-json').onclick = () => act(async () => {
    const scans = records();
    if (scans.some((scan) => !scan.photo && scan.photoStatus !== 'deleted')) throw new Error('A source photograph is not ready.');
    await download(await exportBackup({ keys: stored.keys, scans }), 'application/json', 'scree-backup.json');
  });
  const importInput = byId('grading-import');
  importInput.onchange = () => {
    const file = importInput.files[0];
    importInput.value = '';
    if (!file) return;
    act(async () => {
      const backup = await parseBackup(await file.text());
      if (backup.scans.some(({ id }) => inSession.has(id))) throw new Error('An in-session result already has that ID.');
      await restoreGrading(backup);
      await refresh();
      say('Backup restored locally.');
    });
  };

  refresh().catch((error) => say(`Saved results unavailable. ${error.message}`));
  return { select, observe };
}
