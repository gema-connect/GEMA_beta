// ═══════════════════════════════════════════════
// GEMA Produktkatalog API v2
// Shared data layer: Produkte + Lieferanten
// ═══════════════════════════════════════════════

(function(){
'use strict';

// Lieferanten-Kategorien
var LIEF_KATEGORIEN = [
  {id:'enthaertung',label:'Enthärtungsanlagen',gruppe:'anlagen'},
  {id:'osmose',label:'Umkehrosmoseanlagen',gruppe:'anlagen'},
  {id:'druckerhoehung',label:'Druckerhöhungsanlagen',gruppe:'anlagen'},
  {id:'zirkulationspumpe',label:'Zirkulationspumpen',gruppe:'anlagen'},
  {id:'sicherheitsventil',label:'Sicherheitsventile',gruppe:'anlagen'},
  {id:'ausdehnungsgefaess',label:'Ausdehnungsgefässe (Heizung)',gruppe:'anlagen'},
  {id:'heizungspumpe',label:'Heizungs-Umwälzpumpen',gruppe:'anlagen'},
  {id:'waermeerzeuger',label:'Wärmeerzeuger (WP / Kessel)',gruppe:'anlagen'},
  {id:'fettabscheider',label:'Fettabscheider',gruppe:'anlagen'},
  {id:'oelabscheider',label:'Ölabscheider',gruppe:'anlagen'},
  {id:'schlammsammler',label:'Schlammsammler',gruppe:'anlagen'},
  {id:'hebeanlage',label:'Abwasserhebeanlage',gruppe:'anlagen'},
  {id:'frischwasserstation',label:'Frischwasserstation',gruppe:'anlagen'},
  {id:'thermische_solaranlage',label:'Solaranlagen',gruppe:'anlagen'},
  {id:'werkzeuge',label:'Werkzeuge / Maschinen / Leitern',gruppe:'infrastruktur'},
  {id:'elektropruefung',label:'Elektroprüfung (NIV/NIN)',gruppe:'infrastruktur'},
  {id:'leiterpruefung',label:'Leiterprüfung (EKAS)',gruppe:'infrastruktur'},
  {id:'servicepruefung',label:'Service / Wartung',gruppe:'infrastruktur'},
  {id:'fahrzeuge',label:'Garagist / Fahrzeugmanagement',gruppe:'infrastruktur'},
  {id:'rohrsysteme',label:'Rohrsysteme & Armaturen',gruppe:'material'},
];

// Alias-Normalisierung: LIEF_KATEGORIEN nutzte frueher eigene IDs
// ('abwasserhebeanlage', 'solaranlage'), waehrend KATEGORIEN und die
// Berechnungsmodule 'hebeanlage' bzw. 'thermische_solaranlage' verwenden.
// Bestehende Lieferanten-Profile koennen die Alt-IDs noch gespeichert haben.
var KAT_ALIAS = { abwasserhebeanlage:'hebeanlage', solaranlage:'thermische_solaranlage' };
function normKatId(id){ return KAT_ALIAS[id] || id; }

var SK = 'gema_produktkatalog_v1';
const SK_LIEF = 'gema_lieferanten_v1';
const SK_OA = 'gema_offertanfragen_v1';
let _data = { produkte: [], log: [] };
let _liefData = { lieferanten: [] };
let _oaData = { anfragen: [] };

// ── Persistence ──
// Sync: localStorage (sofort) + Cloud PER-RECORD via gema_sync.js.
// Frueher: ein Blob pro Key via _GemaDB (Last-Write-Wins) → speicherten
// zwei Lieferanten gleichzeitig, ueberschrieben sie sich gegenseitig den
// ganzen Katalog. Jetzt: pro Produkt/Lieferant/Anfrage eine eigene
// Cloud-Row (Diff-Saves), wie Objekte/Berichte.
const _sbModule = 'produktkatalog';
// Per-Record-Konfiguration (moduleKey = _sbModule)
const P_PREFIX = 'produkt:',   L_PREFIX = 'lieferant:', O_PREFIX = 'oa:';
const P_POOL   = 'gema_pk_prod_pool_v1';   // Diff-Cache (flaches Produkt-Array)
const L_POOL   = 'gema_pk_lief_pool_v1';    // Diff-Cache (flaches Lieferanten-Array)
const O_POOL   = 'gema_pk_oa_pool_v1';      // Diff-Cache (flaches Anfragen-Array)
function _pkHasSync(){ return typeof window !== 'undefined' && window.GemaSync && window.GemaSync.persistCollection; }
function save(){
  const j = JSON.stringify(_data);
  try { localStorage.setItem(SK, j); } catch(e){}
  const jl = JSON.stringify(_liefData);
  try { localStorage.setItem(SK_LIEF, jl); } catch(e){}
  const jo = JSON.stringify(_oaData);
  try { localStorage.setItem(SK_OA, jo); } catch(e){}
  // Cloud PER-RECORD (kein Blob-Overwrite → keine gegenseitige Loeschung).
  if(_pkHasSync()){
    try {
      window.GemaSync.persistCollection(_sbModule, P_POOL, P_PREFIX, 'id', _data.produkte || []).catch(function(){});
      window.GemaSync.persistCollection(_sbModule, L_POOL, L_PREFIX, 'id', _liefData.lieferanten || []).catch(function(){});
      window.GemaSync.persistCollection(_sbModule, O_POOL, O_PREFIX, 'id', _oaData.anfragen || []).catch(function(){});
    } catch(e){}
  } else if(typeof _GemaDB !== 'undefined' && _GemaDB.saveToModule){
    // Fallback: alter Blob-Weg, falls gema_sync.js nicht geladen ist.
    try {
      _GemaDB.saveToModule(_sbModule, SK, j).catch(function(){});
      _GemaDB.saveToModule(_sbModule, SK_LIEF, jl).catch(function(){});
      _GemaDB.saveToModule(_sbModule, SK_OA, jo).catch(function(){});
    } catch(e){}
  }
}

function load(){
  // 1. localStorage (sofort, sync)
  try { const r = localStorage.getItem(SK); if(r) _data = JSON.parse(r); } catch(e){}
  if(!_data.produkte) _data.produkte = [];
  if(!_data.log) _data.log = [];
  try { const r2 = localStorage.getItem(SK_LIEF); if(r2) _liefData = JSON.parse(r2); } catch(e){}
  if(!_liefData.lieferanten) _liefData.lieferanten = [];
  try { const r3 = localStorage.getItem(SK_OA); if(r3) _oaData = JSON.parse(r3); } catch(e){}
  if(!_oaData.anfragen) _oaData.anfragen = [];
}

// 2. Cloud-Pull (async, nach Page-Load): laedt Produkte/Lieferanten/
//    Anfragen PER-RECORD frisch aus der Cloud und baut die lokalen
//    Blobs neu auf. Feuert 'gema-produkte-loaded'. Name bleibt
//    loadFromSupabase, weil mehrere Seiten ihn aufrufen.
function _pkApplyCloud(prod, lief, oa){
  _data.produkte = Array.isArray(prod) ? prod : [];
  if(!_data.log) _data.log = [];
  _liefData.lieferanten = Array.isArray(lief) ? lief : [];
  _oaData.anfragen = Array.isArray(oa) ? oa : [];
  try { localStorage.setItem(SK, JSON.stringify(_data)); } catch(e){}
  try { localStorage.setItem(SK_LIEF, JSON.stringify(_liefData)); } catch(e){}
  try { localStorage.setItem(SK_OA, JSON.stringify(_oaData)); } catch(e){}
  try { window.dispatchEvent(new Event('gema-produkte-loaded')); } catch(e){}
}
// Holt eine alte Blob-Row (Cloud via _GemaDB, sonst localStorage) fuer
// die einmalige Migration auf Per-Record.
function _pkFetchLegacyBlob(key){
  return new Promise(function(resolve){
    function fromLocal(){ try { var r = localStorage.getItem(key); resolve(r ? JSON.parse(r) : null); } catch(e){ resolve(null); } }
    if(typeof _GemaDB !== 'undefined' && _GemaDB.loadFromModule){
      _GemaDB.loadFromModule(_sbModule, key).then(function(val){
        if(val){ try { resolve(typeof val === 'string' ? JSON.parse(val) : val); return; } catch(e){} }
        fromLocal();
      }).catch(fromLocal);
    } else { fromLocal(); }
  });
}
function _pkMigrateLegacyBlobs(){
  return Promise.all([ _pkFetchLegacyBlob(SK), _pkFetchLegacyBlob(SK_LIEF), _pkFetchLegacyBlob(SK_OA) ])
    .then(function(blobs){
      var pBlob = blobs[0], lBlob = blobs[1], oBlob = blobs[2];
      var prod = (pBlob && Array.isArray(pBlob.produkte)) ? pBlob.produkte : (_data.produkte || []);
      var lief = (lBlob && Array.isArray(lBlob.lieferanten)) ? lBlob.lieferanten : (_liefData.lieferanten || []);
      var oa   = (oBlob && Array.isArray(oBlob.anfragen)) ? oBlob.anfragen : (_oaData.anfragen || []);
      if(pBlob && pBlob.log && !(_data.log && _data.log.length)) _data.log = pBlob.log;
      var ops = [];
      if(prod.length) ops.push(window.GemaSync.persistCollection(_sbModule, P_POOL, P_PREFIX, 'id', prod));
      if(lief.length) ops.push(window.GemaSync.persistCollection(_sbModule, L_POOL, L_PREFIX, 'id', lief));
      if(oa.length)   ops.push(window.GemaSync.persistCollection(_sbModule, O_POOL, O_PREFIX, 'id', oa));
      return Promise.all(ops).then(function(){
        try { console.info('[GemaProdukte] Migration Blob→Per-Record:', prod.length, 'Produkte,', lief.length, 'Lieferanten,', oa.length, 'Anfragen'); } catch(e){}
        _pkApplyCloud(prod, lief, oa);
      }).catch(function(){ _pkApplyCloud(prod, lief, oa); });
    });
}
function loadFromSupabase(){
  if(!_pkHasSync()){
    // Fallback: alter Blob-Weg, falls gema_sync.js nicht geladen ist.
    if(typeof _GemaDB === 'undefined' || !_GemaDB.loadFromModule) return Promise.resolve();
    const keys = [
      { key: SK, apply: function(p){ if(p.produkte){ _data=p; } } },
      { key: SK_LIEF, apply: function(p){ if(p.lieferanten){ _liefData=p; } } },
      { key: SK_OA, apply: function(p){ if(p.anfragen){ _oaData=p; } } }
    ];
    return Promise.all(keys.map(function(k){
      return _GemaDB.loadFromModule(_sbModule, k.key).then(function(val){
        if(!val) return;
        try { const parsed = typeof val === 'string' ? JSON.parse(val) : val; if(parsed){ k.apply(parsed); try { localStorage.setItem(k.key, typeof val==='string'?val:JSON.stringify(parsed)); } catch(e){} } } catch(e){}
      }).catch(function(){});
    }));
  }
  return Promise.all([
    window.GemaSync.bindCollection(_sbModule, P_POOL, P_PREFIX, 'id'),
    window.GemaSync.bindCollection(_sbModule, L_POOL, L_PREFIX, 'id'),
    window.GemaSync.bindCollection(_sbModule, O_POOL, O_PREFIX, 'id')
  ]).then(function(res){
    var prod = res[0] || [], lief = res[1] || [], oa = res[2] || [];
    if(!prod.length && !lief.length && !oa.length){
      return _pkMigrateLegacyBlobs();
    }
    _pkApplyCloud(prod, lief, oa);
  }).catch(function(e){ try { console.warn('[GemaProdukte] Cloud-Pull fehlgeschlagen:', e && e.message); } catch(_e){} });
}

// ── Verification Status ──
// 'entwurf'            → Lieferant arbeitet daran / nach Änderung zurückgesetzt
// 'verifiziert'        → Lieferant hat Verantwortlichkeit bestätigt (sofort, kein Admin-Review)
// 'nicht_verifiziert'  → Admin hat vorerfasst, Lieferant hat noch nicht bestätigt
const STATUS_LABELS = {
  entwurf:           { label: 'Entwurf',                icon: '📝', cls: 'st-draft' },
  verifiziert:       { label: 'Verifiziert',             icon: '✓',  cls: 'st-verified' },
  nicht_verifiziert: { label: 'Von Lieferant nicht verifiziert', icon: '⚠', cls: 'st-unverified' }
};

// ── Kategorie-Registry ──
const KATEGORIEN = {};

// Enthärtungsanlage
KATEGORIEN.enthaertung = {
  id: 'enthaertung',
  name: 'Enthärtungsanlage',
  icon: '💧',
  typenFelder: [
    { id: 'bauweise', label: 'Bauweise', typ: 'select', optionen: ['Parallelschaltung','Einzelanlage','Pendelanlage','Kabinettanlage'] },
    { id: 'technologie', label: 'Technologie', typ: 'select', optionen: ['Ionenaustausch','Nanofiltration','Physikalisch'] },
    { id: 'personenVon', label: 'Personen von', typ: 'number', einheit: 'Pers.' },
    { id: 'personenBis', label: 'Personen bis', typ: 'number', einheit: 'Pers.' },
    { id: 'durchflussVon', label: 'Durchfluss von', typ: 'number', einheit: 'l/min' },
    { id: 'durchflussBis', label: 'Durchfluss bis', typ: 'number', einheit: 'l/min' },
    { id: 'druckverlustVon', label: 'Druckverlust von', typ: 'number', einheit: 'bar' },
    { id: 'druckverlustBis', label: 'Druckverlust bis', typ: 'number', einheit: 'bar' }
  ],
  felder: [
    // Gruppe: Allgemein
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'bauweise', label: 'Bauweise', typ: 'select', optionen: ['Parallelschaltung','Einzelanlage','Pendelanlage','Kabinettanlage'], gruppe: 'Allgemein', pflicht: true },
    { id: 'technologie', label: 'Technologie', typ: 'select', optionen: ['Ionenaustausch','Nanofiltration','Physikalisch'], gruppe: 'Allgemein', pflicht: true },

    // Gruppe: Leistungsdaten
    { id: 'nenndurchfluss', label: 'Nenndurchfluss', typ: 'number', einheit: 'l/min', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'spitzendurchfluss', label: 'Spitzendurchfluss', typ: 'number', einheit: 'l/min', gruppe: 'Leistungsdaten' },
    { id: 'druckverlustQn', label: 'Druckverlust bei Qn', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'druckverlustSpitze', label: 'Druckverlust bei Spitze', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten' },
    { id: 'kapazitaet', label: 'Enthärtungskapazität', typ: 'number', einheit: 'm³·°fH', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'salzProRegeneration', label: 'Salzverbrauch pro Regeneration', typ: 'number', einheit: 'kg', gruppe: 'Leistungsdaten' },
    { id: 'personenMax', label: 'Max. Personenanzahl', typ: 'number', einheit: 'Pers.', gruppe: 'Leistungsdaten' },
    { id: 'haertebereichEin', label: 'Eingangshärte max.', typ: 'number', einheit: '°fH', gruppe: 'Leistungsdaten' },
    { id: 'haertebereichAus', label: 'Ausgangshärte einstellbar', typ: 'text', einheit: '°fH', gruppe: 'Leistungsdaten' },

    // Gruppe: Anschlüsse
    { id: 'anschluss', label: 'Anschlussgrösse', typ: 'select', optionen: ['DN 20','DN 25','DN 32','DN 40','DN 50','DN 65','DN 80','DN 100'], gruppe: 'Anschlüsse', pflicht: true },
    { id: 'anschlussTyp', label: 'Anschlusstyp', typ: 'select', optionen: ['Überwurfmutter','Flansch','Klemme','Löt','Press'], gruppe: 'Anschlüsse' },
    { id: 'abwasserAnschluss', label: 'Abwasseranschluss', typ: 'text', einheit: 'mm', gruppe: 'Anschlüsse' },
    { id: 'ueberlauf', label: 'Überlaufanschluss', typ: 'text', einheit: 'mm', gruppe: 'Anschlüsse' },

    // Gruppe: Abmessungen
    { id: 'breite', label: 'Breite', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'tiefe', label: 'Tiefe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'gewichtLeer', label: 'Gewicht leer', typ: 'number', einheit: 'kg', gruppe: 'Abmessungen' },
    { id: 'gewichtBetrieb', label: 'Gewicht Betrieb', typ: 'number', einheit: 'kg', gruppe: 'Abmessungen' },

    // Gruppe: Regeneration
    { id: 'salzverbrauch', label: 'Salzverbrauch / Regeneration', typ: 'number', einheit: 'kg', gruppe: 'Regeneration' },
    { id: 'wasserverbrauch', label: 'Wasserverbrauch / Regeneration', typ: 'number', einheit: 'l', gruppe: 'Regeneration' },
    { id: 'regenerationsdauer', label: 'Regenerationsdauer', typ: 'number', einheit: 'min', gruppe: 'Regeneration' },
    { id: 'salzvorrat', label: 'Salzvorrat max.', typ: 'number', einheit: 'kg', gruppe: 'Regeneration' },

    // Gruppe: Elektro
    { id: 'spannung', label: 'Spannung', typ: 'select', optionen: ['230V/50Hz','400V/50Hz','12V DC'], gruppe: 'Elektro' },
    { id: 'leistung', label: 'Leistungsaufnahme', typ: 'number', einheit: 'W', gruppe: 'Elektro' },
    { id: 'schutzart', label: 'Schutzart', typ: 'text', gruppe: 'Elektro' },

    // Gruppe: Normen & Zulassungen
    { id: 'svgwNr', label: 'SVGW-Zulassungsnummer', typ: 'text', gruppe: 'Normen' },
    { id: 'dvgwNr', label: 'DVGW-Zulassungsnummer', typ: 'text', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'trinkwasserZugelassen', label: 'Trinkwasser zugelassen', typ: 'checkbox', gruppe: 'Normen' },

    // Gruppe: Zusatz
    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' },
    { id: 'zubehoer', label: 'Zubehör (inkl.)', typ: 'textarea', gruppe: 'Zusatz' },
    { id: 'optionen', label: 'Optionales Zubehör', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  // Match-Funktion: bekommt Berechnungsergebnis, gibt Score 0-100 zurück
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    // Durchfluss passt
    if(b.durchfluss && d.nenndurchfluss){
      if(d.nenndurchfluss >= b.durchfluss) score += 40;
      else if(d.nenndurchfluss >= b.durchfluss * 0.8) score += 20;
    }
    // Kapazität passt
    if(b.kapazitaet && d.kapazitaet){
      if(d.kapazitaet >= b.kapazitaet) score += 30;
      else if(d.kapazitaet >= b.kapazitaet * 0.8) score += 15;
    }
    // Druckverlust akzeptabel (kleiner = besser)
    if(b.maxDruckverlust && d.druckverlustQn){
      if(d.druckverlustQn <= b.maxDruckverlust) score += 20;
    }
    // Anschluss/Einbaulänge: optional Bonus (kein Ausschlusskriterium)
    if(b.anschluss && d.anschluss && d.anschluss === b.anschluss) score += 5;
    if(b.einbaulaenge && d.einbaulaenge && d.einbaulaenge === b.einbaulaenge) score += 5;
    return Math.min(100, score);
  }
};

// Osmoseanlage
KATEGORIEN.osmose = {
  id: 'osmose',
  name: 'Osmoseanlage',
  icon: '🔬',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'bauart', label: 'Bauart', typ: 'select', optionen: ['Untertisch','Standgerät','Wandmontage','Industrieanlage'], gruppe: 'Allgemein', pflicht: true },

    { id: 'permeatleistung', label: 'Permeatleistung', typ: 'number', einheit: 'l/h', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'recovery', label: 'Recovery / Ausbeute', typ: 'number', einheit: '%', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'salzrueckhaltung', label: 'Salzrückhaltung', typ: 'number', einheit: '%', gruppe: 'Leistungsdaten' },
    { id: 'feedDruckMin', label: 'Feed-Druck min.', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten' },
    { id: 'feedDruckMax', label: 'Feed-Druck max.', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten' },
    { id: 'druckverlust', label: 'Druckverlust', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten' },

    { id: 'membranAnzahl', label: 'Anzahl Membranen', typ: 'number', gruppe: 'Membranen' },
    { id: 'membranTyp', label: 'Membrantyp', typ: 'text', gruppe: 'Membranen' },
    { id: 'membranFlaeche', label: 'Membranfläche gesamt', typ: 'number', einheit: 'm²', gruppe: 'Membranen' },
    { id: 'membranStandzeit', label: 'Standzeit Membran', typ: 'text', einheit: 'Jahre', gruppe: 'Membranen' },

    { id: 'anschlussFeed', label: 'Feed-Anschluss', typ: 'select', optionen: ['DN 15','DN 20','DN 25','DN 32','DN 40','DN 50'], gruppe: 'Anschlüsse' },
    { id: 'anschlussPermeat', label: 'Permeat-Anschluss', typ: 'select', optionen: ['DN 15','DN 20','DN 25','DN 32'], gruppe: 'Anschlüsse' },
    { id: 'anschlussKonzentrat', label: 'Konzentrat-Anschluss', typ: 'select', optionen: ['DN 15','DN 20','DN 25','DN 32'], gruppe: 'Anschlüsse' },

    { id: 'breite', label: 'Breite', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'tiefe', label: 'Tiefe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'gewicht', label: 'Gewicht', typ: 'number', einheit: 'kg', gruppe: 'Abmessungen' },

    { id: 'spannung', label: 'Spannung', typ: 'select', optionen: ['230V/50Hz','400V/50Hz'], gruppe: 'Elektro' },
    { id: 'leistung', label: 'Leistungsaufnahme', typ: 'number', einheit: 'W', gruppe: 'Elektro' },
    { id: 'pumpenleistung', label: 'Pumpenleistung', typ: 'number', einheit: 'W', gruppe: 'Elektro' },
    { id: 'schutzart', label: 'Schutzart', typ: 'text', gruppe: 'Elektro' },

    { id: 'svgwNr', label: 'SVGW-Zulassungsnummer', typ: 'text', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'trinkwasserZugelassen', label: 'Trinkwasser zugelassen', typ: 'checkbox', gruppe: 'Normen' },

    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' },
    { id: 'zubehoer', label: 'Zubehör (inkl.)', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    // Permeatleistung passt (Gewicht 50)
    if(b.permeatleistung && d.permeatleistung){
      if(d.permeatleistung >= b.permeatleistung) score += 50;
      else if(d.permeatleistung >= b.permeatleistung * 0.8) score += 25;
    }
    // Recovery akzeptabel (Gewicht 30)
    if(b.recovery && d.recovery){
      if(d.recovery >= b.recovery) score += 30;
      else if(d.recovery >= b.recovery * 0.9) score += 15;
    }
    // Druckverlust (Gewicht 20)
    if(b.maxDruckverlust && d.druckverlust){
      if(d.druckverlust <= b.maxDruckverlust) score += 20;
    }
    return Math.min(100, score);
  }
};

// Abwasserhebeanlage
KATEGORIEN.hebeanlage = {
  id: 'hebeanlage',
  name: 'Abwasserhebeanlage',
  icon: '⬆️',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'einsatz', label: 'Einsatzbereich', typ: 'select', optionen: ['Fäkalienfrei','Fäkalienhaltig','Schwarzwasser','Regenwasser'], gruppe: 'Allgemein', pflicht: true },

    { id: 'foerdermenge', label: 'Fördermenge', typ: 'number', einheit: 'l/s', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'foerderhoehe', label: 'Förderhöhe', typ: 'number', einheit: 'm', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'freikugel', label: 'Freikugeldurchgang', typ: 'number', einheit: 'mm', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'motorleistung', label: 'Motorleistung', typ: 'number', einheit: 'kW', gruppe: 'Leistungsdaten' },

    { id: 'pumpenAnzahl', label: 'Anzahl Pumpen', typ: 'number', gruppe: 'Pumpen', pflicht: true },
    { id: 'redundanz', label: 'Redundanz', typ: 'select', optionen: ['Keine','1+1 Reserve','2+1 Reserve'], gruppe: 'Pumpen' },
    { id: 'pumpentyp', label: 'Pumpentyp', typ: 'select', optionen: ['Schneidradpumpe','Freistromrad','Kanalrad','Wirbel'], gruppe: 'Pumpen' },

    { id: 'behaelterVolumen', label: 'Behältervolumen', typ: 'number', einheit: 'l', gruppe: 'Behälter', pflicht: true },
    { id: 'behaelterMaterial', label: 'Material', typ: 'select', optionen: ['PE','GFK','Edelstahl','Beton'], gruppe: 'Behälter' },
    { id: 'zulaufDN', label: 'Zulauf DN', typ: 'select', optionen: ['DN 50','DN 65','DN 80','DN 100','DN 125','DN 150'], gruppe: 'Behälter' },
    { id: 'druckleitungDN', label: 'Druckleitung DN', typ: 'select', optionen: ['DN 32','DN 40','DN 50','DN 65','DN 80','DN 100'], gruppe: 'Behälter' },

    { id: 'breite', label: 'Breite', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'tiefe', label: 'Tiefe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'gewicht', label: 'Gewicht', typ: 'number', einheit: 'kg', gruppe: 'Abmessungen' },

    { id: 'spannung', label: 'Spannung', typ: 'select', optionen: ['230V/50Hz','400V/50Hz'], gruppe: 'Elektro' },
    { id: 'leistung', label: 'Leistungsaufnahme', typ: 'number', einheit: 'W', gruppe: 'Elektro' },
    { id: 'schutzart', label: 'Schutzart', typ: 'text', gruppe: 'Elektro' },
    { id: 'steuerung', label: 'Steuerung', typ: 'text', gruppe: 'Elektro' },

    { id: 'enNorm', label: 'EN-Norm', typ: 'text', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },

    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' },
    { id: 'zubehoer', label: 'Zubehör (inkl.)', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    // Fördermenge (Gewicht 40)
    if(b.foerdermenge && d.foerdermenge){
      if(d.foerdermenge >= b.foerdermenge) score += 40;
      else if(d.foerdermenge >= b.foerdermenge * 0.8) score += 20;
    }
    // Förderhöhe (Gewicht 30)
    if(b.foerderhoehe && d.foerderhoehe){
      if(d.foerderhoehe >= b.foerderhoehe) score += 30;
      else if(d.foerderhoehe >= b.foerderhoehe * 0.8) score += 15;
    }
    // Freikugeldurchgang (Gewicht 20)
    if(b.freikugel && d.freikugel){
      if(d.freikugel >= b.freikugel) score += 20;
    }
    // Behältervolumen Bonus (Gewicht 10)
    if(b.volumen && d.behaelterVolumen){
      if(d.behaelterVolumen >= b.volumen) score += 10;
    }
    return Math.min(100, score);
  }
};

// Zirkulationspumpe
KATEGORIEN.zirkulation = {
  id: 'zirkulation',
  name: 'Zirkulationspumpe',
  icon: '🔄',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'pumpenart', label: 'Pumpenart', typ: 'select', optionen: ['Nassläufer','Trockenläufer','Inline','Blockpumpe'], gruppe: 'Allgemein', pflicht: true },

    { id: 'foerdermenge', label: 'Fördermenge max.', typ: 'number', einheit: 'l/h', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'foerderhoehe', label: 'Förderhöhe max.', typ: 'number', einheit: 'm', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'leistung', label: 'Leistungsaufnahme', typ: 'number', einheit: 'W', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'tempMax', label: 'Max. Medientemperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },
    { id: 'druckMax', label: 'Max. Betriebsdruck', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten' },

    { id: 'drehzahlregelung', label: 'Drehzahlregelung', typ: 'select', optionen: ['Keine','Stufenschaltung','Stufenlos (EC)','Autoadapt'], gruppe: 'Regelung' },
    { id: 'betriebsarten', label: 'Betriebsarten', typ: 'text', gruppe: 'Regelung' },
    { id: 'thermDesinfektion', label: 'Therm. Desinfektion', typ: 'checkbox', gruppe: 'Regelung' },

    { id: 'anschluss', label: 'Anschluss DN', typ: 'select', optionen: ['DN 15','DN 20','DN 25','DN 32','DN 40','DN 50'], gruppe: 'Anschlüsse', pflicht: true },
    { id: 'einbaulaenge', label: 'Einbaulänge', typ: 'number', einheit: 'mm', gruppe: 'Anschlüsse' },
    { id: 'anschlussTyp', label: 'Anschlusstyp', typ: 'select', optionen: ['Verschraubung','Flansch','Löt','Press'], gruppe: 'Anschlüsse' },

    { id: 'breite', label: 'Breite', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'gewicht', label: 'Gewicht', typ: 'number', einheit: 'kg', gruppe: 'Abmessungen' },

    { id: 'spannung', label: 'Spannung', typ: 'select', optionen: ['230V/50Hz','400V/50Hz'], gruppe: 'Elektro' },
    { id: 'schutzart', label: 'Schutzart', typ: 'text', gruppe: 'Elektro' },
    { id: 'energielabel', label: 'Energielabel (EEI)', typ: 'text', gruppe: 'Elektro' },

    { id: 'svgwNr', label: 'SVGW-Zulassungsnummer', typ: 'text', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },

    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' },
    { id: 'zubehoer', label: 'Zubehör (inkl.)', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    // Fördermenge (Gewicht 40)
    if(b.foerdermenge && d.foerdermenge){
      if(d.foerdermenge >= b.foerdermenge) score += 40;
      else if(d.foerdermenge >= b.foerdermenge * 0.8) score += 20;
    }
    // Förderhöhe (Gewicht 35)
    if(b.foerderhoehe && d.foerderhoehe){
      if(d.foerderhoehe >= b.foerderhoehe) score += 35;
      else if(d.foerderhoehe >= b.foerderhoehe * 0.8) score += 18;
    }
    // Leistungsaufnahme (Gewicht 15, weniger = besser)
    if(b.maxLeistung && d.leistung){
      if(d.leistung <= b.maxLeistung) score += 15;
    }
    // Anschluss/Einbaulänge optional Bonus
    if(b.anschluss && d.anschluss && d.anschluss === b.anschluss) score += 5;
    if(b.einbaulaenge && d.einbaulaenge && d.einbaulaenge === b.einbaulaenge) score += 5;
    return Math.min(100, score);
  }
};

// Rohrsystem
KATEGORIEN.rohrsystem = {
  id: 'rohrsystem',
  name: 'Rohrsystem',
  icon: '🔧',
  typenFelder: [
    { id: 'material', label: 'Material', typ: 'select', optionen: ['Edelstahl','Mehrschicht','Kupfer','Stahl verzinkt','PE','PP'] },
    { id: 'verbindung', label: 'Verbindung', typ: 'select', optionen: ['Pressverbindung','Klemmverbindung','Schweissverbindung','Lötverbindung','Steckverbindung'] }
  ],
  felder: [
    { id: 'serie', label: 'Systemname / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modellbezeichnung', typ: 'text', gruppe: 'Allgemein' },
    { id: 'material', label: 'Werkstoff', typ: 'text', gruppe: 'Technische Daten' },
    { id: 'rauhigkeit', label: 'Rauhigkeit k', typ: 'number', einheit: 'mm', gruppe: 'Technische Daten' },
    { id: 'dimensionen', label: 'Verfügbare Dimensionen', typ: 'textarea', gruppe: 'Technische Daten' },
    { id: 'druckbereich', label: 'Druckbereich', typ: 'text', einheit: 'bar', gruppe: 'Technische Daten' },
    { id: 'tempBereich', label: 'Temperaturbereich', typ: 'text', einheit: '°C', gruppe: 'Technische Daten' },
    { id: 'zulassungen', label: 'Zulassungen / Normen', typ: 'text', gruppe: 'Zertifikate' },
    { id: 'svgw', label: 'SVGW-zugelassen', typ: 'checkbox', gruppe: 'Zertifikate' }
  ]
};

// Armaturen
KATEGORIEN.armaturen = {
  id: 'armaturen',
  name: 'Armaturen',
  icon: '⌥',
  typenFelder: [
    { id: 'armaturTyp', label: 'Armatur-Typ', typ: 'select', optionen: ['Schrägsitzventil','Geradsitzventil','Kugelhahn','Absperrschieber','Rückschlagventil','Druckminderer','Wasserzähler','Filter'] },
    { id: 'anschluss', label: 'Anschluss', typ: 'select', optionen: ['Press','Klemm','Gewinde','Flansch','Löt'] }
  ],
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modellbezeichnung', typ: 'text', gruppe: 'Allgemein' },
    { id: 'armaturTyp', label: 'Armatur-Typ', typ: 'select', optionen: ['Schrägsitzventil','Geradsitzventil','Kugelhahn','Absperrschieber','Rückschlagventil','Druckminderer','Wasserzähler','Filter'], gruppe: 'Technische Daten' },
    { id: 'dn', label: 'Verfügbare DN', typ: 'text', gruppe: 'Technische Daten' },
    { id: 'kvs', label: 'kvs-Wert', typ: 'number', einheit: 'm³/h', gruppe: 'Technische Daten' },
    { id: 'zetaWerte', label: 'Zeta-Werte (DN:ζ)', typ: 'textarea', gruppe: 'Technische Daten' },
    { id: 'druckbereich', label: 'Druckbereich', typ: 'text', einheit: 'bar', gruppe: 'Technische Daten' },
    { id: 'tempBereich', label: 'Temperaturbereich', typ: 'text', einheit: '°C', gruppe: 'Technische Daten' },
    { id: 'werkstoff', label: 'Werkstoff Gehäuse', typ: 'text', gruppe: 'Technische Daten' },
    { id: 'svgw', label: 'SVGW-zugelassen', typ: 'checkbox', gruppe: 'Zertifikate' }
  ]
};

// Formstücke / Fittings
KATEGORIEN.formstücke = {
  id: 'formstuecke',
  name: 'Formstücke / Fittings',
  icon: '↩️',
  typenFelder: [
    { id: 'fittingTyp', label: 'Typ', typ: 'select', optionen: ['Bogen 90°','Bogen 45°','T-Stück','Reduktion','Muffe','Kupplung','Winkel','Übergang'] },
    { id: 'rohrsystem', label: 'Für Rohrsystem', typ: 'text' }
  ],
  felder: [
    { id: 'serie', label: 'Bezeichnung', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'fittingTyp', label: 'Formstück-Typ', typ: 'select', optionen: ['Bogen 90°','Bogen 45°','T-Stück Durchgang','T-Stück Abzweig','Reduktion','Muffe','Kupplung','Winkel 90°','Winkel 45°','Übergang','Anschlusswinkel','Anschlussdose','Verteiler'], gruppe: 'Technische Daten' },
    { id: 'rohrsystem', label: 'Kompatibles Rohrsystem', typ: 'text', gruppe: 'Technische Daten' },
    { id: 'dn', label: 'Verfügbare DN', typ: 'text', gruppe: 'Technische Daten' },
    { id: 'zetaWerte', label: 'Zeta-Werte (DN:ζ)', typ: 'textarea', gruppe: 'Technische Daten' },
    { id: 'werkstoff', label: 'Werkstoff', typ: 'text', gruppe: 'Technische Daten' },
    { id: 'bild', label: 'Produktbild URL', typ: 'text', gruppe: 'Medien' }
  ]
};

// Warmwasserspeicher / Boiler
KATEGORIEN.warmwasser_boiler = {
  id: 'warmwasser_boiler',
  name: 'Warmwasserspeicher / Boiler',
  icon: '🌡️',
  typenFelder: [
    { id: 'beheizung', label: 'Beheizung', typ: 'select', optionen: ['Elektro','Wärmepumpe','Solar','Gas','Öl','Kombi (E+WP)','Kombi (E+Solar)','Frischwasserstation'] },
    { id: 'volumenVon', label: 'Volumen von', typ: 'number', einheit: 'l' },
    { id: 'volumenBis', label: 'Volumen bis', typ: 'number', einheit: 'l' }
  ],
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'beheizung', label: 'Beheizung', typ: 'select', optionen: ['Elektro','Wärmepumpe','Solar','Gas','Öl','Kombi (E+WP)','Kombi (E+Solar)','Frischwasserstation'], gruppe: 'Allgemein', pflicht: true },

    { id: 'volumen', label: 'Speichervolumen', typ: 'number', einheit: 'l', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'leistungElektro', label: 'Elektro-Heizleistung', typ: 'number', einheit: 'kW', gruppe: 'Leistungsdaten' },
    { id: 'leistungWP', label: 'Wärmepumpen-Leistung', typ: 'number', einheit: 'kW', gruppe: 'Leistungsdaten' },
    { id: 'cop', label: 'COP (A15/W55)', typ: 'number', gruppe: 'Leistungsdaten' },
    { id: 'tempMax', label: 'Max. Speichertemperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },
    { id: 'aufheizzeit', label: 'Aufheizzeit (15→55°C)', typ: 'number', einheit: 'h', gruppe: 'Leistungsdaten' },
    { id: 'verlustzahl', label: 'Verlustzahl ζIS (24h)', typ: 'number', einheit: 'kWh/24h', gruppe: 'Leistungsdaten' },
    { id: 'energieklasse', label: 'Energieeffizienzklasse (ErP)', typ: 'select', optionen: ['A+','A','B','C','D','E','F'], gruppe: 'Leistungsdaten' },

    { id: 'register', label: 'Anzahl Wärmetauscher', typ: 'select', optionen: ['0','1','2','3'], gruppe: 'Wärmetauscher' },
    { id: 'registerFlaeche1', label: 'Fläche WT 1', typ: 'number', einheit: 'm²', gruppe: 'Wärmetauscher' },
    { id: 'registerFlaeche2', label: 'Fläche WT 2', typ: 'number', einheit: 'm²', gruppe: 'Wärmetauscher' },

    { id: 'durchmesser', label: 'Durchmesser (mit Iso)', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen', pflicht: true },
    { id: 'kippmass', label: 'Kippmass', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'gewichtLeer', label: 'Gewicht leer', typ: 'number', einheit: 'kg', gruppe: 'Abmessungen' },

    { id: 'material', label: 'Behälter-Werkstoff', typ: 'select', optionen: ['Email','Edelstahl','Kunststoff','Stahl beschichtet'], gruppe: 'Material' },
    { id: 'isolation', label: 'Isolation', typ: 'text', gruppe: 'Material' },
    { id: 'isolationStaerke', label: 'Isolationsstärke', typ: 'number', einheit: 'mm', gruppe: 'Material' },

    { id: 'svgwNr', label: 'SVGW-Zulassungsnummer', typ: 'text', gruppe: 'Normen' },
    { id: 'sia385', label: 'Konform SIA 385/2', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },

    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' },
    { id: 'zubehoer', label: 'Zubehör (inkl.)', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    // Volumen (Gewicht 50)
    if(b.volumen && d.volumen){
      var ratio = d.volumen / b.volumen;
      if(ratio >= 1.0 && ratio <= 1.3) score += 50;       // ideal: 0–30% Reserve
      else if(ratio >= 0.9 && ratio < 1.0) score += 25;   // knapp
      else if(ratio > 1.3 && ratio <= 1.6) score += 30;   // überdimensioniert
    }
    // Beheizungsart Match (Gewicht 30)
    if(b.beheizung && d.beheizung){
      if(d.beheizung === b.beheizung) score += 30;
      else if((b.beheizung==='Wärmepumpe' && d.beheizung.indexOf('WP')>=0)
           || (b.beheizung==='Solar' && d.beheizung.indexOf('Solar')>=0)) score += 20;
    }
    // Wärmetauscher-Anzahl (Gewicht 10)
    if(b.register && d.register && Number(d.register) >= Number(b.register)) score += 10;
    // Energieklasse Bonus (Gewicht 10)
    if(d.energieklasse && (d.energieklasse==='A+' || d.energieklasse==='A')) score += 10;
    return Math.min(100, score);
  }
};

// ── Druckerhoehungsanlage ──
// Registriert, damit Lieferanten Druckerhoehungs-Anlagen im Produkt-
// katalog erfassen koennen und die sb_druckerhoehung.html darauf
// zugreifen kann.
KATEGORIEN.druckerhoehung = {
  id: 'druckerhoehung',
  name: 'Druckerhöhungsanlage',
  icon: '⬆️',
  typenFelder: [
    { id: 'bauart', label: 'Bauart', typ: 'select', optionen: ['VFD (Frequenzgeregelt)','VES (Druckkessel)','Hybrid'] }
  ],
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'bauart', label: 'Bauart', typ: 'select', optionen: ['VFD (Frequenzgeregelt)','VES (Druckkessel)','Hybrid'], gruppe: 'Allgemein', pflicht: true },
    { id: 'pumpenAnzahl', label: 'Anzahl Pumpen', typ: 'number', gruppe: 'Allgemein' },

    { id: 'volumenstromMax', label: 'Max. Volumenstrom QVZ', typ: 'number', einheit: 'l/s', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'druckMax', label: 'Max. Förderdruck', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'nachdruckMin', label: 'Min. Nachdruck pN', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten' },
    { id: 'motorleistung', label: 'Motorleistung gesamt', typ: 'number', einheit: 'kW', gruppe: 'Leistungsdaten' },
    { id: 'kesselvolumen', label: 'Kesselvolumen (VES)', typ: 'number', einheit: 'l', gruppe: 'Leistungsdaten' },

    { id: 'anschlussSaug', label: 'Sauganschluss', typ: 'select', optionen: ['DN 25','DN 32','DN 40','DN 50','DN 65','DN 80','DN 100','DN 125','DN 150'], gruppe: 'Anschlüsse', pflicht: true },
    { id: 'anschlussDruck', label: 'Druckanschluss', typ: 'select', optionen: ['DN 25','DN 32','DN 40','DN 50','DN 65','DN 80','DN 100','DN 125','DN 150'], gruppe: 'Anschlüsse', pflicht: true },

    { id: 'breite', label: 'Breite', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'tiefe', label: 'Tiefe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'gewicht', label: 'Gewicht', typ: 'number', einheit: 'kg', gruppe: 'Abmessungen' },

    { id: 'spannung', label: 'Spannung', typ: 'select', optionen: ['230V/50Hz','400V/50Hz'], gruppe: 'Elektro' },
    { id: 'schutzart', label: 'Schutzart', typ: 'text', gruppe: 'Elektro' },
    { id: 'steuerung', label: 'Steuerung', typ: 'text', gruppe: 'Elektro' },

    { id: 'svgwNr', label: 'SVGW-Zulassungsnummer', typ: 'text', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },

    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.volumenstrom && d.volumenstromMax){
      if(d.volumenstromMax >= b.volumenstrom) score += 50;
      else if(d.volumenstromMax >= b.volumenstrom * 0.8) score += 25;
    }
    if(b.nachdruck && d.druckMax){
      if(d.druckMax >= b.nachdruck) score += 40;
      else if(d.druckMax >= b.nachdruck * 0.9) score += 20;
    }
    if(b.bauart && d.bauart && d.bauart === b.bauart) score += 10;
    return Math.min(100, score);
  }
};

// ── Zirkulationspumpe (Warmwasser-Zirkulation) ──
// Lieferanten erfassen ihre Pumpen; sb_zirkulation.html matcht auf
// Foerderhoehe (mbar) + Volumenstrom (l/h) aus der Netzberechnung.
KATEGORIEN.zirkulationspumpe = {
  id: 'zirkulationspumpe',
  name: 'Zirkulationspumpe',
  icon: '🔄',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'regelungsart', label: 'Regelungsart', typ: 'select', optionen: ['Konstantdrehzahl','Drehzahlgeregelt (Δp konstant)','Drehzahlgeregelt (Δp variabel)','Temperaturgeführt'], gruppe: 'Allgemein', pflicht: true },

    { id: 'foerderhoeheMax', label: 'Max. Förderhöhe', typ: 'number', einheit: 'mbar', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'volumenstromMax', label: 'Max. Volumenstrom', typ: 'number', einheit: 'l/h', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'medienTempMax', label: 'Max. Medientemperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },
    { id: 'leistungMax', label: 'Leistungsaufnahme max.', typ: 'number', einheit: 'W', gruppe: 'Leistungsdaten' },
    { id: 'eei', label: 'Energieeffizienzindex EEI', typ: 'number', gruppe: 'Leistungsdaten' },

    { id: 'anschluss', label: 'Anschluss', typ: 'select', optionen: ['DN 15','DN 20','DN 25','DN 32','DN 40'], gruppe: 'Anschlüsse', pflicht: true },
    { id: 'einbaulaenge', label: 'Einbaulänge', typ: 'number', einheit: 'mm', gruppe: 'Anschlüsse' },
    { id: 'rvIntegriert', label: 'Rückflussverhinderer integriert', typ: 'checkbox', gruppe: 'Anschlüsse' },
    { id: 'absperrungIntegriert', label: 'Absperrungen integriert', typ: 'checkbox', gruppe: 'Anschlüsse' },

    { id: 'spannung', label: 'Spannung', typ: 'select', optionen: ['230V/50Hz','400V/50Hz'], gruppe: 'Elektro' },
    { id: 'schutzart', label: 'Schutzart', typ: 'text', gruppe: 'Elektro' },

    { id: 'svgwNr', label: 'SVGW-Zulassungsnummer', typ: 'text', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.foerderhoehe && d.foerderhoeheMax){
      if(d.foerderhoeheMax >= b.foerderhoehe) score += 45;
      else if(d.foerderhoeheMax >= b.foerderhoehe * 0.9) score += 20;
    }
    if(b.volumenstrom && d.volumenstromMax){
      if(d.volumenstromMax >= b.volumenstrom) score += 45;
      else if(d.volumenstromMax >= b.volumenstrom * 0.85) score += 20;
    }
    if(b.tempRl && d.medienTempMax){
      if(d.medienTempMax >= b.tempRl) score += 10;
    }
    return Math.min(100, score);
  }
};

// ── Sicherheitsventil (Trinkwasser) ──
// sb_druckanstieg.html matcht auf den berechneten Ansprechdruck [p SV].
KATEGORIEN.sicherheitsventil = {
  id: 'sicherheitsventil',
  name: 'Sicherheitsventil',
  icon: '🛡️',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'bauart', label: 'Bauart', typ: 'select', optionen: ['Membran-Sicherheitsventil','Feder-Sicherheitsventil (Eckform)','Feder-Sicherheitsventil (Durchgang)','Sicherheitsgruppe (mit RV)'], gruppe: 'Allgemein', pflicht: true },

    { id: 'ansprechdruck', label: 'Ansprechdruck (fix eingestellt)', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'abblaseleistung', label: 'Abblaseleistung', typ: 'number', einheit: 'kW', gruppe: 'Leistungsdaten' },
    { id: 'medienTempMax', label: 'Max. Medientemperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },

    { id: 'anschluss', label: 'Anschluss Eintritt', typ: 'select', optionen: ['DN 15 (½")','DN 20 (¾")','DN 25 (1")','DN 32 (1¼")','DN 40 (1½")','DN 50 (2")'], gruppe: 'Anschlüsse', pflicht: true },
    { id: 'austritt', label: 'Anschluss Austritt', typ: 'text', gruppe: 'Anschlüsse' },

    { id: 'svgwNr', label: 'SVGW-Zulassungsnummer', typ: 'text', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.ansprechdruck && d.ansprechdruck){
      const diff = Math.abs(parseFloat(d.ansprechdruck) - b.ansprechdruck);
      if(diff <= 0.5) score += 60;
      else if(diff <= 1.5) score += 35;
      else if(diff <= 3) score += 15;
    }
    if(b.ruhedruck && d.ansprechdruck && parseFloat(d.ansprechdruck) > b.ruhedruck) score += 25;
    if(d.anschluss) score += 10;
    if(d.svgwNr) score += 5;
    return Math.min(100, score);
  }
};

// ── Ausdehnungsgefäss (Heizung, HE301/01) ──
// hz_ausdehnungsgefaess.html matcht auf das berechnete Mindest-Nennvolumen VN,min + Gefässdruck PS.
KATEGORIEN.ausdehnungsgefaess = {
  id: 'ausdehnungsgefaess',
  name: 'Ausdehnungsgefäss',
  icon: '🫧',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'bauart', label: 'Bauart', typ: 'select', optionen: ['Membran-Ausdehnungsgefäss','Blasen-Ausdehnungsgefäss','Kompressorgehaltene Druckhaltung','Pumpengehaltene Druckhaltung'], gruppe: 'Allgemein', pflicht: true },

    { id: 'nennvolumen', label: 'Nennvolumen', typ: 'number', einheit: 'Liter', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'maxDruck', label: 'Zul. Betriebsdruck PS', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'vordruckWerk', label: 'Vordruck ab Werk', typ: 'number', einheit: 'bar', gruppe: 'Leistungsdaten' },
    { id: 'medienTempMax', label: 'Max. Medientemperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },

    { id: 'anschluss', label: 'Anschluss', typ: 'text', gruppe: 'Anschlüsse' },

    { id: 'ce', label: 'CE-Konformität (Druckgeräterichtlinie)', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.vnMin && d.nennvolumen){
      const vn = parseFloat(d.nennvolumen);
      if(vn >= b.vnMin && vn <= b.vnMin * 2) score += 55;
      else if(vn >= b.vnMin) score += 35;
      else if(vn >= b.vnMin * 0.9) score += 10;
    }
    if(b.gefaessdruck && d.maxDruck && parseFloat(d.maxDruck) >= b.gefaessdruck) score += 30;
    if(d.vordruckWerk) score += 10;
    if(d.ce) score += 5;
    return Math.min(100, score);
  }
};

// ── Heizungs-Umwälzpumpe ──
// hz_heizungsleitungen.html matcht auf Förderhöhe (kPa) + Volumenstrom (m³/h)
// der massgebenden Heizgruppe.
KATEGORIEN.heizungspumpe = {
  id: 'heizungspumpe',
  name: 'Heizungs-Umwälzpumpe',
  icon: '♨️',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'regelungsart', label: 'Regelungsart', typ: 'select', optionen: ['Konstantdrehzahl','Drehzahlgeregelt (Δp konstant)','Drehzahlgeregelt (Δp variabel)','Temperaturgeführt'], gruppe: 'Allgemein', pflicht: true },

    { id: 'foerderhoeheMax', label: 'Max. Förderhöhe', typ: 'number', einheit: 'kPa', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'volumenstromMax', label: 'Max. Volumenstrom', typ: 'number', einheit: 'm³/h', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'medienTempMax', label: 'Max. Medientemperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },
    { id: 'leistungMax', label: 'Leistungsaufnahme max.', typ: 'number', einheit: 'W', gruppe: 'Leistungsdaten' },
    { id: 'eei', label: 'Energieeffizienzindex EEI', typ: 'number', gruppe: 'Leistungsdaten' },

    { id: 'anschluss', label: 'Anschluss', typ: 'select', optionen: ['DN 25','DN 32','DN 40','DN 50','DN 65','DN 80','DN 100'], gruppe: 'Anschlüsse', pflicht: true },
    { id: 'einbaulaenge', label: 'Einbaulänge', typ: 'number', einheit: 'mm', gruppe: 'Anschlüsse' },

    { id: 'spannung', label: 'Spannung', typ: 'select', optionen: ['230V/50Hz','400V/50Hz'], gruppe: 'Elektro' },
    { id: 'schutzart', label: 'Schutzart', typ: 'text', gruppe: 'Elektro' },

    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.foerderhoehe && d.foerderhoeheMax){
      if(d.foerderhoeheMax >= b.foerderhoehe) score += 45;
      else if(d.foerderhoeheMax >= b.foerderhoehe * 0.9) score += 20;
    }
    if(b.volumenstrom && d.volumenstromMax){
      if(d.volumenstromMax >= b.volumenstrom) score += 45;
      else if(d.volumenstromMax >= b.volumenstrom * 0.85) score += 20;
    }
    if(b.vlTemp && d.medienTempMax){
      if(d.medienTempMax >= b.vlTemp) score += 10;
    }
    return Math.min(100, score);
  }
};

// ── Wärmeerzeuger (Wärmepumpe / Kessel) ──
// hz_waermegruppen.html matcht auf die erforderliche Wärmeerzeugerleistung Φgen,out (SIA 384/1).
KATEGORIEN.waermeerzeuger = {
  id: 'waermeerzeuger',
  name: 'Wärmeerzeuger',
  icon: '🔥',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'bauart', label: 'Bauart', typ: 'select', optionen: ['Wärmepumpe Luft/Wasser','Wärmepumpe Sole/Wasser','Wärmepumpe Wasser/Wasser','Gaskessel (Brennwert)','Pelletkessel','Stückholzkessel','Ölkessel','Fernwärme-Übergabestation','Elektroheizeinsatz'], gruppe: 'Allgemein', pflicht: true },

    { id: 'heizleistung', label: 'Heizleistung (Auslegungspunkt)', typ: 'number', einheit: 'kW', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'leistungMin', label: 'Min. Leistung (Modulation)', typ: 'number', einheit: 'kW', gruppe: 'Leistungsdaten' },
    { id: 'cop', label: 'COP / Wirkungsgrad', typ: 'number', gruppe: 'Leistungsdaten' },
    { id: 'vlTempMax', label: 'Max. Vorlauftemperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },
    { id: 'kaeltemittel', label: 'Kältemittel', typ: 'text', gruppe: 'Leistungsdaten' },
    { id: 'schallleistung', label: 'Schallleistungspegel', typ: 'number', einheit: 'dB(A)', gruppe: 'Leistungsdaten' },

    { id: 'spannung', label: 'Spannung', typ: 'select', optionen: ['230V/50Hz','400V/50Hz'], gruppe: 'Elektro' },

    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.leistungGenOut && d.heizleistung){
      const p = parseFloat(d.heizleistung);
      if(p >= b.leistungGenOut && p <= b.leistungGenOut * 1.5) score += 60;
      else if(p >= b.leistungGenOut) score += 35;
      else if(p >= b.leistungGenOut * 0.9) score += 15;
    }
    if(d.leistungMin) score += 10;
    if(d.cop) score += 10;
    if(d.vlTempMax) score += 5;
    return Math.min(100, score);
  }
};

