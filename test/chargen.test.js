import { describe, it, expect } from 'vitest';
import {
  aussaatWochentagCheck,
  aktivierungWochentagCheck,
  ruhedauerTage,
  ruhedauerWarnung,
  artengruppeFor,
  azTermineVorschlag,
  substratEcWarnung,
  substratchargeIdFormatOk,
  pelletchargeIdFormatOk,
  relKfk,
  randposition,
  missingImportFields,
  missingAbschlussFields,
  parsePelletProtokollZeile
} from '../js/chargen.js';

describe('Wochentag-Pruefung Aussaat/Aktivierung', () => {
  it('Aussaat Montag-Donnerstag ist erlaubt', () => {
    // 2026-08-10 ist ein Montag, 2026-08-13 ein Donnerstag
    expect(aussaatWochentagCheck('2026-08-10').erlaubt).toBe(true);
    expect(aussaatWochentagCheck('2026-08-13').erlaubt).toBe(true);
  });
  it('Aussaat am Wochenende/Freitag ist nicht erlaubt', () => {
    expect(aussaatWochentagCheck('2026-08-14').erlaubt).toBe(false); // Freitag
    expect(aussaatWochentagCheck('2026-08-16').erlaubt).toBe(false); // Sonntag
  });
  it('Aktivierung muss ein Donnerstag sein', () => {
    expect(aktivierungWochentagCheck('2026-08-13').erlaubt).toBe(true);
    expect(aktivierungWochentagCheck('2026-08-11').erlaubt).toBe(false); // Dienstag
    expect(aktivierungWochentagCheck('2026-08-11').wochentagName).toBe('Dienstag');
  });
  it('leeres/kaputtes Datum liefert null (keine Warnung ohne Wert)', () => {
    expect(aussaatWochentagCheck('')).toBeNull();
    expect(aktivierungWochentagCheck('nicht-ein-datum')).toBeNull();
  });
});

describe('Ruhedauer', () => {
  it('berechnet die Tage zwischen Aussaat und Aktivierung', () => {
    expect(ruhedauerTage('2026-08-10', '2026-08-13')).toBe(3);
  });
  it('null wenn eines der Daten fehlt', () => {
    expect(ruhedauerTage('', '2026-08-13')).toBeNull();
    expect(ruhedauerTage('2026-08-10', '')).toBeNull();
  });
  it('Warnung erst ueber 4 Tage', () => {
    expect(ruhedauerWarnung(4)).toBe(false);
    expect(ruhedauerWarnung(5)).toBe(true);
    expect(ruhedauerWarnung(null)).toBe(false);
  });
});

describe('AZ-Termine-Vorschlaege nach Artengruppe', () => {
  it('Hanf/Weizen -> 4,7,11', () => {
    expect(artengruppeFor('Hanf')).toBe('kurz');
    expect(azTermineVorschlag('Hanf')).toEqual([4, 7, 11]);
    expect(azTermineVorschlag('Weizen')).toEqual([4, 7, 11]);
  });
  it('SKi/WKi/ELae -> 7,14,21,28', () => {
    expect(azTermineVorschlag('SKi')).toEqual([7, 14, 21, 28]);
    expect(azTermineVorschlag('WKi')).toEqual([7, 14, 21, 28]);
    expect(azTermineVorschlag('ELä')).toEqual([7, 14, 21, 28]);
  });
  it('KueTa -> 14,21,28,35', () => {
    expect(azTermineVorschlag('KüTa')).toEqual([14, 21, 28, 35]);
  });
  it('unbekannte Art faellt auf den mittleren Rhythmus (7,14,21,28) zurueck', () => {
    expect(azTermineVorschlag('Voellig unbekannte Art')).toEqual([7, 14, 21, 28]);
  });
});

describe('Substrat-EC-Warnung', () => {
  it('ueber 1.0 mS/cm warnt', () => {
    expect(substratEcWarnung(1.4)).toBe(true);
    expect(substratEcWarnung(1.0)).toBe(false);
    expect(substratEcWarnung(0.6)).toBe(false);
  });
  it('leer/kein Wert warnt nicht', () => {
    expect(substratEcWarnung('')).toBe(false);
    expect(substratEcWarnung(null)).toBe(false);
  });
});

describe('Weiche ID-Format-Pruefungen', () => {
  it('Substratcharge SUB-MM-TT-X', () => {
    expect(substratchargeIdFormatOk('SUB-08-13-A')).toBe(true);
    expect(substratchargeIdFormatOk('irgendwas')).toBe(false);
  });
  it('Pelletcharge P-MM-TT-X oder P-JJJJ-MM-TT-X', () => {
    expect(pelletchargeIdFormatOk('P-08-11-A')).toBe(true);
    expect(pelletchargeIdFormatOk('P-2026-08-11-A')).toBe(true);
    expect(pelletchargeIdFormatOk('irgendwas')).toBe(false);
  });
});

describe('relKfk (relative Keimleistung)', () => {
  it('berechnet kumulative KFK% / Chargenpotenzial * 100', () => {
    expect(relKfk(50, 80)).toBe(62.5);
  });
  it('liefert null ohne/mit 0 Potenzial statt Fehler', () => {
    expect(relKfk(50, 0)).toBeNull();
    expect(relKfk(50, '')).toBeNull();
    expect(relKfk(50, null)).toBeNull();
  });
  it('kappt nicht bei Werten ueber 100%', () => {
    expect(relKfk(90, 50)).toBe(180);
  });
});

