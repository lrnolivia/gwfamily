import test from 'node:test';import assert from 'node:assert/strict';import {cssColorAlpha} from './css-color.mjs';
test('computed CSS alpha parses legacy and modern browser serialization',()=>{
 for(const value of ['rgba(1, 2, 3, 0.96)','rgb(1 2 3 / 96%)','color(srgb 0.97 0.97 0.94 / 0.96)','color(display-p3 1 0 0 / 96%)','oklch(50% 0.1 30 / .96)'])assert.equal(cssColorAlpha(value),.96,value);
 for(const value of ['rgb(1, 2, 3)','rgb(1 2 3)','color(srgb 1 0 0)','#abc','#aabbcc'])assert.equal(cssColorAlpha(value),1,value);
 assert.equal(cssColorAlpha('transparent'),0);assert.equal(cssColorAlpha('#0000'),0);assert.equal(cssColorAlpha('#00000080'),128/255);
 assert.equal(cssColorAlpha('color(srgb 1 1 1 / 0.94)'),.94);assert.ok(cssColorAlpha('rgba(1,2,3,.94)')<.96);
 for(const value of ['',null,'unknown','rgba(1,2,3,nan)','color(srgb 1 1 1 / 2)'])assert.ok(Number.isNaN(cssColorAlpha(value)),String(value));
});
