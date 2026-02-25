// ===== ROUTE HANDLER INDEX =====
// POST /api/contact             → handleContact()        — Form submissions (domain offers, questions) + Resend email
// POST /api/checkout-session    → handleCheckoutSession() — Create Stripe checkout with conflict + past-time checks
// POST /api/zombie-bag-checkout → handleZombieBagCheckout() — Create Stripe checkout for Zombie Bag product sales
// POST /api/stripe-webhook      → handleStripeWebhook()   — Stripe payment confirmation, records booking in D1, auto-inserts tax income
// GET  /api/availability        → handleAvailability()    — Public unavailable slots + blocked dates
// GET  /api/bookings            → handleBookings()        — Admin: read bookings + blocked slots + blocked days
// POST /api/admin/block-slot    → handleAdminBlockSlot()  — Admin: block/unblock a specific 2-hour slot
// POST /api/admin/block-day     → handleAdminBlockDay()   — Admin: block/unblock an entire day
// GET  /api/tax/transactions    → handleTaxTransactions() — Admin: tax entries by year/type
// POST /api/tax/expense         → handleTaxExpense()      — Admin: add expense entry
// POST /api/tax/income          → handleTaxIncome()       — Admin: add income entry
// POST /api/tax/expense/update  → handleTaxExpenseUpdate() — Admin: edit expense entry
// POST /api/tax/income/update   → handleTaxIncomeUpdate()  — Admin: edit income entry
// POST /api/tax/expense/delete  → handleTaxExpenseDelete() — Admin: delete expense entry
// POST /api/tax/income/delete   → handleTaxIncomeDelete()  — Admin: delete income entry
// GET  /api/tax/export.csv      → handleTaxExportCsv()    — Admin: CSV export for selected year/type
// POST /api/tax/receipt/upload  → handleTaxReceiptUpload() — Admin: upload receipt to R2, attach to record
// GET  /api/tax/receipt         → handleTaxReceiptGet()   — Admin: retrieve receipt from R2
//
// ===== UTILITY FUNCTIONS =====
// requireAdmin(request, env)           — Validate X-Admin-Password header
// toCents(v)                           — Convert dollar string to integer cents
// csvEscape(s)                         — Escape string for CSV output
// verifyStripeSignature(payload, sig, secret) — HMAC-SHA256 Stripe webhook verification
// json(data, status, headers)          — Build JSON Response

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || '*')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    const allowAll = allowedOrigins.includes('*');
    // No Origin header = direct browser navigation (new tab link), not a cross-origin fetch — always allow.
    const originAllowed = allowAll || !origin || allowedOrigins.includes(origin);

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowAll ? '*' : (originAllowed ? origin : allowedOrigins[0] || ''),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Stripe webhook comes from Stripe servers (no browser Origin), so skip origin check there.
    if (url.pathname !== '/api/stripe-webhook') {
      const isBookingsRead = url.pathname === '/api/bookings' && request.method === 'GET';
      const isAvailabilityRead = url.pathname === '/api/availability' && request.method === 'GET';
      const isAdminBlockWrite = ['/api/admin/block-slot','/api/admin/block-day','/api/admin/bookings/cleanup-pending'].includes(url.pathname) && request.method === 'POST';
      const isTaxRead = ['/api/tax/transactions','/api/tax/export.csv','/api/tax/receipt'].includes(url.pathname) && request.method === 'GET';
      const isTaxWrite = ['/api/tax/expense','/api/tax/income','/api/tax/expense/update','/api/tax/income/update','/api/tax/expense/delete','/api/tax/income/delete','/api/tax/receipt/upload'].includes(url.pathname) && request.method === 'POST';
      const isPostRoute = ['/api/contact', '/api/checkout-session', '/api/zombie-bag-checkout'].includes(url.pathname) && request.method === 'POST';
      if (!isBookingsRead && !isAvailabilityRead && !isAdminBlockWrite && !isTaxRead && !isTaxWrite && !isPostRoute) {
        return json({ ok: false, error: 'Method not allowed' }, 405, corsHeaders);
      }

      if (!originAllowed) {
        return json({ ok: false, error: 'Origin not allowed' }, 403, corsHeaders);
      }
    }

    if (url.pathname === '/api/contact') {
      return handleContact(request, env, corsHeaders);
    }

    if (url.pathname === '/api/checkout-session') {
      return handleCheckoutSession(request, env, corsHeaders, originAllowed, allowedOrigins);
    }

    if (url.pathname === '/api/zombie-bag-checkout') {
      return handleZombieBagCheckout(request, env, corsHeaders, originAllowed, allowedOrigins);
    }

    if (url.pathname === '/api/stripe-webhook') {
      return handleStripeWebhook(request, env, corsHeaders);
    }

    if (url.pathname === '/api/bookings') {
      return handleBookings(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/availability') {
      return handleAvailability(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/admin/block-slot') {
      return handleAdminBlockSlot(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/admin/block-day') {
      return handleAdminBlockDay(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/admin/bookings/cleanup-pending') {
      return handleAdminCleanupPendingBookings(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/transactions') {
      return handleTaxTransactions(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/expense') {
      return handleTaxExpense(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/expense/update') {
      return handleTaxExpenseUpdate(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/expense/delete') {
      return handleTaxExpenseDelete(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/income') {
      return handleTaxIncome(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/income/update') {
      return handleTaxIncomeUpdate(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/income/delete') {
      return handleTaxIncomeDelete(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/export.csv') {
      return handleTaxExportCsv(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/receipt/upload') {
      return handleTaxReceiptUpload(request, env, corsHeaders, url);
    }

    if (url.pathname === '/api/tax/receipt') {
      return handleTaxReceiptGet(request, env, corsHeaders, url);
    }

    return json({ ok: false, error: 'Not found' }, 404, corsHeaders);
  }
};

/**
 * POST /api/contact — Process contact form submissions and send via Resend
 * @param {Request} request - JSON body: {name, email, message, mode, offer?, honey?}
 * @param {Object} env - Worker env (RESEND_API_KEY, TO_EMAIL, FROM_EMAIL)
 * @param {Object} corsHeaders
 * @returns {Response} {ok: true} or {ok: false, error: string}
 */
async function handleContact(request, env, corsHeaders) {
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

  const emailPayload = {
    from: env.FROM_EMAIL,
    to: [env.TO_EMAIL],
    subject,
    text,
    reply_to: email
  };

  if (env.CC_EMAIL) {
    emailPayload.cc = [env.CC_EMAIL];
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(emailPayload)
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    return json({ ok: false, error: 'Email provider failed', detail: errText }, 502, corsHeaders);
  }

  return json({ ok: true }, 200, corsHeaders);
}

/**
 * POST /api/checkout-session — Create Stripe checkout session with booking conflict + past-time checks
 * @param {Request} request - JSON body: {setupDate, setupTime, customerName, customerEmail, serviceType?}
 * @param {Object} env - Worker env (STRIPE_SECRET_KEY, DB)
 * @returns {Response} {ok: true, checkoutUrl, id} or error
 */
async function handleCheckoutSession(request, env, corsHeaders, originAllowed, allowedOrigins) {
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
  const requestedService = (data.service || 'openclaw_setup').toString().trim().toLowerCase();
  const customerPhone = (data.phone || '').toString().trim();
  const preferredContactMethod = (data.preferredContactMethod || 'email').toString().trim().toLowerCase();
  const lessonTopic = (data.lessonTopic || '').toString().trim();
  const lessonCountRaw = Number.parseInt((data.lessonCount ?? '1').toString(), 10);
  const lessonCount = Number.isFinite(lessonCountRaw) ? Math.min(Math.max(lessonCountRaw, 1), 2) : 1;
  const extraSlotsInput = Array.isArray(data.extraSlots) ? data.extraSlots : [];
  const normalizedExtraSlots = extraSlotsInput
    .map((s) => ({
      setupDate: (s?.setupDate || '').toString().trim(),
      setupTime: (s?.setupTime || '').toString().trim()
    }))
    .filter((s) => s.setupDate && s.setupTime)
    .slice(0, 1);

  const requestedSlots = [{ setupDate, setupTime }, ...normalizedExtraSlots]
    .filter((s) => s.setupDate && s.setupTime);

  const uniqueSlots = [];
  const seenSlots = new Set();
  for (const slot of requestedSlots) {
    const key = `${slot.setupDate}T${slot.setupTime}`;
    if (seenSlots.has(key)) continue;
    seenSlots.add(key);
    uniqueSlots.push(slot);
  }

  const effectiveLessonCount = requestedService === 'lessons'
    ? Math.min(Math.max(lessonCount, 1), 2)
    : 1;

  if (requestedService === 'lessons' && uniqueSlots.length !== effectiveLessonCount) {
    return json({ ok: false, error: 'Please provide one unique time slot per lesson.' }, 400, corsHeaders);
  }

  const serviceConfig = requestedService === 'lessons'
    ? {
        key: 'lessons',
        label: 'Tech Tutoring (2 hour session)',
        amountCents: 10000,
        quantity: uniqueSlots.length || 1,
        successPath: '/book-lessons.html'
      }
    : {
        key: 'openclaw_setup',
        label: 'OpenClaw Setup',
        amountCents: 10000,
        quantity: 1,
        successPath: '/openclaw-setup.html'
      };

  // Reject past dates/blocks using America/New_York.
  {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const get = (t) => parts.find(p => p.type === t)?.value;
    const today = `${get('year')}-${get('month')}-${get('day')}`;
    const nowHm = `${get('hour')}:${get('minute')}`;
    const start = setupTime.split('-')[0] || '';

    if (setupDate && today && setupDate < today) {
      return json({ ok: false, error: 'Selected date is in the past (ET). Choose a future date.' }, 400, corsHeaders);
    }
    if (setupDate && today && setupDate === today && start && start <= nowHm) {
      return json({ ok: false, error: 'Selected time block has already passed (ET). Choose a later block.' }, 400, corsHeaders);
    }
  }

  if (!setupDate || !setupTime) {
    return json({ ok: false, error: 'Missing setup date/time' }, 400, corsHeaders);
  }

  if (requestedService === 'lessons' && !lessonTopic) {
    return json({ ok: false, error: 'Missing lesson topic' }, 400, corsHeaders);
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({ ok: false, error: 'Stripe not configured' }, 500, corsHeaders);
  }

  const allSlots = requestedService === 'lessons'
    ? uniqueSlots
    : [{ setupDate, setupTime }];
  const setupAt = `${setupDate}T${setupTime}`;

  // Validate past-time for every selected slot
  {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const get = (t) => parts.find(p => p.type === t)?.value;
    const today = `${get('year')}-${get('month')}-${get('day')}`;
    const nowHm = `${get('hour')}:${get('minute')}`;

    for (const slot of allSlots) {
      const start = (slot.setupTime || '').split('-')[0] || '';
      if (slot.setupDate && today && slot.setupDate < today) {
        return json({ ok: false, error: 'Selected date is in the past (ET). Choose a future date.' }, 400, corsHeaders);
      }
      if (slot.setupDate && today && slot.setupDate === today && start && start <= nowHm) {
        return json({ ok: false, error: 'Selected time block has already passed (ET). Choose a later block.' }, 400, corsHeaders);
      }
    }
  }

  if (env.DB) {
    for (const slot of allSlots) {
      const slotAt = `${slot.setupDate}T${slot.setupTime}`;
      const existing = await env.DB.prepare(
        `SELECT id FROM bookings WHERE setup_at = ?1 AND status IN ('paid','confirmed') LIMIT 1`
      ).bind(slotAt).first();

      if (existing) {
        return json({ ok: false, error: 'One of the selected date/time slots is already booked. Please choose another slot.' }, 409, corsHeaders);
      }

      const blocked = await env.DB.prepare(
        `SELECT id FROM blocked_slots WHERE setup_at = ?1 AND active = 1 LIMIT 1`
      ).bind(slotAt).first();

      if (blocked) {
        return json({ ok: false, error: 'One of the selected date/time slots is unavailable. Please choose another slot.' }, 409, corsHeaders);
      }

      const blockedDay = await env.DB.prepare(
        `SELECT id FROM blocked_days WHERE setup_date = ?1 AND active = 1 LIMIT 1`
      ).bind(slot.setupDate).first();

      if (blockedDay) {
        return json({ ok: false, error: 'One of the selected days is unavailable. Please choose another date.' }, 409, corsHeaders);
      }
    }
  }

  const siteOrigin = originAllowed ? (request.headers.get('Origin') || '') : (allowedOrigins[0] || 'https://easternshore.ai');
  const body = new URLSearchParams({
    mode: 'payment',
    allow_promotion_codes: 'true',
    success_url: `${siteOrigin}${serviceConfig.successPath}?paid=1`,
    cancel_url: `${siteOrigin}${serviceConfig.successPath}?canceled=1`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(serviceConfig.amountCents),
    'line_items[0][price_data][product_data][name]': serviceConfig.label,
    'line_items[0][quantity]': String(serviceConfig.quantity || 1),
    'metadata[setup_date]': setupDate,
    'metadata[setup_time]': setupTime,
    'metadata[setup_at]': setupAt,
    'metadata[service_type]': serviceConfig.key,
    'metadata[service_label]': serviceConfig.label,
    'metadata[customer_name]': customerName || '(not provided)',
    'metadata[customer_phone]': customerPhone || '',
    'metadata[preferred_contact_method]': preferredContactMethod || 'email',
    'metadata[lesson_topic]': lessonTopic || '',
    'metadata[lesson_count]': String(serviceConfig.quantity || 1),
    'metadata[slots_json]': JSON.stringify(allSlots),
    'payment_intent_data[metadata][setup_date]': setupDate,
    'payment_intent_data[metadata][setup_time]': setupTime,
    'payment_intent_data[metadata][setup_at]': setupAt,
    'payment_intent_data[metadata][service_type]': serviceConfig.key,
    'payment_intent_data[metadata][service_label]': serviceConfig.label,
    'payment_intent_data[metadata][lesson_topic]': lessonTopic || '',
    'payment_intent_data[metadata][lesson_count]': String(serviceConfig.quantity || 1),
    'payment_intent_data[metadata][customer_phone]': customerPhone || '',
    'payment_intent_data[metadata][preferred_contact_method]': preferredContactMethod || 'email',
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

  if (env.DB) {
    const totalAmount = serviceConfig.amountCents * (serviceConfig.quantity || 1);
    const splitAmount = Math.round(totalAmount / Math.max(allSlots.length, 1));
    for (let i = 0; i < allSlots.length; i++) {
      const slot = allSlots[i];
      const slotAt = `${slot.setupDate}T${slot.setupTime}`;
      const slotAmount = i === 0 ? (totalAmount - (splitAmount * (allSlots.length - 1))) : splitAmount;
      await env.DB.prepare(
        `INSERT INTO bookings (
          stripe_session_id, status, setup_date, setup_time, setup_at, customer_name, customer_email, customer_phone, preferred_contact_method, amount_cents, service_type
        ) VALUES (?1, 'pending', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
      ).bind(
        stripeData.id,
        slot.setupDate,
        slot.setupTime,
        slotAt,
        customerName || null,
        customerEmail || null,
        customerPhone || null,
        preferredContactMethod || 'email',
        slotAmount,
        serviceConfig.key
      ).run();
    }
  }

  return json({ ok: true, checkoutUrl: stripeData.url, id: stripeData.id }, 200, corsHeaders);
}

/**
 * POST /api/zombie-bag-checkout — Create Stripe checkout for Zombie Bag ecommerce purchase
 * @param {Request} request - optional JSON body
 * @param {Object} env - Worker env (STRIPE_SECRET_KEY)
 * @returns {Response} {ok: true, checkoutUrl, id} or error
 */
async function handleZombieBagCheckout(request, env, corsHeaders, originAllowed, allowedOrigins) {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ ok: false, error: 'Stripe not configured' }, 500, corsHeaders);
  }

  let data = {};
  try {
    data = await request.json();
  } catch {
    data = {};
  }

  const bagColor = (data.bagColor || 'not_selected').toString().trim().toLowerCase();

  const siteOrigin = originAllowed ? (request.headers.get('Origin') || '') : (allowedOrigins[0] || 'https://easternshore.ai');
  const successUrl = `${siteOrigin}/zombies.html?paid=1`;
  const cancelUrl = `${siteOrigin}/zombies.html?canceled=1`;

  const body = new URLSearchParams({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    billing_address_collection: 'required',
    'shipping_address_collection[allowed_countries][0]': 'US',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': '14999',
    'line_items[0][price_data][product_data][name]': 'Zombie Bag',
    'line_items[0][price_data][product_data][description]': 'Android tablet + solar charger + go bag with pre-installed emergency apps',
    'line_items[0][quantity]': '1',
    'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
    'shipping_options[0][shipping_rate_data][fixed_amount][amount]': '0',
    'shipping_options[0][shipping_rate_data][fixed_amount][currency]': 'usd',
    'shipping_options[0][shipping_rate_data][display_name]': 'Free Delivery (Eastern Shore, MD area)',
    'shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]': 'business_day',
    'shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]': '1',
    'shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]': 'business_day',
    'shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]': '3',
    'shipping_options[1][shipping_rate_data][type]': 'fixed_amount',
    'shipping_options[1][shipping_rate_data][fixed_amount][amount]': '1999',
    'shipping_options[1][shipping_rate_data][fixed_amount][currency]': 'usd',
    'shipping_options[1][shipping_rate_data][display_name]': 'Continental U.S. Shipping',
    'shipping_options[1][shipping_rate_data][delivery_estimate][minimum][unit]': 'business_day',
    'shipping_options[1][shipping_rate_data][delivery_estimate][minimum][value]': '3',
    'shipping_options[1][shipping_rate_data][delivery_estimate][maximum][unit]': 'business_day',
    'shipping_options[1][shipping_rate_data][delivery_estimate][maximum][value]': '7',
    'metadata[product]': 'zombie_bag',
    'metadata[unit_price_cents]': '14999',
    'metadata[bag_color]': bagColor
  });

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const stripeData = await stripeRes.json().catch(() => ({}));
  if (!stripeRes.ok) {
    return json({ ok: false, error: 'Stripe session failed', detail: stripeData }, 502, corsHeaders);
  }

  return json({ ok: true, checkoutUrl: stripeData.url, id: stripeData.id }, 200, corsHeaders);
}

/**
 * POST /api/stripe-webhook — Verify Stripe signature, upsert booking as paid, auto-insert tax income
 * @param {Request} request - Raw body with Stripe-Signature header
 * @param {Object} env - Worker env (STRIPE_WEBHOOK_SECRET, DB)
 * @returns {Response} {ok: true} or error
 */
async function handleStripeWebhook(request, env, corsHeaders) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405, corsHeaders);
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Webhook secret not configured' }, 500, corsHeaders);
  }

  const sig = request.headers.get('Stripe-Signature') || '';
  const payload = await request.text();

  const verified = await verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!verified.ok) {
    return json({ ok: false, error: 'Invalid Stripe signature' }, 400, corsHeaders);
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json({ ok: false, error: 'Invalid JSON payload' }, 400, corsHeaders);
  }

  if (!env.DB) {
    // Still ack so Stripe doesn't keep retrying if DB isn't bound yet.
    return json({ ok: true, warning: 'DB binding missing' }, 200, corsHeaders);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object || {};
    const sessionId = session.id || null;
    const setupDate = session.metadata?.setup_date || null;
    const setupTime = session.metadata?.setup_time || null;
    const setupAt = session.metadata?.setup_at || (setupDate && setupTime ? `${setupDate}T${setupTime}` : null);
    const customerName = session.metadata?.customer_name || session.customer_details?.name || null;
    const customerEmail = session.customer_details?.email || session.customer_email || null;
    const customerPhone = session.metadata?.customer_phone || null;
    const preferredContactMethod = (session.metadata?.preferred_contact_method || 'email').toString();
    const serviceType = (session.metadata?.service_type || 'openclaw_setup').toString();
    const serviceLabel = (session.metadata?.service_label || '').toString().trim();
    const incomeCategory = serviceType === 'lessons' ? 'AI Lessons' : 'OpenClaw Setup';
    const incomeSource = serviceType === 'lessons' ? 'Stripe - Lessons' : 'Stripe';
    const amount = Number(session.amount_total || 10000);

    if (sessionId) {
      try {
        let slots = [];
        try {
          const parsed = JSON.parse(session.metadata?.slots_json || '[]');
          if (Array.isArray(parsed)) {
            slots = parsed
              .map((s) => ({
                setupDate: (s?.setupDate || '').toString().trim(),
                setupTime: (s?.setupTime || '').toString().trim()
              }))
              .filter((s) => s.setupDate && s.setupTime);
          }
        } catch {}
        if (!slots.length && setupDate && setupTime) {
          slots = [{ setupDate, setupTime }];
        }

        const splitAmount = Math.round(amount / Math.max(slots.length, 1));
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i];
          const slotAt = `${slot.setupDate}T${slot.setupTime}`;
          const slotAmount = i === 0 ? (amount - (splitAmount * (slots.length - 1))) : splitAmount;

          const existingSlotBooking = await env.DB.prepare(
            `SELECT id FROM bookings WHERE stripe_session_id = ?1 AND setup_at = ?2 LIMIT 1`
          ).bind(sessionId, slotAt).first();

          if (existingSlotBooking?.id) {
            await env.DB.prepare(
              `UPDATE bookings
               SET stripe_payment_intent_id = COALESCE(?1, stripe_payment_intent_id),
                   status = 'paid',
                   setup_date = COALESCE(?2, setup_date),
                   setup_time = COALESCE(?3, setup_time),
                   setup_at = COALESCE(?4, setup_at),
                   customer_name = COALESCE(?5, customer_name),
                   customer_email = COALESCE(?6, customer_email),
                   customer_phone = COALESCE(?7, customer_phone),
                   preferred_contact_method = COALESCE(?8, preferred_contact_method),
                   amount_cents = COALESCE(?9, amount_cents),
                   service_type = COALESCE(?10, service_type),
                   paid_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?11`
            ).bind(
              session.payment_intent || null,
              slot.setupDate,
              slot.setupTime,
              slotAt,
              customerName,
              customerEmail,
              customerPhone,
              preferredContactMethod,
              slotAmount,
              serviceType,
              existingSlotBooking.id
            ).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO bookings (
                stripe_session_id, stripe_payment_intent_id, status,
                setup_date, setup_time, setup_at,
                customer_name, customer_email, customer_phone, preferred_contact_method, amount_cents, service_type, paid_at
              ) VALUES (?1, ?2, 'paid', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))`
            ).bind(
              sessionId,
              session.payment_intent || null,
              slot.setupDate,
              slot.setupTime,
              slotAt,
              customerName,
              customerEmail,
              customerPhone,
              preferredContactMethod,
              slotAmount,
              serviceType
            ).run();
          }
        }

        // Use the payment event timestamp for accounting date, not the appointment date
        const incomeDate = event.created
          ? new Date(event.created * 1000).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        const existingIncome = await env.DB.prepare(
          `SELECT id FROM tax_income WHERE stripe_session_id = ?1 LIMIT 1`
        ).bind(sessionId).first();

        if (!existingIncome?.id) {
          await env.DB.prepare(
            `INSERT INTO tax_income (
              income_date, source, category, amount_cents, stripe_session_id, notes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
          ).bind(
            incomeDate,
            incomeSource,
            incomeCategory,
            amount,
            sessionId,
            customerName ? `Auto-imported from Stripe checkout (${serviceLabel || incomeCategory}) for ${customerName}` : `Auto-imported from Stripe checkout (${serviceLabel || incomeCategory})`
          ).run();
        }

        // Clean up stale pending rows for same slot(s) after successful payment
        for (const slot of slots) {
          const slotAt = `${slot.setupDate}T${slot.setupTime}`;
          await env.DB.prepare(
            `DELETE FROM bookings
             WHERE status = 'pending'
               AND setup_at = ?1
               AND stripe_session_id != ?2`
          ).bind(slotAt, sessionId).run();
        }

        // Auto-insert Stripe processing fee as expense for accurate net reporting
        const paymentIntentId = (session.payment_intent || '').toString().trim();
        const feeCents = await fetchStripeFeeCents(env.STRIPE_SECRET_KEY, paymentIntentId);
        if (feeCents > 0) {
          const feeNote = `Auto Stripe fee for session ${sessionId}`;
          const existingFee = await env.DB.prepare(
            `SELECT id FROM tax_expenses WHERE notes = ?1 LIMIT 1`
          ).bind(feeNote).first();

          if (!existingFee?.id) {
            await env.DB.prepare(
              `INSERT INTO tax_expenses (expense_date, vendor, category, amount_cents, paid_via, notes)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
            ).bind(
              incomeDate,
              'Stripe',
              'Payment Processing Fees',
              feeCents,
              'stripe',
              feeNote
            ).run();
          }
        }
      } catch (e) {
        console.error('Stripe webhook DB write failed', e);
        return json({ ok: false, error: `Webhook DB write failed: ${e?.message || e}` }, 500, corsHeaders);
      }
    }
  }

  return json({ ok: true }, 200, corsHeaders);
}

// ===== Utility Functions =====

/** Validate admin password from X-Admin-Password header or ?key query param */
function requireAdmin(request, env, corsHeaders, url) {
  const provided = (request.headers.get('X-Admin-Password') || url.searchParams.get('key') || '').trim();
  const expected = (env.ADMIN_PASSWORD || '').trim();
  if (!expected) return { ok: false, res: json({ ok: false, error: 'Admin password not configured' }, 500, corsHeaders) };
  if (!provided || provided !== expected) return { ok: false, res: json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders) };
  return { ok: true };
}

/** @param {string|number} amount - Dollar amount @returns {number|null} Integer cents */
function toCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** @param {*} v - Value to escape for CSV output @returns {string} */
function csvEscape(v) {
  const s = (v ?? '').toString();
  if (/[\n\r",]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * GET /api/bookings — Admin: fetch all bookings + blocked slots + blocked days
 * @returns {Response} {ok: true, bookings, blockedSlots, blockedDays}
 */
async function handleBookings(request, env, corsHeaders, url) {
  if (!env.DB) {
    return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  }

  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));
  const rows = await env.DB.prepare(
    `SELECT id, stripe_session_id, stripe_payment_intent_id, status, setup_date, setup_time, setup_at, customer_name, customer_email, customer_phone, preferred_contact_method, amount_cents, service_type, paid_at, created_at, updated_at
     FROM bookings
     ORDER BY created_at DESC
     LIMIT ?1`
  ).bind(limit).all();

  const blocked = await env.DB.prepare(
    `SELECT id, setup_date, setup_time, setup_at, reason, active, created_at, updated_at
     FROM blocked_slots
     ORDER BY created_at DESC
     LIMIT ?1`
  ).bind(limit).all();

  const blockedDays = await env.DB.prepare(
    `SELECT id, setup_date, reason, active, created_at, updated_at
     FROM blocked_days
     ORDER BY created_at DESC
     LIMIT ?1`
  ).bind(limit).all();

  return json({ ok: true, bookings: rows.results || [], blockedSlots: blocked.results || [], blockedDays: blockedDays.results || [] }, 200, corsHeaders);
}

/**
 * GET /api/availability — Public: return unavailable setup_at values and blocked dates
 * @returns {Response} {ok: true, unavailable: string[], blockedDates: string[]}
 */
async function handleAvailability(request, env, corsHeaders, url) {
  if (!env.DB) {
    return json({ ok: true, unavailable: [] }, 200, corsHeaders);
  }

  const from = (url.searchParams.get('from') || '').trim();
  const to = (url.searchParams.get('to') || '').trim();

  let bookedRows;
  let blockedRows;
  if (from && to) {
    bookedRows = await env.DB.prepare(
      `SELECT setup_at FROM bookings WHERE status IN ('paid','confirmed') AND setup_at >= ?1 AND setup_at <= ?2`
    ).bind(from, to).all();
    blockedRows = await env.DB.prepare(
      `SELECT setup_at FROM blocked_slots WHERE active = 1 AND setup_at >= ?1 AND setup_at <= ?2`
    ).bind(from, to).all();
  } else {
    bookedRows = await env.DB.prepare(
      `SELECT setup_at FROM bookings WHERE status IN ('paid','confirmed') ORDER BY setup_at DESC LIMIT 500`
    ).all();
    blockedRows = await env.DB.prepare(
      `SELECT setup_at FROM blocked_slots WHERE active = 1 ORDER BY setup_at DESC LIMIT 500`
    ).all();
  }

  const blockedDayRows = await env.DB.prepare(
    `SELECT setup_date FROM blocked_days WHERE active = 1`
  ).all();

  const unavailable = Array.from(new Set([
    ...(bookedRows.results || []).map(r => r.setup_at).filter(Boolean),
    ...(blockedRows.results || []).map(r => r.setup_at).filter(Boolean)
  ]));

  const blockedDates = Array.from(new Set((blockedDayRows.results || []).map(r => r.setup_date).filter(Boolean)));

  return json({ ok: true, unavailable, blockedDates }, 200, corsHeaders);
}

/**
 * POST /api/admin/block-slot — Block or unblock a specific 2-hour setup slot
 * @param {Request} request - JSON body: {setupDate, setupTime, active}
 * @returns {Response} {ok: true}
 */
async function handleAdminBlockSlot(request, env, corsHeaders, url) {
  if (!env.DB) {
    return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  }

  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const setupDate = (data.setupDate || '').toString().trim();
  const setupTime = (data.setupTime || '').toString().trim();
  const reason = (data.reason || '').toString().trim();
  const active = data.active === false ? 0 : 1;

  if (!setupDate || !setupTime) {
    return json({ ok: false, error: 'Missing setup date/time' }, 400, corsHeaders);
  }

  const setupAt = `${setupDate}T${setupTime}`;

  await env.DB.prepare(
    `INSERT INTO blocked_slots (setup_date, setup_time, setup_at, reason, active)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(setup_at) DO UPDATE SET
       reason=excluded.reason,
       active=excluded.active,
       updated_at=datetime('now')`
  ).bind(setupDate, setupTime, setupAt, reason || null, active).run();

  return json({ ok: true, setupAt, active: !!active }, 200, corsHeaders);
}

/**
 * POST /api/admin/block-day — Block or unblock an entire day
 * @param {Request} request - JSON body: {date, active}
 * @returns {Response} {ok: true}
 */
async function handleAdminBlockDay(request, env, corsHeaders, url) {
  if (!env.DB) {
    return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  }

  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const setupDate = (data.setupDate || '').toString().trim();
  const reason = (data.reason || '').toString().trim();
  const active = data.active === false ? 0 : 1;

  if (!setupDate) {
    return json({ ok: false, error: 'Missing setup date' }, 400, corsHeaders);
  }

  await env.DB.prepare(
    `INSERT INTO blocked_days (setup_date, reason, active)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(setup_date) DO UPDATE SET
       reason=excluded.reason,
       active=excluded.active,
       updated_at=datetime('now')`
  ).bind(setupDate, reason || null, active).run();

  return json({ ok: true, setupDate, active: !!active }, 200, corsHeaders);
}

/**
 * POST /api/admin/bookings/cleanup-pending — Delete pending bookings older than N days
 * @param {Request} request - JSON body: {days?: number}
 * @returns {Response} {ok: true, days, deleted}
 */
async function handleAdminCleanupPendingBookings(request, env, corsHeaders, url) {
  if (!env.DB) {
    return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  }

  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let data = {};
  try {
    data = await request.json();
  } catch {
    // allow empty body
  }

  const rawDays = Number(data.days);
  const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(60, Math.floor(rawDays))) : 5;

  const result = await env.DB.prepare(
    `DELETE FROM bookings
     WHERE status = 'pending'
       AND datetime(created_at) < datetime('now', '-' || ?1 || ' days')`
  ).bind(days).run();

  return json({ ok: true, days, deleted: Number(result.meta?.changes || 0) }, 200, corsHeaders);
}

/**
 * GET /api/tax/transactions — Admin: fetch tax entries filtered by year and type
 * @returns {Response} {ok: true, income: [], expenses: []}
 */
async function handleTaxTransactions(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  const year = (url.searchParams.get('year') || '').trim();
  const type = (url.searchParams.get('type') || 'all').trim();
  if (!/^\d{4}$/.test(year)) return json({ ok: false, error: 'Missing/invalid year' }, 400, corsHeaders);

  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 200)));

  const expensesP = (type === 'all' || type === 'expense')
    ? env.DB.prepare(
        `SELECT id, expense_date AS date, vendor, category, amount_cents, paid_via, notes, receipt_key, created_at
         FROM tax_expenses
         WHERE substr(expense_date,1,4) = ?1
         ORDER BY expense_date DESC, id DESC
         LIMIT ?2`
      ).bind(year, limit).all()
    : Promise.resolve({ results: [] });

  const incomeP = (type === 'all' || type === 'income')
    ? env.DB.prepare(
        `SELECT id, income_date AS date, source, category, amount_cents, stripe_session_id, notes, receipt_key, created_at
         FROM tax_income
         WHERE substr(income_date,1,4) = ?1
         ORDER BY income_date DESC, id DESC
         LIMIT ?2`
      ).bind(year, limit).all()
    : Promise.resolve({ results: [] });

  const [expenses, income] = await Promise.all([expensesP, incomeP]);

  return json({
    ok: true,
    year,
    expenses: expenses.results || [],
    income: income.results || []
  }, 200, corsHeaders);
}

/**
 * POST /api/tax/expense — Admin: add a manual expense entry
 * @param {Request} request - JSON body: {date, category, description, amount}
 * @returns {Response} {ok: true, id}
 */
async function handleTaxExpense(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }

  const expenseDate = (data.date || '').toString().trim();
  const vendor = (data.vendor || '').toString().trim();
  const category = (data.category || '').toString().trim();
  const paidVia = (data.paidVia || '').toString().trim();
  const notes = (data.notes || '').toString().trim();
  const cents = toCents(data.amount);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return json({ ok: false, error: 'Invalid date' }, 400, corsHeaders);
  if (!category) return json({ ok: false, error: 'Missing category' }, 400, corsHeaders);
  if (cents === null) return json({ ok: false, error: 'Invalid amount' }, 400, corsHeaders);

  const r = await env.DB.prepare(
    `INSERT INTO tax_expenses (expense_date, vendor, category, amount_cents, paid_via, notes)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(expenseDate, vendor || null, category, cents, paidVia || null, notes || null).run();

  return json({ ok: true, id: r.meta?.last_row_id || null }, 200, corsHeaders);
}

/**
 * POST /api/tax/income — Admin: add a manual income entry
 * @param {Request} request - JSON body: {date, category, description, amount}
 * @returns {Response} {ok: true, id}
 */
async function handleTaxIncome(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }

  const incomeDate = (data.date || '').toString().trim();
  const source = (data.source || '').toString().trim();
  const category = (data.category || '').toString().trim();
  const stripeSessionId = (data.stripeSessionId || '').toString().trim();
  const notes = (data.notes || '').toString().trim();
  const cents = toCents(data.amount);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(incomeDate)) return json({ ok: false, error: 'Invalid date' }, 400, corsHeaders);
  if (!category) return json({ ok: false, error: 'Missing category' }, 400, corsHeaders);
  if (cents === null) return json({ ok: false, error: 'Invalid amount' }, 400, corsHeaders);

  const r = await env.DB.prepare(
    `INSERT INTO tax_income (income_date, source, category, amount_cents, stripe_session_id, notes)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(incomeDate, source || null, category, cents, stripeSessionId || null, notes || null).run();

  return json({ ok: true, id: r.meta?.last_row_id || null }, 200, corsHeaders);
}


/**
 * POST /api/tax/expense/update — Admin: edit an existing expense entry
 */
async function handleTaxExpenseUpdate(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }

  const id = Number(data.id || 0);
  const expenseDate = (data.date || '').toString().trim();
  const vendor = (data.vendor || '').toString().trim();
  const category = (data.category || '').toString().trim();
  const paidVia = (data.paidVia || '').toString().trim();
  const notes = (data.notes || '').toString().trim();
  const cents = toCents(data.amount);

  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Invalid id' }, 400, corsHeaders);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return json({ ok: false, error: 'Invalid date' }, 400, corsHeaders);
  if (!category) return json({ ok: false, error: 'Missing category' }, 400, corsHeaders);
  if (cents === null) return json({ ok: false, error: 'Invalid amount' }, 400, corsHeaders);

  const existing = await env.DB.prepare('SELECT id FROM tax_expenses WHERE id = ?1').bind(id).first();
  if (!existing) return json({ ok: false, error: 'Expense not found' }, 404, corsHeaders);

  await env.DB.prepare(
    `UPDATE tax_expenses
     SET expense_date = ?1,
         vendor = ?2,
         category = ?3,
         amount_cents = ?4,
         paid_via = ?5,
         notes = ?6
     WHERE id = ?7`
  ).bind(expenseDate, vendor || null, category, cents, paidVia || null, notes || null, id).run();

  return json({ ok: true, id }, 200, corsHeaders);
}

/**
 * POST /api/tax/income/update — Admin: edit an existing income entry
 */
async function handleTaxIncomeUpdate(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }

  const id = Number(data.id || 0);
  const incomeDate = (data.date || '').toString().trim();
  const source = (data.source || '').toString().trim();
  const category = (data.category || '').toString().trim();
  const stripeSessionId = (data.stripeSessionId || '').toString().trim();
  const notes = (data.notes || '').toString().trim();
  const cents = toCents(data.amount);

  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Invalid id' }, 400, corsHeaders);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incomeDate)) return json({ ok: false, error: 'Invalid date' }, 400, corsHeaders);
  if (!category) return json({ ok: false, error: 'Missing category' }, 400, corsHeaders);
  if (cents === null) return json({ ok: false, error: 'Invalid amount' }, 400, corsHeaders);

  const existing = await env.DB.prepare('SELECT id FROM tax_income WHERE id = ?1').bind(id).first();
  if (!existing) return json({ ok: false, error: 'Income not found' }, 404, corsHeaders);

  await env.DB.prepare(
    `UPDATE tax_income
     SET income_date = ?1,
         source = ?2,
         category = ?3,
         amount_cents = ?4,
         stripe_session_id = ?5,
         notes = ?6
     WHERE id = ?7`
  ).bind(incomeDate, source || null, category, cents, stripeSessionId || null, notes || null, id).run();

  return json({ ok: true, id }, 200, corsHeaders);
}


/**
 * POST /api/tax/expense/delete — Admin: delete expense entry
 */
async function handleTaxExpenseDelete(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }
  const id = Number(data.id || 0);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Invalid id' }, 400, corsHeaders);

  const existing = await env.DB.prepare('SELECT id, receipt_key FROM tax_expenses WHERE id = ?1').bind(id).first();
  if (!existing) return json({ ok: false, error: 'Expense not found' }, 404, corsHeaders);

  if (existing.receipt_key && env.RECEIPTS) {
    await env.RECEIPTS.delete(existing.receipt_key).catch(() => {});
  }

  await env.DB.prepare('DELETE FROM tax_expenses WHERE id = ?1').bind(id).run();
  return json({ ok: true, id }, 200, corsHeaders);
}

/**
 * POST /api/tax/income/delete — Admin: delete income entry
 */
async function handleTaxIncomeDelete(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }
  const id = Number(data.id || 0);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Invalid id' }, 400, corsHeaders);

  const existing = await env.DB.prepare('SELECT id, receipt_key FROM tax_income WHERE id = ?1').bind(id).first();
  if (!existing) return json({ ok: false, error: 'Income not found' }, 404, corsHeaders);

  if (existing.receipt_key && env.RECEIPTS) {
    await env.RECEIPTS.delete(existing.receipt_key).catch(() => {});
  }

  await env.DB.prepare('DELETE FROM tax_income WHERE id = ?1').bind(id).run();
  return json({ ok: true, id }, 200, corsHeaders);
}

/**
 * POST /api/tax/receipt/upload — Admin: upload a receipt file to R2 and attach to a tax record
 * Multipart form fields: type (expense|income), id, file (PDF/JPG/PNG ≤ 10MB)
 */
async function handleTaxReceiptUpload(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  if (!env.RECEIPTS) return json({ ok: false, error: 'RECEIPTS binding missing' }, 500, corsHeaders);
  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  let formData;
  try { formData = await request.formData(); } catch { return json({ ok: false, error: 'Invalid form data' }, 400, corsHeaders); }

  const type = (formData.get('type') || '').toString().trim();
  const id = Number(formData.get('id') || 0);
  const file = formData.get('file');

  if (!['expense', 'income'].includes(type)) return json({ ok: false, error: 'Invalid type' }, 400, corsHeaders);
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Invalid id' }, 400, corsHeaders);
  if (!file || typeof file.arrayBuffer !== 'function') return json({ ok: false, error: 'Missing file' }, 400, corsHeaders);

  const allowedTypes = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
  const ext = allowedTypes[file.type];
  if (!ext) return json({ ok: false, error: 'File must be PDF, JPG, or PNG' }, 400, corsHeaders);

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > 10 * 1024 * 1024) return json({ ok: false, error: 'File exceeds 10MB limit' }, 400, corsHeaders);

  // Verify record exists
  const table = type === 'expense' ? 'tax_expenses' : 'tax_income';
  const existing = await env.DB.prepare(`SELECT id, receipt_key FROM ${table} WHERE id = ?1`).bind(id).first();
  if (!existing) return json({ ok: false, error: `${type} record not found` }, 404, corsHeaders);

  // Delete old R2 object if replacing
  if (existing.receipt_key) {
    await env.RECEIPTS.delete(existing.receipt_key).catch(() => {});
  }

  const key = `receipts/${type}/${id}.${ext}`;
  await env.RECEIPTS.put(key, bytes, { httpMetadata: { contentType: file.type } });

  const col = type === 'expense' ? 'receipt_key' : 'receipt_key';
  await env.DB.prepare(`UPDATE ${table} SET receipt_key = ?1 WHERE id = ?2`).bind(key, id).run();

  return json({ ok: true, key }, 200, corsHeaders);
}

