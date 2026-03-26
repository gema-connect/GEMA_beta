# GEMA Ausschreibung — BKP-Baum Umbau

## Anleitung für Claude Code

**Datei:** `pm_ausschreibungsunterlagen.html` (bestehendes Modul umbauen)
**Ziel:** CRBX-Upload-First durch BKP-Checklisten-First ersetzen

---

## 1. Gesamtbild — Der neue Arbeitsprozess

### Vorher (alt)
Planer → CRBX hochladen → Positionen verteilen → Unternehmer anfragen

### Nachher (neu)
```
Planer wählt Objekt + erstellt LOS
    ↓
BKP-Baum aufklappen, Positionen anwählen (Checkliste)
    ↓
Bei "Lieferung XXX": System prüft ob Berechnung + Offerte existiert
    ↓  
Dialog: Eckdaten zeigen, Offerte übernehmen / neu anfragen / bearbeiten
    ↓
Automatisch Montage-BKP als Folgeposition ergänzen
    ↓
Fortschrittsanzeige: 5/12 BKP erledigt
    ↓
Planer erstellt CRBX-Datei extern, lädt sie hoch
    ↓
Vergleich: CRBX vs. BKP-Checkliste (fehlende/überzählige BKP)
    ↓
Planer prüft, gibt frei → landet bei "Versenden an Unternehmer"
```

---

## 2. Entscheidungen (alle fix)

| # | Entscheidung | Ergebnis |
|---|---|---|
| 1 | BKP-Baum Tiefe | 3 Ebenen (z.B. 25 → 251 → 251.1), Planer kann weitere Ebenen hinzufügen |
| 2 | Wo | Umbau in `pm_ausschreibungsunterlagen.html` |
| 3 | Gewerke | Standard = Sanitär (25x). Heizung (24x), Lüftung (23x) etc. per Lizenz freischaltbar. Die Freischaltung wird über ein Flag gesteuert, nicht jetzt implementiert — UI vorbereiten |
| 4 | Modul-Mapping | Standard-Mapping BKP → Berechnungsmodul vorgegeben (z.B. 254.3 → sa_enthaertung.html), aber Planer kann überschreiben |
| 5 | Externe Offerte | = Lieferanten-Bruttoofferte. Bei Auswahl "Lieferung XXX" wird automatisch eine Folge-BKP "Montage XXX" ergänzt. Alles flexibel änderbar |
| 6 | Offerten pro BKP | Planer holt EINE Bruttoofferte ein (kein Vergleich auf Planer-Ebene). Unternehmer vergleicht später |
| 7 | CRBX-Upload | BLEIBT — aber als letzter Schritt. Planer macht BKP-Vorarbeit, erstellt CRBX extern, lädt hoch, erhält Vergleich BKP-Checkliste vs. CRBX, gibt frei |
| 8 | Speicherung | Pro Objekt, mit LOS-Unterstützung (ein Objekt hat 1–n Lose, jedes LOS hat eigenen BKP-Baum, gleiche BKP können in mehreren LOS vorkommen) |
| 9 | Status-Icons | 3 Status direkt im Baum: ✓ grün (erledigt), ⟳ orange (in Bearbeitung), ? grau (offen). Plus Fortschrittsbalken oben "5/12 BKP erledigt" |
| 10 | BKP-Titel | Vorgegeben als Standard, aber frei editierbar. BKP-Nummer und Titel sind unabhängig — der Planer kann jeden Titel beliebig anpassen |

---

## 3. Datenmodell

### 3.1 Ausschreibung (pro Objekt)

