import {builtinModules} from 'node:module';
// The Worker keeps its browser/ESM target and complete application bundle.
// Canonical node: specifiers target the configured nodejs_compat runtime.
// CommonJS factories use createRequire; application packages remain bundled.
const builtins=new Set(builtinModules.filter(name=>!name.startsWith('node:')));
export function workerBuildOptions(){return {
 entryPoints:['src/worker.mjs'],bundle:true,format:'esm',platform:'browser',
 external:['node:*'],
 plugins:[{name:'workers-node-builtins',setup(context){context.onResolve({filter:/^[^./]/},args=>builtins.has(args.path)?{path:'node:'+args.path,external:true}:null)}}],
 banner:{js:'import {createRequire as __gwCreateRequire} from "node:module"; const require=__gwCreateRequire(import.meta.url);'},
 outfile:'build/worker.mjs'
};}
