// Feedback-Umsetzung 07/2026 (Sandro): pm_abnahme + sb_apparateliste.
//  pm_abnahme: Anhang-Tab (Plan/Zusatzblatt), Art der Abnahme (Sichtkontrolle/
//  Teil-/Schlussabnahme), Geprüfter-Teil-Schnellwahl (komplett→gesperrt,
//  Steigzone/Einlage mit Zusatzfeldern), Ergebnis→Entscheid-Automatik +
//  SIA-118-Zusatztexte, Mangel⇄Pendenz pro Punkt, Status «teilweise erledigt»,
//  Fotos rechts (grösser, mehrere), «Durch wen»-Vorschlag aus dem Unternehmer,
//  Unterschriften Name/Vorname + Firma-Vorbefüllung + einzeln speicherbar,
//  BKP-Katalog als Arbeitsgattungs-Vorschläge.
//  sb_apparateliste: Ausbaustandard (einfach/mittel/hoch), Abmessungen
//  (Standardmasse + eigenes Mass), Waschtisch-Zubehör (Befestigung/Siphon/
//  Schallschutz) + Garnituren (Glashalter/Handtuchhalter/…), WC-Garnituren.
//
// Aufruf:  CHROME=<chromium> node scripts/abnahme_feedback_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8894;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };
const PX = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/pm_abnahme.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return route.fulfill({ contentType: 'application/json', body: '[]' });
  if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
  return route.abort();
});
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  { gema_orgs_v1: JSON.stringify([ORG]), gema_users_v1: JSON.stringify(USERS), gema_session_v1: JSON.stringify(SESSION) });

/* ════════ pm_abnahme ════════ */
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

console.log('— Boot + Anhang-Tab —');
ok(errs.length === 0, 'keine pageerrors beim Boot (' + errs.slice(0, 2).join(' | ') + ')');
ok(await page.$('#tab_anhang') != null, 'Anhang-Tab vorhanden');
await page.click('#tab_anhang');
await page.waitForTimeout(250);
ok(await page.evaluate(() => document.getElementById('view_anhang').style.display !== 'none'), 'Anhang-Ansicht sichtbar');
// Anhang seeden (FileReader umgehen) → Liste + Typ-Select
await page.evaluate(() => {
  window._abState().anhaenge = [{ name: 'Plan_OG.pdf', typ: 'plan', dataUrl: 'data:application/pdf;base64,JVBERi0=', type: 'application/pdf', uploadedAt: new Date().toISOString() }];
  window._anhRender();
});
const anh = await page.evaluate(() => ({
  txt: document.getElementById('anhangList').textContent,
  sel: (document.querySelector('#anhangList select') || {}).value
}));
ok(anh.txt.indexOf('Plan_OG.pdf') >= 0, 'Anhang gelistet');
ok(anh.sel === 'plan', 'Typ-Select (Plan/Zusatzblatt) vorbelegt');

console.log('— Art der Abnahme (Sichtkontrolle/Teil-/Schlussabnahme) —');
await page.click('#tab_abnahme');
await page.selectOption('#protoArt', 'sichtkontrolle');
await page.waitForTimeout(150);
const pa = await page.evaluate(() => ({
  titel: document.getElementById('protoArtTitle').textContent,
  st: window._abState().abnahme.protokollArt
}));
ok(pa.titel === 'Sichtkontrolle' && pa.st === 'sichtkontrolle', 'Titel folgt der Wahl («' + pa.titel + '»)');
await page.selectOption('#protoArt', 'schlussabnahme');
ok((await page.evaluate(() => document.getElementById('protoArtTitle').textContent)) === 'Schlussabnahme', 'Wechsel auf Schlussabnahme');

