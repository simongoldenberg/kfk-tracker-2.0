-- Ergaenzt die Ergebnistabelle (ergebnisse.html) um ein Feld fuer die
-- nachtraeglich (durch Claude) verfasste Auswertung eines Versuchs.
--
-- Bewusst KEINE neue Tabelle, sondern zwei zusaetzliche Spalten auf der
-- bestehenden `versuche`-Tabelle: die vorhandene RLS-Policy dort erlaubt dem
-- anon-Key bereits update+insert+select (siehe CLAUDE.md, Abschnitt
-- "Supabase-Spiegelung"), eine neue Tabelle haette zusaetzliche RLS-Regeln
-- gebraucht ohne echten Mehrwert - Versuchsbeschreibung/Hypothese/
-- Auszaehlungsergebnisse liegen ohnehin schon vollstaendig in kfk_data.
--
-- Einmalig im Supabase SQL-Editor ausfuehren.

alter table public.versuche
  add column if not exists auswertung jsonb,
  add column if not exists auswertung_updated_at timestamptz;

-- Erwartete Struktur von `auswertung` (frei erweiterbar, ergebnisse.html
-- liest nur diese drei Felder, alles andere wird einfach ignoriert):
-- {
--   "zusammenfassung": "Kurzfassung des Ergebnisses",
--   "interpretation": "Was die Zahlen im Kontext der Hypothese bedeuten",
--   "empfehlung": "Konkrete Handlungsempfehlung fuer Folgeversuche"
-- }
