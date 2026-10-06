// Online code is never served from an old application cache. No private data is cached.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('gw-static-')).map(k=>caches.delete(k)));await self.clients.claim()})()));
// Deliberately no fetch handler: browser/Worker revalidation governs every request.
