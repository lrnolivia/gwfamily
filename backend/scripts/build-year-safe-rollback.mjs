// Explicit recovery artifact only; never replaces the configured site-worker.
import {build,version as esbuildVersion} from 'esbuild';
import {workerBuildOptions} from './worker-build-options.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const outfile='build/year-safe-rollback.mjs';
await build({...workerBuildOptions(),entryPoints:['src/year-safe-rollback.mjs'],outfile});
const bytes=await readFile(outfile),config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const provenance={sourceSha:/^[a-f0-9]{40}$/.test(process.env.GW_SOURCE_SHA||'')?process.env.GW_SOURCE_SHA:null,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,node:process.version,esbuild:esbuildVersion,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,mode:'read-only legacy reunion; sign-out allowed; scheduled delivery disabled',database:'retain migrations 0001–0019; never restore pre-year runtime after new-year writes',uiSourceSha:'150d178b2e72d6e71245b962dc568bee61d11770'};
await writeFile('build/year-safe-rollback-provenance.json',JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify(provenance));
