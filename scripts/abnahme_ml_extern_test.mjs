// pm_abnahme — Mängelliste extern übergeben (E-Mail-Konto-Prüfung, 20.08.2026)
//
// «der Fachplaner macht die Abnahme, der Unternehmer arbeitet die Mängel ab»:
// Der Übergabe-Dialog kennt neben dem eigenen Team einen Extern-Modus — eine
// E-Mail wird LIVE gegen die GEMA-Konten geprüft (kein Konto / deaktiviert /
// kein Modul-Zugriff / ✓ ok mit Name—Firma (Rolle)); nur ein gültiges Konto
// lässt sich übergeben. Der Externe sieht die Liste cross-org in seinem
// Panel, kann die Punkte aber NUR abarbeiten (Checkbox/Foto/Kommentar) — nie
// bearbeiten und nie kontrollieren (abMlDarfKontrollieren, eine Wahrheit für
// Karte UND Aktionen). Die Zustellung matcht über die userId UND die E-Mail
// (stabiler Anker, falls das Konto neu angelegt wurde).
//
// Der Test fährt einen echten Cross-Org-Roundtrip über einen In-Memory-
// PostgREST-Mock (geteilte cloud-Map über zwei Browser-Kontexte — Muster
// scripts/abnahme_scope_test.mjs):
//   A) Planerin (org OHNE Monteure): Dialog öffnet trotzdem (früherer Abort
//      «⚠ Keine Monteure» ist weg), E-Mail-Zweige, Übergabe → Cloud-Record
//      mit extern/monteurFirma/monteurEmail + Notify an den Unternehmer.
//   B) Unternehmer (fremde Org): Karte mit Herkunfts-Firma, Punkte read-only,
//      Kontrolle-Aktionen geblockt, abhaken + fertigmelden; KEINE
//      Kontrolle-Karte für den Abarbeiter; E-Mail-Fallback-Zustellung.
//   C) Planerin Seite 2: Kontrolle-Karte «… (Firma) · ✉️ extern», Freigeben
//      schreibt die Erledigung ins Protokoll zurück.
//
// Aufruf:  CHROME=<chromium> node scripts/abnahme_ml_extern_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8919;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l, extra) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l, extra !== undefined ? '→ ' + String(extra).slice(0, 220) : ''); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/pm_abnahme.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfcCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig';
const ORGS = [
  { id: 'org_p', name: 'Planwerk AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true },
  { id: 'org_u', name: 'Lüthi Haustechnik AG', kategorie: 'sonstiges', kategorien: ['sonstiges'], admins: ['u2'], active: true },
  { id: 'org_l', name: 'BWT AG', kategorie: 'lieferant', kategorien: ['lieferant'], admins: ['u3'], active: true }
];
// u2 trägt BEWUSST username ≠ profile.email — die Konto-Auflösung muss beide
// Felder einzeln matchen. u4 ist deaktiviert (Meldung «deaktiviert», nie
// «kein Konto»), u3 hat als role_lieferant keinen abnahme_sia-Zugriff.
const USERS = [
  { id: 'u1', username: 'anna@planwerk.ch', name: 'Anna Planer', roleIds: ['role_admin'], orgId: 'org_p', active: true, profile: { email: 'anna@planwerk.ch' } },
  { id: 'u2', username: 'hans@luethi.ch', name: 'Hans Lüthi', roleIds: ['role_unternehmer'], orgId: 'org_u', active: true, profile: { email: 'h.luethi@luethi.ch' } },
  { id: 'u3', username: 'lief@bwt.ch', name: 'Lena Lieferant', roleIds: ['role_lieferant'], orgId: 'org_l', active: true, profile: { email: 'lief@bwt.ch' } },
  { id: 'u4', username: 'weg@ex.ch', name: 'Willi Weg', roleIds: ['role_unternehmer'], orgId: 'org_u', active: false, profile: { email: 'weg@ex.ch' } }
];
const OBJEKTE = [
  { id: 'obj_a', name: 'Neubau Sonnhalde', nummer: '25-01', strasse: 'Sonnweg 3', plz: '4000', ort: 'Basel', orgId: 'org_p', erstelltVon: 'u1', status: 'aktiv' }
];

// In-Memory-PostgREST — EINE cloud-Map über beide Browser-Kontexte, damit die
// Übergabe wirklich den Cloud-Weg nimmt (Org P schreibt, Org U liest).
const cloud = new Map();   // module_key|data_key -> row
function rowsFor(url) {
  const like = /data_key=like\.([^&]+)/.exec(url);
  const mod = /module_key=eq\.([^&]+)/.exec(url);
  let out = [...cloud.values()];
  if (mod) out = out.filter(r => r.module_key === decodeURIComponent(mod[1]));
  if (like) {
    const pat = decodeURIComponent(like[1]).replace(/\*/g, '');
    out = out.filter(r => r.data_key.indexOf(pat) === 0);
  }
  return out;
}
function recOf(row) {
  if (!row) return null;
  if (row.payload && row.payload.data) return row.payload.data;
  if (row.payload) return row.payload;
  return row.data || null;
}
function mlRows() { return [...cloud.entries()].filter(([k]) => k.indexOf('|abml:') > 0); }

const browser = await chromium.launch({ executablePath: CHROME });

async function neuerKontext(userId) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const req = route.request(), u = req.url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
      if (req.method() === 'POST') {
        let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
        if (!Array.isArray(body)) body = [body];
        body.forEach(r => { if (r && r.data_key) cloud.set(r.module_key + '|' + r.data_key, r); });
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      }
      if (req.method() === 'DELETE') {
        const mod = /module_key=eq\.([^&]+)/.exec(u), key = /data_key=eq\.([^&]+)/.exec(u);
        if (mod && key) cloud.delete(decodeURIComponent(mod[1]) + '|' + decodeURIComponent(key[1]));
        return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rowsFor(u)) });
    }
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  const seed = {
    gema_orgs_v1: JSON.stringify(ORGS),
    gema_users_v1: JSON.stringify(USERS),
    gema_session_v1: JSON.stringify({ token: TOKEN, userId, expires: FUTURE }),
    gema_objpool_v1: JSON.stringify(OBJEKTE),
    gema_objekte_v1: JSON.stringify({ objekte: OBJEKTE, beteiligte: [], activeObjektId: '' }),
    gema_coachmarks_done_abnahme: '1'
  };
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, seed);
  return ctx;
}
async function seiteIn(ctx) {
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  return { page, errs };
}

