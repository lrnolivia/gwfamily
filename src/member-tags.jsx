import React from 'react';
import {Avatar,useApp} from './ui-core.jsx';
import {MemberLink} from './conversation.jsx';
import {directoryPerson} from './member-directory.js';
// Ancestors appear as commemorative tags, never as interactive login profiles.
export function TaggedFamily({ids=[]}){
 const {state}=useApp();
 const people=[...new Set(ids)].map(id=>directoryPerson(state,id)).filter(Boolean);
 return people.length?<div className="tagged-family" aria-label="Tagged family">{people.map(p=>p.personKind==='ancestor'?<span key={p.id} className="ancestor-tag"><Avatar member={p}/><span>{p.name}<small>In loving memory</small></span></span>:<MemberLink key={p.id} id={p.id} compact/>)}</div>:null;
}
