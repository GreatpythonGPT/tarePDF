import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustPixels, targetSize } from '../src/editor/filters.mjs';
import { adjustments } from '../src/editor/model.mjs';
function pixels(width, height, color = [100, 100, 100, 255]) { return { width, height, data: new Uint8ClampedArray(Array.from({ length: width * height }, () => color).flat()) }; }
test('零调整完全保留每个像素，包括透明度', () => { const p = pixels(3, 3, [34, 127, 225, 96]); const before = new Uint8ClampedArray(p.data); adjustPixels(p, adjustments()); assert.deepEqual(p.data, before); });
test('锐化不会清空图像边缘；均匀颜色保持不变', () => { for (const [w, h] of [[1, 1], [1, 3], [3, 3]]) { const p = pixels(w, h), before = new Uint8ClampedArray(p.data); adjustPixels(p, { ...adjustments(), sharpness: 100 }); assert.deepEqual(p.data, before); } });
test('锐化保留每个透明度，不把透明邻居当成黑边', () => { const p = pixels(3, 1, [100, 100, 100, 255]); p.data[3] = 0; p.data[7] = 128; adjustPixels(p, { ...adjustments(), sharpness: 100 }); assert.deepEqual([...p.data].filter((_, i) => i % 4 === 3), [0, 128, 255]); assert.equal(p.data[4], 100); });
test('曝光增加一档使中间调数值翻倍', () => { const p = pixels(1, 1); adjustPixels(p, { ...adjustments(), exposure: 50 }); assert.equal(p.data[0], 200); });
test('黑白预设保留明度并消除颜色差', () => { const p = pixels(1, 1, [200, 50, 25, 255]); adjustPixels(p, { ...adjustments(), saturation: -100 }); assert.equal(p.data[0], p.data[1]); assert.equal(p.data[1], p.data[2]); assert.equal(p.data[3], 255); });
test('预览和导出遵守最长边与像素上限且不放大原图', () => { assert.deepEqual(targetSize(6000, 4000, 1800), { width: 1800, height: 1200 }); assert.deepEqual(targetSize(100, 50, 2400), { width: 100, height: 50 }); const size = targetSize(12000, 12000, 0); assert(size.width * size.height <= 24010000); });
