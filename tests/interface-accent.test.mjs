import test from 'node:test';import assert from 'node:assert/strict';
import {CUSTOM_ACCENT_PICKER_ENABLED,readInterfaceAccent,interfaceAccentColor,unlinkInterfaceAccent,INTERFACE_ACCENT_KEY} from '../src/interface-accent.js';
test('custom device accent survives reload and profile edits without changing identity',()=>{const profile={profileColor:'#cc8844'};const preference=unlinkInterfaceAccent({mode:'profile',color:'#4f996c'},profile.profileColor);const saved=readInterfaceAccent({getItem:key=>key===INTERFACE_ACCENT_KEY?JSON.stringify(preference):null});assert.equal(interfaceAccentColor(saved,'#992266'),profile.profileColor);assert.equal(profile.profileColor,'#cc8844');assert.equal(interfaceAccentColor({mode:'family'},profile.profileColor),null);});
test('invalid and unavailable device preferences safely use defaults',()=>{for(const storage of [{getItem:()=>'{invalid'},{getItem:()=>{throw Error('blocked')}},{getItem:()=>JSON.stringify({mode:'custom',color:'url(bad)'})}])assert.deepEqual(readInterfaceAccent(storage),{mode:'family',color:'#4f996c'});});

test('default colors are independent of profile colors and explicit choices survive',()=>{assert.deepEqual(readInterfaceAccent({getItem:()=>null}),{mode:'family',color:'#4f996c'});assert.equal(interfaceAccentColor(readInterfaceAccent(null),'#cc8844'),null);for(const mode of ['family','profile','custom'])assert.equal(readInterfaceAccent({getItem:key=>key===INTERFACE_ACCENT_KEY?JSON.stringify({mode,color:'#cc8844'}):null}).mode,mode);});

test('custom picker flag is off while preset and stored accent colors still apply',()=>{
 assert.equal(CUSTOM_ACCENT_PICKER_ENABLED,false);
 for(const color of ['#3985e6','#cc8844']){
 const preference=readInterfaceAccent({getItem:()=>JSON.stringify({mode:'custom',color})});
 assert.deepEqual(preference,{mode:'custom',color});
 assert.equal(interfaceAccentColor(preference,'#387b51'),color);
 }
 assert.equal(interfaceAccentColor({mode:'profile'},'#387b51'),'#387b51');
});
