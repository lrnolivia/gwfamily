import {isMember} from './policy.mjs';
import {CALENDAR_COMMANDS,CalendarError,applyCalendarCommand,calendarRecord,visibleCalendar} from '../../src/calendar-model.js';
export {CALENDAR_COMMANDS};
const leaderSql="EXISTS(SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE m.id=? AND m.status='active' AND m.member_group IN ('family','loved_ones') AND m.is_leader=1 AND u.emailVerified=1)";
const parse=value=>{try{return JSON.parse(value||'{}')}catch{throw new CalendarError('The calendar could not be read. Try again later.',503)}};
export function calendarLeader(actor){return isMember(actor)&&actor.isLeader===true}
export function calendarDetailsFor(details,actor){const c=visibleCalendar(details,calendarLeader(actor));return {...details,schedule:c.schedule,calendar:{revision:c.revision,visibility:c.visibility,timezone:c.timezone,events:c.events}}}
async function assertLeader(db,actor){if(!calendarLeader(actor)||!await db.prepare(`SELECT 1 WHERE ${leaderSql}`).bind(actor.id).first())throw new CalendarError('Family Leader permission required',403)}
export async function readCalendar(db,actor){await assertLeader(db,actor);return calendarRecord(parse((await db.prepare("SELECT data_json FROM reunion_settings WHERE id='current'").bind().first())?.data_json))}
export async function calendarCommand(db,actor,input,fingerprint){
 await assertLeader(db,actor);if(input.expectedAccountId!==actor.id)throw new CalendarError('Your signed-in account changed. Reload before saving.',409);
 const prior=await db.prepare('SELECT * FROM command_receipts WHERE member_id=? AND request_id=?').bind(actor.id,input.requestId).first();
 if(prior){if(prior.fingerprint!==fingerprint||prior.operation!==input.type)throw new CalendarError('This request identifier was already used for different content',409);return parse(prior.result_json)}
 const row=await db.prepare("SELECT data_json FROM reunion_settings WHERE id='current'").bind().first(),before=parse(row?.data_json),mutation=crypto.randomUUID();
 const next=applyCalendarCommand(before,input,{id:crypto.randomUUID(),actorId:actor.id});next.calendar.mutationId=mutation;
 const subject=input.type==='SAVE_EVENT'?(input.event?.id||next.calendar.events.at(-1).id):(input.id||'current');
 const result={ok:true,calendar:calendarRecord(next)},guard="json_extract(data_json,'$.calendar.mutationId')=?";
 // Conditional write, audit, and receipt commit together. No schema change and
 // no family content outside the calendar/schedule is replaced by this write.
 await db.batch([
  db.prepare(`INSERT INTO reunion_settings(id,data_json,updated_by) SELECT 'current','{}',? WHERE ${leaderSql} ON CONFLICT(id) DO NOTHING`).bind(actor.id,actor.id),
  db.prepare(`UPDATE reunion_settings SET data_json=json_set(data_json,'$.calendar',json(?),'$.schedule',?),updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='current' AND data_json=? AND COALESCE(json_extract(data_json,'$.calendar.revision'),0)=? AND ${leaderSql} AND NOT EXISTS(SELECT 1 FROM command_receipts WHERE member_id=? AND request_id=?)`).bind(JSON.stringify(next.calendar),next.schedule,actor.id,row?.data_json||'{}',input.expectedRevision,actor.id,actor.id,input.requestId),
  db.prepare(`INSERT INTO audit_log(id,actor_id,action,subject_id) SELECT ?,?,?,? FROM reunion_settings WHERE id='current' AND ${guard}`).bind(mutation,actor.id,input.type.toLowerCase(),subject,mutation),
  db.prepare(`INSERT INTO command_receipts(member_id,request_id,result_json,operation,fingerprint) SELECT ?,?,?,?,? FROM reunion_settings WHERE id='current' AND ${guard}`).bind(actor.id,input.requestId,JSON.stringify(result),input.type,fingerprint,mutation)
 ]);
 const committed=await db.prepare('SELECT * FROM command_receipts WHERE member_id=? AND request_id=?').bind(actor.id,input.requestId).first();
 if(!committed){await assertLeader(db,actor);throw new CalendarError('The calendar changed while you were editing. Load the latest version before saving.',409)}
 if(committed.fingerprint!==fingerprint||committed.operation!==input.type)throw new CalendarError('This request identifier was already used for different content',409);
 return parse(committed.result_json);
}
