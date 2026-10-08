import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {assertTestEnvironment,assertTestRequest} from './test-environment-guard.mjs';
test('fixture preflight rejects production and non-isolated storage',()=>{
 for(const env of [{GW_PAGE_CONTENT_URL:'https://greenwhitefamily.com'},{GW_TEST_D1_DATABASE_ID:'e0e481ba-3025-44f0-bf30-6dd64e2b61b9'},{GW_TEST_R2_BUCKET:'gwfamily-media'}])assert.throws(()=>assertTestEnvironment(env),/fixture/i);
 assert.doesNotThrow(()=>assertTestEnvironment({GW_PAGE_CONTENT_URL:'http://127.0.0.1:4176',GW_TEST_D1_DATABASE_ID:':memory:',GW_TEST_R2_BUCKET:'gwfamily-fixture-unit'}));
});
test('production smoke can read while test mutations are blocked before network',()=>{
 for(const url of ['https://greenwhitefamily.com/api/posts','https://api.cloudflare.com/client/v4/accounts/example/d1/database/example/query','https://example.workers.dev/api/media']){
  assert.doesNotThrow(()=>assertTestRequest(url,'GET'));for(const method of ['POST','PUT','PATCH','DELETE'])assert.throws(()=>assertTestRequest(url,method),/Automated mutations/);
 }
 assert.doesNotThrow(()=>assertTestRequest('http://localhost:4188/api/posts','POST'));
 assert.throws(()=>fetch('https://greenwhitefamily.com/api/posts',{method:'POST'}),/Automated mutations/);
});
test('code build identity excludes live content and test storage stays in memory',()=>{
 const source=fs.readFileSync(new URL('../scripts/version-assets.mjs',import.meta.url),'utf8');assert.match(source,/readFile\('dist\/react-app.js'\)/);assert.match(source,/readFile\('dist\/react-app.css'\)/);assert.doesNotMatch(source,/fetch\(|\/api\/|D1|R2|contentRevision|mediaRevision/);
 assert.match(fs.readFileSync(new URL('../backend/tests/test-db.mjs',import.meta.url),'utf8'),/new DatabaseSync\(':memory:'\)/);
});

test('fixture guard is scoped to tests and servers, never GitHub checkout or upload actions',()=>{
 const source=fs.readFileSync(new URL('../.github/workflows/gw-quality.yml',import.meta.url),'utf8');assert.doesNotMatch(source,/NODE_OPTIONS/);
 const runner=fs.readFileSync(new URL('../scripts/ci-test-summary.mjs',import.meta.url),'utf8');assert.match(runner,/\['--import',new URL\('..\/tests\/test-environment-guard.mjs'/);
 assert.match(fs.readFileSync(new URL('../backend/tests/test-db.mjs',import.meta.url),'utf8'),/import '..\/..\/tests\/test-environment-guard.mjs'/);
 for(const name of ['onboarding-browser.mjs','push-settings-browser.mjs','email-preview-browser.mjs','install-v4-browser.mjs','home-reunion-browser.mjs','memorial-update-browser.mjs'])assert.match(fs.readFileSync(new URL('./'+name,import.meta.url),'utf8'),/import '.\/test-environment-guard.mjs'/);
});
