// Werkzeugmanagement: Lieferanten-Vorschläge, Zustellung der Defektmeldung
// und Korrigierbarkeit einer Meldung — plus Schadensbericht: Erfassung
// nachträglich bearbeiten und Handy-Ansicht der Erfassungs-Phase.
//
// Hintergrund (Feedback 09.09.2026):
//  «Beim Werkzeugmanagement soll bei den Werkzeugen als Lieferant als erste
//   Vorschläge bereits gebrauchte und registrierte GEMA Lieferanten sein,
//   dass man die dort auswählen kann und danach die anderen, die man schon
//   mal gebraucht hat. Defektmeldungen sollen beim Lieferanten ankommen. […]
//   Ebenso soll der erfasste Defekt löschbar sein, bearbeitbar sein. Oder
//   wenn man aus Versehen geklickt hat, dass man es erledigt hat, soll man
//   dies auch wieder rückgängig machen können. Bei Schadensbericht soll die
//   Erfassung bearbeitbar sein […]. Ebenso stimmt die Ansicht auf dem Handy
//   nicht.»
//
// Bisher: die Vorschlagsliste begann mit den selbst getippten Freitexten,
// die registrierten GEMA-Lieferanten kamen dahinter; eine Defektmeldung
// erreichte den Lieferanten nur, wenn ein Magaziner nachträglich «An
// Lieferant melden» klickte (der Monteur sieht den Knopf nie); eine einmal
// erfasste Meldung liess sich weder ändern noch löschen noch wieder
// öffnen; und die Erfassungs-Phase des Schadensberichts stand in einem
// festen Zweispalter, dessen rechte Karte auf dem Handy ausserhalb des
// Bildschirms lag.
//
// Deckt ab:
//  A) Statik beider Dateien (Reihenfolge-Logik, Zustell-Helfer, Klassen)
//  B) Werkzeug: Vorschlags-Reihenfolge + Gruppen, Verknüpfung beim Wählen
//     und deren Wegfall beim manuellen Tippen, Zustellung an das ganze
//     Lieferanten-Team, Bearbeiten / Löschen / Wieder-Öffnen eines Defekts
//  C) Schadensbericht: sdOpenEdit füllt vor, Speichern ändert denselben
//     Datensatz und lässt Phasen/Fotos unangetastet
//  D) Handy (390 px): kein Querlauf in der Erfassungs-Phase, eine Spalte
//
// Gegenprobe: ohne die Änderungen fallen B1/B3/B4/B5/B6, C1-C3 und D um.
//
// Aufruf:  CHROME=<chromium> node scripts/werkzeug_lieferant_defekt_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8934;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l, extra) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ══════════════════════════════════════════════════════════════════
// A) Statik
// ══════════════════════════════════════════════════════════════════
console.log('— A) Statik —');
const WZ = await readFile(join(ROOT, 'if_werkzeug.html'), 'utf8');
const SD = await readFile(join(ROOT, 'sd_schadensbericht.html'), 'utf8');
const DASH = await readFile(join(ROOT, 'sys_lieferant_dashboard.html'), 'utf8');

ok(/function _wzRegistrierteLieferanten[\s\S]{0,3000}getAllLieferanten/.test(WZ),
  'wz: registrierte Lieferanten kommen aus dem lieferant:-Pool, nicht nur aus Benutzerkonten');
ok(/_wzRegistrierteLieferanten[\s\S]{0,1200}reg\.concat\(regNeu, eigene\)/.test(WZ),
  'wz: Reihenfolge = GEMA (verwendet) → GEMA (weitere) → eigene Freitexte');
ok(/function _wzRegistrierteLieferanten[\s\S]{0,3000}x\.lieferantId===l\.id[\s\S]{0,200}x\.orgId===l\.orgId/.test(WZ),
  'wz: Konto-Auflösung erst über user.lieferantId, dann über die Org — kein «erster Treffer»');
