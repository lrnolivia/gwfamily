import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

let bundle;
const same=(a,b)=>a?.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
async function harness(){
 if(!bundle){
  const result=await build({entryPoints:[new URL('../src/use-comment-anchor-focus.js',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'anchor-hooks',setup(build){
   build.onResolve({filter:/^react$/},()=>({path:'react',namespace:'anchor-hooks'}));
   build.onLoad({filter:/.*/,namespace:'anchor-hooks'},()=>({contents:'const h=globalThis.__gwAnchorHarness;export const useRef=h.useRef,useEffect=h.useEffect;'}));
  }}]});bundle=result.outputFiles[0].text;
 }
 const saved=globalThis.__gwAnchorHarness,slots=[],effects=[],calls=[];
 let cursor=0,props={postId:'post-a',route:{type:'post',id:'post-a',section:'comment:comment-a'},request:0,comments:[],available:true};
 const doc={activeElement:null,modal:null,querySelector:()=>doc.modal};
 const root={isConnected:true,ownerDocument:doc,nodes:[],inert:false,closest:()=>root.inert?root:null,querySelectorAll:()=>root.nodes};
 globalThis.__gwAnchorHarness={
  useRef(value){const index=cursor++;return slots[index]??(slots[index]={current:value})},
  useEffect(effect,deps){const index=cursor++;if(!same(slots[index],deps)){slots[index]=deps;effects.push(effect)}}
 };
 const module=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64')+'#'+crypto.randomUUID());
 return {doc,root,calls,get props(){return props},
  comment(id='comment-a'){const element={dataset:{commentId:id},scrollIntoView:options=>calls.push(['scroll',id,options]),focus:options=>{calls.push(['focus',id,options]);doc.activeElement=element}};root.nodes.push(element);return element},
  editable(kind='textarea'){const field={value:'An unsent draft',selectionStart:4,selectionEnd:9,matches:selector=>kind!=='contenteditable'&&selector.includes(kind),isContentEditable:kind==='contenteditable'};doc.activeElement=field;return field},
  render(next={},mounted=true){props={...props,...next};cursor=0;const ref=module.useCommentAnchorFocus(props);ref.current=mounted?root:null;for(const effect of effects.splice(0))effect()},
  close(){if(saved===undefined)delete globalThis.__gwAnchorHarness;else globalThis.__gwAnchorHarness=saved}
 };
}

