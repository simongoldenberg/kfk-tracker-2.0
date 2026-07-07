/**
 * KFK-Tracker · Protokoll-Patches
 * ================================
 *
 * Einmalige Korrekturen des __KFK-Index und Befuellung der Daten-Sheets
 * aus den DOCX-Protokollen der bestehenden Versuche.
 *
 * Diese Datei ist nach Erstbenutzung OBSOLET und kann spaeter geloescht werden.
 * Neue Versuche (ab Phase 2) laufen ueber den Skill skyseed-neuer-versuch.
 *
 * Reihenfolge der Ausfuehrung:
 *   1. fixIndexFromProtocols()     - korrigiert Treatments/Raster/Status im Index
 *   2. bulkSetupVersuche()         - legt Ordner + Sheets an (aus kfk-apps-script.gs)
 *   3. applyTreatmentsFromProtocols() - fuellt Treatment-Spalte + Farben aus Protokollen
 *
 * ODER in einem Rutsch:
 *   runFullProtocolSetup()
 */

// ================================================================
// PROTOKOLL-DATEN aus DOCX (extrahiert durch Claude am 2026-04-24)
// ================================================================

const PROTOCOL_DATA = {

  // --- 26_002 · Biochar × KFK KüTa+SKi ---
  // SKi-Teil wurde abgebrochen (Samen vertrocknet). Tracker pflegt nur KüTa-Teil.
  // Raster laut PDF S.5: 5 Reihen × 3 Spalten = 15 Toepfe fuer KueTa
  '26_002': {
    status: 'In Bearbeitung',
    titel: 'A.0) Biochar × KFK – NUR KüTa (SKi-Teil abgebrochen)',
    baumart_kurz: 'KüTa',
    baumart_lat: 'Abies grandis',
    samen_pro_topf: 36,
    raster_cols: 3,
    raster_rows: 5,
    treatments: [
      { code: 'T1', label: 'Kontrolle', color: '#22c55e' },   // Gruen (laut PDF S.3 "Blaugruen")
      { code: 'T2', label: 'Kohle dünn', color: '#eab308' },  // Gelb/Orange
      { code: 'T3', label: 'Kohle dick', color: '#ef4444' }   // Weinrot
    ],
    // Topf-Zuordnung fuer KueTa (5 Reihen × 3 Spalten, laut PDF S.5 5x3 Lageplan)
    // Topf-Nummerierung Block-major: Topf 1-5 = Block A (Spalte A), Topf 6-10 = Block B, Topf 11-15 = Block C
    rbd: [
      // Block A (Spalte A, Reihe 1-5)
      { topf: 1,  block: 'A', wdh: 1, code: 'T1' },
      { topf: 2,  block: 'A', wdh: 2, code: 'T2' },
      { topf: 3,  block: 'A', wdh: 3, code: 'T3' },
      { topf: 4,  block: 'A', wdh: 4, code: 'T1' },
      { topf: 5,  block: 'A', wdh: 5, code: 'T2' },
      // Block B (Spalte B, Reihe 1-5)
      { topf: 6,  block: 'B', wdh: 1, code: 'T2' },
      { topf: 7,  block: 'B', wdh: 2, code: 'T3' },
      { topf: 8,  block: 'B', wdh: 3, code: 'T1' },
      { topf: 9,  block: 'B', wdh: 4, code: 'T2' },
      { topf: 10, block: 'B', wdh: 5, code: 'T3' },
      // Block C (Spalte C, Reihe 1-5)
      { topf: 11, block: 'C', wdh: 1, code: 'T3' },
      { topf: 12, block: 'C', wdh: 2, code: 'T1' },
      { topf: 13, block: 'C', wdh: 3, code: 'T2' },
      { topf: 14, block: 'C', wdh: 4, code: 'T3' },
      { topf: 15, block: 'C', wdh: 5, code: 'T1' }
    ]
  },

  // --- 26_006 · SKi VakuumSeeder ---
  // Protokoll vom 01.04.2026 - laut PDF S.2
  // 4 Treatments (T0-T3), Raster 4 Spalten × 6 Wdh = 24 Toepfe
  // Spezielle Farben: T1=blau, T2=rot, T3=gelb (Custom-Schema vom Protokoll!)
  '26_006': {
    status: 'In Bearbeitung',
    titel: 'A.0) Wiederholungsversuch SKi VakuumSeeder',
    baumart_kurz: 'SKi',
    baumart_lat: 'Pinus nigra',
    samen_pro_topf: 36,
    raster_cols: 4,
    raster_rows: 6,
    treatments: [
      { code: 'T0', label: 'Kontrolle', color: '#22c55e' },        // Gruen
      { code: 'T1', label: 'Pelletiert dünn', color: '#3b82f6' },  // Blau (Custom!)
      { code: 'T2', label: 'Pelletiert mittel', color: '#ef4444' },// Rot (Custom!)
      { code: 'T3', label: 'Pelletiert dick', color: '#eab308' }   // Gelb (Custom!)
    ],
    rbd: [
      // Block A (Spalte A, Wdh 1-6)
      { topf: 1,  block: 'A', wdh: 1, code: 'T2' },
      { topf: 2,  block: 'A', wdh: 2, code: 'T1' },
      { topf: 3,  block: 'A', wdh: 3, code: 'T3' },
      { topf: 4,  block: 'A', wdh: 4, code: 'T0' },
      { topf: 5,  block: 'A', wdh: 5, code: 'T2' },
      { topf: 6,  block: 'A', wdh: 6, code: 'T1' },
      // Block B (Spalte B, Wdh 1-6)
      { topf: 7,  block: 'B', wdh: 1, code: 'T0' },
      { topf: 8,  block: 'B', wdh: 2, code: 'T3' },
      { topf: 9,  block: 'B', wdh: 3, code: 'T1' },
      { topf: 10, block: 'B', wdh: 4, code: 'T2' },
      { topf: 11, block: 'B', wdh: 5, code: 'T1' },
      { topf: 12, block: 'B', wdh: 6, code: 'T0' },
      // Block C (Spalte C, Wdh 1-6)
      { topf: 13, block: 'C', wdh: 1, code: 'T3' },
      { topf: 14, block: 'C', wdh: 2, code: 'T0' },
      { topf: 15, block: 'C', wdh: 3, code: 'T2' },
      { topf: 16, block: 'C', wdh: 4, code: 'T1' },
      { topf: 17, block: 'C', wdh: 5, code: 'T3' },
      { topf: 18, block: 'C', wdh: 6, code: 'T2' },
      // Block D (Spalte D, Wdh 1-6)
      { topf: 19, block: 'D', wdh: 1, code: 'T1' },
      { topf: 20, block: 'D', wdh: 2, code: 'T2' },
      { topf: 21, block: 'D', wdh: 3, code: 'T0' },
      { topf: 22, block: 'D', wdh: 4, code: 'T3' },
      { topf: 23, block: 'D', wdh: 5, code: 'T0' },
      { topf: 24, block: 'D', wdh: 6, code: 'T3' }
    ]
  },

  // --- 26_025 · Biochar × SKi Wdh (Posten 248) ---
  // Protokoll April 2026 - 2 Trays à 24 Toepfe = 48 gesamt
  // 4 Treatments: T0 Kontrolle, T1 Cellulose-Pellet, T2 Kohle duenn, T3 Kohle dick
  // Farbschema: T0=gruen, T1=blau, T2=gelb, T3=rot (laut PDF S.2)
  // Raster-Modellierung: 4 Spalten × 12 Wdh (Wdh 1-6 = Tray 1, Wdh 7-12 = Tray 2)
  '26_025': {
    status: 'In Bearbeitung',
    titel: 'A.0) Biochar × KFK – SKi Wiederholung (Posten 248)',
    baumart_kurz: 'SKi',
    baumart_lat: 'Pinus nigra',
    samen_pro_topf: 36,
    raster_cols: 4,
    raster_rows: 12,
    treatments: [
      { code: 'T0', label: 'Kontrolle', color: '#22c55e' },        // Gruen
      { code: 'T1', label: 'Cellulose-Pellet', color: '#3b82f6' }, // Blau
      { code: 'T2', label: 'Kohle dünn (<1 mm)', color: '#eab308' },// Gelb
      { code: 'T3', label: 'Kohle dick (~2 mm)', color: '#ef4444' }// Rot
    ],
    rbd: [
      // ============ TRAY 1 (Toepfe 1-24) ============
      // Block A (Toepfe 1-6)
      { topf: 1,  block: 'A', wdh: 1, code: 'T1' },
      { topf: 2,  block: 'A', wdh: 2, code: 'T3' },
      { topf: 3,  block: 'A', wdh: 3, code: 'T0' },
      { topf: 4,  block: 'A', wdh: 4, code: 'T2' },
      { topf: 5,  block: 'A', wdh: 5, code: 'T1' },
      { topf: 6,  block: 'A', wdh: 6, code: 'T0' },
      // Block B (Toepfe 7-12)
      { topf: 7,  block: 'B', wdh: 1, code: 'T0' },
      { topf: 8,  block: 'B', wdh: 2, code: 'T2' },
      { topf: 9,  block: 'B', wdh: 3, code: 'T3' },
      { topf: 10, block: 'B', wdh: 4, code: 'T1' },
      { topf: 11, block: 'B', wdh: 5, code: 'T0' },
      { topf: 12, block: 'B', wdh: 6, code: 'T2' },
      // Block C (Toepfe 13-18)
      { topf: 13, block: 'C', wdh: 1, code: 'T3' },
      { topf: 14, block: 'C', wdh: 2, code: 'T0' },
      { topf: 15, block: 'C', wdh: 3, code: 'T2' },
      { topf: 16, block: 'C', wdh: 4, code: 'T0' },
      { topf: 17, block: 'C', wdh: 5, code: 'T3' },
      { topf: 18, block: 'C', wdh: 6, code: 'T1' },
      // Block D (Toepfe 19-24)
      { topf: 19, block: 'D', wdh: 1, code: 'T2' },
      { topf: 20, block: 'D', wdh: 2, code: 'T1' },
      { topf: 21, block: 'D', wdh: 3, code: 'T1' },
      { topf: 22, block: 'D', wdh: 4, code: 'T3' },
      { topf: 23, block: 'D', wdh: 5, code: 'T2' },
      { topf: 24, block: 'D', wdh: 6, code: 'T3' },
      // ============ TRAY 2 (Toepfe 25-48) ============
      // Block A (Toepfe 25-30) - in unserem Schema = Wdh 7-12
      { topf: 25, block: 'A', wdh: 7,  code: 'T2' },
      { topf: 26, block: 'A', wdh: 8,  code: 'T0' },
      { topf: 27, block: 'A', wdh: 9,  code: 'T3' },
      { topf: 28, block: 'A', wdh: 10, code: 'T1' },
      { topf: 29, block: 'A', wdh: 11, code: 'T0' },
      { topf: 30, block: 'A', wdh: 12, code: 'T3' },
      // Block B (Toepfe 31-36)
      { topf: 31, block: 'B', wdh: 7,  code: 'T3' },
      { topf: 32, block: 'B', wdh: 8,  code: 'T1' },
      { topf: 33, block: 'B', wdh: 9,  code: 'T0' },
      { topf: 34, block: 'B', wdh: 10, code: 'T2' },
      { topf: 35, block: 'B', wdh: 11, code: 'T3' },
      { topf: 36, block: 'B', wdh: 12, code: 'T1' },
      // Block C (Toepfe 37-42)
      { topf: 37, block: 'C', wdh: 7,  code: 'T1' },
      { topf: 38, block: 'C', wdh: 8,  code: 'T3' },
      { topf: 39, block: 'C', wdh: 9,  code: 'T2' },
      { topf: 40, block: 'C', wdh: 10, code: 'T0' },
      { topf: 41, block: 'C', wdh: 11, code: 'T1' },
      { topf: 42, block: 'C', wdh: 12, code: 'T2' },
      // Block D (Toepfe 43-48)
      { topf: 43, block: 'D', wdh: 7,  code: 'T0' },
      { topf: 44, block: 'D', wdh: 8,  code: 'T2' },
      { topf: 45, block: 'D', wdh: 9,  code: 'T1' },
      { topf: 46, block: 'D', wdh: 10, code: 'T3' },
      { topf: 47, block: 'D', wdh: 11, code: 'T2' },
      { topf: 48, block: 'D', wdh: 12, code: 'T0' }
    ]
  }
};

