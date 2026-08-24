// Drift-Guard: Feedback 23.08.2026 (Robin Jäggi)
//
// Zwei Punkte aus dem Export:
//
//  1. WORKSPACE — «ich habe nichts mit diesen klassen zu tun, das muss
//     entfernt werden und ich darf diese nicht sehen. man darf nur jeweilige
//     sehen (auch objekte) welche man selber angelegt hat, oder mit denen man
//     einen bezug hat, ansonsten strikt getrennt.»
//     Ursache war eine FAIL-OPEN-Stelle: `_bucketScopeOk` endete mit
//     `return true`. Ein automatischer Klassen-Eimer OHNE nachweisbaren Bezug
//     (Klasse nicht im Cache auflösbar UND weder nurUserIds noch nurRollen —
//     Altbestand bzw. Provisionierung in die falsche Org) war damit für die
//     GANZE Org sichtbar. Dazu galt der `createdBy===uid`-Zweig in
//     `_canSeeBucket` auch für Auto-Eimer, wo «Ersteller» bloss heisst, wer
//     den Workspace zufällig zuerst geöffnet hat.
//     «(auch objekte)»: `_wsEnsureObjekt` stempelte das Auto-Objekt mit der
//     Org des ÖFFNENDEN statt mit der des Eimers — das blosse Öffnen eines
//     durchgerutschten Eimers hinterliess ein Projekt in der fremden Org.
//
//  2. FAHRZEUG — «sortierung soll auch richtig sein, wenn nicht 01
//     geschrieben wird.» Ein zeichenweiser Vergleich stellt «10» vor «2».
//
//  3. FAHRZEUG — «die belege werden eingelesen aber ich finde sie nicht wenn
//     ich auf das auto klicke.» Der Import schrieb korrekt nach
//     v.serviceHistorie; gerendert wird die aber NUR in openViewFzg — und der
//     Klick aufs Fahrzeug öffnete für Editoren das ERFASSUNGS-Formular
//     (`_fzCanEdit()?'openModal':'openViewFzg'`). Die Belege lagen damit
//     unerreichbar hinter einer Ansicht, in die man nicht mehr kam. Auf dem
//     Handy zeigte das Detail-Sheet die Historie gar nicht erst.
//
// Dazu die Garage-Doppelung (User-Meldung im selben Zug): «irgenwie gibt es
// Garage im erfassen des farhzeuges 2 mal … den stellplatz soll optional
// aktiviert werden können … beim stellplat ist die garage jedoch frei und
// muss keine gema garage sein».
//
// Regeln, die dieser Test festhält:
//   R1 Auto-Eimer sind FAIL-CLOSED — ohne Bezug nicht sichtbar.
//   R2 Ein legitimes Mitglied sieht seinen Klassen-Eimer weiterhin
//      (Gegenprobe — sonst wäre der Fix eine Regression).
//   R3 Das Auto-Objekt gehört der Org des EIMERS; ein bereits falsch
//      gestempeltes wird korrigiert (nie gelöscht — an einem Objekt können
//      Daten hängen).
//   R4 Sortierung ist natürlich (Intl.Collator numeric) in BEIDEN Modulen.
//   R5 Garage (Service) und Stellplatz sind zwei getrennte Sektionen; der
//      Stellplatz-Ort ist Freitext und braucht keine GEMA-Garage.
//   R6 Der Klick auf ein Fahrzeug führt IMMER in die Detailansicht (dort
//      stehen Service-Historie, Belege und Kosten); Bearbeiten ist ein
//      eigener Knopf. Gilt für Karte, Tabellenzeile, Liste — und das native
//      Detail-Sheet führt zu denselben Einträgen.
//
// Aufruf: CHROME=<chromium> node scripts/feedback_20260823_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, wireRoutes } from './rolematrix_harness.mjs';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
};

