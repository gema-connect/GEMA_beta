/* gema_armaturen_api.js — Armaturen-Katalog mit Lieferant-Pflege (v2)
   - GEMA liefert einen Default-Katalog (Basisdaten, ζ-Werte) — nur lokal, nie auto in die Cloud
   - Lieferant pflegt eigene Armaturen im Dashboard (ζ + kvs pro Dimension, Druckverlustdiagramm)
   - Cloud-Sync per-Record via gema_sync.js (moduleKey 'armaturen', prefix 'arm:', Pool-Cache
     'gema_armaturen_pool_v1'); Pool-Records überschreiben Defaults gleicher id, Defaults sind
     via Tombstone {deleted:true} ausblendbar
   - Druckverlust dimensionsabhängig: kvs bevorzugt (Δp = (Q/kvs)²·100 kPa), sonst ζ (Δp = ζ·ρ/2·v²)
*/
(function(w){
  'use strict';
  var LEGACY_SK='gema_armaturen_v1';          // alter Blob {armaturen:[...]} — nur noch Migrations-Quelle
  var POOL_SK='gema_armaturen_pool_v1';       // Array-Cache der Cloud-Records (bindCollection)
  var MODULE_KEY='armaturen', PREFIX='arm:';
  var MIG_FLAG='gema_armaturen_migrated_v1';

  // ── Standard-Armaturen-Katalog (Seed, bleibt lokal) ──
  var DEFAULT_ARMATUREN=[
    // Schrägsitzventile
    {id:'ssv-nussbaum-1',typ:'schraeg',name:'Schrägsitzventil',hersteller:'R. Nussbaum AG',serie:'Optipress',status:'verifiziert',
     zeta:{15:2.3,18:2.1,22:1.7,28:1.4,35:1.2,42:1.6,54:1.5},zetaDefault:1.8},
    {id:'ssv-geberit-1',typ:'schraeg',name:'Schrägsitzventil Mapress',hersteller:'Geberit AG',serie:'Mapress',status:'verifiziert',
     zeta:{15:3.5,18:2.5,22:2.0,28:1.5,35:1.2,42:1.0},zetaDefault:2.0},
    {id:'ssv-jrg-1',typ:'schraeg',name:'Schrägsitzventil MT',hersteller:'JRG',serie:'Sanipex MT',status:'nicht_verifiziert',
     zeta:{16:2.1,20:2.1,26:1.7,32:1.5,40:1.4,50:1.6,63:1.4},zetaDefault:1.8},
    {id:'ssv-generic',typ:'schraeg',name:'Schrägsitzventil (Standard)',hersteller:'—',serie:'—',status:'verifiziert',
     zeta:{15:3.5,20:2.5,25:2.0,32:2.0,40:2.0,50:2.0,65:0.7},zetaDefault:2.0},
    // Geradsitzventile
    {id:'gsv-nussbaum-1',typ:'gerad',name:'Geradsitzventil',hersteller:'R. Nussbaum AG',serie:'Optipress',status:'verifiziert',
     zeta:{15:5.5,18:5.7,22:7.4,28:7.1,35:6.5,42:8.5,54:8.0},zetaDefault:6.5},
    {id:'gsv-generic',typ:'gerad',name:'Geradsitzventil (Standard)',hersteller:'—',serie:'—',status:'verifiziert',
     zeta:{15:10,20:8.5,25:7.0,32:6.0,40:5.0,50:5.0},zetaDefault:7.0},
    // Kugelhähne
    {id:'kh-nussbaum-1',typ:'kugelhahn',name:'Kugelhahn Optipress',hersteller:'R. Nussbaum AG',serie:'Optipress',status:'verifiziert',
     zeta:{15:1.0,20:0.5,25:0.5,32:0.3,40:0.3,50:0.3},zetaDefault:0.5},
    {id:'kh-jrg-1',typ:'kugelhahn',name:'Kugelhahn MT',hersteller:'JRG',serie:'Sanipex MT',status:'nicht_verifiziert',
     zeta:{16:0.1,20:0.3,26:0.3,32:0.4,40:0.5},zetaDefault:0.3},
    {id:'kh-generic',typ:'kugelhahn',name:'Kugelhahn (Standard)',hersteller:'—',serie:'—',status:'verifiziert',
     zeta:{15:1.0,20:0.5,25:0.5,32:0.3,40:0.3,50:0.3},zetaDefault:0.5},
    // Absperrschieber
    {id:'as-generic',typ:'absperrschieber',name:'Absperrschieber',hersteller:'—',serie:'—',status:'verifiziert',
     zeta:{},zetaDefault:0.3},
    // Rückschlagventile
    {id:'rv-generic',typ:'rueckschlag',name:'Rückschlagventil',hersteller:'—',serie:'—',status:'verifiziert',
     zeta:{},zetaDefault:2.0},
    {id:'rv-nussbaum-1',typ:'rueckschlag',name:'Rückschlagventil Optipress',hersteller:'R. Nussbaum AG',serie:'Optipress',status:'verifiziert',
     zeta:{15:2.5,18:2.0,22:1.8,28:1.5,35:1.3},zetaDefault:2.0},
    // Druckminderer
    {id:'dm-generic',typ:'druckminderer',name:'Druckminderer',hersteller:'—',serie:'—',status:'verifiziert',
     zeta:{},zetaDefault:8.0},
    {id:'dm-honeywell-1',typ:'druckminderer',name:'D06F Druckminderer',hersteller:'Honeywell',serie:'Braukmann',status:'nicht_verifiziert',
     zeta:{15:7.0,20:6.5,25:6.0,32:5.5,40:5.0,50:4.5},zetaDefault:6.0,
     kvs:{15:2.6,20:4.4,25:6.9,32:9.9,40:13.8,50:20.0}},
    // Wasserzähler
    {id:'wz-generic',typ:'wasserzaehler',name:'Wasserzähler',hersteller:'—',serie:'—',status:'verifiziert',
     zeta:{15:5.0,20:4.0,25:3.0},zetaDefault:4.0},
    // Schmutzfänger / Filter
    {id:'sf-generic',typ:'filter',name:'Schmutzfänger / Filter',hersteller:'—',serie:'—',status:'verifiziert',
     zeta:{},zetaDefault:3.0},
  ];

  // Armaturen-Typen für Gruppierung
  var TYPEN=[
    {id:'schraeg',name:'Schrägsitzventile',icon:'⌥'},
    {id:'gerad',name:'Geradsitzventile',icon:'⊟'},
    {id:'kugelhahn',name:'Kugelhähne',icon:'◉'},
    {id:'absperrschieber',name:'Absperrschieber',icon:'▬'},
    {id:'rueckschlag',name:'Rückschlagventile',icon:'◁'},
    {id:'druckminderer',name:'Druckminderer',icon:'▽'},
    {id:'wasserzaehler',name:'Wasserzähler',icon:'🔢'},
    {id:'filter',name:'Filter / Schmutzfänger',icon:'⊞'},
    {id:'regulierventil',name:'Regulierventile',icon:'⚙'},
    {id:'sonstige',name:'Sonstige',icon:'🔩'}
  ];

  // ── Pool (Cloud-Records) ──
  var _poolMem=[];
  function _readPool(){
    try{
      if(typeof GemaSync!=='undefined'&&GemaSync.getCached){var a=GemaSync.getCached(POOL_SK);if(a&&a.length)return a;}
      var r=localStorage.getItem(POOL_SK);if(r){var d=JSON.parse(r);if(Array.isArray(d))return d;}
    }catch(e){}
    return _poolMem;
  }
  function _writePoolLocal(arr){
    _poolMem=arr;
    try{localStorage.setItem(POOL_SK,JSON.stringify(arr));}catch(e){}
  }

  // ── Merge Defaults + Pool ──
  function getAll(){
    var map={};
    DEFAULT_ARMATUREN.forEach(function(a){map[a.id]=a;});
    _readPool().forEach(function(a){if(a&&a.id)map[a.id]=a;});
    return Object.keys(map).map(function(k){return map[k];}).filter(function(a){return !a.deleted;});
  }

  // ── Cloud-Bootstrap (best-effort, non-blocking) ──
  var _readyResolve;
  var ready=new Promise(function(res){_readyResolve=res;});
  var _booted=false;
  function bootstrap(){
    if(_booted)return ready;
    _booted=true;
    if(typeof GemaSync==='undefined'||!GemaSync.bindCollection){_readyResolve();return ready;}
    GemaSync.bindCollection(MODULE_KEY,POOL_SK,PREFIX,'id').then(function(arr){
      if(Array.isArray(arr))_poolMem=arr;
      _migrateLegacy();
      _readyResolve();
      try{w.dispatchEvent(new Event('gema-armaturen-loaded'));}catch(e){}
    }).catch(function(){_readyResolve();});
    return ready;
  }
  // Einmalige Migration: lokal geänderte/ergänzte Armaturen aus dem alten Blob in die Cloud
  function _migrateLegacy(){
    try{
      if(localStorage.getItem(MIG_FLAG))return;
      var r=localStorage.getItem(LEGACY_SK);if(!r){localStorage.setItem(MIG_FLAG,'1');return;}
      var d=JSON.parse(r);var list=(d&&d.armaturen)||[];
      var defMap={};DEFAULT_ARMATUREN.forEach(function(a){defMap[a.id]=JSON.stringify(a);});
      var pool=_readPool().slice();
      var changed=false;
      list.forEach(function(a){
        if(!a||!a.id)return;
        if(defMap[a.id]&&defMap[a.id]===JSON.stringify(a))return;      // unverändertes Default → nichts tun
        if(pool.some(function(p){return p.id===a.id;}))return;          // Cloud hat bereits eine Version
        pool.push(a);changed=true;
        if(typeof GemaSync!=='undefined'&&GemaSync.saveRecord)GemaSync.saveRecord(MODULE_KEY,PREFIX+a.id,a).catch(function(){});
      });
      if(changed)_writePoolLocal(pool);
      localStorage.setItem(MIG_FLAG,'1');
    }catch(e){}
  }

  // ── Getter ──
  function getByTyp(typ){return getAll().filter(function(a){return a.typ===typ;});}
  function getByHersteller(hersteller){return getAll().filter(function(a){return a.hersteller===hersteller;});}
  function getHersteller(){
    var h={};getAll().forEach(function(a){if(a.hersteller&&a.hersteller!=='—')h[a.hersteller]=1;});
    return Object.keys(h).sort();
  }
  function getTypen(){return TYPEN;}
  function getById(id){return getAll().find(function(a){return a.id===id;})||null;}
  function getForLieferant(lieferantId,firma){
    return getAll().filter(function(a){
      if(lieferantId&&a.lieferantId===lieferantId)return true;
      if(firma&&a.hersteller&&a.hersteller.toLowerCase()===String(firma).toLowerCase())return true;
      return false;
    });
  }

  // DN-Lookup (Map-Keys sind Zahlen ODER Strings wie '22x1.2' / 'DN 20')
  function _dimLookup(map,dn){
    if(map==null||dn==null||dn==='')return undefined;
    if(map[dn]!==undefined)return map[dn];
    // erste Zahl extrahieren: '22x1.2' → 22, 'DN 20' → 20, '3/4"' → 3
    var m=String(dn).match(/[\d]+(?:\.[\d]+)?/);
    if(!m)return undefined;
    var dnNum=parseFloat(m[0]);
    if(map[dnNum]!==undefined)return map[dnNum];
    if(map[String(dnNum)]!==undefined)return map[String(dnNum)];
    return undefined;
  }
  function getZeta(armaturId,dn){
    var a=getById(armaturId);if(!a)return 0;
    var v=_dimLookup(a.zeta,dn);
    if(v!==undefined)return parseFloat(v)||0;
    return a.zetaDefault||0;
  }
  function getKvs(armaturId,dn){
    var a=getById(armaturId);if(!a)return 0;
    var v=_dimLookup(a.kvs,dn);
    v=parseFloat(v)||0;
    return v>0?v:0;
  }

  // ── Druckverlust einer Armatur bei Dimension + Betriebspunkt ──
  // ctx = { Q_ls, v_ms, rho }  →  { dp_kPa, basis:'kvs'|'zeta'|null, kvs, zeta }
  function getDp(armaturId,dn,ctx){
    ctx=ctx||{};
    var kvs=getKvs(armaturId,dn);
    if(kvs>0&&ctx.Q_ls>0){
      var Qm3h=ctx.Q_ls*3.6;
      return {dp_kPa:100*Math.pow(Qm3h/kvs,2),basis:'kvs',kvs:kvs,zeta:getZeta(armaturId,dn)};
    }
    var z=getZeta(armaturId,dn);
    if(z>0&&ctx.v_ms>0){
      return {dp_kPa:z*((ctx.rho||1000)/2)*ctx.v_ms*ctx.v_ms/1000,basis:'zeta',zeta:z,kvs:0};
    }
    return {dp_kPa:0,basis:z>0?'zeta':null,zeta:z,kvs:kvs};
  }

  // ── Auswahl-Summe für Berechnungsmodule ──
  // sel = { armaturen:{id:count}, manuell:[{name,dp}] }  (dp in kPa)
  // ctx = { dn, Q_ls, v_ms, rho }
  // →  { zetaSum (nur ζ-basierte), dpKvs_kPa, dpManu_kPa, dp_kPa (kvs+manuell), list:[...] }
  function computeSelectionDp(sel,ctx){
    sel=sel||{};ctx=ctx||{};
    var out={zetaSum:0,dpKvs_kPa:0,dpManu_kPa:0,dp_kPa:0,list:[]};
    Object.keys(sel.armaturen||{}).forEach(function(id){
      var cnt=sel.armaturen[id];if(!(cnt>0))return;
      var a=getById(id);
      var kvs=getKvs(id,ctx.dn);
      if(kvs>0){
        var dpe=(ctx.Q_ls>0)?100*Math.pow(ctx.Q_ls*3.6/kvs,2):0;
        out.dpKvs_kPa+=cnt*dpe;
        out.list.push({id:id,name:a?a.name:id,count:cnt,basis:'kvs',kvs:kvs,dpEach_kPa:dpe});
      } else {
        var z=getZeta(id,ctx.dn);
        out.zetaSum+=cnt*z;
        out.list.push({id:id,name:a?a.name:id,count:cnt,basis:'zeta',zeta:z});
      }
    });
    (sel.manuell||[]).forEach(function(m){
      var dp=parseFloat(m.dp)||0;
      out.dpManu_kPa+=dp;
      out.list.push({name:m.name||'Manuell',count:1,basis:'manuell',dpEach_kPa:dp});
    });
    out.dp_kPa=out.dpKvs_kPa+out.dpManu_kPa;
    return out;
  }

  // ── Kurvenpunkte fürs generierte Druckverlustdiagramm ──
  // opts = { di_mm (für ζ-Kurve, Fallback DN-Zahl), rho, Qmax_ls }
  // → Array [{q(l/s), dp(kPa)}] oder null wenn keine Datenbasis
  function curvePoints(armaturId,dn,opts){
    opts=opts||{};
    var kvs=getKvs(armaturId,dn);
    var zeta=kvs>0?0:getZeta(armaturId,dn);
    if(!(kvs>0)&&!(zeta>0))return null;
    var rho=opts.rho||1000;
    var di=(opts.di_mm||parseFloat(String(dn).replace(/[^\d.]/g,''))||20)/1000;
    var A=Math.PI/4*di*di;
    var qmax=opts.Qmax_ls;
    if(!(qmax>0)){
      if(kvs>0)qmax=kvs/3.6*0.7;              // Endpunkt ≈ Δp 0.5 bar
      else qmax=2.5*A*1000;                     // Endpunkt bei v = 2.5 m/s
    }
    var pts=[],N=40;
    for(var i=0;i<=N;i++){
      var q=qmax*i/N;
      var dp;
      if(kvs>0)dp=100*Math.pow(q*3.6/kvs,2);
      else{var v=A>0?(q/1000)/A:0;dp=zeta*rho/2*v*v/1000;}
      pts.push({q:q,dp:dp});
    }
    return pts;
  }

  // ── Persistenz (per-Record) ──
  function _persistRecord(a){
    var pool=_readPool().slice();
    var i=pool.findIndex(function(p){return p.id===a.id;});
    if(i>=0)pool[i]=a;else pool.push(a);
    _writePoolLocal(pool);
    if(typeof GemaSync!=='undefined'&&GemaSync.saveRecord)GemaSync.saveRecord(MODULE_KEY,PREFIX+a.id,a).catch(function(){});
    try{w.dispatchEvent(new Event('gema-armaturen-changed'));}catch(e){}
  }

  // Lieferant/Admin: Armatur anlegen oder aktualisieren
  function upsertArmatur(armatur){
    if(!armatur)return null;
    armatur.id=armatur.id||('arm_'+Date.now()+'_'+Math.random().toString(36).slice(2,6));
    armatur.status=armatur.status||'nicht_verifiziert';
    armatur.zeta=armatur.zeta||{};
    _persistRecord(armatur);
    return armatur;
  }
  // Löschen: eigene Records hart, Defaults via Tombstone
  function deleteArmatur(id){
    var isDefault=DEFAULT_ARMATUREN.some(function(a){return a.id===id;});
    if(isDefault){_persistRecord({id:id,deleted:true});return;}
    var pool=_readPool().slice();
    var i=pool.findIndex(function(p){return p.id===id;});
    if(i>=0){pool.splice(i,1);_writePoolLocal(pool);}
    if(typeof GemaSync!=='undefined'&&GemaSync.deleteRecord)GemaSync.deleteRecord(MODULE_KEY,PREFIX+id).catch(function(){});
    try{w.dispatchEvent(new Event('gema-armaturen-changed'));}catch(e){}
  }
  // Lieferant: Armatur verifizieren
  function verifiziere(id){
    var a=getById(id);if(!a)return;
    a=JSON.parse(JSON.stringify(a));a.status='verifiziert';
    _persistRecord(a);
  }
  // Lieferant: Zeta-Werte aktualisieren (Backward-Compat)
  function updateZeta(id,zeta,zetaDefault){
    var a=getById(id);if(!a)return;
    a=JSON.parse(JSON.stringify(a));a.zeta=zeta;
    if(zetaDefault!==undefined)a.zetaDefault=zetaDefault;
    _persistRecord(a);
  }
  // Backward-Compat: addArmatur = upsert
  function addArmatur(armatur){return upsertArmatur(armatur);}

  w.GemaArmaturen={
    getAll:getAll, getByTyp:getByTyp, getByHersteller:getByHersteller,
    getHersteller:getHersteller, getTypen:getTypen, getById:getById, getForLieferant:getForLieferant,
    getZeta:getZeta, getKvs:getKvs, getDp:getDp, computeSelectionDp:computeSelectionDp, curvePoints:curvePoints,
    verifiziere:verifiziere, updateZeta:updateZeta, addArmatur:addArmatur,
    upsertArmatur:upsertArmatur, deleteArmatur:deleteArmatur,
    bootstrap:bootstrap, ready:ready, TYPEN:TYPEN
  };
  // Bootstrap beim Laden (best-effort, blockiert nichts)
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){bootstrap();});
  else bootstrap();
})(window);
