# KFK-Tracker (Skyseed) — 2.0

Progressive Web App zur Erfassung von **Keimfähigkeitsversuchen** im Skyseed-Programm.
Ein neuer Versuch wird aus dem verknüpften **Google-Doc-Versuchsprotokoll** eingelesen
(JSON-Block `kfk-protocol-v1`), im Tracker angelegt und mit dem RBD-Layout (Treatment +
Farbe pro Topf) befüllt. Danach werden pro Auszählung (AZ1–AZ5) die gekeimten Samen erfasst.

---

## 1. Wichtige Links & IDs

| Was | Wert |
|---|---|
| **Tracker (Frontend, GitHub Pages)** | https://skyseed-berlin.github.io/kfk-tracker-2.0/ |
| **GitHub-Repo (privat, Org skyseed-berlin)** | https://github.com/skyseed-berlin/kfk-tracker-2.0 |
| **Backend-Webapp (Apps Script)** | https://script.google.com/macros/s/AKfycbyCtrEP1wsfkUsfaGMhLjouBxjYMA5la4XPeLG3Q1cUHv7qpmaLIplAsJy6gkaNaRSlgw/exec |
| **Deployment-ID (stabil!)** | `AKfycbyCtrEP1wsfkUsfaGMhLjouBxjYMA5la4XPeLG3Q1cUHv7qpmaLIplAsJy6gkaNaRSlgw` |
| **Apps-Script Script-ID** | `1_IFGDYRm8WX154RiKS6YMKKF_IodQ4zDR5X4n2SiZQ8ys0o0mA6vBY5D` |
| **__KFK-Index (Google Sheet)** | Single Source of Truth für alle Versuche; das Skript ist an dieses Sheet gebunden (Erweiterungen → Apps Script) |
| **KFK-Daten-Ordner (Drive)** | `15X-Ri1feR3I1qGC6FgPpPLc0jgHskcoM` (enthält je Versuch einen Unterordner mit Daten-Sheet + Fotos) |
| **Protokoll-Docs-Ordner (Drive)** | `1Ot7vLApx_tWLzqCmNQDXO7ZVY41iw7dJ` (Google-Docs mit KFK-DATA-Block) |

> ⚠️ Die Deployment-ID **niemals** wechseln — sonst ändert sich die Backend-URL und der
> Tracker verliert die Verbindung. Deshalb immer bestehendes Deployment aktualisieren
> (siehe Abschnitt 4).

---

## 2. So funktioniert das System (Überblick)

```
Forschungsplan (Claude-Projekt)
   └─ erstellt Google-Doc-Protokoll  ──  am Doc-Ende: <<<KFK-DATA … KFK-DATA>>>
   └─ Asana-Task (Notizen enthalten die docs.google.com-URL des Protokolls)
                    │
                    ▼
Tracker "📥 Aus Asana"  →  Asana-Task-GID eingeben
   └─ Backend liest die Doc-URL aus den Asana-Notizen
   └─ liest den KFK-DATA-Block aus dem Doc  →  füllt das Anlege-Formular (Prefill)
                    │  "Anlegen"
                    ▼
Backend: Versuch in __KFK-Index eintragen + Daten-Sheet anlegen
   └─ Auto-RBD: Treatments/Farben je Topf ins Daten-Sheet schreiben
                    │
                    ▼
Tracker zeigt das RBD-Raster  →  AZ1…AZ5 erfassen, Fotos, Auswertung
```

**Bausteine:**
- **Frontend** — `index.html` (eine Datei, komplette App), `service-worker.js` (Offline-Cache),
  `manifest.json` + Icons. Läuft als PWA (installierbar auf Tablet/Handy).
- **Backend** — Google Apps Script, an das **__KFK-Index**-Sheet gebunden. Dateien:
  - `kfk-apps-script.gs` — Hauptcode (HTTP-Endpunkte, Import, Sheet-Aufbau, Statistik, Backups)
  - `Patches.js`, `patch-26_024-treatments-v2.gs.js` — einmalige Hilfs-/Patch-Skripte
  - `appsscript.json` — Manifest (Zeitzone, OAuth-Scopes, Webapp-Zugriff)
- **Datenhaltung** — `__KFK-Index` (Metadaten aller Versuche) + je Versuch ein eigenes
  Daten-Sheet im KFK-Daten-Ordner.

