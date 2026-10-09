import {pushPresentation,validPushId} from './push-presentation.js';
// Online code is never served from an old application cache. No private data is cached.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('gw-static-')).map(k=>caches.delete(k)));await self.clients.claim()})()));
// Deliberately no fetch handler: browser/Worker revalidation governs every request.
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let payload;try{payload=event.data?.json()}catch{}
 const presentation=pushPresentation(payload),{title,body,noticeId,reply,test,tag}=presentation;
 const options={body,tag,renotify:false,icon:'/icon-192.png',data:{noticeId,reply,test}};
 // A button that opens the authenticated composer is progressively enhanced.
 // Never advertise a text action: inline reply has no durable safe retry path yet.
 if(reply&&Number(self.Notification?.maxActions)>0)options.actions=[{action:'reply',title:'Reply in GW'}];
 try{await self.registration.showNotification(title,options)}catch(error){
  if(!options.actions)throw error;delete options.actions;await self.registration.showNotification(title,options);
 }
})()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const data=event.notification.data,id=data?.noticeId;
  const url=new URL(validPushId(id)?'/?gwNotice='+encodeURIComponent(id)+(data?.reply&&event.action==='reply'?'&gwReply=1':''):data?.test?'/?gwPushTest=1':'/',self.location.origin).href;
  // Navigation carries only an opaque ID and a composer-focus hint. The app
  // resolves it through authenticated /open; a notification is never a bearer grant.
  // No message send occurs here, even if a browser supplies an unexpected reply.
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const client=clients.find(c=>{try{return new URL(c.url).origin===self.location.origin}catch{return false}});
  if(client){try{const navigated=await client.navigate(url);await (navigated||client).focus();return}catch{/* A closing client can disappear between enumeration and navigation. */}}
  await self.clients.openWindow(url);
 })());
});