ok(/class="ac-group"/.test(WZ) && /\.ac-group\{/.test(WZ),
  'wz: Gruppen-Kopf im Dropdown ist gestylt und wird gerendert');
ok(/\.ac-group\{[^}]*pointer-events:none/.test(WZ),
  'wz: der Gruppen-Kopf ist nicht klickbar');
ok(/function _wzSendDefektAnLieferant[\s\S]{0,1400}emp\.ids\.forEach/.test(WZ),
  'wz: Zustellung geht an das ganze Lieferanten-Team, nicht nur an ein Konto');
ok(/id="defAnLief"/.test(WZ) && /_liefChk&&_liefChk\.checked\)\?_wzSendDefektAnLieferant/.test(WZ),
  'wz: der Melde-Dialog stellt direkt zu (Haken), nicht erst über den Magaziner');
ok(/kein GEMA-Konto hinterlegt/.test(WZ),
  'wz: nicht zustellbarer Freitext-Lieferant wird BENANNT statt Erfolg vorzutäuschen');
ok(/function _wzCanEditBericht[\s\S]{0,400}b\.typ!=='defekt'\)return false/.test(WZ),
  'wz: nur Defektmeldungen sind änderbar — Prüfberichte bleiben Nachweis');
ok(/function _wzDefektWiederOeffnen/.test(WZ) && /function _wzDefektLoeschen/.test(WZ) && /function _wzDefektBearbeiten/.test(WZ),
  'wz: Wieder-Öffnen, Löschen und Bearbeiten existieren');
ok(/_wzDefektLoeschen[\s\S]{0,800}danger:true/.test(WZ),
  'wz: Löschen fragt über GemaDialog mit danger:true nach');
