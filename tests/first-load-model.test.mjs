import test from 'node:test';
import assert from 'node:assert/strict';
import {firstLoadView,freshRehearsal,mayRehearseFirstLoad,rehearsalTransition} from '../src/first-load-model.js';
const trusted={canRehearseFirstLoad:true,signedIn:true,verified:true,status:'active',user:{id:'owner-session'}};
test('launch depends on the exact server boolean and a matching active verified session shape',()=>{
 assert.equal(mayRehearseFirstLoad(trusted),true);
 for(const flag of [false,undefined,'true',1])assert.equal(mayRehearseFirstLoad({...trusted,canRehearseFirstLoad:flag}),false);
 for(const patch of [{signedIn:false},{verified:false},{status:'pending'},{status:'suspended'},{user:null},{user:{id:''}}])assert.equal(mayRehearseFirstLoad({...trusted,...patch}),false);
 assert.equal(mayRehearseFirstLoad({signedIn:true,verified:true,status:'active',user:{id:'admin',roles:['admin'],leader:true}}),false);
});
test('each Fresh Start gets a new memory-only draft and completion does not loop',()=>{
 const fresh=freshRehearsal();assert.deepEqual(fresh,{stage:'welcome',draft:null});
 const profile=rehearsalTransition(fresh,{type:'START'});assert.equal(profile.stage,'profile');assert.notEqual(profile,fresh);
 const values={name:'Rehearsal member',birthday:'1990-01-02',privacyAccepted:true,birthdayCelebration:true,profileColor:'#27604a',photo:'blob:local-preview',email:'private@example.test',roles:['admin'],selfId:'real-account'};
 const before=JSON.stringify(values),ready=rehearsalTransition(profile,{type:'SAVE_DRAFT',values});
 assert.equal(ready.stage,'ready');assert.equal(ready.draft.name,'Rehearsal member');assert.equal(ready.draft.photoChosen,true);assert.ok(!('photo' in ready.draft));
 assert.equal(JSON.stringify(values),before);assert.ok(!('email' in ready.draft));assert.ok(!('roles' in ready.draft));assert.ok(!('selfId' in ready.draft));
 assert.equal(rehearsalTransition(ready,{type:'START'}),ready);assert.equal(rehearsalTransition(ready,{type:'SAVE_DRAFT',values:{name:'Late'}}),ready);
 assert.deepEqual(freshRehearsal(),{stage:'welcome',draft:null});
});
test('out-of-order and side-effect-bearing actions fail closed',()=>{
 const fresh=freshRehearsal();for(const type of ['SAVE_DRAFT','ENROLL','SIGN_IN','INVITE','SAVE_MEMBER','SET_BIRTHDAY_CELEBRATION','RESET_PREVIEW','REQUEST_PUSH_PERMISSION'])assert.equal(rehearsalTransition(fresh,{type,values:{}}),fresh);
 const profile=rehearsalTransition(fresh,{type:'START'}),ready=rehearsalTransition(profile,{type:'SAVE_DRAFT',values:{photo:'/api/media/real-photo'}});assert.equal(ready.draft.photoChosen,false);
});
test('post-sign-in loading, hydrated app, explicit replay and return are separate views',()=>{
 const data={config:{configured:true},preview:false,session:trusted,loading:false},state={mode:'live',selfId:'owner-session',profileComplete:true,route:{type:'you'},drafts:{post:'Keep me'}};
 assert.equal(firstLoadView({...data,loading:true},state).showFirstLoad,true);
 assert.equal(firstLoadView(data,state,null,true).showFirstLoad,true);
 assert.equal(firstLoadView(data,{mode:'preview'}).entryHydrating,true);
 assert.equal(firstLoadView(data,state).showFirstLoad,false);
 const review={accountId:'owner-session',mode:'load'};assert.equal(firstLoadView(data,state,review).showFirstLoad,true);assert.equal(firstLoadView(data,state,review).entryBusy,false);
 const before=JSON.stringify({data,state}),replay=firstLoadView(data,state,{...review,mode:'rehearsal'});assert.equal(replay.rehearsing,true);assert.equal(replay.showFirstLoad,false);
 assert.equal(firstLoadView(data,state,null).showFirstLoad,false);assert.equal(JSON.stringify({data,state}),before);
});
test('rehearsal disappears for preview, revocation, lost capability and a replaced account',()=>{
 const data={config:{configured:true},preview:false,session:trusted,loading:false},state={mode:'live',selfId:'owner-session'},review={accountId:'owner-session',mode:'rehearsal'};
 for(const patch of [{preview:true},{config:{configured:false}},{session:{...trusted,status:'suspended'}},{session:{...trusted,canRehearseFirstLoad:false}},{session:{...trusted,user:{id:'other-owner-session'}}}]){
  const view=firstLoadView({...data,...patch},state,review);assert.equal(view.rehearsing,false);assert.equal(Boolean(view.entryReviewCurrent),false);
 }
});
test('failed initial state hydration offers recovery rather than an endless busy state',()=>{
 const data={config:{configured:true},preview:false,session:trusted,loading:false,error:'Couldn’t load the family.'},view=firstLoadView(data,{mode:'preview'});
 assert.equal(view.showFirstLoad,true);assert.equal(view.entryBusy,false);assert.equal(view.entryLoadError,data.error);
 assert.equal(firstLoadView(data,{mode:'preview'},null,true).entryBusy,true);
});
