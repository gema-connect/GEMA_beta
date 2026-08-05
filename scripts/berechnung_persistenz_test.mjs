// Speichern pro Projekt/Eimer — Berechnungen bleiben erhalten (05.08.2026)
//
// Bugreport (Studenten-Uebungseimer): «Irgendwie bleiben die Eingaben nicht.»
//
// Drei Ursachen, alle hier abgesichert:
//
//  A) `?objekt=<id>` (Workspace-Kachel) wurde erst NACH dem Cloud-Pull
//     angewendet. Module bilden ihren Speicher-Schluessel aber beim
//     Script-Parse — der ERSTE Besuch rechnete darum auf dem BASIS-Key,
//     der zweite auf dem Objekt-Key. Die Eingaben der ersten Sitzung
//     lagen danach unerreichbar daneben.
//
//  B) sb_lu_tabelle speicherte ueberhaupt nicht automatisch: `saveLocal`
//     hing an einem «Speichern»-Knopf, den es im Markup nicht mehr gibt,
//     `init()` las nie einen gespeicherten Stand, und der Objektwechsel
//     lief in ein «loadLocal is not defined».
//
//  C) `_GemaDB` (Blob-Module) und `GemaAutoSave` sicherten beim Verlassen
//     der Seite nichts: der Cloud-Push ist entprellt (700 ms bzw. 5 s) und
//     `beforeunload` feuert auf iOS/PWA oft gar nicht.
//
// Aufruf: CHROME=<chromium> node scripts/berechnung_persistenz_test.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, BASE, ROOT } from './rolematrix_harness.mjs';

let pass = 0, fail = 0;
const ok = (c, n, info) => {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); }
};

