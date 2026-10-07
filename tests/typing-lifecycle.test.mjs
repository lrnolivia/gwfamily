import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

// Export the real private channel only in this test bundle. React and the app
// transport are stubbed; lifecycle listeners, queueing and request ownership run
// unchanged, including typingRequest's abort propagation and timeout.
let bundle;
async function channelHarness(t,{autoRead=true,ignoreAbort=false}={}){
 if(!bundle){
  const source=await readFile(new URL('../src/activity.jsx',import.meta.url),'utf8');
  const result=await build({stdin:{contents:source+'\nexport {channelFor};',resolveDir:new URL('../src/',import.meta.url).pathname,loader:'jsx'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'isolated-typing-lifecycle',setup(builder){
   builder.onResolve({filter:/^(react|\.\/ui-core\.jsx|\.\/live-adapter\.js)$/},args=>({path:args.path,namespace:'typing-harness'}));
   builder.onLoad({filter:/.*/,namespace:'typing-harness'},args=>({contents:args.path==='react'?'export const useCallback=()=>{},useEffect=()=>{},useRef=()=>{},useState=()=>{};export default {};':args.path.includes('ui-core')?'export const useApp=()=>{};':'export const api=globalThis.__gwTypingLifecycleTransport;'}));
  }}]});bundle=result.outputFiles[0].text;
 }
 const saved=Object.fromEntries(['document','window','__gwTypingLifecycleTransport'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 class Events extends EventTarget{
  listeners=new Map();
  addEventListener(type,listener,...rest){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);super.addEventListener(type,listener,...rest)}
  removeEventListener(type,listener,...rest){this.listeners.get(type)?.delete(listener);super.removeEventListener(type,listener,...rest)}
  get listenerCount(){return [...this.listeners.values()].reduce((sum,listeners)=>sum+listeners.size,0)}
 }
 const document=Object.assign(new Events(),{visibilityState:'visible'}),window=new Events(),calls=[],snapshots=[],cleanups=[];
 globalThis.document=document;globalThis.window=window;
 const result=(name='Bob',ttl=8000)=>({serverNow:Date.now(),typing:name?[{memberId:name.toLowerCase(),name,expiresAt:Date.now()+ttl}]:[]});
 globalThis.__gwTypingLifecycleTransport=(path,options)=>{
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
  const call={path,options,resolve,reject,aborted:false};calls.push(call);
  const abort=()=>{call.aborted=true;if(!ignoreAbort)reject(Object.assign(Error('Cancelled'),{name:'AbortError'}))};
  if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});
  if(autoRead&&options.method!=='POST')resolve(result(null));
  return promise.finally(()=>options.signal.removeEventListener('abort',abort));
 };
 const {channelFor}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64')+'#'+crypto.randomUUID());
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});
 const entry=channelFor('alice:posts:p1','/api/posts/p1/typing','alice'),source=Symbol('editor');
 const subscribe=listener=>{const unsubscribe=entry.subscribe(listener);let active=true;const close=()=>{if(active){active=false;unsubscribe()}};cleanups.push(close);return close};
 const unsubscribe=subscribe(value=>snapshots.push(value));
 const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
 t.after(async()=>{
  for(const close of cleanups)close();
  for(const call of calls)call.resolve(result(null));
  await flush();t.mock.timers.reset();
  for(const [key,descriptor]of Object.entries(saved))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 });
 return {entry,source,calls,snapshots,document,window,unsubscribe,subscribe,result,flush,
  get writes(){return calls.filter(call=>call.options.method==='POST')},
  get reads(){return calls.filter(call=>call.options.method!=='POST')},
  get latest(){return snapshots.at(-1)},
  emit(type,{persisted=false}={}){const event=new Event(type);Object.defineProperty(event,'persisted',{value:persisted});window.dispatchEvent(event)},
  visibility(value){document.visibilityState=value;document.dispatchEvent(new Event('visibilitychange'))},
  tick(ms){t.mock.timers.tick(ms)}
 };
}
const typing=call=>JSON.parse(call.options.body).typing;

