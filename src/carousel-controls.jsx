import React,{useEffect,useRef,useState} from 'react';
import {Control,Glyph} from './ui-core.jsx';
import {beginCarouselSwipe,updateCarouselSwipe,carouselSwipeStep} from './carousel-model.js';
import './carousel-controls.css';

export function CarouselControls({onPrevious,onNext,previousLabel='Previous photo',nextLabel='Next photo',controls}){
 return <div className="gw-carousel-controls" role="group" aria-label="Photo navigation">
  <Control type="button" className="icon-button gw-carousel-control gw-carousel-previous" aria-label={previousLabel} aria-controls={controls} onClick={onPrevious}><Glyph name="arrow"/></Control>
  <Control type="button" className="icon-button gw-carousel-control gw-carousel-next" aria-label={nextLabel} aria-controls={controls} onClick={onNext}><Glyph name="arrow"/></Control>
 </div>;
}

export function useCarouselReducedMotion(){
 const [reduced,setReduced]=useState(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{
  if(typeof matchMedia!=='function')return;
  const query=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(query.matches);
  change();query.addEventListener('change',change);return()=>query.removeEventListener('change',change);
 },[]);
 return reduced;
}

// Pointer events leave native vertical scrolling and pinch zoom to the browser.
// Native scroll-snap galleries do not use this hook.
export function useCarouselSwipe({enabled,onStep}){
 const gesture=useRef(null),latest=useRef(onStep);
 latest.current=onStep;
 useEffect(()=>{gesture.current=null},[enabled]);
 const cancel=()=>{gesture.current=null};
 return {
  onPointerDown:event=>{
   if(!enabled||event.target.closest('button,a,input,textarea,select,video,audio,[contenteditable="true"]')){cancel();return}
   // A second pointer cancels the first gesture so pinch zoom never advances.
   if(event.isPrimary===false){cancel();return}
   gesture.current=beginCarouselSwipe(event);
  },
  onPointerMove:event=>{gesture.current=updateCarouselSwipe(gesture.current,event)},
  onPointerUp:event=>{
   const current=gesture.current;cancel();
   if(!enabled)return;
   const step=carouselSwipeStep(current,event);
   if(step)latest.current(step);
  },
  onPointerCancel:cancel,
  onPointerLeave:cancel,
 };
}
