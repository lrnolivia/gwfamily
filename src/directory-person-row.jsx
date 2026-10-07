import React from 'react';
import {Avatar,Control,Glyph,MemberBadges,useApp} from './ui-core.jsx';
import './directory-person-row.css';
export function DirectoryPersonRow({member}){
 const {go}=useApp();
 return <div className="directory-person-row"><Control type="button" className="directory-person-open" aria-label={'View profile for '+member.name} onClick={()=>go({type:'profile',id:member.id})}><Avatar member={member}/><strong>{member.name}</strong><Glyph name="arrow"/></Control><div className="directory-person-badges"><MemberBadges member={member} interactive/></div></div>;
}
