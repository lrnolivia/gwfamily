// Explicitly owned namespaces only: another application on this origin keeps
// its storage. No indexed database is currently created by GW.
const exactKeys=new Set(['gw-member-view:v1','gw-family-calendar-preview:v1','gw-platform','gw-theme','gw-font','gw-personal-themes','gw-text-step','gw-interface-accent:v1','gw-preview-notice:v1','gw-active-mode','gw-review-mode','gw-device-account:v1','gw-device-provider:v1','gw-pending-family-invitation:v1','gwfamily:preview:v2','gwfamily:preview-messages:v1','gw-shared-pages-preview:v1']);
const prefixes=['gw-personal-themes:v2:','gw-options-tip-v1:','gw-push-prompt:v1:','gwfamily:live-drafts:v1:','gwfamily:live-requests:v1:','gwfamily:chat-draft:v1:','gw-help:v','gw-contextual-tour:v','gw-shared-page-drafts:v1:','gw-image-edit:'];
export const ownsGWStorageKey=key=>typeof key==='string'&&(exactKeys.has(key)||prefixes.some(prefix=>key.startsWith(prefix)));
export function clearGWStorage(storage){const keys=[];if(!storage)return keys;for(let i=0;i<storage.length;i++){const key=storage.key(i);if(ownsGWStorageKey(key))keys.push(key)}for(const key of keys)storage.removeItem(key);return keys}
export async function resetGWDevice({signOut,localStorage,sessionStorage,caches,serviceWorker,origin,basePath='/'}){
 // A failed server sign-out leaves all local state intact for an honest retry.
 if(await signOut()!==true)throw Error('You could not be signed out. Nothing on this device was reset. Try again.');
 const cleared={local:clearGWStorage(localStorage),session:clearGWStorage(sessionStorage),caches:[],workers:0};
 if(caches)for(const key of await caches.keys())if(key.startsWith('gw-static-')){await caches.delete(key);cleared.caches.push(key)}
 if(serviceWorker){const expectedScope=new URL(basePath,origin).href,script=new URL('sw.js',expectedScope).href;for(const registration of await serviceWorker.getRegistrations()){const worker=registration.active||registration.waiting||registration.installing;if(registration.scope===expectedScope&&worker?.scriptURL===script){await registration.unregister();cleared.workers++}}}
 return cleared;
}