/**
 * GET /api/tax/receipt — Admin: retrieve a receipt from R2
 * Query params: key (R2 object key), key2 (admin password — alternative auth since ?key is taken)
 */
async function handleTaxReceiptGet(request, env, corsHeaders, url) {
  if (!env.RECEIPTS) return json({ ok: false, error: 'RECEIPTS binding missing' }, 500, corsHeaders);

  // Support ?key2=<password> as alternate auth param since ?key is used for the R2 key
  const adminPw = request.headers.get('X-Admin-Password') || url.searchParams.get('key2') || '';
  if (!adminPw || adminPw !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const r2Key = url.searchParams.get('key') || '';
  if (!r2Key) return json({ ok: false, error: 'Missing key' }, 400, corsHeaders);

  const obj = await env.RECEIPTS.get(r2Key);
  if (!obj) return json({ ok: false, error: 'Receipt not found' }, 404, corsHeaders);

  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  return new Response(obj.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="receipt.${r2Key.split('.').pop()}"`,
      'Cache-Control': 'private, max-age=3600'
    }
  });
}

/**
 * GET /api/tax/export.csv — Admin: download CSV of tax entries for selected year/type
 * @returns {Response} CSV file attachment
 */
async function handleTaxExportCsv(request, env, corsHeaders, url) {
  if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
  const auth = requireAdmin(request, env, corsHeaders, url);
  if (!auth.ok) return auth.res;

  const year = (url.searchParams.get('year') || '').trim();
  const type = (url.searchParams.get('type') || 'all').trim();
  if (!/^\d{4}$/.test(year)) return json({ ok: false, error: 'Missing/invalid year' }, 400, corsHeaders);

  const expenses = (type === 'all' || type === 'expense')
    ? await env.DB.prepare(
        `SELECT expense_date AS date, vendor, category, amount_cents, paid_via, notes, created_at
         FROM tax_expenses
         WHERE substr(expense_date,1,4) = ?1
         ORDER BY expense_date ASC, id ASC`
      ).bind(year).all()
    : { results: [] };

  const income = (type === 'all' || type === 'income')
    ? await env.DB.prepare(
        `SELECT income_date AS date, source, category, amount_cents, stripe_session_id, notes, created_at
         FROM tax_income
         WHERE substr(income_date,1,4) = ?1
         ORDER BY income_date ASC, id ASC`
      ).bind(year).all()
    : { results: [] };

  const lines = [];
  lines.push(['date','type','category','vendor_or_source','amount','paid_via','stripe_session_id','notes','created_at'].join(','));

  for (const r of (income.results || [])) {
    lines.push([
      csvEscape(r.date),
      'income',
      csvEscape(r.category),
      csvEscape(r.source || ''),
      (Number(r.amount_cents || 0) / 100).toFixed(2),
      '',
      csvEscape(r.stripe_session_id || ''),
      csvEscape(r.notes || ''),
      csvEscape(r.created_at || '')
    ].join(','));
  }

  for (const r of (expenses.results || [])) {
    lines.push([
      csvEscape(r.date),
      'expense',
      csvEscape(r.category),
      csvEscape(r.vendor || ''),
      (Number(r.amount_cents || 0) / 100).toFixed(2),
      csvEscape(r.paid_via || ''),
      '',
      csvEscape(r.notes || ''),
      csvEscape(r.created_at || '')
    ].join(','));
  }

  const csv = lines.join('\n');
  const filename = `eastern-shore-ai-tax-${year}-${type}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}

/**
 * Fetch Stripe fee (in cents) for a payment intent id.
 * Returns 0 if not found.
 */
async function fetchStripeFeeCents(stripeSecretKey, paymentIntentId) {
  if (!stripeSecretKey || !paymentIntentId) return 0;
  const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` }
  });
  const pi = await piRes.json().catch(() => ({}));
  if (!piRes.ok) return 0;

  const chargeId = pi?.latest_charge;
  if (!chargeId) return 0;

  const chRes = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` }
  });
  const ch = await chRes.json().catch(() => ({}));
  if (!chRes.ok) return 0;

  const btId = ch?.balance_transaction;
  if (!btId) return 0;

  const btRes = await fetch(`https://api.stripe.com/v1/balance_transactions/${encodeURIComponent(btId)}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` }
  });
  const bt = await btRes.json().catch(() => ({}));
  if (!btRes.ok) return 0;

  const fee = Number(bt?.fee || 0);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}

/**
 * Verify Stripe webhook signature using HMAC-SHA256
 * @param {string} payload - Raw request body
 * @param {string} stripeSignature - Stripe-Signature header value
 * @param {string} webhookSecret - STRIPE_WEBHOOK_SECRET
 * @returns {Promise<boolean>}
 */
async function verifyStripeSignature(payload, stripeSignature, webhookSecret) {
  // Stripe-Signature header format: t=timestamp,v1=signature[,v1=signature2]
  const parts = Object.fromEntries(
    stripeSignature
      .split(',')
      .map(p => p.split('=').map(x => x.trim()))
      .filter(pair => pair.length === 2)
  );

  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) return { ok: false };

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computed = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

  // timing-safe enough for this context with fixed length compare
  if (computed.length !== expected.length) return { ok: false };
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) mismatch |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  return { ok: mismatch === 0 };
}

/** @param {Object} payload @param {number} [status=200] @param {Object} [headers] @returns {Response} */
function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}
