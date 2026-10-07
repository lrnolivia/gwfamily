import test from 'node:test';
import assert from 'node:assert/strict';
import {database,seed} from './test-db.mjs';
import {createApp} from '../src/worker.mjs';
import {familyState} from '../src/family-service.mjs';
import {errorCategory,recordUnexpectedError} from '../src/error-diagnostics.mjs';
const actor={id:'alice',status:'active',roles:[],canPost:true,isLeader:false};
const withLogs=async fn=>{const prior=console.error,logs=[];console.error=(line)=>logs.push(JSON.parse(line));try{return await fn(logs)}finally{console.error=prior}};
function setup(){const {DB,sqlite}=database();seed(sqlite);const env={DB,BETTER_AUTH_SECRET:'synthetic-fixture-secret-over-32-characters',AUTH_ORIGIN:'https://family.example.test'};const app=createApp(()=>({api:{getSession:async({headers})=>headers.get('x-fixture-user')?{user:{id:headers.get('x-fixture-user'),emailVerified:true}}:null}}));return {DB,sqlite,env,app}}

test('all-or-nothing state read includes the various pages, and one failed dependency surfaces HTTP500',async()=>withLogs(async logs=>{
 const {DB,sqlite,env,app}=setup(),prior=DB.prepare;let broken=true,reads=0;DB.prepare=sql=>{reads++;if(broken&&sql.includes('FROM reunion_rsvps'))throw new Error('D1_ERROR: private SQL and member alice@example.test');return prior(sql)};
 const request=()=>app.request(env.AUTH_ORIGIN+'/api/state?private=DO_NOT_LOG',{headers:{'x-fixture-user':'alice',Cookie:'private-cookie'}},env);
 const failed=await request(),body=await failed.json();assert.equal(failed.status,500);assert.equal(body.error,'Request could not be completed');assert.equal(body.selfId,undefined);assert.match(body.requestId,/^[a-f0-9-]{36}$/);assert.equal(failed.headers.get('X-Request-ID'),body.requestId);assert.equal(logs.length,1);assert.deepEqual(logs[0],{requestId:body.requestId,route:'/api/state',category:'database',status:500});assert.doesNotMatch(JSON.stringify(logs),/alice|SQL|DO_NOT_LOG|private|Cookie/);
 broken=false;const good=await request();assert.equal(good.status,200);const state=await good.json();assert.ok('rsvp'in state&&'posts'in state&&'memories'in state&&'households'in state);assert.equal(logs.length,1);assert.ok(reads>20);sqlite.close();
}));
test('a notification read failure fails the shared state rather than misrepresenting partial data as success',async()=>{
 const {DB,sqlite}=setup(),prior=DB.prepare;DB.prepare=sql=>{if(sql.includes('FROM notifications'))throw new Error('D1_ERROR: synthetic');return prior(sql)};await assert.rejects(()=>familyState(DB,actor),/D1_ERROR/);sqlite.close();
});
test('authentication and membership errors retain their real status without unexpected-error telemetry',async()=>withLogs(async logs=>{
 const {sqlite,env,app}=setup();for(const [id,status]of [[null,401],['pending',403]]){const result=await app.request(env.AUTH_ORIGIN+'/api/state',{headers:id?{'x-fixture-user':id}:{}},env);assert.equal(result.status,status);assert.equal((await result.json()).requestId,undefined)}assert.deepEqual(logs,[]);sqlite.close();
}));
test('error diagnostics produce only finite categories and a registered route template',()=>{
 for(const [failure,expected]of [[new Error('D1_ERROR: SELECT secret FROM private'),'database'],[new Error('no such table: private'),'database_schema'],[new Error('SQLITE_BUSY private'),'database_busy'],[new Error('SQLITE_CONSTRAINT private'),'database_constraint'],[new TypeError('private'),'type'],[new RangeError('private'),'range'],[new Error('unrecognized secret'),'unexpected']])assert.equal(errorCategory(failure),expected);
 const logs=[];recordUnexpectedError(new Error('private'),{req:{routePath:'/api/media/:id',path:'/api/media/real-person'}},line=>logs.push(JSON.parse(line)));assert.equal(logs[0].route,'/api/media/:id');assert.deepEqual(Object.keys(logs[0]).sort(),['category','requestId','route','status']);assert.doesNotMatch(JSON.stringify(logs),/private|real-person/);
 assert.doesNotThrow(()=>recordUnexpectedError(new Error('private'),{req:{routePath:'https://private.example.test'}},()=>{throw new Error('logger unavailable')}));
});
test('real configured Better Auth logger never emits raw error details or parameters',async()=>withLogs(async logs=>{
 const {env,sqlite}=setup();const {createAuth}=await import('../src/auth.mjs'),auth=createAuth(env),context=await auth.$context;
 context.logger.error('Private email private@example.test',new Error('D1_ERROR: SELECT credential FROM private'),{email:'private@example.test',token:'DO_NOT_LOG'});
 assert.equal(logs.length,1);assert.equal(logs[0].route,'/api/auth/*');assert.equal(logs[0].category,'database');assert.deepEqual(Object.keys(logs[0]).sort(),['category','requestId','route','status']);assert.doesNotMatch(JSON.stringify(logs),/private|credential|SELECT|DO_NOT_LOG/);sqlite.close();
}));
