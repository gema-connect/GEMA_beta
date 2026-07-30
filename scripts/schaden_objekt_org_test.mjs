// Schadensbericht: Objekt-Wechsel + Org-Sichtbarkeit (Leak-Fix 30.07.2026).
//
// Deckt ab:
//  A) Org-Sichtbarkeit der Schadensliste (defensiver Client-Filter — die
//     org-gescopten RLS-v2-Policies sind ein manueller Rollout): sichtbar sind
//     Berichte der eigenen Org, orgId-lose Berichte des eigenen Users und
//     orgId-lose Berichte, deren Ersteller in der eigenen Org auflösbar ist
//     (Regel wie GemaObjekte.effektiveOrgId). Fremde Org / fremder Ersteller /
//     unauflösbarer Ersteller → unsichtbar. KPI-Zähler folgen. Deep-Link
//     (?id=) auf einen fremden Bericht → «Kein Zugriff»-Dialog, Detail bleibt zu.
//  B) KRITISCH — Persist-Sicherheit: sdSave() difft das VOLLE schaeden-Array;
//     der Sichtbarkeits-Filter greift NUR beim Rendern. Nach einem Save müssen
//     fremde Records unverändert im Cache liegen (sonst würden sie als
//     Löschung interpretiert und aus der Cloud entfernt — if_werkzeug-Falle).
//  C) Objekt-Wechsel eines bestehenden Schadens (Feedback 30.07.2026):
//     Select in der Erfassung-Karte (nur _sdCanEdit), Confirm-Dialog, Daten
//     wandern mit; leere Auswahl = Pflicht-Alert; ⚠-Option für ein nicht mehr
//     aktives Objekt (Muster pm_objekte — kein stilles Leeren); Abbrechen
//     stellt die Auswahl zurück.
//  D) Admin sieht alles (inkl. fremder Berichte, Detail öffnet ohne Guard).
//  E) Monteur (kein _sdCanEdit): Objekt read-only als Text, kein Select.
//
// Aufruf:  CHROME=<chromium> node scripts/schaden_objekt_org_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8899;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

function mkSchaden(id, titel, extra) {
  return Object.assign({
    id, typ: 'wasserschaden', titel, objektId: 'obj1', phase: 'erfasst',
    beschreibung: '', ursache: '', raeume: ['Bad'],
    versicherung: { name: '', policeNr: '', schadenNr: '', kontakt: '' },
    erstelltAm: '2026-07-01', erstelltVon: { userId: 'u_p', name: 'Planerin' }, orgId: 'org_t',
    zustandsanalyse: { leckortung: '', schadenausmass: '', massnahmen: [], fotos: [], abgeschlossenAm: null },
    trocknung: { gestartetAm: null, beendetAm: null, messpunkte: [], geraete: [], fotos: [], notizen: '' },
    abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
  }, extra || {});
}

// 7 Berichte: 3 sichtbar für org_t-Planerin, 3 unsichtbar, 1 eigener auf Alt-Objekt
const CLOUD_SCHAEDEN = [
  mkSchaden('sd_own', 'Eigener Bericht'),
  mkSchaden('sd_fremd', 'Fremder Bericht', { orgId: 'org_x', erstelltVon: { userId: 'u_f', name: 'Fremd' } }),
  mkSchaden('sd_legacy_own', 'Legacy Eigen', { orgId: undefined, erstelltVon: { userId: 'u_p', name: 'Planerin' } }),
  mkSchaden('sd_legacy_kollege', 'Legacy Kollege', { orgId: undefined, erstelltVon: { userId: 'u_k', name: 'Kollege' } }),
  mkSchaden('sd_legacy_fremd', 'Legacy Fremd', { orgId: undefined, erstelltVon: { userId: 'u_f', name: 'Fremd' } }),
  mkSchaden('sd_legacy_waise', 'Legacy Waise', { orgId: undefined, erstelltVon: { userId: 'u_geloescht', name: 'Weg' } }),
  mkSchaden('sd_alt', 'Alt-Objekt Bericht', { objektId: 'obj_alt' })
];
// orgId:undefined entfernen (JSON-Roundtrip würde es ohnehin strippen — explizit)
CLOUD_SCHAEDEN.forEach(s => { if (s.orgId === undefined) delete s.orgId; });

