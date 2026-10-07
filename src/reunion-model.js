// Reunion identity is explicit. Calendar, attendance, merchandise and fees never
// inherit from a different year, including in the isolated local preview.
export const REUNION_SCOPED_COMMANDS=new Set(['RSVP','DETAILS','SET_PAYMENT','SET_FEES','CONFIRM_FEE','CLAIM_ORDER','ORDER_RECEIVED','UPDATE_CLAIM','SAVE_PRODUCT','SAVE_CALENDAR','SAVE_EVENT','ARCHIVE_EVENT','RESTORE_EVENT']);
export const REUNION_LIFECYCLE_COMMANDS=new Set(['CREATE_REUNION','UPDATE_REUNION','ACTIVATE_REUNION','ARCHIVE_REUNION','RESTORE_REUNION','SET_REUNION_CADENCE']);
export const REUNION_FIELDS=['details','payment','rsvp','fees','bag','order','products','previewOrders','previewFeeReports','planningRecords'];
export const reunionLabel=r=>r?.year?`${r.year} reunion`:r?.name||'Existing reunion';
export const selectedReunion=state=>(state.reunions||[]).find(r=>r.id===state.selectedReunionId)||null;
export const reunionArchived=state=>selectedReunion(state)?.status==='archived';
export const reunionQuery=(path,id)=>id?path+(path.includes('?')?'&':'?')+'reunionId='+encodeURIComponent(id):path;
export function reunionYear(value){const year=Number(value);if(!Number.isInteger(year)||year<1900||year>2200)throw Error('Choose a reunion year from 1900 to 2200.');return year}
export function blankReunionData(){return {details:{date:'',location:'',schedule:''},payment:{amount:'',methods:[]},rsvp:null,fees:'unpaid',bag:[],order:null,products:[],previewOrders:[],previewFeeReports:[],planningRecords:null}}
export function ensurePreviewReunions(state){
 if(state.reunions?.length&&state.selectedReunionId)return state;
 const year=/^\d{4}-/.test(state.details?.date||'')?Number(state.details.date.slice(0,4)):null;
 return {...state,reunions:[{id:'legacy',year,name:'Existing reunion',status:'active'}],selectedReunionId:'legacy',activeReunionId:'legacy',reunionCadence:'irregular',reunionData:{}};
}
export function previewReunionCommand(original,action){
 let state=ensurePreviewReunions(original),records=state.reunions,current=selectedReunion(state);
 if(action.type==='SELECT_REUNION'){
  if(!records.some(r=>r.id===action.id))throw Error('That reunion is unavailable.');
  const saved={...(state.reunionData||{}),[current.id]:Object.fromEntries(REUNION_FIELDS.map(key=>[key,state[key]]))};
  return {...state,...blankReunionData(),...saved[action.id],reunionData:saved,selectedReunionId:action.id};
 }
 if(action.type==='SET_REUNION_CADENCE'){
  if(!['annual','biennial','irregular'].includes(action.value))throw Error('Choose a reunion cadence.');
  return {...state,reunionCadence:action.value};
 }
 if(action.type==='CREATE_REUNION'||action.type==='UPDATE_REUNION'){
  const year=reunionYear(action.year),id=action.type==='CREATE_REUNION'?'reunion-'+year:action.id;
  if(records.some(r=>r.year===year&&r.id!==id)||action.type==='CREATE_REUNION'&&records.some(r=>r.id===id))throw Error('A reunion already exists for that year.');
  if(action.type==='UPDATE_REUNION'&&!records.some(r=>r.id===id))throw Error('That reunion is unavailable.');
  return {...state,reunions:action.type==='CREATE_REUNION'?[...records,{id,year,name:year+' reunion',status:'planned'}]:records.map(r=>r.id===id?{...r,year,name:year+' reunion'}:r)};
 }
 const target=records.find(r=>r.id===action.id);if(!target)throw Error('That reunion is unavailable.');
 if(action.type==='ACTIVATE_REUNION'){
  if(target.status==='archived')throw Error('Restore this reunion before making it active.');
  return {...state,activeReunionId:target.id,reunions:records.map(r=>r.id===target.id?{...r,status:'active'}:r.status==='active'?{...r,status:action.archivePrevious?'archived':'planned'}:r)};
 }
 if(action.type==='ARCHIVE_REUNION'&&target.status==='active')throw Error('Choose another active reunion before archiving this one.');
 return {...state,reunions:records.map(r=>r.id===target.id?{...r,status:action.type==='ARCHIVE_REUNION'?'archived':'planned'}:r)};
}
