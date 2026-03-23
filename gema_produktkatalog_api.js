// ═══════════════════════════════════════════════
// GEMA Produktkatalog API v1
// Shared data layer for all Berechnungsmodule
// ═══════════════════════════════════════════════

(function(){
'use strict';

const SK = 'gema_produktkatalog_v1';
let _data = { produkte: [], log: [] };

// ── Persistence ──
function save(){
  const j = JSON.stringify(_data);
  try { localStorage.setItem(SK, j); } catch(e){}
  try { if(typeof _GemaDB !== 'undefined') _GemaDB.put(SK, j).catch(()=>{}); } catch(e){}
}
function load(){
  try { const r = localStorage.getItem(SK); if(r) _data = JSON.parse(r); } catch(e){}
  if(!_data.produkte) _data.produkte = [];
  if(!_data.log) _data.log = [];
}

// ── Verification Status ──
// 'entwurf'       → Lieferant arbeitet daran
// 'pruefung'      → Eingereicht zur Prüfung
// 'verifiziert'   → Lieferant hat selbst erfasst ODER admin-Daten bestätigt
// 'nicht_verifiziert' → Admin hat erfasst, Lieferant hat noch nicht bestätigt
const STATUS_LABELS = {
  entwurf:           { label: 'Entwurf',                icon: '📝', cls: 'st-draft' },
  pruefung:          { label: 'In Prüfung',             icon: '🔍', cls: 'st-review' },
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
    // Anschluss passt
    if(b.anschluss && d.anschluss && d.anschluss === b.anschluss) score += 10;
    return Math.min(100, score);
  }
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
  return getProdukte(kategorie, { nurFreigegeben: true })
    .map(p => ({ ...p, _score: kat.matchFn(p, berechnungswerte) }))
    .filter(p => p._score > 0)
    .sort((a,b) => b._score - a._score);
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
  try {
    if(typeof GemaAuth !== 'undefined'){
      const u = GemaAuth.getCurrentUser();
      if(u) p.erstelltVon = u.name || u.username || '';
    }
  } catch(e){}
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
  try {
    if(typeof GemaAuth !== 'undefined'){
      const u = GemaAuth.getCurrentUser();
      if(u) p.geaendertVon = u.name || u.username || '';
    }
  } catch(e){}
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
    try {
      if(typeof GemaAuth !== 'undefined'){
        const u = GemaAuth.getCurrentUser();
        if(u) p.verifiziertVon = u.name || u.username || '';
      }
    } catch(e){}
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
  const prods = kategorie ? _data.produkte.filter(p => p.kategorie === kategorie) : _data.produkte;
  const map = {};
  prods.forEach(p => {
    if(p.lieferantFirma && !map[p.lieferantId||p.lieferantFirma]){
      map[p.lieferantId||p.lieferantFirma] = { id: p.lieferantId, firma: p.lieferantFirma };
    }
  });
  return Object.values(map);
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
  let who = '';
  try {
    if(typeof GemaAuth !== 'undefined'){
      const u = GemaAuth.getCurrentUser();
      if(u) who = u.name || u.username || '';
    }
  } catch(e){}
  const entry = {
    aktion,
    detail: detail || '',
    von: who,
    datum: new Date().toISOString()
  };
  if(!produkt.log) produkt.log = [];
  produkt.log.unshift(entry);
  if(produkt.log.length > 50) produkt.log.length = 50;
}

// ── Init ──
load();

// ── Expose ──
window.GemaProdukte = {
  getKategorien,
  getKategorie,
  registerKategorie,
  getProdukte,
  getProdukt,
  match,
  createProdukt,
  updateProdukt,
  setStatus,
  deleteProdukt,
  getLieferanten,
  getTypen,
  STATUS_LABELS,
  KATEGORIEN,
  save,
  load
};

})();
