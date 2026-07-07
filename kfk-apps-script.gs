/**
 * Skyseed KFK-Tracker Backend
 * ===========================
 *
 * Dieses Apps Script ist an das zentrale Index-Sheet `__KFK-Index` gebunden
 * und steuert alle Operationen:
 *   - Read/Write auf Index + Daten-Sheets
 *   - Foto-Upload zu Google Drive (pro Versuch/AZ/Block)
 *   - Asana-Kommentar-Posting
 *   - AZ-Subtask-Löschung in Asana bei Reduktion der geplanten AZ-Anzahl
 *   - Wöchentliches Backup (OHNE Pruning - Backups bleiben unbegrenzt)
 *
 * Installation (einmalig):
 * 1. __KFK-Index-Sheet im Team-Drive anlegen (aus Template)
 * 2. Erweiterungen -> Apps Script -> Code.gs loeschen, diesen Code einfuegen
 * 3. ASANA_PAT in Skripteigenschaften setzen (setupAsanaPat oder UI)
 * 4. Bereitstellen -> Neue Bereitstellung -> Web-App
 *    - Ausfuehren als: Ich
 *    - Zugriff: Jeder
 *    - URL kopieren und in kfk-tracker.html als API_URL einsetzen
 * 5. Trigger (Uhr-Icon) -> weeklyBackup -> Sonntag 03:00
 *
 * WICHTIG: Das __KFK-Index-Sheet muss im selben Drive-Ordner liegen wie
 * alle Versuchs-Ordner, damit das Script sie finden kann.
 */

// ========== KONFIGURATION ==========
// Asana Personal Access Token (https://app.asana.com/0/my-apps)
// SICHERHEIT: Das Token steht NICHT mehr im Code, sondern in den
// Skripteigenschaften (Projekteinstellungen -> Skripteigenschaften).
// Schluessel: 'ASANA_PAT'. Zum Setzen/Rotieren einmalig setupAsanaPat()
// ausfuehren ODER den Wert direkt im UI eintragen. Ist keine Eigenschaft
// gesetzt, bleibt ASANA_PAT leer ('') und alle Asana-Funktionen brechen
// sauber ab (wie bisher beim Platzhalter).
const ASANA_PAT = PropertiesService.getScriptProperties().getProperty('ASANA_PAT') || '';

/**
 * Einmalige Hilfsfunktion zum Setzen/Rotieren des Asana-Tokens.
 * ANLEITUNG:
 *   1. Token unten zwischen die Anfuehrungszeichen einsetzen
 *   2. Im Apps-Script-Editor Funktion 'setupAsanaPat' auswaehlen -> Ausfuehren
 *   3. Token-Zeile danach WIEDER LEEREN und speichern (Token nie im Code lassen)
 * Alternativ: Projekteinstellungen -> Skripteigenschaften -> 'ASANA_PAT' manuell.
 */
function setupAsanaPat() {
  const NEUES_TOKEN = ''; // <-- Token hier einsetzen, ausfuehren, danach wieder leeren
  if (!NEUES_TOKEN) {
    Logger.log('Kein Token eingetragen. Bitte NEUES_TOKEN in setupAsanaPat setzen.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('ASANA_PAT', NEUES_TOKEN);
  Logger.log('ASANA_PAT gespeichert. Bitte die Token-Zeile in setupAsanaPat jetzt wieder leeren.');
}

// Drive-Ordner-ID KFK-Daten (enthaelt __KFK-Index + Versuchs-Unterordner)
const KFK_DATA_FOLDER_ID = '15X-Ri1feR3I1qGC6FgPpPLc0jgHskcoM';

// Backup-Unterordner (wird automatisch angelegt falls nicht existent)
const BACKUP_SUBFOLDER_NAME = '__Backups';

// Zeitzone fuer Datumsformatierung
const TIMEZONE = 'Europe/Berlin';

// Skyseed-Asana-Projekt-GID (Forschungsplan)
const ASANA_PROJECT_GID = '1213333791682433';

// Index-Sheet-Spalten (Namen in Zeile 1)
const INDEX_COLS = {
  versuchsnr: 'Versuchsnr',
  titel: 'Titel',
  id_nummer: 'ID_Nummer',
  baumart_kurz: 'Baumart_kurz',
  baumart_lat: 'Baumart_lat',
  themenbereich: 'Themenbereich',
  themenfarbe: 'Themenfarbe',
  hypothese: 'Hypothese',
  start_datum: 'Start_Datum',
  ort: 'Ort',
  verantwortlich: 'Verantwortlich',
  posten_nr: 'Posten_Nr',
  status: 'Status',
  asana_task_gid: 'Asana_Task_GID',
  sheet_file_id: 'Sheet_File_ID',
  folder_id: 'Folder_ID',
  treatments_json: 'Treatments_JSON',
  samen_pro_topf: 'Samen_pro_Topf',
  raster_cols: 'Raster_Cols',
  raster_rows: 'Raster_Rows',
  anzahl_trays: 'Anzahl_Trays',
  az_geplant: 'AZ_geplant'
};

// ========== HTTP-Entry-Points ==========

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'list';

    switch (action) {
      case 'list':
        return json(listVersuche());
      case 'listArchiv':
        return json(listArchiv());
      case 'get':
        return json(getVersuch(e.parameter.versuchsnr));
      case 'importFromAsana':
        return json(importVersuchFromAsana(e.parameter.asana_task_gid));
      case 'field_get':
        return json(fieldTrackerGet());
      default:
        return json({ error: 'unknown action: ' + action });
    }
  } catch (err) {
    return json({ error: String(err) + '\n' + (err.stack || '') });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    switch (action) {
      case 'saveTopf':
        return json(saveTopf(body));
      case 'abschlussAZ':
        return json(abschlussAZ(body));
      case 'updateAZGeplant':
        return json(updateAZGeplant(body));
      case 'uploadFoto':
        return json(uploadFoto(body));
      case 'postAsanaComment':
        return json(postAsanaComment(body));
      case 'markVersuchAbgeschlossen':
        return json(markVersuchAbgeschlossen(body));
      case 'createVersuch':
        return json(createVersuchInIndex(body));
      case 'field_saveParzelle':
        return json(fieldTrackerSaveParzelle(body));
      case 'field_uploadFoto':
        return json(fieldTrackerUploadFoto(body));
      case 'importRbd':
        return json(importRbdFromAsana(body.versuchsnr));
      default:
        return json({ error: 'unknown POST action: ' + action });
    }
  } catch (err) {
    return json({ error: String(err) + '\n' + (err.stack || '') });
  }
}

// ========== INDEX-OPERATIONEN ==========

function getIndexSheet() {
  // Das Index-Sheet ist das Sheet, an das dieses Script gebunden ist
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Index') || ss.getSheets()[0];
  return sheet;
}

function readIndex() {
  const sheet = getIndexSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[colIdx[INDEX_COLS.versuchsnr]]) continue;

    const v = {};
    Object.keys(INDEX_COLS).forEach(key => {
      const colName = INDEX_COLS[key];
      const idx = colIdx[colName];
      v[key] = idx !== undefined ? row[idx] : '';
    });

    // Formatierungen
    if (v.start_datum instanceof Date) {
      v.start_datum = Utilities.formatDate(v.start_datum, TIMEZONE, 'yyyy-MM-dd');
    } else {
      v.start_datum = String(v.start_datum || '');
    }

    // Treatments parsen
    try {
      v.treatments = v.treatments_json ? JSON.parse(v.treatments_json) : [];
    } catch (e) {
      v.treatments = [];
    }
    delete v.treatments_json;

    v.rowIndex = i + 1;
    rows.push(v);
  }
  return rows;
}

function listVersuche() {
  const all = readIndex();
  // Nur aktive zurueckliefern (nicht "abgeschlossen" oder "archiviert")
  const aktive = all.filter(v => {
    const s = String(v.status || '').toLowerCase();
    return s !== 'abgeschlossen' && s !== 'archiviert' && s !== 'fertig';
  });

  // Fortschritts-Info hinzufuegen (aus Daten-Sheet)
  const versucheMitFortschritt = aktive.map(v => {
    try {
      const fortschritt = getFortschritt(v);
      return { ...v, fortschritt };
    } catch (e) {
      return { ...v, fortschritt: { fehler: String(e) } };
    }
  });

  return { versuche: versucheMitFortschritt, anzahl: versucheMitFortschritt.length };
}

function getVersuch(versuchsnr) {
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(versuchsnr));
  if (!v) return { error: 'Versuch nicht gefunden: ' + versuchsnr };

  const daten = readDaten(v);
  const fortschritt = getFortschritt(v, daten);

  return { versuch: v, daten, fortschritt };
}

// ========== DATEN-SHEET-OPERATIONEN ==========

function openDatenSheet(v) {
  if (!v.sheet_file_id) {
    throw new Error('Kein Sheet_File_ID im Index fuer ' + v.versuchsnr);
  }
  return SpreadsheetApp.openById(v.sheet_file_id);
}

function readDaten(v) {
  const ss = openDatenSheet(v);
  const sheet = ss.getSheetByName('Daten');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  const entries = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[colIdx['Topf']]) continue;

    const entry = { topf: Number(row[colIdx['Topf']]) };
    entry.block = String(row[colIdx['Block']] || '');
    entry.wdh = Number(row[colIdx['Wdh']] || 0);
    entry.tray = colIdx['Tray'] !== undefined ? Number(row[colIdx['Tray']] || 1) : 1;
    entry.treatment = String(row[colIdx['Treatment']] || '');

    // AZ1-AZ5 einlesen
    for (let az = 1; az <= 5; az++) {
      entry['az' + az + '_datum'] = formatCell(row[colIdx['AZ' + az + '_Datum']]);
      entry['az' + az + '_zahl'] = row[colIdx['AZ' + az + '_Zahl']];
      entry['az' + az + '_benutzer'] = String(row[colIdx['AZ' + az + '_Benutzer']] || '');
    }

    // Fotos: AZ0 (Initial) + AZ1-AZ5
    // Unterstuetzt sowohl neue vereinfachte Spalten (Foto_AZx, Foto_AZx_TrayN)
    // als auch alte Block-Spalten (Foto_AZx_BlockX, Foto_AZx_TrayN_BlockX)
    entry.fotos = {};
    const blocks = ['A', 'B', 'C', 'D'];
    const azList = [0, 1, 2, 3, 4, 5];
    azList.forEach(az => {
      // Neue vereinfachte Spalten (1 Foto pro Tray)
      const simplTrayKey = 'Foto_AZ' + az + '_Tray' + entry.tray;
      const simplStdKey  = 'Foto_AZ' + az;
      if (colIdx[simplTrayKey] !== undefined) {
        entry.fotos['az' + az] = String(row[colIdx[simplTrayKey]] || '');
      } else if (colIdx[simplStdKey] !== undefined) {
        entry.fotos['az' + az] = String(row[colIdx[simplStdKey]] || '');
      }
      // Alte Block-Spalten (rueckwaertskompatibel)
      blocks.forEach(b => {
        const trayKey = 'Foto_AZ' + az + '_Tray' + entry.tray + '_Block' + b;
        const stdKey  = 'Foto_AZ' + az + '_Block' + b;
        if (colIdx[trayKey] !== undefined) {
          entry.fotos['az' + az + '_block' + b] = String(row[colIdx[trayKey]] || '');
        } else if (colIdx[stdKey] !== undefined) {
          entry.fotos['az' + az + '_block' + b] = String(row[colIdx[stdKey]] || '');
        }
      });
    });

    entry.rowIndex = i + 1;
    entries.push(entry);
  }
  return entries;
}