const OBJEKTE = [
  { id: 'obj1', name: 'MFH Musterweg 3', strasse: 'Musterweg 3', plz: '8000', ort: 'Zürich', status: 'aktiv', orgId: 'org_t' },
  { id: 'obj2', name: 'EFH Beispielweg 7', strasse: 'Beispielweg 7', plz: '6003', ort: 'Luzern', status: 'aktiv', orgId: 'org_t' },
  { id: 'obj_alt', name: 'Altes Projekt', strasse: 'Altweg 1', plz: '6000', ort: 'Luzern', status: 'abgeschlossen', orgId: 'org_t' }
];

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig';
const ORGS = [
  { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_p'], active: true },
  { id: 'org_x', name: 'X GmbH', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true }
];
const USERS = [
  { id: 'u_p', username: 'p@t.ch', name: 'Planerin', roleIds: ['role_planer'], orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } },
  { id: 'u_k', username: 'k@t.ch', name: 'Kollege', roleIds: ['role_planer'], orgId: 'org_t', active: true, profile: { email: 'k@t.ch' } },
  { id: 'u_f', username: 'f@x.ch', name: 'Fremd', roleIds: ['role_planer'], orgId: 'org_x', active: true, profile: { email: 'f@x.ch' } },
  { id: 'u_adm', username: 'a@g.ch', name: 'Admin', roleIds: ['role_admin'], orgId: 'org_default', active: true, profile: { email: 'a@g.ch' } },
  { id: 'u_m', username: 'm@t.ch', name: 'Monteur', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'm@t.ch' } }
];

function seedFor(userId) {
  return {
    gema_orgs_v1: ORGS,
    gema_users_v1: USERS,
    gema_session_v1: { token: TOKEN, userId, expires: FUTURE },
    gema_objekte_v1: { objekte: OBJEKTE, beteiligte: [], activeObjektId: '' },
    gema_objpool_v1: OBJEKTE
  };
}

const browser = await chromium.launch({ executablePath: CHROME });

async function newSdPage(userId) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
    if (isSb) {
      if (route.request().method() === 'GET' && u.indexOf('module_key=eq.schadensbericht') >= 0) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(
          CLOUD_SCHAEDEN.map(s => ({ data_key: 'schaden:' + s.id, payload: { data: s, _lm: '2026-07-10T08:00:00Z' } }))
        ) });
      }
      if (route.request().method() === 'GET' && u.indexOf('module_key=eq.objekte') >= 0) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(
          OBJEKTE.map(o => ({ data_key: 'objekt:' + o.id, payload: { data: o, _lm: '2026-07-10T08:00:00Z' } }))
        ) });
      }
      return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    }
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seedFor(userId));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.schaeden || []).length >= 7, null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, errs };
}

