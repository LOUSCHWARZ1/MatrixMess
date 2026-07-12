# MatrixMess Android

Minimale Android-Shell (Kotlin, kein Compose) um den MatrixMess-Web-Client aus `clients/web/`.

## Funktionsweise

- Eine `WebView`-Activity laedt den Web-Client ueber `androidx.webkit` **WebViewAssetLoader** von
  `https://appassets.androidx.dev/assets/web/index.html`. Dadurch laeuft die App auf einem
  https-Origin (statt `file://`), womit `fetch`-Aufrufe zum Matrix-Homeserver (CORS) und
  `localStorage` (Session-Persistenz via `domStorageEnabled`) sauber funktionieren.
- Requests an andere Hosts (Matrix-API) werden nicht abgefangen; externe Link-Klicks oeffnen
  im System-Browser.
- Die Web-Assets liegen **nicht** im Repo unter `app/src/main/assets/` — sie werden im CI-Build
  aus `clients/web/` nach `app/src/main/assets/web/` kopiert.

## Build (CI)

Der Workflow `.github/workflows/android-build.yml` baut bei Pushes auf `clients/web/**` oder
`clients/android/**` (sowie per `workflow_dispatch`) ein Debug-APK und laedt es als Artefakt
**MatrixMess-Android-APK** hoch.

Lokaler Build (Web-Assets vorher selbst kopieren):

```sh
mkdir -p app/src/main/assets/web
cp -r ../web/. app/src/main/assets/web/
gradle assembleDebug
```

## Release-Signing

Der Release-Keystore liegt **nicht** im Repo. `app/build.gradle.kts` liest Keystore und
Passwoerter aus einer gitignorierten `keystore.properties` (lokal) oder aus Umgebungs-
variablen. Der CI-Workflow dekodiert den Keystore aus GitHub-Actions-Secrets:

| Secret | Inhalt |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 des Keystores (`base64 -w0 release.keystore`) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore-Passwort |
| `ANDROID_KEY_ALIAS` | Key-Alias (z. B. `matrixmess`) |
| `ANDROID_KEY_PASSWORD` | Key-Passwort (bei PKCS12 = Keystore-Passwort) |

Fehlen die Secrets, wird der Release **unsigniert** gebaut (lokale Entwicklungsbuilds bleiben
so lauffaehig). Neuen Keystore erzeugen:

```sh
keytool -genkeypair -v -keystore release.keystore -alias matrixmess \
  -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12
```

## Installation (Sideload)

1. Workflow-Artefakt `MatrixMess-Android-APK` herunterladen und entpacken (`app-debug.apk`).
2. Auf dem Geraet "Installation aus unbekannten Quellen" erlauben.
3. APK uebertragen und installieren, oder per `adb install app-debug.apk`.

Das Debug-APK ist automatisch mit dem Debug-Key signiert und direkt installierbar.
Mindestversion: Android 8.0 (API 26).