function saveTopf(body) {
  // body: { versuchsnr, topf, tray (optional), az, zahl, datum, benutzer }
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(body.versuchsnr));
  if (!v) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);

  const ss = openDatenSheet(v);
  const sheet = ss.getSheetByName('Daten');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  // Zeile fuer diesen Topf suchen.
  // Wenn body.tray gesetzt ist UND die Tray-Spalte existiert, zusaetzlich nach Tray filtern.
  // Sonst rueckwaertskompatibel: nur ueber Topf-Spalte suchen.
  const trayColIdx = colIdx['Tray'];
  const useTrayFilter = (body.tray != null && trayColIdx !== undefined);
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (Number(data[i][colIdx['Topf']]) !== Number(body.topf)) continue;
    if (useTrayFilter && Number(data[i][trayColIdx] || 1) !== Number(body.tray)) continue;
    rowIdx = i + 1;
    break;
  }
  if (rowIdx < 0) {
    const trayInfo = useTrayFilter ? (' / Tray ' + body.tray) : '';
    throw new Error('Topf ' + body.topf + trayInfo + ' nicht im Sheet gefunden.');
  }

  const az = Number(body.az);
  if (az < 1 || az > 5) throw new Error('Ungueltige AZ-Runde: ' + az);

  const zahlCol = colIdx['AZ' + az + '_Zahl'] + 1;
  const datumCol = colIdx['AZ' + az + '_Datum'] + 1;
  const benutzerCol = colIdx['AZ' + az + '_Benutzer'] + 1;

  if (body.zahl === null || body.zahl === undefined || body.zahl === '') {
    sheet.getRange(rowIdx, zahlCol).clearContent();
  } else {
    sheet.getRange(rowIdx, zahlCol).setValue(Number(body.zahl));
  }
  if (body.datum) sheet.getRange(rowIdx, datumCol).setValue(body.datum);
  if (body.benutzer) sheet.getRange(rowIdx, benutzerCol).setValue(body.benutzer);

  SpreadsheetApp.flush();
  return { ok: true, topf: body.topf, tray: body.tray || null, az: az, zahl: body.zahl };
}

function abschlussAZ(body) {
  // body: { versuchsnr, az }
  // Setzt alle leeren Topf-Zellen dieser AZ auf 0 und markiert die AZ im Index als abgeschlossen.
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(body.versuchsnr));
  if (!v) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);

  const ss = openDatenSheet(v);
  const sheet = ss.getSheetByName('Daten');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  const az = Number(body.az);
  const zahlCol = colIdx['AZ' + az + '_Zahl'] + 1;
  let cnt = 0;

  for (let i = 1; i < data.length; i++) {
    if (!data[i][colIdx['Topf']]) continue;
    const curVal = data[i][colIdx['AZ' + az + '_Zahl']];
    if (curVal === '' || curVal === null || curVal === undefined) {
      sheet.getRange(i + 1, zahlCol).setValue(0);
      cnt++;
    }
  }

  // Meta-Tab: AZ als abgeschlossen markieren
  let meta = ss.getSheetByName('Meta');
  if (!meta) {
    meta = ss.insertSheet('Meta');
    meta.getRange('A1:B1').setValues([['Schluessel', 'Wert']]);
  }
  const metaKey = 'AZ' + az + '_abgeschlossen_am';
  const metaData = meta.getDataRange().getValues();
  let metaRow = -1;
  for (let i = 1; i < metaData.length; i++) {
    if (String(metaData[i][0]) === metaKey) { metaRow = i + 1; break; }
  }
  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm');
  if (metaRow > 0) {
    meta.getRange(metaRow, 2).setValue(stamp);
  } else {
    meta.appendRow([metaKey, stamp]);
  }

  SpreadsheetApp.flush();
  return { ok: true, az: az, leereAuf0Gesetzt: cnt };
}

// ========== AZ-RUNDEN-ANZAHL AENDERN ==========

function updateAZGeplant(body) {
  // body: { versuchsnr, neueAnzahl }
  // Aendert AZ_geplant im Index und loescht/erstellt Asana-Subtasks entsprechend.
  const sheet = getIndexSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  let rowIdx = -1;
  let aktuell;
  let asanaGid;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx[INDEX_COLS.versuchsnr]]) === String(body.versuchsnr)) {
      rowIdx = i + 1;
      aktuell = Number(data[i][colIdx[INDEX_COLS.az_geplant]] || 5);
      asanaGid = String(data[i][colIdx[INDEX_COLS.asana_task_gid]] || '');
      break;
    }
  }
  if (rowIdx < 0) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);

  const neueAnzahl = Number(body.neueAnzahl);
  if (neueAnzahl < 1 || neueAnzahl > 5) throw new Error('AZ-Anzahl muss 1-5 sein');

  // Index aktualisieren
  sheet.getRange(rowIdx, colIdx[INDEX_COLS.az_geplant] + 1).setValue(neueAnzahl);
  SpreadsheetApp.flush();

  // Asana-Subtasks anpassen
  let asanaResult = { info: 'keine Asana-Verbindung' };
  if (asanaGid && ASANA_PAT && !ASANA_PAT.startsWith('__')) {
    asanaResult = syncAsanaAZSubtasks(asanaGid, neueAnzahl, aktuell);
  }

  return { ok: true, versuchsnr: body.versuchsnr, neueAnzahl, vorher: aktuell, asana: asanaResult };
}

// ========== FOTO-UPLOAD ==========

function uploadFoto(body) {
  // body: { versuchsnr, az, tray, datum, imageBase64, mimeType }
  // az = 0 -> Initial-Foto vor Versuchsstart
  // tray (optional, default 1) -> bei Mehr-Tray-Versuchen
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(body.versuchsnr));
  if (!v) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);
  if (!v.folder_id) throw new Error('Kein Folder_ID im Index fuer ' + body.versuchsnr);

  const parentFolder = DriveApp.getFolderById(v.folder_id);
  const fotosFolder = getOrCreateSubfolder(parentFolder, 'Fotos');

  const tray = Number(body.tray || 1);
  const anzahlTrays = Number(v.anzahl_trays || 1);
  const datum = body.datum || Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

  // Dateiname: 1 Foto pro Tray (kein Block-Suffix)
  const azPart = body.az == 0 ? 'AZ0_Initial' : 'AZ' + body.az;
  const trayPart = anzahlTrays > 1 ? '_Tray' + tray : '';
  const baseName = body.versuchsnr + '_' + azPart + trayPart + '_' + datum;
  const mime = body.mimeType || 'image/jpeg';
  const ext = mime.indexOf('png') >= 0 ? 'png' : 'jpg';

  let fileName = baseName + '.' + ext;
  let version = 1;
  while (fotosFolder.getFilesByName(fileName).hasNext()) {
    version++;
    fileName = baseName + '_v' + version + '.' + ext;
  }

  const blob = Utilities.newBlob(Utilities.base64Decode(body.imageBase64), mime, fileName);
  const file = fotosFolder.createFile(blob);
  const url = file.getUrl();

  // Ins Daten-Sheet eintragen
  const ss = openDatenSheet(v);
  const sheet = ss.getSheetByName('Daten');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  // Spaltenname: vereinfacht (kein Block), bei mehreren Trays Tray-spezifisch
  const colName = anzahlTrays > 1
    ? 'Foto_AZ' + body.az + '_Tray' + tray
    : 'Foto_AZ' + body.az;

  let targetCol = colIdx[colName];
  if (targetCol === undefined) {
    // Spalte fehlt - rechts anfuegen
    targetCol = sheet.getLastColumn();
    sheet.getRange(1, targetCol + 1).setValue(colName);
    targetCol = sheet.getLastColumn() - 1;
  }

  // URL in alle Zeilen des passenden Trays eintragen
  const trayColIdx = colIdx['Tray'];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][colIdx['Topf']]) continue;
    const rowTray = trayColIdx !== undefined ? Number(data[i][trayColIdx] || 1) : 1;
    if (rowTray === tray) {
      sheet.getRange(i + 1, targetCol + 1).setValue(url);
    }
  }

  SpreadsheetApp.flush();
  return { ok: true, fileName, url, versionNo: version };
}

// ========== ASANA-INTEGRATION ==========

function postAsanaComment(body) {
  // body: { versuchsnr, az, html }
  if (!ASANA_PAT || ASANA_PAT.startsWith('__')) {
    return { error: 'ASANA_PAT nicht konfiguriert' };
  }
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(body.versuchsnr));
  if (!v) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);
  if (!v.asana_task_gid) throw new Error('Kein Asana-Task-GID fuer ' + body.versuchsnr);

  const url = 'https://app.asana.com/api/1.0/tasks/' + v.asana_task_gid + '/stories';
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ASANA_PAT },
    payload: JSON.stringify({
      data: { html_text: body.html }
    }),
    muteHttpExceptions: true
  };
  const res = UrlFetchApp.fetch(url, options);
  const code = res.getResponseCode();
  const resp = res.getContentText();
  if (code >= 200 && code < 300) {
    const d = JSON.parse(resp);
    return { ok: true, storyGid: d.data && d.data.gid };
  }
  return { error: 'Asana HTTP ' + code + ': ' + resp.substring(0, 500) };
}

/**
 * Markiert einen Versuch als VOLLSTAENDIG ABGESCHLOSSEN:
 *   - Status im Index auf "Abgeschlossen" setzen
 *   - ANOVA + eta^2 + CV aus Daten-Sheet berechnen und an Kommentar anhaengen
 *   - Asana-Haupttask completed = true setzen (falls PAT da ist)
 *   - Finalen Asana-Kommentar mit Komplett-Auswertung + Statistik posten
 *
 * body: { versuchsnr, finalKommentarHtml }
 */
