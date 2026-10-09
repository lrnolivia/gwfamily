import {UserError} from './family-service.mjs';
import {eligibleMemberSql,resourceAccessSql,followingSql} from './notification-policy.mjs';
import {emailAppearance,emailRuntimeReady,safeEmailCode,emailRetry} from './email-delivery-policy.mjs';
import {notificationEmail,announcementEmail} from './family-update-email.mjs';
const schemaReady=env=>env.EMAIL_SCHEMA_VERSION==='1';
const control=async env=>emailRuntimeReady(env)&&(await env.DB.prepare('SELECT enabled FROM email_notification_control WHERE id=1').first())?.enabled===1;
const guard=(actor,id)=>{if(id!==actor.id)throw new UserError('Your signed-in account changed. Refresh before trying again.',409)};
const serialize=(actor,row,ready)=>({accountId:actor.id,ready,enabled:!!row?.enabled,revision:row?.revision||0,appearance:{preset:row?.preset||'green',theme:row?.theme||'light',headingFont:row?.heading_font||'sans'}});
async function settings(env,actor){const row=schemaReady(env)?await env.DB.prepare('SELECT enabled,revision,preset,theme,heading_font FROM email_notification_preferences WHERE member_id=?').bind(actor.id).first():null;return serialize(actor,row,await control(env));}
export function registerEmailNotifications(app){
 app.get('/api/me/notification-email',async c=>c.json(await settings(c.env,c.get('actor'))));
 app.put('/api/me/notification-email',async c=>{
  const actor=c.get('actor'),value=await c.req.json();guard(actor,value?.expectedAccountId);
  if(!schemaReady(c.env)||value.enabled===true&&!await control(c.env))throw new UserError('Email updates are not activated.',503);
  if(!value||Object.keys(value).some(k=>!['expectedAccountId','enabled','appearance','revision'].includes(k))||typeof value.enabled!=='boolean'||!Number.isSafeInteger(value.revision)||value.revision<0)throw new UserError('Check your email notification choices.');
  let appearance;try{if(!value.appearance||Object.keys(value.appearance).some(k=>!['preset','theme','headingFont'].includes(k)))throw Error();appearance=emailAppearance(value.appearance)}catch{throw new UserError('Choose one of the eight GW email colors, a heading font and appearance.')}
  const before=await settings(c.env,actor);if(value.revision!==before.revision)throw new UserError('Email choices changed on another device. Refresh and try again.',409);
  const token=crypto.randomUUID(),now=Date.now();
  try{await c.env.DB.batch([
   c.env.DB.prepare(`INSERT INTO email_notification_preferences(member_id,enabled,preset,theme,heading_font,revision,generation,write_token,consented_at,updated_at)
    VALUES(?,?,?,?,?,1,1,?,?,?) ON CONFLICT(member_id) DO UPDATE SET enabled=excluded.enabled,preset=excluded.preset,theme=excluded.theme,heading_font=excluded.heading_font,revision=email_notification_preferences.revision+1,generation=email_notification_preferences.generation+CASE WHEN email_notification_preferences.enabled!=excluded.enabled THEN 1 ELSE 0 END,write_token=excluded.write_token,consented_at=CASE WHEN excluded.enabled=1 AND email_notification_preferences.enabled=0 THEN excluded.consented_at ELSE email_notification_preferences.consented_at END,updated_at=excluded.updated_at WHERE email_notification_preferences.revision=?`).bind(actor.id,value.enabled?1:0,appearance.preset,appearance.theme,appearance.headingFont,token,value.enabled?now:null,now,value.revision),
   c.env.DB.prepare(`INSERT INTO notification_setting_guards(token,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM email_notification_preferences WHERE member_id=? AND revision=? AND write_token=?) THEN 1 ELSE 0 END`).bind(token,actor.id,value.revision+1,token),
   c.env.DB.prepare('DELETE FROM notification_setting_guards WHERE token=?').bind(token)
  ])}catch(error){if(String(error.message).includes('valid=1'))throw new UserError('Email choices changed on another device. Refresh and try again.',409);throw error}
  return c.json(await settings(c.env,actor));
 });
}
const access=resourceAccessSql({kind:'n.resource_kind',id:'n.resource_id',container:'n.container_id',member:'n.recipient_id',revision:'e.resource_revision'});
const joined=`FROM email_notification_outbox o JOIN email_notification_preferences p ON p.member_id=o.member_id JOIN user u ON u.id=o.member_id JOIN notifications n ON n.id=o.notification_id JOIN notification_events e ON e.id=n.event_id LEFT JOIN notification_settings s ON s.member_id=n.recipient_id LEFT JOIN notification_preferences f ON f.member_id=n.recipient_id`;
const allowed=`p.enabled=1 AND p.generation=o.generation AND u.email=o.recipient_email AND EXISTS(SELECT 1 FROM members em WHERE em.id=o.member_id AND em.removed_at IS NULL) AND n.recipient_id=o.member_id AND n.read_at IS NULL AND n.dismissed_at IS NULL AND ${eligibleMemberSql('n.recipient_id')} AND (${access}) AND (e.expires_at IS NULL OR e.expires_at>CURRENT_TIMESTAMP) AND COALESCE(f.scope,'leaders')!='off' AND COALESCE(s.global_off,0)=0 AND COALESCE(json_extract(s.categories_json,'$.'||n.category),1)=1 AND (n.category!='following' OR ${followingSql('n.recipient_id','e.actor_id',"COALESCE(f.scope,'leaders')",'f.selected_ids_json')})`;
export async function claimEmail(db,now){
 const token=crypto.randomUUID();return db.prepare(`UPDATE email_notification_outbox SET state='leased',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM email_notification_outbox WHERE expires_at>? AND attempts<5 AND ((state='pending' AND next_at<=?) OR (state='leased' AND lease_until<=?)) ORDER BY next_at,id LIMIT 1) AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 RETURNING *`).bind(token,now+60000,now,now,now).first();
}
async function authorized(db,row,now){return db.prepare(`SELECT o.recipient_email,n.category,p.preset,p.theme,p.heading_font ${joined} WHERE o.id=? AND o.state='leased' AND o.lease_token=? AND o.lease_until>? AND o.expires_at>? AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND ${allowed}`).bind(row.id,row.lease_token,now,now).first();}
async function finish(db,row,state,code,now,nextAt=now){await db.prepare(`UPDATE email_notification_outbox SET state=?,next_at=?,last_code=?,accepted_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND state IN('leased','dispatching')`).bind(state,nextAt,code,state==='accepted'?now:null,row.id,row.lease_token).run();}
export async function drainEmailNotifications(env,{send=message=>env.EMAIL.send(message),now=()=>Date.now(),max=10}={}){
 if(!await control(env))return {attempted:0,disabled:true};const db=env.DB;let attempted=0;
 await db.batch([
  db.prepare("UPDATE email_notification_outbox SET state='unknown',last_code='unknown',lease_token=NULL,lease_until=NULL WHERE state='dispatching' AND lease_until<=?").bind(now()),
  db.prepare("UPDATE email_notification_outbox SET state='expired',lease_token=NULL,lease_until=NULL WHERE state IN('pending','leased') AND expires_at<=?").bind(now())
 ]);
 for(let i=0;i<Math.min(Math.max(0,max),20);i++){
  const row=await claimEmail(db,now());if(!row)break;
  const delivery=await authorized(db,row,now());if(!delivery){await finish(db,row,'cancelled','not-authorized',now());continue}
  const mail=(delivery.category==='announcements'?announcementEmail:notificationEmail)({title:delivery.category==='announcements'?'A family leader announcement.':'A new family update.',paragraphs:['There is a new update in your Green & White family space. Sign in to view the latest details.','You chose email updates in Notifications. Turning email off there cancels queued emails.'],action:{label:'Open family app',url:'https://greenwhitefamily.com/?gwNotice='+encodeURIComponent(row.notification_id)},appearance:{preset:delivery.preset,theme:delivery.theme,headingFont:delivery.heading_font}});
  const settingsURL='https://greenwhitefamily.com/#/notification-settings';
  const html=mail.html.replace('</body>',`<p style="text-align:center;font:14px Arial,sans-serif"><a href="${settingsURL}">Email notification settings</a></p></body>`),text=mail.text+'\n\nEmail notification settings: '+settingsURL;
  // Commit dispatch ownership with the same current policy before the external
  // call. A crash/unknown result never reclaims this dispatch for a second send.
  const marked=await db.prepare(`UPDATE email_notification_outbox SET state='dispatching' WHERE id=? AND state='leased' AND lease_token=? AND EXISTS(SELECT 1 ${joined} WHERE o.id=? AND o.lease_token=? AND o.lease_until>? AND o.expires_at>? AND (SELECT enabled FROM email_notification_control WHERE id=1)=1 AND ${allowed})`).bind(row.id,row.lease_token,row.id,row.lease_token,now(),now()).run();
  if(marked.meta.changes!==1){await finish(db,row,'cancelled','not-authorized',now());continue}
  let timer;try{
   attempted++;const result=await Promise.race([Promise.resolve().then(()=>send({from:{email:'family@greenwhitefamily.com',name:'Green & White Family'},to:delivery.recipient_email,subject:mail.subject,html,text,headers:{'Auto-Submitted':'auto-generated','List-Unsubscribe':'<'+settingsURL+'>'}})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Email result unavailable')),15000)})]);
   if(typeof result?.messageId!=='string'||!result.messageId)throw Error('Email acceptance unavailable');
   await finish(db,row,'accepted','accepted',now());
  }catch(error){const code=safeEmailCode(error),result=emailRetry(code,row.attempts,now(),row.expires_at);await finish(db,row,result.state,code,now(),result.nextAt);
   if(['E_SENDER_NOT_VERIFIED','E_SENDER_DOMAIN_NOT_AVAILABLE','E_RECIPIENT_NOT_ALLOWED'].includes(code)){await db.prepare('UPDATE email_notification_control SET enabled=0 WHERE id=1').run();break}
   if(code==='E_RECIPIENT_SUPPRESSED')await db.prepare('UPDATE email_notification_preferences SET enabled=0,generation=generation+1,revision=revision+1,updated_at=? WHERE member_id=?').bind(now(),row.member_id).run();
  }finally{clearTimeout(timer)}
 }
 return {attempted};
}
