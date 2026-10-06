import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reducer,loadLocalState,saveLocalState,resetPreview,PREVIEW_KEY,previewCapabilities} from '../src/data-adapter.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
test('correct identities, no invented birthdays, memorials outside accounts',()=>{
 const s=initialState();assert.equal(s.members.length,19);assert.equal(s.memorials.length,6);
 assert.equal(s.members.find(m=>m.id==='aaron').circle,'family');assert.equal(s.members.find(m=>m.id==='lauren').name,'Lauren Olivia White');
 assert.equal(s.memorials.find(m=>m.id==='annie').maidenName,'Green');assert.equal(s.memorials.find(m=>m.id==='bonnie').name,'Bonnie Tucker');
 assert.ok(s.members.every(m=>m.birthday===null&&m.adult&&!m.registered&&m.origin==='seed'));
 const ids=new Set(s.members.map(m=>m.id));assert.ok(s.memorials.every(m=>!ids.has(m.id)));assert.ok(s.posts.every(p=>ids.has(p.authorId)));assert.ok(Object.values(s.comments).flat().every(c=>ids.has(c.authorId)));
 assert.equal(s.relationships.filter(r=>r.type==='parent'&&r.from==='monique').length,2);
});
test('preview persistence and reset leave live and unrelated storage untouched',()=>{
 const st=storage();st.setItem('gwfamily:live:v1','real');st.setItem('gw-theme','light');
 let s=reducer(initialState(),{type:'SET_DRAFT',kind:'post',value:'Preserve this draft'});s=reducer(s,{type:'RSVP',value:{count:2}});
 assert.equal(saveLocalState(s,st).ok,true);assert.equal(loadLocalState(st).drafts.post,'Preserve this draft');assert.equal(loadLocalState(st).rsvp.count,2);
 resetPreview(st);assert.equal(st.getItem(PREVIEW_KEY),null);assert.equal(st.getItem('gwfamily:live:v1'),'real');assert.equal(st.getItem('gw-theme'),'light');assert.equal(loadLocalState(st).rsvp,null);
});
test('preview adapter cannot persist or mutate a live state; corrupt data recovers safely',()=>{
 const st=storage(),live={...initialState(),mode:'live'};assert.equal(saveLocalState(live,st).ok,false);assert.equal(reducer(live,{type:'SET_FEES',value:'paid'}),live);
 st.setItem(PREVIEW_KEY,'broken');assert.equal(loadLocalState(st).mode,'preview');st.setItem(PREVIEW_KEY,JSON.stringify({schema:2,mode:'live',state:live}));assert.equal(loadLocalState(st).onboarding,'welcome');
 assert.equal(previewCapabilities.networkWrites,false);assert.equal(previewCapabilities.payments,false);assert.equal(previewCapabilities.sendInvitations,false);
});
test('storage failures are reported and do not erase the prior checkpoint',()=>{
 const st=storage();saveLocalState(initialState(),st);const prior=st.getItem(PREVIEW_KEY);const failure={...st,setItem:()=>{throw Error('quota')}};
 assert.equal(saveLocalState(initialState(),failure).ok,false);assert.equal(st.getItem(PREVIEW_KEY),prior);
});
test('reset creates independent fresh arrays',()=>{const a=initialState();a.members[0].name='Changed';a.comments['post-generations'].push({});const b=initialState();assert.equal(b.members[0].name,'Lauren Olivia White');assert.equal(b.comments['post-generations'].length,2)});

