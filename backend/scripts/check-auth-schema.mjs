// Mandatory release gate: metadata only, exact runtime options, no schema writes.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {authSchemaFromPragma,compareAuthSchema} from '../src/auth-schema.mjs';
const flags=Object.fromEntries(process.argv.slice(2).reduce((pairs,value,index,args)=>{if(index%2===0)pairs.push([value,args[index+1]]);return pairs},[]));
const needed=['--metadata','--config','--bindings','--source','--database','--receipt'];
if(needed.some(key=>!flags[key])||!/^[a-f0-9]{40}$/.test(flags['--source'])||!/^[a-f0-9-]{36}$/.test(flags['--database']))throw new Error('Exact source, private runtime config, metadata, database ID and receipt are required');
if(execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../..',import.meta.url),encoding:'utf8'}).trim()!==flags['--source'])throw new Error('Schema gate source must match this exact checkout');
const age=Date.now()-(await stat(flags['--metadata'])).mtimeMs;if(age<0||age>300000)throw new Error('Collect fresh live schema metadata within five minutes of this gate');
const hash=value=>createHash('sha256').update(value).digest('hex');
const configBytes=await readFile(flags['--config']),config=JSON.parse(configBytes),binding=config.d1_databases?.find(db=>db.binding==='DB'||db.binding==='D1');
if(binding?.database_id!==flags['--database'])throw new Error('Schema metadata database does not match runtime binding');
const metadataBytes=await readFile(flags['--metadata']),metadata=JSON.parse(metadataBytes);
if(!Array.isArray(metadata)||metadata.length!==1||metadata[0].success!==true||metadata[0].meta?.changed_db!==false||metadata[0].meta?.rows_written!==0)throw new Error('Schema gate requires one successful read-only D1 metadata receipt');
// Cloudflare does not return secret values. Their declared presence is sufficient:
// schema derives from plugin/options choices, never the signing-secret bytes.
const bindingsBytes=await readFile(flags['--bindings']),runtime=JSON.parse(bindingsBytes);
if(runtime.database?.database_id!==binding.database_id||!Array.isArray(runtime.bindings)||!Array.isArray(runtime.secrets))throw new Error('Current runtime binding evidence is required');
const canonical=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
if(canonical(Object.fromEntries(runtime.bindings.map(b=>[b.name,b.text])))!==canonical(config.vars||{}))throw new Error('Runtime auth configuration differs from the release configuration');
const secretBinding=['BETTER_AUTH_SECRET','PAYLOAD_SECRET'].find(name=>runtime.secrets.includes(name));if(!secretBinding)throw new Error('Runtime signing-secret binding is missing');
const env={...config.vars,[secretBinding]:'schema-gate-only-opaque-existing-secret-binding',DB:{prepare(){throw new Error('Metadata gate cannot execute database statements')}}};
const lockBytes=await readFile(new URL('../package-lock.json',import.meta.url)),lock=JSON.parse(lockBytes),installed=JSON.parse(await readFile(new URL('../node_modules/better-auth/package.json',import.meta.url)));
if(lock.packages['node_modules/better-auth'].version!==installed.version||installed.version!=='1.7.7')throw new Error('Schema gate must use the exact pinned auth library');
const verdict=compareAuthSchema(env,authSchemaFromPragma(metadata[0].results));
const receipt={schema:1,sourceSha:flags['--source'],authVersion:installed.version,backendLockSha256:hash(lockBytes),authSourceSha256:hash(await readFile(new URL('../src/auth.mjs',import.meta.url))),runtimeConfigSha256:hash(configBytes),runtimeBindingsSha256:hash(bindingsBytes),signingSecretBinding:secretBinding,databaseId:flags['--database'],observedAt:new Date().toISOString(),metadataSha256:hash(metadataBytes),rowsWritten:0,changedDatabase:false,verdict:'compatible',tables:verdict.tables};
await writeFile(flags['--receipt'],JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt));