// ── Frischwasserstation ──
KATEGORIEN.frischwasserstation = {
  id: 'frischwasserstation',
  name: 'Frischwasserstation',
  icon: '💧',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'bauart', label: 'Bauart', typ: 'select', optionen: ['Wandmontage','Standgerät','Kaskade'], gruppe: 'Allgemein', pflicht: true },

    { id: 'leistungNenn', label: 'Nennleistung (kW)', typ: 'number', einheit: 'kW', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'zapfleistungPeak', label: 'Peak-Zapfleistung (TWW/TKW)', typ: 'number', einheit: 'l/min', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'twwMax', label: 'Max. TWW-Temperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },
    { id: 'primaerVol', label: 'Primär-Vorlauftemperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },
    { id: 'waermetauscherFlaeche', label: 'Wärmetauscherfläche', typ: 'number', einheit: 'm²', gruppe: 'Leistungsdaten' },

    { id: 'anschlussPrim', label: 'Primär-Anschluss', typ: 'select', optionen: ['DN 20','DN 25','DN 32','DN 40','DN 50'], gruppe: 'Anschlüsse' },
    { id: 'anschlussSek', label: 'Sekundär-Anschluss', typ: 'select', optionen: ['DN 15','DN 20','DN 25','DN 32','DN 40'], gruppe: 'Anschlüsse' },

    { id: 'breite', label: 'Breite', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'tiefe', label: 'Tiefe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },

    { id: 'svgwNr', label: 'SVGW-Zulassungsnummer', typ: 'text', gruppe: 'Normen' },
    { id: 'sia385', label: 'Konform SIA 385/2', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },

    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.leistung && d.leistungNenn){
      if(d.leistungNenn >= b.leistung) score += 60;
      else if(d.leistungNenn >= b.leistung * 0.85) score += 30;
    }
    if(b.zapfleistung && d.zapfleistungPeak){
      if(d.zapfleistungPeak >= b.zapfleistung) score += 40;
      else if(d.zapfleistungPeak >= b.zapfleistung * 0.85) score += 20;
    }
    return Math.min(100, score);
  }
};

