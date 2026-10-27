import { PDFDocument, rgb } from 'pdf-lib';
import { titleStripCanvas } from './title-strip.mjs';
import { designWidth } from './output-settings.mjs';
import { uniformSize } from './filters.mjs';
import { pageSize } from './model.mjs';
import { composeCanvas } from './canvas.mjs';
import { ImageProcessor } from './images.mjs';
export const canvasBytes = canvas => new Promise((resolve, reject) => canvas.toBlob(async blob => blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error('图片编码失败')), 'image/png'));
export async function createPDF(project, ids, progress = () => {}) {
  const pages = project.pages.filter(p => ids.includes(p.id));
  if (!pages.length) throw new Error('请先选择要导出的页面');
  if (project.export.sizing === 'width') for (const p of pages) { const size = pageSize(p); try { uniformSize(size.width, size.height, project.export.width); } catch (error) { throw new Error(`${p.name}：${error.message}`); } }
  await document.fonts.ready;
  const pdf = await PDFDocument.create(); pdf.setTitle(project.name); pdf.setCreator('Tare Studio');
  const processor = new ImageProcessor();
  const addCanvas = async canvas => { const image = await pdf.embedPng(await canvasBytes(canvas)); const page = pdf.addPage([720, 720 * canvas.height / canvas.width]); page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() }); canvas.width = 1; canvas.height = 1; };
  try {
    if (project.export.cover) await addCanvas(titleStripCanvas(project.export));
    for (let i = 0; i < pages.length; i++) {
      progress(i + 1, pages.length);
      const p = pages[i], bitmap = await processor.processForExport(p, project.export);
      try { await addCanvas(await composeCanvas(p, project.layouts[p.layoutId], bitmap, project.export.background)); } finally { bitmap.close(); }
      if (project.export.separator && i < pages.length - 1) { const height = 720 * project.export.separatorHeight / designWidth(project.export); const separator = pdf.addPage([720, height]); const color = project.export.separatorColor; separator.drawRectangle({ x: 0, y: 0, width: 720, height, color: rgb(parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255) }); }
    }
    return pdf.save();
  } finally { processor.dispose(); }
}