ok(/fs\.addEventListener\('input',function\(ev\)\{\s*if\(!ev\.isTrusted\) return;[\s\S]{0,300}f_supplierId/.test(WZ),
  'wz: manuelles Tippen löst die Lieferanten-Verknüpfung (nur bei isTrusted)');
ok(/window\._wzReportPhotosChanged[\s\S]{0,900}vorhanden\.concat/.test(WZ),
  'wz: eine zweite Fotowahl hängt an, statt die erste still zu verwerfen');
ok(/nicht übernommen — maximal 3 pro Bericht/.test(WZ),
  'wz: der 3er-Deckel wird benannt (No-silent-caps)');
ok(/function _dwzIstMeinLieferantTool[\s\S]{0,600}supplierLieferantId/.test(DASH),
  'dash: Lieferanten-Sicht erkennt Geräte auch über die Firmen-Verknüpfung');

ok(/function sdOpenEdit/.test(SD) && /window\.sdOpenEdit = sdOpenEdit/.test(SD),
  'sd: sdOpenEdit existiert und ist window-exponiert (Inline-onclick)');
ok(/if \(editId\) \{[\s\S]{0,1600}alt\.titel = titel/.test(SD),
  'sd: sdSaveNew schreibt beim Bearbeiten in den bestehenden Datensatz');
ok(!/if \(editId\) \{[\s\S]{0,1600}alt\.raeume =/.test(SD),
  'sd: die Räume werden im Bearbeiten-Dialog NICHT überschrieben (Fotos blieben sonst verwaist)');
ok(/if \(editId\) \{[\s\S]{0,1600}if \(!alt\.orgId && u && u\.orgId\) alt\.orgId = u\.orgId/.test(SD),
  'sd: fehlende orgId wird nachgestempelt, eine bestehende nie überschrieben (RLS v2)');
ok(/\.erf-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(SD),
  'sd: Erfassungs-Raster nutzt minmax(0,1fr) statt 1fr (sonst min-content-Überlauf)');
ok(/\.erf-grid\{grid-template-columns:1fr\}/.test(SD),
  'sd: auf dem Handy eine Spalte (Regel vorhanden — gemessen wird in D)');
ok(!/grid-template-columns:1fr 1fr;gap:12px'/.test(SD),
  'sd: kein fest verdrahteter Zweispalter mehr im Erfassungs-Render');

// ══════════════════════════════════════════════════════════════════
// Seeds
// ══════════════════════════════════════════════════════════════════
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig';

const USERS = [
  { id: 'u_mag', username: 'm@t.ch', name: 'Magazinerin', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'm@t.ch', firma: 'T AG' } },
  // Lieferanten-Team von «Engel Werkzeuge AG» (zwei Konten, beide sollen die Meldung sehen)
  { id: 'u_lief1', username: 'a@engel.ch', name: 'A. Engel', roleIds: ['role_lieferant_admin'], orgId: 'org_engel', lieferantId: 'lief_engel', active: true, profile: { firma: 'Engel Werkzeuge AG' } },
  { id: 'u_lief2', username: 'b@engel.ch', name: 'B. Engel', roleIds: ['role_lieferant_produkte'], orgId: 'org_engel', lieferantId: 'lief_engel', active: true, profile: { firma: 'Engel Werkzeuge AG' } },
  { id: 'u_lief3', username: 'c@sfs.ch', name: 'C. SFS', roleIds: ['role_produktlieferant'], orgId: 'org_sfs', lieferantId: 'lief_sfs', active: true, profile: { firma: 'SFS Group' } }
];
const TOOLS = [
  { id: 't1', name: 'Winkelschleifer', cat: 'maschine', orgId: 'org_t', bought: '2024-01-10', supplier: 'Engel Werkzeuge AG', supplierId: 'u_lief1', supplierLieferantId: 'lief_engel', berichte: [] },
  { id: 't2', name: 'Bohrhammer', cat: 'maschine', orgId: 'org_t', bought: '2024-02-10', supplier: 'Baumarkt Meier', supplierId: '', berichte: [] },
  { id: 't3', name: 'Leiter 3m', cat: 'leiter', orgId: 'org_t', bought: '2024-03-10', supplier: 'Baumarkt Meier', supplierId: '', berichte: [] }
];
const LIEFERANTEN = [
  { id: 'lief_engel', orgId: 'org_engel', firma: 'Engel Werkzeuge AG', status: 'aktiv', lieferantKategorien: ['werkzeuge'] },
  { id: 'lief_sfs', orgId: 'org_sfs', firma: 'SFS Group', status: 'aktiv', lieferantKategorien: ['werkzeuge'] },
  // Anlagenlieferant ohne Werkzeug-Sortiment → darf NICHT vorgeschlagen werden
  { id: 'lief_pumpe', orgId: 'org_p', firma: 'Pumpen Muster AG', status: 'aktiv', lieferantKategorien: ['saugpumpe'] }
];
const seedWz = {
  gema_orgs_v1: [
    { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_mag'], active: true },
    { id: 'org_engel', name: 'Engel Werkzeuge AG', kategorie: 'lieferant', active: true },
    { id: 'org_sfs', name: 'SFS Group', kategorie: 'lieferant', active: true }
  ],
  gema_users_v1: USERS,
  gema_session_v1: { token: TOKEN, userId: 'u_mag', expires: FUTURE },
  gema_objekte_v1: { objekte: [], beteiligte: [], activeObjektId: '' }
};
// Die Pools kommen aus der (gemockten) Cloud — ein Seed rein im
// localStorage wuerde vom bindCollection-Pull ueberschrieben.
const zeile = (k, d) => ({ data_key: k, payload: { data: d, _lm: '2026-09-01T08:00:00Z' } });
const CLOUD = {
  werkzeugmanagement: TOOLS.map(t => zeile('tool:' + t.id, t)),
  produktkatalog: LIEFERANTEN.map(l => zeile('lieferant:' + l.id, l))
};

const browser = await chromium.launch({ executablePath: CHROME });
async function neuerCtx(seed, viewport, cloud) {
  const ctx = await browser.newContext(viewport ? { viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {});
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
    if (isSb) {
      if (route.request().method() === 'GET' && cloud) {
        const mod = Object.keys(cloud).find(m => u.indexOf('module_key=eq.' + m) >= 0);
        if (mod) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(cloud[mod]) });
      }
      return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    }
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seed);
  return ctx;
}

// ══════════════════════════════════════════════════════════════════
// B) Werkzeugmanagement
// ══════════════════════════════════════════════════════════════════
let ctx = await neuerCtx(seedWz, null, CLOUD);
let page = await ctx.newPage();
const errsWz = []; page.on('pageerror', e => errsWz.push(e.message));
await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window._wzHooks && _wzHooks.tools().length >= 3, null, { timeout: 9000 }).catch(() => {});
// GemaNotify-Aufrufe mitschneiden, statt sie zu verschicken
await page.evaluate(() => {
  window.__notify = [];
  if (!window.GemaNotify) window.GemaNotify = {};
  window.GemaNotify.push = function (n) { window.__notify.push(n); return Promise.resolve(); };
});

console.log('— B1) Vorschlags-Reihenfolge im Lieferanten-Feld —');
const sug = await page.evaluate(() => _wzSupplierSuggestions('').map(s => ({ l: s.label, g: s.group, sid: s.supplierId, lid: s.lieferantId })));
ok(sug.length >= 3, 'Vorschläge vorhanden', sug);
ok(sug[0] && sug[0].l === 'Engel Werkzeuge AG' && /bereits verwendet/.test(sug[0].g || ''),
  'zuoberst der registrierte GEMA-Lieferant, der schon verwendet wurde', sug[0]);
ok(sug[1] && sug[1].l === 'SFS Group' && /Weitere GEMA/.test(sug[1].g || ''),
  'danach die übrigen registrierten GEMA-Lieferanten', sug[1]);
ok(sug[2] && sug[2].l === 'Baumarkt Meier' && /verwendet/.test(sug[2].g || '') && !sug[2].supplierId,
  'zuletzt der frühere Freitext-Eintrag (ohne Verknüpfung)', sug[2]);
ok(!sug.some(s => s.l === 'Pumpen Muster AG'),
  'ein Lieferant ohne Werkzeug-Sortiment wird nicht vorgeschlagen');
ok(sug[0] && sug[0].sid === 'u_lief1' && sug[0].lid === 'lief_engel',
  'der registrierte Lieferant trägt Konto- UND Firmen-Verknüpfung', sug[0]);
const sugQ = await page.evaluate(() => _wzSupplierSuggestions('sfs').map(s => s.label));
ok(sugQ.length === 1 && sugQ[0] === 'SFS Group', 'Tippen filtert die Liste', sugQ);

console.log('— B2) Verknüpfung im Formular —');
await page.evaluate(() => { openAdd(); });
await page.waitForTimeout(200);
const link = await page.evaluate(async () => {
  const inp = document.getElementById('f_supplier');
  inp.focus(); inp.dispatchEvent(new Event('focus'));
  inp.value = 'SFS'; inp.dispatchEvent(new Event('input'));
  await new Promise(r => setTimeout(r, 120));
  const drop = document.querySelector('.ac-drop[data-ac-for="f_supplier"]');
  const gruppen = [...drop.querySelectorAll('.ac-group')].map(e => e.textContent);
  const item = drop.querySelector('.ac-item');
  item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  const nach = { v: inp.value, sid: document.getElementById('f_supplierId').value, lid: document.getElementById('f_supplierLieferantId').value };
  return { gruppen, nach };
});
ok(link.gruppen.length >= 1, 'das Dropdown zeigt Gruppen-Köpfe', link.gruppen);
ok(link.nach.v === 'SFS Group' && link.nach.sid === 'u_lief3' && link.nach.lid === 'lief_sfs',
  'die Auswahl setzt Konto- und Firmen-ID', link.nach);
const nachTippen = await page.evaluate(() => {
  const inp = document.getElementById('f_supplier');
  inp.value = 'Ein anderer Händler';
  inp.dispatchEvent(new InputEvent('input', { bubbles: true }));   // isTrusted=false → darf NICHTS lösen
  const synth = { sid: document.getElementById('f_supplierId').value, lid: document.getElementById('f_supplierLieferantId').value };
  return synth;
});
ok(nachTippen.sid === 'u_lief3', 'ein synthetisches input-Event löst die Verknüpfung NICHT (AutoSave/Restore)', nachTippen);
await page.focus('#f_supplier');
await page.fill('#f_supplier', '');
await page.type('#f_supplier', 'Ein anderer Händler', { delay: 5 });
const nachEcht = await page.evaluate(() => ({ sid: document.getElementById('f_supplierId').value, lid: document.getElementById('f_supplierLieferantId').value }));
ok(!nachEcht.sid && !nachEcht.lid, 'echtes Tippen löst die Verknüpfung', nachEcht);
await page.evaluate(() => { closeAdd(); });

console.log('— B3) Defektmeldung erreicht den Lieferanten —');
await page.evaluate(() => { window.__notify = []; openDefektMelden('t1'); });
await page.waitForTimeout(150);
const dlg = await page.evaluate(() => {
  const c = document.getElementById('defAnLief');
  return { da: !!c, checked: !!(c && c.checked), text: document.body.innerText.indexOf('Engel Werkzeuge AG') >= 0 };
});
ok(dlg.da && dlg.checked, 'der Dialog bietet «Lieferant informieren», vorbelegt');
ok(dlg.text, 'der hinterlegte Lieferant wird im Dialog genannt');
await page.evaluate(() => {
  document.getElementById('defTitel').value = 'Akku defekt';
  document.getElementById('defBeschr').value = 'Lädt nicht mehr';
  _wzSaveDefekt('t1');
});
await page.waitForTimeout(200);
const nach1 = await page.evaluate(() => ({
  notif: window.__notify.map(n => ({ e: n.eventKey, u: n.empfaengerUserId, r: n.empfaengerRoleId })),
  ber: JSON.parse(JSON.stringify((_wzHooks.byId('t1').berichte) || []))
}));
const liefNotif = nach1.notif.filter(n => n.e === 'werkzeug_defekt_lieferant').map(n => n.u).sort();
ok(liefNotif.join(',') === 'u_lief1,u_lief2', 'die Meldung geht an das GANZE Lieferanten-Team', liefNotif);
ok(nach1.notif.some(n => n.e === 'werkzeug_defekt' && n.r === 'role_magaziner'), 'der Magaziner wird weiterhin informiert');
ok(nach1.ber.length === 1 && !!nach1.ber[0].anLieferantGemeldet, 'der Bericht ist als «an Lieferant gemeldet» gestempelt');
// Gerät ohne verknüpften Lieferanten: kein Haken, keine stille Zustellung
await page.evaluate(() => { window.__notify = []; openDefektMelden('t2'); });
await page.waitForTimeout(120);
const dlg2 = await page.evaluate(() => ({ da: !!document.getElementById('defAnLief'), hinweis: /kein GEMA-Konto/.test(document.body.innerText) }));
ok(!dlg2.da && dlg2.hinweis, 'Freitext-Lieferant: kein Haken, dafür ein ehrlicher Hinweis', dlg2);
await page.evaluate(() => { _wzCloseModal(); });

console.log('— B4) Defektmeldung bearbeiten —');
const berId = nach1.ber[0].id;
await page.evaluate((id) => { _wzDefektBearbeiten('t1', id); }, berId);
await page.waitForTimeout(150);
const vorbef = await page.evaluate(() => ({
  titel: document.getElementById('defTitel').value,
  beschr: document.getElementById('defBeschr').value,
  sev: document.getElementById('defSev').value
}));
ok(vorbef.titel === 'Akku defekt' && vorbef.beschr === 'Lädt nicht mehr' && vorbef.sev === 'mittel',
  'der Bearbeiten-Dialog ist mit den gespeicherten Werten vorbefüllt', vorbef);
await page.evaluate((id) => {
  document.getElementById('defTitel').value = 'Akku UND Ladegerät defekt';
  document.getElementById('defSev').value = 'schwer';
  _wzSaveDefektEdit('t1', id);
}, berId);
await page.waitForTimeout(200);
const nach2 = await page.evaluate(() => JSON.parse(JSON.stringify(_wzHooks.byId('t1').berichte)));
ok(nach2.length === 1 && nach2[0].titel === 'Akku UND Ladegerät defekt' && nach2[0].schweregrad === 'schwer',
  'die Änderung landet im SELBEN Bericht (keine Dublette)', nach2.map(b => b.titel));
ok(!!nach2[0].geaendertAm, 'die Korrektur bleibt als solche erkennbar (geaendertAm)');
ok(!!nach2[0].anLieferantGemeldet, 'der Zustell-Stempel überlebt die Bearbeitung');

console.log('— B5) Erledigt versehentlich geklickt → wieder öffnen —');
await page.evaluate((id) => { _wzDefektErledigt('t1', id); }, berId);
await page.waitForTimeout(150);
let erl = await page.evaluate(() => _wzHooks.byId('t1').berichte[0].erledigt);
ok(erl === true, 'als erledigt markiert');
let badge = await page.evaluate(() => _wzBadDefect(_wzHooks.byId('t1')));
ok(badge === false, 'kein offener Defekt mehr am Gerät');
await page.evaluate((id) => { _wzDefektWiederOeffnen('t1', id); }, berId);
await page.waitForTimeout(150);
const auf = await page.evaluate(() => {
  const b = _wzHooks.byId('t1').berichte[0];
  return { erledigt: b.erledigt, am: b.erledigtAm, badge: _wzBadDefect(_wzHooks.byId('t1')) };
});
ok(auf.erledigt === false && !auf.am && auf.badge === true, 'Wieder-Öffnen stellt den offenen Defekt her', auf);

console.log('— B6) Defektmeldung löschen —');
await page.evaluate((id) => {
  window.GemaDialog.confirm = function () { return Promise.resolve(true); };
  _wzDefektLoeschen('t1', id);
}, berId);
await page.waitForTimeout(250);
const nach3 = await page.evaluate(() => _wzHooks.byId('t1').berichte.length);
ok(nach3 === 0, 'die Meldung ist weg', nach3);
// Prüfberichte bleiben unantastbar
const schutz = await page.evaluate(() => {
  const t = _wzHooks.byId('t1');
  t.berichte = [{ id: 'b_pr', typ: 'pruefbericht', titel: 'Elektroprüfung', autorUserId: 'u_mag' }];
  return _wzCanEditBericht(t, t.berichte[0]);
});
ok(schutz === false, 'ein Prüfbericht lässt sich nicht über diesen Weg ändern/löschen');
ok(errsWz.length === 0, 'keine JS-Fehler im Werkzeugmodul', errsWz.slice(0, 3));
await ctx.close();

// ══════════════════════════════════════════════════════════════════
// C+D) Schadensbericht
// ══════════════════════════════════════════════════════════════════
const SD_T = {
  id: 'sd_t', titel: 'Wasserschaden Bad', typ: 'wasserschaden', objektId: 'obj1', orgId: 'org_t',
  phase: 'analyse', beschreibung: 'Erste Beschreibung', ursache: '', raeume: ['Bad EG', 'Küche'],
  erstelltAm: '2026-07-01', erstelltVon: { userId: 'u_p', name: 'Planerin' },
  versicherung: { name: '', policeNr: '', schadenNr: '', kontakt: '' },
  zustandsanalyse: { leckortung: 'Leck an Steigleitung', schadenausmass: '', massnahmen: [], fotos: [{ id: 'f1', dataUrl: 'x', kommentar: 'Wand', imBericht: true, raum: 'Bad EG' }], abgeschlossenAm: null },
  trocknung: { gestartetAm: null, beendetAm: null, messpunkte: [], geraete: [], fotos: [], notizen: '' },
  abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
};
const seedSd = {
  gema_orgs_v1: [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_p'], active: true }],
  gema_users_v1: [{ id: 'u_p', username: 'p@t.ch', name: 'Planerin', roleIds: ['role_planer'], orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } }],
  gema_session_v1: { token: TOKEN, userId: 'u_p', expires: FUTURE },

  gema_objekte_v1: { objekte: [], beteiligte: [], activeObjektId: '' }
};
const OBJEKTE = [
  { id: 'obj1', name: 'MFH Musterweg 3', bezeichnung: 'MFH Musterweg 3', strasse: 'Musterweg 3', plz: '8000', ort: 'Zürich', status: 'aktiv', orgId: 'org_t' },
  { id: 'obj2', name: 'Sonnenhalde C', bezeichnung: 'Sonnenhalde C', strasse: 'Sonnenweg 12', plz: '6003', ort: 'Luzern', status: 'aktiv', orgId: 'org_t' }
];

ctx = await neuerCtx(seedSd, { width: 390, height: 844 }, {
  schadensbericht: [zeile('schaden:sd_t', SD_T)],
  objekte: OBJEKTE.map(o => zeile('objekt:' + o.id, o))
});
page = await ctx.newPage();
const errsSd = []; page.on('pageerror', e => errsSd.push(e.message));
await page.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window.schaeden || []).length >= 1 && (typeof GemaObjekte !== 'undefined') && GemaObjekte.getAll().length >= 2, null, { timeout: 9000 }).catch(() => {});
await page.evaluate(() => sdOpenDetail('sd_t'));
await page.waitForTimeout(400);

