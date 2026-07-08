# CLAUDE.md — Standing Rules für KFK-Tracker

## Was ist das hier?
Progressive Web App für Keimfähigkeitsversuche im Skyseed-Programm.
Frontend (index.html) + Service Worker (service-worker.js) + manifest.json
+ Backend (kfk-apps-script.gs, Google Apps Script).

## Wichtigste Regeln
1. NIE die Treatment-Zuweisungen im Code neu generieren — immer aus dem
   DOCX-Versuchsprotokoll bzw. dem Asana-Task übernehmen.
2. Backups niemals automatisch löschen.
3. Vor jedem Frontend-Deploy: CACHE_VERSION in service-worker.js bumpen.
   Automatisch via `node bump-cache.js` (oder `npm run deploy:frontend`) —
   setzt Version auf Datum+Commit-Hash. Nicht mehr manuell noetig.
4. Beim Apps-Script-Deploy: `clasp push` dann
   `clasp deploy --deploymentId <ID>` (bestehende Bereitstellung
   aktualisieren, NICHT neu anlegen — sonst aendert sich die Webapp-URL).
   ACHTUNG: Wurde ein NEUER OAuth-Scope ergaenzt (z.B. documents fuer
   DocumentApp), erneuert `clasp deploy` die Web-App-Autorisierung NICHT
   -> Web-App liefert 404 fuer alle. Fix: einmalig ueber die UI neu
   bereitstellen: Bereitstellen -> Bereitstellungen verwalten -> Stift ->
   Version "Neue Version" -> Bereitstellen, dabei Autorisierung zulassen.
   Zugriff-Dropdown "Jeder" = anonym (richtig fuer die PWA); "Jeder mit
   einem Google-Konto" = Login noetig (falsch, PWA-fetch bekaeme 404).
5. ASANA_PAT niemals im Code — liegt in den Skripteigenschaften
   (Projekteinstellungen -> Skripteigenschaften, Schluessel 'ASANA_PAT').
   Setzen/Rotieren via setupAsanaPat() oder direkt im UI.
6. kfk-apps-script.gs liegt im Haupt-Repo:
   C:\Users\nils_\Desktop\Claude Code\Projekte\kfk-tracker\kfk-apps-script.gs

## Wichtige URLs / IDs
- Frontend (GitHub Pages): https://simongoldenberg.github.io/kfk-tracker/
- Netlify (inaktiv, Credit-Limit): https://kfk-tracker-app.netlify.app/
- Apps-Script-Webapp:
  https://script.google.com/macros/s/AKfycbyCtrEP1wsfkUsfaGMhLjouBxjYMA5la4XPeLG3Q1cUHv7qpmaLIplAsJy6gkaNaRSlgw/exec
- Sheet __KFK-Index: Single Source of Truth für Versuche
- KFK-Daten-Folder: 15X-Ri1feR3I1qGC6FgPpPLc0jgHskcoM

## Deploy-Workflow
Frontend: `npm run deploy:frontend` (bumpt CACHE_VERSION, commit, push)
-> GitHub Pages deployt automatisch (~1 min).
Backend (Apps Script): `clasp push` dann
`clasp deploy --deploymentId <ID>` (bestehende Bereitstellung, URL bleibt).
Danach committen, damit Git = Cloud. Token liegt in Skripteigenschaften,
wird bei Deploy NICHT beruehrt.

## Bekannte Versuche
- 26_005: Pinus nigra, Pellet-Schichtdicke RBD
- 26_006: SKi VakuumSeeder, 4 Treatments T0-T3, ID 00242
- 26_024: Hanf Matrix-Vergleich, 5 Treatments, 2 Trays a 24, ID 00245
- 26_025: Biochar SKi Wdh, 2 Trays a 24, ID 00243/00244
- 26_029: Grundsubstanzen kombiniert – Chitosan × Wollastonit × Kohle (Hanf),
  13 Treatments T0-T12, 4 Trays a 24, Asana-GID 1214954045637955

## Foto-Schema (seit v4-foto-preview)
- 1 Foto pro AZ pro Tray (kein Block-Split mehr)
- Spaltenname im Sheet: Foto_AZ0..5 (1 Tray) / Foto_AZ0_Tray1 (Multi-Tray)
- Alte Block-Spalten (Foto_AZ1_BlockA etc.) werden weiterhin gelesen
- Foto-Button: grün = Foto vorhanden, Klick öffnet Google Drive; ⟳ = neu hochladen
