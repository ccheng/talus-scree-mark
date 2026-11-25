function askWorker(controller, action, releaseId) {
  return new Promise((resolve, reject) => {
    const { port1, port2 } = new MessageChannel();
    const timeout = setTimeout(() => finish(reject, new Error('Offline verification timed out.')), 7000);

    function finish(callback, value) {
      clearTimeout(timeout);
      port1.close();
      callback(value);
    }

    port1.onmessage = ({ data }) => finish(resolve, data);
    try {
      controller.postMessage({ action, releaseId }, [port2]);
    } catch (error) {
      finish(reject, error);
    }
  });
}

export function prepareOffline(output, retry) {
  const serviceWorker = navigator.serviceWorker;
  const releaseId = document.querySelector('meta[name="scree-release"]').content;
  const registrationUrl = new URL('../sw.js', import.meta.url);
  const scope = new URL('../', import.meta.url);
  const watched = new WeakSet();
  let registration;
  let checkId = 0;
  let setupFailed = false;

  function display(message, retryable = false) {
    if (output.textContent !== message) output.textContent = message;
    retry.hidden = !retryable;
  }

  function refresh(action = 'verify-shell') {
    const request = ++checkId;
    const controller = serviceWorker.controller;
    if (!controller) {
      if (setupFailed) display('Offline setup failed. Connect to the internet and retry.', true);
      else display('Preparing offline use. Keep this page open.');
      return;
    }
    const pendingUpdate = registration?.waiting && registration.waiting !== controller;
    if (action === 'repair-shell') display('Repairing the offline copy…');
    askWorker(controller, action, releaseId).then((response) => {
      if (request !== checkId) return;
      if (response.releaseId !== releaseId) {
        display('The app version changed. Close this page and reopen it.');
      } else if (!response.ready) {
        const updateMessage = pendingUpdate ? ' An update is ready. Close and reopen all copies of the app.' : '';
        display('Offline copy incomplete. Connect and retry offline setup.' + updateMessage, true);
      } else if (pendingUpdate) {
        display('Offline ready. An update is ready. Close and reopen all copies of the app.');
      } else {
        display('Offline ready. You can reopen this app without a connection.');
      }
    }).catch(() => {
      if (request === checkId) display('Offline setup could not be verified. Connect and retry.', true);
    });
  }

  function watch(worker) {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);

    function changed() {
      if (worker.state === 'redundant' && !serviceWorker.controller) setupFailed = true;
      refresh();
    }

    worker.addEventListener('statechange', changed);
    changed();
  }

  async function register() {
    setupFailed = false;
    display('Preparing offline use. Keep this page open.');
    try {
      registration = await serviceWorker.register(registrationUrl, { scope: scope.href, type: 'module', updateViaCache: 'none' });
      registration.addEventListener('updatefound', () => watch(registration.installing));
      watch(registration.installing);
      refresh();
    } catch {
      setupFailed = true;
      refresh();
    }
  }

  if (!serviceWorker) {
    display('Offline setup needs a supported browser on a secure page.');
    return;
  }
  serviceWorker.addEventListener('controllerchange', () => refresh());
  window.addEventListener('pageshow', () => refresh());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  retry.addEventListener('click', () => {
    if (serviceWorker.controller) refresh('repair-shell');
    else register();
  });
  register();
}
