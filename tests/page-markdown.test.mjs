import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzePageMarkdown,checkMarkdownTransaction,literalMarkdownDocument,markdownDocumentKey,plainTextToMarkdown,safeMarkdownDocument,safeMarkdownLink,supportedMarkdownTokens} from '../src/page-markdown-model.js';

const doc=text=>({type:'doc',content:[{type:'paragraph',...(text?{content:[{type:'text',text}]}:{})}]});
const manager=(value,output=value,tokens=[{type:'paragraph',tokens:[{type:'text',text:value}]}])=>({instance:{lexer:()=>tokens},parse:()=>doc(value),serialize:()=>output});

test('only explicit safe link schemes and local paths are active',()=>{
 for(const value of ['https://example.com/a?q=one&b=two','http://example.com','mailto:family@example.com','/reunion#details','#family'])assert.equal(safeMarkdownLink(value),value);
 for(const value of ['javascript:alert(1)',' JAVASCRIPT:alert(1)','data:text/html,test','vbscript:alert(1)','//evil.test','/\\evil.test','https://name:password@example.com','https://example.com\n@evil.test','https://example.com/%0aevil','mailto:x@example.com?body=secret','javascript&#58;alert(1)','java\u0000script:alert(1)','https://example.com/"onclick="x','https://','file:///etc/passwd','blob:https://example.com/id'])assert.equal(safeMarkdownLink(value),'',value);
});

test('nested HTML, media, tables, tasks and unknown tokens are never parsed as rich content',()=>{
 for(const token of [{type:'html',raw:'<img src=x onerror=alert(1)>'},{type:'image',href:'https://example.com/image.png'},{type:'table',header:[]},{type:'list_item',task:true},{type:'custom',raw:':::note'}])assert.equal(supportedMarkdownTokens([{type:'paragraph',tokens:[token]}]),false);
 assert.equal(supportedMarkdownTokens([{type:'link',href:'javascript:alert(1)',tokens:[{type:'text',text:'bad'}]}]),false);
 assert.equal(supportedMarkdownTokens([{type:'code',text:'<script>literal</script>'}]),true);
});

test('HTML check happens before parser entry and original source is never overwritten',()=>{
 const source='before\r\n\r\n<script>alert(1)</script>  \n';let parsed=false;
 const result=analyzePageMarkdown(source,{instance:{lexer:()=>[{type:'html',raw:source}]},parse(){parsed=true;throw Error('must not parse HTML')}});
 assert.equal(parsed,false);assert.equal(result.source,source);assert.equal(result.doc,null);assert.equal(result.editable,false);assert.equal(result.renderable,false);
});

test('visual editing requires a byte-exact roundtrip, including whitespace and delimiter spelling',()=>{
 for(const [source,normalized] of [['__hello__','**hello**'],['hello\r\nworld','hello\nworld'],['hello  ','hello'],['hello\n\n\n','hello\n\n'],['```\nunfinished','```\nunfinished\n```']]){
  const result=analyzePageMarkdown(source,manager(source,normalized));assert.equal(result.editable,false);assert.equal(result.source,source);assert.equal(result.renderable,true);assert.match(result.reason,/every character/);
 }
 const source='Family **news**';assert.equal(analyzePageMarkdown(source,manager(source)).editable,true);
});

test('parser and serialization failures retain exact source for recovery',()=>{
 const value='[unfinished](  \n中文 👩🏽‍💻';
 for(const broken of [{instance:{lexer(){throw Error('lexer')}}},{instance:{lexer:()=>[]},parse(){throw Error('parser')}},{instance:{lexer:()=>[]},parse:()=>doc('text'),serialize(){throw Error('serializer')}}]){
  const result=analyzePageMarkdown(value,broken);assert.equal(result.source,value);assert.equal(result.editable,false);
 }
});

test('document rendering accepts only known nodes and sanitized link marks',()=>{
 assert.equal(safeMarkdownDocument(doc('text <img>')),true);
 assert.equal(safeMarkdownDocument({type:'doc',content:[{type:'rawHTML',attrs:{html:'<img>'}}]}),false);
 assert.equal(safeMarkdownDocument({type:'text',text:'bad',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}),false);
 assert.equal(safeMarkdownDocument({type:'text',text:'good',marks:[{type:'link',attrs:{href:'https://example.com'}}]}),true);
 assert.equal(safeMarkdownDocument({type:'heading',attrs:{level:99}}),false);
});

test('transaction guard rejects overlength and lossy output without truncation',()=>{
 assert.deepEqual(checkMarkdownTransaction(doc('hello'),manager('hello'),5),{ok:true,source:'hello'});
 assert.equal(checkMarkdownTransaction(doc('hello'),manager('hello'),4).ok,false);
 const changed=manager('lost');assert.equal(checkMarkdownTransaction(doc('original'),changed).ok,false);
 assert.equal(checkMarkdownTransaction({type:'image'},manager('image')).ok,false);
});