test('initial anchor focuses and scrolls once; replaced comments and draft renders never repeat it',async()=>{
 const host=await harness();try{
  const anchor=host.comment();host.render();assert.equal(host.doc.activeElement,anchor);
  assert.deepEqual(host.calls,[['scroll','comment-a',{block:'center',behavior:'instant'}],['focus','comment-a',{preventScroll:true}]]);
  const field=host.editable();host.render({comments:[{id:'comment-a'}]});host.render({comments:[{id:'comment-a'},{id:'new-comment'}]});host.render();
  assert.equal(host.doc.activeElement,field);assert.equal(field.value,'An unsent draft');assert.equal(field.selectionStart,4);assert.equal(field.selectionEnd,9);assert.equal(host.calls.length,2);
 }finally{host.close()}
});
test('missing anchor waits for hydration and focuses once when it appears',async()=>{
 const host=await harness();try{
  host.render({available:false},false);host.render({available:true});assert.equal(host.calls.length,0);
  const anchor=host.comment();host.render({comments:[{id:'comment-a'}]});assert.equal(host.doc.activeElement,anchor);host.render({comments:[{id:'comment-a'}]});assert.equal(host.calls.length,2);
 }finally{host.close()}
});
test('late hydration consumes the jump rather than interrupting any editable field',async()=>{
 for(const kind of ['textarea','input','select','contenteditable']){
  const host=await harness();try{
   host.render();const field=host.editable(kind);host.comment();host.render({comments:[{id:'comment-a'}]});assert.equal(host.doc.activeElement,field);assert.deepEqual(host.calls,[]);
   host.doc.activeElement=null;host.render({comments:[{id:'comment-a'}]});assert.deepEqual(host.calls,[],'blurring later cannot revive a consumed jump');
  }finally{host.close()}
 }
});
test('an explicit same-anchor revisit focuses again even when the previous draft is active',async()=>{
 const host=await harness();try{
  const anchor=host.comment();host.render();host.editable();host.render({request:1});assert.equal(host.doc.activeElement,anchor);assert.equal(host.calls.length,4);
  host.editable();host.render({comments:[]});assert.equal(host.calls.length,4);
 }finally{host.close()}
});
test('new anchors, post changes, and Back/Forward route visits each permit a fresh jump',async()=>{
 const host=await harness();try{
  host.comment();host.render();const other=host.comment('comment-b');host.editable();const route={type:'post',id:'post-a',section:'comment:comment-b'};
  host.render({route});assert.equal(host.doc.activeElement,other);assert.equal(host.calls.length,4);
  host.editable();host.render({route:{...route}});assert.equal(host.doc.activeElement,other);assert.equal(host.calls.length,6);
  host.editable();host.render({postId:'post-b',route:{...route,id:'post-b'}});assert.equal(host.doc.activeElement,other);assert.equal(host.calls.length,8);
 }finally{host.close()}
});
test('clearing a section then returning to the anchor starts a new request',async()=>{
 const host=await harness();try{
  host.comment();host.render();host.render({route:{type:'post',id:'post-a'}});assert.equal(host.calls.length,2);
  host.render({route:{type:'post',id:'post-a',section:'comment:comment-a'}});assert.equal(host.calls.length,4);
 }finally{host.close()}
});
test('disconnected or closed detail roots and background sheets cannot receive focus',async()=>{
 const host=await harness();try{
  host.comment();host.root.isConnected=false;host.render();assert.deepEqual(host.calls,[]);
  host.root.isConnected=true;host.doc.modal={open:true};host.render({comments:[]});assert.deepEqual(host.calls,[]);
  host.doc.modal=null;host.render({comments:[]});assert.deepEqual(host.calls,[]);
  host.root.inert=true;host.render({request:1});assert.deepEqual(host.calls,[]);
  host.root.inert=false;host.render({comments:[]});assert.deepEqual(host.calls,[]);
  host.render({request:2},false);assert.deepEqual(host.calls,[]);
 }finally{host.close()}
});
test('non-comment and empty anchor sections never query or move focus',async()=>{
 const host=await harness();try{
  host.comment();host.root.querySelectorAll=()=>{throw new Error('Unrelated section queried comment anchors')};
  for(const section of [undefined,'details','comment:'])host.render({route:{type:'post',id:'post-a',section}});
  assert.deepEqual(host.calls,[]);
 }finally{host.close()}
});
test('App requests focus only after accepted comment navigation, independently of sheet intents',async()=>{
 const source=await readFile(new URL('../src/react-app.jsx',import.meta.url),'utf8');
 const go=source.slice(source.indexOf('function go(next)'),source.indexOf('function openSheet(next)'));
 assert.match(go,/if\(data\.defer\(\(\)=>go\(next\)\)\)return;if\(next\.type==='post'&&next\.section\?\.startsWith\('comment:'\)\)setCommentAnchorRequest\(value=>value\+1\)/);
 assert.equal((source.match(/setCommentAnchorRequest\(value=>value\+1\)/g)||[]).length,1);
 assert.match(source,/<DetailPost id=\{route.id\} anchorRequest=\{commentAnchorRequest\}\/>/);
 assert.match(source,/rootRef=useCommentAnchorFocus\(\{postId:id,route,request:anchorRequest,comments:state.comments\[id\],available:!!post\}\)/);
 assert.match(source,/return post\?<div ref=\{rootRef\} className="detail-page">/);
});
