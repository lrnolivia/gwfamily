import {UserError,json,readPost,visiblePostSql} from './family-service.mjs';
import {can} from './policy.mjs';
// History paging, search, recoverable removal and the moderator report queue.
// Every read rechecks visibility against the current actor; ids travel as one
// JSON parameter so D1's bound-parameter limit never caps a page.
export const FIRST_POSTS=100,FIRST_MEMORIES=200,POST_PAGE=50,MEMORY_PAGE=60,COMMENT_CAP=200,COMMENT_PAGE=100,RESTORE_DAYS=30;
const list=r=>r.results||[];
const stamp=v=>/Z$|[+-]\d\d:\d\d$/.test(v)?Date.parse(v):Date.parse(v.replace(' ','T')+'Z');
const b64=value=>btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const encodeCursor=row=>row?b64(JSON.stringify([row.created_at,row.id])):null;
export function decodeCursor(value){
 if(value==null||value==='')return null;
 if(typeof value!=='string'||value.length>300)throw new UserError('Check the page position');
 try{const [at,id]=JSON.parse(atob(value.replace(/-/g,'+').replace(/_/g,'/')));if(typeof at!=='string'||!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d/.test(at)||at.length>40||typeof id!=='string'||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(id))throw 0;return {at,id}}
 catch{throw new UserError('Check the page position')}
}
// Newest first; `before` excludes the cursor row, `through` includes it.
function keyset(alias,{before,through}){
 const clauses=[],args=[];
 if(before){clauses.push(`(${alias}.created_at<? OR (${alias}.created_at=? AND ${alias}.id<?))`);args.push(before.at,before.at,before.id)}
 if(through){clauses.push(`(${alias}.created_at>? OR (${alias}.created_at=? AND ${alias}.id>=?))`);args.push(through.at,through.at,through.id)}
 return {sql:clauses.map(c=>' AND '+c).join(''),args};
}
// In a `through` reload the range is closed, so one extra probe says whether older rows remain.
async function olderExists(db,sql,args,last,alias){if(!last)return false;const k=keyset(alias,{before:{at:last.created_at,id:last.id}});return Boolean(await db.prepare(sql.replace('%KEYSET%',k.sql)).bind(...args,...k.args).first())}
const pageSize=(value,fallback,max)=>{const n=Number(value);return Number.isInteger(n)&&n>0?Math.min(n,max):fallback};
const commentView=c=>({id:c.id,parentId:c.parent_id,authorId:c.author_id,text:c.body,files:json(c.files_json,[]),createdAt:stamp(c.created_at)});
export const memoryView=m=>({...json(m.data_json),id:m.id,authorId:m.author_id,createdAt:stamp(m.created_at)});

