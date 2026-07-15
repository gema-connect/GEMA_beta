// Rollen×Modul-Matrix-Test für GEMA.
// Prüft pro Rolle, welche Module lesbar/schreibbar sind, ob «Kein Zugriff»
// korrekt greift und ob die Hard-Locks (Monteur, Studenten-Gating) halten.
// Fängt stillen «Rollen-Drift» ab: jedes neue Modul erscheint automatisch in
// der Matrix; Abweichungen zum Golden (scripts/rolematrix_golden.json) failen.
//
//   Layer A  — Struktur-Invarianten (Permission-Keys/FILE_MAP-Integrität)
//   Layer A2 — can()-Matrix pro Rolle × alle Module + Invarianten + Golden-Diff
//   Layer B  — Gating-Navigation: «Kein Zugriff» wo nötig, Modul lädt wo erlaubt
//   Layer C  — Hard-Locks: Monteur (Werkzeug/Fahrzeug), Studenten-Gating
//
// AUSFÜHREN (benötigt playwright-core + Chromium):
//   NODE_PATH=<pfad-zu-node_modules> CHROME=<chromium-binary> \
//     node scripts/rolematrix_test.mjs
//   Golden aktualisieren (nach bewusster Rechteänderung): Golden-Datei löschen
//   und Test einmal laufen lassen — er legt sie neu an.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, 'rolematrix_golden.json');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  ✗ FAIL: ' + name); } };
const okv = (cond, name) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; fails.push(name); console.log('  ✗ FAIL: ' + name); } };

