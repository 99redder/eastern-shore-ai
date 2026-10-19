/* Preview-site owner kit for the "I built you a website" campaign.
   Include on a preview site:  <script src="/preview-kit.js" data-slug="grants" defer></script>
   - Pings the worker once per load so Chris gets an email when someone opens the site
     (skipped for Chris: visit any preview once with ?me=1 to mark this browser; ?me=0 undoes it).
   - After a short delay, shows one small, dismissible pill. Tapping it opens a compact card
     where the owner can book a call or text (any day/time) or say "not for me".
   Everything renders inside a shadow root so it never inherits or breaks the site's own styles. */
(function () {
  var script = document.currentScript;
  var slug = script && script.getAttribute('data-slug');
  if (!slug) return;
  var API = 'https://eastern-shore-ai-contact.99redder.workers.dev';
  var params = new URLSearchParams(location.search);
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  if (params.get('me') === '1') store('esai_me', '1');
  if (params.get('me') === '0') store('esai_me', null);
  var isMe = store('esai_me') === '1';

  // Visit ping (the worker de-duplicates and ignores bots).
  if (!navigator.webdriver) {
    try {
      // text/plain keeps this a "simple" request (no CORS preflight), which every browser sends reliably.
      fetch(API + '/api/preview/visit', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ slug: slug, ref: params.get('r') || '', me: isMe }) }).catch(function () {});
    } catch (e) {}
  }

  var site = { name: '', phone: '', email: '' };
  fetch(API + '/api/preview/site?slug=' + encodeURIComponent(slug)).then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.ok) site = d; }).catch(function () {});

  var host = document.createElement('div');
  host.id = 'esai-preview-kit';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}' +
    '.pill{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:2147483000;display:flex;align-items:center;gap:8px;' +
      'background:#111827;color:#fff;border-radius:999px;padding:7px 8px 7px 7px;box-shadow:0 8px 24px -8px rgba(0,0,0,.45);' +
      'opacity:0;transform:translateY(12px);transition:opacity .35s,transform .35s;font-size:14px;line-height:1.2}' +
    '.pill.show{opacity:1;transform:none}' +
    '.pill.show.away{opacity:0;transform:translateY(12px);pointer-events:none}' +
    '.pill button.open{all:unset;cursor:pointer;display:flex;align-items:center;gap:9px;font-weight:600;font-size:14px;color:#fff}' +
    '.av{width:28px;height:28px;border-radius:50%;background:#10B981;color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px;flex:none}' +
    '.x{all:unset;cursor:pointer;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;color:#9CA3AF;font-size:17px}' +
    '.x:hover{color:#fff;background:rgba(255,255,255,.1)}' +
    '.card{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:2147483001;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 36px);overflow:auto;' +
      'background:#fff;color:#111827;border-radius:16px;box-shadow:0 24px 60px -16px rgba(0,0,0,.5);padding:18px 18px 16px;font-size:15px;line-height:1.45}' +
    '.card[hidden],.pill[hidden]{display:none}' +
    '.head{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}' +
    '.head h2{margin:2px 0 0;font-size:17px;line-height:1.3}' +
    '.card .x{color:#6B7280;margin-left:auto;flex:none}.card .x:hover{background:#F3F4F6;color:#111827}' +
    'p{margin:0 0 12px}.muted{color:#4B5563;font-size:14px}' +
    '.btn{all:unset;box-sizing:border-box;cursor:pointer;display:block;width:100%;text-align:center;padding:12px 14px;border-radius:10px;font-weight:700;font-size:15px;margin-top:8px}' +
    '.go{background:#10B981;color:#fff}.go:hover{background:#059669}' +
    '.alt{background:#F3F4F6;color:#374151}.alt:hover{background:#E5E7EB}' +
    '.link{all:unset;cursor:pointer;color:#4B5563;font-size:14px;text-decoration:underline;display:inline-block;margin-top:10px}' +
    'label{display:block;font-size:13px;font-weight:600;color:#374151;margin:10px 0 4px}' +
    'input,select,textarea{width:100%;font-size:16px;padding:10px 11px;border:1px solid #D1D5DB;border-radius:9px;background:#fff;color:#111827}' +
    'textarea{min-height:64px;resize:vertical}' +
    '.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.seg{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px}' +
    '.seg label{margin:0;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid #D1D5DB;border-radius:9px;padding:9px;font-size:14px;cursor:pointer}' +
    '.seg input{width:auto;margin:0}.seg label:has(input:checked){border-color:#10B981;background:#ECFDF5;color:#065F46}' +
    '.err{color:#B91C1C;font-size:14px;margin-top:8px}' +
    '.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
    '.ok{background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:12px;margin-bottom:10px}' +
    '@media (max-width:700px){' +
      '.pill{right:12px;bottom:calc(88px + env(safe-area-inset-bottom,0px));font-size:13px}' +
      '.card{right:12px;left:12px;width:auto;bottom:calc(12px + env(safe-area-inset-bottom,0px));max-height:calc(100vh - 24px)}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.pill{transition:none}}' +
    '</style>' +
    '<div class="pill" hidden><button class="open" type="button"><span class="av">C</span><span>Like your new site?</span></button><button class="x" type="button" aria-label="Hide">×</button></div>' +
    '<div class="card" role="dialog" aria-modal="false" aria-labelledby="h" hidden></div>';
  document.body.appendChild(host);

  var pill = root.querySelector('.pill');
  var card = root.querySelector('.card');
  var dismissedKey = 'esai_pill_hidden_' + slug;

  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bizName() { return site.name || 'your business'; }

  function head(title) {
    return '<div class="head"><span class="av">C</span><h2 id="h">' + title + '</h2><button class="x" type="button" data-close aria-label="Close">×</button></div>';
  }

  // ET calendar helpers.
  function etParts(d) {
    var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; }); return p;
  }
  function dayOptions() {
    var out = [], now = new Date();
    for (var i = 0; i < 21; i++) {
      var d = new Date(now.getTime() + i * 86400000), p = etParts(d);
      var iso = p.year + '-' + p.month + '-' + p.day;
      var label = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
      out.push('<option value="' + iso + '">' + (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : label) + '</option>');
    }
    return out.join('');
  }
  function timeOptions(dayIso) {
    var p = etParts(new Date()), today = p.year + '-' + p.month + '-' + p.day;
    var nowMin = (+p.hour) * 60 + (+p.minute);
    var out = ['<option value="any">Any time</option>'];
    for (var m = 8 * 60; m <= 20 * 60; m += 30) {
      if (dayIso === today && m < nowMin + 30) continue;
      var h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? 'PM' : 'AM', hh = h % 12 || 12;
      out.push('<option value="' + (h < 10 ? '0' : '') + h + ':' + (mm ? '30' : '00') + '">' + hh + ':' + (mm ? '30' : '00') + ' ' + ap + '</option>');
    }
    return out.join('');
  }

  function showStart() {
    card.innerHTML = head('Hi, I\'m Chris. I built this site for ' + esc(bizName()) + '.') +
      '<p>Take your time looking around. If you\'d like to keep it, pick a time and I\'ll reach out. It only takes a few minutes.</p>' +
      '<button class="btn go" type="button" data-step="book">Yes, set up a quick call</button>' +
      '<button class="btn alt" type="button" data-step="not">Not for me</button>' +
      '<p class="muted" style="margin:12px 0 0">Or call or text me any time: <a href="tel:+13029079162" style="color:#065F46">(302) 907-9162</a></p>';
    openCard();
  }

  function showBook() {
    var days = dayOptions();
    card.innerHTML = head('When should I reach out?') +
      '<form novalidate>' +
      '<div class="row"><div><label for="d">Day</label><select id="d" name="date">' + days + '</select></div>' +
      '<div><label for="t">Time (Eastern)</label><select id="t" name="time"></select></div></div>' +
      '<label>How should I reach you?</label><div class="seg"><label><input type="radio" name="method" value="call" checked> Call me</label><label><input type="radio" name="method" value="text"> Text me first</label></div>' +
      '<label for="ph">Best number</label><input id="ph" name="phone" type="tel" autocomplete="tel" value="' + esc(site.phone) + '">' +
      '<label for="em">Email for a confirmation (optional)</label><input id="em" name="email" type="email" autocomplete="email" value="' + esc(site.email) + '">' +
      '<label for="nm">Your name (optional)</label><input id="nm" name="name" type="text" autocomplete="name">' +
      '<label for="nt">Anything I should know? (optional)</label><textarea id="nt" name="note"></textarea>' +
      '<div class="hp"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<div class="err" hidden></div>' +
      '<button class="btn go" type="submit">Book my call</button>' +
      '<button class="link" type="button" data-step="start">Back</button>' +
      '</form>';
    var d = card.querySelector('#d'), t = card.querySelector('#t');
    function fill() { t.innerHTML = timeOptions(d.value); }
    d.addEventListener('change', fill); fill();
    if (t.options.length < 2) { d.selectedIndex = 1; fill(); }
    card.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); submit(e.target, 'interested'); });
  }

  function showNot() {
    card.innerHTML = head('No problem at all.') +
      '<form novalidate><p>Thanks for taking a look. Mind telling me why? It helps me a lot. (Optional)</p>' +
      '<textarea name="note" placeholder="Already have a site, not the right time, etc."></textarea>' +
      '<div class="hp"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>' +
      '<div class="err" hidden></div>' +
      '<button class="btn alt" type="submit">Send</button>' +
      '<button class="link" type="button" data-step="start">Back</button></form>';
    card.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); submit(e.target, 'not'); });
  }

  function icsBlob(dateIso, time, method, phone) {
    var anytime = time === 'any';
    var y = dateIso.replace(/-/g, '');
    var start, end;
    if (anytime) { start = 'DTSTART;VALUE=DATE:' + y; end = ''; }
    else { var hm = time.replace(':', '') + '00'; start = 'DTSTART;TZID=America/New_York:' + y + 'T' + hm;
      var mins = (+time.slice(0, 2)) * 60 + (+time.slice(3)) + 15; end = 'DTEND;TZID=America/New_York:' + y + 'T' + String(Math.floor(mins / 60)).padStart(2, '0') + String(mins % 60).padStart(2, '0') + '00'; }
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eastern Shore AI//Preview Call//EN', 'BEGIN:VEVENT', 'UID:' + Date.now() + '@easternshore.ai',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), start];
    if (end) lines.push(end);
    lines.push('SUMMARY:Call with Chris (Eastern Shore AI) about your website',
      'DESCRIPTION:Chris will ' + (method === 'text' ? 'text you first' : 'call you') + ' at ' + phone + '. Questions: (302) 907-9162.', 'END:VEVENT', 'END:VCALENDAR');
    return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  }

  function submit(form, choice) {
    var f = new FormData(form), err = form.querySelector('.err'), btn = form.querySelector('button[type=submit]');
    var body = { slug: slug, choice: choice, website: f.get('website') || '', note: f.get('note') || '' };
    if (choice === 'interested') {
      body.date = f.get('date'); body.time = f.get('time'); body.method = f.get('method');
      body.phone = f.get('phone'); body.email = f.get('email'); body.name = f.get('name');
      if (String(body.phone || '').replace(/\D/g, '').length < 10) { err.textContent = 'Please enter a phone number with area code.'; err.hidden = false; return; }
    }
    err.hidden = true; btn.disabled = true; btn.textContent = 'Sending…';
    fetch(API + '/api/preview/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok && d.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.d && res.d.error) || 'Something went wrong.');
        if (choice === 'not') {
          card.innerHTML = head('Thanks for letting me know.') + '<p>I appreciate you taking a look. I\'ll take the site down, and you won\'t hear from me about it again.</p><button class="btn alt" type="button" data-close>Close</button>';
          store(dismissedKey, '1');
          return;
        }
        var how = body.method === 'text' ? 'text you first at ' : 'call you at ';
        card.innerHTML = head('You\'re all set!') +
          '<div class="ok">I\'ll ' + how + '<strong>' + esc(body.phone) + '</strong> on <strong>' + esc(res.d.label) + '</strong>.</div>' +
          (body.email ? '<p class="muted">A confirmation is on its way to ' + esc(body.email) + '.</p>' : '') +
          '<a class="btn go" style="text-decoration:none" download="call-with-chris.ics" href="' + icsBlob(body.date, body.time, body.method, body.phone) + '">Add to my calendar</a>' +
          '<button class="btn alt" type="button" data-close>Back to my site</button>';
        store(dismissedKey, '1');
      })
      .catch(function (e) {
        err.textContent = e.message + ' You can also call or text (302) 907-9162.'; err.hidden = false;
        btn.disabled = false; btn.textContent = choice === 'not' ? 'Send' : 'Book my call';
      });
  }

  function openCard() { card.hidden = false; pill.hidden = true; }
  function closeCard() { card.hidden = true; if (store(dismissedKey) !== '1') { pill.hidden = false; requestAnimationFrame(function () { pill.classList.add('show'); }); } }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-step],[data-close],.open,.pill .x');
    if (!t) return;
    if (t.matches('.open')) return showStart();
    if (t.matches('.pill .x')) { pill.classList.remove('show'); setTimeout(function () { pill.hidden = true; }, 350); store(dismissedKey, '1'); return; }
    if (t.hasAttribute('data-close')) return closeCard();
    var s = t.getAttribute('data-step');
    if (s === 'start') showStart(); else if (s === 'book') showBook(); else if (s === 'not') showNot();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !card.hidden) closeCard(); });

  // Let a footer link open the card too: <a href="#" data-esai-open>…</a>
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-esai-open]');
    if (a) { e.preventDefault(); showStart(); }
  });

  // Show the pill only after they've had a moment with the site: 12 seconds, or once they scroll a third of the page.
  var shown = false;
  function reveal() {
    if (shown || store(dismissedKey) === '1') return;
    shown = true; pill.hidden = false; requestAnimationFrame(function () { pill.classList.add('show'); });
    window.removeEventListener('scroll', onScroll);
  }
  function onScroll() { var h = document.documentElement; if (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) > 0.33) reveal(); }
  // Step aside at the very bottom so the pill never covers the footer.
  window.addEventListener('scroll', function () {
    var h = document.documentElement, left = h.scrollHeight - (window.scrollY || h.scrollTop) - window.innerHeight;
    pill.classList.toggle('away', left < 240);
  }, { passive: true });
  setTimeout(reveal, 12000);
  window.addEventListener('scroll', onScroll, { passive: true });
})();
