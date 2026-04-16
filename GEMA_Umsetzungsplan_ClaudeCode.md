# GEMA Persona-Feedback: Umsetzungsplan für Claude Code

> **Anweisung an Claude Code:** Gehe jeden Punkt einzeln durch. Stelle pro Punkt zuerst die Frage per `ask_user_input`: «Umsetzen» oder «In brainstorm.md». Bei «Umsetzen» → stelle 5 konkrete Umsetzungsfragen (alle per `ask_user_input` mit klickbaren Antworten), dann setze die 5 Schritte um. Bei «brainstorm.md» → schreibe den Punkt mit Kontext in die Datei `brainstorm.md` und gehe zum nächsten Punkt.

---

## Workflow pro Punkt

```
1. Zeige dem User den Punkt (Titel + Kurzbeschreibung)
2. Frage: [Jetzt umsetzen] / [→ brainstorm.md] / [Überspringen]
3. Bei «Jetzt umsetzen»:
   a. Stelle 5 Umsetzungsfragen mit je 2–4 klickbaren Antworten
      (Fragen zu: Scope, Platzierung, Design, Datenstruktur, Priorität)
   b. Setze die 5 Schritte basierend auf den Antworten um
   c. Zeige das Ergebnis und gehe zum nächsten Punkt
4. Bei «brainstorm.md»:
   a. Schreibe Punkt + Kontext + Persona-Feedback in brainstorm.md
   b. Gehe zum nächsten Punkt
```

---

## Tech-Kontext

- **Stack:** Vanilla JS, Supabase, Netlify
- **Dateipräfixe:** pm_, sb_, sa_, el_, hy_, br_, if_, ab_, sys_
- **Nav:** .g-nav-* Klassen, SVG-Logo, height 52px
- **Inputs:** type="text" inputmode="decimal", fixLeadingZero onblur
- **Auth:** GemaAuth.getCurrentUser(), roleIds-Array, kein u.isAdmin
- **Wasserdaten:** gema_wasserdaten.js, 193 PLZ-Einträge
- **Lieferanten:** sys_produktkatalog.html, Premium/Verifiziert-Badges, GemaProdukte-API
- **Ausschreibung:** pm_ausschreibungsunterlagen.html, Typ A (CRBX) / Typ B (Funktional), Vorlagen-System
- **Werkzeug:** if_werkzeug.html, QR-Codes, NIV/EKAS-Prüfungen

---

## Punkte aus Planer-Personas (Sanitärplaner Deutschschweiz)

### KRITISCH 🔴🔴

**P01 — W3-Leitungsdimensionierung fehlt komplett**
Das meistgenutzte Berechnungstool jedes Sanitärplaners. Strangschema, Durchflüsse zuweisen, Leitungen berechnen nach SVGW W3/E3. Ohne das ist GEMA für den Alltag nicht einsetzbar.
→ Personas: Marco, Reto, Sandra, Luca

**P02 — Textbibliothek / NPK-nahe Standardpositionen für Ausschreibungen**
Vorgefertigte Ausschreibungstexte. Standardpositionen für WC, Lavabo, Dusche, Leitungen — anpassbar, pro Gebäudetyp filterbar. Alle 6 Planer-Personas brauchen das.
→ Personas: Alle 6

### HOCH 🔴

**P03 — Berechnung → Produktvorschlag → Lieferant (durchgängige Kette)**
Enthärtungsberechnung endet im Ergebnis, führt nicht nahtlos zum passenden Apparat/Lieferant. Die Module sind Inseln — der Workflow bricht ab.
→ Personas: Marco, Sandra, Thomas

**P04 — Berechnungen an Projekt binden**
Berechnungen existieren freischwebend. Müssen fest einem Projekt zugeordnet sein — wiederfindbar, teilbar im Team.
→ Personas: Reto, Sandra, Thomas

**P05 — Normverweis auf jedem Berechnungsblatt**
Jede Berechnung braucht sichtbar: Norm (z.B. «SVGW W3/E3:2024, Kap. 5.2»), Datum, Bearbeiter. Für Behörden und Auftraggeber zwingend.
→ Personas: Sandra, Beat

**P06 — PDF-Export mit Projektkopf**
Berechnungen und Ausschreibungen als PDF exportieren — mit Firmenlogo, Projektname, Datum, Bearbeiter, Revisionsstand.
→ Personas: Sandra, Thomas

**P07 — SIA-Phase als Kernattribut bei Projektanlage**
Fehlt komplett. Planer arbeiten an Projekten in verschiedenen SIA-Phasen (31–53), müssen das sofort sehen und filtern können.
→ Personas: Marco, Sandra, Thomas

**P08 — Team-Zuweisung & Büro-Sichtbarkeit**
In Mehrpersonen-Büros: Wer arbeitet an welchem Projekt? Wer sieht was? Projektliste mit Filter «Meine / Büro / Alle».
→ Personas: Reto, Sandra

**P09 — CRBX/E1S Import & Export**
Für Grossprojekte Standard. Import CRBX → Positionen anzeigen → Unternehmer füllt Preise → Export zurück. Ohne das für grössere Büros nicht nutzbar.
→ Personas: Sandra, Reto