// ── Fettabscheider (SN EN 1825) ──
KATEGORIEN.fettabscheider = {
  id: 'fettabscheider',
  name: 'Fettabscheider',
  icon: '🫙',
  typenFelder: [
    { id: 'aufstellung', label: 'Aufstellung', typ: 'select', optionen: ['Frostfrei (innen)','Erdeingebaut','Freie Aufstellung'] }
  ],
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'aufstellung', label: 'Aufstellung', typ: 'select', optionen: ['Frostfrei (innen)','Erdeingebaut','Freie Aufstellung'], gruppe: 'Allgemein', pflicht: true },
    { id: 'material', label: 'Material', typ: 'select', optionen: ['PE','GFK','Edelstahl','Beton'], gruppe: 'Allgemein' },

    { id: 'ns', label: 'Nenngrösse NS', typ: 'number', einheit: 'l/s', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'schlammraum', label: 'Schlammraum VS', typ: 'number', einheit: 'l', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'fettspeicher', label: 'Fettspeicherraum', typ: 'number', einheit: 'l', gruppe: 'Leistungsdaten' },
    { id: 'gesamtvolumen', label: 'Gesamtvolumen', typ: 'number', einheit: 'l', gruppe: 'Leistungsdaten' },

    { id: 'zulaufDN', label: 'Zulauf DN', typ: 'select', optionen: ['DN 100','DN 125','DN 150','DN 200'], gruppe: 'Anschlüsse' },
    { id: 'ablaufDN', label: 'Ablauf DN', typ: 'select', optionen: ['DN 100','DN 125','DN 150','DN 200'], gruppe: 'Anschlüsse' },

    { id: 'laenge', label: 'Länge', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'breite', label: 'Breite', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'gewichtLeer', label: 'Gewicht leer', typ: 'number', einheit: 'kg', gruppe: 'Abmessungen' },

    { id: 'enNorm', label: 'EN-Norm', typ: 'text', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },

    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.ns && d.ns){
      if(d.ns >= b.ns) score += 70;
      else if(d.ns >= b.ns * 0.9) score += 35;
    }
    if(b.schlammraum && d.schlammraum){
      if(d.schlammraum >= b.schlammraum) score += 30;
    }
    return Math.min(100, score);
  }
};

