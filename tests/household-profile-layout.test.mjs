// Offline source and server-rendered markup checks, not browser geometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const contents=`import React from 'react';import{renderToString}from'react-dom/server';import{AppContext}from'./src/ui-core.jsx';import{HouseholdProfile,HouseholdHeritage}from'./src/households.jsx';
export function render({photo=true,manage=true,own=true,colorMode='custom',personalThemes=true,count=2,theme='dark',heritageOnly=false,requestView=false,requests=true}={}){
 const members=Array.from({length:count},(_,i)=>({id:'fixture-'+i,name:i?'Fixture Relative '+i:'Fixture Member With A Very Long Name',profileColor:'#3985e6'}));
 const household={id:'fixture-household',name:'Fixture Household With A Long Shared Family Name',memberIds:members.map(m=>m.id),headIds:['fixture-0'],founderId:'fixture-0',canManage:manage,color:'#3985e6',colorMode,photo:photo?'fixture-group.jpg':null,photoFrame:{x:35,y:65,zoom:1.2},heritage:[{id:'fixture-heritage',personId:'fixture-ancestor',personKind:'ancestor',role:'ancestral-head',title:'Matriarch'}]};
 const state={mode:'preview',onboarding:'done',previewRoleView:'leader',selfId:own?'fixture-0':'fixture-visitor',householdId:household.id,householdIds:[household.id],members,households:[household],posts:[],memories:[],memorials:[{id:'fixture-ancestor',name:'Fixture Ancestor',photo:null}],householdRequests:requests?[{id:'fixture-invite',kind:'invite',householdId:household.id,recipientId:own?'fixture-1':'fixture-visitor',requesterId:'fixture-0'}]:[]};
 const app={state,theme,personalThemes,route:{type:'household',section:requestView?'requests':undefined},platform:'android',data:{},go(){},openSheet(){},dispatch(){},setToast(){}};
 return renderToString(<AppContext.Provider value={app}>{heritageOnly?<HouseholdHeritage household={household} editable={manage}/>:<HouseholdProfile id={household.id}/>}</AppContext.Provider>);
}`;
const compiled=await build({stdin:{contents,loader:'jsx',resolveDir:root},bundle:true,jsx:'automatic',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
const prior=Object.fromEntries(['window','document','location'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
Object.assign(globalThis,{window:{addEventListener(){},dispatchEvent(){},matchMedia(){return {matches:false}}},location:{protocol:'http:',pathname:'/'},document:{addEventListener(){},removeEventListener(){},visibilityState:'visible',documentElement:{style:{}},createElement(){return {width:0,height:0,getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}}},toDataURL(){return 'data:image/png;base64,'}}}}});
let renderer;
try{const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);renderer=module.exports}
finally{for(const[key,descriptor]of Object.entries(prior)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}

test('household header renders large group media, identity, then independent actions and member targets',()=>{
 const html=renderer.render();
 for(const marker of ['household-profile-head has-photo','household-photo-frame','household-profile-body','household-identity-copy','household-profile-actions','household-member-count muted','aria-label="Household members"','Manage household','aria-label="About Fixture Member With A Very Long Name"'])assert.ok(html.includes(marker),marker);
 assert.ok(html.indexOf('household-photo-frame')<html.indexOf('household-identity-copy'));assert.ok(html.indexOf('household-identity-copy')<html.indexOf('household-profile-actions'));assert.ok(html.indexOf('household-profile-actions')<html.indexOf('aria-label="Household members"'));
 assert.match(html,/object-position:35% 65%;transform:scale\(1.2\)/);assert.doesNotMatch(html,/Household requests|Children’s private records/);
});
test('no-photo and large-household states keep real member targets without fabricated group art',()=>{
 const html=renderer.render({photo:false,count:12});assert.doesNotMatch(html,/household-photo-frame|fixture-group.jpg|class="household-portrait-bar many"/);assert.equal((html.match(/aria-label="About Fixture /g)||[]).length,12);assert.match(html,/>12<!-- --> <!-- -->members</);
 const empty=renderer.render({photo:false,count:0});assert.doesNotMatch(empty,/aria-label="Household members"/);
});
test('household custom color, inherited preference and existing role-based actions are preserved',()=>{
 const pageShell=html=>html.match(/<section class="stack household-page"[^>]*>/)[0];assert.match(pageShell(renderer.render()),/--profile-color:#3985e6/);assert.doesNotMatch(pageShell(renderer.render({colorMode:'inherit'})),/--profile-color/);assert.doesNotMatch(pageShell(renderer.render({personalThemes:false})),/--profile-color/);
 assert.doesNotMatch(renderer.render({manage:false,own:true}),/household-profile-actions|Manage household|Request to join/);
 assert.match(renderer.render({manage:false,own:false}),/Request to join/);assert.doesNotMatch(renderer.render({manage:false,own:false}),/Manage household/);
});
test('ancestor identity remains one target and the trailing menu remains a separate permission-gated button',()=>{
 const html=renderer.render({heritageOnly:true});assert.match(html,/class="household-heritage-row stack"/);assert.match(html,/class="list-row"[^>]*><span class="avatar /);assert.match(html,/class="icon-button heritage-options"/);assert.match(html,/aria-label="Options for Fixture Ancestor" aria-haspopup="menu" aria-expanded="false"/);
 assert.doesNotMatch(renderer.render({heritageOnly:true,manage:false}),/heritage-options/);
});
test('header uses established tokens, shrink-safe layout and a mobile hero/action reflow without font substitution',()=>{
 const css=readFileSync(new URL('../src/household-profile.css',import.meta.url),'utf8');
 assert.match(css,/border-radius:var\(--radius-card\);background:var\(--surface\);color:var\(--text\)/);assert.match(css,/aspect-ratio:2\/1/);assert.match(css,/aspect-ratio:4\/3/);assert.match(css,/max-height:none;margin:0/);assert.match(css,/flex:1 1 18rem;min-width:0/);assert.match(css,/overflow-wrap:anywhere;text-wrap:balance/);assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/min-width:44px;min-height:44px/);assert.match(css,/\.household-profile-actions>\.button\{width:100%\}/);assert.doesNotMatch(css,/font-family:|#[0-9a-f]{3,8}\b|position:absolute|text-transform:uppercase/);
});

test('request notifications retain the recipient accept/decline task away from the profile header',()=>{
 const html=renderer.render({requestView:true,manage:false,own:false});assert.match(html,/household-requests-page/);assert.match(html,/Accept request/);assert.match(html,/Decline/);assert.match(html,/View household/);assert.doesNotMatch(html,/household-profile-head|Children’s private records/);
 assert.match(renderer.render({requestView:true,requests:false}),/No pending requests for this household/);
});