```javascript
{
  id: 'aus_xxx',
  objektId: 'obj_xxx',
  name: 'Ausschreibung Sanitär MFH Musterstrasse',
  erstellt: '2026-03-26T10:00:00Z',
  status: 'in_arbeit', // 'in_arbeit' | 'crbx_geprueft' | 'freigegeben' | 'versendet'
  lose: [
    {
      id: 'los_1',
      name: 'LOS 1 — Etappe Untergeschoss',
      positionen: [ /* BKP-Positionen, siehe 3.2 */ ]
    },
    {
      id: 'los_2',
      name: 'LOS 2 — Etappe Obergeschosse',
      positionen: [ /* gleiche BKP möglich wie LOS 1 */ ]
    }
  ],
  crbxVergleich: null // wird nach Upload befüllt
}
```

### 3.2 BKP-Position (innerhalb eines LOS)

```javascript
{
  bkp: '254.3',                    // BKP-Nummer (editierbar)
  titel: 'Enthärtungsanlage',      // Titel (editierbar, Standard vorgegeben)
  checked: true,                   // Im BKP-Baum angewählt
  status: 'erledigt',              // 'offen' | 'in_bearbeitung' | 'erledigt'
  istLieferung: true,              // Hat "Lieferung XXX" Tag → externe Offerte nötig
  lieferungTyp: 'enthaertung',     // Mapping-Key für Berechnungsmodul
  modulUrl: 'sa_enthaertung.html', // Link zum Berechnungsmodul (Standard oder überschrieben)
  offerte: {                       // null wenn keine Offerte
    lieferantId: 'lief_xxx',
    lieferantFirma: 'BWT',
    produktName: 'AQA perla 20',
    bruttoPreis: null,             // Vom Lieferanten wenn vorhanden
    offertPdfName: 'Offerte_BWT_AQA20.pdf',
    offertPdfDataUrl: '...',       // base64
    uploadDatum: '2026-03-20',
    offertanfrageId: 'oa_xxx',     // Referenz auf Offertanfrage
    berechnungsdaten: {            // Eckdaten aus Berechnung
      durchfluss: 150,
      kapazitaet: 5.2,
      anschluss: 'DN 32'
    }
  },
  montagePosition: {               // Auto-generiert wenn istLieferung=true
    bkp: '254.4',                  // Nächste freie BKP
    titel: 'Montage Enthärtungsanlage',
    checked: true
  }
}
```

### 3.3 Standard-BKP-Baum (Sanitär 25x)

Dieser Baum ist die VORLAGE — der Planer kann alles anpassen. Wichtig: `modulKey` definiert die Verknüpfung zum Berechnungsmodul. Wo `modulKey` gesetzt ist, handelt es sich um eine Position die eine externe Lieferanten-Offerte benötigt (= "Lieferung XXX").

