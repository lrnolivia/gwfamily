import {cardLayoutsPayload} from './card-content-layout-model.js';
import {photoFramePayload} from './photo-framing-model.js';
import {panelPayload,normalizePanelContent} from './shared-panels.js';
import {SHARED_PAGE_SCHEMA,sharedPageDefaults,validateSharedPageContent} from './shared-content-schema.js';

export const PREVIEW_KEY='gw-shared-pages-preview:v1';
export const DRAFT_PREFIX='gw-shared-page-drafts:v1:';
export const clone=value=>JSON.parse(JSON.stringify(value));
export const knownPage=page=>typeof page==='string'&&Object.hasOwn(SHARED_PAGE_SCHEMA,page);
export const initialRecord=page=>({page,revision:0,content:sharedPageDefaults(page),canEdit:false,updatedAt:null,status:'idle',error:'',draft:null,base:null,request:null});

// Never round-trip a server URL, MIME type or filename as authority to publish media.
export function pageContentPayload(content){return {text:{...content.text},bodyFormats:{...content.bodyFormats},cardLayouts:cardLayoutsPayload(content.cardLayouts),hero:{mode:content.hero.mode,...photoFramePayload(content.hero.frame),media:content.hero.media.map(({id,alt='',frame})=>({id,alt,...photoFramePayload(frame)}))},...(content.panelLayout?{panelLayout:panelPayload(content.panelLayout)}:{})}}
export function pageContentFingerprint(content){return JSON.stringify(pageContentPayload(content))}
export function pageContentDirty(record){return !!record?.draft&&pageContentFingerprint(record.draft)!==pageContentFingerprint(record.content)}

// A completed save must never replace keystrokes entered while it was pending.
export function reconcilePageSave(page,saved,current,submittedFingerprint,savedNotice){
 const newer=!!current?.draft&&pageContentFingerprint(current.draft)!==submittedFingerprint;
 return {...initialRecord(page),...saved,status:'ready',savedNotice,
  draft:newer?clone(current.draft):null,base:newer?clone(saved.content):null};
}

