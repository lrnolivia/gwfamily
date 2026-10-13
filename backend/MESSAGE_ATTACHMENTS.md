# Private message attachment lifecycle

Private attachments use participant-authorized `/api/conversations/:id/attachments/:attachmentId` downloads and `message-attachments/` object keys. They are never registered in shared family media. Downloading or deleting also requires the account that initiated the action. Downloads recheck both the existing sign-in and conversation access after the awaited object read, and use attachment disposition, `private, no-store`, `nosniff`, a sandbox CSP, and safe MIME-specific filenames.

Allowed formats: JPEG, PNG, WebP, GIF, PDF, UTF-8 text. Limits: 10 MiB/file, five files and 25 MiB/message; upload middleware caps multipart bodies at 11 MiB. Validate all bounded bytes before writing. PDFs remain download-only; this is not a malware scanning claim.

## Unsent stages and cancellation

- Unbound access expires 24 hours after allocation. Retry requests do not extend it.
- A cancellation request creates a metadata tombstone before a late upload can allocate an object. Cancellation cannot detach an already-sent message.
- If access or sign-in changes during a put, erase the still-unbound object and cancel its stage. A failed erase remains eligible for the janitor.
- Keep tombstones and metadata so interrupted retries cannot resurrect a cancelled object. Raw file bytes are never persisted in browser draft storage.
- Sent objects stay associated with their message and are excluded from cleanup, even if their original stage expiry has elapsed. No sent-message deletion or retention policy is introduced here.

## Physical cleanup

The existing scheduled Worker entry point invokes `cleanupMessageAttachments` on the already-declared non-push hourly cron. No Wrangler cron, R2 bucket setting, sign-in provider, push opt-in, credential, or security setting changes are included. Source wiring and a synthetic scheduled invocation are tested; deployment configuration and real execution must still be verified by the authorized release workflow.

Each invocation leases the sweep for 10 minutes, processes at most 100 expired/cancelled unbound rows, then scans at most 100 R2 keys. It atomically cancels each eligible stage before erasing its object. A concurrent message send either binds first and keeps the file, or sees cancellation and rolls its entire batch back. Bound objects are never erased. Failed deletions remain retryable; successful tombstones are revisited after an hour to catch late in-flight puts. The orphan scan saves its R2 cursor, stays inside the private namespace, and erases only objects at least 24 hours old with no metadata row. Other family media is untouched. The bounded sweep is eventual cleanup; under backlog it is not a promise of erasure exactly at expiry.

## Verification and rollback

Migration 0015 was exercised over the authoritative 0001–0014 chain with synthetic messages, participants and idempotency receipts. Disposable-table rollback and reapplication preserve those legacy rows. Application rollback should retain the additive schema and all message-bound objects. Do not drop production metadata to emulate object cleanup.

Focused Node22 tests use in-memory SQLite/D1/R2, actual Hono middleware and synthetic sessions; no network/server/browser or real account/files are involved. Real Better Auth cookies, session invalidation, D1 transactions, bucket privacy/cleanup delivery, and browser/device/a11y are separate hosted acceptance checks. Run the full canonical aggregate on the merged exact commit as well.

R2 API contract: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
