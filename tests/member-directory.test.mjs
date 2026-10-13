import test from 'node:test';
import assert from 'node:assert/strict';
import {directoryPeople,directoryPerson} from '../src/member-directory.js';
import {householdAccent,householdPreview} from '../src/household-model.js';
const state={mode:'live',members:[{id:'alice',name:'Álice Rivers',registered:true},{id:'bob',name:'Bob Green',registered:true},{id:'child',name:'Private Child',managedBy:'alice',registered:false},{id:'seed',name:'Unregistered Seed',registered:false}],memorials:[{id:'ancestor',name:'Annie White',maidenName:'Green'}]};
test('directory selectors search names and restrict ancestors to tagging or ancestral heritage',()=>{
 assert.deepEqual(directoryPeople(state).map(x=>x.id),['alice','bob']);
 assert.deepEqual(directoryPeople(state,{query:'rivers ali'}).map(x=>x.id),['alice']);
 assert.deepEqual(directoryPeople(state,{purpose:'tag',query:'green'}).map(x=>x.id),['ancestor','bob']);
 assert.deepEqual(directoryPeople(state,{purpose:'ancestral-head'}).map(x=>x.id),['ancestor']);
 assert.deepEqual(directoryPeople(state,{purpose:'member',filter:m=>m.id!=='alice'}).map(x=>x.id),['bob']);
 assert.equal(directoryPerson(state,'ancestor').personKind,'ancestor');
 assert.equal(directoryPerson(state,'child'),null);
 assert.equal(directoryPerson(state,'seed'),null);
 assert.ok(directoryPeople({...state,mode:'preview'}).some(x=>x.id==='seed'));
});
test('household colors inherit defaults and retain explicitly chosen colors',()=>{
 assert.equal(householdAccent({color:'#4f996c'}),null);
 assert.equal(householdAccent({color:'#c7a64a'}),'#c7a64a');
 assert.equal(householdAccent({color:'#4f996c',colorMode:'custom'}),'#4f996c');
 assert.equal(householdAccent({color:'#c7a64a',colorMode:'inherit'}),null);
 assert.equal(householdAccent({color:'bad',colorMode:'custom'}),null);
});
test('preview heritage is separate from membership and privileged roles, and resettable',()=>{
 const original={...state,mode:'preview',selfId:'alice',lastId:0,households:[],householdRequests:[]};
 const created=householdPreview(original,{type:'CREATE_HOUSEHOLD',name:'Preview household'}),householdId=created.householdId;
 assert.equal(created.households[0].colorMode,'inherit');
 const add={type:'SAVE_HOUSEHOLD_HERITAGE',householdId,entry:{personId:'ancestor',role:'ancestral-head',title:'Matriarch'}};
 const next=householdPreview(created,add);
 assert.equal(next.households[0].heritage[0].personKind,'ancestor');
 assert.deepEqual(next.households[0].headIds,['alice']);assert.deepEqual(next.households[0].memberIds,['alice']);assert.deepEqual(next.members,original.members);
 assert.equal(householdPreview({...created,selfId:'bob'},add).households[0].heritage.length,0);
 assert.equal(householdPreview(created,{...add,entry:{...add.entry,personId:'child'}}),created);
 const updated=householdPreview(next,{...add,entry:{...add.entry,title:'Ancestral head'}});
 assert.equal(updated.households[0].heritage.length,1);assert.equal(updated.lastId,next.lastId);
 const removed=householdPreview(updated,{type:'REMOVE_HOUSEHOLD_HERITAGE',householdId,heritageId:updated.households[0].heritage[0].id});
 assert.deepEqual(removed.households[0].heritage,[]);
});
