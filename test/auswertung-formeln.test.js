import { describe, it, expect } from 'vitest';
import F from '../js/auswertung-formeln.js';

// Standard-Layout: Treatment in E, AZ-Zahlen in H/K/N/Q/T (so sieht ein
// Multi-Tray-Sheet aus, siehe buildDatenSheetFromRbdMap_).
const COLS = { 1: 'H', 2: 'K', 3: 'N', 4: 'Q', 5: 'T' };
const AZ = [1, 2, 3, 4, 5];

function opts(over = {}) {
  return {
    code: 'T0',
    treatmentCol: 'E',
    azZahlCols: COLS,
    azNummern: AZ,
    bisAz: 5,
    zeilen: 500,
    row: 6,
    samenProTopf: 36,
    chargeKfkPotenzial: 0,
    ...over
  };
}

function alleFormeln(o = opts()) {
  return Object.values(F.zeilenFormeln(o));
}

// Entfernt alle String-Literale aus einer Formel. Nur so laesst sich pruefen,
// ob ein Komma/eine Klammer STRUKTURELL vorkommt - in "^T0(?:$|\s)" stehen
// Klammern voellig legitim.
function ohneStringLiterale(formel) {
  return formel.replace(/"[^"]*"/g, '""');
}

describe('Argumenttrennzeichen — Gebietsschema Deutschland', () => {
  // Das ist die Regression zu CHANGELOG 1.8.1: fillAuswertungTab_ erzeugte
  // Formeln mit US-Komma, die Sheets unter deutschem Gebietsschema nicht
  // parsen konnte -> #ERROR! in JEDER Zelle des Tabs.
  it('verwendet Semikolon, nicht Komma', () => {
    expect(F.SEP).toBe(';');
  });

  it('keine der erzeugten Formeln enthaelt ein Komma als Argumenttrenner', () => {
    // Ganzzahlige Eingaben (der Realfall: samen_pro_topf ist eine Topfzahl).
    // Dann darf ueberhaupt kein Komma vorkommen - genau das war der v1.8.0-Bug.
    const o = opts({ samenProTopf: 36, chargeKfkPotenzial: 90 });
    for (const formel of alleFormeln(o)) {
      expect(ohneStringLiterale(formel)).not.toContain(',');
    }
  });

  it('Dezimal-Literale nutzen das Komma, die Argumente trotzdem Semikolon', () => {
    // Hier laesst sich "Komma verboten" nicht pauschal pruefen: 24,5 ist das
    // deutsche Dezimalzeichen und muss bleiben, waehrend das Trennzeichen vor
    // der Rundungsstelle ein Semikolon sein muss. Deshalb exakt vergleichen.
    const f = F.zeilenFormeln(opts({ samenProTopf: 24.5, chargeKfkPotenzial: 85.5 }));
    expect(f.kfk).toBe('=IFERROR(ROUND(C6/24,5*100;1)&"%";"")');
    expect(f.relKfk).toBe('=IFERROR(ROUND(C6/24,5*100/85,5*100;1)&"%";"—")');
  });

  it('jede Formel beginnt mit = und hat ausgeglichene Klammern', () => {
    for (const formel of alleFormeln()) {
      expect(formel.startsWith('=')).toBe(true);
      const nackt = ohneStringLiterale(formel);
      const auf = (nackt.match(/\(/g) || []).length;
      const zu = (nackt.match(/\)/g) || []).length;
      expect(auf).toBe(zu);
    }
  });

  it('erzeugt keine doppelten Trennzeichen oder leeren Argumente', () => {
    for (const formel of alleFormeln()) {
      expect(ohneStringLiterale(formel)).not.toContain(';;');
      expect(ohneStringLiterale(formel)).not.toContain('(;');
    }
  });
});

describe('fmtNum — Dezimalkomma fuer eingebettete Zahlenliterale', () => {
  it('laesst Ganzzahlen unveraendert', () => {
    expect(F.fmtNum(36)).toBe('36');
    expect(F.fmtNum(0)).toBe('0');
  });

  it('macht aus dem Dezimalpunkt ein Komma', () => {
    expect(F.fmtNum(85.5)).toBe('85,5');
    expect(F.fmtNum(0.25)).toBe('0,25');
  });

  it('landet so auch in der KFK-Formel', () => {
    const f = F.zeilenFormeln(opts({ samenProTopf: 24.5 }));
    expect(f.kfk).toContain('/24,5*100');
  });
});

