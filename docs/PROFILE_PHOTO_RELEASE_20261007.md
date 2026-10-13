# Profile contacts and photo discussions

This extends the approved Green & White release with:
- Privacy-filtered contact details in the profile card, native phone/email/map/link actions, and a secondary Copy menu that does not intercept native long-press.
- A vCard download with device-specific import guidance and optional authorized photo inclusion. Exports re-read the server-filtered directory. No hidden account email or phone is used as a fallback.
- A profile-photo save preference, enabled by default. Existing private contact JSON stores the boolean; directory edits preserve it. It controls GW export/download actions, not screenshots or previously saved copies.
- Full-page profile/post/memory photo viewing, comments, replies, reactions, and photo saving. Live photo writes use the existing command receipt and draft-recovery path.

## Required release ordering

Apply additive migration `backend/migrations/0020_photo_discussions.sql` before directing traffic to the new backend. It adds only `photo_comments`, `photo_reactions`, and the comment lookup index. Do not rerun migrations 0015–0019, restore old snapshots over current data, or enable push as a side effect.

Before the migration, take and verify a fresh production backup under the established closed-write procedure. Preserve the current live Worker and year-aware recovery version. A runtime rollback must retain both new tables and all new user data; the old runtime can ignore these additive tables.

## Authorization and recovery

Every discussion read, write and download revalidates its current profile, memory, or private-post target. Changed profile pictures get a different discussion identity. A stale write is rejected. Private-group photographs do not become public through a discussion. Comment attachment access follows the same target authorization. Profile photo saving disabled by its owner blocks other members' built-in download/export actions while leaving normal display intact.

Commands retain existing authenticated Origin checks, request identifiers, fingerprints, bounded write rate and transactional receipts. Opening a photograph does not create a fake feed post or send a leader announcement.

## Evidence and limits

Focused model/backend checks are local evidence only. Exact-head Chromium/WebKit checks, retained rendered review, deployed build/asset verification and a production smoke pass remain required. Physical iPhone/Android contact-import and photo-save flows are not claimed by synthetic browser tests. Externally hosted provider photos may require opening the original instead of a built-in download; user-uploaded supported images use the authenticated media path.

The source's unchanged launch controls and app authorization remain authoritative. Notification/announcement email dispatch and push activation are separate work.

## Normal version packaging

The production site bundle embeds only the four generated core files: index.html, react-app.js, react-app.css, and build.json. Their exact source build and SHA-256 identities are included in site-worker-provenance.json. The ordinary Versions upload uses this complete site-worker.mjs module and retains the ASSETS binding for unchanged assets. It never proxies to the mutable preview and never uses a recovery-only upload operation.

Worker-first routing includes the exact core URLs plus existing /api/* and /health. API routing remains first; scheduled delegation is unchanged. GET/HEAD behavior, no-store, correct MIME, nosniff and exact body identity are checked on the emitted bundle. Core responses never reuse old ETag, Content-Length or Content-Encoding. Immutable compressed blobs are decoded lazily and shared across requests; decompression stays streaming.

The canonical asset manifest, provider-branding manifest, install-icon data, provider PNG data, favicon generator, PWA manifest and asset headers were compared with verified PR11 source a2a14f7c82f22b4b254bb2543696daa9aa2f4d18 and remain unchanged. Any later asset change outside the four embedded files must use a supported asset upload or be deliberately included in a separately tested package; keep_assets alone cannot update it.

Staging a normal version does not authorize a traffic switch before exact gates. Preserve compatibility flags, all existing resource/secret bindings, authorized launch flags and current cron/routes. Push stays off. Measure Cloudflare startup on upload; local Node import timing is not Cloudflare runtime evidence.