test('JSON roundtrip comparison ignores only schema defaults, not meaningful marks or text',()=>{
 assert.equal(markdownDocumentKey({type:'doc',content:[]}),markdownDocumentKey(doc('')));
 const plain={type:'text',text:'x',marks:[{type:'link',attrs:{href:'https://example.com'}}]};
 assert.equal(markdownDocumentKey(plain),markdownDocumentKey({...plain,marks:[{type:'link',attrs:{href:'https://example.com',target:'_blank',rel:'noopener',class:null}}]}));
 assert.notEqual(markdownDocumentKey(doc('one')),markdownDocumentKey(doc('two')));
 assert.notEqual(markdownDocumentKey({type:'text',text:'x'}),markdownDocumentKey({type:'text',text:'x',marks:[{type:'bold'}]}));
});

test('plain paste JSON has literal text and hard breaks, never imported HTML',()=>{
 const value='<script>literal</script>\r\n**words**\n\nآخر';
 const result=literalMarkdownDocument(value);assert.equal(safeMarkdownDocument(result),true);
 assert.deepEqual(result.content[0].content,[{type:'text',text:'<script>literal</script>'},{type:'hardBreak'},{type:'text',text:'**words**'},{type:'hardBreak'},{type:'hardBreak'},{type:'text',text:'آخر'}]);
});

test('legacy copy conversion escapes Markdown, HTML, numbering and leading indentation',()=>{
 assert.equal(plainTextToMarkdown('Family news'),'Family news');
 assert.equal(plainTextToMarkdown('# Heading\r\n*literal* [name] \\ path'),'\\# Heading  \n\\*literal\\* \\[name\\] \\\\ path');
 assert.equal(plainTextToMarkdown('1. Not a list\n- Not a list'),'1\\. Not a list  \n\\- Not a list');
 assert.equal(plainTextToMarkdown('<b> &amp;'),'&lt;b&gt; &amp;amp;');
 assert.equal(plainTextToMarkdown('  indented'),'&#32;&#32;indented');
});

test('bounded recursive inspection rejects excessively nested content',()=>{
 let token={type:'text',text:'bottom'},node={type:'text',text:'bottom'};
 for(let index=0;index<45;index++){token={type:'blockquote',tokens:[token]};node={type:'blockquote',content:[node]}}
 assert.equal(supportedMarkdownTokens([token]),false);assert.equal(safeMarkdownDocument(node),false);
});

test('component delegates rich editing to ProseMirror, keeps modes mounted and has no HTML injection',async()=>{
 const source=await readFile(new URL('../src/page-markdown.jsx',import.meta.url),'utf8'),css=await readFile(new URL('../src/page-markdown.css',import.meta.url),'utf8');
 assert.match(source,/from '@tiptap\/react'/);assert.match(source,/from '@tiptap\/pm\/state'/);
 assert.doesNotMatch(source,/dangerouslySetInnerHTML|innerHTML\s*=|execCommand|contentEditable\s*=/);
 assert.match(source,/<div hidden=\{inSource\}/);assert.match(source,/<textarea ref=\{textarea\} hidden=\{!inSource\}/);
 assert.match(source,/compositionstart/);assert.match(source,/event\.nativeEvent\.isComposing/);
 assert.match(source,/sourceRef\.current/);assert.match(source,/visualSource\.current!==source/);
 assert.match(source,/setEditable\([^\n]+false\)/);assert.match(source,/if\(next===sourceRef\.current\)return/);
 assert.match(source,/aria-pressed=\{inSource\}/);assert.match(source,/\{'<\/>'\}/);
 assert.match(source,/getData\('text\/plain'\)/);assert.match(source,/checkMarkdownTransaction/);
 assert.match(css,/border-radius:3px/);assert.match(css,/font-size:1rem/);assert.match(css,/pointer:coarse/);assert.match(css,/forced-colors:active/);
});

// This integration gate runs in dependency-acquisition CI. An offline checkout
// explicitly reports the missing packages; it must not count the skip as QA.
let library;
try{library={...await import('@tiptap/markdown'),StarterKit:(await import('@tiptap/starter-kit')).default}}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
test('installed maintained parser roundtrips supported content and blocks unsupported syntax',{skip:!library&&'Tiptap not installed; authentic registry lock acquisition and browser QA are release gates'},()=>{
 const parser=new library.MarkdownManager({extensions:[library.StarterKit.configure({underline:false,trailingNode:false})],markedOptions:{gfm:true,breaks:false}});
 for(const source of ['','Family news','**Family** news','A [safe link](https://example.com)','## Heading','- One\n- Two']){
  const canonical=parser.serialize(parser.parse(source));const result=analyzePageMarkdown(canonical,parser);assert.equal(result.editable,true,canonical);assert.equal(checkMarkdownTransaction(result.doc,parser).ok,true,canonical);
 }
 for(const source of ['<script>alert(1)</script>','![photo](https://example.com/p.png)','- [x] Task','| A | B |\n| - | - |\n| 1 | 2 |'])assert.equal(analyzePageMarkdown(source,parser).editable,false,source);
 for(const source of ['__spelling__','text  \r\n','```\nunclosed']){const result=analyzePageMarkdown(source,parser);assert.equal(result.source,source)}
});
