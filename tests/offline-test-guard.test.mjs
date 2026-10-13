import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,connect} from 'node:net';
import {execSync} from 'node:child_process';
test('offline source guard is self-contained in canonical test isolation',async()=>{
 assert.throws(()=>fetch('https://example.invalid'),/Recovery checks prohibit/);
 assert.throws(()=>connect(9,'127.0.0.1'),/Recovery checks prohibit/);
 assert.throws(()=>createServer(),/Recovery checks prohibit/);
 assert.throws(()=>execSync('true'),/Recovery checks prohibit/);
 await assert.rejects(import('playwright'),/Recovery checks prohibit/);
});
