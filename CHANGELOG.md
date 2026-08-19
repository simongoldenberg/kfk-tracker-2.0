# Changelog

Alle nennenswerten Änderungen am KFK-Tracker. Format: neueste Version oben.

## Version 1.8.1 — 2026-08-19

### 🐛 Fixed
- **KERNREGEL: Auswertungs-Tab zeigte `#ERROR!` in jeder Zelle jedes Blocks.**
  `fillAuswertungTab_()` (neu in v1.8.0) schrieb alle Formeln mit
  US-Komma als Funktions-Argumenttrennzeichen (`ROUND(x,1)`, `IFERROR(x,"")`,
  `REGEXMATCH(a,b)`, …). Die Versuchs-Sheets laufen unter Gebietsschema
  "Deutschland" (Datei → Einstellungen → Allgemein), wo das Trennzeichen
  `;` ist — `Range.setFormula()` übernimmt den String wörtlich, es gibt
  keine automatische US→DE-Konvertierung. Jede Formel im Tab scheiterte
  dadurch beim Parsen. Alle Formeln in `fillAuswertungTab_`/`maskExpr`
  verwenden jetzt `;`; eingebettete Zahlenliterale (`samen_pro_topf`,
  `charge_kfk_potenzial`) laufen über die neue Hilfsfunktion `fmtNum_`
  (deutsches Dezimalkomma statt Punkt, falls nicht ganzzahlig).

### 🔧 Nach dem Deploy einmalig ausführen
```
rebuildAuswertungTabForAll(true)    // Report
rebuildAuswertungTabForAll(false)   // alle Auswertungs-Tabs mit korrigierten Formeln neu aufbauen
```

## Version 1.8.0 — 2026-08-15

Ergebnis des Abgleichs zwischen dem Claude-Projekt "Forschungsplan_Skyseed"
(SOP v3.0) und diesem Repo vom 15.08.2026.

### 🐛 Fixed
- **KERNREGEL: Auswertungs-Tab rechnete nicht kumulativ.** `buildAuswertungTab()`
  griff je AZ-Block direkt auf die rohe Rundenspalte zu (`AVERAGEIFS(Daten!J:J,…)`
  für AZ2). Da `AZn_Zahl` bewusst nur die **neu** gekeimten Samen dieser Runde
  enthält, zeigte der Tab "Live-Auswertung" ein KFK % und rel. KFK %, das nur
  eine einzelne Runde abbildete — im Widerspruch zur SOP-Kernregel
  `KFK = AZ1 + AZ2 + AZ3 + …`. Alle Blöcke rechnen jetzt kumulativ
  (Summe AZ1…AZn je Topf). Eingabe-Modal, Fortschritts-Pills, Backend-Statistik
  und CSV-Export waren nie betroffen.
- **Auswertungs-Tab war an feste Spaltenbuchstaben gebunden** (`D`, `G`, `J`, …).
  Die Spalten werden jetzt aus der echten Kopfzeile des Tabs "Daten" aufgelöst
  (`datenSpaltenAufloesen_`) — immun gegen eine Tray-Spalte und gegen später
  ergänzte Spalten.
- **Themenbereich-Farben** wichen vom Protokoll-Titelblock ab (Erdpalette statt
  SOP §4.1). `themenbereichToFarbe()` liefert wieder A = rot `#ef4444`,
  B = blau `#3b82f6`, C = gelb `#eab308`, D = grün `#22c55e`, damit Protokoll
  und Tracker denselben Versuch gleich einfärben.
- **`az_geplant` und `az_termine` waren entkoppelt.** Ein Gehölzversuch mit
  `az_termine: [7,14,21,28]`, aber ohne explizites `az_geplant`, bekam nur drei
  AZ-Tabs — die vierte Runde war nicht erfassbar. `az_geplant` wird jetzt aus
  `az_termine.length` abgeleitet (gedeckelt auf 1–5).
- **`type="number"`** im Importformular ("AZ geplant") auf den Tracker-Standard
  `type="text"` + `inputmode="numeric"` umgestellt.
