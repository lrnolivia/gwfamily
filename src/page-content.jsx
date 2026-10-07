import {shareUnchangedSnapshot,refreshingPageRecord} from './refresh-stability.js';
import {PhotoFramingEditor,photoFrameStyle} from './photo-framing.jsx';
import {PageMarkdownEditor,PageMarkdownBody} from './page-markdown.jsx';
import {CarouselControls,useCarouselSwipe} from './carousel-controls.jsx';
import {carouselKeyboardDestination,wrapCarouselIndex} from './carousel-model.js';
import {plainTextToMarkdown} from './page-markdown-model.js';
import React,{createContext,useCallback,useContext,useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
import {readPreviewFile} from './uploads.js';
import {normalizePanelContent} from './shared-panels.js';
import {PagePanelActions} from './page-panels.jsx';
import {SHARED_PAGE_SCHEMA,SHARED_CONTENT_LIMITS,SHARED_IMAGE_TYPES,SHARED_VIDEO_TYPES,sharedPageDefaults,validateSharedPageContent} from './shared-content-schema.js';

const PageContentContext=createContext(null);
export const PagePanelLockContext=createContext(false);
import {PREVIEW_KEY,clone,knownPage,initialRecord,pageContentPayload,pageContentFingerprint,pageContentDirty,pageDraftKey,safePageMediaUrl,mergePageDraft,pageContentRequest,pageBrowserStorage,resetPageContentPreview,readStored,writeStored,validRestoredDraft,withOutputMedia,reconcilePageRecord,collectPageDrafts,reconcilePageSave,pageCanAutosave} from './page-content-model.js';
export {pageContentPayload,pageContentFingerprint,pageContentDirty,pageDraftKey,safePageMediaUrl,mergePageDraft,pageContentRequest,pageBrowserStorage,resetPageContentPreview,reconcilePageRecord,collectPageDrafts,reconcilePageSave,pageCanAutosave} from './page-content-model.js';
const plainChildren=children=>React.Children.toArray(children).map(child=>typeof child==='string'||typeof child==='number'?String(child):React.isValidElement(child)?child.type==='br'?'\n':plainChildren(child.props.children):'').join('');

export function PageContentProvider({children,enabled=true}){
 const app=useApp(),state=app?.state||{},preview=state.mode==='preview';
 const allowed=enabled&&state.onboarding==='done'&&(preview||(state.mode==='live'&&app?.data?.session?.status==='active'));
 const account=allowed?(preview?'preview:':'live:')+state.selfId:null;
 const [records,setRecords]=useState({}),[editingPage,setEditingPage]=useState(null),[editingPages,setEditingPages]=useState([]),[arrangingPage,setArrangingPage]=useState(false),[activeEditor,setActiveEditor]=useState(null),[workCount,setWorkCount]=useState(0),[autosaveHolds,setAutosaveHolds]=useState(0),[storageError,setStorageError]=useState('');
 const pauseAutosave=useCallback(()=>{setAutosaveHolds(count=>count+1);let released=false;return()=>{if(!released){released=true;setAutosaveHolds(count=>Math.max(0,count-1))}}},[]);
 const ref=useRef({}),epoch=useRef(0),identity=useRef(account),loading=useRef(new Map()),pageUsers=useRef({}),previewStore=useRef({}),draftStore=useRef({}),routeAtEdit=useRef(null),activeSurface=useRef(null),workRef=useRef(0),reloadAllowed=useRef(false),mounted=useRef(true);
 const routeKey=app?.route?.type+':'+(app?.route?.id||'')+':'+(app?.route?.section||'');
 const install=useCallback((page,value)=>{const next=shareUnchangedSnapshot(ref.current[page],value);if(next!==ref.current[page]){ref.current={...ref.current,[page]:next};if(mounted.current)setRecords(ref.current)}return next},[]);
 const persistDrafts=useCallback(()=>{
  if(!account)return true;
  const drafts=collectPageDrafts(ref.current,draftStore.current);
  draftStore.current=drafts;
  const safe=writeStored(pageBrowserStorage('sessionStorage'),pageDraftKey(account),drafts);if(!safe)setStorageError('This browser could not keep a recovery copy. Keep this tab open until your page changes are saved.');else setStorageError('');return safe;
 },[account]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++}},[]);
 useLayoutEffect(()=>{
  const previousAccount=identity.current;if(previousAccount?.startsWith('live:')&&previousAccount!==account){try{sessionStorage.removeItem(pageDraftKey(previousAccount))}catch{}}
  epoch.current++;identity.current=account;ref.current={};setRecords({});setEditingPage(null);setStorageError('');loading.current.clear();
  const recoveryStorage=pageBrowserStorage('sessionStorage');draftStore.current=account?readStored(recoveryStorage,pageDraftKey(account),{}):{};if(account&&!recoveryStorage)setStorageError('Draft recovery is unavailable in this browser. Keep this tab open until your page changes are saved.');
  previewStore.current=preview?readStored(pageBrowserStorage('localStorage'),PREVIEW_KEY,{}):{};
 },[account,preview]);
 useEffect(()=>{if(editingPage&&routeAtEdit.current!==routeKey)setEditingPage(null)},[routeKey,editingPage]);
 useEffect(()=>{if(!editingPage)setArrangingPage(false)},[editingPage]);
 useEffect(()=>{
  const root=document.documentElement;
  if(allowed&&editingPage)root.dataset.pageEditMode='true';else delete root.dataset.pageEditMode;
  return()=>{delete root.dataset.pageEditMode};
 },[allowed,editingPage]);
 useEffect(()=>{
  const protect=e=>{if(reloadAllowed.current){reloadAllowed.current=false;return}if(workRef.current||Object.values(ref.current).some(pageContentDirty)||Object.values(ref.current).some(r=>r.status==='saving')){e.preventDefault();e.returnValue=''}};
  window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);
 },[]);
 useEffect(()=>{
  const reset=()=>{if(!preview)return;epoch.current++;ref.current={};previewStore.current={};draftStore.current={};loading.current.clear();setRecords({});setEditingPage(null);try{sessionStorage.removeItem(pageDraftKey(account))}catch{}};
  window.addEventListener('gw-shared-pages-preview-reset',reset);return()=>window.removeEventListener('gw-shared-pages-preview-reset',reset);
 },[preview,account]);
 const load=useCallback(async(page,{force=false,keepDraft=true}={})=>{
  if(!allowed||!knownPage(page)||identity.current!==account)return null;
  if(loading.current.has(page))return loading.current.get(page);
  if(!force&&ref.current[page]?.status&&ref.current[page].status!=='idle')return ref.current[page];
  const generation=epoch.current,before=ref.current[page]||initialRecord(page);
  install(page,refreshingPageRecord(before));
  const operation=(async()=>{
   await Promise.resolve();
   try{
    let result;
    if(preview){const saved=previewStore.current[page];result={...initialRecord(page),...(saved?.record||{}),canEdit:true};if(!validRestoredDraft(page,result.content))result={...initialRecord(page),canEdit:true}}
    else result=await pageContentRequest('/api/page-content/'+encodeURIComponent(page));
    if(generation!==epoch.current||identity.current!==account||!mounted.current)return null;
    const freshest=ref.current[page]||before,stored=keepDraft?draftStore.current[page]:null;
    const next=reconcilePageRecord(page,result,keepDraft?freshest:null,stored);
    install(page,next);return next;
   }catch(error){if(generation===epoch.current&&ref.current[page]?.status!=='saving')install(page,{...(ref.current[page]||before),status:'error',error:error.message});return null}
   finally{if(generation===epoch.current)loading.current.delete(page)}
  })();loading.current.set(page,operation);return operation;
 },[allowed,account,preview,install]);
 const retainPage=useCallback(page=>{if(!knownPage(page))return;pageUsers.current[page]=(pageUsers.current[page]||0)+1;return()=>{pageUsers.current[page]=Math.max(0,(pageUsers.current[page]||0)-1)}},[]);
 useEffect(()=>{
  if(!allowed||preview)return;
  const refresh=()=>{if(document.visibilityState!=='visible'||identity.current!==account||workRef.current)return;for(const [page,count] of Object.entries(pageUsers.current)){const record=ref.current[page];if(count>0&&record&&!['saving','loading'].includes(record.status)&&!loading.current.has(page))void load(page,{force:true,keepDraft:true})}};
  const timer=setInterval(refresh,15000);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{clearInterval(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh)};
 },[allowed,preview,account,load]);
 const begin=useCallback(async(page,relatedPages=[])=>{
  if(!knownPage(page)||page==='global')return false;
  const scope=[...new Set([page,...relatedPages,'global'])].filter(knownPage);
  const results=await Promise.all(scope.map(key=>load(key)));if(!results[0]?.canEdit)return false;
  routeAtEdit.current=routeKey;setEditingPages(scope);setEditingPage(page);return true;
 },[load,routeKey]);
 const beginWork=useCallback(()=>{const finish=app?.data?.beginPending?.();workRef.current++;setWorkCount(count=>count+1);let ended=false;return()=>{if(ended)return;ended=true;workRef.current=Math.max(0,workRef.current-1);finish?.();if(mounted.current)setWorkCount(count=>Math.max(0,count-1))}},[app?.data?.beginPending]);
 const activateSurface=useCallback((node,editorId=null)=>{setActiveEditor(editorId);const next=node?.closest?.('dialog,.card,section,.intro,footer')||node;if(activeSurface.current===next)return;activeSurface.current?.classList.remove('page-active-edit-card');activeSurface.current=next;next?.classList.add('page-active-edit-card')},[]);
 useEffect(()=>{if(!editingPage)activateSurface(null);return()=>activateSurface(null)},[editingPage,activateSurface]);
 useEffect(()=>{
  const main=document.getElementById('main');if(!editingPage||!main||typeof MutationObserver==='undefined')return;
  const observer=new MutationObserver(()=>{if(activeSurface.current?.isConnected===false)activateSurface(null)});
  observer.observe(main,{childList:true,subtree:true});return()=>observer.disconnect();
 },[editingPage,activateSurface]);
 const update=useCallback((page,change)=>{
  const before=ref.current[page];if(!allowed||!before?.canEdit)return false;
  const draft=change(clone(before.draft||before.content));
  install(page,{...before,draft,base:before.base||clone(before.content),request:null,error:'',latest:before.latest});persistDrafts();return true;
 },[allowed,install,persistDrafts]);
 const save=useCallback(async page=>{
  const before=ref.current[page];if(!allowed||!before?.canEdit||before.status==='saving')return false;
  if(!pageContentDirty(before))return true;
  let content;try{content=validateSharedPageContent(page,pageContentPayload(before.draft))}catch(error){install(page,{...before,error:error.message});return false}
  const fingerprint=JSON.stringify(content),request=before.request?.fingerprint===fingerprint?before.request:{id:crypto.randomUUID(),fingerprint};
  install(page,{...before,status:'saving',error:'',request});persistDrafts();
  const generation=epoch.current,finishWork=beginWork();
  try{
   let saved;
   if(preview){
    const prior=previewStore.current[page]||{revisions:[]};
    saved={page,revision:before.revision+1,content:withOutputMedia(content,before.draft),canEdit:true,updatedAt:new Date().toISOString()};
    const revisions=[{revision:saved.revision,createdAt:saved.updatedAt,editorName:'Preview leader',content:saved.content},...(prior.revisions||[])].slice(0,30);
    const store={...previewStore.current,[page]:{record:saved,revisions}};
    if(!writeStored(pageBrowserStorage('localStorage'),PREVIEW_KEY,store))throw Error('The preview could not be saved on this device. Your draft is still here. Remove a large file and try again.');
    previewStore.current=store;
   }else saved=await pageContentRequest('/api/page-content/'+encodeURIComponent(page),{method:'PATCH',body:JSON.stringify({requestId:request.id,expectedRevision:before.revision,content})});
   if(generation!==epoch.current)return false;
   install(page,reconcilePageSave(page,saved,ref.current[page],pageContentFingerprint(before.draft),preview?'Saved on this device':'Saved for the family'));persistDrafts();return true;
  }catch(error){if(generation===epoch.current){install(page,{...ref.current[page],status:'ready',error:error.status===409?'Another leader saved this page. Your draft is kept. Review the latest version before saving.':error.message,latest:error.current||null,conflicted:error.status===409});persistDrafts()}return false}finally{finishWork()}
 },[allowed,preview,install,persistDrafts,beginWork]);
 useEffect(()=>{
  if(!allowed||!editingPage||workCount||autosaveHolds)return;
  const page=editingPages.find(key=>pageCanAutosave(records[key]));
  if(!page)return;
  const timer=setTimeout(()=>{if(identity.current===account&&pageCanAutosave(ref.current[page]))void save(page)},900);
  return()=>clearTimeout(timer);
 },[allowed,account,editingPage,editingPages,records,workCount,autosaveHolds,save]);
 const discard=useCallback(page=>{const before=ref.current[page];if(!before||before.status==='saving')return;const latest=before.latest||before;install(page,{...before,...latest,draft:null,base:null,request:null,error:'',latest:null,conflicted:false,status:'ready'});persistDrafts()},[install,persistDrafts]);
 const reviewLatest=useCallback(async page=>{
  const before=ref.current[page];if(!before?.draft)return null;
  try{const latest=before.latest||await pageContentRequest('/api/page-content/'+encodeURIComponent(page));const merge=mergePageDraft(before.base||before.content,before.draft,latest.content);install(page,{...before,latest,merge});return merge}catch(error){install(page,{...before,error:error.message});return null}
 },[install]);
 const rebase=useCallback((page,keepMine)=>{
  const before=ref.current[page];if(!before?.latest||!before.merge)return;
  const draft=clone(before.merge.content);
  if(!keepMine)for(const conflict of before.merge.conflicts){if(conflict.field==='hero')draft.hero=clone(before.latest.content.hero);else if(conflict.field==='panelLayout')draft.panelLayout=clone(before.latest.content.panelLayout);else if(conflict.field.startsWith('cardLayout:')){const id=conflict.field.slice(11),latest=before.latest.content.cardLayouts?.[id];if(latest===undefined)delete draft.cardLayouts[id];else draft.cardLayouts[id]=clone(latest)}else {draft.text[conflict.field]=before.latest.content.text[conflict.field];draft.bodyFormats={...draft.bodyFormats};if(before.latest.content.bodyFormats?.[conflict.field])draft.bodyFormats[conflict.field]=before.latest.content.bodyFormats[conflict.field];else delete draft.bodyFormats[conflict.field]}}
  install(page,{...initialRecord(page),...before.latest,status:'ready',draft,base:clone(before.latest.content),request:null});persistDrafts();
 },[install,persistDrafts]);
 const history=useCallback(async(page,before)=>preview?{revisions:previewStore.current[page]?.revisions||[],nextBefore:null}:pageContentRequest('/api/page-content/'+encodeURIComponent(page)+'/revisions'+(before?'?before='+encodeURIComponent(before):'')),[preview]);
 const restore=useCallback(async(page,revision)=>{
  const before=ref.current[page];if(!before?.canEdit||before.status==='saving'||pageContentDirty(before))return false;
  const generation=epoch.current,finishWork=beginWork(),restoreRequest=before.restoreRequest?.revision===revision?before.restoreRequest:{id:crypto.randomUUID(),revision};
  install(page,{...before,status:'saving',error:'',restoreRequest});
  try{
   let saved;
   if(preview){const target=revision===0?sharedPageDefaults(page):previewStore.current[page]?.revisions.find(r=>r.revision===revision)?.content;if(!target)throw Error('That saved version is no longer available.');saved={page,revision:before.revision+1,content:normalizePanelContent(page,target),canEdit:true,updatedAt:new Date().toISOString()};const store={...previewStore.current,[page]:{record:saved,revisions:[{revision:saved.revision,createdAt:saved.updatedAt,editorName:'Preview leader',restoredFrom:revision,content:saved.content},...(previewStore.current[page]?.revisions||[])].slice(0,30)}};if(!writeStored(pageBrowserStorage('localStorage'),PREVIEW_KEY,store))throw Error('The preview could not be restored on this device.');previewStore.current=store}
   else saved=await pageContentRequest('/api/page-content/'+encodeURIComponent(page)+'/restore',{method:'POST',body:JSON.stringify({requestId:restoreRequest.id,expectedRevision:before.revision,revision})});
   if(generation!==epoch.current)return false;install(page,{...initialRecord(page),...saved,status:'ready',savedNotice:'Earlier version restored'});persistDrafts();return true;
  }catch(error){if(generation===epoch.current)install(page,error.status===409&&error.current?{...initialRecord(page),...error.current,status:'ready',error:'Another leader changed this page. The latest version is shown; review it before restoring again.'}:{...before,status:'ready',error:error.message,restoreRequest});return false}finally{finishWork()}
 },[preview,install,persistDrafts,beginWork]);
 const prepareReload=useCallback(()=>{if(workRef.current||Object.values(ref.current).some(row=>row.status==='saving'))return false;if(!persistDrafts())return false;reloadAllowed.current=true;return true},[persistDrafts]);
 const accountReady=allowed&&identity.current===account;
 const current=accountReady?records:{};
 const hasUnsavedDrafts=accountReady&&Object.keys(collectPageDrafts(current,draftStore.current)).length>0,pending=workCount>0||Object.values(current).some(row=>row.status==='saving'),storageSafe=!storageError;
 const value=useMemo(()=>({records:current,allowed:accountReady,preview,editingPage:accountReady?editingPage:null,editingPages,arrangingPage,setArrangingPage,pauseAutosave,activeEditor,storageError,hasUnsavedDrafts,pending,storageSafe,prepareReload,load,retainPage,begin,beginWork,activateSurface,update,save,discard,reviewLatest,rebase,history,restore,finish:()=>setEditingPage(null)}),[current,accountReady,preview,editingPage,editingPages,arrangingPage,setArrangingPage,pauseAutosave,activeEditor,storageError,hasUnsavedDrafts,pending,storageSafe,prepareReload,load,retainPage,begin,beginWork,activateSurface,update,save,discard,reviewLatest,rebase,history,restore]);
 return <PageContentContext.Provider value={value}>{children}</PageContentContext.Provider>;
}

