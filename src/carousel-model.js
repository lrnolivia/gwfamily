// Shared carousel navigation math. Media and permissions stay with each owner.
export function wrapCarouselIndex(index,count){
 const parsedLength=Number(count),length=Number.isFinite(parsedLength)?Math.max(0,Math.trunc(parsedLength)):0;
 if(!length)return 0;
 const parsedValue=Number(index),value=Number.isFinite(parsedValue)?Math.trunc(parsedValue):0;
 return ((value%length)+length)%length;
}

export function carouselKeyboardDestination(key,index,count){
 if(count<2)return null;
 if(key==='ArrowLeft')return wrapCarouselIndex(index-1,count);
 if(key==='ArrowRight')return wrapCarouselIndex(index+1,count);
 if(key==='Home')return 0;
 if(key==='End')return count-1;
 return null;
}

export function beginCarouselSwipe(point){
 if(!point||point.isPrimary===false||!['touch','pen'].includes(point.pointerType)||!Number.isFinite(point.clientX)||!Number.isFinite(point.clientY))return null;
 return {pointerId:point.pointerId,x:point.clientX,y:point.clientY,axis:'pending'};
}

export function updateCarouselSwipe(gesture,point){
 if(!gesture||point.pointerId!==gesture.pointerId||gesture.axis!=='pending')return gesture;
 const x=Math.abs(point.clientX-gesture.x),y=Math.abs(point.clientY-gesture.y);
 if(Math.max(x,y)<8)return gesture;
 if(y>=x)return {...gesture,axis:'vertical'};
 if(x>=y*1.25)return {...gesture,axis:'horizontal'};
 return gesture;
}

export function carouselSwipeStep(gesture,point){
 if(!gesture||point.pointerId!==gesture.pointerId||gesture.axis!=='horizontal')return 0;
 const x=point.clientX-gesture.x,y=point.clientY-gesture.y;
 if(Math.abs(x)<36||Math.abs(x)<Math.abs(y)*1.25)return 0;
 return x<0?1:-1;
}

export function carouselFrameScrollLeft({scrollLeft,clientWidth,scrollWidth,left},{left:frameLeft,width}){
 const centered=scrollLeft+frameLeft-left-(clientWidth-width)/2;
 return Math.max(0,Math.min(Math.max(0,scrollWidth-clientWidth),centered));
}
