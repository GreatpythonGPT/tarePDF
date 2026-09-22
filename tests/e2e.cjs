'use strict';
// Real Electron application + native IPC + on-disk PDF checks. Native dialogs are
// intercepted in the test process only; production source contains no test paths.
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { PDFDocument, PDFName, PDFDict, PDFRawStream } = require('pdf-lib');
const results = [], output = path.join(__dirname, '..', 'test-results');
let app, page, directory;
async function scenario(name, callback) {
  const start = Date.now();
  try { await callback(); results.push({ name, status:'passed', milliseconds:Date.now()-start }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status:'failed', error:error.stack }); throw error; }
}
async function ready() { await page.waitForFunction(() => !document.getElementById('work-pane').inert); }
const cards = () => page.locator('.image-card');
async function names() { return page.locator('.image-name').allTextContents(); }
async function view(name) { await page.locator(`.nav-button[data-view=${name}]`).click(); }
async function idle() { await page.waitForFunction(() => !document.body.classList.contains('busy')); }
async function chooseSave(filename) {
  await app.evaluate(({dialog}, filePath) => { dialog.showSaveDialog = async () => filePath ? ({ canceled:false,filePath }) : ({ canceled:true }); },filename);
}
async function exportTo(filename) {
  await chooseSave(filename); await page.locator('#export-button').click();
  await page.locator('#saved-dialog').waitFor({state:'visible'});
  await page.locator('#close-saved').click(); return PDFDocument.load(await fs.readFile(filename));
}
async function main() {
  await fs.mkdir(output,{recursive:true}); directory=await fs.mkdtemp(path.join(os.tmpdir(),'tare-e2e-'));
  // Root Linux runners alone require this flag. The packaged application does not disable its sandbox.
  const args=[path.join(__dirname,'launch.cjs')];
  if(process.platform==='linux' && process.getuid?.()===0)args.push('--no-sandbox');
  app=await _electron.launch({args,env:{...process.env,TARE_TEST_DIR:directory},timeout:30000});
  page=await app.firstWindow(); page.setDefaultTimeout(10000);
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,940));
  await scenario('offline startup, one initialized window and restricted bridge',async()=>{
    await ready(); assert.equal(page.url(),'tare://app/index.html');assert.equal(app.windows().length,1);
    assert.equal(await page.evaluate(()=>typeof window.tareAPI.invoke),'undefined');
    assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
    const preferences=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
    assert.equal(preferences.sandbox,true);assert.equal(preferences.nodeIntegration,false);assert.equal(preferences.contextIsolation,true);
    assert.equal(await page.locator('[data-view="editor"]').count(),0);
  });
  const fixtures=await page.evaluate(()=>{
    function image(name,width,height,color,transparent=false){
      const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');
      if(!transparent){x.fillStyle=color;x.fillRect(0,0,width,height);}else{x.fillStyle=color;x.fillRect(width/4,height/4,width/2,height/2);}
      return {name,mimeType:'image/png',base64:c.toDataURL('image/png').split(',')[1]};
    }
    return [image('01-透明图.png',400,300,'#e84939',true),image('02-竖图.png',300,600,'#70b5a5'),image('03-横图.png',600,300,'#4672b4'),image('10-方图.png',400,400,'#edcb79'),image('watermark.png',40,20,'#000000')];
  });
  const inputs=fixtures.map(f=>({name:f.name,mimeType:f.mimeType,buffer:Buffer.from(f.base64,'base64')}));
  await scenario('batch import: valid files, duplicate and corrupt file are accurately reported',async()=>{
    await page.locator('#image-input').setInputFiles([...inputs.slice(0,4),inputs[0],{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')}]);
    await page.waitForFunction(()=>document.querySelectorAll('.image-card').length===4);await idle();
    assert.match(await page.locator('#notice-text').innerText(),/重复/);assert.match(await page.locator('#notice-text').innerText(),/broken/);
    assert.deepEqual(await names(),fixtures.slice(0,4).map(f=>f.name));
  });
  await scenario('non-contiguous multiselect drags as an ordered group and supports undo/redo',async()=>{
    await page.locator('#clear-selection').click();await cards().nth(0).click();await cards().nth(2).click({modifiers:['Control']});
    assert.equal(await page.locator('.image-card.selected').count(),2);
    const source=await cards().nth(0).boundingBox();
    await page.mouse.move(source.x+source.width/2,source.y+80);await page.mouse.down();
    await page.mouse.move(source.x+source.width/2+20,source.y+100,{steps:5});
    await page.locator('#drop-end').waitFor({state:'visible'});
    const end=await page.locator('#drop-end').boundingBox();
    await page.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:10});await page.mouse.up();
    assert.deepEqual(await names(),[fixtures[1].name,fixtures[3].name,fixtures[0].name,fixtures[2].name]);
    await page.locator('#undo-button').click();assert.deepEqual(await names(),fixtures.slice(0,4).map(f=>f.name));
    await page.locator('#redo-button').click();assert.equal((await names())[0],fixtures[1].name);await page.locator('#undo-button').click();
  });
  await scenario('Shift selection, scoped Delete, and list undo',async()=>{
    await cards().nth(0).click();await cards().nth(2).click({modifiers:['Shift']});assert.equal(await page.locator('.image-card.selected').count(),3);
    await page.locator('#grid-scroll').focus();await page.keyboard.press('Delete');assert.equal(await cards().count(),1);
    await page.keyboard.press('Control+z');assert.equal(await cards().count(),4);
  });
  await scenario('marquee selects cards from blank space',async()=>{
    await page.locator('#clear-selection').click();
    const first=await cards().first().boundingBox(),grid=await page.locator('#grid-scroll').boundingBox();
    await page.mouse.move(grid.x+3,first.y+first.height+40);await page.mouse.down();
    await page.mouse.move(first.x+first.width+10,first.y+10,{steps:12});await page.mouse.up();
    assert.ok(await page.locator('.image-card.selected').count()>=1);
  });
  await scenario('settings typing and Backspace never delete selected images',async()=>{
    await page.locator('#select-all').click();await view('settings');await page.locator('#setting-title-text').fill('设计提案 X');
    await page.keyboard.press('Backspace');assert.equal(await cards().count(),4);
    await page.locator('#setting-title-text').fill('设计提案\n中文标题验证');
    await page.locator('#setting-outputWidth').fill('800');
    await page.locator('#setting-separator-enabled').check();
    await page.waitForFunction(()=>document.getElementById('save-status').textContent.includes('已保存'));
  });
  await scenario('preset injection is inert text and repeated render does not duplicate actions',async()=>{
    const name='<img src=x onerror=alert(1)>';
    await page.locator('#preset-name').fill(name);await page.locator('#save-preset').click();
    await page.waitForFunction(()=>document.querySelectorAll('.preset-row').length===1);
    assert.equal(await page.locator('#preset-list img').count(),0);assert.equal(await page.locator('.preset-row span').innerText(),name);
    for(let i=0;i<3;i++){await page.locator('.preset-row [data-action=load]').click();}
    assert.equal(await page.locator('.preset-row').count(),1);
    await page.screenshot({path:path.join(output,'settings.png')});
  });
  await scenario('transparent PNG renders white; zero opacity suppresses image and text marks',async()=>{
    const sample=await page.evaluate(async data=>{
      const M=window.TareModel,D=window.TareDocument,s=M.defaults();s.outputWidth=400;
      s.watermarkA.dataUrl='data:image/png;base64,'+data[4].base64;s.watermarkA.opacity=0;
      s.watermarkTextA.text='必须不可见';s.watermarkTextA.opacity=0;s.watermarkTextA.shadowOpacity=1;
      const image={name:'transparent',width:400,height:300,file:D.dataBlob('data:image/png;base64,'+data[0].base64),watermarks:M.marks()};
      const session=await D.create([image],s);const blob=await session.render(session.plan[0]);
      const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;
      const c=canvas.getContext('2d');c.drawImage(bitmap,0,0);const white=Array.from(c.getImageData(0,0,1,1).data);
      s.watermarkA.dataUrl='';s.watermarkTextA.text='';const plain=await D.create([image],s);const other=await plain.render(plain.plan[0]);
      const a=new Uint8Array(await blob.arrayBuffer()),b=new Uint8Array(await other.arrayBuffer());
      bitmap.close();session.dispose();plain.dispose();return {white,identical:a.length===b.length&&a.every((v,i)=>v===b[i])};
    },fixtures);
    assert.deepEqual(sample.white,[255,255,255,255]);assert.equal(sample.identical,true);
  });
  await scenario('missing or corrupt enabled watermark aborts before producing output',async()=>{
    const messages=await page.evaluate(async data=>{
      const M=window.TareModel,D=window.TareDocument,s=M.defaults();const image={name:'x',width:400,height:300,file:D.dataBlob('data:image/png;base64,'+data[0].base64),watermarks:M.marks()};
      const errors=[];s.watermarkA.missingAsset=true;
      try{await D.create([image],s);}catch(e){errors.push(e.message);}
      s.watermarkA.missingAsset=false;s.watermarkA.dataUrl='data:image/png;base64,iVBORw0KGgo=';
      try{await D.create([image],s);}catch(e){errors.push(e.message);}
      return errors;
    },fixtures);assert.equal(messages.length,2);assert.match(messages[0],/缺少文件/);
  });
  await scenario('continuous preview includes title and separators',async()=>{
    await page.locator('#preview-button').click();await page.locator('.preview-page').first().waitFor();
    assert.equal(await page.locator('.preview-page').count(),8);
    await page.waitForFunction(()=>document.querySelector('.preview-page img')?.naturalWidth>0);
    await page.screenshot({path:path.join(output,'preview.png')});
  });
  let savedDoc, baselineJpeg;
  await scenario('actual native IPC saves a parsable PDF with exact planned page sizes',async()=>{
    savedDoc=await exportTo(path.join(output,'verified-document.pdf'));
    assert.equal(savedDoc.getPageCount(),8);
    assert.deepEqual(savedDoc.getPages().map(p=>p.getSize()),[
      {width:800,height:500},{width:800,height:600},{width:800,height:100},{width:800,height:1600},
      {width:800,height:100},{width:800,height:400},{width:800,height:100},{width:800,height:800}]);
    assert.equal(savedDoc.getTitle(),'设计提案\n中文标题验证');
    const objects=savedDoc.getPage(1).node.Resources().lookup(PDFName.of('XObject'),PDFDict);
    const jpeg=savedDoc.context.lookup(objects.values()[0],PDFRawStream).contents;
    baselineJpeg=Buffer.from(jpeg);await fs.writeFile(path.join(output,'exported-image.jpg'),jpeg);
  });
  await scenario('cancel native save never reports success',async()=>{
    await chooseSave(null);await page.locator('#export-button').click();await idle();
    await page.waitForFunction(()=>document.getElementById('notice-text').textContent.includes('已取消保存'));
    assert.equal(await page.locator('#saved-dialog').isVisible(),false);
  });
  await scenario('selected-only export keeps list order and excludes unselected images',async()=>{
    await view('images');await page.locator('#clear-selection').click();await cards().nth(1).click();await cards().nth(3).click({modifiers:['Control']});
    await page.locator('#export-scope').selectOption('selected');
    const doc=await exportTo(path.join(output,'selected-document.pdf'));assert.equal(doc.getPageCount(),4);
    assert.deepEqual(doc.getPages().map(p=>p.getHeight()),[500,1600,100,800]);
    await page.locator('#clear-selection').click();assert.equal(await page.locator('#export-button').isDisabled(),true);
    await page.locator('#export-scope').selectOption('all');await page.screenshot({path:path.join(output,'images.png')});
  });
  await scenario('per-image watermark flags change output without changing the source',async()=>{
    await view('settings');await page.locator('[data-choose-asset=watermarkA]').click();
    await page.locator('#watermark-input').setInputFiles(inputs[4]);await idle();
    await view('images');await cards().nth(0).locator('[data-flag=imageA]').click();
    assert.equal(await cards().nth(0).locator('[data-flag=imageA]').getAttribute('aria-pressed'),'false');
    await cards().nth(0).click();await page.locator('#export-scope').selectOption('selected');
    const doc=await exportTo(path.join(output,'watermark-disabled.pdf'));assert.equal(doc.getPageCount(),2);
    const objects=doc.getPage(1).node.Resources().lookup(PDFName.of('XObject'),PDFDict);
    const without=Buffer.from(doc.context.lookup(objects.values()[0],PDFRawStream).contents);
    assert.ok(without.equals(baselineJpeg));
    await cards().nth(0).locator('[data-flag=imageA]').click();
    const withMark=await exportTo(path.join(output,'watermark-enabled.pdf'));
    const marked=withMark.getPage(1).node.Resources().lookup(PDFName.of('XObject'),PDFDict);
    assert.equal(Buffer.from(withMark.context.lookup(marked.values()[0],PDFRawStream).contents).equals(without),false);
  });
  await scenario('cancel generation before native save produces no file',async()=>{
    await app.evaluate(({dialog})=>{global.__saveCalls=0;dialog.showSaveDialog=async()=>{global.__saveCalls++;return{canceled:true};};});
    await page.evaluate(()=>{document.getElementById('export-button').click();setTimeout(()=>document.getElementById('cancel-progress').click(),0);});
    await idle();await page.waitForFunction(()=>document.getElementById('notice-text').textContent.includes('已取消生成'));
    assert.equal(await app.evaluate(()=>global.__saveCalls),0);
  });
  await scenario('invalid width cannot silently export using a previous valid value',async()=>{
    await view('settings');await page.locator('#setting-outputWidth').fill('99');
    await page.locator('#export-button').click();assert.match(await page.locator('#notice-text').innerText(),/修正设置/);
    assert.equal(await page.locator('#progress-dialog').isVisible(),false);await page.locator('#setting-outputWidth').fill('800');
  });
  await scenario('file bridge refuses arbitrary opening and page requests never use a CDN',async()=>{
    assert.equal(await page.evaluate(async()=>{try{await window.tareAPI.openSavedPdf('C:\\Windows\\system.ini');return false;}catch{return true;}}),true);
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  });
  await scenario('minimum-window layout does not overflow horizontally',async()=>{
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,680));await view('settings');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(output,'minimum-window.png')});
  });
  await scenario('closing immediately after an edit waits for durable settings save',async()=>{
    await page.locator('#setting-title-text').fill('关闭前最后输入');
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    const exited=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await exited;app=null;
    const workspace=JSON.parse(await fs.readFile(path.join(directory,'user-data','workspace-v2.json'),'utf8'));
    assert.equal(workspace.settings.title.text,'关闭前最后输入');
  });
}
main().catch(async error=>{
  console.error(error);if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;
}).finally(async()=>{
  if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});}).catch(()=>{});await app.close().catch(()=>{});}
  await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'e2e-results.json'),JSON.stringify({platform:process.platform,results},null,2));
  if(directory)await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});
});
