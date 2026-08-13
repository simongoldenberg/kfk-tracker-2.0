// CSV-Export der Zaehldaten im Long-Format: eine Zeile pro (Versuch x Topf x
// AZ), damit Exporte mehrerer Versuche fuer die versuchsuebergreifende
// Meta-Analyse (R-Auswerteskript) einfach aneinandergehaengt werden koennen.
// Spaltenreihenfolge exakt nach Projektauftrag "Chargen-IDs, Aktivierung &
// Long-Format" Punkt 9 - siehe CLAUDE.md "Chargen-IDs".
//
// UMD-artig wie js/standorte.js: klassisches <script> im Frontend, CJS-Require
// unter Vitest/Node fuer Tests.
(function (root, factory) {
  const KfkStandorteMod = (typeof require !== 'undefined')
    ? require('./standorte.js')
    : (root ? root.KfkStandorte : null);
  const KfkChargenMod = (typeof require !== 'undefined')
    ? require('./chargen.js')
    : (root ? root.KfkChargen : null);
  const mod = factory(KfkStandorteMod, KfkChargenMod);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.KfkExport = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (KfkStandorte, KfkChargen) {

  const CSV_HEADER = [
    'versuchsnr', 'az_nr', 'datum', 'tage_nach_aktivierung', 'aussaat_datum', 'aktivierung_datum',
    'ruhedauer_tage', 'tray', 'col', 'row', 'treatment_code', 'treatment_label', 'anker',
    'neu_gekeimt', 'samen_pro_topf', 'kum_gekeimt', 'kfk_prozent', 'rel_kfk_prozent',
    'regal', 'boden', 'randposition',
    'saatgutcharge_id', 'charge_kfk_potenzial',
    'pelletcharge_id', 'matrixzusammensetzung', 'schichtdicke', 'pelletiert_von',
    'substratcharge_id', 'substrat_basis', 'substrat_zuschlag', 'substrat_verhaeltnis',
    'substrat_lieferant_lot', 'substrat_ec', 'substrat_ph',
    'dickenklasse', 'zaehlperson', 'anmerkung'
  ];

  // Numerische Zelle? (identisch zu isMesswert_ im Backend, kfk-apps-script.gs)
  function isMesswert(x) {
    return x !== '' && x != null && !isNaN(Number(x));
  }

  // Kumulative Keimzahl eines Topfes bis (inkl.) Runde az (identisch zu
  // cumulativeAZValue_ im Backend) - '' wenn bis dahin kein Wert erfasst wurde.
  function cumulativeAZValue(d, az) {
    let sum = 0, any = false;
    for (let a = 1; a <= az; a++) {
      if (isMesswert(d['az' + a + '_zahl'])) { sum += Number(d['az' + a + '_zahl']); any = true; }
    }
    return any ? sum : '';
  }

  // Welche AZ-Runden haben ueberhaupt irgendwo Daten (Ausnahme: keine -> leere Liste).
  function detectAzList(daten, azScan) {
    const list = [];
    for (let az = 1; az <= azScan; az++) {
      if (daten.some(d => isMesswert(d['az' + az + '_zahl']))) list.push(az);
    }
    return list;
  }

  // Tage zwischen zwei 'YYYY-MM-DD'-Strings, oder '' wenn eines fehlt/kaputt ist.
  function tageZwischen(vonDatum, bisDatum) {
    const von = KfkChargen.parseIsoDate(vonDatum);
    const bis = KfkChargen.parseIsoDate(bisDatum);
    if (!von || !bis) return '';
    return Math.round((bis.getTime() - von.getTime()) / 86400000);
  }

  function buildExportRows(v, daten) {
    const samen = Number(v.samen_pro_topf || 36);
    const azGeplant = Number(v.az_geplant || 3);
    const azScan = Math.max(azGeplant, 5);
    const azList = detectAzList(daten || [], azScan);
    const standorte = KfkStandorte.migrateVersuchStandorte(v);
    const treatmentMap = {};
    (v.treatments || []).forEach(t => { treatmentMap[t.code] = t; });
    const rasterCols = Number(v.raster_cols || 4);
    const rasterRows = Number(v.raster_rows || 6);
    const ruhedauer = KfkChargen.ruhedauerTage(v.aussaat_datum, v.aktivierung_datum);

    const sorted = (daten || []).slice().sort((a, b) =>
      (Number(a.tray || 1) - Number(b.tray || 1)) || (Number(a.topf || 0) - Number(b.topf || 0))
    );

    const rows = [];
    sorted.forEach(d => {
      const tray = Number(d.tray || 1);
      const standort = KfkStandorte.standortForTray(standorte, tray);
      const code = String(d.treatment || '').split(/[\s(]/)[0];
      const t = treatmentMap[code] || {};

      azList.forEach(az => {
        const neuGekeimt = isMesswert(d['az' + az + '_zahl']) ? Number(d['az' + az + '_zahl']) : '';
        const kumGekeimt = cumulativeAZValue(d, az);
        const kfkProzent = (kumGekeimt !== '' && samen) ? Math.round((kumGekeimt / samen) * 1000) / 10 : '';
        const datum = d['az' + az + '_datum'] || '';
        const relKfk = kfkProzent === '' ? null : KfkChargen.relKfk(kfkProzent, v.charge_kfk_potenzial);

        rows.push([
          v.versuchsnr, az, datum,
          tageZwischen(v.aktivierung_datum, datum),
          v.aussaat_datum || '', v.aktivierung_datum || '',
          ruhedauer == null ? '' : ruhedauer,
          tray, d.block || '', d.wdh || '',
          code, t.label || '', t.anker || '',
          neuGekeimt, samen, kumGekeimt, kfkProzent,
          relKfk == null ? '' : relKfk,
          standort.regal == null ? '' : standort.regal,
          standort.boden == null ? '' : standort.boden,
          d.block ? KfkChargen.randposition(d.block, d.wdh, rasterCols, rasterRows) : '',
          v.saatgutcharge_id || '', v.charge_kfk_potenzial || '',
          t.pelletcharge_id || '', t.matrixzusammensetzung || '', t.schichtdicke || '', t.pelletiert_von || '',
          v.substratcharge_id || '', v.substrat_basis || '', v.substrat_zuschlag || '', v.substrat_verhaeltnis || '',
          v.substrat_lieferant_lot || '', v.substrat_ec || '', v.substrat_ph || '',
          '', // dickenklasse - noch kein eigenes Feld in der App (siehe CLAUDE.md "Chargen-IDs")
          d['az' + az + '_benutzer'] || '',
          '' // anmerkung - kein per-Zaehlwert-Notizfeld in der App vorhanden
        ]);
      });
    });

    return { header: CSV_HEADER.slice(), rows };
  }

  // RFC 4180: Komma-getrennt, Anfuehrungszeichen bei Komma/Anfuehrungszeichen/
  // Zeilenumbruch (matrixzusammensetzung kann mehrzeilig sein).
  function csvCell(val) {
    const s = val == null ? '' : String(val);
    return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsvString(header, rows) {
    return [header].concat(rows).map(r => r.map(csvCell).join(',')).join('\n');
  }

  function buildExportCsv(v, daten) {
    const { header, rows } = buildExportRows(v, daten);
    return toCsvString(header, rows);
  }

  return { isMesswert, cumulativeAZValue, detectAzList, buildExportRows, toCsvString, buildExportCsv };
});
