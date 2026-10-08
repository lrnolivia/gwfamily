import test from 'node:test';
import assert from 'node:assert/strict';
import {documentReadLifecycle} from '../src/document-read-lifecycle.js';
import {readWithRecovery} from '../src/live-read-recovery.js';

function fixture(){
 const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';
 return {win,doc,lifecycle:documentReadLifecycle(win,doc),emit:event=>win.dispatchEvent(new Event(event))};
}
test('unload aborts an in-flight read and prevents the next poll or retry',async()=>{
 const {lifecycle,emit}=fixture(),controller=new AbortController();let requests=0;
 lifecycle.subscribe({pause:()=>controller.abort()});
 const request=()=>{requests++;return new Promise((resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(new TypeError('navigation aborted')), {once:true}))};
 const pending=readWithRecovery(request,{signal:controller.signal,retryDelayMs:0});
 emit('beforeunload');
 if(lifecycle.canRead())await request();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(requests,1);
 let latePaused=false;lifecycle.subscribe({pause:()=>{latePaused=true}});assert.equal(latePaused,true);
 lifecycle.dispose();
});
test('back-cache suspension survives focus and visibility until pageshow',()=>{
 const {lifecycle,emit,doc}=fixture();let resumes=0;
 lifecycle.subscribe({pause(){},resume(){resumes++}});
 emit('beforeunload');emit('pagehide');emit('focus');doc.dispatchEvent(new Event('visibilitychange'));
 assert.equal(lifecycle.canRead(),false);assert.equal(resumes,0);
 emit('pageshow');assert.equal(lifecycle.canRead(),true);assert.equal(resumes,1);lifecycle.dispose();
});
test('cancelled navigation resumes on focus while ordinary visibility does not suspend reads',()=>{
 const {lifecycle,emit,doc}=fixture();let pauses=0;
 const unsubscribe=lifecycle.subscribe({pause(){pauses++}});
 doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));assert.equal(pauses,0);
 emit('beforeunload');emit('focus');assert.equal(lifecycle.canRead(),false);
 doc.visibilityState='visible';emit('focus');assert.equal(lifecycle.canRead(),true);
 unsubscribe();emit('beforeunload');assert.equal(pauses,1);lifecycle.dispose();
});
