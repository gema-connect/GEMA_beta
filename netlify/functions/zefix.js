/**
 * netlify/functions/zefix.js
 *
 * Proxy für das Schweizer Handelsregister — liefert zu einem Suchbegriff
 * die Firmen mit NAMEN UND ADRESSE. Der Browser kann die Quellen wegen
 * CORS nicht direkt aufrufen; Zugangsdaten (falls konfiguriert) bleiben
 * serverseitig.
 *
 * Aufruf (via gema_zefix.js, JWT im Authorization-Header):
 *   GET …/zefix?name=Muster          → Firmensuche (Liste, mit Adresse)
 *   GET …/zefix?uid=CHE-123.456.789  → Detail einer Firma
 *   GET …/zefix?…&debug=1            → zusätzlich die abgesetzte Abfrage +
 *                                      Anfang der Rohantwort
 *   GET …/zefix?selftest=1           → prüft JEDE Quelle einzeln und meldet
 *                                      Status/Dauer/Trefferzahl (s. unten)
 *
 * Antwort:
 *   { ok:true, quelle:'<strategie-id>', firmen:[ {name,uid,uidFormatted,chid,
 *       sitz,rechtsform,rechtsformKurz,status,aktiv,zefixUrl,lindasUri,
 *       strasse,plz,ort,land}, … ], anzahl, versuche:[…] }
 *   { ok:false, error:'…', versuche:[…] }
 *
 * ── QUELLEN-KASKADE (der Grund für den Umbau) ───────────────────────────
 * Vorher gab es EINE Quelle (LINDAS) und einen Fallback, der ohne
 * hinterlegte Zugangsdaten nie griff: fiel LINDAS aus oder lief die
 * Abfrage in den Timeout, war die Firmensuche komplett tot. Jetzt werden
 * mehrere Strategien der Reihe nach probiert, jede mit eigenem kurzem
 * Timeout innerhalb des 10-s-Budgets von Netlify. Die erste, die Treffer
 * liefert, gewinnt; sie wird gemerkt (`_letzteGute`) und beim nächsten
 * Aufruf zuerst probiert. Eine Quelle, die gerade gescheitert ist, wird
 * für ein paar Minuten übersprungen, damit ein toter Dienst nicht bei
 * jeder Anfrage erneut das Zeitbudget frisst.
 *
 * KEINE Quelle wird stillschweigend verschluckt: was womit gescheitert
 * ist, steht in `versuche` und (bei Totalausfall) im `error`.
 *
 * ── WARUM DIE LINDAS-ABFRAGE ZWEISTUFIG IST (KRITISCH) ──────────────────
 * Die alte Abfrage suchte den Namen UND zog in derselben Abfrage über
 * fünf OPTIONAL-Blöcke Identifier, Rechtsform, Adresse und Status. Der
 * Namensfilter ist aber ein Scan über alle ~1.5 Mio `schema:legalName`
 * des Graphen — zusammen mit den OPTIONAL-Joins läuft das zuverlässig in
 * den Timeout. Jetzt:
 *   Stufe 1  nur `?company ?name` + LIMIT — nichts sonst.
 *   Stufe 2  Details NUR für die max. 20 gefundenen URIs (`VALUES ?company`),
 *            damit über den Subjekt-Index statt über einen Scan.
 * Fällt Stufe 2 aus, werden trotzdem die NAMEN geliefert (die Adresse holt
 * das Frontend beim Auswählen per `?uid=` nach) — Teilausfall ist besser
 * als gar keine Vorschläge.
 *
 * Der Namensfilter selbst ist ein RANGE (`?name >= "Muster" && ?name <
 * "Muster￿"`) statt `STRSTARTS(LCASE(…))`: ein Bereichsvergleich auf
 * dem Literal kann den Index nutzen, `LCASE` auf jeder Zeile nicht. Weil
 * der Bereich zeichengenau ist, werden zwei Schreibweisen angeboten
 * (Eingabe wie getippt + erster Buchstabe gross). `STRSTARTS(LCASE(…))`
 * bleibt als eigene, langsamere Strategie erhalten — sie findet auch
 * Namen mit abweichender Gross-/Kleinschreibung.
 *
 * ── SPARQL-Robustheit ───────────────────────────────────────────────────
 * Ausser `schema:legalName` ist ALLES `OPTIONAL`. Weicht das publizierte
 * Modell in einem Detail ab (Identifier-Label, Adress-Prädikat), fehlt
 * nur das betroffene Feld — die Trefferliste bleibt. Ein PFLICHT-Tripel
 * würde die ganze Abfrage leer laufen lassen.
 *
 * Konfiguration (Netlify-Env, alle optional):
 *   ZEFIX_SOURCE            leer (Default) = Kaskade · 'lindas' · 'rest'
 *                           (erzwingt genau eine Familie)
 *   ZEFIX_LINDAS_ENDPOINT   Default https://lindas.admin.ch/query
 *   ZEFIX_LINDAS_GRAPH      Default https://lindas.admin.ch/foj/zefix
 *   ZEFIX_LINDAS_MATCH      'prefix' (Default) | 'contains' — betrifft nur
 *                           die STRSTARTS-Strategie
 *   ZEFIX_LINDAS_QUERY      Ersetzt die Such-Abfrage komplett. Platzhalter
 *                           {{Q}} (escapt), {{LIMIT}}, {{GRAPH}} — Notausgang,
 *                           falls das Modell wechselt, ohne neuen Deploy.
 *   ZEFIX_LINDAS_DETAIL_QUERY  dito fürs Detail: {{UID}}, {{UIDPLAIN}}, {{GRAPH}}
 *   ZEFIX_PUBLIC_BASE       Default https://www.zefix.ch/ZefixREST — die vom
 *                           öffentlichen Zefix-Suchportal genutzte API,
 *                           ohne Zugangsdaten. NICHT vertraglich zugesichert:
 *                           ob sie auf dieser Installation trägt, zeigt
 *                           ?selftest=1. Leer setzen schaltet sie ab.
 *   ZEFIX_BASE / ZEFIX_USER / ZEFIX_PASSWORD / ZEFIX_AUTH
 *                           Zefix Public REST mit Konto (admin.ch)
 *
 * SSRF: fixe Hosts aus der Env — es wird NIE eine vom Client gelieferte
 * URL abgerufen (nur Suchbegriff bzw. UID, beide streng validiert und
 * escapt).
 */
