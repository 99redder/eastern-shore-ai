// The Survival Node Pal's instructions (survival_prompt.txt on the phones, rewritten 2026-11-17, v1.3e 2026-11-18) are shown to
// owners in three places: the online guide (node-setup.html, palPromptBox), the guide app
// (survival-node-app/index.html, #pal-prompt), the owners page (owners.html, #pal-prompt) and the update notice
// that social posts link to (pal-update.html, #pal-prompt, 2026-11-18). Owners copy them into PocketPal, so every
// copy must be the same text, word for word. When the instructions change, change all four (and survival_prompt.txt
// on Alamo); this test fails until they match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function preById(path) {
  const m = read(path).match(/<pre[^>]*id="pal-prompt"[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(m, `${path}: no <pre id="pal-prompt">`);
  return decode(m[1]);
}

function onlineGuide() {
  const m = read('node-setup.html').match(/const palPromptBox = `<pre[^>]*>([\s\S]*?)<\/pre>`/);
  assert.ok(m, 'node-setup.html: no palPromptBox');
  return decode(m[1]);
}

test('Survival Node Pal instructions are identical in the online guide, the guide app, the owners page and the notice', () => {
  const web = onlineGuide();
  // From 2026-11-18 the first line is the version owners check by asking "What version are you?"; the last
  // rule must answer with the same line.
  const head = web.match(/^(Survival Node instructions, updated [A-Z][a-z]+ \d{1,2}, \d{4})\n\nYou are Survival Node, an offline advisor/);
  assert.ok(head, 'instructions must start with "Survival Node instructions, updated <date>", a blank line, then "You are Survival Node, an offline advisor"');
  assert.ok(web.trimEnd().endsWith(`answer only: "${head[1]}."`), 'the version rule at the end must give the same line as the first line');
  assert.equal(preById('survival-node-app/index.html'), web, 'guide app #pal-prompt differs from node-setup.html');
  assert.equal(preById('owners.html'), web, 'owners.html #pal-prompt differs from node-setup.html');
  assert.equal(preById('pal-update.html'), web, 'pal-update.html #pal-prompt differs from node-setup.html');
});
