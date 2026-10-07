// This module has no DOM or editor dependencies. Markdown is always the stored
// value; a parser is a projection of it, never the authority for untouched copy.
export const PAGE_MARKDOWN_HELP='Bold, italic, headings, lists, quotes, links and code. Other syntax stays intact in Markdown source. HTML is shown as text.';
export const PAGE_MARKDOWN_SOURCE_NOTICE='This text uses syntax or spacing that formatted editing would change. Edit its Markdown source to keep every character.';
const TOKEN_TYPES=new Set(['space','code','heading','hr','blockquote','list','list_item','paragraph','text','escape','strong','em','codespan','br','link','del']);
const NODE_TYPES=new Set(['doc','paragraph','text','heading','bulletList','orderedList','listItem','blockquote','codeBlock','horizontalRule','hardBreak']);
const MARK_TYPES=new Set(['bold','italic','strike','code','link']);

export function safeMarkdownLink(value){
 if(typeof value!=='string'||!value||value!==value.trim()||/[\s\u0000-\u001f\u007f-\u009f<>"'\\]/u.test(value)||/%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value))return '';
 if(/^#[A-Za-z0-9_-]+$/.test(value))return value;
 if(/^\/(?!\/)/.test(value))return value;
 if(/^mailto:[^@?&#]+@[^@?&#]+\.[^@?&#]+$/i.test(value))return value;
 if(!/^https?:\/\//i.test(value))return '';
 try{const url=new URL(value);return url.hostname&&!url.username&&!url.password&&['http:','https:'].includes(url.protocol)?value:''}catch{return ''}
}

export function supportedMarkdownTokens(tokens,depth=0){
 if(!Array.isArray(tokens)||depth>40)return false;
 return tokens.every(token=>{
  if(!token||!TOKEN_TYPES.has(token.type)||token.task===true||token.type==='link'&&!safeMarkdownLink(token.href))return false;
  if(token.tokens&&!supportedMarkdownTokens(token.tokens,depth+1))return false;
  if(token.items&&!supportedMarkdownTokens(token.items,depth+1))return false;
  return true;
 });
}

export function safeMarkdownDocument(node,depth=0){
 if(!node||depth>40||!NODE_TYPES.has(node.type))return false;
 if(node.type==='text'&&typeof node.text!=='string')return false;
 if(node.type==='heading'&&![1,2,3,4,5,6].includes(node.attrs?.level))return false;
 if(node.marks&&(!Array.isArray(node.marks)||node.marks.some(mark=>!MARK_TYPES.has(mark.type)||mark.type==='link'&&!safeMarkdownLink(mark.attrs?.href))))return false;
 return !node.content||Array.isArray(node.content)&&node.content.every(child=>safeMarkdownDocument(child,depth+1));
}

export function analyzePageMarkdown(value,manager){
 const source=typeof value==='string'?value:'',base={source,doc:null,renderable:false,editable:false,reason:PAGE_MARKDOWN_SOURCE_NOTICE};
 // Tokens are inspected BEFORE parsing: raw HTML must never reach the library's
 // HTML parser, even if that parser would later sanitize or discard the tags.
 try{
  if(!supportedMarkdownTokens(manager.instance.lexer(source)))return base;
  const doc=manager.parse(source);
  if(!safeMarkdownDocument(doc))return base;
  const editable=manager.serialize(doc)===source;
  return {...base,doc,renderable:true,editable,reason:editable?'':PAGE_MARKDOWN_SOURCE_NOTICE};
 }catch{return base}
}

// Ignore default/null attributes when comparing the editor schema's JSON with
// MarkdownManager JSON. Keep all meaningful text, order, marks and attributes.
export function markdownDocumentKey(node){
 if(!node||typeof node!=='object')return JSON.stringify(node);
 const clean=value=>{
  if(Array.isArray(value))return value.map(clean);
  if(value&&typeof value==='object'){
   const result={};
   for(const key of Object.keys(value).sort()){
    const item=value[key];
    if(item==null||key==='attrs'&&Object.values(item).every(entry=>entry==null))continue;
    if(key==='marks'&&item.length===0||key==='content'&&item.length===0)continue;
    if(key==='target'||key==='rel'||key==='class')continue;
    if(key==='start'&&item===1||key==='language'&&item===null)continue;
    const output=clean(item);if(output&&typeof output==='object'&&!Array.isArray(output)&&Object.keys(output).length===0)continue;
    result[key]=output;
   }
   return result;
  }
  return value;
 };
 const normalized=clean(node);
 if(normalized?.type==='doc'&&!normalized.content)normalized.content=[{type:'paragraph'}];
 return JSON.stringify(clean(normalized));
}

export function checkMarkdownTransaction(doc,manager,maxLength=Infinity){
 if(!safeMarkdownDocument(doc))return {ok:false,reason:'That formatting is not supported. Your text is unchanged.'};
 try{
  const source=manager.serialize(doc);
  if(source.length>maxLength)return {ok:false,reason:'This field allows '+maxLength+' characters, including Markdown. Shorten the text before adding more.'};
  const result=analyzePageMarkdown(source,manager);
  if(!result.editable||markdownDocumentKey(result.doc)!==markdownDocumentKey(doc))return {ok:false,reason:'That change cannot be kept safely in Markdown. Use the source editor instead.'};
  return {ok:true,source};
 }catch{return {ok:false,reason:'That change could not be converted to Markdown. Your previous text is kept.'}}
}

export function literalMarkdownDocument(text){
 return {type:'doc',content:[{type:'paragraph',...(text?{content:String(text).split(/\r\n|\r|\n/).flatMap((line,index)=>[...(index?[{type:'hardBreak'}]:[]),...(line?[{type:'text',text:line}]:[])])}:{})}]};
}

export function plainTextToMarkdown(text){
 return String(text??'').split(/\r\n|\r|\n/).map(line=>line.replace(/\\/g,'\\\\').replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[char])).replace(/([*_`\[\]~])/g,'\\$1').replace(/^(\s*)(#{1,6}|>|[-+]|\d+[.)])(?=\s|$)/,(_,space,marker)=>space+(/^\d/.test(marker)?marker.replace(/[.)]$/,'\\$&'):'\\'+marker)).replace(/^( +|\t+)/,spaces=>[...spaces].map(char=>char==='\t'?'&#9;':'&#32;').join(''))).join('  \n');
}
