import {requestDiagnosticContext} from './error-diagnostics.mjs';
import {registerPhotoDiscussions,photoCommentsReferenceMedia} from './photo-discussions.mjs';
import {invitationsEnabled,provisionalAllowed,registerInvitationEntry,registerFamilyInvitations} from './family-invitations.mjs';
import {storedPhotoFrame} from './photo-framing.mjs';
import {resolveReunion as resolveReunionRecord} from './reunions.mjs';
const resolveReunion=(...args)=>resolveReunionRecord(...args).catch(e=>{if(e.status)throw new UserError(e.message,e.status);throw e});
import {canRehearseFirstLoad} from './first-load-policy.mjs';
import {registerPushRoutes} from './push-routes.mjs';
import {readCalendar} from './calendar.mjs';
import {registerNotifications} from './notification-routes.mjs';
import {registerPageContent,publishedPageReferencesMedia} from './page-content.mjs';
import {registerMessaging} from './messaging.mjs';
import {registerHouseholdInvites} from './household-invites.mjs';
import {adultOn} from './birthdays.mjs';
import {UserError,command,familyState,json,readPost,validDate} from './family-service.mjs';
import {authEnvironment,authReady,createRateStorage} from './auth.mjs';
import {publicAuthConfig} from './auth-providers.mjs';
import {can} from './policy.mjs';
export function registerPublic(app,authFactory){
 registerInvitationEntry(app,authFactory);
 app.get('/api/config',c=>{const e=authEnvironment(c.env);return c.json({...publicAuthConfig(e,authReady(e)),familyInvitations:invitationsEnabled(e),familyInvitationEmail:invitationsEnabled(e)&&Boolean(e.EMAIL)})});
 app.get('/api/session',async c=>{
  const e=authEnvironment(c.env);if(!authReady(e))return c.json({signedIn:false,configured:false,canRehearseFirstLoad:false});
  const session=await authFactory(e,requestDiagnosticContext(c,'auth.session.initial')).api.getSession({headers:c.req.raw.headers});if(!session)return c.json({signedIn:false,configured:true,canRehearseFirstLoad:false});
  if(!session.user.emailVerified)return c.json({signedIn:true,verified:false,status:'unverified',canRehearseFirstLoad:false});
  c.set('diagnosticStage','membership');const member=await e.DB.prepare('SELECT status,removed_at FROM members WHERE id=?').bind(session.user.id).first();
  return c.json({signedIn:true,verified:true,user:{id:session.user.id,name:session.user.name,email:session.user.email},status:member?.status||'new',membershipRemoved:Boolean(member?.removed_at),provisionalAccess:await provisionalAllowed(e,session.user,member),canRehearseFirstLoad:canRehearseFirstLoad(e,session,member)});
 });
 app.post('/api/enroll',async c=>{
  const e=authEnvironment(c.env);if(!authReady(e))throw new UserError('Sign-in is not configured',503);
  if(c.req.header('Origin')!==e.AUTH_ORIGIN)throw new UserError('Invalid request origin',403);
  const session=await authFactory(e,requestDiagnosticContext(c,'auth.session.initial')).api.getSession({headers:c.req.raw.headers});if(!session?.user.emailVerified)throw new UserError('Verify your email before joining',401);c.set('diagnosticStage','request.handler');
  const existing=await e.DB.prepare('SELECT removed_at FROM members WHERE id=?').bind(session.user.id).first();if(existing?.removed_at)throw new UserError('An admin must restore your removed membership for review.',403);
  const value=await c.req.json();if(typeof value.name!=='string'||!value.name.trim()||value.name.length>80||!validDate(value.birthday)||value.privacyAccepted!==true)throw new UserError('Enter your name and birthday, then confirm the privacy notice');
  if(value.birthdayCelebration===true&&!adultOn(value.birthday))throw new UserError('Public birthday celebrations are available for adult profiles only');
  const profileColor=/^#[0-9a-f]{6}$/i.test(value.profileColor||'')?value.profileColor:'#4f996c';
  const owner=Boolean(e.BOOTSTRAP_OWNER_EMAIL)&&e.BOOTSTRAP_OWNER_EMAIL.toLowerCase()===session.user.email.toLowerCase();
  await e.DB.batch([
   e.DB.prepare('INSERT OR IGNORE INTO members(id,status,roles_json,can_post,is_leader) VALUES(?,?,?,?,?)').bind(session.user.id,owner?'active':'pending',owner?'["admin","moderator","planner","treasurer"]':'[]',owner?1:0,owner?1:0),
   e.DB.prepare('UPDATE user SET name=?,updatedAt=? WHERE id=?').bind(value.name.trim(),Date.now(),session.user.id),
   e.DB.prepare('INSERT INTO profiles(member_id,birthday,completed,birthday_celebration,profile_color) VALUES(?,?,1,?,?) ON CONFLICT(member_id) DO UPDATE SET birthday=excluded.birthday,completed=1,birthday_celebration=excluded.birthday_celebration,profile_color=excluded.profile_color,updated_at=CURRENT_TIMESTAMP').bind(session.user.id,value.birthday,value.birthdayCelebration===true?1:0,profileColor)
  ]);
  c.set('diagnosticStage','membership');const member=await e.DB.prepare('SELECT status,removed_at FROM members WHERE id=?').bind(session.user.id).first();return c.json({status:member.status});
 });


 app.post('/api/onboarding/photo',async c=>{
  const e=authEnvironment(c.env);if(!authReady(e)||!e.R2)throw new UserError('Photo storage is not configured',503);
  if(c.req.header('Origin')!==e.AUTH_ORIGIN)throw new UserError('Invalid request origin',403);
  const session=await authFactory(e,requestDiagnosticContext(c,'auth.session.initial')).api.getSession({headers:c.req.raw.headers});if(!session?.user.emailVerified)throw new UserError('Sign in before adding a photo',401);
  c.set('diagnosticStage','membership');const member=await e.DB.prepare('SELECT status,removed_at FROM members WHERE id=?').bind(session.user.id).first();if(!member||!['active','pending'].includes(member.status))throw new UserError('Complete your details before adding a photo',403);
  const rate=await createRateStorage(e.DB).consume('onboarding-photo:'+session.user.id,{window:3600,max:6});if(!rate.allowed)throw new UserError('Photo upload limit reached. Try again later.',429);
  const form=await c.req.formData(),file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||!file.size||file.size>10*1024*1024||!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw new UserError('Choose a JPEG, PNG, WebP or GIF under 10 MB');
  const bytes=await file.arrayBuffer(),head=new Uint8Array(bytes,0,Math.min(16,bytes.byteLength)),sig=String.fromCharCode(...head);
  if(file.type==='image/png'&&!(head[0]===137&&sig.slice(1,4)==='PNG')||file.type==='image/jpeg'&&!(head[0]===255&&head[1]===216)||file.type==='image/gif'&&!sig.startsWith('GIF8')||file.type==='image/webp'&&!(sig.startsWith('RIFF')&&sig.slice(8,12)==='WEBP'))throw new UserError('The photo contents do not match its type');
  const id=crypto.randomUUID(),key=`family/${session.user.id}/${id}`,url='/api/media/'+id;await e.R2.put(key,bytes,{httpMetadata:{contentType:file.type}});
  try{await e.DB.batch([e.DB.prepare('INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes) VALUES(?,?,?,?,?,?)').bind(id,session.user.id,key,'Profile photo',file.type,file.size),e.DB.prepare('UPDATE user SET image=?,updatedAt=? WHERE id=?').bind(url,Date.now(),session.user.id)])}catch(error){await e.R2.delete(key);throw error}return c.json({url},201);
 });
}
export function registerFamily(app){registerPhotoDiscussions(app);registerPushRoutes(app);registerNotifications(app);registerHouseholdInvites(app);registerFamilyInvitations(app);registerMessaging(app);registerPageContent(app);
 app.get('/api/calendar',async c=>{try{return c.json(await readCalendar(c.env.DB,c.get('actor'),c.req.query('reunionId')))}catch(error){if(error.status)throw new UserError(error.message,error.status);throw error}});
 app.get('/api/state',async c=>c.json(await familyState(c.env.DB,c.get('actor'),c.req.query('reunionId'))));
 app.post('/api/commands',async c=>c.json(await command(c.env.DB,c.get('actor'),await c.req.json())));
 app.get('/api/directory',async c=>{
  const actor=c.get('actor'),rows=(await c.env.DB.prepare(`SELECT m.id,u.name,u.image,p.contact_json,p.photo_frame_json FROM members m JOIN user u ON u.id=m.id JOIN profiles p ON p.member_id=m.id WHERE m.status='active'`).bind().all()).results||[];
  const cards=rows.flatMap(m=>{const v=json(m.contact_json);if(!v.name)return [];const self=m.id===actor.id,allowed=self||(v.optIn===true&&(v.visibility==='All approved family members'||v.visibility==='Family leaders'&&actor.isLeader||v.visibility==='Selected family members'&&v.selectedIds?.includes(actor.id)));if(!allowed)return [];const {selectedIds,visibility,optIn,...card}=v;return [{memberId:m.id,...card,allowPhotoSave:v.allowPhotoSave!==false,photo:v.useProfile?m.image:v.photo,photoFrame:v.useProfile?storedPhotoFrame(m.photo_frame_json):storedPhotoFrame(v.photoFrame),name:card.name||m.name}]});return c.json({cards});
 });
 app.get('/api/manage',async c=>{
  const actor=c.get('actor');if(!can(actor,'manage_reunion')&&!can(actor,'manage_members')&&!can(actor,'confirm_fees'))throw new UserError('Planner permission required',403);
  const reunion=await resolveReunion(c.env.DB,c.req.query('reunionId'));
  const members=can(actor,'manage_members')?(await c.env.DB.prepare('SELECT m.id,m.status,m.roles_json,m.can_post,m.removed_at,m.membership_revision,u.name,u.email,(SELECT inviter.name FROM family_invitations i JOIN user inviter ON inviter.id=i.sender_id WHERE i.accepted_by=m.id ORDER BY i.accepted_at ASC LIMIT 1) AS invited_by_name FROM members m JOIN user u ON u.id=m.id ORDER BY m.created_at').bind().all()).results:[];
  const rsvps=can(actor,'manage_reunion')?(await c.env.DB.prepare('SELECT r.*,u.name FROM reunion_rsvps r JOIN user u ON u.id=r.member_id WHERE r.reunion_id=?').bind(reunion.id).all()).results:[];
  const claims=can(actor,'manage_reunion')?(await c.env.DB.prepare('SELECT c.*,u.name FROM shirt_claims c JOIN user u ON u.id=c.member_id WHERE c.reunion_id=? ORDER BY c.created_at DESC').bind(reunion.id).all()).results:[];
  const fees=can(actor,'confirm_fees')?(await c.env.DB.prepare('SELECT f.*,u.name FROM fee_reports f JOIN user u ON u.id=f.member_id WHERE f.reunion_id=? ORDER BY f.created_at DESC').bind(reunion.id).all()).results:[];
  const products=can(actor,'manage_reunion')?(await c.env.DB.prepare('SELECT * FROM products WHERE reunion_id=? AND deleted_at IS NULL ORDER BY name').bind(reunion.id).all()).results.map(p=>({...json(p.data_json),id:p.id,name:p.name,description:p.description,active:!!p.active})):[];return c.json({reunionId:reunion.id,members,rsvps,claims,fees,products});
 });
 app.post('/api/media',async c=>{
  const actor=c.get('actor'),db=c.env.DB,bucket=c.env.R2;if(!bucket)throw new UserError('Media storage is not configured',503);
  const rate=await createRateStorage(db).consume('upload:'+actor.id,{window:3600,max:30});if(!rate.allowed)throw new UserError('Upload limit reached. Please try again later.',429);
  const form=await c.req.formData(),file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||file.size===0||file.size>20*1024*1024)throw new UserError('Choose a file under 20 MB');
  const allowed=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav','application/pdf','text/plain'];if(!allowed.includes(file.type))throw new UserError('Use a supported photo, video, audio, PDF, or text file');
  const data=await file.arrayBuffer(),head=new Uint8Array(data,0,Math.min(16,data.byteLength)),sig=String.fromCharCode(...head);
  if(file.type==='image/png'&&!(head[0]===137&&sig.slice(1,4)==='PNG')||file.type==='image/jpeg'&&!(head[0]===255&&head[1]===216)||file.type==='image/gif'&&!sig.startsWith('GIF8')||file.type==='image/webp'&&!(sig.startsWith('RIFF')&&sig.slice(8,12)==='WEBP')||file.type==='application/pdf'&&!sig.startsWith('%PDF-'))throw new UserError('The file contents do not match its type');
  const id=crypto.randomUUID(),key=`family/${actor.id}/${id}`,name=String(file.name||'Attachment').replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,150);
  await bucket.put(key,data,{httpMetadata:{contentType:file.type}});
  try{await db.prepare('INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes) VALUES(?,?,?,?,?,?)').bind(id,actor.id,key,name,file.type,file.size).run()}catch(error){await bucket.delete(key);throw error}
  return c.json({id,url:'/api/media/'+id,name,type:file.type,size:file.size},201);
 });
 app.get('/api/media/:id',async c=>{
  const actor=c.get('actor'),db=c.env.DB,row=await db.prepare('SELECT * FROM media WHERE id=? AND deleted_at IS NULL').bind(c.req.param('id')).first();if(!row)throw new UserError('File not found',404);
  let allowed=row.owner_id===actor.id;
  if(!allowed){
   const posts=(await db.prepare(`SELECT p.* FROM posts p WHERE p.deleted_at IS NULL AND (p.group_id IS NULL OR EXISTS(SELECT 1 FROM family_group_members gm WHERE gm.group_id=p.group_id AND gm.member_id=?))`).bind(actor.id).all()).results;
   allowed=posts.some(p=>{const m=json(p.metadata_json);return [...(m.files||[]),...(m.backgroundMedia?[m.backgroundMedia]:[])].some(f=>f.id===row.id)});
   if(!allowed){const cs=(await db.prepare('SELECT c.files_json,p.id FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.deleted_at IS NULL AND p.deleted_at IS NULL').bind().all()).results;for(const x of cs){if(json(x.files_json,[]).some(f=>f.id===row.id)&&await readPost(db,actor,x.id)){allowed=true;break}}}
   if(!allowed)allowed=Boolean(await db.prepare("SELECT u.id FROM user u JOIN members m ON m.id=u.id WHERE u.image=? AND m.status='active'").bind('/api/media/'+row.id).first());
   if(!allowed){const memories=(await db.prepare('SELECT data_json FROM memories WHERE deleted_at IS NULL').bind().all()).results;allowed=memories.some(m=>json(m.data_json).image==='/api/media/'+row.id)}
   if(!allowed){const contacts=(await db.prepare("SELECT p.member_id,p.contact_json FROM profiles p JOIN members m ON m.id=p.member_id WHERE m.status='active'").bind().all()).results;allowed=contacts.some(p=>{const v=json(p.contact_json);return v.photo==='/api/media/'+row.id&&v.optIn===true&&(v.visibility==='All approved family members'||v.visibility==='Family leaders'&&actor.isLeader||v.visibility==='Selected family members'&&v.selectedIds?.includes(actor.id))})}
  }
  if(!allowed)allowed=!!await db.prepare('SELECT id FROM households WHERE photo_url=?').bind('/api/media/'+row.id).first();
  if(!allowed){const products=(await db.prepare('SELECT data_json FROM products WHERE active=1 AND deleted_at IS NULL').bind().all()).results;allowed=products.some(p=>json(p.data_json).photo==='/api/media/'+row.id)}
  if(!allowed)allowed=!!await db.prepare("SELECT id FROM memorials WHERE json_extract(profile_json,'$.photo')=?").bind('/api/media/'+row.id).first();
  if(!allowed)allowed=await publishedPageReferencesMedia(db,actor,row.id);
  if(!allowed)allowed=await photoCommentsReferenceMedia(db,actor,row.id);
  if(!allowed)throw new UserError('File not found',404);const object=await c.env.R2.get(row.object_key);if(!object)throw new UserError('File not found',404);
  const inline=/^(image\/(png|jpeg|gif|webp)|video\/|audio\/)/.test(row.mime_type);return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Length':String(row.size_bytes),'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Security-Policy':inline?"default-src 'none'; img-src 'self' data:; media-src 'self' blob:; style-src 'unsafe-inline'; sandbox allow-same-origin":"default-src 'none'; sandbox"}});
 });
}

