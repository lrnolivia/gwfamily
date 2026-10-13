import {can,isMember} from './policy.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(value,max=120,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())throw fail('Check the memorial details');return value.trim()};
const year=value=>{if(value==null||value==='')return '';const text=String(value);if(!/^\d{4}$/.test(text)||Number(text)<1000||Number(text)>new Date().getFullYear())throw fail('Use a four-digit year, or leave it blank');return text};
export async function memorialPermissions(db,actor){
 if(!isMember(actor))return {canCreate:false,headHouseholdIds:[]};
 const heads=(await db.prepare("SELECT household_id FROM household_members WHERE member_id=? AND role='head'").bind(actor.id).all()).results||[];
 return {canCreate:can(actor,'manage_members')||actor.isLeader===true||heads.length>0,headHouseholdIds:heads.map(h=>h.household_id)};
}
export async function memorialCommand(db,actor,input,q,audit){
 if(!['ADD_MEMORIAL','SAVE_MEMORIAL'].includes(input.type))return null;
 const permissions=await memorialPermissions(db,actor);if(!permissions.canCreate)throw fail('Family leaders and household heads can manage memorial profiles',403);
 const value=input.memorial||{},existing=input.type==='SAVE_MEMORIAL'?await db.prepare('SELECT * FROM memorials WHERE id=?').bind(value.id||'').first():null;
 if(input.type==='SAVE_MEMORIAL'&&!existing)throw fail('Memorial profile not found',404);
 const claimed=existing&&(await db.prepare("SELECT household_id FROM household_heritage WHERE person_id=? AND person_kind='ancestor'").bind(existing.id).all()).results.some(h=>permissions.headHouseholdIds.includes(h.household_id));
 if(existing&&!can(actor,'manage_members')&&!actor.isLeader&&existing.created_by!==actor.id&&!claimed)throw fail('A leader or a head of a household remembering this ancestor can edit this profile',403);
 const sourceId=existing?.source_member_id||value.sourceMemberId||null;
 if(sourceId&&(!existing||value.sourceMemberId&&value.sourceMemberId!==sourceId)){
  if(sourceId===actor.id)throw fail('Choose another family member for a memorial profile');
  if(!await db.prepare("SELECT id FROM members WHERE id=? AND status='active' AND removed_at IS NULL").bind(sourceId).first())throw fail('Choose an existing approved family member');
  if(await db.prepare('SELECT id FROM memorials WHERE source_member_id=?').bind(sourceId).first())throw fail('This family member already has a memorial profile',409);
 }
 const birthYear=year(value.birthYear),deathYear=year(value.deathYear);if(birthYear&&deathYear&&birthYear>deathYear)throw fail('The birth year must come before the year of passing');
 const prior=existing?JSON.parse(existing.profile_json||'{}'):{};
 const quote=clean(value.quote===undefined?(prior.quote||''):value.quote,1000);
 const profileColor=clean(value.profileColor===undefined?(prior.profileColor||''):value.profileColor,7);
 if(profileColor&&!/^#[0-9a-f]{6}$/i.test(profileColor))throw fail('Choose a valid profile color');
 const profile={...prior,birthYear,deathYear,photo:clean(value.photo||'',2000),quote,profileColor};
 if(profile.photo){
  const old=existing?JSON.parse(existing.profile_json):{},source=sourceId&&await db.prepare('SELECT image FROM user WHERE id=?').bind(sourceId).first();
  if(profile.photo!==old.photo&&profile.photo!==source?.image){const mediaId=/^\/api\/media\/([A-Za-z0-9-]+)$/.exec(profile.photo)?.[1],media=mediaId&&await db.prepare('SELECT owner_id,mime_type FROM media WHERE id=? AND deleted_at IS NULL').bind(mediaId).first();if(!media||media.owner_id!==actor.id||!/^image\/(png|jpeg|webp|gif)$/.test(media.mime_type))throw fail('Upload a photo from your account before saving')}
 }
 const id=existing?.id||crypto.randomUUID(),name=clean(value.name,120,true),maidenName=clean(value.maidenName||'',120),story=clean(value.story||'',10000);
 if(existing)q('UPDATE memorials SET name=?,maiden_name=?,story=?,profile_json=? WHERE id=?',name,maidenName,story,JSON.stringify(profile),id);
 else q('INSERT INTO memorials(id,name,maiden_name,story,created_by,profile_json,source_member_id) VALUES(?,?,?,?,?,?,?)',id,name,maidenName,story,actor.id,JSON.stringify(profile),sourceId);
 if(value.householdId){if(!permissions.headHouseholdIds.includes(value.householdId))throw fail('Only a head can add heritage to this household',403);q("INSERT INTO household_heritage(id,household_id,person_id,person_kind,role,title,updated_by) VALUES(?,?,?,'ancestor','ancestral-head','Ancestral head',?) ON CONFLICT(household_id,person_id,role) DO NOTHING",crypto.randomUUID(),value.householdId,id,actor.id)}
 // A remembrance profile never changes login, membership or account permissions.
 audit(existing?'memorial-updated':'memorial-created',id);return {id};
}
