import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,seed} from './test-db.mjs';
import {command,familyState} from '../src/family-service.mjs';
const actor=(id,roles=[])=>({id,status:'active',group:'family',roles,canPost:true,isLeader:false});
const send=(DB,id,type,value={})=>command(DB,actor(id),{type,...value,requestId:crypto.randomUUID()});
function setup(){const value=database();seed(value.sqlite);value.sqlite.exec("INSERT INTO memorials(id,name,created_by) VALUES('ancestor','Fictional Ancestor','owner');");return value}
test('heads can honor ancestors and living torch bearers without creating accounts or granting permissions',async()=>{
 const {DB,sqlite}=setup(),h=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'Heritage test'});
 const before=sqlite.prepare('SELECT * FROM members ORDER BY id').all(),userCount=sqlite.prepare('SELECT count(*) n FROM user').get().n;
 const ancestor=await send(DB,'alice','SAVE_HOUSEHOLD_HERITAGE',{householdId:h.id,entry:{personId:'ancestor',role:'ancestral-head',title:'Matriarch'}});
 await send(DB,'alice','SAVE_HOUSEHOLD_HERITAGE',{householdId:h.id,entry:{personId:'bob',role:'torch-bearer',title:'Patriarch'}});
 let state=await familyState(DB,actor('bob')),home=state.households[0];
 assert.equal(home.heritage.length,2);assert.equal(home.canManage,false);assert.equal(state.householdId,null);
 assert.deepEqual(home.memberIds,['alice']);assert.deepEqual(home.headIds,['alice']);assert.deepEqual(sqlite.prepare('SELECT * FROM members ORDER BY id').all(),before);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM user').get().n,userCount);assert.equal(sqlite.prepare("SELECT id FROM user WHERE id='ancestor'").get(),undefined);
 await assert.rejects(()=>send(DB,'bob','SAVE_HOUSEHOLD_HERITAGE',{householdId:h.id,entry:{personId:'bob',role:'torch-bearer',title:'Matriarch'}}),e=>e.status===403);
 const updated=await send(DB,'alice','SAVE_HOUSEHOLD_HERITAGE',{householdId:h.id,entry:{personId:'ancestor',role:'ancestral-head',title:'Ancestral head'}});
 assert.equal(updated.id,ancestor.id);assert.equal(sqlite.prepare('SELECT count(*) n FROM household_heritage').get().n,2);
 await assert.rejects(()=>send(DB,'bob','REMOVE_HOUSEHOLD_HERITAGE',{householdId:h.id,heritageId:ancestor.id}),e=>e.status===403);
 await send(DB,'alice','REMOVE_HOUSEHOLD_HERITAGE',{householdId:h.id,heritageId:ancestor.id});
 assert.equal((await familyState(DB,actor('alice'))).households[0].heritage.length,1);
});
test('heritage validates person type, adult status, titles, and exact household ownership',async()=>{
 const {DB,sqlite}=setup(),h=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'First'}),other=await send(DB,'owner','CREATE_HOUSEHOLD',{name:'Second'});
 const save=entry=>send(DB,'alice','SAVE_HOUSEHOLD_HERITAGE',{householdId:h.id,entry});
 for(const entry of [
  {personId:'bob',role:'ancestral-head',title:'Patriarch'},
  {personId:'ancestor',role:'torch-bearer',title:'Torch bearer'},
  {personId:'pending',role:'torch-bearer',title:'Matriarch'},
  {personId:'ancestor',role:'admin',title:'Matriarch'},
  {personId:'ancestor',role:'toString',title:'Matriarch'},
  {personId:'ancestor',role:'ancestral-head',title:'Administrator'},
  {personId:'missing',role:'ancestral-head',title:'Matriarch'},
 ])await assert.rejects(()=>save(entry),e=>e.status===400);
 const child=await send(DB,'alice','ADD_PERSON',{child:true,member:{name:'Private child',birthday:'2020-01-01',gender:'Prefer not to say'}});
 await assert.rejects(()=>save({personId:child.id,role:'torch-bearer',title:'Torch bearer'}));
 sqlite.exec("UPDATE profiles SET birthday='2020-01-01' WHERE member_id='bob'");
 await assert.rejects(()=>save({personId:'bob',role:'torch-bearer',title:'Torch bearer'}),/Registered adults/);
 const record=await send(DB,'owner','SAVE_HOUSEHOLD_HERITAGE',{householdId:other.id,entry:{personId:'ancestor',role:'ancestral-head',title:'Patriarch'}});
 await assert.rejects(()=>send(DB,'alice','REMOVE_HOUSEHOLD_HERITAGE',{householdId:h.id,heritageId:record.id}),e=>e.status===404);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM household_heritage').get().n,1);
});
test('household color inheritance survives refresh and explicit custom green is preserved',async()=>{
 const {DB}=setup(),h=await send(DB,'alice','CREATE_HOUSEHOLD',{name:'Colors'});
 const read=async()=> (await familyState(DB,actor('alice'))).households[0];
 assert.equal((await read()).color,null);assert.equal((await read()).colorMode,'inherit');
 await send(DB,'alice','SAVE_HOUSEHOLD',{householdId:h.id,name:'Colors',color:'#4f996c',colorMode:'custom'});
 assert.equal((await read()).color,'#4f996c');assert.equal((await read()).colorMode,'custom');
 await send(DB,'alice','SAVE_HOUSEHOLD',{householdId:h.id,name:'Colors',colorMode:'inherit'});
 assert.equal((await read()).color,null);
 await send(DB,'alice','SAVE_HOUSEHOLD',{householdId:h.id,name:'Colors',color:'#c7a64a'});
 assert.equal((await read()).color,'#c7a64a');
 await assert.rejects(()=>send(DB,'alice','SAVE_HOUSEHOLD',{householdId:h.id,name:'Colors',color:'invalid',colorMode:'custom'}),e=>e.status===400);
});
test('additive 0009 keeps existing rows and custom colors on a database with 0001–0008 applied',()=>{
 const sqlite=new DatabaseSync(':memory:'),base=new URL('../migrations/',import.meta.url);
 for(const file of readdirSync(base).filter(x=>x.endsWith('.sql')&&x<'0009').sort())sqlite.exec(readFileSync(new URL(file,base),'utf8'));
 seed(sqlite);sqlite.exec("INSERT INTO households(id,name,color,founder_id) VALUES('old-default','Existing green','#4f996c','alice'),('old-custom','Existing gold','#c7a64a','bob'); INSERT INTO household_members(household_id,member_id,role) VALUES('old-default','alice','head'),('old-custom','bob','head');");
 sqlite.exec(readFileSync(new URL('0009_household_heritage.sql',base),'utf8'));
 assert.deepEqual(sqlite.prepare('SELECT id,color,color_mode FROM households ORDER BY id').all().map(x=>({...x})),[{id:'old-custom',color:'#c7a64a',color_mode:'custom'},{id:'old-default',color:'#4f996c',color_mode:'inherit'}]);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM household_members').get().n,2);assert.equal(sqlite.prepare('SELECT count(*) n FROM household_heritage').get().n,0);
 sqlite.close();
});