function markVersuchAbgeschlossen(body) {
  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const cIdx = {};
  headers.forEach((h, i) => { cIdx[String(h).trim()] = i; });

  let rowIdx = -1;
  let asanaGid = '';
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cIdx[INDEX_COLS.versuchsnr]]) === String(body.versuchsnr)) {
      rowIdx = i + 1;
      asanaGid = String(data[i][cIdx[INDEX_COLS.asana_task_gid]] || '');
      break;
    }
  }
  if (rowIdx < 0) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);

  // Status im Index auf "Abgeschlossen"
  indexSheet.getRange(rowIdx, cIdx[INDEX_COLS.status] + 1).setValue('Abgeschlossen');
  SpreadsheetApp.flush();

  // Statistik aus Daten-Sheet berechnen
  let statistikHtml = '';
  try {
    const allV = readIndex();
    const v = allV.find(x => String(x.versuchsnr) === String(body.versuchsnr));
    if (v && v.sheet_file_id) {
      const daten = readDaten(v);
      statistikHtml = buildStatistikHtml(v, daten);
    }
  } catch (e) {
    Logger.log('Statistik-Fehler: ' + e);
    statistikHtml = '<br><em>Statistik-Berechnung fehlgeschlagen: ' + String(e) + '</em>';
  }

  // Statistik an finalen Kommentar anhaengen
  let finalHtml = body.finalKommentarHtml || '';
  if (statistikHtml) {
    finalHtml = finalHtml
      ? finalHtml.replace('</body>', statistikHtml + '</body>')
      : '<body>' + statistikHtml + '</body>';
  }

  let asanaResult = { info: 'keine Asana-Verbindung' };
  if (asanaGid && ASANA_PAT && !ASANA_PAT.startsWith('__')) {
    try {
      if (finalHtml) {
        const url = 'https://app.asana.com/api/1.0/tasks/' + asanaGid + '/stories';
        UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + ASANA_PAT },
          payload: JSON.stringify({ data: { html_text: finalHtml } }),
          muteHttpExceptions: true
        });
      }
      const updRes = UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks/' + asanaGid, {
        method: 'put',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + ASANA_PAT },
        payload: JSON.stringify({ data: { completed: true } }),
        muteHttpExceptions: true
      });
      asanaResult = { ok: updRes.getResponseCode() < 300, code: updRes.getResponseCode() };
    } catch (e) {
      asanaResult = { error: String(e) };
    }
  }

  return { ok: true, versuchsnr: body.versuchsnr, asana: asanaResult };
}

function syncAsanaAZSubtasks(taskGid, neueAnzahl, alteAnzahl) {
  // Holt Subtasks, loescht AZ-Subtasks jenseits von neueAnzahl (wenn nicht abgeschlossen),
  // erstellt fehlende AZ-Subtasks wenn erhoeht.
  if (!ASANA_PAT || ASANA_PAT.startsWith('__')) {
    return { info: 'kein PAT' };
  }

  // Alle Subtasks holen
  const listUrl = 'https://app.asana.com/api/1.0/tasks/' + taskGid + '/subtasks?opt_fields=name,completed';
  const listRes = UrlFetchApp.fetch(listUrl, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ASANA_PAT },
    muteHttpExceptions: true
  });
  if (listRes.getResponseCode() !== 200) {
    return { error: 'Subtask-Liste fehlgeschlagen: ' + listRes.getContentText().substring(0, 300) };
  }
  const subtasks = JSON.parse(listRes.getContentText()).data;

  const result = { geloescht: [], erstellt: [], uebersprungen: [] };

  // Loeschen: alle AZn-Subtasks mit n > neueAnzahl, die nicht completed sind
  for (let az = neueAnzahl + 1; az <= 5; az++) {
    const pattern = new RegExp('^AZ' + az + '\\b', 'i');
    const matchingSubtasks = subtasks.filter(s => pattern.test(s.name));
    matchingSubtasks.forEach(s => {
      if (s.completed) {
        result.uebersprungen.push(s.name + ' (bereits abgeschlossen)');
        return;
      }
      const delRes = UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks/' + s.gid, {
        method: 'delete',
        headers: { Authorization: 'Bearer ' + ASANA_PAT },
        muteHttpExceptions: true
      });
      if (delRes.getResponseCode() >= 200 && delRes.getResponseCode() < 300) {
        result.geloescht.push(s.name);
      }
    });
  }

  // Erstellen: falls neueAnzahl > alteAnzahl und AZn-Subtask fehlt
  if (neueAnzahl > alteAnzahl) {
    for (let az = alteAnzahl + 1; az <= neueAnzahl; az++) {
      const pattern = new RegExp('^AZ' + az + '\\b', 'i');
      const exists = subtasks.some(s => pattern.test(s.name));
      if (!exists) {
        const createRes = UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks', {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + ASANA_PAT },
          payload: JSON.stringify({
            data: { name: 'AZ' + az, parent: taskGid, projects: [ASANA_PROJECT_GID] }
          }),
          muteHttpExceptions: true
        });
        if (createRes.getResponseCode() < 300) {
          result.erstellt.push('AZ' + az);
        }
      }
    }
  }

  return result;
}

// ========== ARCHIV ==========

function listArchiv() {
  const all = readIndex();
  const archiviert = all.filter(v => {
    const s = String(v.status || '').toLowerCase();
    return s === 'abgeschlossen' || s === 'archiviert' || s === 'fertig';
  });
  const mitFortschritt = archiviert.map(v => {
    try { return { ...v, fortschritt: getFortschritt(v) }; }
    catch (e) { return { ...v, fortschritt: { fehler: String(e) } }; }
  });
  return { versuche: mitFortschritt, anzahl: mitFortschritt.length };
}

// ========== ASANA-IMPORT ==========

