// Ask K reads its knowledge file whole, up to ASKK_KNOWLEDGE_MAX_CHARS. Until 2026-11-18 the worker cut it at
// 20,000 characters, so once the Survival Node file passed 20 KB (2026-10-30) Claude never saw returns, warranty,
// cancellations or the owner FAQ. This fails while there's still room, so the limit gets raised (or the file
// trimmed) on purpose instead of the end being dropped again without anyone noticing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASKK_KNOWLEDGE_MAX_CHARS } from '../src/ask-k-claude.js';

for (const file of ['askk-survival-node-knowledge.md', 'askk-folder-to-film-knowledge.md']) {
  test(`${file} fits in what Ask K reads, with room to grow`, () => {
    const chars = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').trim().length;
    assert.ok(chars <= ASKK_KNOWLEDGE_MAX_CHARS * 0.9,
      `${file} is ${chars} characters; Ask K reads ${ASKK_KNOWLEDGE_MAX_CHARS}. Raise ASKK_KNOWLEDGE_MAX_CHARS in src/ask-k-claude.js or trim the file.`);
  });
}
