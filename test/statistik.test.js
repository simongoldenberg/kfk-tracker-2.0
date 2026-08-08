import { describe, it, expect } from 'vitest';

// Spiegelt die deskriptive-Statistik-Formeln aus zwei Quellen:
//   Frontend (renderUebersicht):     index.html
//   Backend  (buildStatistikHtml):   kfk-apps-script.gs
// Beide verwenden dieselben Formeln — dieser Test verifiziert sie einmal gemeinsam.

function descriptiveStats(values) {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1
    ? Math.sqrt(values.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / (n - 1))
    : 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const cv = mean > 0 ? sd / mean * 100 : 0;
  return { n, mean, sd, min, max, cv };
}

function kfProzent(mean, samen) {
  return Math.round(mean / samen * 100);
}

describe('descriptiveStats — Grundformeln', () => {
  it('berechnet n, Mittelwert, SD, Min, Max korrekt', () => {
    const s = descriptiveStats([2, 4, 6]);
    expect(s.n).toBe(3);
    expect(s.mean).toBeCloseTo(4, 5);
    expect(s.sd).toBeCloseTo(2, 5);
    expect(s.min).toBe(2);
    expect(s.max).toBe(6);
  });

  it('SD = 0 bei n = 1', () => {
    const s = descriptiveStats([7]);
    expect(s.sd).toBe(0);
    expect(s.min).toBe(7);
    expect(s.max).toBe(7);
  });

  it('gibt null zurueck fuer leere Liste', () => {
    expect(descriptiveStats([])).toBeNull();
  });

  it('CV% = SD / Mittelwert * 100', () => {
    const s = descriptiveStats([4, 8]);
    // mean=6, sd=sqrt((4+4)/1)=2.83..., cv=2.83/6*100=47.1
    expect(s.cv).toBeCloseTo(s.sd / s.mean * 100, 5);
  });

  it('CV% = 0 wenn Mittelwert = 0 (Division durch Null)', () => {
    const s = descriptiveStats([0, 0]);
    expect(s.cv).toBe(0);
  });
});

describe('kfProzent — kumulative Keimfaehigkeit', () => {
  it('rundet auf ganze Prozent', () => {
    expect(kfProzent(8, 36)).toBe(22);   // 8/36*100 = 22.2..
    expect(kfProzent(36, 36)).toBe(100);
    expect(kfProzent(0, 36)).toBe(0);
  });

  it('Stichprobe: mean=5 bei 36 Samen pro Topf', () => {
    expect(kfProzent(5, 36)).toBe(14);   // 5/36*100 = 13.8.. -> 14
  });
});

describe('descriptiveStats — Stichprobenvarianz (n-1)', () => {
  it('verwendet n-1 im Nenner (Stichprobenvarianz, nicht Populationsvarianz)', () => {
    // Werte [2, 4]: mean=3, Populationsvarianz=1, Stichprobenvarianz=2 -> sd=1.41
    const s = descriptiveStats([2, 4]);
    expect(s.sd).toBeCloseTo(Math.SQRT2, 5);
  });
});