```javascript
var BKP_STANDARD = {
  id: '25', titel: 'Sanitäranlagen', kinder: [
    { id: '251', titel: 'Apparate', kinder: [
      { id: '251.0', titel: 'Allgemeine Apparate' },
      { id: '251.1', titel: 'Kücheneinrichtungen' },
      { id: '251.2', titel: 'Waschtische und Lavabos' },
      { id: '251.3', titel: 'WC-Anlagen' },
      { id: '251.4', titel: 'Badewannen und Duschen' },
      { id: '251.5', titel: 'Diverse Sanitärapparate' }
    ]},
    { id: '252', titel: 'Abwasseranlagen', kinder: [
      { id: '252.0', titel: 'Abwasserleitungen' },
      { id: '252.1', titel: 'Lieferung Fettabscheider', modulKey: 'fettabscheider', modulUrl: 'sa_fettabscheider.html' },
      { id: '252.2', titel: 'Montage Fettabscheider' },
      { id: '252.3', titel: 'Lieferung Abwasserhebeanlage', modulKey: 'hebeanlage', modulUrl: 'sa_abwasserhebeanlage.html' },
      { id: '252.4', titel: 'Montage Abwasserhebeanlage' },
      { id: '252.5', titel: 'Lieferung Ölabscheider', modulKey: 'oelabscheider', modulUrl: 'sa_oelabscheider.html' },
      { id: '252.6', titel: 'Montage Ölabscheider' },
      { id: '252.7', titel: 'Lieferung Schlammsammler', modulKey: 'schlammsammler', modulUrl: 'sa_schlammsammler.html' },
      { id: '252.8', titel: 'Montage Schlammsammler' }
    ]},
    { id: '253', titel: 'Wassererwärmung', kinder: [
      { id: '253.0', titel: 'Warmwasserleitungen' },
      { id: '253.1', titel: 'Lieferung Frischwasserstation', modulKey: 'frischwasserstation', modulUrl: 'sa_frischwasserstation.html' },
      { id: '253.2', titel: 'Montage Frischwasserstation' },
      { id: '253.3', titel: 'Lieferung Zirkulationspumpe', modulKey: 'zirkulation' },
      { id: '253.4', titel: 'Montage Zirkulationspumpe' },
      { id: '253.5', titel: 'Lieferung Solaranlage', modulKey: 'solaranlage', modulUrl: 'sa_solaranlage.html' },
      { id: '253.6', titel: 'Montage Solaranlage' }
    ]},
    { id: '254', titel: 'Wasseraufbereitung', kinder: [
      { id: '254.0', titel: 'Kaltwasserleitungen' },
      { id: '254.1', titel: 'Lieferung Druckerhöhungsanlage', modulKey: 'druckerhoehung', modulUrl: 'sb_druckerhoehung.html' },
      { id: '254.2', titel: 'Montage Druckerhöhungsanlage' },
      { id: '254.3', titel: 'Lieferung Enthärtungsanlage', modulKey: 'enthaertung', modulUrl: 'sa_enthaertung.html' },
      { id: '254.4', titel: 'Montage Enthärtungsanlage' },
      { id: '254.5', titel: 'Lieferung Osmoseanlage', modulKey: 'osmose', modulUrl: 'sa_osmose.html' },
      { id: '254.6', titel: 'Montage Osmoseanlage' }
    ]},
    { id: '255', titel: 'Isolierungen', kinder: [
      { id: '255.0', titel: 'Rohrisolierungen kalt' },
      { id: '255.1', titel: 'Rohrisolierungen warm' },
      { id: '255.2', titel: 'Armaturenisolierungen' }
    ]},
    { id: '256', titel: 'Brandschutz Sanitär', kinder: [
      { id: '256.0', titel: 'Brandschutzabschottungen' },
      { id: '256.1', titel: 'Brandschutzklappen' }
    ]},
    { id: '259', titel: 'Honorare Sanitär', kinder: [
      { id: '259.0', titel: 'Planungshonorare' },
      { id: '259.1', titel: 'Bauleitungshonorare' }
    ]}
  ]
};
```

### 3.4 Modul-Mapping (Standard)

Diese Zuordnung definiert welche "Lieferung"-BKP zu welchem GEMA-Berechnungsmodul gehört. Der Planer kann das Mapping pro Position überschreiben.

```javascript
var MODUL_MAP = {
  'enthaertung':       { modul: 'sa_enthaertung.html',          label: 'Enthärtungsanlage',       kategorie: 'enthaertung' },
  'osmose':            { modul: 'sa_osmose.html',               label: 'Osmoseanlage',            kategorie: 'osmose' },
  'druckerhoehung':    { modul: 'sb_druckerhoehung.html',       label: 'Druckerhöhungsanlage',    kategorie: null },
  'frischwasserstation':{ modul: 'sa_frischwasserstation.html', label: 'Frischwasserstation',     kategorie: null },
  'hebeanlage':        { modul: 'sa_abwasserhebeanlage.html',   label: 'Abwasserhebeanlage',      kategorie: 'hebeanlage' },
  'fettabscheider':    { modul: 'sa_fettabscheider.html',       label: 'Fettabscheider',          kategorie: null },
  'oelabscheider':     { modul: 'sa_oelabscheider.html',        label: 'Ölabscheider',            kategorie: null },
  'schlammsammler':    { modul: 'sa_schlammsammler.html',        label: 'Schlammsammler',          kategorie: null },
  'solaranlage':       { modul: 'sa_solaranlage.html',          label: 'Solaranlage',             kategorie: null },
  'zirkulation':       { modul: null,                            label: 'Zirkulationspumpe',       kategorie: 'zirkulation' }
};
// `kategorie` = Produktkatalog-Kategorie (wenn vorhanden). Wenn null → keine Offerte aus Produktkatalog verfügbar, nur manueller PDF-Upload.
```

