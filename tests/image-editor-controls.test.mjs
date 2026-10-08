import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultCardLayout,moveCardSlot,applyCardImageSettings,cardLayoutsPayload} from '../src/card-content-layout-model.js';
import {photoFrameAt,updatePhotoFrame} from '../src/photo-framing-model.js';
const read=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
test('image setting changes retain same-column order and preserve unknown-to-editor legacy vertical metadata',()=>{
 const initial=moveCardSlot(defaultCardLayout('home',{kind:'hero'}),'media',{column:'left',beforeId:'title'});initial.left.find(item=>item.id==='media').vertical='bottom';
 const before=structuredClone(initial),next=applyCardImageSettings(initial,'media',{column:'left',align:'center',width:65,aspect:'square'});
 assert.deepEqual(next.left.map(i=>i.id),initial.left.map(i=>i.id));assert.deepEqual(initial,before);assert.deepEqual(next.left.find(i=>i.id==='media'),{id:'media',align:'center',width:65,aspect:'square',vertical:'bottom'});assert.deepEqual(cardLayoutsPayload({hero:next}).hero,next);
});
test('image placement changes retain source-owned slots and invalid destinations do nothing',()=>{
 const initial=defaultCardLayout('home',{kind:'hero'}),next=applyCardImageSettings(initial,'media',{column:'left',align:'stretch'});
 assert.equal(next.left.at(-1).id,'media');assert.equal(next.right.length,0);assert.equal(next.left.length,5);assert.equal(applyCardImageSettings(initial,'media',{column:'other'}),initial);assert.equal(applyCardImageSettings(initial,'missing',{column:'left'}),initial);
});
test('button zoom edits preserve independent mobile and desktop frame metadata',()=>{
 const initial={x:50,y:50,zoom:1,desktop:{x:20,y:40,zoom:2}},mobile=updatePhotoFrame(initial,'mobile',{x:52,y:48,zoom:1.5});
 assert.deepEqual(photoFrameAt(mobile,'desktop'),initial.desktop);assert.deepEqual(photoFrameAt(mobile,'mobile'),{x:52,y:48,zoom:1.5});assert.deepEqual(initial,{x:50,y:50,zoom:1,desktop:{x:20,y:40,zoom:2}});
});
test('direct photo editor uses one local draft, touch/key framing and bounded accessible button zoom, never sliders',()=>{
 const frame=read('photo-framing.jsx'),controls=read('image-edit-controls.jsx'),card=read('card-content-layout.jsx');
 assert.doesNotMatch(frame,/type="range"|photo-framing-ranges/);assert.match(frame,/useState\(\(\)=>imageLayout\?\.value\)/);assert.match(frame,/onChange=\{setLayoutDraft\}/);assert.match(frame,/onSave\?\.\(frames,layoutDraft\)/);assert.match(frame,/imageLayout.commit\(layoutDraft\)/);assert.match(frame,/onPointerCancel/);assert.match(frame,/keyboardPhotoFrame/);assert.match(frame,/aria-label="Zoom out"/);assert.match(frame,/aria-label="Zoom in"/);assert.match(frame,/Math.max\(1,value.zoom-.05\)/);assert.match(frame,/Math.min\(3,value.zoom\+.05\)/);assert.match(frame,/naturalWidth\/image.naturalHeight/);
 for(const label of ['Placement','Alignment','Image size','Shape'])assert.ok(controls.includes('label="'+label+'"'));assert.match(controls,/aria-pressed=\{value===id\}/);assert.match(card,/definition.role==='image'&&editable/);assert.match(card,/settings=>change\(value=>applyCardImageSettings/);
});
test('inline Done uses a separate 44px grid column with compact glyph instead of covering text',()=>{
 const css=read('page-content.css');assert.match(css,/grid-template-columns:minmax\(0,1fr\) 44px/);assert.match(css,/page-field-done\{position:relative;inset:auto;[^}]*width:44px;height:44px/);assert.match(css,/page-field-done .glyph\{width:18px;height:18px/);
});
