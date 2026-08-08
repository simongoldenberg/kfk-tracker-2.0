import { describe, it, expect } from 'vitest';

// Spiegelt die Topfreferenz-Formeln aus zwei Quellen:
//   Vorwärts (Topf-Nr aus Raster):  index.html:2099 — renderRBDForTray
//     localTopfNr = (c * rows) + r   (c: 0-basierter Spaltenindex, r: 1-basierte Reihe)
//   Rückwärts (Block/Wdh aus Topf): kfk-apps-script.gs:1451
//     blockIdx = Math.floor((topf - 1) / rows)
//     wdh      = ((topf - 1) % rows) + 1
// Beide Richtungen muessen konsistent sein (Round-trip-Eigenschaft).

function topfNr(col0, row1, rows) { return col0 * rows + row1; }
function topfToBlockIdx(topf, rows) { return Math.floor((topf - 1) / rows); }
function topfToWdh(topf, rows) { return ((topf - 1) % rows) + 1; }

describe('Topfreferenz-Ableitung — Standard-Raster 4 Spalten x 6 Reihen', () => {
  const rows = 6;
  const cols = 4;
  const blocks = ['A', 'B', 'C', 'D'];

  it('Topf 1: Block A (idx 0), Wdh 1', () => {
    expect(topfToBlockIdx(1, rows)).toBe(0);
    expect(topfToWdh(1, rows)).toBe(1);
  });

  it('Topf 6: Block A (idx 0), letzte Reihe (Wdh 6)', () => {
    expect(topfToBlockIdx(6, rows)).toBe(0);
    expect(topfToWdh(6, rows)).toBe(6);
  });

  it('Topf 7: erster Topf Block B (idx 1), Wdh 1', () => {
    expect(topfToBlockIdx(7, rows)).toBe(1);
    expect(topfToWdh(7, rows)).toBe(1);
  });

  it('Topf 24: letzter Topf (Block D, Wdh 6)', () => {
    expect(topfToBlockIdx(24, rows)).toBe(3);
    expect(topfToWdh(24, rows)).toBe(6);
  });

  it('Vorwaerts-Formel erzeugt dieselbe Topf-Nr wie Rueckwaerts-Formel erwartet', () => {
    for (let c = 0; c < cols; c++) {
      for (let r = 1; r <= rows; r++) {
        const topf = topfNr(c, r, rows);
        expect(topfToBlockIdx(topf, rows)).toBe(c);
        expect(topfToWdh(topf, rows)).toBe(r);
      }
    }
  });

  it('alle Topf-Nummern 1..24 werden exakt einmal vergeben', () => {
    const seen = new Set();
    for (let c = 0; c < cols; c++) {
      for (let r = 1; r <= rows; r++) {
        seen.add(topfNr(c, r, rows));
      }
    }
    expect(seen.size).toBe(cols * rows);
    for (let t = 1; t <= cols * rows; t++) expect(seen.has(t)).toBe(true);
  });
});

describe('Topfreferenz-Ableitung — abweichendes Raster 3 Spalten x 8 Reihen', () => {
  const rows = 8;
  const cols = 3;

  it('Topf 1: Block A (idx 0), Wdh 1', () => {
    expect(topfToBlockIdx(1, rows)).toBe(0);
    expect(topfToWdh(1, rows)).toBe(1);
  });

  it('Topf 8: Block A, Wdh 8 (letzte Reihe)', () => {
    expect(topfToBlockIdx(8, rows)).toBe(0);
    expect(topfToWdh(8, rows)).toBe(8);
  });

  it('Topf 9: Block B (idx 1), Wdh 1', () => {
    expect(topfToBlockIdx(9, rows)).toBe(1);
    expect(topfToWdh(9, rows)).toBe(1);
  });

  it('Round-trip fuer alle 24 Toepfe', () => {
    for (let c = 0; c < cols; c++) {
      for (let r = 1; r <= rows; r++) {
        const topf = topfNr(c, r, rows);
        expect(topfToBlockIdx(topf, rows)).toBe(c);
        expect(topfToWdh(topf, rows)).toBe(r);
      }
    }
  });
});
