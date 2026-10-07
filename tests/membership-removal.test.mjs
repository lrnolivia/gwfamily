import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {initialState,reducer,resetPreview,saveLocalState,loadLocalState} from '../src/data-adapter.js';
import {leaderPreview} from '../src/leader-preview.js';
import {membershipStatus,previewMembershipCommand} from '../src/membership-model.js';
import {directoryPeople} from '../src/member-directory.js';
import {filterDirectoryMembers,managementDirectoryMembers} from '../src/people-directory-model.js';

const request=(state,type,id,revision=0)=>({type,id,expectedAccountId:state.selfId,confirmedMemberId:id,expectedRevision:revision});
function setup(){const state=initialState();return {state,id:state.members.find(m=>m.id!==state.selfId&&!m.managedBy).id}}

test('preview removal keeps history and an admin-review record, hides the public directory entry, and supports removed filter',()=>{
 const {state,id}=setup(),next=reducer(state,request(state,'REMOVE_MEMBER',id));
 assert.equal(state.members.find(m=>m.id===id).previewRemovedAt,undefined);
 assert.equal(next.members.length,state.members.length);assert.equal(next.posts,state.posts);assert.equal(next.memories,state.memories);assert.equal(next.order,state.order);assert.equal(next.previewOrders,state.previewOrders);assert.equal(next.previewFeeReports,state.previewFeeReports);
 assert.equal(directoryPeople(next).some(m=>m.id===id),false);
 const managed=managementDirectoryMembers(next,leaderPreview(next).members),removed=filterDirectoryMembers(next,managed,{status:'removed'});
 assert.deepEqual(removed.map(m=>m.id),[id]);assert.equal(membershipStatus(removed[0]),'removed');assert.equal(removed[0].status,'suspended');
 assert.ok(!filterDirectoryMembers(next,managed,{status:'suspended'}).some(m=>m.id===id));
});

test('preview restore is pending without roles or posting, and only separate approval brings the person back',()=>{
 const {state,id}=setup(),removed=reducer(state,request(state,'REMOVE_MEMBER',id)),restored=reducer(removed,request(removed,'RESTORE_MEMBER',id,1));
 const member=restored.members.find(m=>m.id===id);assert.equal(member.previewStatus,'pending');assert.equal(member.previewRemovedAt,null);assert.deepEqual(member.previewRoles,[]);assert.equal(member.canPost,false);assert.equal(member.leader,false);assert.equal(member.membershipRevision,2);assert.equal(directoryPeople(restored).some(m=>m.id===id),false);
 const approved=reducer(restored,{type:'APPROVE_MEMBER',id,status:'active',roles:[],canPost:false});assert.equal(directoryPeople(approved).some(m=>m.id===id),true);
});

test('preview rejects self, stale confirmation, wrong account, unintended target and direct approval of removed membership',()=>{
 const {state,id}=setup();
 for(const patch of [{id:state.selfId,confirmedMemberId:state.selfId},{expectedRevision:1},{expectedAccountId:'someone-else'},{confirmedMemberId:'someone-else'}])assert.throws(()=>reducer(state,{...request(state,'REMOVE_MEMBER',id),...patch}));
 assert.throws(()=>previewMembershipCommand({...state,mode:'live'},request(state,'REMOVE_MEMBER',id)),/local only/);
 const removed=reducer(state,request(state,'REMOVE_MEMBER',id));assert.throws(()=>reducer(removed,{type:'APPROVE_MEMBER',id,status:'active',roles:['admin'],canPost:true}),/Restore this membership/);
 assert.throws(()=>reducer(removed,request(removed,'RESTORE_MEMBER',id,0)),/changed/);
});

test('preview removal persists locally and preview reset restores the samples',()=>{
 const {state,id}=setup(),removed=reducer(state,request(state,'REMOVE_MEMBER',id)),values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 assert.equal(saveLocalState(removed,storage).ok,true);assert.ok(loadLocalState(storage).members.find(m=>m.id===id).previewRemovedAt);
 const reset=resetPreview(storage);assert.equal(reset.members.find(m=>m.id===id).previewRemovedAt,undefined);assert.equal(values.size,0);
});

