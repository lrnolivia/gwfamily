import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('human release increases above published0.1.0 consistently while cache hash stays independent',()=>{
 const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
 const version=read('package.json').version;assert.equal(version,'0.2.0');assert.equal(read('package-lock.json').packages[''].version,version);assert.equal(read('src/about-notices.json').version,version);
 const metadata=read('dist/build.json');assert.equal(metadata.releaseVersion,version);assert.match(metadata.version,/^[0-9a-f]{20}$/);assert.notEqual(metadata.version,version);
});