console.log('— C1) Erfassung nachträglich bearbeiten —');
const knopf = await page.evaluate(() => !!document.querySelector('#acc_erfasst button[onclick*="sdOpenEdit"]'));
ok(knopf, 'die Erfassungs-Phase bietet «Erfassung bearbeiten»');
await page.evaluate(() => sdOpenEdit('sd_t'));
await page.waitForTimeout(250);
const vor = await page.evaluate(() => ({
  offen: !document.getElementById('addModal').classList.contains('hidden'),
  titel: document.getElementById('f_titel').value,
  typ: document.getElementById('f_typ').value,
  beschr: document.getElementById('f_beschreibung').value,
  obj: document.getElementById('f_objekt').value,
  datum: document.getElementById('f_datum').value,
  hd: document.getElementById('addModalTitle').textContent,
  raeumeSichtbar: (function () { var t = document.querySelector('#addModal .tag-input'); return t ? getComputedStyle(t).display !== 'none' : null; })()
}));
ok(vor.offen && vor.titel === 'Wasserschaden Bad' && vor.typ === 'wasserschaden' && vor.beschr === 'Erste Beschreibung' && vor.obj === 'obj1' && vor.datum === '2026-07-01',
  'das Formular ist mit den gespeicherten Werten vorbefüllt', vor);