// ═══ A) Statisch ═══════════════════════════════════════════════════════
console.log('■ A: Die drei Ursachen sind im Code geschlossen');
{
  const api = readFileSync(join(ROOT, 'gema_objekte_api.js'), 'utf8');
  const urlBlock = api.slice(api.indexOf("params.get('objekt')"), api.indexOf("Phase-Selector Auto-Inject"));
  ok(/setActiveId\(urlObj\);\s*\n\s*_readyPromise/.test(urlBlock),
    '?objekt= wird SOFORT gesetzt, nicht erst nach dem Cloud-Pull');
  ok(/_readyPromise\.then[\s\S]{0,400}setActiveId\(_vorher/.test(urlBlock),
    'unbekanntes Objekt wird nach dem Pull zurueckgenommen');
  ok(/function getActiveId\(\)[\s\S]{0,320}_readActiveLocal\(\)/.test(api),
    'getActiveId faellt auf den Geraete-Schluessel zurueck');
  ok(/function _healActive[\s\S]{0,320}if \(!\(cache\.objekte \|\| \[\]\)\.length\) return;/.test(api),
    'die Auswahl wird nicht geleert, solange noch keine Objekte geladen sind');

  const db = readFileSync(join(ROOT, 'gema_db.js'), 'utf8');
  ok(/function _leaveFlush/.test(db), '_GemaDB sichert beim Verlassen der Seite');
  ok(/_leaveFlush[\s\S]{0,600}_obSetOne\(_module, k, v\)/.test(db),
    '... zuerst dauerhaft in die Outbox');
  ok(/keepalive: true/.test(db), '... und mit keepalive sofort hoch');
  ['beforeunload', 'pagehide', 'visibilitychange'].forEach(ev =>
    ok(db.indexOf("'" + ev + "'") >= 0, '_GemaDB hoert auf ' + ev));

  const as = readFileSync(join(ROOT, 'gema_autosave.js'), 'utf8');
  ok(/w\.addEventListener\('pagehide', _flush\)/.test(as), 'GemaAutoSave flusht auf pagehide');
  ok(/visibilityState === 'hidden'\) _flush\(\)/.test(as), 'GemaAutoSave flusht beim Wegschalten');
  ok(/function _syncObjFromDropdown/.test(as) && /if \(_objId\) return;/.test(as),
    'AutoSave zieht ein spaeter befuelltes Objekt-Dropdown nach (nur den leeren Fall)');

  const lu = readFileSync(join(ROOT, 'sb_lu_tabelle.html'), 'utf8');
  ok(lu.indexOf('const STORAGE_KEY = _sk;') < 0, 'LU-Tabelle hat keinen eingefrorenen Schluessel mehr');
  ok(/function _luKey\(\)/.test(lu), 'LU-Tabelle bildet den Schluessel frisch');
  ok(/function _luAutoSave/.test(lu) && /calcAndRender\(\)\{[\s\S]{0,200}_luAutoSave\(\)/.test(lu),
    'LU-Tabelle speichert automatisch (Chokepoint calcAndRender)');
  ok(/loadLocal\(\{still:true\}\)/.test(lu), 'LU-Tabelle laedt den Stand beim Start');
  ok(/window\._objReload = function/.test(lu), 'Objektwechsel laeuft ueber window._objReload (Cross-Block)');
  ok(!/saveMeta\(\);loadLocal\(\)/.test(lu), 'kein «loadLocal is not defined» im Objektwechsel mehr');
  ok(/let _luPrevKey/.test(lu) && /_GemaDB\.save\(_luPrevKey \|\| _luKey\(\)/.test(lu),
    'gespeichert wird in den Datensatz, der auf dem Bildschirm steht');
  ok(/setActiveId\(sel\.value\|\|''\)/.test(lu), 'das Dropdown stellt das aktive Objekt um');

  const ent = readFileSync(join(ROOT, 'sa_enthaertung.html'), 'utf8');
  ok(!/getElementById\('name'\)\.value\.trim\(\)/.test(ent),
    'sa_enthaertung: setDocumentTitle greift nicht mehr hart auf ein fehlendes Feld zu');
}

// ═══ B–D) Browser ══════════════════════════════════════════════════════
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.log('\n(playwright-core fehlt — Browser-Teil uebersprungen)'); finish(); }

const FUT = new Date(Date.now() + 30 * 86400000).toISOString();
function jwt() {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' +
    b64({ iat: now, exp: now + 30 * 86400, uid: 'u_stud', org: 'org_schule', role: 'authenticated' }) + '.sig';
}
// Auto-Objekt des Uebungs-Eimers (wie _wsUebungsEimer es anlegt) + zweites Projekt
const O1 = { id: 'obj_ws_ws_ue_kl1_u_stud', name: 'Schulweg 1, 4000 Basel', strasse: 'Schulweg 1', plz: '4000', ort: 'Basel', bauvorhaben: 'Übung', status: 'aktiv', orgId: 'org_schule', erstelltVon: 'u_stud', createdAt: FUT };
const O2 = { id: 'obj_zweit', name: 'Zweites Projekt', strasse: 'Testweg 9', plz: '3000', ort: 'Bern', bauvorhaben: 'Neubau', status: 'aktiv', orgId: 'org_schule', erstelltVon: 'u_stud', createdAt: FUT };
const SEED = {
  gema_orgs_v1: [{ id: 'org_schule', name: 'HF Schule', kategorie: 'schule', kategorien: ['schule'], admins: [], active: true }],
  gema_users_v1: [{ id: 'u_stud', username: 's@s.ch', name: 'Lea Muster', roleIds: ['role_student'], orgId: 'org_schule', active: true }],
  gema_session_v1: { userId: 'u_stud', expires: FUT, token: jwt() },
  gema_student_mods_v1: { userId: 'u_stud', mods: ['lu_tabelle', 'enthaertungsanlage'], exams: {}, ts: Date.now() },
  gema_objekte_v1: { objekte: [O1, O2], beteiligte: [], activeObjektId: null },
  gema_objpool_v1: [O1, O2]
};

// In-Memory-Cloud: haelt gema_data-Records ueber Navigationen hinweg —
// nur so laesst sich «bleibt die Eingabe?» ueberhaupt messen.
function cloudRoutes(ctx, cloud) {
  return ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('supabase') >= 0 || u.indexOf('/sb/') >= 0) {
      const m = route.request().method();
      if (m === 'POST') {
        try {
          const b = JSON.parse(route.request().postData() || '{}');
          (Array.isArray(b) ? b : [b]).forEach(r => { if (r && r.data_key) cloud[r.module_key + '|' + r.data_key] = r.payload; });
        } catch { }
        return route.fulfill({ contentType: 'application/json', body: '{}' });
      }
      if (m === 'GET') {
        if (u.indexOf('objekt%3A') >= 0 || u.indexOf('objekt:') >= 0)
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify([O1, O2].map(o => ({ data_key: 'objekt:' + o.id, payload: { data: o } }))) });
        const mk = decodeURIComponent((u.match(/module_key=eq\.([^&]+)/) || [])[1] || '');
        const dk = decodeURIComponent((u.match(/data_key=eq\.([^&]+)/) || [])[1] || '');
        if (mk && dk) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(cloud[mk + '|' + dk] ? [{ data_key: dk, payload: cloud[mk + '|' + dk] }] : []) });
        const inList = (u.match(/data_key=in\.\(([^)]*)\)/) || [])[1];
        if (mk && inList) {
          const keys = decodeURIComponent(inList).split(',').map(s => s.replace(/^"|"$/g, ''));
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(keys.filter(k => cloud[mk + '|' + k]).map(k => ({ data_key: k, payload: cloud[mk + '|' + k] }))) });
        }
        if (mk) return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(Object.keys(cloud).filter(k => k.indexOf(mk + '|') === 0)
            .map(k => ({ module_key: mk, data_key: k.slice(mk.length + 1), payload: cloud[k] })))
        });
        return route.fulfill({ contentType: 'application/json', body: '[]' });
      }
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  });
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
const cloud = {};
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await cloudRoutes(ctx, cloud);
const page = await ctx.newPage();
const fehler = [];
page.on('pageerror', e => fehler.push(e.message));
// EINMALIG seeden (kein addInitScript — das setzte bei jeder Navigation zurueck)
await page.goto(BASE + '/manifest.json');
await page.evaluate(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, SEED);

