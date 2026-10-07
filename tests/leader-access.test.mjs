import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccessLeaderTools} from '../src/leader-access.js';
import {initialState} from '../src/data-adapter.js';
test('only Admins and Leaders see shared editor and Leader Tools',()=>{
 const preview=initialState();assert.equal(canAccessLeaderTools(preview),true);
 preview.selfId='sheldon';assert.equal(canAccessLeaderTools(preview),false);
 preview.members.find(m=>m.id==='sheldon').leader=true;assert.equal(canAccessLeaderTools(preview),true);
 for(const capabilities of [{manageReunion:true},{treasurer:true},{moderate:true},{}])assert.equal(canAccessLeaderTools({mode:'live',selfId:'regular',members:[],capabilities}),false);
 for(const capabilities of [{leaderTools:true},{manageMembers:true}])assert.equal(canAccessLeaderTools({mode:'live',selfId:'admin',members:[],capabilities}),true);
});
