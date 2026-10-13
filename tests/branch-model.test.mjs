import test from 'node:test';import assert from 'node:assert/strict';
import {branchKey,branchName,surnameOf,familySetupSearch,familySetupSuggestions,branchPreview,canPlaceHousehold} from '../src/branch-model.js';
// Fictional people, households and branches only.
const base=()=>({mode:'preview',previewRoleView:'member',selfId:'ivy',lastId:0,householdIds:['h-ivy'],householdRequests:[],
 members:[{id:'ivy',name:'Ivy June Quill Jr.'},{id:'rowan',name:'Rowan Marsh'}],
 households:[{id:'h-ivy',name:'Harbor Home',memberIds:['ivy'],headIds:['ivy'],canManage:true},{id:'h-quill',name:'Quill Cottage',memberIds:['rowan'],headIds:['rowan'],canManage:false},{id:'h-other',name:'Juniper House',memberIds:['rowan'],headIds:['rowan'],canManage:false}],
 branches:[{id:'b-marsh',name:'Marsh Branch',createdBy:'rowan',householdIds:['h-other']}]});

test('branch names normalize so one family line cannot be duplicated',()=>{
 for(const name of ['Quill','the quill family','QUILL  Branch','Quíll','Quill’s'.replace('’s','')])assert.equal(branchKey(name),'quill');
 assert.equal(branchKey('The Quill-Marsh Families'),'quill marsh');
 assert.equal(branchName('  Quill   Branch '),'Quill Branch');
 assert.throws(()=>branchName('   '));assert.throws(()=>branchName('x'.repeat(81)));
 assert.equal(surnameOf('Ivy June Quill Jr.'),'quill');assert.equal(surnameOf('Ivy'),'');
});

test('surname suggestions are inert and never include households the member already belongs to',()=>{
 const state=base(),before=structuredClone(state),s=familySetupSuggestions(state);
 assert.equal(s.surname,'Quill');assert.deepEqual(s.branches,[]);assert.deepEqual(s.households.map(h=>h.id),['h-quill']);assert.equal(s.createName,'Quill');
 assert.deepEqual(state,before,'suggesting changes nothing');
 const withBranch={...state,branches:[...state.branches,{id:'b-quill',name:'The Quill Family',householdIds:['h-other']}]},t=familySetupSuggestions(withBranch);
 assert.deepEqual(t.branches.map(b=>b.id),['b-quill']);assert.deepEqual(t.households.map(h=>h.id),['h-quill','h-other']);assert.equal(t.createName,'');
});

test('search finds branches and households and offers creation only without a matching name',()=>{
 const state=base();
 let r=familySetupSearch(state,'marsh');assert.deepEqual(r.branches.map(b=>b.id),['b-marsh']);assert.equal(r.exact.id,'b-marsh');assert.equal(r.canCreate,false);
 r=familySetupSearch(state,'juniper');assert.deepEqual(r.households.map(h=>h.id),['h-other']);assert.equal(r.canCreate,true);
 r=familySetupSearch(state,'the marsh family');assert.equal(r.canCreate,false);
});

test('preview placement follows the same authority as the Worker',()=>{
 let state=base();
 assert.throws(()=>branchPreview(state,{type:'CREATE_BRANCH',name:'marsh'}),/already exists/);
 state=branchPreview(state,{type:'CREATE_BRANCH',name:'Quill',householdId:'h-ivy'});
 const quill=state.branches.find(b=>b.name==='Quill');assert.deepEqual(quill.householdIds,['h-ivy']);
 assert.throws(()=>branchPreview(state,{type:'ATTACH_BRANCH_HOUSEHOLD',branchId:quill.id,householdId:'h-quill'}),/Only a head/);
 assert.equal(canPlaceHousehold(state,state.households[1]),false);
 assert.throws(()=>branchPreview(state,{type:'RENAME_BRANCH',branchId:quill.id,name:'Q'}),/leaders/);
 const leader={...state,previewRoleView:'leader'};
 const attached=branchPreview(leader,{type:'ATTACH_BRANCH_HOUSEHOLD',branchId:quill.id,householdId:'h-quill'});
 assert.deepEqual(attached.branches.find(b=>b.id===quill.id).householdIds,['h-ivy','h-quill']);
 assert.deepEqual(attached.households,state.households,'placement never changes household membership');
 assert.throws(()=>branchPreview(attached,{type:'REMOVE_BRANCH',branchId:quill.id}),/Move its households out/);
 assert.equal(branchPreview(leader,{type:'UNKNOWN'}),null);
});
