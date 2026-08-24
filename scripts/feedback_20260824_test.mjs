// Feedback 24.08.2026 (Robin) — zwei Punkte:
//
//   «beim werkzeugmanagement soll wenn man einen koffer jemandem anderem
//    zuweist, soll gefragt werden ob alles was im koffer ist ebenfalls
//    anders zuegwiesen werden soll, bzw. dem neuen mitarbeiter.»
//
//   «standardmässig soll auf der handys die normale ansicht sein, nicht
//    die native, also für alle module»
//
// A) KOFFER-ZUWEISUNG → RUECKFRAGE ZUM INHALT (if_werkzeug.html)
//    A1  Zuweisung an eine Person → Dialog erscheint, Teile vorausgewaehlt
//    A2  «Nur der Koffer» laesst den Inhalt unangetastet (Gegenprobe zu A3)
//    A3  «Inhalt mitzuweisen» setzt ALLE gewaehlten Teile — als KOPIE, nie
//        als Referenz auf k.zugewiesenAn
//    A4  Abgewaehltes Teil bleibt unberuehrt (der Nutzer entscheidet pro Teil)
//    A5  Keine Frage, wenn der Inhalt bereits dieselbe Zuweisung traegt
//        (sonst kaeme der Dialog bei jedem Speichern)
//    A6  Einzelgeraet (kein Koffer) → gar keine Frage
//    A7  Platz-Zuweisung wandert mit (typ:'platz')
//    A8  Zuweisung ENTFERNEN fragt ebenfalls und loest den Inhalt
//    A9  Gesperrte Teile werden GENANNT statt still uebersprungen
//    A10 Koffer-Dialog: nur bei echter Zuteilungs-Aenderung fragen
//        (blosses Umbenennen darf nicht nerven) — beides geprueft
//    A11 EINE Sammel-Notifikation an die Person, nicht eine pro Geraet
//
// B) HANDY-STANDARD = KLASSISCHE WEB-ANSICHT (gema_native_mobil.js)
//    B1  Phone ohne Einstellung → klassisch (frueher: native)
//    B2  nativeAnsicht:true schaltet die native Ansicht ein
//    B3  nativeAnsicht:false bleibt klassisch
//    B4  Cache 'klassisch' ohne Profil-Flag bleibt klassisch
//        (die frühere «Heilung», die ihn auf native drehte, ist weg)
//    B5  Cache 'native' ohne Profil-Flag schaltet ein (sys_profil schreibt ihn mit)
//    B6  ?native=1 uebersteuert
//    B7  Desktop bleibt unberuehrt (Phone-only)
//    B8  Gilt fuer ALLE Module — zweites Modul als Gegenprobe
//    B9  sys_profil: Toggle startet AUS
//
// Aufruf:  CHROME=<chromium> node scripts/feedback_20260824_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8945;
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

