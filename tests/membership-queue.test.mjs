import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {capturePendingMemberships,pendingApprovalCommand,approvePendingMemberships} from '../src/membership-queue-model.js';
import {previewMembershipCommand} from '../src/membership-model.js';
const member=(id,status='pending',extra={})=>({id,name:id,status,roles_json:'[]',membership_revision:0,...extra});
const records=[member('one'),member('two','pending',{roles_json:'["planner"]'}),member('active','active'),member('paused','suspended'),member('removed','pending',{removed_at:'2026-01-01'}),member('owner')];
const targets=()=>capturePendingMemberships(records,'owner');
const scope='live:owner:reunion';
const run=(options={})=>approvePendingMemberships({targets:targets(),accountId:'owner',scopeKey:scope,currentScope:()=>scope,dispatch:async()=>true,readMembers:async()=>records.map(m=>({...m,status:'active'})),...options});

test('capture contains only current pending nonself IDs, preserves roles, and excludes hidden lifecycle states',()=>{
 assert.deepEqual(targets().map(x=>x.id),['one','two']);
 assert.deepEqual(capturePendingMemberships(records,'owner',['two','active','removed','missing','two']).map(x=>x.id),['two']);
 const action=pendingApprovalCommand(targets()[1],'owner');assert.deepEqual(action,{type:'APPROVE_MEMBER',id:'two',status:'active',roles:['planner'],canPost:true,expectedStatus:'pending',expectedRevision:0,expectedAccountId:'owner'});
 assert.throws(()=>pendingApprovalCommand({...targets()[0],roles:null},'owner'));
});
test('queue is a finite sequential captured list and never expands to new arrivals',async()=>{
 const calls=[],progress=[];let inFlight=0;
 const result=await run({dispatch:async action=>{assert.equal(inFlight++,0);calls.push(action.id);await Promise.resolve();inFlight--;return true},readMembers:async()=>[member('one','active'),member('two','active'),member('late')],onProgress:(done,total)=>progress.push([done,total])});
 assert.deepEqual(calls,['one','two']);assert.deepEqual(progress,[[1,2],[2,2]]);assert.equal(result.verified,true);assert.deepEqual(result.active,['one','two']);
});
test('partial or ambiguous failure stops unsent work and reconciles without automatic retries',async()=>{
 for(const throws of [true,false]){const calls=[];const result=await run({dispatch:async action=>{calls.push(action.id);if(throws)throw Error('Lost response');return false},readMembers:async()=>[member('one','active'),member('two')]});assert.deepEqual(calls,['one']);assert.equal(result.stopped,true);assert.deepEqual(result.acknowledged,[]);assert.deepEqual(result.active,['one']);assert.deepEqual(result.waiting,['two']);assert.equal(result.verified,true)}
});
test('account change, revoked access or unmount stops remaining actions and old account reconciliation',async()=>{
 let current=scope,reads=0,calls=0;const result=await run({currentScope:()=>current,dispatch:async()=>{calls++;current=null;return true},readMembers:async()=>{reads++;return records}});assert.equal(calls,1);assert.equal(reads,0);assert.equal(result.verified,false);assert.equal(result.stopped,true);
 assert.equal((await run({currentScope:()=>null,dispatch:async()=>{throw Error('must not dispatch')}})).acknowledged.length,0);
});
test('failed readback stays unverified, while changed or absent targets require review',async()=>{
 const failed=await run({readMembers:async()=>{throw Error('offline')}});assert.equal(failed.verified,false);assert.equal(failed.active.length,0);assert.match(failed.reason,/Refresh/);
 const changed=await run({readMembers:async()=>[member('one','suspended')]});assert.deepEqual(changed.changed,['one','two']);
});
test('preview quick approval rejects stale revision, wrong account, changed status and new roles',()=>{
 const state={mode:'preview',selfId:'owner',members:[{id:'one',previewStatus:'pending',previewRoles:[],membershipRevision:0}]},command=pendingApprovalCommand(targets()[0],'owner');
 assert.equal(previewMembershipCommand(state,command).members[0].previewStatus,'active');
 for(const patch of [{expectedRevision:1},{expectedAccountId:'other'},{roles:['admin']}])assert.throws(()=>previewMembershipCommand(state,{...command,...patch}));
 assert.throws(()=>previewMembershipCommand({...state,members:[{...state.members[0],previewStatus:'suspended'}]},command));
});
test('actual UI handler prevents repeated clicks and blocks unreconciled retries',async()=>{
 const source=readFileSync(new URL('../src/membership-people.jsx',import.meta.url),'utf8'),handler=source.slice(source.indexOf(' async function approve('),source.indexOf(' async function refresh('));let finish,calls=0;const pending=new Promise(resolve=>finish=resolve),lock={current:false},results=[];
 const context={lock,allowed:true,data:{pending:false},needsRefresh:false,all:records,state:{selfId:'owner'},scopeKey:scope,currentScope:()=>scope,alive:{current:true},capturePendingMemberships,setBusy(){},setResult:value=>results.push(value),setProgress(){},setSelected(){},setNeedsRefresh(){},onSave(){},readMembers(){},approvePendingMemberships:async()=>{calls++;await pending;return {verified:true}}};
 const approve=vm.runInNewContext(handler+';approve',context),first=approve(['one']);await approve(['two']);assert.equal(calls,1);finish();await first;assert.equal(lock.current,false);assert.equal(results.at(-1).verified,true);
 context.needsRefresh=true;await approve();assert.equal(calls,1);
});
test('management card has no approval buttons and queue alone owns bulk actions and row approval',()=>{
 const source=readFileSync(new URL('../src/membership-people.jsx',import.meta.url),'utf8'),css=readFileSync(new URL('../src/membership-people.css',import.meta.url),'utf8');
 const sidebar=source.slice(source.indexOf('<aside'),source.indexOf('</aside>'));assert.doesNotMatch(sidebar,/<Button|approve\(/);assert.match(sidebar,/Membership lists/);assert.match(sidebar,/counts\[status\]/);
 assert.match(source,/active:'Active Members',pending:'Waiting for approval',suspended:'Paused memberships',removed:'Removed memberships'/);
 assert.match(source,/view==='pending'&&<div className="membership-approval-tools"/);assert.match(source,/Approve Selected \(/);assert.match(source,/Approve All \(/);assert.match(source,/including people hidden by filters/);assert.match(source,/'Review Membership':'Manage Membership'/);
 assert.match(css,/@media\(max-width:700px\)\{\.membership-management\{grid-template-columns:minmax\(0,1fr\)/);
});
