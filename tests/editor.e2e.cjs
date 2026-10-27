const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const repo = path.resolve(__dirname, '..');
const outputRoot = process.env.TARE_TEST_OUTPUT || path.join(repo, 'test-results');
let app, page;
const errors = [], checks = [];
async function check(name, run) { await run(); checks.push(name); console.log('✓', name); }
(async () => {
 await fs.mkdir(outputRoot, {recursive:true});
 const output = await fs.mkdtemp(path.join(outputRoot,'run-'));
 const projectFile = path.join(output,'shared.tare'), pdfFile=path.join(output,'collection.pdf'), pngFile=path.join(output,'page.png');
 const launchOptions={executablePath:process.env.TAREPDF_EXECUTABLE||require('electron'), args:[...(process.env.TAREPDF_EXECUTABLE?[]:[repo]),...(process.env.TARE_E2E_NO_SANDBOX?['--no-sandbox','--disable-gpu']:[])],env:{...process.env,TARE_STUDIO_PROFILE:path.join(output,'profile'),XDG_CONFIG_HOME:path.join(output,'config')},timeout:60000};
 app=await _electron.launch(launchOptions);
 await app.evaluate(({BrowserWindow,dialog},{projectFile,pdfFile,pngFile})=>{
   BrowserWindow.getAllWindows()[0].setSize(1500,960);
   dialog.showSaveDialog=async(_window, options)=>({canceled:false,filePath:options.filters[0].extensions[0]==='tare'?projectFile:options.filters[0].extensions[0]==='pdf'?pdfFile:pngFile});
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[projectFile]});
 },{projectFile,pdfFile,pngFile});
 page=await app.firstWindow();
 page.on('pageerror', e=>errors.push(e.message));
 page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('dialog', dialog=>dialog.accept());
 await page.waitForSelector('body[data-ready="true"]');
 async function waitImage(){await page.waitForFunction(()=>document.querySelector('#processing').hidden);}
 async function saved(){await page.click('#save-project');await page.waitForFunction(()=>document.querySelector('#save-project').disabled===false);return JSON.parse(await fs.readFile(projectFile,'utf8'));}
 const pageCard = index=>page.locator('.page-card').nth(index);
 await check('离线启动，字体与画布正常加载',async()=>{await page.screenshot({path:path.join(output,'01-welcome.png')});assert(await page.locator('#empty-state').isVisible());assert(await page.evaluate(()=>document.fonts.check('16px "Noto Sans SC"')));});
 await check('示例三页共用排版，预览生成',async()=>{await page.click('#demo-load');await page.waitForSelector('.page-card');await waitImage();assert.equal(await page.locator('.page-card').count(),3);assert.equal(await page.locator('.linked-label').count(),3);});
 let initial=await saved();const originalSources=initial.pages.map(p=>p.src);
 await check('共享文字修改后，三页持久化为同一布局',async()=>{
   await page.locator('.layer-item').filter({hasText:'让灵感，有处安放'}).click();
   await page.fill('#element-text','光影之间，自有答案');
   const doc=await saved();assert.equal(new Set(doc.pages.map(p=>p.layoutId)).size,1);assert(doc.layouts[doc.pages[0].layoutId].elements.some(e=>e.text==='光影之间，自有答案'));
   await pageCard(1).click();await page.locator('.layer-item').filter({hasText:'光影之间，自有答案'}).click();assert.equal(await page.inputValue('#element-text'),'光影之间，自有答案');
 });
 await check('文字输入中的 Backspace 不会删除页面或元素',async()=>{const before=await page.locator('.layer-item').count();await page.focus('#element-text');await page.keyboard.press('End');await page.keyboard.press('Backspace');assert.equal(await page.locator('.page-card').count(),3);assert.equal(await page.locator('.layer-item').count(),before);await page.fill('#element-text','光影之间，自有答案');await saved();});
 await check('解除共享后单独编辑；撤销重做恢复正确关系',async()=>{
   await page.click('#detach-page');await page.locator('.layer-item').filter({hasText:'光影之间，自有答案'}).click();await page.fill('#element-text','第二页的独立标题');await saved();
   let doc=await saved();assert.notEqual(doc.pages[0].layoutId,doc.pages[1].layoutId);assert(doc.layouts[doc.pages[0].layoutId].elements.some(e=>e.text==='光影之间，自有答案'));
   await page.click('#undo');assert(await page.locator('.layer-item').filter({hasText:'光影之间，自有答案'}).count());await page.click('#undo');doc=await saved();assert.equal(doc.pages[0].layoutId,doc.pages[1].layoutId);
   await page.click('#redo');await page.click('#redo');doc=await saved();assert(doc.layouts[doc.pages[1].layoutId].elements.some(e=>e.text==='第二页的独立标题'));
 });
 await check('图片调整后迅速切页，不污染另一页；原图始终不变',async()=>{
   await pageCard(0).click();await page.click('[data-inspector="image"]');
   await page.locator('#adjust-brightness').evaluate(e=>{e.value='28';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
   await pageCard(2).click();await waitImage();assert.equal(await page.inputValue('#adjust-brightness'),'0');
   const doc=await saved();assert.equal(doc.pages[0].adjustments.brightness,28);assert.equal(doc.pages[2].adjustments.brightness,0);assert.deepEqual(doc.pages.map(p=>p.src),originalSources);
   await pageCard(0).click();await waitImage();assert.equal(await page.inputValue('#adjust-brightness'),'28');
 });
 await check('真实画布拖动、缩放、双击输入、锁定与图层排序',async()=>{
   await page.click('[data-inspector="layout"]');await page.click('[data-add="text"]');await page.fill('#element-text','可直接编辑的画布文字');await saved();
   const box=await page.locator('#canvas-host').boundingBox();const zoom=Math.min((box.width-90)/1000,(box.height-80)/(1000*1100/1600),1.5);
   const paperW=1000*zoom,paperH=1000*1100/1600*zoom,ox=box.x+(box.width-paperW)/2,oy=box.y+(box.height-paperH)/2;
   const x=ox+paperW*.22,y=oy+paperH*.19;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+55,y+40,{steps:12});await page.mouse.up();
   let doc=await saved();let el=doc.layouts[doc.pages[0].layoutId].elements.find(e=>e.text==='可直接编辑的画布文字');assert(el.x>.14);assert(el.y>.17);
   await page.mouse.dblclick(x+55,y+40);await page.waitForSelector('.canvas-text-editor');await page.fill('.canvas-text-editor','双击编辑已经完成');await page.keyboard.press('Control+Enter');
   doc=await saved();el=doc.layouts[doc.pages[0].layoutId].elements.find(e=>e.text==='双击编辑已经完成');assert(el);
   const anchorX=ox+(el.x+el.w)*paperW+2,anchorY=oy+el.y*paperH-2,oldWidth=el.w;
   await page.mouse.move(anchorX,anchorY);await page.mouse.down();await page.mouse.move(anchorX+42,anchorY-15,{steps:10});await page.mouse.up();
   doc=await saved();el=doc.layouts[doc.pages[0].layoutId].elements.find(e=>e.text==='双击编辑已经完成');assert(el.w>oldWidth);
   await page.click('#layer-lock');assert((await page.locator('#element-title').textContent()).includes('锁定'));await page.click('#layer-lock');
   await page.click('#layer-down');await page.click('#duplicate-element');assert.equal(await page.locator('.layer-item').filter({hasText:'双击编辑已经完成'}).count(),2);await page.click('#delete-element');
 });
 await check('裁剪、旋转、恢复窗口尺寸不会丢失图层',async()=>{
   await page.click('[data-inspector="image"]');await page.selectOption('#crop-ratio','1');await waitImage();assert((await page.locator('#page-info').textContent()).includes('1100 × 1100'));
   await page.click('#rotate-image');await waitImage();assert((await page.locator('#page-info').textContent()).includes('1100 × 1600'));
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1180,780));await page.waitForTimeout(200);assert(await page.locator('#canvas-host canvas').count());
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1500,960));await page.click('#undo');await page.click('#undo');await waitImage();
 });
 await check('字面文件名和文字不执行脚本，IPC 不暴露通用读写',async()=>{
   await page.fill('#project-name','<img src=x onerror=window.hacked=1>');await saved();assert.equal(await page.evaluate(()=>window.hacked),undefined);assert.equal(await page.evaluate(()=>window.electronAPI),undefined);
   assert.equal(await page.evaluate(async()=>{try{await window.studio.saveProject('{}');return false;}catch{return true;}}),true);
   await page.fill('#project-name','光与空间 · 设计作品集');await saved();
 });
 await check('同一渲染器输出 PNG 和带中文封面的多页 PDF',async()=>{
   await page.click('[data-inspector="layout"]');await page.locator('.layer-item').filter({hasText:'光影之间，自有答案'}).click();await page.waitForTimeout(500);await page.screenshot({path:path.join(output,'02-editor.png')});
   await page.click('#export-open');await page.waitForFunction(()=>document.querySelector('#export-preview-image').src.startsWith('data:'));
   await page.check('#export-cover');await page.fill('#export-title','光与空间\n我的设计作品集');await page.check('#export-separator');await page.selectOption('#export-width','1600');
   await page.screenshot({path:path.join(output,'03-export.png')});await page.click('#export-pdf');await page.waitForFunction(()=>document.querySelector('#export-progress').textContent.startsWith('已导出'),undefined,{timeout:60000});
   const bytes=await fs.readFile(pdfFile),pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),6);assert.deepEqual(pdf.getPages().map(p=>[p.getWidth(),p.getHeight()]),[[720,225],[720,495],[720,45],[720,495],[720,45],[720,495]]);
   await page.click('#export-png');await page.waitForFunction(()=>document.querySelector('#export-progress').textContent.includes('.png'),undefined,{timeout:60000});const png=await fs.readFile(pngFile);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1600);assert.equal(png.readUInt32BE(20),1100);
 });
 await check('导出取消不报成功，快速双击不重复导出',async()=>{
   await app.evaluate(({dialog})=>{globalThis.exportsAttempted=0;dialog.showSaveDialog=async()=>{globalThis.exportsAttempted++;return{canceled:true};};});
   await page.click('#export-pdf');await page.evaluate(()=>document.querySelector('#export-pdf').click());await page.waitForFunction(()=>document.querySelector('#export-progress').textContent.startsWith('已取消'),undefined,{timeout:60000});assert.equal(await app.evaluate(()=>globalThis.exportsAttempted),1);
   await page.click('#export-dialog .dialog-close');
 });
 await check('保存后重新打开，原图、共享关系、元素和调色都保留',async()=>{
   const before=await saved();await page.click('#new-project');await page.waitForSelector('#empty-state:not([hidden])');await page.click('#open-project');await page.waitForSelector('.page-card');await waitImage();
   // Restore the save dialog after the cancellation check.
   await app.evaluate(({dialog},projectFile)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:projectFile});},projectFile);
   const after=await saved();assert.deepEqual(after,before);
 });
 await check('仅共享选定元素，独立页面原有标题保留且修改同步',async()=>{
   await pageCard(0).click();await page.click('#view-edit');await page.click('[data-add="arrow"]');await page.click('#select-all');if(!(await page.locator('#select-all').isChecked()))await page.click('#select-all');
   await page.click('#share-element');await page.fill('#element-rotation','25');await page.locator('#element-rotation').press('Tab');
   const doc=await saved();const [a,b]=doc.pages;assert.notEqual(a.layoutId,b.layoutId);const shared=doc.layouts[a.layoutId].elements.find(e=>e.type==='arrow'&&e.sharedId);assert(shared);
   assert.equal(doc.layouts[b.layoutId].elements.find(e=>e.sharedId===shared.sharedId).rotation,25);assert(doc.layouts[b.layoutId].elements.some(e=>e.text==='第二页的独立标题'));
   await pageCard(1).click();await page.locator('.layer-item').filter({hasText:'箭头'}).click();await page.click('#detach-element');await page.fill('#element-rotation','40');await page.locator('#element-rotation').press('Tab');
   const detached=await saved();assert.equal(detached.layouts[detached.pages[0].layoutId].elements.find(e=>e.sharedId===shared.sharedId).rotation,25);
 });
 await check('导入真实文件、透明贴图、批量选择和排序',async()=>{
   const fixtures=await page.evaluate(()=>[ [160,80],[80,160] ].map(([w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#cfaa77';ctx.fillRect(10,10,w-20,h-20);return c.toDataURL('image/png').split(',')[1];}));
   const files=[path.join(output,'横向.png'),path.join(output,'竖向.png')];for(let i=0;i<2;i++)await fs.writeFile(files[i],Buffer.from(fixtures[i],'base64'));
   await page.setInputFiles('#image-input',files);await page.waitForFunction(()=>document.querySelectorAll('.page-card').length===5);await waitImage();
   let doc=await saved();assert.deepEqual(doc.pages.slice(-2).map(p=>[p.width,p.height]),[[160,80],[80,160]]);
   await page.click('#view-edit');await page.setInputFiles('#overlay-input',files[1]);await page.waitForFunction(()=>document.querySelector('#element-title').textContent.includes('贴图'));
   doc=await saved();assert(doc.layouts[doc.pages[3].layoutId].elements.some(e=>e.type==='image'));
   const movedIds=doc.pages.slice(-2).map(p=>p.id);await pageCard(4).locator('input[type=checkbox]').check();await pageCard(3).scrollIntoViewIfNeeded();let sourceBox=await pageCard(3).boundingBox();await page.mouse.move(sourceBox.x+80,sourceBox.y+40);await page.mouse.down();await page.mouse.move(sourceBox.x+90,sourceBox.y+50,{steps:3});await pageCard(0).evaluate(e=>e.scrollIntoView({block:'start'}));const targetBox=await pageCard(0).boundingBox();await page.mouse.move(targetBox.x+80,targetBox.y+10,{steps:10});await page.mouse.up();doc=await saved();assert.deepEqual(doc.pages.slice(0,2).map(p=>p.id),movedIds);
   await page.click('#undo');doc=await saved();assert.deepEqual(doc.pages.slice(-2).map(p=>p.id),movedIds);
 });
 await check('关闭再启动，恢复未手动保存的编辑和共享关系',async()=>{
   await page.fill('#project-name','自动恢复验证 · 光与空间');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已自动保存'));
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.removeAllListeners('close')));await app.close();app=await _electron.launch(launchOptions);page=await app.firstWindow();
   page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('body[data-ready="true"]');assert.equal(await page.inputValue('#project-name'),'自动恢复验证 · 光与空间');assert.equal(await page.locator('.page-card').count(),5);assert(await page.locator('.linked-label').count()>=2);await waitImage();
 });
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({status:'passed',checks,errors},null,2));
 await fs.writeFile(path.join(outputRoot,'latest.txt'),output+'\n');
 console.log('Artifacts:',output);
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:path.join(outputRoot,'failure.png')}).catch(()=>{});process.exitCode=1;}).finally(async()=>{if(app){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.removeAllListeners('close'))).catch(()=>{});await app.close();}});
