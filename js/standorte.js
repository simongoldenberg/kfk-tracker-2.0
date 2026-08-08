// Standort-Datenmodell fuer Trays (Regal/Boden im Growzelt).
//
// Schema: { tray: number, regal: number|null, boden: number|null, erfasstAm: string|null }
// pro Tray, gespeichert im Versuchsobjekt unter `standorte` (Array). Aenderungen
// werden zusaetzlich, mit Datum + AZ-Nummer, in `standortHistorie` protokolliert
// (der vorherige Wert wird dort nie ueberschrieben).
//
// UMD-artiger Export: klassisches <script>-Tag im Frontend (index.html) haengt
// die Funktionen an window.KfkStandorte, Vitest importiert dieselbe Datei per
// ESM/CJS-Interop - kein Build-Schritt fuer die App selbst noetig.
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.KfkStandorte = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {

  const KFK_STANDORTE_SCHEMA_VERSION = 2;

  function emptyStandort(tray) {
    return { tray: Number(tray), regal: null, boden: null, erfasstAm: null };
  }

  // Ergaenzt fehlende Tray-Eintraege verlustfrei (regal/boden = null), behaelt
  // vorhandene Eintraege unveraendert. Mutiert v.standorte NICHT, liefert eine
  // neue, vollstaendige Liste fuer alle Trays 1..anzahl_trays.
  function migrateVersuchStandorte(v) {
    const anzahlTrays = Math.max(1, Number((v && v.anzahl_trays) || 1));
    const vorhanden = (v && Array.isArray(v.standorte)) ? v.standorte : [];
    const byTray = {};
    vorhanden.forEach(s => {
      if (s && s.tray != null) {
        byTray[Number(s.tray)] = {
          tray: Number(s.tray),
          regal: s.regal == null ? null : Number(s.regal),
          boden: s.boden == null ? null : Number(s.boden),
          erfasstAm: s.erfasstAm || null
        };
      }
    });
    const result = [];
    for (let tray = 1; tray <= anzahlTrays; tray++) {
      result.push(byTray[tray] || emptyStandort(tray));
    }
    return result;
  }

  function migrateVersuchStandortHistorie(v) {
    return (v && Array.isArray(v.standortHistorie)) ? v.standortHistorie.slice() : [];
  }

  // Wendet Punkt 5 (Import) an: uebernimmt regal/boden aus dem KFK-DATA-Block
  // (Feld `standorte`, falls vorhanden), fehlende/fehlende Trays bleiben leer
  // (regal/boden = null) statt geraten zu werden.
  function applyImportStandorte(v, importedStandorte) {
    const basis = migrateVersuchStandorte(v);
    if (!Array.isArray(importedStandorte)) return basis;
    const byTray = {};
    importedStandorte.forEach(s => {
      if (s && s.tray != null) byTray[Number(s.tray)] = s;
    });
    return basis.map(s => {
      const imp = byTray[s.tray];
      if (!imp) return s;
      return {
        tray: s.tray,
        regal: imp.regal == null ? null : Number(imp.regal),
        boden: imp.boden == null ? null : Number(imp.boden),
        erfasstAm: null
      };
    });
  }

  function standortForTray(standorte, tray) {
    return (standorte || []).find(s => Number(s.tray) === Number(tray)) || emptyStandort(tray);
  }

  function isStandortFehlend(standort) {
    return !standort || standort.regal == null || standort.boden == null;
  }

  // Traegt eine Aenderung ein: neuer Wert ersetzt standorte[tray], der alte Wert
  // wandert (mit Datum + AZ) unveraendert in standortHistorie.
  function recordStandortChange(v, tray, neu, az, isoDatum) {
    const standorte = migrateVersuchStandorte(v);
    const historie = migrateVersuchStandortHistorie(v);
    const idx = standorte.findIndex(s => Number(s.tray) === Number(tray));
    const alt = idx >= 0 ? standorte[idx] : emptyStandort(tray);

    historie.push({
      tray: Number(tray),
      regal: alt.regal,
      boden: alt.boden,
      erfasstAm: alt.erfasstAm,
      geaendertAm: isoDatum,
      az: az
    });

    const aktualisiert = { tray: Number(tray), regal: neu.regal == null ? null : Number(neu.regal), boden: neu.boden == null ? null : Number(neu.boden), erfasstAm: isoDatum };
    if (idx >= 0) standorte[idx] = aktualisiert;
    else standorte.push(aktualisiert);

    return { standorte, standortHistorie: historie };
  }

  return {
    KFK_STANDORTE_SCHEMA_VERSION,
    emptyStandort,
    migrateVersuchStandorte,
    migrateVersuchStandortHistorie,
    applyImportStandorte,
    standortForTray,
    isStandortFehlend,
    recordStandortChange
  };
});
