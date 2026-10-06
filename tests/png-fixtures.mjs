// Generate real, structurally valid PNGs rather than copy unverified base64.
// Test-only Node helper; no image bytes are sent outside the isolated fixture.
import {deflateSync} from 'node:zlib';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
export function pngCrc32(bytes){let crc=0xffffffff;for(const value of bytes){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(pngCrc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc])}
export function createTestPng(width=1,height=1){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>512||height>512)throw new Error('Use fixture dimensions between1 and512');
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const pixels=Buffer.alloc(height*(1+width*4));
 for(let y=0;y<height;y++){const row=y*(1+width*4);for(let x=0;x<width;x++){const offset=row+1+x*4;pixels[offset]=35+x%100;pixels[offset+1]=130+y%100;pixels[offset+2]=75;pixels[offset+3]=255}}
 return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
export function inspectPng(bytes){
 const data=Buffer.from(bytes);if(!data.subarray(0,8).equals(signature))throw new Error('Invalid PNG signature');
 let offset=8;const chunks=[];
 while(offset<data.length){if(offset+12>data.length)throw new Error('Truncated PNG chunk');const length=data.readUInt32BE(offset),end=offset+12+length;if(end>data.length)throw new Error('Truncated PNG payload');const type=data.toString('ascii',offset+4,offset+8),body=data.subarray(offset+8,end-4),stored=data.readUInt32BE(end-4),actual=pngCrc32(data.subarray(offset+4,end-4));if(stored!==actual)throw new Error(`Invalid ${type} CRC: stored${stored.toString(16)} actual${actual.toString(16)}`);chunks.push({type,data:body});offset=end}
 if(chunks[0]?.type!=='IHDR'||chunks[0].data.length!==13||chunks.at(-1)?.type!=='IEND'||chunks.at(-1).data.length!==0||!chunks.some(c=>c.type==='IDAT'))throw new Error('Invalid PNG structure');
 return {width:chunks[0].data.readUInt32BE(0),height:chunks[0].data.readUInt32BE(4),chunks};
}
