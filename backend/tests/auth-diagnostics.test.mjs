import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthDiagnosticLogger,recordUnexpectedError,errorCategory,requestDiagnosticContext} from '../src/error-diagnostics.mjs';
import {createApp} from '../src/worker.mjs';
const reference='11111111-1111-4111-8111-111111111111';
const fields=['bodyCode','category','causeCode','causeName','errorKind','errorName','event','requestId','route','selectedErrorPresent','stage','status'];
test('API/plain errors, bounded cause chains and schema events emit only finite safe fields',()=>{
 const logs=[],log=line=>logs.push(JSON.parse(line));
 const cause=Object.assign(new Error('D1_ERROR SELECT secret FROM private'),{code:'D1_ERROR'});
 const api={name:'APIError',body:{code:'FAILED_TO_GET_SESSION',secret:'private-cookie'},cause};
 recordUnexpectedError(api,{requestId:reference,routeTemplate:'/api/media/:id',stage:'auth.session.initial'},log);
 assert.deepEqual(logs[0],{requestId:reference,route:'/api/media/:id',stage:'auth.session.initial',event:'request_error',category:'database',errorKind:'api_error',selectedErrorPresent:true,errorName:'APIError',causeName:'Error',causeCode:'D1_ERROR',bodyCode:'FAILED_TO_GET_SESSION',status:500});
 const logger=createAuthDiagnosticLogger({requestId:reference,routeTemplate:'/api/auth/*',stage:'auth.handler'},log);
 logger.log('error','Schema validation failed: private SQL');
 assert.equal(logs[1].event,'schema_validation');assert.equal(logs[1].category,'database_schema');assert.equal(logs[1].selectedErrorPresent,false);
 logger.log('error','private message',{name:'private-person',code:'private-token',message:'no such column: private'});
 assert.equal(logs[2].errorKind,'error_like');assert.equal(logs[2].errorName,'other');assert.equal(logs[2].bodyCode,'other');
 for(const row of logs){assert.equal(row.requestId,reference);assert.deepEqual(Object.keys(row).sort(),fields)}
 assert.doesNotMatch(JSON.stringify(logs),/private|SELECT|secret|cookie|token/);
 const cycle={name:'APIError',body:{code:'SCHEMA_MISMATCH'}};cycle.cause=cycle;assert.equal(errorCategory(cycle),'database_schema');
 const throwing={get message(){throw Error('private')}};assert.doesNotThrow(()=>recordUnexpectedError(throwing,{},log));
 assert.equal(errorCategory({cause:{cause:{cause:{message:'D1_ERROR'}}}}),'unexpected');
});
test('concurrent logger closures preserve each request, and registered static routes precede matching parameter routes',async()=>{
 const logs=[],ids=Array.from({length:20},()=>crypto.randomUUID());
 await Promise.all(ids.map(async(requestId,i)=>{const logger=createAuthDiagnosticLogger({requestId,routeTemplate:'/api/conversations/:id',stage:'auth.session.revalidate'},line=>logs.push(JSON.parse(line)));await new Promise(r=>setTimeout(r,i%3));logger.log('error','private',Object.assign(new Error('D1_TIMEOUT private'),{code:'D1_TIMEOUT'}))}));
 assert.deepEqual(logs.map(row=>row.requestId).sort(),ids.sort());assert.ok(logs.every(row=>row.category==='database_timeout'&&row.stage==='auth.session.revalidate'));
 const scope=requestDiagnosticContext({get:()=>reference,req:{routePath:'/api/*',matchedRoutes:[{method:'ALL',path:'/api/*'},{method:'GET',path:'/api/conversations/recipients'},{method:'GET',path:'/api/conversations/:id'}]}},'auth.session.initial');assert.equal(scope.routeTemplate,'/api/conversations/recipients');
});
test('auth handler failures share request ID, preserve Set-Cookie and hide raw auth responses',async()=>{
 const prior=console.error,logs=[];console.error=line=>logs.push(JSON.parse(line));
 const app=createApp((_env,scope)=>({handler:async()=>{createAuthDiagnosticLogger(scope).log('error','private',Object.assign(new Error('D1_ERROR private SQL'),{code:'D1_ERROR'}));return new Response(JSON.stringify({code:'FAILED_TO_GET_SESSION',message:'private SQL',token:'private'}),{status:500,headers:{'Set-Cookie':'synthetic=expired; Secure'}})}}));
 try{const response=await app.request('https://family.example.test/api/auth/get-session',{headers:{'X-Request-ID':'untrusted-private'}},{DB:{},BETTER_AUTH_SECRET:'synthetic-only-secret',AUTH_ORIGIN:'https://family.example.test'});assert.equal(response.status,500);const body=await response.json();assert.equal(body.requestId,response.headers.get('X-Request-ID'));assert.equal(response.headers.get('Set-Cookie'),'synthetic=expired; Secure');assert.ok(logs.length===2&&logs.every(row=>row.requestId===body.requestId&&row.stage==='auth.handler'));assert.doesNotMatch(JSON.stringify({body,logs}),/private|SQL|token|untrusted/)}finally{console.error=prior}
});
