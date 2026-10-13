// Only server-authorized contact cards enter this model. Never fill missing
// contact fields from the private account/session object.
export function contactRows(card,{apple=false,socials={}}={}){
 if(!card)return [];
 const rows=[],add=(key,label,value,href,glyph)=>{if(typeof value==='string'&&value.trim())rows.push({key,label,value:value.trim(),href,glyph})};
 add('phone','Phone',card.phone,card.phone?'tel:'+encodeURIComponent(card.phone.trim()):null,'phone');
 add('email','Email',card.email,card.email?'mailto:'+encodeURIComponent(card.email.trim()):null,'mail');
 add('address','Address',card.address,card.address?(apple?'https://maps.apple.com/?q=':'https://www.google.com/maps/search/?api=1&query=')+encodeURIComponent(card.address.trim()):null,'home');
 const links=[['website','Website',card.website],['social','Social profile',card.social],...Object.entries(socials).map(([label,value])=>['social-'+label,label,value])],seen=new Set();
 for(const[key,label,value]of links){try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||seen.has(url.href))continue;seen.add(url.href);add(key,label,url.href,url.href,'link')}catch{}}
 return rows;
}
const clean=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
const escape=value=>clean(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
export function foldVCardLine(line){let result='',part='',size=0;for(const char of line){const bytes=new TextEncoder().encode(char).length;if(size+bytes>75){result+=part+'\r\n';part=' ';size=1}part+=char;size+=bytes;}return result+part;}
export function contactVCard(card,{photoBase64='',photoType='JPEG'}={}){
 if(!card||typeof card.name!=='string'||!card.name.trim())throw Error('Contact details are not available.');
 const lines=['BEGIN:VCARD','VERSION:3.0','FN:'+escape(card.name),'N:;'+escape(card.name)+';;;'];
 for(const [field,key]of [['TEL;TYPE=CELL','phone'],['EMAIL;TYPE=INTERNET','email']])if(card[key])lines.push(field+':'+escape(card[key]));
 if(card.address)lines.push('ADR;TYPE=HOME:;;'+escape(card.address)+';;;;');
 for(const row of contactRows(card))if(['website','social'].includes(row.key))lines.push('URL:'+escape(row.value));
 if(card.allowPhotoSave!==false&&photoBase64&&['JPEG','PNG','GIF'].includes(photoType)&&/^[A-Za-z0-9+/]*={0,2}$/.test(photoBase64)&&photoBase64.length<=3*1024*1024)lines.push('PHOTO;ENCODING=b;TYPE='+photoType+':'+photoBase64);
 lines.push('END:VCARD');return lines.map(foldVCardLine).join('\r\n')+'\r\n';
}
export function contactFilename(name){return (clean(name).replace(/[^\p{L}\p{N} _.-]/gu,'').trim().slice(0,70)||'Family contact')+'.vcf';}
