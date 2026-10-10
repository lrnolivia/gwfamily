import {can} from './policy.mjs';
import {householdAdult} from './households.mjs';
// Founding-head succession. The founder offers the role to another adult in the
// household; an admin may start recovery only when the household has no active
// founder or no active head. Either way the named person must accept, and they
// must already belong to the household. Admins never become heads by recovery.
const rows=r=>r.results||[];
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const id=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(v))throw error('Choose a household member');return v};
const activeSql="EXISTS(SELECT 1 FROM members a WHERE a.id=? AND a.status='active' AND a.removed_at IS NULL)";
export const SUCCESSION_COMMANDS=new Set(['OFFER_HOUSEHOLD_FOUNDER','RECOVER_HOUSEHOLD','RESPOND_HOUSEHOLD_FOUNDER','CANCEL_HOUSEHOLD_FOUNDER']);
async function household(db,householdId){const h=await db.prepare('SELECT * FROM households WHERE id=?').bind(id(householdId)).first();if(!h)throw error('Household not found',404);return h}
// Why a household needs admin recovery, or null when its founder and heads are active.
export async function recoveryNeed(db,h){
 const founderActive=h.founder_id&&await db.prepare(`SELECT 1 WHERE ${activeSql}`).bind(h.founder_id).first();
 const founderMember=founderActive&&await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND member_id=?').bind(h.id,h.founder_id).first();
 const heads=(await db.prepare("SELECT count(*) n FROM household_members hm JOIN members m ON m.id=hm.member_id WHERE hm.household_id=? AND hm.role='head' AND m.status='active' AND m.removed_at IS NULL").bind(h.id).first()).n;
 return !founderActive||!founderMember?'founder-inactive':heads===0?'no-active-head':null;
}
const log=(db,h,actor,member,action,detail={})=>db.prepare('INSERT INTO household_role_log(id,household_id,actor_id,member_id,action,detail_json) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),h,actor,member,action,JSON.stringify(detail));
export async function successionCommand(db,actor,input,q,audit,sql){
 if(!SUCCESSION_COMMANDS.has(input.type))return null;
 if(input.type==='OFFER_HOUSEHOLD_FOUNDER'||input.type==='RECOVER_HOUSEHOLD'){
  const h=await household(db,input.householdId),target=id(input.memberId),recovery=input.type==='RECOVER_HOUSEHOLD';
  if(recovery){
   if(!can(actor,'manage_members'))throw error('Only an active admin can start household recovery',403);
   const need=await recoveryNeed(db,h);if(!need)throw error('This household has an active founding head. Ask them to hand it over instead.',409);
   if(typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.length>300)throw error('Say briefly why this household needs recovery');
  }else{
   if(h.founder_id!==actor.id||!await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND member_id=?').bind(h.id,actor.id).first())throw error('Only the founding head can hand over this household',403);
   if(target===actor.id)throw error('Choose another household member');
  }
  if(!await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND member_id=?').bind(h.id,target).first())throw error('Choose someone who already belongs to this household');
  await householdAdult(db,target);
  if(await db.prepare("SELECT 1 FROM household_founder_transfers WHERE household_id=? AND status='pending'").bind(h.id).first())throw error('A handover is already waiting for an answer',409);
  const tid=crypto.randomUUID();
  q('INSERT INTO household_founder_transfers(id,household_id,from_id,to_id,initiated_by,kind,reason) VALUES(?,?,?,?,?,?,?)',tid,h.id,h.founder_id||null,target,actor.id,recovery?'recovery':'transfer',recovery?input.reason.trim():'');
  sql.push(log(db,h.id,actor.id,target,recovery?'recovery-offered':'founder-offered',{transferId:tid,...(recovery?{reason:input.reason.trim(),need:await recoveryNeed(db,h)}:{})}));
  audit(recovery?'household-recovery-offered':'household-founder-offered',tid);return {id:tid};
 }
 const t=await db.prepare('SELECT * FROM household_founder_transfers WHERE id=?').bind(id(input.id)).first();
 if(!t||t.status!=='pending')throw error('This handover is no longer waiting',409);
 // The status guard makes a double answer or answer-after-cancel fail atomically.
 const guard=crypto.randomUUID();q("INSERT INTO notification_setting_guards(token,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM household_founder_transfers WHERE id=? AND status='pending') THEN 1 ELSE 0 END",guard,t.id);
 if(input.type==='CANCEL_HOUSEHOLD_FOUNDER'){
  if(t.initiated_by!==actor.id&&!(t.kind==='recovery'&&can(actor,'manage_members')))throw error('Only the person who started this handover can cancel it',403);
  q("UPDATE household_founder_transfers SET status='cancelled',resolved_at=CURRENT_TIMESTAMP WHERE id=?",t.id);sql.push(log(db,t.household_id,actor.id,t.to_id,'founder-cancelled',{transferId:t.id}));
 }else{
  if(t.to_id!==actor.id)throw error('Only the person named can answer this handover',403);
  if(typeof input.accept!=='boolean')throw error('Choose accept or decline');
  if(input.accept){
   await householdAdult(db,actor.id);
   if(!await db.prepare('SELECT 1 FROM household_members WHERE household_id=? AND member_id=?').bind(t.household_id,actor.id).first())throw error('You no longer belong to this household',409);
   // The founder must still be the one who offered; a stale offer cannot win.
   q("INSERT INTO notification_setting_guards(token,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM households WHERE id=? AND founder_id IS ?) THEN 1 ELSE 0 END",guard+'-founder',t.household_id,t.from_id);
   q('UPDATE households SET founder_id=? WHERE id=?',actor.id,t.household_id);
   q("UPDATE household_members SET role='head' WHERE household_id=? AND member_id=?",t.household_id,actor.id);
   q('DELETE FROM notification_setting_guards WHERE token=?',guard+'-founder');
  }
  q('UPDATE household_founder_transfers SET status=?,resolved_at=CURRENT_TIMESTAMP WHERE id=?',input.accept?'accepted':'declined',t.id);
  sql.push(log(db,t.household_id,actor.id,actor.id,input.accept?'founder-accepted':'founder-declined',{transferId:t.id,from:t.from_id,kind:t.kind}));
 }
 q('DELETE FROM notification_setting_guards WHERE token=?',guard);audit('household-founder-'+(input.type==='CANCEL_HOUSEHOLD_FOUNDER'?'cancelled':input.accept?'accepted':'declined'),t.id);
 return {id:t.id};
}
// Pending handovers this actor takes part in, and for admins which households need recovery.
export async function successionState(db,actor){
 const transfers=rows(await db.prepare("SELECT t.* FROM household_founder_transfers t WHERE t.status='pending' AND (t.to_id=? OR t.initiated_by=? OR t.from_id=? OR EXISTS(SELECT 1 FROM household_members hm WHERE hm.household_id=t.household_id AND hm.member_id=? AND hm.role='head'))").bind(actor.id,actor.id,actor.id,actor.id).all());
 const out={founderTransfers:transfers.map(t=>({id:t.id,householdId:t.household_id,fromId:t.from_id,toId:t.to_id,initiatedBy:t.initiated_by,kind:t.kind,reason:t.kind==='recovery'&&(t.to_id===actor.id||can(actor,'manage_members'))?t.reason:'',createdAt:t.created_at}))};
 if(can(actor,'manage_members')){const need=[];for(const h of rows(await db.prepare('SELECT * FROM households ORDER BY name').all())){const why=await recoveryNeed(db,h);if(why)need.push({householdId:h.id,reason:why})}out.householdRecovery=need}
 return out;
}
export function registerHouseholdSuccession(app){app.get('/api/households/:id/history',async c=>{try{return c.json({history:await householdHistory(c.env.DB,c.get('actor'),c.req.param('id'))})}catch(e){if(e.status)return c.json({error:e.message},e.status);throw e}})}
export async function householdHistory(db,actor,householdId){
 const h=await household(db,householdId);
 if(!can(actor,'manage_members')&&!await db.prepare("SELECT 1 FROM household_members WHERE household_id=? AND member_id=? AND role='head'").bind(h.id,actor.id).first())throw error('Only this household’s heads or an admin can see its history',403);
 return rows(await db.prepare('SELECT action,actor_id,member_id,detail_json,created_at FROM household_role_log WHERE household_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100').bind(h.id).all()).map(r=>({action:r.action,actorId:r.actor_id,memberId:r.member_id,detail:JSON.parse(r.detail_json),createdAt:r.created_at}));
}
