'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {atomicWrite,validatePdf,validateSender,WorkspaceStore,createPdfService}=require('../src/services');
const M=require('../src/shared/model');
const pdf=new Uint8Array(Buffer.from('%PDF-1.7\n%%EOF\n'));
async function temp(t){ const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tare-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir; }
test('cancel native save yields cancelled and never writes',async()=>{
  let writes=0;const s=createPdfService({choosePath:async()=>({canceled:true}),write:async()=>writes++,openPath:async()=>''});
  assert.deepEqual(await s.save(pdf,'x'),{status:'cancelled'});assert.equal(writes,0);assert.equal(s.saving,false);
});
test('only successful saves produce an openable token',async()=>{
  let opened;const s=createPdfService({choosePath:async()=>({filePath:'/tmp/project.pdf'}),write:async()=>{},openPath:async p=>{opened=p;return '';}});
  await assert.rejects(s.open('/tmp/project.pdf'));
  const r=await s.save(pdf,'x');assert.equal(r.status,'saved');await s.open(r.id);assert.equal(opened,'/tmp/project.pdf');
});
test('native open error is a visible failure after successful save',async()=>{
  const s=createPdfService({choosePath:async()=>({filePath:'/tmp/a.pdf'}),write:async()=>{},openPath:async()=>'no reader'});
  const r=await s.save(pdf,'a');await assert.rejects(s.open(r.id),/PDF 已保存/);
});
test('write failure rejects, resets busy, and allows a later retry',async()=>{
  let attempts=0;const s=createPdfService({choosePath:async()=>({filePath:'/tmp/a.pdf'}),write:async()=>{if(!attempts++)throw Error('disk full');},openPath:async()=>''});
  await assert.rejects(s.save(pdf,'a'),/disk full/);assert.equal(s.saving,false);assert.equal((await s.save(pdf,'a')).status,'saved');
});
test('concurrent save is rejected without a second dialog',async()=>{
  let resolve;const s=createPdfService({choosePath:()=>new Promise(r=>{resolve=r;}),openPath:async()=>''});
  const first=s.save(pdf,'a');await assert.rejects(s.save(pdf,'b'),/已有保存/);resolve({canceled:true});await first;
});
test('reject wrong extension and invalid PDF payloads',async()=>{
  const s=createPdfService({choosePath:async()=>({filePath:'/tmp/source.png'}),openPath:async()=>''});
  await assert.rejects(s.save(pdf,'a'),/\.pdf/);
  for(const value of ['%PDF-1.7',[],new Uint8Array([1,2,3]),new Uint8Array(Buffer.from('abcdefghijk'))])assert.throws(()=>validatePdf(value));
});
test('atomic replacement preserves old destination after failed rename',async t=>{
  const dir=await temp(t),dest=path.join(dir,'file.pdf');await fs.writeFile(dest,'original');
  const io={...fs,rename:async()=>{throw Error('locked');}};
  await assert.rejects(atomicWrite(dest,pdf,io),/locked/);assert.equal(await fs.readFile(dest,'utf8'),'original');
  assert.deepEqual(await fs.readdir(dir),['file.pdf']);
});
test('atomic replacement succeeds with exact bytes',async t=>{
  const dir=await temp(t),dest=path.join(dir,'file.pdf');await fs.writeFile(dest,'old');await atomicWrite(dest,pdf);
  assert.deepEqual(new Uint8Array(await fs.readFile(dest)),pdf);
});
test('workspace writes are ordered immutable snapshots',async t=>{
  const dir=await temp(t),s=new WorkspaceStore(dir),w=M.normalizeWorkspace({});
  w.settings.title.text='first';const a=s.save(w);w.settings.title.text='second';const b=s.save(w);w.settings.title.text='not saved';
  await Promise.all([a,b]);const r=await s.load();assert.equal(r.workspace.settings.title.text,'second');
});
test('old electron-store config migration leaves source untouched',async t=>{
  const dir=await temp(t),source=JSON.stringify({settings:{outputWidth:1920,watermarkA:{path:'C:\\logo.png'}},configs:{demo:{name:'demo',settings:{}}}});
  await fs.writeFile(path.join(dir,'config.json'),source);const store=new WorkspaceStore(dir),loaded=await store.load();
  assert.equal(loaded.workspace.settings.outputWidth,1920);assert.equal(loaded.workspace.presets.length,1);
  assert.ok(loaded.warning.includes('迁移'));await store.save(loaded.workspace);assert.equal(await fs.readFile(path.join(dir,'config.json'),'utf8'),source);
});
test('corrupt configuration is backed up verbatim before recovery',async t=>{
  const dir=await temp(t),store=new WorkspaceStore(dir);await fs.writeFile(store.filename,'{broken');
  const r=await store.load();assert.equal(r.readOnly,false);assert.ok(r.warning.includes('备份'));
  const backup=(await fs.readdir(dir)).find(f=>f.includes('.backup-'));assert.equal(await fs.readFile(path.join(dir,backup),'utf8'),'{broken');
});
test('future-version configuration is read-only and cannot be overwritten',async t=>{
  const dir=await temp(t),store=new WorkspaceStore(dir),text='{"version":999}';await fs.writeFile(store.filename,text);
  assert.equal((await store.load()).readOnly,true);await assert.rejects(store.save(M.normalizeWorkspace({})));
  assert.equal(await fs.readFile(store.filename,'utf8'),text);
});
test('IPC accepts only the exact top frame of the actual app window',()=>{
  const mainFrame={url:'tare://app/index.html'},contents={mainFrame,isDestroyed:()=>false};
  validateSender({sender:contents,senderFrame:mainFrame},contents,mainFrame.url);
  assert.throws(()=>validateSender({sender:{},senderFrame:mainFrame},contents,mainFrame.url));
  assert.throws(()=>validateSender({sender:contents,senderFrame:{url:mainFrame.url}},contents,mainFrame.url));
  assert.throws(()=>validateSender({sender:contents,senderFrame:mainFrame},contents,'https://example.com'));
});
