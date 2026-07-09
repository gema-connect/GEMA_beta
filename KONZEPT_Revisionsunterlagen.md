# KONZEPT: Revisionsunterlagen — automatisierte Übergabedokumentation zum Projektabschluss

> **Zweck dieses Dokuments**: Vollständige, in sich geschlossene Umsetzungs-Spezifikation für das neue Modul
> **`pm_revisionsunterlagen.html`** (+ Nebendateien). Geschrieben so, dass eine Claude-Code-Session (Opus 4.8)
> das Feature **ohne weiteres Kontextwissen** umsetzen kann: alle Datenmodelle, Code-Anker (Datei:Zeile,
> Stand Commit `ff0af2e`), Verknüpfungen zu bestehenden Modulen, Default-Inhalte und Registrierungspunkte
> stehen hier drin. Ergänzend gilt immer die `CLAUDE.md` (Code-Patterns, KRITISCH-Regeln).
>
> **Quellen**: Zwei vom Kunden gelieferte Word-Vorlagen (analysiert, Struktur in Kap. 2), bestehende
> GEMA-Architektur (Produktkatalog, Bestellungen, Ausschreibung, Objekte, Abnahme, Service), CLAUDE.md.

---

## 0. TL;DR

Wenn ein Projekt abgeschlossen wird, muss der Unternehmer/Planer dem Bauherrn **Revisionsunterlagen**
(Übergabedossier) abgeben: technische Zeichnungen, Datenblätter, Bedienungsanleitungen, Wartungsunterlagen,
Konformitätserklärungen, Protokolle, Pläne — heute ein enormer manueller Aufwand (jeden Lieferanten einzeln
anfragen, Ordner zusammenstellen).

GEMA automatisiert das:

1. **Lieferanten hinterlegen Dokumente pro Produkt** im Produktkatalog (teilweise vorhanden:
   `produkt.dokumente[]` existiert bereits — wird standardisiert + auf GemaStorage umgestellt).
2. **Das Modul sammelt automatisch** alle im Projekt verbauten Produkte (aus Bestellungen, beantworteten
   Offertanfragen, Vormerkungen, Anlagenwahl, Ausschreibungs-Positionen) und sortiert deren Dokumente in eine
   **konfigurierbare Kapitelstruktur** (Default-Vorlagen für Sanitär, Heizung, Lüftung/Klima — HLKS).
3. **Fehlende Unterlagen** werden per Klick **beim Lieferanten angefordert** (Notifikation → Lieferant lädt im
   Dashboard hoch → Dossier füllt sich).
4. **Manuelle Ergänzungen** (Uploads, Texte, Tabellen, Verweise) jederzeit möglich; alle automatisch
   übernommenen Daten sind **überschreibbar** und werden danach nie mehr auto-überschrieben.
5. **Export**: gebrandetes **PDF** (Firmenfarben `org.settings.pdfFarben` + Logo `org.logoVector||org.logo`,
   Fallback GEMA-Standard) und/oder **QR-Code** für den Bauherrn → öffentliche, gebrandete Web-Ansicht ohne
   GEMA-Login (Token-Freigabe über Netlify-Function).

Neue Dateien: `pm_revisionsunterlagen.html`, `gema_revision_pdf.js`, `sys_revision_ansicht.html`,
`netlify/functions/rev-share.js`. Angepasste Dateien: siehe Kap. 3.2 + Registrierungs-Checkliste Kap. 19.

---

## 1. Ausgangslage & Ziel

### 1.1 Problem

- Zum Projektabschluss verlangt die Bauherrschaft ein vollständiges Revisionsdossier
  («Betriebs- und Wartungsanleitung», «Übergabemappe», «As-Built-Dokumentation»).
- Der Ersteller (Sanitär-/HLK-Unternehmer oder Planer) muss dafür **jeden Lieferanten einzeln** um
  Datenblätter, Bedienungsanleitungen, Wartungsanleitungen, Konformitätserklärungen etc. bitten und alles
  von Hand in eine Kapitelstruktur bringen. Aufwand: oft mehrere Tage pro Projekt.
- In GEMA ist aber bereits bekannt, **welche Produkte im Projekt verbaut wurden** (Bestellungen,
  Offertanfragen, Anlagenwahl) und **wer die Lieferanten sind** — die Zusammenstellung kann also weitgehend
  automatisiert werden.

### 1.2 Kernidee (Datenfluss)

```
 Lieferant (Dashboard)                       GEMA-Projektdaten
 ┌─────────────────────────┐   ┌───────────────────────────────────────────┐
 │ Produktkatalog          │   │ Objekt (pm_objekte)   Beteiligte           │
 │  produkt.dokumente[]    │   │ Bestellungen (GemaBest)                    │
 │  · Datenblatt           │   │ Offertanfragen (GemaProdukte, beantwortet) │
 │  · Techn. Zeichnung     │   │ Vormerkungen · Anlagenwahl (gewählte      │
 │  · Bedienungsanleitung  │   │ Anlage pro Objekt) · Ausschreibungs-       │
 │  · Wartungsanleitung    │   │ Positionen · Berechnungs-Index (P04)       │
 │  · Konformitätserkl.    │   │ Abnahmeprotokolle · Service-Anlagen        │
 └───────────┬─────────────┘   └───────────────────┬───────────────────────┘
             │  fehlende Doks anfordern ◄───────────┤
             ▼                                      ▼
      ┌─────────────────────────────────────────────────────┐
      │  pm_revisionsunterlagen.html — Dossier pro           │
      │  Objekt + Gewerk, Kapitelstruktur aus Vorlage        │
      │  (anpassbar), Auto-Einsortierung + manuelle Einträge │
      └───────────────┬───────────────────┬─────────────────┘
                      ▼                   ▼
             📄 PDF (gebrandet)   🔗 QR-Code / Freigabe-Link
                                  → sys_revision_ansicht.html
                                    (öffentlich, ohne Login,
                                     via Netlify-Function)
```

### 1.3 Was bereits existiert (Verknüpfungs-Rückgrat)

| Baustein | Wo | Anker (Stand `ff0af2e`) | Nutzung hier |
|---|---|---|---|
| **Dokumente pro Produkt** | `gema_produktkatalog_api.js` | `produkt.dokumente[]`, `addDokument()` :1574, `removeDokument()` :1595, `getDokumente()` :1607 | Quelle aller Lieferanten-Unterlagen. Wird standardisiert (Kap. 5) |
| Dok-Upload-UI Lieferant | `sys_lieferant_dashboard.html` | Sektion «Dokumente & Datenblätter» :340–370, `renderPeDocs()` :972, `addPeDocTyp()` :993 | wird erweitert (Kap. 6) |
| Dok-Upload-UI Katalog/Admin | `sys_produktkatalog.html` | `DOC_TYPEN` :569–575, `addDoc()` :626 | Typ-Enum harmonisieren (Kap. 5) |
| **Bestellungen** (wer hat was fürs Objekt bestellt) | `gema_bestellungen_api.js` | Record mit `produktId`, `objektId`, `lieferantId`, `quelle{ausId,posKey,offertanfrageId}`; `getForOrg()` :248 | Hauptquelle «verbaute Produkte» |
| **Offertanfragen** (beantwortet) | `gema_produktkatalog_api.js` | `getOffertanfragen()` :1743, Record mit `projekt.objektId`, `produktId`, `berechnungswerte`, `antwort.produktId` | Produkte + technische Auslegungsdaten |
| **Vormerkungen** Produkt↔Objekt | `gema_produktkatalog_api.js` | `getVormerkungen(objektId)` :1556, Key `gema_offert_vormerkungen_v1` (nur lokal!) | Zusatzquelle |
| **Gewählte Anlage pro Objekt** | `gema_anlagenwahl.js` | Key `gema_aw_chosen_<kategorie>` per Objekt via `GemaObjekte.storageKey` (`_chosenKey` :56–60) | Zusatzquelle + Kennwerte |
| **Ausschreibungs-Positionen** | `pm_ausschreibungsunterlagen.html` | `a.lose[].positionen[]` mit `istLieferung`, `lieferungTyp`, `offerte{lieferantId, produktName, offertanfrageId}`; `MODUL_MAP` :657–675 | Zusatzquelle + BKP-Gliederung |
| **Objekt** (inkl. Status!) | `pm_objekte.html` / `gema_objekte_api.js` | Objekt-Record mit `status:'aktiv'\|'abgeschlossen'\|'archiviert'` (Select :469), `projektnummer`, `revision`; `getBeteiligte()` API :364 | Trigger «Projekt abgeschlossen» + Deckblatt + Adressverzeichnis |
| **Beteiligte** | `gema_objekte_api.js` | Rollen-Enum «Bauherrschaft / Architekt / Generalplaner / Sanitärplaner / Unternehmer / Installateur / Behörden / Weitere»; `getBauherrschaft/getArchitekt/getPlaner/getUnternehmer` :419–422 | Deckblatt + Kapitel «Adressen» |
| **Berechnungs-Index (P04)** | `gema_objekte_api.js` | `getBerechnungenForObjekt()` :578, Einträge `{modul,objektId,titel,storageKey,…}` | Kapitel «Auslegungsdaten» |
| **Abnahmeprotokolle** | `pm_abnahme.html` | Blob `gema_abnahme_sia_v1__<objektId>[@phase]`, `AB_GEWERKE` :1922, `AB_GEWERK_BKP` :1923 | Kapitel «Protokolle» (Verweis) + **Gewerk-Enum wird wiederverwendet** |
| **Service-Anlagenregister** | `sv_service.html` | Pool `gema_sv_anlagen_pool_v1` (`svanl:`), Felder `objektId`, `produktId`, `garantieBis`, `intervallMonate`; OA-Import-Muster `svImportTake()` :651 | Kapitel «Wartung» + Garantie-Tabelle |
| **Datei-Upload Cloud** | `gema_storage.js` | `GemaStorage.uploadDataUrl(dataUrl, pathHint)` :98 → `{url,path}`; akzeptiert `image/*` + `application/pdf` :101–105; Bucket `gema-fotos` :26; max 12 MB :109 | Alle Dossier-/Produkt-Dokumente |
| **Branding/PDF-Muster** | `gema_schaden_pdf.js` | `exportPrint()` :788, `_brandRootCss()` :220 (`--accent/--accent-deep/--forest/--tint-blue`), `_darkenForWhiteBg()` :199, Logo-Branch `brandHtml()` :299 (`org.logoVector||org.logo`), `@page`-Margin-Boxes :742–747 | 1:1-Muster für `gema_revision_pdf.js` |
| **QR-Muster** | `sv_service.html` | qrcodejs CDN `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js` (:17), `svQrOpen()` :917, A6-Druck `svQrPrint()` :932 | QR-Dialog für Freigabe-Link |
| **Netlify-Function-Muster** | `netlify/functions/gema-auth.js` | `exports.handler` :439, ENV `SUPABASE_URL` :37 / `SUPABASE_SERVICE_KEY` :38, REST-Helper `sb()` :62–80, CORS :430–434, Tabelle `gema_data` :41 | Muster für `rev-share.js` (öffentlicher Lesezugriff) |
| **Cross-Org-Pool-Muster** | `gema_bestellungen_api.js` | nur `GemaSync.saveRecord`, nie `persistCollection` (Kommentar :41–54), Event `gema-bestellungen-changed` :52 | Muster für Anfragen-Pool `reva:` |

**Wichtig**: Ein Modul «Revisionsunterlagen» existiert noch **nirgends** im Repo (Grep bestätigt — nur
unverwandte Treffer wie das Objekt-Feld `revision` in `pm_objekte.html:1325` und Lerninhalte in
`ab_sephir.html`, die das Fachvokabular liefern: «As-Built-Dokumentation», «Übergabemappe»).

---

## 2. Analyse der beiden Kundenvorlagen

### 2.1 Vorlage 1: ROSENMUND «Betriebs- und Wartungsanleitung Sanitäranlagen» (.doc, 25 S.)

Klassisches, vollständiges Revisionsdossier eines Sanitär-Unternehmers. Struktur:

```
Deckblatt: Objekt / Architekt / Bauherr / Unternehmer (Firma, Adresse, Tel) / Anlage-Nr / Datum+Visum
 1. Adressverzeichnis         1.1 Angaben Unternehmer (inkl. Projektleiter, Chefmonteur, 24h-Pikett)
                              1.2 Am Bau beteiligte Unternehmen (Heizung, Lüftung, Elektro, Dämmungen)
 2. Abnahme / Inbetrieb- und Prüfprotokolle
 3. Anlage- und Funktionsbeschriebe   (BKP-gegliedert: 251 Apparate / 252+253 Ver-&Entsorgung /
                                       254 Leitungen / 255 Dämmungen — Aufzählung der Anlageteile)
 4. Auslegungsdaten / Technische Daten (z.B. Dachentwässerung Pluvia, Rohrnetz-Dimensionierung,
                                       Einstellwerte: Urinoirsteuerung «P1», Zirkulations-Regulierventil 58 °C)
 5. Wartung                   5.1 Einleitung (Selbstkontrolle)  5.2 Ausführung (Pflegehinweise)
                              5.3 Checkliste und Intervalle (Tabellen mit A/B/C + Intervall)
                              5.4 Merkblatt Suissetec           5.5 Kontrollblätter (Datum/Arbeit/Visum)
 6. Anlagekomponenten         6.1 Technische Unterlagen zum Betrieb (Prospekte/Datenblätter je Komponente)
                              6.2 LIEFERANTENVERZEICHNIS (Tabelle: Gegenstand | Typen-Bez. | Lieferant | Tel)
                                  + Rohrleitungsmaterial-/Dämmungs-Tabelle (Material, Lieferant)
 7. Bewilligungen
 8. Elektroschemata
 9. Anlageschema
10. Pläne (evtl. sep. Ordner)
11. Pläne digital («1 Stk. CD mit Revisionsplänen»)
12. Diverses
```

### 2.2 Vorlage 2: Jäggi Vollmer «Wartungsanleitung» (.docx, neuere Fassung)

Schlankeres Wartungs-/Prüfheft:

```
Deckblatt: «Wartungsanleitung», Objektadresse, Firma (Jäggi Vollmer GmbH, Adresse, Tel, Mail)
 1. Zuständigkeit          (Rechtstext: Eigentümer/Betreiber = Wasserversorgung nach Art. 2 Abs. c TBDV,
                            Selbstkontrollpflicht Art. 26 LMG, Grundlage SVGW-Richtlinie W3/E4 März 2021)
 2. Wartung                2.1 Einleitung   2.2 Firma als Ratgeber/Helfer
                           2.3 Die Tabellen und ihre Symbole (A/B/C-Legende)
                           2.4 Vorgehen bei Abwesenheiten (Stagnations-Tabelle aus SVGW W3/E3 2020:
                               4h–3 Tage / bis 7 Tage / bis 4 Wochen / länger / nicht mehr benutzt)
                           2.5 Checkliste und Intervall (Gruppen: Allgemeine Sanitärapparate,
                               Ver- und Entsorgungsapparate, Roharmaturen — je A/B/C + Intervall)
 3. Merkblatt Suissetec
 4. Protokolle
 5. Pläne
 6. Bewilligungen
```

### 2.3 Bewertung — was übernehmen wir?

| Element | Entscheid | Begründung |
|---|---|---|
| 12-Kapitel-Grundgerüst (Vorlage 1) | ✅ übernehmen, leicht modernisiert (Kap. 15) | Bewährte, vollständige CH-Praxis-Struktur |
| Deckblatt-Felder (Objekt/Architekt/Bauherr/Unternehmer/Anlage-Nr) | ✅ übernehmen — **auto-befüllt aus GEMA** | Objekt + Beteiligte + eigene Org liefern alles |
| Adress-/Beteiligten-Verzeichnis | ✅ auto aus `GemaObjekte.getBeteiligte()` | vorhandene Daten |
| Lieferantenverzeichnis-Tabelle (Kap. 6.2) | ✅ auto aus Produktliste des Objekts | Kernstück der Automatisierung |
| Anlage-/Funktionsbeschrieb BKP-gegliedert | ✅ als Text-Kapitel mit Auto-Vorschlag (Positionen der Ausschreibung) | BKP-Codes liegen an den Positionen |
| Auslegungsdaten / Einstellwerte | ✅ auto aus Berechnungs-Index + OA-`berechnungswerte` + gewählter Anlage, editierbar | «Daten einmal erfassen» |
| Wartungs-Checklisten A/B/C + Intervall | ✅ übernehmen als editierbare Tabellen mit Default-Katalog (Kap. 16) | in beiden Vorlagen zentral; hoher Praxiswert |
| Rechtstexte Zuständigkeit (TBDV/LMG/W3) + Abwesenheiten-Tabelle | ✅ als Textbausteine (Kap. 17) | aktueller, geprüfter Inhalt der Vorlage 2 |
| Merkblatt Suissetec | ✅ als manuelles Upload-Kapitel (PDF) | Urheberrecht — nicht einbetten, Platzhalter |
| Kontrollblätter (Papier-Prüfliste) | ✅ als generierte PDF-Seite (leere Tabelle Datum/Arbeit/Visum) | einfacher Mehrwert; digital übernehmen später Spülmanager/Service |
| «1 Stk. CD mit Revisionsplänen» | ❌ ersetzt durch QR-Code/Weblink-Freigabe | veraltet — genau das löst dieses Modul |
| Firmenspezifische Angaben (Pikett-Nr etc.) | ✅ als freie Deckblatt-/Kapitel-Felder, nicht hartkodiert | pro Org verschieden |
| Doppelte/inkonsistente Nummerierung in Vorlage 1 (Kap. 6 heisst zweimal anders) | ❌ bereinigt | Vorlagenfehler |

---

## 3. Architektur-Übersicht

### 3.1 Bausteine

- **A — Produktkatalog**: Dokumenttyp-Standardisierung + GemaStorage-Upload (Kap. 5)
- **B — Lieferanten-Dashboard**: erweiterte Dok-Sektion + neuer Tab «Revisionsanfragen» (Kap. 6)
- **C — Hauptmodul** `pm_revisionsunterlagen.html`: Dossiers, Kapitel, Einträge, Vollständigkeit (Kap. 7)
- **D — Auto-Zusammenstellung**: Sammel-Engine + Merge-Regeln (Kap. 8)
- **E — Unterlagen-Anfragen** an Lieferanten (Kap. 9)
- **F — PDF-Export** `gema_revision_pdf.js` (+ optional Komplett-PDF mit Anhängen via pdf-lib) (Kap. 10)
- **G — QR/Freigabe**: `sys_revision_ansicht.html` + `netlify/functions/rev-share.js` (Kap. 11)
- **H — Workflow-Trigger**: Objekt-Abschluss, Ausschreibungs-Hooks (Kap. 12)

### 3.2 Datei-Übersicht

**Neue Dateien**

| Datei | Inhalt |
|---|---|
| `pm_revisionsunterlagen.html` | Hauptmodul (Liste, Wizard, Dossier-Detail, Anfragen, Freigabe-Dialog, Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block) |
| `gema_revision_pdf.js` | `GemaRevisionPDF.exportPrint(dossier, opts)` — Print-/PDF-Helper nach Muster `gema_schaden_pdf.js` |
| `sys_revision_ansicht.html` | Öffentlicher Bauherren-Viewer (Token, **ohne** `gema_auth.js`!) |
| `netlify/functions/rev-share.js` | Öffentlicher Lese-Endpunkt (Service-Key, Token-Prüfung) |

**Zu ändernde Dateien** (Details in den Kapiteln + Checkliste Kap. 19)

| Datei | Änderung |
|---|---|
| `gema_produktkatalog_api.js` | `DOK_TYPEN`/`DOK_TYP_ALIAS`/`normDokTyp()` + Export; `addDokument` um `url`-Feld dokumentieren (existiert de facto) |
| `sys_lieferant_dashboard.html` | Dok-Sektion: Typen-Erweiterung, GemaStorage-Upload; neuer Tab `revision` (Anfragen-Arbeitsvorrat) |
| `sys_produktkatalog.html` | `DOC_TYPEN` auf kanonisches Enum umstellen (Alias-Anzeige für Altdaten) |
| `pm_objekte.html` | Abschluss-Trigger (Status → `abgeschlossen`): Hinweis-Dialog + Notifikation + Banner auf Objekt-Karte |
| `pm_ausschreibungsunterlagen.html` | Nach Vergabe: Hinweis/Link «Revisionsunterlagen erstellen» (Planer- und Gewinner-Sicht) |
| `gema_auth.js` | MODULES + FILE_MAP + DEFAULT_ROLES (Backfill läuft automatisch via `_mergeWithDefaults` :108–122) |
| `gema_notify.js` | 4 neue EVENT_KEYS (Kap. 14) |
| `index.html` | PM-Kachel + Zähler |
| `sw.js` | CACHE_FILES + Versions-Bump |
| `gema_recent.js` | `PAGE_LABELS`-Eintrag |
| `CLAUDE.md` | neuer Modul-Abschnitt (Entwurf in Kap. 22) |

---

## 4. Datenmodell & Storage

### 4.1 Pools (Cloud per-Record, moduleKey `revisionsunterlagen`)

| Collection | Prefix | localStorage-Cache | Scope | Persist-Weg |
|---|---|---|---|---|
| Dossiers | `revd:` | `gema_rev_pool_v1` | org-intern (`d.orgId`) | `GemaSync.saveRecord` einzeln (kein persistCollection — Delete-Risiko vermeiden), `bindCollection` beim Boot |
| Kapitel-Vorlagen | `revv:` | `gema_rev_vorl_pool_v1` | org-intern (`v.orgId`) | wie Dossiers |
| Unterlagen-Anfragen | `reva:` | `gema_rev_anfr_pool_v1` | **cross-org** (Lieferant sieht Anfragen an ihn) | **NUR `saveRecord`**, nie persistCollection — globaler Pool wie `GemaBest` (Muster `gema_bestellungen_api.js:41–54`) |

Nach jedem Save: `window.dispatchEvent(new CustomEvent('gema-revision-changed'))` (Muster
`gema-bestellungen-changed`, `gema_bestellungen_api.js:52`).

### 4.2 Dossier-Record (`revd:<id>`)

```js
{
  id: 'rev_' + Date.now() + '_' + rand,
  orgId,                                  // Ersteller-Org (Scoping)
  objektId, objektName,                   // denormalisiert (Anzeige ohne Objekt-Zugriff)
  gewerk: 'sanitaer',                     // WIEDERVERWENDETES Enum aus pm_abnahme.html AB_GEWERKE (:1922):
                                          // sanitaer|heizung|lueftung|elektro|spenglerei|allgemein
  titel: 'Revisionsunterlagen Sanitär',   // frei
  vorlageId: 'default_sanitaer',          // nur Info, keine Live-Bindung
  status: 'in_arbeit',                    // in_arbeit | bereit | uebergeben
  uebergebenAm: null,

  deckblatt: {                            // alles vorbefüllt (Kap. 8.3), alles editierbar
    dokumentTitel: 'Betriebs- und Wartungsanleitung',
    objektName, strasse, plzOrt,
    anlageNr,                             // ← o.projektnummer
    version,                              // ← o.revision
    bauherr, architekt,                   // ← Beteiligte (mehrzeilig: Firma\nName\nOrt)
    unternehmer,                          // ← eigene Org (Name+Adresse+Tel aus org / org.settings.erp)
    bearbeiter, datum
  },

  kapitel: [ /* KAPITEL, siehe 4.3 */ ],

  freigabe: null | {                      // QR-/Link-Freigabe (Kap. 11)
    token,                                // 48 Hex-Zeichen, crypto.getRandomValues
    aktiv: true,
    erstelltAm, erstelltVon: {userId, name},
    widerrufenAm: null
  },

  sammelStand: null | { am, von },        // letzter Auto-Sammellauf (Anzeige «Stand: …»)
  erstelltAm, erstelltVon: {userId, name}, geaendertAm
}
```

**KRITISCH — Record klein halten**: Im Dossier stehen **nie** Base64-Dateien. Manuelle Uploads gehen
IMMER über `GemaStorage.uploadDataUrl(dataUrl, 'revision/<orgId>/<objektId>')` → nur `{url, name, groesse,
format}` im Record. Base64-`dataUrl` ist ausschliesslich der dokumentierte Fallback bei Upload-Fehler und
dann ≤ 2.5 MB (gleiches Muster wie Offerten-PDF, `sys_lieferant_dashboard.html:1356–1366`); solche Einträge
werden in der öffentlichen Freigabe ausgefiltert (Kap. 11.4).

### 4.3 Kapitel & Einträge