for(const boundary of ['beforeunload','pagehide','dispose']){
 const end=h=>boundary==='dispose'?h.unsubscribe():h.emit(boundary);
 test(`${boundary} discards a queued typing start before the transport runs`,async t=>{
  const h=await channelHarness(t,{autoRead:false});h.entry.signal(h.source);end(h);
  await h.flush();h.tick(10000);await h.flush();
  assert.equal(h.writes.length,0);assert.equal(h.reads.length,1);assert.equal(h.reads[0].aborted,true);
 });
 test(`${boundary} aborts in-flight reads and writes and invalidates a queued stop`,async t=>{
  const h=await channelHarness(t,{autoRead:false});h.entry.signal(h.source);await h.flush();
  assert.equal(h.writes.length,1);h.entry.stop(h.source);end(h);
  assert.equal(h.reads[0].options.signal.aborted,true);assert.equal(h.writes[0].options.signal.aborted,true);
  await h.flush();h.tick(10000);await h.flush();
  assert.deepEqual(h.writes.map(typing),[true]);assert.equal(h.reads.length,1);
 });
}

test('pagehide also aborts an already running keepalive stop',async t=>{
 const h=await channelHarness(t);h.entry.signal(h.source);await h.flush();h.writes[0].resolve(h.result());await h.flush();
 h.entry.stop(h.source);await h.flush();assert.deepEqual(h.writes.map(typing),[true,false]);assert.equal(h.writes[1].options.keepalive,true);
 h.emit('pagehide');assert.equal(h.writes[1].aborted,true);await h.flush();assert.deepEqual(h.latest,[]);
});

test('live blur sends one serialized stop with no draft content, then fresh input restarts presence',async t=>{
 const h=await channelHarness(t);h.entry.signal(h.source);await h.flush();h.emit('blur');await h.flush();
 assert.deepEqual(h.writes.map(typing),[true],'a stop waits for the live start to finish');assert.equal(h.writes[0].aborted,false);
 h.writes[0].resolve(h.result());await h.flush();assert.deepEqual(h.writes.map(typing),[true,false]);
 assert.equal(h.writes[1].options.body,'{"typing":false}');assert.equal(h.writes[1].options.keepalive,true);assert.equal(h.writes[1].options.signal.aborted,false);
 h.emit('blur');h.writes[1].resolve(h.result());await h.flush();h.entry.signal(h.source);await h.flush();
 assert.deepEqual(h.writes.map(typing),[true,false,true]);assert.equal(h.writes[2].options.body,'{"typing":true}');
});

test('hiding a live document aborts its read but still sends its stop and resumes on visibility',async t=>{
 const h=await channelHarness(t,{autoRead:false});h.entry.signal(h.source);await h.flush();h.writes[0].resolve(h.result());await h.flush();
 h.visibility('hidden');await h.flush();assert.equal(h.reads[0].aborted,true);assert.deepEqual(h.writes.map(typing),[true,false]);assert.deepEqual(h.latest,[]);
 h.entry.signal(h.source);h.tick(3000);await h.flush();assert.equal(h.reads.length,1);assert.equal(h.writes.length,2);
 h.writes[1].resolve(h.result(null));await h.flush();h.visibility('visible');await h.flush();assert.equal(h.reads.length,2);
});

test('bfcache restoration starts a new lifecycle without reviving old queued writes or responses',async t=>{
 const h=await channelHarness(t,{ignoreAbort:true});h.entry.signal(h.source);await h.flush();const oldWrite=h.writes[0];
 h.entry.stop(h.source);h.emit('beforeunload');h.emit('pagehide',{persisted:true});await h.flush();
 h.emit('focus');h.visibility('visible');h.entry.signal(h.source);h.tick(3000);await h.flush();
 assert.equal(h.writes.length,1);assert.equal(h.reads.length,1,'pagehide cannot be resumed by focus, visibility or input');
 h.emit('pageshow',{persisted:true});await h.flush();assert.equal(h.reads.length,2);assert.equal(h.writes.length,1,'restoring a page does not announce typing');
 h.entry.signal(h.source);await h.flush();assert.deepEqual(h.writes.map(typing),[true,true],'a non-cooperative aborted transport cannot block the new queue');
 h.writes[1].resolve(h.result('Carol'));await h.flush();assert.equal(h.latest[0].name,'Carol');
 oldWrite.resolve(h.result('Stale'));await h.flush();assert.equal(h.latest[0].name,'Carol');assert.deepEqual(h.writes.map(typing),[true,true]);
});

