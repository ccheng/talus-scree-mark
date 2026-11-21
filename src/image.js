export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 24_000_000;
export const MAX_INPUT_EDGE = 8192;
export const MAX_WORKING_EDGE = 2400;

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export class ImageInputError extends Error {}

function unreadable() {
  return new ImageInputError('This image could not be read. Choose another JPEG or PNG.');
}

function checkDimensions(width, height) {
  if (!width || !height) throw unreadable();
  if (width > MAX_INPUT_EDGE || height > MAX_INPUT_EDGE || width * height > MAX_INPUT_PIXELS) {
    throw new ImageInputError('This image is too large. Choose one no larger than 24 megapixels and 8,192 pixels per side.');
  }
}

function inspectPng(bytes) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 33 || data.getUint32(8) !== 13 || data.getUint32(12) !== 0x49484452) {
    throw unreadable();
  }
  const width = data.getUint32(16);
  const height = data.getUint32(20);
  checkDimensions(width, height);

  let hasImageData = false;
  for (let start = 33; start + 12 <= bytes.length;) {
    const length = data.getUint32(start);
    const type = data.getUint32(start + 4);
    const end = start + length + 12;
    if (end > bytes.length) throw unreadable();
    if (type === 0x49444154) hasImageData = true;
    if (type === 0x49454e44 && length === 0 && hasImageData) return { width, height };
    start = end;
  }
  throw unreadable();
}

function inspectJpeg(bytes) {
  let width;
  let height;
  let inScan = false;
  let hasScan = false;
  let offset = 2;

  while (offset < bytes.length) {
    if (inScan) {
      offset = bytes.indexOf(0xff, offset);
      if (offset === -1) break;
    }
    if (bytes[offset++] !== 0xff) throw unreadable();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];

    if (inScan && (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    if (marker === 0xd9 && hasScan && width && height) return { width, height };

    inScan = false;
    if (marker === 0x01) continue;
    if (offset + 2 > bytes.length) throw unreadable();
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw unreadable();
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (length < 8) throw unreadable();
      const frameHeight = bytes[offset + 3] * 256 + bytes[offset + 4];
      const frameWidth = bytes[offset + 5] * 256 + bytes[offset + 6];
      checkDimensions(frameWidth, frameHeight);
      if (!width) {
        width = frameWidth;
        height = frameHeight;
      }
    }
    if (marker === 0xda && width && height) {
      inScan = true;
      hasScan = true;
    }
    offset += length;
  }
  throw unreadable();
}

export function inspectImage(bytes) {
  if (bytes.length > MAX_FILE_BYTES) throw new ImageInputError('This file exceeds 20 MiB. Choose a smaller JPEG or PNG.');
  if (PNG_HEADER.every((byte, position) => bytes[position] === byte)) {
    return { type: 'image/png', ...inspectPng(bytes) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return { type: 'image/jpeg', ...inspectJpeg(bytes) };
  }
  throw new ImageInputError('Choose a JPEG or PNG, or open the in-app camera. HEIC and other formats are unsupported.');
}

export function workingDimensions(width, height) {
  checkDimensions(width, height);
  const scale = Math.min(1, MAX_WORKING_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function readWorkingImage(source, sourceWidth, sourceHeight, sourceKind) {
  const { width, height } = workingDimensions(sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0, width, height);
    return { id: crypto.randomUUID(), source: sourceKind, width, height, pixels: context.getImageData(0, 0, width, height) };
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

export async function importWorkingImage(file, signal) {
  if (file.size > MAX_FILE_BYTES) throw new ImageInputError('This file exceeds 20 MiB. Choose a smaller JPEG or PNG.');
  let info;
  try {
    info = inspectImage(new Uint8Array(await file.arrayBuffer()));
    signal.throwIfAborted();
  } catch (error) {
    if (signal.aborted || error instanceof ImageInputError) throw error;
    throw unreadable();
  }
  const url = URL.createObjectURL(new Blob([file], { type: info.type }));
  const image = new Image();
  const cancelDecode = () => image.removeAttribute('src');
  signal.addEventListener('abort', cancelDecode, { once: true });
  try {
    image.src = url;
    // HTML image decoding applies embedded orientation. Canvas retains only the oriented pixels.
    await image.decode();
    signal.throwIfAborted();
    return readWorkingImage(image, image.naturalWidth, image.naturalHeight, 'import');
  } catch (error) {
    if (signal.aborted || error instanceof ImageInputError) throw error;
    throw unreadable();
  } finally {
    signal.removeEventListener('abort', cancelDecode);
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}