// ── In-Memory-PostgREST ──────────────────────────────────────────────
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
  if (method === 'DELETE') {
    if (mkEq && dkEq) store.delete(mkEq + '|' + dkEq);
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

// ── Seeds ────────────────────────────────────────────────────────────
// Koffer k_kof: t_akku (unzugewiesen) + t_lade (bei Beat) + t_pend
// (Einbuchung ausstehend → gesperrt).  t_solo liegt in keinem Koffer.
const TOOLS = [
  { id: 't_1800000000001_akku', name: 'Akku 5.2Ah',  cat: 'ladegeraet',   brand: 'Hilti',  model: 'B22', bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_1800000000002_lade', name: 'Ladegerät',   cat: 'ladegeraet',   brand: 'Hilti',  model: 'C4',  bought: '2025-01-10', orgId: 'org_t',
    zugewiesenAn: { typ: 'user', userId: 'u_beat', name: 'Beat Bucher', seit: '2025-02-01' } },
  { id: 't_1800000000003_pend', name: 'Messgerät',   cat: 'messgeraet',   brand: 'Testo',  model: 'M1',  bought: '2025-01-10', orgId: 'org_t',
    einbuchung: { status: 'vorgeschlagen', lieferantId: 'l_1', lieferantFirma: 'Muster AG', eingebuchtAm: '2025-06-01' } },
  { id: 't_1800000000004_solo', name: 'Zange',       cat: 'handwerkzeug', brand: 'Knipex', model: 'K1',  bought: '2025-03-01', orgId: 'org_t' },
  { id: 'k_1800000000010_kof',  name: 'Bohrhammer-Set', cat: 'koffer', internKennung: 'KOF-01', bought: '2025-01-10', orgId: 'org_t',
    kofferInhalt: ['t_1800000000001_akku', 't_1800000000002_lade', 't_1800000000003_pend'] }
];
const AKKU = 't_1800000000001_akku', LADE = 't_1800000000002_lade',
      PEND = 't_1800000000003_pend', SOLO = 't_1800000000004_solo',
      KOF  = 'k_1800000000010_kof';

function seedStore() {
  store.clear();
  TOOLS.forEach(t => store.set('werkzeugmanagement|tool:' + t.id, { data: JSON.parse(JSON.stringify(t)), _lm: '2026-08-01T00:00:00Z' }));
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true };
const U_MAG  = { id: 'u_mag',  username: 'mag@t.ch',  name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
const U_ANNA = { id: 'u_anna', username: 'anna@t.ch', name: 'Anna Ammann', roleIds: ['role_monteur'],   orgId: 'org_t', active: true, profile: { email: 'anna@t.ch' } };
const U_BEAT = { id: 'u_beat', username: 'beat@t.ch', name: 'Beat Bucher', roleIds: ['role_monteur'],   orgId: 'org_t', active: true, profile: { email: 'beat@t.ch' } };
const ALLE_USER = [U_MAG, U_ANNA, U_BEAT];

// Standard-Test-User: EXPLIZIT klassisch, damit Teil A unabhaengig von
// Teil B laeuft (Teil B prueft den Default separat).
const klassisch = u => Object.assign({}, u, { profile: Object.assign({}, u.profile || {}, { nativeAnsicht: false }) });
const nativ     = u => Object.assign({}, u, { profile: Object.assign({}, u.profile || {}, { nativeAnsicht: true  }) });

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(opts) {
  opts = opts || {};
  const user = opts.user || klassisch(U_MAG);
  const users = (opts.users || ALLE_USER).map(u => (u.id === user.id ? user : u));
  const ctx = await browser.newContext(opts.viewport ? { viewport: opts.viewport, isMobile: !!opts.mobile, hasTouch: !!opts.mobile } : {});
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  const seed = {
    gema_orgs_v1: [ORG], gema_users_v1: users,
    gema_session_v1: { token: 'x.y.z', userId: user.id, expires: FUTURE },
    gema_coachmarks_done_if_werkzeug: '1',
    gema_coachmarks_done_if_fahrzeug: '1'
  };
  if (opts.extra) Object.assign(seed, opts.extra);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + (opts.seite || '/if_werkzeug.html') + (opts.query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  return { ctx, page };
}

// Zuweisung ueber die ECHTE Kette: openZuweisung → Tab → Feld → Speichern.
const zuweisen = (page, id, wahl) => page.evaluate(a => {
  openZuweisung(a.id);
  if (!document.getElementById('zuwUser')) return 'guard';
  if (a.platz !== undefined) { _wzZuwTab('platz'); document.getElementById('zuwPlatz').value = a.platz; }
  else { _wzZuwTab('user'); document.getElementById('zuwUser').value = a.user || ''; }
  _wzSaveZuweisung(a.id);
  return 'ok';
}, Object.assign({ id }, wahl));

// Zustand der Rueckfrage
const frage = page => page.evaluate(() => {
  const ov = document.getElementById('_wzModalOverlay');
  if (!ov) return { offen: false };
  const boxes = Array.from(ov.querySelectorAll('.kofZuwItem'));
  return {
    offen: /Inhalt mitzuweisen/.test(ov.textContent),
    text: ov.textContent,
    teile: boxes.map(b => ({ id: b.value, checked: b.checked })),
    knopf: !!Array.from(ov.querySelectorAll('button')).find(b => /Inhalt mitzuweisen|Zuweisung entfernen/.test(b.textContent))
  };
});
const zuw = (page, id) => page.evaluate(i => {
  const t = tools.find(x => x.id === i);
  return t && t.zugewiesenAn ? JSON.parse(JSON.stringify(t.zugewiesenAn)) : null;
}, id);

// ══════════════════════════════════════════════════════════════════
console.log('— A1/A2/A3) Koffer an Person: Frage, Abbruch, Uebernahme —');
{
  seedStore();
  const { ctx, page } = await openPage();

  ok((await zuweisen(page, KOF, { user: 'u_anna' })) === 'ok', 'Koffer wird Anna zugewiesen');
  await page.waitForTimeout(250);
  const f = await frage(page);
  ok(f.offen, 'A1 die Rueckfrage zum Inhalt erscheint');
  ok(/an Anna Ammann/.test(f.text), 'A1 sie nennt die neue Person im Klartext');
  ok(f.teile.length === 2, 'A1 die zwei aenderbaren Teile stehen zur Wahl (gesperrtes nicht)');
  ok(f.teile.every(t => t.checked), 'A1 alle Teile sind vorausgewaehlt');
  ok(f.knopf, 'A1 der Bestaetigungs-Knopf ist da');

  // A2 — «Nur der Koffer»
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#_wzModalOverlay button')).find(x => /Nur der Koffer/.test(x.textContent));
    b.click();
  });
  await page.waitForTimeout(300);
  ok((await zuw(page, KOF)).userId === 'u_anna', 'A2 der Koffer selbst ist zugewiesen');
  ok((await zuw(page, AKKU)) === null, 'A2 «Nur der Koffer» laesst das unzugewiesene Teil unberuehrt');
  ok((await zuw(page, LADE)).userId === 'u_beat', 'A2 und die fremde Zuweisung des zweiten Teils bleibt');

  // A3 — Gegenprobe: derselbe Weg mit «Inhalt mitzuweisen»
  await page.evaluate(() => { _wzKofferZuwFrage('k_1800000000010_kof'); });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#_wzModalOverlay button')).find(x => /Inhalt mitzuweisen/.test(x.textContent));
    b.click();
  });
  await page.waitForTimeout(350);
  const zAkku = await zuw(page, AKKU), zLade = await zuw(page, LADE);
  ok(zAkku && zAkku.userId === 'u_anna', 'A3 Teil 1 ist jetzt Anna zugewiesen');
  ok(zLade && zLade.userId === 'u_anna', 'A3 Teil 2 wurde von Beat auf Anna umgezogen');
  ok(zAkku.name === 'Anna Ammann' && zAkku.typ === 'user', 'A3 Zuweisung vollstaendig (typ + Name)');
  ok((await zuw(page, PEND)) === null, 'A3 das gesperrte Teil blieb unangetastet');

  // Kopie statt Referenz — sonst zoege eine spaetere Aenderung am Teil den Koffer mit
  const geteilt = await page.evaluate(() => {
    const k = tools.find(x => x.id === 'k_1800000000010_kof');
    const t = tools.find(x => x.id === 't_1800000000001_akku');
    return t.zugewiesenAn === k.zugewiesenAn;
  });
  ok(!geteilt, 'A3 die Teil-Zuweisung ist eine KOPIE, nicht die Referenz des Koffers');

  // A11 — genau EINE Sammel-Notifikation an Anna (zusaetzlich zur Koffer-Meldung)
  const notify = await page.evaluate(() => {
    const raw = localStorage.getItem('gema_notifications_v1') || '[]';
    let list = []; try { list = JSON.parse(raw); } catch (e) {}
    return list.filter(n => n.empfaengerUserId === 'u_anna').map(n => n.titel || '');
  });
  ok(notify.filter(t => /Koffer-Inhalt zugewiesen/.test(t)).length === 1, 'A11 genau EINE Sammel-Notifikation fuer den Inhalt');
  ok(page.errs.length === 0, 'keine pageerrors: ' + page.errs.join(' | '));
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— A4/A5) Teil abwaehlen · keine Frage bei passendem Inhalt —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await zuweisen(page, KOF, { user: 'u_anna' });
  await page.waitForTimeout(250);
  // Nur das erste Teil angehakt lassen
  await page.evaluate(() => {
    const cbs = Array.from(document.querySelectorAll('.kofZuwItem'));
    cbs[1].checked = false;
    Array.from(document.querySelectorAll('#_wzModalOverlay button')).find(x => /Inhalt mitzuweisen/.test(x.textContent)).click();
  });
  await page.waitForTimeout(350);
  ok((await zuw(page, AKKU)).userId === 'u_anna', 'A4 das angehakte Teil wurde geaendert');
  ok((await zuw(page, LADE)).userId === 'u_beat', 'A4 das abgewaehlte Teil blieb bei Beat');

  // A5 — Inhalt passt jetzt teilweise; nach dem Nachziehen von Beat gar nicht mehr fragen
  await page.evaluate(() => {
    const t = tools.find(x => x.id === 't_1800000000002_lade');
    t.zugewiesenAn = { typ: 'user', userId: 'u_anna', name: 'Anna Ammann', seit: '2025-02-01' };
  });
  await zuweisen(page, KOF, { user: 'u_anna' });   // dieselbe Zuweisung nochmals speichern
  await page.waitForTimeout(300);
  const f2 = await frage(page);
  ok(!f2.offen, 'A5 keine Frage, wenn der Inhalt bereits dieselbe Zuweisung traegt');
  // …aber das gesperrte Teil wird trotzdem GENANNT (Hinweis statt Modal,
  // weil es hier nichts zu entscheiden gaebe)
  // der JÜNGSTE Toast (ein älterer aus A4 kann noch stehen)
  const toast = await page.evaluate(() => {
    const el = Array.from(document.body.children).filter(x => x.style && x.style.zIndex === '12600').pop();
    return el ? el.textContent : '';
  });
  ok(/nicht mitgeändert/.test(toast) && /Einbuchung/.test(toast), 'A5 das gesperrte Teil wird dabei als Hinweis genannt');

  // A6 — Einzelgeraet loest nie eine Frage aus
  await zuweisen(page, SOLO, { user: 'u_anna' });
  await page.waitForTimeout(300);
  ok(!(await frage(page)).offen, 'A6 ein Werkzeug ohne Koffer fragt gar nichts');
  ok((await zuw(page, SOLO)).userId === 'u_anna', 'A6 es wurde trotzdem normal zugewiesen');
  ok(page.errs.length === 0, 'keine pageerrors: ' + page.errs.join(' | '));
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— A7/A8) Platz-Zuweisung · Zuweisung entfernen —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await zuweisen(page, KOF, { platz: 'Lager Halle B' });
  await page.waitForTimeout(250);
  const fp = await frage(page);
  ok(fp.offen, 'A7 auch die Platz-Zuweisung fragt nach dem Inhalt');
  ok(/an den Platz «Lager Halle B»/.test(fp.text), 'A7 der Platz steht im Klartext im Dialog');
  await page.evaluate(() => Array.from(document.querySelectorAll('#_wzModalOverlay button')).find(x => /Inhalt mitzuweisen/.test(x.textContent)).click());
  await page.waitForTimeout(350);
  const za = await zuw(page, AKKU);
  ok(za && za.typ === 'platz' && za.platz === 'Lager Halle B', 'A7 der Inhalt liegt jetzt am selben Platz');

  // A8 — Zuweisung entfernen
  await zuweisen(page, KOF, { user: '' });
  await page.waitForTimeout(250);
  const fl = await frage(page);
  ok(fl.text && /Zuweisung der Werkzeuge im Koffer ebenfalls entfernt/.test(fl.text), 'A8 beim Entfernen fragt der Dialog entsprechend');
  await page.evaluate(() => Array.from(document.querySelectorAll('#_wzModalOverlay button')).find(x => /Zuweisung entfernen/.test(x.textContent)).click());
  await page.waitForTimeout(350);
  ok((await zuw(page, KOF)) === null && (await zuw(page, AKKU)) === null, 'A8 Koffer und Inhalt sind wieder frei');
  ok(page.errs.length === 0, 'keine pageerrors: ' + page.errs.join(' | '));
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— A9) Gesperrte Teile werden GENANNT —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await zuweisen(page, KOF, { user: 'u_anna' });
  await page.waitForTimeout(250);
  const f = await frage(page);
  ok(/Messgerät/.test(f.text), 'A9 das gesperrte Teil wird namentlich genannt');
  ok(/Einbuchung noch nicht akzeptiert/.test(f.text), 'A9 mit dem Grund — nicht still uebersprungen');
  ok(!f.teile.some(t => t.id === PEND), 'A9 und es steht bewusst NICHT zur Auswahl');
  await page.evaluate(() => Array.from(document.querySelectorAll('#_wzModalOverlay button')).find(x => /Inhalt mitzuweisen/.test(x.textContent)).click());
  await page.waitForTimeout(350);
  ok((await zuw(page, PEND)) === null, 'A9 auch nach dem Bestaetigen bleibt es unangetastet');
  ok(page.errs.length === 0, 'keine pageerrors: ' + page.errs.join(' | '));
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— A10) Koffer-Dialog: nur bei echter Zuteilungs-Aenderung —');
{
  seedStore();
  const { ctx, page } = await openPage();

  // Umbenennen OHNE Zuteilungs-Aenderung → keine Frage
  await page.evaluate(() => {
    openKofferForm('k_1800000000010_kof');
    document.getElementById('kofName').value = 'Bohrhammer-Set NEU';
    _wzSaveKofferForm('k_1800000000010_kof');
  });
  await page.waitForTimeout(350);
  ok(!(await frage(page)).offen, 'A10 blosses Umbenennen fragt nicht nach dem Inhalt');
  ok(await page.evaluate(() => tools.find(x => x.id === 'k_1800000000010_kof').name === 'Bohrhammer-Set NEU'), 'A10 der neue Name ist gespeichert');

  // Jetzt mit Zuteilung → Frage
  await page.evaluate(() => {
    openKofferForm('k_1800000000010_kof');
    document.getElementById('kofZuw').value = 'u:u_anna';
    _wzSaveKofferForm('k_1800000000010_kof');
  });
  await page.waitForTimeout(350);
  const f = await frage(page);
  ok(f.offen, 'A10 eine echte Zuteilung im Koffer-Dialog fragt nach dem Inhalt');
  await page.evaluate(() => Array.from(document.querySelectorAll('#_wzModalOverlay button')).find(x => /Inhalt mitzuweisen/.test(x.textContent)).click());
  await page.waitForTimeout(350);
  ok((await zuw(page, AKKU)).userId === 'u_anna', 'A10 und der Inhalt wandert mit');
  ok(page.errs.length === 0, 'keine pageerrors: ' + page.errs.join(' | '));
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— B) Handy-Standard = klassische Web-Ansicht —');
const PHONE = { viewport: { width: 390, height: 844 }, mobile: true };
// Der native Screen-Container wird EINMAL angelegt und per display
// ein-/ausgeblendet — «existiert» sagt also nichts; gemessen wird die Sicht.
const sicht = page => page.evaluate(() => ({
  nativAn: document.documentElement.classList.contains('gn-native-on'),
  screen: (() => { const g = document.querySelector('.gn.gn--page'); return !!g && getComputedStyle(g).display !== 'none'; })(),
  navSichtbar: (() => { const n = document.querySelector('.g-nav'); return !!n && getComputedStyle(n).display !== 'none'; })(),
  pref: (typeof GemaNativeMobil !== 'undefined') ? GemaNativeMobil.pref() : '?',
  enabled: (typeof GemaNativeMobil !== 'undefined') ? GemaNativeMobil.enabled() : null
}));

