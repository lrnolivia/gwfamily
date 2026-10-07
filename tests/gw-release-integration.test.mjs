import test from 'node:test';
import assert from 'node:assert/strict';
import {installSteps,installPlatform} from '../src/install-capabilities.js';
import {profilePalette,contrast} from '../src/profile-model.js';
import glyphPaths from '../src/glyph-paths.js';
test('merged native-guide paths keep three actual steps on every supported OS',()=>{
 for(const platform of ['apple','android','mac','windows','chromeos'])assert.equal(installSteps[platform].length,3,platform);
 assert.equal(installPlatform({userAgent:'CrOS x86_64'}),'chromeos');
 assert.equal(installPlatform({userAgent:'Windows NT 10'}),'windows');
 assert.equal(installPlatform({platform:'MacIntel'}),'mac');
});
test('semantic guide/help/edit glyphs are defined and never fall back to arrow',()=>{
 for(const name of ['phone','computer','globe','help','history','lock','edit']){assert.ok(glyphPaths[name]);assert.notEqual(glyphPaths[name],glyphPaths.arrow)}
});
test('active-accent Send palette keeps text and shape contrast across light/dark colors',()=>{
 for(const theme of ['light','dark'])for(const color of ['#4f996c','#c8ac52','#b5648a','#002955','#ffffff','#000000']){
 const palette=profilePalette(color,theme);assert.ok(contrast(palette['--send-text'],palette['--send-active'])>=4.5,theme+color);
 assert.ok(contrast(palette['--send-edge'],palette['--surface'])>=3,theme+color);
 }
});
