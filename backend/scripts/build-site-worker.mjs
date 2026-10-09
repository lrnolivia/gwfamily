import {PUSH_IMPLEMENTATION_READY} from '../src/push-policy.mjs';
import {build,version as esbuildVersion} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {workerBuildOptions} from './worker-build-options.mjs';
import {CORE_ASSET_PATHS} from '../src/core-assets.mjs';
const sha256=value=>createHash('sha256').update(value).digest('hex'),types={'index.html':'text/html; charset=utf-8','react-app.js':'application/javascript; charset=utf-8','react-app.css':'text/css; charset=utf-8','build.json':'application/json; charset=utf-8','sw.js':'application/javascript; charset=utf-8'},assets={},identities={};
for(const [name,type]of Object.entries(types)){const bytes=await readFile('../dist/'+name),compressed=gzipSync(bytes,{level:9,mtime:0});assets[name]={gzip:compressed.toString('base64'),type};identities[name]={sha256:sha256(bytes),bytes:bytes.length,gzipBytes:compressed.length,type};}
const frontend=JSON.parse(await readFile('../dist/build.json','utf8')).version;
assert.match(frontend,/^[a-f0-9]{20}$/);assert.ok((await readFile('../dist/index.html','utf8')).includes('content="'+frontend+'"'));
const expected=createHash('sha256').update(await readFile('../dist/react-app.js')).update(await readFile('../dist/react-app.css')).digest('hex').slice(0,20);assert.equal(frontend,expected);
const options=workerBuildOptions();await build({...options,entryPoints:['src/site-worker.mjs'],outfile:'build/site-worker.mjs',define:{...(options.define||{}),__GW_CORE_ASSETS__:JSON.stringify(assets)}});
const bundle=await readFile('build/site-worker.mjs'),config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
for(const path of ['/api/*','/health',...CORE_ASSET_PATHS])assert.ok(config.assets.run_worker_first.includes(path),'Missing Worker-first path '+path);
const sourceSha=/^[a-f0-9]{40}$/.test(process.env.GW_SOURCE_SHA||'')?process.env.GW_SOURCE_SHA:null;
const provenance={version:1,sourceSha,bundle:'backend/build/site-worker.mjs',sha256:sha256(bundle),bytes:bundle.length,node:process.version,esbuild:esbuildVersion,frontend,assets:identities,workerFirst:config.assets.run_worker_first,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,pushActivation:false,pushImplementationReady:PUSH_IMPLEMENTATION_READY};
await writeFile('build/site-worker-provenance.json',JSON.stringify(provenance,null,2)+'\n');console.log('::notice::Exact production site Worker provenance '+JSON.stringify(provenance));
