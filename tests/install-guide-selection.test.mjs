import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {installDevice,guideAccent,guideAsset,guideDeviceForPlatform,guideDimensions} from '../src/install-guide-selection.js';
test('native identity distinguishes tablet, phone and desktop independently of material and width',()=>{
 for(const [nav,expected] of [[{userAgent:'iPhone'},'ios'],[{userAgent:'iPad'},'ipad'],[{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5},'ipad'],[{userAgent:'Android Mobile'},'android'],[{userAgent:'Android'},'androidTablet'],[{userAgent:'Android Mobile',userAgentData:{mobile:false}},'androidTablet'],[{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0},null],[{userAgent:'Windows NT'},null],[{userAgent:'CrOS'},null]])assert.equal(installDevice(nav),expected);
 assert.equal(guideDeviceForPlatform('ipad','android'),'androidTablet');assert.equal(guideDeviceForPlatform('android','apple'),'ios');
});
test('resolved interface colors route all designated presets, preserve default and bound unsupported profile colors',()=>{
 const colors=['#e64f59','#ff7a00','#ec9d00','#387b51','#3985e6','#a267d5','#ff6685','#8a8178'];
 assert.deepEqual(colors.map(guideAccent),['red','orange','yellow','green','blue','violet','coral-pink','stone']);
 assert.equal(guideAccent('#E64F59'),'red');for(const value of [null,'#4f996c','#123456','red'])assert.equal(guideAccent(value),'default');
});
test('every approved device/color/theme/step routes to verified original artwork with provenance',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../docs/install-guide/approved-v2/manifest.json',import.meta.url)));
 assert.equal(manifest.sourceBuild,'b3805113f4f49220c35b');assert.equal(manifest.previewOnly,true);assert.equal(manifest.screens.length,216);assert.equal(manifest.inlineControls.length,25);
 const keys=new Set();for(const item of [...manifest.screens,...manifest.inlineControls]){
  const bytes=await readFile(new URL('../dist/install-guide/approved-v2/'+item.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.file);
  if(item.file.endsWith('.png')){assert.equal(bytes.readUInt32BE(16),item.width);assert.equal(bytes.readUInt32BE(20),item.height);keys.add(item.file);assert.deepEqual(guideDimensions(item.device,item.file.split('/')[1].split('-'+item.device+'-')[0]),[item.width,item.height]);}
  else assert.doesNotMatch(bytes.toString(),/<script|<foreignObject|\bonload=|\bonclick=|href="https?:/i);
 }
 for(const accent of ['default','red','orange','yellow','green','blue','violet','coral-pink','stone'])for(const device of ['ios','ipad','android','androidTablet'])for(const theme of ['light','dark'])for(let step=0;step<3;step++)assert.ok(keys.has(guideAsset(device,accent,theme,step).replace('approved-v2/','')));
});
