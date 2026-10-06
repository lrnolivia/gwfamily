import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialState,reducer} from '../src/data-adapter.js';
test('post tags persist through preview posting without creating people or grants',()=>{
 const state=initialState(),members=structuredClone(state.members),post={text:'Family memory',authorId:state.selfId,memberIds:['shirley',state.selfId]};
 const next=reducer(state,{type:'ADD_POST',post});assert.deepEqual(next.posts[0].memberIds,post.memberIds);assert.deepEqual(next.members,members);assert.deepEqual(next.compose,{});
});
test('family relational inputs use shared directory selector with scoped ancestor tags',()=>{
 const read=p=>fs.readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
 assert.match(read('planner.jsx'),/MemberPicker label="Organizer contact"/);
 assert.match(read('memories.jsx'),/MemberPicker label="Find family to tag" purpose="tag"/);
 assert.match(read('react-app.jsx'),/MemberPicker label="Family in this post" purpose="tag"/);
 assert.match(read('member-tags.jsx'),/personKind==='ancestor'/);
});
