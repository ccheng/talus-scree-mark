import { readReferenceSheet } from './omr.js';
import { readProfileSheet } from './profile-omr.js';
import { readProfileSheetWithCpas } from './cpas-recognition/preview.js';
import { discoverBlankLayout } from './layout-discovery.js';

self.addEventListener('message', async ({ data }) => {
  if (!data || !['read-reference', 'read-profile', 'discover-layout'].includes(data.type)) return;
  const { jobId, image, profile, options } = data;
  try {
    const result = data.type === 'discover-layout' ? discoverBlankLayout(image, data.page, data.corners, options) :
      data.type === 'read-reference' ? readReferenceSheet(image) : options?.cpasPreview ? await readProfileSheetWithCpas(image, profile, options) : readProfileSheet(image, profile, options);
    self.postMessage({ jobId, result });
  } catch {
    self.postMessage({ jobId, error: true });
  }
});
