export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || '*')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    const allowAll = allowedOrigins.includes('*');
    const originAllowed = allowAll || allowedOrigins.includes(origin);

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowAll ? '*' : (originAllowed ? origin : allowedOrigins[0] || ''),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/contact') {
      return json({ ok: false, error: 'Not found' }, 404, corsHeaders);
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, corsHeaders);
    }

    if (!originAllowed) {
      return json({ ok: false, error: 'Origin not allowed' }, 403, corsHeaders);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    }

    const mode = (data.mode || 'contact').toString();
    const name = (data.name || '').toString().trim();
    const email = (data.email || '').toString().trim();
    const offer = (data.offer || '').toString().trim();
    const message = (data.message || '').toString().trim();
    const website = (data.website || '').toString().trim(); // honeypot

    if (website) {
      return json({ ok: true }, 200, corsHeaders);
    }

    if (!name || !email) {
      return json({ ok: false, error: 'Missing required fields' }, 400, corsHeaders);
    }

    const subject = mode === 'offer'
      ? `Domain Offer: easternshoreai.com (${offer || 'no amount'})`
      : 'General Inquiry: Eastern Shore AI';

    const text = [
      `Mode: ${mode}`,
      `Name: ${name}`,
      `Email: ${email}`,
      `Offer/Budget: ${offer || '(not provided)'}`,
      '',
      'Message:',
      message || '(none)'
    ].join('\n');

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [env.TO_EMAIL],
        subject,
        text,
        reply_to: email
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return json({ ok: false, error: 'Email provider failed', detail: errText }, 502, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  }
};

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}
