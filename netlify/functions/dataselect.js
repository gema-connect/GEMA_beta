/**
 * netlify/functions/dataselect.js
 *
 * Proxy für die DataSelect-Artikel-API (dataselect.ch, DataExpert®BIM).
 * Holt Artikeldaten eines IGH-Lieferanten (Bezeichnung, Preis, Einheit,
 * EAN und Produktbild) server-seitig — der Browser kann dataselect.ch
 * wegen CORS nicht direkt aufrufen, und allfällige Zugangsdaten bleiben
 * serverseitig.
 *
 * Aufruf (via gema_dataselect.js, JWT im Authorization-Header):
 *   GET /.netlify/functions/dataselect
 *       ?anbieter=1900          (id_anbieter, PFLICHT — z.B. Geberit 1900)
 *       &artnr=620.020.00.1     (ODER &bez=... ODER &ean=... — mind. eines)
 *       &sprache=de             (de | fr | it, Default de)
 *       &preisbuch=1            (preisbuch_nr, Default 1)
 *
 * Antwort:
 *   { ok:true, artikel:[ {artnr,bezeichnung,ean,preis,waehrung,einheit,
 *                         hersteller,serie,bildUrl}, … ], anzahl }
 *   { ok:false, error:'…' }
 *
 * Konfiguration (Netlify-Env, alle optional):
 *   DATASELECT_BASE       Endpoint (Default https://www.dataselect.ch/api/Artikel/Get)
 *   DATASELECT_API_KEY    Zugangs-Token, falls der Vertrag eines verlangt
 *   DATASELECT_KEY_PARAM  Name des Query-Parameters für den Key (z.B. "token").
 *                         Ohne diesen Namen wird der Key als
 *                         "Authorization: Bearer <key>" gesendet.
 *
 * WICHTIG — Schema-Robustheit: Das exakte JSON-Feldschema des debim-Formats
 * ist vertrags-/versionsabhängig. _normArtikel() bildet darum HEURISTISCH
 * über viele plausible Feldnamen (deutsch/englisch/BIM-üblich) auf das
 * normalisierte Schema ab. Weicht eine reale Antwort ab, hier die
 * Kandidatenlisten ergänzen (Node-Test: scripts/dataselect_norm_test.mjs).
 */
'use strict';

const { requireAuth } = require('./_jwt');

const BASE = process.env.DATASELECT_BASE || 'https://www.dataselect.ch/api/Artikel/Get';
const TIMEOUT_MS = 9000;

