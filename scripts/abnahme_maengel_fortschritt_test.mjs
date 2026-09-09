// Drift-Guard: Fortschritt einer übergebenen Mängelliste ist für die
// verantwortliche Seite sichtbar — und nichts geht dabei verloren.
//
// Hintergrund (Feedback 09.09.2026):
//  «Bei dem Abnahmeprotokoll kann man Pendenzen respektive Mängel erfassen.
//   Der Monteur der anderen Firma sieht das auch, jedoch wenn er es als
//   erledigt markiert, kann der Planer dies nicht sehen. Ich habe das geprüft
//   und man sieht das nicht.»
//
// Gemessene Ursache: der abml:-Record synchronisiert einwandfrei cross-org
// (RLS lässt `abnahme` bewusst ungescopt), aber die ANZEIGE des Planers hing
// vollständig an ml.status==='abgearbeitet'. Diesen Status setzt allein der
// Abarbeiter über «Alle abgearbeitet — melden», und dieser Knopf ist gesperrt,
// solange auch nur ein Punkt offen ist. Hakte der Monteur die Punkte bloss ab,
// sah der Planer NICHTS: das Aufgaben-Panel blieb leer und im Protokoll stand
// weiterhin «🔴 Offen».
//
// Deckt ab:
//  A) Statik: Live-Index (memoisiert, invalidiert), quota-fester Pool-Write,
//     Freigabe nimmt nur erledigte Punkte, Adopt-Render löst keinen Save aus,
//     Nur-Mängel-Sperre bleibt.
//  B) Zwei echte Browser-Kontexte (Planer org_p / Monteur org_m) an EINER
//     gemockten Cloud: Teilfortschritt, Vollstand, Badges am Protokollpunkt,
//     Freigabe, Zurückweisen.
//  C) Datensicherheit: kein stiller Rückschrieb ins Protokoll, Freigabe lässt
//     offene Punkte offen, Quota-Fehler verliert kein Häkchen, leerer
//     Cloud-Stand überschreibt kein gefülltes Protokoll.
//
// Gegenprobe: ohne den Fix fallen B2/B3 und C2 um (Panel leer, keine Badges).
//
// Aufruf: CHROME=<chromium> node scripts/abnahme_maengel_fortschritt_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8943, BASE = 'http://localhost:' + PORT;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json' };

let pass = 0, fail = 0;
const ok = (c, l, extra) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); } };

const srv = createServer(async (q, r) => {
  try { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); r.end(d);
  } catch (e) { r.writeHead(404); r.end('nf'); }
});
await new Promise(r => srv.listen(PORT, r));

// ══════════════════════════════════════════════════════════════════
// A) Statik
// ══════════════════════════════════════════════════════════════════
console.log('— A) Statik —');
const AB = await readFile(join(ROOT, 'pm_abnahme.html'), 'utf8');

ok(/function abMlIdx\(\)\{[\s\S]{0,200}if\(_abMlIdx\) return _abMlIdx;/.test(AB),
  'Live-Index ist memoisiert (abPoolRead liefert Kopien — pro Mangel lesen wäre quadratisch)');
ok(/function abMlIdx[\s\S]{0,600}ml\.status==='freigegeben'\) return;/.test(AB),
  'freigegebene Listen stehen nicht mehr im Live-Index (ihr Stand liegt im Protokoll)');
ok(/if\(key===ML_POOL\) abMlIdxInvalidate\(\);/.test(AB),
  'jeder Pool-Write verwirft den Index');
ok(/function abPoolSave[\s\S]{0,900}GemaSync\.setCached\(key,pool\)/.test(AB),
  'Pool-Write läuft über GemaSync.setCached (localStorage + Spiegel + IndexedDB)');
ok(/NUR LESEND: `it\.erledigt` im Protokoll wird hier NIE gesetzt/.test(AB),
  'die Absicht «kein stiller Rückschrieb» ist am Code dokumentiert');
ok(/if\(mi\.status!=='erledigt'\) return;\s*\/\/ offen\/zurückgewiesen bleibt offen/.test(AB),
  'Freigabe übernimmt NUR abgehakte Punkte');
ok(/_abAdopting=true;\s*\n\s*try\{ render\(\); \} finally \{ _abAdopting=false; \}/.test(AB),
  'der Render nach dem Cloud-Pull löst keinen Protokoll-Save aus');
