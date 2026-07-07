/**
 * KFK-Tracker · Patch für 26_024 (Hanf, Matrix-Vergleich) — v3
 * ============================================================
 *
 * v3 Repariert das Sheet vollständig:
 *  1. Fügt Tray-Spalte nach "Wdh" ein (falls fehlt)
 *  2. Setzt für die bestehenden 24 Zeilen Tray = 1
 *  3. Hängt 24 neue Zeilen für Tray 2 an (Topf 1..24, Block A-D, Wdh 1-6)
 *  4. Setzt Treatment + Farbe für alle 48 Töpfe gemäß RBD v2 aus dem Asana-Protokoll
 *  5. Aktualisiert Treatments_JSON im Index
 *
 * BLEIBT UNANGETASTET:
 *  - Bestehende AZ-Werte (z.B. Topf 6 in Tray 1 mit "22")
 *  - Bestehende Foto-Spalten (Foto_AZ1_Tray1_BlockA bleibt erhalten)
 *  - Tray 1 Topf 1..24 Reihenfolge im Sheet
 *
 * AUSFÜHRUNG (drei Funktionen, in dieser Reihenfolge):
 *  1. diagnose_26_024()              - zeigt Sheet-Struktur, ändert nichts
 *  2. fix_26_024_addTray2()          - fügt Tray-Spalte + Tray-2-Zeilen hinzu
 *  3. patch_26_024_treatments()      - setzt Treatments + Farben für alle 48 Töpfe
 *
 * ALLES AUF EINMAL:
 *  - run_26_024_full()               - macht alles drei nacheinander
 */

const PATCH_26_024_V3 = {
  versuchsnr: '26_024',
  treatments: {
    'T0': { label: 'Kontrolle',         color: '#22c55e' }, // GRÜN
    'A1': { label: '3er-Mix dünn',      color: '#ffffff' }, // WEISS
    'A2': { label: '3er-Mix dick',      color: '#eab308' }, // GELB
    'B1': { label: 'Akt. Matrix dünn',  color: '#3b82f6' }, // BLAU
    'B2': { label: 'Akt. Matrix dick',  color: '#ef4444' }  // ROT
  },
  // RBD v2: Spalten = Block A..D, Reihen = Wdh 1..6
  // Topf-Block-major: 1..6 = Block A (Wdh 1..6), 7..12 = Block B, 13..18 = Block C, 19..24 = Block D
  rbdTray1: {
     1: 'A1',  7: 'B2', 13: 'T0', 19: 'A2',
     2: 'B1',  8: 'A2', 14: 'A1', 20: 'T0',
     3: 'A2',  9: 'T0', 15: 'B2', 21: 'B1',
     4: 'B2', 10: 'B1', 16: 'A2', 22: 'A1',
     5: 'T0', 11: 'A1', 17: 'B1', 23: 'B2',
     6: 'A1', 12: 'A2', 18: 'B1', 24: 'B2'
  },
  rbdTray2: {
     1: 'T0',  7: 'A2', 13: 'B1', 19: 'A1',
     2: 'A2',  8: 'B2', 14: 'T0', 20: 'B1',
     3: 'B1',  9: 'A1', 15: 'A2', 21: 'B2',
     4: 'A1', 10: 'T0', 16: 'B2', 22: 'A2',
     5: 'B2', 11: 'B1', 17: 'A1', 23: 'T0',
     6: 'B2', 12: 'A1', 18: 'B1', 24: 'A2'
  }
};

/* ============ DIAGNOSE ============ */
function diagnose_26_024() {
  const ctx = openVersuchSheet_26_024_();
  if (ctx.error) { Logger.log('FEHLER: ' + ctx.error); return ctx; }

  const { sheet, headers, colIdx, data } = ctx;
  Logger.log('===== DIAGNOSE 26_024 =====');
  Logger.log('Sheet-File-ID: ' + ctx.fileId);
  Logger.log('Anzahl Zeilen (ohne Header): ' + data.length);
  Logger.log('Anzahl Spalten: ' + headers.length);
  Logger.log('Pflicht-Spalten: Topf=' + colIdx['Topf'] + ', Wdh=' + colIdx['Wdh']
    + ', Treatment=' + colIdx['Treatment'] + ', Farbe=' + colIdx['Farbe']);
  Logger.log('Tray-Spalte: ' + (colIdx['Tray'] ? 'ja (Spalte ' + colIdx['Tray'] + ')' : 'NEIN — muss eingefügt werden'));

  const topfNumbers = data.map(r => parseInt(r[colIdx['Topf'] - 1], 10)).filter(n => !isNaN(n));
  const trayValues = colIdx['Tray']
    ? data.map(r => parseInt(r[colIdx['Tray'] - 1], 10)).filter(n => !isNaN(n))
    : [];

  Logger.log('Topf-Range: ' + Math.min(...topfNumbers) + '..' + Math.max(...topfNumbers)
    + ' (eindeutige: ' + new Set(topfNumbers).size + ', total: ' + topfNumbers.length + ')');
  if (trayValues.length) {
    const trayCount = {};
    trayValues.forEach(t => { trayCount[t] = (trayCount[t] || 0) + 1; });
    Logger.log('Tray-Verteilung: ' + JSON.stringify(trayCount));
  }

  // Status-Bewertung
  const hasTray = !!colIdx['Tray'];
  const has48Rows = data.length === 48;
  const has24Rows = data.length === 24;

  let status;
  if (hasTray && has48Rows) {
    status = 'OK_FOR_PATCH — Sheet hat 48 Zeilen + Tray-Spalte. Direkt patch_26_024_treatments() ausführen.';
  } else if (!hasTray && has24Rows) {
    status = 'NEEDS_FIX — Sheet hat 24 Zeilen, keine Tray-Spalte. fix_26_024_addTray2() ausführen, dann patch_26_024_treatments().';
  } else if (hasTray && has24Rows) {
    status = 'NEEDS_FIX_PARTIAL — Tray-Spalte da aber nur 24 Zeilen. fix_26_024_addTray2() ausführen.';
  } else {
    status = 'UNCLEAR — unerwartete Struktur. Manuelle Prüfung nötig.';
  }
  Logger.log('Status: ' + status);

  return { ok: true, status, hasTray, rowCount: data.length, fileId: ctx.fileId };
}

