import {can} from './policy.mjs';

export const MEMBERSHIP_COMMANDS=new Set(['APPROVE_MEMBER','REMOVE_MEMBER','RESTORE_MEMBER']);
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const adminSql="EXISTS(SELECT 1 FROM members a JOIN user u ON u.id=a.id WHERE a.id=? AND a.status='active' AND a.removed_at IS NULL AND a.member_group IN ('family','loved_ones') AND u.emailVerified=1 AND EXISTS(SELECT 1 FROM json_each(a.roles_json) WHERE value='admin'))";
const snapshot=row=>({status:row.status,roles:JSON.parse(row.roles_json),canPost:row.can_post===1,isLeader:row.is_leader===1,removedAt:row.removed_at,removedBy:row.removed_by,revision:row.membership_revision});
const readReceipt=async(db,actor,input,fingerprint)=>{
 const row=await db.prepare('SELECT * FROM command_receipts WHERE member_id=? AND request_id=?').bind(actor.id,input.requestId).first();
 if(!row)return null;
 if(row.fingerprint!==fingerprint||row.operation!==input.type)fail('This request identifier was already used for different content',409);
 return JSON.parse(row.result_json);
};
// This command owns one atomic batch, including current actor authorization,
// current target state, the membership change, history, audit, and its receipt.
export async function membershipCommand(db,actor,input,fingerprint){
 if(!can(actor,'manage_members')||!await db.prepare(`SELECT 1 WHERE ${adminSql}`).bind(actor.id).first())fail('Only an active admin can manage membership',403);
 if(typeof input.id!=='string'||!input.id||input.id===actor.id)fail('Choose another membership to update');
 const lifecycle=input.type!=='APPROVE_MEMBER',pendingApproval=input.type==='APPROVE_MEMBER'&&input.expectedStatus==='pending';
 if(pendingApproval&&input.expectedAccountId!==actor.id)fail('Your signed-in account changed. Refresh before approving.',409);
 if(lifecycle&&(input.expectedAccountId!==actor.id||input.confirmedMemberId!==input.id))fail('Confirm the specific member using your current account',409);
 const prior=await readReceipt(db,actor,input,fingerprint);if(prior)return prior;
 const target=await db.prepare('SELECT * FROM members WHERE id=?').bind(input.id).first();if(!target)fail('Membership not found',404);
 if((lifecycle||pendingApproval)&&(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision!==target.membership_revision))fail('This membership changed. Close the review and open it again.',409);
 if(pendingApproval&&(target.status!=='pending'||target.removed_at))fail('This membership is no longer waiting for approval. Refresh the list.',409);
 if(pendingApproval&&(!Array.isArray(input.roles)||input.status!=='active'||input.canPost!==true||JSON.stringify([...new Set(input.roles||[])].sort())!==JSON.stringify(JSON.parse(target.roles_json).sort())))fail('Quick approval must preserve existing organizer roles.',409);
 let status,roles,canPost,isLeader,removedAt,removedBy,action;
 if(input.type==='REMOVE_MEMBER'){
  if(target.removed_at)fail('This membership has already been removed. Refresh to review it.',409);
  status='suspended';roles=[];canPost=0;isLeader=0;removedAt=new Date().toISOString();removedBy=actor.id;action='membership-removed';
 }else if(input.type==='RESTORE_MEMBER'){
  if(!target.removed_at)fail('Only a removed membership can be restored for review.',409);
  status='pending';roles=[];canPost=0;isLeader=0;removedAt=null;removedBy=null;action='membership-restored-for-review';
 }else{
  if(target.removed_at)fail('Restore this membership for review before approving access.',409);
  if(!['active','suspended'].includes(input.status))fail('Choose active or paused access');
  roles=Array.isArray(input.roles)?[...new Set(input.roles)]:[];
  if(roles.some(role=>!['admin','moderator','planner','treasurer'].includes(role)))fail('Check the selected roles');
  status=input.status;canPost=input.canPost===true?1:0;isLeader=target.is_leader;removedAt=null;removedBy=null;action='membership-'+status;
 }
 const result={ok:true,id:target.id,status:removedAt?'removed':status,membershipRevision:target.membership_revision+1};
 const next={...target,status,roles_json:JSON.stringify(roles),can_post:canPost,is_leader:isLeader,removed_at:removedAt,removed_by:removedBy,membership_revision:result.membershipRevision};
 const mutation=crypto.randomUUID();
 const statements=[
  db.prepare(`INSERT INTO membership_write_guards(id,valid) VALUES(?,${adminSql} AND EXISTS(SELECT 1 FROM members WHERE id=? AND membership_revision=? AND status=? AND roles_json=? AND can_post=? AND is_leader=? AND removed_at IS ?))`).bind(mutation,actor.id,target.id,target.membership_revision,target.status,target.roles_json,target.can_post,target.is_leader,target.removed_at),
  db.prepare('DELETE FROM membership_write_guards WHERE id=?').bind(mutation),
  db.prepare('UPDATE members SET status=?,roles_json=?,can_post=?,is_leader=?,removed_at=?,removed_by=?,membership_revision=membership_revision+1 WHERE id=?').bind(status,next.roles_json,canPost,isLeader,removedAt,removedBy,target.id),
  db.prepare('INSERT INTO membership_change_log(id,actor_id,member_id,action,before_json,after_json) VALUES(?,?,?,?,?,?)').bind(mutation,actor.id,target.id,action,JSON.stringify(snapshot(target)),JSON.stringify(snapshot(next))),
  db.prepare('INSERT INTO audit_log(id,actor_id,action,subject_id) VALUES(?,?,?,?)').bind(mutation,actor.id,action,target.id),
  db.prepare('INSERT INTO command_receipts(member_id,request_id,result_json,operation,fingerprint) VALUES(?,?,?,?,?)').bind(actor.id,input.requestId,JSON.stringify(result),input.type,fingerprint)
 ];
 try{await db.batch(statements)}catch(error){
  const completed=await readReceipt(db,actor,input,fingerprint);if(completed)return completed;
  if(String(error.message).includes('Keep at least one active admin'))fail('Keep at least one active admin. Approve another admin before changing this membership.',409);
  if(String(error.message).includes('membership_write_current'))fail('Your permissions or this membership changed. Close the review and refresh.',409);
  throw error;
 }
 return result;
}
