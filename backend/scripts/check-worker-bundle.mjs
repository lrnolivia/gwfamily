// Canonical CI only. Import the exact emitted Worker under no-network/process
// guards, then call its handlers directly with no real bindings or auth session.
import '../../tests/offline-test-guard.mjs';
import assert from 'node:assert/strict';
const {default:worker}=await import('../build/worker.mjs');
assert.equal(typeof worker.fetch,'function');
const ctx={waitUntil(){throw Error('Synthetic startup may not enqueue background work')}};
const health=await worker.fetch(new Request('https://synthetic-worker.invalid/health'),{},ctx);
assert.equal(health.status,200);assert.deepEqual(await health.json(),{service:'gwfamily',status:'ok'});
const privateRoute=await worker.fetch(new Request('https://synthetic-worker.invalid/api/me'),{},ctx);
assert.equal(privateRoute.status,503);assert.equal((await privateRoute.json()).error,'Service is not configured');
console.log('Exact emitted Worker startup/health/unconfigured private boundary passed in guarded Node22. Cloudflare runtime acceptance remains a separate gate.');
