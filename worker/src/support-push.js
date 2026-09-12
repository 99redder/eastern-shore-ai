import { buildPushPayload } from '@block65/webcrypto-web-push';

const MAX_ENDPOINT_LENGTH = 2048;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function hasPushConfig(env) {
  return Boolean(
    String(env?.VAPID_SUBJECT || '').trim()
    && String(env?.VAPID_SERVER_PUBLIC_KEY || '').trim()
    && String(env?.VAPID_SERVER_PRIVATE_KEY || '').trim()
  );
}

function isValidBase64Url(value, minLength, maxLength) {
  return typeof value === 'string'
    && value.length >= minLength
    && value.length <= maxLength
    && BASE64URL_RE.test(value);
}

export function validatePushSubscription(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Missing push subscription' };
  const endpoint = String(input.endpoint || '').trim();
  const keys = input.keys && typeof input.keys === 'object' ? input.keys : {};
  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH || !/^https:\/\//i.test(endpoint)) {
    return { ok: false, error: 'Invalid push endpoint' };
  }
  if (!isValidBase64Url(keys.p256dh, 40, 160) || !isValidBase64Url(keys.auth, 12, 80)) {
    return { ok: false, error: 'Invalid push encryption keys' };
  }
  const expirationTime = input.expirationTime == null ? null : String(input.expirationTime).slice(0, 40);
  const label = input.label == null ? null : String(input.label).trim().slice(0, 80) || null;
  return {
    ok: true,
    subscription: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      expirationTime,
      label
    }
  };
}

function getVapidKeys(env) {
  return {
    subject: String(env.VAPID_SUBJECT || '').trim(),
    publicKey: String(env.VAPID_SERVER_PUBLIC_KEY || '').trim(),
    privateKey: String(env.VAPID_SERVER_PRIVATE_KEY || '').trim()
  };
}

function pushPayloadForSession(session, reminderCount = 0) {
  const sessionId = Number(session.id);
  return {
    type: 'support-request',
    sessionId,
    reminderCount,
    title: 'Customer needs help',
    body: 'A Survival Node customer is waiting for support. Tap to open the chat.',
    url: `/support-chat.html#session=${sessionId}`
  };
}

async function sendToSubscription(env, row, payload) {
  const vapid = getVapidKeys(env);
  const subscription = {
    endpoint: row.endpoint,
    expirationTime: row.expiration_time || null,
    keys: { p256dh: row.p256dh, auth: row.auth }
  };
  const request = await buildPushPayload({
    data: payload,
    options: { ttl: 120, urgency: 'high' }
  }, subscription, vapid);
  return fetch(subscription.endpoint, request);
}

async function getActiveSubscriptions(env) {
  if (!env?.DB) return [];
  const result = await env.DB.prepare(
    `SELECT id, endpoint, p256dh, auth, expiration_time
     FROM support_push_subscriptions WHERE active = 1`
  ).all();
  return result.results || [];
}

/**
 * Send a high-urgency push to every active operator subscription. The
 * subscription is disabled when its push service says it is gone (404/410).
 */
export async function notifySupportPushes(env, session, reminderCount = 0) {
  if (!hasPushConfig(env) || !env?.DB || !session?.id) return { sent: 0, failed: 0 };
  let rows;
  try {
    rows = await getActiveSubscriptions(env);
  } catch (error) {
    console.error('Unable to load support push subscriptions', error);
    return { sent: 0, failed: 0 };
  }
  if (!rows.length) return { sent: 0, failed: 0 };

  const payload = pushPayloadForSession(session, reminderCount);
  const now = Math.floor(Date.now() / 1000);
  let sent = 0;
  let failed = 0;
  await Promise.all(rows.map(async (row) => {
    try {
      const response = await sendToSubscription(env, row, payload);
      if (response.ok) {
        sent += 1;
        await env.DB.prepare(
          `UPDATE support_push_subscriptions SET last_success_at = ?1, updated_at = datetime('now') WHERE id = ?2`
        ).bind(now, row.id).run();
      } else {
        failed += 1;
        await env.DB.prepare(
          `UPDATE support_push_subscriptions
           SET active = CASE WHEN ?1 IN (404, 410) THEN 0 ELSE active END,
               last_failure_at = ?2, updated_at = datetime('now')
           WHERE id = ?3`
        ).bind(response.status, now, row.id).run();
      }
    } catch (error) {
      failed += 1;
      try {
        await env.DB.prepare(
          `UPDATE support_push_subscriptions SET last_failure_at = ?1, updated_at = datetime('now') WHERE id = ?2`
        ).bind(now, row.id).run();
      } catch {}
      console.error('Support push delivery failed', error);
    }
  }));

  if (sent > 0) {
    try {
      await env.DB.prepare(
        `INSERT INTO support_push_state (session_id, last_sent_at, reminder_count, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(session_id) DO UPDATE SET
           last_sent_at = excluded.last_sent_at,
           reminder_count = excluded.reminder_count,
           updated_at = datetime('now')`
      ).bind(session.id, now, reminderCount).run();
    } catch (error) {
      console.error('Unable to save support push state', error);
    }
  }
  return { sent, failed };
}

