import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {initialState} from '../src/data-adapter.js';
import {api} from '../src/live-adapter.js';
import {readWithRecovery,transientReadError} from '../src/live-read-recovery.js';
const storage=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status});
const live=(id='alice',version=0)=>({...initialState(),mode:'live',selfId:id,version});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
let bundle;
async function host(fetcher,{state=live(),preview=false,effects=false}={}){
 if(!bundle){const result=await build({entryPoints:[process.env.GW_LOADING_ADAPTER_SOURCE||new URL('../src/live-adapter.js',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'hooks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'hooks'}));b.onLoad({filter:/.*/,namespace:'hooks'},()=>({contents:'const h=globalThis.__gwLoadingTest;export const useState=h.useState,useRef=h.useRef,useEffect=h.useEffect;export default {};'}))}}]});bundle=result.outputFiles[0].text}
 const saved={fetch:globalThis.fetch,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,harness:globalThis.__gwLoadingTest};
 const slots=[],queue=[],cleanups=[];let cursor=0,first=true;
 globalThis.__gwLoadingTest={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=i===0?state:typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useEffect(fn){if(first&&effects)queue.push(fn)}};
 globalThis.fetch=fetcher;globalThis.localStorage=storage();globalThis.sessionStorage=storage();if(preview)sessionStorage.setItem('gw-active-mode','preview');
 const module=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64')+'#'+crypto.randomUUID());
 return{render(){cursor=0;const value=module.useFamilyData();if(first){first=false;for(const fn of queue)cleanups.push(fn())}return value},async flush(){for(let i=0;i<30;i++)await Promise.resolve()},close(){for(const fn of cleanups)fn?.();globalThis.fetch=saved.fetch;globalThis.localStorage=saved.localStorage;globalThis.sessionStorage=saved.sessionStorage;if(saved.harness===undefined)delete globalThis.__gwLoadingTest;else globalThis.__gwLoadingTest=saved.harness}};
}
const normal=(path,version=1)=>response(path==='/api/config'?{configured:true,email:true,providers:[]}:path==='/api/session'?{status:'active',user:{id:'alice'}}:live('alice',version));

test('network and temporary gateway read failures recover once; generic server errors do not silently retry',async()=>{
 for(const failure of [new TypeError('offline'),Object.assign(new Error('temporary'),{status:503})]){let calls=0;assert.equal(await readWithRecovery(async()=>{if(++calls===1)throw failure;return 'loaded'},{retryDelayMs:0}), 'loaded');assert.equal(calls,2)}
 for(const status of [400,401,403,404,429,500]){let calls=0;const failure=Object.assign(new Error('real failure'),{status});await assert.rejects(()=>readWithRecovery(async()=>{calls++;throw failure},{retryDelayMs:0}),e=>e===failure);assert.equal(calls,1)}
 assert.equal(transientReadError(new DOMException('abort','AbortError')),false);
});
test('a persistent transient error remains visible after exactly two attempts',async()=>{
 let calls=0;const failure=Object.assign(new Error('Service unavailable'),{status:503});await assert.rejects(()=>readWithRecovery(async()=>{calls++;throw failure},{retryDelayMs:0}),e=>e===failure);assert.equal(calls,2);
});
test('read timeout is bounded, retried once and preserves a final timeout failure',async()=>{
 let calls=0;await assert.rejects(()=>readWithRecovery(signal=>new Promise((resolve,reject)=>{calls++;signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')),{once:true})}),{timeoutMs:5,retryDelayMs:0}),{name:'TimeoutError'});assert.equal(calls,2);
});
test('canceling an obsolete request also cancels backoff without making another read',async()=>{
 const cancel=new AbortController();let calls=0;const pending=readWithRecovery(async()=>{calls++;throw new TypeError('offline')},{signal:cancel.signal,retryDelayMs:1000});await Promise.resolve();cancel.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
});
test('a successful refresh clears only its own previous loading failure',async()=>{
 let failing=true;const h=await host(path=>Promise.resolve(new URL(path,'https://fixture.invalid').pathname==='/api/state'&&failing?response({error:'Request could not be completed'},500):normal(path)));
 try{await h.render().refresh();assert.equal(h.render().error,'Request could not be completed');failing=false;await h.render().refresh();assert.equal(h.render().error,'');assert.equal(h.render().state.version,1);h.render().setError('Your unsent changes are still here.');await h.render().refresh();assert.equal(h.render().error,'Your unsent changes are still here.')}finally{h.close()}
});
test('a failed configuration refresh does not falsify last known service configuration',async()=>{
 let failing=false;const h=await host(path=>Promise.resolve(path==='/api/config'&&failing?response({error:'Configuration service error'},500):normal(path)));
 try{await h.render().refresh();failing=true;await h.render().refresh();assert.equal(h.render().config.configured,true);assert.equal(h.render().error,'Configuration service error')}finally{h.close()}
});
test('real 401, 403 and 500 read failures are displayed and preserved until successful recovery',async()=>{
 for(const status of [401,403,500]){let reads=0;const h=await host(path=>{if(new URL(path,'https://fixture.invalid').pathname==='/api/state'){reads++;return Promise.resolve(response({error:'Failure '+status},status))}return Promise.resolve(normal(path))});try{await h.render().refresh();assert.equal(h.render().error,'Failure '+status);assert.equal(reads,1)}finally{h.close()}}
});
test('newest refresh wins; a late previous success cannot overwrite state or a local draft',async()=>{
 const old=deferred(),newer=deferred(),signals=[];let reads=0;const h=await host((path,options)=>{if(new URL(path,'https://fixture.invalid').pathname==='/api/state'){signals.push(options.signal);return ++reads===1?old.promise:newer.promise}return Promise.resolve(normal(path))});
 try{const first=h.render().refresh();await h.flush();const second=h.render().refresh();await h.flush();assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);await h.render().dispatch({type:'SET_DRAFT',kind:'post',value:'Keep this draft'});newer.resolve(response(live('alice',2)));await second;old.resolve(response(live('alice',1)));await first;assert.equal(h.render().state.version,2);assert.equal(h.render().state.drafts.post,'Keep this draft');assert.equal(h.render().error,'')}finally{h.close()}
});
test('an aborted obsolete request failure cannot replace current successful state or surface an error',async()=>{
 const old=deferred();let reads=0;const h=await host(path=>new URL(path,'https://fixture.invalid').pathname==='/api/state'&&++reads===1?old.promise:Promise.resolve(normal(path,2)));
 try{const first=h.render().refresh();await h.flush();await h.render().refresh();old.reject(new DOMException('navigation canceled','AbortError'));await first;assert.equal(h.render().state.version,2);assert.equal(h.render().error,'');assert.equal(h.render().loading,false)}finally{h.close()}
});
test('latest failing refresh is not replaced by a late older successful snapshot',async()=>{
 const old=deferred();let reads=0;const h=await host(path=>new URL(path,'https://fixture.invalid').pathname==='/api/state'?(++reads===1?old.promise:Promise.resolve(response({error:'Latest real error'},500))):Promise.resolve(normal(path)));
 try{const first=h.render().refresh();await h.flush();await h.render().refresh();old.resolve(response(live('alice',8)));await first;assert.equal(h.render().error,'Latest real error');assert.equal(h.render().state.version,0)}finally{h.close()}
});
test('preview transition invalidates pending live reads and does not leak a late error',async()=>{
 const old=deferred();const h=await host(path=>new URL(path,'https://fixture.invalid').pathname==='/api/state'?old.promise:Promise.resolve(normal(path)));
 try{const first=h.render().refresh();await h.flush();h.render().enterPreview();old.reject(new Error('Old account error'));await first;assert.equal(h.render().preview,true);assert.equal(h.render().state.mode,'preview');assert.equal(h.render().error,'')}finally{h.close()}
});
test('leaving preview immediately requests live state despite the previous render closure',async()=>{
 let reads=0;const h=await host(path=>{if(new URL(path,'https://fixture.invalid').pathname==='/api/state')reads++;return Promise.resolve(normal(path))},{state:initialState(),preview:true});
 try{h.render().leavePreview();await h.flush();assert.equal(reads,1);assert.equal(h.render().state.mode,'live')}finally{h.close()}
});
test('unmount aborts live reads and late completion cannot update hook state',async()=>{
 const old=deferred();let signal;const h=await host((path,options)=>{if(new URL(path,'https://fixture.invalid').pathname==='/api/state'){signal=options.signal;return old.promise}return Promise.resolve(normal(path))},{effects:true});
 h.render();await h.flush();h.close();assert.equal(signal.aborted,true);old.resolve(response(live('alice',20)));await h.flush();assert.equal(h.render().state.version,0);
});
test('safe server support references survive API errors without reflecting arbitrary response strings',async()=>{
 const original=globalThis.fetch;try{for(const id of ['cc320bed-c6ba-4fd4-bb14-6c429b068bff','private@example.test']){globalThis.fetch=async()=>response({error:'Request could not be completed',requestId:id},500);await assert.rejects(()=>api('/api/state'),e=>e.status===500&&(id.includes('@')?!e.message.includes(id):e.requestId===id&&e.message.includes(id)))}}finally{globalThis.fetch=original}
});

test('acknowledged command prevents older reads from overwriting the saved result',async()=>{
 const old=deferred();let reads=0;const h=await host(path=>new URL(path,'https://fixture.invalid').pathname==='/api/state'?(++reads===1?old.promise:Promise.resolve(response(live('alice',2)))):path==='/api/commands'?Promise.resolve(response({ok:true})):Promise.resolve(normal(path)));
 try{const first=h.render().refresh();await h.flush();assert.equal(await h.render().dispatch({type:'RSVP',value:{count:2,status:'Planning to come'}}),true);old.resolve(response(live('alice',1)));await first;assert.equal(h.render().state.version,2);assert.equal(h.render().error,'')}finally{h.close()}
});
test('a newer refresh supersedes an acknowledged command read-back without a stale error',async()=>{
 const old=deferred();let reads=0;const h=await host(path=>new URL(path,'https://fixture.invalid').pathname==='/api/state'?(++reads===1?old.promise:Promise.resolve(response(live('alice',3)))):path==='/api/commands'?Promise.resolve(response({ok:true})):Promise.resolve(normal(path)));
 try{const save=h.render().dispatch({type:'RSVP',value:{count:2,status:'Planning to come'}});for(let i=0;i<100&&reads===0;i++){await h.flush();await new Promise(r=>setTimeout(r,1))}assert.equal(reads,1);await h.render().refresh();old.reject(new TypeError('Obsolete read-back failed'));assert.equal(await save,true);assert.equal(h.render().state.version,3);assert.equal(h.render().error,'')}finally{h.close()}
});

test('a late older success cannot overwrite the latest refresh snapshot',async()=>{
 const old=deferred();let reads=0;const h=await host(path=>new URL(path,'https://fixture.invalid').pathname==='/api/state'&&++reads===1?old.promise:Promise.resolve(normal(path,2)));
 try{const first=h.render().refresh();await h.flush();await h.render().refresh();old.resolve(response(live('alice',1)));await first;assert.equal(h.render().state.version,2)}finally{h.close()}
});

test('account replacement clears old private state even when the new state read fails',async()=>{
 const h=await host(path=>Promise.resolve(path==='/api/session'?response({status:'active',user:{id:'bob'}}):new URL(path,'https://fixture.invalid').pathname==='/api/state'?response({error:'New account read failed'},500):normal(path)));
 try{await h.render().refresh();assert.notEqual(h.render().state.selfId,'alice');assert.notEqual(h.render().state.mode,'live');assert.equal(h.render().error,'New account read failed')}finally{h.close()}
});
test('a state result for a different cookie identity cannot be committed with the previous session',async()=>{
 const h=await host(path=>Promise.resolve(new URL(path,'https://fixture.invalid').pathname==='/api/state'?response(live('bob',7)):normal(path)));
 try{await h.render().refresh();assert.notEqual(h.render().state.selfId,'bob');assert.match(h.render().error,/signed-in account changed/)}finally{h.close()}
});
test('a null error body retains its HTTP500 status and cannot be mistaken for a retryable fetch TypeError',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return response(null,500)};
 try{await assert.rejects(()=>readWithRecovery(()=>api('/api/state'),{retryDelayMs:0}),e=>e.status===500);assert.equal(calls,1)}finally{globalThis.fetch=original}
});
