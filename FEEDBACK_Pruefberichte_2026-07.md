# Feedback Prüfberichte 07/2026 — Änderungsliste (Sammel-Dokument)

**Quelle:** Annotierte Prüfbericht-PDFs (Modul `pm_pruefliste.html`), Robin/S+P, 30.07.2026.
**Vorgehen:** Es kommen insgesamt **3 annotierte Prüfberichte**. Dieses Dokument sammelt zuerst ALLE
Änderungen; die Umsetzung startet erst, wenn alle 3 Berichte eingearbeitet sind (User-Vorgabe).

| Bericht | Datei | Status |
|---|---|---|
| 1 | BEG-2026-011 (Dornacherstrasse 210, «Test 1», 4 Seiten) | ✅ analysiert (unten) |
| 2 | BEG-2026-012 (Dornacherstrasse 210, «Test 2», 4 Seiten — Browser-Druck mit URL-Fusszeile) | ✅ analysiert (unten) |
| 3 | — | ⏳ ausstehend |

**Klärung des Users (30.07.2026):** «S+P» = **Schmutz + Partner AG** — das ist die Organisation,
und das hinterlegte Org-Logo ist das S+P-Logo (mit Schriftzug). → fliesst in A6 ein.

---

## Bericht 1 — BEG-2026-011 (Dornacherstrasse 210)

### A. PDF-Bericht (`printBericht`, pm_pruefliste.html ~Z. 2432–2613)

**A1 · Dokument-/Fenstertitel = Strasse + Hausnr.** (Seite 1, oben)
> «Strasse mit Hausnr. Dann ist auch Titel vom PDF so und muss nicht umbenannt werden»

Der `<title>` des Druckfensters ist heute `«<BEG-Nr> – Prüfbericht»` (Z. 2441) — beim «Als PDF
speichern» wird das der Dateiname. Neu: **Adresse (nur Strasse + Hausnr., ohne PLZ/Ort) zuerst**,
z.B. `Dornacherstrasse 210 – Prüfbericht`. Quelle: Strassen-Teil aus `b.objektAdresse` bzw.
`prFreieAdresse(b.freieAdresse)` (Teil vor dem Komma); Fallback `objName(b.objektId)`/`b.nr`.

**A2 · Berichts-Titel (H1) = Strasse + Hausnr.** (Seite 1)
> «Strasse und Hausnr. muss als Titel sein» — der bisherige Untertitel «Test 1» (Begehungs-Titel) ist gelb markiert.

Titel-Hierarchie umstellen (Z. 2493): **H1 = Adresse** (Strasse + Hausnr.), darunter als Untertitel
`«Prüfbericht — <Art>»` (+ bei Bedarf `· <b.titel>`, damit der interne Begehungs-Titel nicht verloren
geht). Heute: H1 = «Prüfbericht — Begehung», sub = b.titel.

**A3 · Meta-Label «Objekt / Projekt» → «Projekt»** (Seite 1)
> «Nur Projekt ("Objekt / " löschen)»

Z. 2500: Label der ersten Meta-Zeile umbenennen.

**A4 · Meta-Zeile «Begehungs-Nr.» entfernen** (Seite 1, Zeile ist durchgestrichen)

Z. 2503: Zeile aus der Meta-Tabelle löschen. Die Nr. bleibt intern (Karteliste, Storage) —
nur der PDF-Ausdruck zeigt sie nicht mehr. (Konsistent mit A1: auch der Fenstertitel nutzt
die Adresse statt der Nr.)

**A5 · KPI-Zeile: Zahlen müssen aufgehen** (Seite 1) — **BUG**
> «Darstellung OK aber irgendwie stimmen die Zahlen nicht. (7 Prüfpunkte, aber nur 4 zusammengerechnete)»

Befund verifiziert: Der Bericht zeigt `Prüfpunkte 7 · gut 2 · mässig 0 · schlecht 0 · offen 2`
(Z. 2508) — die Kategorie `nicht_bewertet` aus `prBegehungBewertung` (Z. 665) wird **nicht
angezeigt**. Im Beispiel fehlen 3 Punkte: Hebeanlage («nicht vorhanden» → entfällt),
Rückstauklappe («nicht beurteilbar» → entfällt), Geruchsemission (beantwortet, Zustand offen).

