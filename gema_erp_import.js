/* ═══════════════════════════════════════════════════════════════════════
   GEMA — ERP-Migration (window.GemaErpImport)

   Übernimmt die Daten aus einem abzulösenden ERP: pro Abschnitt ein eigener
   Importer (Objekte · Offerten · Aufträge · Rechnungen). Der Ablauf ist für
   alle Abschnitte identisch:

       Datei wählen → Spalten zuordnen → Vorschau prüfen → Übernehmen

   KEIN CDN, KEINE Fremd-Library: der XLSX-Reader parst das ZIP selbst und
   entpackt die Einträge mit dem nativen `DecompressionStream('deflate-raw')`.
   Damit läuft der Import offline und ohne externe Abhängigkeit (dasselbe
   Prinzip wie der ZIP-Writer in gema_storage.js). Fehlt DecompressionStream
   (sehr alter Browser), sagt der Importer das klar und nimmt CSV/TSV.

   KRITISCH — der Import ist IDEMPOTENT: jede Zeile trägt die ID aus dem
   Altsystem (`extId`). Ein zweiter Lauf derselben Datei legt nichts doppelt
   an, sondern ergänzt nur leere Felder. Von Hand gepflegte Werte werden NIE
   überschrieben.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ═══ ENGINE-START ═══ DOM-frei, Node-testbar ═══ */

function s(v){return v==null?'':String(v).trim();}
function norm(v){return s(v).toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,'');}

// ── ZIP / XLSX ──────────────────────────────────────────────────────────
function u16(d,o){return d[o]|(d[o+1]<<8);}
function u32(d,o){return (d[o]|(d[o+1]<<8)|(d[o+2]<<16)|(d[o+3]<<24))>>>0;}

/* Liest das Central Directory eines ZIP und liefert die Einträge.
   Zip64 wird erkannt und mit klarer Meldung abgelehnt (bei Excel-Exports
   dieser Grösse kommt es nicht vor). */
function zipEintraege(bytes){
  var i,eocd=-1;
  var min=Math.max(0,bytes.length-65557);
  for(i=bytes.length-22;i>=min;i--){
    if(bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===0x05&&bytes[i+3]===0x06){eocd=i;break;}
  }
  if(eocd<0)throw new Error('Das ist keine gültige Excel-/ZIP-Datei.');
  var n=u16(bytes,eocd+10), off=u32(bytes,eocd+16);
  if(off===0xFFFFFFFF||n===0xFFFF)throw new Error('ZIP64-Archive werden nicht unterstützt — bitte die Datei in Excel neu speichern.');
  var out=[],p=off;
  for(i=0;i<n;i++){
    if(u32(bytes,p)!==0x02014b50)break;
    var method=u16(bytes,p+10);
    var csize=u32(bytes,p+20), usize=u32(bytes,p+24);
    var fnLen=u16(bytes,p+28), exLen=u16(bytes,p+30), cmLen=u16(bytes,p+32);
    var lho=u32(bytes,p+42);
    var name='';
    for(var j=0;j<fnLen;j++)name+=String.fromCharCode(bytes[p+46+j]);
    try{name=decodeURIComponent(escape(name));}catch(e){}
    out.push({name:name,method:method,csize:csize,usize:usize,lho:lho});
    p+=46+fnLen+exLen+cmLen;
  }
  return out;
}
function zipDaten(bytes,e){
  if(u32(bytes,e.lho)!==0x04034b50)throw new Error('ZIP-Eintrag beschädigt: '+e.name);
  var fnLen=u16(bytes,e.lho+26), exLen=u16(bytes,e.lho+28);
  var start=e.lho+30+fnLen+exLen;
  var raw=bytes.subarray(start,start+e.csize);
  if(e.method===0)return Promise.resolve(raw);
  if(e.method!==8)return Promise.reject(new Error('Unbekannte ZIP-Komprimierung ('+e.method+') in '+e.name));
  if(typeof DecompressionStream==='undefined')
    return Promise.reject(new Error('Dieser Browser kann .xlsx nicht entpacken. Bitte die Datei in Excel als CSV speichern und die CSV hochladen.'));
  var ds=new DecompressionStream('deflate-raw');
  return new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer()
    .then(function(b){return new Uint8Array(b);});
}
function txt(bytes){
  try{return new TextDecoder('utf-8').decode(bytes);}
  catch(e){var out='';for(var i=0;i<bytes.length;i++)out+=String.fromCharCode(bytes[i]);return out;}
}

/* Excel kodiert Steuerzeichen als _xXXXX_ (z.B. _x000D_ = CR). */
function entescape(t){
  return s(t).replace(/_x([0-9A-Fa-f]{4})_/g,function(m,h){
    return String.fromCharCode(parseInt(h,16));
  });
}

/* Excel-Seriennummer → ISO-Datum. Der 1900-Schaltjahr-Fehler ist über den
   Anker 1899-12-30 bereits eingerechnet. */
function serialZuDatum(n){
  if(!isFinite(n)||n<=0||n>2958465)return '';
  var ms=Math.round((n-25569)*86400000);
  var d=new Date(ms);
  if(isNaN(d.getTime()))return '';
  var p=function(x){return (x<10?'0':'')+x;};
  return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate());
}
/* Ist die Zahlenformat-Definition ein Datum? (eingebaute IDs + Muster) */
function istDatumFmt(id,code){
  id=parseInt(id,10)||0;
  if((id>=14&&id<=22)||(id>=45&&id<=47))return true;
  if(!code)return false;
  var c=String(code).replace(/\[[^\]]*\]/g,'').replace(/"[^"]*"/g,'');
  return /[ymdhs]/i.test(c)&&!/^[#0.,%\s]*$/.test(c);
}

/* Datum aus einem Export: dd.mm.yyyy / dd-mm-yyyy / yyyy-mm-dd / Excel-Serial
   → ISO (yyyy-mm-dd). Leer/unlesbar → ''. */
function parseDatum(v){
  var t=s(v);if(!t)return '';
  var m=/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/.exec(t);
  if(m){
    var j=parseInt(m[3],10); if(j<100)j+=(j<70?2000:1900);
    var p=function(x){return (x<10?'0':'')+x;};
    return j+'-'+p(parseInt(m[2],10))+'-'+p(parseInt(m[1],10));
  }
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)){
    var a=t.split('-');
    return a[0]+'-'+(a[1].length<2?'0':'')+a[1]+'-'+(a[2].length<2?'0':'')+a[2];
  }
  if(/^\d{1,6}(\.\d+)?$/.test(t))return serialZuDatum(parseFloat(t));
  return '';
}
/* Betrag: akzeptiert 1'234.50 · 1,234.50 · 1.234,50 · 1234.5 → Number.
   Die Entscheidung, ob «.» oder «,» das Dezimaltrennzeichen ist, fällt über
   das ZULETZT auftretende Zeichen (so lesen es auch Excel-Exporte). */
function parseBetrag(v){
  var t=s(v).replace(/[\u2019\u02bc\u00a0\s']/g,'').replace(/(CHF|Fr\.?)/gi,'');
  if(!t)return null;
  var k=t.lastIndexOf(','), pt=t.lastIndexOf('.');
  if(k>=0&&pt>=0){ t=(k>pt)?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,''); }
  else if(k>=0){ t=(t.length-k-1===3&&!/^\-?\d{1,3},\d{3}$/.test(t))?t.replace(/,/g,''):t.replace(',','.'); }
  var n=parseFloat(t);
  return isFinite(n)?n:null;
}

/* Offert-Status des Altsystems → GEMA-Status.
   Unbekannte Werte landen auf «versendet» und werden in der Vorschau als
   Hinweis ausgewiesen — nie still auf einen falschen Status gezwungen. */
var OFFERT_STATUS=[
  {re:/^(zuschlag|auftrag|angenommen|gewonnen|erteilt)/i,   status:'angenommen'},
  {re:/^(absage|abgelehnt|verloren|storno|annulliert)/i,    status:'abgelehnt'},
  {re:/^(offen|pendent|offeriert|versendet|verschickt|gesendet)/i, status:'versendet'},
  {re:/^(entwurf|erfassung|in\s*arbeit)/i,                  status:'entwurf'}
];
function offertStatus(text){
  var t=s(text);
  if(!t)return {status:'versendet',erkannt:false};
  var hit=OFFERT_STATUS.find(function(x){return x.re.test(t);});
  return hit?{status:hit.status,erkannt:true}:{status:'versendet',erkannt:false};
}

/* Auftrags-Status des Altsystems → GEMA (offen | in_arbeit | abgeschlossen).

   KRITISCH — die REIHENFOLGE der Regeln entscheidet: «Nicht begonnen» enthält
   das Wort «begonnen» und liefe sonst in die in_arbeit-Regel. Der Originaltext
   bleibt am Beleg erhalten (`importStatusText`), damit nichts verloren geht;
   unbekannte Werte landen auf «offen» und werden in der Vorschau gemeldet. */
var AUFTRAG_STATUS=[
  {re:/nicht\s*(begonnen|gestartet|angefangen)|^\s*(offen|neu|erfasst|geplant|pendent|bereit)/i, status:'offen'},
  {re:/erledigt|abgeschlossen|beendet|fertig|abgerechnet|verrechnet|storniert|annulliert|abgebrochen/i, status:'abgeschlossen'},
  {re:/in\s*arbeit|angefangen|begonnen|laufend|unterwegs|ausf(ü|ue)hrung|teilweise/i, status:'in_arbeit'}
];
function auftragStatus(text){
  var t=s(text);
  if(!t)return {status:'offen',erkannt:false};
  var hit=AUFTRAG_STATUS.find(function(x){return x.re.test(t);});
  return hit?{status:hit.status,erkannt:true}:{status:'offen',erkannt:false};
}

/* Rechnungs-Bearbeitungsstatus des Altsystems → GEMA
   (entwurf | gestellt | bezahlt | storniert).

   Der Export führt KEINE Zahlungsinformation — «Versandt» heisst gestellt,
   nicht bezahlt. Ein Beleg mit Nummer und ESR-Referenz ist ausgestellt,
   darum ist «gestellt» auch der Default für Unbekanntes (mit Hinweis). */
var RECHNUNG_STATUS=[
  {re:/^\s*(entwurf|erfasst|in\s*bearbeitung|nicht\s*versandt|vorbereitet)/i, status:'entwurf'},
  {re:/storniert|annulliert|gutgeschrieben|gutschrift/i,                      status:'storniert'},
  {re:/bezahlt|beglichen|ausgeglichen|saldiert/i,                             status:'bezahlt'},
  {re:/versandt|verschickt|gedruckt|gestellt|gemahnt|mahnung|offen/i,          status:'gestellt'}
];
function rechnungStatus(text){
  var t=s(text);
  if(!t)return {status:'gestellt',erkannt:false};
  var hit=RECHNUNG_STATUS.find(function(x){return x.re.test(t);});
  return hit?{status:hit.status,erkannt:true}:{status:'gestellt',erkannt:false};
}

/* Rechnungs-TYP des Altsystems → GEMA `rechnungsArt`.
   KRITISCH — die importierte Schlussrechnung trägt den TATSÄCHLICH
   fakturierten Betrag; `erpSchlussPositionen` (Auftragspositionen minus
   Akonti) darf beim Import NIE laufen, sonst würde der Beleg neu gerechnet. */
var RECHNUNG_ART=[
  {re:/schluss|final|end(ab)?rechnung/i,               art:'schluss'},
  {re:/akonto|abschlag|anzahlung|vorauszahlung/i,      art:'akonto'},
  {re:/teil(rechnung|betrag)?|zwischenrechnung/i,      art:'teil'},
  {re:/gutschrift|storno/i,                            art:'einzel'}
];
function rechnungArt(text){
  var t=s(text);
  if(!t)return {art:'einzel',erkannt:false};
  var hit=RECHNUNG_ART.find(function(x){return x.re.test(t);});
  return hit?{art:hit.art,erkannt:true}:{art:'einzel',erkannt:false};
}

/* Gültige 27-stellige ESR-/QR-Referenz? (Mod10 rekursiv, wie erpMod10)
   Nur eine gültige Referenz darf in den QR-Code eines Nachdrucks — sonst
   entstünde ein unbezahlbarer Einzahlungsschein. */
function mod10(ref){
  var tab=[0,9,4,6,8,2,7,1,3,5],c=0;
  String(ref).replace(/\D/g,'').split('').forEach(function(z){c=tab[(c+parseInt(z,10))%10];});
  return (10-c)%10;
}
function esrGueltig(ref){
  var d=String(ref||'').replace(/\D/g,'');
  return d.length===27&&mod10(d.slice(0,26))===parseInt(d.slice(26),10);
}
/* Tage zur Zahlungsfrist. Belegt ist einzig «01» = 30 Tage netto aus dem
   Beispiel-Export; alles andere fällt bewusst auf den Firmen-Standard
   zurück, statt eine Zuordnung zu erfinden. */
/* ISO-Datum + n Tage → ISO-Datum (UTC-Arithmetik, sommerzeit-fest). */
function addTage(iso,tage){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s(iso));
  if(!m)return s(iso);
  var d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
  d.setUTCDate(d.getUTCDate()+(parseInt(tage,10)||0));
  return d.toISOString().slice(0,10);
}
/* Kürzel → Tage, gefüllt vom Import der Zahlungsbedingungen (Sektion
   «zahlbed»). Solange sie fehlen, bleibt es beim bisherigen Verhalten. */
var _zahlbedTage={};
function zahlbedTageSetzen(map){_zahlbedTage=map||{};}
function fristTage(zahlbed,standard){
  var t=s(zahlbed);
  var m=/(\d+)\s*tag/i.exec(t);
  if(m)return parseInt(m[1],10);
  // KRITISCH — die Kürzel sind Strings mit führender Null: «00» ist im
  // Altsystem «60 Tage netto», nicht «leer». Der Vergleich läuft deshalb über
  // den STRING; ein parseInt('00') ergäbe 0 und fiele still auf den Standard.
  if(t&&_zahlbedTage[t]!=null)return _zahlbedTage[t];
  if(/^0*1$/.test(t))return 30;
  return standard;
}

/* Prozentwerte des Altsystems sind FLOAT und krumm gespeichert — 3 % steht als
   2.9999999329447746, 4 % als 3.999999910593033. Ohne Rundung zeigte GEMA
   «2.9999999 %». */
function pct(v){
  var n=parseBetrag(v);
  return n==null?null:Math.round(n*100)/100;
}

/* `postyp` des Altsystems → GEMA-Positionsart.

   Die Zuordnung ist am Bestand GEMESSEN, nicht geraten: je Typ wurde
   ausgewertet, ob die Zeilen Menge, Preis, Einheit und NPK-Bezug tragen und ob
   sie Unterpositionen sind (Herleitung in KONZEPT_ERP_Migration_Altsystem.md).

     9 · 10          kein Preis, kurze Texte, oft oberste Ebene → Titel
     19 · 20         kein Preis, praktisch immer mit Parent      → Text
     27              Preis OHNE Menge, immer oberste Ebene       → Zuschlag
     11 21 26 12 …   Menge + Preis + Einheit                     → Position

   Unbekannte Typen werden NICHT geraten: dann entscheidet die Struktur der
   Zeile, und die Vorschau meldet es (`erkannt:false`). */
var POSTYP_ART={
  '9':'titel','10':'titel','19':'text','20':'text','27':'zuschlag',
  '11':'frei','12':'frei','13':'frei','15':'frei','16':'frei',
  '21':'frei','22':'frei','25':'frei','26':'frei'
};
var POS_ART_TEXT=[
  {re:/^(titel|title|kapitel|(ü|ue)berschrift)/i,   art:'titel'},
  {re:/^(text|bemerk|hinweis|beschrieb)/i,          art:'text'},
  {re:/^(rabatt|abzug|nachlass)/i,                  art:'rabatt'},
  {re:/^(zuschlag|pauschal|regie)/i,                art:'zuschlag'},
  {re:/^(frei|position|artikel|leistung|normal)/i,  art:'frei'}
];
function posArt(roh,zeile){
  var t=s(roh);
  if(POSTYP_ART[t])return {art:POSTYP_ART[t],erkannt:true};
  var hit=POS_ART_TEXT.find(function(x){return x.re.test(t);});
  if(hit)return {art:hit.art,erkannt:true};
  var hatPreis=!!(zeile&&((zeile.ep!=null&&zeile.ep!==0)||(zeile.total!=null&&zeile.total!==0)));
  var hatMenge=!!(zeile&&zeile.menge!=null&&zeile.menge!==0);
  return {art:(hatPreis||hatMenge)?'frei':'text',erkannt:false};
}

/* Trägt der Beleg nur die beim Kopf-Import erzeugte Sammelposition?

   Nur dann darf der Positions-Import sie ersetzen. Ein von Hand erfasstes oder
   bereits vollständig importiertes Leistungsverzeichnis bleibt IMMER
   unangetastet — sonst wüsste niemand mehr, welche Zahlen gelten.
   Neu erzeugte Sammelpositionen tragen dafür ein Kennzeichen; Belege aus
   früheren Importläufen werden über Beschriftung plus `importSumme` erkannt. */
function istSammelposition(doc){
  var p=(doc&&doc.positionen)||[];
  if(p.length!==1)return false;
  if(p[0]&&p[0].importSammel)return true;
  return !!(doc&&doc.importSumme)&&/^(Ü|U)bernahme aus dem Altsystem/.test(s(p[0]&&p[0].bez));
}

/* Kreditoren-Status des Altsystems → GEMA
   (offen | freigegeben | zurueckgewiesen | bezahlt).
   REIHENFOLGE beachten: «zurückgewiesen» enthält kein Wort der anderen Regeln,
   «bezahlt» muss aber vor «freigegeben» greifen — ein bezahlter Kreditor ist
   immer auch freigegeben, der spätere Zustand gewinnt. */
var KRED_STATUS=[
  {re:/zur(ü|ue)ckgewiesen|abgelehnt|retour|storniert/i,     status:'zurueckgewiesen'},
  {re:/bezahlt|beglichen|ausgeglichen|saldiert|vergütet/i,   status:'bezahlt'},
  {re:/freigegeben|kontrolliert|gepr(ü|ue)ft|visiert|ok/i,   status:'freigegeben'},
  {re:/offen|neu|erfasst|pendent|zur\s*freigabe|eingang/i,   status:'offen'}
];
function kreditorStatus(text){
  var t=s(text);
  if(!t)return {status:'offen',erkannt:false};
  var hit=KRED_STATUS.find(function(x){return x.re.test(t);});
  return hit?{status:hit.status,erkannt:true}:{status:'offen',erkannt:false};
}

function spalteZuIndex(ref){
  var m=/^([A-Z]+)/.exec(ref||'');if(!m)return 0;
  var n=0,t=m[1];
  for(var i=0;i<t.length;i++)n=n*26+(t.charCodeAt(i)-64);
  return n-1;
}