- **`ART_LEXIKON`** um *Abies grandis* (KüTa) und *Triticum aestivum* (Weizen)
  ergänzt — beide werden in der SOP und in `js/chargen.js` geführt, wurden bei
  der Baumart-Normalisierung aber nicht erkannt.

### 🚀 Added
- **Block "Gesamt" im Auswertungs-Tab**: Summe über alle AZ-Runden, hervorgehoben,
  mit `n · Ø · SD · Min · Max · KFK % · CV % · rel. KFK %`. Das ist der Block, auf
  dem die Inferenzstatistik läuft (SOP §7). Der Statistik-Hinweis in der App
  verwies bisher auf einen "Gesamt-Tab", den es nicht gab.
- **Dickenklasse je Topf** (`Dickenklasse`-Spalte im Daten-Sheet, Freitext-Feld im
  Topf-Modal, `saveTopf`-Feld `dickenklasse`). Die SOP führt die Sieb-Dickenklasse
  als Pflicht-Kovariate; im CSV-Export war die Spalte bislang dauerhaft leer.
  Sie wird jetzt befüllt.
- **Wartungsfunktionen** (Apps-Script-Editor): `rebuildAuswertungTab('26_0XX')`,
  `rebuildAuswertungTabForAll(dryRun)`, `ensureDickenklasseColumnForAll(dryRun)`.

### 💥 Breaking Changes
- **`posten_nr` und `saatgutcharge_id` sind dieselbe Größe** und werden zu einem
  Feld zusammengeführt (Entscheidung Simon, 15.08.2026): bei Gehölzen die
  amtliche Postennummer, bei Hanf/Weizen eine eigene Kennung. Die physische
  Spalte `Posten_Nr` bleibt für Alt-Zeilen erhalten und wird gelesen, aber nicht
  mehr getrennt gepflegt; `readIndex()` liefert `posten_nr` nur noch als Alias auf
  `saatgutcharge_id`. Das Detail-Panel zeigt nur noch ein Feld.

### 🔗 Änderungsmeldung an das Claude-Projekt
- **`tracker-status.json`** im Repo-Wurzelverzeichnis (Schema
  `kfk-tracker-status-v1`): maschinenlesbarer Stand des Trackers — Version,
  Branch, Commit, aktive Schemata, Änderungsliste des obersten
  CHANGELOG-Abschnitts, offene Migrationen. Erzeugt von
  `scripts/stamp-status.js`.
- Abrufbar als **live** (`…github.io/kfk-tracker-2.0/tracker-status.json`, Stand
  von `main`) und **develop** (`raw.githubusercontent.com/…/develop/…`). Die
  Differenz zeigt, ob etwas committet, aber noch nicht deployt ist.
- Gestempelt wird bei jedem Commit (`pre-commit`-Hook, einmalig
  `npm run hooks:install`), bei `deploy:frontend`/`deploy:backend` und manuell
  über `npm run stamp`.
- Der Stempler warnt, wenn `APP_VERSION`, `package.json` und der oberste
  CHANGELOG-Eintrag auseinanderlaufen.

### 📐 Standort-Zählrichtung festgelegt
- **Boden 1 = unten, Boden 5 = oben.** Die Tracker-Beschriftung war korrekt,
  die SOP-Formulierung „Boden 1 = oben" war der Fehler und ist in SOP v3.0
  korrigiert. Am Code ändert sich nichts außer einem Kommentar, der die
  Richtung gegen ein versehentliches Umdrehen absichert.

### 🔧 Nach dem Deploy einmalig ausführen
```
rebuildAuswertungTabForAll(true)    // Report
rebuildAuswertungTabForAll(false)   // alle Auswertungs-Tabs kumulativ neu aufbauen
ensureDickenklasseColumnForAll(false)
```

Und einmalig lokal im Repo: `npm run hooks:install`

## Version 1.7.1 — 2026-08-14

