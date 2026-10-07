import {UserError,readPost} from './family-service.mjs';
import {createRateStorage} from './auth.mjs';
import {AttachmentError,normalizeAttachmentIds,attachmentGuardSql,loadMessageAttachments,registerMessageAttachments} from './message-attachments.mjs';

const TTL=8000,MAX_MEMBERS=50;
const rows=result=>result.results||[];
const missing=()=>new UserError('Conversation not found',404);
const memberSql="m.status='active' AND u.emailVerified=1";
// Private messaging is a new capability. Fail closed for minors and incomplete
// profiles; existing post visibility and comment typing are unchanged.
const eligibleSql=`${memberSql} AND EXISTS(SELECT 1 FROM profiles ep WHERE ep.member_id=m.id AND ep.completed=1 AND ep.birthday IS NOT NULL AND ep.birthday>='1900-01-01' AND ep.birthday<=date('now','-18 years'))`;
// Every conversation capability requires an accepted participant whose account is active.
// Neither family leadership nor administrative roles grant private-chat access.
const accessFor=expression=>`EXISTS(SELECT 1 FROM conversation_members access JOIN members m ON m.id=access.member_id JOIN user u ON u.id=m.id JOIN conversations ac ON ac.id=access.conversation_id WHERE access.conversation_id=${expression} AND access.member_id=? AND access.status='active' AND ac.archived_at IS NULL AND ${eligibleSql})`;
const accessSql=accessFor('?');
const accountSql=`EXISTS(SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE m.id=? AND ${eligibleSql})`;
const manageSql=`EXISTS(SELECT 1 FROM conversations mc JOIN conversation_members mm ON mm.conversation_id=mc.id WHERE mc.id=? AND mm.member_id=? AND mm.status='active' AND mc.type='group' AND (mc.owner_id=mm.member_id OR mm.role='manager'))`;
const deliverySql=`EXISTS(SELECT 1 FROM conversations delivery WHERE delivery.id=? AND (delivery.type='group' OR EXISTS(SELECT 1 FROM conversation_members peer JOIN members m ON m.id=peer.member_id JOIN user u ON u.id=m.id WHERE peer.conversation_id=delivery.id AND peer.member_id!=? AND peer.status IN ('active','pending') AND ${eligibleSql})))`;
const closed=()=>new UserError('This direct conversation is closed. Leave it before starting a new invitation.',409);

