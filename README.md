# MatrixMess

Startpunkt fuer einen eigenen Matrix-Chat-Client fuer iPhone.

Im Workspace lag vorher nur das Standard-Java-Beispiel von VS Code. Das habe ich nicht geloescht, aber das Projekt bekommt jetzt eine iOS-Richtung mit einer klaren Empfehlung:

- Fuer einen eigenen, schlanken Client: `SwiftUI` + `matrix-rust-components-swift`
- Fuer den schnellsten Weg zu einer fertigen App: Fork von `Element X iOS`

## Was in diesem Repo jetzt liegt

- `docs/ios-matrix-client-plan.md`
  Ein deutscher Leitfaden fuer Architektur, MVP, Build-Weg und Sideloading.
- `docs/calendar-integration-notes.md`
  Notizen fuer die spaetere echte Anbindung von Apple Calendar, Google Calendar und Outlook.
- `docs/cloud-build-options.md`
  Repo-seitig vorbereitete Wege fuer GitHub Actions, Codemagic und Xcode Cloud.
- `docs/altstore-sideload-guide.md`
  Der konkrete Weg von Build-Artefakt zu AltServer/AltStore auf dem iPhone.
- `ios/MatrixMess/project.yml`
  Ein `XcodeGen`-Projekt, damit du auf dem Mac daraus eine `.xcodeproj` erzeugen kannst.
- `ios/MatrixMess/Sources/App`
  Ein SwiftUI-Messenger mit `Main`-Space, getrennten Bridge-Spaces und Apple-naher Chat-Ansicht.
- `.github/workflows/ios-cloud-build.yml`
  Cloud-Build fuer macOS-Runner inkl. optionaler unsigned IPA.
- `codemagic.yaml`
  Alternative macOS-Cloud-Build-Konfiguration fuer native iOS-Builds.

## Empfohlener Weg

Wenn du lernen und wirklich verstehen willst, wie ein Matrix-Client auf iOS aufgebaut ist, bau zuerst einen kleinen MVP selbst:

1. Homeserver eingeben
2. Login
3. Spaces als Tabs anzeigen
4. Chats pro Space filtern
5. Wichtige Chats in den Main-Space legen
6. Nachrichten lesen und senden

Wenn du moeglichst schnell "eine richtige App" auf dem iPhone sehen willst, ist ein Fork von `Element X iOS` realistischer.

## Auf dem Mac weiterarbeiten

1. Xcode installieren
2. XcodeGen installieren
3. In `ios/MatrixMess` wechseln
4. `xcodegen generate` ausfuehren
5. Das erzeugte `MatrixMess.xcodeproj` in Xcode oeffnen
6. Team, Bundle Identifier und Signing einstellen
7. Danach die Matrix-Logik in `MatrixService.swift` mit dem echten SDK verdrahten

## Ohne lokalen Mac

Wenn du keinen Mac lokal hast, kannst du den Apple-Build jetzt ueber vorbereitete Cloud-Wege auslagern:

1. GitHub Actions fuer einen macOS-Build nutzen
2. optional eine unsigned IPA erzeugen
3. das Artifact herunterladen
4. ueber AltServer/AltStore auf dem iPhone signieren und installieren

## Wichtiger Hinweis

Dieses Windows-Setup kann das iOS-Projekt nicht lokal bauen, weil hier weder `swift` noch `xcodegen` installiert sind. Das Geruest ist bewusst so angelegt, dass du es spaeter auf einem Mac weiterverwenden kannst.

## Design-Preview auf Windows

Wenn du das Design sofort pruefen willst, kannst du die klickbare Browser-Vorschau unter `preview/index.html` oeffnen. Sie braucht keinen Build-Schritt und simuliert:

- viele getrennte Spaces und Bridge-Bereiche, inklusive `Main` als kuratiertem Sammelbereich
- Bottom-Tabs fuer `Chats`, `Calls`, `Calendar` und `Settings`
- das Hinzufuegen und Entfernen von Chats im Main-Space
- Chatliste, Detailansicht, Suche, Ruecknavigation und Nachrichteneingabe
- Voice Notes, Bilder, Videos, Dateien, Terminplanung, Reactions, Forwards und Link-Embeds
- Settings fuer Theme, Organisation, Notifications, Privacy, Calendar und Accessibility
