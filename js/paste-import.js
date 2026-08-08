// Paste-Import: parst + validiert einen per Copy-Paste eingefuegten
// KFK-DATA-Block (Schema kfk-protocol-v1/v2), damit ein Versuch angelegt
// werden kann, ohne den Umweg ueber Asana/Google-Doc-API zu gehen.
//
// Spiegelt die Backend-Logik in kfk-apps-script.gs (readKfkDataFromDoc_,
// parseArtField_), damit Paste-Import und Doc-Import dieselben Formate
// akzeptieren.
//
// UMD-artiger Export: klassisches <script>-Tag im Frontend (index.html)
// haengt die Funktionen an window.KfkPasteImport, Vitest importiert
// dieselbe Datei per ESM/CJS-Interop - kein Build-Schritt fuer die App
// selbst noetig.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.KfkPasteImport = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {

  const KFK_DATA_START = '<<<KFK-DATA';
  const KFK_DATA_END   = 'KFK-DATA>>>';

  // Entfernt optionale Markerzeilen und normalisiert typografische
  // Anfuehrungszeichen (z.B. aus Google Docs kopiert) - identisch zur
  // Backend-Funktion readKfkDataFromDoc_.
  function extractKfkDataJson(rawText) {
    const text = String(rawText || '');
    let jsonPart = text;
    const si = text.indexOf(KFK_DATA_START);
    if (si >= 0) {
      const after = si + KFK_DATA_START.length;
      const ei = text.indexOf(KFK_DATA_END, after);
      jsonPart = (ei < 0) ? text.substring(after) : text.substring(after, ei);
    }
    return jsonPart
      .replace(/[“”„‟″‶]/g, '"')
      .replace(/[‘’‚‛′‵]/g, "'")
      .trim();
  }

  // Parst "Cannabis sativa (Hanf)" -> {lat:'Cannabis sativa', kurz:'Hanf'}.
  // Ohne Klammern: kompletter String als lat, kurz bleibt leer (kein Raten).
  function parseArtField(art) {
    const s = String(art || '').trim();
    if (!s) return { lat: '', kurz: '' };
    const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (m) return { lat: m[1].trim(), kurz: m[2].trim() };
    return { lat: s, kurz: '' };
  }

  function parseAndValidateKfkData(rawText) {
    const jsonPart = extractKfkDataJson(rawText);
    if (!jsonPart) {
      return { ok: false, error: 'Eingabe ist leer' };
    }

    let data;
    try {
      data = JSON.parse(jsonPart);
    } catch (e) {
      return { ok: false, error: 'KFK-DATA-Block ist kein gültiges JSON: ' + e.message };
    }

    if (data.schema && String(data.schema).indexOf('kfk-protocol') !== 0) {
      return { ok: false, error: 'schema: Unerwartetes Schema "' + data.schema + '" (erwartet: kfk-protocol-v1/v2)' };
    }

    if (!data.versuchsnr) return { ok: false, error: 'versuchsnr: Feld fehlt' };
    if (!data.titel) return { ok: false, error: 'titel: Feld fehlt' };
    if (!Array.isArray(data.treatments) || data.treatments.length === 0) {
      return { ok: false, error: 'treatments: Feld fehlt oder ist ein leeres Array' };
    }
    if (!Array.isArray(data.rbd) || data.rbd.length === 0) {
      return { ok: false, error: 'rbd: Feld fehlt oder ist ein leeres Array' };
    }

    const treatmentCodes = new Set(
      data.treatments
        .map(t => String((t && t.code) || '').toUpperCase().trim())
        .filter(Boolean)
    );
    for (let i = 0; i < data.rbd.length; i++) {
      const en = data.rbd[i] || {};
      const code = String(en.t || '').toUpperCase().trim();
      if (!treatmentCodes.has(code)) {
        return {
          ok: false,
          error: 'rbd[' + i + '] (tray ' + (en.tray != null ? en.tray : '?') +
                 ', ' + (en.col || '?') + (en.row != null ? en.row : '?') +
                 '): Treatment-Code "' + (en.t || '') + '" kommt in treatments nicht vor'
        };
      }
    }

    const anzahlTrays = data.anzahl_trays != null ? Number(data.anzahl_trays) : 1;
    const rasterCols  = data.raster_cols  != null ? Number(data.raster_cols)  : 4;
    const rasterRows  = data.raster_rows  != null ? Number(data.raster_rows)  : 6;
    const maxPlaetze = anzahlTrays * rasterCols * rasterRows;
    if (data.rbd.length > maxPlaetze) {
      return {
        ok: false,
        error: 'rbd: ' + data.rbd.length + ' Einträge, aber nur ' + maxPlaetze + ' Plätze ' +
               '(anzahl_trays=' + anzahlTrays + ' × raster_cols=' + rasterCols + ' × raster_rows=' + rasterRows + ')'
      };
    }

    let artParsed = { lat: data.baumart_lat || '', kurz: data.baumart_kurz || '' };
    if (!artParsed.lat && !artParsed.kurz && data.art) {
      artParsed = parseArtField(data.art);
    }

    return {
      ok: true,
      data: {
        schema: data.schema || '',
        versuchsnr: String(data.versuchsnr),
        titel: String(data.titel),
        themenbereich: data.themenbereich || '',
        hypothese: data.hypothese || '',
        start_datum: data.start_datum || '',
        mdd_pp: data.mdd_pp || '',
        saatgutcharge: data.saatgutcharge || '',
        ort: data.ort || '',
        verantwortlich: data.verantwortlich || '',
        id_nummer: data.id_nummer || '',
        baumart_lat: artParsed.lat,
        baumart_kurz: artParsed.kurz,
        treatments: data.treatments,
        rbd: data.rbd,
        anzahl_trays: anzahlTrays,
        raster_cols: rasterCols,
        raster_rows: rasterRows,
        samen_pro_topf: data.samen_pro_topf != null ? Number(data.samen_pro_topf) : 36,
        az_geplant: data.az_geplant != null ? Number(data.az_geplant) : null,
        // Schema v1 kennt kein standorte-Feld - dann null (kein Raten), siehe
        // KfkStandorte.applyImportStandorte fuers spaetere Verhalten im Frontend.
        standorte: Array.isArray(data.standorte) ? data.standorte : null
      }
    };
  }

  return {
    extractKfkDataJson,
    parseArtField,
    parseAndValidateKfkData
  };
});