// Posts plus their latest comments, reactions and poll tallies for one actor.
export async function postBundle(db,actor,rows){
 const ids=JSON.stringify(rows.map(p=>p.id));
 const comments=rows.length?list(await db.prepare(`SELECT * FROM (SELECT c.*,ROW_NUMBER() OVER (PARTITION BY c.post_id ORDER BY c.created_at DESC,c.id DESC) AS rn,COUNT(*) OVER (PARTITION BY c.post_id) AS total FROM comments c WHERE c.deleted_at IS NULL AND c.post_id IN (SELECT value FROM json_each(?))) WHERE rn<=? ORDER BY created_at,id`).bind(ids,COMMENT_CAP).all()):[];
 const commentIds=JSON.stringify(comments.map(c=>c.id));
 const reactions=rows.length?list(await db.prepare('SELECT r.* FROM reactions r WHERE r.post_id IN (SELECT value FROM json_each(?)) OR r.comment_id IN (SELECT value FROM json_each(?))').bind(ids,commentIds).all()):[];
 const votes=rows.length?list(await db.prepare('SELECT v.* FROM poll_votes v WHERE v.post_id IN (SELECT value FROM json_each(?))').bind(ids).all()):[];
 const out={posts:[],comments:{},commentHistory:{},reactions:{},reactionCounts:{},reactionMembers:{},pollSelections:{}};
 for(const p of rows){
  const meta=json(p.metadata_json),poll=meta.poll?{...meta.poll,votes:{}}:null;
  if(poll)for(const v of votes)if(v.post_id===p.id&&v.member_id!==actor.id)for(const i of json(v.options_json,[]))poll.votes[i]=(poll.votes[i]||0)+1;
  out.posts.push({...meta,id:p.id,authorId:p.author_id,groupId:p.group_id,text:p.body,createdAt:stamp(p.created_at),poll});
  const own=comments.filter(c=>c.post_id===p.id);out.comments[p.id]=own.map(commentView);
  const total=own[0]?.total||0;if(total>own.length)out.commentHistory[p.id]={total,cursor:encodeCursor(own[0])};
 }
 for(const v of votes)if(v.member_id===actor.id)out.pollSelections[v.post_id]=json(v.options_json,[]);
 for(const r of reactions){const id=r.post_id||r.comment_id;(out.reactionMembers[id]??={});(out.reactionMembers[id][r.emoji]??=[]).push(r.member_id);(out.reactionCounts[id]??={});out.reactionCounts[id][r.emoji]=(out.reactionCounts[id][r.emoji]||0)+1;if(r.member_id===actor.id)(out.reactions[id]??=[]).push(r.emoji)}
 return out;
}