/* ============ TRAY-2 ANHÄNGEN ============ */
function fix_26_024_addTray2() {
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === '26_024');
  if (!v) { Logger.log('FEHLER: 26_024 nicht im Index'); return { error: 'nicht im Index' }; }
  if (!v.sheet_file_id) { Logger.log('FEHLER: Sheet_File_ID fehlt'); return { error: 'Sheet_File_ID fehlt' }; }

  const ss = SpreadsheetApp.openById(v.sheet_file_id);
  const sheet = ss.getSheetByName('Daten');
  if (!sheet) { Logger.log('FEHLER: Daten-Tab fehlt'); return { error: 'Daten-Tab fehlt' }; }

  // Header lesen
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let cIdx = {};
  headers.forEach((h, i) => { cIdx[String(h).trim()] = i + 1; });

  // 1. Tray-Spalte einfügen falls nicht vorhanden (direkt nach "Wdh")
  if (!cIdx['Tray']) {
    const wdhCol = cIdx['Wdh'];
    if (!wdhCol) { Logger.log('FEHLER: Wdh-Spalte fehlt'); return { error: 'Wdh-Spalte fehlt' }; }
    sheet.insertColumnAfter(wdhCol);
    sheet.getRange(1, wdhCol + 1)
      .setValue('Tray')
      .setFontWeight('bold')
      .setBackground('#2d4a23')
      .setFontColor('#f4f0e6');
    Logger.log('Tray-Spalte eingefügt nach Spalte ' + wdhCol + ' (Wdh)');
    SpreadsheetApp.flush();

    // Header neu lesen (Spaltenindizes haben sich verschoben)
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    cIdx = {};
    headers.forEach((h, i) => { cIdx[String(h).trim()] = i + 1; });
  }

  const trayCol = cIdx['Tray'];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // 2. Bestehende Zeilen: Tray = 1 setzen (idempotent)
  if (lastRow >= 2) {
    const existingTrays = sheet.getRange(2, trayCol, lastRow - 1, 1).getValues();
    const updated = existingTrays.map(r => [r[0] || 1]);
    sheet.getRange(2, trayCol, lastRow - 1, 1).setValues(updated);
    Logger.log('Tray=1 für ' + (lastRow - 1) + ' bestehende Zeilen gesetzt');
  }

  // 3. Prüfen ob Tray 2 schon existiert
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const hasTray2 = data.some(r => Number(r[trayCol - 1]) === 2);

  if (hasTray2) {
    Logger.log('Tray 2 existiert bereits — keine neuen Zeilen angehängt');
    return { ok: true, action: 'tray2_exists', rowsAfter: lastRow - 1 };
  }

  // 4. 24 neue Zeilen für Tray 2 anhängen
  // Topf-Block-major: Topf 1..6 = Block A, 7..12 = B, 13..18 = C, 19..24 = D
  const topfCol = cIdx['Topf'];
  const blockCol = cIdx['Block'];
  const wdhCol2 = cIdx['Wdh'];

  const newRows = [];
  for (let topf = 1; topf <= 24; topf++) {
    const blockIdx = Math.floor((topf - 1) / 6);   // 0..3
    const block = ['A', 'B', 'C', 'D'][blockIdx];
    const wdh = ((topf - 1) % 6) + 1;              // 1..6

    const row = new Array(lastCol).fill('');
    row[topfCol - 1] = topf;
    row[blockCol - 1] = block;
    row[wdhCol2 - 1] = wdh;
    row[trayCol - 1] = 2;
    newRows.push(row);
  }

  sheet.getRange(lastRow + 1, 1, 24, lastCol).setValues(newRows);
  Logger.log('24 neue Zeilen für Tray 2 angehängt (Zeilen ' + (lastRow + 1) + '..' + (lastRow + 24) + ')');

  SpreadsheetApp.flush();
  return { ok: true, action: 'tray2_added', rowsAfter: lastRow - 1 + 24 };
}

