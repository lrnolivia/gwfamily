import {privateAttachments} from './message-attachment-model.js';
// Chat drafts and ambiguous sends stay in this tab, scoped to account + conversation.
// Message contents never enter diagnostics or the URL.
export const PREVIEW_MESSAGES_KEY='gwfamily:preview-messages:v1';
export function conversationTitle(conversation,selfId){
 if(conversation?.name?.trim())return conversation.name.trim();
 const names=(conversation?.members||[]).filter(m=>(m.id||m.memberId)!==selfId&&(conversation?.type==='direct'||!['left','removed','declined'].includes(m.status))).map(m=>m.name||'Family member');
 return names.join(', ')||(conversation?.type==='group'?'Group conversation':'Conversation');
}
export function mergeMessages(current,incoming){
 const byId=new Map(current.map(m=>[m.id,m]));for(const m of incoming)byId.set(m.id,m);
 return [...byId.values()].sort((a,b)=>a.sequence-b.sequence||a.id.localeCompare(b.id));
}
export function chatStorageKey(accountId,conversationId,mode='live'){return `gwfamily:chat-draft:v1:${encodeURIComponent(accountId)}:${encodeURIComponent(mode==='preview'?'preview:'+conversationId:conversationId)}`}
export function readChatDraft(accountId,conversationId,storage,mode='live'){
 try{
  storage=storage===undefined?globalThis.sessionStorage:storage;
  const value=JSON.parse(storage.getItem(chatStorageKey(accountId,conversationId,mode))),files=mode==='live'?privateAttachments(value?.files,conversationId):[];
  const attempt=value?.attempt&&typeof value.attempt.requestId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(value.attempt.requestId)&&typeof value.attempt.body==='string'&&value.attempt.body.length<=4000?{requestId:value.attempt.requestId,body:value.attempt.body,files:mode==='live'?privateAttachments(value.attempt.files,conversationId):[]}:null;
  // An unsafe or incomplete stored attachment set must never mutate an ambiguous send.
  const attemptFiles=value?.attempt?.files,attemptValid=value?.attempt?.invalidAttachments!==true&&(attemptFiles===undefined||Array.isArray(attemptFiles)&&attempt?.files.length===attemptFiles.length);
  return {text:typeof value?.text==='string'?value.text.slice(0,4000):'',recoveredText:typeof value?.recoveredText==='string'?value.recoveredText.slice(0,4000):'',files,attempt:attemptValid?attempt:attempt?{...attempt,invalidAttachments:true}:null,discardedAttachments:!!value?.files?.length&&files.length!==value.files.length||!attemptValid};
 }catch{return {text:'',recoveredText:'',files:[],attempt:null,discardedAttachments:false}}
}
export function saveChatDraft(accountId,conversationId,value,storage,mode='live'){
 try{
  storage=storage===undefined?globalThis.sessionStorage:storage;const key=chatStorageKey(accountId,conversationId,mode),files=mode==='live'?privateAttachments(value.files,conversationId):[];
  if(!value.text&&!value.recoveredText&&!value.attempt&&!files.length)storage.removeItem(key);else storage.setItem(key,JSON.stringify({text:value.text,recoveredText:typeof value.recoveredText==='string'?value.recoveredText.slice(0,4000):'',files,attempt:value.attempt}));return true;
 }catch{return false}
}
export function clearChatDrafts(accountId,storage){
 try{storage=storage===undefined?globalThis.sessionStorage:storage;const prefix=`gwfamily:chat-draft:v1:${encodeURIComponent(accountId)}:`;for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(prefix))storage.removeItem(key)}}catch{}
}
export function hasChatDrafts(accountId,storage){try{storage=storage===undefined?globalThis.sessionStorage:storage;const prefix=`gwfamily:chat-draft:v1:${encodeURIComponent(accountId)}:`;for(let i=0;i<storage.length;i++){if(storage.key(i)?.startsWith(prefix))return true}}catch{}return false}

// Polls share one in-flight index read per account. Cancellation invalidates
// late success and failure, even when a transport ignores its abort signal.
export function conversationIndexReads(){
 let active=null,generation=0;
 const cancel=()=>{generation++;active?.controller.abort();active=null};
 return {cancel,run(key,request,success,failure){
  if(active?.key===key)return active.promise;
  cancel();const epoch=generation,controller=new AbortController(),entry={key,controller,promise:null};active=entry;
  entry.promise=Promise.resolve().then(()=>request(controller.signal)).then(value=>{if(active===entry&&generation===epoch)success(value)},error=>{if(active===entry&&generation===epoch&&!controller.signal.aborted)failure(error)}).finally(()=>{if(active===entry)active=null});
  return entry.promise;
 }};
}