function importVersuchFromAsana(taskGid) {
  if (!taskGid) return { error: 'asana_task_gid fehlt' };
  if (!ASANA_PAT || ASANA_PAT.startsWith('__')) return { error: 'ASANA_PAT nicht konfiguriert' };

  const res = UrlFetchApp.fetch(
    'https://app.asana.com/api/1.0/tasks/' + taskGid +
    '?opt_fields=name,notes,custom_fields',
    { method: 'get', headers: { Authorization: 'Bearer ' + ASANA_PAT }, muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    return { error: 'Asana HTTP ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300) };
  }
  const task = JSON.parse(res.getContentText()).data;

  // Name parsen: "26_013_A) Titel" → versuchsnr + themenbereich + titel
  const name = task.name || '';
  const vnMatch = name.match(/^(\d{2}_\d{3,4})/);
  const versuchsnr = vnMatch ? vnMatch[1] : '';
  let rest = name.replace(/^\d{2}_\d{3,4}_?/, '').trim();
  const bereichMatch = rest.match(/^([A-Z](?:\.\d+)?)\)\s*/);
  const themenbereich = bereichMatch ? bereichMatch[0].replace(/\)\s*$/, ')').trim() : '';
  if (bereichMatch) rest = rest.replace(bereichMatch[0], '').trim();
  const titel = rest;

  // Custom Fields: start_date (1213374383943504), hypothesis (1213374383943522)
  const cfMap = {};
  (task.custom_fields || []).forEach(f => { cfMap[f.gid] = f; });
  const startField = cfMap['1213374383943504'];
  const start_datum = (startField && startField.date_value && startField.date_value.date) || '';
  const hypoField = cfMap['1213374383943522'];
  const hypothese = (hypoField && hypoField.text_value) || '';

  // Notes parsen: Treatments, Design-Parameter
  const notes = task.notes || '';

  // TREATMENTS: zeilenbasiert, kein ^ Anker, robust gegen alle Zeilenenden
  const treatments = [];
  const notesLines = notes.split(/[\r\n]+/);
  for (let i = 0; i < notesLines.length; i++) {
    const line = notesLines[i];
    if (!line.match(/T\d+\s+\(#[0-9a-fA-F]{6}/)) continue;
    const codeM  = line.match(/T(\d+)\s+\(#/);
    const colorM = line.match(/\(#([0-9a-fA-F]{6})/);
    const labelM = line.match(/\)\s*(?:=\s*)?(.+)/);
    if (!codeM || !colorM || !labelM) continue;
    const label = labelM[1].split(',')[0].trim();
    if (label.length > 2) treatments.push({ code: 'T' + codeM[1], color: '#' + colorM[1], label: label });
  }
  const treatments_json = treatments.length ? JSON.stringify(treatments) : '';

  // Trays: erstes "N Trays" im Volltext
  const traysM = notes.match(/(\d+)\s+Trays/i);
  const anzahl_trays = traysM ? Number(traysM[1]) : null;

  // Raster: "N Spalten ... M Reihen" (toleriert verschiedene × Zeichen)
  const rasterM = notes.match(/(\d+)\s+Spalten[^0-9]{1,6}(\d+)\s+Reihen/i);
  const raster_cols = rasterM ? Number(rasterM[1]) : null;
  const raster_rows = rasterM ? Number(rasterM[2]) : null;

  // Samen/Topf: groesster Wert aus allen "N Samen/Topf" Vorkommen
  let samen_pro_topf = null;
  const samenAll = notes.match(/(\d+)\s+Samen\/Topf/g) || [];
  for (let j = 0; j < samenAll.length; j++) {
    const v = Number(samenAll[j].match(/\d+/)[0]);
    if (samen_pro_topf === null || v > samen_pro_topf) samen_pro_topf = v;
  }

  return {
    ok: true,
    prefill: {
      asana_task_gid: taskGid,
      versuchsnr, titel, themenbereich, start_datum, hypothese,
      treatments_json,
      anzahl_trays, raster_cols, raster_rows, samen_pro_topf
    }
  };
}

// ========== RBD-LAYOUT IMPORTIEREN ==========
// Liest die RBD-Tabellen aus den Asana-Notizen und schreibt Treatment + Farbe
// fuer jeden Topf ins Daten-Sheet. Baut das Sheet bei Bedarf komplett neu auf
// (richtige Zeilenanzahl bei Multi-Tray, Tray-Spalte ergaenzen).
//
// Direkt aus dem Apps-Script-Editor aufrufbar:
//   importRbdFromAsana('26_029')
//
// Erwartet in den Asana-Notizen:
//   RBD-LAYOUT TRAY I
//      A     B     C     D
//   1  T0    T9    T2    T1
//   2  T4    T3    T11   T5
//   ...
//   RBD-LAYOUT TRAY II
//   ...

function romanToNum(s) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let result = 0, prev = 0;
  const u = String(s).toUpperCase();
  for (let i = u.length - 1; i >= 0; i--) {
    const cur = map[u[i]] || 0;
    if (cur < prev) result -= cur; else result += cur;
    prev = cur;
  }
  return result;
}

function importRbdFromAsana(versuchsnr) {
  if (!versuchsnr) return { error: 'versuchsnr fehlt' };
  if (!ASANA_PAT || ASANA_PAT.startsWith('__')) return { error: 'ASANA_PAT nicht konfiguriert' };

  // 1. Versuch aus Index
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(versuchsnr));
  if (!v) return { error: 'Versuch nicht gefunden: ' + versuchsnr };
  if (!v.asana_task_gid) return { error: 'Kein Asana_Task_GID im Index fuer ' + versuchsnr };
  if (!v.sheet_file_id) return { error: 'Kein Sheet_File_ID im Index fuer ' + versuchsnr };

  const cols       = Number(v.raster_cols  || 4);
  const rows       = Number(v.raster_rows  || 6);
  const anzahlTrays = Number(v.anzahl_trays || 1);
  const treatments  = v.treatments || [];          // bereits parsed durch readIndex

  // Farb-Map: { 'T0': '#ffffff', ... }
  const colorMap = {};
  treatments.forEach(function(t) { colorMap[t.code] = t.color || ''; });

  // 2. Asana-Notes holen
  const res = UrlFetchApp.fetch(
    'https://app.asana.com/api/1.0/tasks/' + v.asana_task_gid + '?opt_fields=notes',
    { method: 'get', headers: { Authorization: 'Bearer ' + ASANA_PAT }, muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    return { error: 'Asana HTTP ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300) };
  }
  const notes = JSON.parse(res.getContentText()).data.notes || '';

  // 3. RBD-Tabellen parsen
  // rbdMap[trayNr][topf] = 'TN'
  const rbdMap = {};
  const lines = notes.split(/[\r\n]+/);
  let currentTray = null;
  let colHeaders  = null;   // z.B. ['A','B','C','D']

  for (var i = 0; i < lines.length; i++) {
    const line   = lines[i];
    const tokens = line.trim().split(/\s+/).filter(function(t) { return t.length > 0; });

    // "RBD-LAYOUT TRAY I" / "RBD LAYOUT TRAY II" etc.
    const trayM = line.match(/RBD[-\s]?LAYOUT\s+TRAY\s+([IVXLCDM]+)/i);
    if (trayM) {
      currentTray = romanToNum(trayM[1]);
      if (!rbdMap[currentTray]) rbdMap[currentTray] = {};
      colHeaders = null;
      continue;
    }

    if (currentTray === null) continue;

    // Spalten-Header-Zeile noch nicht gefunden?
    if (colHeaders === null) {
      // Alle tokens muessen einzelne A-H Buchstaben sein
      if (tokens.length >= 2 && tokens.every(function(t) { return /^[A-H]$/i.test(t); })) {
        colHeaders = tokens.map(function(t) { return t.toUpperCase(); });
      }
      continue;   // ob gefunden oder nicht – weiter zur naechsten Zeile
    }

    // Datenzeile: erstes Token ist Zeilennummer
    const rowNum = parseInt(tokens[0], 10);
    if (isNaN(rowNum) || rowNum < 1) continue;

    for (var j = 0; j < colHeaders.length && (j + 1) < tokens.length; j++) {
      const blockIdx = colHeaders[j].charCodeAt(0) - 65;   // 'A'=0, 'B'=1 …
      const topf     = blockIdx * rows + rowNum;
      const tCode    = tokens[j + 1].toUpperCase();
      if (/^T\d+$/.test(tCode)) {
        rbdMap[currentTray][topf] = tCode;
      }
    }
  }

  const parsedTrays = Object.keys(rbdMap).length;
  if (parsedTrays === 0) {
    return {
      error: 'Kein RBD-LAYOUT in den Asana-Notizen gefunden. ' +
             'Erwartet: "RBD-LAYOUT TRAY I" gefolgt von Spalten-Header und Datenzeilen.'
    };
  }

  // 4. Daten-Sheet komplett neu aufbauen
  const ss = openDatenSheet(v);
  const datenSheet = ss.getSheetByName('Daten');
  if (!datenSheet) {
    return { error: 'Daten-Sheet nicht gefunden – Versuch erst vollstaendig anlegen.' };
  }

  const multiTray = anzahlTrays > 1;
  const blocks    = ['A','B','C','D','E','F','G','H'].slice(0, cols);

  // Header (identisch mit buildDatenTab, aber mit optionaler Tray-Spalte)
  const headers = multiTray
    ? ['Topf', 'Tray', 'Block', 'Wdh', 'Treatment', 'Farbe']
    : ['Topf', 'Block', 'Wdh', 'Treatment', 'Farbe'];
  for (var az = 1; az <= 5; az++) {
    headers.push('AZ' + az + '_Datum', 'AZ' + az + '_Zahl', 'AZ' + az + '_Benutzer');
  }
  for (var tray = 1; tray <= anzahlTrays; tray++) {
    for (var az2 = 0; az2 <= 5; az2++) {
      headers.push(anzahlTrays > 1 ? 'Foto_AZ' + az2 + '_Tray' + tray : 'Foto_AZ' + az2);
    }
  }

  // Datenzeilen
  const dataRows = [];
  var assignedCount = 0;
  for (var trayNr = 1; trayNr <= anzahlTrays; trayNr++) {
    const trayRbd = rbdMap[trayNr] || {};
    for (var topf = 1; topf <= cols * rows; topf++) {
      const blockIdx  = Math.floor((topf - 1) / rows);
      const wdh       = ((topf - 1) % rows) + 1;
      const treatment = trayRbd[topf] || '';
      const farbe     = treatment ? (colorMap[treatment] || '') : '';
      if (treatment) assignedCount++;

      const row = multiTray
        ? [topf, trayNr, blocks[blockIdx], wdh, treatment, farbe]
        : [topf, blocks[blockIdx], wdh, treatment, farbe];

      for (var k = 0; k < 15; k++) row.push('');             // AZ1-AZ5 (3 Spalten je)
      for (var k2 = 0; k2 < 6 * anzahlTrays; k2++) row.push(''); // Foto-Spalten
      dataRows.push(row);
    }
  }

  // Sheet leeren und neu befuellen
  datenSheet.clearContents();
  datenSheet.clearFormats();

  datenSheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#2d4a23')
    .setFontColor('#f4f0e6')
    .setHorizontalAlignment('center');
  datenSheet.setRowHeight(1, 28);

  datenSheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);

  datenSheet.setFrozenRows(1);
  datenSheet.setFrozenColumns(multiTray ? 5 : 4);
  datenSheet.setColumnWidth(1, 50);  // Topf
  if (multiTray) {
    datenSheet.setColumnWidth(2, 55);   // Tray
    datenSheet.setColumnWidth(3, 60);   // Block
    datenSheet.setColumnWidth(4, 50);   // Wdh
    datenSheet.setColumnWidth(5, 130);  // Treatment
    datenSheet.setColumnWidth(6, 80);   // Farbe
  } else {
    datenSheet.setColumnWidth(2, 60);   // Block
    datenSheet.setColumnWidth(3, 50);   // Wdh
    datenSheet.setColumnWidth(4, 130);  // Treatment
    datenSheet.setColumnWidth(5, 80);   // Farbe
  }

  SpreadsheetApp.flush();

  return {
    ok: true,
    versuchsnr: versuchsnr,
    parsedTrays: parsedTrays,
    totalRows: dataRows.length,
    assignedCount: assignedCount,
    message: assignedCount + ' von ' + dataRows.length + ' Toepfen mit Treatment belegt (' +
             parsedTrays + ' Trays aus Asana-Notizen)'
  };
}

// ========== EINMALIGE RBD-PATCHES (hard-kodiert aus Protokoll) ==========

// 26_025 Biochar × KFK – SKi Wiederholung
// RBD-Layout aus Versuchsprotokoll (2 Trays à 24, 4 Treatments T0-T3)
// Nur Treatment + Farbe werden geschrieben, AZ-Daten bleiben erhalten.
function patchRbd26025() {
  const versuchsnr = '26_025';

  // Topf-Nummerierung: spaltenweise (A=Topf1-6, B=7-12, C=13-18, D=19-24)
  // Topf = blockIdx*6 + wdh
  const rbdMap = {
    1: { // Tray 1
      //       A    B    C    D  (Blöcke)
      // Wdh1: T1   T0   T3   T2
      1:'T1', 7:'T0', 13:'T3', 19:'T2',
      // Wdh2: T3   T2   T0   T1
      2:'T3', 8:'T2', 14:'T0', 20:'T1',
      // Wdh3: T0   T3   T2   T1
      3:'T0', 9:'T3', 15:'T2', 21:'T1',
      // Wdh4: T2   T1   T0   T3
      4:'T2', 10:'T1', 16:'T0', 22:'T3',
      // Wdh5: T1   T0   T3   T2
      5:'T1', 11:'T0', 17:'T3', 23:'T2',
      // Wdh6: T0   T2   T1   T3
      6:'T0', 12:'T2', 18:'T1', 24:'T3'
    },
    2: { // Tray 2
      //       A    B    C    D
      // Wdh1: T2   T3   T1   T0
      1:'T2', 7:'T3', 13:'T1', 19:'T0',
      // Wdh2: T0   T1   T3   T2
      2:'T0', 8:'T1', 14:'T3', 20:'T2',
      // Wdh3: T3   T0   T2   T1
      3:'T3', 9:'T0', 15:'T2', 21:'T1',
      // Wdh4: T1   T2   T0   T3
      4:'T1', 10:'T2', 16:'T0', 22:'T3',
      // Wdh5: T0   T3   T1   T2
      5:'T0', 11:'T3', 17:'T1', 23:'T2',
      // Wdh6: T3   T1   T2   T0
      6:'T3', 12:'T1', 18:'T2', 24:'T0'
    }
  };

  const all = readIndex();
  const v   = all.find(function(x) { return String(x.versuchsnr) === versuchsnr; });
  if (!v) { Logger.log('ERROR: ' + versuchsnr + ' nicht gefunden'); return { error: 'nicht gefunden' }; }

  const colorMap = {};
  (v.treatments || []).forEach(function(t) { colorMap[t.code] = t.color || ''; });
  Logger.log('Treatments: ' + JSON.stringify(colorMap));

  const ss    = openDatenSheet(v);
  const sheet = ss.getSheetByName('Daten');
  if (!sheet) { Logger.log('ERROR: Daten-Sheet nicht gefunden'); return { error: 'kein Daten-Sheet' }; }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx  = {};
  headers.forEach(function(h, i) { colIdx[String(h).trim()] = i; });

  const trayColIdx      = colIdx['Tray'];           // undefined falls Spalte fehlt
  const topfColIdx      = colIdx['Topf'];
  const treatmentColIdx = colIdx['Treatment'] + 1;  // 1-basiert
  const farbeColIdx     = colIdx['Farbe'] + 1;
  const potsPerTray     = 24;

  let updated = 0;
  let dataRowNum = 0;

  for (var i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[topfColIdx]) continue;

    const topf = Number(row[topfColIdx]);
    var tray;
    if (trayColIdx !== undefined) {
      tray = Number(row[trayColIdx] || 1);
    } else {
      // Keine Tray-Spalte: aus Zeilenposition ableiten
      tray = Math.floor(dataRowNum / potsPerTray) + 1;
    }
    dataRowNum++;

    const tCode = (rbdMap[tray] || {})[topf];
    if (!tCode) continue;

    sheet.getRange(i + 1, treatmentColIdx).setValue(tCode);
    sheet.getRange(i + 1, farbeColIdx).setValue(colorMap[tCode] || '');
    updated++;
  }

  SpreadsheetApp.flush();
  Logger.log('Fertig: ' + updated + ' Toepfe aktualisiert.');
  return { ok: true, updated: updated };
}

// ========== VERSUCH IM INDEX ANLEGEN ==========

function createVersuchInIndex(body) {
  if (!body.versuchsnr || !body.titel) return { error: 'versuchsnr und titel sind Pflichtfelder' };

  const all = readIndex();
  if (all.some(v => String(v.versuchsnr) === String(body.versuchsnr))) {
    return { error: 'Versuch ' + body.versuchsnr + ' existiert bereits im Index' };
  }

  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const cIdx = {};
  headers.forEach((h, i) => { cIdx[String(h).trim()] = i; });

  const newRow = new Array(headers.length).fill('');
  const colMap = {
    versuchsnr:    body.versuchsnr,
    titel:         body.titel,
    id_nummer:     body.id_nummer || '',
    baumart_kurz:  body.baumart_kurz || '',
    baumart_lat:   body.baumart_lat || '',
    themenbereich: body.themenbereich || '',
    themenfarbe:   body.themenfarbe || '#4a6b3a',
    hypothese:     body.hypothese || '',
    start_datum:   body.start_datum || '',
    ort:           body.ort || 'Halle',
    verantwortlich: body.verantwortlich || 'Simon Goldenberg',
    posten_nr:     body.posten_nr || '',
    status:        'Aktiv',
    asana_task_gid: body.asana_task_gid || '',
    sheet_file_id: '',
    folder_id:     '',
    treatments_json: body.treatments_json || '[]',
    samen_pro_topf: Number(body.samen_pro_topf) || 36,
    raster_cols:   Number(body.raster_cols) || 4,
    raster_rows:   Number(body.raster_rows) || 6,
    anzahl_trays:  Number(body.anzahl_trays) || 1,
    az_geplant:    Number(body.az_geplant) || 5
  };
  Object.entries(colMap).forEach(([key, val]) => {
    const colName = INDEX_COLS[key];
    if (colName !== undefined && cIdx[colName] !== undefined) newRow[cIdx[colName]] = val;
  });

  indexSheet.getRange(data.length + 1, 1, 1, headers.length).setValues([newRow]);
  SpreadsheetApp.flush();

  const setupResult = setupSingleVersuch(String(body.versuchsnr));
  return { ok: true, versuchsnr: body.versuchsnr, ...setupResult };
}

function setupSingleVersuch(versuchsnr) {
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(versuchsnr));
  if (!v) return { error: 'Versuch nicht im Index: ' + versuchsnr };
  if (v.sheet_file_id) return { info: 'hat bereits Sheet', sheetId: v.sheet_file_id, folderId: v.folder_id };

  const kfkFolder = DriveApp.getFolderById(KFK_DATA_FOLDER_ID);
  const folderName = versuchsnr + '_' + sanitizeForFilename(kurzTitel(v.titel || '', v.baumart_kurz || ''));
  const folder = getOrCreateSubfolder(kfkFolder, folderName);
  getOrCreateSubfolder(folder, 'Fotos');

  const newSs = SpreadsheetApp.create(versuchsnr + '_Daten');
  const newFile = DriveApp.getFileById(newSs.getId());
  folder.addFile(newFile);
  DriveApp.getRootFolder().removeFile(newFile);

  const treatments = v.treatments || [];
  buildDatenTab(newSs, Number(v.raster_cols || 4), Number(v.raster_rows || 6), Number(v.anzahl_trays || 1));
  buildMetaTab(newSs, versuchsnr, treatments);
  if (treatments.length) buildAuswertungTab(newSs, treatments, Number(v.samen_pro_topf || 36));

  // IDs zurueck in Index schreiben
  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const cIdx = {};
  headers.forEach((h, i) => { cIdx[String(h).trim()] = i; });
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cIdx[INDEX_COLS.versuchsnr]]) === String(versuchsnr)) {
      indexSheet.getRange(i + 1, cIdx[INDEX_COLS.sheet_file_id] + 1).setValue(newSs.getId());
      indexSheet.getRange(i + 1, cIdx[INDEX_COLS.folder_id] + 1).setValue(folder.getId());
      break;
    }
  }
  SpreadsheetApp.flush();
  return { sheetId: newSs.getId(), folderId: folder.getId() };
}

