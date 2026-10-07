import React,{createContext} from 'react';
import {Control} from './ui-core.jsx';

// Only card-owned media receives placement controls. Uploads elsewhere keep
// their own framing, without acquiring page layout or persistence authority.
export const ImageLayoutContext=createContext(null);
export function LayoutGlyph({kind}){
 const paths={nudgeLeft:'M19 12H5m6-6-6 6 6 6',nudgeRight:'M5 12h14m-6-6 6 6-6 6',nudgeUp:'M12 19V5m-6 6 6-6 6 6',nudgeDown:'M12 5v14m-6-6 6 6 6-6',objectStart:'M3 3v18M7 7h10v10H7z',objectCenter:'M12 2v3m0 14v3M7 7h10v10H7z',objectEnd:'M21 3v18M7 7h10v10H7z',objectFill:'M3 3v18M21 3v18M6 7h12v10H6z',left:'M4 4h16v16H4zM11 4v16M7 8v8',right:'M4 4h16v16H4zM13 4v16M17 8v8',start:'M4 5h16M4 10h10M4 15h16M4 20h10',center:'M4 5h16M7 10h10M4 15h16M7 20h10',end:'M4 5h16M10 10h10M4 15h16M10 20h10',stretch:'M4 5h16M4 10h16M4 15h16M4 20h16',top:'M4 4h16M8 8h8v10H8z',middle:'M4 12h3m10 0h3M8 7h8v10H8z',bottom:'M4 20h16M8 6h8v10H8z',minus:'M5 12h14',plus:'M5 12h14M12 5v14',original:'M5 4h14v16H5zM8 15l3-4 3 3 2-2',landscape:'M3 6h18v12H3z',portrait:'M6 3h12v18H6z',square:'M4 4h16v16H4z'};
 return <svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.center}/></svg>;
}
export function LayoutChoices({label,value,options,disabled,onChange,showLabels=false}){
 return <div className="card-layout-choices" role="group" aria-label={label}>{options.map(([id,name,glyph])=><Control key={id} type="button" disabled={disabled} aria-label={label+': '+name} title={name} aria-pressed={value===id} onClick={()=>onChange(id)}><LayoutGlyph kind={glyph||id}/>{showLabels&&<span>{name}</span>}</Control>)}</div>;
}
export function ImageControlRow({label,children}){return <div className="image-control-row"><span className="image-control-label">{label}</span>{children}</div>}
export function ImageLayoutControls({value,onChange,disabled=false,label='Photo or video'}){
 const change=patch=>onChange({...value,...patch}),width=value.width||100;
 return <div className="image-layout-controls" aria-label="Image layout controls"><p className="page-editor-help">Layout changes affect all screen sizes. Left and right columns stack on phones.</p>
  <ImageControlRow label="Within this panel"><LayoutChoices label={label+' column'} showLabels value={value.column} disabled={disabled} options={[["left","Left"],["right","Right"]]} onChange={column=>change({column})}/></ImageControlRow>
  <ImageControlRow label="Alignment"><LayoutChoices label={label+' alignment'} value={value.align} disabled={disabled} options={[["start","Left","objectStart"],["center","Center","objectCenter"],["end","Right","objectEnd"],["stretch","Full width","objectFill"]]} onChange={align=>change({align})}/></ImageControlRow>
  <ImageControlRow label="Image size"><div className="card-image-size" role="group" aria-label={label+' size'}><Control type="button" disabled={disabled||width<=25} aria-label={'Decrease '+label+' size'} title="Smaller image" onClick={()=>change({width:Math.max(25,width-5)})}><LayoutGlyph kind="minus"/></Control><output aria-label={label+' size percentage'}>{width}%</output><Control type="button" disabled={disabled||width>=100} aria-label={'Increase '+label+' size'} title="Larger image" onClick={()=>change({width:Math.min(100,width+5)})}><LayoutGlyph kind="plus"/></Control></div></ImageControlRow>
  <ImageControlRow label="Exact width"><div className="image-width-settings"><label className="image-exact-width"><input type="number" inputMode="numeric" min={25} max={100} step={1} aria-label={label+' exact width percentage'} value={width} disabled={disabled} onChange={event=>{const next=Number(event.target.value);if(Number.isInteger(next)&&next>=25&&next<=100)change({width:next})}}/><span>%</span></label><div className="image-width-presets" role="group" aria-label={label+' width presets'}>{[25,50,75,100].map(next=><Control key={next} type="button" aria-pressed={width===next} disabled={disabled} onClick={()=>change({width:next})}>{next}%</Control>)}</div></div></ImageControlRow>
  <ImageControlRow label="Shape"><LayoutChoices label={label+' aspect ratio'} value={value.aspect||'original'} disabled={disabled} options={[["original","Original"],["landscape","Landscape 16:9"],["portrait","Portrait 3:4"],["square","Square 1:1"]]} onChange={aspect=>change({aspect})}/></ImageControlRow>
 </div>;
}
