import test from 'node:test';
import assert from 'node:assert/strict';
import { outputDefaults, validateOutput, compositionParts } from '../src/editor/output-settings.mjs';
import { uniformSize } from '../src/editor/filters.mjs';
import { createProject, addPage, validateProject, History, reorderPages } from '../src/editor/model.mjs';
const image = { name: '图片', src: 'data:image/png;base64,AA==', width: 1600, height: 900 };

test('横图、竖图、小图和超宽图都输出精确统一宽度，比例仅受整像素取整影响', () => {
  for (const [w, h] of [[1600, 900], [900, 1400], [60, 60], [2400, 800]]) {
    const size = uniformSize(w, h, 1375); assert.equal(size.width, 1375); assert(Math.abs(size.height / size.width - h / w) <= 0.5 / 1375);
  }
  assert.deepEqual(uniformSize(60, 60, 1080), { width: 1080, height: 1080 });
});
test('过长图片明确拒绝，不静默缩小其中一张破坏统一宽度', () => {
  for (const args of [[1, 30000, 5000], [100, 2000, 5000], [1600, 900, 0], [1600, 900, 5001], [1600, 900, NaN]]) assert.throws(() => uniformSize(...args));
});
test('标题只在开头，横条只在相邻图片之间，筛选后也不产生末尾横条', () => {
  const settings = { ...outputDefaults(), cover: true, separator: true }, pages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(compositionParts(pages, settings).map(p => p.type), ['title', 'image', 'separator', 'image', 'separator', 'image']);
  assert.deepEqual(compositionParts(pages.slice(0, 1), settings).map(p => p.type), ['title', 'image']);
  assert.deepEqual(compositionParts([], settings), []);
  assert.deepEqual(compositionParts(pages, { ...settings, cover: false, separator: false }).map(p => p.type), ['image', 'image', 'image']);
});
test('旧作品迁移保留最长边语义，以及旧封面和分隔页比例', () => {
  const old = validateOutput({ width: 1600, cover: true, separator: true, title: '旧作品', background: '#aabbcc' });
  assert.equal(old.sizing, 'long-edge'); assert.equal(old.coverHeight, 1120); assert.equal(old.separatorHeight, 160); assert.equal(old.coverBackground, '#aabbcc');
  assert.equal(validateOutput({ width: 0 }).width, 0);
  assert.deepEqual(validateOutput(outputDefaults()), outputDefaults());
});
test('统一宽度、标题样式、横条设置和排序可保存，并随撤销重做恢复', () => {
  const p = createProject(), a = addPage(p, image), b = addPage(p, { ...image, width: 900, height: 1400 }); const history = new History(p);
  Object.assign(p.export, { width: 1375, cover: true, title: '年度作品\n空间', coverHeight: 180, coverColor: '#263c34', coverBackground: '#eef1e8', coverFontSize: 72, coverAlign: 'right', separator: true, separatorHeight: 48, separatorColor: '#d7ddcb' });
  reorderPages(p, [b.id], a.id); history.commit(p);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  const before = history.undo(); assert.equal(before.pages[0].id, a.id); assert.equal(before.export.width, 1080);
  const after = history.redo(); assert.equal(after.pages[0].id, b.id); assert.equal(after.export.separatorHeight, 48); assert.equal(after.pages[0].src, image.src);
});
test('无效宽度、横条高度、颜色和字号无法进入已保存作品', () => {
  for (const patch of [{ width: 99 }, { width: 5001 }, { width: 0 }, { width: 120.5 }, { coverHeight: Infinity }, { separatorHeight: -1 }, { coverFontSize: 0 }, { coverColor: 'url(x)' }, { coverAlign: 'other' }, { sizing: 'stretch' }]) assert.throws(() => validateOutput({ ...outputDefaults(), ...patch }));
});