// ── Statik: der frühere Abort ist wirklich weg ────────────────────────────
console.log('— Statik —');
const src = await readFile(join(ROOT, 'pm_abnahme.html'), 'utf8');
ok(!src.includes('Keine Monteure in der Firma gefunden'), 'kein «⚠ Keine Monteure in der Firma gefunden»-Abort mehr im Quelltext');
ok(src.includes('abFindUserByEmailAlle') && src.includes('abKannAbnahmeLesen'), 'Konto-Auflösungs-Helfer vorhanden');
ok(src.includes('abMlDarfKontrollieren'), 'Kontroll-Guard vorhanden');

// ── A) Planerin: Dialog, E-Mail-Prüfung, Übergabe ─────────────────────────
console.log('— A) Planerin: Extern-Übergabe per E-Mail —');
const ctxA = await neuerKontext('u1');
let { page: pA, errs: errsA } = await seiteIn(ctxA);
ok(errsA.length === 0, 'keine pageerrors beim Boot (Planerin)', errsA.slice(0, 2).join(' | '));

const hooks = await pA.evaluate(() => ({
  open: typeof window.abMlOpenAssign === 'function',
  check: typeof window.abMlExtCheck === 'function',
  mode: typeof window.abMlMode === 'function',
  darf: typeof window._abMlDarfKontrollieren === 'function',
  lesen: typeof window._abKannAbnahmeLesen === 'function',
  find: typeof window._abFindUserByEmailAlle === 'function'
}));
ok(hooks.open && hooks.check && hooks.mode, 'Dialog-Funktionen window-exponiert');
ok(hooks.darf && hooks.lesen && hooks.find, 'Guard-/Auflösungs-Hooks window-exponiert');

