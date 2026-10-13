import test from 'node:test';import assert from 'node:assert/strict';
import {createMemoryBatch,batchSummary,stepBatchItem,updateBatchItem,retryStep,savedMemoryIds,memoryFromBatchItem,MEMORY_BATCH_LIMIT} from '../src/memory-batch-model.js';
// Synthetic files only.
const file=(name,type='image/png')=>({name,type});
let n=0;const id=()=>'id-'+(++n);
async function run(batch,key,deps){let current=batch;await stepBatchItem(current.items.find(i=>i.key===key),deps,patch=>{current=updateBatchItem(current,key,patch)});return current}

test('batches cap at the limit and report skipped files honestly',()=>{
 const batch=createMemoryBatch(Array.from({length:12},(_,i)=>file('f'+i+'.png')),id);
 assert.equal(batch.items.length,MEMORY_BATCH_LIMIT);assert.equal(batch.skipped,2);
 assert.match(batchSummary(batch).message,/2 more files weren’t added; choose up to 10/);
});

test('partial success is reported as partial; failures keep their step',async()=>{
 let batch=createMemoryBatch([file('a.png'),file('notes.txt','text/plain'),file('c.png')],id),uploads=0,saves=0;
 const deps={upload:async f=>{uploads++;return {upload:{url:'data:'+f.name,type:f.type},metadata:{}}},save:async item=>{saves++;return item.name!=='c.png'}};
 for(const item of batch.items)batch=await run(batch,item.key,deps);
 assert.deepEqual(batch.items.map(i=>i.status),['saved','upload-failed','save-failed']);
 assert.equal(uploads,2,'an unsupported file is never uploaded');
 const summary=batchSummary(batch);assert.equal(summary.message,'1 of 3 memories added. 2 need a retry below.');assert.equal(summary.done,true);
 assert.deepEqual(batch.items.map(retryStep),[null,'upload','save']);
});

test('retrying a failed save reuses the upload and memory id; nothing is uploaded twice',async()=>{
 let batch=createMemoryBatch([file('c.png')],id),uploads=0,ok=false;const seen=[];
 const deps={upload:async f=>{uploads++;return {upload:{url:'data:'+f.name,type:f.type},metadata:{capturedDate:'2001-02-03'}}},save:async item=>{seen.push(memoryFromBatchItem(item,'ivy'));return ok}};
 const key=batch.items[0].key;batch=await run(batch,key,deps);assert.equal(batch.items[0].status,'save-failed');
 ok=true;batch=await run(batch,key,deps);
 assert.equal(batch.items[0].status,'saved');assert.equal(uploads,1);
 assert.equal(seen[0].id,seen[1].id,'the same memory id is retried');assert.equal(seen[1].image,'data:c.png');assert.equal(seen[1].capturedDate,'2001-02-03');assert.equal(seen[1].authorId,'ivy');
 assert.deepEqual(savedMemoryIds(batch),[seen[0].id]);assert.equal(batchSummary(batch).message,'1 memory added.');
 batch=await run(batch,key,deps);assert.equal(uploads,1);assert.equal(seen.length,2,'a saved item is never saved again');
});

test('an account switch stops before saving',async()=>{
 let batch=createMemoryBatch([file('a.png')],id);
 batch=await run(batch,batch.items[0].key,{upload:async()=>({upload:{url:'u',type:'image/png'},metadata:{}}),save:async()=>{throw Error('must not save')},canSave:()=>false});
 assert.equal(batch.items[0].status,'save-failed');assert.ok(batch.items[0].upload,'the upload is kept for a retry');
});
