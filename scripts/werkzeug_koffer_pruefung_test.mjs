// Werkzeugmanagement — Prüfung «liegt das Richtige am richtigen Ort?»
// (Feedback 23.08.2026, drei Teile):
//   1. «Wenn man einen koffer scannt soll der magaziner direkt eine prüfung
//      starten können um zu schauen, ob alles richtige drin ist.»
//   2. «im prüfmodus wenn man einen monteur gewählt hat, das material
//      gegliedert sehen, also pro koffer und dann direkt sehen ist auch das
//      richtig im jeweiligen koffer.»
//   3. «Es soll ein report geben, was man mit dem ‹falschen› werkzeug machen
//      muss — ‹akku muss in koffer xy gelegt werden›, oder wenn ein werkzeug
//      von jemand anderem ist, oder wenn das werkzeug bereits wieder beim
//      richtigen monteur ist, aber in gema noch als ausgeliehen hinterlegt.»
//
//   A) Prüf-Engine (DOM-frei): Soll-Koffer, Halter (Ausleihe schlägt Zuweisung,
//      Erbe über den Koffer), alle sechs Befund-Arten, Gruppierung, Prüfliste.
//   B) Koffer scannen → «▶ Prüfung starten» (nur Magaziner) → Prüfung läuft
//      mit dem Koffer als Kontext.
//   C) Monteur-Prüfung: gegliedert PRO KOFFER, Kofferinhalt ist dabei.
//   D) Befunde in der Oberfläche: falscher Koffer, fremder Besitzer, veraltete
//      Ausleihe (mit Ein-Klick-Rückbuchung), zusätzlich Gefundenes.
//   E) Report: Gruppen-Tabelle, «Zu erledigen» mit allen Handlungsanweisungen,
//      unbekannte Codes.
//   F) Gegenproben: ohne die Kofferinhalt-Erweiterung wäre die Prüfung leer;
//      ohne Kontext-Koffer gäbe es keinen «falscher Koffer»-Befund.
//
// Aufruf:  CHROME=<chromium> node scripts/werkzeug_koffer_pruefung_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8917;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/if_werkzeug.html';
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
// Monteur A (u_mon) hat Koffer 1 (Bohrhammer-Set) ausgeliehen.
//   akku  → gehoert in Koffer 1  (richtig)
//   lade  → gehoert in Koffer 1  (wird spaeter in Koffer 2 gefunden → falscher Koffer)
//   saege → gehoert in Koffer 2, ist aber Monteur A direkt zugewiesen
//   zange → gehoert nirgends, ist Monteur A zugewiesen
//   fremd → gehoert Monteur B (Zuweisung) — liegt faelschlich in Koffer 1
//   alt   → ist Monteur A ZUGEWIESEN, in GEMA aber noch an Monteur B ausgeliehen
//           (genau der dritte Fall des Feedbacks)
const TOOLS = [
  { id: 't_akku',  name: 'Akku 5.2Ah',  cat: 'ladegeraet',   brand: 'Hilti',  model: 'B22', internKennung: 'WZ-101', serial: 'SN-A1', bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_lade',  name: 'Ladegerät',   cat: 'ladegeraet',   brand: 'Hilti',  model: 'C4',  bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_saege', name: 'Säbelsäge',   cat: 'maschine',     brand: 'Bosch',  model: 'S1',  bought: '2025-02-01', orgId: 'org_t',
    zugewiesenAn: { typ: 'user', userId: 'u_mon', name: 'Monteur A', seit: '2025-02-01' } },
  { id: 't_zange', name: 'Zange',       cat: 'handwerkzeug', brand: 'Knipex', model: 'K1',  bought: '2025-03-01', orgId: 'org_t',
    zugewiesenAn: { typ: 'user', userId: 'u_mon', name: 'Monteur A', seit: '2025-03-01' } },
  { id: 't_fremd', name: 'Fremdgerät',  cat: 'maschine',     brand: 'Makita', model: 'M9',  bought: '2025-03-01', orgId: 'org_t',
    zugewiesenAn: { typ: 'user', userId: 'u_b', name: 'Monteur B', seit: '2025-03-01' } },
  { id: 't_alt',   name: 'Rohrzange',   cat: 'handwerkzeug', brand: 'Rothenberger', model: 'R2', bought: '2025-03-01', orgId: 'org_t',
    zugewiesenAn: { typ: 'user', userId: 'u_mon', name: 'Monteur A', seit: '2025-03-01' },
    ausgeliehenAn: { userId: 'u_b', name: 'Monteur B', seit: '2025-06-01' } },
  { id: 't_platz', name: 'Regalgerät',  cat: 'handwerkzeug', brand: 'Gedore', model: 'G1',  bought: '2025-03-01', orgId: 'org_t',
    zugewiesenAn: { typ: 'platz', platz: 'Lager Halle B', name: 'Lager Halle B', seit: '2025-03-01' } },
  { id: 'k_1', name: 'Bohrhammer-Set', cat: 'koffer', internKennung: 'KOF-01', bought: '2025-01-10', orgId: 'org_t',
    kofferInhalt: ['t_akku', 't_lade'],
    ausgeliehenAn: { userId: 'u_mon', name: 'Monteur A', seit: '2025-05-01' } },
  { id: 'k_2', name: 'Sägeset', cat: 'koffer', internKennung: 'KOF-02', bought: '2025-01-10', orgId: 'org_t',
    kofferInhalt: ['t_saege'] }
];
function seedStore() {
  store.clear();
  TOOLS.forEach(t => store.set('werkzeugmanagement|tool:' + t.id, { data: JSON.parse(JSON.stringify(t)), _lm: '2026-08-01T00:00:00Z' }));
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true };
const U_MAG = { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
const U_MON = { id: 'u_mon', username: 'mon@t.ch', name: 'Monteur A', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'mon@t.ch' } };
const U_B   = { id: 'u_b',   username: 'b@t.ch',   name: 'Monteur B', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'b@t.ch' } };
const klassisch = u => Object.assign({}, u, { profile: Object.assign({}, u.profile, { nativeAnsicht: false }) });

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(opts) {
  opts = opts || {};
  const user = opts.user || klassisch(U_MAG);
  const ctx = await browser.newContext(opts.viewport ? { viewport: opts.viewport, isMobile: !!opts.mobile, hasTouch: !!opts.mobile } : {});
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  const seed = {
    gema_orgs_v1: [ORG], gema_users_v1: [klassisch(U_MAG), U_MON, U_B],
    gema_session_v1: { token: 'x.y.z', userId: user.id, expires: FUTURE },
    gema_coachmarks_done_if_werkzeug: '1'
  };
  if (opts.extra) Object.assign(seed, opts.extra);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html' + (opts.query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  return { ctx, page };
}