**P10 — 0-Positions-Erkennung & Preisabweichung im Offertvergleich**
Automatische Erkennung fehlender Positionen (Preis = 0) und Markierung von Ausreissern beim Offertvergleich.
→ Personas: Reto, Sandra

**P11 — Offertvergleich mit Excel/PDF-Rücklauf**
Unternehmer schicken Offerten als Excel oder PDF zurück — nicht über GEMA. System muss damit umgehen können.
→ Personas: Beat, Thomas, Marco

**P12 — Pricing / Trial sofort sichtbar auf Startseite**
Kein Planer registriert sich ohne Preiswissen. Pricing-Seite, Free-Trial oder Demo-Zugang ohne Registrierung.
→ Personas: Marco, Luca, Thomas

**P13 — Zeitersparnis beweisen (Vorher/Nachher auf Startseite)**
Konkreter Vergleich: «Enthärtungsberechnung: Excel 25 Min → GEMA 3 Min». Messbar, kein Marketing-Sprech.
→ Personas: Beat, Thomas

**P14 — Echte Daten statt Demo im Lieferanten-System**
Demo-Daten wirken künstlich. System braucht echte Schweizer Lieferanten als Grundbefüllung beim Launch.
→ Personas: Beat, Reto, alle

**P15 — Filter im Lieferanten-Dashboard**
Region, Produktkategorie, Preissegment, Zertifizierung (SVGW, KTI). Aktuell nur Aufzählung, kein Entscheidungstool.
→ Personas: Marco, Sandra

**P16 — Ausschreibungs-Vorlagen pro Gebäudetyp**
«EFH-Neubau», «MFH-Neubau», «Badsanierung» als ladbare Vorlagen mit typischen Positionen.
→ Personas: Marco, Luca, Thomas

### MITTEL 🟡

**P17 — PLZ-Autocomplete + Auto-Vorbelegung bei Projektanlage**
swisstopo-Adress-Autocomplete bei Projektanlage. PLZ → automatisch Wasserhärte, Gemeinde, Kanton vorbelegen.
→ Personas: Luca, Marco

**P18 — Sanierungsmodus bei Projektanlage & Berechnungen**
Baujahr, Bestandsmaterial, bestehende Installation als Felder. Bestehenden Apparat erfassen und gegen Bedarf prüfen.
→ Personas: Beat, Thomas

**P19 — Variantenvergleich bei Berechnungen**
Zwei Varianten nebeneinander vergleichen (z.B. Zentralenthärtung vs. Einzelenthärtung).
→ Personas: Reto, Sandra

**P20 — Einheiten immer sichtbar neben Eingabefeldern**
°fH, °dH, l/min, mm — immer als Label neben dem Input. Keine Zweideutigkeit.
→ Personas: Beat, Luca

**P21 — Rechenweg anzeigbar (Detail-Toggle)**
Toggle zwischen «Ergebnis» und «Rechenweg Schritt für Schritt». Für Lernende und Nachprüfbarkeit.
→ Personas: Luca, Sandra

**P22 — Tags / Labels / Statusanzeige für Projekte**
Projekte mit Tags wie «Neubau», «MFH», «Phase 32». Dashboard mit Ampel oder Kanban-Status.
→ Personas: Thomas, Luca, Marco

**P23 — Projekt-Duplikation**
Bestehendes Projekt als Vorlage für ein neues kopieren.
→ Personas: Marco, Luca

**P24 — Eigene Projektnummer als Feld**
Büros haben interne Nummerierung — GEMA soll diese akzeptieren, nicht nur eigene IDs.
→ Personas: Sandra, Reto

**P25 — Unterprojekte / Etappen**
Grossprojekte haben mehrere Bauetappen. Projektstruktur muss das abbilden.
→ Personas: Sandra

**P26 — Freitext-Positionen neben Standardpositionen in Ausschreibung**
Sanierungen und Sonderfälle brauchen freie Positionen neben NPK-Standard.
→ Personas: Beat, Thomas

**P27 — Gleichzeitiges Arbeiten an einer Ausschreibung**
Zwei Planer arbeiten an verschiedenen Abschnitten derselben Ausschreibung.
→ Personas: Reto, Sandra

**P28 — Persönliche Vorlagen-Bibliothek**
Eigene Ausschreibungsvorlagen speichern und wiederverwenden.
→ Personas: Thomas, Marco

**P29 — Guided Mode / Onboarding für Einsteiger**
Geführter Prozess für Erstnutzer: typische Positionen vorschlagen, Offertvergleich mit Erklärungen.
→ Personas: Luca

**P30 — Direkt-Versand PDF aus GEMA**
Ausschreibung direkt als PDF per Mail verschicken, ohne Export → Download → Anhängen.
→ Personas: Thomas, Marco

**P31 — Stammlieferanten pro Büro/User markieren**
Bevorzugte Lieferanten oben anzeigen, nicht jedes Mal durch alle scrollen.
→ Personas: Reto, Thomas

**P32 — Produktvergleich Side-by-Side**
Zwei Produkte tabellarisch nebeneinander (Kapazität, Preis, Masse, Verbrauch).
→ Personas: Luca, Marco

