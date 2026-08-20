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

// Asana-Custom-Field-GID fuer die Protokoll-URL (verlinktes Google-Doc mit
// dem <<<KFK-DATA ... KFK-DATA>>> Block). Optional: Leer lassen ('') aktiviert
// den Fallback, der die erste docs.google.com/document-URL aus den Task-Notizen
// verwendet. GID setzen, falls ein eigenes Custom-Field genutzt wird.
const PROTOKOLL_URL_FIELD_GID = '';

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
  mdd_pp: 'MDD_PP',
  saatgutcharge: 'Saatgutcharge',
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
  az_geplant: 'AZ_geplant',
  standorte_json: 'Standorte_JSON',
  standort_historie_json: 'StandorteHistorie_JSON',
  // Aussaat/Aktivierung + Chargen-IDs (siehe CLAUDE.md "Aussaat vs. Aktivierung"
  // / "Chargen-IDs"). Start_Datum bleibt physisch bestehen und wird im
  // readIndex() als aktivierung_datum-Alias ausgeliefert - keine Sheet-Migration
  // noetig, da Alt-Zeilen dort bereits genau den richtigen Wert stehen haben.
  aussaat_datum: 'Aussaat_Datum',
  charge_kfk_potenzial: 'Charge_KFK_Potenzial',
  substrat_json: 'Substrat_JSON',
  az_termine_json: 'AZ_Termine_JSON',
  ruhephase_bestaetigt: 'Ruhephase_Bestaetigt'
};

// Schema-Version des Versuchsobjekts (Index-Zeile). v2 = Standorterfassung
// (Regal/Boden je Tray, siehe standorte/standortHistorie) hinzugekommen.
const VERSUCH_SCHEMA_VERSION = 2;

// Spaltenname der Sieb-Dickenklasse je Topf (SOP: Pellets werden vor jedem
// Versuch gesiebt, die Dickenklasse wird je Topf notiert und in der Auswertung
// als Kovariate gefuehrt). Bewusst Freitext (z.B. "2,0-2,5 mm") - die
// Siebgroessen wechseln je angestrebter Schichtdicke, ein Enum waere zu eng.
const DICKENKLASSE_COL = 'Dickenklasse';

// Legt die Dickenklasse-Spalte in einem Daten-Sheet nachtraeglich an, falls sie
// fehlt (Altbestand). Liefert den 0-basierten Spaltenindex zurueck, oder -1 wenn
// das Sheet keine Kopfzeile hat. Analog ensureTrayColumnForAll().
function ensureDickenklasseColumn_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return -1;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === DICKENKLASSE_COL) return i;
  }
  sheet.getRange(1, lastCol + 1).setValue(DICKENKLASSE_COL).setFontWeight('bold');
  return lastCol;
}

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
      case 'importFromDoc':
        return json(importVersuchFromDoc(e.parameter.asana_task_gid));
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

    // Jeder schreibende Call invalidiert sofort den kurzlebigen get-Cache
    // fuer diesen Versuch (siehe getVersuch/VERSUCH_CACHE_TTL_SEC).
    if (body.versuchsnr) invalidateVersuchCache_(body.versuchsnr);

    switch (action) {
      case 'saveTopf':
        return json(saveTopf(body));
      case 'saveStandort':
        return json(saveStandort(body));
      case 'updateChargenFelder':
        return json(updateChargenFelder(body));
      case 'updateTreatmentPellet':
        return json(updateTreatmentPellet(body));
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
      case 'archiveVersuch':
        return json(archiveVersuch(body));
      case 'deleteVersuch':
        return json(deleteVersuch(body));
      case 'createVersuch':
        return json(createVersuchInIndex(body));
      case 'field_saveParzelle':
        return json(fieldTrackerSaveParzelle(body));
      case 'field_uploadFoto':
        return json(fieldTrackerUploadFoto(body));
      case 'importRbd':
        return json(importRbdFromAsana(body.versuchsnr));
      case 'importRbdDoc':
        return json(importRbdFromDoc(body.versuchsnr));
      case 'importRbdRaw':
        return json(importRbdRaw(body));
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

// Ergaenzt fehlende Tray-Eintraege in v.standorte verlustfrei (regal/boden =
// null), behaelt vorhandene Eintraege unveraendert. Logik ist bewusst
// identisch zu migrateVersuchStandorte() in js/standorte.js (Frontend) -
// Apps-Script-.gs-Dateien koennen dieses Browser-Modul nicht importieren,
// daher die Duplikation; bei Aenderungen an einer Stelle die andere pruefen.
function migrateVersuchStandorte_(v) {
  const anzahlTrays = Math.max(1, Number((v && v.anzahl_trays) || 1));
  const vorhanden = (v && Array.isArray(v.standorte)) ? v.standorte : [];
  const byTray = {};
  vorhanden.forEach(function (s) {
    if (s && s.tray != null) {
      byTray[Number(s.tray)] = {
        tray: Number(s.tray),
        regal: s.regal == null ? null : Number(s.regal),
        boden: s.boden == null ? null : Number(s.boden),
        erfasstAm: s.erfasstAm || null
      };
    }
  });
  const result = [];
  for (let tray = 1; tray <= anzahlTrays; tray++) {
    result.push(byTray[tray] || { tray: tray, regal: null, boden: null, erfasstAm: null });
  }
  return result;
}

// Twin von missingAbschlussFields() in js/chargen.js (Punkt 7) - serverseitige
// Absicherung fuer markVersuchAbgeschlossen(). Siehe Kommentar bei
// migrateVersuchStandorte_ zur Duplikation Frontend/Backend.
const ABSCHLUSS_PFLICHTFELDER_ = [
  { feld: 'saatgutcharge_id', label: 'Saatgutcharge-ID' },
  { feld: 'charge_kfk_potenzial', label: 'Potenzial-KFK der Charge', istLeer: function (v) { return !v.charge_kfk_potenzial; } },
  { feld: 'substratcharge_id', label: 'Substratcharge-ID' },
  { feld: 'substrat_verhaeltnis', label: 'Substrat-Verhältnis' },
  { feld: 'aktivierung_datum', label: 'Aktivierungs-Datum' },
  { feld: 'ruhephase_bestaetigt', label: 'Ruhephase bestätigt', istLeer: function (v) { return !v.ruhephase_bestaetigt; } }
];
function missingAbschlussFelder_(v, treatments) {
  const basis = v || {};
  const fehlend = ABSCHLUSS_PFLICHTFELDER_.filter(function (def) {
    return def.istLeer ? def.istLeer(basis) : (basis[def.feld] === '' || basis[def.feld] == null);
  }).slice();
  (treatments || []).forEach(function (t) {
    if (t && !t.nackte_saat && (t.pelletcharge_id === '' || t.pelletcharge_id == null)) {
      fehlend.push({ feld: 'pelletcharge_id', label: 'Pelletcharge-ID (' + (t.code || '?') + ')', treatmentCode: t.code });
    }
  });
  return fehlend;
}

// Twin von recordStandortChange() in js/standorte.js: alter Wert wandert
// unveraendert in die Historie, neuer Wert ersetzt standorte[tray]. Siehe
// Kommentar bei migrateVersuchStandorte_ zur Duplikation Frontend/Backend.
function recordStandortChange_(v, tray, neu, az, isoDatum) {
  const standorte = migrateVersuchStandorte_(v);
  const historie = (v && Array.isArray(v.standortHistorie)) ? v.standortHistorie.slice() : [];
  const idx = standorte.findIndex(function (s) { return Number(s.tray) === Number(tray); });
  const alt = idx >= 0 ? standorte[idx] : { tray: Number(tray), regal: null, boden: null, erfasstAm: null };

  historie.push({
    tray: Number(tray),
    regal: alt.regal,
    boden: alt.boden,
    erfasstAm: alt.erfasstAm,
    geaendertAm: isoDatum,
    az: az
  });

  const aktualisiert = {
    tray: Number(tray),
    regal: neu.regal == null ? null : Number(neu.regal),
    boden: neu.boden == null ? null : Number(neu.boden),
    erfasstAm: isoDatum
  };
  if (idx >= 0) standorte[idx] = aktualisiert;
  else standorte.push(aktualisiert);

  return { standorte: standorte, standortHistorie: historie };
}

// Speichert Regal/Boden fuer einen Tray im Index (Spalten Standorte_JSON /
// StandorteHistorie_JSON). "unveraendert" (Ja-Bestaetigung, siehe CLAUDE.md
// Punkt 3) loest KEINEN Call hierher aus - nur echte Aenderungen.
function saveStandort(body) {
  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = {};
  headers.forEach(function (h, i) { colIdx[String(h).trim()] = i; });

  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx[INDEX_COLS.versuchsnr]]) === String(body.versuchsnr)) { rowIdx = i + 1; break; }
  }
  if (rowIdx < 0) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);

  const all = readIndex();
  const v = all.find(function (x) { return String(x.versuchsnr) === String(body.versuchsnr); });
  if (!v) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);

  const isoDatum = body.isoDatum || Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  const result = recordStandortChange_(v, body.tray, { regal: body.regal, boden: body.boden }, body.az, isoDatum);

  indexSheet.getRange(rowIdx, colIdx[INDEX_COLS.standorte_json] + 1).setValue(JSON.stringify(result.standorte));
  indexSheet.getRange(rowIdx, colIdx[INDEX_COLS.standort_historie_json] + 1).setValue(JSON.stringify(result.standortHistorie));
  SpreadsheetApp.flush();

  return { ok: true, standorte: result.standorte, standortHistorie: result.standortHistorie };
}

// Speichert die Chargen-/Aussaat-Aktivierung-Felder auf Versuchsebene (siehe
// CLAUDE.md "Aussaat vs. Aktivierung" / "Chargen-IDs"). Nur mitgelieferte
// Felder werden angefasst - Object.assign auf den vorhandenen Substrat-Block,
// damit ein Teil-Update (z.B. nur EC nachtragen) den Rest nicht loescht.
function updateChargenFelder(body) {
  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = {};
  headers.forEach(function (h, i) { colIdx[String(h).trim()] = i; });

  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx[INDEX_COLS.versuchsnr]]) === String(body.versuchsnr)) { rowIdx = i + 1; break; }
  }
  if (rowIdx < 0) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);

  const all = readIndex();
  const v = all.find(function (x) { return String(x.versuchsnr) === String(body.versuchsnr); });
  if (!v) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);

  function setIfPresent(colKey, val) {
    const colName = INDEX_COLS[colKey];
    if (colIdx[colName] === undefined) return;
    indexSheet.getRange(rowIdx, colIdx[colName] + 1).setValue(val);
  }

  if (body.aktivierung_datum !== undefined) setIfPresent('start_datum', body.aktivierung_datum);
  if (body.aussaat_datum !== undefined) setIfPresent('aussaat_datum', body.aussaat_datum);
  if (body.ruhephase_bestaetigt !== undefined) setIfPresent('ruhephase_bestaetigt', !!body.ruhephase_bestaetigt);
  if (body.saatgutcharge_id !== undefined) setIfPresent('saatgutcharge', body.saatgutcharge_id);
  if (body.charge_kfk_potenzial !== undefined) setIfPresent('charge_kfk_potenzial', body.charge_kfk_potenzial);

  const SUBSTRAT_KEYS = ['substratcharge_id', 'substrat_basis', 'substrat_zuschlag', 'substrat_verhaeltnis',
    'substrat_lieferant_lot', 'substrat_ec', 'substrat_ph', 'substrat_anmerkung', 'substrat_gemischt_von'];
  const hatSubstratFeld = SUBSTRAT_KEYS.some(function (k) { return body[k] !== undefined; });
  if (hatSubstratFeld) {
    const bisher = {};
    SUBSTRAT_KEYS.forEach(function (k) { bisher[k] = v[k] || ''; });
    SUBSTRAT_KEYS.forEach(function (k) { if (body[k] !== undefined) bisher[k] = body[k]; });
    setIfPresent('substrat_json', JSON.stringify(bisher));
  }

  if (Array.isArray(body.az_termine)) setIfPresent('az_termine_json', JSON.stringify(body.az_termine));

  SpreadsheetApp.flush();
  return { ok: true, versuchsnr: body.versuchsnr };
}

