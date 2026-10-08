import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {Extension} from '@tiptap/core';
import {EditorContent,useEditor} from '@tiptap/react';
import {Plugin} from '@tiptap/pm/state';
import {Slice} from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import {Markdown,MarkdownManager} from '@tiptap/markdown';
import {Control,Glyph} from './ui-core.jsx';
import {PageObjectTools} from './page-object-tools.jsx';
import {analyzePageMarkdown,checkMarkdownTransaction,literalMarkdownDocument,PAGE_MARKDOWN_HELP,safeMarkdownLink} from './page-markdown-model.js';
import './page-markdown.css';

// ProseMirror owns the editable DOM, selection, history and IME transactions.
// Never serialize contentEditable HTML or replace the editor on a mode toggle.
const starter=()=>StarterKit.configure({underline:false,trailingNode:false,link:{openOnClick:false,autolink:false,linkOnPaste:false,isAllowedUri:url=>!!safeMarkdownLink(url),HTMLAttributes:{rel:'noopener noreferrer',target:null}}});
const markdownOptions={markedOptions:{gfm:true,breaks:false}};
const displayManager=new MarkdownManager({...markdownOptions,extensions:[starter()]});
const EMPTY={type:'doc',content:[{type:'paragraph'}]};

function renderNode(node,key,inline=false){
 const children=(node.content||[]).map((child,index)=>renderNode(child,key+'.'+index,inline));
 if(node.type==='text'){
  let text=node.text;
  for(const [index,mark] of (node.marks||[]).entries()){
   const tag={bold:'strong',italic:'em',strike:'s',code:'code'}[mark.type];
   if(tag)text=React.createElement(tag,{key:key+'m'+index},text);
   else if(mark.type==='link'){const href=safeMarkdownLink(mark.attrs?.href);if(href)text=<a key={key+'m'+index} href={href} rel="noopener noreferrer">{text}</a>}
  }
  return <React.Fragment key={key}>{text}</React.Fragment>;
 }
 if(node.type==='hardBreak')return <br key={key}/>;
 if(node.type==='horizontalRule')return inline?<span key={key}> · </span>:<hr key={key}/>;
 if(node.type==='doc')return children;
 if(inline)return <React.Fragment key={key}>{children}{node.type==='paragraph'||node.type==='heading'||node.type==='listItem'?<br/>:null}</React.Fragment>;
 const tag={paragraph:'p',heading:'h'+node.attrs?.level,bulletList:'ul',orderedList:'ol',listItem:'li',blockquote:'blockquote',codeBlock:'pre'}[node.type];
 if(!tag)return null;
 return React.createElement(tag,{key,...(node.type==='orderedList'?{start:node.attrs?.start||1}:{})},node.type==='codeBlock'?<code>{children}</code>:children);
}

export function PageMarkdownBody({source='',className='',as:Tag='div',inline=false}){
 const result=useMemo(()=>analyzePageMarkdown(source,displayManager),[source]);
 return <Tag className={'page-markdown-body '+(inline?'is-inline ':'')+className}>{result.renderable?renderNode(result.doc,'body',inline):source}</Tag>;
}

function ToolIcon({name}){
 const paths={bold:'M7 4h6a4 4 0 0 1 0 8H7m0 0h7a4 4 0 0 1 0 8H7V4',italic:'M10 4h8M6 20h8M14 4 10 20',heading:'M5 4v16M15 4v16M5 12h10M19 15h2v5',bullet:'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',ordered:'M10 6h11M10 12h11M10 18h11M3 4h1v5M2 14c0-3 4-3 4 0 0 1-4 4-4 4h4',quote:'M10 5H4v7h5c0 3-2 5-5 6M21 5h-6v7h5c0 3-2 5-5 6',link:'m10 13 4-4M9 15l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M15 9l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',code:'m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',undo:'M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12',redo:'m16 5 5 5-5 5M21 10H10a6 6 0 0 0 0 12'};
 return <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]}/></svg>;
}