### 🐛 Fixed
- **Treatment-Farbe blieb beim Paste-Import leer.** Ein SOP-Entwurfsfehler
  erzeugte KFK-DATA-Blöcke mit `farbe_hex` (ohne führendes `#`) statt `color`.
  Das RBD-Raster liest ausschließlich `treatments[].color`, die Kachel fiel
  deshalb auf Grau zurück. `mapTreatmentsV3_()` in `js/paste-import.js` übernimmt
  `farbe_hex` jetzt automatisch und ergänzt ein fehlendes `#` — als Sicherheitsnetz
  für Altbestand, nicht als Empfehlung. Neue Blöcke verwenden direkt `color`.

## Version 1.7.0 — 2026-08-13

### 🚀 Added
- **Chargen-IDs**: bildet die beiden Papierprotokolle "Chargenprotokoll
  Pelletierung" und "Chargenprotokoll Substrat" ab. Neue Felder auf
  Versuchsebene (Saatgutcharge-ID, Potenzial-KFK der Charge, kompletter
  Substrat-Block) im neuen Modal "Chargen bearbeiten", neue Felder je
  Treatment (Pelletcharge-ID, Matrixzusammensetzung, Schichtdicke,
  Pelletiert von, Anker T0/T_ref/Test, nackte Saat) im neuen Modal
  "Treatment bearbeiten". "Sammelübernahme"-Helfer parst eine Zeile aus
  dem Pelletierprotokoll direkt in die Treatment-Felder.
- **Aussaat vs. Aktivierung**: trennt Aussaat- von Aktivierungsdatum (Tag 0
  für alle Keimzeitberechnungen ist jetzt die Aktivierung). Wochentag-
  Validierung (Aussaat Mo–Do, Aktivierung nur Do) mit Begründungspflicht
  bei Abweichung, Ruhephase-Bestätigung, editierbare AZ-Termine-Vorschläge
  je Artengruppe.
- **Gelber Hinweis-Banner** in der Versuchsansicht für fehlende Chargen-/
  Aussaat-Aktivierung-Angaben; verschwindet automatisch sobald vollständig.
- **Blockierende Prüfung**: sowohl der Abschluss einer einzelnen AZ-Runde
  als auch der Versuchsabschluss verweigern sich ohne die Chargen-
  Pflichtangaben (inkl. Pelletcharge-ID je nicht-nackter Treatment).
- **rel. KFK (relative Keimleistung)**: neue Spalte im `Auswertung`-Tab
  jedes Versuchs-Datensheets (kumulative KFK% im Verhältnis zum
  Chargenpotenzial), nur für neu angelegte Versuche.
- **T0/T_ref-Symbol** auf den Versuchskarten zeigt, ob die Anker-Treatments
  für die Jahresauswertung vorhanden sind.
- Import-Schema `kfk-protocol-v3` (Chargen-IDs, Aussaat/Aktivierung),
  rückwärtskompatibel zu v1/v2.

### 💥 Breaking Changes
- **CSV-Export auf Long-Format umgestellt**: der Button "Export CSV" liefert
  jetzt eine Zeile pro (Versuch × Topf × AZ) mit neuen, snake_case
  Spaltennamen, Komma- statt Semikolon-getrennt (RFC 4180) — für die
  versuchsübergreifende Meta-Analyse per R-Skript. Bestehende Auswertungen,
  die auf dem alten Wide-Format aufbauen, müssen angepasst werden.

## Version 1.6.0 — 2026-08-10

### 🚀 Added
- **Ergebnistabelle: Posten/Charge & Standort im Detail-Panel** — zeigt jetzt
  zusätzlich Posten-Nr., MDD/PP, Saatgutcharge sowie Regal/Ebene je Tray.
- **Ergebnistabelle: historischer Backfill** — alle 21 bisherigen Versuche
  (aktiv + archiviert) wurden einmalig aus der Apps-Script-API in die
  Supabase-Spiegelung nachgezogen, statt nur die seit 09.08.2026 laufend
  gespiegelten Versuche zu zeigen.
- **Ergebnistabelle: Kategorie A–D** aus dem Asana-Forschungsplan-
  Themenbereich abgeleitet, inkl. Sortierung nach Kategorie oder Art.
