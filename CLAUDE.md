# CLAUDE.md — Standing Rules für KFK-Tracker

## Projekt-Konfiguration
- **Git-Workflow:** vereinfacht        <!-- vollständig | vereinfacht -->
- **Doku-Sprache:** Deutsch            <!-- Deutsch | Englisch -->
- **GitHub:** https://github.com/simongoldenberg/kfk-tracker-2.0

Entwicklung läuft direkt auf `develop`; `main` bleibt stabil und wird nur per
Version-PR aktualisiert (GitHub Pages deployt von `main` — Änderungen auf
`develop` sind also noch NICHT live).

## Was ist das hier?
Progressive Web App für Keimfähigkeitsversuche im Skyseed-Programm.
Frontend (index.html) + Service Worker (service-worker.js) + manifest.json
+ Backend (kfk-apps-script.gs, Google Apps Script).

## Wichtigste Regeln
1. NIE die Treatment-Zuweisungen im Code neu generieren — immer aus dem
   DOCX-/Doc-Versuchsprotokoll bzw. dem Asana-Task übernehmen.
2. Backups niemals automatisch löschen. Gleiches gilt für Versuchsdaten:
   `deleteVersuch` entfernt bewusst NUR die Index-Zeile, nie Daten-Sheet
   oder Drive-Ordner.
