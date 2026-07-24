/**
 * netlify/functions/zefix.js
 *
 * Proxy für das Schweizer Handelsregister. Zwei Quellen:
 *
 *   1) LINDAS SPARQL (DEFAULT, Open Data — KEINE Zugangsdaten nötig)
 *      Linked-Data-Dienst der Bundesverwaltung, Graph des Bundesamts für
 *      Justiz: <https://lindas.admin.ch/foj/zefix>. Endpunkt
 *      https://lindas.admin.ch/query, Vokabular schema.org.
 *   2) Zefix Public REST API (Fallback, braucht ein kostenloses Konto)
 *      ZEFIX_USER/ZEFIX_PASSWORD — wird genutzt, wenn ZEFIX_SOURCE=rest
 *      gesetzt ist oder LINDAS ausfällt und Zugangsdaten hinterlegt sind.
 *
 * Der Browser kann beide wegen CORS nicht direkt aufrufen.
 *
 * Aufruf (via gema_zefix.js, JWT im Authorization-Header):
 *   GET …/zefix?name=Muster          → Firmensuche (Liste)
 *   GET …/zefix?uid=CHE-123.456.789  → Detail inkl. Adresse
 *   GET …/zefix?…&debug=1            → zusätzlich die abgesetzte Abfrage +
 *                                      Rohantwort (zum Verifizieren des
 *                                      Datenmodells gegen den Live-Dienst)
 *
 * Antwort:
 *   { ok:true, quelle:'lindas'|'rest', firmen:[ {name,uid,uidFormatted,chid,
 *       sitz,rechtsform,rechtsformKurz,status,aktiv,zefixUrl,lindasUri,
 *       strasse,plz,ort,land}, … ], anzahl }
 *   { ok:false, error:'…' }
 *
 * ── SPARQL-Robustheit (WICHTIG) ─────────────────────────────────────────
 * Ausser `a schema:Organization` + `schema:legalName` ist in den Abfragen
 * ALLES `OPTIONAL`. Weicht das publizierte Modell in einem Detail ab
 * (Identifier-Label, Adress-Prädikat, Rechtsform), fehlt dann nur das
 * betroffene Feld — die Trefferliste bleibt. Ein PFLICHT-Tripel würde
 * dagegen die ganze Abfrage leer laufen lassen.
 *
 * Konfiguration (Netlify-Env, alle optional):
 *   ZEFIX_SOURCE            'lindas' (Default) | 'rest'
 *   ZEFIX_LINDAS_ENDPOINT   Default https://lindas.admin.ch/query
 *   ZEFIX_LINDAS_GRAPH      Default https://lindas.admin.ch/foj/zefix
 *   ZEFIX_LINDAS_MATCH      'prefix' (Default) | 'contains'
 *                           contains findet mehr, ist aber deutlich teurer
 *   ZEFIX_LINDAS_QUERY      Ersetzt die Such-Abfrage komplett.
 *                           Platzhalter {{Q}} (bereits escapt), {{LIMIT}},
 *                           {{GRAPH}} — Notausgang, falls das Modell
 *                           angepasst wird, ohne neuen Deploy.
 *   ZEFIX_LINDAS_DETAIL_QUERY  dito für das Detail, Platzhalter {{UID}},
 *                           {{UIDPLAIN}}, {{GRAPH}}
 *   ZEFIX_USER/ZEFIX_PASSWORD/ZEFIX_AUTH/ZEFIX_BASE   REST-Zugang
 *
 * SSRF: fixe Hosts aus der Env — es wird NIE eine vom Client gelieferte URL
 * abgerufen (nur Suchbegriff bzw. UID, beide streng validiert und escapt).
 */
'use strict';

const { requireAuth } = require('./_jwt');

