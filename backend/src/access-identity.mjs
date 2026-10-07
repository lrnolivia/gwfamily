// Call only after cryptographic signature, issuer, audience and expiry validation.
export function displayNameFromClaims(claims){
 if(!claims||typeof claims!=='object'||Array.isArray(claims))return '';
 const clean=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,80):'';
 const name=clean(claims.name);
 if(name&&!name.includes('@'))return name;
 return [clean(claims.given_name),clean(claims.family_name)].filter(Boolean).join(' ').slice(0,80);
}
export function identityFromVerifiedAccessClaims(payload,provider='google'){
 if(!payload||payload.type!=='app'||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>512||typeof payload.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)||payload.email.length>320||payload.email.toLowerCase().startsWith('non_identity@'))throw Error('A verified sign-in identity is required');
 const claims=payload.custom&&typeof payload.custom==='object'&&!Array.isArray(payload.custom)?payload.custom:{};
 if(provider==='microsoft'){
  // Personal-account tenant only. Enterprise email is mutable and cannot authorize GW.
  if(claims.tid!=='9188040d-6c67-4c5b-b112-36a304b66dad')throw Error('Use a personal Microsoft account or an email code');
  const email=payload.email.toLowerCase(),verified=[claims.verified_primary_email,claims.verified_secondary_email].some(values=>Array.isArray(values)&&values.some(value=>typeof value==='string'&&value.toLowerCase()===email));
  if(claims.email_verified!==true&&!verified)throw Error('Use an email code to verify this address');
 }else if(provider==='yahoo'){
  if(claims.email_verified!==true)throw Error('Use an email code to verify this address');
 }else if(provider!=='google'||claims.email_verified===false){throw Error('A verified sign-in identity is required')}
 // Access only forwards explicitly configured custom claims; omission is normal.
 const name=displayNameFromClaims(payload.custom)||displayNameFromClaims(payload);
 return {sub:payload.sub,email:payload.email.toLowerCase(),name};
}
