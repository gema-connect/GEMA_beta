// Fahrzeugmanagement — Beleg-Import (Claude) + Kaufpreis + Preis-Sichtbarkeit
// (Auftrag 23.08.2026):
//   A) Function + Client-API: JWT-Gate, erzwungenes Tool-Use, Groessen-Limit,
//      Redirect, GemaClaude.extractBeleg schickt NUR nr/kennzeichen/modell.
//   B) Preise sind fuer den Monteur NIRGENDS sichtbar — Knopf, Kaufpreis-Feld,
//      Kosten-Analyse, Service-Chip, Berichte, CSV. Mit Gegenprobe (Magaziner).
//   C) Zuordnungs-Engine: Kennzeichen normalisiert, Modell-GEGENPRUEFUNG,
//      unbekanntes Kennzeichen wird NICHT geraten, Dubletten-Erkennung.
//   D) Batch bis 50 Belege: eine gescheiterte Datei bricht den Lauf NIE ab,
//      zu grosse Dateien werden BENANNT, Pruef-Tabelle ist editierbar,
//      Import schreibt in die Service-Historie.
//   E) Kaufpreis: Roundtrip im Formular + Gesamtkosten in der Kosten-Analyse.
//
// Aufruf:  CHROME=<chromium> node scripts/fahrzeug_beleg_import_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8907;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

