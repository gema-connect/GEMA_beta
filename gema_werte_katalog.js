/**
 * gema_werte_katalog.js — Katalog aller erfassbaren Werte der Berechnungen
 *
 * AUTOMATISCH ERZEUGT von scripts/werte_katalog_gen.mjs — NICHT VON HAND
 * BEARBEITEN. Neu erzeugen mit:  node scripts/werte_katalog_gen.mjs
 *
 * Zweck: Auswahlliste des Verknuepfungs-Werkzeugs (gema_verknuepfung.js).
 * Im Zielmodul waehlt man ein Feld an und sagt, welcher Wert aus welcher
 * anderen Berechnung dort vorgeschlagen werden soll.
 *
 * WERT-ID = <modulKey>.<feldId>  (sprechend + stabil, z.B.
 * druckerhoehung.vfd_LU). Ergebniswerte tragen das Suffix _out.
 *
 * Die Datei wird BEWUSST NUR BEI BEDARF geladen (der Helper injiziert sie,
 * wenn der Admin das Werkzeug oeffnet) — sie ist zu gross, um auf jeder
 * Berechnungsseite mitzulaufen.
 *
 * Stand: 1532 Werte in 49 Modulen.
 */
(function (w) {
  'use strict';
  var MODULE = {
 "abwasserhebeanlage": {
  "key": "abwasserhebeanlage",
  "datei": "sa_abwasserhebeanlage",
  "label": "Abwasserhebeanlage",
  "kategorie": "Sanitäranlagen",
  "autosave": "abwasserhebeanlage",
  "werte": [
   {
    "id": "abwasserhebeanlage.t_len",
    "feld": "t_len",
    "label": "t_len",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_abwasserhebeanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "abwasserhebeanlage.t_flow",
    "feld": "t_flow",
    "label": "t_flow",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_abwasserhebeanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "abwasserhebeanlage.bem",
    "feld": "bem",
    "label": "Bemerkung",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.q_add",
    "feld": "q_add",
    "label": "Zusätzlicher Zufluss",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.n_pumpen",
    "feld": "n_pumpen",
    "label": "Anzahl Pumpen",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.k_wert",
    "feld": "k_wert",
    "label": "Abflusskennzahl K",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.k_frei",
    "feld": "k_frei",
    "label": "k_frei",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "K",
    "quelle": "gema_abwasserhebeanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "abwasserhebeanlage.waste_type",
    "feld": "waste_type",
    "label": "Abwasserart",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.pipe_id",
    "feld": "pipe_id",
    "label": "Druckleitung ID (mm)",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.pipe_len",
    "feld": "pipe_len",
    "label": "Länge Druckleitung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.static_h",
    "feld": "static_h",
    "label": "Statische Förderhöhe",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mWS",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.h_minor",
    "feld": "h_minor",
    "label": "Zusatzverluste Armaturen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mWS",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.sch_d",
    "feld": "sch_d",
    "label": "Schachtdurchmesser",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.sch_ps",
    "feld": "sch_ps",
    "label": "Pumpensumpf (Höhe)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.sch_tschalt",
    "feld": "sch_tschalt",
    "label": "Schaltspielzeit tSchalt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "s",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.sch_fres",
    "feld": "sch_fres",
    "label": "Reservefaktor fres",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.sch_nutz",
    "feld": "sch_nutz",
    "label": "Nutzvolumen (Höhe)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.sch_res",
    "feld": "sch_res",
    "label": "Reservevolumen (Höhe)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_abwasserhebeanlage__<objektId>"
   },
   {
    "id": "abwasserhebeanlage.foerdermenge_out",
    "feld": "foerdermenge_out",
    "label": "Foerdermenge",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "abwasserhebeanlage.foerderhoehe_out",
    "feld": "foerderhoehe_out",
    "label": "Foerderhoehe",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "abwasserhebeanlage.volumen_out",
    "feld": "volumen_out",
    "label": "Volumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "abwasserhebeanlage.sch_res_unit",
    "feld": "sch_res_unit",
    "label": "Sch unit",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "abwasserhebeanlage.sch_res_src",
    "feld": "sch_res_src",
    "label": "Sch src",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "Liter",
    "unsicher": true
   },
   {
    "id": "abwasserhebeanlage.v_res",
    "feld": "v_res",
    "label": "Reservevolumen",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "Liter"
   },
   {
    "id": "abwasserhebeanlage.v_res_u",
    "feld": "v_res_u",
    "label": "Reservevolumen",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "apparateliste": {
  "key": "apparateliste",
  "datei": "sb_apparateliste",
  "label": "Apparateliste Sanitär",
  "kategorie": "Sanitär",
  "autosave": "apparateliste",
  "werte": [
   {
    "id": "apparateliste.anzahl_api",
    "feld": "anzahl_api",
    "label": "Anzahl Räume / Apparate",
    "art": "ergebnis",
    "typ": "zahl",
    "api": "GemaApparate.getCounts(objektId)"
   },
   {
    "id": "apparateliste.zeilen_api",
    "feld": "zeilen_api",
    "label": "Apparate-Zeilen pro Raum",
    "art": "ergebnis",
    "typ": "zahl",
    "api": "GemaApparate.getRows(objektId)"
   },
   {
    "id": "apparateliste.aggregiert_api",
    "feld": "aggregiert_api",
    "label": "Apparate-Mengen über alle Räume",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "Stk",
    "api": "GemaApparate.getAggregated(objektId)"
   },
   {
    "id": "apparateliste.projectName",
    "feld": "projectName",
    "label": "Projekt / Objekt",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.prjStrasse",
    "feld": "prjStrasse",
    "label": "Strasse / Nr.",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.prjPlz",
    "feld": "prjPlz",
    "label": "PLZ",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.prjOrt",
    "feld": "prjOrt",
    "label": "Ort",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.buildingType",
    "feld": "buildingType",
    "label": "Gebäudetyp",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.authorName",
    "feld": "authorName",
    "label": "Erstellt von",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.prjLieferant",
    "feld": "prjLieferant",
    "label": "Lieferant / Ausstellung",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.prjBauherr",
    "feld": "prjBauherr",
    "label": "Bauherrschaft",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.prjArchitekt",
    "feld": "prjArchitekt",
    "label": "Architekt",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.prjPlaner",
    "feld": "prjPlaner",
    "label": "Sanitärplaner",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   },
   {
    "id": "apparateliste.prjUnternehmer",
    "feld": "prjUnternehmer",
    "label": "Unternehmer",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_apparateliste__<objektId>"
   }
  ]
 },
 "ausdehnungsgefaess": {
  "key": "ausdehnungsgefaess",
  "datei": "hz_ausdehnungsgefaess",
  "label": "Ausdehnungsgefäss & Sicherheitsventil",
  "kategorie": "Heizung",
  "autosave": "ausdehnungsgefaess",
  "werte": [
   {
    "id": "ausdehnungsgefaess.he_hst",
    "feld": "he_hst",
    "label": "Statische Höhe über dem Gefäss",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_pueb",
    "feld": "he_pueb",
    "label": "Zuschlag auf den statischen Druck (üblich 0.3)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "barü",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_psv",
    "feld": "he_psv",
    "label": "Standard-Ansprechdrücke DGH (bestimmt Gefässdruck PS)",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_tmin",
    "feld": "he_tmin",
    "label": "Kaltbefüllung der Anlage",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_fn",
    "feld": "he_fn",
    "label": "bestimmt auch den Zuschlagsfaktor X und das Sicherheitsventil",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_vsyswe",
    "feld": "he_vsyswe",
    "label": "Wasserinhalt WE [Vsys,WE]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "dm³",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_vl",
    "feld": "he_vl",
    "label": "Vorlauftemperatur",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_rl",
    "feld": "he_rl",
    "label": "Rücklauftemperatur",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_vsyssp",
    "feld": "he_vsyssp",
    "label": "Speicherinhalt [Vsys,Sp]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "dm³",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_xsp",
    "feld": "he_xsp",
    "label": "Speicher üblich 1.0",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_tin",
    "feld": "he_tin",
    "label": "Eintrittstemperatur",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_tout",
    "feld": "he_tout",
    "label": "Austrittstemperatur",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_ausdehnungsgefaess__<objektId>"
   },
   {
    "id": "ausdehnungsgefaess.he_rows",
    "feld": "he_rows",
    "label": "he_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_ausdehnungsgefaess__<objektId>",
    "unsicher": true
   },
   {
    "id": "ausdehnungsgefaess.vnMin_out",
    "feld": "vnMin_out",
    "label": "Vn Min",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.nennvolumen_out",
    "feld": "nennvolumen_out",
    "label": "Nennvolumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.vordruck_out",
    "feld": "vordruck_out",
    "label": "Vordruck",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.enddruck_out",
    "feld": "enddruck_out",
    "label": "Enddruck",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.gefaessdruck_out",
    "feld": "gefaessdruck_out",
    "label": "Gefaessdruck",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.anlageinhalt_out",
    "feld": "anlageinhalt_out",
    "label": "Anlageinhalt",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.ausdehnungsvolumen_out",
    "feld": "ausdehnungsvolumen_out",
    "label": "Ausdehnungsvolumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_p0",
    "feld": "he_out_p0",
    "label": "Min. Auslegungsdruck / Vordruck [p0] hst/10 + Überlagerung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_pfin",
    "feld": "he_out_pfin",
    "label": "Auslegungsenddruck [pfin] pSV / 1.3",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_rhomin",
    "feld": "he_out_rhomin",
    "label": "Dichte Fülltemperatur [ρmin]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_xwe",
    "feld": "he_out_xwe",
    "label": "Zuschlagsfaktor [X] ≥150 kW: 1.5 · ≤10 kW: 3.0",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_ewe",
    "feld": "he_out_ewe",
    "label": "Ausdehnungsfaktor [e] ρmin/ρ(qm) − 1",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_vexwe",
    "feld": "he_out_vexwe",
    "label": "Ausdehnungsvolumen [Vex]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_vwrwe",
    "feld": "he_out_vwrwe",
    "label": "Wasservorlagevolumen [VWr]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_vexsp",
    "feld": "he_out_vexsp",
    "label": "Ausdehnungsvolumen [Vex]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_vwrsp",
    "feld": "he_out_vwrsp",
    "label": "Wasservorlagevolumen [VWr]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_gsys",
    "feld": "he_out_gsys",
    "label": "He gsys",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "ausdehnungsgefaess.he_out_gvex",
    "feld": "he_out_gvex",
    "label": "He gvex",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "ausdehnungsgefaess.he_out_gvwr",
    "feld": "he_out_gvwr",
    "label": "He gvwr",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "ausdehnungsgefaess.he_out_vsystot",
    "feld": "he_out_vsystot",
    "label": "Anlageinhalt [Vsys]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_vextot",
    "feld": "he_out_vextot",
    "label": "Ausdehnungsvolumen [Vex,tot]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_vwrtot",
    "feld": "he_out_vwrtot",
    "label": "Wasserreservevolumen [VWr,tot]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_po",
    "feld": "he_out_po",
    "label": "Vordruck [Po]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_pfinr",
    "feld": "he_out_pfinr",
    "label": "Enddruck [Pfin]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_ps",
    "feld": "he_out_ps",
    "label": "Gefässdruck [PS] ≤3→3 · ≤6→6 · sonst 10",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_vnmin",
    "feld": "he_out_vnmin",
    "label": "Mindest-Nennvolumen [VN,min] Vex,tot·(Pfin+1)/(Pfin−Po)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_vn",
    "feld": "he_out_vn",
    "label": "Gefässinhalt gewählt [VN]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_typ",
    "feld": "he_out_typ",
    "label": "Gefässtyp",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_pfill",
    "feld": "he_out_pfill",
    "label": "Fülldruck [Pfill] VN·(Po+1)/(VN−VWr) − 1",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_pxv",
    "feld": "he_out_pxv",
    "label": "Druckgeräte-Kennzahl [P·V = VN·pSV]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_svfn",
    "feld": "he_out_svfn",
    "label": "Nennleistung WE [FN]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_svschliess",
    "feld": "he_out_svschliess",
    "label": "Schliessdruck [PSV] pSV·0.94 + 1",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_svx",
    "feld": "he_out_svx",
    "label": "Druckmittelbeiwert [X]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_svr",
    "feld": "he_out_svr",
    "label": "Verdampfungsenthalpie [r]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_svqm",
    "feld": "he_out_svqm",
    "label": "Massenstrom [qm] FN·3600/r",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_svdn",
    "feld": "he_out_svdn",
    "label": "Erforderliche Nennweite",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_svd0ber",
    "feld": "he_out_svd0ber",
    "label": "Engster Querschnitt ber. [d0,ber]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_svd0eff",
    "feld": "he_out_svd0eff",
    "label": "Engster Querschnitt eff. [d0,eff]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "ausdehnungsgefaess.he_out_svtheo",
    "feld": "he_out_svtheo",
    "label": "Theoretische Abblaseleistung",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "ausstosszeiten": {
  "key": "ausstosszeiten",
  "datei": "sb_ausstosszeiten",
  "label": "Ausstosszeiten",
  "kategorie": "Sanitär",
  "autosave": "ausstosszeiten",
  "werte": [
   {
    "id": "ausstosszeiten.az_rows",
    "feld": "az_rows",
    "label": "az_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_ausstosszeiten__<objektId>",
    "unsicher": true
   }
  ]
 },
 "belastbarkeit": {
  "key": "belastbarkeit",
  "datei": "el_belastbarkeit",
  "label": "Strombelastbarkeit & Kabelwahl",
  "kategorie": "Elektro",
  "autosave": "belastbarkeit",
  "werte": [
   {
    "id": "belastbarkeit.bl_isolation",
    "feld": "bl_isolation",
    "label": "Isolation",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_material",
    "feld": "bl_material",
    "label": "Leitermaterial",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_parallel",
    "feld": "bl_parallel",
    "label": "Parallele Leiter je Aussenleiter",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "×",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_tumg",
    "feld": "bl_tumg",
    "label": "Umgebungstemperatur (Luft)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_haeufModus",
    "feld": "bl_haeufModus",
    "label": "Häufung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_n",
    "feld": "bl_n",
    "label": "Belastete Stromkreise gehäuft",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Kreise",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_ngering",
    "feld": "bl_ngering",
    "label": "davon dauernd < 30 % belastet",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Kreise",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_fman",
    "feld": "bl_fman",
    "label": "Häufungsfaktor",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_a",
    "feld": "bl_a",
    "label": "Querschnitt",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_ib",
    "feld": "bl_ib",
    "label": "Betriebsstrom Ib",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_in",
    "feld": "bl_in",
    "label": "Nennstrom Schutzorgan In",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_schutz",
    "feld": "bl_schutz",
    "label": "Art des Schutzorgans",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_system",
    "feld": "bl_system",
    "label": "Netzsystem",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_laenge",
    "feld": "bl_laenge",
    "label": "Einfache Leitungslänge",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_belastbarkeit__<objektId>"
   },
   {
    "id": "belastbarkeit.bl_dumax",
    "feld": "bl_dumax",
    "label": "Zulässiger Spannungsfall",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_belastbarkeit__<objektId>"
   }
  ]
 },
 "beleuchtung": {
  "key": "beleuchtung",
  "datei": "el_beleuchtung",
  "label": "Beleuchtungsberechnung",
  "kategorie": "Elektro",
  "autosave": "beleuchtung",
  "werte": [
   {
    "id": "beleuchtung.bt_laenge",
    "feld": "bt_laenge",
    "label": "Länge",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_breite",
    "feld": "bt_breite",
    "label": "Breite",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_hoehe",
    "feld": "bt_hoehe",
    "label": "Raumhöhe",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_nutz",
    "feld": "bt_nutz",
    "label": "Höhe der Nutzebene",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_abhaeng",
    "feld": "bt_abhaeng",
    "label": "Abhängehöhe der Leuchten",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_em",
    "feld": "bt_em",
    "label": "Wartungswert der Beleuchtungsstärke Em",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "lx",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_wf",
    "feld": "bt_wf",
    "label": "Wartungsfaktor",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_vorlage",
    "feld": "bt_vorlage",
    "label": "Vorlage übernehmen",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_phi",
    "feld": "bt_phi",
    "label": "Lichtstrom je Leuchte ΦL",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "lm",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_p",
    "feld": "bt_p",
    "label": "Leistungsaufnahme je Leuchte",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "W",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_refl",
    "feld": "bt_refl",
    "label": "Reflexionsgrade Decke / Wand / Boden",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_eta",
    "feld": "bt_eta",
    "label": "Betriebswirkungsgrad ηB",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_shr",
    "feld": "bt_shr",
    "label": "Grösstes Abstandsverhältnis a / hm",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_netz",
    "feld": "bt_netz",
    "label": "Netzsystem",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_beleuchtung__<objektId>"
   },
   {
    "id": "beleuchtung.bt_cos",
    "feld": "bt_cos",
    "label": "Leistungsfaktor cos φ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_beleuchtung__<objektId>"
   }
  ]
 },
 "brandlast": {
  "key": "brandlast",
  "datei": "br_brandlast",
  "label": "Brandlast im Fluchtweg — Kabel und Leitungen",
  "kategorie": "Brandschutz",
  "autosave": "brandlast",
  "werte": [
   {
    "id": "brandlast.bra_laenge",
    "feld": "bra_laenge",
    "label": "Länge des Fluchtwegs L",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_brandlast__<objektId>"
   },
   {
    "id": "brandlast.bra_limit",
    "feld": "bra_limit",
    "label": "Grenzwert Brandlast",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "MJ/m",
    "quelle": "gema_brandlast__<objektId>"
   },
   {
    "id": "brandlast.bra_gebaeude",
    "feld": "bra_gebaeude",
    "label": "Gebäude",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_brandlast__<objektId>"
   },
   {
    "id": "brandlast.bra_geschoss",
    "feld": "bra_geschoss",
    "label": "Geschoss",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_brandlast__<objektId>"
   },
   {
    "id": "brandlast.bra_korridor",
    "feld": "bra_korridor",
    "label": "Fluchtweg / Korridor",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_brandlast__<objektId>"
   },
   {
    "id": "brandlast.bra_herleitung",
    "feld": "bra_herleitung",
    "label": "bra_herleitung",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_brandlast__<objektId>",
    "unsicher": true
   },
   {
    "id": "brandlast.bra_rows",
    "feld": "bra_rows",
    "label": "bra_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_brandlast__<objektId>",
    "unsicher": true
   },
   {
    "id": "brandlast.out_anzahl",
    "feld": "out_anzahl",
    "label": "Anzahl Kabel (gezählt)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "brandlast.out_summe",
    "feld": "out_summe",
    "label": "Brandlast total im FluchtwegΣ MJ = Σ (MJ/m × Anzahl × Länge)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "brandlast.out_laenge",
    "feld": "out_laenge",
    "label": "Länge des FluchtwegsL",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "brandlast.out_prom",
    "feld": "out_prom",
    "label": "Brandlast pro Laufmeterq = Σ MJ ÷ L",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "brandlast.out_limit",
    "feld": "out_limit",
    "label": "Grenzwertqzul",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "brandlast.out_reserve",
    "feld": "out_reserve",
    "label": "Reserve bis zum Grenzwertqzul − q",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "brandlast.out_ausl",
    "feld": "out_ausl",
    "label": "Auslastungq ÷ qzul × 100 %",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "brandlast.cardErgebnis",
    "feld": "cardErgebnis",
    "label": "Card Ergebnis",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "druckanstieg": {
  "key": "druckanstieg",
  "datei": "sb_druckanstieg",
  "label": "Druckanstieg bei Temperaturänderung",
  "kategorie": "Sanitär",
  "autosave": "druckanstieg",
  "werte": [
   {
    "id": "druckanstieg.sp_p1",
    "feld": "sp_p1",
    "label": "Druckdispo / Angabe Wasserwerk / Druckerhöhung / TLF",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_hv",
    "feld": "sp_hv",
    "label": "Verteilbatterie → tiefstgelegene Entnahmestelle (nach unten)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_t1",
    "feld": "sp_t1",
    "label": "Erstbefüllung (Kaltwasser)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_t2",
    "feld": "sp_t2",
    "label": "z.B. Erwärmung durch Umgebung / Stagnation",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_sys",
    "feld": "sp_sys",
    "label": "Katalog aus dem Druckverlust-Modul — Werkstoff setzt α vor",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_dim",
    "feld": "sp_dim",
    "label": "Innen-ø aus der Rohrtabelle des Systems",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_l",
    "feld": "sp_l",
    "label": "Die Länge ist für den Druckanstieg irrelevant — nur ΔT zählt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_beta",
    "feld": "sp_beta",
    "label": "Wasser 20 °C = 0.21 · 10⁻³ K⁻¹",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "·10⁻³ K⁻¹",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_alpha",
    "feld": "sp_alpha",
    "label": "CNS/Edelstahl 16.5 · Kupfer 16.6 · verz. Stahl 12.0",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "·10⁻⁶ K⁻¹",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_bulk",
    "feld": "sp_bulk",
    "label": "Verhältnis Druckdifferenz zu relativer Volumenänderung (2.2·10⁹ Pa)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.sp_fsv",
    "feld": "sp_fsv",
    "label": "Federkraft-Zuschlag auf den Ruhedruck (0.3 = 30 %)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_druckanstieg__<objektId>"
   },
   {
    "id": "druckanstieg.ansprechdruck_out",
    "feld": "ansprechdruck_out",
    "label": "Ansprechdruck",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.ruhedruck_out",
    "feld": "ruhedruck_out",
    "label": "Ruhedruck",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.gesamtdruck_out",
    "feld": "gesamtdruck_out",
    "label": "Gesamtdruck",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.druckanstieg_out",
    "feld": "druckanstieg_out",
    "label": "Druckanstieg",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.rohrDa_out",
    "feld": "rohrDa_out",
    "label": "Rohr Da",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_phgeo",
    "feld": "sp_out_phgeo",
    "label": "Druckgewinn [pHgeo] 0.0981·hv",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_rho1",
    "feld": "sp_out_rho1",
    "label": "Dichte bei T1 [ρ1]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_rho2",
    "feld": "sp_out_rho2",
    "label": "Dichte bei T2 [ρ2]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_dt",
    "feld": "sp_out_dt",
    "label": "Temperaturänderung [ΔT]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_di",
    "feld": "sp_out_di",
    "label": "Durchmesser innen [di] aus Rohrtabelle",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_v0",
    "feld": "sp_out_v0",
    "label": "Volumen vor Erwärmung [v0] (di²·π/4)·l",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_dv",
    "feld": "sp_out_dv",
    "label": "Volumenänderung Wasser [ΔV] v0·β·ΔT",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_v1",
    "feld": "sp_out_v1",
    "label": "Volumen nach Erwärmung [v1]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_dvrohr",
    "feld": "sp_out_dvrohr",
    "label": "Volumenänderung Rohr [ΔV Rohr] v0·3·α·ΔT",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_dveff",
    "feld": "sp_out_dveff",
    "label": "Wirksame Volumenänderung [ΔV] v1 − v0 − ΔV Rohr",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_ratio",
    "feld": "sp_out_ratio",
    "label": "Verhältnis der Volumenänderung ΔV / v0",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_dp",
    "feld": "sp_out_dp",
    "label": "Druckanstieg aufgrund Volumenänderung [Δp] (ΔV/v0)·K",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_p1",
    "feld": "sp_out_p1",
    "label": "Vordruck [p1]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_phgeo2",
    "feld": "sp_out_phgeo2",
    "label": "+ Druckgewinn [pHgeo]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_dp2",
    "feld": "sp_out_dp2",
    "label": "+ Druckanstieg [Δp]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_pmax",
    "feld": "sp_out_pmax",
    "label": "Ruhedruck an tiefster Stelle [pÜ max]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_pruhe",
    "feld": "sp_out_pruhe",
    "label": "Ruhedruck ohne Wärmeanstieg [p1+pHgeo]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckanstieg.sp_out_psv",
    "feld": "sp_out_psv",
    "label": "Ansprechdruck Sicherheitsventil [p SV] (p1+pHgeo)·(1+Schliessdruck)",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "druckdispositiv": {
  "key": "druckdispositiv",
  "datei": "sb_druckdispositiv",
  "label": "Druckdispositiv",
  "kategorie": "Sanitär",
  "autosave": "druckdispositiv",
  "werte": [
   {
    "id": "druckdispositiv.hReservoir",
    "feld": "hReservoir",
    "label": "Höhe Reservoir",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m ü.M.",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.hVerteilbatterie",
    "feld": "hVerteilbatterie",
    "label": "Höhe Verteilbatterie",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m ü.M.",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.schwankungNetz",
    "feld": "schwankungNetz",
    "label": "absolut oder in % des statischen Drucks",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.schwankungNetzMode",
    "feld": "schwankungNetzMode",
    "label": "schwankungNetzMode",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckdispositiv__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckdispositiv.versorgungsdruck",
    "feld": "versorgungsdruck",
    "label": "Angabe Gemeinde am Hausanschluss",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.hoehengewinn",
    "feld": "hoehengewinn",
    "label": "positiv = VB tiefer als Strasse",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.schwankungReserve",
    "feld": "schwankungReserve",
    "label": "absolut oder in % des Versorgungsdrucks",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.schwankungReserveMode",
    "feld": "schwankungReserveMode",
    "label": "schwankungReserveMode",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckdispositiv__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckdispositiv.dvHauszuleitung",
    "feld": "dvHauszuleitung",
    "label": "QHA aus der → LU-Zusammenstellung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.ddTsQ",
    "feld": "ddTsQ",
    "label": "Belastung Hausanschlussleitung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.ddTsRohr",
    "feld": "ddTsRohr",
    "label": "Rohr / Innendurchmesser di",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.ddTsDi",
    "feld": "ddTsDi",
    "label": "Innendurchmesser di",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mm",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.ddTsL",
    "feld": "ddTsL",
    "label": "Länge L",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.ddTsK",
    "feld": "ddTsK",
    "label": "Rauhigkeit k",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mm",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.ddTsZeta",
    "feld": "ddTsZeta",
    "label": "Bögen, Einführung, Absperrorgane",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.dvWasserzaehler",
    "feld": "dvWasserzaehler",
    "label": "Angabe Wasserwerk bzw. Zähler-Datenblatt (Hersteller)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.ruhedruckDM",
    "feld": "ruhedruckDM",
    "label": "Ruhedruck",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.deaVorgesehen",
    "feld": "deaVorgesehen",
    "label": "Ja = eine Druckerhöhungsanlage hebt den Druck auf den gewählten Ruhedruck",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.qDruckminderer",
    "feld": "qDruckminderer",
    "label": "Q für die Diagramm-Auswertung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.dvDruckminderer",
    "feld": "dvDruckminderer",
    "label": "Druckverlust Druckminderer",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.dvNachbehandlung",
    "feld": "dvNachbehandlung",
    "label": "Druckverlust Wassernachbehandlung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.nbEnthaertung",
    "feld": "nbEnthaertung",
    "label": "nbEnthaertung",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_druckdispositiv__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckdispositiv.dvNachbehandlungN2",
    "feld": "dvNachbehandlungN2",
    "label": "Enthärtung (Schema zeigt «E»)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.dvNachbehandlung2",
    "feld": "dvNachbehandlung2",
    "label": "dvNachbehandlung2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckdispositiv.dvNachbehandlungN3",
    "feld": "dvNachbehandlungN3",
    "label": "dvNachbehandlungN3",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckdispositiv.dvNachbehandlung3",
    "feld": "dvNachbehandlung3",
    "label": "dvNachbehandlung3",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckdispositiv.hHoechste",
    "feld": "hHoechste",
    "label": "positiv = über Verteilbatterie",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m ↑",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.hTiefste",
    "feld": "hTiefste",
    "label": "positiv = unter Verteilbatterie",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m ↓",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.dvInstallation",
    "feld": "dvInstallation",
    "label": "→ Wert aus der Druckverlustberechnung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckdispositiv__<objektId>"
   },
   {
    "id": "druckdispositiv.out-betrieb",
    "feld": "out-betrieb",
    "label": "Betriebsdruck nach Wasserzähler",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "druckdispositiv.ddReserveInfo",
    "feld": "ddReserveInfo",
    "label": "Dd Reserve Info",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "druckdispositiv.out-fliessdruck",
    "feld": "out-fliessdruck",
    "label": "Fliessdruck höchste Entnahmestelle",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "druckdispositiv.out-ruhedruck",
    "feld": "out-ruhedruck",
    "label": "Ruhedruck tiefste Entnahmestelle",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "druckdispositiv.out-druckdiff",
    "feld": "out-druckdiff",
    "label": "Druckdifferenz Vor- / Nachdruck",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "druckdispositiv.out-maxdv",
    "feld": "out-maxdv",
    "label": "Druckreserve Fliessdruck",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "druckdispositiv.th-reserve",
    "feld": "th-reserve",
    "label": "Druckreserve Fliessdruck",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckdispositiv.out-hoehendiff",
    "feld": "out-hoehendiff",
    "label": "Höhenunterschied Reservoir – Verteilbatterie",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "m"
   },
   {
    "id": "druckdispositiv.out-statisch",
    "feld": "out-statisch",
    "label": "Statischer Druck an Verteilbatterie",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "druckdispositiv.out-dmEinstell",
    "feld": "out-dmEinstell",
    "label": "Gewählter Ruhedruck (Einstelldruck Druckminderer)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "druckdispositiv.out-eingangsdruck",
    "feld": "out-eingangsdruck",
    "label": "Eingangsdruck 2. Teil (Basis)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "druckdispositiv.out-dh-oben",
    "feld": "out-dh-oben",
    "label": "Druckhöhe höchste Entnahmestelle",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "druckdispositiv.out-dh-unten",
    "feld": "out-dh-unten",
    "label": "Druckhöhe tiefste Entnahmestelle",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "bar"
   }
  ]
 },
 "druckerhoehung": {
  "key": "druckerhoehung",
  "datei": "sb_druckerhoehung",
  "label": "Druckerhöhungsanlage",
  "kategorie": "Sanitär",
  "autosave": "druckerhoehung",
  "werte": [
   {
    "id": "druckerhoehung.unitPressureToggle",
    "feld": "unitPressureToggle",
    "label": "unitPressureToggle",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.unitFlowToggle",
    "feld": "unitFlowToggle",
    "label": "unitFlowToggle",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.vfd_kat",
    "feld": "vfd_kat",
    "label": "Diagrammwahl SVGW W3",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_LU",
    "feld": "vfd_LU",
    "label": "Summe aller Lasteinheiten · → LU-Zusammenstellung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "LU",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_qdvN1",
    "feld": "vfd_qdvN1",
    "label": "Dauer-/ Spezialverbraucher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_qdv",
    "feld": "vfd_qdv",
    "label": "Dauer-/ Spezialverbraucher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_qdvN2",
    "feld": "vfd_qdvN2",
    "label": "Weiterer Dauer-/Spezialverbraucher — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_qdv2",
    "feld": "vfd_qdv2",
    "label": "vfd_qdv2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.vfd_qdvN3",
    "feld": "vfd_qdvN3",
    "label": "Weiterer Dauer-/Spezialverbraucher — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_qdv3",
    "feld": "vfd_qdv3",
    "label": "vfd_qdv3",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.vfd_qdvN4",
    "feld": "vfd_qdvN4",
    "label": "Weiterer Dauer-/Spezialverbraucher — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_qdv4",
    "feld": "vfd_qdv4",
    "label": "vfd_qdv4",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.vfd_pv",
    "feld": "vfd_pv",
    "label": "Versorgungsdruck am DEA-Eintritt · → Druckdispositiv",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_pF",
    "feld": "vfd_pF",
    "label": "Mindestdruck Entnahmestelle",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_h",
    "feld": "vfd_h",
    "label": "DEA bis ungünstigste Entnahme",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_pDl",
    "feld": "vfd_pDl",
    "label": "Rohrnetz, Armaturen · → Druckverlustberechnung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_pDsN1",
    "feld": "vfd_pDsN1",
    "label": "Druckverlust Sonstiges pΔ1",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_pDs",
    "feld": "vfd_pDs",
    "label": "Druckverlust Sonstiges pΔ1",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_pDsN2",
    "feld": "vfd_pDsN2",
    "label": "vfd_pDsN2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.vfd_pDs2",
    "feld": "vfd_pDs2",
    "label": "vfd_pDs2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.vfd_pDsN3",
    "feld": "vfd_pDsN3",
    "label": "Weiterer Druckverlust — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_pDs3",
    "feld": "vfd_pDs3",
    "label": "vfd_pDs3",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.vfd_pDsN4",
    "feld": "vfd_pDsN4",
    "label": "Weiterer Druckverlust — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_pDs4",
    "feld": "vfd_pDs4",
    "label": "vfd_pDs4",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.vfd_pU",
    "feld": "vfd_pU",
    "label": "Sicherheitszuschlag",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.vfd_np",
    "feld": "vfd_np",
    "label": "vfd_np",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.ves_kat",
    "feld": "ves_kat",
    "label": "Diagrammwahl SVGW W3",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_LU",
    "feld": "ves_LU",
    "label": "Summe aller Lasteinheiten · → LU-Zusammenstellung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "LU",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_qdvN1",
    "feld": "ves_qdvN1",
    "label": "Dauer-/ Spezialverbraucher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_qdv",
    "feld": "ves_qdv",
    "label": "Dauer-/ Spezialverbraucher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_qdvN2",
    "feld": "ves_qdvN2",
    "label": "Weiterer Dauer-/Spezialverbraucher — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_qdv2",
    "feld": "ves_qdv2",
    "label": "ves_qdv2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.ves_qdvN3",
    "feld": "ves_qdvN3",
    "label": "Weiterer Dauer-/Spezialverbraucher — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_qdv3",
    "feld": "ves_qdv3",
    "label": "ves_qdv3",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.ves_qdvN4",
    "feld": "ves_qdvN4",
    "label": "Weiterer Dauer-/Spezialverbraucher — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_qdv4",
    "feld": "ves_qdv4",
    "label": "ves_qdv4",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.ves_pv",
    "feld": "ves_pv",
    "label": "Versorgungsdruck am DEA-Eintritt · → Druckdispositiv",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_pF",
    "feld": "ves_pF",
    "label": "Mindestdruck Entnahmestelle",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_h",
    "feld": "ves_h",
    "label": "DEA bis ungünstigste Entnahme",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_pDl",
    "feld": "ves_pDl",
    "label": "Rohrnetz, Armaturen · → Druckverlustberechnung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_pDsN1",
    "feld": "ves_pDsN1",
    "label": "Druckverlust Sonstiges pΔ1",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_pDs",
    "feld": "ves_pDs",
    "label": "Druckverlust Sonstiges pΔ1",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_pDsN2",
    "feld": "ves_pDsN2",
    "label": "ves_pDsN2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.ves_pDs2",
    "feld": "ves_pDs2",
    "label": "ves_pDs2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.ves_pDsN3",
    "feld": "ves_pDsN3",
    "label": "Weiterer Druckverlust — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_pDs3",
    "feld": "ves_pDs3",
    "label": "ves_pDs3",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.ves_pDsN4",
    "feld": "ves_pDsN4",
    "label": "Weiterer Druckverlust — wird zur Summe addiert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_pDs4",
    "feld": "ves_pDs4",
    "label": "ves_pDs4",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckerhoehung.ves_pSi",
    "feld": "ves_pSi",
    "label": "Druckerhöhung Reserve",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_pS",
    "feld": "ves_pS",
    "label": "Differenz Ein-/Ausschalt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_VM",
    "feld": "ves_VM",
    "label": "Leer = Spitzenvolumenstrom",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_np",
    "feld": "ves_np",
    "label": "Redundanz beachten",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "Stk.",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_n",
    "feld": "ves_n",
    "label": "Typ. 20–30 pro Stunde",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "/h",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.ves_VBsel",
    "feld": "ves_VBsel",
    "label": "Nächstgrösseres Handelsprodukt ≥ VB",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l",
    "quelle": "gema_druckerhoehung__<objektId>"
   },
   {
    "id": "druckerhoehung.volumenstrom_out",
    "feld": "volumenstrom_out",
    "label": "Volumenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.nachdruck_out",
    "feld": "nachdruck_out",
    "label": "Nachdruck",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.bauart_out",
    "feld": "bauart_out",
    "label": "Bauart",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.vfd_out_vz",
    "feld": "vfd_out_vz",
    "label": "Volumenstrom VZ",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.vfd_out_pv",
    "feld": "vfd_out_pv",
    "label": "Vordruck pV",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.vfd_out_pN",
    "feld": "vfd_out_pN",
    "label": "Nachdruck pN",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.vfd_out_pE",
    "feld": "vfd_out_pE",
    "label": "Sollwertdruck pE",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.vfd_out_H1",
    "feld": "vfd_out_H1",
    "label": "Manometrische Förderhöhe H1 (zu erzeugen)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.vfd_out_H1bar",
    "feld": "vfd_out_H1bar",
    "label": "Manometrische Förderhöhe H1 in bar",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.vfd_out_H2",
    "feld": "vfd_out_H2",
    "label": "Erforderlicher Enddruck H2",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.vfd_out_p2",
    "feld": "vfd_out_p2",
    "label": "Erforderlicher Enddruck p2",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.vfd_out_k",
    "feld": "vfd_out_k",
    "label": "K-Wert",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.ves_out_vz",
    "feld": "ves_out_vz",
    "label": "Volumenstrom VZ",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.ves_out_pN",
    "feld": "ves_out_pN",
    "label": "Nachdruck pN",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.ves_out_pE",
    "feld": "ves_out_pE",
    "label": "Einschaltdruck pE",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.ves_out_pA",
    "feld": "ves_out_pA",
    "label": "Ausschaltdruck pA",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.ves_out_VN",
    "feld": "ves_out_VN",
    "label": "Nutzvolumen VN",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.ves_out_VB",
    "feld": "ves_out_VB",
    "label": "Behältervolumen VB",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.ves_out_k",
    "feld": "ves_out_k",
    "label": "K-Wert",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckerhoehung.ves_out_pf",
    "feld": "ves_out_pf",
    "label": "Plausibilität",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "druckverlust": {
  "key": "druckverlust",
  "datei": "sb_druckverlust",
  "label": "Druckverlust",
  "kategorie": "Sanitär",
  "autosave": "druckverlust",
  "werte": [
   {
    "id": "druckverlust.inp_apparat",
    "feld": "inp_apparat",
    "label": "inp_apparat",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_druckverlust__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckverlust.inp_globalsys",
    "feld": "inp_globalsys",
    "label": "Gilt für alle Teilstrecken — bei «gemischter Installation» pro Teilstrecke wählbar",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckverlust__<objektId>"
   },
   {
    "id": "druckverlust.inp_gemischt",
    "feld": "inp_gemischt",
    "label": "inp_gemischt",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_druckverlust__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckverlust.inp_medium",
    "feld": "inp_medium",
    "label": "gemischte Installation",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckverlust__<objektId>"
   },
   {
    "id": "druckverlust.inp_temp",
    "feld": "inp_temp",
    "label": "inp_temp",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_druckverlust__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckverlust.inp_flowmode",
    "feld": "inp_flowmode",
    "label": "inp_flowmode",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_druckverlust__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckverlust.out_rho_display",
    "feld": "out_rho_display",
    "label": "Rho display",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "druckverlust.out_nu_display",
    "feld": "out_nu_display",
    "label": "Nu display",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "druckverlust_erdgas": {
  "key": "druckverlust_erdgas",
  "datei": "sb_druckverlust_erdgas",
  "label": "Druckverlust Erdgas — Rohrweiten nach Druckverlust",
  "kategorie": "Sanitär",
  "autosave": "druckverlust_erdgas",
  "werte": [
   {
    "id": "druckverlust_erdgas.eg_hib",
    "feld": "eg_hib",
    "label": "informativ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/m³",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_wsn",
    "feld": "eg_wsn",
    "label": "informativ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/m³",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_rho",
    "feld": "eg_rho",
    "label": "Dichte ρ (Betrieb)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kg/m³",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_nu",
    "feld": "eg_nu",
    "label": "Standardwert: 11.41237 · 10⁻⁶ m²/s",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "10⁻⁶ m²/s",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_temp",
    "feld": "eg_temp",
    "label": "informativ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_luft",
    "feld": "eg_luft",
    "label": "informativ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_ueber",
    "feld": "eg_ueber",
    "label": "informativ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_rgas",
    "feld": "eg_rgas",
    "label": "informativ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "J/kgK",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_pmax",
    "feld": "eg_pmax",
    "label": "informativ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_pmin",
    "feld": "eg_pmin",
    "label": "informativ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_dpmax",
    "feld": "eg_dpmax",
    "label": "max. zul. Druckverlust",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_dpz",
    "feld": "eg_dpz",
    "label": "geht in die Vordimensionierung; in Tab ② als Δp bis Apparat der Zähler-Zeile erfassen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_hausanschluss",
    "feld": "eg_hausanschluss",
    "label": "Hausanschlussleitung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_hausinst",
    "feld": "eg_hausinst",
    "label": "Hausinstallation",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_standort",
    "feld": "eg_standort",
    "label": "Standort Gaszähler",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_ztyp",
    "feld": "eg_ztyp",
    "label": "Zähler Fabrikat / Typ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_vd_va",
    "feld": "eg_vd_va",
    "label": "massgebender Volumenstrom (aus Tab ③ oder Summe Anschlusswerte)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_vd_l",
    "feld": "eg_vd_l",
    "label": "Längster Streckenzug",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_vd_ew",
    "feld": "eg_vd_ew",
    "label": "Zuschlag Einzelwiderstände",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_gaw",
    "feld": "eg_gaw",
    "label": "GAW-Stufe für Spitzenformel",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "m³/h",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_kuechen",
    "feld": "eg_kuechen",
    "label": "Anzahl Küchen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk.",
    "quelle": "gema_druckverlust_erdgas__<objektId>"
   },
   {
    "id": "druckverlust_erdgas.eg_rows",
    "feld": "eg_rows",
    "label": "eg_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_druckverlust_erdgas__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckverlust_erdgas.eg_out_vd_d",
    "feld": "eg_out_vd_d",
    "label": "Erforderliche Rohrweite innen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_erdgas.eg_out_vd_crni",
    "feld": "eg_out_vd_crni",
    "label": "Chromstahl (Cr-Ni-Press)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_erdgas.eg_out_vd_cu",
    "feld": "eg_out_vd_cu",
    "label": "Kupfer",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_erdgas.eg_out_vd_pe",
    "feld": "eg_out_vd_pe",
    "label": "PE 80 (MRS) S5",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_erdgas.eg_out_vd_st",
    "feld": "eg_out_vd_st",
    "label": "Stahl verzinkt",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_erdgas.eg_kpi_res",
    "feld": "eg_kpi_res",
    "label": "Stahl verzinkt",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_erdgas.eg_out_aw",
    "feld": "eg_out_aw",
    "label": "Summe Anschlusswerte AW",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_erdgas.eg_out_gawmax",
    "feld": "eg_out_gawmax",
    "label": "Grösster Anschlusswert (einzeln)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_erdgas.eg_out_spitze",
    "feld": "eg_out_spitze",
    "label": "Spitzenvolumenstrom Haushalt V̇ = AW^e · f (feste Stufen) · max. AW",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_erdgas.eg_out_kuechen",
    "feld": "eg_out_kuechen",
    "label": "V̇A max gemäss Tabelle",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "druckverlust_medizinalgas": {
  "key": "druckverlust_medizinalgas",
  "datei": "sb_druckverlust_medizinalgas",
  "label": "Druckverlust Medizinalgase — Rohrweiten nach Druckverlust",
  "kategorie": "Sanitär",
  "autosave": "druckverlust_medizinalgas",
  "werte": [
   {
    "id": "druckverlust_medizinalgas.mg_medium",
    "feld": "mg_medium",
    "label": "Medium",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "—",
    "quelle": "gema_druckverlust_medizinalgas__<objektId>"
   },
   {
    "id": "druckverlust_medizinalgas.mg_temp",
    "feld": "mg_temp",
    "label": "Tabellenzeile mit zugehörigem Sättigungsdampfdruck ps",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "°C",
    "quelle": "gema_druckverlust_medizinalgas__<objektId>"
   },
   {
    "id": "druckverlust_medizinalgas.mg_luft",
    "feld": "mg_luft",
    "label": "Luftdruck",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_druckverlust_medizinalgas__<objektId>"
   },
   {
    "id": "druckverlust_medizinalgas.mg_ueber",
    "feld": "mg_ueber",
    "label": "Betriebsüberdruck der Leitung · Vakuum negativ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_druckverlust_medizinalgas__<objektId>"
   },
   {
    "id": "druckverlust_medizinalgas.mg_saett",
    "feld": "mg_saett",
    "label": "Feuchteanteil (z.B. feuchte Druckluft) — Standard 0 %",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_druckverlust_medizinalgas__<objektId>"
   },
   {
    "id": "druckverlust_medizinalgas.mg_dpmax",
    "feld": "mg_dpmax",
    "label": "optional — Prüfmass für die Δp-Kumulation in Tab ② (leer = keine Prüfung)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_druckverlust_medizinalgas__<objektId>"
   },
   {
    "id": "druckverlust_medizinalgas.mg_rows",
    "feld": "mg_rows",
    "label": "mg_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_druckverlust_medizinalgas__<objektId>",
    "unsicher": true
   },
   {
    "id": "druckverlust_medizinalgas.mg_out_rs",
    "feld": "mg_out_rs",
    "label": "Gaskonstante Rs",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_medizinalgas.mg_out_eta",
    "feld": "mg_out_eta",
    "label": "dyn. Viskosität η",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_medizinalgas.mg_out_ps",
    "feld": "mg_out_ps",
    "label": "Sättigungsdampfdruck ps",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_medizinalgas.mg_out_rhon",
    "feld": "mg_out_rhon",
    "label": "Normdichte ρN",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_medizinalgas.mg_out_rhob",
    "feld": "mg_out_rhob",
    "label": "Betriebsdichte ρB",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_medizinalgas.mg_out_nu",
    "feld": "mg_out_nu",
    "label": "kin. Viskosität ν",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "druckverlust_medizinalgas.mg_kpi_res",
    "feld": "mg_kpi_res",
    "label": "Mg kpi",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "du_zusammenstellung": {
  "key": "du_zusammenstellung",
  "datei": "sb_du_zusammenstellung",
  "label": "DU-Zusammenstellung",
  "kategorie": "Sanitär",
  "autosave": "du_zusammenstellung",
  "werte": [
   {
    "id": "du_zusammenstellung.kFrei",
    "feld": "kFrei",
    "label": "Eigener K-Wert",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_du_zusammenstellung__<objektId>"
   },
   {
    "id": "du_zusammenstellung.qcn1",
    "feld": "qcn1",
    "label": "Qc1",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_du_zusammenstellung__<objektId>"
   },
   {
    "id": "du_zusammenstellung.qc1",
    "feld": "qc1",
    "label": "qc1",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_du_zusammenstellung__<objektId>",
    "unsicher": true
   },
   {
    "id": "du_zusammenstellung.qcn2",
    "feld": "qcn2",
    "label": "Qc2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_du_zusammenstellung__<objektId>"
   },
   {
    "id": "du_zusammenstellung.qc2",
    "feld": "qc2",
    "label": "qc2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_du_zusammenstellung__<objektId>",
    "unsicher": true
   },
   {
    "id": "du_zusammenstellung.qcn3",
    "feld": "qcn3",
    "label": "Qc3",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_du_zusammenstellung__<objektId>"
   },
   {
    "id": "du_zusammenstellung.qc3",
    "feld": "qc3",
    "label": "qc3",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_du_zusammenstellung__<objektId>",
    "unsicher": true
   }
  ]
 },
 "enthaertungsanlage": {
  "key": "enthaertungsanlage",
  "datei": "sa_enthaertung",
  "label": "Enthärtungsanlage",
  "kategorie": "Sanitäranlagen",
  "autosave": "enthaertungsanlage",
  "werte": [
   {
    "id": "enthaertungsanlage.hr_fh",
    "feld": "hr_fh",
    "label": "Rohwasserhärte HR trinkwasser.ch",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°fH",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.na_m",
    "feld": "na_m",
    "label": "Natriumgehalt M trinkwasser.ch",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mg/l",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lbl_A",
    "feld": "lbl_A",
    "label": "A",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_A",
    "feld": "lu_A",
    "label": "lu_A",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.n_A",
    "feld": "n_A",
    "label": "n_A",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_A",
    "feld": "nm_A",
    "label": "nm_A",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.v_A",
    "feld": "v_A",
    "label": "v_A",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_A",
    "feld": "m_A",
    "label": "m_A",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.lbl_B",
    "feld": "lbl_B",
    "label": "B",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_B",
    "feld": "lu_B",
    "label": "lu_B",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.n_B",
    "feld": "n_B",
    "label": "n_B",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_B",
    "feld": "nm_B",
    "label": "nm_B",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.v_B",
    "feld": "v_B",
    "label": "v_B",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_B",
    "feld": "m_B",
    "label": "m_B",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.lbl_C",
    "feld": "lbl_C",
    "label": "C",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_C",
    "feld": "lu_C",
    "label": "lu_C",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.n_C",
    "feld": "n_C",
    "label": "n_C",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_C",
    "feld": "nm_C",
    "label": "nm_C",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.v_C",
    "feld": "v_C",
    "label": "v_C",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_C",
    "feld": "m_C",
    "label": "m_C",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.lbl_D",
    "feld": "lbl_D",
    "label": "D",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_D",
    "feld": "lu_D",
    "label": "lu_D",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.n_D",
    "feld": "n_D",
    "label": "n_D",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_D",
    "feld": "nm_D",
    "label": "nm_D",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.v_D",
    "feld": "v_D",
    "label": "v_D",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_D",
    "feld": "m_D",
    "label": "m_D",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.lbl_E",
    "feld": "lbl_E",
    "label": "E",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_E",
    "feld": "lu_E",
    "label": "Dauerlast — Eingabe direkt als l/s (kein W3-Diagramm)",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.n_E",
    "feld": "n_E",
    "label": "n_E",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_E",
    "feld": "nm_E",
    "label": "Manueller Zuschlag — wird 1:1 zum Volumenstrom der Zeile addiert",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.v_E",
    "feld": "v_E",
    "label": "v_E",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_E",
    "feld": "m_E",
    "label": "m_E",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.lbl_F",
    "feld": "lbl_F",
    "label": "F",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_F",
    "feld": "lu_F",
    "label": "Dauerlast — Eingabe direkt als l/s (kein W3-Diagramm)",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.n_F",
    "feld": "n_F",
    "label": "n_F",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_F",
    "feld": "nm_F",
    "label": "Manueller Zuschlag — wird 1:1 zum Volumenstrom der Zeile addiert",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.v_F",
    "feld": "v_F",
    "label": "v_F",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_F",
    "feld": "m_F",
    "label": "m_F",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.lbl_G",
    "feld": "lbl_G",
    "label": "G",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_G",
    "feld": "lu_G",
    "label": "lu_G",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.n_G",
    "feld": "n_G",
    "label": "n_G",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_G",
    "feld": "nm_G",
    "label": "nm_G",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.v_G",
    "feld": "v_G",
    "label": "v_G",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_G",
    "feld": "m_G",
    "label": "m_G",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.lbl_H",
    "feld": "lbl_H",
    "label": "H",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_H",
    "feld": "lu_H",
    "label": "lu_H",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.n_H",
    "feld": "n_H",
    "label": "n_H",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_H",
    "feld": "nm_H",
    "label": "nm_H",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.v_H",
    "feld": "v_H",
    "label": "v_H",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_H",
    "feld": "m_H",
    "label": "m_H",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.lbl_I",
    "feld": "lbl_I",
    "label": "I",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_I",
    "feld": "lu_I",
    "label": "lu_I",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.n_I",
    "feld": "n_I",
    "label": "n_I",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_I",
    "feld": "nm_I",
    "label": "nm_I",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.v_I",
    "feld": "v_I",
    "label": "v_I",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_I",
    "feld": "m_I",
    "label": "m_I",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.lbl_J",
    "feld": "lbl_J",
    "label": "J",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.lu_J",
    "feld": "lu_J",
    "label": "lu_J",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.n_J",
    "feld": "n_J",
    "label": "n_J",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.nm_J",
    "feld": "nm_J",
    "label": "nm_J",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.v_J",
    "feld": "v_J",
    "label": "v_J",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.m_J",
    "feld": "m_J",
    "label": "m_J",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.enth_straenge",
    "feld": "enth_straenge",
    "label": "enth_straenge",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_enthaertungsanlage__<objektId>",
    "unsicher": true
   },
   {
    "id": "enthaertungsanlage.va_05",
    "feld": "va_05",
    "label": "Leistung bei 0.5 bar",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.va_10",
    "feld": "va_10",
    "label": "Leistung bei 1.0 bar",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.ca_mol",
    "feld": "ca_mol",
    "label": "Enthärtungskapazität CA",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mol",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.salt_per_reg",
    "feld": "salt_per_reg",
    "label": "Salzverbrauch / Regeneration",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kg",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.salt_price",
    "feld": "salt_price",
    "label": "Salzkosten SK",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Fr./kg",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   },
   {
    "id": "enthaertungsanlage.enth_soletank",
    "feld": "enth_soletank",
    "label": "Grösse Soletank",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l",
    "quelle": "gema_enthaertungsanlage__<objektId>"
   }
  ]
 },
 "fettabscheider": {
  "key": "fettabscheider",
  "datei": "sa_fettabscheider",
  "label": "Fettabscheider",
  "kategorie": "Sanitäranlagen",
  "autosave": "fettabscheider",
  "werte": [
   {
    "id": "fettabscheider.ns_out",
    "feld": "ns_out",
    "label": "Ns",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fettabscheider.schlammraum_out",
    "feld": "schlammraum_out",
    "label": "Schlammraum",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "fluessiggas": {
  "key": "fluessiggas",
  "datei": "sb_fluessiggas",
  "label": "Flüssiggas LPG — Rampen-/Tankgrösse",
  "kategorie": "Sanitär",
  "autosave": "fluessiggas",
  "werte": [
   {
    "id": "fluessiggas.gs_ablese",
    "feld": "gs_ablese",
    "label": "überschreibt den Vorschlag · leer = Näherung verwenden",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kg/h",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_f1",
    "feld": "gs_f1",
    "label": "Flaschengrösse",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_t1",
    "feld": "gs_t1",
    "label": "Umgebungstemperatur",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_z1",
    "feld": "gs_z1",
    "label": "max. Entnahmezeit",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_f2g",
    "feld": "gs_f2g",
    "label": "Flaschengrösse",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_t2g",
    "feld": "gs_t2g",
    "label": "Umgebungstemperatur",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_z2g",
    "feld": "gs_z2g",
    "label": "max. Entnahmezeit",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_f2s",
    "feld": "gs_f2s",
    "label": "Flaschengrösse",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_t2s",
    "feld": "gs_t2s",
    "label": "Umgebungstemperatur",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_z2s",
    "feld": "gs_z2s",
    "label": "max. Entnahmezeit",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_tank",
    "feld": "gs_tank",
    "label": "Behältervolumen",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_tz",
    "feld": "gs_tz",
    "label": "Verdampfungsleistung bei",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_wahl",
    "feld": "gs_wahl",
    "label": "Gewählte Variante",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_fluessiggas__<objektId>"
   },
   {
    "id": "fluessiggas.gs_p0",
    "feld": "gs_p0",
    "label": "gs_p0",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_fluessiggas__<objektId>",
    "unsicher": true
   },
   {
    "id": "fluessiggas.gs_p1",
    "feld": "gs_p1",
    "label": "gs_p1",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_fluessiggas__<objektId>",
    "unsicher": true
   },
   {
    "id": "fluessiggas.gs_p2",
    "feld": "gs_p2",
    "label": "gs_p2",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_fluessiggas__<objektId>",
    "unsicher": true
   },
   {
    "id": "fluessiggas.gs_p3",
    "feld": "gs_p3",
    "label": "gs_p3",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_fluessiggas__<objektId>",
    "unsicher": true
   },
   {
    "id": "fluessiggas.gs_p4",
    "feld": "gs_p4",
    "label": "gs_p4",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_fluessiggas__<objektId>",
    "unsicher": true
   },
   {
    "id": "fluessiggas.gs_p5",
    "feld": "gs_p5",
    "label": "gs_p5",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_fluessiggas__<objektId>",
    "unsicher": true
   },
   {
    "id": "fluessiggas.gs_rows",
    "feld": "gs_rows",
    "label": "gs_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_fluessiggas__<objektId>",
    "unsicher": true
   },
   {
    "id": "fluessiggas.totalMassenstrom_out",
    "feld": "totalMassenstrom_out",
    "label": "Total Massenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.grundlast_out",
    "feld": "grundlast_out",
    "label": "Grundlast",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.spitzenmassenstrom_out",
    "feld": "spitzenmassenstrom_out",
    "label": "Spitzenmassenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.jahresverbrauch_out",
    "feld": "jahresverbrauch_out",
    "label": "Jahresverbrauch",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_sumteil",
    "feld": "gs_out_sumteil",
    "label": "Summe Massenstrom «Teil %»",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_sum100",
    "feld": "gs_out_sum100",
    "label": "Summe Massenstrom «100 %»",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_grteil",
    "feld": "gs_out_grteil",
    "label": "grösster angeschlossener Apparat der «Teil %»",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_diagx",
    "feld": "gs_out_diagx",
    "label": "Eingang x-Achse: Σ ṁ «Teil %»",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_diagk",
    "feld": "gs_out_diagk",
    "label": "Kurvenschar: grösster Teil-Apparat",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_naeher",
    "feld": "gs_out_naeher",
    "label": "Näherungswert (Vorschlag) ṁs = ṁg·(50/ṁg)^(u^1.045), u = ln(ṁA/ṁg)/ln(500/ṁg)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_spitze",
    "feld": "gs_out_spitze",
    "label": "Ergibt Spitzenmassenstrom gemäss Diagramm 1",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_total",
    "feld": "gs_out_total",
    "label": "Total Massenstrom (Σ 100 % + ṁs)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v1t",
    "feld": "gs_out_v1t",
    "label": "Total Massenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v1v",
    "feld": "gs_out_v1v",
    "label": "Verdampferleistung pro vollem Behälter (Tab. 15)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v1n",
    "feld": "gs_out_v1n",
    "label": "Anzahl Behälter im Betrieb",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v1rampe",
    "feld": "gs_out_v1rampe",
    "label": "Rampengrösse (Betriebs- + Reservebehälter)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v2vg",
    "feld": "gs_out_v2vg",
    "label": "Verdampferleistung / Behälter",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v2ng",
    "feld": "gs_out_v2ng",
    "label": "Anzahl Behälter (Grundlast)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v2vs",
    "feld": "gs_out_v2vs",
    "label": "Verdampferleistung / Behälter",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v2ns",
    "feld": "gs_out_v2ns",
    "label": "Anzahl Behälter (Spitze)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v2n",
    "feld": "gs_out_v2n",
    "label": "Total Behälter (aufgerundet)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v2rampe",
    "feld": "gs_out_v2rampe",
    "label": "Rampengrösse (Betriebs- + Reservebehälter)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v3t",
    "feld": "gs_out_v3t",
    "label": "Total Massenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v3ue",
    "feld": "gs_out_v3ue",
    "label": "Verdampferleistung Tank überflur (Tab. 17)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v3un",
    "feld": "gs_out_v3un",
    "label": "Verdampferleistung Tank unterflur (− 10 %)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_v3txt",
    "feld": "gs_out_v3txt",
    "label": "Verdampferleistung des Tank-Behälters",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_wahl",
    "feld": "gs_out_wahl",
    "label": "Gewählte Konfiguration",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_zwger",
    "feld": "gs_out_zwger",
    "label": "Zwischentotal Jahresverbrauch der Geräte",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_zwpers",
    "feld": "gs_out_zwpers",
    "label": "Zwischentotal Jahresverbrauch pro Personen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_jvtotal",
    "feld": "gs_out_jvtotal",
    "label": "Gesamttotal Jahresverbrauch",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_wlabel",
    "feld": "gs_out_wlabel",
    "label": "Gewählte Konfiguration",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_wbasis",
    "feld": "gs_out_wbasis",
    "label": "Verfügbare Menge pro Wechsel/Befüllung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_weinheit",
    "feld": "gs_out_weinheit",
    "label": "Verfügbare Menge pro Wechsel/Befüllung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "fluessiggas.gs_out_wn",
    "feld": "gs_out_wn",
    "label": "Wechsel pro Jahr",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "frischwasserstation": {
  "key": "frischwasserstation",
  "datei": "sa_frischwasserstation",
  "label": "Frischwasserstation",
  "kategorie": "Sanitäranlagen",
  "autosave": "frischwasserstation",
  "werte": [
   {
    "id": "frischwasserstation.fw_tbExt",
    "feld": "fw_tbExt",
    "label": "leer = Summe der Tabelle oben",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/d",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_verlust",
    "feld": "fw_verlust",
    "label": "Verteil-/Speicherverluste in % des Nutzbedarfs",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_fabDusche",
    "feld": "fw_fabDusche",
    "label": "beim ausgelegten Fliessdruck",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/min",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_vDusche",
    "feld": "fw_vDusche",
    "label": "fw_vDusche",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/min",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fw_fabWanne",
    "feld": "fw_fabWanne",
    "label": "pro Badewanne",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/min",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_vWanne",
    "feld": "fw_vWanne",
    "label": "fw_vWanne",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/min",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fw_vZusatz",
    "feld": "fw_vZusatz",
    "label": "Zusätzlicher WW-Bedarf",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/min",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_uV",
    "feld": "fw_uV",
    "label": "Herstellerangabe",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/min",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_uP1",
    "feld": "fw_uP1",
    "label": "bei Fliessdruck",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_uP2",
    "feld": "fw_uP2",
    "label": "mind. 1 bar, Herstellerangaben beachten",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_gz",
    "feld": "fw_gz",
    "label": "Gleichzeitigkeit gewählt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_tww",
    "feld": "fw_tww",
    "label": "FWS-Austritt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_tkw",
    "feld": "fw_tkw",
    "label": "KW-Eintritt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_tmw",
    "feld": "fw_tmw",
    "label": "an der Zapfstelle",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_on",
    "feld": "fwg_on",
    "label": "verwenden",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_persOverride",
    "feld": "fwg_persOverride",
    "label": "leer = automatisch aus Abschnitt 2 (SIA-Normbelegung): – Pers.",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Pers.",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_duschPd",
    "feld": "fwg_duschPd",
    "label": "Quelle REUWS/WRF 2016: 0.69",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "1/(P·d)",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_dauer",
    "feld": "fwg_dauer",
    "label": "Quelle SVES/gfs 2024, Mieter: 7.7 min — Aktiv-Fenster = gerundet",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "min",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_quantil",
    "feld": "fwg_quantil",
    "label": "Wahrscheinlichkeit, dass der Bedarf abgedeckt ist",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "–",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_zuschlag",
    "feld": "fwg_zuschlag",
    "label": "konservativ: eine Dusche über dem Quantil (min. 2)",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "–",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_reserve",
    "feld": "fwg_reserve",
    "label": "Regel-/Sicherheitsreserve",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_minDuschen",
    "feld": "fwg_minDuschen",
    "label": "leer = automatisch 0.1 · Personen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_primVl",
    "feld": "fwg_primVl",
    "label": "Vorlauf Primär",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_primRl",
    "feld": "fwg_primRl",
    "label": "Rücklauf Primär",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwg_p0w",
    "feld": "fwg_p0w",
    "label": "fwg_p0w",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p0c",
    "feld": "fwg_p0c",
    "label": "fwg_p0c",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p0s",
    "feld": "fwg_p0s",
    "label": "fwg_p0s",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p1w",
    "feld": "fwg_p1w",
    "label": "fwg_p1w",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p1c",
    "feld": "fwg_p1c",
    "label": "fwg_p1c",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p1s",
    "feld": "fwg_p1s",
    "label": "fwg_p1s",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p2w",
    "feld": "fwg_p2w",
    "label": "fwg_p2w",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p2c",
    "feld": "fwg_p2c",
    "label": "fwg_p2c",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p2s",
    "feld": "fwg_p2s",
    "label": "fwg_p2s",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p3w",
    "feld": "fwg_p3w",
    "label": "fwg_p3w",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p3c",
    "feld": "fwg_p3c",
    "label": "fwg_p3c",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_p3s",
    "feld": "fwg_p3s",
    "label": "fwg_p3s",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fw_zirkV",
    "feld": "fw_zirkV",
    "label": "aus → Zirkulationsberechnung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/h",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_zirkDt",
    "feld": "fw_zirkDt",
    "label": "Warmwasser − Zirkulation (T Zirk. mind. 52 °C)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "K",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_dtAuf",
    "feld": "fw_dtAuf",
    "label": "Kaltwasser → Warmwasser",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "K",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_vGewaehlt",
    "feld": "fw_vGewaehlt",
    "label": "Override — 0 = berechneter Wert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/min",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_on",
    "feld": "fwk_on",
    "label": "verwenden",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_n",
    "feld": "fwk_n",
    "label": "nebeneinander an der Wand — inkl. allfälliger Zirkulationsstation",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "Stk",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_sep",
    "feld": "fwk_sep",
    "label": "Separate Zirkulationsstation",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "–",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_primVl",
    "feld": "fwk_primVl",
    "label": "Speicher oben → Stationen (WW-Solltemperatur + Grädigkeit beachten)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_primRl",
    "feld": "fwk_primRl",
    "label": "tiefer Rücklauf = gute Speicher-Schichtung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_hl",
    "feld": "fwk_hl",
    "label": "verfügbare Leistung für die Speicherladung (Vorrangschaltung) — 0 = keine Ladeberechnung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_qheiz",
    "feld": "fwk_qheiz",
    "label": "für die zulässige Heiz-Unterbruchsdauer während der WW-Ladung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "W/m²",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_cgeb",
    "feld": "fwk_cgeb",
    "label": "spezifisch, z.B. Massivbau ≈ 105 Wh/m²K",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Wh/m²K",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_dtzul",
    "feld": "fwk_dtzul",
    "label": "tolerierter Raumtemperatur-Abfall während der Ladung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "K",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_spitze",
    "feld": "fwk_spitze",
    "label": "Stundenspitze",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fwk_reserveMin",
    "feld": "fwk_reserveMin",
    "label": "Anlaufzeit der Wärmeerzeugung — Reserve = Spitzenstunde anteilig",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "min",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.fw_rows",
    "feld": "fw_rows",
    "label": "Leistung Frischwasserstation",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_frischwasserstation__<objektId>"
   },
   {
    "id": "frischwasserstation.name_out",
    "feld": "name_out",
    "label": "Name",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.ort_out",
    "feld": "ort_out",
    "label": "Ort",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.objektId_out",
    "feld": "objektId_out",
    "label": "Objekt Id",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_tagesbedarf",
    "feld": "fw_out_tagesbedarf",
    "label": "Verlustzahl aus Mappe ② Verlustzahl",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_tagesbedarf2",
    "feld": "fw_out_tagesbedarf2",
    "label": "Tagesbedarf Warmwasser à 60 °C (inkl. Verluste) Bedarf · (1 + ϛIS/100)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_duschen",
    "feld": "fw_out_duschen",
    "label": "Fw duschen",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fw_out_wannen",
    "feld": "fw_out_wannen",
    "label": "Fw wannen",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fw_out_pers",
    "feld": "fw_out_pers",
    "label": "Fw pers",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fw_out_umrech",
    "feld": "fw_out_umrech",
    "label": "→ Volumenstrom beim ausgelegten Druck v·√(p₂/p₁)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_v100",
    "feld": "fw_out_v100",
    "label": "Volumenstrom 100 %",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_gzVorschlag",
    "feld": "fw_out_gzVorschlag",
    "label": "nach Anzahl Duschen+Wannen (Wohnungen 30–35 %)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "–"
   },
   {
    "id": "frischwasserstation.fw_out_vMisch",
    "feld": "fw_out_vMisch",
    "label": "Volumenstrom Wohnungsbau (Mischwasser)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_wwAnteil",
    "feld": "fw_out_wwAnteil",
    "label": "WW-Anteil (MW−KW)/(WW−KW)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_vWW",
    "feld": "fw_out_vWW",
    "label": "Volumenstrom Warmwasser Wohnungsbau",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_gastro100",
    "feld": "fw_out_gastro100",
    "label": "Fw gastro100",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fw_out_gastroSel",
    "feld": "fw_out_gastroSel",
    "label": "Fw gastro Sel",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fw_out_gastroGz",
    "feld": "fw_out_gastroGz",
    "label": "Gleichzeitigkeit",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_spez100",
    "feld": "fw_out_spez100",
    "label": "Fw spez100",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fw_out_spezSel",
    "feld": "fw_out_spezSel",
    "label": "Fw spez Sel",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "frischwasserstation.fwg_out_pers",
    "feld": "fwg_out_pers",
    "label": "Personen (massgebend)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_duschenTag",
    "feld": "fwg_out_duschenTag",
    "label": "Duschvorgänge pro Tag",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_qje",
    "feld": "fwg_out_qje",
    "label": "qWW je Dusche Mischstrom × WW-Anteil (Abschn. 2)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_lam",
    "feld": "fwg_out_lam",
    "label": "Max. erwartete aktive Duschen λ",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_kHint",
    "feld": "fwg_out_kHint",
    "label": "Duschen 95 % / 99 %",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_k",
    "feld": "fwg_out_k",
    "label": "Duschen 95 % / 99 %",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_qQuantil",
    "feld": "fwg_out_qQuantil",
    "label": "qWW Quantil (gewählt)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_qMin",
    "feld": "fwg_out_qMin",
    "label": "qWW Mindestgleichzeitigkeit",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_qMix",
    "feld": "fwg_out_qMix",
    "label": "qWW Zusatzlasten (Gastro + Spez, Abschn. 3+4)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_massg",
    "feld": "fwg_out_massg",
    "label": "Massgebend vor Reserve MAX(Quantil; Mindest; Zusatz)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_qBem",
    "feld": "fwg_out_qBem",
    "label": "qWW Gauss-Bemessung (× Reserve)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_p",
    "feld": "fwg_out_p",
    "label": "FWS-Leistung (Gauss) q·cp·ΔT/60",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_qPrim",
    "feld": "fwg_out_qPrim",
    "label": "Primärvolumenstrom P·60/(cp·ΔTprim)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwg_out_vergleich",
    "feld": "fwg_out_vergleich",
    "label": "Vergleich empirisch (Abschnitte 2–4)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_tzirk",
    "feld": "fw_out_tzirk",
    "label": "Temperatur Zirkulation",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_pred",
    "feld": "fw_out_pred",
    "label": "Leistungs-Reduktion Zirkulation ṁ·cp·ΔT",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_vMass",
    "feld": "fw_out_vMass",
    "label": "Massgebender Volumenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_rho",
    "feld": "fw_out_rho",
    "label": "Dichte Warmwasser",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_m",
    "feld": "fw_out_m",
    "label": "Massenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_ptheor2",
    "feld": "fw_out_ptheor2",
    "label": "Theoretische Leistung ṁ·cp·ΔT",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_pfws2",
    "feld": "fw_out_pfws2",
    "label": "Leistung Frischwasserstation (netto)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_nlade",
    "feld": "fwk_out_nlade",
    "label": "Aufteilung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_pst",
    "feld": "fwk_out_pst",
    "label": "Leistung je Station Ptheor / nLade",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_vst",
    "feld": "fwk_out_vst",
    "label": "Volumenstrom je Station",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_z",
    "feld": "fwk_out_z",
    "label": "Zirkulationsstation Z (Warmhaltung)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_ausfall",
    "feld": "fwk_out_ausfall",
    "label": "Deckung bei Ausfall einer Station",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_dtprim",
    "feld": "fwk_out_dtprim",
    "label": "Spreizung primär",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_mprim",
    "feld": "fwk_out_mprim",
    "label": "Massenstrom primär total P·3600/(cp·ΔTprim)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_mprimst",
    "feld": "fwk_out_mprimst",
    "label": "Massenstrom primär je Station",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_qd",
    "feld": "fwk_out_qd",
    "label": "Tagesenergie Warmwasser V·cp·ΔT/3600",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_td",
    "feld": "fwk_out_td",
    "label": "Ladedauer Qd/HL",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_zuschlag",
    "feld": "fwk_out_zuschlag",
    "label": "WW-Zuschlag (Sperrzeit) HL·24/(24−td) − HL",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_plade",
    "feld": "fwk_out_plade",
    "label": "Ladeleistung Wärmeerzeuger 🔥 Heizung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_tab",
    "feld": "fwk_out_tab",
    "label": "Max. Heiz-Unterbruch C·ΔTzul/q̇",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_ladungen",
    "feld": "fwk_out_ladungen",
    "label": "Ladungen pro Tag ⌈td/tmax⌉",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_vsteuer",
    "feld": "fwk_out_vsteuer",
    "label": "Steuervolumen Vd/Ladungen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_vspitze",
    "feld": "fwk_out_vspitze",
    "label": "Stundenspitze (Spitzendeckung)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_vreserve",
    "feld": "fwk_out_vreserve",
    "label": "Reserve bis Wärmeerzeuger bereit",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fwk_out_vspeicher",
    "feld": "fwk_out_vspeicher",
    "label": "Pufferspeicher (Vorschlag, min.)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_zWohn",
    "feld": "fw_out_zWohn",
    "label": "Wohnungsbau (Warmwasser-Anteil)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_zGastro",
    "feld": "fw_out_zGastro",
    "label": "Gastroanlage",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_zSpez",
    "feld": "fw_out_zSpez",
    "label": "Spezielle Anlage",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_zTotal",
    "feld": "fw_out_zTotal",
    "label": "Total Volumenstrom Warmwasser",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_ptheor",
    "feld": "fw_out_ptheor",
    "label": "Theoretische Leistung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_pzirk",
    "feld": "fw_out_pzirk",
    "label": "− Abzug Zirkulationsvolumenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "frischwasserstation.fw_out_pfws",
    "feld": "fw_out_pfws",
    "label": "Leistung Frischwasserstation",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "gasloeschung": {
  "key": "gasloeschung",
  "datei": "br_gasloeschung",
  "label": "Gaslöschanlagen — Mengenberechnung N2 300 bar & Novec 1230",
  "kategorie": "Brandschutz",
  "autosave": "gasloeschung",
  "werte": [
   {
    "id": "gasloeschung.bg1_raum",
    "feld": "bg1_raum",
    "label": "Geschützter Raum",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_norm",
    "feld": "bg1_norm",
    "label": "Auslegung nach Norm/Richtlinie",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_risiko",
    "feld": "bg1_risiko",
    "label": "Art des Risikos",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_c",
    "feld": "bg1_c",
    "label": "gemäss Norm/Risiko (ISO 14520-13)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_temp",
    "feld": "bg1_temp",
    "label": "Minimum",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_hoehe",
    "feld": "bg1_hoehe",
    "label": "Einfluss erst ab 1000 m (ISO-Höhenkorrektur)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m ü.M.",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_zu",
    "feld": "bg1_zu",
    "label": "VdS",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_flgr",
    "feld": "bg1_flgr",
    "label": "80 l ≙ 24.9 kg · 140 l ≙ 43.5 kg N2 (300 bar)",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "l",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_nachfl",
    "feld": "bg1_nachfl",
    "label": "z.B. Generator-Auslauf: 1 Fl. mit Blende Ø3 mm ≈ 10 min",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "St.",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_ff",
    "feld": "bg1_ff",
    "label": "aus der Kurve — Vorschlag automatisch interpoliert, Ablesewert kann übersteuern",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg1_p",
    "feld": "bg1_p",
    "label": "leicht 100 Pa · normal 300 Pa · stabil 1000 Pa — Angabe Bauherr/Architekt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Pa",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg2_raum",
    "feld": "bg2_raum",
    "label": "Geschützter Raum",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg2_c",
    "feld": "bg2_c",
    "label": "gemäss Norm/Risiko (ISO 14520-5)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg2_temp",
    "feld": "bg2_temp",
    "label": "Minimum",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg2_hoehe",
    "feld": "bg2_hoehe",
    "label": "Einfluss erst ab 1000 m",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m ü.M.",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg2_zu",
    "feld": "bg2_zu",
    "label": "VdS",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg2_ffmax",
    "feld": "bg2_ffmax",
    "label": "konservativ; abhängig vom Rohrnetz-/Flaschenvolumen (siehe Helfer unten)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kg/l",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg2_flgr",
    "feld": "bg2_flgr",
    "label": "Gewünschte Flaschengrösse",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg2_p",
    "feld": "bg2_p",
    "label": "leicht 100 Pa · normal 300 Pa · stabil 1000 Pa",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Pa",
    "quelle": "gema_gasloeschung__<objektId>"
   },
   {
    "id": "gasloeschung.bg_rows",
    "feld": "bg_rows",
    "label": "bg_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_gasloeschung__<objektId>",
    "unsicher": true
   },
   {
    "id": "gasloeschung.loeschmittel_out",
    "feld": "loeschmittel_out",
    "label": "Loeschmittel",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.raumvolumen_out",
    "feld": "raumvolumen_out",
    "label": "Raumvolumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.konzentration_out",
    "feld": "konzentration_out",
    "label": "Konzentration",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_s",
    "feld": "bg1_out_s",
    "label": "Spez. Volumen S (ISO)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_hk",
    "feld": "bg1_out_hk",
    "label": "Höhenkorrektur-Faktor",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_qr",
    "feld": "bg1_out_qr",
    "label": "Einsatzmenge ohne Höhenkorrektur",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_qgdes",
    "feld": "bg1_out_qgdes",
    "label": "Einsatzmenge mit Höhenkorrektur (Qg Des)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_qmin",
    "feld": "bg1_out_qmin",
    "label": "Minimale Vorratsmenge (Qg Min)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_nfl",
    "feld": "bg1_out_nfl",
    "label": "Anzahl Flaschen Direktflutung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_qg",
    "feld": "bg1_out_qg",
    "label": "Bevorratete Menge Qg",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_q60",
    "feld": "bg1_out_q60",
    "label": "Q60 (95 % von Qg Des in 60 s)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_diff",
    "feld": "bg1_out_diff",
    "label": "Kontrolle Qg vs. Q60 (mind. +10 %)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_duesen",
    "feld": "bg1_out_duesen",
    "label": "Anzahl Düsen (Näherung, Fläche/30)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_o260",
    "feld": "bg1_out_o260",
    "label": "O₂ nach Flutungszeit 60 s",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_o2end",
    "feld": "bg1_out_o2end",
    "label": "O₂ nach der Entleerung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_q60qg",
    "feld": "bg1_out_q60qg",
    "label": "Q60/Qg (berechnet)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "—"
   },
   {
    "id": "gasloeschung.bg1_out_entl",
    "feld": "bg1_out_entl",
    "label": "Entlastungsöffnung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_sys1",
    "feld": "bg1_out_sys1",
    "label": "Direktflutung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg1_out_sys2",
    "feld": "bg1_out_sys2",
    "label": "Nachflutung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_s",
    "feld": "bg2_out_s",
    "label": "Spez. Volumen S (ISO)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_hk",
    "feld": "bg2_out_hk",
    "label": "Höhenkorrektur-Faktor",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_q",
    "feld": "bg2_out_q",
    "label": "Einsatzmenge für Flutung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_qmin",
    "feld": "bg2_out_qmin",
    "label": "Min. Gasvorratsmenge mit Höhenkorrektur",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_qg",
    "feld": "bg2_out_qg",
    "label": "Effektive Gasvorratsmenge Qg (inkl. Zuschlag)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_nfl",
    "feld": "bg2_out_nfl",
    "label": "Anzahl Flaschen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_ffist",
    "feld": "bg2_out_ffist",
    "label": "Tatsächlicher Füllfaktor",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_duesen",
    "feld": "bg2_out_duesen",
    "label": "Anzahl Düsen (Näherung, Fläche/30)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_o2",
    "feld": "bg2_out_o2",
    "label": "O₂ nach Gesamtflutung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "gasloeschung.bg2_out_entl",
    "feld": "bg2_out_entl",
    "label": "Entlastungsöffnung",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "grobauslegung": {
  "key": "grobauslegung",
  "datei": "sb_grobauslegung",
  "label": "Grobauslegung Sanitär",
  "kategorie": "Sanitär",
  "autosave": "",
  "werte": [
   {
    "id": "grobauslegung.projectName",
    "feld": "projectName",
    "label": "Projektname",
    "art": "eingabe",
    "typ": "zahl"
   },
   {
    "id": "grobauslegung.projectNr",
    "feld": "projectNr",
    "label": "Projektnummer",
    "art": "eingabe",
    "typ": "zahl"
   },
   {
    "id": "grobauslegung.address",
    "feld": "address",
    "label": "Adresse / Ort",
    "art": "eingabe",
    "typ": "zahl"
   },
   {
    "id": "grobauslegung.date",
    "feld": "date",
    "label": "Datum",
    "art": "eingabe",
    "typ": "zahl"
   },
   {
    "id": "grobauslegung.notes",
    "feld": "notes",
    "label": "Kurznotiz (optional)",
    "art": "eingabe",
    "typ": "zahl"
   },
   {
    "id": "grobauslegung.stdFloorHeight",
    "feld": "stdFloorHeight",
    "label": "Standard-Stockwerkhöhe",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m"
   },
   {
    "id": "grobauslegung.stdFloorsCount",
    "feld": "stdFloorsCount",
    "label": "Anzahl Norm-Stockwerke",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk"
   },
   {
    "id": "grobauslegung.buildingUse",
    "feld": "buildingUse",
    "label": "Nutzung Hauptgebäude",
    "art": "eingabe",
    "typ": "auswahl"
   },
   {
    "id": "grobauslegung.unitsTotal",
    "feld": "unitsTotal",
    "label": "Anzahl Einheiten gesamt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk"
   },
   {
    "id": "grobauslegung.occupantsPerUnit",
    "feld": "occupantsPerUnit",
    "label": "Belegung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Pers./Einheit"
   },
   {
    "id": "grobauslegung.serviceLevel",
    "feld": "serviceLevel",
    "label": "Ausbaustandard",
    "art": "eingabe",
    "typ": "auswahl"
   },
   {
    "id": "grobauslegung.wwSystem",
    "feld": "wwSystem",
    "label": "System",
    "art": "eingabe",
    "typ": "auswahl"
   },
   {
    "id": "grobauslegung.energySource",
    "feld": "energySource",
    "label": "Energieträger",
    "art": "eingabe",
    "typ": "auswahl"
   },
   {
    "id": "grobauslegung.wwStorageL",
    "feld": "wwStorageL",
    "label": "Speichervolumen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Liter"
   },
   {
    "id": "grobauslegung.wwPeakPower",
    "feld": "wwPeakPower",
    "label": "Nachladeleistung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW"
   },
   {
    "id": "grobauslegung.wwTempSet",
    "feld": "wwTempSet",
    "label": "Solltemperatur Speicher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C"
   },
   {
    "id": "grobauslegung.circTemp",
    "feld": "circTemp",
    "label": "Zirkulation Rücklauf-Ziel",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C"
   },
   {
    "id": "grobauslegung.circulation",
    "feld": "circulation",
    "label": "Zirkulation vorhanden?",
    "art": "eingabe",
    "typ": "auswahl"
   },
   {
    "id": "grobauslegung.circLossBar",
    "feld": "circLossBar",
    "label": "Druckverlust Zirkulation",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "grobauslegung.wwNotes",
    "feld": "wwNotes",
    "label": "Bemerkungen WW (optional)",
    "art": "eingabe",
    "typ": "zahl"
   },
   {
    "id": "grobauslegung.netPressure",
    "feld": "netPressure",
    "label": "Netzdruck",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "grobauslegung.reservoirHeight",
    "feld": "reservoirHeight",
    "label": "Höhe Reservoir über Anlage",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m"
   },
   {
    "id": "grobauslegung.pipeLoss",
    "feld": "pipeLoss",
    "label": "Druckverlust Rohrinstallation",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "grobauslegung.applianceFlowPressure",
    "feld": "applianceFlowPressure",
    "label": "Fliessdruck Apparate",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "grobauslegung.riserZones",
    "feld": "riserZones",
    "label": "Anzahl Steigzonen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk"
   },
   {
    "id": "grobauslegung.safetyMargin",
    "feld": "safetyMargin",
    "label": "Reserve / Sicherheitszuschlag",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "bar"
   },
   {
    "id": "grobauslegung.specialAppliances",
    "feld": "specialAppliances",
    "label": "Spezielle Apparate (optional)",
    "art": "eingabe",
    "typ": "zahl"
   },
   {
    "id": "grobauslegung.fixturesTable",
    "feld": "fixturesTable",
    "label": "Fixtures Table",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "grobauslegung.dotFixtures",
    "feld": "dotFixtures",
    "label": "Dot Fixtures",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "grobauslegung.fixturesCount",
    "feld": "fixturesCount",
    "label": "Fixtures Count",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "grundleitungen": {
  "key": "grundleitungen",
  "datei": "sb_grundleitungen",
  "label": "Grundleitungen",
  "kategorie": "Sanitär",
  "autosave": "grundleitungen",
  "werte": [
   {
    "id": "grundleitungen.gl_rows",
    "feld": "gl_rows",
    "label": "gl_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_grundleitungen__<objektId>",
    "unsicher": true
   }
  ]
 },
 "heizlast_verbrauch": {
  "key": "heizlast_verbrauch",
  "datei": "hz_heizlast",
  "label": "Heizlast aus Jahresenergieverbrauch",
  "kategorie": "Heizung",
  "autosave": "heizlast_verbrauch",
  "werte": [
   {
    "id": "heizlast_verbrauch.zl_kat",
    "feld": "zl_kat",
    "label": "Gebäudekategorie",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_std",
    "feld": "zl_std",
    "label": "bestimmt den WW-Verbrauch pro Person",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_bau",
    "feld": "zl_bau",
    "label": "Speicherfähigkeit Cwirk für die Speicherauslegung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_athae",
    "feld": "zl_athae",
    "label": "für Grenzwert SIA 380/1 + Faktor",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_anfebf",
    "feld": "zl_anfebf",
    "label": "Standardwert 0.85",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_wwz",
    "feld": "zl_wwz",
    "label": "gem. SIA 385/2 max. 50 %",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_gz",
    "feld": "zl_gz",
    "label": "Jahres-Gleichzeitigkeitsfaktor",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_nebenM2",
    "feld": "zl_nebenM2",
    "label": "Keller etc. — EBF einsetzen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_nebenB",
    "feld": "zl_nebenB",
    "label": "gegen unbeheizt/Erdreich z.B. 0.5",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_station",
    "feld": "zl_station",
    "label": "nächstgelegene Messstation",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "müM",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_mgeb",
    "feld": "zl_mgeb",
    "label": "Gebäudelage über Meer",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "müM",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_ti",
    "feld": "zl_ti",
    "label": "Mittlere Raumtemperatur",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_eta",
    "feld": "zl_eta",
    "label": "alte Anlage (z.B. Ölkessel 85 %)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_bh",
    "feld": "zl_bh",
    "label": "Vorschlag siehe rechts — üblich 14–18 h",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_sperr",
    "feld": "zl_sperr",
    "label": "für Wiederaufheizfaktor (FWS 50 %)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_psonst",
    "feld": "zl_psonst",
    "label": "z.B. hoher Fensteranteil",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_psonder",
    "feld": "zl_psonder",
    "label": "Sondergruppen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_cwirkeff",
    "feld": "zl_cwirkeff",
    "label": "0 = Wert aus Bauweise (Tab ①)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Wh/m²K",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_dqrh",
    "feld": "zl_dqrh",
    "label": "vertretbar während Boilerladung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "K",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_fh",
    "feld": "zl_fh",
    "label": "max. = erforderliche Heizleistung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_nlad",
    "feld": "zl_nlad",
    "label": "unter 300 dm³/d (EFH): 1× nachts",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_palt",
    "feld": "zl_palt",
    "label": "Eingestellte alte Heizleistung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_jvl",
    "feld": "zl_jvl",
    "label": "Vorlauftemperatur alt [JVL]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_jrl",
    "feld": "zl_jrl",
    "label": "Rücklauftemperatur alt [JRL]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_ji",
    "feld": "zl_ji",
    "label": "Raumtemperatur alt [Ji]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_taalt",
    "feld": "zl_taalt",
    "label": "Massg. alte Aussentemperatur",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_nexp",
    "feld": "zl_nexp",
    "label": "Radiatoren 1.26",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_jineu",
    "feld": "zl_jineu",
    "label": "Raumtemperatur neu [Ji]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_pneu",
    "feld": "zl_pneu",
    "label": "0 = erforderliche Heizleistung aus Tab ③",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_heizlast_verbrauch__<objektId>"
   },
   {
    "id": "heizlast_verbrauch.zl_rows",
    "feld": "zl_rows",
    "label": "zl_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_heizlast_verbrauch__<objektId>",
    "unsicher": true
   },
   {
    "id": "heizlast_verbrauch.leistungGenOut_out",
    "feld": "leistungGenOut_out",
    "label": "Leistung Gen Out",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.heizlast_out",
    "feld": "heizlast_out",
    "label": "Heizlast",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.warmwasser_out",
    "feld": "warmwasser_out",
    "label": "Warmwasser",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.qh100_out",
    "feld": "qh100_out",
    "label": "Qh100",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_cwirk",
    "feld": "zl_out_cwirk",
    "label": "Speicherfähigkeit [Cwirk]",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "–"
   },
   {
    "id": "heizlast_verbrauch.zl_out_flookup",
    "feld": "zl_out_flookup",
    "label": "Verbrauch pro Person (Tabelle SIA)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_qwwa",
    "feld": "zl_out_qwwa",
    "label": "Jahres-Warmwasserbedarf [QWW]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_tagesv",
    "feld": "zl_out_tagesv",
    "label": "Tagesverbrauch",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_pers",
    "feld": "zl_out_pers",
    "label": "Personen total",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_ebfWhg",
    "feld": "zl_out_ebfWhg",
    "label": "EBF Wohnungen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_ebfNeben",
    "feld": "zl_out_ebfNeben",
    "label": "EBF Nebenräume",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_ebf",
    "feld": "zl_out_ebf",
    "label": "Total Energiebezugsfläche [EBF]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_st",
    "feld": "zl_out_st",
    "label": "Station (müM / ta / tam)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_tageb",
    "feld": "zl_out_tageb",
    "label": "Massg. Aussentemperatur Gebäude ta,St + ROUND(−0.005·Δh)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_dt",
    "feld": "zl_out_dt",
    "label": "Massg. Temperaturdifferenz [ΔT]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_hgt",
    "feld": "zl_out_hgt",
    "label": "Heizgradtage Ø 20/12 (2011–2022)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_qhli",
    "feld": "zl_out_qhli",
    "label": "Grenzwert SIA 380/1:2016 [QH,li]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_qh100",
    "feld": "zl_out_qh100",
    "label": "Jahresenergiebedarf Heizung [QH100] Ø gültige Perioden",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_anzp",
    "feld": "zl_out_anzp",
    "label": "Gültige Perioden",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_qh",
    "feld": "zl_out_qh",
    "label": "Spez. Heizwärmebedarf [qh]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_kennwert",
    "feld": "zl_out_kennwert",
    "label": "Wärmebedarf-Kennwert (QH/QH,li)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_eff",
    "feld": "zl_out_eff",
    "label": "Effizienzklasse (Wärme)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_bhv",
    "feld": "zl_out_bhv",
    "label": "Vorschlag Betriebsstunden",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_meth",
    "feld": "zl_out_meth",
    "label": "Berechnungsmethode A: 55·h·müM⁻⁰·³⁸⁵ ≥ qh",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_spez",
    "feld": "zl_out_spez",
    "label": "Spez. Heizlastbedarf",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_fathae",
    "feld": "zl_out_fathae",
    "label": "Faktor Ath/AE",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_spezl",
    "feld": "zl_out_spezl",
    "label": "Spez. Heizleistung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_pheiz",
    "feld": "zl_out_pheiz",
    "label": "Erforderliche Heizleistung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_pww",
    "feld": "zl_out_pww",
    "label": "Warmwasserzuschlag EFH 2 · sonst 3 W/m²",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_wieder",
    "feld": "zl_out_wieder",
    "label": "Wiederaufheizfaktor / Zuschlag",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_ptotal",
    "feld": "zl_out_ptotal",
    "label": "Total Heizkesselleistung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_m2",
    "feld": "zl_out_m2",
    "label": "② Hottinger HGT-korrigiert QH100·ΔT/HGTkorr/h",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_m3",
    "feld": "zl_out_m3",
    "label": "③ Betriebstundenkoeffizient QH100/(ΔT·k)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_m4a",
    "feld": "zl_out_m4a",
    "label": "④ SIA 384/1 (m50-Wert)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_m4b",
    "feld": "zl_out_m4b",
    "label": "④ SIA 384/1 (m90-Wert)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_qwwd",
    "feld": "zl_out_qwwd",
    "label": "Wärmebedarf Warmwasser Tagesverbrauch·0.058153",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_tz",
    "feld": "zl_out_tz",
    "label": "Vertretbare Abschaltdauer [tz] Cwirk·ΔqRH/spez. Leistung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_td",
    "feld": "zl_out_td",
    "label": "Ladedauer pro Tag",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_nladmin",
    "feld": "zl_out_nladmin",
    "label": "Min. Anzahl Ladungen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_vctrl",
    "feld": "zl_out_vctrl",
    "label": "Steuervolumen Speicher",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_vpeak",
    "feld": "zl_out_vpeak",
    "label": "Spitzenvolumen (9 %)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_vbereit",
    "feld": "zl_out_vbereit",
    "label": "Bereitschaftsvolumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_vorrang",
    "feld": "zl_out_vorrang",
    "label": "Ladedauer pro Zyklus / Boilervorrang",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_vapprox",
    "feld": "zl_out_vapprox",
    "label": "Approx. Speichergrösse (inkl. Verlustzuschlag)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_steil",
    "feld": "zl_out_steil",
    "label": "Steilheit Heizkurve [S]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_uebalt",
    "feld": "zl_out_uebalt",
    "label": "Alte Übertemperatur (log)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_uebneu",
    "feld": "zl_out_uebneu",
    "label": "Neue Übertemperatur (Pneu/Palt)^(1/n)·ÜTalt",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_dtneu",
    "feld": "zl_out_dtneu",
    "label": "Neue Temperaturdifferenz",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizlast_verbrauch.zl_out_vlrl",
    "feld": "zl_out_vlrl",
    "label": "Vorlauf / Rücklauf neu",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "heizungsleitungen": {
  "key": "heizungsleitungen",
  "datei": "hz_heizungsleitungen",
  "label": "Dimensionierung Heizungsleitungen",
  "kategorie": "Heizung",
  "autosave": "heizungsleitungen",
  "werte": [
   {
    "id": "heizungsleitungen.hl_tvl",
    "feld": "hl_tvl",
    "label": "Vorlauftemperatur",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_heizungsleitungen__<objektId>"
   },
   {
    "id": "heizungsleitungen.hl_trl",
    "feld": "hl_trl",
    "label": "Rücklauftemperatur",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_heizungsleitungen__<objektId>"
   },
   {
    "id": "heizungsleitungen.hl_medium",
    "feld": "hl_medium",
    "label": "Stoffwerte bei Mitteltemperatur",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_heizungsleitungen__<objektId>"
   },
   {
    "id": "heizungsleitungen.hl_matAll",
    "feld": "hl_matAll",
    "label": "Material",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_heizungsleitungen__<objektId>"
   },
   {
    "id": "heizungsleitungen.hl_zuAll",
    "feld": "hl_zuAll",
    "label": "Zuschlag",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_heizungsleitungen__<objektId>"
   },
   {
    "id": "heizungsleitungen.hl_punit",
    "feld": "hl_punit",
    "label": "Leistung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_heizungsleitungen__<objektId>"
   },
   {
    "id": "heizungsleitungen.hl_dunit",
    "feld": "hl_dunit",
    "label": "Druck",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_heizungsleitungen__<objektId>"
   },
   {
    "id": "heizungsleitungen.hl_rows",
    "feld": "hl_rows",
    "label": "hl_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_heizungsleitungen__<objektId>",
    "unsicher": true
   },
   {
    "id": "heizungsleitungen.foerderhoehe_out",
    "feld": "foerderhoehe_out",
    "label": "Foerderhoehe",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizungsleitungen.volumenstrom_out",
    "feld": "volumenstrom_out",
    "label": "Volumenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizungsleitungen.leistung_out",
    "feld": "leistung_out",
    "label": "Leistung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizungsleitungen.vlTemp_out",
    "feld": "vlTemp_out",
    "label": "Vl Temp",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizungsleitungen.hl_out_tm",
    "feld": "hl_out_tm",
    "label": "Mitteltemperatur / Differenz Tm = (TVL+TRL)/2 · ΔT = TVL−TRL",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizungsleitungen.hl_out_cp",
    "feld": "hl_out_cp",
    "label": "Wärmekapazität [cp]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizungsleitungen.hl_out_rho",
    "feld": "hl_out_rho",
    "label": "Dichte [ρ]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizungsleitungen.hl_out_nu",
    "feld": "hl_out_nu",
    "label": "Viskosität [ν]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "heizungsleitungen.hl_out_tsL",
    "feld": "hl_out_tsL",
    "label": "Hl ts L",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "heizungsleitungen.hl_out_tsP",
    "feld": "hl_out_tsP",
    "label": "Hl ts P",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "heizungsleitungen.hl_out_tsP_u",
    "feld": "hl_out_tsP_u",
    "label": "Hl ts P u",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "heizungsleitungen.hl_out_vtsQ",
    "feld": "hl_out_vtsQ",
    "label": "Hl vts Q",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "heizungsleitungen.hl_out_vtsQ_u",
    "feld": "hl_out_vtsQ_u",
    "label": "Hl vts Q u",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "heizungsleitungen.hl_out_grpList",
    "feld": "hl_out_grpList",
    "label": "Hl grp List",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "hx_diagramm": {
  "key": "hx_diagramm",
  "datei": "lt_hx_diagramm",
  "label": "h,x-Diagramm für feuchte Luft",
  "kategorie": "Lüftung",
  "autosave": "hx_diagramm",
  "werte": [
   {
    "id": "hx_diagramm.hxAnlSel",
    "feld": "hxAnlSel",
    "label": "hxAnlSel",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>",
    "unsicher": true
   },
   {
    "id": "hx_diagramm.hx_station",
    "feld": "hx_station",
    "label": "Ort wählen → Höhe wird gesetzt · Auslegungszustände Winter/Sommer einfügbar",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.hx_hoehe",
    "feld": "hx_hoehe",
    "label": "Luftdruck über barometrische Höhenformel (Referenz Seven-Air: 540 m ü. M.)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "müM",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.hx_druck",
    "feld": "hx_druck",
    "label": "0 = automatisch aus der Höhe",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.hx_linie",
    "feld": "hx_linie",
    "label": "Punkte in Tabellenreihenfolge verbinden",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.hx_vdot",
    "feld": "hx_vdot",
    "label": "nur für diese Auswertung · 0 = keine Leistungsberechnung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_mi_p1",
    "feld": "ax_mi_p1",
    "label": "z.B. Aussenluft",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_mi_v1",
    "feld": "ax_mi_v1",
    "label": "Volumenstrom 1",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_mi_p2",
    "feld": "ax_mi_p2",
    "label": "z.B. Umluft",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_mi_v2",
    "feld": "ax_mi_v2",
    "label": "Volumenstrom 2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_mi_tziel",
    "feld": "ax_mi_tziel",
    "label": "zwischen Luftstrom 1 und 2",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_mi_vtot",
    "feld": "ax_mi_vtot",
    "label": "Gesamt-Volumenstrom",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_le_mode",
    "feld": "ax_le_mode",
    "label": "Gesucht",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_le_p1",
    "feld": "ax_le_p1",
    "label": "je nach Anlage: nach WRG oder Aussenluft",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_le_p2",
    "feld": "ax_le_p2",
    "label": "Luft nach Erhitzer",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_le_tziel",
    "feld": "ax_le_tziel",
    "label": "ohne Feuchte — Erwärmung bei x = konstant, Rest wird berechnet",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_le_v",
    "feld": "ax_le_v",
    "label": "Volumenstrom dieser Auslegung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_le_phi",
    "feld": "ax_le_phi",
    "label": "Heizleistung ΦLE",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_lk_mode",
    "feld": "ax_lk_mode",
    "label": "Gesucht",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_lk_p1",
    "feld": "ax_lk_p1",
    "label": "je nach Anlage: nach WRG oder Aussenluft",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_lk_p2",
    "feld": "ax_lk_p2",
    "label": "Luft nach Kühler",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_lk_tziel",
    "feld": "ax_lk_tziel",
    "label": "ohne Feuchte — trockene Kühlung bei x = konstant, Rest wird berechnet",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_lk_v",
    "feld": "ax_lk_v",
    "label": "Volumenstrom dieser Auslegung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_lk_phi",
    "feld": "ax_lk_phi",
    "label": "Kühlleistung ΦLK",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_lk_tvl",
    "feld": "ax_lk_tvl",
    "label": "Kaltwasser Vorlauf θVL",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_lk_trl",
    "feld": "ax_lk_trl",
    "label": "Kaltwasser Rücklauf θRL",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_wrg_mode",
    "feld": "ax_wrg_mode",
    "label": "Gesucht",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_wrg_paul",
    "feld": "ax_wrg_paul",
    "label": "Aussenluft ein (AUL 1)",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_wrg_pabl",
    "feld": "ax_wrg_pabl",
    "label": "Abluft ein (ABL 1)",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_wrg_paul2",
    "feld": "ax_wrg_paul2",
    "label": "Aussenluft nach WRG (AUL 2)",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_wrg_vaul",
    "feld": "ax_wrg_vaul",
    "label": "Volumenstrom dieser Auslegung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_wrg_vabl",
    "feld": "ax_wrg_vabl",
    "label": "leer = wie Aussenluft",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_wrg_etat",
    "feld": "ax_wrg_etat",
    "label": "Rückwärmzahl ηθ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_wrg_etax",
    "feld": "ax_wrg_etax",
    "label": "0 = nur sensibel (Platten-WT/KVS) · Rotor mit Sorption > 0",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_art",
    "feld": "ax_bef_art",
    "label": "Befeuchtungsart",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_mode_d",
    "feld": "ax_bef_mode_d",
    "label": "Gesucht",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_mode_a",
    "feld": "ax_bef_mode_a",
    "label": "Gesucht",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_p1",
    "feld": "ax_bef_p1",
    "label": "Luft vor Befeuchter",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_p2",
    "feld": "ax_bef_p2",
    "label": "Luft nach Befeuchter",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_p2a",
    "feld": "ax_bef_p2a",
    "label": "Luft nach Befeuchter",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "kg/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_md",
    "feld": "ax_bef_md",
    "label": "Dampfmenge ṁDampf",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kg/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_eta",
    "feld": "ax_bef_eta",
    "label": "Befeuchter-Wirkungsgrad ηBef",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_v",
    "feld": "ax_bef_v",
    "label": "Volumenstrom dieser Auslegung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_csp",
    "feld": "ax_bef_csp",
    "label": "Salzgehalt Speisewasser Csp",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°fH",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_bef_ca",
    "feld": "ax_bef_ca",
    "label": "zulässige Aufkonzentration im Wäscher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°fH",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_ven_mode",
    "feld": "ax_ven_mode",
    "label": "Berechnung aus",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_ven_p1",
    "feld": "ax_ven_p1",
    "label": "für Dichte + Übernahme · leer = ρ 1.20 kg/m³",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_ven_v",
    "feld": "ax_ven_v",
    "label": "Volumenstrom dieser Auslegung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_ven_dp",
    "feld": "ax_ven_dp",
    "label": "Gesamt-Druckverlust Δpges",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Pa",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_ven_eta",
    "feld": "ax_ven_eta",
    "label": "Ventilator-Wirkungsgrad ηven",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.ax_ven_p",
    "feld": "ax_ven_p",
    "label": "Ventilatorleistung Pven",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_hx_diagramm__<objektId>"
   },
   {
    "id": "hx_diagramm.hx_rows",
    "feld": "hx_rows",
    "label": "hx_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_hx_diagramm__<objektId>",
    "unsicher": true
   },
   {
    "id": "hx_diagramm.hx_anlagen",
    "feld": "hx_anlagen",
    "label": "hx_anlagen",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_hx_diagramm__<objektId>",
    "unsicher": true
   },
   {
    "id": "hx_diagramm.volumenstrom_out",
    "feld": "volumenstrom_out",
    "label": "Volumenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.heizleistung_out",
    "feld": "heizleistung_out",
    "label": "Heizleistung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.kuehlleistung_out",
    "feld": "kuehlleistung_out",
    "label": "Kuehlleistung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.befeuchtung_out",
    "feld": "befeuchtung_out",
    "label": "Befeuchtung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.hoehe_out",
    "feld": "hoehe_out",
    "label": "Hoehe",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.hx_out_p",
    "feld": "hx_out_p",
    "label": "Rechen-Luftdruck 101325·(1−0.0065·H/288.15)^5.255",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_mi_m",
    "feld": "ax_out_mi_m",
    "label": "Massenströme ṁ₁ / ṁ₂ ṁ = V̇·ρ",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_mi_t",
    "feld": "ax_out_mi_t",
    "label": "Mischtemperatur θm θm=(ṁ₁·θ₁+ṁ₂·θ₂)/(ṁ₁+ṁ₂)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_mi_x",
    "feld": "ax_out_mi_x",
    "label": "Wassergehalt xm für x und h gleiche Formel",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_mi_h",
    "feld": "ax_out_mi_h",
    "label": "Enthalpie hm",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_mi_phi",
    "feld": "ax_out_mi_phi",
    "label": "relative Feuchte φm",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_mi_ant",
    "feld": "ax_out_mi_ant",
    "label": "Massenanteil Strom 1 / 2 ṁ₁/ṁtot=(θ₂−θm)/(θ₂−θ₁)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_mi_vt",
    "feld": "ax_out_mi_vt",
    "label": "erforderlich V̇₁ / V̇₂",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_le_m",
    "feld": "ax_out_le_m",
    "label": "Massenstrom ṁL ṁL=V̇·ρ",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_le_d",
    "feld": "ax_out_le_d",
    "label": "Δθ / Δh",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_le_phi",
    "feld": "ax_out_le_phi",
    "label": "Heizleistung ΦLE Φ=ṁL·Δh/3600",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_le_t2",
    "feld": "ax_out_le_t2",
    "label": "Zustand nach Register Δθ=Φ·3600/(ṁL·cL) · x konstant",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_le_vreq",
    "feld": "ax_out_le_vreq",
    "label": "erforderlicher Volumenstrom ṁL=Φ·3600/Δh",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_m",
    "feld": "ax_out_lk_m",
    "label": "Massenstrom ṁL ṁL=V̇·ρ",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_d",
    "feld": "ax_out_lk_d",
    "label": "Δθ / Δh",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_art",
    "feld": "ax_out_lk_art",
    "label": "Kühlung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_phi",
    "feld": "ax_out_lk_phi",
    "label": "Kühlleistung ΦLK Φ=ṁL·Δh/3600",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_sens",
    "feld": "ax_out_lk_sens",
    "label": "davon sensibel / latent Φsens=ṁL·cL·Δθ/3600",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_kond",
    "feld": "ax_out_lk_kond",
    "label": "Kondensat ṁKond=ṁL·Δx/1000",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_t2",
    "feld": "ax_out_lk_t2",
    "label": "Zustand nach Register x konstant (nur trockene Kühlung)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_vreq",
    "feld": "ax_out_lk_vreq",
    "label": "erforderlicher Volumenstrom ṁL=Φ·3600/Δh",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_mw",
    "feld": "ax_out_lk_mw",
    "label": "Kaltwasser-Massenstrom ṁW ṁW=Φ·3600/(ΔθW·cW)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_lk_t0",
    "feld": "ax_out_lk_t0",
    "label": "mittlere Oberflächentemperatur θ₀ θ₀=(θVL+θRL)/2+1.5",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_wrg_m",
    "feld": "ax_out_wrg_m",
    "label": "Massenströme ṁAUL / ṁABL",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_wrg_t2",
    "feld": "ax_out_wrg_t2",
    "label": "AUL 2: Temperatur / Enthalpie θAUL2=θAUL1+ηθ·(ṁABL/ṁAUL)·(θABL1−θAUL1)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_wrg_x2",
    "feld": "ax_out_wrg_x2",
    "label": "AUL 2: Wassergehalt / rel. Feuchte xAUL2 analog mit ηx",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_wrg_phi",
    "feld": "ax_out_wrg_phi",
    "label": "Rückgewinnleistung Φ=ṁAUL·Δh/3600",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_wrg_abl2",
    "feld": "ax_out_wrg_abl2",
    "label": "Fortluft ABL 2 Energiebilanz ṁAUL·ΔθAUL=ṁABL·ΔθABL",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_wrg_etat",
    "feld": "ax_out_wrg_etat",
    "label": "Rückwärmzahl ηθ ηθ=ṁAUL·(θAUL2−θAUL1)/(ṁABL·(θABL1−θAUL1))",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_wrg_etax",
    "feld": "ax_out_wrg_etax",
    "label": "Feuchte-Übertragung ηx ηx analog mit x",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_m",
    "feld": "ax_out_bef_m",
    "label": "Massenstrom ṁL ṁL=V̇·ρ",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_bef_dampf_res",
    "feld": "ax_bef_dampf_res",
    "label": "Massenstrom ṁL ṁL=V̇·ρ",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_dx",
    "feld": "ax_out_bef_dx",
    "label": "Feuchte-Differenz Δx",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_md",
    "feld": "ax_out_bef_md",
    "label": "Dampfmenge ṁDampf ṁDampf=ṁL·Δx/1000",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_phi",
    "feld": "ax_out_bef_phi",
    "label": "Befeuchterleistung ΦBef Δh=hD·Δx/1000 · hD=2676 kJ/kg (Dampf 100 °C)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_t2",
    "feld": "ax_out_bef_t2",
    "label": "Zustand nach Befeuchter θ ≈ konstant (Dampf)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_bef_adia_res",
    "feld": "ax_bef_adia_res",
    "label": "Zustand nach Befeuchter θ ≈ konstant (Dampf)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_kg",
    "feld": "ax_out_bef_kg",
    "label": "Kühlgrenze (Feuchtkugel)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_x100",
    "feld": "ax_out_bef_x100",
    "label": "x bei 100 % i.F. Schnittpunkt Kühlgrenze/Sättigung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_dxm",
    "feld": "ax_out_bef_dxm",
    "label": "Δx max / Δx effektiv Δxeff=ηBef·Δxmax",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_eta",
    "feld": "ax_out_bef_eta",
    "label": "Befeuchter-Wirkungsgrad ηBef ηBef=(xAus−xEin)/(x100 % i.F.−xEin)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_taus",
    "feld": "ax_out_bef_taus",
    "label": "Zustand nach Befeuchter adiabat: h ≈ konstant",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_wv",
    "feld": "ax_out_bef_wv",
    "label": "Verdunstung / Wasserverbrauch ṁV ṁV=ṁL·Δx/1000",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_ma",
    "feld": "ax_out_bef_ma",
    "label": "Abschlämmung ṁA ṁA=ṁV·Csp/(CA−Csp)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_bef_sp",
    "feld": "ax_out_bef_sp",
    "label": "Speisewasser total ṁV+ṁA",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_ven_p",
    "feld": "ax_out_ven_p",
    "label": "Ventilatorleistung Pven Pven=V̇·Δpges/(ηven·3600·1000)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_ven_dt",
    "feld": "ax_out_ven_dt",
    "label": "Ventilatorerwärmung θAbw θAbw=Pven·3600/(ṁL·cL)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "hx_diagramm.ax_out_ven_t2",
    "feld": "ax_out_ven_t2",
    "label": "Temperatur nach Ventilator",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "kreisprofil": {
  "key": "kreisprofil",
  "datei": "sb_kreisprofil",
  "label": "Hydraulik Kreisprofil — Teilfüllung von Abwasserleitungen",
  "kategorie": "Sanitär",
  "autosave": "kreisprofil",
  "werte": [
   {
    "id": "kreisprofil.kp_q",
    "feld": "kp_q",
    "label": "Bemessungsabfluss des Leitungsteils (z.B. Qtot aus den Grundleitungen)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_kreisprofil__<objektId>"
   },
   {
    "id": "kreisprofil.kp_gef",
    "feld": "kp_gef",
    "label": "= 10 ‰",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_kreisprofil__<objektId>"
   },
   {
    "id": "kreisprofil.kp_gefunit",
    "feld": "kp_gefunit",
    "label": "kp_gefunit",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kreisprofil__<objektId>",
    "unsicher": true
   },
   {
    "id": "kreisprofil.kp_kb",
    "feld": "kp_kb",
    "label": "SN 592 000: kb = 1.0 mm",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mm",
    "quelle": "gema_kreisprofil__<objektId>"
   },
   {
    "id": "kreisprofil.kp_temp",
    "feld": "kp_temp",
    "label": "bestimmt die kinematische Zähigkeit ν",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "°C",
    "quelle": "gema_kreisprofil__<objektId>"
   },
   {
    "id": "kreisprofil.kp_reihe",
    "feld": "kp_reihe",
    "label": "Innendurchmesser-Tabellen",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "—",
    "quelle": "gema_kreisprofil__<objektId>"
   },
   {
    "id": "kreisprofil.kp_dn",
    "feld": "kp_dn",
    "label": "setzt den Innendurchmesser aus der Rohrreihe",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "—",
    "quelle": "gema_kreisprofil__<objektId>"
   },
   {
    "id": "kreisprofil.kp_di",
    "feld": "kp_di",
    "label": "manuell übersteuerbar",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mm",
    "quelle": "gema_kreisprofil__<objektId>"
   },
   {
    "id": "kreisprofil.kp_abzug",
    "feld": "kp_abzug",
    "label": "Wandstärke s der Innenbeschichtung — beidseitig: Di,eff = Di − 2·s",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mm",
    "quelle": "gema_kreisprofil__<objektId>"
   },
   {
    "id": "kreisprofil.kp_out_nu",
    "feld": "kp_out_nu",
    "label": "Kinematische Zähigkeit ν",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "kreisprofil.kp_out_dimin",
    "feld": "kp_out_dimin",
    "label": "Mindestdurchmesser gemäss Qmax di = 0.477 · (Qmax · kb1/6 / √I)3/8",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "kreisprofil.kp_out_dieff",
    "feld": "kp_out_dieff",
    "label": "Wirksamer Innendurchmesser Di,eff Di,eff = Di − 2·s",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "kreisprofil.kp_out_av",
    "feld": "kp_out_av",
    "label": "Rohrquerschnitt Av Av = π·Di,eff²/4",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "kreisprofil.kp_out_uv",
    "feld": "kp_out_uv",
    "label": "Rohrumfang Uv Uv = π·Di,eff",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "kreisprofil.kp_out_vv",
    "feld": "kp_out_vv",
    "label": "Fliessgeschwindigkeit vv Vorsicht — über 3 m/s",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "kreisprofil.kp_out_qv",
    "feld": "kp_out_qv",
    "label": "Abfluss bei Vollfüllung Qv Qv = vv · Av",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "kreisprofil.kp_out_q07",
    "feld": "kp_out_q07",
    "label": "Max. Abflusswert bei Füllgrad h/Di = 0.7 Q0.7 = 0.84 · Qv",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "kurzschluss": {
  "key": "kurzschluss",
  "datei": "el_kurzschluss",
  "label": "Kurzschluss & Abschaltbedingung",
  "kategorie": "Elektro",
  "autosave": "kurzschluss",
  "werte": [
   {
    "id": "kurzschluss.kz_netz",
    "feld": "kz_netz",
    "label": "Netzsystem",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_cfaktor",
    "feld": "kz_cfaktor",
    "label": "Spannungsfaktor c",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_speise",
    "feld": "kz_speise",
    "label": "Speisung erfassen als",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_sTrafo",
    "feld": "kz_sTrafo",
    "label": "Bemessungsleistung Trafo",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kVA",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_uk",
    "feld": "kz_uk",
    "label": "Kurzschlussspannung uk",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_pk",
    "feld": "kz_pk",
    "label": "Kurzschlussverluste Pk",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "W",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_nTrafo",
    "feld": "kz_nTrafo",
    "label": "Trafos parallel",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_skQ",
    "feld": "kz_skQ",
    "label": "Kurzschlussleistung Netz Sk″",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "MVA",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_u1",
    "feld": "kz_u1",
    "label": "Oberspannung U1N",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "V",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_u2n",
    "feld": "kz_u2n",
    "label": "Bemessungs-Unterspannung U2N",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "V",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_i0",
    "feld": "kz_i0",
    "label": "Leerlaufstrom i0",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_last",
    "feld": "kz_last",
    "label": "Auslastung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_ikSpeise",
    "feld": "kz_ikSpeise",
    "label": "Ik″ am Speisepunkt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kA",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_rxSpeise",
    "feld": "kz_rxSpeise",
    "label": "Verhältnis R/X der Speisung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_laenge",
    "feld": "kz_laenge",
    "label": "Länge",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_querschnitt",
    "feld": "kz_querschnitt",
    "label": "Querschnitt Aussenleiter",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_qPE",
    "feld": "kz_qPE",
    "label": "Querschnitt PE bzw. N",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_material",
    "feld": "kz_material",
    "label": "Leitermaterial",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_nPar",
    "feld": "kz_nPar",
    "label": "Aussenleiter parallel",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_xBelag",
    "feld": "kz_xBelag",
    "label": "Reaktanzbelag x′",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mΩ/m",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_temp",
    "feld": "kz_temp",
    "label": "Leitertemperatur für Ik min",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_schutzTyp",
    "feld": "kz_schutzTyp",
    "label": "Schutzeinrichtung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_in",
    "feld": "kz_in",
    "label": "Nennstrom In",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_iaManuell",
    "feld": "kz_iaManuell",
    "label": "Abschaltstrom Ia (abgelesen)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_tAbschalt",
    "feld": "kz_tAbschalt",
    "label": "Geforderte Abschaltzeit",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_icn",
    "feld": "kz_icn",
    "label": "Schaltvermögen Icn des Geräts",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kA",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_vorTyp",
    "feld": "kz_vorTyp",
    "label": "Gerät davor",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_inVor",
    "feld": "kz_inVor",
    "label": "Nennstrom In davor",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_iaVor",
    "feld": "kz_iaVor",
    "label": "Ansprechstrom des Geräts davor",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_is",
    "feld": "kz_is",
    "label": "Selektivitätsgrenzstrom Is",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kA",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_iBackup",
    "feld": "kz_iBackup",
    "label": "Backup-Schutz bis",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kA",
    "quelle": "gema_kurzschluss__<objektId>"
   },
   {
    "id": "kurzschluss.kz_i0res",
    "feld": "kz_i0res",
    "label": "Leerlaufstrom I0 = i0 · I1N",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "laengenausdehnung": {
  "key": "laengenausdehnung",
  "datei": "sb_laengenausdehnung",
  "label": "Längenausdehnung",
  "kategorie": "Sanitär",
  "autosave": "laengenausdehnung",
  "werte": [
   {
    "id": "laengenausdehnung.unitDlToggle",
    "feld": "unitDlToggle",
    "label": "unitDlToggle",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_laengenausdehnung__<objektId>",
    "unsicher": true
   },
   {
    "id": "laengenausdehnung.dt_inp",
    "feld": "dt_inp",
    "label": "dt_inp",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "K",
    "quelle": "gema_laengenausdehnung__<objektId>",
    "unsicher": true
   },
   {
    "id": "laengenausdehnung.mat1",
    "feld": "mat1",
    "label": "Material",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_laengenausdehnung__<objektId>"
   },
   {
    "id": "laengenausdehnung.len1",
    "feld": "len1",
    "label": "Länge L₁",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_laengenausdehnung__<objektId>"
   },
   {
    "id": "laengenausdehnung.dia1",
    "feld": "dia1",
    "label": "Aussendurchmesser d₁",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_laengenausdehnung__<objektId>"
   },
   {
    "id": "laengenausdehnung.mat2",
    "feld": "mat2",
    "label": "Material",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_laengenausdehnung__<objektId>"
   },
   {
    "id": "laengenausdehnung.len2",
    "feld": "len2",
    "label": "Länge L₂",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_laengenausdehnung__<objektId>"
   },
   {
    "id": "laengenausdehnung.dia2",
    "feld": "dia2",
    "label": "Aussendurchmesser d₂",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_laengenausdehnung__<objektId>"
   },
   {
    "id": "laengenausdehnung.z_sld",
    "feld": "z_sld",
    "label": "Dehnung simulieren",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_laengenausdehnung__<objektId>"
   },
   {
    "id": "laengenausdehnung.u_sld",
    "feld": "u_sld",
    "label": "Dehnung simulieren",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_laengenausdehnung__<objektId>"
   },
   {
    "id": "laengenausdehnung.k_sld",
    "feld": "k_sld",
    "label": "Kompression simulieren",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_laengenausdehnung__<objektId>"
   },
   {
    "id": "laengenausdehnung.k_la",
    "feld": "k_la",
    "label": "k_la",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mm",
    "quelle": "gema_laengenausdehnung__<objektId>",
    "unsicher": true
   },
   {
    "id": "laengenausdehnung.res1",
    "feld": "res1",
    "label": "Res1",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "laengenausdehnung.res2",
    "feld": "res2",
    "label": "Res2",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "leistungsbedarf": {
  "key": "leistungsbedarf",
  "datei": "el_leistungsbedarf",
  "label": "Anschlussleistung & Gleichzeitigkeit",
  "kategorie": "Elektro",
  "autosave": "leistungsbedarf",
  "werte": [
   {
    "id": "leistungsbedarf.lb_system",
    "feld": "lb_system",
    "label": "Netzsystem",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_u",
    "feld": "lb_u",
    "label": "Netzspannung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "V",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_gGlobal",
    "feld": "lb_gGlobal",
    "label": "Gleichzeitigkeit über alles",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_bauart",
    "feld": "lb_bauart",
    "label": "Kabelbauart",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_isolation",
    "feld": "lb_isolation",
    "label": "Isolation",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_verlegeart",
    "feld": "lb_verlegeart",
    "label": "Verlegeart",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_tumg",
    "feld": "lb_tumg",
    "label": "Umgebungstemperatur (Luft)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_material",
    "feld": "lb_material",
    "label": "Leitermaterial",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_laenge",
    "feld": "lb_laenge",
    "label": "Länge der Zuleitung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_duAnlauf",
    "feld": "lb_duAnlauf",
    "label": "Zul. Spannungsfall beim Anlauf",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_rows",
    "feld": "lb_rows",
    "label": "lb_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_leistungsbedarf__<objektId>",
    "unsicher": true
   },
   {
    "id": "leistungsbedarf.lb_evAktiv",
    "feld": "lb_evAktiv",
    "label": "lb_evAktiv",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_leistungsbedarf__<objektId>",
    "unsicher": true
   },
   {
    "id": "leistungsbedarf.lb_ev_hausA",
    "feld": "lb_ev_hausA",
    "label": "Hausanschluss (Überstromunterbrecher)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_uvA",
    "feld": "lb_ev_uvA",
    "label": "Vorsicherung Lade-Unterverteilung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_reserve",
    "feld": "lb_ev_reserve",
    "label": "Reserve für das Gebäude",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_n",
    "feld": "lb_ev_n",
    "label": "Anzahl Ladepunkte",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk.",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_stufe",
    "feld": "lb_ev_stufe",
    "label": "Ladeleistung je Ladepunkt",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_lpKW",
    "feld": "lb_ev_lpKW",
    "label": "Eigene Ladeleistung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_lpPh",
    "feld": "lb_ev_lpPh",
    "label": "lb_ev_lpPh",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_leistungsbedarf__<objektId>",
    "unsicher": true
   },
   {
    "id": "leistungsbedarf.lb_ev_lm",
    "feld": "lb_ev_lm",
    "label": "Lastmanagement",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_g",
    "feld": "lb_ev_g",
    "label": "Gleichzeitigkeit der Ladepunkte",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_buendel",
    "feld": "lb_ev_buendel",
    "label": "Stromkreise im gleichen Kabelbündel",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk.",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_laenge",
    "feld": "lb_ev_laenge",
    "label": "Länge zum entferntesten Ladepunkt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_duMax",
    "feld": "lb_ev_duMax",
    "label": "Zul. Spannungsfall zum Ladepunkt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_pv",
    "feld": "lb_ev_pv",
    "label": "PV-Leistung am Anschluss",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_bat",
    "feld": "lb_ev_bat",
    "label": "Batterie-Entladeleistung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_hop",
    "feld": "lb_ev_hop",
    "label": "Ladefenster",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h/Tag",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_verbr",
    "feld": "lb_ev_verbr",
    "label": "Verbrauch der Fahrzeuge",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/100 km",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_kompAktiv",
    "feld": "lb_kompAktiv",
    "label": "lb_kompAktiv",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_leistungsbedarf__<objektId>",
    "unsicher": true
   },
   {
    "id": "leistungsbedarf.lb_k_p",
    "feld": "lb_k_p",
    "label": "Wirkleistung P",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_k_cos1",
    "feld": "lb_k_cos1",
    "label": "cos φ heute",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_k_cos2",
    "feld": "lb_k_cos2",
    "label": "Ziel-cos φ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_k_schaltung",
    "feld": "lb_k_schaltung",
    "label": "Schaltung der Kondensatoren",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_k_stunden",
    "feld": "lb_k_stunden",
    "label": "Betriebsstunden im Jahr",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h/a",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_k_cosGrenz",
    "feld": "lb_k_cosGrenz",
    "label": "Grenz-cos φ des Netzbetreibers",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_k_preisBlind",
    "feld": "lb_k_preisBlind",
    "label": "Preis Blindarbeit",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "CHF/kvarh",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_k_preisWirk",
    "feld": "lb_k_preisWirk",
    "label": "Preis Wirkarbeit",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "CHF/kWh",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_k_invest",
    "feld": "lb_k_invest",
    "label": "Investition Kompensationsanlage",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "CHF",
    "quelle": "gema_leistungsbedarf__<objektId>"
   },
   {
    "id": "leistungsbedarf.lb_ev_resHint",
    "feld": "lb_ev_resHint",
    "label": "Lb ev res Hint",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "lu_tabelle": {
  "key": "lu_tabelle",
  "datei": "sb_lu_tabelle",
  "label": "LU-Tabelle & Spitzenvolumenstrom",
  "kategorie": "Sanitär",
  "autosave": "lu_tabelle",
  "werte": [
   {
    "id": "lu_tabelle.summary_api",
    "feld": "summary_api",
    "label": "Zusammenfassung aller Medien",
    "art": "ergebnis",
    "typ": "zahl",
    "api": "GemaLU.getSummary(objektId)"
   },
   {
    "id": "lu_tabelle.verbraucher_api",
    "feld": "verbraucher_api",
    "label": "Verbraucher-Liste (alle Medien)",
    "art": "ergebnis",
    "typ": "zahl",
    "api": "GemaLU.getVerbraucher(objektId)"
   },
   {
    "id": "lu_tabelle.q_ha_api",
    "feld": "q_ha_api",
    "label": "Belastung Hausanschlussleitung (Gesamt-LU)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaLU.getHausanschluss(objektId)"
   },
   {
    "id": "lu_tabelle.q_grau_api",
    "feld": "q_grau_api",
    "label": "Spitzenvolumenstrom Grauwasser (GW)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaLU.getSpitzenvolumenstrom(objektId,'grau')"
   },
   {
    "id": "lu_tabelle.q_gw_api",
    "feld": "q_gw_api",
    "label": "Spitzenvolumenstrom Regenwasser (RW)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaLU.getSpitzenvolumenstrom(objektId,'gw')"
   },
   {
    "id": "lu_tabelle.q_ow_api",
    "feld": "q_ow_api",
    "label": "Spitzenvolumenstrom Osmose (OW)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaLU.getSpitzenvolumenstrom(objektId,'ow')"
   },
   {
    "id": "lu_tabelle.q_bw_api",
    "feld": "q_bw_api",
    "label": "Spitzenvolumenstrom Enthärtetes Wasser (BW)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaLU.getSpitzenvolumenstrom(objektId,'bw')"
   },
   {
    "id": "lu_tabelle.q_nd_api",
    "feld": "q_nd_api",
    "label": "Spitzenvolumenstrom Netzdruck (ND)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaLU.getSpitzenvolumenstrom(objektId,'nd')"
   },
   {
    "id": "lu_tabelle.q_ww_api",
    "feld": "q_ww_api",
    "label": "Spitzenvolumenstrom Warmwasser (WW)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaLU.getSpitzenvolumenstrom(objektId,'ww')"
   },
   {
    "id": "lu_tabelle.q_kw_api",
    "feld": "q_kw_api",
    "label": "Spitzenvolumenstrom Kaltwasser (KW)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaLU.getSpitzenvolumenstrom(objektId,'kw')"
   },
   {
    "id": "lu_tabelle.unitFlowToggle",
    "feld": "unitFlowToggle",
    "label": "unitFlowToggle",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_lu_tabelle__<objektId>",
    "unsicher": true
   }
  ]
 },
 "mischkreuz": {
  "key": "mischkreuz",
  "datei": "sb_mischkreuz",
  "label": "Mischkreuz",
  "kategorie": "Sanitär",
  "autosave": "mischkreuz",
  "werte": [
   {
    "id": "mischkreuz.mk_q",
    "feld": "mk_q",
    "label": "Gesamtvolumenstrom nach der Mischung — der Wert gilt in der gewählten Einheit",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_mischkreuz__<objektId>"
   },
   {
    "id": "mischkreuz.mk_qunit",
    "feld": "mk_qunit",
    "label": "mk_qunit",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_mischkreuz__<objektId>",
    "unsicher": true
   },
   {
    "id": "mischkreuz.mk_tw",
    "feld": "mk_tw",
    "label": "Speicher-/Verteiltemperatur, z.B. 60 °C",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_mischkreuz__<objektId>"
   },
   {
    "id": "mischkreuz.mk_tk",
    "feld": "mk_tk",
    "label": "Kaltwasser ab Netz, z.B. 10 °C",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_mischkreuz__<objektId>"
   },
   {
    "id": "mischkreuz.mk_tm",
    "feld": "mk_tm",
    "label": "Gewünschte Temperatur nach der Mischung — muss zwischen KW und WW liegen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_mischkreuz__<objektId>"
   },
   {
    "id": "mischkreuz.mk_out_qls",
    "feld": "mk_out_qls",
    "label": "Volumenstrom [Q]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_qlmin",
    "feld": "mk_out_qlmin",
    "label": "Volumenstrom [Q] Q [l/s] · 60",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_aww",
    "feld": "mk_out_aww",
    "label": "WW-Anteil MW − KW",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_akw",
    "feld": "mk_out_akw",
    "label": "KW-Anteil WW − MW",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_spanne",
    "feld": "mk_out_spanne",
    "label": "Temperaturspanne WW − KW",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_pctww",
    "feld": "mk_out_pctww",
    "label": "WW-Anteil in Prozent (MW−KW)/(WW−KW)·100",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_pctkw",
    "feld": "mk_out_pctkw",
    "label": "KW-Anteil in Prozent (WW−MW)/(WW−KW)·100",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_qww_ls",
    "feld": "mk_out_qww_ls",
    "label": "Volumenstrom Warmwasser [QWW] Q·(MW−KW)/(WW−KW)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_qww",
    "feld": "mk_out_qww",
    "label": "Volumenstrom Warmwasser [QWW]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_qkw_ls",
    "feld": "mk_out_qkw_ls",
    "label": "Volumenstrom Kaltwasser [QKW] Q·(WW−MW)/(WW−KW)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_qkw",
    "feld": "mk_out_qkw",
    "label": "Volumenstrom Kaltwasser [QKW]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "mischkreuz.mk_out_sum",
    "feld": "mk_out_sum",
    "label": "Kontrolle: Summe der Volumenströme QWW + QKW = Q",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "niederschlagsanfall": {
  "key": "niederschlagsanfall",
  "datei": "sb_niederschlag",
  "label": "Niederschlagsanfall",
  "kategorie": "Sanitär",
  "autosave": "niederschlagsanfall",
  "werte": [
   {
    "id": "niederschlagsanfall.unitM3h",
    "feld": "unitM3h",
    "label": "unitM3h",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_niederschlagsanfall__<objektId>",
    "unsicher": true
   },
   {
    "id": "niederschlagsanfall.autoR",
    "feld": "autoR",
    "label": "autoR",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_niederschlagsanfall__<objektId>",
    "unsicher": true
   },
   {
    "id": "niederschlagsanfall.showAdvanced",
    "feld": "showAdvanced",
    "label": "showAdvanced",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_niederschlagsanfall__<objektId>",
    "unsicher": true
   },
   {
    "id": "niederschlagsanfall.defaultLocation",
    "feld": "defaultLocation",
    "label": "Standard-Ort",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_niederschlagsanfall__<objektId>"
   },
   {
    "id": "niederschlagsanfall.nbAdr",
    "feld": "nbAdr",
    "label": "Objektadresse",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_niederschlagsanfall__<objektId>"
   },
   {
    "id": "niederschlagsanfall.nbLon",
    "feld": "nbLon",
    "label": "nbLon",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_niederschlagsanfall__<objektId>",
    "unsicher": true
   },
   {
    "id": "niederschlagsanfall.nbLat",
    "feld": "nbLat",
    "label": "nbLat",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_niederschlagsanfall__<objektId>",
    "unsicher": true
   },
   {
    "id": "niederschlagsanfall.nbBegr",
    "feld": "nbBegr",
    "label": "Begründung für Abweichung vom nächstgelegenen Punkt",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_niederschlagsanfall__<objektId>"
   },
   {
    "id": "niederschlagsanfall.rkPrintChk",
    "feld": "rkPrintChk",
    "label": "rkPrintChk",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_niederschlagsanfall__<objektId>",
    "unsicher": true
   },
   {
    "id": "niederschlagsanfall.headMm",
    "feld": "headMm",
    "label": "Stauhöhe (mm)",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_niederschlagsanfall__<objektId>"
   },
   {
    "id": "niederschlagsanfall.nOverflows",
    "feld": "nOverflows",
    "label": "Anzahl Notüberläufe",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk",
    "quelle": "gema_niederschlagsanfall__<objektId>"
   },
   {
    "id": "niederschlagsanfall.btnReset",
    "feld": "btnReset",
    "label": "Btn Reset",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "objekte": {
  "key": "objekte",
  "datei": "",
  "label": "Objekte",
  "kategorie": "Projekt",
  "autosave": "",
  "werte": [
   {
    "id": "objekte.objekt_api",
    "feld": "objekt_api",
    "label": "Aktives Objekt (Stammdaten)",
    "art": "ergebnis",
    "typ": "zahl",
    "api": "GemaObjekte.getActive()"
   },
   {
    "id": "objekte.beteiligte_api",
    "feld": "beteiligte_api",
    "label": "Beteiligte des Objekts",
    "art": "ergebnis",
    "typ": "zahl",
    "api": "GemaObjekte.getBeteiligte()"
   }
  ]
 },
 "oelabscheider": {
  "key": "oelabscheider",
  "datei": "sa_oelabscheider",
  "label": "Ölabscheider",
  "kategorie": "Sanitäranlagen",
  "autosave": "oelabscheider",
  "werte": [
   {
    "id": "oelabscheider.mProjekt",
    "feld": "mProjekt",
    "label": "Projekt",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_oelabscheider__<objektId>"
   },
   {
    "id": "oelabscheider.mPlaner",
    "feld": "mPlaner",
    "label": "Bearbeiter",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_oelabscheider__<objektId>"
   },
   {
    "id": "oelabscheider.mDatum",
    "feld": "mDatum",
    "label": "Datum",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_oelabscheider__<objektId>"
   },
   {
    "id": "oelabscheider.oelOrt",
    "feld": "oelOrt",
    "label": "Standort",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_oelabscheider__<objektId>"
   },
   {
    "id": "oelabscheider.oelAutoR",
    "feld": "oelAutoR",
    "label": "oelAutoR",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_oelabscheider__<objektId>",
    "unsicher": true
   },
   {
    "id": "oelabscheider.n_wash",
    "feld": "n_wash",
    "label": "Anzahl Autowaschanlagen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk",
    "quelle": "gema_oelabscheider__<objektId>"
   },
   {
    "id": "oelabscheider.ns_out",
    "feld": "ns_out",
    "label": "Ns",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "osmose": {
  "key": "osmose",
  "datei": "sa_osmose",
  "label": "Umkehrosmoseanlage",
  "kategorie": "Sanitäranlagen",
  "autosave": "osmose",
  "werte": [
   {
    "id": "osmose.recovery_pct_api",
    "feld": "recovery_pct_api",
    "label": "Ausbeute (Gesamt)",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "%",
    "api": "GemaOsmose.getResults(objektId).recovery_pct"
   },
   {
    "id": "osmose.weichwasser_lh_api",
    "feld": "weichwasser_lh_api",
    "label": "Weichwasserbedarf",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/h",
    "api": "GemaOsmose.getResults(objektId).weichwasser_lh"
   },
   {
    "id": "osmose.konzentrat_ls_api",
    "feld": "konzentrat_ls_api",
    "label": "Konzentrat",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaOsmose.getResults(objektId).konzentrat_ls"
   },
   {
    "id": "osmose.konzentrat_lh_api",
    "feld": "konzentrat_lh_api",
    "label": "Konzentrat",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/h",
    "api": "GemaOsmose.getResults(objektId).konzentrat_lh"
   },
   {
    "id": "osmose.permeat_ls_api",
    "feld": "permeat_ls_api",
    "label": "Permeat",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/s",
    "api": "GemaOsmose.getResults(objektId).permeat_ls"
   },
   {
    "id": "osmose.permeat_lh_api",
    "feld": "permeat_lh_api",
    "label": "Permeat",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "l/h",
    "api": "GemaOsmose.getResults(objektId).permeat_lh"
   },
   {
    "id": "osmose.stufen",
    "feld": "stufen",
    "label": "Ausführung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_osmose__<objektId>"
   },
   {
    "id": "osmose.phi",
    "feld": "phi",
    "label": "Permeatausbeute φ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_osmose__<objektId>"
   },
   {
    "id": "osmose.phi2",
    "feld": "phi2",
    "label": "Permeatausbeute φ₂ (2. Stufe)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_osmose__<objektId>"
   },
   {
    "id": "osmose.va",
    "feld": "va",
    "label": "Anlageleistung VA",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/h",
    "quelle": "gema_osmose__<objektId>"
   },
   {
    "id": "osmose.targetHours",
    "feld": "targetHours",
    "label": "Ziel-Betriebszeit",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h/Tag",
    "quelle": "gema_osmose__<objektId>"
   },
   {
    "id": "osmose.otOptTank",
    "feld": "otOptTank",
    "label": "Tankgrösse (Startfüllung um 00:00)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l",
    "quelle": "gema_osmose__<objektId>"
   },
   {
    "id": "osmose.os_tankopt",
    "feld": "os_tankopt",
    "label": "os_tankopt",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_osmose__<objektId>",
    "unsicher": true
   },
   {
    "id": "osmose.otTankVergleich",
    "feld": "otTankVergleich",
    "label": "Ot Tank Vergleich",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "photovoltaik": {
  "key": "photovoltaik",
  "datei": "el_photovoltaik",
  "label": "Photovoltaik — Ertrag & Eigenverbrauch",
  "kategorie": "Elektro",
  "autosave": "photovoltaik",
  "werte": [
   {
    "id": "photovoltaik.pv_modus",
    "feld": "pv_modus",
    "label": "Auslegung über",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_kwp",
    "feld": "pv_kwp",
    "label": "Anlagenleistung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWp",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_dachFl",
    "feld": "pv_dachFl",
    "label": "Dachfläche brutto",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_dach",
    "feld": "pv_dach",
    "label": "Dachform",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_belegung",
    "feld": "pv_belegung",
    "label": "Belegungsgrad",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_wgrad",
    "feld": "pv_wgrad",
    "label": "Modulwirkungsgrad",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_modFl",
    "feld": "pv_modFl",
    "label": "Modulfläche",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_spez",
    "feld": "pv_spez",
    "label": "Spezifischer Ertrag am Standort",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/kWp·a",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_ausricht",
    "feld": "pv_ausricht",
    "label": "Ausrichtung & Neigung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_verlust",
    "feld": "pv_verlust",
    "label": "Systemverluste",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_abregel",
    "feld": "pv_abregel",
    "label": "Abregelungsverlust",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_ev",
    "feld": "pv_ev",
    "label": "Eigenverbrauchsanteil ohne Speicher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_bedarf",
    "feld": "pv_bedarf",
    "label": "Jahresverbrauch der Liegenschaft",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/a",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_battKwh",
    "feld": "pv_battKwh",
    "label": "Batteriespeicher optional",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_battZykl",
    "feld": "pv_battZykl",
    "label": "Vollzyklen des Speichers",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "1/a",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_battChf",
    "feld": "pv_battChf",
    "label": "Mehrkosten Speicher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "CHF",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_invKwp",
    "feld": "pv_invKwp",
    "label": "Investition",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "CHF/kWp",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_foerder",
    "feld": "pv_foerder",
    "label": "Einmalige Förderung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "CHF",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_preis",
    "feld": "pv_preis",
    "label": "Strompreis (Bezug)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Rp./kWh",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_verg",
    "feld": "pv_verg",
    "label": "Einspeisevergütung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Rp./kWh",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_opex",
    "feld": "pv_opex",
    "label": "Betriebskosten",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%/a",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_degr",
    "feld": "pv_degr",
    "label": "Leistungsdegradation",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%/a",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_jahre",
    "feld": "pv_jahre",
    "label": "Betrachtungsdauer",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Jahre",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_zins",
    "feld": "pv_zins",
    "label": "Kalkulationszinssatz",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_netz",
    "feld": "pv_netz",
    "label": "Netzsystem",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_wr",
    "feld": "pv_wr",
    "label": "Wechselrichter-Wirkungsgrad",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_photovoltaik__<objektId>"
   },
   {
    "id": "photovoltaik.pv_acdc",
    "feld": "pv_acdc",
    "label": "Verhältnis AC zu DC",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_photovoltaik__<objektId>"
   }
  ]
 },
 "poe": {
  "key": "poe",
  "datei": "el_poe",
  "label": "PoE — Leistung & RP-Kategorie",
  "kategorie": "Elektro",
  "autosave": "poe",
  "werte": [
   {
    "id": "poe.po_beispiel",
    "feld": "po_beispiel",
    "label": "Beispielwert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_poe__<objektId>"
   },
   {
    "id": "poe.po_material",
    "feld": "po_material",
    "label": "Leitermaterial",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_poe__<objektId>"
   },
   {
    "id": "poe.po_temp",
    "feld": "po_temp",
    "label": "Betriebstemperatur Leiter",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_poe__<objektId>"
   }
  ]
 },
 "potenzialausgleich": {
  "key": "potenzialausgleich",
  "datei": "el_potenzialausgleich",
  "label": "Potenzialausgleich & Schutzleiter",
  "kategorie": "Elektro",
  "autosave": "potenzialausgleich",
  "werte": [
   {
    "id": "potenzialausgleich.pa_pen",
    "feld": "pa_pen",
    "label": "Schutzleiter der Hauptzuleitung (PEN / PE)",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_potenzialausgleich__<objektId>"
   },
   {
    "id": "potenzialausgleich.pa_phase",
    "feld": "pa_phase",
    "label": "Aussenleiter der betrachteten Leitung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_potenzialausgleich__<objektId>"
   },
   {
    "id": "potenzialausgleich.pa_opaschutz",
    "feld": "pa_opaschutz",
    "label": "Zusätzlicher Potenzialausgleich — Verlegung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_potenzialausgleich__<objektId>"
   },
   {
    "id": "potenzialausgleich.pa_blitz",
    "feld": "pa_blitz",
    "label": "Äusserer Blitzschutz",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_potenzialausgleich__<objektId>"
   },
   {
    "id": "potenzialausgleich.pa_werkstoff",
    "feld": "pa_werkstoff",
    "label": "Werkstoff des Ausgleichsleiters",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_potenzialausgleich__<objektId>"
   }
  ]
 },
 "regenwasser_luzern": {
  "key": "regenwasser_luzern",
  "datei": "sb_regenwasser_luzern",
  "label": "Regenwasserberechnung Stadt Luzern — Befestigte Flächen, Retention & Versickerung",
  "kategorie": "Sanitär",
  "autosave": "regenwasser_luzern",
  "werte": [
   {
    "id": "regenwasser_luzern.rl_name",
    "feld": "rl_name",
    "label": "Name",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_vorname",
    "feld": "rl_vorname",
    "label": "Vorname",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_adresse",
    "feld": "rl_adresse",
    "label": "Adresse",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_plzort",
    "feld": "rl_plzort",
    "label": "PLZ, Wohnort",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_stadtteil",
    "feld": "rl_stadtteil",
    "label": "Stadtteil",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_parznr",
    "feld": "rl_parznr",
    "label": "Parzellen-Nummer",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_avflaeche",
    "feld": "rl_avflaeche",
    "label": "Parzellen-Fläche gem. amtl. Vermessung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_gep",
    "feld": "rl_gep",
    "label": "c. Zulässiger GEP-Abflussbeiwert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_retvol",
    "feld": "rl_retvol",
    "label": "Retentionsvolumen (Deklaration)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_vteil",
    "feld": "rl_vteil",
    "label": "Eine Versickerungsanlage ist Teil dieses Gesuchs",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_sicker",
    "feld": "rl_sicker",
    "label": "Sickerleistung der Versickerungsanlage",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_regenwasser_luzern__<objektId>"
   },
   {
    "id": "regenwasser_luzern.rl_rows",
    "feld": "rl_rows",
    "label": "rl_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasser_luzern__<objektId>",
    "unsicher": true
   }
  ]
 },
 "regenwasserrechner": {
  "key": "regenwasserrechner",
  "datei": "sb_regenwasserrechner",
  "label": "Regenwasserrechner AWEL — Entwässerungsplanung, Retention & Versickerung",
  "kategorie": "Sanitär",
  "autosave": "regenwasserrechner",
  "werte": [
   {
    "id": "regenwasserrechner.rw_gemeinde",
    "feld": "rw_gemeinde",
    "label": "Gemeinde",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_katnr",
    "feld": "rw_katnr",
    "label": "Kat.-Nr. des Grundstücks/Perimeters",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_aper",
    "feld": "rw_aper",
    "label": "Grundstücks-/Perimeterfläche",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_psikom",
    "feld": "rw_psikom",
    "label": "leer = kantonale Minimalanforderung Ψa ≤ 15 %",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_v_typ",
    "feld": "rw_v_typ",
    "label": "Anlagen-Typ",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_v_bez",
    "feld": "rw_v_bez",
    "label": "Bezeichnung der Anlage",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_v_nrn",
    "feld": "rw_v_nrn",
    "label": "Angeschlossene Flächen-Nr.",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_v_areds",
    "feld": "rw_v_areds",
    "label": "⇩ aus Tab ① übernehmen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_v_av",
    "feld": "rw_v_av",
    "label": "bei oberirdischen Anlagen AV ≈ AÜ (Überstaufläche)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_v_ag",
    "feld": "rw_v_ag",
    "label": "Fläche am tiefsten Punkt der Anlage",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_v_mat",
    "feld": "rw_v_mat",
    "label": "Humus, Kies, Rohboden usw.",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_v_sspez",
    "feld": "rw_v_sspez",
    "label": "Spezifische Sickerleistung Sspezif",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/(min·m²)",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_v_z",
    "feld": "rw_v_z",
    "label": "Bereich 0.2 … 10 · Normalfall z = 1 oder kommunale Anforderung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Jahre",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_gew",
    "feld": "rw_e_gew",
    "label": "Fliessgewässername an der Einleitstelle",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_x",
    "feld": "rw_e_x",
    "label": "X-Koordinate der Einleitstelle",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_y",
    "feld": "rw_e_y",
    "label": "Y-Koordinate der Einleitstelle",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_aper",
    "feld": "rw_e_aper",
    "label": "Grundstücks-/Perimeterfläche APerimeter",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_areda",
    "feld": "rw_e_areda",
    "label": "Reduzierte Fläche mit Ableitung vom Grundstück Σ Ared,a",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_areds",
    "feld": "rw_e_areds",
    "label": "Reduzierte Fläche mit Einleitung in Fliessgewässer Σ Ared,S",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_r1",
    "feld": "rw_e_r1",
    "label": "0.014 l/(s·m²) für Jährlichkeit z = 1 oder kommunale Anforderung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/(s·m²)",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_q347",
    "feld": "rw_e_q347",
    "label": "Q347 ist bei der kantonalen Fachstelle (AWEL) anzufragen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_drossel",
    "feld": "rw_e_drossel",
    "label": "Drosselmenge der Einleitung in RW- oder MW-Kanalisation",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_e_z",
    "feld": "rw_e_z",
    "label": "Überlaufjährlichkeit z",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Jahre",
    "quelle": "gema_regenwasserrechner__<objektId>"
   },
   {
    "id": "regenwasserrechner.rw_rows",
    "feld": "rw_rows",
    "label": "rw_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_regenwasserrechner__<objektId>",
    "unsicher": true
   },
   {
    "id": "regenwasserrechner.rw_out_psi",
    "feld": "rw_out_psi",
    "label": "Mittlerer Grundstücksabflussbeiwert Ψa Ψa = Σ Ared,a (Ableitung) / APerimeter",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "regenwasserrechner.rw_out_grenze",
    "feld": "rw_out_grenze",
    "label": "Massgebliche Anforderung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "regenwasserrechner.rw_out_psichk",
    "feld": "rw_out_psichk",
    "label": "Ist die massgebliche Anforderung an Ψa erfüllt?",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "regenwasserrechner.rw_v_out_qs",
    "feld": "rw_v_out_qs",
    "label": "Sickerleistung QS QS = AV · Sspezif / 60",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "regenwasserrechner.rw_v_out_a",
    "feld": "rw_v_out_a",
    "label": "az az = 23.621 + 9.5684 · ln(z)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "regenwasserrechner.rw_v_out_b",
    "feld": "rw_v_out_b",
    "label": "bz bz = 0.2162 + 0.0133 · ln(z)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "regenwasserrechner.rw_e_out_psi",
    "feld": "rw_e_out_psi",
    "label": "Rw e psi",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "regenwasserrechner.rw_e_out_f1",
    "feld": "rw_e_out_f1",
    "label": "Rw e f1",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "regenwasserrechner.rw_e_out_qe1",
    "feld": "rw_e_out_qe1",
    "label": "Rw e qe1",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "regenwasserrechner.rw_e_out_f2",
    "feld": "rw_e_out_f2",
    "label": "Rw e f2",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "regenwasserrechner.rw_e_out_qdr",
    "feld": "rw_e_out_qdr",
    "label": "Rw e qdr",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "regenwasserrechner.rw_e_out_f3",
    "feld": "rw_e_out_f3",
    "label": "Rw e f3",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "regenwasserrechner.rw_e_out_alle",
    "feld": "rw_e_out_alle",
    "label": "Rw e alle",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "regenwasserrechner.rw_e_out_a",
    "feld": "rw_e_out_a",
    "label": "az az = 23.621 + 9.5684 · ln(z)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "regenwasserrechner.rw_e_out_b",
    "feld": "rw_e_out_b",
    "label": "bz bz = 0.2162 + 0.0133 · ln(z)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "regenwasserrechner.rw_e_out_dros",
    "feld": "rw_e_out_dros",
    "label": "Wirksame Drosselmenge für die Berechnung",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "saugpumpe": {
  "key": "saugpumpe",
  "datei": "sb_saugpumpe",
  "label": "Saugpumpe – maximale Saughöhe",
  "kategorie": "Sanitär",
  "autosave": "saugpumpe",
  "werte": [
   {
    "id": "saugpumpe.sg_h",
    "feld": "sg_h",
    "label": "Standort der Anlage über Meer",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m ü.M.",
    "quelle": "gema_saugpumpe__<objektId>"
   },
   {
    "id": "saugpumpe.sg_t",
    "feld": "sg_t",
    "label": "Dichte-Näherung gültig 10–200 °C",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_saugpumpe__<objektId>"
   },
   {
    "id": "saugpumpe.sg_pf",
    "feld": "sg_pf",
    "label": "Rohrreibung + Einzelwiderstände der Saugleitung (inkl. Fussventil)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Pa",
    "quelle": "gema_saugpumpe__<objektId>"
   },
   {
    "id": "saugpumpe.sl_aktiv",
    "feld": "sl_aktiv",
    "label": "sl_aktiv",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_saugpumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "saugpumpe.sl_q",
    "feld": "sl_q",
    "label": "Nennförderstrom der Pumpe",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/s",
    "quelle": "gema_saugpumpe__<objektId>"
   },
   {
    "id": "saugpumpe.sg_saugltg",
    "feld": "sg_saugltg",
    "label": "Druckverlust Saugleitung [pf] λ·(L/di)·(ρ/2)·v² + Σζ·(ρ/2)·v²",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_saugpumpe__<objektId>"
   },
   {
    "id": "saugpumpe.sg_npsh",
    "feld": "sg_npsh",
    "label": "Pumpen-Datenblatt, beim Nennförderstrom",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_saugpumpe__<objektId>"
   },
   {
    "id": "saugpumpe.sg_hs",
    "feld": "sg_hs",
    "label": "Empfehlung: mindestens 0.5 m",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_saugpumpe__<objektId>"
   },
   {
    "id": "saugpumpe.sg_pv",
    "feld": "sg_pv",
    "label": "Leer = automatisch aus der Dampfdruck-Tafel bei Wassertemperatur",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Pa",
    "quelle": "gema_saugpumpe__<objektId>"
   },
   {
    "id": "saugpumpe.saughoeheMax_out",
    "feld": "saughoeheMax_out",
    "label": "Saughoehe Max",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.npshVerfuegbar_out",
    "feld": "npshVerfuegbar_out",
    "label": "Npsh Verfuegbar",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.wasserTemp_out",
    "feld": "wasserTemp_out",
    "label": "Wasser Temp",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.hoehe_out",
    "feld": "hoehe_out",
    "label": "Hoehe",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_pluft",
    "feld": "sg_out_pluft",
    "label": "Luftdruck [pLuft] 101'325·((288 − 0.0065·h)/288)5.255",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_rho",
    "feld": "sg_out_rho",
    "label": "Dichte des Wassers [ρ] 1'006 − (0.26·T + 0.0022·T²)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_hb",
    "feld": "sg_out_hb",
    "label": "Theoretisch maximale Saughöhe [Hb] pLuft / (ρ·9.81)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sl_out_v",
    "feld": "sl_out_v",
    "label": "Grösste Fliessgeschwindigkeit [v] Q / A",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sl_out_pf",
    "feld": "sl_out_pf",
    "label": "Druckverlust Saugleitung [pf] λ·(L/di)·(ρ/2)·v² + Σζ·(ρ/2)·v²",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_hf",
    "feld": "sg_out_hf",
    "label": "Druckverlust in der Saugleitung [Hf] pf / (ρ·9.81)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_pvauto",
    "feld": "sg_out_pvauto",
    "label": "Tafelwert bei T [pv]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_hv",
    "feld": "sg_out_hv",
    "label": "Verdampfungsdruck in Meter [Hv] pv / (ρ·9.81)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_hb2",
    "feld": "sg_out_hb2",
    "label": "Theoretisch maximale Saughöhe [Hb]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_hf2",
    "feld": "sg_out_hf2",
    "label": "− Druckverlust in der Saugleitung [Hf]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_npsh2",
    "feld": "sg_out_npsh2",
    "label": "− NPSH-Wert des Herstellers [NPSH]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_hs2",
    "feld": "sg_out_hs2",
    "label": "− Sicherheitszuschlag [Hs]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_hv2",
    "feld": "sg_out_hv2",
    "label": "− Verdampfungsdruck [Hv]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "saugpumpe.sg_out_hmax",
    "feld": "sg_out_hmax",
    "label": "Maximale Saughöhe [hmax] Hb − Hf − NPSH − Hs − Hv",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "schlammsammler": {
  "key": "schlammsammler",
  "datei": "sa_schlammsammler",
  "label": "Schlammsammler Auslegung",
  "kategorie": "Sanitäranlagen",
  "autosave": "schlammsammler",
  "werte": [
   {
    "id": "schlammsammler.qTotal",
    "feld": "qTotal",
    "label": "Zufluss Total (aus Einläufen)",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_schlammsammler__<objektId>"
   },
   {
    "id": "schlammsammler.hVal",
    "feld": "hVal",
    "label": "Abscheideraumtiefe h",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_schlammsammler__<objektId>"
   },
   {
    "id": "schlammsammler.outDepth",
    "feld": "outDepth",
    "label": "Tiefe Auslaufsohle unter Deckel",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_schlammsammler__<objektId>"
   },
   {
    "id": "schlammsammler.abgangDN",
    "feld": "abgangDN",
    "label": "Abgangsdimension",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_schlammsammler__<objektId>"
   },
   {
    "id": "schlammsammler.sludgeDepth",
    "feld": "sludgeDepth",
    "label": "Schlammraumtiefe",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_schlammsammler__<objektId>"
   },
   {
    "id": "schlammsammler.dnTarget",
    "feld": "dnTarget",
    "label": "DN-Ziel (optional)",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_schlammsammler__<objektId>"
   },
   {
    "id": "schlammsammler.volumen_out",
    "feld": "volumen_out",
    "label": "Volumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "schlammsammler.durchmesser_out",
    "feld": "durchmesser_out",
    "label": "Durchmesser",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "schlammsammler.tOut",
    "feld": "tOut",
    "label": "Aufenthaltszeit t",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "schlammsammler.aOut",
    "feld": "aOut",
    "label": "Abscheideoberfläche A",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "A = (Q·t) / h"
   },
   {
    "id": "schlammsammler.dReqOut",
    "feld": "dReqOut",
    "label": "Erf. Ø aus A",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "Dᵣₑq = √(4A/π)"
   },
   {
    "id": "schlammsammler.dnOut",
    "feld": "dnOut",
    "label": "Empfohlene Nennweite",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "–"
   },
   {
    "id": "schlammsammler.vOut",
    "feld": "vOut",
    "label": "Abscheideraum-Vol.",
    "art": "ergebnis",
    "typ": "zahl",
    "einheit": "V = Q · t"
   },
   {
    "id": "schlammsammler.shaftDepthOut",
    "feld": "shaftDepthOut",
    "label": "Schachttiefe gesamt",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "spannungsfall": {
  "key": "spannungsfall",
  "datei": "el_spannungsfall",
  "label": "Spannungsfall & Verlustleistung",
  "kategorie": "Elektro",
  "autosave": "spannungsfall",
  "werte": [
   {
    "id": "spannungsfall.sf_bez",
    "feld": "sf_bez",
    "label": "Bezeichnung der Leitung",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_system",
    "feld": "sf_system",
    "label": "Netzsystem",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_strom",
    "feld": "sf_strom",
    "label": "Stromstärke I",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "A",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_laenge",
    "feld": "sf_laenge",
    "label": "Leitungslänge L",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_quer",
    "feld": "sf_quer",
    "label": "Querschnitt je Leiter A",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_parallel",
    "feld": "sf_parallel",
    "label": "Parallele Leiter je Phase",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_material",
    "feld": "sf_material",
    "label": "Leitermaterial",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_temp",
    "feld": "sf_temp",
    "label": "Betriebstemperatur Leiter",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_cosphi",
    "feld": "sf_cosphi",
    "label": "Leistungsfaktor cos φ",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_xbelag",
    "feld": "sf_xbelag",
    "label": "Reaktanzbelag X′",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mΩ/m",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_grenz",
    "feld": "sf_grenz",
    "label": "Zulässiger Spannungsfall",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_hTag",
    "feld": "sf_hTag",
    "label": "Betriebsstunden pro Tag",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h/Tag",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_tage",
    "feld": "sf_tage",
    "label": "Betriebstage pro Jahr",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Tage",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_jahre",
    "feld": "sf_jahre",
    "label": "Betrachtungsdauer",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Jahre",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_auslast",
    "feld": "sf_auslast",
    "label": "Mittlere Auslastung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_preis",
    "feld": "sf_preis",
    "label": "Energiepreis",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "CHF/kWh",
    "quelle": "gema_spannungsfall__<objektId>"
   },
   {
    "id": "spannungsfall.sf_energie",
    "feld": "sf_energie",
    "label": "Energieverlust E = PV · t · (Auslastung)² / 1000",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "summenlinien": {
  "key": "summenlinien",
  "datei": "sb_summenlinien",
  "label": "Summenliniendiagramm",
  "kategorie": "Sanitär",
  "autosave": "summenlinien",
  "werte": [
   {
    "id": "summenlinien.sl_profil",
    "feld": "sl_profil",
    "label": "setzt die 24 Stundenwerte — jeder Wert bleibt danach frei überschreibbar",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_start",
    "feld": "sl_start",
    "label": "VSSH-Konvention 05:00 — die Summenlinie startet mit diesem Tageszeitpunkt bei 0 %",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_spitze",
    "feld": "sl_spitze",
    "label": "Effektive Stundenspitze (Überschreibung)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_bedarf",
    "feld": "sl_bedarf",
    "label": "Bezugsgrösse des ganzen Diagramms",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/d",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_vp",
    "feld": "sl_vp",
    "label": "Personen × Liter/Person — schreibt beim Klick in den Tagesbedarf",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/P·d",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_np",
    "feld": "sl_np",
    "label": "Anzahl Personen / Einheiten",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_tkw",
    "feld": "sl_tkw",
    "label": "Eintritt in den Speicher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_tsp",
    "feld": "sl_tsp",
    "label": "Temperatur, auf die geladen wird",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_lead",
    "feld": "sl_lead",
    "label": "welche der beiden Grössen führt — die andere wird daraus errechnet",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_leistung",
    "feld": "sl_leistung",
    "label": "Wärmeerzeugerleistung für die Warmwasserladung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_aufwaerm",
    "feld": "sl_aufwaerm",
    "label": "Zeit, um das Speichervolumen von θKW auf θsto zu laden",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_speicher",
    "feld": "sl_speicher",
    "label": "0 = erforderliches Minimum aus dem Diagramm (bei Vorgabe «Aufwärmzeit» ist ein Wert nötig)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_modus",
    "feld": "sl_modus",
    "label": "bestimmt, wann Ladeleistung zur Verfügung steht",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_summenlinien__<objektId>"
   },
   {
    "id": "summenlinien.sl_f1a",
    "feld": "sl_f1a",
    "label": "sl_f1a",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f1von",
    "feld": "sl_f1von",
    "label": "sl_f1von",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f1bis",
    "feld": "sl_f1bis",
    "label": "sl_f1bis",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f2a",
    "feld": "sl_f2a",
    "label": "sl_f2a",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f2von",
    "feld": "sl_f2von",
    "label": "sl_f2von",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f2bis",
    "feld": "sl_f2bis",
    "label": "sl_f2bis",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f3a",
    "feld": "sl_f3a",
    "label": "sl_f3a",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f3von",
    "feld": "sl_f3von",
    "label": "sl_f3von",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f3bis",
    "feld": "sl_f3bis",
    "label": "sl_f3bis",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f4a",
    "feld": "sl_f4a",
    "label": "sl_f4a",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f4von",
    "feld": "sl_f4von",
    "label": "sl_f4von",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_f4bis",
    "feld": "sl_f4bis",
    "label": "sl_f4bis",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_summenlinien__<objektId>",
    "unsicher": true
   },
   {
    "id": "summenlinien.sl_out_dt",
    "feld": "sl_out_dt",
    "label": "Temperaturerhöhung Ladung [∆θ] θsto − θKW",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_p",
    "feld": "sl_out_p",
    "label": "Ladeleistung [P] V·4.187·∆θ ÷ (3600·tauf)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_tauf",
    "feld": "sl_out_tauf",
    "label": "Aufwärmzeit [tauf] V·4.187·∆θ ÷ (3600·P)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_vref",
    "feld": "sl_out_vref",
    "label": "Bezugsvolumen der Aufwärmzeit",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_bedarf",
    "feld": "sl_out_bedarf",
    "label": "Tagesbedarf (= 100 %)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_rate",
    "feld": "sl_out_rate",
    "label": "Laderate V̇ = P·3600 ÷ (4.187·∆θ)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_kap",
    "feld": "sl_out_kap",
    "label": "Ladekapazität pro Tag",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_pmin",
    "feld": "sl_out_pmin",
    "label": "Mindest-Ladeleistung Tagesbedarf ÷ Ladezeit",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_speicher",
    "feld": "sl_out_speicher",
    "label": "grösster Bedarfsüberschuss über jede Zeitspanne",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_krit",
    "feld": "sl_out_krit",
    "label": "Kritische Entladung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_spitze",
    "feld": "sl_out_spitze",
    "label": "Spitzenstunde (Spitzendeckungsvolumen)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_cap",
    "feld": "sl_out_cap",
    "label": "Dargestelltes Speichervolumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "summenlinien.sl_out_sperr",
    "feld": "sl_out_sperr",
    "label": "Dargestelltes Speichervolumen",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "thermische_solaranlage": {
  "key": "thermische_solaranlage",
  "datei": "sa_solaranlage",
  "label": "Thermische Solaranlage",
  "kategorie": "Sanitäranlagen",
  "autosave": "thermische_solaranlage",
  "werte": [
   {
    "id": "thermische_solaranlage.klimastation",
    "feld": "klimastation",
    "label": "Klimastation",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.ebf",
    "feld": "ebf",
    "label": "EBF",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.jn",
    "feld": "jn",
    "label": "Spez. Pers.-Fl.",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²/P",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tww",
    "feld": "tww",
    "label": "Tww",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tkw",
    "feld": "tkw",
    "label": "Tkw",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.jww",
    "feld": "jww",
    "label": "Spez. WW-Bedarf",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/P·d",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.vLossWw",
    "feld": "vLossWw",
    "label": "Verteilverlust WW",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.sLoss",
    "feld": "sLoss",
    "label": "Verlust Speicher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.ph",
    "feld": "ph",
    "label": "Heizenergiebedarf",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "MJ/a·m²",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.vLossH",
    "feld": "vLossH",
    "label": "Verteilverlust H",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.shade",
    "feld": "shade",
    "label": "Verschattung / Abweich.",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.distLossSolar",
    "feld": "distLossSolar",
    "label": "Verteilverlust Solar",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.targetWw",
    "feld": "targetWw",
    "label": "Ziel WW",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.targetH",
    "feld": "targetH",
    "label": "Ziel Heizung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.area",
    "feld": "area",
    "label": "Absorberfläche (gewählt)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.storePerM2",
    "feld": "storePerM2",
    "label": "Speicher / m²",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/m²",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.flowPerM2",
    "feld": "flowPerM2",
    "label": "Volumenstrom",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/h·m²",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.uValue",
    "feld": "uValue",
    "label": "WT U-Wert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "W/m²K",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.deltaT",
    "feld": "deltaT",
    "label": "ΔT Wärmetauscher",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "K",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Jan",
    "feld": "tm_Jan",
    "label": "Jan",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Feb",
    "feld": "tm_Feb",
    "label": "Feb",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Mär",
    "feld": "tm_Mär",
    "label": "Mär",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Apr",
    "feld": "tm_Apr",
    "label": "Apr",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Mai",
    "feld": "tm_Mai",
    "label": "Mai",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Jun",
    "feld": "tm_Jun",
    "label": "Jun",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Jul",
    "feld": "tm_Jul",
    "label": "Jul",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Aug",
    "feld": "tm_Aug",
    "label": "Aug",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Sep",
    "feld": "tm_Sep",
    "label": "Sep",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Okt",
    "feld": "tm_Okt",
    "label": "Okt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Nov",
    "feld": "tm_Nov",
    "label": "Nov",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.tm_Dez",
    "feld": "tm_Dez",
    "label": "Dez",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_thermische_solaranlage__<objektId>"
   },
   {
    "id": "thermische_solaranlage.flaeche_out",
    "feld": "flaeche_out",
    "label": "Flaeche",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "vonroll_tabellen": {
  "key": "vonroll_tabellen",
  "datei": "sb_vonroll",
  "label": "Von-Roll Tabellen",
  "kategorie": "Sanitär",
  "autosave": "",
  "werte": [
   {
    "id": "vonroll_tabellen.results",
    "feld": "results",
    "label": "Results",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   }
  ]
 },
 "waermegruppen": {
  "key": "waermegruppen",
  "datei": "hz_waermegruppen",
  "label": "Wärmegruppen & Wärmeerzeugerleistung",
  "kategorie": "Heizung",
  "autosave": "waermegruppen",
  "werte": [
   {
    "id": "waermegruppen.wg_hlb",
    "feld": "wg_hlb",
    "label": "inkl. Lüftungswärmeverluste · 0 = Total Abgabesysteme aus Tab ②",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_waermegruppen__<objektId>"
   },
   {
    "id": "waermegruppen.wg_gb",
    "feld": "wg_gb",
    "label": "nur wenn nicht bereits in ΦHL,b berücksichtigt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_waermegruppen__<objektId>"
   },
   {
    "id": "waermegruppen.wg_sperr",
    "feld": "wg_sperr",
    "label": "z.B. 6 h gem. EW — 0 = kein Sperrzeiten-Zuschlag",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h",
    "quelle": "gema_waermegruppen__<objektId>"
   },
   {
    "id": "waermegruppen.wg_rows",
    "feld": "wg_rows",
    "label": "wg_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermegruppen__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermegruppen.leistungGenOut_out",
    "feld": "leistungGenOut_out",
    "label": "Leistung Gen Out",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.heizlast_out",
    "feld": "heizlast_out",
    "label": "Heizlast",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.warmwasser_out",
    "feld": "warmwasser_out",
    "label": "Warmwasser",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.sperrzuschlag_out",
    "feld": "sperrzuschlag_out",
    "label": "Sperrzuschlag",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.wg_out_raumFl",
    "feld": "wg_out_raumFl",
    "label": "Wg raum Fl",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "waermegruppen.wg_out_raumKw",
    "feld": "wg_out_raumKw",
    "label": "Wg raum Kw",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "waermegruppen.wg_out_totFl",
    "feld": "wg_out_totFl",
    "label": "Wg tot Fl",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "waermegruppen.wg_out_totKw",
    "feld": "wg_out_totKw",
    "label": "Wg tot Kw",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "waermegruppen.wg_out_totVerb",
    "feld": "wg_out_totVerb",
    "label": "Wg tot Verb",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "waermegruppen.wg_out_wwBedarf",
    "feld": "wg_out_wwBedarf",
    "label": "Wg ww Bedarf",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "waermegruppen.wg_out_wwQ",
    "feld": "wg_out_wwQ",
    "label": "Wg ww Q",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "waermegruppen.wg_out_wwP",
    "feld": "wg_out_wwP",
    "label": "Wg ww P",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "waermegruppen.wg_out_hlbEff",
    "feld": "wg_out_hlbEff",
    "label": "Massgebende Norm-Heizlast [ΦHL,b]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.wg_out_phioff",
    "feld": "wg_out_phioff",
    "label": "Zuschlag Sperrzeiten [Φoff] ΦHL,b·24/(24−toff) − ΦHL,b",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.wg_out_phiw",
    "feld": "wg_out_phiw",
    "label": "Warmwasser / Boilerladung [ΦW]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.wg_out_phias",
    "feld": "wg_out_phias",
    "label": "Zuschlag verbundene Systeme [ΦAS]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.wg_out_phigen",
    "feld": "wg_out_phigen",
    "label": "Erforderliche Wärmeerzeugerleistung [Φgen,out]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.wg_out_kontrolle",
    "feld": "wg_out_kontrolle",
    "label": "Kontrolle: Total erfasste Abgabesysteme",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermegruppen.wg_out_diff",
    "feld": "wg_out_diff",
    "label": "Differenz Abgabesysteme − Φgen,out",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "waermepumpe": {
  "key": "waermepumpe",
  "datei": "hz_waermepumpe",
  "label": "Wärmepumpe — Jahresarbeitszahl (JAZ)",
  "kategorie": "Heizung",
  "autosave": "waermepumpe",
  "werte": [
   {
    "id": "waermepumpe.wpe_station",
    "feld": "wpe_station",
    "label": "SIA 2028 — bestimmt BIN-Verteilung, Ta,min und HGT",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_kat",
    "feld": "wpe_kat",
    "label": "bestimmt freie Wärme Fg,ev und Standard-Warmwasserbedarf",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "m²",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_ebf",
    "feld": "wpe_ebf",
    "label": "Energiebezugsfläche EBF [AE]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_einheit",
    "feld": "wpe_einheit",
    "label": "Einheit der Energie-Eingaben",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_qh",
    "feld": "wpe_qh",
    "label": "Heizwärmebedarf nach SIA 380/1 [Qh,eff]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/m²a",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_qt",
    "feld": "wpe_qt",
    "label": "Transmissionswärmeverluste [QT]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/m²a",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_qv",
    "feld": "wpe_qv",
    "label": "Lüftungswärmeverluste [QV]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/m²a",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_vv",
    "feld": "wpe_vv",
    "label": "ausserhalb der thermischen Hülle",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_sperr",
    "feld": "wpe_sperr",
    "label": "Sperrzeiten für Wärmepumpe [EW]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h/d",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_wwv",
    "feld": "wpe_wwv",
    "label": "Warmwasser: zusätzliche Speicher- und Verteilverluste",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_qww_man",
    "feld": "wpe_qww_man",
    "label": "leer = Standardwert nach SIA 380/1 gemäss Gebäudekategorie",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/m²a",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_art",
    "feld": "wpe_art",
    "label": "Wärmequelle",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_db_herst",
    "feld": "wpe_db_herst",
    "label": "WP-Datenbank — Hersteller",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_db_typ",
    "feld": "wpe_db_typ",
    "label": "WP-Datenbank — Gerät",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_stufig",
    "feld": "wpe_stufig",
    "label": "Stufigkeit",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_typ",
    "feld": "wpe_typ",
    "label": "Kennwerte gemäss Datenblatt EN 14511",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_einsatz",
    "feld": "wpe_einsatz",
    "label": "Einsatz",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_bw",
    "feld": "wpe_bw",
    "label": "Betriebsweise",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_umschalt",
    "feld": "wpe_umschalt",
    "label": "Umschalttemperatur (Bivalenzpunkt)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_l_q35_0",
    "feld": "wpe_l_q35_0",
    "label": "wpe_l_q35_0",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_q35_1",
    "feld": "wpe_l_q35_1",
    "label": "wpe_l_q35_1",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_q35_2",
    "feld": "wpe_l_q35_2",
    "label": "wpe_l_q35_2",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_q35_3",
    "feld": "wpe_l_q35_3",
    "label": "wpe_l_q35_3",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_q35_4",
    "feld": "wpe_l_q35_4",
    "label": "wpe_l_q35_4",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_c35_0",
    "feld": "wpe_l_c35_0",
    "label": "wpe_l_c35_0",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_c35_1",
    "feld": "wpe_l_c35_1",
    "label": "wpe_l_c35_1",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_c35_2",
    "feld": "wpe_l_c35_2",
    "label": "wpe_l_c35_2",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_c35_3",
    "feld": "wpe_l_c35_3",
    "label": "wpe_l_c35_3",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_c35_4",
    "feld": "wpe_l_c35_4",
    "label": "wpe_l_c35_4",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_q55_0",
    "feld": "wpe_l_q55_0",
    "label": "wpe_l_q55_0",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_q55_1",
    "feld": "wpe_l_q55_1",
    "label": "wpe_l_q55_1",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_q55_2",
    "feld": "wpe_l_q55_2",
    "label": "wpe_l_q55_2",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_c55_0",
    "feld": "wpe_l_c55_0",
    "label": "wpe_l_c55_0",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_c55_1",
    "feld": "wpe_l_c55_1",
    "label": "wpe_l_c55_1",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_l_c55_2",
    "feld": "wpe_l_c55_2",
    "label": "wpe_l_c55_2",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_waermepumpe__<objektId>",
    "unsicher": true
   },
   {
    "id": "waermepumpe.wpe_qb035",
    "feld": "wpe_qb035",
    "label": "Heizleistung B0/W35",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_cb035",
    "feld": "wpe_cb035",
    "label": "COP B0/W35",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_qb055",
    "feld": "wpe_qb055",
    "label": "Heizleistung B0/W55",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_cb055",
    "feld": "wpe_cb055",
    "label": "COP B0/W55",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_pumpe",
    "feld": "wpe_pumpe",
    "label": "Elektrische Leistungsaufnahme Sole-/Förderpumpe",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "W",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_anz",
    "feld": "wpe_anz",
    "label": "Anzahl Erdsonden",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "—",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_laenge",
    "feld": "wpe_laenge",
    "label": "Sondenlänge (pro Sonde)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_quelltemp",
    "feld": "wpe_quelltemp",
    "label": "Auslegungs-Sondentemperatur (optional, aus externer Berechnung)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_ti",
    "feld": "wpe_ti",
    "label": "Raumtemperatur Soll [Ti]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_tvl",
    "feld": "wpe_tvl",
    "label": "Vorlauftemperatur bei Ta = −8 °C",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_trl",
    "feld": "wpe_trl",
    "label": "Rücklauftemperatur bei Ta = −8 °C",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_speicher",
    "feld": "wpe_speicher",
    "label": "Speicherladung Heizung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_dtsp",
    "feld": "wpe_dtsp",
    "label": "Temperaturdifferenz Speicher−Vorlauf",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "K",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_ladung",
    "feld": "wpe_ladung",
    "label": "Speicherladung elektrisch (Notheizung)",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_tww",
    "feld": "wpe_tww",
    "label": "Warmwassertemperatur (WP)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_twwz",
    "feld": "wpe_twwz",
    "label": "Warmwassertemperatur Zusatzheizung (optional)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_wwz",
    "feld": "wpe_wwz",
    "label": "WW-Zusatzheizung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_wwvert",
    "feld": "wpe_wwvert",
    "label": "Warmhalteband / WW-Verteilung",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_heizband",
    "feld": "wpe_heizband",
    "label": "Länge Begleitheizband",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_solar",
    "feld": "wpe_solar",
    "label": "Solaranlage",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_solfl",
    "feld": "wpe_solfl",
    "label": "Absorberfläche",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_solaz",
    "feld": "wpe_solaz",
    "label": "0° = Süd · −90° = Ost · +90° = West",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_solne",
    "feld": "wpe_solne",
    "label": "Kollektorneigung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_solert",
    "feld": "wpe_solert",
    "label": "nur externe Berechnung — sonst MINERGIE-Vorschlagswert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kWh/m²a",
    "quelle": "gema_waermepumpe__<objektId>"
   },
   {
    "id": "waermepumpe.wpe_out_leistung",
    "feld": "wpe_out_leistung",
    "label": "Heizleistungsbedarf ohne WW bei Ta,min Qtot·(20−Ta,min)/ΣΔT·h",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_qww",
    "feld": "wpe_out_qww",
    "label": "Warmwasserbedarf Qww (inkl. Verluste)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_klima",
    "feld": "wpe_out_klima",
    "label": "Klimastation: Ta,min / Ta,mittel / HGT",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_tq",
    "feld": "wpe_out_tq",
    "label": "Wirksame Quellentemperatur Heizung / Warmwasser",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_deckww",
    "feld": "wpe_out_deckww",
    "label": "Solarer Deckungsgrad Warmwasser",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_deckh",
    "feld": "wpe_out_deckh",
    "label": "Solarer Deckungsgrad Heizung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_solert",
    "feld": "wpe_out_solert",
    "label": "Rechenwert Nettoertrag",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_winkel",
    "feld": "wpe_out_winkel",
    "label": "Winkelkorrektur Kollektorfläche",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_ewph",
    "feld": "wpe_out_ewph",
    "label": "Anteil Wärmepumpe an der Heizung eWP",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_ungedeckt",
    "feld": "wpe_out_ungedeckt",
    "label": "Ungedeckter Wärmebedarf Heizung / el. Zusatz eEL",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_ewpww",
    "feld": "wpe_out_ewpww",
    "label": "Anteil Wärmepumpe am Warmwasser",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_etah",
    "feld": "wpe_out_etah",
    "label": "Verluste Heizbetrieb ηh = 1 − Verluste",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_etaw",
    "feld": "wpe_out_etaw",
    "label": "Verluste WW-Betrieb ηw",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_wh",
    "feld": "wpe_out_wh",
    "label": "Gewichtung Heizung / Warmwasser wh / www",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_ebedh",
    "feld": "wpe_out_ebedh",
    "label": "Heizwärmebedarf (inkl. Verteilung)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_ebedww",
    "feld": "wpe_out_ebedww",
    "label": "Warmwasserbedarf (inkl. Verteilung)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_ebedtot",
    "feld": "wpe_out_ebedtot",
    "label": "Nutzwärmebedarf total",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_strom",
    "feld": "wpe_out_strom",
    "label": "Strombedarf Wärmepumpe Bedarf·e/JAZ",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_zush",
    "feld": "wpe_out_zush",
    "label": "Energie Zusatzheizung Heizung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "waermepumpe.wpe_out_zusww",
    "feld": "wpe_out_zusww",
    "label": "Energie Zusatzheizung Warmwasser",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "warmwasser_sia385": {
  "key": "warmwasser_sia385",
  "datei": "sb_warmwasser",
  "label": "Warmwasser SIA 385",
  "kategorie": "Sanitär",
  "autosave": "warmwasser_sia385",
  "werte": [
   {
    "id": "warmwasser_sia385.ww_bueroFlaeche",
    "feld": "ww_bueroFlaeche",
    "label": "Bürofläche [A]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_bueroM2P",
    "feld": "ww_bueroM2P",
    "label": "üblich 15–20 m² pro Person",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m²/P",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_tKw",
    "feld": "ww_tKw",
    "label": "Kaltwasser-Temperatur [θKW]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_tWw",
    "feld": "ww_tWw",
    "label": "WW-Vorlauftemperatur [θWW]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_stutzen",
    "feld": "ww_stutzen",
    "label": "Schätzung Speichervolumen [VW,sto]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_lKonv",
    "feld": "ww_lKonv",
    "label": "Länge Zirkulation konventionellVor- und Rücklauf [lWWV+R,i]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_lRar",
    "feld": "ww_lRar",
    "label": "Länge Zirkulation Rohr-an-Rohr/Rohr-in-Rohrnur Vorlauf [lWWV,i]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_lWhb",
    "feld": "ww_lWhb",
    "label": "Länge Warmhaltebandnur Vorlauf",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_cop",
    "feld": "ww_cop",
    "label": "Wärmepumpe für Zirkulationsverluste · 0 = keine WP",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_ausstossAktiv",
    "feld": "ww_ausstossAktiv",
    "label": "Hilfsenergie Wärmepumpe",
    "art": "eingabe",
    "typ": "ja_nein",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_ausstossTyp",
    "feld": "ww_ausstossTyp",
    "label": "Ausstossleitungen",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_heizKat",
    "feld": "ww_heizKat",
    "label": "erweiterte Abschätzung der Heizlast",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_heizStd",
    "feld": "ww_heizStd",
    "label": "Bauperiode / Standard",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_heizFrei",
    "feld": "ww_heizFrei",
    "label": "überschreibt die Abschätzung · 0 = Abschätzung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_verlustfaktor",
    "feld": "ww_verlustfaktor",
    "label": "1.5 gem. SIA 385/2:2025 (oder 1+ϛIS/100 aus Grobauslegung)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_ladezyklen",
    "feld": "ww_ladezyklen",
    "label": "1 Ladezyklus ≈ 2–3 h (Bodenheizung) / 1–2 h (Radiatoren)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_fsto",
    "feld": "ww_fsto",
    "label": "Bauart unten wählen — die Auswahl setzt den Wert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_stutzenF",
    "feld": "ww_stutzenF",
    "label": "Speichervolumen [VW,sto]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_tWwL",
    "feld": "ww_tWwL",
    "label": "ww_tWwL",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_tRaum",
    "feld": "ww_tRaum",
    "label": "ww_tRaum",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_tWwRar",
    "feld": "ww_tWwRar",
    "label": "ww_tWwRar",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_tRaumRar",
    "feld": "ww_tRaumRar",
    "label": "ww_tRaumRar",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_tWwWhb",
    "feld": "ww_tWwWhb",
    "label": "ww_tWwWhb",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_tRaumWhb",
    "feld": "ww_tRaumWhb",
    "label": "ww_tRaumWhb",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_lVL",
    "feld": "ww_lVL",
    "label": "ww_lVL",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_matVL",
    "feld": "ww_matVL",
    "label": "ww_matVL",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_oeVL",
    "feld": "ww_oeVL",
    "label": "ww_oeVL",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_lRL",
    "feld": "ww_lRL",
    "label": "ww_lRL",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_matRL",
    "feld": "ww_matRL",
    "label": "ww_matRL",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_oeRL",
    "feld": "ww_oeRL",
    "label": "ww_oeRL",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_lRarF",
    "feld": "ww_lRarF",
    "label": "ww_lRarF",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_matRar",
    "feld": "ww_matRar",
    "label": "ww_matRar",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_matRarRL",
    "feld": "ww_matRarRL",
    "label": "ww_matRarRL",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_oeRarVL",
    "feld": "ww_oeRarVL",
    "label": "ww_oeRarVL",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_oeRarRL",
    "feld": "ww_oeRarRL",
    "label": "ww_oeRarRL",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_lWhbF",
    "feld": "ww_lWhbF",
    "label": "ww_lWhbF",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_matWhb",
    "feld": "ww_matWhb",
    "label": "ww_matWhb",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_oeWhb",
    "feld": "ww_oeWhb",
    "label": "ww_oeWhb",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_whbBand",
    "feld": "ww_whbBand",
    "label": "Stärke des Warmhaltebands — wird auf den Rohr-ø addiert",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_zeitWohn",
    "feld": "ww_zeitWohn",
    "label": "ww_zeitWohn",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_leistung",
    "feld": "ww_leistung",
    "label": "Angabe Heizungsplaner",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_ladungen",
    "feld": "ww_ladungen",
    "label": "Anzahl Ladungen pro Tag",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "–",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_ctrlEff",
    "feld": "ww_ctrlEff",
    "label": "aus Speicheroptimierung · 0 = errechneter Wert",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_soLadezeit",
    "feld": "ww_soLadezeit",
    "label": "bestimmt die Menge WW pro Ladung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "h",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.wwsl_profil",
    "feld": "wwsl_profil",
    "label": "Tagesgang nach VSSH Handbuch 5 (Blatt 2.2.8–2.2.13)",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.wwsl_quelle",
    "feld": "wwsl_quelle",
    "label": "100 % des Diagramms",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.wwsl_bedarf",
    "feld": "wwsl_bedarf",
    "label": "nur bei Quelle «Manuell»",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l/d",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.wwsl_modus",
    "feld": "wwsl_modus",
    "label": "bestimmt die dargestellten Punkte & Bereiche",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.wwsl_leistung",
    "feld": "wwsl_leistung",
    "label": "0 = gewählte Wärmeerzeugerleistung aus Tab ④",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "kW",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.wwsl_dt",
    "feld": "wwsl_dt",
    "label": "Kaltwasser 10 °C → Speicher 60 °C",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "K",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.wwsl_speicher",
    "feld": "wwsl_speicher",
    "label": "0 = erforderliches Minimum aus dem Diagramm",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "l",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.wwsl_f1a",
    "feld": "wwsl_f1a",
    "label": "wwsl_f1a",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.wwsl_f1von",
    "feld": "wwsl_f1von",
    "label": "wwsl_f1von",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.wwsl_f1bis",
    "feld": "wwsl_f1bis",
    "label": "wwsl_f1bis",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.wwsl_f2a",
    "feld": "wwsl_f2a",
    "label": "wwsl_f2a",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.wwsl_f2von",
    "feld": "wwsl_f2von",
    "label": "wwsl_f2von",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.wwsl_f2bis",
    "feld": "wwsl_f2bis",
    "label": "wwsl_f2bis",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.wwsl_f3a",
    "feld": "wwsl_f3a",
    "label": "wwsl_f3a",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.wwsl_f3von",
    "feld": "wwsl_f3von",
    "label": "wwsl_f3von",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.wwsl_f3bis",
    "feld": "wwsl_f3bis",
    "label": "wwsl_f3bis",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_wrgAnzahl",
    "feld": "ww_wrgAnzahl",
    "label": "Anzahl Duschen",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "Stk",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_wrgStd",
    "feld": "ww_wrgStd",
    "label": "Normliter pro Duschvorgang [VW,u,sho,i]",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_wrgEta",
    "feld": "ww_wrgEta",
    "label": "Energetischer Wirkungsgrad Wärmeübertrager [ηhr]",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_warmwasser_sia385__<objektId>"
   },
   {
    "id": "warmwasser_sia385.ww_rows",
    "feld": "ww_rows",
    "label": "ww_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_warmwasser_sia385__<objektId>",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_bueroPers",
    "feld": "ww_out_bueroPers",
    "label": "Personen Büro",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_grobTotal2",
    "feld": "ww_out_grobTotal2",
    "label": "Total Nutzwarmwasserbedarf [V'W,u]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_dtgen",
    "feld": "ww_out_dtgen",
    "label": "Temperaturerhöhung [∆θgen]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qw",
    "feld": "ww_out_qw",
    "label": "Total Nutzwarmwasserbedarf [Q'W]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_einheiten",
    "feld": "ww_out_einheiten",
    "label": "Ww einheiten",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_vzBedarf",
    "feld": "ww_out_vzBedarf",
    "label": "Nutzwarmwasserbedarf (aus ①) [V'W,u]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_vwstoAnnahme",
    "feld": "ww_out_vwstoAnnahme",
    "label": "Schätzung Speichervolumen [VW,sto]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qStutzen",
    "feld": "ww_out_qStutzen",
    "label": "Stutzenverluste",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qsto",
    "feld": "ww_out_qsto",
    "label": "Speicherverluste [Q'W,sto,Is]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qKonv",
    "feld": "ww_out_qKonv",
    "label": "Ww q Konv",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_qRar",
    "feld": "ww_out_qRar",
    "label": "Ww q Rar",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_qWhb",
    "feld": "ww_out_qWhb",
    "label": "Ww q Whb",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_qleit",
    "feld": "ww_out_qleit",
    "label": "Totaler Leitungsverlust [Q'W,hl,Is]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_pumpe",
    "feld": "ww_out_pumpe",
    "label": "L = Länge Zirkulation (konventionell + RaR)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_pumpeGrenz",
    "feld": "ww_out_pumpeGrenz",
    "label": "Grenzwert Umwälzpumpe",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_eauxWhb",
    "feld": "ww_out_eauxWhb",
    "label": "Hilfsenergie Warmhalteband",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_eauxWp",
    "feld": "ww_out_eauxWp",
    "label": "Hilfsenergie Wärmepumpe",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qem",
    "feld": "ww_out_qem",
    "label": "Ausstosswärmeverluste [Q'W,em,Is]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_vz",
    "feld": "ww_out_vz",
    "label": "Verlustzahl [ϛIS]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_vzStatus",
    "feld": "ww_out_vzStatus",
    "label": "Grenzwert (50 %)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_feinTotal",
    "feld": "ww_out_feinTotal",
    "label": "Ww fein Total",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_feinKwh",
    "feld": "ww_out_feinKwh",
    "label": "Ww fein Kwh",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_spitze",
    "feld": "ww_out_spitze",
    "label": "Ww spitze",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_heizWspez",
    "feld": "ww_out_heizWspez",
    "label": "Spezifische Heizlast aus Liste",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_heizWohn",
    "feld": "ww_out_heizWohn",
    "label": "Heizlast aus Liste Abschätzung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_heizlast",
    "feld": "ww_out_heizlast",
    "label": "Massgebende Heizlast",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_feinTotal3",
    "feld": "ww_out_feinTotal3",
    "label": "Nutzwarmwasserbedarf Feinplanung [V'W,u]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_vwd1",
    "feld": "ww_out_vwd1",
    "label": "Wärmebedarf WW-Versorgung [V'W,d]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_pk3",
    "feld": "ww_out_pk3",
    "label": "aus den Stundenspitzen (3.1)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_ctrl1",
    "feld": "ww_out_ctrl1",
    "label": "Steuervolumen [VW,sto,ctrl]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_cont1",
    "feld": "ww_out_cont1",
    "label": "Bereitschaftsvolumen [VW,sto,cont]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_vsto1",
    "feld": "ww_out_vsto1",
    "label": "Speichervolumen [VW,sto]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qStoGrund",
    "feld": "ww_out_qStoGrund",
    "label": "Grundverlust Speicher",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qStoStutzen",
    "feld": "ww_out_qStoStutzen",
    "label": "Stutzenverluste",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qStoF",
    "feld": "ww_out_qStoF",
    "label": "Speicherwärmeverluste [Q'W,sto,Is]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_dtLeitung",
    "feld": "ww_out_dtLeitung",
    "label": "Ww dt Leitung",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_dtRar",
    "feld": "ww_out_dtRar",
    "label": "Ww dt Rar",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_dtWhb",
    "feld": "ww_out_dtWhb",
    "label": "Ww dt Whb",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_qVL",
    "feld": "ww_out_qVL",
    "label": "Ww q VL",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_qRL",
    "feld": "ww_out_qRL",
    "label": "Ww q RL",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_rarInfo",
    "feld": "ww_out_rarInfo",
    "label": "Ww rar Info",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_qRarF",
    "feld": "ww_out_qRarF",
    "label": "Ww q Rar F",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_whbInfo",
    "feld": "ww_out_whbInfo",
    "label": "Ww whb Info",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_qWhbF",
    "feld": "ww_out_qWhbF",
    "label": "Ww q Whb F",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_qhl",
    "feld": "ww_out_qhl",
    "label": "Ww qhl",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "warmwasser_sia385.ww_out_qemF",
    "feld": "ww_out_qemF",
    "label": "Totaler Ausstosswärmeverlust [QW,em,Is]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qgenF3",
    "feld": "ww_out_qgenF3",
    "label": "Wärmebedarf WW-Versorgung [QW,gen,out]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_vzFein3",
    "feld": "ww_out_vzFein3",
    "label": "QW,gen,out ÷ Nutzwärmebedarf · 100 % = Bedarf ohne Verluste",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_qgen",
    "feld": "ww_out_qgen",
    "label": "Wärmebedarf WW-Versorgung [QW,gen,out]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_pk",
    "feld": "ww_out_pk",
    "label": "Spitzendeckungsvolumen [VW,sto,pk]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_ladezeit",
    "feld": "ww_out_ladezeit",
    "label": "Ladezeit bei Vorrangschaltung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_ladezeitTotal",
    "feld": "ww_out_ladezeitTotal",
    "label": "Totale Ladezeit pro Tag Ladezeit · Ladungen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_ctrl",
    "feld": "ww_out_ctrl",
    "label": "Errechnetes Steuervolumen [VW,sto,ctrl,1]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_cont",
    "feld": "ww_out_cont",
    "label": "Bereitschaftsvolumen [VW,sto,cont,1]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_vsto",
    "feld": "ww_out_vsto",
    "label": "Errechnetes Speichervolumen [VW,sto,1]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_ctrlEff",
    "feld": "ww_out_ctrlEff",
    "label": "Effektives Steuervolumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_vstoEff",
    "feld": "ww_out_vstoEff",
    "label": "Effektives Speichervolumen [VW,sto,2]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_leistung2",
    "feld": "ww_out_leistung2",
    "label": "Leistung Wärmeerzeugung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_umsatz",
    "feld": "ww_out_umsatz",
    "label": "Umsatz Speicherinhalt pro Tag",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_soMenge",
    "feld": "ww_out_soMenge",
    "label": "Menge WW pro Ladung P·t·3600 ÷ (4.187·50)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_soProdH",
    "feld": "ww_out_soProdH",
    "label": "gedeckelt aufs effektive Steuervolumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_soStart",
    "feld": "ww_out_soStart",
    "label": "Spitzendeckung + effektives Steuervolumen",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_soMin",
    "feld": "ww_out_soMin",
    "label": "Minimaler Speicherinhalt",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_soOpt",
    "feld": "ww_out_soOpt",
    "label": "Optimierung min. Inhalt − Spitzendeckung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_soStatus",
    "feld": "ww_out_soStatus",
    "label": "Beurteilung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.wwsl_out_bedarf",
    "feld": "wwsl_out_bedarf",
    "label": "Tagesbedarf (= 100 %)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.wwsl_out_rate",
    "feld": "wwsl_out_rate",
    "label": "Ladeleistung V̇ = P·3600/(4.187·∆θ)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.wwsl_out_kap",
    "feld": "wwsl_out_kap",
    "label": "Ladekapazität pro Tag",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.wwsl_out_pmin",
    "feld": "wwsl_out_pmin",
    "label": "Mindest-Ladeleistung 100 % ÷ Ladezeit",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.wwsl_out_speicher",
    "feld": "wwsl_out_speicher",
    "label": "grösster Bedarfsüberschuss im Diagramm",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.wwsl_out_krit",
    "feld": "wwsl_out_krit",
    "label": "Kritische Entladung",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.wwsl_out_spitze",
    "feld": "wwsl_out_spitze",
    "label": "Spitzenstunde (Spitzendeckungsvolumen)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.wwsl_out_sia",
    "feld": "wwsl_out_sia",
    "label": "Eff. Speichervolumen SIA (Tab ④)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.wwsl_out_sperr",
    "feld": "wwsl_out_sperr",
    "label": "Eff. Speichervolumen SIA (Tab ④)",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_wrgNl",
    "feld": "ww_out_wrgNl",
    "label": "Pro Duschvorgang kWh = Normliter · 0.058",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_wrgTot",
    "feld": "ww_out_wrgTot",
    "label": "Total Wärmebedarf Duschvorgänge (ohne WRG) [QW,u,sho,i]",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_wrgRedE",
    "feld": "ww_out_wrgRedE",
    "label": "Reduktion pro Duschvorgang ηhr · kWh ÷ 100",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "warmwasser_sia385.ww_out_wrgRed",
    "feld": "ww_out_wrgRed",
    "label": "Reduktion des Wärmebedarfs [fWhr,PWC]",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 },
 "zirkulation": {
  "key": "zirkulation",
  "datei": "sb_zirkulation",
  "label": "Zirkulationsberechnung Warmwasser",
  "kategorie": "Sanitär",
  "autosave": "zirkulation",
  "werte": [
   {
    "id": "zirkulation.zk_fabrikat",
    "feld": "zk_fabrikat",
    "label": "bestimmt Werkstoff + wählbare ø je Teilstrecke",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_fabrikat2",
    "feld": "zk_fabrikat2",
    "label": "optional — Werkstoff dann je Teilstrecke wählbar",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_tww",
    "feld": "zk_tww",
    "label": "Warmwasser-Temperatur TWW",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "°C",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_dtzul",
    "feld": "zk_dtzul",
    "label": "im gesamten Netz (typ. 3 K)",
    "art": "eingabe",
    "typ": "auswahl",
    "einheit": "K",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_tref",
    "feld": "zk_tref",
    "label": "Referenz Speicher (Rest-ΔT je TS)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_daemm",
    "feld": "zk_daemm",
    "label": "bestimmt λ + Auto-Dämmstärke",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_rows",
    "feld": "zk_rows",
    "label": "zk_rows",
    "art": "eingabe",
    "typ": "zahl",
    "quelle": "gema_zirkulation__<objektId>",
    "unsicher": true
   },
   {
    "id": "zirkulation.zk_z",
    "feld": "zk_z",
    "label": "Zuschlag auf ΣR·l",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "%",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_heff",
    "feld": "zk_heff",
    "label": "gewählte Pumpe — für Drosselventil-Auslegung",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_t_keller",
    "feld": "zk_t_keller",
    "label": "Keller nicht beheizt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_t_raeume",
    "feld": "zk_t_raeume",
    "label": "Raum beheizt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_t_schacht",
    "feld": "zk_t_schacht",
    "label": "Schacht",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_t_esh",
    "feld": "zk_t_esh",
    "label": "ESH kalt",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "°C",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_rvtyp",
    "feld": "zk_rvtyp",
    "label": "Δp = (m/KVS)²/1000 — m aus TS 1, KVS je DN RL der TS 1",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_dprv",
    "feld": "zk_dprv",
    "label": "falls nicht in Pumpe integriert · Empfehlung siehe Ergebnisse",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "mbar",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_regventil",
    "feld": "zk_regventil",
    "label": "thermostatisch: KV folgt T am Ventil — Kennlinie unten",
    "art": "eingabe",
    "typ": "auswahl",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.zk_kvs",
    "feld": "zk_kvs",
    "label": "therm. Regulierorgan je Strang (z.B. 1.3 / 1.6 / 3.2)",
    "art": "eingabe",
    "typ": "zahl",
    "einheit": "m³/h",
    "quelle": "gema_zirkulation__<objektId>"
   },
   {
    "id": "zirkulation.volumenstrom_out",
    "feld": "volumenstrom_out",
    "label": "Volumenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "zirkulation.foerderhoehe_out",
    "feld": "foerderhoehe_out",
    "label": "Foerderhoehe",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "zirkulation.tempRl_out",
    "feld": "tempRl_out",
    "label": "Temp Rl",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "zirkulation.waermeverlust_out",
    "feld": "waermeverlust_out",
    "label": "Waermeverlust",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "zirkulation.zk_out_m",
    "feld": "zk_out_m",
    "label": "Zk m",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "zirkulation.zk_out_m_sub",
    "feld": "zk_out_m_sub",
    "label": "Zk m sub",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "zirkulation.zk_out_h",
    "feld": "zk_out_h",
    "label": "Zk h",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "zirkulation.zk_out_h_sub",
    "feld": "zk_out_h_sub",
    "label": "Zk h sub",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "zirkulation.zk_out_trl",
    "feld": "zk_out_trl",
    "label": "Zk trl",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "zirkulation.zk_out_q",
    "feld": "zk_out_q",
    "label": "Zk q",
    "art": "ergebnis",
    "typ": "zahl",
    "unsicher": true
   },
   {
    "id": "zirkulation.zk_out_strang",
    "feld": "zk_out_strang",
    "label": "Massgebender Strang Strang mit max. Δp",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "zirkulation.zk_out_flow2",
    "feld": "zk_out_flow2",
    "label": "Volumenstrom",
    "art": "ergebnis",
    "typ": "zahl"
   },
   {
    "id": "zirkulation.zk_out_rv",
    "feld": "zk_out_rv",
    "label": "Rückflussverhinderer-Empfehlung KVS-Tabelle je DN RL der 1. TS",
    "art": "ergebnis",
    "typ": "zahl"
   }
  ]
 }
};

  var _index = null;
  function index() {
    if (_index) return _index;
    _index = {};
    Object.keys(MODULE).forEach(function (mk) {
      MODULE[mk].werte.forEach(function (v) {
        _index[v.id] = { modul: mk, modulLabel: MODULE[mk].label, wert: v };
      });
    });
    return _index;
  }

  w.GemaWerteKatalog = {
    module: MODULE,
    /* Alle Werte eines Moduls */
    werte: function (modulKey) { return (MODULE[modulKey] || {}).werte || []; },
    /* Einen Wert ueber seine ID aufloesen — liefert auch Modul + Modul-Label */
    byId: function (id) { return index()[id] || null; },
    /* Beschriftung fuer die Anzeige: «Modul · Wert (Einheit)» */
    label: function (id) {
      var t = index()[id];
      if (!t) return id;
      return t.modulLabel + ' · ' + t.wert.label + (t.wert.einheit ? ' [' + t.wert.einheit + ']' : '');
    },
    /* Volltextsuche ueber alle Module — fuer die Quellen-Auswahl */
    suche: function (q, opts) {
      opts = opts || {};
      var s = String(q || '').toLowerCase().trim();
      var treffer = [];
      Object.keys(MODULE).forEach(function (mk) {
        if (opts.modul && mk !== opts.modul) return;
        MODULE[mk].werte.forEach(function (v) {
          if (opts.art && v.art !== opts.art) return;
          if (s) {
            var heu = (v.label + ' ' + v.id + ' ' + MODULE[mk].label + ' ' + (v.einheit || '')).toLowerCase();
            if (heu.indexOf(s) < 0) return;
          }
          treffer.push({ modul: mk, modulLabel: MODULE[mk].label, kategorie: MODULE[mk].kategorie, wert: v });
        });
      });
      /* Ergebniswerte zuerst — sie sind der typische Fall einer
         Verknuepfung («Ergebnis der einen Berechnung speist die naechste») */
      treffer.sort(function (a, b) {
        if ((a.wert.art === 'ergebnis') !== (b.wert.art === 'ergebnis')) return a.wert.art === 'ergebnis' ? -1 : 1;
        return a.modulLabel.localeCompare(b.modulLabel) || a.wert.label.localeCompare(b.wert.label);
      });
      return treffer;
    },
    modulListe: function () {
      return Object.keys(MODULE).map(function (k) { return MODULE[k]; })
        .sort(function (a, b) { return a.kategorie.localeCompare(b.kategorie) || a.label.localeCompare(b.label); });
    }
  };
})(typeof window !== 'undefined' ? window : this);
