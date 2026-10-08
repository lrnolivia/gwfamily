import test from 'node:test';
import assert from 'node:assert/strict';
import {photoFrameForSave,storedPhotoFrame} from '../src/photo-framing.mjs';
import {DEFAULT_PHOTO_FRAME} from '../../src/photo-framing-model.js';
import {householdCommand} from '../src/households.mjs';
const frame={x:20,y:70,zoom:1.5};
test('profile and household metadata survives unchanged old-client saves and resets for replacements',()=>{
 assert.deepEqual(photoFrameForSave({photo:'/api/media/one',previousPhoto:'/api/media/one',previousFrame:JSON.stringify(frame)}),frame);
 assert.deepEqual(photoFrameForSave({photo:'/api/media/two',previousPhoto:'/api/media/one',previousFrame:frame}),DEFAULT_PHOTO_FRAME);
 assert.deepEqual(photoFrameForSave({photo:null,frame}),DEFAULT_PHOTO_FRAME);assert.deepEqual(storedPhotoFrame('bad json'),DEFAULT_PHOTO_FRAME);
 assert.throws(()=>photoFrameForSave({photo:'/api/media/one',frame:{x:101,y:0}}));
});
test('household manager saves metadata with original URL and no upload mutation',async()=>{
 const queries=[],household={id:'household',role:'head',name:'Family',color:'#123456',color_mode:'custom',photo_url:'/api/media/photo',photo_frame_json:JSON.stringify(DEFAULT_PHOTO_FRAME)};
 const db={prepare(sql){return {bind(){return this},async first(){return sql.includes('JOIN household_members')?household:null}}}};
 await householdCommand(db,{id:'owner'},{type:'SAVE_HOUSEHOLD',householdId:'household',name:'Family',color:'#123456',colorMode:'custom',photo:'/api/media/photo',photoFrame:frame},(sql,...args)=>queries.push({sql,args}),()=>{});
 assert.equal(queries.length,1);assert.match(queries[0].sql,/photo_frame_json/);assert.equal(queries[0].args[2],'/api/media/photo');assert.deepEqual(JSON.parse(queries[0].args[4]),frame);
});
test('outsider cannot change household photo framing',async()=>{
 let writes=0;const db={prepare(){return {bind(){return this},async first(){return null}}}};
 await assert.rejects(()=>householdCommand(db,{id:'outsider'},{type:'SAVE_HOUSEHOLD',householdId:'household',name:'Family',photoFrame:frame},()=>writes++,()=>{}),error=>error.status===403);assert.equal(writes,0);
});
import {pageStorageSnapshots,storedPageSnapshot} from '../src/page-content-storage.mjs';
import {sharedPageDefaults,validateSharedPageContent} from '../../src/shared-content-schema.js';
test('saved v2 presentation round-trips while legacy revision columns remain rollback readable',()=>{
 const value=sharedPageDefaults('home');value.hero={mode:'image',frame:{x:4,y:80,zoom:1},media:[{id:'photo',alt:'Original',frame}]};
 const snapshot=pageStorageSnapshots('home',value);assert.equal(snapshot.extension.panelLayout.version,1);assert.ok(snapshot.extension.panelLayout.panels.every(panel=>panel.kind!=='native'));assert.deepEqual(snapshot.content.hero,{mode:'image',media:[{id:'photo',alt:'Original'}]});
 const restored=storedPageSnapshot(JSON.stringify(snapshot.content),JSON.stringify(snapshot.extension),JSON.stringify(snapshot.presentation));assert.deepEqual(validateSharedPageContent('home',restored),value);assert.deepEqual(snapshot.presentation.hero.media[0].frame,frame);
 const legacy=storedPageSnapshot(JSON.stringify(snapshot.content),JSON.stringify(snapshot.extension));assert.equal(legacy.panelLayout.version,1);assert.ok(!('frame' in legacy.hero));
});
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
test('additive migration preserves existing rows and accepts old-code inserts after rollback',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE profiles(member_id TEXT PRIMARY KEY); CREATE TABLE households(id TEXT PRIMARY KEY); CREATE TABLE page_content_extensions(page TEXT,revision INTEGER,extension_json TEXT,PRIMARY KEY(page,revision)); INSERT INTO profiles VALUES(\'owner\'); INSERT INTO households VALUES(\'family\'); INSERT INTO page_content_extensions VALUES(\'home\',1,\'{}\');');db.exec(readFileSync(new URL('../migrations/0016_photo_framing.sql',import.meta.url),'utf8'));
 assert.deepEqual(JSON.parse(db.prepare('SELECT photo_frame_json FROM profiles').get().photo_frame_json),DEFAULT_PHOTO_FRAME);assert.equal(db.prepare('SELECT presentation_v2_json FROM page_content_extensions').get().presentation_v2_json,null);db.exec("INSERT INTO page_content_extensions(page,revision,extension_json) VALUES('home',2,'{}')");assert.equal(db.prepare('SELECT count(*) AS n FROM page_content_extensions').get().n,2);assert.throws(()=>db.exec("UPDATE profiles SET photo_frame_json='invalid'"));}finally{db.close()}
});
import {command,UserError} from '../src/family-service.mjs';
function profileDB(){const batches=[],queries=[];return {batches,queries,prepare(sql){const query={sql,args:[],bind(...args){this.args=args;return this},async first(){queries.push(this);if(sql.includes('app_rate_limits'))return {count:1,reset_at:Date.now()+60000};if(sql.includes('SELECT u.image,p.photo_frame_json'))return {image:'/api/media/original',photo_frame_json:JSON.stringify(DEFAULT_PHOTO_FRAME)};return null}};return query},async batch(items){batches.push(items);return []}}}
test('profile command persists crop only for its existing authorized owner and keeps the photo URL',async()=>{
 const db=profileDB(),actor={id:'owner',status:'active',group:'family',roles:[]};await command(db,actor,{type:'SAVE_MEMBER',requestId:'frame-profile-one',member:{id:'owner',name:'Family member',photo:'/api/media/original',photoFrame:frame}});
 assert.equal(db.batches.length,1);const write=db.batches[0].find(q=>q.sql.includes('UPDATE profiles SET share_age='));assert.deepEqual(JSON.parse(write.args[1]),frame);assert.equal(db.batches[0].find(q=>q.sql.startsWith('UPDATE user')).args[1],'/api/media/original');assert.ok(!db.queries.some(q=>q.sql.includes('FROM media')));
});
test('profile command rejects another account and invalid framing without persisting profile writes',async()=>{
 const actor={id:'owner',status:'active',group:'family',roles:[]};for(const member of [{id:'other',name:'Other',photo:'/api/media/original',photoFrame:frame},{id:'owner',name:'Family',photo:'/api/media/original',photoFrame:{x:50,y:101,zoom:1}}]){const db=profileDB();await assert.rejects(()=>command(db,actor,{type:'SAVE_MEMBER',requestId:'frame-profile-denied',member}),error=>error instanceof UserError&&[400,403].includes(error.status));assert.equal(db.batches.length,0)}
});

test('stored and saved frames retain independent phone and wider positions',()=>{
 const responsive={x:50,y:50,zoom:1,mobile:{x:25,y:75,zoom:1.5},desktop:{x:75,y:25,zoom:1.2}};
 assert.deepEqual(storedPhotoFrame(JSON.stringify(responsive)),responsive);
 assert.deepEqual(photoFrameForSave({photo:'/api/media/one',previousPhoto:'/api/media/one',previousFrame:JSON.stringify(responsive)}),responsive);
 assert.throws(()=>photoFrameForSave({photo:'/api/media/one',frame:{...responsive,mobile:{x:101,y:50,zoom:1}}}));
});
