# grnwht

Preserve Lauren's approved Green & White visual direction and all features/panels. Improve information hierarchy and guided interactions, not by deleting scope. Mobile and tablet first; tablet doubles as desktop. Planner tools live under You and production permissions must be checked server-side.

Work through Relay ownership/admission and exact-head checks. No workers unless Lauren explicitly authorizes them. Never commit credentials or activate payment destinations from sample values. Keep rollback paths.

Every editable feature needs isolated, clearly labeled, resettable test data. Preview content must never trigger actual payments, notifications, email or external writes. Sample photos cannot be represented as actual family members.

Run npm run build and npm test. Browser and device checks are additional gates, never implied by static tests. This repository starts as a visual prototype; production auth, persistence, uploads, contribution reconciliation, and installability remain unfinished.

Standing development invariant: family content and uploads must never disrupt
development or deterministic tests. Automated mutation tests use loopback fixture
servers, fictional identities and isolated in-memory D1/test R2 storage. Run the
test environment guard; never disable it or point fixtures at production origin,
database or media bucket. Production smoke is read-only and tolerates concurrent
posts/uploads without asserting live record counts, ordering or fixed asset sets.

Code build identity hashes source-built JS/CSS only. Content/media revisions do
not invalidate source acceptance or restart a release. Backup the current media
inventory without a historical fixed-count assumption. Explicit release tooling
may run authorized migrations and brief maintenance outside the test guard;
restore normal service promptly. Code rollback keeps current D1/R2 content and
layouts; never restore an older data snapshot over newer family writes merely to
roll back code. Keep release and test execution paths separate.
