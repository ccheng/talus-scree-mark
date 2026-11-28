import { createMarkerlessProfile } from './profile-authoring.js';

const databaseName = 'talus-scree-mark-profiles';
const storeName = 'profiles';

function openDatabase(create) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let missing = false;
    let abandoned = false;
    request.onupgradeneeded = () => {
      if (!create || abandoned) {
        missing = !create;
        request.transaction.abort();
        return;
      }
      request.result.createObjectStore(storeName, { keyPath: ['id', 'revision'] });
    };
    request.onsuccess = () => {
      if (abandoned) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      if (missing) resolve(null);
      else reject(request.error);
    };
    request.onblocked = () => {
      abandoned = true;
      reject(new Error('Close other copies of the app and try again.'));
    };
  });
}

async function runTransaction(mode, action) {
  const db = await openDatabase(mode === 'readwrite');
  if (!db) return undefined;
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let result;
      let failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Profile operation was interrupted.'));
      function fail(error) {
        failure = error;
        tx.abort();
      }
      try {
        action(tx.objectStore(storeName), (value) => { result = value; }, fail);
      } catch (error) {
        fail(error);
      }
    });
  } finally {
    db.close();
  }
}

function revisions(id) {
  return IDBKeyRange.bound([id, 1], [id, Number.MAX_SAFE_INTEGER]);
}

export async function listProfiles({ allRevisions = false } = {}) {
  return (await runTransaction('readonly', (store, complete) => {
    const request = store.getAll();
    request.onsuccess = () => {
      if (allRevisions) {
        complete(request.result);
        return;
      }
      const latest = new Map();
      for (const profile of request.result) latest.set(profile.id, profile);
      complete([...latest.values()]);
    };
  })) ?? [];
}

export function loadProfile(id, revision) {
  return runTransaction('readonly', (store, complete) => {
    const request = store.get([id, revision]);
    request.onsuccess = () => complete(request.result);
  });
}

const copyBounds = ({ x, y, width, height }) => ({ x, y, width, height });
const copyChoices = (choices, preserveInk = false) => choices.map(({ symbol, x, y, radius, blankInk, provenance }) =>
  ({ symbol, x, y, radius, ...(preserveInk && blankInk !== undefined ? { blankInk } : {}),
    ...(provenance === undefined ? {} : { provenance }) }));

export function profileRecord(profile) {
  const { width, height, units, origin, orientation } = profile.page;
  return {
    schemaVersion: profile.schemaVersion, id: profile.id, revision: profile.revision,
    name: profile.name, strategy: profile.strategy, page: { width, height, units, origin, orientation },
    ...(profile.scope ? { scope: profile.scope } : {}),
    ...(profile.mcCompleteness ? { mcCompleteness: profile.mcCompleteness } : {}),
    ...(profile.mcExpectedCount === undefined ? {} : { mcExpectedCount: profile.mcExpectedCount }),
    ...(profile.exclusions?.length ? { exclusions: profile.exclusions.map(copyBounds) } : {}),
    ...(profile.printedLandmarks?.length ? { printedLandmarks: profile.printedLandmarks.map(({ x, y, patch }) => ({ x, y, patch })) } : {}),
    components: profile.components.map(({ id, kind, bounds, items }) => ({
      id, kind, bounds: copyBounds(bounds),
      items: items.map(({ id, kind, bounds, choices, slots }) => ({
        id, kind, bounds: copyBounds(bounds),
        ...(kind === 'mc' ? { choices: copyChoices(choices) } : {
          slots: slots.map(({ id, choices }) => ({ id, choices: copyChoices(choices, true) })),
        }),
      })),
    })),
    features: profile.features.map(({ id, bounds, samples, identitySamples }) => ({
      id, bounds: copyBounds(bounds),
      samples: samples.map((sample) => {
        if (!Number.isFinite(sample)) throw new Error('Printed feature samples must be numeric.');
        return sample;
      }),
      ...(identitySamples === undefined ? {} : { identitySamples: [...identitySamples] }),
    })),
    allowManualIdentity: profile.allowManualIdentity === true,
    provenance: { source: 'teacher-confirmed-blank' },
  };
}

export async function saveProfile(profile) {
  if (typeof profile?.id !== 'string' || !profile.id ||
      !Number.isSafeInteger(profile.revision) || profile.revision < 1) {
    throw new Error('A profile ID and positive revision are required.');
  }
  const record = profileRecord(createMarkerlessProfile(profile));
  return runTransaction('readwrite', (store, complete, fail) => {
    const request = store.openCursor(revisions(record.id), 'prev');
    request.onsuccess = () => {
      const latest = request.result?.value.revision ?? 0;
      if (record.revision !== latest + 1) {
        fail(new Error('A newer profile revision already exists or the revision is incomplete.'));
        return;
      }
      store.add(record);
      complete(record);
    };
  });
}

export function deleteProfile(id) {
  return runTransaction('readwrite', (store) => { store.delete(revisions(id)); });
}
