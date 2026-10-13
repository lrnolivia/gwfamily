# Authentication release gate

Session lookups use a fresh Better Auth instance and `advanced.database.validateSchema=false`. No session or auth singleton cache is introduced. Required replacement checks are mandatory: the shared CI job runs the pinned library's explicit read-only schema check against every repository migration before building; production promotion must also pass the exact-config metadata gate below. CI alone does not verify the live database.

For **every deployment or runtime configuration change**, before uploading/promoting a candidate:

1. Refresh ownership, exact source SHA, passing shared/Chromium/WebKit checks, current production version and rollback. Retain the sealed build from that same CI run. Keep Push off and preserve all runtime options/bindings.
2. In the exact source checkout, install `backend/package-lock.json` without lifecycle scripts. Use the private Wrangler configuration reflecting the actual destination runtime, including all auth flags/options and DB binding. Save current Cloud settings as a private binding manifest with `bindings` (plain-text name/text pairs), `database` (the D1 binding) and `secrets` (declared secret names only). Secret bytes are unavailable from Cloudflare and do not influence expected schema; the gate uses opaque presence for the existing signing-secret binding without reading or replacing it. Never print secrets. Read only these live auth definitions with one D1 query, saving Wrangler's JSON result to a private metadata file:

```sql
SELECT 'user' table_name,name,type,"notnull" required,dflt_value,pk FROM pragma_table_info('user')
UNION ALL SELECT 'session',name,type,"notnull",dflt_value,pk FROM pragma_table_info('session')
UNION ALL SELECT 'account',name,type,"notnull",dflt_value,pk FROM pragma_table_info('account')
UNION ALL SELECT 'verification',name,type,"notnull",dflt_value,pk FROM pragma_table_info('verification');
```

3. Run `node backend/scripts/check-auth-schema.mjs --metadata <fresh-json> --config <private-runtime-config> --bindings <current-runtime-binding-manifest> --source <exact-40-character-SHA> --database <destination-DB-UUID> --receipt <private-receipt>`. It uses the same exported `authOptions` and pinned expected-schema comparison as runtime auth. Missing tables/columns or incompatible required columns reject the gate. Missing/invalid metadata, a mismatched DB binding, or any reported DB writes reject it too. This gate never repairs schema. Do not release on a failure.
4. Retain the receipt with source SHA, lock/auth-source/config/metadata hashes, DB identity and observation time. Verify hashes against the candidate and current configuration immediately before upload/promotion. A source/config/DB change invalidates the receipt; recollect live metadata. Do not copy a prior release receipt or rely on a synthetic CI verdict.
5. Promote only that sealed source/build, retain the prior production version, and verify signed-in initial loads and ordinary repeated polling on Reunion, Reunion Calendar, Directory, Messages and Notifications. Compare request references with finite server diagnostics for any remaining 500. Success of the workload repair does not establish the cause of every historical failure.

Diagnostics use one server-generated UUID through auth, error handlers, `X-Request-ID` and generic unexpected-error responses. Only registered route templates, finite stages/categories, selected error kind/name and allowlisted cause/body codes are emitted. No raw messages, SQL, cookies, credentials, headers, bodies or family identities are logged. Messaging retains the second authoritative session lookup. Revoked sessions remain 401; pending membership remains 403; actual database errors remain failures.

Session-cookie renewal propagation is a separate follow-up. This release requires no data migration/reset, does not change saved layouts, and does not enable Push.
