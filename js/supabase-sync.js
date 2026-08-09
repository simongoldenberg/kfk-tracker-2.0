// Supabase-Spiegelung (Verbesserungsplan Block C, §5.5/5.6): additive Kopie
// ausgewaehlter Schreibvorgaenge nach Supabase fuer schnelle SQL-Auswertung.
// Apps Script/Sheet bleibt die primaere Datenhaltung, aus der die App liest
// (loadVersuch/loadList) - faellt Supabase aus oder ist offline, merkt die
// eigentliche Zaehl-Eingabe davon nichts.
//
// RLS-Modell (Variante A, siehe Verbesserungsplan §5.4): versuche hat
// insert+update+select, standorte/az_counts nur insert+select (kein Update-
// Recht). Ein erneutes Insert auf denselben Primary Key (Korrektur eines
// bereits gezaehlten Werts) schlaegt dort daher mit einem Duplicate-Key-
// Fehler fehl - das wird bewusst als "bereits gespiegelt" behandelt und NICHT
// endlos nachversucht. Der jeweils aktuelle Stand bleibt trotzdem vollstaendig
// ueber versuche.kfk_data verfuegbar (siehe mirrorVersuch, wird bei jedem
// backupCurrentVersuch() aktualisiert).
(function (root) {
  const QUEUE_KEY = 'kfk_supabase_queue';
  const POSTGRES_DUPLICATE_KEY = '23505';
  let client = null;
  let onStatus = null;

  function init(url, key, statusCallback) {
    onStatus = statusCallback || null;
    if (!url || !key || !root.supabase || typeof root.supabase.createClient !== 'function') {
      client = null;
      return;
    }
    client = root.supabase.createClient(url, key);
    flush();
  }

  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) { /* best effort */ }
  }
  function setStatus(which) {
    if (onStatus) onStatus(which, loadQueue().length);
  }

  // Tabellen ohne Update-Recht (siehe Kopfkommentar): "INSERT ... ON CONFLICT
  // DO UPDATE" (normales upsert()) verlangt in Postgres IMMER das UPDATE-Recht
  // auf die Tabelle, selbst wenn nie ein Konflikt eintritt. Fuer Tabellen ohne
  // Update-Policy daher stattdessen ignoreDuplicates:true verwenden -> erzeugt
  // "ON CONFLICT DO NOTHING", das braucht nur INSERT. Eine Korrektur eines
  // bereits gespiegelten Werts wird dort also still verworfen (kein Fehler),
  // der aktuelle Stand bleibt trotzdem ueber versuche.kfk_data verfuegbar.
  const NO_UPDATE_TABLES = { standorte: true, az_counts: true };

  async function attemptUpsert(item) {
    const { error } = await client.from(item.table).upsert(item.row, {
      onConflict: item.conflictCols,
      ignoreDuplicates: !!NO_UPDATE_TABLES[item.table]
    });
    if (error) {
      if (NO_UPDATE_TABLES[item.table] && error.code === POSTGRES_DUPLICATE_KEY) return;
      throw error;
    }
  }

  async function upsert(table, row, conflictCols) {
    if (!client) return;
    const item = { table, row, conflictCols };
    try {
      await attemptUpsert(item);
      setStatus('ok');
    } catch (e) {
      const q = loadQueue();
      q.push(item);
      saveQueue(q);
      setStatus(navigator.onLine ? 'err' : 'off');
      scheduleFlush();
    }
  }

  let flushing = false;
  async function flush() {
    if (flushing || !client || !navigator.onLine) return;
    flushing = true;
    try {
      let q = loadQueue();
      while (q.length > 0) {
        try {
          await attemptUpsert(q[0]);
        } catch (e) {
          break; // Reihenfolge wahren, Rest bleibt gequeued
        }
        q.shift();
        saveQueue(q);
      }
      setStatus(q.length === 0 ? 'ok' : (navigator.onLine ? 'err' : 'off'));
    } finally {
      flushing = false;
    }
  }
  let flushTimer = null;
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, 2000);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', flush);
  }

  function mirrorVersuch(versuchsnr, kfk_data) {
    upsert('versuche', { versuchsnr, kfk_data }, 'versuchsnr');
  }
  function mirrorStandort(row) {
    upsert('standorte', row, 'versuchsnr,tray');
  }
  function mirrorAzCount(row) {
    upsert('az_counts', row, 'versuchsnr,tray,spalte,reihe,az');
  }

  const api = {
    init, mirrorVersuch, mirrorStandort, mirrorAzCount, flush,
    pendingCount: () => loadQueue().length
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KfkSupabaseSync = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
