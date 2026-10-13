const invalid=()=>Object.assign(new Error('Choose people from the family directory or family tree'),{status:400});
// A directory reference never creates an account or gives the selected person access.
export async function directorySelection(db,value,{ancestors=false,max=100}={}){
 if(!Array.isArray(value)||value.length>max||value.some(id=>typeof id!=='string'||!id||id.length>100))throw invalid();
 const ids=[...new Set(value)];
 for(const id of ids){
  if(await db.prepare("SELECT id FROM members WHERE id=? AND status='active'").bind(id).first())continue;
  if(ancestors&&await db.prepare('SELECT id FROM memorials WHERE id=?').bind(id).first())continue;
  throw invalid();
 }
 return ids;
}
