import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
async function renderFixture(jsx){
 const source=await readFile(new URL('./install-tutorial-browser.mjs',import.meta.url),'utf8');
 const match=/const fixture=`([\s\S]*?)`;/m.exec(source);assert.ok(match,'The hosted fixture source is inspectable');
 const contents=match[1].replace("createRoot(document.getElementById('root')).render(<Fixture/>);",'export function render(){return renderToString(<Fixture/>)}')+"\nimport {renderToString} from 'react-dom/server';";
 const compiled=await build({stdin:{contents,loader:'jsx',resolveDir:root},bundle:true,jsx,platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
 const saved=Object.fromEntries(['window','document','location'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 // This is a server-render check, not a local browser or device simulation.
 // Only the deterministic canvas data API used by GlassSystem is stubbed.
 Object.assign(globalThis,{window:{addEventListener(){},dispatchEvent(){},matchMedia(){return {matches:false}}},location:{protocol:'http:',pathname:'/'},document:{createElement(){return {width:0,height:0,getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}}},toDataURL(){return 'data:image/png;base64,'}}}}});
 try{const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);return module.exports.render()}
 finally{for(const [key,descriptor]of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
}
test('help fixture uses the same automatic JSX contract as the real app',async()=>{
 const source=await readFile(new URL('./install-tutorial-browser.mjs',import.meta.url),'utf8');assert.match(source,/bundle:true,jsx:'automatic'/);
 const html=await renderFixture('automatic');assert.match(html,/Install help/);assert.match(html,/Quick guide/);assert.match(html,/Preserved draft/);assert.match(html,/<button/);
});
test('classic JSX reproduces the original LiquidGlassFilter boot failure',async()=>{await assert.rejects(renderFixture('transform'),error=>error instanceof ReferenceError&&/React is not defined/.test(error.message))});
test('help failure capture starts before locator waits and retains named diagnostics',async()=>{
 const source=await readFile(new URL('./install-tutorial-browser.mjs',import.meta.url),'utf8');assert.ok(source.indexOf("page.on('pageerror'")<source.indexOf("await page.goto("));for(const marker of ['GW help ','-failure.png','-failure.json','rootChildren','failedRequests','consoleErrors'])assert.ok(source.includes(marker),marker);assert.match(source,/assert\.deepEqual\(errors,\[\]/);assert.match(source,/if\(failure\)throw failure/);
});
