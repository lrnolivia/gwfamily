import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/gw-quality.yml',import.meta.url),'utf8');
test('browser retries consume the sealed producer artifact identity, not their own attempt',()=>{
 const [producer,consumer]=workflow.split('\n  verify:');
 assert.match(producer,/archive_name: \$\{\{ steps\.build_manifest\.outputs\.archive_name \}\}/);
 assert.ok(producer.includes('archive_name=gw-built-source-%s-%s'));
 assert.ok(producer.includes('"$GW_SOURCE_SHA" "$GITHUB_RUN_ATTEMPT"'));
 assert.match(producer,/name: \$\{\{ steps\.build_manifest\.outputs\.archive_name \}\}/);
 assert.match(consumer,/uses: actions\/download-artifact@v4\s+with:\s+name: \$\{\{ needs\.shared\.outputs\.archive_name \}\}/);
 assert.doesNotMatch(consumer,/name: gw-built-source-.*github\.run_attempt/);
 assert.ok(consumer.includes('GW_BUILD_ARCHIVE_SHA: ${{ needs.shared.outputs.archive_sha }}'));
 assert.ok(consumer.includes('sha256sum -c -'));
 assert.ok(consumer.includes('test "$(cat gw-source-sha.txt)" = "$GW_SOURCE_SHA"'));
});
