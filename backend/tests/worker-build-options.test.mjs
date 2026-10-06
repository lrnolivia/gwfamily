import test from 'node:test';
import assert from 'node:assert/strict';
import {builtinModules} from 'node:module';
import {readFileSync} from 'node:fs';
import {workerBuildOptions} from '../scripts/worker-build-options.mjs';
test('backend build keeps the full browser ESM Worker bundle and exact existing entry/output',()=>{
 const options=workerBuildOptions();assert.deepEqual(options.entryPoints,['src/worker.mjs']);assert.equal(options.bundle,true);assert.equal(options.format,'esm');assert.equal(options.platform,'browser');assert.equal(options.outfile,'build/worker.mjs');
 for(const name of ['better-auth','hono','jose','kysely','kysely-d1','web-push'])assert.equal(options.external.includes(name),false,name+' remains bundled');assert.deepEqual(options.external,['node:*']);
});
test('bare built-ins become canonical node: specifiers; ordinary packages remain bundled',()=>{
 const options=workerBuildOptions();let resolve;options.plugins[0].setup({onResolve({filter},callback){assert.ok(filter.test('crypto'));resolve=callback}});for(const name of builtinModules.filter(name=>!name.startsWith('node:')))assert.deepEqual(resolve({path:name}),{path:'node:'+name,external:true});
 for(const name of ['web-push','better-auth','hono','some-third-party-package'])assert.equal(resolve({path:name}),null);
 assert.match(options.banner.js,/import \{createRequire as __gwCreateRequire\} from "node:module"/);assert.match(options.banner.js,/const require=__gwCreateRequire\(import.meta.url\)/);
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));assert.ok(config.compatibility_flags.includes('nodejs_compat'),'This build must not be used without the existing Node compatibility runtime');
});
