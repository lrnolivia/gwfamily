import test from 'node:test';
import assert from 'node:assert/strict';
import {canRehearseFirstLoad} from '../src/first-load-policy.mjs';
const environment={BOOTSTRAP_OWNER_EMAIL:'Owner@example.test'},session={user:{email:'owner@EXAMPLE.test',emailVerified:true}},member={status:'active'};
test('only the existing owner email gate plus active verified session enables rehearsal',()=>{
 assert.equal(canRehearseFirstLoad(environment,session,member),true);
 for(const status of ['new','pending','suspended','inactive',undefined])assert.equal(canRehearseFirstLoad(environment,session,{status}),false);
 for(const verified of [false,undefined,'true',1])assert.equal(canRehearseFirstLoad(environment,{user:{...session.user,emailVerified:verified}},member),false);
 for(const email of ['leader@example.test','admin@example.test','owner@example.test ',undefined,null,1])assert.equal(canRehearseFirstLoad(environment,{user:{email,emailVerified:true}},member),false);
 for(const ownerEmail of ['',undefined,null,1])assert.equal(canRehearseFirstLoad({BOOTSTRAP_OWNER_EMAIL:ownerEmail},session,member),false);
 assert.equal(canRehearseFirstLoad(environment,null,member),false);
 assert.equal(canRehearseFirstLoad(null,session,member),false);
});
test('roles and client flags cannot substitute for the existing server gate',()=>{
 assert.equal(canRehearseFirstLoad({}, {user:{email:'admin@example.test',emailVerified:true,canRehearseFirstLoad:true,roles:['admin'],leader:true}}, {status:'active',is_leader:1,roles_json:'["admin"]'}),false);
 const before=JSON.stringify({environment,session,member});canRehearseFirstLoad(environment,session,member);assert.equal(JSON.stringify({environment,session,member}),before);
});
