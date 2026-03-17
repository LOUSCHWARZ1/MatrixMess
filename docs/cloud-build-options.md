# macOS-Build in der Cloud

Stand: 2026-03-17

## Ziel

Du entwickelst auf Windows, laesst den Apple-Build aber auf einem macOS-Runner laufen.

Im Repo sind jetzt drei Wege vorbereitet:

- `GitHub Actions`
- `Codemagic`
- `Xcode Cloud` mit vorbereiteten `ci_scripts`

## 1. GitHub Actions

Datei:
- [ios-cloud-build.yml](/c:/Users/lou/Apple%20apps/MatrixMess/.github/workflows/ios-cloud-build.yml)

Was der Workflow macht:
- installiert `xcodegen`
- erzeugt die `MatrixMess.xcodeproj`
- baut die App fuer den iOS-Simulator zur Validierung
- kann per `workflow_dispatch` zusaetzlich eine `unsigned IPA` fuer AltStore erzeugen

Artifact:
- `MatrixMess-unsigned-ipa`

Wichtiger Punkt:
Die unsigned IPA ist fuer den AltStore-/AltServer-Weg gedacht, bei dem AltServer die App erneut signiert.

## 2. Codemagic

Datei:
- [codemagic.yaml](/c:/Users/lou/Apple%20apps/MatrixMess/codemagic.yaml)

Vorbereitete Workflows:
- `ios-simulator-validation`
- `ios-unsigned-ipa`

Damit bekommst du:
- einen nativen macOS-Build ohne lokalen Mac
- optional direkt eine unsigned IPA als Artifact

## 3. Xcode Cloud

Vorbereitete Skripte:
- [ci_post_clone.sh](/c:/Users/lou/Apple%20apps/MatrixMess/ios/MatrixMess/ci_scripts/ci_post_clone.sh)
- [ci_pre_xcodebuild.sh](/c:/Users/lou/Apple%20apps/MatrixMess/ios/MatrixMess/ci_scripts/ci_pre_xcodebuild.sh)

Diese Skripte sorgen dafuer, dass Xcode Cloud:
- `xcodegen` installiert
- das Xcode-Projekt vor dem Build generiert

Die eigentliche Aktivierung passiert trotzdem in:
- `Xcode`
- `App Store Connect`

Das kann ich dir repo-seitig vorbereiten, aber nicht von hier aus fuer dein Apple-Konto einschalten.

## AltStore-Weg mit Cloud-Build

1. GitHub Actions oder Codemagic starten.
2. Die erzeugte `MatrixMess-unsigned.ipa` herunterladen.
3. In Windows `AltServer` starten.
4. Die IPA ueber den AltServer-/AltStore-Sideload-Weg auswaehlen.
5. AltServer signiert die App fuer dein Geraet mit deiner Apple-ID.

## Was dafuer noch von dir gebraucht wird

### Fuer GitHub Actions

- GitHub-Repo mit aktiviertem Actions-Runner

### Fuer Codemagic

- Codemagic-Projekt, das auf dieses Repo zeigt

### Fuer Xcode Cloud

- Apple Developer Account
- App Store Connect Zugriff
- Xcode-Workflow auf einem Mac oder ueber Apple-Setup

### Fuer echte Push-/OAuth-/Release-Funktionen

- funktionierendes Matrix Push Gateway, typischerweise `Sygnal`
- Apple-Push-faehige App-ID / Team / Signing
- Google OAuth Client ID
- Microsoft Entra App Registration fuer Outlook OAuth

## Quellen

- GitHub macOS runners: https://docs.github.com/actions/using-github-hosted-runners/about-github-hosted-runners
- GitHub artifact upload: https://docs.github.com/actions/using-workflows/storing-workflow-data-as-artifacts
- Xcode Cloud: https://developer.apple.com/xcode-cloud/
- Xcode Cloud custom scripts: https://developer.apple.com/documentation/xcode/writing-custom-build-scripts
- Codemagic native iOS docs: https://docs.codemagic.io/yaml-quick-start/building-a-native-ios-app/
- AltStore FAQ: https://faq.altstore.io/