// Konto-Auflösung + Zugriffs-Vorprüfung gegen die ECHTEN System-Rollen
const aufl = await pA.evaluate(() => {
  const users = GemaAuth.getUsers();
  const u2 = users.find(x => x.id === 'u2'), u3 = users.find(x => x.id === 'u3');
  return {
    perUsername: (window._abFindUserByEmailAlle('hans@luethi.ch') || {}).id,
    perProfilGross: (window._abFindUserByEmailAlle('H.LUETHI@LUETHI.CH') || {}).id,
    inaktivGefunden: (window._abFindUserByEmailAlle('weg@ex.ch') || {}).id,
    unbekannt: window._abFindUserByEmailAlle('niemand@nix.ch'),
    unternehmerDarf: window._abKannAbnahmeLesen(u2),
    lieferantDarf: window._abKannAbnahmeLesen(u3),
    adminDarf: window._abKannAbnahmeLesen({ roleIds: ['role_admin'] }),
    unbekannteRolleDarf: window._abKannAbnahmeLesen({ roleIds: ['role_gibtsnicht'] })
  };
});
ok(aufl.perUsername === 'u2', 'E-Mail matcht den Login-Namen (username)');
ok(aufl.perProfilGross === 'u2', 'E-Mail matcht profile.email — case-insensitive');
ok(aufl.inaktivGefunden === 'u4', 'deaktiviertes Konto wird GEFUNDEN (für die richtige Meldung)');
ok(aufl.unbekannt === null, 'unbekannte E-Mail → null');
ok(aufl.unternehmerDarf === true, 'role_unternehmer hat Abnahme-Zugriff (echte System-Rollen)');
ok(aufl.lieferantDarf === false, 'role_lieferant hat KEINEN Abnahme-Zugriff');
ok(aufl.adminDarf === true, 'role_admin immer');
ok(aufl.unbekannteRolleDarf === true, 'nicht auflösbare Rolle → fail-open (nie auf Verdacht blocken)');

