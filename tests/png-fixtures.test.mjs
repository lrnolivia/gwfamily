import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createTestPng,inspectPng} from './png-fixtures.mjs';
test('generated upload fixtures have valid signatures, lengths, every chunk CRC and complete pixel rows',()=>{
 for(const size of [1,32,128]){const {width,height,chunks}=inspectPng(createTestPng(size,size));assert.equal(width,size);assert.equal(height,size);assert.deepEqual(chunks.map(c=>c.type),['IHDR','IDAT','IEND']);assert.equal(chunks[0].data[8],8);assert.equal(chunks[0].data[9],6);const pixels=inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data)));assert.equal(pixels.length,size*(1+4*size));for(let y=0;y<size;y++){assert.equal(pixels[y*(1+size*4)],0);for(let x=0;x<size;x++)assert.equal(pixels[y*(1+size*4)+1+x*4+3],255)}}
});
test('the previous visually decodable1×1 fixture is rejected because its IDAT CRC is corrupt',()=>{
 const prior=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHMkAAAAASUVORK5CYII=','base64');
 assert.throws(()=>inspectPng(prior),/Invalid IDAT CRC: storedef9a1cc9 actualefa2a75b/);
 const truncated=createTestPng().subarray(0,-1);assert.throws(()=>inspectPng(truncated),/Truncated/);
});
