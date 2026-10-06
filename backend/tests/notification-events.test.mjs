import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,seed} from './test-db.mjs';
import {command,familyState} from '../src/family-service.mjs';
import {listNotifications,openNotification,saveNotificationSettings,notificationSettings,notificationSettingsStatements,markNotification,readAllNotifications} from '../src/notification-service.mjs';
import {celebrateBirthdays} from '../src/birthdays.mjs';
const actor=(id,roles=[])=>({id,status:'active',group:'family',roles,canPost:true,isLeader:id==='owner'});
const alice=actor('alice'),bob=actor('bob'),owner=actor('owner',['admin','moderator','planner','treasurer']);
function setup(){const d=database();seed(d.sqlite);d.sqlite.exec('DELETE FROM notifications;DELETE FROM notification_events;');return d}
const send=(DB,who,type,data={})=>command(DB,who,{requestId:crypto.randomUUID(),type,...data});
const eventRecipients=(sqlite,kind)=>sqlite.prepare('SELECT n.recipient_id,n.category,n.kind FROM notifications n JOIN notification_events e ON e.id=n.event_id WHERE e.kind=? ORDER BY n.recipient_id').all(kind).map(x=>({...x}));

test('direct tags override Following, collide once, and never target self or ancestors',async()=>{
 const {DB,sqlite}=setup();await saveNotificationSettings(DB,bob,{scope:'all'});sqlite.prepare("INSERT INTO memorials(id,name,created_by) VALUES('ancestor','Fictional ancestor','owner')").run();
 const p=await send(DB,alice,'ADD_POST',{post:{text:'Private prose must not enter event metadata',memberIds:['bob','alice','ancestor']}});
 assert.deepEqual(eventRecipients(sqlite,'post.published'),[{recipient_id:'bob',category:'mentions',kind:'post.tagged'}]);
 const inbox=await listNotifications(DB,bob);assert.equal(inbox.unreadCount,1);assert.equal(inbox.notifications[0].target.id,p.id);
 const raw=JSON.stringify(sqlite.prepare('SELECT * FROM notification_events').all());assert.ok(!raw.includes('Private prose'));assert.ok(!raw.includes('@'));assert.ok(!raw.includes('1991-02-03'));
});

test('reply targets post author and direct parent author once under default leaders Following',async()=>{
 const {DB,sqlite}=setup();const p=await send(DB,owner,'ADD_POST',{post:{text:'Question'}});const c=await send(DB,alice,'ADD_COMMENT',{targetId:p.id,text:'Parent'});
 const r=await send(DB,bob,'ADD_COMMENT',{targetId:p.id,parentId:c.id,text:'Child'});
 assert.deepEqual(eventRecipients(sqlite,'reply.created').map(r=>r.recipient_id),['alice','owner']);
 const n=(await listNotifications(DB,alice)).notifications.find(n=>n.target.id===r.id);assert.equal(n.category,'replies');assert.equal(n.target.containerId,p.id);assert.equal(n.target.anchorId,r.id);
 const open=await openNotification(DB,alice,n.id);assert.equal(open.post.id,p.id);assert.equal(open.comments.find(x=>x.id===r.id).parentId,c.id);
});

test('global Off remains absolute while retaining Following and category choices',async()=>{
 const {DB,sqlite}=setup();let s=await saveNotificationSettings(DB,bob,{scope:'selected',selectedIds:['alice'],categories:{reactions:false},globalOff:true});assert.equal(s.scope,'selected');
 await send(DB,alice,'ADD_POST',{post:{text:'Tagged but off',memberIds:['bob']}});assert.equal((await listNotifications(DB,bob)).notifications.length,0);assert.equal(sqlite.prepare("SELECT count(*) n FROM notifications WHERE recipient_id='bob'").get().n,0);
 s=await saveNotificationSettings(DB,bob,{globalOff:false,revision:s.revision});assert.equal(s.scope,'selected');assert.deepEqual(s.selectedIds,['alice']);assert.equal(s.categories.reactions,false);
 assert.equal((await listNotifications(DB,bob)).notifications.length,0,'enabling cannot create a historic recipient');
 await send(DB,alice,'ADD_POST',{post:{text:'New update'}});assert.equal((await listNotifications(DB,bob)).unreadCount,1);
 await saveNotificationSettings(DB,bob,{globalOff:true});assert.equal((await listNotifications(DB,bob)).unreadCount,0);
 await saveNotificationSettings(DB,bob,{globalOff:false});assert.equal((await listNotifications(DB,bob)).unreadCount,1,'existing history is preserved');
});