- **Ergebnistabelle: Versuchsvergleich** — Checkbox je Zeile, Vergleichs-
  Modal stellt Metadaten und KF% je Treatment mehrerer Versuche nebeneinander.
- **Ergebnistabelle: Löschen aus der Spiegelung** — Papierkorb-Button je
  Zeile mit Tipp-zum-Bestätigen-Dialog entfernt fehlerhafte/doppelte
  Einträge aus der Supabase-Spiegelung (Index/Sheet/Drive/Asana bleiben
  unberührt). Voraussetzung: `supabase/delete-policy.sql` einmalig im
  SQL-Editor ausgeführt.

### 🐛 Fixed
- **KF% > 100 % bei Alt-Versuchen**: Versuche vor v1.3.0 hatten teils bereits
  kumulierte statt inkrementelle AZ-Werte im Sheet. Übersteigt die additive
  Summe eines Topfes die Samenanzahl, gilt jetzt der höchste Einzelwert über
  alle AZ-Runden als finale Keimquote statt der (fehlerhaften) Summe.

## Version 1.5.0 — 2026-08-08

### 🚀 Added
- **Standorterfassung für Trays**: Regal (1–6) und Boden (1–5, "1 (oben)" bis
  "5 (unten)") je Tray, gut sichtbar im Kopfbereich des Versuchs. Fehlender
  Standort zeigt einen nicht blockierenden Hinweis, blockiert aber nie die
  Zähleingabe. Beim Öffnen eines AZ-Tabs fragt die App einmalig "Standort
  unverändert?" — bei "Geändert" wandert der alte Wert unverändert in eine
  Historie (`standortHistorie`), damit spätere Auswertungen den Standort als
  Kovariate berücksichtigen können.
- **CSV-Export** direkt aus der App (Button "Export CSV"): Position, Tray,
  Regal, Boden, Treatment, AZ-Spalten, Σ KFK, KFK% — inkl. Fallback auf leere
  Zellen bei fehlendem Standort statt Raten.
- **KFK-DATA-Import (Schema `kfk-protocol-v2`)** übernimmt jetzt optional ein
  `standorte`-Feld aus dem Protokoll-Doc; Schema v1 ohne dieses Feld
  funktioniert unverändert weiter.
- **Vitest-Testsuite** eingeführt (`npm test`, 17 Tests): Migration von
  Altbeständen ohne Standort, CSV-Spaltenreihenfolge, Import-Übernahme,
  Verhalten bei fehlendem Standort.

## Version 1.4.0 — 2026-08-08

### 🚀 Added
- **Dunkelmodus**: Umschalter im Header (Sonne/Mond-Icon), Standard folgt der
  Systempräferenz, manuelle Wahl wird in `localStorage` gemerkt. Zweiter
  Farb-Token-Satz unter `:root[data-theme="dark"]`.
- **Fortschrittsbalken auf der Versuchskarte**: zusätzlich zu den AZ-Pills
  zeigt jede Karte in der Liste einen dünnen Balken für den Gesamtfortschritt
  über alle geplanten AZ-Runden.
- **Sticky AZ-Umschalter**: bleibt beim Scrollen durch die Töpfe oben
  angeheftet sichtbar.
- **Leere Töpfe deutlich markiert**: diagonale Schraffur + gestrichelter
  Rahmen statt eines blassen „—", das in praller Sonne kaum zu erkennen war.

### 🔄 Changed
- **Design auf das Skyseed-System umgestellt** (Skill `skyseed-design`):
  Inter statt JetBrains Mono/Fraunces, Teal/Moos/Sand-Farbpalette, weiche
  Radien (4–8px) und Schatten statt harter 0px-Kanten und dicker Rahmen.
  Der bisherige „Feldbuch"-Look (Mono-Schrift, kursive Serife, Papierfarben)
  ist damit Geschichte — bewusste Entscheidung für ein einheitliches
  Erscheinungsbild über alle Skyseed-Tools hinweg.
