import test from 'node:test';import assert from 'node:assert/strict';
import {householdBadges,memberHouseholds} from '../src/household-badges.js';
// Fictional households only.
const state={selfId:'ivy',householdId:'h-b',primaryHouseholds:{rowan:'h-c'},
 households:[{id:'h-a',name:'Juniper & Wren',memberIds:['ivy','rowan']},{id:'h-b',name:'Harbor Home',memberIds:['ivy']},{id:'h-c',name:'Corwin',memberIds:['rowan','ivy']},{id:'h-d',name:'Cora',memberIds:[]}],
 householdRequests:[{id:'r',householdId:'h-d',requesterId:'ivy',kind:'join'}]};
test('up to two full household names, then +N; names are never shortened',()=>{
 const ivy=householdBadges(state,'ivy');
 assert.deepEqual(ivy.shown.map(h=>h.name),['Harbor Home','Juniper & Wren'],'default household first, full names');
 assert.equal(ivy.more,1);assert.deepEqual(ivy.others,['Corwin']);
 const rowan=householdBadges(state,'rowan');assert.deepEqual(rowan.shown.map(h=>h.id),['h-c','h-a']);assert.equal(rowan.more,0);
});
test('pending requests are not memberships; no households means no badges',()=>{
 assert.ok(!memberHouseholds(state,'ivy').some(h=>h.id==='h-d'));
 assert.deepEqual(householdBadges(state,'nobody'),{shown:[],more:0,others:[]});
});
