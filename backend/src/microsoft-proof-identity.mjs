import {displayNameFromClaims} from './access-identity.mjs';
import {normalizeProofEmail} from './microsoft-proof-store.mjs';
export function microsoftIdentityFromVerifiedClaims(payload){
 const claims=payload?.custom;
 if(payload?.type!=='app'||typeof payload.sub!=='string'||!payload.sub||!claims||typeof claims!=='object'||Array.isArray(claims)||claims.tid!=='9188040d-6c67-4c5b-b112-36a304b66dad'||typeof claims.oid!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.oid))throw Error('A personal Microsoft identity with its stable ID is required');
 // Microsoft oid+tid is immutable. Access's outer sub is per email and is not this key.
 // Email is only a suggestion until the mailbox OTP is completed in this browser.
 return {accountId:claims.tid+':'+claims.oid.toLowerCase(),name:displayNameFromClaims(claims),emailHint:normalizeProofEmail(payload.email)};
}
