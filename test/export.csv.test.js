import { describe, it, expect } from 'vitest';
import { buildExportRows, toCsvString } from '../js/export.js';

describe('buildExportRows (Long-Format: eine Zeile pro Versuch x Topf x AZ)', () => {
  const v = {
    versuchsnr: '26_024',
    anzahl_trays: 2,
    samen_pro_topf: 36,
    az_geplant: 2,
    raster_cols: 4,
    raster_rows: 6,
    aussaat_datum: '2026-08-10',
    aktivierung_datum: '2026-08-13',
    saatgutcharge_id: 'SKi-P34',
    charge_kfk_potenzial: 80,
    substratcharge_id: 'SUB-08-13-A',
    substrat_basis: 'Kokosfaser',
    substrat_verhaeltnis: '60/40',
    treatments: [
      { code: 'T0', label: 'Kontrolle', anker: 't0', nackte_saat: true },
      { code: 'T1', label: 'Chitosan', pelletcharge_id: 'P-08-11-A', matrixzusammensetzung: 'Schicht 1: Test' }
    ],
    standorte: [
      { tray: 1, regal: 2, boden: 1, erfasstAm: '2026-08-01' },
      { tray: 2, regal: 4, boden: 5, erfasstAm: '2026-08-01' }
    ]
  };
  const daten = [
    { topf: 1, tray: 1, block: 'A', wdh: 1, treatment: 'T0 (Kontrolle)',
      az1_zahl: 5, az1_datum: '2026-08-17', az1_benutzer: 'S. G.',
      az2_zahl: 3, az2_datum: '2026-08-24', az2_benutzer: 'S. G.' },
    { topf: 1, tray: 2, block: 'D', wdh: 6, treatment: 'T1 (Chitosan)',
      az1_zahl: 2, az1_datum: '2026-08-17', az1_benutzer: 'F. B.',
      az2_zahl: '', az2_datum: '', az2_benutzer: '' }
  ];

  it('hat exakt die geforderte Spaltenreihenfolge', () => {
    const { header } = buildExportRows(v, daten);
    expect(header).toEqual([
      'versuchsnr', 'az_nr', 'datum', 'tage_nach_aktivierung', 'aussaat_datum', 'aktivierung_datum',
      'ruhedauer_tage', 'tray', 'col', 'row', 'treatment_code', 'treatment_label', 'anker',
      'neu_gekeimt', 'samen_pro_topf', 'kum_gekeimt', 'kfk_prozent', 'rel_kfk_prozent',
      'regal', 'boden', 'randposition',
      'saatgutcharge_id', 'charge_kfk_potenzial',
      'pelletcharge_id', 'matrixzusammensetzung', 'schichtdicke', 'pelletiert_von',
      'substratcharge_id', 'substrat_basis', 'substrat_zuschlag', 'substrat_verhaeltnis',
      'substrat_lieferant_lot', 'substrat_ec', 'substrat_ph',
      'dickenklasse', 'zaehlperson', 'anmerkung'
    ]);
  });

  it('erzeugt eine Zeile pro Topf x AZ-Runde (2 Toepfe x 2 AZ = 4 Zeilen)', () => {
    const { rows } = buildExportRows(v, daten);
    expect(rows.length).toBe(4);
  });

  function rowFor(rows, tray, az) {
    const header = ['versuchsnr', 'az_nr', 'datum', 'tage_nach_aktivierung', 'aussaat_datum', 'aktivierung_datum',
      'ruhedauer_tage', 'tray', 'col', 'row', 'treatment_code', 'treatment_label', 'anker',
      'neu_gekeimt', 'samen_pro_topf', 'kum_gekeimt', 'kfk_prozent', 'rel_kfk_prozent',
      'regal', 'boden', 'randposition', 'saatgutcharge_id', 'charge_kfk_potenzial',
      'pelletcharge_id', 'matrixzusammensetzung', 'schichtdicke', 'pelletiert_von',
      'substratcharge_id', 'substrat_basis', 'substrat_zuschlag', 'substrat_verhaeltnis',
      'substrat_lieferant_lot', 'substrat_ec', 'substrat_ph', 'dickenklasse', 'zaehlperson', 'anmerkung'];
    const idxTray = header.indexOf('tray');
    const idxAz = header.indexOf('az_nr');
    const r = rows.find(row => row[idxTray] === tray && row[idxAz] === az);
    const obj = {};
    header.forEach((h, i) => obj[h] = r[i]);
    return obj;
  }

  it('berechnet tage_nach_aktivierung aus dem tatsaechlichen AZ-Datum je Runde', () => {
    const { rows } = buildExportRows(v, daten);
    const r = rowFor(rows, 1, 1);
    expect(r.datum).toBe('2026-08-17');
    expect(r.tage_nach_aktivierung).toBe(4); // 13.08 -> 17.08
    const r2 = rowFor(rows, 1, 2);
    expect(r2.tage_nach_aktivierung).toBe(11); // 13.08 -> 24.08
  });

  it('berechnet ruhedauer_tage aus aussaat_datum/aktivierung_datum', () => {
    const { rows } = buildExportRows(v, daten);
    expect(rowFor(rows, 1, 1).ruhedauer_tage).toBe(3);
  });

  it('kum_gekeimt und kfk_prozent sind kumulativ ueber die Runden', () => {
    const { rows } = buildExportRows(v, daten);
    expect(rowFor(rows, 1, 1).kum_gekeimt).toBe(5);
    expect(rowFor(rows, 1, 2).kum_gekeimt).toBe(8); // 5+3
    expect(rowFor(rows, 1, 2).kfk_prozent).toBe(22.2); // 8/36*100
  });

  it('rel_kfk_prozent = kfk_prozent / charge_kfk_potenzial * 100', () => {
    const { rows } = buildExportRows(v, daten);
    // kfk_prozent bei AZ1 fuer Tray1 = 5/36*100 = 13.9%, Potenzial 80 -> 17.4%
    expect(rowFor(rows, 1, 1).rel_kfk_prozent).toBeCloseTo(17.4, 1);
  });

  it('col/row kommen direkt aus block/wdh, randposition wird generisch berechnet', () => {
    const { rows } = buildExportRows(v, daten);
    const r1 = rowFor(rows, 1, 1); // Block A, Reihe 1 -> aussen
    expect(r1.col).toBe('A');
    expect(r1.row).toBe(1);
    expect(r1.randposition).toBe('aussen');
    const r2 = rowFor(rows, 2, 1); // Block D, Reihe 6 (4 Spalten x 6 Reihen) -> aussen (letzte Spalte+Reihe)
    expect(r2.randposition).toBe('aussen');
  });

  it('regal/boden kommen aus dem Standort des jeweiligen Trays', () => {
    const { rows } = buildExportRows(v, daten);
    expect(rowFor(rows, 1, 1).regal).toBe(2);
    expect(rowFor(rows, 2, 1).boden).toBe(5);
  });

  it('Chargen-/Substratfelder werden auf jede Zeile durchgereicht', () => {
    const { rows } = buildExportRows(v, daten);
    const r = rowFor(rows, 1, 1);
    expect(r.saatgutcharge_id).toBe('SKi-P34');
    expect(r.charge_kfk_potenzial).toBe(80);
    expect(r.substratcharge_id).toBe('SUB-08-13-A');
    expect(r.anker).toBe('t0');
  });

  it('Treatment-Pelletierfelder kommen aus dem passenden Treatment', () => {
    const { rows } = buildExportRows(v, daten);
    const r = rowFor(rows, 2, 1);
    expect(r.pelletcharge_id).toBe('P-08-11-A');
    expect(r.matrixzusammensetzung).toBe('Schicht 1: Test');
  });

  it('fehlende Werte sind leere Felder, nicht NA oder null', () => {
    const { rows } = buildExportRows(v, daten);
    const r = rowFor(rows, 2, 2); // AZ2 fuer Tray2 wurde nicht gezaehlt
    expect(r.neu_gekeimt).toBe('');
    expect(r.datum).toBe('');
    expect(r.tage_nach_aktivierung).toBe('');
  });

  it('zeigt fehlenden Standort als leere Zellen (kein Raten)', () => {
    const vOhneStandort = { ...v, standorte: [] };
    const { rows } = buildExportRows(vOhneStandort, daten);
    const header = ['tray', 'col']; // nur zur Indexbestimmung, siehe rowFor
    rows.forEach(r => {
      expect(r[18]).toBe(''); // regal
      expect(r[19]).toBe(''); // boden
    });
  });

  it('serialisiert als Komma-CSV (RFC 4180), Header zuerst', () => {
    const { header, rows } = buildExportRows(v, daten);
    const csv = toCsvString(header, rows);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(header.join(','));
    expect(lines.length).toBe(1 + rows.length);
  });

  it('quotet mehrzeilige matrixzusammensetzung korrekt (RFC 4180)', () => {
    const vMitZeilenumbruch = {
      ...v,
      treatments: [
        { code: 'T0', label: 'Kontrolle', anker: 't0', nackte_saat: true },
        { code: 'T1', label: 'Chitosan', matrixzusammensetzung: 'Schicht 1: A\nSchicht 2: B' }
      ]
    };
    const { header, rows } = buildExportRows(vMitZeilenumbruch, daten);
    const csv = toCsvString(header, rows);
    expect(csv).toContain('"Schicht 1: A\nSchicht 2: B"');
  });
});
