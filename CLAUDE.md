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
   C:\Users\nils_\Claude_Projekte\kfk-tracker-2.0\kfk-apps-script.gs
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
8. EINZIGE massgebliche Quelle fuer das KFK-DATA-Schema, die Zaehlregeln, die
   Chargen-IDs und die Farbpalette ist `SOP_Versuchsplanung_Skyseed.md` im
   Claude-Projekt "Forschungsplan_Skyseed" (Abschnitt 4.2). Dieses Repo
   dokumentiert nur die Umsetzung, nie das Soll. Weicht der Code von der SOP ab,
   ist das ein Bug im Code oder eine Luecke in der SOP - nie eine dritte
   Wahrheit. `FORSCHUNGSPLAN-Projektanweisung.md` war bis 15.08.2026 eine
   konkurrierende Schemaquelle (Stand v1) und ist auf einen Verweis reduziert.

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
Unterstützt Schema v1, v2 und v3 identisch (v2 bringt zusätzlich `standorte`,
v3 bringt Aussaat/Aktivierung + Chargen-IDs, siehe Abschnitt "Chargen-IDs").
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

**Kachelfarbe (`treatments[].color`, kanonisches Feld):** Die RBD-Rasteransicht
(`renderRBD`/`renderRBDForTray` in index.html) liest für die Topf-Hintergrundfarbe
ausschließlich `t.color` — ein Hex-String **mit** führendem `#` (z.B.
`"#22c55e"`), identisch zum Feld, das der Asana-Doc-Parser aus `T0 (#hex)`-Zeilen
erzeugt (`kfk-apps-script.gs`, `extractTreatmentsFromAsana_`) und das in
`Treatments_JSON` gespeichert wird. **Kein anderes Feld wird dafür gelesen.**
Ein SOP-Entwurfsfehler (v3) hat KFK-DATA-Blöcke mit `farbe_hex` (ohne `#`)
statt `color` erzeugt — dadurch blieb die Kachelfarbe beim Import leer
(Fallback-Grau `#f4eee3`, siehe `renderRBDForTray`). `mapTreatmentsV3_()` in
`js/paste-import.js` fängt das seit dem 14.08.2026 automatisch ab: fehlt
`color`, aber `farbe_hex` ist gesetzt, wird es übernommen und ein fehlendes
`#` ergänzt. Neue KFK-DATA-Blöcke (SOP/Skill) sollten trotzdem direkt
`"color":"#hexcode"` verwenden — der Fallback ist nur ein Sicherheitsnetz für
Altbestand, keine Empfehlung.

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
- **Auswertungs-Tab im Versuchs-Sheet** (`buildAuswertungTab`/`fillAuswertungTab_`,
  seit v1.8.0): rechnet ebenfalls kumulativ. Bis v1.7.1 griffen die Formeln dort
  faelschlich auf die rohe Rundenspalte zu (`AVERAGEIFS(Daten!J:J,…)` fuer AZ2) —
  der Tab zeigte damit pro Block nur die neu gekeimten Samen EINER Runde als
  "KF %". Behoben; Altbestand per `rebuildAuswertungTabForAll(false)` nachziehen.

## Auswertungs-Tab (seit v1.8.0)
Jeder Versuchs-Sheet hat einen Tab `Auswertung` mit einem Block je AZ-Runde
("Kumulativ bis AZn") plus einem hervorgehobenen Block **`Gesamt`** (Summe ueber
alle Runden). Spalten: `Treatment · n · Ø · SD · Min · Max · KFK % · CV % ·
rel. KFK %`. Die Inferenzstatistik (GLM/ANOVA, eta^2, CLD) laeuft laut SOP immer
auf dem Gesamt-Block, nie auf einem Einzel-AZ.

