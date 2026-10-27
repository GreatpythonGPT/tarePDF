import { designWidth } from './output-settings.mjs';

// Shared by the continuous preview and PDF export, including text wrapping.
export function titleStripCanvas(settings, width = designWidth(settings)) {
  const scale = width / designWidth(settings);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.max(1, Math.round(settings.coverHeight * scale));
  const ctx = canvas.getContext('2d'); ctx.fillStyle = settings.coverBackground; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const margin = width * 0.075, availableWidth = width - margin * 2, availableHeight = canvas.height * 0.8;
  let fontSize = settings.coverFontSize * scale, lines;
  for (let attempt = 0; attempt < 100; attempt++) {
    ctx.font = `700 ${fontSize}px "Noto Sans SC"`; lines = [];
    for (const paragraph of settings.title.split('\n')) {
      let line = '';
      for (const character of paragraph) { if (line && ctx.measureText(line + character).width > availableWidth) { lines.push(line); line = ''; } line += character; }
      lines.push(line);
    }
    if (lines.length * fontSize * 1.35 <= availableHeight) break;
    fontSize *= 0.88;
  }
  ctx.fillStyle = settings.coverColor; ctx.textBaseline = 'middle'; ctx.textAlign = settings.coverAlign;
  const x = settings.coverAlign === 'center' ? width / 2 : settings.coverAlign === 'right' ? width - margin : margin;
  const lineHeight = fontSize * 1.35, y = (canvas.height - (lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return canvas;
}