// ── Feld-Normalisierung (heuristisch, case-insensitive) ──
function _normKey(k){ return String(k).toLowerCase().replace(/[^a-z0-9]/g, ''); }
// Liefert den ersten nicht-leeren Wert unter mehreren Kandidat-Schlüsseln.
function _pick(obj, cands){
  if (!obj || typeof obj !== 'object') return '';
  var map = {};
  Object.keys(obj).forEach(function(k){ if (map[_normKey(k)] === undefined) map[_normKey(k)] = obj[k]; });
  for (var i = 0; i < cands.length; i++){
    var v = map[_normKey(cands[i])];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}
// Schweizer/deutsches Zahlenformat → Number (1'234.50 / 1.234,50 / "12.30 CHF")
function _num(v){
  if (v == null) return 0;
  var s = String(v).replace(/[^0-9.,-]/g, '').trim();
  if (!s) return 0;
  // Wenn Komma UND Punkt: das letzte Trennzeichen ist der Dezimalpunkt.
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0){
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.indexOf(',') >= 0){
    s = s.replace(/'/g, '').replace(',', '.');
  }
  s = s.replace(/'/g, '');
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
// Bild aus String, Array (erstes Element) oder Objekt ({url|Url|src}) ziehen.
function _bild(v){
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) { for (var i = 0; i < v.length; i++){ var b = _bild(v[i]); if (b) return b; } return ''; }
  if (typeof v === 'object') return String(_pick(v, ['url','uri','src','link','href','pfad','path','data','value']) || '').trim();
  return '';
}

function _normArtikel(raw){
  if (!raw || typeof raw !== 'object') return null;
  var bez = _pick(raw, ['bezeichnung','bez','beschreibung','artikelbezeichnung','bezeichnung1','text','name','description','titel','title']);
  var bez2 = _pick(raw, ['bezeichnung2','bez2','beschreibung2','zusatztext','subtext']);
  if (bez2 && String(bez2).trim() && String(bez2).trim() !== String(bez).trim()) bez = (String(bez) + ' ' + String(bez2)).trim();
  var artnr = _pick(raw, ['artnr','artikelnr','artikelnummer','artikelnrlieferant','articlenumber','artikel','nummer','number','idartikel','artikelid','refnr','referenz']);
  var preisRaw = _pick(raw, ['bruttopreis','listenpreis','preis','bruttopreis1','preis1','bp','vk','verkaufspreis','price','listprice','grossprice','ep','einzelpreis']);
  var bildRaw = raw.Bilder || raw.bilder || raw.Images || raw.images || _pick(raw, ['bildurl','bild','image','imageurl','picture','foto','thumbnail','thumb','bildlink']);
  return {
    artnr: String(artnr || '').trim(),
    bezeichnung: String(bez || '').trim(),
    ean: String(_pick(raw, ['ean','gtin','eannr','eancode','barcode']) || '').trim(),
    preis: _num(preisRaw),
    waehrung: String(_pick(raw, ['waehrung','währung','currency','whg']) || 'CHF').trim() || 'CHF',
    einheit: String(_pick(raw, ['einheit','me','mengeneinheit','vpe','verkaufseinheit','verpackungseinheit','unit','uom','mengeneinheittext']) || '').trim(),
    hersteller: String(_pick(raw, ['hersteller','lieferant','anbieter','marke','brand','manufacturer','fabrikat','lieferantname']) || '').trim(),
    serie: String(_pick(raw, ['serie','produktlinie','produktgruppe','sortiment','linie','series']) || '').trim(),
    bildUrl: _bild(bildRaw)
  };
}

// Antwort in ein Array von Roh-Artikeln überführen (viele Container-Formen).
function _extractArray(data){
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  var cand = data.Artikel || data.artikel || data.Articles || data.articles || data.data || data.Data
    || data.Result || data.result || data.results || data.items || data.Items || data.Rows || data.rows;
  if (Array.isArray(cand)) return cand;
  if (cand && typeof cand === 'object') return [cand];
  // Einzelner Artikel als Objekt (hat ein plausibles Artnr-/Bezeichnungsfeld)?
  if (_pick(data, ['artnr','artikelnr','artikelnummer','bezeichnung','bez']) !== '') return [data];
  return [];
}

function _err(statusCode, msg, cors){
  return { statusCode: statusCode, headers: cors, body: JSON.stringify({ ok: false, error: msg }) };
}

exports.handler = async function(event){
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS'){
    return { statusCode: 200, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    }, body: '' };
  }
  // Auth-Gate (Review S3): nur eingeloggte GEMA-User — kein offener Proxy.
  if (!requireAuth(event)) return _err(401, 'Nicht angemeldet', cors);

  // Params aus Query ODER JSON-Body
  var p = (event.queryStringParameters || {});
  if ((!p.anbieter && !p.artnr && !p.bez && !p.ean) && event.body){
    try { p = Object.assign({}, p, JSON.parse(event.body || '{}')); } catch (e) {}
  }

  var anbieter = String(p.anbieter || '').trim();
  if (!/^\d{1,7}$/.test(anbieter)) return _err(400, 'Ungültige oder fehlende Lieferanten-ID (id_anbieter).', cors);
  var artnr = String(p.artnr || '').trim().slice(0, 60);
  var bez   = String(p.bez || '').trim().slice(0, 80);
  var ean   = String(p.ean || '').trim().slice(0, 40);
  if (!artnr && !bez && !ean) return _err(400, 'Bitte mindestens Artikelnummer, Bezeichnung oder EAN angeben.', cors);
  var sprache = String(p.sprache || 'de').toLowerCase();
  if (['de','fr','it'].indexOf(sprache) < 0) sprache = 'de';
  var preisbuch = String(p.preisbuch || '1').replace(/[^0-9]/g, '') || '1';
  // bilder=1 → Bilder mitliefern (Detail-Abruf beim Einfügen einer Position).
  // Ohne bilder → SUCHE: schnelle, schlanke Antwort (Inline-/Base64-Bilder werden
  // aus dem Payload entfernt, damit die Trefferliste nicht auf Bild-Bytes wartet).
  var withBilder = (String(p.bilder || '') === '1' || String(p.bilder || '').toLowerCase() === 'true');

  // Ziel-URL bauen (fixer Host → keine SSRF-Fläche)
  var qs = new URLSearchParams();
  qs.set('id_anbieter', anbieter);
  qs.set('preisbuch_nr', preisbuch);
  qs.set('code_sprache', sprache);
  // Format je Modus konfigurierbar: für die Suche kann ein leichteres (bildloses,
  // schnelleres) Format des Katalogs gesetzt werden — Default bleibt debim.
  qs.set('format', withBilder
    ? (process.env.DATASELECT_FORMAT_BILD || 'debim')
    : (process.env.DATASELECT_FORMAT_SUCHE || 'debim'));
  if (artnr) qs.set('artnr', artnr);
  if (bez)   qs.set('Bez', bez);
  if (ean)   qs.set('EAN', ean);

  var headers = { 'Accept': 'application/json' };
  var key = process.env.DATASELECT_API_KEY;
  if (key){
    if (process.env.DATASELECT_KEY_PARAM) qs.set(process.env.DATASELECT_KEY_PARAM, key);
    else headers['Authorization'] = 'Bearer ' + key;
  }
  var url = BASE + (BASE.indexOf('?') >= 0 ? '&' : '?') + qs.toString();

  var ctrl = new AbortController();
  var timer = setTimeout(function(){ ctrl.abort(); }, TIMEOUT_MS);
  var resp, textBody;
  try {
    resp = await fetch(url, { headers: headers, signal: ctrl.signal });
    textBody = await resp.text();
  } catch (e){
    clearTimeout(timer);
    if (e && e.name === 'AbortError') return _err(504, 'DataSelect antwortet nicht rechtzeitig. Bitte später erneut versuchen.', cors);
    return _err(502, 'DataSelect nicht erreichbar: ' + (e && e.message ? e.message : 'Netzwerkfehler'), cors);
  }
  clearTimeout(timer);

  if (!resp.ok){
    // 404 = kein Treffer → leere Liste (nicht als Fehler behandeln)
    if (resp.status === 404) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, artikel: [], anzahl: 0 }) };
    var hint = (resp.status === 401 || resp.status === 403)
      ? ' — Zugang verweigert (Vertrag/Token prüfen: DATASELECT_API_KEY).' : '';
    return _err(502, 'DataSelect-Fehler (HTTP ' + resp.status + ')' + hint, cors);
  }

  var data;
  try { data = JSON.parse(textBody); }
  catch (e){
    // Kein JSON → meist HTML-Fehler-/Loginseite (Vertrag/Token) oder falsches Format
    return _err(502, 'DataSelect lieferte kein JSON (evtl. Zugang/Token nötig oder Format geändert).', cors);
  }

  var artikel = _extractArray(data).map(_normArtikel).filter(function(a){
    return a && (a.artnr || a.bezeichnung);
  });

  // hatBild = ob ein Bild existiert (fürs verzögerte Nachladen beim Einfügen).
  // Im Suchmodus schwere Inline-Bilder (data:-URIs/Base64) NICHT ans Frontend
  // geben — nur der eingefügte Artikel lädt sein Bild nach (bilder=1). HTTP-URLs
  // sind billige Strings und bleiben (das Frontend zeigt sie in der Suche nicht).
  artikel.forEach(function(a){
    a.hatBild = !!a.bildUrl;
    if (!withBilder && /^data:/i.test(a.bildUrl || '')) a.bildUrl = '';
  });

  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, artikel: artikel, anzahl: artikel.length, bilder: withBilder }) };
};

// Für Node-Tests
exports._normArtikel = _normArtikel;
exports._extractArray = _extractArray;
exports._num = _num;
exports._pick = _pick;
exports._bild = _bild;
