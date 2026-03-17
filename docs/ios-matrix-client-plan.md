# Matrix-Client fuer iPhone

Stand: 2026-03-17

## Zielbild

`MatrixMess` soll ein vollwertiger iPhone-Messenger werden, der:

- Matrix nativ spricht
- Bridges und Spaces sauber organisiert
- einen kuratierten `Main`-Bereich fuer wichtige Chats bietet
- Medien, Reaktionen, Weiterleiten, Calls und Kalender wirklich nutzbar macht
- sich optisch und im Bediengefuehl wie eine moderne Apple-App anfuehlt

## Aktueller Stand im Repo

Schon vorhanden:

- SwiftUI-App-Grundgeruest
- Login-Screen mit echtem Homeserver-Login als erste Matrix-REST-Integration
- Spaces und `Main`-Logik im lokalen App-State
- Chatliste und Timeline koennen aus echtem `/sync` aufgebaut werden
- Textnachrichten koennen in unverschluesselte Matrix-Raeume gesendet werden
- Reaktionen, Bearbeiten, Redaction und Read-Marker sind fuer unverschluesselte Raeume als erste Matrix-REST-Stufe vorbereitet
- Delta-Syncs werden jetzt in bestehende Raeume und Timelines gemerged statt den lokalen Zustand blind zu ersetzen
- Leave-Raeume, Sync-Loop mit Retry/Backoff und erste Long-Poll-Sync-Basis sind verdrahtet
- echte Matrix-Medien-Uploads und Downloads inkl. lokalem Cache sind im App-Code angebunden
- APNs-Registrierung, Pusher-Registrierungsfluss und Push-Diagnose sind im App-Lifecycle vorbereitet
- Apple-/Google-/Outlook-Kalender koennen ueber gespeicherte Provider-Tokens beschrieben bzw. gelesen werden
- Calls sind ueber CallKit/WebRTC-Struktur in App-State und UI eingehangen
- lokale Entwuerfe pro Chat mit Persistenz
- Calls-, Calendar- und Settings-Flaechen als App-Struktur
- lokaler Snapshot-Store fuer App-Zustand
- persistente Session-Ablage als Grundlage fuer Restore
- Diagnosebasis fuer Bootstrap, Session und Snapshot
- technische Umsetzungswege fuer schwere Restpunkte in separater Doku
- Web-Preview fuer Windows

Noch nicht echt verdrahtet:

- Matrix-E2EE ueber die SDK-Crypto-Schicht
- voll verifizierte SDK-Crypto-Operationen fuer verschluesselte Rooms und Medien
- echter Push-Betrieb mit produktivem Push-Gateway/Sygnal und Apple-Signing auf dem Mac
- echter WebRTC-Call-Stack inklusive Matrix-VoIP-Signaling statt Platzhalter-Engine
- OAuth-Login-Flows fuer Google/Outlook inklusive Client-IDs und Redirect-Handling
- finale Absicherung der Matrix-Sync-Randfaelle im echten Xcode-/Homeserver-Test

## Umsetzungsplan bis 100 Prozent funktionstuechtig

### 1. Build, Architektur und Entwicklungsbasis

- [ ] Projekt auf einem Mac mit `Xcode` und `XcodeGen` wirklich lauffaehig bauen
- [ ] Swift-Paket `matrix-rust-components-swift` sauber einbinden und testen
- [ ] App in klar getrennte Module schneiden:
- Auth
- Session
- Sync
- Timeline
- Media
- Calls
- Calendar
- Settings
- [ ] Persistenten lokalen Store fuer App-Daten festlegen
- [ ] Sichere Ablage fuer Tokens und Session-Daten ueber `Keychain`
- [ ] Logging, Error-Handling und Diagnosemodus einbauen

### 2. Echte Matrix-Anmeldung und Session-Handling

- [ ] `MatrixService.swift` von Demo auf echte Client-Erstellung umbauen
- [ ] Login gegen beliebige Homeserver wirklich ausfuehren
- [ ] Logout sauber machen
- [ ] Session beim App-Neustart automatisch wiederherstellen
- [ ] Mehrere Sessions oder spaeter mehrere Accounts vorbereiten
- [ ] Homeserver-Fehler, Netzwerkfehler und Login-Fehler sauber behandeln

### 3. Echte Matrix-Sync-Engine

- [ ] Initialen Sync mit dem Homeserver verdrahten
- [ ] Delta-Sync fuer laufende Aktualisierung einbauen
- [ ] Raumliste und Timeline aus echtem Sync fuellen
- [ ] Reconnect-Logik bei Netzverlust bauen
- [ ] Offline-Zustand und Wiederanlauf sauber behandeln
- [ ] Lokalen Cache fuer Raeume, Events und Mitglieder pflegen

### 4. Spaces, Bridges und Main-Space wirklich korrekt abbilden

