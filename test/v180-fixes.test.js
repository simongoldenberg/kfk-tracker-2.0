// Regressionstests fuer die v1.8.0-Korrekturen aus dem Abgleich
// Projekt "Forschungsplan_Skyseed" <-> Tracker vom 15.08.2026:
//   1. Kernregel: KFK = AZ1 + AZ2 + AZ3 + ... (kumulativ, nie ein Einzelwert)
//   2. Dickenklasse je Topf ist eine echte Kovariate im Long-Format-Export
//   3. az_geplant wird aus az_termine abgeleitet (Gehoelze brauchen 4 Tabs)
//   4. posten_nr und saatgutcharge_id sind DIESELBE Groesse
import { describe, it, expect } from 'vitest';
import { parseAndValidateKfkData, azGeplantAbleiten } from '../js/paste-import.js';
import { buildExportRows, cumulativeAZValue } from '../js/export.js';
import * as KfkChargen from '../js/chargen.js';


function kfkBlock(extra) {
  return JSON.stringify(Object.assign({
    schema: 'kfk-protocol-v3',
    versuchsnr: '26_040',
    titel: 'Testversuch',
    treatments: [{ code: 'T0', label: 'Kontrolle', color: '#22c55e' }],
    rbd: [{ tray: 1, col: 'A', row: 1, t: 'T0' }]
  }, extra || {}));
}

describe('1. Kernregel KFK = AZ1 + AZ2 + AZ3 (kumulativ)', () => {
  it('summiert die Rundenwerte, statt einen Einzelwert zu nehmen', () => {
    const d = { az1_zahl: 5, az2_zahl: 3, az3_zahl: 2 };
    expect(cumulativeAZValue(d, 1)).toBe(5);
    expect(cumulativeAZValue(d, 2)).toBe(8);
    expect(cumulativeAZValue(d, 3)).toBe(10);
  });

  it('Referenzfall aus dem Abgleich: 5/3/2 bei 36 Samen ergibt 27,8 % - nicht 5,6 %', () => {
    const v = {
      versuchsnr: '26_040', anzahl_trays: 1, samen_pro_topf: 36, az_geplant: 3,
      raster_cols: 4, raster_rows: 6, charge_kfk_potenzial: 80,
      treatments: [{ code: 'T0', label: 'Kontrolle', anker: 't0', nackte_saat: true }],
      standorte: [{ tray: 1, regal: 1, boden: 1 }]
    };
    const daten = [{
      topf: 1, tray: 1, block: 'A', wdh: 1, treatment: 'T0 (Kontrolle)',
      az1_zahl: 5, az2_zahl: 3, az3_zahl: 2
    }];
    const { header, rows } = buildExportRows(v, daten);
    const iKum = header.indexOf('kum_gekeimt');
    const iKfk = header.indexOf('kfk_prozent');
    const iRel = header.indexOf('rel_kfk_prozent');
    const iNeu = header.indexOf('neu_gekeimt');

    expect(rows).toHaveLength(3);              // eine Zeile je AZ
    expect(rows[2][iNeu]).toBe(2);             // AZ3 roh = nur die neuen
    expect(rows[2][iKum]).toBe(10);            // kumulativ = 5 + 3 + 2
    expect(rows[2][iKfk]).toBeCloseTo(27.8, 1);
    expect(rows[2][iRel]).toBe(34.8);          // 27,8 / 80 * 100, auf 1 Dez. gerundet
    // Gegenprobe: der rohe AZ3-Wert allein waere 5,6 % - genau der Fehler,
    // den der alte Auswertungs-Tab produziert hat.
    expect(Math.round(2 / 36 * 1000) / 10).toBeCloseTo(5.6, 1);
  });

  it('kumuliert auch bei Luecken korrekt (AZ2 nicht gezaehlt)', () => {
    const d = { az1_zahl: 4, az2_zahl: '', az3_zahl: 6 };
    expect(cumulativeAZValue(d, 3)).toBe(10);
  });
});

