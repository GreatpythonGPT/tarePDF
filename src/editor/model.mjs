import { annotationDefaults, validateAnnotation } from './annotations.mjs';
export const VERSION = 2;
export const uid = () => globalThis.crypto.randomUUID();
// Keep immutable data URL strings shared between history entries; copying their bytes
// for every keystroke would make a large photo project exhaust memory very quickly.
export const clone = value => Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
export const adjustments = () => ({ exposure: 0, brightness: 0, contrast: 0, saturation: 0, temperature: 0, sharpness: 0 });
export function createProject() {
  return { version: VERSION, name: '未命名作品', pages: [], layouts: {}, export: { width: 2400, scope: 'all', cover: false, title: '我的作品集', separator: false, background: '#ffffff' } };
}
export function addPage(project, image) {
  const layoutId = uid();
  project.layouts[layoutId] = { id: layoutId, name: '独立排版', elements: [] };
  const page = { id: uid(), name: image.name, src: image.src, width: image.width, height: image.height, layoutId, adjustments: adjustments(), rotation: 0, crop: { x: 0, y: 0, w: 1, h: 1 } };
  project.pages.push(page);
  return page;
}
export function pageSize(page) {
  const [w, h] = page.rotation % 180 ? [page.height, page.width] : [page.width, page.height];
  return { width: Math.max(1, Math.round(w * page.crop.w)), height: Math.max(1, Math.round(h * page.crop.h)) };
}
export function setCrop(page, ratio) {
  const [w, h] = page.rotation % 180 ? [page.height, page.width] : [page.width, page.height];
  const cw = ratio ? Math.min(w, h * ratio) / w : 1;
  const ch = ratio ? Math.min(h, w / ratio) / h : 1;
  page.crop = { x: (1 - cw) / 2, y: (1 - ch) / 2, w: cw, h: ch };
}
export function linkedPages(project, layoutId) { return project.pages.filter(p => p.layoutId === layoutId); }
export function linkPages(project, sourceId, selectedIds) {
  const source = project.pages.find(p => p.id === sourceId);
  if (!source) throw new Error('当前页面不存在');
  for (const page of project.pages) if (selectedIds.includes(page.id)) page.layoutId = source.layoutId;
  project.layouts[source.layoutId].name = '共享排版';
  collectLayouts(project);
}
export function detachPages(project, ids, keepSharedElements = false) {
  for (const page of project.pages) {
    if (!ids.includes(page.id)) continue;
    const layout = clone(project.layouts[page.layoutId]);
    layout.id = uid(); layout.name = '独立排版';
    if (!keepSharedElements) for (const element of layout.elements) delete element.sharedId;
    project.layouts[layout.id] = layout;
    page.layoutId = layout.id;
  }
  collectLayouts(project);
}
export function elementPages(project, layoutId, elementId) {
  const element = project.layouts[layoutId]?.elements.find(e => e.id === elementId);
  if (!element) return [];
  return project.pages.filter(page => page.layoutId === layoutId || (element.sharedId && project.layouts[page.layoutId].elements.some(e => e.sharedId === element.sharedId)));
}
export function updateElement(project, layoutId, elementId, patch) {
  const source = project.layouts[layoutId]?.elements.find(e => e.id === elementId);
  if (!source) return;
  for (const layout of Object.values(project.layouts)) for (const element of layout.elements) {
    if (element === source || (source.sharedId && element.sharedId === source.sharedId)) Object.assign(element, clone(patch));
  }
}
export function shareElement(project, sourcePageId, elementId, ids) {
  const page = project.pages.find(p => p.id === sourcePageId);
  const source = project.layouts[page?.layoutId]?.elements.find(e => e.id === elementId);
  if (!source) return;
  source.sharedId ||= uid();
  for (const target of project.pages.filter(p => ids.includes(p.id))) {
    const layout = project.layouts[target.layoutId];
    if (!layout.elements.some(e => e.sharedId === source.sharedId)) layout.elements.push({ ...clone(source), id: uid() });
  }
}
export function detachElement(project, pageId, elementId) {
  const page = project.pages.find(p => p.id === pageId); if (!page) return;
  if (linkedPages(project, page.layoutId).length > 1) {
    // Preserve synchronization of the other objects when just one object is detached.
    for (const element of project.layouts[page.layoutId].elements) if (element.id !== elementId) element.sharedId ||= uid();
    detachPages(project, [pageId], true);
  }
  const element = project.layouts[page.layoutId].elements.find(e => e.id === elementId);
  if (element) delete element.sharedId;
}
export function collectLayouts(project) {
  const used = new Set(project.pages.map(p => p.layoutId));
  for (const id of Object.keys(project.layouts)) if (!used.has(id)) delete project.layouts[id];
}
export function removePages(project, ids) {
  project.pages = project.pages.filter(p => !ids.includes(p.id)); collectLayouts(project);
}
export function movePage(project, id, offset) {
  const index = project.pages.findIndex(p => p.id === id);
  const target = Math.max(0, Math.min(project.pages.length - 1, index + offset));
  if (index < 0 || target === index) return;
  project.pages.splice(target, 0, project.pages.splice(index, 1)[0]);
}
export function reorderPages(project, ids, targetId, after = false) {
  if (ids.includes(targetId)) return;
  const moved = project.pages.filter(p => ids.includes(p.id));
  const remaining = project.pages.filter(p => !ids.includes(p.id));
  const index = remaining.findIndex(p => p.id === targetId);
  if (index < 0 || !moved.length) return;
  remaining.splice(index + (after ? 1 : 0), 0, ...moved); project.pages = remaining;
}
export function newElement(type) {
  if (type === 'annotation') return { ...newElement('text'), type, x: 0.3, y: 0.52, w: 0.35, h: 0.2, fill: '#295b46', stroke: '#295b46', strokeWidth: 0.0025, text: '细节说明', fontSize: 0.024, align: 'center', annotation: annotationDefaults() };
  return { id: uid(), type, x: 0.12, y: 0.15, w: type === 'text' ? 0.65 : 0.3, h: type === 'text' ? 0.22 : 0.2,
    rotation: 0, fill: type === 'text' ? '#ffffff' : '#d6a269', stroke: '#ffffff', strokeWidth: 0.003, opacity: 1,
    text: '双击编辑文字', fontSize: 0.055, bold: false, align: 'left', locked: false, radius: 0.008 };
}
export function presetElements(kind) {
  const e = (type, props) => ({ ...newElement(type), ...props });
  if (kind === 'editorial') return [
    e('rect', { x: 0.05, y: 0.65, w: 0.9, h: 0.29, fill: '#182a2d', strokeWidth: 0, opacity: 0.9 }),
    e('text', { x: 0.085, y: 0.68, w: 0.8, h: 0.06, text: '空间 · 生活 · 灵感', fontSize: 0.018, fill: '#d8bd93' }),
    e('text', { x: 0.085, y: 0.755, w: 0.8, h: 0.12, text: '让灵感，有处安放', fontSize: 0.047, bold: true }),
    e('text', { x: 0.085, y: 0.88, w: 0.8, h: 0.04, text: 'TARE STUDIO  /  DESIGN COLLECTION', fontSize: 0.012, fill: '#c5d1cf' })
  ];
  if (kind === 'minimal') return [
    e('rect', { x: 0, y: 0, w: 1, h: 0.19, fill: '#f7f5ef', strokeWidth: 0 }),
    e('text', { x: 0.055, y: 0.045, w: 0.85, h: 0.075, text: '日常之外', fontSize: 0.042, fill: '#253c39', bold: true }),
    e('text', { x: 0.058, y: 0.132, w: 0.82, h: 0.045, text: 'A QUIET PERSPECTIVE  /  2026', fontSize: 0.013, fill: '#64746c' })
  ];
  return [e('annotation', { text: '看见设计细节', x: 0.26, y: 0.48 })];
}

