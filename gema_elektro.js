/* ════════════════════════════════════════════════════════════════════════
   GEMA — Elektro-Fachbasis (geteilte Wahrheit aller el_-Module)
   ════════════════════════════════════════════════════════════════════════
   Muster: gema_rohrsysteme.js. Leitermaterial, Leitfähigkeit, Querschnitts-
   reihe, Netzsysteme und Sicherungs-Nennströme liegen HIER und nicht in den
   einzelnen Berechnungsmodulen — sonst erfindet jedes Modul seine eigene
   κ-Tabelle und die Ergebnisse laufen auseinander.

   KRITISCH — κ ist temperaturabhängig:
   Der oft zitierte Wert 56 bzw. 58 m/(Ω·mm²) gilt bei 20 °C. Im Betrieb
   erwärmt sich der Leiter (PVC-isoliert bis 70 °C, EPR/VPE bis 90 °C) und die
   Leitfähigkeit sinkt um rund 20 %. Ein Spannungsfall, der mit κ₂₀ gerechnet
   wird, ist damit zu optimistisch. `elKappa(matId, tempC)` rechnet das um —
   JEDE Leitungsberechnung soll darüber gehen, nie mit einer festen Zahl.

   KRITISCH — kein stiller Deckel:
   `elNaechsterQuerschnitt` liefert `null`, wenn der Bedarf über der Reihe
   liegt. Das Modul MUSS diesen Fall melden («auch 630 mm² reicht nicht»),
   nie stillschweigend nichts anzeigen.

   Neue Elektro-Fachdaten (Verlegearten, Häufungsfaktoren, Sicherungs-
   kennlinien, …) kommen HIER dazu — mit Quellenangabe im Kommentar.

   window.GemaElektro = {EL_MATERIAL, EL_TEMP_STUFEN, EL_QUERSCHNITTE,
     EL_SYSTEME, EL_SICHERUNGEN, elMaterial, elKappa, elSystem,
     elNaechsterQuerschnitt, elNum, elFmt, elRunden}

   Node-Test: die Datei ist DOM-frei und lässt sich mit einem Mini-`window`
   laden — `new Function('window', src)({})` (Muster scripts/card_test.mjs).
   ════════════════════════════════════════════════════════════════════════ */
