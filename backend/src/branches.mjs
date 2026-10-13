import {branchKey,branchName} from '../../src/branch-model.js';
// Branch authority, decided here and nowhere else:
// - any active member may create a branch, only when no branch has that name;
// - a household head attaches or detaches their own household;
// - family leaders and admins manage every branch and household placement.
// Placement never changes household membership, roles, privacy or primaries.
const rows=r=>r.results||[];
const error=(message,status=400)=>Object.assign(new Error(message),{status});
export const branchManager=actor=>actor?.isLeader===true||(actor?.roles||[]).includes('admin');
const validName=name=>{try{return branchName(name)}catch(e){throw error(e.message)}};
async function branchRow(db,id){const b=typeof id==='string'&&await db.prepare('SELECT * FROM branches WHERE id=?').bind(id).first();if(!b)throw error('Branch not found',404);return b}
async function nameClash(db,name,except=null){const b=await db.prepare('SELECT id,name FROM branches WHERE name_key=?').bind(branchKey(name)).first();return b&&b.id!==except?b:null}
async function placementAuthority(db,actor,householdId){
 const h=typeof householdId==='string'&&await db.prepare('SELECT id FROM households WHERE id=?').bind(householdId).first();if(!h)throw error('Household not found',404);
 if(branchManager(actor))return h;
 const head=await db.prepare("SELECT 1 AS ok FROM household_members hm JOIN members m ON m.id=hm.member_id AND m.status='active' WHERE hm.household_id=? AND hm.member_id=? AND hm.role='head'").bind(householdId,actor.id).first();
 if(!head)throw error('Only a head of this household or a family leader can change its branches',403);
 return h;
}
export async function branchState(db,actor){
 const branches=rows(await db.prepare('SELECT id,name,created_by FROM branches ORDER BY name COLLATE NOCASE,id').all());
 const links=rows(await db.prepare('SELECT bh.branch_id,bh.household_id FROM branch_households bh JOIN households h ON h.id=bh.household_id ORDER BY bh.attached_at,bh.household_id').all());
 return {branchManager:branchManager(actor),branches:branches.map(b=>({id:b.id,name:b.name,createdBy:b.created_by,householdIds:links.filter(l=>l.branch_id===b.id).map(l=>l.household_id)}))};
}
export async function branchCommand(db,actor,input,q,audit){switch(input.type){
case 'CREATE_BRANCH':{
 const name=validName(input.name),clash=await nameClash(db,name);if(clash)throw error(clash.name+' already exists. Choose it from the list instead.',409);
 if(input.householdId!=null)await placementAuthority(db,actor,input.householdId);
 const id=crypto.randomUUID();q('INSERT INTO branches(id,name,name_key,created_by) VALUES(?,?,?,?)',id,name,branchKey(name),actor.id);
 if(input.householdId!=null)q('INSERT INTO branch_households(branch_id,household_id,attached_by) VALUES(?,?,?)',id,input.householdId,actor.id);
 audit('branch-create',id);return {id};
}
case 'ATTACH_BRANCH_HOUSEHOLD':case 'DETACH_BRANCH_HOUSEHOLD':{
 const b=await branchRow(db,input.branchId);await placementAuthority(db,actor,input.householdId);
 const linked=await db.prepare('SELECT 1 AS ok FROM branch_households WHERE branch_id=? AND household_id=?').bind(b.id,input.householdId).first();
 if(input.type==='ATTACH_BRANCH_HOUSEHOLD'){if(linked)throw error('This household is already in '+b.name);q('INSERT INTO branch_households(branch_id,household_id,attached_by) VALUES(?,?,?)',b.id,input.householdId,actor.id);audit('branch-attach',b.id);}
 else{if(!linked)throw error('This household is not in '+b.name,404);q('DELETE FROM branch_households WHERE branch_id=? AND household_id=?',b.id,input.householdId);audit('branch-detach',b.id);}
 return {id:b.id};
}
case 'RENAME_BRANCH':{
 if(!branchManager(actor))throw error('Only family leaders can rename a branch',403);const b=await branchRow(db,input.branchId),name=validName(input.name),clash=await nameClash(db,name,b.id);if(clash)throw error(clash.name+' already exists',409);
 q('UPDATE branches SET name=?,name_key=? WHERE id=?',name,branchKey(name),b.id);audit('branch-rename',b.id);return {id:b.id};
}
case 'REMOVE_BRANCH':{
 if(!branchManager(actor))throw error('Only family leaders can remove a branch',403);const b=await branchRow(db,input.branchId);
 if(await db.prepare('SELECT 1 AS ok FROM branch_households WHERE branch_id=?').bind(b.id).first())throw error('Move its households out before removing this branch');
 q('DELETE FROM branches WHERE id=?',b.id);audit('branch-remove',b.id);return {id:b.id};
}
default:return null;
}}
