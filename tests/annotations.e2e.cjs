const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const repo = path.resolve(__dirname, '..');
const root = process.env.TARE_TEST_OUTPUT || path.join(repo, 'test-results');
let app, page, output;
const errors = [], checks = [];
async function check(name, run) { await run(); checks.push(name); console.log('✓', name); }
(async () => {
  await fs.mkdir(root, { recursive: true }); output = await fs.mkdtemp(path.join(root, 'annotations-'));
  const projectFile = path.join(output, '标注测试.tare'), pdfFile = path.join(output, '标注预览.pdf'), pngFile = path.join(output, '标注预览.png');
  const launch = { executablePath: process.env.TAREPDF_EXECUTABLE || require('electron'), args: [...(process.env.TAREPDF_EXECUTABLE ? [] : [repo]), ...(process.env.TARE_E2E_NO_SANDBOX ? ['--no-sandbox', '--disable-gpu'] : [])], env: { ...process.env, TARE_STUDIO_PROFILE: path.join(output, 'profile'), XDG_CONFIG_HOME: path.join(output, 'config') }, timeout: 60000 };
  app = await _electron.launch(launch);
  await app.evaluate(({ BrowserWindow, dialog }, paths) => {
    BrowserWindow.getAllWindows()[0].setSize(1500, 1000);
    dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: paths[options.filters[0].extensions[0]] });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.tare] });
  }, { tare: projectFile, pdf: pdfFile, png: pngFile });
  page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('dialog', d => d.accept());
  await page.waitForSelector('body[data-ready="true"]');
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function waitImage() { await page.waitForFunction(() => document.querySelector('#processing').hidden); await frame(); }
  async function saved() { await page.click('#save-project'); await page.waitForFunction(() => !document.querySelector('#save-project').disabled); return JSON.parse(await fs.readFile(projectFile, 'utf8')); }
  async function number(id, value) { await page.fill(`#${id}`, String(value)); await page.locator(`#${id}`).press('Tab'); await frame(); }
  const firstElements = doc => doc.layouts[doc.pages[0].layoutId].elements;
  const currentId = async () => page.locator('.layer-item.active').getAttribute('data-element-id');
  async function selectedElement() { const id = await currentId(); return firstElements(await saved()).find(e => e.id === id); }
  async function select(id) { await page.locator(`.layer-item[data-element-id="${id}"]`).click(); await frame(); }
  async function paper() { const box = await page.locator('#canvas-host').boundingBox(), zoom = Math.min((box.width - 90) / 1000, (box.height - 80) / 687.5, 1.5); return { x: box.x + (box.width - 1000 * zoom) / 2, y: box.y + (box.height - 687.5 * zoom) / 2, w: 1000 * zoom, h: 687.5 * zoom, zoom }; }
  await check('六种标注模板和产品示例可离线使用，三款配色共享说明', async () => {
    await page.click('#annotation-open'); assert.equal(await page.locator('.annotation-card').count(), 6);
    assert(await page.locator('[data-annotation="elbow"]').isDisabled());
    await page.click('#annotation-demo'); await page.waitForFunction(() => document.querySelectorAll('.page-card').length === 3); await waitImage();
    const doc = await saved(); assert.equal(new Set(doc.pages.map(p => p.layoutId)).size, 1); assert.equal(firstElements(doc).filter(e => e.type === 'annotation').length, 4);
    await fs.copyFile(projectFile, path.join(output, '弧光·可编辑标注示例.tare'));
    await page.locator('#toast').evaluate(e => { e.hidden = true; }); await page.screenshot({ path: path.join(output, '01-annotation-editor.png') });
    await page.click('#export-open'); await page.waitForFunction(() => document.querySelector('#export-preview-image').src.startsWith('data:'));
    await page.click('#export-pdf'); await page.waitForFunction(() => document.querySelector('#export-progress').textContent.startsWith('已导出'), undefined, { timeout: 60000 });
    assert.equal((await PDFDocument.load(await fs.readFile(pdfFile))).getPageCount(), 3);
    await page.click('#export-png'); await page.waitForFunction(() => document.querySelector('#export-progress').textContent.includes('.png'), undefined, { timeout: 60000 });
    const png = await fs.readFile(pngFile); assert.equal(png.readUInt32BE(16), 1600); assert.equal(png.readUInt32BE(20), 1100);
    await page.click('#export-dialog .dialog-close');
  });
  await check('点击所有模板生成独立完整对象，换样式保留文字和共享关系', async () => {
    for (const preset of ['straight', 'arrow', 'elbow', 'right-angle', 'dimension', 'numbered']) {
      await page.click(`[data-annotation="${preset}"]`); const e = await selectedElement(); assert.equal(e.annotation.preset, preset); assert.equal(e.type, 'annotation');
      assert.equal(await page.locator('#annotation-tail-field').isVisible(), ['elbow', 'right-angle', 'numbered'].includes(preset));
      await page.click('#delete-element');
    }
    await page.click('[data-annotation="elbow"]'); await page.fill('#element-text', '一个完整的标注');
    const before = await selectedElement(); await page.selectOption('#annotation-preset', 'straight'); const after = await selectedElement();
    assert.equal(after.id, before.id); assert.equal(after.text, before.text); assert.equal(after.annotation.kind, 'line');
    await page.selectOption('#annotation-preset', 'elbow');
  });
  let targetId;
  await check('分别调角度和两段长度，快捷角度、四向延伸、端点和文字位置生效', async () => {
    targetId = await currentId(); await number('annotation-angle', 38); await number('annotation-length', 210); await number('annotation-tailLength', 260);
    let e = await selectedElement(); assert.equal(e.annotation.angle, 38); assert.equal(e.annotation.length, 0.21); assert.equal(e.annotation.tailLength, 0.26);
    await page.click('[data-annotation-angle="60"]'); e = await selectedElement(); assert.equal(e.annotation.angle, 60); assert.equal(e.annotation.length, 0.21);
    for (const direction of ['up-left', 'down-left', 'down-right', 'up-right']) { await page.selectOption('#annotation-direction', direction); assert.equal((await selectedElement()).annotation.direction, direction); }
    await page.locator('.annotation-details summary').click(); await page.selectOption('#annotation-startCap', 'number'); await page.fill('#annotation-badgeText', 'A2'); await page.selectOption('#annotation-endCap', 'bar'); await page.selectOption('#annotation-dash', 'dashed');
    await number('annotation-capSize', 18); e = await selectedElement(); assert.equal(e.annotation.badgeText, 'A2'); assert.equal(e.annotation.endCap, 'bar'); assert.equal(e.annotation.dash, 'dashed');
    const pictures = new Set();
    for (const position of ['above', 'below', 'end', 'inline']) {
      await page.selectOption('#annotation-labelPosition', position); await frame();
      assert.equal((await selectedElement()).annotation.labelPosition, position);
      pictures.add(await page.locator('#canvas-host canvas').first().evaluate(c => c.toDataURL()));
    }
    assert.equal(pictures.size, 4, '文字位置必须实际改变画布');
    await page.uncheck('#annotation-showLabel'); assert.equal(await page.locator('#text-fields').isVisible(), false);
    await page.check('#annotation-showLabel'); await page.selectOption('#annotation-labelPosition', 'above');
    await number('annotation-labelWidth', 190); await number('annotation-labelGap', 20);
    await page.fill('#element-text', '独立调节斜段与横段\n支持多行说明'); e = await selectedElement(); assert(e.text.includes('\n'));
  });
  await check('跨页修改同步，解除一个标注后独立，撤销重做保留其余标注同步', async () => {
    await page.click('[data-sidebar="pages"]'); await page.locator('.page-card').nth(1).click(); await select(targetId); await page.click('#detach-element');
    await number('annotation-angle', 15); let doc = await saved(), a = firstElements(doc).find(e => e.id === targetId), b = doc.layouts[doc.pages[1].layoutId].elements.find(e => e.id === targetId);
    assert.equal(a.annotation.angle, 60); assert.equal(b.annotation.angle, 15);
    await page.click('#undo'); await page.click('#undo'); doc = await saved(); assert.equal(doc.pages[0].layoutId, doc.pages[1].layoutId);
    await page.click('#redo'); await page.click('#redo'); doc = await saved(); assert.notEqual(doc.pages[0].layoutId, doc.pages[1].layoutId);
    await page.locator('.page-card').nth(0).click(); await select(targetId); await page.click('#layer-lock'); assert(await page.locator('#annotation-angle').isDisabled()); await page.click('#layer-lock');
  });
  await check('原生拖放模板按画布落点放置，缩放平移后位置仍然正确，画布外不添加', async () => {
    await page.click('[data-sidebar="annotations"]'); await page.click('#zoom-fit'); await frame(); let box = await paper();
    const card = page.locator('[data-annotation="straight"]'), host = page.locator('#canvas-host'), hostBox = await host.boundingBox();
    await card.dragTo(host, { targetPosition: { x: box.x + box.w * 0.22 - hostBox.x, y: box.y + box.h * 0.45 - hostBox.y } });
    let e = await selectedElement(); assert.equal(e.annotation.preset, 'straight'); assert(Math.abs(e.x - 0.22) < 0.004); assert(Math.abs(e.y - 0.45) < 0.004);
    await page.click('#zoom-in'); await frame();
    const newZoom = box.zoom * 1.2, centerX = hostBox.x + hostBox.width / 2, centerY = hostBox.y + hostBox.height / 2;
    await page.mouse.move(centerX, centerY); await page.mouse.wheel(37, 28); await page.waitForTimeout(200);
    // After zoom centers the paper, wheel pan offsets it by (-37, -28).
    const px = centerX - 500 * newZoom - 37, py = centerY - 343.75 * newZoom - 28;
    const transfer = await page.evaluateHandle(() => { const d = new DataTransfer(); d.setData('application/x-tare-annotation', 'elbow'); return d; });
    await host.dispatchEvent('drop', { dataTransfer: transfer, clientX: px + 0.4 * 1000 * newZoom, clientY: py + 0.55 * 687.5 * newZoom });
    e = await selectedElement(); assert(Math.abs(e.x - 0.4) < 0.004); assert(Math.abs(e.y - 0.55) < 0.004);
    const count = firstElements(await saved()).length;
    await host.dispatchEvent('drop', { dataTransfer: transfer, clientX: hostBox.x - 50, clientY: hostBox.y - 50 });
    assert.equal(firstElements(await saved()).length, count); await transfer.dispose(); await page.click('#zoom-fit'); await frame();
    targetId = e.id;
  });
  await check('整体拖动和等比例缩放，双击修改内置文字，保存后重开一致', async () => {
    await select(targetId); await page.selectOption('#annotation-preset', 'elbow'); await page.selectOption('#annotation-startCap', 'dot'); await page.selectOption('#annotation-endCap', 'none'); await page.selectOption('#annotation-dash', 'solid');
    await number('annotation-angle', 45); await number('annotation-length', 160); await number('annotation-tailLength', 200); await number('annotation-capSize', 9);
    await number('annotation-labelWidth', 200); await number('annotation-labelGap', 12); await number('font-size', 24); await page.fill('#element-text', '双击这里'); await saved();
    await page.click('#zoom-fit'); await frame(); let e = await selectedElement(), box = await paper();
    const labelX = box.x + (e.x + Math.SQRT1_2 * 0.16 + 0.1) * box.w;
    const labelY = box.y + e.y * box.h - (Math.SQRT1_2 * 160 + 12 + 23.52) * box.zoom;
    await page.mouse.dblclick(labelX, labelY); await page.waitForSelector('.canvas-text-editor'); await page.fill('.canvas-text-editor', '双击编辑完成'); await page.keyboard.press('Control+Enter'); e = await selectedElement(); assert.equal(e.text, '双击编辑完成');
    // Bottom-right handle = tail end + half stroke, lowest marker edge, plus 2 screen px padding.
    let hx = box.x + (e.x + Math.SQRT1_2 * 0.16 + 0.2 + e.strokeWidth / 2) * box.w + 2;
    let hy = box.y + e.y * box.h + (4.5 + e.strokeWidth * 500) * box.zoom + 2;
    const before = e;
    await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(hx + 36, hy + 20, { steps: 12 }); await page.mouse.up(); await frame();
    e = await selectedElement(); assert(e.annotation.length > before.annotation.length, '角点缩放应更新参数');
    assert(Math.abs(e.annotation.tailLength / before.annotation.tailLength - e.fontSize / before.fontSize) < 1e-8); assert.equal(e.annotation.angle, 45);
    // Drag using the target dot, with text staying attached to the group.
    const x = box.x + e.x * box.w, y = box.y + e.y * box.h;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 37, y + 24, { steps: 12 }); await page.mouse.up(); await frame();
    const moved = await selectedElement(); assert(moved.x < e.x - 0.02); assert.deepEqual(moved.annotation, e.annotation);
    const doc = await saved(); await page.click('#new-project'); await page.waitForSelector('#empty-state:not([hidden])'); await page.click('#open-project'); await page.waitForSelector('.page-card', { state: 'attached' }); await waitImage(); assert.deepEqual(await saved(), doc);
  });
  await check('小窗口中的标注库和参数仍可滚动访问，无页面脚本错误', async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1180, 780)); await page.click('[data-sidebar="annotations"]'); await page.click('[data-annotation="numbered"]'); await page.fill('#element-text', '小窗口也能编辑'); await saved();
    assert(await page.locator('#element-text').isVisible()); await page.screenshot({ path: path.join(output, '02-small-window.png') }); assert.deepEqual(errors, []);
  });
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ status: 'passed', checks, errors }, null, 2)); await fs.writeFile(path.join(root, 'latest-annotations.txt'), output + '\n'); console.log('Artifacts:', output);
})().catch(async error => { console.error(error); if (page) await page.screenshot({ path: path.join(output || root, 'failure.png') }).catch(() => {}); process.exitCode = 1; }).finally(async () => { if (app) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.removeAllListeners('close'))).catch(() => {}); await app.close(); } });