import {validBirthday,validateMember,birthdayEntries} from '../src/member-model.js';
test('all added people and signup require a real calendar birthday; children require gender',()=>{
 assert.equal(validBirthday('2025-02-30'),false);assert.equal(validBirthday('2024-02-29'),true);assert.equal(validBirthday('2999-01-01'),false);
 let s=initialState();assert.equal(reducer(s,{type:'ADD_PERSON',member:{name:'Fictional adult'}}),s);
 assert.ok(validateMember({name:'Example',birthday:'2000-01-01'},{child:true}));assert.ok(validateMember({name:'Example',birthday:'2000-01-01',email:'bad'},{signup:true}));
 s=reducer(s,{type:'ADD_PERSON',member:{name:'Monique Rivers',birthday:'2000-01-01',email:'preview@example.test'},signup:true});
 assert.notEqual(s.selfId,'monique');assert.equal(s.members.find(m=>m.id==='monique').registered,false);assert.equal(s.members.at(-1).registered,true);
});
test('children remain managed by their creator and birthday posts are explicit local and deduplicated',()=>{
 let s=initialState();s=reducer(s,{type:'ADD_PERSON',child:true,member:{name:'Fictional Child',gender:'Prefer not to say',birthday:'2020-01-01'}});
 const child=s.members.at(-1);assert.equal(child.managedBy,'lauren');assert.equal(birthdayEntries(s.members,new Date(2026,0,2)).length,1);
 const other={...s,selfId:'monique'};assert.equal(reducer(other,{type:'UPDATE_DEPENDENT',member:{...child,name:'Wrong owner'}}),other);
 s=reducer(s,{type:'PREVIEW_BIRTHDAYS',date:'2026-01-01'});assert.equal(s.posts.filter(p=>p.birthdayFor===child.id).length,1);
 s=reducer(s,{type:'PREVIEW_BIRTHDAYS',date:'2026-01-01'});assert.equal(s.posts.filter(p=>p.birthdayFor===child.id).length,1);
 assert.equal(reducer(s,{type:'ADD_POST',post:{authorId:'lloyd',text:'Must reject'}}),s);
});

import {profilePalette,contrast,themeSongInfo,socialInfo,hasPostMedia} from '../src/profile-model.js';
test('profile palettes keep body, raised surfaces and actions readable across light/dark and color range',()=>{
 for(let value=0;value<=0xffffff;value+=47831){const color='#'+value.toString(16).padStart(6,'0');for(const theme of ['light','dark']){const p=profilePalette(color,theme);for(const bg of ['--bg','--surface','--raised']){assert.ok(contrast(p['--text'],p[bg])>=4.5,`${color} ${theme} ${bg}`);assert.ok(contrast(p['--muted'],p[bg])>=4.5)}assert.ok(contrast(p['--ink'],p['--accent'])>=4.5)}}
});
test('music and socials only accept exact safe HTTPS services',()=>{
 const track='https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ';assert.ok(themeSongInfo(track));
 for(const bad of ['http://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ',track+'/evil',track.replace('spotify.com','spotify.com.evil.test'),track.replace('https://','https://user@'),'javascript:alert(1)','https://example.test/frame'])assert.equal(themeSongInfo(bad),null);
 assert.equal(themeSongInfo('https://music.apple.com/us/album/example/123?i=456').embed,'https://embed.music.apple.com/us/album/example/123?i=456');
 assert.ok(socialInfo('https://www.instagram.com/example'));assert.equal(socialInfo('https://instagram.com.evil.test/example'),null);
});
test('Media tab includes image, video and audio; Posts selection need not exclude any media',()=>{assert.equal(hasPostMedia({text:'plain'}),false);assert.equal(hasPostMedia({image:'photo.png'}),true);assert.equal(hasPostMedia({files:[{type:'video/mp4'}]}),true);assert.equal(hasPostMedia({backgroundMedia:{url:'sample'}}),true)});

test('profile control colors separate from their surface with readable text',()=>{for(const color of ['#4f996c','#ffcc00','#ffffff','#000000','#ca247c','#3988ff'])for(const theme of ['light','dark']){const p=profilePalette(color,theme);assert.ok(contrast(p['--control'],p['--surface'])>=3);assert.ok(contrast(p['--control-text'],p['--control'])>=4.5)}});
