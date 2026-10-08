import test from 'node:test';
import assert from 'node:assert/strict';
import {requestReference} from '../src/request-reference.js';
import {pageContentRequest} from '../src/page-content-model.js';
import {conversationIndexReads} from '../src/messaging-model.js';
import {initialReadRecovery,recoverableInitialRead} from '../src/live-read-recovery.js';
const id='01234567-89ab-cdef-0123-456789abcdef';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
test('page errors retain only a validated server correlation reference, including malformed replies',async()=>{
 assert.equal(requestReference({requestId:'private payload'},{headers:new Headers({'X-Request-ID':id})}),id);
 assert.equal(requestReference({requestId:'private payload'},{headers:new Headers({'X-Request-ID':'bad'})}),null);
 await assert.rejects(pageContentRequest('/api/page-content/home',{fetchImpl:async()=>new Response(JSON.stringify({error:{message:'Load failed'},requestId:id}),{status:500,headers:{'Content-Type':'application/json'}})}),error=>error.status===500&&error.requestId===id&&error.message.endsWith('Reference: '+id));
 await assert.rejects(pageContentRequest('/api/page-content/home',{fetchImpl:async()=>new Response('invalid',{status:502,headers:{'X-Request-ID':id}})}),error=>error.ambiguous&&error.requestId===id);
});
test('conversation polls coalesce per account and late success or failure cannot overwrite a newer account',async()=>{
 const reads=conversationIndexReads(),old=deferred(),next=deferred(),events=[];let requests=0;
 const a=reads.run('a',()=>{requests++;return old.promise},value=>events.push(value),error=>events.push(error.message));
 assert.equal(reads.run('a',()=>{throw Error('Duplicate request')},()=>{},()=>{}),a);await Promise.resolve();assert.equal(requests,1);
 const b=reads.run('b',()=>next.promise,value=>events.push(value),error=>events.push(error.message));next.resolve('new account');await b;old.resolve('old account');await a;assert.deepEqual(events,['new account']);
 const failure=deferred(),c=reads.run('b',()=>failure.promise,value=>events.push(value),error=>events.push(error.message));await Promise.resolve();reads.cancel();failure.reject(Error('obsolete error'));await c;assert.deepEqual(events,['new account']);
});
test('slow same-account polls complete once and can refresh again after completion',async()=>{
 const reads=conversationIndexReads(),slow=deferred(),events=[];
 const first=reads.run('a',()=>slow.promise,value=>events.push(value),()=>{});assert.equal(first,reads.run('a',()=>Promise.resolve('new'),value=>events.push(value),()=>{}));slow.resolve('slow');await first;
 await reads.run('a',()=>Promise.resolve('fresh'),value=>events.push(value),()=>{});assert.deepEqual(events,['slow','fresh']);
});
test('bootstrap retries are bounded, skip authorization errors, and stop cleanly',async()=>{
 let timer=null,calls=0,retry=true;const recovery=initialReadRecovery({request:async()=>{calls++},canRun:()=>true,shouldRetry:()=>retry,setTimer:fn=>(timer=fn,1),clearTimer:()=>{timer=null}});
 recovery.schedule();for(let n=0;n<3;n++){const tick=timer;timer=null;assert.ok(tick);await tick()}assert.equal(calls,3);assert.equal(timer,null);
 retry=false;await recovery.wake();assert.equal(calls,3);assert.equal(recoverableInitialRead({status:401}),false);assert.equal(recoverableInitialRead({status:403}),false);assert.equal(recoverableInitialRead({status:500}),true);
 retry=true;recovery.schedule();recovery.stop();assert.equal(timer,null);await recovery.wake();assert.equal(calls,3);
});
