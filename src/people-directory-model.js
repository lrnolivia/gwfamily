import {membershipStatus} from './membership-model.js';
import {directoryPeople} from './member-directory.js';
const normalize=value=>String(value||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase().trim();
export const emptyPeopleFilters=Object.freeze({query:'',circle:'all',household:'all',role:'all',status:'all',sort:'name-asc'});
export function publicDirectoryMembers(state){return directoryPeople(state)}
export function householdForMember(state,member){return (state.households||[]).find(h=>h.memberIds?.includes(member.id))||null}
export function filterDirectoryMembers(state,members,filters={}){
 const f={...emptyPeopleFilters,...filters},words=normalize(f.query).split(/\s+/).filter(Boolean);
 return members.filter(member=>{
  const household=householdForMember(state,member),name=normalize([member.name,household?.name].filter(Boolean).join(' '));
  return words.every(word=>name.includes(word))&&(f.circle==='all'||member.circle===f.circle)&&(f.household==='all'||(f.household==='none'?!household:household?.id===f.household))&&(f.role==='all'||Boolean(member.leader))&&(f.status==='all'||membershipStatus(member)===f.status);
 }).sort((a,b)=>(f.sort==='name-desc'?-1:1)*(String(a.name||'').localeCompare(String(b.name||''))||String(a.id).localeCompare(String(b.id))));
}
export function groupDirectoryHouseholds(state,members,{sort='name-asc'}={}){
 const groups=(state.households||[]).map(household=>({household,members:members.filter(member=>household.memberIds?.includes(member.id))})).filter(group=>group.members.length);
 return {groups:groups.sort((a,b)=>(sort==='name-desc'?-1:1)*String(a.household.name).localeCompare(String(b.household.name))),unassigned:members.filter(member=>!householdForMember(state,member))};
}
// Management filters reuse only already-authorized member data. Pending accounts
// stay reviewable, without granting them profile access or inventing badges.
export function managementDirectoryMembers(state,records=[]){return records.map(record=>({...((state.members||[]).find(member=>member.id===record.id)||{}),...record}))}
