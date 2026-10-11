import {can} from './policy.mjs';
import {memorialPermissions} from './memorials.mjs';
// Cleanup and account lifecycle. Policy, kept in code so it is reviewed with it:
// - Retention: removals are soft. Children's private records, memorials and
//   households can be restored; nothing here erases rows or files.
// - Ownership handover: a household passes to a new founding head by consent
//   (household-succession.mjs) before its founder leaves; a household can be
//   archived only by its founder when nobody else belongs, or by an admin.
// - Shared content: a person's posts, comments, memories and messages stay
//   with the family when they leave a household or lose membership; removing
//   membership is never deletion.
// - Export and deletion: members ask; an admin acknowledges and handles the
//   request outside the app. Account deletion stays disabled until retention,
//   handover and shared-content handling for that person are agreed.
// - Recovery: removed child records restore for 30 days; archives restore any time.
export const LIFECYCLE_POLICY=Object.freeze({childRecordRestoreDays:30,accountDeletion:'disabled; request only',erasure:'never automatic'});
export const LIFECYCLE_COMMANDS=new Set(['REMOVE_DEPENDENT','RESTORE_DEPENDENT','ARCHIVE_MEMORIAL','RESTORE_MEMORIAL','ARCHIVE_HOUSEHOLD','RESTORE_HOUSEHOLD','REQUEST_ACCOUNT_DATA','WITHDRAW_ACCOUNT_REQUEST','ACKNOWLEDGE_ACCOUNT_REQUEST']);
const rows=r=>r.results||[];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const id=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(v))throw fail('Not found',404);return v};
async function memorialManager(db,actor,memorial){
 const p=await memorialPermissions(db,actor);if(can(actor,'manage_members')||actor.isLeader===true||memorial.created_by===actor.id)return true;
 return rows(await db.prepare("SELECT household_id FROM household_heritage WHERE person_id=? AND person_kind='ancestor'").bind(memorial.id).all()).some(h=>p.headHouseholdIds.includes(h.household_id));
}
export async function lifecycleCommand(db,actor,input,q,audit){
 if(!LIFECYCLE_COMMANDS.has(input.type))return null;
 switch(input.type){
 case 'REMOVE_DEPENDENT':case 'RESTORE_DEPENDENT':{
  // Children's records are private to their guardian; nobody else can see or change them.
  const removing=input.type==='REMOVE_DEPENDENT',row=await db.prepare(`SELECT id,deleted_at,deleted_at>=datetime('now','-${LIFECYCLE_POLICY.childRecordRestoreDays} days') AS recent FROM dependents WHERE id=? AND guardian_id=?`).bind(id(input.id),actor.id).first();
  if(!row)throw fail('Household member not found',404);
  if(removing){if(row.deleted_at)return {id:row.id};q('UPDATE dependents SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND guardian_id=? AND deleted_at IS NULL',row.id,actor.id)}
  else{if(!row.deleted_at)return {id:row.id};if(!row.recent)throw fail(`Records can be restored for ${LIFECYCLE_POLICY.childRecordRestoreDays} days.`,409);q('UPDATE dependents SET deleted_at=NULL WHERE id=? AND guardian_id=?',row.id,actor.id)}
  audit(removing?'dependent-removed':'dependent-restored',row.id);return {id:row.id};
 }
 case 'ARCHIVE_MEMORIAL':case 'RESTORE_MEMORIAL':{
  const memorial=await db.prepare('SELECT * FROM memorials WHERE id=?').bind(id(input.id)).first();if(!memorial)throw fail('Memorial profile not found',404);
  if(!await memorialManager(db,actor,memorial))throw fail('A leader, its creator or a head of a household remembering this ancestor can archive it',403);
  const archiving=input.type==='ARCHIVE_MEMORIAL';if(Boolean(memorial.archived_at)===archiving)return {id:memorial.id};
  q('UPDATE memorials SET archived_at=?,archived_by=? WHERE id=?',archiving?new Date().toISOString():null,archiving?actor.id:null,memorial.id);audit(archiving?'memorial-archived':'memorial-restored',memorial.id);return {id:memorial.id};
 }
 case 'ARCHIVE_HOUSEHOLD':case 'RESTORE_HOUSEHOLD':{
  const h=await db.prepare('SELECT * FROM households WHERE id=?').bind(id(input.householdId)).first();if(!h)throw fail('Household not found',404);
  const admin=can(actor,'manage_members'),archiving=input.type==='ARCHIVE_HOUSEHOLD';
  if(!admin&&h.founder_id!==actor.id)throw fail('Only the founding head or an admin can archive this household',403);
  if(Boolean(h.archived_at)===archiving)return {id:h.id};
  if(archiving){
   const others=(await db.prepare('SELECT count(*) n FROM household_members WHERE household_id=? AND member_id!=?').bind(h.id,h.founder_id||'').first()).n;
   if(others&&!admin)throw fail('Others still belong to this household. They can leave, or hand it to another head first.',409);
   q("UPDATE household_requests SET status='cancelled',resolved_at=CURRENT_TIMESTAMP WHERE household_id=? AND status='pending'",h.id);
   q('UPDATE household_email_invites SET expires_at=MIN(expires_at,?) WHERE household_id=? AND accepted_at IS NULL',Date.now()-1,h.id);
  }
  q('UPDATE households SET archived_at=?,archived_by=? WHERE id=?',archiving?new Date().toISOString():null,archiving?actor.id:null,h.id);
  q('INSERT INTO household_role_log(id,household_id,actor_id,member_id,action) VALUES(?,?,?,?,?)',crypto.randomUUID(),h.id,actor.id,null,archiving?'archived':'restored');
  audit(archiving?'household-archived':'household-restored',h.id);return {id:h.id};
 }
 case 'REQUEST_ACCOUNT_DATA':{
  if(!['export','deletion'].includes(input.kind))throw fail('Choose a copy of your data or a deletion review');
  const note=typeof input.note==='string'?input.note.trim():'';if(note.length>1000)throw fail('Keep the note under 1,000 characters');
  if(await db.prepare("SELECT 1 FROM account_requests WHERE member_id=? AND kind=? AND status='open'").bind(actor.id,input.kind).first())throw fail('You already have an open request of this kind',409);
  const rid=crypto.randomUUID();q('INSERT INTO account_requests(id,member_id,kind,note) VALUES(?,?,?,?)',rid,actor.id,input.kind,note);audit('account-'+input.kind+'-requested',rid);return {id:rid};
 }
 case 'WITHDRAW_ACCOUNT_REQUEST':case 'ACKNOWLEDGE_ACCOUNT_REQUEST':{
  const r=await db.prepare("SELECT * FROM account_requests WHERE id=? AND status='open'").bind(id(input.id)).first();if(!r)throw fail('This request is no longer open',409);
  const withdraw=input.type==='WITHDRAW_ACCOUNT_REQUEST';
  if(withdraw?r.member_id!==actor.id:!can(actor,'manage_members'))throw fail(withdraw?'Only the person who asked can withdraw this request':'Only an admin can acknowledge account requests',403);
  q("UPDATE account_requests SET status=?,resolved_at=CURRENT_TIMESTAMP,resolved_by=? WHERE id=? AND status='open'",withdraw?'withdrawn':'acknowledged',actor.id,r.id);audit('account-request-'+(withdraw?'withdrawn':'acknowledged'),r.id);return {id:r.id};
 }
 }
}
// Owner-private removed child records, archived items the actor may restore, and account requests.
export async function lifecycleState(db,actor){
 const out={removedDependents:rows(await db.prepare(`SELECT id,name,deleted_at FROM dependents WHERE guardian_id=? AND deleted_at IS NOT NULL AND deleted_at>=datetime('now','-${LIFECYCLE_POLICY.childRecordRestoreDays} days') ORDER BY deleted_at DESC`).bind(actor.id).all()).map(d=>({id:d.id,name:d.name,removedAt:d.deleted_at})),
  accountRequests:rows(await db.prepare('SELECT id,kind,note,status,created_at,resolved_at FROM account_requests WHERE member_id=? ORDER BY created_at DESC LIMIT 20').bind(actor.id).all()).map(r=>({id:r.id,kind:r.kind,note:r.note,status:r.status,createdAt:r.created_at,resolvedAt:r.resolved_at}))};
 const archived=rows(await db.prepare('SELECT * FROM memorials WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 100').bind().all());
 out.archivedMemorials=[];for(const m of archived)if(await memorialManager(db,actor,m))out.archivedMemorials.push({id:m.id,name:m.name,archivedAt:m.archived_at});
 out.archivedHouseholds=rows(await db.prepare('SELECT id,name,archived_at FROM households WHERE archived_at IS NOT NULL AND (founder_id=? OR ?=1) ORDER BY archived_at DESC LIMIT 100').bind(actor.id,can(actor,'manage_members')?1:0).all()).map(h=>({id:h.id,name:h.name,archivedAt:h.archived_at}));
 if(can(actor,'manage_members'))out.openAccountRequests=rows(await db.prepare("SELECT r.id,r.kind,r.note,r.created_at,u.name FROM account_requests r JOIN user u ON u.id=r.member_id WHERE r.status='open' ORDER BY r.created_at LIMIT 100").bind().all()).map(r=>({id:r.id,kind:r.kind,note:r.note,createdAt:r.created_at,name:r.name}));
 return out;
}