const LU = o => BASE + '/sb_lu_tabelle.html?objekt=' + o;
const QTY = '#deviceList input[type="number"]';
async function setQty(v) {
  const el = await page.$(QTY);
  await el.click({ clickCount: 3 }); await el.type(v); await el.dispatchEvent('change');
  await page.waitForTimeout(1200);
}
const getQty = async () => { const el = await page.$(QTY); return el ? el.inputValue() : null; };

// ── B) Der Schluessel haengt ab dem ERSTEN Besuch am Objekt ────────────
console.log('\n■ B: Speicher-Schluessel traegt das Objekt der Kachel');
{
  await page.goto(LU(O1.id), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const st = await page.evaluate(() => ({
    sk: window._sk,
    aktiv: (window.GemaObjekte && GemaObjekte.getActiveId()) || null,
    dd: (document.getElementById('metaObjektDropdown') || {}).value
  }));
  ok(st.sk && st.sk.indexOf('__' + O1.id) > 0, 'Schluessel enthaelt das Objekt (1. Besuch)', st.sk);
  ok(st.aktiv === O1.id, 'aktives Objekt gesetzt', st.aktiv);
  ok(st.dd === O1.id, 'Dropdown zeigt das Objekt', st.dd);
}

// ── C) LU-Tabelle: Eingabe bleibt, Projekte bleiben getrennt ──────────
console.log('\n■ C: LU-Tabelle speichert automatisch und trennt die Projekte');
{
  await setQty('7');
  // zwei Entprellungen: 700 ms LU-AutoSave + 700 ms _GemaDB-Push
  await page.waitForTimeout(1200);
  ok(Object.keys(cloud).some(k => k.indexOf('lu_tabelle|lu_spitzenvolumenstrom') === 0 && k.indexOf(O1.id) > 0),
    'Eingabe landet automatisch in der Cloud (ohne Speichern-Knopf)', Object.keys(cloud));

  await page.goto(LU(O2.id), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2200);
  ok(await getQty() === '0', 'zweites Projekt startet leer (keine Vermischung)');
  await setQty('3');

  await page.goto(LU(O1.id), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2200);
  ok(await getQty() === '7', 'Projekt 1 nach Reload wieder 7');
  await page.goto(LU(O2.id), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2200);
  ok(await getQty() === '3', 'Projekt 2 nach Reload wieder 3');

  // Objektwechsel im Dropdown, ohne Reload
  await page.selectOption('#metaObjektDropdown', O1.id);
  await page.waitForTimeout(1600);
  ok(await getQty() === '7', 'Dropdown-Wechsel laedt Projekt 1');
  await page.selectOption('#metaObjektDropdown', O2.id);
  await page.waitForTimeout(1600);
  ok(await getQty() === '3', 'Dropdown-Wechsel laedt Projekt 2 zurueck');

  ok(!fehler.some(m => /loadLocal is not defined/.test(m)), 'kein «loadLocal is not defined»', fehler.slice(0, 3));

  // Die LU-Daten sind auch fuer die abhaengigen Module da
  await page.goto(LU(O1.id), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2200);
  const n = await page.evaluate(o => { try { return (GemaLU.getVerbraucher(o) || []).length; } catch (e) { return -1; } }, O1.id);
  ok(n > 0, 'GemaLU liefert die gespeicherten Verbraucher (Datenfluss intakt)', n);
}

// ── D) AutoSave-Modul: schnelles Verlassen (Handy-Muster) ─────────────
console.log('\n■ D: AutoSave-Modul verliert nichts beim schnellen Verlassen');
{
  const ENT = BASE + '/sa_enthaertung.html?objekt=' + O1.id;
  await page.goto(ENT, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.fill('#hr_fh', '28');
  await page.waitForTimeout(600);        // deutlich unter der 5-s-Entprellung
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
  await page.waitForTimeout(500);
  await page.goto(ENT, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  ok(await page.inputValue('#hr_fh') === '28', 'Wert ueberlebt das Verlassen ohne beforeunload');
  ok(!fehler.some(m => /reading 'trim'/.test(m)), 'kein Konsolen-Fehler beim Wiederherstellen', fehler.slice(0, 3));
}

await browser.close();
server.close();
finish();

function finish() {
  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks bestanden');
  process.exit(fail === 0 ? 0 : 1);
}