ok(/bearbeiten/i.test(vor.hd), 'der Dialog heisst «Erfassung bearbeiten»', vor.hd);
ok(vor.raeumeSichtbar === false, 'die Räume-Eingabe ist im Bearbeiten-Modus aus (sie wird migrationssicher in der Phase gepflegt)');

console.log('— C2) Speichern ändert denselben Datensatz —');
await page.evaluate(() => {
  document.getElementById('f_titel').value = 'Wasserschaden Bad 2. OG';
  document.getElementById('f_ursache').value = 'Korrosion';
  document.getElementById('f_objekt').value = 'obj2';
  document.getElementById('f_vers_name').value = 'Mobiliar';
  sdSaveNew();
});
await page.waitForTimeout(300);
const nachSd = await page.evaluate(() => ({
  anzahl: window.schaeden.length,
  s: JSON.parse(JSON.stringify(window.sdGetById('sd_t'))),
  modalZu: document.getElementById('addModal').classList.contains('hidden')
}));
ok(nachSd.anzahl === 1, 'kein zweiter Datensatz — es wird derselbe geändert', nachSd.anzahl);
ok(nachSd.s.titel === 'Wasserschaden Bad 2. OG' && nachSd.s.ursache === 'Korrosion' && nachSd.s.objektId === 'obj2' && nachSd.s.versicherung.name === 'Mobiliar',
  'Titel, Ursache, Objekt und Versicherung sind übernommen', { t: nachSd.s.titel, o: nachSd.s.objektId });
