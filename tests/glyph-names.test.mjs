import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import paths from '../src/glyph-paths.js';

// An unknown name silently renders the fallback chevron, so every literal Glyph name must exist.
test('every literal Glyph name has a drawn path',()=>{
 const src=new URL('../src/',import.meta.url),missing=[];
 for(const file of readdirSync(src).filter(name=>/\.jsx$/.test(name))){
  const source=readFileSync(new URL(file,src),'utf8');
  for(const pattern of [/<Glyph[^>]*?\bname="([\w-]+)"/g,/<Glyph[^>]*?\bname='([\w-]+)'/g,/<Button[^>]*?\bicon="([\w-]+)"/g,/<ActionRow[^>]*?\bicon="([\w-]+)"/g])
   for(const [,name] of source.matchAll(pattern))if(!(name in paths))missing.push(file+': '+name);
 }
 assert.deepEqual(missing,[]);
});

test('memorial menu, invitations and memorial avatars use real glyphs',()=>{
 for(const name of ['more','link','play','angel'])assert.ok(paths[name],name);
 assert.notEqual(paths.more,paths.arrow);
});
