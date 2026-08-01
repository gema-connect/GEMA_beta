/* ═══════════════════════════════════════════════════════════════════════
   GEMA — Adressstamm (window.GemaAdressen)

   EIN zentraler Adressstamm für die ganze Firma: Rechnungsempfänger im ERP,
   Zahlbar-durch/Korrespondenz/Eigentümer am Objekt, Bezugspersonen (Bewohner,
   Hauswart, Besteller …) und Verteiler für Serienmails/Einladungen.

   KRITISCH — derselbe Pool wie die bisherigen ERP-«Kunden»
   (gema_erp_kunden_pool_v1 / erpkunde:). Es gibt bewusst KEINE Migration und
   KEINEN zweiten Stamm: ein bestehender Kunde IST eine Adresse, alle neuen
   Felder sind rein additiv. Damit lesen ALLE bestehenden Konsumenten
   (kundeSnapshot, QR-Rechnung, PDF-Fensteradresse, Dropdowns) unverändert
   weiter — sie greifen auf firma/kontakt/strasse/plz/ort/email/tel zu.

   Deshalb gilt die Regel: `firma` ist IMMER gefüllt und ist der Anzeigename.
   Bei einer Privatperson wird sie aus «Name Vorname» zusammengesetzt
   (normalize()) — nie leer lassen, sonst erscheint die Adresse in den
   Alt-Konsumenten als «—».
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

var MODULE='erp';
var POOL='gema_erp_kunden_pool_v1';
var PREFIX='erpkunde:';

/* ═══ ENGINE-START ═══ DOM-frei, Node-testbar ═══ */

/* Kontakt-Typen — Standard 1:1 aus dem abzulösenden ERP (Screenshot 07/2026).
   Pro Firma in den ERP-Einstellungen umbenennbar/erweiterbar/löschbar
   (Muster Arbeitsbereiche). IDs bleiben beim Umbenennen stabil. */
var TYPEN_DEFAULT=[
  {id:'architekt',            label:'Architekt'},
  {id:'bauherr',              label:'Bauherr'},
  {id:'besteller',            label:'Besteller'},
  {id:'bewohner',             label:'Bewohner'},
  {id:'diverse',              label:'diverse'},
  {id:'eigentuemer',          label:'Eigentümer'},
  {id:'hauswart',             label:'Hauswart'},
  {id:'kontakt',              label:'Kontakt'},
  {id:'korrespondenzadresse', label:'Korrespondenzadresse'},
  {id:'kreditor',             label:'Kreditor'},
  {id:'kunden_fabrikation',   label:'Kunden Fabrikation'},
  {id:'kunden_sanitaer',      label:'Kunden Sanitär'},
  {id:'kunden_spengler',      label:'Kunden Spengler'},
  {id:'mieter',               label:'Mieter'},
  {id:'mitarbeiter',          label:'Mitarbeiter'},
  {id:'planer',               label:'Planer'},
  {id:'prog_boilerservice',   label:'Programm Boilerservice'},
  {id:'prog_dachkontrolle',   label:'Programm Dachkontrolle'},
  {id:'prog_filterservice',   label:'Programm Filterservice'},
  {id:'prog_rinnenreinigung', label:'Programm Rinnenreinigung'}
];

/* Die drei festen Adress-Slots eines Objekts (Muster altes ERP).
   Sie sind KEINE Kontakt-Typen — sie hängen direkt an der Rechnungslogik:
   «zahler» bestimmt den Rechnungsempfänger, «korrespondenz» die
   Fensteradresse (abweichende Zustelladresse). */
var SLOTS=[
  {id:'zahler',        label:'Zahlbar durch',      ic:'💰', hint:'Rechnungsempfänger & Zahler'},
  {id:'korrespondenz', label:'Korrespondenzadresse',ic:'✉️', hint:'Abweichende Zustelladresse (c/o)'},
  {id:'eigentuemer',   label:'Eigentümer',          ic:'🏠', hint:'Eigentümerschaft der Liegenschaft'}
];

function s(v){return v==null?'':String(v).trim();}
function slug(t){
  return s(t).toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'typ';
}

/* Anzeigename: Firma gewinnt, sonst «Name Vorname». Nie leer. */
function anzeigeName(a){
  if(!a)return '';
  var f=s(a.firma);if(f)return f;
  var n=[s(a.name),s(a.vorname)].filter(Boolean).join(' ');
  if(n)return n;
  return s(a.kontakt)||s(a.nr)||'';
}

