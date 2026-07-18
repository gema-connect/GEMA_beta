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
 * Antwort-Formate (Export-Format via `format`, KEIN JSON-vs-XML-Transport):
 *   • debim  (DataExpert-BIM, XML) — DEFAULT. Pro Artikel Kurz-/Langtext,
 *            Einheit, Preis, EAN UND eine Bild-URL (<LinkAdr><Name Bez="Bild
 *            IGH" …>URL</Name>). Parser: _parseDebimXml().
 *   • bexio  (CSV, Semikolon-getrennt) — schlank, aber OHNE Bild. Fallback.
 *   • JSON   — falls ein Lieferant/Vertrag JSON liefert.
 * Der Parser erkennt das Format automatisch (JSON → debim-XML → CSV).
 *
 * WICHTIG — Schema-Robustheit: Das exakte Feldschema ist vertrags-/
 * versionsabhängig. _normArtikel() bildet darum HEURISTISCH über viele
 * plausible Feldnamen (deutsch/englisch/BIM-üblich) auf das normalisierte
 * Schema ab; _parseDebimXml() baut aus dem XML die passenden Roh-Objekte.
 * Weicht eine reale Antwort ab, hier die Kandidatenlisten/Regex ergänzen
 * (Node-Test: scripts/dataselect_norm_test.mjs).
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

// HTML-Tags/Entities aus einem Text ziehen (bexio-Beschreibungen sind teils HTML).
function _stripHtml(s){
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
}
// XML-Entities auflösen (debim: &lt; &gt; &quot; &apos; &amp; + numerische Refs).
// &amp; ZULETZT, damit &amp;lt; nicht doppelt aufgelöst wird.
function _xmlUnescape(s){
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, function(_, n){ try { return String.fromCharCode(parseInt(n, 16)); } catch (e){ return _; } })
    .replace(/&#(\d+);/g, function(_, n){ try { return String.fromCharCode(parseInt(n, 10)); } catch (e){ return _; } })
    .replace(/&amp;/g, '&');
}
// Langtext (mehrzeilig) säubern: Tags weg (falls HTML), Leerzeichen normalisieren,
// aber echte Zeilenumbrüche ERHALTEN (debim-Langtext ist mehrzeilig; _stripHtml
// würde alles auf eine Zeile pressen). Block-Tags → Umbruch, Inline-Tags (<sub>/<sup>/<b>…) weg.
function _cleanLang(t){
  var s = String(t || '').replace(/\r\n?/g, '\n');
  if (/<[a-z!/]/i.test(s)){
    s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr)>/gi, '\n')
         .replace(/<[^>]*>/g, '')
         .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
         .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&');
  }
  return s.replace(/[ \t]+/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
// IGH-/UN-ECE-Einheitencodes → GEMA-Einheiten (bexio liefert z.B. «PCE»).
var _DS_EINHEIT = { PCE:'Stk', PCS:'Stk', PC:'Stk', H87:'Stk', EA:'Stk', PK:'Stk', PA:'Paar', PAR:'Paar', SET:'Stk', ST:'Stk', STK:'Stk', 'STK.':'Stk', MTR:'m', LM:'lfm', MTK:'m²', MTQ:'m³', LTR:'l', LT:'l', KGM:'kg', KG:'kg', HUR:'h', HR:'h' };
function _mapEinheit(u){
  var k = String(u || '').trim().toUpperCase();
  return _DS_EINHEIT[k] || String(u || '').trim();
}
// Ausführung (Farbe/Oberfläche) aus der bexio-Beschreibung ziehen. Muster:
// «… Schallisolierung\nAF: Pergamon/AFZ: Gleitschutz Antislip» → "Pergamon · Gleitschutz Antislip".
function _afAusfuehrung(text){
  var s = _stripHtml(text);
  if (!s) return '';
  var af = '', afz = '';
  var m1 = s.match(/\bAF:\s*([\s\S]*?)(?=\bAFZ:|$)/i);
  if (m1) af = m1[1].replace(/[\/;,\s]+$/, '').trim();
  var m2 = s.match(/\bAFZ:\s*([\s\S]*?)$/i);
  if (m2) afz = m2[1].replace(/[\/;,\s]+$/, '').trim();
  return [af, afz].filter(Boolean).join(' · ');
}
function _normArtikel(raw){
  if (!raw || typeof raw !== 'object') return null;
  // Kandidatenlisten inkl. bexio-CSV (Produktcode/Produktname/Verkaufspreis …)
  // und bexio-JSON (intern_code/intern_name/sale_price …).
  var bez = _pick(raw, ['bezeichnung','bez','beschreibung','artikelbezeichnung','bezeichnung1','text','name','description','titel','title','produktname','produktbeschreibung','intern_name','internname','intern_description','interndescription']);
  var bez2 = _pick(raw, ['bezeichnung2','bez2','beschreibung2','zusatztext','subtext','intern_description']);
  if (bez2 && String(bez2).trim() && String(bez2).trim() !== String(bez).trim()) bez = (String(bez) + ' ' + String(bez2)).trim();
  bez = _stripHtml(bez);   // falls eine HTML-Beschreibung durchkommt
  var artnr = _pick(raw, ['artnr','artikelnr','artikelnummer','artikelnrlieferant','articlenumber','artikel','nummer','number','idartikel','artikelid','refnr','referenz','produktcode','produktcodelieferant','intern_code','interncode','code']);
  // Verkaufspreis zuerst (bexio-CSV), Einkaufspreis nur als letzter Ausweg.
  var preisRaw = _pick(raw, ['verkaufspreis','bruttopreis','listenpreis','preis','bruttopreis1','preis1','bp','vk','price','listprice','grossprice','ep','einzelpreis','sale_price','saleprice','default_price','defaultprice','einkaufspreis','purchase_price','purchaseprice']);
  var bildRaw = raw.Bilder || raw.bilder || raw.Images || raw.images || _pick(raw, ['bildurl','bild','image','imageurl','picture','foto','thumbnail','thumb','bildlink']);
  // Langtext (ausführliche Produktbeschreibung) getrennt vom Kurztext (Produktname).
  var beschr = _pick(raw, ['produktbeschreibung','beschreibunglang','langtext','produktbeschreibunglieferant','description','beschreibung']);
  var kurz = String(bez || '').trim();
  var af = _afAusfuehrung(_pick(raw, ['produktbeschreibung','beschreibung','description','produktbeschreibunglieferant','intern_description']));
  // AF:/AFZ:-Ausführungszeile aus dem Langtext entfernen (steckt in `ausfuehrung`) —
  // NUR wenn wirklich eine AF/AFZ-Ausführung erkannt wurde (kein Fehlschnitt bei
  // legitimen «AF:»-Inhaltszeilen) und NICHT zeilenverankert (HTML-Beschreibungen
  // können die Zeilenumbrüche kollabieren → «AF:» steht dann mitten im String).
  var lang = _cleanLang(beschr);
  if (af) lang = lang.replace(/\s*\bAF:[\s\S]*$/i, '').trim();
  return {
    artnr: String(artnr || '').trim(),
    bezeichnung: kurz,
    bezeichnungLang: (lang && lang.replace(/\s+/g,' ') !== kurz.replace(/\s+/g,' ')) ? lang : '',
    ean: String(_pick(raw, ['ean','gtin','eannr','eancode','barcode']) || '').trim(),
    preis: _num(preisRaw),
    waehrung: String(_pick(raw, ['waehrung','währung','currency','whg']) || 'CHF').trim() || 'CHF',
    einheit: _mapEinheit(_pick(raw, ['einheit','me','mengeneinheit','vpe','verkaufseinheit','verpackungseinheit','unit','uom','mengeneinheittext','unit_name','unitname'])),
    hersteller: String(_pick(raw, ['hersteller','lieferant','anbieter','marke','brand','manufacturer','fabrikat','lieferantname']) || '').trim(),
    serie: String(_pick(raw, ['serie','produktlinie','produktgruppe','sortiment','linie','series','hauptgruppe','untergruppe']) || '').trim(),
    bildUrl: _bild(bildRaw),
    // Ausführung (AF/AFZ = Farbe/Oberfläche) — fürs Gruppieren gleicher Produkte
    ausfuehrung: af
  };
}

// ── CSV-Parser (bexio-Format: Semikolon-getrennt, doppelt-gequotete Felder) ──
// Sniffed den Delimiter (; , \t) aus der Kopfzeile, respektiert Quotes über
// Zeilengrenzen. Liefert {header:[…], rows:[{Spalte:Wert}]} oder null (kein CSV).
function _parseCsvRecords(text, delim){
  var records = [], field = '', row = [], q = false;
  for (var i = 0; i < text.length; i++){
    var c = text[i];
    if (q){
      if (c === '"'){ if (text[i + 1] === '"'){ field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === delim){ row.push(field); field = ''; }
      else if (c === '\n'){ row.push(field); records.push(row); row = []; field = ''; }
      else if (c === '\r'){ /* CRLF: auf \n reagieren */ }
      else field += c;
    }
  }
  if (field !== '' || row.length){ row.push(field); records.push(row); }
  return records;
}
function _parseCsv(text){
  var t = String(text || '');
  if (!t.trim() || t.trim().charAt(0) === '<' || t.trim().charAt(0) === '{' || t.trim().charAt(0) === '[') return null;
  var firstLine = t.split(/\r?\n/)[0] || '';
  var semi = (firstLine.match(/;/g) || []).length;
  var comma = (firstLine.match(/,/g) || []).length;
  var tab = (firstLine.match(/\t/g) || []).length;
  var delim = (tab > semi && tab > comma) ? '\t' : (semi >= comma ? ';' : ',');
  var recs = _parseCsvRecords(t, delim);
  if (!recs.length) return null;
  var header = (recs[0] || []).map(function(h){ return String(h).trim(); });
  if (header.length < 2) return null;   // keine echte Tabelle
  var rows = [];
  for (var i = 1; i < recs.length; i++){
    var r = recs[i];
    if (!r || !r.length || (r.length === 1 && String(r[0]).trim() === '')) continue;
    var o = {};
    for (var j = 0; j < header.length; j++){ if (header[j]) o[header[j]] = (j < r.length) ? r[j] : ''; }
    rows.push(o);
  }
  return { header: header, rows: rows };
}

// ── debim-Parser (DataExpert®BIM XML) ──
// Das debim-Format liefert pro Artikel KURZ-/LANGTEXT, Einheit, Preis, EAN UND
// eine Bild-URL (<LinkAdr><Name Bez="Bild IGH" …>URL</Name>) — anders als bexio
// (CSV ohne Bild). _parseDebimXml zieht die Felder per Regex (kein XML-Parser im
// Netlify-Runtime nötig) und baut Roh-Objekte, die _normArtikel danach mappt.
function _debimTag(body, tag){
  var m = String(body || '').match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? m[1] : '';
}
// Bild-URL aus dem <LinkAdr>-Block: bevorzugt ein <Name> mit Bild-Endung (Ext) bzw.
// «Bild»/«Image»-Bezeichnung; sonst eine URL, die auf eine Bildendung endet.
function _debimBild(body){
  var re = /<Name\b([^>]*)>([\s\S]*?)<\/Name>/gi, m, imgExt = /^\.?(png|jpe?g|gif|webp|bmp|svg)$/i, fallback = '';
  while ((m = re.exec(String(body || '')))){
    var at = m[1] || '', url = _xmlUnescape(String(m[2] || '').trim());
    if (!url) continue;
    var ext = (at.match(/\bExt\s*=\s*"([^"]*)"/i) || ['', ''])[1];
    var bez = (at.match(/\bBez\s*=\s*"([^"]*)"/i) || ['', ''])[1];
    if (imgExt.test(ext) || /\bbild\b|image|foto|photo/i.test(bez)) return url;
    if (!fallback && /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i.test(url)) fallback = url;
  }
  return fallback;
}
function _parseDebimXml(text){
  var t = String(text || '');
  if (t.indexOf('<Artikel') < 0) return null;   // kein debim/DataExpert-BIM
  var out = [], re = /<Artikel\b([^>]*)>([\s\S]*?)<\/Artikel>/gi, m;
  while ((m = re.exec(t))){
    var attrs = m[1] || '', body = m[2] || '';
    var artnr = (attrs.match(/\bArtNr\s*=\s*"([^"]*)"/i) || ['', ''])[1];
    // Einheit: <Menge ISO="PCE" Einh="ST">1</Menge> — ISO bevorzugt, sonst Einh
    var mgTag = body.match(/<Menge\b([^>]*)>/i);
    var mgAttr = mgTag ? mgTag[1] : '';
    var einheit = (mgAttr.match(/\bISO\s*=\s*"([^"]*)"/i) || mgAttr.match(/\bEinh\s*=\s*"([^"]*)"/i) || ['', ''])[1];
    // Preis + EAN aus dem ersten <Pr Preis="…" EAN="…"/>
    var pr = body.match(/<Pr\b([^>]*)>/i);
    var prAttr = pr ? pr[1] : '';
    var preis = (prAttr.match(/\bPreis\s*=\s*"([^"]*)"/i) || ['', ''])[1];
    var ean = (prAttr.match(/\bEAN\s*=\s*"([^"]*)"/i) || ['', ''])[1];
    out.push({
      produktcode: _xmlUnescape(artnr),
      produktname: _xmlUnescape(_debimTag(body, 'TKurz')),
      produktbeschreibung: _xmlUnescape(_debimTag(body, 'TLang')),
      einheit: _xmlUnescape(einheit),
      verkaufspreis: _xmlUnescape(preis),
      ean: _xmlUnescape(ean),
      bild: _debimBild(body)
    });
  }
  return out.length ? out : null;
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
  // debug=1 → Rohantwort von dataselect.ch durchreichen (HTTP-Status, Content-Type,
  // erkanntes Format, erste ~2500 Zeichen), damit man ohne IGH-Wissen SEHEN kann,
  // was der Lieferant wirklich zurückgibt (JSON? XML? Login-/Fehlerseite? leer?).
  var debug = (String(p.debug || '') === '1' || String(p.debug || '').toLowerCase() === 'true');
  // Beim Debug ein günstiges, weit verbreitetes Format erzwingen (falls nichts
  // eingegeben) — die Frage ist «was kommt zurück», nicht «findet er den Artikel».
  var dbgFormat = String(p.format || '').trim();

  // Ziel-URL bauen (fixer Host → keine SSRF-Fläche)
  var qs = new URLSearchParams();
  qs.set('id_anbieter', anbieter);
  qs.set('preisbuch_nr', preisbuch);
  qs.set('code_sprache', sprache);
  // `format` wählt bei DataSelect ein Export-FORMAT (Zielsystem), nicht JSON/XML.
  // `debim` (DataExpert-BIM, XML) liefert pro Artikel Kurz-/Langtext, Einheit,
  // Preis, EAN UND eine Bild-URL — deshalb Default (IGH-Produktfotos fliessen so
  // in die Positionen). `bexio` (CSV) ist schlank, aber OHNE Bild — bleibt als
  // Fallback (der Parser erkennt beide Formate automatisch). Beide Modi per Env
  // übersteuerbar. Im Debug darf das Zielformat per Param getestet werden
  // (z.B. &format=bexio), sonst gilt die Env-Vorgabe je Modus.
  qs.set('format', (debug && dbgFormat) ? dbgFormat : (withBilder
    ? (process.env.DATASELECT_FORMAT_BILD || 'debim')
    : (process.env.DATASELECT_FORMAT_SUCHE || 'debim')));
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
  // URL fürs Debug OHNE Zugangs-Token (falls einer als Query-Param mitgeht).
  var safeUrl = url;
  if (key && process.env.DATASELECT_KEY_PARAM){
    try { var sq = new URLSearchParams(qs.toString()); sq.set(process.env.DATASELECT_KEY_PARAM, '***'); safeUrl = BASE + (BASE.indexOf('?') >= 0 ? '&' : '?') + sq.toString(); } catch (e){}
  }

  var ctrl = new AbortController();
  var timer = setTimeout(function(){ ctrl.abort(); }, TIMEOUT_MS);
  var resp, textBody;
  try {
    resp = await fetch(url, { headers: headers, signal: ctrl.signal });
    textBody = await resp.text();
  } catch (e){
    clearTimeout(timer);
    var netMsg = (e && e.name === 'AbortError') ? 'Zeitüberschreitung (dataselect.ch antwortet nicht rechtzeitig).' : ('Netzwerkfehler: ' + (e && e.message ? e.message : '—'));
    if (debug) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, debug: { triedUrl: safeUrl, format: qs.get('format'), keyGesetzt: !!key, netzwerkFehler: netMsg } }) };
    if (e && e.name === 'AbortError') return _err(504, 'DataSelect antwortet nicht rechtzeitig. Bitte später erneut versuchen.', cors);
    return _err(502, 'DataSelect nicht erreichbar: ' + (e && e.message ? e.message : 'Netzwerkfehler'), cors);
  }
  clearTimeout(timer);

  // DEBUG: Rohantwort so zurückgeben, wie sie kam (unabhängig von Status/Format).
  if (debug){
    var _dbg = String(textBody || '');
    var _t = _dbg.replace(/^﻿/, '').trim();
    var ct = '';
    try { ct = (resp.headers && resp.headers.get) ? (resp.headers.get('content-type') || '') : ''; } catch (e){}
    var looksLike = 'leer/unbekannt';
    if (_t.charAt(0) === '{' || _t.charAt(0) === '[') looksLike = 'JSON';
    else if (_t.indexOf('<Artikel') >= 0 || /<DataExpert/i.test(_t)){
      var _dm = _parseDebimXml(_t);
      looksLike = 'debim-XML (' + ((_dm && _dm.length) || 0) + ' Artikel, mit Bild — wird unterstützt)';
    }
    else if (_t.charAt(0) === '<') looksLike = (/^<\?xml/i.test(_t) || /<\/?[a-z]+:/.test(_t)) ? 'XML' : 'HTML/XML';
    else if (_t){
      var _csv = _parseCsv(_t);
      looksLike = _csv ? ('CSV (' + _csv.header.length + ' Spalten, ' + _csv.rows.length + ' Datenzeilen — wird unterstützt)') : 'Text (kein JSON/XML)';
    }
    var jsonOk = false; if (looksLike === 'JSON'){ try { JSON.parse(_t); jsonOk = true; } catch (e){} }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, debug: {
      triedUrl: safeUrl,
      format: qs.get('format'),
      keyGesetzt: !!key,
      httpStatus: resp.status,
      httpStatusText: resp.statusText || '',
      contentType: ct,
      erkanntesFormat: looksLike,
      jsonParsebar: jsonOk,
      laenge: _dbg.length,
      auszug: _dbg.slice(0, 2500)
    } }) };
  }

  if (!resp.ok){
    // 404 = kein Treffer → leere Liste (nicht als Fehler behandeln)
    if (resp.status === 404) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, artikel: [], anzahl: 0 }) };
    var hint = (resp.status === 401 || resp.status === 403)
      ? ' — Zugang verweigert (Vertrag/Token prüfen: DATASELECT_API_KEY).' : '';
    return _err(502, 'DataSelect-Fehler (HTTP ' + resp.status + ')' + hint, cors);
  }

  var data;
  var _raw = String(textBody || '').replace(/^﻿/, '').trim();   // BOM/Whitespace weg
  try { data = JSON.parse(_raw); }
  catch (e){
    // Kein JSON → Formate der Reihe nach probieren:
    //  1) debim (DataExpert-BIM XML) — enthält Bild-URL, EAN, Kurz-/Langtext.
    //  2) bexio (CSV, Semikolon-getrennt) — schlank, aber OHNE Bild.
    // Nur-Header/leeres XML (kein Treffer) = leere Liste.
    var debim = _parseDebimXml(_raw);
    if (debim){ data = debim; }
    else {
      var csv = _parseCsv(_raw);
      if (csv){ data = csv.rows; }
      else if (_raw.charAt(0) === '<' && /<(DataExpert|Katalog|Produkte|Body)\b/i.test(_raw)){
        // debim-Hülle ohne Artikel → kein Treffer (leere Liste, kein Fehler).
        data = [];
      }
      else {
        var hint = (_raw.charAt(0) === '<')
          ? ' — das gewählte Format liefert XML/HTML statt Daten. Bitte ein unterstütztes Format (debim mit Bildern oder bexio) via DATASELECT_FORMAT_SUCHE/DATASELECT_FORMAT_BILD setzen.'
          : ' (evtl. Zugang/Token nötig oder Format geändert).';
        return _err(502, 'DataSelect lieferte kein verwertbares Format' + hint, cors);
      }
    }
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
exports._parseCsv = _parseCsv;
exports._stripHtml = _stripHtml;
exports._afAusfuehrung = _afAusfuehrung;
exports._mapEinheit = _mapEinheit;
exports._cleanLang = _cleanLang;
exports._xmlUnescape = _xmlUnescape;
exports._parseDebimXml = _parseDebimXml;
exports._debimBild = _debimBild;