> [!IMPORTANT]
> **Formeln IMMER mit Semikolon `;` als Argumenttrennzeichen erzeugen, nie mit
> Komma.** Die Versuchs-Sheets laufen unter Gebietsschema **Deutschland**
> (Datei -> Einstellungen -> Allgemein), dort ist `;` das Trennzeichen und `,`
> das Dezimalzeichen. `Range.setFormula()` uebernimmt den String **wortwoertlich**
> und konvertiert **nicht** von US-Komma-Syntax. Ein `ROUND(x,1)` statt
> `ROUND(x;1)` laesst deshalb JEDE Zelle des Tabs mit "Fehler beim Parsen der
> Formel" (`#ERROR!`) auflaufen — genau das war der Fehler in v1.8.0, behoben in
> v1.8.1. Zahlenliterale, die in eine Formel eingebettet werden
> (`samen_pro_topf`, `charge_kfk_potenzial`), laufen ueber `fmtNum_()` — Punkt
> wird zu Dezimalkomma. Gilt fuer jede kuenftige `setFormula`-Stelle, nicht nur
> fuer `fillAuswertungTab_`.

Die Formeln sind Array-Formeln ueber `Daten!$X$2:$X$500` mit drei Bausteinen:
`MASK` (Zeile gehoert zum Treatment, ueber
`REGEXMATCH(Treatment-Spalte; "^<code>(?:$|\s)")` — die Spalte enthaelt je
Anlageweg den nackten Code (`T1`), `T1 Kontrolle` oder `T1 (Kontrolle)`; das
Wortende-Muster verhindert, dass `T1` auch `T10` trifft, was ein `LEFT(...)`
nicht leisten wuerde), `HAS` (Topf hat bis dahin ueberhaupt einen Wert ->
zaehlt fuer n) und `CUM` (Summe der Rundenspalten bis n). Spaltenbuchstaben
sind **nicht** hart kodiert, sondern werden von `datenSpaltenAufloesen_(ss)`
aus der echten Kopfzeile geholt — deshalb ist der Tab auch bei vorhandener
Tray-Spalte und nach dem Anhaengen neuer Spalten korrekt.

`charge_kfk_potenzial` und `samen_pro_topf` stehen als Literale in den Formeln.
Aendert sich einer der beiden Werte: `rebuildAuswertungTab('26_0XX')`.

