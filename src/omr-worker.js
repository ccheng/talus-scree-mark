import { readReferenceSheet } from './omr.js';
import { readProfileSheet } from './profile-omr.js';

self.addEventListener('message', ({ data }) => {
  if (data?.type !== 'read-reference' && data?.type !== 'read-profile') return;
  const { jobId, image, profile, options } = data;
  try {
    const result = data.type === 'read-reference' ? readReferenceSheet(image) : readProfileSheet(image, profile, options);
    self.postMessage({ jobId, result });
  } catch {
    self.postMessage({ jobId, error: true });
  }
});
