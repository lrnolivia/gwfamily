// Resettable fictional data only. No API client, real accounts or network writes.
import React,{useRef,useState} from 'react';
import {MemberReview} from '../../src/manage-family.jsx';
import {MembershipPeople} from '../../src/membership-people.jsx';
import {AppContext} from '../../src/ui-core.jsx';
const record=(id,name,status='pending')=>({id,name,email:id+'@example.test',status,can_post:false,roles_json:'[]',membership_revision:0});
const initial=()=>[record('fixture-amy','Fixture Amy'),record('fixture-ben','Fixture Ben'),record('fixture-cara','Fixture Cara'),record('fixture-active','Fixture Active','active'),record('fixture-paused','Fixture Paused','suspended'),{...record('fixture-removed','Fixture Removed','suspended'),removed_at:'2026-01-01'}];
export function MembershipFixture(){
 const [mode,setMode]=useState('review'),[status,setStatus]=useState('pending'),[members,setMembers]=useState(initial),[account,setAccount]=useState('fictional-admin'),[route,setRoute]=useState({type:'leader-tools',section:'members'}),latest=useRef(members);latest.current=members;
 window.setFixtureStatus=setStatus;window.setFixtureMode=setMode;
 window.resetQueue=()=>{latest.current=initial();setMembers(latest.current);setAccount('fictional-admin');setRoute({type:'leader-tools',section:'members'});window.fixtureActions=[];window.fixtureScenario='normal';setMode('queue')};
 const member={id:'fictional-member',name:'Fixture Person',email:'fixture@example.test',status,can_post:false,roles_json:'[]'},state={mode:'preview',selfId:account,selectedReunionId:'fictional-reunion',previewRoleView:'leader',members:mode==='review'?[member]:members,households:[],memorials:[],capabilities:{manageMembers:true}};
 async function save(action){(window.fixtureActions ||= []).push(action);if(window.fixtureScenario==='fail-second'&&window.fixtureActions.length===2)return false;
  latest.current=latest.current.map(m=>m.id===action.id?{...m,status:'active',membership_revision:m.membership_revision+1}:m);
  if(window.fixtureScenario==='late-arrival'&&window.fixtureActions.length===1)latest.current=[...latest.current,record('fixture-late','Fixture Late')];
  setMembers(latest.current);if(window.fixtureScenario==='account-change')setAccount('fictional-other-admin');await new Promise(resolve=>setTimeout(resolve,0));return true;
 }
 return <AppContext.Provider value={{state,data:{pending:false,error:null},route,go:setRoute,theme:'light',personalThemes:true,openSheet:sheet=>{window.fixtureReview=sheet?.id}}}><main>{mode==='review'?<section className="card"><MemberReview key={status} member={member} selfId={state.selfId} accountKey={'preview:'+account} onSave={async action=>{(window.fixtureActions ||= []).push(action);return true}}/></section>:<MembershipPeople key={account} members={members} onSave={save} readMembers={async()=>latest.current}/>}</main></AppContext.Provider>;
}