describe('Treatment-Maske', () => {
  // Der eigentliche Zweck des Wortende-Musters: T1 darf T10 nicht treffen.
  // JS-Regex und die RE2-Variante in REGEXMATCH verhalten sich hier gleich.
  it('trifft den nackten Code', () => {
    expect(new RegExp(F.treatmentRegex('T1')).test('T1')).toBe(true);
  });

  it('trifft "T1 Kontrolle" und "T1 (Kontrolle)"', () => {
    const re = new RegExp(F.treatmentRegex('T1'));
    expect(re.test('T1 Kontrolle')).toBe(true);
    expect(re.test('T1 (Kontrolle)')).toBe(true);
  });

  it('trifft NICHT T10, T11, T1x', () => {
    const re = new RegExp(F.treatmentRegex('T1'));
    expect(re.test('T10')).toBe(false);
    expect(re.test('T11 Kohle')).toBe(false);
    expect(re.test('T1x')).toBe(false);
  });

  it('T10 trifft sich selbst, aber nicht T1', () => {
    const re = new RegExp(F.treatmentRegex('T10'));
    expect(re.test('T10')).toBe(true);
    expect(re.test('T1')).toBe(false);
  });

  it('verankert am Zeilenanfang (kein Treffer mitten im Text)', () => {
    expect(new RegExp(F.treatmentRegex('T2')).test('Rest T2')).toBe(false);
  });

  it('nutzt die aufgeloeste Treatment-Spalte, nicht ein hart kodiertes D', () => {
    expect(F.maskExpr(opts({ treatmentCol: 'F' }))).toContain('Daten!$F$2:$F$500');
    expect(F.maskExpr(opts({ treatmentCol: 'F' }))).not.toContain('$D$');
  });
});

describe('CUM / HAS — kumulative Summe und Fallzahl', () => {
  it('summiert nur die Runden bis bisAz', () => {
    expect(F.cumExpr(opts({ bisAz: 2 })))
      .toBe('N(Daten!$H$2:$H$500)+N(Daten!$K$2:$K$500)');
  });

  it('nimmt bei bisAz=5 alle fuenf Rundenspalten', () => {
    expect(F.cumExpr(opts({ bisAz: 5 })).split('+')).toHaveLength(5);
  });

  it('zaehlt einen Topf nur als n, wenn er ueberhaupt einen Wert hat', () => {
    expect(F.hasExpr(opts({ bisAz: 1 })))
      .toBe('(((Daten!$H$2:$H$500<>""))>0)');
  });

  it('folgt geaenderten Spaltenbuchstaben (Tray-Spalte verschiebt alles)', () => {
    const verschoben = { 1: 'I', 2: 'L', 3: 'O', 4: 'R', 5: 'U' };
    expect(F.cumExpr(opts({ azZahlCols: verschoben, bisAz: 1 })))
      .toBe('N(Daten!$I$2:$I$500)');
  });

  it('respektiert die Zeilenobergrenze', () => {
    expect(F.cumExpr(opts({ bisAz: 1, zeilen: 900 }))).toContain('$H$900');
  });
});

