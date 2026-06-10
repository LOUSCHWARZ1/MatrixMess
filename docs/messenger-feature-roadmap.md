# Messenger Feature Roadmap

Stand: 2026-06-10 (v0.4.0)

## Umsetzungsstand v0.4.0

Mit Version 0.4.0 sind aus dieser Roadmap umgesetzt:

- App Lock mit Face ID/Code, erzwungen bei App-Start und Hintergrund-Wechsel
- Chat Lock pro Unterhaltung (Face ID, im Chatprofil aktivierbar)
- Archiv inklusive Auto-Archivierung stummgeschalteter Chats
- Chatlisten-Filter (Alle, Ungelesen, Direkt, Gruppen) als Chip-Leiste
- Benachrichtigungsmodus pro Raum (Alle / nur Erwaehnungen / stumm) ueber
  serverseitige Matrix-Push-Rules, synchron auf allen Geraeten
- Private Read-Receipts (m.read.private), wenn Lesebestaetigungen deaktiviert sind
- Blockierte Kontakte ueber m.ignored_user_list (Account Data)
- Verknuepfte Geraete: anzeigen, umbenennen, per Passwort (UIA) abmelden
- Serverseitige Nachrichtensuche ueber /_matrix/client/v3/search
- Auto-Download-Richtlinie (Immer / nur WLAN / Nie) mit echter Netzwerkerkennung
- Upload-Qualitaet fuer Bilder (Datensparend / Ausgewogen / Original)
- Speicherverwaltung: Cache-Groesse anzeigen und leeren
- Darstellung: Akzentfarbe, Chat-Dichte, Avatare ein/aus, Textgroesse,
  Link-Vorschauen, Bewegungen reduzieren
- Settings neu strukturiert in gruppierte Unterseiten (Apple-Settings-Stil)

Noch offen aus dieser Roadmap: Polls, verschwindende Nachrichten,
echte WebRTC-Calls, Quiet Hours/Notification-Previews (benoetigt
Notification Service Extension) und Chat-Folders ueber die Filter hinaus.

## Zielbild

MatrixMess soll sich wie ein moderner Apple-naher Messenger anfuehlen, aber Matrix-Spaces und Bridges ernst nehmen:

- Viele Spaces statt nur drei feste Bereiche
- Ein kuratierter `Main`-Space fuer wichtige Chats aus allen Spaces
- Reiche Nachrichtenobjekte statt nur Text
- Starke Privatsphaere-, Benachrichtigungs- und Medien-Einstellungen

## Funktionen, die wir als Pflichtumfang betrachten sollten

### Chats und Organisation

- Beliebig viele Spaces mit horizontalem Wechsel
- Main-Space fuer wichtige Chats aus Matrix und Bridge-Spaces
- Stumm, Favoriten, Archiv, Suche, Filter und spaeter Folders
- Weiterleiten von Nachrichten zwischen Chats und Spaces

### Medien und Interaktion

- Text, Bilder, Videos, Dateien und Sprachnachrichten
- Reaktionen mit Emojis
- Antworten, Weiterleiten, Speichern, Teilen
- Umfragen in Gruppen und Communities
- Link-Previews und eingebettete Medienkarten

### Calls und Presence

- Sprach- und Videoanrufe
- Call-Links und spaeter Raum-basierte Calls
- Geraeteuebergreifende Sitzungen

### Privatsphaere und Sicherheit

- App Lock
- Chat Lock fuer sensible Unterhaltungen
- Lesebestaetigungen
- Tippindikatoren
- Standard-Timer fuer verschwindende Nachrichten
- Kontrolle ueber Link-Previews und Medien-Downloads

## Sinnvolle Settings-Gruppen

### Appearance

- Theme: System, Hell, Dunkel
- Chat-Dichte
- Bewegungen reduzieren
- Inline-Medienvorschau
- Avatare in Listen ein- oder ausblenden
- Textgroesse

### Organization

- Chat-Folders / Filter fuer Bridges, Gruppen und ungelesene Chats
- Main-Space-Favoriten ueber Geraete synchron halten
- Standard-Swipe-Aktion fuer Archiv, Pin oder Mute
- Stummgeschaltete Chats automatisch archivieren

### Notifications

- Gesamte Benachrichtigungen
- Reaktions-Benachrichtigungen
- Nur Erwaehnungen in grossen Spaces
- Ruhezeiten
- Notification-Previews: Voll, nur Sender, verborgen
- Sounds, Badges und Vorschauen

### Privacy and Security

- App Lock
- Chat Lock
- Lesebestaetigungen
- Tippindikatoren
- Standard fuer verschwindende Nachrichten
- Link-Preview-Richtlinie
- Strenger Account-Modus fuer unbekannte Kontakte, Calls und Dateifreigaben
- Blockierte Kontakte und spaeter Safety-Checks

### Media and Data

- Auto-Download fuer Medien
- In Fotos speichern
- Speicherverwaltung
- Niedrigdatenmodus fuer Anrufe
- Upload-Qualitaet fuer Medien
- WLAN- oder Mobilfunk-Verhalten

### Devices and Accessibility

- Verknuepfte Geraete
- Voice-Transkripte
- Hoher Kontrast
- Textgroesse
- Haptik
- Reduce Motion / Haptik

## Herkunft dieser Entscheidungen

Diese Gruppierung ist eine Synthese aus offiziell dokumentierten Funktionen anderer Messenger:

- WhatsApp: Chat Lock, verschwindende Nachrichten, verknuepfte Geraete
- Signal: Benachrichtigungen, Link-Previews, Polls, verknuepfte Geraete
- Telegram: starke Organisations- und Community-Funktionen wie Folders und Polls
- Apple Messages: systemnahe Notification- und Appearance-Erwartungen

## Wichtige Produktentscheidung

Vollstaendig eingebettete Inhalte von Plattformen wie Instagram oder YouTube sind nicht nur UI-, sondern auch Policy- und Provider-Thema.

Inference:
Fuer einen ersten MatrixMess-MVP sollten wir mit sicheren, schoenen Inline-Linkkarten anfangen und echte Live-Embeds pro Anbieter nur dort aktivieren, wo Technik, Rechte und Performance sauber passen.

## Quellen

- https://faq.whatsapp.com/
- https://about.fb.com/news/2023/05/whatsapp-chat-lock/
- https://about.fb.com/news/2021/11/new-control-for-disappearing-messages-on-whatsapp/
- https://about.fb.com/news/2021/07/new-features-for-whatsapp-app-web/
- https://support.signal.org/
- https://signal.org/blog/introducing-polls/
- https://telegram.org/blog/folders
- https://telegram.org/blog/reactions-bots-and-more
- https://support.apple.com/
