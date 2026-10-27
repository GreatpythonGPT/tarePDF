const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PDFDocument, PDFName } = require('pdf-lib');
const repo = path.resolve(__dirname, '..'), root = process.env.TARE_TEST_OUTPUT || path.join(repo, 'test-results');
let app, page, output;
const checks = [], errors = [];
async function check(name, run) { await run(); checks.push(name); console.log('✓', name); }
(async () => {
  await fs.mkdir(root, { recursive: true }); output = await fs.mkdtemp(path.join(root, 'collection-'));
  const files = { tare: path.join(output, '整组编排.tare'), pdf: path.join(output, '整组编排.pdf'), png: path.join(output, '统一宽度.png') };
  app = await _electron.launch({ executablePath: process.env.TAREPDF_EXECUTABLE || require('electron'), args: [...(process.env.TAREPDF_EXECUTABLE ? [] : [repo]), ...(process.env.TARE_E2E_NO_SANDBOX ? ['--no-sandbox', '--disable-gpu'] : [])], env: { ...process.env, TARE_STUDIO_PROFILE: path.join(output, 'profile') }, timeout: 60000 });
  await app.evaluate(({ BrowserWindow, dialog }, paths) => { BrowserWindow.getAllWindows()[0].setSize(1500, 1000); dialog.showSaveDialog = async (_w, options) => ({ canceled: false, filePath: paths[options.filters[0].extensions[0]] }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.tare] }); }, files);
  page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('dialog', d => d.accept());
  await page.waitForSelector('body[data-ready="true"]');
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function saved() { await page.click('#save-project'); await page.waitForFunction(() => !document.querySelector('#save-project').disabled); return JSON.parse(await fs.readFile(files.tare, 'utf8')); }
  async function number(id, value) { await page.fill(`#${id}`, String(value)); await page.locator(`#${id}`).press('Tab'); await frame(); }
  async function color(id, value) { await page.locator(`#${id}`).evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, value); }
  const card = index => page.locator('#collection-scroll .collection-card').nth(index);
  const ids = async () => (await saved()).pages.map(p => p.id);
  await page.click('#demo-load'); await page.waitForFunction(() => document.querySelectorAll('.page-card').length === 3);
  const original = await saved();
  const dimensions = [[1600, 900], [900, 1400], [600, 600], [2400, 1000]];
  const data = await page.evaluate(async ({ sources, dimensions }) => {
    const result = [];
    for (let i = 0; i < dimensions.length; i++) {
      const image = new Image(); image.src = sources[i % sources.length]; await image.decode();
      const [w, h] = dimensions[i], canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const scale = Math.max(w / image.width, h / image.height), sw = w / scale, sh = h / scale;
      canvas.getContext('2d').drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, w, h); result.push(canvas.toDataURL('image/png').split(',')[1]);
    }
    return result;
  }, { sources: original.pages.map(p => p.src), dimensions });
  const names = ['光影客厅 · 横幅', '建筑细部 · 竖幅', '庭院一隅 · 方形', '空间秩序 · 宽幅'];
  const inputs = data.map((_, i) => path.join(output, `${names[i]}.png`));
  for (let i = 0; i < inputs.length; i++) await fs.writeFile(inputs[i], Buffer.from(data[i], 'base64'));
  await page.click('#new-project');
  let starting, ordered;
  await check('混合尺寸批量导入后进入整组编排，所有预览等宽且保留比例', async () => {
    await page.setInputFiles('#image-input', inputs); await page.waitForFunction(() => document.querySelectorAll('#collection-scroll .collection-card').length === 4);
    assert.equal(await page.locator('.workspace').getAttribute('data-mode'), 'collection'); assert.equal(await page.inputValue('#collection-width'), '1080');
    starting = await saved(); assert.equal(starting.export.sizing, 'width'); assert.deepEqual(starting.pages.map(p => [p.width, p.height]), dimensions);
    const sizes = await page.locator('#collection-scroll .collection-picture').evaluateAll(images => images.map(i => { const box = i.getBoundingClientRect(); return [box.width, box.height]; }));
    for (let i = 0; i < sizes.length; i++) { assert(Math.abs(sizes[i][0] - sizes[0][0]) < 0.1); assert(Math.abs(sizes[i][1] / sizes[i][0] - dimensions[i][1] / dimensions[i][0]) < 0.005); }
    assert.equal(await page.locator('#collection-scroll .collection-check input:checked').count(), 1);
  });
  await check('统一宽度可自定义，标题条和分隔横条实时预览并保持正确插入位置', async () => {
    await number('collection-width', 1375); await page.check('#collection-cover'); await page.fill('#collection-title', '光与空间\n年度设计作品集'); await number('collection-coverHeight', 180); await number('collection-coverFontSize', 64); await color('collection-coverBackground', '#e8eadf'); await color('collection-coverColor', '#284b32'); await page.selectOption('#collection-coverAlign', 'left');
    await page.check('#collection-separator'); await number('collection-separatorHeight', 48); await color('collection-separatorColor', '#d7ddcb');
    const doc = await saved(); assert.equal(doc.export.width, 1375); assert.equal(doc.export.coverHeight, 180); assert.equal(doc.export.separatorHeight, 48);
    assert.deepEqual(doc.pages.map(p => p.src), starting.pages.map(p => p.src));
    assert.deepEqual(await page.locator('#collection-scroll .collection-sheet > [data-part]').evaluateAll(items => items.map(x => x.dataset.part)), ['title', 'image', 'separator', 'image', 'separator', 'image', 'separator', 'image']);
    await page.waitForSelector('#collection-scroll .collection-picture[data-ready="true"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.page-thumb')].every(image => image.src.startsWith('data:')));
    await page.locator('.inspector-scroll').evaluate(e => { e.scrollTop = 0; }); await page.locator('#toast').evaluate(e => { e.hidden = true; }); await page.screenshot({ path: path.join(output, '01-continuous.png') });
  });
  await check('主工作区支持单张和多张拖拽排序，撤销重做恢复准确顺序', async () => {
    await page.click('[data-collection-mode="grid"]');
    await card(3).dragTo(card(0), { targetPosition: { x: 8, y: 80 } });
    const [a, b, c, d] = starting.pages.map(p => p.id); assert.deepEqual(await ids(), [d, a, b, c]);
    await page.check('#select-all'); await page.uncheck('#select-all'); await card(1).locator('input').check(); await card(2).locator('input').check();
    const target = await card(3).boundingBox(); await card(1).dragTo(card(3), { targetPosition: { x: target.width - 8, y: 80 } });
    ordered = [d, c, a, b]; assert.deepEqual(await ids(), ordered);
    await page.click('#collection-undo'); assert.deepEqual(await ids(), [d, a, b, c]); await page.click('#collection-redo'); assert.deepEqual(await ids(), ordered);
    await page.locator('#toast').evaluate(e => { e.hidden = true; }); await page.screenshot({ path: path.join(output, '02-ordering.png') });
  });
  await check('连续预览也可拖动排序，切换单图后编辑文字和裁剪不会丢失整组设置', async () => {
    await page.click('[data-collection-mode="flow"]'); await page.check('#select-all'); await page.uncheck('#select-all');
    // First two cards are reachable by native dragging and scroll into view.
    await card(0).scrollIntoViewIfNeeded(); const source = await card(0).boundingBox();
    await page.mouse.move(source.x + 150, source.y + 80); await page.mouse.down(); await page.mouse.move(source.x + 160, source.y + 90, { steps: 3 });
    await card(1).evaluate(e => e.scrollIntoView({ block: 'end' })); const target = await card(1).boundingBox();
    await page.mouse.move(target.x + 150, target.y + target.height - 30, { steps: 12 }); await page.mouse.up();
    const after = await ids(); assert.notDeepEqual(after, ordered); await page.click('#collection-undo'); assert.deepEqual(await ids(), ordered);
    await page.click('[data-collection-mode="grid"]'); await card(0).locator('.collection-edit').click(); assert.equal(await page.locator('.workspace').getAttribute('data-mode'), 'edit');
    await page.click('[data-add="text"]'); await page.fill('#element-text', '整组排版，也能保留单图标注'); await number('font-size', 28);
    await page.click('[data-inspector="image"]'); await page.selectOption('#crop-ratio', '1'); await page.waitForFunction(() => document.querySelector('#processing').hidden);
    await page.click('#view-collection'); const doc = await saved(); assert.deepEqual(doc.pages.map(p => p.id), ordered); assert.equal(doc.export.coverHeight, 180); assert.equal(doc.export.separatorColor, '#d7ddcb'); assert.equal(doc.pages[0].crop.w < 1, true);
    assert(doc.layouts[doc.pages[0].layoutId].elements.some(e => e.text === '整组排版，也能保留单图标注'));
    await card(1).locator('.collection-picture').dblclick(); assert.equal(await page.locator('.workspace').getAttribute('data-mode'), 'edit');
    await page.click('#view-collection'); await card(0).click();
  });
  await check('保存重开保留标题、横条、顺序、原图和单图编辑', async () => {
    await page.fill('#project-name', '统一宽度 · 连续编排示例'); const before = await saved();
    await page.click('#new-project'); await page.click('#open-project'); await page.waitForSelector('#collection-view:not([hidden])'); assert.deepEqual(await saved(), before);
    await fs.copyFile(files.tare, path.join(output, '统一宽度编排示例.tare'));
  });
  await check('PDF 图片像素宽度真正一致，标题和横条尺寸正确；PNG 也遵守统一宽度', async () => {
    await page.click('#collection-export'); await page.waitForSelector('#export-collection-preview:not([hidden])'); assert.equal(await page.inputValue('#export-width'), '1375');
    await page.click('#export-pdf'); await page.waitForFunction(() => document.querySelector('#export-progress').textContent.startsWith('已导出'), undefined, { timeout: 60000 });
    const pdf = await PDFDocument.load(await fs.readFile(files.pdf)); assert.equal(pdf.getPageCount(), 8);
    const expectedHeights = [180, 1375, 48, 1375, 48, Math.round(1375 * 900 / 1600), 48, Math.round(1375 * 1400 / 900)];
    pdf.getPages().forEach((p, i) => { assert.equal(p.getWidth(), 720); assert(Math.abs(p.getHeight() - 720 * expectedHeights[i] / 1375) < 1e-6); });
    const imageWidths = pdf.context.enumerateIndirectObjects().filter(([, o]) => o.dict?.get(PDFName.of('Subtype'))?.toString() === '/Image').map(([, o]) => o.dict.get(PDFName.of('Width')).asNumber());
    assert(imageWidths.length >= 5); assert(imageWidths.every(w => w === 1375), `实际嵌入图像宽度：${imageWidths}`);
    await fs.copyFile(files.pdf, path.join(output, '批量编排预览.pdf'));
    await page.click('#export-png'); await page.waitForFunction(() => document.querySelector('#export-progress').textContent.includes('.png'), undefined, { timeout: 60000 });
    const png = await fs.readFile(files.png); assert.equal(png.readUInt32BE(16), 1375); assert.equal(png.readUInt32BE(20), 1375);
    await page.click('#export-dialog .dialog-close');
  });
  await check('仅导出勾选图片时，标题在前且不出现多余横条', async () => {
    await page.check('#select-all'); await page.uncheck('#select-all'); await page.locator('.page-card').nth(1).locator('input').check();
    await page.click('#export-open'); await page.selectOption('#export-scope', 'selected');
    assert.equal(await page.locator('#export-collection-preview [data-part="image"]').count(), 1); assert.equal(await page.locator('#export-collection-preview [data-part="separator"]').count(), 0);
    await page.click('#export-pdf'); await page.waitForFunction(() => document.querySelector('#export-progress').textContent.startsWith('已导出'), undefined, { timeout: 60000 }); assert.equal((await PDFDocument.load(await fs.readFile(files.pdf))).getPageCount(), 2);
    await page.click('#export-dialog .dialog-close');
  });
  await check('旧版作品可打开并保留旧清晰度语义，小窗口能操作整组设置', async () => {
    const legacy = await saved(); legacy.export = { width: 1600, scope: 'all', cover: true, title: '旧版作品', separator: true, background: '#ffffff' };
    await page.click('#new-project'); await fs.writeFile(files.tare, JSON.stringify(legacy)); await page.click('#open-project'); await page.waitForSelector('#collection-view:not([hidden])');
    assert.equal(await page.inputValue('#collection-sizing'), 'long-edge'); assert.equal(await page.inputValue('#collection-coverHeight'), '1120'); assert.equal(await page.inputValue('#collection-separatorHeight'), '160');
    await page.selectOption('#collection-sizing', 'width'); await page.click('[data-output-width="1080"]'); assert.equal((await saved()).export.width, 1080);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1180, 780)); await page.click('[data-collection-mode="grid"]'); await number('collection-separatorHeight', 36); assert.equal((await saved()).export.separatorHeight, 36);
    await page.locator('.inspector-scroll').evaluate(e => { e.scrollTop = 0; }); await page.screenshot({ path: path.join(output, '03-small-window.png') }); assert.deepEqual(errors, []);
  });
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ status: 'passed', checks, errors }, null, 2)); await fs.writeFile(path.join(root, 'latest-collection.txt'), output + '\n'); console.log('Artifacts:', output);
})().catch(async error => { console.error(error); if (page) await page.screenshot({ path: path.join(output || root, 'failure.png') }).catch(() => {}); process.exitCode = 1; }).finally(async () => { if (app) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.removeAllListeners('close'))).catch(() => {}); await app.close(); } });
