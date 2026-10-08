import {builtinModules} from 'node:module';
// The Worker keeps its browser/ESM target and complete application bundle.
// Canonical node: specifiers target the configured nodejs_compat runtime.
// CommonJS factories use createRequire; application packages remain bundled.
const builtins=new Set(builtinModules.filter(name=>!name.startsWith('node:')));
export function workerBuildOptions(){return {
 entryPoints:['src/worker.mjs'],bundle:true,format:'esm',platform:'browser',
 // Select native request-local AsyncLocalStorage for the actual Worker runtime.
 // Better Auth's browser fallback shares request state across concurrent calls.
 conditions:['workerd'],
 external:['node:*'],
 plugins:[{name:'workers-node-builtins',setup(context){context.onResolve({filter:/^[^./]/},args=>builtins.has(args.path)?{path:'node:'+args.path,external:true}:null)}}],
 // The default workerd registry has no import.meta.url. Only node: built-ins
 // remain external, so a fixed virtual-file referrer needs no filesystem lookup.
 banner:{js:'import {createRequire as __gwCreateRequire} from "node:module"; const require=__gwCreateRequire("file:///bundle/api-worker.mjs");'},
 outfile:'build/worker.mjs'
};}