## Dickenklasse je Topf (seit v1.8.0)
Die SOP fuehrt die Sieb-Dickenklasse als Pflicht-Kovariate ("Pellets werden vor
jedem Versuch gesiebt, Dickenklasse je Topf notiert"). Umsetzung:
- Spalte `Dickenklasse` (Konstante `DICKENKLASSE_COL`) **am Ende** der Kopfzeile
  des Daten-Sheets — bewusst angehaengt, nicht eingeschoben, damit keine
  bestehende Spaltenposition wandert. `ensureDickenklasseColumn_(sheet)` legt sie
  bei Altbestand nach, `ensureDickenklasseColumnForAll(dryRun)` fuer alle Sheets.
- Freitext (z.B. `2,0-2,5 mm`), bewusst **kein** Enum — die Siebgroessen wechseln
  je angestrebter Schichtdicke. Getrennt von `treatments[].schichtdicke`, das die
  angestrebte Pelletschicht beschreibt, nicht die gemessene Siebklasse.
- Eingabe im Topf-Modal (`#topf-dickenklasse`), reist als `dickenklasse` in
  `saveTopf` mit. `undefined` = unveraendert lassen, `''` = bewusst geleert.
- `js/export.js` befuellt damit die Spalte `dickenklasse` des Long-Format-Exports,
  die vorher dauerhaft leer war.

## Saatgutcharge-ID = Posten-Nr. (seit v1.8.0)
`posten_nr` und `saatgutcharge_id` sind **dieselbe Groesse** (Entscheidung Simon,
15.08.2026): bei Gehoelzen die amtliche Postennummer, bei Hanf/Weizen eine
eigene Kennung. Es gibt nur noch **ein** Feld im UI und im KFK-DATA-Block.
Die physische Sheet-Spalte `Posten_Nr` bleibt fuer Alt-Zeilen bestehen;
`readIndex()` zieht ihren Wert hoch, wenn `Saatgutcharge` leer ist, und liefert
`posten_nr` danach nur noch als Alias auf `saatgutcharge_id`. `js/paste-import.js`
akzeptiert `posten_nr` als drittes Alt-Feld nach `saatgutcharge_id` und
`saatgutcharge`.

## Aussaat vs. Aktivierung (seit 13.08.2026)
Ausgesät wird Montag–Donnerstag, die **erste Wasserzugabe (Aktivierung) erfolgt
immer donnerstags** — dazwischen ruht der Versuch trocken und dunkel. **Tag 0
für alle Keimzeitberechnungen ist die Aktivierung, nicht die Aussaat.**

- `aussaat_datum` (neu, Spalte `Aussaat_Datum`) und `aktivierung_datum` sind
  getrennte Felder. `aktivierung_datum` ist ein **Alias auf die bestehende
  Spalte `Start_Datum`** (`readIndex()` setzt `v.aktivierung_datum =
  v.start_datum`) — bewusst **keine Sheet-Umbenennung**: Alt-Zeilen hatten schon
  vorher genau diesen Wert dort stehen, die Migrationsregel "fehlt
  `aussaat_datum`, gilt `aktivierung_datum = start_datum`" ist damit ohne
  Zusatzcode automatisch erfüllt. Neuer Code schreibt/liest **immer**
  `aktivierung_datum`, nie mehr `start_datum` direkt (Ausnahme: Backend-interne
  Spalten-Zugriffe, die zwangsläufig den physischen Namen brauchen).
- **Ruhedauer** (`ruhedauerTage()` in `js/chargen.js`) ist rein abgeleitet
  (Aktivierung − Aussaat), wird nirgends gespeichert. Warnung bei > 4 Tagen.
- **Wochentag-Validierung** (`aussaatWochentagCheck`/`aktivierungWochentagCheck`
  in `js/chargen.js`) ist ein reiner UI-Hinweis, kein Blocker — Aktivierung an
  einem Nicht-Donnerstag verlangt im Modal "Chargen bearbeiten" zusätzlich eine
  ausgefüllte Begründung, bevor gespeichert werden kann (`onChargenFieldChange`
  sperrt den Speichern-Button).
- **Ruhephase bestätigt** (`ruhephase_bestaetigt`, Checkbox „trocken und dunkel
  gelagert") ist Pflicht vor der ersten Auszählung — Teil der Blockierprüfung
  unten.
- **AZ-Termine-Vorschläge** (`azTermineVorschlag()`/`AZ_TERMINE_VORSCHLAG` in
  `js/chargen.js`, Tage nach Aktivierung): Hanf/Weizen → 4/7/11, SKi/WKi/ELä →
  7/14/21/28, KüTa → 14/21/28/35, unbekannte Arten fallen auf den
  SKi/WKi/ELä-Rhythmus zurück. **Bewusst vorläufig bei Gehölzen** — nach 2–3
  Versuchen je Art gegen echte Keimverläufe prüfen. Frei editierbar/erweiterbar
  im Modal "Chargen bearbeiten", gespeichert als `az_termine`
  (`AZ_Termine_JSON`-Spalte, JSON-Bündel analog `Treatments_JSON`). Bleiben
  reine Vorschläge — das tatsächliche AZ-Datum wird weiterhin pro Auszählung
  real erfasst (`AZ{n}_Datum`-Spalte im Daten-Sheet, existierte bereits vor
  diesem Feature über `saveTopf`/`readDaten`).

## Chargen-IDs (seit 13.08.2026)
Bildet zwei Papierprotokolle ab (Aushang am Pelletierteller bzw. Mischplatz),
damit Chargeneffekte später von Rezeptureffekten getrennt werden können.
Zentrale Logik in `js/chargen.js` (`KfkChargen`, UMD-Modul wie
`js/standorte.js`, per Vitest getestet).

**Versuchsebene** (Modal "Chargen bearbeiten", `openChargenEdit()` in
index.html, Backend-Action `updateChargenFelder`):
- `saatgutcharge_id` (Alias auf die bestehende Spalte `Saatgutcharge` — bei
  Gehölzen die amtliche Postennummer, sonst eigene Kennung) +
  `charge_kfk_potenzial` (Potenzial-KFK der Charge in %, neue Spalte
  `Charge_KFK_Potenzial`).
- Substrat-Block (`substratcharge_id`/`substrat_basis`/`substrat_zuschlag`/
  `substrat_verhaeltnis`/`substrat_lieferant_lot`/`substrat_ec`/`substrat_ph`/
  `substrat_anmerkung`/`substrat_gemischt_von`), als **ein** JSON-Bündel in der
  neuen Spalte `Substrat_JSON` gespeichert (analog `Treatments_JSON` — deutlich
  weniger neue Spalten als ein Feld pro Substrat-Attribut). EC > 1,0 mS/cm
  zeigt eine Warnung (`substratEcWarnung()`).

**Treatment-Ebene** (Modal "Treatment bearbeiten", `openTreatmentPellet(code)`,
Backend-Action `updateTreatmentPellet`): `pelletcharge_id`,
`matrixzusammensetzung` (mehrzeilig), `schichtdicke` (bewusst **kein** Enum —
Freitext, weil je Schicht angegeben, getrennt von einer eventuellen
Sieb-`dickenklasse`), `pelletiert_von`, `pelletier_datum`,
`pelletier_anmerkung`, `anker` (`t0`/`t_ref`/`test`), `nackte_saat` (Boolean,
deaktiviert die Pelletfelder im UI). Alle Felder reisen unverändert in
`Treatments_JSON` mit — **keine neue Sheet-Spalte nötig**, exakt wie
`treatments[].spec` das vorher schon tat. "Sammelübernahme" (Button neben der
Treatment-Liste) parst eine Zeile aus dem Pelletierprotokoll
(`parsePelletProtokollZeile()`, Tab- oder Semikolon-getrennt) und lässt danach
manuell das Ziel-Treatment wählen — das Papierprotokoll hat keine
Treatment-Spalte.

**Import (`kfk-protocol-v3`, `js/paste-import.js`):** liest alle obigen Felder,
mit Rückwärtskompatibilität zu v1/v2 — fehlende Felder blockieren den Import
nicht. Alt-Feld-Mapping: `saatgutcharge`→`saatgutcharge_id`,
`treatments[].spec.charge`→`pelletcharge_id`, `spec` (gesamt) wird als
`matrixSuggestions[code]`-Vorschlag zurückgegeben, nie automatisch übernommen.

**Blockierende Prüfung** (`missingAbschlussFields()` in `js/chargen.js`,
serverseitig gespiegelt als `missingAbschlussFelder_` in
`kfk-apps-script.gs`): verweigert sowohl den Abschluss einer einzelnen
AZ-Runde (`openAbschluss()`) als auch den Versuchsabschluss
(`openVersuchEnde()`/`markVersuchAbgeschlossen`), wenn `saatgutcharge_id`,
`charge_kfk_potenzial`, `substratcharge_id`, `substrat_verhaeltnis`,
`aktivierung_datum`, `ruhephase_bestaetigt` oder — pro nicht als `nackte_saat`
markiertem Treatment — `pelletcharge_id` fehlen. Die breitere, nicht
blockierende Liste (`missingImportFields()`) treibt den gelben
"Fehlende Angaben"-Banner oben in der Versuchsansicht.

**rel. KFK (relative Keimleistung):** `rel_KFK = kumulative KFK% / 
charge_kfk_potenzial * 100` (`relKfk()` in `js/chargen.js`, kein Deckel nach
oben, `null`/"—" ohne Potenzial). Erscheint als 9. Spalte "rel. KFK %" im
Live-Auswertung-Tab `Auswertung` jedes Versuchs-Datensheets
(`buildAuswertungTab()`) — das Potenzial wird beim Sheet-Aufbau als Formel-
Literal eingesetzt (wie `samenProTopf` schon vorher), ändert es sich später,
braucht der Tab einen manuellen Rebuild. Gilt nur für **neu angelegte**
Versuche; bestehende Auswertung-Tabs bekommen die Spalte nicht rückwirkend.

**CSV-Export (Long-Format, seit 13.08.2026):** `js/export.js`
(`buildExportCsv`) wurde vom Wide- auf ein **Long-Format** umgestellt — eine
Zeile pro (Versuch × Topf × AZ), Komma-getrennt (RFC 4180), damit Exporte
mehrerer Versuche für die versuchsübergreifende Meta-Analyse (R-Skript)
aneinandergehängt werden können. Spaltenreihenfolge/-namen sind fest (siehe
`CSV_HEADER` in `js/export.js`) — das R-Skript liest genau diese Namen. Das
ist eine **bewusste Breaking Change** gegenüber dem alten Wide-Format-Export
(gleicher Button "Export CSV" in der Versuchsansicht, anderes Ergebnis).
`tage_nach_aktivierung` nutzt das **tatsächliche** AZ-Datum je Runde
(`AZ{n}_Datum`-Spalte, existierte schon vor diesem Feature), nicht das
geplante.

**Supabase:** keine Schema-Migration nötig — alle neuen Versuchs-/Treatment-
Felder liegen automatisch in `versuche.kfk_data` (voller Snapshot, siehe
"Supabase-Spiegelung" unten), genau wie `saatgutcharge`/`mdd_pp`/`posten_nr`
das schon vorher taten.

## Aenderungsmeldung an das Claude-Projekt (seit v1.8.0)
Das Claude-Projekt "Forschungsplan_Skyseed" soll jede Aenderung am Tracker
mitbekommen, ohne dass Simon sie dort erzaehlt. Traeger ist eine einzige
maschinenlesbare Datei im Repo-Wurzelverzeichnis:

**`tracker-status.json`** (Schema `kfk-tracker-status-v1`) - erzeugt von
`scripts/stamp-status.js`, **nie von Hand bearbeiten**. Inhalt: Version,
APP_VERSION + Datum, Branch, Commit, Zeitstempel, die aktiven Schemata
(`kfk-protocol-v3`, Long-Format-CSV), die Aenderungsliste des obersten
CHANGELOG-Abschnitts und die noch offenen Apps-Script-Migrationen.

Zwei Abrufpunkte, deren Differenz die eigentliche Information ist:

| Zweck | URL |
|---|---|
| **LIVE** (Branch `main`, via GitHub Pages) | `https://simongoldenberg.github.io/kfk-tracker-2.0/tracker-status.json` |
| **Entwicklung** (Branch `develop`, via raw) | `https://raw.githubusercontent.com/simongoldenberg/kfk-tracker-2.0/develop/tracker-status.json` |

Unterscheiden sich die Versionen, liegt etwas Fertiges auf `develop`, das noch
nicht deployt ist. Genau das soll die Versuchsleitung beim Sitzungsbeginn sehen.

**Wann gestempelt wird**
- bei jedem Commit ueber den `pre-commit`-Hook (einmalig `npm run hooks:install`;
  Hooks liegen in `.git/hooks` und sind nicht versionierbar, daher das Skript)
- bei `npm run deploy:frontend` und `npm run deploy:backend` (fest in den
  npm-Scripts verdrahtet)
- von Hand mit `npm run stamp`

**Pflicht bei jeder Aenderung:** einen CHANGELOG-Eintrag unter der obersten
Versionsueberschrift anlegen, bevor committet wird. Der Stempler liest genau
diesen Abschnitt - ohne Eintrag meldet die Datei die Aenderung nicht. Kommt
eine Migration im Apps-Script-Editor dazu, gehoert sie in einen Abschnitt
"### Nach dem Deploy einmalig ausfuehren" mit Code-Block; der Stempler zieht
die Zeilen nach `offene_migrationen`.

Der Stempler warnt, wenn `APP_VERSION`, `package.json` und der oberste
CHANGELOG-Eintrag auseinanderlaufen - die Warnung landet als Feld `warnungen`
in der JSON-Datei und ist damit auch fuer das Projekt sichtbar.

## Standort-Zaehlrichtung
**Boden 1 = UNTEN, Boden 5 = OBEN** (`BODEN_LABELS` in index.html).
Verbindlich seit 15.08.2026. Die SOP sagte bis v2.1 das Gegenteil; die
Tracker-Beschriftung war die richtige und die SOP wurde angepasst, nicht
umgekehrt - bereits erfasste Standorte wurden gegen diese Beschriftung
eingetragen. Nicht wieder umdrehen.

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

**Historischer Backfill (10.08.2026):** Da die Supabase-Spiegelung erst seit
09.08.2026 läuft, mirrort `backupCurrentVersuch()` ältere Versuche nicht
automatisch nach. Alle bis dahin bestehenden Versuche wurden einmalig per
Skript aus der Apps-Script-API (`action=list`/`listArchiv`/`get`, siehe
Deploy-Workflow) nachgezogen — **nicht** aus Asana gescraped, da das Sheet
über die App-API strukturiert genau denselben `{versuch, daten}`-Snapshot
liefert wie `backupCurrentVersuch()` und damit die zuverlässigere Quelle ist.
Test-Einträge (z.B. `26_026` "TEST TRACKER Ende-zu-Ende") wurden bewusst
ausgelassen. Künftige neue Versuche brauchen keinen Backfill mehr, sobald sie
einmal im Tracker geöffnet/gespeichert wurden.

**Zusatzspalten & Kategorie/Vergleich (10.08.2026):** Detail-Panel zeigt
zusätzlich Posten-Nr./MDD-PP/Saatgutcharge (`v.posten_nr`/`v.mdd_pp`/
`v.saatgutcharge`) sowie Regal/Ebene je Tray (`js/standorte.js`,
`KfkStandorte.migrateVersuchStandorte(v)` — dafür bindet `ergebnisse.html`
dieses Skript zusätzlich ein). Die Forschungsplan-Kategorie (A–D) wird per
Regex aus dem führenden Buchstaben von `v.themenbereich` abgeleitet
(`kategorieVon()` — A) System Pellet & Saatgut, B) Prädation,
C) Infrastruktur, D) Direktsaatversuch; alles außerhalb A–D, z.B. "F) Ideen",
bleibt ohne Kategorie). Checkbox-Spalte je Zeile sammelt Versuche für einen
Seite-an-Seite-Vergleich (Modal `openCompare()`: Metadaten + KF% je
Treatment-Code über alle ausgewählten Versuche). Sortier-Dropdown
(`#sortBy`) schaltet zwischen Versuchsnr/Art/Kategorie um.

