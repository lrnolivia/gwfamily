import {emailAppearance} from '../../src/email-notification-model.js';
export {emailAppearance};
export const EMAIL_ERROR_CODES=Object.freeze(['E_VALIDATION_ERROR','E_FIELD_MISSING','E_TOO_MANY_RECIPIENTS','E_SENDER_NOT_VERIFIED','E_RECIPIENT_NOT_ALLOWED','E_RECIPIENT_SUPPRESSED','E_SENDER_DOMAIN_NOT_AVAILABLE','E_CONTENT_TOO_LARGE','E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED','E_DELIVERY_FAILED','E_INTERNAL_SERVER_ERROR','E_HEADER_NOT_ALLOWED']);
export const safeEmailCode=error=>EMAIL_ERROR_CODES.includes(error?.code)?error.code:'unknown';
export function emailRetry(code,attempts,now,expiresAt){
 // Only definitive quota rejection is retried. The binding has no documented
 // provider idempotency parameter: unknown/timeouts must never be resent.
 if(['E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED'].includes(code)&&attempts<5){
  const delay=code==='E_DAILY_LIMIT_EXCEEDED'?86400000:Math.min(3600000,60000*2**attempts),nextAt=now+delay;
  return nextAt<expiresAt?{state:'pending',nextAt}:{state:'expired'};
 }
 return {state:code==='unknown'||code==='E_INTERNAL_SERVER_ERROR'?'unknown':'failed'};
}
export function emailRuntimeReady(env){return env.EMAIL_SCHEMA_VERSION==='1'&&env.AUTH_EMAIL_ENABLED==='true'&&typeof env.EMAIL?.send==='function';}
