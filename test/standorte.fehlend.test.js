import { describe, it, expect } from 'vitest';
import { migrateVersuchStandorte, isStandortFehlend, standortForTray } from '../js/standorte.js';
import { buildExportRows } from '../js/export.js';

describe('Verhalten bei fehlendem Standort (Punkt 3 + 6)', () => {
  it('isStandortFehlend: beide Werte null -> fehlt', () => {
    expect(isStandortFehlend({ tray: 1, regal: null, boden: null, erfasstAm: null })).toBe(true);
  });

  it('isStandortFehlend: nur ein Wert gesetzt -> gilt weiterhin als fehlend (kein Raten der zweiten Haelfte)', () => {
    expect(isStandortFehlend({ tray: 1, regal: 3, boden: null, erfasstAm: null })).toBe(true);
    expect(isStandortFehlend({ tray: 1, regal: null, boden: 2, erfasstAm: null })).toBe(true);
  });

  it('isStandortFehlend: beide Werte gesetzt -> nicht fehlend', () => {
    expect(isStandortFehlend({ tray: 1, regal: 3, boden: 2, erfasstAm: '2026-08-01' })).toBe(false);
  });

  it('standortForTray liefert einen leeren Standort fuer einen unbekannten Tray statt zu werfen', () => {
    const standorte = migrateVersuchStandorte({ anzahl_trays: 1 });
    expect(standortForTray(standorte, 99)).toEqual({ tray: 99, regal: null, boden: null, erfasstAm: null });
  });

  it('Export: bei fehlendem Standort bleiben Regal/Boden leer statt geraten - Zaehldaten werden dadurch NICHT blockiert', () => {
    const v = { anzahl_trays: 1, samen_pro_topf: 36, az_geplant: 1 };
    const daten = [{ topf: 1, tray: 1, treatment: 'T0', az1_zahl: 4 }];
    const { rows } = buildExportRows(v, daten);
    expect(rows).toHaveLength(1);
    expect(rows[0].slice(0, 5)).toEqual([1, 1, '', '', 'T0']);
    expect(rows[0].slice(-2)).toEqual([4, 11.1]);
  });
});