function payload(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new UserError('Unsupported message fields.');
 return value;
}
const readBody=async(c,keys)=>payload(await c.req.json(),keys);
function text(value,max,required=true){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new UserError('Check the entered text');return value.trim()}
function requestId(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(value))throw new UserError('A valid requestId is required');return value}
function sequence(value){if(!Number.isSafeInteger(value)||value<0)throw new UserError('Use a valid message sequence');return value}
function pageLimit(value,defaultValue=50){
 if(value===undefined)return defaultValue;
 if(typeof value!=='string'||!/^([1-9]\d?|100)$/.test(value))throw new UserError('Use a page limit from 1 to 100');return Number(value);
}
function encodeCursor(kind,row){
 const json=JSON.stringify({v:1,kind,at:row.sort_at,id:row.id});
 return btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeCursor(value,kind){
 if(value===undefined)return null;
 try{
  if(typeof value!=='string'||value.length>800||!/^[A-Za-z0-9_-]+$/.test(value))throw 0;
  const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
  const cursor=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));
  if(!cursor||Array.isArray(cursor)||Object.keys(cursor).sort().join(',')!=='at,id,kind,v'||cursor.v!==1||cursor.kind!==kind||typeof cursor.id!=='string'||!cursor.id||cursor.id.length>100||/[\x00-\x1f\x7f]/.test(cursor.id)||typeof cursor.at!=='string'||cursor.at.length>40||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?$/.test(cursor.at)||!Number.isFinite(Date.parse(cursor.at)))throw 0;
  return cursor;
 }catch{throw new UserError('Use a valid inbox cursor')}
}
async function fingerprint(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function rate(db,id,kind,max,window=60){if(!(await createRateStorage(db).consume(`messaging:${kind}:${id}`,{window,max})).allowed)throw new UserError('Please wait before trying again',429)}
async function activeAccount(db,id,adult=true){if(!await db.prepare(`SELECT m.id FROM members m JOIN user u ON u.id=m.id WHERE m.id=? AND ${adult?eligibleSql:memberSql}`).bind(id).first())throw new UserError(adult?'Private messaging requires an active verified adult profile':'Active verified membership required',403)}
async function conversation(db,actor,id){
 const value=await db.prepare(`SELECT c.*,cm.role,cm.read_sequence FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id WHERE c.id=? AND cm.member_id=? AND ${accessSql}`).bind(id,actor.id,id,actor.id).first();
 if(!value)throw missing();return value;
}
function requireManager(value,actor){if(value.type!=='group'||value.owner_id!==actor.id&&value.role!=='manager')throw new UserError('Conversation owner or manager required',403)}
async function recipients(db,actor,value){
 if(!Array.isArray(value)||!value.length||value.length>=MAX_MEMBERS||value.some(id=>typeof id!=='string'||!id||id.length>100||id===actor.id))throw new UserError('Choose other registered family members');
 const ids=[...new Set(value)].sort();
 for(const id of ids)if(!await db.prepare(`SELECT m.id FROM members m JOIN user u ON u.id=m.id WHERE m.id=? AND ${eligibleSql}`).bind(id).first())throw new UserError('Choose active registered adult family members');
 return ids;
}
const message=(row,files=[])=>({id:row.id,conversationId:row.conversation_id,authorId:row.author_id,body:row.attachment_only===1?'':row.body,sequence:row.sequence,createdAt:row.created_at,name:row.name,photo:row.image||null,files});
async function detail(db,actor,id){
 const value=await conversation(db,actor,id);
 const members=rows(await db.prepare(`SELECT cm.member_id,cm.status,cm.role,cm.invited_by,cm.invited_at,cm.joined_at,cm.read_sequence,u.name,u.image FROM conversation_members cm JOIN user u ON u.id=cm.member_id WHERE cm.conversation_id=? AND ${accessSql} ORDER BY CASE cm.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,u.name COLLATE NOCASE,cm.member_id LIMIT 100`).bind(id,id,actor.id).all());
 const last=await db.prepare(`SELECT ms.*,u.name,u.image FROM messages ms JOIN user u ON u.id=ms.author_id WHERE ms.conversation_id=? AND ${accessSql} ORDER BY ms.sequence DESC LIMIT 1`).bind(id,id,actor.id).first();
 const unread=await db.prepare(`SELECT count(*) AS n FROM messages WHERE conversation_id=? AND sequence>? AND author_id!=? AND ${accessSql}`).bind(id,value.read_sequence,actor.id,id,actor.id).first();
 const files=last?(await loadMessageAttachments(db,actor.id,[last],accessFor)).get(last.id)||[]:[];
 await conversation(db,actor,id);
 return serializeConversation(value,members,last,unread?.n||0,actor,files);
}
function serializeConversation(value,members,last,unreadCount,actor,lastFiles=[]){
 return {id:value.id,type:value.type,name:value.name,ownerId:value.owner_id,myRole:value.owner_id===actor.id?'owner':value.role,readSequence:value.read_sequence,latestSequence:last?.sequence||0,unreadCount,createdAt:value.created_at,updatedAt:last?.created_at||value.created_at,lastMessage:last?message(last,lastFiles):null,members:members.map(m=>({memberId:m.member_id,name:m.name,photo:m.image||null,status:m.status,role:m.member_id===value.owner_id?'owner':m.role,invitedBy:m.invited_by,invitedAt:m.invited_at,joinedAt:m.joined_at,readSequence:m.read_sequence}))};
}
async function pageDetails(db,actor,ids){
 if(!ids.length)return [];
 const selected=JSON.stringify(ids);
 // Bounded reads replace per-conversation round trips. JSON binds keep the
 // maximum page within D1's parameter limit, including authorization parameters.
 const summaries=rows(await db.prepare(`SELECT c.*,cm.role,cm.read_sequence,
  lm.id AS last_id,lm.author_id AS last_author_id,lm.body AS last_body,lm.attachment_only AS last_attachment_only,lm.sequence AS last_sequence,lm.created_at AS last_created_at,lu.name AS last_name,lu.image AS last_image,
  (SELECT count(*) FROM messages unread WHERE unread.conversation_id=c.id AND unread.sequence>cm.read_sequence AND unread.author_id!=cm.member_id) AS unread_count
  FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id JOIN members m ON m.id=cm.member_id JOIN user u ON u.id=m.id
  LEFT JOIN messages lm ON lm.id=(SELECT id FROM messages WHERE conversation_id=c.id ORDER BY sequence DESC LIMIT 1) LEFT JOIN user lu ON lu.id=lm.author_id
  WHERE c.id IN (SELECT value FROM json_each(?)) AND cm.member_id=? AND cm.status='active' AND c.archived_at IS NULL AND ${eligibleSql}`).bind(selected,actor.id).all());
 const members=rows(await db.prepare(`WITH ranked AS (
  SELECT cm.*,person.name,person.image,ROW_NUMBER() OVER(PARTITION BY cm.conversation_id ORDER BY CASE cm.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,person.name COLLATE NOCASE,cm.member_id) AS member_rank
  FROM conversation_members cm JOIN user person ON person.id=cm.member_id
  WHERE cm.conversation_id IN (SELECT value FROM json_each(?)) AND ${accessFor('cm.conversation_id')}
 ) SELECT * FROM ranked WHERE member_rank<=100 ORDER BY conversation_id,member_rank`).bind(selected,actor.id).all());
 const lastFiles=await loadMessageAttachments(db,actor.id,summaries.filter(value=>value.last_id).map(value=>({id:value.last_id})),accessFor);
 const stillAllowed=new Set(rows(await db.prepare(`SELECT c.id FROM conversations c WHERE c.id IN (SELECT value FROM json_each(?)) AND ${accessFor('c.id')}`).bind(selected,actor.id).all()).map(value=>value.id));
 const byId=new Map(summaries.map(value=>[value.id,value])),memberGroups=new Map();
 for(const member of members){const group=memberGroups.get(member.conversation_id)||[];group.push(member);memberGroups.set(member.conversation_id,group)}
 return ids.flatMap(id=>{
  const value=byId.get(id),group=memberGroups.get(id)||[];
  if(!value||!stillAllowed.has(id)||!group.some(m=>m.member_id===actor.id&&m.status==='active'))return [];
  const last=value.last_id?{id:value.last_id,conversation_id:id,author_id:value.last_author_id,body:value.last_body,attachment_only:value.last_attachment_only,sequence:value.last_sequence,created_at:value.last_created_at,name:value.last_name,image:value.last_image}:null;
  return [serializeConversation(value,group,last,value.unread_count,actor,lastFiles.get(value.last_id)||[])];
 });
}
async function receipt(db,actor,id,operation,hash){
 const prior=await db.prepare('SELECT * FROM messaging_requests WHERE member_id=? AND request_id=? AND operation=?').bind(actor.id,id,operation).first();
 if(prior&&prior.fingerprint!==hash)throw new UserError('This requestId was already used for different content',409);return prior;
}

// One SQLite statement reads the send receipt and attachment state from the
// same snapshot. A separate receipt read followed by stage validation could
// miss an identical concurrent send that has just bound the files.
async function sendState(db,actor,id,key,hash,ids){
 const now=Date.now(),guard=attachmentGuardSql(ids,id,actor.id,now);
 const permanentlyInvalid=ids.length?`EXISTS(SELECT 1 FROM conversation_attachments a WHERE a.id IN (SELECT value FROM json_each(?)) AND a.conversation_id=? AND a.owner_id=? AND (a.state='cancelled' OR (a.message_id IS NULL AND a.expires_at<=MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)))))`:'0';
 const state=await db.prepare(`SELECT mr.resource_id,mr.fingerprint,(${guard.sql}) AS attachments_valid,CASE WHEN mr.resource_id IS NULL AND ${permanentlyInvalid} THEN 1 ELSE 0 END AS safe_to_edit FROM (SELECT 1) seed LEFT JOIN messaging_requests mr ON mr.member_id=? AND mr.request_id=? AND mr.operation='send' WHERE ${accessSql}`).bind(...guard.values,...(ids.length?[JSON.stringify(ids),id,actor.id,now]:[]),actor.id,key,id,actor.id).first();
 if(!state)throw missing();if(state.resource_id&&state.fingerprint!==hash)throw new UserError('This requestId was already used for different content',409);return state;
}

export function registerMessaging(app){
 registerMessageAttachments(app,{UserError,accessSql,accessFor,conversation,rate,requestId});
 app.get('/api/conversations/recipients',async c=>{
  const db=c.env.DB,actor=c.get('actor');await activeAccount(db,actor.id);
  const q=text(c.req.query('q')||'',80,false),found=rows(await db.prepare(`SELECT m.id,u.name,u.image FROM members m JOIN user u ON u.id=m.id WHERE ${eligibleSql} AND m.id!=? AND (?='' OR instr(lower(u.name),lower(?))>0) ORDER BY u.name COLLATE NOCASE,m.id LIMIT 200`).bind(actor.id,q,q).all());
  await c.get('validateMessageSession')?.();
  return c.json({members:found.map(m=>({id:m.id,name:m.name,photo:m.image||null}))});
 });
 app.get('/api/conversations',async c=>{
  const db=c.env.DB,actor=c.get('actor');await activeAccount(db,actor.id);
  const limit=pageLimit(c.req.query('limit')),invitationLimit=pageLimit(c.req.query('invitationLimit'));
  const cursor=decodeCursor(c.req.query('cursor'),'conversation'),invitationCursor=decodeCursor(c.req.query('invitationCursor'),'invitation');
  const boundary=cursor?'WHERE sort_at<? OR (sort_at=? AND id<?)':'',invitationBoundary=invitationCursor?'WHERE sort_at<? OR (sort_at=? AND id<?)':'';
  const active=rows(await db.prepare(`WITH inbox AS (
   SELECT c.id,COALESCE((SELECT created_at FROM messages WHERE conversation_id=c.id ORDER BY sequence DESC LIMIT 1),c.created_at) AS sort_at
   FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id
   WHERE cm.member_id=? AND cm.status='active' AND c.archived_at IS NULL AND ${accountSql}
  ) SELECT id,sort_at FROM inbox ${boundary} ORDER BY sort_at DESC,id DESC LIMIT ?`).bind(actor.id,actor.id,...(cursor?[cursor.at,cursor.at,cursor.id]:[]),limit+1).all());
  const invited=rows(await db.prepare(`WITH inbox AS (
   SELECT c.id,c.type,c.name,cm.invited_by,cm.invited_at,COALESCE(cm.invited_at,c.created_at) AS sort_at,u.name AS inviter_name
   FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id LEFT JOIN user u ON u.id=cm.invited_by
   WHERE cm.member_id=? AND cm.status='pending' AND c.archived_at IS NULL AND ${accountSql}
  ) SELECT inbox.*,(SELECT count(*) FROM conversation_members im WHERE im.conversation_id=inbox.id AND im.status IN ('active','pending')) AS member_count FROM inbox ${invitationBoundary} ORDER BY sort_at DESC,id DESC LIMIT ?`).bind(actor.id,actor.id,...(invitationCursor?[invitationCursor.at,invitationCursor.at,invitationCursor.id]:[]),invitationLimit+1).all());
  // Count over authorized memberships only; the aggregates contain no previews or
  // message text and are independent of either section's current page.
  const totals=await db.prepare(`SELECT
   (SELECT count(*) FROM messages ms JOIN conversations c ON c.id=ms.conversation_id JOIN conversation_members cm ON cm.conversation_id=c.id WHERE cm.member_id=? AND cm.status='active' AND c.archived_at IS NULL AND ms.sequence>cm.read_sequence AND ms.author_id!=?) AS unread_count,
   (SELECT count(*) FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.member_id=? AND cm.status='pending' AND c.archived_at IS NULL) AS invitation_count
   WHERE ${accountSql}`).bind(actor.id,actor.id,actor.id,actor.id).first();
  if(!totals)throw new UserError('Active verified adult membership required',403);
  const page=active.slice(0,limit),invitePage=invited.slice(0,invitationLimit),conversations=await pageDetails(db,actor,page.map(item=>item.id));
  const invitations=invitePage.map(i=>({id:i.id,type:i.type,name:i.name,invitedBy:i.invited_by,inviterName:i.inviter_name,invitedByName:i.inviter_name,memberCount:i.member_count,invitedAt:i.invited_at}));
  await c.get('validateMessageSession')?.();
  return c.json({conversations,invitations,nextCursor:active.length>limit?encodeCursor('conversation',page.at(-1)):null,nextInvitationCursor:invited.length>invitationLimit?encodeCursor('invitation',invitePage.at(-1)):null,unreadCount:totals.unread_count,invitationCount:totals.invitation_count});
 });
 app.post('/api/conversations',async c=>{
  const db=c.env.DB,actor=c.get('actor'),data=await readBody(c,['requestId','type','memberIds','name']);await activeAccount(db,actor.id);
  const key=requestId(data.requestId);if(!['direct','group'].includes(data.type))throw new UserError('Choose a direct or group conversation');
  const ids=await recipients(db,actor,data.memberIds);if(data.type==='direct'&&ids.length!==1)throw new UserError('Direct conversations need exactly one recipient');
  const name=text(data.name??'',80,data.type==='group');if(data.type==='direct'&&name)throw new UserError('Only group conversations have a custom name');
  const hash=await fingerprint({type:data.type,name,memberIds:ids}),prior=await receipt(db,actor,key,'create',hash);
  if(prior){await conversation(db,actor,prior.resource_id);return c.json({id:prior.resource_id})}
  const pair=data.type==='direct'?JSON.stringify([actor.id,...ids].sort()):null;
  const reuse=async()=>{
   if(!pair)return null;
   const existing=await db.prepare('SELECT id FROM conversations WHERE direct_key=? AND archived_at IS NULL').bind(pair).first();
   if(!existing)return null;
   try{await conversation(db,actor,existing.id)}catch(error){if(error.status===404)throw new UserError('Respond to the existing invitation before opening this direct conversation',409);throw error}
   await db.prepare(`INSERT OR IGNORE INTO messaging_requests(member_id,request_id,operation,fingerprint,resource_id) SELECT ?,?,'create',?,? WHERE ${accessSql}`).bind(actor.id,key,hash,existing.id,existing.id,actor.id).run();
   const saved=await receipt(db,actor,key,'create',hash);if(!saved)throw missing();return {id:saved.resource_id};
  };
  const existing=await reuse();if(existing)return c.json(existing);
  await rate(db,actor.id,'create',20,3600);
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const guard='EXISTS(SELECT 1 FROM messaging_requests WHERE member_id=? AND request_id=? AND operation=\'create\' AND resource_id=?)';
  const eligibleRecipients=`(SELECT count(*) FROM members m JOIN user u ON u.id=m.id WHERE m.id IN (${ids.map(()=>'?').join(',')}) AND ${eligibleSql})=?`;
  const statements=[
   db.prepare(`INSERT OR IGNORE INTO messaging_requests(member_id,request_id,operation,fingerprint,resource_id) SELECT ?,?,'create',?,? WHERE ${accountSql} AND ${eligibleRecipients}`).bind(actor.id,key,hash,id,actor.id,...ids,ids.length),
   db.prepare(`INSERT INTO conversations(id,type,name,owner_id,created_at,direct_key) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(id,data.type,name,actor.id,now,pair,actor.id,key,id),
   db.prepare(`INSERT INTO conversation_members(conversation_id,member_id,status,joined_at) SELECT ?,?,'active',? WHERE ${guard}`).bind(id,actor.id,now,actor.id,key,id),
   ...ids.map(memberId=>db.prepare(`INSERT INTO conversation_members(conversation_id,member_id,status,invited_by,invited_at) SELECT ?,?,'pending',?,? WHERE ${guard} AND ${accountSql}`).bind(id,memberId,actor.id,now,actor.id,key,id,memberId))
  ];
  try{await db.batch(statements)}catch(error){const concurrent=await reuse();if(concurrent)return c.json(concurrent);throw error}
  const saved=await receipt(db,actor,key,'create',hash);if(!saved)throw new UserError('Conversation membership changed. Choose eligible members and try again.',409);await conversation(db,actor,saved.resource_id);return c.json({id:saved.resource_id},201);
 });
 app.get('/api/conversations/:id',async c=>{const conversation=await detail(c.env.DB,c.get('actor'),c.req.param('id'));await c.get('validateMessageSession')?.();return c.json({conversation})});
 app.get('/api/conversations/:id/messages',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id');await conversation(db,actor,id);
  const before=c.req.query('before'),after=c.req.query('after'),rawLimit=c.req.query('limit')??'50';
  if(before!==undefined&&after!==undefined||![rawLimit,before,after].filter(v=>v!==undefined).every(v=>/^\d+$/.test(v)))throw new UserError('Use valid pagination cursors');
  const limit=Number(rawLimit);if(!Number.isInteger(limit)||limit<1||limit>100)throw new UserError('Use a limit from 1 to 100');
  const cursor=before??after;if(cursor!==undefined)sequence(Number(cursor));
  const found=rows(await db.prepare(`SELECT ms.*,u.name,u.image FROM messages ms JOIN user u ON u.id=ms.author_id WHERE ms.conversation_id=? AND ${accessSql}${cursor!==undefined?` AND ms.sequence ${before!==undefined?'<':'>'} ?`:''} ORDER BY ms.sequence ${after!==undefined?'ASC':'DESC'} LIMIT ?`).bind(id,id,actor.id,...(cursor!==undefined?[Number(cursor)]:[]),limit+1).all());
  const hasMore=found.length>limit,result=found.slice(0,limit);if(after===undefined)result.reverse();
  const attachments=await loadMessageAttachments(db,actor.id,result,accessFor);
  await c.get('validateMessageSession')?.();await conversation(db,actor,id);
  return c.json({messages:result.map(row=>message(row,attachments.get(row.id)||[])),nextBefore:result[0]?.sequence??null,nextAfter:result.at(-1)?.sequence??null,hasMore});
 });
 app.post('/api/conversations/:id/messages',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id');await conversation(db,actor,id);
  const data=await readBody(c,['requestId','body','attachments','expectedAccountId']),key=requestId(data.requestId),body=text(data.body??'',4000,false);
  let ids;try{ids=normalizeAttachmentIds(data.attachments)}catch(error){if(error instanceof AttachmentError)throw new UserError(error.message,error.status);throw error}
  if((ids.length||data.expectedAccountId!==undefined)&&data.expectedAccountId!==actor.id)throw new UserError('The signed-in account changed. Reload before sending.',409);
  if(!body&&!ids.length)throw new UserError('Enter a message or choose an attachment');
  // Preserve the existing text-only fingerprint for old clients. Attachment refs
  // are ordered, immutable private IDs, never metadata or family media URLs.
  const hash=await fingerprint(ids.length?{conversationId:id,body,attachments:ids}:{conversationId:id,body});
  const confirm=async saved=>{
   const row=await db.prepare(`SELECT ms.*,u.name,u.image FROM messages ms JOIN user u ON u.id=ms.author_id WHERE ms.id=? AND ms.conversation_id=? AND ms.author_id=? AND ${accessSql}`).bind(saved.resource_id,id,actor.id,id,actor.id).first();
   if(!row){await conversation(db,actor,id);throw new UserError('This send receipt has no accessible message. Reload before retrying.',409)}
   const files=(await loadMessageAttachments(db,actor.id,[row],accessFor)).get(row.id)||[];
   // Hydration awaits another database read. Do not return a cached body after
   // participant/adult/archive access has changed during that await.
   await c.get('validateMessageSession')?.();await conversation(db,actor,id);
   if(files.length!==ids.length||files.some((file,index)=>file.id!==ids[index]))throw new UserError('The message attachment association is incomplete. Retry the same request.',409);
   return c.json({message:message(row,files)},201);
  };
  const unavailable=state=>state.safe_to_edit===1?c.json({error:'An attachment expired or was cancelled. Upload it again before sending.',code:'attachments-unavailable',safeToEdit:true},410):c.json({error:'The attachment send is not confirmed. Retry the same request before changing it.',code:'attachments-unconfirmed',safeToEdit:false},409);
  let saved=await sendState(db,actor,id,key,hash,ids);
  if(saved.resource_id)return confirm(saved);
  if(ids.length&&!saved.attachments_valid)return unavailable(saved);
  const nowMs=Date.now(),attachmentGuard=attachmentGuardSql(ids,id,actor.id,nowMs);
  if(!await db.prepare(`SELECT 1 WHERE ${deliverySql}`).bind(id,actor.id).first())throw closed();
  await rate(db,actor.id,'send',60);const mid=crypto.randomUUID(),now=new Date().toISOString();
  let storedBody=body;
  if(!storedBody){
   const names=rows(await db.prepare('SELECT id,name FROM conversation_attachments WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all()),byId=new Map(names.map(file=>[file.id,file.name]));
   storedBody=ids.map(fileId=>byId.get(fileId)||'Attachment').join('\n');
  }
  const statements=[
   db.prepare(`INSERT OR IGNORE INTO messaging_requests(member_id,request_id,operation,fingerprint,resource_id) SELECT ?,?,'send',?,? WHERE ${accessSql} AND ${deliverySql} AND ${attachmentGuard.sql}`).bind(actor.id,key,hash,mid,id,actor.id,id,actor.id,...attachmentGuard.values),
   db.prepare(`INSERT INTO messages(id,conversation_id,author_id,body,created_at,sequence,attachment_only) SELECT ?,?,?,?,?,COALESCE((SELECT MAX(sequence) FROM messages WHERE conversation_id=?),0)+1,? WHERE EXISTS(SELECT 1 FROM messaging_requests WHERE member_id=? AND request_id=? AND operation='send' AND resource_id=?) AND ${accessSql} AND ${deliverySql} AND ${attachmentGuard.sql}`).bind(mid,id,actor.id,storedBody,now,id,body?0:1,actor.id,key,mid,id,actor.id,id,actor.id,...attachmentGuard.values)
  ];
  if(ids.length)statements.push(db.prepare(`UPDATE conversation_attachments SET message_id=?,message_ordinal=CAST((SELECT key FROM json_each(?) WHERE value=conversation_attachments.id) AS INTEGER) WHERE id IN (SELECT value FROM json_each(?)) AND conversation_id=? AND owner_id=? AND state='ready' AND message_id IS NULL AND expires_at>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) AND ${accessFor('conversation_attachments.conversation_id')} AND EXISTS(SELECT 1 FROM messages ms WHERE ms.id=? AND ms.conversation_id=conversation_attachments.conversation_id AND ms.author_id=conversation_attachments.owner_id)`).bind(mid,JSON.stringify(ids),JSON.stringify(ids),id,actor.id,nowMs,actor.id,mid));
  if(ids.length){
   // A zero-row association update must fail the whole batch, not leave a real
   // message without its files. TTL may elapse between transactional statements.
   // attachment_only's draft CHECK rejects 2; the UPDATE is a no-op on success.
   statements.push(db.prepare(`UPDATE messages SET attachment_only=2 WHERE id=? AND author_id=? AND (SELECT count(*) FROM conversation_attachments a WHERE a.message_id=messages.id AND a.conversation_id=messages.conversation_id AND a.owner_id=messages.author_id AND a.state='ready' AND a.id IN (SELECT value FROM json_each(?)))!=?`).bind(mid,actor.id,JSON.stringify(ids),ids.length));
  }
  statements.push(db.prepare("DELETE FROM typing_presence WHERE scope_kind='conversation' AND scope_id=? AND member_id=?").bind(id,actor.id));
  // D1 batch is transactional: receipt, message and all attachment associations
  // commit together. Participant and staged-reference guards live in the writes.
  await c.get('validateMessageSession')?.();await db.batch(statements);saved=await sendState(db,actor,id,key,hash,ids);
  if(saved.resource_id)return confirm(saved);
  if(ids.length&&!saved.attachments_valid)return unavailable(saved);
  if(!await db.prepare(`SELECT 1 WHERE ${deliverySql}`).bind(id,actor.id).first())throw closed();
  // A concurrent attempt can commit after the snapshot. Keep its original key
  // and content for retry; never promise that editing is safe in this state.
  return c.json({error:'The message send is not confirmed. Retry the same request before changing it.',code:'send-unconfirmed',safeToEdit:false},409);
 });
 app.post('/api/conversations/:id/read',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id');await conversation(db,actor,id);
  const data=await readBody(c,['sequence']),value=sequence(data.sequence);
  if(value&&!await db.prepare('SELECT id FROM messages WHERE conversation_id=? AND sequence=?').bind(id,value).first())throw new UserError('Message cursor not found');
  const result=await db.prepare(`UPDATE conversation_members SET read_sequence=MAX(read_sequence,?) WHERE conversation_id=? AND member_id=? AND ${accessSql} RETURNING read_sequence`).bind(value,id,actor.id,id,actor.id).first();
  if(!result)throw missing();return c.json({readSequence:result.read_sequence});
 });
 app.post('/api/conversations/:id/invitation',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id');await activeAccount(db,actor.id);
  const data=await readBody(c,['action']);if(!['accept','decline'].includes(data.action))throw new UserError('Choose accept or decline');
  const status=data.action==='accept'?'active':'declined',now=new Date().toISOString();
  const result=await db.prepare(`UPDATE conversation_members SET status=?,joined_at=CASE WHEN ?='active' THEN ? ELSE joined_at END WHERE conversation_id=? AND member_id=? AND status='pending' AND EXISTS(SELECT 1 FROM conversations WHERE id=? AND archived_at IS NULL) AND ${accountSql} RETURNING member_id`).bind(status,status,now,id,actor.id,id,actor.id).first();
  if(!result)throw new UserError('Invitation not found',404);return c.json({id,status});
 });
 app.post('/api/conversations/:id/members',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id'),value=await conversation(db,actor,id);requireManager(value,actor);
  const data=await readBody(c,['memberIds']),ids=await recipients(db,actor,data.memberIds);
  const current=rows(await db.prepare("SELECT member_id FROM conversation_members WHERE conversation_id=? AND status IN ('active','pending')").bind(id).all());
  if(new Set([...current.map(x=>x.member_id),...ids]).size>MAX_MEMBERS)throw new UserError('Conversations support up to 50 members');
  await rate(db,actor.id,'invite',40,3600);const now=new Date().toISOString();
  await db.batch(ids.map(memberId=>db.prepare(`INSERT INTO conversation_members(conversation_id,member_id,status,role,invited_by,invited_at) SELECT ?,?,'pending','member',?,? WHERE ${accessSql} AND ${manageSql} AND ${accountSql} ON CONFLICT(conversation_id,member_id) DO UPDATE SET status='pending',role='member',invited_by=excluded.invited_by,invited_at=excluded.invited_at,joined_at=NULL WHERE conversation_members.status IN ('declined','left','removed')`).bind(id,memberId,actor.id,now,id,actor.id,id,actor.id,memberId)));
  return c.json({conversation:await detail(db,actor,id)});
 });
 app.patch('/api/conversations/:id',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id'),value=await conversation(db,actor,id);requireManager(value,actor);
  const data=await readBody(c,['name','ownerId']);if(!Object.keys(data).length)throw new UserError('Choose a conversation setting');
  const name=data.name===undefined?value.name:text(data.name,80);let ownerId=value.owner_id;
  if(data.ownerId!==undefined){
   if(value.owner_id!==actor.id)throw new UserError('Only the owner can transfer ownership',403);
   if(typeof data.ownerId!=='string'||!await db.prepare(`SELECT cm.member_id FROM conversation_members cm JOIN members m ON m.id=cm.member_id JOIN user u ON u.id=m.id WHERE cm.conversation_id=? AND cm.member_id=? AND cm.status='active' AND ${eligibleSql}`).bind(id,data.ownerId).first())throw new UserError('Choose an active conversation member');ownerId=data.ownerId;
  }
  const updated=await db.prepare(`UPDATE conversations SET name=?,owner_id=? WHERE id=? AND owner_id=? AND ${accessSql} AND ${manageSql} AND EXISTS(SELECT 1 FROM conversation_members target JOIN members m ON m.id=target.member_id JOIN user u ON u.id=m.id WHERE target.conversation_id=conversations.id AND target.member_id=? AND target.status='active' AND ${eligibleSql}) RETURNING id`).bind(name,ownerId,id,value.owner_id,id,actor.id,id,actor.id,ownerId).first();
  if(!updated)throw missing();return c.json({conversation:await detail(db,actor,id)});
 });
 app.patch('/api/conversations/:id/members/:memberId',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id'),memberId=c.req.param('memberId'),value=await conversation(db,actor,id);
  if(value.type!=='group'||value.owner_id!==actor.id)throw new UserError('Conversation owner required',403);
  const data=await readBody(c,['role']);if(!['manager','member'].includes(data.role)||memberId===actor.id)throw new UserError('Choose a member role');
  const updated=await db.prepare(`UPDATE conversation_members SET role=? WHERE conversation_id=? AND member_id=? AND status='active' AND ${accessSql} AND EXISTS(SELECT 1 FROM conversations WHERE id=? AND owner_id=?) RETURNING member_id`).bind(data.role,id,memberId,id,actor.id,id,actor.id).first();
  if(!updated)throw missing();return c.json({conversation:await detail(db,actor,id)});
 });
 app.delete('/api/conversations/:id/members/:memberId',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id'),memberId=c.req.param('memberId'),value=await conversation(db,actor,id);requireManager(value,actor);
  if(memberId===actor.id)throw new UserError('Use Leave conversation to leave');if(memberId===value.owner_id)throw new UserError('Transfer ownership before removing the owner',403);
  const result=await db.prepare(`UPDATE conversation_members SET status='removed',role='member' WHERE conversation_id=? AND member_id=? AND status IN ('active','pending') AND EXISTS(SELECT 1 FROM conversations target WHERE target.id=conversation_members.conversation_id AND target.owner_id!=conversation_members.member_id AND (conversation_members.role!='manager' OR target.owner_id=?)) AND ${accessSql} AND ${manageSql} RETURNING member_id`).bind(id,memberId,actor.id,id,actor.id,id,actor.id).first();
  if(!result)throw missing();await db.prepare("DELETE FROM typing_presence WHERE scope_kind='conversation' AND scope_id=? AND member_id=?").bind(id,memberId).run();return c.json({id,memberId,status:'removed'});
 });
 app.post('/api/conversations/:id/leave',async c=>{
  const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id'),value=await conversation(db,actor,id);await readBody(c,[]);
  const other=await db.prepare(`SELECT cm.member_id FROM conversation_members cm JOIN members m ON m.id=cm.member_id JOIN user u ON u.id=m.id WHERE cm.conversation_id=? AND cm.member_id!=? AND cm.status='active' AND ${eligibleSql} ORDER BY cm.member_id LIMIT 1`).bind(id,actor.id).first();
  if(value.type==='group'&&value.owner_id===actor.id&&other)throw new UserError('Transfer ownership to an active member before leaving',409);
  const now=new Date().toISOString();
  const otherSql=`SELECT cm.member_id FROM conversation_members cm JOIN members m ON m.id=cm.member_id JOIN user u ON u.id=m.id WHERE cm.conversation_id=conversations.id AND cm.member_id!=? AND cm.status='active' AND ${eligibleSql} ORDER BY cm.member_id LIMIT 1`;
  // Recompute the remaining audience inside the atomic batch: an invitation may
  // have been accepted or ownership transferred since the initial screen read.
  const result=await db.batch([
   db.prepare(`UPDATE conversations SET owner_id=CASE WHEN owner_id=? THEN (${otherSql}) ELSE owner_id END,archived_at=CASE WHEN NOT EXISTS(${otherSql}) THEN ? ELSE archived_at END WHERE id=? AND ${accessSql} AND NOT(type='group' AND owner_id=? AND EXISTS(${otherSql}))`).bind(actor.id,actor.id,actor.id,now,id,id,actor.id,actor.id,actor.id),
   db.prepare(`UPDATE conversation_members SET status='left',role='member' WHERE conversation_id=? AND member_id=? AND status='active' AND ${accountSql} AND EXISTS(SELECT 1 FROM conversations WHERE id=? AND (owner_id IS NULL OR owner_id!=?))`).bind(id,actor.id,actor.id,id,actor.id),
   db.prepare("UPDATE conversation_members SET status='removed',role='member' WHERE conversation_id=? AND status='pending' AND EXISTS(SELECT 1 FROM conversations WHERE id=? AND archived_at IS NOT NULL)").bind(id,id),
   db.prepare("DELETE FROM typing_presence WHERE scope_kind='conversation' AND scope_id=? AND member_id=?").bind(id,actor.id)
  ]);
  if(!result[1].meta.changes)throw new UserError('Conversation changed. Check membership and ownership before leaving.',409);
  return c.json({id,status:'left'});
 });
 for(const [scope,path] of [['conversation','/api/conversations/:id/typing'],['post','/api/posts/:id/typing']]){
  app.get(path,async c=>c.json(await typing(c,scope,false)));
  app.post(path,async c=>c.json(await typing(c,scope,true)));
 }
}
async function typing(c,scope,write){
 const db=c.env.DB,actor=c.get('actor'),id=c.req.param('id');await activeAccount(db,actor.id,scope==='conversation');
 let post=null;if(scope==='conversation')await conversation(db,actor,id);else{post=await readPost(db,actor,id);if(!post)throw new UserError('Post not found',404)}
 const now=Date.now();
 if(write){
  const data=await readBody(c,['typing']);if(typeof data.typing!=='boolean')throw new UserError('Use a typing status');
  await rate(db,actor.id,'typing',120);
  if(data.typing){
   const guard=scope==='conversation'?accessSql:`EXISTS(SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE m.id=? AND ${memberSql}) AND EXISTS(SELECT 1 FROM posts p WHERE p.id=? AND p.deleted_at IS NULL AND (p.group_id IS NULL OR EXISTS(SELECT 1 FROM family_group_members gm WHERE gm.group_id=p.group_id AND gm.member_id=?)))`;
   const args=scope==='conversation'?[id,actor.id]:[actor.id,id,actor.id];
   await db.prepare(`INSERT INTO typing_presence(scope_kind,scope_id,member_id,expires_at) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(scope_kind,scope_id,member_id) DO UPDATE SET expires_at=excluded.expires_at`).bind(scope,id,actor.id,now+TTL,...args).run();
  }else await db.prepare('DELETE FROM typing_presence WHERE scope_kind=? AND scope_id=? AND member_id=?').bind(scope,id,actor.id).run();
 }
 await db.prepare('DELETE FROM typing_presence WHERE expires_at<=?').bind(now).run();
 const visible=scope==='conversation'?`EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=tp.scope_id AND cm.member_id=tp.member_id AND cm.status='active') AND ${accessSql}`:`EXISTS(SELECT 1 FROM posts p WHERE p.id=tp.scope_id AND p.deleted_at IS NULL AND (p.group_id IS NULL OR EXISTS(SELECT 1 FROM family_group_members gm WHERE gm.group_id=p.group_id AND gm.member_id=tp.member_id)) AND (p.group_id IS NULL OR EXISTS(SELECT 1 FROM family_group_members gm WHERE gm.group_id=p.group_id AND gm.member_id=?)))`;
 const args=scope==='conversation'?[id,actor.id]:[actor.id];
 const result=rows(await db.prepare(`SELECT tp.member_id,u.name,tp.expires_at FROM typing_presence tp JOIN members m ON m.id=tp.member_id JOIN user u ON u.id=m.id WHERE tp.scope_kind=? AND tp.scope_id=? AND tp.member_id!=? AND tp.expires_at>? AND ${scope==='conversation'?eligibleSql:memberSql} AND ${visible} ORDER BY u.name COLLATE NOCASE,tp.member_id LIMIT 50`).bind(scope,id,actor.id,now,...args).all());
 return {typing:result.map(p=>({memberId:p.member_id,name:p.name,expiresAt:p.expires_at})),ttlMs:TTL,serverNow:now};
}
