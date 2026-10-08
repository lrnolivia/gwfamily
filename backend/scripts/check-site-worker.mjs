import '../../tests/offline-test-guard.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const started=performance.now(),{default:worker}=await import('../build/site-worker.mjs'),startupMs=performance.now()-started,provenance=JSON.parse(await readFile('build/site-worker-provenance.json','utf8'));
assert.equal(typeof worker.fetch,'function');assert.equal(typeof worker.scheduled,'function');
let fallbackCalls=0;const env={ASSETS:{async fetch(){fallbackCalls++;return new Response('unchanged asset',{headers:{'Content-Type':'text/plain'}})}}},ctx={waitUntil(){throw Error('Core startup may not enqueue background work')}};
for(const [name,identity]of Object.entries(provenance.assets))for(const suffix of ['', '?v='+provenance.frontend]){
 const request=new Request('https://synthetic-worker.invalid/'+name+suffix),response=await worker.fetch(request,env,ctx),bytes=new Uint8Array(await response.arrayBuffer());
 assert.equal(response.status,200);assert.equal(createHash('sha256').update(bytes).digest('hex'),identity.sha256);assert.equal(response.headers.get('content-type'),identity.type);assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');assert.equal(response.headers.get('x-content-type-options'),'nosniff');for(const header of ['content-length','content-encoding','etag'])assert.equal(response.headers.get(header),null);
 const head=await worker.fetch(new Request(request,{method:'HEAD'}),env,ctx);assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
}
assert.equal(createHash('sha256').update(new Uint8Array(await(await worker.fetch(new Request('https://synthetic-worker.invalid/'),env,ctx)).arrayBuffer())).digest('hex'),provenance.assets['index.html'].sha256);
assert.equal((await worker.fetch(new Request('https://synthetic-worker.invalid/react-app.js',{method:'POST'}),env,ctx)).status,405);assert.equal(fallbackCalls,0);
assert.equal(await(await worker.fetch(new Request('https://synthetic-worker.invalid/unchanged.png'),env,ctx)).text(),'unchanged asset');assert.equal(fallbackCalls,1);
const health=await worker.fetch(new Request('https://synthetic-worker.invalid/health'),{},ctx);assert.equal(health.status,200);assert.deepEqual(await health.json(),{service:'gwfamily',status:'ok'});
assert.equal((await worker.fetch(new Request('https://synthetic-worker.invalid/api/me'),{},ctx)).status,503);
console.log('Exact emitted site Worker core bytes, routing, HEAD, security headers and API boundary passed; Node import ms='+startupMs.toFixed(2)+'. Cloudflare startup remains separately measured.');