(function(){

/* ── Leitermaterial ─────────────────────────────────────────────────────
   kappa20 = spezifische Leitfähigkeit bei 20 °C [m/(Ω·mm²)]
   alpha   = Temperaturkoeffizient [1/K]
   Cu ist bewusst zweimal vertreten: 56 ist der Rechenwert für Leiter
   (IEC 60228, in der NIN-Praxis üblich), 58 der Literaturwert für reines
   Kupfer — viele veröffentlichte Rechner nutzen ihn. Wer eine bestehende
   Berechnung nachvollziehen will, braucht beide. */
var EL_MATERIAL = [
  {id:'cu',   name:'Kupfer',        kurz:'Cu',  kappa20:56, alpha:0.00393,
   hinweis:'Rechenwert für Leiter (IEC 60228) — Standard'},
  {id:'cu58', name:'Kupfer (rein)', kurz:'Cu*', kappa20:58, alpha:0.00393,
   hinweis:'Literaturwert reines Kupfer — in vielen Rechnern verwendet'},
  {id:'al',   name:'Aluminium',     kurz:'Al',  kappa20:36, alpha:0.00403,
   hinweis:'Rechenwert für Leiter'}
];

/* Betriebstemperatur-Stufen. Die Isolation bestimmt die Grenztemperatur;
   für den Spannungsfall ist die tatsächliche Leitertemperatur massgebend. */
var EL_TEMP_STUFEN = [
  {t:20, label:'20 °C — kalt / Literaturwert'},
  {t:30, label:'30 °C — schwach belastet'},
  {t:55, label:'55 °C — Teillast'},
  {t:70, label:'70 °C — Betriebstemperatur PVC'},
  {t:90, label:'90 °C — Betriebstemperatur EPR/VPE'}
];

/* Genormte Querschnittsreihe [mm²] (IEC 60228). */
var EL_QUERSCHNITTE = [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240,300,400,500,630];

/* ── Netzsysteme ────────────────────────────────────────────────────────
   fU = Faktor im Spannungsfall  ΔU = fU · I · L / (κ · A)
   fP = Faktor in der Verlustleistung  P = fP · I² · L / (κ · A)
   Einphasig zählt Hin- UND Rückleiter (2), dreiphasig sind es drei
   stromführende Leiter (3) bei symmetrischer Last; der Spannungsfall
   bezieht sich dort auf die Aussenleiterspannung (√3).
   HINWEIS: rein ohmsche Betrachtung (cos φ = 1, Reaktanz vernachlässigt) —
   ab ca. 50 mm² und langen Leitungen liegt der reale Spannungsfall höher. */
var EL_SYSTEME = [
  {id:'1p230', label:'Einphasig 230 V (L + N)',  u:230, fU:2,             fP:2, leiter:2},
  {id:'3p400', label:'Dreiphasig 400 V (L1–L3)', u:400, fU:Math.sqrt(3),  fP:3, leiter:3}
];

/* Nennströme Überstrom-Schutzeinrichtungen [A] (IEC 60269 / 60898-Reihe). */
var EL_SICHERUNGEN = [6,10,13,16,20,25,32,40,50,63,80,100,125,160,200,250,315,400];

/* ── Zugriff ────────────────────────────────────────────────────────── */
function elMaterial(id){
  for(var i=0;i<EL_MATERIAL.length;i++){ if(EL_MATERIAL[i].id===id) return EL_MATERIAL[i]; }
  return EL_MATERIAL[0];
}
function elSystem(id){
  for(var i=0;i<EL_SYSTEME.length;i++){ if(EL_SYSTEME[i].id===id) return EL_SYSTEME[i]; }
  return EL_SYSTEME[1];
}

/** Leitfähigkeit bei Betriebstemperatur: κ(t) = κ₂₀ / (1 + α·(t − 20)).
 *  Beispiel Cu bei 70 °C: 56 / (1 + 0.00393·50) = 46.8 m/(Ω·mm²). */
function elKappa(matId, tempC){
  var m = elMaterial(matId);
  var t = (tempC===undefined||tempC===null||isNaN(tempC)) ? 20 : Number(tempC);
  var k = m.kappa20 / (1 + m.alpha * (t - 20));
  return k > 0 ? k : m.kappa20;
}

/** Nächstgrösserer genormter Querschnitt — null, wenn die Reihe nicht reicht.
 *  Der Aufrufer MUSS null behandeln (kein stiller Deckel). */
function elNaechsterQuerschnitt(a){
  var v = Number(a);
  if(!isFinite(v) || v <= 0) return null;
  for(var i=0;i<EL_QUERSCHNITTE.length;i++){ if(EL_QUERSCHNITTE[i] >= v) return EL_QUERSCHNITTE[i]; }
  return null;
}

/** Nächstgrösserer Sicherungs-Nennstrom — null, wenn die Reihe nicht reicht. */
function elNaechsteSicherung(i){
  var v = Number(i);
  if(!isFinite(v) || v <= 0) return null;
  for(var k=0;k<EL_SICHERUNGEN.length;k++){ if(EL_SICHERUNGEN[k] >= v) return EL_SICHERUNGEN[k]; }
  return null;
}

/* ── Schutzleiter & Potenzialausgleich ──────────────────────────────────
   Regeln nach SN EN 60364-5-54 (NIN Kapitel 5.4). Sie werden von mehreren
   Modulen gebraucht (Potenzialausgleich, Kurzschluss/Abschaltbedingung),
   darum liegen sie hier und nicht in einem einzelnen Modul.

   Die Zahlenwerte sind die etablierten Stufen der Norm. Die Norm-ZIFFER wird
   bewusst nicht zitiert — sie ändert zwischen den Ausgaben; das Modul nennt
   die Regel und fordert zur Prüfung der geltenden Ausgabe auf.

   Schutzleiter-Stufen (gleiches Material wie der Aussenleiter):
     S ≤ 16 mm²        → S_PE = S
     16 < S ≤ 35 mm²   → S_PE = 16 mm²
     S > 35 mm²        → S_PE = S / 2                                     */
function elPeQuerschnitt(sAussen){
  var s = Number(sAussen);
  if(!isFinite(s) || s <= 0) return 0;
  if(s <= 16) return s;
  if(s <= 35) return 16;
  return s / 2;
}

/** Materialgleichwertiger Querschnitt: gleicher Leitwert wie `sCu` in Kupfer.
 *  Aluminium braucht rund den Faktor 56/36 ≈ 1.56. */
function elGleichwertigerQuerschnitt(sCu, matZiel){
  var s = Number(sCu);
  if(!isFinite(s) || s <= 0) return 0;
  var cu = elMaterial('cu').kappa20;
  var z  = elMaterial(matZiel).kappa20;
  return s * cu / z;
}

/* Mindest-/Höchstquerschnitte für Potenzialausgleichsleiter [mm² Cu].
   `geschuetzt` = mechanisch geschützt verlegt.
   Der Deckel beim Hauptpotenzialausgleich ist eine Regel-Grenze («in der
   Regel nicht grösser als …») — eine bewusst grössere Ausführung bleibt
   zulässig, das Modul weist die Kappung darum aus statt sie zu verschweigen. */
var EL_PA_MIN = {
  hpa: { min: 6, minBlitzschutz: 10, max: 16 },  // Hauptpotenzialausgleich
  opa: { geschuetzt: 2.5, offen: 4 },            // zusätzlicher Potenzialausgleich
  fe:  { min: 4 }                                // Funktionserdung
};

/* ── Kurzschluss-Fachdaten (angehängt 08/2026, el_kurzschluss) ──────────
   Quellen stehen bei jedem Block — neue Elektro-Fachdaten kommen HIERHIN
   und nicht ins einzelne Modul (Kanon dieser Datei). */

/* Spannungsfaktor c (IEC 60909-0:2016, Tabelle 1, Niederspannung 100–1000 V).
   c_max deckt die obere Spannungstoleranz ab (grösster Kurzschlussstrom →
   Bemessung des Schaltvermögens), c_min die untere (kleinster Strom →
   Nachweis der Abschaltbedingung). Für 230/400 V nach IEC 60038 (±10 %)
   gilt c_max = 1.10; 1.05 ist der Wert für Netze mit +6 % Toleranz. */
var EL_C_FAKTOR = [
  {id:'c110', label:'1.10 / 0.95 — 230/400 V, Toleranz ±10 % (IEC 60038)', cMax:1.10, cMin:0.95},
  {id:'c105', label:'1.05 / 0.95 — Netze mit Toleranz +6 %',               cMax:1.05, cMin:0.95}
];

/* Leitungsschutzschalter, magnetische Auslösung (IEC 60898-1, Tabelle 7).
   `faktor` ist bewusst die OBERE Bandgrenze — nur dort ist die Auslösung
   garantiert. Mit der unteren Grenze zu rechnen wäre für den Nachweis der
   Abschaltbedingung nicht zulässig. Auslösung erfolgt dann < 0.1 s, womit
   sowohl die 0.4-s- als auch die 5-s-Anforderung erfüllt ist. */
/* `faktor` = OBERE Bandgrenze (I5) — nur dort löst das Gerät garantiert aus,
   nur damit ist ein Abschaltnachweis zulässig. `faktorMin` = untere Grenze
   (I4): darunter spricht die magnetische Auslösung sicher NICHT an; dazwischen
   liegt der undefinierte Bereich (Auslösung möglich, nicht garantiert). Beide
   Grenzen zusammen ergeben die Selektivitäts-Staffelung.
   `inf`/`i2` = konventioneller Nicht-Auslöse- bzw. Auslösestrom des
   thermischen Zweigs. Sie hängen an der NORM, nicht am Typ:
   IEC 60898-1 Tab. 6 → 1.13 / 1.45 · In (Hausinstallation),
   IEC 60947-2 → 1.05 / 1.30 · In (Industrieschalter). */
var EL_LS_TYPEN = [
  {id:'B', label:'B — magnetisch 3…5 × In',   faktor:5,  faktorMin:3,
   norm:'IEC 60898-1', inf:1.13, i2:1.45,
   einsatz:'Ohmsche Lasten, Beleuchtung, Steckdosen'},
  {id:'C', label:'C — magnetisch 5…10 × In',  faktor:10, faktorMin:5,
   norm:'IEC 60898-1', inf:1.13, i2:1.45,
   einsatz:'Allgemein, kleine Motoren, Transformatoren'},
  {id:'D', label:'D — magnetisch 10…20 × In', faktor:20, faktorMin:10,
   norm:'IEC 60898-1', inf:1.13, i2:1.45,
   einsatz:'Motoren, grosse Transformatoren, Schweissgeräte'},
  {id:'K', label:'K — magnetisch 8…14 × In',  faktor:14, faktorMin:8,
   norm:'IEC 60947-2', inf:1.05, i2:1.30,
   einsatz:'Industrieschalter, induktive Lasten'},
  {id:'Z', label:'Z — magnetisch 2…3 × In',   faktor:3,  faktorMin:2,
   norm:'herstellerspezifisch', inf:1.05, i2:1.30,
   einsatz:'Halbleiter, empfindliche Elektronik'}
];

/* Zulässige Abschaltzeit im TN-System (SN EN 60364-4-41, Tab. 41.1 für
   120 V < U0 ≤ 230 V → 0.4 s; Ziffer 411.3.2.3 lässt für Verteilstrom-
   kreise und Endstromkreise > 32 A 5 s zu). */
var EL_ABSCHALTZEIT = [
  {id:'t04', label:'0.4 s — Endstromkreis ≤ 32 A', t:0.4},
  {id:'t5',  label:'5 s — Verteilstromkreis / Endstromkreis > 32 A', t:5}
];

function elCFaktor(id){
  for(var i=0;i<EL_C_FAKTOR.length;i++){ if(EL_C_FAKTOR[i].id===id) return EL_C_FAKTOR[i]; }
  return EL_C_FAKTOR[0];
}
function elLsTyp(id){
  for(var i=0;i<EL_LS_TYPEN.length;i++){ if(EL_LS_TYPEN[i].id===id) return EL_LS_TYPEN[i]; }
  return null;
}
function elAbschaltzeit(id){
  for(var i=0;i<EL_ABSCHALTZEIT.length;i++){ if(EL_ABSCHALTZEIT[i].id===id) return EL_ABSCHALTZEIT[i]; }
  return EL_ABSCHALTZEIT[0];
}

/* ── Zahlen ─────────────────────────────────────────────────────────────
   elNum: Eingabetext → Zahl. Komma als Dezimaltrennzeichen und Tausender-
   Apostrophe sind in der Schweiz üblich und dürfen die Rechnung nie
   zerschiessen (Muster sgNum/rlNum in den Sanitärmodulen). */
function elNum(v){
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  if(v===undefined||v===null) return 0;
  var s = String(v).trim().replace(/['’\s]/g,'').replace(',','.');
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/** Anzeige-Format: 2 Nachkommastellen, Tausender mit Apostroph (GEMA-Kanon). */
function elFmt(v, dez){
  var n = Number(v);
  if(!isFinite(n)) return '—';
  var d = (dez===undefined||dez===null) ? 2 : dez;
  var s = Math.abs(n).toFixed(d);
  var teile = s.split('.');
  teile[0] = teile[0].replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  return (n<0?'−':'') + teile.join('.');
}

/** Kaufmännisch auf `dez` Stellen runden (ohne Float-Artefakte). */
function elRunden(v, dez){
  var f = Math.pow(10, (dez===undefined?2:dez));
  return Math.round((Number(v)+Number.EPSILON)*f)/f;
}

window.GemaElektro = {
  EL_MATERIAL:EL_MATERIAL, EL_TEMP_STUFEN:EL_TEMP_STUFEN,
  EL_QUERSCHNITTE:EL_QUERSCHNITTE, EL_SYSTEME:EL_SYSTEME,
  EL_SICHERUNGEN:EL_SICHERUNGEN,
  EL_PA_MIN:EL_PA_MIN,
  EL_C_FAKTOR:EL_C_FAKTOR, EL_LS_TYPEN:EL_LS_TYPEN, EL_ABSCHALTZEIT:EL_ABSCHALTZEIT,
  elCFaktor:elCFaktor, elLsTyp:elLsTyp, elAbschaltzeit:elAbschaltzeit,
  elMaterial:elMaterial, elSystem:elSystem, elKappa:elKappa,
  elNaechsterQuerschnitt:elNaechsterQuerschnitt,
  elNaechsteSicherung:elNaechsteSicherung,
  elPeQuerschnitt:elPeQuerschnitt,
  elGleichwertigerQuerschnitt:elGleichwertigerQuerschnitt,
  elNum:elNum, elFmt:elFmt, elRunden:elRunden
};
})();

/* ════════════════════════════════════════════════════════════════════════
   ANHANG — Strombelastbarkeit (el_belastbarkeit)
   ════════════════════════════════════════════════════════════════════════
   Bewusst als EIGENER Block hinter der Basis-IIFE: er ERGÄNZT
   window.GemaElektro und ändert keine bestehende Zeile. So können mehrere
   el_-Module ihre Fachdaten parallel anhängen, ohne sich zu behindern.

   Quelle: NIN 2025 (SN 411000:2025) / SN EN 60364-5-52, Kupferleiter,
   Referenzbedingungen 30 °C Luft bzw. 20 °C Erdreich.

   ── DATEN-EHRLICHKEIT (KRITISCH) ──────────────────────────────────────
   Jede Iz-Tabelle trägt ihre Herkunft mit: `quelle:'norm'` = belegter
   Tabellenwert, `quelle:'naeherung'` = aus dem 70-°C-Satz mit dem
   XLPE/PVC-Verhältnis hochgerechnet. Das Modul MUSS eine Näherung als
   solche ausweisen — eine hochgerechnete Zahl darf nie wie ein Normwert
   aussehen. Fehlende Werte bleiben `null` und werden gemeldet, nie
   stillschweigend übersprungen (z. B. F/G erst ab 25 mm²).

   ── HÄUFUNG: zwei Quellen, konservativ ────────────────────────────────
   NIN 2025 Tab. 22 Zeile 1 und SN EN 60364-5-52 Tab. B.52.17 Zeile 1
   weichen an einzelnen Stützstellen voneinander ab (n=4: 0.70 ⇄ 0.65,
   n=6: 0.55 ⇄ 0.57, n=20: 0.40 ⇄ 0.38). `elHaeufung` rechnet deshalb mit
   dem KLEINEREN der beiden Werte — ein zu hoher Faktor überschätzt Iz und
   das ist die unsichere Richtung. Beide Ausgangswerte werden mitgeliefert
   und im Modul angezeigt; wer den Wert einer bestimmten Tabellenspalte
   braucht, setzt ihn von Hand.
   ════════════════════════════════════════════════════════════════════════ */
(function(){
var G = window.GemaElektro; if(!G) return;

/* ── Isolation → höchstzulässige Leitertemperatur ─────────────────────── */
var EL_ISOLATION = [
  {id:'pvc',  t:70, name:'PVC — Leiter 70 °C',      kurz:'PVC 70 °C'},
  {id:'xlpe', t:90, name:'EPR/VPE — Leiter 90 °C',  kurz:'XLPE 90 °C'}
];

/* ── Verlegearten ──────────────────────────────────────────────────────
   `idx` = Spaltenindex in den Iz-Tabellen, `erd` steuert die Temperatur-
   und Häufungstabelle (Erdreich statt Luft), `minA` die Gültigkeitsgrenze. */
var EL_VERLEGEARTEN = {
  ein: [
    {id:'A1',    idx:0, erd:false, minA:0,  kurz:'Rohr in gedämmter Wand',
     name:'A1 — Ader in Elektroinstallationsrohr in wärmegedämmter Wand'},
    {id:'B1',    idx:1, erd:false, minA:0,  kurz:'Rohr an Wand / Decke',
     name:'B1 — Ader in Elektroinstallationsrohr auf oder in Wand / Decke'},
    {id:'C',     idx:2, erd:false, minA:0,  kurz:'direkt an Wand / Decke',
     name:'C — Einadriges Kabel direkt auf Wand oder Decke'},
    {id:'D',     idx:3, erd:true,  minA:0,  kurz:'im Erdreich',
     name:'D — Kabel im Erdreich (direkt verlegt oder im Rohr)'},
    {id:'F',     idx:4, erd:false, minA:25, kurz:'Luft, Dreieck',
     name:'F — Einadrige Kabel frei in Luft, Dreiecksanordnung berührend'},
    {id:'F-eben',idx:5, erd:false, minA:25, kurz:'Luft, eben',
     name:'F — Einadrige Kabel frei in Luft, ebene Anordnung berührend'},
    {id:'G-h',   idx:6, erd:false, minA:25, kurz:'Luft, waagrecht m. Abstand',
     name:'G — Einadrige Kabel frei in Luft, waagrecht mit Abstand'},
    {id:'G-v',   idx:7, erd:false, minA:25, kurz:'Luft, senkrecht m. Abstand',
     name:'G — Einadrige Kabel frei in Luft, senkrecht mit Abstand'}
  ],
  meh: [
    {id:'A2', idx:0, erd:false, minA:0, kurz:'Rohr in gedämmter Wand',
     name:'A2 — Kabel in Elektroinstallationsrohr in wärmegedämmter Wand'},
    {id:'B2', idx:1, erd:false, minA:0, kurz:'Rohr an Wand / Decke',
     name:'B2 — Kabel in Elektroinstallationsrohr auf oder in Wand / Decke'},
    {id:'C',  idx:2, erd:false, minA:0, kurz:'direkt an Wand / Decke',
     name:'C — Kabel direkt auf Wand oder Decke'},
    {id:'D',  idx:3, erd:true,  minA:0, kurz:'im Erdreich',
     name:'D — Kabel im Erdreich (direkt verlegt oder im Rohr)'},
    {id:'E',  idx:4, erd:false, minA:0, kurz:'Kabeltasse / frei in Luft',
     name:'E — Mehradriges Kabel auf Kabeltasse oder frei in Luft'}
  ]
};

/* ── Iz-Referenzwerte [A] — Kupfer, 30 °C Luft / 20 °C Erdreich ────────
   Schlüssel: '<bauart>|<belastete Leiter>|<Leitertemperatur>'
   Spalten einadrig : A1 · B1 · C · D · F-Dreieck · F-eben · G-waagr · G-senkr
   Spalten mehradrig: A2 · B2 · C · D · E                                   */
var N = null;
var EL_IZ = {
'ein|3|70':{quelle:'norm',werte:{
  1.5:[13.5,15.5,17.5,18,N,N,N,N], 2.5:[18,21,24,24,N,N,N,N],
  4:[24,28,32,30,N,N,N,N],         6:[31,36,41,38,N,N,N,N],
  10:[42,50,57,50,N,N,N,N],        16:[56,68,76,64,N,N,N,N],
  25:[73,89,96,82,110,114,146,130],35:[89,110,119,98,137,143,181,162],
  50:[108,134,144,116,167,174,219,197], 70:[136,171,184,143,216,225,281,254],
  95:[164,207,223,169,264,275,341,311], 120:[188,239,259,192,308,321,396,362],
  150:[216,262,299,217,356,372,456,419],185:[245,296,341,243,409,427,521,480],
  240:[286,346,403,280,485,507,615,569],300:[328,394,464,316,561,587,709,659],
  400:[N,N,N,N,656,689,852,795], 500:[N,N,N,N,749,789,982,920],
  630:[N,N,N,N,855,905,1140,1070]}},
'meh|3|70':{quelle:'norm',werte:{
  1.5:[13,15,17.5,18,18.5], 2.5:[17.5,20,24,24,25], 4:[23,27,32,30,34],
  6:[29,34,41,38,43],       10:[39,46,57,50,60],    16:[52,62,76,64,80],
  25:[68,80,96,82,101],     35:[83,99,119,98,126],  50:[99,118,144,116,153],
  70:[125,149,184,143,196], 95:[150,179,223,169,238],120:[172,206,259,192,276],
  150:[196,225,299,217,319],185:[223,255,341,243,364],240:[261,297,403,280,430],
  300:[298,339,464,316,497]}},
'ein|3|90':{quelle:'norm',werte:{
  1.5:[17,20,22,21,N,N,N,N], 2.5:[23,28,30,28,N,N,N,N], 4:[31,37,40,36,N,N,N,N],
  6:[40,48,52,44,N,N,N,N],   10:[54,66,71,58,N,N,N,N],  16:[73,88,96,75,N,N,N,N],
  25:[95,117,119,96,135,N,N,N],   35:[117,144,147,115,169,N,N,N],
  50:[141,175,179,135,207,N,N,N], 70:[179,222,229,167,268,N,N,N],
  95:[216,269,278,197,328,N,N,N], 120:[249,312,322,223,383,N,N,N],
  150:[285,342,371,251,444,N,N,N],185:[324,384,424,281,510,N,N,N],
  240:[380,450,500,324,607,N,N,N],300:[435,514,576,365,703,N,N,N]}},
'meh|3|90':{quelle:'norm',werte:{
  1.5:[16.5,19.5,22,21,23], 2.5:[22,26,30,28,32], 4:[30,35,40,36,42],
  6:[38,44,52,44,54],       10:[51,60,71,58,75],  16:[68,80,96,75,100],
  25:[89,105,119,96,127],   35:[109,128,147,115,158], 50:[130,154,179,135,192],
  70:[164,194,229,167,246], 95:[197,233,278,197,298],120:[227,268,322,223,346],
  150:[259,300,371,251,399],185:[295,340,424,281,456],240:[346,398,500,324,538],
  300:[396,455,576,365,621]}},
'ein|2|70':{quelle:'norm',werte:{
  1.5:[14.5,17.5,19.5,18,N,N,N,N], 2.5:[19.5,24,27,24,N,N,N,N],
  4:[26,32,36,30,N,N,N,N],         6:[34,41,46,38,N,N,N,N],
  10:[46,57,63,50,N,N,N,N],        16:[61,76,85,64,N,N,N,N],
  25:[80,96,107,82,125,N,N,N],     35:[99,119,133,98,151,N,N,N],
  50:[119,144,159,116,182,N,N,N],  70:[151,184,202,143,227,N,N,N],
  95:[182,223,246,169,278,N,N,N],  120:[210,259,285,192,322,N,N,N],
  150:[240,299,328,217,371,N,N,N], 185:[271,341,377,243,424,N,N,N],
  240:[315,403,447,280,500,N,N,N], 300:[360,464,515,316,576,N,N,N]}},
'meh|2|70':{quelle:'norm',werte:{
  1.5:[15,17.5,19.5,18,21], 2.5:[20,24,27,24,29], 4:[27,32,36,30,38],
  6:[34,41,46,38,49],       10:[46,57,63,50,68],  16:[61,76,85,64,91],
  25:[80,96,107,82,116],    35:[99,119,133,98,144],50:[118,144,159,116,174],
  70:[149,184,202,143,223], 95:[179,223,246,169,271],120:[206,259,285,192,314],
  150:[225,299,328,217,363],185:[255,341,377,243,415],240:[297,403,447,280,490],
  300:[339,464,515,316,566]}},
/* 2 belastete Leiter bei 90 °C: aus dem 70-°C-Satz mit dem XLPE/PVC-
   Verhältnis der 3-Leiter-Tabellen hochgerechnet — NICHT direkt aus der
   Norm entnommen. Das Modul weist die Werte darum als Näherung aus.
   Bekannte Auffälligkeit: bei 25 mm² liegt B1 (135) über C (134); in den
   belegten Tabellen ist C stets ≥ B1. Vor der Ausführung gegen
   NIN 2025 Tab. 5 bzw. 9 prüfen. */
'ein|2|90':{quelle:'naeherung',werte:{
  1.5:[19,22,25,21,N,N,N,N], 2.5:[26,31,34,28,N,N,N,N], 4:[35,42,45,36,N,N,N,N],
  6:[44,54,58,44,N,N,N,N],   10:[60,75,80,58,N,N,N,N],  16:[80,99,107,75,N,N,N,N],
  25:[105,135,134,96,157,N,N,N],  35:[130,166,165,115,193,N,N,N],
  50:[157,202,200,135,234,N,N,N], 70:[200,255,256,167,302,N,N,N],
  95:[242,310,312,197,370,N,N,N], 120:[280,360,362,223,430,N,N,N],
  150:[320,410,415,251,495,N,N,N],185:[362,468,475,281,563,N,N,N],
  240:[420,550,560,324,663,N,N,N],300:[481,631,644,365,762,N,N,N]}},
'meh|2|90':{quelle:'naeherung',werte:{
  1.5:[19,22,25,21,27], 2.5:[26,31,34,28,37], 4:[35,42,45,36,49],
  6:[44,54,58,44,63],   10:[60,75,80,58,87],  16:[80,99,107,75,115],
  25:[105,126,134,96,148], 35:[130,156,165,115,184], 50:[154,188,200,135,222],
  70:[196,240,256,167,283],95:[236,290,312,197,343],120:[270,335,362,223,397],
  150:[294,388,415,251,459],185:[335,444,475,281,525],240:[392,527,560,324,620],
  300:[451,607,644,365,716]}}
};

/* ── Umrechnungsfaktoren Temperatur ───────────────────────────────────
   Luft: Bezug 30 °C (NIN 2025 Tab. 18) · Erdreich: Bezug 20 °C (Tab. 19). */
var EL_KORR_LUFT = {
  70:{10:1.22,15:1.17,20:1.12,25:1.06,30:1.00,35:0.94,40:0.87,45:0.79,50:0.71,55:0.61,60:0.50},
  90:{10:1.15,15:1.12,20:1.08,25:1.04,30:1.00,35:0.96,40:0.91,45:0.87,50:0.82,55:0.76,60:0.71}
};
var EL_KORR_BODEN = {
  70:{10:1.10,15:1.05,20:1.00,25:0.95,30:0.89,35:0.84,40:0.77,45:0.71,50:0.63,55:0.55,60:0.45},
  90:{10:1.07,15:1.04,20:1.00,25:0.96,30:0.93,35:0.89,40:0.85,45:0.80,50:0.76,55:0.71,60:0.65,65:0.60,70:0.53,75:0.46,80:0.38}
};

/* ── Häufung ───────────────────────────────────────────────────────────
   Stützstellen beider Quellen; Zwischenwerte linear interpoliert.
   Zeile 1 = gebündelt auf einer Fläche, eingebettet oder umschlossen. */
var EL_HAEUF_NIN = {1:1.00,2:0.80,3:0.70,4:0.70,6:0.55,9:0.50,12:0.45,16:0.40,20:0.40};
var EL_HAEUF_IEC = {1:1.00,2:0.80,3:0.70,4:0.65,5:0.60,6:0.57,7:0.54,8:0.52,9:0.50,12:0.45,16:0.41,20:0.38};
/* Erdreich, Rohre berührend (NIN 2025 Tab. 24, Spalte «kein Abstand»).
   Bei DIREKT im Erdreich verlegten, sich berührenden Kabeln liegen die
   Faktoren tiefer — dann den Wert von Hand setzen. */
var EL_HAEUF_ERD = {1:1.00,2:0.80,3:0.70,4:0.65,5:0.60,6:0.60};

/* ── Schutzorgane: Bedingung 2 (I₂ ≤ 1.45·Iz) ─────────────────────────
   I₂ = grosser Prüfstrom des Schutzorgans (NIN 4.3.3 / SN EN 60364-4-43). */
var EL_SCHUTZ = [
  {id:'mcb', k2:1.45, name:'Leitungsschutzschalter (LS)', norm:'SN EN 60898-1',
   hinweis:'I₂ = 1.45·In — Bedingung 2 ist erfüllt, sobald In ≤ Iz gilt.'},
  {id:'gg',  k2:1.60, name:'Schmelzsicherung gG (NH / DII)', norm:'SN EN 60269-1',
   hinweis:'I₂ = 1.6·In — verlangt Iz ≥ 1.104·In, also mehr als Bedingung 1.'},
  {id:'ls',  k2:1.30, name:'Leistungsschalter mit Überlastauslöser', norm:'SN EN 60947-2',
   hinweis:'I₂ = 1.3·In als typischer Wert — Herstellerangabe prüfen.'}
];

/* ── Zugriff ─────────────────────────────────────────────────────────── */
function elIsolation(id){
  for(var i=0;i<EL_ISOLATION.length;i++){ if(EL_ISOLATION[i].id===id) return EL_ISOLATION[i]; }
  return EL_ISOLATION[0];
}
function elVerlegearten(bauart){ return EL_VERLEGEARTEN[bauart==='ein'?'ein':'meh']; }
function elVerlegeart(bauart, id){
  var l = elVerlegearten(bauart);
  for(var i=0;i<l.length;i++){ if(l[i].id===id) return l[i]; }
  return l[0];
}
function elSchutz(id){
  for(var i=0;i<EL_SCHUTZ.length;i++){ if(EL_SCHUTZ[i].id===id) return EL_SCHUTZ[i]; }
  return EL_SCHUTZ[0];
}
function elIzTabelle(bauart, belastet, tLeiter){
  return EL_IZ[(bauart==='ein'?'ein':'meh')+'|'+(Number(belastet)===2?2:3)+'|'+(Number(tLeiter)===90?90:70)] || null;
}
/** Referenz-Belastbarkeit [A] — null, wenn die Kombination nicht tabelliert ist. */
function elIz(bauart, belastet, tLeiter, verlegeId, A){
  var t = elIzTabelle(bauart, belastet, tLeiter); if(!t) return null;
  var row = t.werte[Number(A)]; if(!row) return null;
  var v = row[elVerlegeart(bauart, verlegeId).idx];
  return (v===null||v===undefined) ? null : v;
}

/** Temperatur-Umrechnungsfaktor.
 *  → {f, lage:'ok'|'unter'|'ueber', min, max}
 *  Unterhalb des Tabellenbereichs wird auf den kleinsten Stützwert geklemmt
 *  (das ist die SICHERE Richtung); oberhalb gibt es KEINEN Wert — dort wäre
 *  jede Extrapolation zu günstig, das Modul muss es melden. */
function elKorrTemp(tLeiter, t, erd){
  var tab = erd ? (Number(tLeiter)===90?EL_KORR_BODEN[90]:EL_KORR_BODEN[70])
                : (Number(tLeiter)===90?EL_KORR_LUFT[90]:EL_KORR_LUFT[70]);
  var keys = Object.keys(tab).map(Number).sort(function(a,b){return a-b;});
  var mn = keys[0], mx = keys[keys.length-1], tv = Number(t);
  if(!isFinite(tv)) return {f:null, lage:'ueber', min:mn, max:mx};
  if(tv <= mn) return {f:tab[mn], lage:(tv<mn?'unter':'ok'), min:mn, max:mx};
  if(tv > mx)  return {f:null, lage:'ueber', min:mn, max:mx};
  for(var i=1;i<keys.length;i++){
    if(keys[i]===tv) return {f:tab[keys[i]], lage:'ok', min:mn, max:mx};
    if(keys[i]>tv){
      var a=keys[i-1], b=keys[i];
      return {f:tab[a]+(tab[b]-tab[a])*(tv-a)/(b-a), lage:'ok', min:mn, max:mx};
    }
  }
  return {f:tab[mx], lage:'ok', min:mn, max:mx};
}

function _anker(tab, n){
  var keys = Object.keys(tab).map(Number).sort(function(a,b){return a-b;});
  var mn=keys[0], mx=keys[keys.length-1];
  if(n<=mn) return tab[mn];
  if(n>=mx) return tab[mx];
  for(var i=1;i<keys.length;i++){
    if(keys[i]===n) return tab[keys[i]];
    if(keys[i]>n){ var a=keys[i-1], b=keys[i]; return tab[a]+(tab[b]-tab[a])*(n-a)/(b-a); }
  }
  return tab[mx];
}

/** Häufungsfaktor für n belastete Stromkreise.
 *  → {f, nin, iec, ueberReihe}  ·  f = min(nin, iec) = konservativ.
 *  Erdreich läuft über die eigene Tabelle (dort gibt es nur EINE Quelle). */
function elHaeufung(n, erd){
  var v = Math.round(Number(n));
  if(!isFinite(v) || v < 1) v = 1;
  if(erd){
    var mxE = 6, fe = _anker(EL_HAEUF_ERD, v);
    return {f:fe, nin:fe, iec:null, ueberReihe:(v>mxE)};
  }
  var nin = _anker(EL_HAEUF_NIN, v), iec = _anker(EL_HAEUF_IEC, v);
  return {f:Math.min(nin, iec), nin:nin, iec:iec, ueberReihe:(v>20)};
}

/** NIN 5.2.3.5 Anm. 1 — Stromkreise, die nachweislich dauernd unter 30 %
 *  ihrer Belastbarkeit führen, dürfen bei der Häufung ausser Acht bleiben.
 *  Es zählt also die Zahl der VERBLEIBENDEN Kreise, mindestens 1. */
function elHaeufungAnzahl(n, nGering){
  var a = Math.round(Number(n)||0), b = Math.round(Number(nGering)||0);
  if(!isFinite(a) || a < 1) a = 1;
  if(!isFinite(b) || b < 0) b = 0;
  return Math.max(1, a - Math.min(a, b));
}

G.EL_ISOLATION=EL_ISOLATION; G.EL_VERLEGEARTEN=EL_VERLEGEARTEN; G.EL_IZ=EL_IZ;
G.EL_KORR_LUFT=EL_KORR_LUFT; G.EL_KORR_BODEN=EL_KORR_BODEN;
G.EL_HAEUF_NIN=EL_HAEUF_NIN; G.EL_HAEUF_IEC=EL_HAEUF_IEC; G.EL_HAEUF_ERD=EL_HAEUF_ERD;
G.EL_SCHUTZ=EL_SCHUTZ;
G.elIsolation=elIsolation; G.elVerlegearten=elVerlegearten; G.elVerlegeart=elVerlegeart;
G.elSchutz=elSchutz; G.elIzTabelle=elIzTabelle; G.elIz=elIz;
G.elKorrTemp=elKorrTemp; G.elHaeufung=elHaeufung; G.elHaeufungAnzahl=elHaeufungAnzahl;
})();
