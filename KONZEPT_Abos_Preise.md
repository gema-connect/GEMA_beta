# KONZEPT — Abos, Preise & Token-System (GemaAbo)

Umsetzung der Preispolitik nach Vorlage (Excel-Screenshot, Robin, Juli 2026).
Alle Werte sind **Startwerte** — sie werden im Admin-Modul **`sys_abos.html`
(«Abos & Preise»)** gepflegt und in der Cloud gespeichert (per-Record,
moduleKey `abos`). Die Preisseite **`sys_preise.html`** rendert live aus
derselben Konfiguration — Preisänderung im Admin = sofort neue Preisseite.

---

## 1. Preisschema nach Rolle

### Gratis-Nutzer (alle Rollen)

| | |
|---|---|
| Preis | CHF 0.– («ohne Zahlung, mit Kredits») |
| Funktionsumfang | **identisch mit Bezahl-Abos** — keine Modul-Sperren |
| Limitierung | **Token-Budget** (Default 500 Tokens/Monat, monatlicher Reset) |
| Speicher / Serveranfragen | 0.5 GB / 500 pro Tag |
| Token-Zukauf | Pakete (siehe Abschnitt 3) |

### Planer (Sanitär / Heizung / Lüftung)

| Stufe | Preis/Monat | max. Nutzer | Speicher | Serveranfragen/Tag | Inhalt |
|---|---|---|---|---|---|
| **Einzelperson** | CHF 10 | 1 | 2 GB | 2'000 | Nur Berechnungen des gewählten Gewerks (S **oder** H **oder** L), kein Admin/PM |
| **Grundabo I** | CHF 50 | 2 | 5 GB | 5'000 | Berechnungen + PM + Administration («H/L/S + Admin») |
| **Grundabo II** | CHF 100 | 5 | 15 GB | 10'000 | dito |
| **Grundabo III** | CHF 165 | 10 | 30 GB | 20'000 | dito |
| **Grundabo IIII** | CHF 250 | 15 | 50 GB | 30'000 | dito |
| **Grundabo V** («weitere») | CHF 350 | 20 | 75 GB | 50'000 | dito |

**Zusatz-Abo Gewerk (rot markierte 20%-Zeile):** Das Firmen-Grundabo deckt
**ein** Gewerk. Jedes weitere Gewerk (H/L/S) kostet **+20% des gebuchten
Grundabo-Preises pro Monat** (Annahme A1, s. unten — Modus im Admin
umschaltbar: «+20% je Zusatz-Gewerk» / «+20% pauschal für alle» / «20%
Rabatt auf weitere Vollabos»).

### Architekten

Gleiche Stufen/Preise wie Planer (Person CHF 10, Firma 50/100/165/250/350),
aber Funktionsumfang **«Nur Projektmanagement»** (Person) bzw.
**«PM + Anfragen»** (Firma). Kein Gewerk-Zusatz.

### Installateure (Zusatz-Abo)

| Stufe | Preis/Monat | max. Nutzer | Speicher | Serveranfragen/Tag |
|---|---|---|---|---|
| Installateur I | CHF 100 | 10 | 10 GB | 10'000 |
| Installateur II | CHF 250 | 25 | 20 GB | 20'000 |
| Installateur III | CHF 450 | 45 | 35 GB | 35'000 |
| Installateur IIII | CHF 600 | 60 | 50 GB | 50'000 |

Lizenziert Monteur-/Werkstatt-/Baustellen-Nutzer (Werkzeug, Stunden,
Regierapporte, Einsatzplan, Ausschreibungen beantworten, Bestellungen).
**Annahme A2:** buchbar als **Add-on** zu einem Firmen-Grundabo **und**
eigenständig für reine Unternehmer-Betriebe (im Admin umschaltbar).

### Hersteller / Lieferanten (transaktionsbasiert)

| Vorgang | Gebühr | Basis |
|---|---|---|
| Offertanfrage | **1%** | Offertbetrag (netto) bei beantworteter Anfrage |
| Ausschreibung | **3%** | Vergabesumme beim Zuschlag |
| Bestellung | **6%** | Bestellwert bei Bestellung über GEMA |
| Registrierung / Grundnutzung | **gratis** | — |

**Annahme A3:** Gebühr fällt **pro Vorgang vom jeweiligen Wert** an
(alternatives Modell «nur bei Bestellung, gestaffelt nach Herkunftskanal
1/3/6%» ist im Admin als Modus hinterlegt).