---

## 4. UI-Aufbau (Tabs / Workflow)

Der Planer arbeitet sich von links nach rechts durch die Tabs:

### Tab 1: "BKP-Checkliste"
- Oben: **Fortschrittsbalken** "5/12 BKP erledigt" (nur angewählte BKP zählen)
- Oben: **LOS-Verwaltung** — Tabs pro LOS ("LOS 1", "LOS 2", "+ LOS hinzufügen")
- Darunter: **Aufklappbarer BKP-Baum** (3 Ebenen, Accordion-Style)
  - Jede BKP-Zeile hat:
    - Checkbox (anwählen/abwählen)
    - BKP-Nummer (inline editierbar)
    - Titel (inline editierbar)
    - Status-Icon: ✓ grün | ⟳ orange | ? grau
    - Wenn `modulKey` gesetzt: kleines Link-Icon zum Berechnungsmodul
  - Am Ende jeder Ebene: "+ Position hinzufügen" Button
- **Wenn eine Lieferung-BKP angewählt wird** (hat `modulKey`):
  1. System prüft: Gibt es eine Berechnung + Offerte für dieses Objekt in diesem Modul?
  2. **Dialog öffnet sich** mit:
     - Berechnungs-Eckdaten (Durchfluss, Kapazität, Anschluss etc.)
     - Ausgewählte Anlage + Lieferant
     - Bruttoofferte als Datei (wenn vorhanden) mit Upload-Datum
     - 3 Buttons:
       - **"Berechnung bearbeiten"** → öffnet Berechnungsmodul in neuem Tab
       - **"Offerte neu anfragen"** → öffnet Offertanfrage-Dialog (wie in sa_enthaertung.html)
       - **"Offerte übernehmen"** → übernimmt die bestehende Offerte, setzt Status auf ✓ erledigt
     - Link: "→ Berechnung öffnen" (direkter Link zum Modul mit diesem Objekt)
  3. Automatisch wird eine **Montage-BKP** als Folgeposition ergänzt (z.B. 254.4 Montage Enthärtungsanlage). Wenn die Montage-BKP bereits existiert, wird sie nicht doppelt erstellt.

### Tab 2: "CRBX-Abgleich"
- CRBX-Upload bleibt (Drag & Drop)
- Nach Upload: **Vergleichstabelle**:
  - Links: BKP aus Checkliste
  - Rechts: BKP aus CRBX
  - Markierung: ✓ übereinstimmend | ⚠ fehlt in CRBX | ➕ nur in CRBX
- Planer prüft, kann BKP-Checkliste oder CRBX anpassen
- "Abgleich bestätigen" Button

### Tab 3: "Versenden"
- Bestehende Versende-Logik (Unternehmer auswählen, Ausschreibung verschicken)
- Nur aktiv wenn Tab 2 bestätigt wurde

### Rollen-Tabs (bestehend, beibehalten)
- Die bestehende Rollen-Switcher-Leiste (Planer/Unternehmer/Lieferant/Architekt) bleibt
- BKP-Checkliste ist nur in der Planer-Ansicht sichtbar

---

## 5. Dialog "Lieferung BKP" — Detail-Spezifikation

Dieser Dialog öffnet sich wenn der Planer eine BKP mit `modulKey` anwählt (z.B. "Lieferung Enthärtungsanlage"):

