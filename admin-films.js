// ===== Folder to Film (admin tab) =====
// Loaded after admin.js; uses its globals (CONTACT_API_URL, adminSessionToken,
// escHtml, openErrorModal, openSuccessModal, openConfirmModal, adminSessionActive).
// The admin DOM is re-mounted from a <template> on login, so all wiring is
// delegated from document and elements are looked up on use. Reuses the
// Website Clients styles (web-summary, web-row, web-muted).
(function () {
  const BASE = CONTACT_API_URL.replace('/api/contact', '');
  const API = {
    list: `${BASE}/api/film/projects`,
    detail: `${BASE}/api/film/project`,
    update: `${BASE}/api/film/project/update`,
    email: `${BASE}/api/film/email`,
    fileLink: `${BASE}/api/film/file-link`,
    del: `${BASE}/api/film/project/delete`,
    deliverStart: `${BASE}/api/film/deliver/start`,
    deliverPart: `${BASE}/api/film/deliver/part`,
    deliverComplete: `${BASE}/api/film/deliver/complete`,
  };
  const $ = (id) => document.getElementById(id);
  let projects = [];
  let questions = [];
  let statuses = {};
  const open = new Set();
  const details = new Map();

  const COLORS = {
    pending_payment: '#475569', collecting: '#0ea5e9', production: '#f59e0b', demo_ready: '#8b5cf6',
    changes: '#ef4444', final_ready: '#22c55e', delivered: '#15803d', canceled: '#334155',
  };
  const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
  const size = (b) => { b = Number(b || 0); return b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`; };
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
    return `<span style="font-size:.78rem; padding:2px 8px; border-radius:999px; background:${COLORS[status] || '#475569'}; color:#fff;">${escHtml(statuses[status] || status)}</span>`;
  }

  function renderSummary(s) {
    const el = $('film-summary');
    if (!el || !s) return;
    el.innerHTML = [
      [s.open, 'Open films'], [s.collecting, 'Collecting files'], [s.inProduction, 'In production'],
      [s.changes, 'Changes requested'], [money(s.revenueCents), 'Paid (incl. tax)'],
    ].map(([v, l]) => `<div><b>${escHtml(String(v))}</b><span>${escHtml(l)}</span></div>`).join('');
  }

  function filtered() {
    const f = $('film-filter')?.value || 'open';
    if (f === 'all') return projects;
    if (f === 'open') return projects.filter((p) => ['collecting', 'production', 'demo_ready', 'changes', 'final_ready'].includes(p.status));
    return projects.filter((p) => p.status === f);
  }

  function dueText(p) {
    if (!p.demo_due_date || !['production', 'changes'].includes(p.status)) return '';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const late = p.demo_due_date < today;
    return ` &bull; <strong style="color:${late ? '#ff9b9b' : '#fbbf24'};">Demo ${late ? 'was due' : 'due'} ${escHtml(p.demo_due_text || day(p.demo_due_date))}</strong>${p.estimated_done_date ? ` &bull; Done by ${escHtml(day(p.estimated_done_date))}` : ''}`;
  }

  function detailHtml(p, d) {
    if (!d) return '<div class="web-muted" style="margin-top:.5rem;">Loading details…</div>';
    const a = d.project.answers || {};
    const qa = questions.map((q, i) => {
      const v = a[q.id];
      const txt = Array.isArray(v) ? v.join(', ') : (v || '');
      return `<div style="margin:.15rem 0;"><span class="web-muted">${i + 1}. ${escHtml(q.q)}</span> ${txt ? `<b>${escHtml(txt)}</b>` : '<span class="web-muted">(Experts pick)</span>'}</div>`;
    }).join('');
    const files = d.uploads.length
      ? d.uploads.map((u) => `<div style="display:flex; gap:.5rem; align-items:center; margin:.2rem 0; flex-wrap:wrap;">
          ${u.status === 'done' ? `<button type="button" class="btn action-pop" style="padding:.25rem .6rem; font-size:.82rem;" data-film-action="download" data-film-file="${Number(u.id)}">Download</button>` : '<span class="web-muted">(unfinished)</span>'}
          <span>${escHtml(u.filename)}</span><span class="web-muted">${size(u.size_bytes)} &bull; ${escHtml(u.content_type || '')}</span></div>`).join('')
      : '<span class="web-muted">No files yet.</span>';
    const emails = d.emails.length ? d.emails.map((e) => `${escHtml(e.subject)} <span class="web-muted">(${day(e.sent_at)})</span>`).join('<br>') : '<span class="web-muted">None yet.</span>';
    const opts = Object.entries(statuses).filter(([k]) => k !== 'pending_payment' || p.status === 'pending_payment')
      .map(([k, l]) => `<option value="${k}"${k === p.status ? ' selected' : ''}>${escHtml(l)}</option>`).join('');
    return `<div class="film-detail" style="margin-top:.6rem; display:grid; gap:.8rem;">
      <div><b>About:</b> ${escHtml(p.about || '—')}${p.occasion ? `<br><b>Occasion:</b> ${escHtml(p.occasion)}` : ''}${p.needed_by ? `<br><b>Needed by:</b> ${escHtml(day(p.needed_by))}` : ''}</div>
      ${p.links ? `<div><b>Links:</b><br>${p.links.split(/\n+/).filter(Boolean).map((l) => /^https?:\/\//.test(l.trim()) ? `<a href="${escHtml(l.trim())}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan);">${escHtml(l.trim())}</a>` : escHtml(l)).join('<br>')}</div>` : ''}
      <div><b>Answers</b>${qa}</div>
      <div><b>Files (${d.uploads.filter((u) => u.status === 'done').length})</b><br>${files}<div class="web-muted" style="margin-top:.2rem;">Download links last one hour.</div></div>
      <div><b>Rounds of changes:</b> ${Number(p.change_rounds || 0)} of ${Number(p.rounds_included || 2)} used</div>
      ${p.feedback ? `<div><b>Customer feedback</b><pre style="white-space:pre-wrap; font-family:inherit; margin:.2rem 0 0;">${escHtml(p.feedback)}</pre></div>` : ''}
      <div><b>Notes for Chris</b>${p.customer_notes ? ` <span class="web-muted">(updated ${day(p.customer_notes_at)})</span><pre style="white-space:pre-wrap; font-family:inherit; margin:.2rem 0 0;">${escHtml(p.customer_notes)}</pre>` : ' <span class="web-muted">None yet.</span>'}</div>
      <div><b>People with access</b> <span class="web-muted">(codes go only to these addresses)</span>${(d.people || []).map((pp) => {
        const dv = (d.devices || []).find((x) => x.email === pp.email);
        return `<div>${escHtml(pp.name || pp.email)}${pp.name ? ` <span class="web-muted">${escHtml(pp.email)}</span>` : ''}${pp.isOwner ? ' <span class="web-muted">(buyer)</span>' : ''} <span class="web-muted">&bull; ${dv ? `signed in on ${dv.n} browser${dv.n === 1 ? '' : 's'}${dv.seen ? `, last seen ${day(dv.seen)}` : ''}` : 'not signed in'}</span></div>`;
      }).join('')}</div>
      <div><b>Project chat</b> <a href="/support-chat.html" target="_blank" rel="noopener" style="color:var(--cyan);">Reply in Support Chat</a>
        ${(d.chat || []).length ? `<div style="margin-top:.3rem; display:grid; gap:.25rem;">${d.chat.map((m) => `<div><span class="web-muted">${escHtml(m.role === 'staff' ? (m.sender_name || 'You') : (m.sender_name || 'Customer'))}, ${day(m.created_at)}:</span> ${escHtml(m.content)}</div>`).join('')}</div>` : '<div class="web-muted">No messages yet.</div>'}
      </div>
      <div><b>Videos for the customer</b> <span class="web-muted">(upload the files here; they play on the dashboard and the final gets a share page with a download)</span>
        <div style="display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-top:.3rem;">
          <label class="btn action-pop" style="cursor:pointer;">${p.has_demo_video ? 'Replace' : 'Upload'} demo video<input type="file" accept="video/*" data-film-deliver="demo" data-film-id="${p.id}" hidden></label>
          <span class="web-muted" id="film-deliver-demo-${p.id}">${p.has_demo_video ? 'Demo uploaded.' : 'No demo video yet.'}</span>
        </div>
        <div style="display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-top:.3rem;">
          <label class="btn action-pop" style="cursor:pointer;">${p.has_final_video ? 'Replace' : 'Upload'} final film<input type="file" accept="video/*" data-film-deliver="final" data-film-id="${p.id}" hidden></label>
          <span class="web-muted" id="film-deliver-final-${p.id}">${p.has_final_video ? `Final uploaded.${p.share_url ? ` Share page: <a href="${escHtml(p.share_url)}" target="_blank" rel="noopener" style="color:var(--cyan);">${escHtml(p.share_url)}</a>` : ''}` : 'No final film yet.'}</span>
        </div>
        <div class="web-muted" style="margin-top:.25rem;">Then press Email Demo Ready / Email Final Film. (The link fields below are only for a video hosted elsewhere, such as YouTube.)</div>
      </div>
      <div class="web-form-grid">
        <div><label for="film-status-${p.id}">Status</label><select id="film-status-${p.id}">${opts}</select></div>
        <div><label for="film-due-${p.id}">Demo due</label><input id="film-due-${p.id}" type="date" value="${escHtml(p.demo_due_date || '')}"></div>
        <div><label for="film-done-${p.id}">Estimated completion (finished film)</label><input id="film-done-${p.id}" type="date" value="${escHtml(p.estimated_done_date || '')}"></div>
        <div class="web-span"><label for="film-demo-${p.id}">Demo link (YouTube unlisted, Vimeo or a video file URL)</label><input id="film-demo-${p.id}" type="url" placeholder="https://youtu.be/…" value="${escHtml(p.demo_url || '')}"></div>
        <div class="web-span"><label for="film-final-${p.id}">Final film link</label><input id="film-final-${p.id}" type="url" placeholder="https://youtu.be/…" value="${escHtml(p.final_url || '')}"></div>
        <div class="web-span"><label for="film-notes-${p.id}">Internal notes (customer never sees these)</label><textarea id="film-notes-${p.id}" rows="2">${escHtml(p.internal_notes || '')}</textarea></div>
      </div>
      <div class="web-row-actions"><button type="button" class="btn btn-primary" data-film-action="save" data-film-id="${p.id}">Save</button></div>
      <div><b>Emails sent</b><br>${emails}</div>
    </div>`;
  }

  function renderList() {
    const el = $('film-list');
    if (!el) return;
    const rows = filtered();
    if (!rows.length) { el.innerHTML = '<div style="color:var(--muted);">No films for this filter yet.</div>'; return; }
    el.innerHTML = rows.map((p) => {
      const id = Number(p.id);
      const paid = !!p.paid_at;
      const lines = [];
      lines.push(`${escHtml(p.customer_name || 'No name yet')}${p.customer_email ? ` &bull; ${escHtml(p.customer_email)}` : ''}${p.customer_phone ? ` &bull; ${escHtml(p.customer_phone)}` : ''}`);
      lines.push(`${paid ? `Paid ${money(p.amount_cents)}${Number(p.tax_cents) ? ` (incl. ${money(p.tax_cents)} tax, ${escHtml(p.billing_state || '')})` : ''} on ${day(p.paid_at)}` : 'Checkout not finished'} &bull; ${Number(p.file_count || 0)} files (${size(p.file_bytes)})${dueText(p)}`);
      const a = p.answers || {};
      const style = [a.story_type, a.style, a.tone].filter(Boolean).join(' &bull; ');
      if (style) lines.push(`<span class="web-muted">${escHtml(style).replace(/&amp;bull;/g, '&bull;')}</span>`);
      const isOpen = open.has(id);
      return `<div class="web-row">
        <div class="web-row-head"><strong>#${id} ${escHtml(p.project_name || '(not named yet)')}</strong><span>${badge(p.status)}</span></div>
        ${lines.map((l) => `<div style="margin-top:.2rem;">${l}</div>`).join('')}
        <div class="web-row-actions">
          <button type="button" class="btn action-pop" data-film-action="toggle" data-film-id="${id}">${isOpen ? 'Hide Details' : 'Details & Files'}</button>
          ${paid ? `<button type="button" class="btn action-pop" data-film-action="copy" data-film-id="${id}">Copy Dashboard Link</button>
          <button type="button" class="btn action-pop" data-film-action="email" data-film-kind="welcome" data-film-id="${id}">Resend Dashboard Link</button>
          <button type="button" class="btn action-pop" data-film-action="email" data-film-kind="demo" data-film-id="${id}">Email Demo Ready</button>
          <button type="button" class="btn action-pop" data-film-action="email" data-film-kind="final" data-film-id="${id}">Email Final Film</button>
          <button type="button" class="btn action-pop" data-film-action="email" data-film-kind="message" data-film-id="${id}">Message Customer</button>
          <button type="button" class="btn delete" data-film-action="rotate" data-film-id="${id}">New Dashboard Link</button>` : ''}
          ${['pending_payment', 'canceled'].includes(p.status) ? `<button type="button" class="btn delete" data-film-action="delete" data-film-id="${id}">Delete</button>` : ''}
        </div>
        ${isOpen ? detailHtml(p, details.get(id)) : ''}
      </div>`;
    }).join('');
  }

  async function refresh() {
    if (typeof adminSessionActive !== 'undefined' && !adminSessionActive) return;
    const el = $('film-list');
    if (el && !projects.length) el.innerHTML = '<div style="color:var(--muted);">Loading films…</div>';
    try {
      const data = await call(API.list);
      projects = data.projects || [];
      questions = data.questions || [];
      statuses = data.statuses || {};
      renderSummary(data.summary);
      renderList();
      for (const id of open) loadDetail(id);
    } catch (e) {
      const notDeployed = /method not allowed/i.test(e.message);
      if (el) el.innerHTML = notDeployed
        ? '<div style="color:#fbbf24;">The Folder to Film part of the worker isn\'t deployed yet, so there\'s nothing to show. This tab starts working once the worker is deployed (cd worker &amp;&amp; npx wrangler deploy --config wrangler.toml, after creating the films bucket and applying migration 0041).</div>'
        : `<div style="color:#ff9b9b;">${escHtml(e.message)}</div>`;
    }
  }
  window.refreshStoryFilms = refresh;

  async function loadDetail(id) {
    try {
      const d = await call(`${API.detail}?id=${id}`);
      details.set(id, d);
      const i = projects.findIndex((p) => Number(p.id) === id);
      if (i >= 0) projects[i] = { ...projects[i], ...d.project, file_count: projects[i].file_count, file_bytes: projects[i].file_bytes };
      renderList();
    } catch (e) { openErrorModal(e.message); }
  }

  // ----- email modal (worker renders the preview, same as Website Clients) -----
  let draft = null;
  let previewTimer = null;
  let seq = 0;
  const KIND_TITLE = { welcome: 'Resend Dashboard Link', demo: 'Demo Ready Email', final: 'Final Film Email', message: 'Message Customer' };
  function showModal(el) { el.classList.add('active'); el.setAttribute('aria-hidden', 'false'); }
  function hideModal(el) { if (!el) return; el.classList.remove('active'); el.setAttribute('aria-hidden', 'true'); }
  function setPreview(html) {
    const host = $('film-email-preview');
    if (!host) return;
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host{all:initial;display:block;} a{pointer-events:none;}</style>${html || ''}`;
  }
  async function renderPreview() {
    if (!draft) return;
    const my = ++seq;
    $('film-email-status').textContent = '(updating…)';
    try {
      const d = await call(API.email, { id: draft.id, kind: draft.kind, preview: true, subject: $('film-email-subject').value, body: $('film-email-body').value });
      if (my !== seq) return;
      setPreview(d.html);
      $('film-email-status').textContent = d.body.includes(d.link) ? '' : '(heads up: the dashboard link is no longer in the email)';
    } catch (e) { $('film-email-status').textContent = `(preview failed: ${e.message})`; }
  }
  async function openEmail(p, kind) {
    const d = await call(API.email, { id: Number(p.id), kind, preview: true });
    draft = { id: Number(p.id), kind, to: d.to };
    $('film-email-title').textContent = KIND_TITLE[kind] || 'Email';
    $('film-email-to').innerHTML = `To: <b>${escHtml(d.to || '(no email)')}</b> &middot; #${Number(p.id)} ${escHtml(p.project_name || '')}`;
    $('film-email-subject').value = d.subject;
    $('film-email-body').value = d.body;
    setPreview(d.html);
    $('film-email-status').textContent = '';
    const b = $('film-email-send-btn'); b.disabled = false; b.textContent = 'Send Email';
    showModal($('film-email-modal'));
    $('film-email-body').focus();
  }
  async function sendEmail() {
    if (!draft) return;
    const b = $('film-email-send-btn');
    b.disabled = true; b.textContent = 'Sending…';
    try {
      await call(API.email, { id: draft.id, kind: draft.kind, send: true, subject: $('film-email-subject').value, body: $('film-email-body').value });
      const to = draft.to;
      hideModal($('film-email-modal')); draft = null;
      openSuccessModal(`Sent to ${to}.`, 'Email Sent');
      await refresh();
    } catch (e) {
      b.disabled = false; b.textContent = 'Send Email';
      openErrorModal(e.message);
    }
  }

  async function onAction(btn) {
    const action = btn.getAttribute('data-film-action');
    const id = Number(btn.getAttribute('data-film-id'));
    const p = projects.find((x) => Number(x.id) === id);
    try {
      if (action === 'toggle') {
        if (open.has(id)) { open.delete(id); renderList(); } else { open.add(id); renderList(); loadDetail(id); }
      } else if (action === 'copy') {
        try { await navigator.clipboard.writeText(p.dashboard_url); openSuccessModal('Dashboard link copied.', 'Copied'); } catch { prompt('Copy the dashboard link:', p.dashboard_url); }
      } else if (action === 'email') {
        const kind = btn.getAttribute('data-film-kind');
        if (kind === 'demo' && !p.demo_url && !p.has_demo_video) { openErrorModal('Upload the demo video (or add its link) in Details & Files first.'); return; }
        if (kind === 'final' && !p.final_url && !p.has_final_video) { openErrorModal('Upload the final film (or add its link) in Details & Files first.'); return; }
        await openEmail(p, kind);
      } else if (action === 'save') {
        btn.disabled = true;
        await call(API.update, {
          id,
          status: $(`film-status-${id}`).value,
          demoDueDate: $(`film-due-${id}`).value,
          estimatedDoneDate: $(`film-done-${id}`).value,
          demoUrl: $(`film-demo-${id}`).value.trim(),
          finalUrl: $(`film-final-${id}`).value.trim(),
          notes: $(`film-notes-${id}`).value,
        });
        btn.disabled = false;
        await refresh();
      } else if (action === 'rotate') {
        const msg = `Make a new dashboard link for #${id}? The old link stops working right away (use this if it leaked). Then use Resend Dashboard Link to email the new one.`;
        const ok = typeof openConfirmModal === 'function' ? await openConfirmModal(msg) : confirm(msg);
        if (!ok) return;
        await call(API.update, { id, rotateToken: true });
        await refresh();
        openSuccessModal('New link made. The old one no longer works. Use Resend Dashboard Link to email the new one.', 'Link Reset');
      } else if (action === 'download') {
        const r = await call(API.fileLink, { fileId: Number(btn.getAttribute('data-film-file')) });
        window.location.href = r.url;
      } else if (action === 'delete') {
        const ok = typeof openConfirmModal === 'function'
          ? await openConfirmModal(`Delete film #${id} and all of its uploaded files? This can't be undone.`)
          : confirm(`Delete film #${id} and all of its uploaded files? This can't be undone.`);
        if (!ok) return;
        await call(API.del, { id });
        open.delete(id); details.delete(id);
        await refresh();
      }
    } catch (e) {
      btn.disabled = false;
      openErrorModal(e.message);
    }
  }

  document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'film-email-subject' || e.target.id === 'film-email-body')) {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 450);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('film-email-modal')?.classList.contains('active')) { hideModal($('film-email-modal')); draft = null; }
  });
  document.addEventListener('click', (e) => {
    const id = e.target?.id;
    if (id === 'film-email-cancel-btn' || id === 'film-email-modal') { hideModal($('film-email-modal')); draft = null; return; }
    if (id === 'film-email-send-btn') { sendEmail(); return; }
    if (id === 'film-refresh-btn') { refresh(); return; }
    const t = e.target.closest('[data-film-action]');
    if (t) onAction(t);
  });
  // Upload a demo or final video straight into storage (multipart, 20 MB parts).
  async function deliverUpload(input) {
    const id = Number(input.getAttribute('data-film-id'));
    const kind = input.getAttribute('data-film-deliver');
    const file = input.files && input.files[0];
    const status = $(`film-deliver-${kind}-${id}`);
    if (!file) return;
    input.disabled = true;
    const say = (t) => { if (status) status.textContent = t; };
    try {
      const st = await call(API.deliverStart, { id, kind, name: file.name, size: file.size, type: file.type || 'video/mp4' });
      const parts = [];
      for (let n = 1; n <= st.parts; n++) {
        const blob = file.slice((n - 1) * st.partBytes, Math.min(n * st.partBytes, file.size));
        for (let attempt = 1; ; attempt++) {
          try {
            const res = await fetch(`${API.deliverPart}?id=${id}&key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&part=${n}`,
              { method: 'POST', headers: { 'X-Admin-Session': adminSessionToken, 'Content-Type': 'application/octet-stream' }, body: blob });
            const d = await res.json().catch(() => ({}));
            if (!res.ok || !d.ok) throw new Error(d.error || `Upload failed (${res.status})`);
            parts.push({ part: d.part, etag: d.etag });
            break;
          } catch (err) {
            if (attempt >= 4) throw err;
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
        }
        say(`Uploading ${kind}… ${Math.round((n / st.parts) * 100)}%`);
      }
      const done = await call(API.deliverComplete, { id, kind, key: st.key, uploadId: st.uploadId, parts });
      say(kind === 'final' ? `Final uploaded. Share page: ${done.shareUrl}` : 'Demo uploaded.');
      await loadDetail(id);
    } catch (err) {
      say(`Upload failed: ${err.message}`);
    } finally { input.disabled = false; input.value = ''; }
  }

  document.addEventListener('change', (e) => {
    if (e.target.id === 'film-filter') renderList();
    if (e.target.matches && e.target.matches('input[data-film-deliver]')) deliverUpload(e.target);
  });
})();
