// Paste-Import: parst + validiert einen per Copy-Paste eingefuegten
// KFK-DATA-Block (Schema kfk-protocol-v1/v2/v3), damit ein Versuch angelegt
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
      return { ok: false, error: 'schema: Unerwartetes Schema "' + data.schema + '" (erwartet: kfk-protocol-v1/v2/v3)' };
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

    const { treatments, matrixSuggestions } = mapTreatmentsV3_(data.treatments);

    return {
      ok: true,
      data: {
        schema: data.schema || '',
        versuchsnr: String(data.versuchsnr),
        titel: String(data.titel),
        themenbereich: data.themenbereich || '',
        hypothese: data.hypothese || '',
        start_datum: data.start_datum || '',
        // Aussaat/Aktivierung (Punkt 1): aktivierung_datum faellt auf das
        // aeltere start_datum zurueck, wenn kein eigenes Feld mitgeliefert
        // wurde (reine Umbenennung fuer Alt-Bloecke, kein Raten).
        aussaat_datum: data.aussaat_datum || '',
        aktivierung_datum: data.aktivierung_datum || data.start_datum || '',
        mdd_pp: data.mdd_pp || '',
        saatgutcharge: data.saatgutcharge || '',
        // Saatgutcharge-ID (Punkt 2): neues Feld gewinnt, sonst Alt-Feld saatgutcharge.
        saatgutcharge_id: data.saatgutcharge_id || data.saatgutcharge || '',
        charge_kfk_potenzial: data.charge_kfk_potenzial != null ? Number(data.charge_kfk_potenzial) : '',
        // Substratcharge (Punkt 3): id/basis/verhaeltnis sind laut Projektauftrag
        // Pflicht, aber auch hier gilt Rueckwaertskompatibilitaet - fehlende
        // Felder werden nicht erraten, sondern bleiben leer (Banner zeigt sie an).
        substratcharge_id: data.substratcharge_id || '',
        substrat_basis: data.substrat_basis || '',
        substrat_zuschlag: data.substrat_zuschlag || '',
        substrat_verhaeltnis: data.substrat_verhaeltnis || '',
        substrat_lieferant_lot: data.substrat_lieferant_lot || '',
        substrat_ec: data.substrat_ec != null ? Number(data.substrat_ec) : '',
        substrat_ph: data.substrat_ph != null ? Number(data.substrat_ph) : '',
        substrat_anmerkung: data.substrat_anmerkung || '',
        substrat_gemischt_von: data.substrat_gemischt_von || '',
        // AZ-Termine (Punkt 1): Vorschlaege sind frei editierbar, daher hier
        // nur durchgereicht (kein Berechnen/Raten im Parser).
        az_termine: Array.isArray(data.az_termine) ? data.az_termine : null,
        ort: data.ort || '',
        verantwortlich: data.verantwortlich || '',
        id_nummer: data.id_nummer || '',
        baumart_lat: artParsed.lat,
        baumart_kurz: artParsed.kurz,
        treatments,
        // Vorschlaege fuer matrixzusammensetzung aus dem alten spec-Feld, wo
        // das neue Feld fehlt - werden der UI angeboten, NIE automatisch
        // uebernommen (siehe Projektauftrag Punkt 6).
        matrixSuggestions,
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

  // Wendet die Alt-Feld-Zuordnung aus Punkt 6 auf jedes Treatment an, ohne die
  // Eingabe zu mutieren: treatments[].spec.charge -> pelletcharge_id (nur wenn
  // das neue Feld fehlt), treatments[].spec (gesamt) -> Vorschlag fuer
  // matrixzusammensetzung (nur als separate Map, nie automatisch uebernommen).
  function mapTreatmentsV3_(treatmentsIn) {
    const matrixSuggestions = {};
    if (!Array.isArray(treatmentsIn)) return { treatments: treatmentsIn, matrixSuggestions };
    const treatments = treatmentsIn.map(t => {
      if (!t || typeof t !== 'object') return t;
      const out = Object.assign({}, t);
      if ((out.pelletcharge_id === undefined || out.pelletcharge_id === '') &&
          t.spec && typeof t.spec === 'object' && t.spec.charge) {
        out.pelletcharge_id = t.spec.charge;
      }
      if (!out.matrixzusammensetzung && t.spec) {
        matrixSuggestions[t.code || ''] = (typeof t.spec === 'string') ? t.spec : JSON.stringify(t.spec);
      }
      // Alt-/Fehlschreibung farbe_hex (ohne '#', SOP-Draft-Fehler) -> color
      // (Tracker-Rendering liest ausschliesslich treatments[].color, siehe
      // index.html renderRBD/renderRBDForTray). Nur greifen, wenn color noch
      // fehlt - ein bereits vorhandenes color-Feld hat Vorrang.
      if (!out.color && t.farbe_hex) {
        const hex = String(t.farbe_hex).trim();
        out.color = hex.startsWith('#') ? hex : ('#' + hex);
      }
      return out;
    });
    return { treatments, matrixSuggestions };
  }

  return {
    extractKfkDataJson,
    parseArtField,
    parseAndValidateKfkData
  };
});