ok(/function scheduleSave[\s\S]{0,400}ab-nur-maengel'\)\) return;/.test(AB),
  'Regression: der Abarbeiter speichert das Protokoll weiterhin NIE');
ok(/laufend=abPoolRead\(ML_POOL\)\.filter\(function\(r\)\{[\s\S]{0,180}abMlDarfKontrollieren\(r\)/.test(AB),
  'das neue Panel nutzt denselben Berechtigungs-Guard wie die Aktionen');
ok(/var AB_ML_STATI=\{offen:1,in_arbeit:1,erledigt:1\}/.test(AB),
  'Status-Setter akzeptiert genau offen / in_arbeit / erledigt');
ok(/window\.abMlItemToggle=function[\s\S]{0,200}abMlItemStatus\(mlId,itemId,chk\?'erledigt':'offen'\)/.test(AB),
  'der alte Checkbox-Aufruf bleibt als Wrapper bestehen (Alt-Markup / Deep-Links)');
ok(!/type="checkbox"[^>]*onchange="abMlItemToggle/.test(AB),
  'in der Abarbeitungs-Liste steckt keine Checkbox mehr');
ok(/kommentarVerantwortlicher bleibt STEHEN/.test(AB),
  'die Begründung einer Zurückweisung wird beim Neu-Setzen NICHT gelöscht');

// ══════════════════════════════════════════════════════════════════
// Gemeinsame gemockte Cloud + zwei Kontexte
// ══════════════════════════════════════════════════════════════════
const CLOUD = new Map();
function handleSb(route) {
  const req = route.request(), url = req.url(), m = req.method();
  if (m === 'POST') {
    let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [];
    body.forEach(row => CLOUD.set(row.module_key + '|' + row.data_key, row.payload));
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  }
  if (m === 'DELETE') {
    const mk = /module_key=eq\.([^&]+)/.exec(url), dk = /data_key=eq\.([^&]+)/.exec(url);
    if (mk && dk) CLOUD.delete(decodeURIComponent(mk[1]) + '|' + decodeURIComponent(dk[1]));
    return route.fulfill({ status: 204, body: '' });
  }
  const mk = /module_key=eq\.([^&]+)/.exec(url);
  if (!mk) return route.fulfill({ contentType: 'application/json', body: '[]' });
  const mod = decodeURIComponent(mk[1]);
  const pf = /data_key=like\.([^&]+)/.exec(url);
  const prefix = pf ? decodeURIComponent(pf[1]).replace(/\*$/, '') : '';
  const rows = [...CLOUD.entries()]
    .filter(([k]) => k.startsWith(mod + '|') && k.slice(mod.length + 1).startsWith(prefix))
    .map(([k, payload]) => ({ data_key: k.slice(mod.length + 1), payload }));
  return route.fulfill({ contentType: 'application/json',
    headers: { 'content-range': '0-' + Math.max(0, rows.length - 1) + '/' + rows.length },
    body: JSON.stringify(rows) });
}

const FUT = new Date(Date.now() + 30 * 86400000).toISOString();
const TOK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig';
const ORGS = [
  { id:'org_p', name:'Planer AG', kategorie:'sanitaerplaner', kategorien:['sanitaerplaner'], admins:['u_plan'], active:true },
  { id:'org_m', name:'Montage GmbH', kategorie:'unternehmer', kategorien:['unternehmer'], admins:['u_mont'], active:true }
];
const USERS = [
  { id:'u_plan', username:'plan@p.ch', name:'Peter Planer', roleIds:['role_planer'], orgId:'org_p', active:true, profile:{ email:'plan@p.ch', firma:'Planer AG' } },
  { id:'u_mont', username:'mont@m.ch', name:'Max Monteur', roleIds:['role_unternehmer'], orgId:'org_m', active:true, profile:{ email:'mont@m.ch', firma:'Montage GmbH' } }
];
CLOUD.set('objekte|objekt:obj1', { data:{ id:'obj1', name:'MFH Musterweg 3', bezeichnung:'MFH Musterweg 3', strasse:'Musterweg 3', plz:'8000', ort:'Zürich', status:'aktiv', orgId:'org_p' }, _lm:'2026-09-01T08:00:00Z' });

const browser = await chromium.launch({ executablePath: CHROME });
async function ctxFor(user, extraSeed) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/.netlify/functions/') >= 0) return route.fulfill({ contentType:'application/json', body:'{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); },
    Object.assign({
      gema_orgs_v1: ORGS, gema_users_v1: USERS,
      gema_session_v1: { token: TOK, userId: user, expires: FUT },
      gema_objekte_v1: { objekte: [], beteiligte: [], activeObjektId: 'obj1' }
    }, extraSeed || {}));
  await ctx.addInitScript(() => { try { localStorage.setItem('gema_active_objekt_v1', 'obj1'); } catch (e) {} });
  return ctx;
}
const errs = [];
async function open(ctx, label) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(label + ': ' + e.message));
  await p.goto(BASE + '/pm_abnahme.html?objekt=obj1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof window._abState === 'function', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(2200);
  return p;
}

