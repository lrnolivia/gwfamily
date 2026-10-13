import {useEffect,useRef,useState} from 'react';
// The shared page canvas and Home use one phone/tablet boundary.
export const NARROW_MEDIA='(max-width: 700px)';
export function useNarrow(beforeChange){
 const callback=useRef(beforeChange);callback.current=beforeChange;
 const [narrow,setNarrow]=useState(()=>typeof matchMedia==='function'&&matchMedia(NARROW_MEDIA).matches);
 useEffect(()=>{if(typeof matchMedia!=='function')return;const query=matchMedia(NARROW_MEDIA),update=()=>{callback.current?.(query.matches);setNarrow(query.matches)};update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);
 return narrow;
}