// ========== STATISTIK (ANOVA · eta² · CV) ==========

function buildStatistikHtml(v, daten) {
  const treatments = v.treatments || [];
  const samen = Number(v.samen_pro_topf || 36);
  const azGeplant = Number(v.az_geplant || 5);
  if (!daten || daten.length === 0 || treatments.length === 0) return '';

  // Letzte AZ mit Daten bestimmen
  let lastAZ = 0;
  for (let az = azGeplant; az >= 1; az--) {
    if (daten.some(d => {
      const val = d['az' + az + '_zahl'];
      return val !== '' && val != null && val !== undefined && !isNaN(Number(val));
    })) { lastAZ = az; break; }
  }
  if (lastAZ === 0) return '';

  let html = '<br><br><strong>📊 Statistik (ANOVA · η² · CV)</strong><br>';

  for (let az = 1; az <= lastAZ; az++) {
    const groups = treatments.map(t => {
      const vals = daten
        .filter(d => String(d.treatment || '').split(/[\s(]/)[0] === t.code)
        .map(d => d['az' + az + '_zahl'])
        .filter(x => x !== '' && x != null && x !== undefined && !isNaN(Number(x)))
        .map(Number);
      return { t, vals };
    }).filter(g => g.vals.length > 0);

    if (groups.length === 0) continue;

    const groupStats = groups.map(g => {
      const n = g.vals.length;
      const mean = g.vals.reduce((a, b) => a + b, 0) / n;
      const sd = n > 1
        ? Math.sqrt(g.vals.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / (n - 1))
        : 0;
      const cv = mean > 0 ? Math.round(sd / mean * 100) : 0;
      return {
        code: g.t.code,
        label: String(g.t.label || '').substring(0, 13),
        n, mean: mean.toFixed(1), kf: Math.round(mean / samen * 100),
        sd: sd.toFixed(1), cv,
        rawMean: mean, rawVals: g.vals
      };
    });

    html += '<br><strong>AZ' + az + '</strong><br><pre>';
    html += 'Code  Label            n   Ø Keim  KF%   SD    CV%\n';
    groupStats.forEach(g => {
      html += (g.code + '    ').slice(0, 4) + ' ' +
              (g.label + '               ').slice(0, 15) + ' ' +
              String(g.n).padStart(3) + '   ' +
              String(g.mean).padStart(6) + '  ' +
              String(g.kf + '%').padStart(4) + '  ' +
              String(g.sd).padStart(5) + '  ' +
              String(g.cv + '%').padStart(4) + '\n';
    });
    html += '</pre>';

    if (groups.length >= 2) {
      const allVals = groups.flatMap(g => g.vals);
      const N = allVals.length;
      const grandMean = allVals.reduce((a, b) => a + b, 0) / N;
      let ssBetween = 0, ssWithin = 0;
      groups.forEach(g => {
        const n = g.vals.length;
        const mean = g.vals.reduce((a, b) => a + b, 0) / n;
        ssBetween += n * Math.pow(mean - grandMean, 2);
        ssWithin += g.vals.reduce((s, x) => s + Math.pow(x - mean, 2), 0);
      });
      const ssTotal = ssBetween + ssWithin;
      const k = groups.length;
      const dfB = k - 1, dfW = N - k;
      if (dfW > 0 && ssWithin > 0) {
        const F = (ssBetween / dfB) / (ssWithin / dfW);
        const eta2 = ssTotal > 0 ? ssBetween / ssTotal : 0;
        const p = pValueFromF(F, dfB, dfW);
        const pStr = p < 0.001 ? '&lt; 0.001' : p.toFixed(3);
        const sig = p < 0.05 ? ' <strong>✓ sig.</strong>' : ' (n.s.)';
        html += 'ANOVA: F(' + dfB + ',' + dfW + ') = ' + F.toFixed(2) +
                ', p = ' + pStr + sig + ', η² = ' + eta2.toFixed(3) + '<br>';
      }
    }
  }
  return html;
}

// p-Wert aus F-Verteilung: P(F > f | d1, d2)
function pValueFromF(f, d1, d2) {
  if (f <= 0 || d1 <= 0 || d2 <= 0) return 1;
  const x = (d1 * f) / (d1 * f + d2);
  return regularizedIncompleteBeta(1 - x, d2 / 2, d1 / 2);
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const bt = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta);
  if (x < (a + 1) / (a + b + 2)) return bt * betaCF(x, a, b) / a;
  return 1 - bt * betaCF(1 - x, b, a) / b;
}

function logGamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z = z - 1;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
             771.32342877765313, -176.61502916214059, 12.507343278686905,
             -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i <= 8; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaCF(x, a, b) {
  const MAXIT = 200, EPS = 3e-7, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1.0, d = 1.0 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1.0 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1.0) < EPS) break;
  }
  return h;
}

// ========== FORTSCHRITTS-BERECHNUNG ==========

function getFortschritt(v, daten) {
  if (!daten) {
    try { daten = readDaten(v); } catch (e) { return { fehler: String(e) }; }
  }
  const azGeplant = Number(v.az_geplant || 5);
  const result = { az_geplant: azGeplant, az_status: [], az_kf_mittel: [] };

  for (let az = 1; az <= azGeplant; az++) {
    const werte = daten
      .map(d => d['az' + az + '_zahl'])
      .filter(x => x !== '' && x !== null && x !== undefined && !isNaN(Number(x)));

    if (werte.length === 0) {
      result.az_status.push('offen');
      result.az_kf_mittel.push(null);
    } else if (werte.length < daten.length) {
      result.az_status.push('teilweise');
      const mean = werte.reduce((a, b) => a + Number(b), 0) / werte.length;
      const samen = Number(v.samen_pro_topf || 36);
      result.az_kf_mittel.push(Math.round((mean / samen) * 100));
    } else {
      result.az_status.push('fertig');
      const mean = werte.reduce((a, b) => a + Number(b), 0) / werte.length;
      const samen = Number(v.samen_pro_topf || 36);
      result.az_kf_mittel.push(Math.round((mean / samen) * 100));
    }
  }

  result.toepfe_total = daten.length;
  return result;
}

// ========== BACKUP (nie Pruning) ==========

function weeklyBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd_HH-mm');
  const indexFile = DriveApp.getFileById(ss.getId());

  const kfkFolder = DriveApp.getFolderById(KFK_DATA_FOLDER_ID);
  const backupRoot = getOrCreateSubfolder(kfkFolder, BACKUP_SUBFOLDER_NAME);
  const backupDateFolder = backupRoot.createFolder(stamp);

  // Index selbst sichern
  indexFile.makeCopy('__KFK-Index_' + stamp, backupDateFolder);

  // Alle aktiven Daten-Sheets sichern
  const all = readIndex();
  let count = 1;
  all.forEach(v => {
    if (v.sheet_file_id) {
      try {
        const f = DriveApp.getFileById(v.sheet_file_id);
        f.makeCopy(String(v.versuchsnr) + '_' + stamp, backupDateFolder);
        count++;
      } catch (e) {
        Logger.log('Backup von ' + v.versuchsnr + ' fehlgeschlagen: ' + e);
      }
    }
  });

  // WICHTIG: KEIN Pruning. Backups werden unbegrenzt aufbewahrt.
  Logger.log('Backup erstellt: ' + stamp + ' mit ' + count + ' Dateien.');
  return { ok: true, stamp, fileCount: count };
}

// ========== HELFER ==========

function getOrCreateSubfolder(parentFolder, name) {
  const it = parentFolder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(name);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatCell(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd');
  }
  return String(val);
}

function manualBackupNow() { return weeklyBackup(); }

// ========== Test-Funktion fuer Einrichtung ==========
function testConnection() {
  const list = listVersuche();
  Logger.log('Aktive Versuche: ' + list.anzahl);
  list.versuche.forEach(v => Logger.log(' - ' + v.versuchsnr + ': ' + v.titel));
  return list;
}

