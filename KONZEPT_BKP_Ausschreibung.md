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

### 3.3 Kompletter BKP-Baum (Schweizer Standard nach eBKP / BKP 2)

Quelle: Offizielle BKP-Zusammenfassung aus CRBX-Export (Jäggi Vollmer GmbH, 2026.0207). Der Planer kann alles anpassen (Nummern, Titel, Positionen hinzufügen/entfernen). Wo `modulKey` gesetzt ist = externe Lieferanten-Offerte nötig → Dialog öffnet sich.

**WICHTIG:** Bei der ersten Nutzung wird nur das freigeschaltete Gewerk angezeigt (Standard: 25 Sanitäranlagen). Die anderen Gewerke (23, 24 etc.) sind im Baum vorhanden aber ausgegraut/gesperrt bis lizenziert.

```javascript
var BKP_KOMPLETT = [
  // ═══════════════════════════════════════════════════════
  // 0 — GRUNDSTÜCK
  // ═══════════════════════════════════════════════════════
  { id:'0', titel:'Grundstück', kinder:[
    { id:'00', titel:'Vorstudien', kinder:[
      { id:'000', titel:'Übergangsposition' },
      { id:'001', titel:'Studien zur Grundstückbeurteilung, Machbarkeitsstudie' },
      { id:'002', titel:'Vermessung, Vermarchung' },
      { id:'003', titel:'Geotechnische Gutachten' },
      { id:'004', titel:'Quartierplankosten, Richtplankosten' },
      { id:'005', titel:'Provisorische Baugespanne' },
      { id:'006', titel:'Umweltverträglichkeitsprüfung' },
      { id:'009', titel:'Übriges' }
    ]},
    { id:'01', titel:'Grundstück- bzw. Baurechterwerb', kinder:[
      { id:'011', titel:'Grundstückerwerb' },
      { id:'012', titel:'Baurechterwerb' },
      { id:'013', titel:'Brandmauereinkauf' },
      { id:'018', titel:'Sanierung Altlasten' },
      { id:'019', titel:'Übriges' }
    ]},
    { id:'02', titel:'Nebenkosten zu Grundstück resp. Baurechterwerb', kinder:[
      { id:'021', titel:'Handänderungssteuer' },
      { id:'022', titel:'Notariatskosten' },
      { id:'023', titel:'Grundbuchgebühren' },
      { id:'024', titel:'Anwaltskosten, Gerichtskosten' },
      { id:'025', titel:'Vermittlungsprovisionen' },
      { id:'029', titel:'Übriges' }
    ]},
    { id:'03', titel:'Abfindungen, Servitute, Beiträge', kinder:[
      { id:'031', titel:'Abfindungen an Mieter und Pächter' },
      { id:'032', titel:'Inkonvenienzentschädigungen' },
      { id:'033', titel:'Errichtung von Servituten' },
      { id:'034', titel:'Ablösung von Servituten' },
      { id:'035', titel:'Wirtschaftspatente' },
      { id:'036', titel:'Beiträge Melioration' },
      { id:'037', titel:'Beiträge Güterzusammenlegung' },
      { id:'038', titel:'Perimeterbeiträge' },
      { id:'039', titel:'Übriges' }
    ]},
    { id:'04', titel:'Finanzierung vor Baubeginn', kinder:[
      { id:'041', titel:'Errichten von Hypotheken auf Grundstück' },
      { id:'042', titel:'Hypothekarzinsen' },
      { id:'043', titel:'Baurechtszinsen' },
      { id:'044', titel:'Bankzinsen' },
      { id:'045', titel:'Eigenkapitalzinsen' },
      { id:'046', titel:'Grundstücksteuern' },
      { id:'048', titel:'Versicherungen bis Baubeginn' },
      { id:'049', titel:'Übriges' }
    ]},
    { id:'05', titel:'Erschliessung durch Leitungen (ausserhalb Grundstück)', kinder:[
      { id:'051', titel:'Erdarbeiten' },
      { id:'052', titel:'Kanalisationsleitungen' },
      { id:'053', titel:'Elektroleitungen' },
      { id:'054', titel:'Heizungs-, Lüftungs-, Klima-, Kälteleitungen' },
      { id:'055', titel:'Sanitärleitungen' },
      { id:'056', titel:'Nebenarbeiten' },
      { id:'059', titel:'Übriges' }
    ]},
    { id:'06', titel:'Erschliessung durch Verkehrsanlagen ausserhalb Grundstück', kinder:[
      { id:'061', titel:'Strassen' },
      { id:'062', titel:'Bahn' },
      { id:'063', titel:'Wasserwege' },
      { id:'069', titel:'Übriges' }
    ]},
    { id:'07', titel:'Reserve' },
    { id:'08', titel:'Reserve' },
    { id:'09', titel:'Honorare', kinder:[
      { id:'091', titel:'Architekt' },
      { id:'092', titel:'Bauingenieur' },
      { id:'093', titel:'Elektroingenieur' },
      { id:'094', titel:'HLKK-Ingenieur' },
      { id:'095', titel:'Sanitäringenieur' },
      { id:'096', titel:'Spezialisten' },
      { id:'099', titel:'Übriges' }
    ]}
  ]},

  // ═══════════════════════════════════════════════════════
  // 1 — VORBEREITUNGSARBEITEN
  // ═══════════════════════════════════════════════════════
  { id:'1', titel:'Vorbereitungsarbeiten', kinder:[
    { id:'10', titel:'Bestandesaufnahmen, Baugrunduntersuchungen', kinder:[
      { id:'101', titel:'Bestandesaufnahmen' },
      { id:'102', titel:'Baugrunduntersuchungen' },
      { id:'103', titel:'Grundwassererhebungen' },
      { id:'109', titel:'Übriges' }
    ]},
    { id:'11', titel:'Räumungen, Terrainvorbereitungen', kinder:[
      { id:'111', titel:'Rodungen' },
      { id:'112', titel:'Abbrüche' },
      { id:'113', titel:'Demontagen' },
      { id:'114', titel:'Erdbewegungen' },
      { id:'115', titel:'Bohr- und Schneidarbeiten' },
      { id:'119', titel:'Übriges' }
    ]},
    { id:'12', titel:'Sicherungen, Provisorien', kinder:[
      { id:'121', titel:'Sicherung vorhandener Anlagen' },
      { id:'122', titel:'Provisorien' },
      { id:'123', titel:'Unterfangungen' },
      { id:'124', titel:'Instandsetzungsarbeiten' },
      { id:'129', titel:'Übriges' }
    ]},
    { id:'13', titel:'Gemeinsame Baustelleneinrichtung', kinder:[
      { id:'131', titel:'Abschrankungen' },
      { id:'132', titel:'Zufahrten, Plätze' },
      { id:'133', titel:'Büro Bauleitung' },
      { id:'134', titel:'Unterkünfte, Verpflegungseinrichtungen' },
      { id:'135', titel:'Provisorische Installationen' },
      { id:'136', titel:'Kosten für Energie, Wasser und dgl.' },
      { id:'137', titel:'Provisorische Abschlüsse und Abdeckungen' },
      { id:'138', titel:'Sortierung Bauabfälle' },
      { id:'139', titel:'Übriges' }
    ]},
    { id:'14', titel:'Anpassungen an bestehende Bauten', kinder:[
      { id:'141', titel:'Terraingestaltung, Rohbau 1' },
      { id:'142', titel:'Rohbau 2' },
      { id:'143', titel:'Elektroanlagen' },
      { id:'144', titel:'Heizungs-, Lüftungs-, Klima und Kälteanlagen' },
      { id:'145', titel:'Sanitäranlagen' },
      { id:'146', titel:'Transportanlagen' },
      { id:'147', titel:'Ausbau 1' },
      { id:'148', titel:'Ausbau 2' },
      { id:'149', titel:'Übriges' }
    ]},
    { id:'15', titel:'Anpassungen an bestehende Erschliessungsleitungen', kinder:[
      { id:'151', titel:'Erdarbeiten' },
      { id:'152', titel:'Kanalisationsleitungen' },
      { id:'153', titel:'Elektroleitungen' },
      { id:'154', titel:'Heizungs-, Lüftungs-, Klima-, Kälteleitungen' },
      { id:'155', titel:'Sanitärleitungen' },
      { id:'156', titel:'Nebenarbeiten' },
      { id:'159', titel:'Übriges' }
    ]},
    { id:'16', titel:'Anpassungen an bestehende Verkehrsanlagen', kinder:[
      { id:'161', titel:'Strassen' },{ id:'162', titel:'Bahn' },{ id:'163', titel:'Wasserwege' },{ id:'169', titel:'Übriges' }
    ]},
    { id:'17', titel:'Spez. Fundationen, Baugrubensicherung, Grundwasserabdichtung', kinder:[
      { id:'171', titel:'Pfähle' },{ id:'172', titel:'Baugrubenabschlüsse' },{ id:'173', titel:'Aussteifungen' },
      { id:'174', titel:'Anker' },{ id:'175', titel:'Grundwasserabdichtungen' },{ id:'176', titel:'Wasserhaltung' },
      { id:'177', titel:'Baugrundverbesserungen' },{ id:'178', titel:'Nebenarbeiten' },{ id:'179', titel:'Übriges' }
    ]},
    { id:'18', titel:'Reserve' },
    { id:'19', titel:'Honorare', kinder:[
      { id:'191', titel:'Architekt' },{ id:'192', titel:'Bauingenieur' },{ id:'193', titel:'Elektroingenieur' },
      { id:'194', titel:'HLKK-Ingenieur' },{ id:'195', titel:'Sanitäringenieur' },{ id:'196', titel:'Spezialisten' },{ id:'199', titel:'Übriges' }
    ]}
  ]},

  // ═══════════════════════════════════════════════════════
  // 2 — GEBÄUDE (Hauptgruppe für Haustechnik)
  // ═══════════════════════════════════════════════════════
  { id:'2', titel:'Gebäude', kinder:[
    { id:'20', titel:'Baugrube', kinder:[
      { id:'201', titel:'Baugrubenaushub' },{ id:'209', titel:'Übriges' }
    ]},
    { id:'21', titel:'Rohbau 1', kinder:[
      { id:'211', titel:'Baumeisterarbeiten' },{ id:'212', titel:'Montagebau in Beton und vorfabriziertem Mauerwerk' },
      { id:'213', titel:'Montagebau in Stahl' },{ id:'214', titel:'Montagebau in Holz' },
      { id:'215', titel:'Montagebau als Leichtkonstruktionen' },{ id:'216', titel:'Natur- und Kunststeinarbeiten' },
      { id:'217', titel:'Schutzraumabschlüsse' },{ id:'219', titel:'Übriges' }
    ]},
    { id:'22', titel:'Rohbau 2', kinder:[
      { id:'221', titel:'Fenster, Aussentüren, Tore' },{ id:'222', titel:'Spenglerarbeiten' },
      { id:'223', titel:'Blitzschutz' },{ id:'224', titel:'Bedachungsarbeiten' },
      { id:'225', titel:'Spezielle Dichtungen und Dämmungen' },{ id:'226', titel:'Fassadenputze' },
      { id:'227', titel:'Äussere Oberflächenbehandlungen' },{ id:'228', titel:'Äussere Abschlüsse, Sonnenschutz' },
      { id:'229', titel:'Übriges' }
    ]},

    // ── 23 ELEKTROANLAGEN (lizenzpflichtig) ──
    { id:'23', titel:'Elektroanlagen', lizenz:'elektro', kinder:[
      { id:'231', titel:'Apparate Starkstrom' },{ id:'232', titel:'Starkstrominstallationen' },
      { id:'233', titel:'Leuchten und Lampen' },{ id:'234', titel:'Energieverbraucher' },
      { id:'235', titel:'Apparate Schwachstrom' },{ id:'236', titel:'Schwachstrominstallationen' },
      { id:'237', titel:'Gebäudeautomation' },{ id:'238', titel:'Bauprovisorien' },{ id:'239', titel:'Übriges' }
    ]},

    // ── 24 HEIZUNGS-, LÜFTUNGS-, KLIMA UND KÄLTEANLAGEN (lizenzpflichtig) ──
    { id:'24', titel:'Heizungs-, Lüftungs-, Klima und Kälteanlagen', lizenz:'hlkk', kinder:[
      { id:'240', titel:'Übergangsposition' },
      { id:'241', titel:'Zulieferung Energieträger, Lagerung' },
      { id:'242', titel:'Wärmeerzeugung' },
      { id:'243', titel:'Wärmeverteilung' },
      { id:'244', titel:'Lüftungsanlagen' },
      { id:'245', titel:'Klimaanlagen' },
      { id:'246', titel:'Kälteanlagen' },
      { id:'247', titel:'Spezialanlagen' },
      { id:'248', titel:'Dämmungen HLKK-Installationen' },
      { id:'249', titel:'Übriges' }
    ]},

    // ═══════════════════════════════════════════════════
    // 25 SANITÄRANLAGEN (Standard, immer freigeschaltet)
    // ═══════════════════════════════════════════════════
    { id:'25', titel:'Sanitäranlagen', lizenz:'sanitaer', kinder:[
      { id:'250', titel:'Übergangsposition' },
      { id:'251', titel:'Allgemeine Sanitärapparate', kinder:[
        { id:'251.0', titel:'Lieferung Sanitärapparate', istLieferung:true },
        { id:'251.1', titel:'Montage Sanitärapparate' }
      ]},
      { id:'252', titel:'Spezielle Sanitärapparate', kinder:[
        { id:'252.0', titel:'Lieferung Wasserzähler' },
        { id:'252.1', titel:'Montage Wasserzähler' },
        { id:'252.2', titel:'Lieferung Abluftventilatoren' },
        { id:'252.3', titel:'Montage Abluftventilatoren' },
        { id:'252.4', titel:'Lieferung Fettabscheider', modulKey:'fettabscheider', modulUrl:'sa_fettabscheider.html' },
        { id:'252.5', titel:'Montage Fettabscheider' },
        { id:'252.6', titel:'Lieferung Abwasserhebeanlage', modulKey:'hebeanlage', modulUrl:'sa_abwasserhebeanlage.html' },
        { id:'252.7', titel:'Montage Abwasserhebeanlage' },
        { id:'252.8', titel:'Lieferung Ölabscheider', modulKey:'oelabscheider', modulUrl:'sa_oelabscheider.html' },
        { id:'252.9', titel:'Montage Ölabscheider' }
      ]},
      { id:'253', titel:'Sanitäre Ver- und Entsorgungsapparate', kinder:[
        { id:'253.0', titel:'Lieferung Enthärtungsanlage', modulKey:'enthaertung', modulUrl:'sa_enthaertung.html' },
        { id:'253.1', titel:'Montage Enthärtungsanlage' },
        { id:'253.2', titel:'Lieferung Osmoseanlage', modulKey:'osmose', modulUrl:'sa_osmose.html' },
        { id:'253.3', titel:'Montage Osmoseanlage' },
        { id:'253.4', titel:'Lieferung Druckerhöhungsanlage', modulKey:'druckerhoehung', modulUrl:'sb_druckerhoehung.html' },
        { id:'253.5', titel:'Montage Druckerhöhungsanlage' },
        { id:'253.6', titel:'Lieferung Frischwasserstation', modulKey:'frischwasserstation', modulUrl:'sa_frischwasserstation.html' },
        { id:'253.7', titel:'Montage Frischwasserstation' },
        { id:'253.8', titel:'Lieferung Zirkulationspumpe', modulKey:'zirkulation' },
        { id:'253.9', titel:'Montage Zirkulationspumpe' }
      ]},
      { id:'254', titel:'Sanitärleitungen', kinder:[
        { id:'254.0', titel:'Kalt- und Warmwasser' },
        { id:'254.1', titel:'Schmutzwasser' },
        { id:'254.2', titel:'Regenwasser' },
        { id:'254.3', titel:'Lüftungsleitungen' },
        { id:'254.4', titel:'Armaturen' }
      ]},
      { id:'255', titel:'Dämmungen Sanitärinstallationen', kinder:[
        { id:'255.0', titel:'Kalt- und Warmwasser' },
        { id:'255.1', titel:'Schmutzwasser' },
        { id:'255.2', titel:'Regenwasser' }
      ]},
      { id:'256', titel:'Sanitärinstallationselemente' },
      { id:'257', titel:'Elektro- und Pneumatiktafeln' },
      { id:'258', titel:'Kücheneinrichtungen' },
      { id:'259', titel:'Übriges', kinder:[
        { id:'259.0', titel:'Planungshonorar' },
        { id:'259.1', titel:'Provisorien' },
        { id:'259.2', titel:'Demontagen' },
        { id:'259.3', titel:'Druckprüfung und Leitungsspülung' },
        { id:'259.4', titel:'Unvorhergesehenes' }
      ]}
    ]},

    // ── 26 TRANSPORTANLAGEN ──
    { id:'26', titel:'Transportanlagen', kinder:[
      { id:'261', titel:'Aufzüge' },{ id:'262', titel:'Fahrtreppen, Fahrsteige' },
      { id:'263', titel:'Fassadenreinigungsanlagen' },{ id:'264', titel:'Sonstige Förderanlagen' },
      { id:'265', titel:'Hebeeinrichtungen' },{ id:'266', titel:'Parkieranlagen' },{ id:'269', titel:'Übriges' }
    ]},

    // ── 27 AUSBAU 1 ──
    { id:'27', titel:'Ausbau 1', kinder:[
      { id:'271', titel:'Gipserarbeiten' },{ id:'272', titel:'Metallbauarbeiten' },
      { id:'273', titel:'Schreinerarbeiten' },{ id:'274', titel:'Spezialverglasungen (innere)' },
      { id:'275', titel:'Schliessanlagen' },{ id:'276', titel:'Innere Abschlüsse' },
      { id:'277', titel:'Elementwände' },{ id:'279', titel:'Übriges' }
    ]},

    // ── 28 AUSBAU 2 ──
    { id:'28', titel:'Ausbau 2', kinder:[
      { id:'281', titel:'Bodenbeläge' },{ id:'282', titel:'Wandbeläge, Wandbekleidungen' },
      { id:'283', titel:'Deckenbekleidungen' },{ id:'284', titel:'Hafnerarbeiten' },
      { id:'285', titel:'Innere Oberflächenbehandlungen' },{ id:'286', titel:'Bauaustrocknung' },
      { id:'287', titel:'Baureinigung' },{ id:'288', titel:'Gärtnerarbeiten (Gebäude)' },{ id:'289', titel:'Übriges' }
    ]},

    // ── 29 HONORARE ──
    { id:'29', titel:'Honorare', kinder:[
      { id:'291', titel:'Architekt' },{ id:'292', titel:'Bauingenieur' },{ id:'293', titel:'Elektroingenieur' },
      { id:'294', titel:'HLKK-Ingenieur' },{ id:'295', titel:'Sanitäringenieur' },{ id:'296', titel:'Spezialisten' },
      { id:'298', titel:'Gebäudeautomationsingenieur' },{ id:'299', titel:'Übriges' }
    ]}
  ]},

  // ═══════════════════════════════════════════════════════
  // 3 — BETRIEBSEINRICHTUNGEN
  // ═══════════════════════════════════════════════════════
  { id:'3', titel:'Betriebseinrichtungen', kinder:[
    { id:'30', titel:'Baugrube' },
    { id:'31', titel:'Rohbau 1' },
    { id:'32', titel:'Rohbau 2' },
    { id:'33', titel:'Elektroanlagen', lizenz:'elektro' },
    { id:'34', titel:'Heizungs-, Lüftungs-, Klima und Kälteanlagen', lizenz:'hlkk' },
    { id:'35', titel:'Sanitäranlagen', lizenz:'sanitaer', kinder:[
      { id:'350', titel:'Übergangsposition' },
      { id:'351', titel:'Allgemeine Sanitärapparate' },
      { id:'352', titel:'Spezielle Sanitärapparate' },
      { id:'353', titel:'Sanitäre Ver- und Entsorgungsapparate' },
      { id:'354', titel:'Sanitärleitungen' },
      { id:'355', titel:'Dämmungen Sanitärinstallationen' },
      { id:'356', titel:'Sanitärinstallationselemente' },
      { id:'357', titel:'Elektro- und Pneumatiktafeln' },
      { id:'358', titel:'Kücheneinrichtungen' },
      { id:'359', titel:'Übriges' }
    ]},
    { id:'36', titel:'Transportanlagen, Lageranlagen' },
    { id:'37', titel:'Ausbau 1' },
    { id:'38', titel:'Ausbau 2' },
    { id:'39', titel:'Honorare' }
  ]},

  // ═══════════════════════════════════════════════════════
  // 4 — UMGEBUNG
  // ═══════════════════════════════════════════════════════
  { id:'4', titel:'Umgebung', kinder:[
    { id:'40', titel:'Terraingestaltung' },
    { id:'41', titel:'Roh- und Ausbauarbeiten' },
    { id:'42', titel:'Gartenanlagen' },
    { id:'43', titel:'Reserve' },
    { id:'44', titel:'Installationen', kinder:[
      { id:'443', titel:'Elektroanlagen' },
      { id:'444', titel:'Heizungs-, Lüftungs-, Klima und Kälteanlagen' },
      { id:'445', titel:'Sanitäranlagen' },
      { id:'446', titel:'Transportanlagen' },
      { id:'449', titel:'Übriges' }
    ]},
    { id:'45', titel:'Erschliessung durch Leitungen (innerhalb Grundstück)' },
    { id:'46', titel:'Kleinere Trassenbauten' },
    { id:'47', titel:'Kleinere Kunstbauten' },
    { id:'48', titel:'Kleinere Untertagbauten' },
    { id:'49', titel:'Honorare' }
  ]},

  // ═══════════════════════════════════════════════════════
  // 5 — BAUNEBENKOSTEN UND ÜBERGANGSKONTEN
  // ═══════════════════════════════════════════════════════
  { id:'5', titel:'Baunebenkosten und Übergangskonten', kinder:[
    { id:'50', titel:'Wettbewerbskosten' },
    { id:'51', titel:'Bewilligungen, Gebühren' },
    { id:'52', titel:'Muster, Modelle, Vervielfältigungen, Dokumentation' },
    { id:'53', titel:'Versicherungen' },
    { id:'54', titel:'Finanzierung ab Baubeginn' },
    { id:'55', titel:'Bauherrenleistungen' },
    { id:'56', titel:'Übrige Baunebenkosten' },
    { id:'57', titel:'Mehrwertsteuer (MWST)' },
    { id:'58', titel:'Übergangskonten für Rückstellungen und Reserven' },
    { id:'59', titel:'Übergangskonten für Honorare' }
  ]},

  // 6, 7, 8 — RESERVE
  { id:'6', titel:'Reserve' },
  { id:'7', titel:'Reserve' },
  { id:'8', titel:'Reserve' },

  // ═══════════════════════════════════════════════════════
  // 9 — AUSSTATTUNG
  // ═══════════════════════════════════════════════════════
  { id:'9', titel:'Ausstattung', kinder:[
    { id:'90', titel:'Möbel' },
    { id:'91', titel:'Beleuchtungskörper' },
    { id:'92', titel:'Textilien' },
    { id:'93', titel:'Geräte, Apparate' },
    { id:'94', titel:'Kleininventar' },
    { id:'95', titel:'Reserve' },
    { id:'96', titel:'Transportmittel' },
    { id:'97', titel:'Verbrauchsmaterial' },
    { id:'98', titel:'Künstlerischer Schmuck' },
    { id:'99', titel:'Honorare' }
  ]}
];
```

