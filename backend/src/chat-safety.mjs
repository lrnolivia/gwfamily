import {UserError} from './family-service.mjs';
import {createRateStorage} from './auth.mjs';
// Participant blocks and intentional message reports. A report holds a copy of
// only the messages the reporter chose; it never grants anyone conversation access.
const rows=r=>r.results||[];
const eligibleSql="m.status='active' AND u.emailVerified=1";
const participantSql="EXISTS(SELECT 1 FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id WHERE cm.conversation_id=? AND cm.member_id=? AND cm.status='active' AND c.archived_at IS NULL)";
async function body(c,keys){const value=await c.req.json();if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new UserError('Unsupported fields');return value}
async function rate(db,id,kind,max,window=3600){if(!(await createRateStorage(db).consume(`chat-safety:${kind}:${id}`,{window,max})).allowed)throw new UserError('Please wait before trying again',429)}
async function active(db,id){if(!await db.prepare(`SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE m.id=? AND ${eligibleSql}`).bind(id).first())throw new UserError('Active verified membership required',403)}
export async function listBlocks(db,actor){return rows(await db.prepare('SELECT b.blocked_id,u.name,b.created_at FROM member_blocks b JOIN user u ON u.id=b.blocked_id WHERE b.blocker_id=? ORDER BY u.name COLLATE NOCASE').bind(actor.id).all()).map(r=>({memberId:r.blocked_id,name:r.name,blockedAt:r.created_at}))}
export async function setBlock(db,actor,{memberId,blocked}){
 await active(db,actor.id);
 if(typeof memberId!=='string'||!memberId||memberId.length>100||memberId===actor.id)throw new UserError('Choose another family member');
 if(typeof blocked!=='boolean')throw new UserError('Choose block or unblock');
 if(!await db.prepare('SELECT 1 FROM members WHERE id=?').bind(memberId).first())throw new UserError('Family member not found',404);
 await rate(db,actor.id,'block',30);
 if(!blocked){await db.prepare('DELETE FROM member_blocks WHERE blocker_id=? AND blocked_id=?').bind(actor.id,memberId).run();return {memberId,blocked:false}}
 await db.batch([
  db.prepare('INSERT OR IGNORE INTO member_blocks(blocker_id,blocked_id) VALUES(?,?)').bind(actor.id,memberId),
  // Waiting invitations between the two end now, in both directions.
  db.prepare("UPDATE conversation_members SET status='declined' WHERE member_id=? AND status='pending' AND invited_by=?").bind(actor.id,memberId),
  db.prepare("UPDATE conversation_members SET status='removed' WHERE member_id=? AND status='pending' AND invited_by=?").bind(memberId,actor.id)
 ]);
 return {memberId,blocked:true};
}
export async function reportMessages(db,actor,conversationId,input){
 await active(db,actor.id);
 if(!await db.prepare(`SELECT 1 WHERE ${participantSql}`).bind(conversationId,actor.id).first())throw new UserError('Conversation not found',404);
 if(typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId))throw new UserError('A valid requestId is required');
 const prior=await db.prepare('SELECT id FROM message_reports WHERE reporter_id=? AND request_id=?').bind(actor.id,input.requestId).first();if(prior)return {id:prior.id};
 const ids=input.messageIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!id||id.length>100)||new Set(ids).size!==ids.length)throw new UserError('Choose one to twenty messages to report');
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)throw new UserError('Tell the moderators what happened');
 const chosen=rows(await db.prepare("SELECT ms.id,ms.author_id,ms.body,ms.attachment_only,ms.created_at,u.name FROM messages ms JOIN user u ON u.id=ms.author_id WHERE ms.conversation_id=? AND ms.id IN (SELECT value FROM json_each(?)) ORDER BY ms.sequence").bind(conversationId,JSON.stringify(ids)).all());
 if(chosen.length!==ids.length)throw new UserError('Some of those messages are no longer available',409);
 if(chosen.every(m=>m.author_id===actor.id))throw new UserError('Choose at least one message from someone else');
 const files=rows(await db.prepare("SELECT message_id,name FROM conversation_attachments WHERE state='ready' AND message_id IN (SELECT value FROM json_each(?)) ORDER BY message_ordinal").bind(JSON.stringify(ids)).all());
 await rate(db,actor.id,'report',20);
 const snapshot=chosen.map(m=>({authorId:m.author_id,authorName:m.name,text:m.attachment_only===1?'':m.body,files:files.filter(f=>f.message_id===m.id).map(f=>f.name),createdAt:m.created_at}));
 const id=crypto.randomUUID();
 await db.prepare(`INSERT INTO message_reports(id,reporter_id,request_id,conversation_id,messages_json,reason) SELECT ?,?,?,?,?,? WHERE ${participantSql} ON CONFLICT(reporter_id,request_id) DO NOTHING`).bind(id,actor.id,input.requestId,conversationId,JSON.stringify(snapshot),input.reason.trim(),conversationId,actor.id).run();
 const saved=await db.prepare('SELECT id FROM message_reports WHERE reporter_id=? AND request_id=?').bind(actor.id,input.requestId).first();if(!saved)throw new UserError('Conversation changed. Try again.',409);
 return {id:saved.id};
}
// Moderator view: the chosen snapshot only, never the conversation.
export async function messageReportQueue(db,status){
 const open=status==='open';
 return rows(await db.prepare(`SELECT r.*,u.name AS reporter_name FROM message_reports r LEFT JOIN user u ON u.id=r.reporter_id WHERE ${open?"r.status='open'":"r.status!='open'"} ORDER BY r.created_at DESC,r.id DESC LIMIT 100`).bind().all()).map(r=>{const messages=JSON.parse(r.messages_json);const people=[...new Set(messages.filter(m=>m.authorId!==r.reporter_id).map(m=>m.authorName))];return {id:r.id,kind:'message',reason:r.reason,status:r.status,reporterName:r.reporter_name||'Family member',createdAt:Date.parse(r.created_at.replace(' ','T')+'Z'),resolvedAt:r.resolved_at?Date.parse(r.resolved_at.replace(' ','T')+'Z'):null,messages,target:{kind:'message',authorName:people.join(', ')||null,excerpt:messages.map(m=>`${m.authorName}: ${m.text||'(attachment)'}${m.files.length?' ['+m.files.join(', ')+']':''}`).join('\n'),route:null,removed:false}}});
}
export function registerChatSafety(app){
 const run=fn=>async c=>{try{return c.json(await fn(c))}catch(error){if(error.status)throw new UserError(error.message,error.status);throw error}};
 app.get('/api/conversations/blocks',run(async c=>({blocks:await listBlocks(c.env.DB,c.get('actor'))})));
 app.post('/api/conversations/blocks',run(async c=>setBlock(c.env.DB,c.get('actor'),await body(c,['memberId','blocked']))));
 app.post('/api/conversations/:id/reports',run(async c=>reportMessages(c.env.DB,c.get('actor'),c.req.param('id'),await body(c,['requestId','messageIds','reason']))));
}
