import { describe, it, expect } from 'vitest';
import { parseAndValidateKfkData } from '../js/paste-import.js';

const TREATMENTS = [
  { code: 'T0', label: 'Kontrolle', color: '#5a7237' },
  { code: 'T1', label: 'Pellet', color: '#b9633f' }
];

function makeRbd(n, cols, rows) {
  const blocks = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const rbd = [];
  let i = 0;
  outer:
  for (let tray = 1; tray <= 1; tray++) {
    for (let c = 0; c < cols; c++) {
      for (let r = 1; r <= rows; r++) {
        if (i >= n) break outer;
        rbd.push({ tray, col: blocks[c], row: r, t: i % 2 === 0 ? 'T0' : 'T1' });
        i++;
      }
    }
  }
  return rbd;
}

function baseV1() {
  return {
    schema: 'kfk-protocol-v1',
    versuchsnr: '26_099',
    titel: 'Test-Versuch',
    art: 'Cannabis sativa (Hanf)',
    treatments: TREATMENTS,
    raster_cols: 4,
    raster_rows: 6,
    anzahl_trays: 1,
    samen_pro_topf: 36,
    rbd: makeRbd(24, 4, 6)
  };
}

function baseV2() {
  return {
    ...baseV1(),
    schema: 'kfk-protocol-v2',
    standorte: [{ tray: 1, regal: 2, boden: 1 }]
  };
}

describe('parseAndValidateKfkData — gueltige Bloecke', () => {
  it('Schema v1 ohne standorte -> ok, standorte === null', () => {
    const res = parseAndValidateKfkData(JSON.stringify(baseV1()));
    expect(res.ok).toBe(true);
    expect(res.data.standorte).toBeNull();
    expect(res.data.versuchsnr).toBe('26_099');
    expect(res.data.baumart_lat).toBe('Cannabis sativa');
    expect(res.data.baumart_kurz).toBe('Hanf');
  });

  it('Schema v2 mit standorte -> ok, standorte durchgereicht', () => {
    const res = parseAndValidateKfkData(JSON.stringify(baseV2()));
    expect(res.ok).toBe(true);
    expect(res.data.standorte).toEqual([{ tray: 1, regal: 2, boden: 1 }]);
  });

  it('funktioniert mit <<<KFK-DATA / KFK-DATA>>> Markerzeilen', () => {
    const withMarkers = '<<<KFK-DATA\n' + JSON.stringify(baseV1()) + '\nKFK-DATA>>>';
    const withoutMarkers = JSON.stringify(baseV1());
    const a = parseAndValidateKfkData(withMarkers);
    const b = parseAndValidateKfkData(withoutMarkers);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.data.versuchsnr).toBe(b.data.versuchsnr);
  });

  it('normalisiert typografische Anfuehrungszeichen', () => {
    const raw = JSON.stringify(baseV1()).replace(/"versuchsnr"/, '“versuchsnr”');
    // Nur die Anfuehrungszeichen um den Feldnamen ersetzen, nicht valides JSON layout aendern
    const res = parseAndValidateKfkData(raw);
    expect(res.ok).toBe(true);
  });
});

describe('parseAndValidateKfkData — Fehlerfaelle', () => {
  it('kaputtes JSON -> Fehlermeldung nennt "kein gültiges JSON"', () => {
    const res = parseAndValidateKfkData('{ das ist kein json');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/kein gültiges JSON/);
  });

  it('leere Eingabe -> Fehler', () => {
    const res = parseAndValidateKfkData('   ');
    expect(res.ok).toBe(false);
  });

  it('fehlendes versuchsnr -> Fehler nennt Feldnamen', () => {
    const v = baseV1();
    delete v.versuchsnr;
    const res = parseAndValidateKfkData(JSON.stringify(v));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/^versuchsnr:/);
  });

  it('fehlendes/leeres treatments -> Fehler nennt Feldnamen', () => {
    const v = baseV1();
    v.treatments = [];
    const res = parseAndValidateKfkData(JSON.stringify(v));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/^treatments:/);
  });

  it('fehlendes/leeres rbd -> Fehler nennt Feldnamen', () => {
    const v = baseV1();
    v.rbd = [];
    const res = parseAndValidateKfkData(JSON.stringify(v));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/^rbd:/);
  });

  it('rbd-Eintrag referenziert unbekannten Treatment-Code -> Fehler', () => {
    const v = baseV1();
    v.rbd[0] = { tray: 1, col: 'A', row: 1, t: 'T9' };
    const res = parseAndValidateKfkData(JSON.stringify(v));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/T9/);
    expect(res.error).toMatch(/rbd\[0\]/);
  });

  it('mehr rbd-Eintraege als Plaetze -> Fehler nennt beide Zahlen', () => {
    const v = baseV1();
    v.anzahl_trays = 1;
    v.raster_cols = 2;
    v.raster_rows = 2; // nur 4 Plaetze
    // rbd hat weiterhin 24 Eintraege aus baseV1()
    const res = parseAndValidateKfkData(JSON.stringify(v));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/24/);
    expect(res.error).toMatch(/nur 4 Plätze/);
  });

  it('unerwartetes schema (nicht kfk-protocol*) -> Fehler', () => {
    const v = baseV1();
    v.schema = 'irgendwas-anderes-v1';
    const res = parseAndValidateKfkData(JSON.stringify(v));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/^schema:/);
  });
});
