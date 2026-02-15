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

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, corsHeaders);
    }

    if (!originAllowed) {
      return json({ ok: false, error: 'Origin not allowed' }, 403, corsHeaders);
    }

    if (url.pathname === '/api/contact') {
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

    if (url.pathname === '/api/checkout-session') {
      let data;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
      }

      const setupDate = (data.setupDate || '').toString().trim();
      const setupTime = (data.setupTime || '').toString().trim();
      const customerEmail = (data.email || '').toString().trim();
      const customerName = (data.name || '').toString().trim();

      if (!setupDate || !setupTime) {
        return json({ ok: false, error: 'Missing setup date/time' }, 400, corsHeaders);
      }

      if (!env.STRIPE_SECRET_KEY) {
        return json({ ok: false, error: 'Stripe not configured' }, 500, corsHeaders);
      }

      const siteOrigin = originAllowed ? origin : (allowedOrigins[0] || 'https://easternshore.ai');
      const body = new URLSearchParams({
        mode: 'payment',
        success_url: `${siteOrigin}/openclaw-setup.html?paid=1`,
        cancel_url: `${siteOrigin}/openclaw-setup.html?canceled=1`,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': '10000',
        'line_items[0][price_data][product_data][name]': 'OpenClaw Setup',
        'line_items[0][quantity]': '1',
        'metadata[setup_date]': setupDate,
        'metadata[setup_time]': setupTime,
        'metadata[customer_name]': customerName || '(not provided)',
        'payment_intent_data[metadata][setup_date]': setupDate,
        'payment_intent_data[metadata][setup_time]': setupTime,
      });

      if (customerEmail) body.set('customer_email', customerEmail);

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      const stripeData = await stripeRes.json();
      if (!stripeRes.ok) {
        return json({ ok: false, error: 'Stripe session failed', detail: stripeData }, 502, corsHeaders);
      }

      return json({ ok: true, checkoutUrl: stripeData.url, id: stripeData.id }, 200, corsHeaders);
    }

    return json({ ok: false, error: 'Not found' }, 404, corsHeaders);
  }
};

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}