- **Treatment-/Themenbereich-Farben entsättigt**: `themenbereichToFarbe()`
  und die Platzhalter im Import-Formular nutzen jetzt eine erdige Rost/
  Teal/Amber/Moos-Palette statt der alten Tailwind-Grundfarben. Bereits in
  Asana-Protokollen hinterlegte Treatment-Hex-Codes (T0-T6 im Tray-Raster)
  kann die App nicht rückwirkend ändern — das betrifft nur neue Versuche.
- **Emoji durch Inline-SVG-Icons ersetzt** in der gesamten App-UI (Buttons,
  Modal-Titel, Links, Foto-Buttons, Plausibilitätswarnung). Emoji in Texten,
  die als Asana-Kommentar gepostet werden, bleiben unverändert — das ist
  Text für Asana, keine App-UI.

## Version 1.3.1 — 2026-08-07

### 🐛 Fixed
- **Topf-Nummer überlappte auf echten Tablets mit dem Treatment-Label**
  (von Simon per Foto gemeldet). Tray-Quadrate etwas vergrößert
  (`.rbd`-Spaltenformel Divisor 2 → 1.6) und die Schriftgröße der
  Topf-Nummer 1..N von 15px auf 11px reduziert, damit sie klar
  untergeordnet und aus dem Weg des Treatment-Labels bleibt.
- **`CACHE_VERSION` beim 1.3.0-Release vergessen zu bumpen** — dadurch
  haben bereits installierte PWA-Instanzen (Tablets) weiterhin die
  gecachte Version vom 2026-08-06 ausgeliefert, unabhängig davon was
  seither live ging. Jetzt nachgeholt (`bump-cache.js`); künftige Deploys
  laufen über `npm run deploy:frontend`, damit das nicht wieder passiert.

## Version 1.3.0 — 2026-08-07

### 🐛 Fixed
- **Kumulative KF% jetzt überall konsistent berechnet** (schließt das
  1.2.0-Known-Issue): Topf-Eingabe-Modal, Fortschritts-Pills, Statistik und
  ANOVA rechnen nicht mehr mit dem rohen Einzelwert einer AZ-Runde, sondern
  mit der kumulierten Keimzahl (`cumulativeAZValue_` Backend,
  `cumulativeAZSum` Frontend). Das Eingabe-Modal zeigt neu getrennt „+X neu
  seit letzter AZ" und „Kumulativ: Y von Samen-pro-Topf → Z% KF". Für bereits
  erfasste Versuche mit mehreren AZ-Runden ändern sich dadurch die
  angezeigten KF%-Werte (sie werden höher, da jetzt tatsächlich aufsummiert
  statt je Runde isoliert betrachtet) — die zugrunde liegenden Rohdaten im
  Sheet bleiben unverändert.
- **Rundenobergrenze bei der Eingabe ist jetzt dynamisch**: maximal
  „Samen-pro-Topf minus Summe der vorherigen Runden" statt pauschal
  Samen-pro-Topf — verhindert von vornherein, dass eine kumulierte Zählung
  rechnerisch die Samenanzahl übersteigen kann (genau das Muster, das die in
  1.2.0 dokumentierte Zähl-Ausnahme verursacht hat).
- **Version-PR `develop` → `main` gemerged, Backend deployed, Tag `v1.3.0`
  gesetzt.** Der aktuelle Tracker ist damit unter
  https://simongoldenberg.github.io/kfk-tracker-2.0/ live.
- **Altes Repo `kfk-tracker` gelöscht** (2026-08-07, auf Wunsch von Simon —
  Settings → Pages → „None" ließ sich nicht setzen, daher direkt das ganze
  Repo entfernt). Die alte, veraltete Pages-Site ist damit ebenfalls weg.

## Version 1.2.0 — 2026-08-07

### 🚀 Added
- **Offline-Warteschlange für Zählwerte**: Schlägt `saveTopf` fehl (kein Netz),
  wird der Wert lokal in `localStorage` gepuffert statt verloren zu gehen.
  Automatischer Nachversand bei `online`-Event, beim Öffnen der App und bei
  jedem Poll-Tick. Sync-Anzeige zeigt „N ausstehend", solange die
  Warteschlange nicht leer ist.