// Kanonisch sortierte Matrix (stabiles Golden-Diff). NICHT den Array-Replacer
// von JSON.stringify nutzen — der wirkt als Property-Allowlist und würde die
// verschachtelten Modul-Keys wegfiltern (leeres Golden).
function canon(obj) {
  const out = {};
  Object.keys(obj).sort().forEach(r => {
    out[r] = {};
    Object.keys(obj[r]).sort().forEach(k => { out[r][k] = obj[r][k]; });
  });
  return out;
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ── Bootstrap: Modell aus der App selbst holen (drift-sicher) ──
async function loadModel() {
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await page.goto(BASE + '/__rmtest.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.GemaAuth && GemaAuth.getModules && GemaAuth.getRoles && GemaAuth.getRoles(), null, { timeout: 8000 });
  const model = await page.evaluate(() => ({
    modules: GemaAuth.getModules().map(m => ({ key: m.key, cat: m.cat })),
    fileMap: GemaAuth.getFileMap(),
    roles: GemaAuth.getRoles().map(r => ({ id: r.id, permissions: r.permissions }))
  }));
  await ctx.close();
  return model;
}

const model = await loadModel();
const MODKEYS = model.modules.map(m => m.key);
const MODSET = new Set(MODKEYS);
const ROLES = model.roles.map(r => r.id);
// Rollen-Objekte für den gema_roles_v1-Seed (voller Satz, User trägt je 1 roleId)
const ROLE_SEED = model.roles.map(r => ({ id: r.id, name: r.id, permissions: r.permissions }));
console.log(`\nModell: ${MODKEYS.length} Module, ${ROLES.length} Rollen, ${Object.keys(model.fileMap).length} FILE_MAP-Einträge`);

// ══════════════ LAYER A — Struktur-Invarianten ══════════════
console.log('\n■ Layer A — Struktur-Invarianten');
{
  let orphan = [];
  model.roles.forEach(r => Object.keys(r.permissions || {}).forEach(k => { if (!MODSET.has(k)) orphan.push(r.id + ':' + k); }));
  okv(orphan.length === 0, 'Keine verwaisten Permission-Keys in Rollen' + (orphan.length ? ' — ' + orphan.join(', ') : ''));

  const badMap = Object.entries(model.fileMap).filter(([, v]) => !MODSET.has(v)).map(([k, v]) => k + '→' + v);
  okv(badMap.length === 0, 'Alle FILE_MAP-Ziele sind echte Module' + (badMap.length ? ' — ' + badMap.join(', ') : ''));

  let wOnly = [], aOnly = [];
  model.roles.forEach(r => Object.entries(r.permissions || {}).forEach(([k, p]) => {
    if (p.write && !p.read) wOnly.push(r.id + ':' + k);
    if (p.admin && !p.read) aOnly.push(r.id + ':' + k);
  }));
  okv(wOnly.length === 0, 'Kein write-ohne-read in Rollen-Defaults' + (wOnly.length ? ' — ' + wOnly.join(', ') : ''));
  okv(aOnly.length === 0, 'Kein admin-ohne-read in Rollen-Defaults' + (aOnly.length ? ' — ' + aOnly.join(', ') : ''));

  const mapped = new Set(Object.values(model.fileMap));
  const noPage = MODKEYS.filter(k => !mapped.has(k));
  console.log('  ℹ Module ohne FILE_MAP-Seite (Info): ' + (noPage.join(', ') || '—'));
}

// ══════════════ LAYER A2 — can()-Matrix pro Rolle ══════════════
console.log('\n■ Layer A2 — can()-Matrix (alle Rollen × alle Module)');
const matrix = {}; // roleId -> { modKey: 'r'|'rw'|'rwa'|'-' }
for (const roleId of ROLES) {
  const { ctx, page } = await newPage(browser, seed([roleId], { roles: ROLE_SEED }));
  await page.goto(BASE + '/__rmtest.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.GemaAuth && GemaAuth.can, null, { timeout: 8000 });
  const row = await page.evaluate((keys) => {
    const o = {};
    keys.forEach(k => {
      const r = GemaAuth.can('read', k), w = GemaAuth.can('write', k), a = GemaAuth.can('admin', k);
      o[k] = (a ? 'rwa' : w ? 'rw' : r ? 'r' : '-');
    });
    return o;
  }, MODKEYS);
  matrix[roleId] = row;
  await ctx.close();

  const readable = MODKEYS.filter(k => row[k] !== '-');
  ok(readable.length >= 1, `${roleId}: mindestens ein lesbares Modul`);
  // write/admin ohne read kann can() per Konstruktion nicht liefern — Sicherheitsnetz
  ok(MODKEYS.every(k => !((row[k] === 'rw' || row[k] === 'rwa') && !readable.includes(k))), `${roleId}: kein write/admin ohne read (Laufzeit)`);
}
okv(MODKEYS.every(k => matrix['role_admin'][k] === 'rwa'), 'role_admin: read+write+admin auf ALLEN Modulen');
{
  const st = matrix['role_student'];
  const stAllowed = MODKEYS.filter(k => st[k] !== '-').sort();
  okv(stAllowed.join(',') === ['klassen', 'pruefungen', 'quiz'].sort().join(','),
    'role_student: ohne Klassen-Cache nur klassen/pruefungen/quiz — ist [' + stAllowed.join(',') + ']');
}
['role_lieferant_intern', 'role_produktlieferant_intern'].forEach(r => {
  okv(matrix[r]['produktkatalog'] === 'r', r + ': produktkatalog nur lesen (r)');
});
okv(matrix['role_monteur']['werkzeugmanagement'] === 'r', 'role_monteur: werkzeugmanagement nur lesen (Default)');
okv(matrix['role_behoerde']['w12'] === 'r' && matrix['role_behoerde']['druckerhoehung'] === '-', 'role_behoerde: w12 lesen, Berechnungen gesperrt');

// Golden-Diff (Drift-Erkennung)
{
  const cur = JSON.stringify(canon(matrix), null, 2);
  if (!existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, cur + '\n');
    console.log('  ℹ Golden neu angelegt: scripts/rolematrix_golden.json (künftige Läufe diffen dagegen)');
    pass++;
  } else {
    const old = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const oldCanon = JSON.stringify(canon(old), null, 2);
    if (oldCanon === cur) { okv(true, 'Matrix stimmt mit Golden überein (kein Drift)'); }
    else {
      const n = JSON.parse(cur), diffs = [];
      new Set([...Object.keys(old), ...Object.keys(n)]).forEach(r => {
        const oa = old[r] || {}, na = n[r] || {};
        new Set([...Object.keys(oa), ...Object.keys(na)]).forEach(k => {
          if ((oa[k] || '·') !== (na[k] || '·')) diffs.push(`${r}.${k}: ${oa[k] || '∅'}→${na[k] || '∅'}`);
        });
      });
      okv(false, 'Matrix-DRIFT ggü. Golden (' + diffs.length + '): ' + diffs.slice(0, 25).join(' | ') + (diffs.length > 25 ? ' …' : ''));
      console.log('    → Wenn gewollt: scripts/rolematrix_golden.json löschen und Test neu laufen lassen.');
    }
  }
}

// ══════════════ LAYER B — Gating-Navigation ══════════════
console.log('\n■ Layer B — Gating (echte Navigation)');
const NAV = [
  ['role_monteur',    'sd_schadensbericht.html', 'load', 'Monteur → Schadensbericht (r/w)'],
  ['role_monteur',    'pm_erp.html',             'deny', 'Monteur → ERP gesperrt'],
  ['role_planer',     'sb_druckerhoehung.html',  'load', 'Planer → Druckerhöhung'],
  ['role_planer',     'if_werkzeug.html',        'load', 'Planer → Werkzeug (read-only)'],
  ['role_behoerde',   'hy_w12.html',             'load', 'Behörde → W12'],
  ['role_behoerde',   'sb_druckerhoehung.html',  'deny', 'Behörde → Berechnung gesperrt'],
  ['role_garagist',   'if_fahrzeug.html',        'load', 'Garagist → Fahrzeug'],
  ['role_garagist',   'if_werkzeug.html',        'deny', 'Garagist → Werkzeug gesperrt'],
  ['role_lagerist',   'if_wareneingang.html',    'load', 'Lagerist → Wareneingang'],
  ['role_lagerist',   'pm_erp.html',             'deny', 'Lagerist → ERP gesperrt'],
  ['role_unternehmer','pm_bestellungen.html',    'load', 'Unternehmer → Bestellungen'],
  ['role_unternehmer','pm_erp.html',             'load', 'Unternehmer → ERP offen (Offerten erstellen, ab Werk)'],
  ['role_unternehmer','pm_planablage.html',      'load', 'Unternehmer → Planablage (r/w)'],
  ['role_monteur',    'pm_planablage.html',      'load', 'Monteur → Planablage (read, Pendenzen abarbeiten)'],
  ['role_garagist',   'pm_planablage.html',      'deny', 'Garagist → Planablage gesperrt'],
];
async function gatingOf(file, roleIds, opts) {
  const { ctx, page } = await newPage(browser, seed(roleIds, opts));
  await page.goto(BASE + '/' + file, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(700);
  const gated = await page.evaluate(() => /Kein Zugriff/.test(document.body.innerText || '')).catch(() => false);
  await ctx.close();
  return gated ? 'deny' : 'load';
}
for (const [role, file, expect, label] of NAV) {
  const got = await gatingOf(file, [role]);
  okv(got === expect, `${label} — erwartet ${expect}, ist ${got}`);
}

// ══════════════ LAYER C — Hard-Locks + Studenten-Gating ══════════════
console.log('\n■ Layer C — Hard-Locks & Studenten-Gating');
// Custom-Rolle: Monteur MIT write+admin auf werkzeug-/fahrzeugmanagement.
// Zusätzlich ist der Test-User Org-Admin (Default-Seed admins:['u_test']) —
// der Hard-Lock muss BEIDE Wege (Modul-Grant UND Org-Admin-Kurzschluss) sperren.
function mutatedRoles() {
  return ROLE_SEED.map(r => {
    if (r.id !== 'role_monteur') return r;
    const p = JSON.parse(JSON.stringify(r.permissions));
    p['werkzeugmanagement'] = { read: true, write: true, admin: true };
    p['fahrzeugmanagement'] = { read: true, write: true, admin: true };
    return { id: r.id, name: r.id, permissions: p };
  });
}
// C1: if_werkzeug — trotz gewährtem write/admin bleibt der Erfassen-Button versteckt
{
  const { ctx, page } = await newPage(browser, seed(['role_monteur'], { roles: mutatedRoles() }));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1200);
  const addVisible = await page.evaluate(() => {
    const b = document.getElementById('btnAddTool');
    return !!(b && b.offsetParent !== null && b.style.display !== 'none');
  }).catch(() => true);
  okv(addVisible === false, 'Monteur-Hard-Lock Werkzeug: «+ Gerät» versteckt trotz write/admin-Grant');
  await ctx.close();
}
// C2: if_fahrzeug — _fzPermHooks.canEdit() bleibt false
{
  const { ctx, page } = await newPage(browser, seed(['role_monteur'], { roles: mutatedRoles() }));
  await page.goto(BASE + '/if_fahrzeug.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForFunction(() => window._fzPermHooks && typeof _fzPermHooks.canEdit === 'function', null, { timeout: 8000 }).catch(() => {});
  const canEdit = await page.evaluate(() => { try { return _fzPermHooks.canEdit(); } catch (e) { return 'ERR'; } });
  okv(canEdit === false, 'Monteur-Hard-Lock Fahrzeug: _fzPermHooks.canEdit()===false trotz write/admin-Grant (ist ' + canEdit + ')');
  await ctx.close();
}
// C3: Studenten-Gating — ohne Cache gesperrt, mit Klassen-Cache frei
{
  okv(await gatingOf('sb_druckerhoehung.html', ['role_student']) === 'deny', 'Student ohne Klassen-Cache → Druckerhöhung gesperrt');
  okv(await gatingOf('sb_druckerhoehung.html', ['role_student'], { studentMods: ['druckerhoehung'] }) === 'load', 'Student MIT Klassen-Cache → Druckerhöhung frei');
  const { ctx, page } = await newPage(browser, seed(['role_student']));
  await page.goto(BASE + '/sb_druckerhoehung.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(700);
  const txt = await page.evaluate(() => document.body.innerText || '').catch(() => '');
  okv(/Klasse/.test(txt), 'Student-Sperre zeigt Klassen-Hinweis (nicht generisches «keine Berechtigung»)');
  await ctx.close();
}

await browser.close();
server.close();

// ── Kurzprofil je Rolle ──
console.log('\n── Zugriffsprofil (Anzahl Module) — volle Matrix in rolematrix_golden.json ──');
ROLES.forEach(r => {
  const row = matrix[r]; let rd = 0, wr = 0, ad = 0;
  MODKEYS.forEach(k => { if (row[k] !== '-') rd++; if (row[k] === 'rw' || row[k] === 'rwa') wr++; if (row[k] === 'rwa') ad++; });
  console.log(`  ${r.padEnd(30)} read:${String(rd).padStart(2)}  write:${String(wr).padStart(2)}  admin:${String(ad).padStart(2)}`);
});

console.log(`\n═══ Ergebnis: ${pass} OK, ${fail} FAIL ═══`);
if (fails.length) console.log('FAILs:\n  - ' + fails.join('\n  - '));
process.exit(fail ? 1 : 0);
