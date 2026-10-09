import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('combined release uses 0.3.1 consistently while cache hash stays independent',()=>{
 const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
 const version=read('package.json').version;assert.equal(version,'0.3.1');assert.equal(read('package-lock.json').version,version);assert.equal(read('package-lock.json').packages[''].version,version);assert.equal(read('src/about-notices.json').version,version);
 const metadata=read('dist/build.json');assert.equal(metadata.releaseVersion,version);assert.match(metadata.version,/^[0-9a-f]{20}$/);assert.notEqual(metadata.version,version);
});

test('About fallback and build metadata use the package release version',()=>{const about=readFileSync(new URL('../src/about.jsx',import.meta.url),'utf8'),script=readFileSync(new URL('../scripts/version-assets.mjs',import.meta.url),'utf8');assert.match(about,/import \{version as releaseVersion\} from '\.\.\/package\.json'/);assert.match(about,/\|\|releaseVersion/);assert.doesNotMatch(about,/notices\.version/);assert.match(script,/version:releaseVersion/);});
