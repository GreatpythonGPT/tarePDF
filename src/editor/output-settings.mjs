export const outputDefaults = () => ({
  width: 1080, sizing: 'width', scope: 'all', cover: false, title: '我的作品集',
  coverHeight: 500, coverFontSize: 64, coverColor: '#263c34', coverBackground: '#f2f1e9', coverAlign: 'center',
  separator: false, separatorHeight: 100, separatorColor: '#ffffff', background: '#ffffff'
});
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const color = v => typeof v === 'string' && /^#[a-fA-F0-9]{6}$/.test(v);
export function validateOutput(input = {}) {
  const fail = () => { throw new Error('作品中的整组排版参数不正确'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  const legacy = input.sizing === undefined;
  const result = outputDefaults();
  if (legacy) Object.assign(result, { sizing: 'long-edge', width: 2400, coverHeight: (input.width || 2400) * 0.7, coverFontSize: (input.width || 2400) * 0.06, coverAlign: 'left', coverBackground: input.background || '#ffffff', separatorHeight: (input.width || 2400) * 0.1, separatorColor: input.background || '#ffffff' });
  if (input.sizing !== undefined && !['width', 'long-edge'].includes(input.sizing)) fail();
  result.sizing = input.sizing ?? result.sizing;
  const width = input.width ?? result.width;
  if (!Number.isInteger(width) || !(finite(width, 100, 5000) || (width === 0 && result.sizing === 'long-edge'))) fail();
  result.width = width;
  for (const [key, min, max] of [['coverHeight', 40, 5000], ['coverFontSize', 8, 500], ['separatorHeight', 1, 2000]]) {
    if (input[key] !== undefined) { if (!finite(input[key], min, max)) fail(); result[key] = input[key]; }
  }
  for (const key of ['coverColor', 'coverBackground', 'separatorColor', 'background']) {
    if (input[key] !== undefined) { if (!color(input[key])) fail(); result[key] = input[key]; }
  }
  if (input.coverAlign !== undefined) { if (!['left', 'center', 'right'].includes(input.coverAlign)) fail(); result.coverAlign = input.coverAlign; }
  if (input.title !== undefined) { if (typeof input.title !== 'string' || input.title.length > 1000) fail(); result.title = input.title; }
  result.scope = input.scope === 'selected' ? 'selected' : 'all'; result.cover = !!input.cover; result.separator = !!input.separator;
  return result;
}
export const designWidth = settings => settings.width || 2400;
export function compositionParts(pages, settings) {
  if (!pages.length) return [];
  const parts = [];
  if (settings.cover) parts.push({ type: 'title', height: settings.coverHeight });
  pages.forEach((page, index) => {
    parts.push({ type: 'image', page, index });
    if (settings.separator && index < pages.length - 1) parts.push({ type: 'separator', height: settings.separatorHeight });
  });
  return parts;
}
