// Isolated, reset-on-start, in-memory harness for hosted communications QA.
// Reuse the authenticated fixture API rather than duplicating production routes.
// Run this in a separate process from the existing live-browser fixture.
process.env.GW_FIXTURE_PORT ||= '4175';
await import('./fixture-server.mjs');
