import test from 'node:test';import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';import {command,familyState} from '../src/family-service.mjs';import {createApp} from '../src/worker.mjs';
import {feedPage,memoryPage,commentPage,searchContent,reportQueue,recentlyRemoved,decodeCursor,COMMENT_CAP} from '../src/content-history.mjs';
// Fictional, isolated in-memory fixtures only.
const member=(id,roles=[])=>({id,status:'active',group:'family',roles,canPost:true,isLeader:id==='owner'});
const owner=member('owner',['admin','moderator','planner','treasurer']),alice=member('alice'),bob=member('bob'),moderator=member('bob',['moderator']);
function setup(){const {sqlite,DB}=database();seed(sqlite);return {sqlite,DB}}
const send=(DB,actor,type,data={})=>command(DB,actor,{type,requestId:crypto.randomUUID(),...data});
const at=n=>new Date(Date.UTC(2020,0,1)+n*60000).toISOString().replace('T',' ').slice(0,19);
async function memoryFixture(DB){for(const id of ['photo-one','photo-two'])await DB.prepare('INSERT INTO media(id,owner_id,object_key,name,mime_type,size_bytes) VALUES(?,?,?,?,?,?)').bind(id,'alice',id,id,'image/jpeg',12).run();await send(DB,alice,'ADD_MEMORY',{memory:{id:'memory-one',image:'/api/media/photo-one',title:'Picnic by the lake'}});}
function mediaGet(DB){const env={DB,BETTER_AUTH_SECRET:'test-only-long-enough-secret-not-real',AUTH_ORIGIN:'https://example.test',R2:{get:async()=>({body:new Uint8Array([1,2,3])})}};const app=createApp(()=>({api:{getSession:async({headers})=>({user:{id:headers.get('x-test-user'),emailVerified:true}})}}));return (id,who)=>app.request(env.AUTH_ORIGIN+'/api/media/'+id,{headers:{'x-test-user':who}},env)}

