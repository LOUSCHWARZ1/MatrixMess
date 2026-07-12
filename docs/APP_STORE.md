# MatrixMess im Apple App Store veröffentlichen

Vollständiger Fahrplan von „baut lokal" bis „im Store live". Manche Schritte
kann nur der Kontoinhaber ausführen (Apple lässt niemanden anders ran) – diese
sind mit 👤 markiert. Was im Code bereits erledigt ist, steht unter „Status".

---

## 1. Apple-Konto & Grundlagen 👤

| Schritt | Details |
|---|---|
| Apple Developer Program | 99 €/Jahr auf <https://developer.apple.com>. |
| D-U-N-S-Nummer | Nur für Firmen-Accounts nötig (kostenlos, 1–2 Wochen Vorlauf). |
| Zwei-Faktor-Auth | Pflicht für die Apple-ID. |
| App-ID registrieren | Im Developer-Portal eine **Explicit App ID** `dev.matrixmess.app` mit Capability **Push Notifications** anlegen. |

Ohne bezahlten Account: kein TestFlight, keine Store-Einreichung – nur
Sideloading (AltStore), siehe `docs/altstore-sideload-guide.md`.

---

## 2. Technische Blocker (Status im Repo)

| Punkt | Status |
|---|---|
| `PrivacyInfo.xcprivacy` (Privacy Manifest, seit Mai 2024 Pflicht) | ✅ `ios/MatrixMess/Sources/App/PrivacyInfo.xcprivacy` |
| Export-Compliance-Flag `ITSAppUsesNonExemptEncryption` | ✅ in `project.yml` auf `YES` (siehe Abschnitt 3) |
| `aps-environment` = `production` | ✅ in `MatrixMess.entitlements` |
| In-App-Kontolöschung (Guideline 5.1.1v) | ✅ Einstellungen → Privatsphäre → **Konto löschen** |
| Kontakte blockieren (Guideline 1.2) | ✅ Einstellungen → Privatsphäre → Blockierte Kontakte (Matrix-Ignorierliste) |
| Version auf `1.0.0` | ✅ `MARKETING_VERSION` in `project.yml` |
| Signierter Release-/TestFlight-Build | ⬜ noch offen (Abschnitt 5) |
| Inhalte **melden** (Guideline 1.2) | ⬜ empfohlen, noch nicht umgesetzt |

---

## 3. Export-Compliance (E2EE) 👤

MatrixMess nutzt Ende-zu-Ende-Verschlüsselung → in App Store Connect muss die
Ausfuhr-Einstufung beantwortet werden. `ITSAppUsesNonExemptEncryption` steht auf
`YES` (ehrliche Antwort für einen E2EE-Messenger).

Standard-E2EE-Messenger qualifizieren sich i. d. R. für die **Massenmarkt-
Ausnahme (EAR 5D992.c)**:

1. Bei der ersten Einreichung fragt App Store Connect nach der Verschlüsselung.
2. „Qualifiziert sich für Ausnahme" → **Ja** wählen.
3. App Store Connect stellt eine **Jahres-Selbsteinstufung** aus und liefert
   einen `ITSEncryptionExportComplianceCode`.
4. Diesen Code als `INFOPLIST_KEY_ITSEncryptionExportComplianceCode` in
   `project.yml` eintragen → die Frage kommt dann bei künftigen Einreichungen
   nicht mehr.

> Im Zweifel (kommerzieller Vertrieb, besondere Krypto) kurz rechtlich prüfen
> lassen. Für einen quelloffenen Standard-Matrix-Client ist die Massenmarkt-
> Ausnahme der übliche Weg.

---

## 4. App Store Connect einrichten 👤 (~1 Std.)

1. Neue App anlegen, Bundle-ID `dev.matrixmess.app` auswählen.
2. **Metadaten**: Name, Untertitel, Beschreibung, Keywords, Support-URL,
   **Datenschutzerklärung-URL** (Pflicht), Kategorie **Soziale Netzwerke**.
3. **Screenshots**: mind. 6,7"-iPhone (1290 × 2796 px). Können aus der
   laufenden App/Simulator erzeugt werden.
4. **App-Privacy-Fragebogen**: muss zu `PrivacyInfo.xcprivacy` passen
   (User-ID, Nachrichten, Fotos/Videos, Audio – „App-Funktion", kein Tracking).
5. **Altersfreigabe** setzen (bei offenem Chat i. d. R. 17+ wegen UGC).

---

## 5. Signierter Build & Upload 👤

Zwei Wege:

**A) Xcode (Mac)**
1. `cd ios/MatrixMess && xcodegen generate`
2. In Xcode das Team wählen (Automatic Signing), Ziel „Any iOS Device".
3. Product → Archive → Distribute App → App Store Connect → Upload.

**B) Codemagic / Fastlane (CI)**
- `codemagic.yaml` enthält bisher nur Simulator-Validierung und ein
  unsigniertes IPA. Für TestFlight/Store einen signierten Workflow ergänzen
  (App-Store-Connect-API-Key + Distributionszertifikat als Umgebungs-Secrets).
  Kann auf Wunsch eingerichtet werden.

Nach dem Upload: **TestFlight-Beta** testen → dann zur **Review** einreichen.

---

## 6. Review-Stolpersteine für Matrix-Messenger

- **UGC (Guideline 1.2)**: Melden von Inhalten, Blockieren von Nutzern und eine
  Kontakt-/Moderationsmöglichkeit müssen vorhanden sein. Blockieren ✅, Melden ⬜.
- **Demo-Zugang**: Dem Reviewer im Feld „App Review Information" einen
  funktionierenden Test-Login zum Homeserver hinterlegen.
- **Bridges** (WhatsApp/Signal) **nicht** offensiv bewerben – als „Matrix-Client"
  positionieren, sonst Ablehnung wegen „inoffizieller Drittanbieter-Client".
- **Push**: Für echtes Hintergrund-Push braucht der Homeserver einen
  Push-Gateway (z. B. Sygnal) plus ein APNs-Auth-Key im Developer-Portal.