// Aktualisiert die Pelletierungs-/Anker-Felder eines einzelnen Treatments
// innerhalb von Treatments_JSON (siehe CLAUDE.md "Chargen-IDs"). Nur das
// Treatment mit passendem code wird veraendert, alle anderen bleiben
// unangetastet.
function updateTreatmentPellet(body) {
  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = {};
  headers.forEach(function (h, i) { colIdx[String(h).trim()] = i; });

  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx[INDEX_COLS.versuchsnr]]) === String(body.versuchsnr)) { rowIdx = i + 1; break; }
  }
  if (rowIdx < 0) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);

  const all = readIndex();
  const v = all.find(function (x) { return String(x.versuchsnr) === String(body.versuchsnr); });
  if (!v) throw new Error('Versuch nicht gefunden: ' + body.versuchsnr);
  const treatments = Array.isArray(v.treatments) ? v.treatments : [];
  const idx = treatments.findIndex(function (t) { return t && String(t.code) === String(body.code); });
  if (idx < 0) throw new Error('Treatment nicht gefunden: ' + body.code);

  const PELLET_KEYS = ['pelletcharge_id', 'matrixzusammensetzung', 'schichtdicke',
    'pelletiert_von', 'pelletier_datum', 'pelletier_anmerkung', 'anker', 'nackte_saat'];
  const updated = Object.assign({}, treatments[idx]);
  PELLET_KEYS.forEach(function (k) { if (body[k] !== undefined) updated[k] = body[k]; });
  treatments[idx] = updated;

  indexSheet.getRange(rowIdx, colIdx[INDEX_COLS.treatments_json] + 1).setValue(JSON.stringify(treatments));
  SpreadsheetApp.flush();
  return { ok: true, versuchsnr: body.versuchsnr, treatment: updated };
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
    if (v.aussaat_datum instanceof Date) {
      v.aussaat_datum = Utilities.formatDate(v.aussaat_datum, TIMEZONE, 'yyyy-MM-dd');
    } else {
      v.aussaat_datum = String(v.aussaat_datum || '');
    }
    // Aktivierung/Saatgutcharge-ID (siehe CLAUDE.md "Aussaat vs. Aktivierung" /
    // "Chargen-IDs"): beide Spalten bleiben physisch unveraendert
    // (Start_Datum/Saatgutcharge), die neuen Namen sind reine Alias-Ausgaben -
    // Alt-Zeilen liefern hier automatisch den bisherigen Wert.
    v.aktivierung_datum = v.start_datum;
    v.saatgutcharge_id = v.saatgutcharge || '';
    // Chargen-Konsolidierung (15.08.2026, Entscheidung Simon): Posten_Nr und
    // Saatgutcharge sind DIESELBE Groesse - bei Gehoelzen die amtliche
    // Postennummer, bei Hanf/Weizen eine eigene Kennung. Es gibt ab jetzt nur
    // noch EIN Feld (saatgutcharge_id). Die physische Spalte Posten_Nr bleibt
    // fuer Alt-Zeilen bestehen und wird nur noch gelesen, nie mehr getrennt
    // geschrieben; posten_nr wird als reiner Alias ausgeliefert.
    if (!v.saatgutcharge_id && v.posten_nr) v.saatgutcharge_id = String(v.posten_nr);
    v.posten_nr = v.saatgutcharge_id;
    v.ruhephase_bestaetigt = !!v.ruhephase_bestaetigt;

    // Substrat-Block + AZ-Termine parsen (JSON-Buendel analog Treatments_JSON).
    // Leere Defaults zuerst setzen, damit fehlende/kaputte Substrat_JSON nie
    // zu undefined-Feldern fuehrt (missingImportFields/missingAbschlussFields
    // pruefen auf '' bzw. null).
    Object.assign(v, {
      substratcharge_id: '', substrat_basis: '', substrat_zuschlag: '',
      substrat_verhaeltnis: '', substrat_lieferant_lot: '', substrat_ec: '',
      substrat_ph: '', substrat_anmerkung: '', substrat_gemischt_von: ''
    });
    try {
      if (v.substrat_json) Object.assign(v, JSON.parse(v.substrat_json));
    } catch (e) { /* fehlerhaftes JSON bleibt bei den leeren Defaults */ }
    delete v.substrat_json;
    try {
      v.az_termine = v.az_termine_json ? JSON.parse(v.az_termine_json) : [];
    } catch (e) {
      v.az_termine = [];
    }
    delete v.az_termine_json;

    // Treatments parsen
    try {
      v.treatments = v.treatments_json ? JSON.parse(v.treatments_json) : [];
    } catch (e) {
      v.treatments = [];
    }
    delete v.treatments_json;

    // Standorte parsen + Migration: Altbestand ohne Standorte_JSON-Spalte
    // (oder mit leerer Zelle) wird verlustfrei auf regal/boden = null je Tray
    // hochgezogen, siehe migrateVersuchStandorte_.
    try {
      v.standorte = v.standorte_json ? JSON.parse(v.standorte_json) : [];
    } catch (e) {
      v.standorte = [];
    }
    delete v.standorte_json;
    try {
      v.standortHistorie = v.standort_historie_json ? JSON.parse(v.standort_historie_json) : [];
    } catch (e) {
      v.standortHistorie = [];
    }
    delete v.standort_historie_json;
    v.standorte = migrateVersuchStandorte_(v);

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

// Kurzes Caching: readDaten() oeffnet per SpreadsheetApp.openById() ein fremdes
// Sheet - das ist der dominante Latenz-Faktor bei 'get' (mehrfache Sekunden bei
// ungluecklichem Timing). Ein kurzlebiger Cache reduziert wiederholte Reads
// (Polling, mehrere Tabs) fast auf 0, ohne echte Frische zu verlieren: jeder
// schreibende POST-Call invalidiert den Eintrag sofort (siehe doPost).
const VERSUCH_CACHE_TTL_SEC = 8;

function versuchCacheKey_(versuchsnr) {
  return 'getVersuch_' + versuchsnr;
}
function invalidateVersuchCache_(versuchsnr) {
  if (!versuchsnr) return;
  try { CacheService.getScriptCache().remove(versuchCacheKey_(versuchsnr)); } catch (e) {}
}

function getVersuch(versuchsnr) {
  const cache = CacheService.getScriptCache();
  const cacheKey = versuchCacheKey_(versuchsnr);
  try {
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {}

  const all = readIndex();
  const v = all.find(x => String(x.versuchsnr) === String(versuchsnr));
  if (!v) return { error: 'Versuch nicht gefunden: ' + versuchsnr };

  const daten = readDaten(v);
  const fortschritt = getFortschritt(v, daten);
  const result = { versuch: v, daten, fortschritt };

  try { cache.put(cacheKey, JSON.stringify(result), VERSUCH_CACHE_TTL_SEC); } catch (e) {}
  return result;
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
    // Sieb-Dickenklasse je Topf (Kovariate). Altbestand ohne die Spalte liefert
    // '' - kein Raten, der CSV-Export laesst die Zelle dann leer.
    entry.dickenklasse = colIdx[DICKENKLASSE_COL] !== undefined
      ? String(row[colIdx[DICKENKLASSE_COL]] || '')
      : '';

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

  // Dickenklasse (Sieb) je Topf - unabhaengig von der AZ-Runde, wird nur
  // geschrieben wenn das Feld ueberhaupt mitgeschickt wurde (undefined =
  // unveraendert lassen, '' = bewusst leeren). Spalte wird bei Altbestand
  // nachtraeglich angelegt.
  if (body.dickenklasse !== undefined) {
    const dkIdx = ensureDickenklasseColumn_(sheet);
    if (dkIdx >= 0) {
      const cell = sheet.getRange(rowIdx, dkIdx + 1);
      if (body.dickenklasse === null || body.dickenklasse === '') cell.clearContent();
      else cell.setValue(String(body.dickenklasse));
    }
  }

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

  // Auswertung-Tab nachziehen: seit v1.8.3 haengt die Anzahl der
  // Kumulativ-Bloecke an az_geplant, der Tab waere sonst still veraltet.
  // Darf den AZ-Wechsel nicht scheitern lassen (z.B. Versuch ohne Treatments).
  let auswertungResult = { info: 'nicht neu aufgebaut' };
  try {
    auswertungResult = rebuildAuswertungTab(body.versuchsnr);
  } catch (e) {
    auswertungResult = { fehler: String(e.message || e) };
  }

  // Asana-Subtasks anpassen
  let asanaResult = { info: 'keine Asana-Verbindung' };
  if (asanaGid && ASANA_PAT && !ASANA_PAT.startsWith('__')) {
    asanaResult = syncAsanaAZSubtasks(asanaGid, neueAnzahl, aktuell);
  }

  return { ok: true, versuchsnr: body.versuchsnr, neueAnzahl, vorher: aktuell, asana: asanaResult, auswertung: auswertungResult };
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
 * Schnelles Archivieren direkt aus der Uebersicht: setzt nur den Status auf
 * "Archiviert" (kein Statistik-Post, keine Asana-Aenderung). Fuer den
 * vollstaendigen Abschluss inkl. Auswertung siehe markVersuchAbgeschlossen().
 * body: { versuchsnr }
 */
function archiveVersuch(body) {
  if (!body || !body.versuchsnr) return { error: 'versuchsnr fehlt' };

  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const cIdx = {};
  headers.forEach((h, i) => { cIdx[String(h).trim()] = i; });

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cIdx[INDEX_COLS.versuchsnr]]) === String(body.versuchsnr)) {
      indexSheet.getRange(i + 1, cIdx[INDEX_COLS.status] + 1).setValue('Archiviert');
      SpreadsheetApp.flush();
      return { ok: true, versuchsnr: body.versuchsnr, status: 'Archiviert' };
    }
  }
  return { error: 'Versuch nicht gefunden: ' + body.versuchsnr };
}

/**
 * Loescht einen Versuch aus dem Index.
 *
 * BEWUSST NUR die Index-Zeile: Daten-Sheet und Drive-Ordner des Versuchs
 * bleiben erhalten (CLAUDE.md-Regel "Backups/Daten niemals automatisch
 * loeschen"). Der Versuch verschwindet damit aus Tracker UND Index; die
 * Rohdaten sind ueber die zurueckgegebenen IDs weiterhin in Drive auffindbar.
 * Der Asana-Task bleibt ebenfalls unangetastet.
 *
 * body: { versuchsnr }
 */
