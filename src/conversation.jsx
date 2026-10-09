import {MemberMiniCard,MemberIdentityControl} from './person-identity.jsx';
import {PageMarkdownBody,PageMarkdownEditor} from './page-markdown.jsx';
import {TaggedFamily} from './member-tags.jsx';
import {readPreviewFile} from './uploads.js';
import {profilePalette} from './profile-model.js';
import {BackgroundEffect,BackgroundMedia,posterStyle} from './backgrounds.jsx';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ActivityDots,useTypingPresence,typingLabel} from './activity.jsx';
import {Control,Avatar,Glyph,MemberBadges,Popover,useApp,formatTime} from './ui-core.jsx';
import {emojiChoices} from './emoji-data.js';
import {emojiPickerLayout,emojiPage} from './emoji-picker-model.js';
import './reaction-menu.css';
import {canManageContent,contentDestination} from './content-actions-model.js';
import {pollResults,nextPollSelection} from './poll-model.js';
import {routeHash} from './navigation.js';
import './poll.css';
const quick=['❤️','👏','😂','🎉','🙏'];
export function MemberLink({id,compact=false}){const {state}=useApp(),m=state.members.find(x=>x.id===id);return <MemberIdentityControl id={id} className={'member-link '+(compact?'compact':'')}><Avatar member={m}/><span><strong>{m?.name||'Family member'}</strong>{!compact&&<MemberBadges member={m}/>}</span></MemberIdentityControl>}
export function EmojiPicker({targetId,open,onClose,anchor}){
 const {state,dispatch}=useApp(),[query,setQuery]=useState(''),[page,setPage]=useState(0),[layout,setLayout]=useState(()=>emojiPickerLayout());
 useLayoutEffect(()=>{if(!open)return;setQuery('');setPage(0);const resize=()=>setLayout(emojiPickerLayout(window.visualViewport?.width||innerWidth,window.visualViewport?.height||innerHeight));resize();window.visualViewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);return()=>{window.visualViewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize)}},[open]);
 const result=emojiPage(emojiChoices,query,page,layout.pageSize),own=state.reactions[targetId]||[];
 const choose=emoji=>{dispatch({type:'TOGGLE_REACTION',targetId,emoji});onClose()};
 return <Popover open={open} onClose={onClose} anchor={anchor} className="reaction-pop" style={{'--emoji-columns':layout.columns}}>
  <div className="quick-emoji" aria-label="Common reactions">{quick.map(emoji=><Control className="emoji-choice" key={emoji} type="button" onClick={()=>choose(emoji)} aria-label={'React '+emoji} aria-pressed={own.includes(emoji)}>{emoji}</Control>)}</div>
  <input aria-label="Search emoji" type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0)}} placeholder="Search emoji"/>
  <div className="emoji-grid" aria-label="Emoji choices">{result.items.map(emoji=><Control className="emoji-choice" key={emoji.native} type="button" title={emoji.name} aria-label={emoji.name} aria-pressed={own.includes(emoji.native)} onClick={()=>choose(emoji.native)}>{emoji.native}</Control>)}</div>
  {!result.total&&<p className="emoji-empty" role="status">No emoji found. Try another word.</p>}
  {result.pages>1&&<div className="emoji-pagination"><Control className="emoji-page-control" type="button" aria-label="Previous emoji" disabled={result.page===0} onClick={()=>setPage(result.page-1)}><Glyph name="arrow" className="emoji-previous"/></Control><span role="status" aria-live="polite">{result.page+1} / {result.pages}</span><Control className="emoji-page-control" type="button" disabled={result.page===result.pages-1} onClick={()=>setPage(result.page+1)}>More emoji <Glyph name="arrow"/></Control></div>}
 </Popover>
}
export function ReactionBar({targetId,small=false,countsOnly=false,triggerOnly=false}){const {state,dispatch,data}=useApp(),[open,setOpen]=useState(false),[people,setPeople]=useState(null),ref=useRef(null),own=state.reactions[targetId]||[],counts=state.reactionCounts?.[targetId],list=counts?Object.keys(counts).filter(emoji=>counts[emoji]>0):own;const peopleFor=emoji=>state.reactionMembers?.[targetId]?.[emoji]||(own.includes(emoji)?[state.selfId]:[]);return <span className={countsOnly?'received-reactions':small?'small-reaction-chips':'reaction-bar'}>{!triggerOnly&&list.map(e=><Control key={e} type="button" className="reaction-pill" aria-label={own.includes(e)?'Remove your '+e+' reaction':'See who reacted '+e} aria-pressed={own.includes(e)} disabled={Boolean(data?.pending)} onClick={event=>own.includes(e)?dispatch({type:'TOGGLE_REACTION',targetId,emoji:e}):setPeople({anchor:event.currentTarget,emoji:e})}>{e}<small>{counts?.[e]||1}</small></Control>)}{!countsOnly&&<Control ref={ref} type="button" className="react-trigger" aria-label="Add reaction" aria-expanded={open} onClick={()=>setOpen(!open)}><Glyph name="smile"/></Control>}<EmojiPicker key={targetId} targetId={targetId} open={open} onClose={()=>setOpen(false)} anchor={ref.current}/><Popover open={!!people} onClose={()=>setPeople(null)} anchor={people?.anchor} className="reaction-people-pop"><section className="reaction-people" aria-label="People who reacted"><h3>Reactions</h3><div className="reaction-people-tabs" role="tablist" aria-label="Reaction types">{list.map(emoji=><Control key={emoji} role="tab" aria-label={emoji+' reactions'} aria-selected={people?.emoji===emoji} onClick={()=>setPeople(p=>({...p,emoji}))}>{emoji} <span>{counts?.[emoji]||1}</span></Control>)}</div>{peopleFor(people?.emoji).map(id=><MemberLink key={id} id={id} compact/>)}{!peopleFor(people?.emoji).length&&<p>No reactions yet.</p>}<p className="small muted">Use the smile button to add or remove your reaction.</p></section></Popover></span>}