console.log('— Geprüfter Teil: Schnellwahl —');
await page.selectOption('#geprueftTyp', 'komplett');
await page.waitForTimeout(150);
let gt = await page.evaluate(() => ({ dis: document.getElementById('gepruefterTeil').disabled, val: window._abState().abnahme.gepruefterTeil }));
ok(gt.dis && gt.val === 'Komplettes Werk', 'Komplettes Werk → Feld ausgegraut + Text gesetzt');
await page.selectOption('#geprueftTyp', 'steigzone');
await page.waitForTimeout(150);
ok(await page.$('#gtGeschoss') != null && await page.$('#gtSteigzone') != null, 'Steigzone → Zusatzfelder (Geschoss/Raum/Steigzone/Wohnung)');
await page.fill('#gtGeschoss', 'EG');
await page.fill('#gtSteigzone', 'S1');
gt = await page.evaluate(() => window._abState().abnahme.gepruefterTeil);
ok(/Steigzone\/Vorwand — Geschoss EG.*Steigzone S1/.test(gt), 'Text automatisch zusammengesetzt («' + gt + '»)');
await page.selectOption('#geprueftTyp', 'einlage');
await page.waitForTimeout(150);
await page.fill('#gtGeschoss', 'OG1');
gt = await page.evaluate(() => window._abState().abnahme.gepruefterTeil);
ok(/Einlage: Decke über OG1 \(komplett\)/.test(gt), 'Einlage-Variante mit Geschoss + Umfang («' + gt + '»)');
await page.selectOption('#geprueftTyp', 'frei');

console.log('— Ergebnis → Entscheid automatisch + SIA-Zusatztexte —');
await page.check('#ergKeine');
await page.waitForTimeout(200);
let ez = await page.evaluate(() => ({ ent: window._abState().abnahme.entscheid, chk: document.getElementById('entAbgenommen').checked, zus: document.getElementById('siaZusatz').textContent }));
ok(ez.ent === 'abgenommen' && ez.chk, 'Keine Mängel → Entscheid automatisch «abgenommen»');
ok(ez.zus.indexOf('mängelfrei') >= 0, 'SIA-Zusatztext zum Ergebnis sichtbar');
await page.check('#ergWes');
await page.waitForTimeout(200);
ez = await page.evaluate(() => ({ ent: window._abState().abnahme.entscheid, chk: document.getElementById('entZurueck').checked }));
ok(ez.ent === 'zurueckgestellt' && ez.chk, 'Wesentliche Mängel → Entscheid automatisch «zurückgestellt»');
await page.check('#ergUnw');
await page.waitForTimeout(200);
ok((await page.evaluate(() => window._abState().abnahme.entscheid)) === 'zurueckgestellt', 'Unwesentliche Mängel → Entscheid bleibt manuell (unverändert)');
await page.check('#chkArt158');
await page.waitForTimeout(150);
ok((await page.evaluate(() => document.getElementById('siaZusatz').textContent)).indexOf('158') >= 0, 'Art. 158 Abs. 2 → Zusatztext unten ergänzt');

console.log('— Unterschriften: Name/Vorname + Firma von oben + einzeln speicherbar —');
await page.evaluate(() => { const st = window._abState(); st.abnahme.unternehmer = 'Muster Haustechnik AG, Basel'; st.abnahme.bauherr = 'Bauherr GmbH'; window._abRender(); });
const sig = await page.evaluate(() => ({
  lblName: Array.from(document.querySelectorAll('.sig-meta label')).some(l => l.textContent === 'Name / Vorname'),
  lblFirma: Array.from(document.querySelectorAll('.sig-meta label')).some(l => l.textContent === 'Firma'),
  untFirma: document.getElementById('sigUnternehmerVisum').value,
  bhFirma: document.getElementById('sigBauherrVisum').value,
  saveBtns: document.querySelectorAll('[data-sig-save]').length
}));
ok(sig.lblName && sig.lblFirma, 'Labels «Name / Vorname» + «Firma»');
ok(sig.untFirma === 'Muster Haustechnik AG', 'Firma des Unternehmers aus dem Kopf vorbefüllt');
ok(sig.bhFirma === 'Bauherr GmbH', 'Firma des Bauherrn aus dem Kopf vorbefüllt');
ok(sig.saveBtns === 4, 'jede Unterschrift einzeln speicherbar (4 × 💾)');