try {
  // ───────────────────────── Kontext 1: Planerin (org_t) ─────────────────────────
  console.log('— A) Org-Sichtbarkeit (Planerin, org_t) —');
  const { ctx: ctx1, page, errs } = await newSdPage('u_p');

  const poolN = await page.evaluate(() => (window.schaeden || []).length);
  ok(poolN === 7, 'voller Pool im Speicher (7 Records, inkl. fremde) — ' + poolN);

  const sicht = await page.evaluate(() => {
    const r = {};
    (window.schaeden || []).forEach(s => { r[s.id] = window._sdSichtbar(s); });
    return r;
  });
  ok(sicht.sd_own === true, '_sdSichtbar: eigener Org-Bericht sichtbar');
  ok(sicht.sd_alt === true, '_sdSichtbar: eigener Bericht auf Alt-Objekt sichtbar');
  ok(sicht.sd_fremd === false, '_sdSichtbar: fremder Org-Bericht UNSICHTBAR (der gemeldete Leak)');
  ok(sicht.sd_legacy_own === true, '_sdSichtbar: orgId-los + eigener Ersteller sichtbar');
  ok(sicht.sd_legacy_kollege === true, '_sdSichtbar: orgId-los + Kollege derselben Org sichtbar (Ersteller-Org-Ableitung)');
  ok(sicht.sd_legacy_fremd === false, '_sdSichtbar: orgId-los + fremder Ersteller unsichtbar');
  ok(sicht.sd_legacy_waise === false, '_sdSichtbar: orgId-los + unauflösbarer Ersteller unsichtbar');

  const kpi = await page.evaluate(() => document.getElementById('s_total').textContent);
  ok(kpi === '4', 'KPI «Total» zählt nur sichtbare (4) — ' + kpi);

  const grid = await page.evaluate(() => document.getElementById('cardGrid').textContent);
  ok(grid.indexOf('Eigener Bericht') >= 0 && grid.indexOf('Legacy Eigen') >= 0 && grid.indexOf('Legacy Kollege') >= 0 && grid.indexOf('Alt-Objekt Bericht') >= 0,
    'Liste zeigt die 4 sichtbaren Berichte');
  ok(grid.indexOf('Fremder Bericht') < 0 && grid.indexOf('Legacy Fremd') < 0 && grid.indexOf('Legacy Waise') < 0,
    'Liste zeigt KEINE fremden/waisen Berichte');

  // Deep-Link-Guard
  await page.evaluate(() => window.sdOpenDetail('sd_fremd'));
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  const guardTxt = await page.$eval('.gema-dlg-bg', el => el.textContent);
  ok(guardTxt.indexOf('Kein Zugriff') >= 0, 'Deep-Link auf fremden Bericht → «Kein Zugriff»-Dialog');
  const overlayZu = await page.evaluate(() => document.getElementById('detailOverlay').classList.contains('hidden') && window.detailId == null);
  ok(overlayZu, 'Detail bleibt geschlossen (detailId null)');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(200);

  console.log('— B) Persist-Sicherheit: Save löscht fremde Records NICHT —');
  await page.evaluate(() => { window.sdGetById('sd_own').beschreibung = 'geändert'; window.sdSave(); });
  await page.waitForTimeout(600);
  const cacheIds = await page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('gema_schadensbericht_v1')) || []).map(s => s.id); } catch (e) { return []; }
  });
  ok(cacheIds.indexOf('sd_fremd') >= 0 && cacheIds.indexOf('sd_legacy_waise') >= 0,
    'Cache enthält nach sdSave() weiterhin fremde + waise Records (kein Cloud-Delete-Risiko)');
  ok(cacheIds.length === 7, 'Cache-Bestand vollständig (7) — ' + cacheIds.length);

  console.log('— C) Objekt-Wechsel (Erfassung-Karte) —');
  await page.evaluate(() => window.sdOpenDetail('sd_own'));
  await page.waitForTimeout(300);
  const sel1 = await page.evaluate(() => {
    const el = document.getElementById('erf_objekt_sd_own');
    if (!el) return null;
    return { tag: el.tagName, value: el.value, opts: Array.from(el.options).map(o => o.value) };
  });
  ok(!!sel1 && sel1.tag === 'SELECT', 'Erfassung-Karte rendert Objekt-Select für Bearbeitende');
  ok(sel1 && sel1.value === 'obj1', 'aktuelles Objekt vorausgewählt (obj1)');
  ok(sel1 && sel1.opts.indexOf('obj2') >= 0, 'aktive Objekte wählbar (obj2 in der Liste)');
  ok(sel1 && sel1.opts.indexOf('obj_alt') < 0, 'abgeschlossenes Objekt NICHT in der normalen Auswahl');

  await page.evaluate(() => window.sdObjektWechsel('sd_own', 'obj2'));
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  const wTxt = await page.$eval('.gema-dlg-bg', el => el.textContent);
  ok(wTxt.indexOf('Objekt wechseln') >= 0 && wTxt.indexOf('EFH Beispielweg 7') >= 0, 'Confirm-Dialog nennt das Ziel-Objekt');
  ok(wTxt.indexOf('bleiben erhalten') >= 0, 'Dialog erklärt: Phasen/Fotos/Messwerte wandern mit');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(400);
  const nachher = await page.evaluate(() => {
    const s = window.sdGetById('sd_own');
    return { objektId: s.objektId, raeume: s.raeume.join(','), beschr: s.beschreibung, selVal: (document.getElementById('erf_objekt_sd_own') || {}).value };
  });
  ok(nachher.objektId === 'obj2', 'objektId gewechselt → obj2');
  ok(nachher.selVal === 'obj2', 'Select zeigt das neue Objekt');
  ok(nachher.raeume === 'Bad' && nachher.beschr === 'geändert', 'alle Daten bleiben erhalten (Räume, Beschreibung)');
  const gridNach = await page.evaluate(() => { window.sdCloseDetail(); return document.getElementById('cardGrid').textContent; });
  ok(gridNach.indexOf('EFH Beispielweg 7') >= 0, 'Karten-Liste zeigt das neue Objekt');

  // Leere Auswahl → Pflicht-Alert, Wert bleibt
  await page.evaluate(() => { window.sdOpenDetail('sd_own'); });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.sdObjektWechsel('sd_own', ''));
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  const leerTxt = await page.$eval('.gema-dlg-bg', el => el.textContent);
  ok(leerTxt.indexOf('Objekt erforderlich') >= 0, 'leere Auswahl → Pflicht-Alert');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.sdGetById('sd_own').objektId) === 'obj2', 'objektId unverändert nach Pflicht-Alert');

  // gleicher Wert → No-Op (kein Dialog)
  await page.evaluate(() => window.sdObjektWechsel('sd_own', 'obj2'));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.querySelector('.gema-dlg-bg')), 'gleicher Wert → kein Dialog (No-Op)');

  // ⚠-Option für nicht mehr aktives Objekt + Abbrechen-Pfad
  await page.evaluate(() => { window.sdCloseDetail(); window.sdOpenDetail('sd_alt'); });
  await page.waitForTimeout(300);
  const selAlt = await page.evaluate(() => {
    const el = document.getElementById('erf_objekt_sd_alt');
    if (!el) return null;
    return { value: el.value, first: el.options[0] ? { v: el.options[0].value, t: el.options[0].textContent } : null };
  });
  ok(selAlt && selAlt.value === 'obj_alt', 'Alt-Objekt bleibt ausgewählt (kein stilles Leeren)');
  ok(selAlt && selAlt.first && selAlt.first.v === 'obj_alt' && selAlt.first.t.indexOf('⚠') >= 0, '⚠-Option für das abgeschlossene Objekt');
  await page.evaluate(() => window.sdObjektWechsel('sd_alt', 'obj2'));
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await page.click('.gema-dlg-bg [data-act="cancel"]');
  await page.waitForTimeout(300);
  const altNach = await page.evaluate(() => ({
    objektId: window.sdGetById('sd_alt').objektId,
    selVal: (document.getElementById('erf_objekt_sd_alt') || {}).value
  }));
  ok(altNach.objektId === 'obj_alt' && altNach.selVal === 'obj_alt', 'Abbrechen: objektId + Select-Auswahl zurückgestellt');

  ok(errs.length === 0, 'keine pageerrors (Planerin) ' + (errs.length ? '— ' + errs.join(' | ').slice(0, 140) : ''));
  await ctx1.close();

  // ───────────────────────── Kontext 2: GEMA-Admin ─────────────────────────
  console.log('— D) Admin sieht alles —');
  const { ctx: ctx2, page: pAdm, errs: errsAdm } = await newSdPage('u_adm');
  const admN = await pAdm.evaluate(() => window.sdVisible().length);
  ok(admN === 7, 'Admin: alle 7 Berichte sichtbar — ' + admN);
  await pAdm.evaluate(() => window.sdOpenDetail('sd_fremd'));
  await pAdm.waitForTimeout(300);
  const admOffen = await pAdm.evaluate(() => !document.getElementById('detailOverlay').classList.contains('hidden'));
  ok(admOffen, 'Admin öffnet fremden Bericht ohne Guard');
  ok(errsAdm.length === 0, 'keine pageerrors (Admin)');
  await ctx2.close();

  // ───────────────────────── Kontext 3: Monteur (org_t) ─────────────────────────
  console.log('— E) Monteur + Read-only-Zweig —');
  // Monteur trägt in der Matrix write auf schadensbericht (er erfasst Messungen)
  // → _sdCanEdit() ist für ihn true (Matrix-Fallback), der Objekt-Select
  // erscheint also AUCH beim Monteur — wer den Bericht bearbeiten darf, darf
  // eine falsche Zuordnung korrigieren. Der Read-only-Zweig (canEdit=false)
  // wird direkt am Renderer geprüft.
  const { ctx: ctx3, page: pMon, errs: errsMon } = await newSdPage('u_m');
  await pMon.evaluate(() => window.sdOpenDetail('sd_own'));
  await pMon.waitForTimeout(300);
  const mon = await pMon.evaluate(() => ({
    sel: !!document.getElementById('erf_objekt_sd_own'),
    ro: (function () {
      const h = window.sdRenderErfassung(window.sdGetById('sd_own'), false);
      return { hatSelect: h.indexOf('erf_objekt_') >= 0, hatName: h.indexOf('MFH Musterweg 3') >= 0 };
    })()
  }));
  ok(mon.sel === true, 'Monteur (Matrix-write) sieht den Objekt-Select — bestehende _sdCanEdit-Semantik');
  ok(mon.ro.hatSelect === false, 'Read-only-Zweig (canEdit=false): KEIN Select gerendert');
  ok(mon.ro.hatName === true, 'Read-only-Zweig: Objekt als Text');
  ok(errsMon.length === 0, 'keine pageerrors (Monteur)');
  await ctx3.close();
} catch (e) {
  fail++; console.error('  ✗ EXCEPTION:', e.message);
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + (pass + fail) + ' fehlgeschlagen') : ('✓ Alle ' + pass + ' Checks grün')));
process.exit(fail ? 1 : 0);
