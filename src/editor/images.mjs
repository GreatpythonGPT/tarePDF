export class ImageProcessor {
  constructor() { this.worker = new Worker('./image.worker.js'); this.pending = new Map(); this.sequence = 0; this.queue = Promise.resolve();
    this.worker.onmessage = ({ data }) => { const p = this.pending.get(data.id); this.pending.delete(data.id); if (data.error) p?.reject(new Error(data.error)); else if (p) p.resolve(data.bitmap); else data.bitmap?.close(); };
    this.worker.onerror = () => { this.failed = true; for (const p of this.pending.values()) p.reject(new Error('图片处理失败，请重新打开应用')); this.pending.clear(); };
  }
  process(page, maxSide = 1600, original = false) {
    const snapshot = structuredClone(page);
    const job = () => new Promise((resolve, reject) => { if (this.failed) { reject(new Error('图片处理进程已停止，请重新打开应用')); return; } const id = ++this.sequence; this.pending.set(id, { resolve, reject }); this.worker.postMessage({ id, page: snapshot, maxSide, original }); });
    const next = this.queue.then(job, job); this.queue = next.catch(() => {}); return next;
  }
  dispose() { this.worker.terminate(); for (const p of this.pending.values()) p.reject(new Error('处理已结束')); this.pending.clear(); }
}
export const loadImage = src => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('无法读取图片，请使用有效的 JPG、PNG 或 WebP 图片')); image.src = src; });
export async function normalizeImage(file) {
  if (file.size > 60000000) throw new Error(`${file.name} 超过 60 MB，请先缩小图片`);
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (image.width * image.height > 80000000 || Math.max(image.width, image.height) > 30000) throw new Error(`${file.name} 尺寸过大（最多 8000 万像素）`);
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    // Canvas decoding normalizes EXIF orientation and drops executable SVG / metadata.
    return { name: file.name, width: image.width, height: image.height, src: canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.97) };
  } finally { URL.revokeObjectURL(url); }
}