const SOURCE = String(process.env.ZEFIX_SOURCE || 'lindas').toLowerCase();
const LINDAS_ENDPOINT = process.env.ZEFIX_LINDAS_ENDPOINT || 'https://lindas.admin.ch/query';
const LINDAS_GRAPH = process.env.ZEFIX_LINDAS_GRAPH || 'https://lindas.admin.ch/foj/zefix';
const LINDAS_MATCH = String(process.env.ZEFIX_LINDAS_MATCH || 'prefix').toLowerCase();
const REST_BASE = (process.env.ZEFIX_BASE || 'https://www.zefix.admin.ch/ZefixPublicREST').replace(/\/+$/, '');
const TIMEOUT_MS = 9000;   // Netlify bricht synchrone Functions bei ~10 s ab
const MAX_ENTRIES = 20;

function _err(status, msg, headers, extra) {
  const body = Object.assign({ ok: false, error: msg }, extra || {});
  return { statusCode: status, headers: headers, body: JSON.stringify(body) };
}

// ═══════════════════════ Gemeinsame Normalisierung ═══════════════════════

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
// Mehrsprachige Texte kommen teils als {de,fr,it,en}-Objekt.
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
function _zefixUrl(name) {
  return name ? 'https://www.zefix.ch/de/search/entity/list?name=' + encodeURIComponent(name) : '';
}
// Status-Strings/URIs auf «aktiv?» abbilden. Unbekannt/fehlend ⇒ aktiv
// (eine Firma NICHT fälschlich als gelöscht markieren).
function _istAktiv(status) {
  const s = String(status || '').toUpperCase();
  if (!s) return true;
  if (/CANCELL|DELET|GELOESCH|GELÖSCH|RADIER|LIQUIDAT|DISSOLV|INACTIVE|CLOSED/.test(s)) return false;
  return true;
}

function _normAdresse(a) {
  if (!a || typeof a !== 'object') return { strasse: '', plz: '', ort: '', land: '' };
  const str = _txt(_pick(a, ['street', 'strasse', 'streetAddress', 'strasseHausnummer']));
  const nr = _txt(_pick(a, ['houseNumber', 'hausnummer', 'streetNumber']));
  const pf = _txt(_pick(a, ['poBox', 'postfach', 'postOfficeBox']));
  let strasse = (str + (str && nr ? ' ' : '') + nr).trim();
  if (!strasse && pf) strasse = /postfach/i.test(pf) ? pf : 'Postfach ' + pf;
  return {
    strasse: strasse,
    plz: String(_pick(a, ['swissZipCode', 'zipCode', 'postalCode', 'plz']) || '').trim(),
    ort: _txt(_pick(a, ['town', 'city', 'addressLocality', 'ort', 'place'])),
    land: _txt(_pick(a, ['country', 'addressCountry', 'land']))
  };
}

