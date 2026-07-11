# Sicherheitsrichtlinie

## Schwachstellen melden

Bitte melde Sicherheitslücken **nicht** über öffentliche Issues, sondern
privat per E-Mail an den Repository-Inhaber (siehe GitHub-Profil) oder über
GitHub Security Advisories („Report a vulnerability"). Wir bestätigen den
Eingang zeitnah und koordinieren eine verantwortungsvolle Offenlegung.

## Umfang

- **Web-App** (`clients/web/`) – der ausgelieferte Stand liegt vollständig im
  Repository und wird über den `pages-deploy`-Workflow nach `/app/`
  veröffentlicht.
- **iOS-App** (`ios/`), **Android** (`clients/android/`), **Desktop**
  (`clients/desktop/`).

## Sicherheitsmodell (Kurzfassung)

MatrixMess ist ein Matrix-Client. Ende-zu-Ende-Verschlüsselung nutzt die
offizielle `matrix-sdk-crypto-wasm`-Engine.

**Bekannte Grenzen des Web-Clients (statische PWA):**

- Der Matrix-Access-Token und der Pickle-Schlüssel des Krypto-Stores liegen
  – wie bei vergleichbaren Web-Clients (z. B. Element Web) – clientseitig
  (localStorage/IndexedDB). Ein erfolgreicher XSS-Angriff könnte diese lesen.
  Gegenmaßnahmen: strikte Content-Security-Policy, ausschließlich
  DOM-Aufbau ohne `innerHTML`, Framebusting/`frame-ancestors 'none'`.
- Der **Recovery Key wird nicht persistent gespeichert**; er wird nur zur
  einmaligen Wiederherstellung des Schlüssel-Backups verwendet, danach liegen
  die Raumschlüssel im lokalen (gepickelten) Krypto-Store.
- Medien werden bevorzugt über die authentifizierten Endpunkte (Matrix 1.11)
  geladen; der unauthentifizierte Legacy-Endpunkt dient nur als Fallback für
  Server, die die neuen Endpunkte nicht anbieten (HTTP 400/404).

Beiträge und Hinweise zur Härtung sind willkommen.
