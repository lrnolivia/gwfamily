import test from 'node:test';import assert from 'node:assert/strict';
import {isPreviewLeader,canEditMemoryDetails,memberViewHeaders,writeMemberView} from '../src/member-view-model.js';import {initialState,reducer} from '../src/data-adapter.js';import {canAccessLeaderTools} from '../src/leader-access.js';import {canManageCalendar} from '../src/calendar-model.js';
test('preview defaults to Member despite seeded Leader flags; explicit switch grants only isolated preview capabilities',()=>{
 const state=initialState();assert.equal(isPreviewLeader(state),false);assert.equal(canAccessLeaderTools(state),false);assert.equal(canManageCalendar(state),false);
 assert.throws(()=>reducer(state,{type:'DETAILS',details:{}}),/Switch to Leader/);
 const leader=reducer(state,{type:'SET_PREVIEW_ROLE_VIEW',value:'leader'});assert.equal(canAccessLeaderTools(leader),true);assert.equal(canManageCalendar(leader),true);assert.deepEqual(leader.members,state.members);
 assert.equal(canAccessLeaderTools({...leader,previewRoleView:'member'}),false);
});
test('member view transport is account-bound, reversible and stores no credentials/roles',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};assert.deepEqual(memberViewHeaders(storage),{});writeMemberView('fixture-account',true,storage);assert.deepEqual(memberViewHeaders(storage),{'X-GW-Member-View':'true','X-GW-Member-View-Account':'fixture-account'});writeMemberView('fixture-account',false,storage);assert.deepEqual(memberViewHeaders(storage),{});
});

test('ordinary nonuploaders cannot edit either memory type; owners and moderators retain controls',()=>{const member={...initialState(),selfId:'fixture-reader',previewRoleView:'member'};for(const mediaType of ['image/jpeg','application/pdf']){const memory={authorId:'fixture-owner',mediaType};assert.equal(canEditMemoryDetails(member,memory),false);assert.equal(canEditMemoryDetails({...member,selfId:memory.authorId},memory),true);assert.equal(canEditMemoryDetails({...member,previewRoleView:'leader'},memory),true);assert.equal(canEditMemoryDetails({...member,mode:'live',capabilities:{moderate:true}},memory),true);assert.equal(canEditMemoryDetails({...member,mode:'live',viewAsMember:true,capabilities:{moderate:true}},memory),false)}});

test('preview direct memory save enforces the existing uploader, ignoring a forged author field',()=>{const state={...initialState(),selfId:'fixture-reader',previewRoleView:'member',memories:[{id:'fixture-memory',authorId:'fixture-owner',image:'data:image/png;base64,AA=='}]};assert.throws(()=>reducer(state,{type:'SAVE_MEMORY',memory:{...state.memories[0],authorId:state.selfId}}),/uploader or a moderator/);const owner={...state,selfId:'fixture-owner'};assert.equal(reducer(owner,{type:'SAVE_MEMORY',memory:{...state.memories[0],title:'Fixture update'}}).memories[0].title,'Fixture update')});
