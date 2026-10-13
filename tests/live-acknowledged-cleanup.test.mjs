import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {initialState,reducer} from '../src/data-adapter.js';

const adapter=readFileSync(new URL('../src/live-adapter.js',import.meta.url),'utf8');
const helperSource=adapter.match(/function reducerAfterAcknowledgement\(current,action\)\{[^\n]+\}/)?.[0];
function helper(){
 assert.ok(helperSource,'live adapter defines post-acknowledgement cleanup');
 return vm.runInNewContext(`(${helperSource})`,{reducer});
}
// A live Owner can be server-authorized without any preview Leader role or household.
const liveOwner=()=>({...initialState(),previewRoleView:'member',households:[],compose:{text:'kept'}});
const memorial={type:'ADD_MEMORIAL',memorial:{name:'Acknowledged Memorial',birthYear:'1931',deathYear:'2004'}};

test('preview role gates still reject an unacknowledged member memorial create',()=>{
 assert.throws(()=>reducer({...liveOwner(),mode:'preview'},memorial),/current preview role/);
});

test('an acknowledged live command never fails on preview-only role gates',()=>{
 const current=liveOwner(),after=helper()(current,memorial);
 assert.equal(after,current,'cleanup keeps current local fields instead of throwing');
 assert.equal(after.compose.text,'kept');
 for(const type of ['DETAILS','SAVE_EVENT','SAVE_PRODUCT','MODERATE'])assert.doesNotThrow(()=>helper()(current,{type,value:{}}),type);
});

test('acknowledged cleanup still applies authorized local changes',()=>{
 const current={...initialState(),previewRoleView:'leader'},after=helper()(current,memorial);
 assert.equal(after.memorials.length,current.memorials.length+1);
});

test('the post-acknowledgement path uses the guarded cleanup and keeps the request receipt',()=>{
 assert.match(adapter,/const result=await sendCommand\(payload\);confirmed=true;/);
 assert.match(adapter,/\?ref\.current:reducerAfterAcknowledgement\(ref\.current,action\),action\);/);
 assert.match(adapter,/requestBook\.current\.confirmed\.add\(fingerprint\);/);
});
