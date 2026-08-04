/* ============================================================
   GEMA Schule API (gema_schule_api.js)
   Dozenten-/Klassen-/Prüfungs-Modul: Schulen sind Organisationen
   (Org-Kategorie 'schule'), Dozenten führen Klassen (wie Teams),
   Studierende treten per Klassencode bei, lösen Prüfungen direkt
   im Tool und sehen freigeschaltete Berechnungsmodule + Lernmittel.

   Storage: per-Record in der Cloud (gema_sync.js), moduleKey 'schule'
     Klasse    sklasse: → gema_schule_klassen_pool_v1
     Lernmittel smat:   → gema_schule_mat_pool_v1
     Aufgabe   saufg:   → gema_schule_aufg_pool_v1   (Pool, schulweit)
     Prüfung   spruef:  → gema_schule_pruef_pool_v1  (OHNE Lösungen!)
     Lösungen  spruefl: → gema_schule_loes_pool_v1   (nur Dozenten-Seiten)
     Abgabe    sabg:    → nie global gebunden — Dozent lädt pro Prüfung
                          (Prefix 'sabg:abg_<pruefId>_'), Studierende nur
                          den eigenen Record.

   KRITISCH — Lösungs-Trennung: Der Prüfungs-Record, den Studierende
   laden, enthält KEINE Lösungen (schuleSplitPruefung strippt loesung/
   loesungBilder, antwortFelder.loesung/toleranzPct, mcOptionen.korrekt).
   Die Lösungen liegen in einem separaten spruefl:-Record, den nur die
   Dozenten-Seiten binden. Nach «Resultate veröffentlichen» (+ Option
   loesungNachPublish) lädt der Studierenden-Client die Lösung einmalig
   NUR in den Speicher (nie in localStorage).

   Alle Pools sind org-übergreifend gelesen → Writes NUR über
   GemaSync.saveRecord (nie persistCollection), Muster GemaBest.
   ============================================================ */