export function pageCanAutosave(record){
 return !!record?.canEdit&&pageContentDirty(record)&&record.status==='ready'&&!record.error&&!record.latest&&!record.conflicted;
}
export function pageDraftKey(account){return DRAFT_PREFIX+encodeURIComponent(account)}
export function safePageMediaUrl(value,preview=false){
 if(typeof value!=='string')return '';
 if(/^\/api\/media\/[A-Za-z0-9_-]{1,100}$/.test(value))return value;
 if(preview&&/^data:(image\/(?:jpeg|png|webp|gif|avif)|video\/(?:mp4|webm));base64,[A-Za-z0-9+/=]+$/.test(value))return value;
 return '';
}
export function mergePageDraft(base,draft,latest){
 const content=clone(latest),conflicts=[];
 for(const [field,value] of Object.entries(draft.text)){
  if(value===base.text[field]&&draft.bodyFormats?.[field]===base.bodyFormats?.[field])continue;
  content.text[field]=value;content.bodyFormats={...content.bodyFormats};if(draft.bodyFormats?.[field])content.bodyFormats[field]=draft.bodyFormats[field];else delete content.bodyFormats[field];
  if((latest.text[field]!==base.text[field]||latest.bodyFormats?.[field]!==base.bodyFormats?.[field])&&(latest.text[field]!==value||latest.bodyFormats?.[field]!==draft.bodyFormats?.[field]))conflicts.push({field,mine:value,theirs:latest.text[field]});
 }
 const hero=value=>JSON.stringify(pageContentPayload({text:{},hero:value}).hero);
 if(hero(draft.hero)!==hero(base.hero)){
  content.hero=clone(draft.hero);
  if(hero(latest.hero)!==hero(base.hero)&&hero(latest.hero)!==hero(draft.hero))conflicts.push({field:'hero',mine:draft.hero.mode,theirs:latest.hero.mode});
 }
 const panels=value=>JSON.stringify(value.panelLayout?panelPayload(value.panelLayout):null);
 if(panels(draft)!==panels(base)){
  content.panelLayout=clone(draft.panelLayout);
  if(panels(latest)!==panels(base)&&panels(latest)!==panels(draft))conflicts.push({field:'panelLayout',mine:'Your panel layout and content',theirs:'Latest panel layout and content'});
 }
 const cards=value=>cardLayoutsPayload(value.cardLayouts);
 const original=cards(base),mine=cards(draft),theirs=cards(latest);content.cardLayouts={...theirs};
 for(const id of new Set([...Object.keys(original),...Object.keys(mine)])){
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);if(same(mine[id],original[id]))continue;
  if(mine[id]===undefined)delete content.cardLayouts[id];else content.cardLayouts[id]=clone(mine[id]);
  if(!same(theirs[id],original[id])&&!same(theirs[id],mine[id]))conflicts.push({field:'cardLayout:'+id,mine:'Your card content arrangement',theirs:'Latest card content arrangement'});
 }
 return {content,conflicts};
}
export async function pageContentRequest(path,{fetchImpl=globalThis.fetch,...options}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);timer?.unref?.();
 try{
  let response;
  try{response=await fetchImpl(path,{...options,signal:options.signal||controller.signal,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...options.headers}})}
  catch(error){throw Object.assign(new Error(error.name==='AbortError'?'The page request timed out. Your draft is still here. Try again.':'Couldn’t reach the page service. Your draft is still here. Check your connection and try again.'),{ambiguous:true})}
  let value;try{value=await response.json()}catch{throw Object.assign(new Error('The page service did not respond clearly. Your draft is still here. Try saving again.'),{status:response.status,ambiguous:true})}
  if(!response.ok)throw Object.assign(new Error(value.error?.message||value.error||'That page change could not be saved. Your draft is still here.'),{status:response.status,current:value.current});
  return value;
 }finally{clearTimeout(timer)}
}
export function pageBrowserStorage(kind,host=globalThis){try{return host[kind]||null}catch{return null}}
export function resetPageContentPreview(storage){
 let cleared=false;try{const target=storage===undefined?pageBrowserStorage('localStorage'):storage;if(target){target.removeItem(PREVIEW_KEY);cleared=true}}catch{}
 if(typeof window!=='undefined')window.dispatchEvent(new Event('gw-shared-pages-preview-reset'));
 return cleared;
}
export function readStored(storage,key,fallback){try{const value=JSON.parse(storage?.getItem(key)||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value:fallback}catch{return fallback}}
export function writeStored(storage,key,value){try{if(!storage)return false;storage.setItem(key,JSON.stringify(value));return true}catch{return false}}
export function validRestoredDraft(page,value){try{validateSharedPageContent(page,pageContentPayload(value));return normalizePanelContent(page,value)}catch{return null}}
export function withOutputMedia(content,submitted){const files=new Map([...submitted.hero.media,...(submitted.panelLayout?.panels||[]).flatMap(panel=>panel.media||[])].map(file=>[file.id,file]));const enrich=file=>({...files.get(file.id),...file});return {...content,hero:{...content.hero,media:content.hero.media.map(enrich)},panelLayout:{...content.panelLayout,panels:content.panelLayout.panels.map(panel=>panel.kind!=='content'?panel:{...panel,media:panel.media.map(enrich)})}}}

export function reconcilePageRecord(page,result,freshest,stored){
 result={...result,content:normalizePanelContent(page,result.content)};
 if(freshest?.status==='saving'||Number.isInteger(freshest?.revision)&&result.revision<freshest.revision)return freshest;
 const prior=pageContentDirty(freshest)?freshest:null;
 const draft=prior?.draft||(stored&&validRestoredDraft(page,stored.draft)),base=prior?.base||(stored&&validRestoredDraft(page,stored.base));
 const next={...initialRecord(page),...result,status:'ready',refreshing:false,error:'',draft:result.canEdit&&draft?clone(draft):null,base:result.canEdit&&base?clone(base):null,request:prior?.request||stored?.request||null};
 // Keep the original optimistic revision and freshest keystrokes across polling.
 if(next.draft){next.revision=prior?.revision??stored?.revision??result.revision;if(next.revision!==result.revision){next.latest=result;if(prior?.merge&&prior.latest?.revision===result.revision)next.merge=prior.merge}}
 return next;
}

export function collectPageDrafts(records,stored={}){
 const drafts=Object.fromEntries(Object.entries(stored).filter(([page,value])=>knownPage(page)&&validRestoredDraft(page,value?.draft)&&validRestoredDraft(page,value?.base)));
 for(const [page,value] of Object.entries(records)){if(pageContentDirty(value))drafts[page]={draft:value.draft,base:value.base||value.content,revision:value.revision,request:value.request};else delete drafts[page]}
 return drafts;
}