**Dateninkonsistenz bei älteren Versuchen (Fallback statt Summe):** Für
Versuche vor v1.3.0 (z.B. `26_034`, `26_033`, `26_032`, `26_029`) stehen in
den Sheets je AZ teils bereits kumulierte statt inkrementelle Werte — das
additive Zählverfahren („nur neu gekeimte Samen je AZ", siehe oben) wurde
erst mit v1.3.0 eingeführt. Eine reine Summenbildung würde solche Alt-Werte
doppelt zählen und KF% > 100 % ergeben. `berechneTreatmentErgebnisse()` prüft
deshalb pro Topf: ergibt Summe(AZ1…AZn) > Samen-pro-Topf, gilt stattdessen der
höchste Einzelwert über alle AZ-Runden als finale Keimquote (Annahme: dieser
Einzelwert war bereits kumulativ gemeint). Bei normal (additiv) erfassten
Versuchen bleibt die Summenbildung unverändert.

**Löschen aus der Ergebnistabelle (nur Spiegelung):** Papierkorb-Icon je
Zeile öffnet einen Tipp-zum-Bestätigen-Dialog (`openDeleteRow`/
`confirmDeleteRow`, gleiches UX-Muster wie `openDeleteVersuch` in
`index.html`) und löscht die Zeile per `client.from('versuche').delete()`
ausschließlich aus der Supabase-Spiegelung — Index-Zeile, Daten-Sheet,
Drive-Ordner und Asana-Task bleiben unberührt. Gedacht, um fehlerhafte/
doppelte Spiegel-Einträge manuell zu bereinigen. Voraussetzung: einmalig
`supabase/delete-policy.sql` im Supabase SQL-Editor ausführen (anon hatte für
`versuche` bislang nur insert+select+update, kein delete).

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

**Themenbereich-Farben (seit v1.8.0 wieder SOP-konform):**
`themenbereichToFarbe()` liefert exakt die Farben aus SOP Abschnitt 4.1, also die
des DOCX-Protokoll-Titelblocks: A = rot `#ef4444`, B = blau `#3b82f6`,
C = gelb `#eab308`, D = gruen `#22c55e`. Zwischen v1.4.0 und v1.7.1 lief hier
eine entsaettigte Erdpalette (Rost/Teal/Amber/Moos) — dadurch hatten Protokoll
und Tracker fuer denselben Versuch unterschiedliche Farben. Entscheidung vom
15.08.2026: die SOP gewinnt, weil das gedruckte Protokoll der Bezugspunkt im
Growzelt ist. Die uebrige App-Oberflaeche bleibt bei den Skyseed-Erdtoenen.

**Treatment-Farben einzelner Toepfe** (T0-T6 im Tray-Raster) kommen als Hex-Code
mit fuehrendem `#` aus `treatments[].color` — aus dem KFK-DATA-Block bzw. aus den
`T0 (#hex)`-Zeilen des Asana-Protokolls. Die App kann bereits angelegte Versuche
nicht rueckwirkend umfaerben.
