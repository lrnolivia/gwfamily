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
export function chatStorageKey(accountId,conversationId){return `gwfamily:chat-draft:v1:${encodeURIComponent(accountId)}:${encodeURIComponent(conversationId)}`}
export function readChatDraft(accountId,conversationId,storage){
 try{storage=storage===undefined?globalThis.sessionStorage:storage;const value=JSON.parse(storage.getItem(chatStorageKey(accountId,conversationId)));return {text:typeof value?.text==='string'?value.text.slice(0,4000):'',attempt:value?.attempt&&typeof value.attempt.requestId==='string'&&typeof value.attempt.body==='string'?{requestId:value.attempt.requestId,body:value.attempt.body}:null}}catch{return {text:'',attempt:null}}
}
export function saveChatDraft(accountId,conversationId,value,storage){
 try{storage=storage===undefined?globalThis.sessionStorage:storage;const key=chatStorageKey(accountId,conversationId);if(!value.text&&!value.attempt)storage.removeItem(key);else storage.setItem(key,JSON.stringify({text:value.text,attempt:value.attempt}));return true}catch{return false}
}
export function clearChatDrafts(accountId,storage){
 try{storage=storage===undefined?globalThis.sessionStorage:storage;const prefix=`gwfamily:chat-draft:v1:${encodeURIComponent(accountId)}:`;for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key?.startsWith(prefix))storage.removeItem(key)}}catch{}
}
export function hasChatDrafts(accountId,storage){try{storage=storage===undefined?globalThis.sessionStorage:storage;const prefix=`gwfamily:chat-draft:v1:${encodeURIComponent(accountId)}:`;for(let i=0;i<storage.length;i++){if(storage.key(i)?.startsWith(prefix))return true}}catch{}return false}