describe('2. Dickenklasse je Topf im Long-Format-Export', () => {
  const v = {
    versuchsnr: '26_041', anzahl_trays: 1, samen_pro_topf: 36, az_geplant: 1,
    raster_cols: 4, raster_rows: 6,
    treatments: [{ code: 'T1', label: 'Pellet', pelletcharge_id: 'P-08-14-A' }],
    standorte: [{ tray: 1, regal: 3, boden: 2 }]
  };

  it('uebernimmt den Topf-Wert in die Spalte dickenklasse', () => {
    const daten = [{
      topf: 1, tray: 1, block: 'B', wdh: 2, treatment: 'T1 (Pellet)',
      az1_zahl: 7, dickenklasse: '2,0-2,5 mm'
    }];
    const { header, rows } = buildExportRows(v, daten);
    expect(header).toContain('dickenklasse');
    expect(rows[0][header.indexOf('dickenklasse')]).toBe('2,0-2,5 mm');
  });

  it('bleibt leer, wenn kein Wert erfasst wurde (kein Raten)', () => {
    const daten = [{ topf: 1, tray: 1, block: 'B', wdh: 2, treatment: 'T1 (Pellet)', az1_zahl: 7 }];
    const { header, rows } = buildExportRows(v, daten);
    expect(rows[0][header.indexOf('dickenklasse')]).toBe('');
  });

  it('Spaltenreihenfolge bleibt exakt wie in der SOP', () => {
    const { header } = buildExportRows(v, []);
    expect(header.join(',')).toBe([
      'versuchsnr', 'az_nr', 'datum', 'tage_nach_aktivierung', 'aussaat_datum', 'aktivierung_datum',
      'ruhedauer_tage', 'tray', 'col', 'row', 'treatment_code', 'treatment_label', 'anker',
      'neu_gekeimt', 'samen_pro_topf', 'kum_gekeimt', 'kfk_prozent', 'rel_kfk_prozent',
      'regal', 'boden', 'randposition',
      'saatgutcharge_id', 'charge_kfk_potenzial',
      'pelletcharge_id', 'matrixzusammensetzung', 'schichtdicke', 'pelletiert_von',
      'substratcharge_id', 'substrat_basis', 'substrat_zuschlag', 'substrat_verhaeltnis',
      'substrat_lieferant_lot', 'substrat_ec', 'substrat_ph',
      'dickenklasse', 'zaehlperson', 'anmerkung'
    ].join(','));
  });
});

describe('3. az_geplant wird aus az_termine abgeleitet', () => {
  it('explizite Angabe gewinnt', () => {
    expect(azGeplantAbleiten(3, [7, 14, 21, 28])).toBe(3);
  });
  it('faellt auf die Anzahl der geplanten Termine zurueck', () => {
    expect(azGeplantAbleiten(null, [7, 14, 21, 28])).toBe(4);
    expect(azGeplantAbleiten(undefined, [4, 7, 11])).toBe(3);
  });
  it('ohne beides null (Aufrufer setzt den App-Default)', () => {
    expect(azGeplantAbleiten(null, null)).toBe(null);
    expect(azGeplantAbleiten(null, [])).toBe(null);
  });
  it('deckelt auf 1..5, weil die App nur fuenf Runden kennt', () => {
    expect(azGeplantAbleiten(null, [1, 2, 3, 4, 5, 6, 7])).toBe(5);
    expect(azGeplantAbleiten(0, [7])).toBe(1);
  });
  it('Gehoelzversuch: vier Termine ergeben vier AZ-Tabs', () => {
    const res = parseAndValidateKfkData(kfkBlock({ az_termine: [7, 14, 21, 28] }));
    expect(res.ok).toBe(true);
    expect(res.data.az_geplant).toBe(4);
    expect(res.data.az_termine).toEqual([7, 14, 21, 28]);
  });
  it('Hanfversuch ohne Angaben bleibt null (App-Default 3 greift)', () => {
    const res = parseAndValidateKfkData(kfkBlock({}));
    expect(res.ok).toBe(true);
    expect(res.data.az_geplant).toBe(null);
  });
});

