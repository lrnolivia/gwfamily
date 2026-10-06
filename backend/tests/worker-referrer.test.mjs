import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {workerBuildOptions} from '../scripts/worker-build-options.mjs';
test('fixed virtual referrer resolves canonical runtime built-ins without a real file or package dependency',()=>{
 const require=createRequire('file:///bundle/api-worker.mjs');
 for(const name of ['crypto','url','util','stream','buffer','events'])assert.equal(typeof require('node:'+name),'object',name);
 const options=workerBuildOptions();assert.deepEqual(options.external,['node:*']);assert.doesNotMatch(options.banner.js,/import.meta/);
});
