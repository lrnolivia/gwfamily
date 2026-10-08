import test from 'node:test';
import assert from 'node:assert/strict';
import {photoPanAxes,updatePhotoFrame,photoFrameAt} from '../src/photo-framing-model.js';
test('position nudges only enable axes where the scaled image overflows',()=>{
 assert.deepEqual(photoPanAxes({x:50,y:50,zoom:1},{width:300,height:200,imageWidth:1200,imageHeight:800}),{x:false,y:false});
 assert.deepEqual(photoPanAxes({x:50,y:50,zoom:1},{width:300,height:300,imageWidth:1200,imageHeight:800}),{x:true,y:false});
 assert.deepEqual(photoPanAxes({x:50,y:50,zoom:1.2},{width:300,height:200,imageWidth:1200,imageHeight:800}),{x:true,y:true});
 assert.deepEqual(photoPanAxes(null,{}),{x:false,y:false});
});
test('local dual-target draft and scoped reset preserve the other framing target',()=>{
 const initial={x:30,y:60,zoom:1},phone=updatePhotoFrame(initial,'mobile',{x:40,y:55,zoom:1.4}),both=updatePhotoFrame(phone,'desktop',{x:20,y:30,zoom:1.6}),reset=updatePhotoFrame(both,'mobile',{x:50,y:50,zoom:1});
 assert.deepEqual(photoFrameAt(reset,'desktop'),{x:20,y:30,zoom:1.6});assert.deepEqual(photoFrameAt(reset,'mobile'),{x:50,y:50,zoom:1});assert.deepEqual(initial,{x:30,y:60,zoom:1});
});
