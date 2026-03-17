# Wege fuer die restlichen Checklisten-Punkte

Stand: 2026-03-17

Hinweis:
Die folgenden Wege sind meine empfohlene technische Ableitung aus den offiziellen Dokus und Repos unten. Sie sind bewusst auf `MatrixMess` und das bestehende SwiftUI-Projekt zugeschnitten.

Aktueller technischer Stand:
- Homeserver-Login, Session-Restore, `whoami`, erster `sync` und Text-Senden in unverschluesselte Raeume laufen im Projekt inzwischen ueber die Matrix Client-Server-API.
- Reaktionen, Editieren, Redaction und Read-Marker sind fuer unverschluesselte Raeume ebenfalls ueber die REST-API verdrahtet.
- Medien-Upload/-Download, APNs-Grundverdrahtung, Calendar-Provider-Flows und eine erste CallKit-/WebRTC-Struktur sind jetzt ebenfalls im Projekt eingehangen.
- Der offene groesste Restblock ist damit vor allem echte E2EE ueber die konkret verifizierte SDK-/Crypto-Schicht plus die produktive Infrastruktur fuer Push, WebRTC-Signaling und OAuth.

## 1. Echter Matrix-Login, Session und Sync

- `matrix-rust-components-swift` als Apple-Bruecke behalten und die echte Session in `MatrixService.swift` hinter einer klaren `ClientSession`-Schicht kapseln.
- Nach Login nicht nur `userID`, sondern den kompletten wiederherstellbaren Session-Zustand speichern:
  - Homeserver
  - Access Token
  - Device ID
  - optional Refresh Token, falls vom Homeserver/Flow geliefert
- Beim App-Start zuerst Session laden, dann den echten Matrix-Client aufbauen und anschliessend den Sync starten.
- Timeline, Raumliste, Mitglieder und Read Markers nicht direkt aus View-State ableiten, sondern aus einem lokalen persistenten Store.
- Fuer grosse Accounts die Sync-Pipeline getrennt halten:
  - `Auth`
  - `Session`
  - `Sync`
  - `RoomList`
  - `Timeline`

Quellen:
- https://github.com/matrix-org/matrix-rust-components-swift
- https://github.com/matrix-org/matrix-rust-sdk
- https://spec.matrix.org/latest/client-server-api/index.html

## 2. Timeline-Funktionen wie Reaktionen, Editieren, Redigieren und Read State

- Senden ueber die normalen Room-Send-Endpunkte aufbauen.
- Reaktionen ueber Matrix-Relations (`m.annotation`) modellieren.
- Editieren ueber Ersetzungs-Events (`m.replace`) abbilden.
- Redigieren ueber Redaction-Events verdrahten.
- Gelesen-/ungelesen-Status sauber mit Read Markers und Receipts spiegeln.
- Im App-State die Timeline nicht nur als fertigen Text halten, sondern als Event-Modell mit:
  - Event ID
  - Sender
  - Relation
  - Status
  - lokaler Send-State

Quellen:
- https://spec.matrix.org/latest/client-server-api/#post_matrixclientv3roomsroomidsendeventtypetxnid
- https://spec.matrix.org/latest/client-server-api/#post_matrixclientv3roomsroomidread_markers

## 3. Medien, Dateien, Bilder, Videos und Sprachnachrichten

- Matrix-Medien ueber die Content-Repository-Endpunkte hochladen und herunterladen.
- Vor dem Upload zuerst Server-Limits lesen und dann Upload/Compression daran anpassen.
- Bilder und Videos auf iOS ueber `PhotosPicker`/Photo Library einlesen, Audio ueber `AVAudioSession` und `AVAudioRecorder`.
- Fuer Voice Notes ein eigenes Pipeline-Modul bauen:
  - Aufnahme
  - Waveform-Erzeugung
  - lokaler Cache
  - Upload
  - Playback
- Medien lokal in `Application Support` oder `Caches` halten und getrennt markieren:
  - thumbnail cache
  - full download cache
  - temporary upload staging

Quellen:
- https://spec.matrix.org/latest/client-server-api/index.html
- https://spec.matrix.org/v1.13/client-server-api/
- https://developer.apple.com/documentation/photosui
- https://developer.apple.com/documentation/avfaudio

## 4. Calls, VoIP und Echtzeit

- Nicht bei null anfangen, sondern die Architektur von `Element X iOS` als Referenz fuer den Matrix-Call-Stack pruefen.
- Entscheidung frueh treffen:
  - nativer Matrix-/WebRTC-Stack
  - Element-Call-orientierter Stack
  - spaeter Gruppen-Calls als getrennte Schicht
