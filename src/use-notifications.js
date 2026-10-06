import {useCallback,useEffect,useRef,useState} from 'react';
import {createNotificationChannel,mergeNotificationPages,normalizeNotificationSettings,notificationTargetRoute,previewNotificationPage,previewOpenNotification} from './notification-model.js';
const PAGE_SIZE=30;
const blank=(identity,state)=>({identity,items:[],unreadCount:0,nextCursor:null,readAllCutoff:null,settings:normalizeNotificationSettings(state?.notificationSettings,state),ready:false,loading:true,refreshing:false,busy:false,error:''});
export function useNotifications(data){
 const {state}=data,enabled=state.onboarding==='done'&&(state.mode==='preview'?data.preview:state.mode==='live'&&data.session?.status==='active');
 const identity=enabled?`${state.mode}:${state.selfId}`:'inactive',current=useRef({identity,data});current.current={identity,data};
 const runtime=useRef(null),channel=useRef(null),[snapshot,setSnapshot]=useState(()=>blank(identity,state));
 const valid=run=>run?.active&&!run.accountInvalidated&&runtime.current===run&&current.current.identity===run.identity;
 const update=(run,patch)=>{if(valid(run))setSnapshot(previous=>({...previous,...patch,identity:run.identity}))};
 const accountMatches=(run,result)=>{
  if(run.mode==='preview'||!result?.accountId||result.accountId===run.accountId)return true;
  update(run,{...blank(run.identity),loading:false,error:'Your account changed. Refreshing your activity…'});
  run.accountInvalidated=true;run.sequence++;run.controller?.abort();current.current.data.refresh();return false;
 };
 const refresh=useCallback(async({more=false,force=false}={})=>{
  const run=runtime.current;if(!valid(run)||!enabled||run.mutating&&!force)return false;
  if(run.fetching&&!force)return false;
  run.controller?.abort();const controller=new AbortController(),sequence=++run.sequence;run.controller=controller;run.fetching=true;
  const depth=run.depth+(more?1:0);update(run,{refreshing:true,error:''});
  try{
   const pages=[];let before;
   for(let index=0;index<depth;index++){
    const live=current.current.data,page=run.mode==='preview'?previewNotificationPage(live.getCurrentState?.()||live.state,{before,limit:PAGE_SIZE}):await live.notificationApi.list({before,limit:PAGE_SIZE,signal:controller.signal});
    if(!valid(run)||run.sequence!==sequence||!accountMatches(run,page))return false;
    pages.push(page);before=page.nextCursor;if(before==null)break;
   }
   const first=pages[0],last=pages.at(-1);run.depth=pages.length;
   update(run,{items:mergeNotificationPages(pages),unreadCount:Number.isSafeInteger(first.unreadCount)?Math.max(0,first.unreadCount):0,
    nextCursor:last.nextCursor??null,readAllCutoff:Number.isSafeInteger(first.readAllCutoff)?first.readAllCutoff:null,
    settings:normalizeNotificationSettings(first.settings||{},current.current.data.state),ready:true,loading:false,error:''});return true;
  }catch(error){
   if(valid(run)&&run.sequence===sequence&&error.name!=='AbortError'){
    const denied=[401,403].includes(error.status);update(run,{...(denied?blank(run.identity):{}),loading:false,error:denied?'Sign in again to see your activity.':error.message||'Activity could not refresh. Try again when you’re connected.'});if(denied)current.current.data.refresh();
   }return false;
  }finally{if(valid(run)&&run.sequence===sequence){run.fetching=false;update(run,{refreshing:false})}}
 },[identity,enabled]);
 useEffect(()=>{
  const run={identity,accountId:state.selfId,mode:state.mode,active:true,sequence:0,depth:1,fetching:false,mutating:false,controller:null};runtime.current=run;
  setSnapshot(blank(identity,state));if(!enabled){setSnapshot({...blank(identity,state),loading:false});return()=>{run.active=false}}
  refresh();const tick=()=>{if(document.visibilityState==='visible'&&navigator.onLine!==false)refresh()};
  const timer=setInterval(tick,15000);window.addEventListener('online',tick);document.addEventListener('visibilitychange',tick);
  // Preview never listens to a live-account invalidation channel.
  if(state.mode==='live')channel.current=createNotificationChannel(tick);
  return()=>{run.active=false;run.sequence++;run.controller?.abort();channel.current?.send();channel.current?.close();channel.current=null;clearInterval(timer);window.removeEventListener('online',tick);document.removeEventListener('visibilitychange',tick)};
 },[identity,enabled,refresh]);
 // A local preview reset or a just-committed family command should be reflected
 // immediately. No draft/compose/filter/bag field is read or replaced here.
 useEffect(()=>{if(enabled)refresh()},[state.notifications,state.readNotices,state.notificationSettings?.revision,state.notificationUnreadCount]);
 async function perform(operation,{conflict=false}={}){
  const run=runtime.current;if(!valid(run)||!enabled||run.mutating)return false;
  run.mutating=true;run.sequence++;run.controller?.abort();run.fetching=false;update(run,{busy:true,error:''});
  const live=current.current.data,finish=live.beginPending?.()||(()=>{});
  try{
   const result=await operation(run,live);if(!valid(run)||!accountMatches(run,result))return false;
   if(run.mode==='live')channel.current?.send();
   await refresh({force:true});return valid(run)?result??true:false;
  }catch(error){
   if(!valid(run))return false;
   if(error.status===409&&conflict){await refresh({force:true});update(run,{error:'Your notification choices changed on another device. The latest choices are shown; choose again to save your change.'})}
   else update(run,{error:error.name==='AbortError'?'The connection timed out. You can safely try this action again.':error.message||'That change could not be saved. Try again.'});
   if([401,403].includes(error.status)){update(run,{items:[],unreadCount:0,ready:false});live.refresh()}
   return false;
  }finally{run.mutating=false;finish();update(run,{busy:false})}
 }
 const read=id=>perform(async(run,live)=>run.mode==='preview'?live.dispatch({type:'MARK_NOTICE_READ',id}):live.notificationApi.read(id,run.accountId));
 const dismiss=id=>perform(async(run,live)=>run.mode==='preview'?live.dispatch({type:'DISMISS_NOTICE',id}):live.notificationApi.dismiss(id,run.accountId));
 const readAll=()=>{const cutoff=snapshot.identity===identity?snapshot.readAllCutoff:null;if(!Number.isSafeInteger(cutoff))return Promise.resolve(false);return perform(async(run,live)=>run.mode==='preview'?live.dispatch({type:'MARK_NOTICES_READ_ALL',cutoff}):live.notificationApi.readAll(cutoff,run.accountId))};
 const saveSettings=patch=>{const revision=snapshot.identity===identity?snapshot.settings.revision:0;return perform(async(run,live)=>{
  if(run.mode==='live')return live.notificationApi.saveSettings(patch,revision,run.accountId);
  const latest=normalizeNotificationSettings((live.getCurrentState?.()||live.state).notificationSettings);if(latest.revision!==revision)throw Object.assign(new Error('Notification choices changed.'),{status:409});
  return live.dispatch({type:'SET_NOTIFICATION_SETTINGS',patch,revision});
 },{conflict:true})};
 const open=async id=>{
  const result=await perform(async(run,live)=>{
   const result=run.mode==='preview'?previewOpenNotification(live.getCurrentState?.()||live.state,id):await live.notificationApi.open(id,run.accountId);
   if(!valid(run)||!accountMatches(run,result))return false;
   if(!result.available||!notificationTargetRoute(result.target))return {available:false};
   if(run.mode==='live'){
    if(!live.hydrateNotificationResource(result,{accountId:run.accountId,noticeId:id}))return false;
    if(!['post','comment','memory','conversation','invitation'].includes(result.target.kind)){
     const session=await live.refresh();if(!valid(run)||session?.status!=='active'||(live.getCurrentState?.()||live.state).selfId!==run.accountId)return false;
    }
   }
   // Opening an invitation never accepts it. Message notices remain governed by
   // the conversation read cursor; opening a link alone cannot read a message.
   const notice=(snapshot.items||[]).find(n=>n.id===id);
   if(notice?.kind!=='message.created'){
    if(run.mode==='preview')await live.dispatch({type:'MARK_NOTICE_READ',id});
    else await live.notificationApi.read(id,run.accountId);
   }
   return {...result,route:notificationTargetRoute(result.target)};
  });
  if(result?.available===false){const run=runtime.current;update(run,{error:'This update is no longer available.'})}
  return result;
 };
 const resetPreview=()=>perform((run,live)=>run.mode==='preview'?live.dispatch({type:'RESET_NOTIFICATIONS_PREVIEW'}):false);
 const view=snapshot.identity===identity?snapshot:{...blank(identity,state),loading:enabled};
 return {...view,enabled,refresh:()=>refresh({force:true}),loadMore:()=>refresh({more:true}),read,dismiss,readAll,saveSettings,open,resetPreview};
}
