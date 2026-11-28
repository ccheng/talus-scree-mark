const name = 'talus-scree-mark-cpas-blank-v1';

export function referenceKey(profile) {
  return profile ? JSON.stringify([profile.id, profile.revision, profile.page, profile.components]) : null;
}

export function blankReference(key, action, file) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(name, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('references');
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => reject(new Error('Reference storage is busy.'));
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('references', action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('references');
      const request = action === 'get' ? store.get(key) : action === 'save' ? store.put(file, key) : store.delete(key);
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Reference storage did not finish.')); };
    };
  });
}
