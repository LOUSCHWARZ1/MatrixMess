# MatrixMess

Ein eigener Matrix-Messenger fuer **iOS, Windows, Web und Android** — modern-minimalistisches
Design, Spaces mit kuratiertem Main-Space, Bridges, Kalender-Integration und
Ende-zu-Ende-Verschluesselung.

## Plattformen

| Plattform | Verzeichnis | Technik | Build-Artefakt |
|---|---|---|---|
| iOS | `ios/MatrixMess` | SwiftUI + matrix-rust-components-swift | unsigned IPA (Sideload via AltStore) |
| Web | `clients/web` | Vanilla JS, kein Build-Step | direkt im Browser nutzbar |
| Windows | `clients/desktop` | Electron um den Web-Kern | NSIS-Installer + portable EXE |
| Android | `clients/android` | Kotlin-WebView-Shell um den Web-Kern | Debug-APK (Sideload) |

Web, Windows und Android teilen sich denselben Web-Kern (`clients/web`) — das gleiche
Modell wie bei Element Web/Desktop. Die E2EE laeuft auf allen Plattformen ueber die
offizielle Matrix-Rust-Crypto-Engine: nativ auf iOS, als WASM
(`clients/web/vendor/matrix-sdk-crypto-wasm`) im Web-Kern.

## Builds (GitHub Actions)

- `.github/workflows/ios-cloud-build.yml` — Simulator-Validierung + unsigned IPA (macOS-Runner)
- `.github/workflows/desktop-windows-build.yml` — Windows-Installer (windows-Runner)
- `.github/workflows/android-build.yml` — installierbares APK (ubuntu-Runner)

Alle Workflows laufen bei Push automatisch; die Artefakte haengen am jeweiligen
Actions-Run.

## Funktionsumfang (Kurzueberblick)

- Login mit Homeserver-Discovery (`.well-known`), Session-Restore, Sync per Long-Poll
- Spaces (inkl. eigener Custom-Spaces), Main-Space mit Favoriten, Bridge-Erkennung
- Timeline mit Nachrichten-Gruppierung, Datums-Trennern, Reaktionen, Antworten,
  Bearbeiten, Loeschen, Weiterleiten, Medien, Sprachnachrichten (iOS)
- E2EE mit Recovery-Key-Import und Geraete-Verifizierung (iOS: SAS)
- Archiv, Chatlisten-Filter, Benachrichtigungsmodus pro Raum (serverseitige Push-Rules)
- App Lock/Chat Lock mit Face ID (iOS), blockierte Kontakte (`m.ignored_user_list`),
  Geraeteverwaltung, serverseitige Suche
- Kalender-Integration (Apple/EventKit, Google, Outlook) auf iOS
- Detaillierte Einstellungen: Theme, Akzentfarben, Chat-Dichte, Textgroesse,
  Auto-Download-Richtlinie, Upload-Qualitaet, Speicherverwaltung

## Lokal entwickeln

- **Web**: `clients/web/index.html` direkt im Browser oeffnen (oder per `python3 -m http.server`).
- **Windows**: in `clients/desktop` erst `cp -r ../web web`, dann `npm install && npm start`.
- **Android**: `clients/android` mit Android Studio oeffnen; Web-Assets nach
  `app/src/main/assets/web/` kopieren (macht die CI automatisch).
- **iOS**: auf dem Mac `xcodegen generate` in `ios/MatrixMess`, dann das
  `.xcodeproj` in Xcode oeffnen — oder den Cloud-Build nutzen (siehe
  `docs/altstore-sideload-guide.md`).

## Dokumentation

- `docs/messenger-feature-roadmap.md` — Zielbild und Umsetzungsstand
- `docs/remaining-implementation-paths.md` — technische Wege fuer offene Punkte
- `docs/ios-matrix-client-plan.md` — Architektur- und Build-Leitfaden iOS
- `docs/altstore-sideload-guide.md` — IPA aufs iPhone bringen
- `docs/cloud-build-options.md`, `docs/calendar-integration-notes.md`
