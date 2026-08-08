import { describe, it, expect } from 'vitest';
import { cumulativeAZValue, isMesswert } from '../js/export.js';

// cumulativeAZValue (js/export.js) ist die modularisierte Variante von
// cumulativeAZSum (index.html). Unterschied: kein overrideVal-Parameter.
// Beide berechnen Summe(AZ1..az) je Topf, da je Runde nur die NEU gekeimten
// Samen eingetragen und danach aus dem Topf gezogen werden.

describe('cumulativeAZValue — kumulative Summe je Topf', () => {
  it('gibt leer zurueck wenn keine AZ-Runde erfasst wurde', () => {
    expect(cumulativeAZValue({}, 3)).toBe('');
  });

  it('gibt leer zurueck wenn alle Felder null/leer/undefined sind', () => {
    const d = { az1_zahl: null, az2_zahl: '', az3_zahl: undefined };
    expect(cumulativeAZValue(d, 3)).toBe('');
  });

  it('summiert eine einzelne Runde korrekt', () => {
    expect(cumulativeAZValue({ az1_zahl: 7 }, 1)).toBe(7);
  });

  it('summiert mehrere Runden kumulativ', () => {
    const d = { az1_zahl: 5, az2_zahl: 3, az3_zahl: 2 };
    expect(cumulativeAZValue(d, 3)).toBe(10);
  });

  it('beruecksichtigt nur Runden bis einschliesslich az', () => {
    const d = { az1_zahl: 5, az2_zahl: 3, az3_zahl: 2 };
    expect(cumulativeAZValue(d, 2)).toBe(8);
    expect(cumulativeAZValue(d, 1)).toBe(5);
  });

  it('behandelt Runde mit Wert 0 als erfasst (gibt 0 zurueck, nicht leer)', () => {
    expect(cumulativeAZValue({ az1_zahl: 0 }, 1)).toBe(0);
  });

  it('ignoriert Luecken — fehlende fruehe Runde wird uebersprungen', () => {
    // AZ1 fehlt, AZ2 = 4 → Summe 4
    const d = { az1_zahl: '', az2_zahl: 4 };
    expect(cumulativeAZValue(d, 2)).toBe(4);
  });

  it('akzeptiert Zahlwerte als Strings', () => {
    const d = { az1_zahl: '5', az2_zahl: '3' };
    expect(cumulativeAZValue(d, 2)).toBe(8);
  });
});

describe('isMesswert', () => {
  it('erkennt gueltige Zahlen und Strings', () => {
    expect(isMesswert(0)).toBe(true);
    expect(isMesswert(5)).toBe(true);
    expect(isMesswert('3')).toBe(true);
    expect(isMesswert('0')).toBe(true);
  });

  it('lehnt leer, null, undefined ab', () => {
    expect(isMesswert('')).toBe(false);
    expect(isMesswert(null)).toBe(false);
    expect(isMesswert(undefined)).toBe(false);
  });
});
