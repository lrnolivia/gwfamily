// One list of upload formats for pickers, preview and the server, so a file the
// picker offers is never refused after upload. Signatures are checked server-side.
export const UPLOAD_FORMATS=Object.freeze([
 {type:'image/jpeg',ext:['.jpg','.jpeg'],kind:'image',inline:true},{type:'image/png',ext:['.png'],kind:'image',inline:true},
 {type:'image/webp',ext:['.webp'],kind:'image',inline:true},{type:'image/gif',ext:['.gif'],kind:'image',inline:true},
 {type:'image/avif',ext:['.avif'],kind:'image',inline:true},
 {type:'video/mp4',ext:['.mp4','.m4v'],kind:'video',inline:true},{type:'video/webm',ext:['.webm'],kind:'video',inline:true},{type:'video/quicktime',ext:['.mov'],kind:'video',inline:true},
 {type:'audio/mpeg',ext:['.mp3'],kind:'audio',inline:true},{type:'audio/mp4',ext:['.m4a'],kind:'audio',inline:true},{type:'audio/x-m4a',ext:[],kind:'audio',inline:true},{type:'audio/aac',ext:['.aac'],kind:'audio',inline:true},{type:'audio/ogg',ext:['.ogg','.oga'],kind:'audio',inline:true},{type:'audio/wav',ext:['.wav'],kind:'audio',inline:true},{type:'audio/x-wav',ext:[],kind:'audio',inline:true},{type:'audio/webm',ext:[],kind:'audio',inline:true},
 {type:'application/pdf',ext:['.pdf'],kind:'document',inline:false},{type:'text/plain',ext:['.txt'],kind:'document',inline:false},
 {type:'application/msword',ext:['.doc'],kind:'document',inline:false},{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',ext:['.docx'],kind:'document',inline:false}
]);
const byType=new Map(UPLOAD_FORMATS.map(f=>[f.type,f]));
export const uploadFormat=type=>byType.get(type)||null;
const accept=kinds=>[...new Set(UPLOAD_FORMATS.filter(f=>kinds.includes(f.kind)).flatMap(f=>[f.type,...f.ext]))].join(',');
export const ATTACHMENT_ACCEPT=accept(['image','video','audio','document']);
export const MEMORY_ACCEPT=accept(['image','video','audio'])+',application/pdf,.pdf';
export const MEMORY_PHOTO_ACCEPT=accept(['image']);
export const MEMORY_TYPES=new Set(UPLOAD_FORMATS.filter(f=>f.kind!=='document'||f.type==='application/pdf').map(f=>f.type));
// Content checks: first bytes must match the declared type.
export function signatureMatches(type,bytes){
 const b=bytes,s=String.fromCharCode(...b.slice(0,16)),box=s.slice(4,8),brand=s.slice(8,12);
 switch(type){
  case 'image/png':return b[0]===137&&s.slice(1,4)==='PNG';case 'image/jpeg':return b[0]===255&&b[1]===216;case 'image/gif':return s.startsWith('GIF8');
  case 'image/webp':return s.startsWith('RIFF')&&s.slice(8,12)==='WEBP';case 'image/avif':return box==='ftyp'&&['avif','avis','mif1'].includes(brand);
  case 'video/quicktime':return box==='ftyp'&&brand==='qt  '||['moov','wide','mdat','free'].includes(box);
  case 'video/mp4':case 'audio/mp4':case 'audio/x-m4a':return box==='ftyp';
  case 'video/webm':case 'audio/webm':return b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3;
  case 'application/pdf':return s.startsWith('%PDF-');
  case 'application/msword':return b[0]===0xd0&&b[1]===0xcf&&b[2]===0x11&&b[3]===0xe0;
  case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':return s.startsWith('PK\x03\x04');
  default:return true; // audio/mpeg, aac, ogg, wav, text: no reliable short signature
 }
}
