import {TaggedFamily} from './member-tags.jsx';
import {readPreviewFile} from './uploads.js';
import {profilePalette} from './profile-model.js';
import {BackgroundEffect,BackgroundMedia,posterStyle} from './backgrounds.jsx';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ActivityDots,useTypingPresence,typingLabel} from './activity.jsx';
import {Control,Avatar,Glyph,MemberBadges,Popover,useApp,formatTime} from './ui-core.jsx';
import {emojiChoices} from './emoji-data.js';
const quick=['❤️','👏','😂','🎉','🙏'];
function MemberMiniCard({id,anchor,onClose}){const {state,go,theme,personalThemes}=useApp(),m=state.members.find(x=>x.id===id);let age=m?.age??null;if(age===null&&m?.birthday){const born=new Date(m.birthday+'T12:00:00'),today=new Date();age=today.getFullYear()-born.getFullYear()-(today.getMonth()<born.getMonth()||(today.getMonth()===born.getMonth()&&today.getDate()<born.getDate())?1:0);if(!Number.isFinite(age)||age<0)age=null}return <Popover open={!!anchor} onClose={onClose} anchor={anchor} className="member-mini-pop" style={personalThemes?profilePalette(m?.profileColor,theme):undefined}><div className="mini-card profile-palette-preview"><div className="mini-identity"><Avatar member={m} size="large-avatar"/><div><strong>{m?.name||'Family member'}</strong>{age!==null&&<span className="mini-age">{age} years old</span>}</div></div><MemberBadges member={m}/>{m?.bio&&<p>{m.bio}</p>}<Control type="button" className="button mini-profile-action" onClick={()=>{onClose();go({type:'profile',id})}}>View full profile <Glyph name="arrow"/></Control></div></Popover>}

