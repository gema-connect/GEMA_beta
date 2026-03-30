# GEMA Unternehmensstruktur & Benutzerverwaltung — Konzept

## 1. Überblick

### Hierarchie
```
GEMA (Plattform)
 └─ Unternehmen (Firma)
     ├─ Unternehmens-Admin (von GEMA ernannt)
     ├─ Abteilungen (optional, vom Unternehmens-Admin erstellt)
     │   ├─ Sanitär
     │   ├─ Heizung
     │   └─ Lüftung
     └─ Benutzer
         ├─ Planer (Felix Jäggi, Abt. Sanitär)
         ├─ Planer (Marco Weber, Abt. Heizung)
         └─ Sachbearbeiter (Lisa Müller, alle Abt.)
```

### Prinzip
- **Unternehmen** = zentrale Einheit (Firma mit Logo, Adresse, Lizenzen)
- **Benutzer** gehören zu einem Unternehmen (oder sind "freie" Login-Light User)
- **Abteilungen** sind optional — Standard: alle sehen alles
- **Unternehmens-Admin** wird von GEMA-Superadmin ernannt
- **Lizenzen** sind pro User (nicht Pool)

---

## 2. Datenmodell

### 2.1 Unternehmen (Organisation)

```javascript
{
  id: 'org_xxx',
  name: 'Jäggi Vollmer GmbH',
  rechtsform: 'GmbH',
  logo: null,                    // base64 oder URL
  adresse: {
    strasse: 'Rheinfelderstrasse 10',
    plz: '4058',
    ort: 'Basel',
    kanton: 'BS',
    land: 'CH'
  },
  kontakt: {
    email: 'info@jaeggivollmer.ch',
    telefon: '061 692 03 11',
    website: 'https://jaeggivollmer.ch'
  },
  kategorie: 'sanitaerplaner',   // aus DEFAULT_ORG_CATS
  settings: {
    waehrung: 'CHF',
    land: 'CH',
    sichtbarkeit: 'firma',       // 'firma' (alle sehen alles) | 'abteilung' (nur eigene Abt.)
    abteilungenAktiv: false,     // Abteilungs-Feature ein/aus
  },
  abteilungen: [
    { id: 'abt_1', name: 'Sanitär', farbe: '#16a34a' },
    { id: 'abt_2', name: 'Heizung', farbe: '#dc2626' },
    { id: 'abt_3', name: 'Lüftung', farbe: '#2563eb' }
  ],
  lizenzen: {
    typ: 'pro_user',             // Immer pro_user
    maxUser: 10,                 // Gekaufte Lizenzen
    aktiveUser: 3,               // Aktuell genutzte
    aboStart: '2025-01-01',
    aboEnde: '2026-12-31',
    gewerke: ['sanitaer'],       // Freigeschaltete Gewerke
  },
  admins: ['user_xxx'],          // Unternehmens-Admins (von GEMA ernannt)
  active: true,
  createdAt: '2025-01-01T00:00:00Z'
}
```

### 2.2 Benutzer (erweitert)

```javascript
{
  id: 'user_xxx',
  username: 'felix@jaeggivollmer.ch',
  name: 'Felix Jäggi',
  password: '...',
  roleIds: ['role_planer'],
  orgId: 'org_xxx',              // Zugehöriges Unternehmen
  abteilungId: 'abt_1',         // Optional: Abteilungs-Zuordnung (null = alle)
  active: true,
  kontotyp: 'vollzugang',       // 'vollzugang' | 'login_light'
  // ... rest wie bisher
}
```

### 2.3 Abteilung

```javascript
{
  id: 'abt_1',
  name: 'Sanitär',
  farbe: '#16a34a',              // Für visuelle Unterscheidung
  leiter: 'user_xxx',           // Optional: Abteilungsleiter
  gewerke: ['sanitaer'],        // BKP-Gewerke dieser Abteilung
}
```

---

## 3. Rollen & Berechtigungen

### 3.1 GEMA-Superadmin (role_admin)
- Ernennt Unternehmens-Admins
- Sieht alle Unternehmen und User
- Kann Lizenzen zuweisen
- Kann Unternehmen erstellen/deaktivieren
- Kann Login-Light User zu Vollzugang upgraden

