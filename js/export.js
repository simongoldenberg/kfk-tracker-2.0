// CSV-Export der Zaehldaten inkl. Standort (Regal/Boden je Tray).
// Spaltenreihenfolge: Position, Tray, Regal, Boden, Treatment, AZ-Spalten,
// Sigma KFK, KFK%. "Position" = Topf-Nummer im Raster.
//
// UMD-artig wie js/standorte.js: klassisches <script> im Frontend, CJS-Require
// unter Vitest/Node fuer Tests.
(function (root, factory) {
  const KfkStandorteMod = (typeof require !== 'undefined')
    ? require('./standorte.js')
    : (root ? root.KfkStandorte : null);
  const mod = factory(KfkStandorteMod);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.KfkExport = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function (KfkStandorte) {

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

  // Welche AZ-Spalten haben ueberhaupt Daten (Ausnahme: keine -> leere Liste).
  function detectAzList(daten, azScan) {
    const list = [];
    for (let az = 1; az <= azScan; az++) {
      if (daten.some(d => isMesswert(d['az' + az + '_zahl']))) list.push(az);
    }
    return list;
  }

  function buildExportRows(v, daten) {
    const samen = Number(v.samen_pro_topf || 36);
    const azGeplant = Number(v.az_geplant || 3);
    const azScan = Math.max(azGeplant, 5);
    const azList = detectAzList(daten || [], azScan);
    const standorte = KfkStandorte.migrateVersuchStandorte(v);

    const header = ['Position', 'Tray', 'Regal', 'Boden', 'Treatment']
      .concat(azList.map(a => 'AZ' + a))
      .concat(['Σ KFK', 'KFK%']);

    const sorted = (daten || []).slice().sort((a, b) =>
      (Number(a.tray || 1) - Number(b.tray || 1)) || (Number(a.topf || 0) - Number(b.topf || 0))
    );

    const rows = sorted.map(d => {
      const tray = Number(d.tray || 1);
      const standort = KfkStandorte.standortForTray(standorte, tray);
      const code = String(d.treatment || '').split(/[\s(]/)[0];
      const azValues = azList.map(az => isMesswert(d['az' + az + '_zahl']) ? Number(d['az' + az + '_zahl']) : '');
      const summe = azList.length ? cumulativeAZValue(d, azList[azList.length - 1]) : '';
      const kfk = (summe !== '' && samen) ? Math.round((summe / samen) * 1000) / 10 : '';

      const pos = (d.block && d.wdh) ? String(d.block) + String(d.wdh) : (d.topf || '');
      return [pos, tray, standort.regal == null ? '' : standort.regal, standort.boden == null ? '' : standort.boden, code]
        .concat(azValues)
        .concat([summe, kfk]);
    });

    return { header, rows };
  }

  function csvCell(val) {
    const s = val == null ? '' : String(val);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsvString(header, rows) {
    return [header].concat(rows).map(r => r.map(csvCell).join(';')).join('\n');
  }

  function buildExportCsv(v, daten) {
    const { header, rows } = buildExportRows(v, daten);
    return toCsvString(header, rows);
  }

  return { isMesswert, cumulativeAZValue, detectAzList, buildExportRows, toCsvString, buildExportCsv };
});
