/* ═══════════════════════════════════════════════════════════════════════════
   GEMA — Summenlinien-Engine (VSSH Handbuch 5, Blatt 2.2.8–2.2.13)
   ═══════════════════════════════════════════════════════════════════════════

   GETEILTE WAHRHEIT — bewusst EINE Datei fuer ZWEI Konsumenten:
     • sb_summenlinien.html  (eigenstaendiges Modul, freie Eingabe)
     • sb_warmwasser.html    (WW_TYP_PROFILE der Feinplanung leitet sich per
                              Rotation aus WW_SL_PROFILE ab — pct[h] =
                              SL[(h+19)%24]; der Drift-Guard
                              scripts/feedback_20260815_test.mjs prueft das
                              live gegen window.WW_SL_PROFILE)

   Eine Kopie liefe beim naechsten Profil-Update still auseinander und die
   Feinplanungs-Summenlinien zeigten andere Tagesgaenge als das Diagramm.

   DOM-FREI — jede Funktion nimmt ihre Daten als Parameter. Damit ist die
   Engine in Node testbar (module.exports am Dateiende) und die Profile
   lassen sich im Modul frei ueberschreiben, ohne die Rechenkette zu
   beruehren.

   Tagesgang-Profile: Stundenwerte in % des Tagesbedarfs, Diagrammstart 05:00
   (VSSH-Konvention). Summe je Profil = 100 %.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var WW_SL_PROFILE={
  wohnbau_mo_do:  {label:'Wohnbauten Mo–Do',            pct:[2,4.5,7.5,7,8.5,5.5,5,5,5,3.5,4,6,7,10,8.5,4,3,2,1,0.5,0.5,0,0,0]},
  wohnbau_fr:     {label:'Wohnbauten Freitag',          pct:[2.5,3.5,5,5.5,5,6,5.5,3.5,3,3,6,9,9.5,9.5,8.5,6.5,4,1.5,1,0.5,0.5,0.5,0.5,0]},
  wohnbau_sa:     {label:'Wohnbauten Samstag',          pct:[1,3,4.5,6,9,10,8,6,5,4.5,5,7,7.5,7,5.5,4,2.5,1.5,1,0.5,0.5,0.5,0.5,0]},
  wohnbau_so:     {label:'Wohnbauten Sonntag',          pct:[0.5,1.5,4,8.5,15,10.5,7,6.5,3,4,5.5,6.5,6,7.5,5,3,2,2,1,0.5,0.5,0,0,0]},
  altersheim:     {label:'Altersheime (gehoben)',       pct:[0.3,8.7,19.3,17.2,10.1,10.3,1.3,1.9,5.1,3.4,2.4,4.5,1.9,1.9,0.7,8.1,2.4,0.5,0,0,0,0,0,0]},
  cafe_restaurant:{label:'Cafés + Restaurants',         pct:[2,4.2,5.3,6.5,8,13.5,13,6.5,4.5,2.5,3,4,6,7.5,7.5,3,1,0.5,0.5,0.5,0.5,0,0,0]},
  stadthotel:     {label:'Stadt- + Passantenhotels',    pct:[3,5,9.5,10,9.5,8,4,2.5,1,1.5,1.5,4,10.5,12.5,7,4.5,2,1,1,0.5,0.5,0.5,0.3,0.2]},
  touristenhotel: {label:'Touristenhotels',             pct:[2.5,3.5,4.5,5.5,7,8.5,5.5,3.5,2,1.5,2.5,3,6,20.5,11,5.5,3,1.5,1,1,0.3,0.3,0.2,0.2]},
  spital:         {label:'Spitäler',                    pct:[3.5,6,9,14,14,9.5,7.5,3.5,3,1.5,2,3,5,6,3.5,4,1,1,1,0.5,0.5,0.3,0.2,0.5]}
};
var WW_SL_START=5; // Diagramm beginnt um 05:00 (VSSH-Konvention)

// 'HH:MM' → Diagrammstunde 0..24 (0 = 05:00)
function wwSlT(clock){
  if(!clock)return null;
  var m=String(clock).match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;
  var h=(+m[1])+(+m[2])/60;
  return ((h-WW_SL_START)+24)%24;
}
// Diagrammstunde → 'HH:MM' Uhrzeit
function wwSlClock(t){
  var h=((t%24)+24)%24, c=(h+WW_SL_START)%24;
  var hh=Math.floor(c+1e-6), mm=Math.round((c-hh)*60);
  if(mm===60){mm=0;hh=(hh+1)%24;}
  return (hh<10?'0':'')+hh+':'+(mm<10?'0':'')+mm;
}
// Ladefenster [{aktiv,von,bis}] → gemergte Diagramm-Segmente [[a,b],…] (Mitternacht-Wrap erlaubt)
function wwSlSegmente(fenster){
  var seg=[];
  (fenster||[]).forEach(function(f){
    if(!f||!f.aktiv)return;
    var a=wwSlT(f.von), b=wwSlT(f.bis);
    if(a==null||b==null||Math.abs(a-b)<1e-9)return;
    if(b>a)seg.push([a,b]); else {seg.push([a,24]); if(b>1e-9)seg.push([0,b]);}
  });
  seg.sort(function(x,y){return x[0]-y[0];});
  var out=[];
  seg.forEach(function(s){
    var l=out[out.length-1];
    if(l&&s[0]<=l[1]+1e-9)l[1]=Math.max(l[1],s[1]); else out.push([s[0],s[1]]);
  });
  return out;
}
// Verbrauchs-/Lade-Arrays pro Zeitschritt + kumulierte Summenlinie
function wwSlArrays(pct,pctH,segs,steps){
  steps=steps||12;
  var n=24*steps, dt=1/steps, verb=[], lad=[], v=[0];
  function inSeg(t){for(var i=0;i<segs.length;i++){if(t>=segs[i][0]-1e-9&&t<segs[i][1]-1e-9)return true;}return false;}
  for(var i=0;i<n;i++){
    var h=Math.floor(i*dt+1e-9);
    verb.push((+pct[h]||0)*dt);
    lad.push(inSeg((i+0.5)*dt)?pctH*dt:0);
    v.push(v[i]+verb[i]);
  }
  return {n:n,dt:dt,verb:verb,lad:lad,v:v};
}
// Erforderliches Mindest-Speichervolumen = max. Bedarfsüberschuss über jede
// Zeitspanne (Kadane über den verdoppelten Tag → Periodizität berücksichtigt).
function wwSlMinSpeicher(verb,lad){
  var n=verb.length, d=0, maxD=0, cs=0, si=0, ei=0;
  for(var k=0;k<2*n;k++){
    d+=verb[k%n]-lad[k%n];
    if(d<0){d=0;cs=k+1;}
    else if(d>maxD+1e-12){maxD=d;si=cs;ei=k;}
  }
  return {pct:maxD, startIdx:si%n, endIdx:(ei%n)+1};
}
// Speicher-Simulation (eingeschwungener Tag): Laden mit verfügbarer Leistung,
// solange Speicher nicht voll. Liefert Inhalt s[], geladene Menge, Unterdeckung.
function wwSlSim(verb,lad,capPct){
  var n=verb.length, cap=Math.max(0,capPct), s=cap, arr=[s], loads=[], unmet=0, unmetSegs=[];
  for(var day=0;day<4;day++){
    arr=[s];loads=[];unmet=0;unmetSegs=[];
    var inU=false;
    for(var i=0;i<n;i++){
      var load=Math.min(lad[i], cap-s+verb[i]);
      if(load<0)load=0;
      var s2=s+load-verb[i];
      if(s2<-1e-9){
        unmet+=-s2;s2=0;
        if(!inU){unmetSegs.push([i,i+1]);inU=true;} else unmetSegs[unmetSegs.length-1][1]=i+1;
      } else inU=false;
      if(s2>cap)s2=cap;
      if(s2<0)s2=0;
      loads.push(load);
      s=s2;arr.push(s);
    }
  }
  return {s:arr, loads:loads, unmetPct:unmet, unmetSegs:unmetSegs};
}
function wwSlSpitze(pct){
  var m=0,idx=0;
  for(var i=0;i<24;i++){if((+pct[i]||0)>m){m=+pct[i];idx=i;}}
  return {pct:m,idx:idx};
}

/* ── Export ──────────────────────────────────────────────────────────────────
   Die Einzel-Globals bleiben unter ihren gewachsenen Namen erhalten:
   sb_warmwasser ruft sie so seit je, und feedback_20260815_test liest
   window.WW_SL_PROFILE direkt. Zusaetzlich das gebuendelte GemaSummenlinien
   fuer neue Konsumenten und module.exports fuer Node-Tests.              */
var API={
  WW_SL_PROFILE:WW_SL_PROFILE,
  WW_SL_START:WW_SL_START,
  wwSlT:wwSlT,
  wwSlClock:wwSlClock,
  wwSlSegmente:wwSlSegmente,
  wwSlArrays:wwSlArrays,
  wwSlMinSpeicher:wwSlMinSpeicher,
  wwSlSim:wwSlSim,
  wwSlSpitze:wwSlSpitze
};

if(typeof window!=='undefined'){
  window.WW_SL_PROFILE=WW_SL_PROFILE;
  window.WW_SL_START=WW_SL_START;
  window.wwSlT=wwSlT;
  window.wwSlClock=wwSlClock;
  window.wwSlSegmente=wwSlSegmente;
  window.wwSlArrays=wwSlArrays;
  window.wwSlMinSpeicher=wwSlMinSpeicher;
  window.wwSlSim=wwSlSim;
  window.wwSlSpitze=wwSlSpitze;
  window.GemaSummenlinien=API;
}
if(typeof module!=='undefined'&&module.exports){module.exports=API;}

})();