test('removing a memory removes its feed post, saved and featured references and shared media access, and restore brings all back',async()=>{
 const {DB,sqlite}=setup();await memoryFixture(DB);const get=mediaGet(DB);
 await send(DB,bob,'TOGGLE_FAVORITE',{id:'memory-one'});await send(DB,owner,'FEATURE_MEMORY',{id:'memory-one',approved:true,primary:true});
 assert.equal((await get('photo-one','bob')).status,200);
 await assert.rejects(()=>send(DB,bob,'DELETE_MEMORY',{id:'memory-one'}),e=>e.status===403);
 const removed=await send(DB,alice,'DELETE_MEMORY',{id:'memory-one'});
 const state=await familyState(DB,bob);
 assert.equal(state.memories.length,0);assert.equal(state.posts.length,0);assert.deepEqual(state.favorites,[]);assert.deepEqual(state.featuredMemoryIds,[]);assert.equal(state.primaryMemoryId,null);
 assert.equal((await get('photo-one','bob')).status,404);assert.equal((await get('photo-one','alice')).status,200,'the uploader keeps their own file');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM saved_items').get().n,1,'the saved row is kept for restore');
 assert.equal((await recentlyRemoved(DB,alice)).removed[0].targetId,'memory-one');assert.equal((await recentlyRemoved(DB,bob)).removed.length,0);
 await assert.rejects(()=>send(DB,bob,'RESTORE_CONTENT',{id:removed.deletionId}),e=>e.status===403);
 await send(DB,alice,'RESTORE_CONTENT',{id:removed.deletionId});
 const back=await familyState(DB,bob);assert.equal(back.memories.length,1);assert.equal(back.posts.length,1);assert.deepEqual(back.favorites,['memory-one']);assert.deepEqual(back.featuredMemoryIds,['memory-one']);assert.equal((await get('photo-one','bob')).status,200);
 await assert.rejects(()=>send(DB,alice,'RESTORE_CONTENT',{id:removed.deletionId}),e=>e.status===409);
});
test('deleting only the memory feed post is not enough: it removes the memory too',async()=>{
 const {DB}=setup();await memoryFixture(DB);
 await send(DB,alice,'DELETE_POST',{id:'memory-one',expectedText:'Picnic by the lake'});
 const state=await familyState(DB,bob);assert.equal(state.memories.length,0);assert.equal(state.posts.length,0);
 const [entry]=(await recentlyRemoved(DB,alice)).removed;assert.equal(entry.kind,'memory');
});
test('moderators remove reported memories recoverably; authors cannot undo a moderator removal',async()=>{
 const {DB}=setup();await memoryFixture(DB);
 const report=await send(DB,bob,'REPORT',{targetId:'memory-one',reason:'Wrong family'});
 await assert.rejects(()=>reportQueue(DB,alice),e=>e.status===403);
 const queue=await reportQueue(DB,owner);assert.equal(queue.reports[0].target.kind,'memory');assert.equal(queue.reports[0].target.excerpt,'Picnic by the lake');assert.deepEqual(queue.reports[0].target.route,{type:'memory',id:'memory-one'});assert.equal(queue.reports[0].reporterName,'Bob');
 const result=await send(DB,owner,'MODERATE',{id:report.id,status:'removed'});
 await assert.rejects(()=>send(DB,moderator,'MODERATE',{id:report.id,status:'dismissed'}),e=>e.status===409);
 assert.equal((await reportQueue(DB,owner)).reports.length,0);assert.equal((await reportQueue(DB,owner,{status:'resolved'})).reports[0].status,'removed');
 assert.equal((await familyState(DB,bob)).memories.length,0);
 await assert.rejects(()=>send(DB,alice,'RESTORE_CONTENT',{id:result.deletionId}),e=>e.status===403);
 await send(DB,owner,'RESTORE_CONTENT',{id:result.deletionId});assert.equal((await familyState(DB,bob)).memories.length,1);
});
test('the report queue never exposes private group content to a moderator outside the group',async()=>{
 const {DB}=setup();const post=await send(DB,alice,'ADD_POST',{post:{text:'Group secret',groupId:'private-group'}});
 const report=await send(DB,alice,'REPORT',{targetId:post.id,reason:'Needs a look'});
 const [entry]=(await reportQueue(DB,owner)).reports;assert.equal(entry.id,report.id);assert.equal(entry.target.excerpt,'');assert.equal(entry.target.private,true);assert.equal(entry.target.route,null);
});
test('posts, memories and comments page by stable keyset without starvation, gaps or duplicates',async()=>{
 const {DB,sqlite}=setup();
 const insertPost=sqlite.prepare('INSERT INTO posts(id,author_id,body,created_at) VALUES(?,?,?,?)'),insertMemory=sqlite.prepare('INSERT INTO memories(id,author_id,data_json,created_at) VALUES(?,?,?,?)'),insertComment=sqlite.prepare('INSERT INTO comments(id,post_id,author_id,body,created_at) VALUES(?,?,?,?,?)');
 sqlite.exec('BEGIN');
 // Duplicate timestamps on purpose: ties must break by id, never skip or repeat.
 for(let i=0;i<260;i++)insertPost.run('post-'+String(i).padStart(4,'0'),'alice','Post '+i,at(Math.floor(i/3)));
 for(let i=0;i<330;i++)insertMemory.run('memory-'+String(i).padStart(4,'0'),'alice',JSON.stringify({title:'Memory '+i,image:'/api/media/none'}),at(Math.floor(i/4)));
 // An old post carries 1,050 comments; newer posts each have a few. Old volume must not starve them.
 for(let i=0;i<1050;i++)insertComment.run('old-'+String(i).padStart(5,'0'),'post-0000','bob','Old comment '+i,at(500+i));
 for(let p=200;p<260;p++)for(let i=0;i<3;i++)insertComment.run(`new-${p}-${i}`,'post-'+String(p).padStart(4,'0'),'bob','New comment',at(2000+p));
 sqlite.exec('COMMIT');
 const first=await familyState(DB,bob);assert.equal(first.posts.length,100);assert.equal(first.memories.length,200);assert.ok(first.postsCursor);assert.ok(first.memoriesCursor);
 for(const p of first.posts.slice(0,60))assert.equal(first.comments[p.id].length,3,'recent posts keep their comments');
 const seen=new Set(first.posts.map(p=>p.id));let cursor=first.postsCursor;while(cursor){const page=await feedPage(DB,bob,{before:cursor});for(const p of page.posts){assert.equal(seen.has(p.id),false,'no duplicate '+p.id);seen.add(p.id)}cursor=page.postsCursor}
 assert.equal(seen.size,260);
 const oldest=(await feedPage(DB,bob,{before:first.postsCursor,limit:100}));const last=(await feedPage(DB,bob,{before:oldest.postsCursor,limit:100}));
 assert.equal(last.comments['post-0000'].length,COMMENT_CAP);assert.equal(last.commentHistory['post-0000'].total,1050);
 const ids=new Set(last.comments['post-0000'].map(c=>c.id));let c=last.commentHistory['post-0000'].cursor;while(c){const page=await commentPage(DB,bob,'post-0000',{before:c});for(const x of page.comments){assert.equal(ids.has(x.id),false);ids.add(x.id)}c=page.cursor}
 assert.equal(ids.size,1050);
 const memories=new Set(first.memories.map(m=>m.id));let mc=first.memoriesCursor;while(mc){const page=await memoryPage(DB,{before:mc});for(const m of page.memories){assert.equal(memories.has(m.id),false);memories.add(m.id)}mc=page.memoriesCursor}
 assert.equal(memories.size,330);
 // Refreshing keeps already-loaded history: one request reloads through the oldest cursor reached.
 const through=(await feedPage(DB,bob,{before:first.postsCursor,limit:50})).postsCursor;const reload=await feedPage(DB,bob,{before:first.postsCursor,through});assert.equal(reload.posts.length,50);
 await assert.rejects(()=>feedPage(DB,bob,{before:'not-a-cursor'}),e=>e.status===400);assert.equal(decodeCursor(''),null);
});
test('search reaches history beyond the first page and respects group privacy',async()=>{
 const {DB,sqlite}=setup();sqlite.exec('BEGIN');for(let i=0;i<150;i++)sqlite.prepare('INSERT INTO posts(id,author_id,body,created_at) VALUES(?,?,?,?)').run('p'+i,'alice',i===0?'Grandma’s 100% pound cake':'Filler',at(i));sqlite.exec('COMMIT');
 const grouped=await send(DB,alice,'ADD_POST',{post:{text:'pound cake secret',groupId:'private-group'}});
 await send(DB,alice,'ADD_COMMENT',{targetId:'p5',text:'Who has the pound cake recipe?'});
 const found=await searchContent(DB,bob,'pound cake');assert.deepEqual(found.posts.map(p=>p.id).sort(),['p0','p5']);
 assert.ok((await searchContent(DB,alice,'pound cake')).posts.some(p=>p.id===grouped.id));
 assert.deepEqual((await searchContent(DB,bob,'100%')).posts.map(p=>p.id),['p0'],'LIKE wildcards are escaped');
 await assert.rejects(()=>searchContent(DB,bob,'a'),e=>e.status===400);
});
