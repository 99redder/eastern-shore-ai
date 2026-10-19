// ===== Website Clients (Website Care Plan, price set per client) =====
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
    stopAutopay: `${BASE}/api/website-clients/stop-autopay`,
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
    const when = day(c.current_period_end);
    const n = Number(c.days_to_renewal);
    if (['past_due', 'unpaid'].includes(c.subscription_status)) return `<strong style="color:#ff9b9b;">Auto-renew card declined</strong>${c.last_payment_failed_at ? ` ${day(c.last_payment_failed_at)}` : ''}. Stripe is retrying; client was emailed to update their card.`;
    if (c.autopay && c.current_period_end) return `<strong style="color:#4ade80;">Auto-renews ${when}</strong>${n <= 45 ? ` (in ${n} days)` : ''}`;
    if (c.autopay) return '<strong style="color:#4ade80;">Auto-renew on</strong>';
    if (!c.current_period_end) return 'Not paid yet';
    if (c.autopay_ending) return `Paid through ${when}. <strong style="color:#fbbf24;">Auto-renew turned off</strong>, ends then.`;
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
      [s.autopay ?? 0, 'On auto-renew'],
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
      const renewalDue = paid && !c.autopay && c.days_to_renewal != null && c.days_to_renewal <= 45;
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
        <div class="web-row-head"><strong>${escHtml(c.business_name)}</strong><span>${Number(c.is_owner_test || 0) ? '<span style="font-size:.78rem; padding:2px 8px; border-radius:999px; background:#7c3aed; color:#fff; margin-right:.35rem;">Owner test</span>' : ''}${badge(c.status)}</span></div>
        ${lines.map((l) => `<div style="margin-top:.2rem;">${l}</div>`).join('')}
        <div class="web-row-actions">
          ${canceled ? '' : `<button type="button" class="btn action-pop" data-web-action="copy" data-web-id="${id}">Copy ${paid ? 'Renewal' : 'Agreement'} Link</button>`}
          ${canceled ? '' : `<button type="button" class="btn action-pop" data-web-action="email" data-web-id="${id}" ${!c.email ? 'title="Add an email first"' : ''}>${c.autopay ? 'Email Renewal Reminder' : (renewalDue || !paid ? linkLabel : 'Email Renewal Link (early)')}</button>`}
          ${c.autopay && !canceled ? `<button type="button" class="btn delete" data-web-action="stop-autopay" data-web-id="${id}">Stop Auto-Renew</button>` : ''}
          ${c.signed_at ? `<button type="button" class="btn action-pop" data-web-action="agreement" data-web-id="${id}">View Signed Agreement</button>` : ''}
          <button type="button" class="btn action-pop" data-web-action="edit" data-web-id="${id}">Edit</button>
          ${canceled
            ? `<button type="button" class="btn action-pop" data-web-action="reactivate" data-web-id="${id}">Reactivate</button>`
            : `<button type="button" class="btn delete" data-web-action="cancel" data-web-id="${id}">Mark Canceled</button>`}
          ${paid ? '' : `<button type="button" class="btn delete" data-web-action="delete" data-web-id="${id}">Delete</button>`}
        </div>
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
    const cents = c ? Number(c.annual_price_cents || 0) : 10000;
    $('web-price').value = cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100);
    $('web-notes').value = c?.notes || '';
    $('web-owner-test').checked = Number(c?.is_owner_test || 0) === 1;
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
        await openEmailModal(c);
        return;
      }
      if (action === 'agreement') {
        await openAgreementModal(c);
        return;
      }
      if (action === 'stop-autopay') {
        if (!(await openConfirmModal(`Turn off automatic renewal for ${c.business_name}? They stay paid through ${day(c.current_period_end) || 'the current year'} and won't be charged again. They can turn it back on from their agreement link.`, 'Stop Auto-Renew', 'Stop Auto-Renew'))) return;
        await call(API.stopAutopay, { id });
        await refresh();
        return;
      }
      if (action === 'cancel' || action === 'reactivate') {
        const next = action === 'cancel' ? 'canceled' : (c.first_paid_at ? 'active' : (c.signed_at ? 'signed' : 'prospect'));
        if (action === 'cancel' && !(await openConfirmModal(`Mark ${c.business_name} as canceled? Their link stops working${c.autopay ? ', and automatic renewal is turned off (no more charges; they keep the site through the paid year)' : ''}. Remember to hand off the domain and files if they ask.`, 'Cancel Client', 'Mark Canceled'))) return;
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

  // ---------- Modals ----------
  function showModal(el) { el.classList.add('active'); el.setAttribute('aria-hidden', 'false'); }
  function hideModal(el) { if (!el) return; el.classList.remove('active'); el.setAttribute('aria-hidden', 'true'); }

  let emailDraft = null;
  let previewTimer = null;
  let previewSeq = 0;

  // Render the worker's email HTML in a shadow root: isolated from the admin page's CSS,
  // and not blocked by the page's CSP the way an iframe (frame-src) is.
  function setPreviewHtml(html) {
    const host = $('web-email-preview');
    if (!host) return;
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host{all:initial;display:block;} a{pointer-events:none;}</style>${html || ''}`;
  }

  async function renderEmailPreview() {
    if (!emailDraft) return;
    const seq = ++previewSeq;
    const status = $('web-email-status');
    if (status) status.textContent = '(updating…)';
    try {
      const data = await call(API.link, { id: emailDraft.id, preview: true, subject: $('web-email-subject').value, body: $('web-email-body').value });
      if (seq !== previewSeq) return;
      setPreviewHtml(data.html);
      if (status) status.textContent = data.linkInBody ? '' : '(heads up: the agreement link is no longer in the email)';
    } catch (e) {
      if (status) status.textContent = `(preview failed: ${e.message})`;
    }
  }

  async function openEmailModal(c) {
    const data = await call(API.link, { id: Number(c.id), preview: true });
    emailDraft = { id: Number(c.id), to: data.to, isRenewal: data.isRenewal, name: c.business_name };
    $('web-email-title').textContent = data.isRenewal ? (c.autopay ? 'Preview Renewal Reminder' : 'Preview Renewal Email') : 'Preview Agreement Email';
    $('web-email-to').innerHTML = `To: <b>${escHtml(data.to)}</b> &middot; ${escHtml(c.business_name)}`;
    $('web-email-subject').value = data.subject;
    $('web-email-body').value = data.body;
    setPreviewHtml(data.html);
    $('web-email-status').textContent = '';
    const send = $('web-email-send-btn'); send.disabled = false; send.textContent = 'Send Email';
    showModal($('web-email-modal'));
    $('web-email-subject').focus();
  }

  async function sendEmailFromModal() {
    if (!emailDraft) return;
    const send = $('web-email-send-btn');
    send.disabled = true; send.textContent = 'Sending…';
    try {
      await call(API.link, { id: emailDraft.id, send: true, subject: $('web-email-subject').value, body: $('web-email-body').value });
      const to = emailDraft.to;
      hideModal($('web-email-modal')); emailDraft = null;
      openSuccessModal(`Sent to ${to}.`, 'Email Sent');
      await refresh();
    } catch (e) {
      send.disabled = false; send.textContent = 'Send Email';
      openErrorModal(e.message);
    }
  }

  async function openAgreementModal(c) {
    const a = await call(`${API.agreement}?id=${Number(c.id)}`);
    const cell = (k, v, wide) => `<div${wide ? ' class="wide"' : ''}><span>${escHtml(k)}</span><b>${escHtml(v || '—')}</b></div>`;
    $('web-agreement-meta').innerHTML = [
      cell('Business', a.businessName),
      cell('Signed by', `${a.signerName || ''}${a.signerTitle ? `, ${a.signerTitle}` : ''}`),
      cell('Email', a.signerEmail),
      cell('Signed on', a.signedAtEt),
      cell('Plan', `${money(a.priceCents)} per year`),
      cell('Domain', a.domainName),
      cell('Version', a.version),
      cell('IP address', a.signerIp),
      cell('Fingerprint (SHA-256)', a.hash, true),
      cell('Browser', a.signerUserAgent, true),
    ].join('');
    const terms = String(a.text || '').split(/\n\n/).map((block) => {
      const [head, ...rest] = block.split('\n');
      return `<h4>${escHtml(head)}</h4><p>${escHtml(rest.join(' '))}</p>`;
    }).join('');
    $('web-agreement-terms').innerHTML = terms + (a.signerName
      ? `<div class="web-doc-sig"><div><div class="sig">${escHtml(a.signerName)}</div>${escHtml(a.signerName)}${a.signerTitle ? `, ${escHtml(a.signerTitle)}` : ''} for ${escHtml(a.businessName)}</div><div>Signed electronically<br>${escHtml(a.signedAtEt || '')}</div></div>`
      : '');
    const open = $('web-agreement-open');
    if (a.link) { open.href = a.link; open.hidden = false; } else { open.hidden = true; }
    $('web-agreement-modal').querySelector('.success-modal').scrollTop = 0;
    showModal($('web-agreement-modal'));
  }

  document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'web-email-subject' || e.target.id === 'web-email-body')) {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(renderEmailPreview, 450);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('web-email-modal')?.classList.contains('active')) { hideModal($('web-email-modal')); emailDraft = null; }
    if ($('web-agreement-modal')?.classList.contains('active')) hideModal($('web-agreement-modal'));
  });
  document.addEventListener('click', (e) => {
    const id = e.target?.id;
    if (id === 'web-email-cancel-btn' || id === 'web-email-modal') { hideModal($('web-email-modal')); emailDraft = null; return; }
    if (id === 'web-email-send-btn') { sendEmailFromModal(); return; }
    if (id === 'web-agreement-close-btn' || id === 'web-agreement-modal') { hideModal($('web-agreement-modal')); return; }
  });

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
      isOwnerTest: !!$('web-owner-test')?.checked,
      notes: $('web-notes').value.trim(),
    };
    if (!body.businessName) { openErrorModal('Business name is required.'); return; }
    btn.disabled = true;
    try {
      const res = await call(API.save, body);
      closeForm();
      await refresh();
      if (res.rebooked) {
        openSuccessModal(body.isOwnerTest
          ? `Moved ${res.rebooked} payment${res.rebooked === 1 ? '' : 's'} in the Tax Ledger to Owner Funded (Non-Revenue). They now count as owner contributions, not income. Stripe fees stay as expenses.`
          : `Moved ${res.rebooked} payment${res.rebooked === 1 ? '' : 's'} in the Tax Ledger back to Website Services income.`, 'Books Updated');
      }
    } catch (ex) {
      openErrorModal(ex.message);
    } finally {
      btn.disabled = false;
    }
  });
})();
