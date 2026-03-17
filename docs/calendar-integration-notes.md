# Calendar Integration Notes

Stand: 2026-03-16

## Ziel

MatrixMess soll Termine direkt aus Chats planen koennen und diese spaeter in verbundene Kalender schreiben:

- Apple Calendar ueber `EventKit`
- Google Calendar ueber die `Google Calendar API`
- Outlook ueber `Microsoft Graph`

## Was im App-Geruest jetzt schon vorbereitet ist

- Ein eigener `Calendar`-Tab in der App
- Provider-Karten fuer Apple, Google und Outlook
- Terminplanung direkt aus einem Chat
- Lokale Event-Objekte, die parallel als Chat-Nachricht und im Calendar-Tab auftauchen
- Auswahl, in welche verbundenen Kalender ein Termin gespiegelt werden soll

## Naechster echter Integrationsschritt

### Apple Calendar

- iOS-Berechtigung ueber `EventKit`
- Lokales Erstellen und Aktualisieren von Events im Benutzerkalender
- Info.plist-Key fuer Kalenderzugriff ist im Projekt angelegt

### Google Calendar

- OAuth-Login
- Events ueber die Google Calendar API anlegen
- Tokens sicher auf dem Geraet speichern

### Outlook

- Microsoft-Login
- Events ueber Microsoft Graph erzeugen
- Account- und Refresh-Token sicher speichern

## Wichtiger Realitaetscheck

Die eigentliche Provider-Synchronisierung ist noch nicht live verdrahtet. Was jetzt funktioniert, ist der komplette App-Flow fuer:

- Termin in Chat planen
- Event lokal im App-State erzeugen
- Event im Calendar-Tab anzeigen
- Provider-Auswahl im UI verwalten

Die echte API-Anbindung ist der naechste Schritt auf einem Mac mit lauffaehigem iOS-Build.

## Quellen

- Apple EventKit: https://developer.apple.com/documentation/eventkit/accessing-calendar-using-eventkit-and-eventkitui
- Google Calendar API Overview: https://developers.google.com/workspace/calendar/api/guides/overview
- Microsoft Graph Events: https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0
