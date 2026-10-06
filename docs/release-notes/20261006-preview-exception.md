# Preview release exception and follow-up

The owner explicitly requested releasing the earlier correction batch while
moving the Safari memory reload defect and the latest UI tweaks to a hotfix.

Authorization, 2026-10-06 UTC:
- 03:29:02: “well i don't wanna wait for that just ship that and fix that in the next roll around, the communications pass”
- 03:29:30: “roll those ui tweaks into communications too”
- 03:30:08: “actually just deploy those fixes in a hot fix and THEN communications”
- 03:30:26: “yep” to the clarified sequence: earlier batch, UI/Safari hotfix, communications.

Known defect GW-WEBKIT-MEMORY-RELOAD: image upload, private-image decode and one-time
transient retry succeed, but same-tab reload from Memories hangs/crashes the
hosted WebKit renderer after an HTTP 200 navigation response. Production Safari
impact is not yet established. Do not describe this as a fully passing Safari release.

All backend privacy/auth tests, full Chromium integration and WebKit recovery
and other live flows remain blocking. Only this exact reload scenario is
quarantined. WebKit still must verify uploaded memory persistence using a fresh
signed-in page; Chromium must still pass the original same-tab reload. A separate
visible non-blocking reproduction runs in CI and remains tracked for the hotfix.
No security, repository protection, credential, or approval gate is changed.

Latest menu-row/highlight, black photo-caption gradient, and tablet/desktop
FAB adjacency changes are preserved in commit 1074d49c1d36439403341a9647789349c1ea1aae
for the subsequent hotfix, not this preview release. Cache/version-delivery changes
remain in the earlier batch. Preserve the prior Cloudflare version for rollback;
new database migrations are additive and must not expose existing private data.