/* normalize — macht einen Rohsatz zu einem gültigen Adress-Record.
   Stellt sicher, dass `firma` gefüllt ist (Alt-Konsumenten!) und dass
   Typen ein sauberes String-Array sind. Mutiert NICHT. */
function normalize(a){
  var r=Object.assign({},a||{});
  r.anrede=s(r.anrede); r.vorname=s(r.vorname); r.name=s(r.name);
  r.firma=s(r.firma); r.kontakt=s(r.kontakt);
  r.strasse=s(r.strasse); r.strasse2=s(r.strasse2);
  r.plz=s(r.plz); r.ort=s(r.ort); r.land=s(r.land);
  r.email=s(r.email); r.tel=s(r.tel); r.natel=s(r.natel);
  r.wohnung=s(r.wohnung); r.bemerkungen=s(r.bemerkungen);
  r.nr=s(r.nr);
  r.typen=Array.isArray(r.typen)?r.typen.map(s).filter(Boolean):[];
  // Dedupe Typen, Reihenfolge erhalten
  var seen={},tp=[];
  r.typen.forEach(function(t){if(!seen[t]){seen[t]=1;tp.push(t);}});
  r.typen=tp;
  // firma IMMER füllen — sonst zeigen Alt-Konsumenten «—»
  if(!r.firma)r.firma=[r.name,r.vorname].filter(Boolean).join(' ')||r.kontakt;
  // kontakt = Ansprechperson; bei Privatpersonen bleibt es leer (firma ist die Person)
  if(!r.kontakt&&r.firma&&(r.name||r.vorname)){
    var pers=[r.vorname,r.name].filter(Boolean).join(' ');
    if(pers&&pers.toLowerCase()!==r.firma.toLowerCase())r.kontakt=pers;
  }
  return r;
}

/* Ist die Adresse eine Privatperson (kein Firmenname)? */
function istPerson(a){
  if(!a)return false;
  var f=s(a.firma).toLowerCase();
  var p=[s(a.name),s(a.vorname)].filter(Boolean).join(' ').toLowerCase();
  var p2=[s(a.vorname),s(a.name)].filter(Boolean).join(' ').toLowerCase();
  return !!(p&&(f===p||f===p2));
}

/* Adresszeilen für Briefkopf / Fensteradresse / Objekt-Box. */
function zeilen(a){
  if(!a)return [];
  var out=[];
  var kopf=anzeigeName(a);
  if(a.anrede&&istPerson(a))kopf=s(a.anrede)+' '+kopf;
  if(kopf)out.push(kopf);
  if(a.kontakt&&!istPerson(a))out.push(s(a.kontakt));
  if(a.strasse2)out.push(s(a.strasse2));
  if(a.strasse)out.push(s(a.strasse));
  var o=[s(a.plz),s(a.ort)].filter(Boolean).join(' ');
  if(o)out.push(o);
  if(a.land&&s(a.land).toLowerCase()!=='ch'&&s(a.land).toLowerCase()!=='schweiz')out.push(s(a.land));
  return out;
}

/* Snapshot für Dokumente (kundeSnapshot / zustellSnapshot).
   Bewusst dasselbe flache Schema wie bisher — kein Konsument muss angepasst
   werden. `adressId`/`nr` kommen additiv dazu (Rückverfolgung). */
function snapshot(a){
  if(!a)return null;
  var n=normalize(a);
  return {
    firma:n.firma, kontakt:n.kontakt,
    strasse:n.strasse, plz:n.plz, ort:n.ort, email:n.email,
    adressId:n.id||'', nr:n.nr||''
  };
}

/* Dedupe-Schlüssel für den Import: bevorzugt die alte ERP-Kundennummer,
   sonst Name+PLZ+Strasse normalisiert. Zwei Datensätze mit demselben
   Schlüssel sind dieselbe Adresse. */
function dedupeKey(a){
  var n=normalize(a);
  if(n.nr)return 'nr:'+n.nr.toLowerCase();
  return softKey(n);
}
/* Weicher Schlüssel — IGNORIERT die Kundennummer bewusst.

   KRITISCH für den Abgleich über mehrere Exporte hinweg: der Objekt-Export
   bringt Kundennummern mit, der Offert-Export NICHT. Ohne diesen zweiten
   Schlüssel entstünde für dieselbe Firma an derselben Adresse ein zweiter
   Datensatz, sobald sie einmal mit und einmal ohne Nummer geliefert wird.
   Name + PLZ + Strasse bleiben trennscharf genug, damit dieselbe Firma an
   ZWEI Liegenschaften (eigene Kundennummer je Objekt) getrennt bleibt. */