### 3.2 Unternehmens-Admin (orgAdmin)
- Wird von GEMA-Superadmin ernannt
- Verwaltet Benutzer seines Unternehmens:
  - Hinzufügen (neuer User oder Einladung)
  - Deaktivieren / Reaktivieren
  - Abteilung zuweisen
  - Rolle ändern
- Erstellt/verwaltet Abteilungen
- Verwaltet Unternehmens-Einstellungen:
  - Logo hochladen
  - Firmenadresse pflegen
  - Sichtbarkeit (firma-weit / abteilungs-getrennt)
  - Gewerke freischalten (im Rahmen der Lizenz)
- Sieht Lizenz-Übersicht (benutzt/verfügbar)
- Kann Lizenzen bestellen (→ Link zu sys_preise.html)

### 3.3 Normaler Benutzer
- Sieht Projekte gemäss Sichtbarkeits-Einstellung:
  - `firma`: alle Projekte des Unternehmens
  - `abteilung`: nur Projekte seiner Abteilung
- Kann eigene Projekte erstellen
- Kann nicht: andere User verwalten, Lizenzen ändern, Einstellungen ändern

### 3.4 Login-Light (Externe / Eingeladene)
- Kein Unternehmen zugeordnet (orgId = 'org_default' oder leer)
- Eingeschränkte Rechte (kein Download, kein Copy)
- Kann nur eingeladene Inhalte sehen
- Upgrade auf Vollzugang → muss Unternehmen beitreten oder erstellen

---

## 4. Sichtbarkeit von Objekten/Projekten

### 4.1 Aktueller Mechanismus (gema_objekte_api.js)
```javascript
function _filterByOrg(objekte) {
  // Filtert nach orgId des aktuellen Users
}
```

### 4.2 Neuer Mechanismus
```javascript
function _filterByOrgAndAbt(objekte) {
  var user = GemaAuth.getCurrentUser();
  if (!user) return [];
  var org = GemaAuth.getCurrentOrg();

  // GEMA-Admin → alles
  if (GemaAuth.isAdmin()) return objekte;

  // Unternehmens-Filter
  var meineObj = objekte.filter(o => o.orgId === user.orgId);

  // Abteilungs-Filter (wenn aktiviert)
  if (org && org.settings.sichtbarkeit === 'abteilung' && user.abteilungId) {
    // Unternehmens-Admin sieht trotzdem alles
    if (org.admins.indexOf(user.id) >= 0) return meineObj;
    // Normaler User: nur Projekte seiner Abteilung
    return meineObj.filter(o => !o.abteilungId || o.abteilungId === user.abteilungId);
  }

  return meineObj;
}
```

### 4.3 Objekt-Zuordnung
Jedes Objekt erhält ein neues Feld:
```javascript
{
  // ... bestehende Felder ...
  orgId: 'org_xxx',           // Unternehmen
  abteilungId: 'abt_1',      // Optional: Abteilung
  erstelltVon: 'user_xxx',   // User der das Objekt erstellt hat
}
```

---

## 5. Unternehmens-Admin UI

### 5.1 Neues Modul: sys_unternehmen.html

**Tabs:**
1. **Übersicht** — Firmenname, Logo, Lizenz-Status, Nutzer-Anzahl
2. **Benutzer** — Liste aller User, Status, Rolle, Abteilung, Einladung
3. **Abteilungen** — CRUD für Abteilungen, Farbe, Leiter, Gewerke
4. **Einstellungen** — Logo, Adresse, Sichtbarkeit, Gewerke
5. **Lizenzen** — Aktueller Plan, Nutzung, Upgrade-Link

### 5.2 Benutzer-Verwaltung (Tab 2)

| Aktion | Unternehmens-Admin | GEMA-Admin |
|--------|-------------------|------------|
| User einladen | ✓ | ✓ |
| User deaktivieren | ✓ (eigenes Unternehmen) | ✓ (alle) |
| Rolle ändern | ✓ (keine Admin-Rolle) | ✓ |
| Abteilung zuweisen | ✓ | ✓ |
| Zum Unternehmens-Admin ernennen | ✕ | ✓ |
| User löschen | ✕ | ✓ |
| Lizenz zuweisen | ✓ (im Rahmen der Lizenz) | ✓ |

