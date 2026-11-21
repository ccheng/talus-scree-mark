import { readReferenceSheet } from './omr.js';

self.addEventListener('message', ({ data }) => {
  if (data?.type !== 'read-reference') return;
  const { jobId, image } = data;
  try {
    self.postMessage({ jobId, result: readReferenceSheet(image) });
  } catch {
    self.postMessage({ jobId, error: true });
  }
});
