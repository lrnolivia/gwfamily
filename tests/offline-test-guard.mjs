// Per-test-process guard for pure/source checks in local runs and canonical CI.
// Import explicitly in offline-only tests; it does not change the browser suite.
import {createRequire,syncBuiltinESMExports,registerHooks} from 'node:module';
const require=createRequire(import.meta.url);
const deny=()=>{throw Error('Recovery checks prohibit network, server, browser, and child processes')};
for(const [name,methods] of Object.entries({net:['connect','createConnection','createServer'],tls:['connect','createServer'],http:['request','get','createServer'],https:['request','get','createServer'],http2:['connect','createServer','createSecureServer'],dgram:['createSocket'],dns:['lookup','lookupService','resolve','resolve4','resolve6','resolveAny','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse']})){
 const api=require('node:'+name);for(const key of methods)if(typeof api[key]==='function')api[key]=deny;
}
require('node:net').Socket.prototype.connect=deny;require('node:net').Server.prototype.listen=deny;
for(const key of Object.keys(require('node:dns').promises))if(typeof require('node:dns').promises[key]==='function')require('node:dns').promises[key]=deny;
for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])require('node:child_process')[key]=deny;
globalThis.fetch=deny;globalThis.WebSocket=class{constructor(){deny()}};globalThis.EventSource=globalThis.WebSocket;
registerHooks({resolve(specifier,context,next){if(/(^|\/)(playwright|playwright-core|puppeteer|puppeteer-core)(\/|$)/.test(specifier))deny();return next(specifier,context)}});
syncBuiltinESMExports();
