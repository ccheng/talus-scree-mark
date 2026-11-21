export function toGrayImage(image) {
  const { width, height } = image;
  const pixels = image.pixels instanceof Uint8ClampedArray ? image.pixels : image.pixels?.data;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 2400 || height > 2400 || !(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) {
    throw new TypeError('Expected one bounded M1 working image.');
  }
  const values = new Uint8Array(width * height);
  for (let i = 0, source = 0; i < values.length; i++, source += 4) {
    const luma = (77 * pixels[source] + 150 * pixels[source + 1] + 29 * pixels[source + 2]) >> 8;
    const alpha = pixels[source + 3];
    values[i] = Math.round((luma * alpha + 255 * (255 - alpha)) / 255);
  }
  return { width, height, values };
}

export function grayAt(image, x, y) {
  if (x < 0 || y < 0 || x > image.width - 1 || y > image.height - 1) return NaN;
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(left + 1, image.width - 1);
  const bottom = Math.min(top + 1, image.height - 1);
  const fx = x - left;
  const fy = y - top;
  const { values, width } = image;
  return (values[top * width + left] * (1 - fx) + values[top * width + right] * fx) * (1 - fy) +
    (values[bottom * width + left] * (1 - fx) + values[bottom * width + right] * fx) * fy;
}

export function quantile(values, fraction) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}
