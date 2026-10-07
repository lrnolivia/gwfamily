import test from 'node:test';
import assert from 'node:assert/strict';
import {createMicrosoftProofClient} from '../src/microsoft-proof-client.mjs';
test('proof requests are same-origin, no-store, and never put codes in URLs',async()=>{
 const calls=[],client=createMicrosoftProofClient(async(path,options)=>{calls.push({path,options});return new Response(JSON.stringify({complete:true}),{status:200,headers:{'Content-Type':'application/json'}})});
 await client.status();await client.send('synthetic-csrf','person@example.test');await client.complete('synthetic-csrf','123456',true,'person@example.test','synthetic-generation');await client.cancel('synthetic-csrf');
 assert.equal(calls.length,4);for(const {path,options} of calls){assert.ok(path.startsWith('/api/auth/microsoft-proof/'));assert.ok(!path.includes('123456'));assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store')}
 assert.equal(calls[2].options.headers['X-GW-Auth-CSRF'],'synthetic-csrf');assert.deepEqual(JSON.parse(calls[2].options.body),{code:'123456',connectMicrosoft:true,email:'person@example.test',generation:'synthetic-generation'});
});
test('service error remains visible and success is not guessed',async()=>{
 const client=createMicrosoftProofClient(async()=>new Response(JSON.stringify({message:'Expired'}),{status:400}));await assert.rejects(client.status(),/Expired/);
});
