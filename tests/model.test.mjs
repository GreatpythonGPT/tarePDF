import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addPage, newElement, linkPages, detachPages, History, clone, validateProject, removePages, movePage, pageSize, setCrop, shareElement, detachElement, updateElement, elementPages, reorderPages } from '../src/editor/model.mjs';
const image = { name: '测试图.png', src: 'data:image/png;base64,AA==', width: 1600, height: 1000 };
function fixture() { const project = createProject(); for (let i = 0; i < 3; i++) addPage(project, { ...image, name: `${i}.png` }); return project; }
test('共享排版只绑定指定页面；修改一个对象会更新所有绑定页面', () => {
  const p = fixture(); const [a, b, c] = p.pages;
  p.layouts[a.layoutId].elements.push(newElement('text'));
  linkPages(p, a.id, [a.id, b.id]);
  p.layouts[a.layoutId].elements[0].text = '同步的新标题';
  assert.equal(p.layouts[b.layoutId].elements[0].text, '同步的新标题');
  assert.equal(p.layouts[c.layoutId].elements.length, 0);
  assert.equal(Object.keys(p.layouts).length, 2);
});
test('解除共享保留外观，后续修改互不影响', () => {
  const p = fixture(), [a, b] = p.pages; p.layouts[a.layoutId].elements.push(newElement('text'));
  linkPages(p, a.id, [b.id]); detachPages(p, [b.id]);
  assert.deepEqual(p.layouts[a.layoutId].elements, p.layouts[b.layoutId].elements);
  p.layouts[b.layoutId].elements[0].text = '独立标题';
  assert.notEqual(p.layouts[a.layoutId].elements[0].text, '独立标题');
});
test('撤销与重做恢复共享关系、元素及原图', () => {
  const p = fixture(), history = new History(p), [a, b] = p.pages;
  p.layouts[a.layoutId].elements.push(newElement('arrow')); linkPages(p, a.id, [b.id]); history.commit(p);
  const old = history.undo(); assert.notEqual(old.pages[0].layoutId, old.pages[1].layoutId);
  const restored = history.redo(); assert.equal(restored.pages[0].layoutId, restored.pages[1].layoutId);
  assert.equal(restored.pages[0].src, image.src); assert.equal(restored.layouts[restored.pages[0].layoutId].elements[0].type, 'arrow');
});
test('排序和删除始终按稳定 ID 操作', () => {
  const p = fixture(), [a, b] = p.pages; movePage(p, a.id, 2); a.adjustments.brightness = 35;
  assert.equal(p.pages[2].id, a.id); assert.equal(p.pages[0].id, b.id); assert.equal(b.adjustments.brightness, 0);
  removePages(p, [b.id]); assert.equal(p.pages.length, 2); assert(!p.layouts[b.layoutId]);
});
test('作品序列化保留共享引用、图像调整与多语文字', () => {
  const p = fixture(), [a, b] = p.pages; const e = newElement('text'); e.text = '你好 · 日本語 · 한국어'; p.layouts[a.layoutId].elements.push(e);
  linkPages(p, a.id, [b.id]); a.adjustments.saturation = -100;
  const loaded = validateProject(JSON.parse(JSON.stringify(p))); assert.deepEqual(loaded, p);
});
test('拒绝非法、超大、缺失布局和原型属性的作品文件', () => {
  for (const mutate of [p => { p.version = 300; }, p => { p.pages[0].width = Infinity; }, p => { p.pages[0].src = 'file:///etc/passwd'; }, p => { p.pages[0].layoutId = '__proto__'; }, p => { p.pages[0].crop.w = 2; }, p => { p.pages[0].adjustments.brightness = '10'; }]) { const p = fixture(); mutate(p); assert.throws(() => validateProject(p)); }
  const p = fixture(); p.layouts[p.pages[0].layoutId].elements.push({ ...newElement('text'), fontSize: NaN }); assert.throws(() => validateProject(p));
});
test('裁剪按旋转后的图像尺寸计算，恢复原图不破坏源图', () => {
  const p = fixture().pages[0]; setCrop(p, 1); assert.deepEqual(pageSize(p), { width: 1000, height: 1000 });
  p.rotation = 90; setCrop(p, 0); assert.deepEqual(pageSize(p), { width: 1000, height: 1600 }); assert.equal(p.src, image.src);
});
test('克隆对象不会共享可变参数', () => { const p = fixture(), c = clone(p); c.pages[0].adjustments.exposure = 20; assert.equal(p.pages[0].adjustments.exposure, 0); });
test('单独共享一个元素，保留目标页其他排版并同步位置及文字', () => {
  const p = fixture(), [a, b, c] = p.pages, title = newElement('text'), rectangle = newElement('rect');
  p.layouts[a.layoutId].elements.push(title); p.layouts[b.layoutId].elements.push(rectangle);
  shareElement(p, a.id, title.id, [b.id]); updateElement(p, a.layoutId, title.id, { text: '共享标注', x: 0.4 });
  assert.equal(p.layouts[b.layoutId].elements.length, 2); assert.equal(p.layouts[b.layoutId].elements[0].id, rectangle.id);
  assert.equal(p.layouts[b.layoutId].elements[1].text, '共享标注'); assert.equal(p.layouts[b.layoutId].elements[1].x, 0.4);
  assert.equal(p.layouts[c.layoutId].elements.length, 0); assert.equal(elementPages(p, a.layoutId, title.id).length, 2);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  const id = p.layouts[b.layoutId].elements[1].id; detachElement(p, b.id, id); updateElement(p, b.layoutId, id, { text: '只在这一页' }); assert.equal(title.text, '共享标注');
});
test('拖动多页排序保留组内次序和稳定 ID', () => { const p = fixture(), [a, b, c] = p.pages; reorderPages(p, [a.id, b.id], c.id, true); assert.deepEqual(p.pages.map(p => p.id), [c.id, a.id, b.id]); });
test('整套共享中只解除一个元素，其他元素仍可同步', () => {
  const p = fixture(), [a, b] = p.pages, title = newElement('text'), arrow = newElement('arrow'); p.layouts[a.layoutId].elements.push(title, arrow); linkPages(p, a.id, [b.id]);
  detachElement(p, b.id, title.id); updateElement(p, b.layoutId, title.id, { text: '独立标题' }); updateElement(p, b.layoutId, arrow.id, { x: 0.8 });
  assert.notEqual(p.layouts[a.layoutId].elements[0].text, '独立标题'); assert.equal(p.layouts[a.layoutId].elements[1].x, 0.8); assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
});