// ══════════════════════════════════════════════════════════════════
// B) Zwei Firmen, eine Mängelliste
// ══════════════════════════════════════════════════════════════════
console.log('— B1) Planer übergibt zwei Mängel an die fremde Firma —');
const cP = await ctxFor('u_plan');
let P = await open(cP, 'planer');
await P.evaluate(() => {
  const st = _abState();
  st.abnahme = st.abnahme || {}; st.abnahme.bauobjekt = 'MFH Musterweg 3';
  st.items.length = 0;
  st.items.push(_abCreateItem({ ort:'Bad EG', mangel:'Silikonfuge undicht' }));
  st.items.push(_abCreateItem({ ort:'Küche', mangel:'Eckventil tropft' }));
  _abRender();
});
await P.waitForTimeout(400);
const zuw = await P.evaluate(() => new Promise(res => {
  window.abMlOpenAssign();
  setTimeout(() => {
    window.abMlMode('ext');
    const inp = document.getElementById('mlExtEmail');
    inp.value = 'mont@m.ch'; inp.dispatchEvent(new Event('input', { bubbles:true }));
    setTimeout(() => { window.abMlAssign();
      setTimeout(() => res((_abPoolRead('gema_abnahme_ml_pool_v1') || []).map(r => ({ id:r.id, status:r.status, n:(r.items||[]).length, extern:!!r.extern }))), 400);
    }, 500);
  }, 300);
}));
ok(zuw.length === 1 && zuw[0].n === 2 && zuw[0].extern, 'Mängelliste an die fremde Firma übergeben', zuw);
await P.waitForTimeout(1200);
ok([...CLOUD.keys()].some(k => k.startsWith('abnahme|abml:')), 'die Liste liegt in der Cloud');

console.log('— B2) Monteur hakt EINEN Punkt ab — sieht der Planer den Teilstand? —');
const cM = await ctxFor('u_mont');
const M = await open(cM, 'monteur');
const monteurSicht = await M.evaluate(() => {
  const pool = _abPoolRead('gema_abnahme_ml_pool_v1') || [];
  return { pool: pool.length, meine: pool.filter(r => _abIstMeineMl(r)).length, nurMaengel: document.body.classList.contains('ab-nur-maengel') };
});
ok(monteurSicht.meine === 1 && monteurSicht.nurMaengel, 'der Monteur sieht seine Liste im Nur-Mängel-Modus', monteurSicht);
const ersterPunkt = await M.evaluate(async () => {
  const ml = (_abPoolRead('gema_abnahme_ml_pool_v1') || []).find(r => _abIstMeineMl(r));
  window.abMlItemToggle(ml.id, ml.items[0].id, true);
  await new Promise(r => setTimeout(r, 300));
  const p = _abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === ml.id);
  return { mlStatus: p.status, items: p.items.map(i => i.status), itemId0: ml.items[0].itemId };
});
ok(ersterPunkt.items.join(',') === 'erledigt,offen' && ersterPunkt.mlStatus === 'offen',
  'ein Punkt abgehakt, die Liste bleibt offen (kein Fertigmelden möglich)', ersterPunkt);
await M.waitForTimeout(1200);

