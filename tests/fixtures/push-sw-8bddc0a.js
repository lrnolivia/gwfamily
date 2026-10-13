// Online code is never served from an old application cache. No private data is cached.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('gw-static-')).map(k=>caches.delete(k)));await self.clients.claim()})()));
// Deliberately no fetch handler: browser/Worker revalidation governs every request.

// Only explicitly enrolled devices can receive pushes. No private cache or fetch handler.
function installPushHandlers(scope){
 const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
 scope.addEventListener('push',event=>event.waitUntil((async()=>{
  let data;try{data=event.data?.json()}catch{}
  // Visible generic fallback for malformed events satisfies userVisibleOnly.
  const id=data?.v===1&&validId(data.noticeId)&&Number.isSafeInteger(data.expiresAt)&&data.expiresAt>Date.now()?data.noticeId:null;
  await scope.registration.showNotification('Green & White Family',{body:data?.test===true?'Device notifications are working.':'You have a new update. Open GW to see it.',tag:'gw-activity',renotify:false,icon:'/icon-192.png',data:{noticeId:data?.test===true?null:id}});
 })()));
 scope.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil((async()=>{
   const id=event.notification.data?.noticeId;
   const url=new URL(validId(id)?'/?gwNotice='+encodeURIComponent(id):'/',scope.location.origin).href;
   // Navigation carries only an opaque ID. App must call authenticated /open.
   const clients=await scope.clients.matchAll({type:'window',includeUncontrolled:true});
   const client=clients.find(c=>{try{return new URL(c.url).origin===scope.location.origin}catch{return false}});
   if(client){await client.navigate(url);await client.focus()}else await scope.clients.openWindow(url);
  })());
 });
}

installPushHandlers(self);
