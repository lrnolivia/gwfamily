import React from 'react';
import {Control,Glyph} from './ui-core.jsx';
import {MemberPicker} from './member-picker.jsx';
import './content-history.css';
// Post corrections beside the text editor: remove attachments, fix family tags
// and (before any vote) reword the poll. After a vote only closing is offered.
export const correctionsFor=post=>({files:post.files||[],memberIds:post.memberIds||[],poll:post.poll?{question:post.poll.question,options:[...post.poll.options],closed:Boolean(post.poll.closed)}:null});
export function correctionChanges(post,draft){
 const base=correctionsFor(post),out={};
 if(JSON.stringify(draft.files.map(f=>f.id))!==JSON.stringify(base.files.map(f=>f.id)))out.files=draft.files.map(f=>({id:f.id}));
 if(JSON.stringify([...draft.memberIds].sort())!==JSON.stringify([...base.memberIds].sort()))out.memberIds=draft.memberIds;
 if(base.poll&&draft.poll){const poll={};if(draft.poll.closed!==base.poll.closed)poll.closed=draft.poll.closed;if(!post.hasVotes){if(draft.poll.question!==base.poll.question)poll.question=draft.poll.question;if(JSON.stringify(draft.poll.options)!==JSON.stringify(base.poll.options))poll.options=draft.poll.options}if(Object.keys(poll).length)out.poll=poll}
 return out;
}
export function PostCorrections({post,draft,onChange,disabled}){
 const set=(key,value)=>onChange({...draft,[key]:value}),setPoll=(key,value)=>onChange({...draft,poll:{...draft.poll,[key]:value}});
 return <div className="post-corrections stack">
  {draft.files.length>0&&<fieldset className="post-correction-files"><legend>Attachments</legend>{draft.files.map(file=><div key={file.id||file.url} className="draft-file"><span>{file.name||'Attachment'}</span><Control type="button" disabled={disabled} aria-label={'Remove '+(file.name||'attachment')} onClick={()=>set('files',draft.files.filter(f=>f!==file))}><Glyph name="close"/></Control></div>)}</fieldset>}
  <MemberPicker label="Tagged family" purpose="tag" multiple value={draft.memberIds} disabled={disabled} onChange={ids=>set('memberIds',ids)}/>
  {draft.poll&&<fieldset className="post-correction-poll stack"><legend>Poll</legend>{post.hasVotes?<p className="field-help">Family members already voted, so the question and choices stay as they are. Their votes are kept.</p>:<><label>Question<input maxLength="160" value={draft.poll.question} disabled={disabled} onChange={e=>setPoll('question',e.target.value)}/></label>{draft.poll.options.map((option,i)=><label key={i}>Choice {i+1}<input maxLength="120" value={option} disabled={disabled} onChange={e=>setPoll('options',draft.poll.options.map((x,n)=>n===i?e.target.value:x))}/></label>)}</>}<label className="check-row"><input type="checkbox" checked={draft.poll.closed} disabled={disabled} onChange={e=>setPoll('closed',e.target.checked)}/>Close voting</label></fieldset>}
 </div>;
}