function softKey(a){
  var n=normalize(a);
  return 'x:'+[anzeigeName(n),n.plz,n.strasse].join('|').toLowerCase()
    .replace(/[^a-z0-9|]+/g,'');
}
/* Nur Buchstaben+Ziffern — für Vergleiche, die Zeilenumbrüche und
   Schreibweisen der Quelle ignorieren sollen. */
function alnum(v){return s(v).toLowerCase().replace(/[^a-z0-9]+/g,'');}
/* Zweitschlüssel für den Import: Firma UND Kontaktzeile ZUSAMMENGENOMMEN.

   Der Anschrift-Block der Altsysteme ist Freitext — ob eine Abteilung auf der
   Firmen- oder auf der Kontaktzeile landet, entscheidet allein der
   Zeilenumbruch in der Quelle: «Immobilien Basel-Stadt Liegenschaften FV» auf
   EINER Zeile vs. auf ZWEI Zeilen ist derselbe Kunde. Ohne diesen Schlüssel
   entstünden dafür zwei Adress-Datensätze.

   Bewusst KEIN unscharfer Vergleich (kein Präfix, keine Ähnlichkeit): nur
   exakte Gleichheit des zusammengesetzten Namens bei gleicher Strasse UND
   gleicher PLZ. Zwei verschiedene Kontaktpersonen an derselben Adresse
   bleiben damit zwei Adressen. */
function softKey2(a){
  var n=normalize(a);
  return 'y:'+[alnum(anzeigeName(n)+' '+n.kontakt),alnum(n.plz),alnum(n.strasse)].join('|');
}

/* Nächste freie Kundennummer: max(numerische Nummern)+1, min. 1.
   Nicht-numerische Nummern (z.B. «K-2024-A») werden ignoriert — der
   Import bringt seine eigenen Nummern ohnehin mit. */
function nextNrAus(liste){
  var max=0;
  (liste||[]).forEach(function(a){
    var m=/^\s*(\d{1,9})\s*$/.exec(s(a&&a.nr));
    if(m){var v=parseInt(m[1],10);if(v>max)max=v;}
  });
  return String(max+1);
}

/* Volltext-Suche über die für den Nutzer sichtbaren Felder. */
function passt(a,q){
  if(!q)return true;
  var h=[a.nr,a.firma,a.kontakt,a.vorname,a.name,a.strasse,a.plz,a.ort,a.email,a.tel,a.natel,a.wohnung,a.bemerkungen]
    .map(s).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(function(t){return h.indexOf(t)>=0;});
}

/* Wirksame Typen-Liste: gespeicherte Org-Liste ODER Default. */
function typenAus(cfg){
  var l=cfg&&Array.isArray(cfg)?cfg:null;
  if(!l||!l.length)return TYPEN_DEFAULT.slice();
  var out=[];
  l.forEach(function(t){
    if(!t)return;
    var id=s(t.id)||slug(t.label);
    var label=s(t.label)||id;
    if(id&&label)out.push({id:id,label:label});
  });
  return out.length?out:TYPEN_DEFAULT.slice();
}

/* ═══ ENGINE-END ═══ */

// ── Storage (per-Record, Muster pm_erp poolRead/poolSave) ────────────────
var _mem={};
function poolRead(){
  try{
    if(typeof GemaSync!=='undefined'&&GemaSync.getCached){var a=GemaSync.getCached(POOL);if(a&&a.length)return a;}
    var r=localStorage.getItem(POOL);if(r){var d=JSON.parse(r);if(Array.isArray(d))return d;}
  }catch(e){}
  return _mem[POOL]||[];
}
function poolWrite(pool){
  _mem[POOL]=pool;
  try{localStorage.setItem(POOL,JSON.stringify(pool));}catch(e){}
}
function user(){try{return GemaAuth.getCurrentUser();}catch(e){return null;}}
function orgId(){var u=user();return u?u.orgId:'';}

