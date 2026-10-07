// Isolated in-memory hosted fixture; no production data, email, or configuration.
process.env.GW_FIXTURE_PORT='4177';
process.env.GW_INVITATION_FIXTURE='1';
await import('./fixture-server.mjs');