for(const recovery of ['focus','input','visibility']){
 test(`cancelled beforeunload resumes on fresh ${recovery} without replaying stale stop writes`,async t=>{
  const h=await channelHarness(t,{ignoreAbort:true});h.entry.signal(h.source);await h.flush();const oldWrite=h.writes[0];h.entry.stop(h.source);
  h.emit('beforeunload');await h.flush();h.tick(3000);await h.flush();assert.equal(h.reads.length,1);assert.equal(h.writes.length,1);
  if(recovery==='focus')h.emit('focus');else if(recovery==='input')h.entry.signal(h.source);else{h.visibility('hidden');h.visibility('visible')}
  await h.flush();assert.equal(h.reads.length,2);assert.equal(h.writes.length,recovery==='input'?2:1);
  if(recovery!=='input'){h.entry.signal(h.source);await h.flush()}
  assert.deepEqual(h.writes.map(typing),[true,true]);oldWrite.resolve(h.result('Stale'));await h.flush();assert.deepEqual(h.writes.map(typing),[true,true]);
 });
}

test('shared channels stop only at the last subscriber and remove all lifecycle listeners on disposal',async t=>{
 const h=await channelHarness(t,{autoRead:false});const unsubscribeSecond=h.subscribe(()=>{});h.entry.signal(h.source);await h.flush();
 h.unsubscribe();assert.equal(h.reads[0].aborted,false);assert.equal(h.writes[0].aborted,false);
 unsubscribeSecond();assert.equal(h.reads[0].aborted,true);assert.equal(h.writes[0].aborted,true);assert.equal(h.window.listenerCount,0);assert.equal(h.document.listenerCount,0);
 const count=h.calls.length;h.emit('pageshow');h.emit('focus');h.visibility('visible');h.entry.signal(h.source);await h.flush();assert.equal(h.calls.length,count);
});

test('polls never renew typing, fresh input is rate-limited, and the final input expires to one stop',async t=>{
 const h=await channelHarness(t);h.entry.signal(h.source);await h.flush();h.writes[0].resolve(h.result(null));await h.flush();
 h.tick(2500);await h.flush();assert.deepEqual(h.writes.map(typing),[true]);
 h.entry.signal(h.source);await h.flush();h.writes[1].resolve(h.result(null));await h.flush();h.entry.signal(h.source);await h.flush();assert.deepEqual(h.writes.map(typing),[true,true]);
 h.tick(4499);await h.flush();assert.deepEqual(h.writes.map(typing),[true,true]);h.tick(1);await h.flush();assert.deepEqual(h.writes.map(typing),[true,true,false]);
});

test('each input source retains its own idle deadline',async t=>{
 const h=await channelHarness(t),second=Symbol('second editor');h.entry.signal(h.source);await h.flush();h.writes[0].resolve(h.result(null));await h.flush();
 h.tick(3000);h.entry.signal(second);await h.flush();h.writes[1].resolve(h.result(null));await h.flush();
 h.tick(1500);await h.flush();assert.deepEqual(h.writes.map(typing),[true,true],'the expired first source cannot stop the active second editor');
 h.entry.stop(h.source);await h.flush();assert.equal(h.writes.length,2);h.tick(3000);await h.flush();assert.deepEqual(h.writes.map(typing),[true,true,false]);
});

test('remote typing is TTL-capped and expires without a renewal or a successful poll',async t=>{
 const h=await channelHarness(t,{autoRead:false});h.reads[0].resolve(h.result('Bob',60000));await h.flush();assert.equal(h.latest[0].expiresAt,9000);
 h.tick(8000);await h.flush();assert.deepEqual(h.latest,[]);assert.equal(h.writes.length,0);
});

test('real live transport failures still clear presence and do not poison later writes',async t=>{
 const h=await channelHarness(t,{autoRead:false});h.reads[0].resolve(h.result());await h.flush();assert.equal(h.latest[0].name,'Bob');
 h.entry.signal(h.source);await h.flush();h.writes[0].reject(Error('Real provider failure'));await h.flush();assert.deepEqual(h.latest,[]);
 h.entry.stop(h.source);await h.flush();assert.deepEqual(h.writes.map(typing),[true,false]);h.writes[1].resolve(h.result('Carol'));await h.flush();assert.equal(h.latest[0].name,'Carol');
});
