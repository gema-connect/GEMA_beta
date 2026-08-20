// Drift-Guard Feedback 19.08.2026
// ─────────────────────────────────────────────────────────────────────────
// Teil A — Chat-Erweiterung (gema_chat.js):
//   Kontextmenü (Rechtsklick auf einen Chat): Favorit, ungelesen/gelesen,
//   Kategorie (Farbe), löschen (WhatsApp-Semantik: weg-Marker im EIGENEN
//   chatread-Record — Gegenseite behält den Verlauf, neue Nachricht bringt
//   den Chat zurück). Kontakt-Picker NUR mit Berührungspunkten + E-Mail-Weg.
//   Chat-Einstellungen (chatprefs:cp_<uid>): Kategorien-Editor (GEMA-
//   Defaults, id bleibt beim Umbenennen stabil), Firmenfarben-Hintergrund
//   (Standard AN, ~90% Weiss gemischt), Enter-Verhalten, Schriftgrösse,
//   Favoriten zuoberst. KRITISCH: _metaSet/_markRead MERGEN in den
//   chatread-Record (fav/kat/weg überleben das Lesen).
// Teil B — Workspace: Snip erfasst Embed-iframe (gema_feedback.js)
// Teil C — Workspace: Dashboard-Eimer mit Rubrik-Sprungzeilen
// Teil D — Lieferanten-Dashboard: Produkteditor/Produktliste/Kennlinie
// Teil E — Wärmepumpe: Hersteller/Typ + Anlagenschema
// Teil F — Abnahme: Fachbauleitung fix, SIA-Texte, Checkliste nur Sicht
// Teil G — Warmwasser: RaR-Material VL/RL, Tabelle=Diagramm, Layout
//
// Ausführen (Repo-Root):
//   CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node scripts/feedback_20260819_test.mjs [A|B|C|D|E|F|G]
import { readFile } from 'fs/promises';
import { join } from 'path';
import { chromium } from 'playwright-core';
import { startServer, ROOT, BASE, wireRoutes, seed, newPage } from './rolematrix_harness.mjs';

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + String(info).slice(0, 200) : '')); }
}
const NUR = (process.argv[2] || '').toUpperCase();
const will = s => !NUR || NUR === s;

// ── In-Memory-PostgREST-Mock (Muster immobilien_smoke_test) ──────────────
function pgMock(db) {
  return route => {
    const req = route.request();
    const u = new URL(req.url());
    const method = req.method();
    if (method === 'GET') {
      const mk = (u.searchParams.get('module_key') || '').replace(/^eq\./, '');
      const dk = u.searchParams.get('data_key') || '';
      let rows = [...db.values()].filter(r => r.module_key === mk);
      if (dk.startsWith('eq.')) { const k = dk.slice(3); rows = rows.filter(r => r.data_key === k); }
      else if (dk.startsWith('like.')) { const p = dk.slice(5).replace(/\*$/, ''); rows = rows.filter(r => r.data_key.startsWith(p)); }
      rows.sort((a, b) => (a.data_key < b.data_key ? -1 : 1));
      const off = parseInt(u.searchParams.get('offset') || '0', 10);
      const lim = parseInt(u.searchParams.get('limit') || '1000', 10);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows.slice(off, off + lim)) });
    }
    if (method === 'POST') {
      let body = [];
      try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
      (Array.isArray(body) ? body : [body]).forEach(r => { if (r && r.data_key) db.set(r.module_key + '|' + r.data_key, r); });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (method === 'DELETE') return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  };
}

function testJwt(uid, org) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ iat: now, exp: now + 30 * 86400, uid, org, role: 'authenticated' }) + '.t';
}
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();