// REST-Datensatz (JSON der Zefix Public API) → GEMA-Schema
function _normFirma(r) {
  if (!r || typeof r !== 'object') return null;
  const name = _txt(_pick(r, ['name', 'firmenname', 'companyName', 'legalName']));
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
    aktiv: _istAktiv(status),
    zefixUrl: _txt(_pick(r, ['cantonalExcerptWeb', 'zefixUrl'])) || _zefixUrl(name),
    lindasUri: '',
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

// ═══════════════════════════ LINDAS (SPARQL) ═════════════════════════════

// Literal für die SPARQL-Abfrage escapen (Backslash, Anführungszeichen,
// Zeilenumbrüche). Zusammen mit der Vorvalidierung von name/uid gibt es
// damit keinen Injection-Pfad in die Abfrage.
function _sparqlLit(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    .replace(/\r/g, '').replace(/\n/g, ' ');
}

// Gemeinsamer OPTIONAL-Block: alles ausser Name ist optional (s. Kopf).
function _lindasOptionals() {
  return [
    '  OPTIONAL { ?company schema:identifier ?idU . ?idU schema:value ?uid .',
    '             FILTER(STRSTARTS(UCASE(STR(?uid)), "CHE")) }',
    '  OPTIONAL { ?company schema:identifier ?idC . ?idC schema:value ?chid .',
    '             FILTER(STRSTARTS(UCASE(STR(?chid)), "CH-")) }',
    '  OPTIONAL { ?company schema:additionalType ?lfNode .',
    '             OPTIONAL { ?lfNode schema:name ?legalFormName }',
    '             OPTIONAL { ?lfNode schema:alternateName ?legalFormShort } }',
    '  OPTIONAL { ?company schema:address ?adr .',
    '             OPTIONAL { ?adr schema:streetAddress ?street }',
    '             OPTIONAL { ?adr schema:postalCode ?zip }',
    '             OPTIONAL { ?adr schema:addressLocality ?locality } }',
    '  OPTIONAL { ?company schema:organizationStatus ?status }'
  ].join('\n');
}

function _lindasSearchQuery(q, limit) {
  const tpl = process.env.ZEFIX_LINDAS_QUERY;
  const lit = _sparqlLit(q.toLowerCase());
  if (tpl) {
    return tpl.replace(/\{\{Q\}\}/g, lit)
              .replace(/\{\{LIMIT\}\}/g, String(limit))
              .replace(/\{\{GRAPH\}\}/g, LINDAS_GRAPH);
  }
  // Prefix-Match ist gegen den grossen Graph deutlich billiger als CONTAINS
  // und entspricht dem Tippverhalten («Muster» → «Muster AG»).
  const filter = LINDAS_MATCH === 'contains'
    ? '  FILTER(CONTAINS(LCASE(STR(?name)), "' + lit + '"))'
    : '  FILTER(STRSTARTS(LCASE(STR(?name)), "' + lit + '"))';
  return [
    'PREFIX schema: <http://schema.org/>',
    'SELECT ?company ?name ?uid ?chid ?legalFormName ?legalFormShort ?street ?zip ?locality ?status',
    'FROM <' + LINDAS_GRAPH + '>',
    'WHERE {',
    '  ?company a schema:Organization ;',
    '           schema:legalName ?name .',
    filter,
    _lindasOptionals(),
    '}',
    'LIMIT ' + limit
  ].join('\n');
}

function _lindasDetailQuery(uidFormatted, uidPlain) {
  const tpl = process.env.ZEFIX_LINDAS_DETAIL_QUERY;
  if (tpl) {
    return tpl.replace(/\{\{UID\}\}/g, _sparqlLit(uidFormatted))
              .replace(/\{\{UIDPLAIN\}\}/g, _sparqlLit(uidPlain))
              .replace(/\{\{GRAPH\}\}/g, LINDAS_GRAPH);
  }
  // Beide UID-Schreibweisen anbieten — welche das Modell publiziert, muss
  // die Abfrage nicht wissen (VALUES ist billig, der Einstieg bleibt
  // über den Identifier-Wert und damit indexiert).
  return [
    'PREFIX schema: <http://schema.org/>',
    'SELECT ?company ?name ?uid ?chid ?legalFormName ?legalFormShort ?street ?zip ?locality ?status',
    'FROM <' + LINDAS_GRAPH + '>',
    'WHERE {',
    '  VALUES ?uidGesucht { "' + _sparqlLit(uidFormatted) + '" "' + _sparqlLit(uidPlain) + '" }',
    '  ?idGesucht schema:value ?uidGesucht .',
    '  ?company schema:identifier ?idGesucht ;',
    '           schema:legalName ?name .',
    _lindasOptionals(),
    '}',
    'LIMIT 20'
  ].join('\n');
}

async function _lindasFetch(query) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  try {
    const res = await fetch(LINDAS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Accept': 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'GEMA/1.0'
      },
      body: 'query=' + encodeURIComponent(query),
      redirect: 'follow',
      signal: ctrl.signal
    });
    const text = await res.text();
    return { status: res.status, text: text };
  } finally { clearTimeout(t); }
}

function _bindVal(b, k) {
  return (b && b[k] && b[k].value != null) ? String(b[k].value).trim() : '';
}

