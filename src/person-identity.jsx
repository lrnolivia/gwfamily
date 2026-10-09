import React,{useState} from 'react';
import {Avatar,Control,Glyph,MemberBadges,Popover,useApp} from './ui-core.jsx';
import {profilePalette} from './profile-model.js';
import './person-identity.css';
export function availableMember(state,id){return (state.members||[]).find(m=>m.id===id&&!m.removedAt&&!m.removed_at&&!m.previewRemovedAt&&(!m.previewStatus||m.previewStatus==='active')&&!['removed','rejected','suspended'].includes(m.status))||null}
export function MemberMiniCard({id,anchor,onClose}){
 const {state,go,theme,personalThemes}=useApp(),m=availableMember(state,id);
 // Authorized state is the only profile source. An old author/contact record
 // cannot revive a removed member or disclose a private date of birth.
 const close=()=>{onClose();if(anchor?.isConnected)requestAnimationFrame(()=>anchor.focus({preventScroll:true}))};
 return <Popover open={!!anchor} onClose={close} anchor={anchor} className="member-mini-pop" style={personalThemes&&m?profilePalette(m.profileColor,theme):undefined}><div className="mini-card profile-palette-preview">{m?<><div className="mini-identity"><Avatar member={m} size="large-avatar"/><div><strong>{m.name||'Family member'}</strong>{Number.isSafeInteger(m.age)&&m.age>=0&&<span className="mini-age">{m.age} years old</span>}</div></div><MemberBadges member={m}/>{m.bio&&<p>{m.bio}</p>}<Control type="button" className="button mini-profile-action" onClick={()=>{onClose();go({type:'profile',id:m.id})}}>View full profile <Glyph name="user"/></Control></>:<p role="status">This profile is no longer available.</p>}</div></Popover>;
}
export function MemberIdentityControl({id,children,className='',...props}){
 const {state}=useApp(),member=availableMember(state,id),[anchor,setAnchor]=useState(null);
 return <><Control {...props} type="button" className={className} aria-haspopup="dialog" aria-expanded={!!anchor} disabled={!member||props.disabled} aria-label={props['aria-label']||'About '+(member?.name||'unavailable family member')} onClick={event=>setAnchor(event.currentTarget)}>{children}</Control><MemberMiniCard id={id} anchor={anchor} onClose={()=>setAnchor(null)}/></>;
}
// Badges/photo come only from the existing authorized member state. A management
// record may supply its permitted display name without inventing profile access.
export function PersonIdentity({memberId,fallbackName='Family member',displayName,photo,photoFrame,children,className=''}){
 const {state}=useApp(),member=(state.members||[]).find(person=>person.id===memberId),person={...(member||{name:fallbackName}),...(displayName?{name:displayName}:{}),...(photo!==undefined?{photo,photoFrame}:{})};
 return <div className={'person-identity '+className}>{member?<MemberIdentityControl id={memberId} className="person-identity-open"><Avatar member={person}/><strong>{person.name||fallbackName}</strong></MemberIdentityControl>:<><Avatar member={person}/><strong>{person.name||fallbackName}</strong></>}<div className="person-identity-copy">{member&&<MemberBadges member={member} passive/>}{children}</div></div>;
}