**P33 — Schneller Kontextwechsel zwischen Projekten**
Zuletzt verwendete Module/Projekte als Quick-Links. Weniger Klicks.
→ Personas: Thomas, Marco

**P34 — Tooltips / Onboarding im Lieferanten-Dashboard**
Erstnutzer verstehen 4 Tabs und Admin-Switcher nicht ohne Erklärung.
→ Personas: Luca, Beat

**P35 — Materiallisten-Export aus Ausschreibung**
Nach Ausschreibung → Materialliste generieren → an Lieferant als Anfrage senden.
→ Personas: Thomas, Marco

### NICE-TO-HAVE 🟢

**P36 — BKP-Strukturierung im Offertvergleich**
→ Sandra

**P37 — Preislisten-Upload pro Lieferant**
→ Reto, Sandra

**P38 — Datenblätter beim Produkt hinterlegen**
→ Sandra, Beat

**P39 — Supplier Portal (Lieferanten pflegen Daten selbst)**
→ Sandra, Reto

**P40 — Preisentwicklung / Historik pro Produkt**
→ Thomas

**P41 — Undo / Eingabe-History bei Berechnungen**
→ Luca

**P42 — Mobile / iPad / PWA hervorheben**
→ Marco, Luca, Thomas

**P43 — Modulare Ansicht für Einzelplaner**
→ Thomas, Marco

**P44 — Dark Mode**
→ Luca

---

## Punkte aus Lieferanten-Personas

### KRITISCH 🔴🔴

**L01 — Lieferanten-Portal mit eigenem Login (Self-Service)**
Lieferanten brauchen einen eigenen Zugang um Produkte zu pflegen, Datenblätter hochzuladen, Status zu verwalten. Aktuell ist der Produktkatalog nur Admin-zugänglich — Lieferanten haben keine Tür ins System.
→ Personas: Andreas, Mirjam, Daniel, Patrick (alle 4)

### HOCH 🔴

**L02 — Lead-Dashboard für Lieferanten**
Wie oft werden Produkte angezeigt? Wie viele Offertanfragen? Kontaktdaten des anfragenden Planers. Ohne Leads kein Umsatznachweis → kein Zahlungsgrund.
→ Personas: Andreas, Mirjam, Patrick

**L03 — Produktkatalog über Enthärtung hinaus öffnen**
Aktuell funktioniert der Produktkatalog nur für Enthärtungsanlagen. Armaturen, Leitungen, Apparate, Boiler — der 10× grössere Markt fehlt komplett.
→ Personas: Mirjam, Patrick

**L04 — Massenimport (CSV/Excel) für Produkte**
Lieferanten mit 40–500+ Produkten können nicht einzeln einpflegen. CSV/Excel-Import mit Mapping ist Pflicht.
→ Personas: Mirjam, Patrick, Andreas

**L05 — Premium-Paket inhaltlich definieren**
Premium-Badge existiert, aber was bekommt ein Lieferant konkret dafür? Bevorzugte Platzierung? Exklusiver Filterplatz? Analytics? Muss glasklar auf einer Pricing-Seite stehen.
→ Personas: Andreas, Mirjam

**L06 — Hersteller vs. Händler vs. Dienstleister unterscheiden**
Aktuell gibt es nur «Lieferant». Aber ein Hersteller (BWT), ein Grosshändler (Zürcher) und ein Prüfdienstleister (Stettler) haben völlig andere Bedürfnisse und Daten.
→ Personas: Patrick, Daniel

### MITTEL 🟡

**L07 — Dienstleister-Anbindung im Werkzeugmanagement**
«Prüfung buchen»-Button bei fälligen Geräten → verlinkt zum regionalen Prüfdienstleister. Service-Leads direkt aus GEMA.
→ Personas: Daniel

**L08 — Prüfer-Login (Resultate direkt eintragen)**
Prüfdienstleister will Prüfresultate direkt in GEMA eintragen statt auf Papier → Kunde tippt nicht mehr ab.
→ Personas: Daniel

**L09 — API/ERP-Schnittstelle für Grosshändler**
Grosshändler mit 3'000+ Artikeln braucht automatische Synchronisation, kein manuelles Pflegen.
→ Personas: Patrick

**L10 — Verfügbarkeit / Lieferzeit anzeigen**
«An Lager» / «2 Tage Lieferzeit» direkt bei Produkten. USP für Grosshändler.
→ Personas: Patrick, Andreas

**L11 — Spezifikations-Einbettung in Ausschreibung**
Planer soll beim Ausschreibungstext ein Referenzprodukt auswählen können (z.B. «Nussbaum Optipress DN20»), das in der Position als Referenz erscheint.
→ Personas: Mirjam

**L12 — Materialliste → Bestellanfrage an Grosshändler**
Materialliste aus Ausschreibung generieren → direkt als Anfrage an den Grosshändler senden.
→ Personas: Patrick

### NICE-TO-HAVE 🟢

**L13 — Regionale Sichtbarkeit / Kantonsfilter**
→ Mirjam, Daniel

**L14 — Preisentwicklung / Historik**
→ Patrick
