import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {command,readPost,familyState} from '../src/family-service.mjs';
const actor=(id,extra={})=>({id,status:'active',group:'family',roles:[],canPost:true,isLeader:false,...extra});
async function setup(){const s=database();seed(s.sqlite);const send=(person,input)=>command(s.DB,person,{requestId:crypto.randomUUID(),...input});const post=await send(actor('alice'),{type:'ADD_POST',post:{text:'Original post'}});const comment=await send(actor('bob'),{type:'ADD_COMMENT',targetId:post.id,text:'Original comment'});return {...s,send,post,comment};}
test('authors, moderators and leaders edit and delete; other members and pending authors cannot',async()=>{
 for(const extra of [{id:'alice'}, {id:'owner',roles:['moderator']},{id:'owner',isLeader:true}]){const s=await setup(),person=actor(extra.id,extra);await s.send(person,{type:'EDIT_POST',id:s.post.id,expectedText:'Original post',text:'Changed post'});assert.equal((await readPost(s.DB,actor('bob'),s.post.id)).body,'Changed post');await s.send(person,{type:'DELETE_POST',id:s.post.id,expectedText:'Changed post'});assert.equal(await readPost(s.DB,actor('alice'),s.post.id),null);assert.equal(s.sqlite.prepare('SELECT count(*) n FROM audit_log WHERE subject_id=?').get(s.post.id).n,2);s.sqlite.close();}
 const s=await setup();for(const person of [actor('bob'),actor('alice',{status:'pending'})])for(const type of ['EDIT_POST','DELETE_POST'])await assert.rejects(s.send(person,{type,id:s.post.id,expectedText:'Original post',text:'No'}),e=>e.status===403);
 await s.send(actor('alice',{canPost:false}),{type:'EDIT_POST',id:s.post.id,expectedText:'Original post',text:'Author may still fix their post'});s.sqlite.close();
});
test('editing preserves attachments, poll votes and original ownership; replay returns the same receipt',async()=>{
 const s=await setup();s.sqlite.prepare('UPDATE posts SET metadata_json=? WHERE id=?').run(JSON.stringify({files:[{id:'kept'}],poll:{question:'Keep?',options:['yes','no'],mode:'single'}}),s.post.id);
 const input={type:'EDIT_POST',requestId:crypto.randomUUID(),id:s.post.id,expectedText:'Original post',text:'Updated copy'};const first=await command(s.DB,actor('alice'),input);assert.deepEqual(await command(s.DB,actor('alice'),input),first);const row=await readPost(s.DB,actor('bob'),s.post.id);assert.equal(row.author_id,'alice');assert.equal(JSON.parse(row.metadata_json).files[0].id,'kept');assert.equal(JSON.parse(row.metadata_json).poll.question,'Keep?');assert.equal(s.sqlite.prepare('SELECT count(*) n FROM audit_log WHERE subject_id=?').get(s.post.id).n,1);s.sqlite.close();
});
test('a stale edit and an atomic race cannot overwrite new copy or leave a success receipt',async()=>{
 const s=await setup();await assert.rejects(s.send(actor('alice'),{type:'EDIT_POST',id:s.post.id,expectedText:'Old copy',text:'No'}),e=>e.status===409);
 const before=s.DB.batch;s.DB.batch=async statements=>{s.sqlite.prepare('UPDATE posts SET body=? WHERE id=?').run('Second device',s.post.id);return before(statements)};
 const requestId=crypto.randomUUID();await assert.rejects(command(s.DB,actor('alice'),{type:'EDIT_POST',id:s.post.id,expectedText:'Original post',text:'No',requestId}),e=>e.status===409);assert.equal((await readPost(s.DB,actor('alice'),s.post.id)).body,'Second device');assert.equal(s.sqlite.prepare('SELECT count(*) n FROM command_receipts WHERE request_id=?').get(requestId).n,0);s.sqlite.close();
});
test('comment author and leaders can manage comments; deleting keeps child replies accessible',async()=>{
 const s=await setup(),reply=await s.send(actor('alice'),{type:'ADD_COMMENT',targetId:s.post.id,parentId:s.comment.id,text:'Keep this reply'});
 await assert.rejects(s.send(actor('alice'),{type:'EDIT_COMMENT',id:s.comment.id,expectedText:'Original comment',text:'No'}),e=>e.status===403);
 await s.send(actor('bob'),{type:'EDIT_COMMENT',id:s.comment.id,expectedText:'Original comment',text:'Edited comment'});
 await s.send(actor('owner',{isLeader:true}),{type:'DELETE_COMMENT',id:s.comment.id,expectedText:'Edited comment'});
 const state=await familyState(s.DB,actor('bob'));assert.deepEqual(state.comments[s.post.id].map(x=>x.id),[reply.id]);assert.equal(state.comments[s.post.id][0].text,'Keep this reply');s.sqlite.close();
});
test('privileged roles still cannot mutate a private group they cannot read',async()=>{
 const s=await setup(),post=await s.send(actor('alice'),{type:'ADD_POST',post:{text:'Private original',groupId:'private-group'}});
 for(const type of ['EDIT_POST','DELETE_POST'])await assert.rejects(s.send(actor('owner',{roles:['moderator']}),{type,id:post.id,expectedText:'Private original',text:'No'}),e=>e.status===404);s.sqlite.close();
});
test('photo comments use the same permissions, receipts, report and soft delete path',async()=>{
 const s=await setup();s.sqlite.prepare('UPDATE user SET image=? WHERE id=?').run('https://example.test/photo.png','alice');const photoTargetSpec={kind:'profile',id:'alice',index:0,photo:'https://example.test/photo.png'};
 const c=await s.send(actor('bob'),{type:'ADD_COMMENT',photoTarget:photoTargetSpec,text:'Photo comment'});
 await assert.rejects(s.send(actor('alice'),{type:'EDIT_COMMENT',photoTarget:photoTargetSpec,id:c.id,expectedText:'Photo comment',text:'No'}),e=>e.status===403);
 await s.send(actor('bob'),{type:'EDIT_COMMENT',photoTarget:photoTargetSpec,id:c.id,expectedText:'Photo comment',text:'Edited photo comment'});
 const report=await s.send(actor('alice'),{type:'REPORT',photoTarget:photoTargetSpec,targetId:c.id,reason:'Synthetic fixture report'});await s.send(actor('owner',{roles:['moderator']}),{type:'MODERATE',id:report.id,status:'removed'});
 assert.ok(s.sqlite.prepare('SELECT deleted_at FROM photo_comments WHERE id=?').get(c.id).deleted_at);s.sqlite.close();
});

