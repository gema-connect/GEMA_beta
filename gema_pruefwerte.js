/* ══════════════════════════════════════════════════════════════
   GEMA — Prüfwerte ortsveränderlicher elektrischer Betriebsmittel
   ══════════════════════════════════════════════════════════════
   Grundlage: SNR 462638 (CH-Regel für die Prüfung ortsveränderlicher
   elektrischer Betriebsmittel, aufgebaut auf DIN VDE 0701-0702).

   WICHTIG — die Grenzwerte sind RICHTWERTE, kein automatisches Urteil:
   der Schutzleiterwiderstand hängt an der Leitungslänge, der zulässige
   Ableitstrom an der Heizleistung. GEMA rechnet die Längenkorrektur mit,
   wenn eine Länge erfasst ist, und fällt sonst auf den Basiswert zurück.
   Das ERGEBNIS setzt immer die prüfende Person — die Ampel ist ein
   Hinweis, damit ein übersehener Wert auffällt, und nie mehr.

   WARUM EINE EIGENE DATEI (KRITISCH): dieselben Grenzwerte werden an
   ZWEI Orten gebraucht — im Werkzeugmodul (Magaziner) und im
   Lieferanten-Dashboard (externer Prüfer). Eine Kopie würde beim
   nächsten Normen-Update still auseinanderlaufen und der externe
   Prüfer bewertete gegen veraltete Werte. Es gibt darum genau EINE
   Wahrheit; wer eine Grenzwert-Regel ändert, ändert sie hier.

   DOM-frei — ein Node-Test kann die Datei direkt laden
   (module.exports am Ende).
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var WZ_SCHUTZKLASSEN=[
  {id:'I',   label:'Schutzklasse I (Schutzleiter)',        iso:1.0},
  {id:'II',  label:'Schutzklasse II (schutzisoliert)',     iso:2.0},
  {id:'III', label:'Schutzklasse III (Kleinspannung)',     iso:0.25}
];
function wzSchutzklasse(id){
  for(var i=0;i<WZ_SCHUTZKLASSEN.length;i++){ if(WZ_SCHUTZKLASSEN[i].id===id) return WZ_SCHUTZKLASSEN[i]; }
  return null;
}
// Schutzleiterwiderstand: 0.30 Ohm bis 5 m Anschlussleitung, danach
// +0.10 Ohm je angefangene 7.5 m, gedeckelt bei 1.00 Ohm.
function wzGrenzRpe(laengeM){
  var L=parseFloat(laengeM);
  if(!isFinite(L)||L<=5) return 0.30;
  var zusatz=Math.ceil((L-5)/7.5)*0.10;
  return Math.min(1.00, Math.round((0.30+zusatz)*100)/100);
}
// Isolationswiderstand je Schutzklasse; Geraete mit Heizelementen ueber
// 3.5 kW duerfen in SK I auf 0.30 MOhm herunter.
function wzGrenzRiso(sk, heizkW){
  var H=parseFloat(heizkW);
  if(sk==='I' && isFinite(H) && H>3.5) return 0.30;
  var k=wzSchutzklasse(sk);
  return k?k.iso:null;
}
// Schutzleiter-/Ersatzableitstrom: 3.5 mA; bei Heizleistung ueber 3.5 kW
// 1 mA je kW, gedeckelt bei 10 mA. Beruehrungsstrom fest 0.5 mA.
function wzGrenzIpe(heizkW){
  var H=parseFloat(heizkW);
  if(isFinite(H) && H>3.5) return Math.min(10, Math.round(H*10)/10);
  return 3.5;
}
function wzGrenzIb(){ return 0.5; }

// Grenzwerte fuer EIN Geraet (Schutzklasse, Leitungslaenge, Heizleistung).
function wzGrenzwerte(g){
  g=g||{};
  var sk=g.schutzklasse||'';
  return {
    schutzklasse:sk,
    rpe: sk==='I' ? wzGrenzRpe(g.leitungLaengeM) : null,   // nur SK I hat einen Schutzleiter
    riso: wzGrenzRiso(sk, g.heizleistungKw),
    // Ohne erfasste Schutzklasse gibt es KEINEN Ableitstrom-Grenzwert —
    // sonst bewertete die Ampel gegen einen Wert, den niemand bestimmt hat,
    // waehrend die Oberflaeche zusichert, ohne Klasse nicht zu bewerten.
    // SK III fuehrt keinen Netzstrom und hat darum ebenfalls keinen.
    ipe: (!sk||sk==='III') ? null : wzGrenzIpe(g.heizleistungKw),
    // Der Beruehrungsstrom ist klassenunabhaengig — er gilt immer.
    ib: wzGrenzIb()
  };
}

// Bewertung EINES Messwerts gegen seinen Grenzwert.
//   richtung 'max' = Wert darf den Grenzwert nicht ueberschreiten (R_PE, Stroeme)
//   richtung 'min' = Wert darf ihn nicht unterschreiten (R_ISO)
// Rueckgabe: 'ok' | 'grenz' (innerhalb 10 %) | 'ueber' | '' (nicht bewertbar)
function wzMessBewertung(wert, grenz, richtung){
  var w=parseFloat(wert), G=parseFloat(grenz);
  if(!isFinite(w)||!isFinite(G)||G<=0) return '';
  if(richtung==='min'){
    if(w<G) return 'ueber';
    return w<G*1.1 ? 'grenz' : 'ok';
  }
  if(w>G) return 'ueber';
  return w>G*0.9 ? 'grenz' : 'ok';
}

// Alle erfassten Messwerte eines Berichts bewerten.
// mess = {rpe, riso, ipe, ib} (Zahlen oder Strings), g = Geraet.
function wzMessAuswertung(mess, g){
  mess=mess||{};
  var gr=wzGrenzwerte(g);
  var zeilen=[
    {key:'rpe',  kurz:'R_PE',  label:'Schutzleiterwiderstand', einheit:'Ω',  grenz:gr.rpe,  richtung:'max'},
    {key:'riso', kurz:'R_ISO', label:'Isolationswiderstand',   einheit:'MΩ', grenz:gr.riso, richtung:'min'},
    {key:'ipe',  kurz:'I_PE',  label:'Ersatzableitstrom',      einheit:'mA', grenz:gr.ipe,  richtung:'max'},
    {key:'ib',   kurz:'I_B',   label:'Berührungsstrom',        einheit:'mA', grenz:gr.ib,   richtung:'max'}
  ].map(function(z){
    var roh=mess[z.key];
    var hat=roh!==''&&roh!==null&&roh!==undefined&&isFinite(parseFloat(roh));
    return {
      key:z.key, kurz:z.kurz, label:z.label, einheit:z.einheit,
      wert:hat?parseFloat(roh):null,
      grenz:z.grenz, richtung:z.richtung,
      status:hat?wzMessBewertung(roh,z.grenz,z.richtung):''
    };
  });
  var erfasst=zeilen.filter(function(z){return z.wert!==null;});
  return {
    zeilen:zeilen,
    erfasst:erfasst.length,
    ueber:erfasst.filter(function(z){return z.status==='ueber';}).length,
    grenz:erfasst.filter(function(z){return z.status==='grenz';}).length
  };
}
function wzHatMesswerte(mess){
  if(!mess) return false;
  return ['rpe','riso','ipe','ib'].some(function(k){
    var v=mess[k];
    return v!==''&&v!==null&&v!==undefined&&isFinite(parseFloat(v));
  });
}

// ── Ergebnis als WERT statt als Anzeigetext ──────────────────
// Gespeichert wird 'bestanden' | 'maengel' | 'nicht_bestanden'.
// Altbestand traegt den Anzeigetext mit Emoji ("✓ Bestanden") — der
// Resolver versteht beides, damit kein alter Bericht unlesbar wird.
var WZ_ERGEBNIS=[
  {id:'bestanden',      label:'Bestanden',       icon:'✓', farbe:'#16a34a'},
  {id:'maengel',        label:'Mit Mängeln',     icon:'⚠', farbe:'#d97706'},
  {id:'nicht_bestanden',label:'Nicht bestanden', icon:'✕', farbe:'#dc2626'}
];
function wzErgebnisId(roh){
  if(!roh) return '';
  var s=String(roh).toLowerCase();
  for(var i=0;i<WZ_ERGEBNIS.length;i++){ if(s===WZ_ERGEBNIS[i].id) return WZ_ERGEBNIS[i].id; }
  if(s.indexOf('nicht')>=0) return 'nicht_bestanden';
  if(s.indexOf('mängel')>=0||s.indexOf('maengel')>=0) return 'maengel';
  if(s.indexOf('bestanden')>=0) return 'bestanden';
  return '';
}
function wzErgebnisInfo(roh){
  var id=wzErgebnisId(roh);
  for(var i=0;i<WZ_ERGEBNIS.length;i++){ if(WZ_ERGEBNIS[i].id===id) return WZ_ERGEBNIS[i]; }
  return null;
}
function wzErgebnisLabel(roh){
  var e=wzErgebnisInfo(roh);
  if(e) return e.icon+' '+e.label;
  return roh?String(roh):'';
}
// Fuer die ANZEIGE: liefert immer ein Objekt, auch bei unbekanntem Wert
// (neutrales Grau statt eines Absturzes). wzErgebnisInfo bleibt bewusst
// ehrlich und gibt null zurueck, wenn der Wert nicht zuzuordnen ist.
function wzErgebnisAnzeige(roh){
  var e=wzErgebnisInfo(roh);
  if(e) return e;
  return {id:'', label:(roh?String(roh):'—'), icon:'·', farbe:'#64748b'};
}

// ══════════════════════════════════════════════════════════════════
// QUALIFIKATION DER PRUEFENDEN PERSON
// ══════════════════════════════════════════════════════════════════
// SNR 462638 verlangt die Pruefung durch eine FACHKUNDIGE Person. Das
// ist eine Eigenschaft der PERSON, nicht des Geraets — sie gehoert
// darum ins Profil und als SNAPSHOT in den Bericht: wer die Prueferin
// spaeter befoerdert oder deren Profil aendert, darf einen abgelegten
// Nachweis nicht rueckwirkend umdeuten (gleiche Regel wie die
// Grenzwerte, die ebenfalls mit dem Bericht gespeichert werden).
//
// Die Liste bildet die schweizerischen Nachweise ab (NIV SR 734.27
// bzw. eidg. Abschluesse). Sie ist bewusst KURZ und endet mit einer
// Freitext-Option: GEMA erfindet keine Titel, und wer einen anderen
// Nachweis hat, traegt ihn im Klartext ein.
//
// KRITISCH: Die Angabe ist eine SELBSTDEKLARATION. GEMA prueft sie
// nicht und kann sie nicht pruefen — die Verantwortung fuer den
// Einsatz einer fachkundigen Person bleibt beim Betrieb. Genau das
// steht auch im Profil und auf dem Bericht, damit der Nachweis nicht
// mehr behauptet, als er belegt.
var WZ_QUALIFIKATIONEN=[
  {id:'esb',        label:'Elektro-Sicherheitsberater/in mit eidg. Fachausweis'},
  {id:'kontrolleur',label:'Elektrokontrolleur/in mit eidg. Fachausweis'},
  {id:'installateur',label:'Elektroinstallateur/in EFZ'},
  {id:'betriebselektriker',label:'Betriebselektriker/in mit Bewilligung nach NIV'},
  {id:'instruiert', label:'Instruierte Person (Pruefung unter Aufsicht)'},
  {id:'andere',     label:'Andere Qualifikation'}
];
function wzQualiInfo(id){
  var k=String(id==null?'':id).trim();
  for(var i=0;i<WZ_QUALIFIKATIONEN.length;i++) if(WZ_QUALIFIKATIONEN[i].id===k) return WZ_QUALIFIKATIONEN[i];
  return null;
}
/* Anzeigetext einer Qualifikation. Bei `andere` gewinnt der Freitext —
   ohne Freitext bleibt das generische Label stehen, damit die Angabe
   nicht leer wirkt. Ein unbekannter Schluessel (Altdaten, spaeter
   entfernte Option) wird ROH gezeigt statt verschluckt. */
