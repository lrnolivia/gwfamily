import {eligibleMemberSql,resourceAccessSql,followingSql} from './notification-policy.mjs';
import {assertAccount,validateSubscription,genericPayload,retryOutcome} from './push-policy.mjs';
const access=resourceAccessSql({kind:'n.resource_kind',id:'n.resource_id',container:'n.container_id',member:'n.recipient_id',revision:'e.resource_revision'});
const allowed=`d.revoked_at IS NULL AND d.generation=o.generation AND ss.userId=d.member_id AND ss.expiresAt>? AND n.recipient_id=d.member_id AND n.read_at IS NULL AND n.dismissed_at IS NULL AND ${eligibleMemberSql('n.recipient_id')} AND (${access}) AND (e.expires_at IS NULL OR e.expires_at>CURRENT_TIMESTAMP) AND COALESCE(p.scope,'leaders')!='off' AND COALESCE(s.global_off,0)=0 AND COALESCE(json_extract(s.categories_json,'$.'||n.category),1)=1 AND COALESCE(json_extract(s.channels_json,'$.'||n.category||'.push'),1)=1 AND (n.category!='following' OR ${followingSql('n.recipient_id','e.actor_id',"COALESCE(p.scope,'leaders')",'p.selected_ids_json')})`;
const joined=`FROM push_outbox o JOIN push_devices d ON d.id=o.device_id JOIN session ss ON ss.id=d.session_id JOIN notifications n ON n.id=o.notification_id JOIN notification_events e ON e.id=n.event_id LEFT JOIN notification_settings s ON s.member_id=n.recipient_id LEFT JOIN notification_preferences p ON p.member_id=n.recipient_id`;
// These internal primitives are not registered as routes. Call only after normal
// auth/verified membership/same-Origin/CSRF gates, explicit device opt-in and readiness.
export async function registerDevice(db,actor,sessionId,expectedAccountId,input,keyVersion,now=Date.now()){
 assertAccount(actor,expectedAccountId);const sub=validateSubscription(input);
 if(typeof keyVersion!=='string'||!/^[a-zA-Z0-9_-]{1,32}$/.test(keyVersion))throw new Error('Invalid key version');
 const id=crypto.randomUUID();
 // Endpoint reassignment rotates ID; ON DELETE CASCADE discards old pending deliveries.
 // Recipient ownership is derived only from the authenticated actor and session.
 const result=await db.batch([
  db.prepare(`DELETE FROM push_devices WHERE endpoint=? AND EXISTS(SELECT 1 FROM session WHERE id=? AND userId=? AND expiresAt>?)`).bind(sub.endpoint,sessionId,actor.id,now),
  db.prepare(`INSERT INTO push_devices(id,member_id,session_id,endpoint,p256dh,auth,key_version,created_at,confirmed_at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM session WHERE id=? AND userId=? AND expiresAt>?) AND ${eligibleMemberSql('?')} AND COALESCE((SELECT global_off FROM notification_settings WHERE member_id=?),0)=0 AND COALESCE((SELECT scope FROM notification_preferences WHERE member_id=?),'leaders')!='off' AND (SELECT count(*) FROM push_devices WHERE member_id=? AND revoked_at IS NULL)<10`).bind(id,actor.id,sessionId,sub.endpoint,sub.keys.p256dh,sub.keys.auth,keyVersion,now,now,sessionId,actor.id,now,actor.id,actor.id,actor.id,actor.id)
,
  db.prepare('INSERT INTO notification_setting_guards(token,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM push_devices WHERE id=?) THEN 1 ELSE 0 END').bind(id,id),
  db.prepare('DELETE FROM notification_setting_guards WHERE token=?').bind(id)
 ]);
 if(result[1].meta.changes!==1)throw new Error('Device registration unavailable');return {id,accountId:actor.id};
}
export async function revokeDevice(db,actor,expectedAccountId,id,now=Date.now()){
 assertAccount(actor,expectedAccountId);
 await db.batch([
  db.prepare('UPDATE push_devices SET revoked_at=?,generation=generation+1 WHERE id=? AND member_id=? AND revoked_at IS NULL').bind(now,id,actor.id),
  db.prepare("UPDATE push_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE device_id IN(SELECT id FROM push_devices WHERE id=? AND member_id=?) AND state IN('pending','leased')").bind(id,actor.id)
 ]);return {ok:true};
}
export async function claimDelivery(db,now=Date.now()){
 const token=crypto.randomUUID();
 return db.prepare(`UPDATE push_outbox SET state='leased',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM push_outbox WHERE expires_at>? AND attempts<8 AND ((state='pending' AND next_at<=?) OR (state='leased' AND lease_until<=?)) ORDER BY next_at,id LIMIT 1) AND (SELECT enabled FROM push_control WHERE id=1)=1 RETURNING *`).bind(token,now+60000,now,now,now).first();
}
export async function authorizedDelivery(db,row,now){
 return db.prepare(`SELECT d.endpoint,d.p256dh,d.auth,d.key_version,o.notification_id ${joined} WHERE o.id=? AND o.state='leased' AND o.lease_token=? AND o.lease_until>? AND o.expires_at>? AND (SELECT enabled FROM push_control WHERE id=1)=1 AND ${allowed}`).bind(row.id,row.lease_token,now,now,now).first();
}
export async function finishDelivery(db,row,result,now){
 const statements=[];
 if(result.revoke)statements.push(db.prepare('UPDATE push_devices SET revoked_at=?,generation=generation+1 WHERE id=? AND generation=?').bind(now,row.device_id,row.generation));
 if(result.halt)statements.push(db.prepare('UPDATE push_control SET enabled=0 WHERE id=1'));
 statements.push(db.prepare(`UPDATE push_outbox SET state=?,next_at=?,last_status=?,accepted_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND state='leased'`).bind(result.state,result.nextAt??now,result.status,result.state==='accepted'?now:null,row.id,row.lease_token));
 await db.batch(statements);
}
// Strictly injected transport; no crypto, credentials, fetch or provider integration.
// Production caller must retain compile-time + deployment + DB readiness gates.
export async function drainWithInjectedSender(db,{sender,now=()=>Date.now(),max=20,jitter=()=>0.5}){
 if(typeof sender!=='function')return {attempted:0};let attempted=0;
 await db.prepare("UPDATE push_outbox SET state='expired',lease_token=NULL,lease_until=NULL WHERE state IN('pending','leased') AND expires_at<=?").bind(now()).run();
 for(let i=0;i<Math.min(max,100);i++){
  const row=await claimDelivery(db,now());if(!row)break;
  const delivery=await authorizedDelivery(db,row,now());
  if(!delivery){await finishDelivery(db,row,{state:'cancelled',status:'not-authorized'},now());continue}
  let response;try{attempted++;response=await sender({subscription:{endpoint:delivery.endpoint,keys:{p256dh:delivery.p256dh,auth:delivery.auth}},keyVersion:delivery.key_version,payload:genericPayload(delivery.notification_id,row.expires_at),ttl:Math.max(1,Math.floor((row.expires_at-now())/1000)),timeoutMs:10000})}catch{response={status:0}}
  const result=retryOutcome(response.status,row.attempts,now(),row.expires_at,response.retryAfter,jitter());await finishDelivery(db,row,result,now());if(result.halt)break;
 }return {attempted};
}
