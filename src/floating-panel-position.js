import {useEffect,useRef,useState} from 'react';

// Keep the header and dismissal control inside the visible viewport, including
// zoom offsets. Oversized content retains its existing internal scroll region.
export function clampFloatingPanel(position,size,viewport,margin=12){
 const left=viewport.left||0,top=viewport.top||0;
 return {x:Math.max(left+margin,Math.min(position.x,left+viewport.width-size.width-margin)),
  y:Math.max(top+margin,Math.min(position.y,top+viewport.height-size.height-margin))};
}
const viewport=()=>{const v=window.visualViewport;return {left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight}};
const sizeOf=node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height}};

export function useFloatingPanelPosition(ref){
 const [wide,setWide]=useState(()=>matchMedia('(min-width: 701px)').matches),[position,setPosition]=useState(null),gesture=useRef(null);
 useEffect(()=>{const query=matchMedia('(min-width: 701px)'),update=()=>{setWide(query.matches);if(!query.matches){gesture.current=null;setPosition(null)}};query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[]);
 useEffect(()=>{if(!wide||!position)return;const place=()=>{const node=ref.current;if(node)setPosition(current=>current?clampFloatingPanel(current,sizeOf(node),viewport()):null)};
  const observer=new ResizeObserver(place);if(ref.current)observer.observe(ref.current);
  window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
  return()=>{observer.disconnect();window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place)};
 },[wide,Boolean(position),ref]);
 const move=next=>{const node=ref.current;if(node)setPosition(clampFloatingPanel(next,sizeOf(node),viewport()))};
 const finish=event=>{const g=gesture.current;if(!g||g.id!==event.pointerId)return;gesture.current=null;try{event.currentTarget.releasePointerCapture(event.pointerId)}catch{}};
 const handle={tabIndex:wide?0:undefined,role:wide?'group':undefined,'aria-roledescription':wide?'movable panel':undefined,
  'aria-description':wide?'Drag the title bar or use arrow keys to move. Shift moves farther. Home restores the original position.':undefined,
  'data-movable':wide||undefined,
  onPointerDown:event=>{if(!wide||event.button!==0||event.target.closest('button,input,select,textarea,a'))return;const node=ref.current;if(!node)return;
   const rect=node.getBoundingClientRect();gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,prior:position};event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId)},
  onPointerMove:event=>{const g=gesture.current;if(wide&&g?.id===event.pointerId)move({x:g.left+event.clientX-g.x,y:g.top+event.clientY-g.y})},
  onPointerUp:finish,onLostPointerCapture:finish,
  onPointerCancel:event=>{const g=gesture.current;if(g?.id===event.pointerId){setPosition(g.prior);finish(event)}},
  onKeyDown:event=>{if(!wide||event.target!==event.currentTarget)return;const steps={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
   if(event.key==='Home'){event.preventDefault();setPosition(null);return}const step=steps[event.key];if(!step)return;event.preventDefault();const rect=ref.current?.getBoundingClientRect();if(rect){const distance=event.shiftKey?40:10;move({x:rect.left+step[0]*distance,y:rect.top+step[1]*distance})}}
 };
 return {handle,style:wide&&position?{left:position.x,top:position.y,right:'auto',bottom:'auto',transform:'none'}:undefined};
}