function wzQualiLabel(id,frei){
  var f=String(frei==null?'':frei).trim();
  var k=String(id==null?'':id).trim();
  if(!k) return f;                       // nur Freitext erfasst
  var info=wzQualiInfo(k);
  if(!info) return f||k;
  if(k==='andere') return f||info.label;
  return f?(info.label+' — '+f):info.label;
}
/* Qualifikation aus dem Profil ziehen. EINE Aufloesung fuer beide
   Module: das Werkzeug-Modul liest den eingeloggten Benutzer, das
   Lieferanten-Dashboard den externen Pruefer. Rueckgabe IMMER ein
   Objekt {id,frei,label} — `label` ist leer, wenn nichts erfasst ist
   (dann sagt der Dialog das, statt eine Qualifikation zu behaupten). */
function wzQualiVonUser(u){
  var p=(u&&u.profile)||{};
  var id=p.pruefQualifikation||'';
  var frei=p.pruefQualifikationText||'';
  return { id:id, frei:frei, label:wzQualiLabel(id,frei) };
}

var API={
  SCHUTZKLASSEN:WZ_SCHUTZKLASSEN, ERGEBNIS:WZ_ERGEBNIS,
  QUALIFIKATIONEN:WZ_QUALIFIKATIONEN,
  qualiInfo:wzQualiInfo, qualiLabel:wzQualiLabel, qualiVonUser:wzQualiVonUser,
  schutzklasse:wzSchutzklasse,
  grenzRpe:wzGrenzRpe, grenzRiso:wzGrenzRiso, grenzIpe:wzGrenzIpe, grenzIb:wzGrenzIb,
  grenzwerte:wzGrenzwerte,
  messBewertung:wzMessBewertung, messAuswertung:wzMessAuswertung, hatMesswerte:wzHatMesswerte,
  ergebnisId:wzErgebnisId, ergebnisInfo:wzErgebnisInfo,
  ergebnisLabel:wzErgebnisLabel, ergebnisAnzeige:wzErgebnisAnzeige
};