/**
 * Re-send active, unacknowledged requests every minute until a staff reply,
 * close, or explicit acknowledgement resolves them.
 */
export async function sendSupportPushReminders(env) {
  if (!hasPushConfig(env) || !env?.DB) return { sessions: 0, sent: 0 };
  const now = Math.floor(Date.now() / 1000);
  let result;
  try {
    result = await env.DB.prepare(
      `SELECT s.id, s.page, s.customer_name,
              COALESCE(ps.last_sent_at, 0) AS last_sent_at,
              COALESCE(ps.reminder_count, 0) AS reminder_count
       FROM chat_sessions s
       LEFT JOIN support_push_state ps ON ps.session_id = s.id
       WHERE s.status = 'active'
         AND ps.acknowledged_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM chat_messages m WHERE m.session_id = s.id AND m.role = 'staff'
         )
         AND (ps.last_sent_at IS NULL OR ps.last_sent_at <= ?1)
       ORDER BY s.id ASC
       LIMIT 100`
    ).bind(now - 45).all();
  } catch (error) {
    console.error('Unable to load support push reminders', error);
    return { sessions: 0, sent: 0 };
  }

  let sent = 0;
  for (const session of result.results || []) {
    const outcome = await notifySupportPushes(env, session, Number(session.reminder_count || 0) + 1);
    sent += outcome.sent;
  }
  return { sessions: (result.results || []).length, sent };
}

export async function enqueueSupportPushReminder(env, sessionId, delaySeconds = 60) {
  if (!env?.SUPPORT_PUSH_QUEUE || !Number.isSafeInteger(Number(sessionId))) return false;
  try {
    await env.SUPPORT_PUSH_QUEUE.send(
      { sessionId: Number(sessionId) },
      { delaySeconds: Math.max(0, Math.min(43200, Number(delaySeconds) || 60)) }
    );
    return true;
  } catch (error) {
    console.error('Unable to enqueue support push reminder', error);
    return false;
  }
}

export async function processSupportPushQueueMessage(env, message) {
  const sessionId = Number(message?.sessionId);
  if (!env?.DB || !Number.isSafeInteger(sessionId) || sessionId <= 0) return { retry: false, sent: 0 };
  let session;
  try {
    session = await env.DB.prepare(
      `SELECT s.id, s.page, s.customer_name,
              COALESCE(ps.reminder_count, 0) AS reminder_count
       FROM chat_sessions s
       LEFT JOIN support_push_state ps ON ps.session_id = s.id
       WHERE s.id = ?1
         AND s.status = 'active'
         AND ps.acknowledged_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM chat_messages m WHERE m.session_id = s.id AND m.role = 'staff'
         )`
    ).bind(sessionId).first();
  } catch (error) {
    console.error('Unable to load queued support push reminder', error);
    return { retry: true, sent: 0 };
  }
  if (!session) return { retry: false, sent: 0 };
  const outcome = await notifySupportPushes(env, session, Number(session.reminder_count || 0) + 1);
  return { retry: true, sent: outcome.sent };
}

export { hasPushConfig };