**Doc-Import (Kern):** Der Backend-Endpunkt `importFromDoc` liest den `KFK-DATA`-Block
(Schema `kfk-protocol-v1`) aus dem verknüpften Protokoll-Doc. Fallback auf den alten
Asana-Notizen-Import (`importFromAsana`), falls kein Doc/Block gefunden wird.

---

## 3. Anleitung: Neuen Versuch anlegen (Normalbetrieb)

**Voraussetzung:** Es existiert ein Protokoll-Doc mit `KFK-DATA`-Block, und die Doc-URL
steht in den Notizen des zugehörigen Asana-Tasks. (Beides erzeugt das Claude-Projekt
„Forschungsplan" — siehe `FORSCHUNGSPLAN-Projektanweisung.md`.)

1. Tracker öffnen → Button **„📥 Aus Asana"**.
2. **Asana-Task-GID** (oder den Asana-Link) einfügen und laden.
   → Das Formular füllt sich automatisch aus dem Doc: Versuchsnr, Titel, Themenbereich,
   Hypothese, Treatments (mit Farben), Trays, Raster, Samen/Topf.
3. Werte kurz prüfen → **„Anlegen"**.
   → Der Versuch wird angelegt **und das RBD-Raster automatisch befüllt**
   (Toast: „RBD: X/Y Töpfe belegt").
4. Versuch öffnen → AZ wählen → Zählwerte/Fotos erfassen.

**Vorbelegt beim Anlegen:** Ort = `Growzelt`, AZ geplant = `3`, Baumart (lat. + kurz)
wird automatisch aus dem Asana-Task erkannt (Zeile `Saatgut: …`, lateinischer Name im
Text oder deutscher Name über das Arten-Lexikon). Liefert Asana ein Custom-Field „Ort"
oder eine Zeile `Ort: …`, gewinnt dieser Wert. Alle Felder bleiben editierbar.

**Auszählungen:** Je AZ wird nur die Anzahl **neu** gekeimter Samen seit der letzten
Auszählung eingetragen — bereits gekeimte Keimlinge werden nach dem Zählen **abgeschnitten**
(oder gezogen, solange die Keimwurzel noch flach sitzt und das Substrat nicht mitkommt), damit
sie beim nächsten Mal nicht erneut mitgezählt werden. Das Eingabe-Modal zeigt
getrennt den rohen Neu-Wert dieser Runde und die **kumulative** Gesamt-Keimfähigkeit
(Summe AZ1…AZn / `Samen/Topf`) — Topf-Ansicht, Fortschritts-Pills, Statistik und ANOVA rechnen
seit v1.3.0 durchgängig mit dieser kumulierten Zahl, der Auswertungs-Tab im Versuchs-Sheet
seit v1.8.0 ebenfalls (inklusive Block **„Gesamt"** über alle Runden). Die Eingabe ist pro Runde zusätzlich auf
die noch nicht gekeimten Samen begrenzt (`Samen/Topf` minus bisherige Summe), damit die
Kumulierung rechnerisch nie über die Samenanzahl steigen kann. Einzelne Altdaten aus 26_033
(Topf 1: AZ1=20, AZ2=18, AZ3=18) stammen aus einer bestätigten Ausnahme vor dieser Regel: dort
wurden Keimlinge zwischenzeitlich nicht gezogen und beim Folgetermin versehentlich mitgezählt.

**Versuch abschließen:** 🏁 im Detail → Status „Abgeschlossen", Asana-Task erledigt,
und in den Subtask „Auswertung & Bericht" wandert der vollständige Bericht: Kontext,
Trend, Statistik (ANOVA/η²/CV) **und ein maschinenlesbarer Rohdaten-Block**
`<<<KFK-RESULTS … KFK-RESULTS>>>` mit allen Einzelwerten pro Topf und AZ, AZ-Daten,
Foto-Links sowie Sheet-/Drive-Link. Damit kann die Auswertung allein aus Asana erfolgen.
Vorab prüfen ohne zu posten: `testAuswertungsBericht('26_0XX')` im Apps-Script-Editor.

**Versuch löschen:** 🗑 auf der Versuchskarte (aktive Liste oder Archiv) → im Dialog die
Versuchsnummer eintippen. Entfernt **nur die Zeile im `__KFK-Index`**; Daten-Sheet,
Drive-Ordner und Asana-Task bleiben erhalten.

**RBD manuell nachladen** (nur falls nötig, z. B. Layout im Doc korrigiert): im
Apps-Script-Editor `importRbdFromDoc('26_0XX')` bzw. die Wrapper `testImportRbdDoc…` ausführen.

---

## 4. Anleitung: Änderungen am System vornehmen

Einmalige Einrichtung der Arbeitsumgebung:
- **Node.js** + **clasp** global: `npm install -g @google/clasp@2`
- **clasp login** (öffnet Browser, Konto simon.goldenberg@skyseed.eco)
- Apps-Script-API muss an sein: https://script.google.com/home/usersettings → „Google Apps Script API" = EIN
- Im Repo-Ordner liegt `.clasp.json` (Script-ID) — durch `.gitignore` nicht eingecheckt.

### 4a. Frontend ändern (`index.html`, `service-worker.js`, …)
```bash
npm run deploy:frontend
```
Das bumpt automatisch `CACHE_VERSION`, committet und pusht. GitHub Pages deployt in ~1 Min.
Danach im Tracker **Strg+F5** (bzw. PWA neu laden), damit der neue Cache greift.

### 4b. Backend ändern (`kfk-apps-script.gs` etc.)
```bash
npm run deploy:backend        # = clasp push && clasp deploy --deploymentId <feste ID>
git commit -am "…" && git push # damit Git = Cloud
```
Die feste Deployment-ID hält die Webapp-URL stabil.

> **⚠️ Wichtig — neuer OAuth-Scope:** Wenn du in `appsscript.json` einen **neuen Scope**
> ergänzt (z. B. `documents` für `DocumentApp`), erneuert `clasp deploy` die
> Web-App-**Autorisierung nicht** → die Webapp liefert dann **HTTP 404 für alle**.
> Fix: **einmalig über die UI** neu bereitstellen:
> Apps-Script-Editor → **Bereitstellen → Bereitstellungen verwalten → Stift (Bearbeiten)
> → Version „Neue Version" → Bereitstellen**, dabei den Autorisierungsdialog **zulassen**.
> Zugriff-Dropdown: **„Jeder"** = anonym (richtig für die PWA);
> „Jeder mit einem Google-Konto" = Login nötig (falsch → PWA-fetch bekäme 404).

### 4c. Faustregel App-Fehler vs. Deployment-Fehler
- App-Fehler (Bug im Code) → kommt als **JSON mit HTTP 200** (`{"error": …}`).
- **HTTP 404 bei jedem Aufruf** → Deployment-/Autorisierungs-Ebene (siehe Scope-Hinweis).

---

## 5. Sicherheit & Konventionen
- **ASANA_PAT** liegt ausschließlich in den **Skripteigenschaften** (Projekteinstellungen →
  Skripteigenschaften, Schlüssel `ASANA_PAT`) — **nie** im Code, nie im Git.
- **Treatment-Zuweisungen niemals im Code neu generieren** — immer aus dem Protokoll
  (KFK-DATA-Block) übernehmen.
- **Backups nie automatisch löschen.**
- Verbindliche Standing Rules: siehe [`CLAUDE.md`](CLAUDE.md).

---

## 6. Backend-Endpunkte (Kurzreferenz)
| Aufruf | Methode | Zweck |
|---|---|---|
| `list` / `get` / `listArchiv` | GET | Versuche listen/lesen |
| `importFromDoc` | GET | Prefill aus Protokoll-Doc (Fallback: `importFromAsana`) |
| `createVersuch` | POST | Versuch anlegen (+ Auto-RBD aus Doc) |
| `importRbdDoc` | POST | RBD aus Doc ins Daten-Sheet (Fallback: `importRbd`) |
| `saveTopf` / `abschlussAZ` / `uploadFoto` | POST | Erfassung |
| `markVersuchAbgeschlossen` | POST | Abschluss + Bericht inkl. Rohdaten nach Asana |
| `archiveVersuch` | POST | Status auf „Archiviert" (kein Bericht) |
| `deleteVersuch` | POST | Index-Zeile löschen (Sheet/Drive/Asana bleiben) |

Das JSON-Format des Protokoll-Blocks ist in `FORSCHUNGSPLAN-Projektanweisung.md` beschrieben.

---

## 7. Version

Die App zeigt Version und Versionsdatum dezent in der Kopfzeile (`v1.1.0 · 06.08.2026`).
Quelle: `APP_VERSION` / `APP_VERSION_DATE` in `index.html`, synchron mit `version` in
`package.json`. Das Datum stempelt `bump-cache.js` beim Frontend-Deploy automatisch;
die Nummer wird manuell beim Release (Version-PR `develop` → `main`) erhöht, danach
Git-Tag setzen. Änderungen je Version: [`CHANGELOG.md`](CHANGELOG.md).