// ══ A) Statisch: Function, Redirect, Client-API ══════════════════════
console.log('— A) Netlify-Function + Client-API —');
{
  const fn = await readFile(join(ROOT, 'netlify/functions/claude-beleg.js'), 'utf8');
  ok(/require\(['"]\.\/_jwt['"]\)/.test(fn) && /requireAuth\(event\)/.test(fn),
    'claude-beleg ist JWT-gegatet (kein offener, kostenpflichtiger Proxy)');
  ok(/statusCode:\s*401/.test(fn), 'Ohne Anmeldung antwortet die Function mit 401');
  ok(/tool_choice:\s*\{\s*type:\s*'tool'\s*,\s*name:\s*'beleg_extrahieren'/.test(fn),
    'Erzwungenes Tool-Use → Antwort ist immer valides JSON gegen das Schema');
  ok(/MAX_B64\s*=\s*4500000/.test(fn) && /statusCode:\s*413/.test(fn),
    'Groessen-Limit ~3 MB mit klarer 413-Meldung (Netlify-Request-Limit)');
  ok(/charset=utf-8/.test(fn), 'JSON-Antworten mit charset=utf-8 (Umlaute-Regel)');
  ok(/MAX_FLOTTE/.test(fn), 'Flotten-Liste im Prompt ist gedeckelt');
  // Datenschutz: nur die drei Felder duerfen in den Prompt
  const flotte = (fn.match(/function _flottenText[\s\S]*?\n\}/) || [''])[0];
  // Nur die drei erlaubten Felder duerfen aus dem uebergebenen Objekt gelesen
  // werden. Auf Wortfragmente pruefen waere falsch («mittel» enthaelt «tel»).
  const felder = [...flotte.matchAll(/\bf\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]).sort();
  ok([...new Set(felder)].join(',') === 'kennzeichen,modell,nr',
    'Flotten-Prompt liest ausschliesslich kennzeichen/modell/nr (gelesen: ' + [...new Set(felder)].join(',') + ')');

  const toml = await readFile(join(ROOT, 'netlify.toml'), 'utf8');
  ok(/from\s*=\s*"\/api\/claude-beleg"/.test(toml) && /functions\/claude-beleg/.test(toml),
    'netlify.toml: Redirect /api/claude-beleg ist eingetragen');

  const cl = await readFile(join(ROOT, 'gema_claude.js'), 'utf8');
  ok(/extractBeleg\s*:\s*extractBeleg/.test(cl), 'GemaClaude.extractBeleg ist exportiert');
  const eb = (cl.match(/function extractBeleg[\s\S]*?\n  \}/) || [''])[0];
  ok(/nr:/.test(eb) && /kennzeichen:/.test(eb) && /modell:/.test(eb),
    'extractBeleg sendet nr/kennzeichen/modell der Flotte mit');
  ok(!/driver|plate\b|vin|adresse/i.test(eb.replace(/kennzeichen/g, '')),
    'extractBeleg sendet KEINE weiteren Fahrzeugfelder (Datenschutz)');
  ok(/_parseJson\(r,\s*'KI-Beleganalyse'\)/.test(eb),
    'Antwort laeuft durch _parseJson (HTML/504 wird zur klaren Meldung)');

  const fz = await readFile(join(ROOT, 'if_fahrzeug.html'), 'utf8');
  ok(/<script src="gema_claude\.js">/.test(fz), 'if_fahrzeug bindet gema_claude.js ein');
  ok(/_FZ_BELEG_MAX_DATEIEN\s*=\s*50/.test(fz), 'Bis zu 50 Belege pro Lauf');
  ok(/_FZ_BELEG_PARALLEL\s*=\s*\d/.test(fz), 'Gedrosselte Parallelitaet statt 50 Calls auf einmal');
  const open = (fz.match(/function _fzBelegOpen\(\)\{[\s\S]*?\n\}/) || [''])[0];
  ok(/_fzCanEdit\(\)\|\|!_fzCanSeePreise\(\)/.test(open.replace(/\s/g, '')) ||
     /!_fzCanEdit\(\)\s*\|\|\s*!_fzCanSeePreise\(\)/.test(open),
    'Fail-closed: _fzBelegOpen prueft die Berechtigung selbst (Direktaufruf)');
  const imp = (fz.match(/function _fzBelegImport\(\)\{[\s\S]*?\n\}/) || [''])[0];
  ok(/_fzCanSeePreise\(\)/.test(imp), 'Auch der Import selbst ist gegatet');
  ok(/gema-v498/.test(await readFile(join(ROOT, 'sw.js'), 'utf8')), 'sw.js Cache-Version hochgezogen');

  // Erste Verteidigungslinie: der reine Monteur kommt gar nicht ins Modul.
  const golden = JSON.parse(await readFile(join(ROOT, 'scripts/rolematrix_golden.json'), 'utf8'));
  ok(golden.role_monteur.fahrzeugmanagement === '-',
    'role_monteur hat auf das Fahrzeugmanagement gar keinen Zugriff (Golden)');
}

// ══ Browser-Teil ═════════════════════════════════════════════════════
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/if_fahrzeug.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const store = new Map();
function likeToRe(p) {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + esc.replace(/\*/g, '.*').replace(/_/g, '.') + '$');
}
function handleSb(route) {
  const req = route.request();
  const url = decodeURIComponent(req.url());
  const method = req.method();
  const mkEq = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const dkEq = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
  const dkLike = (url.match(/data_key=like\.([^&]+)/) || [])[1];
  if (method === 'GET') {
    const rows = [];
    for (const [k, v] of store) {
      const i = k.indexOf('|');
      const m = k.slice(0, i), d = k.slice(i + 1);
      if (mkEq && m !== mkEq) continue;
      if (dkEq && d !== dkEq) continue;
      if (dkLike && !likeToRe(dkLike).test(d)) continue;
      rows.push({ module_key: m, data_key: d, payload: v });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = [];
    try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(row => { if (row && row.module_key && row.data_key) store.set(row.module_key + '|' + row.data_key, row.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') { if (mkEq && dkEq) store.delete(mkEq + '|' + dkEq); return route.fulfill({ status: 204, body: '' }); }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

const VEHICLES = [
  { id: 'v_a', nr: '30', number: '30', plate: 'BS 30030', model: 'VW Crafter', type: 'Monteurfahrzeug',
    km: 90000, status: 'aktiv', orgId: 'org_t', kaufpreis: '38000', kaufdatum: '2022-03-01',
    serviceHistorie: [{ id: 'svc_alt', datum: '2026-01-10', art: 'service', beschreibung: 'Grundservice', kosten: '450.00', km: '85000', erledigtVonUserId: 'u_mon', erledigtVonName: 'Monteur M' }] },
  { id: 'v_b', nr: '10', number: '10', plate: 'BS 10010', model: 'Ford Transit', type: 'Servicefahrzeug',
    km: 120000, status: 'aktiv', orgId: 'org_t', serviceHistorie: [] },
  { id: 'v_c', nr: '20', number: '20', plate: 'BS 20020', model: 'Opel Vivaro', type: 'Monteurfahrzeug',
    km: 45000, status: 'aktiv', orgId: 'org_t', serviceHistorie: [] }
];
function seedStore() {
  store.clear();
  VEHICLES.forEach(v => store.set('fahrzeugmanagement|vehicle:' + v.id, { data: JSON.parse(JSON.stringify(v)), _lm: '2026-08-01T00:00:00Z' }));
}
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true };
const TEAM = [
  { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch', nativeAnsicht: false } },
  // Monteur + Pruefer: role_monteur allein hat auf fahrzeugmanagement GAR KEIN
  // Recht (Golden: '-') und sieht den «Kein Zugriff»-Screen — das ist die erste
  // Verteidigungslinie. Der Hard-Lock _fzIsMonteur() muss aber auch dann greifen,
  // wenn dasselbe Konto ueber eine ZWEITE Rolle auf die Seite kommt. Genau das
  // ist hier der Fall (role_pruefer hat fahrzeugmanagement rw).
  { id: 'u_mon', username: 'mon@t.ch', name: 'Monteur M', roleIds: ['role_monteur', 'role_pruefer'], orgId: 'org_t', active: true, profile: { email: 'mon@t.ch', nativeAnsicht: false } },
  // Magaziner, der ZUSAETZLICH Monteur ist (faehrt auch raus). Ohne den
  // Hard-Lock saehe er ueber die Magaziner-Rolle alle Preise.
  { id: 'u_mixed', username: 'mix@t.ch', name: 'Mix M', roleIds: ['role_magaziner', 'role_monteur'], orgId: 'org_t', active: true, profile: { email: 'mix@t.ch', nativeAnsicht: false } }
];

// Antworten der gemockten Beleg-Function, pro Aufruf der Reihe nach.
let BELEG_ANTWORTEN = [];
let BELEG_CALLS = [];

const browser = await chromium.launch({ executablePath: CHROME });
async function openPage(userId) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    // WICHTIG: der Function-Aufruf ist RELATIV (/.netlify/functions/claude-beleg)
    // und liegt damit auf BASE — die Mock-Pruefung muss VOR dem statischen
    // Server stehen, sonst antwortet dieser mit 404 und nichts wird analysiert.
    if (u.indexOf('claude-beleg') >= 0) {
      let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
      BELEG_CALLS.push(body);
      const a = BELEG_ANTWORTEN.shift();
      if (!a) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'kein Mock' }) });
      if (a.__http) return route.fulfill({ status: a.__http, contentType: 'application/json', body: JSON.stringify({ ok: false, error: a.__err || 'Fehler' }) });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: a }) });
    }
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); },
    { gema_orgs_v1: [ORG], gema_users_v1: TEAM, gema_session_v1: { token: 'x.y.z', userId, expires: FUTURE } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/if_fahrzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  return { ctx, page };
}
// Datei-Objekte im Browser bauen (statt echtem Upload) — der Datei-Input
// wird uebersprungen, der Rest der Kette laeuft ECHT.
const belegeSetzen = (page, defs) => page.evaluate(defs => {
  return window._fzBelegHooks.setDateien(defs.map((d, i) => ({
    id: 'bg_test_' + i, file: new File([new Uint8Array(d.bytes || 64)], d.name, { type: d.typ || 'image/jpeg' }),
    name: d.name, size: d.size || (d.bytes || 64), typ: d.typ || 'image/jpeg',
    status: (d.size || 0) > 3300000 ? 'zugross' : 'wartet', fehler: '', res: null
  })));
}, defs);