### 5.3 Abteilungs-Verwaltung (Tab 3)

- Abteilung erstellen: Name, Farbe, Gewerke
- Benutzer zuweisen (Drag & Drop oder Dropdown)
- Abteilungsleiter ernennen
- Abteilung deaktivieren / löschen (User werden "ohne Abteilung")

---

## 6. Registrierungs-Flow

### 6.1 Neues Unternehmen (Self-Service)
```
User klickt "Unternehmen erstellen" auf sys_preise.html
  → Firma, Rechtsform, Adresse, Kontakt eingeben
  → Gewerke wählen (Sanitär, Heizung etc.)
  → Lizenz-Plan wählen
  → Account erstellen (wird erster User + Login-Light)
  → GEMA prüft, ernennt zum Unternehmens-Admin
  → Unternehmen aktiv
```

### 6.2 Mitarbeiter einladen (vom Unternehmens-Admin)
```
Admin → Benutzer-Tab → "+ Einladen"
  → Email, Name, Rolle, Abteilung eingeben
  → Einladungsmail wird generiert
  → Mitarbeiter klickt Link → setzt Passwort
  → Wird automatisch dem Unternehmen zugeordnet
  → Lizenz wird verbraucht (aktiveUser++)
```

### 6.3 Login-Light → Vollzugang
```
Login-Light User (z.B. eingeladener Lieferant)
  → Will Produkte erfassen → "Abo nötig"
  → Klick auf "Abo wählen"
  → Entweder: bestehendem Unternehmen beitreten (Einladung nötig)
  → Oder: neues Unternehmen erstellen
  → GEMA prüft → Unternehmens-Admin ernannt
```

---

## 7. Bestehende Strukturen die angepasst werden müssen

| Datei | Änderung |
|-------|---------|
| `gema_auth.js` | Unternehmens-Admin Prüfung, Abteilungs-Zuordnung, isOrgAdmin() |
| `gema_objekte_api.js` | _filterByOrgAndAbt() statt _filterByOrg() |
| `sys_admin.html` | GEMA-Admin: Unternehmens-Admin ernennen, Lizenzen |
| `sys_profil.html` | Unternehmens-Info anzeigen, Abteilung sehen |
| `sys_unternehmen.html` (NEU) | Unternehmens-Admin Dashboard |
| `pm_objekte.html` | Abteilung bei Objekt-Erstellung zuweisen |
| Alle Module | Sichtbarkeit respektieren (über gema_objekte_api.js) |

---

## 8. Implementierungs-Reihenfolge

| Schritt | Was | Aufwand |
|---------|-----|--------|
| **1** | Datenmodell in gema_auth.js (Org erweitern, Abteilungen, isOrgAdmin) | 2h |
| **2** | gema_objekte_api.js: Sichtbarkeits-Filter mit Abteilungen | 1h |
| **3** | sys_unternehmen.html: Neues Modul für Unternehmens-Admin | 4h |
| **4** | sys_admin.html: GEMA-Admin erweitern (Org-Admin ernennen, Lizenzen) | 2h |
| **5** | pm_objekte.html: Abteilung bei Objekt-Erstellung | 1h |
| **6** | Einladungs-Flow erweitern (Org + Abteilung) | 2h |
| **7** | sys_profil.html: Unternehmens-Info + Abteilung anzeigen | 1h |
| **8** | Testing + Edge Cases | 2h |
| **Total** | | **~15h** |

---

## 9. Beantwortete Fragen

1. **Mehrere Unternehmen pro User?** — Nein, aber **Gastzugang** möglich: User kann Gastzutritt bei einem anderen Unternehmen anfordern. Unternehmens-Admin bewilligt oder fügt direkt als Gast hinzu. Zeitlich beschränkbar, jederzeit deaktivierbar. Daten die der Gast erstellt hat bleiben beim Unternehmen sichtbar, nicht beim ehemaligen Gast.

2. **Abteilungs-übergreifende Projekte?** — Ja! Ein Projekt kann mehreren Abteilungen zugeordnet werden.

3. **Unternehmens-Admin Stellvertreter?** — Ja! Mehrere Admins pro Unternehmen möglich (admins ist Array).