(function(w){
  'use strict';

  var MODULE_KEY='schule';
  var POOLS={
    klassen:   {prefix:'sklasse:', store:'gema_schule_klassen_pool_v1'},
    material:  {prefix:'smat:',    store:'gema_schule_mat_pool_v1'},
    aufgaben:  {prefix:'saufg:',   store:'gema_schule_aufg_pool_v1'},
    pruefungen:{prefix:'spruef:',  store:'gema_schule_pruef_pool_v1'},
    loesungen: {prefix:'spruefl:', store:'gema_schule_loes_pool_v1'}
  };
  var ABG_PREFIX='sabg:';
  var ABG_LOCAL='gema_schule_abg_local_v1';   // Spiegel NUR der eigenen Abgaben (Offline-Schutz während Prüfung)
  var MODS_CACHE='gema_student_mods_v1';      // Studenten-Gating-Cache (liest gema_auth.js synchron)

/*ENGINE-START*/
  // ── DOM-freie Engine (Node-testbar) ────────────────────────────────
  var SCHULE_CODE_ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ohne I,L,O,0,1

  function schuleUid(prefix){
    return (prefix||'id')+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  }
  function schuleCodeNeu(rnd){
    var r=rnd||Math.random;
    var s='';
    for(var i=0;i<6;i++)s+=SCHULE_CODE_ALPHABET[Math.floor(r()*SCHULE_CODE_ALPHABET.length)];
    return s;
  }
  function schuleCodeNorm(code){
    return String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  }

  // Deterministischer Seed aus String (für Fragen-Mischen pro Studierendem)
  function schuleSeed(str){
    var h=2166136261;
    var s=String(str||'');
    for(var i=0;i<s.length;i++){h=h^s.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
  }
  function schuleRng(seed){
    var a=seed>>>0;
    return function(){
      a|=0;a=(a+0x6D2B79F5)|0;
      var t=Math.imul(a^(a>>>15),1|a);
      t=(t+Math.imul(t^(t>>>7),61|t))^t;
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }
  // Fisher-Yates mit Seed — gleicher Seed ⇒ gleiche Reihenfolge (stabil
  // über Reloads: Seed = pruefungId + userId)
  function schuleShuffle(arr,seedStr){
    var a=(arr||[]).slice();
    var rng=schuleRng(schuleSeed(seedStr));
    for(var i=a.length-1;i>0;i--){
      var j=Math.floor(rng()*(i+1));
      var t=a[i];a[i]=a[j];a[j]=t;
    }
    return a;
  }

  // ── Noten (CH-Formel: Note = 5·P/Pmax + 1) ─────────────────────────
  function schuleNote(punkte,max,rundung){
    var m=parseFloat(max),p=parseFloat(punkte);
    if(!isFinite(m)||m<=0||!isFinite(p))return null;
    var raw=5*p/m+1;
    if(raw<1)raw=1;if(raw>6)raw=6;
    if(rundung==='halb')return Math.round(raw*2)/2;
    return Math.round(raw*10)/10; // Default: Zehntelnoten
  }
  function schuleNoteFmt(n){
    if(n==null||!isFinite(n))return '–';
    return (Math.round(n*10)/10).toFixed(1);
  }
  function schuleNoteFarbe(n){
    if(n==null)return '#64748b';
    if(n>=5)return '#16a34a';
    if(n>=4)return '#65a30d';
    if(n>=3.5)return '#d97706';
    return '#dc2626';
  }

  // ── Zeitfenster (Verlängerungen: Zusatzzeit + individuelles Fenster) ─
  function schuleFenster(pruef,userId){
    var v=(pruef&&pruef.verlaengerungen&&pruef.verlaengerungen[userId])||{};
    var start=Date.parse(v.startAm||pruef.startAm||'');
    var ende=Date.parse(v.endeAm||pruef.endeAm||'');
    if(isFinite(ende)&&v.zusatzMin)ende+=(parseFloat(v.zusatzMin)||0)*60000;
    var tol=(parseFloat(pruef.toleranzMin)||0)*60000;
    return {
      start:isFinite(start)?start:null,
      ende:isFinite(ende)?ende:null,
      toleranzEnde:isFinite(ende)?ende+tol:null
    };
  }
  // Phase aus Sicht EINES Studierenden: entwurf|geplant|laufend|toleranz|beendet
  function schulePruefPhase(pruef,userId,nowMs){
    if(!pruef)return 'entwurf';
    if(pruef.status==='entwurf')return 'entwurf';
    var f=schuleFenster(pruef,userId);
    if(f.start==null||f.ende==null)return 'entwurf';
    var now=(nowMs!=null?nowMs:Date.now());
    if(now<f.start)return 'geplant';
    if(now<=f.ende)return 'laufend';
    if(now<=f.toleranzEnde)return 'toleranz';
    return 'beendet';
  }
  // Countdown: {phase, ms} — geplant: bis Start · laufend: bis Ende ·
  // toleranz: bis Toleranz-Ende
  function schuleRest(pruef,userId,nowMs){
    var now=(nowMs!=null?nowMs:Date.now());
    var phase=schulePruefPhase(pruef,userId,now);
    var f=schuleFenster(pruef,userId);
    if(phase==='geplant')return {phase:phase,ms:f.start-now};
    if(phase==='laufend')return {phase:phase,ms:f.ende-now};
    if(phase==='toleranz')return {phase:phase,ms:f.toleranzEnde-now};
    return {phase:phase,ms:0};
  }
  function schuleFmtMs(ms){
    if(!isFinite(ms)||ms<0)ms=0;
    var s=Math.floor(ms/1000);
    var h=Math.floor(s/3600);
    var m=Math.floor((s%3600)/60);
    var sec=s%60;
    function p(x){return (x<10?'0':'')+x;}
    return h>0?(h+':'+p(m)+':'+p(sec)):(p(m)+':'+p(sec));
  }

  // ── Auto-Korrektur ─────────────────────────────────────────────────
  // MC: (richtig gewählt − falsch gewählt) / Anzahl richtige, min 0,
  // auf halbe Punkte gerundet. Single-Choice ergibt so alles-oder-nichts.
  function schuleMcPunkte(aufg,auswahl){
    var opts=(aufg&&aufg.mcOptionen)||[];
    var korrekt=opts.filter(function(o){return o&&o.korrekt;}).map(function(o){return o.id;});
    if(!korrekt.length)return 0;
    var sel=(auswahl||[]);
    var hits=0,wrong=0;
    sel.forEach(function(id){if(korrekt.indexOf(id)>=0)hits++;else wrong++;});
    var frac=Math.max(0,(hits-wrong)/korrekt.length);
    var p=(parseFloat(aufg.punkte)||0)*frac;
    return Math.round(p*2)/2;
  }
  // Zahlen-Antwortfeld mit Toleranz in % (Default 2 %)
  function schuleWertOk(feld,wert){
    if(!feld||feld.loesung==null||feld.loesung==='')return false;
    var soll=parseFloat(String(feld.loesung).replace(',','.'));
    var ist=parseFloat(String(wert==null?'':wert).replace(',','.'));
    if(!isFinite(soll)||!isFinite(ist))return false;
    var tolPct=(feld.toleranzPct==null||feld.toleranzPct==='')?2:parseFloat(feld.toleranzPct);
    if(!isFinite(tolPct))tolPct=2;
    var tol=Math.max(Math.abs(soll)*tolPct/100,1e-9);
    return Math.abs(ist-soll)<=tol;
  }
  // Vorkorrektur-Vorschlag: MC voll automatisch; Berechnungs-Zahlenfelder
  // anteilig (nur wenn Lösungswerte hinterlegt sind). aufg = Aufgabe MIT
  // Lösungen (gemergt) — läuft nur auf der Dozenten-Seite.
  function schuleAutoPunkte(aufg,antwort){
    antwort=antwort||{};
    if(aufg&&aufg.typ==='mc'){
      return {auto:true,punkte:schuleMcPunkte(aufg,antwort.mc||[])};
    }
    if(aufg&&aufg.typ==='berechnung'){
      var felder=(aufg.antwortFelder||[]).filter(function(f){return f&&f.loesung!=null&&f.loesung!=='';});
      if(!felder.length)return {auto:false,punkte:null};
      var ok=0;
      felder.forEach(function(f){if(schuleWertOk(f,(antwort.werte||{})[f.id]))ok++;});
      var p=(parseFloat(aufg.punkte)||0)*ok/felder.length;
      return {auto:true,punkte:Math.round(p*2)/2,okFelder:ok,totalFelder:felder.length};
    }
    return {auto:false,punkte:null};
  }

  // ── Prüfungs-Split: öffentlicher Record OHNE Lösungen ──────────────
  function schuleSplitPruefung(full){
    var pub=JSON.parse(JSON.stringify(full||{}));
    var loes={id:pub.id,orgId:pub.orgId,aufgaben:{}};
    pub.aufgaben=(pub.aufgaben||[]).map(function(a){
      var la={loesung:a.loesung||'',loesungBilder:a.loesungBilder||[],felder:{},mcKorrekt:{}};
      (a.antwortFelder||[]).forEach(function(f){
        if(f&&f.id!=null)la.felder[f.id]={loesung:(f.loesung==null?'':f.loesung),toleranzPct:(f.toleranzPct==null?'':f.toleranzPct)};
      });
      (a.mcOptionen||[]).forEach(function(o){
        if(o&&o.id!=null)la.mcKorrekt[o.id]=!!o.korrekt;
      });
      loes.aufgaben[a.id]=la;
      var pa=JSON.parse(JSON.stringify(a));
      delete pa.loesung;delete pa.loesungBilder;
      pa.antwortFelder=(pa.antwortFelder||[]).map(function(f){
        var c=JSON.parse(JSON.stringify(f||{}));
        delete c.loesung;delete c.toleranzPct;
        return c;
      });
      pa.mcOptionen=(pa.mcOptionen||[]).map(function(o){
        var c=JSON.parse(JSON.stringify(o||{}));
        delete c.korrekt;
        return c;
      });
      return pa;
    });
    return {pub:pub,loes:loes};
  }
  function schuleMergePruefung(pub,loes){
    var full=JSON.parse(JSON.stringify(pub||{}));
    var map=(loes&&loes.aufgaben)||{};
    full.aufgaben=(full.aufgaben||[]).map(function(a){
      var la=map[a.id];
      if(!la)return a;
      a.loesung=la.loesung||'';
      a.loesungBilder=la.loesungBilder||[];
      (a.antwortFelder||[]).forEach(function(f){
        var lf=la.felder&&la.felder[f.id];
        if(lf){f.loesung=lf.loesung;f.toleranzPct=lf.toleranzPct;}
      });
      (a.mcOptionen||[]).forEach(function(o){
        if(la.mcKorrekt&&Object.prototype.hasOwnProperty.call(la.mcKorrekt,o.id))o.korrekt=!!la.mcKorrekt[o.id];
      });
      return a;
    });
    return full;
  }

  // ── Punkte / Fortschritt / Notenspiegel ────────────────────────────
  function schuleTotalPunkte(pruef){
    var t=0;
    ((pruef&&pruef.aufgaben)||[]).forEach(function(a){t+=parseFloat(a.punkte)||0;});
    return Math.round(t*100)/100;
  }
  function schuleAntwortLeer(ant){
    if(!ant)return true;
    if(ant.text&&String(ant.text).trim())return false;
    if(ant.mc&&ant.mc.length)return false;
    if(ant.dateien&&ant.dateien.length)return false;
    if(ant.werte){for(var k in ant.werte){if(ant.werte[k]!=null&&String(ant.werte[k]).trim()!=='')return false;}}
    return true;
  }
  function schuleFortschritt(pruef,abgabe){
    var aufg=(pruef&&pruef.aufgaben)||[];
    var beantwortet=0;
    aufg.forEach(function(a){
      if(!schuleAntwortLeer(abgabe&&abgabe.antworten&&abgabe.antworten[a.id]))beantwortet++;
    });
    return {beantwortet:beantwortet,total:aufg.length};
  }
  function schuleAbgabePunkte(pruef,abgabe){
    var t=0,offen=0;
    ((pruef&&pruef.aufgaben)||[]).forEach(function(a){
      var k=abgabe&&abgabe.korrektur&&abgabe.korrektur[a.id];
      if(k&&k.punkte!=null&&k.punkte!=='')t+=parseFloat(k.punkte)||0;
      else offen++;
    });
    return {punkte:Math.round(t*100)/100,offen:offen};
  }
  function schuleNotenspiegel(noten){
    var arr=(noten||[]).filter(function(n){return n!=null&&isFinite(n);});
    if(!arr.length)return {n:0,avg:null,min:null,max:null,bestanden:0};
    var sum=0,min=99,max=0,best=0;
    arr.forEach(function(n){sum+=n;if(n<min)min=n;if(n>max)max=n;if(n>=4)best++;});
    return {n:arr.length,avg:Math.round(sum/arr.length*100)/100,min:min,max:max,bestanden:best};
  }
  function schuleAbgabeId(pruefId,userId){
    return 'abg_'+pruefId+'__'+userId;
  }
/*ENGINE-END*/

  // ── Umgebung ───────────────────────────────────────────────────────
  function _sync(){return (typeof w.GemaSync!=='undefined')?w.GemaSync:null;}
  function _auth(){return (typeof w.GemaAuth!=='undefined')?w.GemaAuth:null;}
  function _user(){var a=_auth();try{return (a&&a.getCurrentUser())||null;}catch(e){return null;}}

  // ── Serverzeit (KRITISCH für Prüfungen) ────────────────────────────
  // Die Gerätezeit der Studierenden ist nicht vertrauenswürdig (Uhr
  // verstellen = mehr Prüfungszeit). Der Offset zur Serverzeit wird aus
  // dem HTTP-Date-Header der Cloud bestimmt (sekundengenau, NTP-basiert
  // — für Prüfungsfenster mehr als genau genug): serverMs ≈ Date-Header
  // + halbe Antwortzeit. Kandidaten: Supabase direkt (bzw. was
  // GemaSync.SB_URL gerade ist — im Proxy-Modus bereits /sb) und
  // explizit der Same-Origin-Proxy /sb/ (Header dort IMMER lesbar,
  // CORS-frei, und sw.js cached /sb/-Pfade nie). Mehrere Messungen,
  // die mit der kleinsten Laufzeit gewinnt.
  // ALLE Prüfungs-Zeitentscheide laufen über jetzt()/jetztIso() —
  // Countdown, Phasen, verspaetet-Marker, Auto-Abgabe, Zeitstempel.
  var _zeitOffset=0;
  var _zeitSynced=false;
  var _zeitLastSync=0;
  var _zeitInflight=null;
  function _zeitProbe(url){
    var t0=Date.now();
    return fetch(url,{method:'HEAD',cache:'no-store'}).then(function(r){
      var t1=Date.now();
      var d=r.headers.get('date');
      var ms=d?Date.parse(d):NaN;
      if(!isFinite(ms))throw new Error('kein Date-Header lesbar');
      var rtt=t1-t0;
      if(rtt>15000)throw new Error('Antwortzeit zu gross');
      // Date-Header ist sekundengenau → +500 ms = Mitte der Sekunde
      return {offset:(ms+500)-(t0+rtt/2),rtt:rtt};
    });
  }
  function syncZeit(force){
    // Läuft bereits eine Messung, hängen sich ALLE Aufrufer an dieselbe —
    // sonst entschied z.B. der Deep-Link-Check mit noch ungesyncter Zeit.
    if(_zeitInflight)return _zeitInflight;
    if(!force&&Date.now()-_zeitLastSync<60000)return Promise.resolve(_zeitSynced);
    _zeitLastSync=Date.now();
    var s=_sync();
    var urls=[];
    try{if(s&&s.SB_URL)urls.push(String(s.SB_URL)+'/rest/v1/');}catch(e){}
    try{
      if(w.location&&w.location.origin&&w.location.origin.indexOf('http')===0){
        var proxy=w.location.origin+'/sb/rest/v1/';
        if(urls.indexOf(proxy)<0)urls.push(proxy);
      }
    }catch(e){}
    if(!urls.length)return Promise.resolve(_zeitSynced);
    var results=[];
    var chain=Promise.resolve();
    urls.forEach(function(u){
      chain=chain.then(function(){
        var bust=(u.indexOf('?')<0?'?':'&')+'zeitprobe='+Date.now().toString(36);
        return _zeitProbe(u+bust).then(function(r){results.push(r);}).catch(function(){});
      });
    });
    _zeitInflight=chain.then(function(){
      _zeitInflight=null;
      if(!results.length)return _zeitSynced; // Fehlschlag: letzten Stand behalten
      results.sort(function(a,b){return a.rtt-b.rtt;});
      _zeitOffset=results[0].offset;
      _zeitSynced=true;
      return true;
    });
    return _zeitInflight;
  }
  function jetzt(){return Date.now()+_zeitOffset;}
  function jetztIso(){return new Date(jetzt()).toISOString();}
  function zeitStatus(){return {synced:_zeitSynced,offsetMs:Math.round(_zeitOffset)};}

  function _now(){return jetztIso();}
  function _readPool(store){
    var s=_sync();
    try{if(s&&s.getCached)return s.getCached(store)||[];}catch(e){}
    try{var a=JSON.parse(localStorage.getItem(store)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}
  }
  function _writePool(store,arr){
    try{localStorage.setItem(store,JSON.stringify(arr));}catch(e){}
  }
  function _emit(){try{w.dispatchEvent(new CustomEvent('gema-schule-changed'));}catch(e){}}

  // ── PreBoot-Journal (KRITISCH — Muster _plPreBoot in pm_plaene) ──────
  // Der Boot-Pull (bindCollection) läuft asynchron, die Seite ist längst
  // bedienbar. Legte jemand im Boot-Fenster eine Klasse an (Seite öffnen →
  // sofort «＋ Neue Klasse»), überschrieb der ÄLTERE Cloud-Snapshot beim
  // Eintreffen den lokalen Pool: die frische Klasse verschwand still, und
  // jede weitere Eingabe im offenen Detail lief über klasseById(null) ins
  // Leere — «Namen geben und Module freischalten geht, aber speichern kann
  // man sie nicht». Darum werden alle Writes bis zum Abschluss des Binds
  // journal't und nach JEDEM Pool-Bind wieder ÜBER den frisch geschriebenen
  // Cache gelegt (idempotent; der Cloud-Push lief ohnehin schon bzw. liegt
  // in der GemaSync-Outbox).
  var _preBoot=[],_bindStarted=false;
  function _pbNote(store,rec,delId){
    if(!_bindStarted||_cloudLoaded)return;
    if(_preBoot.length>400)return; // Notbremse — bind hängt, Pool bleibt eh lokal
    _preBoot.push({store:store,rec:rec?JSON.parse(JSON.stringify(rec)):null,del:delId||null});
  }
  function _pbApply(store){
    var arr=null;
    _preBoot.forEach(function(op){
      if(op.store!==store)return;
      if(arr===null)arr=_readPool(store);
      if(op.del){arr=arr.filter(function(x){return !x||x.id!==op.del;});}
      else if(op.rec){
        var i=arr.findIndex(function(x){return x&&x.id===op.rec.id;});
        if(i>=0)arr[i]=op.rec;else arr.unshift(op.rec);
      }
    });
    if(arr!==null)_writePool(store,arr);
  }

  function _persist(pool,rec){
    var arr=_readPool(pool.store);
    var i=arr.findIndex(function(x){return x&&x.id===rec.id;});
    if(i>=0)arr[i]=rec;else arr.unshift(rec);
    _writePool(pool.store,arr);
    _pbNote(pool.store,rec,null);
    var s=_sync();
    var pr=Promise.resolve({ok:false});
    // Cloud-Fehler nie in die UI-Kette durchreichen — der lokale Cache ist
    // aktualisiert, das Offline-Banner von GemaSync zeigt den Zustand an.
    if(s&&s.saveRecord)pr=s.saveRecord(MODULE_KEY,pool.prefix+rec.id,rec).catch(function(e){
      try{console.warn('[GemaSchule] Cloud-Save fehlgeschlagen ('+pool.prefix+rec.id+')',e);}catch(_){}
      return {ok:false,offline:true};
    });
    _emit();
    return pr;
  }
  function _remove(pool,id){
    var arr=_readPool(pool.store).filter(function(x){return !x||x.id!==id;});
    _writePool(pool.store,arr);
    _pbNote(pool.store,null,id);
    var s=_sync();
    var pr=Promise.resolve();
    if(s&&s.deleteRecord)pr=s.deleteRecord(MODULE_KEY,pool.prefix+id).catch(function(){});
    _emit();
    return pr;
  }
  function _notify(opts){
    try{if(typeof w.GemaNotify!=='undefined'&&w.GemaNotify.push)w.GemaNotify.push(opts);}catch(e){}
  }

  // ── Bootstrap (Stale-while-revalidate) ─────────────────────────────
  var _cloudLoaded=false;
  var _readyResolve;
  var _ready=new Promise(function(res){_readyResolve=res;});
  function bind(opts){
    opts=opts||{};
    syncZeit(); // Serverzeit-Abgleich parallel anstossen (blockiert nichts)
    var s=_sync();
    if(!s||!s.bindCollection){_cloudLoaded=true;_readyResolve();return Promise.resolve();}
    _bindStarted=true;
    var jobs=[];
    ['klassen','material','aufgaben','pruefungen'].forEach(function(k){
      if(opts[k]===false)return;
      jobs.push(s.bindCollection(MODULE_KEY,POOLS[k].store,POOLS[k].prefix,'id')
        .then(function(){_pbApply(POOLS[k].store);})
        .catch(function(){}));
    });
    // Lösungen NUR auf Dozenten-Seiten binden (nie in Studierenden-Storage)
    if(opts.loesungen===true){
      jobs.push(s.bindCollection(MODULE_KEY,POOLS.loesungen.store,POOLS.loesungen.prefix,'id')
        .then(function(){_pbApply(POOLS.loesungen.store);})
        .catch(function(){}));
    }
    return Promise.all(jobs).then(function(){
      // Journal ein letztes Mal über ALLE Pools legen (idempotent), dann aus.
      Object.keys(POOLS).forEach(function(k){_pbApply(POOLS[k].store);});
      _preBoot.length=0;
      _cloudLoaded=true;_readyResolve();_emit();
    });
  }

  // ── Scoping / Reads ────────────────────────────────────────────────
  function _hatRolle(u,rid){return !!(u&&u.roleIds&&u.roleIds.indexOf(rid)>=0);}
  function istAdmin(){return _hatRolle(_user(),'role_admin');}
  function istDozent(){var u=_user();return _hatRolle(u,'role_dozent')||istAdmin();}
  function istStudent(){return _hatRolle(_user(),'role_student');}

  function alleKlassen(){return _readPool(POOLS.klassen.store).filter(Boolean);}
  // Dozent: Klassen der eigenen Org (oder in denen er als Dozent eingetragen
  // ist) — inkl. archivierter, die UI filtert selbst
  function klassenForDozent(){
    var u=_user();if(!u)return [];
    return alleKlassen().filter(function(k){
      return k.orgId===u.orgId||(k.dozentIds||[]).indexOf(u.id)>=0;
    });
  }
  // Studierende: nur Klassen, in denen sie Mitglied sind
  function klassenForStudent(){
    var u=_user();if(!u)return [];
    return alleKlassen().filter(function(k){
      return !k.archiviert&&(k.studentIds||[]).indexOf(u.id)>=0;
    });
  }
  function meineKlassen(){
    if(istDozent())return klassenForDozent();
    return klassenForStudent();
  }
  function klasseById(id){
    return alleKlassen().find(function(k){return k.id===id;})||null;
  }
  function findKlasseByCode(code){
    var c=schuleCodeNorm(code);
    if(!c)return null;
    return alleKlassen().find(function(k){return !k.archiviert&&schuleCodeNorm(k.code)===c;})||null;
  }

  function materialForKlasse(klasseId){
    return _readPool(POOLS.material.store).filter(function(m){return m&&m.klasseId===klasseId;})
      .sort(function(a,b){return String(b.erstelltAm||'').localeCompare(String(a.erstelltAm||''));});
  }

  // Aufgaben-Pool: schulweit (Org), privat-markierte nur für den Ersteller
  function aufgabenPool(){
    var u=_user();if(!u)return [];
    return _readPool(POOLS.aufgaben.store).filter(function(a){
      if(!a||a.orgId!==u.orgId)return false;
      if(a.privat&&a.erstelltVon!==u.id&&!istAdmin())return false;
      return true;
    });
  }
  function aufgabeById(id){
    return _readPool(POOLS.aufgaben.store).find(function(a){return a&&a.id===id;})||null;
  }

  function pruefungenForDozent(){
    var u=_user();if(!u)return [];
    return _readPool(POOLS.pruefungen.store).filter(function(p){return p&&p.orgId===u.orgId;});
  }
  function pruefungenForStudent(){
    var u=_user();if(!u)return [];
    var kids={};klassenForStudent().forEach(function(k){kids[k.id]=1;});
    return _readPool(POOLS.pruefungen.store).filter(function(p){
      return p&&kids[p.klasseId]&&p.status!=='entwurf';
    });
  }
  function pruefungById(id){
    return _readPool(POOLS.pruefungen.store).find(function(p){return p&&p.id===id;})||null;
  }
  function loesungCached(pruefId){
    return _readPool(POOLS.loesungen.store).find(function(l){return l&&l.id===pruefId;})||null;
  }
  // Volle Prüfung (mit Lösungen) — nur Dozenten-Seiten (Lösungs-Pool gebunden)
  function pruefungFull(id){
    var pub=pruefungById(id);
    if(!pub)return null;
    var loes=loesungCached(id);
    return loes?schuleMergePruefung(pub,loes):JSON.parse(JSON.stringify(pub));
  }
  // Lösung on-demand laden (Studierende nach Publish) — NUR in den Speicher
  function loadLoesungMem(pruefId){
    var s=_sync();
    if(!s||!s.loadRecord)return Promise.resolve(null);
    return s.loadRecord(MODULE_KEY,POOLS.loesungen.prefix+pruefId).then(function(r){
      return (r&&r.data)||null;
    }).catch(function(){return null;});
  }

  // ── Writes ─────────────────────────────────────────────────────────
  function saveKlasse(k){
    var u=_user();
    if(!k.id)k.id=schuleUid('kl');
    if(!k.orgId)k.orgId=u?u.orgId:'';
    if(!k.code)k.code=schuleCodeNeu();
    if(!k.erstelltAm){k.erstelltAm=_now();k.erstelltVon=u?u.id:'';}
    if(!k.dozentIds||!k.dozentIds.length)k.dozentIds=u?[u.id]:[];
    k.geaendertAm=_now();
    return _persist(POOLS.klassen,k);
  }
  function deleteKlasse(id){return _remove(POOLS.klassen,id);}

  function saveMaterial(m){
    var u=_user();
    if(!m.id)m.id=schuleUid('mat');
    if(!m.orgId)m.orgId=u?u.orgId:'';
    if(!m.erstelltAm){m.erstelltAm=_now();m.von=u?u.id:'';m.vonName=u?(u.name||u.username):'';}
    return _persist(POOLS.material,m);
  }
  function deleteMaterial(id){return _remove(POOLS.material,id);}

  function saveAufgabe(a){
    var u=_user();
    if(!a.id)a.id=schuleUid('aufg');
    if(!a.orgId)a.orgId=u?u.orgId:'';
    if(!a.erstelltAm){a.erstelltAm=_now();a.erstelltVon=u?u.id:'';a.erstelltVonName=u?(u.name||u.username):'';}
    a.geaendertAm=_now();
    return _persist(POOLS.aufgaben,a);
  }
  function deleteAufgabe(id){return _remove(POOLS.aufgaben,id);}
  // «Letzte Verwendung» am Pool-Item stempeln (beim Aufschalten der Prüfung)
  function touchAufgabenVerwendet(poolIds,pruefTitel){
    var ids=(poolIds||[]).filter(Boolean);
    var arr=_readPool(POOLS.aufgaben.store);
    ids.forEach(function(pid){
      var a=arr.find(function(x){return x&&x.id===pid;});
      if(a){
        a.zuletztVerwendetAm=_now();
        a.zuletztVerwendetIn=pruefTitel||'';
        _persist(POOLS.aufgaben,a);
      }
    });
  }

  // Prüfung speichern: automatisch splitten (pub ohne Lösungen + spruefl-Record)
  function savePruefung(full){
    var u=_user();
    if(!full.id)full.id=schuleUid('pruef');
    if(!full.orgId)full.orgId=u?u.orgId:'';
    if(!full.erstelltAm){full.erstelltAm=_now();full.erstelltVon=u?u.id:'';full.erstelltVonName=u?(u.name||u.username):'';}
    full.geaendertAm=_now();
    var sp=schuleSplitPruefung(full);
    var p1=_persist(POOLS.pruefungen,sp.pub);
    var p2=_persist(POOLS.loesungen,sp.loes);
    return Promise.all([p1,p2]).then(function(){return full;});
  }
  function deletePruefung(id){
    var jobs=[_remove(POOLS.pruefungen,id),_remove(POOLS.loesungen,id)];
    // Abgaben der Prüfung mitlöschen (per-Record)
    var s=_sync();
    if(s&&s.loadCollection&&s.deleteRecord){
      jobs.push(s.loadCollection(MODULE_KEY,ABG_PREFIX+'abg_'+id+'__').then(function(rows){
        return Promise.all((rows||[]).map(function(r){
          return s.deleteRecord(MODULE_KEY,r.key).catch(function(){});
        }));
      }).catch(function(){}));
    }
    return Promise.all(jobs);
  }

  // ── Abgaben ────────────────────────────────────────────────────────
  function _abgLocalRead(){
    try{var o=JSON.parse(localStorage.getItem(ABG_LOCAL)||'{}');return o&&typeof o==='object'?o:{};}catch(e){return {};}
  }
  function _abgLocalWrite(map){
    try{localStorage.setItem(ABG_LOCAL,JSON.stringify(map));}catch(e){}
  }
  // Eigene Abgabe laden: Cloud + lokaler Spiegel — der NEUERE Stand gewinnt
  // (Offline-Schutz: Antworten überleben Netzausfall/Reload während der Prüfung)
  function loadMeineAbgabe(pruefId){
    var u=_user();
    if(!u)return Promise.resolve(null);
    var id=schuleAbgabeId(pruefId,u.id);
    var local=_abgLocalRead()[id]||null;
    var s=_sync();
    if(!s||!s.loadRecord)return Promise.resolve(local);
    return s.loadRecord(MODULE_KEY,ABG_PREFIX+id).then(function(r){
      var cloud=(r&&r.data)||null;
      if(cloud&&local){
        var cl=Date.parse(cloud.letzteAktivitaet||cloud.abgegebenAm||0)||0;
        var lo=Date.parse(local.letzteAktivitaet||local.abgegebenAm||0)||0;
        return lo>cl?local:cloud;
      }
      return cloud||local;
    }).catch(function(){return local;});
  }
  // Abgabe speichern: IMMER zuerst lokal (verlustfrei), Cloud best-effort
  function saveAbgabe(abg){
    abg.letzteAktivitaet=_now();
    var map=_abgLocalRead();
    map[abg.id]=abg;
    // Spiegel klein halten: nur die letzten 10 eigenen Abgaben
    var keys=Object.keys(map);
    if(keys.length>10){
      keys.sort(function(a,b){return String((map[a]||{}).letzteAktivitaet||'').localeCompare(String((map[b]||{}).letzteAktivitaet||''));});
      while(keys.length>10){delete map[keys[0]];keys.shift();}
    }
    _abgLocalWrite(map);
    var s=_sync();
    if(s&&s.saveRecord)return s.saveRecord(MODULE_KEY,ABG_PREFIX+abg.id,abg);
    return Promise.reject(new Error('offline'));
  }
  // Dozent: alle Abgaben einer Prüfung (Live-Monitor + Korrektur)
  function loadAbgaben(pruefId){
    var s=_sync();
    if(!s||!s.loadCollection)return Promise.resolve([]);
    return s.loadCollection(MODULE_KEY,ABG_PREFIX+'abg_'+pruefId+'__').then(function(rows){
      return (rows||[]).map(function(r){return r.data;}).filter(Boolean);
    }).catch(function(){return [];});
  }
  function saveAbgabeDozent(abg){
    var s=_sync();
    if(s&&s.saveRecord)return s.saveRecord(MODULE_KEY,ABG_PREFIX+abg.id,abg);
    return Promise.reject(new Error('offline'));
  }

  // ── Studenten-Gating-Cache (liest gema_auth.js synchron) ──────────
  // {userId, mods:[moduleKeys aus Klassen], exams:{moduleKey:untilTs}, ts}
  function refreshStudentMods(){
    var u=_user();if(!u)return;
    if(!_hatRolle(u,'role_student'))return;
    var mods={};
    klassenForStudent().forEach(function(k){
      (k.module||[]).forEach(function(m){mods[m]=1;});
    });
    var cur=null;
    try{cur=JSON.parse(localStorage.getItem(MODS_CACHE)||'null');}catch(e){}
    var exams=(cur&&cur.userId===u.id&&cur.exams)||{};
    // abgelaufene Prüfungs-Freischaltungen aufräumen
    var cleaned={};
    Object.keys(exams).forEach(function(k){if(exams[k]>Date.now())cleaned[k]=exams[k];});
    try{
      localStorage.setItem(MODS_CACHE,JSON.stringify({userId:u.id,mods:Object.keys(mods),exams:cleaned,ts:Date.now()}));
    }catch(e){}
  }
  // Während einer laufenden Prüfung: die pro Aufgabe freigeschalteten
  // Berechnungstools bis Prüfungsende (+Toleranz) zusätzlich erlauben
  function addExamTools(tools,untilTs){
    var u=_user();if(!u||!tools||!tools.length)return;
    var cur=null;
    try{cur=JSON.parse(localStorage.getItem(MODS_CACHE)||'null');}catch(e){}
    if(!cur||cur.userId!==u.id)cur={userId:u.id,mods:[],exams:{},ts:Date.now()};
    cur.exams=cur.exams||{};
    tools.forEach(function(t){
      if(!cur.exams[t]||cur.exams[t]<untilTs)cur.exams[t]=untilTs;
    });
    cur.ts=Date.now();
    try{localStorage.setItem(MODS_CACHE,JSON.stringify(cur));}catch(e){}
  }

  // ── Berechnungsmodule (für Freischaltung + Tool-Buttons) ───────────
  var CALC_CATS=['Sanitärberechnungen','Heizungsberechnungen','Lüftungsberechnungen','Brandschutz'];
  function calcModule(){
    var a=_auth();
    if(!a||!a.getModules)return [];
    return (a.getModules()||[]).filter(function(m){return CALC_CATS.indexOf(m.cat)>=0;});
  }
  function moduleUrl(key){
    var a=_auth();
    var fm=(a&&a.getFileMap)?a.getFileMap():null;
    if(fm){
      for(var f in fm){if(fm[f]===key)return f+'.html';}
    }
    return null;
  }
  function moduleLabel(key){
    var a=_auth();
    var m=(a&&a.getModules)?(a.getModules()||[]).find(function(x){return x.key===key;}):null;
    return m?m.label:key;
  }

  // ── Datei-Upload (Bilder + PDF → GemaStorage, Base64-Fallback) ─────
  function _fileToDataUrl(file){
    return new Promise(function(res,rej){
      var r=new FileReader();
      r.onload=function(){res(r.result);};
      r.onerror=function(){rej(new Error('Datei konnte nicht gelesen werden'));};
      r.readAsDataURL(file);
    });
  }
  function _resizeImage(dataUrl,maxPx,quality){
    return new Promise(function(res){
      var img=new Image();
      img.onload=function(){
        var w0=img.width,h0=img.height;
        var scale=Math.min(1,(maxPx||1600)/Math.max(w0,h0));
        if(scale>=1&&dataUrl.indexOf('image/jpeg')>=0){res(dataUrl);return;}
        var c=document.createElement('canvas');
        c.width=Math.round(w0*scale);c.height=Math.round(h0*scale);
        var ctx=c.getContext('2d');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
        ctx.drawImage(img,0,0,c.width,c.height);
        res(c.toDataURL('image/jpeg',quality||0.85));
      };
      img.onerror=function(){res(dataUrl);};
      img.src=dataUrl;
    });
  }
  // → Promise<{name,type,size,url?|dataUrl?}> — url wenn Storage-Upload klappt
  function uploadDatei(file,pfad,opts){
    opts=opts||{};
    var isImg=/^image\//.test(file.type);
    var isPdf=file.type==='application/pdf';
    if(!isImg&&!isPdf)return Promise.reject(new Error('Nur Bilder und PDF sind möglich (Excel etc. bitte als PDF exportieren).'));
    var maxMb=opts.maxMb||10;
    if(file.size>maxMb*1024*1024)return Promise.reject(new Error('Datei zu gross (max. '+maxMb+' MB).'));
    return _fileToDataUrl(file).then(function(dataUrl){
      return isImg?_resizeImage(dataUrl,opts.maxPx||1600,0.85):dataUrl;
    }).then(function(dataUrl){
      var meta={name:file.name,type:isPdf?'application/pdf':'image/jpeg',size:file.size};
      if(typeof w.GemaStorage!=='undefined'&&w.GemaStorage.uploadDataUrl){
        return w.GemaStorage.uploadDataUrl(dataUrl,pfad).then(function(r){
          meta.url=r.url;return meta;
        }).catch(function(){
          // Fallback Base64 nur, wenn der Record dadurch nicht explodiert
          if(dataUrl.length<=2.5*1024*1024){meta.dataUrl=dataUrl;return meta;}
          throw new Error('Upload fehlgeschlagen und Datei zu gross für Fallback.');
        });
      }
      if(dataUrl.length<=2.5*1024*1024){meta.dataUrl=dataUrl;return meta;}
      return Promise.reject(new Error('Cloud-Speicher nicht verfügbar.'));
    });
  }
  function dateiSrc(d){return d?(d.url||d.dataUrl||''):'';}

  // ── Notifikationen ─────────────────────────────────────────────────
  function notifyKlasse(klasse,opts){
    if(!klasse)return;
    var abs=_user();
    (klasse.studentIds||[]).forEach(function(uid){
      if(abs&&uid===abs.id)return;
      _notify(Object.assign({empfaengerUserId:uid,modul:'schule'},opts));
    });
  }
  function notifyDozenten(klasse,opts){
    if(!klasse)return;
    var abs=_user();
    (klasse.dozentIds||[]).forEach(function(uid){
      if(abs&&uid===abs.id)return;
      _notify(Object.assign({empfaengerUserId:uid,modul:'schule'},opts));
    });
  }

  // Erinnerungs-Scan (Studierende): Prüfung startet in < 24 h → 1×/Tag melden
  function scanErinnerungen(){
    var u=_user();if(!u||!istStudent())return;
    var lockKey='gema_schule_notif_lock_v1';
    var lock={};
    try{lock=JSON.parse(localStorage.getItem(lockKey)||'{}')||{};}catch(e){}
    var today=new Date().toISOString().slice(0,10);
    var changed=false;
    pruefungenForStudent().forEach(function(p){
      var f=schuleFenster(p,u.id);
      if(!f.start)return;
      var dt=f.start-jetzt();
      if(dt<=0||dt>24*3600*1000)return;
      var k=p.id+'_'+u.id;
      if(lock[k]===today)return;
      lock[k]=today;changed=true;
      _notify({
        eventKey:'schule_pruefung_erinnerung',empfaengerUserId:u.id,modul:'schule',typ:'aktion',
        titel:'Prüfung morgen: '+(p.titel||''),
        text:'Beginn '+new Date(f.start).toLocaleString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' Uhr.',
        link:'ab_pruefung_live.html?p='+p.id
      });
    });
    if(changed){try{localStorage.setItem(lockKey,JSON.stringify(lock));}catch(e){}}
  }

  // ── Format-Helper ──────────────────────────────────────────────────
  function fmtDatum(iso){
    if(!iso)return '–';
    var d=new Date(iso);
    if(isNaN(d))return '–';
    return d.toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric'});
  }
  function fmtZeit(iso){
    if(!iso)return '–';
    var d=new Date(iso);
    if(isNaN(d))return '–';
    return d.toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+d.toLocaleTimeString('de-CH',{hour:'2-digit',minute:'2-digit'});
  }
  function fmtPunkte(p){
    var n=parseFloat(p);
    if(!isFinite(n))return '0';
    return String(Math.round(n*100)/100);
  }

  // ── Public API ─────────────────────────────────────────────────────
  w.GemaSchule={
    MODULE_KEY:MODULE_KEY,POOLS:POOLS,ABG_PREFIX:ABG_PREFIX,
    ready:_ready,bind:bind,
    get cloudLoaded(){return _cloudLoaded;},
    // Serverzeit
    jetzt:jetzt,jetztIso:jetztIso,syncZeit:syncZeit,zeitStatus:zeitStatus,
    // Engine
    uid:schuleUid,codeNeu:schuleCodeNeu,codeNorm:schuleCodeNorm,
    seed:schuleSeed,shuffle:schuleShuffle,
    note:schuleNote,noteFmt:schuleNoteFmt,noteFarbe:schuleNoteFarbe,
    fenster:schuleFenster,phase:schulePruefPhase,rest:schuleRest,fmtMs:schuleFmtMs,
    mcPunkte:schuleMcPunkte,wertOk:schuleWertOk,autoPunkte:schuleAutoPunkte,
    splitPruefung:schuleSplitPruefung,mergePruefung:schuleMergePruefung,
    totalPunkte:schuleTotalPunkte,antwortLeer:schuleAntwortLeer,
    fortschritt:schuleFortschritt,abgabePunkte:schuleAbgabePunkte,
    notenspiegel:schuleNotenspiegel,abgabeId:schuleAbgabeId,
    // Rollen
    istAdmin:istAdmin,istDozent:istDozent,istStudent:istStudent,
    // Reads
    alleKlassen:alleKlassen,meineKlassen:meineKlassen,
    klassenForDozent:klassenForDozent,klassenForStudent:klassenForStudent,
    klasseById:klasseById,findKlasseByCode:findKlasseByCode,
    materialForKlasse:materialForKlasse,
    aufgabenPool:aufgabenPool,aufgabeById:aufgabeById,
    pruefungenForDozent:pruefungenForDozent,pruefungenForStudent:pruefungenForStudent,
    pruefungById:pruefungById,pruefungFull:pruefungFull,loadLoesungMem:loadLoesungMem,
    // Writes
    saveKlasse:saveKlasse,deleteKlasse:deleteKlasse,
    saveMaterial:saveMaterial,deleteMaterial:deleteMaterial,
    saveAufgabe:saveAufgabe,deleteAufgabe:deleteAufgabe,touchAufgabenVerwendet:touchAufgabenVerwendet,
    savePruefung:savePruefung,deletePruefung:deletePruefung,
    // Abgaben
    loadMeineAbgabe:loadMeineAbgabe,saveAbgabe:saveAbgabe,
    loadAbgaben:loadAbgaben,saveAbgabeDozent:saveAbgabeDozent,
    // Gating
    refreshStudentMods:refreshStudentMods,addExamTools:addExamTools,
    // Module
    CALC_CATS:CALC_CATS,calcModule:calcModule,moduleUrl:moduleUrl,moduleLabel:moduleLabel,
    // Dateien
    uploadDatei:uploadDatei,dateiSrc:dateiSrc,
    // Notify
    notifyKlasse:notifyKlasse,notifyDozenten:notifyDozenten,scanErinnerungen:scanErinnerungen,
    // Format
    fmtDatum:fmtDatum,fmtZeit:fmtZeit,fmtPunkte:fmtPunkte
  };

})(window);
