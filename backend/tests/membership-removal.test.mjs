import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {command} from '../src/family-service.mjs';
import {createApp} from '../src/worker.mjs';

const actor=(id,roles=[])=>({id,status:'active',group:'family',roles,canPost:true,isLeader:id==='owner'});
const owner=actor('owner',['admin','moderator','planner','treasurer']);
function setup(){const db=database();seed(db.sqlite);return db}
const input=(type,id,revision=0,by=owner)=>({type,id,requestId:crypto.randomUUID(),expectedAccountId:by.id,confirmedMemberId:id,expectedRevision:revision});
const remove=(DB,id='alice',revision=0,by=owner)=>command(DB,by,input('REMOVE_MEMBER',id,revision,by));
const restore=(DB,id='alice',revision=1)=>command(DB,owner,input('RESTORE_MEMBER',id,revision));
const row=(sqlite,id='alice')=>sqlite.prepare('SELECT * FROM members WHERE id=?').get(id);
const approve=(DB,id,roles=[],status='active',by=owner)=>command(DB,by,{type:'APPROVE_MEMBER',id,roles,status,canPost:true,requestId:crypto.randomUUID()});
const count=(sqlite,table)=>sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n;

test('only a current active verified admin can remove or restore another membership',async()=>{
 const {DB,sqlite}=setup();
 for(const roles of [[],['moderator'],['planner'],['treasurer']]){
  await assert.rejects(()=>remove(DB,'bob',0,actor('alice',roles)),e=>e.status===403);
 }
 // Caller-supplied role data cannot grant a role that is absent from storage.
 await assert.rejects(()=>remove(DB,'bob',0,actor('alice',['admin'])),e=>e.status===403);
 await assert.rejects(()=>remove(DB,'owner'),/another membership/);
 await assert.rejects(()=>restore(DB,'owner',0),/another membership/);
 sqlite.exec("UPDATE members SET roles_json='[\"admin\"]',status='suspended' WHERE id='alice'");
 await assert.rejects(()=>remove(DB,'bob',0,actor('alice',['admin'])),e=>e.status===403);
 sqlite.exec("UPDATE members SET status='active' WHERE id='alice'; UPDATE user SET emailVerified=0 WHERE id='alice'");
 await assert.rejects(()=>remove(DB,'bob',0,actor('alice',['admin'])),e=>e.status===403);
 assert.equal(row(sqlite,'bob').status,'active');assert.equal(count(sqlite,'membership_change_log'),0);
});

test('target identity, current account, current revision, and existence are required',async()=>{
 const {DB,sqlite}=setup();
 for(const patch of [{confirmedMemberId:'bob'},{confirmedMemberId:undefined},{expectedAccountId:'bob'},{expectedRevision:undefined},{expectedRevision:-1},{expectedRevision:1}]){
  await assert.rejects(()=>command(DB,owner,{...input('REMOVE_MEMBER','alice'),...patch}),e=>e.status===409);
 }
 await assert.rejects(()=>remove(DB,'does-not-exist'),e=>e.status===404);
 assert.equal(row(sqlite).status,'active');assert.equal(count(sqlite,'audit_log'),0);
});

test('removal is a denied soft membership state, audited once with idempotent receipts',async()=>{
 const {DB,sqlite}=setup(),request=input('REMOVE_MEMBER','alice');
 const first=await command(DB,owner,request),repeat=await command(DB,owner,request);
 assert.deepEqual(first,repeat);assert.equal(first.status,'removed');
 const member=row(sqlite);assert.equal(member.status,'suspended');assert.ok(member.removed_at);assert.equal(member.removed_by,'owner');assert.equal(member.roles_json,'[]');assert.equal(member.can_post,0);assert.equal(member.is_leader,0);assert.equal(member.membership_revision,1);
 assert.equal(count(sqlite,'membership_change_log'),1);assert.equal(count(sqlite,'audit_log'),1);assert.equal(count(sqlite,'command_receipts'),1);
 const history=sqlite.prepare('SELECT * FROM membership_change_log').get();assert.equal(JSON.parse(history.before_json).status,'active');assert.equal(JSON.parse(history.after_json).removedBy,'owner');
 await assert.rejects(()=>command(DB,owner,{...request,id:'bob',confirmedMemberId:'bob'}),e=>e.status===409);
 await assert.rejects(()=>remove(DB,'alice',1),e=>e.status===409);
 assert.equal(row(sqlite,'bob').status,'active');
});

