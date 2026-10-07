// Deliberately finite categories. Never emit an exception message, SQL, stack,
// account ID, URL/query string, request body, header or cookie into telemetry.
export function errorCategory(error){
 const code=[error?.code,error?.message,error?.cause?.code,error?.cause?.message]
  .filter(value=>typeof value==='string').join(' ');
 if(/SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(code))return 'database_busy';
 if(/no such (?:table|column)|has no column named/i.test(code))return 'database_schema';
 if(/SQLITE_CONSTRAINT|constraint failed/i.test(code))return 'database_constraint';
 if(/D1_ERROR|D1_EXEC_ERROR|D1_TYPE_ERROR|SQLITE_ERROR/i.test(code))return 'database';
 if(error?.name==='TimeoutError'||/\b(?:ETIMEDOUT|TIMEOUT)\b/.test(code))return 'timeout';
 if(error?.name==='TypeError')return 'type';
 if(error?.name==='RangeError')return 'range';
 return 'unexpected';
}
export function recordUnexpectedError(error,context,log=console.error){
 const requestId=crypto.randomUUID();
 // Hono's routePath is the registered route template, never the requested URL.
 const route=context.req.routePath;
 const diagnostic={requestId,route:typeof route==='string'&&/^\/?[A-Za-z/:*_-]{1,100}$/.test(route)?route:'unmatched',category:errorCategory(error),status:500};
 try{log(JSON.stringify(diagnostic))}catch{/* Reporting must not change the response. */}
 return requestId;
}

// Better Auth otherwise forwards raw errors (including SQL and parameters) to
// console. Keep its errors diagnosable without copying those arguments to logs.
export const authDiagnosticLogger=Object.freeze({level:'error',log(level,_message,...args){
 if(level!=='error')return;
 recordUnexpectedError(_message instanceof Error?_message:args.find(value=>value instanceof Error),{req:{routePath:'/api/auth/*'}});
}});