// ========== BULK-SETUP (einmalig fuer bestehende Versuche) ==========
/**
 * Legt fuer jeden Versuch im Index (ohne Sheet_File_ID) automatisch an:
 *   - Drive-Ordner "VersuchsNr_Kurztitel" im KFK-Daten-Ordner
 *   - Unterordner "Fotos"
 *   - Daten-Sheet "VersuchsNr_Daten" mit 3 Tabs (Daten / Meta / Auswertung)
 *   - 24 Topf-Zeilen mit Topf/Block/Wdh, aber LEERER Treatment-Spalte
 *   - Traegt Sheet_File_ID und Folder_ID zurueck in den Index ein
 *
 * WICHTIG: Die Treatment-Zuordnung wird NICHT gewuerfelt. Simon traegt sie
 * fuer jeden Versuch aus dem DOCX-Protokoll in Spalte D ein (Format "T0 Kontrolle").
 * Die Spalte E (Farbe) wird automatisch aus Treatments_JSON bei Eingabe in D gezogen
 * (via onEdit-Trigger) oder kann manuell gesetzt werden.
 *
 * Die Funktion kann mehrfach ausgefuehrt werden - bereits angelegte Versuche werden
 * uebersprungen (Kriterium: Sheet_File_ID im Index ist schon gesetzt).
 */
function bulkSetupVersuche() {
  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  const kfkFolder = DriveApp.getFolderById(KFK_DATA_FOLDER_ID);
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const versuchsnr = String(row[colIdx[INDEX_COLS.versuchsnr]] || '').trim();
    if (!versuchsnr) continue;

    const existingSheetId = String(row[colIdx[INDEX_COLS.sheet_file_id]] || '').trim();
    if (existingSheetId) {
      results.push({ versuchsnr, status: 'uebersprungen (hat bereits Sheet)' });
      continue;
    }

    try {
      const titel = String(row[colIdx[INDEX_COLS.titel]] || '');
      const baumartKurz = String(row[colIdx[INDEX_COLS.baumart_kurz]] || '');
      const treatmentsJson = String(row[colIdx[INDEX_COLS.treatments_json]] || '[]');
      const rasterCols = Number(row[colIdx[INDEX_COLS.raster_cols]] || 4);
      const rasterRows = Number(row[colIdx[INDEX_COLS.raster_rows]] || 6);
      const samenProTopf = Number(row[colIdx[INDEX_COLS.samen_pro_topf]] || 36);
      const anzahlTrays = Number(row[colIdx[INDEX_COLS.anzahl_trays]] || 1);

      let treatments;
      try { treatments = JSON.parse(treatmentsJson); } catch (e) { treatments = []; }

      // Ordnername bauen
      const folderName = versuchsnr + '_' + sanitizeForFilename(kurzTitel(titel, baumartKurz));

      const folder = getOrCreateSubfolder(kfkFolder, folderName);
      getOrCreateSubfolder(folder, 'Fotos');

      // Neues Spreadsheet erstellen und in Zielordner verschieben
      const newSs = SpreadsheetApp.create(versuchsnr + '_Daten');
      const newFile = DriveApp.getFileById(newSs.getId());
      folder.addFile(newFile);
      DriveApp.getRootFolder().removeFile(newFile);

      // Tabs aufbauen (OHNE Treatment-Zuweisung)
      buildDatenTab(newSs, rasterCols, rasterRows, anzahlTrays);
      buildMetaTab(newSs, versuchsnr, treatments);
      if (treatments.length) {
        buildAuswertungTab(newSs, treatments, samenProTopf);
      }

      // IDs zurueck in Index
      indexSheet.getRange(i + 1, colIdx[INDEX_COLS.sheet_file_id] + 1).setValue(newSs.getId());
      indexSheet.getRange(i + 1, colIdx[INDEX_COLS.folder_id] + 1).setValue(folder.getId());
      SpreadsheetApp.flush();

      results.push({ versuchsnr, status: 'angelegt', sheetId: newSs.getId(), folderId: folder.getId() });
    } catch (e) {
      results.push({ versuchsnr, status: 'FEHLER: ' + String(e) });
    }
  }

  Logger.log('====== BULK-SETUP ERGEBNIS ======');
  results.forEach(r => {
    Logger.log(r.versuchsnr + ': ' + r.status + (r.sheetId ? ' [' + r.sheetId + ']' : ''));
  });
  Logger.log('');
  Logger.log('Fertig. ' + results.filter(r => r.status === 'angelegt').length + ' Versuche neu angelegt.');
  Logger.log('');
  Logger.log('NAECHSTER SCHRITT: In jedem neuen Daten-Sheet die Spalte D (Treatment)');
  Logger.log('aus dem jeweiligen DOCX-Protokoll eintragen. Format: "T0 Kontrolle", "T1 Pellet duenn" etc.');
  Logger.log('Spalte E (Farbe) kann danach per Hand entsprechend Treatments_JSON eingefaerbt werden.');

  return { results };
}

function kurzTitel(titel, baumartKurz) {
  // Baut aus "A.0) Wiederholungsversuch SKi VakuumSeeder Test" einen kompakten Namen
  // wie "SKi_VakuumSeeder" (oder "WKi_Lagerung" usw.)
  let t = String(titel);
  // Entferne Themenbereich-Prefix wie "A.0) " oder "D.1) "
  t = t.replace(/^[A-Z]\.\d+\)\s*/, '').replace(/^[A-Z]\)\s*/, '');
  // Entferne Formulierungen wie "Einfluss von", "Versuch", "Wiederholungsversuch"
  t = t.replace(/\b(Wiederholungsversuch|Versuch|Einfluss von|Einfluss|auf die|auf das|auf den|und die|bei|von|–|-)\b/gi, ' ');
  // Whitespace normalisieren
  t = t.replace(/\s+/g, ' ').trim();
  // Auf 35 Zeichen kuerzen
  if (t.length > 35) t = t.substring(0, 35).trim();
  return t || (baumartKurz + '_Versuch');
}