test('pending and paused memberships can be removed and restore only into pending review',async()=>{
 const {DB,sqlite}=setup();
 sqlite.exec("UPDATE members SET status='suspended',roles_json='[\"planner\"]',can_post=1,is_leader=1 WHERE id='bob'");
 for(const id of ['pending','bob']){
  await remove(DB,id);await restore(DB,id);
  const restored=row(sqlite,id);assert.equal(restored.status,'pending');assert.equal(restored.removed_at,null);assert.equal(restored.removed_by,null);assert.equal(restored.roles_json,'[]');assert.equal(restored.can_post,0);assert.equal(restored.is_leader,0);assert.equal(restored.membership_revision,2);
 }
 await assert.rejects(()=>restore(DB,'bob',2),e=>e.status===409);
 await approve(DB,'bob',['planner']);assert.equal(row(sqlite,'bob').status,'active');assert.equal(row(sqlite,'bob').roles_json,'["planner"]');
});

test('stale approval cannot silently undo removal; restore and approval are separate',async()=>{
 const {DB,sqlite}=setup();await remove(DB);
 await assert.rejects(()=>approve(DB,'alice',['admin']),e=>e.status===409);
 assert.throws(()=>sqlite.exec("UPDATE members SET status='active' WHERE id='alice'"),/Restore this membership/);
 await restore(DB);assert.equal(row(sqlite).status,'pending');
 await approve(DB,'alice');assert.equal(row(sqlite).status,'active');assert.equal(count(sqlite,'membership_change_log'),3);
});

test('authentication, profiles, content, households, messages, orders, and money history survive removal and restore',async()=>{
 const {DB,sqlite}=setup();
 sqlite.exec(`INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('test-session',9999999999999,'fictional-test-only-token',0,0,'alice');
 INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES('test-account','alice','test-provider','alice',0,0);
 INSERT INTO posts(id,author_id,body) VALUES('historical-post','alice','Keep this post');
 INSERT INTO comments(id,post_id,author_id,body) VALUES('historical-comment','historical-post','alice','Keep this comment');
 INSERT INTO conversations(id,owner_id,name) VALUES('historic-chat','alice','History');
 INSERT INTO conversation_members(conversation_id,member_id) VALUES('historic-chat','alice'),('historic-chat','bob');
 INSERT INTO messages(id,conversation_id,author_id,body,sequence) VALUES('historic-message','historic-chat','alice','Keep this message',1);
 INSERT INTO shirt_claims(id,member_id,status,lines_json) VALUES('historical-order','alice','ordered','[{"productId":"forest","size":"M","quantity":1}]');
 INSERT INTO fee_reports(id,member_id,status,confirmed_by) VALUES('historical-fee','alice','confirmed','owner');
 INSERT INTO reunion_rsvps(reunion_id,member_id,status,count) VALUES('legacy','alice','Planning to come',2);
 INSERT INTO dependents(id,guardian_id,name,birthday,gender) VALUES('private-child','alice','Fictional child','2020-01-01','Prefer not to say');
 INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes) VALUES('historical-media','alice','test-key','Keepsake','image/jpeg',12);
 INSERT INTO memories(id,author_id,data_json) VALUES('historical-memory','alice','{"title":"Keep this memory"}');`);
 const tables=['user','account','session','profiles','posts','comments','conversations','conversation_members','messages','shirt_claims','fee_reports','reunion_rsvps','dependents','media','memories','family_groups','family_group_members'];
 const snapshot=()=>Object.fromEntries(tables.map(table=>[table,sqlite.prepare('SELECT * FROM '+table).all()]));const before=snapshot();
 await remove(DB);assert.deepEqual(snapshot(),before);
 await restore(DB);assert.deepEqual(snapshot(),before);
});

test('database prevents last active admin removal, pause, demotion, and delete, including an unverified backup',()=>{
 const {sqlite}=setup();
 for(const change of ["status='suspended'","roles_json='[]'","status='suspended',removed_at=CURRENT_TIMESTAMP"]){
  assert.throws(()=>sqlite.exec("UPDATE members SET "+change+" WHERE id='owner'"),/Keep at least one active admin/);
 }
 assert.throws(()=>sqlite.exec("DELETE FROM members WHERE id='owner'"),/Keep at least one active admin/);
 sqlite.exec("UPDATE members SET roles_json='[\"admin\"]' WHERE id='alice'; UPDATE user SET emailVerified=0 WHERE id='alice'");
 assert.throws(()=>sqlite.exec("UPDATE members SET status='suspended' WHERE id='owner'"),/Keep at least one active admin/);
 assert.equal(row(sqlite,'owner').status,'active');
});