await P.close();
P = await open(cP, 'planer2');
const teil = await P.evaluate(() => {
  const host = document.getElementById('abTasks');
  const karten = [...document.querySelectorAll('#items .mangel-card')].map(c => ({
    ort: c.querySelector('.mangel-ort')?.innerText.trim(),
    badges: c.querySelector('.mangel-status-col')?.innerText.replace(/\s+/g, ' ').trim(),
    detail: !!c.querySelector('.ab-mlinfo')
  }));
  return { tasks: (host ? host.innerText : '').replace(/\s+/g, ' ').trim(), karten,
           freiBtn: !!(host && host.querySelector('button[onclick*="abMlFreigeben"]')),
           proto: (_abState().items || []).map(i => i.erledigt) };
});
ok(/Übergeben/.test(teil.tasks) && /1\/2 erledigt/.test(teil.tasks),
  'der Planer sieht den Teilfortschritt «1/2 erledigt» — ohne Fertigmeldung', teil.tasks.slice(0, 120));
ok(/Vom Monteur erledigt/.test(teil.karten[0].badges || '') && teil.karten[0].detail,
  'der abgehakte Punkt trägt im Protokoll den Live-Stand', teil.karten[0]);
ok(!/Vom Monteur erledigt/.test(teil.karten[1].badges || '') && /Beim Monteur/.test(teil.karten[1].badges || ''),
  'der noch offene Punkt zeigt «Beim Monteur», nicht «erledigt»', teil.karten[1]);
ok(teil.freiBtn === false, 'der Freigeben-Knopf erscheint erst, wenn alles abgehakt ist', teil.freiBtn);

console.log('— B2b) Drei Status-Knöpfe statt Checkbox —');
const seg = await M.evaluate(() => {
  const ml = (_abPoolRead('gema_abnahme_ml_pool_v1') || []).find(r => _abIstMeineMl(r));
  const host = document.getElementById('abTasks');
  const zeilen = [...host.querySelectorAll('.ml-seg')];
  const ersteZeile = zeilen[0] ? [...zeilen[0].querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), on: b.className.indexOf('on-') >= 0 })) : [];
  return { checkboxen: host.querySelectorAll('input[type=checkbox]').length, segs: zeilen.length, ersteZeile, mlId: ml.id, itemIds: ml.items.map(i => i.id) };
});
ok(seg.checkboxen === 0, 'keine Checkbox mehr in der Mängelliste', seg.checkboxen);
ok(seg.segs === 2 && seg.ersteZeile.length === 3, 'jeder Punkt hat drei Status-Knöpfe', { segs: seg.segs, n: seg.ersteZeile.length });
ok(seg.ersteZeile.map(b => b.t.replace(/^\W+\s*/, '')).join('|') === 'Offen|In Arbeit|Erledigt',
  'Beschriftung Offen / In Arbeit / Erledigt', seg.ersteZeile.map(b => b.t));
ok(seg.ersteZeile[2].on === true && seg.ersteZeile[0].on === false,
  'der aktuelle Stand (erledigt) ist als aktiv markiert', seg.ersteZeile);
// rechts, nicht links: der Schalter sitzt rechts vom Mangeltext
const rechts = await M.evaluate(() => {
  const zeile = document.querySelector('#abTasks .ml-seg').closest('div[style*="flex-wrap"]');
  const txt = zeile.querySelector('div[style*="min-width:180px"]').getBoundingClientRect();
  const s = zeile.querySelector('.ml-seg').getBoundingClientRect();
  return { textLinks: Math.round(txt.left), segLinks: Math.round(s.left) };
});
ok(rechts.segLinks > rechts.textLinks, 'der Schalter steht rechts vom Mangeltext', rechts);
// «Offen» macht rückgängig, «In Arbeit» ist ein eigener Zwischenstand
const dreiWege = await M.evaluate(async () => {
  const ml = (_abPoolRead('gema_abnahme_ml_pool_v1') || []).find(r => _abIstMeineMl(r));
  window.abMlItemStatus(ml.id, ml.items[0].id, 'offen');
  await new Promise(r => setTimeout(r, 200));
  const a = _abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === ml.id).items.map(i => i.status);
  window.abMlItemStatus(ml.id, ml.items[0].id, 'in_arbeit');
  await new Promise(r => setTimeout(r, 200));
  const p = _abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === ml.id);
  window.abMlItemStatus(ml.id, ml.items[0].id, 'quatsch');   // unbekannt → ignorieren
  await new Promise(r => setTimeout(r, 150));
  const q = _abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === ml.id).items[0].status;
  return { nachOffen: a, nachArbeit: p.items.map(i => i.status), erledigtAm: p.items[0].erledigtAm, unbekannt: q };
});
ok(dreiWege.nachOffen[0] === 'offen', '«Offen» nimmt ein Erledigt zurück', dreiWege.nachOffen);
ok(dreiWege.nachArbeit[0] === 'in_arbeit' && !dreiWege.erledigtAm,
  '«In Arbeit» ist ein eigener Stand ohne Erledigt-Stempel', dreiWege);