/* Parst eine .xlsx-Datei (ArrayBuffer) → {sheets:[{name,rows:[[string]]}]} */
function leseXlsx(buf){
  var bytes=new Uint8Array(buf);
  var eintraege;
  try{eintraege=zipEintraege(bytes);}catch(e){return Promise.reject(e);}
  var map={};
  eintraege.forEach(function(e){map[e.name.replace(/^\/+/,'')]=e;});
  function hole(name){
    var e=map[name];
    if(!e)return Promise.resolve('');
    return zipDaten(bytes,e).then(txt);
  }
  var dom=new DOMParser();
  var shared=[],dateXf=[];
  return hole('xl/sharedStrings.xml').then(function(x){
    if(x){
      var d=dom.parseFromString(x,'application/xml');
      var sis=d.getElementsByTagName('si');
      for(var i=0;i<sis.length;i++){
        var ts=sis[i].getElementsByTagName('t'),v='';
        for(var j=0;j<ts.length;j++)v+=ts[j].textContent||'';
        shared.push(entescape(v));
      }
    }
    return hole('xl/styles.xml');
  }).then(function(x){
    if(x){
      var d=dom.parseFromString(x,'application/xml');
      var codes={};
      var nf=d.getElementsByTagName('numFmt');
      for(var i=0;i<nf.length;i++)codes[nf[i].getAttribute('numFmtId')]=nf[i].getAttribute('formatCode');
      var cx=d.getElementsByTagName('cellXfs')[0];
      if(cx){
        var xfs=cx.getElementsByTagName('xf');
        for(var k=0;k<xfs.length;k++){
          var id=xfs[k].getAttribute('numFmtId')||'0';
          dateXf.push(istDatumFmt(id,codes[id]));
        }
      }
    }
    return hole('xl/workbook.xml');
  }).then(function(wbx){
    var namen=[],rids=[];
    if(wbx){
      var d=dom.parseFromString(wbx,'application/xml');
      var sh=d.getElementsByTagName('sheet');
      for(var i=0;i<sh.length;i++){
        namen.push(sh[i].getAttribute('name')||('Tabelle'+(i+1)));
        rids.push(sh[i].getAttribute('r:id')||sh[i].getAttribute('id')||'');
      }
    }
    return hole('xl/_rels/workbook.xml.rels').then(function(rx){
      var ziel={};
      if(rx){
        var d2=dom.parseFromString(rx,'application/xml');
        var rs=d2.getElementsByTagName('Relationship');
        for(var i=0;i<rs.length;i++)ziel[rs[i].getAttribute('Id')]=rs[i].getAttribute('Target');
      }
      var pfade=namen.map(function(_,i){
        var t=ziel[rids[i]]||('worksheets/sheet'+(i+1)+'.xml');
        t=String(t).replace(/^\/?xl\//,'').replace(/^\//,'');
        return 'xl/'+t;
      });
      return {namen:namen,pfade:pfade};
    });
  }).then(function(info){
    var sheets=[];
    var kette=Promise.resolve();
    info.pfade.forEach(function(pfad,i){
      kette=kette.then(function(){
        return hole(pfad).then(function(x){
          if(!x){
            // Fallback: erstes vorhandenes worksheet
            var alt=Object.keys(map).filter(function(k){return /^xl\/worksheets\/sheet\d+\.xml$/.test(k);}).sort()[i];
            if(!alt)return;
            return hole(alt).then(function(y){if(y)sheets.push(blattZuZeilen(dom,y,shared,dateXf,info.namen[i]));});
          }
          sheets.push(blattZuZeilen(dom,x,shared,dateXf,info.namen[i]));
        });
      });
    });
    return kette.then(function(){return {typ:'xlsx',sheets:sheets};});
  });
}
function blattZuZeilen(dom,xml,shared,dateXf,name){
  var d=dom.parseFromString(xml,'application/xml');
  var rows=[],rs=d.getElementsByTagName('row');
  for(var i=0;i<rs.length;i++){
    var cs=rs[i].getElementsByTagName('c'),zeile=[];
    for(var j=0;j<cs.length;j++){
      var c=cs[j],idx=spalteZuIndex(c.getAttribute('r')),t=c.getAttribute('t'),val='';
      var isEl=c.getElementsByTagName('is')[0];
      var vEl=c.getElementsByTagName('v')[0];
      if(t==='s'&&vEl){val=shared[parseInt(vEl.textContent,10)]||'';}
      else if(t==='inlineStr'&&isEl){
        var ts=isEl.getElementsByTagName('t');
        for(var k=0;k<ts.length;k++)val+=ts[k].textContent||'';
        val=entescape(val);
      }
      else if(vEl){
        val=vEl.textContent||'';
        if(t!=='str'&&t!=='b'&&t!=='e'){
          var sIdx=parseInt(c.getAttribute('s')||'0',10);
          if(dateXf[sIdx]&&/^-?\d+(\.\d+)?$/.test(val)){
            var iso=serialZuDatum(parseFloat(val));
            if(iso)val=iso;
          }
        }
      }
      while(zeile.length<idx)zeile.push('');
      zeile[idx]=s(val);
    }
    rows.push(zeile);
  }
  return {name:name||'Tabelle',rows:rows};
}

/* CSV/TSV — Trennzeichen-Erkennung, Quotes, "" als Escape. */
function parseCsv(text){
  text=String(text||'').replace(/^﻿/,'');
  var kand=[';','\t',',','|'],best=';',bestN=-1;
  var probe=text.split(/\r?\n/).slice(0,5).join('\n');
  kand.forEach(function(d){
    var n=probe.split(d).length;
    if(n>bestN){bestN=n;best=d;}
  });
  var rows=[],row=[],cur='',q=false;
  for(var i=0;i<text.length;i++){
    var ch=text[i];
    if(q){
      if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}
      else cur+=ch;
    }else{
      if(ch==='"')q=true;
      else if(ch===best){row.push(cur);cur='';}
      else if(ch==='\n'){row.push(cur);rows.push(row);row=[];cur='';}
      else if(ch==='\r'){/* skip */}
      else cur+=ch;
    }
  }
  if(cur!==''||row.length){row.push(cur);rows.push(row);}
  rows=rows.filter(function(r){return r.some(function(c){return s(c);});});
  return {typ:'csv',sheets:[{name:'CSV',rows:rows.map(function(r){return r.map(s);})}]};
}

// ── Anschrift-Block parsen ──────────────────────────────────────────────
/* Der Export legt die Adressen als Freitext-Block ab:

       Zahlbar durch:
       Immobilien Basel-Stadt
       Hellring 7
       4125 Riehen

   Mehrere Blöcke (Zahlbar durch / Korrespondenzadresse / Eigentümer) stehen
   hintereinander. Erkennung der Slots über die Label-Zeile; die Adresse wird
   von UNTEN gelesen (letzte Zeile = «PLZ Ort», darüber Strasse, Rest = Name).
   Das ist robuster als von oben, weil die Anzahl Namenszeilen schwankt. */
var BLOCK_LABEL=[
  {slot:'zahler',        re:/^(zahlbar\s*durch|rechnungsadresse|rechnung\s*an|zahler)\s*:?\s*$/i},
  {slot:'korrespondenz', re:/^(korrespondenz(adresse)?|c\/o|zustelladresse|versandadresse)\s*:?\s*$/i},
  {slot:'eigentuemer',   re:/^(eigent(ü|ue)mer(schaft)?|besitzer)\s*:?\s*$/i}
];
function parseAdressBlock(zeilen){
  var l=(zeilen||[]).map(s).filter(Boolean);
  var out={firma:'',kontakt:'',strasse:'',strasse2:'',plz:'',ort:''};
  if(!l.length)return out;
  var last=l[l.length-1];
  var m=/^([A-Z]{0,3}[- ]?\d{4,6})\s+(.+)$/.exec(last);
  if(m){out.plz=s(m[1]);out.ort=s(m[2]);l.pop();}
  // Postfach zuerst abtrennen: steht es zwischen Strasse und PLZ, wäre es
  // sonst als «Strasse» gelesen worden und die echte Strasse landete im
  // Kontaktfeld (kommt im Auftrags-Export real vor).
  var pf='';
  if(l.length&&/^(postfach|case\s*postale|casella\s*postale|p\.?\s?o\.?\s?box)\b/i.test(l[l.length-1]))pf=l.pop();
  if(l.length){
    var cand=l[l.length-1];
    // Eine Strasse trägt praktisch immer eine Hausnummer. Ohne Ziffer wird
    // die Zeile nur dann zur Strasse, wenn es kein Postfach gibt und noch
    // eine weitere Zeile übrig bleibt (sonst schluckte sie z.B. «c/o …»).
    if(/\d/.test(cand)||(!pf&&l.length>1)){out.strasse=cand;l.pop();}
  }
  // Nur-Postfach-Adresse: das Postfach IST die Zustellzeile.
  if(pf){ if(out.strasse)out.strasse2=pf; else out.strasse=pf; }
  if(l.length){out.firma=l[0];}
  if(l.length>1)out.kontakt=l.slice(1).join(', ');
  return out;
}
function parseAnschrift(text){
  var raw=entescape(text).replace(/\r/g,'\n');
  var lines=raw.split('\n').map(s);
  var bloecke={},aktuell=null,puffer=[];
  function schliessen(){
    if(aktuell&&puffer.length)bloecke[aktuell]=parseAdressBlock(puffer);
    puffer=[];
  }
  lines.forEach(function(z){
    if(!z){return;}
    var lab=BLOCK_LABEL.find(function(b){return b.re.test(z);});
    if(lab){schliessen();aktuell=lab.slot;return;}
    // Label mit Inhalt auf derselben Zeile («Zahlbar durch: Muster AG»)
    var mm=/^([^:]{3,30}):\s*(.+)$/.exec(z);
    if(mm){
      var lab2=BLOCK_LABEL.find(function(b){return b.re.test(mm[1]+':');});
      if(lab2){schliessen();aktuell=lab2.slot;puffer.push(mm[2]);return;}
    }
    if(!aktuell)aktuell='zahler';
    puffer.push(z);
  });
  schliessen();
  return bloecke;
}

// ── Abschnitte (pro Bereich ein eigener Importer) ────────────────────────
/* Jedes Feld: {id, label, hint?, pflicht?, alias:[…]}
   `alias` sind normalisierte Spaltenüberschriften (norm()), über die die
   Zuordnung automatisch erkannt wird. */
