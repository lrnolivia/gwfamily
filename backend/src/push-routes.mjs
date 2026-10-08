import {UserError} from './family-service.mjs';
import {runtimeReady,pushStorageReady,createPushSender} from './push-runtime.mjs';
import {validateSubscription} from './push-policy.mjs';
import {registerDevice,revokeDevice} from './push-store.mjs';
const guard=(actor,id)=>{if(id!==actor.id)throw new UserError('Your signed-in account changed. Refresh before trying again.',409)};
async function enabled(env){return runtimeReady(env)&&(await env.DB.prepare('SELECT enabled FROM push_control WHERE id=1').first())?.enabled===1}
async function rateLimit(db,memberId){
 const bucket=Math.floor(Date.now()/600000);
 const rate=await db.prepare(`INSERT INTO push_registration_limits(member_id,bucket,attempts) VALUES(?,?,1) ON CONFLICT(member_id) DO UPDATE SET bucket=excluded.bucket,attempts=CASE WHEN push_registration_limits.bucket=excluded.bucket THEN push_registration_limits.attempts+1 ELSE 1 END RETURNING attempts`).bind(memberId,bucket).first();
 if(rate.attempts>5)throw new UserError('Wait a few minutes before trying device setup again.',429);
}
export function registerPushRoutes(app,{sender=createPushSender}={}){
 app.get('/api/me/push',async c=>{
  const actor=c.get('actor');if(!pushStorageReady(c.env))return c.json({accountId:actor.id,ready:false,pushEnabled:false,devices:[],reason:'activation-required'});
  const devices=await c.env.DB.prepare('SELECT id,label,confirmed_at AS confirmedAt FROM push_devices WHERE member_id=? AND session_id=? AND revoked_at IS NULL LIMIT 10').bind(actor.id,c.get('sessionId')).all();
  const ready=await enabled(c.env);return c.json({accountId:actor.id,ready,pushEnabled:ready&&devices.results.length>0,devices:devices.results,...(ready?{publicKey:c.env.PUSH_VAPID_PUBLIC_KEY,keyVersion:c.env.PUSH_KEY_VERSION}:{reason:'activation-required'})});
 });
 app.post('/api/me/push/devices',async c=>{
  const actor=c.get('actor'),value=await c.req.json();guard(actor,value?.expectedAccountId);
  if(!await enabled(c.env))throw new UserError('Device push is not activated.',503);
  if(!value||Object.keys(value).some(k=>!['expectedAccountId','subscription','keyVersion'].includes(k))||value.keyVersion!==c.env.PUSH_KEY_VERSION)throw new UserError('Refresh device push setup.',400);
  const sessionId=c.get('sessionId');if(!sessionId)throw new UserError('Sign in again before setting up push.',401);
  try{validateSubscription(value.subscription)}catch{throw new UserError('Device subscription is invalid.',400)}
  await rateLimit(c.env.DB,actor.id);
  try{return c.json(await registerDevice(c.env.DB,actor,sessionId,value.expectedAccountId,value.subscription,c.env.PUSH_KEY_VERSION),201)}catch(error){if(error.message==='Device registration unavailable')throw new UserError('Device setup could not be saved. Check your account and notification choices.',400);throw error}

 });
 app.post('/api/me/push/devices/:id/test',async c=>{
  const actor=c.get('actor'),value=await c.req.json();guard(actor,value?.expectedAccountId);
  if(!await enabled(c.env))throw new UserError('Device push is not activated.',503);
  const device=await c.env.DB.prepare(`SELECT d.endpoint,d.p256dh,d.auth,d.key_version FROM push_devices d JOIN session s ON s.id=d.session_id AND s.userId=d.member_id WHERE d.id=? AND d.member_id=? AND d.session_id=? AND d.revoked_at IS NULL AND s.expiresAt>?`).bind(c.req.param('id'),actor.id,c.get('sessionId'),Date.now()).first();
  if(!device)throw new UserError('Enable push on this device first.',404);
  await rateLimit(c.env.DB,actor.id);
  const result=await sender(c.env)({subscription:{endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}},keyVersion:device.key_version,payload:{v:1,test:true,expiresAt:Date.now()+60000},ttl:60});
  if(result.status<200||result.status>=300)throw new UserError('The push provider did not accept the test. Try enabling this device again.',503);
  return c.json({accountId:actor.id,accepted:true});
 });
 app.delete('/api/me/push/devices/:id',async c=>{
  const actor=c.get('actor'),value=await c.req.json();guard(actor,value?.expectedAccountId);
  if(!pushStorageReady(c.env))return c.json({accountId:actor.id,ok:true,disabled:true});
  return c.json({accountId:actor.id,...await revokeDevice(c.env.DB,actor,actor.id,c.req.param('id'))});
 });
 app.post('/api/me/push/revoke-session',async c=>{
  const actor=c.get('actor'),value=await c.req.json();guard(actor,value?.expectedAccountId);
  if(pushStorageReady(c.env))await revokePushSession(c.env.DB,actor.id,c.get('sessionId'));
  return c.json({accountId:actor.id,ok:true});
 });
}
export async function revokePushSession(db,memberId,sessionId){
 if(!sessionId)return;
 await db.batch([
 db.prepare('UPDATE push_devices SET revoked_at=?,generation=generation+1 WHERE member_id=? AND session_id=? AND revoked_at IS NULL').bind(Date.now(),memberId,sessionId),
 db.prepare("UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE device_id IN(SELECT id FROM push_devices WHERE member_id=? AND session_id=?) AND state IN('pending','leased')").bind(memberId,sessionId)
 ]);
}
