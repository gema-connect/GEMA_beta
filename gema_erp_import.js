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
/* «4126 Bettingen» → {plz:'4126', ort:'Bettingen'}; «Riehen» → {ort:'Riehen'}.
   Nur eine vierstellige Zahl am Anfang gilt als PLZ — der Rest bleibt Ort,
   nichts wird geraten. Das Altsystem schreibt `objekt2` am Objekt als Ort,
   am Auftrag dagegen als «PLZ Ort». */
function splitPlzOrt(v){
  var t=s(v), m=/^(\d{4})\s+(.+)$/.exec(t);
  return m?{plz:m[1],ort:s(m[2])}:{plz:'',ort:t};
}

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
/* Uhrzeit → «HH:MM». BEWUSST STRENG: nur eine Zeit MIT Trennzeichen wird
   akzeptiert, eine blosse Zahl NIE.

   KRITISCH — im Altsystem führt `termin` zwei Zeitpaare: `von60`/`bis60` sind
   der Klartext («07:00»), `von`/`bis` dagegen Dezimalzahlen (gemessen 1.00 …
   19.50). Beide Deutungen einer nackten «19.50» sind plausibel — 19:30 als
   Dezimalstunde oder 19:50 als Uhrzeit — und keine lässt sich aus dem Wert
   belegen. Statt zu raten liefert die Funktion '' und der Importer meldet die
   Zeile; der Export soll `von60`/`bis60` mitgeben. */
function parseZeit(v){
  var t=s(v);if(!t)return '';
  // Nur «:» und «h» trennen — ein «.» wäre genau die Dezimalfalle von oben
  // («19.50» ist als Uhrzeit 19:50 und als Dezimalstunde 19:30).
  var m=/^(\d{1,2})[:h](\d{2})$/i.exec(t);
  if(!m)return '';
  var h=parseInt(m[1],10),mi=parseInt(m[2],10);
  if(!(h>=0&&h<=23)||!(mi>=0&&mi<=59))return '';
  return (h<10?'0':'')+h+':'+(mi<10?'0':'')+mi;
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
/* Am Bestand ausgezählt (offstatus): In Bearbeitung 2 387 · Zuschlag 1 813 ·
   Versandt 784 · Absage 781 · Erledigt 7. Die Regeln sind darauf abgestimmt —
   «In Bearbeitung» und «Versandt» fielen vorher beide durch und landeten auf
   dem Vorgabewert «versendet»: 2 387 Entwürfe galten damit als verschickt. */
var OFFERT_STATUS=[
  {re:/^(zuschlag|auftrag|angenommen|gewonnen|erteilt)/i,   status:'angenommen'},
  {re:/^(absage|abgelehnt|verloren|storno|annulliert)/i,    status:'abgelehnt'},
  // «In Bearbeitung» ist der grösste Posten und steht VOR der Versand-Regel,
  // damit «in Bearbeitung, versandt» nicht als versendet durchgeht.
  // «offen» gehört NICHT hierher: eine offene Offerte ist verschickt und
  // wartet auf den Entscheid — sie ist kein Entwurf.
  {re:/^(entwurf|erfassung|in\s*(arbeit|bearbeitung))/i, status:'entwurf'},
  {re:/^(offen|pendent|offeriert|versendet|versandt|verschickt|gesendet|gedruckt)/i, status:'versendet'}
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
  // KRITISCH — «teilweise bezahlt» MUSS vor «bezahlt» stehen: sonst greift die
  // Bezahlt-Regel und ein offener Restbetrag verschwindet aus der Debitorenliste.
  // Im ausgewerteten Altbestand kommt der Wert nicht vor; die Regel bleibt, weil
  // ein anderer Mandant ihn führen kann.
  {re:/teilweise|teilzahlung|akonto\s*bezahlt|anzahlung\s*erhalten/i,          status:'gestellt'},
  // «Kulanz» und «Garantie» (11 Belege) sind KEIN Zahlungsstand, sondern ein
  // Verzichtsgrund. Sie werden erkannt — sonst meldete der Bericht sie als
  // unbekannten Status — und der Grund bleibt am Beleg. Vor der Bezahlt-Regel,
  // weil «Garantie» sonst nirgends greift und «Kulanz» als offen gälte.
  {re:/kulanz|garantie|abgeschrieben|verzicht/i, status:'gestellt', vermerk:'verzicht'},
  {re:/bezahlt|beglichen|ausgeglichen|saldiert/i,                             status:'bezahlt'},
  // «In Buchhaltung geschrieben» (961 Belege) heisst: an die Fibu übergeben.
  // Über die Zahlung sagt der Wert nichts — die Rechnung ist gestellt.
  {re:/in\s*buchhaltung|verbucht|(an\s*die\s*)?fibu/i, status:'gestellt', vermerk:'fibu'},
  {re:/versandt|verschickt|gedruckt|gestellt|gemahnt|mahnung|offen/i,          status:'gestellt'}
];
function rechnungStatus(text){
  var t=s(text);
  if(!t)return {status:'gestellt',erkannt:false,vermerk:''};
  var hit=RECHNUNG_STATUS.find(function(x){return x.re.test(t);});
  return hit?{status:hit.status,erkannt:true,vermerk:hit.vermerk||''}
            :{status:'gestellt',erkannt:false,vermerk:''};
}

/* Rechnungs-TYP des Altsystems → GEMA `rechnungsArt`.
   KRITISCH — die importierte Schlussrechnung trägt den TATSÄCHLICH
   fakturierten Betrag; `erpSchlussPositionen` (Auftragspositionen minus
   Akonti) darf beim Import NIE laufen, sonst würde der Beleg neu gerechnet. */
/* Am Bestand ausgezählt (rechtyp): Schlussrechnung 9 044 · A-Konto-Rechnung
   1 479 · Teilrechnung 173 · Gutschrift 8.

   KRITISCH — «A-Konto-Rechnung» schreibt das Altsystem MIT Bindestrichen. Ein
   Muster `/akonto/` trifft das nicht; 1 479 Akonto-Rechnungen galten dadurch
   als Einzelrechnung. Das ist keine Kosmetik: die Schlussrechnung zieht die
   Akonti ab, und eine falsch eingeordnete Akonto-Rechnung fehlt in diesem
   Abzug. Darum trennzeichentolerant. */
var RECHNUNG_ART=[
  {re:/schluss|final|end[\s\-]*(ab)?rechnung/i,             art:'schluss'},
  {re:/a[\s\-.]*konto|akonto|abschlag|anzahlung|vorauszahlung/i, art:'akonto'},
  {re:/teil[\s\-]*(rechnung|betrag)?|zwischenrechnung/i,    art:'teil'},
  {re:/gutschrift|storno/i,                                 art:'einzel'}
];
function rechnungArt(text){
  var t=s(text);
  if(!t)return {art:'einzel',erkannt:false};
  var hit=RECHNUNG_ART.find(function(x){return x.re.test(t);});
  return hit?{art:hit.art,erkannt:true}:{art:'einzel',erkannt:false};
}

/* Absenzart des Altsystems → GEMA.

   Die Tabelle `absenz` ist NICHT nur eine Absenzliste. Am Bestand ausgezählt
   stehen dort auch Arbeitskategorien — «Werkstatt» (87 Termine + 170 mobile
   Zeiten), «Büro» (10 + 47), «Sitzung» (22 + 1), «Garantiearbeit», «Teamevent»
   — und reine Zuschlagsarten («Stundenzuschlag», «Nachtzuschlag»). Wer die
   Spalte als «gesetzt = abwesend» liest, macht aus 119 Arbeitsterminen
   Abwesenheiten.

   Drei Ausgänge:
     typ    — eine echte GEMA-Absenz (ferien|krank|unfall|militaer|schule|
              uek|kompensation|brueckentag)
     arbeit — keine Absenz, sondern Arbeit: der Termin bleibt ein Einsatz
     weder noch — unbekannt: als Abwesenheit geplant (so heisst die Spalte),
              aber OHNE erfundenen GEMA-Typ, und im Bericht benannt.

   `absenz.paid` taugt NICHT als Kriterium: im Bestand steht es bei «Ferien»
   auf 0 und bei «unbezahlter Urlaub» auf 1. Was die Spalte bedeutet, ist
   unbekannt — sie wird darum nicht ausgewertet. */
var ABSENZ_MAP={
  // ── echte Absenzen (Kürzel und Klartext, beides kommt im Export vor) ──
  fe:'ferien',        ferien:'ferien',
  kra:'krank',        krankheit:'krank',        krank:'krank',
  un:'unfall',        unfall:'unfall',
  sch:'schule',       schule:'schule',          berufsschule:'schule',
  uek:'uek',          ueberbetrieblicherkurs:'uek',
  mi:'militaer',      militaer:'militaer',      militaerdienst:'militaer',
  // Zivildienst ist weder Militär noch Zivilschutz; GEMA führt für alle drei
  // einen Typ («Militär / Zivilschutz»). Bewusst dorthin — und gemeldet.
  zi:'militaer',      zivildienst:'militaer',   zivilschutz:'militaer',
  kom:'kompensation', kompensation:'kompensation',
  br:'brueckentag',   bruecke:'brueckentag',    brueckentag:'brueckentag',
  // ── keine Absenz, sondern Arbeit ──
  we:'#arbeit',       werkstatt:'#arbeit',      werkstattarbeiten:'#arbeit',
  bue:'#arbeit',      buero:'#arbeit',          bueroarbeiten:'#arbeit',
  si:'#arbeit',       sitzung:'#arbeit',        besprechung:'#arbeit',
  ga:'#arbeit',       garantierarbeit:'#arbeit',garantiearbeit:'#arbeit',
  te:'#arbeit',       teamevent:'#arbeit',
  // ── Feiertag: GEMA führt Feiertage im Kalender, nicht als Absenz ──
  fei:'#feiertag',    feiertage:'#feiertag',    feiertag:'#feiertag'
};
function absenzArt(text){
  var t=norm(text);
  if(!t||t==='0')return {typ:'',arbeit:false,feiertag:false,erkannt:false,leer:true,eigen:false};
  var m=ABSENZ_MAP[t];
  if(m==='#arbeit')  return {typ:'',arbeit:true, feiertag:false,erkannt:true, leer:false,eigen:false};
  if(m==='#feiertag')return {typ:'',arbeit:false,feiertag:true, erkannt:true, leer:false,eigen:false};
  if(m)              return {typ:m, arbeit:false,feiertag:false,erkannt:true, leer:false,eigen:false};
  // Eigene Absenzarten der Firma (⚙️ der Stundenerfassung) — auch die, die
  // ein früherer Import angelegt hat.
  var e=_eigeneAbsenz[t];
  if(e)              return {typ:e, arbeit:false,feiertag:false,erkannt:true, leer:false,eigen:true};
  return {typ:'',arbeit:false,feiertag:false,erkannt:false,leer:false,eigen:false};
}

/* ── Eigene Absenzarten ─────────────────────────────────────────────────
   Entscheid des Betriebs: jede Absenzart des Altsystems, die GEMA nicht
   kennt (Kurs, Arztbesuch, Privat, «Bezahlte Absenzen» …), wird beim Import
   als EIGENE Absenzart in der Stundenerfassung angelegt — statt still
   wegzufallen oder als Ferien durchzugehen. Die Regeln (füllt das Tagessoll
   auf? keine Vorholzeit?) bleiben bewusst auf «aus»: das ist eine
   Personalentscheidung und wird im Bericht als offen benannt. */
var _eigeneAbsenz={};   // norm(Name) und norm(id) → id
function absenzartenAusOrgLaden(){
  _eigeneAbsenz={};
  try{
    var st=((GemaAuth.getCurrentOrg()||{}).settings||{}).stunden||{};
    (st.eigeneAbsenzen||[]).forEach(function(e){
      if(!e||!e.id)return;
      if(s(e.name))_eigeneAbsenz[norm(e.name)]=e.id;
      _eigeneAbsenz[norm(e.id)]=e.id;
    });
  }catch(e){}
}
/* Slug wie stEaSlug in pm_stunden — dieselbe ID-Form, damit ein von Hand
   angelegter und ein importierter Typ nicht zweierlei sind. */
function absenzSlug(name,vergeben){
  var sl='ea_'+String(name).toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/é|è|ê/g,'e')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,24);
  if(sl==='ea_'||sl==='ea')sl='ea_typ';
  var b=sl,i=2;
  while(vergeben[sl])sl=b+'_'+(i++);
  vergeben[sl]=1;
  return sl;
}
/* Legt die noch unbekannten Absenzarten der Zeilen als eigene Typen an und
   löst danach `absenzTyp` an den Zeilen nach. Läuft VOR dem Schreiben von
   Stunden und Terminen. Schreibt org.settings.stunden über updateOrgSettings
   (derselbe Weg wie die Zahlungsbedingungen). */
function absenzartenSicherstellen(zeilen,report){
  var neu={},reihenfolge=[];
  zeilen.forEach(function(zl){
    var z=zl.ziel,roh=s(z&&z.absenz);
    if(!roh)return;
    var a=absenzArt(roh);
    if(a.leer||a.arbeit||a.feiertag||a.typ)return;
    var k=norm(roh);
    if(!neu[k]){neu[k]=roh;reihenfolge.push(k);}
  });
  var fertig=Promise.resolve();
  if(reihenfolge.length){
    var org=null;try{org=GemaAuth.getCurrentOrg();}catch(e){}
    if(org&&org.id){
      var st=Object.assign({},(org.settings||{}).stunden||{});
      var liste=(st.eigeneAbsenzen||[]).slice();
      var vergeben={};liste.forEach(function(e){if(e&&e.id)vergeben[e.id]=1;});
      reihenfolge.forEach(function(k){
        var name=neu[k];
        var id=absenzSlug(name,vergeben);
        liste.push({id:id,name:name,ic:'📌',fuelltAuf:false,keineVorholzeit:false,
                    beantragbar:false,nurUserIds:null,importiert:true,importQuelle:'ERP-Migration'});
        _eigeneAbsenz[k]=id;_eigeneAbsenz[norm(id)]=id;
        (report.absenzartenNeu=report.absenzartenNeu||[]).push(name);
      });
      st.eigeneAbsenzen=liste;
      fertig=Promise.resolve(GemaAuth.updateOrgSettings(org.id,{stunden:st})).then(function(){},function(){});
    }else{
      // Ohne Firma lässt sich nichts anlegen — benennen, nicht verschweigen.
      reihenfolge.forEach(function(k){(report.absenzartenOffen=report.absenzartenOffen||[]).push(neu[k]);});
    }
  }
  return fertig.then(function(){
    // Nachlösen: Zeilen, die in der Vorschau noch ohne Typ waren.
    zeilen.forEach(function(zl){
      var z=zl.ziel;if(!z||!s(z.absenz)||s(z.absenzTyp)||z.absenzArbeit||z.absenzFeiertag)return;
      var a=absenzArt(z.absenz);
      if(a.typ){z.absenzTyp=a.typ;z.absenzErkannt=true;}
    });
  });
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
/* ISO-Datum + n Monate → ISO-Datum, gerechnet wie MySQLs
   `DATE_ADD(d, INTERVAL n MONTH)`: der Tag wird auf den Monatsletzten
   begrenzt, der 31.01. + 1 Monat ist also der 28./29.02. und nicht der 03.03.
   Wird für den Revisionskalender gebraucht — dort ist «letzte Revision +
   Intervall» am Altbestand exakt bestätigt (410 von 410). */
function addMonate(iso,n){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s(iso));
  if(!m)return s(iso);
  var d=new Date(Date.UTC(+m[1],(+m[2]-1)+(parseInt(n,10)||0),1));
  var letzter=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(+m[3],letzter));
  return d.toISOString().slice(0,10);
}

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
/* Nachkalkulation des Altsystems (JSON_OBJECT über die `nk*`-Spalten).
   Felder ohne Wert fliegen raus — das Altsystem legt für jeden Auftrag alle
   35 Spalten an, gefüllt sind sie nur bei 121 von 9 723. Ein Objekt aus
   lauter Nullen wäre kein Wissen, sondern Rauschen. Lässt sich der Text nicht
   als JSON lesen, wird er ROH behalten statt verworfen. */