ok(dreiWege.unbekannt === 'in_arbeit', 'ein unbekannter Status wird ignoriert statt gespeichert', dreiWege.unbekannt);
// ECHTER Klick statt Funktionsaufruf: der Nur-Mängel-Modus schaltet
// pointer-events für Knöpfe ab (#view_abnahme/#view_maengel) — die Schalter
// im Aufgaben-Panel dürfen davon NICHT betroffen sein.
const klick = await M.evaluate(async () => {
  const seg = document.querySelector('#abTasks .ml-seg');
  const btn = seg.querySelectorAll('button')[2];              // «Erledigt»
  const r = btn.getBoundingClientRect();
  const oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const erreichbar = !!(oben && (oben === btn || btn.contains(oben)));
  const pe = getComputedStyle(btn).pointerEvents;
  btn.click();
  await new Promise(r2 => setTimeout(r2, 250));
  const ml = (_abPoolRead('gema_abnahme_ml_pool_v1') || []).find(r3 => _abIstMeineMl(r3));
  return { erreichbar, pe, status: ml.items[0].status };
});
ok(klick.erreichbar && klick.pe !== 'none', 'die Knöpfe sind im Nur-Mängel-Modus wirklich anklickbar (gemessen)', klick);
ok(klick.status === 'erledigt', 'ein echter Klick auf «Erledigt» setzt den Status', klick.status);
// zurück auf «In Arbeit» für die folgende Prüfung
await M.evaluate(async () => {
  const seg = document.querySelector('#abTasks .ml-seg');
  seg.querySelectorAll('button')[1].click();
  await new Promise(r => setTimeout(r, 250));
});
const fertigBlock = await M.evaluate(async () => {
  const ml = (_abPoolRead('gema_abnahme_ml_pool_v1') || []).find(r => _abIstMeineMl(r));
  window.abMlFertigmelden(ml.id);
  await new Promise(r => setTimeout(r, 250));
  return _abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === ml.id).status;
});
ok(fertigBlock === 'offen', '«In Arbeit» zählt nicht als erledigt — Fertigmelden bleibt gesperrt', fertigBlock);
await M.waitForTimeout(1200);

await P.close();
P = await open(cP, 'planer2b');
const arbeitSicht = await P.evaluate(() => ({
  tasks: (document.getElementById('abTasks') || {}).innerText?.replace(/\s+/g, ' ').trim() || '',
  badge: document.querySelector('#items .mangel-status-col')?.innerText.replace(/\s+/g, ' ').trim() || '',
  freiBtn: !!document.querySelector('#abTasks button[onclick*="abMlFreigeben"]')
}));
ok(/in Arbeit/.test(arbeitSicht.tasks), 'der Planer sieht «in Arbeit» in der Kopfzeile', arbeitSicht.tasks.slice(0, 120));
ok(/In Arbeit/.test(arbeitSicht.badge), 'der Protokollpunkt zeigt «In Arbeit»', arbeitSicht.badge);
ok(arbeitSicht.freiBtn === false, 'kein Freigeben, solange ein Punkt nur «in Arbeit» ist');
// Stand für die folgenden Blöcke wiederherstellen
await M.evaluate(async () => {
  const ml = (_abPoolRead('gema_abnahme_ml_pool_v1') || []).find(r => _abIstMeineMl(r));
  window.abMlItemStatus(ml.id, ml.items[0].id, 'erledigt');
  await new Promise(r => setTimeout(r, 250));
});
await M.waitForTimeout(1000);
await P.close();
P = await open(cP, 'planer2c');

