// Footer script for the Folder to Film pages (folder-to-film.html, folder-to-film-terms.html,
// my-film.html, film.html): the year, and the newsletter box, which posts to the same Brevo
// form as the main site's footer so sign-ups land in Brevo Contacts. External (not inline)
// because the terms page's security policy allows scripts from this site only.
(function () {
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
  var form = document.getElementById('newsletter-form');
  if (!form) return;
  var status = document.getElementById('newsletter-status');
  function say(msg, ok) {
    if (!status) return;
    status.textContent = msg;
    status.style.color = ok ? '#9fd7a5' : '#f0a49a';
  }
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = form.querySelector('input[type="email"]').value.trim();
    // Brevo answers "success" even for a malformed address, so check it here first.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('Please enter a valid email address.', false); return; }
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    say('Subscribing…', true);
    try {
      var body = new FormData();
      body.append('EMAIL', email);
      body.append('email_address_check', form.querySelector('input[name="email_address_check"]').value); // honeypot
      body.append('locale', 'en');
      var res = await fetch('https://b893ca94.sibforms.com/serve/MUIFAFHNpDgPU-nDfEV3TZttituEiSyIy4p0twQYehCWbO2QZjGgiYIf52Tzi8BjJZHKZaEdmpJZ8wZjawIvJ54EGnqgFvTS-rjUbDTxDA5ftlMluW-n-7ML1FaJ098ByQDvenhzBTDbOJfcfDg1fBs0YLFY3Jvggh62UAvuUmlC3dv5iF1pqPDzqeODqH3UpQhEaJF7yQfUR4bGrA==?isAjax=1', { method: 'POST', body: body });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || 'Submit failed');
      say("You're subscribed! Welcome to the Eastern Shore AI newsletter.", true);
      form.reset();
    } catch (err) {
      say('Your subscription could not be saved. Please try again.', false);
    } finally {
      button.disabled = false;
    }
  });
})();
