import test from 'node:test';
import assert from 'node:assert/strict';
import {clampFloatingPanel} from '../src/floating-panel-position.js';
test('dragging cannot take the pane or close control outside the viewport',()=>{
 const viewport={width:1280,height:900},size={width:360,height:700};
 assert.deepEqual(clampFloatingPanel({x:2000,y:1200},size,viewport),{x:908,y:188});
 assert.deepEqual(clampFloatingPanel({x:-200,y:-100},size,viewport),{x:12,y:12});
 assert.deepEqual(clampFloatingPanel({x:100,y:100},size,viewport),{x:100,y:100});
});
test('zoomed viewport offsets bound the pane in visible coordinates',()=>{
 assert.deepEqual(clampFloatingPanel({x:0,y:1000},{width:360,height:400},{left:120,top:70,width:700,height:600}),{x:132,y:258});
});
test('an oversized pane keeps its header reachable',()=>{
 assert.deepEqual(clampFloatingPanel({x:300,y:300},{width:800,height:900},{width:500,height:600}),{x:12,y:12});
});
