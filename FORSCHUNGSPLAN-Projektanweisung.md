# Projektanweisung „Forschungsplan" — KFK-Tracker-kompatible Versuchsprotokolle

> **Zweck dieses Dokuments:** Diesen Inhalt in die **Projektanweisungen des Claude-Projekts
> „Forschungsplan"** einfügen. Damit erzeugt jeder neu geplante Keimfähigkeitsversuch (KFK)
> automatisch ein Protokoll im richtigen Format, das der **KFK-Tracker** direkt einlesen kann.

---

## Was der Tracker braucht

Für jeden Versuch existieren zwei Dinge:

1. **Ein Google-Doc-Versuchsprotokoll**, das am **Ende** einen maschinenlesbaren Datenblock
   enthält (siehe unten). Der Tracker liest daraus Titel, Treatments, Farben und das
   RBD-Layout.
2. **Ein Asana-Task**, in dessen **Notizen die URL des Protokoll-Docs** steht
   (Format `https://docs.google.com/document/d/<DOC-ID>/edit`). Über diese URL findet der
   Tracker das Doc. (Alternativ ein Asana-Custom-Field „Protokoll-URL".)

Der menschenlesbare Teil des Protokolls (Übersicht, Treatments-Tabelle, RBD-Tabelle,
Methoden …) bleibt frei gestaltbar. **Entscheidend ist der Datenblock am Ende.**

---

## Der Datenblock (Pflichtformat)

Ganz am **Ende** des Docs, als eigener Abschnitt, exakt zwischen diesen zwei Markern:

```
<<<KFK-DATA
{
  "schema": "kfk-protocol-v1",
  "versuchsnr": "26_034",
  "titel": "Kurztitel des Versuchs",
  "themenbereich": "A) SYSTEM PELLET · A.0 Grundsubstanzen",
  "art": "Cannabis sativa (Hanf)",
  "hypothese": "Vollständiger Hypothesen-Satz.",
  "start_datum": "",
  "anzahl_trays": 2,
  "raster_cols": 4,
  "raster_rows": 6,
  "samen_pro_topf": 36,
  "treatments": [
    { "code": "T0", "color": "#22c55e", "label": "Kontrolle" },
    { "code": "T1", "color": "#eab308", "label": "Behandlung 1" }
  ],
  "rbd": [
    { "tray": 1, "col": "A", "row": 1, "t": "T0" },
    { "tray": 1, "col": "B", "row": 1, "t": "T1" }
  ]
}
KFK-DATA>>>
```

### Feldreferenz

| Feld | Typ | Regeln |
|---|---|---|
| `schema` | String | **Immer** `"kfk-protocol-v1"`. |
| `versuchsnr` | String | Format `JJ_NNN`, z. B. `"26_034"`. |
| `titel` | String | Kurztitel (ohne Versuchsnr/Themenbereich). |
| `themenbereich` | String | Muss mit dem Buchstaben beginnen (**A/B/C/D**) → steuert die Kachelfarbe: **A=rot, B=blau, C=gelb, D=grün**. |
| `art` | String | Baum-/Modellart, z. B. `"Cannabis sativa (Hanf)"`. |
| `hypothese` | String | Vollständiger Satz. |
| `start_datum` | String | ISO `"JJJJ-MM-TT"` **oder leer** `""` (wenn Start offen). |
| `anzahl_trays` | Zahl | Anzahl Trays (1, 2, …). |
| `raster_cols` | Zahl | Anzahl **Block-Spalten** pro Tray (A, B, C, D → 4). |
| `raster_rows` | Zahl | Anzahl **Wiederholungen** je Spalte (Zeilen 1..N). |
| `samen_pro_topf` | Zahl | Samen je Topf (z. B. 36 bei 6×6-Saatraster). **Nicht** mit dem Topf-Raster verwechseln. |
| `treatments` | Array | Je Eintrag `code`, `color`, `label`. |
| `rbd` | Array | Zuordnung Position → Treatment (siehe unten). |

### `treatments`
- `code`: **muss** dem Muster `T` + Zahl folgen: `"T0"`, `"T1"`, … `"T12"`.
- `color`: Hex-Farbe `"#rrggbb"`. **Skyseed-Standardpalette** (empfohlen, wo passend):
  T0/Kontrolle grün `#22c55e`, gelb `#eab308`, weiß `#ffffff`, blau `#3b82f6`, rot `#ef4444`,
  violett `#8b5cf6`. Bei mehr Stufen zusätzliche gut unterscheidbare Farben.
- `label`: Klartext (Dosis/Beschreibung).

### `rbd` — das Layout
- Ein Eintrag **pro belegtem Topf**: `{ "tray": <1..>, "col": "<A..>", "row": <1..>, "t": "<Tn>" }`.
- `col` = Block-Spaltenbuchstabe (`A`, `B`, … bis `raster_cols`), `row` = Wiederholung (`1..raster_rows`).
- `t` = Treatment-Code (muss in `treatments` vorkommen).
- **Topf-Nummerierung ist spaltenweise** (Tracker rechnet `topf = (Spalte−A)·raster_rows + row`):
  also A1=1, A2=2, …, A6=6, B1=7, … Der Tracker ignoriert etwaige `#N`-Labels in der
  sichtbaren Tabelle — **maßgeblich ist die (tray, col, row)→t-Zuordnung im JSON**.
- **Teilbelegung erlaubt:** Wenn weniger `rbd`-Einträge als `anzahl_trays × raster_cols ×
  raster_rows`, bleiben die übrigen Töpfe leer (Leerslots). Beispiel 26_033: 45 Einträge bei
  48 Slots → 3 Leerslots.
- **Konsistenz:** Die sichtbare RBD-Tabelle im Doc und das `rbd`-Array müssen dasselbe Layout
  zeigen (gleiches Treatment an gleicher Position).

---

## Formatregeln (wichtig, sonst schlägt der Import fehl)
1. Der Block steht **am Ende** des Docs; **genau ein** Block pro Doc.
2. Marker exakt: Startzeile `<<<KFK-DATA`, Endzeile `KFK-DATA>>>`.
3. **Gültiges JSON** dazwischen: **gerade** Anführungszeichen `"` (keine „typografischen"),
   keine Kommentare, kein Komma nach dem letzten Element.
4. `code`-Werte müssen zu `/^T\d+$/` passen (`T0`, `T1`, …).
5. `anzahl_trays × raster_cols × raster_rows` = Gesamtzahl der Topf-Slots; `rbd` darf gleich
   viele **oder weniger** (Teilbelegung) Einträge haben, nie mehr pro Slot.
6. Die **Asana-Task-Notiz muss die Doc-URL** enthalten (`docs.google.com/document/d/…`).

---

## Ablauf beim Anlegen eines neuen Versuchs (was danach passiert)
1. Forschungsplan erzeugt: Protokoll-Doc **mit** KFK-DATA-Block + Asana-Task (mit Doc-URL in
   den Notizen).
2. Im Tracker: **„📥 Aus Asana"** → Asana-Task-GID → Prefill aus dem Doc → **„Anlegen"**.
3. Der Tracker legt den Versuch an und befüllt das RBD-Raster **automatisch** aus dem Block.

→ Wenn das Format oben eingehalten ist, ist **kein** manueller Schritt mehr nötig.

---

## Vollständiges Beispiel (26_033, real, gekürztes rbd)

```
<<<KFK-DATA
{
  "schema": "kfk-protocol-v1",
  "versuchsnr": "26_033",
  "titel": "Schichtarchitektur Kohle × Zellulose",
  "themenbereich": "A) SYSTEM PELLET · A.0 Grundsubstanzen",
  "art": "Cannabis sativa (Hanf)",
  "hypothese": "Die Schichtarchitektur beeinflusst die KFK bei konstanter Gesamtdicke 1,0 mm; T2 verbessert die Keimung gegenüber T3.",
  "start_datum": "2026-07-01",
  "anzahl_trays": 2,
  "raster_cols": 4,
  "raster_rows": 6,
  "samen_pro_topf": 36,
  "treatments": [
    { "code": "T0", "color": "#94a3b8", "label": "Kontrolle – nacktes Saatgut (0 mm)" },
    { "code": "T1", "color": "#44403c", "label": "Nur Kohle (± 0,5 mm)" },
    { "code": "T2", "color": "#16a34a", "label": "Kohle innen + Zellulose außen (ca. 1,0 mm)" },
    { "code": "T3", "color": "#ea580c", "label": "Zellulose innen + Kohle außen (ca. 1,0 mm)" },
    { "code": "T4", "color": "#c8a804", "label": "Nur Zellulose (± 0,5 mm)" }
  ],
  "rbd": [
    { "tray": 1, "col": "A", "row": 1, "t": "T4" },
    { "tray": 1, "col": "B", "row": 1, "t": "T1" },
    { "tray": 1, "col": "C", "row": 1, "t": "T2" }
    /* … alle belegten Töpfe beider Trays … (hier gekürzt) */
  ]
}
KFK-DATA>>>
```
*(Hinweis: Der `/* … */`-Kommentar oben dient nur der Illustration — im echten Doc **keine
Kommentare** verwenden, alle Einträge ausschreiben.)*

---

## Kurz-Checkliste vor „fertig"
- [ ] KFK-DATA-Block am Doc-Ende, gerade Anführungszeichen, gültiges JSON
- [ ] `schema` = `kfk-protocol-v1`, `versuchsnr` im Format `JJ_NNN`
- [ ] `treatments[*].code` = `T0`, `T1`, … ; jede `t` im `rbd` kommt in `treatments` vor
- [ ] `anzahl_trays`, `raster_cols`, `raster_rows`, `samen_pro_topf` gesetzt
- [ ] Sichtbare RBD-Tabelle == `rbd`-Array
- [ ] Asana-Task-Notiz enthält die Doc-URL
