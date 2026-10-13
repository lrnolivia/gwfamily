import {UserError,json} from './family-service.mjs';
import {isMember} from './policy.mjs';
import {normalizeFamilyEvent,canEditFamilyEvent} from '../../src/family-calendar-model.js';
import {eligibleMemberSql} from './notification-policy.mjs';
const moderatorSql="(m.is_leader=1 OR EXISTS(SELECT 1 FROM json_each(m.roles_json) r WHERE r.value IN ('admin','moderator')))";
const authority=`EXISTS(SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE m.id=? AND m.status='active' AND m.member_group IN ('family','loved_ones') AND u.emailVerified=1 AND (family_calendar_events.created_by=m.id OR ${moderatorSql}))`;
const serialize=row=>({...json(row.data_json),id:row.id,createdBy:row.created_by,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,deletedAt:row.deleted_at});
async function freshActor(db,actor){
 const row=await db.prepare('SELECT m.*,u.emailVerified FROM members m JOIN user u ON u.id=m.id WHERE m.id=?').bind(actor.id).first();
 const fresh=row?{id:row.id,status:row.status,group:row.member_group,roles:json(row.roles_json)||[],isLeader:row.is_leader===1}:null;
 if(!row?.emailVerified||!isMember(fresh))throw new UserError('Active family membership required',403);return fresh;
}
export async function readFamilyCalendar(db,actor){await freshActor(db,actor);return {accountId:actor.id,events:(await db.prepare('SELECT * FROM family_calendar_events WHERE deleted_at IS NULL ORDER BY created_at,id').all()).results.map(serialize)}}
export async function changeFamilyEvent(db,actor,input){
 const fresh=await freshActor(db,actor);if(input.expectedAccountId!==actor.id)throw new UserError('Your account changed. Reload before saving.',409);
 if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))throw new UserError('Use a valid request identifier');
 if(!['save','delete'].includes(input.action))throw new UserError('Use a valid event action');
 const fingerprint=JSON.stringify(input),operation='family_calendar_'+input.action;
 const prior=await db.prepare('SELECT * FROM command_receipts WHERE member_id=? AND request_id=?').bind(actor.id,input.requestId).first();
 if(prior){if(prior.operation!==operation||prior.fingerprint!==fingerprint)throw new UserError('This request identifier was used for different content',409);return json(prior.result_json)}
 const id=input.event?.id||input.id||crypto.randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new UserError('Use a valid event');
 const row=await db.prepare('SELECT * FROM family_calendar_events WHERE id=?').bind(id).first();
 if((input.event?.id||input.action==='delete')&&!row)throw new UserError('Event not found',404);
 if(row?.deleted_at)throw new UserError('This event was removed.',409);
 if(row&&!canEditFamilyEvent(fresh,serialize(row)))throw new UserError('You can edit only your own events',403);
 if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision!==(row?.revision||0))throw new UserError('This event changed. Refresh before saving.',409);
 const moderated=!!row&&row.created_by!==actor.id,reason=typeof input.reason==='string'?input.reason.trim():'';
 if(moderated&&(!reason||reason.length>1000))throw new UserError('Explain the change to its contributor (up to 1,000 characters).');
 const value=input.action==='save'?normalizeFamilyEvent(input.event):json(row.data_json),mutation=crypto.randomUUID(),nextRevision=(row?.revision||0)+1;
 const result={ok:true,accountId:actor.id,id,revision:nextRevision},guard='id=? AND mutation_id=?';
 const statements=[];
 if(row)statements.push(db.prepare(`UPDATE family_calendar_events SET data_json=?,revision=revision+1,deleted_at=CASE WHEN ?='delete' THEN CURRENT_TIMESTAMP ELSE NULL END,mutation_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND deleted_at IS NULL AND ${authority}`).bind(JSON.stringify(value),input.action,mutation,id,input.expectedRevision,actor.id));
 else statements.push(db.prepare(`INSERT INTO family_calendar_events(id,created_by,data_json,mutation_id) SELECT ?,?,?,? WHERE ${eligibleMemberSql('?')} AND NOT EXISTS(SELECT 1 FROM command_receipts WHERE member_id=? AND request_id=?)`).bind(id,actor.id,JSON.stringify(value),mutation,actor.id,actor.id,input.requestId));
 statements.push(db.prepare(`INSERT INTO audit_log(id,actor_id,action,subject_id) SELECT ?,?,?,? FROM family_calendar_events WHERE ${guard}`).bind(mutation,actor.id,operation,id,id,mutation));
 statements.push(db.prepare(`INSERT INTO command_receipts(member_id,request_id,result_json,operation,fingerprint) SELECT ?,?,?,?,? FROM family_calendar_events WHERE ${guard}`).bind(actor.id,input.requestId,JSON.stringify(result),operation,fingerprint,id,mutation));
 if(moderated){
  // Retain the durable moderation event/audit even when delivery is off. The
  // generic fanout does not understand this resource, so this explicit recipient
  // path must apply the same global and effective-channel gates at commit time.
  const recipientDelivery=`EXISTS(SELECT 1 FROM members recipient
   LEFT JOIN notification_settings ns ON ns.member_id=recipient.id
   LEFT JOIN notification_preferences np ON np.member_id=recipient.id
   WHERE recipient.id=family_calendar_events.created_by AND COALESCE(ns.global_off,0)=0 AND COALESCE(np.scope,'leaders')!='off'
   AND (COALESCE(json_extract(ns.categories_json,'$.membership'),1)=1
    OR (COALESCE(json_extract(ns.channels_json,'$.membership.email'),1)=1 AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM email_notification_preferences ep WHERE ep.member_id=recipient.id AND ep.enabled=1))
    OR (COALESCE(json_extract(ns.channels_json,'$.membership.push'),1)=1 AND (SELECT enabled FROM push_control WHERE id=1)=1 AND EXISTS(SELECT 1 FROM push_devices pd JOIN session ps ON ps.id=pd.session_id AND ps.userId=pd.member_id WHERE pd.member_id=recipient.id AND pd.revoked_at IS NULL AND ps.expiresAt>unixepoch()*1000))))`;
  statements.push(db.prepare(`INSERT INTO notification_events(id,event_key,kind,actor_id,resource_kind,resource_id,category,audience,direct_ids_json,data_json) SELECT ?,?,?,?,?,?,'membership','direct',?,? FROM family_calendar_events WHERE ${guard}`).bind(mutation,'family-calendar:'+id+':'+nextRevision,'family_calendar.'+(input.action==='delete'?'removed':'changed'),actor.id,'family_calendar_moderation',id,JSON.stringify([row.created_by]),JSON.stringify({reason,title:value.title,action:input.action}),id,mutation));
  statements.push(db.prepare(`INSERT OR IGNORE INTO notifications(id,recipient_id,event_id,kind,subject_id,category,resource_kind,resource_id) SELECT ?,?,?,?,?,'membership','family_calendar_moderation',? FROM family_calendar_events WHERE ${guard} AND ${eligibleMemberSql('?')} AND ${recipientDelivery}`).bind(crypto.randomUUID(),row.created_by,mutation,'family_calendar.'+(input.action==='delete'?'removed':'changed'),id,id,id,mutation,row.created_by));
 }
 await db.batch(statements);
 const receipt=await db.prepare('SELECT * FROM command_receipts WHERE member_id=? AND request_id=?').bind(actor.id,input.requestId).first();
 if(!receipt){await freshActor(db,actor);throw new UserError('The event or your permissions changed. Refresh before saving.',409)}
 return json(receipt.result_json);
}
export function registerFamilyCalendar(app){
 app.get('/api/family-calendar',async c=>c.json(await readFamilyCalendar(c.env.DB,c.get('actor'))));
 app.post('/api/family-calendar',async c=>c.json(await changeFamilyEvent(c.env.DB,c.get('actor'),await c.req.json())));
}