var SEKTIONEN=[
{
  id:'objekte', label:'Objekte / Liegenschaften', ic:'🏢', bereit:true,
  info:'Bauobjekte mit Adresse, den drei Adress-Slots (Zahlbar durch · Korrespondenz · Eigentümer) und den Bezugspersonen. Fehlende Adressen werden automatisch im Adressstamm angelegt.',
  felder:[
    {id:'extId',      label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten)', alias:['id','objektid','objektnr','objektnummer','nr','nummer']},
    {id:'strasse',    label:'Strasse / Nr.', pflicht:true, alias:['strasse','str','adresse','strassenr','strassehausnr']},
    {id:'strasse2',   label:'Adresszusatz', alias:['strasse2','adresszusatz','zusatz','adresse2']},
    {id:'plz',        label:'PLZ', alias:['plz','postleitzahl','zip']},
    {id:'ort',        label:'Ort', alias:['ort','stadt','gemeinde','city']},
    {id:'egid',       label:'EGID', hint:'Eidg. Gebäudeidentifikator', alias:['egid','gebaeudeid']},
    {id:'egrid',      label:'EGRID', hint:'Eidg. Grundstücksidentifikator', alias:['egrid','grundstueckid']},
    {id:'zahlerNr',   label:'Kunden-Nr. «Zahlbar durch»', alias:['knummer','kundennummer','kdnr','kundennr','zahlernr','debitor','debitornr']},
    {id:'korrNr',     label:'Kunden-Nr. Korrespondenz', alias:['coknummer','konummer','korrnummer','korrespondenznr']},
    {id:'eigNr',      label:'Kunden-Nr. Eigentümer', alias:['eiknummer','eignummer','eigentuemernr']},
    {id:'zahlerName', label:'Name der Hauptadresse', alias:['korrname','name','kundename','kunde','firma','adressname']},
    {id:'anschrift',  label:'Anschrift-Block (Freitext)', hint:'Wird automatisch in die drei Slots zerlegt', alias:['anschrift','adressblock','adressen','anschriften']},
    {id:'kp1Name',    label:'Bezugsperson 1 — Name', alias:['name1','kontaktname','ansprechpartner','bezugsperson']},
    {id:'kp1Vorname', label:'Bezugsperson 1 — Vorname', alias:['vorname','kontaktvorname','vorname1']},
    {id:'kp1Typ',     label:'Bezugsperson 1 — Typ', alias:['typ1','rolle1','kontakttyp']},
    {id:'kp1Tel',     label:'Bezugsperson 1 — Telefon', alias:['telefon1','tel1','telefon']},
    {id:'kp1Email',   label:'Bezugsperson 1 — E-Mail', alias:['email1','mail1','email']},
    {id:'kp2Name',    label:'Bezugsperson 2 — Name', alias:['name11','name2','kontaktname2']},
    // «vorname1» steht bewusst AUCH hier: der Export nennt die zweite Person
    // `vorname_1` (→ vorname1). Feld-Reihenfolge entscheidet — Bezugsperson 1
    // greift im Exakt-Durchgang zuerst auf die Spalte `vorname` zu.
    {id:'kp2Vorname', label:'Bezugsperson 2 — Vorname', alias:['vorname11','vorname2','vorname1']},
    {id:'kp2Typ',     label:'Bezugsperson 2 — Typ', alias:['typ2','rolle2']},
    {id:'kp2Tel',     label:'Bezugsperson 2 — Telefon', alias:['telefon2','tel2']},
    {id:'kp2Email',   label:'Bezugsperson 2 — E-Mail', alias:['email2','mail2']},
    {id:'monteur',    label:'Monteur', alias:['monteur','verantwortlich']},
    {id:'sachb',      label:'Sachbearbeiter', alias:['sachb','sachbearbeiter','sb']},
    {id:'ref1',       label:'Externe Referenz 1', alias:['ref1','referenz1','externeref1']},
    {id:'ref2',       label:'Externe Referenz 2', alias:['ref2','referenz2','externeref2']},
    {id:'notiz',      label:'Bemerkungen', alias:['bemerkung','bemerkungen','notiz','notizen']}
  ]
},
{
  id:'adressen', label:'Adressen / Kunden', ic:'👥', bereit:true,
  info:'Der reine Adressstamm (Kundennummer, Firma, Kontaktperson, Adresse, Typ). Optional — beim Objekt-Import entstehen die Adressen ohnehin automatisch; dieser Import ergänzt sie um die vollständigen Stammdaten.',
  felder:[
    {id:'nr',       label:'Kundennummer', hint:'Verknüpft die Adresse mit den Objekten', alias:['knummer','kundennummer','kdnr','kundennr','nr','nummer','id']},
    {id:'firma',    label:'Firma / Name', pflicht:true, alias:['firma','name','name1','kunde','adressname','bezeichnung']},
    {id:'anrede',   label:'Anrede', alias:['anrede','titel']},
    {id:'vorname',  label:'Vorname', alias:['vorname']},
    {id:'name',     label:'Nachname', alias:['nachname','name2','familienname']},
    {id:'kontakt',  label:'Kontaktperson', alias:['kontakt','kontaktperson','ansprechpartner','zhd']},
    {id:'typen',    label:'Typ(en)', hint:'Mehrere durch Komma getrennt', alias:['typ','typen','rolle','kategorie','art']},
    {id:'strasse',  label:'Strasse / Nr.', alias:['strasse','str','adresse']},
    {id:'strasse2', label:'Adresszusatz', alias:['strasse2','adresszusatz','zusatz']},
    {id:'plz',      label:'PLZ', alias:['plz','postleitzahl']},
    {id:'ort',      label:'Ort', alias:['ort','stadt']},
    {id:'land',     label:'Land', alias:['land','country']},
    {id:'tel',      label:'Telefon', alias:['telefon','tel','festnetz']},
    {id:'natel',    label:'Natel / Mobile', alias:['natel','mobile','handy','mobil']},
    {id:'email',    label:'E-Mail', alias:['email','mail','emailadresse']},
    {id:'wohnung',  label:'Wohnung', alias:['wohnung','stockwerk']},
    {id:'bemerkungen',label:'Bemerkungen', alias:['bemerkung','bemerkungen','notiz','notizen']},
    // Konditionen und Fibu-Schlüssel: additive Felder am Adressdatensatz.
    // `zahlbedId` liest pm_erp bereits (es setzt die Frist am neuen Beleg),
    // die übrigen bleiben Vermerke für eine spätere Fibu-Anbindung.
    {id:'zahlbedKuerzel',label:'Zahlungsbedingung (Kürzel)', hint:'«01», «02» … — wirkt erst, wenn die Konditionen importiert sind', alias:['zahlbedid','zahlungsbedingung','paymenttermid']},
    {id:'stdRabatt', label:'Standard-Rabatt %', alias:['stdrabatt','kundenrabatt']},
    {id:'stdSkonto', label:'Standard-Skonto %', alias:['stdskonto']},
    {id:'pkDebi',    label:'Debitorenkonto (Fibu)', hint:'Schlüssel der Fibu-Anbindung — wandert als Vermerk mit', alias:['pkdebi','debitorenkonto','personenkonto']},
    {id:'pkKredi',   label:'Kreditorenkonto (Fibu)', alias:['pkkredi','kreditorenkonto']},
    {id:'eBillId',   label:'eBill-ID', alias:['ebillid','ebill']},
    {id:'rechnungEmail',label:'E-Mail für Rechnungen', alias:['rechnungemail','rechnungsemail','invoiceemail']}
  ]
},
{
  id:'offerten', label:'Offerten', ic:'📄', bereit:true,
  info:'Offert-Kopfdaten mit Betrag, Status, Sachbearbeiter und Abteilung. Kunde und Objekt werden automatisch verknüpft (fehlende werden angelegt). Enthält der Export keine Positionen, entsteht eine Sammelposition mit der Offertsumme.',
  felder:[
    {id:'extId',      label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten)', alias:['id','offertid','offerteid']},
    {id:'nr',         label:'Offert-Nr.', pflicht:true, alias:['offertnr','offertnummer','nummer','nr','belegnr']},
    {id:'datum',      label:'Offertdatum', alias:['datum','offertdatum','erstelltam']},
    {id:'gueltigBis', label:'Gültig bis', hint:'Im Beispiel-Export «rdatum» — bitte kontrollieren', alias:['rdatum','gueltigbis','gueltig','validbis']},
    {id:'titel',      label:'Projekt / Betreff', alias:['betrmemo','betreff','projekt','memo','bezeichnung','titel']},
    {id:'status',     label:'Status im Altsystem', hint:'z.B. Zuschlag / Absage / Offen', alias:['typtext','status','offertstatus','zustand']},
    {id:'nettoBetrag',label:'Betrag exkl. MwSt', hint:'Massgebend für die Sammelposition', alias:['exmwstbetrag','nettobetrag','netto','betragexklmwst']},
    {id:'mwstBetrag', label:'MwSt-Betrag', hint:'Daraus wird der MwSt-Satz je Beleg gerechnet', alias:['mwstbetrag','mwst','mehrwertsteuer']},
    {id:'bruttoBetrag',label:'Betrag inkl. MwSt', alias:['obetrag','bruttobetrag','brutto','total','betrag']},
    {id:'kundeName',  label:'Kunde / Firma', alias:['name1','korrname','kunde','firma','adressname']},
    {id:'kundeNr',    label:'Kunden-Nr.', alias:['knummer','kundennummer','kdnr','kundennr','debitor']},
    {id:'anschrift',  label:'Anschrift-Block (Freitext)', hint:'Rechnungsadresse — wird automatisch zerlegt', alias:['anschrift','adressblock','rechnungsadresse']},
    {id:'anrede',     label:'Briefanrede', alias:['banrede','anrede','briefanrede']},
    {id:'sachb',      label:'Sachbearbeiter', hint:'Wird über den Namen einer Person der Firma zugeordnet', alias:['sachbname','sachbearbeiter','sachb','sb','bearbeiter']},
    {id:'abteilung',  label:'Abteilung', hint:'Wird zum GEMA-Arbeitsbereich (Sanitär, Spenglerei …)', alias:['abtname','abteilung','bereich','gewerk','sparte']},
    {id:'strasse',    label:'Objekt: Strasse / Nr.', hint:'Verknüpft die Offerte mit dem Objekt', alias:['strasse','str','objektstrasse']},
    {id:'strasse2',   label:'Objekt: Adresszusatz', alias:['strasse2','adresszusatz','zusatz']},
    {id:'plz',        label:'Objekt: PLZ', alias:['plz','postleitzahl']},
    {id:'ort',        label:'Objekt: Ort', alias:['ort','stadt']},
    {id:'egid',       label:'Objekt: EGID', alias:['egid']},
    {id:'egrid',      label:'Objekt: EGRID', alias:['egrid']},
    {id:'ref1',       label:'Externe Referenz 1', alias:['rapportnr','ref1','referenz1']},
    {id:'ref2',       label:'Externe Referenz 2', alias:['ref2','referenz2']},
    {id:'wohnung',    label:'Wohnung / Standort', alias:['wohnung','wohnstandort','stockwerk']}
  ]
},
{
  id:'auftraege', label:'Aufträge', ic:'📋', bereit:true,
  info:'Auftrags-Kopfdaten mit Status, Schlüssel/Zutritt und den Verknüpfungen zu Offerte und Rechnung. Kunde und Objekt werden automatisch verknüpft. Der Export führt keine Beträge — auf Wunsch werden die Positionen der verknüpften Offerte übernommen.',
  felder:[
    {id:'extId',      label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten)', alias:['id','auftragid','auftragsid']},
    {id:'nr',         label:'Auftrags-Nr.', pflicht:true, hint:'Im Beispiel-Export «rapport_nr»', alias:['rapportnr','auftragnr','auftragsnr','auftragsnummer','nummer','nr','belegnr']},
    {id:'datum',      label:'Bestelldatum', alias:['bestdatum','datum','auftragsdatum','erstelltam']},
    {id:'titel',      label:'Betrifft / Betreff', hint:'Wird zum Auftrags-Titel', alias:['betrifft','betreff','betrmemo','memo','bezeichnung','titel']},
    {id:'arbeit',     label:'Arbeit', hint:'Art der Arbeit im Altsystem (z.B. Hauptauftrag) — wird als Vermerk übernommen', alias:['arbeit','arbeitsart','auftragsart']},
    {id:'status',     label:'Auftragsstatus', hint:'z.B. Nicht begonnen / In Arbeit / Erledigt', alias:['astatustext','auftragsstatus','status','zustand']},
    {id:'rechnStatus',label:'Rechnungsstatus', hint:'Nur als Vermerk — GEMA rechnet den Fakturierungsstand aus den Rechnungen', alias:['rstatustext','rechnungsstatus','fakturastatus']},
    {id:'offertNr',   label:'Offert-Nr.', hint:'Verknüpft den Auftrag mit der bereits importierten Offerte', alias:['offertnr','offertnummer','offerte']},
    {id:'rechnungNr', label:'Rechnungs-Nr.', hint:'Wird vermerkt — der spätere Rechnungs-Import knüpft daran an', alias:['rechnungnr','rechnungsnr','rechnungsnummer']},
    {id:'bemerkung',  label:'Bemerkung', alias:['bemerkung','bemerkungen','notiz','notizen']},
    {id:'kundeName',  label:'Kunde / Firma', alias:['name1','kunde','firma','adressname']},
    {id:'korrName',   label:'Korrespondenz-Name', alias:['korrname','korrespondenzname']},
    {id:'anschrift',  label:'Anschrift-Block (Freitext)', hint:'Rechnungsadresse — wird automatisch zerlegt', alias:['anschrift','adressblock','rechnungsadresse']},
    {id:'tel',        label:'Telefon Kunde', alias:['telefon','tel']},
    {id:'sachb',      label:'Sachbearbeiter', hint:'Wird über den Namen einer Person der Firma zugeordnet', alias:['sachbname','sachbearbeiter','sachb','sb','bearbeiter']},
    {id:'abteilung',  label:'Abteilung', hint:'Wird zum GEMA-Arbeitsbereich (Sanitär, Spenglerei …)', alias:['abtname','abteilung','bereich','gewerk','sparte']},
    {id:'strasse',    label:'Objekt: Strasse / Nr.', hint:'Verknüpft den Auftrag mit dem Objekt', alias:['strasse','str','objektstrasse']},
    {id:'strasse2',   label:'Objekt: Adresszusatz', alias:['strasse2','adresszusatz','zusatz']},
    {id:'plz',        label:'Objekt: PLZ', alias:['plz','postleitzahl']},
    {id:'ort',        label:'Objekt: Ort', alias:['ort','stadt']},
    {id:'egid',       label:'Objekt: EGID', alias:['egid']},
    {id:'egrid',      label:'Objekt: EGRID', alias:['egrid']},
    {id:'schluessel', label:'Schlüssel / Zutritt', hint:'Schlüsselcode — erscheint beim Monteur im Termin', alias:['schlussel','schluessel','schlusselcode','zutritt','safe']},
    {id:'schluesselTel',label:'Schlüssel — Telefon / bei wem', alias:['schlutel','schluesseltel','schlusseltel']},
    {id:'besteller',  label:'Besteller', hint:'Wird als Bezugsperson am Objekt hinterlegt', alias:['besteller','bestellt','auftraggeber']},
    {id:'bestellerTel',label:'Besteller — Telefon', alias:['besttel','bestellertel']},
    {id:'wohnung',    label:'Wohnung', alias:['wohnung','stockwerk']},
    {id:'wohnStandort',label:'Wohnung — Name / Standort', hint:'Wird als Bezugsperson «Bewohner» hinterlegt', alias:['wohnstandort','bewohner']},
    {id:'wohnTel',    label:'Wohnung — Telefon', alias:['wohntel','bewohnertel']}
  ]
},
{
  id:'rechnungen', label:'Rechnungen', ic:'🧾', bereit:true,
  info:'Rechnungs-Kopfdaten mit Beträgen, Rechnungsart (Schluss-/Akonto-/Teilrechnung), ESR-Referenz und der Verknüpfung zum Auftrag. Der Export führt KEINE Zahlungsinformation — die Rechnungen entstehen als «gestellt»; im letzten Schritt lässt sich ein Stichtag setzen, ab dem ältere Belege als bezahlt gelten.',
  felder:[
    {id:'extId',      label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten)', alias:['id','rechnungid','rechnungsid']},
    // KRITISCH — «nr» steht VOR «belegnr»: im Altsystem ist `rechnungen.nr`
    // die Rechnungsnummer und `rechnungen.belegnr` die Fibu-Belegnummer.
    // Stünde «belegnr» früher, landete der Fibu-Beleg in der Rechnungsnummer.
    {id:'nr',         label:'Rechnungs-Nr.', pflicht:true, alias:['rechnungnr','rechnungsnr','rechnungsnummer','nr','nummer','belegnr']},
    {id:'auftragNr',  label:'Auftrags-Nr.', hint:'Verknüpft die Rechnung mit dem bereits importierten Auftrag', alias:['rapportnr','auftragnr','auftragsnr','auftragsnummer']},
    {id:'datum',      label:'Rechnungsdatum', alias:['datum','rechnungsdatum','belegdatum']},
    {id:'titel',      label:'Betrifft / Betreff', alias:['betrifft','betreff','betrmemo','projekt','memo','titel']},
    {id:'arbeit',     label:'Arbeit', hint:'Arbeitsart des Altsystems — wird als Vermerk übernommen', alias:['arbeit','arbeitsart']},
    {id:'art',        label:'Rechnungsart', hint:'Schluss-/Akonto-/Teilrechnung', alias:['typtext','rechnungstyp','rechnungsart','belegart','art']},
    {id:'status',     label:'Bearbeitungsstatus', hint:'z.B. Versandt / Entwurf / Storniert', alias:['typtext1','bearbstatus','status','zustand']},
    {id:'nettoBetrag',label:'Betrag exkl. MwSt', hint:'Massgebend für die Sammelposition', alias:['exmwstbetrag','nettobetrag','netto','betragexklmwst']},
    {id:'mwstBetrag', label:'MwSt-Betrag', hint:'Daraus wird der MwSt-Satz je Beleg gerechnet', alias:['mwstbetrag','mehrwertsteuer']},
    {id:'bruttoBetrag',label:'Betrag inkl. MwSt', alias:['rbetrag','bruttobetrag','brutto','total','betrag']},
    {id:'mwstCode',   label:'MwSt-Code', hint:'Nur als Vermerk — der Satz kommt aus den Beträgen', alias:['mwstcode','ustcode']},
    {id:'esrRef',     label:'ESR- / QR-Referenz', hint:'Wird für den Nachdruck übernommen, damit die Zahlung zugeordnet werden kann', alias:['esrref','esr','qrreferenz','referenznr']},
    {id:'zahlbed',    label:'Zahlungsbedingung', hint:'Bestimmt die Zahlungsfrist; unbekannt = Firmen-Standard', alias:['zahlbedid','zahlungsbedingung','zahlbed','kondition']},
    {id:'ausgefuehrt',label:'Ausgeführt', hint:'Leistungsdatum/-zeitraum aus dem Altsystem (Freitext)', alias:['ausgef','ausgefuehrt','leistungsdatum','ausfuehrung']},
    {id:'versandtAm', label:'Versandt am', alias:['postinfodate','versandtam','versandt','druckdatum']},
    {id:'printInfo',  label:'Druck-Vermerk', alias:['printinfo','druckinfo']},
    {id:'kundeName',  label:'Kunde / Firma', alias:['name1','kunde','firma','adressname']},
    {id:'korrName',   label:'Korrespondenz-Name', alias:['korrname','korrespondenzname']},
    {id:'anschrift',  label:'Anschrift-Block (Freitext)', hint:'Rechnungsadresse — wird automatisch zerlegt', alias:['anschrift','adressblock','rechnungsadresse']},
    {id:'adrId',      label:'Adress-ID im Altsystem', hint:'Nur als Vermerk am Beleg', alias:['adrid','adressid','adressnr']},
    {id:'sachb',      label:'Sachbearbeiter', alias:['sachbname','sachbearbeiter','sachb','sb','bearbeiter']},
    {id:'abteilung',  label:'Abteilung', hint:'Wird zum GEMA-Arbeitsbereich', alias:['abtname','abteilung','bereich','gewerk','sparte']},
    {id:'strasse',    label:'Objekt: Strasse / Nr.', hint:'Verknüpft die Rechnung mit dem Objekt', alias:['strasse','str','objektstrasse']},
    {id:'strasse2',   label:'Objekt: Adresszusatz', alias:['strasse2','adresszusatz','zusatz']},
    {id:'plz',        label:'Objekt: PLZ', alias:['plz','postleitzahl']},
    {id:'ort',        label:'Objekt: Ort', alias:['ort','stadt']},
    {id:'egid',       label:'Objekt: EGID', alias:['egid']},
    {id:'egrid',      label:'Objekt: EGRID', alias:['egrid']},
    {id:'ref1',       label:'Externe Referenz 1', alias:['extref1','ref1','referenz1']},
    {id:'ref2',       label:'Externe Referenz 2', alias:['extref2','ref2','referenz2']},
    {id:'besteller',  label:'Besteller', hint:'Wird als Bezugsperson am Objekt hinterlegt', alias:['besteller','auftraggeber']},
    {id:'wohnung',    label:'Wohnung', alias:['wohnung','stockwerk']},
    {id:'wohnStandort',label:'Wohnung — Name / Standort', hint:'Wird als Bezugsperson «Bewohner» hinterlegt', alias:['wohnstandort','bewohner']},
    // Fibu-Schlüssel: bleiben als Vermerk am Beleg, damit eine spätere
    // Anbindung an die Buchhaltung die Zuordnung nicht neu herstellen muss.
    // «belegnr» steht hier bewusst AUCH: `nr` ist früher deklariert und hat die
    // Spalte `nr` im Exakt-Durchgang bereits vergeben, «belegnr» ist damit frei.
    // Führt ein Export NUR «belegnr», greift `nr` darauf zurück — dann bleibt
    // dieses Feld leer, was richtig ist.
    {id:'fibuBelegNr',label:'Fibu-Belegnummer', hint:'Im Altsystem «belegnr» bzw. «abacbelegnr» — NICHT die Rechnungsnummer', alias:['abacbelegnr','fibubelegnr','belegnrfibu','belegnr']},
    {id:'opDebi',     label:'Offene-Posten-Nr. (Debitor)', alias:['opdebi','opnr','debitorop']},
    {id:'kostenstelle',label:'Kostenstelle', alias:['kostenstid','kostenstelle']}
  ]
},
{
  id:'positionen', label:'Positionen', ic:'📐', bereit:true,
  info:'Die echten Belegpositionen mit Menge, Einheit, Preis und Kalkulation. Sie werden an die bereits importierte Offerte bzw. Rechnung gehängt — die beim Kopf-Import erzeugte Sammelposition wird dabei ersetzt. Ein Beleg, an dem schon von Hand Positionen erfasst wurden, bleibt unangetastet.',
  felder:[
    {id:'belegTyp',   label:'Belegart', pflicht:true, hint:'«2»/«Offerte» oder «4»/«Rechnung» — im Altsystem die Spalte module_id', alias:['moduleid','belegart','belegtyp','modul','typ']},
    {id:'belegNr',    label:'Beleg-Nr.', pflicht:true, hint:'Offert- bzw. Rechnungsnummer, an die die Position gehört', alias:['belegnr','offertnr','rechnungnr','nr','nummer','itemnr']},
    {id:'belegExtId', label:'Beleg-ID im Altsystem', hint:'Alternative zur Nummer — im Export die Spalte item_id', alias:['itemid','belegid','docid']},
    {id:'sort',       label:'Reihenfolge', hint:'Ohne Angabe zählt die Zeilenfolge der Datei', alias:['sort','sortorder','reihenfolge','zeile','autoid']},
    {id:'art',        label:'Positionsart', hint:'postyp des Altsystems (9/10 = Titel, 19/20 = Text, 27 = Zuschlag) oder ein Wort', alias:['postyp','art','positionsart','zeilentyp']},
    {id:'posNr',      label:'Positions-Nr.', alias:['spos','posnr','code','positionsnr']},
    {id:'bez',        label:'Bezeichnung', pflicht:true, alias:['text','bez','bezeichnung','beschrieb','leistung']},
    {id:'menge',      label:'Menge', alias:['qty','menge','anzahl','quantity']},
    {id:'einheit',    label:'Einheit', alias:['unit','einheit','eh']},
    {id:'ep',         label:'Einheitspreis', alias:['price','ep','einheitspreis','preis']},
    {id:'total',      label:'Positionstotal', hint:'Nur zur Kontrolle — GEMA rechnet Menge × EP', alias:['total','betrag','summe','positionstotal']},
    {id:'rabattPct',  label:'Rabatt %', alias:['rabatt','rabattpct','discount']},
    {id:'dim',        label:'Dimension', alias:['dim','dimension','abmessung']},
    // NPK-Herkunft: bleibt als Vermerk an der Position, damit nachvollziehbar
    // ist, woher sie stammt. Der Katalog selbst wandert NICHT mit (Lizenz).
    {id:'npkKapitel', label:'NPK-Kapitel', alias:['schapter','npkkapitel','chapter','kapitel']},
    {id:'npkBuch',    label:'NPK-Buch', alias:['sbuchnr','npkbuch','buchnr','book']},
    {id:'npkPos',     label:'NPK-Position', alias:['npkpos','npknr']},
    // Kalkulation — GEMA rechnet bereits nach NPK-Systematik
    // (Leitfadenzeit × Verkaufsansatz), die Felder haben dort ihre Entsprechung.
    {id:'leitfadenZeit',label:'Leitfadenzeit', alias:['leitfadenzeit','leitfaden','zeit']},
    {id:'zeitFaktor',   label:'Zeitfaktor', alias:['zeitfaktor','faktorzeit']},
    {id:'ansatz',       label:'Verkaufsansatz', alias:['ansatz','stundenansatz','verkaufsansatz']},
    {id:'matPreis',     label:'Materialpreis', alias:['matprice','matpreis','materialpreis']},
    {id:'matFaktor',    label:'Materialfaktor', alias:['matfaktor','faktormat']},
    {id:'einkRabatt',   label:'Einkaufsrabatt %', alias:['einkaufsrabatt','ekrabatt','einkaufrabatt']},
    {id:'verschnitt',   label:'Verschnitt %', alias:['verschnitt','waste','abfall']}
  ]
},
{
  id:'zahlungen', label:'Zahlungen', ic:'💰', bereit:true,
  info:'Zahlungseingänge zu bereits importierten Rechnungen. Deckt die Summe der Zahlungen den Rechnungsbetrag, wird der Beleg auf «bezahlt» gesetzt — der Stichtag-Behelf des Rechnungs-Imports wird damit überflüssig.',
  felder:[
    {id:'belegNr',   label:'Rechnungs-Nr.', pflicht:true, alias:['rechnungnr','rechnungsnr','belegnr','nr','nummer']},
    {id:'datum',     label:'Zahlungsdatum', pflicht:true, alias:['zahlungsdatum','datum','valuta','eingang']},
    {id:'betrag',    label:'Betrag', pflicht:true, alias:['zahlungsbetrag','betrag','summe','amount']},
    {id:'bemerkung', label:'Bemerkung', alias:['bemerkung','bemerkungen','notiz','text']}
  ]
},
{
  id:'kreditoren', label:'Kreditoren', ic:'💳', bereit:true,
  info:'Lieferantenrechnungen mit Betrag, Fälligkeit und Freigabestand. Der Lieferant wird über den Namen dem Adressstamm zugeordnet; die Zuteilung auf einen Auftrag erfolgt über dessen Nummer.',
  felder:[
    {id:'extId',     label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten)', alias:['id','kreditorid','kreditorkey']},
    {id:'nr',        label:'Kreditor-Nr.', alias:['nr','nummer','kreditornr']},
    {id:'lieferant', label:'Lieferant', pflicht:true, alias:['name1','lieferant','firma','name','kreditor']},
    {id:'rechnungsNr',label:'Rechnungs-Nr. des Lieferanten', alias:['belegnr','rechnungnr','rechnungsnr','esrnr']},
    {id:'datum',     label:'Belegdatum', alias:['datum','belegdatum','rechnungsdatum']},
    {id:'faellig',   label:'Fällig bis', alias:['faelligdatum','faellig','faelligbis','duedate']},
    {id:'betrag',    label:'Betrag', pflicht:true, hint:'Brutto — GEMA führt den Kreditor mit einem Betrag', alias:['betrag','summe','total','amount']},
    {id:'mwstBetrag',label:'MwSt-Betrag', hint:'Nur als Vermerk', alias:['mwstbetrag','mwst','mehrwertsteuer']},
    {id:'restBetrag',label:'Restbetrag', hint:'Nur als Vermerk — offener Saldo im Altsystem', alias:['restbetrag','offen','saldo']},
    {id:'status',    label:'Status im Altsystem', hint:'z.B. Offen / Freigegeben / Bezahlt', alias:['kredistatustext','status','zustand','kredistatus']},
    {id:'auftragNr', label:'Auftrags-Nr.', hint:'Ordnet den Kreditor dem bereits importierten Auftrag zu', alias:['rapportnr','auftragnr','auftragsnr']},
    {id:'beschrieb', label:'Beschrieb / Bemerkung', alias:['bemerkung','bemerkungen','beschrieb','text','notiz']},
    {id:'konto',     label:'Aufwandkonto', hint:'Vermerk für die Fibu', alias:['konto','gkonto','aufwandkonto']},
    {id:'kostenstelle',label:'Kostenstelle', hint:'Vermerk für die Fibu', alias:['kostenstid','kostenstelle','kost']},
    {id:'iban',      label:'IBAN', alias:['iban']},
    {id:'esrRef',    label:'ESR-Referenz', alias:['esrref','esr','referenz']},
    {id:'sesamOpNr', label:'Sesam OP-Nr.', hint:'Schlüssel der Fibu-Anbindung — wandert als Vermerk mit', alias:['sesamopnr','opnr']}
  ]
},
{
  id:'artikel', label:'Eigener Artikelstamm', ic:'📦', bereit:true,
  info:'Die selbst gepflegten Artikel und Leistungen (nicht der lizenzierte NPK-Katalog). Sie landen in den org-weiten GEMA-Artikelkatalogen und stehen dort im Positions-Editor zur Auswahl.',
  felder:[
    {id:'katalog',   label:'Katalog / Kapitel', hint:'Gruppiert die Artikel; ohne Angabe «Übernahme Altsystem»', alias:['katalog','kapitel','gruppe','chapter','chapterguid','kategorie']},
    {id:'extId',     label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten)', alias:['guid','id','artikelid','autoid']},
    {id:'artNr',     label:'Artikel-Nr.', alias:['artref','artnr','artikelnr','nr','posnr']},
    {id:'bez',       label:'Bezeichnung', pflicht:true, alias:['text','bez','bezeichnung','beschrieb','name']},
    {id:'einheit',   label:'Einheit', alias:['unit','einheit','eh']},
    {id:'ep',        label:'Verkaufspreis', alias:['price','ep','preis','verkaufspreis']},
    {id:'dim',       label:'Dimension', alias:['dim','dimension','abmessung']},
    {id:'matPreis',  label:'Materialpreis', alias:['matprice','matpreis','einkaufspreis']},
    {id:'einkRabatt',label:'Einkaufsrabatt %', alias:['einkaufsrabatt','ekrabatt']},
    {id:'verschnitt',label:'Verschnitt %', alias:['verschnitt','waste']},
    {id:'leitfadenZeit',label:'Leitfadenzeit', alias:['leitfadenzeit','leitfaden']},
    {id:'ansatz',    label:'Verkaufsansatz', alias:['ansatz','stundenansatz']}
  ]
},
{
  id:'zahlbed', label:'Zahlungsbedingungen', ic:'📆', bereit:true,
  info:'Die Konditionen des Altsystems (Kürzel, Frist, Skonto). Sie werden zu den GEMA-Zahlungsbedingungen der Firma ergänzt — bestehende bleiben unverändert. Danach setzt der Belegimport die richtige Zahlungsfrist statt des Firmen-Standards.',
  felder:[
    {id:'kuerzel',   label:'Kürzel', pflicht:true, hint:'«01», «02» … — ACHTUNG führende Null: «00» ist ein gültiger Wert', alias:['shortcut','kuerzel','kurz','code','zahlbedid']},
    {id:'label',     label:'Bezeichnung', pflicht:true, alias:['description','bezeichnung','beschreibung','text','label']},
    {id:'tage',      label:'Tage netto', alias:['daysnetto','tagenetto','tage','netto']},
    {id:'skontoTage',label:'Skonto-Tage', alias:['days1','skontotage','tage1']},
    {id:'skontoPct', label:'Skonto %', alias:['skonto1','skonto','skontopct']},
    {id:'fibuCode',  label:'Fibu-Code', hint:'Vermerk für die Fibu-Anbindung', alias:['fibucode','fibu']}
  ]
}
];