---

## 2. Übergreifende Abrechnungsregeln (alle im Admin einstellbar)

| Regel | Default | Bemerkung |
|---|---|---|
| Währung | CHF | Rappenrundung auf 0.05 |
| MwSt | 8.1% | Preise auf der Seite exkl. MwSt, Checkout zeigt inkl. |
| Jahresrabatt | 10% | bei jährlicher Zahlweise |
| Testphase (Trial) | 14 Tage | für Firmen-Abos, ohne Zahlungsmittel |
| Kündigungsfrist | 30 Tage | monatlich kündbar |
| Zahlungsfrist Rechnung | 30 Tage | B2B-üblich |
| Promo-Codes | Liste | Code + Rabatt% + Gültig-bis |
| Zahlung | Karte (Stripe, **vorbereitet**) oder Rechnung | |

## 3. Token-System (Gratis-Nutzer)

**Prinzip (Annahme A4):** Tokens gelten **nur für Gratis-Nutzer** —
Bezahl-Abos haben keine Token-Limits (nur Speicher-/Anfragen-/Nutzer-Limits).
Budget resettet monatlich. Verhalten bei aufgebrauchtem Budget: **hart**
(Aktion blockiert, Upgrade-Hinweis) — im Admin auf «weich» (nur Warnung)
umschaltbar. Warn-Notifikation ab 80% Verbrauch.

**Token-Kriterien (Startwerte, alle im Admin anpassbar):**

| Aktion | Tokens |
|---|---|
| Neue Berechnung anlegen (Modul + Objekt) | 20 |
| PDF-/Druck-Export | 10 |
| KI-Texthilfe (Verbessern/Korrigieren) | 25 |
| KI-Dokumentanalyse (Wareneingang, Formulare) | 50 |
| Offertanfrage an Lieferant senden | 20 |
| Ausschreibung erstellen/verteilen | 50 |
| Bestellung auslösen | 20 |
| Foto-/Datei-Upload (pro Datei) | 5 |
| Cloud-Speicher (je angefangenes MB/Monat) | 2 |
| Server-Synchronisationen (je 100) | 1 |

**Zukauf-Pakete:** 1'000 Tokens = CHF 10 · 5'000 = CHF 40 · 12'000 = CHF 80.

**Enforcement:** `GemaAbo.charge('pdf_export')` liefert `{ok, rest,
unbegrenzt}` — Module rufen das vor der Aktion auf (Integrationspunkte
dokumentiert in CLAUDE.md; die Verdrahtung in die einzelnen Module folgt
schrittweise — die API, Buchführung und Admin-Pflege stehen komplett).

## 3b. Modul-Matrix & Einzelmodule

**Modul-Matrix** (Admin-Tab «🧩 Module»): definiert pro GEMA-Modul, in
welchen Abos es enthalten ist. Spalten: Gratis · Planer Person · Planer
Firma · Architekt Person · Architekt Firma · Installateure (dynamisch —
neue Rollengruppen erzeugen neue Spalten). **Default-Regeln** (gelten für
alle nie angepassten Zellen, auch für künftige neue Module):

| Spalte | Default |
|---|---|
| Gratis | alle Module (Limit über Tokens) |
| Planer Person | nur Berechnungs-Kategorien (S/H/L) + Objekte |
| Planer Firma | Vollzugang (alle Module) |
| Architekt Person | nur Projektmanagement |
| Architekt Firma | Projektmanagement + Workspace |
| Installateure | Infrastruktur/Werkzeug/Baustelle (inkl. Regierapporte, Stunden, Einsatzplan, Bestellungen, Ausschreibungen, Abnahme, Wareneingang, Objekte) |

Gespeichert werden NUR Abweichungen (`cfg.module.zuweisung`) — die Matrix
bleibt dadurch robust, wenn neue Module dazukommen.

