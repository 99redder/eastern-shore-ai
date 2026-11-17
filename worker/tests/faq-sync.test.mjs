// The visible FAQ and the FAQPage JSON-LD on each page must say the same thing, question for question.
// Google requires structured data to match what visitors see, and the two copies drifted on node.html
// (2026-11-16: 22 visible questions, 10 JSON-LD questions with different wording). When you change an
// FAQ answer, change it in both places; this test fails until they match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGES = ['node.html', 'index.html'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', rarr: '→', deg: '°', times: '×', middot: '·' };
const decode = (t) => t
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const plain = (h) => decode(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

function visibleFaq(html) {
  const start = html.indexOf('id="faq"');
  assert.ok(start > 0, 'no element with id="faq"');
  const section = html.slice(start, html.indexOf('</section>', start));
  return [...section.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
    .map(([, q, a]) => ({ q: plain(q), a: plain(a) }));
}

function jsonLdFaq(html) {
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(body);
    const items = Array.isArray(data) ? data : (data['@graph'] || [data]);
    const faq = items.find((it) => it && it['@type'] === 'FAQPage');
    if (faq) return faq.mainEntity.map((e) => ({ q: plain(e.name), a: plain(e.acceptedAnswer.text) }));
  }
  assert.fail('no FAQPage JSON-LD');
}

for (const page of PAGES) {
  test(`${page}: FAQPage JSON-LD matches the visible FAQ`, () => {
    const html = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
    const visible = visibleFaq(html);
    const ld = jsonLdFaq(html);
    assert.ok(visible.length > 0, 'visible FAQ is empty');
    assert.deepEqual(ld.map((e) => e.q), visible.map((e) => e.q), 'questions differ (order matters)');
    for (let i = 0; i < visible.length; i++) {
      assert.equal(ld[i].a, visible[i].a, `answer differs for "${visible[i].q}"`);
    }
  });
}
