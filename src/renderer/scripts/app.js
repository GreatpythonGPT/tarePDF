(function () {
  'use strict';
  const M = window.TareModel, D = window.TareDocument, $ = id => document.getElementById(id);
  const state = { ready: false, view: 'images', items: [], selection: new Set(), anchor: null,
    resources: new Map(), history: [], future: [], workspace: M.normalizeWorkspace({}),
    busy: false, settingsBusy: false, revision: 0, sequence: 0, preview: null, readOnly: false };
  let api, operation, saveTimer, saveQueue = Promise.resolve(), saveRevision = 0, lastStatus = '', watermarkTarget = null;
  const fields = new Map();
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function notice(message, kind = '') {
    $('notice-text').textContent = String(message);
    $('notice').className = `notice ${kind}`; $('notice').hidden = false;
  }
  function report(error) { notice(error?.message || String(error), 'error'); }
  function run(callback) { Promise.resolve().then(callback).catch(report); }
  function snapshotItems() { return state.items.map(item => ({ id: item.id, watermarks: { ...item.watermarks } })); }
  function historyState() { return { items: snapshotItems(), selected: [...state.selection] }; }
  function checkpoint() {
    state.history.push(historyState()); if (state.history.length > 20) state.history.shift(); state.future = [];
  }
  function collectResources() {
    const keep = new Set([...state.items, ...state.history.flatMap(item => item.items), ...state.future.flatMap(item => item.items)].map(item => item.id));
    for (const [id, resource] of state.resources) if (!keep.has(id)) { URL.revokeObjectURL(resource.thumbnail); state.resources.delete(id); }
  }
  function changed() { state.revision++; collectResources(); renderGrid(); syncSelection(); }
  function undo(redo = false) {
    if (state.busy) return;
    const from = redo ? state.future : state.history, to = redo ? state.history : state.future;
    if (!from.length) return;
    to.push(historyState()); const previous = from.pop();
    state.items = previous.items; state.selection = new Set(previous.selected); state.anchor = null;
    changed(); $('grid-scroll').focus();
  }
  function updateSummary() {
    const count = state.items.length, selected = state.selection.size, scope = $('export-scope').value;
    $('selection-summary').textContent = `${count} 张图片 · 已选 ${selected} 张`;
    let summary = `共 ${count} 张 · 已选 ${selected} 张`;
    try {
      const images = imageSnapshot();
      const pages = M.pagePlan(images, state.workspace.settings);
      summary += `　|　将导出 ${images.length} 张图片 / ${pages.length} 页 · ${state.workspace.settings.outputWidth} px 宽`;
    } catch { summary += scope === 'selected' && !selected ? '　|　仅选中模式：尚未选择图片' : '　|　等待导入或修正设置'; }
    $('document-summary').textContent = summary;
    const canExport = state.ready && !state.busy && (scope === 'selected' ? selected > 0 : count > 0);
    $('preview-button').disabled = $('export-button').disabled = !canExport;
    for (const id of ['delete-selected', 'clear-selection', 'mark-on', 'mark-off']) $(id).disabled = state.busy || !selected;
    $('select-all').disabled = state.busy || !count;
    $('undo-button').disabled = state.busy || !state.history.length;
    $('redo-button').disabled = state.busy || !state.future.length;
    $('sort-order').disabled = state.busy || count < 2;
    $('import-button').disabled = state.busy;
    $('export-scope').disabled = state.busy;
    const status = JSON.stringify({ hasImages: count > 0, busy: state.busy });
    if (api && state.ready && status !== lastStatus) {
      lastStatus = status; api.setStatus(JSON.parse(status)).catch(report);
    }
  }
  function syncSelection() {
    for (const card of $('image-grid').children) {
      const selected = state.selection.has(card.dataset.id);
      card.classList.toggle('selected', selected);
      card.querySelector('input[type=checkbox]').checked = selected;
    }
    updateSummary();
  }
  function imageSnapshot() {
    return M.exportItems(state.items, state.selection, $('export-scope').value).map(item => ({ ...state.resources.get(item.id), watermarks: { ...item.watermarks } }));
  }
  function renderGrid() {
    const fragment = document.createDocumentFragment(), settings = state.workspace.settings;
    state.items.forEach((item, index) => {
      const source = state.resources.get(item.id), card = element('article', undefined, 'image-card');
      card.dataset.id = item.id; card.draggable = true; card.tabIndex = 0;
      card.setAttribute('aria-label', `第 ${index + 1} 张：${source.name}`);
      const top = element('div', undefined, 'card-top');
      top.append(element('span', String(index + 1).padStart(2, '0'), 'card-number'));
      const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.setAttribute('aria-label', `选择 ${source.name}`); checkbox.dataset.action = 'select';
      top.append(checkbox);
      const image = element('img', undefined, 'thumbnail'); image.src = source.thumbnail; image.alt = source.name; image.loading = 'lazy'; image.draggable = false;
      const name = element('p', source.name, 'image-name'); name.title = source.name;
      const marks = element('div', undefined, 'card-marks');
      for (const mark of M.MARKS) {
        const configured = Boolean(settings[mark.key].dataUrl || settings[mark.key].text);
        const button = element('button', mark.label, `mark-button${configured ? ' configured' : ''}`);
        button.dataset.action = 'mark'; button.dataset.flag = mark.flag;
        button.setAttribute('aria-pressed', String(item.watermarks[mark.flag]));
        button.setAttribute('aria-label', `${source.name}：${mark.kind === 'image' ? '图片' : '文字'}水印 ${mark.label}`);
        button.title = `${mark.label} · ${configured ? (item.watermarks[mark.flag] ? '已启用' : '已停用') : '尚未配置内容'}`;
        marks.append(button);
      }
      card.append(top, image, name, element('p', `${source.width} × ${source.height} px · ${(source.size / 1024 ** 2).toFixed(1)} MB`, 'image-dimensions'), marks);
      fragment.append(card);
    });
    $('image-grid').replaceChildren(fragment);
    $('empty-state').hidden = state.items.length > 0;
  }
  function chooseCard(id, event, toggle = false) {
    if (event.shiftKey) state.selection = M.selectRange(state.items, state.anchor, id, event.ctrlKey || event.metaKey ? state.selection : []);
    else if (toggle || event.ctrlKey || event.metaKey) {
      if (state.selection.has(id)) state.selection.delete(id); else state.selection.add(id);
      state.anchor = id;
    } else { state.selection = new Set([id]); state.anchor = id; }
    state.revision++; syncSelection();
  }
  function beginOperation(title) {
    if (state.busy) throw new Error('请先完成当前操作');
    $('notice').hidden = true; stopPreview(); state.busy = true; operation = new AbortController();
    document.body.classList.add('busy'); $('progress-title').textContent = title;
    $('progress-text').textContent = '正在准备…'; $('progress-value').value = 0;
    $('cancel-progress').disabled = false; $('progress-dialog').showModal(); updateSummary();
    return operation.signal;
  }
  function finishOperation() {
    state.busy = false; operation = null; document.body.classList.remove('busy'); $('progress-dialog').close(); updateSummary();
  }
  function progress(text, done, total) { $('progress-text').textContent = text; $('progress-value').value = total ? done / total * 100 : 0; }
  async function importFiles(fileList) {
    if (!state.ready || state.busy || !fileList.length) return;
    const files = [...fileList];
    if (state.items.length + files.length > M.LIMITS.images) throw new Error(`每份文稿最多 ${M.LIMITS.images} 张图片，请分批整理`);
    const signal = beginOperation('导入图片'), staged = [], errors = [];
    const hashes = new Set(state.items.map(item => state.resources.get(item.id).hash));
    let duplicates = 0;
    try {
      for (let index = 0; index < files.length; index++) {
        D.check(signal); const file = files[index];
        progress(`正在读取 ${index + 1}/${files.length}：${file.name}`, index, files.length);
        let bitmap;
        try {
          if (file.size > M.LIMITS.inputBytes) throw new Error('超过 64 MB');
          const bytes = new Uint8Array(await file.arrayBuffer());
          const metadata = M.inspectImage(bytes);
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
          if (hashes.has(hash)) { duplicates++; continue; }
          const blob = new Blob([file], { type: metadata.type });
          bitmap = await D.decode(blob, file.name); D.check(signal);
          if (bitmap.width * bitmap.height > M.LIMITS.inputPixels) throw new Error('像素尺寸过大');
          const thumb = document.createElement('canvas'), ratio = Math.min(256 / bitmap.width, 192 / bitmap.height, 1);
          thumb.width = Math.max(1, Math.round(bitmap.width * ratio)); thumb.height = Math.max(1, Math.round(bitmap.height * ratio));
          const ctx = thumb.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, thumb.width, thumb.height);
          ctx.drawImage(bitmap, 0, 0, thumb.width, thumb.height);
          const thumbnailBlob = await new Promise((resolve, reject) => thumb.toBlob(value => value ? resolve(value) : reject(new Error('缩略图生成失败')), 'image/jpeg', 0.85));
          thumb.width = thumb.height = 1;
          D.check(signal);
          const id = crypto.randomUUID();
          staged.push({ id, file: blob, name: file.name, size: file.size, width: bitmap.width, height: bitmap.height,
            hash, thumbnail: URL.createObjectURL(thumbnailBlob), importOrder: ++state.sequence });
          hashes.add(hash);
        } catch (error) {
          if (error.name === 'AbortError') throw error;
          errors.push(`${file.name}：${error.message}`);
        } finally { bitmap?.close(); }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      D.check(signal);
      if (staged.length) {
        checkpoint();
        for (const source of staged) { state.resources.set(source.id, source); state.items.push({ id: source.id, watermarks: M.marks() }); }
        state.selection = new Set(staged.map(source => source.id)); state.anchor = staged[0].id; changed();
      }
      notice(`已导入 ${staged.length} 张${duplicates ? `，跳过 ${duplicates} 张重复图片` : ''}${errors.length ? `；${errors.length} 张无法导入：\n${errors.join('\n')}` : ''}`, errors.length ? 'error' : 'success');
    } catch (error) {
      for (const source of staged) if (!state.resources.has(source.id)) URL.revokeObjectURL(source.thumbnail);
      if (error.name === 'AbortError') notice('已取消导入，图片列表保持不变。'); else throw error;
    } finally { finishOperation(); await setView('images'); }
  }
  function removeSelected() {
    if (!state.selection.size || state.busy) return;
    const count = state.selection.size; checkpoint();
    state.items = state.items.filter(item => !state.selection.has(item.id));
    state.selection.clear(); state.anchor = null; changed();
    notice(`已从文稿移除 ${count} 张图片。原文件未删除，可点击“撤销”恢复。`);
    $('grid-scroll').focus();
  }
  function setMarks(flag, enabled, ids = state.selection) {
    if (!M.MARKS.some(mark => mark.flag === flag) || !ids.size || state.busy) return;
    if (!state.items.some(item => ids.has(item.id) && item.watermarks[flag] !== enabled)) return;
    checkpoint();
    state.items = state.items.map(item => ids.has(item.id) ? { ...item, watermarks: { ...item.watermarks, [flag]: enabled } } : item);
    changed();
  }
  function scheduleSave() {
    clearTimeout(saveTimer); $('save-status').textContent = state.readOnly ? '配置只读，本次不保存' : '设置待保存…';
    if (!state.readOnly) saveTimer = setTimeout(() => persist().catch(report), 400);
  }
  function persist() {
    clearTimeout(saveTimer); saveTimer = null;
    if (state.readOnly) return Promise.reject(new Error('配置当前为只读，不能保存'));
    const snapshot = M.normalizeWorkspace(M.clone(state.workspace), true), revision = ++saveRevision;
    $('save-status').textContent = '正在保存设置…';
    const pending = saveQueue.catch(() => {}).then(() => api.saveWorkspace(snapshot));
    saveQueue = pending;
    return pending.then(result => {
      if (result.status !== 'saved') throw new Error('设置未成功保存');
      if (revision === saveRevision) $('save-status').textContent = '设置已保存 · 本地处理';
    }).catch(error => { $('save-status').textContent = '设置保存失败，请重试'; throw error; });
  }
  function getSetting(key) { return key.split('.').reduce((value, part) => value[part], state.workspace.settings); }
  function setSetting(key, value) {
    const parts = key.split('.'), target = parts.length === 1 ? state.workspace.settings : state.workspace.settings[parts[0]];
    target[parts.at(-1)] = value;
  }
  function field(parent, key, label, type = 'text', options = {}) {
    const row = element('div', undefined, `field${type === 'textarea' ? ' wide' : ''}`);
    const name = element('label', label), input = element(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
    input.id = `setting-${key.replaceAll('.', '-')}`; name.htmlFor = input.id;
    if (!['textarea', 'select'].includes(type)) input.type = type;
    if (type === 'select') for (const [value, text] of options.choices) { const option = element('option', text); option.value = String(value); input.append(option); }
    for (const property of ['min', 'max', 'step', 'maxLength', 'placeholder']) if (options[property] !== undefined) input[property] = options[property];
    if (type === 'number' || options.required) input.required = true;
    if (options.font) { input.setAttribute('list', 'font-list'); input.setAttribute('pattern', '[\\p{L}\\p{N} _\\-]+'); }
    input.dataset.setting = key;
    row.append(name);
    if (type === 'range') {
      const range = element('div', undefined, 'field-range'), output = element('output');
      output.htmlFor = input.id; range.append(input, output); row.append(range);
      fields.set(key, { input, type, output });
    } else { row.append(input); fields.set(key, { input, type }); }
    parent.append(row); return input;
  }
  function commonMarkFields(parent, key, text) {
    field(parent, `${key}.position`, '位置', 'select', { choices: [['top-left','左上'],['top-right','右上'],['bottom-left','左下'],['bottom-right','右下'],['center','居中']] });
    field(parent, `${key}.marginX`, '水平边距 / px', 'number', { min: 0, max: 500, step: 1 });
    field(parent, `${key}.marginY`, '垂直边距 / px', 'number', { min: 0, max: 500, step: 1 });
    field(parent, `${key}.opacity`, '不透明度', 'range', { min: 0, max: 1, step: 0.01 });
    if (text) field(parent, `${key}.shadowOpacity`, '阴影强度', 'range', { min: 0, max: 1, step: 0.01 });
  }
  function buildFields() {
    field($('page-fields'), 'outputWidth', '统一宽度 / px', 'number', { min: 100, max: 5000, step: 1 });
    field($('page-fields'), 'quality', '图片质量', 'select', { choices: [[0.95,'高质量 · 95%'],[0.85,'均衡 · 85%'],[0.65,'小文件 · 65%'],[1,'最高质量 · 100%']] });
    field($('title-fields'), 'title.text', '标题内容', 'textarea', { maxLength: 2000, placeholder: '项目名称\n副标题或日期' });
    for (const [key, label] of [['title', '标题'], ['watermarkTextA', 'C'], ['watermarkTextB', 'D']]) {
      let parent = $('title-fields');
      if (key !== 'title') {
        parent = element('details', undefined, 'watermark-group'); parent.open = key === 'watermarkTextA';
        parent.append(element('summary', `文字水印 ${label}`)); $('text-mark-fields').append(parent);
        field(parent, `${key}.text`, '文字内容', 'textarea', { maxLength: 500 });
      }
      field(parent, `${key}.fontFamily`, '本机字体', 'text', { maxLength: 80, font: true, required: true });
      field(parent, `${key}.fontSize`, '字号 / px', 'number', { min: 8, max: 200, step: 1 });
      field(parent, `${key}.color`, '文字颜色', 'color');
      if (key === 'title') field(parent, `${key}.backgroundColor`, '背景颜色', 'color');
      else {
        field(parent, `${key}.backgroundColor`, '文字底色', 'select', { choices: [['transparent','透明'],['#ffffff','白色'],['#000000','黑色']] });
        commonMarkFields(parent, key, true);
      }
    }
    field($('separator-fields'), 'separator.enabled', '启用分隔页', 'checkbox');
    field($('separator-fields'), 'separator.height', '分隔高度 / px', 'number', { min: 1, max: 2000, step: 1 });
    for (const mark of M.MARKS.filter(item => item.kind === 'image')) {
      const parent = element('details', undefined, 'watermark-group'); parent.open = mark.label === 'A';
      parent.append(element('summary', `图片水印 ${mark.label}`)); $('image-mark-fields').append(parent);
      const row = element('div', undefined, 'asset-row');
      const choose = element('button', '选择 PNG'), clear = element('button', '清除'), name = element('span', '未选择', 'asset-name');
      choose.type = clear.type = 'button'; choose.dataset.chooseAsset = mark.key; clear.dataset.clearAsset = mark.key;
      name.id = `asset-${mark.key}`; row.append(choose, clear, name); parent.append(row);
      field(parent, `${mark.key}.scale`, '缩放比例', 'select', { choices: [[0.25,'25%'],[0.5,'50%'],[0.75,'75%'],[1,'100%']] });
      commonMarkFields(parent, mark.key, false);
    }
  }
  function renderSettings() {
    for (const [key, record] of fields) {
      const value = getSetting(key), { input, type, output } = record;
      if (type === 'checkbox') input.checked = value;
      else {
        if (type === 'select' && ![...input.options].some(option => option.value === String(value))) {
          const option = element('option', String(value)); option.value = String(value); input.append(option);
        }
        input.value = value;
      }
      if (output) output.value = `${Math.round(value * 100)}%`;
    }
    for (const mark of M.MARKS.filter(item => item.kind === 'image')) {
      const value = state.workspace.settings[mark.key], label = $(`asset-${mark.key}`);
      label.textContent = value.missingAsset ? `需要重新选择：${value.name}` : value.name || '未选择 PNG';
      label.classList.toggle('missing', value.missingAsset);
    }
    for (const button of document.querySelectorAll('[data-width]')) button.classList.toggle('active', Number(button.dataset.width) === state.workspace.settings.outputWidth);
    renderPresets();
  }
  function validateForm() {
    if (!$('settings-form').checkValidity()) {
      setView('settings');
      for (const node of $('settings-form').querySelectorAll(':invalid')) node.closest('details')?.setAttribute('open', '');
      $('settings-form').reportValidity();
      throw new Error('请修正设置中标红的输入项后再继续');
    }
    return M.normalizeSettings(state.workspace.settings, true);
  }
  function renderPresets() {
    const rows = state.workspace.presets.map(preset => {
      const row = element('div', undefined, 'preset-row'); row.dataset.id = preset.id;
      const load = element('button', '加载'), remove = element('button', '删除');
      load.type = remove.type = 'button'; load.dataset.action = 'load'; remove.dataset.action = 'delete';
      row.append(element('span', preset.name), load, remove); return row;
    });
    $('preset-list').replaceChildren(...(rows.length ? rows : [element('p', '尚无命名配置', 'hint')]));
    $('save-preset').disabled = state.readOnly;
  }
  function confirmAction(message) {
    $('confirm-message').textContent = message;
    const dialog = $('confirm-dialog'); dialog.returnValue = 'cancel'; dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true }));
  }
  async function settingsTransaction(callback) {
    if (state.settingsBusy) return;
    state.settingsBusy = true; $('settings-form').inert = true;
    try { await callback(); }
    finally { state.settingsBusy = false; $('settings-form').inert = false; }
  }
  async function savePreset() {
    validateForm();
    const name = $('preset-name').value.trim();
    if (!name || name.length > 50) throw new Error('请输入 1–50 个字符的配置名称');
    const old = state.workspace.presets.find(preset => preset.name === name);
    if (old && !await confirmAction(`覆盖配置「${name}」？`)) return;
    if (!old && state.workspace.presets.length >= 50) throw new Error('最多保存 50 个配置，请先删除不需要的配置');
    const previous = M.clone(state.workspace.presets);
    const preset = { id: old?.id || crypto.randomUUID(), name, settings: M.clone(state.workspace.settings) };
    state.workspace.presets = [...state.workspace.presets.filter(item => item.name !== name), preset];
    try { await persist(); $('preset-name').value = ''; renderPresets(); notice(`配置「${name}」已保存。`, 'success'); }
    catch (error) { state.workspace.presets = previous; renderPresets(); throw error; }
  }
  async function loadWatermark(file) {
    if (!file || !watermarkTarget || state.busy) return;
    const key = watermarkTarget, signal = beginOperation('读取图片水印');
    try {
      if (file.size * 4 / 3 > M.LIMITS.assetChars - 100) throw new Error('水印 PNG 请控制在 4.5 MB 以内');
      const buffer = new Uint8Array(await file.arrayBuffer()); D.check(signal);
      if (M.inspectImage(buffer).type !== 'image/png') throw new Error('图片水印只支持 PNG');
      const bitmap = await D.decode(new Blob([buffer], { type: 'image/png' }), file.name); bitmap.close();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取水印失败'));
        reader.readAsDataURL(new Blob([buffer], { type: 'image/png' }));
      });
      D.check(signal);
      Object.assign(state.workspace.settings[key], { dataUrl, name: file.name, missingAsset: false });
      state.revision++; renderSettings(); scheduleSave(); notice(`已设置图片水印 ${key === 'watermarkA' ? 'A' : 'B'}。`);
    } catch (error) { if (error.name === 'AbortError') notice('已取消读取水印。'); else throw error; }
    finally { finishOperation(); }
  }

  async function setView(view) {
    if (!state.ready || state.busy || !['images', 'settings', 'preview'].includes(view)) return;
    if (view === 'preview') { validateForm(); imageSnapshot(); }
    stopPreview(); state.view = view;
    for (const name of ['images', 'settings', 'preview']) $(`view-${name}`).hidden = name !== view;
    for (const button of document.querySelectorAll('.nav-button')) {
      button.classList.toggle('active', button.dataset.view === view);
      if (button.dataset.view === view) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    }
    $('view-title').textContent = { images: '整理图片', settings: '输出设置', preview: '预览检查' }[view];
    if (view === 'images') { renderGrid(); syncSelection(); }
    if (view === 'preview') await startPreview();
  }
  function stopPreview() {
    const preview = state.preview; state.preview = null;
    if (!preview) return;
    preview.controller.abort(); preview.observer?.disconnect(); preview.session?.dispose();
    for (const item of preview.cache.values()) URL.revokeObjectURL(item.url);
    $('preview-pages').replaceChildren();
  }
  async function startPreview() {
    stopPreview();
    const preview = { controller: new AbortController(), session: null, observer: null, cache: new Map(), visible: new Set(), queue: [], running: false };
    state.preview = preview;
    try {
      preview.session = await D.create(imageSnapshot(), validateForm(), preview.controller.signal);
      if (state.preview !== preview) { preview.session.dispose(); return; }
      $('preview-summary').textContent = `${preview.session.plan.length} 页 · ${$('export-scope').value === 'selected' ? '仅选中图片' : '全部图片'} · ${state.workspace.settings.outputWidth} px 宽`;
      const records = preview.session.plan.map((page, index) => {
        const figure = element('figure', undefined, 'preview-page'), surface = element('div', undefined, 'page-surface');
        figure.dataset.index = String(index);
        figure.append(element('figcaption', `第 ${index + 1} 页 · ${page.kind === 'title' ? '标题页' : page.kind === 'separator' ? '分隔页' : page.image.name} · ${page.width} × ${page.height}`));
        surface.style.aspectRatio = `${page.width} / ${page.height}`;
        const placeholder = element('span', '正在准备预览…', 'page-placeholder'), image = element('img');
        image.alt = page.kind === 'image' ? page.image.name : page.kind === 'title' ? '标题页' : '分隔页'; image.hidden = true;
        surface.append(placeholder, image); figure.append(surface);
        return { figure, placeholder, image, page };
      });
      $('preview-pages').replaceChildren(...records.map(item => item.figure));
      async function drain() {
        if (preview.running) return;
        preview.running = true;
        try {
          while (preview.queue.length && state.preview === preview) {
            const index = preview.queue.shift(), record = records[index];
            if (preview.cache.has(index) || !preview.visible.has(index)) continue;
            try {
              const blob = await preview.session.render(record.page, preview.controller.signal);
              if (state.preview !== preview) break;
              const url = URL.createObjectURL(blob);
              record.image.src = url; record.image.hidden = false; record.placeholder.hidden = true;
              preview.cache.set(index, { url });
              // Only retain nearby pages; a long document must not accumulate decoded canvases.
              for (const [cachedIndex, item] of preview.cache) {
                if (preview.cache.size <= 12) break;
                if (preview.visible.has(cachedIndex)) continue;
                URL.revokeObjectURL(item.url); preview.cache.delete(cachedIndex);
                records[cachedIndex].image.removeAttribute('src'); records[cachedIndex].image.hidden = true;
                records[cachedIndex].placeholder.hidden = false;
              }
            } catch (error) {
              if (error.name === 'AbortError') break;
              record.placeholder.textContent = error.message; record.placeholder.classList.add('error'); report(error);
            }
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        } finally { preview.running = false; }
      }
      preview.observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const index = Number(entry.target.dataset.index);
          if (entry.isIntersecting) { preview.visible.add(index); if (!preview.cache.has(index) && !preview.queue.includes(index)) preview.queue.push(index); }
          else preview.visible.delete(index);
        }
        run(drain);
      }, { root: $('preview-scroll'), rootMargin: '500px 0px' });
      records.forEach(item => preview.observer.observe(item.figure));
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (state.preview === preview) { stopPreview(); $('preview-pages').append(element('p', error.message, 'settings-note')); }
      throw error;
    }
  }
  async function exportPdf() {
    if (!state.ready || state.busy) return;
    const images = imageSnapshot(), settings = validateForm(), signal = beginOperation('生成 PDF');
    let session;
    try {
      session = await D.create(images, settings, signal);
      const bytes = await D.buildPdf(session, { signal, progress: (done, total) => progress(`已生成 ${done}/${total} 页`, done, total) });
      D.check(signal); $('cancel-progress').disabled = true;
      progress('请选择保存位置；取消不会创建文件。', 1, 1);
      const result = await api.savePdf(bytes, M.safeFilename(settings.title.text));
      if (result.status === 'cancelled') notice('已取消保存，没有创建 PDF。');
      else if (result.status === 'saved') {
        $('saved-description').textContent = `${images.length} 张图片 · ${session.plan.length} 页 · ${(result.bytes / 1024 ** 2).toFixed(2)} MB`;
        $('saved-path').textContent = result.filePath; $('open-saved').dataset.id = result.id;
        notice(`PDF 已保存：${result.name}`, 'success');
        finishOperation(); $('saved-dialog').showModal(); return;
      } else throw new Error('PDF 未成功保存，请重试');
    } catch (error) {
      if (error.name === 'AbortError') notice('已取消生成，没有创建 PDF。'); else throw error;
    } finally {
      session?.dispose(); if (state.busy) finishOperation();
      if (state.view === 'preview') run(startPreview);
    }
  }
  function bindGrid() {
    const grid = $('image-grid'), scroll = $('grid-scroll'); let dragging = false, beforeId = null, marquee = null;
    grid.addEventListener('click', event => {
      if (state.busy || dragging) return;
      const card = event.target.closest('.image-card'); if (!card) return;
      const action = event.target.dataset.action;
      if (action === 'mark') {
        const item = state.items.find(item => item.id === card.dataset.id);
        setMarks(event.target.dataset.flag, !item.watermarks[event.target.dataset.flag], new Set([item.id]));
      } else {
        chooseCard(card.dataset.id, event, action === 'select');
        if (action !== 'select') card.focus({ preventScroll: true });
      }
    });
    grid.addEventListener('dragstart', event => {
      const card = event.target.closest('.image-card'); if (!card || state.busy) { event.preventDefault(); return; }
      if (!state.selection.has(card.dataset.id)) { state.selection = new Set([card.dataset.id]); syncSelection(); }
      dragging = true; beforeId = null;
      event.dataTransfer.setData('application/x-tarepdf-item', card.dataset.id); event.dataTransfer.effectAllowed = 'move';
      for (const item of grid.children) item.classList.toggle('drag-source', state.selection.has(item.dataset.id));
      $('drop-end').hidden = false;
    });
    function clearDrop() { for (const card of grid.children) card.classList.remove('drop-before', 'drag-source'); $('drop-end').hidden = true; $('drop-end').classList.remove('drop-active'); dragging = false; }
    scroll.addEventListener('dragover', event => {
      if (!dragging) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      for (const item of grid.children) item.classList.remove('drop-before');
      const card = event.target.closest('.image-card');
      beforeId = card?.dataset.id || null;
      if (card && event.clientX > card.getBoundingClientRect().left + card.offsetWidth / 2) {
        const next = card.nextElementSibling; beforeId = next?.dataset.id || null;
      }
      if (beforeId) [...grid.children].find(item => item.dataset.id === beforeId)?.classList.add('drop-before');
      $('drop-end').classList.toggle('drop-active', beforeId === null);
      const rect = scroll.getBoundingClientRect();
      if (event.clientY > rect.bottom - 50) scroll.scrollTop += 22;
      if (event.clientY < rect.top + 50) scroll.scrollTop -= 22;
    });
    scroll.addEventListener('drop', event => {
      if (!dragging) return;
      event.preventDefault(); event.stopPropagation();
      const ordered = M.reorder(state.items, state.selection, beforeId);
      if (ordered.some((item, index) => item.id !== state.items[index].id)) { checkpoint(); state.items = ordered; changed(); }
      clearDrop();
    });
    grid.addEventListener('dragend', clearDrop);
    scroll.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.pointerType === 'touch' || state.busy || event.target.closest('.image-card,button') || event.clientX >= scroll.getBoundingClientRect().right - 16) return;
      const rect = scroll.getBoundingClientRect();
      marquee = { x: event.clientX, y: event.clientY - rect.top + scroll.scrollTop, base: event.ctrlKey || event.metaKey ? [...state.selection] : [], active: false };
      scroll.setPointerCapture(event.pointerId); scroll.focus(); event.preventDefault();
    });
    scroll.addEventListener('pointermove', event => {
      if (!marquee) return;
      const rect = scroll.getBoundingClientRect(), startY = rect.top + marquee.y - scroll.scrollTop;
      if (Math.abs(event.clientX - marquee.x) + Math.abs(event.clientY - startY) < 5 && !marquee.active) return;
      marquee.active = true;
      const left = Math.min(event.clientX, marquee.x), top = Math.min(event.clientY, startY), right = Math.max(event.clientX, marquee.x), bottom = Math.max(event.clientY, startY);
      Object.assign($('marquee').style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` }); $('marquee').hidden = false;
      state.selection = new Set(marquee.base);
      for (const card of grid.children) { const box = card.getBoundingClientRect(); if (box.right > left && box.left < right && box.bottom > top && box.top < bottom) state.selection.add(card.dataset.id); }
      syncSelection();
    });
    function endMarquee() {
      if (!marquee) return;
      if (!marquee.active) state.selection = new Set(marquee.base);
      marquee = null; $('marquee').hidden = true; state.revision++; syncSelection();
    }
    scroll.addEventListener('pointerup', endMarquee); scroll.addEventListener('pointercancel', endMarquee);
  }
  function bindEvents() {
    for (const button of document.querySelectorAll('.nav-button')) button.addEventListener('click', () => run(() => setView(button.dataset.view)));
    for (const id of ['import-button', 'empty-import']) $(id).addEventListener('click', () => { if (!state.busy) $('image-input').click(); });
    $('image-input').addEventListener('change', event => { const files = [...event.target.files]; event.target.value = ''; run(() => importFiles(files)); });
    $('watermark-input').addEventListener('change', event => { const file = event.target.files[0]; event.target.value = ''; run(() => loadWatermark(file)); });
    $('notice-close').addEventListener('click', () => { $('notice').hidden = true; });
    $('select-all').addEventListener('click', () => { state.selection = new Set(state.items.map(item => item.id)); syncSelection(); });
    $('clear-selection').addEventListener('click', () => { state.selection.clear(); syncSelection(); });
    $('delete-selected').addEventListener('click', removeSelected);
    $('undo-button').addEventListener('click', () => undo()); $('redo-button').addEventListener('click', () => undo(true));
    $('mark-on').addEventListener('click', () => setMarks($('batch-mark').value, true)); $('mark-off').addEventListener('click', () => setMarks($('batch-mark').value, false));
    $('sort-order').addEventListener('change', event => {
      const value = event.target.value; if (!value) return;
      const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
      const ordered = state.items.slice().sort((a, b) => {
        const x = state.resources.get(a.id), y = state.resources.get(b.id);
        return value === 'import' ? x.importOrder - y.importOrder : collator.compare(x.name, y.name) * (value === 'name-desc' ? -1 : 1);
      });
      if (ordered.some((item, index) => item.id !== state.items[index].id)) { checkpoint(); state.items = ordered; changed(); }
      event.target.value = '';
    });
    $('settings-form').addEventListener('submit', event => event.preventDefault());
    $('settings-form').addEventListener('input', event => {
      const key = event.target.dataset.setting, record = fields.get(key); if (!record) return;
      if (!event.target.checkValidity()) { $('save-status').textContent = '设置有未完成的输入'; return; }
      let value = record.type === 'checkbox' ? event.target.checked : record.type === 'number' || record.type === 'range' || key === 'quality' || key.endsWith('.scale') ? Number(event.target.value) : event.target.value;
      setSetting(key, value); if (record.output) record.output.value = `${Math.round(value * 100)}%`;
      state.revision++; scheduleSave(); updateSummary();
      for (const button of document.querySelectorAll('[data-width]')) button.classList.toggle('active', Number(button.dataset.width) === state.workspace.settings.outputWidth);
    });
    $('settings-form').addEventListener('click', event => run(async () => {
      const target = event.target;
      if (target.dataset.width) { state.workspace.settings.outputWidth = Number(target.dataset.width); state.revision++; renderSettings(); scheduleSave(); updateSummary(); }
      if (target.dataset.chooseAsset) { watermarkTarget = target.dataset.chooseAsset; $('watermark-input').click(); }
      if (target.dataset.clearAsset) {
        Object.assign(state.workspace.settings[target.dataset.clearAsset], { dataUrl: '', name: '', missingAsset: false });
        state.revision++; renderSettings(); scheduleSave();
      }
    }));
    $('save-preset').addEventListener('click', () => run(() => settingsTransaction(savePreset)));
    $('preset-list').addEventListener('click', event => run(async () => {
      const row = event.target.closest('.preset-row'), action = event.target.dataset.action;
      if (!row || !action) return;
      const preset = state.workspace.presets.find(item => item.id === row.dataset.id); if (!preset) return;
      if (action === 'load') {
        state.workspace.settings = M.clone(preset.settings); state.revision++; renderSettings(); scheduleSave(); updateSummary();
        notice(`已加载配置「${preset.name}」。`);
      } else if (action === 'delete' && await confirmAction(`删除配置「${preset.name}」？当前已应用的设置不受影响。`)) {
        const previous = state.workspace.presets; state.workspace.presets = previous.filter(item => item.id !== preset.id);
        try { await persist(); renderPresets(); notice(`已删除配置「${preset.name}」。`); }
        catch (error) { state.workspace.presets = previous; throw error; }
      }
    }));
    $('reset-settings').addEventListener('click', () => run(async () => {
      if (!await confirmAction('恢复默认输出设置？已保存的命名配置不受影响。')) return;
      state.workspace.settings = M.defaults(); state.revision++; renderSettings(); scheduleSave(); updateSummary();
    }));
    $('confirm-no').addEventListener('click', () => $('confirm-dialog').close('cancel')); $('confirm-yes').addEventListener('click', () => $('confirm-dialog').close('yes'));
    $('preview-button').addEventListener('click', () => run(() => setView('preview')));
    $('refresh-preview').addEventListener('click', () => run(startPreview));
    $('export-button').addEventListener('click', () => run(exportPdf));
    $('export-scope').addEventListener('change', () => { state.revision++; updateSummary(); if (state.view === 'preview') run(startPreview); });
    $('cancel-progress').addEventListener('click', () => operation?.abort());
    $('progress-dialog').addEventListener('cancel', event => { event.preventDefault(); if (!$('cancel-progress').disabled) operation?.abort(); });
    $('close-saved').addEventListener('click', () => $('saved-dialog').close());
    $('open-saved').addEventListener('click', () => run(async () => {
      $('open-saved').disabled = true;
      try { await api.openSavedPdf($('open-saved').dataset.id); }
      catch (error) { $('saved-description').textContent = `文件已经保存，但无法自动打开。${error.message}`; }
      finally { $('open-saved').disabled = false; }
    }));
    document.addEventListener('keydown', event => {
      if (!state.ready || state.busy || document.querySelector('dialog[open]') || state.view !== 'images') return;
      if (event.target.closest('input,textarea,select,[contenteditable=true],[contenteditable=""]')) return;
      if (!$('view-images').contains(event.target)) return;
      const key = event.key.toLowerCase(), command = event.ctrlKey || event.metaKey;
      if (command && key === 'a') { event.preventDefault(); state.selection = new Set(state.items.map(item => item.id)); syncSelection(); }
      if (command && key === 'z') { event.preventDefault(); undo(event.shiftKey); }
      if (key === 'delete') { event.preventDefault(); removeSelected(); }
      if (key === 'escape') { state.selection.clear(); syncSelection(); }
      if ((key === ' ' || key === 'enter') && event.target.classList.contains('image-card')) { event.preventDefault(); chooseCard(event.target.dataset.id, event, true); }
    });
    document.addEventListener('dragover', event => {
      if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); if (!state.busy) $('grid-scroll').classList.add('file-over'); }
    });
    document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('grid-scroll').classList.remove('file-over'); });
    document.addEventListener('drop', event => {
      event.preventDefault(); $('grid-scroll').classList.remove('file-over');
      if (event.dataTransfer.files.length) run(() => importFiles([...event.dataTransfer.files]));
    });
    bindGrid();
    api.onMenu(command => { if (!state.ready || state.busy || document.querySelector('dialog[open]')) return;
      if (command === 'import') $('image-input').click(); if (command === 'export') run(exportPdf); if (command === 'preview') run(() => setView('preview'));
    });
    api.onBeforeClose(async () => { if (!state.readOnly) await persist(); await saveQueue; });
    window.addEventListener('beforeunload', () => {
      stopPreview(); for (const resource of state.resources.values()) URL.revokeObjectURL(resource.thumbnail);

    });
  }
  async function initialize() {
    try {
      api = window.tareAPI;
      if (!api || !window.PDFLib?.PDFDocument) throw new Error('应用组件未就绪。请通过桌面应用启动；开发环境请先执行 npm install。');
      const loaded = await api.loadWorkspace();
      state.workspace = M.normalizeWorkspace(loaded.workspace, true); state.readOnly = loaded.readOnly === true;
      buildFields(); bindEvents(); renderSettings(); renderGrid();
      state.ready = true; $('work-pane').inert = false;
      $('save-status').textContent = state.readOnly ? '配置只读，本次不保存' : '本地处理 · 设置自动保存';
      if (loaded.warning) notice(loaded.warning, state.readOnly ? 'error' : '');
      syncSelection();
    } catch (error) {
      $('boot-error').hidden = false; $('boot-error').textContent = `启动失败：${error.message}\n请修复后重新打开应用。`;
      $('save-status').textContent = '初始化失败'; $('export-button').disabled = $('preview-button').disabled = true;
      console.error(error);
    }
  }
  initialize();
})();