/* `module_id` des Altsystems → Belegart. Die Zuordnung ist über den Abgleich
   der Positionssummen mit den Belegtotalen NACHGEWIESEN (2 → Offerte trifft
   3375 Offertbeträge gegen 3 Rechnungen; 4 → Rechnung 6343 gegen 3), nicht
   geraten. Aufträge tragen im Altsystem keine eigenen Positionen. */
var MODULE_BELEG={'2':'offerte','4':'rechnung'};
function belegTyp(roh){
  var t=s(roh);
  if(MODULE_BELEG[t])return {typ:MODULE_BELEG[t],erkannt:true};
  var n=norm(t);
  if(n.indexOf('offert')===0)return {typ:'offerte',erkannt:true};
  if(n.indexOf('rechn')===0)return {typ:'rechnung',erkannt:true};
  if(n.indexOf('auftr')===0||n.indexOf('rapport')===0)return {typ:'auftrag',erkannt:true};
  return {typ:'',erkannt:false};
}
function sektion(id){return SEKTIONEN.find(function(x){return x.id===id;})||null;}

/* Automatische Spalten-Zuordnung in ZWEI globalen Durchgängen:

     1. alle EXAKTEN Alias-Treffer über sämtliche Felder,
     2. erst danach die unscharfen Präfix-Treffer für die noch offenen Felder.

   KRITISCH — die Reihenfolge der Durchgänge, nicht die Feld-Reihenfolge,
   entscheidet: Ein breiter Alias eines früh deklarierten Feldes (z.B. «name»
   bei «Name der Hauptadresse») würde sonst per Präfix die Spalte `name1`
   wegschnappen, die ein späteres Feld (Bezugsperson 1) EXAKT trifft.
   Jede Quellspalte wird höchstens einmal vergeben. */
function erkenneMapping(headers,sekId){
  var sek=sektion(sekId);var map={};
  if(!sek||!sek.felder)return map;
  var hs=(headers||[]).map(function(h,i){return {i:i,n:norm(h)};});
  var vergeben={};
  function suchen(pruef){
    sek.felder.forEach(function(f){
      if(map[f.id]!=null)return;
      var al=f.alias||[],hit=null;
      for(var a=0;a<al.length&&!hit;a++){
        hit=hs.find(function(h){return !vergeben[h.i]&&h.n&&pruef(h.n,al[a]);})||null;
      }
      if(hit){map[f.id]=hit.i;vergeben[hit.i]=1;}
    });
  }
  suchen(function(h,a){return h===a;});
  suchen(function(h,a){return a.length>=4&&h.indexOf(a)===0;});
  return map;
}

/* Güte einer Zuordnung: reicht sie zum Importieren, und wie viel wurde erkannt? */
function mappingGuete(map,sekId){
  var sek=sektion(sekId);
  if(!sek)return {pflichtOk:false,fehlendePflicht:[],erkannt:0,gesamt:0};
  var fehlt=sek.felder.filter(function(f){return f.pflicht&&map[f.id]==null;});
  var erkannt=sek.felder.filter(function(f){return map[f.id]!=null;}).length;
  return {pflichtOk:fehlt.length===0, fehlendePflicht:fehlt.map(function(f){return f.label;}),
          erkannt:erkannt, gesamt:sek.felder.length};
}

/* Alias → Sektion, aber NUR für Aliasse, die genau EINE Sektion führt.
   Diese eindeutigen Spaltennamen sind die verlässlichen Erkennungsmerkmale
   («esr_ref» gibt es nur im Rechnungs-Export, «astatustext» nur bei den
   Aufträgen). Der Index wird aus den Alias-Listen GERECHNET statt von Hand
   gepflegt — so bleibt er richtig, wenn jemand die Aliasse ergänzt. */
var _uniqCache=null;
function _uniqAlias(){
  if(_uniqCache)return _uniqCache;
  var zaehler={};
  SEKTIONEN.forEach(function(sek){
    var gesehen={};
    (sek.felder||[]).forEach(function(f){
      (f.alias||[]).forEach(function(a){
        if(gesehen[a])return;gesehen[a]=1;
        (zaehler[a]=zaehler[a]||[]).push(sek.id);
      });
    });
  });
  _uniqCache={};
  Object.keys(zaehler).forEach(function(a){if(zaehler[a].length===1)_uniqCache[a]=zaehler[a][0];});
  return _uniqCache;
}

/* Welcher Abschnitt steckt in dieser Datei? Bewertet JEDE Sektion gegen die
   Kopfzeile und liefert die Rangliste. «sicher» heisst: Pflichtfelder da,
   mindestens zwei eindeutige Merkmale, und deutlicher Abstand zur Zweiten —
   sonst entscheidet der Mensch. Es wird nie geraten und nie stillschweigend
   importiert; die Oberfläche zeigt das Ergebnis immer an. */
function erkenneSektion(headers){
  var uniq=_uniqAlias();
  var hs=(headers||[]).map(function(h){return norm(h);}).filter(Boolean);
  var liste=SEKTIONEN.filter(function(sek){return sek.bereit;}).map(function(sek){
    var map=erkenneMapping(headers,sek.id);
    var g=mappingGuete(map,sek.id);
    var marker=0,gez={};
    hs.forEach(function(h){if(uniq[h]===sek.id&&!gez[h]){gez[h]=1;marker++;}});
    return {sekId:sek.id, label:sek.label, ic:sek.ic, mapping:map, marker:marker,
            erkannt:g.erkannt, gesamt:g.gesamt, pflichtOk:g.pflichtOk,
            fehlendePflicht:g.fehlendePflicht,
            punkte:marker*5+g.erkannt+(g.pflichtOk?3:0)};
  }).sort(function(a,b){return b.punkte-a.punkte;});
  var b=liste[0]||null, z=liste[1]||null;
  var sicher=!!(b&&b.pflichtOk&&b.marker>=2&&(!z||b.punkte>=z.punkte+3));
  return {beste:b, sicher:sicher, liste:liste};
}

/* Reihenfolge, in der die Abschnitte importiert werden MÜSSEN: jeder hängt
   sich an das an, was schon da ist (Rechnung → Auftrag → Offerte → Objekt).
   Wer die Rechnungen zuerst einliest, bekommt Belege ohne Verknüpfung.

   Davor die Stammdaten (Konditionen, Artikel), danach alles, was einen
   fertigen Beleg braucht: Positionen und Zahlungen hängen sich an Offerte
   bzw. Rechnung, Kreditoren an den Auftrag. */
var IMPORT_REIHENFOLGE=['zahlbed','artikel','objekte','adressen','offerten',
                        'auftraege','rechnungen','positionen','zahlungen','kreditoren'];
function sektionRang(sekId){
  var i=IMPORT_REIHENFOLGE.indexOf(sekId);
  return i<0?99:i;
}

function zelle(row,map,feld){
  var i=map[feld];
  return (i==null||i<0)?'':s(row[i]);
}

/* Normalisiert EINE Tabellenzeile zum Zwischenmodell des Abschnitts. */
function normalisiereZeile(row,map,sekId){
  var g=function(f){return zelle(row,map,f);};
  if(sekId==='adressen'){
    return {
      nr:g('nr'), firma:g('firma'), anrede:g('anrede'), vorname:g('vorname'), name:g('name'),
      kontakt:g('kontakt'),
      typen:g('typen').split(/[,;/]+/).map(s).filter(Boolean),
      strasse:g('strasse'), strasse2:g('strasse2'), plz:g('plz'), ort:g('ort'), land:g('land'),
      tel:g('tel'), natel:g('natel'), email:g('email'),
      wohnung:g('wohnung'), bemerkungen:g('bemerkungen'),
      zahlbedKuerzel:g('zahlbedKuerzel'), stdRabatt:pct(g('stdRabatt')), stdSkonto:pct(g('stdSkonto')),
      pkDebi:g('pkDebi'), pkKredi:g('pkKredi'), eBillId:g('eBillId'), rechnungEmail:g('rechnungEmail')
    };
  }
  if(sekId==='offerten'){
    var st=offertStatus(g('status'));
    var netto=parseBetrag(g('nettoBetrag'));
    var mwst=parseBetrag(g('mwstBetrag'));
    var brutto=parseBetrag(g('bruttoBetrag'));
    // Fehlende Summen gegenseitig herleiten — Exporte liefern mal alle drei,
    // mal nur zwei davon.
    if(netto==null&&brutto!=null&&mwst!=null)netto=Math.round((brutto-mwst)*100)/100;
    if(mwst==null&&brutto!=null&&netto!=null)mwst=Math.round((brutto-netto)*100)/100;
    if(brutto==null&&netto!=null&&mwst!=null)brutto=Math.round((netto+mwst)*100)/100;
    // MwSt-Satz aus dem BELEG rechnen statt den heutigen Firmensatz zu
    // unterstellen — Altbelege tragen 7.7 % (bis 2023) oder 8.1 %.
    var satz=null;
    if(netto&&mwst!=null&&netto>0)satz=Math.round(mwst/netto*1000)/10;
    var adr=parseAnschrift(g('anschrift')).zahler||null;
    var kunde=Object.assign({firma:'',kontakt:'',strasse:'',plz:'',ort:''},adr||{});
    if(!kunde.firma)kunde.firma=g('kundeName');
    if(g('kundeNr'))kunde.nr=g('kundeNr');
    return {
      extId:g('extId'), nr:g('nr'),
      datum:parseDatum(g('datum')), gueltigBis:parseDatum(g('gueltigBis')),
      titel:g('titel'), statusText:g('status'), status:st.status, statusErkannt:st.erkannt,
      netto:netto, mwst:mwst, brutto:brutto, mwstPct:satz,
      kunde:kunde, kundeName:g('kundeName')||kunde.firma, anrede:g('anrede'),
      sachb:g('sachb'), abteilung:g('abteilung'),
      objekt:{strasse:g('strasse'), strasse2:g('strasse2'), plz:g('plz'), ort:g('ort'),
              egid:g('egid'), egrid:g('egrid')},
      ref1:g('ref1'), ref2:g('ref2'), wohnung:g('wohnung')
    };
  }
  if(sekId==='rechnungen'){
    var rst=rechnungStatus(g('status'));
    var rart=rechnungArt(g('art'));
    var rnetto=parseBetrag(g('nettoBetrag'));
    var rmwst=parseBetrag(g('mwstBetrag'));
    var rbrutto=parseBetrag(g('bruttoBetrag'));
    if(rnetto==null&&rbrutto!=null&&rmwst!=null)rnetto=Math.round((rbrutto-rmwst)*100)/100;
    if(rmwst==null&&rbrutto!=null&&rnetto!=null)rmwst=Math.round((rbrutto-rnetto)*100)/100;
    if(rbrutto==null&&rnetto!=null&&rmwst!=null)rbrutto=Math.round((rnetto+rmwst)*100)/100;
    var rsatz=null;
    if(rnetto&&rmwst!=null&&rnetto>0)rsatz=Math.round(rmwst/rnetto*1000)/10;
    var radr=parseAnschrift(g('anschrift')).zahler||null;
    var rkunde=Object.assign({firma:'',kontakt:'',strasse:'',plz:'',ort:''},radr||{});
    if(!rkunde.firma)rkunde.firma=g('kundeName')||g('korrName');
    var rpers=[];
    if(s(g('besteller')))rpers.push({name:g('besteller'),typ:'besteller'});
    if(s(g('wohnStandort')))rpers.push({name:g('wohnStandort'),wohnung:g('wohnung'),typ:'bewohner'});
    return {
      extId:g('extId'), nr:g('nr'), auftragNr:g('auftragNr'),
      datum:parseDatum(g('datum')),
      titel:g('titel')||g('arbeit'), arbeit:g('arbeit'),
      artText:g('art'), art:rart.art, artErkannt:rart.erkannt,
      statusText:g('status'), status:rst.status, statusErkannt:rst.erkannt,
      netto:rnetto, mwst:rmwst, brutto:rbrutto, mwstPct:rsatz, mwstCode:g('mwstCode'),
      esrRef:g('esrRef'), esrOk:esrGueltig(g('esrRef')),
      zahlbed:g('zahlbed'), ausgefuehrt:g('ausgefuehrt'),
      versandtAm:g('versandtAm'), printInfo:g('printInfo'),
      kunde:rkunde, kundeName:g('kundeName')||rkunde.firma, adrId:g('adrId'),
      sachb:g('sachb'), abteilung:g('abteilung'),
      objekt:{strasse:g('strasse'), strasse2:g('strasse2'), plz:g('plz'), ort:g('ort'),
              egid:g('egid'), egrid:g('egrid')},
      ref1:g('ref1'), ref2:g('ref2'), wohnung:g('wohnung'), personen:rpers,
      fibuBelegNr:g('fibuBelegNr'), opDebi:g('opDebi'), kostenstelle:g('kostenstelle')
    };
  }
  if(sekId==='auftraege'){
    var ast=auftragStatus(g('status'));
    var aadr=parseAnschrift(g('anschrift')).zahler||null;
    var akunde=Object.assign({firma:'',kontakt:'',strasse:'',plz:'',ort:''},aadr||{});
    if(!akunde.firma)akunde.firma=g('kundeName')||g('korrName');
    if(g('tel'))akunde.tel=g('tel');
    // Bezugspersonen, die der Auftrag mitbringt (Besteller / Bewohner) —
    // sie gehören ans OBJEKT, nicht in den Adressstamm.
    var apers=[];
    if(s(g('besteller')))apers.push({name:g('besteller'),tel:g('bestellerTel'),typ:'besteller'});
    if(s(g('wohnStandort'))||s(g('wohnTel')))
      apers.push({name:g('wohnStandort')||g('wohnung'),tel:g('wohnTel'),wohnung:g('wohnung'),typ:'bewohner'});
    return {
      extId:g('extId'), nr:g('nr'), datum:parseDatum(g('datum')),
      titel:g('titel')||g('arbeit'), arbeit:g('arbeit'),
      statusText:g('status'), status:ast.status, statusErkannt:ast.erkannt,
      rechnStatus:g('rechnStatus'),
      offertNr:g('offertNr'), rechnungNr:g('rechnungNr'),
      bemerkung:g('bemerkung'),
      kunde:akunde, kundeName:g('kundeName')||akunde.firma,
      sachb:g('sachb'), abteilung:g('abteilung'),
      objekt:{strasse:g('strasse'), strasse2:g('strasse2'), plz:g('plz'), ort:g('ort'),
              egid:g('egid'), egrid:g('egrid')},
      schluessel:{code:g('schluessel'), info:g('schluesselTel')},
      wohnung:g('wohnung'), personen:apers
    };
  }
  if(sekId==='positionen'){
    var pz={menge:parseBetrag(g('menge')), ep:parseBetrag(g('ep')), total:parseBetrag(g('total'))};
    // Der Export liefert je nach Positionsmodell mal EP, mal nur das Total —
    // das Fehlende wird hergeleitet, statt die Position mit 0 anzulegen.
    if(pz.ep==null&&pz.total!=null&&pz.menge)pz.ep=Math.round(pz.total/pz.menge*100)/100;
    if(pz.menge==null&&pz.total!=null&&pz.ep)pz.menge=Math.round(pz.total/pz.ep*1000)/1000;
    var bt=belegTyp(g('belegTyp'));
    var pa=posArt(g('art'),pz);
    return {
      belegTyp:bt.typ, belegTypRoh:g('belegTyp'), belegTypErkannt:bt.erkannt,
      belegNr:g('belegNr'), belegExtId:g('belegExtId'),
      sort:parseBetrag(g('sort')),
      art:pa.art, artRoh:g('art'), artErkannt:pa.erkannt,
      posNr:g('posNr'), bez:g('bez'),
      menge:pz.menge, einheit:g('einheit'), ep:pz.ep, total:pz.total,
      rabattPct:pct(g('rabattPct')), dim:g('dim'),
      npk:{kapitel:g('npkKapitel'), buch:g('npkBuch'), pos:g('npkPos')||g('posNr')},
      kalk:{
        leitfadenZeit:parseBetrag(g('leitfadenZeit')), zeitFaktor:parseBetrag(g('zeitFaktor')),
        ansatz:parseBetrag(g('ansatz')), matPreis:parseBetrag(g('matPreis')),
        matFaktor:parseBetrag(g('matFaktor')), einkRabatt:pct(g('einkRabatt')),
        verschnitt:pct(g('verschnitt'))
      }
    };
  }
  if(sekId==='zahlungen'){
    return {belegNr:g('belegNr'), datum:parseDatum(g('datum')),
            betrag:parseBetrag(g('betrag')), bemerkung:g('bemerkung')};
  }
  if(sekId==='kreditoren'){
    var kst=kreditorStatus(g('status'));
    return {
      extId:g('extId'), nr:g('nr'), lieferant:g('lieferant'),
      rechnungsNr:g('rechnungsNr'), datum:parseDatum(g('datum')), faellig:parseDatum(g('faellig')),
      betrag:parseBetrag(g('betrag')), mwstBetrag:parseBetrag(g('mwstBetrag')),
      restBetrag:parseBetrag(g('restBetrag')),
      statusText:g('status'), status:kst.status, statusErkannt:kst.erkannt,
      auftragNr:g('auftragNr'), beschrieb:g('beschrieb'),
      konto:g('konto'), kostenstelle:g('kostenstelle'), iban:g('iban'),
      esrRef:g('esrRef'), sesamOpNr:g('sesamOpNr')
    };
  }
  if(sekId==='artikel'){
    return {
      katalog:g('katalog')||'Übernahme Altsystem', extId:g('extId'),
      artNr:g('artNr'), bez:g('bez'), einheit:g('einheit'),
      ep:parseBetrag(g('ep')), dim:g('dim'),
      kalk:{matPreis:parseBetrag(g('matPreis')), einkRabatt:pct(g('einkRabatt')),
            verschnitt:pct(g('verschnitt')), leitfadenZeit:parseBetrag(g('leitfadenZeit')),
            ansatz:parseBetrag(g('ansatz'))}
    };
  }
  if(sekId==='zahlbed'){
    var zbTage=parseBetrag(g('tage'));
    var zbSkT=parseBetrag(g('skontoTage'));
    return {
      kuerzel:g('kuerzel'), label:g('label'),
      tage:zbTage==null?null:Math.round(zbTage),
      skontoTage:zbSkT==null?null:Math.round(zbSkT),
      skontoPct:pct(g('skontoPct')), fibuCode:g('fibuCode')
    };
  }
  // objekte
  var bloecke=parseAnschrift(g('anschrift'));
  var slots={};
  ['zahler','korrespondenz','eigentuemer'].forEach(function(sl){
    var nr=sl==='zahler'?g('zahlerNr'):sl==='korrespondenz'?g('korrNr'):g('eigNr');
    var b=bloecke[sl]||null;
    if(!nr&&!b)return;
    var a=Object.assign({firma:'',kontakt:'',strasse:'',plz:'',ort:''},b||{});
    // Der Name der Hauptadresse steht im Export als eigene Spalte —
    // er gehört zum «Zahlbar durch»-Slot, wenn der Block keinen liefert.
    if(sl==='zahler'&&!a.firma)a.firma=g('zahlerName');
    if(!a.firma&&nr)a.firma='Kunden-Nr. '+nr;
    slots[sl]={nr:nr,adresse:a};
  });
  var personen=[];
  [1,2].forEach(function(k){
    var nm=g('kp'+k+'Name'), vn=g('kp'+k+'Vorname');
    if(!nm&&!vn)return;
    personen.push({
      name:nm, vorname:vn,
      typLabel:g('kp'+k+'Typ'),
      tel:g('kp'+k+'Tel'), email:g('kp'+k+'Email')
    });
  });
  var strasse=g('strasse');
  return {
    extId:g('extId'),
    name:[strasse,g('strasse2')].filter(Boolean).join(' · ')||[g('plz'),g('ort')].filter(Boolean).join(' '),
    strasse:strasse, strasse2:g('strasse2'), plz:g('plz'), ort:g('ort'),
    egid:g('egid'), egrid:g('egrid'),
    monteur:g('monteur'), sachb:g('sachb'),
    ref1:g('ref1'), ref2:g('ref2'), notiz:g('notiz'),
    slots:slots, personen:personen
  };
}

