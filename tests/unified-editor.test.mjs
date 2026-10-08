import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
test('selected-object tools are available without the Arrange gate and keep one active editor owner',()=>{
 const card=read('card-content-layout.jsx'),page=read('page-content.jsx');
 assert.match(card,/onFocusCapture=\{event=>selectSlot/);assert.match(card,/onClickCapture=\{event=>selectSlot/);assert.match(card,/editor.activeEditor===toolId/);assert.match(card,/editable&&!arranging&&selected/);assert.match(page,/<PagePanelActions page=\{page\}\/>/);assert.match(page,/Selected object/);assert.match(card,/definition.role==='action'.*event.preventDefault\(\);event.stopPropagation\(\)/);
});
test('context tools live outside canvas geometry with adaptive native dialog semantics',()=>{
 const source=read('page-object-tools.jsx'),css=read('page-object-tools.css');
 assert.match(source,/createPortal/);assert.match(source,/document.body/);assert.match(source,/if\(compact&&modalOnCompact\|\|protectedTask\)dialog.showModal\(\);else dialog.show\(\)/);assert.match(source,/aria-modal=\{compact&&modalOnCompact\|\|protectedTask\|\|undefined\}/);assert.match(source,/prior\?\.isConnected/);assert.match(css,/position:fixed/);assert.match(css,/min-width:44px;min-height:44px/);assert.doesNotMatch(read('page-panels.css'),/is-editing.is-wide>\.page-panel-columns/);
});
test('familiar image tools keep explicit shared layout scope and visible placement labels',()=>{
 const source=read('image-edit-controls.jsx');assert.match(source,/Placement/);assert.match(source,/Layout changes affect all screen sizes/);for(const label of ['Main','Side','Alignment','Image size','Shape'])assert.ok(source.includes(label));
});
test('plain field completion does not interpret IME composition as Enter or Escape',()=>{
 assert.match(read('page-content.jsx'),/onKeyDown=\{e=>\{if\(e.nativeEvent.isComposing\)return;if\(e.key==='Escape'\)/);assert.match(read('page-panels.jsx'),/onKeyDown=\{event=>\{if\(event.nativeEvent.isComposing\)return;if\(event.key==='Enter'\)/);
});

test('image transactions retain the original canvas and commit crop, source and layout through one owner',()=>{
 const source=read('page-content.jsx'),panels=read('page-panels.jsx'),photo=read('photo-framing.jsx');
 assert.match(source,/function PageMediaTask/);assert.match(source,/const next=\{\.\.\.content,hero:nextHero\};return nextLayout&&imageLayout\?\.apply\?imageLayout.apply\(next,nextLayout\):next/);assert.match(source,/JSON.stringify\(editor.content.hero\)!==JSON.stringify\(baseline.current\)/);assert.match(source,/hero=\{hero\} setHero=\{setHero\}/);assert.match(panels,/function PanelPhotoTask/);assert.match(panels,/if\(alive.current\)setDraft\(\{\.\.\.output/);assert.match(photo,/Framing target/);assert.match(photo,/aria-label="Reset frame"/);assert.match(photo,/\[\['desktop','Full'\],\['mobile','Mobile'\]\]/);assert.match(photo,/Photo position/);assert.match(photo,/frames,layoutDraft/);assert.match(photo,/!atomicLayout/);
});

test('reorder overview states an explicit saved order and has whole-card drag, Full/Mobile areas and protection routes',()=>{
 const panels=read('page-panels.jsx'),card=read('card-content-layout.jsx');
 assert.match(panels,/Panel order target/);assert.match(panels,/\[mobile\?'mobileOrder':'desktopOrder'\]/);assert.match(panels,/className="page-order-card"/);assert.match(panels,/Unlock protected cards/);assert.match(panels,/page-order-columns/);assert.match(panels,/setSharedPanelHero/);assert.match(panels,/setObjectRequest\(\{page,cardId:selectedPanel.id,slotId:slot.id\}\)/);assert.match(card,/Reset panel layout/);assert.match(card,/editor.objectRequest/);
});
