// Presentation metadata only. Original image IDs, URLs and bytes never change.
export const DEFAULT_PHOTO_FRAME=Object.freeze({x:50,y:50,zoom:1});
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
export function validatePhotoFrame(value){
 if(value===undefined||value===null)return {...DEFAULT_PHOTO_FRAME};
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['x','y','zoom','mobile','desktop'].includes(key)))throw Error('Use a supported photo frame');
 const {x,y,zoom=1}=value;
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(zoom)||x<0||x>100||y<0||y>100||zoom<1||zoom>3)throw Error('Photo position must be from 0 to 100 and zoom from 1 to 3');
 const result={x:Math.round(x*100)/100,y:Math.round(y*100)/100,zoom:Math.round(zoom*100)/100};
 for(const key of ['mobile','desktop'])if(value[key]!==undefined){const variant=value[key];if(!variant||typeof variant!=='object'||Array.isArray(variant)||Object.keys(variant).some(k=>!['x','y','zoom'].includes(k)))throw Error('Use a supported photo position');result[key]=validatePhotoFrame(variant);}
 return result;
}
export function normalizePhotoFrame(value){try{return validatePhotoFrame(value)}catch{return {...DEFAULT_PHOTO_FRAME}}}
export function photoFrameAt(value,viewport='desktop'){const frame=normalizePhotoFrame(value),selected=frame[viewport]||frame;return {x:selected.x,y:selected.y,zoom:selected.zoom};}
export function updatePhotoFrame(value,viewport,position){if(!['mobile','desktop'].includes(viewport))throw Error('Choose a supported photo layout');return validatePhotoFrame({...normalizePhotoFrame(value),[viewport]:validatePhotoFrame(position)});}
export function photoFrameStyle(value){
 const frame=normalizePhotoFrame(value),{x,y,zoom}=photoFrameAt(frame);
 if(!frame.mobile&&!frame.desktop)return {objectFit:'cover',objectPosition:`${x}% ${y}%`,transform:zoom===1?undefined:`scale(${zoom})`,transformOrigin:`${x}% ${y}%`};
 const mobile=photoFrameAt(frame,'mobile');return {objectFit:'cover',objectPosition:'var(--gw-frame-current-x) var(--gw-frame-current-y)',transform:'scale(var(--gw-frame-current-zoom))',transformOrigin:'var(--gw-frame-current-x) var(--gw-frame-current-y)', '--gw-frame-desktop-x':`${x}%`,'--gw-frame-desktop-y':`${y}%`,'--gw-frame-desktop-zoom':zoom,'--gw-frame-mobile-x':`${mobile.x}%`,'--gw-frame-mobile-y':`${mobile.y}%`,'--gw-frame-mobile-zoom':mobile.zoom};
}
export function movePhotoFrame(frame,dx,dy,{width,height,imageWidth=width,imageHeight=height}={}){
 const current=normalizePhotoFrame(frame);if(!(width>0&&height>0&&imageWidth>0&&imageHeight>0))return current;
 const scale=Math.max(width/imageWidth,height/imageHeight),overflowX=imageWidth*scale*current.zoom-width,overflowY=imageHeight*scale*current.zoom-height;
 // Dragging the image moves the crop window in the opposite direction. Keep
 // position unchanged on an axis whose image already fits the viewport.
 return validatePhotoFrame({...current,x:overflowX>0?clamp(current.x-dx/overflowX*100,0,100):current.x,y:overflowY>0?clamp(current.y-dy/overflowY*100,0,100):current.y});
}
export function keyboardPhotoFrame(frame,key,step=2){const current=normalizePhotoFrame(frame),delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[key];if(key==='Home')return {...DEFAULT_PHOTO_FRAME};if(!delta)return null;return validatePhotoFrame({...current,x:clamp(current.x+delta[0],0,100),y:clamp(current.y+delta[1],0,100)});}
export function photoFramePayload(value){return value===undefined?{}:{frame:validatePhotoFrame(value)}}
