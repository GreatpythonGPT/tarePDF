// Lengths use the page width on BOTH axes: a 45° leader stays 45° on
// portrait pages, landscape pages and exports at any resolution.
export const ANNOTATION_PRESETS = [
  { id: 'straight', name: '直线指示', hint: '圆点 · 单段引线', params: { kind: 'line', angle: 0, length: 0.26, startCap: 'dot' } },
  { id: 'arrow', name: '箭头指示', hint: '箭头 · 指向细节', params: { kind: 'line', angle: 30, length: 0.26, startCap: 'arrow' } },
  { id: 'elbow', name: '斜折线指示', hint: '斜段 + 横段', params: { kind: 'elbow', angle: 45, startCap: 'dot' } },
  { id: 'right-angle', name: '直角指示', hint: '竖段 + 横段', params: { kind: 'elbow', angle: 90, startCap: 'ring' } },
  { id: 'dimension', name: '双向尺寸线', hint: '双箭头 · 自填尺寸', params: { kind: 'line', angle: 0, length: 0.32, startCap: 'arrow', endCap: 'arrow', labelPosition: 'inline' } },
  { id: 'numbered', name: '编号指示', hint: '编号圆点 · 细节说明', params: { kind: 'elbow', angle: 45, startCap: 'number', capSize: 0.016 } }
];
export const ANNOTATION_NUMBERS = {
  angle: [0, 90], length: [0.005, 2], tailLength: [0.005, 2],
  capSize: [0.002, 0.12], labelWidth: [0.03, 1.5], labelGap: [0, 0.15]
};
export const ANNOTATION_ENUMS = {
  kind: ['line', 'elbow'], direction: ['up-right', 'down-right', 'up-left', 'down-left'],
  startCap: ['none', 'dot', 'ring', 'arrow', 'bar', 'number'], endCap: ['none', 'dot', 'ring', 'arrow', 'bar'],
  dash: ['solid', 'dashed', 'dotted'], labelPosition: ['above', 'below', 'end', 'inline']
};
export function annotationDefaults(preset = 'elbow') {
  const chosen = ANNOTATION_PRESETS.find(p => p.id === preset) || ANNOTATION_PRESETS[2];
  return { preset: chosen.id, kind: 'elbow', direction: 'up-right', angle: 45, length: 0.16,
    tailLength: 0.2, startCap: 'dot', endCap: 'none', capSize: 0.009, dash: 'solid',
    showLabel: true, labelPosition: 'above', labelWidth: 0.2, labelGap: 0.012,
    labelBackground: true, labelColor: '#ffffff', badgeText: '01', ...chosen.params };
}
export function validateAnnotation(value) {
  const fail = () => { throw new Error('作品中的标注参数不正确，请选择完整的 .tare 文件'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const result = {};
  if (!ANNOTATION_PRESETS.some(p => p.id === value.preset)) fail();
  result.preset = value.preset;
  for (const [key, options] of Object.entries(ANNOTATION_ENUMS)) {
    if (!options.includes(value[key])) fail(); result[key] = value[key];
  }
  for (const [key, [min, max]] of Object.entries(ANNOTATION_NUMBERS)) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < min || value[key] > max) fail();
    result[key] = value[key];
  }
  for (const key of ['showLabel', 'labelBackground']) { if (typeof value[key] !== 'boolean') fail(); result[key] = value[key]; }
  if (typeof value.labelColor !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value.labelColor)) fail();
  if (typeof value.badgeText !== 'string' || value.badgeText.length > 4) fail();
  result.labelColor = value.labelColor; result.badgeText = value.badgeText;
  // Stable key order also makes shared-object validation independent of JSON key order.
  return { ...annotationDefaults(value.preset), ...result };
}
export function annotationGeometry(a, width = 1) {
  const side = a.direction.endsWith('left') ? -1 : 1, vertical = a.direction.startsWith('up') ? -1 : 1;
  const angle = a.angle * Math.PI / 180;
  const start = { x: 0, y: 0 };
  const bend = { x: side * Math.cos(angle) * a.length * width, y: vertical * Math.sin(angle) * a.length * width };
  const end = a.kind === 'elbow' ? { x: bend.x + side * a.tailLength * width, y: bend.y } : bend;
  const points = a.kind === 'elbow' ? [0, 0, bend.x, bend.y, end.x, end.y] : [0, 0, end.x, end.y];
  const labelStart = a.kind === 'elbow' ? bend : start;
  return { start, bend, end, side, points,
    startAngle: Math.atan2(-bend.y, -bend.x),
    endAngle: Math.atan2(end.y - labelStart.y, end.x - labelStart.x),
    middle: { x: (labelStart.x + end.x) / 2, y: (labelStart.y + end.y) / 2 } };
}
export function annotationLabelBox(a, geometry, width, textHeight) {
  const w = a.labelWidth * width, gap = a.labelGap * width, { middle, end, side } = geometry;
  if (a.labelPosition === 'end') return { x: end.x + (side > 0 ? gap : -gap - w), y: end.y - textHeight / 2, width: w, height: textHeight };
  return { x: middle.x - w / 2,
    y: a.labelPosition === 'above' ? middle.y - gap - textHeight : a.labelPosition === 'below' ? middle.y + gap : middle.y - textHeight / 2,
    width: w, height: textHeight };
}
export function scaleAnnotation(element, requestedScale) {
  // Clamp the scale as a whole so reaching a limit never changes the line angle
  // or the proportions between text, markers and segments.
  const fields = ['length', 'tailLength', 'capSize', 'labelWidth', 'labelGap'];
  const ranges = fields.map(key => [element.annotation[key], ...ANNOTATION_NUMBERS[key]]);
  ranges.push([element.fontSize, 0.001, 1], [element.strokeWidth, 0, 0.1]);
  let min = 0, max = Infinity;
  for (const [value, low, high] of ranges) if (value > 0) { min = Math.max(min, low / value); max = Math.min(max, high / value); }
  const scale = Math.max(min, Math.min(max, Number.isFinite(requestedScale) ? requestedScale : 1));
  const annotation = { ...element.annotation };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  for (const key of fields) annotation[key] = clamp(annotation[key] * scale, ...ANNOTATION_NUMBERS[key]);
  return { annotation, fontSize: clamp(element.fontSize * scale, 0.001, 1), strokeWidth: clamp(element.strokeWidth * scale, 0, 0.1) };
}