console.log('— C1) Datensicherheit: kein stiller Rückschrieb ins Protokoll —');
ok(teil.proto.join('|') === '|', 'it.erledigt im Protokoll bleibt leer, bis die verantwortliche Seite freigibt', teil.proto);

console.log('— B3) Zweiter Punkt abgehakt → Vollstand + Meldung —');
const notif = await M.evaluate(async () => {
  window.__n = []; if (!window.GemaNotify) window.GemaNotify = {};
  window.GemaNotify.push = function (n) { window.__n.push(n); return Promise.resolve(); };
  const ml = (_abPoolRead('gema_abnahme_ml_pool_v1') || []).find(r => _abIstMeineMl(r));
  window.abMlItemToggle(ml.id, ml.items[1].id, true);
  await new Promise(r => setTimeout(r, 300));
  // Aus- und wieder anhaken darf NICHT erneut melden
  window.abMlItemToggle(ml.id, ml.items[1].id, false);
  await new Promise(r => setTimeout(r, 150));
  window.abMlItemToggle(ml.id, ml.items[1].id, true);
  await new Promise(r => setTimeout(r, 300));
  const p = _abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === ml.id);
  return { n: window.__n.filter(x => x.empfaengerUserId === 'u_plan').length, items: p.items.map(i => i.status), stamp: !!p.alleErledigtAm };
});
ok(notif.items.join(',') === 'erledigt,erledigt', 'beide Punkte abgehakt', notif);
ok(notif.n === 1 && notif.stamp, 'genau EINE Meldung an die verantwortliche Seite (Stempel verhindert Spam)', notif);
await M.waitForTimeout(1200);

await P.close();
P = await open(cP, 'planer3');
const voll = await P.evaluate(() => ({
  tasks: (document.getElementById('abTasks') || {}).innerText?.replace(/\s+/g, ' ').trim() || ''
}));
ok(/2\/2 erledigt/.test(voll.tasks) && /Freigeben/.test(voll.tasks),
  'bei Vollstand bietet der Planer die Freigabe an, obwohl der Monteur nicht fertiggemeldet hat', voll.tasks.slice(0, 160));

console.log('— B4) Freigeben übernimmt die Punkte ins Protokoll —');
const frei = await P.evaluate(async () => {
  window.GemaDialog.confirm = () => Promise.resolve(true);
  const ml = (_abPoolRead('gema_abnahme_ml_pool_v1') || [])[0];
  window.abMlFreigeben(ml.id);
  await new Promise(r => setTimeout(r, 700));
  const p = _abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === ml.id);
  return { mlStatus: p.status, proto: (_abState().items || []).map(i => i.erledigt),
           badges: [...document.querySelectorAll('#items .mangel-status-col')].map(e => e.innerText.replace(/\s+/g, ' ').trim()) };
});
ok(frei.mlStatus === 'freigegeben', 'die Liste ist freigegeben', frei.mlStatus);
ok(frei.proto.every(v => (v || '').trim().length > 0), 'beide Protokollpunkte tragen jetzt ein Erledigt-Visum', frei.proto);
ok(!frei.badges.some(b => /Monteur/.test(b)), 'die Live-Badges verschwinden nach der Freigabe', frei.badges);

console.log('— C2) Freigabe lässt offene Punkte offen —');
const teilFrei = await P.evaluate(async () => {
  // Zweite Liste: nur EIN Punkt erledigt → Freigabe darf den anderen nicht
  // als erledigt ins Protokoll schreiben.
  const st = _abState();
  st.items.forEach(i => { i.erledigt = ''; });
  const ml = { id: 'ml_test2', orgId: 'org_p', objektId: 'obj1', objektName: 'MFH', protoId: _abActiveProtoId(),
    monteurUserId: 'u_mont', monteurName: 'Max Monteur', verantwortlich: { userId: 'u_plan', name: 'Peter Planer' },
    status: 'abgearbeitet', erstelltAm: new Date().toISOString(),
    items: [ { id: 'a', itemId: st.items[0].id, ort: 'Bad EG', mangel: 'x', status: 'erledigt', erledigtAm: '2026-09-09T10:00:00Z', fixFotos: [] },
             { id: 'b', itemId: st.items[1].id, ort: 'Küche', mangel: 'y', status: 'offen', fixFotos: [] } ] };
  _abPoolSave('gema_abnahme_ml_pool_v1', 'abml:', ml);
  window.GemaDialog.confirm = () => Promise.resolve(true);
  window.GemaDialog.alert = () => Promise.resolve(true);
  window.abMlFreigeben('ml_test2');
  await new Promise(r => setTimeout(r, 700));
  const p = _abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === 'ml_test2');
  return { mlStatus: p.status, proto: (_abState().items || []).map(i => (i.erledigt || '').trim().length > 0) };
});
ok(teilFrei.proto[0] === true && teilFrei.proto[1] === false,
  'nur der abgehakte Punkt landet im Protokoll, der offene bleibt offen', teilFrei.proto);
