import { clone, pageSize } from './model.mjs';
import { ImageProcessor } from './images.mjs';
import { composeCanvas } from './canvas.mjs';
import { titleStripCanvas } from './title-strip.mjs';
import { compositionParts, designWidth } from './output-settings.mjs';

const make = (tag, className, text) => { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
export class CollectionView {
  constructor(host, callbacks = {}, interactive = true) {
    this.host = host; this.callbacks = callbacks; this.interactive = interactive;
    this.processor = new ImageProcessor(); this.cache = new Map(); this.generation = 0; this.queue = []; this.queued = new Set();
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { this.observer.unobserve(entry.target); this.enqueue(entry.target); }
    }, { root: host, rootMargin: '500px' });
    host.addEventListener('dragover', event => {
      if (!this.callbacks.getDragging?.().length) return;
      event.preventDefault(); const box = host.getBoundingClientRect();
      this.scrollDelta = event.clientY < box.top + 65 ? -16 : event.clientY > box.bottom - 65 ? 16 : 0;
      if (this.scrollDelta && !this.scrollFrame) this.autoScroll();
    });
    host.addEventListener('dragleave', event => { if (!host.contains(event.relatedTarget)) this.stopScroll(); });
    for (const event of ['drop', 'dragend']) host.addEventListener(event, () => this.stopScroll());
  }
  autoScroll() { if (!this.scrollDelta) { this.scrollFrame = null; return; } this.host.scrollTop += this.scrollDelta; this.scrollFrame = requestAnimationFrame(() => this.autoScroll()); }
  stopScroll() { this.scrollDelta = 0; cancelAnimationFrame(this.scrollFrame); this.scrollFrame = null; }
  clear() { this.generation++; this.signature = null; this.queue = []; this.queued.clear(); this.cache.clear(); this.observer.disconnect(); this.host.replaceChildren(); }
  render(project, { activeId = null, selected = new Set(), mode = 'flow', ids = null } = {}) {
    const pages = ids ? project.pages.filter(p => ids.includes(p.id)) : project.pages;
    const keys = new Map(pages.map(page => [page.id, JSON.stringify([page.id, page.width, page.height, page.rotation, page.crop, page.adjustments, project.layouts[page.layoutId], project.export.background])]));
    const signature = JSON.stringify([mode, project.export, pages.map(page => [page.id, page.name, keys.get(page.id)])]);
    this.selected = selected;
    if (signature === this.signature) {
      for (const [id, { card }] of this.nodes) { card.classList.toggle('active', id === activeId); card.classList.toggle('selected', selected.has(id)); const checkbox = card.querySelector('input'); if (checkbox) checkbox.checked = selected.has(id); }
      return; // Preserve DOM identity between clicks, keyboard focus and drag gestures.
    }
    this.signature = signature;
    const scroll = this.host.scrollTop; this.generation++; this.queue = []; this.queued.clear(); this.observer.disconnect();
    this.project = project; this.nodes = new Map(); this.host.replaceChildren();
    const root = make('div', `collection-sheet collection-${mode}${this.interactive ? '' : ' collection-readonly'}`);
    root.style.setProperty('--sheet-background', project.export.background); this.host.append(root);
    for (const part of compositionParts(pages, project.export)) {
      if (part.type === 'title') {
        const title = make('div', 'collection-title-strip'); title.dataset.part = 'title';
        const canvas = titleStripCanvas(project.export, Math.min(720, designWidth(project.export))); canvas.setAttribute('aria-label', `开头标题条：${project.export.title}`); title.append(canvas);
        root.append(title); continue;
      }
      if (part.type === 'separator') {
        const separator = make('div', 'collection-separator'); separator.dataset.part = 'separator';
        separator.style.aspectRatio = `${designWidth(project.export)} / ${part.height}`; separator.style.background = project.export.separatorColor;
        separator.setAttribute('aria-label', `分隔横条，高 ${part.height} px`); root.append(separator); continue;
      }
      const { page, index } = part, size = pageSize(page);
      const card = make('article', `collection-card${activeId === page.id ? ' active' : ''}${selected.has(page.id) ? ' selected' : ''}`);
      card.dataset.pageId = page.id; card.dataset.part = 'image';
      const picture = make('img', 'collection-picture'); picture.alt = page.name; picture.draggable = false; picture.dataset.pageId = page.id;
      picture.style.aspectRatio = `${size.width} / ${size.height}`; picture.src = '../assets/placeholder.svg';
      card.append(picture);
      const caption = make('div', 'collection-caption'); caption.append(make('span', 'collection-number', String(index + 1).padStart(2, '0')), make('span', 'collection-name', page.name), make('span', 'collection-size', `${size.width} × ${size.height}`)); card.append(caption);
      if (this.interactive) {
        card.tabIndex = 0; card.setAttribute('aria-label', `排列图片 ${index + 1}：${page.name}`); card.draggable = true;
        const tools = make('div', 'collection-card-tools'), label = make('label', 'collection-check');
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(page.id); checkbox.setAttribute('aria-label', `勾选图片 ${index + 1}`);
        label.append(checkbox); label.addEventListener('click', event => event.stopPropagation());
        checkbox.addEventListener('click', event => this.callbacks.onCheck?.(page.id, checkbox.checked, event.shiftKey));
        tools.append(label);
        const edit = make('button', 'collection-edit', '编辑此图 ↗'); edit.type = 'button'; edit.addEventListener('click', event => { event.stopPropagation(); this.callbacks.onOpen?.(page.id); }); tools.append(edit); card.append(tools);
        card.addEventListener('click', () => this.callbacks.onSelect?.(page.id));
        card.addEventListener('dblclick', () => this.callbacks.onOpen?.(page.id));
        card.addEventListener('keydown', event => { if (event.target !== card) return; if (event.key === 'Enter') this.callbacks.onOpen?.(page.id); if (event.key === ' ') { event.preventDefault(); this.callbacks.onCheck?.(page.id, !this.selected.has(page.id), event.shiftKey); } });
        card.addEventListener('dragstart', event => {
          const ids = this.selected.has(page.id) ? [...this.selected] : [page.id]; this.callbacks.onStart?.(ids);
          event.dataTransfer.setData('application/x-tare-pages', 'reorder'); event.dataTransfer.effectAllowed = 'move';
          for (const id of ids) this.nodes.get(id)?.card.classList.add('dragging');
        });
        card.addEventListener('dragover', event => {
          if (!this.callbacks.getDragging?.().length) return;
          event.preventDefault();
          const box = card.getBoundingClientRect(); const after = mode === 'grid' ? event.clientX > box.left + box.width / 2 : event.clientY > box.top + box.height / 2;
          this.host.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after'));
          card.classList.add(after ? 'drop-after' : 'drop-before');
        });
        card.addEventListener('drop', event => {
          const ids = this.callbacks.getDragging?.(); if (!ids?.length) return;
          event.preventDefault(); event.stopPropagation(); this.stopScroll(); this.callbacks.onMove?.(ids, page.id, card.classList.contains('drop-after'));
        });
        card.addEventListener('dragend', () => { this.callbacks.onEnd?.(); this.stopScroll(); this.host.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(n => n.classList.remove('dragging', 'drop-before', 'drop-after')); });
      }
      root.append(card);
      const key = keys.get(page.id);
      this.nodes.set(page.id, { card, picture, key, page });
      if (this.cache.has(key)) { picture.src = this.cache.get(key); picture.dataset.ready = 'true'; }
      else this.observer.observe(picture);
    }
    this.host.scrollTop = scroll;
  }
  enqueue(picture) {
    const record = this.nodes.get(picture.dataset.pageId); if (!record || this.queued.has(record.key)) return;
    this.queued.add(record.key); this.queue.push({ ...record, page: clone(record.page), layout: clone(this.project.layouts[record.page.layoutId]), background: this.project.export.background, generation: this.generation });
    this.drain();
  }
  async drain() {
    if (this.running) return; this.running = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift(); if (item.generation !== this.generation) continue;
        let bitmap;
        try {
          bitmap = await this.processor.process(item.page, 1000);
          if (item.generation !== this.generation) continue;
          const canvas = await composeCanvas(item.page, item.layout, bitmap, item.background);
          const src = canvas.toDataURL('image/jpeg', 0.9); canvas.width = 1; canvas.height = 1;
          this.cache.set(item.key, src); if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
          const current = this.nodes.get(item.page.id);
          if (current?.key === item.key) { current.picture.src = src; current.picture.dataset.ready = 'true'; }
        } catch (error) { if (item.generation === this.generation) this.callbacks.onError?.(error); }
        finally { bitmap?.close(); this.queued.delete(item.key); }
      }
    } finally { this.running = false; }
  }
}
