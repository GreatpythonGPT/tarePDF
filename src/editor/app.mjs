import { createProject, addPage, clone, uid, History, validateProject, newElement, presetElements, adjustments, pageSize, setCrop, linkedPages, linkPages, detachPages, removePages, movePage, reorderPages, elementPages, shareElement, detachElement, updateElement as patchElement } from './model.mjs';
import { ImageProcessor, normalizeImage } from './images.mjs';
import { CanvasEditor, composeCanvas } from './canvas.mjs';
import { createPDF, canvasBytes } from './export.mjs';
import { demoImages, annotationDemoImages } from './demo.mjs';
import { ANNOTATION_PRESETS, annotationDefaults } from './annotations.mjs';
import { initAnnotationControls, renderAnnotationControls } from './annotation-controls.mjs';
import { CollectionView } from './collection-view.mjs';

const $ = id => document.getElementById(id);
const api = window.studio;
let project = createProject(), activeId = null, selected = new Set(), elementId = null;
let history = new History(project), revision = 0, dirty = false, importing = false, exporting = false, saving = false;
let imageTimer, draftTimer, propertyTimer, toastTimer, thumbTimer;
let previewToken = 0, thumbsToken = 0, comparison = false, currentImageKey = null;
let draggingPages = [], lastCheckedId = null;
let workspaceView = 'edit', collectionMode = 'flow', exportPreviewToken = 0;
const thumbnails = new Map(), processor = new ImageProcessor(), thumbnailProcessor = new ImageProcessor();
const activePage = () => project.pages.find(p => p.id === activeId);
const activeLayout = () => project.layouts[activePage()?.layoutId];
const activeElement = () => activeLayout()?.elements.find(e => e.id === elementId);
const isEditable = target => target instanceof HTMLElement && (!!target.closest('input,textarea,select,[contenteditable="true"]'));
const labels = { text: '文字', rect: '矩形', ellipse: '圆形', arrow: '箭头', image: '贴图', annotation: '指示标注' };
const adjustmentLabels = { exposure: '曝光', brightness: '亮度', contrast: '对比度', saturation: '饱和度', temperature: '色温', sharpness: '锐化' };
function toast(message, error = false) { $('toast').textContent = message; $('toast').classList.toggle('error', error); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 3600); }
function safe(fn) { return async event => { try { await fn(event); } catch (error) { console.error(error); toast(error.message || '操作失败，请重试', true); } }; }
function bind(id, fn, event = 'click') { $(id).addEventListener(event, safe(fn)); }
function button(text, cls = '') { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; return b; }
function status(text) { $('save-status').textContent = text; }
const editor = new CanvasEditor($('canvas-host'), {
  onSelect(id) { elementId = id; renderInspector(); },
  onChange(id, patch) { const e = activeLayout()?.elements.find(e => e.id === id); if (!e) return; patchElement(project, activePage().layoutId, id, patch); elementId = id; commit(); },
  onStatus(zoom) { $('zoom-fit').textContent = `${Math.round(zoom * 100)}% · 适应`; }
});
const collection = new CollectionView($('collection-scroll'), {
  onSelect: switchPage,
  onOpen(id) { activeId = id; setWorkspaceView('edit'); },
  onCheck(id, checked, shift) { selectPageCheck(id, checked, shift); },
  onStart(ids) { draggingPages = ids; }, getDragging: () => draggingPages,
  onMove(ids, target, after) { reorderPages(project, ids, target, after); selected = new Set(ids); draggingPages = []; commit({ full: true }); },
  onEnd() { draggingPages = []; }, onError(error) { toast(error.message, true); }
});
const exportCollection = new CollectionView($('export-collection-preview'), { onError(error) { toast(error.message, true); } }, false);
function selectPageCheck(id, checked, shift) {
  const index = project.pages.findIndex(p => p.id === id), start = project.pages.findIndex(p => p.id === lastCheckedId);
  if (shift && start >= 0) for (let n = Math.min(start, index); n <= Math.max(start, index); n++) selected.add(project.pages[n].id);
  else checked ? selected.add(id) : selected.delete(id);
  lastCheckedId = id; renderSide(); renderInspector(); renderControls(); renderCollection();
}
function setWorkspaceView(view) {
  finishPending(); workspaceView = view; comparison = false; elementId = null; editor.select(null, false);
  document.querySelector('.workspace').dataset.mode = view;
  $('collection-view').hidden = view !== 'collection'; $('collection-inspector').hidden = view !== 'collection';
  $('view-edit').classList.toggle('active', view === 'edit'); $('view-collection').classList.toggle('active', view === 'collection');
  if (view === 'collection') setSidebar('pages');
  refresh();
}
function renderCollection() {
  if (workspaceView !== 'collection') return;
  collection.render(project, { activeId, selected, mode: collectionMode });
  $('collection-empty').hidden = !!project.pages.length;
  $('collection-count').textContent = `${project.pages.length} 张图片`;
  $('collection-selected').textContent = `已选 ${selected.size} 张`;
  $('collection-summary').textContent = `${project.export.sizing === 'width' ? `统一宽度 ${project.export.width} px` : '按图片原比例排列'} · 保留每张图片的比例${project.export.cover ? ' · 有开头标题条' : ''}${project.export.separator ? ' · 有图片间横条' : ''}`;
}
function renderOutputSettings() {
  const settings = project.export;
  for (const key of ['sizing', 'width', 'title', 'coverHeight', 'coverFontSize', 'coverAlign', 'coverColor', 'coverBackground', 'separatorHeight', 'separatorColor', 'background']) fieldValue(`collection-${key}`, settings[key]);
  for (const key of ['cover', 'separator']) $(`collection-${key}`).checked = settings[key];
  $('collection-title-fields').hidden = !settings.cover; $('collection-separator-fields').hidden = !settings.separator;
  $('collection-width-label').textContent = settings.sizing === 'width' ? '统一宽度 · px' : '最长边 · px（0 为原始尺寸）';
  $('collection-width').min = settings.sizing === 'width' ? '100' : '0';
  document.querySelectorAll('[data-output-width]').forEach(b => b.classList.toggle('active', settings.sizing === 'width' && Number(b.dataset.outputWidth) === settings.width));
  fieldValue('export-sizing', settings.sizing);
  const select = $('export-width'); select.querySelectorAll('[data-custom]').forEach(o => o.remove());
  if (![...select.options].some(o => Number(o.value) === settings.width)) { const option = document.createElement('option'); option.value = settings.width; option.textContent = `${settings.width} px · 自定义`; option.dataset.custom = 'true'; select.append(option); }
  select.querySelector('option[value="0"]').disabled = settings.sizing === 'width';
  fieldValue('export-width', settings.width); $('export-width-label').textContent = settings.sizing === 'width' ? '统一图片宽度' : '最长边清晰度';
}
function patchOutput(key, value, final = true) {
  const ranges = { width: [100, 5000], coverHeight: [40, 5000], coverFontSize: [8, 500], separatorHeight: [1, 2000] };
  if (ranges[key]) { if (!Number.isFinite(value)) return; const [min, max] = ranges[key]; value = key === 'width' && value === 0 && project.export.sizing === 'long-edge' ? 0 : Math.round(Math.max(min, Math.min(max, value))); }
  project.export[key] = value;
  if (key === 'sizing' && value === 'width' && !project.export.width) project.export.width = 1080;
  if (final) commit(); else { renderCollection(); clearTimeout(propertyTimer); propertyTimer = setTimeout(() => commit(), 450); }
  if ($('export-dialog').open) previewExport().catch(error => toast(error.message, true));
}
function markDirty() {
  revision++; dirty = true; api.setDirty(true); status('有新修改 · 正在自动保存');
  clearTimeout(draftTimer); const rev = revision;
  draftTimer = setTimeout(async () => {
    try { await api.saveDraft(JSON.stringify(project)); if (rev === revision) status('已自动保存 · 可继续恢复'); }
    catch (error) { status('自动保存失败，请手动保存作品'); toast(error.message, true); }
  }, 1400);
}
function commit({ image = false, full = false } = {}) {
  clearTimeout(propertyTimer);
  if (history.commit(project)) markDirty();
  renderSide(); renderInspector(); renderControls();
  if (full) showPage(); else if (workspaceView === 'edit') { if (activeLayout()) editor.renderElements(activeLayout()); if (image) scheduleImage(); }
  renderCollection();
  scheduleThumbnails();
}
function finishPending() { editor.finishText(); clearTimeout(propertyTimer); if (history.commit(project)) markDirty(); }
function switchPage(id) {
  finishPending(); activeId = id; elementId = null; editor.select(null, false); showPage(); renderSide(); renderInspector(); renderControls();
  renderCollection();
}
function showPage() {
  const p = activePage(); currentImageKey = null; previewToken++; clearTimeout(imageTimer);
  if (workspaceView === 'collection') { editor.show(null, null); $('processing').hidden = true; return; }
  editor.show(p, p ? project.layouts[p.layoutId] : null, project.export.background);
  $('empty-state').hidden = !!p;
  $('active-name').textContent = p?.name || '你的下一份作品，从这里开始';
  if (p) { const size = pageSize(p); $('page-info').textContent = `第 ${project.pages.indexOf(p) + 1} / ${project.pages.length} 页 · ${size.width} × ${size.height} px`; scheduleImage(true); }
  else { $('page-info').textContent = '准备好开始创作'; $('processing').hidden = true; }
}
function imageKey(p, original = false) { return JSON.stringify([p.id, p.rotation, p.crop, original ? 'original' : p.adjustments]); }
function scheduleImage(immediate = false) {
  const p = activePage(); if (!p) return;
  const token = ++previewToken; const snapshot = clone(p), generation = editor.generation, original = comparison;
  const key = imageKey(p, original);
  clearTimeout(imageTimer);
  if (currentImageKey === key) { $('processing').hidden = true; return; }
  $('processing').hidden = false;
  imageTimer = setTimeout(async () => {
    try {
      const bitmap = await processor.process(snapshot, 1800, original);
      if (token !== previewToken || activeId !== snapshot.id) { bitmap.close(); return; }
      editor.setBitmap(bitmap, generation); currentImageKey = key;
    } catch (error) { if (token === previewToken) toast(error.message, true); }
    finally { if (token === previewToken) $('processing').hidden = true; }
  }, immediate ? 0 : 90);
}
function thumbKey(p) { return imageKey(p) + JSON.stringify(project.layouts[p.layoutId]) + project.export.background; }
function scheduleThumbnails() {
  clearTimeout(thumbTimer); const token = ++thumbsToken;
  thumbTimer = setTimeout(async () => {
    const snapshot = clone(project);
    for (const p of snapshot.pages) {
      if (token !== thumbsToken) return;
      const current = project.pages.find(page => page.id === p.id); if (!current) continue;
      const key = thumbKey(current);
      if (thumbnails.get(p.id)?.key === key) continue;
      let bitmap;
      try {
        bitmap = await thumbnailProcessor.process(p, 320);
        if (token !== thumbsToken) return;
        const canvas = await composeCanvas(p, snapshot.layouts[p.layoutId], bitmap, snapshot.export.background);
        const src = canvas.toDataURL('image/jpeg', 0.8); canvas.width = 1;
        if (token !== thumbsToken) return;
        thumbnails.set(p.id, { key, src });
        const image = $('pages-list').querySelector(`[data-page-id="${p.id}"] img`); if (image) image.src = src;
      } catch (error) { console.error('缩略图更新失败', error); }
      finally { bitmap?.close(); }
    }
    for (const id of thumbnails.keys()) if (!project.pages.some(p => p.id === id)) thumbnails.delete(id);
  }, 350);
}
function renderSide() {
  const scroll = $('pages-list').scrollTop; $('pages-list').replaceChildren();
  $('page-count').textContent = project.pages.length;
  $('selection-count').textContent = `已选 ${selected.size} 张`;
  $('select-all').checked = project.pages.length > 0 && selected.size === project.pages.length;
  $('select-all').indeterminate = selected.size > 0 && selected.size < project.pages.length;
  project.pages.forEach((p, index) => {
    const card = document.createElement('div'); card.className = `page-card${p.id === activeId ? ' active' : ''}`; card.dataset.pageId = p.id;
    card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', `编辑页面 ${index + 1}：${p.name}`); card.setAttribute('aria-current', String(p.id === activeId));
    const image = document.createElement('img'); image.className = 'page-thumb'; image.src = thumbnails.get(p.id)?.src || '../assets/placeholder.svg'; image.alt = ''; image.draggable = false;
    const label = document.createElement('label'); label.className = 'page-check';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(p.id); check.setAttribute('aria-label', `选择页面 ${index + 1}`);
    label.addEventListener('click', event => event.stopPropagation());
    check.addEventListener('click', event => selectPageCheck(p.id, check.checked, event.shiftKey)); label.append(check);
    const caption = document.createElement('div'); caption.className = 'page-caption';
    const number = document.createElement('span'); number.className = 'page-number'; number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span'); name.className = 'page-name'; name.textContent = p.name; name.title = p.name; caption.append(number, name);
    const layoutLinked = linkedPages(project, p.layoutId).length > 1;
    const elementLinked = project.layouts[p.layoutId].elements.some(e => e.sharedId && elementPages(project, p.layoutId, e.id).length > 1);
    if (layoutLinked || elementLinked) { const badge = document.createElement('span'); badge.className = 'linked-label'; badge.textContent = layoutLinked ? '共享' : '元素同步'; caption.append(badge); }
    card.append(image, label, caption);
    card.draggable = true;
    card.addEventListener('dragstart', event => {
      draggingPages = selected.has(p.id) ? [...selected] : [p.id];
      event.dataTransfer.setData('application/x-tare-pages', 'reorder'); event.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragover', event => {
      if (!draggingPages.length) return; event.preventDefault(); event.stopPropagation();
      const after = event.clientY > card.getBoundingClientRect().top + card.clientHeight / 2;
      document.querySelectorAll('.drop-before,.drop-after').forEach(c => c.classList.remove('drop-before', 'drop-after'));
      card.classList.add(after ? 'drop-after' : 'drop-before');
    });
    card.addEventListener('drop', event => {
      if (!draggingPages.length) return; event.preventDefault(); event.stopPropagation();
      reorderPages(project, draggingPages, p.id, card.classList.contains('drop-after')); selected = new Set(draggingPages); draggingPages = []; commit({ full: true });
    });
    card.addEventListener('dragend', () => { draggingPages = []; document.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(c => c.classList.remove('dragging', 'drop-before', 'drop-after')); });
    card.addEventListener('click', () => switchPage(p.id)); card.addEventListener('keydown', e => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); switchPage(p.id); } });
    $('pages-list').append(card);
  });
  $('pages-list').scrollTop = scroll;
}
function fieldValue(id, value) { const node = $(id); if (document.activeElement !== node) node.value = value; }
function renderInspector() {
  renderOutputSettings();
  const p = activePage(), e = activeElement(); const count = p ? linkedPages(project, p.layoutId).length : 0;
  $('linked-count').textContent = count;
  $('sharing-title').textContent = count > 1 ? `${count} 张图片，共享一套排版` : '一套排版，多张同步';
  $('sharing-description').textContent = count > 1 ? '编辑这里的文字、位置和样式，会同步到所有共享页面。图片调色仍各自保留。' : '勾选左侧的页面，把当前排版共享给它们。';
  $('canvas-badge').hidden = count < 2;
  $('canvas-badge').querySelector('span').textContent = `${count} 页共享 · 修改会同步`;
  $('link-pages').disabled = !p || selected.size < 1 || [...selected].every(id => project.pages.find(p => p.id === id)?.layoutId === p.layoutId);
  $('detach-page').disabled = !p || (count < 2 && !activeLayout().elements.some(e => e.sharedId && elementPages(project, p.layoutId, e.id).length > 1));
  $('element-properties').hidden = !e; $('element-empty').hidden = !!e;
  renderAnnotationControls(e);
  if (e) {
    $('element-title').textContent = `${labels[e.type]}属性${e.locked ? ' · 已锁定' : ''}`;
    const elementCount = elementPages(project, p.layoutId, e.id).length;
    $('element-scope').textContent = elementCount > 1 ? `同步 ${elementCount} 页` : '当前页';
    $('text-fields').hidden = e.type !== 'text' && !(e.type === 'annotation' && e.annotation.showLabel); $('stroke-field').hidden = ['text', 'image'].includes(e.type); $('stroke-width-field').hidden = ['text', 'image'].includes(e.type);
    $('fill-title').textContent = e.type === 'annotation' ? '文字颜色' : '颜色'; $('stroke-title').textContent = e.type === 'annotation' ? '线条颜色' : '描边';
    fieldValue('element-text', e.text); fieldValue('font-size', Math.round(e.fontSize * 1000)); fieldValue('text-align', e.align);
    $('text-bold').classList.toggle('active', e.bold); $('text-bold').setAttribute('aria-pressed', String(e.bold));
    fieldValue('element-fill', e.fill); fieldValue('element-stroke', e.stroke); fieldValue('element-opacity', Math.round(e.opacity * 100)); fieldValue('element-rotation', Math.round(e.rotation % 360)); fieldValue('element-stroke-width', Math.round(e.strokeWidth * 1000));
    $('element-properties').querySelectorAll('input,textarea,select,button').forEach(node => { node.disabled = e.locked; });
    $('share-element').disabled = e.locked || selected.size < 1;
    $('detach-element').disabled = e.locked || elementCount < 2;
  }
  $('layer-list').replaceChildren();
  if (p) [...activeLayout().elements].reverse().forEach(layer => {
    const row = button('', `layer-item${layer.id === elementId ? ' active' : ''}`); row.dataset.elementId = layer.id;
    const icon = document.createElement('span'); icon.textContent = { text: 'T', rect: '▭', ellipse: '○', arrow: '↗', image: '▧', annotation: '↳' }[layer.type];
    const name = document.createElement('span'); name.className = 'layer-name'; name.textContent = ['text', 'annotation'].includes(layer.type) ? layer.text || labels[layer.type] : labels[layer.type];
    const tag = document.createElement('small'); tag.textContent = layer.locked ? '锁定' : elementPages(project, p.layoutId, layer.id).length > 1 ? '共享' : '';
    row.append(icon, name, tag); row.addEventListener('click', () => { elementId = layer.id; editor.select(layer.id, false); renderInspector(); }); $('layer-list').append(row);
  });
  if (!$('layer-list').children.length) { const note = document.createElement('p'); note.className = 'tiny-note'; note.textContent = '添加的文字、标注和贴图会显示在这里。'; $('layer-list').append(note); }
  for (const id of ['layer-up', 'layer-down', 'layer-lock']) $(id).disabled = !e;
  for (const key of Object.keys(adjustments())) { fieldValue(`adjust-${key}`, p?.adjustments[key] || 0); $(`value-${key}`).textContent = p?.adjustments[key] || 0; $(`adjust-${key}`).disabled = !p; }
  if (p) {
    const c = p.crop; fieldValue('crop-x', c.w < 0.9999 ? c.x / (1 - c.w) * 100 : 50); fieldValue('crop-y', c.h < 0.9999 ? c.y / (1 - c.h) * 100 : 50);
    $('crop-x').disabled = c.w > 0.9999; $('crop-y').disabled = c.h > 0.9999;
    const size = pageSize(p); const ratio = size.width / size.height;
    const options = [...$('crop-ratio').options]; const match = options.find(o => Number(o.value) && Math.abs(Number(o.value) - ratio) < 0.003);
    fieldValue('crop-ratio', c.w === 1 && c.h === 1 ? '0' : match?.value || '0');
  }
}
function renderControls() {
  const p = activePage(); $('undo').disabled = !history.past.length; $('redo').disabled = !history.future.length;
  $('collection-undo').disabled = !history.past.length; $('collection-redo').disabled = !history.future.length; $('collection-export').disabled = !p;
  for (const id of ['export-open', 'add-overlay', 'duplicate-page', 'page-up', 'page-down', 'compare', 'crop-ratio', 'rotate-image', 'reset-adjustments']) $(id).disabled = !p;
  $('delete-pages').disabled = !selected.size; $('copy-adjustments').disabled = !p || !selected.size;
  document.querySelectorAll('[data-add],[data-preset],[data-filter],[data-annotation]').forEach(b => { b.disabled = !p; });
  $('select-all').disabled = !project.pages.length;
}
function refresh() { fieldValue('project-name', project.name); showPage(); renderSide(); renderInspector(); renderControls(); renderCollection(); scheduleThumbnails(); }
function updateElement(patch, final = true) {
  const e = activeElement(); if (!e || e.locked) return; patchElement(project, activePage().layoutId, e.id, patch);
  if (final) commit(); else { editor.renderElements(activeLayout()); clearTimeout(propertyTimer); propertyTimer = setTimeout(() => commit(), 450); }
}
function addElement(type) {
  if (workspaceView !== 'edit') setWorkspaceView('edit');
  if (!activePage()) return; const e = newElement(type); activeLayout().elements.push(e); elementId = e.id; editor.selectedId = e.id; setInspector('layout'); commit();
}
function addAnnotation(preset, position) {
  if (!activePage() || !ANNOTATION_PRESETS.some(p => p.id === preset)) return;
  if (activeLayout().elements.length >= 500) { toast('当前排版已有 500 个元素，请先删除不需要的元素', true); return; }
  finishPending();
  if (workspaceView !== 'edit') setWorkspaceView('edit');
  const e = { ...newElement('annotation'), annotation: annotationDefaults(preset), ...position };
  if (preset === 'dimension') e.text = '120 mm';
  if (!position) { const offset = activeLayout().elements.filter(e => e.type === 'annotation').length % 5 * 0.025; e.x += offset; e.y += offset; }
  activeLayout().elements.push(e); elementId = e.id; editor.selectedId = e.id;
  setInspector('layout'); commit();
  // Put the new object's controls in reach without hiding the sharing tools.
  $('element-properties').scrollIntoView({ block: 'start' });
}
function deleteElement() { const e = activeElement(); if (!e || e.locked) return; if (e.sharedId) { for (const layout of Object.values(project.layouts)) layout.elements = layout.elements.filter(x => x.sharedId !== e.sharedId); } else activeLayout().elements = activeLayout().elements.filter(x => x.id !== e.id); elementId = null; editor.select(null, false); commit(); }
function duplicateElement() { const e = activeElement(); if (!e || e.locked) return; const copy = { ...clone(e), id: uid(), x: e.x + 0.025, y: e.y + 0.025 }; delete copy.sharedId; activeLayout().elements.push(copy); elementId = copy.id; editor.selectedId = copy.id; commit(); }
function setInspector(tab) { document.querySelectorAll('[data-inspector]').forEach(b => b.classList.toggle('active', b.dataset.inspector === tab)); $('layout-inspector').hidden = tab !== 'layout'; $('image-inspector').hidden = tab !== 'image'; }
function setSidebar(tab) {
  if (tab !== 'pages' && workspaceView !== 'edit') setWorkspaceView('edit');
  document.querySelectorAll('[data-sidebar]').forEach(b => b.classList.toggle('active', b.dataset.sidebar === tab));
  for (const name of ['pages', 'templates', 'annotations']) $(`${name}-panel`).hidden = name !== tab;
}
async function importFiles(files, overlay = false) {
  if (importing) { toast('正在导入，请稍候'); return; }
  if (!files.length) return;
  importing = true; const startingProject = project, pageId = activeId; const errors = [];
  try {
    finishPending(); status('正在导入图片…');
    const imported = [];
    for (const file of overlay ? [files[0]] : files) {
      try {
        if (!overlay && project.pages.length + imported.length >= 300) throw new Error('一个作品最多支持 300 页');
        imported.push(await normalizeImage(file));
      } catch (error) { errors.push(error.message); }
    }
    if (project !== startingProject) return;
    if (overlay) {
      const p = project.pages.find(p => p.id === pageId);
      if (p && imported[0]) { const img = imported[0], e = { ...newElement('image'), src: img.src, w: 0.25, h: 0.25 * (img.height / img.width) * (pageSize(p).width / pageSize(p).height) }; project.layouts[p.layoutId].elements.push(e); if (pageId === activeId) { elementId = e.id; editor.selectedId = e.id; } commit(); }
    } else {
      const pages = imported.map(image => addPage(project, image));
      if (pages.length) { activeId = pages[0].id; selected = new Set([pages[0].id]); elementId = null; setWorkspaceView('collection'); commit({ full: true }); toast(`已添加 ${pages.length} 张图片，可直接拖动排序`); }
    }
    if (errors.length) toast(errors.join('；'), true);
  } finally { importing = false; $('image-input').value = ''; $('overlay-input').value = ''; if (!dirty) status('作品已就绪'); }
}
function undo(redo = false) {
  finishPending(); const snapshot = redo ? history.redo() : history.undo(); if (!snapshot) return;
  project = snapshot; if (!activePage()) activeId = project.pages[0]?.id || null;
  selected = new Set([...selected].filter(id => project.pages.some(p => p.id === id))); elementId = null; editor.select(null, false); markDirty(); refresh();
}
async function saveProject(saveAs = false) {
  if (saving) return; finishPending(); const rev = revision, snapshot = JSON.stringify(project); saving = true; $('save-project').disabled = true;
  try {
    const result = await api.saveProject(snapshot, saveAs);
    if (result.canceled) { toast('已取消保存'); return; }
    if (rev === revision) { dirty = false; api.setDirty(false); status('作品已保存'); }
    toast(`已保存：${result.name}`);
  } finally { saving = false; $('save-project').disabled = false; }
}
async function replaceProject(next) {
  clearTimeout(draftTimer); clearTimeout(propertyTimer); finishPending(); clearTimeout(draftTimer);
  await api.newProject(); project = next; history = new History(project); activeId = project.pages[0]?.id || null; selected = new Set(activeId ? [activeId] : []); elementId = null; thumbnails.clear(); collection.clear(); exportCollection.clear(); editor.select(null, false); markDirty(); refresh();
}
function confirmDiscard() { return !dirty || window.confirm('当前作品有未保存的修改。继续会替换当前画布；如需保留，请先“保存作品”。'); }
async function previewExport() {
  const p = activePage(); if (!p) return;
  const token = ++exportPreviewToken;
  $('export-preview-image').hidden = workspaceView === 'collection'; $('export-collection-preview').hidden = workspaceView !== 'collection';
  $('export-preview-caption').textContent = workspaceView === 'collection' ? '整组 PDF 顺序预览' : '当前图片预览 · 标题与横条见整组编排';
  if (workspaceView === 'collection') { exportCollection.render(project, { ids: project.export.scope === 'selected' ? [...selected] : null }); return; }
  const snapshot = clone(project), page = snapshot.pages.find(x => x.id === p.id);
  const bitmap = await processor.process(page, 900);
  try { if (token !== exportPreviewToken) return; const canvas = await composeCanvas(page, snapshot.layouts[page.layoutId], bitmap, snapshot.export.background); if (token === exportPreviewToken) $('export-preview-image').src = canvas.toDataURL('image/png'); canvas.width = 1; } finally { bitmap.close(); }
}
async function openExport() {
  if (!activePage()) return; finishPending();
  fieldValue('export-scope', project.export.scope); fieldValue('export-width', project.export.width); fieldValue('export-title', project.export.title); fieldValue('export-background', project.export.background);
  $('export-cover').checked = project.export.cover; $('export-separator').checked = project.export.separator; $('export-title').disabled = !project.export.cover; $('export-progress').textContent = '';
  $('export-dialog').showModal(); await previewExport();
}
async function exportFile(format) {
  if (exporting) return; finishPending();
  const snapshot = clone(project), page = snapshot.pages.find(p => p.id === activeId);
  if (!page) return;
  const ids = snapshot.export.scope === 'selected' ? [...selected] : snapshot.pages.map(p => p.id);
  if (format === 'pdf' && !ids.length) throw new Error('尚未勾选页面，请选择“全部页面”或先勾选需要的图片');
  exporting = true; $('export-pdf').disabled = true; $('export-png').disabled = true;
  try {
    let bytes;
    if (format === 'pdf') bytes = await createPDF(snapshot, ids, (i, count) => { $('export-progress').textContent = `正在生成第 ${i} / ${count} 页…`; });
    else {
      $('export-progress').textContent = '正在生成高清图片…';
      const exportProcessor = new ImageProcessor();
      try { const bitmap = await exportProcessor.processForExport(page, snapshot.export); try { const canvas = await composeCanvas(page, snapshot.layouts[page.layoutId], bitmap, snapshot.export.background); bytes = await canvasBytes(canvas); canvas.width = 1; } finally { bitmap.close(); } } finally { exportProcessor.dispose(); }
    }
    const result = await api.saveExport(bytes, format, format === 'pdf' ? snapshot.name : page.name);
    $('export-progress').textContent = result.canceled ? '已取消保存，你的作品没有变化。' : `已导出：${result.name}`;
    if (!result.canceled) toast(`${format.toUpperCase()} 已导出，可以分享了`);
  } catch (error) { $('export-progress').textContent = `导出未完成：${error.message}`; throw error; }
  finally { exporting = false; $('export-pdf').disabled = false; $('export-png').disabled = false; }
}

