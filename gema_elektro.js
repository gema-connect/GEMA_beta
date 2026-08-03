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
  elMaterial:elMaterial, elSystem:elSystem, elKappa:elKappa,
  elNaechsterQuerschnitt:elNaechsterQuerschnitt,
  elNaechsteSicherung:elNaechsteSicherung,
  elNum:elNum, elFmt:elFmt, elRunden:elRunden
};
})();

/* ════════════════════════════════════════════════════════════════════════
   ERGÄNZUNG — Strombelastbarkeit Iz  (Verbraucher: el_belastbarkeit)
   ════════════════════════════════════════════════════════════════════════
   ANHÄNGEND geschrieben (eigener IIFE am Dateiende, erweitert das bestehende
   window.GemaElektro): so kollidiert der Block nicht mit den übrigen el_-
   Modulen, die parallel an derselben Datei arbeiten. Bestehende Werte
   werden NICHT verändert.

   GÜLTIGKEITSBEREICH der hinterlegten Tabellen — bewusst eng, und im Modul
   sichtbar ausgewiesen (nichts davon still unterstellen):
     · Leitermaterial KUPFER. Für Aluminium sind KEINE Werte hinterlegt.
     · 3 belastete Leiter (Drehstrom, symmetrisch belastet).
     · Verlegeart E (Mehrleiterkabel auf perforierter Kabelbahn) und
       F (einadrige Kabel im Dreieck auf perforierter Kabelbahn).
     · Querschnitte 25 – 300 mm².
     · Basiswerte bei 30 °C Umgebungstemperatur (Luft).
   Andere Verlegearten (A1/A2/B1/B2/C), Aluminium und Querschnitte unter
   25 mm² gehören zu einer späteren Ergänzung — sie hier zu «schätzen» wäre
   bei einer Sicherheitsberechnung nicht vertretbar.
   ════════════════════════════════════════════════════════════════════════ */