// ── Öl- / Benzinabscheider (SN EN 858) ──
KATEGORIEN.oelabscheider = {
  id: 'oelabscheider',
  name: 'Öl- / Benzinabscheider',
  icon: '🛢️',
  typenFelder: [
    { id: 'klasse', label: 'Klasse', typ: 'select', optionen: ['Klasse I (Koaleszenz)','Klasse II (Schwerkraft)'] }
  ],
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'klasse', label: 'Klasse', typ: 'select', optionen: ['Klasse I (Koaleszenz)','Klasse II (Schwerkraft)'], gruppe: 'Allgemein', pflicht: true },
    { id: 'material', label: 'Material', typ: 'select', optionen: ['PE','GFK','Edelstahl','Beton'], gruppe: 'Allgemein' },

    { id: 'ns', label: 'Nenngrösse NS', typ: 'number', einheit: 'l/s', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'schlammraum', label: 'Schlammraum', typ: 'number', einheit: 'l', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'oelspeicher', label: 'Öl-Speicherraum', typ: 'number', einheit: 'l', gruppe: 'Leistungsdaten' },
    { id: 'maxAblauf', label: 'Max. Ablaufkonzentration', typ: 'number', einheit: 'mg/l', gruppe: 'Leistungsdaten' },

    { id: 'zulaufDN', label: 'Zulauf DN', typ: 'select', optionen: ['DN 100','DN 125','DN 150','DN 200','DN 250','DN 300'], gruppe: 'Anschlüsse' },
    { id: 'ablaufDN', label: 'Ablauf DN', typ: 'select', optionen: ['DN 100','DN 125','DN 150','DN 200','DN 250','DN 300'], gruppe: 'Anschlüsse' },

    { id: 'laenge', label: 'Länge', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'durchmesser', label: 'Durchmesser', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },

    { id: 'enNorm', label: 'EN-Norm', typ: 'text', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },

    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.ns && d.ns){
      if(d.ns >= b.ns) score += 70;
      else if(d.ns >= b.ns * 0.9) score += 35;
    }
    if(b.klasse && d.klasse && d.klasse === b.klasse) score += 30;
    return Math.min(100, score);
  }
};

