// Isolated, reset-on-restart shared-page fixture. Never imported by the Worker.
process.env.GW_FIXTURE_PORT = '4176';
await import('./fixture-server.mjs');