test('private group authorization subtracts recipients at commit, list, count, and open',async()=>{
 const {DB,sqlite}=setup();await saveNotificationSettings(DB,bob,{scope:'all'});await saveNotificationSettings(DB,owner,{scope:'all'});
 const p=await send(DB,alice,'ADD_POST',{post:{text:'Group secret',groupId:'private-group',memberIds:['bob','owner']}});assert.equal(eventRecipients(sqlite,'post.published').length,0);
 sqlite.prepare("INSERT INTO family_group_members(group_id,member_id) VALUES('private-group','bob')").run();const c=await send(DB,bob,'ADD_COMMENT',{targetId:p.id,text:'Direct reply'});
 const notice=(await listNotifications(DB,alice)).notifications.find(n=>n.target.id===c.id);assert.ok(notice);assert.equal((await listNotifications(DB,owner)).notifications.length,0);
 sqlite.prepare("DELETE FROM family_group_members WHERE group_id='private-group' AND member_id='alice'").run();assert.equal((await listNotifications(DB,alice)).unreadCount,0);assert.equal((await openNotification(DB,alice,notice.id)).available,false);
});

test('reactions notify the target author only on insertion and respect category opt-out',async()=>{
 const {DB,sqlite}=setup();const p=await send(DB,alice,'ADD_POST',{post:{text:'Reaction test'}});const input={type:'TOGGLE_REACTION',requestId:crypto.randomUUID(),targetId:p.id,emoji:'❤️'};
 await command(DB,bob,input);await command(DB,bob,input);assert.equal(eventRecipients(sqlite,'reaction.added').length,1);
 await send(DB,bob,'TOGGLE_REACTION',{targetId:p.id,emoji:'❤️'});assert.equal(eventRecipients(sqlite,'reaction.added').length,1);
 await saveNotificationSettings(DB,alice,{categories:{reactions:false}});assert.equal((await listNotifications(DB,alice)).unreadCount,0);
 await send(DB,bob,'TOGGLE_REACTION',{targetId:p.id,emoji:'❤️'});assert.equal(eventRecipients(sqlite,'reaction.added').length,1);
});

test('announcement audience is explicit and acknowledgement reconciles tagged and general notices',async()=>{
 const {DB}=setup();const p=await send(DB,owner,'ADD_POST',{post:{text:'Announcement',asLeader:true,firstView:true,memberIds:['bob']}});
 let list=await listNotifications(DB,bob);assert.equal(list.notifications[0].kind,'post.tagged');assert.equal(list.unreadCount,1);
 await send(DB,bob,'MARK_ANNOUNCEMENT_SEEN',{id:p.id});list=await listNotifications(DB,bob);assert.equal(list.unreadCount,0);assert.ok(list.notifications[0].readAt);
});

