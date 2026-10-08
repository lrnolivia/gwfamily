import {useEffect} from 'react';
import './shared-scroll-edge.css';
export function hasMoreBelow({scrollHeight,clientHeight,scrollTop}){return clientHeight>0&&scrollHeight-clientHeight-Math.max(0,scrollTop)>2}
// Owned by each actual scrolling surface. No viewport overlay and no listeners
// survive closure. Resize/content changes and keyboard scrolling share one path.
export function useScrollEdge(ref,enabled=true){
 useEffect(()=>{
  const node=typeof ref==='string'?document.getElementById(ref):ref.current;if(!node||!enabled)return;
  node.classList.add('gw-scroll-edge');let frame=null;
  const measure=()=>{frame=null;node.dataset.moreBelow=String(hasMoreBelow(node))};
  const schedule=()=>{if(frame===null)frame=requestAnimationFrame(measure)};
  measure();node.addEventListener('scroll',schedule,{passive:true});const resize=new ResizeObserver(schedule);resize.observe(node);for(const child of node.children)resize.observe(child);
  const mutation=new MutationObserver(schedule);mutation.observe(node,{childList:true,subtree:true,characterData:true});
  return()=>{if(frame!==null)cancelAnimationFrame(frame);node.removeEventListener('scroll',schedule);resize.disconnect();mutation.disconnect();node.classList.remove('gw-scroll-edge');delete node.dataset.moreBelow};
 },[ref,enabled]);
}