function deleteVersuch(body) {
  if (!body || !body.versuchsnr) return { error: 'versuchsnr fehlt' };

  const indexSheet = getIndexSheet();
  const data = indexSheet.getDataRange().getValues();
  const headers = data[0];
  const cIdx = {};
  headers.forEach((h, i) => { cIdx[String(h).trim()] = i; });

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cIdx[INDEX_COLS.versuchsnr]]) === String(body.versuchsnr)) {
      const sheetFileId = String(data[i][cIdx[INDEX_COLS.sheet_file_id]] || '');
      const folderId    = String(data[i][cIdx[INDEX_COLS.folder_id]] || '');
      const titel       = String(data[i][cIdx[INDEX_COLS.titel]] || '');
      indexSheet.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return {
        ok: true,
        versuchsnr: body.versuchsnr,
        titel: titel,
        sheet_file_id: sheetFileId,
        folder_id: folderId,
        info: 'Index-Zeile entfernt. Daten-Sheet und Drive-Ordner bleiben erhalten.'
      };
    }
  }
  return { error: 'Versuch nicht gefunden: ' + body.versuchsnr };
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

// Baut den vollstaendigen Auswertungsbericht (Kontext-Header + Client-Trend/
// Bemerkung + Statistik/ANOVA) als ein <body>...</body>-HTML-Fragment.
// Ausgelagert aus markVersuchAbgeschlossen, damit testAuswertungsBericht()
// denselben Bericht ohne jede Seiteneffekte (kein Asana, kein Status-Wechsel)
// erzeugen und im Ausfuehrungsprotokoll pruefen kann.
function buildVersuchsberichtHtml_(v, clientFinalKommentarHtml) {
  let statistikHtml = '';
  let rohdatenHtml = '';
  try {
    if (v && v.sheet_file_id) {
      const daten = readDaten(v);
      statistikHtml = buildStatistikHtml(v, daten);
      rohdatenHtml = buildRohdatenHtml_(v, daten);
    }
  } catch (e) {
    Logger.log('Statistik-Fehler: ' + e);
    statistikHtml = '<br><em>Statistik-Berechnung fehlgeschlagen: ' + String(e) + '</em>';
  }

  // Kontext-Header, damit der Bericht auch ohne Tracker-Zugriff verstaendlich ist
  // (z.B. wenn man Claude nur den Asana-Task-Link gibt und "werte das aus" sagt).
  let headerHtml = '';
  if (v) {
    const treatLegend = (v.treatments || [])
      .map(t => escHtml_(t.code) + ' = ' + escHtml_(t.label || ''))
      .join('<br>');
    headerHtml =
      '<strong>📋 ' + escHtml_(v.versuchsnr) + ' · ' + escHtml_(v.titel || '') + '</strong><br>' +
      (v.baumart_lat || v.baumart_kurz
        ? 'Art: ' + escHtml_(v.baumart_lat || '') + (v.baumart_kurz ? ' (' + escHtml_(v.baumart_kurz) + ')' : '') + '<br>'
        : '') +
      (v.hypothese ? 'Hypothese: ' + escHtml_(v.hypothese) + '<br>' : '') +
      'Design: ' + (v.anzahl_trays || 1) + ' Tray(s) · ' + (v.raster_cols || 4) + '×' + (v.raster_rows || 6) +
      ' Raster · ' + (v.samen_pro_topf || 36) + ' Samen/Topf<br>' +
      (v.aussaat_datum || v.aktivierung_datum
        ? 'Aussaat: ' + escHtml_(v.aussaat_datum || '—') + ' · Aktivierung: ' + escHtml_(v.aktivierung_datum || '—') + '<br>'
        : '') +
      (v.saatgutcharge_id || v.charge_kfk_potenzial
        ? 'Saatgutcharge: ' + escHtml_(v.saatgutcharge_id || '—') +
          (v.charge_kfk_potenzial ? ' (Potenzial-KFK ' + escHtml_(v.charge_kfk_potenzial) + '%)' : '') + '<br>'
        : '') +
      (v.substratcharge_id ? 'Substratcharge: ' + escHtml_(v.substratcharge_id) + '<br>' : '') +
      (treatLegend ? 'Treatments:<br>' + treatLegend + '<br>' : '') + '<br>';
  }

  // Client-Kommentar (Trend + Bemerkung) von aussenliegenden <body>-Tags befreien,
  // damit Header + Kommentar + Statistik zu einem einzigen validen Block werden.
  const clientHtml = String(clientFinalKommentarHtml || '')
    .replace(/^\s*<body>/i, '')
    .replace(/<\/body>\s*$/i, '');
  return '<body>' + headerHtml + clientHtml + statistikHtml + rohdatenHtml + '</body>';
}

// Numerische Zelle? (leer / '' / null / Text zaehlen nicht als Messwert)
function isMesswert_(x) {
  return x !== '' && x != null && x !== undefined && !isNaN(Number(x));
}

// Kumulative Keimzahl eines Topfes bis (inkl.) Runde az: Summe(AZ1..az), da je
// AZ nur die NEU seit der letzten Auszaehlung gekeimten Samen erfasst werden
// (Keimlinge werden danach gezogen). '' wenn bis dahin noch gar kein Wert
// erfasst wurde - unterscheidet "0 gekeimt" von "noch nicht gezaehlt".
function cumulativeAZValue_(d, az) {
  let sum = 0, any = false;
  for (let a = 1; a <= az; a++) {
    if (isMesswert_(d['az' + a + '_zahl'])) { sum += Number(d['az' + a + '_zahl']); any = true; }
  }
  return any ? sum : '';
}

/**
 * Baut den maschinenlesbaren Rohdaten-Block fuer den Asana-Abschlussbericht.
 *
 * ZWECK: Der Asana-Post soll fuer eine vollstaendige Auswertung ausreichen —
 * ohne Zugriff auf Tracker, Index oder Daten-Sheet. Deshalb stehen hier neben
 * den Metadaten ALLE Einzelwerte pro Topf und AZ (nicht nur die Mittelwerte
 * aus buildStatistikHtml), dazu AZ-Datum, Foto-Links und die Cloud-Links.
 *
 * Format: CSV in einem <pre>-Block, umschlossen von den Markern
 * <<<KFK-RESULTS ... KFK-RESULTS>>> (analog zum <<<KFK-DATA-Block des
 * Protokoll-Docs), damit der Block eindeutig gefunden und geparst werden kann.
 */
