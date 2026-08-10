-- Erlaubt das Loeschen einzelner Zeilen in `versuche` ueber den anon-Key,
-- damit die Ergebnistabelle (ergebnisse.html) einen Loeschen-Button fuer
-- fehlerhafte/doppelte Spiegel-Eintraege anbieten kann.
--
-- WICHTIG: Das loescht ausschliesslich die Supabase-Spiegelung (kfk_data-
-- Snapshot fuer diese Ergebnistabelle) - NICHT den echten Versuch. Index-
-- Zeile im Google Sheet, Daten-Sheet, Drive-Ordner und Asana-Task bleiben
-- unberuehrt (siehe CLAUDE.md, Abschnitt "Ergebnistabelle").
--
-- Bewusste Erweiterung der RLS "Variante A" (siehe CLAUDE.md, Abschnitt
-- "Supabase-Spiegelung"): `versuche` hatte bislang nur insert+select+update
-- fuer anon. DELETE wird nur fuer diese eine Tabelle ergaenzt, nicht fuer
-- `standorte`/`az_counts` - dort bleibt bewusst kein DELETE/UPDATE moeglich,
-- da diese Tabellen ausschliesslich fuer SQL-Auswertung (Block C) gedacht
-- sind und die Ergebnistabelle sie nicht anzeigt/loescht.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

create policy "anon kann versuche loeschen" on public.versuche
  for delete
  to anon
  using (true);

grant delete on public.versuche to anon;
