import {UserError} from './family-service.mjs';
import {runtimeReady,pushStorageReady} from './push-runtime.mjs';
import {registerDevice,revokeDevice} from './push-store.mjs';
const guard=(actor,id)=>{if(id!==actor.id)throw new UserError('Your signed-in account changed. Refresh before trying again.',409)};
export function registerPushRoutes(app){
 app.get('/api/me/push',async c=>{
  const actor=c.get('actor');if(!pushStorageReady(c.env))return c.json({accountId:actor.id,ready:false,pushEnabled:false,devices:[],reason:'activation-required'});
  const devices=await c.env.DB.prepare('SELECT id,label,confirmed_at AS confirmedAt FROM push_devices WHERE member_id=? AND session_id=? AND revoked_at IS NULL LIMIT 10').bind(actor.id,c.get('sessionId')).all();
  const ready=runtimeReady(c.env);return c.json({accountId:actor.id,ready,pushEnabled:ready&&devices.results.length>0,devices:devices.results,...(ready?{publicKey:c.env.PUSH_VAPID_PUBLIC_KEY,keyVersion:c.env.PUSH_KEY_VERSION}:{reason:'activation-required'})});
 });
 app.post('/api/me/push/devices',async c=>{
  const actor=c.get('actor'),value=await c.req.json();guard(actor,value?.expectedAccountId);
  if(!runtimeReady(c.env))throw new UserError('Device push is not activated.',503);
  if(!value||Object.keys(value).some(k=>!['expectedAccountId','subscription','keyVersion'].includes(k))||value.keyVersion!==c.env.PUSH_KEY_VERSION)throw new UserError('Refresh device push setup.',400);
  const sessionId=c.get('sessionId');if(!sessionId)throw new UserError('Sign in again before setting up push.',401);
  const bucket=Math.floor(Date.now()/600000);
  const rate=await c.env.DB.prepare(`INSERT INTO push_registration_limits(member_id,bucket,attempts) VALUES(?,?,1) ON CONFLICT(member_id) DO UPDATE SET bucket=excluded.bucket,attempts=CASE WHEN push_registration_limits.bucket=excluded.bucket THEN push_registration_limits.attempts+1 ELSE 1 END RETURNING attempts`).bind(actor.id,bucket).first();
  if(rate.attempts>5)throw new UserError('Wait a few minutes before trying device setup again.',429);
  try{return c.json(await registerDevice(c.env.DB,actor,sessionId,value.expectedAccountId,value.subscription,c.env.PUSH_KEY_VERSION),201)}catch{throw new UserError('Device setup could not be saved. Check your account and notification choices.',400)}
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