(function(){
if(!window.GemaElektro) return;
var G = window.GemaElektro;

/* ── Verlegearten ───────────────────────────────────────────────────────
   Einadrige Kabel im Dreieck (F) geben Wärme besser ab als ein Mehrleiter-
   kabel (E) — gleiche Querschnitte tragen dort mehr Strom. */
var EL_VERLEGEARTEN = [
  {id:'F', kurz:'F', label:'F — Einadrige im Dreieck auf perforierter Kabelbahn',
   hinweis:'Drei Einzelleiter im Dreiecksverband, berührend'},
  {id:'E', kurz:'E', label:'E — Mehrleiterkabel auf perforierter Kabelbahn',
   hinweis:'Ein mehradriges Kabel, frei in Luft auf der Trasse'}
];

/* ── Strombelastbarkeit Iz [A] bei 30 °C, Cu, 3 belastete Leiter ────────
   Quellen: NIN 2025 Ziff. 5.2.3 / SN EN 60364-5-52 (PVC 70 °C, XLPE 90 °C);
            CFW PowerCable® Z1+S, Datenblatt cfw.ch V1.3-2024 (90 °C).
   tmax = höchstzulässige Leitertemperatur im Dauerbetrieb — sie steuert die
   Umgebungstemperatur-Korrektur (elIzTempFaktor). */
var EL_KABELTYPEN = [
  {id:'xlpe', name:'XLPE / VPE Cu 90 °C', tmax:90,
   hinweis:'z.B. N2XH, NHXHX, CH-N1Z1Z1 — Standard für grosse Zuleitungen',
   iz:{
     E:{25:127,35:158,50:192,70:246,95:298,120:346,150:399,185:456,240:538,300:621},
     F:{25:135,35:169,50:207,70:268,95:328,120:383,150:444,185:510,240:607,300:703}
   }},
  {id:'pvc', name:'PVC Cu 70 °C', tmax:70,
   hinweis:'z.B. NYY-J, NYM-J, CH-N1VV — klassisch, Leitertemperatur 70 °C',
   iz:{
     E:{25:101,35:126,50:153,70:196,95:238,120:276,150:319,185:364,240:430,300:497},
     F:{25:110,35:137,50:167,70:216,95:264,120:308,150:356,185:409,240:485,300:561}
   }},
  {id:'cfw', name:'CFW PowerCable® Z1+S 90 °C', tmax:90,
   hinweis:'halogenfrei, EMV, symmetrisch verseilt — Herstellerangabe cfw.ch',
   /* Der Hersteller publiziert nur Mehrleiter-Werte. Für den Dreiecksverband
      werden bewusst DIESELBEN Werte gefahren (konservative Unterschätzung)
      statt einen Zuschlag zu erfinden — im Modul als Vermerk ausgewiesen. */
   iz:{
     E:{25:138,35:171,50:208,70:263,95:323,120:376,150:432,185:499,240:591,300:678},
     F:{25:138,35:171,50:208,70:263,95:323,120:376,150:432,185:499,240:591,300:678}
   }}
];

/* ── Häufung ────────────────────────────────────────────────────────────
   NIN 2025 Tabelle 22 Zeile 4 / SN EN 60364-5-52: einlagig auf einer
   gelochten Kabelwanne, berührend. Schlüssel = Anzahl gehäufter Stromkreise
   (die eigenen parallelen Kreise zählen mit).
   KRITISCH: über 4 Kreisen ist KEIN Wert hinterlegt. elIzHaeufung liefert
   dort null — der Aufrufer MUSS das melden. Ein Rückfall auf 1.00 wäre
   nicht nur still, sondern GEFÄHRLICH: er läge über dem Wert für 4 Kreise. */
var EL_HAEUFUNG = {1:1.00, 2:0.90, 3:0.80, 4:0.75};
var EL_HAEUFUNG_MAX = 4;

/* Konventioneller Auslösestrom I2 der Schutzeinrichtung als Vielfaches von
   In — massgebend für die zweite Bedingung I2 ≤ 1.45 · Iz.
     · Leitungsschutzschalter EN 60898 / EN 60947-2: I2 = 1.45 · In
       ⇒ die Bedingung ist erfüllt, sobald In ≤ Iz.
     · Schmelzsicherung gG nach IEC 60269 (Nennstrom > 16 A): I2 = 1.6 · In
       ⇒ es braucht In ≤ 1.45/1.6 · Iz = 0.906 · Iz — der Klassiker, der
         in der Praxis gerne übersehen wird. */
var EL_SCHUTZORGANE = [
  {id:'ls', name:'Leitungsschutzschalter (EN 60898 / 60947-2)', k2:1.45,
   hinweis:'I₂ = 1.45 · Iₙ — Bedingung 2 ist mit Iₙ ≤ I_z automatisch erfüllt'},
  {id:'gg', name:'Schmelzsicherung gG (IEC 60269, Iₙ > 16 A)', k2:1.60,
   hinweis:'I₂ = 1.6 · Iₙ — verlangt Iₙ ≤ 0.906 · I_z'}
];

function elKabeltyp(id){
  for(var i=0;i<EL_KABELTYPEN.length;i++){ if(EL_KABELTYPEN[i].id===id) return EL_KABELTYPEN[i]; }
  return EL_KABELTYPEN[0];
}
function elSchutzorgan(id){
  for(var i=0;i<EL_SCHUTZORGANE.length;i++){ if(EL_SCHUTZORGANE[i].id===id) return EL_SCHUTZORGANE[i]; }
  return EL_SCHUTZORGANE[0];
}

/** Querschnitte, für die zu diesem Kabeltyp/dieser Verlegeart Werte vorliegen. */
function elIzQuerschnitte(typId, verlegeart){
  var t = elKabeltyp(typId);
  var tab = t.iz[verlegeart] || t.iz.E;
  return Object.keys(tab).map(Number).sort(function(a,b){ return a-b; });
}

/** Tabellen-Basiswert Iz₃₀ [A] — null, wenn nichts hinterlegt ist. */
function elIzBasis(typId, verlegeart, q){
  var t = elKabeltyp(typId);
  var tab = t.iz[verlegeart];
  if(!tab) return null;
  var v = tab[Number(q)];
  return (typeof v === 'number') ? v : null;
}

/** Umgebungstemperatur-Korrektur.
 *  f_θ = √((θ_max − θ_u) / (θ_max − 30))
 *  Das ist die Grundlage, aus der die Tabellenwerte der SN EN 60364-5-52
 *  (Tab. B.52.14) gerundet hervorgehen — Gegenprobe PVC 70 °C bei 40 °C:
 *  √(30/40) = 0.866 → Tabelle 0.87; XLPE 90 °C bei 55 °C: √(35/60) = 0.764
 *  → Tabelle 0.76. Rechnen statt Runden hält die Kette nachvollziehbar.
 *  θ_u ≥ θ_max ⇒ 0 (Leitung darf dort nicht belastet werden). */
function elIzTempFaktor(tmax, tempU){
  var tm = Number(tmax), tu = Number(tempU);
  if(!isFinite(tm) || !isFinite(tu)) return 1;
  if(tm <= 30) return 1;
  if(tu >= tm) return 0;
  return Math.sqrt((tm - tu) / (tm - 30));
}

/** Häufungsfaktor — null über EL_HAEUFUNG_MAX (kein stiller Deckel). */
function elIzHaeufung(n){
  var k = Math.round(Number(n));
  if(!isFinite(k) || k < 1) return null;
  var f = EL_HAEUFUNG[k];
  return (typeof f === 'number') ? f : null;
}

/** Zulässige Dauerbelastung EINES Stromkreises:
 *  I_z = I_z,30 · f_θ · f_h        [A]
 *  Rückgabe {iz, iz0, fTemp, fHaeuf, fehler} — `fehler` benennt die Lücke,
 *  statt still einen Ersatzwert zu liefern. */
function elIz(typId, verlegeart, q, tempU, nHaeuf){
  var t   = elKabeltyp(typId);
  var iz0 = elIzBasis(typId, verlegeart, q);
  var fT  = elIzTempFaktor(t.tmax, tempU);
  var fH  = elIzHaeufung(nHaeuf);
  if(iz0 === null) return {iz:null, iz0:null, fTemp:fT, fHaeuf:fH, tmax:t.tmax, fehler:'kein_tabellenwert'};
  if(fH === null)  return {iz:null, iz0:iz0,  fTemp:fT, fHaeuf:null, tmax:t.tmax, fehler:'haeufung_unbekannt'};
  if(fT === 0)     return {iz:0,    iz0:iz0,  fTemp:0,  fHaeuf:fH,   tmax:t.tmax, fehler:'umgebung_zu_warm'};
  return {iz: iz0 * fT * fH, iz0:iz0, fTemp:fT, fHaeuf:fH, tmax:t.tmax, fehler:null};
}

window.GemaElektro.EL_VERLEGEARTEN  = EL_VERLEGEARTEN;
window.GemaElektro.EL_KABELTYPEN    = EL_KABELTYPEN;
window.GemaElektro.EL_HAEUFUNG      = EL_HAEUFUNG;
window.GemaElektro.EL_HAEUFUNG_MAX  = EL_HAEUFUNG_MAX;
window.GemaElektro.EL_SCHUTZORGANE  = EL_SCHUTZORGANE;
window.GemaElektro.elKabeltyp       = elKabeltyp;
window.GemaElektro.elSchutzorgan    = elSchutzorgan;
window.GemaElektro.elIzQuerschnitte = elIzQuerschnitte;
window.GemaElektro.elIzBasis        = elIzBasis;
window.GemaElektro.elIzTempFaktor   = elIzTempFaktor;
window.GemaElektro.elIzHaeufung     = elIzHaeufung;
window.GemaElektro.elIz             = elIz;
})();
