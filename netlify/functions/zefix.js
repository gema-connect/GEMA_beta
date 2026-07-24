/**
 * netlify/functions/zefix.js
 *
 * Proxy für das Schweizer Handelsregister (Zefix Public REST API des Bundes).
 * Der Browser kann zefix.admin.ch wegen CORS nicht direkt aufrufen, und die
 * Zugangsdaten (Basic-Auth-Konto, kostenlos bei zefix.admin.ch) bleiben
 * serverseitig.
 *
 * Aufruf (via gema_zefix.js, JWT im Authorization-Header):
 *   GET /.netlify/functions/zefix?name=Muster        → Firmensuche (Liste)
 *   GET /.netlify/functions/zefix?uid=CHE-123.456.789 → Detail inkl. Adresse
 *
 * Antwort:
 *   { ok:true, firmen:[ {name,uid,uidFormatted,chid,sitz,rechtsform,
 *                        rechtsformKurz,status,aktiv,zefixUrl,
 *                        strasse,plz,ort,land}, … ], anzahl }
 *   { ok:false, error:'…' }
 *
 * Die SUCHE liefert keine Adresse (so sieht es die Zefix-API vor) — das
 * Frontend holt sie beim Auswählen mit einem zweiten Aufruf (?uid=…), analog
 * zum Bild-Nachladen in dataselect.js.
 *
 * Konfiguration (Netlify-Env):
 *   ZEFIX_USER + ZEFIX_PASSWORD   Basic-Auth-Konto (kostenlose Registrierung
 *                                 auf zefix.admin.ch → «Public REST API»)
 *   ZEFIX_AUTH                    Alternative: fertiger Header-Wert
 *                                 («Basic <base64>») bzw. reines base64
 *   ZEFIX_BASE                    Endpoint-Basis (Default s.u.)
 * Ohne Zugangsdaten antwortet Zefix mit 401 → die Function meldet das als
 * klaren Konfigurations-Hinweis; GEMA bleibt voll nutzbar (Firma von Hand
 * eintippen), genau wie DataSelect ohne IGH-Vertrag.
 *
 * SSRF: fixer Host aus der Env — es wird NIE eine vom Client gelieferte URL
 * abgerufen (nur Suchbegriff bzw. UID, beide streng validiert).
 */
'use strict';

const { requireAuth } = require('./_jwt');

const BASE = (process.env.ZEFIX_BASE || 'https://www.zefix.admin.ch/ZefixPublicREST').replace(/\/+$/, '');
const TIMEOUT_MS = 9000;
const MAX_ENTRIES = 20;

function _err(status, msg, headers) {
  return { statusCode: status, headers: headers, body: JSON.stringify({ ok: false, error: msg }) };
}

function _authHeader() {
  const u = process.env.ZEFIX_USER || '';
  const p = process.env.ZEFIX_PASSWORD || '';
  if (u && p) return 'Basic ' + Buffer.from(u + ':' + p).toString('base64');
  const raw = (process.env.ZEFIX_AUTH || '').trim();
  if (raw) return /^basic\s/i.test(raw) ? raw : 'Basic ' + raw;
  return '';
}

