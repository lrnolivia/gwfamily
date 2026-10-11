import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePostPage,mergeMemoryPage,mergeCommentPage,historyQuery,memoryMatches,canRemoveMemory} from '../src/content-history-model.js';
import {reducer,initialState} from '../src/data-adapter.js';

const base={mode:'live',selfId:'a',posts:[{id:'p2'},{id:'p1'}],comments:{p2:[{id:'c3'}]},commentHistory:{p2:{total:3,cursor:'cur-c3'}},reactions:{},reactionCounts:{},reactionMembers:{},pollSelections:{},memories:[{id:'m2'},{id:'featured-old'}],postsCursor:'cur-p1',memoriesCursor:'cur-m'};

test('older pages append without duplicates and carry the next cursor',()=>{
 const merged=mergePostPage(base,{posts:[{id:'p1'},{id:'p0'}],comments:{p0:[{id:'x'}]},postsCursor:null});
 assert.deepEqual(merged.posts.map(p=>p.id),['p2','p1','p0']);assert.equal(merged.postsCursor,null);assert.deepEqual(merged.comments.p0,[{id:'x'}]);
 const memories=mergeMemoryPage(base,{memories:[{id:'featured-old'},{id:'m1'}],memoriesCursor:'next'});
 assert.deepEqual(memories.memories.map(m=>m.id),['m2','featured-old','m1']);assert.equal(memories.memoriesCursor,'next');
});
test('earlier comments go first, oldest first, and the cursor clears at the start',()=>{
 const once=mergeCommentPage(base,{postId:'p2',comments:[{id:'c1'},{id:'c2'}],cursor:null});
 assert.deepEqual(once.comments.p2.map(c=>c.id),['c1','c2','c3']);assert.equal(once.commentHistory.p2,undefined);
 const again=mergeCommentPage(once,{postId:'p2',comments:[{id:'c2'}],cursor:null});assert.deepEqual(again.comments.p2.map(c=>c.id),['c1','c2','c3']);
});
test('history query omits empty values and memory search covers tags',()=>{
 assert.equal(historyQuery('/api/feed',{before:'a b',through:''}),'/api/feed?before=a+b');assert.equal(historyQuery('/api/feed',{}),'/api/feed');
 assert.equal(memoryMatches({title:'Lake',tags:['Picnic']},'picnic'),true);assert.equal(memoryMatches({title:'Lake'},'river'),false);
 assert.equal(canRemoveMemory({mode:'live',selfId:'a',capabilities:{}},{authorId:'b'}),false);assert.equal(canRemoveMemory({mode:'live',selfId:'a',capabilities:{moderate:true}},{authorId:'b'}),true);
});
test('preview removal hides a memory with its feed post and restore returns both',()=>{
 const start={...initialState(),mode:'preview',selfId:'me',members:[{id:'me'}],memories:[{id:'mem',authorId:'me',title:'Fictional picnic'}],posts:[{id:'mem',authorId:'me',memoryId:'mem',text:'Fictional picnic',createdAt:1}],featuredMemoryIds:['mem'],primaryMemoryId:'mem',lastId:0};
 const removed=reducer(start,{type:'DELETE_MEMORY',id:'mem'});
 assert.equal(removed.memories.length,0);assert.equal(removed.posts.length,0);assert.deepEqual(removed.featuredMemoryIds,[]);assert.equal(removed.previewRemoved.length,1);
 assert.throws(()=>reducer({...start,selfId:'other'},{type:'DELETE_MEMORY',id:'mem'}),/uploader or a moderator/);
 const viaPost=reducer(start,{type:'DELETE_POST',id:'mem',expectedText:'Fictional picnic'});assert.equal(viaPost.memories.length,0);
 const restored=reducer(removed,{type:'RESTORE_CONTENT',id:removed.previewRemoved[0].id});
 assert.equal(restored.memories.length,1);assert.equal(restored.posts.length,1);assert.equal(restored.previewRemoved.length,0);
});
