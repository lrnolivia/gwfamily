import {UserError} from './family-service.mjs';
import {createRateStorage} from './auth.mjs';
import {invitationsEnabled} from './family-invitations.mjs';
import {familyInviteEmail,householdInviteEmail} from './transactional-email.mjs';
// What a person has sent, and revoke / safe resend for email invitations.
// Resend always revokes the old link before a new one-use token is created, so
// at most one live link exists per invitation; tokens are never stored or shown.
const rows=r=>r.results||[];
const RESEND_WAIT_MS=10*60*1000,WEEK=7*86400000;
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const ms=v=>typeof v==='number'?v:Date.parse(String(v).replace(' ','T')+(String(v).endsWith('Z')?'':'Z'));
function status(row,now){return row.accepted_at?'accepted':row.revoked_at?'revoked':row.expires_at<=now?'expired':'pending'}
export async function sentInvitations(db,actor){
 const now=Date.now();
 const family=rows(await db.prepare('SELECT id,recipient_email,expires_at,accepted_at,revoked_at,created_at FROM family_invitations WHERE sender_id=? AND COALESCE(reusable,0)=0 ORDER BY created_at DESC LIMIT 100').bind(actor.id).all()).map(r=>({kind:'family',id:r.id,email:r.recipient_email,status:status(r,now),createdAt:r.created_at,expiresAt:r.expires_at,canResend:status(r,now)!=='accepted'&&Boolean(r.recipient_email)&&now-r.created_at>=RESEND_WAIT_MS}));
 const household=rows(await db.prepare('SELECT i.id,i.recipient_email,i.expires_at,i.accepted_at,i.created_at,h.name,h.id AS household_id FROM household_email_invites i JOIN households h ON h.id=i.household_id WHERE i.sender_id=? ORDER BY i.created_at DESC LIMIT 100').bind(actor.id).all()).map(r=>{const created=ms(r.created_at),st=r.accepted_at?'accepted':r.expires_at<=now?'ended':'pending';return {kind:'household',id:r.id,email:r.recipient_email,householdId:r.household_id,householdName:r.name,status:st,createdAt:created,expiresAt:r.expires_at,canResend:st!=='accepted'&&now-created>=RESEND_WAIT_MS}});
 const requests=rows(await db.prepare("SELECT r.id,r.kind,r.household_id,r.recipient_id,r.created_at,h.name,u.name AS recipient_name FROM household_requests r JOIN households h ON h.id=r.household_id LEFT JOIN user u ON u.id=r.recipient_id WHERE r.requester_id=? AND r.status='pending' ORDER BY r.created_at DESC LIMIT 100").bind(actor.id).all()).map(r=>({kind:'household-request',id:r.id,requestKind:r.kind,householdId:r.household_id,householdName:r.name,recipientName:r.kind==='invite'?r.recipient_name:null,status:'pending',createdAt:ms(r.created_at)}));
 return {invitations:[...family,...household],requests};
}
// Blocks a second live email invitation to the same address from the same place.
export async function pendingDuplicate(db,{kind,senderId,email,householdId}){
 if(!email)return null;const now=Date.now();
 return kind==='family'?db.prepare('SELECT id FROM family_invitations WHERE sender_id=? AND recipient_email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? LIMIT 1').bind(senderId,email,now).first():db.prepare('SELECT id FROM household_email_invites WHERE household_id=? AND recipient_email=? AND accepted_at IS NULL AND expires_at>? LIMIT 1').bind(householdId,email,now).first();
}
async function own(db,actor,kind,id){
 if(!['family','household'].includes(kind)||typeof id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw new UserError('Invitation not found',404);
 const row=kind==='family'?await db.prepare('SELECT * FROM family_invitations WHERE id=? AND sender_id=? AND COALESCE(reusable,0)=0').bind(id,actor.id).first():await db.prepare('SELECT i.*,h.name FROM household_email_invites i JOIN households h ON h.id=i.household_id WHERE i.id=? AND i.sender_id=?').bind(id,actor.id).first();
 if(!row)throw new UserError('Invitation not found',404);if(row.accepted_at)throw new UserError('This invitation was already accepted',409);return row;
}
export async function revokeInvitation(db,actor,{kind,id}){
 const row=await own(db,actor,kind,id),now=Date.now();
 if(kind==='family')await db.prepare('UPDATE family_invitations SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND accepted_at IS NULL').bind(now,row.id).run();
 else await db.prepare('UPDATE household_email_invites SET expires_at=MIN(expires_at,?) WHERE id=? AND accepted_at IS NULL').bind(now-1,row.id).run();
 return {id:row.id,status:'revoked'};
}
export async function resendInvitation(env,actor,{kind,id}){
 const db=env.DB,row=await own(db,actor,kind,id),now=Date.now();
 if(!env.EMAIL)throw new UserError('Email delivery is not configured',503);
 if(kind==='family'&&!invitationsEnabled(env))throw new UserError('Family invitations are not enabled yet',403);
 if(!row.recipient_email)throw new UserError('Only email invitations can be resent',409);
 if(now-ms(row.created_at)<RESEND_WAIT_MS)throw new UserError('Please wait a few minutes before sending this invitation again',429);
 const rate=await createRateStorage(db).consume(`${kind}-invite:`+actor.id,{window:86400,max:10});if(!rate.allowed)throw new UserError('Please wait before creating more invitations',429);
 if(kind==='household'&&!await db.prepare("SELECT 1 FROM household_members hm JOIN members m ON m.id=hm.member_id WHERE hm.household_id=? AND hm.member_id=? AND hm.role='head' AND m.status='active'").bind(row.household_id,actor.id).first())throw new UserError('Only a head of this household can send its invitations',403);
 // The old link ends first; a live duplicate (for example a concurrent resend)
 // stops the insert, so one address never holds two live links from here.
 const secret=token(),next=crypto.randomUUID(),expires=now+WEEK,url=env.AUTH_ORIGIN+(kind==='family'?'/#/family-invite/':'/#/household-invite/')+secret;
 const statements=kind==='family'?[
  db.prepare('UPDATE family_invitations SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND accepted_at IS NULL').bind(now,row.id),
  db.prepare('INSERT INTO family_invitations(id,sender_id,recipient_email,token_hash,expires_at,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM family_invitations WHERE sender_id=? AND recipient_email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?)').bind(next,actor.id,row.recipient_email,await hash(secret),expires,now,actor.id,row.recipient_email,now)
 ]:[
  db.prepare('UPDATE household_email_invites SET expires_at=MIN(expires_at,?) WHERE id=? AND accepted_at IS NULL').bind(now-1,row.id),
  db.prepare('INSERT INTO household_email_invites(id,household_id,sender_id,recipient_email,token_hash,expires_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM household_email_invites WHERE household_id=? AND recipient_email=? AND accepted_at IS NULL AND expires_at>?)').bind(next,row.household_id,actor.id,row.recipient_email,await hash(secret),expires,row.household_id,row.recipient_email,now)
 ];
 await db.batch(statements);
 const created=kind==='family'?await db.prepare('SELECT id FROM family_invitations WHERE id=?').bind(next).first():await db.prepare('SELECT id FROM household_email_invites WHERE id=?').bind(next).first();
 if(!created)throw new UserError('This invitation changed. Refresh before resending.',409);
 const mail=kind==='family'?familyInviteEmail({url,origin:env.AUTH_ORIGIN}):householdInviteEmail({householdName:row.name,url,origin:env.AUTH_ORIGIN});
 try{await env.EMAIL.send({from:{email:'family@greenwhitefamily.com',name:'Green & White Family'},to:row.recipient_email,subject:mail.subject,text:mail.text,html:mail.html})}
 catch{await revokeInvitation(db,actor,{kind,id:next});throw new UserError('Email delivery could not be confirmed. The new invitation has been revoked.',502)}
 return {id:next,status:'pending',expiresAt:expires};
}
export function registerInvitationManagement(app){
 const run=fn=>async c=>{try{return c.json(await fn(c))}catch(error){if(error instanceof UserError)throw error;if(error.status)throw new UserError(error.message,error.status);throw error}};
 const body=async c=>{const v=await c.req.json();if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['kind','id','expectedAccountId'].includes(k)))throw new UserError('Unsupported fields');if(v.expectedAccountId!==c.get('actor').id)throw new UserError('Your sign-in changed. Reload before continuing.',409);return v};
 app.get('/api/invitations/sent',run(c=>sentInvitations(c.env.DB,c.get('actor'))));
 app.post('/api/invitations/revoke',run(async c=>revokeInvitation(c.env.DB,c.get('actor'),await body(c))));
 app.post('/api/invitations/resend',run(async c=>resendInvitation(c.env,c.get('actor'),await body(c))));
}
