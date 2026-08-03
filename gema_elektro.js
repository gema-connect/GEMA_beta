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
   ERGÄNZUNG — Leistungsbedarf & Bemessungsstrom  (für el_leistungsbedarf)
   ════════════════════════════════════════════════════════════════════════
   ANHÄNGEND geschrieben (eigener IIFE am Dateiende, erweitert das bestehende
   window.GemaElektro) — so kollidiert der Block nicht mit den übrigen el_-
   Modulen, die parallel an derselben Datei arbeiten. Bestehende Werte
   werden NICHT verändert.

   HERKUNFT DER WERTE — sauber getrennt, weil das im Streitfall zählt:
     · EL_GZ_EN61439 ist ein NORMWERT (EN 61439-1 Tab. 101).
     · EL_VERBRAUCHER_KAT sind ERFAHRUNGS-/RICHTWERTE aus der Praxis der
       Gebäudetechnik, KEINE Normvorgaben. Massgebend sind die Vorgaben des
       Netzbetreibers bzw. des Projekts. Deshalb trägt jeder Eintrag das
       Feld `richtwert:true`, und das Modul weist es sichtbar aus und lässt
       jeden Wert überschreiben.
   ════════════════════════════════════════════════════════════════════════ */
(function(){
if(!window.GemaElektro) return;
var G = window.GemaElektro;

/* ── Gleichzeitigkeit nach Anzahl Hauptstromkreise ──────────────────────
   EN 61439-1 Tabelle 101 (früher DIN EN 60439-1 Tab. 1) — Belastungs-
   annahme für Schaltgerätekombinationen, wenn keine genaueren Angaben
   vorliegen. Gilt für die GESAMTE Verteilung, nicht je Verbrauchergruppe. */
var EL_GZ_EN61439 = [
  {ab:1,  bis:1,        f:1.00, label:'1 Stromkreis'},
  {ab:2,  bis:3,        f:0.90, label:'2 und 3 Stromkreise'},
  {ab:4,  bis:5,        f:0.80, label:'4 und 5 Stromkreise'},
  {ab:6,  bis:9,        f:0.70, label:'6 bis 9 Stromkreise'},
  {ab:10, bis:Infinity, f:0.60, label:'10 und mehr Stromkreise'}
];

/* ── Verbraucher-Richtwerte (KEINE Normwerte) ───────────────────────────
   cosPhi = Leistungsfaktor bei Nennlast · g = Gleichzeitigkeitsfaktor
   phase  = übliche Anschlussart (1 = L+N, 3 = Drehstrom)
   Alle drei Angaben sind im Modul überschreibbar. */
var EL_VERBRAUCHER_KAT = [
  {id:'beleuchtung',  name:'Beleuchtung (LED / allgemein)', cosPhi:0.95, g:1.00, phase:1, richtwert:true},
  {id:'steckdosen',   name:'Steckdosen allgemein',          cosPhi:0.95, g:0.30, phase:1, richtwert:true},
  {id:'kochherd',     name:'Kochherd / Steamer',            cosPhi:1.00, g:0.70, phase:3, richtwert:true},
  {id:'haushalt',     name:'Haushaltgeräte (WM/TU/GS)',     cosPhi:0.95, g:0.60, phase:1, richtwert:true},
  {id:'warmwasser',   name:'Warmwasserspeicher',            cosPhi:1.00, g:1.00, phase:3, richtwert:true},
  {id:'waermepumpe',  name:'Wärmepumpe',                    cosPhi:0.85, g:1.00, phase:3, richtwert:true},
  {id:'elektroheiz',  name:'Elektro-Direktheizung',         cosPhi:1.00, g:1.00, phase:3, richtwert:true},
  {id:'lueftung',     name:'Lüftung / Ventilatoren',        cosPhi:0.85, g:0.80, phase:3, richtwert:true},
  {id:'klima',        name:'Klima / Kälte',                 cosPhi:0.85, g:0.80, phase:3, richtwert:true},
  {id:'motor',        name:'Motoren allgemein',             cosPhi:0.85, g:0.70, phase:3, richtwert:true},
  {id:'ladestation',  name:'Ladestation Elektrofahrzeug',   cosPhi:0.98, g:0.60, phase:3, richtwert:true},
  {id:'edv',          name:'EDV / Serverraum',              cosPhi:0.95, g:0.70, phase:1, richtwert:true},
  {id:'kueche',       name:'Gewerbeküche',                  cosPhi:0.95, g:0.60, phase:3, richtwert:true},
  {id:'sonstiges',    name:'Sonstiges',                     cosPhi:0.90, g:1.00, phase:3, richtwert:true}
];

function elVerbraucherKat(id){
  for(var i=0;i<EL_VERBRAUCHER_KAT.length;i++){ if(EL_VERBRAUCHER_KAT[i].id===id) return EL_VERBRAUCHER_KAT[i]; }
  return EL_VERBRAUCHER_KAT[EL_VERBRAUCHER_KAT.length-1];
}

/** Gleichzeitigkeitsfaktor nach EN 61439-1 — null bei ungültiger Anzahl. */
function elGzEn61439(n){
  var k = Math.round(Number(n));
  if(!isFinite(k) || k < 1) return null;
  for(var i=0;i<EL_GZ_EN61439.length;i++){
    if(k >= EL_GZ_EN61439[i].ab && k <= EL_GZ_EN61439[i].bis) return EL_GZ_EN61439[i].f;
  }
  return null;
}

/* ── Leistungsdreieck ───────────────────────────────────────────────────
   S = P / cos φ        Scheinleistung
   Q = P · tan φ        Blindleistung (induktiv, wie in der Gebäudetechnik
                        üblich — kapazitive Lasten müsste man vorzeichen-
                        richtig erfassen; das Modul weist das aus)
   tan φ aus cos φ:  tan φ = √(1 − cos²φ) / cos φ  */
function elScheinleistung(p, cosPhi){
  var c = Number(cosPhi);
  if(!isFinite(c) || c <= 0 || c > 1) return null;
  return Number(p) / c;
}
function elBlindleistung(p, cosPhi){
  var c = Number(cosPhi);
  if(!isFinite(c) || c <= 0 || c > 1) return null;
  return Number(p) * Math.sqrt(1 - c*c) / c;
}

/* Faktor der Wechselstromleistung: P = f · U · I · cos φ
   einphasig f = 1 (U = Leiter-Neutralleiter)
   dreiphasig f = √3 (U = Leiter-Leiter, symmetrische Last)
   BEWUSST NICHT EL_SYSTEME.fP — das ist der Faktor der Verlustleistung
   (I²R über die stromführenden Leiter) und hätte hier den Wert 3. */
function elAcFaktor(sysId){ return sysId === '1p230' ? 1 : Math.sqrt(3); }

/** Strom aus Scheinleistung: I = S / (f · U). S in VA, Rückgabe in A. */
function elStromAusS(sVA, sysId){
  var sys = G.elSystem(sysId);
  var n = Number(sVA);
  if(!isFinite(n) || n < 0) return null;
  return n / (elAcFaktor(sys.id) * sys.u);
}

/* ── Ohmsches Gesetz / Leistung (Gleichstrom bzw. rein ohmsche Last) ────
   Aus GENAU ZWEI der vier Grössen U, I, R, P folgen die beiden anderen.
   Rückgabe {u,i,r,p,fehler}. `fehler`:
     'zu_wenig'  weniger als zwei Angaben
     'zu_viel'   mehr als zwei (welche gilt, entscheidet nicht die Funktion)
     'ungueltig' Division durch null / negative Wurzel                     */
function elOhm(bek){
  bek = bek || {};
  var have = {};
  ['u','i','r','p'].forEach(function(k){
    var v = Number(bek[k]);
    if(bek[k] !== undefined && bek[k] !== null && bek[k] !== '' && isFinite(v)) have[k] = v;
  });
  var keys = Object.keys(have);
  if(keys.length < 2) return {u:null,i:null,r:null,p:null,fehler:'zu_wenig'};
  if(keys.length > 2) return {u:null,i:null,r:null,p:null,fehler:'zu_viel'};

  var u = have.u, i = have.i, r = have.r, p = have.p, s = keys.sort().join('');
  try{
    if(s === 'iu'){ r = i !== 0 ? u/i : null; p = u*i; }
    else if(s === 'ru'){ if(r === 0) return {u:null,i:null,r:null,p:null,fehler:'ungueltig'}; i = u/r; p = u*u/r; }
    else if(s === 'pu'){ if(u === 0) return {u:null,i:null,r:null,p:null,fehler:'ungueltig'}; i = p/u; r = p !== 0 ? u*u/p : null; }
    else if(s === 'ir'){ u = i*r; p = i*i*r; }
    else if(s === 'ip'){ if(i === 0) return {u:null,i:null,r:null,p:null,fehler:'ungueltig'}; u = p/i; r = p/(i*i); }
    else if(s === 'pr'){ if(p < 0 || r < 0) return {u:null,i:null,r:null,p:null,fehler:'ungueltig'};
                         u = Math.sqrt(p*r); i = r !== 0 ? Math.sqrt(p/r) : null; }
  }catch(e){ return {u:null,i:null,r:null,p:null,fehler:'ungueltig'}; }

  var alle = [u,i,r,p];
  for(var k2=0;k2<alle.length;k2++){ if(alle[k2] !== null && !isFinite(alle[k2])) return {u:null,i:null,r:null,p:null,fehler:'ungueltig'}; }
  return {u:u, i:i, r:r, p:p, fehler:null};
}

window.GemaElektro.EL_GZ_EN61439      = EL_GZ_EN61439;
window.GemaElektro.EL_VERBRAUCHER_KAT = EL_VERBRAUCHER_KAT;
window.GemaElektro.elVerbraucherKat   = elVerbraucherKat;
window.GemaElektro.elGzEn61439        = elGzEn61439;
window.GemaElektro.elScheinleistung   = elScheinleistung;
window.GemaElektro.elBlindleistung    = elBlindleistung;
window.GemaElektro.elAcFaktor         = elAcFaktor;
window.GemaElektro.elStromAusS        = elStromAusS;
window.GemaElektro.elOhm              = elOhm;
})();
