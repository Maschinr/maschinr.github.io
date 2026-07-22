# AGTScan — PWA

Progressive Web App, die die iOS-App **AGTScan** (Atemschutz-Verwaltung einer
Feuerwehr) funktional nachbaut. Modernes, responsives Web-Design für Desktop und
Mobile — bewusst **nicht** im iOS-Look, sondern mit gängigen Web-/PWA-Mustern
(Seitenleiste am Desktop, Tab-Leiste auf dem Handy, Karten, Bottom-Sheets,
Light-/Dark-Mode).

## Funktionsumfang (1:1 zur iOS-App)

- **Geräte** — Liste mit Reihenfolge (Drag-Handle), Detailansicht mit
  Teilenummern (Trägerplatte, Druckluftflasche, Lungenautomat) inkl.
  **Barcode-Scan** (Kamera; nativer `BarcodeDetector`, sonst lokaler
  zxing-wasm-Decoder — s. u.) und Prüfungen (Zustand, Druck 0–350 bar mit
  Anzeige-Gauge, Notizen, Datum).
- **Personen** — gruppiert in *Tauglich* / *Nicht tauglich*. Detailansicht mit
  farbigen Status-Kreisen je Nachweis (grün = gültig, rot = abgelaufen,
  grau = durch OR-Nachweis abgedeckt) und Tauglichkeits-Pill auf Namenshöhe.
- **Termine** — anstehende und überfällige Fristen: Personen-Tauglichkeiten
  (rot = abgelaufen, gelb = läuft im nächsten Monat ab) und Geräteprüfungen
  (gelb = fällig in einer Woche, rot = älter als ein Monat).
- **Einstellungen** — Benachrichtigungs-Schalter, **FeuerOn-CSV-Import**
  (inkl. Rückrechnung Ablauf- → Nachweisdatum: G26.3 −3 Jahre, sonst −1 Jahr),
  JSON-Export, „Alle Daten löschen“.

Die Tauglichkeits- und Fristen-Logik ist exakt aus dem Swift-Code übernommen
(`fitness.js` ↔ `Person.swift`, `importer.js` ↔ `FeuerOnImporter.swift`).

## Daten & Technik

- **Speicher:** `localStorage` (Schlüssel `agtscan.data.v1`) — komplett lokal,
  keine Server, funktioniert offline.
- **PWA:** `manifest.webmanifest` + `sw.js` (Service Worker, offline-fähig,
  installierbar). Icons unter `icons/`.
- **Kein Build-Schritt**, keine Abhängigkeiten — reines ES-Modul-JavaScript.

## Lokal starten

```bash
cd dist
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. (Kamera-Scan und Service Worker benötigen
`localhost` oder HTTPS.)

## Hinweise

- **Benachrichtigungen:** Ein reines PWA kann ohne Push-Server keine
  OS-Benachrichtigungen zeitgesteuert planen. Anstehende Fristen werden daher
  beim Öffnen der App geprüft und angezeigt (Badge + optionale
  Web-Notification).
- **Barcode-Scan:** Nutzt die native `BarcodeDetector`-API, wo vorhanden
  (v. a. Chrome/Android). Wo sie fehlt (z. B. **iOS Safari**), lädt die App
  automatisch den lokal mitgelieferten **zxing-wasm**-Decoder (`vendor/`,
  einmalig ~1,1 MB, danach offline im SW-Cache) und dekodiert die Kamerabilder
  damit auf dem Gerät. Manuelle Eingabe bleibt jederzeit als Alternative im
  Scan-Dialog. Beides benötigt HTTPS oder `localhost`.

## Drittanbieter

`vendor/` enthält den Barcode-Decoder **zxing-wasm** v3.1.2
(MIT; bündelt zxing-cpp, Apache-2.0), lokal eingebunden für Offline-Betrieb.
Details in `vendor/README.txt`.
