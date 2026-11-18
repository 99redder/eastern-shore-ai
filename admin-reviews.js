// ===== Customer Reviews (Survival Node Orders card) =====
// One-tap ratings from the review request email (worker/src/reviews.js). Loaded after
// admin.js; uses its globals (CONTACT_API_URL, adminSessionToken, escHtml). The admin DOM is
// re-mounted from a <template> on login, so events are delegated from document and elements
// are looked up on use. Approve every genuine review, low ones included; "Hide" is for spam
// or abuse only (FTC 2024 review rule, Google's review policies).
(function () {
  const REVIEWS_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/reviews');
  const REVIEW_STATUS_API_URL = CONTACT_API_URL.replace('/api/contact', '/api/reviews/status');
  const STATUS_COLORS = { pending: '#f5b301', approved: '#3ecf8e', hidden: '#8a93a8' };
  const STATUS_LABELS = { pending: 'Waiting for you', approved: 'Approved', hidden: 'Hidden (spam/abuse)' };
  let loading = false;

  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const esc = (s) => (typeof escHtml === 'function' ? escHtml(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  function row(r) {
    const color = STATUS_COLORS[r.status] || '#8a93a8';
    const buttons = [
      r.status !== 'approved' ? `<button type="button" class="btn btn-primary" data-review-id="${r.id}" data-review-status="approved">Approve</button>` : '',
      r.status !== 'pending' ? `<button type="button" class="btn" data-review-id="${r.id}" data-review-status="pending">Back to waiting</button>` : '',
      r.status !== 'hidden' ? `<button type="button" class="btn" data-review-id="${r.id}" data-review-status="hidden" title="Only for spam or abuse, never for a low rating">Hide (spam)</button>` : '',
    ].join('');
    return `<div class="admin-list-item" style="border-left:4px solid ${color}; padding:.7rem .8rem; margin:.4rem 0;">
      <div style="display:flex; flex-wrap:wrap; gap:.4rem 1rem; align-items:baseline;">
        <span style="color:#f5b301; font-size:1.15rem; letter-spacing:.05em;" aria-label="${r.rating} of 5">${stars(Number(r.rating) || 0)}</span>
        <strong>${esc(r.publicName)}</strong>
        <span style="color:${color}; font-size:.85rem; font-weight:700;">${esc(STATUS_LABELS[r.status] || r.status)}</span>
        <span style="color:var(--muted); font-size:.85rem;">${esc(String(r.rated_at || '').slice(0, 16).replace('T', ' '))} UTC</span>
      </div>
      <div style="color:var(--muted); font-size:.85rem; margin:.2rem 0;">${esc(r.customer_name || '')} · ${esc(r.customer_email || '')}${r.order_number ? ` · order #${esc(r.order_number)}` : ''}</div>
      ${r.comment ? `<div style="white-space:pre-wrap; margin:.4rem 0;">${esc(r.comment)}</div>` : '<div style="color:var(--muted); font-style:italic; margin:.4rem 0;">No comment</div>'}
      <div style="display:flex; gap:.4rem; flex-wrap:wrap;">${buttons}</div>
    </div>`;
  }

  async function loadReviews() {
    const list = document.getElementById('reviews-list');
    const summary = document.getElementById('reviews-summary');
    if (!list || loading || !adminSessionToken) return;
    loading = true;
    list.textContent = 'Loading reviews…';
    try {
      const res = await fetch(REVIEWS_API_URL, { headers: { 'X-Admin-Session': adminSessionToken } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const waiting = data.reviews.filter((r) => r.status === 'pending').length;
      if (summary) {
        summary.textContent = `${data.approvedCount} approved${data.approvedCount ? ` (average ${data.average})` : ''} · ${waiting} waiting · ${data.invitedWaiting} emailed, not rated yet`
          + (data.approvedCount < data.minToShow ? ` · shows on node.html at ${data.minToShow}` : ' · showing on node.html');
      }
      list.innerHTML = data.reviews.length ? data.reviews.map(row).join('') : 'No ratings yet. They appear here as soon as a customer taps a star.';
    } catch (e) {
      list.textContent = `Couldn't load reviews: ${e.message}`;
    } finally {
      loading = false;
    }
  }

  async function setStatus(id, status, btn) {
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(REVIEW_STATUS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Session': adminSessionToken },
        body: JSON.stringify({ id: Number(id), status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await loadReviews();
    } catch (e) {
      if (btn) btn.disabled = false;
      const summary = document.getElementById('reviews-summary');
      if (summary) summary.textContent = `Couldn't update: ${e.message}`;
    }
  }

  document.addEventListener('click', (e) => {
    const statusBtn = e.target.closest('[data-review-status]');
    if (statusBtn) { setStatus(statusBtn.dataset.reviewId, statusBtn.dataset.reviewStatus, statusBtn); return; }
    if (e.target.closest('#reviews-refresh-btn')) { loadReviews(); return; }
    // Load with the orders: opening the tab, expanding the card or refreshing orders.
    if (e.target.closest('[data-admin-tab="orders"], #orders-collapse-btn, #order-refresh-btn')) setTimeout(loadReviews, 300);
  });
})();
