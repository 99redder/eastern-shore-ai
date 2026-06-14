function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

function buildCorsHeaders(origin, allowedOrigin) {
  const allowOrigin = allowedOrigin === '*' ? '*' : (allowedOrigin || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

const SURVIVAL_NODE_UPGRADES = [
  {
    id: 'mission-darkness-faraday',
    label: 'Mission Darkness Faraday Bags',
    amountCents: 5000,
    priceId: 'price_1T9AXyCrQuKPknEPEDC39wfC'
  }
];
const SURVIVAL_NODE_UPGRADES_BY_ID = new Map(SURVIVAL_NODE_UPGRADES.map(product => [product.id, product]));

function publicSurvivalNodeProducts() {
  return SURVIVAL_NODE_UPGRADES.map(({ id, label, amountCents }) => ({ id, label, amountCents }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const configuredOrigins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    const allowedOrigins = [...new Set([
      ...configuredOrigins,
      'https://www.easternshore.ai',
      'https://easternshore.ai'
    ])];
    const allowAll = allowedOrigins.includes('*');
    const originAllowed = allowAll || !origin || allowedOrigins.includes(origin);
    const allowedOrigin = allowAll ? '*' : (originAllowed ? origin : allowedOrigins[0] || 'https://www.easternshore.ai');
    const corsHeaders = buildCorsHeaders(origin, allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: originAllowed ? 204 : 403, headers: corsHeaders });
    }

    if (!originAllowed) {
      return json({ ok: false, error: 'Origin not allowed' }, 403, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'survival-node-checkout-api' }, 200, corsHeaders);
    }

    if (request.method === 'GET' && url.pathname === '/api/products') {
      return json({ ok: true, products: publicSurvivalNodeProducts() }, 200, corsHeaders);
    }

    const isCheckoutPath = url.pathname === '/api/survival-node-checkout';
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

    const requestedCheckoutType = (data.checkoutType || 'base_kit').toString().trim().toLowerCase();
    const checkoutType = ['base_kit', 'byog_setup'].includes(requestedCheckoutType) ? requestedCheckoutType : 'base_kit';
    const isByogSetup = checkoutType === 'byog_setup';
    const termsAccepted = data.termsAccepted === true;

    if (!termsAccepted) {
      return json({ ok: false, error: 'You must read and accept the Terms of Sale before checkout.' }, 400, corsHeaders);
    }

    // Terms acknowledgment metadata (CONUS state enforcement is done at the webhook
    // layer — Stripe Checkout doesn't natively filter shipping rates by state).
    const termsVersion = (data.termsVersion || '').toString().trim().slice(0, 32);
    const termsAcceptedAt = (data.termsAcceptedAt || '').toString().trim().slice(0, 64);
    const termsUrl = (data.termsUrl || '').toString().trim().slice(0, 200);

    const siteOrigin = allowedOrigin || 'https://www.easternshore.ai';
    // {CHECKOUT_SESSION_ID} is a Stripe Checkout placeholder substituted by Stripe
    // before redirect; the client uses it as the Reddit Pixel transactionId.
    const successUrl = `${siteOrigin}/node.html?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteOrigin}/node-payment-cancelled.html`;

    const unitAmount = isByogSetup ? '6999' : '19999';
    const productName = isByogSetup
      ? 'Survival Node BYOG Setup-Only Service'
      : 'Survival Node';
    const productDescription = isByogSetup
      ? 'Bring your own gear setup-only service'
      : 'Motorola Moto G Power (2024) + 42,800mAh Solar Power Hub + weatherproof hard case + padlock + phone case + 2 Faraday bags + 50GB Offline Brain Software';
    const productCode = isByogSetup ? 'survival_node_byog_setup' : 'survival_node_kit';

    const body = new URLSearchParams({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: 'required',
      'phone_number_collection[enabled]': 'true',
      allow_promotion_codes: 'true',
      'automatic_tax[enabled]': 'true',
      'shipping_address_collection[allowed_countries][0]': 'US',
      'line_items[0][quantity]': '1',
      'metadata[product]': productCode,
      'metadata[unit_price_cents]': unitAmount,
      'metadata[checkout_type]': checkoutType,
      'custom_text[shipping_address][message]': 'Shipping is limited to the 48 continental U.S. states. Orders to AK, HI, U.S. territories, or international addresses will be canceled and refunded.'
    });

    if (termsVersion)    body.set('metadata[terms_version]', termsVersion);
    if (termsAcceptedAt) body.set('metadata[terms_accepted_at]', termsAcceptedAt);
    if (termsUrl)        body.set('metadata[terms_url]', termsUrl);

    body.set('line_items[0][price_data][currency]', 'usd');
    body.set('line_items[0][price_data][unit_amount]', unitAmount);
    body.set('line_items[0][price_data][product_data][name]', productName);
    body.set('line_items[0][price_data][product_data][description]', productDescription);
    body.set('line_items[0][price_data][product_data][tax_code]', 'txcd_99999999');

    const upgrades = Array.isArray(data.upgrades) ? data.upgrades : [];
    const seenUpgradeIds = new Set();
    let lineIdx = 1;
    for (const upgrade of upgrades) {
      const upgradeId = (upgrade.id || '').toString().trim();
      const product = SURVIVAL_NODE_UPGRADES_BY_ID.get(upgradeId);
      if (!product) {
        return json({ ok: false, error: 'Invalid upgrade selected.' }, 400, corsHeaders);
      }
      if (seenUpgradeIds.has(upgradeId)) continue;
      seenUpgradeIds.add(upgradeId);
      body.set(`line_items[${lineIdx}][price]`, product.priceId);
      body.set(`line_items[${lineIdx}][quantity]`, '1');
      lineIdx++;
    }

    body.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    body.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', '0');
    body.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd');
    body.set('shipping_options[0][shipping_rate_data][display_name]', 'Free Shipping (Continental U.S.)');
    // Estimate shown to buyer at Stripe Checkout = order-to-delivery business days.
    // Standard policy: processing up to 7 (avg 1-2) + ground transit up to 10
    // (avg 5-7). Min reflects the fast end (1 + 5), max reflects the worst case (7 + 10).
    body.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day');
    body.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]', '6');
    body.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day');
    body.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]', '17');

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
