import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {createApp} from '../src/worker.mjs';
import {sharedPageDefaults} from '../../src/shared-content-schema.js';
import {changeSharedPanel,addSharedPanel,createSharedPanel} from '../../src/shared-panels.js';
import {defaultCardLayout,moveCardSlot,alignCardSlot,updateCardLayout} from '../../src/card-content-layout-model.js';
function setup(){
 const value=database();seed(value.sqlite);const env={DB:value.DB,BETTER_AUTH_SECRET:'synthetic-card-layout-test-secret',AUTH_ORIGIN:'https://family.example.test'};
 const app=createApp(()=>({api:{getSession:async({headers})=>{const id=headers.get('Cookie')?.match(/session=([^;]+)/)?.[1];return ['owner','alice','bob','pending'].includes(id)?{user:{id,emailVerified:true}}:null}}}));
 const call=async(user,path,method='GET',body)=>{const response=await app.request(env.AUTH_ORIGIN+path,{method,headers:{...(user?{Cookie:'session='+user}:{}),Origin:env.AUTH_ORIGIN,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},env);return {status:response.status,data:await response.json()}};
 const write=(content,expectedRevision=0,user='owner',requestId=crypto.randomUUID())=>call(user,'/api/page-content/home','PATCH',{requestId,expectedRevision,content});
 return {...value,call,write};
}
const prepared=()=>{const content=sharedPageDefaults('home');content.panelLayout=changeSharedPanel(content.panelLayout,'hero',{locked:false});return updateCardLayout(content,'home','hero',layout=>alignCardSlot(moveCardSlot(layout,'title',{column:'right',beforeId:'media'}),'title','center'))};
test('content arrangement is leader-only and authenticated family reads keep exact placement',async()=>{
 const {call,write}=setup(),content=prepared();for(const user of [null,'pending','alice','bob'])assert.equal((await write(content,0,user)).status,user?403:401);
 assert.equal((await write(content)).status,200);assert.equal((await call(null,'/api/page-content/home')).status,401);const read=await call('bob','/api/page-content/home');assert.equal(read.status,200);assert.equal(read.data.canEdit,false);assert.deepEqual(read.data.content.cardLayouts,content.cardLayouts);
});
test('server rejects locked layout changes and any arbitrary content/action/media authority',async()=>{
 const {write}=setup(),content=prepared(),locked=structuredClone(content);locked.panelLayout.panels[0].locked=true;assert.equal((await write(locked)).status,400);
 for(const poison of [{hero:{...content.cardLayouts.hero,url:'/api/media/private'}},{'native-feed':content.cardLayouts.hero},{hero:{...content.cardLayouts.hero,component:'Profile'}},{hero:{version:1,left:[{id:'member-alice',align:'start'}],right:[]}}]){const bad={...content,cardLayouts:poison};assert.equal((await write(bad)).status,400);}
 assert.equal((await write(content)).status,200);const relocked=structuredClone(content);relocked.panelLayout.panels[0].locked=true;assert.equal((await write(relocked,1)).status,200);const moved=structuredClone(relocked);moved.cardLayouts.hero=moveCardSlot(moved.cardLayouts.hero,'body',{column:'right'});assert.equal((await write(moved,2)).status,400);
});
test('save is CAS/idempotent; a stale client cannot erase saved card arrangement',async()=>{
 const {write,sqlite}=setup(),content=prepared(),id='card-layout-idempotency';assert.equal((await write(content,0,'owner',id)).status,200);assert.equal((await write(content,0,'owner',id)).data.replayed,true);
 const next=updateCardLayout(content,'home','hero',layout=>alignCardSlot(layout,'body','end'));assert.equal((await write(next,0)).status,409);
 const legacy=structuredClone(content);delete legacy.cardLayouts;assert.equal((await write(legacy,1)).status,409);assert.equal((await write(next,1)).status,200);assert.equal(sqlite.prepare('SELECT count(*) n FROM page_content_revisions').get().n,2);
});
test('custom card arrangement survives remove/history/restore without new database schema',async()=>{
 const {write,call,sqlite}=setup(),content=prepared();content.panelLayout=addSharedPanel(content.panelLayout,createSharedPanel('panel-story','main','columns'));content.cardLayouts['panel-story']=moveCardSlot(defaultCardLayout('home',content.panelLayout.panels.at(-1)),'secondary',{column:'left',beforeId:'body'});
 assert.equal((await write(content)).status,200);const moved=updateCardLayout(content,'home','hero',layout=>alignCardSlot(layout,'action','end'));assert.equal((await write(moved,1)).status,200);
 const response=await call('owner','/api/page-content/home/restore','POST',{requestId:'restore-card-layout',expectedRevision:2,revision:1});assert.equal(response.status,200);assert.deepEqual(response.data.content.cardLayouts,content.cardLayouts);
 const row=sqlite.prepare('SELECT r.content_json,e.extension_json,e.presentation_v2_json FROM page_content_revisions r JOIN page_content_extensions e ON e.page=r.page AND e.revision=r.revision WHERE r.revision=3').get();assert.equal(JSON.parse(row.content_json).cardLayouts,undefined);assert.equal(JSON.parse(row.extension_json).cardLayouts,undefined);assert.deepEqual(JSON.parse(row.presentation_v2_json).cardLayouts,content.cardLayouts);
 const original=await call('owner','/api/page-content/home/restore','POST',{requestId:'restore-card-original',expectedRevision:3,revision:0});assert.equal(original.status,200);assert.deepEqual(original.data.content.cardLayouts,{});
});
test('transaction failure leaves no partial layout, revision, pointer or request receipt',async()=>{
 const {write,sqlite}=setup();sqlite.exec("CREATE TRIGGER card_failure BEFORE INSERT ON page_content_extensions BEGIN SELECT RAISE(ABORT,'synthetic card layout failure'); END");assert.equal((await write(prepared())).status,500);for(const table of ['page_content','page_content_revisions','page_content_requests','page_content_extensions'])assert.equal(sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
});
