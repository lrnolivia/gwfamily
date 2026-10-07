import {can} from './policy.mjs';
import {reunionYear,REUNION_LIFECYCLE_COMMANDS,REUNION_SCOPED_COMMANDS} from '../../src/reunion-model.js';
export {REUNION_LIFECYCLE_COMMANDS,REUNION_SCOPED_COMMANDS};
export const reunionSettingsId=id=>id==='legacy'?'current':id;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export async function readReunions(db){return (await db.prepare('SELECT id,year,name,status FROM reunions ORDER BY year DESC,id').bind().all()).results||[]}
export async function resolveReunion(db,id,{write=false}={}){
 if(id!==undefined&&id!==null&&(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id)))fail('Choose a valid reunion.');
 // Legacy clients cannot accidentally write to a newly active year.
 const reunion=await (id?db.prepare('SELECT * FROM reunions WHERE id=?').bind(id):write?db.prepare("SELECT * FROM reunions WHERE id='legacy'").bind():db.prepare("SELECT * FROM reunions WHERE status='active'").bind()).first();
 if(!reunion)fail('That reunion is unavailable. Refresh and choose a year.',404);
 if(write&&reunion.status==='archived')fail('This reunion is archived. Restore it before making changes.',409);return reunion;
}
export function guardReunionWrite(q,id,token,year){
 q("INSERT INTO reunion_write_guards(id,valid) VALUES(?,COALESCE((SELECT status!='archived' AND year IS ? FROM reunions WHERE id=?),0))",token,year??null,id);
 q('DELETE FROM reunion_write_guards WHERE id=?',token);
}
export async function reunionCommand(db,actor,input,q,audit){
 if(!can(actor,'manage_reunion'))fail('Planner permission required',403);
 if(input.type==='SET_REUNION_CADENCE'){
  if(!['annual','biennial','irregular'].includes(input.value))fail('Choose a reunion cadence.');
  q("UPDATE reunion_preferences SET cadence=? WHERE id='family'",input.value);audit('reunion-cadence-update','family');return;
 }
 if(input.type==='CREATE_REUNION'||input.type==='UPDATE_REUNION'){
  let year;try{year=reunionYear(input.year)}catch(e){fail(e.message)}
  const id=input.type==='CREATE_REUNION'?'reunion-'+year:input.id;
  if(typeof id!=='string'||!id)fail('Choose the reunion to change.');
  if((await readReunions(db)).some(r=>r.year===year&&r.id!==id||input.type==='CREATE_REUNION'&&r.id===id))fail('A reunion already exists for that year.',409);
  if(input.type==='CREATE_REUNION'){
   q("INSERT INTO reunions(id,year,name,status) VALUES(?,?,?,'planned')",id,year,year+' reunion');
   q('INSERT INTO reunion_settings(id,data_json,updated_by) VALUES(?,?,?)',id,'{}',actor.id);
  }else{
   const existing=await resolveReunion(db,id,{write:true});guardReunionWrite(q,id,input.requestId,existing.year);
   const settings=await db.prepare('SELECT data_json FROM reunion_settings WHERE id=?').bind(reunionSettingsId(id)).first();const date=JSON.parse(settings?.data_json||'{}').date;
   q("INSERT INTO reunion_write_guards(id,valid) VALUES(?,COALESCE((SELECT data_json=? FROM reunion_settings WHERE id=?),0))",input.requestId,settings?.data_json||'{}',reunionSettingsId(id));q('DELETE FROM reunion_write_guards WHERE id=?',input.requestId);
   if(date&&Number(date.slice(0,4))!==year)fail('The saved reunion date belongs to another year. Update its date first.');
   q('UPDATE reunions SET year=?,name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',year,year+' reunion',id);
  }
  audit(input.type.toLowerCase(),id);return {id};
 }
 if(typeof input.id!=='string'||!input.id)fail('Choose the reunion to change.');
 const target=await resolveReunion(db,input.id),active=await resolveReunion(db);
 q("INSERT INTO reunion_write_guards(id,valid) VALUES(?,COALESCE((SELECT status=? FROM reunions WHERE id=?),0)*COALESCE((SELECT status='active' FROM reunions WHERE id=?),0))",input.requestId,target.status,target.id,active.id);
 q('DELETE FROM reunion_write_guards WHERE id=?',input.requestId);
 if(input.type==='ACTIVATE_REUNION'){
  if(target.status==='archived')fail('Restore this reunion before making it active.',409);
  if(target.id===active.id)return;
  q('UPDATE reunions SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=\'active\'',input.archivePrevious===true?'archived':'planned',active.id);
  q("UPDATE reunions SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='planned'",target.id);
 }else{
  if(target.status==='active')fail('Choose another active reunion before archiving this one.',409);
  q('UPDATE reunions SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!=\'active\'',input.type==='ARCHIVE_REUNION'?'archived':'planned',target.id);
 }
 audit(input.type.toLowerCase(),target.id);
}