'use strict';

const { requireAuth } = require('./_jwt');

const SOURCE = String(process.env.ZEFIX_SOURCE || '').toLowerCase();
const LINDAS_ENDPOINT = process.env.ZEFIX_LINDAS_ENDPOINT || 'https://lindas.admin.ch/query';
const LINDAS_GRAPH = process.env.ZEFIX_LINDAS_GRAPH || 'https://lindas.admin.ch/foj/zefix';
const LINDAS_MATCH = String(process.env.ZEFIX_LINDAS_MATCH || 'prefix').toLowerCase();
const REST_BASE = (process.env.ZEFIX_BASE || 'https://www.zefix.admin.ch/ZefixPublicREST').replace(/\/+$/, '');
const PUBLIC_BASE = (process.env.ZEFIX_PUBLIC_BASE === undefined
  ? 'https://www.zefix.ch/ZefixREST'
  : String(process.env.ZEFIX_PUBLIC_BASE || '')).replace(/\/+$/, '');

const GESAMT_MS = 8500;   // Netlify bricht synchrone Functions bei ~10 s ab
const QUELLE_MS = 3400;   // pro Quelle — so passen zwei Versuche ins Budget
const DETAIL_MS = 2600;   // Stufe 2 der LINDAS-Suche (Adressen nachladen)
const SPERRE_MS = 5 * 60 * 1000;
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

// REST-Datensatz (JSON der Zefix-APIs) → GEMA-Schema
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

// Schreibweisen für den Bereichsvergleich: wie getippt + erster Buchstabe
// gross (Firmennamen im Register beginnen praktisch immer gross). Mehr
// Varianten kosten je einen weiteren Bereich — bewusst auf zwei begrenzt.
function _praefixVarianten(q) {
  const roh = String(q || '').trim();
  if (!roh) return [];
  const gross = roh.charAt(0).toUpperCase() + roh.slice(1);
  return gross === roh ? [roh] : [gross, roh];
}

