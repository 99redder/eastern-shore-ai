// ===== Website Clients (Website Care Plan, $100/yr) =====
// Loaded after admin.js; uses its globals (CONTACT_API_URL, adminSessionToken,
// escHtml, openErrorModal, openSuccessModal, openConfirmModal, adminSessionActive).
// The admin DOM is re-mounted from a <template> on login, so all wiring is
// delegated from document and elements are looked up on use.
(function () {
  const BASE = CONTACT_API_URL.replace('/api/contact', '');
  const API = {
    list: `${BASE}/api/website-clients`,
    save: `${BASE}/api/website-clients`,
    link: `${BASE}/api/website-clients/link`,
    status: `${BASE}/api/website-clients/status`,
    del: `${BASE}/api/website-clients/delete`,
    agreement: `${BASE}/api/website-clients/agreement`,
  };
  const $ = (id) => document.getElementById(id);
  let clients = [];

  const STATUS = {
    prospect: ['Prospect', '#475569'],
    link_sent: ['Link sent', '#0ea5e9'],
    signed: ['Signed, unpaid', '#f59e0b'],
    active: ['Active', '#22c55e'],
    past_due: ['Past due', '#ef4444'],
    canceled: ['Canceled', '#334155'],
  };

  const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
  const day = (v) => {
    if (!v) return '';
    const s = String(v);
    const d = new Date(s.length <= 10 ? `${s}T12:00:00` : `${s.replace(' ', 'T')}Z`);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  };

  async function call(url, body) {
    const res = await fetch(url, body === undefined
      ? { headers: { 'X-Admin-Session': adminSessionToken } }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Session': adminSessionToken }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function badge(status) {
    const [label, color] = STATUS[status] || [status, '#475569'];
    return `<span style="font-size:.78rem; padding:2px 8px; border-radius:999px; background:${color}; color:#fff;">${escHtml(label)}</span>`;
  }

  function renewalText(c) {
    if (!c.current_period_end) return 'Not paid yet';
    const n = Number(c.days_to_renewal);
    const when = day(c.current_period_end);
    if (n < 0) return `<strong style="color:#ff9b9b;">Renewal ${Math.abs(n)} days overdue</strong> (was due ${when})`;
    if (n <= 45) return `<strong style="color:#fbbf24;">Renews in ${n} days</strong> (${when})`;
    return `Paid through ${when}`;
  }

  function renderSummary(s) {
    const el = $('web-summary');
    if (!el || !s) return;
    el.innerHTML = [
      [s.active, 'Active'],
      [s.awaiting, 'Awaiting sign/pay'],
      [s.renewingSoon, 'Renewing in 30 days'],
      [s.pastDue, 'Past due'],
      [money(s.annualRevenueCents), 'Yearly revenue'],
    ].map(([v, l]) => `<div><b>${escHtml(String(v))}</b><span>${escHtml(l)}</span></div>`).join('');
  }

  function filtered() {
    const f = $('web-filter')?.value || 'open';
    return clients.filter((c) => {
      if (f === 'all') return true;
      if (f === 'open') return c.status !== 'canceled';
      if (f === 'renewing') return c.days_to_renewal != null && c.days_to_renewal <= 45 && c.status !== 'canceled';
      if (f === 'awaiting') return ['prospect', 'link_sent', 'signed'].includes(c.status);
      return c.status === f;
    });
  }

  function renderList() {
    const el = $('web-list');
    if (!el) return;
    const rows = filtered();
    if (!rows.length) { el.innerHTML = '<div style="color:var(--muted);">No clients for this filter. Use Add Client when a business says yes.</div>'; return; }
    el.innerHTML = rows.map((c) => {
      const id = Number(c.id);
      const paid = Number(c.payments?.length || 0) > 0;
      const canceled = c.status === 'canceled';
      const renewalDue = paid && c.days_to_renewal != null && c.days_to_renewal <= 45;
      const linkLabel = paid ? 'Email Renewal Link' : 'Email Agreement Link';
      const lines = [];
      lines.push(`${escHtml(c.contact_name || 'No contact name')}${c.email ? ` &bull; ${escHtml(c.email)}` : ''}${c.phone ? ` &bull; ${escHtml(c.phone)}` : ''}`);
      lines.push(`${money(c.annual_price_cents)}/yr${c.domain_name ? ` &bull; Domain: ${escHtml(c.domain_name)}` : ''}${c.preview_url ? ` &bull; <a href="${escHtml(c.preview_url)}" target="_blank" rel="noopener" style="color:var(--cyan);">Site</a>` : ''}`);
      lines.push(renewalText(c));
      const steps = [
        `Link sent: ${c.link_sent_at ? day(c.link_sent_at) : '—'}`,
        `Signed: ${c.signed_at ? `${day(c.signed_at)} by ${escHtml(c.signer_name || '')}` : '—'}`,
        `First paid: ${c.first_paid_at ? day(c.first_paid_at) : '—'}`,
      ];
      if (c.renewal_link_sent_at) steps.push(`Renewal link sent: ${day(c.renewal_link_sent_at)}`);
      lines.push(`<span style="color:var(--muted);">${steps.join(' &bull; ')}</span>`);
      if (c.payments?.length) {
        lines.push(`<span style="color:var(--muted);">Payments: ${c.payments.map((p) => `${money(p.amount_cents)} on ${day(p.paid_at)} (${day(p.period_start)}–${day(p.period_end)})`).join('; ')}</span>`);
      }
      if (c.notes) lines.push(`<span style="color:var(--muted);">Notes: ${escHtml(c.notes)}</span>`);
      return `<div class="web-row">
        <div class="web-row-head"><strong>${escHtml(c.business_name)}</strong>${badge(c.status)}</div>
        ${lines.map((l) => `<div style="margin-top:.2rem;">${l}</div>`).join('')}
        <div class="web-row-actions">
          ${canceled ? '' : `<button type="button" class="btn action-pop" data-web-action="copy" data-web-id="${id}">Copy ${paid ? 'Renewal' : 'Agreement'} Link</button>`}
          ${canceled ? '' : `<button type="button" class="btn action-pop" data-web-action="email" data-web-id="${id}" ${!c.email ? 'title="Add an email first"' : ''}>${renewalDue || !paid ? linkLabel : 'Email Renewal Link (early)'}</button>`}
          ${c.signed_at ? `<button type="button" class="btn action-pop" data-web-action="agreement" data-web-id="${id}">View Signed Agreement</button>` : ''}
          <button type="button" class="btn action-pop" data-web-action="edit" data-web-id="${id}">Edit</button>
          ${canceled
            ? `<button type="button" class="btn action-pop" data-web-action="reactivate" data-web-id="${id}">Reactivate</button>`
            : `<button type="button" class="btn delete" data-web-action="cancel" data-web-id="${id}">Mark Canceled</button>`}
          ${paid ? '' : `<button type="button" class="btn delete" data-web-action="delete" data-web-id="${id}">Delete</button>`}
        </div>
        <div id="web-agreement-${id}"></div>
      </div>`;
    }).join('');
  }

  async function refresh() {
    if (typeof adminSessionActive !== 'undefined' && !adminSessionActive) return;
    const el = $('web-list');
    if (el && !clients.length) el.innerHTML = '<div style="color:var(--muted);">Loading clients…</div>';
    try {
      const data = await call(API.list);
      clients = data.clients || [];
      renderSummary(data.summary);
      renderList();
    } catch (e) {
      if (el) el.innerHTML = `<div style="color:#ff9b9b;">${escHtml(e.message)}</div>`;
    }
  }
  window.refreshWebsiteClients = refresh;

  function openForm(c) {
    const f = $('web-form');
    if (!f) return;
    f.hidden = false;
    $('web-id').value = c ? c.id : '';
    $('web-business').value = c?.business_name || '';
    $('web-contact').value = c?.contact_name || '';
    $('web-email').value = c?.email || '';
    $('web-phone').value = c?.phone || '';
    $('web-preview').value = c?.preview_url || '';
    $('web-domain').value = c?.domain_name || '';
    $('web-price').value = c ? Math.round(Number(c.annual_price_cents || 0) / 100) : 100;
    $('web-notes').value = c?.notes || '';
    const locked = !!c?.signed_at;
    ['web-business', 'web-domain', 'web-price'].forEach((id) => { $(id).disabled = locked; });
    $('web-form-lock').hidden = !locked;
    $('web-business').focus();
  }

  function closeForm() {
    const f = $('web-form');
    if (f) { f.hidden = true; f.reset(); }
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  async function onAction(btn) {
    const id = Number(btn.getAttribute('data-web-id'));
    const action = btn.getAttribute('data-web-action');
    const c = clients.find((x) => Number(x.id) === id);
    if (!c) return;
    try {
      if (action === 'edit') { openForm(c); return; }
      if (action === 'copy') {
        const data = await call(API.link, { id, send: false });
        const ok = await copyText(data.link);
        openSuccessModal(ok ? `Copied. Paste it into a text, Facebook message, or email:\n\n${data.link}` : `Copy this link:\n\n${data.link}`, 'Link Ready');
        await refresh();
        return;
      }
      if (action === 'email') {
        if (!c.email) { openErrorModal('Add an email address for this client first (Edit), or use Copy Link and send it yourself.'); return; }
        const paid = Number(c.payments?.length || 0) > 0;
        const ok = await openConfirmModal(`Email the ${paid ? 'renewal' : 'agreement'} link to ${c.email}?`, paid ? 'Send Renewal Link' : 'Send Agreement Link', 'Send');
        if (!ok) return;
        btn.disabled = true; btn.textContent = 'Sending…';
        await call(API.link, { id, send: true });
        openSuccessModal(`Sent to ${c.email}.`, 'Email Sent');
        await refresh();
        return;
      }
      if (action === 'agreement') {
        const box = $(`web-agreement-${id}`);
        if (box.innerHTML) { box.innerHTML = ''; return; }
        const a = await call(`${API.agreement}?id=${id}`);
        box.innerHTML = `<div class="web-agreement">Signed by ${escHtml(a.signerName || '')}${a.signerTitle ? `, ${escHtml(a.signerTitle)}` : ''} (${escHtml(a.signerEmail || '')})
${escHtml(a.signedAt || '')} UTC from IP ${escHtml(a.signerIp || '')}
Version ${escHtml(a.version || '')} &bull; SHA-256 ${escHtml(a.hash || '')}
Browser: ${escHtml(a.signerUserAgent || '')}

${escHtml(a.text || '')}</div>`;
        return;
      }
      if (action === 'cancel' || action === 'reactivate') {
        const next = action === 'cancel' ? 'canceled' : (c.first_paid_at ? 'active' : (c.signed_at ? 'signed' : 'prospect'));
        if (action === 'cancel' && !(await openConfirmModal(`Mark ${c.business_name} as canceled? Their link stops working. Remember to hand off the domain and files if they ask.`, 'Cancel Client', 'Mark Canceled'))) return;
        await call(API.status, { id, status: next });
        await refresh();
        return;
      }
      if (action === 'delete') {
        if (!(await openConfirmModal(`Delete ${c.business_name}? This can't be undone.`, 'Delete Client', 'Delete'))) return;
        await call(API.del, { id });
        await refresh();
      }
    } catch (e) {
      openErrorModal(e.message);
      await refresh();
    }
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-web-action], #web-add-btn, #web-refresh-btn, #web-cancel-btn');
    if (!t) return;
    if (t.id === 'web-add-btn') { openForm(null); return; }
    if (t.id === 'web-refresh-btn') { refresh(); return; }
    if (t.id === 'web-cancel-btn') { closeForm(); return; }
    onAction(t);
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'web-filter') renderList();
  });

  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'web-form') return;
    e.preventDefault();
    const btn = $('web-save-btn');
    const body = {
      id: Number($('web-id').value || 0) || undefined,
      businessName: $('web-business').value.trim(),
      contactName: $('web-contact').value.trim(),
      email: $('web-email').value.trim(),
      phone: $('web-phone').value.trim(),
      previewUrl: $('web-preview').value.trim(),
      domainName: $('web-domain').value.trim(),
      annualPriceCents: Math.round(Number($('web-price').value || 0) * 100),
      notes: $('web-notes').value.trim(),
    };
    if (!body.businessName) { openErrorModal('Business name is required.'); return; }
    btn.disabled = true;
    try {
      await call(API.save, body);
      closeForm();
      await refresh();
    } catch (ex) {
      openErrorModal(ex.message);
    } finally {
      btn.disabled = false;
    }
  });
})();
