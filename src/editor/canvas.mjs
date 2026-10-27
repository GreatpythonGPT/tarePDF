import Konva from 'konva';
import { pageSize } from './model.mjs';
import { loadImage } from './images.mjs';
import { makeAnnotation } from './annotation-canvas.mjs';
import { scaleAnnotation } from './annotations.mjs';
const imageCache = new Map();
export async function makeElement(e, width, height) {
  if (e.type === 'annotation') return makeAnnotation(e, width, height);
  const common = { id: e.id, x: e.x * width, y: e.y * height, rotation: e.rotation, opacity: e.opacity, fill: e.fill, stroke: e.stroke, strokeWidth: e.strokeWidth * width, draggable: !e.locked, name: 'element' };
  const w = Math.max(1, Math.abs(e.w * width)), h = Math.max(1, Math.abs(e.h * height));
  if (e.type === 'text') return new Konva.Text({ ...common, width: w, text: e.text, fontFamily: 'Noto Sans SC', fontSize: e.fontSize * width, fontStyle: e.bold ? 'bold' : 'normal', align: e.align, verticalAlign: 'top', lineHeight: 1.3, wrap: 'word', strokeWidth: 0, padding: 0 });
  if (e.type === 'rect') return new Konva.Rect({ ...common, width: w, height: h, cornerRadius: (e.radius || 0) * width });
  if (e.type === 'ellipse') return new Konva.Ellipse({ ...common, radiusX: w / 2, radiusY: h / 2, offsetX: -w / 2, offsetY: -h / 2 });
  if (e.type === 'arrow') return new Konva.Arrow({ ...common, points: [0, 0, e.w * width, e.h * height], pointerLength: Math.max(10, e.strokeWidth * width * 3), pointerWidth: Math.max(10, e.strokeWidth * width * 3), hitStrokeWidth: 18, lineCap: 'round', lineJoin: 'round' });
  if (e.type === 'image') {
    if (!imageCache.has(e.src)) { if (imageCache.size > 20) imageCache.clear(); imageCache.set(e.src, loadImage(e.src)); }
    return new Konva.Image({ ...common, image: await imageCache.get(e.src), width: w, height: h, strokeWidth: 0 });
  }
}
export class CanvasEditor {
  constructor(host, { onSelect, onChange, onStatus }) {
    this.host = host; this.onSelect = onSelect; this.onChange = onChange; this.onStatus = onStatus;
    this.stage = new Konva.Stage({ container: host, width: 1, height: 1 });
    this.layer = new Konva.Layer(); this.stage.add(this.layer);
    this.paper = new Konva.Group(); this.layer.add(this.paper);
    this.background = new Konva.Rect({ fill: '#ffffff', shadowColor: '#243c34', shadowBlur: 24, shadowOpacity: 0.12, shadowOffsetY: 8 });
    this.picture = new Konva.Image({ listening: false }); this.elements = new Konva.Group();
    this.paper.add(this.background, this.picture, this.elements);
    this.guides = new Konva.Group({ listening: false }); this.paper.add(this.guides);
    this.transformer = new Konva.Transformer({ rotateEnabled: true, rotationSnaps: [0, 45, 90, 180, 270], flipEnabled: false, borderStroke: '#457c68', anchorStroke: '#457c68', anchorFill: '#ffffff', anchorSize: 9, anchorCornerRadius: 3, padding: 2,
      boundBoxFunc: (oldBox, box) => {
        const annotation = this.layout?.elements.find(e => e.id === this.selectedId)?.type === 'annotation';
        return (annotation ? Math.max(Math.abs(box.width), Math.abs(box.height)) < 10 : Math.abs(box.width) < 10 || Math.abs(box.height) < 10) ? oldBox : box;
      } });
    this.layer.add(this.transformer);
    this.stage.on('click tap', event => { if (event.target === this.stage || event.target === this.background) this.select(null); });
    this.resizeObserver = new ResizeObserver(() => this.fit()); this.resizeObserver.observe(host);
    this.generation = 0; this.elementGeneration = 0; this.zoom = 1; this.fitMode = true;
    let space = false, pan;
    document.addEventListener('keydown', event => { if (event.code === 'Space' && !event.target.closest('input,textarea,select,button,dialog')) { space = true; event.preventDefault(); host.style.cursor = 'grab'; } });
    document.addEventListener('keyup', event => { if (event.code === 'Space') { space = false; if (!pan) host.style.cursor = ''; } });
    window.addEventListener('blur', () => { space = false; pan = null; host.style.cursor = ''; });
    host.addEventListener('pointerdown', event => {
      if (!this.page || (!space && event.button !== 1)) return;
      event.preventDefault(); event.stopImmediatePropagation(); this.finishText();
      pan = { x: event.clientX, y: event.clientY, px: this.paper.x(), py: this.paper.y() }; host.setPointerCapture(event.pointerId); host.style.cursor = 'grabbing'; this.fitMode = false;
    }, true);
    host.addEventListener('pointermove', event => { if (!pan) return; this.paper.position({ x: pan.px + event.clientX - pan.x, y: pan.py + event.clientY - pan.y }); this.layer.batchDraw(); });
    const stopPan = () => { pan = null; host.style.cursor = space ? 'grab' : ''; };
    host.addEventListener('pointerup', stopPan); host.addEventListener('pointercancel', stopPan);
    host.addEventListener('wheel', event => {
      if (!this.page) return; event.preventDefault();
      const point = { x: event.offsetX, y: event.offsetY }, before = { x: (point.x - this.paper.x()) / this.zoom, y: (point.y - this.paper.y()) / this.zoom };
      if (event.ctrlKey || event.metaKey) { this.setZoom(event.deltaY > 0 ? 1 / 1.1 : 1.1); this.paper.position({ x: point.x - before.x * this.zoom, y: point.y - before.y * this.zoom }); }
      else { this.fitMode = false; this.paper.position({ x: this.paper.x() - event.deltaX, y: this.paper.y() - event.deltaY }); }
      this.layer.batchDraw();
    }, { passive: false });
  }
  show(page, layout, backgroundColor) {
    this.finishText(); this.page = page; this.layout = layout;
    this.generation++; this.picture.image(null); this.bitmap?.close(); this.bitmap = null;
    if (!page) { this.elementGeneration++; this.paper.hide(); this.transformer.nodes([]); this.stage.draw(); return; }
    this.paper.show(); const size = pageSize(page);
    this.width = 1000; this.height = 1000 * size.height / size.width;
    this.background.setAttrs({ width: this.width, height: this.height, fill: backgroundColor });
    this.picture.setAttrs({ width: this.width, height: this.height });
    this.elements.clip({ x: 0, y: 0, width: this.width, height: this.height });
    this.fit(); this.renderElements(layout); return this.generation;
  }
  setBitmap(bitmap, generation) {
    if (generation !== this.generation) { bitmap.close(); return; }
    this.bitmap?.close(); this.bitmap = bitmap; this.picture.image(bitmap); this.layer.batchDraw();
  }
  async renderElements(layout) {
    this.layout = layout; const token = ++this.elementGeneration;
    const nodes = await Promise.all(layout.elements.map(e => makeElement(e, this.width, this.height)));
    if (token !== this.elementGeneration) { nodes.forEach(n => n.destroy()); return; }
    this.transformer.nodes([]); this.elements.destroyChildren();
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i], element = layout.elements[i]; this.elements.add(node);
      node.on('click tap', event => { event.cancelBubble = true; this.select(element.id); });
      node.on('dragstart', () => this.select(element.id));
      node.on('dragmove', () => this.snap(node));
      node.on('dragend transformend', () => {
        this.guides.destroyChildren();
        const patch = { x: node.x() / this.width, y: node.y() / this.height, rotation: node.rotation(), w: element.w * node.scaleX(), h: element.h * node.scaleY() };
        if (element.type === 'text') { patch.fontSize = Math.max(0.001, Math.min(1, element.fontSize * node.scaleY())); patch.h = node.height() * node.scaleY() / this.height; }
        if (element.type === 'annotation') Object.assign(patch, { w: element.w, h: element.h }, scaleAnnotation(element, node.scaleX()));
        node.scale({ x: 1, y: 1 }); this.onChange(element.id, patch);
      });
      node.on('dblclick dbltap', () => {
        if (element.locked) return;
        const text = element.type === 'text' ? node : element.type === 'annotation' ? node.findOne('.annotation-label') : null;
        if (text) this.editText(text, element);
      });
    }
    this.select(this.selectedId, false); this.layer.batchDraw();
  }
  select(id, notify = true) {
    this.selectedId = id;
    const node = this.elements.findOne(n => n.id() === id);
    const e = this.layout?.elements.find(e => e.id === id);
    this.transformer.enabledAnchors(e?.type === 'annotation' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']);
    this.transformer.nodes(node && !e?.locked ? [node] : []);
    this.layer.batchDraw(); if (notify) this.onSelect(id);
  }
  snap(node) {
    this.guides.destroyChildren();
    const rect = node.getClientRect({ relativeTo: this.paper });
    const threshold = 6 / this.zoom;
    for (const [axis, length, start, extent] of [['x', this.width, rect.x, rect.width], ['y', this.height, rect.y, rect.height]]) {
      let adjustment = null, guide;
      for (const target of [length * 0.05, length / 2, length * 0.95]) for (const edge of [start, start + extent / 2, start + extent]) {
        if (Math.abs(target - edge) < threshold && (adjustment === null || Math.abs(target - edge) < Math.abs(adjustment))) { adjustment = target - edge; guide = target; }
      }
      if (adjustment !== null) {
        node[axis](node[axis]() + adjustment);
        this.guides.add(new Konva.Line({ points: axis === 'x' ? [guide, 0, guide, this.height] : [0, guide, this.width, guide], stroke: '#a4d0bd', strokeWidth: 1 / this.zoom, dash: [5 / this.zoom, 5 / this.zoom] }));
      }
    }
  }
  fit(force = false) {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.stage.size({ width: w, height: h });
    if (this.width) {
      if (force || this.fitMode) this.zoom = Math.min((w - 90) / this.width, (h - 80) / this.height, 1.5);
      this.paper.position({ x: (w - this.width * this.zoom) / 2, y: (h - this.height * this.zoom) / 2 });
      this.paper.scale({ x: this.zoom, y: this.zoom });
      this.onStatus?.(this.zoom);
    }
    this.stage.batchDraw();
  }
  setZoom(factor) { this.finishText(); this.fitMode = factor === null; if (factor) this.zoom = Math.max(0.05, Math.min(3, this.zoom * factor)); this.fit(factor === null); }
  editText(node, element) {
    this.finishText(); this.select(null);
    const textarea = document.createElement('textarea'); textarea.className = 'canvas-text-editor'; textarea.value = element.text;
    const pos = node.getAbsolutePosition();
    Object.assign(textarea.style, { left: `${pos.x}px`, top: `${pos.y}px`, width: `${Math.max(node.width() * this.zoom, 120)}px`, height: `${Math.max(node.height() * this.zoom, 60)}px`, fontSize: `${element.fontSize * this.width * this.zoom}px`, lineHeight: '1.3', color: element.fill, fontWeight: element.bold ? '700' : '400', textAlign: element.align, transform: `rotate(${element.rotation}deg)` });
    if (element.type === 'annotation') { textarea.style.background = element.annotation.labelColor; textarea.style.padding = `${node.padding() * this.zoom}px`; textarea.style.lineHeight = '1.4'; }
    this.host.append(textarea); node.hide(); textarea.focus(); textarea.select();
    let done = false;
    const finish = cancel => { if (done) return; done = true; const text = textarea.value; textarea.remove(); node.show(); this.textFinish = null; if (!cancel && text !== element.text) this.onChange(element.id, { text }); this.select(element.id); };
    textarea.addEventListener('blur', () => finish(false));
    textarea.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); finish(true); } if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) finish(false); });
    this.textFinish = finish;
  }
  finishText() { this.textFinish?.(false); }
  dropPosition(clientX, clientY) {
    if (!this.page) return null;
    const rect = this.host.getBoundingClientRect();
    const point = this.paper.getAbsoluteTransform().copy().invert().point({ x: clientX - rect.left, y: clientY - rect.top });
    return point.x >= 0 && point.y >= 0 && point.x <= this.width && point.y <= this.height ? { x: point.x / this.width, y: point.y / this.height } : null;
  }
  centeredX(id) {
    const node = this.elements.findOne(n => n.id() === id); if (!node) return null;
    const box = node.getClientRect({ relativeTo: this.paper });
    return (node.x() + (this.width - box.width) / 2 - box.x) / this.width;
  }
  thumbnail() { this.transformer.hide(); const data = this.paper.toDataURL({ x: this.paper.x(), y: this.paper.y(), width: this.width * this.zoom, height: this.height * this.zoom, pixelRatio: 160 / (this.width * this.zoom) }); this.transformer.show(); return data; }
}
export async function composeCanvas(page, layout, bitmap, background = '#ffffff') {
  const host = document.createElement('div'); host.className = 'offscreen-canvas'; document.body.append(host);
  const width = bitmap.width, height = bitmap.height;
  const stage = new Konva.Stage({ container: host, width, height }); const layer = new Konva.Layer({ listening: false }); stage.add(layer);
  try {
    layer.add(new Konva.Rect({ width, height, fill: background }), new Konva.Image({ image: bitmap, width, height }));
    for (const element of layout.elements) layer.add(await makeElement(element, width, height));
    layer.draw(); return stage.toCanvas({ pixelRatio: 1 });
  } finally { stage.destroy(); host.remove(); }
}