{
  // B1 — Phone, User OHNE nativeAnsicht-Flag
  seedStore();
  const ohneFlag = { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
  const { ctx, page } = await openPage(Object.assign({ user: ohneFlag, users: [ohneFlag, U_ANNA, U_BEAT] }, PHONE));
  const s = await sicht(page);
  ok(s.pref === 'klassisch', 'B1 Standard-Einstellung ist «klassisch»');
  ok(!s.enabled, 'B1 die native Ansicht ist damit AUS');
  ok(!s.nativAn && !s.screen, 'B1 kein gn-native-on, kein nativer Screen');
  ok(s.navSichtbar, 'B1 die klassische Navigation ist da');
  ok(page.errs.length === 0, 'keine pageerrors: ' + page.errs.join(' | '));
  await ctx.close();
}
{
  // B2/B3 — die Einstellung entscheidet
  seedStore();
  const a = await openPage(Object.assign({ user: nativ(U_MAG) }, PHONE));
  const sa = await sicht(a.page);
  ok(sa.enabled && sa.nativAn && sa.screen, 'B2 nativeAnsicht:true schaltet die App-Ansicht ein');
  ok(!sa.navSichtbar, 'B2 die klassische Nav ist dann ausgeblendet');
  await a.ctx.close();

  seedStore();
  const b = await openPage(Object.assign({ user: klassisch(U_MAG) }, PHONE));
  const sb = await sicht(b.page);
  ok(!sb.enabled && !sb.nativAn, 'B3 nativeAnsicht:false bleibt klassisch');
  await b.ctx.close();
}
{
  // B4 — Cache 'klassisch' ohne Profil-Flag: bleibt klassisch.
  // Frueher drehte eine «Heilung» genau diesen Fall auf native.
  seedStore();
  const ohneFlag = { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
  const { ctx, page } = await openPage(Object.assign({ user: ohneFlag, users: [ohneFlag, U_ANNA, U_BEAT], extra: { gema_native_view_v1: 'klassisch' } }, PHONE));
  const s = await sicht(page);
  ok(!s.enabled, 'B4 Cache «klassisch» ohne Profil-Flag bleibt klassisch (keine Heilung mehr)');
  ok(await page.evaluate(() => localStorage.getItem('gema_native_view_v1') === 'klassisch'), 'B4 der Cache wird dabei nicht umgeschrieben');
  await ctx.close();
}
{
  // B5 — Cache 'native' ohne Profil-Flag (sys_profil schreibt ihn beim Speichern mit)
  seedStore();
  const ohneFlag = { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
  const { ctx, page } = await openPage(Object.assign({ user: ohneFlag, users: [ohneFlag, U_ANNA, U_BEAT], extra: { gema_native_view_v1: 'native' } }, PHONE));
  ok((await sicht(page)).enabled, 'B5 Cache «native» schaltet ein (greift vor dem Profil-Load)');
  await ctx.close();
}
{
  // B6 — URL-Override fuer Tests/Support
  seedStore();
  const ohneFlag = { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
  const { ctx, page } = await openPage(Object.assign({ user: ohneFlag, users: [ohneFlag, U_ANNA, U_BEAT], query: '?native=1' }, PHONE));
  ok((await sicht(page)).enabled, 'B6 ?native=1 uebersteuert den Standard');
  await ctx.close();
}
{
  // B7 — Desktop bleibt unberuehrt (die Umstellung ist Phone-only)
  seedStore();
  const { ctx, page } = await openPage({ user: nativ(U_MAG) });
  const s = await sicht(page);
  ok(!s.enabled && !s.nativAn, 'B7 auf dem Desktop gibt es die native Ansicht ohnehin nicht');
  ok(s.navSichtbar, 'B7 die Desktop-Ansicht ist unveraendert');
  await ctx.close();
}
{
  // B8 — «für alle Module»: zweites Modul als Gegenprobe
  seedStore();
  const ohneFlag = { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
  const a = await openPage(Object.assign({ user: ohneFlag, users: [ohneFlag, U_ANNA, U_BEAT], seite: '/if_fahrzeug.html' }, PHONE));
  const sa = await sicht(a.page);
  ok(!sa.enabled && !sa.nativAn, 'B8 Fahrzeugmanagement auf dem Phone: klassisch');
  await a.ctx.close();

  seedStore();
  const b = await openPage(Object.assign({ user: nativ(U_MAG), seite: '/if_fahrzeug.html' }, PHONE));
  ok((await sicht(b.page)).enabled, 'B8 Gegenprobe: mit Einstellung ist es dort ebenfalls nativ');
  await b.ctx.close();
}
{
  // B9 — sys_profil: der Toggle startet AUS
  seedStore();
  const ohneFlag = { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
  const { ctx, page } = await openPage({ user: ohneFlag, users: [ohneFlag, U_ANNA, U_BEAT], seite: '/sys_profil.html' });
  await page.waitForTimeout(600);
  const t = await page.evaluate(() => {
    const el = document.getElementById('togNativeView');
    return { da: !!el, an: !!el && el.classList.contains('on'), txt: (el && el.closest('.toggle-row') ? el.closest('.toggle-row').textContent : '') };
  });
  ok(t.da, 'B9 der Toggle «App-Ansicht» existiert');
  ok(!t.an, 'B9 er startet AUS (Standard = klassische Web-Ansicht)');
  ok(/Standardmässig aus/.test(t.txt), 'B9 und der Beschreibungstext sagt es');

  // Gegenprobe: mit gesetztem Flag ist er an
  await ctx.close();
  const b = await openPage({ user: nativ(U_MAG), seite: '/sys_profil.html' });
  await b.page.waitForTimeout(600);
  ok(await b.page.evaluate(() => document.getElementById('togNativeView').classList.contains('on')), 'B9 Gegenprobe: mit Einstellung ist er an');
  await b.ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