// ═════════════════════════════════════════════════════════════════════════
// Teil A0 — Chat statisch (Node, ohne Browser)
// ═════════════════════════════════════════════════════════════════════════
async function teilA0() {
  console.log('\n── Teil A0: Chat statisch (Node) ──');
  const src = await readFile(join(ROOT, 'gema_chat.js'), 'utf8');
  // Aufruf-Form prüfen (".persistCollection(") — der Header-KOMMENTAR nennt
  // die Regel «NIE persistCollection» und darf das Wort natürlich tragen.
  check('A0.1 kein persistCollection-AUFRUF im Chat (cross-org Pools)', !/\.persistCollection\s*\(/.test(src));
  check('A0.2 _markRead läuft über _metaSet (Merge, nie Record ersetzen)', /_markRead\(tid\)\{_metaSet\(tid,\{ts:_now\(\),ungelesen:null\}\);\}/.test(src.replace(/\s+/g, '')));
  check('A0.3 chatprefs via loadRecord (NIE bindCollection für Prefs)', /GemaSync\.loadRecord\(MK,PREFS_PREFIX/.test(src) && !/bindCollection\(MK,PREFS_CACHE/.test(src));
  check('A0.4 weg-Filter in _myThreads (WhatsApp-Semantik)', /if\(!m\.weg\)return true;/.test(src) && /String\(t\.letzte\.ts\)>String\(m\.weg\)/.test(src));
  // Pure Helpers in Node evaluieren
  const store = {};
  global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const fn = new Function('window', 'document', 'localStorage', 'sessionStorage', src + ';return window.GemaChat;');
  const GC = fn({ location: { search: '' } }, null, global.localStorage, { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  check('A0.5 mixWhite: grüne Primärfarbe wird sanft (~90% Weiss)', GC._pure.mixWhite('#16a34a', 0.9) === 'rgb(232,246,237)');
  check('A0.6 mixWhite: ungültige Farbe → "" (kein erfundener Ton)', GC._pure.mixWhite('gruen', 0.9) === '' && GC._pure.mixWhite('', 0.9) === '');
  const taken = {};
  check('A0.7 katSlug: Umlaute → ae/oe/ue, Kollision → Suffix', GC._pure.katSlug('Später', taken) === 'spaeter' && GC._pure.katSlug('Später', taken) === 'spaeter_2');
  const katSrc = src.match(/var KAT_DEFAULTS=\[[\s\S]*?\];/);
  check('A0.8 KAT_DEFAULTS: 6 GEMA-Standardkategorien mit Farben', !!katSrc && (katSrc[0].match(/id:'/g) || []).length === 6 && (katSrc[0].match(/farbe:'#/g) || []).length === 6);
  check('A0.9 Kontakt-Picker filtert auf Berührungspunkte (kon.ids)', /kon\.ids\[u\.id\]/.test(src));
  check('A0.10 Standard: Hintergrund Firmenfarbe AN', /hintergrund:'primaer'/.test(src));
}

// ═════════════════════════════════════════════════════════════════════════
// Teil A — Chat im Browser
// ═════════════════════════════════════════════════════════════════════════
const CHAT_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>chattest</title></head>
<body>
<nav class="g-nav"><div class="g-nav-actions"><button id="feedbackBtn">FB</button></div></nav>
<div id="app">chattest</div>
<script src="/gema_sync.js"></script>
<script src="/gema_auth.js"></script>
<script src="/gema_dialog.js"></script>
<script src="/gema_chat.js"></script>
</body></html>`;

function chatSeed(db) {
  const NAMEN = { u_test: 'Robin Test', u_zwei: 'Zora Zwei', u_vier: 'Vera Vier' };
  const T = (id, mit, letzte) => ({
    id, key: mit.slice().sort().join(',') + '|direkt',
    teilnehmerIds: mit.slice().sort(),
    teilnehmer: mit.map(u => ({ userId: u, name: NAMEN[u] || u, firma: '', rolle: '' })),
    kontext: null, erstelltVon: 'u_test', erstelltAm: '2026-08-01T08:00:00.000Z',
    letzte, updatedAt: (letzte && letzte.ts) || '2026-08-01T08:00:00.000Z'
  });
  const t1 = T('t1', ['u_test', 'u_zwei'], { text: 'Hallo Robin', von: 'u_zwei', vonName: 'Zora Zwei', ts: '2026-08-19T07:00:00.000Z' });
  const t2 = T('t2', ['u_test', 'u_vier'], { text: 'Offerte ist da', von: 'u_vier', vonName: 'Vera Vier', ts: '2026-08-18T10:00:00.000Z' });
  db.set('chat|chat:t1', { module_key: 'chat', data_key: 'chat:t1', payload: { data: t1, _lm: t1.updatedAt } });
  db.set('chat|chat:t2', { module_key: 'chat', data_key: 'chat:t2', payload: { data: t2, _lm: t2.updatedAt } });
  return {
    gema_orgs_v1: [
      { id: 'org_test', name: 'Testfirma AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_test'], active: true, settings: { pdfFarben: { primary: '#16a34a' } } },
      { id: 'org_b', name: 'Partner GmbH', kategorie: 'unternehmer', kategorien: ['unternehmer'], admins: [], active: true }
    ],
    gema_users_v1: [
      { id: 'u_test', username: 'u@test.ch', name: 'Robin Test', roleIds: ['role_admin'], orgId: 'org_test', active: true, profile: { email: 'u@test.ch' } },
      { id: 'u_zwei', username: 'zwei@test.ch', name: 'Zora Zwei', roleIds: ['role_planer'], orgId: 'org_test', active: true, profile: { email: 'zwei@test.ch' } },
      { id: 'u_vier', username: 'vier@partner.ch', name: 'Vera Vier', roleIds: ['role_unternehmer'], orgId: 'org_b', active: true, profile: { email: 'vier@partner.ch' } },
      { id: 'u_drei', username: 'drei@partner.ch', name: 'Doris Drei', roleIds: ['role_unternehmer'], orgId: 'org_b', active: true, profile: { email: 'drei@partner.ch' } }
    ],
    gema_session_v1: { userId: 'u_test', expires: FUTURE, token: testJwt('u_test', 'org_test') },
    gema_chat_threads_pool_v1: [db.get('chat|chat:t1').payload.data, db.get('chat|chat:t2').payload.data]
  };
}

async function teilA(browser) {
  console.log('\n── Teil A: Chat im Browser ──');
  const db = new Map();
  const seedObj = chatSeed(db);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await wireRoutes(ctx);
  await ctx.route('**/rest/v1/gema_data**', pgMock(db));
  await ctx.route('**/__chattest.html', r => r.fulfill({ contentType: 'text/html', body: CHAT_HTML }));
  await ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seedObj);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 160)));
  await page.goto(BASE + '/__chattest.html');
  await page.waitForFunction(() => window.GemaChat && GemaChat._debug().booted, null, { timeout: 8000 });

  // A1 — Badge zählt beide ungelesenen Threads
  check('A1 Badge: 2 ungelesene Threads', await page.evaluate(() => GemaChat.unreadCount()) === 2);

  // A2 — Liste öffnen
  await page.evaluate(() => GemaChat.toggle());
  await page.waitForSelector('.gc-panel.open .gc-row[data-tid]', { timeout: 5000 });
  await page.waitForTimeout(350); // initialer _pullMeta/_pullPrefs
  check('A2 Liste zeigt 2 Chats', await page.locator('.gc-row[data-tid]').count() === 2);

  // A3 — Kontextmenü per Rechtsklick
  await page.click('.gc-row[data-tid="t2"]', { button: 'right' });
  await page.waitForSelector('.gc-ctxmenu', { timeout: 3000 });
  const menuTxt = await page.locator('.gc-ctxmenu').innerText();
  check('A3.1 Menü: Favorit / ungelesen / löschen', menuTxt.includes('Als Favorit markieren') && menuTxt.includes('Als gelesen markieren') && menuTxt.includes('Chat löschen'));
  check('A3.2 Menü: 6 Standard-Kategorien mit Farbpunkt', await page.locator('.gc-ctxmenu .gc-katdot').count() === 6 && menuTxt.includes('Wichtig') && menuTxt.includes('Später'));

  // A4 — Favorit setzen → t2 rutscht nach oben (Favoriten zuoberst)
  await page.click('.gc-ctxmenu button:has-text("Als Favorit markieren")');
  await page.waitForTimeout(150);
  check('A4.1 Favorit: ★ am Chat', await page.locator('.gc-row[data-tid="t2"] .gc-fav').count() === 1);
  check('A4.2 Favorit zuoberst (t2 vor t1 trotz älterer Nachricht)', await page.evaluate(() => document.querySelector('.gc-row[data-tid]').getAttribute('data-tid')) === 't2');
  check('A4.3 Favorit in der Cloud (chatread-Record)', (db.get('chat|chatread:cr_t2_u_test') || {}).payload?.data?.fav === true);

  // A5 — Kategorie zuweisen
  await page.click('.gc-row[data-tid="t2"]', { button: 'right' });
  await page.waitForSelector('.gc-ctxmenu');
  await page.click('.gc-ctxmenu button:has-text("Wichtig")');
  await page.waitForTimeout(150);
  const rowStyle = await page.evaluate(() => document.querySelector('.gc-row[data-tid="t2"]').getAttribute('style') || '');
  check('A5.1 Kategorie-Farbbalken am Chat (#dc2626)', rowStyle.includes('#dc2626'));
  check('A5.2 Filter-Chips erscheinen (Alle / ★ / Wichtig)', await page.locator('.gc-filter .gc-chip').count() >= 3);

  // A6 — Kategorie-Filter
  await page.click('.gc-chip[data-f="kat:wichtig"]');
  await page.waitForTimeout(120);
  check('A6.1 Filter «Wichtig»: nur t2', await page.locator('.gc-row[data-tid]').count() === 1 && await page.locator('.gc-row[data-tid="t2"]').count() === 1);
  await page.click('.gc-chip[data-f=""]');
  await page.waitForTimeout(120);
  check('A6.2 Filter «Alle»: beide wieder da', await page.locator('.gc-row[data-tid]').count() === 2);

  // A7 — Als gelesen markieren: MERGE-Beweis (fav+kat überleben)
  await page.click('.gc-row[data-tid="t2"]', { button: 'right' });
  await page.waitForSelector('.gc-ctxmenu');
  await page.click('.gc-ctxmenu button:has-text("Als gelesen markieren")');
  await page.waitForTimeout(150);
  const recT2 = (db.get('chat|chatread:cr_t2_u_test') || {}).payload?.data || {};
  check('A7.1 gelesen: unreadCount sinkt auf 1', await page.evaluate(() => GemaChat.unreadCount()) === 1);
  check('A7.2 MERGE: ts gesetzt UND fav/kat überleben', !!recT2.ts && recT2.fav === true && recT2.kat === 'wichtig');

  // A8 — Als ungelesen markieren (manuell)
  await page.click('.gc-row[data-tid="t1"]', { button: 'right' });
  await page.waitForSelector('.gc-ctxmenu');
  await page.click('.gc-ctxmenu button:has-text("Als gelesen markieren")');
  await page.waitForTimeout(150);
  check('A8.1 t1 gelesen: unreadCount 0', await page.evaluate(() => GemaChat.unreadCount()) === 0);
  await page.click('.gc-row[data-tid="t1"]', { button: 'right' });
  await page.waitForSelector('.gc-ctxmenu');
  await page.click('.gc-ctxmenu button:has-text("Als ungelesen markieren")');
  await page.waitForTimeout(150);
  check('A8.2 manuell ungelesen: zählt im Badge', await page.evaluate(() => GemaChat.unreadCount()) === 1);
  check('A8.3 manuell ungelesen trotz Lesestand (Merge)', await page.evaluate(() => { const m = GemaChat._hooks.meta('t1'); return m.ungelesen === true && !!m.ts; }));

  // A9 — Chat löschen (ehrlicher Dialog, weg-Marker, Verlauf bleibt)
  await page.click('.gc-row[data-tid="t1"]', { button: 'right' });
  await page.waitForSelector('.gc-ctxmenu');
  await page.click('.gc-ctxmenu button:has-text("Chat löschen")');
  await page.waitForSelector('.gema-dlg', { timeout: 3000 });
  const dlgTxt = await page.locator('.gema-dlg').innerText();
  check('A9.1 Lösch-Dialog sagt die Wahrheit (Gegenseite behält Verlauf)', dlgTxt.includes('Gegenseite behält') && dlgTxt.includes('erscheint er samt Verlauf wieder'));
  await page.click('.gema-dlg .gema-dlg-danger[data-act="ok"]');
  await page.waitForTimeout(200);
  check('A9.2 Chat aus der Liste entfernt', await page.locator('.gc-row[data-tid="t1"]').count() === 0);
  check('A9.3 Thread-Record bleibt (nur weg-Marker im chatread)', await page.evaluate(() => {
    const th = JSON.parse(localStorage.getItem('gema_chat_threads_pool_v1') || '[]');
    const m = GemaChat._hooks.meta('t1');
    return th.some(t => t.id === 't1') && !!m.weg;
  }));
  check('A9.4 gelöschter Chat zählt nicht mehr als ungelesen', await page.evaluate(() => GemaChat.unreadCount()) === 0);

  // A10 — neue Nachricht bringt den gelöschten Chat zurück.
  // KRITISCH: die Mock-DB MITZIEHEN — der 45-s-Meta-Poll (bindCollection)
  // überschreibt localStorage sonst mitten im Test wieder mit dem alten
  // letzte.ts und der weg-Filter versteckt t1 erneut (Flake).
  const neueLetzte = { text: 'Bist du noch da?', von: 'u_zwei', vonName: 'Zora Zwei', ts: new Date().toISOString() };
  {
    const row = db.get('chat|chat:t1');
    const t = row.payload.data;
    t.letzte = neueLetzte; t.updatedAt = neueLetzte.ts;
    db.set('chat|chat:t1', row);
  }
  await page.evaluate((letzte) => {
    const th = JSON.parse(localStorage.getItem('gema_chat_threads_pool_v1') || '[]');
    const t = th.find(x => x.id === 't1');
    t.letzte = letzte; t.updatedAt = letzte.ts;
    localStorage.setItem('gema_chat_threads_pool_v1', JSON.stringify(th));
    GemaChat._hooks.renderList();
  }, neueLetzte);
  await page.waitForTimeout(120);
  check('A10 neue Nachricht → Chat erscheint wieder + ungelesen', await page.locator('.gc-row[data-tid="t1"]').count() === 1 && await page.evaluate(() => GemaChat.unreadCount()) === 1);

  // A11 — Öffnen löst den weg-Marker + Firmenfarben-Hintergrund (Standard AN)
  await page.click('.gc-row[data-tid="t1"]');
  await page.waitForSelector('#gcMsgs', { timeout: 3000 });
  check('A11.1 Öffnen räumt den weg-Marker (bleibt in der Liste)', await page.evaluate(() => !GemaChat._hooks.meta('t1').weg));
  const bg1 = await page.evaluate(() => getComputedStyle(document.getElementById('gcMsgs')).backgroundColor);
  check('A11.2 Hintergrund = sanfte Firmen-Primärfarbe (Standard AN)', bg1 === 'rgb(232, 246, 237)', bg1);

  // A12 — Einstellungen: Hintergrund abschalten → Standard-Grund
  await page.click('.gc-panel [data-act="back"]');
  await page.waitForSelector('[data-act="set"]');
  await page.click('[data-act="set"]');
  await page.waitForSelector('#gsBg', { timeout: 3000 });
  check('A12.1 Einstellungen: Hintergrund-Toggle standardmässig AN', await page.isChecked('#gsBg'));
  await page.uncheck('#gsBg');
  await page.waitForTimeout(150);
  const prefsLS = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_chat_prefs_v1') || 'null'));
  check('A12.2 Prefs lokal gespeichert (hintergrund=standard)', prefsLS && prefsLS.hintergrund === 'standard' && prefsLS.userId === 'u_test');
  check('A12.3 Prefs in der Cloud (chatprefs:cp_u_test)', (db.get('chat|chatprefs:cp_u_test') || {}).payload?.data?.hintergrund === 'standard');
  await page.click('.gc-panel [data-act="back"]');
  await page.click('.gc-row[data-tid="t2"]');
  await page.waitForSelector('#gcMsgs');
  const bg2 = await page.evaluate(() => getComputedStyle(document.getElementById('gcMsgs')).backgroundColor);
  check('A12.4 Hintergrund abgeschaltet → Standard-Grund', bg2 === 'rgb(233, 226, 214)', bg2);

  // A13 — Kategorien-Editor: umbenennen (id stabil), ergänzen, löschen
  await page.click('.gc-panel [data-act="back"]');
  await page.click('[data-act="set"]');
  await page.waitForSelector('#gsKats .gc-kat-row');
  check('A13.1 Editor zeigt die 6 GEMA-Standardkategorien', await page.locator('#gsKats .gc-kat-row').count() === 6);
  await page.fill('#gsKats .gc-kat-row[data-id="wichtig"] input[type="text"]', 'Dringend');
  await page.dispatchEvent('#gsKats .gc-kat-row[data-id="wichtig"] input[type="text"]', 'change');
  await page.waitForTimeout(150);
  check('A13.2 Umbenennen: id bleibt stabil (wichtig → Name «Dringend»)', await page.evaluate(() => {
    const k = GemaChat._hooks.kats();
    return k.length === 6 && k[0].id === 'wichtig' && k[0].name === 'Dringend';
  }));
  await page.click('#gsKatAdd');
  await page.fill('#gsKats .gc-kat-row:not([data-id]) input[type="text"]', 'Baustelle');
  await page.dispatchEvent('#gsKats .gc-kat-row:last-child input[type="text"]', 'change');
  await page.waitForTimeout(150);
  check('A13.3 Eigene Kategorie ergänzt (Slug-id «baustelle»)', await page.evaluate(() => GemaChat._hooks.kats().some(k => k.id === 'baustelle' && k.name === 'Baustelle')));
  await page.click('#gsKats .gc-kat-row[data-id="spaeter"] button');
  await page.waitForTimeout(150);
  check('A13.4 Kategorie gelöscht (spaeter weg, Rest bleibt)', await page.evaluate(() => {
    const k = GemaChat._hooks.kats();
    return k.length === 6 && !k.some(x => x.id === 'spaeter');
  }));
  // Kontextmenü zeigt die umbenannte Kategorie samt Haken der Zuweisung
  await page.click('.gc-panel [data-act="back"]');
  await page.click('.gc-row[data-tid="t2"]', { button: 'right' });
  await page.waitForSelector('.gc-ctxmenu');
  const menu2 = await page.locator('.gc-ctxmenu').innerText();
  check('A13.5 Menü folgt dem Editor (Dringend ✓ an t2, Baustelle dabei)', menu2.includes('Dringend ✓') && menu2.includes('Baustelle'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // A14 — ↺ GEMA-Standard
  await page.click('[data-act="set"]');
  await page.waitForSelector('#gsKatReset');
  await page.click('#gsKatReset');
  await page.waitForSelector('.gema-dlg');
  await page.click('.gema-dlg [data-act="ok"]');
  await page.waitForTimeout(200);
  check('A14 Reset: GEMA-Standardkategorien zurück', await page.evaluate(() => {
    const k = GemaChat._hooks.kats();
    return k.length === 6 && k[0].name === 'Wichtig' && k.some(x => x.id === 'spaeter');
  }));

  // A15 — Enter-Verhalten (Einstellung «Enter sendet»)
  await page.uncheck('#gsEnter');
  await page.waitForTimeout(120);
  await page.click('.gc-panel [data-act="back"]');
  await page.click('.gc-row[data-tid="t2"]');
  await page.waitForSelector('#gcInput');
  await page.fill('#gcInput', 'Testnachricht');
  await page.press('#gcInput', 'Enter');
  await page.waitForTimeout(200);
  check('A15.1 Enter AUS: nichts gesendet (neue Zeile)', await page.locator('.gc-m.own').count() === 0);
  await page.evaluate(() => GemaChat._hooks.prefsSave({ enterSendet: true }));
  await page.click('.gc-panel [data-act="back"]');
  await page.click('.gc-row[data-tid="t2"]');
  await page.waitForSelector('#gcInput');
  await page.fill('#gcInput', 'Testnachricht');
  await page.press('#gcInput', 'Enter');
  await page.waitForTimeout(300);
  check('A15.2 Enter AN: Nachricht gesendet', await page.locator('.gc-m.own').count() === 1);

  // A16 — Kontakt-Picker: nur Berührungspunkte + E-Mail-Weg
  await page.click('.gc-panel [data-act="back"]');
  await page.click('[data-act="new"]');
  await page.waitForSelector('#gcSearch');
  await page.waitForTimeout(150);
  check('A16.1 Vorschläge: gleiche Firma (Zora) + Chat-Partner (Vera)', await page.locator('.gc-row[data-uid="u_zwei"]').count() === 1 && await page.locator('.gc-row[data-uid="u_vier"]').count() === 1);
  check('A16.2 KEIN Vorschlag ohne Berührungspunkt (Doris fehlt)', await page.locator('.gc-row[data-uid="u_drei"]').count() === 0);
  await page.fill('#gcSearch', 'drei@partner.ch');
  await page.waitForTimeout(150);
  check('A16.3 E-Mail-Eingabe → Kontaktieren-Zeile', await page.locator('.gc-row[data-mail]').count() === 1);
  await page.click('.gc-row[data-mail]');
  await page.waitForSelector('#gcMsgs', { timeout: 3000 });
  const hd = await page.locator('.gc-hd-t').innerText();
  check('A16.4 E-Mail-Weg startet den Chat (Doris Drei)', hd.includes('Doris Drei'));

  // A17 — E-Mail ohne GEMA-Login: klare Meldung statt stillem Nichts
  await page.click('.gc-panel [data-act="back"]');
  await page.click('[data-act="new"]');
  await page.waitForSelector('#gcSearch');
  await page.fill('#gcSearch', 'niemand@nirgends.ch');
  await page.waitForTimeout(150);
  await page.click('.gc-row[data-mail]');
  await page.waitForSelector('.gema-dlg', { timeout: 3000 });
  const alertTxt = await page.locator('.gema-dlg').innerText();
  check('A17 ohne GEMA-Login: Meldung', alertTxt.includes('kein GEMA-Login'));
  await page.click('.gema-dlg [data-act="ok"]');

  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// Teil B — Snip erfasst Embed-iframe (gema_feedback.js, workspace #4)
// html2canvas rendert iframe-Inhalte NICHT — beim eingebetteten Lieferanten-
// Dashboard (Workspace-Eimer, direktModul ?embed=1) war der Screenshot fast
// weiss. Der Guard misst GEOMETRISCH: eine synthetische Seite mit einem
// same-origin-iframe (teal Grund + rote Marke, INTERN gescrollt) wird
// gesnippt; die iframe-Farben MÜSSEN an der erwarteten Stelle im Bild liegen.
// ═════════════════════════════════════════════════════════════════════════
const SNIP_PARENT = `<!doctype html><html><head><meta charset="utf-8"><title>sniptest</title>
<style>body{margin:0;font-family:sans-serif}</style></head>
<body>
<div style="height:100px;background:#fff;padding:10px">Kopfzeile über dem iframe</div>
<iframe id="emb" src="/__snipinner.html" style="position:absolute;left:50px;top:120px;width:600px;height:400px;border:0"></iframe>
<script src="/gema_feedback.js"></script>
<script>GemaFeedback.init('sniptest','Snip-Test');</script>
</body></html>`;
const SNIP_INNER = `<!doctype html><html><head><meta charset="utf-8"><title>inner</title>
<style>html{scroll-behavior:smooth}body{margin:0;background:rgb(13,148,136);height:1200px}</style></head>
<body><div style="position:absolute;left:100px;top:80px;width:60px;height:60px;background:rgb(220,38,38)"></div></body></html>`;

async function teilB(browser, H2C) {
  console.log('\n── Teil B: Snip erfasst Embed-iframe ──');
  const src = await readFile(join(ROOT, 'gema_feedback.js'), 'utf8');
  check('B0.1 _iframesCompositen existiert (iframe-Inhalte einlegen)', src.indexOf('function _iframesCompositen') >= 0);
  check('B0.2 _captureViewport ruft das Compositing', /_iframesCompositen\(c,\s*scale,\s*ov\)/.test(src));
  if (!H2C) { console.log('  ⚠ html2canvas fehlt lokal (npm i --no-save playwright-core html2canvas@1.4.1) — Browser-Checks B1+ übersprungen (nicht still).'); return; }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await wireRoutes(ctx);
  await ctx.route('**/html2canvas*', r => r.fulfill({ contentType: 'text/javascript', body: H2C }));
  await ctx.route('**/__snipframe.html', r => r.fulfill({ contentType: 'text/html', body: SNIP_PARENT }));
  await ctx.route('**/__snipinner.html', r => r.fulfill({ contentType: 'text/html', body: SNIP_INNER }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/__snipframe.html');
  await page.waitForFunction(() => window.GemaFeedback && !!document.getElementById('gfb-root'), null, { timeout: 8000 });
  // iframe INTERN scrollen (rote Marke bei Dokument-y 80 → sichtbar bei y 40)
  await page.evaluate(() => new Promise(res => {
    const f = document.getElementById('emb');
    const go = () => { f.contentWindow.scrollTo(0, 40); setTimeout(res, 250); };
    if (f.contentDocument && f.contentDocument.readyState === 'complete') go();
    else f.addEventListener('load', go);
  }));

  // Snip-Box: (30,100) bis (740,590) — deckt Kopfzeile + iframe ab
  const box = { x: 30, y: 100, w: 710, h: 490 };
  await page.evaluate(() => GemaFeedback.start());
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w, box.y + box.h, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => !!(window._gfbHooks && window._gfbHooks.screenshot()), null, { timeout: 30000 });

  const mess = await page.evaluate(() => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let teal = 0, rMinX = 1e9, rMinY = 1e9, rMax = -1, rot = 0, tMinX = 1e9, tMinY = 1e9;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
        if (Math.abs(R - 13) < 30 && Math.abs(G - 148) < 30 && Math.abs(B - 136) < 30) {
          teal++; if (x < tMinX) tMinX = x; if (y < tMinY) tMinY = y;
        }
        if (Math.abs(R - 220) < 30 && Math.abs(G - 38) < 30 && Math.abs(B - 38) < 30) {
          rot++; if (x < rMinX) rMinX = x; if (y < rMinY) rMinY = y; if (x > rMax) rMax = x;
        }
      }
      res({ bild: [c.width, c.height], teal, tMin: [tMinX, tMinY], rot, rMin: [rMinX, rMinY], rBreite: rMax - rMinX + 1 });
    };
    img.src = window._gfbHooks.screenshot();
  }));

  const sc = 1.5, tol = 8;
  // iframe-Ursprung im Bild: (50-30, 120-100)*1.5 = (30, 30)
  check('B1 iframe-Inhalt im Snip (teal-Fläche gross)', mess.teal > (600 * 400 * sc * sc) * 0.5, JSON.stringify(mess));
  check('B2 iframe sitzt an der richtigen Stelle (' + mess.tMin + ' ≈ 30,30)',
    Math.abs(mess.tMin[0] - (50 - box.x) * sc) <= tol && Math.abs(mess.tMin[1] - (120 - box.y) * sc) <= tol);
  // rote Marke: Dokument-y 80, iframe intern 40 gescrollt → Viewport-y 40
  // → Bild: x=(50+100-30)*1.5=180, y=(120+40-100)*1.5=90 — beweist, dass der
  // INTERNE Scroll-Stand des iframes respektiert wird (nicht Dokument-Anfang)
  check('B3 iframe-SCROLL respektiert (rote Marke bei ' + mess.rMin + ' ≈ 180,90)',
    mess.rot > 60 * 60 * sc * sc * 0.5 &&
    Math.abs(mess.rMin[0] - (50 + 100 - box.x) * sc) <= tol &&
    Math.abs(mess.rMin[1] - (120 + 40 - box.y) * sc) <= tol);
  check('B4 keine pageerrors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// Teil C — Workspace: Rubrik-Sprungzeilen unter dem Dashboard-Eimer
// «eingerückter untereimer … der die navigationsbuttons hat, welche im
// Lieferantendashboard auch vorhanden sind, sodass man direkt zu dieser
// rubrik springen kann» — Sidebar-Zeilen unter dem gepinnten Auto-Eimer,
// Klick öffnet den Eimer und lädt das Embed-iframe mit ?tab=<rubrik>.
// ═════════════════════════════════════════════════════════════════════════
function wsSeed(roleIds) {
  return {
    gema_orgs_v1: [{ id: 'org_test', name: 'Testfirma AG', kategorie: 'lieferant', kategorien: ['lieferant'], admins: ['u_test'], active: true }],
    gema_users_v1: [{ id: 'u_test', username: 'u@test.ch', name: 'Robin Test', roleIds, orgId: 'org_test', active: true, profile: { email: 'u@test.ch' } }],
    gema_session_v1: { userId: 'u_test', expires: FUTURE, token: testJwt('u_test', 'org_test') },
    gema_coachmarks_done_sys_workspace_v2: '1'
  };
}
async function wsPage(browser, db, roleIds) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await wireRoutes(ctx);
  await ctx.route('**/rest/v1/gema_data**', pgMock(db));
  // Das Dashboard selbst ist hier NICHT Prüfgegenstand (sein Deep-Link-Guard
  // fällt bei unbekanntem ?tab= still auf den ersten Tab zurück — separat
  // verifiziert); ein Stub hält den iframe-Load schnell und fehlerfrei.
  await ctx.route('**/sys_lieferant_dashboard.html*', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>dash-stub</body></html>' }));
  await ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, wsSeed(roleIds));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/sys_workspace.html');
  await page.waitForSelector('#wsOrgBuckets .ws-bucket-row--pinned', { timeout: 12000 });
  return { ctx, page, errs };
}
async function teilC(browser) {
  console.log('\n── Teil C: Rubrik-Sprungzeilen (Workspace) ──');
  const src = await readFile(join(ROOT, 'sys_workspace.html'), 'utf8');
  check('C0.1 rubriken-Definition am AUTO_ROLLEN_EIMER', /rubriken:\[/.test(src) && /tab:'bestellungen'/.test(src) && /tab:'werkzeuge'/.test(src));
  check('C0.2 window._wsRubrik exponiert', /window\._wsRubrik=function/.test(src));
  check('C0.3 iframe-src trägt die gewählte Rubrik als &tab=', /embed=1'\+\(rubTab\?'&tab='\+encodeURIComponent\(rubTab\):''\)/.test(src));
  check('C0.4 anlagen-only Rubriken rollen-gefiltert (nur role_lieferant)', /tab:'anfragen',label:'Offertanfragen',nur:\['role_lieferant'\]/.test(src));
  check('C0.5 Rubriken auch im Mobile-Drawer (drawerRow)', (src.match(/_wsRubriken\(b\)/g) || []).length >= 3);

  // C1 — Anlagenlieferant: alle 7 Rubriken unter dem gepinnten Eimer
  {
    const db = new Map();
    const { ctx, page, errs } = await wsPage(browser, db, ['role_lieferant_admin']);
    await page.waitForSelector('#wsOrgBuckets .ws-rubrik-row', { timeout: 8000 });
    const labels = await page.$$eval('#wsOrgBuckets .ws-rubrik-row', els => els.map(e => e.textContent.trim()));
    check('C1.1 Anlagenlieferant: 7 Rubrik-Zeilen', labels.length === 7, labels.join(' | '));
    check('C1.2 Beschriftungen wie die Dashboard-Tabs', labels.includes('Übersicht') && labels.includes('🛒 Bestellungen') && labels.includes('Rohrsysteme & Armaturen') && labels.includes('🔧 Werkzeuge'));

    // C2 — Klick auf «Bestellungen» → Eimer offen + iframe mit tab=bestellungen
    await page.click('#wsOrgBuckets .ws-rubrik-row:has-text("Bestellungen")');
    await page.waitForSelector('#wsContentArea iframe.ws-direkt-frame', { timeout: 6000 });
    let src1 = await page.$eval('#wsContentArea iframe.ws-direkt-frame', f => f.getAttribute('src'));
    check('C2.1 Klick öffnet den Eimer direkt in der Rubrik', /embed=1&tab=bestellungen/.test(src1), src1);
    check('C2.2 aktive Rubrik-Zeile markiert', await page.locator('#wsOrgBuckets .ws-rubrik-row.active:has-text("Bestellungen")').count() === 1);

    // C3 — andere Rubrik: iframe lädt neu mit tab=werkzeuge
    await page.click('#wsOrgBuckets .ws-rubrik-row:has-text("Werkzeuge")');
    await page.waitForTimeout(200);
    let src2 = await page.$eval('#wsContentArea iframe.ws-direkt-frame', f => f.getAttribute('src'));
    check('C3 Rubrik-Wechsel lädt das iframe mit der neuen Rubrik', /embed=1&tab=werkzeuge/.test(src2), src2);
    check('C4 keine pageerrors (Anlagenlieferant)', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  // C5 — Produktlieferant: anlagen-only Rubriken fehlen
  {
    const db = new Map();
    const { ctx, page, errs } = await wsPage(browser, db, ['role_produktlieferant_admin']);
    await page.waitForSelector('#wsOrgBuckets .ws-rubrik-row', { timeout: 8000 });
    const labels = await page.$$eval('#wsOrgBuckets .ws-rubrik-row', els => els.map(e => e.textContent.trim()));
    check('C5.1 Produktlieferant: 4 Rubriken (ohne Anfragen/Bestellungen/Rohrsysteme)', labels.length === 4, labels.join(' | '));
    check('C5.2 Übersicht/Produktkatalog/Revision/Werkzeuge sichtbar', labels.includes('Übersicht') && labels.includes('Produktkatalog') && labels.includes('📑 Revisionsanfragen') && labels.includes('🔧 Werkzeuge'));
    check('C5.3 keine anlagen-only Zeile dabei', !labels.some(l => /Offertanfragen|Bestellungen|Rohrsysteme/.test(l)));
    check('C6 keine pageerrors (Produktlieferant)', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Teil D — Lieferanten-Dashboard: Produkteditor-Karten, Produktfamilien,
// Bild-Slot in der Liste, Kennlinien-Import direkt am Produkt (statisch;
// den Boot decken lieferant_modul_test/-smoke ab, das Kennlinien-Ende
// pumpenkennlinie_smoke_test).
// ═════════════════════════════════════════════════════════════════════════
async function teilD() {
  console.log('\n── Teil D: Produkteditor / Familien / Kennlinie am Produkt ──');
  const src = await readFile(join(ROOT, 'sys_lieferant_dashboard.html'), 'utf8');
  check('D1 .pe-grp ist eine Karte (Grund + Radius statt nackter Trennstriche)', /\.pe-grp\{[^}]*background:var\(--sur\)[^}]*border-radius/.test(src));
  check('D2 Grunddaten-Karte mit Produktfamilie-Feld + Vorschlags-datalist', /id="peFamilie" list="peFamilieList"/.test(src) && /id="peFamilieList"/.test(src) && /_peFamilieDatalist/.test(src));
  check('D3 saveProd speichert familie IMMER (bewusstes Leeren entfernt sie)', /familie:\s*\(\(document\.getElementById\('peFamilie'\)\|\|\{\}\)\.value\|\|''\)\.trim\(\)/.test(src));
  check('D4.1 Produktliste: Bild-Slot IMMER links (Platzhalter mit Kategorie-Icon)', /Kein Produktbild hinterlegt/.test(src) && /function thumb\(p\)/.test(src));
  check('D4.2 Produktliste gruppiert nach Familie (+ «Weitere Produkte» zuunterst)', /prod-fam-hd/.test(src) && /Weitere Produkte/.test(src) && /hatFam/.test(src));
  check('D4.3 ohne Familien: flache Liste wie bisher (Bestandsschutz)', /if\(!hatFam\)\{/.test(src));
  check('D5 Editor bietet Prüfbericht-Import OHNE Kennlinie an (Pumpen-Kategorien)', /PUMPEN_KATEGORIEN\)\s*\|\|\s*\[\]/.test(src) && /_liefKennImportOpen\(\\''\+E\(_editProd\.id\)/.test(src.replace(/\s+/g, '')) || /_liefKennImportOpen\(\\'"\+E\(_editProd\.id\)/.test(src) || src.indexOf("_liefKennImportOpen(\\''+E(_editProd.id)+'\\')") >= 0);
  check('D6 _liefKennImportOpen(prodId): Ziel vorgewählt, bleibt änderbar', /function _liefKennImportOpen\(prodId\)/.test(src) && /z\.value = prodId; _liefKennZielChanged\(\);/.test(src));
  check('D7 Import refresht den offenen Produkt-Editor', /_editProd && _editProd\.id===prod\.id/.test(src) && /renderPeKennlinie\(\); renderPeWorkflow\(\);/.test(src.replace(/\s+/g, ' ')));
  check('D8 leere Verifizierungs-Karte versteckt sich', /el\.style\.display='none'; return; \}\s*el\.style\.display='';/.test(src.replace(/\s+/g, ' ')));
  const pk = await readFile(join(ROOT, 'sys_produktkatalog.html'), 'utf8');
  check('D9 Produktkatalog: Bild-Feld mit Upload + Vorschau (statt roher URL)', /f\.typ==='bild'/.test(pk) && /_pkPickBild/.test(pk) && /_pkClearBild/.test(pk));
  check('D10 Produktkatalog-Upload nach GemaStorage (produkte/<lieferantId>)', /uploadDataUrl\(dataUrl,'produkte\/'\+\(\(currentProdukt&&currentProdukt\.lieferantId\)\|\|'unbekannt'\)\)/.test(pk));
}

// ═════════════════════════════════════════════════════════════════════════
// Teil E — Wärmepumpe: Hersteller/Typ-Auswahl (WPesti-Picker) + Anlagenschema
// «Im markierten Feld sollte man den Hersteller auswählen können … Im
// Hintergrund eine Datenbank … Ausserdem sollte ein Standardschema generiert
// werden können auf Basis der gemachten Eingaben (wie im Original-Excel).»
// Punkte 1–3 = WP-Datenbank-Picker (bestand schon — E0.7 pinnt ihn), Punkt 4
// = die Schema-Karte: das SVG folgt Wärmequelle/Betriebsweise/Speicher/WW/
// Solar aus den Eingaben, Beschriftungen führen zum Eingabefeld.
// ═════════════════════════════════════════════════════════════════════════
async function teilE(browser) {
  console.log('\n── Teil E: Wärmepumpe — Picker + Anlagenschema ──');
  const src = await readFile(join(ROOT, 'hz_waermepumpe.html'), 'utf8');
  check('E0.1 Schema-Karte + Host im Markup', /id="wpeSchemaCard"/.test(src) && /id="wpeSchemaHost"/.test(src));
  check('E0.2 window._wpeSchemaDraw exponiert (Cross-Block-Regel)', /window\._wpeSchemaDraw\s*=\s*function/.test(src));
  check('E0.3 wpePaint ruft das Schema geguardet (zeichnet auch OHNE Gebäudedaten)',
    src.indexOf("typeof window._wpeSchemaDraw==='function'") >= 0 && src.indexOf('window._wpeSchemaDraw(_wpeSchemaData())') >= 0);
  check('E0.4 _wpeSchemaData trägt heizband + leistung nur bei r.ok',
    /heizband: _v\('wpe_heizband'\)/.test(src) && /leistung: \(r&&r\.ok&&r\.geb\)\? r\.geb\.vorschlag : null/.test(src));
  check('E0.5 Chip-Klick-Delegation (data-wpeziel → Feld + Puls)', /closest\('\[data-wpeziel\]'\)/.test(src) && /wpe-puls/.test(src));
  // Schema-Block extrahieren: NUR literale Hex-Farben (GemaPDF-Regel)
  const blk = src.match(/<!-- 📐 Anlagenschema[\s\S]*?<script>([\s\S]*?)<\/script>/);
  check('E0.6 Schema-Block gefunden + keine CSS-Variablen im SVG (var(--…))', !!blk && blk[1].indexOf('var(--') < 0);
  check('E0.7 Picker (Punkte 1–3): Hersteller/Typ-Selects + WPesti-Datenbank geladen',
    /id="wpe_db_herst"/.test(src) && /id="wpe_db_typ"/.test(src) && /gema_wpesti_daten\.js/.test(src));
  check('E0.8 Kaltwasser-Route: Kombi unten (Label mit Halo), sonst rechts vorbei',
    /if\(kombi\)\{\s*s\+=L\(spX\+26, H-8/.test(src) && src.indexOf("M680 '+(H-8)+' V'+(yWW+46)+' H'+spR") >= 0);
  check('E0.9 Text-Halo für Beschriftungen auf Leitungen (paint-order:stroke)', /paint-order="stroke"/.test(src));

  // Browser: das Schema folgt den Eingaben (wpeArtChanged/wpeRecalc sind global)
  const { ctx, page } = await newPage(browser, seed(['role_hlkk_planer']));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/hz_waermepumpe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#wpeSchemaHost svg', { timeout: 15000 });
  const svgTxt = () => page.$eval('#wpeSchemaHost', el => el.textContent);
  const setze = vals => page.evaluate(v => {
    Object.keys(v).forEach(id => { const el = document.getElementById(id); if (el) el.value = v[id]; });
    wpeArtChanged(); wpeRecalc();
  }, vals);

  let t = await svgTxt();
  check('E1.1 Default rendert: Aussenluft + WP + beide Speicher + Umschaltventil',
    /Aussenluft/.test(t) && /Wärmepumpe/.test(t) && /WW-Speicher/.test(t) && /Heizungs-Speicher/.test(t) && /Umschaltventil/.test(t), t.slice(0, 200));
  check('E1.2 leeres Typ-Feld → «Gerät wählen» führt zum Picker', await page.locator('#wpeSchemaHost [data-wpeziel="wpe_db_herst"]').count() === 1);

  await setze({ wpe_art: '3' });
  t = await svgTxt();
  check('E2 Wärmequelle folgt der Eingabe (Erdsonde statt Aussenluft)', /Erdsonde/.test(t) && !/Aussenluft/.test(t));

  await setze({ wpe_bw: '4', wpe_umschalt: '-4' });
  t = await svgTxt();
  check('E3 bivalent → Heizkessel + Bivalenzpunkt-Chip', /Heizkessel/.test(t) && /Bivalenzpunkt -4 °C/.test(t));

  await setze({ wpe_art: '2', wpe_bw: '2', wpe_einsatz: '3' });
  t = await svgTxt();
  check('E4 nur Warmwasser → keine Heizverteilung', /WW-Speicher/.test(t) && !/Heizverteilung/.test(t));

  await setze({ wpe_einsatz: '4', wpe_speicher: '4', wpe_solar: '5' });
  t = await svgTxt();
  check('E5 Kombispeicher: EIN Speicher statt zwei', /Kombispeicher \(Stasch\)/.test(t) && !/WW-Speicher/.test(t) && !/Heizungs-Speicher/.test(t));
  check('E6 Solaranlage gezeichnet (WW + Heizung, MINERGIE)', /Solar — WW \+ Heizung \(MINERGIE\)/.test(t));

  const fokus = await page.evaluate(() => {
    const g = document.querySelector('#wpeSchemaHost [data-wpeziel="wpe_tvl"]');
    if (!g) return 'kein Chip';
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return document.activeElement ? document.activeElement.id : '';
  });
  check('E7 Chip-Klick fokussiert das Eingabefeld', fokus === 'wpe_tvl', fokus);
  check('E8 keine pageerrors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// Teil F — Abnahme (Marc Dischler, 18.08.2026):
//   #1 «Fix anheften, wird immer durch uns erstellt in der Regel» — jedes
//      NEUE Protokoll startet mit einer Fachbauleitungs-Zeile (eingeloggte
//      Person + eigene Firma samt Adresse) in «Weitere Beteiligte»; löschbar,
//      kein Duplikat, speist die Unterschriften-Vorbefüllung.
//   #2 «Bitte diesen Text richtig gemäss SIA schreiben» — Art. 158 Abs. 2:
//      die Abnahme-Fiktion hängt an der Monatsfrist seit Empfang der
//      Vollendungsanzeige (Fiktion mit Ablauf DIESER Frist); dazu die
//      159/160er-Zirkularität («gilt mit der Abnahme als abgenommen») weg.
//   #3 «Checkliste nur öffnen bei Sichtprüfung» — die Karte erscheint bei
//      Werkprüfung/Schluss- und Teilabnahme gar nicht; Bestandsschutz für
//      Protokolle mit bereits beurteilten Punkten.
// ═════════════════════════════════════════════════════════════════════════
async function teilF(browser) {
  console.log('\n── Teil F: Abnahme — Fachbauleitung fix, SIA-Texte, Checkliste nur Sicht ──');
  const src = await readFile(join(ROOT, 'pm_abnahme.html'), 'utf8');
  check('F0.1 _abFachbauleitungSeed mit Duplikat-Guard (/fachbauleitung/i)',
    /function _abFachbauleitungSeed\(st\)/.test(src) && /fachbauleitung\/i\.test\(\(b&&b\.funktion\)\|\|''\)/.test(src));
  check('F0.2 Seed an allen 4 Protokoll-Erzeugungen (newProtocol, Scope-Boot, Reset, Boot)',
    (src.match(/_abFachbauleitungSeed\(/g) || []).length >= 5);
  check('F0.3 Art.-158-Text normnah (Monatsfrist ab Vollendungsanzeige, Fiktion mit Fristablauf)',
    src.indexOf('Monatsfrist seit Empfang der Vollendungsanzeige') >= 0
    && src.indexOf('mit Ablauf dieser Frist als abgenommen') >= 0
    && src.indexOf('einen Monat nach der Anzeige') < 0);
  check('F0.4 159/160er-Zirkularität weg (abgenommen mit ABSCHLUSS der Prüfung)',
    src.indexOf('gilt mit der Abnahme als abgenommen') < 0
    && src.indexOf('mit dem Abschluss der gemeinsamen Prüfung als abgenommen') >= 0);
  check('F0.5 Tooltip am Art.-158-Kästchen angeglichen',
    /ci_art158[^>]*title="[^"]*unterbleibt die gemeinsame Prüfung innert Monatsfrist/.test(src));
  check('F0.6 Checklisten-Karte nur bei Sichtprüfung ODER vorhandener Beurteilung',
    /card\.style\.display=\(_isSicht\(\)\|\|n>0\)\?'':'none'/.test(src));

  // Browser: Boot mit Org-Adresse — der Seed setzt Person + Firma samt Adresse
  const sd = seed(['role_planer']);
  sd.gema_orgs_v1[0].adresse = { strasse: 'Teststrasse 5', plz: '4000', ort: 'Basel' };
  const { ctx, page } = await newPage(browser, sd);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);

  const wb0 = await page.evaluate(() => (window._abState().abnahme.weitereBeteiligte || [])[0] || null);
  check('F1.1 Boot-Protokoll: Fachbauleitung fix vorbelegt (Person + Firma mit Adresse)',
    !!wb0 && /fachbauleitung/i.test(wb0.funktion || '') && wb0.name === 'Test User'
    && wb0.firma === 'Testfirma AG, Teststrasse 5, 4000 Basel', JSON.stringify(wb0));
  const fbSig = await page.evaluate(() => ({ n: document.getElementById('sigFachbauleitungName').value, f: document.getElementById('sigFachbauleitungVisum').value }));
  check('F1.2 Unterschriften-Pad «Fachbauleitung» daraus vorbefüllt',
    fbSig.n === 'Test User' && fbSig.f.indexOf('Testfirma AG') === 0, JSON.stringify(fbSig));

  // #3: Checkliste beim Boot (Werkprüfung) versteckt, bei Sichtprüfung da
  const cwVis = () => page.evaluate(() => document.getElementById('chkWandCard').style.display !== 'none');
  check('F2.1 Werkprüfung/Schlussabnahme: Checklisten-Karte ausgeblendet', !(await cwVis()));
  await page.selectOption('#protoArt', 'teilabnahme');
  await page.waitForTimeout(200);
  check('F2.2 Teilabnahme: Checklisten-Karte ausgeblendet', !(await cwVis()));
  await page.selectOption('#protoArt', 'sichtkontrolle');
  await page.waitForTimeout(200);
  check('F2.3 Sichtprüfung: Checklisten-Karte sichtbar', await cwVis());
  await page.selectOption('#protoArt', '');
  await page.waitForTimeout(200);

  // #2: SIA-Zusatztexte normnah im UI
  await page.check('#ergKeine');
  await page.waitForTimeout(200);
  await page.check('#chkArt158');
  await page.waitForTimeout(200);
  const zus = await page.evaluate(() => document.getElementById('siaZusatz').textContent);
  check('F3.1 Ergebnis-Text: abgenommen mit dem Abschluss der Prüfung', zus.indexOf('Abschluss der Prüfung') >= 0, zus.slice(0, 160));
  check('F3.2 Art.-158-Zusatz: Monatsfrist ab Vollendungsanzeige, Fiktion mit Fristablauf',
    zus.indexOf('Monatsfrist seit Empfang der Vollendungsanzeige') >= 0 && zus.indexOf('mit Ablauf dieser Frist als abgenommen') >= 0);

  // #1: neues Protokoll — Stammdaten-Übernahme bringt die Zeile mit → KEIN Duplikat
  await page.evaluate(() => { window._abState().abnahme.bauobjekt = 'EFH Test'; newProtocol(); });
  await page.waitForTimeout(300);
  const wbNeu = await page.evaluate(() => (window._abState().abnahme.weitereBeteiligte || []).filter(b => /fachbauleitung/i.test(b.funktion || '')).length);
  check('F4 neues Protokoll: genau EINE Fachbauleitung (Übernahme + Seed = kein Duplikat)', wbNeu === 1, 'Anzahl: ' + wbNeu);

  // Die fixe Zeile bleibt löschbar — und wird beim blossen Rendern NICHT re-geseedet
  await page.click('#wbList [data-wbdel="0"]');
  await page.waitForTimeout(200);
  const wbWeg = await page.evaluate(() => { window._abRender(); return (window._abState().abnahme.weitereBeteiligte || []).length; });
  check('F5 Zeile löschbar (kein Re-Seed beim Rendern)', wbWeg === 0, 'Anzahl: ' + wbWeg);
  check('F6 keine pageerrors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
// Teil G — Warmwasser (Sandro Caso): #1 RaR-Material VL/RL getrennt ·
// #2 Stunden-Tabelle fluchtet EXAKT mit dem Diagramm · #3 %-Werte zuerst ·
// #4 Ausstoss-Select kompakt + Vermerk prominent · #5 Formel-Chips bündig
// ═════════════════════════════════════════════════════════════════════════
async function teilG(browser) {
  console.log('\n── Teil G: Warmwasser — RaR VL/RL, Tabelle=Diagramm, Layout ──');
  const src = await readFile(join(ROOT, 'sb_warmwasser.html'), 'utf8');
  check('G0.1 RaR-Zeile: ZWEI Material-Selects — ww_matRar klemmt nur den VL-ø, ww_matRarRL nur den RL-ø',
    src.indexOf("wwMatChanged(event,'ww_matRar',['ww_oeRarVL'])") >= 0
    && src.indexOf("wwMatChanged(event,'ww_matRarRL',['ww_oeRarRL'])") >= 0
    && src.indexOf("'ww_matRar',['ww_oeRarVL','ww_oeRarRL']") < 0);
  check('G0.2 Canvas-CSS-Breite fixiert (kein width:100%-Stretch mehr)',
    src.indexOf("canvas.style.width=cssW+'px'") >= 0);
  check('G0.3 Stunden-Tabelle mit colgroup (padL | 24 Spalten | padR) + Tabellenbreite = cssW',
    /var cols='<colgroup><col style="width:'\+padL\+'px">'/.test(src)
    && src.indexOf("cols+='<col style=\"width:'+padR+'px\"></colgroup>'") >= 0
    && src.indexOf('<table class="ww-slh" style="width:\'+cssW+\'px">') >= 0
    && /table\.ww-slh\{[^}]*table-layout:fixed/.test(src));
  check('G0.4 Pie-Legende: %-Anteil ZUERST und prominent (b.pct vor kWh/d)',
    src.indexOf("<b class=\"pct\">'+wwFmt(p.v/tot*100,1)+' %</b> · '+wwFmt(p.v,2)+' kWh/d") >= 0);
  check('G0.5 Ausstoss-Select kompakt (.ww-sel-kurz) + Vermerk als eigene ww-vermerk-Zeile',
    /id="ww_ausstossTyp"/.test(src) && /class="g-sel ww-sel-kurz" id="ww_ausstossTyp"/.test(src)
    && /ww-vermerk"[^>]*>Die Ausstosswärmeverluste werden in <b>% der Speicherverluste<\/b>/.test(src)
    && !/Ausstossleitungen<span class="ww-fg-note">/.test(src));
  check('G0.6 Formel-Chips als feste Mittelspalte (min-width am Chip UND an der Wert-Spalte)',
    /\.g-result-row>\.frml\{[^}]*min-width:92px/.test(src)
    && /\.g-result-row>\.frml~\.g-result-val\{min-width:110px\}/.test(src));

  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/sb_warmwasser.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // #1 — getrennte Materialwahl: die Klemme trifft NUR die eigene Seite
  const g1 = await page.evaluate(() => {
    const vl = document.getElementById('ww_matRar'), rl = document.getElementById('ww_matRarRL');
    const oVl = document.getElementById('ww_oeRarVL'), oRl = document.getElementById('ww_oeRarRL');
    const r = { da: !!(vl && rl && oVl && oRl) };
    if (!r.da) return r;
    r.vl0 = vl.value; r.rl0 = rl.value; r.oVl0 = oVl.value; r.oRl0 = oRl.value;
    vl.value = 'pex'; wwMatChanged({ isTrusted: true }, 'ww_matRar', ['ww_oeRarVL']);
    r.oVl1 = oVl.value; r.oRl1 = oRl.value;              // VL 22→25 (PEX-Reihe), RL bleibt 15
    rl.value = 'pex'; wwMatChanged({ isTrusted: true }, 'ww_matRarRL', ['ww_oeRarRL']);
    r.oVl2 = oVl.value; r.oRl2 = oRl.value;              // RL 15→16, VL bleibt 25
    oRl.value = '15'; rl.value = 'cns';
    wwMatChanged({ isTrusted: false }, 'ww_matRarRL', ['ww_oeRarRL']); // Restore-Pfad
    r.oRl3 = oRl.value;
    return r;
  });
  check('G1.1 beide Material-Selects vorhanden (Default CNS/CNS — Bestandsschutz)',
    g1.da && g1.vl0 === 'cns' && g1.rl0 === 'cns', JSON.stringify(g1));
  check('G1.2 VL-Wahl PEX klemmt NUR den VL-ø (22→25), der RL-ø bleibt unangetastet',
    g1.da && g1.oVl1 === '25' && g1.oRl1 === g1.oRl0, JSON.stringify(g1));
  check('G1.3 RL-Wahl PEX klemmt NUR den RL-ø (15→16), der VL-ø bleibt',
    g1.da && g1.oRl2 === '16' && g1.oVl2 === '25', JSON.stringify(g1));
  check('G1.4 synthetisches change (AutoSave-Restore) verstellt nichts (isTrusted-Kanon)',
    g1.da && g1.oRl3 === '15', JSON.stringify(g1));

  // #2 — Tabelle fluchtet mit dem Diagramm (Tab ③ sichtbar, sonst clientWidth 0)
  await page.locator('.g-tab[data-tab="wt3"]').first().click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.wwState.fein = [{ ne: 7, n: '20', profil: 'hotel_tourist' }];
    wwRenderTables(); wwRecalc();
  });
  await page.waitForTimeout(400);
  const g2 = await page.evaluate(() => {
    const tb = document.querySelector('#wwFeinSlTable table.ww-slh');
    const cv = document.getElementById('wwFeinSlCanvas');
    if (!tb || !cv) return { da: false };
    const tr = tb.getBoundingClientRect(), cr = cv.getBoundingClientRect();
    const padL = 56, padR = 50;
    const cssW = parseFloat(cv.style.width) || cr.width;
    const W = cssW - padL - padR;
    const hdr = tb.rows[0].cells;
    const st = h => hdr[1 + h].getBoundingClientRect();
    return {
      da: true, koepfe: hdr.length, padKl: hdr[hdr.length - 1].className,
      wEq: Math.abs(tr.width - cr.width), leftEq: Math.abs(tr.left - cr.left),
      d0: Math.abs((st(0).left - tr.left) - padL),
      d12: Math.abs((st(12).left - tr.left) - (padL + 12 / 24 * W)),
      dEnd: Math.abs((st(23).right - tr.left) - (padL + W))
    };
  });
  check('G2.1 Tabelle gerendert: 26 Spalten (Stunde + 24 + Pad), letzte = Pad-Spalte',
    g2.da && g2.koepfe === 26 && g2.padKl === 'pad', JSON.stringify(g2));
  check('G2.2 Tabelle exakt so breit + bündig wie das Diagramm (±1px)',
    g2.da && g2.wEq < 1 && g2.leftEq < 1, JSON.stringify(g2));
  check('G2.3 Spaltengrenzen liegen auf den Diagramm-Slots X(0)/X(12)/X(24) (±2px)',
    g2.da && g2.d0 < 2 && g2.d12 < 2 && g2.dEnd < 2, JSON.stringify(g2));

  // #3/#4/#5 — Tab ② sichtbar für Geometrie-Messungen
  await page.locator('.g-tab[data-tab="wt2"]').first().click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    document.getElementById('ww_lKonv').value = '1000'; // breiter Wert (120.00 kWh/d)
    document.getElementById('ww_lRar').value = '1';
    document.getElementById('ww_lWhb').value = '1';
    wwRecalc();
  });
  await page.waitForTimeout(300);
  const g5 = await page.evaluate(() => {
    const ids = ['ww_out_qKonv', 'ww_out_qRar', 'ww_out_qWhb'];
    const lefts = ids.map(id => {
      const row = document.getElementById(id).closest('.g-result-row');
      const f = row && row.querySelector(':scope>.frml');
      return f ? f.getBoundingClientRect().left : NaN;
    });
    const vals = ids.map(id => document.getElementById(id).textContent.trim());
    return { lefts, vals, spann: Math.max(...lefts) - Math.min(...lefts) };
  });
  check('G5 Formel-Chips bündig untereinander trotz unterschiedlich breiter Werte (±1.5px)',
    isFinite(g5.spann) && g5.spann < 1.5, JSON.stringify(g5));

  const g3 = await page.evaluate(() => {
    const host = document.getElementById('wwPieGrob');
    const v = host && host.querySelector('.ww-pie-legend .row .v');
    const row = host && host.querySelector('.ww-pie-legend .row');
    return {
      txt: v ? v.textContent.trim() : '',
      pctFett: !!(v && v.querySelector('b.pct')),
      wrap: row ? getComputedStyle(row).flexWrap : '',
      minW: host ? getComputedStyle(host).minWidth : ''
    };
  });
  check('G3.1 Verlust-Legende: %-Anteil steht ZUERST (fett), dann kWh/d',
    g3.pctFett && /^\d[\d'.]*\.\d %\s·\s[\d'.]+\.\d\d kWh\/d/.test(g3.txt), JSON.stringify(g3));
  check('G3.2 kein Abschneiden: Zeilen dürfen umbrechen + Grid-Kind min-width:0',
    g3.wrap === 'wrap' && g3.minW === '0px', JSON.stringify(g3));

  const g4 = await page.evaluate(() => {
    const sel = document.getElementById('ww_ausstossTyp');
    const card = sel.closest('.g-card');
    const verm = card.querySelector('.ww-vermerk');
    return {
      selW: sel.getBoundingClientRect().width,
      rowW: sel.closest('.fg').getBoundingClientRect().width,
      verm: verm ? verm.textContent : '',
      vermSichtbar: !!(verm && verm.getBoundingClientRect().height > 20)
    };
  });
  // Inhaltsbreite = Breite der längsten Option («Verschieden lange Ausstoss-
  // leitungen (20 %)» ≈ 400px) — vorher füllte das Select die ganze Restzeile.
  check('G4.1 Ausstoss-Select kompakt (Inhaltsbreite statt ganzer Restzeile)',
    g4.selW > 120 && g4.selW < 470 && g4.selW < g4.rowW * 0.6, JSON.stringify({ selW: g4.selW, rowW: g4.rowW }));
  check('G4.2 Vermerk als eigene, prominente Zeile («% der Speicherverluste»)',
    g4.vermSichtbar && g4.verm.indexOf('% der Speicherverluste') >= 0, g4.verm.slice(0, 120));

  check('G6 keine pageerrors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('Drift-Guard Feedback 19.08.2026' + (NUR ? ' — nur Teil ' + NUR : ''));
  if (will('A')) await teilA0();
  if (will('D')) await teilD();

  const exe = process.env.CHROME;
  if (!exe) { console.log('\nHINWEIS: CHROME nicht gesetzt — Browser-Teile übersprungen (nicht still: bitte mit CHROME=<chromium> ausführen).'); }
  let browser = null, server = null;
  if (exe) {
    server = await startServer();
    browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    if (will('A')) await teilA(browser);
    if (will('B')) {
      let H2C = '';
      try { H2C = await readFile(join(ROOT, 'node_modules/html2canvas/dist/html2canvas.min.js'), 'utf8'); } catch (e) {}
      await teilB(browser, H2C);
    }
    if (will('C')) await teilC(browser);
    if (will('E')) await teilE(browser);
    if (will('F')) await teilF(browser);
    if (will('G')) await teilG(browser);
  }
  if (browser) await browser.close();
  if (server) server.close();
  console.log('\n════════════════════════════');
  console.log('Ergebnis: ' + pass + ' ✓ / ' + fail + ' ✗');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
