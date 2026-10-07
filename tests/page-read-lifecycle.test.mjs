import test from 'node:test';
import assert from 'node:assert/strict';
import {pageReadLifecycle} from '../src/page-read-lifecycle.js';
import {pageContentRequest} from '../src/page-content-model.js';

test('outgoing document cancels all reads and refuses new polls until restored',()=>{
 const reads=pageReadLifecycle(),first=reads.begin(),second=reads.begin();
 reads.suspend();assert.ok(first.signal.aborted&&second.signal.aborted);assert.equal(reads.begin(),null);
 reads.resume();assert.equal(reads.begin().signal.aborted,false);
});
test('account transition cancels old reads without suspending new-account loading',()=>{
 const reads=pageReadLifecycle(),old=reads.begin();reads.cancel();const next=reads.begin();
 assert.equal(old.signal.aborted,true);assert.equal(next.signal.aborted,false);
 reads.finish(next);reads.cancel();assert.equal(next.signal.aborted,false);
});
test('request composes caller cancellation with its bounded timeout',async()=>{
 const caller=new AbortController();let signal;
 const pending=pageContentRequest('/api/page-content/home',{signal:caller.signal,fetchImpl:async(_path,options)=>{
  signal=options.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true}));
 }});
 assert.notEqual(signal,caller.signal);caller.abort();await assert.rejects(pending);assert.equal(signal.aborted,true);
});
test('caller signal cannot disable the request timeout',async()=>{
 const caller=new AbortController();
 const keepAlive=setTimeout(()=>{},1000);
 try{await assert.rejects(pageContentRequest('/api/page-content/home',{signal:caller.signal,timeoutMs:5,fetchImpl:async(_path,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError')),{once:true}))}),/timed out/);assert.equal(caller.signal.aborted,false)}finally{clearTimeout(keepAlive)}
});