test('fees, orders, membership, household and reunion transitions are private and no-op safe',async()=>{
 const {DB,sqlite}=setup();const fee=await send(DB,alice,'SET_FEES',{value:'reported'});assert.deepEqual(eventRecipients(sqlite,'fee.reported').map(x=>x.recipient_id),['owner']);
 await send(DB,owner,'CONFIRM_FEE',{id:fee.id,status:'confirmed'});await send(DB,owner,'CONFIRM_FEE',{id:fee.id,status:'confirmed'});assert.equal(eventRecipients(sqlite,'fee.status_changed').length,1);
 const order=await send(DB,alice,'CLAIM_ORDER',{lines:[{productId:'forest',size:'M',quantity:1}]});await send(DB,owner,'UPDATE_CLAIM',{id:order.id,status:'ready'});await send(DB,owner,'UPDATE_CLAIM',{id:order.id,status:'ready'});assert.equal(eventRecipients(sqlite,'order.status_changed').length,1);
 const h=await send(DB,alice,'CREATE_HOUSEHOLD',{name:'Fictional household'});const invite=await send(DB,alice,'INVITE_HOUSEHOLD_MEMBER',{householdId:h.id,memberId:'bob'});assert.deepEqual(eventRecipients(sqlite,'household.invited').map(x=>x.recipient_id),['bob']);await send(DB,bob,'RESOLVE_HOUSEHOLD_REQUEST',{id:invite.id,accept:true});assert.ok(eventRecipients(sqlite,'household.resolved').some(x=>x.recipient_id==='alice'));
 await send(DB,owner,'APPROVE_MEMBER',{id:'pending',status:'active',roles:[],canPost:false});assert.deepEqual(eventRecipients(sqlite,'membership.status_changed').map(x=>x.recipient_id),['pending']);
 await send(DB,owner,'DETAILS',{value:{date:'2027-06-01',location:'Fictional park'}});await send(DB,owner,'DETAILS',{value:{date:'2027-06-01',location:'Fictional park'}});assert.equal(sqlite.prepare("SELECT count(*) n FROM notification_events WHERE kind='reunion.changed'").get().n,1);
 assert.equal((await listNotifications(DB,bob)).notifications.some(n=>['fee','order'].includes(n.target.kind)),false);
 const ownNotice=(await listNotifications(DB,alice)).notifications.find(n=>n.target.kind==='fee');assert.equal((await openNotification(DB,alice,ownNotice.id)).target.section,'you');
});

test('memory published and new tag generations are durable, with no dependent recipient',async()=>{
 const {DB,sqlite}=setup();sqlite.prepare("INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes) VALUES('photo','alice','fixture','Fixture','image/jpeg',1)").run();const m={id:'memory-fixture',image:'/api/media/photo',memberIds:['bob']};await send(DB,alice,'ADD_MEMORY',{memory:m});assert.equal(eventRecipients(sqlite,'memory.published')[0].kind,'memory.tagged');
 let n=(await listNotifications(DB,bob)).notifications[0];assert.equal(n.target.kind,'memory');assert.equal((await openNotification(DB,bob,n.id)).memory.id,m.id);
 await send(DB,alice,'SAVE_MEMORY',{memory:{...m,memberIds:[]}});await send(DB,alice,'SAVE_MEMORY',{memory:m});assert.equal((await listNotifications(DB,bob)).notifications.length,2);
 await assert.rejects(()=>send(DB,alice,'SAVE_MEMORY',{memory:{...m,memberIds:['private-child']}}));
});

test('birthday scheduler rechecks consent and revocation hides prior content and notice',async()=>{
 const {DB,sqlite}=setup();sqlite.prepare("UPDATE profiles SET birthday='1991-10-06',birthday_celebration=1 WHERE member_id='alice'").run();assert.equal((await celebrateBirthdays(DB,new Date('2026-10-06T13:00:00Z'))).created,1);assert.equal((await celebrateBirthdays(DB,new Date('2026-10-06T13:15:00Z'))).created,0);
 const n=(await listNotifications(DB,bob)).notifications.find(n=>n.kind==='birthday.celebrated');assert.ok(n);assert.ok(!JSON.stringify(n).includes('1991'));assert.equal(eventRecipients(sqlite,'birthday.celebrated').length,2);
 await send(DB,alice,'SET_BIRTHDAY_CELEBRATION',{enabled:false});assert.equal((await openNotification(DB,bob,n.id)).available,false);assert.equal((await familyState(DB,bob)).posts.some(p=>p.systemBirthday),false);
});

