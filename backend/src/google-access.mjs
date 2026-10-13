// Preserve the existing Google account IDs, callback, state cookie and test interface.
import {accessProvider,verifyAccessIdentity} from './access-providers.mjs';
export const verifyGoogleAccess=verifyAccessIdentity;
export function googleAccess(env,verify=verifyGoogleAccess){return accessProvider(env,'google',verify)}
