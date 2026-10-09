import {PageAddedElement} from './page-elements.jsx';
import React,{useContext,useEffect,useId,useRef,useState} from 'react';
import {PageElementPreview} from './page-element-preview.jsx';
import {PageObjectTools} from './page-object-tools.jsx';
import {sharedPanelTitle} from './shared-panels.js';
import {Control,Glyph} from './ui-core.jsx';
import {PagePanelLockContext,usePageContent} from './page-content.jsx';
import {CARD_COLUMNS,cardSlots,cardLayoutOf,defaultCardLayout,moveCardSlot,stepCardSlot,alignCardSlot,applyCardImageSettings,cardColumnVertical,alignCardColumn,keyboardCardSlot,updateCardLayout,setCardSlotRemoved} from './card-content-layout-model.js';
import {ImageControlRow,ImageLayoutContext,ImageLayoutControls,LayoutChoices} from './image-edit-controls.jsx';
import './card-content-layout.css';

function useCardDrag({root,disabled,onMove,onKeyMove}){
 const gesture=useRef(null),[dragged,setDragged]=useState(null),[target,setTarget]=useState(null);
 const reset=()=>{gesture.current=null;setDragged(null);setTarget(null)};
 useEffect(()=>{if(disabled)reset()},[disabled]);
 const at=(x,y)=>{const node=document.elementFromPoint(x,y)?.closest('[data-card-drop-column]');if(!node||!root.current?.contains(node)||node.closest('[data-card-layout]')!==root.current)return null;return {column:node.dataset.cardDropColumn,beforeId:node.dataset.cardDropBefore||null};};
 const handle=id=>({
  onPointerDown:event=>{if(disabled||event.button!==0)return;event.stopPropagation();gesture.current={id,pointer:event.pointerId,x:event.clientX,y:event.clientY,active:false};try{event.currentTarget.setPointerCapture?.(event.pointerId)}catch{}},
  onPointerMove:event=>{const current=gesture.current;if(!current||current.pointer!==event.pointerId)return;event.stopPropagation();if(!current.active&&Math.hypot(event.clientX-current.x,event.clientY-current.y)<7)return;current.active=true;setDragged(id);setTarget(at(event.clientX,event.clientY));const scroller=document.scrollingElement;if(scroller){if(event.clientY<48)scroller.scrollTop-=16;else if(event.clientY>window.innerHeight-48)scroller.scrollTop+=16;}},
  onPointerUp:event=>{const current=gesture.current;if(current?.pointer!==event.pointerId)return;event.stopPropagation();const next=at(event.clientX,event.clientY);if(current.active&&next&&!disabled)onMove(current.id,next);reset()},
  onPointerCancel:reset,onLostPointerCapture:reset,
  onKeyDown:event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();reset();return}if(!disabled&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();onKeyMove(id,event.key)}}
 });
 return {handle,dragged,target,reset};
}