test('lost response retry is stable, reordered object keys match, changed payload is 409',async()=>{
 const {DB,sqlite}=setup(),requestId=crypto.randomUUID();const first=await command(DB,alice,{type:'ADD_POST',post:{text:'Once',memberIds:['bob']},requestId});const second=await command(DB,alice,{requestId,post:{memberIds:['bob'],text:'Once'},type:'ADD_POST'});assert.equal(first.id,second.id);
 await assert.rejects(()=>command(DB,alice,{requestId,type:'ADD_POST',post:{text:'Different'}}),e=>e.status===409);assert.equal(sqlite.prepare('SELECT count(*) n FROM posts').get().n,1);assert.equal(eventRecipients(sqlite,'post.published').length,1);
});

test('failure of final transaction statement rolls back domain, event, inbox and receipt',async()=>{
 const {DB,sqlite}=setup(),batch=DB.batch;DB.batch=ss=>batch([...ss,DB.prepare('INSERT INTO notification_setting_guards(token,valid) VALUES(?,0)').bind('fixture-failure')]);
 await assert.rejects(()=>send(DB,alice,'ADD_POST',{post:{text:'Must roll back',memberIds:['bob']}}));assert.equal(sqlite.prepare('SELECT count(*) n FROM posts').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM notification_events').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM notifications').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM command_receipts').get().n,0);
});

test('authoritative totals and stable keyset pages cover notices older than the 100-post feed',async()=>{
 const {DB,sqlite}=setup();const insert=sqlite.prepare("INSERT INTO posts(id,author_id,body,created_at) VALUES(?,'owner','Fixture post',?)");for(let i=0;i<125;i++)insert.run('post-'+String(i).padStart(4,'0'),`2026-09-01 12:${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}`);
 const first=await listNotifications(DB,alice,{limit:50});assert.equal(first.unreadCount,125);assert.equal(first.notifications.length,50);const second=await listNotifications(DB,alice,{limit:50,before:first.nextCursor}),third=await listNotifications(DB,alice,{limit:50,before:second.nextCursor});assert.equal(third.notifications.length,25);assert.equal(third.nextCursor,null);assert.equal(new Set([...first.notifications,...second.notifications,...third.notifications].map(x=>x.id)).size,125);
 const old=third.notifications.at(-1),state=await familyState(DB,alice);assert.equal(state.posts.length,100);assert.equal(state.posts.some(p=>p.id===old.target.id),false);assert.equal(state.notificationUnreadCount,125);assert.equal((await openNotification(DB,alice,old.id)).post.id,old.target.id);
});

test('read and dismiss are owner scoped and read-all cutoff cannot consume subsequent events',async()=>{
 const {DB}=setup();await send(DB,owner,'ADD_POST',{post:{text:'First'}});const before=await listNotifications(DB,alice),n=before.notifications[0];await markNotification(DB,bob,n.id);assert.equal((await listNotifications(DB,alice)).unreadCount,1);
 await send(DB,owner,'ADD_POST',{post:{text:'Second'}});await readAllNotifications(DB,alice,before.readAllCutoff);let inbox=await listNotifications(DB,alice);assert.equal(inbox.unreadCount,1);assert.ok(inbox.notifications.find(x=>x.id===n.id).readAt);await markNotification(DB,alice,inbox.notifications[0].id,true);inbox=await listNotifications(DB,alice);assert.equal(inbox.unreadCount,0);assert.equal(inbox.notifications.length,1);
});

test('settings share validation, optimistic concurrency, and atomic Following updates',async()=>{
 const {DB}=setup();await assert.rejects(()=>saveNotificationSettings(DB,bob,{selectedIds:['private-child']}));await assert.rejects(()=>saveNotificationSettings(DB,bob,{categories:{unknown:true}}));await assert.rejects(()=>saveNotificationSettings(DB,bob,{pushEnabled:true}));
 const stale=await notificationSettingsStatements(DB,bob,{scope:'all',revision:0});await saveNotificationSettings(DB,bob,{scope:'family',revision:0});await assert.rejects(()=>DB.batch(stale));let s=await notificationSettings(DB,bob);assert.equal(s.scope,'family');assert.equal(s.revision,1);
 await assert.rejects(()=>saveNotificationSettings(DB,bob,{scope:'off',revision:0}),e=>e.status===409);await send(DB,bob,'SET_NOTIFICATION_SCOPE',{value:'off'});s=await notificationSettings(DB,bob);assert.equal(s.globalOff,true);assert.equal(s.scope,'family');
});

