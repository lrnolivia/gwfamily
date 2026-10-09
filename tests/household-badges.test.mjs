import test from 'node:test';import assert from 'node:assert/strict';
import {householdInitials,compactHouseholdName,householdBadge,memberHouseholds} from '../src/household-badges.js';
// Fictional households only.
const state={selfId:'ivy',householdId:'h-b',primaryHouseholds:{rowan:'h-c'},
 households:[{id:'h-a',name:'Juniper & Wren',memberIds:['ivy','rowan']},{id:'h-b',name:'Harbor Home',memberIds:['ivy']},{id:'h-c',name:'Corwin',memberIds:['rowan']},{id:'h-d',name:'Cora',memberIds:[]}],
 householdRequests:[{id:'r',householdId:'h-d',requesterId:'ivy',kind:'join'}]};
test('initials: ampersand pairs, skipped filler words, two letters for one word',()=>{
 assert.equal(householdInitials('Juniper & Wren'),'J&W');assert.equal(householdInitials('The Harbor Household'),'Ha');assert.equal(householdInitials('Marsh Quill'),'MQ');assert.equal(householdInitials(''),'');
});
test('compact names fall back to the full name when initials collide',()=>{
 assert.equal(compactHouseholdName(state,state.households[0]),'J&W');
 assert.equal(compactHouseholdName(state,state.households[2]),'Corwin','Corwin and Cora both start with Co');
});
test('one primary household plus +N; pending requests are not memberships',()=>{
 assert.deepEqual(memberHouseholds(state,'ivy').map(h=>h.id),['h-b','h-a'],'the signed-in member sees their own default first');
 const ivy=householdBadge(state,'ivy');assert.equal(ivy.label,'Harbor Home');assert.equal(ivy.more,1);assert.deepEqual(ivy.others,['Juniper & Wren']);
 const rowan=householdBadge(state,'rowan',{compact:true});assert.equal(rowan.household.id,'h-c');assert.equal(rowan.label,'Corwin');assert.equal(rowan.more,1);
 assert.equal(householdBadge(state,'nobody'),null);
 assert.equal(householdBadge({...state,primaryHouseholds:{}},'rowan').household.id,'h-a','without a stored default the first membership leads');
});
