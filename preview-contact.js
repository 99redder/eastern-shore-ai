/* "Send us a message" form for the campaign preview sites.
   Include once per site, after the page content:
     <script src="/preview-contact.js?v=1" defer
       data-name="Grant's Service Center" data-slot="#visit .actions"
       data-accent="var(--navy)" data-accent-fg="#fff" data-ink="var(--ink)"
       data-paper="var(--paper)" data-display="var(--display)" data-body="var(--body)"></script>
   - Adds a "Send us a message" button into data-slot (styled like the slot's last button),
     plus any element with [data-contact-open] on the page opens it too.
   - Opens a branded modal (colors and fonts come from the site's own CSS variables).
   - PREVIEW ONLY: nothing is sent or stored. The confirmation says that once the site
     is live, messages go straight to the business's email. */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var d = function (k, f) { return s.getAttribute('data-' + k) || f; };
  var NAME = d('name', 'us');
  var DCSS = d('display-css', 'font-weight:700');
  var C = { accent: d('accent', '#1f2937'), accentFg: d('accent-fg', '#fff'), ink: d('ink', '#111827'), paper: d('paper', '#fff'), display: d('display', 'inherit'), body: d('body', 'inherit') };

  function lang() { var el = document.getElementById('site'); return (el && el.getAttribute('data-lang')) || 'en'; }
  var T = {
    en: { btn: 'Send us a message', title: 'Send ' + NAME + ' a message', sub: "Questions, quotes or just saying hi. We'll get back to you.",
      name: 'Your name', reach: 'Phone or email', msg: 'Message', send: 'Send message', close: 'Close',
      need: 'Please add a message and a way to reach you.',
      done: 'Thanks{n}! Your message is ready to go.',
      note: 'This is a preview of the site, so the form isn’t connected yet. Once the site is live, messages here go straight to ' + NAME + "’s email.",
      prev: 'Preview: this form isn’t connected yet.' },
    es: { btn: 'Envíenos un mensaje', title: 'Envíe un mensaje a ' + NAME, sub: 'Preguntas, cotizaciones o solo saludar. Le responderemos.',
      name: 'Su nombre', reach: 'Teléfono o correo', msg: 'Mensaje', send: 'Enviar mensaje', close: 'Cerrar',
      need: 'Por favor escriba un mensaje y cómo contactarle.',
      done: '¡Gracias{n}! Su mensaje está listo.',
      note: 'Esta es una vista previa del sitio, así que el formulario aún no está conectado. Cuando el sitio esté activo, los mensajes llegarán directamente al correo de ' + NAME + '.',
      prev: 'Vista previa: este formulario aún no está conectado.' }
  };
  function t(k) { return (T[lang()] || T.en)[k]; }

  // Button in the page, styled like its neighbours.
  var slot = document.querySelector(d('slot', '#visit .actions'));
  var pageBtn = null;
  if (slot) {
    var sib = slot.querySelector('a.btn-ghost, a.btn:last-of-type, a:last-of-type, button:last-of-type');
    pageBtn = document.createElement('button');
    pageBtn.type = 'button';
    pageBtn.className = (sib && sib.className) || 'btn';
    pageBtn.setAttribute('data-contact-open', '');
    pageBtn.style.cursor = 'pointer';
    pageBtn.style.font = sib ? getComputedStyle(sib).font : '';
    slot.appendChild(pageBtn);
  }
  function labelBtn() { if (pageBtn) pageBtn.textContent = t('btn'); }
  labelBtn();

  var host = document.createElement('div');
  host.id = 'esai-contact';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box}' +
    '.ov{position:fixed;inset:0;z-index:2147483100;background:rgba(10,12,16,.55);display:grid;place-items:center;padding:16px;opacity:0;transition:opacity .2s}' +
    '.ov.on{opacity:1}.ov[hidden]{display:none}' +
    '.card{width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;background:' + C.paper + ';color:' + C.ink + ';border-radius:16px;padding:24px 22px 20px;font:400 16px/1.5 ' + C.body + ';box-shadow:0 30px 70px -20px rgba(0,0,0,.55);transform:translateY(10px);transition:transform .2s;border-top:6px solid ' + C.accent + '}' +
    '.ov.on .card{transform:none}' +
    '.hd{display:flex;gap:12px;align-items:flex-start}' +
    'h2{font-family:' + C.display + ';' + DCSS + ';font-size:1.55rem;line-height:1.15;margin:0;flex:1;text-wrap:balance}' +
    '.x{all:unset;cursor:pointer;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:22px;line-height:1;opacity:.7}.x:hover{opacity:1;background:rgba(0,0,0,.06)}' +
    '.sub{margin:6px 0 14px;opacity:.8}' +
    'label{display:block;font-weight:700;font-size:.9rem;margin:12px 0 5px}' +
    'input,textarea{width:100%;font:400 16px/1.4 ' + C.body + ';color:inherit;background:#fff;border:1.5px solid rgba(0,0,0,.18);border-radius:10px;padding:11px 12px}' +
    'input:focus,textarea:focus{outline:3px solid ' + C.accent + ';outline-offset:1px;border-color:transparent}' +
    'textarea{min-height:110px;resize:vertical}' +
    '.go{all:unset;box-sizing:border-box;cursor:pointer;display:block;width:100%;text-align:center;margin-top:16px;padding:13px 16px;border-radius:10px;background:' + C.accent + ';color:' + C.accentFg + ';font:700 1.02rem ' + C.body + '}' +
    '.go:hover{filter:brightness(1.08)}' +
    '.err{color:#B42318;font-size:.92rem;margin-top:10px}' +
    '.prev{margin:10px 0 0;font-size:.82rem;opacity:.65;text-align:center}' +
    '.ok{text-align:center;padding:8px 4px 4px}' +
    '.ok .tick{width:56px;height:56px;border-radius:50%;margin:4px auto 12px;display:grid;place-items:center;background:' + C.accent + ';color:' + C.accentFg + ';font-size:28px}' +
    '.ok p{margin:8px 0 0}' +
    '@media (prefers-reduced-motion:reduce){.ov,.card{transition:none}}' +
    '</style>' +
    '<div class="ov" hidden><div class="card" role="dialog" aria-modal="true" aria-labelledby="h"></div></div>';
  document.body.appendChild(host);
  var ov = root.querySelector('.ov'), card = root.querySelector('.card'), lastFocus = null;

  function esc(v) { return String(v || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function form() {
    card.innerHTML = '<div class="hd"><h2 id="h">' + esc(t('title')) + '</h2><button class="x" type="button" data-x aria-label="' + esc(t('close')) + '">×</button></div>' +
      '<p class="sub">' + esc(t('sub')) + '</p>' +
      '<form novalidate>' +
      '<label for="cn">' + esc(t('name')) + '</label><input id="cn" name="name" autocomplete="name">' +
      '<label for="cr">' + esc(t('reach')) + '</label><input id="cr" name="reach" autocomplete="email">' +
      '<label for="cm">' + esc(t('msg')) + '</label><textarea id="cm" name="msg"></textarea>' +
      '<div class="err" hidden></div>' +
      '<button class="go" type="submit">' + esc(t('send')) + '</button>' +
      '<p class="prev">' + esc(t('prev')) + '</p></form>';
    card.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(e.target), err = card.querySelector('.err');
      if (!String(f.get('msg') || '').trim() || !String(f.get('reach') || '').trim()) { err.textContent = t('need'); err.hidden = false; return; }
      var n = String(f.get('name') || '').trim().split(/\s+/)[0];
      card.innerHTML = '<div class="hd"><span style="flex:1"></span><button class="x" type="button" data-x aria-label="' + esc(t('close')) + '">×</button></div>' +
        '<div class="ok"><div class="tick" aria-hidden="true">✓</div><h2 id="h">' + esc(t('done').replace('{n}', n ? ', ' + n : '')) + '</h2>' +
        '<p>' + esc(t('note')) + '</p><button class="go" type="button" data-x>' + esc(t('close')) + '</button></div>';
      var b = card.querySelector('.go'); if (b) b.focus();
    });
  }

  function open() {
    lastFocus = document.activeElement;
    form(); ov.hidden = false;
    requestAnimationFrame(function () { ov.classList.add('on'); var i = card.querySelector('input'); if (i) i.focus(); });
    document.documentElement.style.overflow = 'hidden';
  }
  function close() {
    ov.classList.remove('on');
    setTimeout(function () { ov.hidden = true; }, 180);
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  root.addEventListener('click', function (e) {
    if (e.target === ov || (e.target.closest && e.target.closest('[data-x]'))) close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden) close(); });
  document.addEventListener('click', function (e) {
    var o = e.target.closest && e.target.closest('[data-contact-open]');
    if (o) { e.preventDefault(); open(); }
  });
  var site = document.getElementById('site');
  if (site && window.MutationObserver) new MutationObserver(labelBtn).observe(site, { attributes: true, attributeFilter: ['data-lang'] });
})();