export function MemberLink({id,compact=false}){const {state}=useApp(),m=state.members.find(x=>x.id===id),[anchor,setAnchor]=useState(null);return <><Control type="button" className={'member-link '+(compact?'compact':'')} onClick={e=>setAnchor(e.currentTarget)}><Avatar member={m}/><span><strong>{m?.name||'Family member'}</strong>{!compact&&<MemberBadges member={m}/>}</span></Control><MemberMiniCard id={id} anchor={anchor} onClose={()=>setAnchor(null)}/></>}
export function EmojiPicker({targetId,open,onClose,anchor}){const {state,dispatch}=useApp(),[query,setQuery]=useState(''),[more,setMore]=useState(false);const found=emojiChoices.filter(x=>!query||x.search.includes(query.toLowerCase())||x.native.includes(query)).slice(0,more?160:48);const choose=e=>{dispatch({type:'TOGGLE_REACTION',targetId,emoji:e});onClose()};return <Popover open={open} onClose={onClose} anchor={anchor} className="reaction-pop"><div className="quick-emoji">{quick.map(e=><Control key={e} type="button" onClick={()=>choose(e)} aria-label={'React '+e}>{e}</Control>)}</div><input aria-label="Search emoji" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search emoji"/><div className="emoji-grid">{found.map((e,i)=><Control key={e.native+i} type="button" title={e.name} aria-label={e.name} onClick={()=>choose(e.native)}>{e.native}</Control>)}</div>{found.length>=48&&!more&&<Control className="text-button" type="button" onClick={()=>setMore(true)}>More emoji</Control>}</Popover>}
export function ReactionBar({targetId,small=false}){const {state}=useApp(),[open,setOpen]=useState(false),[people,setPeople]=useState(null),ref=useRef(null),own=state.reactions[targetId]||[],counts=state.reactionCounts?.[targetId],list=counts?Object.keys(counts):own;const peopleFor=emoji=>state.reactionMembers?.[targetId]?.[emoji]||(own.includes(emoji)?[state.selfId]:[]);return <span className={small?'small-reaction-chips':'reaction-bar'}>{list.map(e=><Control key={e} type="button" className="reaction-pill" aria-label={'See who reacted '+e} onClick={event=>setPeople({anchor:event.currentTarget,emoji:e})}>{e}<small>{counts?.[e]||1}</small></Control>)}<Control ref={ref} type="button" className="react-trigger" aria-label="Add reaction" aria-expanded={open} onClick={()=>setOpen(!open)}><Glyph name="smile"/></Control><EmojiPicker key={targetId} targetId={targetId} open={open} onClose={()=>setOpen(false)} anchor={ref.current}/><Popover open={!!people} onClose={()=>setPeople(null)} anchor={people?.anchor} className="reaction-people-pop"><section className="reaction-people" aria-label="People who reacted"><h3>Reactions</h3><div className="reaction-people-tabs" role="tablist" aria-label="Reaction types">{list.map(emoji=><Control key={emoji} role="tab" aria-label={emoji+' reactions'} aria-selected={people?.emoji===emoji} onClick={()=>setPeople(p=>({...p,emoji}))}>{emoji} <span>{counts?.[emoji]||1}</span></Control>)}</div>{peopleFor(people?.emoji).map(id=><MemberLink key={id} id={id} compact/>)}{!peopleFor(people?.emoji).length&&<p>No reactions yet.</p>}<p className="small muted">Use the smile button to add or remove your reaction.</p></section></Popover></span>}

export function FileView({file}){if(!file)return null;return <div className="local-file">{file.type?.startsWith('image/')?<img src={file.url} alt={file.name||'Attached image'}/>:file.type?.startsWith('video/')?<video src={file.url} controls/>:file.type?.startsWith('audio/')?<audio src={file.url} controls/>:<a href={file.url} download={file.name}><Glyph name="image"/>{file.name}</a>}</div>}
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
  }catch(error){setToast((error?.message||'That could not be sent.')+' Your draft is still here.')}
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
    catch(error){setToast(error.message)}finally{lock.current=false;if(alive.current)setUploading(false);finish?.()}
   }}/><Control type="button" className="send-button" aria-label={sending?'Sending':'Send'} aria-busy={sending} onClick={send} disabled={sending||uploading||(!value.trim()&&!files.length)}>{sending?<ActivityDots label="Sending…" compact/>:<Glyph name="send"/>}</Control></div>
  {uploading&&<ActivityDots label="Uploading attachment…" className="composer-upload-status"/>}
  {files.map((file,index)=><div className="draft-file" key={file.url||index}><span>{file.name}</span><Control type="button" disabled={sending||uploading} aria-label={'Remove '+file.name} onClick={()=>setFiles(value=>value.filter((_,n)=>n!==index))}><Glyph name="close"/></Control></div>)}
 </div>
}
function Poll({post}){const {state,dispatch}=useApp(),selected=state.pollSelections[post.id]||[],multi=post.poll.mode==='multiple',base=post.poll.votes||{},counts=post.poll.options.map((_,i)=>(Number(base[i])||0)+(selected.includes(i)?1:0)),total=Math.max(1,counts.reduce((a,b)=>a+b,0));function toggle(i){dispatch({type:'POLL_VOTE',postId:post.id,options:multi?selected.includes(i)?selected.filter(x=>x!==i):[...selected,i]:[i]})}return <div className={'poll '+(selected.length?'has-vote':'')} role={multi?'group':'radiogroup'} aria-label={post.poll.question||'Poll'}><strong>{post.poll.question}</strong>{post.poll.options.map((opt,i)=><Control key={i} type="button" className={'poll-choice '+(selected.includes(i)?'is-selected':'')} role={multi?'checkbox':'radio'} aria-checked={selected.includes(i)} onClick={()=>toggle(i)}><span className="poll-fill" style={{'--poll-fill':`${counts[i]/total*100}%`}} aria-hidden="true"/><span className="poll-label">{opt}</span>{selected.length>0&&<span className="poll-result" aria-label={`${counts[i]} votes, ${Math.round(counts[i]/total*100)} percent`}>{Math.round(counts[i]/total*100)}%</span>}<span className={'poll-indicator '+(selected.includes(i)?'selected':'')}>{selected.includes(i)&&<Glyph name="check"/>}</span></Control>)}{selected.length>0&&<small className="poll-total">{counts.reduce((a,b)=>a+b,0)} {counts.reduce((a,b)=>a+b,0)===1?'vote':'votes'} · Tap to change</small>}</div>}
function PostIdentity({post}){const {state,openSheet}=useApp(),m=state.members.find(x=>x.id===post.authorId),[anchor,setAnchor]=useState(null);return <><Control className="identity-avatar" aria-label={'About '+m?.name} onClick={e=>setAnchor(e.currentTarget)}><Avatar member={m}/></Control><div className="identity-info"><div className="identity-line"><Control className="identity-name" onClick={e=>setAnchor(e.currentTarget)}>{m?.name||'Family member'}</Control><Control className="post-time" type="button" title={new Date(post.createdAt).toLocaleString()} onClick={()=>openSheet({type:'post',id:post.id})}><time dateTime={new Date(post.createdAt).toISOString()}>{formatTime(post.createdAt)}</time></Control></div><MemberBadges member={m} interactive/></div><MemberMiniCard id={post.authorId} anchor={anchor} onClose={()=>setAnchor(null)}/></>}
export function PostCard({post,focused=false}){const {state,go,openSheet,dispatch}=useApp(),comments=state.comments[post.id]||[],roots=comments.filter(c=>!c.parentId),latest=roots.at(-1),child=latest&&comments.find(c=>c.parentId===latest.id);const m=state.members.find(x=>x.id===post.authorId);const preview=c=><span className="preview-row" key={c.id}><Avatar member={state.members.find(m=>m.id===c.authorId)}/><span className="preview-copy"><span className="preview-meta"><b>{state.members.find(m=>m.id===c.authorId)?.name}</b><time dateTime={new Date(c.createdAt).toISOString()} title={new Date(c.createdAt).toLocaleString()}>{formatTime(c.createdAt)}</time></span><span className="preview-text">{c.text}</span></span></span>;return <article className={"card post-card "+(post.asLeader?"leader-post":"")} id={post.id}>{post.asLeader&&<p className="leader-post-label"><Glyph name="people"/>Leader update{post.pinned?' · Pinned':''}</p>}<div className="post-head row spread"><PostIdentity post={post}/></div>{post.systemBirthday&&<p className="small muted">Automatic birthday celebration · shared with permission</p>}<div className={"post-text-wrap "+(post.background?"poster-preview background-post":"")} style={post.background?posterStyle(post.background):{}}>{post.background&&!post.backgroundMedia&&<BackgroundEffect value={post.background}/>} {post.backgroundMedia&&<BackgroundMedia media={post.backgroundMedia}/>} <p className="post-body">{post.text}</p></div>{post.image&&<img className="photo" src={post.image} alt="Family post"/>}{post.files?.map((f,i)=><FileView key={i} file={f}/>)}{post.link&&<div className="link-card"><strong>{post.link.service} {post.link.type}</strong><a href={post.link.url} target="_blank" rel="noreferrer">Open in {post.link.service}</a>{post.link.embed&&<iframe title={post.link.service+" "+post.link.type} src={post.link.embed} loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups"/>}</div>}{post.poll&&<Poll post={post}/>}<TaggedFamily ids={post.memberIds||[]}/><div className="post-actions"><ReactionBar targetId={post.id}/><Control type="button" onClick={()=>go({type:'post',id:post.id})}><Glyph name="chat"/>Comments {comments.length||''}</Control><Control type="button" aria-pressed={state.favorites.includes(post.id)} onClick={()=>dispatch({type:'TOGGLE_FAVORITE',id:post.id})}><Glyph name="heart"/>Save</Control><Control type="button" onClick={()=>openSheet({type:'report',id:post.id})}>•••</Control></div>{!focused&&latest&&<Control className="feed-comments" onClick={()=>go({type:'post',id:post.id})}>{preview(latest)}{child&&<span className="preview-child">{preview(child)}</span>}</Control>}</article>}
function Comment({comment,all,targetId,depth=0}){
  const {state,dispatch}=useApp(),[reply,setReply]=useState(false),[memberAnchor,setMemberAnchor]=useState(null);
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
    <div className="comment-row"><Control className="comment-avatar" onClick={e=>setMemberAnchor(e.currentTarget)}><Avatar member={state.members.find(x=>x.id===comment.authorId)}/></Control><div className="comment-content"><div className="chat-bubble"><div className="comment-meta"><Control className="comment-name" onClick={e=>setMemberAnchor(e.currentTarget)}>{state.members.find(x=>x.id===comment.authorId)?.name}</Control><time dateTime={new Date(comment.createdAt).toISOString()} title={new Date(comment.createdAt).toLocaleString()}>{formatTime(comment.createdAt)}</time></div><p>{comment.text}</p>{comment.files?.map((f,i)=><FileView key={i} file={f}/>)}</div><div className="comment-actions"><Control className="reply-pill" onClick={()=>setReply(v=>!v)}>Reply</Control><ReactionBar targetId={comment.id} small/></div>{reply&&<div className="reply-inline-anchor"><ComposerBox key={comment.id} kind="replies" targetId={targetId} parentId={comment.id} placeholder="Write a reply…" onSubmit={async(text,files)=>{const ok=await dispatch({type:'ADD_COMMENT',targetId,parentId:comment.id,text,files});if(ok!==false)setReply(false);return ok}}/></div>}</div></div><MemberMiniCard id={comment.authorId} anchor={memberAnchor} onClose={()=>setMemberAnchor(null)}/>
    {children.length>0&&<div className="thread-replies">{children.map(c=><Comment key={c.id} comment={c} all={all} targetId={targetId} depth={depth+1}/>)}</div>}
  </div>
}
export function CommentsView({targetId}){
 const {state,dispatch}=useApp(),all=state.comments[targetId]||[],{typers}=useTypingPresence({scope:'posts',id:targetId,enabled:!!state.posts?.some(post=>post.id===targetId)});
 return <div className="comments-view"><div className="chat-thread">{all.filter(comment=>!comment.parentId).map(comment=><Comment key={comment.id} comment={comment} all={all} targetId={targetId}/>)}{!all.length&&<p className="empty-conversation muted">Start the conversation.</p>}</div>
  {typers.length>0&&<ActivityDots label={typingLabel(typers)} className="comment-typing-presence"/>}
  <div className="conversation-composer"><ComposerBox targetId={targetId} onSubmit={(text,files)=>dispatch({type:'ADD_COMMENT',targetId,text,files})}/></div></div>
}