// ── Normalisierung (heuristisch — das Schema der Bundes-API kann sich
//    zwischen Versionen leicht verschieben; darum über Kandidatenlisten). ──
function _normKey(k) { return String(k).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function _pick(obj, cands) {
  if (!obj || typeof obj !== 'object') return '';
  const map = {};
  Object.keys(obj).forEach(function (k) { if (map[_normKey(k)] === undefined) map[_normKey(k)] = obj[k]; });
  for (let i = 0; i < cands.length; i++) {
    const v = map[_normKey(cands[i])];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}
// Zefix liefert mehrsprachige Texte teils als {de,fr,it,en}-Objekt.
function _txt(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') return String(v.de || v.fr || v.it || v.en || '').trim();
  return String(v).trim();
}
// CHE123456789 → CHE-123.456.789
function _fmtUid(uid) {
  const d = String(uid || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const m = d.match(/^CHE(\d{9})$/);
  if (!m) return String(uid || '').trim();
  return 'CHE-' + m[1].slice(0, 3) + '.' + m[1].slice(3, 6) + '.' + m[1].slice(6, 9);
}
function _uidDigits(uid) {
  const d = String(uid || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return /^CHE\d{9}$/.test(d) ? d : '';
}

function _normAdresse(a) {
  if (!a || typeof a !== 'object') return { strasse: '', plz: '', ort: '', land: '' };
  const str = _txt(_pick(a, ['street', 'strasse', 'strasseHausnummer']));
  const nr = _txt(_pick(a, ['houseNumber', 'hausnummer', 'streetNumber']));
  const pf = _txt(_pick(a, ['poBox', 'postfach', 'postOfficeBox']));
  let strasse = (str + (str && nr ? ' ' : '') + nr).trim();
  if (!strasse && pf) strasse = /postfach/i.test(pf) ? pf : 'Postfach ' + pf;
  return {
    strasse: strasse,
    plz: String(_pick(a, ['swissZipCode', 'zipCode', 'plz', 'postalCode']) || '').trim(),
    ort: _txt(_pick(a, ['town', 'city', 'ort', 'place'])),
    land: _txt(_pick(a, ['country', 'land']))
  };
}

function _normFirma(r) {
  if (!r || typeof r !== 'object') return null;
  const name = _txt(_pick(r, ['name', 'firmenname', 'companyName']));
  const uidRaw = _txt(_pick(r, ['uid', 'uidFormatted', 'uidBfs']));
  if (!name && !uidRaw) return null;
  const lf = r.legalForm || r.rechtsform || null;
  const status = String(_pick(r, ['status', 'statusCode']) || '').toUpperCase();
  const adr = _normAdresse(r.address || r.adresse || r.legalAddress);
  const uidD = _uidDigits(uidRaw);
  return {
    name: name,
    uid: uidD || String(uidRaw || '').trim(),
    uidFormatted: _fmtUid(uidRaw),
    chid: _txt(_pick(r, ['chidFormatted', 'chid'])),
    ehraid: String(_pick(r, ['ehraid']) || ''),
    sitz: _txt(_pick(r, ['legalSeat', 'sitz', 'legalSeatName'])),
    rechtsform: lf ? _txt(lf.name || lf) : _txt(_pick(r, ['legalFormName'])),
    rechtsformKurz: lf ? _txt(lf.shortName) : '',
    status: status,
    aktiv: status ? status === 'ACTIVE' || status === 'AKTIV' : true,
    zefixUrl: _txt(_pick(r, ['cantonalExcerptWeb', 'zefixUrl']))
      || (uidD ? 'https://www.zefix.ch/de/search/entity/list?name=' + encodeURIComponent(name) : ''),
    strasse: adr.strasse, plz: adr.plz, ort: adr.ort, land: adr.land
  };
}

// Antwort kann Array ODER Container ({list:[…]}/{data:[…]}/Einzelobjekt) sein.
function _extractList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const keys = ['list', 'data', 'results', 'firms', 'entries', 'content'];
  for (let i = 0; i < keys.length; i++) if (Array.isArray(data[keys[i]])) return data[keys[i]];
  return [data];
}

async function _call(path, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  try {
    const auth = _authHeader();
    const headers = { 'Accept': 'application/json', 'User-Agent': 'GEMA/1.0' };
    if (auth) headers['Authorization'] = auth;
    if (opts && opts.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + path, {
      method: (opts && opts.method) || 'GET',
      headers: headers,
      body: (opts && opts.body) || undefined,
      redirect: 'follow',
      signal: ctrl.signal
    });
    const text = await res.text();
    return { status: res.status, text: text };
  } finally { clearTimeout(t); }
}

exports.handler = async function (event) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    }, body: '' };
  }
  // Auth-Gate (Review S3): nur eingeloggte GEMA-User — kein offener Proxy.
  if (!requireAuth(event)) return _err(401, 'Nicht angemeldet', cors);

  let p = event.queryStringParameters || {};
  if (!p.name && !p.uid && event.body) {
    try { p = Object.assign({}, p, JSON.parse(event.body || '{}')); } catch (e) {}
  }

  const uid = _uidDigits(p.uid || '');
  const name = String(p.name || '').trim().slice(0, 80);
  if (!uid && !name) return _err(400, 'Bitte Firmennamen (name) oder UID (uid) angeben.', cors);
  if (!uid && p.uid) return _err(400, 'Ungültige UID — erwartet wird CHE-123.456.789.', cors);
  if (!uid && name.length < 3) return _err(400, 'Suchbegriff zu kurz (mind. 3 Zeichen).', cors);

  const lang = ['de', 'fr', 'it', 'en'].indexOf(String(p.sprache || 'de').toLowerCase()) >= 0
    ? String(p.sprache || 'de').toLowerCase() : 'de';

  let r;
  try {
    r = uid
      ? await _call('/api/v1/firm/' + encodeURIComponent(uid) + '.json')
      : await _call('/api/v1/firm/search', {
          method: 'POST',
          body: JSON.stringify({ name: name, languageKey: lang, maxEntries: MAX_ENTRIES, offset: 0, activeOnly: false })
        });
  } catch (e) {
    const msg = (e && e.name === 'AbortError')
      ? 'Handelsregister antwortet nicht (Zeitüberschreitung).'
      : 'Handelsregister nicht erreichbar.';
    return _err(504, msg, cors);
  }

  if (r.status === 401 || r.status === 403) {
    return _err(502, 'Handelsregister-Zugang nicht konfiguriert oder abgelehnt — ZEFIX_USER/ZEFIX_PASSWORD in den Netlify-Einstellungen hinterlegen (kostenloses Konto auf zefix.admin.ch).', cors);
  }
  if (r.status === 404) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, firmen: [], anzahl: 0 }) };
  if (r.status < 200 || r.status >= 300) return _err(502, 'Handelsregister meldet HTTP ' + r.status + '.', cors);

  let data;
  try { data = JSON.parse(r.text.replace(/^﻿/, '')); }
  catch (e) { return _err(502, 'Unerwartete Antwort des Handelsregisters (kein JSON).', cors); }

  const firmen = _extractList(data).map(_normFirma).filter(Boolean).slice(0, MAX_ENTRIES);
  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, firmen: firmen, anzahl: firmen.length }) };
};

// Für Node-Tests
exports._normFirma = _normFirma;
exports._normAdresse = _normAdresse;
exports._extractList = _extractList;
exports._fmtUid = _fmtUid;
exports._uidDigits = _uidDigits;
exports._txt = _txt;