```js
// Kapitel — FLACHE Liste mit zwei Ebenen (einfaches CRUD/Reorder; Nummern werden generiert)
{
  id: 'kap_…',
  ebene: 1 | 2,                 // 2 = Unterkapitel des vorangehenden Ebene-1-Kapitels
  nr: '5.3',                    // generiert durch revKapitelRenummerieren() — nie von Hand pflegen
  titel: 'Checkliste und Intervalle',
  beschreibung: '',             // optionale Untertitel-Zeile im Export
  einleitungText: '',           // Fliesstext am Kapitelanfang (Textbausteine, Kap. 17)
  autoQuellen: ['produktdok:wartungsanleitung'],  // steuert Sammel-Engine (Kap. 8.2). [] = rein manuell
  eintraege: [ /* EINTRAG */ ]
}

// Eintrag — diskriminiert über typ
{
  id: 'ein_…',
  typ: 'dokument' | 'produktdok' | 'text' | 'tabelle' | 'verweis' | 'platzhalter',
  titel,

  // typ 'dokument'  (manueller Upload):        url, dataUrl(nur Fallback), name, format('pdf'|'jpg'…), groesse
  // typ 'produktdok'(aus Lieferanten-Katalog): produktId, dokId, dokTyp, lieferantId, lieferantFirma,
  //                                            produktName, name, url|dataUrl(Snapshot!), format
  // typ 'text':                                text  (Plaintext mit Zeilenumbrüchen)
  // typ 'tabelle':                             spalten:[…], zeilen:[[…]], tabellenArt:''|'wartung'|'lieferanten'|
  //                                            'beteiligte'|'anlagen'|'garantie'  (steuert Render-Layout)
  // typ 'verweis':                             linkUrl, linkLabel   (z.B. pm_abnahme.html?objekt=…)
  // typ 'platzhalter':                         erwartetDokTyp, produktId, produktName, lieferantId,
  //                                            lieferantFirma, anfrageId|null   (fehlende Unterlage)

  quelle: { typ: 'auto' | 'manuell', ref: '' },   // ref z.B. 'best:BST-2026-004', 'oa:oa_123', 'beteiligte'
  status: 'ok' | 'fehlend' | 'angefordert',        // nur produktdok/platzhalter relevant
  ausgeblendet: false,          // im Export/der Freigabe unterdrückt, bleibt aber erhalten (statt löschen)
  manuellGeaendert: false,      // true ⇒ Auto-Sync fasst den Eintrag NIE mehr an (CLAUDE.md-Sync-Regel 3)
  erstelltAm
}
```

**Wartungstabellen** sind Einträge `typ:'tabelle', tabellenArt:'wartung'` mit
`spalten: ['Anlageteil','Wartungsarbeit','A','B','C','Intervall']` — editierbar wie jede Tabelle,
Default-Zeilen aus dem Katalog Kap. 16.

### 4.4 Vorlagen-Record (`revv:<id>`)

```js
{
  id: 'revv_…', orgId,
  name: 'Sanitär (Büro-Standard)',
  gewerk: 'sanitaer',
  basis: 'default_sanitaer',       // von welcher Default-Vorlage abgeleitet (Info)
  kapitel: [ { ebene, titel, beschreibung, einleitungText, autoQuellen } ],  // OHNE eintraege/nr/id
  erstelltAm, erstelltVon
}
```

Die **Default-Vorlagen** (Kap. 15) liegen als Konstante `REV_DEFAULT_VORLAGEN` im Engine-Block von
`pm_revisionsunterlagen.html` (wie `DEFAULT_TEMPLATES` in `sp_dachbericht.html`) — sie werden **nie** in die
Cloud geschrieben. Org-Vorlagen (`revv:`) erscheinen zusätzlich im Wizard; «Als Org-Vorlage speichern» im
Kapitel-Editor erzeugt einen `revv:`-Record aus dem aktuellen Dossier (Einträge werden gestrippt).

### 4.5 Unterlagen-Anfrage-Record (`reva:<id>`)

```js
{
  id: 'reva_' + Date.now() + '_' + rand,
  orgId,                          // Anforderer-Org
  dossierId, objektId, objektName,
  angefordertVon: {userId, name, firma, email},
  lieferantId, lieferantFirma,    // GemaProdukte-Lieferant (wie OA/GemaBest)
  produktId, produktName, kategorie,   // produktId '' bei freien Produkten (Kap. 9.4)
  dokTypen: ['bedienungsanleitung', 'konformitaetserklaerung'],   // angeforderte kanonische Typen (Kap. 5.1)
  nachricht: '',
  status: 'offen' | 'beantwortet' | 'abgelehnt',
  angefordertAm,
  antwort: null | {
    nachricht, beantwortetAm, beantwortetVon,
    doks: [ {dokTyp, name, url|dataUrl, format} ]   // NUR für den produktlosen Direkt-Pfad (Kap. 9.4);
  }                                                 // Normalfall: Upload landet auf produkt.dokumente[]
}
```

### 4.6 Boot-/Render-Muster (KRITISCH, wie CLAUDE.md «Cloud-First»)

```js
// 1) sofort aus Cache rendern
try { load(); render(); } catch(e){}
// 2) Cloud-Pull nicht blockierend
if (window.GemaSync) Promise.race([Promise.all([
    GemaSync.bindCollection('revisionsunterlagen','gema_rev_pool_v1','revd:','id'),
    GemaSync.bindCollection('revisionsunterlagen','gema_rev_vorl_pool_v1','revv:','id'),
    GemaSync.bindCollection('revisionsunterlagen','gema_rev_anfr_pool_v1','reva:','id')
]), timeout(6000)]).then(function(){ _revCloudLoaded = true; load(); render(); _openDeepLink(); });
```

Leere-Liste-Anzeige nur wenn `_revCloudLoaded === true`, sonst Lade-Spinner (Muster `_objCloudLoaded`).
Lesen der Pools **immer** über `GemaSync.getCached(POOL)` (nie direkt `localStorage.getItem`).

---

## 5. Baustein A — Produktkatalog: Dokumenttypen standardisieren

### 5.1 Problem heute & kanonisches Enum

`produkt.dokumente[]` existiert (`gema_produktkatalog_api.js:1574–1610`), aber die zwei Pflege-UIs nutzen
**unterschiedliche `typ`-Werte**:

- `sys_produktkatalog.html` `DOC_TYPEN` (:569–575): `datenblatt, anleitung, zertifikat, schema, bild`
- `sys_lieferant_dashboard.html` `typNames` (:976): `datenblatt, montage, zertifikat, konformitaet`

**Neu in `gema_produktkatalog_api.js`** (exportieren auf `GemaProdukte`):

```js
var DOK_TYPEN = {
  datenblatt:              { label:'Datenblatt / Technische Daten', icon:'📄' },
  technische_zeichnung:    { label:'Technische Zeichnung / Masszeichnung', icon:'📐' },
  bedienungsanleitung:     { label:'Bedienungsanleitung', icon:'📘' },
  montageanleitung:        { label:'Montageanleitung', icon:'🔧' },
  wartungsanleitung:       { label:'Wartungs-/Serviceanleitung', icon:'🛠' },
  konformitaetserklaerung: { label:'Konformitätserklärung (CE/…)', icon:'✅' },
  zertifikat:              { label:'Zertifikat / Zulassung (SVGW…)', icon:'🏅' },
  schema:                  { label:'Schema / Anschlussschema', icon:'🗺' },
  ersatzteilliste:         { label:'Ersatzteilliste', icon:'🧩' },
  garantie:                { label:'Garantieschein / -bedingungen', icon:'🛡' },
  sonstiges:               { label:'Sonstiges', icon:'📎' }
};
var DOK_TYP_ALIAS = { anleitung:'bedienungsanleitung', montage:'montageanleitung',
                      konformitaet:'konformitaetserklaerung', bild:'sonstiges' };
function normDokTyp(t){ return DOK_TYPEN[t] ? t : (DOK_TYP_ALIAS[t] || 'sonstiges'); }
```

- **Bestandsdaten bleiben unangetastet** (kein Migrations-Write) — alle Leser normalisieren beim Lesen via
  `normDokTyp()` (gleiche Philosophie wie `normKatId()` :41).
- Beide UIs stellen ihre Buttons/Selects auf das kanonische Enum um; alte Typen werden über den Alias
  weiterhin korrekt angezeigt.

### 5.2 Upload auf GemaStorage umstellen (statt Base64 im Record)

Heute: Dok-`dataUrl` liegt Base64 im Produkt-Record (Kommentar «migrate to Supabase later»,
`gema_produktkatalog_api.js:1587`; Limits 10 MB Katalog-UI / 5 MB Dashboard). Neu für **neue** Uploads in
beiden UIs:

1. Datei lesen → `GemaStorage.uploadDataUrl(dataUrl, 'produkte/<lieferantId>/doks')` → `dok.url = res.url`,
   `dok.dataUrl = ''`.
2. Fallback (Storage nicht konfiguriert/Fehler): Base64 wie bisher, aber ≤ 2.5 MB (Muster Offerten-PDF).
3. `GemaStorage` akzeptiert `image/*` **und** `application/pdf` (`gema_storage.js:101–105`) — andere Formate
   (docx etc.) mit klarer Fehlermeldung ablehnen: «Bitte als PDF hochladen».
4. Bestehende Base64-Doks unverändert lassen und weiter anzeigen (`url || dataUrl`).

**KRITISCH — Statuserhalt**: Dokument-Uploads laufen über `GemaProdukte.addDokument()` /
`removeDokument()` — **nicht** über `updateProdukt(id, daten, dokumente)`, denn `updateProdukt` setzt ein
verifiziertes Produkt auf `entwurf` zurück (`gema_produktkatalog_api.js:1358`). Ein nachgereichtes Datenblatt
darf die Verifizierung **nicht** zerstören. (Das Dashboard sammelt Doks heute in `_pe.docs` und speichert sie
via `saveProd()`/`updateProdukt` mit — dieser Pfad ist auf direkte `addDokument`/`removeDokument`-Aufrufe pro
Aktion umzustellen; bei Neuanlage weiterhin via `createProdukt` + anschliessende `addDokument`-Calls.)

Zusätzlich: `dok.sprache` (Feld existiert bereits, `:1583`) im Dashboard als kleines Select DE/FR/IT/EN
anbieten (bereits in `sys_produktkatalog.html` vorhanden, `DOC_SPRACHEN` :576).

---

## 6. Baustein B — Lieferanten-Dashboard

### 6.1 Dok-Sektion im Produkt-Editor erweitern

Bestehende Sektion «Dokumente & Datenblätter» (`sys_lieferant_dashboard.html:340–370`, `renderPeDocs()` :972,
`addPeDocTyp()` :993, `rmPeDoc` :1024, `previewDoc` :1031):

- Buttons/Zeilen für **alle** `DOK_TYPEN` (statt der bisherigen 4) — kompakt als «＋ Dokument»-Button mit
  Typ-Select statt 11 Einzelbuttons.
- Upload via GemaStorage (Kap. 5.2), URL-Referenz («Link zum Hersteller-PDF») bleibt möglich
  (`format:'url'`, bestehendes Verhalten).
- Kleine Vollständigkeits-Zeile pro Produkt: «Revisions-Set: 3/4 (fehlt: Wartungsanleitung)» — geprüft gegen
  `REV_PFLICHT_DOKTYPEN` (Kap. 8.2), rein informativ.
- Rechte wie gehabt: `_liefCanEditProdukte()` (:458) + `_liefBlockedInaktiv()` (:463).

### 6.2 Neuer Tab «📑 Revisionsanfragen» (`revision`)

- In `setupTabs()` (:653) ergänzen; sichtbar für Anlagen- UND Produktlieferanten (`_liefIsAnlagenLief() ||
  _liefIsProduktLief()`), Badge = Anzahl offener Anfragen (`revBadge`). Deep-Link `?tab=revision`
  (bestehender Mechanismus :711–717) — Ziel der Notifikation `revision_unterlagen_anfrage`.
- Datenquelle: `GemaSync.bindCollection('revisionsunterlagen','gema_rev_anfr_pool_v1','reva:','id')` beim
  Init (cross-org, Muster `GemaBest.bind()`), Filter `a.lieferantId ∈ _dwzMyIds()`-Analogon: eigener
  Lieferant via `findMyLieferant()`/`_lief.id`.
- Karte pro Anfrage: Projekt (objektName), Anforderer (Firma/Name), Produkt, angeforderte Dok-Typen als
  Chips (✅ wenn auf dem Produkt inzwischen vorhanden — live gegen `GemaProdukte.getDokumente(produktId)`
  geprüft), Nachricht, Datum.
- Aktionen (`_liefCanEditProdukte() || _liefCanOfferten()`, `_liefBlockedInaktiv()`-Guard):
  - **«📤 Hochladen»** pro fehlendem Dok-Typ → öffnet Upload (gleicher Code wie 6.1); Ziel ist das
    **Produkt** (`addDokument`) — so profitieren alle künftigen Projekte. Bei Anfragen ohne `produktId`
    (freies Produkt): Upload landet in `anfrage.antwort.doks[]` (GemaStorage-Pfad
    `revision/anfragen/<lieferantId>`).
  - **«✓ Erledigt senden»** → `status:'beantwortet'`, `antwort.nachricht` optional; Notifikation
    `revision_unterlagen_erhalten` an `angefordertVon.userId`.
  - **«✕ Ablehnen»** (GemaDialog.prompt Grund) → `status:'abgelehnt'` + gleiche Notifikation (typ
    `warnung`).
- Save immer einzeln via `GemaSync.saveRecord('revisionsunterlagen','reva:'+id, a)`.

---

