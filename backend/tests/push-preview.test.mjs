import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {createApp} from '../src/worker.mjs';
import {registerDevice,claimDelivery,authorizedDelivery,drainWithInjectedSender} from '../src/push-store.mjs';
import {deliveryPayload} from '../src/push-policy.mjs';
const subscription={endpoint:'https://web.push.apple.com/fictional-offline-only',keys:{p256dh:Buffer.from([4,...Array(64).fill(0)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}};
const readyConfig={PUSH_ENABLED:'true',PUSH_SCHEMA_VERSION:'1',PUSH_KEY_VERSION:'fixture-v1',PUSH_SUBJECT:'mailto:fictional@example.test',PUSH_VAPID_PUBLIC_KEY:subscription.keys.p256dh,PUSH_VAPID_PRIVATE_KEY:Buffer.alloc(32).toString('base64url')};
async function setup(){
 const x=database();seed(x.sqlite);x.sqlite.exec("INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('fixture-session',9999999999999,'fixture-unused-token',0,0,'bob');UPDATE push_control SET enabled=1;INSERT INTO conversations(id,type,name,owner_id) VALUES('fixture-conversation','direct','','alice');INSERT INTO conversation_members(conversation_id,member_id,status) VALUES('fixture-conversation','alice','active'),('fixture-conversation','bob','active');DELETE FROM notifications;DELETE FROM notification_events;");
 const env={...readyConfig,DB:x.DB,BETTER_AUTH_SECRET:'fictional-unused',AUTH_ORIGIN:'https://fictional.example.test'};
 const app=createApp(()=>({api:{getSession:async({headers})=>headers.get('x-fictional-user')?{user:{id:headers.get('x-fictional-user'),emailVerified:true},session:{id:headers.get('x-fictional-session')||'fixture-session'}}:null}}));
 const device=await registerDevice(x.DB,{id:'bob'},'fixture-session','bob',subscription,'fixture-v1');
 const call=(path,body,extra={})=>app.request(env.AUTH_ORIGIN+path,{method:body?'PUT':'GET',headers:{Origin:env.AUTH_ORIGIN,'x-fictional-user':'bob','Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})},env);
 const choose=(enabled,revision=0,extra={})=>call('/api/me/push/devices/'+device.id+'/preview',{expectedAccountId:'bob',enabled,revision},extra);
 return {...x,env,device,call,choose};
}
function message(x,id='fixture-message',body='Hello from our fictional family'){x.sqlite.prepare("INSERT INTO messages(id,conversation_id,author_id,body,sequence) VALUES(?,'fixture-conversation','alice',?,COALESCE((SELECT MAX(sequence) FROM messages WHERE conversation_id='fixture-conversation'),0)+1)").run(id,body)}
test('migration preserves every existing device as generic and never creates outbox work',()=>{
 let before,schemaBefore,schemaAfter;const x=database({beforeMigration(file,db){if(file>'0026_push_message_previews.sql'&&schemaBefore&&schemaAfter===undefined)schemaAfter=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name!='push_devices' AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();if(!file.startsWith('0026_'))return;seed(db);db.exec("INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('old-session',9999999999999,'fixture-unused',0,0,'bob');INSERT INTO push_devices(id,member_id,session_id,endpoint,p256dh,auth,key_version,created_at,confirmed_at) VALUES('old-device','bob','old-session','https://web.push.apple.com/fictional-old','','','old-key',10,20)");before=db.prepare('SELECT * FROM push_devices').get();schemaBefore=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name!='push_devices' AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all()}});
 const device=x.sqlite.prepare('SELECT * FROM push_devices').get();for(const [key,value]of Object.entries(before))assert.equal(device[key],value);assert.equal(device.preview_enabled,0);assert.equal(device.preview_revision,0);assert.equal(device.preview_confirmed_at,null);// Compare exactly at the 0026 boundary; later additive migrations carry their own coverage.
 schemaAfter??=x.sqlite.prepare("SELECT type,name,sql FROM sqlite_master WHERE name!='push_devices' AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();assert.deepEqual(schemaAfter,schemaBefore);assert.equal(x.sqlite.prepare('SELECT enabled FROM push_control WHERE id=1').get().enabled,0);assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM push_outbox').get().n,0);
});
test('generic chat copy contains no sender or message content before explicit consent',async()=>{
 const x=await setup();message(x);const row=await claimDelivery(x.DB),delivery=await authorizedDelivery(x.DB,row,Date.now()),payload=deliveryPayload(delivery,row.expires_at);
 assert.equal(payload.title,'New message');assert.equal(payload.preview,undefined);assert.equal(delivery.preview_sender,null);assert.equal(delivery.preview_text,null);assert.doesNotMatch(JSON.stringify(payload),/Alice|fictional family|fixture-conversation/);
});
test('opt-in returns confirmed per-device state and only later messages get exact sender and bounded preview',async()=>{
 const x=await setup();message(x,'fixture-before','Old queued private text');assert.equal((await x.choose(true)).status,200);message(x,'fixture-after','Newest fictional text');
 const payloads=[];await drainWithInjectedSender(x.DB,{sender:async({payload,authorize})=>{assert.equal(await authorize(),true);payloads.push(payload);return {status:201}}});
 assert.equal(payloads.length,2);const byMessage=new Map(x.sqlite.prepare("SELECT n.id,json_extract(e.data_json,'$.messageId') AS mid FROM notifications n JOIN notification_events e ON e.id=n.event_id WHERE n.recipient_id='bob'").all().map(row=>[row.id,row.mid]));assert.equal(payloads.find(p=>byMessage.get(p.noticeId)==='fixture-before').preview,undefined);assert.deepEqual(payloads.find(p=>byMessage.get(p.noticeId)==='fixture-after').preview,{consent:true,sender:'Alice',text:'Newest fictional text'});
 const status=await(await x.call('/api/me/push')).json();assert.equal(status.devices[0].previewEnabled,true);assert.equal(status.devices[0].previewRevision,1);assert.equal(status.devices[0].endpoint,undefined);assert.equal(status.devices[0].auth,undefined);
});
test('attachment-only previews use generic attachment wording instead of exposing file names',async()=>{
 const x=await setup();await x.choose(true);message(x,'fixture-attachment','private-finances.pdf');x.sqlite.exec("UPDATE messages SET attachment_only=1 WHERE id='fixture-attachment'");
 const row=await claimDelivery(x.DB),payload=deliveryPayload(await authorizedDelivery(x.DB,row,Date.now()),row.expires_at);assert.equal(payload.preview.text,'Sent an attachment');assert.doesNotMatch(JSON.stringify(payload),/private-finances/);
});
test('turning previews off hides already queued content and stale On cannot override it',async()=>{
 const x=await setup();await x.choose(true);message(x);assert.equal((await x.choose(false,1)).status,200);assert.equal((await x.choose(true,1)).status,409);
 const row=await claimDelivery(x.DB),payload=deliveryPayload(await authorizedDelivery(x.DB,row,Date.now()),row.expires_at);assert.equal(payload.preview,undefined);assert.equal(x.sqlite.prepare('SELECT preview_enabled FROM push_devices').get().preview_enabled,0);
});
test('preview settings reject cross-account, cross-session, foreign-origin, expired and stale requests',async()=>{
 const x=await setup();for(const [extra,status]of [[{'x-fictional-user':'alice'},409],[{'x-fictional-session':'other-session'},409],[{Origin:'https://foreign.example.test'},403],[{'x-fictional-user':''},401]])assert.equal((await x.choose(true,0,extra)).status,status);
 assert.equal((await x.choose('yes')).status,400);assert.equal((await x.choose(true,-1)).status,400);assert.equal((await x.choose(true,4)).status,409);
 x.sqlite.exec('UPDATE session SET expiresAt=0');assert.equal((await x.choose(true)).status,409);assert.equal(x.sqlite.prepare('SELECT preview_enabled FROM push_devices').get().preview_enabled,0);
});
test('changing preview choice does not enroll, test-send or turn on any notification channel',async()=>{
 const x=await setup();x.sqlite.exec("INSERT INTO notification_settings(member_id,channels_json) VALUES('bob','{\"messages\":{\"push\":false}}')");const before=x.sqlite.prepare('SELECT * FROM notification_settings').get();await x.choose(true);assert.deepEqual(x.sqlite.prepare('SELECT * FROM notification_settings').get(),before);assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM push_devices').get().n,1);assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM push_outbox').get().n,0);
 x.env.PUSH_ENABLED='false';assert.equal((await x.choose(false,1)).status,200);assert.equal((await x.choose(true,2)).status,503);
});
test('lease recheck suppresses richer delivery after consent, session, mute, membership or resource revocation',async()=>{
 for(const change of ["UPDATE push_devices SET preview_enabled=0,preview_revision=preview_revision+1","UPDATE session SET expiresAt=0","UPDATE conversation_members SET notifications_muted=1 WHERE member_id='bob'","UPDATE conversation_members SET status='left' WHERE member_id='bob'","UPDATE conversations SET archived_at=CURRENT_TIMESTAMP","UPDATE members SET status='suspended' WHERE id='bob'","INSERT INTO notification_settings(member_id,channels_json) VALUES('bob','{\"messages\":{\"push\":false}}')"]){
  const x=await setup();await x.choose(true);message(x);let called=0;
  await drainWithInjectedSender(x.DB,{sender:async({payload,authorize})=>{called++;assert.ok(payload.preview);x.sqlite.exec(change);assert.equal(await authorize(),false,change);return {status:0,cancelled:true}}});
  assert.equal(called,1);assert.equal(x.sqlite.prepare('SELECT state FROM push_outbox LIMIT 1').get().state,'cancelled');
 }
});
test('exact event message is used even when a newer message exists and malformed message references stay generic',async()=>{
 const x=await setup();await x.choose(true);message(x,'fixture-first','First text');message(x,'fixture-second','Second text');
 x.sqlite.exec("UPDATE push_outbox SET next_at=0 WHERE notification_id IN(SELECT n.id FROM notifications n JOIN notification_events e ON e.id=n.event_id WHERE json_extract(e.data_json,'$.messageId')='fixture-first')");
 const first=await claimDelivery(x.DB),delivery=await authorizedDelivery(x.DB,first,Date.now());assert.equal(deliveryPayload(delivery,first.expires_at).preview.text,'First text');
 x.sqlite.exec("UPDATE notification_events SET data_json='{}' WHERE kind='message.created'");assert.equal(deliveryPayload(await authorizedDelivery(x.DB,first,Date.now()),first.expires_at).preview,undefined);
});
