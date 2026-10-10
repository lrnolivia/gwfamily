import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {createApp} from '../src/worker.mjs';
import {command} from '../src/family-service.mjs';
import {reportQueue} from '../src/content-history.mjs';
// Fictional participants only. Same signed-in harness as messaging.test.mjs.
function setup(){
 const value=database();seed(value.sqlite);
 value.sqlite.exec(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('carol','Carol','carol@example.test',1,0,0),('dave','Dave','dave@example.test',1,0,0),('minor','Minor','minor@example.test',1,0,0),('unverified','Unverified','unverified@example.test',0,0,0),('incomplete','Incomplete','incomplete@example.test',1,0,0);
 INSERT INTO members(id,status) VALUES('carol','active'),('dave','active'),('minor','active'),('unverified','active'),('incomplete','active');
 INSERT INTO profiles(member_id,birthday,completed) VALUES('carol','1990-01-01',1),('dave','1990-01-01',1),('minor','2020-01-01',1),('unverified','1990-01-01',1);
 INSERT INTO dependents(id,guardian_id,name,birthday,gender) VALUES('child','alice','Private child','2020-01-01','Prefer not to say');
 INSERT INTO memorials(id,name,created_by) VALUES('ancestor','Remembered ancestor','owner');
 INSERT INTO posts(id,author_id,body) VALUES('public-post','alice','A public post');
 INSERT INTO posts(id,author_id,body,group_id) VALUES('private-post','alice','Private post','private-group');`);
 const env={DB:value.DB,BETTER_AUTH_SECRET:'synthetic-test-secret-not-real',AUTH_ORIGIN:'https://family.example.test'};
 // Separate signed-in cookie sessions share the same persistent database, as in production.
 const sessions=new Map(['alice','bob','owner','carol','dave','pending','minor','unverified','incomplete'].map(id=>['session-'+id,id]));
 const app=createApp(()=>({api:{getSession:async({headers})=>{const token=headers.get('Cookie')?.match(/(?:^|;\s*)gw_session=([^;]+)/)?.[1],id=sessions.get(token);return id?{user:{id,emailVerified:id!=='unverified'}}:null}}}));
 async function call(user,path,method='GET',body,headers={}){
  const response=await app.request(env.AUTH_ORIGIN+path,{method,headers:{...(user?{Cookie:'gw_session=session-'+user}:{}),Origin:env.AUTH_ORIGIN,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})},env);
  return {status:response.status,data:await response.json(),headers:response.headers};
 }
 const create=async(user,ids=['bob'],type='direct',name='')=>{const result=await call(user,'/api/conversations','POST',{requestId:crypto.randomUUID(),type,memberIds:ids,...(name?{name}:{})});assert.equal(result.status,201,JSON.stringify(result.data));return result.data.id};
 const accept=async(user,id)=>{const result=await call(user,`/api/conversations/${id}/invitation`,'POST',{action:'accept'});assert.equal(result.status,200,JSON.stringify(result.data));};
 const send=async(user,id,body,requestId=crypto.randomUUID())=>call(user,`/api/conversations/${id}/messages`,'POST',{requestId,body});
 return {...value,env,app,call,create,accept,send};
}

const owner={id:'owner',status:'active',group:'family',roles:['admin','moderator','planner','treasurer'],canPost:true,isLeader:true};
test('a block stops repeat invitations both ways without revealing itself, and ends waiting invitations',async()=>{
 const s=setup();
 const first=await s.call('bob','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'group',name:'Fictional planning',memberIds:['alice','carol']});assert.equal(first.status,201);
 assert.equal((await s.call('alice','/api/conversations/blocks','POST',{memberId:'bob',blocked:true})).status,200);
 const inbox=await s.call('alice','/api/conversations');assert.equal(JSON.stringify(inbox.data).includes(first.data.id),false,'the waiting invitation ended');
 for(const [from,to] of [['bob','alice'],['alice','bob']]){const again=await s.call(from,'/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:[to]});assert.equal(again.status,400);assert.equal(/block/i.test(again.data.error),false,'refusal does not reveal the block')}
 const add=await s.call('bob','/api/conversations/'+first.data.id+'/members','POST',{memberIds:['alice']});assert.equal(add.status,400);
 assert.equal((await s.call('bob','/api/conversations/recipients')).data.members.some(m=>m.id==='alice'),false);
 assert.deepEqual((await s.call('alice','/api/conversations/blocks')).data.blocks.map(b=>b.memberId),['bob']);
 assert.equal((await s.call('bob','/api/conversations/blocks')).data.blocks.length,0,'blocks are private to the blocker');
 await s.call('alice','/api/conversations/blocks','POST',{memberId:'bob',blocked:false});
 assert.equal((await s.call('bob','/api/conversations','POST',{requestId:crypto.randomUUID(),type:'direct',memberIds:['alice']})).status,201);
});
test('a message report keeps only the chosen messages and grants moderators no conversation access',async()=>{
 const s=setup();const id=await s.create('alice',['bob']);await s.call('bob','/api/conversations/'+id+'/invitation','POST',{action:'accept'});
 const send=async(user,body)=>(await s.call(user,'/api/conversations/'+id+'/messages','POST',{requestId:crypto.randomUUID(),body})).data;
 const a=await send('alice','Fictional private hello'),b=await send('bob','Fictional unkind message'),c=await send('bob','Fictional unrelated news');
 const ids=[a,b,c].map(x=>x.message?.id||x.id);
 assert.equal((await s.call('carol','/api/conversations/'+id+'/reports','POST',{requestId:crypto.randomUUID(),messageIds:[ids[1]],reason:'Probe'})).status,404,'non-participants cannot report');
 assert.equal((await s.call('alice','/api/conversations/'+id+'/reports','POST',{requestId:crypto.randomUUID(),messageIds:[ids[0]],reason:'Only mine'})).status,400);
 const requestId=crypto.randomUUID(),report=await s.call('alice','/api/conversations/'+id+'/reports','POST',{requestId,messageIds:[ids[1]],reason:'Fictional reason'});assert.equal(report.status,200,JSON.stringify(report.data));
 assert.equal((await s.call('alice','/api/conversations/'+id+'/reports','POST',{requestId,messageIds:[ids[1]],reason:'Fictional reason'})).data.id,report.data.id,'retry is idempotent');
 const queue=(await reportQueue(s.DB,owner)).reports.filter(r=>r.kind==='message');assert.equal(queue.length,1);
 assert.match(queue[0].target.excerpt,/Fictional unkind message/);assert.doesNotMatch(queue[0].target.excerpt,/private hello|unrelated news/);
 assert.equal((await s.call('owner','/api/conversations/'+id)).status,404,'moderators gain no access');
 await command(s.DB,owner,{type:'MODERATE',kind:'message',id:report.data.id,status:'handled',requestId:crypto.randomUUID()});
 await assert.rejects(()=>command(s.DB,owner,{type:'MODERATE',kind:'message',id:report.data.id,status:'dismissed',requestId:crypto.randomUUID()}),e=>e.status===409);
 assert.equal((await reportQueue(s.DB,owner,{status:'resolved'})).reports.find(r=>r.id===report.data.id).status,'handled');
});