test('fanout is set-based and does not silently drop recipients after 500',async()=>{
 const {DB,sqlite}=setup();sqlite.exec('BEGIN');for(let i=0;i<550;i++){const id='fixture-'+i;sqlite.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,0,0)').run(id,'Fixture '+i,id+'@example.test');sqlite.prepare("INSERT INTO members(id,status) VALUES(?,'active')").run(id)}sqlite.exec('COMMIT');await send(DB,owner,'ADD_POST',{post:{text:'Scale fixture'}});assert.equal(eventRecipients(sqlite,'post.published').length,552);
});

test('unknown, deleted and expired targets fail closed without private data',async()=>{
 const {DB,sqlite}=setup();const p=await send(DB,alice,'ADD_POST',{post:{text:'Secret',memberIds:['bob']}}),n=(await listNotifications(DB,bob)).notifications[0];sqlite.prepare("UPDATE notification_events SET expires_at='2000-01-01' WHERE resource_id=?").run(p.id);assert.equal((await listNotifications(DB,bob)).unreadCount,0);assert.deepEqual(await openNotification(DB,bob,n.id),{accountId:'bob',available:false,message:'This update is no longer available.'});
 sqlite.prepare('UPDATE notification_events SET expires_at=NULL WHERE resource_id=?').run(p.id);sqlite.prepare("UPDATE notifications SET resource_kind='unknown' WHERE id=?").run(n.id);assert.equal((await listNotifications(DB,bob)).notifications.length,0);
});

test('migration preserves legacy read/dismiss/preferences without generating old events',()=>{
 const db=new DatabaseSync(':memory:'),directory=new URL('../migrations/',import.meta.url);for(const file of readdirSync(directory).filter(x=>x.endsWith('.sql')&&x<'0012').sort())db.exec(readFileSync(new URL(file,directory),'utf8'));seed(db);db.exec("INSERT INTO posts(id,author_id,body) VALUES('legacy-post','owner','Old');INSERT INTO notification_preferences(member_id,scope,selected_ids_json) VALUES('alice','off','[\"owner\"]');INSERT INTO notifications(id,recipient_id,kind,subject_id,read_at,dismissed_at) VALUES('legacy-notice','alice','post','legacy-post','2026-01-01','2026-01-02')");db.exec(readFileSync(new URL('0012_notifications.sql',directory),'utf8'));
 assert.equal(db.prepare('SELECT count(*) n FROM notification_events').get().n,0);const n=db.prepare("SELECT * FROM notifications WHERE id='legacy-notice'").get();assert.equal(n.read_at,'2026-01-01');assert.equal(n.dismissed_at,'2026-01-02');assert.equal(db.prepare("SELECT scope FROM notification_preferences WHERE member_id='alice'").get().scope,'off');assert.equal(db.prepare('SELECT count(*) n FROM notification_sequence').get().n,1);
});

test('rollback Worker legacy fanout cannot duplicate or override trigger preferences',async()=>{
 const {DB,sqlite}=setup();const p=await send(DB,owner,'ADD_POST',{post:{text:'Rollback fixture'}});const count=sqlite.prepare('SELECT count(*) n FROM notifications').get().n;
 sqlite.prepare('INSERT INTO notifications(id,recipient_id,kind,subject_id,data_json) VALUES(?,?,?,?,?)').run('legacy-duplicate','alice','post',p.id,JSON.stringify({authorId:'owner'}));assert.equal(sqlite.prepare('SELECT count(*) n FROM notifications').get().n,count);
});

