import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emojiPickerLayout,emojiPage} from '../src/emoji-picker-model.js';
import {emojiChoices} from '../src/emoji-data.js';

test('phone emoji pages fit complete rows and reduce for the keyboard',()=>{
 for(const [width,height] of [[320,568],[390,844],[430,932],[390,320],[844,390]]){
  const layout=emojiPickerLayout(width,height);
  assert.ok(layout.pageSize<=24);assert.equal(layout.pageSize,layout.columns*layout.rows);
  assert.ok(layout.columns*44+(layout.columns-1)*2+20<=Math.min(300,width-24));
  assert.ok(layout.rows*46+192<=height);
 }
 assert.ok(emojiPickerLayout(390,320).rows<emojiPickerLayout(390,844).rows);
});
test('bounded next and previous pages retain access to the entire catalog',()=>{
 const seen=[];for(let page=0;page<Math.ceil(emojiChoices.length/24);page++){
  const result=emojiPage(emojiChoices,'',page,24);assert.ok(result.items.length<=24);seen.push(...result.items);
 }
 assert.deepEqual(seen,emojiChoices);assert.deepEqual(emojiPage(emojiChoices,'',0).items,emojiChoices.slice(0,24));
 assert.equal(emojiPage(emojiChoices,'',-1).page,0);assert.equal(emojiPage(emojiChoices,'',99999).page,Math.ceil(emojiChoices.length/24)-1);
});
test('search trims case, supports native glyphs and keeps empty results empty',()=>{
 assert.deepEqual(emojiPage(emojiChoices,'  HEART ').items,emojiPage(emojiChoices,'heart').items);
 assert.ok(emojiPage(emojiChoices,'❤️').items.some(e=>e.native==='❤️'));
 assert.equal(emojiPage(emojiChoices,'no-emoji-matches-this').total,0);
 assert.equal(emojiPage(emojiChoices,'no-emoji-matches-this').pages,0);
});
test('post menu retains every action and keyboard semantics without primary buttons',()=>{
 const source=readFileSync(new URL('../src/conversation.jsx',import.meta.url),'utf8'),menu=source.slice(source.indexOf('function PostMoreMenu('),source.indexOf('export function PostCard('));
 assert.equal((menu.match(/role="menuitem"/g)||[]).length,4);
 for(const glyph of ['focus','share','copy','flag'])assert.ok(menu.includes('name="'+glyph+'"'));
 assert.ok(menu.includes("['ArrowDown','ArrowUp','Home','End']"));assert.ok(menu.includes("event.key==='Escape'"));
 assert.doesNotMatch(menu,/className="button/);assert.ok(menu.includes('navigator.clipboard.writeText'));assert.ok(menu.includes('navigator.share'));
});
