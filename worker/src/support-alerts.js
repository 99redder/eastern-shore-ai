// A dedicated read-only credential for the Mac notifier. Never returns chat
// tokens, transcripts, emails, or credentials that can be used to send messages.
export async function handleSupportAlerts(request, env, corsHeaders) {
  const reply = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
  const expected = String(env.SUPPORT_NOTIFY_TOKEN || '').trim();
  const provided = String(request.headers.get('X-Support-Notify-Token') || '').trim();
  if (!expected) return reply({ ok: false, error: 'Support notifier is not configured' }, 503);
  if (!provided || provided.length > 256) return reply({ ok: false, error: 'Unauthorized' }, 401);

  const encoder = new TextEncoder();
  const hashes = await Promise.all([provided, expected].map(value =>
    crypto.subtle.digest('SHA-256', encoder.encode(value))
  ));
  const left = new Uint8Array(hashes[0]);
  const right = new Uint8Array(hashes[1]);
  let different = 0;
  for (let i = 0; i < left.length; i++) different |= left[i] ^ right[i];
  if (different) return reply({ ok: false, error: 'Unauthorized' }, 401);
  if (!env.DB) return reply({ ok: false, error: 'DB binding missing' }, 500);

  try {
    // A first staff reply or closing the chat resolves a request. Polling this
    // single indexed query avoids reading every conversation every ten seconds.
    const { results } = await env.DB.prepare(`
      SELECT s.id, s.page, s.customer_name, s.escalated_at
      FROM chat_sessions s
      LEFT JOIN support_push_state ps ON ps.session_id = s.id
      WHERE s.status = 'active'
        AND ps.acknowledged_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM chat_messages m WHERE m.session_id = s.id AND m.role = 'staff'
        )
      ORDER BY s.id DESC
      LIMIT 100
    `).all();
    return reply({ ok: true, sessions: results, checkedAt: new Date().toISOString() });
  } catch {
    return reply({ ok: false, error: 'Unable to check support requests' }, 500);
  }
}
