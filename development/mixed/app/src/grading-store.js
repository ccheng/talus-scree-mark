const name = 'talus-scree-mark-grading';

async function transaction(mode, action) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let missing = false;
    let abandoned = false;
    request.onupgradeneeded = () => {
      if (mode === 'readonly' || abandoned) {
        missing = mode === 'readonly';
        request.transaction.abort();
        return;
      }
      for (const store of ['keys', 'scans']) request.result.createObjectStore(store, { keyPath: 'id' });
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
      const tx = db.transaction(['keys', 'scans'], mode);
      const stores = { keys: tx.objectStore('keys'), scans: tx.objectStore('scans') };
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