4. **Lizenz-Verwaltung Detail?** — Gast braucht eigene Lizenz, das aufnehmende Unternehmen zahlt nichts dafür. Lizenzen: **Pool-Lizenzen** (Firma kauft X Stück, Admin verteilt) UND **Einzellizenzen** möglich. Pool-Lizenzen müssen mindestens 30 Tage bei einem User bleiben. Ohne Unternehmen: "Kein Unternehmen" Badge.

5. **Migration bestehender Daten?** — Bestehende User mit 'org_default' erhalten "Kein Unternehmen" Badge und können einem Unternehmen beitreten.

### Ergänzungen
- **Benutzer-Einstellungen**: Normaler User kann eigene Einstellungen verwalten (Standard-BKP, Passwort, Sprache etc.) — nur unternehmensweite Einstellungen sind dem Admin vorbehalten.
- **Gastzugang**: Neues Datenmodell `gastZugaenge` auf dem User: `[{orgId, status:'aktiv'|'abgelaufen', gueltigBis, erstelltAm}]`

---

## 10. Gastzugang — Detail

### Datenstruktur auf User
```javascript
{
  // ... bestehende Felder ...
  gastZugaenge: [
    {
      orgId: 'org_xxx',
      orgName: 'Müller Engineering AG',
      status: 'aktiv',           // 'angefragt' | 'aktiv' | 'deaktiviert' | 'abgelaufen'
      gueltigBis: '2026-12-31',  // null = unbefristet
      erstelltAm: '2026-03-30',
      bewilligtVon: 'user_xxx',  // Unternehmens-Admin der bewilligt hat
    }
  ]
}
```

### Sichtbarkeit für Gäste
- Gast sieht Projekte des Gast-Unternehmens gemäss dessen Sichtbarkeits-Einstellung
- Gast kann Daten erstellen/bearbeiten (gemäss seiner Rolle)
- Nach Deaktivierung: Gast sieht nichts mehr, aber seine Daten bleiben beim Unternehmen

### Lizenz für Gäste
- Gast braucht eigene Lizenz (Einzellizenz oder Pool seines eigenen Unternehmens)
- Das aufnehmende Unternehmen zahlt NICHTS für den Gast

---

## 11. Lizenzen — Detail

### Lizenz-Typen
| Typ | Beschreibung |
|-----|-------------|
| **Einzellizenz** | Pro User, direkt dem User zugeordnet |
| **Pool-Lizenz** | Firma kauft X Stück, Admin verteilt an User |

### Pool-Lizenz Regeln
- Mindestens **30 Tage** bei einem User bevor sie umverteilt werden kann
- Admin sieht: wer hat welche Lizenz, seit wann, wann umverteilbar
- Bei Deaktivierung eines Users: Lizenz wird nach 30 Tagen frei

---

## 10. Beispiel-Szenario

### Jäggi Vollmer GmbH (Sanitärplaner)
```
Unternehmen: Jäggi Vollmer GmbH
├── Admin: Felix Jäggi (von GEMA ernannt)
├── Lizenzen: 5 User, 3 benutzt
├── Gewerke: Sanitär
├── Sichtbarkeit: firma-weit (alle sehen alles)
│
├── Felix Jäggi (Planer, Admin) — sieht alles, verwaltet User
├── Marco Weber (Planer) — sieht alle Projekte
└── Lisa Müller (Sachbearbeiterin) — sieht alle Projekte
```

### Grosses Ingenieurbüro mit Abteilungen
```
Unternehmen: Müller Engineering AG
├── Admin: Thomas Müller (von GEMA ernannt)
├── Lizenzen: 20 User, 12 benutzt
├── Gewerke: Sanitär, Heizung, Lüftung
├── Sichtbarkeit: abteilung (getrennt)
│
├── Abt. Sanitär (grün)
│   ├── Felix (Sanitärplaner) — sieht nur Sanitär-Projekte
│   └── Anna (Sanitärplanerin) — sieht nur Sanitär-Projekte
│
├── Abt. Heizung (rot)
│   ├── Marco (Heizungsplaner) — sieht nur Heizungs-Projekte
│   └── Peter (Heizungsplaner)
│
├── Abt. Lüftung (blau)
│   └── Sarah (Lüftungsplanerin) — sieht nur Lüftungs-Projekte
│
└── Thomas Müller (Admin, keine Abt.) — sieht ALLES
```
