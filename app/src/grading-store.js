const name = 'talus-scree-mark-grading';
const journalName = 'talus-scree-mark-capture-journal';

async function transaction(mode, action, database = name) {
  const tables = database === journalName ? ['captures'] : ['keys', 'scans'];
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    let missing = false;
    let abandoned = false;
    request.onupgradeneeded = () => {
      if (mode === 'readonly' || abandoned) {
        missing = mode === 'readonly';
        request.transaction.abort();
        return;
      }
      for (const table of tables) request.result.createObjectStore(table, { keyPath: 'id' });
    };
    request.onerror = () => missing ? resolve(null) : reject(request.error);
    request.onblocked = () => {
      abandoned = true;
      reject(new Error('Close other tabs using Scree Mark and try again.'));
    };
    request.onsuccess = () => {
      if (abandoned) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
  if (!db) return { keys: [], scans: [] };
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(tables, mode);
      const stores = Object.fromEntries(tables.map((table) => [table, tx.objectStore(table)]));
      let result;
      let error;
      const abort = (reason) => { error = reason; tx.abort(); };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error ?? tx.error ?? new Error('The local write did not complete.'));
      try {
        action(stores, (value) => { result = value; }, abort);
      } catch (reason) {
        abort(reason);
      }
    });
  } finally {
    db.close();
  }
}

export function loadGrading() {
  return transaction('readonly', ({ keys, scans }, complete) => {
    const keyRequest = keys.getAll();
    const scanRequest = scans.getAll();
    scanRequest.onsuccess = () => complete({ keys: keyRequest.result, scans: scanRequest.result });
  });
}

export function saveKey(key) {
  return transaction('readwrite', ({ keys }) => keys.add(key));
}

export function saveScan(scan, { create = false } = {}) {
  return transaction('readwrite', ({ scans }, complete, abort) => {
    if (create) {
      scans.add(scan);
      return;
    }
    const request = scans.get(scan.id);
    request.onsuccess = () => {
      if (!request.result || request.result.updatedAt !== scan.previousUpdate) {
        abort(new Error('This result changed in another view. Reopen it before editing.'));
        return;
      }
      const { previousUpdate, ...record } = scan;
      scans.put(record);
      complete(record);
    };
  });
}

export function deleteScans(ids) {
  return transaction('readwrite', ({ scans }) => {
    for (const id of ids) scans.delete(id);
  });
}

export function restoreGrading(backup) {
  // add() aborts the whole transaction on an existing scan ID. Existing
  // byte-equivalent key records may be shared by older and restored batches.
  return transaction('readwrite', ({ keys, scans }, _complete, abort) => {
    for (const key of backup.keys) {
      const request = keys.get(key.id);
      request.onsuccess = () => {
        if (!request.result) keys.add(key);
        else if (JSON.stringify(request.result) !== JSON.stringify(key)) abort(new Error('An existing answer key has a conflicting ID.'));
      };
    }
    for (const scan of backup.scans) scans.add(scan);
  });
}

export async function loadPendingCaptures(scope) {
  const result = await transaction('readonly', ({ captures }, complete) => {
    const request = captures.getAll();
    request.onsuccess = () => complete(request.result.filter((capture) => capture.scope === scope));
  }, journalName);
  return Array.isArray(result) ? result : [];
}

export function savePendingCapture(capture) {
  return transaction('readwrite', ({ captures }) => captures.add(capture), journalName);
}

export function deletePendingCapture(id) {
  return transaction('readwrite', ({ captures }) => captures.delete(id), journalName);
}

export async function completeCapture(scan, capture) {
  if (capture.id !== scan.id || capture.profileId !== scan.template.id || capture.revision !== scan.template.revision) {
    throw new Error('The captured sheet does not match this result.');
  }
  // The unique scan ID is the commit marker. The new journal uses a separate
  // database so pinned builds can still open their original database version.
  const record = { ...scan, photo: capture.photo };
  await saveScan(record, { create: true });
  return record;
}

// Recovery metadata belongs to the app path. Saved grades remain shared.
export function readActiveBatch(storage, scope) {
  try {
    const value = JSON.parse(storage.getItem('scree-active-batch:' + scope) ?? 'null');
    if (typeof value?.id === 'string' && value.id && typeof value.profileId === 'string' && value.profileId &&
        Number.isSafeInteger(value.revision) && value.revision > 0) return value;
  } catch { /* An unreadable checkpoint cannot authorize a sheet. */ }
}

export function writeActiveBatch(storage, scope, next, previous) {
  const field = 'scree-active-batch:' + scope;
  if (next) storage.setItem(field, JSON.stringify(next));
  else if (previous && readActiveBatch(storage, scope)?.id === previous.id) storage.removeItem(field);
}
