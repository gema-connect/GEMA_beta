/* ═══════════════════════════════════════════════════════════════════════
   GEMA — Pumpenkennlinien aus Hersteller-Prüfberichten (window.GemaPumpenkennlinie)

   Hersteller (z.B. BIRAL) führen ihre Pumpen-Prüfberichte bereits als Excel
   im ERP («Import aus ABAS»): Kopfdaten (P1, Nennstrom, Drehzahl, Spannung,
   Stutzen-Durchmesser …) plus die gemessene KENNLINIE (H/Q-Punkte mit P1,
   P2, I und Wirkungsgrad) nach ISO 9906. Dieser Helper

     · parst genau solche Prüfberichte (label-basiert — nicht an feste
       Zellen gebunden; das Blatt kommt aus `GemaErpImport.leseXlsx`,
       dem CDN-freien XLSX-Reader der ERP-Migration — eine Wahrheit),
     · mappt die Kopfdaten auf die Produkt-Schemas der Pumpen-Kategorien
       (KATEGORIEN aus gema_produktkatalog_api.js, mit Einheiten-Umrechnung),
     · hält die Kennlinie als kompaktes Objekt in `produkt.daten.kennlinie`
       (überlebt updateProdukt-Merges, wandert mit der Anlagenwahl-Snapshot
       in die Berechnungsmodule),
     · zeichnet das PUMPENDIAGRAMM als SVG (H-Q + Wirkungsgrad oben,
       Leistungsaufnahme P1 unten — klassisches Datenblatt-Layout) mit
       optionalem Betriebspunkt aus der GEMA-Berechnung.

   NUR literale Hex-Farben im SVG (GemaPDF/html2canvas-Regel).
   parse/zuDaten/kennlinieVon/betriebspunktAus/interpoliere sind DOM-frei
   und Node-testbar (scripts/pumpenkennlinie_test.mjs).
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

function s(v){ return v==null?'':String(v).trim(); }
// Label-Normalisierung: klein, Umlaute transliteriert, nur a-z0-9 —
// «Leistungsaufnahme P1 :» → «leistungsaufnahmep1», «ɳ - Motor :» → «motor».
function norm(v){
  return s(v).toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,'');
}
// Erste Zahl aus einer Zelle («11,0 m³/h» → 11, «0.75» → 0.75). null = keine.
function zahl(v){
  var t=s(v).replace(/[’ʼ']/g,'');
  var m=/-?\d+(?:[.,]\d+)?/.exec(t);
  if(!m)return null;
  var n=parseFloat(m[0].replace(',','.'));
  return isFinite(n)?n:null;
}
function rund(v,d){ var f=Math.pow(10,d==null?2:d); return Math.round((parseFloat(v)||0)*f)/f; }

// ── Kopfdaten-Labels (Reihenfolge = Priorität: spezifischere zuerst) ─────
var KOPF_LABELS=[
  {id:'typ',            key:'pumpentyp',           txt:true},
  {id:'revNr',          key:'revnr',               txt:true},
  {id:'pruefer',        key:'pruefer',             txt:true},
  {id:'datum',          key:'datum',               txt:true},
  {id:'motor',          key:'motorbezeichnung',    txt:true},
  {id:'p1KW',           key:'leistungsaufnahmep1'},
  {id:'nennstromA',     key:'nennstrom'},
  {id:'laufradtyp',     key:'laufradtyp',          txt:true},
  {id:'laufraddurchgang',key:'laufraddurchgang'},
  {id:'fluegelhoeheMm', key:'fluegelhoehe'},
  {id:'etaMotorPct',    key:'motor'},              // «ɳ - Motor» normalisiert zu «motor»
  {id:'spannungV',      key:'nennspannung'},
  {id:'frequenzHz',     key:'frequenz'},
  {id:'artikelNr',      key:'artikelnr',           txt:true},
  {id:'saugstutzenMm',  key:'saugstutzen'},
  {id:'druckstutzenMm', key:'druckstutzen'},
  {id:'rohrleitungMm',  key:'rohrleitung'},
  {id:'drehzahl',       key:'drehzahl'},
  {id:'cosphi',         key:'cos'},
  {id:'testnorm',       key:'testnorm',            txt:true},
  {id:'kunde',          key:'kunde',               txt:true},
  {id:'qminM3h',        key:'qmin'},
  {id:'qmaxM3h',        key:'qmax'}
];

// ── Prüfbericht parsen ───────────────────────────────────────────────────
// input: {sheets:[{name,rows}]} (GemaErpImport.leseXlsx) ODER {rows} ODER rows.
// Liefert {kopf, punkte, tol, betriebspunkte, warn[]}. Fehlende Teile werden
// benannt, nie still verworfen (No-silent-caps-Regel).
function parse(input){
  var rows=null;
  if(Array.isArray(input))rows=input;
  else if(input&&Array.isArray(input.rows))rows=input.rows;
  else if(input&&Array.isArray(input.sheets)){
    // Blatt mit dem Kennlinien-Kopf bevorzugen, sonst das erste
    for(var si=0;si<input.sheets.length;si++){
      var sr=input.sheets[si]&&input.sheets[si].rows||[];
      if(kopfzeileIndex(sr)>=0){rows=sr;break;}
    }
    if(!rows)rows=(input.sheets[0]&&input.sheets[0].rows)||[];
  }
  rows=rows||[];
  var r={kopf:{},punkte:[],tol:null,betriebspunkte:[],warn:[]};

  // Kopfdaten: jede Zelle gegen die Label-Liste, Wert = nächste gefüllte
  // Zelle rechts (max. 3 weiter). Nur der ERSTE Treffer pro Label zählt
  // (die Kennlinien-Tabelle weiter unten trägt teils dieselben Wörter).
  var belegt={};
  rows.forEach(function(row){
    for(var i=0;i<row.length;i++){
      var n=norm(row[i]);
      if(!n)continue;
      for(var l=0;l<KOPF_LABELS.length;l++){
        var L=KOPF_LABELS[l];
        if(belegt[L.id])continue;
        if(n!==L.key&&n.indexOf(L.key)!==0)continue;
        var val=null;
        for(var j=i+1;j<=i+3&&j<row.length;j++){ if(s(row[j])!==''){val=row[j];break;} }
        if(val==null)continue;
        belegt[L.id]=true;
        r.kopf[L.id]=L.txt?s(val):zahl(val);
        break;
      }
    }
  });
  if(r.kopf.typ==null||r.kopf.typ==='')r.warn.push('Pumpentyp nicht gefunden — bitte Datei prüfen (erwartet wird ein Prüfbericht mit «Pumpentyp :»).');

  // Toleranzen (ISO 9906): Zeile mit Q± / H± / ɳ − und drei Zahlen.
  rows.forEach(function(row){
    if(r.tol)return;
    var hatQ=false,hatProzent=0,zahlen=[];
    row.forEach(function(c){
      var t=s(c);
      if(/±/.test(t)&&/^q/i.test(t))hatQ=true;
      if(t==='%')hatProzent++;
      var z=zahl(t); if(z!=null&&t.indexOf('%')<0&&!/±/.test(t))zahlen.push(z);
    });
    if(hatQ&&hatProzent>=2&&zahlen.length>=3)r.tol={q:zahlen[0],h:zahlen[1],eta:zahlen[2]};
  });

  // Betriebspunkte des Prüfberichts (oft 0 = nicht erfasst → weglassen).
  // Zellen sind [q,'m³/h',h,'m',eta,'%'] — nur Zellen, die mit einer Ziffer
  // BEGINNEN, sind Werte (Einheiten-Zellen wie ' m³/h' fallen raus).
  rows.forEach(function(row){
    if(!/^\dbetriebspunkt/.test(norm(row[0])))return;
    var zahlen=[];
    for(var i=1;i<row.length;i++){var t=s(row[i]);if(/^-?\d/.test(t))zahlen.push(zahl(t));}
    if(zahlen.length>=2&&(zahlen[0]>0||zahlen[1]>0))r.betriebspunkte.push({q:zahlen[0],h:zahlen[1],eta:zahlen[2]||0});
  });

  // Kennlinien-Tabelle
  var hi=kopfzeileIndex(rows);
  if(hi<0){ r.warn.push('Keine Kennlinien-Tabelle gefunden (Kopfzeile H / Htotal / Q fehlt).'); return r; }
  var head=rows[hi], idx={};
  var qSeen=0,hSeen=0;
  for(var c=0;c<head.length;c++){
    var n=norm(head[c]);
    if(n==='h'){ if(!hSeen)idx.h=c; hSeen++; }
    else if(n==='htotal')idx.htotal=c;
    else if(n==='q'){ if(qSeen===0)idx.qM3h=c; else if(qSeen===1)idx.qLs=c; qSeen++; }
    else if(n==='p1')idx.p1=c;
    else if(n==='p2')idx.p2=c;
    else if(n==='i')idx.i=c;
    else if(n==='cos')idx.cos=c;
    else if(n==='pumpe')idx.etaP=c;
    else if(n==='gesamt')idx.etaG=c;
  }
  var iH=idx.htotal!=null?idx.htotal:idx.h;
  var leer=0;
  for(var ri=hi+1;ri<rows.length&&leer<4;ri++){
    var row=rows[ri]||[];
    if(row.some(function(c){return /\[/.test(s(c));}))continue; // Einheiten-Zeile
    if(row.some(function(c){return norm(c)==='testnorm';}))break;
    var h=zahl(row[iH]), q=zahl(row[idx.qM3h]);
    if(h==null||q==null){ leer++; continue; }
    leer=0;
    r.punkte.push({
      h:h, q:q,
      qLs: idx.qLs!=null?(zahl(row[idx.qLs])||0):rund(q/3.6,2),
      p1:  idx.p1!=null?(zahl(row[idx.p1])||0):0,
      p2:  idx.p2!=null?(zahl(row[idx.p2])||0):0,
      i:   idx.i!=null?(zahl(row[idx.i])||0):0,
      etaP:idx.etaP!=null?(zahl(row[idx.etaP])||0):0,
      etaG:idx.etaG!=null?(zahl(row[idx.etaG])||0):0
    });
  }
  if(!r.punkte.length)r.warn.push('Kennlinien-Tabelle ist leer.');
  r.punkte.sort(function(a,b){return a.q-b.q;});
  return r;
}
function kopfzeileIndex(rows){
  for(var i=0;i<(rows||[]).length;i++){
    var row=rows[i]||[],hatH=false,hatHtot=false,qN=0;
    for(var c=0;c<row.length;c++){
      var n=norm(row[c]);
      if(n==='h')hatH=true; else if(n==='htotal')hatHtot=true; else if(n==='q')qN++;
    }
    if((hatH||hatHtot)&&qN>=1&&(hatHtot||qN>=2))return i;
  }
  return -1;
}

// ── Kompaktes Kennlinien-Objekt für produkt.daten.kennlinie ─────────────
function kennlinieVon(p){
  if(!p||!p.punkte||!p.punkte.length)return null;
  var k=p.kopf||{};
  return {
    quelle:'pruefbericht',
    typ:s(k.typ), datum:s(k.datum), norm:s(k.testnorm),
    drehzahl:k.drehzahl||0,
    tol:p.tol||null,
    qmax:k.qmaxM3h||0, qmin:k.qminM3h||0,
    punkte:p.punkte.map(function(x){
      return {q:rund(x.q,3),h:rund(x.h,3),p1:rund(x.p1,3),eta:rund(x.etaP,1)};
    })
  };
}

// ── Kennwerte aus der Kennlinie ─────────────────────────────────────────
function kenn(p){
  var pts=(p&&p.punkte)||[],k=(p&&p.kopf)||{};
  var hMax=0,qMax=0,p1Max=0,best=null;
  pts.forEach(function(x){
    if(x.h>hMax)hMax=x.h;
    if(x.q>qMax)qMax=x.q;
    if(x.p1>p1Max)p1Max=x.p1;
    if(x.etaP>0&&(!best||x.etaP>best.etaP))best=x;
  });
  if(k.qmaxM3h>qMax)qMax=k.qmaxM3h;
  return {hMax:hMax,qMaxM3h:qMax,qMaxLs:rund(qMax/3.6,2),p1MaxKW:p1Max,nenn:best};
}

// ── Mapping auf die Produkt-Schemas (Einheiten je Kategorie!) ───────────
// zirkulationspumpe: mbar + l/h · heizungspumpe: kPa + m³/h ·
// hebeanlage: m + l/s · druckerhoehung: bar + l/s · saugpumpe: m + m³/h (Nennpunkt)
var PUMPEN_KATEGORIEN=['hebeanlage','zirkulationspumpe','heizungspumpe','druckerhoehung','saugpumpe'];
function zuDaten(p,katId){
  var k=(p&&p.kopf)||{},w=kenn(p),d={};
  // Der Pumpentyp ist im GEMA-Schema die «Serie / Typ» (Pflichtfeld der
  // Produkterfassung) — NICHT modell, sonst stünde er doppelt in der Liste.
  if(k.typ){ d.serie=s(k.typ); }
  if(k.artikelNr)d.artikelnr=s(k.artikelNr);
  var s230=(k.spannungV===230&&k.frequenzHz===50);
  var s400=(k.spannungV===400&&k.frequenzHz===50);
  if(katId==='hebeanlage'){
    d.foerderhoehe=rund(w.hMax,2);              // m
    d.foerdermenge=rund(w.qMaxLs,2);            // l/s
    if(k.p1KW){ d.motorleistung=rund(k.p1KW,2); d.leistung=Math.round(k.p1KW*1000); }
    if(k.laufraddurchgang)d.freikugel=k.laufraddurchgang;
    if(s230)d.spannung='230 V'; else if(s400)d.spannung='400 V';
  }else if(katId==='zirkulationspumpe'){
    d.foerderhoeheMax=Math.round(w.hMax*98.0665);   // m → mbar
    d.volumenstromMax=Math.round(w.qMaxM3h*1000);   // m³/h → l/h
    if(k.p1KW)d.leistungMax=Math.round(k.p1KW*1000);
    if(s230)d.spannung='230V/50Hz'; else if(s400)d.spannung='400V/50Hz';
  }else if(katId==='heizungspumpe'){
    d.foerderhoeheMax=rund(w.hMax*9.80665,1);       // m → kPa
    d.volumenstromMax=rund(w.qMaxM3h,2);            // m³/h
    if(k.p1KW)d.leistungMax=Math.round(k.p1KW*1000);
    if(s230)d.spannung='230V/50Hz'; else if(s400)d.spannung='400V/50Hz';
  }else if(katId==='druckerhoehung'){
    d.druckMax=rund(w.hMax*0.0980665,2);            // m → bar
    d.volumenstromMax=rund(w.qMaxLs,2);             // l/s
    if(k.p1KW)d.motorleistung=rund(k.p1KW,2);
  }else if(katId==='saugpumpe'){
    if(w.nenn){ d.foerdermenge=rund(w.nenn.q,2); d.foerderhoehe=rund(w.nenn.h,2); } // Bestpunkt
    if(k.p1KW)d.motorleistung=rund(k.p1KW,2);
    if(s230)d.spannung='230 V'; else if(s400)d.spannung='400 V';
  }
  var kl=kennlinieVon(p);
  if(kl)d.kennlinie=kl;
  return d;
}

// ── Betriebspunkt aus den Berechnungswerten eines Moduls ────────────────
// (Payload-Einheiten der Anlagenwahl je Kategorie → m³/h + m; h:null =
// nur der Volumenstrom ist bekannt → senkrechte Markierung im Diagramm)
function betriebspunktAus(katId,bw){
  bw=bw||{};
  var q=null,h=null;
  if(katId==='zirkulationspumpe'){
    if(bw.volumenstrom>0)q=bw.volumenstrom/1000;          // l/h → m³/h
    if(bw.foerderhoehe>0)h=bw.foerderhoehe/98.0665;       // mbar → m
  }else if(katId==='heizungspumpe'){
    if(bw.volumenstrom>0)q=bw.volumenstrom;               // m³/h
    if(bw.foerderhoehe>0)h=bw.foerderhoehe/9.80665;       // kPa → m
  }else if(katId==='hebeanlage'){
    if(bw.foerdermenge>0)q=bw.foerdermenge*3.6;           // l/s → m³/h
    if(bw.foerderhoehe>0)h=bw.foerderhoehe;               // m
  }else if(katId==='druckerhoehung'){
    if(bw.volumenstrom>0)q=bw.volumenstrom*3.6;           // l/s → m³/h
  }
  if(q==null&&h==null)return null;
  return {q:q,h:h};
}

// Förderhöhe der Kennlinie bei Q (lineare Interpolation; ausserhalb → null)
function interpoliere(kl,q){
  var pts=(kl&&kl.punkte)||[];
  if(pts.length<2||q==null)return null;
  var a=pts.slice().sort(function(x,y){return x.q-y.q;});
  if(q<a[0].q||q>a[a.length-1].q)return null;
  for(var i=1;i<a.length;i++){
    if(q<=a[i].q){
      var p0=a[i-1],p1=a[i];
      if(p1.q===p0.q)return p0.h;
      return p0.h+(p1.h-p0.h)*(q-p0.q)/(p1.q-p0.q);
    }
  }
  return null;
}

// ── Pumpendiagramm (SVG, Datenblatt-Layout: H-Q + η oben, P1 unten) ─────
function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(v,d){ if(v==null||!isFinite(v))return '–'; return v.toLocaleString('de-CH',{minimumFractionDigits:d==null?2:d,maximumFractionDigits:d==null?2:d}); }
// Achsen-Skala über eine SCHRITTWEITE statt eines gerundeten Maximums —
// nice(11.7) wäre 20 (halbe Zeichenfläche leer), step5 liefert 2.5er-Schritte
// und die Achse endet bei 12.5, dicht an der Kurve.
function step5(v){ if(v<=0)return 1; var roh=v/5,p=Math.pow(10,Math.floor(Math.log(roh)/Math.LN10)),f=roh/p; var n=f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10; return n*p; }
function axMax(v,st){ return Math.max(st,Math.ceil(v/st-1e-9)*st); }
function stDec(st){ if(st>=1)return st%1?1:0; return Math.round(st*10)===st*10?1:2; }
function zeichnen(host,kl,opts){
  if(!host)return null;
  opts=opts||{};
  var pts=((kl&&kl.punkte)||[]).slice().sort(function(a,b){return a.q-b.q;});
  if(pts.length<2){ host.innerHTML='<div style="font-size:12px;color:#6b7280;padding:8px">Keine Kennlinien-Punkte vorhanden.</div>'; return null; }
  var hatP1=pts.some(function(p){return p.p1>0;});
  var hatEta=pts.some(function(p){return p.eta>0;});
  var bp=opts.betriebspunkt||null;
  var qMaxDat=pts[pts.length-1].q, hMaxDat=0, p1MaxDat=0;
  pts.forEach(function(p){ if(p.h>hMaxDat)hMaxDat=p.h; if(p.p1>p1MaxDat)p1MaxDat=p.p1; });
  if(bp&&bp.q!=null&&bp.q>qMaxDat)qMaxDat=bp.q;
  if(bp&&bp.h!=null&&bp.h>hMaxDat)hMaxDat=bp.h;
  var qStep=step5(qMaxDat*1.06), hStep=step5(hMaxDat*1.12), pStep=step5((p1MaxDat||1)*1.25);
  var qA=axMax(qMaxDat*1.06,qStep), hA=axMax(hMaxDat*1.12,hStep), pA=axMax((p1MaxDat||1)*1.25,pStep);
  var W=680,H=hatP1?408:300;
  var padL=52,padR=50;
  var x0=padL,x1=W-padR;
  var t0=26,t1=hatP1?236:244;                 // oberes Panel (H-Q + η)
  var b0=t1+34,b1=H-42;                        // unteres Panel (P1)
  function X(q){ return x0+(q/qA)*(x1-x0); }
  function YH(h){ return t1-(h/hA)*(t1-t0); }
  function YE(e){ return t1-(e/100)*(t1-t0); }
  function YP(p){ return b1-(p/pA)*(b1-b0); }
  var sv='';
  // Raster + Achsen oben (Schrittweiten aus step5 — glatte Labels)
  for(var q=0;q<=qA+1e-9;q+=qStep){
    sv+='<line x1="'+X(q).toFixed(1)+'" y1="'+t0+'" x2="'+X(q).toFixed(1)+'" y2="'+t1+'" stroke="#e2e7f0" stroke-width="1"/>';
    if(hatP1)sv+='<line x1="'+X(q).toFixed(1)+'" y1="'+b0+'" x2="'+X(q).toFixed(1)+'" y2="'+b1+'" stroke="#e2e7f0" stroke-width="1"/>';
    sv+='<text x="'+X(q).toFixed(1)+'" y="'+((hatP1?b1:t1)+16)+'" text-anchor="middle" font-size="10" fill="#6b7280">'+fmt(q,stDec(qStep))+'</text>';
  }
  for(var h=0;h<=hA+1e-9;h+=hStep){
    sv+='<line x1="'+x0+'" y1="'+YH(h).toFixed(1)+'" x2="'+x1+'" y2="'+YH(h).toFixed(1)+'" stroke="#e2e7f0" stroke-width="1"/>';
    sv+='<text x="'+(x0-6)+'" y="'+(YH(h)+3.5).toFixed(1)+'" text-anchor="end" font-size="10" fill="#1d4ed8">'+fmt(h,stDec(hStep))+'</text>';
  }
  if(hatEta)for(var e=0;e<=100;e+=25){
    sv+='<text x="'+(x1+6)+'" y="'+(YE(e)+3.5).toFixed(1)+'" text-anchor="start" font-size="10" fill="#16a34a">'+e+'</text>';
  }
  sv+='<text x="'+x0+'" y="14" font-size="10.5" font-weight="800" fill="#1d4ed8">H [m]</text>';
  if(hatEta)sv+='<text x="'+x1+'" y="14" text-anchor="end" font-size="10.5" font-weight="800" fill="#16a34a">η [%]</text>';
  // Einsatzgrenze Qmax
  if(kl.qmax>0&&kl.qmax<=qA){
    sv+='<line x1="'+X(kl.qmax).toFixed(1)+'" y1="'+t0+'" x2="'+X(kl.qmax).toFixed(1)+'" y2="'+t1+'" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="4 4"/>';
    sv+='<text x="'+(X(kl.qmax)+4).toFixed(1)+'" y="'+(t0+10)+'" font-size="9" fill="#64748b">Q max</text>';
  }
  // Kurven
  function poly(arr,fx,fy){ return arr.map(function(p,i){return (i?'L':'M')+fx(p).toFixed(1)+' '+fy(p).toFixed(1);}).join(' '); }
  sv+='<path d="'+poly(pts,function(p){return X(p.q);},function(p){return YH(p.h);})+'" fill="none" stroke="#1d4ed8" stroke-width="3" stroke-linejoin="round"/>';
  if(hatEta)sv+='<path d="'+poly(pts,function(p){return X(p.q);},function(p){return YE(p.eta);})+'" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="2 4" stroke-linejoin="round"/>';
  pts.forEach(function(p){ sv+='<circle cx="'+X(p.q).toFixed(1)+'" cy="'+YH(p.h).toFixed(1)+'" r="2.6" fill="#1d4ed8"/>'; });
  // Betriebspunkt aus der GEMA-Berechnung
  var info={hBei:null,ok:null};
  if(bp&&bp.q!=null){
    var xq=X(Math.min(bp.q,qA));
    info.hBei=interpoliere(kl,bp.q);
    if(bp.h!=null){
      info.ok=info.hBei!=null?bp.h<=info.hBei+1e-9:false;
      var col=info.ok?'#dc2626':'#b91c1c';
      sv+='<line x1="'+xq.toFixed(1)+'" y1="'+YH(bp.h).toFixed(1)+'" x2="'+xq.toFixed(1)+'" y2="'+t1+'" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="4 3"/>';
      sv+='<line x1="'+x0+'" y1="'+YH(bp.h).toFixed(1)+'" x2="'+xq.toFixed(1)+'" y2="'+YH(bp.h).toFixed(1)+'" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="4 3"/>';
      sv+='<circle cx="'+xq.toFixed(1)+'" cy="'+YH(bp.h).toFixed(1)+'" r="5.5" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>';
      sv+='<text x="'+(xq+8).toFixed(1)+'" y="'+(YH(bp.h)-8).toFixed(1)+'" font-size="10" font-weight="800" fill="'+col+'">Betriebspunkt'+(info.ok?'':' ⚠')+'</text>';
    }else{
      sv+='<line x1="'+xq.toFixed(1)+'" y1="'+t0+'" x2="'+xq.toFixed(1)+'" y2="'+t1+'" stroke="#dc2626" stroke-width="1.6" stroke-dasharray="5 3"/>';
      sv+='<text x="'+(xq+4).toFixed(1)+'" y="'+(t0+22)+'" font-size="9.5" font-weight="700" fill="#dc2626">Q Bedarf</text>';
    }
  }
  // Unteres Panel: P1
  if(hatP1){
    for(var pv=0;pv<=pA+1e-9;pv+=pStep){
      sv+='<line x1="'+x0+'" y1="'+YP(pv).toFixed(1)+'" x2="'+x1+'" y2="'+YP(pv).toFixed(1)+'" stroke="#e2e7f0" stroke-width="1"/>';
      sv+='<text x="'+(x0-6)+'" y="'+(YP(pv)+3.5).toFixed(1)+'" text-anchor="end" font-size="10" fill="#c2410c">'+fmt(pv,stDec(pStep))+'</text>';
    }
    sv+='<text x="'+x0+'" y="'+(b0-8)+'" font-size="10.5" font-weight="800" fill="#c2410c">P1 [kW]</text>';
    sv+='<path d="'+poly(pts,function(p){return X(p.q);},function(p){return YP(p.p1);})+'" fill="none" stroke="#ea580c" stroke-width="2.4" stroke-linejoin="round"/>';
    if(bp&&bp.q!=null&&bp.q<=qA)sv+='<line x1="'+X(bp.q).toFixed(1)+'" y1="'+b0+'" x2="'+X(bp.q).toFixed(1)+'" y2="'+b1+'" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="4 3"/>';
  }
  // Achsen-Titel + Fussnote
  sv+='<text x="'+((x0+x1)/2)+'" y="'+(H-24)+'" text-anchor="middle" font-size="10.5" font-weight="800" fill="#334155">Q [m³/h]</text>';
  var fuss=[];
  if(kl.drehzahl)fuss.push('n = '+fmt(kl.drehzahl,0)+' min⁻¹');
  if(kl.norm)fuss.push(kl.norm);
  if(kl.tol)fuss.push('Toleranz Q±'+fmt(kl.tol.q,0)+' % · H±'+fmt(kl.tol.h,0)+' % · η−'+fmt(kl.tol.eta,1)+' %');
  if(kl.datum)fuss.push('Prüfbericht '+kl.datum);
  sv+='<text x="'+((x0+x1)/2)+'" y="'+(H-8)+'" text-anchor="middle" font-size="9" fill="#94a3b8">'+esc(fuss.join(' · '))+'</text>';
  host.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pumpenkennlinie '+esc(kl.typ||'')+'" style="width:100%;height:auto;display:block">'+sv+'</svg>';
  return info;
}

var api={
  PUMPEN_KATEGORIEN:PUMPEN_KATEGORIEN,
  parse:parse, kennlinieVon:kennlinieVon, kenn:kenn, zuDaten:zuDaten,
  betriebspunktAus:betriebspunktAus, interpoliere:interpoliere, zeichnen:zeichnen,
  _norm:norm, _zahl:zahl
};
if(typeof window!=='undefined')window.GemaPumpenkennlinie=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
