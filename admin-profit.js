// ===== Survival Node Profit (admin tab, Accounting row) =====
// Loaded after admin.js; uses its globals (loadTaxYear, buildPartLots, nowEtParts, escHtml,
// adminSessionActive, TaxDataIncompleteError). The Tax Ledger is read live every time the tab
// opens and when Refresh is pressed, so part costs, shipping labels and fee rates always come
// from what the books show was actually paid. Replaced the "Survival Node Profit Calculator"
// artifact (a snapshot typed in by hand) on 2026-11-16.
// The admin DOM is re-mounted from a <template> on login, so events are delegated from document
// and elements are looked up on use.
(function () {
  // ----- Profit math (pure: no DOM; worker/tests/profit-calc.test.mjs loads this block) -----
  // The parts in one Gen 2 kit, by the Year-End Parts Count's lines (buildPartLots in admin.js).
  const PROFIT_PARTS = [
    { line: 'phone', label: 'Phone', sub: 'Moto G Power 2024, with USB-C cable', per: 1 },
    { line: 'phoneCase', label: 'Phone case', sub: 'Shockproof case', per: 1 },
    { line: 'hardCase', label: 'Weatherproof hard case', sub: '', per: 1 },
    { line: 'charger', label: 'Charging block', sub: 'Wall charger', per: 1 },
    { line: 'lock', label: 'Padlock', sub: '', per: 1 },
    { line: 'faradayMD', label: 'Mission Darkness Faraday bags', sub: '2 per kit', per: 2 },
    { line: 'solarGen2', label: 'Solar battery', sub: 'Gen 2, 24,000 mAh', per: 1 }
  ];
  // Parts the ledger has that aren't in a Gen 2 kit.
  const PROFIT_LEFT_OUT = {
    solarGen1: 'Gen 1 solar battery or power bank',
    faradayStd: 'standard Faraday bag (Gen 1)',
    cable: 'cable (the phone comes with one)',
    desiccant: 'desiccant (part of shipping supplies)'
  };
  const PROFIT_NOT_IN_KIT = /oneplus/i; // the test phone and its case
  // Shipping rows outside this range are a reship, a collections payment or a phone-only label.
  const PROFIT_LABEL_MIN = 1000;
  const PROFIT_LABEL_MAX = 3500;
  // "Latest restock" = the newest purchase of a part plus any bought in the week before it.
  const PROFIT_RESTOCK_DAYS = 7;
  // eBay sales from this date on are Gen 2 kits (the last Gen 1 kit sold on eBay 2026-10-29).
  const PROFIT_GEN2_FROM = '2026-10-30';
  // The count comes from the purchase note ("(2)", "Two", "4 pack"…; no number = 1). A unit price
  // this many times the part's usual price (median of its purchases) usually means the count is
  // missing: a 2-pack noted without its count reads as one item at double the price. Only the high
  // side is flagged, since a missing count can only make a unit look dearer (a cheap one-off, like
  // the $10.41 hard case on 2026-11-01, is real).
  const PROFIT_COUNT_CHECK = 1.8;
  const PROFIT_DEFAULTS = {
    channel: 'site', view: 'avg', countTax: false, price: 34999,
    supplies: 450, stripeFixed: 30, stripePct: null, label: null, overrides: {},
    ebayShip: 1999, coupon: 0, ebayTax: 7, fvfPct: 13.6, fvfFixed: 40, adPct: 12
  };

  const profitDayNum = (d) => Date.parse(`${String(d || '').slice(0, 10)}T12:00:00Z`) / 86400000;
  const profitByDate = (a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id);
  const profitSum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);

  /** Ledger rows ({ expenses, income } from /api/tax/transactions) → everything the tab shows. */
  function profitBooks(expenses, income) {
    const exp = expenses || [];
    const inc = income || [];
    const cents = (r) => Number(r.amount_cents || 0);
    const note = (r) => String(r.notes || '').trim() || String(r.vendor || r.source || '');

    // Maryland tax paid on a resale purchase is its own row: "(expense #214: ...)".
    const taxById = {};
    for (const r of exp) {
      if (!/^taxes/i.test(r.category || '')) continue;
      const m = String(r.notes || '').match(/\(expense #(\d+)/i);
      if (m) taxById[m[1]] = (taxById[m[1]] || 0) + cents(r);
    }

    const partRows = exp.filter((r) => /^inventory/i.test(r.category || ''));
    const { lots, skipped } = buildPartLots(partRows);
    const leftOut = skipped.map((s) => ({ id: s.id, date: s.date, cents: s.cents, text: s.text, reason: s.reason }));
    const asLeftOut = (lot, reason) => ({ id: lot.id, date: lot.date, cents: lot.cents, text: lot.text, reason });

    const parts = PROFIT_PARTS.map((p) => {
      const use = [];
      for (const lot of (lots[p.line] || [])) { // newest first
        if (PROFIT_NOT_IN_KIT.test(lot.text)) { leftOut.push(asLeftOut(lot, 'test phone, not in kits')); continue; }
        use.push({ id: lot.id, date: lot.date, qty: lot.qty, cents: lot.cents, tax: taxById[lot.id] || 0, text: lot.text });
      }
      const sortedUnits = use.map((l) => l.cents / l.qty).sort((a, b) => a - b);
      const mid = Math.floor(sortedUnits.length / 2);
      const median = sortedUnits.length % 2 ? sortedUnits[mid] : (sortedUnits[mid - 1] + sortedUnits[mid]) / 2;
      for (const l of use) {
        const unit = l.cents / l.qty;
        l.check = use.length >= 3 && median > 0 && unit >= median * PROFIT_COUNT_CHECK;
      }
      const units = profitSum(use, (l) => l.qty);
      const newest = use[0];
      const recent = newest ? use.filter((l) => profitDayNum(newest.date) - profitDayNum(l.date) <= PROFIT_RESTOCK_DAYS) : [];
      const recentUnits = profitSum(recent, (l) => l.qty);
      const perKit = (list, n, withTax) => (n ? p.per * profitSum(list, (l) => l.cents + (withTax ? l.tax : 0)) / n : 0);
      const unitPrices = use.map((l) => l.cents / l.qty);
      return {
        ...p,
        lots: use,
        units,
        avg: { plain: perKit(use, units, false), tax: perKit(use, units, true) },
        latest: { plain: perKit(recent, recentUnits, false), tax: perKit(recent, recentUnits, true) },
        recentUnits,
        recentFrom: recent.length ? recent[recent.length - 1].date : '',
        recentTo: newest ? newest.date : '',
        low: unitPrices.length ? Math.min(...unitPrices) * p.per : 0,
        high: unitPrices.length ? Math.max(...unitPrices) * p.per : 0
      };
    });
    const kitLines = new Set(PROFIT_PARTS.map((p) => p.line));
    for (const [line, list] of Object.entries(lots)) {
      if (kitLines.has(line)) continue;
      for (const lot of list) leftOut.push(asLeftOut(lot, PROFIT_LEFT_OUT[line] || 'not a kit part'));
    }
    leftOut.sort(profitByDate);

    // Shipping labels
    const labels = [];
    const labelsOut = [];
    for (const r of exp.filter((x) => /^shipping/i.test(x.category || '')).sort(profitByDate)) {
      const row = { id: r.id, date: r.date, cents: cents(r), text: note(r) };
      (row.cents >= PROFIT_LABEL_MIN && row.cents <= PROFIT_LABEL_MAX ? labels : labelsOut).push(row);
    }
    const avgOf = (list) => (list.length ? profitSum(list, (l) => l.cents) / list.length : 0);

    // Website sales and their Stripe fees (the fee row's note carries the checkout session id)
    const feeRows = exp.filter((r) => /payment processing/i.test(r.category || ''));
    const siteSales = inc
      .filter((r) => /survival node/i.test(r.category || '') && /^cs_/.test(String(r.stripe_session_id || '')) && cents(r) > 0)
      .sort(profitByDate)
      .map((r) => ({
        id: r.id,
        date: r.date,
        price: cents(r),
        fee: profitSum(feeRows.filter((f) => String(f.notes || '').includes(r.stripe_session_id)), cents)
      }))
      .filter((s) => s.fee > 0);
    const stripeRate = (list) => {
      const price = profitSum(list, (s) => s.price);
      return price ? (profitSum(list, (s) => s.fee) - 30 * list.length) / price * 100 : 0;
    };

    // eBay sales: the income note has the amounts, the fee rows carry "eBay order <number>"
    const ebay = inc
      .filter((r) => /^ebay:/i.test(String(r.stripe_session_id || '')))
      .sort(profitByDate)
      .map((r) => {
        const order = String(r.stripe_session_id).slice(5);
        const n = String(r.notes || '');
        const amount = (re) => { const m = n.match(re); return m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * 100) : 0; };
        const mine = exp.filter((e) => String(e.notes || '').includes(`eBay order ${order}`));
        const by = (re) => profitSum(mine.filter((e) => re.test(e.category || '')), cents);
        const phoneOnly = /phone only/i.test(n);
        return {
          id: r.id,
          date: r.date,
          order,
          item: amount(/item subtotal \$([\d.,]+)/i),
          ship: amount(/buyer shipping \$([\d.,]+)/i),
          tax: amount(/sales tax \$([\d.,]+)/i),
          fee: by(/payment processing/i),
          ad: by(/advertis/i),
          label: by(/^shipping/i),
          other: profitSum(mine.filter((e) => !/payment processing|advertis|^shipping/i.test(e.category || '')), cents),
          phoneOnly,
          gen2: !phoneOnly && String(r.date) >= PROFIT_GEN2_FROM
        };
      });

    return {
      parts,
      leftOut,
      labels,
      labelsOut,
      labelAvg: avgOf(labels),
      labelLatest: avgOf(labels.slice(-4)),
      siteSales,
      stripeRate: stripeRate(siteSales),
      stripeRateLatest: stripeRate(siteSales.slice(-4)),
      ebay
    };
  }

  /** One kit's money in cents. c: hardware, label, supplies, stripePct, stripeFixed, ebayShip, coupon, ebayTax, fvfPct, fvfFixed, adPct. */
  function profitFor(channel, price, c) {
    const base = c.hardware + c.label + c.supplies;
    if (channel === 'ebay') {
      // eBay charges its fee and the ad rate on the whole order: kit, the buyer's shipping and the tax it collects.
      const revenue = Math.max(0, price - c.coupon) + c.ebayShip;
      const feeBase = revenue * (1 + c.ebayTax / 100);
      const fee = feeBase * c.fvfPct / 100 + c.fvfFixed;
      const ads = feeBase * c.adPct / 100;
      return { revenue, fee, ads, cost: base + fee + ads, profit: revenue - base - fee - ads };
    }
    const fee = price * c.stripePct / 100 + c.stripeFixed;
    return { revenue: price, fee, ads: 0, cost: base + fee, profit: price - base - fee };
  }
  // ----- end profit math -----

  if (typeof document === 'undefined') return;

  const STORE_KEY = 'esai_profit_v1';
  const $ = (id) => document.getElementById(id);
  const usd = (c) => `$${(Math.round(Number(c) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const money = (c) => `<span class="money-blur-target">${usd(c)}</span>`;
  const day = (d) => {
    if (!d) return '';
    return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const esc = (v) => (typeof escHtml === 'function' ? escHtml(v) : String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])));

  let settings = loadSettings();
  let books = null;
  let loadedAt = null;
  let loading = false;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') return { ...PROFIT_DEFAULTS, ...saved, overrides: { ...(saved.overrides || {}) } };
    } catch {}
    return { ...PROFIT_DEFAULTS, overrides: {} };
  }
  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch {}
  }

  // ----- Current costs -----
  const fromBooks = (pair) => (settings.countTax ? pair.tax : pair.plain);
  function partCost(p) {
    const o = settings.overrides[p.line];
    if (o != null) return o;
    return fromBooks(settings.view === 'latest' ? p.latest : p.avg);
  }
  const labelFromBooks = () => (settings.view === 'latest' ? books.labelLatest : books.labelAvg);
  const labelCost = () => (settings.label != null ? settings.label : labelFromBooks());
  const stripeFromBooks = () => (settings.view === 'latest' ? books.stripeRateLatest : books.stripeRate);
  const stripePct = () => (settings.stripePct != null ? settings.stripePct : stripeFromBooks());
  const hardware = () => profitSum(books.parts, partCost);
  function costs(over = {}) {
    return {
      hardware: hardware(), label: labelCost(), supplies: settings.supplies,
      stripePct: stripePct(), stripeFixed: settings.stripeFixed,
      ebayShip: settings.ebayShip, coupon: settings.coupon, ebayTax: settings.ebayTax,
      fvfPct: settings.fvfPct, fvfFixed: settings.fvfFixed, adPct: settings.adPct,
      ...over
    };
  }

  // ----- Loading -----
  async function refresh() {
    const body = $('profit-body');
    if (!body || loading || !adminSessionActive) return;
    loading = true;
    const btn = $('profit-refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    const status = $('profit-status');
    if (status) { status.className = 'profit-status'; status.textContent = 'Loading the Tax Ledger…'; }
    else body.innerHTML = '<p class="profit-status">Loading the Tax Ledger…</p>';
    try {
      const year = Number(nowEtParts().date.slice(0, 4));
      // This year and last year, so a January kit still finds December's purchases.
      const years = await Promise.all([year - 1, year].map((y) => loadTaxYear(y)));
      const expenses = years.flatMap((d) => d.expenses || []);
      const income = years.flatMap((d) => d.income || []);
      books = profitBooks(expenses, income);
      loadedAt = new Date();
      renderShell();
      update();
    } catch (err) {
      const msg = err && err.message ? err.message : 'Could not load the Tax Ledger.';
      if ($('profit-status')) { $('profit-status').className = 'profit-status warn'; $('profit-status').textContent = msg; }
      else body.innerHTML = `<p class="profit-status warn">${esc(msg)}</p>`;
    } finally {
      loading = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Refresh from the books'; }
    }
  }

  // ----- Rendering -----
  const pctInput = (key, label, hint, step = '0.1') =>
    `<div><label for="profit-${key}">${label}</label><input type="number" min="0" step="${step}" id="profit-${key}" data-profit-key="${key}" data-profit-unit="pct" inputmode="decimal" />${hint ? `<span class="profit-hint">${hint}</span>` : ''}</div>`;
  const usdInput = (key, label, hint) =>
    `<div><label for="profit-${key}">${label}</label><input type="number" min="0" step="0.01" id="profit-${key}" data-profit-key="${key}" data-profit-unit="usd" inputmode="decimal" />${hint ? `<span class="profit-hint">${hint}</span>` : ''}</div>`;

  function renderShell() {
    const body = $('profit-body');
    if (!body || !books) return;
    const ebayTaxRates = books.ebay.filter((s) => !s.phoneOnly && s.item + s.ship > 0).map((s) => s.tax / (s.item + s.ship) * 100);
    const taxHint = ebayTaxRates.length
      ? `Your eBay kit sales: ${Math.min(...ebayTaxRates).toFixed(1)}% to ${Math.max(...ebayTaxRates).toFixed(1)}%. eBay charges its fees on it.`
      : 'eBay charges its fees on it.';
    const adRates = books.ebay.filter((s) => s.ad > 0).map((s) => `${Math.round(s.ad / (s.item + s.ship + s.tax) * 100)}%`);
    body.innerHTML = `
      <p class="profit-status" id="profit-status" role="status"></p>
      <div class="profit-controls">
        <div class="profit-seg" role="group" aria-label="Where the kit sells"><span>Sold on</span>
          <button type="button" class="btn" data-profit-channel="site">Website</button>
          <button type="button" class="btn" data-profit-channel="ebay">eBay</button>
        </div>
        <div class="profit-seg" role="group" aria-label="Which part costs to use"><span>Part costs</span>
          <button type="button" class="btn" data-profit-view="avg">Books average</button>
          <button type="button" class="btn" data-profit-view="latest">Latest restock</button>
        </div>
        <label class="profit-check"><input type="checkbox" id="profit-count-tax" /> Count sales tax paid on parts</label>
      </div>
      <div class="profit-top">
        <section class="admin-calendar-wrap profit-result" aria-live="polite">
          <div class="profit-label" id="profit-label"></div>
          <div class="profit-fig" id="profit-fig"></div>
          <p class="profit-line" id="profit-line"></p>
          <div class="parts-count-table-wrap">
            <table class="profit-compare">
              <thead><tr><th>Profit per kit</th><th>At $299.99 sale</th><th>At $349.99</th></tr></thead>
              <tbody>
                <tr data-row="site"><td>Website</td><td id="profit-cmp-site-sale"></td><td id="profit-cmp-site-reg"></td></tr>
                <tr data-row="ebay"><td>eBay</td><td id="profit-cmp-ebay-sale"></td><td id="profit-cmp-ebay-reg"></td></tr>
              </tbody>
            </table>
          </div>
          <ul class="profit-breakdown" id="profit-breakdown"></ul>
        </section>
        <section class="admin-calendar-wrap profit-sale">
          <div class="admin-calendar-title">The sale</div>
          <div class="profit-fields">
            <div>
              <label for="profit-price">Kit price</label>
              <input type="number" min="0" step="0.01" id="profit-price" data-profit-key="price" data-profit-unit="usd" inputmode="decimal" />
              <div class="profit-chips"><button type="button" class="btn" data-profit-price="29999">Sale $299.99</button><button type="button" class="btn" data-profit-price="34999">$349.99</button></div>
            </div>
          </div>
          <div class="profit-fields" data-profit-for="site">
            ${pctInput('stripePct', 'Stripe rate', `Books: ${books.siteSales.length} website sales, <span id="profit-stripe-books"></span> + 30¢ blended (card is 2.9%; Klarna 5.99%).`, '0.01')}
            ${usdInput('stripeFixed', 'Stripe per sale', '')}
          </div>
          <div class="profit-fields" data-profit-for="ebay">
            ${usdInput('ebayShip', 'Shipping the buyer pays', 'Your listing charges $19.99. The label is under Kit costs.')}
            ${usdInput('coupon', 'Coupon off the kit', 'Leave at $0 unless the buyer used one.')}
            ${pctInput('ebayTax', 'Sales tax eBay collects', esc(taxHint))}
            ${pctInput('fvfPct', 'eBay final value fee', 'On the whole order: kit, shipping and tax.')}
            ${usdInput('fvfFixed', 'eBay per-order fee', '')}
            ${pctInput('adPct', 'Promoted listing ad rate', adRates.length ? `You've paid ${esc(adRates.join(', '))}. Each point is about $4 on a $349.99 kit.` : 'Each point is about $4 on a $349.99 kit.', '0.5')}
          </div>
        </section>
      </div>
      <section class="admin-calendar-wrap">
        <div class="admin-calendar-title">Kit costs from the books</div>
        <div class="parts-count-table-wrap">
          <table class="parts-count-table profit-parts">
            <thead><tr><th>Part</th><th class="num">Average</th><th class="num">Latest restock</th><th class="num">Using</th><th class="num">Bought</th></tr></thead>
            <tbody id="profit-part-rows">
              ${books.parts.map((p) => `
                <tr data-line="${p.line}">
                  <td>${esc(p.label)}${p.sub ? `<span class="pc-hint">${esc(p.sub)}</span>` : ''}</td>
                  <td class="num" data-cell="avg"></td>
                  <td class="num" data-cell="latest"></td>
                  <td class="num"><input type="number" min="0" step="0.01" class="pc-unit" data-profit-part="${p.line}" aria-label="${esc(p.label)} cost per kit" /><span class="pc-hint profit-edited" data-cell="edited" hidden>Your figure</span></td>
                  <td class="num">${p.units}${p.lots.length ? `<span class="pc-hint">${p.lots.length} purchase${p.lots.length === 1 ? '' : 's'}</span>` : '<span class="pc-hint">none found</span>'}</td>
                </tr>`).join('')}
              <tr>
                <td>Shipping label<span class="pc-hint">${books.labels.length} labels, ${books.labelsOut.length} left out</span></td>
                <td class="num">${money(books.labelAvg)}</td>
                <td class="num">${money(books.labelLatest)}<span class="pc-hint">last 4</span></td>
                <td class="num"><input type="number" min="0" step="0.01" class="pc-unit" id="profit-label-input" data-profit-key="label" data-profit-unit="usd" aria-label="Shipping label cost per kit" /></td>
                <td class="num"></td>
              </tr>
              <tr>
                <td>Shipping supplies<span class="pc-hint">Inserts, ink, desiccant, tape</span></td>
                <td class="num"></td><td class="num"></td>
                <td class="num"><input type="number" min="0" step="0.01" class="pc-unit" id="profit-supplies-input" data-profit-key="supplies" data-profit-unit="usd" aria-label="Shipping supplies per kit" /></td>
                <td class="num"></td>
              </tr>
            </tbody>
            <tfoot><tr><td>Hardware per kit</td><td></td><td></td><td class="num" id="profit-hardware"></td><td></td></tr></tfoot>
          </table>
        </div>
        <div class="admin-row profit-actions"><button type="button" class="btn" id="profit-reset-btn">Use the books' numbers again</button></div>
        <details class="parts-count-pricing">
          <summary>Purchases used for each part</summary>
          ${books.parts.map((p) => `
            <h4 class="profit-sub">${esc(p.label)}</h4>
            ${p.lots.length ? `<div class="parts-count-table-wrap"><table class="parts-count-table">
              <thead><tr><th>Date</th><th>Purchase</th><th class="num">Units</th><th class="num">Paid</th><th class="num">Tax</th><th class="num">Each</th></tr></thead>
              <tbody>${p.lots.map((l) => `<tr><td>${day(l.date)}</td><td>${esc(l.text)}${l.check ? '<span class="pc-hint profit-check-count">Unusual price for this part: check the count in this note</span>' : ''}</td><td class="num">${l.qty}</td><td class="num">${money(l.cents)}</td><td class="num">${money(l.tax)}</td><td class="num">${money(l.cents / l.qty)}</td></tr>`).join('')}</tbody>
            </table></div>` : '<p class="web-muted">No purchases found.</p>'}`).join('')}
          <h4 class="profit-sub">Shipping labels counted</h4>
          <p class="web-muted">${books.labels.map((l) => `${day(l.date)} ${money(l.cents)}`).join(' · ') || 'None found.'}</p>
          ${books.labelsOut.length ? `<p class="web-muted">Left out (outside $10 to $35): ${books.labelsOut.map((l) => `${day(l.date)} ${money(l.cents)} ${esc(l.text)}`).join(' · ')}</p>` : ''}
        </details>
        <details class="parts-count-pricing">
          <summary>Left out of the kit costs (${books.leftOut.length})</summary>
          ${books.leftOut.length ? `<div class="parts-count-table-wrap"><table class="parts-count-table">
            <thead><tr><th>Date</th><th>Purchase</th><th class="num">Amount</th><th>Why</th></tr></thead>
            <tbody>${books.leftOut.map((l) => `<tr><td>${day(l.date)}</td><td>${esc(l.text)}</td><td class="num">${money(l.cents)}</td><td>${esc(l.reason)}</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="web-muted">Nothing left out.</p>'}
          <p class="web-muted">Each purchase is sorted by its note, the same way as the Year-End Parts Count. Keep new purchase notes in that style, count first then the part: "(4) Mission Darkness Faraday Bags", "12 locks", "2 Solar Batteries (Gen 2)".</p>
        </details>
      </section>
      <section class="admin-calendar-wrap">
        <div class="admin-calendar-title">Real eBay sales</div>
        <div id="profit-ebay-compare"></div>
        <div class="parts-count-table-wrap">
          <table class="parts-count-table">
            <thead><tr><th>Date</th><th>Kit</th><th class="num">Buyer paid</th><th class="num">Tax</th><th class="num">eBay fee</th><th class="num">Ad fee</th><th class="num">Label</th><th class="num">Kept before parts</th><th class="num">Profit</th></tr></thead>
            <tbody id="profit-ebay-rows"></tbody>
          </table>
        </div>
        <p class="web-muted">Buyer paid is the kit plus the shipping they paid. eBay passes the tax on but charges its fees on it too. Profit takes off a Gen 2 kit's parts and supplies, so it's shown only for Gen 2 kit sales.</p>
      </section>`;
  }

  function setInput(el, value, unit) {
    if (!el || document.activeElement === el) return;
    el.value = unit === 'usd' ? (Math.round(Number(value) || 0) / 100).toFixed(2) : Number(value || 0).toFixed(2).replace(/\.?0+$/, '');
  }

  function update() {
    if (!books || !$('profit-fig')) return;
    const ch = settings.channel;
    const onEbay = ch === 'ebay';
    const c = costs();
    const e = profitFor(ch, settings.price, c);
    const margin = e.revenue > 0 ? e.profit / e.revenue * 100 : 0;

    const viewWord = settings.view === 'latest' ? 'latest restock prices' : 'books average';
    const loadedText = loadedAt ? loadedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    const status = $('profit-status');
    const toCheck = profitSum(books.parts, (p) => p.lots.filter((l) => l.check).length);
    status.className = toCheck ? 'profit-status warn' : 'profit-status';
    status.textContent = `Read from the Tax Ledger at ${loadedText}: ${profitSum(books.parts, (p) => p.lots.length)} kit-part purchases, ${books.labels.length} shipping labels, ${books.siteSales.length} website sales and ${books.ebay.length} eBay sales. Opening this tab reads it again.`
      + (toCheck ? ` ${toCheck} purchase${toCheck === 1 ? ' has' : 's have'} an unusual price per unit; check the count in its note under "Purchases used for each part".` : '');

    document.querySelectorAll('[data-profit-channel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.profitChannel === ch)));
    document.querySelectorAll('[data-profit-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.profitView === settings.view)));
    document.querySelectorAll('[data-profit-price]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.profitPrice) === settings.price)));
    document.querySelectorAll('[data-profit-for]').forEach((el) => { el.hidden = el.dataset.profitFor !== ch; });
    const tax = $('profit-count-tax');
    if (tax) tax.checked = !!settings.countTax;

    $('profit-label').textContent = `Profit per kit · ${onEbay ? 'sold on eBay' : 'sold on your website'} · ${viewWord}`;
    const fig = $('profit-fig');
    fig.innerHTML = money(e.profit);
    fig.classList.toggle('loss', e.profit < 0);
    $('profit-line').innerHTML = `<b>${margin.toFixed(1)}%</b> margin · ${money(e.revenue)} in, ${money(e.cost)} out`;
    const cmp = (channel, price) => profitFor(channel, price, c).profit;
    $('profit-cmp-site-sale').innerHTML = money(cmp('site', 29999));
    $('profit-cmp-site-reg').innerHTML = money(cmp('site', 34999));
    $('profit-cmp-ebay-sale').innerHTML = money(cmp('ebay', 29999));
    $('profit-cmp-ebay-reg').innerHTML = money(cmp('ebay', 34999));
    document.querySelectorAll('.profit-compare tr[data-row]').forEach((tr) => tr.classList.toggle('on', tr.dataset.row === ch));
    const rows = [
      ['Hardware', c.hardware],
      ['Shipping label', c.label],
      ['Shipping supplies', c.supplies],
      [onEbay ? 'eBay final value fee' : 'Stripe fee', e.fee]
    ];
    if (onEbay) rows.push(['Promoted listing ad fee', e.ads]);
    $('profit-breakdown').innerHTML = rows.map(([k, v]) => `<li><span>${esc(k)}</span><span>${money(v)}</span></li>`).join('')
      + `<li class="total"><span>Total cost</span><span>${money(e.cost)}</span></li>`;

    // Inputs
    document.querySelectorAll('[data-profit-key]').forEach((el) => {
      const key = el.dataset.profitKey;
      const unit = el.dataset.profitUnit;
      let v = settings[key];
      if (key === 'label') v = labelCost();
      if (key === 'stripePct') v = stripePct();
      setInput(el, v, unit);
    });
    const sb = $('profit-stripe-books');
    if (sb) sb.textContent = `${stripeFromBooks().toFixed(2)}%`;

    // Parts table
    books.parts.forEach((p) => {
      const tr = document.querySelector(`#profit-part-rows tr[data-line="${p.line}"]`);
      if (!tr) return;
      tr.querySelector('[data-cell="avg"]').innerHTML = p.units ? money(fromBooks(p.avg)) : '—';
      tr.querySelector('[data-cell="latest"]').innerHTML = p.units
        ? `${money(fromBooks(p.latest))}<span class="pc-hint">${p.recentUnits} bought ${day(p.recentFrom)}${p.recentFrom !== p.recentTo ? `–${day(p.recentTo)}` : ''}</span>`
        : '—';
      setInput(tr.querySelector('[data-profit-part]'), partCost(p), 'usd');
      tr.querySelector('[data-cell="edited"]').hidden = settings.overrides[p.line] == null;
    });
    $('profit-hardware').innerHTML = money(c.hardware);

    renderEbay(c);
  }

  function renderEbay(c) {
    const parts = c.hardware + c.supplies;
    const tbody = $('profit-ebay-rows');
    if (!tbody) return;
    if (!books.ebay.length) {
      tbody.innerHTML = '<tr><td colspan="9">No eBay sales in the books for this year or last.</td></tr>';
      $('profit-ebay-compare').innerHTML = '';
      return;
    }
    tbody.innerHTML = books.ebay.map((s) => {
      const paid = s.item + s.ship;
      const kept = paid - s.fee - s.ad - s.label - s.other;
      const rate = s.ad ? ` <span class="pc-hint">${Math.round(s.ad / (paid + s.tax) * 100)}%</span>` : '';
      const kit = s.phoneOnly ? 'Phone only' : s.gen2 ? 'Gen 2 kit' : 'Earlier kit';
      return `<tr><td>${day(s.date)}</td><td>${kit}</td><td class="num">${money(paid)}</td><td class="num">${money(s.tax)}</td><td class="num">${money(s.fee)}</td><td class="num">${money(s.ad)}${rate}</td><td class="num">${money(s.label)}</td><td class="num">${money(kept)}</td><td class="num"><b>${s.gen2 ? money(kept - parts) : '—'}</b></td></tr>`;
    }).join('');
    const last = [...books.ebay].reverse().find((s) => s.gen2);
    const box = $('profit-ebay-compare');
    if (!last) { box.innerHTML = ''; return; }
    const actual = last.item + last.ship - last.fee - last.ad - last.label - last.other - parts;
    const est = profitFor('ebay', last.item, { ...c, ebayShip: last.ship, coupon: 0 });
    const diff = actual - est.profit;
    box.innerHTML = `
      <p class="profit-cmp-title">Latest Gen 2 eBay sale (${day(last.date)}) against this estimate</p>
      <div class="web-summary profit-cmp">
        <div><b>${money(actual)}</b><span>Actual profit</span></div>
        <div><b>${money(est.profit)}</b><span>Estimate</span></div>
        <div><b class="${diff >= 0 ? 'profit-good' : 'profit-bad'}">${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))}</b><span>Difference</span></div>
      </div>
      <p class="web-muted">Estimate vs actual: eBay fee ${money(est.fee)} vs ${money(last.fee)} · ad fee ${money(est.ads)} vs ${money(last.ad)} · label ${money(c.label)} vs ${money(last.label)}. Parts and supplies are ${money(parts)} on both sides.</p>`;
  }

  // ----- Events (delegated: the admin DOM is re-mounted on login) -----
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof Element) || !t.closest('#profit-card')) return;
    if (t.closest('#profit-refresh-btn')) { refresh(); return; }
    const chBtn = t.closest('[data-profit-channel]');
    if (chBtn) { settings.channel = chBtn.dataset.profitChannel === 'ebay' ? 'ebay' : 'site'; saveSettings(); update(); return; }
    const viewBtn = t.closest('[data-profit-view]');
    if (viewBtn) { settings.view = viewBtn.dataset.profitView === 'latest' ? 'latest' : 'avg'; saveSettings(); update(); return; }
    const priceBtn = t.closest('[data-profit-price]');
    if (priceBtn) { settings.price = Number(priceBtn.dataset.profitPrice); saveSettings(); update(); return; }
    if (t.closest('#profit-reset-btn')) {
      settings.overrides = {};
      settings.label = null;
      settings.stripePct = null;
      settings.supplies = PROFIT_DEFAULTS.supplies;
      saveSettings();
      update();
    }
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || !t.closest('#profit-card') || !books) return;
    if (t.id === 'profit-count-tax') { settings.countTax = t.checked; saveSettings(); update(); return; }
    const raw = parseFloat(t.value);
    const ok = Number.isFinite(raw) && raw >= 0;
    if (t.dataset.profitPart) {
      if (ok) settings.overrides[t.dataset.profitPart] = Math.round(raw * 100);
      else delete settings.overrides[t.dataset.profitPart];
    } else if (t.dataset.profitKey) {
      const key = t.dataset.profitKey;
      const unit = t.dataset.profitUnit;
      if (!ok) {
        if (key === 'label' || key === 'stripePct') settings[key] = null;
        else return;
      } else {
        settings[key] = unit === 'usd' ? Math.round(raw * 100) : raw;
      }
    } else {
      return;
    }
    saveSettings();
    update();
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t instanceof HTMLInputElement && t.id === 'profit-count-tax') { settings.countTax = t.checked; saveSettings(); update(); }
  });

  window.refreshProfitCalc = refresh;
})();
