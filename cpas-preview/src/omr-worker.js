import { readReferenceSheet } from './omr.js';
import { readProfileSheet } from './profile-omr.js';
import { discoverBlankLayout } from './layout-discovery.js';

self.addEventListener('message', async ({ data }) => {
  if (!data || !['read-reference', 'read-profile', 'discover-layout', 'compare-cpas'].includes(data.type)) return;
  const { jobId, image, profile, options } = data;
  try {
    if (data.type === 'compare-cpas') {
      const { compareProfileSheet } = await import('./cpas-recognition/preview.js');
      const cpas = await compareProfileSheet(image, profile, data.established, options);
      self.postMessage({ jobId, cpas });
      return;
    }
    const result = data.type === 'discover-layout' ? discoverBlankLayout(image, data.page, data.corners, options) :
      data.type === 'read-reference' ? readReferenceSheet(image) : readProfileSheet(image, profile, options);
    self.postMessage({ jobId, result });
  } catch {
    self.postMessage({ jobId, error: true });
  }
});
