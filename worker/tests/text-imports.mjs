// Lets Node import the .md files that wrangler bundles as text ([[rules]] in
// wrangler.toml), so tests can load src/index.js. Used via
// `node --import ./tests/text-imports.mjs` (see package.json).
import { register } from 'node:module';

register('./text-imports-hooks.mjs', import.meta.url);
