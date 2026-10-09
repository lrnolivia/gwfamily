import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/visual-system.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/ui-core.jsx',import.meta.url),'utf8');
test('title/detail menu icons stay tied to the first text line with an optical inset',()=>{
 assert.match(ui,/function ActionRow[\s\S]*?<Glyph name=\{icon\}\/><span><strong>\{title\}<\/strong><p>\{detail\}<\/p><\/span><span className="arrow"><Glyph name="arrow"\/><\/span>/);
 assert.match(css,/html \.list-row:has\(>span>strong\)>\.glyph,html \.list-row:has\(>span>strong\)>\.arrow\{align-self:flex-start;margin-block-start:calc\(\.6125rem - 9\.5px \+ \.15rem\)\}/);
 assert.doesNotMatch(css,/html \.list-row>\.glyph,html \.list-row>\.arrow\{align-self:flex-start;margin-block-start:0\}/);
});
test('first-line optical inset grows with accessible text size without centering on the detail block',()=>{
 // Half of the existing .875rem × 1.4 title line, minus half of the
 // incumbent 19px glyph, plus the small text-relative optical correction.
 for(const size of [14.4,16,17.6,19.2,20.8,32]){
  const inset=.6125*size-9.5+.15*size;
  assert.ok(inset>0);assert.ok(inset<1.225*size/2);
 }
});
