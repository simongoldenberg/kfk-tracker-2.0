#!/usr/bin/env node
/**
 * Schreibt tracker-status.json im Repo-Wurzelverzeichnis.
 *
 * Zweck: das Claude-Projekt "Forschungsplan_Skyseed" soll ohne Zutun von Simon
 * mitbekommen, wenn sich am Tracker etwas geaendert hat. Die Datei ist die
 * einzige Stelle, die Claude dafuer abrufen muss:
 *
 *   LIVE (main, via GitHub Pages):
 *     https://simongoldenberg.github.io/kfk-tracker-2.0/tracker-status.json
 *   ENTWICKLUNG (develop, via raw.githubusercontent):
 *     https://raw.githubusercontent.com/simongoldenberg/kfk-tracker-2.0/develop/tracker-status.json
 *
 * Unterscheiden sich die beiden Versionen, liegt etwas Fertiges auf develop,
 * das noch nicht deployt ist. Genau das soll die Versuchsleitung sehen.
 *
 * Aufruf:
 *   node scripts/stamp-status.js            # normal (nutzt HEAD-Commit)
 *   node scripts/stamp-status.js --staged   # aus dem pre-commit-Hook
 *
 * Quellen: package.json (version), git (branch, commit), CHANGELOG.md
 * (oberster Abschnitt = die Aenderungen dieser Version, plus der Block
 * "Nach dem Deploy einmalig ausfuehren", falls vorhanden).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STAGED = process.argv.includes('--staged');

function git(cmd, fallback) {
  try {
    return execSync('git ' + cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch (e) {
    return fallback;
  }
}

function isoLocal(d) {
  const p = n => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
    + sign + p(Math.floor(Math.abs(off) / 60)) + ':' + p(Math.abs(off) % 60);
}

// --- CHANGELOG: obersten Versionsabschnitt lesen -----------------------------
function readChangelogHead() {
  const file = path.join(ROOT, 'CHANGELOG.md');
  if (!fs.existsSync(file)) return { version: null, datum: null, aenderungen: [], migrationen: [] };
  // Zeilenenden normalisieren, BEVOR irgendein Regex darauf laeuft. Git steht
  // hier auf core.autocrlf=true und es gibt keine .gitattributes: im Blob
  // liegt LF, im Arbeitsverzeichnis auf Windows aber CRLF. Die Muster unten
  // erwarten hartes \n (z.B. ```` ```[a-z]*\n ```` beim Migrationsblock) und
  // liefen deshalb unter Windows stillschweigend ins Leere - offene_migrationen
  // blieb dauerhaft [], obwohl der CHANGELOG welche auflistete. Auf Mac/Linux
  // war derselbe Code unauffaellig. Einmal normalisieren statt jedes Muster
  // einzeln CRLF-tolerant machen.
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

  const heads = [...text.matchAll(/^## Version ([^\s—-]+)\s*[—-]\s*(\S+)\s*$/gm)];
  if (!heads.length) return { version: null, datum: null, aenderungen: [], migrationen: [] };

  const first = heads[0];
  const von = first.index + first[0].length;
  const bis = heads[1] ? heads[1].index : text.length;
  const block = text.slice(von, bis);

  // Erste Ebene der Aufzaehlung, Fettdruck-Titel bevorzugt, sonst der Satzanfang.
  const aenderungen = [];
  for (const m of block.matchAll(/^- (.+)$/gm)) {
    const zeile = m[1].trim();
    const fett = zeile.match(/^\*\*(.+?)\*\*/);
    const kurz = (fett ? fett[1] : zeile).replace(/[.:]$/, '').trim();
    if (kurz && aenderungen.length < 12) aenderungen.push(kurz);
  }

  // Migrationsblock: Codezeilen unter einer Ueberschrift mit "einmalig"
  const migrationen = [];
  const mig = block.match(/###[^\n]*einmalig[^\n]*\n+```[a-z]*\n([\s\S]*?)```/i);
  if (mig) {
    mig[1].split('\n').forEach(z => {
      const s = z.replace(/\/\/.*$/, '').trim();
      if (s) migrationen.push(s);
    });
  }

  return { version: first[1], datum: first[2], aenderungen, migrationen };
}

// --- Zusammenbauen -----------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cl = readChangelogHead();

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appVersion = (indexHtml.match(/const APP_VERSION = '([^']+)'/) || [])[1] || null;
const appVersionDate = (indexHtml.match(/const APP_VERSION_DATE = '([^']+)'/) || [])[1] || null;

const branch = git('rev-parse --abbrev-ref HEAD', 'unbekannt');
const commit = STAGED ? 'pending' : git('rev-parse --short HEAD', 'unbekannt');

const status = {
  schema: 'kfk-tracker-status-v1',
  hinweis: 'Maschinenlesbarer Stand des KFK-Trackers fuer das Claude-Projekt Forschungsplan_Skyseed. Wird von scripts/stamp-status.js erzeugt - nicht von Hand bearbeiten.',
  version: pkg.version,
  app_version: appVersion,
  app_version_date: appVersionDate,
  changelog_version: cl.version,
  changelog_datum: cl.datum,
  branch,
  commit,
  gestempelt_am: isoLocal(new Date()),
  ist_live: branch === 'main',
  schemata: {
    kfk_data: 'kfk-protocol-v3',
    csv_export: 'long-format-v1',
    supabase_auswertung: 'zusammenfassung|interpretation|empfehlung'
  },
  letzte_aenderungen: cl.aenderungen,
  offene_migrationen: cl.migrationen,
  urls: {
    live: 'https://simongoldenberg.github.io/kfk-tracker-2.0/',
    status_live: 'https://simongoldenberg.github.io/kfk-tracker-2.0/tracker-status.json',
    status_develop: 'https://raw.githubusercontent.com/simongoldenberg/kfk-tracker-2.0/develop/tracker-status.json',
    changelog: 'https://raw.githubusercontent.com/simongoldenberg/kfk-tracker-2.0/main/CHANGELOG.md'
  }
};

// Warnen, statt still divergieren zu lassen.
const warnungen = [];
if (appVersion && appVersion !== pkg.version) {
  warnungen.push('APP_VERSION (' + appVersion + ') und package.json (' + pkg.version + ') stimmen nicht ueberein');
}
if (cl.version && cl.version !== pkg.version) {
  warnungen.push('Oberster CHANGELOG-Eintrag ist ' + cl.version + ', package.json ist ' + pkg.version);
}
if (warnungen.length) status.warnungen = warnungen;

const ziel = path.join(ROOT, 'tracker-status.json');
fs.writeFileSync(ziel, JSON.stringify(status, null, 2) + '\n', 'utf8');

console.log('tracker-status.json: v' + status.version + ' (' + branch + '/' + commit + ')'
  + (status.letzte_aenderungen.length ? ', ' + status.letzte_aenderungen.length + ' Aenderungen' : '')
  + (warnungen.length ? '\n  WARNUNG: ' + warnungen.join('\n  WARNUNG: ') : ''));
