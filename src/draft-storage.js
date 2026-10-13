// Live drafts stay in this browser tab and are never sent by the autosave path.
// Account identity is part of every key; preview state uses its separate adapter.
export const LIVE_DRAFT_PREFIX='gwfamily:live-drafts:v1:';
export const LIVE_REQUEST_PREFIX='gwfamily:live-requests:v1:';
const keyFor=(prefix,accountId)=>prefix+encodeURIComponent(accountId);
const isRecord=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const reserved=new Set(['__proto__','constructor','prototype']);
const storageOrDefault=storage=>storage===undefined?globalThis.sessionStorage:storage;
function clean(value,report,depth=0){
 if(depth>32)return undefined;
 if(value===null||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value==='string')return value;
 if(Array.isArray(value))return value.map(v=>clean(v,report,depth+1)).filter(v=>v!==undefined);
 if(!isRecord(value))return undefined;
 if(typeof value.url==='string'&&/^(blob:|data:)/i.test(value.url)){report.omittedMedia=true;return undefined}
 const result={};
 for(const [key,item]of Object.entries(value)){if(reserved.has(key))continue;if(['url','src','image'].includes(key)&&typeof item==='string'&&/^(blob:|data:)/i.test(item)){report.omittedMedia=true;continue}const next=clean(item,report,depth+1);if(next!==undefined)result[key]=next}
 return result;
}
function cleanDrafts(value,report){
 const source=isRecord(value)?value:{},drafts={post:typeof source.post==='string'?source.post:'',comments:{},replies:{},files:{}};
 for(const [kind,map]of Object.entries(source)){
  if(kind==='post'||reserved.has(kind)||!isRecord(map))continue;
  drafts[kind]=Object.fromEntries(Object.entries(map).filter(([key,item])=>!reserved.has(key)&&(kind==='files'?Array.isArray(item):typeof item==='string')).map(([key,item])=>[key,kind==='files'?clean(item,report):item]));
 }
 return drafts;
}
function validAccount(accountId){return typeof accountId==='string'&&accountId.length>0&&accountId.length<=200}
export function saveLiveDrafts(accountId,state,storage){
 if(!validAccount(accountId)||state?.mode!=='live'||state.selfId!==accountId)return {ok:false,error:'Drafts could not be linked to this account.'};
 const report={ok:true,omittedMedia:false};
 try{
  const value={schema:1,accountId,drafts:cleanDrafts(state.drafts,report),compose:clean(state.compose||{},report)};
  storageOrDefault(storage).setItem(keyFor(LIVE_DRAFT_PREFIX,accountId),JSON.stringify(value));
  return report;
 }catch{return {ok:false,error:'Local draft storage is unavailable or full. Keep this tab open until you send your changes.'}}
}
export function readLiveDrafts(accountId,storage){
 if(!validAccount(accountId))return {};
 try{
  const saved=JSON.parse(storageOrDefault(storage).getItem(keyFor(LIVE_DRAFT_PREFIX,accountId)));
  if(saved?.schema!==1||saved.accountId!==accountId||!isRecord(saved.drafts)||!isRecord(saved.compose))return {};
  const report={};const drafts=cleanDrafts(saved.drafts,report),compose=clean(saved.compose,report);
  return {drafts:{post:'',comments:{},replies:{},files:{},...drafts},compose};
 }catch{return {}}
}
export function clearLiveDrafts(accountId,storage){
 if(!validAccount(accountId))return;
 try{const target=storageOrDefault(storage);target.removeItem(keyFor(LIVE_DRAFT_PREFIX,accountId));target.removeItem(keyFor(LIVE_REQUEST_PREFIX,accountId))}catch{}
}
export function retainDraftAccount(accountId,storage){
 try{
  const target=storageOrDefault(storage),keep=validAccount(accountId)?new Set([keyFor(LIVE_DRAFT_PREFIX,accountId),keyFor(LIVE_REQUEST_PREFIX,accountId)]):new Set();
  const keys=Array.from({length:target.length},(_,i)=>target.key(i));
  for(const key of keys)if((key?.startsWith(LIVE_DRAFT_PREFIX)||key?.startsWith(LIVE_REQUEST_PREFIX))&&!keep.has(key))target.removeItem(key);
 }catch{}
}
export function hasLocalDrafts(state){
 const drafts=state?.drafts||{},compose=state?.compose||{};
 const meaningful=value=>typeof value==='string'?!!value.trim():Array.isArray(value)?value.some(meaningful):isRecord(value)?Object.values(value).some(meaningful):false;
 return meaningful(drafts)||!!compose.files?.length||!!compose.backgroundMedia||!!compose.poll||!!compose.link||!!compose.background||!!compose.memberIds?.length;
}
function canonical(value){
 if(Array.isArray(value))return '['+value.map(v=>canonical(v)??'null').join(',')+']';
 if(isRecord(value))return '{'+Object.keys(value).filter(key=>key!=='requestId'&&value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
export async function commandFingerprint(payload){
 const bytes=new TextEncoder().encode(canonical(payload));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function readCommandRequests(accountId,storage){
 if(!validAccount(accountId))return {};
 try{const saved=JSON.parse(storageOrDefault(storage).getItem(keyFor(LIVE_REQUEST_PREFIX,accountId)));if(saved?.accountId!==accountId||!isRecord(saved.requests))return {};return Object.fromEntries(Object.entries(saved.requests).filter(([fingerprint,id])=>/^[a-f0-9]{64}$/.test(fingerprint)&&typeof id==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(id)))}catch{return {}}
}
export function saveCommandRequests(accountId,requests,storage){
 try{storageOrDefault(storage).setItem(keyFor(LIVE_REQUEST_PREFIX,accountId),JSON.stringify({accountId,requests}));return true}catch{return false}
}
// Only clear the submitted snapshot. Edits made while a request is in flight survive.
export function preserveNewerDrafts(current,before,updated,action){
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(action.type==='ADD_POST'){
  const drafts={...updated.drafts,post:same(current.drafts?.post,before.drafts?.post)?'':current.drafts?.post};
  drafts.files={...updated.drafts?.files,'post:compose':same(current.drafts?.files?.['post:compose'],before.drafts?.files?.['post:compose'])?[]:current.drafts?.files?.['post:compose']||[]};
  return {...updated,drafts,compose:same(current.compose,before.compose)?{}:current.compose};
 }
 if(action.type==='ADD_COMMENT'){
  const kind=action.parentId?'replies':'comments',key=action.parentId||action.targetId,fileKey=kind+':'+key;
  const drafts={...updated.drafts,[kind]:{...updated.drafts?.[kind],[key]:same(current.drafts?.[kind]?.[key],before.drafts?.[kind]?.[key])?'':current.drafts?.[kind]?.[key]||''},files:{...updated.drafts?.files,[fileKey]:same(current.drafts?.files?.[fileKey],before.drafts?.files?.[fileKey])?[]:current.drafts?.files?.[fileKey]||[]}};
  return {...updated,drafts};
 }
 return updated;
}
