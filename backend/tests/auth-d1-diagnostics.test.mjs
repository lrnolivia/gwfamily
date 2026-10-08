import test from 'node:test';
import assert from 'node:assert/strict';
import {instrumentAuthD1} from '../src/auth-d1-diagnostics.mjs';
import {errorCategory,recordAuthDatabaseError} from '../src/error-diagnostics.mjs';
import {createApp} from '../src/worker.mjs';
import {database,seed} from './test-db.mjs';
import {serializeSigned} from 'hono/utils/cookie';

const scope={requestId:'11111111-1111-4111-8111-111111111111',routeTemplate:'/api/conversations/recipients',stage:'auth.session.initial'};
const canary='PRIVATE_SQL_COOKIE_TOKEN_CANARY';

test('D1 observation preserves native receivers, statements, results and all method arguments',async()=>{
 class Statement{
  #args;constructor(args=[]){this.#args=args}
  bind(...args){return new Statement(args)}
  async all(...args){return {results:[this.#args,args],meta:{changes:0},success:true}}
  async first(...args){return [this.#args,args]}
  async run(...args){return [this.#args,args]}
  async raw(...args){return [this.#args,args]}
 }
 class Binding{
  #token=true;
  prepare(sql){assert.ok(this.#token);assert.equal(sql,canary);return new Statement()}
  async batch(statements){assert.ok(this.#token);assert.ok(statements.every(s=>s instanceof Statement));return Promise.all(statements.map(s=>s.all()))}
  async exec(sql){assert.ok(this.#token);return sql}
 }
 const logs=[],native=new Binding(),db=instrumentAuthD1(native,scope,line=>logs.push(line));
 const stmt=db.prepare(canary).bind(1,null);assert.equal(stmt.all,stmt.all);
 assert.deepEqual((await stmt.all('option')).results,[[1,null],['option']]);
 for(const method of ['first','run','raw'])assert.deepEqual(await stmt[method]('option'),[[1,null],['option']]);
 assert.deepEqual((await db.batch([stmt]))[0].results,[[1,null],[]]);assert.equal(await db.exec(canary),canary);
 assert.deepEqual(logs,[]);
});

test('synchronous and rejected database failures retain exact thrown identity without retry or private output',async()=>{
 for(const operation of ['prepare','bind','all','first','run','raw','batch','exec']){
  const original=Object.assign(new Error('Network connection lost. '+canary),{stack:canary});let calls=0;
  const fail=()=>{calls++;throw original},logs=[];
  const stmt={bind(){return this},all:async()=>({results:[],success:true,meta:{changes:0}}),first:async()=>null,run:async()=>({}),raw:async()=>[]};
  const native={prepare:()=>stmt,batch:async()=>[],exec:async()=>({})};
  if(operation==='prepare'||operation==='batch'||operation==='exec')native[operation]=fail;else stmt[operation]=fail;
  const db=instrumentAuthD1(native,scope,line=>logs.push(JSON.parse(line)));
  const invoke=()=>operation==='prepare'?db.prepare(canary):operation==='batch'?db.batch([db.prepare(canary)]):operation==='exec'?db.exec(canary):db.prepare(canary)[operation](canary);
  if(operation==='prepare'||operation==='bind')assert.throws(invoke,error=>error===original);else await assert.rejects(invoke,error=>error===original);
  assert.equal(calls,1);assert.equal(logs.length,1);assert.equal(logs[0].event,'auth_database_error');assert.equal(logs[0].operation,operation);
  assert.equal(logs[0].category,'network_connection_lost');assert.equal(logs[0].requestId,scope.requestId);assert.equal(logs[0].stage,scope.stage);
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|SQL|COOKIE|TOKEN|SELECT/);
 }
 const original=new Error(canary),db=instrumentAuthD1({prepare(){throw original}},scope,()=>{throw Error('logger unavailable')});assert.throws(()=>db.prepare(canary),error=>error===original);
});

test('fixed fingerprints cover prefix-free runtime failures and leave unknown text private',()=>{
 const cases=[['Network connection lost.','network_connection_lost'],['Cannot perform I/O on behalf of a different request.','request_context'],['Too many subrequests.','subrequest_limit'],["Your account has exceeded D1's free tier daily row read limit.",'database_quota'],['D1 DB is overloaded. Too many requests queued.','database_overloaded'],[canary,'unexpected']];
 for(const [message,category] of cases)assert.equal(errorCategory(new Error(message)),category);
 const logs=[];recordAuthDatabaseError({name:canary,code:canary,message:canary},{...scope,extra:canary},canary,line=>logs.push(JSON.parse(line)));
 assert.equal(logs[0].operation,'other');assert.equal(logs[0].errorName,'other');assert.equal(logs[0].bodyCode,'other');assert.doesNotMatch(JSON.stringify(logs),/PRIVATE/);
});

test('simultaneous failed bindings keep each request context and original error',async()=>{
 const logs=[],references=Array.from({length:12},()=>crypto.randomUUID());
 await Promise.all(references.map(async(requestId,i)=>{
  const error=new Error('Network connection lost. '+canary);
  const db=instrumentAuthD1({prepare:()=>({bind(){return this},async all(){await new Promise(r=>setTimeout(r,i%3));throw error}})},{...scope,requestId,stage:i%2?'auth.session.initial':'auth.session.revalidate'},line=>logs.push(JSON.parse(line)));
  await assert.rejects(db.prepare(canary).bind(canary).all(),value=>value===error);
 }));
 assert.deepEqual(logs.map(r=>r.requestId).sort(),references.sort());assert.ok(logs.every(r=>r.operation==='all'));assert.doesNotMatch(JSON.stringify(logs),/PRIVATE/);
});

test('real Better Auth reports original D1 operation before wrapper, sharing the HTTP reference',async()=>{
 const fixture=database();seed(fixture.sqlite);const secret='synthetic-d1-diagnostic-secret';const now=Date.now();
 fixture.sqlite.prepare('INSERT INTO session(id,token,userId,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').run('diagnostic-session','diagnostic-token','alice',now+604800000,now,now);
 const cookie=(await serializeSigned('__Secure-better-auth.session_token','diagnostic-token',secret,{secure:true})).split(';')[0];
 const original=new Error('Network connection lost. '+canary),logs=[],prior=console.error;let calls=0;
 const DB={...fixture.DB,prepare(sql){const statement=fixture.DB.prepare(sql);const wrap=s=>({bind(...args){return wrap(s.bind(...args))},async all(){if(/from "session"/i.test(sql)){calls++;throw original}return s.all()}});return wrap(statement)}};
 console.error=line=>logs.push(JSON.parse(line));
 try{
  const response=await createApp().request('https://family.example.test/api/conversations/recipients',{headers:{Cookie:cookie}},{DB,BETTER_AUTH_SECRET:secret,AUTH_ORIGIN:'https://family.example.test'});
  assert.equal(response.status,500);const body=await response.json();assert.equal(response.headers.get('X-Request-ID'),body.requestId);assert.equal(calls,1);
  assert.equal(logs[0].event,'auth_database_error');assert.equal(logs[0].operation,'all');assert.equal(logs[0].category,'network_connection_lost');
  assert.ok(logs.some(r=>r.bodyCode==='FAILED_TO_GET_SESSION'));assert.ok(logs.every(r=>r.requestId===body.requestId&&r.stage==='auth.session.initial'));
  assert.doesNotMatch(JSON.stringify({logs,body}),/PRIVATE|SQL|COOKIE|TOKEN|diagnostic-token|synthetic-d1/);
 }finally{console.error=prior;fixture.sqlite.close()}
});
