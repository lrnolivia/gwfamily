import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {command,familyState} from '../src/family-service.mjs';
import {createApp} from '../src/worker.mjs';
const actor=id=>({id,status:'active',group:'family',roles:id==='owner'?['admin','planner']:[],canPost:true,isLeader:false});
const send=(DB,id,type,value={})=>command(DB,actor(id),{type,...value,requestId:crypto.randomUUID()});
function setup(){const value=database();seed(value.sqlite);value.sqlite.exec("INSERT INTO memorials(id,name,created_by) VALUES('ancestor','Fictional Ancestor','owner');INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes) VALUES('tag-photo','alice','tag-photo','tag.jpg','image/jpeg',10);");return value}
test('post and memory tags accept directory members and ancestors, deduplicate, and reject private or arbitrary IDs',async()=>{
 const {DB}=setup(),child=await send(DB,'alice','ADD_PERSON',{child:true,member:{name:'Private child',birthday:'2020-01-01',gender:'Prefer not to say'}});
 const p=await send(DB,'alice','ADD_POST',{post:{text:'Remembering together',memberIds:['bob','ancestor','bob']}});
 const m=await send(DB,'alice','ADD_MEMORY',{memory:{id:'tag-memory',image:'/api/media/tag-photo',memberIds:['ancestor','bob']}});
 let state=await familyState(DB,actor('bob'));
 assert.deepEqual(state.posts.find(x=>x.id===p.id).memberIds,['bob','ancestor']);assert.deepEqual(state.memories.find(x=>x.id===m.id).memberIds,['ancestor','bob']);assert.deepEqual(state.posts.find(x=>x.id===m.id).memberIds,['ancestor','bob']);
 await send(DB,'alice','SAVE_MEMORY',{memory:{id:m.id,image:'/api/media/tag-photo',memberIds:['ancestor']}});
 state=await familyState(DB,actor('bob'));assert.deepEqual(state.posts.find(x=>x.id===m.id).memberIds,['ancestor']);
 for(const id of [child.id,'pending','made-up']){
  await assert.rejects(()=>send(DB,'alice','ADD_POST',{post:{text:'Invalid',memberIds:[id]}}),e=>e.status===400);
  await assert.rejects(()=>send(DB,'alice','SAVE_MEMORY',{memory:{id:m.id,image:'/api/media/tag-photo',memberIds:[id]}}),e=>e.status===400);
 }
 await assert.rejects(()=>send(DB,'alice','ADD_POST',{post:{text:'Invalid',memberIds:'ancestor'}}),e=>e.status===400);
});
test('organizer contact uses the living directory and derives name on the server',async()=>{
 const {DB}=setup();
 await send(DB,'owner','DETAILS',{value:{location:'Test',organizerMemberId:'bob',contact:'Unverified name'}});
 let details=(await familyState(DB,actor('alice'))).details;assert.equal(details.organizerMemberId,'bob');assert.equal(details.contact,'Bob');
 await send(DB,'owner','DETAILS',{value:{location:'Updated',contact:'Injected free text'}});
 details=(await familyState(DB,actor('alice'))).details;assert.equal(details.organizerMemberId,'bob');assert.equal(details.contact,'Bob');
 for(const id of ['ancestor','pending','unknown'])await assert.rejects(()=>send(DB,'owner','DETAILS',{value:{organizerMemberId:id}}),e=>e.status===400);
 await send(DB,'owner','DETAILS',{value:{organizerMemberId:''}});details=(await familyState(DB,actor('alice'))).details;assert.equal(details.organizerMemberId,null);assert.equal(details.contact,'');
});
test('ancestors cannot receive shared contact details or notifications',async()=>{
 const {DB}=setup();
 await assert.rejects(()=>send(DB,'alice','SAVE_CONTACT',{contact:{name:'Alice',selectedIds:['ancestor']}}),e=>e.status===400);
 await assert.rejects(()=>send(DB,'alice','SET_SELECTED_NOTIFICATION_IDS',{ids:['ancestor']}),e=>e.status===400);
 await send(DB,'alice','SET_SELECTED_NOTIFICATION_IDS',{ids:['bob']});
 assert.deepEqual((await familyState(DB,actor('alice'))).selectedNotificationIds,['bob']);
});
test('invalid directory selections return a useful 400 response instead of a server error',async()=>{
 const {DB}=setup(),env={DB,BETTER_AUTH_SECRET:'synthetic-test-secret-not-real',AUTH_ORIGIN:'https://family.example.test'};
 const app=createApp(()=>({api:{getSession:async()=>({user:{id:'alice',emailVerified:true}})}}));
 const response=await app.request(env.AUTH_ORIGIN+'/api/commands',{method:'POST',headers:{Origin:env.AUTH_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({type:'ADD_POST',requestId:crypto.randomUUID(),post:{text:'Invalid tag',memberIds:['made-up']}})},env);
 assert.equal(response.status,400);assert.match((await response.json()).error,/directory/);
});
