#!/usr/bin/env node
/**
 * Holt develop nach einem Release auf den Stand von main.
 *
 *   npm run sync:develop
 *
 * WARUM: Der Release-Ablauf stempelt tracker-status.json nach dem Merge noch
 * einmal auf main (damit die Live-Datei `branch: main` / `ist_live: true`
 * meldet). Dieser Commit liegt danach NUR auf main. Arbeitet man auf develop
 * weiter, ohne ihn zu holen, aendern beide Branches dieselbe generierte Datei
 * und der naechste Release-PR kollidiert - bei den PRs #8 und #9 genau so
 * passiert, beide mussten von Hand aufgeloest werden. PR #10 war dagegen
 * konfliktfrei, weil develop vorher auf main stand.
 *
 * Ein lokaler Merge-Driver (.gitattributes + `merge.ours.driver`, gesetzt von
 * npm run hooks:install) hilft nur beim lokalen Merge - GitHub kennt ihn
 * serverseitig nicht. Deshalb ist dieses Fast-Forward der eigentliche Fix.
 *
 * Bewusst NUR Fast-Forward: gibt es auf develop eigene, noch nicht gemergte
 * Commits, bricht das Skript ab und sagt, was zu tun ist - statt eigenmaechtig
 * zu mergen oder zu rebasen.
 */
'use strict';

const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function git(cmd, opts) {
  const out = execSync('git ' + cmd, {
    cwd: ROOT,
    stdio: (opts && opts.stdio) || ['ignore', 'pipe', 'pipe']
  });
  // Bei stdio:'inherit' geht die Ausgabe direkt ans Terminal und execSync
  // liefert null - dann gibt es hier nichts auszuwerten.
  return out ? out.toString().trim() : '';
}

function fail(msg) {
  console.error('\n' + msg + '\n');
  process.exit(1);
}

// 1. Arbeitsverzeichnis muss sauber sein - ein Branch-Wechsel mit
//    uncommitteten Aenderungen an denselben Dateien geht sonst schief.
if (git('status --porcelain')) {
  fail('Arbeitsverzeichnis ist nicht sauber. Erst committen oder stashen,\n'
     + 'dann npm run sync:develop erneut ausfuehren.');
}

const start = git('rev-parse --abbrev-ref HEAD');

git('fetch origin --quiet', { stdio: 'inherit' });

// 2. Hat develop Commits, die main nicht hat? Dann ist noch etwas offen und
//    ein Fast-Forward ist gar nicht moeglich.
const offen = git('log --oneline origin/main..origin/develop');
if (offen) {
  fail('develop hat Commits, die noch nicht auf main sind:\n\n' + offen
     + '\n\nDas ist kein Fall fuer sync:develop - erst den Release-PR mergen\n'
     + '(develop -> main), danach hier erneut.');
}

// 3. Liegt develop ueberhaupt zurueck?
const fehlt = git('log --oneline origin/develop..origin/main');
if (!fehlt) {
  console.log('develop ist bereits auf dem Stand von main - nichts zu tun.');
  process.exit(0);
}

console.log('develop fehlen diese Commits von main:\n' + fehlt + '\n');

// 4. Fast-Forward und pushen. --ff-only stellt sicher, dass hier nie ein
//    Merge-Commit oder eine Konfliktauflösung entsteht.
try {
  if (start !== 'develop') git('switch develop', { stdio: 'inherit' });
  git('merge origin/main --ff-only', { stdio: 'inherit' });
  git('push origin develop', { stdio: 'inherit' });
} catch (e) {
  fail('Fast-Forward fehlgeschlagen: ' + (e.message || e)
     + '\nBitte von Hand pruefen (git log --oneline --graph develop origin/main).');
}

console.log('\ndevelop steht jetzt auf ' + git('rev-parse --short HEAD')
  + ' - naechster Release-PR startet konfliktfrei.');

if (start !== 'develop') {
  git('switch ' + start, { stdio: 'inherit' });
  console.log('Zurueck auf ' + start + '.');
}
