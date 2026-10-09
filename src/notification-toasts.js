// Seed the first authorized snapshot silently. Only subsequent, new unread
// IDs may create a toast; paging, refreshes and account changes never replay it.
export function createNotificationArrivalTracker(){
 let identity=null,seeded=false,watermark=0,seen=new Set();
 return {update({account,ready,items=[],globalOff=false}){
  if(identity!==account){identity=account;seeded=false;watermark=0;seen=new Set()}
  if(!account||!ready)return [];
  const arrivals=items.filter(n=>typeof n.id==='string'&&Number.isSafeInteger(n.sequence)&&n.sequence>watermark&&!seen.has(n.id)&&!n.readAt);
  watermark=Math.max(watermark,...items.map(n=>Number.isSafeInteger(n.sequence)?n.sequence:0));
  for(const n of items)if(typeof n.id==='string')seen.add(n.id);
  if(!seeded){seeded=true;return []}
  return globalOff?[]:arrivals.sort((a,b)=>(a.sequence||0)-(b.sequence||0));
 }};
}
export function notificationActionLabel(notice){
 const kind=notice.kind||'';
 if(/household|invitation|request/.test(kind))return 'Review request';
 if(/message|conversation/.test(kind))return 'View message';
 if(/reply|comment/.test(kind))return 'View reply';
 if(/reunion/.test(kind))return 'View schedule';
 return 'View update';
}