- [ ] Echte Matrix-Spaces laden
- [ ] Bridge-Raeume und native Matrix-Raeume sauber erkennen
- [ ] Flexible Zuordnung fuer viele Bridge-Typen statt fester Demo-Spaces
- [ ] `Main`-Space als lokale kuratierte Ansicht bauen
- [ ] Chats in `Main` hinzufuegen und entfernen
- [ ] Sortierung, Suche und Filter pro Space stabil machen
- [ ] Archiv, Stumm, Favoriten und spaeter Folders einbauen

### 5. Vollstaendige Chat- und Timeline-Funktionen

- [ ] Textnachrichten lesen und senden
- [ ] Nachrichtenstatus sauber anzeigen:
- gesendet
- zugestellt
- gelesen
- [ ] Antworten auf Nachrichten
- [ ] Weiterleiten von Nachrichten
- [ ] Reaktionen mit Emojis
- [ ] Nachrichten bearbeiten
- [ ] Nachrichten loeschen bzw. redigieren
- [ ] Erwahnungen und Mentions
- [ ] Polls/Umfragen
- [ ] Link-Previews
- [ ] Eingebettete Medienkarten fuer YouTube, Instagram und aehnliche Links
- [ ] Entwuerfe pro Chat speichern
- [ ] "Scroll to latest", Sprungmarken und ungelesene Trenner

### 6. Medien, Dateien und Composer

- [ ] Bilder auswaehlen und hochladen
- [ ] Videos auswaehlen und hochladen
- [ ] Dateien teilen
- [ ] Kamera- und Galerie-Zugriff sauber anbinden
- [ ] Foto- und Video-Vorschau im Chat bauen
- [ ] Download- und Cache-Strategie fuer Medien
- [ ] Medienansicht pro Chat
- [ ] Speicherverwaltung und Bereinigen alter Medien
- [ ] Drag and Drop sowie Share-Sheet-Unterstuetzung

### 7. Sprachnachrichten

- [ ] Audio aufnehmen
- [ ] Audio als Matrix-Mediennachricht senden
- [ ] Waveform, Dauer und Playback-UI anzeigen
- [ ] Aufnahme abbrechen, pausieren und erneut aufnehmen
- [ ] Audio-Caching fuer Offline-Wiedergabe
- [ ] Optional spaeter Transkription vorbereiten

### 8. Calls und Echtzeit-Kommunikation

- [ ] Pruefen, welcher Matrix-Call-Stack fuer das Projekt sinnvoll ist
- [ ] 1:1 Sprachcalls
- [ ] 1:1 Videocalls
- [ ] Gruppen- oder Raum-Calls
- [ ] Anrufhistorie
- [ ] Eingehende Call-Benachrichtigungen
- [ ] CallKit-Integration fuer iOS
- [ ] Mikrofon-, Kamera- und Lautsprecher-Steuerung
- [ ] Schlechte Verbindung, Reconnect und Fallbacks behandeln

### 9. Kalender wirklich produktiv machen

- [ ] Event-Erstellung aus Chats sauber abschliessen
- [ ] Apple Calendar ueber `EventKit` wirklich einbauen
- [ ] Google Calendar ueber OAuth und API anbinden
- [ ] Outlook ueber Microsoft Graph anbinden
- [ ] Provider-Accounts lokal sicher speichern
- [ ] Kalender-Sync in beide Richtungen definieren:
- Chat nach Kalender
- Kalender-Aenderung zurueck in Chat
- [ ] Konfliktlogik fuer geaenderte oder geloeschte Termine
- [ ] Einladungen, Zusagen und Absagen im Chat darstellen
- [ ] Erinnerungen und Benachrichtigungen fuer Termine

### 10. E2EE, Sicherheit und Vertrauen

- [ ] Echte Matrix-E2EE fuer verschluesselte Raeume aktivieren
- [ ] Schluessel-Sicherung und Recovery-UX
- [ ] Geraete-Verifizierung
- [ ] Sicherheitswarnungen bei unbekannten Sessions
- [ ] App Lock
- [ ] Chat Lock fuer sensible Unterhaltungen
- [ ] Schutz gegen versehentliches Offenlegen von Medien und Previews
- [ ] Datenschutzfreundliche Link-Preview-Logik

### 11. Push, Background und iPhone-spezifische Funktionen

- [ ] Push Notifications fuer neue Nachrichten
- [ ] Push fuer Calls und Termine
- [ ] Background Sync soweit technisch sinnvoll
- [ ] Badge Count korrekt pflegen
- [ ] Deep Links in Chats, Calls und Kalendertermine
- [ ] Handoff und Universal Links pruefen
- [ ] Share Extension fuer Teilen aus anderen Apps

### 12. Einstellungen und Account-Verwaltung

- [ ] Theme: System, Hell, Dunkel
- [ ] Notifications, Badges, Vorschauen, Ruhezeiten
- [ ] Lesebestaetigungen und Tippindikatoren
- [ ] Medien-Download-Regeln
- [ ] Speicherverwaltung
- [ ] Kalender-Verbindungen
- [ ] Barrierefreiheit
- [ ] Account-Verwaltung und spaeter Multi-Account

