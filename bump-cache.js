#!/usr/bin/env node
/**
 * bump-cache.js  —  KFK-Tracker
 * Setzt CACHE_VERSION in service-worker.js automatisch auf einen eindeutigen
 * Wert (Datum + kurzer Git-Commit-Hash). Damit kann CLAUDE.md Regel 3
 * ("vor jedem Frontend-Deploy CACHE_VERSION bumpen") nie mehr vergessen werden.
 *
 * Nutzung (vor git push):   node bump-cache.js
 * Oder via npm:             npm run deploy   (siehe package.json)
 */
const fs = require('fs');
const { execSync } = require('child_process');

const SW = 'service-worker.js';

function shortHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'nogit';
  }
}

function today() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

let src = fs.readFileSync(SW, 'utf8');
const newVersion = `skyseed-kfk-${today()}-${shortHash()}`;
const re = /const CACHE_VERSION = '[^']*';/;

if (!re.test(src)) {
  console.error('FEHLER: CACHE_VERSION-Zeile nicht gefunden in ' + SW);
  process.exit(1);
}

src = src.replace(re, `const CACHE_VERSION = '${newVersion}';`);
fs.writeFileSync(SW, src);
console.log('CACHE_VERSION -> ' + newVersion);
