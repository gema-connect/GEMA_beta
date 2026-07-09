/*  gema_abo_api.js — Abo-, Preis- & Token-System (GemaAbo)
    ─────────────────────────────────────────────────────────
    Zentrale API für die GEMA-Monetarisierung:
      • Preiskonfiguration (Pläne pro Rollengruppe, Token-Aktionen,
        Hersteller-Gebühren, Abrechnungsregeln) — EIN Cloud-Record
        `abocfg:main`, gepflegt im Admin-Modul sys_abos.html.
      • Abonnemente pro Org/Person — per-Record `abosub:*`
        (Pool gema_abo_sub_pool_v1, org-übergreifend → NUR saveRecord,
        NIE persistCollection).
      • Token-Ledger pro User+Monat — per-Record `abotok:*`
        (Pool gema_abo_tok_pool_v1).
    Konsumenten: sys_preise.html (Preisseite/Checkout),
    sys_abos.html (Admin), künftig Berechnungs-/PM-Module via
    GemaAbo.charge(aktionId).

    Preis-Engine im ENGINE-START…ENGINE-END-Block (DOM-frei, Node-testbar).
*/
(function(w){
  'use strict';

  var MODULE_KEY   = 'abos';
  var CFG_KEY      = 'abocfg:main';
  var CFG_CACHE    = 'gema_abo_cfg_v1';
  var SUB_PREFIX   = 'abosub:';
  var SUB_CACHE    = 'gema_abo_sub_pool_v1';
  var TOK_PREFIX   = 'abotok:';
  var TOK_CACHE    = 'gema_abo_tok_pool_v1';
  var WARN_LOCK    = 'gema_abo_warn_lock_v1';

  /*ENGINE-START*/

  // ── Default-Preispolitik (Startwerte nach Preisblatt Robin 07/2026) ──
  // Alle Werte werden im Admin (sys_abos.html) gepflegt; gespeicherte
  // Config wird per aboDeepMerge über diese Defaults gelegt (neue Felder
  // erscheinen so auch in bestehenden Installationen).
  var ABO_DEFAULT_CFG = {
    version: 1,
    abrechnung: {
      waehrung: 'CHF',
      mwstPct: 8.1,
      jahresrabattPct: 10,
      trialTage: 14,
      kuendigungsfristTage: 30,
      zahlungsfristTage: 30
    },
    gratis: {
      tokenBudgetMonat: 500,
      reset: 'monatlich',          // 'monatlich' | 'einmalig'
      geltung: 'nur_gratis',       // 'nur_gratis' | 'alle' (auch Bezahl-Abos verbrauchen Tokens)
      limitVerhalten: 'hart',      // 'hart' (Aktion blockiert) | 'weich' (nur Warnung)
      warnschwellePct: 80,
      speicherGb: 0.5,
      anfragenTag: 500
    },
    tokenAktionen: [
      {id:'berechnung_neu',   label:'Neue Berechnung anlegen (Modul + Objekt)',     tokens:20},
      {id:'pdf_export',       label:'PDF-/Druck-Export',                            tokens:10},
      {id:'ki_text',          label:'KI-Texthilfe (Verbessern / Korrigieren)',      tokens:25},
      {id:'ki_dokument',      label:'KI-Dokumentanalyse (Wareneingang, Formulare)', tokens:50},
      {id:'offertanfrage',    label:'Offertanfrage an Lieferant senden',            tokens:20},
      {id:'ausschreibung',    label:'Ausschreibung erstellen / verteilen',          tokens:50},
      {id:'bestellung',       label:'Bestellung auslösen',                          tokens:20},
      {id:'upload_datei',     label:'Foto- / Datei-Upload (pro Datei)',             tokens:5},
      {id:'speicher_mb',      label:'Cloud-Speicher (je angefangenes MB/Monat)',    tokens:2},
      {id:'sync_100',         label:'Server-Synchronisationen (je 100)',            tokens:1}
    ],
    topups: [
      {id:'topup_s', label:'Token-Paket S', tokens:1000,  preis:10},
      {id:'topup_m', label:'Token-Paket M', tokens:5000,  preis:40},
      {id:'topup_l', label:'Token-Paket L', tokens:12000, preis:80}
    ],
    zusatzGewerk: {
      // A1 (Annahme, s. KONZEPT_Abos_Preise.md): Grundabo deckt EIN Gewerk,
      // jedes weitere kostet +prozent% des gebuchten Firmen-Abopreises.
      modus: 'pro_gewerk',         // 'pro_gewerk' | 'alle_pauschal' | 'rabatt'
      prozent: 20
    },
    rollen: {
      planer: {
        label: 'Planer', icon: '📐',
        untertitel: 'Sanitär · Heizung · Lüftung',
        gewerke: [
          {id:'sanitaer', label:'Sanitär'},
          {id:'heizung',  label:'Heizung'},
          {id:'lueftung', label:'Lüftung'}
        ],
        person: {
          id:'planer_person', label:'Einzelperson', preis:10, maxNutzer:1,
          speicherGb:2, anfragenTag:2000,
          inklusive:'Nur Berechnungen des gewählten Gewerks (S/H/L)',
          features:['Alle Berechnungsmodule des gewählten Gewerks','Objekte & Projekt-Zuordnung','PDF-Export','Cloud-Speicherung (CH)']
        },
        firmaInklusive: 'Berechnungen H/L/S + Projektmanagement + Administration',
        firmaFeatures: ['Alle Berechnungsmodule (gewähltes Gewerk)','Komplettes Projektmanagement (Objekte, Termine, Ausschreibung, ERP)','Benutzer- & Rollenverwaltung (Admin)','Offertanfragen an Lieferanten','Cloud-Speicherung in der Schweiz'],
        firma: [
          {id:'planer_firma_1', label:'Grundabo I',    preis:50,  maxNutzer:2,  speicherGb:5,  anfragenTag:5000},
          {id:'planer_firma_2', label:'Grundabo II',   preis:100, maxNutzer:5,  speicherGb:15, anfragenTag:10000},
          {id:'planer_firma_3', label:'Grundabo III',  preis:165, maxNutzer:10, speicherGb:30, anfragenTag:20000},
          {id:'planer_firma_4', label:'Grundabo IIII', preis:250, maxNutzer:15, speicherGb:50, anfragenTag:30000},
          {id:'planer_firma_5', label:'Grundabo V',    preis:350, maxNutzer:20, speicherGb:75, anfragenTag:50000}
        ]
      },
      architekt: {
        label: 'Architekten', icon: '🏛',
        untertitel: 'Projektmanagement & Koordination',
        gewerke: [],
        person: {
          id:'architekt_person', label:'Einzelperson', preis:10, maxNutzer:1,
          speicherGb:2, anfragenTag:2000,
          inklusive:'Nur Projektmanagement',
          features:['Objekte & Beteiligte','Terminplanung & Sitzungsprotokolle','Dokumentation','PDF-Export']
        },
        firmaInklusive: 'Projektmanagement + Anfragen',
        firmaFeatures: ['Komplettes Projektmanagement','Ausschreibungen & Vergabeanträge','Anfragen an Unternehmer & Lieferanten','Benutzer- & Rollenverwaltung (Admin)','Cloud-Speicherung in der Schweiz'],
        firma: [
          {id:'architekt_firma_1', label:'Grundabo I',    preis:50,  maxNutzer:2,  speicherGb:5,  anfragenTag:5000},
          {id:'architekt_firma_2', label:'Grundabo II',   preis:100, maxNutzer:5,  speicherGb:15, anfragenTag:10000},
          {id:'architekt_firma_3', label:'Grundabo III',  preis:165, maxNutzer:10, speicherGb:30, anfragenTag:20000},
          {id:'architekt_firma_4', label:'Grundabo IIII', preis:250, maxNutzer:15, speicherGb:50, anfragenTag:30000},
          {id:'architekt_firma_5', label:'Grundabo V',    preis:350, maxNutzer:20, speicherGb:75, anfragenTag:50000}
        ]
      }
    },
    installateur: {
      label: 'Installateure', icon: '🔧',
      untertitel: 'Monteure · Werkstatt · Baustelle',
      // A2 (Annahme): Add-on zu einem Firmen-Abo UND eigenständig buchbar.
      verfuegbarkeit: 'addon_und_standalone', // 'nur_addon' | 'nur_standalone' | 'addon_und_standalone'
      inklusive: 'Werkzeug, Stunden, Regierapporte, Einsatzplan, Ausschreibungen beantworten, Bestellungen',
      features: ['Werkzeug- & Fahrzeugmanagement','Stundenerfassung GAV & Einsatzplan','Regierapporte & Baustellen-Doku','Ausschreibungen beantworten, Bestellungen auslösen'],
      stufen: [
        {id:'inst_1', label:'Installateur I',    preis:100, maxNutzer:10, speicherGb:10, anfragenTag:10000},
        {id:'inst_2', label:'Installateur II',   preis:250, maxNutzer:25, speicherGb:20, anfragenTag:20000},
        {id:'inst_3', label:'Installateur III',  preis:450, maxNutzer:45, speicherGb:35, anfragenTag:35000},
        {id:'inst_4', label:'Installateur IIII', preis:600, maxNutzer:60, speicherGb:50, anfragenTag:50000}
      ]
    },
    hersteller: {
      label: 'Hersteller / Lieferanten', icon: '🏭',
      anmeldungGratis: true,
      grundgebuehr: 0,
      // A3 (Annahme): Gebühr pro Vorgang vom jeweiligen Wert.
      // Alternativ 'nach_kanal': Gebühr nur bei Bestellung, Satz nach
      // Herkunft (aus Offertanfrage 1% / aus Ausschreibung 3% / direkt 6%).
      modell: 'pro_vorgang',       // 'pro_vorgang' | 'nach_kanal'
      gebuehren: [
        {id:'offertanfrage', label:'Offertanfrage', prozent:1, basis:'Offertbetrag (netto) bei beantworteter Anfrage'},
        {id:'ausschreibung', label:'Ausschreibung', prozent:3, basis:'Vergabesumme beim Zuschlag'},
        {id:'bestellung',    label:'Bestellung',    prozent:6, basis:'Bestellwert bei Bestellung über GEMA'}
      ]
    },
    stripe: {
      enabled: false,
      publishableKey: '',
      hinweis: 'Vorbereitet — STRIPE_SECRET_KEY in Netlify setzen, Publishable Key hier eintragen, dann enabled aktivieren.'
    },
    rechnung: { enabled: true },
    promoCodes: [
      // {code:'GEMA2026', rabattPct:20, gueltigBis:'2026-12-31', aktiv:true}
    ]
  };

  // ── Engine-Helfer (DOM-frei) ─────────────────────────────────────────
  function aboRound5(n){ return Math.round((+n || 0) * 20) / 20; }

  function aboMonatKey(d){
    d = d || new Date();
    var m = d.getMonth() + 1;
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
  }

  // Deep-Merge: gespeicherte Config über Defaults legen. Arrays gewinnen
  // als Ganzes (Admin-editierte Zeilen), Objekte rekursiv, Primitive: saved.
  function aboDeepMerge(def, sav){
    if(Array.isArray(def)) return Array.isArray(sav) ? sav : def;
    if(def && typeof def === 'object'){
      var out = {};
      Object.keys(def).forEach(function(k){
        var s = (sav && typeof sav === 'object' && !Array.isArray(sav)) ? sav[k] : undefined;
        out[k] = aboDeepMerge(def[k], s);
      });
      if(sav && typeof sav === 'object' && !Array.isArray(sav)){
        Object.keys(sav).forEach(function(k){ if(!(k in out)) out[k] = sav[k]; });
      }
      return out;
    }
    return sav === undefined ? def : sav;
  }

  // Alle buchbaren Pläne indexieren → {planId: {typ, gruppeId, stufe}}
  function aboPlanIndex(cfg){
    var idx = {};
    Object.keys(cfg.rollen || {}).forEach(function(gid){
      var g = cfg.rollen[gid];
      if(g.person && g.person.id) idx[g.person.id] = {typ:'person', gruppeId:gid, stufe:g.person};
      (g.firma || []).forEach(function(st){ idx[st.id] = {typ:'firma', gruppeId:gid, stufe:st}; });
    });
    ((cfg.installateur || {}).stufen || []).forEach(function(st){
      idx[st.id] = {typ:'installateur', gruppeId:'installateur', stufe:st};
    });
    return idx;
  }

  function aboPlanById(cfg, planId){ return aboPlanIndex(cfg)[planId] || null; }

  // Promo-Code auflösen (case-insensitive, aktiv, nicht abgelaufen)
  function aboPromoFind(cfg, code, heuteIso){
    if(!code) return null;
    var c = String(code).trim().toLowerCase();
    if(!c) return null;
    var heute = heuteIso || new Date().toISOString().split('T')[0];
    var hit = (cfg.promoCodes || []).find(function(p){
      return p && p.code && String(p.code).trim().toLowerCase() === c &&
             p.aktiv !== false && (!p.gueltigBis || p.gueltigBis >= heute);
    });
    return hit || null;
  }

  // Preisberechnung für einen Plan.
  // opts: {zusatzGewerke:<Anzahl weitere Gewerke>, zahlweise:'monatlich'|'jaehrlich', promo:<PromoObj|null>}
  function aboPreis(cfg, planId, opts){
    opts = opts || {};
    var pl = aboPlanById(cfg, planId);
    if(!pl) return null;
    var basis = +pl.stufe.preis || 0;

    var zusatz = 0;
    var z = Math.max(0, +opts.zusatzGewerke || 0);
    if(pl.typ === 'firma' && z > 0){
      var zg = cfg.zusatzGewerk || {};
      var pz = (+zg.prozent || 0) / 100;
      if(zg.modus === 'alle_pauschal')      zusatz = basis * pz;
      else if(zg.modus === 'rabatt')        zusatz = basis * (1 - pz) * z;
      else /* pro_gewerk */                 zusatz = basis * pz * z;
    }

    var netto = basis + zusatz;
    var jahresPct = (opts.zahlweise === 'jaehrlich') ? (+((cfg.abrechnung||{}).jahresrabattPct) || 0) : 0;
    var promoPct  = opts.promo ? (+opts.promo.rabattPct || 0) : 0;
    var mtl = netto * (1 - jahresPct/100) * (1 - promoPct/100);
    var mwstPct = +((cfg.abrechnung||{}).mwstPct) || 0;

    return {
      planId: planId, typ: pl.typ, gruppeId: pl.gruppeId,
      basis: aboRound5(basis),
      zusatz: aboRound5(zusatz),
      nettoOhneRabatt: aboRound5(netto),
      jahresrabattPct: jahresPct,
      promoPct: promoPct,
      monatlich: aboRound5(mtl),
      jahrTotal: aboRound5(mtl * 12),
      mwstPct: mwstPct,
      mwstMonat: aboRound5(mtl * mwstPct / 100),
      monatlichInkl: aboRound5(mtl * (1 + mwstPct / 100))
    };
  }

  // Hersteller-Gebühr für einen Vorgang.
  // modell 'pro_vorgang': vorgangId ∈ {offertanfrage,ausschreibung,bestellung}.
  // modell 'nach_kanal': Gebühr nur bei Bestellung — kanal ∈ {offertanfrage,
  //   ausschreibung,bestellung(=direkt)} bestimmt den Satz.
  function aboHerstellerGebuehr(cfg, vorgangId, betrag, kanal){
    var h = cfg.hersteller || {};
    var key = vorgangId;
    if(h.modell === 'nach_kanal'){
      if(vorgangId !== 'bestellung') return {prozent:0, gebuehr:0, faellig:false};
      key = kanal || 'bestellung';
    }
    var g = (h.gebuehren || []).find(function(x){ return x.id === key; });
    var p = g ? (+g.prozent || 0) : 0;
    return {prozent:p, gebuehr:aboRound5((+betrag || 0) * p / 100), faellig:p > 0};
  }

  // Token-Kosten einer Aktion
  function aboAktionKosten(cfg, aktionId){
    var a = (cfg.tokenAktionen || []).find(function(x){ return x.id === aktionId; });
    return a ? (+a.tokens || 0) : 0;
  }

  // Token-Status aus Ledger-Record (rec kann null sein = noch nichts verbraucht)
  function aboTokenStatus(cfg, rec){
    var budget = (+((cfg.gratis||{}).tokenBudgetMonat) || 0) + (rec ? (+rec.zukauf || 0) : 0);
    var verbraucht = rec ? (+rec.tokens || 0) : 0;
    var rest = budget - verbraucht;
    var pct = budget > 0 ? Math.min(999, Math.round(verbraucht / budget * 100)) : (verbraucht > 0 ? 999 : 0);
    return {budget:budget, verbraucht:verbraucht, rest:rest, pct:pct};
  }

  // Nutzer-Limit einer Org = Summe der maxNutzer aller aktiven Abos (Grund + Add-on)
  function aboNutzerLimit(cfg, subs){
    var max = 0;
    (subs || []).forEach(function(s){
      if(!s || (s.status !== 'aktiv' && s.status !== 'trial')) return;
      var pl = aboPlanById(cfg, s.planId);
      if(pl) max += (+pl.stufe.maxNutzer || 0);
    });
    return max;
  }

  /*ENGINE-END*/

  // ── Storage / Cache ─────────────────────────────────────────────────
  function _lsGet(key){
    try{ var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }catch(e){ return null; }
  }
  function _lsSet(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
  }
  function _cached(storageKey){
    if(w.GemaSync && GemaSync.getCached) return GemaSync.getCached(storageKey) || [];
    return _lsGet(storageKey) || [];
  }
  // Record im lokalen Pool-Cache upserten (Cloud-Write läuft separat via saveRecord)
  function _cachePut(storageKey, rec){
    var arr = _cached(storageKey).slice();
    var i = arr.findIndex(function(x){ return x && x.id === rec.id; });
    if(i >= 0) arr[i] = rec; else arr.push(rec);
    _lsSet(storageKey, arr);
    return arr;
  }

  var _cfg = null;          // gemergte Live-Config
  var _cloudLoaded = false;

  function _mergeCfg(saved){ _cfg = aboDeepMerge(ABO_DEFAULT_CFG, saved || {}); return _cfg; }

  // Sofort aus lokalem Cache initialisieren (stale-while-revalidate)
  _mergeCfg(_lsGet(CFG_CACHE));

  function _fireChanged(){
    try{ w.dispatchEvent(new CustomEvent('gema-abo-changed')); }catch(e){}
  }

  // ── Cloud-Bootstrap ─────────────────────────────────────────────────
  var _readyResolve;
  var ready = new Promise(function(res){ _readyResolve = res; });

  function _boot(){
    if(!w.GemaSync){ _cloudLoaded = true; _readyResolve(); return; }
    var jobs = [];
    jobs.push(GemaSync.loadRecord(MODULE_KEY, CFG_KEY).then(function(r){
      if(r && r.data){ _mergeCfg(r.data); _lsSet(CFG_CACHE, r.data); }
    }).catch(function(){}));
    jobs.push(GemaSync.bindCollection(MODULE_KEY, SUB_CACHE, SUB_PREFIX, 'id').catch(function(){}));
    jobs.push(GemaSync.bindCollection(MODULE_KEY, TOK_CACHE, TOK_PREFIX, 'id').catch(function(){}));
    Promise.all(jobs).then(function(){
      _cloudLoaded = true; _readyResolve(); _fireChanged();
    });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _boot);
  } else { _boot(); }

  // ── Auth-Helfer (defensiv — Seiten ohne gema_auth.js funktionieren) ──
  function _me(){ return (w.GemaAuth && GemaAuth.getCurrentUser) ? GemaAuth.getCurrentUser() : null; }
  function _org(){ return (w.GemaAuth && GemaAuth.getCurrentOrg) ? GemaAuth.getCurrentOrg() : null; }

  // ── Abos ────────────────────────────────────────────────────────────
  function getSubs(){ return _cached(SUB_CACHE).filter(Boolean); }
  function getSubsForOrg(orgId){
    return getSubs().filter(function(s){ return s.scope === 'org' && s.orgId === orgId; });
  }
  function getSubForUser(userId){
    return getSubs().find(function(s){ return s.scope === 'user' && s.userId === userId; }) || null;
  }

  // Effektives Abo eines Users: Person-Abo → Org-Grundabo → gratis
  function getEffective(user){
    user = user || _me();
    if(!user) return {modus:'gratis', sub:null};
    var aktivOk = function(s){ return s && (s.status === 'aktiv' || s.status === 'trial'); };
    var pers = getSubForUser(user.id);
    if(aktivOk(pers)) return {modus:'bezahlt', sub:pers};
    var orgSubs = getSubsForOrg(user.orgId).filter(aktivOk);
    var grund = orgSubs.find(function(s){ return aboPlanById(_cfg, s.planId) && aboPlanById(_cfg, s.planId).typ !== 'installateur'; }) || orgSubs[0];
    if(grund) return {modus:'bezahlt', sub:grund};
    return {modus:'gratis', sub:null};
  }
  function isPaying(user){ return getEffective(user).modus === 'bezahlt'; }

  function _subId(opts, user){
    var pl = aboPlanById(_cfg, opts.planId);
    if(pl && pl.typ === 'person') return 'sub_user_' + user.id;
    if(pl && pl.typ === 'installateur') return 'sub_' + user.orgId + '_inst';
    return 'sub_' + user.orgId + '_grund';
  }

  function _saveSub(rec){
    rec.updatedAt = new Date().toISOString();
    _cachePut(SUB_CACHE, rec);
    if(w.GemaSync) GemaSync.saveRecord(MODULE_KEY, SUB_PREFIX + rec.id, rec).catch(function(e){
      console.warn('[GemaAbo] Abo-Save fehlgeschlagen:', e && e.message);
    });
    _fireChanged();
    return rec;
  }

  function _notify(o){
    if(w.GemaNotify && GemaNotify.push){ try{ GemaNotify.push(o); }catch(e){} }
  }

  // Bestellung von der Preisseite (oder manuell durch Admin).
  // opts: {planId, gewerkBasis, zusatzGewerke:[], zahlweise, zahlung:'karte'|'rechnung',
  //        promoCode, bemerkung, admin:<bool nur sys_abos>, orgId/orgName (admin)}
  function bestellen(opts){
    opts = opts || {};
    var user = _me();
    if(!user) return Promise.reject(new Error('nicht_angemeldet'));
    var pl = aboPlanById(_cfg, opts.planId);
    if(!pl) return Promise.reject(new Error('plan_unbekannt'));

    var promo = aboPromoFind(_cfg, opts.promoCode);
    var preis = aboPreis(_cfg, opts.planId, {
      zusatzGewerke: (opts.zusatzGewerke || []).length,
      zahlweise: opts.zahlweise || 'monatlich',
      promo: promo
    });

    var targetOrgId = opts.orgId || user.orgId;
    var id = opts.admin && opts.orgId
      ? (pl.typ === 'installateur' ? 'sub_' + opts.orgId + '_inst' : 'sub_' + opts.orgId + '_grund')
      : _subId(opts, user);

    var existing = getSubs().find(function(s){ return s.id === id; });
    var neu = !existing;
    var trialTage = +((_cfg.abrechnung || {}).trialTage) || 0;
    var status;
    if(opts.admin) status = opts.status || 'aktiv';
    else if(neu && trialTage > 0) status = 'trial';
    else status = (opts.zahlung === 'rechnung') ? 'aktiv' : 'angefragt';

    var heute = new Date();
    var trialEnde = null;
    if(status === 'trial'){
      var te = new Date(heute.getTime() + trialTage * 86400000);
      trialEnde = te.toISOString().split('T')[0];
    }

    var org = _org();
    var rec = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: id, verlauf: [], start: heute.toISOString().split('T')[0]
    };
    rec.scope = (pl.typ === 'person') ? 'user' : 'org';
    rec.orgId = targetOrgId;
    rec.orgName = opts.orgName || (org && org.id === targetOrgId ? org.name : (rec.orgName || ''));
    if(pl.typ === 'person'){ rec.userId = user.id; rec.userName = user.name || user.email || ''; }
    rec.planId = opts.planId;
    rec.gruppeId = pl.gruppeId;
    rec.planLabel = pl.stufe.label;
    rec.gewerkBasis = opts.gewerkBasis || rec.gewerkBasis || '';
    rec.zusatzGewerke = opts.zusatzGewerke || [];
    rec.zahlweise = opts.zahlweise || 'monatlich';
    rec.zahlung = opts.zahlung || 'rechnung';
    rec.promoCode = promo ? promo.code : '';
    rec.preisMonat = preis.monatlich;
    rec.status = status;
    rec.trialEnde = trialEnde;
    rec.bemerkung = opts.bemerkung || rec.bemerkung || '';
    rec.verlauf = rec.verlauf || [];
    rec.verlauf.push({
      ts: new Date().toISOString(), userId: user.id, userName: user.name || '',
      aktion: neu ? 'bestellt' : 'geaendert',
      detail: pl.stufe.label + ' · ' + rec.zahlweise + ' · ' + rec.zahlung +
              (rec.zusatzGewerke.length ? ' · +' + rec.zusatzGewerke.length + ' Gewerk(e)' : '') +
              ' · CHF ' + preis.monatlich.toFixed(2) + '/Mt' + (promo ? ' · Promo ' + promo.code : '')
    });

    _saveSub(rec);

    if(!opts.admin){
      _notify({
        eventKey: 'abo_bestellung', empfaengerRoleId: 'role_admin',
        modul: 'abos', typ: 'aktion',
        titel: '💳 Neue Abo-Bestellung: ' + pl.stufe.label,
        text: (rec.orgName || rec.userName || targetOrgId) + ' · ' + rec.zahlweise + ' · ' + rec.zahlung +
              ' · CHF ' + preis.monatlich.toFixed(2) + '/Mt · Status: ' + status,
        link: 'sys_abos.html?tab=abonnenten'
      });
    }
    return Promise.resolve(rec);
  }

  // Status-Übergang (Admin): aktivieren / sperren / beenden …
  function setStatus(subId, status, grund){
    var sub = getSubs().find(function(s){ return s.id === subId; });
    if(!sub) return null;
    var user = _me();
    var rec = JSON.parse(JSON.stringify(sub));
    rec.status = status;
    rec.verlauf = rec.verlauf || [];
    rec.verlauf.push({
      ts: new Date().toISOString(), userId: user ? user.id : '', userName: user ? (user.name || '') : '',
      aktion: 'status_' + status, detail: grund || ''
    });
    _saveSub(rec);
    var besteller = (rec.verlauf.find(function(v){ return v.aktion === 'bestellt'; }) || {}).userId;
    _notify({
      eventKey: 'abo_status',
      empfaengerUserId: besteller || undefined,
      empfaengerOrgId: besteller ? undefined : rec.orgId,
      modul: 'abos', typ: status === 'aktiv' ? 'erfolg' : 'warnung',
      titel: '💳 Abo ' + (rec.planLabel || '') + ': ' + status,
      text: grund || ('Status neu: ' + status),
      link: 'sys_preise.html'
    });
    return rec;
  }

  // ── Token-Ledger ────────────────────────────────────────────────────
  function _tokRecId(userId, monat){ return 'tok_' + userId + '_' + monat; }

  function _tokRec(userId){
    var g = (_cfg.gratis || {});
    var monat = (g.reset === 'einmalig') ? 'gesamt' : aboMonatKey();
    var id = _tokRecId(userId, monat);
    return _cached(TOK_CACHE).find(function(r){ return r && r.id === id; }) || null;
  }

  function getTokenStatus(user){
    user = user || _me();
    if(!user) return null;
    var eff = getEffective(user);
    var geltung = (_cfg.gratis || {}).geltung || 'nur_gratis';
    if(eff.modus === 'bezahlt' && geltung === 'nur_gratis'){
      return {unbegrenzt:true, modus:'bezahlt', budget:0, verbraucht:0, rest:0, pct:0};
    }
    var st = aboTokenStatus(_cfg, _tokRec(user.id));
    st.unbegrenzt = false; st.modus = eff.modus;
    return st;
  }

  // Tokens für eine Aktion verbuchen. Promise → {ok, rest, unbegrenzt, ueberzogen}
  function charge(aktionId, anzahl){
    var user = _me();
    if(!user) return Promise.resolve({ok:true, unbegrenzt:true, offline:true});
    var eff = getEffective(user);
    var g = _cfg.gratis || {};
    if(eff.modus === 'bezahlt' && (g.geltung || 'nur_gratis') === 'nur_gratis'){
      return Promise.resolve({ok:true, unbegrenzt:true});
    }
    var kosten = aboAktionKosten(_cfg, aktionId) * Math.max(1, +anzahl || 1);
    var monat = (g.reset === 'einmalig') ? 'gesamt' : aboMonatKey();
    var id = _tokRecId(user.id, monat);
    var rec = _cached(TOK_CACHE).find(function(r){ return r && r.id === id; });
    rec = rec ? JSON.parse(JSON.stringify(rec)) : {
      id:id, userId:user.id, userName:user.name || '', orgId:user.orgId,
      monat:monat, tokens:0, zukauf:0, verbrauch:{}
    };
    var st = aboTokenStatus(_cfg, rec);
    var hart = (g.limitVerhalten || 'hart') === 'hart';
    if(kosten > 0 && st.rest < kosten && hart){
      return Promise.resolve({ok:false, grund:'budget', rest:st.rest, kosten:kosten});
    }
    rec.tokens = (+rec.tokens || 0) + kosten;
    rec.verbrauch = rec.verbrauch || {};
    rec.verbrauch[aktionId] = (+rec.verbrauch[aktionId] || 0) + Math.max(1, +anzahl || 1);
    rec.updatedAt = new Date().toISOString();
    _cachePut(TOK_CACHE, rec);
    if(w.GemaSync) GemaSync.saveRecord(MODULE_KEY, TOK_PREFIX + rec.id, rec).catch(function(){});

    var neu = aboTokenStatus(_cfg, rec);
    // Warn-Notifikation ab Schwelle, 1× pro User+Monat
    var schwelle = +g.warnschwellePct || 80;
    if(neu.budget > 0 && neu.pct >= schwelle){
      var lock = _lsGet(WARN_LOCK) || {};
      var lk = user.id + ':' + monat;
      if(!lock[lk]){
        lock[lk] = true; _lsSet(WARN_LOCK, lock);
        _notify({
          eventKey:'abo_tokens_knapp', empfaengerUserId:user.id,
          modul:'abos', typ:'warnung',
          titel:'🎟 Token-Budget bald aufgebraucht',
          text:'Bereits ' + neu.verbraucht + ' von ' + neu.budget + ' Tokens verbraucht (' + neu.pct + '%). Upgrade oder Token-Paket auf der Preisseite.',
          link:'sys_preise.html'
        });
      }
    }
    _fireChanged();
    return Promise.resolve({ok:true, rest:neu.rest, ueberzogen:neu.rest < 0});
  }

  // Token-Zukauf (Paket) — gutschreiben + Admin informieren.
  function topupKaufen(paketId, zahlung){
    var user = _me();
    if(!user) return Promise.reject(new Error('nicht_angemeldet'));
    var p = (_cfg.topups || []).find(function(x){ return x.id === paketId; });
    if(!p) return Promise.reject(new Error('paket_unbekannt'));
    var g = _cfg.gratis || {};
    var monat = (g.reset === 'einmalig') ? 'gesamt' : aboMonatKey();
    var id = _tokRecId(user.id, monat);
    var rec = _cached(TOK_CACHE).find(function(r){ return r && r.id === id; });
    rec = rec ? JSON.parse(JSON.stringify(rec)) : {
      id:id, userId:user.id, userName:user.name || '', orgId:user.orgId,
      monat:monat, tokens:0, zukauf:0, verbrauch:{}
    };
    rec.zukauf = (+rec.zukauf || 0) + (+p.tokens || 0);
    rec.updatedAt = new Date().toISOString();
    _cachePut(TOK_CACHE, rec);
    if(w.GemaSync) GemaSync.saveRecord(MODULE_KEY, TOK_PREFIX + rec.id, rec).catch(function(){});
    _notify({
      eventKey:'abo_bestellung', empfaengerRoleId:'role_admin',
      modul:'abos', typ:'aktion',
      titel:'🎟 Token-Zukauf: ' + p.label,
      text:(user.name || user.email || user.id) + ' · ' + p.tokens + ' Tokens · CHF ' + (+p.preis).toFixed(2) + ' · Zahlung: ' + (zahlung || 'rechnung'),
      link:'sys_abos.html?tab=tokens'
    });
    _fireChanged();
    return Promise.resolve(rec);
  }

  // ── Stripe (VORBEREITET — kein Live-Checkout ohne Server-Key) ────────
  // Ablauf, sobald aktiv: Preisseite ruft startStripeCheckout(payload) →
  // Netlify-Function /api/stripe-checkout erstellt eine Checkout-Session
  // (STRIPE_SECRET_KEY serverseitig) → Redirect auf session.url.
  function startStripeCheckout(payload){
    var s = _cfg.stripe || {};
    if(!s.enabled) return Promise.reject(new Error('stripe_not_configured'));
    return fetch('/api/stripe-checkout', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload || {})
    }).then(function(r){
      if(!r.ok) throw new Error('stripe_backend_' + r.status);
      return r.json();
    }).then(function(d){
      if(d && d.url){ location.href = d.url; return d; }
      throw new Error('stripe_no_url');
    });
  }

  // ── Config-Zugriff ──────────────────────────────────────────────────
  function getConfig(){ return _cfg; }
  function saveConfig(cfg){
    _mergeCfg(cfg);
    _lsSet(CFG_CACHE, _cfg);
    _fireChanged();
    if(w.GemaSync) return GemaSync.saveRecord(MODULE_KEY, CFG_KEY, _cfg);
    return Promise.resolve({ok:true, lokal:true});
  }

  function fmtChf(n){
    n = +n || 0;
    var s = n.toFixed(2);
    if(s.slice(-3) === '.00') s = s.slice(0, -3) + '.–';
    return "CHF " + s.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  }

  // ── Export ──────────────────────────────────────────────────────────
  w.GemaAbo = {
    ready: ready,
    isCloudLoaded: function(){ return _cloudLoaded; },
    DEFAULTS: ABO_DEFAULT_CFG,
    getConfig: getConfig,
    saveConfig: saveConfig,
    // Engine (auch für Tests/Module)
    preis: function(planId, opts){ return aboPreis(_cfg, planId, opts); },
    planById: function(planId){ return aboPlanById(_cfg, planId); },
    planIndex: function(){ return aboPlanIndex(_cfg); },
    promoFind: function(code){ return aboPromoFind(_cfg, code); },
    herstellerGebuehr: function(vorgangId, betrag, kanal){ return aboHerstellerGebuehr(_cfg, vorgangId, betrag, kanal); },
    nutzerLimitForOrg: function(orgId){ return aboNutzerLimit(_cfg, getSubsForOrg(orgId)); },
    round5: aboRound5,
    monatKey: aboMonatKey,
    fmtChf: fmtChf,
    // Abos
    getSubs: getSubs,
    getSubsForOrg: getSubsForOrg,
    getSubForUser: getSubForUser,
    getEffective: getEffective,
    isPaying: isPaying,
    bestellen: bestellen,
    setStatus: setStatus,
    // Tokens
    getTokenStatus: getTokenStatus,
    charge: charge,
    topupKaufen: topupKaufen,
    aktionKosten: function(aktionId){ return aboAktionKosten(_cfg, aktionId); },
    getTokenLedger: function(){ return _cached(TOK_CACHE).filter(Boolean); },
    // Zahlung
    startStripeCheckout: startStripeCheckout
  };

})(window);
