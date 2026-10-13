import exifr from 'exifr';
export function dateSuggestion(metadata,today=new Date()){
 const value=metadata?.DateTimeOriginal||metadata?.CreateDate;if(!(value instanceof Date)||Number.isNaN(+value)||value>today||value.getFullYear()<1600)return null;
 const date=[value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
 return {capturedDate:date,dateStatus:'suggested',dateSource:metadata.DateTimeOriginal?'embedded capture date':'embedded creation date'};
}
export async function memoryMetadata(file){if(!file.type.startsWith('image/'))return {};try{return dateSuggestion(await exifr.parse(file,{pick:['DateTimeOriginal','CreateDate'],gps:false,iptc:false,icc:false,xmp:false}))||{}}catch{return {}}}
