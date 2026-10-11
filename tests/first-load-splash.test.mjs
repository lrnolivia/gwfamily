import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/first-load.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/first-load.css',import.meta.url),'utf8');
test('loading grove reuses real brand artwork with one visible message and a status',()=>{
 assert.match(source,/src="tree-artwork.png" alt=""/);
 assert.match(source,/A little closer to your people\./);
 assert.match(source,/role="status"/);
 assert.doesNotMatch(source,/ActivityDots|setTimeout|requestAnimationFrame/);
 assert.match(source,/error&&onRetry&&!busy/);
});
test('decorative leaves respect reduced motion and document visibility',()=>{
 assert.match(source,/document.hidden/);
 assert.match(source,/removeEventListener\('visibilitychange',update\)/);
 assert.match(source,/data-paused=\{hidden\|\|!busy\}/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/first-load-wind\{display:none/);
 assert.match(source,/svg.pauseAnimations\(\)/);
 assert.match(source,/animateMotion path=\{path\}/);
 assert.match(source,/className="first-load-trail" d=\{path\}/);
 assert.match(source,/stroke-dashoffset/);
 assert.match(source,/first-load-leaf-veins/);
 assert.doesNotMatch(css,/@keyframes[^}]*\b(?:width|height|left|top):/);
});
