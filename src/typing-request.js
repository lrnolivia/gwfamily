// A typing read belongs to its page/channel lifecycle as well as its timeout.
// Writes can retain keepalive for the final, best-effort typing=false receipt.
export async function typingRequest(path,options={},request,{timeoutMs=5000}={}){
 const controller=new AbortController(),abort=()=>controller.abort();
 options.signal?.addEventListener('abort',abort,{once:true});
 if(options.signal?.aborted)abort();
 const timer=setTimeout(abort,timeoutMs);
 try{return await request(path,{...options,signal:controller.signal})}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort)}
}