console.log('— «Durch wen»-Vorschlag aus dem Unternehmer —');
ok((await page.evaluate(() => window._abCreateItem({}).kuerzel)) === 'Muster Haustechnik AG', 'Neuer Punkt: Durch-wen = Unternehmer (überschreibbar)');

console.log('— BKP-Katalog als Arbeitsgattung —');
ok((await page.evaluate(() => document.querySelectorAll('#bkpGattungen option').length)) > 300, 'komplette BKP-Liste als Vorschläge (>300)');

console.log('— Mangel ⇄ Pendenz + teilweise erledigt + Fotos rechts —');
await page.click('#tab_maengel');
await page.waitForTimeout(300);
await page.click('.mangel-card .mangel-summary');   // ersten Punkt öffnen
await page.waitForTimeout(300);
ok(await page.$('.mangel-detail.open .typ-seg') != null, 'Mangel/Pendenz-Umschalter im Detail');
await page.click('.mangel-detail.open [data-typ="pendenz"]');
await page.waitForTimeout(300);
const typ = await page.evaluate(() => ({
  st: window._abState().items[0].typ,
  pill: (document.querySelector('.mangel-card .typ-pill') || {}).textContent
}));
ok(typ.st === 'pendenz' && typ.pill === 'Pendenz', 'Punkt als Pendenz markiert (Badge sichtbar)');
await page.click('.mangel-detail.open [data-action="markTeilweise"]');
await page.waitForTimeout(300);
const teil = await page.evaluate(() => ({
  st: window._abState().items[0].teilweise,
  badge: (document.querySelector('.mangel-card .status-badge') || {}).textContent
}));
ok(teil.st === true && /Teilweise erledigt/.test(teil.badge), 'Status «🟡 Teilweise erledigt»');
await page.click('#mf_teil');
await page.waitForTimeout(250);
ok((await page.evaluate(() => document.querySelectorAll('.mangel-card').length)) === 1, 'Filter «Teilweise» zeigt genau diesen Punkt');
await page.click('#mf_all');
await page.waitForTimeout(250);
// Foto seeden → erscheint RECHTS im 2-spaltigen Grid
await page.evaluate(px => {
  const st = window._abState();
  st.items[0].photos.push({ name: 't.jpg', dataUrl: px, type: 'image/jpeg' });
  window._abRender();
}, PX);
await page.waitForTimeout(250);
const foto = await page.evaluate(() => {
  const detail = document.querySelector('.mangel-detail.open');
  const grid = detail && detail.querySelector('.foto-grid-r');
  const rightCol = detail && detail.querySelectorAll('.detail-grid > .card')[1];
  return { hasGrid: !!grid, inRight: !!(rightCol && rightCol.querySelector('.foto-grid-r')), imgs: grid ? grid.querySelectorAll('img').length : 0 };
});
ok(foto.hasGrid && foto.imgs === 1, 'Foto im grossen 2-spaltigen Grid');
ok(foto.inRight, 'Fotos stehen in der RECHTEN Spalte');
ok(errs.length === 0, 'keine pageerrors nach allen Interaktionen');
await page.close();

