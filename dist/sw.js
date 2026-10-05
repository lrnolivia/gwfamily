const VERSION='gw-static-20261005-01';
const SHELL=['/','/index.html','/react-app.js','/react-app.css','/app-icon.svg','/manifest.webmanifest','/tree-artwork.png','/photos/garden.jpg','/photos/generations.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gw-static-')&&k!==VERSION).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/__review/')||url.search||!SHELL.includes(url.pathname))return;
 event.respondWith(fetch(request).then(response=>{if(response.ok&&response.type==='basic'){const copy=response.clone();event.waitUntil(caches.open(VERSION).then(cache=>cache.put(request,copy)))}return response}).catch(()=>caches.match(request).then(cached=>cached||new Response('Offline. Reconnect to open this file.',{status:503}))));
});
