# Changelog

Alle nennenswerten Änderungen am KFK-Tracker. Format: neueste Version oben.

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
- **`get`-Endpoint beschleunigt**: `getVersuch()` cacht sein Ergebnis kurz
  (`CacheService`, 8s TTL) statt bei jedem Poll/Tab das fremde Daten-Sheet neu
  per `SpreadsheetApp.openById()` zu öffnen (dominanter Latenz-Faktor). Jeder
  schreibende POST-Call (`saveTopf`, `markVersuchAbgeschlossen`, …) invalidiert
  den Cache für den betroffenen Versuch sofort.

### 🐛 Fixed
- `importFromAsana` (Notizen-Fallback) liefert nun ebenfalls Baumart und Ort;
  vorher blieben diese Felder beim Fallback-Import leer.
- **AZ-Semantik richtiggestellt**: Je AZ wird die Anzahl *neu* gekeimter Samen
  seit der letzten Auszählung erfasst (Keimlinge werden danach aus dem Topf
  entfernt); die kumulative Keimfähigkeit ergibt sich aus Summe(AZ1…AZn). Eine
  Zwischenversion hatte das fälschlich als eigenständige Bestandszählung pro
  Runde dokumentiert — Ursache war eine bestätigte Ausnahme (Keimlinge
  zeitweise nicht gezogen, dadurch beim Folgetermin mitgezählt), keine
  Änderung am Zählverfahren.

> [!CAUTION]
> ### 🐙 Known Issues
> - Die alte Pages-Site https://simongoldenberg.github.io/kfk-tracker/ ist noch
>   online und liefert einen veralteten Stand (ohne Doc-Import). Wer sie als PWA
>   installiert hat, arbeitet mit der alten App. Der aktuelle Tracker läuft unter
>   https://simongoldenberg.github.io/kfk-tracker-2.0/.
> - GitHub Pages deployt von `main`. Änderungen auf `develop` sind erst nach dem
>   Version-PR live.
> - Topf-Ansicht, Statistik und ANOVA rechnen je AZ weiterhin nur mit dem rohen
>   Einzelwert dieser Runde (`AZn / Samen-pro-Topf`), **nicht** kumulativ über
>   alle Runden. Für die tatsächliche Gesamt-KF% müssen die AZ-Werte pro Topf
>   aktuell manuell aufsummiert werden — siehe `buildRohdatenHtml_`-Kommentar
>   und README. Ob das in der App selbst nachgezogen werden soll, ist offen.

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