Fix (Engine + Anzeige):
- `prBegehungBewertung` um Zähler **`entfaellt`** erweitern (Antwort in `PR_ZUSTAND_ENTFAELLT`,
  Z. 659) — getrennt vom bisherigen `nicht_bewertet` (= beantwortet, Zustand noch offen).
- **Bericht-Chips** (Z. 2508): `Prüfpunkte · gut · mässig · schlecht · entfällt · offen`, wobei
  **offen = unbeantwortet + beantwortet-ohne-Zustand** (alles, was noch keiner End-Kategorie
  zugeordnet ist). Damit gilt IMMER: gut + mässig + schlecht + entfällt + offen = Prüfpunkte.
  Beispiel: 2 + 0 + 0 + 2 + 3 = 7 ✓
- **Editor-Zustand-Karte** (`.bwkpi`, GUT/MÄSSIG/SCHLECHT/OFFEN) analog: 5. Kachel «ENTFÄLLT»
  (grau), gleiche offen-Semantik (siehe auch B3 — dorthin zeigt derselbe Pfeil).
- **Zusatz-Facette aus Bericht 2 (Hausanschluss: Zustand «schlecht», Antwort «—»):** Ein Punkt
  mit gesetztem Zustand aber OHNE Antwort darf nicht als «offen» verschluckt werden —
  `prBegehungBewertung` returned heute bei `!beantwortet` VOR der Zustands-Zählung (Z. 670).
  Neu: ist eine Bewertung gut/mässig/schlecht gesetzt, zählt der Zustand (auch ohne Antwort);
  «offen» nur, wenn weder Antwort noch Zustand vorliegen.
- Drift-Guards (`pruefliste_engine_test` / `_smoke_test` / Feedback-Tests) nachziehen.
- *Bug in Bericht 2 reproduziert:* `7 · gut 1 · mässig 1 · schlecht 1 · offen 1` — es fehlen
  genau die 3 entfällt-Punkte (Fettabscheider «nicht vorhanden», Rückstauklappe «nicht
  vorhanden», Schlammsammler «nicht beurteilbar»).

**A6 · Druck-Fusszeile: Org statt URL/about:blank** (Seite 1 unten — in BEIDEN Berichten angemerkt)
> «S+P Logo mit Namen übernehmen» — Bericht 1: Pfeil auf «about:blank», Bericht 2: Pfeil auf die
> rot umrahmte URL-Fusszeile `https://dev.gema-connect.ch/pm_pruefliste.html`.
> **Deutung GEKLÄRT** (User-Nachricht + Bericht 2): S+P = Schmutz + Partner AG = die Org mit
> ihrem hinterlegten Logo. In der Fusszeile jeder Druckseite soll die **Org** erscheinen statt
> der Browser-Defaults (URL bzw. about:blank).

Umsetzung: **`@page`-Margin-Boxen** einführen (Kanon `gema_schaden_pdf.js`):
- unten links: **Firmenname** «Schmutz + Partner AG» (aus `org.name`; ersetzt die URL)
- unten rechts: «Seite X / Y» (bleibt sinngemäss wie der Browser-Default)
- oben rechts: «<Adresse> – Prüfbericht» (konsistent mit A1)

Technische Grenze (dokumentieren): Ein Logo-**Bild** ist in `@page`-Margin-Boxen nicht möglich
(nur Text/counter) — das Logo als Bild bleibt im Dokument-Kopf auf Seite 1; die Fusszeile trägt
den Firmennamen als Text. Der Kopf (Z. 2490 f.) nutzt bereits `org.logoVector || org.logo` —
in Bericht 2 ist das S+P-Logo MIT Schriftzug sichtbar → Kopf-Logo ist korrekt, dort keine Änderung.

**A7 · Prüfpunkt-Titel fett + etwas grösser** (Seite 2, «Allgemein»)
> «Allgemein: Titel Fett und bisschen grösser» (2× angemerkt: Geruchsemission, Fettabscheider)