test('simultaneous duplicate commands commit one event and one durable recipient',async()=>{
 const {DB,sqlite}=setup();let tail=Promise.resolve();const serial={...DB,batch(statements){const pending=tail.then(()=>DB.batch(statements));tail=pending.catch(()=>{});return pending}};
 const input={requestId:crypto.randomUUID(),type:'ADD_POST',post:{text:'Concurrent fixture',memberIds:['bob']}};const results=await Promise.all([command(serial,alice,input),command(serial,alice,input)]);assert.equal(results[0].id,results[1].id);assert.equal(sqlite.prepare('SELECT count(*) n FROM posts').get().n,1);assert.equal(eventRecipients(sqlite,'post.published').length,1);
});

test('open rechecks authorization and preferences inside its hydration snapshot',async()=>{
 const {DB,sqlite}=setup();const p=await send(DB,alice,'ADD_POST',{post:{text:'Do not leak after revocation',memberIds:['bob']}});const n=(await listNotifications(DB,bob)).notifications[0];const batch=DB.batch;DB.batch=statements=>{sqlite.prepare("UPDATE members SET status='suspended' WHERE id='bob'").run();return batch(statements)};const opened=await openNotification(DB,bob,n.id);assert.equal(opened.available,false);assert.equal(opened.post,undefined);
});

test('recipient revocation before domain commit produces no targeted inbox item',async()=>{
 const {DB,sqlite}=setup();const batch=DB.batch;DB.batch=statements=>{sqlite.prepare("UPDATE members SET status='suspended' WHERE id='bob'").run();return batch(statements)};await send(DB,alice,'ADD_POST',{post:{text:'Tagged before membership changed',memberIds:['bob']}});assert.equal(eventRecipients(sqlite,'post.published').length,0);
});

test('a disabled mention can fall back to an enabled Following reason without duplication',async()=>{
 const {DB}=setup();await saveNotificationSettings(DB,bob,{scope:'all',categories:{mentions:false}});await send(DB,alice,'ADD_POST',{post:{text:'Followed update',memberIds:['bob']}});const n=await listNotifications(DB,bob);assert.equal(n.notifications.length,1);assert.equal(n.notifications[0].category,'following');
});

test('existing selected choices survive unavailable members and global toggles',async()=>{
 const {DB,sqlite}=setup();await saveNotificationSettings(DB,bob,{scope:'selected',selectedIds:['alice']});sqlite.prepare("UPDATE members SET status='suspended' WHERE id='alice'").run();const s=await saveNotificationSettings(DB,bob,{globalOff:true});assert.equal(s.globalOff,true);assert.deepEqual(s.selectedIds,['alice']);
});

test('independent Off survives scope, category and selected-member changes until explicitly enabled',async()=>{
 const {DB}=setup();await saveNotificationSettings(DB,bob,{scope:'leaders',globalOff:true});
 let s=await saveNotificationSettings(DB,bob,{scope:'all'});assert.equal(s.globalOff,true);assert.equal(s.scope,'all');
 s=await saveNotificationSettings(DB,bob,{categories:{mentions:false},selectedIds:['alice']});assert.equal(s.globalOff,true);assert.deepEqual(s.selectedIds,['alice']);
 await send(DB,owner,'ADD_POST',{post:{text:'Still off'}});assert.equal((await listNotifications(DB,bob)).unreadCount,0);
 s=await saveNotificationSettings(DB,bob,{globalOff:false});assert.equal(s.globalOff,false);assert.equal(s.scope,'all');assert.equal(s.categories.mentions,false);
 await send(DB,owner,'ADD_POST',{post:{text:'Explicitly enabled'}});assert.equal((await listNotifications(DB,bob)).unreadCount,1);
});

test('legacy combined scope command can explicitly turn notices on and off',async()=>{
 const {DB}=setup();await saveNotificationSettings(DB,bob,{scope:'family',globalOff:true});await send(DB,bob,'SET_NOTIFICATION_SCOPE',{value:'leaders'});let s=await notificationSettings(DB,bob);assert.equal(s.globalOff,false);assert.equal(s.scope,'leaders');
 await send(DB,bob,'SET_NOTIFICATION_SCOPE',{value:'off'});s=await notificationSettings(DB,bob);assert.equal(s.globalOff,true);assert.equal(s.scope,'leaders');await send(DB,bob,'SET_SELECTED_NOTIFICATION_IDS',{ids:['alice']});assert.equal((await notificationSettings(DB,bob)).globalOff,true);
});