function list(){
  var o=orgId();
  return poolRead().filter(function(a){return a&&a.orgId===o;}).map(normalize);
}
function byId(id){if(!id)return null;var a=list().find(function(x){return x.id===id;});return a||null;}
function byNr(nr){
  nr=s(nr);if(!nr)return null;
  return list().find(function(x){return s(x.nr)===nr;})||null;
}
function byExtId(extId){
  extId=s(extId);if(!extId)return null;
  return list().find(function(x){return s(x.extId)===extId;})||null;
}
function suche(q,opts){
  opts=opts||{};
  var l=list().filter(function(a){return passt(a,s(q));});
  if(opts.typ)l=l.filter(function(a){return (a.typen||[]).indexOf(opts.typ)>=0;});
  l.sort(function(a,b){return anzeigeName(a).localeCompare(anzeigeName(b),'de');});
  return opts.limit?l.slice(0,opts.limit):l;
}

function save(a){
  var rec=normalize(a);
  if(!rec.firma)return Promise.reject(new Error('Firma/Name fehlt'));
  rec.id=rec.id||('kd_'+Date.now()+'_'+Math.random().toString(36).slice(2,6));
  rec.orgId=rec.orgId||orgId();
  if(!rec.nr)rec.nr=nextNr();
  rec.updatedAt=new Date().toISOString();
  if(!rec.createdAt)rec.createdAt=rec.updatedAt;
  var pool=poolRead().slice();
  var i=pool.findIndex(function(x){return x.id===rec.id;});
  if(i>=0)pool[i]=rec;else pool.push(rec);
  poolWrite(pool);
  if(typeof GemaSync!=='undefined'&&GemaSync.saveRecord)
    return GemaSync.saveRecord(MODULE,PREFIX+rec.id,rec).then(function(){return rec;},function(){return rec;});
  return Promise.resolve(rec);
}
function del(id){
  var pool=poolRead().filter(function(x){return x.id!==id;});
  poolWrite(pool);
  if(typeof GemaSync!=='undefined'&&GemaSync.deleteRecord)
    return GemaSync.deleteRecord(MODULE,PREFIX+id).catch(function(){});
  return Promise.resolve();
}
function nextNr(){return nextNrAus(list());}

// ── Kontakt-Typen (org-konfigurierbar) ──────────────────────────────────
function typen(){
  var cfg=null;
  try{
    var o=GemaAuth.getCurrentOrg&&GemaAuth.getCurrentOrg();
    cfg=o&&o.settings&&o.settings.erp&&o.settings.erp.adressTypen;
  }catch(e){}
  return typenAus(cfg);
}
function typLabel(id){
  var t=typen().find(function(x){return x.id===id;});
  return t?t.label:s(id);
}
function saveTypen(liste){
  var clean=typenAus(liste);
  try{
    var o=GemaAuth.getCurrentOrg&&GemaAuth.getCurrentOrg();
    if(!o||!o.id)return Promise.reject(new Error('Keine Firma aufgelöst'));
    var erp=Object.assign({},(o.settings&&o.settings.erp)||{});
    erp.adressTypen=clean;
    // KRITISCH: updateOrgSettings(orgId, settings) — orgId ist das ERSTE
    // Argument (sonst findet die Funktion die Org nicht und gibt still
    // `false` zurück; die Typen wären nie gespeichert worden).
    return Promise.resolve(GemaAuth.updateOrgSettings(o.id,{erp:erp}));
  }catch(e){return Promise.reject(e);}
}
/* Typ nach Label auflösen bzw. anlegen — der Import bringt Typen als
   Klartext mit («Bewohner»). Liefert die id. */
function typIdFuerLabel(label,autoAnlegen){
  var lab=s(label);if(!lab)return '';
  var l=typen();
  var hit=l.find(function(t){return t.label.toLowerCase()===lab.toLowerCase()||t.id===slug(lab);});
  if(hit)return hit.id;
  if(!autoAnlegen)return '';
  var id=slug(lab);
  l.push({id:id,label:lab});
  saveTypen(l);
  return id;
}

// ── Import-Upsert ───────────────────────────────────────────────────────
/* Legt eine Adresse an ODER aktualisiert die bestehende (Dedupe über
   extId → Kundennummer → Name+PLZ+Strasse).

   KRITISCH: bestehende Felder werden NUR gefüllt, wenn sie leer sind
   («ergänzen, nie überschreiben»). Ein zweiter Import derselben Datei ändert
   damit nichts an von Hand gepflegten Daten; Typen werden vereinigt. */
