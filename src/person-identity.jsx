import React from 'react';
import {Avatar,MemberBadges,useApp} from './ui-core.jsx';
import './person-identity.css';
// Badges/photo come only from the existing authorized member state. A management
// record may supply its permitted display name without inventing profile access.
export function PersonIdentity({memberId,fallbackName='Family member',displayName,photo,children,className=''}){
 const {state}=useApp(),member=(state.members||[]).find(person=>person.id===memberId),person={...(member||{name:fallbackName}),...(displayName?{name:displayName}:{}),...(photo!==undefined?{photo}:{})};
 return <div className={'person-identity '+className}><Avatar member={person}/><div className="person-identity-copy"><strong>{person.name||fallbackName}</strong>{member&&<MemberBadges member={member} passive/>}{children}</div></div>;
}
