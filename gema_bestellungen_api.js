/* ============================================================
   GEMA Bestellungen API (gema_bestellungen_api.js)
   Anlagen-Bestellprozess: Der GEWINNER-UNTERNEHMER einer Ausschreibung
   bestellt die Lieferungs-Positionen (Anlagen) direkt beim Lieferanten —
   der Lieferant bestätigt mit Liefertermin/AB-Nummer, meldet die
   Lieferung, der Besteller bestätigt den Wareneingang.

   Storage: per-Record in der Cloud (gema_sync.js)
     moduleKey 'bestellungen' · data_key-Prefix 'best:' ·
     localStorage-Pool 'gema_best_pool_v1'

   Status-Flow:
     offen ──✓──▶ bestaetigt ──📦──▶ geliefert (+ empfangen-Marker)
       │  └──✕──▶ abgelehnt   (Lieferant, mit Grund)
       └──⊘──▶ storniert      (Besteller; auch aus bestaetigt)

   Konsumenten:
     pm_bestellungen.html            — Besteller-Übersicht (Org-Scope)
     pm_ausschreibungsunterlagen.html— Bestell-Sektion für den Gewinner
     sys_lieferant_dashboard.html    — Tab «🛒 Bestellungen» (Lieferant)
   ============================================================ */
(function(){
  'use strict';
  var MODULE_KEY='bestellungen';
  var PREFIX='best:';
  var POOL='gema_best_pool_v1';

  function _readCache(){
    try{
      if(typeof GemaSync!=='undefined'&&GemaSync.getCached)return GemaSync.getCached(POOL)||[];
    }catch(e){}
    try{var a=JSON.parse(localStorage.getItem(POOL)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}
  }
  function _writeCache(arr){
    try{localStorage.setItem(POOL,JSON.stringify(arr));}catch(e){}
  }
  function _now(){return new Date().toISOString();}
  function _user(){try{return (typeof GemaAuth!=='undefined'&&GemaAuth.getCurrentUser&&GemaAuth.getCurrentUser())||null;}catch(e){return null;}}
  function _userName(){var u=_user();return u?(u.name||u.username||''):'';}

  // Einzel-Record speichern (nie persistCollection — der Pool ist global
  // über alle Orgs, ein unvollständiger Cache dürfte nie fremde Records
  // löschen; gleiches Muster wie das Lieferanten-Dashboard beim Werkzeug).
  function _persist(b){
    var arr=_readCache();
    var i=arr.findIndex(function(x){return x.id===b.id;});
    if(i>=0)arr[i]=b;else arr.unshift(b);
    _writeCache(arr);
    try{
      if(typeof GemaSync!=='undefined'&&GemaSync.saveRecord)GemaSync.saveRecord(MODULE_KEY,PREFIX+b.id,b).catch(function(){});
    }catch(e){}
    try{window.dispatchEvent(new CustomEvent('gema-bestellungen-changed'));}catch(e){}
    return b;
  }

  function _notify(opts){
    try{if(typeof GemaNotify!=='undefined'&&GemaNotify.push)GemaNotify.push(opts);}catch(e){}
  }
  // Lieferant benachrichtigen: bevorzugt alle User mit passender
  // user.lieferantId, Fallback Lieferanten-Org (nie org_default) —
  // gleiches Muster wie offertanfrage_neu im Produktkatalog.
  function _notifyLieferant(b,eventKey,typ,titel,text){
    var link='sys_lieferant_dashboard.html?tab=bestellungen';
    var matched=false;
    try{
      if(typeof GemaAuth!=='undefined'&&GemaAuth.getUsers){
        (GemaAuth.getUsers()||[]).forEach(function(u){
          if(u&&u.lieferantId===b.lieferantId&&u.active!==false){
            matched=true;
            _notify({eventKey:eventKey,empfaengerUserId:u.id,modul:'bestellungen',typ:typ,titel:titel,text:text,link:link,objektId:b.objektId||''});
          }
        });
      }
    }catch(e){}
    if(!matched){
      var orgId='';
      try{
        if(typeof GemaProdukte!=='undefined'&&GemaProdukte.getLieferant){
          var l=GemaProdukte.getLieferant(b.lieferantId);
          orgId=(l&&l.orgId)||'';
        }
      }catch(e){}
      if(orgId&&orgId!=='org_default'){
        _notify({eventKey:eventKey,empfaengerOrgId:orgId,modul:'bestellungen',typ:typ,titel:titel,text:text,link:link,objektId:b.objektId||''});
      }
    }
  }
  function _notifyBesteller(b,eventKey,typ,titel,text){
    if(!b.bestellerUserId)return;
    _notify({eventKey:eventKey,empfaengerUserId:b.bestellerUserId,modul:'bestellungen',typ:typ,titel:titel,text:text,link:'pm_bestellungen.html?b='+b.id,objektId:b.objektId||''});
  }
  function _verlauf(b,ev){
    b.verlauf=b.verlauf||[];
    b.verlauf.push({ts:_now(),ev:ev,von:_userName()});
    if(b.verlauf.length>30)b.verlauf=b.verlauf.slice(-30);
  }

  var STATUS={
    offen:      {short:'Offen',      label:'Offen — wartet auf Lieferant', color:'#b45309', bg:'#fffbeb', bd:'#fcd34d'},
    bestaetigt: {short:'Bestätigt',  label:'Bestätigt durch Lieferant',    color:'#2563eb', bg:'#eff6ff', bd:'#bfdbfe'},
    geliefert:  {short:'Geliefert',  label:'Geliefert',                    color:'#16a34a', bg:'#f0fdf4', bd:'#bbf7d0'},
    abgelehnt:  {short:'Abgelehnt',  label:'Abgelehnt durch Lieferant',    color:'#dc2626', bg:'#fef2f2', bd:'#fca5a5'},
    storniert:  {short:'Storniert',  label:'Storniert durch Besteller',    color:'#64748b', bg:'#f8fafc', bd:'#cbd5e1'}
  };

  // Nummernkreis pro Besteller-Org + Jahr: BST-2026-001
  function nextNr(orgId){
    var pre='BST-'+new Date().getFullYear()+'-';
    var max=0;
    _readCache().forEach(function(b){
      if(b&&b.orgId===orgId&&typeof b.nr==='string'&&b.nr.indexOf(pre)===0){
        var n=parseInt(b.nr.slice(pre.length),10);
        if(n>max)max=n;
      }
    });
    var n=max+1;
    return pre+(n<10?'00'+n:(n<100?'0'+n:String(n)));
  }

  function create(opts){
    opts=opts||{};
    var u=_user()||{};
    var menge=parseFloat(opts.menge)||1;
    var preis=parseFloat(opts.preis)||0;
    var b={
      id:'best_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      nr:nextNr(u.orgId||''),
      orgId:u.orgId||'',
      bestellerUserId:u.id||'',
      bestellerName:_userName(),
      bestellerFirma:opts.bestellerFirma||'',
      bestellerEmail:(u.profile&&u.profile.email)||u.username||'',
      bestellerTel:(u.profile&&u.profile.telefon)||'',
      lieferantId:opts.lieferantId||'',
      lieferantFirma:opts.lieferantFirma||'',
      produktId:opts.produktId||'',
      produktName:opts.produktName||'',
      kategorie:opts.kategorie||'',
      menge:menge,
      einheit:opts.einheit||'Stk',
      preis:preis,
      total:Math.round(menge*preis*100)/100,
      quelle:opts.quelle||{typ:'manuell'},
      objektId:opts.objektId||'',
      objektName:opts.objektName||'',
      lieferadresse:opts.lieferadresse||'',
      wunschtermin:opts.wunschtermin||'',
      bemerkung:opts.bemerkung||'',
      status:'offen',
      bestelltAm:_now(),
      antwort:null,geliefert:null,empfangen:null,storno:null,
      verlauf:[]
    };
    _verlauf(b,'Bestellung erstellt');
    _persist(b);
    _notifyLieferant(b,'bestellung_neu','aktion','🛒 Neue Bestellung '+b.nr,
      (b.bestellerFirma||b.bestellerName)+': '+b.produktName+(b.total?' — CHF '+fmtChf(b.total):'')+(b.objektName?' · '+b.objektName:''));
    return b;
  }

  function byId(id){return _readCache().find(function(b){return b&&b.id===id;})||null;}

  function bestaetigen(id,antwort){
    var b=byId(id);if(!b||b.status!=='offen')return null;
    antwort=antwort||{};
    b.status='bestaetigt';
    b.antwort={
      liefertermin:antwort.liefertermin||'',
      abNr:antwort.abNr||'',
      nachricht:antwort.nachricht||'',
      pdfName:antwort.pdfName||'',
      pdfUrl:antwort.pdfUrl||'',
      pdfDataUrl:antwort.pdfDataUrl||null,
      beantwortetAm:_now(),
      beantwortetVon:_userName()
    };
    _verlauf(b,'Bestätigt'+(b.antwort.liefertermin?' — Liefertermin '+b.antwort.liefertermin:''));
    _persist(b);
    _notifyBesteller(b,'bestellung_bestaetigt','erfolg','✓ Bestellung '+b.nr+' bestätigt',
      b.lieferantFirma+': '+b.produktName+(b.antwort.liefertermin?' — Liefertermin '+b.antwort.liefertermin:''));
    return b;
  }

  function ablehnen(id,grund){
    var b=byId(id);if(!b||b.status!=='offen')return null;
    b.status='abgelehnt';
    b.antwort={nachricht:grund||'',beantwortetAm:_now(),beantwortetVon:_userName()};
    _verlauf(b,'Abgelehnt'+(grund?': '+grund:''));
    _persist(b);
    _notifyBesteller(b,'bestellung_abgelehnt','warnung','✕ Bestellung '+b.nr+' abgelehnt',
      b.lieferantFirma+': '+(grund||'ohne Begründung'));
    return b;
  }

  function geliefertMelden(id,nachricht){
    var b=byId(id);if(!b||(b.status!=='bestaetigt'&&b.status!=='offen'))return null;
    b.status='geliefert';
    b.geliefert={am:_now(),von:_userName(),nachricht:nachricht||''};
    _verlauf(b,'Als geliefert gemeldet');
    _persist(b);
    _notifyBesteller(b,'bestellung_geliefert','erfolg','📦 Bestellung '+b.nr+' geliefert',
      b.lieferantFirma+': '+b.produktName+(b.objektName?' → '+b.objektName:''));
    return b;
  }

  function empfangBestaetigen(id){
    var b=byId(id);if(!b||b.status!=='geliefert'||b.empfangen)return null;
    b.empfangen={am:_now(),von:_userName()};
    _verlauf(b,'Wareneingang bestätigt');
    _persist(b);
    _notifyLieferant(b,'bestellung_empfangen','erfolg','✓ Wareneingang bestätigt — '+b.nr,
      (b.bestellerFirma||b.bestellerName)+' hat den Erhalt von '+b.produktName+' bestätigt.');
    return b;
  }

  function stornieren(id,grund){
    var b=byId(id);if(!b||(b.status!=='offen'&&b.status!=='bestaetigt'))return null;
    b.status='storniert';
    b.storno={am:_now(),von:_userName(),grund:grund||''};
    _verlauf(b,'Storniert'+(grund?': '+grund:''));
    _persist(b);
    _notifyLieferant(b,'bestellung_storniert','warnung','⊘ Bestellung '+b.nr+' storniert',
      (b.bestellerFirma||b.bestellerName)+': '+b.produktName+(grund?' — '+grund:''));
    return b;
  }

  function bind(){
    if(typeof GemaSync==='undefined'||!GemaSync.bindCollection)return Promise.resolve([]);
    return GemaSync.bindCollection(MODULE_KEY,POOL,PREFIX,'id');
  }

  function fmtChf(v){
    v=parseFloat(v)||0;
    return v.toLocaleString('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  function badgeHtml(b){
    var s=STATUS[b.status]||STATUS.offen;
    var extra=(b.status==='geliefert'&&b.empfangen)?' · Erhalt ✓':'';
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:10.5px;font-weight:800;border:1px solid '+s.bd+';background:'+s.bg+';color:'+s.color+';white-space:nowrap">'+s.short+extra+'</span>';
  }

  window.GemaBest={
    MODULE_KEY:MODULE_KEY,PREFIX:PREFIX,POOL:POOL,STATUS:STATUS,
    bind:bind,
    getAll:function(){return _readCache().slice();},
    byId:byId,
    getForOrg:function(orgId){return _readCache().filter(function(b){return b&&b.orgId===orgId;});},
    getForLieferant:function(lid){return _readCache().filter(function(b){return b&&b.lieferantId===lid;});},
    nextNr:nextNr,
    create:create,
    bestaetigen:bestaetigen,
    ablehnen:ablehnen,
    geliefertMelden:geliefertMelden,
    empfangBestaetigen:empfangBestaetigen,
    stornieren:stornieren,
    fmtChf:fmtChf,
    badgeHtml:badgeHtml
  };
})();