/* ============ TREATMENTS + FARBEN SETZEN ============ */
function patch_26_024_treatments() {
  const ctx = openVersuchSheet_26_024_();
  if (ctx.error) { Logger.log('FEHLER: ' + ctx.error); return ctx; }
  const { sheet, colIdx, data } = ctx;

  if (!colIdx['Tray']) {
    Logger.log('FEHLER: Tray-Spalte fehlt — erst fix_26_024_addTray2() ausführen!');
    return { error: 'Tray-Spalte fehlt — erst fix_26_024_addTray2()' };
  }
  if (data.length !== 48) {
    Logger.log('WARN: Sheet hat ' + data.length + ' Zeilen statt 48 — erst fix_26_024_addTray2() ausführen!');
  }

  const treatmentCol = colIdx['Treatment'];
  const farbeCol = colIdx['Farbe'];

  let applied = 0, skipped = 0;
  for (let i = 0; i < data.length; i++) {
    const topfNr = parseInt(data[i][colIdx['Topf'] - 1], 10);
    const trayNr = parseInt(data[i][colIdx['Tray'] - 1], 10) || 1;
    if (isNaN(topfNr)) { skipped++; continue; }

    const rbd = (trayNr === 2) ? PATCH_26_024_V3.rbdTray2 : PATCH_26_024_V3.rbdTray1;
    const code = rbd[topfNr];
    if (!code) { skipped++; continue; }

    const t = PATCH_26_024_V3.treatments[code];
    if (!t) { skipped++; continue; }

    const rowAbs = i + 2;
    sheet.getRange(rowAbs, treatmentCol).setValue(code + ' ' + t.label);
    sheet.getRange(rowAbs, farbeCol)
      .setValue(t.color)
      .setBackground(t.color)
      .setFontColor(textColorForHex_(t.color));
    applied++;
  }

  // Treatments_JSON im Index aktualisieren
  try {
    const arr = Object.keys(PATCH_26_024_V3.treatments).map(code => ({
      code: code,
      label: PATCH_26_024_V3.treatments[code].label,
      color: PATCH_26_024_V3.treatments[code].color
    }));
    updateIndexTreatmentsJSON_(JSON.stringify(arr));
  } catch (e) {
    Logger.log('WARN: Treatments_JSON nicht aktualisiert: ' + e);
  }

  SpreadsheetApp.flush();
  Logger.log('FERTIG — applied: ' + applied + ' / skipped: ' + skipped);
  return { ok: true, applied, skipped };
}

/* ============ ALL-IN-ONE ============ */
function run_26_024_full() {
  Logger.log('Schritt 1/3: Diagnose');
  diagnose_26_024();
  Logger.log('');
  Logger.log('Schritt 2/3: Tray-Spalte + Tray 2 anhängen');
  const r2 = fix_26_024_addTray2();
  Logger.log(JSON.stringify(r2));
  Logger.log('');
  Logger.log('Schritt 3/3: Treatments + Farben setzen');
  const r3 = patch_26_024_treatments();
  Logger.log(JSON.stringify(r3));
  Logger.log('');
  Logger.log('===== ALLE SCHRITTE ABGESCHLOSSEN =====');
  Logger.log('Tablet refreshen (App-Daten löschen / Strg+Shift+R), dann sind beide Trays farbig.');
}

/* ============ Helpers ============ */
function openVersuchSheet_26_024_() {
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === '26_024');
  if (!v) return { error: '26_024 nicht im Index' };
  if (!v.sheet_file_id) return { error: 'Sheet_File_ID fehlt' };

  const ss = SpreadsheetApp.openById(v.sheet_file_id);
  const sheet = ss.getSheetByName('Daten');
  if (!sheet) return { error: 'Daten-Tab fehlt' };

  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { error: 'Daten-Sheet leer' };

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i + 1; });
  if (!colIdx['Topf'] || !colIdx['Treatment'] || !colIdx['Farbe']) {
    return { error: 'Pflicht-Spalten Topf/Treatment/Farbe fehlen: ' + JSON.stringify(headers) };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return { sheet, headers, colIdx, data, fileId: v.sheet_file_id };
}

function updateIndexTreatmentsJSON_(jsonStr) {
  const ss = SpreadsheetApp.openById(KFK_INDEX_ID);
  const sheet = ss.getSheetByName('Index');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const vnrCol = headers.indexOf('Versuchsnr');
  const tjCol = headers.indexOf('Treatments_JSON');
  if (vnrCol < 0 || tjCol < 0) return;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][vnrCol]) === '26_024') {
      sheet.getRange(i + 1, tjCol + 1).setValue(jsonStr);
      return;
    }
  }
}

function textColorForHex_(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '#000000';
  const r = parseInt(h.substr(0, 2), 16);
  const g = parseInt(h.substr(2, 2), 16);
  const b = parseInt(h.substr(4, 2), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 160 ? '#000000' : '#ffffff';
}