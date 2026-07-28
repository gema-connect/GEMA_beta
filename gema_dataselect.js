/* GEMA DataSelect — Artikelkatalog dataselect.ch (DataExpert®BIM)
   Sucht Lieferanten-Artikel (Bezeichnung, Preis, Einheit, EAN, Bild) über
   den JWT-geschützten Netlify-Proxy /api/dataselect und liefert sie
   normalisiert. Genutzt im ERP-Positions-Editor, um Artikel inkl. Bild
   direkt in eine Offerte/Rechnung einzufügen.

   API:
     GemaDataSelect.search({anbieter, artnr?, bez?, ean?, sprache?, preisbuch?})
       → Promise<{ok, artikel:[{artnr,bezeichnung,ean,preis,waehrung,
                  einheit,hersteller,serie,bildUrl}], anzahl, error?}>
     GemaDataSelect.anbieter()       — hinterlegte Lieferanten (org-Settings,
                                       Default: Geberit 1900 als Beispiel)
     GemaDataSelect.addAnbieter(id,name) — Lieferant org-weit hinterlegen
     GemaDataSelect.fmtPreis(n)      — CHF-Format
     GemaDataSelect.normArtikel(raw) — Roh-Objekt → normalisiert (Fallback/Test)

   Lieferanten-IDs (id_anbieter) stammen aus der IGH-Mitgliederliste; sie
   werden pro Organisation in org.settings.dataselect.anbieter gepflegt.
*/
(function(){
  'use strict';
  if (window.GemaDataSelect) return;
  var w = window;

  // Nur der dokumentierte Beispiel-Lieferant ist VOREINGESTELLT — welche
  // Kataloge eine Firma wirklich beziehen darf, hängt am IGH-Vertrag.
  var SEED = [{ id: '1900', name: 'Geberit' }];

  /* ── IGH-Mitglieder-Katalog (Nachschlagliste, Stand 07/2026) ────────────
     Reine SUCHLISTE für den «Lieferant hinterlegen»-Dialog: Firma suchen →
     id_anbieter wird übernommen, damit niemand die ID online heraussuchen
     muss. Der Katalog wird NICHT automatisch als Lieferant hinterlegt —
     hinzugefügt wird nur, was die Organisation selbst auswählt.
     `sortimente` = die Preisbücher/Sortimente der Firma (helfen beim Finden,
     z.B. «Badmöbel» → BR Bauhandel / Gétaz-Miauton / Regusci Reco).
     Neue Mitglieder hier ergänzen — eine Firma hat GENAU EINE id_anbieter. */
  var KATALOG = [
    { id:'1345', name:'Aalberts hfc', sortimente:['HLKS'] },
    { id:'4354', name:'Accum Wärmetechnik GmbH', sortimente:['Wärmetechnik'] },
    { id:'2930', name:'ACO AG', sortimente:['HLKS'] },
    { id:'1380', name:'ait Schweiz AG', sortimente:['AlphaInnoTec'] },
    { id:'1810', name:'Aliaxis Utilities & Industry AG', sortimente:['Haustechnik'] },
    { id:'4311', name:'Arthur Flury AG', sortimente:['Blitzschutz, Erdung'] },
    { id:'1075', name:'Arthur Weber AG', sortimente:['Sanitär, Heizung, Lüftung, Klima'] },
    { id:'1330', name:'Belimo Automation AG', sortimente:['Antriebs- und Ventiltechnologie'] },
    { id:'1285', name:'Biral AG', sortimente:['Pumpen und Steuerungen'] },
    { id:'1300', name:'Bodenschatz AG', sortimente:['Badezimmer-Accessoires / Sanitär'] },
    { id:'1240', name:'Borer Heizkörper AG', sortimente:['Heizkörper'] },
    { id:'2110', name:'Bosch Thermotechnik AG, Buderus Schweiz', sortimente:['Heizungstechnik'] },
    { id:'6150', name:'BR Bauhandel AG', sortimente:['Badmöbel', 'Sanitärapparate'] },
    { id:'1205', name:'Breitenmoser & Keller AG', sortimente:['BREMO Heizkörper'] },
    { id:'6175', name:'Bringhen Group c/o Crea Ceram AG', sortimente:['Sanitärapparate'] },
    { id:'1485', name:'CTA AG', sortimente:['Heizung, Lüftung, Kälte, Service'] },
    { id:'1400', name:'CTC AG', sortimente:['Heizung'] },
    { id:'2460', name:'Danfoss AG', sortimente:['Haustechnik'] },
    { id:'1515', name:'Debrunner Acifer AG', sortimente:['Befestigungstechnik / Werkzeuge', 'Tiefbau / Baubedarf', 'Wasser- und Gebäudetechnik'] },
    { id:'1510', name:'Domotec AG', sortimente:['Wassererwärmer'] },
    { id:'4345', name:'Duravit Schweiz AG', sortimente:['Gesamtsortiment'] },
    { id:'1560', name:'Durex SA', sortimente:['Heizung'] },
    { id:'1600', name:'Elcotherm AG', sortimente:['Heizung'] },
    { id:'2915', name:'Engel AG', sortimente:['Sanitär, Heizung, Lüftung, Klima'] },
    { id:'300008', name:'ESYLUX Swiss AG', sortimente:['Bewegungs- und Präsenzmelder'] },
    { id:'300004', name:'Feller AG', sortimente:['Elektro'] },
    { id:'4350', name:'Fischer + Cie. AG', sortimente:['Baustoffe und Haustechnikprodukte'] },
    { id:'1900', name:'Geberit Vertriebs AG', sortimente:['Sanitärtechnik'] },
    { id:'2500', name:'Gebr. Kemper GmbH + Co. KG', sortimente:['Sanitär'] },
    { id:'1910', name:'Georg Fischer Rohrleitungssysteme (Schweiz) AG', sortimente:['Haustechnik', 'Versorgungssysteme', 'Industriesortiment', 'Metallsysteme'] },
    { id:'4358', name:'Glas Trösch AG, SWISSDOUCHE', sortimente:['Glas im Bad'] },
    { id:'1975', name:'GROHE Switzerland SA', sortimente:['Sanitär'] },
    { id:'1970', name:'Grundfos Pumpen AG', sortimente:['Pumpen'] },
    { id:'1960', name:'GWF AG', sortimente:['Sanitär'] },
    { id:'6140', name:'Gétaz-Miauton SA', sortimente:['Badmöbel', 'Sanitärapparate'] },
    { id:'2126', name:'Hansgrohe AG', sortimente:['Sanitär-Armaturen und Systeme'] },
    { id:'4351', name:'Heim AG Heizsysteme', sortimente:['Heizung'] },
    { id:'2560', name:'Helios Ventilatoren AG', sortimente:['Ventilatorentechnik'] },
    { id:'4348', name:'HEWI Heinrich Wilke GmbH', sortimente:['Sanitär'] },
    { id:'2130', name:'Hilti (Schweiz) AG', sortimente:['Befestigungen'] },
    { id:'2100', name:'Hoval AG', sortimente:['Heizung -Luft-/Klimatechnik-/Pumpen'] },
    { id:'4359', name:'HSB Heizsysteme und Brenner AG', sortimente:['Heizung'] },
    { id:'4310', name:'Häny AG', sortimente:['Haus- und Gebäudetechnik'] },
    { id:'3270', name:'IMI Hydronic Engineering Switzerland AG', sortimente:['Heiztechnik'] },
    { id:'2317', name:'Inhaus AG', sortimente:['Installationstechnik', 'Einrichtung Sanitär, Küche', 'Wärmetechnik Heizung Lüftung'] },
    { id:'4316', name:'InterApp AG', sortimente:['Haustechnik'] },
    { id:'2315', name:'ISO-CENTER AG', sortimente:['Technische Isolationen'] },
    { id:'2330', name:'ista swiss ag', sortimente:['Energiedienstleistung'] },
    { id:'4326', name:'JUDO Wasseraufbereitung AG', sortimente:['Wasseraufbereitung'] },
    { id:'4337', name:'Keller Spiegelschränke AG', sortimente:['Spiegelschränke'] },
    { id:'1010', name:'KERMI Schweiz AG', sortimente:['Heizsysteme'] },
    { id:'4341', name:'Kessel Schweiz AG', sortimente:['Entwässerungstechnik'] },
    { id:'4334', name:'Kibernetik AG', sortimente:['Gebäudetechnik'] },
    { id:'4317', name:'Kindlimann AG', sortimente:['Stahl- und Edelstahlrohre'] },
    { id:'2450', name:'KSB (Schweiz) AG', sortimente:['Haustechnik'] },
    { id:'2480', name:'KWC Group AG', sortimente:['Armaturen'] },
    { id:'6290', name:'LAUFEN Schweiz AG', sortimente:['Armaturen', 'Sanitärkeramik'] },
    { id:'3500', name:'Meier Tobler AG', sortimente:['Haustechniksysteme'] },
    { id:'2670', name:'Mueller AG Komponenten + Service', sortimente:['Sanitär, Heizung, Lüftung, Klima'] },
    { id:'2725', name:'NEOPERL AG', sortimente:['Sanitärbranche'] },
    { id:'2730', name:'NeoVac ATA AG', sortimente:['Wärme- und Wassermess-Systeme'] },
    { id:'4344', name:'NOSAG AG', sortimente:['HLKS'] },
    { id:'2710', name:'Nyffenegger Armaturen AG', sortimente:['Haustechnik'] },
    { id:'4353', name:'Oppermann Suisse AG', sortimente:['Gebäudeautomation'] },
    { id:'2815', name:'Oventrop (Schweiz) GmbH', sortimente:['Haustechnik'] },
    { id:'2900', name:'Pestalozzi AG', sortimente:['Sanitär, Heizung, Lüftung, Klima'] },
    { id:'2150', name:'Pittway Sarl', sortimente:['Haustechnik'] },
    { id:'2950', name:'Prolux Solutions AG', sortimente:['Heizkörper'] },
    { id:'2700', name:'R. Nussbaum AG', sortimente:['Sanitär-Armaturen'] },
    { id:'4339', name:'Reflex Schweiz GmbH', sortimente:['Sanitärapparate'] },
    { id:'6145', name:'Regusci Reco SA', sortimente:['Sanitärapparate', 'Badmöbel'] },
    { id:'6160', name:'SABAG Gruppe', sortimente:['Sanitärapparate'] },
    { id:'3220', name:'Samvaz SA', sortimente:['Befestigung für Gebäudetechnik'] },
    { id:'6130', name:'Sanitas Troesch AG', sortimente:['Sanitärapparate'] },
    { id:'4342', name:'Sauter Building Control Schweiz AG', sortimente:['Gebäudemanagement und Raumautomation'] },
    { id:'3465', name:'Schwarz Stahl AG', sortimente:['Sanitär, Heizung, Lüftung, Klima'] },
    { id:'4352', name:'SFA Switzerland AG', sortimente:['Kinedo', 'Sanitär'] },
    { id:'3251', name:'SFS Group Schweiz AG', sortimente:['Befestigungstechnik'] },
    { id:'2600', name:'Siemens Schweiz AG', sortimente:['HLKS/Elektro'] },
    { id:'1410', name:'SPAETER Gruppe', sortimente:['Haustechnik'] },
    { id:'3295', name:'Stiebel Eltron AG', sortimente:['Erneuerbare Energien'] },
    { id:'4356', name:'Stocker Stahl AG', sortimente:['Sanitär/Heizung/Wasserversorgung'] },
    { id:'4357', name:'talsee AG', sortimente:['HLKS'] },
    { id:'6180', name:'team-Katalog-Gruppe c/o SGVSB', sortimente:['TeamSaniDusch', 'TeamKappeler', 'TeamHug', 'TeamMaga', 'TeamSABBurgener', 'TeamWDS'] },
    { id:'3536', name:'Techem (Schweiz) AG', sortimente:['Messtechnik und Energiedienstleistungen'] },
    { id:'3515', name:'Tocafix AG', sortimente:['Befestigungs- und Montagetechnik'] },
    { id:'3610', name:'Urfer Müpro AG', sortimente:['Befestigungs- und Schallschutzsysteme'] },
    { id:'4346', name:'URIMAT Schweiz AG', sortimente:['Sanitärapparate'] },
    { id:'3710', name:'Vaillant GmbH Schweiz', sortimente:['Heiztechnik'] },
    { id:'3700', name:'Viessmann (Schweiz) GmbH', sortimente:['Lüftung - Preisliste', 'Heizung - Hauptpreisliste', 'Heizung - Vitoset'] },
    { id:'4355', name:'Weber AG', sortimente:['Sanitär, Heizung, Lüftung, Klima'] },
    { id:'3945', name:'Weishaupt AG', sortimente:['Heizsysteme'] },
    { id:'1630', name:'WILO Schweiz AG', sortimente:['Pumpen und Zubehör'] },
    { id:'3920', name:'Windhager Zentralheizung Schweiz AG', sortimente:['Heizung'] },
    { id:'4327', name:'Würth AG Schweiz', sortimente:['Montage- und Befestigungsmaterial'] },
    { id:'4200', name:'Zehnder Group Schweiz AG', sortimente:['Elektroheizkörper', 'Komfortlüftung, Kompaktenergiezentralen', 'Heizkörper'] },
    { id:'4230', name:'Zisola AG', sortimente:['Wärme- und Schallisolationen'] },
    { id:'300001', name:'Zumtobel Licht AG', sortimente:['Elektro'] }
  ];
  /** Katalog-Suche: Firma, ID oder Sortiment. Leere Suche → ganze Liste. */
  function katalog(q){
    var s = String(q == null ? '' : q).trim().toLowerCase();
    if (!s) return KATALOG.slice();
    return KATALOG.filter(function(m){
      if (m.id.indexOf(s) === 0) return true;
      if (m.name.toLowerCase().indexOf(s) >= 0) return true;
      return (m.sortimente || []).some(function(x){ return x.toLowerCase().indexOf(s) >= 0; });
    });
  }
  /** Katalog-Eintrag zu einer id_anbieter (oder null). */
  function katalogById(id){
    var k = String(id || '').replace(/[^0-9]/g, '');
    return KATALOG.filter(function(m){ return m.id === k; })[0] || null;
  }

  // IGH-/UN-ECE-Einheitencodes → GEMA-Einheiten (Spiegel des Server-Mappings).
  var _DS_EINHEIT = { PCE:'Stk', PCS:'Stk', PC:'Stk', H87:'Stk', EA:'Stk', PK:'Stk', PA:'Paar', PAR:'Paar', SET:'Stk', ST:'Stk', STK:'Stk', 'STK.':'Stk', MTR:'m', LM:'lfm', MTK:'m²', MTQ:'m³', LTR:'l', LT:'l', KGM:'kg', KG:'kg', HUR:'h', HR:'h' };
  function _mapEinheit(u){ var k = String(u || '').trim().toUpperCase(); return _DS_EINHEIT[k] || String(u || '').trim(); }

  function _org(){ try { return (w.GemaAuth && GemaAuth.getCurrentOrg) ? GemaAuth.getCurrentOrg() : null; } catch (e){ return null; } }

  function anbieter(){
    var org = _org();
    var own = (org && org.settings && org.settings.dataselect && org.settings.dataselect.anbieter) || [];
    var out = [], seen = {};
    (Array.isArray(own) ? own : []).forEach(function(a){
      if (!a || !a.id) return;
      var id = String(a.id).replace(/[^0-9]/g, '');
      if (!id || seen[id]) return;
      // textLang: welcher Text beim Einfügen in die Offerte kommt — 'lang' (ausführliche
      // Produktbeschreibung, Default) oder 'kurz' (Produktname).
      seen[id] = 1; out.push({ id: id, name: String(a.name || ('Lieferant ' + id)), textLang: (a.textLang === 'kurz' ? 'kurz' : 'lang') });
    });
    SEED.forEach(function(a){ if (!seen[a.id]) { seen[a.id] = 1; out.push({ id: a.id, name: a.name, textLang: 'lang' }); } });
    out.sort(function(a, b){ return a.name.localeCompare(b.name); });
    return out;
  }
  function addAnbieter(id, name, textLang){
    id = String(id || '').replace(/[^0-9]/g, '');
    if (!id) return false;
    var org = _org();
    if (!org || !w.GemaAuth || !GemaAuth.updateOrgSettings) return false;
    var st = org.settings || {};
    st.dataselect = st.dataselect || {};
    var list = Array.isArray(st.dataselect.anbieter) ? st.dataselect.anbieter.slice() : [];
    var i = -1, alt = null; list.forEach(function(x, ix){ if (x && String(x.id) === id) { i = ix; alt = x; } });
    var lang = (textLang === 'kurz' || textLang === 'lang') ? textLang : ((alt && alt.textLang) || 'lang');
    var rec = { id: id, name: String(name || (alt && alt.name) || ('Lieferant ' + id)).trim(), textLang: lang };
    if (i >= 0) list[i] = rec; else list.push(rec);
    st.dataselect.anbieter = list;
    try { GemaAuth.updateOrgSettings(org.id, st); return true; } catch (e){ return false; }
  }
  // Kurz-/Lang-Textmodus eines hinterlegten Lieferanten umstellen (org-weit gespeichert).
  function setTextLang(id, mode){
    id = String(id || '').replace(/[^0-9]/g, '');
    var cur = anbieter().find(function(x){ return x.id === id; });
    return addAnbieter(id, cur ? cur.name : '', mode === 'kurz' ? 'kurz' : 'lang');
  }

  function _authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    try { var t = (w.GemaSync && GemaSync.getAuthToken && GemaSync.getAuthToken()) || ''; if (t) h['Authorization'] = 'Bearer ' + t; } catch (e){}
    return h;
  }

  // Antwort robust lesen: /api/dataselect liefert immer JSON; kommt HTML
  // zurück (Function nicht deployed / Proxy-Fehlerseite), klare Meldung.
  function _parse(r, body){
    var t = String(body || '').trim();
    if (t.charAt(0) === '{' || t.charAt(0) === '['){
      try { return JSON.parse(t); } catch (e){}
    }
    if (r.status === 404) return { ok: false, error: 'DataSelect-Proxy nicht gefunden (/api/dataselect nicht deployed).' };
    if (r.status === 401) return { ok: false, error: 'Nicht angemeldet — bitte neu einloggen.' };
    if (r.status === 504) return { ok: false, error: 'DataSelect antwortet nicht rechtzeitig.' };
    return { ok: false, error: 'Unerwartete Antwort (HTTP ' + r.status + ').' };
  }

  function search(opts){
    opts = opts || {};
    var anb = String(opts.anbieter || '').replace(/[^0-9]/g, '');
    if (!anb) return Promise.resolve({ ok: false, error: 'Bitte einen Lieferanten wählen.', artikel: [] });
    var artnr = String(opts.artnr || '').trim();
    var bez = String(opts.bez || '').trim();
    var ean = String(opts.ean || '').trim();
    if (!artnr && !bez && !ean) return Promise.resolve({ ok: false, error: 'Bitte Artikelnummer, Bezeichnung oder EAN eingeben.', artikel: [] });
    var qs = new URLSearchParams();
    qs.set('anbieter', anb);
    if (artnr) qs.set('artnr', artnr);
    if (bez) qs.set('bez', bez);
    if (ean) qs.set('ean', ean);
    qs.set('sprache', (['de','fr','it'].indexOf(String(opts.sprache || 'de')) >= 0) ? opts.sprache : 'de');
    qs.set('preisbuch', String(opts.preisbuch || '1').replace(/[^0-9]/g, '') || '1');
    if (opts.bilder) qs.set('bilder', '1');   // Detail-Abruf beim Einfügen (mit Bild)
    return fetch('/api/dataselect?' + qs.toString(), { method: 'GET', headers: _authHeaders() })
      .then(function(r){ return r.text().then(function(b){ return _parse(r, b); }); })
      .then(function(d){
        if (!d || d.ok !== true) return { ok: false, error: (d && d.error) || 'DataSelect-Abfrage fehlgeschlagen.', artikel: [] };
        var arr = Array.isArray(d.artikel) ? d.artikel.map(normArtikel).filter(Boolean) : [];
        return { ok: true, artikel: arr, anzahl: arr.length };
      })
      .catch(function(e){ return { ok: false, error: 'Verbindungsfehler zu DataSelect: ' + (e && e.message ? e.message : ''), artikel: [] }; });
  }

  // Defensive Client-Normalisierung (der Server normalisiert bereits; das
  // hier fängt Alt=/Rohantworten ab und ist Node-testbar).
  function _pick(o, ks){
    if (!o || typeof o !== 'object') return '';
    var m = {}; Object.keys(o).forEach(function(k){ var n = String(k).toLowerCase().replace(/[^a-z0-9]/g, ''); if (m[n] === undefined) m[n] = o[k]; });
    for (var i = 0; i < ks.length; i++){ var v = m[String(ks[i]).toLowerCase().replace(/[^a-z0-9]/g, '')]; if (v != null && String(v).trim() !== '') return v; }
    return '';
  }
  function _num(v){
    if (v == null) return 0;
    var s = String(v).replace(/[^0-9.,-]/g, '').trim(); if (!s) return 0;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0){ if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); }
    else if (s.indexOf(',') >= 0) s = s.replace(/'/g, '').replace(',', '.');
    s = s.replace(/'/g, ''); var n = parseFloat(s); return isFinite(n) ? n : 0;
  }
  function normArtikel(raw){
    if (!raw || typeof raw !== 'object') return null;
    // Bereits normalisiert (vom Server)?
    if (raw.bezeichnung !== undefined && raw.preis !== undefined && raw.bildUrl !== undefined && raw.artnr !== undefined){
      var bu = String(raw.bildUrl || '').trim();
      return {
        artnr: String(raw.artnr || '').trim(), bezeichnung: String(raw.bezeichnung || '').trim(),
        ean: String(raw.ean || '').trim(), preis: _num(raw.preis), waehrung: String(raw.waehrung || 'CHF'),
        einheit: _mapEinheit(raw.einheit), hersteller: String(raw.hersteller || '').trim(),
        serie: String(raw.serie || '').trim(), bildUrl: bu,
        ausfuehrung: String(raw.ausfuehrung || '').trim(),
        bezeichnungLang: String(raw.bezeichnungLang || '').trim(),
        hatBild: (raw.hatBild !== undefined ? !!raw.hatBild : !!bu)   // Bild vorhanden? (fürs Nachladen)
      };
    }
    var bez = _pick(raw, ['bezeichnung','bez','beschreibung','text','name','description','produktname','produktbeschreibung','intern_name','intern_description']);
    var bildUrl = String(_pick(raw, ['bildurl','bild','image','imageurl','picture','foto']) || '').trim();
    return {
      artnr: String(_pick(raw, ['artnr','artikelnr','artikelnummer','nummer','number','produktcode','intern_code','code']) || '').trim(),
      bezeichnung: String(bez || '').trim(),
      ean: String(_pick(raw, ['ean','gtin','barcode']) || '').trim(),
      preis: _num(_pick(raw, ['verkaufspreis','bruttopreis','listenpreis','preis','price','vk','sale_price','default_price','einkaufspreis','purchase_price'])),
      waehrung: String(_pick(raw, ['waehrung','währung','currency']) || 'CHF'),
      einheit: _mapEinheit(_pick(raw, ['einheit','me','vpe','unit','unit_name'])),
      hersteller: String(_pick(raw, ['hersteller','lieferant','marke','brand']) || '').trim(),
      serie: String(_pick(raw, ['serie','produktlinie','hauptgruppe','untergruppe']) || '').trim(),
      bildUrl: bildUrl,
      ausfuehrung: String(_pick(raw, ['ausfuehrung','ausführung']) || '').trim(),
      bezeichnungLang: String(_pick(raw, ['bezeichnunglang','produktbeschreibung','beschreibung','description']) || '').trim(),
      hatBild: (raw.hatBild !== undefined ? !!raw.hatBild : !!bildUrl)
    };
  }

  function fmtPreis(n){
    var v = _num(n);
    return (Math.round(v * 100) / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Diagnose: die ROHE Antwort von dataselect.ch abrufen (HTTP-Status, Content-Type,
  // erkanntes Format, erste ~2500 Zeichen). Damit sieht man ohne IGH-Wissen, WAS ein
  // Lieferant zurückgibt — JSON, XML, eine Login-/Fehlerseite oder nichts.
  //   debug({anbieter, artnr?|bez?|ean?, format?, sprache?, preisbuch?})
  //     → Promise<{ok:false, debug:{triedUrl,format,httpStatus,contentType,
  //                erkanntesFormat,jsonParsebar,laenge,auszug,…}} | {ok:false,error}>
  function debug(opts){
    opts = opts || {};
    var anb = String(opts.anbieter || '').replace(/[^0-9]/g, '');
    if (!anb) return Promise.resolve({ ok: false, error: 'Bitte einen Lieferanten wählen.' });
    var qs = new URLSearchParams();
    qs.set('anbieter', anb);
    qs.set('debug', '1');
    var artnr = String(opts.artnr || '').trim();
    var bez = String(opts.bez || '').trim();
    var ean = String(opts.ean || '').trim();
    // Ohne Suchbegriff einen Platzhalter mitgeben (die Frage ist «welches Format»,
    // nicht «welcher Artikel») — sonst lehnt der Proxy die Anfrage ab.
    if (!artnr && !bez && !ean) bez = String(opts.probe || 'wc');
    if (artnr) qs.set('artnr', artnr);
    if (bez) qs.set('bez', bez);
    if (ean) qs.set('ean', ean);
    if (opts.format) qs.set('format', String(opts.format).trim());
    qs.set('sprache', (['de','fr','it'].indexOf(String(opts.sprache || 'de')) >= 0) ? opts.sprache : 'de');
    qs.set('preisbuch', String(opts.preisbuch || '1').replace(/[^0-9]/g, '') || '1');
    return fetch('/api/dataselect?' + qs.toString(), { method: 'GET', headers: _authHeaders() })
      .then(function(r){ return r.text().then(function(b){ var d = _parse(r, b); if (d && d.debug) return d; return d && d.ok === false ? d : { ok: false, error: (d && d.error) || 'Keine Diagnose erhalten.' }; }); })
      .catch(function(e){ return { ok: false, error: 'Verbindungsfehler: ' + (e && e.message ? e.message : '') }; });
  }

  w.GemaDataSelect = { search: search, debug: debug, anbieter: anbieter, addAnbieter: addAnbieter, setTextLang: setTextLang, normArtikel: normArtikel, mapEinheit: _mapEinheit, fmtPreis: fmtPreis, SEED: SEED, KATALOG: KATALOG, katalog: katalog, katalogById: katalogById };
})();
