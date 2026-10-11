import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {command,familyState,readPost} from '../src/family-service.mjs';import {savedItems} from '../src/content-history.mjs';
// Fictional content only.
const member=(id,extra={})=>({id,status:'active',group:'family',roles:[],canPost:true,isLeader:false,...extra});
const alice=member('alice'),bob=member('bob'),leader=member('owner',{roles:['admin','moderator'],isLeader:true});
const send=(DB,actor,type,data={})=>command(DB,actor,{type,requestId:crypto.randomUUID(),...data});
async function setup(){const {sqlite,DB}=database();seed(sqlite);for(const id of ['file-a','file-b','file-c'])await DB.prepare('INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes) VALUES(?,?,?,?,?,?)').bind(id,id==='file-c'?'bob':'alice',id,id+'.png','image/png',10).run();return {sqlite,DB}}
const meta=async(DB,id)=>JSON.parse((await readPost(DB,alice,id)).metadata_json);
test('Saved is private, rechecked on read and searchable across history',async()=>{
 const {DB,sqlite}=await setup();const p=await send(DB,alice,'ADD_POST',{post:{text:'Fictional recipe for peach cobbler'}}),g=await send(DB,alice,'ADD_POST',{post:{text:'Group cobbler plans',groupId:'private-group'}});
 const c=await send(DB,bob,'ADD_COMMENT',{targetId:p.id,text:'Saving this cobbler'});
 await send(DB,bob,'TOGGLE_FAVORITE',{id:p.id});await send(DB,bob,'TOGGLE_FAVORITE',{id:c.id});await send(DB,alice,'TOGGLE_FAVORITE',{id:g.id});
 assert.deepEqual((await savedItems(DB,bob)).items.map(i=>i.kind),['comment','post']);assert.equal((await savedItems(DB,alice)).items.length,1,'saved lists are per person');
 assert.deepEqual((await savedItems(DB,bob,{query:'cobbler'})).items.map(i=>i.id).sort(),[c.id,p.id].sort());
 assert.equal((await savedItems(DB,bob,{query:'zzz'})).items.length,0);
 sqlite.prepare("DELETE FROM family_group_members WHERE member_id='alice'").run();assert.equal((await savedItems(DB,alice)).items.length,0,'lost access means it leaves Saved');
 await send(DB,alice,'DELETE_POST',{id:p.id,expectedText:'Fictional recipe for peach cobbler'});assert.equal((await savedItems(DB,bob)).items.length,0);
});
test('authors correct attachments and tags with stale-edit protection',async()=>{
 const {DB}=await setup();const p=await send(DB,alice,'ADD_POST',{post:{text:'Fictional picnic',files:[{id:'file-a'},{id:'file-b'}],memberIds:['bob']}});
 const before=(await familyState(DB,alice)).posts.find(x=>x.id===p.id);assert.equal(before.revision,0);
 await send(DB,alice,'EDIT_POST',{id:p.id,expectedText:'Fictional picnic',expectedRevision:0,text:'Fictional picnic',files:[{id:'file-b'}],memberIds:[]});
 assert.deepEqual((await meta(DB,p.id)).files.map(f=>f.id),['file-b']);assert.deepEqual((await meta(DB,p.id)).memberIds,[]);
 await assert.rejects(()=>send(DB,alice,'EDIT_POST',{id:p.id,expectedText:'Fictional picnic',expectedRevision:0,text:'Stale'}),e=>e.status===409,'a stale revision is refused');
 await assert.rejects(()=>send(DB,alice,'EDIT_POST',{id:p.id,expectedText:'Fictional picnic',expectedRevision:1,text:'x',files:[{id:'file-b'},{id:'file-c'}]}),e=>e.status===403||e.status===404||e.status===400,'cannot attach someone else’s file');
 await assert.rejects(()=>send(DB,bob,'EDIT_POST',{id:p.id,expectedText:'Fictional picnic',expectedRevision:1,text:'Not mine',files:[]}),e=>e.status===403);
 await send(DB,alice,'EDIT_POST',{id:p.id,expectedText:'Fictional picnic',expectedRevision:1,text:'Fictional picnic',files:[{id:'file-b'},{id:'file-a'}]});assert.deepEqual((await meta(DB,p.id)).files.map(f=>f.id),['file-b','file-a']);
});
test('poll choices lock after the first vote; votes survive edits and closing',async()=>{
 const {DB,sqlite}=await setup();const p=await send(DB,alice,'ADD_POST',{post:{text:'Fictional poll',poll:{question:'Which day?',mode:'single',options:['Sat','Sun']}}});
 await send(DB,alice,'EDIT_POST',{id:p.id,expectedText:'Fictional poll',text:'Fictional poll',poll:{question:'Which weekend day?',options:['Saturday','Sunday']}});
 await send(DB,bob,'POLL_VOTE',{postId:p.id,options:[1]});
 await assert.rejects(()=>send(DB,alice,'EDIT_POST',{id:p.id,expectedText:'Fictional poll',text:'Fictional poll',poll:{options:['Saturday','Monday']}}),e=>e.status===409);
 await send(DB,alice,'EDIT_POST',{id:p.id,expectedText:'Fictional poll',text:'Fictional poll, edited',poll:{closed:true}});
 await assert.rejects(()=>send(DB,alice,'POLL_VOTE',{postId:p.id,options:[0]}),e=>e.status===409);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM poll_votes WHERE post_id=?').get(p.id).n,1);const shown=(await familyState(DB,alice)).posts.find(x=>x.id===p.id);assert.equal(shown.poll.votes[1],1);assert.equal(shown.poll.closed,true);assert.equal(shown.poll.question,'Which weekend day?');
});
test('only Family Leaders pin and unpin leader announcements',async()=>{
 const {DB}=await setup();const a=await send(DB,leader,'ADD_POST',{post:{text:'Fictional announcement',asLeader:true,pinned:true}}),plain=await send(DB,alice,'ADD_POST',{post:{text:'Ordinary post'}});
 await assert.rejects(()=>send(DB,alice,'SET_POST_PIN',{id:a.id,pinned:false}),e=>e.status===403);
 await send(DB,leader,'SET_POST_PIN',{id:a.id,pinned:false});assert.equal((await meta(DB,a.id)).pinned,false);
 await send(DB,leader,'SET_POST_PIN',{id:a.id,pinned:true});assert.equal((await meta(DB,a.id)).pinned,true);
 await assert.rejects(()=>send(DB,leader,'SET_POST_PIN',{id:plain.id,pinned:true}),e=>e.status===409);
});
test('a music link survives posting and reloads from the server; forged link fields are ignored',async()=>{
 const {DB}=await setup();const id='a'.repeat(22);
 const p=await send(DB,alice,'ADD_POST',{post:{text:'Fictional song',link:{url:'https://open.spotify.com/track/'+id,embed:'https://evil.example/frame',service:'Fake'}}});
 const post=(await familyState(DB,bob)).posts.find(x=>x.id===p.id);assert.deepEqual(post.link,{service:'Spotify',url:'https://open.spotify.com/track/'+id,embed:'https://open.spotify.com/embed/track/'+id,type:'track'});
 const q=await send(DB,alice,'ADD_POST',{post:{text:'No link',link:{url:'https://evil.example/x'}}});assert.equal((await familyState(DB,bob)).posts.find(x=>x.id===q.id).link,undefined);
});