**Lizenz-Steuerung:** Jeder Knoten mit `lizenz` Property wird nur angezeigt wenn die entsprechende Lizenz aktiv ist. Standard-Freischaltung: `sanitaer`. Andere Lizenzen (`elektro`, `hlkk`) sind vorbereitet aber gesperrt → UI zeigt ausgegraut mit Schloss-Icon und "Lizenz erforderlich" Tooltip.

### 3.4 Modul-Mapping (Standard)

Diese Zuordnung definiert welche "Lieferung"-BKP zu welchem GEMA-Berechnungsmodul gehört. Der Planer kann das Mapping pro Position überschreiben.

```javascript
var MODUL_MAP = {
  // key → { modul: HTML-Datei, label: Anzeigename, kategorie: Produktkatalog-Kategorie }
  'enthaertung':        { modul: 'sa_enthaertung.html',         label: 'Enthärtungsanlage',       kategorie: 'enthaertung',  bkp: '253.0' },
  'osmose':             { modul: 'sa_osmose.html',              label: 'Osmoseanlage',            kategorie: 'osmose',       bkp: '253.2' },
  'druckerhoehung':     { modul: 'sb_druckerhoehung.html',      label: 'Druckerhöhungsanlage',    kategorie: null,           bkp: '253.4' },
  'frischwasserstation': { modul: 'sa_frischwasserstation.html', label: 'Frischwasserstation',     kategorie: null,           bkp: '253.6' },
  'zirkulation':        { modul: null,                           label: 'Zirkulationspumpe',       kategorie: 'zirkulation',  bkp: '253.8' },
  'hebeanlage':         { modul: 'sa_abwasserhebeanlage.html',  label: 'Abwasserhebeanlage',      kategorie: 'hebeanlage',   bkp: '252.6' },
  'fettabscheider':     { modul: 'sa_fettabscheider.html',      label: 'Fettabscheider',          kategorie: null,           bkp: '252.4' },
  'oelabscheider':      { modul: 'sa_oelabscheider.html',       label: 'Ölabscheider',            kategorie: null,           bkp: '252.8' },
  'schlammsammler':     { modul: 'sa_schlammsammler.html',       label: 'Schlammsammler',          kategorie: null,           bkp: null },
  'solaranlage':        { modul: 'sa_solaranlage.html',         label: 'Solaranlage',             kategorie: null,           bkp: null }
};
// `kategorie` = Produktkatalog-Kategorie (wenn vorhanden). Wenn null → keine Offerte aus Produktkatalog verfügbar, nur manueller PDF-Upload.
// `bkp` = Standard-BKP wo dieses Modul typischerweise eingeordnet wird (kann vom Planer überschrieben werden).
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
