export function privateMediaRetryUrl(source,origin){
 try {const url=new URL(source,origin);if(url.origin!==origin||!/^\/api\/media\/[A-Za-z0-9-]+$/.test(url.pathname)||url.searchParams.has('_gw_retry'))return null;url.searchParams.set('_gw_retry','1');return url.href}catch{return null}
}
export function bindPrivateMediaRetry(root=window){
 const timers=new Set(),attempted=new WeakMap();
 const onError=event=>{
  const image=event.target;if(image?.tagName!=='IMG')return;
  const original=image.getAttribute('src')||'',next=privateMediaRetryUrl(original,location.origin);
  if(!next||attempted.get(image)===original)return;attempted.set(image,original);
  const timer=setTimeout(()=>{timers.delete(timer);if(image.isConnected&&image.getAttribute('src')===original)image.setAttribute('src',next)},200);timers.add(timer);
 };
 root.addEventListener('error',onError,true);
 return()=>{root.removeEventListener('error',onError,true);for(const timer of timers)clearTimeout(timer);timers.clear()};
}