test('independent Off mirrors legacy scope while preserving and restoring Following',async()=>{
 const {DB,sqlite}=setup();await saveNotificationSettings(DB,bob,{scope:'selected',selectedIds:['alice'],globalOff:true});assert.equal(sqlite.prepare("SELECT scope FROM notification_preferences WHERE member_id='bob'").get().scope,'off');assert.equal((await familyState(DB,bob)).notificationScope,'off','rollback UI receives effective Off');
 let s=await notificationSettings(DB,bob);assert.equal(s.scope,'selected');assert.deepEqual(s.selectedIds,['alice']);assert.equal(s.revision,1,'new writes do not double-increment compatibility revision');
 s=await saveNotificationSettings(DB,bob,{scope:'family'});assert.equal(s.globalOff,true);assert.equal(s.scope,'family');assert.equal(sqlite.prepare("SELECT scope FROM notification_preferences WHERE member_id='bob'").get().scope,'off');assert.equal(s.revision,2);
 s=await saveNotificationSettings(DB,bob,{globalOff:false});assert.equal(s.scope,'family');assert.equal(sqlite.prepare("SELECT scope FROM notification_preferences WHERE member_id='bob'").get().scope,'family');assert.equal(s.revision,3);
});

test('older Worker preference writes synchronize explicit enable, preserve Following and invalidate stale CAS',async()=>{
 const {DB,sqlite}=setup();await saveNotificationSettings(DB,bob,{scope:'selected',selectedIds:['alice'],globalOff:true});const stale=await notificationSettingsStatements(DB,bob,{categories:{replies:false},revision:1});
 // Exact older writer semantics: a direct preference upsert, with no settings API.
 sqlite.prepare("INSERT INTO notification_preferences(member_id,scope,selected_ids_json) VALUES('bob','all','[]') ON CONFLICT(member_id) DO UPDATE SET scope=excluded.scope,selected_ids_json=excluded.selected_ids_json").run();let s=await notificationSettings(DB,bob);assert.equal(s.globalOff,false);assert.equal(s.scope,'all');assert.equal(s.revision,2);await assert.rejects(()=>DB.batch(stale));assert.equal((await notificationSettings(DB,bob)).categories.replies,true);
 sqlite.prepare("UPDATE notification_preferences SET scope='off' WHERE member_id='bob'").run();s=await notificationSettings(DB,bob);assert.equal(s.globalOff,true);assert.equal(s.scope,'all');assert.equal(s.revision,3);
 sqlite.prepare("UPDATE notification_preferences SET selected_ids_json='[\"alice\"]' WHERE member_id='bob'").run();s=await notificationSettings(DB,bob);assert.equal(s.globalOff,true);assert.equal(s.scope,'all');assert.equal(s.revision,4);
 await saveNotificationSettings(DB,bob,{globalOff:false});assert.equal((await notificationSettings(DB,bob)).scope,'all');assert.deepEqual((await notificationSettings(DB,bob)).selectedIds,['alice']);
});

