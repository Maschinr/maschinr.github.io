# AGTScan (PWA)

Web-Portierung der AGTScan iOS-App – Verwaltung von Atemschutzgeräten,
Prüfungen, Personen-Tauglichkeiten und Terminen. Läuft nach
Veröffentlichung unter `https://<user>.github.io/agtscan/`.

## Funktionen
- **Geräte**: Liste, Detailansicht mit Teilenummern (Trägerplatte,
  Druckluftflasche, Lungenautomat) und Prüfungen (Zustand, Druck-Gauge,
  Datum, Notizen). Umsortieren und Löschen im Bearbeiten-Modus.
- **Personen**: Aufgeteilt in *Tauglich* / *Nicht tauglich*. Detailansicht
  mit den fünf Nachweisen (G26.3, Atemschutzübung, -einsatz, -strecke,
  Theorie) inkl. farbiger Status-Punkte (grün gültig, rot abgelaufen,
  grau redundant).
- **Termine**: Überfällige (rot) und bald ablaufende (gelb) Tauglichkeiten
  und Geräteprüfungen.
- **Einstellungen**: FeuerOn-CSV-Import, Datensicherung export/import,
  alle Daten löschen, Erinnerungen.

## Technik
- Reines HTML/CSS/JavaScript (ES-Module), kein Build-Schritt.
- Daten werden lokal im Browser gespeichert (`localStorage`).
- Installierbar & offlinefähig (Web-App-Manifest + Service Worker).
- Responsiv: Bottom-Tabbar auf dem Handy, Seitenleiste auf dem Desktop,
  Light-/Dark-Mode automatisch.

## Hinweis zu Aktualisierungen
Der Service Worker cached die App-Dateien. Nach einer neuen Version die
Cache-Version in `sw.js` (`const CACHE = 'agtscan-vN'`) erhöhen, damit
Clients zuverlässig aktualisieren.
