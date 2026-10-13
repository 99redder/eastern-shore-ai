// ===== Seasonal Sale Themes (node.html + buynode.html) =====
// Picks the active sale from the date in America/New_York and dresses the
// page for it. Outside every window it does nothing, so the pages fall back
// to their normal look. Price is the same in every sale; only copy and
// styling change. Preview any theme with ?sale=halloween|thanksgiving|christmas|none
(function() {
  const SALES = [
    {
      key: 'halloween', name: 'Halloween Sale', start: '2026-10-01', end: '2026-10-31',
      endsLong: 'October 31', endsShort: 'Oct 31', icon: '🎃',
      drift: ['🎃', '🦇', '👻', '🕸️'],
      banner: '#ff8a1f',
      accent: '#ff8a1f', accentInk: '#1a0d00', glow: 'rgba(255, 138, 31, .55)'
    },
    {
      key: 'thanksgiving', name: 'Thanksgiving Sale', start: '2026-11-01', end: '2026-11-30',
      endsLong: 'November 30', endsShort: 'Nov 30', icon: '🦃',
      drift: ['🍂', '🍁', '🦃', '🌽'],
      banner: '#b5743a',
      accent: '#f0c987', accentInk: '#2b1606', glow: 'rgba(217, 142, 74, .55)'
    },
    {
      key: 'christmas', name: 'Christmas Sale', start: '2026-12-01', end: '2026-12-25',
      endsLong: 'December 25', endsShort: 'Dec 25', icon: '🎄',
      drift: ['❄️', '❄️', '🎄', '🎁'],
      banner: '#e5383b',
      accent: '#7fe0a0', accentInk: '#06210f', glow: 'rgba(255, 107, 107, .5)'
    }
  ];

  function activeSale() {
    const forced = new URLSearchParams(window.location.search).get('sale');
    if (forced) return SALES.find(s => s.key === forced) || null;
    // en-CA formats as YYYY-MM-DD, which compares correctly as a string
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    return SALES.find(s => today >= s.start && today <= s.end) || null;
  }

  function setText(selector, text) {
    document.querySelectorAll(selector).forEach(el => { el.textContent = text; });
  }

  function injectStyles(sale) {
    const style = document.createElement('style');
    style.textContent = `
      .kit-offer-save, .offer-save { background: ${sale.accent} !important; color: ${sale.accentInk} !important; }
      .kit-offer { border-color: ${sale.accent} !important; box-shadow: 0 0 14px ${sale.glow}; }
      .kit-offer-urgency, .offer-urgency, .checkout-offer-note { color: ${sale.accent} !important; }
      .buy-now-float { box-shadow: 0 0 22px ${sale.glow} !important; }
      .sale-ribbon {
        margin: 0 0 1rem; padding: .55rem .8rem; border-radius: 6px;
        background: ${sale.banner}; color: #000; text-align: center;
        font-family: 'Hanken Grotesk', sans-serif; font-weight: 800;
        font-size: .95rem; letter-spacing: .04em; text-transform: uppercase;
        box-shadow: 0 0 14px ${sale.glow};
      }
      .sale-ribbon small { display: block; font-size: .72rem; font-weight: 700; letter-spacing: .02em; text-transform: none; }
      .sale-drift { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 5; }
      .sale-drift span {
        position: absolute; top: -2.5rem; opacity: .5;
        animation: sale-drift-fall linear infinite;
      }
      @keyframes sale-drift-fall {
        0%   { transform: translate3d(0, 0, 0) rotate(0deg); }
        100% { transform: translate3d(3rem, calc(100vh + 4rem), 0) rotate(300deg); }
      }
      @media (prefers-reduced-motion: reduce) { .sale-drift { display: none; } }
    `;
    document.head.appendChild(style);
  }

  function addDrift(sale) {
    const layer = document.createElement('div');
    layer.className = 'sale-drift';
    layer.setAttribute('aria-hidden', 'true');
    const count = window.innerWidth < 600 ? 7 : 12;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      piece.textContent = sale.drift[i % sale.drift.length];
      piece.style.left = (Math.random() * 96) + '%';
      piece.style.fontSize = (0.9 + Math.random() * 0.8) + 'rem';
      piece.style.animationDuration = (14 + Math.random() * 14) + 's';
      piece.style.animationDelay = (-Math.random() * 28) + 's';
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
  }

  function applySale(sale) {
    document.documentElement.dataset.sale = sale.key;
    injectStyles(sale);
    addDrift(sale);

    const urgency = `${sale.icon} ${sale.name} — ends ${sale.endsLong}, while supplies last.`;
    const shortNote = `${sale.icon} ${sale.name} · Ends ${sale.endsShort}`;
    setText('.kit-offer-urgency, .offer-urgency', urgency);
    setText('.checkout-offer-note', `${sale.name}: save $100 through ${sale.endsLong} — while supplies last.`);

    // node.html promo banner
    const banner = document.getElementById('promo-banner');
    if (banner) {
      banner.style.background = sale.banner;
      const icon = banner.querySelector('.promo-header > span[aria-hidden]');
      if (icon) { icon.textContent = sale.icon; icon.title = sale.name; }
      setText('#promo-banner .promo-short', `${sale.name} — Save $100`);
      setText('#promo-banner .promo-long', ` | Ends ${sale.endsLong}`);
      const copy = banner.querySelector('.promo-copy > p');
      if (copy) copy.innerHTML = `Regularly <s>$349.99</s> — <strong>now $249.99</strong> through ${sale.endsLong}, while supplies last.`;
    }

    // node.html floating buy button + mobile FAB
    const floatNote = document.querySelector('.buy-now-float .float-offer-note');
    if (floatNote) floatNote.textContent = shortNote;
    const fab = document.getElementById('mobile-buy-fab');
    if (fab) {
      fab.setAttribute('aria-label', `Buy Survival Node Gen 2 — ${sale.name}, regularly $349.99, now $249.99 through ${sale.endsLong}`);
      const fabNote = fab.querySelector('.mobile-buy-fab-copy small:last-child');
      if (fabNote) fabNote.textContent = shortNote;
    }

    // buynode.html has no promo banner, so the card gets its own ribbon
    const buyCard = document.querySelector('.buy-card');
    if (buyCard) {
      const ribbon = document.createElement('div');
      ribbon.className = 'sale-ribbon';
      ribbon.innerHTML = `${sale.icon} ${sale.name} — Save $100 ${sale.icon}<small>Ends ${sale.endsLong} · While supplies last</small>`;
      buyCard.insertBefore(ribbon, buyCard.firstChild);
    }
  }

  function init() {
    const sale = activeSale();
    if (sale) applySale(sale);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