// Snapshot history shares immutable image strings; it never rasterizes or mutates originals.
export class History {
  constructor(project, limit = 60) { this.limit = limit; this.reset(project); }
  reset(project) { this.past = []; this.future = []; this.current = clone(project); }
  commit(project) {
    if (this.signature(this.current) === this.signature(project)) return false;
    this.past.push(this.current); if (this.past.length > this.limit) this.past.shift();
    this.current = clone(project); this.future = []; return true;
  }
  signature(project) { return JSON.stringify(project, (key, value) => key === 'src' ? undefined : value); }
  undo() { if (!this.past.length) return null; this.future.push(this.current); this.current = this.past.pop(); return clone(this.current); }
  redo() { if (!this.future.length) return null; this.past.push(this.current); this.current = this.future.pop(); return clone(this.current); }
}

const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const color = value => typeof value === 'string' && /^#[a-fA-F0-9]{6}$/.test(value);
const idOK = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
export function validateProject(input) {
  const fail = () => { throw new Error('作品文件格式不正确或版本不支持，请选择由 Tare Studio 保存的 .tare 文件'); };
  if (!input || input.version !== VERSION || typeof input.name !== 'string' || input.name.length > 200 || !Array.isArray(input.pages) || input.pages.length > 300 || !input.layouts || typeof input.layouts !== 'object' || Array.isArray(input.layouts)) fail();
  const project = createProject(); project.name = input.name;
  for (const [id, layout] of Object.entries(input.layouts)) {
    if (!idOK(id) || layout?.id !== id || !Array.isArray(layout.elements) || layout.elements.length > 500) fail();
    const elements = []; const ids = new Set();
    for (const obj of layout.elements) {
      if (!obj || !idOK(obj.id) || ids.has(obj.id) || !['text', 'rect', 'ellipse', 'arrow', 'image', 'annotation'].includes(obj.type)) fail();
      ids.add(obj.id);
      if (!finite(obj.x, -5, 5) || !finite(obj.y, -5, 5) || !finite(obj.w, -5, 5) || !finite(obj.h, -5, 5) || !finite(obj.rotation, -36000, 36000) || !finite(obj.opacity, 0, 1) || !finite(obj.strokeWidth, 0, 0.1) || !color(obj.fill) || !color(obj.stroke)) fail();
      const out = { ...newElement(obj.type), id: obj.id };
      for (const key of ['x', 'y', 'w', 'h', 'rotation', 'opacity', 'strokeWidth', 'fill', 'stroke']) out[key] = obj[key];
      out.locked = !!obj.locked;
      if (obj.sharedId !== undefined) { if (!idOK(obj.sharedId)) fail(); out.sharedId = obj.sharedId; }
      if (obj.type === 'text' || obj.type === 'annotation') {
        if (typeof obj.text !== 'string' || obj.text.length > 10000 || !finite(obj.fontSize, 0.001, 1) || !['left', 'center', 'right'].includes(obj.align)) fail();
        Object.assign(out, { text: obj.text, fontSize: obj.fontSize, align: obj.align, bold: !!obj.bold });
      }
      if (obj.type === 'annotation') out.annotation = validateAnnotation(obj.annotation);
      if (obj.type === 'image') { if (!validImageData(obj.src)) fail(); out.src = obj.src; }
      elements.push(out);
    }
    project.layouts[id] = { id, name: typeof layout.name === 'string' ? layout.name.slice(0, 80) : '排版', elements };
  }
  const shared = new Map();
  for (const layout of Object.values(project.layouts)) for (const e of layout.elements) if (e.sharedId) {
    const fingerprint = JSON.stringify({ ...e, id: undefined });
    if (shared.has(e.sharedId) && shared.get(e.sharedId) !== fingerprint) fail();
    shared.set(e.sharedId, fingerprint);
  }
  const ids = new Set();
  for (const p of input.pages) {
    if (!p || !idOK(p.id) || ids.has(p.id) || !Object.hasOwn(project.layouts, p.layoutId) || !validImageData(p.src) || typeof p.name !== 'string' || p.name.length > 500 || !finite(p.width, 1, 30000) || !finite(p.height, 1, 30000) || p.width * p.height > 80000000 || ![0, 90, 180, 270].includes(p.rotation)) fail();
    ids.add(p.id);
    if (!p.crop || !finite(p.crop.x, 0, 1) || !finite(p.crop.y, 0, 1) || !finite(p.crop.w, 1e-9, 1) || !finite(p.crop.h, 1e-9, 1) || p.crop.x + p.crop.w > 1.00001 || p.crop.y + p.crop.h > 1.00001) fail();
    const adj = adjustments();
    for (const key of Object.keys(adj)) { if (!finite(p.adjustments?.[key], key === 'sharpness' ? 0 : -100, 100)) fail(); adj[key] = p.adjustments[key]; }
    project.pages.push({ id: p.id, name: p.name, src: p.src, width: p.width, height: p.height, layoutId: p.layoutId, rotation: p.rotation, crop: { x: p.crop.x, y: p.crop.y, w: p.crop.w, h: p.crop.h }, adjustments: adj });
  }
  const exp = input.export || {};
  if (exp.width !== undefined && ![1600, 2400, 3600, 0].includes(exp.width)) fail();
  if (exp.title !== undefined && (typeof exp.title !== 'string' || exp.title.length > 1000)) fail();
  project.export = { ...project.export, width: exp.width ?? 2400, scope: exp.scope === 'selected' ? 'selected' : 'all', cover: !!exp.cover, title: exp.title ?? '我的作品集', separator: !!exp.separator, background: color(exp.background) ? exp.background : '#ffffff' };
  collectLayouts(project); return project;
}
export function validImageData(src) { return typeof src === 'string' && src.length < 100000000 && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$/.test(src); }