## 7. Baustein C — Hauptmodul `pm_revisionsunterlagen.html`

Kategorie **Projektmanagement** (pm_-Präfix). Standard-Seitengerüst: `.g-nav` mit Logo→`index.html`,
Feedback-Button, kompakter Modul-Hero (`hero-in`/`hero-title`-Markup!), `.g-page` max-width 1100px, 4
PWA-Metas im `<head>`, Einbindung: `gema_responsive.css`, `gema_auth.js`, `gema_sync.js`, `gema_db.js`,
`gema_dialog.js`, `gema_notify.js`, `gema_notify_ui.js`, `gema_objekte_api.js`,
`gema_produktkatalog_api.js`, `gema_bestellungen_api.js`, `gema_storage.js`, `gema_scroll.js`,
`gema_recent.js`, `gema_feedback.js`, `gema_pwa.js`, `gema_revision_pdf.js`, qrcodejs-CDN (wie
`sv_service.html:17`).

### 7.1 Listen-Ansicht (Dashboard)

- KPI-Zeile: Dossiers total · in Arbeit · bereit · übergeben (klickbare Filter, Muster
  `sd_schadensbericht.html`).
- Toolbar: Suche, Objekt-Filter (Dropdown aus `GemaObjekte.getAll()`), «＋ Neues Dossier», «⚙ Vorlagen».
- Karten-Grid: Status-Balken (amber/grün/blau), Gewerk-Icon (🚿 sanitaer / 🔥 heizung / 💨 lueftung /
  ⚡ elektro / 🏠 spenglerei / 📁 allgemein), Titel, Objektname, Vollständigkeits-Fortschritt
  («14/18 Pflichtdokumente»), Freigabe-Badge (🔗 aktiv), `sammelStand`.
- Org-Scoping: nur `d.orgId === user.orgId`.

### 7.2 Dossier anlegen (Wizard, ein Modal)

1. **Objekt** (aktives Objekt vorausgewählt; `?objekt=<id>`-Deep-Link setzt es — Muster «URL-Parameter
   `?objekt=ID`» aus CLAUDE.md),
2. **Gewerk** (Enum `AB_GEWERKE`; Vorschlag: Org-Kategorie bzw. Planer-Rolle),
3. **Vorlage** (Default-Vorlagen des Gewerks + Org-Vorlagen `revv:`),
4. **Titel** (Vorschlag «Revisionsunterlagen <Gewerk> — <Objektname>»).

Beim Erstellen: Kapitel aus Vorlage instanziieren (`revNeuesDossier()`), Deckblatt vorbefüllen (Kap. 8.3),
dann **sofort Sammellauf** (Kap. 8) mit Ergebnis-Dialog («12 Dokumente übernommen, 6 fehlend, 3 Anlagen,
5 Beteiligte»).

### 7.3 Dossier-Detail (Vollbild-Overlay, Muster `sd_schadensbericht.html`)

- **Kopf**: Titel (editierbar), Objekt, Gewerk-Badge, Status-Select (`in_arbeit|bereit|uebergeben`),
  Vollständigkeits-KPI.
- **Toolbar**: «↻ Aus GEMA aktualisieren» (Kap. 8.5) · «📋 Vollständigkeit» (Matrix, 7.5) · «📨 Fehlende
  anfordern» (Kap. 9) · «📄 PDF» · «🧩 Komplett-PDF» (Kap. 10) · «🔗 Freigabe/QR» (Kap. 11) · «⚙ Kapitel».
- **Layout**: links Kapitelbaum (Nr + Titel + Zähler + rotes Badge bei fehlenden Pflichtdoks), rechts
  Einträge des aktiven Kapitels.
- **Eintrags-Zeile**: Icon nach Typ, Titel, Quelle-Badge (`auto: BST-2026-004` / `auto: Offertanfrage` /
  `manuell`), Status-Pill (ok/fehlend/angefordert), Aktionen: 👁 Vorschau (`url||dataUrl`, Lightbox/neuer
  Tab), ✏️ (öffnet Editor je Typ; setzt `manuellGeaendert:true`), 🚫 aus-/einblenden, 🗑 (nur manuelle;
  Auto-Einträge nur ausblenden — GemaDialog erklärt das), ↕ Reihenfolge.
- **«＋ Eintrag»** pro Kapitel: Upload (Datei→GemaStorage) · Text · Tabelle · Verweis (URL+Label) ·
  «Aus Produktkatalog…» (Picker: Produkte des Objekts → deren Doks).
- **Kapitel-Editor** («⚙ Kapitel»): Liste mit Titel/Ebene/Beschreibung editierbar, ＋/🗑/↕,
  `autoQuellen`-Chips pro Kapitel (Multi-Select aus Kap. 8.2-Registry), «Als Org-Vorlage speichern»
  (→ `revv:`), «Neu nummerieren» läuft automatisch bei jeder Änderung (`revKapitelRenummerieren`).

### 7.4 Rechte im Modul

`_revCanEdit()` = `GemaAuth.can('write','revisionsunterlagen')` — Planer-Rollen/Admin/Abteilungsleiter via
`_allPerms`, Unternehmer explizit (Kap. 13). Bauherrschaft/Architekt: read-only (sehen Liste + Detail ohne
Schreib-Buttons). Alle Dialoge via `GemaDialog` (Löschen mit `danger:true`).

### 7.5 Vollständigkeits-Matrix («📋 Vollständigkeit»)

Modal-Tabelle: **Zeilen = Produkte des Objekts** (aus dem Sammellauf), **Spalten = Pflicht-Dok-Typen**
(Kap. 8.2), Zellen: ✓ vorhanden (klickbar → Vorschau) / — fehlt (Checkbox für Anfrage) / ⏳ angefordert
(mit Datum). Fusszeile: «📨 Markierte anfordern» → bündelt pro Lieferant+Produkt eine Anfrage (Kap. 9).
Das ist die zentrale Aufwands-Ersparnis-Ansicht.

### 7.6 Deep-Links

- `pm_revisionsunterlagen.html?objekt=<id>` → Liste gefiltert + Wizard-Vorauswahl
- `…?d=<dossierId>` → Detail öffnen (Ziel von `revision_unterlagen_erhalten`)
- `…?d=<dossierId>&kap=<kapId>` → Detail + Kapitel aktiv

---

## 8. Baustein D — Auto-Zusammenstellung (Sammel-Engine)

### 8.1 Produktermittlung `revProdukteSammeln(objektId, quellen)` (Engine, pure)

Eingabe sind die Roh-Arrays (DOM-frei testbar). Quellen in dieser Reihenfolge, dedupliziert per
`produktId`, sonst per `lieferantId + '|' + produktName.toLowerCase()`:

| # | Quelle | Zugriff | Relevante Felder |
|---|---|---|---|
| 1 | **Bestellungen** | `GemaBest.getForOrg(orgId)` → `b.objektId === objektId`, Status ≠ `storniert`/`abgelehnt` | `produktId, produktName, kategorie, lieferantId, lieferantFirma, nr, geliefert.am, bestelltAm, quelle.bkpCode, quelle.offertanfrageId` |
| 2 | **Offertanfragen (beantwortet)** | `GemaProdukte.getOffertanfragen({status:'beantwortet'})` → `oa.projekt.objektId === objektId` | `antwort.produktId || produktId`, `produktName, kategorie, lieferantId, lieferantFirma, berechnungswerte, antwort.bruttoPreis, id` |
| 3 | **Vormerkungen** | `GemaProdukte.getVormerkungen(objektId)` (nur-lokal-Pool `gema_offert_vormerkungen_v1` — Hinweis im UI, dass diese Quelle gerätegebunden ist) | `produktId, produktName, kategorie, lieferantId, lieferantFirma, bkpCode, offertanfrageId` |
| 4 | **Gewählte Anlagen** | pro `KATEGORIEN`-Key: `localStorage['gema_aw_chosen_' + kat + '__' + objektId]` (+ `@<phase>`-Varianten aller Phasen prüfen; Format `_chosenKey`, `gema_anlagenwahl.js:56–60`) | `chosen.daten` (Kennwerte!), `lieferantFirma, serie, modell` |
| 5 | **Ausschreibungs-Positionen** | `GemaSync.getCached('gema_aus_pool_v1')` → `a.objektId === objektId` → `a.lose[].positionen[]` mit `istLieferung && checked !== false` | `lieferungTyp` (→ Kategorie via `MODUL_MAP`), `offerte{lieferantId, lieferantFirma, produktName, offertanfrageId}`, `bkp, titel` |

Ausgabe pro Produkt:

```js
{ produktId, produktName, kategorie, lieferantId, lieferantFirma,
  bkpCode, lieferdatum,                      // erste gefundene Werte
  kennwerte: {…},                            // OA.berechnungswerte ⊕ chosen.daten (flach gemerged)
  quellen: [ {typ:'bestellung', ref:'BST-2026-004'}, {typ:'oa', ref:'oa_…'}, … ] }
```

Kategorie `werkzeuge` wird übersprungen (Werkzeugkatalog gehört nicht in Revisionsunterlagen).

### 8.2 Einsortierung: `autoQuellen`-Registry

Jedes Kapitel deklariert, was es automatisch erhält. Implementiert in `revSammeln(dossier, ctx)` (Engine):

| autoQuellen-Wert | erzeugt Einträge |
|---|---|
| `deckblatt` | (kein Eintrag — Kennzeichnung fürs Deckblatt-Kapitel) |
| `beteiligte` | 1 Tabelle `tabellenArt:'beteiligte'` aus `GemaObjekte.getBeteiligte(objektId)`: Rolle · Firma · Name · Ort · Telefon · E-Mail (+ BKP) |
| `lieferantenverzeichnis` | 1 Tabelle `tabellenArt:'lieferanten'` aus der Produktliste: Gegenstand (Kategorie-Label bzw. Produktname) · Typ/Modell · Lieferant · Telefon/E-Mail (Lieferant-Record via `GemaProdukte.getLieferant(id)`, fehlende Felder leer) |
| `anlagenliste` | 1 Tabelle `tabellenArt:'anlagen'`: Anlage/Kategorie · Produkt · Lieferant · BKP · Quelle (BST-Nr/OA) |
| `produktdok:<dokTyp>` | pro Produkt+passendem Dok (`normDokTyp(dok.typ) === dokTyp`) ein `produktdok`-Eintrag; **fehlt der Typ bei einem Produkt → `platzhalter`-Eintrag `status:'fehlend'`**, wenn `<dokTyp>` in `REV_PFLICHT_DOKTYPEN` |
| `kennwerte` | pro Produkt mit `kennwerte` ein Text/Tabellen-Eintrag «Auslegungsdaten <Produkt>»: Label+Einheit aus `GemaProdukte.getKategorie(kat).felder` für `chosen.daten`-Keys; für OA-`berechnungswerte`-Keys aus `REV_BW_LABELS` (Kopie der `_OA_BW_LABELS`, `sys_lieferant_dashboard.html:1140–1175`, in den Engine-Block) |
| `berechnungen` | pro Eintrag aus `GemaObjekte.getBerechnungenForObjekt(objektId)` ein `verweis`-Eintrag (Label = Berechnungs-Titel, Link = Modul-HTML via umgekehrter `MODUL_MAP`/`FILE_MAP`-Lookup + `?objekt=`); Gewerk-Vorfilter über Kategorie-Heuristik (sb_/sa_→sanitaer, hz_→heizung, lt_→lueftung), alles ein-/ausblendbar |
| `abnahmen` | pro Abnahme-Protokoll des Objekts (Blob `gema_abnahme_sia_v1__<objektId>` inkl. `@<phase>`-Varianten; `protocols[]` mit `state.gewerk`-Match) ein `verweis`-Eintrag «Abnahmeprotokoll <Name> (<Datum>)» → `pm_abnahme.html?objekt=…` + Hinweis-Text «PDF-Ausdruck des Protokolls hier anhängen» |
| `garantie` | 1 Tabelle `tabellenArt:'garantie'`: Produkt · Lieferant · Liefer-/Inbetriebnahmedatum (`b.geliefert.am || b.bestelltAm`) · Garantie bis (aus `sv_service`-Anlage `garantieBis`, Match über `produktId`/`quelleOaId`, sonst leer editierbar) |
| `wartungstabelle` | Wartungs-Checklisten-Tabellen aus `REV_WARTUNG_KATALOG[gewerk]` (Kap. 16) + 1 Tabelle der Service-Anlagen des Objekts (`gema_sv_anlagen_pool_v1`, `a.objektId`-Match: Anlage · Intervall · nächste Wartung) |
| `textbaustein:<key>` | 1 Text-Eintrag aus `REV_TEXTBAUSTEINE[key]` (Kap. 17) |
| `kontrollblatt` | 1 Spezial-Eintrag, der im PDF als leere Kontrollblatt-Tabelle rendert (Datum · Ausgeführte Kontrolle/Reparatur · Visum, 25 Leerzeilen) |

