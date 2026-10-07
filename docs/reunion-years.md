# Reunion years and payment methods

## Storage and boundaries

- `reunions` owns immutable IDs, optional legacy year, planned/active/archived status. A partial unique index permits only one active row. Lifecycle batches keep exactly one active row and compare the previously active identity before switching.
- The migrated `legacy` reunion maps explicitly to the existing `reunion_settings.id='current'`. Its JSON and notification revision are not copied or reset. This avoids the existing settings INSERT trigger broadcasting a duplicate reunion notice during migration.
- Every existing product, shirt claim and fee report gets `reunion_id='legacy'`. `reunion_rsvps` copies existing RSVP rows into a compound year/member key. Original `rsvps` rows remain intact.
- Missing legacy dates produce a NULL year labelled Existing reunion. A planner explicitly chooses its year. Valid existing date years in 1900–2200 are used; no current year is guessed.
- New planned years start empty. Dates, calendar, catalog, RSVP, bag, orders, payment methods and reports never inherit from another year. Annual/biennial/irregular is a planning preference, not an automatic scheduler.
- Read APIs accept `reunionId`; omitted read scope chooses the active year. Scoped writes carry the selected ID in their idempotency fingerprint. Older clients omitting the write ID target only legacy, never a newly active year.
- Mutations of archived reunions fail closed. A transaction guard rechecks archive/year state before committing, so archiving during a save rolls back the data write, audit and receipt.
- Fee/order notification open responses resolve the resource’s year on the server. The client refreshes that year before following the destination. Old `current` reunion notices resolve to legacy.

## Payments

One shared display serves member Fees and leader payment settings. It supports amount, general instructions, Cash App, PayPal, Venmo, Zelle and named other methods, recipient handle/name, secure profile link and method instructions. Cash App/PayPal/Venmo links are restricted to their supported domains; URL credentials, insecure links, query parameters and fragments are rejected. Invalid persisted links are rendered as text, never executable links.

Only the existing treasurer capability can save recipients in the live backend. Planners may read the settings without gaining treasury permissions. This feature creates no payment account, accepts no authentication credentials, transfers no money and never marks an opened link as a confirmed receipt. Preview links are inert, and archived destinations are reference-only.

## Release and rollback gate

This packet has not been published, migrated or deployed. No real recipient was changed.

Before rollout: verify target database; take a recoverable D1 backup/export; apply the exact additive migration once; verify legacy settings/RSVP/order/fee counts and notification event counts against the backup; run the full canonical migration suite and protected-route suite; deploy backend and frontend together. Keep writes closed during a mixed-version rollout. New runtime requires migration 0017. Auth/push activation is not part of this change.

Do not blindly roll back to an unscoped pre-year runtime after new-year writes: it would read all products/orders/fees together. Keep the additive tables/columns on runtime rollback, and use a migration-aware rollback build that selects legacy explicitly. If restoring the pre-migration database is necessary, first export all post-migration year rows and receipt/audit records so no new records are lost; test reimport separately. No DROP TABLE/DROP COLUMN rollback is supplied. The original current-settings row and original RSVP table provide an intact legacy reference, not a substitute for a backup.

Preview rollback: Reset local preview clears all added years and their rehearsal records and restores one empty legacy reunion. Live bag snapshots are in-memory and keyed by account and reunion; they are never sent during a read/switch.

## Verification

The supplied core SQLite suite uses canonical migrations 0001–0005 plus the command receipt columns to exercise actual service/lifecycle/calendar SQL. It verifies additive legacy retention, no migration notification fanout, independent years, one active year, treasury/member/row scope, replay isolation and a commit-time archive race. It is intentionally not a full migration-chain substitute. `backend/tests/reunion-years.test.mjs` covers full familyState and canonical migration-chain checks, migration notification fanout counts, and a local SQLite backup/restore rehearsal preserving a separate post-migration recovery snapshot. All 193 backend tests pass in the complete canonical schema tree.

User screenshot pixels were inspected. Calendar settings/events now register two native SharedPagePanels slots for independent main/sidebar placement and mobile order (requires the consolidated leader-calendar schema/tool-bar integration); Merchandise Orders heading precedes its segmented controls. Browser/server launch was restricted, so interaction, keyboard, responsive screenshot and Cloudflare runtime acceptance gates remain unrun.
