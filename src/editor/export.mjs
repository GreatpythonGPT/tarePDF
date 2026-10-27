import { PDFDocument } from 'pdf-lib';
import { composeCanvas } from './canvas.mjs';
import { ImageProcessor } from './images.mjs';
export const canvasBytes = canvas => new Promise((resolve, reject) => canvas.toBlob(async blob => blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error('图片编码失败')), 'image/png'));
function coverCanvas(title, width, background) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.round(width * 0.7);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#264b40'; ctx.fillRect(width * 0.08, width * 0.14, width * 0.07, width * 0.008);
  let fontSize = width * 0.06, lines;
  do {
    ctx.font = `700 ${fontSize}px "Noto Sans SC"`; lines = [];
    for (const paragraph of title.split('\n')) {
      let line = '';
      for (const char of paragraph) { if (ctx.measureText(line + char).width > width * 0.82) { lines.push(line); line = ''; } line += char; }
      lines.push(line);
    }
    if (lines.length * fontSize * 1.4 <= width * 0.38) break;
    fontSize *= 0.85;
  } while (fontSize > 6);
  ctx.textBaseline = 'top'; lines.forEach((line, i) => ctx.fillText(line, width * 0.08, width * 0.23 + i * fontSize * 1.4));
  ctx.font = `${width * 0.015}px "Noto Sans SC"`; ctx.fillStyle = '#6c7e73'; ctx.fillText('TARE STUDIO  /  COLLECTION', width * 0.08, width * 0.61);
  return canvas;
}
export async function createPDF(project, ids, progress = () => {}) {
  const pages = project.pages.filter(p => ids.includes(p.id));
  if (!pages.length) throw new Error('请先选择要导出的页面');
  await document.fonts.ready;
  const pdf = await PDFDocument.create(); pdf.setTitle(project.name); pdf.setCreator('Tare Studio');
  const processor = new ImageProcessor();
  const addCanvas = async canvas => { const image = await pdf.embedPng(await canvasBytes(canvas)); const page = pdf.addPage([720, 720 * canvas.height / canvas.width]); page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() }); canvas.width = 1; canvas.height = 1; };
  try {
    if (project.export.cover) await addCanvas(coverCanvas(project.export.title, project.export.width || 2400, project.export.background));
    for (let i = 0; i < pages.length; i++) {
      progress(i + 1, pages.length);
      const p = pages[i], bitmap = await processor.process(p, project.export.width);
      try { await addCanvas(await composeCanvas(p, project.layouts[p.layoutId], bitmap, project.export.background)); } finally { bitmap.close(); }
      if (project.export.separator && i < pages.length - 1) { const separator = pdf.addPage([720, 72]); const { rgb } = await import('pdf-lib'); const color = project.export.background; separator.drawRectangle({ x: 0, y: 0, width: 720, height: 72, color: rgb(parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255) }); }
    }
    return pdf.save();
  } finally { processor.dispose(); }
}