ok(nachSd.s.phase === 'analyse' && nachSd.s.zustandsanalyse.leckortung === 'Leck an Steigleitung' && nachSd.s.zustandsanalyse.fotos.length === 1,
  'Phase, Analysetexte und Fotos bleiben unangetastet');
ok(JSON.stringify(nachSd.s.raeume) === JSON.stringify(['Bad EG', 'Küche']), 'die Räume bleiben unverändert', nachSd.s.raeume);
ok(nachSd.modalZu, 'der Dialog schliesst nach dem Speichern');

console.log('— C3) Neu-Erfassung bleibt Neu-Erfassung —');
await page.evaluate(() => { sdCloseDetail(); sdOpenNew(); });
await page.waitForTimeout(200);
const neu = await page.evaluate(() => ({
  titel: document.getElementById('f_titel').value,
  hd: document.getElementById('addModalTitle').textContent,
  raeume: (function () { var t = document.querySelector('#addModal .tag-input'); return t ? getComputedStyle(t).display !== 'none' : null; })()
}));
ok(!neu.titel && /Neuen Schaden/.test(neu.hd) && neu.raeume === true,
  'nach dem Bearbeiten öffnet «Neuer Schaden» wieder leer und mit Räume-Eingabe', neu);
await page.evaluate(() => {
  document.getElementById('f_typ').value = 'rohrbruch';
  document.getElementById('f_titel').value = 'Zweiter Fall';
  document.getElementById('f_objekt').value = 'obj1';
  sdSaveNew();
});
await page.waitForTimeout(300);
const zwei = await page.evaluate(() => window.schaeden.length);
ok(zwei === 2, 'ein neuer Schaden wird weiterhin angelegt', zwei);

