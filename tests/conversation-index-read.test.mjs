import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationIndexReads} from '../src/messaging-model.js';
import {documentReadLifecycle} from '../src/document-read-lifecycle.js';

test('unload cancels a queued conversation poll before the transport starts', async () => {
  const win = new EventTarget(), doc = new EventTarget();
  doc.visibilityState = 'visible';
  const lifecycle = documentReadLifecycle(win, doc), reads = conversationIndexReads();
  const unsubscribe = lifecycle.subscribe({pause: reads.cancel});
  let requests = 0, deliveries = 0;
  const poll = () => lifecycle.canRead() && reads.run('account', async () => {
    requests++; return {conversations: []};
  }, () => deliveries++, () => deliveries++);
  const queued = poll();
  win.dispatchEvent(new Event('beforeunload'));
  await queued;
  assert.equal(poll(), false);
  assert.equal(requests, 0);
  assert.equal(deliveries, 0);
  win.dispatchEvent(new Event('pagehide'));
  win.dispatchEvent(new Event('focus'));
  assert.equal(poll(), false);
  win.dispatchEvent(new Event('pageshow'));
  await poll();
  assert.equal(requests, 1);
  assert.equal(deliveries, 1);
  unsubscribe(); lifecycle.dispose();
});
