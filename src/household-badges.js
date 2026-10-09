// One primary household badge plus "+N" for a person's other households.
// Only accepted memberships count; pending join requests and invitations never
// appear here. Full names everywhere except compact badges, which use initials
// only when no other household shares them.
const SKIP=new Set(['the','and','of','household','home','house','family']);
const words=name=>String(name||'').split(/\s+/).map(w=>w.replace(/[^\p{L}\p{N}&]/gu,'')).filter(w=>w&&w!=='&'&&!SKIP.has(w.toLowerCase()));
// "Willie & Ruthie" → "W&R"; "Harbor Home" → "H"; single long words keep two letters.
export function householdInitials(name,letters=1){
 const parts=words(name);if(!parts.length)return '';
 if(parts.length===1)return parts[0].slice(0,Math.max(2,letters)).replace(/^./,c=>c.toUpperCase());
 const joiner=/&|\band\b/i.test(String(name))?'&':'';
 return parts.map(w=>w.slice(0,letters).replace(/^./,c=>c.toUpperCase())).join(joiner);
}
// Shortest initials that no other household shares, else the full name.
export function compactHouseholdName(state,household){
 const others=(state.households||[]).filter(h=>h.id!==household.id);
 for(const letters of [1,2]){const label=householdInitials(household.name,letters);if(label&&label.length<household.name.length&&!others.some(h=>householdInitials(h.name,letters)===label))return label;}
 return household.name;
}
export function memberHouseholds(state,memberId){
 const all=(state.households||[]).filter(h=>(h.memberIds||[]).includes(memberId));
 const preferred=(memberId===state.selfId?state.householdId:null)||state.primaryHouseholds?.[memberId];
 const primary=all.find(h=>h.id===preferred)||all[0]||null;
 return primary?[primary,...all.filter(h=>h!==primary)]:[];
}
export function householdBadge(state,memberId,{compact=false}={}){
 const [primary,...others]=memberHouseholds(state,memberId);if(!primary)return null;
 return {household:primary,label:compact?compactHouseholdName(state,primary):primary.name,fullName:primary.name,more:others.length,others:others.map(h=>h.name)};
}