// ══ B) Preise: Monteur sieht nichts ══════════════════════════════════
console.log('\n— B) Preisangaben sind fuer den Monteur unsichtbar —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mon');
  const r = await page.evaluate(() => {
    const btn = document.getElementById('btnFzBeleg');
    openViewFzg('v_a');
    const body = (document.getElementById('vm_body') || {}).innerHTML || '';
    return {
      knopf: btn ? getComputedStyle(btn).display : 'fehlt',
      darfPreise: window._fzCanSeePreise(),
      // Der Monteur hat den Alt-Eintrag SELBST erfasst — auch dort keine Preise.
      eigenerEintrag: window._fzCanSeeEintragPreis({ erledigtVonUserId: 'u_mon', kosten: '450.00' }),
      kaufpreisImBody: /38.?000/.test(body),
      kostenImBody: /450\.00/.test(body),
      csvKopf: window._fzCsvHooks.kopf.join('|'),
      csvZeile: window._fzCsvHooks.tabellen(window._fzPermHooks.vehicles())
        .map(t => ({ label: t.label, text: t.text, kopfzeile: String(t.text || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0] }))
    };
  });
  ok(r.knopf === 'none', 'Monteur: «Belege einlesen» ist nicht sichtbar');
  ok(r.darfPreise === false, '_fzCanSeePreise() ist fuer den Monteur false');
  ok(r.eigenerEintrag === false, 'Monteur sieht auch bei EIGENEN Eintraegen keine Kosten');
  ok(!r.kaufpreisImBody, 'Kaufpreis erscheint nicht im Detail');
  ok(!r.kostenImBody, 'Service-Kosten erscheinen nicht in der Historie');
  const bestand = r.csvZeile.find(t => /Bestand/.test(t.label));
  ok(bestand && !/Kaufpreis/.test(bestand.kopfzeile) && !/Betrag/.test(bestand.kopfzeile),
    'CSV: Preisspalten sind ENTFERNT (nicht nur geleert)');
  const svc = r.csvZeile.find(t => /Service/.test(t.label));
  ok(svc && !/Kosten/.test(svc.kopfzeile), 'CSV Service-Tabelle: Kosten-Spalte entfernt');
  ok(bestand && !/38000|38'000/.test(bestand.text), 'CSV: kein Kaufpreis-Wert in den Zeilen');
  ok(svc && !/450\.00/.test(svc.text), 'CSV: kein Service-Betrag in den Zeilen');
  ok(page.errs.length === 0, 'Keine JS-Fehler (Monteur)');
  await ctx.close();
}
{ // Hard-Lock: Monteur-Rolle schlaegt die Magaziner-Rolle
  seedStore();
  const { ctx, page } = await openPage('u_mixed');
  const r = await page.evaluate(() => {
    const btn = document.getElementById('btnFzBeleg');
    openViewFzg('v_a');
    const body = (document.getElementById('vm_body') || {}).innerHTML || '';
    return {
      knopf: btn ? getComputedStyle(btn).display : 'fehlt',
      darfPreise: window._fzCanSeePreise(),
      darfEdit: window._fzPermHooks.canEdit(),
      kaufpreisImBody: /38.?000/.test(body),
      kostenImBody: /450\.00/.test(body)
    };
  });
  ok(r.darfPreise === false, 'Magaziner MIT Monteur-Rolle: keine Preise (Hard-Lock schlaegt die zweite Rolle)');
  ok(r.darfEdit === false, 'Derselbe Hard-Lock gilt fuer _fzCanEdit (bestehender Kanon)');
  ok(r.knopf === 'none', 'Auch der Beleg-Knopf bleibt zu');
  ok(!r.kaufpreisImBody && !r.kostenImBody, 'Weder Kaufpreis noch Service-Kosten im Detail');
  ok(page.errs.length === 0, 'Keine JS-Fehler (Mischrolle)');
  await ctx.close();
}
{ // Gegenprobe
  seedStore();
  const { ctx, page } = await openPage('u_mag');
  const r = await page.evaluate(() => {
    const btn = document.getElementById('btnFzBeleg');
    openViewFzg('v_a');
    const body = (document.getElementById('vm_body') || {}).innerHTML || '';
    const tabs = window._fzCsvHooks.tabellen(window._fzPermHooks.vehicles());
    return {
      knopf: btn ? getComputedStyle(btn).display : 'fehlt',
      darfPreise: window._fzCanSeePreise(),
      kaufpreisImBody: /38.?000/.test(body),
      kostenImBody: /450\.00/.test(body),
      bestandKopf: String(((tabs.find(t => /Bestand/.test(t.label)) || {}).text) || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0],
      svcKopf: String(((tabs.find(t => /Service/.test(t.label)) || {}).text) || '').replace(/^\uFEFF/, '').split(/\r?\n/)[0]
    };
  });
  ok(r.knopf !== 'none', 'Gegenprobe Magaziner: Knopf IST sichtbar');
  ok(r.darfPreise === true, 'Gegenprobe: _fzCanSeePreise() true');
  ok(r.kaufpreisImBody, 'Gegenprobe: Kaufpreis wird angezeigt');
  ok(r.kostenImBody, 'Gegenprobe: Service-Kosten werden angezeigt');
  ok(/Kaufpreis/.test(r.bestandKopf), 'Gegenprobe CSV: Kaufpreis-Spalte vorhanden');
  ok(/Kosten/.test(r.svcKopf) && /Rechnungs-Nr\./.test(r.svcKopf),
    'Gegenprobe CSV: Kosten + Rechnungs-Nr. vorhanden');
  ok(/Herkunft/.test(r.svcKopf), 'Gegenprobe CSV: Herkunft-Spalte (Beleg-Import) vorhanden');
  await ctx.close();
}

