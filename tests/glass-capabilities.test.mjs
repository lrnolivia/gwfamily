import test from 'node:test';
import assert from 'node:assert/strict';
import {usesNativeGlassOnly} from '../src/glass-capabilities.js';
const safari='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
test('WebKit glass uses native blur without SVG image/filter graphs on desktop and iOS',()=>{
  for(const ua of [safari,iphone+' Version/18.6 Mobile/15E148 Safari/604.1',iphone+' CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',iphone+' FxiOS/140.0 Mobile/15E148 Safari/605.1.15',iphone+' EdgiOS/140.0 Mobile/15E148 Safari/605.1.15'])assert.equal(usesNativeGlassOnly(ua),true,ua);
});
test('desktop Chromium and Firefox retain the approved SVG lens',()=>{
  for(const ua of ['', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',safari.replace('Version/18.6','Chrome/140.0.0.0'), 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Mozilla/5.0 AppleWebKit/537.36 Chromium/140.0.0.0', 'Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'])assert.equal(usesNativeGlassOnly(ua),false,ua);
});
