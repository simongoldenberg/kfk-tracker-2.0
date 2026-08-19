#!/usr/bin/env node
/**
 * Installiert den pre-commit-Hook, der bei JEDEM Commit tracker-status.json
 * neu stempelt und mit in den Commit legt. Damit merkt das Claude-Projekt
 * jede Aenderung am Tracker, nicht nur die deployten.
 *
 * Einmalig ausfuehren:  npm run hooks:install
 *
 * Git-Hooks liegen in .git/hooks und werden nicht mitversioniert - deshalb
 * dieses Skript. Ein Commit mit --no-verify umgeht den Hook bewusst.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

let hooksDir;
try {
  const gitDir = execSync('git rev-parse --git-dir', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
  hooksDir = path.resolve(ROOT, gitDir, 'hooks');
} catch (e) {
  console.error('Kein Git-Repository gefunden - Hook nicht installiert.');
  process.exit(1);
}

if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

const hookPath = path.join(hooksDir, 'pre-commit');
const hook = `#!/bin/sh
# Erzeugt von scripts/install-hooks.js (npm run hooks:install).
# Stempelt tracker-status.json bei jedem Commit, damit das Claude-Projekt
# "Forschungsplan_Skyseed" den aktuellen Tracker-Stand abrufen kann.
# Umgehen mit: git commit --no-verify
node scripts/stamp-status.js --staged || exit 1
git add tracker-status.json
`;

if (fs.existsSync(hookPath)) {
  const alt = fs.readFileSync(hookPath, 'utf8');
  if (alt.indexOf('stamp-status.js') === -1) {
    fs.copyFileSync(hookPath, hookPath + '.backup');
    console.log('Vorhandener pre-commit-Hook gesichert als pre-commit.backup');
  }
}

fs.writeFileSync(hookPath, hook, 'utf8');
try { fs.chmodSync(hookPath, 0o755); } catch (e) { /* Windows kennt kein chmod */ }

console.log('pre-commit-Hook installiert: ' + hookPath);
console.log('Ab jetzt wird tracker-status.json bei jedem Commit mitgestempelt.');
