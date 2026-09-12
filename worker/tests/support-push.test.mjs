import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { validatePushSubscription } from '../src/support-push.js';

const validSubscription = {
  endpoint: 'https://push.example.test/send/abc123',
  expirationTime: null,
  keys: {
    p256dh: 'B'.repeat(87),
    auth: 'A'.repeat(22)
  }
};

test('push subscription validation accepts browser-shaped credentials and rejects unsafe values', () => {
  const parsed = validatePushSubscription(validSubscription);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.subscription.endpoint, validSubscription.endpoint);
  assert.equal(validatePushSubscription({ ...validSubscription, endpoint: 'http://push.example.test/send' }).ok, false);
  assert.equal(validatePushSubscription({ ...validSubscription, keys: { ...validSubscription.keys, auth: 'not valid!' } }).ok, false);
});

test('public push config exposes only the VAPID public key', async () => {
  const response = await worker.fetch(
    new Request('https://worker.example/api/chat/push-config'),
    {
      VAPID_SUBJECT: 'mailto:test@example.com',
      VAPID_SERVER_PUBLIC_KEY: 'public-key',
      VAPID_SERVER_PRIVATE_KEY: 'private-key'
    }
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, configured: true, publicKey: 'public-key' });
});

test('push enrollment requires admin authentication before reading D1', async () => {
  const DB = { prepare() { throw new Error('D1 must not be reached'); } };
  const response = await worker.fetch(
    new Request('https://worker.example/api/chat/push-subscribe', {
      method: 'POST',
      body: JSON.stringify(validSubscription),
      headers: { 'Content-Type': 'application/json' }
    }),
    {
      ADMIN_PASSWORD: 'test-admin',
      VAPID_SUBJECT: 'mailto:test@example.com',
      VAPID_SERVER_PUBLIC_KEY: 'public-key',
      VAPID_SERVER_PRIVATE_KEY: 'private-key',
      DB
    }
  );
  assert.equal(response.status, 401);
});