Z. 2551: `p.bezeichnung` in der ersten Tabellen-Spalte fett (`font-weight:700/800`) und
~10.5–11 pt statt 10 pt. Gilt für ALLE Prüfpunkt-Zeilen (`tr.pkrow td:first-child` — nur die
Bezeichnung, nicht Untergruppe/Bauteil-Zeile).

**A8 · «Prüfung: Messgerät» auf einer Linie** (Seite 2)
> «"Prüfung: Messgerät" Anordnung auf einer Linie»

Z. 2552: Der Prüfart-Zusatz in der Antwort-Spalte bricht heute um («Prüfung:» / «Messgerät»).
Fix: `white-space:nowrap` auf dem Span (bzw. non-breaking space) — «Prüfung: Messgerät» bleibt
einzeilig.

**A9 · Bauteil-Zeile: Schrift grösser + alles ausschreiben** (Seite 2, Fettabscheider)
> «Anordnung gut, Schrift grösser und alles Ausschreiben»

Z. 2537–2543 (`btZeile`, heute `🔩 Biral · Testomat · Bj. 2015 · Kunststoff` in 9 pt):
- Schrift von 9 pt auf ~10 pt.
- **Labels ausschreiben**: `Hersteller Biral · Typ Testomat · Baujahr 2015 · Material Kunststoff`
  (insbesondere «Bj.» → «Baujahr»); «Wartung/Ersatz …» bleibt.
- Anordnung (eine Zeile, ·-Trenner) bleibt wie sie ist («Anordnung gut»).

**A10 · Bilder ohne Rand/Rahmen — bei allen Bildern** (Seite 2)
> «Rand von Bilder entfernen (bei allen Bildern)» (roter Kasten markiert den leeren weissen Streifen rechts neben dem Hochformat-Foto)

- `.pgrid img` (Z. 2482): `border:1px solid #ccc` entfernen. Zusätzlich läuft der Rahmen heute
  um die **ganze Grid-Zelle** (`width:100%` + `object-fit:contain;object-position:left top`) —
  bei schmalen Hochformat-Bildern entsteht rechts ein leerer gerahmter Streifen. Fix: Bild nur
  in seiner tatsächlichen Breite rendern (`width:auto; max-width:100%`), kein Rahmen.
- **Titelbild** (Z. 2450): `border:1px solid #ccc` ebenfalls entfernen («bei allen Bildern»).
- `border-radius` kann dezent bleiben (nicht beanstandet) — bei der Umsetzung visuell prüfen.

**A11 · Trennlinie zwischen Prüfpunkt und seinem Bild entfernen** (Seite 3)
> «Zeilentrenner wenn Bild angefügt löschen» / «unten wird ja nochmals getrennt → i.O. so»

Heute hat jede `td` einen `border-bottom` (Z. 2461) — auch die Prüfpunkt-Zeile, der direkt die
Bildzeile folgt (Linie ZWISCHEN Punkt und seinen Fotos). Fix:
`table.pk tr.pkrow.mitfoto td{border-bottom:none}` — die Linie **unter** der Foto-Zeile
(`tr.fotorow`, 1.5 px, Z. 2475) bleibt unverändert (explizit als i.O. bestätigt).

**A12 · Vertikale Spaltentrenner in allen Zeilen** (Seite 2) — *Prüfer-Vorschlag mit Fragezeichen*
> «Zeilentrenner sinnvoll? In allen Zeilen» (die senkrechten Striche zwischen Antwort/Zustand/Bemerkung sind vom Prüfer als Vorschlag eingezeichnet)

Die Prüfpunkt-Tabelle hat heute KEINE vertikalen Trenner. Vorschlag umsetzen: dezente vertikale
Trennlinien (`border-left:1px solid #e2e2e2` auf den Spalten 2–4, in Kopf- UND Datenzeilen,
konsistent in allen Zeilen — auch einzeiligen). Bei Bildzeilen (colspan 4) entfällt der Trenner
naturgemäss. → Beim Umsetzen mit Bericht 2/3 gegenprüfen, ob die Frage dort beantwortet wird.

### B. Erfassung / Editor (Seite 4: «Zusätzliche Anmerkungen beim Ausfüllen»)