export async function feedPage(db,actor,{before,through,limit}={}){
 const range={before:decodeCursor(before),through:decodeCursor(through)},max=range.through?500:pageSize(limit,POST_PAGE,FIRST_POSTS),k=keyset('p',range);
 const rows=list(await db.prepare(`SELECT p.* FROM posts p WHERE ${visiblePostSql}${k.sql} ORDER BY p.created_at DESC,p.id DESC LIMIT ?`).bind(actor.id,...k.args,max+1).all());
 const page=rows.slice(0,max),more=rows.length>max||Boolean(range.through)&&await olderExists(db,`SELECT 1 FROM posts p WHERE ${visiblePostSql}%KEYSET% LIMIT 1`,[actor.id],page.at(-1),'p');
 return {...await postBundle(db,actor,page),postsCursor:more?encodeCursor(page.at(-1)):null,oldestCursor:encodeCursor(page.at(-1))};
}
export async function memoryPage(db,{before,through,limit}={}){
 const range={before:decodeCursor(before),through:decodeCursor(through)},max=range.through?1000:pageSize(limit,MEMORY_PAGE,FIRST_MEMORIES),k=keyset('m',range);
 const rows=list(await db.prepare(`SELECT m.* FROM memories m WHERE m.deleted_at IS NULL${k.sql} ORDER BY m.created_at DESC,m.id DESC LIMIT ?`).bind(...k.args,max+1).all());
 const page=rows.slice(0,max),more=rows.length>max||Boolean(range.through)&&await olderExists(db,'SELECT 1 FROM memories m WHERE m.deleted_at IS NULL%KEYSET% LIMIT 1',[],page.at(-1),'m');
 return {memories:page.map(memoryView),memoriesCursor:more?encodeCursor(page.at(-1)):null,oldestCursor:encodeCursor(page.at(-1))};
}
// Older comments for one post, oldest first within the page.
export async function commentPage(db,actor,postId,{before,through,limit}={}){
 if(!await readPost(db,actor,postId))throw new UserError('Post not found',404);
 const range={before:decodeCursor(before),through:decodeCursor(through)},max=range.through?2000:pageSize(limit,COMMENT_PAGE,COMMENT_CAP),k=keyset('c',range);
 const rows=list(await db.prepare(`SELECT c.* FROM comments c WHERE c.post_id=? AND c.deleted_at IS NULL${k.sql} ORDER BY c.created_at DESC,c.id DESC LIMIT ?`).bind(postId,...k.args,max+1).all());
 const page=rows.slice(0,max),more=rows.length>max||Boolean(range.through)&&await olderExists(db,'SELECT 1 FROM comments c WHERE c.post_id=? AND c.deleted_at IS NULL%KEYSET% LIMIT 1',[postId],page.at(-1),'c'),oldest=page.at(-1);
 const reactions=page.length?list(await db.prepare('SELECT r.* FROM reactions r WHERE r.comment_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(page.map(c=>c.id))).all()):[];
 const out={postId,comments:page.reverse().map(commentView),cursor:more?encodeCursor(oldest):null,oldestCursor:encodeCursor(oldest),reactions:{},reactionCounts:{},reactionMembers:{}};
 for(const r of reactions){const id=r.comment_id;(out.reactionMembers[id]??={});(out.reactionMembers[id][r.emoji]??=[]).push(r.member_id);(out.reactionCounts[id]??={});out.reactionCounts[id][r.emoji]=(out.reactionCounts[id][r.emoji]||0)+1;if(r.member_id===actor.id)(out.reactions[id]??=[]).push(r.emoji)}
 return out;
}
// History-aware search: every visible post, comment and memory, not just the loaded page.
export async function searchContent(db,actor,query){
 const q=typeof query==='string'?query.normalize('NFC').trim():'';
 if(q.length<2||q.length>80)throw new UserError('Search for two to eighty characters');
 const like='%'+q.replace(/[\\%_]/g,m=>'\\'+m)+'%';
 const posts=list(await db.prepare(`SELECT p.* FROM posts p WHERE ${visiblePostSql} AND (p.body LIKE ?2 ESCAPE '\\' OR EXISTS(SELECT 1 FROM comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL AND c.body LIKE ?2 ESCAPE '\\')) ORDER BY p.created_at DESC,p.id DESC LIMIT 30`).bind(actor.id,like).all());
 const memories=list(await db.prepare(`SELECT m.* FROM memories m WHERE m.deleted_at IS NULL AND (${['title','event','category','milestone','year'].map(k=>`COALESCE(json_extract(m.data_json,'$.${k}'),'') LIKE ?1 ESCAPE '\\'`).join(' OR ')} OR EXISTS(SELECT 1 FROM json_each(m.data_json,'$.tags') t WHERE t.value LIKE ?1 ESCAPE '\\')) ORDER BY m.created_at DESC,m.id DESC LIMIT 60`).bind(like).all());
 return {query:q,...await postBundle(db,actor,posts),memories:memories.map(memoryView)};
}

const excerpt=value=>{const text=String(value||'').replace(/\s+/g,' ').trim();return text.length>160?text.slice(0,157)+'…':text};
// Removed content stays private to its group: membership is checked even after deletion.
const groupReadable=async(db,actor,groupId)=>!groupId||Boolean(await db.prepare('SELECT 1 FROM family_group_members WHERE group_id=? AND member_id=?').bind(groupId,actor.id).first());
// What a removal or report refers to, described only as far as this actor may read.
async function describeTarget(db,actor,id){
 const memory=await db.prepare('SELECT id,author_id,data_json,deleted_at FROM memories WHERE id=?').bind(id).first();
 if(memory){const data=json(memory.data_json);return {kind:'memory',authorId:memory.author_id,removed:Boolean(memory.deleted_at),excerpt:excerpt(data.title||'Shared a memory'),route:memory.deleted_at?null:{type:'memory',id}}}
 const post=await db.prepare('SELECT id,author_id,body,group_id,deleted_at FROM posts WHERE id=?').bind(id).first();
 if(post){const readable=await groupReadable(db,actor,post.group_id);return {kind:'post',authorId:post.author_id,removed:Boolean(post.deleted_at),excerpt:readable?excerpt(post.body):'',private:!readable,route:post.deleted_at||!readable?null:{type:'post',id}}}
 const comment=await db.prepare('SELECT id,post_id,author_id,body,deleted_at FROM comments WHERE id=?').bind(id).first();
 if(comment){const parent=await db.prepare('SELECT group_id FROM posts WHERE id=?').bind(comment.post_id).first(),readable=Boolean(parent)&&await groupReadable(db,actor,parent.group_id);return {kind:'comment',authorId:comment.author_id,removed:Boolean(comment.deleted_at),excerpt:readable?excerpt(comment.body):'',private:!readable,route:readable&&!comment.deleted_at&&await readPost(db,actor,comment.post_id)?{type:'post',id:comment.post_id,section:'comment:'+comment.id}:null}}
 const photo=await db.prepare('SELECT id,author_id,body,deleted_at FROM photo_comments WHERE id=?').bind(id).first().catch(()=>null);
 if(photo)return {kind:'photo-comment',authorId:photo.author_id,removed:Boolean(photo.deleted_at),excerpt:excerpt(photo.body),route:null};
 return {kind:'unknown',authorId:null,removed:true,excerpt:'',route:null};
}
export async function reportQueue(db,actor,{status='open'}={}){
 if(!can(actor,'moderate'))throw new UserError('Moderator permission required',403);
 if(!['open','resolved'].includes(status))throw new UserError('Choose open or resolved reports');
 const rows=list(await db.prepare(`SELECT r.*,u.name AS reporter_name FROM moderation_reports r LEFT JOIN user u ON u.id=r.reporter_id WHERE ${status==='open'?"r.status='open'":"r.status!='open'"} ORDER BY r.created_at DESC,r.id DESC LIMIT 100`).bind().all());
 const reports=[];
 for(const r of rows){const target=await describeTarget(db,actor,r.target_id);const author=target.authorId?await db.prepare('SELECT name FROM user WHERE id=?').bind(target.authorId).first():null;reports.push({id:r.id,targetId:r.target_id,reason:r.reason,status:r.status,reporterName:r.reporter_name||'Family member',createdAt:stamp(r.created_at),resolvedAt:r.resolved_at?stamp(r.resolved_at):null,target:{...target,authorName:author?.name||null}})}
 return {status,reports};
}
// Removals this actor may undo: their own for thirty days; moderators see every open removal.
export async function recentlyRemoved(db,actor){
 const moderator=can(actor,'moderate');
 const rows=list(await db.prepare(`SELECT * FROM content_deletions WHERE restored_at IS NULL AND created_at>=datetime('now',?1) AND (${moderator?'1=1':"actor_id=?2 AND author_id=?2 AND source='owner'"}) ORDER BY created_at DESC,id DESC LIMIT 100`).bind(`-${RESTORE_DAYS} days`,...(moderator?[]:[actor.id])).all());
 const out=[];for(const row of rows){const target=await describeTarget(db,actor,row.target_id);if(!target.removed)continue;out.push({id:row.id,kind:row.kind,targetId:row.target_id,source:row.source,removedAt:stamp(row.created_at),excerpt:target.excerpt})}
 return {removed:out,days:RESTORE_DAYS};
}

// Command helpers: each returns statements for the caller's single batch.
export async function deleteMemoryStatements(db,actor,id,{source,reportId=null}={}){
 const row=await db.prepare('SELECT id,author_id FROM memories WHERE id=? AND deleted_at IS NULL').bind(id).first();
 if(!row)throw new UserError('Memory not found',404);
 const moderator=can(actor,'moderate');
 if(row.author_id!==actor.id&&!moderator)throw new UserError('Only the uploader or a moderator can remove this memory',403);
 const deletionId=crypto.randomUUID(),how=source||(row.author_id===actor.id?'owner':'moderator');
 return {deletionId,authorId:row.author_id,sql:[
  db.prepare('INSERT INTO content_deletions(id,kind,target_id,author_id,actor_id,source,report_id) VALUES(?,?,?,?,?,?,?)').bind(deletionId,'memory',id,row.author_id,actor.id,how,reportId),
  db.prepare('UPDATE memories SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').bind(id),
  // The linked feed post and its discussion leave with the memory.
  db.prepare("UPDATE posts SET deleted_at=CURRENT_TIMESTAMP WHERE deleted_at IS NULL AND (id=? OR json_extract(metadata_json,'$.memoryId')=?)").bind(id,id)
 ]};
}
export function recordDeletion(db,actor,{kind,targetId,authorId,source,reportId=null}){
 const id=crypto.randomUUID();return {id,statement:db.prepare('INSERT INTO content_deletions(id,kind,target_id,author_id,actor_id,source,report_id) VALUES(?,?,?,?,?,?,?)').bind(id,kind,targetId,authorId,actor.id,source||(authorId===actor.id?'owner':'moderator'),reportId)};
}
export async function restoreStatements(db,actor,deletionId){
 if(typeof deletionId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(deletionId))throw new UserError('Removed item not found',404);
 const row=await db.prepare("SELECT *,created_at>=datetime('now',?) AS recent FROM content_deletions WHERE id=?").bind(`-${RESTORE_DAYS} days`,deletionId).first();
 if(!row||row.restored_at)throw new UserError('This item was already restored or is no longer available',409);
 const moderator=can(actor,'moderate'),owner=row.author_id===actor.id&&row.actor_id===actor.id&&row.source==='owner';
 if(!moderator&&!owner)throw new UserError('Only the person who removed this, or a moderator, can restore it',403);
 if(!moderator&&!row.recent)throw new UserError(`Items can be restored for ${RESTORE_DAYS} days. Ask a moderator for help.`,409);
 const sql=[db.prepare('UPDATE content_deletions SET restored_at=CURRENT_TIMESTAMP,restored_by=? WHERE id=? AND restored_at IS NULL').bind(actor.id,row.id)];
 if(row.kind==='memory'){
  sql.push(db.prepare('UPDATE memories SET deleted_at=NULL WHERE id=?').bind(row.target_id));
  sql.push(db.prepare("UPDATE posts SET deleted_at=NULL WHERE deleted_at IS NOT NULL AND (id=? OR json_extract(metadata_json,'$.memoryId')=?)").bind(row.target_id,row.target_id));
 }else if(row.kind==='post'){
  sql.push(db.prepare('UPDATE posts SET deleted_at=NULL WHERE id=?').bind(row.target_id));
  // A post that carried a memory restores that memory only if it left together.
  sql.push(db.prepare("UPDATE memories SET deleted_at=NULL WHERE deleted_at IS NOT NULL AND id=(SELECT json_extract(metadata_json,'$.memoryId') FROM posts WHERE id=?) AND NOT EXISTS(SELECT 1 FROM content_deletions d WHERE d.kind='memory' AND d.target_id=memories.id AND d.restored_at IS NULL AND d.id!=?)").bind(row.target_id,row.id));
 }else sql.push(db.prepare('UPDATE comments SET deleted_at=NULL WHERE id=?').bind(row.target_id));
 return {kind:row.kind,targetId:row.target_id,sql};
}

export function registerContentHistory(app){
 const run=fn=>async c=>{try{return c.json(await fn(c))}catch(error){if(error.status)throw new UserError(error.message,error.status);throw error}};
 app.get('/api/feed',run(c=>feedPage(c.env.DB,c.get('actor'),{before:c.req.query('before'),through:c.req.query('through'),limit:c.req.query('limit')})));
 app.get('/api/memories',run(c=>memoryPage(c.env.DB,{before:c.req.query('before'),through:c.req.query('through'),limit:c.req.query('limit')})));
 app.get('/api/posts/:id/comment-history',run(c=>commentPage(c.env.DB,c.get('actor'),c.req.param('id'),{before:c.req.query('before'),through:c.req.query('through'),limit:c.req.query('limit')})));
 app.get('/api/search',run(c=>searchContent(c.env.DB,c.get('actor'),c.req.query('q'))));
 app.get('/api/moderation/reports',run(c=>reportQueue(c.env.DB,c.get('actor'),{status:c.req.query('status')||'open'})));
 app.get('/api/content/removed',run(c=>recentlyRemoved(c.env.DB,c.get('actor'))));
}
