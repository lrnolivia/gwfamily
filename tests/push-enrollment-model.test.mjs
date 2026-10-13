import test from 'node:test';import assert from 'node:assert/strict';
import {pushPromptChoice,promptWasSeen,markPromptSeen} from '../src/push-enrollment-model.js';
const eligible={enabled:true,active:true,seen:false,status:{ready:true,pushEnabled:false},capability:{available:true}};
test('disabled, preview/inactive, paused, denied and subscribed devices never prompt',()=>{
 assert.equal(pushPromptChoice(eligible),'enable');
 for(const patch of [{enabled:false},{enabled:undefined},{active:false},{seen:true},{globalOff:true},{status:{ready:false}},{status:{ready:true,pushEnabled:true}},{capability:{available:false,reason:'permission-denied'}},{capability:{available:false,reason:'unsupported'}}])assert.equal(pushPromptChoice({...eligible,...patch}),null);
 assert.equal(pushPromptChoice({...eligible,capability:{available:false,reason:'install-ios-first'}}),'install');
});
test('once per account/device and inaccessible persistence fails closed',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(promptWasSeen(storage,'A'),false);assert.equal(markPromptSeen(storage,'A'),true);assert.equal(promptWasSeen(storage,'A'),true);assert.equal(promptWasSeen(storage,'B'),false);
 assert.equal(promptWasSeen({getItem(){throw Error()}},'A'),true);assert.equal(markPromptSeen({setItem(){throw Error()}},'A'),false);
});
