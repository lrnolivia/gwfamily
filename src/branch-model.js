// A Branch is a broad surname family group; a Household is a smaller unit that
// may belong to several branches. Shared by the Worker and the client.
// Suggestions are only suggestions: nothing here joins, grants access, infers
// kinship or assigns a head. Every placement needs an explicit confirmation.
import {isPreviewLeader} from './member-view-model.js';
export const BRANCH_NAME_MAX=80;
const SUFFIXES=new Set(['jr','sr','ii','iii','iv','v']);
const fold=value=>String(value||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[’'`]/g,'');
// "The Lomack Family", "Lomack branch" and "lomack" are the same branch name.
export function branchKey(name){
 let key=fold(name).replace(/[^a-z0-9]+/g,' ').trim();
 for(let previous;previous!==key;){previous=key;key=key.replace(/^the\s+/,'').replace(/\s+(branch|branches|family|families)$/,'').trim();}
 return key;
}
export function branchName(name){
 const value=typeof name==='string'?name.replace(/\s+/g,' ').trim():'';
 if(!value||value.length>BRANCH_NAME_MAX||!branchKey(value))throw Object.assign(new Error('Enter a branch name up to 80 characters.'),{status:400});
 return value;
}
// Last name token, ignoring generational suffixes; never a relationship claim.
export function surnameOf(fullName){
 const parts=fold(fullName).replace(/[^a-z0-9\s-]+/g,' ').split(/\s+/).filter(Boolean);
 while(parts.length>1&&SUFFIXES.has(parts.at(-1)))parts.pop();
 return parts.length>1?parts.at(-1):'';
}
const titleCase=value=>value.replace(/(^|[\s-])([a-z])/g,(_,a,b)=>a+b.toUpperCase());
export const canManageBranches=state=>state?.mode==='preview'?isPreviewLeader(state):state?.branchManager===true;
// Heads attach their own household; leaders and admins manage any household.
export const canPlaceHousehold=(state,household)=>Boolean(household)&&(household.canManage===true||canManageBranches(state));
export const branchesForHousehold=(state,householdId)=>(state.branches||[]).filter(b=>(b.householdIds||[]).includes(householdId));
export function branchMatch(state,name){const key=branchKey(name);return key?(state.branches||[]).find(b=>branchKey(b.name)===key)||null:null}
// Search is plain text over names the member can already see in the directory.
export function familySetupSearch(state,query){
 const q=fold(query).replace(/\s+/g,' ').trim(),key=branchKey(query),hit=name=>Boolean(q)&&fold(name).includes(q);
 const branches=(state.branches||[]).filter(b=>hit(b.name)||(key&&branchKey(b.name).includes(key)));
 const households=(state.households||[]).filter(h=>hit(h.name));
 const exact=branchMatch(state,query);
 return {branches,households,exact,canCreate:Boolean(key)&&!exact&&query.trim().length<=BRANCH_NAME_MAX};
}
// Surname-based placement ideas for the signed-in member. Results are inert:
// the UI must ask the member to confirm each one before any request is sent.
export function familySetupSuggestions(state){
 const self=(state.members||[]).find(m=>m.id===state.selfId),surname=surnameOf(self?.name);
 if(!surname)return {surname:'',branches:[],households:[],createName:''};
 const mine=new Set(state.householdIds||[]);
 const branches=(state.branches||[]).filter(b=>branchKey(b.name)===surname||branchKey(b.name).split(' ').includes(surname));
 const inBranch=new Set(branches.flatMap(b=>b.householdIds||[]));
 const households=(state.households||[]).filter(h=>!mine.has(h.id)&&(inBranch.has(h.id)||fold(h.name).split(/[^a-z0-9]+/).includes(surname)));
 return {surname:titleCase(surname),branches,households,createName:branches.length?'':titleCase(surname)};
}
// Preview-only reducer; mirrors the Worker's authority checks with sample data.
export function branchPreview(state,action){
 const bs=state.branches||[],hs=state.households||[],next=state.lastId+1,find=id=>bs.find(b=>b.id===id);
 const placeable=id=>canPlaceHousehold(state,hs.find(h=>h.id===id));
 switch(action.type){
 case 'CREATE_BRANCH':{
  const name=branchName(action.name);if(branchMatch(state,name))throw Error(branchMatch(state,name).name+' already exists. Choose it from the list instead.');
  if(action.householdId&&!placeable(action.householdId))throw Error('Only a head of this household or a family leader can change its branches.');
  return {...state,lastId:next,branches:[...bs,{id:'preview-branch-'+next,name,createdBy:state.selfId,householdIds:action.householdId?[action.householdId]:[]}]};
 }
 case 'ATTACH_BRANCH_HOUSEHOLD':case 'DETACH_BRANCH_HOUSEHOLD':{
  const b=find(action.branchId);if(!b)throw Error('Branch not found.');if(!placeable(action.householdId))throw Error('Only a head of this household or a family leader can change its branches.');
  const attach=action.type==='ATTACH_BRANCH_HOUSEHOLD',has=b.householdIds.includes(action.householdId);if(attach===has)return state;
  return {...state,branches:bs.map(x=>x.id===b.id?{...x,householdIds:attach?[...x.householdIds,action.householdId]:x.householdIds.filter(id=>id!==action.householdId)}:x)};
 }
 case 'RENAME_BRANCH':{
  if(!canManageBranches(state))throw Error('Only family leaders can rename a branch.');const name=branchName(action.name),clash=branchMatch(state,name);
  if(clash&&clash.id!==action.branchId)throw Error(clash.name+' already exists.');return {...state,branches:bs.map(b=>b.id===action.branchId?{...b,name}:b)};
 }
 case 'REMOVE_BRANCH':{
  if(!canManageBranches(state))throw Error('Only family leaders can remove a branch.');if(find(action.branchId)?.householdIds.length)throw Error('Move its households out before removing this branch.');
  return {...state,branches:bs.filter(b=>b.id!==action.branchId)};
 }
 default:return null;
 }
}