// ── Schlammsammler / Absetzbecken ──
KATEGORIEN.schlammsammler = {
  id: 'schlammsammler',
  name: 'Schlammsammler',
  icon: '🪨',
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'bauform', label: 'Bauform', typ: 'select', optionen: ['Rund','Rechteckig','Schachtform'], gruppe: 'Allgemein' },
    { id: 'material', label: 'Material', typ: 'select', optionen: ['PE','GFK','Beton','Edelstahl'], gruppe: 'Allgemein' },

    { id: 'volumen', label: 'Nutzvolumen', typ: 'number', einheit: 'l', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'durchmesser', label: 'Innendurchmesser D', typ: 'number', einheit: 'mm', gruppe: 'Leistungsdaten' },
    { id: 'absetzflaeche', label: 'Absetzfläche', typ: 'number', einheit: 'm²', gruppe: 'Leistungsdaten' },
    { id: 'verweilzeit', label: 'Mindest-Verweilzeit', typ: 'number', einheit: 'min', gruppe: 'Leistungsdaten' },

    { id: 'zulaufDN', label: 'Zulauf DN', typ: 'select', optionen: ['DN 100','DN 125','DN 150','DN 200','DN 250','DN 300'], gruppe: 'Anschlüsse' },
    { id: 'ablaufDN', label: 'Ablauf DN', typ: 'select', optionen: ['DN 100','DN 125','DN 150','DN 200','DN 250','DN 300'], gruppe: 'Anschlüsse' },

    { id: 'laenge', label: 'Länge', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },

    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.volumen && d.volumen){
      if(d.volumen >= b.volumen) score += 70;
      else if(d.volumen >= b.volumen * 0.9) score += 35;
    }
    if(b.durchmesser && d.durchmesser){
      if(d.durchmesser >= b.durchmesser) score += 30;
    }
    return Math.min(100, score);
  }
};

// ── Thermische Solaranlage (Kollektoren) ──
KATEGORIEN.thermische_solaranlage = {
  id: 'thermische_solaranlage',
  name: 'Thermische Solaranlage',
  icon: '☀️',
  typenFelder: [
    { id: 'kollektortyp', label: 'Kollektortyp', typ: 'select', optionen: ['Flachkollektor','Röhrenkollektor (Vakuum)','Luftkollektor'] }
  ],
  felder: [
    { id: 'serie', label: 'Typenbezeichnung / Serie', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'modell', label: 'Modell / Grösse', typ: 'text', gruppe: 'Allgemein', pflicht: true },
    { id: 'artikelnr', label: 'Artikelnummer', typ: 'text', gruppe: 'Allgemein' },
    { id: 'kollektortyp', label: 'Kollektortyp', typ: 'select', optionen: ['Flachkollektor','Röhrenkollektor (Vakuum)','Luftkollektor'], gruppe: 'Allgemein', pflicht: true },

    { id: 'bruttoflaeche', label: 'Bruttofläche', typ: 'number', einheit: 'm²', gruppe: 'Leistungsdaten', pflicht: true },
    { id: 'aperturflaeche', label: 'Aperturfläche', typ: 'number', einheit: 'm²', gruppe: 'Leistungsdaten' },
    { id: 'absorberflaeche', label: 'Absorberfläche', typ: 'number', einheit: 'm²', gruppe: 'Leistungsdaten' },
    { id: 'eta0', label: 'Optischer Wirkungsgrad η₀', typ: 'number', gruppe: 'Leistungsdaten' },
    { id: 'a1', label: 'a1 (linear)', typ: 'number', einheit: 'W/m²K', gruppe: 'Leistungsdaten' },
    { id: 'a2', label: 'a2 (quadratisch)', typ: 'number', einheit: 'W/m²K²', gruppe: 'Leistungsdaten' },
    { id: 'ertragJahr', label: 'Jahresertrag (CH Mittelland)', typ: 'number', einheit: 'kWh/m²·a', gruppe: 'Leistungsdaten' },
    { id: 'stagnationsT', label: 'Stagnationstemperatur', typ: 'number', einheit: '°C', gruppe: 'Leistungsdaten' },

    { id: 'absorberMat', label: 'Absorber-Material', typ: 'select', optionen: ['Kupfer','Aluminium','Stahl'], gruppe: 'Material' },
    { id: 'absorberBeschicht', label: 'Absorberbeschichtung', typ: 'text', gruppe: 'Material' },

    { id: 'laenge', label: 'Länge', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'breite', label: 'Breite', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'hoehe', label: 'Höhe', typ: 'number', einheit: 'mm', gruppe: 'Abmessungen' },
    { id: 'gewicht', label: 'Gewicht', typ: 'number', einheit: 'kg', gruppe: 'Abmessungen' },

    { id: 'solarKeymark', label: 'Solar Keymark', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'en12975', label: 'EN 12975', typ: 'checkbox', gruppe: 'Normen' },
    { id: 'ce', label: 'CE-Konformität', typ: 'checkbox', gruppe: 'Normen' },

    { id: 'besonderheiten', label: 'Besonderheiten', typ: 'textarea', gruppe: 'Zusatz' }
  ],
  matchFn: function(produkt, berechnung){
    let score = 0;
    const d = produkt.daten || {};
    const b = berechnung || {};
    if(b.flaeche && d.bruttoflaeche){
      var ratio = d.bruttoflaeche / b.flaeche;
      if(ratio >= 0.9 && ratio <= 1.2) score += 70;
      else if(ratio >= 0.8 && ratio < 0.9) score += 35;
    }
    if(b.kollektortyp && d.kollektortyp && d.kollektortyp === b.kollektortyp) score += 30;
    return Math.min(100, score);
  }
};

