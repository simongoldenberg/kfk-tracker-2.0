// Chargen-IDs, Aussaat/Aktivierung-Trennung und abgeleitete Kennzahlen.
// Buendelt alle reinen, testbaren Funktionen fuer das Chargenprotokoll
// (Pelletierung + Substrat) und die neue Aussaat-vs-Aktivierung-Logik, damit
// index.html und kfk-apps-script.gs dieselbe Logik nutzen koennen (Backend
// dupliziert die relevanten Teile analog zu migrateVersuchStandorte_, siehe
// Kommentar dort).
//
// UMD-artiger Export wie js/standorte.js: klassisches <script>-Tag im
// Frontend haengt an window.KfkChargen, Vitest importiert dieselbe Datei per
// ESM/CJS-Interop - kein Build-Schritt noetig.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.KfkChargen = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {

  // Parst 'YYYY-MM-DD' (Format der <input type="date">-Felder) ohne
  // Zeitzonen-Verschiebung - new Date('YYYY-MM-DD') interpretiert UTC-Mitternacht,
  // was in Zeitzonen westlich von UTC auf den Vortag zurueckfallen kann.
  function parseIsoDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  // Prueft einen Datums-String gegen eine Menge erlaubter Wochentage (0=So..6=Sa).
  // Liefert null bei nicht parsbarem/leerem Datum (kein Raten, keine Warnung ohne Wert).
  function wochentagCheck(dateStr, erlaubteTage) {
    const d = parseIsoDate(dateStr);
    if (!d) return null;
    const tag = d.getDay();
    return {
      tag,
      wochentagName: WOCHENTAGE[tag],
      erlaubt: erlaubteTage.indexOf(tag) !== -1
    };
  }

  // Aussaat: Montag(1) - Donnerstag(4).
  function aussaatWochentagCheck(dateStr) {
    return wochentagCheck(dateStr, [1, 2, 3, 4]);
  }
  // Aktivierung: nur Donnerstag(4).
  function aktivierungWochentagCheck(dateStr) {
    return wochentagCheck(dateStr, [4]);
  }

  // Ruhedauer in Tagen zwischen Aussaat und Aktivierung. null wenn eines der
  // beiden Daten fehlt oder nicht parsbar ist (kein Raten).
  function ruhedauerTage(aussaatDatum, aktivierungDatum) {
    const a = parseIsoDate(aussaatDatum);
    const b = parseIsoDate(aktivierungDatum);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }
  function ruhedauerWarnung(tage) {
    return tage != null && tage > 4;
  }

  // AZ-Termine-Vorschlaege (Tage nach Aktivierung) je Artengruppe. Bewusst
  // vorlaeufig bei Gehoelzen (siehe Projektauftrag) - nach ein paar Versuchen
  // je Art gegen echte Keimverlaeufe pruefen.
  const AZ_TERMINE_VORSCHLAG = {
    kurz: [4, 7, 11],           // Hanf, Weizen
    mittel: [7, 14, 21, 28],    // SKi, WKi, ELae (+ Fallback fuer unbekannte Arten)
    lang: [14, 21, 28, 35]      // KueTa
  };

  // Normalisiert einen Kurz-/Lat-Artnamen fuer den Gruppen-Vergleich (analog
  // normArtKey_ im Backend): Kleinschreibung, Umlaute aufgeloest.
  function normArtGruppenKey_(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z]/g, '');
  }
  const ARTENGRUPPEN_ZUORDNUNG = {
    hanf: 'kurz', weizen: 'kurz', triticumaestivum: 'kurz',
    ski: 'mittel', schwarzkiefer: 'mittel', pinusnigra: 'mittel',
    wki: 'mittel', waldkiefer: 'mittel', kiefer: 'mittel', pinussylvestris: 'mittel',
    ela: 'mittel', elae: 'mittel', laerche: 'mittel', larixdecidua: 'mittel',
    kueta: 'lang', kuestentanne: 'lang'
  };
  // Liefert die Artengruppe ('kurz'|'mittel'|'lang') fuer AZ-Termin-Vorschlaege.
  // Unbekannte/neue Arten fallen auf 'mittel' zurueck (SKi/WKi/ELae-Rhythmus) -
  // bewusst der mittlere, nicht der kuerzeste Standardwert, siehe Projektauftrag.
  function artengruppeFor(baumartKurz, baumartLat) {
    const keyKurz = normArtGruppenKey_(baumartKurz);
    const keyLat = normArtGruppenKey_(baumartLat);
    return ARTENGRUPPEN_ZUORDNUNG[keyKurz] || ARTENGRUPPEN_ZUORDNUNG[keyLat] || 'mittel';
  }
  function azTermineVorschlag(baumartKurz, baumartLat) {
    return AZ_TERMINE_VORSCHLAG[artengruppeFor(baumartKurz, baumartLat)].slice();
  }

  // EC > 1.0 mS/cm gilt als hoch (senkt die Keimung).
  function substratEcWarnung(ec) {
    return ec !== '' && ec != null && !isNaN(Number(ec)) && Number(ec) > 1.0;
  }

  // Weiche Format-Hinweise (kein Blocker) fuer die Chargen-IDs aus dem
  // Papierprotokoll. SUB-MM-TT-X bzw. P-MM-TT-X / P-JJJJ-MM-TT-X.
  function substratchargeIdFormatOk(id) {
    return /^SUB-\d{2}-\d{2}-[A-Za-z0-9]+$/.test(String(id || '').trim());
  }
  function pelletchargeIdFormatOk(id) {
    const s = String(id || '').trim();
    return /^P-\d{2}-\d{2}-[A-Za-z0-9]+$/.test(s) || /^P-\d{4}-\d{2}-\d{2}-[A-Za-z0-9]+$/.test(s);
  }

  // rel. KFK = kumulative KFK% eines Topfes / Chargenpotenzial * 100. null bei
  // fehlendem/nullwertigem Potenzial (Anzeige "-" statt Fehler), keine Kappung
  // nach oben.
  function relKfk(kumulativeKfkProzent, chargeKfkPotenzial) {
    const potenzial = Number(chargeKfkPotenzial);
    if (!potenzial || isNaN(potenzial)) return null;
    if (kumulativeKfkProzent === '' || kumulativeKfkProzent == null || isNaN(Number(kumulativeKfkProzent))) return null;
    return Math.round((Number(kumulativeKfkProzent) / potenzial) * 100 * 10) / 10;
  }

  // Randposition eines Topfes: 'aussen' wenn die Spalte (Buchstabe) die erste
  // oder letzte ist ODER die Reihe die erste oder letzte ist, sonst 'innen'.
  // Generisch ueber raster_cols/raster_rows, nicht auf A-D/4 Spalten fixiert.
  function randposition(col, row, rasterCols, rasterRows) {
    const colIdx = String(col || '').toUpperCase().charCodeAt(0) - 65; // 'A' -> 0
    const rowNum = Number(row);
    const lastCol = Number(rasterCols) - 1;
    const lastRow = Number(rasterRows);
    const aussenSpalte = colIdx === 0 || colIdx === lastCol;
    const aussenReihe = rowNum === 1 || rowNum === lastRow;
    return (aussenSpalte || aussenReihe) ? 'aussen' : 'innen';
  }

  // ---- Pflichtfeld-Pruefungen ----

  // Breite Liste fuer den gelben "Fehlende Angaben"-Banner (Versuchsansicht):
  // alles was fuer die spaetere Meta-Analyse gebraucht wird, aber (noch) leer
  // ist - blockiert nichts, weist nur hin.
  const IMPORT_PFLICHTFELDER = [
    { feld: 'aussaat_datum', label: 'Aussaat-Datum' },
    { feld: 'aktivierung_datum', label: 'Aktivierungs-Datum' },
    { feld: 'ruhephase_bestaetigt', label: 'Ruhephase bestätigt', istLeer: v => !v.ruhephase_bestaetigt },
    { feld: 'saatgutcharge_id', label: 'Saatgutcharge-ID' },
    { feld: 'charge_kfk_potenzial', label: 'Potenzial-KFK der Charge', istLeer: v => !v.charge_kfk_potenzial },
    { feld: 'substratcharge_id', label: 'Substratcharge-ID' },
    { feld: 'substrat_basis', label: 'Substrat-Basis' },
    { feld: 'substrat_verhaeltnis', label: 'Substrat-Verhältnis' }
  ];
  function istFeldLeer_(v, def) {
    if (def.istLeer) return def.istLeer(v);
    const val = v ? v[def.feld] : undefined;
    return val === '' || val == null;
  }
  function missingImportFields(v) {
    if (!v) return IMPORT_PFLICHTFELDER.slice();
    return IMPORT_PFLICHTFELDER.filter(def => istFeldLeer_(v, def));
  }

  // Engere Liste fuer den Abschluss-Block (AZ-Runde UND Versuchsende): exakt
  // die in Punkt 7 des Projektauftrags genannten Felder, plus pelletcharge_id
  // je Treatment das nicht als nackte Saat markiert ist.
  const ABSCHLUSS_PFLICHTFELDER = [
    { feld: 'saatgutcharge_id', label: 'Saatgutcharge-ID' },
    { feld: 'charge_kfk_potenzial', label: 'Potenzial-KFK der Charge', istLeer: v => !v.charge_kfk_potenzial },
    { feld: 'substratcharge_id', label: 'Substratcharge-ID' },
    { feld: 'substrat_verhaeltnis', label: 'Substrat-Verhältnis' },
    { feld: 'aktivierung_datum', label: 'Aktivierungs-Datum' },
    { feld: 'ruhephase_bestaetigt', label: 'Ruhephase bestätigt', istLeer: v => !v.ruhephase_bestaetigt }
  ];
  function missingAbschlussFields(v, treatments) {
    const fehlend = ABSCHLUSS_PFLICHTFELDER.filter(def => istFeldLeer_(v || {}, def)).slice();
    (treatments || []).forEach(t => {
      if (t && !t.nackte_saat && (t.pelletcharge_id === '' || t.pelletcharge_id == null)) {
        fehlend.push({ feld: 'pelletcharge_id', label: 'Pelletcharge-ID (' + (t.code || '?') + ')', treatmentCode: t.code });
      }
    });
    return fehlend;
  }

  // Parst eine per Tab oder Semikolon getrennte Zeile aus dem
  // Chargenprotokoll Pelletierung: Versuchs-Nr · Saatgutcharge · Pelletcharge ·
  // Matrix · Datum · Anmerkung · Schichtdicke · Person. Liefert null bei zu
  // wenigen Feldern (kein Raten bei unvollstaendiger Zeile).
  function parsePelletProtokollZeile(line) {
    const s = String(line || '').trim();
    if (!s) return null;
    const parts = s.indexOf('\t') !== -1 ? s.split('\t') : s.split(';');
    const trimmed = parts.map(p => p.trim());
    if (trimmed.length < 8) return null;
    const [versuchsnr, saatgutchargeId, pelletchargeId, matrixzusammensetzung, pelletierDatum, pelletierAnmerkung, schichtdicke, pelletiertVon] = trimmed;
    return { versuchsnr, saatgutchargeId, pelletchargeId, matrixzusammensetzung, pelletierDatum, pelletierAnmerkung, schichtdicke, pelletiertVon };
  }

  return {
    parseIsoDate,
    aussaatWochentagCheck,
    aktivierungWochentagCheck,
    ruhedauerTage,
    ruhedauerWarnung,
    AZ_TERMINE_VORSCHLAG,
    artengruppeFor,
    azTermineVorschlag,
    substratEcWarnung,
    substratchargeIdFormatOk,
    pelletchargeIdFormatOk,
    relKfk,
    randposition,
    missingImportFields,
    missingAbschlussFields,
    parsePelletProtokollZeile
  };
});
