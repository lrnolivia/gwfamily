import {canEditMemoryDetails} from './member-view-model.js';
// Merges server history pages into family state without duplicates. Older pages
// append after the first page; the first page from a refresh always wins.
const byId=(items,extra)=>{const seen=new Set(items.map(item=>item.id));return [...items,...extra.filter(item=>!seen.has(item.id)&&seen.add(item.id))]};
const mergeMaps=(base={},page={})=>({...base,...page});
export function mergePostPage(state,page){
 if(!page)return state;
 return {...state,posts:byId(state.posts||[],page.posts||[]),comments:mergeMaps(state.comments,page.comments),commentHistory:mergeMaps(state.commentHistory,page.commentHistory),
  reactions:mergeMaps(state.reactions,page.reactions),reactionCounts:mergeMaps(state.reactionCounts,page.reactionCounts),reactionMembers:mergeMaps(state.reactionMembers,page.reactionMembers),pollSelections:mergeMaps(state.pollSelections,page.pollSelections),
  postsCursor:page.postsCursor??null};
}
export function mergeMemoryPage(state,page){
 if(!page)return state;
 return {...state,memories:byId(state.memories||[],page.memories||[]),memoriesCursor:page.memoriesCursor??null};
}
// Older comments go before the loaded ones, oldest first.
export function mergeCommentPage(state,page){
 if(!page?.postId)return state;
 const current=state.comments?.[page.postId]||[],seen=new Set(current.map(c=>c.id)),older=(page.comments||[]).filter(c=>!seen.has(c.id));
 const history={...(state.commentHistory||{})};
 if(page.cursor)history[page.postId]={...history[page.postId],cursor:page.cursor};else delete history[page.postId];
 return {...state,comments:{...state.comments,[page.postId]:[...older,...current]},commentHistory:history,
  reactions:mergeMaps(state.reactions,page.reactions),reactionCounts:mergeMaps(state.reactionCounts,page.reactionCounts),reactionMembers:mergeMaps(state.reactionMembers,page.reactionMembers)};
}
export const historyQuery=(path,params)=>{const q=new URLSearchParams();for(const [key,value] of Object.entries(params))if(value)q.set(key,value);const text=q.toString();return text?path+'?'+text:path};
// Local text match used first; server search covers history that is not loaded.
export function memoryMatches(memory,query){const text=String(query||'').trim().toLocaleLowerCase();if(!text)return true;return [memory.title,memory.category,memory.event,memory.year,memory.milestone,...(memory.tags||[])].filter(Boolean).join(' ').toLocaleLowerCase().includes(text)}
// Same people who may edit a memory may remove it: the uploader or a moderator.
export const canRemoveMemory=(state,memory)=>Boolean(memory)&&canEditMemoryDetails(state,memory);
export function removalLabel(kind){return kind==='memory'?'Memory':kind==='comment'?'Comment':kind==='message'?'Private messages':kind==='photo-comment'?'Photo comment':'Post'}