`REV_PFLICHT_DOKTYPEN = ['datenblatt','bedienungsanleitung','wartungsanleitung','konformitaetserklaerung']`
(Konstante im Engine-Block; pro Dossier über ein kleines ⚙-Setting übersteuerbar, gespeichert am Dossier).

### 8.3 Deckblatt-Vorbefüllung `revDeckblattVorschlag(objekt, beteiligte, org, user)`

| Feld | Quelle |
|---|---|
| objektName / strasse / plzOrt | `o.name`, `o.strasse`, `o.plz + ' ' + o.ort` |
| anlageNr | `o.projektnummer` |
| version | `o.revision` |
| bauherr | `GemaObjekte.getBauherrschaft()` → `firma`, `name`, `ort` (mehrzeilig) |
| architekt | `GemaObjekte.getArchitekt()` |
| unternehmer | eigene Org: `org.name` + Adresse; Tel/E-Mail aus `org.settings.erp.tel/email` falls gepflegt (`pm_erp.html`-Einstellungen), sonst leer |
| bearbeiter / datum | `user.name` / heute |

Alles editierbar; einmal editierte Felder werden bei «↻ Aktualisieren» nicht überschrieben
(Feld-Merker `deckblatt._touched = {feld:true}`).

### 8.4 Merge-Regeln (CLAUDE.md-Datensynchronisation, verbindlich)

`revMergeAddOnly(dossier, gesammelt)` (Engine):

1. **Neue** Auto-Einträge werden angehängt (Identität: `quelle.ref + typ + produktId + dokId/dokTyp`).
2. **Bestehende** Auto-Einträge mit `manuellGeaendert:true` oder `ausgeblendet:true` werden NIE verändert.
3. Platzhalter (`status:'fehlend'`) wird zu `produktdok` (`status:'ok'`) aufgelöst, sobald das Dokument im
   Katalog auftaucht (Match `produktId + erwartetDokTyp`).
4. Verschwundene Quellen (z.B. stornierte Bestellung): Eintrag bleibt, bekommt Badge «Quelle entfernt»
   (`quelle.entfernt = true`) — nie automatisch löschen.
5. Ergebnis-Dialog fasst zusammen (× neu, × aktualisiert, × fehlend), Muster Vorbefüllungs-Hinweise.

### 8.5 «↻ Aus GEMA aktualisieren»

Button im Detail → Quellen neu einlesen → `revProdukteSammeln` → `revSammeln` → `revMergeAddOnly` →
`sammelStand` setzen → Save + Re-Render. Zusätzlich Live-Reaktion: `gema-produkte-loaded`- und
`gema-bestellungen-changed`-Events markieren den Stand als «veraltet» (kleiner Hinweis-Chip), lösen aber
**keinen** Auto-Merge aus (bewusste User-Aktion).

---

## 9. Baustein E — Unterlagen-Anfragen an Lieferanten

### 9.1 Auslösen (Planer/Unternehmer)

Aus der Vollständigkeits-Matrix (7.5) oder am Platzhalter-Eintrag («📨 anfordern»). Bündelung: **eine
Anfrage pro Lieferant+Produkt** mit allen fehlenden `dokTypen`. Dialog zeigt Empfänger (Lieferant),
Produkt, Typen-Chips, Nachricht (Vorschlag: «Für die Revisionsunterlagen des Projekts <Objekt> fehlen uns
folgende Unterlagen …»).

### 9.2 Zustellung

`GemaSync.saveRecord('revisionsunterlagen','reva:'+id, anfrage)` + Notifikation
`revision_unterlagen_anfrage`: Empfänger-Auflösung **exakt wie Offertanfragen**
(`gema_produktkatalog_api.js` `_notifyLieferant`-Muster / `gema_bestellungen_api.js:62`): bevorzugt alle
User mit passender `user.lieferantId`, Fallback Lieferanten-Org (nie `org_default`); Link
`sys_lieferant_dashboard.html?tab=revision`. Betroffene Einträge im Dossier → `status:'angefordert'`,
`anfrageId` verlinkt.

### 9.3 Beantwortung (Lieferant, Kap. 6.2) & Rückfluss

Bei `status:'beantwortet'`: Notifikation `revision_unterlagen_erhalten` an `angefordertVon.userId` (Link
`pm_revisionsunterlagen.html?d=<dossierId>`). Beim nächsten Öffnen/«↻» löst der Merge die Platzhalter auf
(8.4 Regel 3). Direkt-Antwort-Doks (produktlos, `antwort.doks[]`) werden als `produktdok`-ähnliche Einträge
mit `quelle.ref:'reva:<id>'` eingefügt.

### 9.4 Sonderfall: Produkt ohne Katalog-Eintrag / Lieferant ohne GEMA

- Bestellung/Position ohne `produktId`: Anfrage trägt nur `produktName` — Upload landet an der Anfrage
  (`antwort.doks[]`).
- Lieferant ganz ohne GEMA-Konto: Ausbaustufe — E-Mail-Einladung über bestehendes
  `gema_offer_request.js`-Muster (`GemaAuth.inviteLieferant`). Für die MVP-Phase reicht der Hinweis im
  Dialog «Lieferant ist nicht in GEMA — Unterlagen manuell einholen und hier hochladen».

---

## 10. Baustein F — PDF-Export (`gema_revision_pdf.js`)

### 10.1 Struktur-PDF (Print-Fenster, MVP)

`GemaRevisionPDF.exportPrint(dossier, {org, user, objektName, objektAdresse})` — 1:1 nach dem Muster
`gema_schaden_pdf.js` (Anker in Kap. 1.3):

- **Cover**: Brand-Block mit Logo-Branch (`org.logoVector || org.logo`, sonst eingebettetes GEMA-SVG —
  `brandHtml()`-Muster :299–308), Dokumenttitel (`deckblatt.dokumentTitel`), Objekt gross, Meta-Grid
  (Bauherr/Architekt/Unternehmer/Anlage-Nr/Version/Bearbeiter/Datum), Status-Pill. Optional QR der
  aktiven Freigabe klein unten rechts (qrcodejs im Print-Fenster nachladen — exakt das
  `pm_erp.html:1799`-Muster mit `'<scr'+'ipt>'`-Split und `onload`-Render).
- **Inhaltsverzeichnis**: Kapitel-Nr + Titel (+ Eintragszahl).
- **Pro Ebene-1-Kapitel ein Trennblatt** (farbiges Sektions-Band, Kapitel-Nr gross) gefolgt vom Inhalt:
  `einleitungText` → Einträge: Text-Absätze, Tabellen (Zebra, `thead{display:table-header-group}`),
  Bilder (`<img>`, max-width), **PDF-/Datei-Anhänge als Beilagen-Liste** (Icon, Name, Typ, Lieferant —
  im Browser klickbar via `url`), Verweise als Linkzeile, Platzhalter «fehlend» amber, Kontrollblatt als
  Leertabelle. `ausgeblendet:true` wird übersprungen.
- **Branding**: `REPORT_CSS`-Kopie mit denselben CSS-Vars; `_brandRootCss(org)` + Kontrastschutz-Helfer
  **duplizieren** (standalone IIFE, wie in beiden bestehenden PDF-Helfern; `_darkenForWhiteBg` ≥ 4.5:1).
  Fliesstext fest `#000` (User-Vorgabe aus CLAUDE.md).
- **Kopf-/Fusszeilen** via `@page`-Margin-Boxes (Muster :742–747, `_cssStr`-Escaping): oben links Org-Name,
  oben rechts «Revisionsunterlagen · <Objekt>», unten links Org + Datum, unten rechts «Seite X von Y».
- Print-Toolbar oben rechts (`no-print`), A4-Blatt-Vorschau am Bildschirm, `break-inside:avoid`-Wrapper.
- In der Helper-Tabelle der CLAUDE.md ergänzen (Kap. 22).

### 10.2 Komplett-PDF mit zusammengeführten Anhängen (Ausbaustufe, aber spezifiziert)

Ziel: EIN PDF inkl. aller angehängten Lieferanten-PDFs. Client-seitig via **pdf-lib** (NEUE Dependency,
lazy CDN-Load `https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js` — URL bei Umsetzung
verifizieren; Muster `_tgEnsureJsPDF`/`ensurePdfJs`, `if_wareneingang.html:1003–1011`):

1. Struktur-Seiten (Cover, TOC, Trennblätter, Text/Tabellen) mit **jsPDF** erzeugen (CDN 2.5.1 bereits im
   Repo etabliert) → `doc.output('arraybuffer')`.
2. `PDFDocument.load(strukturBuffer)`; dann je Kapitel-Anhang: `fetch(url)` → `arrayBuffer` →
   `PDFDocument.load` → `copyPages` einfügen; Bilder via `embedJpg/embedPng` als eigene Seite.
3. Seitennummern nachträglich mit `drawText` auf jede Seite stempeln; Ergebnis als Blob-Download
   `Revisionsunterlagen_<Objekt>.pdf`.
4. **CORS/Robustheit**: Storage-URLs zeigen auf `<SB_URL>/storage/v1/object/public/…`. `fetch` zuerst
   direkt; bei Fehler URL auf die aktive Basis umschreiben (`GemaSync.SB_URL`-Getter — schaltet
   automatisch auf den Same-Origin-Proxy `/sb/*`, `netlify.toml:46–50`). `dataUrl`-Fallback-Doks direkt
   einbetten.
5. Fortschritts-Dialog (n/m Anhänge), Grössen-Warnung ab ~40 MB, defekte/nicht ladbare Anhänge werden im
   Ergebnis-Dialog gelistet und im PDF durch ein Hinweis-Blatt ersetzt («Beilage separat: <Name>»).
6. Verschlüsselte/gesperrte Quell-PDFs können `load` scheitern lassen → gleiche Hinweis-Blatt-Behandlung.

---

## 11. Baustein G — QR-Code & Bauherren-Zugriff

### 11.1 Freigabe-Dialog (im Dossier-Detail, «🔗 Freigabe/QR»)

- Toggle «Freigabe aktiv» → erzeugt `freigabe{token(48 hex via crypto.getRandomValues), aktiv:true,…}`.
- Zeigt: Freigabe-URL `location.origin + '/sys_revision_ansicht.html?t=<token>'`, «📋 kopieren»,
  **QR-Code** (qrcodejs, 200×200, CorrectLevel M) + «🖨 QR drucken» (A6-Muster `svQrPrint`,
  `sv_service.html:932–943`), «↻ Token erneuern» (invalidiert alten Link, GemaDialog-confirm danger),
  «⏸ deaktivieren» (`aktiv:false`, `widerrufenAm`).
- Hinweis-Text: «Jeder mit diesem Link/QR kann die Unterlagen einsehen (ohne GEMA-Login). Ausgeblendete
  Einträge sind nicht sichtbar.»
- Button «✓ Übergabe vermerken» → `status:'uebergeben'`, `uebergebenAm` — der QR kann auf dem PDF-Cover
  mitgedruckt werden (10.1).

### 11.2 Netlify-Function `netlify/functions/rev-share.js`

Muster `gema-auth.js` (ENV **wiederverwenden**: `SUPABASE_URL` :37, `SUPABASE_SERVICE_KEY` :38 — keine
neuen ENV-Variablen nötig; Tabelle `gema_data` :41; CORS-Objekt :430–434; `resp()`-Helper :435).

```
GET /.netlify/functions/rev-share?t=<token>
```

1. Token validieren (`/^[a-f0-9]{32,64}$/`), sonst 400.
2. PostgREST-Query mit Service-Key:
   `GET <SB_URL>/rest/v1/gema_data?module_key=eq.revisionsunterlagen&data_key=like.revd:*`
   `&data->freigabe->>token=eq.<t>&data->freigabe->>aktiv=eq.true&select=data_key,data&limit=2`
   — 0 Treffer → 404 `{error:'Nicht gefunden oder deaktiviert'}`; >1 → 404 (Kollision, praktisch
   ausgeschlossen).
3. Org-Branding nachladen: `data_key=eq.org:<dossier.orgId>&module_key=eq.auth` → `{name, logo,
   logoVector, settings.pdfFarben}` (nur diese Felder!).
4. **Sanitisieren** (`revSanitizeForShare`-Logik serverseitig spiegeln): `freigabe` komplett entfernen,
   User-IDs strippen (`erstelltVon.userId`, `angefordertVon` etc.), Einträge mit `ausgeblendet:true`
   entfernen, `dataUrl`-Felder entfernen (Grösse! — solche Einträge bekommen `nurIntern:true` und werden
   im Viewer als «Dokument nur in GEMA einsehbar» gelistet), `sammelStand`/`quelle.ref` entfernen.
5. Antwort `{ dossier: <sanitisiert>, branding: {orgName, logo, logoVector, pdfFarben} }`,
   Cache-Header `Cache-Control: no-store`.