test('optional formatted posts roundtrip natively and edits retain the format; legacy text stays literal',async()=>{
 const s=await setup();try{
  const plain=await s.send(actor('alice'),{type:'ADD_POST',post:{text:'**Literal stars**'}});
  const rich=await s.send(actor('alice'),{type:'ADD_POST',post:{text:'**Family news**',textFormat:'markdown'}});
  let state=await familyState(s.DB,actor('bob'));assert.equal(state.posts.find(p=>p.id===rich.id).textFormat,'markdown');assert.equal(state.posts.find(p=>p.id===plain.id).textFormat,undefined);assert.equal(state.posts.find(p=>p.id===plain.id).text,'**Literal stars**');
  await s.send(actor('alice'),{type:'EDIT_POST',id:rich.id,expectedText:'**Family news**',text:'**Updated** family news'});
  state=await familyState(s.DB,actor('bob'));assert.equal(state.posts.find(p=>p.id===rich.id).textFormat,'markdown');assert.equal(state.posts.find(p=>p.id===rich.id).text,'**Updated** family news');
  for(const textFormat of ['html','unknown',null,{}])await assert.rejects(s.send(actor('alice'),{type:'ADD_POST',post:{text:'Bad format',textFormat}}),/Unsupported post text format/);
 }finally{s.sqlite.close()}
});
