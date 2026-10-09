import {PushDeviceSettings} from './push-device.jsx';
import {EmailNotificationSettings} from './email-notifications.jsx';
import React,{forwardRef,useEffect,useRef,useState} from 'react';
import {Button,Control,Glyph,useApp,formatTime} from './ui-core.jsx';
import {ChoiceControl} from './choice-control.jsx';
import {MemberPicker} from './member-picker.jsx';
import {ActivityDots} from './activity.jsx';
import {NOTIFICATION_CATEGORIES,NOTIFICATION_SCOPES,NOTIFICATION_DELIVERY_CHANNELS,restoreNotificationSettingFocus} from './notification-model.js';
export {useNotifications} from './use-notifications.js';
import './notifications.css';

export const NotificationsButton=forwardRef(function NotificationsButton({expanded,onClick},ref){
 const {notifications}=useApp(),count=notifications?.unreadCount||0;
 return <Control ref={ref} type="button" className="icon-button notification-entry" aria-label={count?`Notifications, ${count} unread`:'Notifications'} aria-expanded={expanded} onClick={onClick}><Glyph name="bell"/>{count>0&&<span className="notification-badge" aria-hidden="true">{count>99?'99+':count}</span>}</Control>;
});
function Failure({notifications}){
 return notifications.error?<div className="notification-error" role="alert"><p>{notifications.error}</p><Control type="button" className="text-button" disabled={notifications.busy||notifications.refreshing} onClick={notifications.refresh}>Refresh activity</Control></div>:null;
}
function PreviewDisclosure({notifications}){
 const {state}=useApp();return state.mode==='preview'?<div className="notification-preview"><p>Fictional preview activity. These choices stay on this device; nothing is sent.</p><Control type="button" className="text-button" disabled={notifications.busy} onClick={notifications.resetPreview}>Reset sample activity</Control></div>:null;
}
const noticeTime=value=>{const ms=typeof value==='number'?value:Date.parse(value);return Number.isFinite(ms)?{date:new Date(ms).toISOString(),label:formatTime(ms),full:new Date(ms).toLocaleString()}:null};
export function Notifications({active=true}){
 const {notifications:n,go,openSheet,navigationVersion,messaging}=useApp(),[filter,setFilter]=useState('all'),openAttempt=useRef(0),visible=useRef(active);visible.current=active;
 useEffect(()=>{if(!active)openAttempt.current++},[active]);
 if(!n)return null;
 const items=filter==='unread'?n.items.filter(item=>!item.readAt):n.items;
 async function open(id){const attempt=++openAttempt.current,version=navigationVersion?.();const result=await n.open(id);if(result?.route?.type==='inbox')await messaging?.refresh?.();if(result?.available&&result.route&&visible.current&&attempt===openAttempt.current&&navigationVersion?.()===version)go(result.route)}
 return <section className="notification-panel pop-content" aria-label="Notifications">
  <div className="notification-panel-heading"><div><h3>Notifications</h3><p className="small muted" role="status">{n.loading?'Checking activity…':n.ready?`${n.unreadCount} unread ${n.unreadCount===1?'update':'updates'}`:'Activity unavailable'}</p></div><Control type="button" className="icon-button" aria-label="Notification settings" onClick={()=>go({type:'notification-settings'})}><Glyph name="settings"/></Control></div>
  <PreviewDisclosure notifications={n}/><Failure notifications={n}/>
  {n.settings.globalOff&&<p className="notification-off-note">Activity is off. Your saved history and choices are kept. Turn activity on in Settings to see eligible updates.</p>}
  <div className="notification-list-controls"><ChoiceControl label="Show activity" value={filter} onChange={setFilter} options={[{value:'all',label:'All'},{value:'unread',label:'Unread'}]} variant="chips"/><div className="notification-bulk-actions"><Control type="button" className="text-button" disabled={!n.ready||n.busy||!n.unreadCount||n.readAllCutoff==null} onClick={n.readAll}>Mark all read</Control><Control type="button" className="text-button" disabled={!n.ready||n.busy||!n.items.length||n.readAllCutoff==null} onClick={n.clearAll}>Clear all</Control></div></div>
  {n.loading?<ActivityDots label="Loading notifications"/>:<ul className="notification-inbox" aria-label="Activity updates" aria-busy={n.busy||n.refreshing}>{items.map(item=>{
   const category=NOTIFICATION_CATEGORIES.find(c=>c.id===item.category),time=noticeTime(item.createdAt);
   return <li key={item.id} className={'notification-row'+(item.readAt?' is-read':' is-unread')} data-notice-id={item.id}>
    <div className="notification-row-content"><Control type="button" className="notification-open" disabled={n.busy} aria-label={`Open ${item.title||'family update'}${item.readAt?'':', unread'}`} onClick={()=>open(item.id)}><span className="notification-category-icon" aria-hidden="true"><Glyph name={category?.icon||'bell'}/></span><span className="notification-copy"><span className="notification-title">{item.title||'Family update'}{!item.readAt&&<span className="notification-unread-dot" aria-hidden="true"/>}</span>{item.text&&<span className="notification-summary">{item.text}</span>}<span className="notification-meta"><span>{category?.label||'Activity'}</span>{time&&<time dateTime={time.date} title={time.full}>{time.label}</time>}</span></span></Control>
    <div className="notification-row-actions">{!item.readAt&&item.kind!=='message.created'?<Control type="button" className="text-button" disabled={n.busy} onClick={()=>n.read(item.id)} aria-label={'Mark '+(item.title||'update')+' read'}>Mark read</Control>:<span className="small muted">{item.kind==='message.created'?'Read in Messages':'Read'}</span>}<Control type="button" className="text-button" disabled={n.busy} onClick={()=>n.dismiss(item.id)} aria-label={'Dismiss '+(item.title||'update')}>Dismiss</Control></div></div>
   </li>;
  })}</ul>}
  {!n.loading&&!n.error&&!items.length&&<div className="notification-empty"><Glyph name="bell"/><p>{n.settings.globalOff?'Your activity is paused.':filter==='unread'?'No unread updates on this page.':'No updates yet.'}</p><span className="small muted">{n.settings.globalOff?'You can turn it back on whenever you like.':n.nextCursor?'You can load earlier activity below.':'New activity that matches your choices will appear here.'}</span></div>}
  {n.nextCursor!=null&&<Button secondary className="notification-load-more" disabled={n.busy||n.refreshing} onClick={n.loadMore}>{n.refreshing?'Loading earlier activity…':'Load earlier activity'}</Button>}
  <p className="notification-message-note small muted">Unread messages have their own count in Messages.</p>
 </section>;
}
export function NotificationSettings(){
 const {state,notifications:n}=useApp(),pendingFocus=useRef(null);
 useEffect(()=>{
  const pending=pendingFocus.current;if(!pending||n?.busy)return;
  pendingFocus.current=null;
  if(pending.account===state.selfId&&pending.mode===state.mode)restoreNotificationSettingFocus(pending.input);
 },[n?.busy,n?.ready,n?.settings?.revision,state.selfId,state.mode]);
 if(!n)return null;const settings=n.settings,disabled=n.busy||n.loading||!n.ready;
 function saveChannel(event,category,channel){
  // Keyboard/screen-reader activation has no pointer click detail. A pointer
  // edit does not create a focus-restoration request.
  pendingFocus.current=event.nativeEvent?.detail===0?{input:event.currentTarget,account:state.selfId,mode:state.mode}:null;
  return n.saveSettings({channels:{[category]:{[channel]:event.target.checked}}});
 }
 return <section className="notification-settings stack" aria-label="Notification choices">
  <p className="notification-settings-intro">Choose the activity you want to hear about. Tags, replies, and private status updates have their own choices.</p>
  <PreviewDisclosure notifications={n}/><Failure notifications={n}/>{n.loading&&<ActivityDots label="Loading notification choices"/>}
  <PushDeviceSettings/>
  <EmailNotificationSettings/>
  <section className="notification-settings-section"><h2>All notifications</h2><ChoiceControl label="All activity" value={settings.globalOff?'off':'on'} onChange={value=>n.saveSettings({globalOff:value==='off'})} disabled={disabled} options={[{value:'on',label:'On'},{value:'off',label:'Off'}]} help="Off pauses in-app activity, email, and push. Your choices and history stay saved. Turning activity back on does not re-enable push on this device." variant="chips"/></section>
  <section className="notification-settings-section"><h2>Following</h2><ChoiceControl label="Whose posts and memories?" value={settings.scope==='off'?'leaders':settings.scope} onChange={scope=>n.saveSettings({scope})} disabled={disabled||settings.globalOff} options={NOTIFICATION_SCOPES.filter(option=>option.value!=='off')} help="Following applies to general posts and memories. Your direct replies, tags, and private updates use the categories below." variant="chips"/>{settings.scope==='selected'&&<MemberPicker label="People to follow" multiple value={settings.selectedIds} onChange={selectedIds=>n.saveSettings({selectedIds})} disabled={disabled||settings.globalOff} filter={member=>member.id!==state.selfId&&!member.managedBy&&member.origin!=='dependent'} help="Choose registered family members. Private children’s records and ancestors are never notification recipients."/>}</section>
  <section className="notification-settings-section"><h2>Activity categories</h2><p className="small muted" id="notification-channel-help">Choose where each kind of update appears. Email requires email updates to be on; push requires an enabled device. These choices never turn either on.{settings.globalOff?' All channels are paused while activity is off.':''}</p><div className="notification-category-options">{NOTIFICATION_CATEGORIES.map(category=><div className="notification-category-choice" role="group" aria-labelledby={'notification-category-'+category.id} aria-describedby={'notification-detail-'+category.id} key={category.id}>
   <div className="notification-category-copy"><strong id={'notification-category-'+category.id}>{category.label}</strong><span id={'notification-detail-'+category.id}>{category.detail}</span></div>
   <div className="notification-channel-choices">{NOTIFICATION_DELIVERY_CHANNELS.map(channel=><label className="notification-channel-choice" key={channel.id}><input type="checkbox" aria-label={category.label+': '+channel.label} aria-describedby="notification-channel-help" checked={settings.channels[category.id][channel.id]} disabled={disabled||settings.globalOff} onChange={event=>saveChannel(event,category.id,channel.id)}/><span>{channel.label}</span></label>)}</div>
  </div>)}</div><p className="small muted">Each change is saved automatically. Turning a channel off cancels its queued updates; an update already sent cannot be recalled.</p></section>
  {n.busy&&<ActivityDots label="Saving notification choices"/>}
 </section>;
}

export function NotificationSettingsPage(){
 const heading=useRef(null);
 useEffect(()=>{heading.current?.focus({preventScroll:true})},[]);
 return <section className="notification-settings-page stack" aria-labelledby="notification-settings-heading"><div className="notification-settings-page-heading"><h1 id="notification-settings-heading" ref={heading} tabIndex={-1}>Notifications</h1><p>Choose in-app, email, and push updates for each kind of activity.</p></div><NotificationSettings/></section>;
}
