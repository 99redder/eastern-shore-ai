import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { handleSupportAlerts } from '../src/support-alerts.js';

const token = 'test-only-not-a-real-support-credential';
const request = (value, path = '/api/chat/alerts', options = {}) => new Request(`https://worker.example${path}`, {
  ...options, headers: { ...(value ? { 'X-Support-Notify-Token': value } : {}), ...options.headers }
});

test('unconfigured, missing and wrong credentials fail before reading D1', async () => {
  const DB = { prepare() { throw Error('D1 must not be reached'); } };
  assert.equal((await handleSupportAlerts(request(token), { DB }, {})).status, 503);
  for (const provided of [undefined, 'wrong', 'x'.repeat(257)]) {
    assert.equal((await handleSupportAlerts(request(provided), { SUPPORT_NOTIFY_TOKEN: token, DB }, {})).status, 401);
  }
});

test('valid notifier request is uncached and uses one read query', async () => {
  let calls = 0;
  const sessions = [{ id: 42, page: 'Survival Node', customer_name: 'Test', escalated_at: '2026-09-12T12:00:00Z' }];
  const DB = { prepare(query) {
    calls++;
    assert.match(query, /NOT EXISTS/);
    return { async all() { return { results: sessions }; } };
  } };
  const response = await worker.fetch(request(token), { SUPPORT_NOTIFY_TOKEN: token, DB });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).sessions, sessions);
  assert.equal(calls, 1);
});

test('notifier credential cannot access admin reads, writes, or browser origins', async () => {
  const env = { SUPPORT_NOTIFY_TOKEN: token, ADMIN_PASSWORD: 'different-admin-password', DB: {} };
  assert.equal((await worker.fetch(request(token, '/api/chat/sessions'), env)).status, 401);
  assert.equal((await worker.fetch(request(token, '/api/chat/session/close', { method: 'POST', body: '{"sessionId":42}' }), env)).status, 401);
  assert.equal((await worker.fetch(request(token, '/api/chat/alerts', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(request(token, '/api/chat/alerts', { headers: { Origin: 'https://untrusted.example' } }), env)).status, 403);
});

test('database failure returns a visible error, not an empty successful queue', async () => {
  const response = await handleSupportAlerts(request(token), {
    SUPPORT_NOTIFY_TOKEN: token, DB: { prepare() { throw Error('unavailable'); } }
  }, {});
  assert.equal(response.status, 500);
  assert.equal((await response.json()).ok, false);
});
