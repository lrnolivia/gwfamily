import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
let actual;
async function compiledComponent(){
 if(actual)return actual;
 const reactURL=new URL('../node_modules/react/index.js',import.meta.url).href;
 const result=await build({entryPoints:[new URL('../src/toast.jsx',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'isolated-toast',setup(builder){builder.onResolve({filter:/^react$/},()=>({path:reactURL,external:true}));builder.onLoad({filter:/toast\.css$/},()=>({contents:'',loader:'js'}));}}]});
 actual=(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).ToastHost;return actual;
}
const controls={dismissToast(){},pauseToast(){},resumeToast(){}};
test('empty host keeps mounted polite/assertive announcements without visual obstruction',async()=>{const Host=await compiledComponent(),html=renderToStaticMarkup(React.createElement(Host,{toast:null,...controls}));assert.match(html,/role="status" aria-live="polite"/);assert.match(html,/role="alert" aria-live="assertive"/);assert.doesNotMatch(html,/class="gw-toast-host"/);});
test('routine text is polite, visible, escaped and has a named native dismissal control',async()=>{const Host=await compiledComponent(),html=renderToStaticMarkup(React.createElement(Host,{toast:{id:1,kind:'status',message:'Saved <example>.'},...controls}));assert.match(html,/role="status"[^>]*><span>Saved &lt;example&gt;\.<\/span>/);assert.match(html,/aria-label="Dismiss notification"/);assert.match(html,/<button type="button"/);assert.match(html,/data-kind="status"/);assert.doesNotMatch(html,/<example>/);});
test('typed error announces assertively without repurposing any persistent app error panel',async()=>{const Host=await compiledComponent(),html=renderToStaticMarkup(React.createElement(Host,{toast:{id:2,kind:'error',message:'Upload failed. Try again.'},...controls}));assert.match(html,/role="alert"[^>]*><span>Upload failed\. Try again\.<\/span>/);assert.doesNotMatch(html,/class="note"/);assert.doesNotMatch(html,/role="status"[^>]*><span>/);});
test('CSS retains active palette, accessible target, wrapping and safe-area placement with no animation-based lifetime',async()=>{const css=await readFile(new URL('../src/toast.css',import.meta.url),'utf8');assert.match(css,/background:var\(--text\);color:var\(--bg\)/);assert.match(css,/min-inline-size:44px;min-block-size:44px/);assert.match(css,/overflow-wrap:anywhere/);assert.match(css,/--gw-nav-bottom/);assert.match(css,/forced-colors:active/);assert.match(css,/:focus-visible/);assert.doesNotMatch(css,/animation\s*:/);});
test('component pauses hover/focus, resumes only after leaving, and provides Escape and origin-focus restoration',async()=>{const source=await readFile(new URL('../src/toast.jsx',import.meta.url),'utf8');assert.match(source,/onPointerEnter=.*pauseToast\('hover',toast.id\)/);assert.match(source,/onPointerLeave=.*resumeToast\('hover',toast.id\)/);assert.match(source,/event\.currentTarget\.contains\(event\.relatedTarget\)/);assert.match(source,/pauseToast\('focus',toast.id\)/);assert.match(source,/resumeToast\('focus',toast.id\)/);assert.match(source,/event\.key==='Escape'/);assert.match(source,/origin\.focus\(\{preventScroll:true\}\)/);assert.doesNotMatch(source,/onAnimationEnd/);});

async function interactionHarness(){
 const slots=[],effects=[],calls=[],body={},button={},inside={},node={contains:value=>value===button||value===inside},documentRef={body,activeElement:body};let cursor=0,focuses=0;
 const origin={isConnected:true,focus(options){assert.deepEqual(options,{preventScroll:true});focuses++;documentRef.activeElement=origin;}};
 const hooks={createElement(type,props,...children){return {type,props:{...props,children}};},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useLayoutEffect(fn){effects.push(fn);}};
 const saved={host:globalThis.__gwToastComponentHarness,document:globalThis.document};globalThis.__gwToastComponentHarness=hooks;globalThis.document=documentRef;
 const result=await build({entryPoints:[new URL('../src/toast.jsx',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'synthetic-toast-controls',setup(builder){builder.onResolve({filter:/^react$/},()=>({path:'mock-react',namespace:'toast-hooks'}));builder.onLoad({filter:/.*/,namespace:'toast-hooks'},()=>({contents:"const h=globalThis.__gwToastComponentHarness;export const useRef=h.useRef,useLayoutEffect=h.useLayoutEffect;export default {createElement:h.createElement,Fragment:'fragment'};"}));builder.onLoad({filter:/toast\.css$/},()=>({contents:'',loader:'js'}));}}]});
 const Host=(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')+'#'+crypto.randomUUID())).ToastHost;
 const tree=Host({toast:{id:7,kind:'error',message:'Try again.'},dismissToast:id=>calls.push(['dismiss',id]),pauseToast:(reason,id)=>calls.push(['pause',reason,id]),resumeToast:(reason,id)=>calls.push(['resume',reason,id])});
 const nodes=[];function visit(value){if(!value||typeof value!=='object')return;nodes.push(value);for(const child of value.props?.children||[])if(Array.isArray(child))child.forEach(visit);else visit(child);}visit(tree);
 const surface=nodes.find(item=>item.props?.className==='gw-toast'),dismiss=nodes.find(item=>item.props?.className==='gw-toast-dismiss');surface.props.ref.current=node;
 const cleanups=effects.map(fn=>fn());
 return {surface:surface.props,dismiss:dismiss.props,documentRef,node,origin,button,inside,calls,get focuses(){return focuses;},cleanup(){for(const fn of cleanups)fn?.();},close(){globalThis.document=saved.document;if(saved.host===undefined)delete globalThis.__gwToastComponentHarness;else globalThis.__gwToastComponentHarness=saved.host;}};
}
test('actual handlers keep pointer/focus pauses independent, restore the origin and dismiss the exact instance',async()=>{
 const h=await interactionHarness();try{
  h.surface.onPointerEnter();h.documentRef.activeElement=h.button;h.surface.onFocus({currentTarget:h.node,relatedTarget:h.origin});h.surface.onPointerLeave();h.surface.onBlur({currentTarget:h.node,relatedTarget:h.inside});
  assert.deepEqual(h.calls,[['pause','hover',7],['pause','focus',7],['resume','hover',7]]);
  let prevented=false,stopped=false;h.surface.onKeyDown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(h.focuses,1);assert.deepEqual(h.calls.at(-1),['dismiss',7]);
 }finally{h.cleanup();h.close();}
});
test('actual cleanup restores focused toast origin after DOM removal without stealing unrelated focus',async()=>{
 const h=await interactionHarness();try{
  h.documentRef.activeElement=h.button;h.surface.onFocus({currentTarget:h.node,relatedTarget:h.origin});h.documentRef.activeElement=h.documentRef.body;h.cleanup();assert.equal(h.focuses,1);
  h.documentRef.activeElement=h.button;h.surface.onFocus({currentTarget:h.node,relatedTarget:h.origin});h.surface.onBlur({currentTarget:h.node,relatedTarget:h.origin});h.documentRef.activeElement={};h.cleanup();assert.equal(h.focuses,1);
 }finally{h.close();}
});
