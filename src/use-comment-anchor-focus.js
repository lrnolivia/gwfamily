import {useEffect,useRef} from 'react';

// A link is a focus request, not a subscription to the comment list. Route
// identity covers Back/Forward; request covers an explicit same-link revisit.
export function useCommentAnchorFocus({postId,route,request=0,comments,available}){
 const rootRef=useRef(null),pending=useRef(null),section=route.section;
 useEffect(()=>{
  const previous=pending.current,fresh=!previous||previous.postId!==postId||previous.route!==route||previous.section!==section||previous.request!==request;
  if(fresh)pending.current={postId,route,section,request,done:false};
  const intent=pending.current;
  if(intent.done||!section?.startsWith('comment:')||!section.slice(8))return;
  const root=rootRef.current;
  if(!root||!root.isConnected)return;
  const target=section.slice(8),element=[...root.querySelectorAll('[data-comment-id]')].find(el=>el.dataset.commentId===target);
  if(!element)return; // The requested comment may arrive with later hydration.
  const doc=root.ownerDocument,active=doc.activeElement;
  // Consume a late arrival when the user has started writing or opened a sheet.
  // It must not surprise them on this or a subsequent background refresh.
  intent.done=true;
  if(root.closest('[inert]')||doc.querySelector('dialog[open]'))return;
  if(!fresh&&(active?.matches('input,textarea,select')||active?.isContentEditable))return;
  element.scrollIntoView({block:'center',behavior:'instant'});
  element.focus({preventScroll:true});
 },[postId,route,section,request,comments,available]);
 return rootRef;
}
