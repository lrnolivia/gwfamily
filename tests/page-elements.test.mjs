import test from 'node:test';import assert from 'node:assert/strict';
import {addCardElement,cardSlots,moveCardSlot,updateCardLayout} from '../src/card-content-layout-model.js';
import {PAGE_ELEMENT_TYPES} from '../src/page-elements-model.js';
import {sharedPageDefaults,validateSharedPageContent} from '../src/shared-content-schema.js';
import {pageContentPayload,withOutputMedia} from '../src/page-content-model.js';
import {sharedPageMedia,validatePanelTransition} from '../src/shared-panels.js';
import {pageStorageSnapshots,storedPageSnapshot} from '../backend/src/page-content-storage.mjs';
const unlocked=()=>{const c=sharedPageDefaults('home');c.panelLayout.panels.find(p=>p.id==='hero').locked=false;return c};
test('typed additions preserve existing slots and independent card arrangement across save and recovery',()=>{
 let content=unlocked();const original=cardSlots('home',content.panelLayout.panels[0]).map(s=>s.id);
 for(const [kind] of PAGE_ELEMENT_TYPES)content=addCardElement(content,'home','hero',kind,'element-'+kind);
 content=updateCardLayout(content,'home','hero',layout=>moveCardSlot(layout,'element-text',{column:'right'}));
 const payload=pageContentPayload(content),clean=validateSharedPageContent('home',payload),panel=clean.panelLayout.panels.find(p=>p.id==='hero');
 assert.deepEqual(cardSlots('home',panel).slice(0,original.length).map(s=>s.id),original);assert.equal(panel.elements.length,6);assert.ok(clean.cardLayouts.hero.right.some(s=>s.id==='element-text'));
 const snapshots=pageStorageSnapshots('home',clean);assert.equal(snapshots.extension.panelLayout.panels[0].elements,undefined);const restored=storedPageSnapshot(JSON.stringify(snapshots.content),JSON.stringify(snapshots.extension),JSON.stringify(snapshots.presentation));assert.equal(restored.panelLayout.panels[0].elements.length,6);
});
test('new element file IDs use the existing private-media ownership set and preserve output URLs',()=>{
 let content=addCardElement(unlocked(),'home','hero','media','element-media');content.panelLayout.panels[0].elements[0].media=[{id:'uploaded-photo',url:'/api/media/uploaded-photo',type:'image/png',name:'Synthetic.png',alt:'Synthetic'}];
 const payload=pageContentPayload(content);assert.equal(payload.panelLayout.panels[0].elements[0].media[0].url,undefined);assert.equal(sharedPageMedia(payload)[0].id,'uploaded-photo');const clean=validateSharedPageContent('home',payload);assert.equal(withOutputMedia(clean,content).panelLayout.panels[0].elements[0].media[0].url,'/api/media/uploaded-photo');
});
test('locked panels, duplicate identities, unknown types, unsafe actions and injected media metadata are refused',()=>{
 const locked=sharedPageDefaults('home');assert.equal(addCardElement(locked,'home','hero','text','element-text'),locked);
 const content=addCardElement(unlocked(),'home','hero','button','element-button');
 for(const mutate of [e=>e.kind='html',e=>e.destination='https://evil.test',e=>e.onclick='alert(1)',e=>e.media=[{id:'anything'}]]){const bad=structuredClone(content);mutate(bad.panelLayout.panels[0].elements[0]);assert.throws(()=>validateSharedPageContent('home',bad));}
 const duplicate=structuredClone(content);duplicate.panelLayout.panels[0].elements.push({...duplicate.panelLayout.panels[0].elements[0]});assert.throws(()=>validateSharedPageContent('home',duplicate));
 const after=structuredClone(content);after.panelLayout.panels[0].locked=true;const before=structuredClone(after);after.panelLayout.panels[0].elements[0].text='Modified';assert.throws(()=>validatePanelTransition('home',before,after),/Unlock/);
});