function buildRohdatenHtml_(v, daten) {
  if (!v || !daten || daten.length === 0) return '';

  const samen = Number(v.samen_pro_topf || 36);
  const azGeplant = Number(v.az_geplant || 3);
  // Immer bis AZ5 scannen: az_geplant kann kleiner sein als das, was
  // tatsaechlich im Sheet steht — es darf kein Messwert verloren gehen.
  const azScan = Math.max(azGeplant, 5);

  const azList = [];
  for (let az = 1; az <= azScan; az++) {
    if (daten.some(d => isMesswert_(d['az' + az + '_zahl']))) azList.push(az);
  }
  if (azList.length === 0) return '';

  // Datum je AZ (erster gefuellter Wert; abweichende Daten werden mitgezaehlt)
  const azDatum = azList.map(az => {
    const daten_az = daten
      .map(d => String(d['az' + az + '_datum'] || '').trim())
      .filter(s => s !== '');
    const uniq = daten_az.filter((s, i) => daten_az.indexOf(s) === i);
    const n = daten.filter(d => isMesswert_(d['az' + az + '_zahl'])).length;
    return 'AZ' + az + '=' + (uniq[0] || '?') +
           (uniq.length > 1 ? ' (+' + (uniq.length - 1) + ' weitere Daten)' : '') +
           ' [n=' + n + ']';
  }).join('; ');

  const treatLegend = (v.treatments || [])
    .map(t => t.code + '=' + String(t.label || '').replace(/[;\r\n]/g, ' '))
    .join(' | ');

  const sheetUrl = v.sheet_file_id
    ? 'https://docs.google.com/spreadsheets/d/' + v.sheet_file_id + '/edit'
    : '';
  const folderUrl = v.folder_id
    ? 'https://drive.google.com/drive/folders/' + v.folder_id
    : '';

  let txt = '<<<KFK-RESULTS\n';
  txt += 'schema: kfk-results-v1\n';
  txt += 'versuchsnr: ' + (v.versuchsnr || '') + '\n';
  txt += 'titel: ' + (v.titel || '') + '\n';
  if (v.id_nummer)     txt += 'id_nummer: ' + v.id_nummer + '\n';
  if (v.themenbereich) txt += 'themenbereich: ' + v.themenbereich + '\n';
  txt += 'art_lat: ' + (v.baumart_lat || '') + '\n';
  txt += 'art_kurz: ' + (v.baumart_kurz || '') + '\n';
  if (v.ort)          txt += 'ort: ' + v.ort + '\n';
  if (v.start_datum)  txt += 'start_datum: ' + v.start_datum + '\n';
  if (v.hypothese)    txt += 'hypothese: ' + String(v.hypothese).replace(/[\r\n]+/g, ' ') + '\n';
  txt += 'samen_pro_topf: ' + samen + '\n';
  txt += 'anzahl_trays: ' + (v.anzahl_trays || 1) + '\n';
  txt += 'raster_cols: ' + (v.raster_cols || 4) + '\n';
  txt += 'raster_rows: ' + (v.raster_rows || 6) + '\n';
  txt += 'az_geplant: ' + azGeplant + '\n';
  txt += 'az_mit_daten: ' + azList.map(a => 'AZ' + a).join(',') + '\n';
  txt += 'az_datum: ' + azDatum + '\n';
  txt += 'treatments: ' + treatLegend + '\n';
  if (sheetUrl)  txt += 'sheet_url: ' + sheetUrl + '\n';
  if (folderUrl) txt += 'drive_url: ' + folderUrl + '\n';
  txt += '\n';
  txt += '# Einzelwerte pro Topf. AZn = Anzahl NEU gekeimter Samen seit der vorherigen\n';
  txt += '# Auszaehlung (Keimlinge werden nach dem Zaehlen aus dem Topf entfernt/gezogen).\n';
  txt += '# Kumulative KF% bis AZn = Summe(AZ1..AZn) / samen_pro_topf * 100. Leer = kein\n';
  txt += '# Wert erfasst. Hinweis: die App selbst (Topf-Ansicht, Statistik) zeigt\n';
  txt += '# je AZ nur den rohen Einzelwert / samen_pro_topf, summiert NICHT automatisch -\n';
  txt += '# fuer die tatsaechliche Gesamt-KF% muessen die AZn-Werte pro Topf aufsummiert werden.\n';
  txt += 'Tray;Position;Block;Wdh;Treatment;' + azList.map(a => 'AZ' + a).join(';') + '\n';

  const sorted = daten.slice().sort((a, b) =>
    (Number(a.tray || 1) - Number(b.tray || 1)) || (Number(a.topf || 0) - Number(b.topf || 0))
  );
  sorted.forEach(d => {
    const code = String(d.treatment || '').split(/[\s(]/)[0];
    const pos = (d.block && d.wdh) ? String(d.block) + String(d.wdh) : String(d.topf || '');
    txt += [
      d.tray || 1,
      pos,
      d.block || '',
      d.wdh || '',
      code
    ].join(';') + ';' +
    azList.map(az => isMesswert_(d['az' + az + '_zahl']) ? Number(d['az' + az + '_zahl']) : '').join(';') +
    '\n';
  });

  // Foto-Links (1 Foto pro AZ pro Tray, s. Foto-Schema in CLAUDE.md)
  const fotoZeilen = [];
  const trays = daten
    .map(d => Number(d.tray || 1))
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .sort((a, b) => a - b);
  [0].concat(azList).forEach(az => {
    trays.forEach(tray => {
      const row = daten.find(d => Number(d.tray || 1) === tray && d.fotos && d.fotos['az' + az]);
      const url = row ? row.fotos['az' + az] : '';
      if (url) fotoZeilen.push('AZ' + az + ' Tray' + tray + ': ' + url);
    });
  });
  if (fotoZeilen.length) {
    txt += '\n# Fotos (Drive-Links, AZ0 = Initialzustand)\n' + fotoZeilen.join('\n') + '\n';
  }

  txt += 'KFK-RESULTS>>>';

  return '<br><br><strong>🧾 Rohdaten (maschinenlesbar)</strong><br><pre>' +
         escHtml_(txt) + '</pre>';
}

// GEFAHRLOSER Dry-Run-Test: baut den Auswertungsbericht fuer versuchsnr und
// loggt ihn nur (Logger.log) – postet NICHTS zu Asana, aendert KEINEN Status.
// Zum Pruefen der Berichts-Formatierung vor einem echten Abschluss.
function testAuswertungsBericht(versuchsnr) {
  const allV = readIndex();
  const v = allV.find(x => String(x.versuchsnr) === String(versuchsnr));
  if (!v) { Logger.log('Versuch nicht gefunden: ' + versuchsnr); return; }
  const html = buildVersuchsberichtHtml_(v, '');
  Logger.log(html);
  return html;
}
// Direkt im Editor per Dropdown ausfuehrbar (kein Argument noetig):
function testAuswertungsBericht_026_033() { return testAuswertungsBericht('26_033'); }

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

  // Versuch vorab laden, um die Chargen-Pflichtfelder zu pruefen (Punkt 7,
  // serverseitige Absicherung fuer den Fall, dass ein Client die Frontend-
  // Pruefung umgeht - die eigentliche UX lebt in openVersuchEnde()).
  const allVPruefung = readIndex();
  const vPruefung = allVPruefung.find(x => String(x.versuchsnr) === String(body.versuchsnr));
  const fehlend = missingAbschlussFelder_(vPruefung, (vPruefung && vPruefung.treatments) || []);
  if (fehlend.length > 0) {
    return { error: 'Fehlende Pflichtangaben: ' + fehlend.map(f => f.label).join(', ') };
  }

  // Status im Index auf "Abgeschlossen"
  indexSheet.getRange(rowIdx, cIdx[INDEX_COLS.status] + 1).setValue('Abgeschlossen');
  SpreadsheetApp.flush();

  // Versuch + vollstaendigen Bericht (Header + Trend/Bemerkung + Statistik) bauen
  const allV = readIndex();
  const v = allV.find(x => String(x.versuchsnr) === String(body.versuchsnr));
  const fullReportHtml = buildVersuchsberichtHtml_(v, body.finalKommentarHtml || '');

  let asanaResult = { info: 'keine Asana-Verbindung' };
  if (asanaGid && ASANA_PAT && !ASANA_PAT.startsWith('__')) {
    try {
      const sub = postAuswertungToAsana_(asanaGid, fullReportHtml);
      asanaResult = { ok: true, subtaskGid: sub.gid, subtaskCreated: sub.created };
      try {
        UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks/' + asanaGid + '/stories', {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + ASANA_PAT },
          payload: JSON.stringify({
            data: { html_text: '<body>✅ Versuch abgeschlossen. Vollständige Auswertung siehe Subtask „' +
                    AUSWERTUNG_SUBTASK_NAME + '".</body>' }
          }),
          muteHttpExceptions: true
        });
      } catch (e2) { /* Hinweis-Kommentar ist nicht kritisch */ }
    } catch (e) {
      // Fallback: Bericht direkt auf den Haupttask posten, damit die Auswertung
      // nicht verloren geht, falls die Subtask-Erstellung fehlschlaegt.
      Logger.log('Auswertungs-Subtask fehlgeschlagen, Fallback auf Haupttask: ' + e);
      try {
        UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks/' + asanaGid + '/stories', {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + ASANA_PAT },
          payload: JSON.stringify({ data: { html_text: fullReportHtml } }),
          muteHttpExceptions: true
        });
        asanaResult = { ok: true, fallback: true, info: 'Subtask fehlgeschlagen, auf Haupttask gepostet: ' + String(e.message || e) };
      } catch (e3) {
        asanaResult = { error: String(e3) };
      }
    }

    try {
      const updRes = UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks/' + asanaGid, {
        method: 'put',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + ASANA_PAT },
        payload: JSON.stringify({ data: { completed: true } }),
        muteHttpExceptions: true
      });
      asanaResult.mainTaskCompleted = updRes.getResponseCode() < 300;
    } catch (e) {
      asanaResult.mainTaskCompletedError = String(e);
    }
  }

  return { ok: true, versuchsnr: body.versuchsnr, asana: asanaResult };
}

// Escaped &, < und > fuer Asana html_text (verhindert kaputtes Markup durch
// Sonderzeichen in Titel/Hypothese/Labels).
function escHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Name des Subtasks, in den beim Abschluss die vollstaendige Auswertung
// gepostet wird (siehe markVersuchAbgeschlossen / postAuswertungToAsana_).
const AUSWERTUNG_SUBTASK_NAME = 'Auswertung & Bericht';

// Findet einen Subtask mit exakt passendem Namen (case-insensitiv) unter
// taskGid, oder legt ihn neu an. Gibt { gid, created } zurueck.
function findOrCreateAsanaSubtask_(taskGid, name) {
  const listRes = UrlFetchApp.fetch(
    'https://app.asana.com/api/1.0/tasks/' + taskGid + '/subtasks?opt_fields=name,completed',
    { method: 'get', headers: { Authorization: 'Bearer ' + ASANA_PAT }, muteHttpExceptions: true }
  );
  if (listRes.getResponseCode() !== 200) {
    throw new Error('Subtask-Liste fehlgeschlagen: ' + listRes.getContentText().substring(0, 300));
  }
  const subtasks = JSON.parse(listRes.getContentText()).data || [];
  const needle = name.trim().toLowerCase();
  const found = subtasks.find(s => String(s.name || '').trim().toLowerCase() === needle);
  if (found) return { gid: found.gid, created: false };

  const createRes = UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ASANA_PAT },
    payload: JSON.stringify({ data: { name: name, parent: taskGid, projects: [ASANA_PROJECT_GID] } }),
    muteHttpExceptions: true
  });
  if (createRes.getResponseCode() >= 300) {
    throw new Error('Subtask-Erstellung fehlgeschlagen: ' + createRes.getContentText().substring(0, 300));
  }
  const created = JSON.parse(createRes.getContentText()).data;
  return { gid: created.gid, created: true };
}

// Postet den vollstaendigen Auswertungsbericht in den (ggf. neu angelegten)
// Subtask "Auswertung & Bericht" und markiert diesen als erledigt.
function postAuswertungToAsana_(taskGid, htmlContent) {
  const sub = findOrCreateAsanaSubtask_(taskGid, AUSWERTUNG_SUBTASK_NAME);
  UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks/' + sub.gid + '/stories', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ASANA_PAT },
    payload: JSON.stringify({ data: { html_text: htmlContent } }),
    muteHttpExceptions: true
  });
  UrlFetchApp.fetch('https://app.asana.com/api/1.0/tasks/' + sub.gid, {
    method: 'put',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ASANA_PAT },
    payload: JSON.stringify({ data: { completed: true } }),
    muteHttpExceptions: true
  });
  return sub;
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
    '?opt_fields=name,notes,custom_fields,assignee.name',
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

  // Baumart + Ort direkt aus dem Task ziehen, damit im Formular nichts
  // von Hand nachgetragen werden muss (s. extractArtFromAsana_/extractOrtFromAsana_)
  const art = extractArtFromAsana_(task);
  const ort = extractOrtFromAsana_(task);
  const verantwortlich = extractVerantwortlichFromAsana_(task);

  return {
    ok: true,
    prefill: {
      asana_task_gid: taskGid,
      versuchsnr, titel, themenbereich, start_datum, hypothese,
      baumart_lat: art.lat,
      baumart_kurz: art.kurz,
      ort: ort,
      verantwortlich: verantwortlich,
      treatments_json,
      anzahl_trays, raster_cols, raster_rows, samen_pro_topf
    }
  };
}

// Name des im Asana-Task zugewiesenen Nutzers (Assignee). Leer, wenn keiner
// zugewiesen ist - dann greift der Backend-Default ('Simon Goldenberg').
function extractVerantwortlichFromAsana_(task) {
  return (task && task.assignee && task.assignee.name) || '';
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

  // 4. Daten-Sheet komplett neu aufbauen (gemeinsamer Helfer)
  const built = buildDatenSheetFromRbdMap_(v, rbdMap, cols, rows, anzahlTrays, treatments);
  if (built.error) return built;

  return {
    ok: true,
    versuchsnr: versuchsnr,
    parsedTrays: parsedTrays,
    totalRows: built.totalRows,
    assignedCount: built.assignedCount,
    message: built.assignedCount + ' von ' + built.totalRows + ' Toepfen mit Treatment belegt (' +
             parsedTrays + ' Trays aus Asana-Notizen)'
  };
}

// ========== GEMEINSAMER SHEET-AUFBAU (Asana + Doc teilen sich diese Logik) ==========
// Baut das Daten-Sheet von v komplett neu auf. rbdMap[trayNr][topf] = 'TN'.
// Topf-Nummerierung spaltenweise: topf = blockIdx*rows + wdh (Block A = 1..rows).
// AZ-Daten werden dabei geleert (Neuaufbau) – identisch zum bisherigen Verhalten.
function buildDatenSheetFromRbdMap_(v, rbdMap, cols, rows, anzahlTrays, treatments) {
  // Farb-Map: { 'T0': '#ffffff', ... }
  const colorMap = {};
  (treatments || []).forEach(function(t) { colorMap[t.code] = t.color || ''; });

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
  // Dickenklasse bewusst ganz am Ende - dieselbe Position, die
  // ensureDickenklasseColumn_ bei Altbestand anlegt, und keine Verschiebung
  // bestehender Spalten.
  headers.push(DICKENKLASSE_COL);

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
      row.push('');                                          // Dickenklasse (Sieb)
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

  return { ok: true, totalRows: dataRows.length, assignedCount: assignedCount };
}

// ========== PROTOKOLL-DOC-IMPORT (JSON-Block aus verlinktem Google-Doc) ==========
// Liest den Block  <<<KFK-DATA ... KFK-DATA>>>  (Schema kfk-protocol-v1) am Ende
// des verknuepften Versuchsprotokoll-Docs. Gegenstueck zu importVersuchFromAsana
// (Prefill) bzw. importRbdFromAsana (Sheet-Aufbau) – Quelle ist aber das Doc,
// nicht die Asana-Notizen. Es werden NUR Werte gelesen, nie generiert.

const KFK_DATA_START_ = '<<<KFK-DATA';
const KFK_DATA_END_   = 'KFK-DATA>>>';

