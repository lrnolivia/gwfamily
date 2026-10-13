// Actual component handlers with deterministic hooks and browser API fixtures.
// These are not browser/layout acceptance tests; no external network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {restoreNotificationSettingFocus} from '../src/notification-model.js';
const bundled=await build({entryPoints:[new URL('../src/push-device.jsx',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'FixturePush',jsx:'automatic',plugins:[{name:'deterministic-ui',setup(b){
 b.onResolve({filter:/^(react(?:\/jsx-runtime)?|\.\/ui-core\.jsx)$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='./ui-core.jsx'?"export const Button='button',Control='button',Glyph='span';export const useApp=()=>globalThis.__APP;":args.path==='react/jsx-runtime'?"export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment='fragment';":"const hooks=globalThis.__HOOKS;export const useEffect=hooks.useEffect,useRef=hooks.useRef,useState=hooks.useState,useId=hooks.useId;export default {};"}));
}}]});
const source=bundled.outputFiles[0].text;
function nodes(tree){if(!tree||typeof tree!=='object')return [];const children=tree.props?.children;return [tree,...(Array.isArray(children)?children:[children]).flatMap(nodes)]}
function text(node){return node==null||node===false?'':typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):text(node.props?.children)}
async function fixture({write}={}){
 let cursor=0,dirty=false,effects=[],tree;const slots=[],calls=[],closed=[],notices=[],endpoint='https://web.push.apple.com/fixture-only';
 const fingerprint=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint))).toString('hex');
 const device={id:'fixture-device',keyVersion:'fixture-v1',endpointFingerprint:fingerprint,previewEnabled:false,previewRevision:0};
 const app={state:{mode:'live',selfId:'bob'},notifications:{settings:{globalOff:false}}};
 const storage=new Map(),context={__APP:app,Response,URL,crypto:{subtle:{digest:async()=>Buffer.from(fingerprint,'hex')}},TextEncoder,Uint8Array,atob,console,location:{href:'https://fictional.example.test/'},history:{state:{},replaceState(){}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{isSecureContext:true,Notification:{permission:'granted',requestPermission(){throw Error('Permission must not be requested')}},PushManager:{prototype:{subscribe(){},getSubscription(){}}},ServiceWorkerRegistration:{prototype:{showNotification(){}}},matchMedia:()=>({matches:false}),addEventListener(){},removeEventListener(){}},navigator:{userAgent:'Fictional Chromium',serviceWorker:{getRegistration:async()=>({active:true,pushManager:{getSubscription:async()=>({endpoint})},getNotifications:async()=>[{close:()=>closed.push(true)}]})}}};
 context.fetch=async(path,options)=>{calls.push({path,options});if(options.method==='GET')return Response.json({accountId:app.state.selfId,ready:true,keyVersion:'fixture-v1',devices:[{...device}],publicKey:'fixture-key'});if(write)return write(path,JSON.parse(options.body),device);throw Error('Unexpected mutation')};
 context.__HOOKS={useRef(initial){const index=cursor++;return slots[index]??=( {current:initial})},useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;dirty=true}]},useId(){cursor++;return 'fixture-info'},useEffect(fn,deps){const index=cursor++,prior=slots[index];if(!prior||deps.some((dep,i)=>!Object.is(dep,prior.deps[i]))){slots[index]={deps,cleanup:prior?.cleanup};effects.push(()=>{slots[index].cleanup?.();slots[index].cleanup=fn()})}}};
 vm.runInNewContext(source,context);
 const render=()=>{cursor=0;dirty=false;tree=context.FixturePush.PushDeviceSettings();const pending=effects;effects=[];for(const effect of pending)effect();return tree};
 const settle=async()=>{for(let i=0;i<4;i++){await new Promise(resolve=>setImmediate(resolve));if(dirty)render()}return tree};
 render();await settle();
 return {app,device,calls,closed,notices,render,settle,get tree(){return tree},checkbox:()=>nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox'),button:label=>nodes(tree).find(n=>n.type==='button'&&text(n)===label),change(on,extra={}){const input={disabled:false,isConnected:true,ownerDocument:{body:{},documentElement:{},activeElement:{}},focus(){},closest(){return null}};return this.checkbox().props.onChange({target:{checked:on},currentTarget:input,nativeEvent:{detail:1},...extra})},unmount(){for(const slot of slots)slot?.cleanup?.()}};
}
test('opening real settings only reads status and exposes an unchecked explicit preview disclosure',async()=>{
 const f=await fixture();assert.equal(f.checkbox().props.checked,false);assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'GET');assert.match(text(f.tree),/including on the lock screen/);assert.match(text(f.tree),/Off by default/);f.unmount();
});
test('successful opt-in sends only the explicit account/device/revision choice and never enrolls or test-sends',async()=>{
 const f=await fixture({write:async(path,body,device)=>{assert.equal(path,'/api/me/push/devices/fixture-device/preview');assert.deepEqual(body,{expectedAccountId:'bob',enabled:true,revision:0});device.previewEnabled=true;device.previewRevision++;return Response.json({accountId:'bob',id:device.id,previewEnabled:true,previewRevision:1})}});
 await f.change(true);await f.settle();assert.equal(f.checkbox().props.checked,true);assert.equal(f.calls.length,2);assert.equal(f.closed.length,0);f.unmount();
});
test('uncertain response keeps the confirmed choice and blocks further writes until a passive refresh recovers',async()=>{
 const f=await fixture({write:async(path,body,device)=>{device.previewEnabled=true;device.previewRevision=1;throw Error('Fictional interrupted response')}});
 await f.change(true);await f.settle();assert.equal(f.checkbox().props.checked,false);assert.equal(f.checkbox().props.disabled,true);assert.ok(f.button('Refresh preview setting'));
 await f.change(true);assert.equal(f.calls.length,2);await f.button('Refresh preview setting').props.onClick();await f.settle();assert.equal(f.checkbox().props.checked,true);assert.equal(f.checkbox().props.disabled,false);assert.equal(f.calls.length,3);assert.equal(f.calls[2].options.method,'GET');f.unmount();
});
test('late account-switch response cannot update the new account or close its notifications',async()=>{
 let resolve;const f=await fixture({write:()=>new Promise(done=>resolve=done)});const pending=f.change(false);f.app.state.selfId='alice';f.render();await f.settle();resolve(Response.json({accountId:'bob',id:'fixture-device',previewEnabled:false,previewRevision:1}));await pending;await f.settle();assert.equal(f.closed.length,0);assert.equal(f.checkbox().props.checked,false);assert.equal(f.checkbox().props.disabled,false);f.unmount();
});
test('repeated clicks share one in-flight preview write and hiding previews closes already shown notifications',async()=>{
 let resolve;const f=await fixture({write:()=>new Promise(done=>resolve=done)});const first=f.change(false);await f.change(false);assert.equal(f.calls.length,2);resolve(Response.json({accountId:'bob',id:'fixture-device',previewEnabled:false,previewRevision:1}));await first;await f.settle();assert.equal(f.closed.length,1);f.unmount();
});
test('keyboard focus restore cannot take focus from another control, hidden subtree or removed input',()=>{
 const document={body:{},documentElement:{},activeElement:null};document.activeElement=document.body;let calls=0;const input={isConnected:true,disabled:false,closest:()=>null,focus:()=>calls++};assert.equal(restoreNotificationSettingFocus(input,document),true);document.activeElement={};assert.equal(restoreNotificationSettingFocus(input,document),false);document.activeElement=document.body;for(const patch of [{disabled:true},{isConnected:false},{closest:()=>({})}])assert.equal(restoreNotificationSettingFocus({...input,...patch},document),false);assert.equal(calls,1);
});