/* ════════ sb_apparateliste ════════ */
console.log('— Apparateliste: Standard / Abmessungen / Garnituren —');
const p2 = await ctx.newPage();
const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
await p2.goto(BASE + '/sb_apparateliste.html', { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(1200);
ok(errs2.length === 0, 'Apparateliste bootet ohne pageerrors (' + errs2.slice(0, 2).join(' | ') + ')');
await p2.waitForFunction(() => window._apHooks, null, { timeout: 6000 });

const draft = await p2.evaluate(() => window._apHooks.newDraft());
ok(draft.standard === '' && draft.washbasinGarn && 'glashalter' in draft.washbasinGarn, 'newDraft trägt Standard- + Garnituren-Felder');

const rows = await p2.evaluate(() => {
  const d = window._apHooks.newDraft();
  d.roomType = 'Badezimmer'; d.floor = 'EG'; d.qty = 1;
  d.standard = 'hoch';
  d.washbasinSize = '60×48'; d.bathtubSize = '170×75'; d.showerSize = '90×90';
  d.washbasinMount = true; d.washbasinSiphon = true; d.washbasinSound = true;
  d.washbasinGarn = { glashalter: true, handtuchhalter: true, seifenhalter: false, ablage: false };
  d.wcGarn = { papierhalter: true, buerste: true };
  return window._apHooks.buildRows(d);
});
const det = app => (rows.find(r => r.app === app) || {}).details || '';
ok(/Standard hoch/.test(det('Waschtisch')), 'Waschtisch: Ausbaustandard in den Details');
ok(/Mass 60×48 cm/.test(det('Waschtisch')), 'Waschtisch: Abmessung 60×48 cm');
ok(/Befestigungsset/.test(det('Waschtisch')) && /Siphon-Set/.test(det('Waschtisch')) && /Schallschutzset/.test(det('Waschtisch')), 'Waschtisch: Befestigung + Siphon + Schallschutz');
ok(/Glashalter/.test(det('Waschtisch')) && /Handtuchhalter/.test(det('Waschtisch')) && !/Seifenhalter/.test(det('Waschtisch')), 'Waschtisch: Garnituren (nur gewählte)');
ok(/Mass 170×75 cm/.test(det('Badewanne')) && /Mass 90×90 cm/.test(det('Dusche')), 'Badewanne + Dusche mit Massen');
ok(/WC-Papierhalter/.test(det('WC')) && /WC-Bürstengarnitur/.test(det('WC')), 'WC: Garnituren');

// Altbestand (Raum ohne die neuen Felder) → keine neuen Details, kein Fehler
const alt = await p2.evaluate(() => {
  const r = { id: 'x', roomType: 'Badezimmer', roomName: '', floor: 'EG', qty: 1,
    hasBathtub: false, hasWashbasin: true, washbasinType: 'normal', washbasinFaucet: 'UP', washbasinVanity: false, washbasinDuofix: 'none', washbasinMeterRun: false, mirror: 'nein',
    hasWC: false, hasShower: false, hasBidet: false };
  return window._apHooks.buildRows(r);
});
ok(alt.length === 1 && !/Standard|Mass/.test(alt[0].details), 'Altbestand ohne neue Felder → Details unverändert');

// Wizard-UI: Ausbaustandard im Basis-Schritt, Abmessung + Garnituren beim Waschtisch
await p2.evaluate(() => window.openWizardAdd());
await p2.waitForTimeout(300);
ok((await p2.evaluate(() => document.getElementById('modalBody').textContent)).indexOf('Ausbaustandard') >= 0, 'Wizard-Basis: «Ausbaustandard» wählbar');
await p2.evaluate(() => { const w = window._apHooks.wizard(); w.step = 2; window._apHooks.renderWiz(); });   // washbasin
await p2.waitForTimeout(300);
const wbStep = await p2.evaluate(() => document.getElementById('modalBody').textContent);
ok(wbStep.indexOf('Abmessung') >= 0 && wbStep.indexOf('40×50 cm') >= 0, 'Waschtisch-Schritt: Standardmasse (40×50 …)');
ok(wbStep.indexOf('Garnituren') >= 0 && wbStep.indexOf('Glashalter') >= 0, 'Waschtisch-Schritt: Garnituren-Auswahl');
ok(wbStep.indexOf('Befestigungsset') >= 0 && wbStep.indexOf('Schallschutzset') >= 0, 'Waschtisch-Schritt: Befestigung/Siphon/Schallschutz');
ok(errs2.length === 0, 'keine pageerrors nach Wizard-Interaktionen');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
