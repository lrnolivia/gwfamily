import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {createApp} from '../src/worker.mjs';import {command} from '../src/family-service.mjs';import {listNotifications,openNotification,saveNotificationSettings} from '../src/notification-service.mjs';
const person=id=>({id,status:'active',group:'family',roles:id==='owner'?['admin','planner','treasurer']:[],canPost:true,isLeader:id==='owner'});
function setup(){const d=database();seed(d.sqlite);d.sqlite.exec('DELETE FROM notifications;DELETE FROM notification_events;');const env={DB:d.DB,BETTER_AUTH_SECRET:'fixture-only-long-secret-not-real',AUTH_ORIGIN:'https://family.example.test'};const app=createApp(()=>({api:{getSession:async({headers})=>headers.get('x-fixture-user')?{user:{id:headers.get('x-fixture-user'),emailVerified:headers.get('x-fixture-unverified')!=='yes'}}:null}}));
 const request=async(user,path,method='GET',data,headers={})=>{const response=await app.request(env.AUTH_ORIGIN+path,{method,headers:{'x-fixture-user':user,Origin:env.AUTH_ORIGIN,'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})},env);return {status:response.status,body:await response.json()}};return {...d,env,app,request};}
const send=(DB,user,type,data={})=>command(DB,person(user),{type,requestId:crypto.randomUUID(),...data});

test('notification endpoints reject anonymous, pending, suspended, unverified and foreign-origin writes',async()=>{
 const {request,sqlite}=setup();assert.equal((await request('','/api/notifications')).status,401);assert.equal((await request('pending','/api/notifications')).status,403);assert.equal((await request('alice','/api/notifications','GET',undefined,{'x-fixture-unverified':'yes'})).status,403);
 assert.equal((await request('alice','/api/notifications/read-all','POST',{cutoff:0},{Origin:'https://evil.example.test'})).status,403);sqlite.prepare("UPDATE members SET status='suspended' WHERE id='bob'").run();assert.equal((await request('bob','/api/notifications')).status,403);
});

test('account identity is returned and late cross-account settings/read/dismiss/open requests fail before mutation',async()=>{
 const {DB,request}=setup();await send(DB,'owner','ADD_POST',{post:{text:'Fixture'}});const a=(await request('alice','/api/notifications')).body,b=(await request('bob','/api/notifications')).body;assert.equal(a.accountId,'alice');assert.equal(a.settings.accountId,'alice');assert.equal((await request('bob','/api/me/notifications')).body.accountId,'bob');
 assert.equal((await request('bob','/api/me/notifications','PUT',{scope:'off',expectedAccountId:'alice'})).status,409);
 for(const path of ['/api/notifications/read-all','/api/notifications/dismiss-all','/api/notifications/'+b.notifications[0].id+'/read','/api/notifications/'+b.notifications[0].id+'/dismiss'])assert.equal((await request('bob',path,'POST',{cutoff:b.readAllCutoff,expectedAccountId:'alice'})).status,409);
 assert.equal((await request('bob','/api/notifications/'+b.notifications[0].id+'/open?expectedAccountId=alice')).status,409);assert.equal((await request('bob','/api/notifications')).body.unreadCount,1);
 assert.equal((await request('bob','/api/notifications/'+a.notifications[0].id+'/open')).body.available,false);
});

test('legacy posts/comments/shirt writes use command receipts and emit durable events',async()=>{
 const {DB,request,sqlite}=setup();await saveNotificationSettings(DB,person('bob'),{scope:'all'});const requestId=crypto.randomUUID();let p=await request('alice','/api/posts','POST',{body:'Once',requestId});assert.equal(p.status,201);const duplicate=await request('alice','/api/posts','POST',{body:'Once',requestId});assert.equal(duplicate.body.id,p.body.id);assert.equal((await request('alice','/api/posts','POST',{body:'Changed',requestId})).status,409);assert.equal((await request('bob','/api/notifications')).body.unreadCount,1);
 const c=await request('bob','/api/posts/'+p.body.id+'/comments','POST',{body:'Reply',requestId:crypto.randomUUID()});assert.equal(c.status,201);assert.equal(sqlite.prepare("SELECT count(*) n FROM notification_events WHERE kind='comment.created'").get().n,1);
 const claim=await request('alice','/api/shirts/claims','POST',{lines:[{productId:'forest',size:'M',quantity:1}],requestId:crypto.randomUUID()});assert.equal(claim.status,201);await request('alice','/api/shirts/claims/'+claim.body.id+'/received','POST',{});assert.equal(sqlite.prepare("SELECT count(*) n FROM notification_events WHERE kind='order.status_changed'").get().n,1);
});

test('notification routes validate cursors, revisions and category values with bounded reads',async()=>{
 const {request}=setup();for(const query of ['limit=0','limit=101','before=-1','before=no','before=1.2'])assert.equal((await request('alice','/api/notifications?'+query)).status,400);assert.equal((await request('alice','/api/notifications/read-all','POST',{})).status,400);
 let s=await request('alice','/api/me/notifications','PUT',{scope:'all',selectedMemberIds:['bob'],revision:0});assert.equal(s.status,200);assert.deepEqual(s.body.selectedIds,['bob']);assert.equal(s.body.pushEnabled,false);assert.equal((await request('alice','/api/me/notifications','PUT',{categories:{replies:'yes'}})).status,400);assert.equal((await request('alice','/api/me/notifications','PUT',{globalOff:true,revision:0})).status,409);
});

test('conversation invitations, resolved outcomes, messages, read cursors and removal stay authorized',async()=>{
 const {DB,request,sqlite}=setup();const created=await request('alice','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'group',name:'Fixture group',memberIds:['bob']});assert.equal(created.status,201);const id=created.body.id;
 let b=(await request('bob','/api/notifications')).body;assert.equal(b.unreadCount,1);assert.equal(b.notifications[0].kind,'conversation.invited');const originalInvitation=b.notifications[0];assert.equal((await openNotification(DB,person('bob'),originalInvitation.id)).target.kind,'invitation');assert.equal((await request('bob','/api/conversations/'+id+'/messages')).status,404);
 await request('bob','/api/conversations/'+id+'/invitation','POST',{action:'accept'});assert.equal((await openNotification(DB,person('bob'),originalInvitation.id)).available,false);assert.equal((await request('alice','/api/notifications')).body.notifications[0].kind,'conversation.invitation_resolved');
 const first=await request('alice','/api/conversations/'+id+'/messages','POST',{requestId:crypto.randomUUID(),body:'Private fixture text'});assert.equal(first.status,201);b=(await request('bob','/api/notifications')).body;assert.equal(b.unreadCount,0,'message unread is owned by Messages badge');assert.equal(b.messageUnreadCount,1);const notice=b.notifications.find(x=>x.kind==='message.created');assert.ok(notice);assert.equal(notice.target.sequence,1);
 const raw=JSON.stringify(sqlite.prepare('SELECT * FROM notification_events').all());assert.ok(!raw.includes('Private fixture text'));
 await request('bob','/api/conversations/'+id+'/read','POST',{sequence:1});b=(await request('bob','/api/notifications')).body;assert.equal(b.messageUnreadCount,0);assert.ok(b.notifications.find(x=>x.id===notice.id).readAt);
 await request('alice','/api/conversations/'+id+'/members/bob','DELETE');assert.equal((await openNotification(DB,person('bob'),notice.id)).available,false);assert.equal((await request('bob','/api/notifications')).body.notifications.length,0);
 await request('alice','/api/conversations/'+id+'/members','POST',{memberIds:['bob']});b=(await request('bob','/api/notifications')).body;assert.equal(b.notifications.length,1);assert.equal(b.notifications[0].kind,'conversation.invited');assert.notEqual(b.notifications[0].id,originalInvitation.id);assert.equal((await openNotification(DB,person('bob'),originalInvitation.id)).available,false);
});

test('muted, removed, non-adult and unrelated administrators do not receive or open messages',async()=>{
 const {DB,request,sqlite}=setup();const {body:{id}}=await request('alice','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'group',name:'Fixture group',memberIds:['bob']});await request('bob','/api/conversations/'+id+'/invitation','POST',{action:'accept'});
 assert.equal((await request('owner','/api/conversations/'+id+'/notifications','PUT',{muted:false})).status,404);await request('bob','/api/conversations/'+id+'/notifications','PUT',{muted:true});await request('alice','/api/conversations/'+id+'/messages','POST',{requestId:crypto.randomUUID(),body:'Muted message'});assert.equal((await listNotifications(DB,person('bob'))).messageUnreadCount,0);assert.equal((await listNotifications(DB,person('owner'))).notifications.length,0);
 await request('bob','/api/conversations/'+id+'/notifications','PUT',{muted:false});assert.equal((await listNotifications(DB,person('bob'))).messageUnreadCount,0,'unmuting does not add historic recipients');await request('alice','/api/conversations/'+id+'/messages','POST',{requestId:crypto.randomUUID(),body:'Visible message'});const n=(await listNotifications(DB,person('bob'))).notifications[0];sqlite.prepare("UPDATE profiles SET birthday='2020-01-01' WHERE member_id='bob'").run();assert.equal((await openNotification(DB,person('bob'),n.id)).available,false);
});

test('message recipients are captured only at commit and cannot grow after later acceptance',async()=>{
 const {DB,request}=setup();const {body:{id}}=await request('alice','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'group',name:'Fixture group',memberIds:['bob','owner']});await request('bob','/api/conversations/'+id+'/invitation','POST',{action:'accept'});await request('alice','/api/conversations/'+id+'/messages','POST',{requestId:crypto.randomUUID(),body:'Before later participant'});await request('owner','/api/conversations/'+id+'/invitation','POST',{action:'accept'});assert.equal((await listNotifications(DB,person('owner'))).notifications.some(x=>x.kind==='message.created'),false);
});

test('generic read and read-all cannot mark unread chat messages; chat cursor remains authoritative',async()=>{
 const {DB,request}=setup();const {body:{id}}=await request('alice','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:['bob']});await request('bob','/api/conversations/'+id+'/invitation','POST',{action:'accept'});await request('alice','/api/conversations/'+id+'/messages','POST',{requestId:crypto.randomUUID(),body:'Unread message'});let b=(await request('bob','/api/notifications')).body;const n=b.notifications.find(x=>x.kind==='message.created');await request('bob','/api/notifications/'+n.id+'/read','POST',{});await request('bob','/api/notifications/read-all','POST',{cutoff:b.readAllCutoff});await send(DB,'bob','MARK_NOTICE_READ',{id:n.id});assert.equal((await request('bob','/api/notifications')).body.messageUnreadCount,1);await request('bob','/api/conversations/'+id+'/read','POST',{sequence:1});assert.equal((await request('bob','/api/notifications')).body.messageUnreadCount,0);
});

test('generic settings PUT changes Following while preserving independent Off until explicit enable',async()=>{
 const {request}=setup();let s=await request('alice','/api/me/notifications','PUT',{globalOff:true});assert.equal(s.body.globalOff,true);s=await request('alice','/api/me/notifications','PUT',{scope:'all'});assert.equal(s.body.globalOff,true);assert.equal(s.body.scope,'all');s=await request('alice','/api/me/notifications','PUT',{globalOff:false});assert.equal(s.body.globalOff,false);assert.equal(s.body.scope,'all');
});


test('clear-all covers earlier pages, preserves later arrivals, hidden history and other accounts, and retries safely',async()=>{
 const {DB,request,sqlite}=setup();
 for(let i=0;i<35;i++)await send(DB,'owner','ADD_POST',{post:{text:'Isolated clear fixture '+i}});
 const page=(await request('alice','/api/notifications?limit=3')).body;assert.equal(page.notifications.length,3);assert.ok(page.nextCursor);
 const total=sqlite.prepare("SELECT count(*) n FROM notifications WHERE recipient_id='alice'").get().n;
 const bobBefore=sqlite.prepare("SELECT * FROM notifications WHERE recipient_id='bob' ORDER BY id").all();
 await saveNotificationSettings(DB,person('alice'),{categories:{following:false}});
 assert.equal((await request('alice','/api/notifications/dismiss-all','POST',{cutoff:page.readAllCutoff,expectedAccountId:'alice'})).body.dismissedCount,0,'Hidden category history is retained');
 await saveNotificationSettings(DB,person('alice'),{categories:{following:true}});
 await send(DB,'owner','ADD_POST',{post:{text:'Later isolated arrival'}});
 const result=await request('alice','/api/notifications/dismiss-all','POST',{cutoff:page.readAllCutoff,expectedAccountId:'alice'});
 assert.equal(result.status,200);assert.equal(result.body.dismissedCount,total);
 const after=(await request('alice','/api/notifications')).body;assert.equal(after.notifications.length,1);assert.ok(after.notifications[0].sequence>page.readAllCutoff);assert.equal(after.unreadCount,1);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM notifications WHERE recipient_id='alice'").get().n,total+1,'Dismissal retains durable rows');
 assert.deepEqual(sqlite.prepare("SELECT * FROM notifications WHERE recipient_id='bob' ORDER BY id").all().filter(n=>bobBefore.some(old=>old.id===n.id)),bobBefore);
 assert.equal((await request('alice','/api/notifications/dismiss-all','POST',{cutoff:page.readAllCutoff,expectedAccountId:'alice'})).body.dismissedCount,0);
 for(const cutoff of [undefined,-1,1.5,'bad'])assert.equal((await request('alice','/api/notifications/dismiss-all','POST',{cutoff})).status,400);
 assert.equal((await request('','/api/notifications/dismiss-all','POST',{cutoff:0})).status,401);
 assert.equal((await request('pending','/api/notifications/dismiss-all','POST',{cutoff:0})).status,403);
 assert.equal((await request('alice','/api/notifications/dismiss-all','POST',{cutoff:0},{Origin:'https://evil.example.test'})).status,403);
});

test('clearing message activity does not mark the underlying conversation read',async()=>{
 const {request,sqlite}=setup();const created=await request('alice','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:['bob']});assert.equal(created.status,201);const id=created.body.id;
 await request('bob','/api/conversations/'+id+'/invitation','POST',{action:'accept'});
 await request('alice','/api/conversations/'+id+'/messages','POST',{requestId:crypto.randomUUID(),body:'Isolated unread message'});
 const before=(await request('bob','/api/notifications')).body;assert.ok(before.notifications.some(n=>n.kind==='message.created'));
 const cursor=sqlite.prepare('SELECT read_sequence FROM conversation_members WHERE conversation_id=? AND member_id=?').get(id,'bob');
 assert.equal((await request('bob','/api/notifications/dismiss-all','POST',{cutoff:before.readAllCutoff,expectedAccountId:'bob'})).status,200);
 assert.deepEqual(sqlite.prepare('SELECT read_sequence FROM conversation_members WHERE conversation_id=? AND member_id=?').get(id,'bob'),cursor);
 assert.equal((await request('bob','/api/conversations')).body.unreadCount,1);
});
