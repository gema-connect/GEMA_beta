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

  // Nur der dokumentierte Beispiel-Lieferant ist voreingestellt — weitere
  // IDs pflegt die Organisation selbst (keine erfundenen IDs).
  var SEED = [{ id: '1900', name: 'Geberit' }];

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

  w.GemaDataSelect = { search: search, debug: debug, anbieter: anbieter, addAnbieter: addAnbieter, setTextLang: setTextLang, normArtikel: normArtikel, mapEinheit: _mapEinheit, fmtPreis: fmtPreis, SEED: SEED };
})();