console.log('— D) Handy-Ansicht der Erfassungs-Phase (390 px) —');
await page.evaluate(() => { try { sdCloseAdd(); } catch (e) {} sdOpenDetail('sd_t'); });
await page.waitForTimeout(400);
const mob = await page.evaluate(() => {
  const acc = document.getElementById('acc_erfasst');
  if (acc && !acc.classList.contains('open')) sdToggleAcc('erfasst');
  const grid = acc.querySelector('.erf-grid');
  // Nur Elemente zählen, die NICHT bewusst clippen (.acc-title kürzt per
  // text-overflow:ellipsis — das ist Absicht, kein Querlauf).
  const ueber = [...document.querySelectorAll('#detailInner *')]
    .filter(el => el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0
      && getComputedStyle(el).overflowX === 'visible')
    .map(el => String(el.className || el.tagName).slice(0, 40));
  const sel = document.querySelector('.erf-objsel');
  const karten = [...acc.querySelectorAll('.sum-card')].map(c => Math.round(c.getBoundingClientRect().right));
  return {
    cols: grid ? getComputedStyle(grid).gridTemplateColumns : '-',
    ueber, win: window.innerWidth,
    selW: sel ? Math.round(sel.getBoundingClientRect().width) : 0,
    maxRight: Math.max.apply(null, karten),
    doppelWarn: /⚠ ⚠/.test(document.getElementById('detailInner').textContent)
  };
});
ok(mob.ueber.length === 0, 'kein Element in der Detailansicht läuft quer', mob.ueber);
ok(mob.cols.split(' ').length === 1, 'die Erfassungs-Karten stehen einspaltig', mob.cols);
ok(mob.maxRight <= mob.win, 'keine Karte liegt ausserhalb des Bildschirms', mob);
ok(mob.selW > 200, 'die Objekt-Auswahl ist bedienbar breit', mob.selW);
ok(!mob.doppelWarn, 'kein doppeltes ⚠ bei fehlendem Objekt');
ok(errsSd.length === 0, 'keine JS-Fehler im Schadensbericht', errsSd.slice(0, 3));

await browser.close();
server.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