// Werkzeuge & Maschinen — Lieferanten-Produktkatalog fuers Werkzeug-
// management (if_werkzeug.html). KEIN matchFn (kein Berechnungs-Matching);
// die Produkte speisen das Erfassungs-Autocomplete des Unternehmers und
// die Direkteinbuchung durch den Lieferanten. Feldtyp 'bild' wird vom
// Dashboard-Editor als Upload mit Vorschau gerendert (GemaStorage,
// Fallback Base64) — echtes Produktbild statt Emoji.
KATEGORIEN.werkzeuge = {
  id: 'werkzeuge',
  name: 'Werkzeuge & Maschinen',
  icon: '🔧',
  felder: [
    { id:'serie',  label:'Hersteller', typ:'text', pflicht:true,  gruppe:'Allgemein' },
    { id:'modell', label:'Modell',     typ:'text', pflicht:true,  gruppe:'Allgemein' },
    { id:'bezeichnung', label:'Geräte-Bezeichnung', typ:'text', pflicht:true, gruppe:'Allgemein' },
    { id:'artikelnr', label:'Artikel-Nr.', typ:'text', gruppe:'Allgemein' },
    { id:'werkzeugKategorie', label:'Werkzeug-Kategorie', typ:'select',
      optionen:['Maschine (Akku)','Maschine (Kabel)','Handwerkzeug','Leiter / Gerüst','Messgerät','Ladegerät','Zubehör','Sonstiges'],
      pflicht:true, gruppe:'Allgemein' },
    { id:'bild', label:'Produktbild', typ:'bild', gruppe:'Allgemein' },
    { id:'beschreibung', label:'Beschreibung', typ:'textarea', gruppe:'Allgemein' },
    { id:'leistung',  label:'Leistung', einheit:'W', typ:'number', gruppe:'Leistungsdaten' },
    { id:'spannung',  label:'Akku-/Netzspannung', einheit:'V', typ:'text', gruppe:'Leistungsdaten' },
    { id:'gewicht',   label:'Gewicht', einheit:'kg', typ:'number', gruppe:'Leistungsdaten' },
    { id:'masse',     label:'Masse (L×B×H)', einheit:'mm', typ:'text', gruppe:'Leistungsdaten' },
    { id:'pruefpflichtNiv', label:'Elektroprüfung (NIV) erforderlich', typ:'checkbox', gruppe:'Prüfungen' },
    { id:'pruefintervall',  label:'Empf. Prüfintervall', einheit:'Monate', typ:'number', gruppe:'Prüfungen' },
    { id:'listenpreis', label:'Listenpreis (CHF)', typ:'number', gruppe:'Bestellung' },
    { id:'lieferzeit',  label:'Lieferzeit', typ:'text', gruppe:'Bestellung' },
    { id:'garantie',    label:'Garantie', einheit:'Monate', typ:'number', gruppe:'Bestellung' },
    { id:'zubehoer',    label:'Lieferumfang / Zubehör', typ:'textarea', gruppe:'Zusatz' }
  ]
};

// ── Public API ──
function getKategorien(){ return Object.values(KATEGORIEN); }
function getKategorie(id){ return KATEGORIEN[id] || null; }
function registerKategorie(id, schema){ KATEGORIEN[id] = schema; }

function getProdukte(kategorie, filter){
  let list = _data.produkte.filter(p => p.kategorie === kategorie);
  if(filter){
    if(filter.lieferantId) list = list.filter(p => p.lieferantId === filter.lieferantId);
    if(filter.status) list = list.filter(p => p.status === filter.status);
    if(filter.nurFreigegeben) list = list.filter(p => p.status === 'verifiziert' || p.status === 'nicht_verifiziert');
    if(filter.serie) list = list.filter(p => (p.daten?.serie||'').toLowerCase().includes(filter.serie.toLowerCase()));
  }
  return list;
}

function getProdukt(id){ return _data.produkte.find(p => p.id === id) || null; }

function match(kategorie, berechnungswerte){
  const kat = KATEGORIEN[kategorie];
  if(!kat || !kat.matchFn) return [];
  const results = getProdukte(kategorie, { nurFreigegeben: true })
    .map(p => ({ ...p, _score: kat.matchFn(p, berechnungswerte) }))
    .filter(p => p._score > 0);

  // Premium-aware sorting: Premium > Verifiziert > Score
  results.sort((a, b) => {
    const liefA = getLieferant(a.lieferantId);
    const liefB = getLieferant(b.lieferantId);
    // 1. Premium-Lieferanten oben
    const premA = (liefA && liefA.premium && liefA.premium.aktiv) ? (liefA.premium.sortPriority || 100) : 0;
    const premB = (liefB && liefB.premium && liefB.premium.aktiv) ? (liefB.premium.sortPriority || 100) : 0;
    if(premA !== premB) return premB - premA;
    // 2. Verifizierte vor nicht-verifizierten
    const verA = a.status === 'verifiziert' ? 1 : 0;
    const verB = b.status === 'verifiziert' ? 1 : 0;
    if(verA !== verB) return verB - verA;
    // 3. Match-Score
    return b._score - a._score;
  });

  // Attach premium info for UI
  results.forEach(p => {
    const lief = getLieferant(p.lieferantId);
    p._premium = (lief && lief.premium && lief.premium.aktiv) ? lief.premium : null;
    p._lieferant = lief || null;
  });

  return results;
}

function createProdukt(kategorie, lieferantId, lieferantFirma, daten, quelle){
  const id = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2,6);
  const isAdmin = quelle === 'admin';
  const p = {
    id,
    kategorie,
    lieferantId: lieferantId || '',
    lieferantFirma: lieferantFirma || '',
    daten: daten || {},
    dokumente: [], // [{name, typ:'pdf'|'bild'|'zertifikat', datum}]
    status: isAdmin ? 'nicht_verifiziert' : 'entwurf',
    quelle: quelle || 'lieferant', // 'lieferant' | 'admin'
    erstelltVon: '',
    erstelltAm: new Date().toISOString(),
    geaendertVon: '',
    geaendertAm: '',
    verifiziertVon: '',
    verifiziertAm: '',
    log: []
  };
  // Set creator
  p.erstelltVon = _getUsername();
  _data.produkte.push(p);
  addLog(p, 'erstellt', isAdmin ? 'Von Admin erfasst' : 'Von Lieferant erfasst');
  save();
  return p;
}

function updateProdukt(id, daten, dokumente){
  const p = _data.produkte.find(x => x.id === id);
  if(!p) return null;
  if(daten) p.daten = { ...p.daten, ...daten };
  if(dokumente) p.dokumente = dokumente;
  p.geaendertAm = new Date().toISOString();
  p.geaendertVon = _getUsername();
  // Re-Verifizierung: jede Änderung setzt Status zurück
  if(p.status === 'verifiziert'){
    p.status = 'entwurf';
    addLog(p, 'Status', 'verifiziert → entwurf (Daten geändert, erneute Bestätigung nötig)');
  }
  addLog(p, 'geändert', 'Daten aktualisiert');
  save();
  return p;
}

function setStatus(id, status){
  const p = _data.produkte.find(x => x.id === id);
  if(!p) return null;
  const oldStatus = p.status;
  p.status = status;
  if(status === 'verifiziert'){
    p.verifiziertAm = new Date().toISOString();
    p.verifiziertVon = _getUsername();
  }
  addLog(p, 'Status', oldStatus + ' → ' + status);
  save();
  return p;
}

function deleteProdukt(id){
  _data.produkte = _data.produkte.filter(p => p.id !== id);
  save();
}

function getLieferanten(kategorie){
  // New: return from lieferanten registry if available
  if(_liefData.lieferanten.length > 0){
    let list = _liefData.lieferanten.filter(l => l.status === 'aktiv');
    if(kategorie){
      const prodLiefIds = new Set(_data.produkte.filter(p => p.kategorie === kategorie).map(p => p.lieferantId));
      list = list.filter(l => prodLiefIds.has(l.id));
    }
    return list;
  }
  // Fallback: derive from products (legacy)
  const prods = kategorie ? _data.produkte.filter(p => p.kategorie === kategorie) : _data.produkte;
  const map = {};
  prods.forEach(p => {
    if(p.lieferantFirma && !map[p.lieferantId||p.lieferantFirma]){
      map[p.lieferantId||p.lieferantFirma] = { id: p.lieferantId, firma: p.lieferantFirma, status: 'aktiv' };
    }
  });
  return Object.values(map);
}

// ── Lieferant CRUD ──
function getLieferant(id){
  return _liefData.lieferanten.find(l => l.id === id) || null;
}

function getAllLieferanten(){ return _liefData.lieferanten; }

function createLieferant(daten){
  const id = 'lief_' + Date.now() + '_' + Math.random().toString(36).substring(2,6);
  const l = {
    id,
    orgId: daten.orgId || 'org_default',
    firma: daten.firma || '',
    rechtsform: daten.rechtsform || '',
    uid: daten.uid || '',
    branche: daten.branche || [],
    kontaktPerson: daten.kontaktPerson || '',
    kontaktPersonen: daten.kontaktPersonen || [],
    email: daten.email || '',
    telefon: daten.telefon || '',
    website: daten.website || '',
    adresse: daten.adresse || { strasse:'', plz:'', ort:'', kanton:'', land:'CH' },
    logo: daten.logo || '',
    beschreibung: daten.beschreibung || '',
    status: 'aktiv', // Sofort aktiv nach Registrierung
    abo: daten.abo || {
      typ: 'basis',
      status: 'testphase',
      startDatum: new Date().toISOString().split('T')[0],
      endDatum: '',
      testphaseEnde: _addDays(new Date(), 30).toISOString().split('T')[0],
      zahlungsart: 'rechnung',
      jahrespreis: 1200,
      letzteZahlung: '',
      mahnungen: 0
    },
    premium: daten.premium || { aktiv: false, platzierung: 'none', kategorien: [], badge: '', sortPriority: 0 },
    lieferantKategorien: daten.lieferantKategorien || [],
    erstelltAm: new Date().toISOString(),
    erstelltVon: _getUsername(),
    deaktiviertAm: '',
    deaktiviertVon: '',
    deaktiviertGrund: '',
    letzterLogin: '',
    produkteCount: 0,
    verifizierteCount: 0
  };
  _liefData.lieferanten.push(l);
  save();
  return l;
}

function updateLieferant(id, felder){
  const l = _liefData.lieferanten.find(x => x.id === id);
  if(!l) return null;
  Object.keys(felder).forEach(k => {
    if(k !== 'id' && k !== 'erstelltAm' && k !== 'erstelltVon') l[k] = felder[k];
  });
  save();
  return l;
}

function deactivateLieferant(id, grund){
  const l = _liefData.lieferanten.find(x => x.id === id);
  if(!l) return null;
  l.status = 'inaktiv';
  l.deaktiviertAm = new Date().toISOString();
  l.deaktiviertVon = _getUsername();
  l.deaktiviertGrund = grund || '';
  save();
  return l;
}

function activateLieferant(id){
  const l = _liefData.lieferanten.find(x => x.id === id);
  if(!l) return null;
  l.status = 'aktiv';
  l.deaktiviertAm = '';
  l.deaktiviertVon = '';
  l.deaktiviertGrund = '';
  save();
  return l;
}

function deleteLieferant(id){
  _liefData.lieferanten = _liefData.lieferanten.filter(l => l.id !== id);
  save();
}

// ── Lieferanten-Suche (Duplikat-Vermeidung) ──
function searchLieferanten(query){
  if(!query||query.length<2)return[];
  const q=query.toLowerCase();
  return _liefData.lieferanten.filter(function(l){
    return (l.firma&&l.firma.toLowerCase().indexOf(q)>=0)
      ||(l.email&&l.email.toLowerCase().indexOf(q)>=0)
      ||(l.kontaktPerson&&l.kontaktPerson.toLowerCase().indexOf(q)>=0);
  });
}

