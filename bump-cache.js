#!/usr/bin/env node
/**
 * bump-cache.js  —  KFK-Tracker
 * Setzt CACHE_VERSION in service-worker.js automatisch auf einen eindeutigen
 * Wert (Datum + kurzer Git-Commit-Hash). Damit kann CLAUDE.md Regel 3
 * ("vor jedem Frontend-Deploy CACHE_VERSION bumpen") nie mehr vergessen werden.
 *
 * Ausserdem wird APP_VERSION_DATE in index.html auf das Deploy-Datum gesetzt —
 * die in der Kopfzeile angezeigte Version bleibt so immer aktuell. Die
 * Versionsnummer APP_VERSION selbst wird bewusst NICHT automatisch erhoeht
 * (passiert manuell beim Release, s. CLAUDE.md).
 *
 * Nutzung (vor git push):   node bump-cache.js
 * Oder via npm:             npm run deploy   (siehe package.json)
 */
const fs = require('fs');
const { execSync } = require('child_process');

const SW = 'service-worker.js';
const HTML = 'index.html';

function shortHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'nogit';
  }
}

function today(sep = '') {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return [d.getFullYear(), p(d.getMonth() + 1), p(d.getDate())].join(sep);
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

// APP_VERSION_DATE in index.html auf heute setzen (Anzeige in der Kopfzeile)
let html = fs.readFileSync(HTML, 'utf8');
const reDate = /const APP_VERSION_DATE = '[^']*';/;
if (!reDate.test(html)) {
  console.error('FEHLER: APP_VERSION_DATE-Zeile nicht gefunden in ' + HTML);
  process.exit(1);
}
const heute = today('-');
html = html.replace(reDate, `const APP_VERSION_DATE = '${heute}';`);
fs.writeFileSync(HTML, html);
const versionMatch = html.match(/const APP_VERSION = '([^']*)';/);
console.log(`APP_VERSION_DATE -> ${heute}  (APP_VERSION ${versionMatch ? versionMatch[1] : '?'})`);