// Objekt wählen + Mängel erfassen (2 offene, 1 erledigter)
await pA.evaluate(() => {
  const sel = document.getElementById('metaObjektDropdown');
  sel.value = 'obj_a'; sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await pA.waitForTimeout(900);
await pA.evaluate(() => {
  const st = window._abState();
  st.items.push(window._abCreateItem({ ort: 'Technikzentrale', mangel: 'Silikonfuge undicht', erledigt: '' }));
  st.items.push(window._abCreateItem({ ort: 'Bad OG', mangel: 'Ablauf verstopft', erledigt: '' }));
  st.items.push(window._abCreateItem({ ort: 'Küche', mangel: 'Bereits behoben', erledigt: '18.08.2026' }));
  window._abRender();
});
await pA.waitForTimeout(2600);   // Auto-Save-Debounce → Protokoll in der Cloud

// Dialog öffnet OHNE eigene Monteure (Planwerk hat keine) und startet extern
await pA.evaluate(() => window.abMlOpenAssign());
const dlg = await pA.evaluate(() => ({
  offen: document.getElementById('mlAssignModal').style.display === 'flex',
  extPrimary: document.getElementById('mlModeExt').classList.contains('primary'),
  extSichtbar: document.getElementById('mlExtBlock').style.display !== 'none',
  teamWeg: document.getElementById('mlTeamBlock').style.display === 'none',
  info: document.getElementById('mlAssignInfo').textContent
}));
ok(dlg.offen, 'Dialog öffnet trotz 0 Monteuren in der Firma (früher: Abort)');
ok(dlg.extPrimary && dlg.extSichtbar && dlg.teamWeg, 'startet direkt im Extern-Modus (Fachplaner-Fall)');
ok(/2 offene/.test(dlg.info), 'Info nennt die 2 offenen Punkte', dlg.info);
ok(/die Punkte selbst kann sie nicht ändern/.test(dlg.info), 'Info sagt «nur abarbeiten, nicht ändern»', dlg.info);

const teamHint = await pA.evaluate(() => {
  window.abMlMode('team');
  const hin = document.getElementById('mlTeamHint').style.display !== 'none';
  const leer = document.getElementById('mlMonteurSel').options.length === 0;
  window.abMlMode('ext');
  return { hin, leer };
});
ok(teamHint.hin && teamHint.leer, 'Team-Modus zeigt den «keine Monteure»-Hinweis statt abzubrechen');

// E-Mail-Zweige
async function extStatus(mail, direkt) {
  return pA.evaluate(({ mail, direkt }) => {
    const i = document.getElementById('mlExtEmail');
    i.value = mail;
    if (direkt) window.abMlExtCheck(); else i.dispatchEvent(new Event('input', { bubbles: true }));
    const st = document.getElementById('mlExtStatus');
    return { text: st.textContent, farbe: st.style.color };
  }, { mail, direkt });
}
let st = await extStatus('niemand@nix.ch', true);
ok(/Kein GEMA-Konto/.test(st.text) && st.farbe === 'rgb(185, 28, 28)', 'unbekannte E-Mail → rot «Kein GEMA-Konto …»', st.text);
st = await extStatus('weg@ex.ch', true);
ok(/deaktiviert/.test(st.text) && !/Kein GEMA-Konto/.test(st.text), 'deaktiviertes Konto → «deaktiviert», nicht «kein Konto»', st.text);
st = await extStatus('lief@bwt.ch', true);
ok(/keinen Zugriff/.test(st.text) && /Lena Lieferant/.test(st.text), 'Konto ohne Modul-Zugriff wird BENANNT geblockt', st.text);
st = await extStatus('hans', true);
ok(st.text === 'E-Mail vollständig eingeben …', 'unvollständige Eingabe → neutraler Hinweis, keine Fehlfarbe', st.text);
st = await extStatus('hans@luethi.ch', false);   // übers echte input-Event (oninput-Verdrahtung)
ok(/✓ GEMA-Konto/.test(st.text) && /Hans Lüthi/.test(st.text) && /Lüthi Haustechnik AG/.test(st.text), 'gültiges Konto → grün mit Name — Firma', st.text);
ok(st.farbe === 'rgb(21, 128, 61)', 'Bestätigung in Grün');

// Übergeben blockt bei ungültigem Stand
await extStatus('niemand@nix.ch', true);
await pA.evaluate(() => window.abMlAssign());
await pA.waitForTimeout(500);
ok(mlRows().length === 0, 'Übergeben ohne gültiges Konto legt KEINEN Record an');

// Übergeben an Hans (extern)
await extStatus('hans@luethi.ch', true);
await pA.evaluate(() => window.abMlAssign());
await pA.waitForTimeout(900);
ok(mlRows().length === 1, 'Übergabe legt genau einen abml:-Record in der Cloud an');
const mlRow = mlRows()[0] ? mlRows()[0][1] : null;
const rec = recOf(mlRow) || {};
ok(rec.monteurUserId === 'u2', 'Record bindet an die userId des Externen');
ok(rec.extern === true && rec.monteurFirma === 'Lüthi Haustechnik AG', 'extern-Flag + Firma des Externen am Record', JSON.stringify({ e: rec.extern, f: rec.monteurFirma }));
ok(rec.monteurEmail === 'h.luethi@luethi.ch', 'monteurEmail = profile.email (zweiter Zustell-Anker)', rec.monteurEmail);
ok(rec.verantwortlich && rec.verantwortlich.userId === 'u1' && rec.verantwortlich.firma === 'Planwerk AG', 'verantwortlich trägt die Herkunfts-Firma', JSON.stringify(rec.verantwortlich));
ok((rec.items || []).length === 2, 'nur die 2 OFFENEN Punkte wandern in die Liste', (rec.items || []).length);
const mlId = rec.id;
const notifU2 = [...cloud.entries()].filter(([k, r]) => k.indexOf('|notif:') > 0 && JSON.stringify(r).indexOf('"empfaengerUserId":"u2"') >= 0);
ok(notifU2.length === 1 && JSON.stringify(notifU2[0][1]).indexOf('von Planwerk AG') >= 0, 'Notify an den Externen nennt die Herkunfts-Firma', notifU2.length);
const dlgZu = await pA.evaluate(() => document.getElementById('mlAssignModal').style.display);
ok(dlgZu === 'none', 'Dialog schliesst nach der Übergabe');
const darfA = await pA.evaluate(id => {
  const ml = window._abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === id);
  return window._abMlDarfKontrollieren(ml);
}, mlId);
ok(darfA === true, 'die Verantwortliche darf kontrollieren');

// E-Mail-Fallback: zweite Liste mit VERWAISTER userId, aber Hans' E-Mail
// (Konto wurde neu angelegt — die E-Mail ist der stabile Anker).
{
  const c = JSON.parse(JSON.stringify(mlRow));
  c.data_key = 'abml:ml_mail';
  const r2 = recOf(c);
  r2.id = 'ml_mail'; r2.monteurUserId = 'u_geloescht'; r2.monteurName = 'Hans (Altkonto)';
  r2.objektName = 'Zweitliste Rebgasse';
  r2.items = [r2.items[0]];
  cloud.set(c.module_key + '|' + c.data_key, c);
}

// ── B) Unternehmer: nur abarbeiten ────────────────────────────────────────
console.log('— B) Unternehmer: sieht, arbeitet ab — kontrolliert nie —');
const ctxB = await neuerKontext('u2');
let { page: pB, errs: errsB } = await seiteIn(ctxB);
await pB.waitForTimeout(1200);
await pB.evaluate(() => window._abRenderTasks());
ok(errsB.length === 0, 'keine pageerrors beim Boot (Unternehmer)', errsB.slice(0, 2).join(' | '));

const panelB = await pB.evaluate(() => {
  const host = document.getElementById('abTasks');
  const karten = [...host.querySelectorAll('.card')].map(c => c.textContent);
  const html = host.innerHTML;
  return { karten, html };
});
ok(panelB.karten.filter(t => /Mängelliste —/.test(t)).length === 2, 'BEIDE Listen erscheinen (userId-Match + E-Mail-Fallback)', panelB.karten.length);
ok(/Zweitliste Rebgasse/.test(panelB.html), 'E-Mail-gematchte Liste (verwaiste userId) wird zugestellt');
ok(/von Anna Planer \(Planwerk AG\)/.test(panelB.html), 'Karte nennt die auftraggebende Person MIT Firma');
ok(!/Zur Kontrolle/.test(panelB.html), 'keine Kontrolle-Karte beim Abarbeiter');
ok(/Silikonfuge undicht/.test(panelB.html), 'Mangeltext steht in der Karte');
const readonlyB = await pB.evaluate(() => {
  const host = document.getElementById('abTasks');
  const inputs = [...host.querySelectorAll('input')];
  return {
    mitMangelWert: inputs.some(i => /Silikonfuge|Ablauf verstopft|Technikzentrale|Bad OG/.test(i.value || '')),
    typen: [...new Set(inputs.map(i => i.type || 'text'))].sort().join(','),
    nurKommentar: inputs.filter(i => i.type !== 'checkbox').every(i => /Kommentar zur Behebung/.test(i.placeholder || ''))
  };
});
ok(!readonlyB.mitMangelWert, 'Ort/Mangel sind NIRGENDS als Eingabefeld editierbar (nur abarbeiten)');
ok(readonlyB.typen === 'checkbox,text' && readonlyB.nurKommentar, 'einzige Eingaben: Erledigt-Checkbox + Behebungs-Kommentar', readonlyB.typen);

const darfB = await pB.evaluate(() => {
  const pool = window._abPoolRead('gema_abnahme_ml_pool_v1');
  return {
    zugewiesen: window._abMlDarfKontrollieren(pool.find(r => r.id !== 'ml_mail')),
    mailMatch: window._abMlDarfKontrollieren(pool.find(r => r.id === 'ml_mail'))
  };
});
ok(darfB.zugewiesen === false, 'Abarbeiter (userId) darf NICHT kontrollieren');
ok(darfB.mailMatch === false, 'Abarbeiter (E-Mail-Match) darf NICHT kontrollieren');

// Kontroll-Aktionen sind auch per Direkt-Aufruf geblockt (Defense-in-Depth)
await pB.evaluate(id => {
  window.GemaDialog = window.GemaDialog || {};
  GemaDialog.confirm = () => Promise.resolve(true);
  GemaDialog.prompt = () => Promise.resolve('hack');
  window.abMlFreigeben(id); window.abMlZurueckweisen(id, 'egal'); window.abMlErneutAbnahme(id);
}, mlId);
await pB.waitForTimeout(700);
const nachBlock = recOf(mlRows().find(([k]) => k.indexOf('ml_mail') < 0)[1]) || {};
ok(nachBlock.status === 'offen', 'Freigeben/Zurückweisen/Erneute-Abnahme durch den Abarbeiter bleiben wirkungslos', nachBlock.status);

// Abarbeiten: alle Punkte abhaken, Kommentar, fertigmelden
await pB.evaluate(id => {
  const ml = window._abPoolRead('gema_abnahme_ml_pool_v1').find(r => r.id === id);
  ml.items.forEach(it => window.abMlItemToggle(id, it.id, true));
  window.abMlItemKommentar(id, ml.items[0].id, 'Fuge neu verfugt');
  window.abMlFertigmelden(id);
}, mlId);
await pB.waitForTimeout(900);
const nachFertig = recOf(mlRows().find(([k]) => k.indexOf('ml_mail') < 0)[1]) || {};
ok(nachFertig.status === 'abgearbeitet', 'Fertigmelden setzt den Status abgearbeitet (Cloud)', nachFertig.status);
const notifU1 = [...cloud.entries()].filter(([k, r]) => k.indexOf('|notif:') > 0 && JSON.stringify(r).indexOf('"empfaengerUserId":"u1"') >= 0 && JSON.stringify(r).indexOf('abgearbeitet') >= 0);
ok(notifU1.length >= 1, 'Notify «abgearbeitet» geht an die Verantwortliche');
await pB.evaluate(() => window._abRenderTasks());
const panelB2 = await pB.evaluate(() => document.getElementById('abTasks').innerHTML);
ok(!/Zur Kontrolle/.test(panelB2), 'auch NACH dem Abarbeiten: keine Kontrolle-Karte beim Externen');

// ── C) Planerin Seite 2: Kontrolle + Freigabe → Protokoll ─────────────────
console.log('— C) Planerin: Kontrolle & Freigabe —');
let { page: pA2, errs: errsA2 } = await seiteIn(ctxA);
await pA2.waitForTimeout(1200);
await pA2.evaluate(() => window._abRenderTasks());
ok(errsA2.length === 0, 'keine pageerrors beim Reload (Planerin)', errsA2.slice(0, 2).join(' | '));
const panelC = await pA2.evaluate(() => document.getElementById('abTasks').innerHTML);
ok(/Zur Kontrolle/.test(panelC), 'Kontrolle-Karte erscheint bei der Verantwortlichen');
ok(/Hans Lüthi \(Lüthi Haustechnik AG\) · ✉️ extern/.test(panelC), 'Karte weist Firma + ✉️-extern-Marker aus');
ok(/💬 Fuge neu verfugt/.test(panelC), 'Behebungs-Kommentar sichtbar');
ok(!/Mängelliste — Neubau Sonnhalde/.test(panelC), 'die Abarbeiter-Karte erscheint NICHT bei der Verantwortlichen');

await pA2.evaluate(id => {
  window.GemaDialog = window.GemaDialog || {};
  GemaDialog.confirm = () => Promise.resolve(true);
  window.abMlFreigeben(id);
}, mlId);
await pA2.waitForTimeout(1000);
const nachFrei = recOf(mlRows().find(([k]) => k.indexOf('ml_mail') < 0)[1]) || {};
ok(nachFrei.status === 'freigegeben', 'Freigeben setzt den Status freigegeben (Cloud)', nachFrei.status);
const rueck = await pA2.evaluate(() => {
  const st = window._abState();
  const a = st.items.find(i => i.mangel === 'Silikonfuge undicht');
  const b = st.items.find(i => i.mangel === 'Ablauf verstopft');
  return { a: a && a.erledigt, b: b && b.erledigt, notiz: a && a.notizen };
});
ok(/\/ Hans Lüthi$/.test(rueck.a || '') && /\/ Hans Lüthi$/.test(rueck.b || ''), 'Erledigung MIT Namen des Externen im Protokoll', JSON.stringify(rueck));
ok(/Fuge neu verfugt/.test(rueck.notiz || ''), 'Kommentar wandert in die Protokoll-Notizen', rueck.notiz);

await browser.close(); server.close();
console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
