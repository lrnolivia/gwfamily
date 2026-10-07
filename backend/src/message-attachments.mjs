// Private message objects never enter the family-shared media table or route.
export const MAX_ATTACHMENT_BYTES=10*1024*1024,MAX_MESSAGE_ATTACHMENT_BYTES=25*1024*1024,MAX_MESSAGE_ATTACHMENTS=5,ATTACHMENT_TTL_MS=24*60*60*1000;
const types=new Set(['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain']);
const extensions={'image/jpeg':['.jpg','.jpeg'],'image/png':['.png'],'image/webp':['.webp'],'image/gif':['.gif'],'application/pdf':['.pdf'],'text/plain':['.txt']};
export class AttachmentError extends Error{constructor(message,status=400){super(message);this.status=status}}
const invalid=()=>{throw new AttachmentError('The file contents do not match its type')};
const ascii=(bytes,start,end)=>String.fromCharCode(...bytes.subarray(start,end));
const u32be=(b,p)=>((b[p]*0x1000000)+(b[p+1]<<16)+(b[p+2]<<8)+b[p+3])>>>0;
const u32le=(b,p)=>((b[p+3]*0x1000000)+(b[p+2]<<16)+(b[p+1]<<8)+b[p])>>>0;
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0});
function crc32(bytes,start,end){let crc=0xffffffff;for(let i=start;i<end;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
function png(b){
 if(b.length<45||ascii(b,0,8)!=='\x89PNG\r\n\x1a\n')invalid();let at=8,first=true,image=false;
 while(at<b.length){if(at+12>b.length)invalid();const size=u32be(b,at),kind=ascii(b,at+4,at+8),end=at+12+size;if(end>b.length||!/^[A-Za-z]{4}$/.test(kind)||u32be(b,end-4)!==crc32(b,at+4,end-4))invalid();
  if(first){if(kind!=='IHDR'||size!==13||!u32be(b,at+8)||!u32be(b,at+12))invalid();first=false}else if(kind==='IHDR')invalid();
  if(kind==='IDAT'&&size)image=true;if(kind==='IEND'){if(size||!image||end!==b.length)invalid();return}at=end;
 }invalid();
}
function jpeg(b){
 if(b.length<6||b[0]!==255||b[1]!==216)invalid();let p=2,scan=false,frame=false;
 while(p<b.length){if(b[p++]!==255)invalid();while(b[p]===255)p++;const marker=b[p++];if(marker===217){if(p!==b.length||!scan||!frame)invalid();return}if(marker===0||marker===216||marker===undefined)invalid();if(marker===1||marker>=208&&marker<=215)continue;
  if(p+2>b.length)invalid();const n=(b[p]<<8)+b[p+1];if(n<2||p+n>b.length)invalid();if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(n<8)invalid();frame=true}p+=n;
  if(marker===218){scan=true;let stopped=false;while(p<b.length){if(b[p++]!==255)continue;while(b[p]===255)p++;if(b[p]===0||b[p]>=208&&b[p]<=215){p++;continue}p--;stopped=true;break}if(!stopped)invalid()}
 }invalid();
}
function webp(b){
 if(b.length<20||ascii(b,0,4)!=='RIFF'||ascii(b,8,12)!=='WEBP'||u32le(b,4)+8!==b.length)invalid();let p=12,image=false;
 while(p<b.length){if(p+8>b.length)invalid();const kind=ascii(b,p,p+4),size=u32le(b,p+4),end=p+8+size;if(end+(size%2)>b.length)invalid();if(kind==='VP8 '){if(size<10||b[p+11]!==157||b[p+12]!==1||b[p+13]!==42)invalid();image=true}else if(kind==='VP8L'){if(size<5||b[p+8]!==47)invalid();image=true}else if(kind==='ANMF'){if(size<16)invalid();image=true}p=end+(size%2);
 }if(!image||p!==b.length)invalid();
}
function gif(b){
 if(b.length<14||!['GIF87a','GIF89a'].includes(ascii(b,0,6))||!(b[6]|b[7])||!(b[8]|b[9]))invalid();let p=13,image=false;if(b[10]&128)p+=3*(1<<((b[10]&7)+1));
 const blocks=()=>{while(p<b.length){const size=b[p++];if(!size)return;p+=size;if(p>b.length)invalid()}invalid()};
 while(p<b.length){const kind=b[p++];if(kind===59){if(p!==b.length||!image)invalid();return}if(kind===33){if(p>=b.length)invalid();p++;blocks()}else if(kind===44){if(p+9>b.length)invalid();const packed=b[p+8];p+=9;if(packed&128)p+=3*(1<<((packed&7)+1));if(p>=b.length||b[p]<2||b[p]>8)invalid();p++;blocks();image=true}else invalid()}
 invalid();
}
export async function validateAttachmentBytes(file){
 if(!file||typeof file.arrayBuffer!=='function'||!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_ATTACHMENT_BYTES)throw new AttachmentError('Choose a nonempty file up to 10 MiB',413);
 if(!types.has(file.type))throw new AttachmentError('Use a JPEG, PNG, WebP, GIF, PDF, or UTF-8 text file');
 // Read the entire bounded file and compare its declared size, never just a header.
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.byteLength!==file.size||bytes.byteLength>MAX_ATTACHMENT_BYTES)invalid();
 if(file.type==='image/png')png(bytes);else if(file.type==='image/jpeg')jpeg(bytes);else if(file.type==='image/webp')webp(bytes);else if(file.type==='image/gif')gif(bytes);else if(file.type==='application/pdf'){
  if(!/^%PDF-[12]\.\d(?:[\r\n\t ])/u.test(ascii(bytes,0,Math.min(12,bytes.length)))||!/(?:^|[\r\n])%%EOF[\r\n\t ]*$/.test(ascii(bytes,Math.max(0,bytes.length-1024),bytes.length)))invalid();
 }else{try{const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))invalid()}catch{invalid()}}
 let name=String(file.name||'Attachment').replace(/[\x00-\x1f\x7f/\\<>:"|?*\u202a-\u202e\u2066-\u2069]/g,'_').trim().replace(/[. ]+$/,'')||'Attachment';
 const aliases=extensions[file.type],suffix=aliases.find(extension=>name.toLowerCase().endsWith(extension));
 // Even valid UTF-8 text cannot be saved as an HTML/script/executable filename.
 // Keep a safe existing MIME alias, otherwise append the canonical extension.
 const extension=suffix?name.slice(-suffix.length):aliases[0],stem=suffix?name.slice(0,-suffix.length):name;
 name=(stem.slice(0,150-extension.length)+extension).replace(/[\ud800-\udfff]/gu,'_');
 return {bytes,name,type:file.type,size:bytes.byteLength};
}
export function normalizeAttachmentIds(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>MAX_MESSAGE_ATTACHMENTS||value.some(id=>typeof id!=='string'||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(id))||new Set(value).size!==value.length)throw new AttachmentError('Choose up to five private message attachments');
 return value;
}
export async function attachmentHash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('')}
export const serializeAttachment=row=>({id:row.id,url:`/api/conversations/${encodeURIComponent(row.conversation_id)}/attachments/${encodeURIComponent(row.id)}`,name:row.name,type:row.mime_type,size:row.size_bytes});
// Bind order is JSON ids, conversation id, owner id, timestamp, optional retry message id.
export function attachmentGuardSql(ids,conversationId,ownerId,now,messageId=null){
 if(!ids.length)return {sql:'1',values:[]};
 return {sql:`(SELECT count(*) FROM conversation_attachments refs WHERE refs.id IN (SELECT value FROM json_each(?)) AND refs.conversation_id=? AND refs.owner_id=? AND refs.state='ready' AND ((refs.message_id IS NULL AND refs.expires_at>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)))${messageId?' OR refs.message_id=?':''}))=${ids.length} AND (SELECT COALESCE(SUM(size_bytes),0) FROM conversation_attachments WHERE id IN (SELECT value FROM json_each(?)))<=${MAX_MESSAGE_ATTACHMENT_BYTES}`,values:[JSON.stringify(ids),conversationId,ownerId,now,...(messageId?[messageId]:[]),JSON.stringify(ids)]};
}
export async function loadMessageAttachments(db,actorId,messages,accessFor){
 const byId=new Map();if(!messages.length)return byId;
 const selected=JSON.stringify(messages.map(row=>row.id));
 const found=(await db.prepare(`SELECT a.* FROM conversation_attachments a JOIN messages ms ON ms.id=a.message_id AND ms.conversation_id=a.conversation_id AND ms.author_id=a.owner_id WHERE a.message_id IN (SELECT value FROM json_each(?)) AND a.state='ready' AND ${accessFor('a.conversation_id')} ORDER BY a.message_id,a.message_ordinal,a.id`).bind(selected,actorId).all()).results||[];
 for(const row of found){const items=byId.get(row.message_id)||[];items.push(serializeAttachment(row));byId.set(row.message_id,items)}return byId;
}
// Only expired or explicitly cancelled unbound objects are erased. Metadata
// tombstones survive cleanup so retries cannot recreate private cancelled files.
const privateObjectKey=key=>/^message-attachments\/[a-f0-9-]{36}$/i.test(key);
export async function cleanupMessageAttachments(env,{now=Date.now(),limit=100}={}){
 const db=env.DB,bucket=env.R2;if(!db||!bucket)return {skipped:true};
 limit=Math.max(1,Math.min(100,Number.isSafeInteger(limit)?limit:100));
 const token=crypto.randomUUID(),lease=await db.prepare('UPDATE conversation_attachment_cleanup SET lease_token=?,lease_until=? WHERE id=1 AND lease_until<=? RETURNING cursor').bind(token,now+10*60*1000,now).first();
 if(!lease)return {skipped:true};
 let deleted=0,orphans=0;
 try{
  const rows=(await db.prepare("SELECT id FROM conversation_attachments WHERE message_id IS NULL AND (state='cancelled' OR expires_at<=?) AND (cleanup_after IS NULL OR cleanup_after<=?) ORDER BY COALESCE(cleanup_after,0),expires_at,id LIMIT ?").bind(now,now,limit).all()).results||[];
  for(const item of rows){
   // A message send racing this UPDATE either binds the file first (and keeps
   // it), or sees cancelled state and rolls its whole association batch back.
   const row=await db.prepare("UPDATE conversation_attachments SET state='cancelled' WHERE id=? AND message_id IS NULL AND (state='cancelled' OR expires_at<=?) RETURNING object_key").bind(item.id,now).first();
   if(!row||!privateObjectKey(row.object_key))continue;
   await bucket.delete(row.object_key);deleted++;
   await db.prepare("UPDATE conversation_attachments SET cleanup_after=? WHERE id=? AND message_id IS NULL AND state='cancelled'").bind(now+60*60*1000,item.id).run();
  }
  // A bounded cursor sweep also catches old objects whose metadata was lost.
  // It never uses the family media namespace, and never deletes a bound row.
  if(typeof bucket.list==='function'){
   const page=await bucket.list({prefix:'message-attachments/',limit,...(lease.cursor?{cursor:lease.cursor}:{})});
   const candidates=(page.objects||[]).filter(object=>privateObjectKey(object.key)&&Number.isFinite(new Date(object.uploaded).getTime())&&new Date(object.uploaded).getTime()<=now-ATTACHMENT_TTL_MS);
   for(const object of candidates){
    const row=await db.prepare('SELECT id FROM conversation_attachments WHERE object_key=?').bind(object.key).first();
    if(!row){await bucket.delete(object.key);orphans++}
   }
   const cursor=page.truncated&&typeof page.cursor==='string'?page.cursor:null;
   await db.prepare('UPDATE conversation_attachment_cleanup SET cursor=? WHERE id=1 AND lease_token=?').bind(cursor,token).run();
  }
  return {deleted,orphans};
 }finally{await db.prepare('UPDATE conversation_attachment_cleanup SET lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=?').bind(token).run()}
}
export function registerMessageAttachments(app,{UserError,accessSql,accessFor,conversation,rate,requestId}){
 const unavailable=()=>new UserError('Attachment not found',404);
 const account=(c,actor)=>{if((c.req.header('X-Expected-Account-ID')||c.req.query('account'))!==actor.id)throw new UserError('The signed-in account changed. Reload before accessing attachments.',409)};
 const session=c=>c.get('validateMessageSession')?.();
 const cleanupRejected=async(db,bucket,row)=>{
  const cancelled=await db.prepare("UPDATE conversation_attachments SET state='cancelled',cleanup_after=NULL WHERE id=? AND message_id IS NULL RETURNING object_key").bind(row.id).first();
  if(cancelled)await bucket.delete(cancelled.object_key);
 };
 const authorizedRow=async(db,actor,id,attachmentId)=>db.prepare(`SELECT a.* FROM conversation_attachments a WHERE a.id=? AND a.conversation_id=? AND a.state='ready' AND ${accessFor('a.conversation_id')} AND ((a.message_id IS NULL AND a.owner_id=? AND a.expires_at>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))) OR EXISTS(SELECT 1 FROM messages ms WHERE ms.id=a.message_id AND ms.conversation_id=a.conversation_id AND ms.author_id=a.owner_id))`).bind(attachmentId,id,actor.id,actor.id,Date.now()).first();
 app.post('/api/conversations/:id/attachments',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id'),bucket=c.env.R2;await conversation(db,actor,id);if(!bucket)throw new UserError('Private attachment storage is not configured',503);
  let form;try{form=await c.req.formData()}catch(error){if(error?.name==='BodyLimitError')throw error;throw new UserError('Use a multipart attachment upload')}
  if([...form.keys()].some(key=>!['file','requestId','expectedAccountId'].includes(key))||['file','requestId','expectedAccountId'].some(key=>form.getAll(key).length!==1))throw new UserError('Use one file and a valid attachment request');
  if(form.get('expectedAccountId')!==actor.id)throw new UserError('The signed-in account changed. Reload before uploading.',409);
  const key=requestId(form.get('requestId'));let file;try{file=await validateAttachmentBytes(form.get('file'))}catch(error){if(error instanceof AttachmentError)throw new UserError(error.message,error.status);throw error}
  await session(c);
  const sha=await attachmentHash(file.bytes),hash=await attachmentHash(new TextEncoder().encode(JSON.stringify({conversationId:id,name:file.name,type:file.type,size:file.size,sha}))),now=Date.now();
  if(await db.prepare('SELECT 1 FROM conversation_attachment_cancellations WHERE owner_id=? AND request_id=?').bind(actor.id,key).first())throw new UserError('This attachment upload was cancelled. Choose the file again.',410);
  const prior=()=>db.prepare('SELECT * FROM conversation_attachments WHERE owner_id=? AND request_id=?').bind(actor.id,key).first();let row=await prior();
  if(row&&row.fingerprint!==hash)throw new UserError('This requestId was already used for different attachment content',409);
  if(row&&(row.state==='cancelled'||!row.message_id&&row.expires_at<=now))throw new UserError('This attachment upload expired or was cancelled. Upload it again with a new requestId.',410);
  if(!row){
   await rate(db,actor.id,'attachment',30,3600);const aid=crypto.randomUUID(),objectKey=`message-attachments/${aid}`;
   await db.prepare(`INSERT OR IGNORE INTO conversation_attachments(id,conversation_id,owner_id,request_id,fingerprint,object_key,name,mime_type,size_bytes,content_sha256,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${accessSql} AND NOT EXISTS(SELECT 1 FROM conversation_attachment_cancellations WHERE owner_id=? AND request_id=?)`).bind(aid,id,actor.id,key,hash,objectKey,file.name,file.type,file.size,sha,now,now+ATTACHMENT_TTL_MS,id,actor.id,actor.id,key).run();row=await prior();
   if(!row)throw unavailable();if(row.fingerprint!==hash)throw new UserError('This requestId was already used for different attachment content',409);
  }
  if(row.state!=='ready'){
   // Identical concurrent attempts may write the same immutable bytes. A failed put
   // leaves the stage retryable; never delete another attempt's successful object.
   await session(c);
   await bucket.put(row.object_key,file.bytes,{httpMetadata:{contentType:file.type}});
   await db.prepare(`UPDATE conversation_attachments SET state='ready' WHERE id=? AND state='staged' AND message_id IS NULL AND expires_at>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) AND ${accessSql}`).bind(row.id,Date.now(),id,actor.id).run();
  }
  let ready;try{await session(c);ready=await authorizedRow(db,actor,id,row.id)}catch(error){await cleanupRejected(db,bucket,row);throw error}
  if(!ready){await cleanupRejected(db,bucket,row);throw unavailable()}return c.json({...serializeAttachment(ready),expiresAt:ready.expires_at},row.state==='ready'?200:201);
 });
 app.delete('/api/conversations/:id/attachment-requests/:requestId',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id'),key=requestId(c.req.param('requestId'));account(c,actor);await session(c);await conversation(db,actor,id);await rate(db,actor.id,'attachment-cancel',60,3600);
  await db.batch([
   db.prepare(`INSERT OR IGNORE INTO conversation_attachment_cancellations(owner_id,request_id,conversation_id,created_at) SELECT ?,?,?,? WHERE ${accessSql} AND NOT EXISTS(SELECT 1 FROM conversation_attachments WHERE owner_id=? AND request_id=? AND message_id IS NOT NULL)`).bind(actor.id,key,id,Date.now(),id,actor.id,actor.id,key),
   db.prepare(`UPDATE conversation_attachments SET state='cancelled',cleanup_after=NULL WHERE owner_id=? AND request_id=? AND conversation_id=? AND message_id IS NULL AND ${accessSql}`).bind(actor.id,key,id,id,actor.id)
  ]);
  const row=await db.prepare("SELECT object_key FROM conversation_attachments WHERE owner_id=? AND request_id=? AND conversation_id=? AND message_id IS NULL AND state='cancelled'").bind(actor.id,key,id).first();
  if(row&&c.env.R2)await c.env.R2.delete(row.object_key);return c.json({cancelled:true});
 });
 app.delete('/api/conversations/:id/attachments/:attachmentId',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id');account(c,actor);await session(c);await conversation(db,actor,id);
  const row=await db.prepare(`UPDATE conversation_attachments SET state='cancelled',cleanup_after=NULL WHERE id=? AND conversation_id=? AND owner_id=? AND message_id IS NULL AND state IN ('staged','ready') AND ${accessSql} RETURNING object_key`).bind(c.req.param('attachmentId'),id,actor.id,id,actor.id).first();
  if(!row)throw unavailable();if(c.env.R2)await c.env.R2.delete(row.object_key);return c.json({cancelled:true});
 });
 app.get('/api/conversations/:id/attachments/:attachmentId',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id');account(c,actor);await session(c);let row=await authorizedRow(db,actor,id,c.req.param('attachmentId'));if(!row)throw unavailable();if(!c.env.R2)throw new UserError('Private attachment storage is not configured',503);
  const object=await c.env.R2.get(row.object_key);if(!object||object.size!==undefined&&object.size!==row.size_bytes)throw unavailable();
  // A bucket read can await. Recheck revocation before returning any bytes.
  await session(c);row=await authorizedRow(db,actor,id,row.id);if(!row)throw unavailable();
  const filename=encodeURIComponent(row.name).replace(/['()*]/g,value=>'%'+value.charCodeAt(0).toString(16).toUpperCase());
  return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Length':String(row.size_bytes),'Content-Disposition':`attachment; filename*=UTF-8''${filename}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'}});
 });
}