function upsertVonImport(roh,opts){
  opts=opts||{};
  var neu=normalize(roh);
  // `opts.bestand` erlaubt es dem Importer, die Adressliste EINMAL zu lesen
  // und über alle Zeilen mitzuführen (sonst O(n²) Pool-Reads bei tausenden
  // Zeilen) — und macht die Funktion ohne Pool testbar.
  var bestand=Array.isArray(opts.bestand)?opts.bestand:list();
  var treffer=null;
  if(neu.extId)treffer=bestand.find(function(x){return s(x.extId)&&s(x.extId)===neu.extId;})||null;
  if(!treffer&&neu.nr)treffer=bestand.find(function(x){return s(x.nr)===neu.nr;})||null;
  if(!treffer){
    var k=dedupeKey(neu);
    treffer=bestand.find(function(x){return dedupeKey(x)===k;})||null;
  }
  // Letzte Stufe: Abgleich OHNE Kundennummer (siehe softKey) — findet die
  // Adresse auch dann, wenn ein Export sie mit und ein anderer sie ohne
  // Nummer liefert. Nur bei belastbarem Schlüssel (Name + PLZ vorhanden).
  if(!treffer&&!neu.nr&&neu.plz&&anzeigeName(neu)){
    var sk=softKey(neu);
    treffer=bestand.find(function(x){return softKey(x)===sk;})||null;
    // … und dieselbe Adresse auch dann, wenn die Quelle Firma und Abteilung
    // unterschiedlich auf die Zeilen verteilt hat (siehe softKey2).
    if(!treffer&&neu.strasse){
      var sk2=softKey2(neu);
      treffer=bestand.find(function(x){return softKey2(x)===sk2;})||null;
    }
  }
  if(!treffer)return {aktion:'neu',rec:neu};
  var merged=Object.assign({},treffer);
  ['anrede','vorname','name','kontakt','strasse','strasse2','plz','ort','land',
   'email','tel','natel','wohnung','bemerkungen','nr','extId'].forEach(function(f){
    if(s(merged[f])||!s(neu[f]))return;
    // Kontaktzeile nicht doppeln: steht die Abteilung bereits im Firmennamen
    // (Zeilenumbruch-Artefakt der Quelle), bringt sie als Kontakt nichts.
    // Bewusst nur NICHT SETZEN — ein bereits erfasster Kontakt bleibt immer.
    if(f==='kontakt'&&alnum(merged.firma).indexOf(alnum(neu.kontakt))>=0)return;
    merged[f]=neu[f];
  });
  if(opts.ueberschreiben){
    ['strasse','strasse2','plz','ort','email','tel','natel'].forEach(function(f){
      if(s(neu[f]))merged[f]=neu[f];
    });
  }
  // Typen vereinigen
  var tp=(merged.typen||[]).slice();
  (neu.typen||[]).forEach(function(t){if(tp.indexOf(t)<0)tp.push(t);});
  merged.typen=tp;
  var vorher=JSON.stringify(normalize(treffer));
  var nachher=JSON.stringify(normalize(merged));
  return {aktion:vorher===nachher?'unveraendert':'aktualisiert',rec:normalize(merged)};
}

// ── Cloud-Bind ──────────────────────────────────────────────────────────
var _ready=null;
function bind(){
  if(_ready)return _ready;
  if(typeof GemaSync==='undefined'||!GemaSync.bindCollection){_ready=Promise.resolve([]);return _ready;}
  _ready=GemaSync.bindCollection(MODULE,POOL,PREFIX,'id').catch(function(){return [];});
  return _ready;
}

window.GemaAdressen={
  MODULE:MODULE, POOL:POOL, PREFIX:PREFIX,
  TYPEN_DEFAULT:TYPEN_DEFAULT, SLOTS:SLOTS,
  bind:bind, get ready(){return _ready||bind();},
  list:list, byId:byId, byNr:byNr, byExtId:byExtId, suche:suche,
  save:save, del:del, nextNr:nextNr,
  typen:typen, typLabel:typLabel, saveTypen:saveTypen, typIdFuerLabel:typIdFuerLabel,
  upsertVonImport:upsertVonImport,
  // Engine (DOM-frei, auch für Node-Tests exportiert)
  normalize:normalize, anzeigeName:anzeigeName, zeilen:zeilen, snapshot:snapshot,
  istPerson:istPerson, dedupeKey:dedupeKey, softKey:softKey, softKey2:softKey2,
  nextNrAus:nextNrAus, passt:passt,
  typenAus:typenAus, slug:slug
};

})();