export function usePageContent(page){
 const context=useContext(PageContentContext),valid=knownPage(page);
 const status=context?.records[page]?.status;
 useEffect(()=>{if(valid&&context?.allowed)return context.retainPage(page)},[page,valid,context?.allowed,context?.retainPage]);
 // One coalesced request per page when returning to a cached read-only surface.
 useEffect(()=>{if(valid&&context?.allowed&&status==='ready'&&!context.editingPage&&!pageContentDirty(context.records[page]))void context.load(page,{force:true})},[page,valid,context?.allowed,context?.load]);
 useEffect(()=>{if(valid&&context?.allowed&&(!status||status==='idle'))void context.load(page)},[valid,page,context?.allowed,context?.load,status]);
 const record=valid?context?.records[page]||initialRecord(page):null;
 return {...context,record,content:record?.draft||record?.content,editing:!!context?.allowed&&!!record?.canEdit&&!!context.editingPage&&context.editingPages.includes(page),valid};
}

export function EditableText({page,field,as:Tag='span',children,className='',...props}){
 const panelLocked=useContext(PagePanelLockContext),editor=usePageContent(page),definition=knownPage(page)?SHARED_PAGE_SCHEMA[page].fields[field]:null;
 const [active,setActive]=useState(false),[bounds,setBounds]=useState(null),original=useRef(''),input=useRef(null),trigger=useRef(null),id=useId();
 const stored=editor.content?.text?.[field],hasOriginal=children!==undefined,originalValue=hasOriginal&&(!editor.record?.draft&&editor.record?.revision===0||stored===definition?.default),text=originalValue?plainChildren(children):typeof stored==='string'?stored:plainChildren(children),busy=false;
 useEffect(()=>{if(!editor.editing||active&&editor.activeEditor!==id)setActive(false)},[editor.editing,editor.activeEditor,active,id]);
 useEffect(()=>{if(active){input.current?.focus();input.current?.setSelectionRange?.(0,input.current.value.length)}},[active]);
 const start=()=>{if(!editor.editing||busy)return;original.current=text;const rect=trigger.current.parentElement.getBoundingClientRect(),edge=Math.min(window.visualViewport?(window.visualViewport.offsetLeft+window.visualViewport.width):window.innerWidth,trigger.current.closest('.card,section')?.getBoundingClientRect().right||Infinity);setBounds({width:rect.width,height:rect.height,inputWidth:Math.max(rect.width,Math.min(240,edge-rect.left-12))});editor.activateSurface(trigger.current,id);setActive(true)};
 const finish=()=>{setActive(false);requestAnimationFrame(()=>trigger.current?.focus())};
 const change=value=>editor.update(page,draft=>({...draft,text:{...draft.text,[field]:value}}));
 if(!definition||!editor.allowed)return <Tag className={className} {...props}>{children}</Tag>;
 if(definition.format==='markdown')return <EditableBodyText page={page} field={field} as={Tag} className={className} {...props}>{children}</EditableBodyText>;
 const shown=originalValue?children:typeof stored==='string'?text:children;
 if(!editor.editing||panelLocked)return <Tag className={className} {...props}><span className="page-copy-value">{shown}</span></Tag>;
 const Input=definition.type==='multiline'?'textarea':'input';
 return <Tag className={'page-editable-copy '+className} {...props} data-page-field={page+'.'+field}>
  <span className={'page-copy-frame '+(active?'is-active':'')} style={active&&bounds?{width:bounds.width,height:bounds.height,'--page-input-width':bounds.inputWidth+'px'}:undefined}>
   <span ref={trigger} className="page-copy-target" role={!active?'button':undefined} tabIndex={!active?0:undefined} aria-label={!active?'Edit '+definition.label:undefined} aria-hidden={active||undefined} onClick={start} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();start()}}}>{shown||<span className="page-empty-copy">{definition.label}</span>}</span>
   {active&&<span className="page-copy-input-wrap"><Input ref={input} id={id} className="page-copy-input" aria-label={definition.label} maxLength={definition.maxLength} rows={definition.type==='multiline'?2:undefined} value={text} disabled={busy} onChange={e=>change(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();change(original.current);finish()}else if(e.key==='Enter'&&(definition.type!=='multiline'||e.metaKey||e.ctrlKey)){e.preventDefault();finish()}}}/><Control type="button" className="page-field-done" disabled={busy} aria-label={'Finish editing '+definition.label} onClick={finish}><Glyph name="check"/></Control></span>}
  </span>
 </Tag>;
}
function EditableBodyText({page,field,as:Tag='div',children,className='',...props}){
 const editor=usePageContent(page),locked=useContext(PagePanelLockContext),definition=SHARED_PAGE_SCHEMA[page].fields[field],stored=editor.content.text[field],format=editor.content.bodyFormats?.[field],id=useId(),trigger=useRef(null),original=useRef(null),[active,setActive]=useState(false),[initialSource,setInitialSource]=useState('');
 const originalValue=children!==undefined&&(!editor.record.draft&&editor.record.revision===0||stored===definition.default),text=originalValue?plainChildren(children):stored,busy=false,Block=['p','span'].includes(Tag)?'div':Tag;
 useEffect(()=>{if(!editor.editing||locked||active&&editor.activeEditor!==id)setActive(false)},[editor.editing,locked,active,editor.activeEditor,id]);
 const finish=()=>{setActive(false);requestAnimationFrame(()=>trigger.current?.focus())};
 const start=()=>{if(busy||locked)return;original.current={text:stored,format};setInitialSource(format==='markdown'?text:plainTextToMarkdown(text));editor.activateSurface(trigger.current,id);setActive(true)};
 const change=value=>editor.update(page,draft=>({...draft,text:{...draft.text,[field]:value},bodyFormats:{...draft.bodyFormats,[field]:'markdown'}}));
 const shown=format==='markdown'?<PageMarkdownBody source={text}/>:<span className="page-copy-value">{originalValue?children:text}</span>;
 if(!editor.editing||locked)return <Block className={className} {...props}>{shown}</Block>;
 return <Block className={'page-editable-copy page-editable-body '+className} {...props} data-page-field={page+'.'+field}>
  {active?<div className="page-body-editor-wrap" onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.nativeEvent.isComposing){event.preventDefault();editor.update(page,draft=>{const bodyFormats={...draft.bodyFormats};if(original.current.format)bodyFormats[field]=original.current.format;else delete bodyFormats[field];return {...draft,text:{...draft.text,[field]:original.current.text},bodyFormats}});finish()}}}><PageMarkdownEditor value={format==='markdown'?stored:initialSource} ariaLabel={definition.label} maxLength={definition.maxLength} disabled={busy} onChange={change} onDone={finish} autoFocus/></div>:<div ref={trigger} className="page-body-edit-target" role="button" tabIndex={0} aria-label={'Edit '+definition.label} onClick={start} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();start()}}}>{shown||<span className="page-empty-copy">{definition.label}</span>}</div>}
 </Block>;
}
function EditGlyph(){return <svg className="glyph page-edit-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15z"/></svg>}
function useReducedMotion(){const [reduced,setReduced]=useState(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);return reduced}
function imageInChildren(children){for(const child of React.Children.toArray(children)){if(React.isValidElement(child)){if(child.type==='img')return child.props.src;const nested=imageInChildren(child.props.children);if(nested)return nested}}return undefined}
function frameOriginalMedia(children,frame){return React.Children.map(children,child=>React.isValidElement(child)?child.type==='img'?React.cloneElement(child,{style:{...child.props.style,...photoFrameStyle(frame)}}):child.props.children?React.cloneElement(child,{},frameOriginalMedia(child.props.children,frame)):child:child)}
function PageHero({hero,preview,editing,poster}){
 const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[paused,setPaused]=useState(false),reduced=useReducedMotion(),video=useRef(null),photoId=useId();
 const media=hero.media.filter(file=>safePageMediaUrl(file.url,preview)),current=media[Math.min(index,Math.max(0,media.length-1))],carousel=hero.mode==='gallery'&&media.length>1;
 const step=amount=>{setPlaying(false);setIndex(value=>wrapCarouselIndex(value+amount,media.length))};
 const swipe=useCarouselSwipe({enabled:carousel,onStep:step});
 useEffect(()=>{setIndex(0)},[hero.mode,hero.media.map(item=>item.id).join('|')]);
 useEffect(()=>{if(reduced||editing){setPlaying(false);video.current?.pause()}},[reduced,editing]);
 useEffect(()=>{if(!playing||paused||reduced||editing||media.length<2)return;const next=()=>{if(document.visibilityState==='visible')setIndex(value=>(value+1)%media.length)};const timer=setInterval(next,6000);return()=>clearInterval(timer)},[playing,paused,reduced,editing,media.length]);
 if(!current)return <div className="page-media-unavailable" role="status">This page photo isn’t available. A leader can choose another file.</div>;
 if(hero.mode==='video')return <video ref={video} className="page-hero-asset" src={current.url} poster={poster} aria-label={current.alt||'Family page video'} muted autoPlay={!reduced&&!editing} loop playsInline controls preload="metadata"/>;
 return <div className={'page-hero-gallery'+(carousel?' gw-carousel-stage':'')} role={hero.mode==='gallery'?'region':undefined} aria-roledescription={hero.mode==='gallery'?'carousel':undefined} aria-label={hero.mode==='gallery'?'Family page photos':undefined} {...swipe} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPaused(false)}} onKeyDown={event=>{
  if(!carousel||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  const next=carouselKeyboardDestination(event.key,index,media.length);
  if(next===null)return;
  event.preventDefault();setPlaying(false);setIndex(next);
 }}>
  <div className="gw-carousel-photo"><img id={photoId} className="page-hero-asset" src={current.url} alt={current.alt||''} style={photoFrameStyle(current.frame)} draggable={false}/>
   {carousel&&<><CarouselControls previousLabel="Previous page photo" nextLabel="Next page photo" controls={photoId} onPrevious={()=>step(-1)} onNext={()=>step(1)}/><div className="gw-carousel-status page-gallery-status"><span aria-live={playing?'off':'polite'} aria-atomic="true">{Math.min(index+1,media.length)} / {media.length}</span><Control type="button" aria-label={playing?'Pause page photos':'Play page photos'} aria-pressed={playing} disabled={reduced||editing} onClick={()=>setPlaying(value=>!value)}>{playing?'Pause':'Play'}</Control></div></>}
  </div>
 </div>;
}
export function EditableMedia({page,field='hero',children,className='',poster,emptyLabel='Page photo or video',...props}){
 const panelLocked=useContext(PagePanelLockContext),editor=usePageContent(page),[open,setOpen]=useState(false),hero=editor.content?.hero;
 useEffect(()=>{if(!editor.editing||panelLocked)setOpen(false)},[editor.editing,panelLocked]);
 if(!editor.valid||!editor.allowed||field!=='hero'||!SHARED_PAGE_SCHEMA[page].hero)return children||null;
 if(hero.mode==='default'&&!children&&!editor.editing)return null;
 return <div className={'page-editable-media '+className+(editor.editing&&!panelLocked?' is-editable':'')} {...props} data-page-field={page+'.hero'}>
  <div className="page-media-content">{hero.mode==='default'?(hero.frame?frameOriginalMedia(children,hero.frame):children)||<div className="page-media-placeholder">{emptyLabel}</div>:<PageHero hero={hero} preview={editor.preview} editing={editor.editing} poster={poster||imageInChildren(children)||'tree-artwork.png'}/>}</div>
  {editor.editing&&!panelLocked&&!open&&<Control type="button" className="page-media-edit" disabled={editor.record.status==='saving'} aria-label={'Edit '+SHARED_PAGE_SCHEMA[page].label+' page media'} onClick={event=>{editor.activateSurface(event.currentTarget);setOpen(true)}}><span><EditGlyph/>Edit</span></Control>}
  {open&&<PageMediaPanel page={page} originalSrc={imageInChildren(children)} onClose={()=>setOpen(false)}/>}
 </div>;
}
function PageMediaPanel({page,onClose,originalSrc}){
 const editor=usePageContent(page),hero=editor.content.hero,[framing,setFraming]=useState(null),[mode,setMode]=useState(hero.mode==='default'?'image':hero.mode),[uploading,setUploading]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),picker=useRef(null),panel=useRef(null),alive=useRef(true),uploadLock=useRef(false);
 useEffect(()=>editor.pauseAutosave(),[editor.pauseAutosave]);
 useEffect(()=>{editor.activateSurface(panel.current)},[]);
 useEffect(()=>()=>{alive.current=false},[]);
 const setHero=value=>editor.update(page,draft=>({...draft,hero:value}));
 const max=mode==='gallery'?SHARED_CONTENT_LIMITS.maxGalleryItems:1;
 async function upload(selected){
  if(uploadLock.current||!selected.length)return;uploadLock.current=true;const finishWork=editor.beginWork();setUploading(true);setError('');
  const accepted=mode==='video'?SHARED_VIDEO_TYPES:SHARED_IMAGE_TYPES,limit=editor.preview?2*1024*1024:SHARED_CONTENT_LIMITS.maxMediaBytes;
  const files=[...selected].slice(0,max),added=mode==='gallery'&&hero.mode==='gallery'?[...hero.media]:[],failures=[];
  for(let i=0;i<files.length&&added.length<max;i++){
   const file=files[i];if(alive.current)setProgress('Uploading '+(i+1)+' of '+files.length+'…');
   try{if(!accepted.includes(file.type))throw Error(mode==='video'?'Choose an MP4 or WebM video.':'Choose a JPEG, PNG, WebP or GIF photo.');if(!file.size||file.size>limit)throw Error('Choose a file under '+(limit/1024/1024)+' MB.');const output=await readPreviewFile(file,editor.preview?'preview':'live');added.push({...output,id:output.id||'preview-'+crypto.randomUUID(),alt:''});setHero({mode,media:[...added]})}catch(error){failures.push(file.name+': '+error.message)}
  }
  uploadLock.current=false;finishWork();if(alive.current){setUploading(false);setProgress(added.length?(editor.preview?'Ready in this preview.':'Uploaded privately.')+' Finish choosing media to use '+(added.length===1?'it.':'these files.'):'');setError(failures.join(' ')+(selected.length>max?' Choose up to '+max+' files at a time.':''))}
 }
 return <section className="page-inline-editor" aria-label="Page media" aria-busy={uploading}><h3>Page media</h3>
  <div ref={panel} className="page-media-panel"><div className="page-media-modes" role="group" aria-label="Page media layout">{[['image','Photo'],['gallery','Gallery'],['video','Video']].map(([value,label])=><Control key={value} type="button" aria-pressed={mode===value} disabled={uploading} onClick={()=>{setMode(value);setError('');if(hero.mode!==value&&hero.mode!=='default'){const matching=hero.media.filter(file=>value==='video'?file.type?.startsWith('video/'):file.type?.startsWith('image/')).slice(0,value==='gallery'?SHARED_CONTENT_LIMITS.maxGalleryItems:1);setHero(matching.length?{mode:value,media:matching}:{mode:'default',media:[]})}}}>{label}</Control>)}</div>
   <p className="page-editor-help">{mode==='gallery'?'Up to 10 photos, in the order you choose.':mode==='video'?'One muted, looping video. Viewers can pause it.':'One photo, shown in this page’s existing layout.'} {editor.preview?'Preview files stay on this device; 2 MB each.':'Files stay inside the signed-in family space; 20 MB each.'}</p>
   <Button secondary icon="image" disabled={uploading||editor.record.status==='saving'||mode==='gallery'&&hero.mode==='gallery'&&hero.media.length>=max} onClick={()=>picker.current?.click()}>{uploading?'Uploading…':mode==='video'?'Choose video':mode==='gallery'?'Choose photos':'Choose photo'}</Button>
   <input ref={picker} className="sr-only" type="file" aria-label={mode==='video'?'Choose page video':'Choose page photos'} accept={(mode==='video'?SHARED_VIDEO_TYPES:SHARED_IMAGE_TYPES).join(',')} multiple={mode==='gallery'} disabled={uploading} onChange={e=>{const files=[...e.target.files];e.target.value='';void upload(files)}}/>
   {hero.mode==='default'&&originalSrc&&<><Control type="button" disabled={uploading} onClick={()=>setFraming('original')}>Adjust original photo framing</Control>{framing==='original'&&<PhotoFramingEditor src={originalSrc} frame={hero.frame} disabled={uploading} onCancel={()=>setFraming(null)} onSave={frame=>{setHero({...hero,frame});setFraming(null)}}/>}</>}
   {hero.mode!=='default'&&<ol className="page-media-files">{hero.media.map((file,index)=><li key={file.id}><div className="page-media-file-preview">{file.type?.startsWith('video/')?<video src={safePageMediaUrl(file.url,editor.preview)} muted playsInline preload="metadata"/>:<img src={safePageMediaUrl(file.url,editor.preview)} alt="" style={photoFrameStyle(file.frame)}/>}<Control type="button" disabled={uploading} aria-label={'Remove '+(file.name||'file '+(index+1))} onClick={()=>{const media=hero.media.filter(item=>item.id!==file.id);setHero(media.length?{...hero,media}:{mode:'default',media:[]})}}><Glyph name="close"/></Control></div><div className="page-media-file-details"><span>{file.name||'Page file '+(index+1)}</span><label>Photo or video description<input value={file.alt||''} maxLength={SHARED_CONTENT_LIMITS.maxAltLength} disabled={uploading} placeholder="Describe what’s shown" onChange={e=>setHero({...hero,media:hero.media.map(item=>item.id===file.id?{...item,alt:e.target.value}:item)})}/></label>{hero.mode!=='video'&&<Control type="button" disabled={uploading} onClick={()=>setFraming(file.id)}>Adjust framing</Control>}{framing===file.id&&hero.mode!=='video'&&<PhotoFramingEditor src={safePageMediaUrl(file.url,editor.preview)} alt={file.alt||''} frame={file.frame} disabled={uploading} onCancel={()=>setFraming(null)} onSave={frame=>{setHero({...hero,media:hero.media.map(item=>item.id===file.id?{...item,frame}:item)});setFraming(null)}}/>}{hero.mode==='gallery'&&hero.media.length>1&&<div className="page-media-order"><Control type="button" disabled={uploading||index===0} aria-label={'Move photo '+(index+1)+' earlier'} onClick={()=>{const media=[...hero.media];[media[index-1],media[index]]=[media[index],media[index-1]];setHero({...hero,media})}}>Earlier</Control><Control type="button" disabled={uploading||index===hero.media.length-1} aria-label={'Move photo '+(index+1)+' later'} onClick={()=>{const media=[...hero.media];[media[index+1],media[index]]=[media[index],media[index+1]];setHero({...hero,media})}}>Later</Control></div>}</div></li>)}</ol>}
   {progress&&<p className="page-editor-help" role="status" aria-label="Page media upload">{progress}</p>}{error&&<p className="page-editor-error" role="alert">{error}</p>}
   <div className="page-media-panel-actions"><Control type="button" className="text-button" disabled={uploading||hero.mode==='default'} onClick={()=>setHero({mode:'default',media:[]})}>Use original media</Control><Button icon="check" disabled={uploading} onClick={onClose}>Done</Button></div>
  </div>
 </section>;
}
function PageHistory({page,pages=[page],onClose}){
 const context=useContext(PageContentContext),[selected,setSelected]=useState(page),[rows,setRows]=useState([]),[next,setNext]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[confirm,setConfirm]=useState(null),[restoring,setRestoring]=useState(false);
 const record=context.records[selected],dirty=pageContentDirty(record),sequence=useRef(0);
 async function load(append=false){const generation=++sequence.current;setLoading(true);setError('');try{const result=await context.history(selected,append?next:null);if(generation===sequence.current){setRows(previous=>append?[...previous,...result.revisions]:result.revisions);setNext(result.nextBefore)}}catch(error){if(generation===sequence.current)setError(error.message)}finally{if(generation===sequence.current)setLoading(false)}}
 useEffect(()=>{setRows([]);setConfirm(null);void context.load(selected);void load();return()=>{sequence.current++}},[selected]);
 async function restore(revision){if(restoring)return;setRestoring(true);const ok=await context.restore(selected,revision);setRestoring(false);if(ok){setConfirm(null);await load()}else setError(context.records[selected]?.error||'The version could not be restored. Close this panel to review the page status.')}
 return <section className="page-inline-editor" aria-label="Page history" aria-busy={restoring}><div className="page-panel-editor-heading"><h3>Page history</h3><Control type="button" disabled={restoring} onClick={onClose}>Close history</Control></div><div className="page-history-panel">
  <label>History for<select aria-label="History for" value={selected} disabled={restoring} onChange={event=>setSelected(event.target.value)}>{[...new Set([...pages,'global'])].filter(knownPage).map(key=><option key={key} value={key}>{SHARED_PAGE_SCHEMA[key].label+(key==='global'?'':' page')}</option>)}</select></label>
  <p className="page-editor-help">Restoring creates a new saved version. The current version stays in history.{context.preview?' This is this device’s preview history.':''}</p>
  {dirty&&<p className="page-editor-error" role="status">Save or discard this page’s draft before restoring a version.</p>}
  {error&&<div className="page-editor-error" role="alert">{error}<Control type="button" onClick={()=>load()}>Try again</Control></div>}
  {loading&&<p role="status">Loading page history…</p>}
  {!loading&&!rows.length&&<p className="page-editor-help">No earlier edits yet. Your first saved change will appear here.</p>}
  <ol className="page-revision-list">{rows.map(row=><li key={row.revision}><div><strong>Version {row.revision}{row.revision===record?.revision?' · Current':''}</strong><span>{row.editorName||'Family leader'} · {new Date(row.createdAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</span>{row.restoredFrom!=null&&<span>Restored from {row.restoredFrom===0?'original content':'version '+row.restoredFrom}</span>}</div><Control type="button" className="text-button" disabled={dirty||restoring||row.revision===record?.revision} onClick={()=>setConfirm(row.revision)}>Restore</Control></li>)}</ol>
  {next&&<Button secondary disabled={loading||restoring} onClick={()=>load(true)}>Earlier versions</Button>}
  <Control type="button" className="text-button" disabled={dirty||restoring||!record?.revision} onClick={()=>setConfirm(0)}>Restore original content</Control>
  {confirm!==null&&<div className="page-restore-confirm" role="alert"><p>Restore {confirm===0?'the original content':'version '+confirm}?</p><div className="page-editor-actions"><Button disabled={restoring} onClick={()=>restore(confirm)}>{restoring?'Restoring…':'Restore version'}</Button><Button secondary disabled={restoring} onClick={()=>setConfirm(null)}>Keep current</Button></div></div>}
 </div></section>;
}
export function PageEditToolbar({page,relatedPages=[],className=''}){
 const editor=usePageContent(page),global=usePageContent('global'),[history,setHistory]=useState(false),[discarding,setDiscarding]=useState(false),[working,setWorking]=useState(false),tools=useRef(null),record=editor.record;
 useEffect(()=>{const close=event=>{if(tools.current?.open&&!tools.current.contains(event.target))tools.current.open=false};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[]);
 if(!editor.valid||page==='global'||!editor.allowed)return null;
 const pages=[...new Set([page,...relatedPages,...(global.valid?['global']:[])])].filter(knownPage),rows=pages.map(key=>editor.records[key]).filter(Boolean),dirty=rows.some(pageContentDirty),busy=working||editor.pending||rows.some(row=>row.status==='saving'),errors=rows.filter(row=>row.error),conflicts=rows.filter(row=>row.latest||row.conflicted);
 if(!record?.canEdit){return record?.status==='error'?<div className="page-content-load-error" role="status"><span>Page updates couldn’t load. Showing the original content.</span><Control type="button" className="text-button" onClick={()=>editor.load(page,{force:true})}>Try again</Control></div>:null}
 async function save(){if(busy||conflicts.length)return false;setWorking(true);try{for(const key of pages){if(pageContentDirty(editor.records[key])&&!await editor.save(key))return false}return true}finally{setWorking(false)}}
 const done=async()=>{if(busy)return;if(dirty&&!await save())return;editor.finish()};
 const discard=()=>{for(const key of pages)editor.discard(key);setDiscarding(false);editor.finish()};
 return <div className={'page-edit-toolbar '+className+(editor.editing?' is-editing':'')}>
  {!editor.editing?<div className="page-edit-entry"><Control type="button" className="page-edit-entry-button" onClick={()=>editor.begin(page,relatedPages)}><EditGlyph/>{dirty?'Resume page edits':'Edit page'}</Control>{dirty&&<span>Draft kept</span>}</div>:<>
   <div className="page-edit-modebar"><div className="page-edit-mode-label"><EditGlyph/><strong>Editing {SHARED_PAGE_SCHEMA[page].label}</strong><span role="status" aria-live="polite">{errors.length||conflicts.length?'Couldn’t save · your changes are kept':working||rows.some(row=>row.status==='saving')?'Saving…':busy?'Preparing media…':dirty?'Changes waiting to save':record.savedNotice||'Changes save automatically'}</span></div><div className="page-editor-actions"><Control type="button" className="page-arrange-toggle" disabled={busy} aria-pressed={editor.arrangingPage} onClick={()=>editor.setArrangingPage(value=>!value)}><Glyph name="settings"/>{editor.arrangingPage?'Finish arranging':'Arrange page'}</Control><Control type="button" className="page-mode-done" disabled={busy} onClick={done}>View page<Glyph name="arrow"/></Control><details ref={tools} className="page-edit-tools" onClick={event=>{const action=event.target.closest('button');if(action&&!action.disabled)event.currentTarget.open=false}} onKeyDown={event=>{if(event.key==='Escape'&&event.currentTarget.open){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}><summary>Page tools</summary><div><Control type="button" className="page-history-button" disabled={busy} aria-label="View page history" onClick={()=>setHistory(true)}><Glyph name="clock"/><span>History</span></Control><Control type="button" disabled={busy||!dirty} onClick={()=>setDiscarding(true)}>Discard unsaved changes</Control></div></details></div></div>
   <p className="page-editor-guide">{editor.arrangingPage?'Choose a section to move, resize or arrange.':'Tap text or a photo to edit it. Changes save automatically.'}{editor.preview?' This is sample content; changes stay on this device.':''}</p>
   {editor.arrangingPage&&<PagePanelActions page={page}/>}
   {editor.storageError&&<p className="page-editor-error" role="alert">{editor.storageError}</p>}
   {errors.map(row=><div key={row.page} className="page-editor-error" role="alert"><span>{SHARED_PAGE_SCHEMA[row.page].label}: {row.error}</span>{!row.latest&&!row.conflicted&&<Control type="button" disabled={busy} onClick={()=>editor.save(row.page)}>Try saving again</Control>}</div>)}
   {conflicts.map(row=><section className="page-conflict-review" key={row.page}><strong>{SHARED_PAGE_SCHEMA[row.page].label} has a newer version</strong>{!row.merge?<Control type="button" className="text-button" onClick={()=>editor.reviewLatest(row.page)}>Review latest changes</Control>:<><p>{row.merge.conflicts.length?'Choose which values to keep for the changes below. Other changes will be combined.':'Your edits and the latest changes affect different fields. You can safely combine them.'}</p>{row.merge.conflicts.map(item=><div key={item.field} className="page-conflict-values"><strong>{item.field==='hero'?'Page media':item.field==='panelLayout'?'Panel layout and content':item.field.startsWith('cardLayout:')?'Card content arrangement':SHARED_PAGE_SCHEMA[row.page].fields[item.field].label}</strong><p>Yours: {item.mine}</p><p>Latest: {item.theirs}</p></div>)}<div className="page-editor-actions"><Button secondary onClick={()=>editor.rebase(row.page,true)}>{row.merge.conflicts.length?'Keep my edits':'Combine changes'}</Button>{!!row.merge.conflicts.length&&<Button secondary onClick={()=>editor.rebase(row.page,false)}>Use latest values</Button>}</div></>}</section>)}
   {discarding&&<div className="page-discard-prompt" role="alert"><span>Discard the changes that haven’t saved yet? Already saved changes stay in History.</span><div className="page-editor-actions"><Button secondary disabled={busy} onClick={()=>setDiscarding(false)}>Keep editing</Button><Control type="button" className="text-button" disabled={busy} onClick={discard}>Discard unsaved changes and view page</Control></div></div>}
  </>}
  {history&&<PageHistory page={page} pages={pages} onClose={()=>setHistory(false)}/>}
 </div>;
}