// SPARQL-Bindings → GEMA-Schema. Mehrere Zeilen pro Firma sind normal
// (je Identifier/Adresse/Sprache eine) — nach Firma gruppieren, pro Feld
// gewinnt der erste nicht-leere Wert.
function _normBindings(json) {
  const rows = (json && json.results && Array.isArray(json.results.bindings)) ? json.results.bindings : [];
  const byId = {};
  const order = [];
  rows.forEach(function (b) {
    const uri = _bindVal(b, 'company');
    const name = _bindVal(b, 'name');
    if (!name) return;
    const key = uri || name;
    if (!byId[key]) {
      byId[key] = { name: name, uid: '', chid: '', rechtsform: '', rechtsformKurz: '',
                    sitz: '', status: '', strasse: '', plz: '', ort: '', lindasUri: uri };
      order.push(key);
    }
    const f = byId[key];
    const set = function (feld, wert) { if (!f[feld] && wert) f[feld] = wert; };
    set('uid', _bindVal(b, 'uid'));
    set('chid', _bindVal(b, 'chid'));
    set('rechtsform', _bindVal(b, 'legalFormName'));
    set('rechtsformKurz', _bindVal(b, 'legalFormShort'));
    set('strasse', _bindVal(b, 'street'));
    set('plz', _bindVal(b, 'zip'));
    set('ort', _bindVal(b, 'locality'));
    set('sitz', _bindVal(b, 'municipality') || _bindVal(b, 'locality'));
    set('status', _bindVal(b, 'status'));
  });
  return order.map(function (k) {
    const f = byId[k];
    const uidD = _uidDigits(f.uid);
    return {
      name: f.name,
      uid: uidD || f.uid,
      uidFormatted: _fmtUid(f.uid),
      chid: f.chid,
      ehraid: '',
      sitz: f.sitz,
      rechtsform: f.rechtsform,
      rechtsformKurz: f.rechtsformKurz,
      status: f.status,
      aktiv: _istAktiv(f.status),
      zefixUrl: _zefixUrl(f.name),
      lindasUri: f.lindasUri,
      strasse: f.strasse, plz: f.plz, ort: f.ort, land: ''
    };
  }).slice(0, MAX_ENTRIES);
}

// ═════════════════════════ Zefix REST (Fallback) ═════════════════════════

function _restAuthHeader() {
  const u = process.env.ZEFIX_USER || '';
  const p = process.env.ZEFIX_PASSWORD || '';
  if (u && p) return 'Basic ' + Buffer.from(u + ':' + p).toString('base64');
  const raw = (process.env.ZEFIX_AUTH || '').trim();
  if (raw) return /^basic\s/i.test(raw) ? raw : 'Basic ' + raw;
  return '';
}
function _hatRestZugang() { return !!_restAuthHeader(); }