// ══ C) Zuordnungs-Engine ═════════════════════════════════════════════
console.log('\n— C) Fahrzeug-Zuordnung + Modell-Gegenpruefung —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mag');
  const r = await page.evaluate(() => {
    const list = window._fzPermHooks.vehicles();
    return {
      // Kennzeichen normalisiert (Leerzeichen/Kleinschrift egal)
      exakt: window._fzBelegMatch({ kennzeichen: 'bs30030', fahrzeugModell: 'VW Crafter' }, list),
      // Modell passt nicht → Zuordnung bleibt, aber WARNUNG
      modellWeg: window._fzBelegMatch({ kennzeichen: 'BS 30030', fahrzeugModell: 'Fiat Ducato' }, list),
      // Teil-Modell ist KEIN Widerspruch
      modellTeil: window._fzBelegMatch({ kennzeichen: 'BS 30030', fahrzeugModell: 'VW Crafter 35 Kastenwagen' }, list),
      // Unbekanntes Kennzeichen → NICHT geraten
      unbekannt: window._fzBelegMatch({ kennzeichen: 'ZH 999999', fahrzeugModell: 'VW Crafter' }, list),
      // Gar kein Kennzeichen → NICHT geraten, auch wenn das Modell passt
      ohneKz: window._fzBelegMatch({ fahrzeugModell: 'VW Crafter' }, list),
      // Nummer als Rueckfallebene
      ueberNr: window._fzBelegMatch({ fahrzeugNr: '20' }, list),
      dubJa: window._fzBelegDublette('v_a', '', '2026-01-10', '450.00'),
      dubNein: window._fzBelegDublette('v_a', '', '2026-05-05', '450.00'),
      modell1: window._fzBelegModellPasst('VW Caddy Maxi', 'VW Caddy'),
      modell2: window._fzBelegModellPasst('Fiat Ducato', 'VW Crafter'),
      modell3: window._fzBelegModellPasst('', 'VW Crafter')
    };
  });
  ok(r.exakt.vid === 'v_a' && r.exakt.sicher === true, 'Kennzeichen «bs30030» trifft BS 30030 (normalisiert)');
  ok(r.modellWeg.vid === 'v_a' && /Modell weicht ab/.test(r.modellWeg.warn) && r.modellWeg.sicher === false,
    'Modell-Abweichung: Zuordnung bleibt, aber gewarnt (Kennzeichen ist eindeutiger)');
  ok(r.modellTeil.sicher === true, 'Teil-Modell «VW Crafter 35 Kastenwagen» ist kein Widerspruch');
  ok(r.unbekannt.vid === '' && /nicht vorhanden/.test(r.unbekannt.warn),
    'Unbekanntes Kennzeichen wird NICHT auf ein Fahrzeug geraten');
  ok(r.ohneKz.vid === '' && /Kein Kennzeichen/.test(r.ohneKz.warn),
    'Ohne Kennzeichen keine Zuordnung — auch nicht ueber das Modell allein');
  ok(r.ueberNr.vid === 'v_c' && /Fahrzeug-Nr/.test(r.ueberNr.warn), 'Fahrzeug-Nr. als Rueckfallebene, mit Hinweis');
  ok(r.dubJa === true && r.dubNein === false, 'Dubletten-Erkennung (Datum + Betrag)');
  ok(r.modell1 === true && r.modell2 === false && r.modell3 === true,
    '_fzBelegModellPasst: tolerant bei Teiltreffern, streng bei fremder Marke, tolerant bei fehlender Angabe');
  ok(page.errs.length === 0, 'Keine JS-Fehler (Engine)');
  await ctx.close();
}