describe('4. posten_nr und saatgutcharge_id sind dieselbe Groesse', () => {
  it('saatgutcharge_id gewinnt, wenn beide gesetzt sind', () => {
    const res = parseAndValidateKfkData(kfkBlock({ saatgutcharge_id: 'HANF-2026-03', posten_nr: '00248' }));
    expect(res.data.saatgutcharge_id).toBe('HANF-2026-03');
  });
  it('posten_nr wird uebernommen, wenn saatgutcharge_id fehlt (Gehoelze)', () => {
    const res = parseAndValidateKfkData(kfkBlock({ posten_nr: '00248' }));
    expect(res.data.saatgutcharge_id).toBe('00248');
  });
  it('Alt-Feld saatgutcharge hat weiterhin Vorrang vor posten_nr', () => {
    const res = parseAndValidateKfkData(kfkBlock({ saatgutcharge: 'ALT-01', posten_nr: '00248' }));
    expect(res.data.saatgutcharge_id).toBe('ALT-01');
  });
  it('ohne beides leer, nicht geraten', () => {
    const res = parseAndValidateKfkData(kfkBlock({}));
    expect(res.data.saatgutcharge_id).toBe('');
  });
});

describe('5. Nachtraegliche Korrekturen aus der Schlusspruefung', () => {
  it('az_geplant: 0 ist ein Platzhalter und verwirft az_termine nicht', () => {
    expect(azGeplantAbleiten(0, [7, 14, 21, 28])).toBe(4);
    expect(azGeplantAbleiten('', [7, 14, 21, 28])).toBe(4);
    expect(azGeplantAbleiten(false, [4, 7, 11])).toBe(3);
  });

  it('Treatment-Codes muessen dem Muster T+Zahl folgen', () => {
    const bad = JSON.stringify({
      schema: 'kfk-protocol-v3', versuchsnr: '26_042', titel: 'X',
      treatments: [{ code: 'Kontrolle', label: 'K', color: '#22c55e' }],
      rbd: [{ tray: 1, col: 'A', row: 1, t: 'Kontrolle' }]
    });
    const res = parseAndValidateKfkData(bad);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Muster T\+Zahl/);
  });

  it('gueltige Codes T0..T12 werden akzeptiert', () => {
    const good = JSON.stringify({
      schema: 'kfk-protocol-v3', versuchsnr: '26_043', titel: 'X',
      treatments: [{ code: 'T0', label: 'K', color: '#22c55e' }, { code: 'T12', label: 'P', color: '#ef4444' }],
      rbd: [{ tray: 1, col: 'A', row: 1, t: 'T0' }, { tray: 1, col: 'A', row: 2, t: 'T12' }]
    });
    expect(parseAndValidateKfkData(good).ok).toBe(true);
  });

  it('ruhephase_bestaetigt wird aus dem KFK-DATA-Block gelesen', () => {
    const res = parseAndValidateKfkData(kfkBlock({ ruhephase_bestaetigt: true }));
    expect(res.data.ruhephase_bestaetigt).toBe(true);
    expect(parseAndValidateKfkData(kfkBlock({})).data.ruhephase_bestaetigt).toBe(false);
  });
});

describe('6. Artengruppen auch ueber den lateinischen Namen', () => {
  it('Cannabis sativa ergibt das Hanf-Raster, nicht das Gehoelz-Raster', () => {
    expect(KfkChargen.artengruppeFor('', 'Cannabis sativa')).toBe('kurz');
    expect(KfkChargen.azTermineVorschlag('', 'Cannabis sativa')).toEqual([4, 7, 11]);
  });
  it('Abies grandis ergibt das KueTa-Raster', () => {
    expect(KfkChargen.artengruppeFor('', 'Abies grandis')).toBe('lang');
    expect(KfkChargen.azTermineVorschlag('', 'Abies grandis')).toEqual([14, 21, 28, 35]);
  });
  it('Triticum aestivum ergibt das Weizen-Raster', () => {
    expect(KfkChargen.azTermineVorschlag('', 'Triticum aestivum')).toEqual([4, 7, 11]);
  });
  it('unbekannte Arten fallen weiterhin auf den mittleren Rhythmus', () => {
    expect(KfkChargen.azTermineVorschlag('', 'Quercus robur')).toEqual([7, 14, 21, 28]);
  });
});