function sanitizeForFilename(s) {
  return String(s)
    .replace(/[\\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildDatenTab(ss, cols, rows, anzahlTrays) {
  anzahlTrays = anzahlTrays || 1;
  const sheet = ss.getActiveSheet();
  sheet.setName('Daten');

  // Headers
  const headers = ['Topf', 'Block', 'Wdh', 'Treatment', 'Farbe'];
  for (let az = 1; az <= 5; az++) {
    headers.push('AZ' + az + '_Datum', 'AZ' + az + '_Zahl', 'AZ' + az + '_Benutzer');
  }
  // Vereinfachte Foto-Spalten: 1 pro AZ pro Tray (AZ0 = Initial)
  for (let tray = 1; tray <= anzahlTrays; tray++) {
    for (let az = 0; az <= 5; az++) {
      headers.push(anzahlTrays > 1 ? 'Foto_AZ' + az + '_Tray' + tray : 'Foto_AZ' + az);
    }
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#2d4a23')
    .setFontColor('#f4f0e6')
    .setHorizontalAlignment('center');
  sheet.setRowHeight(1, 28);

  // Datenzeilen mit Topf/Block/Wdh, Treatment/Farbe bleiben LEER
  const blocks = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, cols);
  const fotoColCount = 6 * anzahlTrays; // AZ0-AZ5 pro Tray
  const dataRows = [];
  for (let tray = 1; tray <= anzahlTrays; tray++) {
    for (let topf = 1; topf <= cols * rows; topf++) {
      const blockIdx = Math.floor((topf - 1) / rows);
      const wdh = ((topf - 1) % rows) + 1;
      const row = [topf, blocks[blockIdx], wdh, '', ''];
      for (let i = 0; i < 15; i++) row.push('');
      for (let i = 0; i < fotoColCount; i++) row.push('');
      dataRows.push(row);
    }
  }
  sheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);
  sheet.setColumnWidth(1, 50);
  sheet.setColumnWidth(2, 60);
  sheet.setColumnWidth(3, 50);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 80);
}

function buildMetaTab(ss, versuchsnr, treatments) {
  const meta = ss.insertSheet('Meta');
  meta.getRange(1, 1, 1, 2).setValues([['Schluessel', 'Wert']])
    .setFontWeight('bold').setBackground('#2d4a23').setFontColor('#f4f0e6');
  const metaData = [
    ['versuchsnr', versuchsnr],
    ['erstellt_am', Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm')],
    ['erstellt_via', 'bulkSetupVersuche()'],
    ['treatments_todo', (treatments && treatments.length)
      ? 'Treatment-Spalte D noch leer - aus DOCX-Protokoll eintragen. Definierte Treatments: ' + treatments.map(t => t.code + '=' + (t.label||'')).join(', ')
      : 'Keine Treatments im Index hinterlegt'],
    ['AZ1_abgeschlossen_am', ''],
    ['AZ2_abgeschlossen_am', ''],
    ['AZ3_abgeschlossen_am', ''],
    ['AZ4_abgeschlossen_am', ''],
    ['AZ5_abgeschlossen_am', '']
  ];
  meta.getRange(2, 1, metaData.length, 2).setValues(metaData);
  meta.setColumnWidth(1, 200);
  meta.setColumnWidth(2, 500);
}

function buildAuswertungTab(ss, treatments, samenProTopf) {
  const sheet = ss.insertSheet('Auswertung');
  sheet.getRange(1, 1).setValue('Live-Auswertung')
    .setFontSize(13).setFontWeight('bold')
    .setBackground('#2d4a23').setFontColor('#f4f0e6');
  sheet.getRange(1, 1, 1, 8).merge();

  sheet.getRange(2, 1).setValue('Hinweis: Fuer ANOVA, eta^2 und Post-hoc-Tukey siehe Python/R-Notebook am Laptop.')
    .setFontStyle('italic').setFontColor('#6b5f4e');
  sheet.getRange(2, 1, 1, 8).merge();

  // AZ-Zahl-Spalten in "Daten": AZ1=G, AZ2=J, AZ3=M, AZ4=P, AZ5=S
  const azCols = { 1: 'G', 2: 'J', 3: 'M', 4: 'P', 5: 'S' };
  let curRow = 4;

  for (let az = 1; az <= 5; az++) {
    sheet.getRange(curRow, 1).setValue('AZ' + az).setFontWeight('bold').setFontColor('#4a6b3a').setFontSize(12);
    curRow++;
    const headerRow = ['Treatment', 'n', 'Mean', 'SD', 'Min', 'Max', 'KF %', 'CV %'];
    sheet.getRange(curRow, 1, 1, 8).setValues([headerRow])
      .setFontWeight('bold').setBackground('#ebe5d3').setHorizontalAlignment('center');
    curRow++;

    const col = azCols[az];
    treatments.forEach(t => {
      const prefix = t.code; // z.B. "T0"
      sheet.getRange(curRow, 1).setValue(prefix + ' ' + (t.label || ''));
      sheet.getRange(curRow, 2).setFormula(`=COUNTIFS(Daten!D:D,"${prefix} *",Daten!${col}:${col},">=0")`);
      sheet.getRange(curRow, 3).setFormula(`=IFERROR(AVERAGEIFS(Daten!${col}:${col},Daten!D:D,"${prefix} *"),"")`);
      sheet.getRange(curRow, 4).setFormula(`=IFERROR(STDEV(IF(LEFT(Daten!D2:D100,${prefix.length + 1})="${prefix} ",Daten!${col}2:${col}100)),"")`);
      sheet.getRange(curRow, 5).setFormula(`=IFERROR(MINIFS(Daten!${col}:${col},Daten!D:D,"${prefix} *"),"")`);
      sheet.getRange(curRow, 6).setFormula(`=IFERROR(MAXIFS(Daten!${col}:${col},Daten!D:D,"${prefix} *"),"")`);
      sheet.getRange(curRow, 7).setFormula(`=IFERROR(ROUND(C${curRow}/${samenProTopf}*100,0)&"%","")`);
      sheet.getRange(curRow, 8).setFormula(`=IFERROR(ROUND(D${curRow}/C${curRow}*100,1)&"%","")`);
      curRow++;
    });
    curRow += 1; // Leerzeile
  }

  for (let c = 1; c <= 8; c++) sheet.setColumnWidth(c, c === 1 ? 160 : 80);
}

/**
 * Hilfs-Funktion: Liest die Treatment-Eintraege in Spalte D eines Versuchs-Daten-Sheets,
 * und setzt die Hintergrundfarbe der Zelle in Spalte E entsprechend Treatments_JSON aus dem Index.
 *
 * Workflow:
 *   1. Simon traegt in Spalte D des Versuchs-Daten-Sheets fuer jeden Topf das Treatment ein
 *      ("T0 Kontrolle", "T1 Pellet duenn", ...) aus dem DOCX-Protokoll
 *   2. Hier im Index-Apps-Script: applyTreatmentColorsFor('26_006') aufrufen
 *      oder applyAllTreatmentColors() um das fuer alle Versuche auf einmal zu machen
 *   3. Spalte E bekommt Hintergrundfarbe und Farb-Hex als Text
 *
 * Einzeln fuer einen Versuch ausfuehren:
 *   applyTreatmentColorsFor('26_006')
 */
function applyTreatmentColorsFor(versuchsnr) {
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(versuchsnr));
  if (!v) throw new Error('Versuch nicht gefunden: ' + versuchsnr);
  if (!v.sheet_file_id) throw new Error('Kein Sheet_File_ID fuer ' + versuchsnr + ' - erst bulkSetupVersuche() laufen lassen.');
  if (!v.treatments || !v.treatments.length) throw new Error('Keine Treatments im Index fuer ' + versuchsnr);

  const tMap = {};
  v.treatments.forEach(t => { tMap[t.code] = t; });

  const ss = SpreadsheetApp.openById(v.sheet_file_id);
  const daten = ss.getSheetByName('Daten');
  if (!daten) throw new Error('Tab "Daten" fehlt in ' + versuchsnr);
  const last = daten.getLastRow();
  if (last < 2) return { versuchsnr, applied: 0, info: 'keine Topf-Zeilen' };

  const values = daten.getRange(2, 4, last - 1, 2).getValues();  // Spalten D + E
  let applied = 0;
  const unknown = new Set();

  for (let i = 0; i < values.length; i++) {
    const treatRaw = String(values[i][0] || '').trim();
    if (!treatRaw) continue;
    const code = treatRaw.split(/[\s(]/)[0];
    const t = tMap[code];
    if (t && t.color) {
      daten.getRange(i + 2, 5).setBackground(t.color).setValue(t.color).setFontColor(textColorForHex(t.color));
      applied++;
    } else {
      unknown.add(code);
    }
  }
  SpreadsheetApp.flush();

  const result = { versuchsnr, applied };
  if (unknown.size > 0) result.unbekannteTreatments = [...unknown];
  return result;
}

/**
 * Wendet applyTreatmentColorsFor auf ALLE Versuche im Index an,
 * die ein Daten-Sheet haben.
 */
function applyAllTreatmentColors() {
  const all = readIndex();
  const results = [];
  all.forEach(v => {
    if (!v.sheet_file_id || !v.treatments || !v.treatments.length) {
      results.push({ versuchsnr: v.versuchsnr, skipped: true });
      return;
    }
    try {
      results.push(applyTreatmentColorsFor(v.versuchsnr));
    } catch (e) {
      results.push({ versuchsnr: v.versuchsnr, error: String(e) });
    }
  });
  Logger.log('====== applyAllTreatmentColors ======');
  results.forEach(r => Logger.log(JSON.stringify(r)));
  return results;
}

function textColorForHex(hex) {
  if (!hex) return '#000000';
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 160 ? '#000000' : '#ffffff';
}

// ================================================================
// FIELD-TRACKER (26_001 Feldversuch, Light-Tracker)
// ================================================================
/**
 * Der Feldversuch 26_001 hat ein abweichendes Schema:
 *   - 32 Parzellen (2 Bloecke × 16 Parzellen)
 *   - 4 Treatments: REIN, DUENN, DICK, KOHLE
 *   - 100 Samen pro Parzelle (5cm-Raster, 10×10)
 *   - 2 Auszaehlungen (30 Tage, 45 Tage)
 *   - 2 Baumarten parallel (KueTa, SKi)
 *
 * Daher eigener Tracker mit separatem Sheet "26_001_Feldversuch".
 * Das Sheet wird bei erstem Get-Request automatisch angelegt.
 */

const FIELD_SHEET_NAME = '26_001_Feldversuch';
const FIELD_FOLDER_NAME = '26_001_D1_Direktsaatvergleich_vor_Halle';

// Parzellen-Zuordnung aus Protokoll 26_001 (S.3)
// (gleiche Randomisierung fuer beide Bloecke laut Protokoll)
const FIELD_PARZELLEN_KUTA = [
  { reihe: 'A', spalte: 1, treatment: 'REIN' },
  { reihe: 'A', spalte: 2, treatment: 'DICK' },
  { reihe: 'B', spalte: 1, treatment: 'DÜNN' },
  { reihe: 'B', spalte: 2, treatment: 'KOHLE' },
  { reihe: 'C', spalte: 1, treatment: 'DICK' },
  { reihe: 'C', spalte: 2, treatment: 'REIN' },
  { reihe: 'D', spalte: 1, treatment: 'KOHLE' },
  { reihe: 'D', spalte: 2, treatment: 'DÜNN' },
  { reihe: 'E', spalte: 1, treatment: 'DÜNN' },
  { reihe: 'E', spalte: 2, treatment: 'KOHLE' },
  { reihe: 'F', spalte: 1, treatment: 'REIN' },
  { reihe: 'F', spalte: 2, treatment: 'DICK' },
  { reihe: 'G', spalte: 1, treatment: 'KOHLE' },
  { reihe: 'G', spalte: 2, treatment: 'DÜNN' },
  { reihe: 'H', spalte: 1, treatment: 'DICK' },
  { reihe: 'H', spalte: 2, treatment: 'REIN' }
];
const FIELD_PARZELLEN_SKI = FIELD_PARZELLEN_KUTA.slice();  // gleiche Randomisierung

const FIELD_TREATMENTS = [
  { code: 'REIN',  label: 'Unpelletiert',  color: '#3b82f6' },  // Hellblau
  { code: 'DÜNN',  label: 'Pellet dünn (1:1,5)',  color: '#22c55e' },  // Gruen
  { code: 'DICK',  label: 'Pellet dick (1:2,5)',  color: '#eab308' },  // Gelb
  { code: 'KOHLE', label: 'Pellet + Kohle',  color: '#e5e7eb' }   // Hellgrau/weiss
];

function fieldGetOrCreateSheet() {
  // Ordner im KFK-Daten-Folder
  const kfkFolder = DriveApp.getFolderById(KFK_DATA_FOLDER_ID);
  const folder = getOrCreateSubfolder(kfkFolder, FIELD_FOLDER_NAME);
  getOrCreateSubfolder(folder, 'Fotos');

  // Sheet suchen
  const it = folder.getFilesByName(FIELD_SHEET_NAME);
  if (it.hasNext()) {
    return { sheet: SpreadsheetApp.open(it.next()), folder: folder };
  }

  // Nicht vorhanden - neu anlegen
  const ss = SpreadsheetApp.create(FIELD_SHEET_NAME);
  const file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  buildFieldDatenTab(ss);
  return { sheet: ss, folder: folder };
}

function buildFieldDatenTab(ss) {
  const sheet = ss.getActiveSheet();
  sheet.setName('Daten');

  const headers = [
    'ParzID', 'Block', 'Reihe', 'Spalte', 'Treatment',
    'AZ1_Datum', 'AZ1_Zahl', 'AZ1_Benutzer', 'AZ1_Notiz',
    'AZ2_Datum', 'AZ2_Zahl', 'AZ2_Benutzer', 'AZ2_Notiz',
    'Foto_AZ1', 'Foto_AZ2'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#2d4a23').setFontColor('#f4f0e6');

  // 32 Parzellen: Block KueTa (1-16) + Block SKi (17-32)
  const rows = [];
  let idCounter = 1;
  FIELD_PARZELLEN_KUTA.forEach(p => {
    rows.push([
      'KüTa_' + p.reihe + p.spalte,
      'KüTa',
      p.reihe,
      p.spalte,
      p.treatment,
      '', '', '', '',
      '', '', '', '',
      '', ''
    ]);
  });
  FIELD_PARZELLEN_SKI.forEach(p => {
    rows.push([
      'SKi_' + p.reihe + p.spalte,
      'SKi',
      p.reihe,
      p.spalte,
      p.treatment,
      '', '', '', '',
      '', '', '', '',
      '', ''
    ]);
  });

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  // Treatment-Spalte einfaerben
  const tMap = {};
  FIELD_TREATMENTS.forEach(t => { tMap[t.code] = t; });
  for (let i = 0; i < rows.length; i++) {
    const t = tMap[rows[i][4]];
    if (t) {
      sheet.getRange(i + 2, 5)
        .setBackground(t.color)
        .setFontColor(textColorForHex(t.color));
    }
  }

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(5);
  sheet.setColumnWidth(1, 90);
  sheet.setColumnWidth(2, 60);
  sheet.setColumnWidth(3, 60);
  sheet.setColumnWidth(4, 60);
  sheet.setColumnWidth(5, 100);

  // Meta-Tab
  const meta = ss.insertSheet('Meta');
  meta.getRange(1, 1, 1, 2).setValues([['Schluessel', 'Wert']])
    .setFontWeight('bold').setBackground('#2d4a23').setFontColor('#f4f0e6');
  const metaData = [
    ['versuchsnr', '26_001'],
    ['typ', 'Feldversuch (Direktsaat)'],
    ['samen_pro_parzelle', 100],
    ['erstellt_am', Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm')],
    ['aussaat_datum', '2026-04-21'],
    ['AZ1_ziel', '30 Tage nach Aussaat (ca. 2026-05-21)'],
    ['AZ2_ziel', '45 Tage nach Aussaat (ca. 2026-06-05)'],
    ['AZ1_abgeschlossen_am', ''],
    ['AZ2_abgeschlossen_am', '']
  ];
  meta.getRange(2, 1, metaData.length, 2).setValues(metaData);
  meta.setColumnWidth(1, 200);
  meta.setColumnWidth(2, 300);
}

function fieldTrackerGet() {
  const { sheet, folder } = fieldGetOrCreateSheet();
  const daten = sheet.getSheetByName('Daten');
  if (!daten) return { error: 'Daten-Tab fehlt' };

  const data = daten.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => { idx[String(h).trim()] = i; });

  const parzellen = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][idx['ParzID']]) continue;
    parzellen.push({
      parzId: String(data[i][idx['ParzID']]),
      block: String(data[i][idx['Block']]),
      reihe: String(data[i][idx['Reihe']]),
      spalte: Number(data[i][idx['Spalte']]),
      treatment: String(data[i][idx['Treatment']]),
      az1_datum: formatCell(data[i][idx['AZ1_Datum']]),
      az1_zahl: data[i][idx['AZ1_Zahl']],
      az1_benutzer: String(data[i][idx['AZ1_Benutzer']] || ''),
      az1_notiz: String(data[i][idx['AZ1_Notiz']] || ''),
      az2_datum: formatCell(data[i][idx['AZ2_Datum']]),
      az2_zahl: data[i][idx['AZ2_Zahl']],
      az2_benutzer: String(data[i][idx['AZ2_Benutzer']] || ''),
      az2_notiz: String(data[i][idx['AZ2_Notiz']] || ''),
      foto_az1: String(data[i][idx['Foto_AZ1']] || ''),
      foto_az2: String(data[i][idx['Foto_AZ2']] || '')
    });
  }

  return {
    parzellen,
    treatments: FIELD_TREATMENTS,
    sheet_id: sheet.getId(),
    folder_id: folder.getId(),
    samen_pro_parzelle: 100
  };
}

