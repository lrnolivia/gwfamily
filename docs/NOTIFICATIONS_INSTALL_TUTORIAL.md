# Notifications, installation, and optional help

## Release boundary

Prepared from production source `15216f3e68923ed81fbe8722312ee8656217f2a4`, identical to comparison-head tree `161ca60763120c0a1c1c2bda17feffafce9d6455`. The frozen source directory is not modified. This candidate uses additive migration 0012 after the live communications and shared-page migrations.

This pass delivers durable in-app activity and guided installation/help. Device push remains disabled. No VAPID keys, credentials, browser subscriptions, live push/email messages, schedule changes, or production test writes are part of this package. The existing hourly birthday schedule is unchanged. PWA icons, favicon, manifest identity, and service-worker caching policy remain unchanged.

## Installation guidance

Instructions were checked on 6 October 2026 against:
- Apple: https://support.apple.com/en-euro/guide/iphone/iph42ab2f3a7/ios
- Google: https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en

The iPhone/iPad guide accommodates both direct Share and Page Menu → Share, optional Open as Web App, and Edit Actions. Android copy accommodates the current Install and create shortcut → Install menu and older Add to home screen / Install app names.

Illustrations are explicitly labeled as a guide, not device screenshots. Platform hints select instructions only; actual browser capability controls whether the genuine install prompt can be offered. Prompt acceptance is reported as requested, never as proof of installation. The illustrated steps remain visible beside the real prompt and after dismissal or rejection. Embedded-browser hints recommend opening Safari/Chrome. No Web Share call substitutes for browser installation. Adding the app does not request notification permission.

## Optional guide

Four short topics cover Home, Messages, Notifications, and You. Help is accessible in You and the profile menu, separate from mandatory sign-in, enrollment, approval, and profile completion. It never opens automatically or performs a content write. Members can skip, resume, replay, or restart. Progress uses versioned per-account local storage and degrades safely when storage is unavailable; it does not contain private content. Same-account drafts remain under the existing data adapter boundary.

## Visual and accessibility scope

New surfaces reuse the approved Glass/Flat materials, shared choice controls, palette tokens, and OS font stack. The guide has no required motion, supports reduced motion, keyboard controls, normal sheet focus handling, and narrow-screen wrapping. The unrelated visual change is limited to the authorized disabled shared-page Save-label contrast fix; active Save styling is preserved.

## Verification boundaries

The hosted-only help fixture covers 320/768 widths, Glass/Flat × light/dark, illustrated instructions beside a genuine-shaped fake prompt, dismissal and failure, installed event, tutorial account isolation, resume, reset, Escape, navigation, and preserved local draft text. It uses no live user data and blocks all external requests/writes.

No local browser engine was launched. Browser screenshots and visual acceptance are pending the parent-run hosted workflow. A desktop browser fixture does not validate physical iPhone/Android installation, VoiceOver/TalkBack, OS permission handling, or cross-device push. Those remain explicit unrun hardware gates.

## Publication, migration, and postflight

The source-only publication payload excludes generated `dist/react-app.js`, `dist/react-app.css`, `dist/index.html`, and `dist/build.json`. Preserve those four rebuilt assets as a separate immutable release package. Source admission/commit, hosted CI, review, database migration, and Worker publication remain parent-controlled gates; passing local tests is not permission to skip them.

1. Admit the exact source delta against comparison head `161ca60763120c0a1c1c2bda17feffafce9d6455`, then bind CI and review to that immutable new head. Rebuild assets and API from that head and verify their recorded hashes.
2. Record the current Worker deployment/version and database recovery bookmark or supported backup. Confirm migrations 0010 and 0011 are already applied and record that 0012 is absent. Keep the previous app asset/API package intact.
3. Apply additive `backend/migrations/0012_notifications.sql` once through the supported migration workflow. Do not replay it as a generic SQL file after success. Verify the migration ledger, new tables/indexes/triggers, and added columns with read-only schema inspection. Migration does not backfill events or external deliveries.
4. Publish the matching Worker and versioned frontend assets. Keep all push/email delivery activation and cron/resource configuration unchanged. Verify deployment receipt, build metadata, and immutable package hashes agree.
5. Postflight uses read-only authenticated requests under an already-authorized account: verify `/api/state`, `/api/notifications?limit=1`, and `/api/me/notifications` return the same authenticated identity, valid settings, and consistent unread/count fields without leaking private records. Do not create fake production notices, posts, reactions, invitations, messages, or payment records to test the rollout. Use the hosted isolated fixture evidence for mutations.
6. Confirm no credential/subscription/delivery resources or cron changes were introduced; check the existing birthday schedule remains as before. Observe ordinary errors and migration/runtime health through already-authorized tooling. Real installation, notification permission, push subscription, and external delivery tests remain separately authorized physical-device work.

## Rollback

Restore the captured previous Worker and app assets if the new version is unhealthy, retaining the database schema and notification history. Do not drop notification tables, strip added columns, delete receipts, or erase read/dismiss/preference data. Domain notification triggers intentionally remain active after a code rollback, and compatibility suppression avoids duplicate legacy fanout. The previous UI has narrower typed-notification display capability; inspect the backend compatibility notes and current release review before selecting a rollback target. A database restore is a distinct recovery decision, not the routine code rollback path.

Device push is disabled throughout this release. No claim is made that adding the app guarantees browser push support or enables notifications.