// ══ D) Batch: kein Abbruch bei Einzel-Fehlern ════════════════════════
console.log('\n— D) Batch-Verarbeitung bricht bei Einzel-Fehlern NICHT ab —');
{
  seedStore();
  BELEG_CALLS = [];
  // 12 Belege: #3 antwortet 500, #7 antwortet 413 — die restlichen 10 muessen
  // durchkommen. Genau das war die Anforderung «nicht abbricht».
  BELEG_ANTWORTEN = [];
  for (let i = 0; i < 12; i++) {
    if (i === 3) BELEG_ANTWORTEN.push({ __http: 500, __err: 'Anthropic-Fehler' });
    else if (i === 7) BELEG_ANTWORTEN.push({ __http: 413, __err: 'Datei zu gross' });
    else BELEG_ANTWORTEN.push({
      kennzeichen: i % 2 ? 'BS 10010' : 'BS 30030',
      fahrzeugModell: i % 2 ? 'Ford Transit' : 'VW Crafter',
      datum: '2026-0' + (1 + (i % 8)) + '-12', art: 'reparatur',
      beschreibung: 'Bremsen vorne ersetzt #' + i, kosten: 100 + i, werkstatt: 'Garage Muster',
      km: 91000 + i, rechnungsNr: 'R-' + (1000 + i), sicherheit: 'hoch', positionen: []
    });
  }
  const { ctx, page } = await openPage('u_mag');
  const defs = [];
  for (let i = 0; i < 12; i++) defs.push({ name: 'rechnung_' + i + '.jpg', typ: 'image/jpeg', size: 50000 });
  defs.push({ name: 'riesig.pdf', typ: 'application/pdf', size: 9000000 });   // zu gross
  await page.evaluate(() => { window._fzBelegOpen(); });
  await belegeSetzen(page, defs);
  await page.evaluate(() => { window._fzBelegStart(); });
  await page.waitForFunction(() => window._fzBelegHooks.phase() === 'pruefen' || (window._fzBelegHooks.lauf() && window._fzBelegHooks.lauf().ende), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  // Mit Fehlern springt der Lauf BEWUSST nicht automatisch weiter — der Nutzer
  // sieht erst die Fehlerliste und klickt dann «→ Pruefen». Guard tut dasselbe.
  const laufStand = await page.evaluate(() => ({
    phase: window._fzBelegHooks.phase(),
    ende: !!(window._fzBelegHooks.lauf() || {}).ende,
    fehler: window._fzBelegHooks.dateien().filter(d => d.status === 'fehler').length,
    html: document.getElementById('_fzBelegOverlay') ? document.getElementById('_fzBelegOverlay').innerHTML : ''
  }));
  ok(laufStand.phase === 'lauf' && laufStand.ende && laufStand.fehler === 2,
    'Mit Fehlern bleibt der Lauf stehen statt still weiterzuspringen');
  ok(/nochmals versuchen/i.test(laufStand.html), 'Fehlgeschlagene Belege lassen sich erneut versuchen');
  await page.evaluate(() => window._fzBelegZuPruefen());
  await page.waitForTimeout(200);

  const r = await page.evaluate(() => {
    const d = window._fzBelegHooks.dateien();
    return {
      phase: window._fzBelegHooks.phase(),
      fertig: d.filter(x => x.status === 'fertig').length,
      fehler: d.filter(x => x.status === 'fehler').length,
      zugross: d.filter(x => x.status === 'zugross').length,
      calls: 0,
      rows: window._fzBelegHooks.rows().length,
      html: document.getElementById('_fzBelegOverlay') ? document.getElementById('_fzBelegOverlay').innerHTML : ''
    };
  });
  ok(r.phase === 'pruefen', 'Nach «Pruefen» steht die Tabelle bereit');
  ok(r.fertig === 10, '10 von 12 Belegen kamen durch, obwohl 2 fehlschlugen (' + r.fertig + ')');
  ok(r.fehler === 2, 'Die 2 Fehler haengen an IHREN Dateien, nicht am Lauf');
  ok(r.zugross === 1, 'Die zu grosse Datei wurde gar nicht erst geschickt');
  ok(BELEG_CALLS.length === 12, 'Genau 12 Function-Calls (die zu grosse Datei nicht, ' + BELEG_CALLS.length + ')');
  ok(BELEG_CALLS.every(c => Array.isArray(c.fahrzeuge) && c.fahrzeuge.length === 3),
    'Jeder Call bekommt die Flotte zur Gegenpruefung mit');
  ok(BELEG_CALLS.every(c => c.fahrzeuge.every(f => Object.keys(f).sort().join(',') === 'kennzeichen,modell,nr')),
    'Flotten-Payload enthaelt ausschliesslich nr/kennzeichen/modell');
  ok(r.rows === 10, 'Pruef-Tabelle zeigt die 10 gelesenen Belege');
  ok(/nicht ausgewertet/.test(r.html) && /riesig\.pdf|rechnung_3|rechnung_7/.test(r.html),
    'Nicht ausgewertete Belege werden BENANNT (No-silent-caps)');

  // Pruef-Tabelle ist editierbar und die Zuordnung stimmt
  const t = await page.evaluate(() => {
    const rows = window._fzBelegHooks.rows();
    return {
      selects: document.querySelectorAll('#_fzBelegOverlay select').length,
      inputs: document.querySelectorAll('#_fzBelegOverlay input[type="text"],#_fzBelegOverlay input[type="date"],#_fzBelegOverlay textarea').length,
      zuA: rows.filter(x => x.vid === 'v_a').length,
      zuB: rows.filter(x => x.vid === 'v_b').length,
      alleImp: rows.every(x => x.imp),
      kosten0: rows[0].kosten, rg0: rows[0].rgNr
    };
  });
  ok(t.selects >= 20, 'Jede Zeile hat Fahrzeug- und Art-Auswahl (' + t.selects + ' Selects)');
  ok(t.inputs >= 30, 'Datum/km/Kosten/Werkstatt/Beschreibung sind editierbar (' + t.inputs + ' Felder)');
  ok(t.zuA === 6 && t.zuB === 4, 'Kennzeichen korrekt auf die zwei Fahrzeuge verteilt (' + t.zuA + '/' + t.zuB + ')');
  ok(t.alleImp === true, 'Sichere Zeilen sind vorausgewaehlt');
  ok(String(t.kosten0) === '100' && t.rg0 === 'R-1000', 'Betrag und Rechnungs-Nr. sind uebernommen');

  // Von Hand korrigieren: Zeile 0 auf ein anderes Fahrzeug + Betrag aendern
  const korr = await page.evaluate(() => {
    window._fzBelegRowSet(window._fzBelegHooks.rows()[0].id, 'vid', 'v_c');
    window._fzBelegRowSet(window._fzBelegHooks.rows()[0].id, 'kosten', '999.50');
    window._fzBelegRowSet(window._fzBelegHooks.rows()[0].id, 'beschreibung', 'Von Hand korrigiert');
    const r0 = window._fzBelegHooks.rows()[0];
    return { vid: r0.vid, kosten: r0.kosten, besch: r0.beschreibung, warn: r0.warn, hinweis: r0.hinweis };
  });
  ok(korr.vid === 'v_c' && korr.kosten === '999.50' && korr.besch === 'Von Hand korrigiert',
    'Korrekturen in der Pruef-Tabelle greifen');
  ok(korr.warn === true && /Modell weicht ab/.test(korr.hinweis),
    'Nach der Korrektur wird das Modell NEU gegengeprueft (VW Crafter ≠ Opel Vivaro)');

  // Import
  const vor = await page.evaluate(() => window._fzPermHooks.vehicles().reduce((n, v) => n + ((v.serviceHistorie || []).length), 0));
  await page.evaluate(() => window._fzBelegImport());
  await page.waitForTimeout(600);
  const nach = await page.evaluate(() => {
    const vs = window._fzPermHooks.vehicles();
    const a = vs.find(v => v.id === 'v_a'), c = vs.find(v => v.id === 'v_c');
    const neu = (c.serviceHistorie || []).filter(e => e.quelle === 'beleg')[0] || {};
    return {
      total: vs.reduce((n, v) => n + ((v.serviceHistorie || []).length), 0),
      cHat: (c.serviceHistorie || []).length,
      quelle: neu.quelle, kosten: neu.kosten, besch: neu.beschreibung, rg: neu.rechnungsNr,
      aKm: a.km, aLast: a.lastService,
      offen: !!document.getElementById('_fzBelegOverlay')
    };
  });
  ok(nach.total === vor + 10, '10 Eintraege importiert (' + vor + ' → ' + nach.total + ')');
  ok(nach.cHat === 1 && nach.quelle === 'beleg' && nach.kosten === '999.50' && nach.besch === 'Von Hand korrigiert',
    'Die korrigierte Zeile landete beim korrigierten Fahrzeug');
  ok(nach.rg === 'R-1000', 'Rechnungs-Nr. wandert in die Historie (Dubletten-Schutz beim naechsten Lauf)');
  ok(String(nach.aKm) === '91010', 'km-Stand wird nur nach oben nachgefuehrt (' + nach.aKm + ')');
  ok(!nach.offen, 'Dialog schliesst nach dem Import');
  ok(page.errs.length === 0, 'Keine JS-Fehler (Batch) ' + page.errs.join(' | '));

  // Zweiter Lauf mit denselben Belegen → Dubletten sind NICHT vorausgewaehlt
  BELEG_ANTWORTEN = [{
    kennzeichen: 'BS 10010', fahrzeugModell: 'Ford Transit', datum: '2026-02-12', art: 'reparatur',
    beschreibung: 'Bremsen vorne ersetzt #1', kosten: 101, werkstatt: 'Garage Muster', km: 91001,
    rechnungsNr: 'R-1001', sicherheit: 'hoch', positionen: []
  }];
  await page.evaluate(() => window._fzBelegOpen());
  await belegeSetzen(page, [{ name: 'nochmals.jpg', typ: 'image/jpeg', size: 50000 }]);
  await page.evaluate(() => window._fzBelegStart());
  await page.waitForFunction(() => window._fzBelegHooks.phase() === 'pruefen', null, { timeout: 12000 });
  const dub = await page.evaluate(() => {
    const r0 = window._fzBelegHooks.rows()[0];
    return { imp: r0.imp, dub: r0.dublette, hin: r0.hinweis };
  });
  ok(dub.dub === true && dub.imp === false, 'Zweiter Lauf: Dublette erkannt und NICHT vorausgewaehlt');
  ok(/bereits erfasst/.test(dub.hin), 'Die Dublette wird im Klartext begruendet');
  await ctx.close();
}

// ══ E) Kaufpreis ══════════════════════════════════════════════════════
console.log('\n— E) Kaufpreis im Fahrzeugmanagement —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mag');
  const r = await page.evaluate(() => {
    openModal('v_b');
    const sec = document.getElementById('fSecKaufpreis');
    document.getElementById('fKaufpreis').value = '42500';
    document.getElementById('fKaufdatum').value = '2024-06-15';
    saveVehicle();
    const v = window._fzPermHooks.vehicles().find(x => x.id === 'v_b');
    return { sichtbar: sec ? getComputedStyle(sec).display : 'fehlt', kp: v.kaufpreis, kd: v.kaufdatum };
  });
  ok(r.sichtbar !== 'none', 'Kaufpreis-Sektion ist fuer Berechtigte sichtbar');
  ok(r.kp === '42500' && r.kd === '2024-06-15', 'Kaufpreis + Kaufdatum werden gespeichert');

  await page.waitForTimeout(400);
  const ana = await page.evaluate(() => {
    openViewFzg('v_a');
    const body = (document.getElementById('vm_body') || {}).innerHTML || '';
    return {
      hatKauf: /Kaufpreis/.test(body),
      hatGesamt: /Gesamtkosten/.test(body),
      kaufNum: window._fzKaufpreisNum({ kaufpreis: "1'234.50" }),
      fallback: window._fzKaufpreisNum({ kaufbeleg: { betrag: '9000' } })
    };
  });
  ok(ana.hatKauf && ana.hatGesamt, 'Kosten-Analyse weist Kaufpreis und Gesamtkosten aus');
  ok(ana.kaufNum === 1234.5, 'Schweizer Zahlenformat wird gelesen (1\'234.50)');
  ok(ana.fallback === 9000, 'Altdaten: Kaufbeleg-Betrag dient als Kaufpreis-Fallback');

  // Fahrzeug ohne Service-Historie, aber mit Kaufpreis → Analyse erscheint
  const nurKauf = await page.evaluate(() => {
    closeViewModal(); openViewFzg('v_b');
    const body = (document.getElementById('vm_body') || {}).innerHTML || '';
    return { kauf: /42.?500/.test(body), keinSchnitt: !/Ø pro Service/.test(body) };
  });
  ok(nurKauf.kauf, 'Ohne Service-Eintraege erscheint die Analyse allein wegen des Kaufpreises');
  ok(nurKauf.keinSchnitt, 'Ohne Service-Eintraege wird KEIN Durchschnitt behauptet');
  ok(page.errs.length === 0, 'Keine JS-Fehler (Kaufpreis) ' + page.errs.join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