// ══════════════════════════════════════════════════════════════════
console.log('— A) Prüf-Engine (DOM-frei) —');
{
  seedStore();
  const { ctx, page } = await openPage();
  ok(page.errs.length === 0, 'Seite bootet ohne Fehler (' + (page.errs[0] || 'keine') + ')');

  const e = await page.evaluate(() => ({
    sollAkku:  (_wzSollKoffer('t_akku')  || {}).id || '',
    sollZange: (_wzSollKoffer('t_zange') || {}).id || '',
    halterAkku:  _wzHalter(tools.find(t => t.id === 't_akku')),
    halterZange: _wzHalter(tools.find(t => t.id === 't_zange')),
    halterAlt:   _wzHalter(tools.find(t => t.id === 't_alt')),
    halterPlatz: _wzHalter(tools.find(t => t.id === 't_platz')),
    liste: _wzPruefListe('u_mon').map(t => t.id).sort()
  }));
  ok(e.sollAkku === 'k_1', 'Soll-Koffer: der Akku gehört in k_1');
  ok(e.sollZange === '', 'Soll-Koffer: die Zange gehört in keinen Koffer');
  ok(e.halterAkku && e.halterAkku.userId === 'u_mon' && e.halterAkku.ueberKoffer === 'Bohrhammer-Set',
     'Halter: der Akku erbt seinen Halter ÜBER den Koffer (sonst «niemandem zugeteilt»)');
  ok(e.halterZange && e.halterZange.userId === 'u_mon' && e.halterZange.art === 'zuweisung',
     'Halter: direkte Zuweisung wird erkannt');
  ok(e.halterAlt && e.halterAlt.userId === 'u_b' && e.halterAlt.art === 'ausleihe',
     'Halter: die Ausleihe schlägt die Zuweisung');
  ok(e.halterPlatz === null, 'Halter: eine Platz-Zuweisung ist KEINE Person');
  ok(e.liste.join(',') === ['t_akku', 't_lade', 't_saege', 't_zange', 't_alt', 'k_1'].sort().join(','),
     'Prüfliste des Monteurs enthält den Koffer UND seinen Inhalt (' + e.liste.join(', ') + ')');

  // Gegenprobe F1: ohne die Kofferinhalt-Erweiterung waeren akku/lade nicht dabei
  const ohne = await page.evaluate(() => tools.filter(t => {
    const zug = t.zugewiesenAn && t.zugewiesenAn.typ !== 'platz' && t.zugewiesenAn.userId === 'u_mon';
    const aus = t.ausgeliehenAn && t.ausgeliehenAn.userId === 'u_mon';
    return zug || aus;
  }).map(t => t.id).sort());
  ok(ohne.indexOf('t_akku') < 0 && ohne.indexOf('t_lade') < 0,
     'Gegenprobe: die alte Regel (nur Zuweisung/Ausleihe) fände den Kofferinhalt NICHT');

  const bf = await page.evaluate(() => {
    const T = id => tools.find(t => t.id === id);
    const ctxK1 = { kofferId: 'k_1', personId: 'u_mon', personName: 'Monteur A' };
    return {
      akkuRichtig: _wzBefunde(T('t_akku'), ctxK1),
      ladeFalsch:  _wzBefunde(T('t_lade'), { kofferId: 'k_2', personId: 'u_mon', personName: 'Monteur A' }),
      ladeLose:    _wzBefunde(T('t_lade'), { kofferId: '',    personId: 'u_mon', personName: 'Monteur A' }),
      zangeInKof:  _wzBefunde(T('t_zange'), ctxK1),
      fremd:       _wzBefunde(T('t_fremd'), ctxK1),
      alt:         _wzBefunde(T('t_alt'),   { kofferId: '', personId: 'u_mon', personName: 'Monteur A' }),
      lager:       _wzBefunde(T('t_platz'), { kofferId: '', personId: 'u_mon', personName: 'Monteur A' })
    };
  });
  const arten = a => a.map(x => x.art).join(',');
  ok(bf.akkuRichtig.length === 0, 'Befund: der Akku im richtigen Koffer beim richtigen Monteur → nichts zu tun');
  ok(arten(bf.ladeFalsch) === 'falscher_koffer', 'Befund: Ladegerät in Koffer 2 → falscher_koffer');
  ok(/in Koffer «Bohrhammer-Set» legen/.test(bf.ladeFalsch[0].massnahme),
     'Massnahme nennt den Ziel-Koffer im Klartext («' + bf.ladeFalsch[0].massnahme + '»)');
  ok(arten(bf.ladeLose) === 'lose', 'Befund: Kofferteil einzeln gefunden → lose');
  ok(arten(bf.zangeInKof) === 'nicht_im_koffer', 'Befund: Zange in einem Koffer, dort nicht erfasst → nicht_im_koffer');
  ok(arten(bf.fremd) === 'nicht_im_koffer,fremder_besitzer',
     'Befund: fremdes Gerät im Koffer liefert BEIDE Befunde — Ort und Besitz (' + arten(bf.fremd) + ')');
  ok(/Monteur B/.test(bf.fremd[1].massnahme), 'Massnahme nennt die richtige Person');
  ok(arten(bf.alt) === 'ausleihe_veraltet', 'Befund: bei Monteur A, in GEMA an B ausgeliehen → ausleihe_veraltet');
  ok(bf.alt[0].aktion === 'rueckbuchen', 'Der veraltete Ausleih-Stand trägt die Aktion «rueckbuchen»');
  ok(arten(bf.lager) === 'nicht_zugeteilt', 'Befund: Lagergerät beim Monteur → nicht_zugeteilt');

  // Gegenprobe F2: ohne Kontext-Koffer gaebe es den Ort-Befund gar nicht
  ok(bf.ladeFalsch.length === 1 && bf.ladeLose[0].art !== 'falscher_koffer',
     'Gegenprobe: ohne Kontext-Koffer entsteht kein «falscher Koffer»-Befund');

  const grp = await page.evaluate(() => _wzPruefGruppen(_wzPruefListe('u_mon')).map(g => ({
    titel: g.titel, koffer: !!g.koffer, items: g.items.map(t => t.id)
  })));
  ok(grp.length === 3, 'Gruppierung liefert 3 Gruppen (2 Koffer + Einzelne) — ' + grp.map(g => g.titel).join(' | '));
  ok(grp[0].koffer && grp[0].titel === 'Bohrhammer-Set' && grp[0].items.join(',') === 't_akku,t_lade',
     'Gruppe 1 = Koffer «Bohrhammer-Set» mit seinen zwei Teilen');
  ok(grp[grp.length - 1].titel === 'Einzelne Werkzeuge' && grp[grp.length - 1].items.sort().join(',') === 't_alt,t_zange',
     '«Einzelne Werkzeuge» steht zuletzt und enthält genau die Werkzeuge ohne Koffer');
  ok(!grp.some(g => g.items.indexOf('k_1') >= 0), 'Ein Koffer erscheint als Gruppen-KOPF, nie zusätzlich als Zeile');

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— B) Koffer scannen → Prüfung direkt starten —');
{
  seedStore();
  const { ctx, page } = await openPage({ query: '?scan=k_1' });
  await page.waitForTimeout(500);
  const scan = await page.evaluate(() => {
    const o = document.getElementById('wzScanOverlay');
    const sec = document.getElementById('kofCtrlSection');
    const btn = sec ? Array.from(sec.querySelectorAll('button')).find(b => /Prüfung starten/.test(b.textContent)) : null;
    return { overlay: !!o, sec: !!sec, btn: !!btn, txt: btn ? btn.textContent.trim() : '',
             hinweis: sec ? /falsch einsortiertes/.test(sec.textContent) : false };
  });
  ok(scan.overlay, 'Koffer-Scan öffnet die Scan-Ansicht (Magaziner)');
  ok(scan.sec, 'Die Koffer-Kontroll-Sektion ist da');
  ok(scan.btn && /Prüfung starten/.test(scan.txt), 'Knopf «▶ Prüfung starten (scannen)» ist vorhanden');
  ok(scan.hinweis, 'Der Hinweis erklärt den Unterschied zur blossen Checkliste');

  await page.evaluate(() => {
    const sec = document.getElementById('kofCtrlSection');
    Array.from(sec.querySelectorAll('button')).find(b => /Prüfung starten/.test(b.textContent)).click();
  });
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({
    scanWeg: !document.getElementById('wzScanOverlay'),
    mode: _pruefSession ? _pruefSession.mode : '',
    kofferId: _pruefSession ? _pruefSession.kofferId : '',
    aktKoffer: _pruefSession ? _pruefSession.aktKoffer : '',
    person: _pruefSession ? _pruefSession.personName : '',
    liste: _pruefSession ? _pruefSession.checklist.map(t => t.id) : [],
    titel: (document.querySelector('#_wzModalOverlay h3') || {}).textContent || ''
  }));
  ok(st.scanWeg, 'Der Scan wird geschlossen (Schichtung: Prüf-Modal läge sonst darunter)');
  ok(st.mode === 'koffer', 'Die Prüfung läuft im Koffer-Modus');
  ok(st.aktKoffer === 'k_1', 'Der gescannte Koffer ist sofort der Kontext');
  ok(st.person === 'Monteur A', 'Beim ausgeliehenen Koffer gilt der Ausleiher als geprüfte Person');
  ok(st.liste.join(',') === 't_akku,t_lade', 'Die Checkliste ist der Kofferinhalt');
  ok(/Bohrhammer-Set/.test(st.titel), 'Der Kopf nennt den Koffer («' + st.titel.trim() + '»)');

  // Ein Teil scannen, das dort nicht hingehoert
  await page.evaluate(() => _wzPruefRegister('t_fremd'));
  await page.waitForTimeout(200);
  const nach = await page.evaluate(() => {
    const t = document.getElementById('_wzModalOverlay').textContent;
    return { fremd: /Fremdgerät/.test(t), zusatz: /Zusätzlich gefunden/.test(t), warn: /Monteur B/.test(t) };
  });
  ok(nach.fremd && nach.zusatz, 'Ein Teil, das nicht auf der Liste steht, erscheint als «Zusätzlich gefunden»');
  ok(nach.warn, 'Der Befund nennt den richtigen Besitzer');

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— C) Monteur-Prüfung: gegliedert pro Koffer —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => {
    _pruefSession = { mode: 'monteur', personId: 'u_mon', personName: 'Monteur A',
      checklist: _wzPruefListe('u_mon'), funde: {}, unbekannt: [], aktKoffer: '', startedAt: new Date().toISOString() };
    _wzRenderPruefUI();
  });
  await page.waitForTimeout(200);
  const ui = await page.evaluate(() => {
    const m = document.getElementById('_wzModalOverlay');
    const txt = m.textContent;
    return {
      koffer1: /Bohrhammer-Set/.test(txt), koffer2: /Sägeset/.test(txt),
      einzel: /Einzelne Werkzeuge/.test(txt),
      akku: /Akku 5\.2Ah/.test(txt), saege: /Säbelsäge/.test(txt),
      kontextZeile: /Geöffnet:/.test(txt),
      progress: (m.textContent.match(/0\/\d+/) || [])[0] || ''
    };
  });
  ok(ui.koffer1 && ui.koffer2, 'Beide Koffer erscheinen als Gruppen-Köpfe');
  ok(ui.einzel, 'Die Gruppe «Einzelne Werkzeuge» ist da');
  ok(ui.akku && ui.saege, 'Der Kofferinhalt steht in seiner Gruppe (Akku, Säbelsäge)');
  ok(ui.kontextZeile, 'Die Kontext-Zeile «Geöffnet:» erlaubt die Koffer-Wahl');
  ok(ui.progress === '0/6', 'Der Fortschritt zählt alle 6 Positionen der Prüfliste');

  // Kontext auf Koffer 1 setzen und ein FALSCH einsortiertes Teil scannen
  await page.evaluate(() => { _wzPruefKontext('k_1'); _wzPruefRegister('t_saege'); });
  await page.waitForTimeout(200);
  const c2 = await page.evaluate(() => {
    const t = document.getElementById('_wzModalOverlay').textContent;
    return { befund: /gehört aber in Koffer «Sägeset»/.test(t), pfeil: /Aus Koffer «Bohrhammer-Set» nehmen/.test(t) };
  });
  ok(c2.befund, 'Direkt sichtbar: «liegt in Bohrhammer-Set, gehört aber in Sägeset»');
  ok(c2.pfeil, 'Die Handlungsanweisung steht bei der Zeile');

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— D) Veraltete Ausleihe: Ein-Klick-Rückbuchung —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => {
    _pruefSession = { mode: 'monteur', personId: 'u_mon', personName: 'Monteur A',
      checklist: _wzPruefListe('u_mon').concat([tools.find(t => t.id === 't_alt')]),
      funde: {}, unbekannt: [], aktKoffer: '', startedAt: new Date().toISOString() };
    _wzPruefRegister('t_alt');
  });
  await page.waitForTimeout(200);
  const vor = await page.evaluate(() => {
    const m = document.getElementById('_wzModalOverlay');
    const b = Array.from(m.querySelectorAll('button')).find(x => /Jetzt zurückbuchen/.test(x.textContent));
    return { text: /noch an Monteur B ausgeliehen/.test(m.textContent), btn: !!b,
             ausgeliehen: !!tools.find(t => t.id === 't_alt').ausgeliehenAn };
  });
  ok(vor.text, 'Der Befund sagt: bei Monteur A, in GEMA noch an Monteur B ausgeliehen');
  ok(vor.btn, 'Der Knopf «↩ Jetzt zurückbuchen» ist da');
  ok(vor.ausgeliehen, 'Vor dem Klick ist das Gerät noch ausgeliehen');

  await page.evaluate(() => Array.from(document.querySelectorAll('#_wzModalOverlay button'))
    .find(x => /Jetzt zurückbuchen/.test(x.textContent)).click());
  await page.waitForTimeout(400);
  const nach = await page.evaluate(() => ({
    ausgeliehen: !!tools.find(t => t.id === 't_alt').ausgeliehenAn,
    befundWeg: !/noch an Monteur B ausgeliehen/.test(document.getElementById('_wzModalOverlay').textContent),
    cloud: null
  }));
  ok(!nach.ausgeliehen, 'Nach dem Klick ist die Ausleihe aufgehoben');
  ok(nach.befundWeg, 'Der Befund verschwindet sofort — er wird live gerechnet, nicht eingefroren');
  const gespeichert = JSON.parse(JSON.stringify(store.get('werkzeugmanagement|tool:t_alt') || {}));
  ok(gespeichert.data && !gespeichert.data.ausgeliehenAn, 'Die Rückbuchung ist in der Cloud gespeichert');

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— E) Report —');
{
  seedStore();
  const { ctx, page } = await openPage();
  const html = await page.evaluate(async () => {
    _pruefSession = { mode: 'monteur', personId: 'u_mon', personName: 'Monteur A',
      checklist: _wzPruefListe('u_mon'), funde: {}, unbekannt: [], aktKoffer: 'k_1', startedAt: new Date().toISOString() };
    _wzPruefRegister('t_akku');            // richtig
    _wzPruefRegister('t_saege');           // falscher Koffer
    _wzPruefRegister('t_fremd');           // fremder Besitzer + nicht auf der Liste
    _wzPruefRegister('CODE-UNBEKANNT');    // unbekannter Code
    // t_lade + t_zange bleiben ungescannt → fehlend
    let out = '';
    const orig = window.open;
    window.open = () => ({ document: { write: s => { out += s; }, close: () => {} } });
    _wzPruefPDF();
    window.open = orig;
    return out;
  });
  ok(/Prüfbericht Werkzeuge/.test(html), 'Report trägt den Titel «Prüfbericht Werkzeuge»');
  ok(/Monteur-Prüfung: Monteur A/.test(html), 'Report nennt die geprüfte Person');
  ok(/Bohrhammer-Set/.test(html) && /Sägeset/.test(html), 'Report ist nach Koffern gegliedert');
  ok(/Gehört in Koffer/.test(html), 'Die Tabelle hat die Spalte «Gehört in Koffer»');
  ok(/Zu erledigen/.test(html), 'Der Abschnitt «Zu erledigen» ist da');
  ok(/in Koffer «Sägeset» legen/.test(html), 'Report sagt, in welchen Koffer die Säge gehört');
  ok(/Monteur B/.test(html), 'Report nennt den fremden Besitzer');
  ok(/Ladegerät/.test(html) && /nicht gefunden/.test(html), 'Fehlende Werkzeuge stehen als «nicht gefunden» drin');
  ok(/Suchen — sonst als verloren melden/.test(html), 'Auch für Fehlendes gibt es eine Handlungsanweisung');
  ok(/CODE-UNBEKANNT/.test(html) && /Unbekannte Codes/.test(html), 'Unbekannte Codes fallen nicht still weg');
  ok(/opsz" 14/.test(html), 'Der Druck folgt dem opsz-Kanon');

  // Gegenprobe: eine Prüfung ohne Befunde meldet das ausdruecklich
  const sauber = await page.evaluate(() => {
    _pruefSession = { mode: 'koffer', personId: 'u_mon', personName: 'Monteur A', kofferId: 'k_1', kofferName: 'Bohrhammer-Set',
      checklist: _wzKofferItems(tools.find(t => t.id === 'k_1')), funde: {}, unbekannt: [], aktKoffer: 'k_1', startedAt: new Date().toISOString() };
    _wzPruefRegister('t_akku'); _wzPruefRegister('t_lade');
    let out = ''; const orig = window.open;
    window.open = () => ({ document: { write: s => { out += s; }, close: () => {} } });
    _wzPruefPDF(); window.open = orig; return out;
  });
  ok(/Nichts zu erledigen/.test(sauber), 'Gegenprobe: vollständiger, korrekter Koffer → «Nichts zu erledigen»');
  ok(!/Zusätzlich gefunden/.test(sauber), 'Gegenprobe: kein «Zusätzlich gefunden»-Block ohne Zusatz');

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— F) Rechte —');
{
  seedStore();
  const { ctx, page } = await openPage({ user: klassisch(U_MON), query: '?scan=k_1' });
  await page.waitForTimeout(500);
  const mon = await page.evaluate(() => {
    const sec = document.getElementById('kofCtrlSection');
    return { sec: !!sec, btn: sec ? !!Array.from(sec.querySelectorAll('button')).find(b => /Prüfung starten/.test(b.textContent)) : false,
             modeBtn: !!document.querySelector('#btnPruefMode') && document.getElementById('btnPruefMode').style.display !== 'none' };
  });
  ok(mon.sec, 'Der Monteur sieht die Koffer-Kontrolle (Vollständigkeit) weiterhin');
  ok(!mon.btn, 'Der Monteur bekommt KEINEN «Prüfung starten»-Knopf');
  ok(!mon.modeBtn, 'Der Prüfmodus-Knopf der Toolbar bleibt für den Monteur versteckt');
  await ctx.close();
}

await browser.close(); server.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
