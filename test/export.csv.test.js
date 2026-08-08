import { describe, it, expect } from 'vitest';
import { buildExportRows, toCsvString } from '../js/export.js';

describe('buildExportRows (Punkt 4: CSV-Export)', () => {
  const v = {
    versuchsnr: '26_024',
    anzahl_trays: 2,
    samen_pro_topf: 36,
    az_geplant: 2,
    standorte: [
      { tray: 1, regal: 2, boden: 1, erfasstAm: '2026-08-01' },
      { tray: 2, regal: 4, boden: 5, erfasstAm: '2026-08-01' }
    ]
  };
  const daten = [
    { topf: 1, tray: 1, block: 'A', wdh: 1, treatment: 'T0 (Kontrolle)', az1_zahl: 5, az2_zahl: 3 },
    { topf: 1, tray: 2, block: 'A', wdh: 1, treatment: 'T1 (Chitosan)', az1_zahl: 2, az2_zahl: '' }
  ];

  it('hat die Spaltenreihenfolge Position, Tray, Regal, Boden, Treatment, AZ.., Σ KFK, KFK%', () => {
    const { header } = buildExportRows(v, daten);
    expect(header).toEqual(['Position', 'Tray', 'Regal', 'Boden', 'Treatment', 'AZ1', 'AZ2', 'Σ KFK', 'KFK%']);
  });

  it('fuellt Regal/Boden aus dem Standort des jeweiligen Trays', () => {
    const { rows } = buildExportRows(v, daten);
    const tray1Row = rows.find(r => r[1] === 1);
    const tray2Row = rows.find(r => r[1] === 2);
    expect(tray1Row.slice(0, 4)).toEqual([1, 1, 2, 1]);
    expect(tray2Row.slice(0, 4)).toEqual([1, 2, 4, 5]);
  });

  it('berechnet Σ KFK (kumulativ) und KFK% korrekt', () => {
    const { rows } = buildExportRows(v, daten);
    const tray1Row = rows.find(r => r[1] === 1);
    // AZ1=5, AZ2=3 -> Summe 8, 8/36*100 = 22.2%
    expect(tray1Row.slice(-2)).toEqual([8, 22.2]);
  });

  it('serialisiert als Semikolon-CSV, Header zuerst', () => {
    const { header, rows } = buildExportRows(v, daten);
    const csv = toCsvString(header, rows);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Position;Tray;Regal;Boden;Treatment;AZ1;AZ2;Σ KFK;KFK%');
    expect(lines.length).toBe(1 + rows.length);
  });

  it('zeigt fehlenden Standort als leere Zellen (kein Raten)', () => {
    const vOhneStandort = { ...v, standorte: [] };
    const { rows } = buildExportRows(vOhneStandort, daten);
    rows.forEach(r => expect(r.slice(2, 4)).toEqual(['', '']));
  });
});
