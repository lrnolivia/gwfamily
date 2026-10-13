import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const result=await build({entryPoints:[new URL('../src/shared-scroll-edge.jsx',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',external:['react'],loader:{'.css':'empty'}});
// Import pure measured geometry independently; the hook itself is exercised by
// ordinary browser Sheet/Popover tests, including reaching the final action.
const source=result.outputFiles[0].text.replace(/import[^;]+from "react";/,'const useEffect=()=>{};');
const {hasMoreBelow}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('fade only when its own surface has content remaining, disappears at end or after resize',()=>{
 assert.equal(hasMoreBelow({scrollHeight:500,clientHeight:200,scrollTop:0}),true);assert.equal(hasMoreBelow({scrollHeight:500,clientHeight:200,scrollTop:300}),false);assert.equal(hasMoreBelow({scrollHeight:500,clientHeight:500,scrollTop:0}),false);assert.equal(hasMoreBelow({scrollHeight:500,clientHeight:0,scrollTop:0}),false);assert.equal(hasMoreBelow({scrollHeight:500,clientHeight:200,scrollTop:299}),false);
});
