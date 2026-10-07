import {normalizePrivateAttachment,privateAttachments,validatePrivateFile} from './message-attachment-model.js';
const aborted=()=>Object.assign(new Error('Upload canceled.'),{name:'AbortError'});
// Injected only by synthetic tests. The live route remains same-origin and private.
export async function uploadPrivateAttachment({conversationId,accountId,file,requestId,signal,onProgress=()=>{},xhrFactory=()=>new XMLHttpRequest()}){
 if(signal?.aborted)throw aborted();
 await validatePrivateFile(file);if(signal?.aborted)throw aborted();
 return new Promise((resolve,reject)=>{
  const xhr=xhrFactory();let finished=false,lastProgress=0;
  const end=(error,value)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',cancel);xhr.onload=xhr.onerror=xhr.onabort=xhr.ontimeout=null;if(xhr.upload)xhr.upload.onprogress=null;error?reject(error):resolve(value)};
  const cancel=()=>{xhr.abort();end(aborted())};
  xhr.open('POST',`/api/conversations/${encodeURIComponent(conversationId)}/attachments`);xhr.timeout=45000;
  xhr.upload.onprogress=event=>{if(!finished&&event.lengthComputable&&event.total>0)onProgress(lastProgress=Math.max(lastProgress,Math.min(99,Math.floor(event.loaded/event.total*100))))};
  xhr.onload=()=>{
   let value;try{value=JSON.parse(xhr.responseText)}catch{return end(Object.assign(new Error('The upload response was unreadable. Retry this file safely.'),{status:xhr.status,ambiguous:true}))}
   if(xhr.status<200||xhr.status>=300)return end(Object.assign(new Error(typeof value?.error==='string'?value.error:'The file couldn’t be uploaded. Try again.'),{status:xhr.status}));
   const attachment=normalizePrivateAttachment(value,conversationId);if(!attachment||attachment.size!==file.size||attachment.type!==file.type)return end(new Error('The uploaded file could not be verified. Retry this file.'));
   onProgress(100);end(null,attachment);
  };
  xhr.onerror=()=>end(Object.assign(new Error('The upload connection was interrupted. Retry this file safely.'),{ambiguous:true}));
  xhr.ontimeout=()=>end(Object.assign(new Error('The upload timed out. Retry this file safely.'),{ambiguous:true}));
  xhr.onabort=()=>end(aborted());signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)return cancel();
  const body=new FormData();body.append('file',file);body.append('requestId',requestId);body.append('expectedAccountId',accountId);xhr.send(body);
 });
}
export async function sendPrivateMessage({conversationId,accountId,attempt,signal,fetcher=globalThis.fetch}){
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,20000);
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 try{
  const response=await fetcher(`/api/conversations/${encodeURIComponent(conversationId)}/messages`,{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:attempt.requestId,body:attempt.body,attachments:attempt.files.map(file=>file.id),expectedAccountId:accountId})});
  let value;try{value=await response.json()}catch{throw Object.assign(new Error('Sending could not be confirmed. Retry this message safely.'),{status:response.status,ambiguous:true})}
  if(!response.ok)throw Object.assign(new Error(typeof value?.error==='string'?value.error:'The message couldn’t be sent.'),{status:response.status,safeToEdit:response.status===410&&value?.code==='attachments-unavailable'&&value?.safeToEdit===true});
  const message=value?.message,files=privateAttachments(message?.files,conversationId),expected=attempt.files;
  if(!message||typeof message.id!=='string'||!message.id||message.id.length>100||message.conversationId!==conversationId||message.authorId!==accountId||message.body!==attempt.body.trim()||!Number.isSafeInteger(message.sequence)||message.sequence<1||!Array.isArray(message.files)||files.length!==message.files.length||files.length!==expected.length||files.some((file,index)=>file.id!==expected[index].id||file.type!==expected[index].type||file.size!==expected[index].size))throw Object.assign(new Error('Sending could not be verified. Retry this message safely.'),{ambiguous:true});
  return value;
 }catch(error){if(error.name==='AbortError')throw Object.assign(new Error('Sending was interrupted. Retry to confirm this message safely.'),{ambiguous:true});throw error}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
