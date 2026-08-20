// Formel-Bausteine des Auswertungs-Tabs (Sheet-Tab `Auswertung`).
//
// WARUM EIGENES MODUL: Der Formelbau steckte bis v1.8.2 inline in
// `fillAuswertungTab_` (kfk-apps-script.gs) und war damit von Vitest nicht
// erreichbar - SpreadsheetApp laesst sich in Node nicht laden. Genau deshalb
// ist der Locale-Bug aus v1.8.0 (US-Komma statt Semikolon, siehe CHANGELOG
// 1.8.1) erst im Growzelt-Sheet aufgefallen und nicht in der Testsuite: es gab
// keinen einzigen Test, der eine erzeugte Formel angeschaut hat. Die reinen
// String-Bauer liegen jetzt hier, `fillAuswertungTab_` schreibt sie nur noch
// in die Zellen.
//
// KEINE KOPIE, SONDERN DIESELBE DATEI: `.claspignore` laedt diese Datei mit
// ins Apps-Script-Projekt, der UMD-Export haengt sie dort an `globalThis`
// (V8-Laufzeit). Backend und Testsuite nutzen also denselben Code - anders als
// bei `missingAbschlussFields`/`missingAbschlussFelder_`, die bewusst
// gespiegelt sind.
//
// UMD-artiger Export wie js/standorte.js und js/chargen.js: klassisches
// <script>-Tag haengt an window, Vitest importiert per ESM/CJS-Interop,
// Apps Script bekommt globalThis - kein Build-Schritt noetig.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.KfkAuswertungFormeln = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {

  // Argumenttrennzeichen der Versuchs-Sheets. Gebietsschema ist Deutschland
  // (Datei -> Einstellungen -> Allgemein), dort trennt ';' die Argumente und
  // ',' ist das Dezimalzeichen. `Range.setFormula()` uebernimmt den String
  // wortwoertlich und konvertiert NICHT von US-Syntax - ein Komma laesst jede
  // Zelle mit "Fehler beim Parsen der Formel" auflaufen. Als Konstante, damit
  // der Test sie pruefen kann und nicht 8 Formeln einzeln.
  const SEP = ';';

  // Zahlenliteral fuer eine Formel: Dezimalpunkt -> Dezimalkomma. Ganzzahlen
  // bleiben unveraendert. Nur der erste Punkt kann Dezimaltrenner sein.
  function fmtNum(n) {
    return String(n).replace('.', ',');
  }

  // Zeile gehoert zu diesem Treatment. Die Treatment-Spalte enthaelt je
  // Anlageweg den nackten Code ("T1", so schreibt ihn
  // buildDatenSheetFromRbdMap_), "T1 Kontrolle" (Handeintrag, Patches.js) oder
  // "T1 (Kontrolle)" - auf den Code folgt also nichts oder ein Leerzeichen.
  // Wortende-Muster statt LEFT(...), damit "T1" nicht auch "T10" trifft.
  function maskExpr(opts) {
    const col = opts.treatmentCol;
    const R = opts.zeilen;
    return 'ARRAYFORMULA(REGEXMATCH(Daten!$' + col + '$2:$' + col + '$' + R
         + '&""' + SEP + '"' + treatmentRegex(opts.code) + '"))';
  }

  // Als eigene Funktion, damit der Test das Muster direkt gegen Beispielwerte
  // laufen lassen kann (JS-Regex und RE2 verhalten sich hier gleich).
  function treatmentRegex(code) {
    return '^' + code + '(?:$|\\s)';
  }

  // Summe der Rundenwerte je Topf bis einschliesslich bisAz. N() macht aus
  // leeren Zellen 0, statt die ganze Summe auf #VALUE! zu ziehen.
  function cumExpr(opts) {
    return runden(opts).map(function (a) {
      const c = opts.azZahlCols[a];
      return 'N(Daten!$' + c + '$2:$' + c + '$' + opts.zeilen + ')';
    }).join('+');
  }

  // Hat der Topf bis dahin ueberhaupt einen Wert? Sonst zaehlt er nicht fuer n
  // - ein leerer Topf soll die Fallzahl nicht aufblaehen.
  function hasExpr(opts) {
    return '((' + runden(opts).map(function (a) {
      const c = opts.azZahlCols[a];
      return '(Daten!$' + c + '$2:$' + c + '$' + opts.zeilen + '<>"")';
    }).join('+') + ')>0)';
  }

  function runden(opts) {
    return opts.azNummern.filter(function (a) { return a <= opts.bisAz; });
  }

  // Welche Bloecke bekommt der Tab? Das Daten-Sheet hat IMMER die Spalten
  // AZ1..AZ5 (buildDatenSheetFromRbdMap_ legt sie pauschal an, unabhaengig von
  // az_geplant). Eine Schleife ueber alle gefundenen Spalten rendert deshalb
  // fuer einen 3-Runden-Versuch auch "bis AZ4"/"bis AZ5" - beide numerisch
  // identisch zu "bis AZ3", und "Gesamt" waere eine dritte Kopie. Also auf
  // az_geplant begrenzen und die Kumulativ-Bloecke nur bis zur VORLETZTEN
  // geplanten Runde fuehren; die letzte ist definitionsgemaess "Gesamt".
  // Fehlt az_geplant oder ist der Wert unplausibel -> alle Spalten (Verhalten
  // vor v1.8.3), damit nie versehentlich Bloecke verschwinden.
  function blockPlan(opts) {
    const azNummern = opts.azNummern;
    if (!azNummern || !azNummern.length) return [];
    const maxSpalte = azNummern[azNummern.length - 1];

    let geplant = Number(opts.azGeplant);
    if (!(geplant >= 1 && geplant <= maxSpalte)) geplant = maxSpalte;

    const plan = azNummern.filter(function (az) { return az < geplant; })
      .map(function (az) {
        return {
          titel: 'Kumulativ bis AZ' + az + '  (AZ1..AZ' + az + ')',
          bisAz: az,
          hervorheben: false
        };
      });

    // Gesamt summiert ueber ALLE vorhandenen Rundenspalten, nicht nur bis
    // az_geplant: Werte, die jemand ausserhalb der geplanten Runden eingetragen
    // hat, sollen nicht still aus der Auswertung fallen. Auf diesem Block laeuft
    // laut SOP die Inferenzstatistik.
    plan.push({
      titel: 'Gesamt  (KFK = Summe aller AZ-Runden)',
      bisAz: maxSpalte,
      hervorheben: true
    });
    return plan;
  }

  // Die acht Formeln einer Treatment-Zeile. `row` ist die 1-basierte
  // Sheet-Zeile, auf die sich die Selbstbezuege (B/C/D) beziehen.
  function zeilenFormeln(opts) {
    const SEL = maskExpr(opts) + '*' + hasExpr(opts);
    const CUM = '(' + cumExpr(opts) + ')';
    const WERTE = 'ARRAYFORMULA(IF(' + SEL + SEP + CUM + SEP + '""))';
    const r = opts.row;
    const samen = fmtNum(opts.samenProTopf);
    const potenzial = Number(opts.chargeKfkPotenzial || 0);

    return {
      n:      '=IFERROR(SUMPRODUCT(' + SEL + ')' + SEP + '"")',
      mittel: '=IFERROR(AVERAGE(' + WERTE + ')' + SEP + '"")',
      sd:     '=IFERROR(STDEV(' + WERTE + ')' + SEP + '"")',
      // MIN/MAX ignorieren Text und liefern sonst 0, auch wenn gar kein Topf
      // matcht - das liesse sich als Messwert lesen. Ueber n absichern.
      min:    '=IFERROR(IF(N(B' + r + ')=0' + SEP + '""' + SEP + 'MIN(' + WERTE + '))' + SEP + '"")',
      max:    '=IFERROR(IF(N(B' + r + ')=0' + SEP + '""' + SEP + 'MAX(' + WERTE + '))' + SEP + '"")',
      // KFK % = kumulativer Mittelwert / Samen pro Topf
      kfk:    '=IFERROR(ROUND(C' + r + '/' + samen + '*100' + SEP + '1)&"%"' + SEP + '"")',
      cv:     '=IFERROR(ROUND(D' + r + '/C' + r + '*100' + SEP + '1)&"%"' + SEP + '"")',
      // rel. KFK % = KFK % / Potenzial-KFK der Charge * 100 (SOP-Kernregel).
      // Potenzial steht als Literal in der Formel - aendert es sich spaeter,
      // braucht der Tab rebuildAuswertungTab(versuchsnr).
      relKfk: potenzial > 0
        ? '=IFERROR(ROUND(C' + r + '/' + samen + '*100/' + fmtNum(potenzial) + '*100' + SEP + '1)&"%"' + SEP + '"—")'
        : '="—"'
    };
  }

  // Reihenfolge der Spalten B..I, passend zu KOPFZEILE unten.
  const FELDER = ['n', 'mittel', 'sd', 'min', 'max', 'kfk', 'cv', 'relKfk'];
  const KOPFZEILE = ['Treatment', 'n', 'Ø', 'SD', 'Min', 'Max', 'KFK %', 'CV %', 'rel. KFK %'];

  return {
    SEP: SEP,
    FELDER: FELDER,
    KOPFZEILE: KOPFZEILE,
    fmtNum: fmtNum,
    treatmentRegex: treatmentRegex,
    maskExpr: maskExpr,
    cumExpr: cumExpr,
    hasExpr: hasExpr,
    blockPlan: blockPlan,
    zeilenFormeln: zeilenFormeln
  };
});