export function FileView({file,photoTarget}){const {go}=useApp();if(!file)return null;return <div className="local-file">{file.type?.startsWith('image/')?photoTarget?<Control className="photo-open" aria-label={'Open '+(file.name||'photo')} onClick={()=>go(photoTarget)}><img src={file.url} alt={file.name||'Attached image'}/></Control>:<><img src={file.url} alt={file.name||'Attached image'}/><a className="photo-save-link" href={file.url} download={file.name}>Save photo</a></>:file.type?.startsWith('video/')?<video src={file.url} controls/>:file.type?.startsWith('audio/')?<audio src={file.url} controls/>:<a href={file.url} download={file.name}><Glyph name="image"/>{file.name}</a>}</div>}
export function ComposerBox({kind='comments',targetId,parentId=null,onSubmit,placeholder='Write a comment…'}){
 const {state,dispatch,setToast,data}=useApp(),key=parentId||targetId,value=kind==='post'?state.drafts.post:state.drafts[kind]?.[key]||'',ref=useRef(null),lock=useRef(false),alive=useRef(true),[sending,setSending]=useState(false),[uploading,setUploading]=useState(false),fileKey=kind+':'+key,files=state.drafts.files?.[fileKey]||[];
 const current=useRef({value,files});current.current={value,files};
 const setFiles=value=>dispatch({type:'SET_DRAFT_FILES',key:fileKey,files:typeof value==='function'?value(current.current.files):value});
 const presence=useTypingPresence({scope:'posts',id:targetId,enabled:kind!=='post'&&!!state.posts?.some(post=>post.id===targetId)});
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const send=async()=>{
  if(lock.current||uploading||data?.pending||(!current.current.value.trim()&&!current.current.files.length))return;
  lock.current=true;setSending(true);presence.stop();
  const submitted={...current.current};
  try{
   const ok=await onSubmit(submitted.value.trim(),submitted.files);
   if(ok!==false&&JSON.stringify(current.current.files)===JSON.stringify(submitted.files))setFiles([]);
  }catch(error){setToast({kind:'error',message:(error?.message||'That could not be sent.')+' Your draft is still here.'})}
  finally{lock.current=false;if(alive.current)setSending(false)}
 };
 const change=e=>{dispatch({type:'SET_DRAFT',kind,key,value:e.target.value});if(!e.target.value.trim())presence.stop()};
 return <div className={'composer-wrap '+(kind==='replies'?'compact-reply':'')} aria-busy={sending||uploading}>
  <div className="writing-box"><textarea aria-label={placeholder} ref={ref} rows={kind==='replies'?1:kind==='post'?5:2} maxLength={kind==='post'?3000:1500} placeholder={placeholder} value={value} disabled={sending} onChange={change} onBlur={presence.stop}
   onInput={e=>{if(e.nativeEvent.isTrusted&&/^(insertText|insertCompositionText|insertLineBreak|delete)/.test(e.nativeEvent.inputType||''))presence.signal()}}
   onKeyDown={e=>{
    if(kind==='replies'&&e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send()}
    else if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();send()}
    else if(!e.metaKey&&!e.ctrlKey&&!e.altKey&&(e.key.length===1||['Backspace','Delete','Enter','Process'].includes(e.key)))presence.signal();
   }}/><Control type="button" className="attach-direct" disabled={sending||uploading} aria-label="Attach media or file" onClick={()=>ref.current?.parentElement?.querySelector('input[type=file]')?.click()}><Glyph name="plus"/></Control>
   <input className="sr-only" type="file" multiple disabled={sending||uploading} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onChange={async e=>{
    const selected=[...e.target.files];e.target.value='';if(!selected.length||lock.current)return;
    lock.current=true;setUploading(true);const finish=data?.beginPending?.();
    try{const uploaded=await Promise.all(selected.map(file=>readPreviewFile(file,state.mode)));setFiles(existing=>[...existing,...uploaded])}
    catch(error){setToast({kind:'error',message:error.message})}finally{lock.current=false;if(alive.current)setUploading(false);finish?.()}
   }}/><Control type="button" className="send-button" aria-label={sending?'Sending':'Send'} aria-busy={sending} onClick={send} disabled={sending||uploading||(!value.trim()&&!files.length)}>{sending?<ActivityDots label="Sending…" compact/>:<Glyph name="send"/>}</Control></div>
  {uploading&&<ActivityDots label="Uploading attachment…" className="composer-upload-status"/>}
  {files.map((file,index)=><div className="draft-file" key={file.url||index}><span>{file.name}</span><Control type="button" disabled={sending||uploading} aria-label={'Remove '+file.name} onClick={()=>setFiles(value=>value.filter((_,n)=>n!==index))}><Glyph name="close"/></Control></div>)}
 </div>
}
export function Poll({post}){
 const {state,dispatch,data}=useApp(),multiple=post.poll.mode==='multiple',{selected,counts,total,percentages}=pollResults(post.poll,state.pollSelections?.[post.id]||[]),[saving,setSaving]=useState(false),[error,setError]=useState(''),lock=useRef(false),buttons=useRef([]);
 async function toggle(index){if(lock.current||data?.pending)return;lock.current=true;setSaving(true);setError('');try{if(!await dispatch({type:'POLL_VOTE',postId:post.id,options:nextPollSelection(selected,index,multiple)}))setError('Your vote couldn’t be saved. Try that choice again.')}catch{setError('Your vote couldn’t be saved. Try that choice again.')}finally{lock.current=false;setSaving(false)}}
 function move(event,index){if(multiple||!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const length=post.poll.options.length,next=event.key==='Home'?0:event.key==='End'?length-1:(index+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+length)%length;buttons.current[next]?.focus();toggle(next)}
 return <div className={'poll '+(selected.length?'has-vote':'')} aria-busy={saving}><strong>{post.poll.question}</strong><div className="poll-options" role={multiple?'group':'radiogroup'} aria-label={post.poll.question||'Poll'}>{post.poll.options.map((option,index)=><Control ref={node=>buttons.current[index]=node} key={index} type="button" className={'poll-choice '+(selected.includes(index)?'is-selected':'')} role={multiple?'checkbox':'radio'} aria-checked={selected.includes(index)} tabIndex={multiple||index===(selected[0]??0)?0:-1} disabled={saving||Boolean(data?.pending)} onKeyDown={event=>move(event,index)} onClick={()=>toggle(index)}><span className="poll-fill" style={{'--poll-fill':`${percentages[index]}%`}} aria-hidden="true"/><span className="poll-label">{option}</span>{selected.length>0&&<span className="poll-result" aria-label={`${counts[index]} votes, ${Math.round(percentages[index])} percent`}>{Math.round(percentages[index])}%</span>}<span className={'poll-indicator '+(selected.includes(index)?'selected':'')} aria-hidden="true">{selected.includes(index)&&<Glyph name="check"/>}</span></Control>)}</div>{selected.length>0&&<small className="poll-total">{total} {total===1?'vote':'votes'} · Tap to change</small>}{saving&&<p className="poll-feedback" role="status">Saving your vote…</p>}{error&&<p className="poll-feedback" role="alert">{error}</p>}</div>;
}
function PostIdentity({post}){const {state,openSheet,go}=useApp(),m=state.members.find(x=>x.id===post.authorId),[anchor,setAnchor]=useState(null),info=useRef(null);

 return <><MemberIdentityControl id={post.authorId} className="identity-avatar"><Avatar member={m}/></MemberIdentityControl><div ref={info} className="identity-info"><div className="identity-line"><MemberIdentityControl id={post.authorId} className="identity-name">{m?.name||'Family member'}</MemberIdentityControl><Control className="post-time" type="button" title={new Date(post.createdAt).toLocaleString()} onClick={()=>openSheet({type:'post',id:post.id})}><time dateTime={new Date(post.createdAt).toISOString()}>{formatTime(post.createdAt)}</time></Control></div><MemberBadges member={m} interactive compact/></div></>}
function PostMoreMenu({post,comment=null,targetId,focused=false,onEdit,onDelete}){
 const app=useApp(),{state,go,openSheet,setToast}=app,item=comment||post,label=comment?'Comment':'Post',manageable=canManageContent(state,item),[open,setOpen]=useState(false),[copyFallback,setCopyFallback]=useState(''),anchor=useRef(null),menu=useRef(null);
 useEffect(()=>{if(open)menu.current?.querySelector('[role=menuitem]')?.focus()},[open]);
 const close=()=>setOpen(false),link=()=>{const url=new URL(window.location.href);url.hash=routeHash(comment?app.commentDestination?.(comment.id)||contentDestination(targetId,comment.id):{type:'post',id:post.id});return url.href;};
 const copy=async()=>{const url=link();try{await navigator.clipboard.writeText(url);setToast(label+' link copied');close()}catch{setCopyFallback(url)}};
 const share=async()=>{if(!navigator.share){await copy();return;}try{await navigator.share({title:'Green & White family '+label.toLowerCase(),url:link()});close()}catch(error){if(error?.name!=='AbortError')await copy();}};
 const keydown=event=>{if(event.key==='Escape'){event.preventDefault();close();anchor.current?.focus();return}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const items=[...menu.current.querySelectorAll('[role=menuitem]')],current=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus()};
 return <><Control ref={anchor} type="button" className="content-options-trigger" aria-label={label+" options"} aria-haspopup="menu" aria-expanded={open} onClick={()=>{setCopyFallback('');setOpen(value=>!value)}}><svg className="glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></Control><Popover open={open} onClose={close} anchor={anchor.current} className="post-overflow-pop"><div ref={menu} className="post-options" role="menu" aria-label={label+" options"} onKeyDown={keydown}>
  <>{!comment&&!focused&&<Control className="post-menu-item" type="button" role="menuitem" onClick={()=>{close();go({type:'post',id:post.id})}}><Glyph name="focus"/><span>Focus View</span></Control>}</>
  <Control className="post-menu-item" type="button" role="menuitem" onClick={share}><Glyph name="share"/><span>Share {label.toLowerCase()}</span></Control>
  <Control className="post-menu-item" type="button" role="menuitem" onClick={copy}><Glyph name="copy"/><span>Copy link</span></Control>
  {manageable&&<div className="post-menu-section" role="group" aria-label="Edit and delete"><Control className="post-menu-item post-menu-edit" type="button" role="menuitem" onClick={()=>{close();onEdit()}}><Glyph name="edit"/><span>Edit {label.toLowerCase()}</span></Control><Control className="post-menu-item post-menu-delete" type="button" role="menuitem" onClick={()=>{close();onDelete()}}><svg className="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/></svg><span>Delete {label.toLowerCase()}</span></Control></div>}
  <Control className="post-menu-item post-menu-report" type="button" role="menuitem" onClick={()=>{close();openSheet({type:'report',id:item.id,...(app.photoTarget?{photoTarget:app.photoTarget}:{})})}}><Glyph name="flag"/><span>Report</span></Control>
 </div>{copyFallback&&<label className="post-copy-fallback">Copy this private family link<input readOnly value={copyFallback} onFocus={event=>event.currentTarget.select()}/></label>}</Popover></>;
}
function ContentChange({item,kind,targetId,mode,onClose}){
 const {dispatch,data}=useApp(),[text,setText]=useState(item.text||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false),baseline=useRef(item.text||''),label=kind==='post'?'post':'comment';
 const submit=async event=>{event.preventDefault();if(lock.current||data?.pending)return;lock.current=true;setBusy(true);setError('');try{const ok=await dispatch({type:(mode==='delete'?'DELETE_':'EDIT_')+kind.toUpperCase(),id:item.id,targetId,expectedText:baseline.current,...(mode==='delete'?{}:{text})});if(ok!==false)onClose();else setError('Your change could not be saved. Try again; your draft is still here.')}catch(cause){setError(cause.message||'Your change could not be saved. Your draft is still here.')}finally{lock.current=false;setBusy(false)}};
 return <form className="content-change" aria-label={(mode==='delete'?'Delete ':'Edit ')+label} aria-busy={busy} onSubmit={submit}>{mode==='delete'?<><strong>Delete this {label}?</strong><p>{kind==='post'?'The post and its conversation will be removed from the feed.':'This comment will be removed. Replies will stay in the conversation.'}</p></>:kind==='post'&&item.textFormat==='markdown'?<PageMarkdownEditor value={text} onChange={setText} maxLength={3000} disabled={busy} ariaLabel={'Edit '+label} autoFocus/>:<label>Edit {label}<textarea autoFocus rows={kind==='post'?4:2} maxLength={kind==='post'?3000:1500} value={text} disabled={busy} onChange={event=>setText(event.target.value)}/></label>}{error&&<p role="alert">{error}</p>}<div className="content-change-actions"><Control type="button" disabled={busy} onClick={onClose}>Cancel</Control><Control type="submit" className={mode==='delete'?'content-delete-confirm':''} disabled={busy||data?.pending||mode!=='delete'&&(text===baseline.current||!text.trim()&&!item.files?.length&&!item.poll)}><Glyph name={mode==='delete'?'close':'check'}/>{busy?'Saving…':mode==='delete'?'Delete '+label:'Save changes'}</Control></div></form>
}
export function PostCard({post,focused=false}){const {state,go,openSheet,dispatch}=useApp(),[change,setChange]=useState(null),comments=state.comments[post.id]||[],roots=comments.filter(c=>!c.parentId),latest=roots.at(-1),child=latest&&comments.find(c=>c.parentId===latest.id);const m=state.members.find(x=>x.id===post.authorId);const preview=c=><span className="preview-row" key={c.id}><MemberIdentityControl id={c.authorId} className="preview-author-avatar"><Avatar member={state.members.find(m=>m.id===c.authorId)}/></MemberIdentityControl><span className="preview-copy"><span className="preview-meta"><MemberIdentityControl id={c.authorId} className="preview-author-name"><b>{state.members.find(m=>m.id===c.authorId)?.name||'Family member'}</b></MemberIdentityControl><time dateTime={new Date(c.createdAt).toISOString()} title={new Date(c.createdAt).toLocaleString()}>{formatTime(c.createdAt)}</time></span><Control className="preview-text" onClick={()=>go({type:'post',id:post.id})}>{c.text}</Control></span></span>;return <article className={"card post-card "+(post.asLeader?"leader-post":"")} id={post.id}>{post.asLeader&&<p className="leader-post-label"><Glyph name="people"/>Leader update{post.pinned?' · Pinned':''}</p>}<div className="post-head row spread"><PostIdentity post={post}/></div>{post.systemBirthday&&<p className="small muted">Automatic birthday celebration · shared with permission</p>}<div className={"post-text-wrap "+(post.background?"poster-preview background-post":"")} style={post.background?posterStyle(post.background):{}}>{post.background&&!post.backgroundMedia&&<BackgroundEffect value={post.background}/>} {post.backgroundMedia&&<BackgroundMedia media={post.backgroundMedia}/>} {change?<ContentChange key={change} item={post} kind="post" mode={change} onClose={()=>setChange(null)}/>:post.textFormat==='markdown'?<PageMarkdownBody className="post-body" source={post.text}/>:<p className="post-body">{post.text}</p>}</div>{post.image&&<Control className="photo-open" aria-label="Open post photo" onClick={()=>go({type:'photo',section:'post',id:post.id,tab:'0'})}><img className="photo" src={post.image} alt="Family post"/></Control>}{post.files?.map((f,i)=><FileView key={i} file={f} photoTarget={{type:'photo',section:'post',id:post.id,tab:String((post.image?1:0)+post.files.filter(file=>file.type?.startsWith('image/')).indexOf(f))}}/>)}{post.link&&<div className="link-card"><strong>{post.link.service} {post.link.type}</strong><a href={post.link.url} target="_blank" rel="noreferrer">Open in {post.link.service}</a>{post.link.embed&&<iframe title={post.link.service+" "+post.link.type} src={post.link.embed} loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups"/>}</div>}{post.poll&&<Poll post={post}/>}<TaggedFamily ids={post.memberIds||[]}/><ReactionBar targetId={post.id} countsOnly/><div className="post-actions"><ReactionBar targetId={post.id} triggerOnly/><Control type="button" onClick={()=>go({type:'post',id:post.id})}><Glyph name="chat"/>Comments {comments.length||''}</Control><Control type="button" aria-pressed={state.favorites.includes(post.id)} onClick={()=>dispatch({type:'TOGGLE_FAVORITE',id:post.id})}><Glyph name="heart"/>Save</Control><PostMoreMenu post={post} focused={focused} onEdit={()=>setChange('edit')} onDelete={()=>setChange('delete')}/></div>{!focused&&latest&&<div className="feed-comments">{preview(latest)}{child&&<span className="preview-child">{preview(child)}</span>}</div>}</article>}
function Comment({comment,all,targetId,depth=0}){
  const {state,dispatch}=useApp(),[reply,setReply]=useState(false),[memberAnchor,setMemberAnchor]=useState(null);
  const [change,setChange]=useState(null);
  const [geometry,setGeometry]=useState({width:0,height:0,paths:[]}),rootRef=useRef(null);
  const children=all.filter(c=>c.parentId===comment.id);
  useLayoutEffect(()=>{
    const root=rootRef.current;if(!root||(!children.length&&!reply)){setGeometry({width:0,height:0,paths:[]});return;}
    let frame=0;
    const draw=()=>{
      const box=root.getBoundingClientRect();
      const parent=root.querySelector(':scope > .comment-row > .comment-avatar')?.getBoundingClientRect();
      const avatars=[...root.querySelectorAll(':scope > .thread-replies > .thread-comment > .comment-row > .comment-avatar')];
      if(!parent)return;
      const x=parent.left-box.left+parent.width/2,y=parent.bottom-box.top-2;
      const inline=root.querySelector(':scope > .comment-row .reply-inline-anchor');
      const targets=[...avatars.map(el=>({rect:el.getBoundingClientRect(),inline:false})),...(inline?[{rect:inline.getBoundingClientRect(),inline:true}]:[])];
      const paths=targets.map(({rect,inline})=>{
        const endX=rect.left-box.left+(inline?0:1),endY=rect.top-box.top+rect.height/2;
        const radius=Math.min(6,Math.max(0,(endX-x)/2),Math.max(0,(endY-y)/2));
        return `M ${x} ${y} V ${endY-radius} Q ${x} ${endY} ${x+radius} ${endY} H ${endX}`;
      });
      setGeometry({width:box.width,height:box.height,paths});
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)};
    draw();const observer=new ResizeObserver(schedule);observer.observe(root);
    window.addEventListener('resize',schedule);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule)};
  },[all,children.length,reply]);
  return <div ref={rootRef} data-comment-id={comment.id} tabIndex={-1} className={'thread-comment depth-'+Math.min(depth,3)}>
    {geometry.paths.length>0&&<svg className="reply-connectors" width={geometry.width} height={geometry.height} aria-hidden="true">{geometry.paths.map((d,i)=><path key={i} d={d}/>)}</svg>}
    <div className="comment-row"><MemberIdentityControl id={comment.authorId} className="comment-avatar"><Avatar member={state.members.find(x=>x.id===comment.authorId)}/></MemberIdentityControl><div className="comment-content"><div className="chat-bubble"><div className="comment-meta"><MemberIdentityControl id={comment.authorId} className="comment-name">{state.members.find(x=>x.id===comment.authorId)?.name}</MemberIdentityControl><time dateTime={new Date(comment.createdAt).toISOString()} title={new Date(comment.createdAt).toLocaleString()}>{formatTime(comment.createdAt)}</time></div>{change?<ContentChange key={change} item={comment} kind="comment" targetId={targetId} mode={change} onClose={()=>setChange(null)}/>:<p>{comment.text}</p>}{comment.files?.map((f,i)=><FileView key={i} file={f}/>)}</div><div className="comment-actions"><Control className="reply-pill" onClick={()=>setReply(v=>!v)}>Reply</Control><ReactionBar targetId={comment.id} small/><PostMoreMenu comment={comment} targetId={targetId} onEdit={()=>setChange('edit')} onDelete={()=>setChange('delete')}/></div>{reply&&<div className="reply-inline-anchor"><ComposerBox key={comment.id} kind="replies" targetId={targetId} parentId={comment.id} placeholder="Write a reply…" onSubmit={async(text,files)=>{const ok=await dispatch({type:'ADD_COMMENT',targetId,parentId:comment.id,text,files});if(ok!==false)setReply(false);return ok}}/></div>}</div></div>
    {children.length>0&&<div className="thread-replies">{children.map(c=><Comment key={c.id} comment={c} all={all} targetId={targetId} depth={depth+1}/>)}</div>}
  </div>
}
export function CommentsView({targetId,placeholder='Write a comment…',emptyMessage='Start the conversation.'}){
 const {state,dispatch}=useApp(),stored=state.comments[targetId]||[],known=new Set(stored.map(comment=>comment.id)),all=stored.map(comment=>comment.parentId&&!known.has(comment.parentId)?{...comment,parentId:null}:comment),{typers}=useTypingPresence({scope:'posts',id:targetId,enabled:!!state.posts?.some(post=>post.id===targetId)});
 return <div className="comments-view"><div className="chat-thread">{all.filter(comment=>!comment.parentId).map(comment=><Comment key={comment.id} comment={comment} all={all} targetId={targetId}/>)}{!all.length&&<p className="empty-conversation muted">{emptyMessage}</p>}</div>
  {typers.length>0&&<ActivityDots label={typingLabel(typers)} className="comment-typing-presence"/>}
  <div className="conversation-composer"><ComposerBox targetId={targetId} placeholder={placeholder} onSubmit={(text,files)=>dispatch({type:'ADD_COMMENT',targetId,text,files})}/></div></div>
}
