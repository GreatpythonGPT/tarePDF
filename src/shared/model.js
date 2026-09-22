/* Shared, side-effect-free document rules. Used by the UI, storage boundary and tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TareModel = api;
})(globalThis, function () {
  'use strict';
  const LIMITS = Object.freeze({ images: 500, inputBytes: 64 * 1024 ** 2,
    inputPixels: 60_000_000, pagePixels: 32_000_000, pageSide: 14400,
    pdfBytes: 256 * 1024 ** 2, assetChars: 6 * 1024 ** 2, workspaceChars: 32 * 1024 ** 2 });
  const MARKS = Object.freeze([
    { flag: 'imageA', key: 'watermarkA', label: 'A', kind: 'image' },
    { flag: 'imageB', key: 'watermarkB', label: 'B', kind: 'image' },
    { flag: 'textA', key: 'watermarkTextA', label: 'C', kind: 'text' },
    { flag: 'textB', key: 'watermarkTextB', label: 'D', kind: 'text' }
  ]);
  const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const clone = value => JSON.parse(JSON.stringify(value));
  function defaults() {
    const image = position => ({ dataUrl: '', name: '', missingAsset: false, position,
      marginX: 20, marginY: 20, scale: 0.75, opacity: 1 });
    const text = position => ({ text: '', fontSize: 24, fontFamily: 'Microsoft YaHei',
      color: '#000000', backgroundColor: 'transparent', opacity: 0.8, position,
      marginX: 20, marginY: 20, shadowOpacity: 0.3 });
    return { outputWidth: 1080, quality: 0.95,
      title: { text: '', fontSize: 48, fontFamily: 'Microsoft YaHei', color: '#000000', backgroundColor: '#ffffff' },
      separator: { enabled: false, height: 100 },
      watermarkA: image('top-left'), watermarkB: image('top-right'),
      watermarkTextA: text('bottom-right'), watermarkTextB: text('top-right') };
  }
  function normalizeSettings(input, strict = false) {
    const source = object(input), result = defaults();
    function fail(message, fallback) { if (strict) throw new Error(message); return fallback; }
    function number(value, fallback, min, max, label, integer = false) {
      if (value === undefined) return fallback;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        return fail(`${label}必须在 ${min}–${max} 之间${integer ? '，且为整数' : ''}`, fallback);
      }
      return value;
    }
    function string(value, fallback, max, label) {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || value.length > max) return fail(`${label}过长或格式不正确`, fallback);
      return value;
    }
    function color(value, fallback, transparent = false) {
      if (value === undefined) return fallback;
      return (typeof value === 'string' && (/^#[0-9a-f]{6}$/i.test(value) || (transparent && value === 'transparent')))
        ? value : fail('颜色格式不正确', fallback);
    }
    function boolean(value, fallback) {
      return value === undefined ? fallback : typeof value === 'boolean' ? value : fail('开关值不正确', fallback);
    }
    result.outputWidth = number(source.outputWidth, 1080, 100, 5000, '输出宽度', true);
    result.quality = number(source.quality, 0.95, 0.5, 1, '图像质量');
    for (const key of ['title', ...MARKS.map(mark => mark.key)]) {
      const src = object(source[key]), dest = result[key];
      if (key === 'title' || key.startsWith('watermarkText')) {
        dest.text = string(src.text, dest.text, key === 'title' ? 2000 : 500, '文字');
        dest.fontSize = number(src.fontSize, dest.fontSize, 8, 200, '字号', true);
        const font = string(src.fontFamily, dest.fontFamily, 80, '字体名称');
        dest.fontFamily = /^[\p{L}\p{N} _-]+$/u.test(font) ? font : fail('字体名称格式不正确', dest.fontFamily);
        dest.color = color(src.color, dest.color);
        dest.backgroundColor = color(src.backgroundColor, dest.backgroundColor, key !== 'title');
      }
      if (key !== 'title') {
        dest.position = src.position === undefined ? dest.position : POSITIONS.includes(src.position) ? src.position : fail('水印位置不正确', dest.position);
        dest.marginX = number(src.marginX, dest.marginX, 0, 500, '水平边距', true);
        dest.marginY = number(src.marginY, dest.marginY, 0, 500, '垂直边距', true);
        dest.opacity = number(src.opacity, dest.opacity, 0, 1, '不透明度');
        if (key.startsWith('watermarkText')) dest.shadowOpacity = number(src.shadowOpacity, dest.shadowOpacity, 0, 1, '阴影强度');
        else {
          const data = string(src.dataUrl, '', LIMITS.assetChars, '水印文件');
          dest.dataUrl = !data || /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(data)
            ? data : fail('水印必须是 PNG 图片', '');
          dest.name = string(src.name, '', 255, '水印名称');
          // Legacy paths are never read through IPC. Re-selection gives explicit user consent.
          dest.missingAsset = !dest.dataUrl && (src.missingAsset === true || (typeof src.path === 'string' && src.path.length > 0));
          if (dest.missingAsset && !dest.name) dest.name = String(src.path || '旧版水印').split(/[\\/]/).pop().slice(0, 255);
          dest.scale = number(src.scale, dest.scale, 0.05, 2, '水印缩放');
        }
      }
    }
    const separator = object(source.separator);
    result.separator.enabled = boolean(separator.enabled, false);
    result.separator.height = number(separator.height, 100, 1, 2000, '分隔页高度', true);
    return result;
  }
  function normalizeWorkspace(input, strict = false) {
    const src = object(input);
    if (src.version !== undefined && src.version !== 2) throw new Error('配置版本不兼容，请使用对应版本的软件');
    const presets = Array.isArray(src.presets) ? src.presets : [];
    if (presets.length > 50) throw new Error('最多保存 50 个配置');
    const seen = new Set(), ids = new Set();
    return { version: 2, settings: normalizeSettings(src.settings, strict), presets: presets.map((value, index) => {
      const item = object(value), name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name || name.length > 50 || seen.has(name)) throw new Error('配置名称须为 1–50 个字符且不能重复');
      seen.add(name);
      let id = typeof item.id === 'string' && /^[\w-]{1,100}$/.test(item.id) ? item.id : `preset-${index}`;
      if (ids.has(id)) { if (strict) throw new Error('配置 ID 不能重复'); id = `preset-${index}-${ids.size}`; }
      ids.add(id);
      return { id, name, settings: normalizeSettings(item.settings, strict) };
    }) };
  }
  function migrateLegacy(input) {
    const source = object(input), presets = [];
    for (const [key, value] of Object.entries(object(source.configs)).slice(0, 50)) {
      const item = object(value);
      let name = typeof item.name === 'string' ? item.name.trim().slice(0, 50) : key.slice(0, 50);
      if (!name || presets.some(preset => preset.name === name)) continue;
      presets.push({ id: `legacy-${presets.length}`, name, settings: normalizeSettings(item.settings) });
    }
    return normalizeWorkspace({ version: 2, settings: normalizeSettings(source.settings), presets });
  }
  function marks() { return Object.fromEntries(MARKS.map(mark => [mark.flag, true])); }
  function reorder(items, ids, beforeId = null) {
    const selected = new Set(ids);
    if (beforeId !== null && (!items.some(item => item.id === beforeId) || selected.has(beforeId))) return items.slice();
    const moving = items.filter(item => selected.has(item.id));
    const rest = items.filter(item => !selected.has(item.id));
    const index = beforeId === null ? rest.length : rest.findIndex(item => item.id === beforeId);
    return [...rest.slice(0, index), ...moving, ...rest.slice(index)];
  }
  function selectRange(items, anchor, target, previous = []) {
    const end = items.findIndex(item => item.id === target);
    if (end < 0) return new Set(previous);
    const found = items.findIndex(item => item.id === anchor), start = found < 0 ? end : found;
    return new Set([...previous, ...items.slice(Math.min(start, end), Math.max(start, end) + 1).map(item => item.id)]);
  }
  function exportItems(items, selection, scope) {
    if (!['all', 'selected'].includes(scope)) throw new Error('导出范围不正确');
    const selected = new Set(selection);
    const result = scope === 'selected' ? items.filter(item => selected.has(item.id)) : items.slice();
    if (!result.length) throw new Error(scope === 'selected' ? '请先选择要导出的图片，或切换为全部图片' : '请先导入图片');
    return result;
  }
  function pagePlan(images, rawSettings) {
    const settings = normalizeSettings(rawSettings, true);
    if (!images.length) throw new Error('请先导入图片');
    if (images.length > LIMITS.images) throw new Error(`最多导入 ${LIMITS.images} 张图片`);
    const pages = [], width = settings.outputWidth;
    if (settings.title.text.trim()) pages.push({ kind: 'title', width, height: 500 });
    images.forEach((image, index) => {
      if (![image.width, image.height].every(value => Number.isFinite(value) && value > 0)) throw new Error(`图片尺寸无效：${image.name}`);
      const height = Math.max(1, Math.round(width * image.height / image.width));
      if (height > LIMITS.pageSide || width * height > LIMITS.pagePixels) throw new Error(`图片「${image.name}」输出尺寸过大，请降低输出宽度后重试`);
      pages.push({ kind: 'image', width, height, image, imageIndex: index });
      if (settings.separator.enabled && index < images.length - 1) pages.push({ kind: 'separator', width, height: settings.separator.height });
    });
    return pages;
  }
  function fitBox(pageWidth, pageHeight, boxWidth, boxHeight, options) {
    const mx = Math.min(options.marginX, Math.max(0, (pageWidth - 1) / 2));
    const my = Math.min(options.marginY, Math.max(0, (pageHeight - 1) / 2));
    const ratio = Math.min(1, (pageWidth - 2 * mx) / boxWidth, (pageHeight - 2 * my) / boxHeight);
    const width = boxWidth * ratio, height = boxHeight * ratio;
    const x = options.position === 'center' ? (pageWidth - width) / 2 : options.position.endsWith('right') ? pageWidth - width - mx : mx;
    const y = options.position === 'center' ? (pageHeight - height) / 2 : options.position.startsWith('bottom') ? pageHeight - height - my : my;
    return { x, y, width, height, ratio };
  }
  function inspectImage(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > LIMITS.inputBytes) throw new Error('图片为空或超过 64 MB');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const text = (start, count) => String.fromCharCode(...bytes.slice(start, start + count));
    let width = 0, height = 0, type = '';
    if (text(1, 3) === 'PNG' && bytes[0] === 137 && bytes.length >= 24 && text(12, 4) === 'IHDR') {
      width = view.getUint32(16); height = view.getUint32(20); type = 'image/png';
    } else if (bytes[0] === 255 && bytes[1] === 216) {
      type = 'image/jpeg';
      for (let index = 2; index + 4 <= bytes.length;) {
        if (bytes[index++] !== 255) break;
        while (bytes[index] === 255) index++;
        const marker = bytes[index++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        if (index + 2 > bytes.length) break;
        const length = view.getUint16(index);
        if (length < 2 || index + length > bytes.length) break;
        if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) {
          height = view.getUint16(index + 3); width = view.getUint16(index + 5); break;
        }
        index += length;
      }
    } else if (['GIF87a', 'GIF89a'].includes(text(0, 6))) {
      width = view.getUint16(6, true); height = view.getUint16(8, true); type = 'image/gif';
    } else if (text(0, 2) === 'BM' && bytes.length >= 26) {
      const dib = view.getUint32(14, true);
      if (dib === 12) { width = view.getUint16(18, true); height = view.getUint16(20, true); }
      else if (dib >= 40) { width = view.getInt32(18, true); height = Math.abs(view.getInt32(22, true)); }
      type = 'image/bmp';
    } else if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP' && bytes.length >= 30) {
      type = 'image/webp';
      const chunk = text(12, 4);
      if (chunk === 'VP8X') {
        width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
        height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      } else if (chunk === 'VP8L' && bytes[20] === 47) {
        width = 1 + bytes[21] + ((bytes[22] & 63) << 8);
        height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
      } else if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
        width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383;
      }
    }
    if (!type || width <= 0 || height <= 0) throw new Error('不支持或已损坏的图片格式');
    if (width * height > LIMITS.inputPixels || width > 32767 || height > 32767) throw new Error('原图像素过大（最多 6000 万像素，单边不超过 32767）');
    return { width, height, type };
  }
  function safeFilename(text) {
    let value = String(text || '渲染图集').split(/[\r\n]/)[0].replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[. ]+$/, '').slice(0, 100);
    if (!value || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) value = '渲染图集';
    return `${value.replace(/\.pdf$/i, '')}.pdf`;
  }
  return { LIMITS, MARKS, POSITIONS, defaults, normalizeSettings, normalizeWorkspace, migrateLegacy,
    marks, clone, reorder, selectRange, exportItems, pagePlan, fitBox, inspectImage, safeFilename };
});
