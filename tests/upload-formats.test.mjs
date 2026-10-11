import test from 'node:test';import assert from 'node:assert/strict';
import {UPLOAD_FORMATS,ATTACHMENT_ACCEPT,MEMORY_ACCEPT,MEMORY_TYPES,uploadFormat,signatureMatches} from '../src/upload-formats.js';
import {linkInfo} from '../src/music-link-model.js';
import {readFileSync} from 'node:fs';
const bytes=s=>new Uint8Array([...s].map(c=>c.charCodeAt(0)));
test('every type a picker offers is one the server accepts',()=>{
 for(const part of [...ATTACHMENT_ACCEPT.split(','),...MEMORY_ACCEPT.split(',')])assert.ok(part.startsWith('.')?UPLOAD_FORMATS.some(f=>f.ext.includes(part)):uploadFormat(part),part);
 for(const type of ['image/avif','video/quicktime','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','audio/x-m4a'])assert.ok(uploadFormat(type),type);
 assert.equal(MEMORY_TYPES.has('application/msword'),false,'Word files are attachments, not memories');assert.ok(MEMORY_TYPES.has('video/quicktime'));
 // No wildcard pickers remain that would offer formats the server refuses.
 for(const file of ['src/conversation.jsx','src/react-app.jsx','src/memories.jsx'])assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/accept="(image|video|audio)\/\*/,file);
});
test('signatures must match the declared type',()=>{
 assert.ok(signatureMatches('image/avif',bytes('\0\0\0\x1cftypavif\0\0\0\0')));assert.equal(signatureMatches('image/avif',bytes('\x89PNG\r\n\x1a\n')),false);
 assert.ok(signatureMatches('video/quicktime',bytes('\0\0\0\x14ftypqt  \0\0\0\0')));assert.ok(signatureMatches('application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes('PK\x03\x04rest')));
 assert.ok(signatureMatches('application/msword',new Uint8Array([0xd0,0xcf,0x11,0xe0,0xa1,0xb1])));assert.equal(signatureMatches('application/msword',bytes('PK\x03\x04')),false);
});
test('music links are rebuilt from the URL; anything else is dropped',()=>{
 assert.deepEqual(linkInfo('https://open.spotify.com/track/'+'a'.repeat(22)+'?si=x'),{service:'Spotify',url:'https://open.spotify.com/track/'+'a'.repeat(22),embed:'https://open.spotify.com/embed/track/'+'a'.repeat(22),type:'track'});
 assert.equal(linkInfo('https://music.apple.com/us/album/fictional/123?i=456').type,'song');assert.equal(linkInfo('https://music.apple.com/us/album/fictional/123?i=456').embed,'https://embed.music.apple.com/us/album/fictional/123?i=456');
 for(const bad of ['javascript:alert(1)','https://evil.example/track/x','http://open.spotify.com/track/'+'a'.repeat(22),'https://music.apple.com/us/album/x/1/../../evil'])assert.equal(linkInfo(bad),null,bad);
});