describe('blockPlan — wie viele Bloecke der Tab bekommt', () => {
  // Regression zu CHANGELOG 1.8.3: vorher wurde ueber alle gefundenen
  // AZ-Spalten iteriert, ein 3-Runden-Versuch bekam dadurch Bloecke "bis AZ4"
  // und "bis AZ5", die numerisch identisch zu "bis AZ3" waren.
  it('bei 3 geplanten Runden: AZ1, AZ2, Gesamt', () => {
    const plan = F.blockPlan({ azNummern: AZ, azGeplant: 3 });
    expect(plan.map(b => b.bisAz)).toEqual([1, 2, 5]);
    expect(plan.filter(b => b.hervorheben)).toHaveLength(1);
  });

  it('erzeugt keine Bloecke jenseits der geplanten Runden', () => {
    const plan = F.blockPlan({ azNummern: AZ, azGeplant: 3 });
    const kumulativ = plan.filter(b => !b.hervorheben);
    expect(kumulativ.every(b => b.bisAz < 3)).toBe(true);
  });

  it('letzter Kumulativ-Block ist nie mit Gesamt deckungsgleich', () => {
    for (const geplant of [2, 3, 4, 5]) {
      const plan = F.blockPlan({ azNummern: AZ, azGeplant: geplant });
      const kumulativ = plan.filter(b => !b.hervorheben);
      const gesamt = plan[plan.length - 1];
      expect(kumulativ.some(b => b.bisAz === gesamt.bisAz)).toBe(false);
    }
  });

  it('bei einer geplanten Runde bleibt nur Gesamt', () => {
    const plan = F.blockPlan({ azNummern: AZ, azGeplant: 1 });
    expect(plan).toHaveLength(1);
    expect(plan[0].hervorheben).toBe(true);
  });

  it('Gesamt summiert immer ueber ALLE vorhandenen Rundenspalten', () => {
    // Auch bei az_geplant=3 muessen Werte in AZ4/AZ5 mitzaehlen, statt still
    // aus der Auswertung zu fallen.
    const plan = F.blockPlan({ azNummern: AZ, azGeplant: 3 });
    expect(plan[plan.length - 1].bisAz).toBe(5);
  });

  it('faellt bei fehlendem oder unplausiblem az_geplant auf alle Spalten zurueck', () => {
    for (const kaputt of [undefined, null, 0, -1, 9, 'abc']) {
      const plan = F.blockPlan({ azNummern: AZ, azGeplant: kaputt });
      expect(plan.map(b => b.bisAz)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('kommt mit einem Sheet ohne AZ4/AZ5-Spalten zurecht', () => {
    const plan = F.blockPlan({ azNummern: [1, 2, 3], azGeplant: 3 });
    expect(plan.map(b => b.bisAz)).toEqual([1, 2, 3]);
    expect(plan[plan.length - 1].titel).toContain('Gesamt');
  });

  it('liefert leeren Plan, wenn gar keine AZ-Spalten gefunden wurden', () => {
    expect(F.blockPlan({ azNummern: [], azGeplant: 3 })).toEqual([]);
  });

  it('Gesamt-Block ist als einziger hervorgehoben und steht am Ende', () => {
    const plan = F.blockPlan({ azNummern: AZ, azGeplant: 4 });
    expect(plan[plan.length - 1].hervorheben).toBe(true);
    expect(plan.slice(0, -1).every(b => b.hervorheben === false)).toBe(true);
  });
});

describe('zeilenFormeln — Selbstbezuege und rel. KFK', () => {
  it('bezieht Min/Max/CV auf die eigene Zeile', () => {
    const f = F.zeilenFormeln(opts({ row: 42 }));
    expect(f.min).toContain('N(B42)=0');
    expect(f.cv).toContain('D42/C42');
  });

  it('liefert ohne Potenzial einen Strich statt einer Rechnung', () => {
    expect(F.zeilenFormeln(opts({ chargeKfkPotenzial: 0 })).relKfk).toBe('="—"');
  });

  it('rechnet rel. KFK gegen das Potenzial der Charge', () => {
    const f = F.zeilenFormeln(opts({ chargeKfkPotenzial: 90 }));
    expect(f.relKfk).toContain('/36*100/90*100');
  });

  it('deckt alle acht Wertespalten ab, passend zur Kopfzeile', () => {
    const f = F.zeilenFormeln(opts());
    expect(Object.keys(f)).toEqual(F.FELDER);
    expect(F.KOPFZEILE).toHaveLength(F.FELDER.length + 1); // + Treatment-Spalte
  });

  it('n zaehlt Toepfe, nicht Keimlinge (SUMPRODUCT ueber die Maske)', () => {
    const f = F.zeilenFormeln(opts());
    expect(f.n).toContain('SUMPRODUCT(');
    expect(f.n).not.toContain('N(Daten!');
  });
});