Bekannte, akzeptierte Grenzen (wie die bestehenden Functions): kein Rate-Limiting; Sicherheit = 192-Bit-
Zufalls-Token («unlisted link»). Optional-Redirect `/api/rev-share` in `netlify.toml` analog :31–39.

### 11.3 Öffentlicher Viewer `sys_revision_ansicht.html`

**KRITISCH**: Diese Seite bindet **kein** `gema_auth.js` ein (jede Seite mit gema_auth landet ohne Session
im Login-Redirect bzw. ohne FILE_MAP-Eintrag im «Kein Zugriff»-Screen — `gema_auth.js:968–1059`). Ebenso
kein gema_sync/notify — die Seite ist komplett eigenständig (nur Inline-CSS/JS + `fetch` auf die Function).
Sie wird **nicht** in `FILE_MAP`/`MODULES` registriert und **nicht** in `sw.js` CACHE_FILES aufgenommen.

- Boot: `?t=` lesen → `fetch('/.netlify/functions/rev-share?t='+t)` → Fehlerzustände (ungültig/widerrufen/
  offline) freundlich rendern.
- **Branding**: pdfFarben via denselben (inline kopierten) Kontrastschutz-Helfern auf CSS-Vars anwenden;
  Logo im Kopf (`logoVector||logo`, Fallback GEMA-SVG); DM Sans; responsive (Bauherr öffnet per Handy nach
  QR-Scan!).
- Inhalt: Deckblatt-Block → Kapitel-Akkordeon (Nr, Titel, Einleitung, Einträge). Dokumente als Karten mit
  Icon/Typ/Lieferant, Klick öffnet `url` (öffentliche Bucket-URL) in neuem Tab. Tabellen/Texte gerendert
  wie im PDF. «🖨 Drucken»-Button (einfaches Print-CSS).
- 4 PWA-Metas + Safe-Area sind hier NICHT nötig (keine App-Seite), aber Viewport-Meta + `overflow-x`
  sauber.

### 11.4 Fallback ohne Functions-Deploy

Wenn `rev-share` 404 liefert (Kompatibilitätsmodus wie `gema_sync.js`-Function-Fallbacks), zeigt der
Freigabe-Dialog Variante B an: «Komplett-PDF erzeugen (Kap. 10.2) → automatisch in Bucket hochladen
(`GemaStorage.uploadDataUrl`, Pfad `revision/<orgId>/<objektId>`, ≤ 12 MB) → QR zeigt direkt auf die
PDF-URL». Grenzen klar benennen (statisch, kein Widerruf ausser Datei-Löschung, 12-MB-Limit).

---

## 12. Baustein H — Workflow-Trigger & Integrationen

### 12.1 Projekt-Abschluss (`pm_objekte.html`)

Im Objekt-Speichern (`saveObjekt`, `pm_objekte.html:1318–1344`): Wenn `status` **auf `abgeschlossen`
wechselt** (vorher ≠):

1. Existiert ein Dossier für das Objekt (`gema_rev_pool_v1`, `objektId`-Match)? Wenn **nein**:
   `GemaDialog.confirm({title:'Revisionsunterlagen', message:'Zum Projektabschluss gehören
   Revisionsunterlagen. Jetzt erstellen?', confirmLabel:'Dossier erstellen'})` → bei OK Redirect
   `pm_revisionsunterlagen.html?objekt=<id>`.
2. Zusätzlich Notifikation `revision_projektabschluss` an `empfaengerRoleId:'role_planer'` +
   `empfaengerOrgId` (BEIDE gesetzt — Matching-Regel!), Link wie oben. Tages-Lock nicht nötig (Trigger
   ist der einmalige Statuswechsel).
3. Objekt-Karte/Detail: Badge «📑 Revisionsunterlagen: vorhanden (Status) / fehlen» wenn
   `status==='abgeschlossen'` (Lesezugriff auf `gema_rev_pool_v1` via `GemaSync.getCached`; defensiver
   Read — leerer Pool ⇒ «fehlen»).

### 12.2 Ausschreibung (`pm_ausschreibungsunterlagen.html`)

Leichte Verlinkung (keine Datenlogik):

- **Gewinner-Sicht**: In `VIEWS.idet` direkt unter der Bestell-Sektion (`_bstWinnerSektion`-Aufruf,
  :4414–4415) eine Hinweis-Karte «📑 Revisionsunterlagen — nach Lieferung/Montage Dossier erstellen»
  mit Button → `pm_revisionsunterlagen.html?objekt=<a.objektId>` (gleiche Guard: `a.status==='vergeben'
  && a.vergabe.winnerId===me.id`).
- **Planer-Sicht**: In `VIEWS.pvga` nach dem «vergeben»-Banner (:3560–3563) dieselbe Karte.

### 12.3 Service & Wartung (`sv_service.html`) — nur lesend

Die Sammel-Engine liest Service-Anlagen (Garantie-Tabelle + Wartungs-Anlagenliste, Kap. 8.2). Umgekehrt
KEINE Schreib-Kopplung in dieser Ausbaustufe (sv_service hat bereits den eigenen OA-Import).

### 12.4 Wareneingang (`if_wareneingang.html`) — Ausbaustufe

Optional später als 6. Quelle (frei erfasste Positionen mit `projekt.objektId`); im MVP nicht nötig, in
Kap. 21 als offener Punkt geführt.

---

## 13. Rollen & Rechte

`gema_auth.js`:

1. **MODULES** (Projektmanagement-Block :268–285) ergänzen:
   `{ key:'revisionsunterlagen', label:'Revisionsunterlagen', cat:'Projektmanagement' }`
2. **FILE_MAP** (:308–334): `'pm_revisionsunterlagen': 'revisionsunterlagen'`
   (`sys_revision_ansicht` bewusst NICHT — Kap. 11.3.)
3. **DEFAULT_ROLES**:
   - Planer-Rollen + Admin + Abteilungsleiter: automatisch via `_allPerms` (:343).
   - `role_unternehmer` (:354): `revisionsunterlagen: {read:true, write:true, admin:false}` — der
     Gewinner-Unternehmer erstellt das Dossier oft selbst.
   - `role_bauherrschaft` (:406) und `role_architekt` (:353): `{read:true, write:false, admin:false}`.
   - Lieferanten-Rollen: KEIN Modul-Recht nötig (arbeiten im eigenen Dashboard; `reva:`-Pool wird dort
     direkt gebunden).
4. **Permission-Backfill**: läuft automatisch — `_mergeWithDefaults` (:108–122) ergänzt den neuen Key bei
   bestehenden Cloud-Rollen (KRITISCH-Abschnitt in CLAUDE.md «Permission-Backfill»). Nichts weiter zu tun,
   aber im Test verifizieren (bestehende Cloud-Rolle ohne Key → Zugriff nach Deploy).

---

## 14. Notifikationen (neue EVENT_KEYS in `gema_notify.js`)

| Event-Key | Modul | Default | Empfänger | Link |
|---|---|---|---|---|
| `revision_unterlagen_anfrage` | revisionsunterlagen | on | Lieferant (`user.lieferantId`-Match, Fallback Lieferanten-Org) | `sys_lieferant_dashboard.html?tab=revision` |
| `revision_unterlagen_erhalten` | revisionsunterlagen | on | Anforderer (`empfaengerUserId`) | `pm_revisionsunterlagen.html?d=<id>` |
| `revision_projektabschluss` | revisionsunterlagen | on | `role_planer` **+** Org (beide gesetzt!) | `pm_revisionsunterlagen.html?objekt=<id>` |
| `revision_freigabe_erstellt` | revisionsunterlagen | off | Ersteller-Org-Planer (Info, optional) | `pm_revisionsunterlagen.html?d=<id>` |

Matching-Regel beachten: sind Rolle UND Org gesetzt, müssen **beide** passen (`gema_notify.js`
`_matchesUser` :401–410). EVENT_KEYS-Tabelle in CLAUDE.md ergänzen.

---

## 15. Default-Kapitelvorlagen (`REV_DEFAULT_VORLAGEN`)

Format je Kapitel: `Nr (generiert) · Titel · [autoQuellen]`. Ebene 2 eingerückt. Texte in Kap. 17.

### 15.1 `default_sanitaer` — «Sanitär (Betriebs- und Wartungsanleitung)»

```
 1  Projekt & Adressen                        [deckblatt]
 1.1  Objektangaben                           [deckblatt]
 1.2  Ersteller / Unternehmer                 []            (Text auto aus Org, editierbar)
 1.3  Am Bau Beteiligte                       [beteiligte]
 1.4  Lieferantenverzeichnis                  [lieferantenverzeichnis]
 2  Anlage- und Funktionsbeschrieb            []            (Einleitung: BKP-Gliederungsvorschlag 251/252+253/254/255)
 3  Auslegungsdaten / Technische Daten        [kennwerte, berechnungen]
 4  Abnahme-, Inbetriebnahme- & Prüfprotokolle [abnahmen]   (+ manuell: Druckprobe, Spülprotokoll, Desinfektion)
 5  Anlagekomponenten & Technische Unterlagen [anlagenliste, produktdok:datenblatt,
                                               produktdok:technische_zeichnung, produktdok:montageanleitung]
 6  Bedienungsanleitungen                     [produktdok:bedienungsanleitung]
 7  Wartung & Betrieb                         []
 7.1  Einleitung Selbstkontrolle              [textbaustein:wartung_einleitung]
 7.2  Zuständigkeit Wasserhygiene             [textbaustein:zustaendigkeit_hygiene]
 7.3  Vorgehen bei Abwesenheiten              [textbaustein:abwesenheiten]
 7.4  Wartungs-Checklisten und Intervalle     [wartungstabelle]
 7.5  Wartungsanleitungen der Lieferanten     [produktdok:wartungsanleitung]
 7.6  Merkblatt Suissetec                     []            (manueller PDF-Upload, Platzhalter-Hinweis)
 7.7  Kontrollblätter                         [kontrollblatt]
 8  Konformität & Garantien                   [produktdok:konformitaetserklaerung, produktdok:zertifikat, garantie]
 9  Bewilligungen                             []            (manuell)
10  Schemata                                  [produktdok:schema]   (+ manuell: Anlageschema, Elektroschema)
11  Pläne / Revisionspläne                    []            (manuell; Hinweis «digital via Freigabe-Link»)
12  Diverses                                  []
```

### 15.2 `default_heizung` — «Heizung»

```
 1  Projekt & Adressen (1.1–1.4 wie Sanitär)
 2  Anlagebeschrieb (Wärmeerzeugung / Wärmeverteilung / Wärmeabgabe)      []
 3  Auslegungsdaten (Heizlast, Wärmegruppen, Ausdehnungsgefäss,
    Pumpen-Auslegung, Ventil-Einstellwerte hydraulischer Abgleich)        [kennwerte, berechnungen]
 4  Inbetriebnahme-, Einregulier- & Abnahmeprotokolle                     [abnahmen]
 5  Anlagekomponenten & Technische Unterlagen                             [anlagenliste, produktdok:datenblatt,
                                                                           produktdok:technische_zeichnung,
                                                                           produktdok:montageanleitung]
 6  Bedienungsanleitungen (Regelung/Steuerung)                            [produktdok:bedienungsanleitung]
 7  Wartung & Betrieb                                                     []
 7.1  Einleitung                                                          [textbaustein:wartung_einleitung]
 7.2  Wartungs-Checklisten und Intervalle                                 [wartungstabelle]
 7.3  Wartungsanleitungen der Lieferanten                                 [produktdok:wartungsanleitung]
 7.4  Kontrollblätter                                                     [kontrollblatt]
 8  Konformität & Garantien                                               [produktdok:konformitaetserklaerung,
                                                                           produktdok:zertifikat, garantie]
 9  Bewilligungen (Feuerungskontrolle/Luftreinhaltung, Tankanlagen)       []
10  Schemata (Prinzipschema, Elektroschema, MSR)                          [produktdok:schema]
11  Pläne / Revisionspläne                                                []
12  Diverses                                                              []
```

### 15.3 `default_lueftung` — «Lüftung / Klima»

