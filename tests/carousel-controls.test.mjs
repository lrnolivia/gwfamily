import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {wrapCarouselIndex,carouselKeyboardDestination,beginCarouselSwipe,updateCarouselSwipe,carouselSwipeStep,carouselFrameScrollLeft} from '../src/carousel-model.js';

const read=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');
const [controls,css,memory,page,pageCss]=await Promise.all(['carousel-controls.jsx','carousel-controls.css','field-gallery/MemoryGallery.jsx','page-content.jsx','page-content.css'].map(read));
const point=(clientX,clientY,extra={})=>({clientX,clientY,pointerId:1,pointerType:'touch',isPrimary:true,...extra});

test('index navigation wraps existing order without inventing an item',()=>{
 assert.equal(wrapCarouselIndex(-1,3),2);assert.equal(wrapCarouselIndex(3,3),0);
 assert.equal(wrapCarouselIndex(0,0),0);assert.equal(wrapCarouselIndex(-1,1),0);
 assert.equal(wrapCarouselIndex(Infinity,3),0);assert.equal(wrapCarouselIndex(2,Infinity),0);
});
test('keyboard supports both side arrows and first/last without stealing unrelated keys',()=>{
 assert.equal(carouselKeyboardDestination('ArrowLeft',0,3),2);
 assert.equal(carouselKeyboardDestination('ArrowRight',2,3),0);
 assert.equal(carouselKeyboardDestination('Home',2,3),0);
 assert.equal(carouselKeyboardDestination('End',0,3),2);
 for(const key of ['Enter',' ','Tab','Escape','ArrowDown'])assert.equal(carouselKeyboardDestination(key,0,3),null);
 assert.equal(carouselKeyboardDestination('ArrowRight',0,1),null);
 assert.match(page,/event\.altKey\|\|event\.ctrlKey\|\|event\.metaKey\|\|event\.shiftKey/);
 assert.match(memory,/event\.altKey\|\|event\.ctrlKey\|\|event\.metaKey\|\|event\.shiftKey/);
});
test('only primary touch and pen pointers can start a synthetic swipe',()=>{
 assert.ok(beginCarouselSwipe(point(10,10)));
 assert.ok(beginCarouselSwipe(point(10,10,{pointerType:'pen'})));
 for(const extra of [{pointerType:'mouse'},{isPrimary:false},{clientX:NaN},{clientY:Infinity}])assert.equal(beginCarouselSwipe(point(10,10,extra)),null);
});
test('left/right swipes advance only after horizontal direction lock and deliberate distance',()=>{
 const start=beginCarouselSwipe(point(100,100));
 const left=updateCarouselSwipe(start,point(80,103));
 assert.equal(left.axis,'horizontal');assert.equal(carouselSwipeStep(left,point(40,104)),1);
 const right=updateCarouselSwipe(start,point(120,103));
 assert.equal(carouselSwipeStep(right,point(160,104)),-1);
 assert.equal(carouselSwipeStep(left,point(75,103)),0);
 assert.equal(carouselSwipeStep(start,point(40,100)),0);
 assert.equal(carouselSwipeStep(left,point(40,180)),0);
});
test('vertical starts remain vertical and ambiguous diagonal gestures do not advance',()=>{
 const start=beginCarouselSwipe(point(100,100)),vertical=updateCarouselSwipe(start,point(103,130));
 assert.equal(vertical.axis,'vertical');assert.equal(updateCarouselSwipe(vertical,point(0,133)).axis,'vertical');
 assert.equal(carouselSwipeStep(vertical,point(0,133)),0);
 const diagonal=updateCarouselSwipe(start,point(111,110));
 assert.equal(diagonal.axis,'pending');assert.equal(carouselSwipeStep(diagonal,point(160,155)),0);
 assert.equal(updateCarouselSwipe(start,point(105,106)).axis,'pending');
});
test('unrelated pointers, cancellation, pinch zoom and interactive child controls cannot advance',()=>{
 const gesture=updateCarouselSwipe(beginCarouselSwipe(point(100,100)),point(80,100));
 assert.equal(carouselSwipeStep(gesture,point(40,100,{pointerId:2})),0);
 assert.equal(carouselSwipeStep(null,point(40,100)),0);
 assert.match(controls,/event\.isPrimary===false\)\{cancel\(\);return\}/);
 assert.match(controls,/closest\('button,a,input,textarea,select,video,audio,\[contenteditable="true"\]'/);
 assert.match(controls,/onPointerCancel:cancel/);assert.match(controls,/onPointerLeave:cancel/);
 assert.doesNotMatch(controls,/preventDefault|setPointerCapture|touchmove|addEventListener\('touch/);
 assert.match(pageCss,/touch-action:pan-y pinch-zoom/);
});
test('native memory scroll changes only the bounded horizontal scroller and preserves focus',()=>{
 const root={scrollLeft:0,clientWidth:320,scrollWidth:960,left:20};
 assert.equal(carouselFrameScrollLeft(root,{left:20,width:320}),0);
 assert.equal(carouselFrameScrollLeft(root,{left:340,width:320}),320);
 assert.equal(carouselFrameScrollLeft(root,{left:1000,width:320}),640);
 assert.equal(carouselFrameScrollLeft(root,{left:-500,width:320}),0);
 assert.equal(carouselFrameScrollLeft({...root,scrollLeft:320},{left:340,width:320}),640);
 assert.match(memory,/target\.focus\(\{preventScroll:true\}\)/);assert.match(memory,/scroller\.scrollTo\(\{left:carouselFrameScrollLeft/);
 assert.doesNotMatch(memory,/scrollIntoView|useCarouselSwipe|onTouch|preventDefault\(\).*onOpen/);
 assert.match(memory,/scrollBehavior:reduced\?'auto':'smooth'/);
});
test('the two real carousels use the same native named side buttons with visible focus and 44px targets',()=>{
 assert.match(memory,/<CarouselControls previousLabel="Previous memory" nextLabel="Next memory"/);
 assert.match(page,/<CarouselControls previousLabel="Previous page photo" nextLabel="Next page photo"/);
 assert.match(controls,/<Control type="button" className="icon-button gw-carousel-control gw-carousel-previous" aria-label=\{previousLabel\}/);
 assert.match(controls,/<Control type="button" className="icon-button gw-carousel-control gw-carousel-next" aria-label=\{nextLabel\}/);
 assert.match(controls,/aria-controls=\{controls\}/);assert.match(controls,/<Glyph name="arrow"\/>/);
 assert.match(css,/min-inline-size:44px;min-block-size:44px/);assert.match(css,/:focus-visible\{outline:3px solid var\(--accent\)/);
 assert.match(css,/border-radius:var\(--radius-control\)/);assert.match(css,/\.liquid-glass\{background:color-mix/);
 assert.match(css,/forced-colors:active/);assert.doesNotMatch(controls,/←|→/);
});
test('mobile side overlays and desktop outside gutters stay bounded with no bottom arrows',()=>{
 assert.match(css,/position:absolute;top:50%;bottom:auto;transform:translateY\(-50%\)/);
 assert.match(css,/gw-carousel-previous\{left:8px;right:auto\}/);assert.match(css,/gw-carousel-next\{right:8px;left:auto\}/);
 assert.match(css,/@media\(min-width:768px\)/);assert.match(css,/@container gw-carousel \(min-width:400px\)/);
 assert.match(css,/max-width:calc\(100% - 120px\)/);assert.match(css,/gw-carousel-previous\{left:-52px\}/);assert.match(css,/gw-carousel-next\{right:-52px\}/);
 // 60px gutters contain a 44px control, its 8px gap and 5px focus ring.
 assert.ok(60-52-5>=0);assert.equal(52-44,8);
 assert.match(memory,/gridTemplateColumns:'minmax\(0, 1fr\)',rowGap:0/);
 assert.match(memory,/maxWidth:undefined/);assert.doesNotMatch(memory,/getGalleryCarouselControlPatch|gridRow:\s*'2'/);
 assert.doesNotMatch(page,/page-gallery-controls|page-previous/);
});
test('photo privacy, captions, media types, index reset, viewer opening and autoplay safeguards remain owned by existing flows',()=>{
 assert.match(page,/hero\.media\.filter\(file=>safePageMediaUrl\(file\.url,preview\)\)/);
 assert.match(page,/setIndex\(0\).*hero\.mode,hero\.media\.map\(item=>item\.id\)\.join\('\|'\)/);
 assert.match(page,/if\(reduced\|\|editing\)\{setPlaying\(false\);video\.current\?\.pause\(\)\}/);
 assert.match(page,/if\(!playing\|\|paused\|\|reduced\|\|editing\|\|media\.length<2\)return/);
 assert.match(page,/document\.visibilityState==='visible'/);assert.match(page,/setInterval\(next,6000\)/);
 assert.match(page,/disabled=\{reduced\|\|editing\}/);assert.match(page,/setPlaying\(false\);setIndex\(value=>wrapCarouselIndex/);
 assert.match(memory,/onClick=\{\(\)=>onOpen\(item\.id\)\}/);
 for(const type of ['video/','image/','audio/'])assert.ok(memory.includes(type));
 assert.match(memory,/\{item\.title\}<\/span>/);assert.match(memory,/src=\{item\.image\}/);
 assert.doesNotMatch(controls+memory,/dispatch\(|FEATURE_MEMORY|ADD_MEMORY|fetch\(|localStorage|sessionStorage/);
});
