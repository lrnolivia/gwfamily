import {UserError,json,readPost,ownedFiles} from './family-service.mjs';
import {can} from './policy.mjs';
const list=result=>result.results||[];
async function photoTarget(db,actor,kind,id,index=0){
 if(!['profile','memory','post','memorial','memorial-photo'].includes(kind)||!Number.isInteger(index)||index<0||index>20)throw new UserError('Photo not found',404);
 let photo,ownerId,name,save=true;
 if(kind==='memorial'||kind==='memorial-photo'){if(index!==0)throw new UserError('Memorial not found',404);const row=await db.prepare('SELECT id,name,created_by,profile_json FROM memorials WHERE id=?').bind(id).first();if(row){photo=kind==='memorial'?'memorial:'+row.id:json(row.profile_json).photo;ownerId=row.created_by;name=row.name+(kind==='memorial'?' tributes':' memorial portrait');save=kind!=='memorial';}}
 else if(kind==='profile'){const row=await db.prepare("SELECT u.id,u.name,u.image,p.contact_json FROM user u JOIN members m ON m.id=u.id LEFT JOIN profiles p ON p.member_id=u.id WHERE u.id=? AND m.status='active' AND m.removed_at IS NULL").bind(id).first();if(row){photo=row.image;ownerId=row.id;name=row.name+' profile photo';save=json(row.contact_json).allowPhotoSave!==false;}}
 else if(kind==='memory'){const row=await db.prepare('SELECT * FROM memories WHERE id=? AND deleted_at IS NULL').bind(id).first();if(row){const data=json(row.data_json);photo=data.image;ownerId=row.author_id;name=data.title||'Family memory';}}
 else {const row=await readPost(db,actor,id);if(row){const data=json(row.metadata_json),photos=[...(data.image?[{url:data.image,name:'Family photo'}]:[]),...(data.files||[]).filter(file=>/^image\//.test(file.type||'')),...(data.backgroundMedia&&/^image\//.test(data.backgroundMedia.type||'')?[data.backgroundMedia]:[])];photo=photos[index]?.url;ownerId=row.author_id;name=photos[index]?.name||'Family photo';}}
 if(typeof photo!=='string'||!photo||!ownerId)throw new UserError('Photo not found',404);
 const mediaId=/^\/api\/media\/([A-Za-z0-9_-]+)$/.exec(photo)?.[1];
 if(mediaId){const media=await db.prepare('SELECT mime_type FROM media WHERE id=? AND deleted_at IS NULL').bind(mediaId).first();if(!media||!/^image\/(jpeg|png|gif|webp)$/.test(media.mime_type))throw new UserError('Photo not found',404);}
 const bytes=new TextEncoder().encode(JSON.stringify([kind,id,photo])),digest=await crypto.subtle.digest('SHA-256',bytes),key=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 return {kind,id,index,photo,ownerId,name,canSave:kind==='memorial'?false:save||actor.id===ownerId,key,mediaId};
}
export function registerPhotoDiscussions(app){
 const target=c=>photoTarget(c.env.DB,c.get('actor'),c.req.param('kind'),c.req.param('id'),Number(c.req.query('index')||0));
 app.get('/api/photo-discussions/:kind/:id',async c=>{
  const t=await target(c),db=c.env.DB,limit=100,before=c.req.query('before');let cursor=null;
  if(before){try{cursor=JSON.parse(atob(before));if(!Array.isArray(cursor)||!Number.isSafeInteger(cursor[0])||typeof cursor[1]!=='string'||cursor[1].length>100)throw 0}catch{throw new UserError('Invalid comment page',400)}}
  const rows=list(await db.prepare('SELECT * FROM photo_comments WHERE thread_key=? AND deleted_at IS NULL'+(cursor?' AND (created_at<? OR (created_at=? AND id<?))':'')+' ORDER BY created_at DESC,id DESC LIMIT ?').bind(t.key,...(cursor?[cursor[0],cursor[0],cursor[1]]:[]),limit+1).all()),more=rows.length>limit,selected=rows.slice(0,limit),last=selected.at(-1),reactions=list(await db.prepare('SELECT member_id,emoji,comment_id FROM photo_reactions WHERE thread_key=?').bind(t.key).all());
  return c.json({photo:{kind:t.kind,id:t.id,index:t.index,url:t.photo,ownerId:t.ownerId,name:t.name,canSave:t.canSave},threadId:'photo:'+t.key,comments:selected.reverse().map(row=>({id:row.id,authorId:row.author_id,parentId:row.parent_id,text:row.body,files:json(row.files_json,[]),createdAt:row.created_at})),reactions,next:more?btoa(JSON.stringify([last.created_at,last.id])):null});
 });
 app.get('/api/photo-discussions/:kind/:id/download',async c=>{const t=await target(c);if(c.req.query('photo')&&c.req.query('photo')!==t.photo)throw new UserError('This photo changed. Refresh before saving.',409);if(t.kind==='memorial')throw new UserError('Tributes do not have a downloadable photo',403);if(!t.canSave)throw new UserError('This person has turned off photo saving',403);if(!t.mediaId)throw new UserError('This photo cannot be downloaded here yet',409);const row=await c.env.DB.prepare('SELECT * FROM media WHERE id=? AND deleted_at IS NULL').bind(t.mediaId).first(),object=row&&await c.env.R2?.get(row.object_key);if(!object)throw new UserError('Photo not found',404);return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(row.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});});
}

export async function photoCommentsReferenceMedia(db,actor,mediaId){
 const rows=list(await db.prepare("SELECT DISTINCT pc.thread_key,pc.target_kind,pc.target_id,pc.photo_index FROM photo_comments pc,json_each(pc.files_json) f WHERE pc.deleted_at IS NULL AND json_extract(f.value,'$.id')=? LIMIT 100").bind(mediaId).all());
 for(const row of rows){try{const target=await photoTarget(db,actor,row.target_kind,row.target_id,row.photo_index);if(target.key===row.thread_key)return true;}catch(error){if(error.status!==404)throw error;}}
 return false;
}

// Use the existing command receipt and draft-recovery pipeline for writes.
export async function photoCommandStatements(db,actor,input){
 const spec=input.photoTarget;if(!spec||typeof spec.id!=='string'||spec.id.length>100)throw new UserError('Photo not found',404);
 const t=await photoTarget(db,actor,spec.kind,spec.id,spec.index??0);if(spec.photo!==t.photo)throw new UserError('This photo changed. Refresh before posting.',409);
 const sql=[],result={ok:true};
 if(input.type==='ADD_COMMENT'){
  if(!can(actor,'comment'))throw new UserError('You do not have permission to comment',403);
  if(typeof input.text!=='string'||input.text.length>1500)throw new UserError('Keep comments under 1,500 characters');const text=input.text.trim(),files=await ownedFiles(db,actor,input.files||[]);if(!text&&!files.length)throw new UserError('Write a comment or add an attachment');
  if(input.parentId&&!await db.prepare('SELECT id FROM photo_comments WHERE id=? AND thread_key=? AND deleted_at IS NULL').bind(input.parentId,t.key).first())throw new UserError('Reply not found',404);
  result.id=crypto.randomUUID();sql.push(db.prepare('INSERT INTO photo_comments(id,thread_key,target_kind,target_id,photo_index,author_id,parent_id,body,files_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(result.id,t.key,t.kind,t.id,t.index,actor.id,input.parentId||null,text,JSON.stringify(files),Date.now()));
 }else if(['EDIT_COMMENT','DELETE_COMMENT'].includes(input.type)){
  const item=await db.prepare('SELECT * FROM photo_comments WHERE id=? AND thread_key=? AND deleted_at IS NULL').bind(input.id||'',t.key).first();
  if(!item)throw new UserError('Comment not found',404);
  if(!can(actor,'manage_content',{authorId:item.author_id}))throw new UserError('You do not have permission to change this comment',403);
  if(typeof input.expectedText!=='string'||input.expectedText!==item.body)throw new UserError('This comment changed while you were editing. Reopen it before trying again.',409);
  const deleting=input.type==='DELETE_COMMENT';if(!deleting&&(typeof input.text!=='string'||input.text.length>1500||!input.text.trim()&&!json(item.files_json,[]).length))throw new UserError('Write a comment or keep an attachment');
  const guard=crypto.randomUUID();sql.push(db.prepare('INSERT INTO notification_setting_guards(token,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM photo_comments WHERE id=? AND thread_key=? AND deleted_at IS NULL AND body=?) THEN 1 ELSE 0 END').bind(guard,item.id,t.key,input.expectedText));
  sql.push(deleting?db.prepare('UPDATE photo_comments SET deleted_at=? WHERE id=?').bind(Date.now(),item.id):db.prepare('UPDATE photo_comments SET body=? WHERE id=?').bind(input.text.trim(),item.id));
  sql.push(db.prepare('DELETE FROM notification_setting_guards WHERE token=?').bind(guard));
  sql.push(db.prepare('INSERT INTO audit_log(id,actor_id,action,subject_id) VALUES(?,?,?,?)').bind(crypto.randomUUID(),actor.id,input.type.toLowerCase().replace('_','-'),item.id));
 }else if(input.type==='REPORT'){
  if(!await db.prepare('SELECT id FROM photo_comments WHERE id=? AND thread_key=? AND deleted_at IS NULL').bind(input.targetId||'',t.key).first())throw new UserError('Comment not found',404);
  if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)throw new UserError('Tell the moderators what needs attention');
  result.id=crypto.randomUUID();sql.push(db.prepare('INSERT INTO moderation_reports(id,reporter_id,target_id,reason) VALUES(?,?,?,?)').bind(result.id,actor.id,input.targetId,input.reason.trim()));
 }else if(input.type==='TOGGLE_REACTION'){
  if(typeof input.emoji!=='string'||input.emoji.length>32||!(/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(input.emoji))||typeof input.photoSelected!=='boolean')throw new UserError('Choose a reaction');
  const commentId=input.targetId==='photo:'+t.key?'':input.targetId;if(typeof commentId!=='string'||commentId.length>100)throw new UserError('Comment not found',404);
  if(commentId&&!await db.prepare('SELECT id FROM photo_comments WHERE id=? AND thread_key=? AND deleted_at IS NULL').bind(commentId,t.key).first())throw new UserError('Comment not found',404);
  sql.push(input.photoSelected?db.prepare('INSERT OR IGNORE INTO photo_reactions(thread_key,comment_id,member_id,emoji) VALUES(?,?,?,?)').bind(t.key,commentId,actor.id,input.emoji):db.prepare('DELETE FROM photo_reactions WHERE thread_key=? AND comment_id=? AND member_id=? AND emoji=?').bind(t.key,commentId,actor.id,input.emoji));
 }else throw new UserError('Photo action not supported',400);
 return {sql,result};
}
