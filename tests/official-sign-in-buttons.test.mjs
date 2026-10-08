import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {officialProviderBrand,officialProviderBrandStatus,providerButtonState,GOOGLE_SIGN_IN_LOGO} from '../src/official-sign-in-brand.mjs';
import {createOfficialSignInButton} from '../src/official-sign-in-button-view.mjs';

const h=(type,props,...children)=>({type,props:props||{},children:children.flat().filter(value=>value!==false&&value!==null)});
const Button=createOfficialSignInButton({createElement:h});
const button=tree=>tree.children.find(node=>node.type==='button');
const providers=['google','microsoft','yahoo'];

test('email label aligns its existing glyph with text and scales with label typography',async()=>{
 const css=await readFile(new URL('../src/official-sign-in-button.css',import.meta.url),'utf8');
 assert.match(css,/\.sign-in-form \.email-field-label\{display:inline-flex;align-items:center;gap:\.4em;line-height:1\.35\}/);
 assert.match(css,/\.sign-in-form \.email-field-label>\.glyph\{inline-size:1em;block-size:1em;flex:none\}/);
});

test('all three official brands exist, and unknown or inherited providers fail closed',()=>{
 assert.deepEqual(officialProviderBrandStatus(),providers.map(id=>({id,ready:true})));
 for(const id of [undefined,null,{},'', 'apple','__proto__','constructor','toString','yahoo.com'])assert.equal(officialProviderBrand(id),null);
 assert.equal(Button({provider:'unknown',onClick(){}}),null);
});
test('every original light and dark asset is self-hosted, hashed, and unmodified',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../docs/provider-branding-assets.json',import.meta.url),'utf8'));
 for(const id of providers){
  const brand=officialProviderBrand(id);
  assert.equal(Object.isFrozen(brand),true);
  assert.match(brand.label,new RegExp(`^Sign in with ${id==='google'?'Google':id==='microsoft'?'Microsoft':'Yahoo'}$`));
  assert.ok(brand.width>0&&brand.height>0);
  for(const theme of ['light','dark']){
   assert.match(brand[theme],/^\/brand\/sign-in\/[a-z-]+\.[a-f0-9]{12}\.(svg|png)$/);
   const bytes=await readFile(new URL('../dist'+brand[theme],import.meta.url));
   const sha=createHash('sha256').update(bytes).digest('hex');
   const record=manifest.assets[`${id}-${theme}`];
   assert.equal(sha,record.sha256);assert.equal(bytes.length,record.bytes);assert.equal(brand[theme],record.path);
   assert.ok(brand[theme].includes(sha.slice(0,12)));
   if(brand[theme].endsWith('.svg')){
    const svg=bytes.toString();assert.match(svg,/<svg\b/);
    assert.doesNotMatch(svg,/<(?:script|foreignObject|image|text)\b|\bon\w+\s*=|\bhref\s*=/i);
   }else{assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),brand.width);assert.equal(bytes.readUInt32BE(20),brand.height);}
  }
 }
});
test('native controls have full accessible action labels and never submit the email form',()=>{
 for(const provider of providers){
  const control=button(Button({provider,onClick(){}}));
  assert.equal(control.type,'button');assert.equal(control.props.type,'button');
  assert.equal(control.props['aria-label'],officialProviderBrand(provider).label);
  assert.equal(control.props.disabled,false);
  assert.equal(control.children[1].props.className,'gw-provider-label');assert.equal(control.children[1].children[0],officialProviderBrand(provider).label);
  const mark=control.children[0];assert.equal(mark.props['aria-hidden'],true);
  const logo=mark.children[0];
  if(provider==='microsoft'){assert.equal(logo.type,'svg');assert.equal(logo.props.viewBox,'13 11 19 19');assert.deepEqual(logo.children.map(node=>node.props.fill),['#f25022','#00a4ef','#7fba00','#ffb900'])}
  else{assert.equal(logo.type,'img');assert.equal(logo.props.alt,'');assert.equal(logo.props['aria-hidden'],true);assert.equal(logo.props.draggable,false);assert.equal(logo.props.src,provider==='google'?GOOGLE_SIGN_IN_LOGO.src:officialProviderBrand(provider).dark)}
 }
});
test('enabled callbacks receive the original event without choosing endpoints or mutating auth',()=>{
 const calls=[],event={example:true};button(Button({provider:'google',onClick:e=>calls.push(e)})).props.onClick(event);
 assert.deepEqual(calls,[event]);
});
test('disabled, busy, and missing-handler controls cannot begin provider sign-in',()=>{
 for(const state of [{disabled:true},{busy:true}]){
  let calls=0;const tree=Button({provider:'yahoo',onClick:()=>calls++,...state});const control=button(tree);
  assert.equal(control.props.disabled,true);control.props.onClick({});assert.equal(calls,0);
  assert.ok(tree.children.some(node=>node.props?.className==='gw-provider-status'));
 }
 assert.equal(button(Button({provider:'microsoft'})).props.disabled,true);
 assert.equal(providerButtonState('microsoft',{busy:true}).disabled,true);
});
test('busy status preserves provider wording and original artwork',()=>{
 const tree=Button({provider:'yahoo',busy:true,onClick(){}}),control=button(tree);
 assert.equal(control.props['aria-busy'],true);assert.equal(control.props['aria-label'],'Sign in with Yahoo');
 assert.equal(control.children[0].children[0].props.src,officialProviderBrand('yahoo').dark);
 assert.equal(tree.children[1].children[0],'Opening sign-in…');
});
test('styles preserve complete art ratios, adequate targets, theme choice, focus and forced-color text',async()=>{
 const css=await readFile(new URL('../src/official-sign-in-button.css',import.meta.url),'utf8');
 assert.match(css,/min-inline-size:44px;min-block-size:44px/);
 assert.match(css,/block-size:56px/);assert.match(css,/object-fit:contain/);
 assert.match(css,/:focus-visible\{outline:3px solid/);
 assert.match(css,/html\[data-theme=dark\] \.gw-provider-button\{/);
 assert.match(css,/@media\(forced-colors:active\)/);assert.match(css,/\.gw-provider-label\{/);
 assert.doesNotMatch(css,/var\(--accent|brightness\(|grayscale\(|opacity:\.|object-fit:cover|animation:|@font-face/);
});
test('brand rendering never enables capabilities, starts authentication or injects provider SVG markup',async()=>{
 const source=await readFile(new URL('../src/official-sign-in-button-view.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fetch\(|\/api\/|location\.|window\.|innerHTML|dangerouslySetInnerHTML|config\./);
 assert.match(source,/if\(!state\)return null/);assert.match(source,/if\(!blocked\)onClick\(event\)/);
});


test('the supplied Google logo has verified original bytes and provenance',()=>{const bytes=Buffer.from(GOOGLE_SIGN_IN_LOGO.src.split(',')[1],'base64');assert.equal(createHash('sha256').update(bytes).digest('hex'),GOOGLE_SIGN_IN_LOGO.sha256);assert.equal(bytes.readUInt32BE(16),200);assert.equal(bytes.readUInt32BE(20),204);assert.equal(GOOGLE_SIGN_IN_LOGO.source,'https://developers.google.com/static/identity/images/g-logo.png')});
