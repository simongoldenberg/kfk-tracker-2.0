import { describe, it, expect } from 'vitest';
import { applyImportStandorte, isStandortFehlend } from '../js/standorte.js';

describe('applyImportStandorte (Punkt 5: KFK-DATA-Import, Schema kfk-protocol-v2)', () => {
  it('uebernimmt regal/boden aus dem KFK-DATA-Feld `standorte`', () => {
    const v = { anzahl_trays: 2 };
    const imported = [{ tray: 1, regal: 2, boden: 1 }, { tray: 2, regal: 2, boden: 3 }];
    const result = applyImportStandorte(v, imported);
    expect(result).toEqual([
      { tray: 1, regal: 2, boden: 1, erfasstAm: null },
      { tray: 2, regal: 2, boden: 3, erfasstAm: null }
    ]);
  });

  it('Schema v1 ohne `standorte`-Feld: bleibt leer, kein Raten (Hinweis greift weiterhin)', () => {
    const v = { anzahl_trays: 1 };
    const result = applyImportStandorte(v, null);
    expect(result).toEqual([{ tray: 1, regal: null, boden: null, erfasstAm: null }]);
    expect(isStandortFehlend(result[0])).toBe(true);
  });

  it('unvollstaendiger Import (nicht alle Trays geliefert) laesst fehlende Trays leer', () => {
    const v = { anzahl_trays: 2 };
    const imported = [{ tray: 1, regal: 3, boden: 2 }];
    const result = applyImportStandorte(v, imported);
    expect(result[0]).toEqual({ tray: 1, regal: 3, boden: 2, erfasstAm: null });
    expect(isStandortFehlend(result[1])).toBe(true);
  });
});