// `items` is an explicit map of source-owned React nodes. Stored content can
// place those allowlisted slots, never manufacture an action or private record.
export function CardContentLayout({page,cardId='hero',items,hidden=[],className=''}){
 const editor=usePageContent(page),locked=useContext(PagePanelLockContext),root=useRef(null),entry=useRef(null),baseline=useRef(undefined),helpId=useId();
 const [arranging,setArranging]=useState(false),[notice,setNotice]=useState(''),[toolSlot,setToolSlot]=useState(null),toolId=useId();
 useEffect(()=>{if(arranging)return editor.pauseAutosave?.()},[arranging,editor.pauseAutosave]);
 const panel=editor.content?.panelLayout?.panels.find(panel=>panel.id===cardId),slots=cardSlots(page,panel),layout=panel?cardLayoutOf(editor.content,page,panel):null;
 const allowed=editor.valid&&editor.allowed,editable=allowed&&editor.editing&&!locked&&!panel?.locked&&!panel?.removed,busy=editor.pending||editor.record?.status==='saving';
 const restoreFocus=id=>requestAnimationFrame(()=>{const item=[...(root.current?.querySelectorAll('[data-card-slot]')||[])].find(node=>node.dataset.cardSlot===id);item?.querySelector('.card-slot-layout,.card-slot-drag,.page-media-edit,.image-upload-choose')?.focus()});
 const change=(transform,id,message='Card content updated in your page draft.')=>{if(!editable||busy)return;const updated=editor.update(page,content=>updateCardLayout(content,page,cardId,transform),{historyLabel:arranging?undefined:'Change '+(slots.find(slot=>slot.id===(id||toolSlot))?.label.toLowerCase()||'panel layout')});if(updated){setNotice(message);if(id)restoreFocus(id)}};
 const drag=useCardDrag({root,disabled:!arranging||!editable||busy,onMove:(id,target)=>change(value=>moveCardSlot(value,id,target),id),onKeyMove:(id,key)=>change(value=>keyboardCardSlot(value,id,key),id)});
 useEffect(()=>{if(!editable||!editor.arrangingPage){setArranging(false);drag.reset()}},[editable,editor.arrangingPage]);
 useEffect(()=>{setArranging(false);baseline.current=undefined;drag.reset()},[page,cardId]);
 useEffect(()=>{const request=editor.objectRequest;if(!editable||!request||request.page!==page||request.cardId!==cardId||!slots.some(slot=>slot.id===request.slotId))return;setToolSlot(request.slotId);editor.activateSurface(root.current,toolId);const definition=slots.find(slot=>slot.id===request.slotId);editor.setSelectedObject({page,panelId:cardId,slotId:request.slotId,label:definition.label+' · '+sharedPanelTitle(page,panel,editor.content,editor.records)});editor.setObjectRequest(null)},[editor.objectRequest,editable,page,cardId,toolId]);
 if(!layout||!slots.length)return <>{Object.values(items)}</>;
 const objectLabel=definition=>(definition.role==='image'?'Photo':definition.label)+' · '+sharedPanelTitle(page,panel,editor.content,editor.records);
 const openLayout=id=>{setToolSlot(id);editor.activateSurface(root.current,toolId)};
 const selectSlot=(item,definition,event)=>{if(!editable||arranging||event.target.closest('.page-object-tools,.card-slot-layout'))return;editor.setSelectedObject({page,panelId:cardId,slotId:item.id,label:objectLabel(definition),onLayout:()=>openLayout(item.id)});if(definition.role==='action'&&event.type==='click'){event.preventDefault();event.stopPropagation();openLayout(item.id)}};
 const selected=toolSlot&&CARD_COLUMNS.flatMap(column=>layout[column].map(item=>({...item,column}))).find(item=>item.id===toolSlot),selectedDefinition=slots.find(slot=>slot.id===toolSlot);
 const start=event=>{baseline.current=editor.content.cardLayouts?.[cardId];editor.activateSurface(event.currentTarget);setArranging(true);setNotice('Drag content between columns, or use the labelled controls. Changes stay in your page draft.')};
 const close=()=>{setArranging(false);drag.reset();requestAnimationFrame(()=>entry.current?.focus())};
 const cancel=()=>{change(baseline.current);setNotice('Card arrangement cancelled. Other page edits are kept.');close()};
 const visible=column=>layout[column].filter(item=>!(layout.hidden||[]).includes(item.id)&&(arranging||!hidden.includes(item.id)));
 const single=!arranging&&CARD_COLUMNS.some(column=>!visible(column).length);
 return <div ref={root} className={'card-content-layout '+className+(arranging?' is-arranging':'')+(single?' is-single-column':'')} data-card-layout={cardId}>
  {editable&&editor.arrangingPage&&!arranging&&<div className="card-layout-entry"><Control ref={entry} type="button" disabled={busy} onClick={start}><Glyph name="settings"/>Arrange card content</Control></div>}
  {editable&&arranging&&<div className="card-layout-toolbar"><strong>Card content</strong><p id={helpId}>Move items within or between columns. On a phone, the left column comes first. Arrow keys on a drag handle move an item; Escape cancels the drag.</p><div><Control type="button" disabled={busy} onClick={()=>change(defaultCardLayout(page,panel),null,'Original card arrangement restored in your draft.')}>Reset arrangement</Control><Control type="button" disabled={busy} onClick={cancel}>Cancel arrangement</Control><Control type="button" className="card-layout-finish" disabled={busy} onClick={close}>Finish arranging</Control></div><p>Changes save automatically.</p></div>}
  <div className="card-content-columns">
   {CARD_COLUMNS.map(column=><div key={column} className={'card-content-column card-content-column-'+column} data-card-column={column} data-card-vertical={cardColumnVertical(layout,column)} data-card-drop-column={column} data-card-drop-active={arranging&&drag.target?.column===column&&!drag.target.beforeId||undefined} hidden={!arranging&&!visible(column).length}>
    {arranging&&<div className="card-column-heading"><h3 className="card-column-label">{column==='left'?'Left column':'Right column'}</h3><LayoutChoices label={(column==='left'?'Left':'Right')+' column vertical alignment'} value={cardColumnVertical(layout,column)} disabled={busy} options={[['top','Top'],['center','Center','middle'],['bottom','Bottom']]} onChange={vertical=>change(value=>alignCardColumn(value,column,vertical))}/><span className="card-column-hint">Align all content vertically</span></div>}
    {visible(column).map((item,index)=>{const definition=slots.find(slot=>slot.id===item.id);if(!definition)return null;return <div key={item.id} className="card-content-slot" data-card-slot={item.id} data-object-selected={editable&&!arranging&&editor.selectedObject?.page===page&&editor.selectedObject?.panelId===cardId&&editor.selectedObject?.slotId===item.id||undefined} onFocusCapture={event=>selectSlot(item,definition,event)} onClickCapture={event=>selectSlot(item,definition,event)} data-card-role={definition.role} data-card-align={item.align} data-card-image-aspect={item.aspect} data-card-image-width={definition.role==='image'?item.width:undefined} style={definition.role==='image'&&item.width?{'--card-image-width':item.width+'%'}:undefined} data-card-drop-column={column} data-card-drop-before={item.id} data-card-dragging={drag.dragged===item.id||undefined} data-card-drop-active={arranging&&drag.target?.beforeId===item.id||undefined}>
     {arranging&&<div className="card-slot-controls">
      <div className="card-slot-heading"><Control type="button" className="card-slot-drag" disabled={busy} aria-label={'Move '+definition.label} aria-describedby={helpId} {...drag.handle(item.id)}><svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M8 5h1m6 0h1M8 12h1m6 0h1M8 19h1m6 0h1" strokeLinecap="round"/></svg><span>{definition.label}</span></Control><div className="card-slot-order"><Control type="button" disabled={busy||index===0} aria-label={'Move '+definition.label+' earlier'} title="Move earlier" onClick={()=>change(value=>stepCardSlot(value,item.id,-1),item.id)}><Glyph name="arrow" className="arrange-up"/></Control><Control type="button" disabled={busy||index===visible(column).length-1} aria-label={'Move '+definition.label+' later'} title="Move later" onClick={()=>change(value=>stepCardSlot(value,item.id,1),item.id)}><Glyph name="arrow" className="arrange-down"/></Control></div></div>
      {definition.role==='image'?<ImageLayoutControls label={definition.label} value={{...item,column}} disabled={busy} onChange={settings=>change(value=>applyCardImageSettings(value,item.id,settings))}/>:<div className="card-slot-placement"><LayoutChoices label={definition.label+' column'} showLabels value={column} disabled={busy} options={[["left","Left"],["right","Right"]]} onChange={column=>change(value=>moveCardSlot(value,item.id,{column}),item.id)}/><LayoutChoices label={definition.label+' alignment'} value={item.align} disabled={busy} options={[["start","Left"],["center","Center"],["end","Right"],["stretch","Full width"]]} onChange={align=>change(value=>alignCardSlot(value,item.id,align))}/></div>}
     </div>}

     {editable&&!editor.arrangingPage&&<div className="card-slot-context-actions"><Control type="button" className="card-slot-layout" disabled={busy} aria-label={'Layout for '+definition.label} title={'Layout for '+definition.label} onClick={event=>{event.stopPropagation();editor.setSelectedObject({page,panelId:cardId,slotId:item.id,label:objectLabel(definition)});openLayout(item.id)}}><Glyph name="layout"/></Control></div>}
     <div className="card-slot-content" inert={editor.arrangingPage?true:undefined}><ImageLayoutContext.Provider value={definition.role==='image'&&editable?{value:{...item,column},label:definition.label,disabled:busy,apply:(content,settings)=>updateCardLayout(content,page,cardId,value=>applyCardImageSettings(value,item.id,settings)),commit:settings=>change(value=>applyCardImageSettings(value,item.id,settings),item.id)}:null}>{panel.elements?.some(element=>element.id===item.id)?<PageAddedElement page={page} panelId={cardId} element={panel.elements.find(element=>element.id===item.id)} editable={editable&&!editor.arrangingPage}/>:items[item.id]}</ImageLayoutContext.Provider>{arranging&&hidden.includes(item.id)&&<p className="card-slot-placeholder">{definition.label} appears here when available.</p>}</div>
    </div>})}
    {arranging&&<div className="card-column-drop-end" data-card-drop-column={column}>Drop content here</div>}
   </div>)}
  </div>
  {editable&&!arranging&&selected&&selectedDefinition&&editor.activeEditor===toolId&&<PageObjectTools title={objectLabel(selectedDefinition)} returnFocus={root.current?.querySelector('[data-card-slot="'+selected.id+'"] .card-slot-layout')} onClose={()=>{setToolSlot(null);editor.activateSurface(root.current)}}>
   <PageElementPreview sourceRoot={root} slotId={selected.id} label={selectedDefinition.label} revision={editor.content}/>
   {selectedDefinition.role==='image'?<ImageLayoutControls label={selectedDefinition.label} value={selected} disabled={busy} onChange={settings=>change(value=>applyCardImageSettings(value,selected.id,settings))}/>:<div className="page-object-tools-group"><ImageControlRow label="Within this panel"><LayoutChoices label={selectedDefinition.label+' column'} showLabels value={selected.column} disabled={busy} options={[["left","Left"],["right","Right"]]} onChange={column=>change(value=>moveCardSlot(value,selected.id,{column}))}/></ImageControlRow><ImageControlRow label="Alignment"><LayoutChoices label={selectedDefinition.label+' alignment'} value={selected.align} disabled={busy} options={[["start","Left"],["center","Center"],["end","Right"],["stretch","Full width"]]} onChange={align=>change(value=>alignCardSlot(value,selected.id,align))}/></ImageControlRow></div>}
   <div className="page-object-tools-group"><h3>Move within panel</h3><div className="page-object-tools-actions"><Control type="button" disabled={busy||layout[selected.column][0]?.id===selected.id} onClick={()=>change(value=>stepCardSlot(value,selected.id,-1))}>Move earlier</Control><Control type="button" disabled={busy||layout[selected.column].at(-1)?.id===selected.id} onClick={()=>change(value=>stepCardSlot(value,selected.id,1))}>Move later</Control></div></div>
   <div className="page-object-tools-group"><h3>{selected.column==='left'?'Left':'Right'} column alignment</h3><p>Moves all content in this column.</p><LayoutChoices label={(selected.column==='left'?'Left':'Right')+' column vertical alignment'} value={cardColumnVertical(layout,selected.column)} disabled={busy} options={[["top","Top"],["center","Middle","middle"],["bottom","Bottom"]]} onChange={vertical=>change(value=>alignCardColumn(value,selected.column,vertical))}/></div>
   <div className="page-object-tools-actions"><Control type="button" disabled={busy} onClick={()=>change(defaultCardLayout(page,panel),null,'Original layout restored for this panel only.')}>Reset panel layout</Control></div>
   <p role="status">{notice||'Changes save automatically.'}</p>
   <div className="page-editor-destructive-group sheet-footer"><Control type="button" className="page-editor-remove" disabled={busy} onClick={()=>{change(value=>setCardSlotRemoved(value,selected.id),null,selectedDefinition.label+' removed. Undo is available.');setToolSlot(null);editor.activateSurface(root.current)}}><Glyph name="close"/>Remove element</Control></div>
  </PageObjectTools>}
  <p className="sr-only" role="status" aria-live="polite">{notice}</p>
 </div>;
}