/* Prüft eine normalisierte Zeile → Liste von Hinweisen (blockierend = fehler). */
function pruefe(z,sekId){
  var hin=[];
  if(sekId==='objekte'){
    if(!s(z.strasse)&&!s(z.plz)&&!s(z.ort))hin.push({typ:'fehler',text:'Keine Adresse — Zeile wird übersprungen.'});
    if(!s(z.extId))hin.push({typ:'warn',text:'Keine ID aus dem Altsystem — Dubletten werden über Strasse + PLZ erkannt.'});
    if(!Object.keys(z.slots||{}).length)hin.push({typ:'info',text:'Keine Adress-Slots erkannt.'});
  }else if(sekId==='offerten'){
    if(!s(z.nr))hin.push({typ:'fehler',text:'Keine Offert-Nr. — Zeile wird übersprungen.'});
    if(!s(z.kunde&&z.kunde.firma))hin.push({typ:'warn',text:'Kein Kunde erkannt.'});
    if(z.netto==null)hin.push({typ:'warn',text:'Kein Betrag — die Offerte entsteht ohne Position.'});
    if(!z.statusErkannt&&s(z.statusText))hin.push({typ:'warn',text:'Status «'+s(z.statusText)+'» unbekannt → «versendet».'});
    if(!s(z.objekt&&z.objekt.strasse))hin.push({typ:'info',text:'Ohne Objekt-Adresse — keine Projekt-Verknüpfung.'});
    if(z.mwstPct!=null&&z.mwstPct>0&&Math.abs(z.mwstPct-8.1)>0.15&&Math.abs(z.mwstPct-7.7)>0.15)
      hin.push({typ:'warn',text:'Ungewöhnlicher MwSt-Satz '+z.mwstPct+' % — bitte prüfen.'});
  }else if(sekId==='rechnungen'){
    if(!s(z.nr))hin.push({typ:'fehler',text:'Keine Rechnungs-Nr. — Zeile wird übersprungen.'});
    if(!s(z.kunde&&z.kunde.firma))hin.push({typ:'warn',text:'Kein Kunde erkannt.'});
    if(z.netto==null)hin.push({typ:'warn',text:'Kein Betrag — die Rechnung entsteht ohne Position.'});
    if(!z.artErkannt&&s(z.artText))hin.push({typ:'warn',text:'Rechnungsart «'+s(z.artText)+'» unbekannt → Einzelrechnung.'});
    if(!z.statusErkannt&&s(z.statusText))hin.push({typ:'warn',text:'Status «'+s(z.statusText)+'» unbekannt → «gestellt».'});
    if(z.mwstPct!=null&&z.mwstPct>0&&Math.abs(z.mwstPct-8.1)>0.15&&Math.abs(z.mwstPct-7.7)>0.15)
      hin.push({typ:'warn',text:'Ungewöhnlicher MwSt-Satz '+z.mwstPct+' % — bitte prüfen.'});
    if(s(z.auftragNr))hin.push({typ:'info',text:'Wird mit Auftrag '+s(z.auftragNr)+' verknüpft (sofern importiert).'});
    else hin.push({typ:'info',text:'Keine Auftrags-Nr. — die Rechnung steht für sich.'});
    if(s(z.esrRef)&&!z.esrOk)hin.push({typ:'warn',text:'ESR-Referenz ungültig (Prüfziffer) — GEMA erzeugt für den Nachdruck eine eigene.'});
  }else if(sekId==='auftraege'){
    if(!s(z.nr))hin.push({typ:'fehler',text:'Keine Auftrags-Nr. — Zeile wird übersprungen.'});
    if(!s(z.kunde&&z.kunde.firma))hin.push({typ:'warn',text:'Kein Kunde erkannt.'});
    if(!z.statusErkannt&&s(z.statusText))hin.push({typ:'warn',text:'Auftragsstatus «'+s(z.statusText)+'» unbekannt → «offen».'});
    if(!s(z.objekt&&z.objekt.strasse))hin.push({typ:'info',text:'Ohne Objekt-Adresse — keine Projekt-Verknüpfung.'});
    if(s(z.offertNr))hin.push({typ:'info',text:'Wird mit Offerte '+s(z.offertNr)+' verknüpft (sofern importiert).'});
    else hin.push({typ:'info',text:'Keine Offerte verknüpft — der Auftrag entsteht ohne Positionen.'});
    if(s(z.rechnungNr))hin.push({typ:'info',text:'Rechnung '+s(z.rechnungNr)+' wird vermerkt (für den Rechnungs-Import).'});
  }else if(sekId==='adressen'){
    if(!s(z.firma)&&!s(z.name))hin.push({typ:'fehler',text:'Weder Firma noch Name — Zeile wird übersprungen.'});
    if(!s(z.nr))hin.push({typ:'warn',text:'Keine Kundennummer — Verknüpfung zu Objekten nur über Name + PLZ.'});
  }else if(sekId==='positionen'){
    if(!s(z.belegNr)&&!s(z.belegExtId))hin.push({typ:'fehler',text:'Weder Beleg-Nr. noch Beleg-ID — die Position wäre keinem Beleg zuzuordnen.'});
    if(!s(z.bez))hin.push({typ:'fehler',text:'Keine Bezeichnung — Zeile wird übersprungen.'});
    if(!s(z.belegTypRoh))hin.push({typ:'fehler',text:'Keine Belegart — die Position wäre keinem Beleg zuzuordnen.'});
    else if(!z.belegTypErkannt)hin.push({typ:'fehler',text:'Belegart «'+s(z.belegTypRoh)+'» unbekannt (erwartet 2/Offerte oder 4/Rechnung).'});
    if(!z.artErkannt&&s(z.artRoh))hin.push({typ:'warn',text:'Positionsart «'+s(z.artRoh)+'» unbekannt → aus der Zeile abgeleitet («'+z.art+'»).'});
    if(z.art==='frei'&&z.ep==null&&z.total==null)hin.push({typ:'warn',text:'Position ohne Preis — sie entsteht mit 0.00.'});
  }else if(sekId==='zahlungen'){
    if(!s(z.belegNr))hin.push({typ:'fehler',text:'Keine Rechnungs-Nr. — die Zahlung wäre keinem Beleg zuzuordnen.'});
    if(z.betrag==null||!z.betrag)hin.push({typ:'fehler',text:'Kein Betrag — Zeile wird übersprungen.'});
    if(!s(z.datum))hin.push({typ:'warn',text:'Kein Zahlungsdatum — es wird das Rechnungsdatum eingesetzt.'});
  }else if(sekId==='kreditoren'){
    if(!s(z.lieferant))hin.push({typ:'fehler',text:'Kein Lieferant — Zeile wird übersprungen.'});
    if(z.betrag==null||!(z.betrag>0))hin.push({typ:'fehler',text:'Kein Betrag — GEMA führt jeden Kreditor mit einem Betrag.'});
    if(!z.statusErkannt&&s(z.statusText))hin.push({typ:'warn',text:'Status «'+s(z.statusText)+'» unbekannt → «Zur Freigabe».'});
    if(!s(z.extId))hin.push({typ:'warn',text:'Keine ID aus dem Altsystem — Dubletten werden über Lieferant + Rechnungs-Nr. erkannt.'});
    if(s(z.auftragNr))hin.push({typ:'info',text:'Wird Auftrag '+s(z.auftragNr)+' zugeteilt (sofern importiert).'});
  }else if(sekId==='artikel'){
    if(!s(z.bez))hin.push({typ:'fehler',text:'Keine Bezeichnung — Zeile wird übersprungen.'});
    if(z.ep==null)hin.push({typ:'warn',text:'Kein Verkaufspreis — der Artikel entsteht mit 0.00.'});
  }else if(sekId==='zahlbed'){
    if(!s(z.kuerzel))hin.push({typ:'fehler',text:'Kein Kürzel — die Belege könnten die Kondition nicht referenzieren.'});
    if(!s(z.label))hin.push({typ:'fehler',text:'Keine Bezeichnung — Zeile wird übersprungen.'});
    // Excel macht aus «01» die Zahl 1 und wirft die führende Null weg. Im
    // Altsystem sind die Kürzel zweistellig — «00» ist 60 Tage netto.
    if(/^\d$/.test(s(z.kuerzel)))
      hin.push({typ:'warn',text:'Kürzel «'+s(z.kuerzel)+'» ist einstellig; im Altsystem sind sie zweistellig. Vermutlich hat Excel die führende Null entfernt — bitte als CSV exportieren.'});
    if(z.tage==null)hin.push({typ:'warn',text:'Keine Frist — für diese Kondition bleibt der Firmen-Standard massgebend.'});
  }
  return hin;
}

/* Kopfzeile finden: erste Zeile mit ≥2 nicht-leeren Zellen, die nicht wie
   reine Daten aussieht. Bewusst einfach — die Vorschau zeigt das Ergebnis
   und der Nutzer kann die Zeile umstellen. */
function findeKopfzeile(rows){
  for(var i=0;i<Math.min(rows.length,20);i++){
    var r=rows[i]||[];
    var voll=r.filter(function(c){return s(c);}).length;
    if(voll>=2)return i;
  }
  return 0;
}

/* ═══ ENGINE-END ═══ */

// ── Laufzeit: Datei lesen ───────────────────────────────────────────────
function leseDatei(file){
  if(!file)return Promise.reject(new Error('Keine Datei gewählt.'));
  var nm=(file.name||'').toLowerCase();
  if(/\.(csv|txt|tsv)$/.test(nm)){
    return file.text().then(function(t){return parseCsv(t);});
  }
  if(/\.xlsx?$/.test(nm)||/\.xlsm$/.test(nm)){
    if(/\.xls$/.test(nm))return Promise.reject(new Error('Das alte .xls-Format wird nicht unterstützt. Bitte in Excel als .xlsx oder .csv speichern.'));
    return file.arrayBuffer().then(leseXlsx);
  }
  // Unbekannte Endung: erst als XLSX versuchen, sonst als Text
  return file.arrayBuffer().then(leseXlsx).catch(function(){
    return file.text().then(function(t){return parseCsv(t);});
  });
}

// ── Laufzeit: Vorbereiten (Dry-Run) ─────────────────────────────────────
function bestehendeObjekte(){
  try{
    if(typeof GemaObjekte==='undefined')return [];
    return (GemaObjekte.getAllUnfiltered?GemaObjekte.getAllUnfiltered():GemaObjekte.getAll())||[];
  }catch(e){return [];}
}
function objektSchluessel(o){
  if(!o)return '';
  var ext=s(o.extId||(o.quelle&&o.quelle.extId));
  if(ext)return 'ext:'+ext.toLowerCase();
  return 'adr:'+[s(o.strasse),s(o.plz)].join('|').toLowerCase().replace(/[^a-z0-9|]+/g,'');
}

// ── Offerten: Nachschlagen im Bestand ───────────────────────────────────
var DOK_POOL='gema_erp_dok_pool_v1', DOK_PREFIX='erpdok:';
function bestehendeDocs(){
  try{
    var u=(typeof GemaAuth!=='undefined'&&GemaAuth.getCurrentUser)?GemaAuth.getCurrentUser():null;
    return dokPool().filter(function(d){return d&&(!u||d.orgId===u.orgId);});
  }catch(e){return [];}
}
function dokSchluessel(typ,d){
  var ext=s(d.extId||(d.quelle&&d.quelle.extId));
  if(ext)return typ+':ext:'+ext.toLowerCase();
  return typ+':nr:'+s(d.nr).toLowerCase();
}
/* Adress-Schlüssel eines Objekts — bewusst OHNE extId.

   KRITISCH: `objektSchluessel` bevorzugt die Alt-ID (`ext:4984`). Ein aus dem
   Objekt-Export stammendes Objekt trägt sie, der Offert-Export liefert sie
   aber nicht — ein Vergleich über objektSchluessel fände das Objekt deshalb
   nie und legte bei jedem Offert-Import eine Dublette an. */
function objektAdrKey(o){
  return 'adr:'+[s(o&&o.strasse),s(o&&o.plz)].join('|').toLowerCase().replace(/[^a-z0-9|]+/g,'');
}
/* Objekt zur Adresse finden (Strasse + PLZ) — verknüpft die Offerte mit dem
   bereits importierten Objekt. */
function findeObjekt(adr,liste){
  if(!s(adr&&adr.strasse))return null;
  var k=objektAdrKey(adr);
  return (liste||[]).find(function(o){return objektAdrKey(o)===k;})||null;
}
/* Sachbearbeiter über den Namen einer Person der Firma zuordnen.
   Der Export liefert oft nur den Nachnamen («Jäggi») — deshalb zusätzlich
   ein Abgleich auf die Namensbestandteile. Kein Treffer = der Name wird als
   reine Momentaufnahme übernommen (erpSb fällt darauf zurück). */
function findeSachbearbeiter(name){
  var t=norm(name);
  if(!t)return null;
  var users=[];
  try{
    var u=GemaAuth.getCurrentUser();
    users=(GemaAuth.getUsers()||[]).filter(function(x){return x&&x.active!==false&&(!u||x.orgId===u.orgId);});
  }catch(e){}
  var hit=users.find(function(x){return norm(x.name)===t;});
  if(!hit)hit=users.find(function(x){
    return (s(x.name).split(/\s+/).map(norm).indexOf(t)>=0);
  });
  if(!hit)hit=users.find(function(x){return norm(x.name).indexOf(t)>=0&&t.length>=3;});
  return hit?{userId:hit.id,name:hit.name}:{userId:'',name:s(name)};
}
/* Abteilung → GEMA-Arbeitsbereich (org.settings.arbeitsbereiche).
   Fehlt der Bereich, wird er angelegt — sonst ginge die Zuordnung des
   Altsystems still verloren. */
var _abCache=null;
function findeBereich(label){
  var lab=s(label);if(!lab)return '';
  if(!_abCache){
    _abCache=[];
    try{
      var o=GemaAuth.getCurrentOrg&&GemaAuth.getCurrentOrg();
      _abCache=((o&&o.settings&&o.settings.arbeitsbereiche)||[]).slice();
    }catch(e){}
  }
  var hit=_abCache.find(function(b){return norm(b.label||b.name)===norm(lab);});
  if(hit)return hit.id;
  var id='ab_'+norm(lab);
  _abCache.push({id:id,label:lab,farbe:'#64748b'});
  try{
    // KRITISCH: updateOrgSettings(orgId, settings) — die orgId ist das ERSTE
    // Argument. Ohne sie findet die Funktion die Org nicht und gibt still
    // `false` zurück; der Arbeitsbereich wäre nie gespeichert worden.
    var o2=GemaAuth.getCurrentOrg&&GemaAuth.getCurrentOrg();
    if(o2&&o2.id)GemaAuth.updateOrgSettings(o2.id,{arbeitsbereiche:_abCache.slice()});
  }catch(e){}
  return id;
}

