import {requestDiagnosticContext} from './error-diagnostics.mjs';
import {UserError,json} from './family-service.mjs';
import {authEnvironment,authReady,createRateStorage} from './auth.mjs';
import {familyEmail} from './email-template.mjs';
const tokenPattern=/^[a-f0-9]{64}$/;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const invitationsEnabled=env=>env.FAMILY_INVITATIONS_ENABLED==='true';
export async function invitationFor(env,token,user){
 if(!invitationsEnabled(env))throw new UserError('Family invitations are not enabled yet',403);
 if(!tokenPattern.test(token||''))throw new UserError('This invitation is unavailable',404);
 const row=await env.DB.prepare(`SELECT i.* FROM family_invitations i JOIN members m ON m.id=i.sender_id JOIN user u ON u.id=m.id WHERE i.token_hash=? AND m.status='active' AND m.removed_at IS NULL AND u.emailVerified=1`).bind(await hash(token)).first();
 if(!row||row.revoked_at||row.expires_at<=Date.now()||row.accepted_by&&row.accepted_by!==user.id||row.recipient_email&&row.recipient_email!==user.email.toLowerCase())throw new UserError('This invitation is unavailable or belongs to another email address',404);
 return row;
}
export async function acceptFamilyInvitation(env,token,user){
 const member=await env.DB.prepare('SELECT m.status,m.removed_at,p.completed FROM members m LEFT JOIN profiles p ON p.member_id=m.id WHERE m.id=?').bind(user.id).first();
 if(!user.emailVerified||!member?.completed||!['active','pending'].includes(member.status)||member.removed_at)throw new UserError('Complete your profile before accepting this invitation',403);
 const invite=await invitationFor(env,token,user);
 if(invite.reusable===1){
  if(invite.sender_id===user.id)throw new UserError('This is your own invitation link',400);
  const receiptHash=await hash(token+':'+user.id);
  await env.DB.prepare(`INSERT INTO family_invitations(id,sender_id,token_hash,expires_at,created_at,accepted_by,accepted_at,reusable_parent_id) SELECT ?,i.sender_id,?,i.expires_at,?,?,?,i.id FROM family_invitations i JOIN members sender ON sender.id=i.sender_id JOIN user inviter ON inviter.id=sender.id JOIN members recipient ON recipient.id=? JOIN profiles p ON p.member_id=recipient.id JOIN user u ON u.id=recipient.id WHERE i.id=? AND i.reusable=1 AND i.revoked_at IS NULL AND sender.status='active' AND sender.removed_at IS NULL AND inviter.emailVerified=1 AND recipient.status IN('active','pending') AND recipient.removed_at IS NULL AND p.completed=1 AND u.emailVerified=1 ON CONFLICT(token_hash) DO NOTHING`).bind(crypto.randomUUID(),receiptHash,Date.now(),user.id,Date.now(),user.id,invite.id).run();
  const receipt=await env.DB.prepare('SELECT sender_id FROM family_invitations WHERE token_hash=? AND accepted_by=? AND reusable_parent_id=?').bind(receiptHash,user.id,invite.id).first();
  if(!receipt)throw new UserError('This invitation is no longer available',409);
  return {ok:true,invitedBy:receipt.sender_id,status:member.status};
 }
 const accepted=await env.DB.prepare(`UPDATE family_invitations SET accepted_by=?,accepted_at=COALESCE(accepted_at,?) WHERE id=? AND revoked_at IS NULL AND expires_at>? AND (accepted_by IS NULL OR accepted_by=?) AND EXISTS(SELECT 1 FROM members m JOIN user u ON u.id=m.id WHERE m.id=family_invitations.sender_id AND m.status='active' AND m.removed_at IS NULL AND u.emailVerified=1) AND EXISTS(SELECT 1 FROM members recipient JOIN profiles p ON p.member_id=recipient.id JOIN user u ON u.id=recipient.id WHERE recipient.id=? AND recipient.status IN('active','pending') AND recipient.removed_at IS NULL AND p.completed=1 AND u.emailVerified=1 AND (family_invitations.recipient_email IS NULL OR family_invitations.recipient_email=lower(u.email))) RETURNING sender_id`).bind(user.id,Date.now(),invite.id,Date.now(),user.id,user.id).first();
 if(!accepted)throw new UserError('This invitation is no longer available',409);
 return {ok:true,invitedBy:accepted.sender_id,status:member.status};
}
export async function provisionalAllowed(env,user,member){
 if(env.LAUNCH_PROVISIONAL_READ_ENABLED!=='true'||!user?.emailVerified||member?.status!=='pending'||member.removed_at)return false;
 const profile=await env.DB.prepare('SELECT completed FROM profiles WHERE member_id=?').bind(user.id).first();
 if(!profile?.completed)return false;
 return !await env.DB.prepare('SELECT id FROM family_invitations WHERE accepted_by=? LIMIT 1').bind(user.id).first();
}
export async function provisionalFeed(db){
 // Family-wide posts and shared memories only. Group posts, comments,
 // contact details, membership, roles and conversations are never serialized.
 const posts=(await db.prepare(`SELECT p.id,p.body,p.metadata_json,p.created_at,u.name FROM posts p JOIN user u ON u.id=p.author_id WHERE p.deleted_at IS NULL AND p.group_id IS NULL ORDER BY p.created_at DESC,p.id DESC LIMIT 50`).all()).results;
 const memories=(await db.prepare('SELECT id,data_json FROM memories WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 50').all()).results;
 const photos=files=>(Array.isArray(files)?files:[]).filter(f=>typeof f.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(f.id)&&/^image\//.test(f.type||'')).map(f=>({id:f.id,url:'/api/provisional/media/'+f.id,alt:typeof f.alt==='string'?f.alt.slice(0,240):''}));
 return {readOnly:true,posts:posts.map(p=>({id:p.id,text:p.body,createdAt:p.created_at,author:p.name,photos:photos(json(p.metadata_json).files)})),memories:memories.flatMap(m=>{const v=json(m.data_json),id=typeof v.image==='string'?v.image.match(/^\/api\/media\/([A-Za-z0-9_-]{1,100})$/)?.[1]:null;return id?[{id:m.id,title:String(v.title||''),photo:{id,url:'/api/provisional/media/'+id,alt:String(v.title||'Family memory')}}]:[]})};
}
export function registerInvitationEntry(app,authFactory){
 async function session(c){const env=authEnvironment(c.env);if(!authReady(env))throw new UserError('Sign-in is not configured',503);const s=await authFactory(env,requestDiagnosticContext(c,'auth.session.initial')).api.getSession({headers:c.req.raw.headers});if(!s?.user?.emailVerified)throw new UserError('Verify your email before continuing',401);c.set('diagnosticStage','request.handler');return {env,user:s.user}}
 app.post('/api/family-invitations/accept',async c=>{const {env,user}=await session(c);if(c.req.header('Origin')!==env.AUTH_ORIGIN)throw new UserError('Invalid request origin',403);const value=await c.req.json();if(value.expectedAccountId!==user.id)throw new UserError('Your sign-in changed. Reload before continuing.',409);return c.json(await acceptFamilyInvitation(env,value.token,user))});
 async function permit(c){const {env,user}=await session(c),member=await env.DB.prepare('SELECT status,removed_at FROM members WHERE id=?').bind(user.id).first();if(!await provisionalAllowed(env,user,member))throw new UserError('Read-only family access is not available',403);return env}
 app.get('/api/provisional/feed',async c=>{const env=await permit(c);return c.json(await provisionalFeed(env.DB))});
 app.get('/api/provisional/media/:id',async c=>{const env=await permit(c),id=c.req.param('id'),feed=await provisionalFeed(env.DB);if(![...feed.posts.flatMap(p=>p.photos),...feed.memories.map(m=>m.photo)].some(p=>p.id===id))throw new UserError('Photo not found',404);const row=await env.DB.prepare('SELECT object_key,mime_type,size_bytes FROM media WHERE id=? AND deleted_at IS NULL').bind(id).first();if(!row||!/^image\/(jpeg|png|webp|gif)$/.test(row.mime_type))throw new UserError('Photo not found',404);const object=await env.R2?.get(row.object_key);if(!object)throw new UserError('Photo not found',404);return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Length':String(row.size_bytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}})});
}
async function profileToken(env,row){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.BETTER_AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('gw:profile-invitation:'+row.sender_id+':'+row.id)))).map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function registerFamilyInvitations(app){
 app.get('/api/family-invitation-link',async c=>{
  if(!invitationsEnabled(c.env))throw new UserError('Family invitations are not enabled yet',403);
  const actor=c.get('actor'),row=await c.env.DB.prepare('SELECT * FROM family_invitations WHERE sender_id=? AND reusable=1 AND revoked_at IS NULL').bind(actor.id).first();
  if(!row)return c.json({url:null});const token=await profileToken(c.env,row);
  if(await hash(token)!==row.token_hash)throw new UserError('Create a new invitation link after the account security update',409);
  return c.json({url:c.env.AUTH_ORIGIN+'/#/family-invite/'+token,reusable:true});
 });
 app.post('/api/family-invitation-link',async c=>{
  if(!invitationsEnabled(c.env))throw new UserError('Family invitations are not enabled yet',403);
  const actor=c.get('actor'),value=await c.req.json();if(value.expectedAccountId!==actor.id)throw new UserError('Your sign-in changed. Reload before continuing.',409);
  const limit=await createRateStorage(c.env.DB).consume('family-profile-invite:'+actor.id,{window:86400,max:10});if(!limit.allowed)throw new UserError('Please wait before creating more invitations',429);
  let row=await c.env.DB.prepare('SELECT * FROM family_invitations WHERE sender_id=? AND reusable=1 AND revoked_at IS NULL').bind(actor.id).first();
  if(!row||value.reset===true){
   const next={id:crypto.randomUUID(),sender_id:actor.id},token=await profileToken(c.env,next),statements=[];
   if(row)statements.push(c.env.DB.prepare('UPDATE family_invitations SET revoked_at=? WHERE id=? AND sender_id=? AND reusable=1 AND revoked_at IS NULL').bind(Date.now(),row.id,actor.id));
   statements.push(c.env.DB.prepare('INSERT OR IGNORE INTO family_invitations(id,sender_id,token_hash,expires_at,created_at,reusable) VALUES(?,?,?,?,?,1)').bind(next.id,actor.id,await hash(token),253402300799000,Date.now()));
   await c.env.DB.batch(statements);row=await c.env.DB.prepare('SELECT * FROM family_invitations WHERE sender_id=? AND reusable=1 AND revoked_at IS NULL').bind(actor.id).first();
  }
  const token=await profileToken(c.env,row);if(await hash(token)!==row.token_hash)throw new UserError('Replace your invitation link after the account security update',409);
  return c.json({url:c.env.AUTH_ORIGIN+'/#/family-invite/'+token,reusable:true});
 });
 app.post('/api/family-invitations',async c=>{
  if(!invitationsEnabled(c.env))throw new UserError('Family invitations are not enabled yet',403);
  const actor=c.get('actor'),value=await c.req.json();if(value.expectedAccountId!==actor.id)throw new UserError('Your sign-in changed. Reload before continuing.',409);
  const email=String(value.email||'').trim().toLowerCase();if(email&&(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)))throw new UserError('Enter a valid email address');
  if(value.sendEmail===true&&(!email||!c.env.EMAIL))throw new UserError('Email invitations are not available',503);
  const limit=await createRateStorage(c.env.DB).consume('family-invite:'+actor.id,{window:86400,max:10});if(!limit.allowed)throw new UserError('Please wait before creating more invitations',429);
  const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),id=crypto.randomUUID(),now=Date.now(),expiresAt=now+7*86400000,url=c.env.AUTH_ORIGIN+'/#/family-invite/'+token;
  await c.env.DB.prepare('INSERT INTO family_invitations(id,sender_id,recipient_email,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)').bind(id,actor.id,email||null,await hash(token),expiresAt,now).run();
  if(value.sendEmail===true){try{await c.env.EMAIL.send({from:{email:'family@greenwhitefamily.com',name:'Green & White Family'},to:email,subject:'You’re invited to Green & White Family',text:`Join our family space: ${url}\nSign in${email?' with '+email:''}, complete your profile, and accept the invitation. An organizer still approves your membership. This link expires in seven days.`,html:familyEmail({title:'You’re invited.',preview:'Join your family on Green & White',body:`<p>A family member invited you to Green & White. Sign in, complete your profile, and accept the invitation. An organizer still approves membership.</p><p><a href="${escape(url)}">View invitation</a></p><p>This link expires in seven days.</p>`})})}catch{await c.env.DB.prepare('UPDATE family_invitations SET revoked_at=? WHERE id=?').bind(Date.now(),id).run();throw new UserError('Email delivery could not be confirmed. The invitation has been revoked.',502)}}
  return c.json({id,url,expiresAt,emailSent:value.sendEmail===true},201);
 });
}
