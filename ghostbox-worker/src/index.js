function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

function buildCorsHeaders(origin, allowedOrigin) {
  const allowOrigin = allowedOrigin === '*' ? '*' : (origin || allowedOrigin || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = (env.ALLOWED_ORIGIN || 'https://www.easternshore.ai').trim();
    const corsHeaders = buildCorsHeaders(origin, allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'ghostbox-checkout-api' }, 200, corsHeaders);
    }

    const isCheckoutPath = (url.pathname === '/api/ghostbox-checkout' || url.pathname === '/api/zombie-bag-checkout');
    if (!isCheckoutPath || request.method !== 'POST') {
      return json({ ok: false, error: 'Not found' }, 404, corsHeaders);
    }

    if (!env.STRIPE_SECRET_KEY) {
      return json({ ok: false, error: 'Stripe not configured' }, 500, corsHeaders);
    }

    let data = {};
    try {
      data = await request.json();
    } catch {
      data = {};
    }

    const checkoutType = (data.checkoutType || 'base_kit').toString().trim().toLowerCase();
    const isByogSetup = checkoutType === 'byog_setup';
    const termsAccepted = data.termsAccepted === true;

    if (!termsAccepted) {
      return json({ ok: false, error: 'You must read and accept the Terms of Sale before checkout.' }, 400, corsHeaders);
    }

    const contiguousStates = new Set([
      'AL','AZ','AR','CA','CO','CT','DE','FL','GA','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
    ]);
    const requestedState = (data.shippingState || '').toString().trim().toUpperCase();
    if (!contiguousStates.has(requestedState)) {
      return json({ ok: false, error: 'Checkout is only available for shipping addresses in the continental United States.' }, 400, corsHeaders);
    }

    const siteOrigin = allowedOrigin || 'https://www.easternshore.ai';
    const successUrl = `${siteOrigin}/node.html?paid=1`;
    const cancelUrl = `${siteOrigin}/node-payment-cancelled.html`;

    const unitAmount = isByogSetup ? '6999' : '19999';
    const productName = isByogSetup
      ? 'Survival Node BYOG Setup-Only Service'
      : 'Survival Node';
    const productDescription = isByogSetup
      ? 'Bring your own gear setup-only service'
      : 'OnePlus 8 5G (8GB RAM, Snapdragon 865) + 42,800mAh Solar Power Hub + weatherproof hard case + padlock + phone case + 2 Faraday bags + 50GB Offline Brain Software';
    const productCode = isByogSetup ? 'survival_node_byog_setup' : 'survival_node_kit';

    const body = new URLSearchParams({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: 'required',
      'automatic_tax[enabled]': 'true',
      'shipping_address_collection[allowed_countries][0]': 'US',
      'line_items[0][quantity]': '1',
      'metadata[product]': productCode,
      'metadata[unit_price_cents]': unitAmount,
      'metadata[checkout_type]': checkoutType,
      'metadata[shipping_state_requested]': requestedState,
      'custom_text[shipping_address][message]': 'Shipping is limited to the continental U.S. Free shipping included.'
    });

    body.set('line_items[0][price_data][currency]', 'usd');
    body.set('line_items[0][price_data][unit_amount]', unitAmount);
    body.set('line_items[0][price_data][product_data][name]', productName);
    body.set('line_items[0][price_data][product_data][description]', productDescription);

    const ALLOWED_UPGRADE_PRICE_IDS = new Set([
      'price_1T9AXyCrQuKPknEPEDC39wfC', // Mission Essential Faraday Bags
      'price_1T9AYeCrQuKPknEPy37kFtwn', // Premium Backup Charging Cable
      'price_1T9AZeCrQuKPknEP62dDoshW', // Backup Mini Solar Battery
    ]);
    const upgrades = Array.isArray(data.upgrades) ? data.upgrades : [];
    let lineIdx = 1;
    for (const upgrade of upgrades) {
      const priceId = (upgrade.priceId || '').toString().trim();
      if (!ALLOWED_UPGRADE_PRICE_IDS.has(priceId)) continue;
      body.set(`line_items[${lineIdx}][price]`, priceId);
      body.set(`line_items[${lineIdx}][quantity]`, '1');
      lineIdx++;
    }

    body.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    body.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', '0');
    body.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd');
    body.set('shipping_options[0][shipping_rate_data][display_name]', 'Free Shipping (Continental U.S.)');
    body.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day');
    body.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]', '7');
    body.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day');
    body.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]', '14');

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const stripeData = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok || !stripeData?.url || !stripeData?.id) {
      return json({ ok: false, error: 'Stripe session failed', detail: stripeData }, 502, corsHeaders);
    }

    return json({ ok: true, checkoutUrl: stripeData.url, id: stripeData.id }, 200, corsHeaders);
  }
};
