import { describe, it, expect } from 'vitest';

// Spiegelt sumStoredAZBefore (index.html:2367) exakt wider.
// Summiert gespeicherte AZ-Werte *vor* Runde az, ohne den Live-Override.
// Wird in index.html fuer die Rundenobergrenze berechnet:
//   rundenMax = Math.max(0, samen - sumStoredAZBefore(d, az))
function sumStoredAZBefore(d, az) {
  let sum = 0;
  for (let a = 1; a < Number(az); a++) {
    const raw = d['az' + a + '_zahl'];
    if (raw !== '' && raw != null && raw !== undefined && !isNaN(Number(raw))) sum += Number(raw);
  }
  return sum;
}

function rundenMax(d, az, samen) {
  return Math.max(0, samen - sumStoredAZBefore(d, az));
}

describe('sumStoredAZBefore — Vorrundenssumme fuer AZ-Begrenzung', () => {
  it('erste Runde (az=1) hat keine Vorrunden → 0', () => {
    const d = { az1_zahl: 5 };
    expect(sumStoredAZBefore(d, 1)).toBe(0);
  });

  it('summiert alle Runden vor az', () => {
    const d = { az1_zahl: 5, az2_zahl: 3, az3_zahl: 2 };
    expect(sumStoredAZBefore(d, 3)).toBe(8);  // AZ1+AZ2
    expect(sumStoredAZBefore(d, 2)).toBe(5);  // AZ1
  });

  it('ignoriert leere Felder in den Vorrunden', () => {
    const d = { az1_zahl: '', az2_zahl: 4 };
    expect(sumStoredAZBefore(d, 3)).toBe(4);
  });

  it('ignoriert null/undefined in den Vorrunden', () => {
    const d = { az1_zahl: null, az2_zahl: undefined, az3_zahl: 6 };
    expect(sumStoredAZBefore(d, 4)).toBe(6);
  });
});

describe('rundenMax — Begrenzung eines AZ-Werts gegen die Restsamenzahl', () => {
  const samen = 36;

  it('erste Runde: Maximum = alle Samen', () => {
    expect(rundenMax({}, 1, samen)).toBe(samen);
  });

  it('nach Teilernte: Maximum = Restmenge', () => {
    const d = { az1_zahl: 10 };
    expect(rundenMax(d, 2, samen)).toBe(26); // 36 - 10
  });

  it('nach mehreren Runden: Maximum = kumulativ verbleibende Samen', () => {
    const d = { az1_zahl: 10, az2_zahl: 8 };
    expect(rundenMax(d, 3, samen)).toBe(18); // 36 - 10 - 8
  });

  it('keine negativen Maxima — auch wenn Vorrundenssumme > samen (Datenfehler)', () => {
    const d = { az1_zahl: 40 };
    expect(rundenMax(d, 2, samen)).toBe(0);
  });

  it('nach vollstaendiger Keimung (Summe = samen): Maximum 0', () => {
    const d = { az1_zahl: 18, az2_zahl: 18 };
    expect(rundenMax(d, 3, samen)).toBe(0);
  });
});