async function _restCall(path, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
  try {
    const auth = _restAuthHeader();
    const headers = { 'Accept': 'application/json', 'User-Agent': 'GEMA/1.0' };
    if (auth) headers['Authorization'] = auth;
    if (opts && opts.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(REST_BASE + path, {
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

// ══════════════════════════════ Handler ══════════════════════════════════

function _parseJson(text) {
  try { return JSON.parse(String(text || '').replace(/^﻿/, '')); }
  catch (e) { return null; }
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

  const uidPlain = _uidDigits(p.uid || '');
  const name = String(p.name || '').trim().slice(0, 80);
  const debug = String(p.debug || '') === '1' || String(p.debug || '').toLowerCase() === 'true';
  if (!uidPlain && !name) return _err(400, 'Bitte Firmennamen (name) oder UID (uid) angeben.', cors);
  if (!uidPlain && p.uid) return _err(400, 'Ungültige UID — erwartet wird CHE-123.456.789.', cors);
  if (!uidPlain && name.length < 3) return _err(400, 'Suchbegriff zu kurz (mind. 3 Zeichen).', cors);

  const sprache = ['de', 'fr', 'it', 'en'].indexOf(String(p.sprache || 'de').toLowerCase()) >= 0
    ? String(p.sprache || 'de').toLowerCase() : 'de';

  // ── 1) LINDAS (Open Data, ohne Zugangsdaten) ──
  const lindasZuerst = SOURCE !== 'rest';
  if (lindasZuerst) {
    const query = uidPlain
      ? _lindasDetailQuery(_fmtUid(uidPlain), uidPlain)
      : _lindasSearchQuery(name, MAX_ENTRIES);
    let r = null, netzFehler = '';
    try { r = await _lindasFetch(query); }
    catch (e) {
      netzFehler = (e && e.name === 'AbortError')
        ? 'Handelsregister-Abfrage hat zu lange gedauert (LINDAS).'
        : 'LINDAS nicht erreichbar.';
    }
    const dbg = debug ? { quelle: 'lindas', endpoint: LINDAS_ENDPOINT, query: query,
                          status: r ? r.status : 0, rohantwort: r ? String(r.text || '').slice(0, 2500) : netzFehler } : null;
    if (r && r.status >= 200 && r.status < 300) {
      const json = _parseJson(r.text);
      if (json && json.results) {
        const firmen = _normBindings(json);
        const out = { ok: true, quelle: 'lindas', firmen: firmen, anzahl: firmen.length };
        if (dbg) out.debug = dbg;
        return { statusCode: 200, headers: cors, body: JSON.stringify(out) };
      }
      if (!_hatRestZugang()) {
        return _err(502, 'Unerwartete Antwort von LINDAS (kein SPARQL-Resultat).', cors, dbg ? { debug: dbg } : null);
      }
    } else if (!_hatRestZugang()) {
      const msg = netzFehler || ('LINDAS meldet HTTP ' + (r ? r.status : '?') + '.');
      return _err(502, msg, cors, dbg ? { debug: dbg } : null);
    }
    // sonst: unten auf die REST-API zurückfallen
  }

  // ── 2) Zefix Public REST (Fallback bzw. ZEFIX_SOURCE=rest) ──
  let r;
  try {
    r = uidPlain
      ? await _restCall('/api/v1/firm/' + encodeURIComponent(uidPlain) + '.json')
      : await _restCall('/api/v1/firm/search', {
          method: 'POST',
          body: JSON.stringify({ name: name, languageKey: sprache, maxEntries: MAX_ENTRIES, offset: 0, activeOnly: false })
        });
  } catch (e) {
    const msg = (e && e.name === 'AbortError')
      ? 'Handelsregister antwortet nicht (Zeitüberschreitung).'
      : 'Handelsregister nicht erreichbar.';
    return _err(504, msg, cors);
  }

  if (r.status === 401 || r.status === 403) {
    return _err(502, 'Handelsregister-Zugang nicht konfiguriert oder abgelehnt — die Open-Data-Quelle LINDAS war nicht erreichbar und für die Zefix-REST-API fehlen ZEFIX_USER/ZEFIX_PASSWORD.', cors);
  }
  if (r.status === 404) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, quelle: 'rest', firmen: [], anzahl: 0 }) };
  if (r.status < 200 || r.status >= 300) return _err(502, 'Handelsregister meldet HTTP ' + r.status + '.', cors);

  const data = _parseJson(r.text);
  if (!data) return _err(502, 'Unerwartete Antwort des Handelsregisters (kein JSON).', cors);

  const firmen = _extractList(data).map(_normFirma).filter(Boolean).slice(0, MAX_ENTRIES);
  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, quelle: 'rest', firmen: firmen, anzahl: firmen.length }) };
};

// Für Node-Tests
exports._normFirma = _normFirma;
exports._normAdresse = _normAdresse;
exports._extractList = _extractList;
exports._fmtUid = _fmtUid;
exports._uidDigits = _uidDigits;
exports._txt = _txt;
exports._istAktiv = _istAktiv;
exports._sparqlLit = _sparqlLit;
exports._normBindings = _normBindings;
exports._lindasSearchQuery = _lindasSearchQuery;
exports._lindasDetailQuery = _lindasDetailQuery;
