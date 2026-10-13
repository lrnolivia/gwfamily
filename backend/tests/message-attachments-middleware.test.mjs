// Actual Hono routes, middleware and complete canonical migration chain, with
// in-memory D1/R2 and explicitly synthetic sessions. No sign-in or real objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database,seed} from './test-db.mjs';
import worker,{createApp} from '../src/worker.mjs';
const origin='https://synthetic-attachments.invalid';
function setup(){
 const fixture=database();seed(fixture.sqlite);const {sqlite,DB}=fixture;
 sqlite.exec("CREATE TABLE synthetic_sessions(id TEXT PRIMARY KEY,member_id TEXT NOT NULL);INSERT INTO synthetic_sessions VALUES('session-alice','alice'),('session-bob','bob');INSERT INTO conversations(id,type,name,owner_id) VALUES('conversation','group','Synthetic group','alice');INSERT INTO conversation_members(conversation_id,member_id,status) VALUES('conversation','alice','active'),('conversation','bob','active')");
 const objects=new Map(),R2={beforeGet:null,async put(key,bytes){objects.set(key,Uint8Array.from(bytes))},async get(key){if(this.beforeGet)await this.beforeGet();const value=objects.get(key);return value?{body:value,size:value.length}:null},async delete(key){objects.delete(key)}};
 const env={DB,R2,AUTH_ORIGIN:origin,BETTER_AUTH_SECRET:'synthetic-only-not-a-credential'};
 const app=createApp(()=>({api:{async getSession({headers}){const row=sqlite.prepare('SELECT s.id,s.member_id,u.emailVerified FROM synthetic_sessions s JOIN user u ON u.id=s.member_id WHERE s.id=?').get(headers.get('X-Synthetic-Session'));return row?{user:{id:row.member_id,emailVerified:row.emailVerified===1},session:{id:row.id}}:null}},handler(){throw Error('Authentication actions forbidden in this fixture')}}));
 const request=(path,{method='GET',body,account='alice',session='session-alice',requestOrigin=origin,headers={}}={})=>app.request(origin+path,{method,headers:{Origin:requestOrigin,'X-Synthetic-Session':session,'X-Expected-Account-ID':account,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:body instanceof FormData||typeof body==='string'?body:JSON.stringify(body)})},env);
 const upload=({account='alice',session='session-alice',requestOrigin=origin,file=new File(['Synthetic file'],'synthetic.txt',{type:'text/plain'})}={})=>{const body=new FormData();body.set('file',file);body.set('requestId',crypto.randomUUID());body.set('expectedAccountId',account);return request('/api/conversations/conversation/attachments',{method:'POST',body,account,session,requestOrigin})};
 return {...fixture,env,R2,objects,request,upload};
}
test('canonical migrations preserve messages, receipts and participants across additive attachment migration and rollback rehearsal',()=>{
 const {sqlite}=database({beforeMigration(file,sqlite){if(file!=='0015_message_attachments.sql')return;seed(sqlite);sqlite.exec("INSERT INTO conversations(id,name,owner_id) VALUES('old','Old group','alice');INSERT INTO conversation_members(conversation_id,member_id) VALUES('old','alice');INSERT INTO messages(id,conversation_id,author_id,body,sequence) VALUES('old-message','old','alice','Historical body',1);INSERT INTO messaging_requests(member_id,request_id,operation,fingerprint,resource_id) VALUES('alice','historical-request','send','hash','old-message')")}});
 assert.equal(sqlite.prepare("SELECT attachment_only FROM messages WHERE id='old-message'").get().attachment_only,0);
 sqlite.exec('DROP TABLE conversation_attachment_cleanup;DROP TABLE conversation_attachment_cancellations;DROP TABLE conversation_attachments;ALTER TABLE messages DROP COLUMN attachment_only');
 assert.equal(sqlite.prepare("SELECT body FROM messages WHERE id='old-message'").get().body,'Historical body');assert.equal(sqlite.prepare("SELECT count(*) AS n FROM messaging_requests").get().n,1);assert.equal(sqlite.prepare("SELECT count(*) AS n FROM conversation_members").get().n,1);
 sqlite.exec(readFileSync(new URL('../migrations/0015_message_attachments.sql',import.meta.url),'utf8'));assert.equal(sqlite.prepare("SELECT attachment_only FROM messages WHERE id='old-message'").get().attachment_only,0);
});
test('actual middleware enforces authentication, origin and expected account on attachment uploads',async()=>{
 const f=setup();assert.equal((await f.upload({session:'missing'})).status,401);assert.equal((await f.upload({requestOrigin:'https://foreign.invalid'})).status,403);assert.equal((await f.upload({account:'bob'})).status,409);assert.equal(f.objects.size,0);assert.equal((await f.upload()).status,201);
});
test('actual middleware separately bounds multipart attachments and ordinary JSON',async()=>{
 const f=setup();assert.equal((await f.upload({file:new File([new Uint8Array(11*1024*1024)],'too-large.txt',{type:'text/plain'})})).status,413);
 assert.equal((await f.request('/api/conversations/conversation/messages',{method:'POST',body:JSON.stringify({body:'x'.repeat(65536)})})).status,413);assert.equal(f.objects.size,0);
});
test('actual middleware revalidates session revocation during private download',async()=>{
 const f=setup(),upload=await f.upload();assert.equal(upload.status,201);const attachment=await upload.json();f.R2.beforeGet=()=>f.sqlite.exec("DELETE FROM synthetic_sessions WHERE id='session-alice'");
 const response=await f.request(attachment.url);assert.equal(response.status,401);assert.ok(!(await response.text()).includes('Synthetic file'));
});
test('actual middleware keeps attachments private from pending and removed participants',async()=>{
 const f=setup(),attachment=await(await f.upload()).json();assert.equal((await f.request('/api/conversations/conversation/messages',{method:'POST',body:{body:'',attachments:[attachment.id],expectedAccountId:'alice',requestId:crypto.randomUUID()}})).status,201);
 for(const status of ['pending','left','removed']){f.sqlite.prepare("UPDATE conversation_members SET status=? WHERE member_id='bob'").run(status);assert.equal((await f.request(attachment.url,{account:'bob',session:'session-bob'})).status,404)}
 assert.equal(f.objects.size,1);
});

test('existing hourly scheduled entry point invokes bounded cleanup without auth or push activation',async()=>{
 const f=setup();assert.equal((await f.upload()).status,201);f.sqlite.exec("UPDATE conversation_attachments SET state='cancelled'");const work=[];
 worker.scheduled({cron:'0 * * * *',scheduledTime:Date.now()},{DB:f.DB,R2:f.R2},{waitUntil:promise=>work.push(promise)});
 assert.equal(work.length,1);await Promise.all(work);assert.equal(f.objects.size,0);const configured=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));assert.ok(configured.triggers.crons.includes('0 * * * *'));
});