**B1 · Antworttyp `auffaellig`: Option «nicht beurteilbar» ergänzen**
> Pfeil auf «Grundleitungssanierung» (keine Auffälligkeit / Auffälligkeit vorhanden): «nicht beurteilbar ergänzen»

`PR_ANTWORTTYPEN.auffaellig` (Z. 404) bekommt die dritte Option
`{ v:'nb', l:'nicht beurteilbar', bewertung:'nicht_bewertet' }`. `nb` steckt bereits in
`PR_ZUSTAND_ENTFAELLT` → Zustand entfällt automatisch (Chip «entfällt», Select gesperrt).
KRITISCH: Option ANHÄNGEN, bestehende Werte (`keine`/`vorhanden`) nicht antasten
(Bestandsschutz gespeicherter Antworten). `PR_DEFAULT_KATALOG` bleibt unverändert (Typ-Def
wirkt überall).

**B2 · Zahl-Punkte: «nicht beurteilbar» ergänzen**
> Pfeil auf «Hausanschluss» (Zahlenfeld + Chips gut/mässig/schlecht): «nicht beurteilbar ergänzen»

Bei `kind:'zahl'` (z.B. Hausanschluss) neben den Inline-Zustands-Chips einen Chip
**«nicht beurteilbar»**: setzt `p.antwort='nb'` (statt Zahl) → `prZustandEntfaellt` greift,
Zustand entfällt. Nötig dazu: `prAntwortLabel` muss bei kind zahl/text den Wert `'nb'` als
«nicht beurteilbar» rendern (heute würde roh «nb» erscheinen); Zahlenfeld bei gesetztem nb
leeren/deaktivieren, erneuter Klick auf den Chip = zurücksetzen. Gleiches Muster für
`kind:'text'` mitprüfen (im Bericht nicht explizit angemerkt — bei Umsetzung entscheiden).

**B3 · Zustand-KPI-Karte im Editor: Kategorie ergänzen + Zählung**
> Dritter Pfeil von «nicht beurteilbar ergänzen» auf die Zustand-Karte (GUT/MÄSSIG/SCHLECHT/OFFEN)

Zusammen mit A5: 5. Kachel **«ENTFÄLLT»** (grau) in `.bwkpi`; «OFFEN» = unbeantwortet +
beantwortet-ohne-Zustand. Der Gesamt-Chip («Gesamt: nicht bewertet») bleibt wie bisher
(Ampel-Logik `gesamt` unverändert: schlecht > mässig > gut).

### C. Explizit als gut bestätigt (nicht anfassen)

- Firmenkopf links (Name + Adresse) ✓
- Meta-Zeilen Objekttyp, Nutzungen, Datum, Prüfer/Fachperson, Status ✓
- KPI-**Darstellung** («Darstellung OK» — nur die Zahlen sind falsch, A5)
- Bauteil-Zeilen-**Anordnung** («Anordnung gut» — nur Schrift/Labels, A9)
- Trennlinie **unter** der Foto-Zeile («unten wird ja nochmals getrennt → i.O. so», A11)

---

## Bericht 2 — BEG-2026-012 (Dornacherstrasse 210, «Test 2»)

Direkt aus dem Browser gedruckt (`dev.gema-connect.ch/pm_pruefliste.html` in der Fusszeile).
Nur zwei neue Anmerkungen — der Rest bestätigt Bericht 1.

**A13 · Saubere Seitenumbrüche im ganzen Dossier** — **NEU, Kernanmerkung** (Seite 2)
> «sauberer Seitenumbruch (in ganzem Dossier)» — Pfeil auf den unnötig leeren unteren
> Seitenbereich; oben auf Seite 2 sind die ZERRISSENEN Fragmente der Geruchsemission-Zeile
> gelb markiert («Hygiene», «Auffälligkeiten», «bewertet», «Prüfung: Messgerät»).

