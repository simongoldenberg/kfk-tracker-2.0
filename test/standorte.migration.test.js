import { describe, it, expect } from 'vitest';
import { migrateVersuchStandorte, isStandortFehlend } from '../js/standorte.js';

describe('migrateVersuchStandorte (Punkt 1: Datenmodell/Migration)', () => {
  it('zieht einen Altbestand ohne `standorte` verlustfrei hoch (regal/boden = null)', () => {
    const alt = { versuchsnr: '26_005', anzahl_trays: 1 };
    const result = migrateVersuchStandorte(alt);
    expect(result).toEqual([{ tray: 1, regal: null, boden: null, erfasstAm: null }]);
  });

  it('legt fuer jeden Tray einen Eintrag an, auch bei mehreren Trays', () => {
    const alt = { versuchsnr: '26_024', anzahl_trays: 2 };
    const result = migrateVersuchStandorte(alt);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.tray)).toEqual([1, 2]);
    result.forEach(s => expect(isStandortFehlend(s)).toBe(true));
  });

  it('behaelt vorhandene Standorte unveraendert und ergaenzt nur fehlende Trays', () => {
    const v = {
      anzahl_trays: 2,
      standorte: [{ tray: 1, regal: 3, boden: 2, erfasstAm: '2026-08-01' }]
    };
    const result = migrateVersuchStandorte(v);
    expect(result).toEqual([
      { tray: 1, regal: 3, boden: 2, erfasstAm: '2026-08-01' },
      { tray: 2, regal: null, boden: null, erfasstAm: null }
    ]);
    expect(isStandortFehlend(result[0])).toBe(false);
    expect(isStandortFehlend(result[1])).toBe(true);
  });

  it('ist idempotent (mehrfaches Migrieren aendert nichts mehr)', () => {
    const v = { anzahl_trays: 1, standorte: [{ tray: 1, regal: 4, boden: 1, erfasstAm: '2026-08-01' }] };
    const once = migrateVersuchStandorte(v);
    const twice = migrateVersuchStandorte({ ...v, standorte: once });
    expect(twice).toEqual(once);
  });
});
