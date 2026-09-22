/* One rendering path for both preview and PDF pages. No mutation of source images. */
(function () {
  'use strict';
  const M = window.TareModel;
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  function check(signal) { if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError'); }
  function canvas(width, height) {
    const element = document.createElement('canvas');
    element.width = width; element.height = height;
    const context = element.getContext('2d', { alpha: false });
    if (!context) throw new Error('无法创建画布，请降低输出宽度');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    return { element, context };
  }
  async function decode(blob, label) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch { throw new Error(`无法读取图片「${label}」，请重新选择有效的图片文件`); }
  }
  function dataBlob(dataUrl) {
    const text = atob(dataUrl.split(',')[1]);
    return new Blob([Uint8Array.from(text, character => character.charCodeAt(0))], { type: 'image/png' });
  }
  function font(context, size, family) { context.font = `${size}px "${family}", "Noto Sans CJK SC", sans-serif`; }
  function linesFor(context, text, maxWidth) {
    const result = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let line = '';
      for (const character of Array.from(paragraph)) {
        if (line && context.measureText(line + character).width > maxWidth) { result.push(line); line = ''; }
        line += character;
      }
      result.push(line);
    }
    return result;
  }
  function drawTitle(ctx, options, width, height) {
    const padding = Math.min(48, width * 0.08), available = width - padding * 2;
    let size = options.fontSize, lines;
    while (true) {
      font(ctx, size, options.fontFamily);
      lines = linesFor(ctx, options.text, available);
      if (lines.length * size * 1.4 <= height - 60 && lines.every(line => ctx.measureText(line).width <= available)) break;
      if (size <= 8) throw new Error('标题文字过长，无法完整放入标题页；请减少文字');
      size -= 1;
    }
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = options.color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lineHeight = size * 1.4, startY = (height - lines.length * lineHeight) / 2 + lineHeight / 2;
    lines.forEach((line, index) => ctx.fillText(line, width / 2, startY + index * lineHeight));
  }
  function drawTextMark(ctx, options, width, height) {
    if (!options.text || options.opacity === 0) return;
    ctx.save();
    font(ctx, options.fontSize, options.fontFamily);
    const lines = options.text.split(/\r?\n/), lineHeight = options.fontSize * 1.4, padding = 6;
    const boxWidth = Math.max(1, ...lines.map(line => ctx.measureText(line).width)) + padding * 2;
    const boxHeight = lines.length * lineHeight + padding * 2;
    const box = M.fitBox(width, height, boxWidth, boxHeight, options);
    ctx.translate(box.x, box.y); ctx.scale(box.ratio, box.ratio);
    ctx.globalAlpha = options.opacity;
    if (options.backgroundColor !== 'transparent') {
      ctx.fillStyle = options.backgroundColor; ctx.fillRect(0, 0, boxWidth, boxHeight);
    }
    ctx.fillStyle = options.color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (options.shadowOpacity > 0) {
      ctx.shadowColor = `rgba(0,0,0,${options.shadowOpacity})`;
      ctx.shadowBlur = options.fontSize * 0.1; ctx.shadowOffsetX = options.fontSize * 0.05; ctx.shadowOffsetY = options.fontSize * 0.05;
    }
    lines.forEach((line, index) => ctx.fillText(line, padding, padding + lineHeight * (index + 0.5)));
    ctx.restore();
  }
  async function create(images, rawSettings, signal) {
    const settings = M.normalizeSettings(M.clone(rawSettings), true);
    // The ordered image/flag snapshot stays independent from later UI changes.
    const snapshot = images.map(image => ({ ...image, watermarks: { ...image.watermarks } }));
    const plan = M.pagePlan(snapshot, settings), assets = new Map();
    try {
      for (const mark of M.MARKS.filter(mark => mark.kind === 'image')) {
        const options = settings[mark.key];
        if (!snapshot.some(image => image.watermarks[mark.flag])) continue;
        if (options.missingAsset) throw new Error(`图片水印 ${mark.label} 缺少文件，请重新选择，或在设置中明确清除`);
        if (options.dataUrl) {
          check(signal);
          assets.set(mark.flag, await decode(dataBlob(options.dataUrl), `水印 ${mark.label}`));
        }
      }
      await document.fonts.ready;
      for (const item of [settings.title, settings.watermarkTextA, settings.watermarkTextB]) {
        if (item.text) await document.fonts.load(`${item.fontSize}px "${item.fontFamily}"`, item.text);
      }
      check(signal);
    } catch (error) { for (const asset of assets.values()) asset.close(); throw error; }
    let disposed = false;
    return {
      plan, settings,
      async render(page, renderSignal) {
        check(renderSignal);
        if (disposed) throw new DOMException('预览已关闭', 'AbortError');
        const { element, context: ctx } = canvas(page.width, page.height);
        try {
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, page.width, page.height);
          if (page.kind === 'title') drawTitle(ctx, settings.title, page.width, page.height);
          if (page.kind === 'image') {
            const bitmap = await decode(page.image.file, page.image.name);
            try { check(renderSignal); ctx.drawImage(bitmap, 0, 0, page.width, page.height); }
            finally { bitmap.close(); }
            for (const mark of M.MARKS) {
              if (!page.image.watermarks[mark.flag]) continue;
              const options = settings[mark.key];
              if (mark.kind === 'text') drawTextMark(ctx, options, page.width, page.height);
              else if (assets.has(mark.flag) && options.opacity > 0) {
                const image = assets.get(mark.flag), box = M.fitBox(page.width, page.height, image.width * options.scale, image.height * options.scale, options);
                ctx.save(); ctx.globalAlpha = options.opacity;
                ctx.drawImage(image, box.x, box.y, box.width, box.height); ctx.restore();
              }
            }
          }
          check(renderSignal);
          const type = page.kind === 'image' ? 'image/jpeg' : 'image/png';
          const blob = await new Promise((resolve, reject) => element.toBlob(value => value ? resolve(value) : reject(new Error('页面编码失败，请降低输出宽度')), type, settings.quality));
          check(renderSignal);
          return blob;
        } finally { element.width = 1; element.height = 1; }
      },
      dispose() { disposed = true; for (const asset of assets.values()) asset.close(); assets.clear(); }
    };
  }
  async function buildPdf(session, { signal, progress = () => {} } = {}) {
    if (!window.PDFLib?.PDFDocument) throw new Error('本地 PDF 库缺失，请重新安装应用或运行 npm run prepare');
    const pdf = await window.PDFLib.PDFDocument.create();
    pdf.setProducer('tarePDF 2'); pdf.setCreator('tarePDF');
    if (session.settings.title.text.trim()) pdf.setTitle(session.settings.title.text.trim());
    let encodedBytes = 0;
    for (let index = 0; index < session.plan.length; index++) {
      check(signal);
      const item = session.plan[index], page = pdf.addPage([item.width, item.height]);
      if (item.kind !== 'separator') {
        const blob = await session.render(item, signal);
        encodedBytes += blob.size;
        if (encodedBytes > M.LIMITS.pdfBytes * 0.9) throw new Error('文稿过大，请降低输出宽度或分批导出');
        const bytes = await blob.arrayBuffer();
        const image = blob.type === 'image/jpeg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
        page.drawImage(image, { x: 0, y: 0, width: item.width, height: item.height });
      }
      progress(index + 1, session.plan.length);
      await tick();
    }
    check(signal);
    const bytes = await pdf.save();
    check(signal);
    if (bytes.length > M.LIMITS.pdfBytes) throw new Error('PDF 超过 256 MB，请分批导出');
    return bytes;
  }
  window.TareDocument = Object.freeze({ create, buildPdf, decode, dataBlob, check });
})();