export function PageMarkdownEditor({value='',onChange,maxLength=12000,disabled=false,onDone,ariaLabel='Page text',autoFocus=false,className='',floating=false,onCancel,placeholder='Write something for the family…'}){
 const [initial]=useState(()=>analyzePageMarkdown(value,displayManager)),[source,setSource]=useState(value),[mode,setMode]=useState(initial.editable?'visual':'source'),[error,setError]=useState(''),[linkOpen,setLinkOpen]=useState(false),[linkValue,setLinkValue]=useState(''),[composing,setComposing]=useState(false),[,refresh]=useState(0);
 const id=useId(),textarea=useRef(null),linkInput=useRef(null),sourceRef=useRef(value),syncing=useRef(false),composition=useRef(false),visualSource=useRef(initial.editable?value:null),selection=useRef(null),sourceSelection=useRef({start:0,end:0}),latest=useRef({onChange,maxLength,disabled}),alive=useRef(true);
 latest.current={onChange,maxLength,disabled};
 const analysis=useMemo(()=>analyzePageMarkdown(source,displayManager),[source]);
 const publish=next=>{if(next===sourceRef.current)return;sourceRef.current=next;setSource(next);setError('');latest.current.onChange?.(next)};
 const guard=useMemo(()=>Extension.create({name:'pageMarkdownGuard',addProseMirrorPlugins(){return [new Plugin({filterTransaction(transaction){
  if(!transaction.docChanged||syncing.current)return true;
  const result=checkMarkdownTransaction(transaction.doc.toJSON(),displayManager,latest.current.maxLength);
  if(!result.ok)queueMicrotask(()=>{if(alive.current)setError(result.reason)});
  return result.ok;
 }})]}}),[]);
 const extensions=useMemo(()=>[starter(),Markdown.configure(markdownOptions),guard],[guard]);
 const editor=useEditor({
  immediatelyRender:false,injectCSS:false,extensions,content:initial.editable&&initial.doc?.content?.length?initial.doc:EMPTY,
  editable:!disabled&&initial.editable,
  editorProps:{
   attributes:{class:'page-markdown-visual',role:'textbox','aria-label':ariaLabel,'aria-multiline':'true','aria-describedby':id+'-help','data-placeholder':placeholder},
   // Pasting never imports untrusted HTML, styles, images or attachment URLs.
   handlePaste(view,event){if(!event.clipboardData)return false;event.preventDefault();const text=event.clipboardData.getData('text/plain');if(text){const doc=view.state.schema.nodeFromJSON(literalMarkdownDocument(text));view.dispatch(view.state.tr.replaceSelection(new Slice(doc.content,1,1)).scrollIntoView())}return true},
   handleDrop(view,event,_slice,moved){if(moved)return false;event.preventDefault();if(event.dataTransfer?.files?.length){setError('Add photos or files with the panel media controls.');return true}const text=event.dataTransfer?.getData('text/plain');if(text){const doc=view.state.schema.nodeFromJSON(literalMarkdownDocument(text)),position=view.posAtCoords({left:event.clientX,top:event.clientY})?.pos;if(position!=null)view.dispatch(view.state.tr.replaceRange(position,position,new Slice(doc.content,1,1)).scrollIntoView())}return true},
   handleDOMEvents:{compositionstart(){composition.current=true;setComposing(true);return false},compositionend(){composition.current=false;setComposing(false);return false}},
  },
  onUpdate({editor:current}){if(syncing.current)return;const next=current.getMarkdown();visualSource.current=next;publish(next)},
  onSelectionUpdate({editor:current}){selection.current={from:current.state.selection.from,to:current.state.selection.to};refresh(value=>value+1)},
  onTransaction(){refresh(value=>value+1)},
 },[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{if(value!==sourceRef.current){sourceRef.current=value;setSource(value);if(textarea.current&&textarea.current.value!==value)textarea.current.value=value}},[value]);
 useEffect(()=>{
  if(!editor)return;
  editor.setEditable(!disabled&&mode==='visual'&&analysis.editable,false);
  if(mode==='visual'&&!analysis.editable){setMode('source');return}
  if(mode==='visual'&&analysis.editable&&visualSource.current!==source&&!editor.view.composing){
   syncing.current=true;
   try{editor.commands.setContent(analysis.doc?.content?.length?analysis.doc:EMPTY,{emitUpdate:false});visualSource.current=source}finally{syncing.current=false}
   if(selection.current){const end=editor.state.doc.content.size;editor.commands.setTextSelection({from:Math.min(selection.current.from,end),to:Math.min(selection.current.to,end)})}
  }
 },[editor,source,mode,analysis.editable,disabled]);
 useEffect(()=>{
  if(!autoFocus||!editor)return;
  if(mode==='source')textarea.current?.focus();else editor.commands.focus();
 },[editor,autoFocus]);
 useEffect(()=>{if(linkOpen)linkInput.current?.focus()},[linkOpen]);
 const inSource=mode==='source',locked=disabled||composing||!editor||inSource;
 function switchMode(){
  if(disabled||composition.current||editor?.view.composing)return;
  setLinkOpen(false);
  if(inSource){if(!analysis.editable){setError(analysis.reason);return}sourceSelection.current={start:textarea.current.selectionStart,end:textarea.current.selectionEnd};setMode('visual');queueMicrotask(()=>editor?.commands.focus())}
  else{selection.current={from:editor.state.selection.from,to:editor.state.selection.to};if(textarea.current&&textarea.current.value!==sourceRef.current)textarea.current.value=sourceRef.current;setMode('source');queueMicrotask(()=>{textarea.current?.focus();textarea.current?.setSelectionRange(sourceSelection.current.start,sourceSelection.current.end)})}
 }
 function run(action){if(locked)return;setError('');action(editor.chain().focus()).run()}
 function showLink(){if(locked)return;selection.current={from:editor.state.selection.from,to:editor.state.selection.to};setLinkValue(editor.getAttributes('link').href||'');setLinkOpen(true);setError('')}
 function applyLink(remove=false){
  const href=remove?'':safeMarkdownLink(linkValue.trim());
  if(!remove&&!href){setError('Use an https://, http://, mailto:, /page or #section link.');linkInput.current?.focus();return}
  let command=editor.chain().focus();if(selection.current)command=command.setTextSelection(selection.current);
  if(remove)command.extendMarkRange('link').unsetLink().run();
  else if(editor.state.selection.empty&&!editor.isActive('link'))command.insertContent({type:'text',text:href,marks:[{type:'link',attrs:{href}}]}).run();
  else command.extendMarkRange('link').setLink({href}).run();
  setLinkOpen(false);setError('');
 }
 const tools=[
  ['bold','Bold','bold',chain=>chain.toggleBold()],['italic','Italic','italic',chain=>chain.toggleItalic()],['heading','Heading','heading',chain=>chain.toggleHeading({level:2})],
  ['bullet','Bulleted list','bulletList',chain=>chain.toggleBulletList()],['ordered','Numbered list','orderedList',chain=>chain.toggleOrderedList()],['quote','Quote','blockquote',chain=>chain.toggleBlockquote()],['code','Inline code','code',chain=>chain.toggleCode()],
 ];
 const toolbar=<>
  <div className="page-markdown-toolbar" role="group" aria-label={ariaLabel+' formatting'}>
   <div className="page-markdown-tools" role="group" aria-label="Text style">
    {tools.map(([icon,label,mark,command])=><Control key={icon} type="button" className="page-markdown-tool" title={label} aria-label={label} aria-pressed={!!editor?.isActive(mark)} disabled={locked} onMouseDown={event=>event.preventDefault()} onClick={()=>run(command)}><ToolIcon name={icon}/></Control>)}
    <Control type="button" className="page-markdown-tool" title="Link" aria-label="Add or edit link" aria-pressed={!!editor?.isActive('link')} aria-expanded={linkOpen} aria-controls={id+'-link'} disabled={locked} onMouseDown={event=>event.preventDefault()} onClick={showLink}><ToolIcon name="link"/></Control>
    <Control type="button" className="page-markdown-tool" aria-label="Undo formatting or typing" title="Undo" disabled={locked||!editor?.can().undo()} onMouseDown={event=>event.preventDefault()} onClick={()=>run(chain=>chain.undo())}><ToolIcon name="undo"/></Control>
    <Control type="button" className="page-markdown-tool" aria-label="Redo formatting or typing" title="Redo" disabled={locked||!editor?.can().redo()} onMouseDown={event=>event.preventDefault()} onClick={()=>run(chain=>chain.redo())}><ToolIcon name="redo"/></Control>
   </div>
   <div className="page-markdown-mode-tools">
    <Control type="button" className="page-markdown-source-toggle" aria-label={inSource?'Switch to formatted editing':'Edit Markdown source'} aria-pressed={inSource} disabled={disabled||composing||!editor} onMouseDown={event=>event.preventDefault()} onClick={switchMode}><span aria-hidden="true">{'</>'}</span><span>{inSource?'Source':'Markdown'}</span></Control>
   </div>
  </div>
  {linkOpen&&<div className="page-markdown-link" id={id+'-link'}><label htmlFor={id+'-url'}>Link address</label><div><input ref={linkInput} id={id+'-url'} type="url" inputMode="url" autoComplete="off" value={linkValue} placeholder="https://…" disabled={disabled} onChange={event=>setLinkValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();applyLink()}}}/><Control type="button" disabled={disabled} onClick={()=>applyLink()}>Apply</Control>{editor?.isActive('link')&&<Control type="button" disabled={disabled} onClick={()=>applyLink(true)}>Remove</Control>}<Control type="button" disabled={disabled} onClick={()=>{setLinkOpen(false);editor?.commands.focus()}}>Cancel</Control></div></div>}
 </>;
 const feedback=<>
  {!analysis.editable&&<p className="page-markdown-notice" role="status">{analysis.reason}</p>}
  {error&&<p className="page-markdown-error" role="alert">{error}</p>}
  <div className="page-markdown-footer"><details id={id+'-help'}><summary>Formatting help</summary><p>{PAGE_MARKDOWN_HELP} Source spelling is preserved when switching modes. Pasted text keeps its words; use the toolbar to format it.</p></details>{onDone&&<Control type="button" className="page-markdown-done" disabled={disabled||composing} onClick={onDone}><Glyph name="check"/>Done</Control>}</div>
 </>;
 const field=<div className={'page-markdown-editor '+className} data-mode={mode} aria-busy={!editor} onKeyDown={event=>{
  if(event.nativeEvent.isComposing||composition.current||event.keyCode===229)return;
  if(event.key==='Escape'&&linkOpen){event.preventDefault();event.stopPropagation();setLinkOpen(false);editor?.commands.focus()}
  else if(event.key==='Escape'&&onCancel){event.preventDefault();event.stopPropagation();onCancel()}
  else if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)&&!disabled){event.preventDefault();onDone?.()}
  else if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&!inSource){event.preventDefault();showLink()}
 }}>
  {toolbar}
  <div hidden={inSource} className={'page-markdown-visual-wrap'+(editor?.isEmpty?' is-empty':'')}><EditorContent editor={editor}/></div>
  <textarea ref={textarea} hidden={!inSource} className="page-markdown-source" aria-label={ariaLabel+' Markdown source'} aria-describedby={id+'-help'} defaultValue={value} disabled={disabled} maxLength={maxLength} rows={5} spellCheck={false} placeholder={placeholder} onCompositionStart={()=>{composition.current=true;setComposing(true)}} onCompositionEnd={event=>{composition.current=false;setComposing(false);publish(event.currentTarget.value)}} onChange={event=>publish(event.target.value)} onSelect={event=>{sourceSelection.current={start:event.currentTarget.selectionStart,end:event.currentTarget.selectionEnd}}}/>
  {feedback}
 </div>;
 return floating?<PageObjectTools title={'Text · '+ariaLabel} onClose={onDone}>{field}</PageObjectTools>:field;
}