```
┌─────────────────────────────────────────────┐
│ 🔗 BKP 254.3 — Lieferung Enthärtungsanlage │
├─────────────────────────────────────────────┤
│                                             │
│ ── Berechnung ──────────────────────────── │
│ Durchfluss:    150 l/min                    │
│ Kapazität:     5.2 m³·°fH                  │
│ Anschluss:     DN 32                        │
│ → sa_enthaertung.html öffnen               │
│                                             │
│ ── Ausgewählte Anlage ─────────────────── │
│ BWT AQA perla 20                            │
│ Status: ✓ Verifiziert                       │
│                                             │
│ ── Bruttoofferte ──────────────────────── │
│ 📄 Offerte_BWT.pdf (hochgeladen 20.03.2026)│
│ [Offerte ansehen]                           │
│                                             │
│ ODER wenn keine Offerte:                    │
│ ⚠ Noch keine Offerte vorhanden             │
│                                             │
├─────────────────────────────────────────────┤
│ [Berechnung bearbeiten] [Offerte anfragen]  │
│ [✓ Offerte übernehmen]                      │
└─────────────────────────────────────────────┘
```

### Datenquellen für den Dialog:
- **Berechnung:** Aus dem jeweiligen Berechnungsmodul via localStorage oder der Modul-API. Für Enthärtung z.B. der letzte gespeicherte Wert von `hr_fh`, `ve_total_ls`, und die übernommene Anlage aus `localStorage.getItem('gema_enthaertung_anlage')`.
- **Offerte:** Aus `GemaProdukte.getOffertanfragen({objektId: currentObjektId, kategorie: modulKey})` — sucht ob es eine beantwortete Offertanfrage gibt.
- **Anlage:** Aus `localStorage.getItem('gema_enthaertung_anlage')` oder dem Produktkatalog.

---

## 6. LOS-Verwaltung

Ein "LOS" (Gebäudeteil, Etappe, Vergabepaket) hat einen eigenen BKP-Baum. Gleiche BKP können in mehreren Losen vorkommen.

```javascript
// Beispiel: 2 Lose
lose: [
  {
    id: 'los_1',
    name: 'LOS 1 — Untergeschoss',
    positionen: [
      { bkp: '254.0', titel: 'Kaltwasserleitungen', checked: true, status: 'erledigt' },
      { bkp: '254.3', titel: 'Lieferung Enthärtungsanlage', checked: true, status: 'erledigt', istLieferung: true, ... }
    ]
  },
  {
    id: 'los_2',
    name: 'LOS 2 — Obergeschosse',
    positionen: [
      { bkp: '254.0', titel: 'Kaltwasserleitungen', checked: true, status: 'offen' },
      // Hier keine Enthärtungsanlage nötig
    ]
  }
]
```

UI: Tabs pro LOS oberhalb des BKP-Baums. "+" Button um neues LOS hinzuzufügen. LOS-Name editierbar. LOS löschbar (mit Bestätigung).

---

## 7. CRBX-Vergleich

Nach Upload der CRBX-Datei (.e1s im ZIP) wird der Inhalt geparst und mit der BKP-Checkliste verglichen.

### Vergleichslogik:
```
Für jede angewählte BKP in der Checkliste:
  → Suche ob diese BKP-Nummer in der CRBX vorkommt
  → ✓ Match: BKP ist in beiden vorhanden
  → ⚠ Fehlt: BKP ist in Checkliste aber NICHT in CRBX (= vergessen!)
  
Für jede BKP in der CRBX die nicht in der Checkliste ist:
  → ➕ Zusätzlich: Nur in CRBX vorhanden (= evtl. überflüssig oder manuell ergänzt)
```

