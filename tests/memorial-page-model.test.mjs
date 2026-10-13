import {test} from 'node:test';import assert from 'node:assert/strict';import{memorialYears,memorialClaims,memorialMemories,mayEditMemorial}from'../src/memorial-page-model.mjs';
test('years never invent missing data',()=>{assert.equal(memorialYears({}),'');assert.equal(memorialYears({birthYear:'1950',deathYear:'2020'}),'1950 – 2020');assert.equal(memorialYears({birthYear:'unknown',deathYear:'2020'}),'Remembered · 2020')});
test('tagged memories include ancestor and linked person only',()=>{const state={memories:[{id:'1',memberIds:['a']},{id:'2',memberIds:['s']},{id:'3',ancestorIds:['a']},{id:'4',memberIds:['other']}]};assert.deepEqual(memorialMemories(state,{id:'a',sourceMemberId:'s'}).map(x=>x.id),['1','2','3'])});
test('edit authorization follows granted memorial capabilities',()=>{const s={selfId:'me',memorialAccess:{canCreate:true},households:[{name:'Example',canManage:true,heritage:[{personKind:'ancestor',personId:'a'}]}]};assert.equal(memorialClaims(s,'a').length,1);assert(mayEditMemorial(s,{id:'a'}));assert(!mayEditMemorial({...s,memorialAccess:{}},{id:'a'}));assert(!mayEditMemorial(s,{id:'other'}))});

import {initialState,reducer} from '../src/data-adapter.js';
test('preview memorial edits respect original owner and never take ownership from submitted fields',()=>{
 const memorial={id:'fixture-ancestor',name:'Original',createdBy:'another',quote:'Preserve',canEdit:false};
 const state={...initialState(),onboarding:'done',memorials:[memorial],previewRoleView:'member'};
 assert.throws(()=>reducer(state,{type:'SAVE_MEMORIAL',memorial:{...memorial,name:'Forged',createdBy:state.selfId,canEdit:true}}),/cannot edit/i);
 const leader={...state,previewRoleView:'leader'};const next=reducer(leader,{type:'SAVE_MEMORIAL',memorial:{...memorial,name:'Updated'}});
 assert.equal(next.memorials[0].name,'Updated');assert.equal(next.memorials[0].createdBy,'another');assert.equal(next.memorials[0].quote,'Preserve');
});
test('member view cannot edit and deleted memories never reappear',()=>{
 assert.equal(mayEditMemorial({mode:'live',selfId:'me',viewAsMember:true,memorialAccess:{canCreate:true}}, {id:'a',createdBy:'me',canEdit:true}),false);
 assert.deepEqual(memorialMemories({memories:[{id:'gone',memberIds:['a'],deletedAt:1},{id:'kept',ancestorIds:['a']}]},{id:'a'}).map(x=>x.id),['kept']);
});
