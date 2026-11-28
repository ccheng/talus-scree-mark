// Frozen MARK-R7.3 ExtraTrees layout, little-endian 32-byte nodes.
export function createPredictor(metadata, buffer) {
  const nodes = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return function predict(features) {
    const probabilities = new Float64Array(3);
    for (const root of metadata.roots) {
      let index = root;
      while (true) {
        const offset = index * 32;
        const feature = nodes.getInt32(offset, true);
        if (feature < 0) {
          for (let k = 0; k < probabilities.length; k++) {
            probabilities[k] += nodes.getFloat32(offset + 20 + 4 * k, true);
          }
          break;
        }
        const left = Math.fround(features[feature]) <= nodes.getFloat64(offset + 12, true);
        index = nodes.getInt32(offset + (left ? 4 : 8), true);
      }
    }
    return Array.from(probabilities, value => value / metadata.roots.length);
  };
}