// Real D1 batches serialize. This adapter deliberately lets both requests read
// the old state, then serializes their competing batches at commit time.
function racingDB(DB){
 let ready=0,release;const gate=new Promise(resolve=>{release=resolve});let tail=Promise.resolve();
 return {...DB,async batch(statements){if(!statements.some(s=>s.sql.includes('membership_write_guards')))return DB.batch(statements);if(++ready===2)release();await gate;const run=tail.then(()=>DB.batch(statements));tail=run.catch(()=>{});return run}};
}
for(const action of ['remove','pause','demote'])test(`two admins racing to ${action} each other cannot remove all admins`,async()=>{
 const {DB,sqlite}=setup();sqlite.exec("UPDATE members SET roles_json='[\"admin\"]' WHERE id='alice'");const raced=racingDB(DB),alice=actor('alice',['admin']);
 const run=(by,id)=>action==='remove'?remove(raced,id,0,by):approve(raced,id,action==='pause'?['admin']:[],action==='pause'?'suspended':'active',by);
 const results=await Promise.allSettled([run(owner,'alice'),run(alice,'owner')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM members m WHERE status='active' AND removed_at IS NULL AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='admin')").get().n,1);
 assert.equal(count(sqlite,'membership_change_log'),1);assert.equal(count(sqlite,'audit_log'),1);assert.equal(count(sqlite,'command_receipts'),1);
});

test('concurrent duplicate target changes do not create a false success or duplicate history',async()=>{
 const {DB,sqlite}=setup(),raced=racingDB(DB);
 const results=await Promise.allSettled([remove(raced),remove(raced)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);assert.equal(count(sqlite,'audit_log'),1);
});

test('removed account is denied across family APIs and enrollment while admin review retains it',async()=>{
 const {DB,sqlite}=setup(),env={DB,BETTER_AUTH_SECRET:'test-only-secret-over-thirty-two-characters',AUTH_ORIGIN:'https://greenwhitefamily.com'};
 const app=createApp(()=>({api:{getSession:async({headers})=>({user:{id:headers.get('x-test-user'),emailVerified:true,email:headers.get('x-test-user')+'@example.test'}})}}));
 const request=(id,path,body)=>app.request(env.AUTH_ORIGIN+path,{method:body?'POST':'GET',headers:{'x-test-user':id,Origin:env.AUTH_ORIGIN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},env);
 await remove(DB);
 for(const path of ['/api/state','/api/manage','/api/directory','/api/members','/api/groups','/api/conversations','/api/notifications','/api/media/anything'])assert.equal((await request('alice',path)).status,403,path);
 assert.equal((await request('alice','/api/commands',{type:'RSVP',requestId:crypto.randomUUID(),value:{status:'Planning to come',count:1}})).status,403);
 assert.equal((await request('alice','/api/enroll',{name:'New name',birthday:'1991-02-03',privacyAccepted:true})).status,403);
 const session=await(await request('alice','/api/session')).json();assert.equal(session.signedIn,true);assert.equal(session.status,'suspended');assert.equal(session.membershipRemoved,true);
 const managed=await(await request('owner','/api/manage')).json();assert.ok(managed.members.find(m=>m.id==='alice').removed_at);assert.equal(managed.members.find(m=>m.id==='alice').membership_revision,1);
 const publicMembers=await(await request('bob','/api/members')).json();assert.ok(!publicMembers.members.some(m=>m.id==='alice'));
 await restore(DB);assert.equal((await request('alice','/api/state')).status,403);
 await approve(DB,'alice');assert.equal((await request('alice','/api/state')).status,200);
 assert.equal(sqlite.prepare("SELECT name FROM user WHERE id='alice'").get().name,'Alice');
});

test('removal revokes device delivery, cancels queued push, and never revives devices on restore',async()=>{
 const {DB,sqlite}=setup();
 sqlite.exec(`INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('device-session',9999999999999,'fictional-device-session',0,0,'alice');
 INSERT INTO push_devices(id,member_id,session_id,endpoint,p256dh,auth,key_version,created_at,confirmed_at) VALUES('device','alice','device-session','https://example.test/fictional','test','test','test',0,0);
 INSERT INTO notifications(id,recipient_id,kind,subject_id) VALUES('queued-notice','alice','test','test');
 INSERT INTO push_outbox(id,notification_id,device_id,generation,next_at,expires_at) VALUES('queued-push','queued-notice','device',1,0,9999999999999);`);
 const before=count(sqlite,'notifications');await remove(DB);
 assert.ok(sqlite.prepare("SELECT revoked_at FROM push_devices WHERE id='device'").get().revoked_at);assert.equal(sqlite.prepare("SELECT state FROM push_outbox WHERE id='queued-push'").get().state,'cancelled');assert.equal(count(sqlite,'notifications'),before);
 await restore(DB);assert.ok(sqlite.prepare("SELECT revoked_at FROM push_devices WHERE id='device'").get().revoked_at);assert.equal(count(sqlite,'notifications'),before);
});