describe('randposition', () => {
  it('erste/letzte Spalte ist aussen (4 Spalten x 6 Reihen)', () => {
    expect(randposition('A', 3, 4, 6)).toBe('aussen');
    expect(randposition('D', 3, 4, 6)).toBe('aussen');
  });
  it('erste/letzte Reihe ist aussen', () => {
    expect(randposition('B', 1, 4, 6)).toBe('aussen');
    expect(randposition('C', 6, 4, 6)).toBe('aussen');
  });
  it('mittlere Spalte und mittlere Reihe ist innen', () => {
    expect(randposition('B', 3, 4, 6)).toBe('innen');
    expect(randposition('C', 4, 4, 6)).toBe('innen');
  });
  it('funktioniert auch mit abweichendem Raster (3 Spalten x 8 Reihen)', () => {
    expect(randposition('B', 4, 3, 8)).toBe('innen');
    expect(randposition('A', 4, 3, 8)).toBe('aussen');
  });
});

describe('missingImportFields (Banner)', () => {
  it('Versuch ohne neue Felder listet alle Pflichtfelder', () => {
    const missing = missingImportFields({ versuchsnr: '26_099' });
    expect(missing.map(m => m.feld)).toContain('aussaat_datum');
    expect(missing.map(m => m.feld)).toContain('saatgutcharge_id');
    expect(missing.length).toBeGreaterThan(0);
  });
  it('vollstaendiger Versuch hat keine fehlenden Felder', () => {
    const v = {
      aussaat_datum: '2026-08-10', aktivierung_datum: '2026-08-13',
      ruhephase_bestaetigt: true, saatgutcharge_id: 'SKi-P34', charge_kfk_potenzial: 92,
      substratcharge_id: 'SUB-08-13-A', substrat_basis: 'Kokosfaser', substrat_verhaeltnis: '60/40'
    };
    expect(missingImportFields(v)).toEqual([]);
  });
});

describe('missingAbschlussFields (Blockierende Pruefung)', () => {
  const vollstaendig = {
    saatgutcharge_id: 'SKi-P34', charge_kfk_potenzial: 92,
    substratcharge_id: 'SUB-08-13-A', substrat_verhaeltnis: '60/40',
    aktivierung_datum: '2026-08-13', ruhephase_bestaetigt: true
  };
  it('vollstaendiger Versuch mit pelletierten Treatments (alle mit Charge) -> keine fehlenden Felder', () => {
    const treatments = [{ code: 'T1', pelletcharge_id: 'P-08-11-A' }];
    expect(missingAbschlussFields(vollstaendig, treatments)).toEqual([]);
  });
  it('Treatment ohne pelletcharge_id UND ohne nackte_saat-Markierung blockiert', () => {
    const treatments = [{ code: 'T1', pelletcharge_id: '' }];
    const missing = missingAbschlussFields(vollstaendig, treatments);
    expect(missing.some(m => m.feld === 'pelletcharge_id' && m.treatmentCode === 'T1')).toBe(true);
  });
  it('nackte Saat braucht keine pelletcharge_id', () => {
    const treatments = [{ code: 'T0', pelletcharge_id: '', nackte_saat: true }];
    expect(missingAbschlussFields(vollstaendig, treatments)).toEqual([]);
  });
  it('fehlendes Versuchsfeld wird genannt', () => {
    const ohneRuhephase = { ...vollstaendig, ruhephase_bestaetigt: false };
    const missing = missingAbschlussFields(ohneRuhephase, []);
    expect(missing.some(m => m.feld === 'ruhephase_bestaetigt')).toBe(true);
  });
});

describe('parsePelletProtokollZeile (Sammeluebernahme)', () => {
  it('parst eine Tab-getrennte Zeile in der Reihenfolge des Papierprotokolls', () => {
    const line = '26_044\tSKi-P34\tP-08-11-A\tSchicht 1: Weisse_Perle_v1\t2026-08-11\tetwas zu nass\tca. 1 mm\tSK';
    const r = parsePelletProtokollZeile(line);
    expect(r).toEqual({
      versuchsnr: '26_044',
      saatgutchargeId: 'SKi-P34',
      pelletchargeId: 'P-08-11-A',
      matrixzusammensetzung: 'Schicht 1: Weisse_Perle_v1',
      pelletierDatum: '2026-08-11',
      pelletierAnmerkung: 'etwas zu nass',
      schichtdicke: 'ca. 1 mm',
      pelletiertVon: 'SK'
    });
  });
  it('funktioniert auch Semikolon-getrennt', () => {
    const line = '26_044;SKi-P34;P-08-11-A;Matrix;2026-08-11;;ca. 1 mm;SK';
    const r = parsePelletProtokollZeile(line);
    expect(r.versuchsnr).toBe('26_044');
    expect(r.pelletiertVon).toBe('SK');
  });
  it('zu wenige Felder -> null (kein Raten)', () => {
    expect(parsePelletProtokollZeile('26_044\tSKi-P34')).toBeNull();
  });
  it('leere Eingabe -> null', () => {
    expect(parsePelletProtokollZeile('')).toBeNull();
  });
});