// ── Schnell-Erfassung (Firma + E-Mail, minimal) ──
function quickCreateLieferant(firma,email,erstelltVon){
  // Prüfe Duplikat per E-Mail
  if(email){
    var existing=_liefData.lieferanten.find(function(l){
      return l.email&&l.email.toLowerCase()===email.toLowerCase();
    });
    if(existing)return existing;
  }
  // Prüfe Duplikat per Firma (exakter Match)
  if(firma){
    var byFirma=_liefData.lieferanten.find(function(l){
      return l.firma&&l.firma.toLowerCase()===firma.toLowerCase();
    });
    if(byFirma)return byFirma;
  }
  return createLieferant({firma:firma,email:email,erstelltVon:erstelltVon||''});
}

// ── Offertanfrage-Vormerkungen (für spätere Ausschreibung) ──
const SK_VM='gema_offert_vormerkungen_v1';
let _vormerkungen=[];
function _loadVormerkungen(){try{var r=localStorage.getItem(SK_VM);if(r)_vormerkungen=JSON.parse(r);}catch(e){}_vormerkungen=_vormerkungen||[];}
function _saveVormerkungen(){try{localStorage.setItem(SK_VM,JSON.stringify(_vormerkungen));}catch(e){}}
_loadVormerkungen();

function addVormerkung(daten){
  // daten: {objektId, lieferantId, lieferantFirma, produktId, produktName, kategorie, modulKey, bkpCode, bruttoPreis, offertanfrageId}
  var vm={
    id:'vm_'+Date.now(),
    objektId:daten.objektId||'',
    lieferantId:daten.lieferantId||'',
    lieferantFirma:daten.lieferantFirma||'',
    produktId:daten.produktId||'',
    produktName:daten.produktName||'',
    kategorie:daten.kategorie||'',
    modulKey:daten.modulKey||'',
    bkpCode:daten.bkpCode||'',
    bruttoPreis:daten.bruttoPreis||0,
    offertanfrageId:daten.offertanfrageId||'',
    status:'vorgemerkt',
    erstelltAm:new Date().toISOString(),
    uebernommenAm:null
  };
  _vormerkungen.push(vm);
  _saveVormerkungen();
  return vm;
}

function getVormerkungen(objektId){
  return _vormerkungen.filter(function(v){return v.objektId===objektId&&v.status==='vorgemerkt';});
}

function markVormerkungUebernommen(vmId){
  var vm=_vormerkungen.find(function(v){return v.id===vmId;});
  if(vm){vm.status='uebernommen';vm.uebernommenAm=new Date().toISOString();_saveVormerkungen();}
}

function _refreshLieferantCounts(){
  _liefData.lieferanten.forEach(l => {
    const prods = _data.produkte.filter(p => p.lieferantId === l.id);
    l.produkteCount = prods.length;
    l.verifizierteCount = prods.filter(p => p.status === 'verifiziert').length;
  });
}

// ── Dokumente pro Produkt ──
function addDokument(produktId, dok){
  const p = _data.produkte.find(x => x.id === produktId);
  if(!p) return null;
  if(!p.dokumente) p.dokumente = [];
  const d = {
    id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2,4),
    name: dok.name || '',
    typ: dok.typ || 'datenblatt',
    format: dok.format || 'pdf',
    sprache: dok.sprache || '', // #38: DE/FR/IT/EN
    datum: new Date().toISOString().split('T')[0],
    groesse: dok.groesse || 0,
    hochgeladenVon: _getUsername(),
    dataUrl: dok.dataUrl || '' // base64 for localStorage (temp, migrate to Supabase later)
  };
  p.dokumente.push(d);
  addLog(p, 'Dokument', 'Hochgeladen: ' + d.name);
  save();
  return d;
}

function removeDokument(produktId, dokId){
  const p = _data.produkte.find(x => x.id === produktId);
  if(!p || !p.dokumente) return false;
  const idx = p.dokumente.findIndex(d => d.id === dokId);
  if(idx < 0) return false;
  const name = p.dokumente[idx].name;
  p.dokumente.splice(idx, 1);
  addLog(p, 'Dokument', 'Entfernt: ' + name);
  save();
  return true;
}

function getDokumente(produktId){
  const p = _data.produkte.find(x => x.id === produktId);
  return (p && p.dokumente) ? p.dokumente : [];
}

