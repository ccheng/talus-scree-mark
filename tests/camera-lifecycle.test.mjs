import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCamera } from '../app/src/camera.js';

function videoDouble() {
  const video = new EventTarget();
  return Object.assign(video, {
    srcObject: null,
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    play: async () => {},
  });
}

function trackDouble() {
  const track = new EventTarget();
  return Object.assign(track, {
    readyState: 'live',
    stops: 0,
    stop() { this.stops++; this.readyState = 'ended'; },
  });
}

function streamDouble(track, extra = []) {
  return { getTracks: () => [track, ...extra], getVideoTracks: () => [track] };
}

test('camera requests video only, waits for a frame and stops all tracks on close', async () => {
  const video = videoDouble();
  const track = trackDouble();
  const extra = trackDouble();
  const stream = streamDouble(track, [extra]);
  const states = [];
  let requested;
  const camera = createCamera(video, ({ status }) => states.push(status), {
    async getUserMedia(options) {
      requested = options;
      return stream;
    },
  });
  await camera.open();
  assert.deepEqual(requested, { audio: false, video: { facingMode: { ideal: 'environment' } } });
  assert.equal(video.srcObject, stream);
  assert.equal(camera.state, 'live');
  assert.equal(camera.capture(), null);

  Object.assign(video, { readyState: 2, videoWidth: 1200, videoHeight: 800 });
  video.dispatchEvent(new Event('loadeddata'));
  assert.equal(camera.state, 'ready');
  camera.close();
  assert.equal(video.srcObject, null);
  assert.deepEqual([track.stops, extra.stops], [1, 1]);
  assert.deepEqual(states, ['opening', 'live', 'ready', 'closed']);
});

test('a canceled permission request stops its late stream without affecting the current one', async () => {
  const video = videoDouble();
  const oldTrack = trackDouble();
  const newTrack = trackDouble();
  const newStream = streamDouble(newTrack);
  const firstPermission = Promise.withResolvers();
  let calls = 0;
  const camera = createCamera(video, () => {}, {
    getUserMedia() {
      return calls++ === 0 ? firstPermission.promise : Promise.resolve(newStream);
    },
  });
  const oldRequest = camera.open();
  camera.close();
  await camera.open();
  firstPermission.resolve(streamDouble(oldTrack));
  await oldRequest;
  assert.equal(oldTrack.stops, 1);
  assert.equal(newTrack.stops, 0);
  assert.equal(video.srcObject, newStream);
  assert.equal(camera.state, 'live');
  camera.close();
});

test('denial and an ended video track return to a recoverable camera state', async () => {
  const video = videoDouble();
  const track = trackDouble();
  const states = [];
  let calls = 0;
  const camera = createCamera(video, (state) => states.push(state), {
    async getUserMedia() {
      if (calls++ === 0) throw new DOMException('Denied by test', 'NotAllowedError');
      return streamDouble(track);
    },
  });
  await camera.open();
  assert.equal(camera.state, 'closed');
  assert.match(states.at(-1).message, /denied/);
  await camera.open();
  track.dispatchEvent(new Event('ended'));
  assert.equal(track.stops, 1);
  assert.equal(video.srcObject, null);
  assert.equal(camera.state, 'closed');
  assert.match(states.at(-1).message, /Reopen it/);
});