3. Vor jedem Frontend-Deploy: CACHE_VERSION in service-worker.js bumpen.
   Automatisch via `node bump-cache.js` (oder `npm run deploy:frontend`) —
   setzt Version auf Datum+Commit-Hash und stempelt APP_VERSION_DATE in
   index.html auf das Deploy-Datum. Nicht mehr manuell noetig.
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
6. kfk-apps-script.gs liegt in DIESEM Repo (2.0) und wird per `clasp`
   deployt:
   C:\Users\nils_\Desktop\Claude Code\Projekte\kfk-tracker 2.0\kfk-apps-script.gs
   Das alte GitHub-Repo `kfk-tracker` (Vorgaengerstand) wurde am 2026-08-07
   von Simon geloescht (inkl. Pages-Site). Der lokale Ordner
   `…\Projekte\kfk-tracker\` liegt noch auf der Platte und kann geloescht
   werden, sobald keine Claude-Code-Session mehr dort ihr Arbeitsverzeichnis
   hat (siehe Hinweis in der Session vom 2026-08-07: `rm -rf` schlug mit
   "Device or resource busy" fehl, weil das Verzeichnis das aktive
   Arbeitsverzeichnis war).
7. Versionierung: APP_VERSION in index.html (Anzeige in der Kopfzeile) und
   `version` in package.json synchron halten. Nummer nur beim Release
   (Version-PR develop -> main) erhoehen, danach Git-Tag setzen.

## Wichtige URLs / IDs
- Frontend (GitHub Pages, aktuell): https://simongoldenberg.github.io/kfk-tracker-2.0/
- Frontend ALT: Repo `kfk-tracker` (Vorgaenger) wurde am 2026-08-07 geloescht,
  die alte Pages-Site ist damit ebenfalls weg.
- Netlify (inaktiv, Credit-Limit): https://kfk-tracker-app.netlify.app/
- Apps-Script-Webapp:
  https://script.google.com/macros/s/AKfycbyCtrEP1wsfkUsfaGMhLjouBxjYMA5la4XPeLG3Q1cUHv7qpmaLIplAsJy6gkaNaRSlgw/exec
- Sheet __KFK-Index: Single Source of Truth für Versuche
- KFK-Daten-Folder: 15X-Ri1feR3I1qGC6FgPpPLc0jgHskcoM

## Deploy-Workflow
Frontend: `npm run deploy:frontend` (bumpt CACHE_VERSION + APP_VERSION_DATE,
commit, push) -> GitHub Pages deployt automatisch (~1 min), ABER nur von
`main`. Von `develop` aus: erst Version-PR nach `main`.
Backend (Apps Script): `clasp push` dann
`clasp deploy --deploymentId <ID>` (bestehende Bereitstellung, URL bleibt).
Danach committen, damit Git = Cloud. Token liegt in Skripteigenschaften,
wird bei Deploy NICHT beruehrt.

## Standardwerte beim Anlegen eines Versuchs
- **Ort:** `Growzelt` (Konstante DEFAULT_ORT in index.html, Fallback auch im
  Backend in createVersuchInIndex). Liefert der Asana-Task ein Custom-Field
  "Ort" oder eine Notizen-Zeile `Ort: …`, gewinnt dieser Wert.
- **AZ geplant:** `3` (Konstante DEFAULT_AZ_GEPLANT). Auswaehlbar bleiben 1-5.
- **Baumart:** wird automatisch aus dem Asana-Task gezogen
  (`extractArtFromAsana_`): erst Zeile `Saatgut:/Art:/Baumart:/…`, dann
  lateinischer Name im Volltext, dann deutscher Name/Kuerzel ueber das
  Arten-Lexikon `ART_LEXIKON`. Bekannte Arten werden auf die Lexikon-
  Schreibweise normalisiert (z.B. "Hanfsamen" -> lat. Cannabis sativa,
  kurz Hanf). Neue Arten in ART_LEXIKON ergaenzen — nie raten lassen.
- **Verantwortlich:** wird aus dem Asana-Assignee des Tasks gezogen
  (`extractVerantwortlichFromAsana_`, Feld `assignee.name`). Ohne
  zugewiesenen Nutzer greift der Backend-Default `'Simon Goldenberg'`. Im
  Import-Formular manuell korrigierbar (`imp-verantwortlich`).
- **ID-Nummer:** (noch) kein automatischer Vorschlag — bleibt manuelles
  Freitextfeld beim Import.

## Paste-Import
Button "Versuch aus JSON anlegen" (Listen-Toolbar) legt einen Versuch direkt
aus einem eingefügten `<<<KFK-DATA … KFK-DATA>>>`-Block an — ohne Umweg über
Asana/Google-Doc-API. Parsing + Validierung liegen in `js/paste-import.js`
(`parseAndValidateKfkData`, UMD-Modul wie `js/standorte.js`, per Vitest
getestet). Geprüft werden: JSON-Gültigkeit, `schema`-Präfix (`kfk-protocol`),
Pflichtfelder `versuchsnr`/`titel`/`treatments`/`rbd`, dass jeder
`rbd[].t`-Code in `treatments` vorkommt, und dass `rbd.length` nicht mehr
Plätze braucht als `anzahl_trays × raster_cols × raster_rows` hergibt.
Unterstützt Schema v1 und v2 (v2 bringt zusätzlich `standorte`) identisch.
Nach dem Anlegen (`createVersuch`) befüllt ein zweiter Call
(`importRbdRaw` in kfk-apps-script.gs) das Raster direkt aus dem
mitgelieferten `rbd`-Array — die Auto-RBD-Logik in `createVersuchInIndex`
greift nur bei vorhandenem `asana_task_gid`, das gibt es beim Paste-Import
nicht.

Zwei neue Index-Spalten `MDD_PP` und `Saatgutcharge` (`INDEX_COLS.mdd_pp` /
`.saatgutcharge`) speichern die gleichnamigen KFK-DATA-Felder — **müssen als
Kopfzeilen-Spalten in der echten `__KFK-Index`-Google-Sheet existieren**,
sonst werden die Werte beim Lesen/Schreiben stillschweigend leer
(`readIndex()` matched per Spaltenname, kein Fehler bei fehlender Spalte).
`treatments[].spec` braucht dagegen keine Backend-Änderung — reist unangetastet
in `Treatments_JSON` mit.

## Asana-Abschlussbericht (Auswertung durch Claude)
Beim vollstaendigen Abschluss (`markVersuchAbgeschlossen`) postet das Backend
in den Subtask „Auswertung & Bericht":
1. Kontext-Header (Versuchsnr, Titel, Art, Hypothese, Design, Treatments)
2. Client-Kommentar (Komplett-Trend je Treatment + Abschluss-Bemerkung)
3. Statistik je AZ (n, Ø Keim, KF%, SD, CV%) + ANOVA/η²
4. **Rohdaten-Block `<<<KFK-RESULTS … KFK-RESULTS>>>`** (Schema
   `kfk-results-v1`, `buildRohdatenHtml_`): Metadaten, AZ-Datum je Runde,
   **CSV mit ALLEN Einzelwerten pro Topf und AZ**, Foto-Links, Sheet-/Drive-Link.

Damit ist der Asana-Post allein ausreichend, um den Versuch auszuwerten.
Wer den Bericht vor einem echten Abschluss pruefen will:
`testAuswertungsBericht('26_0XX')` im Apps-Script-Editor (postet nichts).

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

## Zählverfahren (AZ) — wichtig
Je AZ wird nur die Anzahl **neu** gekeimter Samen seit der letzten Auszählung
eingetragen; gekeimte Samen werden danach aus dem Topf entfernt/gezogen, damit
sie nicht doppelt zählen. Die kumulative Keimfähigkeit ergibt sich aus
Summe(AZ1…AZn) / Samen-pro-Topf — und wird seit v1.3.0 überall konsistent so
berechnet:
- **Eingabe-Modal**: Eingabefeld bleibt der rohe Neu-Wert dieser Runde; darunter
  „Kumulativ: X von Samen-pro-Topf → Y% KF" (`cumulativeAZSum`,
  `sumStoredAZBefore` in index.html). Die Rundenobergrenze beim Eintippen ist
  dynamisch `Samen-pro-Topf − Summe(vorherige Runden)`, nicht mehr pauschal
  `Samen-pro-Topf` — verhindert, dass die Summe rechnerisch über die
  Samenanzahl steigen kann.
- **Fortschritts-Pills, Statistik, ANOVA** (Backend, `cumulativeAZValue_`):
  rechnen je AZ mit der kumulierten Zahl pro Topf, nicht mehr mit dem rohen
  Rundenwert.
- **Rohdaten-Block im Asana-Bericht** (`buildRohdatenHtml_`) bleibt bewusst
  roh (Einzelwerte pro Runde) — die Kumulierung steht dort nur als Formel im
  Kommentar, nicht vorgerechnet.

## Wartungsfunktionen (Apps-Script-Editor, manuell ausführen)
- `normalizeIndexArten(dryRun=true)`: normalisiert Baumart_lat/Baumart_kurz
  aller Index-Zeilen über `ART_LEXIKON`. Ohne Argument nur Report;
  `normalizeIndexArten(false)` schreibt tatsächlich.
- `ensureTrayColumnForAll()`: legt fehlende Tray-Spalten nachträglich an.

## Offline-Verhalten
Schlägt ein `saveTopf`-Call fehl (kein Netz im Growzelt), wird der Wert in
einer `localStorage`-Warteschlange gepuffert statt verloren zu gehen.
Automatischer Nachversand bei Wiederverbindung, App-Start und jedem Poll-Tick.
Sync-Anzeige zeigt "N ausstehend", solange etwas in der Warteschlange liegt.

## Lokales Auto-Backup
Unabhängig vom serverseitigen `weeklyBackup()` (Sonntag 03:00, Drive) sichert
das Frontend den gerade offenen Versuch (Meta + alle Topf-Daten) zusätzlich
lokal im Browser: bei jedem erfolgreichen `saveTopf`/`saveStandort`-Aufruf
sowie nach jedem `loadVersuch()` schreibt `backupCurrentVersuch()`
(index.html) einen Snapshot zuerst auf `kfk-versuch-<nr>`, danach identisch
auf `kfk-versuch-<nr>__backup` — bricht der erste Schreibvorgang mittendrin
ab, bleibt der Backup-Schlüssel vom vorherigen Aufruf intakt. Schema-Version
`LOCAL_BACKUP_SCHEMA_VERSION` (aktuell 1) + `migrateLocalBackup_()` heben
künftige Formatänderungen verlustfrei an. Schlägt `loadVersuch()` fehl (kein
Netz) und existiert ein lokales Backup, zeigt der Banner einen Button
"Backup laden" (`restoreLocalVersuchBackup`) — der wiederhergestellte Stand
ist rein lokal, nicht mit dem Server synchron.

Button "Backup posten" (Versuchsdetail-Toolbar) kopiert den kompletten
aktuellen Datenstand als `<<<KFK-BACKUP … KFK-BACKUP>>>`-JSON-Block
(Schema `kfk-backup-v1`) in die Zwischenablage, zum manuellen Posten als
Asana-Kommentar an die AZ-Subtask — unabhängig vom automatischen
`postAsanaComment`-Flow.

## Supabase-Spiegelung (seit 09.08.2026)
Zusätzlich zu Apps-Script/Sheet (weiterhin die primäre Datenhaltung, aus der
die App liest — `API_URL`) und dem lokalen Auto-Backup spiegelt das Frontend
Schreibvorgänge asynchron und fire-and-forget nach Supabase, rein für
SQL-Auswertung ohne CSV-Umweg (`js/supabase-sync.js`, `KfkSupabaseSync`).
Schlägt die Spiegelung fehl (offline, Fehler), landet der Vorgang in einer
localStorage-Warteschlange (`kfk_supabase_queue`) und wird beim nächsten
`online`-Event/Init nachgesendet — blockiert nie die eigentliche Zähl-Eingabe.
Zweiter Statuspunkt im Header ("SQL-Kopie") neben dem bestehenden Sheet-Sync.

**Kein Build-Tool im Projekt → kein `.env`:** `SUPABASE_URL`/`SUPABASE_ANON_KEY`
sind wie `API_URL` direkt als Konstanten in `index.html` gepflegt. Der
publishable/anon Key ist bewusst öffentlich im ausgelieferten Client-Code —
Schutz kommt ausschließlich über Row Level Security in Supabase, nicht über
Geheimhaltung des Keys.

**Tabellen** (angelegt per SQL-Editor, Verbesserungsplan Block C §5.3):
`versuche` (versuchsnr PK, kfk_data jsonb — voller Snapshot wie das lokale
Auto-Backup, aktualisiert bei jedem `backupCurrentVersuch()`), `standorte`
(versuchsnr+tray PK), `az_counts` (versuchsnr+tray+spalte+reihe+az PK).

**RLS "Variante A" + wichtige Postgres-Falle:** `standorte`/`az_counts` haben
nur `insert`+`select`-Policies, bewusst kein `update`/`delete` — ein
Angreifer mit dem öffentlichen anon-Key kann höchstens Datenmüll hinzufügen,
nichts zerstören oder verfälschen. `versuche` hat zusätzlich eine
`update`-Policy (nötig, damit der Snapshot über die Laufzeit eines Versuchs
aktuell bleibt) — Kompromiss, akzeptiert weil Supabase hier nur eine Kopie
ist, die echten Daten bleiben im Sheet. **Falle:** `INSERT ... ON CONFLICT DO
UPDATE` (das normale `upsert()`) verlangt in Postgres IMMER das UPDATE-Recht
auf die Tabelle, auch wenn nie ein Konflikt eintritt — deshalb verwendet
`supabase-sync.js` für `standorte`/`az_counts` `upsert(row, {..,
ignoreDuplicates: true})` (`ON CONFLICT DO NOTHING`, braucht nur `INSERT`).
Eine Korrektur eines bereits gezählten Werts wird dort dadurch still
verworfen, nicht aktualisiert — der jeweils aktuelle Stand bleibt trotzdem
über `versuche.kfk_data` verfügbar. Zusätzlich müssen für `anon` die
Basis-GRANTs gesetzt sein (RLS-Policies allein reichen nicht):
```sql
grant usage on schema public to anon;
grant select, insert on public.versuche, public.standorte, public.az_counts to anon;
grant update on public.versuche to anon;
```

## Ergebnistabelle (seit 10.08.2026)
Eigenständige Seite `ergebnisse.html` (kein Teil der PWA-Shell, kein Build-
Schritt) zeigt alle Versuche in einer Übersichtstabelle: Versuchsbeschreibung,
Hypothese, Auszählungsergebnisse (kumulierte KF% je Treatment) und — sobald
vorhanden — die Auswertung. Verlinkt über den Button "Ergebnistabelle" ganz
oben im Tracker-Header (nur auf der Startseite/Listenansicht).

**Datenquelle bewusst ausschließlich Supabase, nicht Asana:** Versuchsnr,
Titel, Hypothese, Treatments und die vollen Zähldaten stehen bereits
vollständig in `versuche.kfk_data` (derselbe Snapshot wie das lokale
Auto-Backup, siehe oben) — `ergebnisse.html` berechnet die kumulierten KF%
pro Treatment daraus client-seitig nach demselben additiven Zählverfahren
wie die App selbst (siehe "Zählverfahren (AZ)"). Ein Rückweg über Asana
(Kommentare parsen) wäre fehleranfälliger und redundant zu einer Quelle, die
ohnehin schon existiert.

**Auswertung nachträglich durch Claude:** Die inhaltliche Auswertung
(Zusammenfassung/Interpretation/Empfehlung) entsteht typischerweise erst,
wenn Claude in einer späteren Session den `<<<KFK-RESULTS…>>>`-Rohdatenblock
aus dem Asana-Bericht auswertet (siehe "Asana-Abschlussbericht" oben) — dafür
gibt es zwei zusätzliche Spalten `auswertung` (jsonb) und
`auswertung_updated_at` direkt auf `versuche` (SQL: `supabase/
auswertung-spalten.sql`, einmalig im SQL-Editor ausführen). Bewusst keine
neue Tabelle: `versuche` hat bereits `update`-Recht für den anon-Key
(RLS "Variante A" oben), eine neue Tabelle hätte nur zusätzliche RLS-Regeln
ohne echten Zusatznutzen gebraucht. Claude schreibt die Auswertung nach
Abschluss der Analyse per einfachem REST-Update (`PATCH
.../rest/v1/versuche?versuchsnr=eq.26_0XX` mit dem publishable Key, analog zu
`KfkSupabaseSync.mirrorVersuch`) — kein Roundtrip über Asana nötig.
Erwartete Struktur von `auswertung`: `{ zusammenfassung, interpretation,
empfehlung }` (String-Felder, frei erweiterbar — `ergebnisse.html` ignoriert
unbekannte Zusatzfelder).

## UI-Konventionen
- Schriftgroessen sind bewusst gross (Outdoor/Handschuhe): Basis 22px.
- Tray-Raster: Quadrate schmaler als die volle Spaltenaufteilung
  (`.rbd` grid-template-columns rechnet mit `var(--cols) * 1.6`), Treatment-Label
  33px mit Container-Query-Deckel `min(33px, 46cqw)`, damit auf schmalen
  Displays nichts ueberlaeuft. Leere Toepfe (`.topf.is-empty`) sind per
  Diagonal-Schraffur + gestricheltem Rahmen erkennbar, nicht nur per Opacity.
- **Keine QR-Codes mehr** (Funktion samt api.qrserver.com-Anbindung entfernt).
  Der Deep-Link `?versuch=26_0XX` funktioniert weiterhin.
- Loeschen: 🗑-Icon auf der Versuchskarte (aktiv + Archiv) -> Dialog, in dem
  die Versuchsnr eingetippt werden muss.
- AZ-Umschalter (`.az-switcher`) ist beim Scrollen durch die Toepfe sticky
  (position: sticky, oben angeheftet).
- Versuchskarten in der Liste zeigen zusaetzlich zu den AZ-Pills einen duennen
  Fortschrittsbalken (`fortschrittProzent()` in index.html: erfasste/geplante
  AZ-Runden, "teilweise" zaehlt halb).

## Design-System (seit v1.4.0)
Skyseed-konform (Skill `skyseed-design`): Inter statt JetBrains Mono/Fraunces,
Farb-Tokens Teal `--accent` (#143c46 hell / Moos #8aa85c dunkel), Moos-Akzent
fuer Erfolg, Amber/Rust fuer Warnung/Fehler, weiche Radien 4-8px
(`--radius-sm/md/lg`), weiche Schatten (`--shadow-sm/md`) statt harter 0px-
Kanten. Alle Farben/Radien/Schatten sind CSS-Variablen in `:root` — bei neuen
Komponenten diese verwenden, keine neuen Hex-Werte hart codieren.

**Dunkelmodus:** zweiter Token-Satz unter `:root[data-theme="dark"]` +
`@media (prefers-color-scheme: dark)` als Default ohne gespeicherte Wahl.
Umschalter im Header (`themeToggleHTML()`), Wahl wird in `localStorage`
(`kfk_theme`) gemerkt. `initTheme()` laeuft synchron beim Skript-Parse (kein
Flackern vor dem ersten Render).

**Icons:** keine Emoji mehr in der App-UI (Skyseed-Designrichtlinie) — Set aus
Inline-SVGs in der JS-Konstante `ICON` (Kamera, Muelleimer, Archiv, etc.).
**Ausnahme bewusst:** Emoji in Texten, die als Asana-Kommentar gepostet werden
(`bodyHTML`/`finalKommentarHtml`/`previewText` in `openAsanaPreview()`,
`confirmVersuchEnde()`), bleiben unveraendert — das ist Text fuer Asana, keine
App-UI.

**Treatment-/Themenbereich-Farben:** `themenbereichToFarbe()` und die
Platzhalter im Import-Formular nutzen jetzt eine entsaettigte Erdpalette
(Rost/Teal/Amber/Moos) statt der fruehereren Tailwind-Grundfarben. **Wichtig:**
Treatment-Farben einzelner Toepfe (T0-T6 im Tray-Raster) kommen als Hex-Code
direkt aus dem Asana-Protokoll (`T0 (#hex)`-Zeilen) — die App kann bereits
angelegte Versuche nicht rueckwirkend umfaerben. Neue Versuchsprotokolle
sollten die Erdpalette verwenden.
