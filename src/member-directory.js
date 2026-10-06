// Relational fields store directory IDs, never an unverified typed name.
// Private child records are deliberately absent from public selectors.
const normalize=value=>String(value||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase().trim();
export function directoryPeople(state,{purpose='member',query='',filter}={}){
 const members=(state.members||[]).filter(m=>!m.managedBy&&m.origin!=='dependent'&&(state.mode==='preview'||m.registered)).map(m=>({...m,personKind:'member'}));
 const ancestors=(state.memorials||[]).map(m=>({...m,personKind:'ancestor'}));
 const source=purpose==='ancestral-head'?ancestors:purpose==='tag'?[...members,...ancestors]:members;
 const terms=normalize(query).split(/\s+/).filter(Boolean),seen=new Set();
 return source.filter(m=>{
  if(!m.id||seen.has(m.id)||filter&&!filter(m))return false;
  seen.add(m.id);const name=normalize([m.name,m.maidenName].filter(Boolean).join(' '));
  return terms.every(term=>name.includes(term));
 }).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export function directoryPerson(state,id){return directoryPeople(state,{purpose:'tag'}).find(m=>m.id===id)||null}