// ── Helpers ──
function _getUsername(){
  try { if(typeof GemaAuth !== 'undefined'){ const u = GemaAuth.getCurrentUser(); if(u) return u.name || u.username || ''; } } catch(e){}
  return '';
}
function _getUserId(){
  try { if(typeof GemaAuth !== 'undefined'){ const u = GemaAuth.getCurrentUser(); if(u) return u.id || ''; } } catch(e){}
  return '';
}
function _getUserRolle(){
  try {
    if(typeof GemaAuth !== 'undefined'){
      const u = GemaAuth.getCurrentUser();
      if(u && u.roleIds){
        if(u.roleIds.indexOf('role_unternehmer') >= 0) return 'unternehmer';
        if(u.roleIds.indexOf('role_planer') >= 0) return 'planer';
        if(u.roleIds.indexOf('role_admin') >= 0) return 'planer';
      }
    }
  } catch(e){}
  return 'planer';
}
function _getUserFirma(){
  try { if(typeof GemaAuth !== 'undefined'){ const u = GemaAuth.getCurrentUser(); if(u) return u.firma || u.orgName || ''; } } catch(e){}
  return '';
}
function _addDays(d, n){ const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// ── Offertanfragen ──
const OA_STATUS = {
  offen:       { label: 'Offen',        icon: '📨', cls: 'oa-offen' },
  beantwortet: { label: 'Beantwortet',  icon: '✉️', cls: 'oa-beantwortet' },
  abgelehnt:   { label: 'Abgelehnt',    icon: '✕',  cls: 'oa-abgelehnt' },
  abgelaufen:  { label: 'Abgelaufen',   icon: '⏰', cls: 'oa-abgelaufen' }
};

// ── Notifikations-Helper (best-effort, nur wenn gema_notify.js geladen) ──
// An den Lieferanten: bevorzugt alle User mit expliziter lieferantId-
// Verknuepfung; Fallback auf die Lieferanten-Org (nie org_default, sonst
// wuerde die ganze GEMA-Org benachrichtigt).
function _notifyLieferant(oa, opts){
  if(typeof window === 'undefined' || typeof window.GemaNotify === 'undefined') return;
  try{
    var pushed = false;
    if(oa.lieferantId && typeof window.GemaAuth !== 'undefined' && window.GemaAuth.getUsers){
      (window.GemaAuth.getUsers() || []).forEach(function(u){
        if(u && u.lieferantId === oa.lieferantId && u.active !== false){
          window.GemaNotify.push(Object.assign({ empfaengerUserId: u.id }, opts));
          pushed = true;
        }
      });
    }
    if(!pushed){
      var lief = getLieferant(oa.lieferantId);
      if(lief && lief.orgId && lief.orgId !== 'org_default'){
        window.GemaNotify.push(Object.assign({ empfaengerOrgId: lief.orgId }, opts));
      }
    }
  }catch(e){}
}

// An den anfragenden Planer (Absender der Offertanfrage).
function _notifyAbsender(oa, opts){
  if(typeof window === 'undefined' || typeof window.GemaNotify === 'undefined') return;
  if(!oa.absenderId) return;
  try{
    var link = 'pm_objekte.html?tab=offerten';
    if(oa.projekt && oa.projekt.objektId) link += '&objekt=' + encodeURIComponent(oa.projekt.objektId);
    window.GemaNotify.push(Object.assign({
      empfaengerUserId: oa.absenderId,
      link: link,
      objektId: (oa.projekt && oa.projekt.objektId) || ''
    }, opts));
  }catch(e){}
}

function createOffertanfrage(opts){
  const id = 'oa_' + Date.now() + '_' + Math.random().toString(36).substring(2,6);
  const fristTage = opts.fristTage || 14;
  // Projekt-Infos aus dem GEMA-Objekt anreichern (Name, Nummer, Adresse).
  // WICHTIG: Der Lieferant hat KEINEN Zugriff auf die Objekte fremder Orgs
  // (GemaObjekte filtert auf die eigene Org) — alles, was er zum Erstellen
  // der Offerte braucht, muss deshalb hier in den OA-Record kopiert werden.
  const projekt = Object.assign({ name:'', ort:'', objektId:'' }, opts.projekt || {});
  if(projekt.objektId && typeof window !== 'undefined' && window.GemaObjekte && window.GemaObjekte.getAll){
    try{
      const obj = (window.GemaObjekte.getAll() || []).find(o => o.id === projekt.objektId);
      if(obj){
        if(!projekt.name) projekt.name = obj.name || obj.projekt || '';
        if(obj.nummer && !projekt.nummer) projekt.nummer = obj.nummer;
        const adr = [obj.strasse, [obj.plz, obj.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        if(adr && !projekt.adresse) projekt.adresse = adr;
        if(!projekt.ort && obj.ort) projekt.ort = obj.ort;
      }
    }catch(e){}
  }
  const oa = {
    id,
    absenderId: _getUserId(),
    absenderName: _getUsername(),
    absenderRolle: _getUserRolle(),
    absenderFirma: opts.absenderFirma || _getUserFirma(),
    lieferantId: opts.lieferantId || '',
    lieferantFirma: opts.lieferantFirma || '',
    produktId: opts.produktId || '',
    produktName: opts.produktName || '',
    kategorie: opts.kategorie || '',
    berechnungswerte: opts.berechnungswerte || {},
    projekt: projekt,
    nachricht: opts.nachricht || '',
    status: 'offen',
    frist: _addDays(new Date(), fristTage).toISOString().split('T')[0],
    erstelltAm: new Date().toISOString(),
    antwort: null
  };
  _oaData.anfragen.push(oa);
  save();
  _notifyLieferant(oa, {
    eventKey: 'offertanfrage_neu',
    modul: 'produktkatalog',
    typ: 'aktion',
    titel: '📨 Neue Offertanfrage: ' + (oa.produktName || oa.kategorie || 'Anlage'),
    text: 'Von ' + (oa.absenderName || '—') + (oa.absenderFirma ? ' · ' + oa.absenderFirma : '')
      + (oa.projekt && oa.projekt.name ? ' · Projekt: ' + oa.projekt.name : '')
      + ' · Frist: ' + oa.frist,
    link: 'sys_lieferant_dashboard.html',
    objektId: (oa.projekt && oa.projekt.objektId) || ''
  });
  return oa;
}

function getOffertanfragen(filter){
  let list = _oaData.anfragen.slice();
  if(filter){
    if(filter.absenderId) list = list.filter(a => a.absenderId === filter.absenderId);
    if(filter.lieferantId) list = list.filter(a => a.lieferantId === filter.lieferantId);
    if(filter.produktId) list = list.filter(a => a.produktId === filter.produktId);
    if(filter.kategorie) list = list.filter(a => a.kategorie === filter.kategorie);
    if(filter.status) list = list.filter(a => a.status === filter.status);
  }
  // Check for expired
  const today = new Date().toISOString().split('T')[0];
  list.forEach(a => {
    if(a.status === 'offen' && a.frist && a.frist < today) a.status = 'abgelaufen';
  });
  return list.sort((a,b) => b.erstelltAm.localeCompare(a.erstelltAm));
}

function getOffertanfrage(id){
  return _oaData.anfragen.find(a => a.id === id) || null;
}

function beantworteOffertanfrage(id, antwort){
  const oa = _oaData.anfragen.find(a => a.id === id);
  if(!oa) return null;
  oa.status = 'beantwortet';
  oa.antwort = {
    nachricht: antwort.nachricht || '',
    pdfName: antwort.pdfName || '',
    pdfUrl: antwort.pdfUrl || '',           // Supabase-Storage-URL (bevorzugt)
    pdfDataUrl: antwort.pdfDataUrl || '',   // Base64-Fallback (nur wenn Upload fehlschlug)
    produktId: antwort.produktId || '',
    bruttoPreis: antwort.bruttoPreis || 0,
    beantwortetAm: new Date().toISOString(),
    beantwortetVon: _getUsername()
  };
  save();
  _notifyAbsender(oa, {
    eventKey: 'offertanfrage_beantwortet',
    modul: 'produktkatalog',
    typ: 'erfolg',
    titel: '✉ Offerte erhalten: ' + (oa.lieferantFirma || '—'),
    text: (oa.produktName || oa.kategorie || 'Anlage')
      + (oa.antwort.bruttoPreis ? ' · CHF ' + oa.antwort.bruttoPreis : '')
      + (oa.antwort.pdfName ? ' · 📄 ' + oa.antwort.pdfName : '')
      + (oa.projekt && oa.projekt.name ? ' · Projekt: ' + oa.projekt.name : '')
  });
  // Automatische Vormerkung für Ausschreibung erstellen
  if(oa.projekt && oa.projekt.objektId){
    var bkpMap={enthaertung:'253.0',osmose:'253.2',druckerhoehung:'253.4',frischwasserstation:'253.6',
      hebeanlage:'252.6',fettabscheider:'252.4',oelabscheider:'252.8',zirkulation:'253.8',zirkulationspumpe:'253.8',sicherheitsventil:'254.0',ausdehnungsgefaess:'242.0',heizungspumpe:'243.0',waermeerzeuger:'242.0'};
    addVormerkung({
      objektId:oa.projekt.objektId,
      lieferantId:oa.lieferantId||'',
      lieferantFirma:oa.lieferantFirma||'',
      produktId:oa.produktId||'',
      produktName:oa.produktName||'',
      kategorie:oa.kategorie||'',
      modulKey:oa.kategorie||'',
      bkpCode:bkpMap[oa.kategorie]||'',
      bruttoPreis:antwort.bruttoPreis||0,
      offertanfrageId:oa.id
    });
  }
  return oa;
}

function ablehnenOffertanfrage(id, grund){
  const oa = _oaData.anfragen.find(a => a.id === id);
  if(!oa) return null;
  oa.status = 'abgelehnt';
  oa.antwort = {
    nachricht: grund || 'Offertanfrage abgelehnt.',
    beantwortetAm: new Date().toISOString(),
    beantwortetVon: _getUsername()
  };
  save();
  _notifyAbsender(oa, {
    eventKey: 'offertanfrage_abgelehnt',
    modul: 'produktkatalog',
    typ: 'warnung',
    titel: '✕ Offertanfrage abgelehnt: ' + (oa.lieferantFirma || '—'),
    text: (oa.produktName || oa.kategorie || 'Anlage')
      + (grund ? ' · «' + grund + '»' : '')
      + (oa.projekt && oa.projekt.name ? ' · Projekt: ' + oa.projekt.name : '')
  });
  return oa;
}

function deleteOffertanfrage(id){
  _oaData.anfragen = _oaData.anfragen.filter(a => a.id !== id);
  save();
}

function getOffertanfragenCount(lieferantId, status){
  return _oaData.anfragen.filter(a =>
    a.lieferantId === lieferantId && (status ? a.status === status : a.status === 'offen')
  ).length;
}

function getTypen(kategorie, lieferantId){
  const prods = getProdukte(kategorie, lieferantId ? { lieferantId } : undefined);
  const map = {};
  prods.forEach(p => {
    const serie = p.daten?.serie || 'Unbekannt';
    if(!map[serie]){
      map[serie] = {
        serie,
        bauweise: p.daten?.bauweise || '',
        technologie: p.daten?.technologie || '',
        personenVon: Infinity, personenBis: 0,
        durchflussVon: Infinity, durchflussBis: 0,
        druckverlustVon: Infinity, druckverlustBis: 0,
        count: 0, produkte: []
      };
    }
    const t = map[serie];
    t.count++;
    t.produkte.push(p);
    const d = p.daten || {};
    if(d.personenMax){ t.personenBis = Math.max(t.personenBis, d.personenMax); t.personenVon = Math.min(t.personenVon, d.personenMax); }
    if(d.nenndurchfluss){ t.durchflussBis = Math.max(t.durchflussBis, d.nenndurchfluss); t.durchflussVon = Math.min(t.durchflussVon, d.nenndurchfluss); }
    if(d.druckverlustQn){ t.druckverlustBis = Math.max(t.druckverlustBis, d.druckverlustQn); t.druckverlustVon = Math.min(t.druckverlustVon, d.druckverlustQn); }
  });
  return Object.values(map);
}

// ── Activity Log ──
function addLog(produkt, aktion, detail){
  const entry = {
    aktion,
    detail: detail || '',
    von: _getUsername(),
    datum: new Date().toISOString()
  };
  if(!produkt.log) produkt.log = [];
  produkt.log.unshift(entry);
  if(produkt.log.length > 50) produkt.log.length = 50;
}

// ═══════════════════════════════════════════════
// STAMMLIEFERANTEN (#31) — Favoriten & Büro-Stamm
// ═══════════════════════════════════════════════
// Zwei Ebenen kombiniert:
//  1. Persönliche Favoriten (pro User) — localStorage
//  2. Büro-Stamm (pro Organisation) — localStorage, gepflegt von Admin/Planer
// Sortierung für Listen: [Persönliche Favs] → [Büro-Stamm] → [Rest].
const SK_FAVS       = 'gema_lieferanten_favs_v1';     // { [userId]: [liefId, ...] }
const SK_ORG_STAMM  = 'gema_lieferanten_orgstamm_v1'; // { [orgId]:  [liefId, ...] }

function _getUserContext(){
  var ctx = { userId: 'anonymous', orgId: 'org_default', canEditOrgStamm: false };
  try {
    if (typeof GemaAuth !== 'undefined') {
      var u = GemaAuth.getCurrentUser();
      if (u) {
        ctx.userId = u.id || ctx.userId;
        ctx.orgId  = u.orgId || ctx.orgId;
        // Admins und Planer dürfen Büro-Stamm pflegen
        var roles = u.roleIds || [];
        ctx.canEditOrgStamm = roles.indexOf('role_admin') >= 0 || roles.indexOf('role_planer') >= 0;
        if (typeof GemaAuth.isOrgAdmin === 'function' && GemaAuth.isOrgAdmin(u.id)) ctx.canEditOrgStamm = true;
      }
    }
  } catch(e) {}
  return ctx;
}

function _loadMap(key){
  try { var r = localStorage.getItem(key); if (r) return JSON.parse(r) || {}; } catch(e) {}
  return {};
}
function _saveMap(key, map){
  try { localStorage.setItem(key, JSON.stringify(map || {})); } catch(e) {}
}

function getFavoriten(){
  var ctx = _getUserContext();
  var map = _loadMap(SK_FAVS);
  return (map[ctx.userId] || []).slice();
}
function isFavorit(liefId){
  return getFavoriten().indexOf(liefId) >= 0;
}
function toggleFavorit(liefId){
  if (!liefId) return false;
  var ctx = _getUserContext();
  var map = _loadMap(SK_FAVS);
  var list = (map[ctx.userId] || []).slice();
  var i = list.indexOf(liefId);
  if (i >= 0) list.splice(i, 1); else list.push(liefId);
  map[ctx.userId] = list;
  _saveMap(SK_FAVS, map);
  return i < 0; // true wenn jetzt Favorit
}

function getOrgStamm(){
  var ctx = _getUserContext();
  var map = _loadMap(SK_ORG_STAMM);
  return (map[ctx.orgId] || []).slice();
}
function isOrgStamm(liefId){
  return getOrgStamm().indexOf(liefId) >= 0;
}
function canEditOrgStamm(){
  return _getUserContext().canEditOrgStamm;
}
function toggleOrgStamm(liefId){
  if (!liefId) return false;
  var ctx = _getUserContext();
  if (!ctx.canEditOrgStamm) return null; // Nicht berechtigt
  var map = _loadMap(SK_ORG_STAMM);
  var list = (map[ctx.orgId] || []).slice();
  var i = list.indexOf(liefId);
  if (i >= 0) list.splice(i, 1); else list.push(liefId);
  map[ctx.orgId] = list;
  _saveMap(SK_ORG_STAMM, map);
  return i < 0;
}

// ── Premium-Tier-Logik (P03) ──
// Planer ohne Premium-Lizenz: sehen nur Premium-Lieferanten oben (kommerziell) +
//   Verifiziert. Keine Favoriten/Büro-Stamm-Auflösung.
// Planer mit Premium-Lizenz: volle Flexibilität (Favoriten > Büro-Stamm >
//   Premium-Lief > Verifiziert > Rest).
function isPlanerPremium(user){
  if (!user && typeof GemaAuth !== 'undefined' && GemaAuth.getCurrentUser) {
    user = GemaAuth.getCurrentUser();
  }
  if (!user) return false;
  if (user.planerPremium === true) return true;
  if (user.abo && user.abo.typ === 'premium') return true;
  return false;
}

// Lieferant-Premium via Org-Abo (wenn gesetzt) ODER Legacy-Flag auf Lieferant
function isLieferantPremium(lief){
  if (!lief) return false;
  // Legacy: lieferant.premium.aktiv
  if (lief.premium && lief.premium.aktiv) return true;
  // Neu: Org-Abo des Lieferanten
  if (lief.orgId && typeof GemaAuth !== 'undefined' && GemaAuth.getOrgs) {
    var orgs = GemaAuth.getOrgs() || [];
    var org = orgs.find(function(o){ return o.id === lief.orgId; });
    if (org && org.abo && org.abo.typ === 'premium') return true;
  }
  return false;
}

// Sortiert eine Lieferantenliste nach Stamm-Priorität (tier-aware):
// Normale Planer:   [Premium-Lief] → [Verifiziert] → [Rest]
// Premium-Planer:   [Favs] → [Büro-Stamm] → [Premium-Lief] → [Verifiziert] → [Rest]
// Mutiert die Eingabe nicht, sondern gibt eine neue Liste zurück.
function sortWithStamm(list){
  var byName = function(a, b){ return (a.firma || '').localeCompare(b.firma || '', 'de'); };
  var premium = isPlanerPremium();

  if (!premium) {
    // Ohne Premium-Lizenz: kommerzielle Reihenfolge, keine Favoriten
    var tierPrem = [], tierVer = [], tierRest = [];
    (list || []).forEach(function(l){
      if (isLieferantPremium(l)) tierPrem.push(l);
      else if (l.verifiziert || l.status === 'verifiziert') tierVer.push(l);
      else tierRest.push(l);
    });
    return tierPrem.sort(byName).concat(tierVer.sort(byName)).concat(tierRest.sort(byName));
  }

  // Premium-Planer: volle Flexibilität
  var favs  = {}; getFavoriten().forEach(function(id){ favs[id] = true; });
  var stamm = {}; getOrgStamm().forEach(function(id){ stamm[id] = true; });
  var tierFav = [], tierStamm = [], tierPrem = [], tierVer = [], tierRest = [];
  (list || []).forEach(function(l){
    if (favs[l.id]) tierFav.push(l);
    else if (stamm[l.id]) tierStamm.push(l);
    else if (isLieferantPremium(l)) tierPrem.push(l);
    else if (l.verifiziert || l.status === 'verifiziert') tierVer.push(l);
    else tierRest.push(l);
  });
  return tierFav.sort(byName)
    .concat(tierStamm.sort(byName))
    .concat(tierPrem.sort(byName))
    .concat(tierVer.sort(byName))
    .concat(tierRest.sort(byName));
}

// ── Init ──
// _pkReady resolved nach dem ersten Cloud-Pull. Demo-Seeding und alles,
// was "ist der Katalog leer?" prueft, soll darauf warten — sonst werden
// auf einem frischen Geraet Demo-Daten erzeugt, BEVOR der Cloud-Stand da
// ist, und per-Record in die Cloud gepusht (Pollution).
var _pkReadyResolve;
var _pkReady = (typeof Promise !== 'undefined') ? new Promise(function(r){ _pkReadyResolve = r; }) : null;
load();
if(typeof document !== 'undefined'){
  document.addEventListener('DOMContentLoaded', function(){
    Promise.resolve(loadFromSupabase()).then(function(){ if(_pkReadyResolve) _pkReadyResolve(); })
      .catch(function(){ if(_pkReadyResolve) _pkReadyResolve(); });
  });
} else if(_pkReadyResolve){ _pkReadyResolve(); }

// ── Expose ──
window.GemaProdukte = {
  // Kategorien
  getKategorien,
  getKategorie,
  registerKategorie,
  // Produkte
  getProdukte,
  getProdukt,
  match,
  createProdukt,
  updateProdukt,
  setStatus,
  deleteProdukt,
  // Lieferanten (legacy: derived from products)
  getLieferanten,
  getTypen,
  // Lieferanten (v2: eigene Entität)
  getLieferant,
  getAllLieferanten,
  createLieferant,
  updateLieferant,
  deactivateLieferant,
  activateLieferant,
  deleteLieferant,
  searchLieferanten,
  quickCreateLieferant,
  // Stammlieferanten (#31): Favoriten + Büro-Stamm
  getFavoriten,
  isFavorit,
  toggleFavorit,
  getOrgStamm,
  isOrgStamm,
  canEditOrgStamm,
  toggleOrgStamm,
  sortWithStamm,
  isPlanerPremium,
  isLieferantPremium,
  // Vormerkungen
  addVormerkung,
  getVormerkungen,
  markVormerkungUebernommen,
  // Dokumente
  addDokument,
  removeDokument,
  getDokumente,
  // Offertanfragen
  createOffertanfrage,
  getOffertanfragen,
  getOffertanfrage,
  beantworteOffertanfrage,
  ablehnenOffertanfrage,
  deleteOffertanfrage,
  getOffertanfragenCount,
  OA_STATUS,
  // Persistence
  loadFromSupabase,
  get ready(){ return _pkReady || Promise.resolve(); },
  // Lieferanten-Kategorien
  LIEF_KATEGORIEN,
  normKatId,
  getLieferantenByKategorie: function(kat){
    var k = normKatId(kat);
    return getAllLieferanten().filter(function(l){
      return l.lieferantKategorien && l.lieferantKategorien.some(function(x){ return normKatId(x) === k; });
    });
  },
  // Meta
  STATUS_LABELS,
  KATEGORIEN,
  save,
  load
};

})();
