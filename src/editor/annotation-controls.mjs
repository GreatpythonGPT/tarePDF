import { ANNOTATION_PRESETS, ANNOTATION_NUMBERS, annotationDefaults, annotationGeometry } from './annotations.mjs';

const $ = id => document.getElementById(id);
const svgNode = (name, attrs) => { const node = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); return node; };
function preview(preset) {
  const a = annotationDefaults(preset.id), g = annotationGeometry(a, 225);
  const svg = svgNode('svg', { viewBox: '0 0 120 90', 'aria-hidden': 'true' });
  const line = svgNode('g', { transform: 'translate(20 68)', stroke: 'currentColor', 'stroke-width': 1.8, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  line.append(svgNode('polyline', { points: g.points.reduce((list, n, i) => list + (i % 2 ? ',' : ' ') + n.toFixed(2), '').trim() }));
  const cap = (type, p, angle) => {
    if (type === 'arrow') line.append(svgNode('path', { d: 'M0 0 -8 -4 -6 0 -8 4Z', fill: 'currentColor', 'stroke-width': 0, transform: `translate(${p.x} ${p.y}) rotate(${angle * 180 / Math.PI})` }));
    else if (type !== 'none') line.append(svgNode('circle', { cx: p.x, cy: p.y, r: type === 'number' ? 9 : type === 'ring' ? 4 : 3, fill: type === 'ring' ? '#f4f7f1' : 'currentColor' }));
  };
  cap(a.startCap, g.start, g.startAngle); cap(a.endCap, g.end, g.endAngle);
  if (a.startCap === 'number') { const t = svgNode('text', { x: 0, y: 3.3, fill: 'white', stroke: 'none', 'font-size': 9, 'text-anchor': 'middle' }); t.textContent = '01'; line.append(t); }
  const t = svgNode('text', { x: g.middle.x, y: g.middle.y - 12, fill: 'currentColor', stroke: 'none', 'font-size': 11, 'text-anchor': 'middle' }); t.textContent = preset.id === 'dimension' ? '120 mm' : '细节说明'; line.append(t); svg.append(line); return svg;
}

export function initAnnotationControls({ getElement, onPatch, onAdd, onPalette }) {
  for (const preset of ANNOTATION_PRESETS) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'annotation-card'; card.dataset.annotation = preset.id; card.draggable = true;
    card.title = `点击添加${preset.name}，或拖到画布上的指示位置`;
    const name = document.createElement('strong'); name.textContent = preset.name;
    const hint = document.createElement('small'); hint.textContent = preset.hint;
    card.append(preview(preset), name, hint); $('annotation-library').append(card);
    card.addEventListener('click', () => onAdd(preset.id));
    card.addEventListener('dragstart', event => {
      if (card.disabled) { event.preventDefault(); return; }
      event.dataTransfer.setData('application/x-tare-annotation', preset.id); event.dataTransfer.effectAllowed = 'copy';
    });
    card.addEventListener('dragend', () => $('canvas-area').classList.remove('drop-annotation'));
    const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.name; $('annotation-preset').append(option);
  }
  const patch = (changes, final = true) => { const e = getElement(); if (e?.type === 'annotation' && !e.locked) onPatch({ annotation: { ...e.annotation, ...changes } }, final); };
  $('annotation-open').addEventListener('click', onPalette);
  $('annotation-preset').addEventListener('change', event => {
    const e = getElement(); if (!e || e.locked) return;
    const preset = ANNOTATION_PRESETS.find(p => p.id === event.target.value);
    if (preset) patch({ preset: preset.id, ...preset.params });
  });
  for (const key of ['direction', 'startCap', 'endCap', 'dash', 'labelPosition', 'labelColor']) {
    $(`annotation-${key}`).addEventListener('change', event => patch({ [key]: event.target.value }));
  }
  for (const key of ['showLabel', 'labelBackground']) $(`annotation-${key}`).addEventListener('change', event => patch({ [key]: event.target.checked }));
  $('annotation-badgeText').addEventListener('input', event => patch({ badgeText: event.target.value.slice(0, 4) }, false));
  for (const key of Object.keys(ANNOTATION_NUMBERS)) {
    const factor = key === 'angle' ? 1 : 1000, [min, max] = ANNOTATION_NUMBERS[key];
    for (const suffix of ['', '-range']) {
      const input = $(`annotation-${key}${suffix}`); if (!input) continue;
      input.min = min * factor; input.max = max * factor;
      const handle = final => {
        if (!input.value || !Number.isFinite(input.valueAsNumber)) { if (final) renderAnnotationControls(getElement()); return; }
        const value = Math.max(min, Math.min(max, input.valueAsNumber / factor));
        if (final) input.value = Math.round(value * factor * 10) / 10;
        patch({ [key]: value }, final); renderAnnotationControls(getElement(), input);
      };
      if (suffix) input.addEventListener('input', () => handle(false));
      input.addEventListener('change', () => handle(true));
    }
  }
  document.querySelectorAll('[data-annotation-angle]').forEach(button => button.addEventListener('click', () => patch({ angle: Number(button.dataset.annotationAngle) })));
}

export function renderAnnotationControls(element, editing = document.activeElement) {
  const e = element?.type === 'annotation' ? element : null, a = e?.annotation;
  $('annotation-fields').hidden = !e; $('annotation-text-options').hidden = !e;
  document.querySelectorAll('[data-annotation]').forEach(card => { const active = !!a && card.dataset.annotation === a.preset; card.classList.toggle('active', active); });
  if (!e) return;
  for (const key of ['preset', 'direction', 'startCap', 'endCap', 'dash', 'labelPosition', 'badgeText', 'labelColor']) if ($(`annotation-${key}`) !== editing) $(`annotation-${key}`).value = a[key];
  for (const key of ['showLabel', 'labelBackground']) $(`annotation-${key}`).checked = a[key];
  for (const key of Object.keys(ANNOTATION_NUMBERS)) {
    const value = Math.round(a[key] * (key === 'angle' ? 1 : 1000) * 10) / 10;
    for (const suffix of ['', '-range']) {
      const input = $(`annotation-${key}${suffix}`); if (!input) continue;
      if (suffix && key !== 'angle') input.max = Math.max(key === 'length' || key === 'tailLength' ? 500 : 100, value);
      if (input !== editing) input.value = value;
    }
  }
  $('annotation-length-title').textContent = a.kind === 'elbow' ? '斜 / 竖段长度' : '直线长度';
  $('annotation-tail-field').hidden = a.kind !== 'elbow';
  $('annotation-badge-field').hidden = a.startCap !== 'number';
  $('annotation-label-settings').hidden = !a.showLabel;
  $('annotation-label-color-field').hidden = !a.labelBackground && a.startCap !== 'number' && a.startCap !== 'ring' && a.endCap !== 'ring';
  document.querySelectorAll('[data-annotation-angle]').forEach(button => { const active = Number(button.dataset.annotationAngle) === a.angle; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}
