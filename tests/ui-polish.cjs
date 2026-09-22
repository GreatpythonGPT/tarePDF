'use strict';
// Exercise layout with real renderer input. No test hooks are added to the app.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const output = path.join(__dirname, '..', 'test-results');
const results = [];
let app, page, directory;
async function scenario(name, run) {
  try { await run(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', error: error.stack }); throw error; }
}
async function main() {
  await fs.mkdir(output, { recursive: true });
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tare-ui-'));
  const args = [path.join(__dirname, 'launch.cjs')];
  if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox');
  app = await _electron.launch({ args, env: { ...process.env, TARE_TEST_DIR: directory }, timeout: 30000 });
  page = await app.firstWindow(); page.setDefaultTimeout(15000);
  await page.waitForFunction(() => !document.getElementById('work-pane').inert);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 680));
  await scenario('v2 stylesheet is applied and controls remain on screen at minimum size', async () => {
    assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).display), 'flex');
    assert.equal(await page.locator('#image-grid').evaluate(node => getComputedStyle(node).display), 'grid');
    assert.equal(await page.locator('#view-settings').isVisible(), false);
    for (const selector of ['#import-button', '#export-button', '#preview-button']) {
      assert.equal(await page.locator(selector).evaluate(node => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
      }), true, selector);
    }
  });
  await scenario('many import failures stay scrollable without displacing the image workspace', async () => {
    const invalid = Array.from({ length: 32 }, (_, i) => ({
      name: `无法读取的图片-${i + 1}-${'x'.repeat(100)}.png`,
      mimeType: 'image/png', buffer: Buffer.from('invalid-image')
    }));
    await page.locator('#image-input').setInputFiles(invalid);
    await page.waitForFunction(() => !document.body.classList.contains('busy') && document.getElementById('notice-text').textContent.includes('32'));
    const layout = await page.evaluate(() => {
      const notice = document.getElementById('notice-text');
      const grid = document.getElementById('grid-scroll').getBoundingClientRect();
      return { noticeHeight: notice.clientHeight, overflowing: notice.scrollHeight > notice.clientHeight,
        workspaceHeight: grid.height, horizontal: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.ok(layout.noticeHeight <= 140, JSON.stringify(layout));
    assert.ok(layout.overflowing, 'all failure details must remain accessible by scrolling');
    assert.ok(layout.workspaceHeight >= 120, JSON.stringify(layout));
    assert.equal(layout.horizontal, true);
    await page.screenshot({ path: path.join(output, 'import-errors-minimum.png') });
    await page.locator('#notice-close').click();
  });
  await scenario('keyboard selection and removal undo still work after an import failure', async () => {
    const buffer = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await page.locator('#image-input').setInputFiles({ name: '键盘操作.png', mimeType: 'image/png', buffer });
    await page.waitForFunction(() => !document.body.classList.contains('busy') && document.querySelectorAll('.image-card').length === 1);
    const card = page.locator('.image-card');
    await card.focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('.image-card.selected').count(), 0);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.image-card.selected').count(), 1);
    await page.keyboard.press('Delete');
    assert.equal(await card.count(), 0);
    await page.keyboard.press('Control+z');
    assert.equal(await card.count(), 1);
  });
  await scenario('minimum-size settings keep width presets and long configuration names contained', async () => {
    await page.locator('.nav-button[data-view=settings]').click();
    await page.locator('#preset-name').fill('W'.repeat(50));
    await page.locator('#save-preset').click();
    await page.waitForFunction(() => document.querySelectorAll('.preset-row').length === 1);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.settings-card')].some(card => card.scrollWidth > card.clientWidth + 1));
    assert.equal(overflow, false);
    await page.locator('.width-presets button[data-width="3000"]').click();
    assert.equal(await page.locator('#setting-outputWidth').inputValue(), '3000');
    assert.equal(await page.locator('.width-presets button[data-width="3000"]').evaluate(node => node.classList.contains('active')), true);
    await page.screenshot({ path: path.join(output, 'polished-settings-minimum.png') });
  });
}
main().catch(async error => {
  console.error(error); process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'ui-failure.png') }).catch(() => {});
}).finally(async () => {
  if (app) {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }).catch(() => {});
    await app.close().catch(() => {});
  }
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'ui-polish-results.json'), JSON.stringify({ platform: process.platform, results }, null, 2));
  if (directory) await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
});