Befund: Die erste Prüfpunkt-Zeile (Geruchsemission, mehrzeilig, mit 3 Fotos) wurde über den
Seitenwechsel S.1→S.2 **mitten in der Zeile** gerissen — obwohl `tr{break-inside:avoid}`
(Z. 2461) gesetzt ist. Ursachen-Analyse: Die avoid-Kette ist **überbestimmt** —
`tr.pkrow.mitfoto{break-after:avoid}` (Z. 2471) will die Punktzeile bei ihrer Foto-Zeile
halten, die Foto-Zeile (3 Hochformat-Fotos = 2 Grid-Zeilen à bis 85 mm) ist aber selbst fast
seitenfüllend und hat via `tr{break-inside:avoid}` ebenfalls ein Umbruch-Verbot (`.many`
lockert erst ab >4 Fotos). Passt das Paket nicht auf die Restseite, ignoriert der Browser die
avoid-Regeln und bricht irgendwo — hier mitten durch die Punktzeile.

Fix-Ansatz (bei Umsetzung verifizieren, gilt fürs ganze Dossier):
- `tr.fotorow` darf IMMER innerhalb brechen (`break-inside:auto` statt nur `.many`) — jedes
  `img` behält sein eigenes `break-inside:avoid`, es bricht also zwischen den Bildern, nie
  durch ein Bild.
- Damit ist die Kette entlastet: `pkrow` (break-inside:avoid) + `break-after:avoid` hält die
  Punktzeile zuverlässig mit der ERSTEN Bildzeile zusammen; grosse Foto-Blöcke fliessen über
  Seiten.
- Gegenprüfen mit dem bestehenden Drift-Guard `scripts/pruefliste_bericht_umbruch_test.mjs`
  (Regel dort: «Zusammenhalt über Struktur, nicht über break-after-Ketten») — der Test prüft
  aktuell das ALTE Sollverhalten (`.many` ab >4) und muss nachgezogen werden.

**A6-Klärung** (Seite 1): Pfeil «S+P Logo mit Namen übernehmen» zeigt hier eindeutig auf die
**URL-Fusszeile** → Deutung in A6 aktualisiert (Org-Name in @page-Fusszeile statt URL).

**Bestätigungen aus Bericht 2 (keine neuen Massnahmen):**
- A5-Bug reproduziert: KPI `7 · gut 1 · mässig 1 · schlecht 1 · offen 1` — die 3
  entfällt-Punkte fehlen; zusätzlich die Facette «Zustand ohne Antwort» (Hausanschluss:
  Zustand **schlecht**, Antwort «—») → in A5 eingearbeitet.
- A10 visuell bestätigt (weisser Rahmen-Streifen rechts neben allen Hochformat-Fotos).
- A9 visuell bestätigt (Bauteil-Zeilen «🔩 Bj. 2015 · Inliner» / «🔩 Biral · FSC 1300 ·
  Bj. 2008 · Kunststoff» klein und mit «Bj.»-Abkürzung).
- Meta-Tabelle: «Nutzungen»-Zeile fehlt hier, weil nicht erfasst (bedingtes Rendern ok);
  Begehungs-Nr.-Zeile vorhanden → entfällt mit A4.

**Beobachtung (keine Prüfer-Anmerkung, aber auffällig):** Mehrere Prüfpunkt-Fotos sind
iPhone-Screenshots der GEMA-App mit dem Dialog **«Speicher voll — Das Foto konnte auf diesem
Gerät nicht zwischengespeichert werden…»** (lokale Foto-Warteschlange `gema_pr_fotoq_v1`,
localStorage-Quota). Der Prüfer hat den Fehler offenbar dokumentiert. → Beim Umsetzen prüfen,
ob die Quota-Behandlung der Foto-Warteschlange auf iOS zu streng ist (z.B. Warteschlange in
IndexedDB statt localStorage) — ggf. als eigener Punkt, falls Bericht 3 ihn anspricht.

## Bericht 3 — (ausstehend)

*Wird ergänzt, sobald das PDF vorliegt.*

---

## Konsolidierte Umsetzungsliste (wächst mit Bericht 2 + 3)

