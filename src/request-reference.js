// Only the server's opaque correlation identifier is safe to show or retain.
export function requestReference(value,response){
 const valid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 const body=value?.requestId,header=response?.headers?.get?.('X-Request-ID');
 return valid(body)?body:valid(header)?header:null;
}
export const withRequestReference=(message,requestId)=>message+(requestId?' Reference: '+requestId:'');
