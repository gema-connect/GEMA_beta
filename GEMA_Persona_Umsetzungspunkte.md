# GEMA Persona-Test: Zusammenfassung & Umsetzungspunkte

> Dieses Dokument fasst das Feedback von 6 fiktiven Testpersonas (Schweizer Sanitärplaner) zusammen, die den GEMA-Workflow von A–Z durchgespielt haben. Die Punkte sind nach Dringlichkeit sortiert. Gehe jeden Punkt einzeln durch und mache mir konkrete Umsetzungsvorschläge — jeweils als anklickbare Optionen (z.B. mit ask_user_input oder ähnlichem Format), damit ich pro Punkt entscheiden kann, wie wir vorgehen.

---

## 🔴🔴 KRITISCH — Kernfunktionen die fehlen

### 1. W3-Leitungsdimensionierung fehlt komplett
Das meistgenutzte Berechnungstool jedes Sanitärplaners. Strangschema, Durchflüsse zuweisen, Leitungen berechnen nach SVGW W3/E3. Ohne das ist GEMA für den Alltag nicht einsetzbar.

### 2. Textbibliothek / NPK-nahe Standardpositionen für Ausschreibungen
Alle 6 Personas brauchen vorgefertigte Ausschreibungstexte. Standardpositionen für WC, Lavabo, Dusche, Leitungen etc. — anpassbar, pro Gebäudetyp filterbar.

---

## 🔴 HOCH — Muss zeitnah gelöst werden

### 3. Berechnung → Produktvorschlag → Lieferant (durchgängige Kette)
Enthärtungsberechnung endet im Ergebnis, aber führt nicht zum passenden Apparat/Lieferant. Die Module sind Inseln — der Workflow bricht ab.

### 4. Berechnungen an Projekt binden
Berechnungen existieren aktuell freischwebend. Sie müssen fest einem Projekt zugeordnet sein, damit man sie wiederfindet und im Team teilen kann.

### 5. Normverweis auf jedem Berechnungsblatt
Jede Berechnung braucht sichtbar: Norm (z.B. «SVGW W3/E3:2024, Kap. 5.2»), Datum, Bearbeiter. Für Behörden und Auftraggeber zwingend.

### 6. PDF-Export mit Projektkopf
Berechnungen und Ausschreibungen als PDF exportieren — mit Firmenlogo, Projektname, Datum, Bearbeiter, Revisionsstand.

### 7. SIA-Phase als Kernattribut bei Projektanlage
Fehlt komplett. Planer arbeiten an Projekten in verschiedenen SIA-Phasen (31–53) und müssen das sofort sehen und filtern können.

### 8. Team-Zuweisung & Büro-Sichtbarkeit
In Mehrpersonen-Büros muss klar sein: Wer arbeitet an welchem Projekt? Wer sieht was? Projektliste mit Filter «Meine / Büro / Alle».

### 9. CRBX/E1S Import & Export
Für Grossprojekte Standard. Planer arbeiten mit .e1s-Dateien (SIA 451). Import von CRBX → Positionen anzeigen → Unternehmer füllt Preise → Export zurück. Ohne das ist GEMA für grössere Büros nicht nutzbar.

### 10. 0-Positions-Erkennung & Preisabweichung im Offertvergleich
Automatische Erkennung fehlender Positionen (Preis = 0) und Markierung von Ausreissern beim Offertvergleich.

### 11. Offertvergleich muss mit Excel/PDF-Rücklauf funktionieren
Unternehmer schicken Offerten als Excel oder handausgefülltes PDF zurück — nicht über GEMA. Das System muss damit umgehen können.

### 12. Pricing / Trial sofort sichtbar auf Startseite
Kein Planer registriert sich ohne zu wissen was es kostet. Pricing-Seite, Free-Trial oder Demo-Zugang ohne Registrierung.

### 13. Zeitersparnis beweisen (Vorher/Nachher auf Startseite)
Skeptiker brauchen einen konkreten Vergleich: «Enthärtungsberechnung: Excel 25 Min → GEMA 3 Min». Kein Marketing-Sprech, sondern messbare Zeitersparnis.

### 14. Echte Daten statt Demo im Lieferanten-System
Demo-Daten wirken künstlich und schrecken ab. Das System braucht echte Schweizer Lieferanten als Grundbefüllung beim Launch.

### 15. Filter im Lieferanten-Dashboard
Region, Produktkategorie, Preissegment, Zertifizierung (SVGW, KTI). Aktuell nur eine Aufzählung, kein Entscheidungstool.

### 16. Ausschreibungs-Vorlagen pro Gebäudetyp
«EFH-Neubau», «MFH-Neubau», «Badsanierung» als ladbare Vorlagen mit typischen Positionen.

---

## 🟡 MITTEL — Deutlicher Mehrwert, kann priorisiert werden

### 17. PLZ-Autocomplete + Auto-Vorbelegung bei Projektanlage
swisstopo-Adress-Autocomplete schon bei der Projektanlage nutzen. PLZ → automatisch Wasserhärte, Gemeinde, Kanton vorbelegen.

