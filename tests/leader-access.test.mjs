import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccessLeaderTools,canOpenPlannerTools} from '../src/leader-access.js';
import {initialState} from '../src/data-adapter.js';
test('only Admins and Leaders see shared editor and Leader Tools',()=>{
 const preview=initialState();assert.equal(canAccessLeaderTools(preview),false);
 preview.selfId='sheldon';assert.equal(canAccessLeaderTools(preview),false);
 preview.members.find(m=>m.id==='sheldon').leader=true;assert.equal(canAccessLeaderTools(preview),false);preview.previewRoleView='leader';assert.equal(canAccessLeaderTools(preview),true);
 for(const capabilities of [{manageReunion:true},{treasurer:true},{moderate:true},{}])assert.equal(canAccessLeaderTools({mode:'live',selfId:'regular',members:[],capabilities}),false);
 for(const capabilities of [{leaderTools:true},{manageMembers:true}])assert.equal(canAccessLeaderTools({mode:'live',selfId:'admin',members:[],capabilities}),true);
});
test('Planners and Treasurers reach their own Leader Tools without shared-page editing',()=>{
 for(const capabilities of [{manageReunion:true},{treasurer:true},{manageCalendar:true}]){const state={mode:'live',selfId:'organizer',members:[],capabilities};assert.equal(canOpenPlannerTools(state),true);assert.equal(canAccessLeaderTools(state),false,'shared-page editing is not widened')}
 for(const capabilities of [{moderate:true},{},{post:true}])assert.equal(canOpenPlannerTools({mode:'live',selfId:'regular',members:[],capabilities}),false);
 assert.equal(canOpenPlannerTools({mode:'live',selfId:'leader',members:[],capabilities:{treasurer:true},viewAsMember:true}),false,'member view hides organizer tools');
});