**Einzelmodule (Module abseits der Abos):** Erhält ein Modul in der
Matrix-Spalte «Einzelpreis» einen CHF/Monat-Wert, ist es einzeln buchbar
und erscheint auf der Preisseite unter «🧩 Einzelmodule» (auch ohne
Grundabo nutzbar; Zugriff nur auf das gebuchte Modul; Jahres-/Promo-Rabatt
und MwSt wie bei Abos). Bestellung erzeugt ein Abo-Record
`sub_<orgId>_mod_<key>` (`typ:'modul'`) — es zählt bewusst NICHT als
Grundabo, d.h. ein Gratis-Nutzer mit gebuchtem Einzelmodul behält sein
Token-Budget. Zugriffs-Helper: `GemaAbo.hatModul(modulKey, user)`
(Matrix-Spalten aller aktiven Abos der Org + direkt gebuchte Einzelmodule,
Fallback Gratis-Spalte). Das harte per-Org-Gating der Module bleibt der
separate, in CLAUDE.md beschriebene geplante Schritt («Modul-Freischaltung
pro Kunde») — die Matrix liefert dafür die Preis-/Vertragsdefinition.
Standardmässig ist KEIN Einzelpreis gesetzt (Preisentscheid von Robin).

## 4. Offene Fragen an Robin (Annahmen A1–A4)

Die interaktive Rückfrage war in der Session nicht möglich — folgende
Annahmen wurden getroffen und sind **im Admin ohne Code-Änderung umstellbar**:

1. **A1 — «Zusatz Abo H/L/S 20%»:** interpretiert als *+20% des
   Firmen-Abopreises je zusätzliches Gewerk* (Grundabo = 1 Gewerk).
   → Umschalter «Zusatz-Gewerk-Modus» im Tab «Pläne & Preise».
2. **A2 — «Zusatz Abo Installateur»:** interpretiert als *Add-on zum
   Firmen-Abo UND eigenständig buchbar*. → Umschalter «Verfügbarkeit».
3. **A3 — Hersteller-Prozente:** interpretiert als *Gebühr pro Vorgang vom
   jeweiligen Wert* (1% Offertbetrag / 3% Vergabesumme / 6% Bestellwert).
   → Umschalter «Gebühren-Modell» (Alternative: nur bei Bestellung,
   gestaffelt nach Herkunftskanal).
4. **A4 — Tokens:** monatliches Budget *nur für Gratis-Nutzer*; Bezahl-Abos
   ohne Token-Limit. → Einstellungen «Geltung» + «Reset» im Tab «Tokens».
5. **Speicher / max. Serveranfragen:** im Screenshot ohne Zahlenwerte —
   Startwerte siehe Tabellen oben, pro Stufe im Admin editierbar.
6. **Person-Abo:** 1 Nutzer, CHF 10, ohne Firmen-/Adminfunktionen — bitte
   bestätigen, ob das Person-Abo ebenfalls Zusatz-Gewerke erlauben soll
   (aktuell: nein, genau 1 Gewerk).

## 5. Ergänzte Punkte (waren im Preisblatt nicht enthalten)

Bewährte Abo-Software-Bausteine, als Einstellungen ergänzt: Jahresrabatt,
Testphase, MwSt-Ausweis, Promo-/Rabattcodes, Kündigungs-/Zahlungsfrist,
Token-Zukaufpakete, Abo-Verlauf (Audit), Sperren bei Zahlungsverzug,
MRR-Übersicht im Admin, Stripe-Checkout-Vorbereitung (Publishable Key +
Netlify-Function `stripe-checkout.js`, aktiv erst mit `STRIPE_SECRET_KEY`).

## 6. Technik (Kurzfassung)

- **`gema_abo_api.js`** (`window.GemaAbo`): Konfiguration `abocfg:main`,
  Abos `abosub:*` → `gema_abo_sub_pool_v1`, Token-Ledger `abotok:*` →
  `gema_abo_tok_pool_v1` (alle moduleKey `abos`, Einzel-Saves via
  `GemaSync.saveRecord` — nie persistCollection, Pool ist org-übergreifend).
  Preis-Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block (Node-testbar).
- **`sys_preise.html`**: Preisseite, rendert aus `GemaAbo.getConfig()`;
  Checkout-Modal mit Zahlweise Monat/Jahr, Promo-Code, Karte (Stripe,
  vorbereitet) oder Rechnung; Bestellung → `abosub:`-Record + Notifikation
  `abo_bestellung` an role_admin.
- **`sys_abos.html`**: Admin-Modul (nur role_admin) — 5 Tabs: Abonnenten,
  Pläne & Preise, Tokens, Hersteller-Gebühren, Abrechnung & Zahlung.
- **Notify-Keys:** `abo_bestellung`, `abo_status`, `abo_tokens_knapp`.
