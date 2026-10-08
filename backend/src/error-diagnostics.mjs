// Only fixed categories and names leave this module. Never emit raw messages,
// stacks, SQL/parameters, request bodies, headers, cookies or account identities.
const stages=new Set(['auth.session.initial','auth.session.revalidate','auth.handler','auth.other','request.handler','membership','auth.schema']);
const names=new Set(['Error','TypeError','RangeError','SyntaxError','TimeoutError','AbortError','APIError','AggregateError','DOMException','BetterAuthError']);
const codes=new Set(['D1_ERROR','D1_EXEC_ERROR','D1_TYPE_ERROR','SQLITE_ERROR','SQLITE_BUSY','SQLITE_LOCKED','SQLITE_CONSTRAINT','ETIMEDOUT','TIMEOUT','FAILED_TO_GET_SESSION','INTERNAL_SERVER_ERROR','SCHEMA_MISMATCH','D1_RESET','D1_NETWORK_ERROR','D1_TIMEOUT','D1_OVERLOADED']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const field=(value,key)=>{try{return value&&typeof value==='object'?value[key]:undefined}catch{return undefined}};
const chain=error=>{const result=[];for(let depth=0;error&&depth<=2&&!result.includes(error);depth++){result.push(error);error=field(error,'cause')}return result};
const safeName=error=>names.has(field(error,'name'))?field(error,'name'):'other';
const safeCode=error=>codes.has(field(error,'code'))?field(error,'code'):codes.has(field(field(error,'body'),'code'))?field(field(error,'body'),'code'):'other';
const errorLike=value=>value instanceof Error||Boolean(value&&typeof value==='object'&&['name','message','code','cause','body'].some(key=>field(value,key)!==undefined));
export function errorCategory(error){
 const code=chain(error).flatMap(value=>[field(value,'code'),field(value,'message'),field(field(value,'body'),'code')]).filter(value=>typeof value==='string').join(' ');
 if(/SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(code))return 'database_busy';
 if(/SCHEMA_MISMATCH|no such (?:table|column)|has no column named/i.test(code))return 'database_schema';
 if(/D1.*(?:overload|too many requests|queue)/i.test(code))return 'database_overloaded';
 if(/D1.*(?:reset)/i.test(code))return 'database_reset';
 if(/D1.*(?:network)/i.test(code))return 'database_network';
 if(/D1.*(?:timeout|timed out)/i.test(code))return 'database_timeout';
 if(/D1.*(?:quota|limit exceeded)/i.test(code))return 'database_quota';
 if(/SQLITE_CONSTRAINT|constraint failed/i.test(code))return 'database_constraint';
 if(/D1_ERROR|D1_EXEC_ERROR|D1_TYPE_ERROR|SQLITE_ERROR/i.test(code))return 'database';
 if(chain(error).some(value=>field(value,'name')==='TimeoutError')||/\b(?:ETIMEDOUT|TIMEOUT)\b/.test(code))return 'timeout';
 if(field(error,'name')==='TypeError')return 'type';
 if(field(error,'name')==='RangeError')return 'range';
 return 'unexpected';
}
export function requestDiagnosticContext(context,stage){
 stage=stage||context?.get?.('diagnosticStage')||'request.handler';
 context?.set?.('diagnosticStage',stage);
 // During middleware routePath points at /api/*. matchedRoutes contains the
 // registered endpoint as well; do not substitute a URL with actual parameters.
 const routes=context?.req?.matchedRoutes,endpoint=Array.isArray(routes)?routes.find(route=>route.method!=='ALL'):null;
 return {requestId:context?.get?.('requestId'),routeTemplate:endpoint?.path||context?.req?.routePath,stage};
}
function scopedContext(context={}){
 if(context.req)context=requestDiagnosticContext(context);
 return Object.freeze({requestId:uuid.test(context.requestId||'')?context.requestId:crypto.randomUUID(),route:typeof context.routeTemplate==='string'&&/^\/?[A-Za-z0-9/:*_-]{1,100}$/.test(context.routeTemplate)?context.routeTemplate:'unmatched',stage:stages.has(context.stage)?context.stage:'auth.other'});
}
export function recordUnexpectedError(error,context,log=console.error){
 const scope=scopedContext(context),causes=chain(error).slice(1),selectedErrorPresent=errorLike(error);
 const event=context?.event==='schema_validation'?'schema_validation':'request_error';
 const diagnostic={...scope,event,category:event==='schema_validation'?'database_schema':errorCategory(error),errorKind:!selectedErrorPresent?'absent':field(error,'name')==='APIError'?'api_error':error instanceof Error?'error':'error_like',selectedErrorPresent,errorName:selectedErrorPresent?safeName(error):'none',causeName:causes.length?safeName(causes[0]):'none',causeCode:causes.length?causes.map(safeCode).find(code=>code!=='other')||'other':'none',bodyCode:safeCode(error),status:500};
 try{log(JSON.stringify(diagnostic))}catch{/* Reporting must not change the response. */}
 return scope.requestId;
}
// Fresh closure per auth call: concurrent sessions cannot exchange references.
export function createAuthDiagnosticLogger(context={},log=console.error){
 const scope=scopedContext({...context,stage:context.stage||'auth.other'});
 return Object.freeze({level:'error',log(level,message,...args){if(level!=='error')return;const error=args.find(errorLike)||(errorLike(message)?message:undefined);recordUnexpectedError(error,{requestId:scope.requestId,routeTemplate:scope.route,stage:scope.stage,event:typeof message==='string'&&/schema validation|schema mismatch|SCHEMA_MISMATCH/i.test(message)?'schema_validation':'request_error'},log)}});
}