- Auf iOS CallKit von Anfang an mitdenken:
  - eingehende Calls
  - System-UI
  - Audio-Routing
  - Unterbrechungen
- Im App-State Call-Historie, laufenden Call und Reconnect-Zustand trennen.

Quellen:
- https://github.com/element-hq/element-x-ios
- https://developer.apple.com/documentation/callkit

## 5. Push Notifications, Background und iPhone-Verhalten

- Fuer Nachrichten und Termine `UNUserNotificationCenter` und APNs vorbereiten.
- Matrix-seitig Pushers mit dem Homeserver registrieren, statt nur lokal Notifications zu bauen.
- Background-Aufgaben fuer:
  - Sync-Anstoss
  - Medienvorbereitung
  - Termin-Erinnerungen
- Badge Count aus lokalem Store rechnen, nicht aus UI-State.
- Deeplinks frueh definieren:
  - Chat
  - Call
  - Kalendertermin

Quellen:
- https://developer.apple.com/documentation/usernotifications
- https://developer.apple.com/documentation/backgroundtasks
- https://spec.matrix.org/latest/client-server-api/index.html

## 6. Kalender produktiv machen

- Apple Calendar zuerst finalisieren, weil `EventKit` lokal und ohne externen OAuth-Fluss integrierbar ist.
- Google und Outlook danach ueber getrennte Provider-Adapter anbinden.
- Provider-Adapter einheitlich bauen:
  - `connect()`
  - `disconnect()`
  - `createEvent()`
  - `updateEvent()`
  - `deleteEvent()`
  - `fetchChanges()`
- Jedes Chat-Event braucht eine Mapping-Schicht:
  - lokale Event-ID
  - Provider-Event-ID
  - letzter Sync-Zeitpunkt
  - Konfliktstatus

Quellen:
- https://developer.apple.com/documentation/eventkit/accessing-calendar-using-eventkit-and-eventkitui
- https://developers.google.com/workspace/calendar/api/guides/overview
- https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0

## 7. E2EE, Geraete-Verifizierung und Vertrauen

- E2EE nicht selbst erfinden, sondern komplett auf die Crypto-Schicht des Matrix Rust SDK setzen.
- Recovery-Key, Secure-Backup und Geraete-Verifizierung als eigene UX-Strecke behandeln.
- Sicherheitsstatus pro Raum sichtbar machen:
  - verschluesselt
  - verifiziert
  - Warnung bei unbekannten Sessions
- Kritische Geheimnisse nur in Keychain ablegen und sensible Screens optional mit App Lock schuetzen.

Quellen:
- https://github.com/matrix-org/matrix-rust-sdk
- https://github.com/element-hq/element-x-ios

## 8. Share Extension, Widgets, Siri und Apple-nahe Integrationen

- Teilen aus anderen Apps ueber eine Share Extension.
- Widgets erst auf lokalen Snapshot-Daten aufbauen, nicht direkt auf Live-Sync.
- Siri Shortcuts fuer:
  - Nachricht an Favorit senden
  - Termin aus Chat planen
  - zuletzt aktiven Space oeffnen
- Focus-Mode, Handoff und Deep Links erst nach stabiler Session-/Navigationsebene anschliessen.

Quellen:
- https://developer.apple.com/documentation/xcode/configuring-app-extensions
- https://developer.apple.com/documentation/widgetkit
- https://developer.apple.com/documentation/appintents

## 9. Tests, Performance und Release-Reife

- Unit-Tests fuer `AppState`, Session-Restore, Drafts, Main-Space-Logik und Kalender-Mapping.
- UI-Tests fuer:
  - Login
  - Space-Wechsel
  - Chat-Detail
  - Terminplanung
  - Settings
- Performance-Tests mit:
  - vielen Raeumen
  - langen Timelines
  - grossen Medienlisten
- Accessibility nicht ans Ende schieben:
  - Dynamic Type
  - VoiceOver
  - Kontrast
  - Haptik nur als Zusatz, nie als einzige Rueckmeldung

Quellen:
- https://developer.apple.com/documentation/xctest
- https://developer.apple.com/documentation/xcode/testing-your-apps-in-xcode
- https://developer.apple.com/documentation/accessibility

## Empfohlene reale Reihenfolge

1. Echter Matrix-Login plus Session-Restore
2. Echter Sync plus lokaler Store
3. Timeline mit Send/Reaction/Edit/Redaction
4. Medien und Sprachnachrichten
5. Push plus Background
6. E2EE-UX
7. Calls
8. Kalender-Sync fuer Apple, dann Google und Outlook
9. Share Extension, Widgets, Siri, Release-Qualitaet