function fieldTrackerSaveParzelle(body) {
  // body: { parzId, az, zahl, datum, benutzer, notiz }
  const { sheet } = fieldGetOrCreateSheet();
  const daten = sheet.getSheetByName('Daten');
  const data = daten.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => { idx[String(h).trim()] = i; });

  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idx['ParzID']]) === String(body.parzId)) {
      rowIdx = i + 1; break;
    }
  }
  if (rowIdx < 0) throw new Error('Parzelle nicht gefunden: ' + body.parzId);

  const az = Number(body.az);
  if (az !== 1 && az !== 2) throw new Error('AZ muss 1 oder 2 sein.');

  const zahlCol = idx['AZ' + az + '_Zahl'] + 1;
  const datumCol = idx['AZ' + az + '_Datum'] + 1;
  const benutzerCol = idx['AZ' + az + '_Benutzer'] + 1;
  const notizCol = idx['AZ' + az + '_Notiz'] + 1;

  if (body.zahl === null || body.zahl === undefined || body.zahl === '') {
    daten.getRange(rowIdx, zahlCol).clearContent();
  } else {
    daten.getRange(rowIdx, zahlCol).setValue(Number(body.zahl));
  }
  if (body.datum) daten.getRange(rowIdx, datumCol).setValue(body.datum);
  if (body.benutzer) daten.getRange(rowIdx, benutzerCol).setValue(body.benutzer);
  if (body.notiz !== undefined) daten.getRange(rowIdx, notizCol).setValue(body.notiz);

  SpreadsheetApp.flush();
  return { ok: true, parzId: body.parzId, az };
}

function fieldTrackerUploadFoto(body) {
  // body: { parzId, az, imageBase64, mimeType, datum }
  const { sheet, folder } = fieldGetOrCreateSheet();
  const fotosFolder = getOrCreateSubfolder(folder, 'Fotos');

  const datum = body.datum || Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  const baseName = '26_001_' + body.parzId + '_AZ' + body.az + '_' + datum;
  const mime = body.mimeType || 'image/jpeg';
  const ext = mime.indexOf('png') >= 0 ? 'png' : 'jpg';

  let fileName = baseName + '.' + ext;
  let version = 1;
  while (fotosFolder.getFilesByName(fileName).hasNext()) {
    version++;
    fileName = baseName + '_v' + version + '.' + ext;
  }

  const blob = Utilities.newBlob(Utilities.base64Decode(body.imageBase64), mime, fileName);
  const file = fotosFolder.createFile(blob);
  const url = file.getUrl();

  // Ins Sheet eintragen
  const daten = sheet.getSheetByName('Daten');
  const data = daten.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => { idx[String(h).trim()] = i; });
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idx['ParzID']]) === String(body.parzId)) {
      rowIdx = i + 1; break;
    }
  }
  if (rowIdx < 0) throw new Error('Parzelle nicht gefunden: ' + body.parzId);

  const fotoCol = idx['Foto_AZ' + body.az] + 1;
  daten.getRange(rowIdx, fotoCol).setValue(url);

  SpreadsheetApp.flush();
  return { ok: true, url, fileName };
}

// ================================================================
// PHASE 2.1 MIGRATIONS-HELPER
// ================================================================
/**
 * Fuegt einer Versuchs-Daten-Sheet die Spalte "Tray" hinzu (falls noch nicht vorhanden)
 * und befuellt sie basierend auf der Wdh-Nummer und der gewuenschten Tray-Anzahl.
 *
 * Logik:
 *   - Bei anzahl_trays = 2 und ehemaligem raster_rows = 12:
 *     Wdh 1-6 -> Tray 1, Wdh 1-6 (unveraendert);
 *     Wdh 7-12 -> Tray 2, Wdh 1-6 (Wdh wird um 6 reduziert)
 *
 * Zusaetzlich wird im Index raster_rows korrigiert (z.B. 12 -> 6).
 *
 * Nutzung: migrateExistingTrayData('26_025', 2)
 */
function migrateExistingTrayData(versuchsnr, anzahlTrays) {
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(versuchsnr));
  if (!v) throw new Error('Versuch nicht gefunden: ' + versuchsnr);
  if (!v.sheet_file_id) throw new Error('Kein Sheet_File_ID fuer ' + versuchsnr);

  // Index-Updates: Anzahl_Trays setzen, raster_rows ggf. teilen
  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const cIdx = {};
  headers.forEach((h, i) => { cIdx[String(h).trim()] = i; });
  let indexRow = -1;
  let alteRows = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cIdx[INDEX_COLS.versuchsnr]]) === String(versuchsnr)) {
      indexRow = i + 1;
      alteRows = Number(data[i][cIdx[INDEX_COLS.raster_rows]] || 0);
      break;
    }
  }
  if (indexRow < 0) throw new Error('Versuch nicht im Index: ' + versuchsnr);

  // Anzahl_Trays setzen (falls Spalte vorhanden, sonst Fehler)
  if (cIdx[INDEX_COLS.anzahl_trays] === undefined) {
    throw new Error('Spalte "Anzahl_Trays" fehlt im Index. Bitte zuerst manuell einfuegen.');
  }
  indexSheet.getRange(indexRow, cIdx[INDEX_COLS.anzahl_trays] + 1).setValue(anzahlTrays);

  // raster_rows korrigieren falls notwendig
  if (alteRows && alteRows % anzahlTrays === 0) {
    const neueRows = alteRows / anzahlTrays;
    indexSheet.getRange(indexRow, cIdx[INDEX_COLS.raster_rows] + 1).setValue(neueRows);
  }

  // Daten-Sheet: Tray-Spalte einfuegen + befuellen
  const ss = SpreadsheetApp.openById(v.sheet_file_id);
  const sheet = ss.getSheetByName('Daten');
  if (!sheet) throw new Error('Daten-Tab fehlt');

  const sheetData = sheet.getDataRange().getValues();
  const sheetHeaders = sheetData[0];
  const sheetCIdx = {};
  sheetHeaders.forEach((h, i) => { sheetCIdx[String(h).trim()] = i; });

  // Tray-Spalte vorhanden?
  if (sheetCIdx['Tray'] === undefined) {
    // Tray-Spalte direkt nach Wdh einfuegen
    const wdhCol = sheetCIdx['Wdh'];
    if (wdhCol === undefined) throw new Error('Wdh-Spalte fehlt');
    sheet.insertColumnAfter(wdhCol + 1);
    sheet.getRange(1, wdhCol + 2).setValue('Tray')
      .setFontWeight('bold').setBackground('#2d4a23').setFontColor('#f4f0e6');
  }

  // Neu lesen (weil Spalten verschoben wurden)
  const sd2 = sheet.getDataRange().getValues();
  const sh2 = sd2[0];
  const cIdx2 = {};
  sh2.forEach((h, i) => { cIdx2[String(h).trim()] = i; });

  const wdhPerTray = alteRows / anzahlTrays;
  let wdhCol = cIdx2['Wdh'];
  let trayCol = cIdx2['Tray'];

  for (let i = 1; i < sd2.length; i++) {
    const oldWdh = Number(sd2[i][wdhCol] || 0);
    if (!oldWdh) continue;
    const tray = Math.floor((oldWdh - 1) / wdhPerTray) + 1;
    const newWdh = ((oldWdh - 1) % wdhPerTray) + 1;
    sheet.getRange(i + 1, trayCol + 1).setValue(tray);
    sheet.getRange(i + 1, wdhCol + 1).setValue(newWdh);
  }

  SpreadsheetApp.flush();
  return { ok: true, versuchsnr, anzahlTrays, wdhPerTray, neueRasterRows: wdhPerTray };
}

/**
 * Fuegt einer noch nicht migrierten Versuchs-Daten-Sheet die Tray-Spalte hinzu
 * mit Default-Wert 1 (1-Tray-Versuch). Idempotent.
 */
function ensureTrayColumn(versuchsnr) {
  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(versuchsnr));
  if (!v || !v.sheet_file_id) return { skipped: true };

  const ss = SpreadsheetApp.openById(v.sheet_file_id);
  const sheet = ss.getSheetByName('Daten');
  if (!sheet) return { error: 'kein Daten-Tab' };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const cIdx = {};
  headers.forEach((h, i) => { cIdx[String(h).trim()] = i; });

  if (cIdx['Tray'] !== undefined) return { skipped: true, reason: 'Tray-Spalte vorhanden' };

  const wdhCol = cIdx['Wdh'];
  if (wdhCol === undefined) return { error: 'Wdh-Spalte fehlt' };
  sheet.insertColumnAfter(wdhCol + 1);
  sheet.getRange(1, wdhCol + 2).setValue('Tray')
    .setFontWeight('bold').setBackground('#2d4a23').setFontColor('#f4f0e6');

  // Alle bestehenden Zeilen mit 1 befuellen
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const trayValues = [];
    for (let i = 0; i < lastRow - 1; i++) trayValues.push([1]);
    sheet.getRange(2, wdhCol + 2, lastRow - 1, 1).setValues(trayValues);
  }
  SpreadsheetApp.flush();
  return { ok: true, versuchsnr };
}

/**
 * Fuegt allen aktiven Versuchen (mit Sheet) eine Tray-Spalte hinzu.
 * Versuche mit mehreren Trays muessen separat migriert werden via migrateExistingTrayData().
 */
function ensureTrayColumnForAll() {
  const all = readIndex();
  const results = [];
  all.forEach(v => {
    if (!v.sheet_file_id) { results.push({ versuchsnr: v.versuchsnr, skipped: true, reason: 'kein Sheet' }); return; }
    try {
      results.push(Object.assign({ versuchsnr: v.versuchsnr }, ensureTrayColumn(v.versuchsnr)));
    } catch (e) {
      results.push({ versuchsnr: v.versuchsnr, error: String(e) });
    }
  });
  Logger.log('===== ensureTrayColumnForAll =====');
  results.forEach(r => Logger.log(JSON.stringify(r)));
  return results;
}
