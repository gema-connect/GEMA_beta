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
function fristTage(zahlbed,standard){
  var t=s(zahlbed);
  var m=/(\d+)\s*tag/i.exec(t);
  if(m)return parseInt(m[1],10);
  if(/^0*1$/.test(t))return 30;
  return standard;
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
    {id:'bemerkungen',label:'Bemerkungen', alias:['bemerkung','bemerkungen','notiz','notizen']}
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
    {id:'nr',         label:'Rechnungs-Nr.', pflicht:true, alias:['rechnungnr','rechnungsnr','rechnungsnummer','belegnr','nr','nummer']},
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
    {id:'wohnStandort',label:'Wohnung — Name / Standort', hint:'Wird als Bezugsperson «Bewohner» hinterlegt', alias:['wohnstandort','bewohner']}
  ]
}
];
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
      wohnung:g('wohnung'), bemerkungen:g('bemerkungen')
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
      ref1:g('ref1'), ref2:g('ref2'), wohnung:g('wohnung'), personen:rpers
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
    }else{
      aktion='neu';stats.neu++;
    }
    zeilen.push({nr:i+1,roh:row,ziel:z,aktion:aktion,hinweise:hin});
  });
  return {sektion:sekId,zeilen:zeilen,stats:stats,mapping:map};
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
      if(!s(doc.zahlbedId)&&fristTage(z.zahlbed,0)===30)doc.zahlbedId='netto30';
      if(s(z.adrId)&&!s(doc.importAdrId))doc.importAdrId=s(z.adrId);
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
          menge:1, einheit:'Psch', ep:z.netto
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
          menge:1, einheit:'Psch', ep:z.netto
        }];
        doc.importSumme={netto:z.netto,mwst:z.mwst,brutto:z.brutto,satz:z.mwstPct};
      }
      doc.quelle=doc.quelle||{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:z.extId};
      doc.updatedAt=jetzt();
      return dokSichern(doc).then(function(){if(alt)report.aktualisiert++;else report.neu++;});
    });
  });
}

function ausfuehren(plan,opts){
  opts=opts||{};
  var sekId=plan.sektion;
  var report={neu:0,aktualisiert:0,uebersprungen:0,adressen:0,fehler:[]};
  var zeilen=plan.zeilen.filter(function(z){return z.aktion!=='fehler'&&z.gewaehlt!==false;});
  report.uebersprungen=plan.zeilen.length-zeilen.length;
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
        if(r.aktion==='unveraendert'){report.uebersprungen++;return;}
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
        menge:1, einheit:'Psch', ep:Math.round(summe[aid]*100)/100
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
  pruefe:pruefe, findeKopfzeile:findeKopfzeile,
  parseAnschrift:parseAnschrift, parseAdressBlock:parseAdressBlock,
  vorbereiten:vorbereiten, ausfuehren:ausfuehren,
  parseDatum:parseDatum, parseBetrag:parseBetrag,
  offertStatus:offertStatus, auftragStatus:auftragStatus,
  rechnungStatus:rechnungStatus, rechnungArt:rechnungArt,
  esrGueltig:esrGueltig, fristTage:fristTage, addTage:addTage,
  objektSchluessel:objektSchluessel,
  // Engine-Exports für Node-Tests
  serialZuDatum:serialZuDatum, istDatumFmt:istDatumFmt, entescape:entescape,
  spalteZuIndex:spalteZuIndex, norm:norm
};

})();
