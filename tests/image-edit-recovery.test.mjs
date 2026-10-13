import test from 'node:test';
import assert from 'node:assert/strict';
import {imageDraftKey,readImageDraft,writeImageDraft,removeImageDraft,clearAccountImageDrafts} from '../src/image-edit-recovery.js';
const storage=()=>{const values=new Map();return {get length(){return values.size},key:index=>[...values.keys()][index],getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
test('local image recovery requires the same account, object, baseline and schema validation',()=>{
 const s=storage(),key=imageDraftKey('live:owner','home','hero'),value={hero:{mode:'default',media:[],frame:{x:50,y:50,zoom:1,mobile:{x:48,y:52,zoom:1.4}}}};
 assert.equal(writeImageDraft(s,key,'baseline',value),true);assert.deepEqual(readImageDraft(s,key,'baseline',row=>row.hero.mode==='default'),value);assert.equal(readImageDraft(s,imageDraftKey('live:other','home','hero'),'baseline',()=>true),null);assert.equal(readImageDraft(s,key,'changed',()=>true),null);assert.equal(readImageDraft(s,key,'baseline',()=>false),null);assert.equal(readImageDraft(s,key,'baseline',()=>{throw Error('invalid')}),null);
});
test('cancel removes only that image draft and account cleanup never touches another account',()=>{
 const s=storage(),owner=imageDraftKey('live:owner','home','hero'),other=imageDraftKey('live:other','home','hero'),second=imageDraftKey('live:owner','home','panel-1');for(const key of [owner,other,second])writeImageDraft(s,key,'base',{});removeImageDraft(s,owner);assert.equal(s.getItem(owner),null);assert.ok(s.getItem(second));clearAccountImageDrafts(s,'live:owner');assert.equal(s.getItem(second),null);assert.ok(s.getItem(other));
});
test('unavailable recovery storage fails safely without masking the local image draft',()=>{assert.equal(writeImageDraft(null,'key','base',{}),false);assert.equal(readImageDraft({getItem(){throw Error('denied')}},'key','base',()=>true),null)});
