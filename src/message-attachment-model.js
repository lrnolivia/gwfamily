// Private chat files never use the shared /api/media namespace.
export const PRIVATE_ATTACHMENT_MAX_BYTES=10*1024*1024;
export const PRIVATE_ATTACHMENT_MAX_FILES=5;
export const PRIVATE_ATTACHMENT_MAX_TOTAL_BYTES=25*1024*1024;
export const PRIVATE_ATTACHMENT_TYPES=Object.freeze(['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain']);
export const PRIVATE_ATTACHMENT_ACCEPT=PRIVATE_ATTACHMENT_TYPES.join(',');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function privateAttachmentPath(conversationId,id){return `/api/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(id)}`}
export function attachmentName(value){return String(value||'Attachment').replace(/[\x00-\x1f\x7f/\\\u202a-\u202e\u2066-\u2069]/g,'_').slice(0,150)||'Attachment'}
export function normalizePrivateAttachment(value,conversationId){
 if(!value||typeof value!=='object'||!uuid.test(value.id||'')||!PRIVATE_ATTACHMENT_TYPES.includes(value.type)||!Number.isSafeInteger(value.size)||value.size<=0||value.size>PRIVATE_ATTACHMENT_MAX_BYTES)return null;
 const url=privateAttachmentPath(conversationId,value.id);if(value.url!==url)return null;
 return {id:value.id,url,name:attachmentName(value.name),type:value.type,size:value.size};
}
export function privateAttachments(value,conversationId){
 if(!Array.isArray(value)||value.length>PRIVATE_ATTACHMENT_MAX_FILES)return [];
 const result=value.map(file=>normalizePrivateAttachment(file,conversationId));
 if(result.some(file=>!file)||new Set(result.map(file=>file.id)).size!==result.length||result.reduce((sum,file)=>sum+file.size,0)>PRIVATE_ATTACHMENT_MAX_TOTAL_BYTES)return [];
 return result;
}
export function canAddPrivateAttachments(existing,selected){
 if(existing.length+selected.length>PRIVATE_ATTACHMENT_MAX_FILES)throw new Error('Attach up to five files per message.');
 if([...existing,...selected].reduce((sum,file)=>sum+(Number(file.size)||0),0)>PRIVATE_ATTACHMENT_MAX_TOTAL_BYTES)throw new Error('Keep all attachments together under 25 MB.');
 for(const file of selected)if(!PRIVATE_ATTACHMENT_TYPES.includes(file.type)||!Number.isSafeInteger(file.size)||file.size<=0||file.size>PRIVATE_ATTACHMENT_MAX_BYTES)throw new Error('Choose a JPEG, PNG, WebP, GIF, PDF or text file under 10 MB.');
}
export async function validatePrivateFile(file){
 canAddPrivateAttachments([], [file]);
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.byteLength!==file.size)throw new Error('The file changed while it was being read. Choose it again.');
 const head=bytes.subarray(0,16),sig=String.fromCharCode(...head);
 const is=values=>values.every((value,index)=>head[index]===value);
 let valid=false;
 if(file.type==='image/jpeg')valid=is([255,216,255]);
 else if(file.type==='image/png')valid=is([137,80,78,71,13,10,26,10]);
 else if(file.type==='image/gif')valid=sig.startsWith('GIF87a')||sig.startsWith('GIF89a');
 else if(file.type==='image/webp')valid=sig.startsWith('RIFF')&&sig.slice(8,12)==='WEBP';
 else if(file.type==='application/pdf')valid=sig.startsWith('%PDF-');
 else if(file.type==='text/plain'){try{const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);valid=!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)}catch{valid=false}}
 if(!valid)throw new Error('The file contents don’t match its type. Choose another file.');
 return file;
}
export function attachmentSize(value){return value>=1024*1024?`${(value/(1024*1024)).toFixed(1)} MB`:`${Math.max(1,Math.ceil(value/1024))} KB`}