```
 1  Projekt & Adressen (1.1–1.4 wie Sanitär)
 2  Anlagebeschrieb (Geräte, Zonen, Betriebszeiten)                       []
 3  Auslegungsdaten (Volumenströme, h,x-Auslegung, SFP)                   [kennwerte, berechnungen]
 4  Mess-, Einregulier- & Abnahmeprotokolle (Luftmengen, Dichtheit)       [abnahmen]
 5  Anlagekomponenten & Technische Unterlagen                             [anlagenliste, produktdok:datenblatt,
                                                                           produktdok:technische_zeichnung,
                                                                           produktdok:montageanleitung]
 6  Bedienungsanleitungen (Monobloc, Steuerung/MSR)                       [produktdok:bedienungsanleitung]
 7  Wartung & Hygiene (Filterwechselplan; Hinweis SWKI VA104-01/VDI 6022) []
 7.1  Einleitung                                                          [textbaustein:wartung_einleitung]
 7.2  Wartungs-/Filterwechsel-Checklisten                                 [wartungstabelle]
 7.3  Wartungsanleitungen der Lieferanten                                 [produktdok:wartungsanleitung]
 7.4  Kontrollblätter                                                     [kontrollblatt]
 8  Brandschutz (Brandschutzklappen-Liste, Prüfprotokolle)                []            (manuell)
 9  Konformität & Garantien                                               [produktdok:konformitaetserklaerung,
                                                                           produktdok:zertifikat, garantie]
10  Schemata (Anlagenschema, Elektro/MSR)                                 [produktdok:schema]
11  Pläne / Revisionspläne                                                []
12  Diverses                                                              []
```

### 15.4 `default_allgemein` — Minimalgerüst

```
 1  Projekt & Adressen        [deckblatt, beteiligte, lieferantenverzeichnis]
 2  Dokumente & Unterlagen    [anlagenliste, produktdok:datenblatt, produktdok:bedienungsanleitung,
                               produktdok:wartungsanleitung, produktdok:konformitaetserklaerung, garantie]
 3  Protokolle                [abnahmen]
 4  Pläne & Schemata          [produktdok:schema]
 5  Diverses                  []
```

(`elektro`/`spenglerei` starten mit `default_allgemein`; eigene Vorlagen später — offener Punkt Kap. 21.)

---

## 16. Wartungs-Checklisten-Katalog (`REV_WARTUNG_KATALOG`) — Default-Zeilen

Format: `{ gruppe, zeilen: [ [Anlageteil, Arbeit, A, B, C, Intervall] ] }` — A = Selbstkontrolle,
B = Fachmann, C = Service-/Wartungsvertrag. Quelle: beide Kundenvorlagen, dedupliziert/bereinigt;
Heizung/Lüftung fachlich analog ergänzt. Im Dossier als editierbare Tabellen (Zeilen löschen/ergänzen).

### 16.1 `sanitaer`

**Allgemeine Sanitärapparate**
| Anlageteil | Arbeit | A | B | C | Intervall |
|---|---|---|---|---|---|
| Dusch-/Badewannen | Ablauffunktion prüfen | x | | | ½-jährlich |
| Dusch-/Badewannen | Kitt-/Silikonfugen: Risse, Ablösungen, Schimmel — undichte Fugen sofort erneuern | x | | | ½-jährlich |
| Klosettanlagen | Dichtheit kontrollieren (Kalkrand = undicht); Wandanschlussfuge | x | | | jährlich |
| Spülkästen (UP) | Spülmenge kontrollieren | | x | | jährlich |
| Waschtische | Ablauffunktion, Wandbefestigung, Wandanschlussfuge, Oberfläche | x | | | jährlich |
| Wand-/Standarmaturen | Neoperl-Mischdüsen kontrollieren, reinigen/ersetzen (bei zu wenig Druck/Menge) | x | | | ½-jährlich |
| Urinal | Spül-/Ablauffunktion, Wandanschlussfuge | x | | | ½-jährlich |
| Küchen (Spültisch + Brauseschlauch) | Sifon & Anschlussverschraubungen auf Dichtheit, Auszugsbrause prüfen | x | | | monatlich–½-jährlich |
| Gartenventile (nicht frostsicher) | vor der Frostphase absperren und entleeren | x | | | jährlich im Herbst |
| Gartenventile (frostsicher) | Durchspülung sicherstellen | x | | | jährlich |

**Ver- und Entsorgungsapparate**
| Anlageteil | Arbeit | A | B | C | Intervall |
|---|---|---|---|---|---|
| Wassererwärmer | Temperatur prüfen (60 °C) | x | | | jährlich |
| Wassererwärmer | Wasseranschluss auf Dichtheit kontrollieren | x | | | ½-jährlich |
| Wassererwärmer | Entkalkung | | | x | ca. alle 2–4 Jahre |
| Zirkulationspumpe | Funktionskontrolle (Pumpe in Betrieb?) | x | | | jährlich |
| Abwasserhebeanlage | Kanalgase melden (Achtung: können tödlich sein), Schachtböden reinigen | x | | x | kontinuierlich / jährlich |
| Abwasserhebeanlage | Schachtdeckel gas-/wasserdicht (Schrauben, Dichtung) | x | | | jährlich |
| Abwasserhebeanlage | Wartung gemäss Betriebs- und Wartungsunterlagen des Lieferanten | | | x | jährlich |
| Frostschutz-/Heizband | Elektroanschluss (Stecker/Kabel), Funktionskontrolle Aufheizung | x | | x | jährlich im Herbst |
| Nasslöschposten | Kastentüre, Vollständigkeit, Schlauch/Feuerhahn, Dichtheit | x | x | | jährlich |
| Handfeuerlöscher | vorhanden / Funktionskontrolle | x | | x | ½-jährlich / jährlich |
| Druckerhöhungsanlage | Elektro-/Wasseranschluss prüfen; Wartung gem. Lieferanten-Unterlagen | x | | x | ½-jährlich / jährlich |
| Hygienespülung | Funktion/Programm kontrollieren | x | | | ½-jährlich |
| Enthärtungsanlage | Salzvorrat, Härte-Kontrolle; Service gem. Lieferant | x | | x | monatlich / jährlich |

**Roharmaturen**
| Anlageteil | Arbeit | A | B | C | Intervall |
|---|---|---|---|---|---|
| Absperrarmaturen | Funktion, einmal jährlich betätigen (Festsitzen verhindern); Spindelabdichtung | x | x | | jährlich |
| Druckreduzierventil | Manometer, Filtersatz reinigen/ersetzen, Verschraubungen dicht | x | x | | jährlich |
| Feinfilter | Filtersatz ersetzen / rückspülen (falls vorhanden) | x | x | | jährlich / monatlich |
| Sicherheitsventil | Funktionskontrolle, durchspülen (Anlüftmutter); Dauerdurchfluss melden | x | x | | ½-jährlich |
| Wasserzähler | Funktions-/Dichtheitskontrolle | x | | | jährlich |

**Bodenabläufe / Entwässerung**
| Anlageteil | Arbeit | A | B | C | Intervall |
|---|---|---|---|---|---|
| Bodenabläufe/Trichter | reinigen; ohne stetigen Zulauf Wasser nachfüllen (Geruch) | x | | | ca. alle 3 Wochen–½-jährlich |
| Bodenduschen/-rinnen | spülen, Sifon/Gitterrost reinigen, Fugen prüfen | x | | | ½-jährlich |
| Dachentwässerung | Einläufe/Notüberläufe kontrollieren und reinigen; Leitungen durchspülen | x | | x | ½-jährlich / jährlich |
| Kontrollschacht | Deckel: Schrauben/Dichtung (gas-/wasserdicht) | x | | | jährlich |
| Schlammsammler | kontrollieren / reinigen | x | | x | ½-jährlich |

### 16.2 `heizung` (fachlich ergänzt)

| Anlageteil | Arbeit | A | B | C | Intervall |
|---|---|---|---|---|---|
| Wärmeerzeuger (Kessel/WP) | Service gemäss Hersteller-Wartungsanleitung | | | x | jährlich |
| Anlagedruck | Manometer prüfen, ggf. nachfüllen (Wasserqualität beachten) | x | | | monatlich |
| Ausdehnungsgefäss | Vordruck prüfen | | x | | jährlich |
| Sicherheitsventil | Funktionskontrolle (Anlüften), Abblaseleitung frei | x | x | | jährlich |
| Heizkörper/FBH | entlüften, Ventile betätigen | x | | | jährlich (Heizbeginn) |
| Umwälzpumpen | Funktion/Geräusche kontrollieren | x | | | jährlich |
| Regelung | Heizkurve/Sollwerte, Sommer-/Winterumschaltung prüfen | x | x | | jährlich |
| Brenner/Abgas | Feuerungskontrolle gemäss kantonaler Vorgabe | | | x | gem. Vorgabe |
| Wasseraufbereitung | Nachfüllwasser-Qualität dokumentieren (SWKI BT 102-01) | | x | | bei Nachfüllung |

### 16.3 `lueftung` (fachlich ergänzt)

| Anlageteil | Arbeit | A | B | C | Intervall |
|---|---|---|---|---|---|
| Filter Zu-/Abluft | Kontrolle Differenzdruck/Verschmutzung, Wechsel | x | x | | ½-jährlich bzw. n. Anzeige |
| Monobloc/Ventilatoren | Sicht-/Geräuschkontrolle, Kondensatablauf prüfen | x | | | ½-jährlich |
| WRG (Rotor/Platten) | Zustand/Funktion, Reinigung | | x | | jährlich |
| Aussen-/Fortluftgitter | frei/sauber | x | | | ½-jährlich |
| Brandschutzklappen | Funktionsprüfung dokumentieren | | x | x | gem. Herstellervorgabe |
| Kanalnetz/Auslässe | Sichtkontrolle Hygiene (SWKI VA104-01) | | x | | jährlich |
| Steuerung/MSR | Betriebszeiten, Sollwerte, Alarme prüfen | x | x | | jährlich |

(`elektro`/`spenglerei`/`allgemein`: leerer Katalog → Tabelle mit 3 Leerzeilen.)

---

## 17. Textbausteine (`REV_TEXTBAUSTEINE`)

Kanonische Defaults (aus den Vorlagen destilliert; pro Dossier editierbar):

- **`wartung_einleitung`**: «Die meisten Funktionsstörungen bei Haustechnikanlagen treten dort auf, wo
  periodische Kontrolle und entsprechende Wartung fehlen. Viele dieser Überprüfungen können vom
  Eigentümer, von der Verwaltung oder vom Hauswart selbst durchgeführt werden — gewusst wie, wo und wann.
  Die folgenden Checklisten geben die zu prüfenden Anlageteile, die zuständige Instanz (A = Selbstkontrolle,
  B = Fachmann, C = Service-/Wartungsvertrag) und die empfohlenen Intervalle vor. Vorbeugen ist besser als
  reparieren.»
- **`zustaendigkeit_hygiene`**: «Eigentümer/Betreiber von Gebäudeinstallationen, die Trinkwasser an
  Endabnehmer wie Wohnungsmieter, Angestellte, Kunden oder Hotelgäste abgeben, gelten als Wasserversorgung
  (Art. 2 Abs. c TBDV). Darunter fallen auch gewerbliche Betriebe (Restaurants, Fitnesscenter, Arztpraxen
  usw.), die in einem Gebäude eingemietet sind und ihrerseits Trinkwasser abgeben. Eigentümer/Betreiber
  solcher Gebäude-Trinkwasserinstallationen sind zur Selbstkontrolle verpflichtet und für die Qualität des
  abgegebenen Trinkwassers verantwortlich (Art. 26 LMG). Als Grundlage dient die SVGW-Richtlinie W3/E4,
  Ausgabe März 2021.»
- **`abwesenheiten`**: Einleitungssatz «Auszug aus der SVGW-Richtlinie W3/E3 (Massnahmen bei
  Stagnation):» + Tabelle (wird als `tabelle`-Eintrag miterzeugt):

| Dauer der Abwesenheit | Massnahmen zu Beginn | Massnahmen bei Ende |
|---|---|---|
| 4 Stunden bis 3 Tage | Keine | Trinkwasser etwas vorlaufen lassen |
| Bis 7 Tage | Keine | Trinkwasser vorlaufen lassen bis Temperaturkonstanz |
| Bis 4 Wochen | Stockwerk-/Apparategruppen-Absperrung schliessen ODER Absperrventile an der Verteilbatterie schliessen ODER periodische Trinkwassererneuerung sicherstellen | Kalt: alle Entnahmestellen voll geöffnet bis Temperaturkonstanz fliessen lassen (mehrere gleichzeitig). Warm: bei geringem Durchfluss bis Temperaturkonstanz |
| Länger dauernd / saisonal | wie oben ODER Hausanschluss durch Wasserversorgung abtrennen lassen | wie oben; Wiederanschluss durch Versorger, anschliessend spülen |
| Nicht mehr benutzte Installation | Leitungen unmittelbar beim Abzweig trennen und mit Stopfen/Kappen verschliessen (andere Verschlussarten unzulässig) | — |

---

## 18. Engine & Tests

### 18.1 Engine-Block (`/*ENGINE-START*/ … /*ENGINE-END*/` in `pm_revisionsunterlagen.html`, DOM-frei)

Konstanten: `REV_DEFAULT_VORLAGEN`, `REV_WARTUNG_KATALOG`, `REV_TEXTBAUSTEINE`, `REV_PFLICHT_DOKTYPEN`,
`REV_BW_LABELS`.
Funktionen (pure, Node-testbar):