- **Plausibilitätswarnung bei der AZ-Eingabe**: Warnt (blockiert nicht) im
  Topf-Modal, wenn ein neuer AZ-Wert niedriger ist als der höchste Wert einer
  früheren AZ-Runde desselben Topfes — genau das Muster, das durch vergessenes
  Ziehen der Keimlinge entsteht.
- **`normalizeIndexArten()`**: Einmalige Wartungsfunktion (Apps-Script-Editor),
  die bestehende Baumart_lat/Baumart_kurz-Werte im Index über `ART_LEXIKON`
  normalisiert. Standardmäßig `dryRun=true` (nur Report, kein Schreiben) —
  erst `normalizeIndexArten(false)` schreibt tatsächlich.
- **Automatische Verantwortlich-Erkennung** (`extractVerantwortlichFromAsana_`):
  übernimmt den Namen des im Asana-Task zugewiesenen Nutzers (`assignee.name`)
  ins Import-Formular, Fallback bleibt `'Simon Goldenberg'`. ID-Nummer bleibt
  bewusst ein manuelles Feld.

### 🔄 Changed
- **`get`-Endpoint beschleunigt**: `getVersuch()` cacht sein Ergebnis kurz
  (`CacheService`, 8s TTL) statt bei jedem Poll/Tab das fremde Daten-Sheet neu
  per `SpreadsheetApp.openById()` zu öffnen (dominanter Latenz-Faktor). Jeder
  schreibende POST-Call (`saveTopf`, `markVersuchAbgeschlossen`, …) invalidiert
  den Cache für den betroffenen Versuch sofort.

### 🐛 Fixed
- **AZ-Semantik richtiggestellt**: Je AZ wird die Anzahl *neu* gekeimter Samen
  seit der letzten Auszählung erfasst (Keimlinge werden danach aus dem Topf
  entfernt); die kumulative Keimfähigkeit ergibt sich aus Summe(AZ1…AZn). Die
  Beschreibung in 1.1.0 (Rohdaten-Block-Kommentar + README) hatte das
  fälschlich als eigenständige Bestandszählung pro Runde dokumentiert —
  Auslöser war eine bestätigte Ausnahme (Keimlinge zeitweise nicht gezogen,
  dadurch beim Folgetermin mitgezählt), keine tatsächliche Änderung am
  Zählverfahren.

> [!CAUTION]
> ### 🐙 Known Issues
> - Topf-Ansicht, Statistik und ANOVA rechnen je AZ weiterhin nur mit dem rohen
>   Einzelwert dieser Runde (`AZn / Samen-pro-Topf`), **nicht** kumulativ über
>   alle Runden. Für die tatsächliche Gesamt-KF% müssen die AZ-Werte pro Topf
>   aktuell manuell aufsummiert werden — siehe `buildRohdatenHtml_`-Kommentar
>   und README. Ob das in der App selbst nachgezogen werden soll, ist offen.
> - Die alte Pages-Site https://simongoldenberg.github.io/kfk-tracker/ ist noch
>   online und liefert einen veralteten Stand (ohne Doc-Import). Wer sie als PWA
>   installiert hat, arbeitet mit der alten App. Der aktuelle Tracker läuft unter
>   https://simongoldenberg.github.io/kfk-tracker-2.0/.
> - GitHub Pages deployt von `main`. Änderungen auf `develop` sind erst nach dem
>   Version-PR live.

## Version 1.1.0 — 2026-08-06

### 💥 Breaking Changes
- **QR-Codes vollständig entfernt.** Der Header-QR, die Übersicht „QR-Codes aller
  Versuche" und die Anbindung an `api.qrserver.com` (inkl. Service-Worker-Passthrough)
  sind weg. Ausgedruckte QR-Codes an Topfträgern funktionieren weiterhin, weil der
  Deep-Link `?versuch=26_0XX` unverändert bleibt — es lassen sich nur keine neuen
  mehr in der App erzeugen.