test('review requires named target confirmation in the existing sheet and keeps Enter and top check separate from removal',()=>{
 const source=readFileSync(new URL('../src/manage-family.jsx',import.meta.url),'utf8');
 assert.match(source,/membershipStatus\(member\)/);assert.match(source,/setConfirming\('REMOVE_MEMBER'\)/);assert.match(source,/>Remove member<\/Button>/);
 assert.match(source,/Remove \$\{m.name\}\?/);assert.match(source,/\{m.name\} \(\{m.email\}\)/);
 assert.match(source,/Their sign-in account, existing posts, messages, orders, and payment records will be kept/);
 assert.match(source,/confirmedMemberId:m.id,expectedAccountId:state.selfId,expectedRevision:m.membership_revision\?\?0/);
 assert.match(source,/confirming!==type\)return/);assert.match(source,/onClick=\{\(\)=>changeMembership\(confirming\)\}/);
 assert.match(source,/if\(!removed&&!confirming&&m.status==='active'\)void save\('active'\)/);
 assert.match(source,/label:!removed&&!confirming&&m.status==='active'\?'Save membership':null/);
 assert.match(source,/setConfirming\(null\);setError\(''\)/);assert.match(source,/saveLock.current\|\|!allowed/);
 assert.ok(source.includes("accountKey===state.mode+':'+state.selfId"));
 assert.match(source,/state.capabilities\?\.manageMembers/);assert.match(source,/m.id!==selfId/);
 assert.doesNotMatch(source,/<dialog|window.confirm|api\('\/api\/commands'/);
});

test('removed people have an explicit review restoration flow with no optimistic live preview mutation',()=>{
 const source=readFileSync(new URL('../src/manage-family.jsx',import.meta.url),'utf8'),adapter=readFileSync(new URL('../src/live-adapter.js',import.meta.url),'utf8'),filters=readFileSync(new URL('../src/people-filters.jsx',import.meta.url),'utf8');
 assert.match(source,/setConfirming\('RESTORE_MEMBER'\)/);assert.match(source,/This brings the membership back as pending/);assert.match(source,/separately approves them/);assert.match(source,/'Confirm removal':'Restore for review'/);
 assert.match(adapter,/\['APPROVE_MEMBER','REMOVE_MEMBER','RESTORE_MEMBER'\].includes\(action.type\)\?ref.current:reducer/);
 assert.match(filters,/\['removed','Removed'\]/);
});

function handlerHarness({allowed=true,confirming='REMOVE_MEMBER',saveResult=true,saveError=false}={}){
 const source=readFileSync(new URL('../src/manage-family.jsx',import.meta.url),'utf8');
 const handler=source.slice(source.indexOf(' async function changeMembership(type){'),source.indexOf(' return <form id={formId} className="stack membership-review"'));
 const calls=[],errors=[],busy=[],saveLock={current:false};let finish,saved=0;
 const pending=new Promise(resolve=>{finish=resolve});
 const context={allowed,confirming,saveLock,m:{id:'reviewed-person',membership_revision:7},state:{selfId:'owner'},setSaving:value=>busy.push(value),setError:value=>errors.push(value),onSaved:()=>saved++,onSave:async action=>{calls.push(JSON.parse(JSON.stringify(action)));await pending;if(saveError)throw Error('Simulated save failure');return saveResult}};
 const run=vm.runInNewContext(handler+'; changeMembership',context);
 return {run,finish,calls,errors,busy,saveLock,get saved(){return saved}};
}

test('actual removal handler ignores double activation while pending and submits exact confirmation only once',async()=>{
 const h=handlerHarness(),first=h.run('REMOVE_MEMBER');await h.run('REMOVE_MEMBER');assert.equal(h.calls.length,1);assert.equal(h.saveLock.current,true);
 assert.deepEqual(h.calls[0],{type:'REMOVE_MEMBER',id:'reviewed-person',confirmedMemberId:'reviewed-person',expectedAccountId:'owner',expectedRevision:7});
 h.finish();await first;assert.equal(h.saved,1);assert.equal(h.saveLock.current,false);assert.deepEqual(h.busy,[true,false]);
});

test('actual removal handler cannot mutate from an unconfirmed, cancelled, or unauthorized review',async()=>{
 for(const options of [{confirming:null},{confirming:'RESTORE_MEMBER'},{allowed:false}]){const h=handlerHarness(options);await h.run('REMOVE_MEMBER');assert.equal(h.calls.length,0);assert.equal(h.saved,0)}
});

test('actual removal handler keeps failed confirmation open and unlocks retry without claiming success',async()=>{
 for(const options of [{saveResult:false},{saveError:true}]){const h=handlerHarness(options),run=h.run('REMOVE_MEMBER');h.finish();await run;assert.equal(h.saved,0);assert.equal(h.saveLock.current,false);assert.match(h.errors.at(-1),/could not be changed/)}
});