test('active pre-0012 legacy post and comment notices remain listable, openable and present in state',async()=>{
 const {DB,sqlite}=database({beforeMigration(file,db){if(file!=='0012_notifications.sql')return;seed(db);db.exec(`
 INSERT INTO posts(id,author_id,body) VALUES('legacy-readable-post','owner','Legacy readable contribution');
 INSERT INTO comments(id,post_id,author_id,body) VALUES('legacy-readable-comment','legacy-readable-post','owner','Legacy reply');
 INSERT INTO notification_preferences(member_id,scope,selected_ids_json) VALUES('alice','leaders','[]');
 INSERT INTO notifications(id,recipient_id,kind,subject_id,data_json) VALUES('legacy-post-notice','alice','post','legacy-readable-post','{"authorId":"owner"}'),('legacy-comment-notice','alice','comment','legacy-readable-post','{"authorId":"owner"}');
 `)}});
 assert.equal(sqlite.prepare('SELECT count(*) n FROM notification_events').get().n,0,'migration never fabricates event metadata');
 const inbox=await listNotifications(DB,alice);assert.equal(inbox.unreadCount,2);assert.equal(inbox.notifications.length,2);assert.ok(inbox.notifications.every(n=>n.target.kind==='post'&&n.target.id==='legacy-readable-post'));
 for(const n of inbox.notifications){const opened=await openNotification(DB,alice,n.id);assert.equal(opened.available,true);assert.equal(opened.post.text,'Legacy readable contribution');assert.equal(opened.comments[0].id,'legacy-readable-comment')}
 const state=await familyState(DB,alice);assert.equal(state.notificationUnreadCount,2);assert.equal(state.notifications.length,2);
 await markNotification(DB,alice,'legacy-post-notice');assert.equal((await listNotifications(DB,alice)).unreadCount,1);await markNotification(DB,alice,'legacy-comment-notice',true);assert.equal((await listNotifications(DB,alice)).notifications.length,1);
});

function interleaveSettingsRead(DB,change){
 let intercepted=false;
 return {db:{...DB,prepare(query){const statement=DB.prepare(query);if(query.trimStart().startsWith('SELECT')&&query.includes('notification_preferences')&&!intercepted){return {bind(...args){const bound=statement.bind(...args);return {async first(){const snapshot=await bound.first();intercepted=true;await change();return snapshot}}}}}return statement}},didIntercept:()=>intercepted};
}

test('settings getter reads Following and revision in one consistent snapshot',async()=>{
 const {DB}=setup();await saveNotificationSettings(DB,bob,{scope:'leaders'});
 const race=interleaveSettingsRead(DB,()=>saveNotificationSettings(DB,bob,{scope:'family'}));const snapshot=await notificationSettings(race.db,bob);
 assert.equal(race.didIntercept(),true);assert.equal(snapshot.scope,'leaders');assert.equal(snapshot.revision,1);const current=await notificationSettings(DB,bob);assert.equal(current.scope,'family');assert.equal(current.revision,2);
});

test('revisionless category save cannot overwrite Following changed after its settings snapshot',async()=>{
 const {DB}=setup();await saveNotificationSettings(DB,bob,{scope:'leaders'});
 const race=interleaveSettingsRead(DB,()=>saveNotificationSettings(DB,bob,{scope:'family'}));await assert.rejects(()=>saveNotificationSettings(race.db,bob,{categories:{reactions:false}}),e=>e.status===409);
 assert.equal(race.didIntercept(),true);let current=await notificationSettings(DB,bob);assert.equal(current.scope,'family');assert.equal(current.revision,2);assert.equal(current.categories.reactions,true);
 current=await saveNotificationSettings(DB,bob,{categories:{reactions:false}});assert.equal(current.scope,'family');assert.equal(current.revision,3);assert.equal(current.categories.reactions,false);
});

test('legacy revisionless selection command cannot revert a concurrent Following scope update',async()=>{
 const {DB,sqlite}=setup();await saveNotificationSettings(DB,bob,{scope:'leaders'});
 const race=interleaveSettingsRead(DB,()=>saveNotificationSettings(DB,bob,{scope:'family'}));const input={type:'SET_SELECTED_NOTIFICATION_IDS',requestId:crypto.randomUUID(),ids:['alice']};await assert.rejects(()=>command(race.db,bob,input),e=>e.status===409);
 const current=await notificationSettings(DB,bob);assert.equal(current.scope,'family');assert.equal(current.revision,2);assert.deepEqual(current.selectedIds,[]);assert.equal(sqlite.prepare('SELECT count(*) n FROM command_receipts WHERE member_id=? AND request_id=?').get(bob.id,input.requestId).n,0);
});
