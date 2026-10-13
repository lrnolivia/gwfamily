// Install before React effects: a poll/effect can run after beforeunload while
// WebKit is replacing the document. Such reads must not reach fetch at all.
export function documentReadLifecycle(win=globalThis.window,doc=globalThis.document){
 let leaving=false,hidden=false;
 const subscribers=new Set(),listeners=[];
 const listen=(target,event,handler)=>{target?.addEventListener(event,handler);listeners.push(()=>target?.removeEventListener(event,handler))};
 const pause=()=>{leaving=true;for(const subscriber of subscribers)subscriber.pause()};
 const resume=()=>{if(hidden||doc?.visibilityState==='hidden'||!leaving)return;leaving=false;for(const subscriber of subscribers)subscriber.resume?.()};
 listen(win,'beforeunload',pause);
 listen(win,'pagehide',()=>{hidden=true;pause()});
 listen(win,'pageshow',()=>{hidden=false;resume()});
 // Cancelled navigation has no dedicated event. Fresh user activity resumes
 // the surviving document, but cannot wake a page suspended in the back cache.
 listen(win,'focus',resume);
 listen(doc,'visibilitychange',resume);
 for(const event of ['pointerdown','keydown'])listen(win,event,value=>{if(value.isTrusted)resume()});
 return {canRead:()=>!leaving&&!hidden,subscribe(subscriber){subscribers.add(subscriber);if(leaving||hidden)subscriber.pause();return()=>subscribers.delete(subscriber)},dispose(){for(const remove of listeners)remove();subscribers.clear()}};
}
