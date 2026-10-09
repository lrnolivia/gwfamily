import {MemberIdentityControl} from './person-identity.jsx';
import React from 'react';
import {Avatar,Control,Glyph,MemberBadges,useApp} from './ui-core.jsx';
import './directory-person-row.css';
export function DirectoryPersonRow({member}){
 const {go}=useApp();
 return <div className="directory-person-row"><MemberIdentityControl id={member.id} className="directory-person-open"><Avatar member={member}/><strong>{member.name}</strong><Glyph name="arrow"/></MemberIdentityControl><div className="directory-person-badges"><MemberBadges member={member} interactive/></div></div>;
}