/* ═══ A — statisch: Workspace-Sichtbarkeit ═══════════════════════════════ */
console.log('■ A: sys_workspace.html — strikte Trennung');
const WS = readFileSync('sys_workspace.html', 'utf8');
ok('A1 _bucketScopeOk ist für Auto-Eimer fail-closed',
  /if\(b\.autoTyp\)return false;\s*\n\s*return true;\s*\n\s*\}/.test(WS));
ok('A2 createdBy zählt NUR bei von Hand angelegten Eimern',
  /if\(b\.createdBy===uid&&!b\.autoTyp\)return true;\s*\n\s*return false;/.test(WS));
ok('A3 die Klasse bleibt die Wahrheit (Live-Mitgliedschaft vor nurUserIds)',
  /if\(b\.autoTyp==='klasse'\)\{\s*\n\s*var mit=_wsKlasseMitglied\(b\);\s*\n\s*if\(mit!==null\)return mit;/.test(WS));
ok('A4 Empty-Read-Regel bleibt: Klasse nicht im Cache → null, nicht false',
  /function _wsKlasseVon\(b\)\{[\s\S]{0,600}if\(!Array\.isArray\(arr\)\|\|!arr\.length\)return null;/.test(WS));
ok('A5 die Fixe-Eimer-Liste filtert ebenfalls über _canSeeBucket',
  /function _wsFixeEimer\(\)\{[\s\S]{0,600}&&_canSeeBucket\(b\)/.test(WS));
ok('A6 kein Auto-Objekt für einen Eimer, den der Nutzer nicht sehen darf',
  /function _wsEnsureObjekt\(b\)\{[\s\S]{0,900}if\(!_canSeeBucket\(b\)\)return null;/.test(WS));
ok('A7 das Auto-Objekt trägt die Org des EIMERS, nicht die des Öffnenden',
  /var objOrg=\(b\.ownerType==='org'&&b\.ownerOrgId\)\?b\.ownerOrgId:/.test(WS));
ok('A8 Selbstheilung korrigiert (löscht NICHT) ein falsch gestempeltes Objekt',
  /function _wsObjektOrgHeilen\(\)\{[\s\S]{0,1400}o\.orgId=b\.ownerOrgId;/.test(WS)
  && !/function _wsObjektOrgHeilen\(\)\{[\s\S]{0,1400}data\.objekte=data\.objekte\.filter/.test(WS));
ok('A9 die Heilung läuft im Auto-Provisioning',
  /_wsKlassenProvision\(\);\s*\n\s*try\{ _wsObjektOrgHeilen\(\); \}catch/.test(WS));

/* ═══ B — statisch: Fahrzeug Garage/Stellplatz + Sortierung ══════════════ */
console.log('\n■ B: if_fahrzeug.html — Garage/Stellplatz + natürliche Sortierung');
const FZ = readFileSync('if_fahrzeug.html', 'utf8');
ok('B1 genau EINE Garage-Sektion im Formular',
  (FZ.match(/data-opt="garage"/g) || []).length === 1,
  (FZ.match(/data-opt="garage"/g) || []).length);
ok('B2 die frühere zweite Sektion (garagist) ist weg',
  !/data-opt="garagist"/.test(FZ) && !/\{id:'garagist'/.test(FZ));
ok('B3 der Werkstatt-Zugang sitzt IN der Garage-Sektion',
  /data-opt="garage"[\s\S]{0,3000}id="fWerkstattZugang"[\s\S]{0,1200}fGaragistUserId/.test(FZ));
ok('B4 Stellplatz ist eine eigene, optionale Sektion',
  /data-opt="stellplatz"/.test(FZ) && /\{id:'stellplatz'/.test(FZ));
ok('B5 der Stellplatz-Ort ist FREITEXT (kein GEMA-Garagen-Select)',
  /id="fStellplatzGarage"[^>]*list="fStellplatzGarageList"/.test(FZ)
  && !/id="fStellplatzGarage"[^>]*<\/select>/.test(FZ));
ok('B6 der Garagist sieht den Werkstatt-Zugang nie',
  /_fzApplyGaragistRestrictions[\s\S]{0,900}getElementById\('fWerkstattZugang'\)[\s\S]{0,120}display='none'/.test(FZ));
ok('B7 stellplatzGarage wird gespeichert', /stellplatzGarage:\s*\(document\.getElementById\("fStellplatzGarage"\)/.test(FZ));
ok('B8 Bestandsschutz: abgeschaltete Sektion mit erfassten Werten bleibt sichtbar',
  /function _fzApplyOpt\(v\)\{[\s\S]{0,900}defById\[key\]\.felder\.some/.test(FZ));
ok('B9 einmalige Migration der alten Optionen-Wahl',
  /gespeichert\.garagist===true&&gespeichert\.garage!==true/.test(FZ)
  && /gespeichert\.stellplatz===undefined&&gespeichert\.garage!==undefined/.test(FZ));
ok('B10 natürliche Sortierung über Intl.Collator numeric',
  /var _fzColl=[\s\S]{0,200}new Intl\.Collator\('de',\{numeric:true/.test(FZ)
  && /function _fzSortList\(list\)\{[\s\S]{0,700}_fzNatCmp\(va,vb\)/.test(FZ));

/* R6 — Klick fuehrt in die Detailansicht, nicht ins Formular. */
ok('B12 Karte, Tabellenzeile und Liste oeffnen die DETAILansicht',
  !/_fzCanEdit\(\)\?'openModal':'openViewFzg'/.test(FZ)
  && /class="v-card" onclick="openViewFzg\(/.test(FZ)
  && /<tr onclick="openViewFzg\(/.test(FZ)
  && FZ.indexOf('class="fz-lrow"') >= 0
  && /fz-lrow[\s\S]{0,90}onclick="openViewFzg/.test(FZ));
ok('B13 die Karte traegt einen eigenen Bearbeiten-Knopf (mit stopPropagation)',
  /event\.stopPropagation\(\);openModal\('\$\{v\.id\}'\)[\s\S]{0,80}Bearbeiten/.test(FZ));
ok('B14 das native Detail-Sheet fuehrt zu Service & Belege',
  /natAct\('hist','🧾 Service & Belege \('\+natHist\(v\)\.length\+'\)'\)/.test(FZ)
  && /if\(a==='hist'\) openFzgHistSheet\(id\);/.test(FZ)
  && /function openFzgHistSheet\(id\)\{/.test(FZ));
ok('B15 der native Verlauf weist die Beleg-Herkunft aus',
  /function natHistKarte\(e\)\{[\s\S]{0,1400}e\.quelle==='beleg'/.test(FZ)
  && /function natHistKarte\(e\)\{[\s\S]{0,1400}e\.rechnungsNr/.test(FZ));
ok('B16 Preise im nativen Verlauf laufen ueber dieselbe eine Wahrheit',
  /function natHistKarte\(e\)\{[\s\S]{0,1400}_fzCanSeeEintragPreis\(e\)/.test(FZ));

const WZ = readFileSync('if_werkzeug.html', 'utf8');
ok('B11 dieselbe Sortier-Regel im Werkzeugmanagement',
  /var _wzColl=[\s\S]{0,200}new Intl\.Collator\('de',\{numeric:true/.test(WZ)
  && /function _wzSortList\(list\)\{[\s\S]{0,700}_wzNatCmp\(va,vb\)/.test(WZ));

/* ═══ C — im Browser: Workspace ══════════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

/* Robins Lage: ein automatischer Klassen-Eimer ist in SEINER Org gelandet
   und trägt kein nurUserIds (Altbestand). Dazu ein Übungs-Eimer, der
   ausdrücklich einer anderen Person gehört, und ein legitimer eigener. */
const EIMER = [
  { id: 'ws_kl_k1', name: 'HF Gebäudetechnik 26', type: 'training', ownerType: 'org', ownerOrgId: 'org_test',
    createdBy: 'u_fremd', autoTyp: 'klasse', autoKlasseId: 'k1', pinned: true,
    accessControl: { orgVisible: false, invitedUsers: [], revokedUsers: [] },
    modules: [], notes: [], activity: [], beteiligte: [], members: [], objektId: 'obj_ws_ws_kl_k1', createdAt: '2026-08-01' },
  { id: 'ws_ue_k1_u_fremd', name: 'Übungsumgebung', type: 'training', ownerType: 'org', ownerOrgId: 'org_test',
    createdBy: 'u_fremd', autoTyp: 'uebung', autoKlasseId: 'k1', subOf: 'ws_kl_k1',
    accessControl: { orgVisible: false, invitedUsers: [], revokedUsers: [], nurUserIds: ['u_fremd'] },
    modules: [], notes: [], activity: [], beteiligte: [], members: [], objektId: null, createdAt: '2026-08-01' },
  { id: 'ws_eigen', name: 'Neubau Sonnenweg', type: 'project', ownerType: 'org', ownerOrgId: 'org_test',
    createdBy: 'u_test', accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] },
    modules: [], notes: [], activity: [], beteiligte: [], members: [], createdAt: '2026-08-02' }
];
/* Ein FALSCH gestempeltes Auto-Objekt: es gehört zum Klassen-Eimer, trägt
   aber die Org dessen, der ihn zuerst geöffnet hat. */
const OBJEKTE = { objekte: [
  { id: 'obj_ws_ws_kl_k1', name: 'HF Gebäudetechnik 26', orgId: 'org_test', erstelltVon: 'u_test', status: 'aktiv' }
], beteiligte: [], activeObjektId: null };

function konto(userId, klasseImCache) {
  const s = seed(['role_planer']);
  if (userId !== 'u_test') {
    s['gema_users_v1'] = (s['gema_users_v1'] || []).concat([{
      id: userId, name: 'Studentin', username: userId + '@gema.ch', active: true, orgId: 'org_test', roleIds: ['role_planer']
    }]);
    s['gema_session_v1'] = Object.assign({}, s['gema_session_v1'], { userId: userId });
  }
  s['gema_ws_pool_v1'] = JSON.stringify(EIMER);
  s['gema_objekte_v1'] = JSON.stringify(OBJEKTE);
  s['gema_coachmarks_done_sys_workspace_v2'] = '1';
  if (klasseImCache) s['gema_schule_klassen_pool_v1'] = JSON.stringify([klasseRec(userId)]);
  return s;
}

function klasseRec(userId) {
  return { id: 'k1', name: 'HF Gebäudetechnik 26', orgId: 'org_test',
    dozentIds: ['u_doz'], studentIds: [userId], module: [] };
}

async function wsPage(userId, klasseImCache) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await wireRoutes(ctx);
  /* Die Klassen-Collection MUSS die Klasse auch über den Cloud-Pull liefern:
     bindCollection überschreibt den localStorage-Cache mit dem Cloud-Stand,
     ein leerer Mock löschte die geseedete Klasse sonst wieder weg. */
  await ctx.route(/rest\/v1\/gema_data/, route => {
    if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
    const u = route.request().url();
    let rows = [];
    if (/module_key=eq\.workspace/.test(u)) rows = EIMER.map(b => ({ data_key: 'ws:' + b.id, payload: { data: b } }));
    else if (klasseImCache && /module_key=eq\.schule/.test(u)) {
      const k = klasseRec(userId);
      rows = [{ data_key: 'sklasse:' + k.id, payload: { data: k } }];
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  await ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, konto(userId, klasseImCache));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  return { ctx, page, errs };
}

console.log('\n■ C1: Robin (kein Klassen-Bezug) sieht die Klasse NICHT');
{
  const { ctx, page, errs } = await wsPage('u_test', false);
  const z = await page.evaluate(() => ({
    sicht: [...document.querySelectorAll('#wsOrgBuckets, #wsPersonal, #wsGuestBuckets')].map(e => e.textContent).join(' '),
    canKl: window._wsHooks.canSee(window._wsHooks.buckets().find(b => b.id === 'ws_kl_k1')),
    canUe: window._wsHooks.canSee(window._wsHooks.buckets().find(b => b.id === 'ws_ue_k1_u_fremd')),
    canEigen: window._wsHooks.canSee(window._wsHooks.buckets().find(b => b.id === 'ws_eigen')),
    fixe: (window._wsHooks.fixeEimer ? window._wsHooks.fixeEimer() : []).map(b => b.id)
  }));
  ok('C1.1 Klassen-Eimer nicht sichtbar (fail-closed)', z.canKl === false, z.canKl);
  ok('C1.2 fremder Übungs-Eimer nicht sichtbar', z.canUe === false, z.canUe);
  ok('C1.3 eigener Org-Eimer bleibt sichtbar', z.canEigen === true);
  ok('C1.4 die Klasse steht in KEINER Sidebar-Liste', !/HF Gebäudetechnik/.test(z.sicht), z.sicht.slice(0, 200));
  ok('C1.5 der eigene Eimer steht drin', /Neubau Sonnenweg/.test(z.sicht));
  ok('C1.6 die Klasse steht auch nicht in den «fixen Eimern der Firma»',
    z.fixe.indexOf('ws_kl_k1') < 0, z.fixe);
  ok('C1.7 keine pageerrors', errs.length === 0, errs.slice(0, 2));

  /* «auch objekte»: das falsch gestempelte Auto-Objekt wandert zurück in
     die Org des Eimers — hier dieselbe, also darf es NICHT verschwinden.
     Geprüft wird stattdessen, dass das Öffnen keines mehr ANLEGT. */
  const objVorher = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_objekte_v1')).objekte.length);
  await page.evaluate(() => { try { window._wsOpen('ws_kl_k1'); } catch (e) {} });
  await page.waitForTimeout(400);
  const objNachher = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_objekte_v1')).objekte.length);
  ok('C1.8 kein Objekt-Nachschub durch Öffnen eines fremden Eimers', objNachher === objVorher, { objVorher, objNachher });
  await ctx.close();
}

console.log('\n■ C2: Gegenprobe — ein Klassen-Mitglied sieht seinen Eimer');
{
  const { ctx, page, errs } = await wsPage('u_stud', true);
  const z = await page.evaluate(() => {
    const b = window._wsHooks.buckets().find(x => x.id === 'ws_kl_k1');
    return {
      canKl: window._wsHooks.canSee(b),
      nur: (b && b.accessControl && b.accessControl.nurUserIds) || null,
      sicht: [...document.querySelectorAll('#wsOrgBuckets, #wsPersonal')].map(e => e.textContent).join(' ')
    };
  });
  ok('C2.1 Mitglied sieht den Klassen-Eimer (kein Regressionsschaden)', z.canKl === true, z);
  ok('C2.2 er steht auch in der Sidebar', /HF Gebäudetechnik/.test(z.sicht), z.sicht.slice(0, 200));
  ok('C2.3 die Provisionierung heilt nurUserIds nach (Selbstheilung für echte Mitglieder)',
    Array.isArray(z.nur) && z.nur.indexOf('u_stud') >= 0, z.nur);
  ok('C2.4 keine pageerrors', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

console.log('\n■ C3: Auto-Objekt in der falschen Org wird korrigiert');
{
  const AUS = EIMER.map(b => b.id === 'ws_kl_k1' ? Object.assign({}, b, { ownerOrgId: 'org_schule' }) : b);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await wireRoutes(ctx);
  await ctx.route(/rest\/v1\/gema_data/, route => {
    if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
    const u = route.request().url();
    const rows = /module_key=eq\.workspace/.test(u)
      ? AUS.map(b => ({ data_key: 'ws:' + b.id, payload: { data: b } })) : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  const st = konto('u_test', false);
  st['gema_ws_pool_v1'] = JSON.stringify(AUS);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const o = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('gema_objekte_v1'));
    const x = d.objekte.find(y => y.id === 'obj_ws_ws_kl_k1');
    return { da: !!x, org: x && x.orgId, anzahl: d.objekte.length };
  });
  ok('C3.1 das Objekt existiert weiterhin (nichts gelöscht)', o.da === true && o.anzahl === 1, o);
  ok('C3.2 seine Org zeigt jetzt auf den Eimer (org_schule)', o.org === 'org_schule', o);
  await ctx.close();
}

/* ═══ D — im Browser: Fahrzeug ═══════════════════════════════════════════ */
console.log('\n■ D: if_fahrzeug.html — Sektionen + Sortierung im Browser');
{
  const FLOTTE = [
    { id: 'v1', nr: 'FZG-2',  model: 'VW Crafter', plate: 'BS 1002', status: 'aktiv', orgId: 'org_test', type: 'Lieferwagen' },
    { id: 'v2', nr: 'FZG-10', model: 'Ford Transit', plate: 'BS 1010', status: 'aktiv', orgId: 'org_test', type: 'Lieferwagen' },
    { id: 'v3', nr: 'FZG-1',  model: 'Fiat Ducato', plate: 'BS 1001', status: 'aktiv', orgId: 'org_test', type: 'Lieferwagen',
      garage: 'Garage Meier AG', stellplatz: 'P2-14', stellplatzGarage: 'Einstellhalle Bahnhofstrasse',
      /* genau der Fall aus dem Bugreport: ein aus einer Garagen-Rechnung
         eingelesener Beleg. Er muss auf JEDEM Weg auffindbar sein. */
      serviceHistorie: [{ id: 'sh1', datum: '2026-07-14', km: '82000', art: 'reparatur',
        beschreibung: 'Bremsbelaege vorne ersetzt', kosten: "1'240.50", werkstatt: 'Garage Meier AG',
        rechnungsNr: 'R-2026-118', quelle: 'beleg', quelleDatei: 'rechnung_meier.pdf' }] }
  ];
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await wireRoutes(ctx);
  await ctx.route(/rest\/v1\/gema_data/, route => {
    if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
    const u = route.request().url();
    const rows = /module_key=eq\.fahrzeugmanagement/.test(u)
      ? FLOTTE.map(v => ({ data_key: 'vehicle:' + v.id, payload: { data: v } })) : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  const st = seed(['role_magaziner']);
  st['gema_vehicles'] = JSON.stringify(FLOTTE);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/if_fahrzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  ok('D1 keine pageerrors beim Boot', errs.length === 0, errs.slice(0, 2));

  const nat = await page.evaluate(() => {
    const c = window._fzNatCmp;
    return { a: c('FZG-2', 'FZG-10'), b: c('FZG-10', 'FZG-2'), gleich: c('FZG-2', 'FZG-2') };
  });
  ok('D2 «FZG-2» steht vor «FZG-10»', nat.a < 0 && nat.b > 0 && nat.gleich === 0, nat);

  /* Gegenprobe: der alte zeichenweise Vergleich stellte es falsch herum. */
  const alt = await page.evaluate(() => {
    const a = 'FZG-2', b = 'FZG-10';
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  ok('D3 Gegenprobe: zeichenweise wäre es falsch', alt > 0, alt);

  /* Erfassungs-Formular: eine Garage-Sektion, Stellplatz optional. */
  await page.evaluate(() => { try { window.openModal('v3'); } catch (e) {} });
  await page.waitForTimeout(500);
  const f = await page.evaluate(() => {
    const sichtbar = el => !!el && el.offsetParent !== null;
    const sekTitel = [...document.querySelectorAll('#modalOverlay .form-section')]
      .filter(s => s.offsetParent !== null)
      .map(s => (s.querySelector('.form-section-title') || {}).textContent || '');
    return {
      titel: sekTitel,
      garageSichtbar: sichtbar(document.querySelector('.fz-opt[data-opt="garage"]')),
      stellSichtbar: sichtbar(document.querySelector('.fz-opt[data-opt="stellplatz"]')),
      wzInGarage: !!document.querySelector('.fz-opt[data-opt="garage"] #fWerkstattZugang'),
      stellOrt: (document.getElementById('fStellplatzGarage') || {}).value,
      stellNr: (document.getElementById('fStellplatz') || {}).value,
      garage: (document.getElementById('fGarage') || {}).value
    };
  });
  ok('D4 «Garage» erscheint genau einmal in den Sektions-Titeln',
    f.titel.filter(t => /Garage/.test(t)).length === 1, f.titel);
  ok('D5 Garage-Sektion sichtbar (Standard an)', f.garageSichtbar === true);
  ok('D6 der Werkstatt-Zugang steckt IN der Garage-Sektion', f.wzInGarage === true);
  ok('D7 Stellplatz sichtbar, weil das Fahrzeug Werte trägt (Bestandsschutz)',
    f.stellSichtbar === true, f);
  ok('D8 Stellplatz-Ort + -Nr. sind befüllt',
    f.stellOrt === 'Einstellhalle Bahnhofstrasse' && f.stellNr === 'P2-14', f);
  ok('D9 die Service-Garage steht im Garage-Feld', /Garage Meier AG/.test(f.garage || ''), f.garage);

  /* R6 — der Klick aufs Fahrzeug fuehrt in die DETAILansicht; dort (und nur
     dort) steht die Service-Historie mit den importierten Belegen. */
  await page.evaluate(() => { try { window.closeModal(); } catch (e) {} });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const k = [...document.querySelectorAll('.v-card')].find(c => /Fiat Ducato/.test(c.textContent));
    if (k) k.click();
  });
  await page.waitForTimeout(500);
  const det = await page.evaluate(() => {
    const vm = document.getElementById('viewModalOverlay'), fo = document.getElementById('modalOverlay');
    /* offsetParent ist bei position:fixed IMMER null — ueber Anzeige +
       Geometrie messen statt ueber offsetParent. */
    const auf = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    const t = vm ? vm.textContent : '';
    return { detail: auf(vm), formular: auf(fo), hist: /Service-Historie/.test(t),
      beleg: /aus Beleg/.test(t), datei: /rechnung_meier\.pdf/.test(t),
      text: /Bremsbelaege vorne ersetzt/.test(t), rg: /R-2026-118/.test(t),
      preis: /1'240\.50/.test(t) };
  });
  ok('D10 der Klick oeffnet die Detailansicht (nicht das Erfassungs-Formular)',
    det.detail === true && det.formular === false, det);
  ok('D11 die Service-Historie steht darin', det.hist === true, det);
  ok('D12 der importierte Beleg ist auffindbar (Text, Rechnungs-Nr., Herkunft, Datei)',
    det.text && det.rg && det.beleg && det.datei, det);
  ok('D13 der Magaziner sieht den Betrag', det.preis === true, det);

  /* Bearbeiten bleibt erreichbar — jetzt als eigener Knopf auf der Karte. */
  await page.evaluate(() => { try { closeViewModal(); } catch (e) {} });
  await page.waitForTimeout(250);
  const edit = await page.evaluate(() => {
    const k = [...document.querySelectorAll('.v-card')].find(c => /Fiat Ducato/.test(c.textContent));
    const b = k && [...k.querySelectorAll('button')].find(x => /Bearbeiten/.test(x.textContent));
    if (!b) return { knopf: false };
    b.click();
    return { knopf: true };
  });
  await page.waitForTimeout(500);
  const nachEdit = await page.evaluate(() => {
    const fo = document.getElementById('modalOverlay'), vm = document.getElementById('viewModalOverlay');
    const auf = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    return { formular: auf(fo), detail: auf(vm) };
  });
  ok('D14 die Karte hat einen Bearbeiten-Knopf', edit.knopf === true);
  ok('D15 er oeffnet das Formular (und nicht zusaetzlich das Detail)',
    nachEdit.formular === true && nachEdit.detail === false, nachEdit);

  await ctx.close();
}

/* ═══ E — im Browser: dieselben Belege auf dem Handy ═════════════════════ */
console.log('\n■ E: if_fahrzeug.html — Service & Belege in der App-Ansicht');
{
  const FLOTTE = [
    { id: 'v3', nr: 'FZG-1', model: 'Fiat Ducato', plate: 'BS 1001', status: 'aktiv', orgId: 'org_test', type: 'Lieferwagen',
      km: 82500, lastService: '2026-07-14',
      serviceHistorie: [{ id: 'sh1', datum: '2026-07-14', km: '82000', art: 'reparatur',
        beschreibung: 'Bremsbelaege vorne ersetzt', kosten: "1'240.50", werkstatt: 'Garage Meier AG',
        rechnungsNr: 'R-2026-118', quelle: 'beleg', quelleDatei: 'rechnung_meier.pdf' }] }
  ];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await wireRoutes(ctx);
  await ctx.route(/rest\/v1\/gema_data/, route => {
    if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
    const u = route.request().url();
    const rows = /module_key=eq\.fahrzeugmanagement/.test(u)
      ? FLOTTE.map(v => ({ data_key: 'vehicle:' + v.id, payload: { data: v } })) : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  // nativ:true — die App-Ansicht ist seit 24.08.2026 nicht mehr der
  // Phone-Standard; dieser Abschnitt prüft sie ausdrücklich.
  const st = seed(['role_magaziner'], { nativ: true });
  st['gema_vehicles'] = JSON.stringify(FLOTTE);
  await ctx.addInitScript(s2 => {
    for (const [k, v] of Object.entries(s2)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/if_fahrzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  const nativ = await page.evaluate(() =>
    !!document.documentElement.classList.contains('gn-native-on') && !!document.querySelector('.gn--page'));
  ok('E1 die App-Ansicht ist aktiv (Phone-Viewport, in den Einstellungen eingeschaltet)', nativ === true);
  ok('E2 keine pageerrors', errs.length === 0, errs.slice(0, 2));

  /* Tap auf das Fahrzeug → Detail-Sheet, darin der Weg zu den Belegen. */
  await page.evaluate(() => {
    const r = document.querySelector('.gn--page [data-nat-id]');
    if (r) r.click();
  });
  await page.waitForTimeout(450);
  const sheet = await page.evaluate(() => {
    const s3 = document.querySelector('.gn-sheet');
    return { offen: !!s3, txt: s3 ? s3.textContent : '' };
  });
  ok('E3 der Tap oeffnet das Detail-Sheet', sheet.offen === true);
  ok('E4 «Service & Belege» steht darin — mit Anzahl',
    /Service & Belege \(1\)/.test(sheet.txt), sheet.txt.slice(0, 200));

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.gn-sheet [data-nats]')].find(x => x.getAttribute('data-nats') === 'hist');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  const hist = await page.evaluate(() => {
    const s3 = document.querySelector('.gn-sheet');
    const t = s3 ? s3.textContent : '';
    return { txt: t, beleg: /aus Beleg/.test(t), datei: /rechnung_meier\.pdf/.test(t),
      text: /Bremsbelaege vorne ersetzt/.test(t), rg: /R-2026-118/.test(t), preis: /1'240\.50/.test(t) };
  });
  ok('E5 der importierte Beleg steht im Handy-Verlauf',
    hist.text && hist.rg && hist.beleg && hist.datei, hist.txt.slice(0, 240));
  ok('E6 der Magaziner sieht den Betrag auch dort', hist.preis === true, hist.txt.slice(0, 240));

  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen' : '✓ alle ' + n + ' Checks grün'));
process.exit(fail ? 1 : 0);