### 13. Qualitaet, Tests und Release-Reife

- [ ] Unit-Tests fuer State und Kernlogik
- [ ] UI-Tests fuer Login, Navigation, Chat, Calendar
- [ ] Testgeraete und verschiedene iPhone-Groessen pruefen
- [ ] Darkmode, Dynamic Type und VoiceOver testen
- [ ] Lasttests fuer grosse Timelines und viele Spaces
- [ ] Crash-Reporting und Fehleranalyse
- [ ] Datenschutztext, Berechtigungsdialoge und rechtliche Texte
- [ ] App-Store- oder Sideload-Release-Checkliste

## Reihenfolge, die ich empfehlen wuerde

### Phase A: App wirklich benutzbar machen

- echter Login
- echter Sync
- Raumliste
- Timeline
- Text senden
- Session speichern

### Phase B: Messenger-Kern fuer Alltag

- Reaktionen
- Antworten
- Weiterleiten
- Medien senden
- Datei-Upload
- Suche
- Main-Space sauber pflegen

### Phase C: Premium-Funktionen mit echtem Mehrwert

- Sprachnachrichten
- Calls
- Kalender-Sync
- Push
- E2EE-UX

### Phase D: Release-Qualitaet

- Tests
- Performance
- Accessibility
- Fehlerfaelle
- Feinschliff

## Punkte, die den Messenger richtig stark machen wuerden

### Organisation und Power-User-Features

- [ ] Globale Suche ueber alle Spaces und Bridges
- [ ] Chat-Folders und smarte Filter
- [ ] Archivierte Chats
- [ ] Gepinnte Nachrichten pro Chat
- [ ] Nachrichten spaeter senden
- [ ] Schnellaktionen per Swipe konfigurierbar
- [ ] Entwuerfe pro Chat und pro Account

### Apple-nahe Produktqualitaet

- [ ] Sehr gute iPhone-typische Animationen und Navigation
- [ ] Saubere Haptik an wichtigen Stellen
- [ ] Widgets fuer ungelesene Chats und naechste Termine
- [ ] Siri Shortcuts fuer "Nachricht senden" oder "Termin planen"
- [ ] Fokus-Modus-Integration
- [ ] Lock-Screen- und Home-Screen-Widgets

### Medien und Inhalte

- [ ] Sehr gute Medienvorschau mit Galerie-Ansicht
- [ ] In-App-Player fuer Videos
- [ ] Bildeditor vor dem Senden
- [ ] GIFs, Sticker und spaeter Packs
- [ ] Transkription fuer Sprachnachrichten
- [ ] Automatische Untertitel fuer Videos spaeter pruefen

### Social und Community

- [ ] Rollen und Moderation in grossen Raeumen
- [ ] Umfragen mit besseren Auswertungen
- [ ] Event-Threads mit Agenda und Teilnehmerstatus
- [ ] Community- oder Projekt-Spaces mit besserer Uebersicht

### Vertrauen, Datenschutz und Kontrolle

- [ ] Sichtbare Sicherheitsindikatoren fuer verschluesselte Chats
- [ ] Exporte fuer Chats, Medien und Termine
- [ ] Datenschutz-Dashboard fuer Zugriffe, Verbindungen und Speicher
- [ ] Blockieren, Melden und Spam-Schutz

### Dinge, die ich fuer "perfekt" zusaetzlich spannend finde

- [ ] Smarter `Main`-Space mit eigenen Regeln:
- wichtige Kontakte automatisch vorschlagen
- neue Favoriten hervorheben
- ruhige Spaces ausblenden
- [ ] Kalender-Vorschlaege aus Chat-Inhalten:
- Datum und Uhrzeit erkennen
- mit einem Tap Termin erzeugen
- [ ] Bridge-Diagnosebereich:
- zeigt, welche Bridge sauber synchronisiert
- zeigt Fehler pro Anbieter
- [ ] Besserer Onboarding-Modus fuer neue Nutzer:
- Homeserver erklaeren
- Bridges erklaeren
- Main-Space erklaeren

## Wichtige Produktentscheidung

Wenn das Ziel wirklich eine "komplett funktionierende App" ist, muss zuerst die Matrix-Basis echt werden.

Ohne:

- echten Login
- echten Sync
- echte Timeline
- echte Session

ist alles andere nur ein sehr gutes Mockup oder lokaler Demo-State.

Deshalb ist die naechste wichtigste Prioritaet nicht noch mehr UI, sondern:

- `MatrixService` echt machen
- Sync-Pipeline bauen
- Datenmodell an echte Matrix-Events haengen

## Quellen

- Matrix Rust SDK: https://github.com/matrix-org/matrix-rust-sdk
- Swift-Paket fuer Apple-Plattformen: https://github.com/matrix-org/matrix-rust-components-swift
- Element X iOS: https://github.com/element-hq/element-x-ios
- Frueheres Matrix iOS SDK: https://github.com/matrix-org/matrix-ios-sdk
- AltStore FAQ: https://faq.altstore.io/