/* Baut den Plan: was würde passieren? Ohne jeden Schreibzugriff. */
function vorbereiten(opts){
  var sekId=opts.sektion, rows=opts.rows||[], map=opts.mapping||{};
  var zeilen=[],stats={neu:0,aktualisiert:0,unveraendert:0,fehler:0,adressenNeu:0};
  var bestand=sekId==='objekte'?bestehendeObjekte():[];
  var bekannt={};
  bestand.forEach(function(o){bekannt[objektSchluessel(o)]=o;});
  if(sekId==='offerten')bestehendeDocs().filter(function(d){return d.typ==='offerte';})
    .forEach(function(d){bekannt[dokSchluessel('offerte',d)]=d;});
  if(sekId==='auftraege')bestehendeDocs().filter(function(d){return d.typ==='auftrag';})
    .forEach(function(d){bekannt[dokSchluessel('auftrag',d)]=d;});
  if(sekId==='rechnungen')bestehendeDocs().filter(function(d){return d.typ==='rechnung';})
    .forEach(function(d){bekannt[dokSchluessel('rechnung',d)]=d;});
  if(sekId==='kreditoren')bestehendeKreditoren().forEach(function(k){bekannt[kredSchluessel(k)]=k;});
  var ix=(sekId==='positionen'||sekId==='zahlungen')?dokIndex():null;
  // Positionen ersetzen die Sammelposition, aber NIE ein von Hand erfasstes
  // Leistungsverzeichnis. Was übersprungen würde, steht schon in der Vorschau.
  var posGesehen={};
  var warnungen=[];
  if(rows.length>50000)warnungen.push('Die Datei hat '+rows.length.toLocaleString('de-CH')+' Zeilen. '
    +'Der Import läuft im Browser — bei mehr als etwa 50 000 Zeilen wird er sehr langsam und kann am '
    +'Arbeitsspeicher scheitern. Besser in Jahresscheiben exportieren und nacheinander einlesen.');
  var adrGesehen={};
  rows.forEach(function(row,i){
    var z=normalisiereZeile(row,map,sekId);
    var hin=pruefe(z,sekId);
    var fehler=hin.some(function(h){return h.typ==='fehler';});
    var aktion='neu';
    if(fehler){aktion='fehler';stats.fehler++;}
    else if(sekId==='objekte'){
      var k=objektSchluessel(z);
      if(bekannt[k]){aktion='aktualisiert';stats.aktualisiert++;}
      else{stats.neu++;bekannt[k]={};}
      // Adressen zählen (nur zur Anzeige)
      Object.keys(z.slots||{}).forEach(function(sl){
        var sd=z.slots[sl];
        var key=s(sd.nr)?('nr:'+sd.nr):('x:'+norm(sd.adresse.firma+sd.adresse.plz));
        if(!adrGesehen[key]){
          adrGesehen[key]=1;
          var vorhanden=null;
          try{
            vorhanden=sd.nr&&window.GemaAdressen?GemaAdressen.byNr(sd.nr):null;
            if(!vorhanden&&window.GemaAdressen){
              var probe=GemaAdressen.upsertVonImport(Object.assign({nr:sd.nr},sd.adresse));
              vorhanden=probe.aktion!=='neu';
            }
          }catch(e){}
          if(!vorhanden)stats.adressenNeu++;
        }
      });
    }else if(sekId==='offerten'){
      var dk=dokSchluessel('offerte',z);
      if(bekannt[dk]){aktion='aktualisiert';stats.aktualisiert++;}
      else{stats.neu++;bekannt[dk]={};}
    }else if(sekId==='auftraege'){
      var ak=dokSchluessel('auftrag',z);
      if(bekannt[ak]){aktion='aktualisiert';stats.aktualisiert++;}
      else{stats.neu++;bekannt[ak]={};}
    }else if(sekId==='rechnungen'){
      var rk=dokSchluessel('rechnung',z);
      if(bekannt[rk]){aktion='aktualisiert';stats.aktualisiert++;}
      else{stats.neu++;bekannt[rk]={};}
    }else if(sekId==='positionen'){
      var pdoc=dokFinden(ix,z.belegTyp,z.belegNr,z.belegExtId);
      if(!pdoc){
        hin.push({typ:'fehler',text:'Beleg «'+(s(z.belegNr)||s(z.belegExtId))+'» nicht gefunden — zuerst Offerten und Rechnungen importieren.'});
        aktion='fehler';stats.fehler++;
      }else{
        // Den Hinweis nur EINMAL je Beleg setzen — sonst stünde er bei jeder
        // der oft mehreren hundert Positionen desselben Belegs.
        if(!posGesehen[pdoc.id]){
          posGesehen[pdoc.id]=1;
          if((pdoc.positionen||[]).length&&!istSammelposition(pdoc))
            hin.push({typ:'warn',text:'Beleg «'+s(pdoc.nr)+'» führt bereits Positionen — er bleibt unverändert.'});
        }
        stats.neu++;
      }
    }else if(sekId==='zahlungen'){
      var zdoc=dokFinden(ix,'rechnung',z.belegNr,'');
      if(!zdoc){
        hin.push({typ:'fehler',text:'Rechnung «'+s(z.belegNr)+'» nicht gefunden — zuerst die Rechnungen importieren.'});
        aktion='fehler';stats.fehler++;
      }else stats.neu++;
    }else if(sekId==='kreditoren'){
      var kk=kredSchluessel(z);
      if(bekannt[kk]){aktion='aktualisiert';stats.aktualisiert++;}
      else{stats.neu++;bekannt[kk]={};}
    }else{
      aktion='neu';stats.neu++;
    }
    zeilen.push({nr:i+1,roh:row,ziel:z,aktion:aktion,hinweise:hin});
  });
  return {sektion:sekId,zeilen:zeilen,stats:stats,mapping:map,warnungen:warnungen};
}

// ── Laufzeit: Ausführen ─────────────────────────────────────────────────
function jetzt(){return new Date().toISOString();}
function uid(p){return (p||'x')+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);}

/* Legt/ergänzt eine Adresse und liefert den gespeicherten Record.

   `ctx.bestand` ist die EINMAL gelesene Adressliste, die über den ganzen Lauf
   mitgeführt wird: neu angelegte Adressen werden hineingeschrieben, damit die
   nächste Zeile sie findet (sonst entstünde pro Zeile eine Dublette, weil der
   Pool-Read dem noch laufenden Speichern hinterherhinkt). */
function adresseSichern(roh,ctx){
  var key=s(roh.nr)?('nr:'+s(roh.nr).toLowerCase()):('x:'+norm([roh.firma,roh.plz,roh.strasse].join('|')));
  if(ctx.cache[key])return Promise.resolve(ctx.cache[key]);
  var res=GemaAdressen.upsertVonImport(roh,{bestand:ctx.bestand});
  if(res.aktion==='unveraendert'){ctx.cache[key]=res.rec;return Promise.resolve(res.rec);}
  return GemaAdressen.save(res.rec).then(function(rec){
    ctx.cache[key]=rec;
    var i=ctx.bestand.findIndex(function(x){return x.id===rec.id;});
    if(i>=0)ctx.bestand[i]=rec;else ctx.bestand.push(rec);
    if(res.aktion==='neu')ctx.neu++;
    return rec;
  });
}

/* Pool-Zugriff für Belege — bewusst bei JEDEM Aufruf frisch gelesen: der
   Auftrags-Import schreibt zwei Dokumente hintereinander (Auftrag + die
   verknüpfte Offerte) und die zweite Schreibung muss die erste sehen. */
function dokPool(){
  var pool=[];
  try{
    if(typeof GemaSync!=='undefined'&&GemaSync.getCached)pool=GemaSync.getCached(DOK_POOL)||[];
    if(!pool.length){var r=localStorage.getItem(DOK_POOL);if(r)pool=JSON.parse(r)||[];}
  }catch(e){}
  return pool.slice();
}
function dokSichern(doc){
  var pool=dokPool();
  var i=pool.findIndex(function(x){return x.id===doc.id;});
  if(i>=0)pool[i]=doc;else pool.push(doc);
  try{localStorage.setItem(DOK_POOL,JSON.stringify(pool));}catch(e){}
  var p=(typeof GemaSync!=='undefined'&&GemaSync.saveRecord)
    ? GemaSync.saveRecord('erp',DOK_PREFIX+doc.id,doc) : Promise.resolve();
  return p.then(function(){return doc;},function(){return doc;});
}

/* Dieselbe Mechanik für die übrigen ERP-Sammlungen: bei JEDEM Aufruf frisch
   lesen, damit aufeinanderfolgende Schreibungen einander sehen. */
var KRED_POOL='gema_erp_kred_pool_v1', KRED_PREFIX='erpkred:';
var KAT_POOL='gema_erp_kat_pool_v1',   KAT_PREFIX='erpkat:';
function poolLesen(key){
  var pool=[];
  try{
    if(typeof GemaSync!=='undefined'&&GemaSync.getCached)pool=GemaSync.getCached(key)||[];
    if(!pool.length){var r=localStorage.getItem(key);if(r)pool=JSON.parse(r)||[];}
  }catch(e){}
  return pool.slice();
}
function poolSichern(key,prefix,rec){
  var pool=poolLesen(key);
  var i=pool.findIndex(function(x){return x.id===rec.id;});
  if(i>=0)pool[i]=rec;else pool.push(rec);
  try{localStorage.setItem(key,JSON.stringify(pool));}catch(e){}
  var p=(typeof GemaSync!=='undefined'&&GemaSync.saveRecord)
    ? GemaSync.saveRecord('erp',prefix+rec.id,rec) : Promise.resolve();
  return p.then(function(){return rec;},function(){return rec;});
}
function eigeneOrgId(){var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}return u?u.orgId:'';}
/* KRITISCH — beide Pools sind org-gescopt und tragen `orgId` auf jedem Record
   (CLAUDE.md §3): ohne den Filter sähe der Import fremde Firmen, ohne den
   Stempel beim Schreiben lehnt RLS den Record ab. */
function bestehendeKreditoren(){
  var o=eigeneOrgId();
  return poolLesen(KRED_POOL).filter(function(k){return k&&(!o||k.orgId===o);});
}
function bestehendeKataloge(){
  var o=eigeneOrgId();
  return poolLesen(KAT_POOL).filter(function(k){return k&&(!o||k.orgId===o);});
}
function kredSchluessel(k){
  var ext=s(k&&(k.extId||(k.quelle&&k.quelle.extId)));
  if(ext)return 'ext:'+ext.toLowerCase();
  return 'lr:'+norm([k&&k.lieferant,k&&k.rechnungsNr].join('|'));
}
/* Beleg-Nachschlag für Positionen und Zahlungen: Nummer UND Alt-ID, weil der
   Positions-Export je nach Abfrage das eine oder das andere liefert. */
function dokIndex(){
  var ix={};
  bestehendeDocs().forEach(function(d){
    if(!d||!d.typ)return;
    if(s(d.nr))ix[d.typ+'|nr:'+norm(d.nr)]=d;
    var ext=s(d.extId||(d.quelle&&d.quelle.extId));
    if(ext)ix[d.typ+'|ext:'+norm(ext)]=d;
  });
  return ix;
}
function dokFinden(ix,typ,nr,extId){
  return (s(nr)&&ix[typ+'|nr:'+norm(nr)])||(s(extId)&&ix[typ+'|ext:'+norm(extId)])||null;
}

/* Objekt zu einem Beleg auflösen: vorhandenes über Strasse + PLZ finden,
   sonst (auf Wunsch) anlegen. Bringt der Beleg Bezugspersonen mit — beim
   Auftrag Besteller und Bewohner —, werden sie am Objekt ERGÄNZT (Dedupe
   über Name + Vorname); Bestehendes wird nie überschrieben. */
function objektFuerBeleg(oa,kd,personen,orgId,report,opts){
  oa=oa||{};opts=opts||{};
  if(!s(oa.strasse)&&!s(oa.plz))return Promise.resolve(null);
  var found=findeObjekt(oa,bestehendeObjekte());
  var neu=!found;
  if(neu&&opts.objekteAnlegen===false)return Promise.resolve(null);
  var o=found?Object.assign({},found):{
    id:uid('obj'), orgId:orgId,
    name:[s(oa.strasse),s(oa.strasse2)].filter(Boolean).join(' · ')||[s(oa.plz),s(oa.ort)].filter(Boolean).join(' '),
    strasse:s(oa.strasse), adresszusatz:s(oa.strasse2), plz:s(oa.plz), ort:s(oa.ort),
    egid:s(oa.egid), egrid:s(oa.egrid),
    bauvorhaben:'Umbau', status:'aktiv', beteiligte:[], bezugspersonen:[],
    adressen:kd?{zahler:{adressId:kd.id,nr:kd.nr||'',snapshot:GemaAdressen.snapshot(kd)}}:{},
    quelle:{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt()},
    createdAt:jetzt()
  };
  var neuePers=(personen||[]).filter(function(p){return s(p.name);});
  if(!neu&&!neuePers.length)return Promise.resolve(found);
  if(neuePers.length){
    var bp=(o.bezugspersonen||[]).slice();
    neuePers.forEach(function(p){
      var da=bp.some(function(x){
        return norm(x.name)===norm(p.name)&&norm(x.vorname)===norm(p.vorname||'');
      });
      if(da)return;
      bp.push({
        id:uid('bp'), anrede:'', vorname:'', name:s(p.name),
        typen:p.typ?[p.typ]:[], tel:s(p.tel), natel:'', email:'',
        wohnung:s(p.wohnung||''), bemerkung:''
      });
    });
    o.bezugspersonen=bp;
  }
  o.updatedAt=jetzt();
  return GemaObjekte.upsertObjekt(o).then(function(){
    if(neu)report.objekteNeu=(report.objekteNeu||0)+1;
    return o;
  });
}

/* Schreibt EINE Rechnung als echtes GEMA-Dokument.

   Der Export führt den fakturierten Betrag, aber keine Positionen — es
   entsteht EINE Sammelposition mit dem Nettobetrag (Muster Offerte). Bei
   einer Schlussrechnung wird `erpSchlussPositionen` bewusst NICHT gerechnet:
   der importierte Betrag IST der fakturierte, er darf nicht neu hergeleitet
   werden.

   Zahlungen bringt der Export nicht mit. Die Rechnung entsteht als
   «gestellt»; `opts.bezahltVor` (Stichtag, vom Nutzer im letzten Schritt
   gesetzt) markiert ältere Belege als bezahlt — bewusst eine EXPLIZITE
   Entscheidung, keine stille Annahme. */
function rechnungSchreiben(z,adrCtx,report,opts){
  opts=opts||{};
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var orgId=u?u.orgId:'';
  var docs=bestehendeDocs();
  var alt=docs.filter(function(d){return d.typ==='rechnung';})
    .find(function(d){return dokSchluessel('rechnung',d)===dokSchluessel('rechnung',z);})||null;
  var auf=null;
  if(s(z.auftragNr)){
    var an=norm(z.auftragNr);
    auf=docs.find(function(d){return d.typ==='auftrag'&&norm(d.nr)===an;})||null;
    if(!auf)report.auftragFehlt=(report.auftragFehlt||0)+1;
  }

  var kundeP=Promise.resolve(null);
  if(s(z.kunde&&z.kunde.firma))kundeP=adresseSichern(Object.assign({},z.kunde),adrCtx);
  return kundeP.then(function(kd){
    return objektFuerBeleg(z.objekt,kd,z.personen,orgId,report,opts).then(function(obj){
      // Der Rechnungs-Export führt keinen Sachbearbeiter — er kommt vom
      // verknüpften Auftrag (Muster erpSbNeu), sonst bleibt er leer und
      // `erpSb` fällt auf den Ersteller zurück.
      var sb=s(z.sachb)?findeSachbearbeiter(z.sachb):(auf&&auf.sachbearbeiter)||null;
      var bereichId=findeBereich(z.abteilung);
      var doc=alt?Object.assign({},alt):{
        id:uid('doc'), typ:'rechnung', orgId:orgId,
        positionen:[], rabattPct:0, schluss:[], zahlungen:[], verknuepfung:{},
        erstelltVon:{userId:u?u.id:'',name:u?u.name:''}, erstelltAm:jetzt()
      };
      function fuelle(f,v){if(s(v)&&!s(doc[f]))doc[f]=s(v);}
      fuelle('nr',z.nr);
      fuelle('datum',z.datum);
      fuelle('titel',z.titel);
      if(!doc.extId)doc.extId=z.extId;
      if(!doc.rechnungsArt)doc.rechnungsArt=z.art;
      if(!doc.bereichId&&bereichId)doc.bereichId=bereichId;
      if(!doc.sachbearbeiter&&sb)doc.sachbearbeiter=sb;
      if(doc.mwstPct==null&&z.mwstPct!=null&&z.mwstPct>0)doc.mwstPct=z.mwstPct;
      if(kd&&!doc.kundeId){doc.kundeId=kd.id;doc.kundeSnapshot=GemaAdressen.snapshot(kd);}
      if(obj&&!doc.objektId){doc.objektId=obj.id;doc.objektName=obj.name||'';}
      if(s(z.ref1)&&!s(doc.externeRef1))doc.externeRef1=s(z.ref1);
      if(s(z.ref2)&&!s(doc.externeRef2))doc.externeRef2=s(z.ref2);
      if(s(z.wohnung)&&!s(doc.wohnung))doc.wohnung=s(z.wohnung);
      // Zahlungsfrist: aus der Zahlungsbedingung, sonst Firmen-Standard.
      if(!s(doc.frist)&&s(doc.datum)){
        var std=30;
        try{var os=(GemaAuth.getCurrentOrg()||{}).settings||{};std=(os.erp&&os.erp.fristTage)||30;}catch(e){}
        doc.frist=addTage(doc.datum,fristTage(z.zahlbed,std));
      }
      // Vermerke — alles, wofür GEMA kein eigenes Feld führt.
      if(s(z.arbeit)&&!s(doc.importArbeit))doc.importArbeit=s(z.arbeit);
      if(s(z.arbeit)&&!s(doc.arbeitsart))doc.arbeitsart=s(z.arbeit);
      if(s(z.artText)&&!s(doc.importArtText))doc.importArtText=s(z.artText);
      if(s(z.statusText)&&!s(doc.importStatusText))doc.importStatusText=s(z.statusText);
      if(s(z.ausgefuehrt)&&!s(doc.importAusgefuehrt))doc.importAusgefuehrt=s(z.ausgefuehrt);
      if(s(z.versandtAm)&&!s(doc.importVersandtAm))doc.importVersandtAm=s(z.versandtAm);
      if(s(z.printInfo)&&!s(doc.importPrintInfo))doc.importPrintInfo=s(z.printInfo);
      if(s(z.mwstCode)&&!s(doc.importMwstCode))doc.importMwstCode=s(z.mwstCode);
      if(s(z.zahlbed)&&!s(doc.importZahlbed))doc.importZahlbed=s(z.zahlbed);
      // «01» = 30 Tage netto ist aus dem Beispiel-Export belegt — nur dieser
      // eine Fall wird auf die GEMA-Kondition gemappt, alles andere bleibt
      // Vermerk (keine erfundene Zuordnung).
      // Sind die Konditionen importiert, gewinnt die echte Zuordnung; sonst
      // bleibt es bei der belegten Notlösung («01» = 30 Tage netto).
      if(!s(doc.zahlbedId)){
        var zbId=zahlbedIdFuer(z.zahlbed);
        if(zbId)doc.zahlbedId=zbId;
        else if(fristTage(z.zahlbed,0)===30)doc.zahlbedId='netto30';
      }
      if(s(z.adrId)&&!s(doc.importAdrId))doc.importAdrId=s(z.adrId);
      // Fibu-Schlüssel — Vermerke für eine spätere Anbindung an die Buchhaltung.
      if(s(z.fibuBelegNr)&&!s(doc.importFibuBelegNr))doc.importFibuBelegNr=s(z.fibuBelegNr);
      if(s(z.opDebi)&&!s(doc.importOpDebi))doc.importOpDebi=s(z.opDebi);
      if(s(z.kostenstelle)&&!s(doc.importKostenstelle))doc.importKostenstelle=s(z.kostenstelle);
      // ESR-Referenz: nur eine GÜLTIGE wandert in den Nachdruck-QR
      // (erpRefFuer prüft sie nochmals), der Rohwert bleibt in jedem Fall.
      if(s(z.esrRef)&&!s(doc.importEsrRefRoh))doc.importEsrRefRoh=s(z.esrRef);
      if(z.esrOk&&!s(doc.importEsrRef))doc.importEsrRef=s(z.esrRef).replace(/\D/g,'');
      if(auf&&!(doc.verknuepfung&&doc.verknuepfung.auftragId)){
        doc.verknuepfung=doc.verknuepfung||{};
        doc.verknuepfung.auftragId=auf.id;
        // Die Offerte hängt am Auftrag — die Kette bleibt damit vollständig.
        if(auf.verknuepfung&&auf.verknuepfung.offerteId)doc.verknuepfung.offerteId=auf.verknuepfung.offerteId;
      }
      if(!doc.positionen.length&&z.netto!=null){
        doc.positionen=[{
          id:uid('p'), art:'frei',
          bez:'Übernahme aus dem Altsystem — Rechnung '+s(z.nr)+(s(z.titel)?'<br>'+s(z.titel):''),
          menge:1, einheit:'Psch', ep:z.netto,
          // Kennzeichen für den späteren Positions-Import: DIESE Zeile ist ein
          // Platzhalter und darf durch die echten Positionen ersetzt werden.
          importSammel:true
        }];
        doc.importSumme={netto:z.netto,mwst:z.mwst,brutto:z.brutto,satz:z.mwstPct};
      }
      // Status ZULETZT — der Stichtag darf den Export-Status übersteuern.
      if(!doc.status){
        doc.status=z.status;
        if(z.status==='gestellt'&&s(opts.bezahltVor)&&s(doc.datum)&&String(doc.datum)<String(opts.bezahltVor)){
          doc.status='bezahlt';
          doc.zahlungen=[{datum:doc.datum,betrag:(z.brutto!=null?z.brutto:z.netto)||0,
                          bemerkung:'Übernahme aus dem Altsystem (Stichtag-Regel)'}];
          report.alsBezahlt=(report.alsBezahlt||0)+1;
        }
      }
      doc.quelle=doc.quelle||{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:z.extId};
      doc.updatedAt=jetzt();
      return dokSichern(doc).then(function(){if(alt)report.aktualisiert++;else report.neu++;});
    });
  });
}

