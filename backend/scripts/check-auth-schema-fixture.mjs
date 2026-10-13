// CI gate uses real createAuth, exact pinned options and all repository migrations.
// The temporary SQLite database is synthetic; the schema check itself is read-only.
import {database} from '../tests/test-db.mjs';
import {checkAuthSchema} from '../src/auth-schema.mjs';
const {DB,sqlite}=database();
try {await checkAuthSchema({DB,BETTER_AUTH_SECRET:'synthetic-ci-schema-gate-not-live',AUTH_ORIGIN:'https://family.example.test'});console.log(JSON.stringify({gate:'auth-schema',checked:true,synthetic:true,sourceSha:process.env.GW_SOURCE_SHA||'local'}))} finally {sqlite.close()}