// Findet die Protokoll-Doc-ID aus einem Asana-Task (opt_fields=notes,custom_fields):
//   1) Custom-Field PROTOKOLL_URL_FIELD_GID (falls gesetzt), sonst
//   2) erste docs.google.com/document/d/<id>-URL in den Notizen (Fallback).
function resolveProtokollDocId_(task) {
  var url = '';
  if (PROTOKOLL_URL_FIELD_GID) {
    (task.custom_fields || []).forEach(function(f) {
      if (String(f.gid) === String(PROTOKOLL_URL_FIELD_GID)) {
        url = String(f.text_value || f.display_value || '');
      }
    });
  }
  if (url) {
    var m = url.match(/\/document\/d\/([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    var m2 = url.match(/([A-Za-z0-9_-]{25,})/);
    if (m2) return m2[1];
  }
  var notes = task.notes || '';
  var mn = notes.match(/https?:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/);
  return mn ? mn[1] : '';
}

// Liest + parst den KFK-DATA-Block aus einem Google-Doc. Wirft bei Fehlern.
function readKfkDataFromDoc_(docId) {
  var text = DocumentApp.openById(docId).getBody().getText();
  var si = text.indexOf(KFK_DATA_START_);
  if (si < 0) throw new Error('Kein "<<<KFK-DATA"-Block im Doc gefunden');
  var after = si + KFK_DATA_START_.length;
  var ei = text.indexOf(KFK_DATA_END_, after);
  var jsonPart = (ei < 0) ? text.substring(after) : text.substring(after, ei);
  // Google Docs wandelt gerade Anfuehrungszeichen teils in typografische um:
  jsonPart = jsonPart
    .replace(/[“”„‟″‶]/g, '"')
    .replace(/[‘’‚‛′‵]/g, "'")
    .trim();
  var data;
  try { data = JSON.parse(jsonPart); }
  catch (e) { throw new Error('KFK-DATA-Block ist kein gueltiges JSON: ' + e.message); }
  if (data.schema && String(data.schema).indexOf('kfk-protocol') !== 0) {
    throw new Error('Unerwartetes Schema im KFK-DATA-Block: ' + data.schema);
  }
  return data;
}

// Holt einen Asana-Task und liefert das geparste data-Objekt (name, notes, custom_fields).
function fetchAsanaTask_(taskGid) {
  var res = UrlFetchApp.fetch(
    'https://app.asana.com/api/1.0/tasks/' + taskGid + '?opt_fields=name,notes,custom_fields,assignee.name',
    { method: 'get', headers: { Authorization: 'Bearer ' + ASANA_PAT }, muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    throw new Error('Asana HTTP ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 300));
  }
  return JSON.parse(res.getContentText()).data;
}

// Parst das "art"-Feld des KFK-DATA-Blocks, z.B. "Cannabis sativa (Hanf)"
// -> { lat: "Cannabis sativa", kurz: "Hanf" }. Ohne Klammern: kompletter
// String als baumart_lat, kurz bleibt leer (kein Raten der Abkuerzung).
function parseArtField_(art) {
  var s = String(art || '').trim();
  if (!s) return { lat: '', kurz: '' };
  var m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { lat: m[1].trim(), kurz: m[2].trim() };
  return { lat: s, kurz: '' };
}

// ========== ART + ORT AUS DEM ASANA-TASK ZIEHEN ==========

// Arten-Lexikon fuer die Zuordnung deutscher Namen/Kuerzel -> lateinischer Name.
// 'keys' sind normalisierte Suchbegriffe (s. normArtKey_), 'kurz' ist die im
// Index gebraeuchliche Kurzform. Bei neuen Arten hier ergaenzen.
// ACHTUNG: Wer hier eine Art ergaenzt, ergaenzt sie auch in
// ARTENGRUPPEN_ZUORDNUNG in js/chargen.js (Kurzname UND lateinischer Name) -
// sonst schlaegt der Tracker fuer diese Art das falsche AZ-Raster vor.
const ART_LEXIKON = [
  { lat: 'Cannabis sativa',       kurz: 'Hanf',       keys: ['hanf'] },
  { lat: 'Pinus nigra',           kurz: 'SKi',        keys: ['schwarzkiefer', 'ski'] },
  { lat: 'Pinus sylvestris',      kurz: 'WKi',        keys: ['waldkiefer', 'kiefer', 'wki', 'gemeinekiefer'] },
  { lat: 'Picea abies',           kurz: 'Fi',         keys: ['fichte', 'rotfichte', 'gemeinefichte'] },
  { lat: 'Pseudotsuga menziesii', kurz: 'Dgl',        keys: ['douglasie', 'dgl'] },
  { lat: 'Abies alba',            kurz: 'WTa',        keys: ['weisstanne', 'tanne', 'wta'] },
  { lat: 'Abies grandis',         kurz: 'KueTa',      keys: ['kuestentanne', 'kueta', 'grosstanne', 'grandistanne'] },
  { lat: 'Larix decidua',         kurz: 'ELa',        keys: ['laerche', 'europaeischelaerche', 'ela'] },
  { lat: 'Fagus sylvatica',       kurz: 'Bu',         keys: ['buche', 'rotbuche'] },
  { lat: 'Quercus robur',         kurz: 'SEi',        keys: ['stieleiche', 'eiche', 'sei'] },
  { lat: 'Quercus petraea',       kurz: 'TEi',        keys: ['traubeneiche', 'tei'] },
  { lat: 'Carpinus betulus',      kurz: 'HBu',        keys: ['hainbuche', 'weissbuche', 'hbu'] },
  { lat: 'Betula pendula',        kurz: 'Bi',         keys: ['birke', 'sandbirke', 'haengebirke'] },
  { lat: 'Alnus glutinosa',       kurz: 'SEr',        keys: ['schwarzerle', 'erle', 'ser'] },
  { lat: 'Tilia cordata',         kurz: 'WLi',        keys: ['winterlinde', 'linde', 'wli'] },
  { lat: 'Tilia platyphyllos',    kurz: 'SLi',        keys: ['sommerlinde', 'sli'] },
  { lat: 'Acer pseudoplatanus',   kurz: 'BAh',        keys: ['bergahorn', 'bah'] },
  { lat: 'Acer platanoides',      kurz: 'SAh',        keys: ['spitzahorn', 'sah'] },
  { lat: 'Fraxinus excelsior',    kurz: 'Es',         keys: ['esche', 'gemeineesche'] },
  { lat: 'Sorbus aucuparia',      kurz: 'VB',         keys: ['vogelbeere', 'eberesche'] },
  { lat: 'Prunus avium',          kurz: 'VKi',        keys: ['vogelkirsche', 'suesskirsche', 'vki'] },
  { lat: 'Robinia pseudoacacia',  kurz: 'Rob',        keys: ['robinie', 'scheinakazie'] },
  { lat: 'Populus tremula',       kurz: 'Asp',        keys: ['aspe', 'zitterpappel'] },
  { lat: 'Salix caprea',          kurz: 'SWe',        keys: ['salweide', 'weide'] },
  { lat: 'Ulmus glabra',          kurz: 'BUl',        keys: ['bergulme', 'ulme'] },
  { lat: 'Secale cereale',        kurz: 'Roggen',     keys: ['roggen'] },
  { lat: 'Triticum aestivum',     kurz: 'Weizen',     keys: ['weizen', 'saatweizen', 'weichweizen'] },
  { lat: 'Lepidium sativum',      kurz: 'Kresse',     keys: ['gartenkresse', 'kresse'] }
];

// Normalisiert einen Artnamen fuer den Lexikon-Vergleich: Kleinschreibung,
// Umlaute aufgeloest, Nicht-Buchstaben entfernt, angehaengtes
// "samen"/"saatgut"/"saat" abgeschnitten ("Hanfsamen" -> "hanf").
function normArtKey_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '')
    .replace(/(samen|saatgut|saat|korn|koerner)$/, '');
}

function artLexikonByKey_(s) {
  var key = normArtKey_(s);
  if (!key) return null;
  for (var i = 0; i < ART_LEXIKON.length; i++) {
    if (ART_LEXIKON[i].keys.indexOf(key) !== -1) return ART_LEXIKON[i];
  }
  return null;
}

function artLexikonByLat_(lat) {
  var l = String(lat || '').toLowerCase().trim();
  for (var i = 0; i < ART_LEXIKON.length; i++) {
    if (ART_LEXIKON[i].lat.toLowerCase() === l) return ART_LEXIKON[i];
  }
  return null;
}

// Sieht der String wie ein lateinischer Binomialname aus ("Cannabis sativa")?
function istBinomial_(s) {
  return /^[A-Z][a-z]{2,}\s+[a-z][a-z\-]{2,}$/.test(String(s || '').trim());
}

/**
 * Zieht Baumart/Pflanzenart aus einem Asana-Task (Notizen + Titel).
 *
 * Reihenfolge:
 *   1. Explizite Zeile "Saatgut: Hanfsamen (Cannabis sativa), ..." bzw.
 *      "Art:/Baumart:/Pflanzenart:/Modellart:/Samen:" — Klammerinhalt gilt als
 *      lateinischer Name, Text davor als deutscher Name.
 *   2. Bekannter lateinischer Name irgendwo im Volltext.
 *   3. Bekannter deutscher Name/Kuerzel irgendwo im Volltext (Arten-Lexikon).
 * Nur eindeutig zuordenbare Namen werden gesetzt — nie geraten.
 *
 * Rueckgabe: { lat, kurz }
 */
function extractArtFromAsana_(task) {
  var notes = String((task && task.notes) || '');
  var name  = String((task && task.name)  || '');
  var hay   = notes + '\n' + name;

  var lat = '', kurz = '';

  // 1) Explizite Zeile
  var lines = hay.split(/[\r\n]+/);
  for (var i = 0; i < lines.length && !lat && !kurz; i++) {
    var m = lines[i].match(
      /(?:^|\|)\s*(?:Saatgut|Saat|Samen|Art|Baumart|Pflanzenart|Modellart|Spezies|Species)\s*[:=]\s*([^|]+)/i
    );
    if (!m) continue;
    var val = m[1].trim();
    var par = val.match(/\(([^)]+)\)/);
    if (par && istBinomial_(par[1])) {
      lat  = par[1].trim();
      kurz = val.replace(/\([^)]*\)/g, '').split(',')[0].trim();
    } else {
      var erst = val.split(',')[0].trim();
      if (istBinomial_(erst)) lat = erst; else kurz = erst;
    }
  }

  // 2) Lateinischer Name aus dem Lexikon im Volltext
  if (!lat) {
    for (var j = 0; j < ART_LEXIKON.length; j++) {
      if (hay.toLowerCase().indexOf(ART_LEXIKON[j].lat.toLowerCase()) !== -1) {
        lat = ART_LEXIKON[j].lat;
        break;
      }
    }
  }

  // 3) Deutscher Name / Kuerzel im Volltext (nur als ganzes Wort)
  if (!lat && !kurz) {
    var woerter = hay.split(/[^A-Za-zÄÖÜäöüß]+/);
    for (var k = 0; k < woerter.length && !lat; k++) {
      var treffer = artLexikonByKey_(woerter[k]);
      if (treffer) { lat = treffer.lat; kurz = treffer.kurz; }
    }
  }

  // Bei bekannter Art gewinnt das Lexikon: es haelt die im Index gebraeuchliche
  // Schreibweise fest ("Hanfsamen" -> "Hanf", "Schwarzkiefer" -> "SKi"), damit
  // Baumart_kurz ueber alle Versuche hinweg einheitlich bleibt.
  var eintrag = artLexikonByKey_(kurz) || artLexikonByLat_(lat);
  if (eintrag) {
    lat  = eintrag.lat;
    kurz = eintrag.kurz;
  } else if (kurz) {
    // Unbekannte Art: nur das angehaengte "…samen" abschneiden, nichts raten
    kurz = kurz.replace(/(samen|saatgut)$/i, '').trim();
  }

  return { lat: lat, kurz: kurz };
}

/**
 * Zieht den Versuchsort aus einem Asana-Task.
 * Prioritaet: Custom-Field "Ort" (Enum/Multi-Enum/Text) > Notizen-Zeile
 * "Ort: Growzelt" (auch inline nach einem "|"). Leerstring, wenn nichts da ist —
 * das Anlege-Formular setzt dann seinen Default (Growzelt).
 */
function extractOrtFromAsana_(task) {
  var cfs = (task && task.custom_fields) || [];
  for (var i = 0; i < cfs.length; i++) {
    var f = cfs[i];
    if (String(f.name || '').toLowerCase().trim() !== 'ort') continue;
    if (f.multi_enum_values && f.multi_enum_values.length) return String(f.multi_enum_values[0].name || '').trim();
    if (f.enum_value && f.enum_value.name) return String(f.enum_value.name).trim();
    if (f.text_value) return String(f.text_value).trim();
    if (f.display_value) return String(f.display_value).split(',')[0].trim();
  }
  var m = String((task && task.notes) || '').match(/(?:^|\|)\s*Ort\s*[:=]\s*([^|\r\n]+)/i);
  return m ? m[1].trim() : '';
}

// Prefill fuers Anlege-Formular – aus dem Doc-JSON statt aus den Asana-Notizen.
// Asana wird nur genutzt, um die Protokoll-Doc-URL zu finden.
function importVersuchFromDoc(taskGid) {
  if (!taskGid) return { error: 'asana_task_gid fehlt' };
  if (!ASANA_PAT || ASANA_PAT.startsWith('__')) return { error: 'ASANA_PAT nicht konfiguriert' };

  var task, docId, data;
  try {
    task  = fetchAsanaTask_(taskGid);
    docId = resolveProtokollDocId_(task);
    if (!docId) return { error: 'Keine Protokoll-Doc-URL gefunden (weder Custom-Field noch docs.google.com-Link in den Notizen)' };
    data  = readKfkDataFromDoc_(docId);
  } catch (e) {
    return { error: String(e.message || e) };
  }

  var treatments = (data.treatments || []).map(function(t) {
    return { code: t.code, color: t.color || '', label: t.label || '' };
  });
  var artParsed = parseArtField_(data.art);
  // Faellt der art-Eintrag im Doc-Block aus, ergaenzt der Asana-Task (Notizen/
  // Titel). Umgekehrt fuellt das Arten-Lexikon eine fehlende Haelfte auf.
  if (!artParsed.lat || !artParsed.kurz) {
    var artAsana = extractArtFromAsana_(task);
    if (!artParsed.lat)  artParsed.lat  = artAsana.lat;
    if (!artParsed.kurz) artParsed.kurz = artAsana.kurz;
    var lex = artLexikonByLat_(artParsed.lat) || artLexikonByKey_(artParsed.kurz);
    if (lex) {
      if (!artParsed.lat)  artParsed.lat  = lex.lat;
      if (!artParsed.kurz) artParsed.kurz = lex.kurz;
    }
  }

  return {
    ok: true,
    source: 'doc',
    doc_id: docId,
    prefill: {
      asana_task_gid:  taskGid,
      versuchsnr:      data.versuchsnr || '',
      titel:           data.titel || '',
      themenbereich:   data.themenbereich || '',
      start_datum:     data.start_datum || '',
      hypothese:       data.hypothese || '',
      baumart_lat:     artParsed.lat,
      baumart_kurz:    artParsed.kurz,
      ort:             data.ort || extractOrtFromAsana_(task),
      verantwortlich:  data.verantwortlich || extractVerantwortlichFromAsana_(task),
      treatments_json: treatments.length ? JSON.stringify(treatments) : '',
      anzahl_trays:    data.anzahl_trays   != null ? Number(data.anzahl_trays)   : null,
      raster_cols:     data.raster_cols    != null ? Number(data.raster_cols)    : null,
      raster_rows:     data.raster_rows    != null ? Number(data.raster_rows)    : null,
      samen_pro_topf:  data.samen_pro_topf != null ? Number(data.samen_pro_topf) : null,
      // Optionales Feld im KFK-DATA-Block (Schema kfk-protocol-v2), z.B.
      // [{"tray":1,"regal":2,"boden":1}]. Fehlt es (Schema v1) oder ist es
      // kein Array, bleibt standorte null - Frontend zeigt dann den
      // "Standort fehlt"-Hinweis statt etwas zu raten.
      standorte:       Array.isArray(data.standorte) ? data.standorte : null
    }
  };
}

// RBD-Layout aus dem Doc-JSON ins Daten-Sheet schreiben. Gegenstueck zu importRbdFromAsana.
function importRbdFromDoc(versuchsnr) {
  if (!versuchsnr) return { error: 'versuchsnr fehlt' };
  if (!ASANA_PAT || ASANA_PAT.startsWith('__')) return { error: 'ASANA_PAT nicht konfiguriert' };

  var all = readIndex();
  var v = all.find(function(x) { return String(x.versuchsnr) === String(versuchsnr); });
  if (!v) return { error: 'Versuch nicht gefunden: ' + versuchsnr };
  if (!v.asana_task_gid) return { error: 'Kein Asana_Task_GID im Index fuer ' + versuchsnr };
  if (!v.sheet_file_id)  return { error: 'Kein Sheet_File_ID im Index fuer ' + versuchsnr };

  var docId, data;
  try {
    var task = fetchAsanaTask_(v.asana_task_gid);
    docId = resolveProtokollDocId_(task);
    if (!docId) return { error: 'Keine Protokoll-Doc-URL gefunden fuer ' + versuchsnr };
    data = readKfkDataFromDoc_(docId);
  } catch (e) {
    return { error: String(e.message || e) };
  }

  // Struktur bevorzugt aus dem Doc-JSON (die rbd-Koordinaten leben in dessen
  // System), Fallback auf Index-Werte.
  var cols        = Number(data.raster_cols  || v.raster_cols  || 4);
  var rows        = Number(data.raster_rows  || v.raster_rows  || 6);
  var anzahlTrays = Number(data.anzahl_trays || v.anzahl_trays || 1);
  var treatments  = (data.treatments && data.treatments.length) ? data.treatments : (v.treatments || []);

  var rbdMap = rbdEntriesToMap_(data.rbd || [], rows);

  var parsedTrays = Object.keys(rbdMap).length;
  if (parsedTrays === 0) {
    return { error: 'Kein gueltiges rbd-Array im KFK-DATA-Block gefunden.' };
  }

  var built = buildDatenSheetFromRbdMap_(v, rbdMap, cols, rows, anzahlTrays, treatments);
  if (built.error) return built;

  return {
    ok: true,
    source: 'doc',
    doc_id: docId,
    versuchsnr: versuchsnr,
    parsedTrays: parsedTrays,
    totalRows: built.totalRows,
    assignedCount: built.assignedCount,
    message: built.assignedCount + ' von ' + built.totalRows + ' Toepfen mit Treatment belegt (' +
             parsedTrays + ' Trays aus Protokoll-Doc)'
  };
}

// Wandelt ein rbd-Array aus dem KFK-DATA-Block ({tray,col,row,t}) in
// rbdMap[tray][topf]='TN' um. Topf spaltenweise: topf = (Spaltenbuchstabe-'A')*rows + row.
// Gemeinsam genutzt von importRbdFromDoc (Doc-Fetch) und importRbdRaw (direkt vom Client).
function rbdEntriesToMap_(entries, rows) {
  var rbdMap = {};
  for (var i = 0; i < entries.length; i++) {
    var en = entries[i];
    var tray     = Number(en.tray || 1);
    var blockIdx = String(en.col || '').toUpperCase().charCodeAt(0) - 65;   // 'A'=0
    var rowNum   = Number(en.row || 0);
    var tCode    = String(en.t || '').toUpperCase();
    if (isNaN(blockIdx) || blockIdx < 0 || rowNum < 1 || !/^T\d+$/.test(tCode)) continue;
    var topf = blockIdx * rows + rowNum;
    if (!rbdMap[tray]) rbdMap[tray] = {};
    rbdMap[tray][topf] = tCode;
  }
  return rbdMap;
}

// RBD-Layout direkt vom Client uebernehmen (Paste-Import, siehe js/paste-import.js) -
// kein Asana/Doc-Fetch, das rbd-Array kommt schon fertig geparst im Request.
function importRbdRaw(body) {
  var versuchsnr = body && body.versuchsnr;
  if (!versuchsnr) return { error: 'versuchsnr fehlt' };
  if (!Array.isArray(body.rbd) || !body.rbd.length) return { error: 'rbd-Array fehlt oder ist leer' };

  var all = readIndex();
  var v = all.find(function(x) { return String(x.versuchsnr) === String(versuchsnr); });
  if (!v) return { error: 'Versuch nicht gefunden: ' + versuchsnr };
  if (!v.sheet_file_id) return { error: 'Kein Sheet_File_ID im Index fuer ' + versuchsnr };

  var cols        = Number(body.raster_cols  || v.raster_cols  || 4);
  var rows        = Number(body.raster_rows  || v.raster_rows  || 6);
  var anzahlTrays = Number(body.anzahl_trays || v.anzahl_trays || 1);
  var treatments  = (body.treatments && body.treatments.length) ? body.treatments : (v.treatments || []);

  var rbdMap = rbdEntriesToMap_(body.rbd, rows);
  var parsedTrays = Object.keys(rbdMap).length;
  if (parsedTrays === 0) {
    return { error: 'Kein gueltiges rbd-Array uebergeben.' };
  }

  var built = buildDatenSheetFromRbdMap_(v, rbdMap, cols, rows, anzahlTrays, treatments);
  if (built.error) return built;

  return {
    ok: true,
    source: 'raw',
    versuchsnr: versuchsnr,
    parsedTrays: parsedTrays,
    totalRows: built.totalRows,
    assignedCount: built.assignedCount,
    message: built.assignedCount + ' von ' + built.totalRows + ' Toepfen mit Treatment belegt (' +
             parsedTrays + ' Trays aus Paste-Import)'
  };
}

// Direkt aus dem Apps-Script-Editor testbar:
function testImportRbd() {
  Logger.log(JSON.stringify(importRbdFromAsana('26_029')));
}
function testImportRbdDoc() {
  Logger.log(JSON.stringify(importRbdFromDoc('26_033')));
}
function testImportRbdDoc_032() {
  Logger.log(JSON.stringify(importRbdFromDoc('26_032')));
}
// Smoke-Test des Doc-Imports OHNE Index-Eintrag: liest den KFK-DATA-Block
// direkt aus dem 26_033-Protokoll-Doc. Loest beim ersten Lauf die einmalige
// 'documents'-Autorisierung aus und prueft das Parsen (Treatments/RBD).
function testDocImport_033() {
  var data = readKfkDataFromDoc_('1RFDxlCqWxdSR39GS2IgaZNoVdlDfBoEDiq_d5MJBrtY');
  Logger.log('schema=' + data.schema + ' | versuchsnr=' + data.versuchsnr +
             ' | treatments=' + (data.treatments || []).length +
             ' | rbd-Eintraege=' + (data.rbd || []).length);
  Logger.log(JSON.stringify(data.treatments));
  return data;
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
    // Aktivierung ist Tag 0 fuer alle Keimzeitberechnungen (siehe CLAUDE.md
    // "Aussaat vs. Aktivierung"); aeltere Aufrufer, die nur start_datum
    // schicken, landen unveraendert in derselben Spalte.
    start_datum:   body.aktivierung_datum || body.start_datum || '',
    aussaat_datum: body.aussaat_datum || '',
    mdd_pp:        body.mdd_pp || '',
    saatgutcharge: body.saatgutcharge_id || body.saatgutcharge || '',
    charge_kfk_potenzial: body.charge_kfk_potenzial || '',
    ruhephase_bestaetigt: !!body.ruhephase_bestaetigt,
    substrat_json: JSON.stringify({
      substratcharge_id:     body.substratcharge_id || '',
      substrat_basis:        body.substrat_basis || '',
      substrat_zuschlag:     body.substrat_zuschlag || '',
      substrat_verhaeltnis:  body.substrat_verhaeltnis || '',
      substrat_lieferant_lot: body.substrat_lieferant_lot || '',
      substrat_ec:           body.substrat_ec || '',
      substrat_ph:           body.substrat_ph || '',
      substrat_anmerkung:    body.substrat_anmerkung || '',
      substrat_gemischt_von: body.substrat_gemischt_von || ''
    }),
    az_termine_json: JSON.stringify(Array.isArray(body.az_termine) ? body.az_termine : []),
    ort:           body.ort || 'Growzelt',
    verantwortlich: body.verantwortlich || 'Simon Goldenberg',
    // Posten_Nr wird mit derselben Groesse befuellt wie Saatgutcharge (eine
    // Groesse, zwei historische Spalten - siehe readIndex).
    posten_nr:     body.saatgutcharge_id || body.saatgutcharge || body.posten_nr || '',
    status:        'Aktiv',
    asana_task_gid: body.asana_task_gid || '',
    sheet_file_id: '',
    folder_id:     '',
    treatments_json: body.treatments_json || '[]',
    samen_pro_topf: Number(body.samen_pro_topf) || 36,
    raster_cols:   Number(body.raster_cols) || 4,
    raster_rows:   Number(body.raster_rows) || 6,
    anzahl_trays:  Number(body.anzahl_trays) || 1,
    az_geplant:    Number(body.az_geplant) || 3,
    // Standorte aus dem KFK-DATA-Import (body.standorte, siehe importVersuchFromDoc)
    // uebernehmen falls vorhanden; migrateVersuchStandorte_ fuellt fehlende/nicht
    // gelieferte Trays verlustfrei mit regal/boden = null (kein Raten, siehe Punkt 3).
    standorte_json: JSON.stringify(migrateVersuchStandorte_({
      anzahl_trays: Number(body.anzahl_trays) || 1,
      standorte: Array.isArray(body.standorte) ? body.standorte : []
    })),
    standort_historie_json: '[]'
  };
  Object.entries(colMap).forEach(([key, val]) => {
    const colName = INDEX_COLS[key];
    if (colName !== undefined && cIdx[colName] !== undefined) newRow[cIdx[colName]] = val;
  });

  indexSheet.getRange(data.length + 1, 1, 1, headers.length).setValues([newRow]);
  SpreadsheetApp.flush();

  const setupResult = setupSingleVersuch(String(body.versuchsnr));

  // Auto-RBD: Wenn ein verknuepftes Protokoll-Doc mit rbd-Array existiert,
  // gleich Treatments/Farben ins Daten-Sheet schreiben (sonst bliebe das
  // Raster leer und muesste manuell importiert werden). Bricht sauber ab,
  // wenn kein Doc/RBD vorhanden ist (z.B. manuell angelegte Versuche).
  var rbdResult = null;
  if (body.asana_task_gid) {
    try {
      const r = importRbdFromDoc(String(body.versuchsnr));
      rbdResult = (r && r.ok) ? r : { skipped: true, info: (r && r.error) || 'kein RBD importiert' };
    } catch (e) {
      rbdResult = { skipped: true, info: String(e.message || e) };
    }
  }

  return { ok: true, versuchsnr: body.versuchsnr, ...setupResult, rbd: rbdResult };
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
  if (treatments.length) buildAuswertungTab(newSs, treatments, Number(v.samen_pro_topf || 36), Number(v.charge_kfk_potenzial || 0), Number(v.az_geplant || 3));

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

// ========== DESKRIPTIVE STATISTIK ==========

function buildStatistikHtml(v, daten) {
  const treatments = v.treatments || [];
  const samen = Number(v.samen_pro_topf || 36);
  const azGeplant = Number(v.az_geplant || 3);
  if (!daten || daten.length === 0 || treatments.length === 0) return '';

  // Letzte AZ mit Daten bestimmen. Immer bis AZ5 hoch scannen: az_geplant kann
  // kleiner sein als die tatsaechlich erfassten Runden — kein Wert darf fehlen.
  let lastAZ = 0;
  for (let az = Math.max(azGeplant, 5); az >= 1; az--) {
    if (daten.some(d => {
      const val = d['az' + az + '_zahl'];
      return val !== '' && val != null && val !== undefined && !isNaN(Number(val));
    })) { lastAZ = az; break; }
  }
  if (lastAZ === 0) return '';

  let html = '<br><br><strong>📊 Deskriptive Statistik (n, Ø, SD, Min, Max, KF%, CV%, kumulativ)</strong><br>';

  for (let az = 1; az <= lastAZ; az++) {
    const groups = treatments.map(t => {
      const vals = daten
        .filter(d => String(d.treatment || '').split(/[\s(]/)[0] === t.code)
        .map(d => cumulativeAZValue_(d, az))
        .filter(x => x !== '')
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
      const min = Math.min.apply(null, g.vals);
      const max = Math.max.apply(null, g.vals);
      return {
        code: g.t.code,
        label: String(g.t.label || '').substring(0, 13),
        n, mean: mean.toFixed(1), kf: Math.round(mean / samen * 100),
        sd: sd.toFixed(1), min, max, cv,
        rawMean: mean, rawVals: g.vals
      };
    });

    html += '<br><strong>AZ' + az + '</strong><br><pre>';
    html += 'Code  Label            n   Ø Keim  KF%   SD    Min   Max   CV%\n';
    groupStats.forEach(g => {
      html += (g.code + '    ').slice(0, 4) + ' ' +
              (g.label + '               ').slice(0, 15) + ' ' +
              String(g.n).padStart(3) + '   ' +
              String(g.mean).padStart(6) + '  ' +
              String(g.kf + '%').padStart(4) + '  ' +
              String(g.sd).padStart(5) + '  ' +
              String(g.min).padStart(5) + '  ' +
              String(g.max).padStart(5) + '  ' +
              String(g.cv + '%').padStart(4) + '\n';
    });
    html += '</pre>';
  }
  return html;
}

// ========== FORTSCHRITTS-BERECHNUNG ==========

function getFortschritt(v, daten) {
  if (!daten) {
    try { daten = readDaten(v); } catch (e) { return { fehler: String(e) }; }
  }
  const azGeplant = Number(v.az_geplant || 5);
  const result = { az_geplant: azGeplant, az_status: [], az_kf_mittel: [] };

  for (let az = 1; az <= azGeplant; az++) {
    // Status (offen/teilweise/fertig) richtet sich nach den rohen Eintraegen
    // dieser Runde; der angezeigte KF%-Mittelwert dagegen ist kumulativ
    // (Summe AZ1..az je Topf) - siehe cumulativeAZValue_.
    const rawWerte = daten
      .map(d => d['az' + az + '_zahl'])
      .filter(x => x !== '' && x !== null && x !== undefined && !isNaN(Number(x)));

    if (rawWerte.length === 0) {
      result.az_status.push('offen');
      result.az_kf_mittel.push(null);
    } else {
      result.az_status.push(rawWerte.length < daten.length ? 'teilweise' : 'fertig');
      const cumWerte = daten.map(d => cumulativeAZValue_(d, az)).filter(x => x !== '').map(Number);
      const mean = cumWerte.reduce((a, b) => a + b, 0) / cumWerte.length;
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
      const chargeKfkPotenzial = Number(row[colIdx[INDEX_COLS.charge_kfk_potenzial]] || 0);
      const azGeplant = Number(row[colIdx[INDEX_COLS.az_geplant]] || 3);

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
        buildAuswertungTab(newSs, treatments, samenProTopf, chargeKfkPotenzial, azGeplant);
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
  headers.push(DICKENKLASSE_COL);   // ganz am Ende, siehe ensureDickenklasseColumn_

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
      row.push('');                 // Dickenklasse (Sieb)
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

// ========== Live-Auswertung im Versuchs-Sheet ==========
//
// KERNREGEL (SOP): KFK = AZ1 + AZ2 + AZ3 + ...  Je AZ-Runde wird nur die Zahl
// der NEU gekeimten Samen erfasst; ein einzelner AZ-Wert ist niemals der
// Endkeimwert. Der Auswertungs-Tab rechnet deshalb ausschliesslich KUMULATIV:
// jeder AZ-Block zeigt Summe(AZ1..AZn) je Topf, der Block "Gesamt" die Summe
// ueber alle erfassten Runden. (Bis v1.7.1 griffen die Formeln hier
// faelschlich auf die rohe Einzelrunden-Spalte zu.)
//
// Spaltenbuchstaben werden NICHT mehr hart kodiert, sondern aus der echten
// Kopfzeile des Tabs "Daten" aufgeloest - damit bleibt der Tab korrekt, egal ob
// eine Tray-Spalte existiert oder spaeter Spalten dazukommen (z.B.
// Dickenklasse).

// 0-basierter Spaltenindex -> Spaltenbuchstabe (A, B, ... Z, AA, AB, ...).
function colLetter_(idx) {
  var n = Number(idx) + 1, out = '';
  while (n > 0) {
    var rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// Liefert { treatmentCol: 'D', azZahlCols: {1:'G', 2:'J', ...} } aus der
// Kopfzeile des Daten-Tabs. Fehlende Spalten fehlen auch im Ergebnis (kein
// Raten) - der Aufrufer ueberspringt sie dann.
function datenSpaltenAufloesen_(ss) {
  const daten = ss.getSheetByName('Daten');
  if (!daten || daten.getLastColumn() < 1) return { treatmentCol: null, azZahlCols: {} };
  const headers = daten.getRange(1, 1, 1, daten.getLastColumn()).getValues()[0];
  const map = { treatmentCol: null, azZahlCols: {} };
  headers.forEach(function (h, i) {
    const name = String(h).trim();
    if (name === 'Treatment') map.treatmentCol = colLetter_(i);
    const m = /^AZ(\d)_Zahl$/.exec(name);
    if (m) map.azZahlCols[Number(m[1])] = colLetter_(i);
  });
  return map;
}

const AUSWERTUNG_ZEILEN = 500;   // Puffer weit ueber jeder realen Topfzahl

function buildAuswertungTab(ss, treatments, samenProTopf, chargeKfkPotenzial, azGeplant) {
  const sheet = ss.insertSheet('Auswertung');
  fillAuswertungTab_(sheet, ss, treatments, samenProTopf, chargeKfkPotenzial, azGeplant);
  return sheet;
}

function fillAuswertungTab_(sheet, ss, treatments, samenProTopf, chargeKfkPotenzial, azGeplant) {
  // Der Formelbau kommt aus js/auswertung-formeln.js (per .claspignore mit
  // hochgeladen, UMD-Export haengt sich an globalThis). Fehlt das Modul - etwa
  // weil jemand die Datei aus dem Apps-Script-Projekt geloescht oder
  // .claspignore beschnitten hat -, MUSS hier abgebrochen werden, BEVOR
  // sheet.clear() weiter unten laeuft. Sonst bliebe der Tab geleert zurueck und
  // ein rebuildAuswertungTabForAll haette alle Auswertungen ausradiert.
  if (typeof KfkAuswertungFormeln === 'undefined') {
    throw new Error('KfkAuswertungFormeln fehlt im Apps-Script-Projekt - '
      + 'js/auswertung-formeln.js per clasp push hochladen (siehe .claspignore). '
      + 'Tab wurde NICHT angetastet.');
  }

  const potenzial = Number(chargeKfkPotenzial || 0);
  const samen = Number(samenProTopf) || 36;
  const spalten = datenSpaltenAufloesen_(ss);
  const tCol = spalten.treatmentCol || 'D';
  const R = AUSWERTUNG_ZEILEN;

  sheet.clear();

  sheet.getRange(1, 1).setValue('Live-Auswertung (kumulativ)')
    .setFontSize(13).setFontWeight('bold')
    .setBackground('#2d4a23').setFontColor('#f4f0e6');
  sheet.getRange(1, 1, 1, 9).merge();

  sheet.getRange(2, 1).setValue(
      'KFK = AZ1 + AZ2 + AZ3 + ... — jeder Block zeigt die KUMULATIVE Summe bis zu dieser Runde, '
    + '"Gesamt" die Summe ueber alle Runden. Fuer GLM/ANOVA, eta^2 und Post-hoc siehe R/Python auf dem Gesamt-Block.')
    .setFontStyle('italic').setFontColor('#6b5f4e').setWrap(true);
  sheet.getRange(2, 1, 1, 9).merge();

  // Welche AZ-Runden gibt es ueberhaupt als Spalte?
  const azNummern = Object.keys(spalten.azZahlCols).map(Number).sort(function (a, b) { return a - b; });
  if (!azNummern.length) {
    sheet.getRange(4, 1).setValue('Keine AZ-Spalten im Tab "Daten" gefunden.');
    return;
  }

  // Der eigentliche Formelbau liegt in js/auswertung-formeln.js
  // (KfkAuswertungFormeln) - UMD-Modul, das `.claspignore` mit hochlaedt und
  // das per Vitest getestet wird (test/auswertung-formeln.test.js). Bis v1.8.2
  // steckte er inline hier und war damit von der Testsuite nicht erreichbar;
  // genau deshalb fiel der Locale-Bug aus v1.8.0 (US-Komma statt Semikolon)
  // erst im Growzelt-Sheet auf. Hier bleibt nur noch das Schreiben in Zellen.
  const FML = KfkAuswertungFormeln;
  const HEADER = FML.KOPFZEILE;
  let curRow = 4;

  function block(titel, bisAz, hervorheben) {
    sheet.getRange(curRow, 1).setValue(titel)
      .setFontWeight('bold').setFontSize(12)
      .setFontColor(hervorheben ? '#2d4a23' : '#4a6b3a');
    curRow++;
    sheet.getRange(curRow, 1, 1, 9).setValues([HEADER])
      .setFontWeight('bold')
      .setBackground(hervorheben ? '#d9e4cd' : '#ebe5d3')
      .setHorizontalAlignment('center');
    curRow++;

    treatments.forEach(function (t) {
      const code = String(t.code || '').trim();
      if (!code) return;
      const r = curRow;
      const formeln = FML.zeilenFormeln({
        code: code,
        treatmentCol: tCol,
        azZahlCols: spalten.azZahlCols,
        azNummern: azNummern,
        bisAz: bisAz,
        zeilen: R,
        row: r,
        samenProTopf: samen,
        chargeKfkPotenzial: potenzial
      });

      sheet.getRange(r, 1).setValue(code + ' ' + (t.label || ''));
      // Spalten B..I in der Reihenfolge von FML.FELDER, passend zu KOPFZEILE.
      FML.FELDER.forEach(function (feld, i) {
        sheet.getRange(r, i + 2).setFormula(formeln[feld]);
      });
      curRow++;
    });
    curRow += 1; // Leerzeile
  }

  // Welche Bloecke, und bis zu welcher Runde jeweils - siehe blockPlan im
  // Modul (begrenzt auf az_geplant, Gesamt ueber alle Spalten).
  FML.blockPlan({ azNummern: azNummern, azGeplant: azGeplant }).forEach(function (b) {
    block(b.titel, b.bisAz, b.hervorheben);
  });

  sheet.setColumnWidth(1, 200);
  for (let c = 2; c <= 9; c++) sheet.setColumnWidth(c, 85);
  sheet.setRowHeight(2, 34);
  sheet.setFrozenRows(3);
}

/**
 * Baut den Auswertungs-Tab EINES Versuchs neu auf (loescht ihn und legt ihn
 * frisch an). Noetig nach einer Aenderung von charge_kfk_potenzial oder
 * samen_pro_topf und einmalig fuer allen Altbestand vor v1.8.0, dessen Tab
 * noch nicht kumulativ rechnete.
 *   rebuildAuswertungTab('26_036')
 */
function rebuildAuswertungTab(versuchsnr) {
  const all = readIndex();
  const v = all.find(function (x) { return String(x.versuchsnr) === String(versuchsnr); });
  if (!v) throw new Error('Versuch nicht gefunden: ' + versuchsnr);
  if (!v.sheet_file_id) throw new Error('Kein Sheet_File_ID fuer ' + versuchsnr);
  const ss = SpreadsheetApp.openById(v.sheet_file_id);
  const treatments = v.treatments || [];
  if (!treatments.length) throw new Error('Keine Treatments im Index fuer ' + versuchsnr);

  let sheet = ss.getSheetByName('Auswertung');
  if (!sheet) sheet = ss.insertSheet('Auswertung');
  fillAuswertungTab_(sheet, ss, treatments,
    Number(v.samen_pro_topf || 36), Number(v.charge_kfk_potenzial || 0),
    Number(v.az_geplant || 3));
  SpreadsheetApp.flush();
  return { versuchsnr: versuchsnr, ok: true, treatments: treatments.length };
}

/**
 * Wie rebuildAuswertungTab, aber fuer ALLE Versuche im Index (aktiv + Archiv).
 * rebuildAuswertungTabForAll(true) = nur Report, ohne zu schreiben.
 * Einmalig nach dem Update auf v1.8.0 ausfuehren.
 */
function rebuildAuswertungTabForAll(dryRun) {
  const all = readIndex();
  const report = [];
  all.forEach(function (v) {
    if (!v.sheet_file_id) { report.push(v.versuchsnr + ': kein Sheet'); return; }
    if (!v.treatments || !v.treatments.length) { report.push(v.versuchsnr + ': keine Treatments'); return; }
    if (dryRun) { report.push(v.versuchsnr + ': WUERDE neu aufgebaut'); return; }
    try {
      rebuildAuswertungTab(v.versuchsnr);
      report.push(v.versuchsnr + ': neu aufgebaut');
    } catch (e) {
      report.push(v.versuchsnr + ': FEHLER ' + e.message);
    }
  });
  Logger.log(report.join('\n'));
  return report;
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
/**
 * Legt die Dickenklasse-Spalte in ALLEN Versuchs-Daten-Sheets nachtraeglich an.
 * Einmalig im Apps-Script-Editor ausfuehren (Altbestand vor v1.8.0).
 * ensureDickenklasseColumnForAll(true) = nur Report, ohne Schreiben.
 */
function ensureDickenklasseColumnForAll(dryRun) {
  const all = readIndex();
  const report = [];
  all.forEach(v => {
    if (!v.sheet_file_id) { report.push(v.versuchsnr + ': kein Sheet'); return; }
    try {
      const sheet = SpreadsheetApp.openById(v.sheet_file_id).getSheetByName('Daten');
      if (!sheet) { report.push(v.versuchsnr + ': Tab "Daten" fehlt'); return; }
      const lastCol = sheet.getLastColumn();
      const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      const vorhanden = headers.some(h => String(h).trim() === DICKENKLASSE_COL);
      if (vorhanden) { report.push(v.versuchsnr + ': vorhanden'); return; }
      if (dryRun) { report.push(v.versuchsnr + ': WUERDE angelegt'); return; }
      ensureDickenklasseColumn_(sheet);
      report.push(v.versuchsnr + ': angelegt');
    } catch (e) {
      report.push(v.versuchsnr + ': FEHLER ' + e.message);
    }
  });
  Logger.log(report.join('\n'));
  return report;
}

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

/**
 * Normalisiert Baumart_lat/Baumart_kurz aller __KFK-Index-Zeilen ueber ART_LEXIKON
 * (gleiche Zuordnung wie extractArtFromAsana_ beim Neuanlegen). Ohne Argument nur
 * Report, es wird NICHTS geschrieben (dryRun=true). Erst mit
 * normalizeIndexArten(false) im Apps-Script-Editor ausfuehren, um zu schreiben.
 */
function normalizeIndexArten(dryRun) {
  if (dryRun === undefined) dryRun = true;
  const sheet = getIndexSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIdx = {};
  headers.forEach((h, i) => { colIdx[String(h).trim()] = i; });

  const latCol = colIdx[INDEX_COLS.baumart_lat];
  const kurzCol = colIdx[INDEX_COLS.baumart_kurz];
  const versuchsnrCol = colIdx[INDEX_COLS.versuchsnr];
  if (latCol === undefined || kurzCol === undefined) return { error: 'Baumart-Spalten fehlen im Index' };

  const changes = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const versuchsnr = String(row[versuchsnrCol] || '');
    if (!versuchsnr) continue;
    const curLat = String(row[latCol] || '').trim();
    const curKurz = String(row[kurzCol] || '').trim();

    const eintrag = artLexikonByLat_(curLat) || artLexikonByKey_(curKurz) || artLexikonByKey_(curLat);
    if (!eintrag) continue;
    if (eintrag.lat === curLat && eintrag.kurz === curKurz) continue; // bereits normalisiert

    changes.push({ versuchsnr, row: i + 1, vorher: { lat: curLat, kurz: curKurz }, nachher: { lat: eintrag.lat, kurz: eintrag.kurz } });
    if (!dryRun) {
      sheet.getRange(i + 1, latCol + 1).setValue(eintrag.lat);
      sheet.getRange(i + 1, kurzCol + 1).setValue(eintrag.kurz);
    }
  }
  if (!dryRun) SpreadsheetApp.flush();

  Logger.log('===== normalizeIndexArten (dryRun=' + dryRun + ') =====');
  changes.forEach(c => Logger.log(JSON.stringify(c)));
  return { dryRun, anzahlAenderungen: changes.length, changes };
}
