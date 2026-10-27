import { adjustPixels, targetSize, uniformSize } from './filters.mjs';
let cachedKey, cachedBitmap;
self.onmessage = async ({ data: { id, page, maxSide, original, outputWidth } }) => {
  try {
    if (cachedKey !== page.src) {
      cachedBitmap?.close(); cachedBitmap = null; cachedKey = null;
      const response = await fetch(page.src);
      cachedBitmap = await createImageBitmap(await response.blob()); cachedKey = page.src;
    }
    const bitmap = cachedBitmap;
    if (bitmap.width !== page.width || bitmap.height !== page.height || bitmap.width * bitmap.height > 80000000) throw new Error('图片实际尺寸与作品记录不一致，请重新导入这张图片');
    const rotated = page.rotation % 180;
    const rw = rotated ? bitmap.height : bitmap.width, rh = rotated ? bitmap.width : bitmap.height;
    const crop = page.crop;
    const size = outputWidth === null || outputWidth === undefined ? targetSize(rw * crop.w, rh * crop.h, maxSide) : uniformSize(rw * crop.w, rh * crop.h, outputWidth);
    const canvas = new OffscreenCanvas(size.width, size.height), ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.scale(size.width / (rw * crop.w), size.height / (rh * crop.h));
    ctx.translate(-crop.x * rw, -crop.y * rh);
    ctx.translate(rw / 2, rh / 2); ctx.rotate(page.rotation * Math.PI / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    ctx.resetTransform();
    if (!original && Object.values(page.adjustments).some(Boolean)) ctx.putImageData(adjustPixels(ctx.getImageData(0, 0, size.width, size.height), page.adjustments), 0, 0);
    const output = canvas.transferToImageBitmap();
    self.postMessage({ id, bitmap: output }, [output]);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