/* Schreibt EINEN Auftrag als echtes GEMA-Dokument.

   Der Export führt KEINE Beträge — auf Wunsch (Default) werden die Positionen
   der über `offert_nr` verknüpften Offerte übernommen, sonst entsteht der
   Auftrag ohne Positionen und die Beträge kommen mit dem Rechnungs-Import.
   Die Verknüpfung wird BEIDSEITIG gesetzt (wie «Auftrag erstellen» im ERP). */
function auftragSchreiben(z,adrCtx,report,opts){
  opts=opts||{};
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var orgId=u?u.orgId:'';
  var docs=bestehendeDocs();
  var alt=docs.filter(function(d){return d.typ==='auftrag';})
    .find(function(d){return dokSchluessel('auftrag',d)===dokSchluessel('auftrag',z);})||null;
  var off=null;
  if(s(z.offertNr)){
    var on=norm(z.offertNr);
    off=docs.find(function(d){return d.typ==='offerte'&&norm(d.nr)===on;})||null;
    if(!off)report.offerteFehlt=(report.offerteFehlt||0)+1;
  }

  var kundeP=Promise.resolve(null);
  if(s(z.kunde&&z.kunde.firma))kundeP=adresseSichern(Object.assign({},z.kunde),adrCtx);
  return kundeP.then(function(kd){
    return objektFuerBeleg(z.objekt,kd,z.personen,orgId,report,opts).then(function(obj){
      var sb=findeSachbearbeiter(z.sachb);
      var bereichId=findeBereich(z.abteilung);
      var doc=alt?Object.assign({},alt):{
        id:uid('doc'), typ:'auftrag', orgId:orgId,
        positionen:[], rabattPct:0, schluss:[], zahlungen:[], verknuepfung:{},
        erstelltVon:{userId:u?u.id:'',name:u?u.name:''}, erstelltAm:jetzt()
      };
      function fuelle(f,v){if(s(v)&&!s(doc[f]))doc[f]=s(v);}
      fuelle('nr',z.nr);
      fuelle('datum',z.datum);
      fuelle('titel',z.titel);
      if(!doc.extId)doc.extId=z.extId;
      if(!doc.status)doc.status=z.status;
      if(!doc.bereichId&&bereichId)doc.bereichId=bereichId;
      if(!doc.sachbearbeiter&&sb)doc.sachbearbeiter=sb;
      if(kd&&!doc.kundeId){doc.kundeId=kd.id;doc.kundeSnapshot=GemaAdressen.snapshot(kd);}
      if(obj&&!doc.objektId){doc.objektId=obj.id;doc.objektName=obj.name||'';}
      // Schlüssel/Zutritt ist ein GEMA-eigenes Feld — es speist die Termine.
      if(s(z.schluessel&&z.schluessel.code)&&!(doc.schluessel&&s(doc.schluessel.code)))
        doc.schluessel={code:s(z.schluessel.code),info:s(z.schluessel.info)};
      if(s(z.wohnung)&&!s(doc.wohnung))doc.wohnung=s(z.wohnung);
      // Alles, was GEMA nicht als eigenes Feld führt, bleibt als Vermerk am
      // Beleg erhalten — nichts aus dem Altsystem verschwindet stillschweigend.
      if(s(z.arbeit)&&!s(doc.importArbeit))doc.importArbeit=s(z.arbeit);
      if(s(z.arbeit)&&!s(doc.arbeitsart))doc.arbeitsart=s(z.arbeit);
      if(s(z.statusText)&&!s(doc.importStatusText))doc.importStatusText=s(z.statusText);
      if(s(z.rechnStatus)&&!s(doc.importRechnungsstatus))doc.importRechnungsstatus=s(z.rechnStatus);
      if(s(z.rechnungNr)&&!s(doc.importRechnungNr))doc.importRechnungNr=s(z.rechnungNr);
      if(s(z.bemerkung)&&!s(doc.notiz))doc.notiz=s(z.bemerkung);
      if(off&&!(doc.verknuepfung&&doc.verknuepfung.offerteId)){
        doc.verknuepfung=doc.verknuepfung||{};
        doc.verknuepfung.offerteId=off.id;
      }
      // Positionen NUR bei einem noch leeren Auftrag aus der Offerte holen —
      // ein bereits erfasstes Leistungsverzeichnis bleibt unangetastet.
      if(off&&opts.posAusOfferte!==false&&!doc.positionen.length&&(off.positionen||[]).length){
        doc.positionen=JSON.parse(JSON.stringify(off.positionen));
        doc.schluss=JSON.parse(JSON.stringify(off.schluss||[]));
        if(doc.rabattPct==null||!doc.rabattPct)doc.rabattPct=off.rabattPct||0;
        if(doc.mwstPct==null&&off.mwstPct!=null)doc.mwstPct=off.mwstPct;
        if(!doc.posCols&&off.posCols)doc.posCols=off.posCols.slice();
        report.posUebernommen=(report.posUebernommen||0)+1;
      }
      doc.quelle=doc.quelle||{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:z.extId};
      doc.updatedAt=jetzt();
      return dokSichern(doc).then(function(){
        if(alt)report.aktualisiert++;else report.neu++;
        // Gegenrichtung: die Offerte zeigt auf den Auftrag (wie erpZuAuftrag).
        if(!off)return;
        var akt=dokPool().find(function(x){return x.id===off.id;})||off;
        if(akt.verknuepfung&&akt.verknuepfung.auftragId)return;
        var o2=Object.assign({},akt);
        o2.verknuepfung=Object.assign({},o2.verknuepfung||{});
        o2.verknuepfung.auftragId=doc.id;
        o2.updatedAt=jetzt();
        return dokSichern(o2);
      });
    });
  });
}

/* Schreibt EINE Offerte als echtes GEMA-Dokument.

   Kunde und Objekt werden dabei aufgelöst bzw. angelegt. Enthält der Export
   keine Positionen (der Beispiel-Export liefert nur Kopfdaten + Summen),
   entsteht EINE klar beschriftete Sammelposition mit dem Nettobetrag —
   damit stimmen Total, MwSt und PDF, und das Dokument verhält sich wie
   jedes andere (duplizieren, in einen Auftrag überführen …). */
function offerteSchreiben(z,adrCtx,report,opts){
  opts=opts||{};
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var orgId=u?u.orgId:'';
  var docs=bestehendeDocs().filter(function(d){return d.typ==='offerte';});
  var alt=docs.find(function(d){return dokSchluessel('offerte',d)===dokSchluessel('offerte',z);})||null;

  // 1) Kunde (Rechnungsempfänger)
  var kundeP=Promise.resolve(null);
  if(s(z.kunde&&z.kunde.firma)){
    var roh=Object.assign({},z.kunde);
    if(roh.nr)roh.extId='adr:'+roh.nr;
    kundeP=adresseSichern(roh,adrCtx);
  }
  return kundeP.then(function(kd){
    // 2) Objekt — verknüpfen, sonst (auf Wunsch) anlegen
    return objektFuerBeleg(z.objekt,kd,null,orgId,report,opts).then(function(obj){
      var sb=findeSachbearbeiter(z.sachb);
      var bereichId=findeBereich(z.abteilung);
      var doc=alt?Object.assign({},alt):{
        id:uid('doc'), typ:'offerte', orgId:orgId,
        positionen:[], rabattPct:0, schluss:[], zahlungen:[], verknuepfung:{},
        erstelltVon:{userId:u?u.id:'',name:u?u.name:''}, erstelltAm:jetzt()
      };
      function fuelle(f,v){if(s(v)&&!s(doc[f]))doc[f]=s(v);}
      fuelle('nr',z.nr);
      fuelle('datum',z.datum);
      fuelle('gueltigBis',z.gueltigBis);
      fuelle('titel',z.titel);
      fuelle('anrede',z.anrede);
      if(!doc.extId)doc.extId=z.extId;
      if(!doc.status)doc.status=z.status;
      if(!doc.bereichId&&bereichId)doc.bereichId=bereichId;
      if(!doc.sachbearbeiter&&sb)doc.sachbearbeiter=sb;
      if(doc.mwstPct==null&&z.mwstPct!=null&&z.mwstPct>0)doc.mwstPct=z.mwstPct;
      if(kd&&!doc.kundeId){doc.kundeId=kd.id;doc.kundeSnapshot=GemaAdressen.snapshot(kd);}
      if(obj&&!doc.objektId){doc.objektId=obj.id;doc.objektName=obj.name||'';}
      if(s(z.ref1)&&!s(doc.externeRef1))doc.externeRef1=s(z.ref1);
      if(s(z.ref2)&&!s(doc.externeRef2))doc.externeRef2=s(z.ref2);
      if(s(z.wohnung)&&!s(doc.wohnung))doc.wohnung=s(z.wohnung);
      // Sammelposition NUR bei einem noch leeren Dokument — ein bereits
      // erfasstes Leistungsverzeichnis wird beim Wiederholungs-Import
      // niemals überschrieben oder ergänzt.
      if(!doc.positionen.length&&z.netto!=null){
        doc.positionen=[{
          id:uid('p'), art:'frei',
          bez:'Übernahme aus dem Altsystem — Offerte '+s(z.nr)+(s(z.titel)?'<br>'+s(z.titel):''),
          menge:1, einheit:'Psch', ep:z.netto,
          // Kennzeichen für den späteren Positions-Import: DIESE Zeile ist ein
          // Platzhalter und darf durch die echten Positionen ersetzt werden.
          importSammel:true
        }];
        doc.importSumme={netto:z.netto,mwst:z.mwst,brutto:z.brutto,satz:z.mwstPct};
      }
      doc.quelle=doc.quelle||{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:z.extId};
      doc.updatedAt=jetzt();
      return dokSichern(doc).then(function(){if(alt)report.aktualisiert++;else report.neu++;});
    });
  });
}

/* Eine normalisierte Zeile → GEMA-Position.

   KRITISCH — die Kalkulationswerte landen unter `importKalk` und NICHT in den
   Rechenfeldern von GEMA. Der importierte EP ist der tatsächlich fakturierte
   Preis; würde GEMA aus Leitfadenzeit und Ansatz neu rechnen, bekäme ein
   abgeschlossener Beleg nachträglich andere Zahlen. Die Werte bleiben damit
   erhalten und sichtbar, ohne etwas zu verschieben.
   Leere Werte werden nicht als 0 geschrieben — «0 % Verschnitt» ist eine
   Aussage, «unbekannt» ist keine. */
function positionRecord(z){
  var p={id:uid('p'), art:z.art, bez:s(z.bez)};
  if(z.art!=='titel'&&z.art!=='text'){
    p.menge=z.menge!=null?z.menge:1;
    p.einheit=s(z.einheit)||'Psch';
    p.ep=z.ep!=null?z.ep:0;
    if(z.rabattPct)p.rabattPct=z.rabattPct;
    if(s(z.dim))p.dim=s(z.dim);
  }
  if(s(z.posNr))p.importPosNr=s(z.posNr);
  var n=z.npk||{};
  if(s(n.kapitel)||s(n.pos))p.importNpk={kapitel:s(n.kapitel),buch:s(n.buch),pos:s(n.pos)};
  var k=z.kalk||{},kal={};
  ['leitfadenZeit','zeitFaktor','ansatz','matPreis','matFaktor','einkRabatt','verschnitt']
    .forEach(function(f){if(k[f]!=null)kal[f]=k[f];});
  if(Object.keys(kal).length)p.importKalk=kal;
  return p;
}

/* Positionen — GRUPPIERT je Beleg geschrieben.

   Ein GEMA-Dokument trägt seine Positionen als Array: 500 Einzelschreibungen
   an denselben Beleg wären 500 Cloud-Pushes, die einander überholen. Deshalb
   wird je Beleg EINMAL geschrieben.

   Die Reihenfolge der Datei ist massgebend, `sort` entscheidet nur bei
   Gleichstand. Die Hierarchie des Altsystems (parent_pos_guid) flacht dabei
   ab — GEMA führt Titel als eigene Zeile und die folgenden Positionen gehören
   optisch dazu, also genau das Bild, das die Sortierung des Exports liefert. */
function positionenSchreiben(zeilen,report,opts){
  opts=opts||{};
  var ix=dokIndex(), grp=[], byId={};
  zeilen.forEach(function(zl,i){
    var z=zl.ziel;
    var doc=dokFinden(ix,z.belegTyp,z.belegNr,z.belegExtId);
    if(!doc){report.belegFehlt=(report.belegFehlt||0)+1;return;}
    var g=byId[doc.id];
    if(!g){g=byId[doc.id]={doc:doc,pos:[]};grp.push(g);}
    g.pos.push({z:z,i:i});
  });
  var kette=Promise.resolve();
  grp.forEach(function(g){
    kette=kette.then(function(){
      var akt=dokPool().find(function(x){return x.id===g.doc.id;})||g.doc;
      // Ein echtes Leistungsverzeichnis wird NIE überschrieben.
      if((akt.positionen||[]).length&&!istSammelposition(akt)){
        report.belegBesetzt=(report.belegBesetzt||0)+1;
        return;
      }
      g.pos.sort(function(a,b){
        var sa=a.z.sort, sb=b.z.sort;
        if(sa!=null&&sb!=null&&sa!==sb)return sa-sb;
        return a.i-b.i;
      });
      var doc=Object.assign({},akt);
      doc.positionen=g.pos.map(function(p){return positionRecord(p.z);});
      doc.updatedAt=jetzt();
      report.posBelege=(report.posBelege||0)+1;
      report.posZeilen=(report.posZeilen||0)+doc.positionen.length;
      report.neu++;
      return dokSichern(doc);
    });
  });
  return kette;
}

/* Bruttobetrag eines Belegs: bevorzugt die beim Kopf-Import gemerkte Summe des
   Altsystems, sonst aus den Positionen gerechnet. */
function belegBrutto(doc){
  if(doc&&doc.importSumme&&doc.importSumme.brutto!=null)return doc.importSumme.brutto;
  var netto=0;
  ((doc&&doc.positionen)||[]).forEach(function(p){
    if(!p||p.art==='titel'||p.art==='text')return;
    netto+=(parseFloat(p.ep)||0)*(parseFloat(p.menge)||0)*(1-((parseFloat(p.rabattPct)||0)/100));
  });
  var satz=(doc&&doc.mwstPct!=null)?doc.mwstPct:8.1;
  return Math.round(netto*(1+satz/100)*100)/100;
}

/* Zahlungen — ebenfalls je Rechnung gruppiert (Akonto + Schluss treffen
   denselben Beleg). Der Status wird nur HOCHGESTUFT: eine stornierte Rechnung
   bleibt storniert, egal was an Zahlungen kommt. */
function zahlungenSchreiben(zeilen,report,opts){
  opts=opts||{};
  var ix=dokIndex(), grp=[], byId={};
  zeilen.forEach(function(zl){
    var z=zl.ziel;
    var doc=dokFinden(ix,'rechnung',z.belegNr,'');
    if(!doc){report.belegFehlt=(report.belegFehlt||0)+1;return;}
    var g=byId[doc.id];
    if(!g){g=byId[doc.id]={doc:doc,zl:[]};grp.push(g);}
    g.zl.push(z);
  });
  var kette=Promise.resolve();
  grp.forEach(function(g){
    kette=kette.then(function(){
      var akt=dokPool().find(function(x){return x.id===g.doc.id;})||g.doc;
      var doc=Object.assign({},akt);
      var za=(doc.zahlungen||[]).slice(), neu=0;
      g.zl.forEach(function(z){
        var datum=s(z.datum)||s(doc.datum);
        var betrag=Math.round((z.betrag||0)*100)/100;
        if(!betrag)return;
        // Wiederholungs-Import darf keine Dubletten erzeugen.
        var da=za.some(function(x){
          return s(x.datum)===datum&&Math.round((parseFloat(x.betrag)||0)*100)/100===betrag;
        });
        if(da)return;
        za.push({datum:datum,betrag:betrag,bemerkung:s(z.bemerkung)||'Übernahme aus dem Altsystem'});
        neu++;
      });
      if(!neu)return;
      doc.zahlungen=za;
      var summe=za.reduce(function(a,x){return a+(parseFloat(x.betrag)||0);},0);
      var soll=belegBrutto(doc);
      // 5 Rappen Toleranz — Rundungsdifferenzen zwischen den Systemen.
      if(doc.status!=='storniert'&&soll>0&&summe+0.05>=soll){
        if(doc.status!=='bezahlt')report.alsBezahlt=(report.alsBezahlt||0)+1;
        doc.status='bezahlt';
      }
      doc.updatedAt=jetzt();
      report.zahlungen=(report.zahlungen||0)+neu;
      report.neu+=neu;
      return dokSichern(doc);
    });
  });
  return kette;
}

/* Einen Kreditor schreiben. Der Lieferant ist im GEMA-Kreditor ein Textfeld —
   es entsteht bewusst KEIN Adressstamm-Eintrag, sonst stünden 12 000
   Lieferantenrechnungen mit je einer Adress-Dublette im Kundenstamm. */