function parseNachkalk(v){
  var t=s(v);
  if(!t||t==='{}'||norm(t)==='null')return null;
  var o=null;
  try{o=JSON.parse(t);}catch(e){return {roh:t};}
  if(!o||typeof o!=='object'||Array.isArray(o))return {roh:t};
  var out={},leer=true;
  Object.keys(o).forEach(function(k){
    var n=parseBetrag(o[k]);
    if(n==null||n===0)return;
    out[k]=n;leer=false;
  });
  return leer?null:out;
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

/* Nettosumme einer Positionsliste — Titel und Textzeilen zählen nicht mit. */
function positionenNetto(positionen){
  var n=0;
  (positionen||[]).forEach(function(p){
    if(!p||p.art==='titel'||p.art==='text'||p.art==='seitenumbruch')return;
    // Zuschlag/Rabatt so rechnen, wie pm_erp sie rechnet: aus `wert`, im
    // Import immer in CHF. Sonst prüfte die Summenkontrolle gegen eine Summe,
    // die der Beleg in GEMA nie zeigt.
    if(p.art==='zuschlag'||p.art==='rabatt'){
      var w=parseFloat(p.wert)||0;
      if(p.modus==='chf')n+=(p.art==='rabatt')?-w:w;
      return;
    }
    n+=(parseFloat(p.ep)||0)*(parseFloat(p.menge)||0)*(1-((parseFloat(p.rabattPct)||0)/100));
  });
  return Math.round(n*100)/100;
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

/* Stufe der Zeiterfassung → Rang.

   Das Altsystem führt DREI Stufen desselben Ablaufs, nicht drei Generationen:
     1. der Termin liefert die geplante Zeit (Annahme),
     2. der Monteur erfasst sie auf dem Handy und korrigiert sie dort,
     3. im Stundenmodul korrigiert der Abteilungsleiter, was falsch erfasst wurde.

   Für den Import heisst das: eine Abweichung zwischen Stufe 2 und 3 ist KEIN
   Konflikt, sondern genau die Korrektur. Der freigegebene Wert gewinnt immer.
   Ohne Angabe gilt «freigegeben» — der Hauptbestand ist das Stundenmodul. */
var STUNDEN_RANG={erfasst:1, freigegeben:2};
function stundenQuelle(text){
  var n=norm(text);
  if(!n)return 'freigegeben';
  if(n.indexOf('erfasst')===0||n.indexOf('mobil')===0||n.indexOf('handy')===0
     ||n.indexOf('app')===0||n.indexOf('hours')===0)return 'erfasst';
  return 'freigegeben';
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

/* CSV/TSV — Trennzeichen-Erkennung, Quotes, "" als Escape.

   Ein Anführungszeichen öffnet ein Feld nur an dessen ANFANG. Mitten im Feld
   ist es Text — «Rohr 1/2"» kommt im Sanitärhandwerk in jeder zweiten
   Position vor, und ein Parser, der dort in den Quote-Modus fällt, schluckt
   den Rest der Datei bis zum nächsten Anführungszeichen.

   opts.mysql — Datei aus `mysql --batch` (Export-Paket erp_export/, Endung
   .tsv): Tab-getrennt, NIE gequotet, NULL als Wort «NULL», Tab/Zeilenumbruch/
   Backslash/NUL als \t \n \\ \0 escapt. Beides wird zurückgewandelt; ohne
   diese Regel käme «NULL» als E-Mail-Adresse und «\n» als Text in die
   Bemerkungen. Gilt nur, wenn die Datei auch wirklich Tab-getrennt ist. */
function parseCsv(text,opts){
  opts=opts||{};
  text=String(text||'').replace(/^﻿/,'');
  var kand=[';','\t',',','|'],best=';',bestN=-1;
  var probe=text.split(/\r?\n/).slice(0,5).join('\n');
  kand.forEach(function(d){
    var n=probe.split(d).length;
    if(n>bestN){bestN=n;best=d;}
  });
  var mysql=!!opts.mysql&&best==='\t';
  function feld(v){return (mysql&&v==='NULL')?'':v;}
  var rows=[],row=[],cur='',q=false,anfang=true;
  for(var i=0;i<text.length;i++){
    var ch=text[i];
    if(q){
      if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}
      else if(ch!=='\r')cur+=ch;   // Umbrüche im Feld einheitlich als \n
      continue;
    }
    if(ch==='"'&&anfang&&!mysql){q=true;anfang=false;continue;}
    if(mysql&&ch==='\\'){
      var nx=text[i+1];
      if(nx==='n'){cur+='\n';i++;}
      else if(nx==='t'){cur+='\t';i++;}
      else if(nx==='\\'){cur+='\\';i++;}
      else if(nx==='0'){i++;}            // NUL hat in Text nichts verloren
      else cur+=ch;                      // einzelner Backslash bleibt Text
      anfang=false;continue;
    }
    if(ch===best){row.push(feld(cur));cur='';anfang=true;}
    else if(ch==='\n'){row.push(feld(cur));rows.push(row);row=[];cur='';anfang=true;}
    else if(ch==='\r'){/* skip */}
    else{cur+=ch;anfang=false;}
  }
  if(cur!==''||row.length){row.push(feld(cur));rows.push(row);}
  rows=rows.filter(function(r){return r.some(function(c){return s(c);});});
  return {typ:'csv',mysql:mysql,sheets:[{name:'CSV',rows:rows.map(function(r){return r.map(s);})}]};
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
    {id:'notiz',      label:'Bemerkungen', alias:['bemerkung','bemerkungen','notiz','notizen']},
    // «objekt1»/«objekt2» des Altsystems: AM BESTAND GEMESSEN eine zweite
    // ADRESSE, keine Bezeichnung — `objekt1` trägt Strasse + Nr., `objekt2`
    // den Ort (am Auftrag «PLZ Ort»). Beleg: 4 417 von 4 547 Objekten gefüllt,
    // 2 833 verschiedene Strassen, aber nur 176 verschiedene Werte in
    // `objekt2`. WELCHE Adresse es ist (Objekt oder Verwaltung), ist NICHT
    // belegt — mehrere hundert Objekte teilen denselben Wert. Sie bleibt
    // darum ein Vermerk und wird nur dann zur Objektadresse, wenn das Objekt
    // gar keine hat (dann ist sie besser als nichts, und es wird vermerkt).
    {id:'bez1',       label:'Adresse im Altsystem — Strasse', hint:'«objekt1» — Vermerk am Objekt; füllt die Objektadresse nur, wenn diese fehlt', alias:['objekt1','objekttext1','bezeichnung1']},
    {id:'bez2',       label:'Adresse im Altsystem — Ort', hint:'«objekt2» — Vermerk am Objekt; am Auftrag im Format «PLZ Ort»', alias:['objekt2','objekttext2','bezeichnung2']},
    {id:'ordner',     label:'Dokumenten-Ordner (Altsystem)', hint:'«lkdir» — nur der Ordnername, nicht der Pfad. Bleibt als Vermerk am Datensatz, damit der spätere Dokumenten-Import zuordnen kann.', alias:['lkdir','ordner','dokordner','dokumentenordner','verzeichnis']}
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
    {id:'rechnungEmail',label:'E-Mail für Rechnungen', alias:['rechnungemail','rechnungsemail','invoiceemail']},
    {id:'ordner',   label:'Dokumenten-Ordner (Altsystem)', hint:'«lkdir» — nur der Ordnername, nicht der Pfad. Bleibt als Vermerk am Datensatz, damit der spätere Dokumenten-Import zuordnen kann.', alias:['lkdir','ordner','dokordner','dokumentenordner','verzeichnis']}
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
    {id:'artText',    label:'Offertart', hint:'Im Altsystem «offerttyp» — bleibt als Vermerk am Beleg', alias:['offerttyptext','offerttyp','offertart']},
    {id:'stunden',    label:'Stunden (Kalkulation)', hint:'«tostunden» des Altsystems — Vermerk, GEMA rechnet nicht damit', alias:['tostunden','totalstunden','kalkstunden']},
    {id:'nettoBetrag',label:'Betrag exkl. MwSt', hint:'Massgebend für die Sammelposition', alias:['exmwstbetrag','nettobetrag','netto','betragexklmwst']},
    {id:'mwstBetrag', label:'MwSt-Betrag', hint:'Daraus wird der MwSt-Satz je Beleg gerechnet', alias:['mwstbetrag','mwst','mehrwertsteuer']},
    {id:'bruttoBetrag',label:'Betrag inkl. MwSt', alias:['obetrag','bruttobetrag','brutto','total','betrag']},
    {id:'kundeName',  label:'Kunde / Firma', alias:['name1','korrname','kunde','firma','adressname']},
    {id:'korrName',   label:'Korrespondenz-Name', hint:'Ersatz für den Kundennamen, wenn «name1» leer ist', alias:['korrname','korrespondenzname']},
    {id:'kundeNr',    label:'Kunden-Nr.', alias:['knummer','kundennummer','kdnr','kundennr','debitor']},
    {id:'anschrift',  label:'Anschrift-Block (Freitext)', hint:'Rechnungsadresse — wird automatisch zerlegt', alias:['anschrift','adressblock','rechnungsadresse']},
    {id:'anrede',     label:'Briefanrede', alias:['banrede','anrede','briefanrede']},
    {id:'zahlbed',    label:'Zahlungsbedingung', hint:'Kürzel des Altsystems — wird der importierten Kondition zugeordnet', alias:['zahlbedid','zahlungsbedingung','zahlbed','kondition']},
    {id:'bemerkung',  label:'Bemerkung', alias:['bemerkung','bemerkungen','notiz','notizen']},
    {id:'wohnStandort',label:'Wohnung — Name / Standort', hint:'Wird als Bezugsperson «Bewohner» am Objekt hinterlegt', alias:['wohnstandort','bewohner']},
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
    {id:'wohnung',    label:'Wohnung / Standort', alias:['wohnung','wohnstandort','stockwerk']},
    {id:'ordner',     label:'Dokumenten-Ordner (Altsystem)', hint:'«lkdir» — nur der Ordnername, nicht der Pfad. Bleibt als Vermerk am Datensatz, damit der spätere Dokumenten-Import zuordnen kann.', alias:['lkdir','ordner','dokordner','dokumentenordner','verzeichnis']}
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
    {id:'wohnTel',    label:'Wohnung — Telefon', alias:['wohntel','bewohnertel']},
    // Die rund 35 `nk*`-Spalten des Altsystems kommen als EIN JSON-Feld herein
    // (JSON_OBJECT im Export). So bleibt die Nachkalkulation vollständig
    // erhalten, ohne die Zuordnungsmaske mit 16 Zahlenfeldern zu füllen, die
    // nur 1.2 % der Aufträge überhaupt führen.
    {id:'nachkalk',   label:'Nachkalkulation Altsystem', hint:'JSON aus dem Export — wird unverändert als Vermerk abgelegt. GEMA rechnet seine eigene Nachkalkulation aus Rechnungen, Kreditoren und Stunden.', alias:['nachkalk','nachkalkulation','nkjson','nk']},
    {id:'ordner',     label:'Dokumenten-Ordner (Altsystem)', hint:'«lkdir» — nur der Ordnername, nicht der Pfad. Bleibt als Vermerk am Datensatz, damit der spätere Dokumenten-Import zuordnen kann.', alias:['lkdir','ordner','dokordner','dokumentenordner','verzeichnis']}
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
    {id:'status',     label:'Bearbeitungsstatus', hint:'z.B. In Bearbeitung / Kontrolliert / Versandt — im Altsystem «astatus»', alias:['typtext1','bearbstatus','astatustext','status','zustand']},
    // Das Altsystem führt DREI Statusfelder: Art (rechtyp), Bearbeitung
    // (rechastatus) und Zahlung (debistatus). Für GEMAs einen Status ist der
    // Zahlungsstand der massgebende — er entscheidet, ob die Rechnung noch in
    // der Debitorenliste steht. Er gewinnt darum über den Bearbeitungsstatus.
    {id:'zahlStatus', label:'Zahlungsstatus', hint:'Im Altsystem «debistatus» — im Bestand gezählt: Bezahlt (7 738) · Offen (1 986) · In Buchhaltung geschrieben (961) · Storniert · Kulanz · Garantie. Bestimmt den Status in GEMA.', alias:['debistatus','debistatustext','zahlungsstatus','debitorenstatus']},
    {id:'nettoBetrag',label:'Betrag exkl. MwSt', hint:'Massgebend für die Sammelposition', alias:['exmwstbetrag','nettobetrag','netto','betragexklmwst']},
    {id:'mwstBetrag', label:'MwSt-Betrag', hint:'Daraus wird der MwSt-Satz je Beleg gerechnet', alias:['mwstbetrag','mehrwertsteuer']},
    {id:'bruttoBetrag',label:'Betrag inkl. MwSt', alias:['rbetrag','bruttobetrag','brutto','total','betrag']},
    {id:'mwstCode',   label:'MwSt-Code', hint:'Nur als Vermerk — der Satz kommt aus den Beträgen', alias:['mwstcode','ustcode']},
    {id:'esrRef',     label:'ESR- / QR-Referenz', hint:'Wird für den Nachdruck übernommen, damit die Zahlung zugeordnet werden kann', alias:['esrref','esr','qrreferenz','referenznr']},
    {id:'zahlbed',    label:'Zahlungsbedingung', hint:'Bestimmt die Zahlungsfrist; unbekannt = Firmen-Standard', alias:['zahlbedid','zahlungsbedingung','zahlbed','kondition']},
    {id:'faellig',    label:'Fällig am', hint:'Fälligkeitsdatum des Altsystems — wird zur Zahlungsfrist des Belegs (geht der Zahlungsbedingung vor)', alias:['faelligdatum','faellig','faelligam','faelligkeit','duedate']},
    {id:'bemerkung',  label:'Bemerkung', alias:['bemerkung','bemerkungen','notiz','notizen']},
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
    {id:'kostenstelle',label:'Kostenstelle', alias:['kostenstid','kostenstelle']},
    {id:'ordner',     label:'Dokumenten-Ordner (Altsystem)', hint:'«lkdir» — nur der Ordnername, nicht der Pfad. Bleibt als Vermerk am Datensatz, damit der spätere Dokumenten-Import zuordnen kann.', alias:['lkdir','ordner','dokordner','dokumentenordner','verzeichnis']}
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
    // 80 % der Positionen hängen im Altsystem unter einem Titel. GEMA führt
    // Titel als eigene Zeile, die Gliederung steckt also in der Reihenfolge —
    // die explizite Zuordnung bleibt trotzdem als Vermerk erhalten.
    {id:'parentGuid', label:'Übergeordnete Position', hint:'Nur Vermerk — die Gliederung ergibt sich in GEMA aus der Reihenfolge', alias:['parentposguid','parentguid','titelguid']},
    {id:'guid',       label:'Positions-GUID', hint:'Nur Vermerk', alias:['guid','posguid']},
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
    {id:'rechnungsNr',label:'Rechnungs-Nr. des Lieferanten', alias:['belegnr','rechnungnr','rechnungsnr']},
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
    {id:'esrRef',    label:'ESR-Referenz', alias:['esrref','esrnr','esr','referenz']},
    {id:'sesamOpNr', label:'Sesam OP-Nr.', hint:'Schlüssel der Fibu-Anbindung — wandert als Vermerk mit', alias:['sesamopnr','opnr']},
    // Das Altsystem konnte einen Kreditor auf mehrere Aufträge verteilen
    // (259 von 14 287). GEMA führt genau einen Auftrag — der Export liefert
    // den ersten und zählt die Zuteilungen, damit die Aufteilung nicht
    // stillschweigend verloren geht.
    {id:'zuteilungen',label:'Anzahl Auftrags-Zuteilungen', hint:'Mehr als 1 = im Altsystem auf mehrere Aufträge verteilt; GEMA übernimmt den ersten und meldet es', alias:['zuteilungen','anzahlzuteilungen','zuteilung']},
    {id:'ordner',    label:'Dokumenten-Ordner (Altsystem)', hint:'«lkdir» — nur der Ordnername, nicht der Pfad. Bleibt als Vermerk am Datensatz, damit der spätere Dokumenten-Import zuordnen kann.', alias:['lkdir','ordner','dokordner','dokumentenordner','verzeichnis']}
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
},
{
  id:'mitarbeiter', label:'Mitarbeitende', ic:'👥', bereit:true,
  info:'Die Mitarbeitenden des Altsystems werden zu GEMA-Benutzern der Firma — OHNE Passwort: jede Person mit E-Mail bekommt einen Einladungslink und setzt ihr Passwort selbst. Die Rolle entsteht aus den Kennzeichen des Altsystems (Leitung → Abteilungsleiter, Sachbearbeiter → Unternehmer, sonst Monteur) und lässt sich in der Verwaltung anpassen — nie Administrator. Ein-/Austritt, Wochensoll und daraus das Pensum landen in den Stammdaten der Stundenerfassung. Ausgetretene werden INAKTIV angelegt, damit Stunden und Termine der vergangenen Jahre eine Person haben. Nur als Firmen-Admin ausführen.',
  felder:[
    {id:'extId',     label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten)', alias:['id','arbid','arbeiterid','mitarbeiterid']},
    {id:'name',      label:'Name', pflicht:true, alias:['name1','name','nachname']},
    {id:'vorname',   label:'Vorname', alias:['vorname']},
    {id:'kuerzel',   label:'Kürzel', alias:['kuerzel','kurz','kurzzeichen']},
    {id:'email',     label:'E-Mail', hint:'Wird zum Login-Namen und trägt die Einladung. Ohne E-Mail entsteht der Benutzer ohne Login.', alias:['email','emailinternal','mail']},
    {id:'tel',       label:'Telefon', alias:['tel1','telefon','tel']},
    {id:'natel',     label:'Natel', alias:['natel','mobile','handy']},
    {id:'abteilung', label:'Abteilung', hint:'Wird zum GEMA-Arbeitsbereich', alias:['abtname','abteilung','bereich']},
    {id:'monteur',   label:'Monteur', hint:'Kennzeichen 1/0 des Altsystems', alias:['monteur','istmonteur']},
    {id:'sachbearb', label:'Sachbearbeiter', hint:'Kennzeichen 1/0 → Rolle Unternehmer (Büro/ERP)', alias:['sachbearb','sachbearbeiter','buero']},
    {id:'manager',   label:'Leitung', hint:'Kennzeichen 1/0 → Rolle Abteilungsleiter', alias:['manager','leitung','vorgesetzter']},
    {id:'eintritt',  label:'Eintritt', alias:['eintritt','eintrittsdatum','seit']},
    {id:'austritt',  label:'Austritt', hint:'Gesetzt und vergangen = Benutzer inaktiv', alias:['austritt','austrittsdatum']},
    {id:'pensumPct', label:'Pensum (%)', hint:'Direktes Pensum in Prozent, falls das Altsystem eines führt — hat Vorrang vor dem Wochensoll. Nur eine Spalte zuordnen, die belegt das Pensum ist.', alias:['pensum','pensumpct','anstellungsgrad','beschaeftigungsgrad']},
    {id:'wochenSoll',label:'Wochensoll (h)', hint:'Summe der Tagessolls Mo–Fr des Altsystems (0 = nicht geführt). Das Pensum wird gegen das Firmen-Wochensoll inkl. Vorholzeit gerechnet und in der Vorschau gezeigt.', alias:['wochensoll','sollwoche','sollstunden']},
    {id:'ferienTage',label:'Ferien (Tage/Jahr)', hint:'Im Altbestand leer — der Anspruch kommt aus den Firmen-Einstellungen', alias:['ferientage','ferien']},
    {id:'ansatz',    label:'Verkaufsansatz', hint:'Vermerk in den Stammdaten', alias:['ansatz1','ansatz','stundenansatz']}
  ]
},
{
  id:'termine', label:'Termine', ic:'📅', bereit:true,
  info:'Die Disposition aus dem Altsystem — Aufträge, freie Termine und Abwesenheiten. Termine, die in der Zukunft liegen, sind der wichtigste Teil: sie sind die geplante Arbeit der nächsten Monate. Der Monteur wird über den Namen einer Person der Firma zugeordnet, der Auftrag über seine Nummer.',
  felder:[
    {id:'extId',    label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten)', alias:['guid','id','terminid']},
    {id:'datum',    label:'Datum', pflicht:true, alias:['datum','date','termindatum']},
    // KRITISCH — `von60`/`bis60` STEHEN VORN: im Altsystem führen sie die
    // Uhrzeit im Klartext («07:00»), während `von`/`bis` Dezimalzahlen sind
    // (gemessen 1.00 … 19.50). Wer nur `von` exportiert, bekommt keine
    // erfundene Uhrzeit, sondern eine Meldung (siehe parseZeit).
    {id:'zeitVon',  label:'Von', hint:'Uhrzeit im Klartext — im Altsystem «von60», NICHT «von» (das ist eine Dezimalzahl)', alias:['von60','zeitvon','startzeit','beginn','von']},
    {id:'zeitBis',  label:'Bis', hint:'Uhrzeit im Klartext — im Altsystem «bis60»', alias:['bis60','zeitbis','endzeit','ende','bis']},
    {id:'titel',    label:'Arbeit / Titel', pflicht:true, alias:['arbeit','titel','betreff','taetigkeit','text']},
    {id:'monteur',  label:'Monteur', hint:'Wird über den Namen zugeordnet', alias:['monteur','arbname','mitarbeiter','name1','arbeiter']},
    {id:'auftragNr',label:'Auftrags-Nr.', hint:'Verknüpft den Termin mit dem importierten Auftrag', alias:['rapportnr','auftragnr','auftragsnr','rappnr']},
    {id:'absenz',   label:'Absenz', hint:'Gesetzt = Abwesenheit statt Einsatz', alias:['absenz','abwesenheit','ferien']},
    {id:'arbtyp',   label:'Arbeitsart', alias:['arbtyp','arbeitsart','typ']},
    {id:'stunden',  label:'Geplante Stunden', alias:['stunden','effectivetime','dauer','h']},
    {id:'standort', label:'Standort', alias:['location','standort','ort']},
    {id:'serie',    label:'Serien-Nr.', hint:'Nur als Vermerk — GEMA legt keine Serie an', alias:['serieid','serie','serienr']},
    {id:'notiz',    label:'Notiz', alias:['privatetext','notiz','bemerkung','bemerkungen']}
  ]
},
{
  id:'anlagen', label:'Anlagen (Service)', ic:'⚙️', bereit:true,
  info:'Anlagenregister mit Revisionsintervall und letzter Wartung. Der Revisionskalender ist der operativ kritischste Datenbestand der Migration — geht er verloren, fehlen die anstehenden Wartungen. Massgebend ist die KOMPONENTE: dort führt das Altsystem den Zyklus (421 Geräte, 228 mit künftiger Revision), die Anlage liefert Objekt und Vertrag dazu. Das nächste Revisionsdatum wird gerechnet, nicht gespeichert — am Altbestand exakt bestätigt.',
  felder:[
    {id:'extId',       label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten) — die ID der Komponente', alias:['komid','id','sernr','anlageid']},
    {id:'name',        label:'Bezeichnung', pflicht:true, alias:['komname','serappbeschr','appbeschr','bezeichnung','name','beschrieb']},
    {id:'kategorie',   label:'Kategorie', alias:['serkatid','appkat','kategorie','kat']},
    {id:'hersteller',  label:'Hersteller / Fabrikat', alias:['serappfabrikaservapp','appfabrikant','fabrikant','hersteller','fabrikat']},
    {id:'modell',      label:'Typ / Modell', alias:['serapptyp','apptyp','modell','typ']},
    {id:'serienNr',    label:'Serien-Nr.', alias:['komsernr','serappnr','appnr','seriennr','serienummer']},
    {id:'standort',    label:'Standort / Raum', alias:['komstandort','serstandort','standort','raum','platzierung']},
    {id:'inbetrieb',   label:'Inbetriebnahme', alias:['kominstdatum','serinstdatum','instdatum','inbetriebnahme','installation']},
    {id:'garantie',    label:'Garantie (Monate)', alias:['komgarantie','garantie','garantiemonate']},
    {id:'letzteWartung',label:'Letzte Revision', alias:['komlastrev','serlastrev','lastrev','letztewartung','letzterevision']},
    {id:'naechsteWartung',label:'Nächste Revision', hint:'Nur zur Kontrolle — GEMA rechnet sie aus letzter Wartung + Intervall', alias:['komnextrev','sernextrev','nextrev','naechsterevision','naechstewartung']},
    {id:'intervall',   label:'Intervall (Monate)', alias:['komrevint','serrevint','revint','intervall','intervallmonate']},
    {id:'toleranz',    label:'Revisionstoleranz (Monate)', hint:'Vermerk — GEMA führt kein Toleranzfenster', alias:['komrevtoleranz','serrevtoleranz','toleranz','revtoleranz']},
    {id:'revBasisModus',label:'Berechnung ab Revisionsbasis', hint:'Gesetzt = fester Anker statt letzter Revision. GEMA kennt diesen Modus nicht — solche Anlagen werden gemeldet.', alias:['komcalcwithbasis','calcwithbasis','mitbasis','revbasismodus']},
    {id:'revBasis',    label:'Revisionsbasis', alias:['komrevbasis','revbasis','basisdatum']},
    {id:'revKosten',   label:'Revisionskosten', alias:['komrevkosten','serrevkosten','revkosten','preis']},
    {id:'vertragsNr',  label:'Vertrags-Nr.', hint:'Vermerk — GEMA-Wartungsverträge werden separat erfasst', alias:['servertragsnr','vertragsnr','vertragnr']},
    {id:'strasse',     label:'Objekt: Strasse / Nr.', hint:'Verknüpft die Anlage mit dem Objekt', alias:['serstrasse','strasse','str']},
    {id:'plz',         label:'Objekt: PLZ', alias:['serplz','plz']},
    {id:'ort',         label:'Objekt: Ort', alias:['serort','ort']},
    {id:'abteilung',   label:'Abteilung', hint:'Wird zum GEMA-Arbeitsbereich', alias:['serabtid','abtname','abteilung','bereich']},
    {id:'notiz',       label:'Bemerkungen', alias:['serbemerkungen','bemerkung','bemerkungen','notiz','serprotokoll']},
    {id:'ordner',      label:'Dokumenten-Ordner (Altsystem)', hint:'«lkdir» — nur der Ordnername, nicht der Pfad. Bleibt als Vermerk am Datensatz, damit der spätere Dokumenten-Import zuordnen kann.', alias:['lkdir','ordner','dokordner','dokumentenordner','verzeichnis']}
  ]
},
{
  id:'stunden', label:'Stunden', ic:'⏱', bereit:true,
  info:'Erfasste Arbeitszeit je Mitarbeiter und Tag. Das Altsystem kennt drei Stufen desselben Ablaufs: der Termin liefert die Annahme, der Monteur erfasst auf dem Handy, und im Stundenmodul korrigiert der Abteilungsleiter. Beide Erfassungsstufen dürfen zusammen eingelesen werden — die Spalte «Stufe» entscheidet, welcher Wert gilt: der freigegebene schlägt den mobil erfassten. Das Altsystem führt eine DAUER, GEMA sonst Von-/Bis-Zeiten; importierte Tage tragen deshalb nur die Dauer und lösen bewusst KEINE Nacht- oder Wochenendzuschläge aus.',
  felder:[
    {id:'mitarbeiter',label:'Mitarbeiter', pflicht:true, hint:'Wird über den Namen einer Person der Firma zugeordnet', alias:['arbname','mitarbeiter','name1','arbeiter','kuerzel','monteur']},
    {id:'datum',     label:'Datum', pflicht:true, alias:['datum','date','tag']},
    {id:'stunden',   label:'Stunden', pflicht:true, hint:'Dezimal — 7.5 statt 7:30. ACHTUNG bei der mobilen Erfassung: «hrs_length» ist im Altsystem in SEKUNDEN (belegt) — im Export durch 3600 teilen, sonst werden Zeilen über 24 h abgewiesen.', alias:['stunden','hrslength','dauer','h','anzahl']},
    {id:'quelle',    label:'Stufe', hint:'«freigegeben» (Stundenmodul, korrigiert) oder «erfasst» (Handy des Monteurs). Ohne Angabe gilt «freigegeben».', alias:['quelle','stufe','herkunft','source']},
    {id:'auftragNr', label:'Auftrags-Nr.', hint:'Ordnet die Zeit dem importierten Auftrag zu', alias:['rappnr','rapportnr','hrsrapportnr','auftragnr','auftragsnr']},
    {id:'terminId',  label:'Termin-ID', hint:'Verknüpft die Zeit mit dem importierten Termin (im Export «hrs_terminguid»)', alias:['hrsterminguid','terminguid','terminid','hrsterminid']},
    {id:'taetigkeit',label:'Tätigkeit', alias:['arbtyp','taetigkeit','arbeit','hrsdescription','beschrieb']},
    {id:'absenz',    label:'Absenz', hint:'Gesetzt = Abwesenheit statt Arbeitszeit', alias:['absenz','hrsabsenzid','abwesenheit']},
    {id:'spesen',    label:'Spesen CHF', hint:'Betrag aus der App — GEMA führt Mittag und km separat, der Betrag bleibt als Vermerk am Tag', alias:['spesen','hrsspesen','auslagen']},
    {id:'bemerkung', label:'Bemerkung', alias:['bemerkung','bemerkungen','hrscomment','notiz']}
  ]
},
{
  id:'uebertraege', label:'Ferien- & Überzeitüberträge', ic:'🧮', bereit:true,
  info:'Der Stand von Ferienguthaben und Überzeit je Mitarbeiter auf ein Stichdatum — im Altsystem die Maske «Stunden- und Ferienübertrag». Jede Zeile ist ein SALDO auf diesen Tag, kein Zuwachs; mehrere Zeilen je Person bilden die Geschichte ab. Ohne diese Überträge fingen alle Mitarbeitenden in GEMA bei null an, weil GEMA die Jahresbilanz aus den Tagesrapporten rechnet und die Jahre vor der Migration dort fehlen.',
  felder:[
    {id:'extId',      label:'ID im Altsystem', hint:'Für den Wiederholungs-Import (keine Dubletten)', alias:['id','uebertragid']},
    {id:'mitarbeiter',label:'Mitarbeiter', pflicht:true, hint:'Wird über den Namen einer Person der Firma zugeordnet', alias:['arbname','mitarbeiter','name1','arbeiter','kuerzel']},
    {id:'datum',      label:'Datierung auf', pflicht:true, hint:'Der Stichtag, auf den die Salden gelten', alias:['datum','date','stichtag','datierung']},
    {id:'ueberzeitH', label:'Stundenübertrag (h)', hint:'Überzeitsaldo — darf negativ sein (Minusstunden)', alias:['totarbeit','stundenuebertrag','ueberzeit','saldoh']},
    {id:'ferienH',    label:'Ferienguthaben (h)', hint:'Das Altsystem führt Ferien in STUNDEN, nicht in Tagen', alias:['totferien','ferienguthaben','ferien']},
    {id:'ausbezahltH',label:'Ausbezahlte Überstunden (h)', alias:['ausbezst','ausbezahlt','ausbezahltestunden']},
    {id:'zuschlagH',  label:'Zuschlägestunden (h)', alias:['zusstunden','zuschlagstunden','zuschlaege','zusatz']},
    {id:'bemerkung',  label:'Bemerkung', hint:'Trägt im Altbestand die Begründung («Ferienkürzung da <3 volle Monate», «Topf A=52h(100%)»)', alias:['bemerkung','bemerkungen','notiz']}
  ]
},
{
  id:'bezugspersonen', label:'Bezugspersonen', ic:'👤', bereit:true,
  info:'Personen mit ihrer Rolle am Objekt — Bewohner, Besteller, Verwalter, «Schlüssel bei» … Sie werden am jeweiligen Objekt ergänzt (Dedupe über Name und Vorname); Bestehendes wird nie überschrieben. Die Rolle aus dem Altsystem wird zum GEMA-Adresstyp.',
  felder:[
    {id:'objektNr',  label:'Objekt-ID im Altsystem', hint:'Alternative zur Adresse', alias:['objid','objektid','itemid']},
    {id:'strasse',   label:'Objekt: Strasse / Nr.', hint:'Verknüpft die Person mit dem Objekt', alias:['strasse','str','objektstrasse']},
    {id:'plz',       label:'Objekt: PLZ', alias:['plz','postleitzahl']},
    {id:'ort',       label:'Objekt: Ort', alias:['ort','stadt']},
    {id:'name',      label:'Name', pflicht:true, alias:['zuhanden','name','nachname','name1']},
    {id:'vorname',   label:'Vorname', alias:['vorname']},
    {id:'rolle',     label:'Rolle / Kriterium', hint:'z.B. Bewohner, Besteller, Verwalter — wird zum Adresstyp', alias:['kriterium','rolle','typ','funktion','krit']},
    {id:'tel',       label:'Telefon', alias:['tel1','telefon','tel']},
    {id:'natel',     label:'Natel', alias:['natel','mobile','handy','mobil']},
    {id:'email',     label:'E-Mail', alias:['email','mail']},
    {id:'wohnung',   label:'Wohnung', alias:['wohnung','stockwerk']},
    {id:'bemerkung', label:'Bemerkung', alias:['bemerkung','bemerkungen','notiz']}
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
function erkenneSektion(headers,dateiname){
  var uniq=_uniqAlias();
  var hs=(headers||[]).map(function(h){return norm(h);}).filter(Boolean);
  // Das Export-Paket benennt seine Dateien «NN_<sektion>[_variante].tsv» —
  // der Name IST die Zuordnung, sofern die Pflichtfelder passen. So braucht
  // eine Datei mit wenigen Merkmalen (Stunden aus dem Stundenmodul) keine
  // Nachfrage, und eine falsch benannte Datei fällt trotzdem auf.
  var mn=/^\d{2}_([a-z]+)/.exec(s(dateiname).toLowerCase());
  if(mn&&sektion(mn[1])){
    var mapN=erkenneMapping(headers,mn[1]),gN=mappingGuete(mapN,mn[1]),sekN=sektion(mn[1]);
    if(gN.pflichtOk){
      var b0={sekId:mn[1],label:sekN.label,ic:sekN.ic,mapping:mapN,marker:0,erkannt:gN.erkannt,gesamt:gN.gesamt,
              pflichtOk:true,fehlendePflicht:[],punkte:999,quelle:'dateiname'};
      return {beste:b0,sicher:true,liste:[b0],quelle:'dateiname'};
    }
  }
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
var IMPORT_REIHENFOLGE=['zahlbed','mitarbeiter','artikel','objekte','adressen','bezugspersonen',
                        'offerten','auftraege','rechnungen','positionen','zahlungen',
                        'kreditoren','anlagen','termine','stunden','uebertraege'];
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
      pkDebi:g('pkDebi'), pkKredi:g('pkKredi'), eBillId:g('eBillId'), rechnungEmail:g('rechnungEmail'),
      ordner:g('ordner')
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
    if(!kunde.firma)kunde.firma=g('kundeName')||g('korrName');
    if(g('kundeNr'))kunde.nr=g('kundeNr');
    // Bewohner der Offerte → Bezugsperson am Objekt (wie beim Auftrag).
    var opers=[];
    if(s(g('wohnStandort')))opers.push({name:g('wohnStandort'),wohnung:g('wohnung'),typ:'bewohner'});
    return {
      extId:g('extId'), nr:g('nr'),
      datum:parseDatum(g('datum')), gueltigBis:parseDatum(g('gueltigBis')),
      titel:g('titel'), statusText:g('status'), status:st.status, statusErkannt:st.erkannt,
      artText:g('artText'), stunden:parseBetrag(g('stunden')),
      netto:netto, mwst:mwst, brutto:brutto, mwstPct:satz,
      kunde:kunde, kundeName:g('kundeName')||kunde.firma, anrede:g('anrede'),
      sachb:g('sachb'), abteilung:g('abteilung'),
      zahlbed:g('zahlbed'), bemerkung:g('bemerkung'),
      objekt:{strasse:g('strasse'), strasse2:g('strasse2'), plz:g('plz'), ort:g('ort'),
              egid:g('egid'), egrid:g('egrid')},
      ref1:g('ref1'), ref2:g('ref2'), wohnung:g('wohnung'), personen:opers,
      ordner:g('ordner')
    };
  }
  if(sekId==='rechnungen'){
    // Der Zahlungsstand gewinnt über den Bearbeitungsstand: «Versandt» sagt
    // nichts darüber, ob die Rechnung beglichen ist.
    var rzs=s(g('zahlStatus'));
    var rst=rzs?rechnungStatus(rzs):rechnungStatus(g('status'));
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
      statusText:g('status'), zahlStatusText:rzs,
      status:rst.status, statusErkannt:rst.erkannt, statusVermerk:rst.vermerk,
      netto:rnetto, mwst:rmwst, brutto:rbrutto, mwstPct:rsatz, mwstCode:g('mwstCode'),
      esrRef:g('esrRef'), esrOk:esrGueltig(g('esrRef')),
      zahlbed:g('zahlbed'), ausgefuehrt:g('ausgefuehrt'),
      versandtAm:g('versandtAm'), printInfo:g('printInfo'),
      kunde:rkunde, kundeName:g('kundeName')||rkunde.firma, adrId:g('adrId'),
      sachb:g('sachb'), abteilung:g('abteilung'),
      faellig:parseDatum(g('faellig')), bemerkung:g('bemerkung'),
      objekt:{strasse:g('strasse'), strasse2:g('strasse2'), plz:g('plz'), ort:g('ort'),
              egid:g('egid'), egrid:g('egrid')},
      ref1:g('ref1'), ref2:g('ref2'), wohnung:g('wohnung'), personen:rpers,
      fibuBelegNr:g('fibuBelegNr'), opDebi:g('opDebi'), kostenstelle:g('kostenstelle'),
      ordner:g('ordner')
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
      wohnung:g('wohnung'), personen:apers, ordner:g('ordner'),
      nachkalk:parseNachkalk(g('nachkalk'))
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
      guid:g('guid'), parentGuid:g('parentGuid'),
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
      esrRef:g('esrRef'), sesamOpNr:g('sesamOpNr'), ordner:g('ordner'),
      zuteilungen:(function(){var v=parseInt(s(g('zuteilungen')),10);return isNaN(v)?null:v;})()
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
  if(sekId==='termine'){
    var tAbs=s(g('absenz'));
    var tAuf=s(g('auftragNr'));
    var tArt=absenzArt(tAbs);
    /* Abwesenheit schlägt einen Auftrag — ABER nur, wenn es wirklich eine ist.
       «Werkstatt», «Büro» und «Sitzung» stehen im Altsystem in derselben
       Spalte und sind Arbeit; sie bleiben Einsätze. Unbekanntes gilt als
       Abwesenheit (so heisst die Spalte) und wird gemeldet. */
    var tTyp;
    if(tArt.leer||tArt.arbeit) tTyp=tAuf?'auftrag':'frei';
    else                       tTyp='ferien';   // im Einsatzplan = «Abwesend»
    // Rohwert mitführen: konnte die Zeit nicht sicher gelesen werden, geht sie
    // nicht verloren, sondern landet als Vermerk am Termin und wird gemeldet.
    var tvR=g('zeitVon'), tbR=g('zeitBis');
    var tv=parseZeit(tvR), tb=parseZeit(tbR);
    return {
      extId:g('extId'), datum:parseDatum(g('datum')),
      zeitVon:tv, zeitBis:tb,
      zeitRoh:((s(tvR)&&!tv)||(s(tbR)&&!tb))?(s(tvR)+(s(tbR)?'–'+s(tbR):'')):'',
      // Ohne eigenen Titel wird die Kategorie zum Titel — sonst stünde im
      // Plan ein leerer Eintrag, wo «Werkstatt» oder «Schule» hingehört.
      titel:g('titel')||(tArt.leer?'':tAbs), typ:tTyp,
      monteur:g('monteur'), auftragNr:tAuf,
      absenz:tAbs, absenzTyp:tArt.typ, absenzArbeit:tArt.arbeit,
      absenzFeiertag:tArt.feiertag, absenzErkannt:tArt.erkannt,
      arbtyp:g('arbtyp'),
      stunden:parseBetrag(g('stunden')),
      standort:g('standort'), serie:g('serie'), notiz:g('notiz')
    };
  }
  if(sekId==='anlagen'){
    var aInt=parseBetrag(g('intervall'));
    var aTol=parseBetrag(g('toleranz'));
    var aGar=parseBetrag(g('garantie'));
    var aBas=s(g('revBasisModus'));
    return {
      extId:g('extId'), name:g('name'), kategorie:g('kategorie'),
      hersteller:g('hersteller'), modell:g('modell'), serienNr:g('serienNr'),
      standort:g('standort'),
      inbetrieb:parseDatum(g('inbetrieb')),
      garantie:aGar==null?null:Math.round(aGar),
      letzteWartung:parseDatum(g('letzteWartung')),
      naechsteWartung:parseDatum(g('naechsteWartung')),
      intervall:aInt==null?null:Math.round(aInt),
      toleranz:aTol==null?null:Math.round(aTol),
      // «0», «false» und leer heissen alle: normaler Modus ab letzter Revision.
      revBasisModus:!!(aBas&&aBas!=='0'&&norm(aBas)!=='false'&&norm(aBas)!=='nein'),
      revBasis:parseDatum(g('revBasis')),
      revKosten:parseBetrag(g('revKosten')),
      vertragsNr:g('vertragsNr'), abteilung:g('abteilung'), notiz:g('notiz'), ordner:g('ordner'),
      objekt:{strasse:g('strasse'), plz:g('plz'), ort:g('ort')}
    };
  }
  if(sekId==='stunden'){
    var stAbs=s(g('absenz'));
    var stArt=absenzArt(stAbs);
    return {
      // Arbeitskategorien («Werkstatt», «Büro») sind KEINE Absenz — sie
      // bleiben normale Arbeitszeit und werden nur als Tätigkeit vermerkt.
      absenzTyp:stArt.arbeit?'':stArt.typ,
      absenzArbeit:stArt.arbeit, absenzErkannt:stArt.erkannt,
      mitarbeiter:g('mitarbeiter'), datum:parseDatum(g('datum')),
      stunden:parseBetrag(g('stunden')),
      quelle:stundenQuelle(g('quelle')),
      auftragNr:g('auftragNr'), terminId:g('terminId'), taetigkeit:g('taetigkeit'),
      absenz:(stAbs&&stAbs!=='0')?stAbs:'',
      spesen:parseBetrag(g('spesen')), bemerkung:g('bemerkung')
    };
  }
  if(sekId==='mitarbeiter'){
    var mFlag=function(v){var x=norm(v);return !!x&&x!=='0'&&x!=='false'&&x!=='nein';};
    /* KRITISCH — «Leitung» nur bei einem ECHTEN Ja (1/true/ja/x). Im Altsystem
       ist `arbeiter.manager` ein INT, kein Bit: steht dort eine Personen-ID
       (der Vorgesetzte), würde jede Person mit Vorgesetztem zum
       Abteilungsleiter. Eine 7 ist deshalb kein Ja. */
    var mFlagStreng=function(v){var x=norm(v);return x==='1'||x==='true'||x==='ja'||x==='x'||x==='wahr';};
    var mAus=parseDatum(g('austritt'));
    var mMan=mFlagStreng(g('manager')),mSb=mFlag(g('sachbearb')),mMo=mFlag(g('monteur'));
    var voller=[s(g('vorname')),s(g('name'))].filter(Boolean).join(' ');
    // Wochensoll 0 heisst «nicht geführt» (im Bestand bei allen 46 Aktiven so),
    // nicht «0 % Anstellung» — dann gibt es weder Pensum noch Meldung.
    var mWs=parseBetrag(g('wochenSoll'));if(mWs!=null&&!(mWs>0))mWs=null;
    var mPct=parseBetrag(g('pensumPct'));if(mPct!=null&&!(mPct>0&&mPct<=200))mPct=null;
    return {
      extId:g('extId'), name:g('name'), vorname:g('vorname'), voller:voller, kuerzel:g('kuerzel'),
      email:s(g('email')).toLowerCase(), tel:g('tel'), natel:g('natel'), abteilung:g('abteilung'),
      monteur:mMo, sachbearb:mSb, manager:mMan,
      // Leitung schlägt Büro schlägt Monteur; ohne jedes Kennzeichen Monteur
      // (die kleinste Rolle) — nie Administrator. Anpassen in der Verwaltung.
      /* Rollen des Altsystems → GEMA (Entscheid 2026-09-08): das Büro
         bekommt die ERP-Rollen, nicht `role_unternehmer` (die gehört dem
         FREMDEN Unternehmer und kennt weder Objekte noch Termine, Stunden
         oder Service). Nie Administrator — das bleibt eine bewusste
         Vergabe in der Verwaltung. */
      rolle:mMan?'role_erp_abteilungsleiter':(mSb?'role_erp_sachbearbeiter':'role_monteur'),
      rolleAbgeleitet:!(mMan||mSb||mMo),
      eintritt:parseDatum(g('eintritt')), austritt:mAus,
      aktiv:!mAus||mAus>jetzt().slice(0,10),
      wochenSoll:mWs, ferienTage:parseBetrag(g('ferienTage')),
      ansatz:parseBetrag(g('ansatz')),
      // Ein direktes Pensum schlägt die Ableitung aus dem Wochensoll.
      pensum:(mPct!=null)?{pensum:mPct,basis:null,grund:'',direkt:true}:pensumAusWochenSoll(mWs)
    };
  }
  if(sekId==='uebertraege'){
    return {
      extId:g('extId'), mitarbeiter:g('mitarbeiter'), datum:parseDatum(g('datum')),
      // parseBetrag liefert null für «leer» — das ist hier bedeutungstragend:
      // eine leere Zelle heisst «unverändert», eine 0 heisst «Saldo null».
      ueberzeitH:parseBetrag(g('ueberzeitH')), ferienH:parseBetrag(g('ferienH')),
      ausbezahltH:parseBetrag(g('ausbezahltH')), zuschlagH:parseBetrag(g('zuschlagH')),
      bemerkung:g('bemerkung')
    };
  }
  if(sekId==='bezugspersonen'){
    return {
      objektNr:g('objektNr'), name:g('name'), vorname:g('vorname'),
      rolle:g('rolle'), tel:g('tel'), natel:g('natel'), email:g('email'),
      wohnung:g('wohnung'), bemerkung:g('bemerkung'),
      objekt:{strasse:g('strasse'), plz:g('plz'), ort:g('ort')}
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
  var strasse=g('strasse'), plz=g('plz'), ort=g('ort'), adrAusAltfeld=false;
  /* `objekt1`/`objekt2` sind am Bestand gemessen eine ADRESSE (Strasse bzw.
     Ort), keine Objektbezeichnung. WELCHE Adresse — Objekt oder Verwaltung —
     ist nicht belegt; sie legt sich deshalb NIE über eine vorhandene
     Objektadresse. Fehlt die Strasse aber ganz, ist sie besser als ein
     namenloses Objekt — die Herkunft wird am Objekt vermerkt und gezählt. */
  if(!strasse&&g('bez1')){
    strasse=g('bez1');
    var bo=splitPlzOrt(g('bez2'));
    if(!plz&&bo.plz)plz=bo.plz;
    if(!ort&&bo.ort)ort=bo.ort;
    adrAusAltfeld=true;
  }
  return {
    extId:g('extId'),
    name:[strasse,g('strasse2')].filter(Boolean).join(' · ')||[plz,ort].filter(Boolean).join(' '),
    strasse:strasse, strasse2:g('strasse2'), plz:plz, ort:ort,
    egid:g('egid'), egrid:g('egrid'),
    monteur:g('monteur'), sachb:g('sachb'),
    ref1:g('ref1'), ref2:g('ref2'), notiz:g('notiz'),
    bez1:g('bez1'), bez2:g('bez2'), ordner:g('ordner'), adrAusAltfeld:adrAusAltfeld,
    slots:slots, personen:personen
  };
}

/* Prüft eine normalisierte Zeile → Liste von Hinweisen (blockierend = fehler). */
function pruefe(z,sekId){
  var hin=[];
  if(sekId==='objekte'){
    if(!s(z.strasse)&&!s(z.plz)&&!s(z.ort))hin.push({typ:'fehler',text:'Keine Adresse — Zeile wird übersprungen.'});
    if(!s(z.extId))hin.push({typ:'warn',text:'Keine ID aus dem Altsystem — Dubletten werden über Strasse + PLZ erkannt.'});
    if(z.adrAusAltfeld)hin.push({typ:'info',text:'Keine eigene Strasse — die Adresse stammt aus «objekt1»/«objekt2» des Altsystems.'});
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
    if(!z.statusErkannt&&s(z.zahlStatusText||z.statusText))
      hin.push({typ:'warn',text:'Status «'+s(z.zahlStatusText||z.statusText)+'» unbekannt → «gestellt».'});
    // «Kulanz» und «Garantie» sind kein Zahlungsstand, sondern ein Grund, warum
    // nicht kassiert wird. GEMA hat dafür kein Feld — melden statt einordnen.
    if(/kulanz|garantie/i.test(s(z.zahlStatusText)))
      hin.push({typ:'warn',text:'Zahlungsstatus «'+s(z.zahlStatusText)+'» ist ein Verzichtsgrund, kein Zahlungsstand — die Rechnung entsteht als «gestellt» und bleibt offen.'});
    // «In Buchhaltung geschrieben» sagt nur, dass der Beleg an die Fibu ging.
    // Ob er bezahlt ist, weiss diese Datenbank nicht — das steht in der Fibu.
    if(z.statusVermerk==='fibu')
      hin.push({typ:'info',text:'«'+s(z.zahlStatusText)+'» heisst an die Buchhaltung übergeben, nicht bezahlt — die Rechnung entsteht als «gestellt».'});
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
  }else if(sekId==='termine'){
    if(!s(z.datum))hin.push({typ:'fehler',text:'Kein Datum — Zeile wird übersprungen.'});
    if(!s(z.titel))hin.push({typ:'fehler',text:'Keine Arbeit/Bezeichnung — Zeile wird übersprungen.'});
    if(!s(z.monteur))hin.push({typ:'warn',text:'Kein Monteur — der Termin entsteht ohne Zuordnung.'});
    if(z.typ==='auftrag'&&s(z.auftragNr))hin.push({typ:'info',text:'Wird mit Auftrag '+s(z.auftragNr)+' verknüpft (sofern importiert).'});
    if(z.absenzArbeit)hin.push({typ:'info',text:'«'+s(z.absenz)+'» ist im Altsystem als Absenzart erfasst, aber Arbeit — der Termin bleibt ein Einsatz.'});
    else if(z.absenzFeiertag)hin.push({typ:'warn',text:'«'+s(z.absenz)+'» ist ein Feiertag. GEMA führt Feiertage im Firmenkalender, nicht als Abwesenheit — bitte dort eintragen; der Termin entsteht als «Abwesend».'});
    else if(s(z.absenz)&&!z.absenzErkannt)hin.push({typ:'info',text:'Absenzart «'+s(z.absenz)+'» kennt GEMA noch nicht — sie wird beim Import als eigene Absenzart angelegt (Regeln danach in den ⚙️-Einstellungen der Stundenerfassung setzen).'});
    else if(z.typ==='ferien')hin.push({typ:'info',text:'Abwesenheit «'+s(z.absenz)+'» → GEMA-Typ «'+s(z.absenzTyp)+'», wird als «Abwesend» geplant.'});
    if(s(z.zeitRoh))hin.push({typ:'warn',text:'Zeit «'+s(z.zeitRoh)+'» ist keine Uhrzeit — der Termin entsteht ohne Zeit, der Wert bleibt als Vermerk. Im Altsystem die Spalten «von60»/«bis60» exportieren.'});
  }else if(sekId==='anlagen'){
    if(!s(z.name))hin.push({typ:'fehler',text:'Keine Bezeichnung — Zeile wird übersprungen.'});
    if(!s(z.objekt&&z.objekt.strasse))hin.push({typ:'warn',text:'Ohne Objekt-Adresse — die Anlage bleibt ohne Objektbezug.'});
    if(!s(z.naechsteWartung)&&!z.intervall)
      hin.push({typ:'warn',text:'Weder nächste Revision noch Intervall — die Anlage erscheint in keinem Wartungskalender.'});
  }else if(sekId==='stunden'){
    if(!s(z.mitarbeiter))hin.push({typ:'fehler',text:'Kein Mitarbeiter — Zeile wird übersprungen.'});
    if(!s(z.datum))hin.push({typ:'fehler',text:'Kein Datum — Zeile wird übersprungen.'});
    if(z.stunden==null||!z.stunden)hin.push({typ:'fehler',text:'Keine Stunden — Zeile wird übersprungen.'});
    /* Einheiten-Schutz: An einem Tag kann niemand mehr als 24 h leisten. Ein
       grösserer Wert heisst, dass die Spalte nicht in Stunden geführt wird —
       `hours.hrs_length` des Altsystems ist ein INT, dessen Einheit (Minuten
       oder Sekunden) nicht belegt ist. Ohne diesen Riegel entstünden aus
       28 800 Sekunden 28 800 Stunden, und die Jahresbilanz wäre Schrott. */
    else if(z.stunden>24)hin.push({typ:'fehler',text:'«'+z.stunden+'» Stunden an einem Tag — das kann keine Stundenzahl sein. Die Spalte ist offenbar nicht in Stunden geführt (im Altsystem ist «hrs_length» ein Zähler, dessen Einheit erst zu klären ist). Zeile wird übersprungen.'});
    else if(z.stunden>16)hin.push({typ:'warn',text:z.stunden+' h an einem Tag — bitte prüfen, ob die Spalte wirklich Stunden führt.'});
    if(z.absenzArbeit)hin.push({typ:'info',text:'«'+s(z.absenz)+'» ist Arbeit, keine Absenz — die Zeit zählt als geleistet.'});
    else if(s(z.absenzTyp))hin.push({typ:'info',text:'Absenz «'+s(z.absenz)+'» → GEMA-Typ «'+s(z.absenzTyp)+'» am Tag.'});
    else if(s(z.absenz))hin.push({typ:'info',text:'Absenzart «'+s(z.absenz)+'» kennt GEMA noch nicht — sie wird beim Import als eigene Absenzart angelegt und der Tag als Abwesenheit erfasst (Regeln danach in den ⚙️-Einstellungen setzen).'});
  }else if(sekId==='mitarbeiter'){
    if(!s(z.name))hin.push({typ:'fehler',text:'Kein Name — Zeile wird übersprungen.'});
    if(!s(z.email))hin.push({typ:'warn',text:'Keine E-Mail — der Benutzer entsteht ohne Login und ohne Einladung (Stunden und Termine lassen sich trotzdem zuordnen).'});
    hin.push({typ:'info',text:'Rolle: '+z.rolle.replace('role_','')+(z.rolleAbgeleitet?' (kein Kennzeichen im Altsystem — kleinste Rolle)':'')+'.'});
    if(!z.aktiv)hin.push({typ:'info',text:'Ausgetreten am '+s(z.austritt)+' — wird INAKTIV angelegt.'});
    if(z.pensum&&z.pensum.direkt)hin.push({typ:'info',text:'Pensum '+z.pensum.pensum+' % (direkt aus dem Altsystem).'});
    else if(z.wochenSoll!=null){
      if(z.pensum.pensum!=null)hin.push({typ:'info',text:'Wochensoll '+z.wochenSoll+' h → Pensum '+z.pensum.pensum+' % (gegen '+z.pensum.basis+' h Firmen-Wochensoll inkl. Vorholzeit).'});
      else hin.push({typ:'warn',text:'Wochensoll '+z.wochenSoll+' h — '+z.pensum.grund+' Das Pensum bleibt leer, der Wert steht als Vermerk in den Stammdaten.'});
    }else hin.push({typ:'info',text:'Kein Pensum im Export — GEMA rechnet mit 100 %, anpassbar in den ⚙️-Stammdaten der Stundenerfassung.'});
  }else if(sekId==='uebertraege'){
    if(!s(z.mitarbeiter))hin.push({typ:'fehler',text:'Kein Mitarbeiter — Zeile wird übersprungen.'});
    if(!s(z.datum))hin.push({typ:'fehler',text:'Kein Stichtag — Zeile wird übersprungen.'});
    if(z.ueberzeitH==null&&z.ferienH==null)
      hin.push({typ:'fehler',text:'Weder Stundenübertrag noch Ferienguthaben — die Zeile trüge keinen Saldo.'});
    if(z.ferienH!=null)hin.push({typ:'info',text:'Ferienguthaben '+z.ferienH.toFixed(2)+' h auf den '+s(z.datum)+'.'});
    if(z.ueberzeitH!=null&&z.ueberzeitH<0)
      hin.push({typ:'info',text:'Negativer Stundenübertrag ('+z.ueberzeitH.toFixed(2)+' h) — Minusstunden werden übernommen.'});
    if(z.zuschlagH!=null&&z.zuschlagH)
      hin.push({typ:'warn',text:'Zuschlägestunden ('+z.zuschlagH.toFixed(2)+' h) bleiben als Vermerk — GEMA führt Zuschläge über die Töpfe A/B der Wochenauswertung.'});
  }else if(sekId==='bezugspersonen'){
    if(!s(z.name))hin.push({typ:'fehler',text:'Kein Name — Zeile wird übersprungen.'});
    if(!s(z.objekt&&z.objekt.strasse)&&!s(z.objektNr))
      hin.push({typ:'fehler',text:'Weder Objekt-Adresse noch Objekt-ID — die Person wäre keinem Objekt zuzuordnen.'});
    if(!s(z.rolle))hin.push({typ:'warn',text:'Keine Rolle — die Person entsteht ohne Typ.'});
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
/* Grössen-Sperre: der Import läuft im Browser und braucht ein Vielfaches
   der Dateigrösse an Arbeitsspeicher (Text + Zeilen + Zellen + Plan). Eine
   ungeteilte Positionsdatei (632 000 Zeilen, ~200 MB) sprengt jeden Tab —
   besser vorher stoppen als mitten im Lesen mit «Aw, Snap». Das Export-Paket
   liefert Positionen darum je Jahr. */
var DATEI_MAX_TEXT=60*1024*1024, DATEI_MAX_XLSX=20*1024*1024;
function leseDatei(file){
  if(!file)return Promise.reject(new Error('Keine Datei gewählt.'));
  var nm=(file.name||'').toLowerCase();
  var istXlsx=/\.xlsx?$|\.xlsm$/.test(nm);
  var max=istXlsx?DATEI_MAX_XLSX:DATEI_MAX_TEXT;
  if(file.size>max){
    return Promise.reject(new Error('«'+(file.name||'Datei')+'» ist '+Math.round(file.size/1048576)+' MB gross — zu viel für den Import im Browser (Grenze '
      +Math.round(max/1048576)+' MB'+(istXlsx?' bei Excel-Dateien':'')+'). Bitte in Jahresscheiben exportieren (das Export-Paket tut das bei den Positionen selbst) und die Scheiben nacheinander einlesen.'));
  }
  // .tsv ist die Endung des Export-Pakets (erp_export/export.ps1, mysql --batch):
  // Tab-getrennt, NULL als Wort, Sonderzeichen escapt — siehe parseCsv.
  if(/\.(csv|txt|tsv)$/.test(nm)){
    return file.text().then(function(t){return parseCsv(t,{mysql:/\.tsv$/.test(nm)});});
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
  var alle=[];
  // GemaAuth.getUsers() parst den Benutzer-Cache bei jedem Aufruf — bei
  // 90 000 Stundenzeilen wären das Minuten. Während eines Laufs EINMAL.
  if(_lauf&&_lauf.users)alle=_lauf.users;
  else{
    try{
      var u=GemaAuth.getCurrentUser();
      alle=(GemaAuth.getUsers()||[]).filter(function(x){return x&&(!u||x.orgId===u.orgId);});
    }catch(e){}
    if(_lauf)_lauf.users=alle;
  }
  // Aktive zuerst; INAKTIVE (Ausgetretene) danach — die Historie ihrer Stunden
  // und Termine braucht trotzdem eine Person. Ohne diesen zweiten Durchgang
  // landeten alle Zeilen einer ausgetretenen Person ohne Zuordnung.
  function suche(users){
    var hit=users.find(function(x){return norm(x.name)===t;});
    if(!hit)hit=users.find(function(x){
      return (s(x.name).split(/\s+/).map(norm).indexOf(t)>=0);
    });
    if(!hit)hit=users.find(function(x){return norm(x.name).indexOf(t)>=0&&t.length>=3;});
    return hit||null;
  }
  var hit=suche(alle.filter(function(x){return x.active!==false;}))||suche(alle);
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
  var hit=_abCache.find(function(b){return norm(b.name||b.label)===norm(lab);});
  if(hit)return hit.id;
  var id='ab_'+norm(lab);
  // Form wie in den ⚙️-Einstellungen: {id, name, farbe}. Alle Konsumenten
  // (sv_service, pm_einsatzplan, pm_erp, pm_stunden) filtern auf `b.name` —
  // ein Bereich nur mit `label` wäre überall unsichtbar und beim ersten
  // Speichern der Anlage verloren gegangen.
  _abCache.push({id:id,name:lab,farbe:'#64748b'});
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
  // Eigene Absenzarten der Firma schon für die Vorschau kennen — sonst
  // meldete ein zweiter Lauf «kennt GEMA noch nicht» für Typen, die der
  // erste angelegt hat.
  absenzartenAusOrgLaden();
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
  if(sekId==='termine')poolEigene(EP_POOL).forEach(function(e){
    bekannt[terminSchluessel(e.datum,e.monteurName,e.titel,e.extId||(e.quelle&&e.quelle.extId))]=e;});
  if(sekId==='uebertraege')poolEigene(ST_POOL).filter(function(t){return t.typ==='uebertrag';})
    .forEach(function(t){
      bekannt[uebertragSchluessel(t.datum,t.userName,t.extId||(t.quelle&&t.quelle.extId))]=t;});
  if(sekId==='mitarbeiter'){
    var oid=eigeneOrgId();
    var alleUser=[];try{alleUser=GemaAuth.getUsers()||[];}catch(e){}
    alleUser.forEach(function(x){
      if(!x)return;
      var ex=s(x.quelle&&x.quelle.extId);
      if(ex&&x.quelle.system==='ERP-Migration')bekannt['m:ext:'+norm(ex)]=x;
      var em=s(x.username||(x.profile&&x.profile.email)).toLowerCase();
      if(em&&em.indexOf('@')>0)bekannt['m:mail:'+em]=x;
      if(x.orgId===oid&&s(x.name))bekannt['m:name:'+norm(x.name)]=x;
    });
  }
  if(sekId==='anlagen')poolEigene(ANL_POOL).forEach(function(a){
    var ae=s(a.extId||(a.quelle&&a.quelle.extId));
    bekannt[ae?('ext:'+norm(ae)):('x:'+norm([a.name,a.serienNr,a.objektName].join('|')))]=a;});
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
    }else if(sekId==='termine'){
      // Über denselben Schlüssel wie der Writer — auch der Monteurname wird
      // hier schon aufgelöst, sonst meldete die Vorschau «neu» für etwas,
      // das der Import dann doch nur ergänzt.
      var tm=s(z.monteur)?findeSachbearbeiter(z.monteur):null;
      var tk=terminSchluessel(z.datum,tm?tm.name:s(z.monteur),z.titel,z.extId);
      if(bekannt[tk]){aktion='aktualisiert';stats.aktualisiert++;}
      else{stats.neu++;bekannt[tk]={};}
    }else if(sekId==='anlagen'){
      var alk=s(z.extId)?('ext:'+norm(z.extId))
        :('x:'+norm([z.name,z.serienNr,z.objekt&&z.objekt.strasse].join('|')));
      if(bekannt[alk]){aktion='aktualisiert';stats.aktualisiert++;}
      else{stats.neu++;bekannt[alk]={};}
    }else if(sekId==='mitarbeiter'){
      var mk=mitarbeiterSchluessel(z,bekannt);
      if(mk){aktion='aktualisiert';stats.aktualisiert++;}
      else{stats.neu++;bekannt['m:name:'+norm(z.voller)]={};if(z.email)bekannt['m:mail:'+z.email]={};}
    }else if(sekId==='uebertraege'){
      var um=s(z.mitarbeiter)?findeSachbearbeiter(z.mitarbeiter):null;
      var uk=uebertragSchluessel(z.datum,um?um.name:s(z.mitarbeiter),z.extId);
      if(bekannt[uk]){aktion='aktualisiert';stats.aktualisiert++;}
      else{stats.neu++;bekannt[uk]={};}
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
/* Belege laufen über denselben Lauf-Speicher wie alle anderen Pools (siehe
   unten): während eines Imports liegt der Pool EINMAL im Speicher, die Cloud
   bekommt Blöcke statt 26 000 Einzel-Requests, und der Cache wird über
   GemaSync.setCached nachgeführt — ein stilles localStorage-Quota-Versagen
   liess sonst jeden weiteren Abschnitt den Stand VOR dem Lauf lesen
   (Aufträge fanden ihre Offerten nicht, Wiederholungen legten Dubletten an). */
function dokPool(){return poolLesen(DOK_POOL);}
function dokSichern(doc){return poolSichern(DOK_POOL,DOK_PREFIX,doc,'erp');}
function dokById(id){
  var P=_laufPool(DOK_POOL);
  if(P){var i=P.ix[id];return i!=null?P.arr[i]:null;}
  return dokPool().find(function(x){return x&&x.id===id;})||null;
}
/* Beleg-Nachschlag: während eines Laufs EIN Index über die eigenen Belege
   (dokSchluessel, typ|nr, typ|ext), bei jedem poolSichern nachgeführt —
   statt je Beleg den ganzen Pool linear zu durchsuchen (26 000 × 26 000). */
function _dokKeyFns(){
  return [
    function(d){return (d&&d.typ)?dokSchluessel(d.typ,d):'';},
    function(d){return (d&&d.typ&&s(d.nr))?(d.typ+'|nr:'+norm(d.nr)):'';},
    function(d){var ext=s(d&&(d.extId||(d.quelle&&d.quelle.extId)));return (d&&d.typ&&ext)?(d.typ+'|ext:'+norm(ext)):'';}
  ];
}
function dokSuche(key){
  if(!key)return null;
  var LX=laufIndex(DOK_POOL,'dok',_dokKeyFns());
  if(LX)return LX.map[key]||null;
  var fns=_dokKeyFns();
  return bestehendeDocs().find(function(d){return fns.some(function(f){return f(d)===key;});})||null;
}

/* Dieselbe Mechanik für die übrigen ERP-Sammlungen: bei JEDEM Aufruf frisch
   lesen, damit aufeinanderfolgende Schreibungen einander sehen. */
/* Zielsammlungen ausserhalb des ERP-Moduls. `mod` ist der moduleKey von
   GemaSync — er MUSS stimmen, sonst landet der Record in der falschen
   Collection und keine Modulseite findet ihn wieder (CLAUDE.md §3). */
var KRED_POOL='gema_erp_kred_pool_v1', KRED_PREFIX='erpkred:';
var KAT_POOL='gema_erp_kat_pool_v1',   KAT_PREFIX='erpkat:';
var EP_POOL='gema_einsatz_pool_v1',    EP_PREFIX='einsatz:', EP_MODULE='einsatzplan';
var ST_POOL='gema_std_pool_v1',        ST_PREFIX='std:',     ST_MODULE='stundenerfassung';
var ANL_POOL='gema_sv_anlagen_pool_v1',ANL_PREFIX='svanl:',  SV_MODULE='service';
function poolLesenRoh(key){
  var pool=[];
  try{
    if(typeof GemaSync!=='undefined'&&GemaSync.getCached)pool=GemaSync.getCached(key)||[];
    if(!pool.length){var r=localStorage.getItem(key);if(r)pool=JSON.parse(r)||[];}
  }catch(e){}
  return pool.slice();
}

/* ── Lauf-Speicher ────────────────────────────────────────────────────────
   Ein Import schreibt tausende Datensätze in denselben Pool. Vorher las
   poolSichern für JEDEN davon den ganzen Pool, suchte linear, serialisierte
   alles neu nach localStorage und schickte einen eigenen Cloud-Request:
   quadratisch — 30 000 Stunden-Tage hiessen 30 000 × (parse + stringify
   eines Pools mit bis zu 30 000 Datensätzen) und ein eingefrorener Tab.

   Während eines Laufs (ausfuehren) liegt jeder berührte Pool EINMAL im
   Speicher, mit Index nach id. Geschrieben wird gebündelt: localStorage je
   Pool beim Flush (alle 500 Schreibungen und am Ende — ein Absturz mitten
   im Lauf verliert damit höchstens den letzten Block), die Cloud über
   saveRecords in Blöcken zu 200. GemaSync.getCached liest localStorage
   zuerst, der Flush nach localStorage IST also die Cache-Nachführung — das
   Verhalten für alle Leser bleibt, wie es mit Einzelschreibungen war.
   Ohne laufenden Import (kein laufStart) verhält sich poolSichern wie
   zuvor: sofort schreiben. */
var _lauf=null, _laufAktiv=false, _abbruch=false;
var _laufStat={gesendet:0,eingereiht:0,fehler:0};
var LAUF_FLUSH_ALLE=500, LAUF_CLOUD_BLOCK=200, LAUF_CLOUD_BYTES=2*1024*1024;
function _laufVerlassenWarnung(ev){
  // Während eines Laufs die Seite zu verlassen hiesse: laufende Uploads
  // abgebrochen, der letzte Block nie gesendet. Der Browser fragt nach.
  ev.preventDefault();ev.returnValue='Der Import läuft noch — Seite wirklich verlassen?';return ev.returnValue;
}
function laufStart(){
  _lauf={pools:{},index:{},cloud:{},n:0};
  _laufAktiv=true;_abbruch=false;
  _laufStat={gesendet:0,eingereiht:0,fehler:0};
  try{if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('beforeunload',_laufVerlassenWarnung);}catch(e){}
}
function laufEnde(){
  _laufAktiv=false;
  try{if(typeof window!=='undefined'&&window.removeEventListener)window.removeEventListener('beforeunload',_laufVerlassenWarnung);}catch(e){}
}
/* Abbruch durch den Anwender: die Kette hält beim nächsten Atemzug an, das
   bereits Geschriebene wird geflusht, der Bericht sagt, wo es stoppte. */
function abbrechen(){_abbruch=true;}
function laeuft(){return _laufAktiv;}
function _laufPool(key){
  if(!_lauf)return null;
  var P=_lauf.pools[key];
  if(!P){
    var arr=poolLesenRoh(key),ix={};
    arr.forEach(function(r,i){if(r&&r.id!=null)ix[r.id]=i;});
    P=_lauf.pools[key]={arr:arr,ix:ix,dirty:false};
  }
  return P;
}
function poolLesen(key){
  var P=_laufPool(key);
  return P?P.arr.slice():poolLesenRoh(key);
}
/* Nachschlage-Index für einen Pool während des Laufs: `fns` liefern je Record
   einen Schlüssel ('' = nicht indexieren). Einmal aus den EIGENEN Records
   gebaut (org-gescopt wie poolEigene), bei jedem poolSichern nachgeführt.
   Ohne laufenden Import: null — der Aufrufer sucht dann wie bisher. */
function laufIndex(key,name,fns){
  if(!_lauf)return null;
  var byName=_lauf.index[key]=_lauf.index[key]||{};
  var LX=byName[name];
  if(!LX){
    LX=byName[name]={fns:fns,map:{}};
    poolEigene(key).forEach(function(r){fns.forEach(function(f){var k=f(r);if(k)LX.map[k]=r;});});
  }
  return LX;
}
/* Fortschritt melden und der Oberfläche alle 200 Schritte eine Atempause
   geben: die Import-Kette besteht aus Microtasks, ohne setTimeout zeichnet
   der Browser bis zum Ende nichts — auch keine Fortschrittsanzeige. */
function laufAtem(i,n,opts){
  if(_abbruch){var e=new Error('Import abgebrochen bei Zeile '+(i+1)+' von '+n);e.abgebrochen=true;e.zeile=i+1;return Promise.reject(e);}
  if(opts&&opts.onFortschritt){try{opts.onFortschritt(i+1,n);}catch(e2){}}
  if(i%200===199)return new Promise(function(r){setTimeout(r,0);});
  return Promise.resolve();
}
function poolSichern(key,prefix,rec,mod){
  var P=_laufPool(key);
  if(!P){
    // Kein Lauf aktiv (z.B. ein einzelner Aufruf ausserhalb von ausfuehren):
    // sofort schreiben, wie früher.
    var pool=poolLesenRoh(key);
    var j=pool.findIndex(function(x){return x&&x.id===rec.id;});
    if(j>=0)pool[j]=rec;else pool.push(rec);
    try{localStorage.setItem(key,JSON.stringify(pool));}catch(e){}
    var p=(typeof GemaSync!=='undefined'&&GemaSync.saveRecord)
      ? GemaSync.saveRecord(mod||'erp',prefix+rec.id,rec) : Promise.resolve();
    return p.then(function(){return rec;},function(){return rec;});
  }
  var i=P.ix[rec.id];
  if(i!=null)P.arr[i]=rec;else{P.ix[rec.id]=P.arr.length;P.arr.push(rec);}
  P.dirty=true;
  var byName=_lauf.index[key];
  if(byName)Object.keys(byName).forEach(function(nm){
    var LX=byName[nm];LX.fns.forEach(function(f){var k=f(rec);if(k)LX.map[k]=rec;});
  });
  var m=mod||'erp';
  (_lauf.cloud[m]=_lauf.cloud[m]||{})[prefix+rec.id]={key:prefix+rec.id,data:rec};
  _lauf.n++;
  if(_lauf.n%LAUF_FLUSH_ALLE===0)return poolFlush({weiter:true}).then(function(){return rec;});
  return Promise.resolve(rec);
}
/* Schreibt alles Ausstehende. {weiter:true} lässt den Lauf offen (Zwischen-
   Flush), sonst ist der Lauf danach beendet. Fehler eines Cloud-Blocks landen
   in GemaSyncs Outbox (saveRecords → _queueOnFail); hier wird nichts
   verschluckt, aber auch nichts wiederholt. */
function poolFlush(o){
  if(!_lauf){if(!(o&&o.weiter))laufEnde();return Promise.resolve();}
  var L=_lauf;
  if(!(o&&o.weiter))_lauf=null;
  Object.keys(L.pools).forEach(function(key){
    var P=L.pools[key];if(!P.dirty)return;
    // Cache-Nachführung über GemaSync (localStorage + Spiegel + IndexedDB):
    // ein eigenes localStorage.setItem scheiterte still an der Quota, und
    // GemaSync.getCached lieferte danach den Stand VOR dem Lauf.
    if(typeof GemaSync!=='undefined'&&GemaSync.setCached){try{GemaSync.setCached(key,P.arr);}catch(e){}}
    else{try{localStorage.setItem(key,JSON.stringify(P.arr));}catch(e2){}}
    P.dirty=false;
  });
  var cloud=L.cloud;L.cloud={};
  if(typeof GemaSync==='undefined'||!GemaSync.saveRecords){if(!(o&&o.weiter))laufEnde();return Promise.resolve();}
  var kette=Promise.resolve();
  Object.keys(cloud).forEach(function(m){
    var recs=Object.keys(cloud[m]).map(function(k){return cloud[m][k];});
    // Blöcke nach Anzahl UND Bytes — 200 Belege mit je 150 KB Positionen
    // wären ein 30-MB-Request.
    var block=[],bytes=0;
    function senden(){
      if(!block.length)return;
      var b=block;block=[];bytes=0;
      kette=kette.then(function(){
        return Promise.resolve(GemaSync.saveRecords(m,b)).then(function(){
          _laufStat.gesendet+=b.length;
        },function(e){
          if(e&&e.queued)_laufStat.eingereiht+=b.length;else _laufStat.fehler+=b.length;
        });
      });
    }
    recs.forEach(function(r){
      var sz=0;try{sz=JSON.stringify(r.data).length;}catch(e){}
      if(block.length&&(block.length>=LAUF_CLOUD_BLOCK||bytes+sz>LAUF_CLOUD_BYTES))senden();
      block.push(r);bytes+=sz;
    });
    senden();
  });
  if(!(o&&o.weiter))kette=kette.then(laufEnde,laufEnde);
  return kette;
}
/* Cloud-Bilanz des letzten Laufs — für den Bericht (nichts wird als
   «fertig» gemeldet, was nur in der Outbox liegt oder scheiterte). */
function laufBilanz(){return {gesendet:_laufStat.gesendet,eingereiht:_laufStat.eingereiht,fehler:_laufStat.fehler};}
/* Org-gefilterter Lesezugriff — jeder dieser Pools ist org-gescopt. */
function poolEigene(key){
  var o=eigeneOrgId();
  return poolLesen(key).filter(function(r){return r&&(!o||r.orgId===o);});
}
function eigeneOrgId(){var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}return u?u.orgId:'';}
/* KRITISCH — beide Pools sind org-gescopt und tragen `orgId` auf jedem Record
   (CLAUDE.md §3): ohne den Filter sähe der Import fremde Firmen, ohne den
   Stempel beim Schreiben lehnt RLS den Record ab. */
function bestehendeKreditoren(){return poolEigene(KRED_POOL);}
function bestehendeKataloge(){return poolEigene(KAT_POOL);}
function kredSchluessel(k){
  var ext=s(k&&(k.extId||(k.quelle&&k.quelle.extId)));
  if(ext)return 'ext:'+ext.toLowerCase();
  return 'lr:'+norm([k&&k.lieferant,k&&k.rechnungsNr].join('|'));
}
/* Beleg-Nachschlag für Positionen und Zahlungen: Nummer UND Alt-ID, weil der
   Positions-Export je nach Abfrage das eine oder das andere liefert. */
function dokIndex(){
  var LX=laufIndex(DOK_POOL,'dok',_dokKeyFns());
  if(LX)return LX.map;
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
  var alt=dokSuche(dokSchluessel('rechnung',z));
  var auf=null;
  if(s(z.auftragNr)){
    auf=dokSuche('auftrag|nr:'+norm(z.auftragNr));
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
      // Auch 0 % ist eine Aussage (ein Beleg ohne MwSt). Nur ein UNBEKANNTER
      // Satz bleibt leer — pm_erp zeigte sonst «MwSt. undefined %».
      if(doc.mwstPct==null&&z.mwstPct!=null)doc.mwstPct=z.mwstPct;
      if(kd&&!doc.kundeId){doc.kundeId=kd.id;doc.kundeSnapshot=GemaAdressen.snapshot(kd);}
      if(obj&&!doc.objektId){doc.objektId=obj.id;doc.objektName=obj.name||'';}
      if(s(z.ref1)&&!s(doc.externeRef1))doc.externeRef1=s(z.ref1);
      if(s(z.ref2)&&!s(doc.externeRef2))doc.externeRef2=s(z.ref2);
      if(s(z.wohnung)&&!s(doc.wohnung))doc.wohnung=s(z.wohnung);
      if(s(z.bemerkung)&&!s(doc.notiz))doc.notiz=s(z.bemerkung);
      // Zahlungsfrist: das Fälligkeitsdatum des Altsystems, wenn es eines
      // führt; sonst aus der Zahlungsbedingung, sonst Firmen-Standard.
      if(!s(doc.frist)&&s(z.faellig))doc.frist=s(z.faellig);
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
      if(s(z.zahlStatusText)&&!s(doc.importZahlStatusText))doc.importZahlStatusText=s(z.zahlStatusText);
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
      // Dokumenten-Ordner des Altsystems («lkdir»): nur der ORDNERNAME, kein
      // Pfad. Er endet auf die Datensatz-ID, damit bleibt die Zuordnung
      // Ordner → Beleg eindeutig, wenn die Dateien später nachwandern.
      if(s(z.ordner)&&!s(doc.importOrdner))doc.importOrdner=s(z.ordner);
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
      // «Bezahlt» laut Altsystem (debistatus), aber ohne Zahlungsdatum — die
      // Spalten dafür sind dort durchweg leer. Eine Zahlung über den Brutto-
      // betrag, auf das Rechnungsdatum datiert und genau so beschriftet:
      // sonst stünde «Bezahlt» neben «CHF 0.00 von X bezahlt», und die
      // Debitoren-Kennzahlen zählten den Beleg als offen.
      if(!alt&&doc.status==='bezahlt'&&!(doc.zahlungen||[]).length&&(z.brutto!=null||z.netto!=null)){
        doc.zahlungen=[{datum:doc.datum,betrag:(z.brutto!=null?z.brutto:z.netto)||0,
                        bemerkung:'Bezahlt gemäss Altsystem — Zahlungsdatum dort nicht geführt'}];
        report.bezahltOhneDatum=(report.bezahltOhneDatum||0)+1;
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
  var alt=dokSuche(dokSchluessel('auftrag',z));
  var off=null;
  if(s(z.offertNr)){
    off=dokSuche('offerte|nr:'+norm(z.offertNr));
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
      // Ordnername auf dem Netzlaufwerk des Altsystems («lkdir») — kein Pfad.
      if(s(z.ordner)&&!s(doc.importOrdner))doc.importOrdner=s(z.ordner);
      if(s(z.bemerkung)&&!s(doc.notiz))doc.notiz=s(z.bemerkung);
      // Nachkalkulation des Altsystems: reiner Schnappschuss zum Vergleichen.
      // Sie fliesst NICHT in GEMAs Zahlen — im Altbestand sind Lohnkosten und
      // Gemeinkosten unparametriert, der dortige «Gewinn» ist deshalb bloss
      // Rechnungssumme minus Material und würde in GEMA falsch dastehen.
      if(z.nachkalk&&!doc.importNachkalk){
        doc.importNachkalk=z.nachkalk;
        report.nachkalk=(report.nachkalk||0)+1;
      }
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
        var akt=dokById(off.id)||off;
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
  var alt=dokSuche(dokSchluessel('offerte',z));

  // 1) Kunde (Rechnungsempfänger)
  var kundeP=Promise.resolve(null);
  if(s(z.kunde&&z.kunde.firma)){
    var roh=Object.assign({},z.kunde);
    if(roh.nr)roh.extId='adr:'+roh.nr;
    kundeP=adresseSichern(roh,adrCtx);
  }
  return kundeP.then(function(kd){
    // 2) Objekt — verknüpfen, sonst (auf Wunsch) anlegen
    return objektFuerBeleg(z.objekt,kd,z.personen||null,orgId,report,opts).then(function(obj){
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
      if(doc.mwstPct==null&&z.mwstPct!=null)doc.mwstPct=z.mwstPct;
      if(kd&&!doc.kundeId){doc.kundeId=kd.id;doc.kundeSnapshot=GemaAdressen.snapshot(kd);}
      if(obj&&!doc.objektId){doc.objektId=obj.id;doc.objektName=obj.name||'';}
      if(s(z.ref1)&&!s(doc.externeRef1))doc.externeRef1=s(z.ref1);
      if(s(z.ref2)&&!s(doc.externeRef2))doc.externeRef2=s(z.ref2);
      if(s(z.wohnung)&&!s(doc.wohnung))doc.wohnung=s(z.wohnung);
      if(s(z.bemerkung)&&!s(doc.notiz))doc.notiz=s(z.bemerkung);
      // Vermerke — Offertart und die Kalkulationsstunden des Altsystems
      // haben in GEMA kein eigenes Feld und bleiben am Beleg sichtbar.
      if(s(z.artText)&&!s(doc.importArtText))doc.importArtText=s(z.artText);
      if(z.stunden!=null&&doc.importStunden==null)doc.importStunden=z.stunden;
      if(s(z.zahlbed)&&!s(doc.importZahlbed))doc.importZahlbed=s(z.zahlbed);
      if(!s(doc.zahlbedId)&&s(z.zahlbed)){var zbO=zahlbedIdFuer(z.zahlbed);if(zbO)doc.zahlbedId=zbO;}
      // Ordnername auf dem Netzlaufwerk des Altsystems («lkdir») — kein Pfad.
      if(s(z.ordner)&&!s(doc.importOrdner))doc.importOrdner=s(z.ordner);
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
  if(z.art==='zuschlag'||z.art==='rabatt'){
    /* KRITISCH — pm_erp rechnet diese beiden Arten allein aus `wert`/`modus`
       (erpAufschlagBetrag); `menge`/`ep` wären dort unsichtbar und das
       Belegtotal zu tief, während die Summenkontrolle des Imports sie
       mitzählte und nichts merkte. Das Altsystem führt den Zuschlag als
       Betrag (postyp 27 «Preis ohne Menge»), also modus «chf». Ein negativer
       Zuschlag ist ein Rabatt — GEMA zieht `rabatt` mit positivem Wert ab. */
    var wBetrag=(z.ep!=null?z.ep:0)*(z.menge!=null?z.menge:1);
    p.art=(wBetrag<0)?'rabatt':z.art;
    p.modus='chf';
    p.wert=Math.round(Math.abs(wBetrag)*100)/100;
    if(s(z.einheit))p.importEinheit=s(z.einheit);
  }else if(z.art!=='titel'&&z.art!=='text'){
    p.menge=z.menge!=null?z.menge:1;
    p.einheit=s(z.einheit)||'Psch';
    p.ep=z.ep!=null?z.ep:0;
    if(z.rabattPct)p.rabattPct=z.rabattPct;
    if(s(z.dim))p.dim=s(z.dim);
  }
  if(s(z.posNr))p.importPosNr=s(z.posNr);
  if(s(z.guid))p.importGuid=s(z.guid);
  if(s(z.parentGuid))p.importParentGuid=s(z.parentGuid);
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
  grp.forEach(function(g,gi){
    kette=kette.then(function(){return laufAtem(gi,grp.length,opts);}).then(function(){
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
      /* Summenkontrolle: Die Sammelposition trug den Betrag, den das Altsystem
         am Beleg führt. Ergeben die echten Positionen etwas anderes, ist das
         eine Aussage — Belegrabatt, Akonto-Abzug oder ein nachträglich
         geänderter Beleg. Sie wird am Dokument festgehalten und gezählt, statt
         den Beleg stillschweigend mit einer neuen Summe dastehen zu lassen.
         Toleranz: ein Franken oder ein halbes Promille, was grösser ist. */
      var soll=(akt.importSumme&&akt.importSumme.netto!=null)?akt.importSumme.netto:null;
      if(soll!=null){
        var ist=positionenNetto(doc.positionen);
        if(Math.abs(ist-soll)>Math.max(1,Math.abs(soll)*0.005)){
          doc.importSummeAbweichung={soll:soll,ist:ist,diff:Math.round((ist-soll)*100)/100};
          report.summeAbweichung=(report.summeAbweichung||0)+1;
        }else if(doc.importSummeAbweichung){
          delete doc.importSummeAbweichung;
        }
      }
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
  // Im Browser rechnet pm_erp selbst (Belegrabatt, Schlussblock, Rundung auf
  // 5 Rp.) — eine eigene Nachbildung wiche genau dort ab. Der Fallback unten
  // dient den Node-Tests und dem Fall, dass pm_erp nicht geladen ist.
  try{
    if(typeof window!=='undefined'&&typeof window.erpDocTotals==='function'){
      var tt=window.erpDocTotals(doc);
      if(tt&&isFinite(parseFloat(tt.brutto)))return Math.round(parseFloat(tt.brutto)*100)/100;
    }
  }catch(e){}
  var netto=positionenNetto(doc&&doc.positionen);
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
  grp.forEach(function(g,gi){
    kette=kette.then(function(){return laufAtem(gi,grp.length,opts);}).then(function(){
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
   ['importEsrRef',z.esrRef],['importSesamOpNr',z.sesamOpNr],
   ['importOrdner',z.ordner]].forEach(function(p){
    if(s(p[1])&&!s(k[p[0]]))k[p[0]]=s(p[1]);
  });
  if(k.importMwstBetrag==null&&z.mwstBetrag!=null)k.importMwstBetrag=z.mwstBetrag;
  if(k.importRestBetrag==null&&z.restBetrag!=null)k.importRestBetrag=z.restBetrag;
  if(z.zuteilungen!=null&&k.importZuteilungen==null){
    k.importZuteilungen=z.zuteilungen;
    if(z.zuteilungen>1)report.kreditorMehrfach=(report.kreditorMehrfach||0)+1;
  }
  if(!alt){
    // Form wie erpKredLog in pm_erp: {am, von:'Name', text} — ein Objekt in
    // `von` zeigte dort «[object Object]».
    k.verlauf=(k.verlauf||[]).concat([{
      am:jetzt(), von:u?u.name:'', text:'Übernommen aus dem Altsystem'
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
/* Ein Katalog-Record trägt höchstens KAT_MAX_ARTIKEL Artikel. 15 888 Artikel
   in EINEM Record wären ~5 MB — zu gross für einen einzelnen Upload und für
   den Editor. Darum Teil-Kataloge «Name», «Name (2)», … die über
   `importBasisName` zusammengehören; Dubletten werden über ALLE Teile
   geprüft. */
var KAT_MAX_ARTIKEL=400;
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
      var teile=bestehendeKataloge().filter(function(k){return norm(k.importBasisName||k.name)===norm(name);})
        .map(function(k){return JSON.parse(JSON.stringify(k));});
      var da={};
      teile.forEach(function(k){(k.artikel||[]).forEach(function(a){
        if(s(a.extId))da['ext:'+norm(a.extId)]=1;
        da['bez:'+norm(a.bez)]=1;
      });});
      var dirty={}, neuKat=0, zu=0;
      function ziel(){
        var last=teile[teile.length-1];
        if(last&&(last.artikel||[]).length<KAT_MAX_ARTIKEL)return last;
        var k={id:uid('kat'), orgId:orgId, name:teile.length?(name+' ('+(teile.length+1)+')'):name,
               importBasisName:name, artikel:[],
               erstelltVon:{userId:u?u.id:'',name:u?u.name:''}, erstelltAm:jetzt()};
        teile.push(k);neuKat++;dirty[k.id]=1;
        return k;
      }
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
        var k=ziel();
        (k.artikel=k.artikel||[]).push(a);dirty[k.id]=1;
        if(ek)da[ek]=1;
        da['bez:'+norm(z.bez)]=1;
        zu++;
      });
      report.artikel=(report.artikel||0)+zu;
      report.neu+=zu;
      if(neuKat)report.kataloge=(report.kataloge||0)+neuKat;
      var k2=Promise.resolve();
      teile.forEach(function(k){
        if(!dirty[k.id])return;
        k.updatedAt=jetzt();
        k2=k2.then(function(){return poolSichern(KAT_POOL,KAT_PREFIX,k);});
      });
      return k2;
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
  // Führt die Firma noch keine eigene Liste, gelten in pm_erp die Vorgaben
  // (netto30 …). Die importierten Konditionen kommen DAZU — sonst wären die
  // Vorgaben nach dem Import weg, und jeder Beleg mit «netto30» zeigte ⚠.
  if(!liste.length&&typeof window!=='undefined'&&Array.isArray(window.ERP_ZAHLBED_DEFAULT)){
    try{liste=JSON.parse(JSON.stringify(window.ERP_ZAHLBED_DEFAULT));}catch(e){liste=[];}
  }
  var da={};
  liste.forEach(function(z){da[norm(z.id)]=1;da['l:'+norm(z.label)]=1;});
  var zu=0;
  zeilen.forEach(function(zl){
    var z=zl.ziel;
    var kuerzel=s(z.kuerzel);
    var id='alt_'+norm(kuerzel);
    if(da[norm(id)]||da['l:'+norm(z.label)]){report.uebersprungen++;return;}
    // Ohne Frist bleibt `tage` leer — dann gilt für die Belege der
    // Firmen-Standard, wie es die Vorschau ankündigt. Eine erfundene 30
    // wäre ein Normwert ohne Beleg.
    var rec={id:id, label:s(z.label), tage:z.tage!=null?z.tage:null, importKuerzel:kuerzel};
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

/* ── Mitarbeitende → GEMA-Benutzer + Stammdaten der Stundenerfassung ─────
   Vorbild ist GemaAuth.inviteBeteiligter: ein Benutzer OHNE Passwort
   (password:null) mit Einladungs-Token; das Passwort setzt die Person über
   sys_login.html?invite=<token> selbst, serverseitig (actionActivate). Es
   wird nie ein Passwort erfunden und nie role_admin vergeben.

   Benutzer werden über die Alt-ID, die E-Mail oder Vorname+Name der eigenen
   Firma wiedererkannt; Bestehendes wird nur ergänzt, nie überschrieben.
   Ausgetretene entstehen INAKTIV — findeSachbearbeiter findet auch sie, damit
   die Historie ihrer Stunden und Termine eine Person hat.

   Das Pensum entsteht aus dem Wochensoll des Altsystems gegen das
   Firmen-Wochensoll INKLUSIVE Vorholzeit: das Altsystem kannte keine
   Vorholzeit, sein Tagessoll ist die volle vertragliche Zeit (8.25 h bei
   40 h + 1.25 h Vorholzeit). Ohne gesetztes Firmen-Wochensoll wird nichts
   geraten — der Rohwert bleibt als Vermerk und die Zeile wird gemeldet. */
function pensumAusWochenSoll(wochenSoll){
  if(wochenSoll==null)return {pensum:null,basis:null,grund:''};
  var st={};try{st=((GemaAuth.getCurrentOrg()||{}).settings||{}).stunden||{};}catch(e){}
  var ws=parseFloat(st.wochenSoll),vh=parseFloat(st.vorholProWocheH)||0;
  if(!(ws>0))return {pensum:null,basis:null,grund:'Das Firmen-Wochensoll ist in der Stundenerfassung nicht gesetzt.'};
  var basis=Math.round((ws+vh)*100)/100;
  var p=Math.round(wochenSoll/basis*100);
  if(!(p>0&&p<=200))return {pensum:null,basis:basis,grund:'Daraus ergäben sich '+p+' % — das ist keine plausible Anstellung (Einheit des Wochensolls prüfen).'};
  return {pensum:p,basis:basis,grund:''};
}
function mitarbeiterSchluessel(z,bekannt){
  if(s(z.extId)&&bekannt['m:ext:'+norm(z.extId)])return bekannt['m:ext:'+norm(z.extId)];
  if(z.email&&bekannt['m:mail:'+z.email])return bekannt['m:mail:'+z.email];
  if(s(z.voller)&&bekannt['m:name:'+norm(z.voller)])return bekannt['m:name:'+norm(z.voller)];
  return null;
}
function mitarbeiterSchreiben(zeilen,report,opts){
  opts=opts||{};
  var u=null,org=null;
  try{u=GemaAuth.getCurrentUser();org=GemaAuth.getCurrentOrg();}catch(e){}
  if(!u||!org||!org.id)return Promise.reject(new Error('Keine Firma im Kontext — Mitarbeitende brauchen eine Firma.'));
  var orgId=u.orgId;
  var users=(GemaAuth.getUsers()||[]).slice();
  var bekannt={};
  users.forEach(function(x){
    if(!x)return;
    var ex=s(x.quelle&&x.quelle.extId);
    if(ex&&x.quelle.system==='ERP-Migration')bekannt['m:ext:'+norm(ex)]=x;
    var em=s(x.username||(x.profile&&x.profile.email)).toLowerCase();
    if(em&&em.indexOf('@')>0)bekannt['m:mail:'+em]=x;
    if(x.orgId===orgId&&s(x.name))bekannt['m:name:'+norm(x.name)]=x;
  });
  var st=Object.assign({},(org.settings||{}).stunden||{});
  var mit=Object.assign({},st.mitarbeiter||{});
  var geaendert=false,stammGeaendert=false,rollen={},links=[],neue=[];
  zeilen.forEach(function(zl){
    var z=zl.ziel;
    if(!s(z.voller))return;
    var user=mitarbeiterSchluessel(z,bekannt);
    if(!user){
      var token='inv_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
      // Ausgetretene bekommen KEINE Einladung: der Server lehnt die
      // Aktivierung eines inaktiven Benutzers ohnehin ab, und ein Link, der
      // «ungültig» meldet, verwirrt nur. Tritt jemand wieder ein, lädt die
      // Verwaltung ein.
      var einladbar=!!(z.email&&z.aktiv);
      user={
        id:'u_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),
        username:z.email||('imp_'+norm(z.voller)+'_'+Math.random().toString(36).slice(2,6)),
        name:z.voller, password:null, roleIds:[z.rolle], active:!!z.aktiv, orgId:orgId,
        createdAt:jetzt(),
        profile:{email:z.email||'',telefon:s(z.tel)||s(z.natel),sprache:'de',benachrichtigungen:true,einheiten:'metrisch'},
        einladung:einladbar?{token:token,eingeladenVon:u.id,eingeladenAm:jetzt(),angenommenAm:null,passwortGesetzt:false}:null,
        quelle:{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:s(z.extId)}
      };
      users.push(user);neue.push(user);
      bekannt['m:name:'+norm(z.voller)]=user;if(z.email)bekannt['m:mail:'+z.email]=user;
      if(s(z.extId))bekannt['m:ext:'+norm(z.extId)]=user;
      geaendert=true;report.neu++;
      if(einladbar)links.push({name:z.voller,email:z.email,link:'sys_login.html?invite='+token});
      else if(!z.aktiv)report.inaktiv=(report.inaktiv||0)+1;
      else report.ohneEmail=(report.ohneEmail||0)+1;
    }else{
      // Nur Lücken füllen — Rolle, Aktiv-Status und Name eines bestehenden
      // Benutzers sind Sache der Verwaltung, nicht des Imports.
      var vorher=JSON.stringify(user);
      if(!user.profile)user.profile={};
      if(!s(user.profile.email)&&z.email)user.profile.email=z.email;
      if(!s(user.profile.telefon)&&(s(z.tel)||s(z.natel)))user.profile.telefon=s(z.tel)||s(z.natel);
      if(!user.quelle&&s(z.extId))user.quelle={typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:s(z.extId)};
      if(JSON.stringify(user)!==vorher){geaendert=true;report.aktualisiert++;}
      else report.uebersprungen++;
    }
    rollen[z.rolle]=(rollen[z.rolle]||0)+1;
    // Stammdaten der Stundenerfassung — ebenfalls nur Lücken füllen.
    var m=Object.assign({},mit[user.id]||{}),mv=JSON.stringify(m);
    if(s(z.eintritt)&&!s(m.eintritt))m.eintritt=s(z.eintritt);
    if(s(z.austritt)&&!s(m.austritt))m.austritt=s(z.austritt);
    if(z.ferienTage!=null&&m.ferienTage==null)m.ferienTage=z.ferienTage;
    if(z.wochenSoll!=null&&m.importWochenSoll==null)m.importWochenSoll=z.wochenSoll;
    if(z.pensum&&z.pensum.pensum!=null&&m.pensum==null)m.pensum=z.pensum.pensum;
    if(z.wochenSoll!=null&&!(z.pensum&&z.pensum.pensum!=null))report.pensumOffen=(report.pensumOffen||0)+1;
    if(z.ansatz!=null&&m.importAnsatz==null)m.importAnsatz=z.ansatz;
    if(s(z.kuerzel)&&!s(m.kuerzel))m.kuerzel=s(z.kuerzel);
    if(JSON.stringify(m)!==mv){mit[user.id]=m;stammGeaendert=true;}
    if(s(z.abteilung))findeBereich(z.abteilung);
  });
  report.rollen=rollen;report.einladungen=links;
  /* Die Auth-Function nimmt höchstens 200 Records je Anfrage an. saveUsers
     difft gegen den Cache und schickt nur Neues/Geändertes — also in
     Tranchen: erst die Bestehenden plus die ersten MIT_TRANCHE neuen, dann
     plus die nächsten … Jede Tranche muss durch sein, bevor die nächste
     geht (der Server sähe sonst 220 neue auf einmal und lehnte alles ab). */
  var MIT_TRANCHE=120;
  var neuRang={};neue.forEach(function(x,i){neuRang[x.id]=i;});
  var schritte=Math.max(1,Math.ceil(neue.length/MIT_TRANCHE));
  var p=Promise.resolve({ok:true});
  if(geaendert){
    for(var k=0;k<schritte;k++){
      (function(kk){
        p=p.then(function(res){
          if(res&&res.ok===false)return res;
          var grenze=(kk+1)*MIT_TRANCHE;
          var liste=users.filter(function(x){return neuRang[x.id]==null||neuRang[x.id]<grenze;});
          return Promise.resolve(GemaAuth.saveUsers(liste));
        });
      })(k);
    }
  }
  return p.then(function(res){
    if(res&&res.ok===false){
      report.fehler.push({zeile:0,text:'Benutzer speichern: '+(res.error||'abgelehnt')+(res.denied?' (keine Berechtigung — nur ein Firmen-Admin darf Benutzer anlegen)':'')});
      return;
    }
    if(!stammGeaendert)return;
    st.mitarbeiter=mit;
    return Promise.resolve(GemaAuth.updateOrgSettings(org.id,{stunden:st}));
  });
}

/* ── Ferien-/Überzeitüberträge → std: mit typ:'uebertrag' ───────────────
   Sie liegen im Stunden-Pool, aber ausserhalb der Tagesrapporte: pm_stunden
   trennt beides über `t.typ` (wie schon bei den Auszahlungen). Ein Übertrag
   ist ein SALDO auf einen Stichtag, kein Zuwachs — mehrere Zeilen je Person
   sind deshalb Geschichte, nicht Summanden. */
function uebertragSchluessel(datum,userName,extId){
  var e=s(extId);
  if(e)return 'ub:'+norm(e);
  return 'ub:x:'+norm([datum,userName].join('|'));
}
function uebertragSchreiben(z,report,opts){
  opts=opts||{};
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var orgId=u?u.orgId:'';
  var mit=s(z.mitarbeiter)?findeSachbearbeiter(z.mitarbeiter):null;
  // findeSachbearbeiter liefert bei unbekanntem Namen {userId:''}, nie null —
  // geprüft wird darum die userId. Ohne sie fände pm_stunden den Übertrag
  // nie, und das Guthaben verschwände stillschweigend.
  if(!mit||!s(mit.userId))report.personFehlt=(report.personFehlt||0)+1;
  var name=mit?mit.name:s(z.mitarbeiter);
  var key=uebertragSchluessel(z.datum,name,z.extId);
  var ubKey=function(t){return t.typ==='uebertrag'?uebertragSchluessel(t.datum,t.userName,t.extId||(t.quelle&&t.quelle.extId)):'';};
  var LX=laufIndex(ST_POOL,'uebertrag',[ubKey]);
  var alt=LX?(LX.map[key]||null):(poolEigene(ST_POOL).find(function(t){return ubKey(t)===key;})||null);
  var rec=alt?JSON.parse(JSON.stringify(alt)):{
    id:uid('std'), orgId:orgId, typ:'uebertrag',
    userId:mit?mit.userId:'', userName:name, datum:s(z.datum),
    erstelltAm:jetzt()
  };
  if(!s(rec.userId)&&mit&&s(mit.userId))rec.userId=mit.userId;
  if(!s(rec.extId))rec.extId=s(z.extId);
  // Zahlen werden gesetzt, wenn sie im Import stehen — auch die 0, denn ein
  // Saldo von null ist eine Aussage. Nur `null` (leere Zelle) lässt den
  // bestehenden Wert stehen.
  [['ueberzeitH',z.ueberzeitH],['ferienH',z.ferienH],
   ['ausbezahltH',z.ausbezahltH],['zuschlagH',z.zuschlagH]].forEach(function(pp){
    if(pp[1]!=null&&rec[pp[0]]==null)rec[pp[0]]=pp[1];
  });
  if(s(z.bemerkung)&&!s(rec.bemerkung))rec.bemerkung=s(z.bemerkung);
  rec.quelle=rec.quelle||{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:s(z.extId)};
  rec.updatedAt=jetzt();
  return poolSichern(ST_POOL,ST_PREFIX,rec,ST_MODULE).then(function(){
    if(alt)report.aktualisiert++;else report.neu++;
    if(rec.ferienH!=null)report.ferienUebertraege=(report.ferienUebertraege||0)+1;
  });
}

/* ── Termine → einsatz: (pm_einsatzplan) ──────────────────────────────── */
function terminSchluessel(datum,monteurName,titel,extId){
  var e=s(extId);
  if(e)return 'ext:'+norm(e);
  return 'x:'+norm([datum,monteurName,titel].join('|'));
}
function terminSchreiben(z,report,opts){
  opts=opts||{};
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var orgId=u?u.orgId:'';
  var mont=s(z.monteur)?findeSachbearbeiter(z.monteur):null;
  // Ein Monteur ohne GEMA-Benutzer landet auf keiner Zeile der Plantafel —
  // das wird gezählt und gemeldet, nicht stillschweigend hingenommen.
  if(s(z.monteur)&&(!mont||!s(mont.userId)))report.monteurFehlt=(report.monteurFehlt||0)+1;
  var montName=mont?mont.name:s(z.monteur);
  var key=terminSchluessel(z.datum,montName,z.titel,z.extId);
  var evKey=function(e){return terminSchluessel(e.datum,e.monteurName,e.titel,e.extId||(e.quelle&&e.quelle.extId));};
  var LX=laufIndex(EP_POOL,'termin',[evKey]);
  var alt=LX?(LX.map[key]||null):(poolEigene(EP_POOL).find(function(e){return evKey(e)===key;})||null);
  var auf=null;
  if(s(z.auftragNr)){
    var an=norm(z.auftragNr);
    auf=dokPool().find(function(d){
      return d.typ==='auftrag'&&norm(d.nr)===an&&(!orgId||d.orgId===orgId);
    })||null;
    if(!auf)report.auftragFehlt=(report.auftragFehlt||0)+1;
  }
  var ev=alt?JSON.parse(JSON.stringify(alt)):{
    id:uid('ev'), orgId:orgId, typ:z.typ, titel:'', monteurUserId:'', monteurName:'',
    datum:'', dauerTage:1, slot:'ganz', zeitVon:'', zeitBis:'',
    auftragId:'', auftragNr:'', kunde:'', objektId:'', objektName:'', notiz:'',
    bereichId:'', garantie:false, besonderheiten:[],
    erstelltVon:{userId:u?u.id:'',name:u?u.name:''}, erstelltAm:jetzt()
  };
  function fuelle(f,v){if(s(v)&&!s(ev[f]))ev[f]=s(v);}
  fuelle('datum',z.datum); fuelle('titel',z.titel);
  fuelle('zeitVon',z.zeitVon); fuelle('zeitBis',z.zeitBis); fuelle('notiz',z.notiz);
  if(s(z.zeitRoh))report.zeitUnklar=(report.zeitUnklar||0)+1;
  if(!s(ev.extId))ev.extId=s(z.extId);
  if(!alt)ev.typ=z.typ;
  if(mont){
    if(!s(ev.monteurUserId)&&s(mont.userId))ev.monteurUserId=mont.userId;
    if(!s(ev.monteurName))ev.monteurName=mont.name;
  }
  if(auf&&!s(ev.auftragId)){
    ev.auftragId=auf.id; ev.auftragNr=s(auf.nr);
    if(!s(ev.objektId)&&s(auf.objektId)){ev.objektId=auf.objektId;ev.objektName=s(auf.objektName);}
    if(!s(ev.kunde)&&auf.kundeSnapshot)ev.kunde=s(auf.kundeSnapshot.firma);
  }else if(s(z.auftragNr)&&!s(ev.auftragNr))ev.auftragNr=s(z.auftragNr);
  [['importArbtyp',z.arbtyp],['importAbsenz',z.absenz],['importAbsenzTyp',z.absenzTyp],
   ['importStandort',z.standort],['importSerie',z.serie],
   ['importZeitRoh',z.zeitRoh]].forEach(function(pp){
    if(s(pp[1])&&!s(ev[pp[0]]))ev[pp[0]]=s(pp[1]);
  });
  if(ev.importStunden==null&&z.stunden!=null)ev.importStunden=z.stunden;
  ev.quelle=ev.quelle||{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:s(z.extId)};
  ev.updatedAt=jetzt();
  return poolSichern(EP_POOL,EP_PREFIX,ev,EP_MODULE).then(function(){
    if(alt)report.aktualisiert++;else report.neu++;
    // Termine in der Zukunft eigens zählen — sie sind die geplante Arbeit,
    // nicht bloss Dokumentation.
    if(s(ev.datum)&&ev.datum>=jetzt().slice(0,10))report.terminZukunft=(report.terminZukunft||0)+1;
  });
}

/* ── Anlagen → svanl: (sv_service) ────────────────────────────────────── */
function anlageSchreiben(z,report,opts){
  opts=opts||{};
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var orgId=u?u.orgId:'';
  var key=s(z.extId)?('ext:'+norm(z.extId)):('x:'+norm([z.name,z.serienNr,z.objekt&&z.objekt.strasse].join('|')));
  var alt=poolEigene(ANL_POOL).find(function(a){
    var e=s(a.extId||(a.quelle&&a.quelle.extId));
    return (e?('ext:'+norm(e)):('x:'+norm([a.name,a.serienNr,a.objektName].join('|'))))===key;
  })||null;
  return objektFuerBeleg(z.objekt,null,null,orgId,report,opts).then(function(obj){
    var bereichId=findeBereich(z.abteilung);
    var a=alt?JSON.parse(JSON.stringify(alt)):{
      id:uid('anl'), orgId:orgId, name:'', kategorie:'', standort:'',
      hersteller:'', modell:'', serienNr:'', lieferantFirma:'', produktId:'',
      objektId:'', objektName:'', inbetriebnahme:'', garantieBis:'',
      intervallMonate:'', letzteWartung:'', notizen:'',
      schluessel:{code:'',info:''}, bereichId:'', status:'aktiv',
      erstelltVon:{userId:u?u.id:'',name:u?u.name:''}, erstelltAm:jetzt()
    };
    function fuelle(f,v){if(s(v)&&!s(a[f]))a[f]=s(v);}
    fuelle('name',z.name); fuelle('kategorie',z.kategorie); fuelle('standort',z.standort);
    fuelle('hersteller',z.hersteller); fuelle('modell',z.modell); fuelle('serienNr',z.serienNr);
    fuelle('inbetriebnahme',z.inbetrieb); fuelle('letzteWartung',z.letzteWartung);
    fuelle('notizen',z.notiz);
    if(!s(a.extId))a.extId=s(z.extId);
    if(!s(a.bereichId)&&bereichId)a.bereichId=bereichId;
    if(obj&&!s(a.objektId)){a.objektId=obj.id;a.objektName=s(obj.name);}
    if(!s(a.intervallMonate)&&z.intervall!=null)a.intervallMonate=String(z.intervall);
    if(s(z.vertragsNr)&&!s(a.importVertragsNr))a.importVertragsNr=s(z.vertragsNr);
    if(s(z.ordner)&&!s(a.importOrdner))a.importOrdner=s(z.ordner);
    if(!s(a.garantieBis)&&s(a.inbetriebnahme)&&z.garantie)
      a.garantieBis=addMonate(a.inbetriebnahme,z.garantie);
    [['importToleranzMonate',z.toleranz],['importRevKosten',z.revKosten]].forEach(function(pp){
      if(pp[1]!=null&&a[pp[0]]==null)a[pp[0]]=pp[1];
    });
    /* GEMA rechnet die nächste Revision aus letzter Wartung + Intervall. Am
       Altbestand ist genau das bestätigt: 410 von 410 Geräten stimmen exakt.
       Die Angabe des Altsystems wird deshalb NICHT als Feld gesetzt, sondern
       als Vermerk behalten — die Rechnung gehört GEMA. */
    if(s(z.naechsteWartung)&&!s(a.importNaechsteRevision))
      a.importNaechsteRevision=s(z.naechsteWartung);
    if(z.revBasisModus){
      /* Der zweite Modus des Altsystems ankert den Termin an einem festen
         Datum, statt ihn mit der Ausführung mitwandern zu lassen. GEMA kennt
         ihn nicht — für diese Anlagen wäre die gerechnete Revision falsch.
         Sie werden GEMELDET und tragen den Alt-Termin sichtbar am Datensatz,
         statt still ein falsches Datum zu bekommen. Betrifft 2 von 421. */
      if(!s(a.importRevBasis))a.importRevBasis=s(z.revBasis);
      a.importRevBasisModus=true;
      report.revisionBasisModus=(report.revisionBasisModus||0)+1;
    }else if(s(z.naechsteWartung)&&s(a.letzteWartung)&&z.intervall){
      // Gegenprobe mit derselben Monatsarithmetik wie das Altsystem.
      if(addMonate(a.letzteWartung,z.intervall)!==s(z.naechsteWartung))
        report.revisionAbweichung=(report.revisionAbweichung||0)+1;
    }
    /* Anlagen, deren Wartung längst überfällig ist, kommen als INAKTIV herein.
       sv_service legt beim Öffnen für JEDE aktive Anlage mit fälliger Wartung
       automatisch einen Serviceauftrag an — ohne diese Regel entstünden am
       ersten Tag rund 180 Aufträge für Anlagen, die im Altsystem niemand mehr
       verfolgt hat. Der Grund steht am Datensatz, Reaktivieren ist ein Klick,
       und die Fälligkeitsrechnung selbst bleibt unangetastet.
       Dieselbe Basis wie svNextWartung: letzte Wartung, sonst Inbetriebnahme.
       Ohne Intervall gibt es keinen Termin — solche Anlagen bleiben aktiv. */
    if(!alt&&opts.anlagenAltInaktiv!==false){
      var basis=s(a.letzteWartung)||s(a.inbetriebnahme);
      var ivM=parseInt(a.intervallMonate,10)||0;
      var faellig=(basis&&ivM>0)?addMonate(basis,ivM):'';
      if(faellig&&faellig<jetzt().slice(0,10)){
        a.status='inaktiv';
        a.importInaktivGrund='Beim Import als inaktiv übernommen: die nächste Revision wäre am '+faellig
          +' fällig gewesen (letzte '+(s(a.letzteWartung)||'unbekannt')+'). Reaktivieren, sobald die Anlage wieder gewartet wird.';
        report.anlagenInaktiv=(report.anlagenInaktiv||0)+1;
      }
    }
    a.quelle=a.quelle||{typ:'import',system:opts.quelleName||'ERP-Migration',am:jetzt(),extId:s(z.extId)};
    a.updatedAt=jetzt();
    return poolSichern(ANL_POOL,ANL_PREFIX,a,SV_MODULE).then(function(){
      if(alt)report.aktualisiert++;else report.neu++;
      if(s(z.naechsteWartung)&&z.naechsteWartung>=jetzt().slice(0,10))
        report.revisionKuenftig=(report.revisionKuenftig||0)+1;
    });
  });
}

/* Schlüssel eines Zeiteintrags innerhalb eines Tages.

   KRITISCH — die Tätigkeit gehört NICHT hinein. Die beiden Erfassungsstufen
   des Altsystems beschriften dieselbe Arbeit verschieden (Stundenmodul:
   `arbtyp.beschr`, Handy: `hrs_description`); stünde sie im Schlüssel, träfe
   die Freigabe die mobile Zeile nie, beide lägen nebeneinander am Tag (16 h
   statt 8), und ein zweiter Lauf verdoppelte alles. Das Korn ist darum die
   Auftragsnummer; ohne Auftrag ersatzweise die Tätigkeit. Der Schlüssel wird
   am Eintrag gespeichert (`importKey`), damit der Wiederholungs-Import ihn
   exakt wiederfindet — auch wenn die Tätigkeit später ergänzt wurde. */
function eintragKey(auftragNr,taetigkeit){
  var a=norm(auftragNr);
  return a?('a:'+a):('t:'+norm(taetigkeit));
}

/* ── Stunden → std: (pm_stunden), gruppiert je Mitarbeiter und Tag ─────── */
function stundenSchreiben(zeilen,report,opts){
  opts=opts||{};
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var orgId=u?u.orgId:'';
  var grp=[],byKey={};
  zeilen.forEach(function(zl){
    var z=zl.ziel;
    var p=findeSachbearbeiter(z.mitarbeiter);
    var k=norm((p&&p.userId)||z.mitarbeiter)+'|'+s(z.datum);
    var g=byKey[k];
    if(!g){g=byKey[k]={person:p,datum:s(z.datum),zl:[]};grp.push(g);}
    g.zl.push(z);
  });
  var kette=Promise.resolve();
  grp.forEach(function(g,gi){
    kette=kette.then(function(){return laufAtem(gi,grp.length,opts);}).then(function(){
      var uid2=(g.person&&g.person.userId)||'';
      var name=(g.person&&g.person.name)||'';
      // `!t.typ` ist Pflicht: im selben Pool liegen auch Auszahlungen und
      // Ferien-/Überzeitüberträge. Ohne den Filter machte ein Übertrag vom
      // 01.01. aus dem Tagesrapport desselben Tages einen Mischling.
      var tagKeyU=function(t){return (!t.typ&&s(t.userId))?('u:'+t.userId+'|'+s(t.datum)):'';};
      var tagKeyN=function(t){return !t.typ?('n:'+norm(t.userName)+'|'+s(t.datum)):'';};
      var TX=laufIndex(ST_POOL,'tag',[tagKeyU,tagKeyN]);
      var suchKey=uid2?('u:'+uid2+'|'+g.datum):('n:'+norm(name)+'|'+g.datum);
      var alt=TX?(TX.map[suchKey]||null):(poolEigene(ST_POOL).find(function(t){
        return !t.typ&&s(t.datum)===g.datum&&(uid2?t.userId===uid2:norm(t.userName)===norm(name));
      })||null);
      var t=alt?JSON.parse(JSON.stringify(alt)):{
        id:uid('std'), orgId:orgId, userId:uid2, userName:name, datum:g.datum,
        eintraege:[], spesen:{}, status:'offen', erstelltAm:jetzt()
      };
      var ein=(t.eintraege||[]).slice();
      var da={};
      ein.forEach(function(e){da[e.importKey||eintragKey(e.importAuftragNr,e.taetigkeit)]=e;});
      // Alles, was den Tag verändert, setzt dieses Flag — gespeichert wird
      // am Ende genau dann. Ein Zähler «neu» reichte nicht: eine Korrektur an
      // einem bestehenden Eintrag ist kein neuer Eintrag und ging verloren.
      var geaendert=false;
      /* Stufe 3 des Altsystems (Stundenmodul, «freigegeben») IST die Freigabe —
         der Tag kommt als «genehmigt» an. Als «offen» stünde die ganze
         Historie zum Einreichen bereit, und eine Freigabe hängte jedem
         importierten Termin des Tages die Planzeit noch einmal an (doppelt
         gezählt). Nur mobil erfasste Tage (Stufe 2) bleiben «offen». Ein von
         Hand geführter Tag behält seinen Status. */
      var freigegeben=g.zl.some(function(z){return z.quelle==='freigegeben';});
      if(freigegeben&&t.status!=='genehmigt'&&(!alt||t.importiert)){t.status='genehmigt';geaendert=true;}
      /* Erkannte Absenz → GEMA-Absenz am TAG (dort führt sie pm_stunden), nicht
         als Arbeitseintrag. Ohne das zählte ein Ferientag als geleistete Zeit
         und gleichzeitig als null bezogene Ferien — der Feriensaldo wäre zu
         hoch und die Ist-Zeit auch. Bestehendes wird nie überschrieben: hat der
         Tag schon eine Absenz, gewinnt sie.
         Unbekannte Arten bekommen KEINEN erfundenen Typ (siehe absenzArt). */
      if(!t.absenz){
        var absZ=g.zl.filter(function(z){return s(z.absenzTyp);});
        if(absZ.length){
          var absH=0;absZ.forEach(function(z){absH+=parseFloat(z.stunden)||0;});
          t.absenz={typ:s(absZ[0].absenzTyp)};
          // Die Dauer der Absenz-Zeile wird zum Stundenwert der Absenz:
          // pm_stunden rechnet damit die Soll-Gutschrift exakt (stdTagAbzugH,
          // gekappt auf das Tagessoll) — ein halber Ferientag kürzt das Soll
          // um vier Stunden, nicht um acht.
          if(absH>0)t.absenz.stunden=Math.round(absH*100)/100;
          if(s(absZ[0].absenz))t.importAbsenz=s(absZ[0].absenz);
          report.absenzen=(report.absenzen||0)+1;
          geaendert=true;
        }
      }
      // Termin-Bezug: der auf dem Handy erfasste Eintrag nennt den Termin,
      // aus dem er entstanden ist. Ist der Termin importiert, bleibt die
      // Kette Disposition → Zeit auch in GEMA erhalten.
      var evIx={};
      if(g.zl.some(function(z){return s(z.terminId);})){
        var extKey=function(ev){var e2=s(ev.extId||(ev.quelle&&ev.quelle.extId));return e2?norm(e2):'';};
        var EX=laufIndex(EP_POOL,'ext',[extKey]);
        if(EX)evIx=EX.map;
        else poolEigene(EP_POOL).forEach(function(ev){var k=extKey(ev);if(k)evIx[k]=ev;});
      }
      var neu=0,spesenSum=0;
      g.zl.forEach(function(z){
        var min=Math.round((z.stunden||0)*60);
        if(!min)return;
        if(z.spesen)spesenSum+=z.spesen;
        // Der Betrag gehört auch AN DEN EINTRAG: nur so lässt er sich später
        // je Auftrag auswerten (die Tagessumme allein kann das nicht).
        /* KRITISCH — eine erkannte Absenz ist am TAG abgelegt (oben) und wird
           hier NICHT noch einmal zum Arbeitseintrag. Sonst zählte der Ferientag
           als geleistete Zeit UND senkte das Soll: +8 h Überstunden je Tag. */
        if(s(z.absenzTyp))return;
        var k2=eintragKey(z.auftragNr,z.taetigkeit);
        var rang=STUNDEN_RANG[z.quelle]||2;
        var vor=da[k2];
        if(vor){
          var rangVor=STUNDEN_RANG[vor.importQuelle]||2;
          var minVor=parseInt(vor.dauerMin,10)||0;
          if(rang>rangVor){
            /* Der freigegebene Wert korrigiert den mobil erfassten — das ist
               genau der Zweck des Stundenmoduls, kein Widerspruch. Der alte
               Wert bleibt als Vermerk sichtbar. */
            if(minVor!==min){
              vor.importErfasst=minVor;
              report.stundenKorrigiert=(report.stundenKorrigiert||0)+1;
            }
            if(vor.dauerMin!==min||vor.importQuelle!==z.quelle)geaendert=true;
            vor.dauerMin=min; vor.importQuelle=z.quelle;
          }else if(rang===rangVor&&minVor!==min&&!vor.importKonflikt){
            // Gleiche Stufe, verschiedene Dauer: hier gibt es keine Regel,
            // welcher Wert gilt. Melden statt raten.
            vor.importKonflikt={andereQuelle:min,uebernommen:minVor};
            report.stundenKonflikt=(report.stundenKonflikt||0)+1;
            geaendert=true;
          }
          // Was die andere Stufe zusätzlich weiss, wird ergänzt.
          if(z.spesen&&vor.importSpesen==null){vor.importSpesen=z.spesen;geaendert=true;}
          if(s(z.bemerkung)&&!s(vor.bemerkung)){vor.bemerkung=s(z.bemerkung);geaendert=true;}
          if(s(z.terminId)){
            var evV=evIx[norm(z.terminId)];
            if(evV){
              if(!s(vor.einsatzId)){vor.einsatzId=evV.id;geaendert=true;}
              report.terminVerknuepft=(report.terminVerknuepft||0)+1;
            }else{
              report.terminFehlt=(report.terminFehlt||0)+1;
              if(!s(vor.importTerminId)){vor.importTerminId=s(z.terminId);geaendert=true;}
            }
          }
          if(!vor.importKey){vor.importKey=k2;geaendert=true;}
          return;
        }
        var e={
          id:uid('e'), von:'', bis:'', pauseMin:0, dauerMin:min,
          objektId:'', objektName:'', taetigkeit:s(z.taetigkeit)||s(z.auftragNr)||'Übernahme Altsystem',
          einsatzId:'', ausPlan:false, importAuftragNr:s(z.auftragNr), importQuelle:z.quelle,
          importKey:k2
        };
        // Arbeitskategorien des Altsystems («Werkstatt», «Büro») bleiben als
        // Vermerk am Eintrag — sie sind Arbeit, keine Absenz.
        if(s(z.absenz))e.importAbsenz=s(z.absenz);
        if(z.spesen)e.importSpesen=z.spesen;
        if(s(z.bemerkung))e.bemerkung=s(z.bemerkung);
        /* Termin-Bezug: `norm()` vergleicht die GUID ohne Gross-/Kleinschreibung,
           Bindestriche und Klammern — das Format des Exports spielt keine Rolle.
           Was nicht trifft (Termin nicht importiert oder im Altsystem gelöscht),
           wird GEZÄHLT und bleibt als Vermerk am Eintrag; ein späterer Lauf
           nach dem Termin-Import füllt die Lücke (siehe oben, `vor`-Pfad). */
        if(s(z.terminId)){
          var evN=evIx[norm(z.terminId)];
          if(evN){e.einsatzId=evN.id;e.ausPlan=true;report.terminVerknuepft=(report.terminVerknuepft||0)+1;}
          else{e.importTerminId=s(z.terminId);report.terminFehlt=(report.terminFehlt||0)+1;}
        }
        ein.push(e); da[k2]=e; neu++; geaendert=true;
      });
      /* Spesen: GEMA führt am Tag «Mittag auswärts» und «km». Der Betrag aus
         der App passt in keins von beiden — er wird daneben vermerkt, statt
         eine Mittagspauschale oder eine Kilometerzahl zu erfinden. */
      if(spesenSum){
        t.spesen=Object.assign({},t.spesen||{});
        if(t.spesen.importBetrag==null){
          t.spesen.importBetrag=Math.round(spesenSum*100)/100;
          geaendert=true;
        }
      }
      // Bestehender Tag ohne jede Änderung → nichts speichern. Alles andere
      // (neuer Eintrag, Korrektur, Absenz, Spesen, Termin-Bezug) wird gesichert.
      if(alt&&!geaendert){report.uebersprungen++;return;}
      t.eintraege=ein;
      t.importiert=true;
      t.updatedAt=jetzt();
      report.stundenTage=(report.stundenTage||0)+1;
      report.stundenEintraege=(report.stundenEintraege||0)+neu;
      if(alt)report.aktualisiert++;else report.neu++;
      if(!uid2)report.personFehlt=(report.personFehlt||0)+1;
      return poolSichern(ST_POOL,ST_PREFIX,t,ST_MODULE);
    });
  });
  return kette;
}

/* ── Bezugspersonen → objekt.bezugspersonen[], gruppiert je Objekt ─────── */
function bezugspersonenSchreiben(zeilen,report,opts){
  opts=opts||{};
  var u=null;try{u=GemaAuth.getCurrentUser();}catch(e){}
  var orgId=u?u.orgId:'';
  var grp=[],byKey={};
  zeilen.forEach(function(zl){
    var z=zl.ziel;
    var k=s(z.objektNr)?('ext:'+norm(z.objektNr)):objektAdrKey(z.objekt);
    var g=byKey[k];
    if(!g){g=byKey[k]={key:k,objekt:z.objekt,extId:s(z.objektNr),pers:[]};grp.push(g);}
    g.pers.push(z);
  });
  var kette=Promise.resolve();
  grp.forEach(function(g,gi){
    kette=kette.then(function(){return laufAtem(gi,grp.length,opts);}).then(function(){
      var liste=bestehendeObjekte();
      var obj=g.extId
        // Beide Seiten über objektSchluessel — der schreibt die Alt-ID klein,
        // norm() striche zusätzlich Trennzeichen und träfe «OBJ-4984» nie.
        ? liste.find(function(o){return objektSchluessel(o)===objektSchluessel({extId:g.extId});})||null
        : findeObjekt(g.objekt,liste);
      if(!obj){report.objektFehlt=(report.objektFehlt||0)+1;return;}
      var o=Object.assign({},obj);
      var bp=(o.bezugspersonen||[]).slice();
      var neu=0;
      g.pers.forEach(function(z){
        var da=bp.find(function(x){
          return norm(x.name)===norm(z.name)&&norm(x.vorname)===norm(z.vorname||'');
        });
        var typId='';
        try{if(s(z.rolle)&&typeof GemaAdressen!=='undefined')typId=GemaAdressen.typIdFuerLabel(z.rolle,true)||'';}catch(e){}
        if(da){
          // Person schon da: nur Lücken füllen, Rolle ergänzen.
          if(typId&&(da.typen||[]).indexOf(typId)<0)da.typen=(da.typen||[]).concat([typId]);
          ['tel','natel','email','wohnung'].forEach(function(f){
            if(s(z[f])&&!s(da[f]))da[f]=s(z[f]);
          });
          return;
        }
        bp.push({
          id:uid('bp'), anrede:'', vorname:s(z.vorname), name:s(z.name),
          typen:typId?[typId]:[], tel:s(z.tel), natel:s(z.natel), email:s(z.email),
          wohnung:s(z.wohnung), bemerkung:s(z.bemerkung)
        });
        neu++;
      });
      o.bezugspersonen=bp;
      o.updatedAt=jetzt();
      report.personen=(report.personen||0)+neu;
      report.neu+=neu;
      return GemaObjekte.upsertObjekt(o);
    });
  });
  return kette;
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
  txt('importOrdner',z.ordner);
  txt('eBillId',z.eBillId);
  txt('rechnungEmail',z.rechnungEmail);
  zahl('stdRabattPct',z.stdRabatt);
  zahl('stdSkontoPct',z.stdSkonto);
  return ae;
}

function ausfuehren(plan,opts){
  opts=opts||{};
  // Ein zweiter Lauf, während der erste noch schreibt, teilte sich mit ihm
  // den Lauf-Speicher: laufStart() setzte ihn zurück, ungeflushte Blöcke
  // wären weg, beide schrieben in denselben Pool. Deshalb genau EIN Lauf.
  if(_laufAktiv)return Promise.reject(new Error('Ein Import läuft bereits — bitte warten, bis er abgeschlossen ist.'));
  var sekId=plan.sektion;
  var report={neu:0,aktualisiert:0,uebersprungen:0,adressen:0,fehler:[]};
  var zeilen=plan.zeilen.filter(function(z){return z.aktion!=='fehler'&&z.gewaehlt!==false;});
  report.uebersprungen=plan.zeilen.length-zeilen.length;
  zahlbedAusOrgLaden();
  absenzartenAusOrgLaden();
  laufStart();
  // Unbekannte Absenzarten VOR dem Schreiben anlegen — Stunden und Termine
  // brauchen den Typ am Datensatz.
  var vorlauf=(sekId==='stunden'||sekId==='termine')?absenzartenSicherstellen(zeilen,report):Promise.resolve();

  /* Abschnitte, die GRUPPIERT schreiben: viele Zeilen treffen dasselbe Ziel
     (alle Positionen eines Belegs, alle Konditionen der Firma). Sie laufen
     bewusst NICHT durch die Zeilenschleife — sonst würde derselbe Datensatz
     hundertfach hintereinander gespeichert. Sie brauchen auch den
     Adressstamm nicht, darum stehen sie vor dessen Prüfung. */
  function fertig(){return report;}
  function gescheitert(e){
    if(e&&e.abgebrochen){report.abgebrochen={zeile:e.zeile};return report;}
    report.fehler.push({zeile:0,text:(e&&e.message)||String(e)});return report;
  }
  // Am Ende JEDES Pfads: Lauf-Speicher schreiben — auch nach einem Fehler,
  // sonst bliebe, was bis dahin gelungen ist, nur im Arbeitsspeicher. Die
  // Cloud-Bilanz kommt in den Bericht: was nur in der Outbox liegt oder
  // scheiterte, gilt nicht als «fertig».
  function abschluss(r){return poolFlush().then(function(){r.cloud=laufBilanz();return r;},function(){r.cloud=laufBilanz();return r;});}
  if(sekId==='zahlbed')return zahlbedSchreiben(zeilen,report,opts).then(fertig,gescheitert).then(abschluss);
  if(sekId==='mitarbeiter')return mitarbeiterSchreiben(zeilen,report,opts).then(fertig,gescheitert).then(abschluss);
  if(sekId==='positionen')return positionenSchreiben(zeilen,report,opts).then(fertig,gescheitert).then(abschluss);
  if(sekId==='zahlungen')return zahlungenSchreiben(zeilen,report,opts).then(fertig,gescheitert).then(abschluss);
  if(sekId==='artikel')return artikelSchreiben(zeilen,report,opts).then(fertig,gescheitert).then(abschluss);
  if(sekId==='stunden')return vorlauf.then(function(){return stundenSchreiben(zeilen,report,opts);}).then(fertig,gescheitert).then(abschluss);
  if(sekId==='bezugspersonen')return bezugspersonenSchreiben(zeilen,report,opts).then(fertig,gescheitert).then(abschluss);

  if(typeof GemaAdressen==='undefined')return Promise.reject(new Error('Adressstamm nicht geladen.'));
  // Adressbestand EINMAL lesen und über den ganzen Lauf mitführen.
  var adrCtx={cache:{},bestand:GemaAdressen.list(),neu:0};

  var bestand={};
  bestehendeObjekte().forEach(function(o){bestand[objektSchluessel(o)]=o;});

  var kette=vorlauf;
  zeilen.forEach(function(z,idx){
    kette=kette.then(function(){return laufAtem(idx,zeilen.length,opts);}).then(function(){
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
      // .catch wie bei allen anderen Zeilen-Writern: eine werfende Offerte
      // riss sonst die Kette ab, der Rest der Datei blieb still liegen.
      if(sekId==='offerten')return offerteSchreiben(z.ziel,adrCtx,report,opts).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
      if(sekId==='auftraege')return auftragSchreiben(z.ziel,adrCtx,report,opts).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
      if(sekId==='rechnungen')return rechnungSchreiben(z.ziel,adrCtx,report,opts).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
      if(sekId==='kreditoren')return kreditorSchreiben(z.ziel,report,opts).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
      if(sekId==='termine')return terminSchreiben(z.ziel,report,opts).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
      if(sekId==='anlagen')return anlageSchreiben(z.ziel,report,opts).catch(function(e){
        report.fehler.push({zeile:z.nr,text:(e&&e.message)||String(e)});
      });
      if(sekId==='uebertraege')return uebertragSchreiben(z.ziel,report,opts).catch(function(e){
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
        fuelle('importObjekt1',z2.bez1);
        fuelle('importObjekt2',z2.bez2);
        fuelle('importOrdner',z2.ordner);
        if(z2.adrAusAltfeld&&!s(o.importAdresseHerkunft)){
          o.importAdresseHerkunft='Adresse aus «objekt1»/«objekt2» des Altsystems übernommen — das Objekt selbst führte keine Strasse.';
          report.adresseAusAltfeld=(report.adresseAusAltfeld||0)+1;
        }
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
  },function(e){
    report.adressen=adrCtx.neu;
    return gescheitert(e);
  }).then(abschluss);
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
  belegBrutto:belegBrutto, positionenNetto:positionenNetto, adressZusatz:adressZusatz,
  terminSchluessel:terminSchluessel, uebertragSchluessel:uebertragSchluessel,
  parseZeit:parseZeit, parseNachkalk:parseNachkalk, poolFlush:poolFlush,
  abbrechen:abbrechen, laeuft:laeuft, laufBilanz:laufBilanz, dokSuche:dokSuche,
  absenzArt:absenzArt, ABSENZ_MAP:ABSENZ_MAP,
  stundenQuelle:stundenQuelle, STUNDEN_RANG:STUNDEN_RANG, addMonate:addMonate,
  MODULE_BELEG:MODULE_BELEG, POSTYP_ART:POSTYP_ART,
  // Engine-Exports für Node-Tests
  serialZuDatum:serialZuDatum, istDatumFmt:istDatumFmt, entescape:entescape,
  spalteZuIndex:spalteZuIndex, norm:norm, pct:pct,
  zahlbedTageSetzen:zahlbedTageSetzen
};

})();
