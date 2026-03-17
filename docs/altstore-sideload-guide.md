# MatrixMess mit AltServer auf iPhone bringen

Stand: 2026-03-17

## Wichtiger Punkt

`AltServer` auf Windows kann dir beim Installieren helfen, aber das iOS-Projekt muss vorher trotzdem als echte `IPA` gebaut werden.

Fuer dieses SwiftUI-/XcodeGen-Projekt bedeutet das:

- bauen und archivieren auf einem `Mac` mit `Xcode`
- danach die fertige `IPA` ueber `AltServer` bzw. `AltStore` auf dem iPhone installieren

## Was im Repo vorbereitet ist

- Build-Skript: [build-altstore-ipa.sh](/c:/Users/lou/Apple%20apps/MatrixMess/ios/MatrixMess/scripts/build-altstore-ipa.sh)
- Unsigned-IPA-Skript: [build-unsigned-ipa.sh](/c:/Users/lou/Apple%20apps/MatrixMess/ios/MatrixMess/scripts/build-unsigned-ipa.sh)
- Export-Optionen: [ExportOptions-Development.plist](/c:/Users/lou/Apple%20apps/MatrixMess/ios/MatrixMess/ExportOptions-Development.plist)
- Entitlements fuer Push-Tests: [MatrixMess.entitlements](/c:/Users/lou/Apple%20apps/MatrixMess/ios/MatrixMess/Sources/App/MatrixMess.entitlements)
- Cloud-Build-Wege: [cloud-build-options.md](/c:/Users/lou/Apple%20apps/MatrixMess/docs/cloud-build-options.md)

## Mac-Build

1. Repo auf einen Mac holen.
2. `Xcode` installieren.
3. `xcodegen` installieren.
4. In [ExportOptions-Development.plist](/c:/Users/lou/Apple%20apps/MatrixMess/ios/MatrixMess/ExportOptions-Development.plist) die `teamID` setzen.
5. Im Ordner `ios/MatrixMess` das Skript starten:

```sh
sh scripts/build-altstore-ipa.sh
```

6. Danach liegt die exportierte App unter `ios/MatrixMess/build/export`.

## AltServer / AltStore auf Windows

Wenn du die `IPA` gebaut hast:

1. iPhone per Kabel oder WLAN mit `AltServer` verbinden.
2. Sicherstellen, dass `iTunes` und `iCloud` aus der Apple-Quelle installiert sind.
3. Unter Windows beim Klick auf das `AltServer`-Tray-Icon `Shift` gedrueckt halten, damit `Sideload .ipa...` sichtbar wird.
4. Die fertige `IPA` auswaehlen.
5. Mit derselben Apple-ID signieren, die AltStore verwendet.

Wenn du keinen Mac lokal hast, kannst du dafuer auch die `unsigned IPA` aus GitHub Actions oder Codemagic nutzen und erst in AltServer signieren.

## Was du fuer die offenen Systemdienste noch brauchst

### Push/APNs

- Apple Developer Team
- APNs faehiges App-ID-/Provisioning-Setup
- produktives Matrix Push Gateway, typischerweise `Sygnal`
- gueltige Gateway-URL in den App-Settings

### Google Calendar OAuth

- OAuth-Client-ID fuer iOS / native App
- Redirect URI: `dev.matrixmess.app:/oauth/google`

### Outlook OAuth

- Microsoft Entra App Registration
- Redirect URI: `msauth.dev.matrixmess.app://auth`

### E2EE und echte Calls

- finaler Mac-/Xcode-Build gegen die aktuellen `matrix-rust-components-swift`-APIs
- verifizierte WebRTC-/VoIP-Signalisierung gegen echte Matrix-Call-Flows

## Ehrlicher Stand

Das Repo ist jetzt fuer diesen Weg deutlich besser vorbereitet. Die letzten harten Schritte sind aber echte Infrastruktur- und Mac-Build-Themen und koennen nicht allein in diesem Windows-Workspace abgeschlossen werden.