function kreditorSchreiben(z,report,opts){
  opts=opts||{};
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var orgId=u?u.orgId:'';
  var alt=bestehendeKreditoren().find(function(k){return kredSchluessel(k)===kredSchluessel(z);})||null;
  var auf=null;
  if(s(z.auftragNr)){
    var an=norm(z.auftragNr);
    auf=dokPool().find(function(d){
      return d.typ==='auftrag'&&norm(d.nr)===an&&(!orgId||d.orgId===orgId);
    })||null;
    if(!auf)report.auftragFehlt=(report.auftragFehlt||0)+1;
  }
  var k=alt?JSON.parse(JSON.stringify(alt)):{
    id:uid('kred'), orgId:orgId, status:'offen', verlauf:[],
    erstelltVon:{userId:u?u.id:'',name:u?u.name:''}, erstelltAm:jetzt()
  };
  function fuelle(f,v){if(s(v)&&!s(k[f]))k[f]=s(v);}
  fuelle('lieferant',z.lieferant);
  fuelle('rechnungsNr',z.rechnungsNr);
  fuelle('datum',z.datum);
  fuelle('faelligBis',z.faellig);
  fuelle('beschrieb',z.beschrieb);
  if(!s(k.extId))k.extId=s(z.extId);
  if(k.betrag==null&&z.betrag!=null)k.betrag=Math.round(z.betrag*100)/100;
  if(!alt&&z.status)k.status=z.status;
  if(auf&&!s(k.auftragId)){k.auftragId=auf.id;k.auftragNr=s(auf.nr);}
  // Vermerke — alles, wofür GEMA kein eigenes Feld führt, bleibt am Datensatz.
  [['importNr',z.nr],['importStatusText',z.statusText],['importKonto',z.konto],
   ['importKostenstelle',z.kostenstelle],['importIban',z.iban],
   ['importEsrRef',z.esrRef],['importSesamOpNr',z.sesamOpNr]].forEach(function(p){
    if(s(p[1])&&!s(k[p[0]]))k[p[0]]=s(p[1]);
  });
  if(k.importMwstBetrag==null&&z.mwstBetrag!=null)k.importMwstBetrag=z.mwstBetrag;
  if(k.importRestBetrag==null&&z.restBetrag!=null)k.importRestBetrag=z.restBetrag;
  if(!alt){
    k.verlauf=(k.verlauf||[]).concat([{
      am:jetzt(), was:'Übernommen aus dem Altsystem',
      von:{userId:u?u.id:'',name:u?u.name:''}
    }]);
  }
  k.quelle=k.quelle||{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:s(z.extId)};
  k.updatedAt=jetzt();
  return poolSichern(KRED_POOL,KRED_PREFIX,k).then(function(){
    if(alt)report.aktualisiert++;else report.neu++;
  });
}

/* Artikel — gruppiert je Katalog. Bestehende Artikel werden nie überschrieben;
   erkannt werden sie über die Alt-ID, ersatzweise über die Bezeichnung. */
function artikelSchreiben(zeilen,report,opts){
  opts=opts||{};
  var orgId=eigeneOrgId();
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var grp={}, reihe=[];
  zeilen.forEach(function(zl){
    var z=zl.ziel;
    var name=s(z.katalog)||'Übernahme Altsystem';
    if(!grp[name]){grp[name]=[];reihe.push(name);}
    grp[name].push(z);
  });
  var kette=Promise.resolve();
  reihe.forEach(function(name){
    kette=kette.then(function(){
      var kat=bestehendeKataloge().find(function(k){return norm(k.name)===norm(name);})||null;
      var neuKat=!kat;
      kat=kat?JSON.parse(JSON.stringify(kat)):{
        id:uid('kat'), orgId:orgId, name:name, artikel:[],
        erstelltVon:{userId:u?u.id:'',name:u?u.name:''}, erstelltAm:jetzt()
      };
      var arts=(kat.artikel||[]).slice(), da={};
      arts.forEach(function(a){
        if(s(a.extId))da['ext:'+norm(a.extId)]=1;
        da['bez:'+norm(a.bez)]=1;
      });
      var zu=0;
      grp[name].forEach(function(z){
        var ek=s(z.extId)?('ext:'+norm(z.extId)):'';
        if(ek&&da[ek])return;
        if(!ek&&da['bez:'+norm(z.bez)])return;
        var a={id:uid('a'), bez:s(z.bez), einheit:s(z.einheit)||'Stk', ep:z.ep!=null?z.ep:0};
        if(s(z.extId))a.extId=s(z.extId);
        if(s(z.artNr))a.artNr=s(z.artNr);
        if(s(z.dim))a.dim=s(z.dim);
        var kal={};
        ['matPreis','einkRabatt','verschnitt','leitfadenZeit','ansatz'].forEach(function(f){
          if(z.kalk&&z.kalk[f]!=null)kal[f]=z.kalk[f];
        });
        if(Object.keys(kal).length)a.importKalk=kal;
        arts.push(a);
        if(ek)da[ek]=1;
        da['bez:'+norm(z.bez)]=1;
        zu++;
      });
      if(!zu&&!neuKat)return;
      kat.artikel=arts;
      kat.updatedAt=jetzt();
      report.artikel=(report.artikel||0)+zu;
      report.neu+=zu;
      if(neuKat)report.kataloge=(report.kataloge||0)+1;
      return poolSichern(KAT_POOL,KAT_PREFIX,kat);
    });
  });
  return kette;
}

/* Zahlungsbedingungen → org.settings.erp.zahlbed. EINE Schreibung für alle
   Zeilen; Bestehendes bleibt unverändert (ergänzen, nie ersetzen).
   Die id wird aus dem Kürzel gebildet und bleibt damit stabil, auch wenn
   jemand die Bezeichnung später ändert (CLAUDE.md §2). */
function zahlbedSchreiben(zeilen,report,opts){
  var org=null;try{org=GemaAuth.getCurrentOrg&&GemaAuth.getCurrentOrg();}catch(e){}
  if(!org||!org.id)return Promise.reject(new Error('Firma nicht geladen — die Zahlungsbedingungen können nicht gespeichert werden.'));
  var st=org.settings||{};
  var liste=(((st.erp||{}).zahlbed)||[]).slice();
  var da={};
  liste.forEach(function(z){da[norm(z.id)]=1;da['l:'+norm(z.label)]=1;});
  var zu=0;
  zeilen.forEach(function(zl){
    var z=zl.ziel;
    var kuerzel=s(z.kuerzel);
    var id='alt_'+norm(kuerzel);
    if(da[norm(id)]||da['l:'+norm(z.label)]){report.uebersprungen++;return;}
    var rec={id:id, label:s(z.label), tage:z.tage!=null?z.tage:30, importKuerzel:kuerzel};
    if(z.skontoPct)rec.skontoPct=z.skontoPct;
    if(z.skontoTage)rec.skontoTage=z.skontoTage;
    if(s(z.fibuCode))rec.importFibuCode=s(z.fibuCode);
    liste.push(rec);
    da[norm(id)]=1;da['l:'+norm(z.label)]=1;
    zu++;
  });
  report.neu+=zu;
  if(!zu)return Promise.resolve();
  var erp=Object.assign({},st.erp||{},{zahlbed:liste});
  // updateOrgSettings(orgId, settings) — die orgId ist das ERSTE Argument,
  // sonst findet die Funktion die Firma nicht und gibt still `false` zurück.
  return Promise.resolve(GemaAuth.updateOrgSettings(org.id,{erp:erp})).then(function(){
    zahlbedAusOrgLaden();
  });
}

/* Füllt die Kürzel→Tage-Tabelle der Engine aus den Firmen-Einstellungen. So
   wirkt ein früher gelaufener Konditions-Import auch in einer SPÄTEREN
   Sitzung auf die Zahlungsfrist der importierten Belege. */
function zahlbedAusOrgLaden(){
  var map={};
  try{
    var st=(GemaAuth.getCurrentOrg()||{}).settings||{};
    (((st.erp||{}).zahlbed)||[]).forEach(function(z){
      if(s(z.importKuerzel)&&z.tage!=null)map[s(z.importKuerzel)]=z.tage;
    });
  }catch(e){}
  zahlbedTageSetzen(map);
}
/* GEMA-Konditions-ID zum Kürzel des Altsystems — leer, wenn die Konditionen
   noch nicht importiert wurden. */
function zahlbedIdFuer(kuerzel){
  var t=s(kuerzel);if(!t)return '';
  try{
    var st=(GemaAuth.getCurrentOrg()||{}).settings||{};
    var hit=(((st.erp||{}).zahlbed)||[]).find(function(z){return s(z.importKuerzel)===t;});
    if(hit)return hit.id;
  }catch(e){}
  return '';
}

/* Ergänzt Konditionen und Fibu-Schlüssel am Adressdatensatz und meldet, ob
   etwas geändert wurde. Bestehende Werte bleiben IMMER stehen — der Import
   füllt Lücken, er korrigiert nicht. */
function adressZusatz(z,rec){
  if(!z||!rec)return false;
  var ae=false;
  function txt(f,v){if(!s(v)||s(rec[f]))return;rec[f]=s(v);ae=true;}
  function zahl(f,v){if(v==null||rec[f]!=null)return;rec[f]=v;ae=true;}
  txt('importZahlbedKuerzel',z.zahlbedKuerzel);
  var zbId=zahlbedIdFuer(z.zahlbedKuerzel);
  if(zbId)txt('zahlbedId',zbId);
  txt('importPkDebi',z.pkDebi);
  txt('importPkKredi',z.pkKredi);
  txt('eBillId',z.eBillId);
  txt('rechnungEmail',z.rechnungEmail);
  zahl('stdRabattPct',z.stdRabatt);
  zahl('stdSkontoPct',z.stdSkonto);
  return ae;
}

function ausfuehren(plan,opts){
  opts=opts||{};
  var sekId=plan.sektion;
  var report={neu:0,aktualisiert:0,uebersprungen:0,adressen:0,fehler:[]};
  var zeilen=plan.zeilen.filter(function(z){return z.aktion!=='fehler'&&z.gewaehlt!==false;});
  report.uebersprungen=plan.zeilen.length-zeilen.length;
  zahlbedAusOrgLaden();

  /* Abschnitte, die GRUPPIERT schreiben: viele Zeilen treffen dasselbe Ziel
     (alle Positionen eines Belegs, alle Konditionen der Firma). Sie laufen
     bewusst NICHT durch die Zeilenschleife — sonst würde derselbe Datensatz
     hundertfach hintereinander gespeichert. Sie brauchen auch den
     Adressstamm nicht, darum stehen sie vor dessen Prüfung. */
  function fertig(){return report;}
  function gescheitert(e){report.fehler.push({zeile:0,text:(e&&e.message)||String(e)});return report;}
  if(sekId==='zahlbed')return zahlbedSchreiben(zeilen,report,opts).then(fertig,gescheitert);
  if(sekId==='positionen')return positionenSchreiben(zeilen,report,opts).then(fertig,gescheitert);
  if(sekId==='zahlungen')return zahlungenSchreiben(zeilen,report,opts).then(fertig,gescheitert);
  if(sekId==='artikel')return artikelSchreiben(zeilen,report,opts).then(fertig,gescheitert);

  if(typeof GemaAdressen==='undefined')return Promise.reject(new Error('Adressstamm nicht geladen.'));
  // Adressbestand EINMAL lesen und über den ganzen Lauf mitführen.
  var adrCtx={cache:{},bestand:GemaAdressen.list(),neu:0};

  var bestand={};
  bestehendeObjekte().forEach(function(o){bestand[objektSchluessel(o)]=o;});

  var kette=Promise.resolve();
  zeilen.forEach(function(z,idx){
    kette=kette.then(function(){
      if(opts.onFortschritt)opts.onFortschritt(idx+1,zeilen.length);
      if(sekId==='adressen'){
        var roh=Object.assign({},z.ziel);
        roh.typen=(roh.typen||[]).map(function(t){return GemaAdressen.typIdFuerLabel(t,true);}).filter(Boolean);
        roh.extId=roh.nr?('adr:'+roh.nr):'';
        var r=GemaAdressen.upsertVonImport(roh,{bestand:adrCtx.bestand});
        // Konditionen und Fibu-Schlüssel führt der Adressstamm nicht in seiner
        // Merge-Liste; sie werden hier ergänzt (nie überschrieben). `normalize`
        // reicht unbekannte Felder unverändert durch, darum genügt das.
        var zusatz=adressZusatz(z.ziel,r.rec);
        if(r.aktion==='unveraendert'&&!zusatz){report.uebersprungen++;return;}
        return GemaAdressen.save(r.rec).then(function(rec){
          var i=adrCtx.bestand.findIndex(function(x){return x.id===rec.id;});
          if(i>=0)adrCtx.bestand[i]=rec;else adrCtx.bestand.push(rec);
          if(r.aktion==='neu')report.neu++;else report.aktualisiert++;
        });
      }
      if(sekId==='offerten')return offerteSchreiben(z.ziel,adrCtx,report,opts);
      if(sekId==='auftraege')return auftragSchreiben(z.ziel,adrCtx,report,opts).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
      if(sekId==='rechnungen')return rechnungSchreiben(z.ziel,adrCtx,report,opts).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
      if(sekId==='kreditoren')return kreditorSchreiben(z.ziel,report,opts).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
      // ── Objekte ──
      var z2=z.ziel;
      var slotKeys=Object.keys(z2.slots||{});
      var slotP=Promise.resolve();
      var adressen={};
      slotKeys.forEach(function(sl){
        slotP=slotP.then(function(){
          var sd=z2.slots[sl];
          var roh=Object.assign({nr:sd.nr,extId:sd.nr?('adr:'+sd.nr):''},sd.adresse);
          // Slot-Typ als Kontakt-Typ mitgeben (Korrespondenzadresse/Eigentümer
          // sind im Altsystem auch Typen) — der Nutzer sieht damit sofort,
          // wofür eine Adresse verwendet wird.
          if(sl==='korrespondenz')roh.typen=['korrespondenzadresse'];
          if(sl==='eigentuemer')roh.typen=['eigentuemer'];
          return adresseSichern(roh,adrCtx).then(function(rec){
            adressen[sl]={adressId:rec.id,nr:rec.nr,snapshot:GemaAdressen.snapshot(rec)};
          });
        });
      });
      return slotP.then(function(){
        // Bezugspersonen als eigene Adressen? Nein — sie bleiben am Objekt
        // (im Altsystem sind es Objekt-Bezugspersonen, keine Debitoren).
        var personen=(z2.personen||[]).map(function(p){
          var typId=p.typLabel?GemaAdressen.typIdFuerLabel(p.typLabel,true):'';
          return {
            id:uid('bp'), anrede:'', vorname:s(p.vorname), name:s(p.name),
            typen:typId?[typId]:[], tel:s(p.tel), natel:'', email:s(p.email),
            wohnung:'', bemerkung:''
          };
        }).filter(function(p){return p.name||p.vorname;});

        var k=objektSchluessel(z2);
        var alt=bestand[k]||null;
        var o=alt?Object.assign({},alt):{
          id:uid('obj'), name:'', bauvorhaben:'Umbau', status:'aktiv',
          beteiligte:[], createdAt:jetzt()
        };
        // Ergänzen, nie überschreiben (Muster upsertVonImport)
        function fuelle(feld,wert){if(s(wert)&&!s(o[feld]))o[feld]=s(wert);}
        fuelle('name',z2.name);
        fuelle('strasse',z2.strasse);
        fuelle('adresszusatz',z2.strasse2);
        fuelle('plz',z2.plz);
        fuelle('ort',z2.ort);
        fuelle('egid',z2.egid);
        fuelle('egrid',z2.egrid);
        fuelle('externeRef1',z2.ref1);
        fuelle('externeRef2',z2.ref2);
        fuelle('notizen',z2.notiz);
        o.extId=o.extId||z2.extId;
        o.adressen=Object.assign({},o.adressen||{},adressen);
        // Bezugspersonen zusammenführen (nach Name+Vorname)
        var bp=(o.bezugspersonen||[]).slice();
        personen.forEach(function(p){
          var da=bp.some(function(x){
            return norm(x.name)===norm(p.name)&&norm(x.vorname)===norm(p.vorname);
          });
          if(!da)bp.push(p);
        });
        o.bezugspersonen=bp;
        o.quelle=o.quelle||{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:z2.extId};
        o.updatedAt=jetzt();
        bestand[k]=o;
        return GemaObjekte.upsertObjekt(o).then(function(){
          if(alt)report.aktualisiert++;else report.neu++;
        });
      }).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
    });
  });
  if(sekId==='rechnungen'&&opts.auftragErgaenzen!==false)kette=kette.then(function(){
    return auftraegeAusRechnungen(report,opts);
  });
  return kette.then(function(){
    report.adressen=adrCtx.neu;
    return report;
  });
}

/* Nachlauf des Rechnungs-Imports: LEERE Aufträge mit dem fakturierten Betrag
   ergänzen.

   Warum nötig: Der Auftrags-Export führt keine Beträge. Konnte der Auftrag
   seine Positionen nicht aus einer Offerte übernehmen (Offerte gar nicht im
   Export, oder gar keine Offerte), steht er auf 0 — die Rechnung darauf lässt
   ihn dann als «überverrechnet» erscheinen. Der Betrag stammt NICHT aus einer
   Schätzung, sondern aus den tatsächlich importierten Rechnungen dieses
   Auftrags (Summe, deckt damit auch Akonto + Schluss ab).

   Läuft ERST NACH allen Rechnungen (sonst wüsste die erste nichts von der
   zweiten) und rührt einen Auftrag mit Positionen NIE an. */
function auftraegeAusRechnungen(report,opts){
  var pool=dokPool();
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var summe={};
  pool.forEach(function(d){
    if(!d||d.typ!=='rechnung')return;
    if(u&&d.orgId!==u.orgId)return;
    if(d.status==='storniert')return;
    var aid=d.verknuepfung&&d.verknuepfung.auftragId;
    if(!aid)return;
    var netto=0;
    (d.positionen||[]).forEach(function(p){
      if(p&&p.art==='frei')netto+=(parseFloat(p.ep)||0)*(parseFloat(p.menge)||0);
    });
    if(netto>0)summe[aid]=(summe[aid]||0)+netto;
  });
  var kette=Promise.resolve();
  Object.keys(summe).forEach(function(aid){
    var a=pool.find(function(x){return x.id===aid&&x.typ==='auftrag';});
    if(!a||(a.positionen||[]).length)return;
    kette=kette.then(function(){
      var doc=Object.assign({},a);
      doc.positionen=[{
        id:uid('p'), art:'frei',
        bez:'Übernahme aus dem Altsystem — verrechnet gemäss Rechnung(en)'+(s(doc.nr)?' zu Auftrag '+s(doc.nr):''),
        menge:1, einheit:'Psch', ep:Math.round(summe[aid]*100)/100,
        importSammel:true
      }];
      doc.updatedAt=jetzt();
      report.auftragBetrag=(report.auftragBetrag||0)+1;
      return dokSichern(doc);
    });
  });
  return kette;
}

window.GemaErpImport={
  SEKTIONEN:SEKTIONEN, sektion:sektion,
  leseDatei:leseDatei, leseXlsx:leseXlsx, parseCsv:parseCsv,
  erkenneMapping:erkenneMapping, normalisiereZeile:normalisiereZeile,
  erkenneSektion:erkenneSektion, mappingGuete:mappingGuete,
  IMPORT_REIHENFOLGE:IMPORT_REIHENFOLGE, sektionRang:sektionRang,
  pruefe:pruefe, findeKopfzeile:findeKopfzeile,
  parseAnschrift:parseAnschrift, parseAdressBlock:parseAdressBlock,
  vorbereiten:vorbereiten, ausfuehren:ausfuehren,
  parseDatum:parseDatum, parseBetrag:parseBetrag,
  offertStatus:offertStatus, auftragStatus:auftragStatus,
  rechnungStatus:rechnungStatus, rechnungArt:rechnungArt,
  esrGueltig:esrGueltig, fristTage:fristTage, addTage:addTage,
  objektSchluessel:objektSchluessel,
  posArt:posArt, belegTyp:belegTyp, kreditorStatus:kreditorStatus,
  istSammelposition:istSammelposition, positionRecord:positionRecord,
  belegBrutto:belegBrutto, adressZusatz:adressZusatz,
  MODULE_BELEG:MODULE_BELEG, POSTYP_ART:POSTYP_ART,
  // Engine-Exports für Node-Tests
  serialZuDatum:serialZuDatum, istDatumFmt:istDatumFmt, entescape:entescape,
  spalteZuIndex:spalteZuIndex, norm:norm, pct:pct,
  zahlbedTageSetzen:zahlbedTageSetzen
};

})();