if(typeof window!=='undefined'){
  window.GemaPruefwerte=API;
  // Die Modulseiten rufen die Funktionen unter ihren gewachsenen Namen —
  // beide Namensraeume zeigen auf DIESELBE Implementierung.
  window.WZ_SCHUTZKLASSEN=WZ_SCHUTZKLASSEN;
  window.WZ_ERGEBNIS=WZ_ERGEBNIS;
  window.WZ_QUALIFIKATIONEN=WZ_QUALIFIKATIONEN;
  window.wzQualiInfo=wzQualiInfo;
  window.wzQualiLabel=wzQualiLabel;
  window.wzQualiVonUser=wzQualiVonUser;
  window.wzSchutzklasse=wzSchutzklasse;
  window.wzGrenzRpe=wzGrenzRpe;
  window.wzGrenzRiso=wzGrenzRiso;
  window.wzGrenzIpe=wzGrenzIpe;
  window.wzGrenzIb=wzGrenzIb;
  window.wzGrenzwerte=wzGrenzwerte;
  window.wzMessBewertung=wzMessBewertung;
  window.wzMessAuswertung=wzMessAuswertung;
  window.wzHatMesswerte=wzHatMesswerte;
  window.wzErgebnisId=wzErgebnisId;
  window.wzErgebnisInfo=wzErgebnisInfo;
  window.wzErgebnisLabel=wzErgebnisLabel;
  window.wzErgebnisAnzeige=wzErgebnisAnzeige;
}
if(typeof module!=='undefined'&&module.exports){ module.exports=API; }
})();