### 🚀 Added
- **Rohdaten im Asana-Abschlussbericht** (`buildRohdatenHtml_`, Schema
  `kfk-results-v1`): Der Bericht enthält jetzt einen maschinenlesbaren Block
  `<<<KFK-RESULTS … KFK-RESULTS>>>` mit **allen Einzelwerten pro Topf und AZ**
  (CSV: Tray, Topf, Block, Wdh, Treatment, AZ1…AZn), dazu Metadaten
  (Samen/Topf, Raster, Trays, AZ-Datum je Runde inkl. n), Treatment-Legende,
  Foto-Links je AZ/Tray sowie Sheet- und Drive-Link. Damit reicht der Asana-Post
  allein für eine vollständige Auswertung.
- **Versuch löschen**: Backend-Aktion `deleteVersuch` + 🗑-Button auf jeder
  Versuchskarte (aktive Liste und Archiv). Entfernt **nur die Index-Zeile**;
  Daten-Sheet, Drive-Ordner und Asana-Task bleiben erhalten. Zur Sicherheit muss
  im Dialog die Versuchsnummer eingetippt werden.
- **Automatische Baumart-Erkennung aus dem Asana-Task** (`extractArtFromAsana_`
  + Arten-Lexikon `ART_LEXIKON` mit 26 Arten): erkennt `Saatgut: Hanfsamen
  (Cannabis sativa)`, lateinische Namen im Volltext und deutsche Namen/Kürzel.
  Füllt „Baumart lat." und „Baumart kurz" und normalisiert auf die im Index
  gebräuchliche Schreibweise (Hanfsamen → Cannabis sativa / Hanf).
- **Automatische Ort-Erkennung** (`extractOrtFromAsana_`): Asana-Custom-Field
  „Ort" oder Notizen-Zeile `Ort: …` (auch inline nach `|`).
- **Version + Datum in der Kopfzeile** (`APP_VERSION`, `APP_VERSION_DATE`) —
  dezent unter dem Titel, auf Liste und Detailansicht. `bump-cache.js` stempelt
  das Datum beim Frontend-Deploy automatisch mit.

### 🔄 Changed
- **Standardwerte für neue Versuche**: Ort = `Growzelt` (vorher `Halle`),
  AZ geplant = `3` (vorher `5`). Aus Asana gelesene Werte haben Vorrang.
- **Schriftgrößen um Faktor 1,5 erhöht** (108 Werte, Basis 15px → 22px,
  H1 bis 42px) — bessere Lesbarkeit im Growzelt/Outdoor.
- **Tray-Raster**: Topf-Quadrate halb so groß, Treatment-Label dafür
  dreifach (11px → 33px, mit Container-Query-Deckel `min(33px, 46cqw)`,
  damit auf schmalen Displays nichts überläuft). Bei Tablet-Landscape-Breite
  (1280px) ergibt das 121×121-Quadrate statt ~250×250.
- Statistik und Rohdaten scannen immer bis AZ5, auch wenn `AZ_geplant`
  kleiner ist — so gehen nachträglich erfasste Runden nicht verloren.

### 🐛 Fixed
- `importFromAsana` (Notizen-Fallback) liefert nun ebenfalls Baumart und Ort;
  vorher blieben diese Felder beim Fallback-Import leer.

## Version 1.0.0 — 2026-07-08

Erster als Version festgehaltener Stand (bisher unversioniert entwickelt).

### 🚀 Added
- Doc-Import: Prefill + RBD-Layout aus dem Google-Doc-Protokoll
  (`<<<KFK-DATA`-Block, Schema `kfk-protocol-v1`), Auto-RBD beim Anlegen.
- Auswertung landet beim Abschluss im Asana-Subtask „Auswertung & Bericht";
  Statistik mit ANOVA, η² und CV%.
- Schnell-Archivierung (📦) direkt aus der Übersicht.
- `clasp`-basiertes Backend-Deploy mit fester Deployment-ID,
  `bump-cache.js` für die Cache-Version.
- Foto-Erfassung: 1 Foto pro AZ und Tray, inkl. Initial-Fotos (AZ0).
