'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/shared/model');
const images = ['a','b','c','d','e'].map(id => ({ id, name: id, width: 400, height: 300 }));
test('defaults are independent and keep the 1080 / 500 page contract', () => {
  const a = M.defaults(), b = M.defaults(); a.title.text = 'x'; assert.equal(b.title.text, '');
  b.title.text = '中文标题'; const plan = M.pagePlan(images.slice(0,1), b);
  assert.deepEqual(plan.map(p => [p.kind,p.width,p.height]), [['title',1080,500],['image',1080,810]]);
});
for (const value of [0,99,5001,NaN,Infinity,'1080',100.1,null]) {
  test(`strict output width rejects ${String(value)}`, () => assert.throws(() => M.normalizeSettings({ outputWidth: value }, true)));
}
test('zero opacity and margins survive normalization', () => {
  const s = M.normalizeSettings({ watermarkA:{ opacity:0,marginX:0 },watermarkTextA:{ opacity:0,shadowOpacity:0 } },true);
  assert.equal(s.watermarkA.opacity,0); assert.equal(s.watermarkA.marginX,0); assert.equal(s.watermarkTextA.opacity,0);
});
test('legacy watermarks require explicit reselection; paths are not retained', () => {
  const s = M.migrateLegacy({ settings:{ watermarkA:{path:'C:\\private\\logo.png'} }, configs:{'套装':{settings:{outputWidth:1920}}} });
  assert.equal(s.settings.watermarkA.missingAsset,true); assert.equal(s.settings.watermarkA.name,'logo.png');
  assert.equal('path' in s.settings.watermarkA,false); assert.equal(s.presets[0].settings.outputWidth,1920);
});
test('nested unknown keys and prototype-shaped input never reach workspace', () => {
  const s = M.normalizeSettings(JSON.parse('{"__proto__":{"polluted":true},"title":{"text":"a","onclick":"x"}}'),true);
  assert.equal({}.polluted,undefined); assert.equal(s.title.onclick,undefined); assert.equal(s.title.fontSize,48);
});
test('non-PNG watermark and invalid font injection are rejected', () => {
  assert.throws(() => M.normalizeSettings({watermarkA:{dataUrl:'file:///secret'}},true));
  assert.throws(() => M.normalizeSettings({title:{fontFamily:'Arial; url(x)'}},true));
});
test('preset names stay literal text, names and IDs must be unique', () => {
  const name = '<img src=x onerror=alert(1)>';
  const w = M.normalizeWorkspace({presets:[{id:'one',name,settings:{}}]},true); assert.equal(w.presets[0].name,name);
  assert.throws(() => M.normalizeWorkspace({presets:[{id:'a',name:'a'},{id:'a',name:'b'}]},true));
  assert.throws(() => M.normalizeWorkspace({presets:[{name:'a'},{name:'a'}]},true));
  assert.throws(() => M.normalizeWorkspace({version:3},true));
});
test('group reorder preserves relative order in both directions', () => {
  assert.equal(M.reorder(images,['d','b'],'a').map(x=>x.id).join(''),'bdace');
  assert.equal(M.reorder(images,['b','d'],null).map(x=>x.id).join(''),'acebd');
  assert.equal(M.reorder(images,['b','d'],'e').map(x=>x.id).join(''),'acbde');
  assert.equal(images.map(x=>x.id).join(''),'abcde');
});
test('dropping on a selected or missing item is a safe no-op', () => {
  assert.deepEqual(M.reorder(images,['b','c'],'b'),images);
  assert.deepEqual(M.reorder(images,['b'],'missing'),images);
});
test('range selection has stable anchors and additive mode', () => {
  assert.deepEqual([...M.selectRange(images,'d','b')],['b','c','d']);
  assert.deepEqual([...M.selectRange(images,'missing','b')],['b']);
  assert.deepEqual([...M.selectRange(images,'c','d',['a'])],['a','c','d']);
});
test('export all does not depend on selection; selected respects list order', () => {
  assert.equal(M.exportItems(images,[],'all').length,5);
  assert.deepEqual(M.exportItems(images,['d','b'],'selected').map(x=>x.id),['b','d']);
  assert.throws(()=>M.exportItems(images,[],'selected'));
});
test('only insert separators between images, never after final image', () => {
  const s = M.defaults(); s.separator.enabled=true; s.title.text='x';
  assert.deepEqual(M.pagePlan(images.slice(0,2),s).map(p=>p.kind),['title','image','separator','image']);
  assert.equal(M.pagePlan(images.slice(0,1),s).length,2);
});
test('reject output dimensions that could exhaust a canvas', () => {
  assert.throws(()=>M.pagePlan([{name:'tall',width:1,height:10000}],M.defaults()));
  assert.throws(()=>M.pagePlan([{name:'bad',width:0,height:1}],M.defaults()));
});
test('large watermark and excessive margins are fitted inside the page', () => {
  for(const position of M.POSITIONS) {
    const b=M.fitBox(100,50,900,400,{position,marginX:500,marginY:500});
    assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=100&&b.y+b.height<=50);
  }
});
test('safe suggested file names never carry path components or Windows devices',()=>{
  assert.equal(M.safeFilename('CON'),'渲染图集.pdf'); assert.equal(M.safeFilename('项目.pdf'),'项目.pdf');
  assert.equal(M.safeFilename('a/b\\c:1\nsecond'),'a_b_c_1.pdf');
});
function pngHeader(width,height) { const b=Buffer.alloc(24); b.set([137,80,78,71,13,10,26,10]);b.write('IHDR',12);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return b; }
test('inspect dimensions before decoding and reject pixel bombs',()=>{
  assert.deepEqual(M.inspectImage(pngHeader(400,300)),{width:400,height:300,type:'image/png'});
  assert.throws(()=>M.inspectImage(pngHeader(30000,30000)));
  assert.throws(()=>M.inspectImage(Buffer.from('not an image at all')));
});
test('JPEG SOF and GIF dimension probes',()=>{
  const jpeg=Buffer.from([255,216,255,192,0,11,8,0,100,0,200,1,1,0,0]);
  assert.deepEqual(M.inspectImage(jpeg),{width:200,height:100,type:'image/jpeg'});
  const gif=Buffer.alloc(13);gif.write('GIF89a');gif.writeUInt16LE(20,6);gif.writeUInt16LE(10,8);
  assert.deepEqual(M.inspectImage(gif),{width:20,height:10,type:'image/gif'});
});