### Vergleichs-UI:
Tabelle mit 3 Spalten: BKP-Nr | Checkliste | CRBX
- Zeile grün: ✓ in beiden
- Zeile gelb: ⚠ fehlt in CRBX → "ACHTUNG: BKP 254.3 Enthärtungsanlage fehlt in der CRBX!"
- Zeile blau: ➕ nur in CRBX

Button: "Abgleich bestätigen" → setzt Ausschreibungs-Status auf `crbx_geprueft`

---

## 8. Storage

### Storage-Key:
```javascript
var BASE_KEY = 'gema_ausschreibung_v2';
// Pro Objekt: BASE_KEY + '__' + objektId
```

Nutzt das bestehende Object-spezifische Storage-Pattern (wie `sa_abwasserhebeanlage.html`): `loadLocal(objektId)` / `saveLocal()`.

Zusätzlich Supabase Dual-Write via `_GemaDB.saveToModule('ausschreibung', key, json)`.

---

## 9. Bestehendes beibehalten

Folgende bestehende Features in `pm_ausschreibungsunterlagen.html` MÜSSEN erhalten bleiben:
- Rollen-Switcher (Planer / Unternehmer / Lieferant / Architekt)
- Beteiligte-Verwaltung (Unternehmer hinzufügen etc.)
- Versende-Logik
- Einreichungs-Verwaltung (Unternehmer-Sicht)
- CRBX-Upload + E1S-Parser (verschieben in Tab 2)
- Gesamt-Styling und Nav (GEMA-Standard)

---

## 10. Implementierungs-Reihenfolge

| Schritt | Was | Aufwand |
|---|---|---|
| **1** | BKP-Standard-Baum als Konstante definieren | 1h |
| **2** | LOS-Verwaltung (Tabs, CRUD) | 2h |
| **3** | BKP-Baum UI (Accordion, Checkboxen, inline Edit, Status-Icons) | 4h |
| **4** | Fortschrittsanzeige oben | 0.5h |
| **5** | "Lieferung"-Erkennung + Auto-Montage-BKP | 1h |
| **6** | Dialog "Lieferung BKP" mit Berechnung/Offerte/Anlage | 3h |
| **7** | Integration mit Offertanfragen-API (`GemaProdukte`) | 2h |
| **8** | CRBX-Upload in Tab 2 verschieben | 1h |
| **9** | CRBX-Vergleichslogik + UI | 3h |
| **10** | Speicherung pro Objekt + LOS | 1h |
| **11** | Testing + Bugfixes | 2h |
| **Total** | | **~20h** |

---

## 11. Abhängigkeiten (diese Dateien NICHT ändern)

- `gema_produktkatalog_api.js` — Offertanfragen-API (createOffertanfrage, getOffertanfragen, beantworteOffertanfrage)
- `gema_objekte_api.js` — Objekt-Daten (getAll, getActive, getBeteiligte)
- `gema_auth.js` — Rollen-System (role_admin, role_planer, role_unternehmer, role_lieferant)
- `gema_db.js` — Supabase-Adapter
- `sa_enthaertung.html`, `sa_osmose.html` etc. — Berechnungsmodule (werden nicht geändert, nur verlinkt)

---

## 12. Wichtige GEMA-Konventionen

- **Dateinamen:** Keine Umlaute in Dateinamen (ä→ae etc.). Prefix `pm_` für Projektmanagement
- **Inputs:** `type="text" inputmode="decimal"` mit `onblur="fixLeadingZero(this)"`
- **Nav:** Full-width, height 52px, GEMA SVG Logo, Breadcrumb, Feedback-Button
- **Max-width:** 1100px für .g-page
- **Font:** DM Sans (kein DM Mono)
- **Storage:** Object-spezifisch mit `BASE_KEY + '__' + objektId` Pattern
- **Admin-Check:** `u.roleIds.indexOf('role_admin') >= 0`, NICHT `u.isAdmin`
- **Echte Umlaute** in UI-Texten (Titel, Labels, Buttons) — nur Dateinamen ohne Umlaute