ok(teilFrei.mlStatus === 'offen', 'die unvollständige Liste bleibt offen statt «freigegeben» zu heissen', teilFrei.mlStatus);

console.log('— C3) Quota-Fehler beim Cache-Write verliert kein Häkchen —');
const quota = await M.evaluate(async () => {
  const KEY = 'gema_abnahme_ml_pool_v1';
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (k === KEY) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
  try {
    const ml = { id: 'ml_q', orgId: 'org_p', objektId: 'obj1', objektName: 'Q', protoId: 'p', monteurUserId: 'u_mont',
      monteurName: 'Max Monteur', verantwortlich: { userId: 'u_plan', name: 'P' }, status: 'offen', erstelltAm: new Date().toISOString(),
      items: [ { id: 'q1', itemId: 'i1', ort: 'A', mangel: 'a', status: 'offen', fixFotos: [] },
               { id: 'q2', itemId: 'i2', ort: 'B', mangel: 'b', status: 'offen', fixFotos: [] } ] };
    _abPoolSave(KEY, 'abml:', ml);
    window.abMlItemToggle('ml_q', 'q1', true);
    await new Promise(r => setTimeout(r, 200));
    window.abMlItemToggle('ml_q', 'q2', true);
    await new Promise(r => setTimeout(r, 200));
    const p = (_abPoolRead(KEY) || []).find(r => r.id === 'ml_q');
    return p ? p.items.map(i => i.status) : ['weg'];
  } finally { Storage.prototype.setItem = orig; }
});
ok(quota.join(',') === 'erledigt,erledigt',
  'beide Häkchen überleben, obwohl der localStorage-Write scheitert', quota);

console.log('— C4) Leerer Cloud-Stand überschreibt kein gefülltes Protokoll —');
// Den echten, vom Modul gebildeten Protokoll-Record aus der Cloud übernehmen
// (der scopeKey kommt aus GemaObjekte.storageKey und wird hier NICHT geraten),
// dann die Cloud leeren und ein frisches Gerät mit genau diesem Cache öffnen.
const protoRow = [...CLOUD.entries()].find(([k]) => k.startsWith('abnahme|abproto:'));
ok(!!protoRow, 'Protokoll-Record für den Leer-Test vorhanden');
const protoRec = JSON.parse(JSON.stringify(protoRow[1].data));
protoRec.state.items = [{ id:'i_alt', ort:'Bad EG', mangel:'Wichtiger Mangel', typ:'mangel', photos:[], erledigt:'', teilweise:false }];
CLOUD.clear();
const cLeer = await ctxFor('u_plan', { gema_abnahme_proto_pool_v1: [protoRec] });
const Pleer = await open(cLeer, 'planer-leer');
const leer = await Pleer.evaluate(() => ({
  protos: (_abProtokolle() || []).length,
  items: (_abState().items || []).map(i => i.mangel)
}));
ok(leer.protos >= 1 && leer.items.indexOf('Wichtiger Mangel') >= 0,
  'ein leerer Cloud-Pull leert das lokale Protokoll NICHT', leer);
await Pleer.waitForTimeout(1500);
ok([...CLOUD.keys()].some(k => k.startsWith('abnahme|abproto:')),
  'stattdessen wird der lokale Stand hochgeschrieben', [...CLOUD.keys()]);

ok(errs.length === 0, 'keine JS-Fehler in beiden Kontexten', errs.slice(0, 3));

await browser.close(); srv.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