// ================================================================
// PATCH 1: Index korrigieren
// ================================================================

/**
 * Korrigiert den __KFK-Index basierend auf den PROTOCOL_DATA:
 *   - Treatments_JSON mit korrekten Codes/Labels/Farben
 *   - raster_cols, raster_rows
 *   - samen_pro_topf
 *   - Status
 *   - Titel (Korrektur)
 * Setzt 26_001 auf Status "Archiviert" (Feldversuch, separater Tracker).
 */
function fixIndexFromProtocols() {
  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const c = {};
  headers.forEach((h, i) => { c[String(h).trim()] = i; });

  const patches = [];
  for (let i = 1; i < data.length; i++) {
    const versuchsnr = String(data[i][c[INDEX_COLS.versuchsnr]] || '').trim();
    if (!versuchsnr) continue;

    // Sonderfall 26_001: Archivieren (Feldversuch, separater Tracker)
    if (versuchsnr === '26_001') {
      indexSheet.getRange(i + 1, c[INDEX_COLS.status] + 1).setValue('Archiviert');
      patches.push({ versuchsnr, action: 'auf Status "Archiviert" gesetzt (separater Field-Tracker)' });
      continue;
    }

    const p = PROTOCOL_DATA[versuchsnr];
    if (!p) continue;

    const row = i + 1;
    if (p.titel)           indexSheet.getRange(row, c[INDEX_COLS.titel] + 1).setValue(p.titel);
    if (p.baumart_kurz)    indexSheet.getRange(row, c[INDEX_COLS.baumart_kurz] + 1).setValue(p.baumart_kurz);
    if (p.baumart_lat)     indexSheet.getRange(row, c[INDEX_COLS.baumart_lat] + 1).setValue(p.baumart_lat);
    if (p.status)          indexSheet.getRange(row, c[INDEX_COLS.status] + 1).setValue(p.status);
    if (p.samen_pro_topf)  indexSheet.getRange(row, c[INDEX_COLS.samen_pro_topf] + 1).setValue(p.samen_pro_topf);
    if (p.raster_cols)     indexSheet.getRange(row, c[INDEX_COLS.raster_cols] + 1).setValue(p.raster_cols);
    if (p.raster_rows)     indexSheet.getRange(row, c[INDEX_COLS.raster_rows] + 1).setValue(p.raster_rows);
    if (p.treatments && p.treatments.length) {
      indexSheet.getRange(row, c[INDEX_COLS.treatments_json] + 1).setValue(JSON.stringify(p.treatments));
    }
    patches.push({ versuchsnr, action: 'Index aktualisiert' });
  }

  SpreadsheetApp.flush();
  Logger.log('===== fixIndexFromProtocols =====');
  patches.forEach(p => Logger.log(p.versuchsnr + ': ' + p.action));
  return patches;
}

