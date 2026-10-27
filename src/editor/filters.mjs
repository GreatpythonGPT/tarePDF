// Tonal adjustments work on straight-alpha sRGB; sharpening preserves alpha and clamps edges.
export function adjustPixels(image, settings) {
  const { data, width, height } = image;
  const exposure = 2 ** (settings.exposure / 50);
  const brightness = settings.brightness * 1.5;
  const contrast = (1 + settings.contrast / 100) ** 2;
  const saturation = 1 + settings.saturation / 100;
  const warmth = settings.temperature * 0.35;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = (i * exposure - 127.5) * contrast + 127.5 + brightness;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = lut[data[i]] + warmth, g = lut[data[i + 1]], b = lut[data[i + 2]] - warmth;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i] = luma + (r - luma) * saturation;
    data[i + 1] = luma + (g - luma) * saturation;
    data[i + 2] = luma + (b - luma) * saturation;
  }
  if (settings.sharpness > 0) {
    const original = new Uint8ClampedArray(data), amount = settings.sharpness / 100 * 0.8;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!original[i + 3]) continue;
      const left = (y * width + Math.max(0, x - 1)) * 4, right = (y * width + Math.min(width - 1, x + 1)) * 4;
      const top = (Math.max(0, y - 1) * width + x) * 4, bottom = (Math.min(height - 1, y + 1) * width + x) * 4;
      const al = original[left + 3], ar = original[right + 3], at = original[top + 3], ab = original[bottom + 3];
      const weight = al + ar + at + ab;
      for (let c = 0; c < 3; c++) {
        const sum = original[left + c] * al + original[right + c] * ar + original[top + c] * at + original[bottom + c] * ab;
        const blur = weight ? sum / weight : original[i + c];
        data[i + c] = original[i + c] + amount * (original[i + c] - blur);
      }
    }
  }
  return image;
}
export function targetSize(width, height, maxSide, maxPixels = 24000000) {
  const scale = Math.min(1, maxSide ? maxSide / Math.max(width, height) : 1, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
