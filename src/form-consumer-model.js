// These checks mirror the existing /api/media and merchandise contracts. They
// never authorize a write, manufacture a saved person allocation, or upload.
export const imageTypes=['image/png','image/jpeg','image/webp','image/gif'];
export function imageFileError(file,label='photo'){
 if(!file||!imageTypes.includes(file.type))return `Choose a JPEG, PNG, WebP or GIF ${label}.`;
 if(!Number.isFinite(file.size)||file.size<=0||file.size>20*1024*1024)return `Choose a ${label} under 20 MB.`;
 return '';
}
export function claimLines(claim){
 try{
  const lines=JSON.parse(claim.lines_json);
  if(!Array.isArray(lines)||lines.some(line=>!line||typeof line!=='object'||Array.isArray(line)))throw Error();
  return {lines,error:''};
 }catch{return {lines:[],error:'Order details couldn’t be read. Refresh the orders to try again.'}}
}
export function claimDate(value){
 if(!value)return '';
 const raw=String(value),date=new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)?raw:raw+'Z');
 return Number.isNaN(date.getTime())?'':date.toLocaleDateString();
}