```
revNeuesDossier(vorlage, ctx)                 // Kapitel instanziieren + Deckblatt-Vorschlag
revDeckblattVorschlag(objekt, beteiligte, org, user)
revProdukteSammeln(ctx)                       // ctx = {objektId, bestellungen, oas, vormerkungen,
                                              //        chosenByKat, ausschreibungen} → Produktliste (8.1)
revSammeln(dossier, ctx)                      // → Liste neuer Auto-Einträge je Kapitel (8.2)
revMergeAddOnly(dossier, gesammelt)           // Merge-Regeln (8.4), mutiert Kopie, liefert Diff-Summary
revKapitelRenummerieren(kapitel)              // '1', '1.1', … aus ebene-Folge
revVollstaendigkeit(dossier)                  // {pflichtTotal, vorhanden, fehlend:[{produkt,dokTyp,…}]}
revDokTypNorm(t)                              // Alias-Map (identisch zu GemaProdukte.normDokTyp)
revTokenNeu()                                 // 48 Hex (crypto.getRandomValues, Fallback Math.random-frei
                                              //  NICHT nötig — crypto ist in allen Ziel-Browsern da)
revSanitizeForShare(dossier)                  // Kap. 11.2 Schritt 4 (klientenseitige Referenz-Impl.)
```

### 18.2 Tests

- **Node-Test** (Muster bestehender Engine-Tests): Engine-Block per Regex extrahieren + `eval`;
  Fälle: Dedup über 5 Quellen (produktId vs. name-Fallback) · Merge respektiert
  `manuellGeaendert`/`ausgeblendet` · Platzhalter→ok-Auflösung · Renummerierung mit Ebene-2-Ketten ·
  Vollständigkeit · DokTyp-Alias · Sanitize entfernt token/dataUrl/ausgeblendete.
- **Playwright-Smoke** (localStorage-Seeding, externe Hosts geblockt — Muster Bestellungen-/
  Wareneingang-Suites): Planer seeden mit Objekt + 1 Bestellung + 1 beantworteter OA + 1 Produkt mit 2
  Doks → Dossier erstellen → Kapitel gefüllt, Platzhalter «fehlend» sichtbar → Anfrage erstellen →
  als Lieferant Dashboard-Tab `revision` öffnen, Dok hochladen (GemaStorage gemockt), erledigt senden →
  als Planer «↻» → Platzhalter aufgelöst → PDF-Print-Fenster öffnet (window.open-Stub) → Freigabe-Dialog
  erzeugt Token + QR-Container. Rollen-Check: Monteur sieht «Kein Zugriff»; Bauherrschaft read-only.
- Test-Hooks exportieren: `window._revHooks = { engine-Funktionen, getDossiers, … }`.

---

## 19. Registrierungs-Checkliste (bei Umsetzung Punkt für Punkt abhaken)

1. ☐ `gema_auth.js`: MODULES + FILE_MAP + DEFAULT_ROLES (Kap. 13) — Backfill testen.
2. ☐ `gema_notify.js`: 4 EVENT_KEYS (Kap. 14).
3. ☐ `index.html`: PM-Kachel `<a class="mod-card" href="pm_revisionsunterlagen.html"
   data-module="revisionsunterlagen">…` im PM-Block (~:561 ff.); Zähler anpassen — Badge «16 Module»
   :559 → 17, Filter-Pill `#cnt-plan` :504 (steht heute inkonsistent auf 13) → +1, Hero-Zahl :430
   prüfen. (Zähler sind statisch — bei Umsetzung Ist-Stand verifizieren.)
4. ☐ `sw.js`: `CACHE_NAME` bump (aktuell `gema-v231`, :2) + `pm_revisionsunterlagen.html`,
   `gema_revision_pdf.js` in CACHE_FILES (:3–31). `sys_revision_ansicht.html` NICHT cachen.
5. ☐ `gema_recent.js`: `PAGE_LABELS['pm_revisionsunterlagen'] = 'Revisionsunterlagen'` (:10–91).
6. ☐ `netlify/functions/rev-share.js` + optionaler `/api/rev-share`-Redirect in `netlify.toml`.
7. ☐ `sys_lieferant_dashboard.html`: Tab + Dok-Sektion (Kap. 6); `sys_produktkatalog.html`: Enum.
8. ☐ `pm_objekte.html`: Abschluss-Trigger + Badge (Kap. 12.1).
9. ☐ `pm_ausschreibungsunterlagen.html`: 2 Hinweis-Karten (Kap. 12.2).
10. ☐ `CLAUDE.md`: Modul-Abschnitt + Helper-Tabelle (`gema_revision_pdf.js`) + EVENT_KEYS-Tabelle +
    Tabelle «Migrierte Module» (`revd:`/`revv:`/`reva:`) — Entwurf in Kap. 22.
11. ☐ CLAUDE.md-Batch-Checkliste einhalten: GemaDialog statt confirm/prompt (danger bei Löschen),
    `type="text" inputmode="decimal"` falls Zahlenfelder, keine Excel-/Vorlagen-Verweise im UI-Text,
    Umlaute im UI / keine Umlaute in Dateinamen, `.g-nav`-Muster, kompakter Hero, Safe-Area-Metas,
    `GemaSync.getCached`-Lesepfad, Sticky-Offsets `calc(72px + env(safe-area-inset-top))`.

---

## 20. Umsetzungs-Reihenfolge (empfohlene Phasen)

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **1 — Fundament** | Kap. 5 (DOK_TYPEN + Storage-Upload + addDokument-Pfad), Kap. 6.1 (Dashboard-Dok-Sektion) | Lieferanten können vollständige Revisions-Sets pro Produkt pflegen |
| **2 — MVP Modul** | Kap. 4 + 7 + 8 (Pools, UI, Sammel-Engine, Merge), Kap. 13/14/19 (Rechte, Notifys, Registrierung), Kap. 10.1 (Struktur-PDF), Kap. 12.1/12.2 (Trigger) | Dossier automatisch erstellen, manuell ergänzen, als gebrandetes PDF drucken |
| **3 — Anfragen** | Kap. 9 + 6.2 (Anfrage-Pool, Dashboard-Tab, Rückfluss) | Fehlende Unterlagen per Klick einholen |
| **4 — Freigabe/QR** | Kap. 11 (Function, Viewer, QR-Dialog), Kap. 10.2 (Komplett-PDF) | Bauherr scannt QR und sieht alles; ein Gesamt-PDF inkl. Anhängen |

Jede Phase ist einzeln shippbar; Phase 2 ohne Phase 1 ist möglich (dann eben viele Platzhalter), aber
Phase 1 zuerst maximiert den Sofortnutzen.

---

## 21. Entscheide, Annahmen & offene Punkte

**Getroffene Entscheide** (bei Bedarf vom User korrigierbar, Umsetzung startet mit diesen):

1. **Dossier pro Objekt + Gewerk** (nicht eines pro Objekt): entspricht der Praxis (Sanitär-Dossier vom
   Sanitär, Heizungs-Dossier vom Heizungsbauer); mehrere Dossiers pro Objekt erlaubt.
2. **Gewerk-Enum wiederverwendet** aus `pm_abnahme.html` (`AB_GEWERKE`) statt neuem Enum — Konsistenz.
3. **Dokumente bleiben am Produkt** (Katalog) statt an der Anfrage — einmal hochgeladen, profitieren alle
   Projekte; Direkt-Upload nur als Fallback für produktlose Positionen.
4. **Kein neues Datei-Präfix**: `pm_` fürs Modul, `sys_` für den öffentlichen Viewer.
5. **QR-Zugriff über Token + Netlify-Function** (Server liest mit Service-Key) statt anon-RLS-Öffnung —
   konsistent mit «GEMA Secure v1»; Fallback statisches PDF im Bucket (11.4).
6. **pdf-lib als neue CDN-Dependency** nur für das Komplett-PDF (Phase 4) — Struktur-PDF (Phase 2) kommt
   ohne aus.
7. **Vormerkungen-Quelle** wird genutzt, aber als gerätegebunden gekennzeichnet (Pool ist heute nur
   localStorage — Migration dieses Pools ist NICHT Teil dieses Konzepts).
8. Elektro/Spenglerei starten mit der Allgemein-Vorlage (keine fachspezifischen Defaults in v1).

**Offene Punkte / Ausbaustufen**:

- Wareneingang als 6. Produktquelle (Kap. 12.4).
- E-Mail-Einladung nicht-registrierter Lieferanten direkt aus der Anfrage (9.4).
- Migration bestehender Base64-Produktdokumente nach GemaStorage (Bestand bleibt vorerst Base64).
- Automatischer PDF-Anhang der Abnahmeprotokolle (heute Verweis + manueller Upload).
- Versionierung des Dossiers (Änderungshistorie) — aktuell nur `geaendertAm`.

---

## 22. CLAUDE.md-Ergänzung (Entwurf — bei Umsetzung einfügen und an Ist-Stand anpassen)

> ### Revisionsunterlagen (pm_revisionsunterlagen.html)
>
> Übergabedossier zum Projektabschluss — sammelt automatisch die Unterlagen aller im Projekt verbauten
> Produkte (Bestellungen, beantwortete Offertanfragen, Vormerkungen, Anlagenwahl, Ausschreibungs-
> Positionen) in eine anpassbare Kapitelstruktur (Default-Vorlagen Sanitär/Heizung/Lüftung/Allgemein,
> Gewerk-Enum aus pm_abnahme). Kanonische Produkt-Dokumenttypen: `GemaProdukte.DOK_TYPEN` +
> `normDokTyp()` (Alias für Altdaten `anleitung/montage/konformitaet/bild`); Dok-Uploads laufen über
> `addDokument`/`removeDokument` (NIE `updateProdukt` — das würde die Verifizierung zurücksetzen) und
> nach GemaStorage (`produkte/<lieferantId>/doks`), Base64 nur Fallback ≤ 2.5 MB.
> - **Pools (moduleKey `revisionsunterlagen`)**: Dossier `revd:` → `gema_rev_pool_v1` (org-intern,
>   Einträge nur mit Storage-URLs — nie Base64 im Record) · Vorlagen `revv:` → `gema_rev_vorl_pool_v1` ·
>   Anfragen `reva:` → `gema_rev_anfr_pool_v1` (**cross-org**, nur `saveRecord` — Muster GemaBest).
>   Event `gema-revision-changed`.
> - **Merge-Regeln**: Auto-Einträge ADD-ONLY; `manuellGeaendert`/`ausgeblendet` wird nie angefasst;
>   Platzhalter (`status:'fehlend'`) lösen sich auf, sobald das Produkt-Dokument existiert; entfallene
>   Quellen markieren statt löschen.
> - **Anfragen-Workflow**: Vollständigkeits-Matrix → «anfordern» bündelt pro Lieferant+Produkt →
>   `revision_unterlagen_anfrage` (Empfänger via `user.lieferantId`, Fallback Lieferanten-Org) →
>   Lieferanten-Dashboard-Tab `?tab=revision` → Upload aufs Produkt → `revision_unterlagen_erhalten`.
> - **Export**: `gema_revision_pdf.js` (`GemaRevisionPDF.exportPrint`, Branding `org.settings.pdfFarben` +
>   `org.logoVector||logo`, Muster gema_schaden_pdf) · Komplett-PDF via pdf-lib (lazy CDN) mit
>   `copyPages`-Merge der Anhänge.
> - **Freigabe/QR**: `dossier.freigabe.token` → öffentlicher Viewer `sys_revision_ansicht.html?t=<token>`
>   (KEIN gema_auth.js, nicht in FILE_MAP/sw.js!) über `netlify/functions/rev-share.js` (Service-Key,
>   sanitisiert: kein token/keine userIds/keine dataUrl/keine ausgeblendeten Einträge).
> - **Trigger**: Objekt-Status → `abgeschlossen` (pm_objekte) fragt per GemaDialog nach Dossier-Erstellung
>   + pusht `revision_projektabschluss` (role_planer + Org); Hinweis-Karten nach Vergabe in
>   pm_ausschreibungsunterlagen (Planer `pvga`, Gewinner `idet`).
> - Rechte: Planer via `_allPerms`, Unternehmer r/w, Bauherrschaft/Architekt read. Registriert in
>   gema_auth (MODULES `revisionsunterlagen`, FILE_MAP `pm_revisionsunterlagen`), gema_notify (4 Keys),
>   index.html (PM), sw.js, gema_recent.

---

*Ende des Konzepts. Analysierte Quelldokumente: «Vorlage_Revisionsunterlagen.doc» (ROSENMUND Haustechnik,
Betriebs- und Wartungsanleitung Sanitäranlagen) und «Revisionsunterlagen.docx» (Jäggi Vollmer GmbH,
Wartungsanleitung) — Strukturen vollständig in Kap. 2, Inhalte destilliert in Kap. 15–17.*