### 18. Sanierungsmodus bei Projektanlage & Berechnungen
Baujahr, Bestandsmaterial, bestehende Installation als Felder. Bei Berechnungen: bestehenden Apparat erfassen und gegen aktuellen Bedarf prüfen.

### 19. Variantenvergleich bei Berechnungen
Zwei Varianten nebeneinander vergleichen (z.B. Zentralenthärtung vs. Einzelenthärtung).

### 20. Einheiten immer sichtbar neben Eingabefeldern
°fH, °dH, l/min, mm — immer als Label neben dem Input. Keine Zweideutigkeit.

### 21. Rechenweg anzeigbar (Detail-Toggle)
Toggle zwischen «Ergebnis» und «Rechenweg Schritt für Schritt». Wichtig für Lernende und für Nachprüfbarkeit.

### 22. Tags / Labels / Statusanzeige für Projekte
Projekte mit Tags wie «Neubau», «MFH», «Phase 32» versehen. Dashboard mit Ampel oder Kanban-Status.

### 23. Projekt-Duplikation
Bestehendes Projekt als Vorlage für ein neues kopieren.

### 24. Eigene Projektnummer als Feld
Büros haben interne Nummerierung — GEMA soll diese als Feld akzeptieren, nicht nur eigene IDs verwenden.

### 25. Unterprojekte / Etappen
Grossprojekte (Spitäler) haben mehrere Bauetappen. Projektstruktur muss das abbilden.

### 26. Freitext-Positionen neben Standardpositionen in Ausschreibung
Bei Sanierungen und Sonderfällen müssen freie Positionen geschrieben werden können.

### 27. Gleichzeitiges Arbeiten an einer Ausschreibung
Zwei Planer arbeiten an verschiedenen Abschnitten der gleichen Ausschreibung.

### 28. Persönliche Vorlagen-Bibliothek
Eigene Ausschreibungsvorlagen speichern und wiederverwenden.

### 29. Guided Mode / Onboarding für Einsteiger
Geführter Prozess für Erstnutzer: typische Positionen vorschlagen, Offertvergleich mit Erklärungen.

### 30. Direkt-Versand PDF aus GEMA
Ausschreibung direkt als PDF per Mail verschicken, ohne Export → Download → Anhängen.

### 31. Stammlieferanten pro Büro/User markieren
Bevorzugte Lieferanten oben anzeigen, nicht jedes Mal durch alle scrollen.

### 32. Produktvergleich Side-by-Side
Zwei Produkte tabellarisch nebeneinander vergleichen (Kapazität, Preis, Masse, Verbrauch).

### 33. Schneller Kontextwechsel zwischen Projekten
Zuletzt verwendete Module/Projekte als Quick-Links. Weniger Klicks für Projektwechsel.

### 34. Tooltips / Onboarding im Lieferanten-Dashboard
Erstnutzer verstehen die 4 Tabs und den Admin-Switcher nicht ohne Erklärung.

### 35. Materiallisten-Export aus Ausschreibung
Nach Ausschreibung → Materialliste generieren → an Lieferant als Anfrage senden.

---

## 🟢 NICE-TO-HAVE — Langfristig wertvoll

### 36. BKP-Strukturierung im Offertvergleich
Zusammenfassung nach BKP-Nummern für SIA-konforme Darstellung.

### 37. Preislisten-Upload pro Lieferant
Excel/PDF-Preislisten hochladen mit Gültigkeitsdatum.

### 38. Datenblätter beim Produkt hinterlegen
Technische Datenblätter als PDF direkt beim Lieferantenprodukt.

### 39. Supplier Portal (Lieferanten pflegen Daten selbst)
Lieferanten können ihre Produkte, Preise, Datenblätter eigenständig pflegen.

### 40. Preisentwicklung / Historik pro Produkt
Historische Preisdaten zur Kalkulation und Trendanalyse.

### 41. Undo / Eingabe-History bei Berechnungen
Rückgängig-Funktion oder zumindest sichtbarer Eingabeverlauf.

### 42. Mobile / iPad / PWA hervorheben
iPad-Safari-Kompatibilität und PWA-Fähigkeit aktiv kommunizieren.

### 43. Modulare Ansicht für Einzelplaner
Nur relevante Module anzeigen statt das volle Programm. Anpassbares Dashboard.

### 44. Dark Mode
Für Digital Natives und Abendarbeit.

---

## Kontext für Claude Code

- **Stack:** Vanilla JS, Supabase, Netlify
- **Dateipräfixe:** pm_, sb_, sa_, el_, hy_, br_, if_, ab_, sys_
- **Nav:** .g-nav-* Klassen, SVG-Logo, height 52px
- **Inputs:** type="text" inputmode="decimal", fixLeadingZero onblur
- **Auth:** GemaAuth.getCurrentUser(), roleIds-Array, kein u.isAdmin
- **Wasserdaten:** gema_wasserdaten.js, 193 PLZ-Einträge
- **W12:** hy_w12.html, 216 Checkpoints, 17 GVP-Module
- **CRBX:** Geplant für pm_ausschreibungsunterlagen, SIA 451 .e1s Format
- **Lieferanten:** Supplier Dashboard mit 4 Tabs, Admin-Switcher
