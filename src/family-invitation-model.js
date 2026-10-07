const key='gw-pending-family-invitation:v1';
export function familyInvitationToken(hash){const match=String(hash||'').match(/^#\/family-invite\/([a-f0-9]{64})(?:\?|$)/);return match?.[1]||null}
export function pendingFamilyInvitation(hash,storage){const token=familyInvitationToken(hash);try{if(token)storage?.setItem(key,token);const saved=token||storage?.getItem(key);return /^[a-f0-9]{64}$/.test(saved||'')?saved:null}catch{return token}}
export function clearFamilyInvitation(storage){try{storage?.removeItem(key)}catch{}}
