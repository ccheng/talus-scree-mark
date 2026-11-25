import { readWorkingImage } from './image.js';

function stopTracks(stream) {
  for (const track of stream.getTracks()) track.stop();
}

function cameraMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Camera access was denied. Allow camera access for this site in your browser settings and retry, or choose an image.';
  }
  if (error?.name === 'NotFoundError') {
    return 'No camera was found. Choose an image or reconnect the camera and retry.';
  }
  return 'The camera could not open. Close other camera apps and retry, or choose an image.';
}

export function createCamera(video, onState, mediaDevices = globalThis.navigator?.mediaDevices) {
  let operation;
  let stream;
  let state = 'closed';

  function setState(status, message = '') {
    state = status;
    onState({ status, message });
  }

  function close(message = '') {
    operation = undefined;
    if (stream) {
      stopTracks(stream);
      video.srcObject = null;
      stream = undefined;
    }
    if (state !== 'closed' || message) setState('closed', message);
  }

  function checkFrame() {
    if (!stream || video.readyState < 2 || !video.videoWidth || !video.videoHeight || state === 'ready') return;
    setState('ready', 'Position the whole answer sheet in the preview.');
  }

  for (const event of ['loadeddata', 'canplay', 'playing', 'resize', 'timeupdate']) {
    video.addEventListener(event, checkFrame);
  }
  video.addEventListener('error', () => {
    if (stream) close(cameraMessage());
  });

  async function open() {
    close();
    if (!mediaDevices?.getUserMedia) {
      close('Camera access needs a supported browser on a secure page. You can still choose an image.');
      return;
    }
    const current = {};
    operation = current;
    setState('opening', 'Waiting for the camera. Allow access if asked.');
    try {
      const acquired = await mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
      if (operation !== current) {
        stopTracks(acquired);
        return;
      }
      stream = acquired;
      const tracks = acquired.getVideoTracks();
      if (!tracks.length || tracks.every((track) => track.readyState === 'ended')) {
        close('The camera did not provide video. Retry or choose an image.');
        return;
      }
      for (const track of tracks) {
        track.addEventListener('ended', () => {
          if (operation === current) close('The camera stopped. Reopen it to take a photo, or choose an image.');
        }, { once: true });
      }
      video.srcObject = acquired;
      setState('live', 'Starting the camera preview…');
      await video.play();
      if (operation === current) checkFrame();
    } catch (error) {
      if (operation === current) close(cameraMessage(error));
    }
  }

  function capture() {
    if (state !== 'ready') return null;
    try {
      return readWorkingImage(video, video.videoWidth, video.videoHeight, 'camera');
    } finally {
      close();
    }
  }

  return { open, close, capture, get state() { return state; } };
}
