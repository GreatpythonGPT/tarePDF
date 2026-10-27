import test from 'node:test';
import assert from 'node:assert/strict';
import { ANNOTATION_PRESETS, annotationDefaults, annotationGeometry, annotationLabelBox, validateAnnotation, scaleAnnotation } from '../src/editor/annotations.mjs';
import { createProject, addPage, newElement, validateProject, shareElement, updateElement, detachElement, History } from '../src/editor/model.mjs';
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
function fixture() {
  const p = createProject();
  for (const [width, height] of [[1600, 1000], [800, 1600], [2400, 1800]]) addPage(p, { width, height, name: '示例', src: 'data:image/png;base64,AA==' });
  const e = newElement('annotation'); p.layouts[p.pages[0].layoutId].elements.push(e); return { p, e };
}
test('六种模板都有独立、可序列化的完整参数；旧作品继续兼容', () => {
  for (const preset of ANNOTATION_PRESETS) assert.deepEqual(validateAnnotation(annotationDefaults(preset.id)), annotationDefaults(preset.id));
  const { p, e } = fixture(); e.annotation.badgeText = 'AB12'; e.text = '多行说明\n第二行'; e.annotation.labelColor = '#f0e6cf';
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  p.layouts[p.pages[0].layoutId].elements = [newElement('arrow'), newElement('text')];
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
});
test('斜段长度与角度独立，横段保持水平；预览及高清导出几何一致', () => {
  const a = { ...annotationDefaults(), angle: 30, length: 0.2, tailLength: 0.3 };
  for (const width of [320, 800, 1000, 1600, 3600]) {
    const g = annotationGeometry(a, width);
    near(Math.hypot(g.bend.x, g.bend.y), 0.2 * width);
    near(Math.atan2(-g.bend.y, g.bend.x) * 180 / Math.PI, 30);
    near(g.end.y, g.bend.y); near(g.end.x - g.bend.x, 0.3 * width);
    const longer = annotationGeometry({ ...a, tailLength: 0.45 }, width);
    assert.deepEqual(longer.bend, g.bend); near(longer.end.x - g.end.x, 0.15 * width);
  }
});
test('四向镜像不扭曲角度，0° 与 90° 没有特殊分支或除零', () => {
  for (const angle of [0, 30, 45, 60, 90]) for (const direction of ['up-right', 'up-left', 'down-right', 'down-left']) {
    const a = { ...annotationDefaults(), angle, direction }, g = annotationGeometry(a, 1000);
    assert(g.points.every(Number.isFinite)); near(Math.hypot(g.bend.x, g.bend.y), 160);
    assert.equal(g.side, direction.endsWith('left') ? -1 : 1); near(Math.abs(g.end.x - g.bend.x), 200);
  }
});
test('线尾文字支持左右方向，多行文字上线/下线/在线的间距正确', () => {
  for (const direction of ['up-left', 'down-right']) {
    const a = { ...annotationDefaults(), direction }, g = annotationGeometry(a, 1000);
    const above = annotationLabelBox(a, g, 1000, 70), below = annotationLabelBox({ ...a, labelPosition: 'below' }, g, 1000, 70);
    near(above.y + above.height + 12, g.middle.y); near(below.y - 12, g.middle.y);
    const end = annotationLabelBox({ ...a, labelPosition: 'end' }, g, 1000, 70);
    near(end.y + end.height / 2, g.end.y);
    near(g.side > 0 ? end.x - g.end.x : g.end.x - end.x - end.width, 12);
    const inline = annotationLabelBox({ ...a, labelPosition: 'inline' }, g, 1000, 70); near(inline.y + 35, g.middle.y);
  }
});
test('整体缩放保持角度、段长比例、文字与端点比例，极限缩放仍可保存', () => {
  for (const factor of [0.000001, 0.4, 2, 1e9]) {
    const { p, e } = fixture(), before = structuredClone(e); Object.assign(e, scaleAnnotation(e, factor));
    const scale = e.annotation.length / before.annotation.length;
    near(e.annotation.angle, 45); near(e.annotation.tailLength / before.annotation.tailLength, scale);
    near(e.fontSize / before.fontSize, scale); near(e.annotation.capSize / before.annotation.capSize, scale);
    validateProject(p);
  }
  for (let i = 1; i < 100; i++) {
    const { p, e } = fixture(); e.annotation.length = 0.005 + i / 137; e.annotation.labelWidth = 0.03 + i / 113;
    Object.assign(e, scaleAnnotation(e, i % 2 ? 1e9 : 1e-9)); validateProject(p);
  }
});
test('共享标注参数同步，解除后不会共用可变对象，撤销恢复完整几何', () => {
  const { p, e } = fixture(), [a, b, c] = p.pages;
  shareElement(p, a.id, e.id, [b.id]); const history = new History(p);
  updateElement(p, a.layoutId, e.id, { annotation: { ...e.annotation, angle: 60, tailLength: 0.31 }, text: '同步说明' }); history.commit(p);
  const other = p.layouts[b.layoutId].elements[0]; assert.deepEqual(other.annotation, e.annotation); assert.notEqual(other.annotation, e.annotation);
  assert.equal(p.layouts[c.layoutId].elements.length, 0);
  assert.equal(history.undo().layouts[a.layoutId].elements[0].annotation.angle, 45);
  assert.equal(history.redo().layouts[b.layoutId].elements[0].annotation.tailLength, 0.31);
  detachElement(p, b.id, other.id); updateElement(p, b.layoutId, other.id, { annotation: { ...other.annotation, angle: 15 } });
  assert.equal(e.annotation.angle, 60); assert.equal(other.annotation.angle, 15); validateProject(p);
});
test('损坏参数与未知模板不能静默丢失或进入绘图', () => {
  for (const patch of [{ angle: NaN }, { length: Infinity }, { tailLength: -1 }, { angle: 91 }, { labelWidth: 0 }, { direction: 'right' }, { preset: '__proto__' }, { startCap: 'script' }, { labelColor: 'url(http://x)' }, { showLabel: 'false' }, { badgeText: '12345' }]) assert.throws(() => validateAnnotation({ ...annotationDefaults(), ...patch }));
  const { p, e } = fixture(); e.annotation = null; assert.throws(() => validateProject(p));
});