for (const [key, label] of Object.entries(adjustmentLabels)) {
  const field = document.createElement('label'); field.className = 'slider-field';
  const row = document.createElement('span'); row.className = 'slider-label'; const text = document.createElement('span'); text.textContent = label;
  const value = document.createElement('output'); value.id = `value-${key}`; value.textContent = '0'; row.append(text, value);
  const input = document.createElement('input'); input.type = 'range'; input.id = `adjust-${key}`; input.min = key === 'sharpness' ? '0' : '-100'; input.max = '100'; input.value = '0'; input.setAttribute('aria-label', label);
  input.addEventListener('input', () => { const p = activePage(); if (!p) return; p.adjustments[key] = Number(input.value); value.textContent = input.value; scheduleImage(); });
  input.addEventListener('change', () => commit({ image: true })); field.append(row, input); $('adjustment-controls').append(field);
}
initAnnotationControls({ getElement: activeElement, onPatch: updateElement, onAdd: addAnnotation, onPalette: () => setSidebar('annotations') });
bind('view-collection', () => setWorkspaceView('collection')); bind('view-edit', () => setWorkspaceView('edit'));
for (const id of ['collection-import', 'collection-empty-import']) bind(id, () => $('image-input').click());
bind('collection-export', () => { project.export.scope = 'all'; return openExport(); });
bind('collection-undo', () => undo()); bind('collection-redo', () => undo(true));
document.querySelectorAll('[data-collection-mode]').forEach(b => b.addEventListener('click', () => { collectionMode = b.dataset.collectionMode; document.querySelectorAll('[data-collection-mode]').forEach(x => x.classList.toggle('active', x === b)); renderCollection(); }));
document.querySelectorAll('[data-output-width]').forEach(b => b.addEventListener('click', () => { project.export.sizing = 'width'; patchOutput('width', Number(b.dataset.outputWidth)); }));
for (const key of ['sizing', 'coverAlign', 'width', 'coverHeight', 'coverFontSize', 'separatorHeight', 'cover', 'separator']) bind(`collection-${key}`, event => {
  const node = event.target, value = node.type === 'checkbox' ? node.checked : node.type === 'number' ? node.valueAsNumber : node.value;
  if (node.type === 'number' && !Number.isFinite(value)) { node.value = project.export[key]; return; }
  patchOutput(key, value); if (node.type === 'number') node.value = project.export[key];
}, 'change');
bind('collection-title', event => patchOutput('title', event.target.value, false), 'input');
for (const key of ['coverColor', 'coverBackground', 'separatorColor', 'background']) {
  bind(`collection-${key}`, event => patchOutput(key, event.target.value, false), 'input');
  bind(`collection-${key}`, event => patchOutput(key, event.target.value), 'change');
}
document.querySelectorAll('[data-sidebar]').forEach(b => b.addEventListener('click', () => setSidebar(b.dataset.sidebar)));
document.querySelectorAll('[data-inspector]').forEach(b => b.addEventListener('click', () => setInspector(b.dataset.inspector)));
document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addElement(b.dataset.add)));
document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { if (!activePage()) return; activeLayout().elements.push(...presetElements(b.dataset.preset)); commit(); setInspector('layout'); toast('排版已添加，可以直接修改文字和位置'); }));
document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
  const p = activePage(); if (!p) return;
  p.adjustments = { ...adjustments(), ...({ natural: {}, warm: { temperature: 24, contrast: 8, saturation: -8, brightness: 5 }, clear: { contrast: 15, exposure: 8, saturation: 12, sharpness: 20 }, mono: { saturation: -100, contrast: 18, brightness: 4 } }[b.dataset.filter]) }; commit({ image: true });
}));
bind('import-images', () => $('image-input').click()); bind('empty-import', () => $('image-input').click()); bind('add-overlay', () => $('overlay-input').click());
bind('image-input', event => importFiles([...event.target.files]), 'change'); bind('overlay-input', event => importFiles([...event.target.files], true), 'change');
bind('select-all', event => { selected = new Set(event.target.checked ? project.pages.map(p => p.id) : []); renderSide(); renderInspector(); renderControls(); renderCollection(); }, 'change');
bind('link-pages', () => { if (!activePage()) return; finishPending(); linkPages(project, activeId, [...selected]); commit(); toast(`已共享排版，${linkedPages(project, activePage().layoutId).length} 页会同步更新；可撤销`); });
bind('detach-page', () => { if (!activePage()) return; detachPages(project, [activeId]); commit(); toast('当前页已独立，后续修改只影响这一页'); });
bind('page-up', () => { movePage(project, activeId, -1); commit({ full: true }); }); bind('page-down', () => { movePage(project, activeId, 1); commit({ full: true }); });
bind('duplicate-page', () => { const p = activePage(); if (!p) return; if (project.pages.length >= 300) throw new Error('一个作品最多支持 300 页'); const copy = { ...clone(p), id: uid(), name: `${p.name} · 副本` }; project.pages.splice(project.pages.indexOf(p) + 1, 0, copy); detachPages(project, [copy.id]); activeId = copy.id; selected = new Set([copy.id]); commit({ full: true }); });
bind('delete-pages', () => { if (!selected.size) return; const count = selected.size; removePages(project, [...selected]); selected.clear(); if (!activePage()) activeId = project.pages[0]?.id || null; elementId = null; commit({ full: true }); toast(`已删除 ${count} 页，可用撤销恢复`); });
bind('element-text', event => updateElement({ text: event.target.value }, false), 'input');
bind('font-size', event => updateElement({ fontSize: Math.max(1, Math.min(1000, Number(event.target.value) || 1)) / 1000 }), 'change');
bind('text-align', event => updateElement({ align: event.target.value }), 'change'); bind('text-bold', () => updateElement({ bold: !activeElement()?.bold }));
for (const [id, key] of [['element-fill', 'fill'], ['element-stroke', 'stroke']]) bind(id, event => updateElement({ [key]: event.target.value }), 'input');
bind('element-opacity', e => updateElement({ opacity: Math.max(0, Math.min(100, Number(e.target.value))) / 100 }), 'change');
bind('element-rotation', e => updateElement({ rotation: Math.max(-360, Math.min(360, Number(e.target.value))) }), 'change');
bind('element-stroke-width', e => updateElement({ strokeWidth: Math.max(0, Math.min(100, Number(e.target.value))) / 1000 }), 'change');
bind('align-center', () => { const e = activeElement(); if (e) updateElement({ x: editor.centeredX(e.id) ?? (1 - e.w) / 2 }); });
bind('delete-element', deleteElement); bind('duplicate-element', duplicateElement);
bind('share-element', () => { if (!activeElement()) return; finishPending(); shareElement(project, activeId, elementId, [...selected]); commit(); toast('此元素已共享，其他独立排版保持原样；修改与删除会同步'); });
bind('detach-element', () => { if (!activeElement()) return; detachElement(project, activeId, elementId); commit(); toast('此元素现在仅影响当前页，其他共享元素继续同步'); });
for (const [id, offset] of [['layer-up', 1], ['layer-down', -1]]) bind(id, () => { const list = activeLayout()?.elements; if (!list) return; const i = list.findIndex(e => e.id === elementId); if (i < 0) return; const target = Math.max(0, Math.min(list.length - 1, i + offset)); list.splice(target, 0, list.splice(i, 1)[0]); commit(); });
bind('layer-lock', () => { const e = activeElement(); if (!e) return; patchElement(project, activePage().layoutId, e.id, { locked: !e.locked }); commit(); });
bind('reset-adjustments', () => { if (activePage()) { activePage().adjustments = adjustments(); commit({ image: true }); } });
bind('copy-adjustments', () => { const p = activePage(); if (!p) return; for (const other of project.pages) if (selected.has(other.id)) other.adjustments = clone(p.adjustments); commit({ image: true }); toast(`已将当前调色复制到 ${selected.size} 页；排版共享不影响各页调色`); });
bind('rotate-image', () => { const p = activePage(); if (!p) return; p.rotation = (p.rotation + 90) % 360; setCrop(p, 0); commit({ full: true }); });
bind('crop-ratio', e => { if (activePage()) { setCrop(activePage(), Number(e.target.value)); commit({ full: true }); } }, 'change');
for (const [id, axis, dimension] of [['crop-x', 'x', 'w'], ['crop-y', 'y', 'h']]) {
  bind(id, e => { const p = activePage(); if (!p) return; p.crop[axis] = Number(e.target.value) / 100 * (1 - p.crop[dimension]); scheduleImage(); }, 'input');
  bind(id, () => commit({ image: true }), 'change');
}
bind('undo', () => undo()); bind('redo', () => undo(true));
bind('zoom-in', () => editor.setZoom(1.2)); bind('zoom-out', () => editor.setZoom(1 / 1.2)); bind('zoom-fit', () => editor.setZoom(null));
const endComparison = () => { if (comparison) { comparison = false; scheduleImage(true); } };
bind('compare', event => { if (!activePage()) return; comparison = true; event.target.setPointerCapture?.(event.pointerId); scheduleImage(true); }, 'pointerdown');
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) bind('compare', endComparison, event);
bind('compare', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); comparison = true; scheduleImage(true); } }, 'keydown'); bind('compare', endComparison, 'keyup');
bind('project-name', event => { project.name = event.target.value.slice(0, 100); clearTimeout(propertyTimer); propertyTimer = setTimeout(() => commit(), 450); }, 'input');
bind('save-project', () => saveProject());
bind('open-project', async () => { if (importing || !confirmDiscard()) return; const result = await api.openProject(); if (!result) return; const next = validateProject(JSON.parse(result.json)); await replaceProject(next); setWorkspaceView(project.pages.length ? 'collection' : 'edit'); dirty = false; api.setDirty(false); status(`已打开：${result.name}`); });
bind('new-project', async () => { if (!importing && confirmDiscard()) { await replaceProject(createProject()); setWorkspaceView('edit'); } });
bind('demo-load', async () => { if (importing) return; importing = true; $('demo-load').disabled = true; try { const next = createProject(); next.name = '光与空间 · 设计作品集'; const images = await demoImages(); const pages = images.map(image => addPage(next, image)); next.layouts[pages[0].layoutId].elements = presetElements('editorial'); linkPages(next, pages[0].id, pages.map(p => p.id)); await replaceProject(next); setWorkspaceView('edit'); selected = new Set(pages.map(p => p.id)); renderSide(); renderInspector(); toast('试着改一处标题，看看 3 张图片一起更新'); } finally { importing = false; $('demo-load').disabled = false; } });
bind('annotation-demo', async () => {
  if (importing || (project.pages.length && !confirmDiscard())) return;
  importing = true; $('annotation-demo').disabled = true;
  try {
    const next = createProject(); next.name = '弧光 · 产品标注';
    const pages = (await annotationDemoImages()).map(image => addPage(next, image));
    const text = (content, x, y, fontSize, props = {}) => ({ ...newElement('text'), text: content, x, y, fontSize, fill: '#344d3b', ...props });
    const label = (content, x, y, params, props = {}) => ({ ...newElement('annotation'), text: content, x, y, fontSize: 0.019, annotation: { ...annotationDefaults(), labelBackground: false, labelWidth: 0.17, ...params }, ...props });
    next.layouts[pages[0].layoutId].elements = [
      text('FORM  /  01', 0.06, 0.065, 0.012, { fill: '#7e8975' }),
      text('弧光，一盏灯的细节', 0.06, 0.105, 0.033, { bold: true }),
      text('柔和的轮廓，让日常多一点温度。', 0.062, 0.18, 0.014, { fill: '#8a927e' }),
      label('一体弧面灯罩', 0.411, 0.327, { direction: 'up-left', angle: 30, length: 0.09, tailLength: 0.12 }),
      label('纤细支撑，轻盈有序', 0.504, 0.6, { angle: 35, length: 0.115, tailLength: 0.2, labelWidth: 0.22, startCap: 'ring' }),
      label('稳固底座', 0.43, 0.75, { direction: 'down-left', angle: 30, length: 0.07, tailLength: 0.11, labelPosition: 'below', startCap: 'number', capSize: 0.014, badgeText: '01' }),
      label('底座 Ø 240 mm', 0.38, 0.87, { ...annotationDefaults('dimension'), length: 0.24, labelWidth: 0.17, labelColor: '#eae5da', capSize: 0.007 }, { fontSize: 0.014, strokeWidth: 0.0015 }),
      text('TARE STUDIO  /  产品示意 · 尺寸为演示文字', 0.06, 0.945, 0.011, { fill: '#929782' })
    ];
    linkPages(next, pages[0].id, pages.map(p => p.id)); await replaceProject(next);
    setWorkspaceView('edit');
    selected = new Set(pages.map(p => p.id)); elementId = activeLayout().elements[4].id; editor.selectedId = elementId;
    setSidebar('annotations'); setInspector('layout'); commit(); $('element-properties').scrollIntoView({ block: 'start' });
    toast('三款配色共用标注，试着调整角度或修改说明文字');
  } finally { importing = false; $('annotation-demo').disabled = false; }
});
bind('help-open', () => $('help-dialog').showModal()); bind('export-open', openExport); bind('export-pdf', () => exportFile('pdf')); bind('export-png', () => exportFile('png'));
for (const [id, key, type] of [['export-scope', 'scope', 'string'], ['export-sizing', 'sizing', 'string'], ['export-width', 'width', 'number'], ['export-background', 'background', 'string'], ['export-cover', 'cover', 'boolean'], ['export-separator', 'separator', 'boolean'], ['export-title', 'title', 'string']]) bind(id, async event => {
  patchOutput(key, type === 'boolean' ? event.target.checked : type === 'number' ? Number(event.target.value) : event.target.value, id !== 'export-title');
  $('export-title').disabled = !project.export.cover;
  if (key === 'background') { editor.background.fill(project.export.background); editor.layer.batchDraw(); }
}, id === 'export-title' ? 'input' : 'change');
document.addEventListener('keydown', safe(event => {
  const modifier = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
  if (modifier && key === 's') { event.preventDefault(); return saveProject(event.shiftKey); }
  if (isEditable(event.target) || document.querySelector('dialog[open]')) return;
  if (modifier && key === 'z') { event.preventDefault(); undo(event.shiftKey); }
  else if (modifier && key === 'y') { event.preventDefault(); undo(true); }
  else if (modifier && key === 'd') { event.preventDefault(); duplicateElement(); }
  else if (event.key === 'Delete' || event.key === 'Backspace') { if (activeElement()) { event.preventDefault(); deleteElement(); } }
  else if (event.key === 'Escape') { elementId = null; editor.select(null, false); renderInspector(); }
  else if (event.key.startsWith('Arrow')) { const e = activeElement(), p = activePage(); if (!e || !p || e.locked) return; event.preventDefault(); const distance = (event.shiftKey ? 10 : 1) / 1000; const patch = {}; if (event.key === 'ArrowLeft') patch.x = e.x - distance; if (event.key === 'ArrowRight') patch.x = e.x + distance; if (event.key === 'ArrowUp') patch.y = e.y - distance * pageSize(p).width / pageSize(p).height; if (event.key === 'ArrowDown') patch.y = e.y + distance * pageSize(p).width / pageSize(p).height; updateElement(patch); }
}));
document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); $('canvas-area').classList.add('drop-active'); $('collection-view').classList.add('drop-active'); } });
$('canvas-host').addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('application/x-tare-annotation') || !activePage()) return;
  event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; $('canvas-area').classList.add('drop-annotation');
});
$('canvas-host').addEventListener('dragleave', event => { if (!$('canvas-host').contains(event.relatedTarget)) $('canvas-area').classList.remove('drop-annotation'); });
$('canvas-host').addEventListener('drop', safe(event => {
  const preset = event.dataTransfer.getData('application/x-tare-annotation'); if (!preset) return;
  event.preventDefault(); event.stopPropagation(); $('canvas-area').classList.remove('drop-annotation');
  if (document.querySelector('dialog[open]')) return;
  const position = editor.dropPosition(event.clientX, event.clientY);
  if (position) addAnnotation(preset, position); else toast('请把标注拖到图片内，落点就是指示端的位置');
}));
document.addEventListener('dragleave', event => { if (!event.relatedTarget) { $('canvas-area').classList.remove('drop-active'); $('collection-view').classList.remove('drop-active'); } });
document.addEventListener('drop', safe(async event => { event.preventDefault(); $('canvas-area').classList.remove('drop-active'); $('collection-view').classList.remove('drop-active'); if (document.querySelector('dialog[open]')) return; await importFiles([...event.dataTransfer.files]); }));
document.addEventListener('paste', safe(async event => { if (isEditable(event.target) || document.querySelector('dialog[open]')) return; const files = [...(event.clipboardData?.files || [])]; if (files.length) { event.preventDefault(); await importFiles(files, workspaceView === 'edit' && !!activePage()); } }));

async function init() {
  await document.fonts.load('400 16px "Noto Sans SC"'); await document.fonts.load('700 16px "Noto Sans SC"');
  try { const draft = await api.loadDraft(); if (draft) { project = validateProject(JSON.parse(draft)); history.reset(project); activeId = project.pages[0]?.id || null; selected = new Set(activeId ? [activeId] : []); dirty = true; api.setDirty(true); status('已恢复上次工作 · 请保存作品'); } }
  catch (error) { toast(`自动恢复文件不可用：${error.message}`, true); }
  if (project.pages.length) setWorkspaceView('collection'); else refresh(); document.body.dataset.ready = 'true';
}
init().catch(error => { console.error(error); toast(`启动失败：${error.message}`, true); });