// ================================================================
// PATCH 2: Treatments aus Protokollen in Daten-Sheets eintragen
// ================================================================

/**
 * Fuellt die Treatment-Spalte (D) und Farbe (E) in den Daten-Sheets der
 * bereits via bulkSetupVersuche() angelegten Versuche aus den Protokoll-Daten.
 *
 * Voraussetzung: bulkSetupVersuche() wurde bereits ausgefuehrt, Sheet_File_ID
 * ist im Index gesetzt.
 */
function applyTreatmentsFromProtocols() {
  const all = readIndex();
  const results = [];

  Object.keys(PROTOCOL_DATA).forEach(vnr => {
    const v = all.find(x => String(x.versuchsnr) === vnr);
    if (!v) {
      results.push({ versuchsnr: vnr, error: 'nicht im Index gefunden' });
      return;
    }
    if (!v.sheet_file_id) {
      results.push({ versuchsnr: vnr, error: 'kein Sheet_File_ID - erst bulkSetupVersuche() ausfuehren' });
      return;
    }

    const p = PROTOCOL_DATA[vnr];
    const tMap = {};
    p.treatments.forEach(t => { tMap[t.code] = t; });

    const ss = SpreadsheetApp.openById(v.sheet_file_id);
    const daten = ss.getSheetByName('Daten');
    if (!daten) {
      results.push({ versuchsnr: vnr, error: 'Daten-Tab fehlt' });
      return;
    }

    // Pruefen ob Anzahl Topf-Zeilen im Sheet mit Anzahl im Protokoll uebereinstimmt
    const lastRow = daten.getLastRow();
    const expectedRows = p.rbd.length;
    if (lastRow - 1 !== expectedRows) {
      // Sheet hat falsche Groesse (weil Index anfangs falsch war). Wir muessen neu bauen.
      // Strategie: Sheet leeren (ab Zeile 2) und neu auffuellen.
      if (lastRow > 1) {
        daten.getRange(2, 1, lastRow - 1, daten.getLastColumn()).clearContent().setBackground(null);
      }
      // Neue Zeilen erstellen
      const nCols = daten.getLastColumn();
      const newRows = [];
      p.rbd.forEach(rbdEntry => {
        const t = tMap[rbdEntry.code];
        const row = [
          rbdEntry.topf,
          rbdEntry.block,
          rbdEntry.wdh,
          t ? (t.code + ' ' + (t.label || '')) : '',
          t ? t.color : ''
        ];
        while (row.length < nCols) row.push('');
        newRows.push(row);
      });
      daten.getRange(2, 1, newRows.length, nCols).setValues(newRows);
    } else {
      // Groesse passt, nur Treatment + Farbe schreiben
      p.rbd.forEach((rbdEntry) => {
        const t = tMap[rbdEntry.code];
        if (!t) return;
        const rowIdx = rbdEntry.topf + 1; // Header in Zeile 1, Topf 1 in Zeile 2
        daten.getRange(rowIdx, 4).setValue(t.code + ' ' + (t.label || ''));
        daten.getRange(rowIdx, 5).setValue(t.color);
      });
    }

    // Farben als Hintergrund setzen + Schriftfarbe anpassen
    for (let i = 0; i < p.rbd.length; i++) {
      const t = tMap[p.rbd[i].code];
      if (!t) continue;
      daten.getRange(i + 2, 5)
        .setBackground(t.color)
        .setFontColor(textColorForHex(t.color));
    }

    SpreadsheetApp.flush();
    results.push({ versuchsnr: vnr, status: 'applied', toepfe: p.rbd.length });
  });

  Logger.log('===== applyTreatmentsFromProtocols =====');
  results.forEach(r => Logger.log(JSON.stringify(r)));
  return results;
}

// ================================================================
// MASTER-Funktion: alles in einem Rutsch
// ================================================================

/**
 * Fuehrt Index-Fix + Bulk-Setup + Treatment-Patches in einem Rutsch aus.
 * Empfohlen fuer initialen Setup nach DOCX-Upload.
 */
function runFullProtocolSetup() {
  Logger.log('*** Schritt 1: Index korrigieren ***');
  fixIndexFromProtocols();

  Logger.log('');
  Logger.log('*** Schritt 2: Ordner & Sheets anlegen ***');
  bulkSetupVersuche();

  Logger.log('');
  Logger.log('*** Schritt 3: Treatments aus Protokollen eintragen ***');
  applyTreatmentsFromProtocols();

  Logger.log('');
  Logger.log('*** Fertig. Bitte Ausfuehrungsprotokoll pruefen. ***');
}