| Nr | Änderung | Ort | Art | Status |
|---|---|---|---|---|
| A1 | Fenster-/PDF-Titel = Strasse + Hausnr. | `printBericht` Z. 2441 | Bericht | offen |
| A2 | H1 = Adresse, «Prüfbericht — Art» als Untertitel | `printBericht` Z. 2493 | Bericht | offen |
| A3 | Meta-Label «Projekt» statt «Objekt / Projekt» | Z. 2500 | Bericht | offen |
| A4 | Meta-Zeile Begehungs-Nr. entfernen | Z. 2503 | Bericht | offen |
| A5 | KPI-Zahlen aufgehend: `entfaellt`-Zähler + Chip; offen inkl. nicht bewertet; Zustand-ohne-Antwort zählt beim Zustand | `prBegehungBewertung` Z. 665 + Z. 2508 + `.bwkpi` | Engine + Bericht + Editor | offen (Bug 2× bestätigt) |
| A6 | @page-Fusszeilen: Org-Name statt URL/about:blank (+ Seite X/Y, Kopfzeile Adresse) | Z. 2443 ff. | Bericht | offen (Deutung geklärt) |
| A7 | Prüfpunkt-Titel fett + grösser | Z. 2551 (CSS) | Bericht | offen |
| A8 | «Prüfung: Messgerät» einzeilig (nowrap) | Z. 2552 | Bericht | offen |
| A9 | Bauteil-Zeile: 10 pt + Labels ausschreiben (Baujahr statt Bj.) | Z. 2537–2543 | Bericht | offen |
| A10 | Bilder ohne Rahmen, kein leerer Rahmen-Streifen (pgrid + Titelbild) | Z. 2450 / 2482 | Bericht | offen |
| A11 | Kein Trenner zwischen Punktzeile und Bildzeile | CSS `tr.pkrow.mitfoto td` | Bericht | offen |
| A12 | Vertikale Spaltentrenner in allen Zeilen | `table.pk` CSS | Bericht | offen (Prüfer-Frage «sinnvoll?») |
| A13 | Saubere Seitenumbrüche im ganzen Dossier (Zeile nie zerreissen; fotorow darf zwischen Bildern brechen) | `table.pk`-CSS Z. 2461/2471/2476 | Bericht | offen |
| B1 | `auffaellig` + Option «nicht beurteilbar» | `PR_ANTWORTTYPEN` Z. 404 | Editor/Engine | offen |
| B2 | Zahl-(/Text-)Punkte: «nicht beurteilbar»-Chip (`antwort='nb'`) | Editor + `prAntwortLabel` | Editor/Engine | offen |
| B3 | Editor-Zustand-Karte: Kachel «Entfällt», offen-Semantik | `.bwkpi`-Renderer | Editor | offen |

**Betroffene Drift-Guards beim Umsetzen nachziehen:** `scripts/pruefliste_engine_test.mjs`,
`scripts/pruefliste_smoke_test.mjs`, `scripts/pruefliste_bericht_feedback_test.mjs`,
`scripts/pruefliste_bericht_umbruch_test.mjs`, `scripts/pruefliste_feedback_20260730_test.mjs`
(KPI-Chips, Antworttyp-Optionen, Bericht-CSS werden dort teils exakt geprüft).

## Offene Fragen / Deutungen (mit Bericht 3 abgleichen)

1. ~~**A6**: Kopf-Logo oder Fusszeile?~~ **GEKLÄRT** (Bericht 2 + User-Nachricht): S+P =
   Schmutz + Partner AG (Org, Logo hinterlegt); die Fusszeile soll die Org zeigen statt
   URL/about:blank → @page-Margin-Boxen mit Firmenname; Kopf-Logo bleibt unverändert.
2. **A2**: Soll der interne Begehungs-Titel («Test 1» / «Test 2») im PDF ganz entfallen oder als
   Zusatz im Untertitel bleiben? Vorschlag: im Untertitel behalten (kein Informationsverlust).
3. **A12**: «Zeilentrenner sinnvoll?» ist als Frage formuliert — Empfehlung: dezent umsetzen;
   in Bericht 2 nicht erneut angemerkt, bei Bericht 3 auf Bestätigung achten.
4. **A1**: Titel-Suffix «– Prüfbericht» behalten (Vorschlag: ja) oder Dateiname = nur Adresse?
5. **Beobachtung Bericht 2**: «Speicher voll»-Dialoge der Foto-Warteschlange auf dem iPhone
   (in den Prüfpunkt-Fotos dokumentiert) — falls Bericht 3 das anspricht, als eigenen
   Massnahmen-Punkt aufnehmen (Foto-Queue localStorage → IndexedDB).
