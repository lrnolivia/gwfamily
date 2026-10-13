import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as model from '../src/message-attachment-model.js';
import * as drafts from '../src/messaging-model.js';
// Test the actual pre-render ChatComposer logic with synthetic hooks and injected
// transports. No JSX/browser, UI pixels, real account, network or storage involved.
const source=await readFile(new URL('../src/messaging.jsx',import.meta.url),'utf8');
const start=source.indexOf('function ChatComposer('),end=source.indexOf(' return <div className="message-compose-area"',start);
assert.ok(start>0&&end>start);
 const logic=source.slice(start,end).replace('function ChatComposer','export function ChatComposer')+' return {draft,uploads,busy,error,recoverable,select,upload,cancelUpload,removeFile,send,restore,useRecoveredText,save};\n}';
const moduleText=`const {useApp,useState,useRef,useEffect,useTypingPresence,readChatDraft,saveChatDraft,uploadPrivateAttachment,sendPrivateMessage,chatApi,canAddPrivateAttachments,privateAttachmentPath}=globalThis.__privateComposerHarness;\n${logic}`;
const same=(a,b)=>a?.length===b?.length&&a?.every((value,index)=>Object.is(value,b[index]));
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no});return {promise,resolve,reject}};
const id='3c031c11-4321-4876-9123-0123456789ab',conversationId='synthetic-conversation';
const metadata={id,url:model.privateAttachmentPath(conversationId,id),name:'synthetic.txt',type:'text/plain',size:9};
const file=new File(['Synthetic'],'synthetic.txt',{type:'text/plain'});
async function harness({mode='live',seed,uploadResponse,sendResponse}={}){
 const slots=[],effects=[],storage=new Map(),notices=[],uploads=[],sends=[],received=[],listeners=new Map();let cursor=0,pending=0,draftSafe=true;
 const app={state:{mode,selfId:'synthetic-account'},data:{beginPending(){pending++;let done=false;return()=>{if(!done){done=true;pending--}}}},messaging:{setDraftStorageOk(value){draftSafe=value}},setToast(value){notices.push(value)}};
 const globals={window:globalThis.window,navigator:globalThis.navigator,harness:globalThis.__privateComposerHarness};
 globalThis.window={addEventListener(type,fn){listeners.set(type,fn)},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type)}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 const key=(account,conversation,mode)=>account+':'+mode+':'+conversation;
 globalThis.__privateComposerHarness={
  useApp:()=>app,useTypingPresence:()=>({stop(){},signal(){},typers:[]}),
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{slots[index].value=typeof value==='function'?value(slots[index].value):value}]},
  useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index]},
  useEffect(fn,deps){const index=cursor++,prior=slots[index];if(!same(prior?.deps,deps)){slots[index]={deps,fn,cleanup:prior?.cleanup};effects.push(()=>{prior?.cleanup?.();slots[index].cleanup=fn()})}},
  readChatDraft(account,conversation,_storage,mode){return structuredClone(storage.get(key(account,conversation,mode))||seed||{text:'',files:[],attempt:null})},
  saveChatDraft(account,conversation,value,_storage,mode){storage.set(key(account,conversation,mode),structuredClone(value));return true},
  uploadPrivateAttachment(options){uploads.push(options);return uploadResponse?uploadResponse(options):Promise.resolve(metadata)},
  sendPrivateMessage(options){sends.push(options);return sendResponse?sendResponse(options):Promise.resolve({message:{id:'synthetic-message',conversationId,body:options.attempt.body,files:[metadata]}})},
  chatApi:async()=>({cancelled:true}),...model
 };
 const {ChatComposer}=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64')+'#'+crypto.randomUUID());
 return {app,slots,notices,uploads,sends,received,storage,get pending(){return pending},get draftSafe(){return draftSafe},render(props={}){cursor=0;const result=ChatComposer({id:conversationId,disabled:false,onMessage:value=>received.push(value),...props});for(const fn of effects.splice(0))fn();return result},close(){for(const slot of slots)slot?.cleanup?.();globalThis.window=globals.window;Object.defineProperty(globalThis,'navigator',{configurable:true,value:globals.navigator});if(globals.harness===undefined)delete globalThis.__privateComposerHarness;else globalThis.__privateComposerHarness=globals.harness},listeners};
}
test('actual composer stores only verified uploaded refs, clears raw File selection and balances pending',async()=>{
 const h=await harness();try{const ui=h.render();await ui.select({target:{files:[file],value:'synthetic'}});const next=h.render();assert.equal(next.uploads.length,0);assert.deepEqual(next.draft.files,[metadata]);assert.equal(h.pending,0);assert.equal(h.draftSafe,true);assert.equal(h.uploads[0].accountId,'synthetic-account');assert.equal(h.uploads[0].conversationId,conversationId);assert.equal(JSON.stringify([...h.storage.values()]).includes('arrayBuffer'),false)}finally{h.close()}
});
test('actual composer cancels selected file without allowing its late success into draft',async()=>{
 const upload=deferred(),h=await harness({uploadResponse:()=>upload.promise});try{const operation=h.render().select({target:{files:[file],value:''}});await Promise.resolve();let ui=h.render();assert.equal(ui.uploads.length,1);assert.equal(h.pending,1);assert.equal(h.draftSafe,false);ui.cancelUpload(ui.uploads[0].requestId);assert.equal(h.uploads[0].signal.aborted,true);upload.resolve(metadata);await operation;ui=h.render();assert.deepEqual(ui.draft.files,[]);assert.equal(ui.uploads.length,0);assert.equal(h.pending,0)}finally{h.close()}
});
test('actual composer unmount aborts upload/send and rejects stale account results',async()=>{
 const upload=deferred(),h=await harness({uploadResponse:()=>upload.promise});const operation=h.render().select({target:{files:[file],value:''}});await Promise.resolve();h.close();assert.equal(h.uploads[0].signal.aborted,true);upload.resolve(metadata);await operation;assert.equal(h.storage.size,0);assert.equal(h.pending,0);assert.equal(h.listeners.size,0);
 const send=deferred(),s=await harness({seed:{text:'Synthetic private text',files:[],attempt:null},sendResponse:()=>send.promise});const sending=s.render().send();await Promise.resolve();s.close();assert.equal(s.sends[0].signal.aborted,true);send.resolve({message:{id:'late',conversationId}});await sending;assert.equal(s.received.length,0);assert.equal(s.pending,0);assert.ok([...s.storage.values()][0].attempt);
});
test('actual composer double-send guard preserves identical ambiguous retries and newer text',async()=>{
 let tries=0;const h=await harness({seed:{text:'Synthetic initial text',files:[metadata],attempt:null},sendResponse:async options=>{tries++;if(tries===1)throw Error('Synthetic interrupted response');return {message:{id:'confirmed',conversationId,body:options.attempt.body}}}});
 try{const ui=h.render(),first=ui.send();await ui.send();await first;let next=h.render();assert.equal(h.sends.length,1);assert.equal(next.draft.attempt.body,'Synthetic initial text');assert.deepEqual(next.draft.attempt.files,[metadata]);next.save({...next.draft,text:'Newer draft'});next=h.render();await next.send(true);next=h.render();assert.equal(h.sends.length,2);assert.equal(h.sends[0].attempt.requestId,h.sends[1].attempt.requestId);assert.deepEqual(h.sends[0].attempt.files,h.sends[1].attempt.files);assert.equal(next.draft.attempt,null);assert.equal(next.draft.text,'Newer draft');assert.equal(h.received.length,1);assert.ok(h.notices.some(value=>value.kind==='error'))}finally{h.close()}
});
test('actual composer restores only definitive unavailable files, never an ambiguous send',async()=>{
 const seed={text:'Synthetic initial',files:[metadata],attempt:null},h=await harness({seed,sendResponse:async()=>{throw Object.assign(Error('Expired attachments'),{safeToEdit:true})}});
 try{await h.render().send();let ui=h.render();assert.equal(ui.recoverable,true);ui.restore();ui=h.render();assert.equal(ui.draft.text,'Synthetic initial');assert.equal(ui.draft.attempt,null);assert.deepEqual(ui.draft.files,[])}finally{h.close()}
 const b=await harness({seed,sendResponse:async()=>{throw Error('Ambiguous')}});try{await b.render().send();const ui=b.render();ui.restore();assert.equal(b.render().draft.attempt.body,'Synthetic initial');assert.equal(ui.recoverable,false)}finally{b.close()}
});
test('actual composer ignores preview file selection and blocks invalid recovered attempts',async()=>{
 const h=await harness({mode:'preview'});try{await h.render().select({target:{files:[file],value:''}});assert.equal(h.uploads.length,0)}finally{h.close()}
 const b=await harness({seed:{text:'',files:[],attempt:{requestId:'synthetic-retry',body:'Synthetic',files:[],invalidAttachments:true}}});try{await b.render().send(true);assert.equal(b.sends.length,0)}finally{b.close()}
});
test('actual composer losslessly restores a full failed message beside a full newer draft',async()=>{
 const original='a'.repeat(4000),newer='b'.repeat(4000),h=await harness({seed:{text:original,files:[metadata],attempt:null},sendResponse:async()=>{throw Object.assign(Error('Expired'),{safeToEdit:true})}});
 try{await h.render().send();let ui=h.render();ui.save({...ui.draft,text:newer});ui=h.render();ui.restore();ui=h.render();assert.equal(ui.draft.text,newer);assert.equal(ui.draft.recoveredText,original);assert.equal(ui.draft.attempt,null);ui.useRecoveredText();ui=h.render();assert.equal(ui.draft.text,original);assert.equal(ui.draft.recoveredText,newer)}finally{h.close()}
});
test('actual composer rejects offline native-picker result without stranding a queue',async()=>{
 const h=await harness();try{const ui=h.render();globalThis.navigator.onLine=false;await ui.select({target:{files:[file],value:''}});assert.equal(h.render().uploads.length,0);assert.equal(h.uploads.length,0);assert.equal(h.notices.at(-1).kind,'error')}finally{h.close()}
});
