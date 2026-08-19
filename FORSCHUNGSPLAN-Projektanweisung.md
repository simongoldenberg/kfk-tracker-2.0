# Projektanweisung „Forschungsplan" — verschoben

**Diese Datei ist seit dem 15.08.2026 kein eigenständiges Dokument mehr.**

Sie beschrieb das KFK-DATA-Schema in der Fassung `kfk-protocol-v1` (Stand
08.08.2026) — ohne Chargen-IDs, ohne die Trennung von Aussaat und Aktivierung,
ohne `anker`/`nackte_saat`. Damit war sie eine dritte, veraltete Quelle neben der
SOP und `CLAUDE.md`.

## Maßgeblich ist ab sofort ausschließlich

**`SOP_Versuchsplanung_Skyseed.md`, §4.2** — im Claude-Projekt
*Forschungsplan_Skyseed*.

Dort stehen die vollständigen Feldtabellen für `kfk-protocol-v3`
(Versuchsebene, Chargenfelder, Treatment-Ebene), die Farbpalette der
Themenbereiche, die Zählregeln und die Chargen-ID-Formate. Die SOP wird gegen
`js/paste-import.js` (`parseAndValidateKfkData`) verifiziert und nicht aus
Erinnerung fortgeschrieben.

Die Umsetzung im Tracker — welches Feld welcher Code liest, welche Sheet-Spalte
dahintersteht — ist in `CLAUDE.md` dokumentiert.

**Regel:** Weicht der Code von der SOP ab, ist das ein Bug im Code oder eine
Lücke in der SOP. Es gibt keine dritte Wahrheit.