// Bereichsfilter: alles, was mit `p` beginnt, liegt zwischen p und
// p+￿. Ein Bereichsvergleich auf dem Literal kann den Index nutzen —
// STRSTARTS(LCASE(?name)) muss jede Zeile anfassen.
function _rangeFilter(variante) {
  const lit = _sparqlLit(variante);
  return 'FILTER(?name >= "' + lit + '" && ?name < "' + lit + '\\uFFFF")';
}

// Stufe 1 — NUR Name + URI. Kein Typ-Tripel (im Zefix-Graph trägt ohnehin
// nur eine Organisation einen legalName), keine OPTIONALs: jeder Join hier
// vervielfacht den Scan.
function _lindasNamenQuery(q, limit, modus) {
  const tpl = process.env.ZEFIX_LINDAS_QUERY;
  if (tpl) {
    return tpl.replace(/\{\{Q\}\}/g, _sparqlLit(q.toLowerCase()))
              .replace(/\{\{LIMIT\}\}/g, String(limit))
              .replace(/\{\{GRAPH\}\}/g, LINDAS_GRAPH);
  }
  let wo;
  if (modus === 'range') {
    const bloecke = _praefixVarianten(q).map(function (v) {
      return '  { ?company schema:legalName ?name . ' + _rangeFilter(v) + ' }';
    });
    wo = bloecke.join('\n  UNION\n');
  } else {
    const lit = _sparqlLit(q.toLowerCase());
    const f = LINDAS_MATCH === 'contains'
      ? '  FILTER(CONTAINS(LCASE(STR(?name)), "' + lit + '"))'
      : '  FILTER(STRSTARTS(LCASE(STR(?name)), "' + lit + '"))';
    wo = '  ?company schema:legalName ?name .\n' + f;
  }
  return [
    'PREFIX schema: <http://schema.org/>',
    'SELECT DISTINCT ?company ?name',
    'FROM <' + LINDAS_GRAPH + '>',
    'WHERE {',
    wo,
    '}',
    'LIMIT ' + limit
  ].join('\n');
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

// Stufe 2 — Details zu bekannten URIs. Einstieg über den Subjekt-Index,
// darum sind die OPTIONALs hier billig.
function _lindasDetailsQuery(uris) {
  return [
    'PREFIX schema: <http://schema.org/>',
    'SELECT ?company ?name ?uid ?chid ?legalFormName ?legalFormShort ?street ?zip ?locality ?status',
    'FROM <' + LINDAS_GRAPH + '>',
    'WHERE {',
    '  VALUES ?company { ' + uris.map(function (u) { return '<' + String(u).replace(/[<>"\s]/g, '') + '>'; }).join(' ') + ' }',
    '  ?company schema:legalName ?name .',
    _lindasOptionals(),
    '}'
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

async function _lindasFetch(query, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, Math.max(500, ms || QUELLE_MS));
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

// Stufe 1 → Stufe 2. Scheitert Stufe 2, werden die NAMEN trotzdem
// geliefert (Adresse holt das Frontend beim Auswählen nach).
async function _lindasSuche(q, modus, ms, dbg) {
  const q1 = _lindasNamenQuery(q, MAX_ENTRIES, modus);
  if (dbg) dbg.query = q1;
  const r1 = await _lindasFetch(q1, ms);
  if (dbg) { dbg.status = r1.status; dbg.rohantwort = String(r1.text || '').slice(0, 2500); }
  if (r1.status < 200 || r1.status >= 300) throw new Error('LINDAS meldet HTTP ' + r1.status + '.');
  const j1 = _parseJson(r1.text);
  if (!j1 || !j1.results) throw new Error('Unerwartete Antwort von LINDAS (kein SPARQL-Resultat).');

  const treffer = [];
  const gesehen = {};
  (j1.results.bindings || []).forEach(function (b) {
    const uri = _bindVal(b, 'company'), name = _bindVal(b, 'name');
    if (!name || gesehen[uri || name]) return;
    gesehen[uri || name] = 1;
    treffer.push({ uri: uri, name: name });
  });
  if (!treffer.length) return [];

  const uris = treffer.map(function (t) { return t.uri; }).filter(Boolean);
  let detail = [];
  if (uris.length) {
    try {
      const q2 = _lindasDetailsQuery(uris);
      if (dbg) dbg.detailQuery = q2;
      const r2 = await _lindasFetch(q2, DETAIL_MS);
      if (r2.status >= 200 && r2.status < 300) {
        const j2 = _parseJson(r2.text);
        if (j2 && j2.results) detail = _normBindings(j2);
      }
      if (dbg) dbg.detailStatus = r2.status;
    } catch (e) {
      if (dbg) dbg.detailFehler = String((e && e.message) || e);
    }
  }
  const perUri = {};
  detail.forEach(function (f) { if (f.lindasUri) perUri[f.lindasUri] = f; });
  // Reihenfolge der Stufe 1 behalten; ohne Detail wenigstens den Namen.
  return treffer.map(function (t) {
    return perUri[t.uri] || {
      name: t.name, uid: '', uidFormatted: '', chid: '', ehraid: '', sitz: '',
      rechtsform: '', rechtsformKurz: '', status: '', aktiv: true,
      zefixUrl: _zefixUrl(t.name), lindasUri: t.uri,
      strasse: '', plz: '', ort: '', land: ''
    };
  });
}

async function _lindasDetail(uidPlain, ms, dbg) {
  const q = _lindasDetailQuery(_fmtUid(uidPlain), uidPlain);
  if (dbg) dbg.query = q;
  const r = await _lindasFetch(q, ms);
  if (dbg) { dbg.status = r.status; dbg.rohantwort = String(r.text || '').slice(0, 2500); }
  if (r.status < 200 || r.status >= 300) throw new Error('LINDAS meldet HTTP ' + r.status + '.');
  const j = _parseJson(r.text);
  if (!j || !j.results) throw new Error('Unerwartete Antwort von LINDAS (kein SPARQL-Resultat).');
  return _normBindings(j);
}

// ═════════════════════════ Zefix REST (JSON-API) ═════════════════════════

function _restAuthHeader() {
  const u = process.env.ZEFIX_USER || '';
  const p = process.env.ZEFIX_PASSWORD || '';
  if (u && p) return 'Basic ' + Buffer.from(u + ':' + p).toString('base64');
  const raw = (process.env.ZEFIX_AUTH || '').trim();
  if (raw) return /^basic\s/i.test(raw) ? raw : 'Basic ' + raw;
  return '';
}
function _hatRestZugang() { return !!_restAuthHeader(); }

async function _restCall(base, path, opts) {
  const ctrl = new AbortController();
  const ms = (opts && opts.ms) || QUELLE_MS;
  const t = setTimeout(function () { ctrl.abort(); }, Math.max(500, ms));
  try {
    const headers = { 'Accept': 'application/json', 'User-Agent': 'GEMA/1.0' };
    if (opts && opts.auth) headers['Authorization'] = opts.auth;
    if (opts && opts.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, {
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

async function _restSuche(base, auth, name, sprache, ms, dbg) {
  const r = await _restCall(base, '/api/v1/firm/search.json', {
    method: 'POST', auth: auth, ms: ms,
    body: JSON.stringify({ name: name, languageKey: sprache, maxEntries: MAX_ENTRIES, offset: 0, activeOnly: false })
  });
  if (dbg) { dbg.status = r.status; dbg.rohantwort = String(r.text || '').slice(0, 2500); dbg.query = base + '/api/v1/firm/search.json'; }
  if (r.status === 401 || r.status === 403) throw new Error('Zugang abgelehnt (HTTP ' + r.status + ') — Zugangsdaten prüfen.');
  if (r.status === 404) return [];
  if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + '.');
  const data = _parseJson(r.text);
  if (!data) throw new Error('Keine JSON-Antwort.');
  return _extractList(data).map(_normFirma).filter(Boolean).slice(0, MAX_ENTRIES);
}

async function _restDetail(base, auth, uidPlain, ms, dbg) {
  const r = await _restCall(base, '/api/v1/firm/' + encodeURIComponent(uidPlain) + '.json', { auth: auth, ms: ms });
  if (dbg) { dbg.status = r.status; dbg.rohantwort = String(r.text || '').slice(0, 2500); }
  if (r.status === 401 || r.status === 403) throw new Error('Zugang abgelehnt (HTTP ' + r.status + ') — Zugangsdaten prüfen.');
  if (r.status === 404) return [];
  if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + '.');
  const data = _parseJson(r.text);
  if (!data) throw new Error('Keine JSON-Antwort.');
  return _extractList(data).map(_normFirma).filter(Boolean).slice(0, MAX_ENTRIES);
}

// ═══════════════════════════ Quellen-Kaskade ═════════════════════════════

// Reihenfolge = absteigende Erwartung. LINDAS zuerst, weil es Open Data
// ohne Zugangsdaten ist UND als einzige Quelle die Adressen gleich mit der
// Trefferliste liefert.
const QUELLEN = [
  {
    id: 'lindas-range', familie: 'lindas',
    label: 'LINDAS (Open Data, Bereichssuche)',
    aktiv: function () { return SOURCE !== 'rest'; },
    suche: function (a) { return _lindasSuche(a.name, 'range', a.ms, a.dbg); },
    detail: function (a) { return _lindasDetail(a.uid, a.ms, a.dbg); }
  },
  {
    id: 'lindas-strstarts', familie: 'lindas',
    label: 'LINDAS (Open Data, Textsuche)',
    aktiv: function () { return SOURCE !== 'rest'; },
    suche: function (a) { return _lindasSuche(a.name, 'strstarts', a.ms, a.dbg); },
    // Das Detail ist in beiden LINDAS-Strategien dieselbe Abfrage — als
    // eigener Versuch trotzdem sinnvoll (ein Aussetzer kann vorbeigehen).
    detail: function (a) { return _lindasDetail(a.uid, a.ms, a.dbg); }
  },
  {
    id: 'zefix-rest-konto', familie: 'rest',
    label: 'Zefix Public REST (mit Konto)',
    aktiv: function () { return SOURCE !== 'lindas' && _hatRestZugang(); },
    suche: function (a) { return _restSuche(REST_BASE, _restAuthHeader(), a.name, a.sprache, a.ms, a.dbg); },
    detail: function (a) { return _restDetail(REST_BASE, _restAuthHeader(), a.uid, a.ms, a.dbg); }
  },
  {
    id: 'zefix-rest-offen', familie: 'rest',
    label: 'Zefix-Suchportal (ohne Konto)',
    aktiv: function () { return SOURCE !== 'lindas' && !!PUBLIC_BASE; },
    suche: function (a) { return _restSuche(PUBLIC_BASE, '', a.name, a.sprache, a.ms, a.dbg); },
    detail: function (a) { return _restDetail(PUBLIC_BASE, '', a.uid, a.ms, a.dbg); }
  }
];

// Kurzzeit-Sperre je Quelle: ein toter Dienst soll nicht bei JEDER Anfrage
// erneut das Zeitbudget fressen. Überlebt bewusst nur den warmen
// Function-Prozess — ein Deploy/Kaltstart probiert wieder alles.
const _sperre = {};
const _quellenState = { letzteGute: '' };
function _gesperrt(id) { return !!(_sperre[id] && _sperre[id] > Date.now()); }

// Reihenfolge: zuletzt erfolgreiche Quelle zuerst, gesperrte ans Ende.
function _reihenfolge(art) {
  const nutzbar = QUELLEN.filter(function (q) { return q.aktiv() && typeof q[art] === 'function'; });
  return nutzbar.slice().sort(function (a, b) {
    const ga = _gesperrt(a.id) ? 1 : 0, gb = _gesperrt(b.id) ? 1 : 0;
    if (ga !== gb) return ga - gb;
    const la = a.id === _quellenState.letzteGute ? 0 : 1;
    const lb = b.id === _quellenState.letzteGute ? 0 : 1;
    if (la !== lb) return la - lb;
    return QUELLEN.indexOf(a) - QUELLEN.indexOf(b);
  });
}

function _fehlerText(e) {
  if (!e) return 'Unbekannter Fehler.';
  if (e.name === 'AbortError') return 'Zeitüberschreitung.';
  return String(e.message || e);
}

/**
 * Probiert die Quellen der Reihe nach. Die erste mit Treffern gewinnt.
 * Liefert eine Quelle technisch sauber NULL Treffer, wird trotzdem
 * weitergesucht (die nächste kennt die Firma vielleicht) — bleibt es
 * dabei, ist «nichts gefunden» eine gültige Antwort, kein Fehler.
 */
async function _kaskade(art, arg, opts) {
  const start = Date.now();
  const versuche = [];
  let leerErfolg = false;
  const liste = _reihenfolge(art);
  if (!liste.length) {
    return { firmen: [], quelle: '', versuche: versuche,
             fehler: 'Keine Handelsregister-Quelle aktiv (ZEFIX_SOURCE / Zugangsdaten prüfen).' };
  }
  for (let i = 0; i < liste.length; i++) {
    const q = liste[i];
    const rest = GESAMT_MS - (Date.now() - start);
    if (rest < 900) {
      versuche.push({ quelle: q.id, ok: false, uebersprungen: 'Zeitbudget aufgebraucht' });
      continue;
    }
    const dbg = opts && opts.debug ? {} : null;
    const t0 = Date.now();
    try {
      const firmen = await q[art](Object.assign({ ms: Math.min(QUELLE_MS, rest - 300), dbg: dbg }, arg));
      const n = (firmen || []).length;
      versuche.push(Object.assign({ quelle: q.id, label: q.label, ok: true, ms: Date.now() - t0, treffer: n }, dbg ? { debug: dbg } : {}));
      delete _sperre[q.id];
      if (n) {
        _quellenState.letzteGute = q.id;
        return { firmen: firmen, quelle: q.id, versuche: versuche };
      }
      leerErfolg = true;
    } catch (e) {
      _sperre[q.id] = Date.now() + SPERRE_MS;
      versuche.push(Object.assign({ quelle: q.id, label: q.label, ok: false, ms: Date.now() - t0, fehler: _fehlerText(e) }, dbg ? { debug: dbg } : {}));
    }
  }
  if (leerErfolg) return { firmen: [], quelle: '', versuche: versuche };
  const gruende = versuche.filter(function (v) { return !v.ok; })
    .map(function (v) { return (v.label || v.quelle) + ': ' + (v.fehler || v.uebersprungen); });
  return { firmen: [], quelle: '', versuche: versuche,
           fehler: 'Handelsregister nicht erreichbar — ' + (gruende.join(' · ') || 'keine Quelle lieferte eine Antwort.') };
}

// ── Selbsttest ───────────────────────────────────────────────────────────
// Beantwortet «es funktioniert nicht mehr» ohne Raten: prüft JEDE Quelle
// einzeln (auch die, die die Kaskade übersprungen hätte) und meldet
// Status, Dauer und Trefferzahl. Env-Variablen werden nur als gesetzt/
// nicht gesetzt gemeldet — nie ihr Wert.
async function _selftest(name, sprache) {
  const ergebnis = [];
  for (let i = 0; i < QUELLEN.length; i++) {
    const q = QUELLEN[i];
    const eintrag = { quelle: q.id, label: q.label, aktiv: q.aktiv(), gesperrt: _gesperrt(q.id) };
    if (!eintrag.aktiv) {
      eintrag.hinweis = q.familie === 'rest' && !_hatRestZugang() && q.id === 'zefix-rest-konto'
        ? 'Keine Zugangsdaten hinterlegt (ZEFIX_USER/ZEFIX_PASSWORD).'
        : 'Durch ZEFIX_SOURCE=' + SOURCE + ' abgeschaltet.';
      ergebnis.push(eintrag);
      continue;
    }
    const t0 = Date.now();
    try {
      const firmen = await q.suche({ name: name, sprache: sprache, ms: QUELLE_MS, dbg: null });
      eintrag.ok = true;
      eintrag.ms = Date.now() - t0;
      eintrag.treffer = (firmen || []).length;
      eintrag.mitAdresse = (firmen || []).filter(function (f) { return !!(f.strasse || f.plz || f.ort); }).length;
      eintrag.beispiel = firmen && firmen[0]
        ? { name: firmen[0].name, uid: firmen[0].uidFormatted, adresse: [firmen[0].strasse, [firmen[0].plz, firmen[0].ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') }
        : null;
    } catch (e) {
      eintrag.ok = false;
      eintrag.ms = Date.now() - t0;
      eintrag.fehler = _fehlerText(e);
    }
    ergebnis.push(eintrag);
  }
  const gut = ergebnis.filter(function (e) { return e.ok && e.treffer; });
  return {
    ok: true,
    suchbegriff: name,
    zusammenfassung: gut.length
      ? gut.length + ' von ' + ergebnis.length + ' Quellen liefern Treffer — die Firmensuche funktioniert.'
      : 'KEINE Quelle liefert Treffer — die Firmensuche ist aktuell tot. Gründe siehe unten.',
    quellen: ergebnis,
    konfiguration: {
      ZEFIX_SOURCE: SOURCE || '(leer — Kaskade)',
      ZEFIX_LINDAS_ENDPOINT: LINDAS_ENDPOINT,
      ZEFIX_LINDAS_GRAPH: LINDAS_GRAPH,
      ZEFIX_LINDAS_MATCH: LINDAS_MATCH,
      ZEFIX_PUBLIC_BASE: PUBLIC_BASE || '(abgeschaltet)',
      ZEFIX_BASE: REST_BASE,
      ZEFIX_KONTO: _hatRestZugang() ? 'gesetzt' : 'nicht gesetzt',
      eigeneSuchabfrage: !!process.env.ZEFIX_LINDAS_QUERY,
      eigeneDetailabfrage: !!process.env.ZEFIX_LINDAS_DETAIL_QUERY
    }
  };
}

// ══════════════════════════════ Handler ══════════════════════════════════

function _parseJson(text) {
  try { return JSON.parse(String(text || '').replace(/^﻿/, '')); }
  catch (e) { return null; }
}

exports.handler = async function (event) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };
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
  const flag = function (v) { return String(v || '') === '1' || String(v || '').toLowerCase() === 'true'; };
  const debug = flag(p.debug);
  const sprache = ['de', 'fr', 'it', 'en'].indexOf(String(p.sprache || 'de').toLowerCase()) >= 0
    ? String(p.sprache || 'de').toLowerCase() : 'de';

  // ── Selbsttest ──
  if (flag(p.selftest)) {
    const begriff = name.length >= 3 ? name : 'Muster';
    const out = await _selftest(begriff, sprache);
    return { statusCode: 200, headers: cors, body: JSON.stringify(out) };
  }

  if (!uidPlain && !name) return _err(400, 'Bitte Firmennamen (name) oder UID (uid) angeben.', cors);
  if (!uidPlain && p.uid) return _err(400, 'Ungültige UID — erwartet wird CHE-123.456.789.', cors);
  if (!uidPlain && name.length < 3) return _err(400, 'Suchbegriff zu kurz (mind. 3 Zeichen).', cors);

  const art = uidPlain ? 'detail' : 'suche';
  const r = await _kaskade(art, { name: name, uid: uidPlain, sprache: sprache }, { debug: debug });

  if (r.fehler) return _err(502, r.fehler, cors, { versuche: r.versuche });
  return {
    statusCode: 200, headers: cors,
    body: JSON.stringify({ ok: true, quelle: r.quelle, firmen: r.firmen, anzahl: r.firmen.length, versuche: r.versuche })
  };
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
exports._praefixVarianten = _praefixVarianten;
exports._lindasNamenQuery = _lindasNamenQuery;
exports._lindasDetailsQuery = _lindasDetailsQuery;
exports._lindasDetailQuery = _lindasDetailQuery;
exports._reihenfolge = _reihenfolge;
exports._kaskade = _kaskade;
exports._selftest = _selftest;
exports.QUELLEN = QUELLEN;
// Rückwärtskompatibel: der frühere Name der Such-Abfrage.
exports._lindasSearchQuery = function (q, limit) { return _lindasNamenQuery(q, limit, 'strstarts'); };
