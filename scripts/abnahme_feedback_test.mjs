// Feedback-Umsetzung 07/2026 (Sandro): pm_abnahme + sb_apparateliste.
//  pm_abnahme: Anhang-Tab (Plan/Zusatzblatt), Art der Abnahme (Sichtkontrolle/
//  Teil-/Schlussabnahme), Geprüfter-Teil-Schnellwahl (komplett→gesperrt,
//  Steigzone/Einlage mit Zusatzfeldern), Ergebnis→Entscheid-Automatik +
//  SIA-118-Zusatztexte, Mangel⇄Pendenz pro Punkt, Status «teilweise erledigt»,
//  Fotos rechts (grösser, mehrere), «Durch wen»-Vorschlag aus dem Unternehmer,
//  Unterschriften Name/Vorname + Firma-Vorbefüllung.
//  Feedback 22.07.2026 (Sandro): Kopf mit Name/Unternehmen-Paaren + weitere
//  Beteiligte, Freies Objekt = Gebäude/Adresse/PLZ-Ort, Arbeitsgattung NUR
//  BKP-Hauptkapitel (Select statt datalist), Garantiedauer 2/5 J + Frist-Auto,
//  Datum Standard heute, Unterschrift-Bestätigung (einfrieren + Stempel),
//  Mängel-Summary folgt live dem Beschrieb, PDF öffnen + Speichern-unter.
//  Auto-Speichern per-Record (07/2026): KEIN Speichern-/Laden-Button mehr,
//  Status-Badge unten rechts, Protokolle als abproto:-Records (Pool
//  gema_abnahme_proto_pool_v1, scopeKey = alter Blob-Key), Unterschriften
//  speichern automatisch, Inhalts-Diff gegen UI-Render-Spam, Blob-Migration.
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
const cloudWrites = [];   // alle gema_data-POST-Bodies (Auto-Save-Kontrolle)
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
    if (route.request().method() === 'POST' && u.indexOf('gema_data') >= 0) {
      try { const b = route.request().postDataJSON(); (Array.isArray(b) ? b : [b]).forEach(r => cloudWrites.push(r)); } catch (e) {}
    }
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  }
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

console.log('— Unterschriften: Name/Vorname + Firma von oben —');
await page.evaluate(() => { const st = window._abState(); st.abnahme.unternehmer = 'Muster Haustechnik AG, Basel'; st.abnahme.bauherr = 'Bauherr GmbH'; window._abRender(); });
const sig = await page.evaluate(() => ({
  lblName: Array.from(document.querySelectorAll('.sig-meta label')).some(l => l.textContent === 'Name / Vorname'),
  lblFirma: Array.from(document.querySelectorAll('.sig-meta label')).some(l => l.textContent === 'Firma'),
  untFirma: document.getElementById('sigUnternehmerVisum').value,
  bhFirma: document.getElementById('sigBauherrVisum').value
}));
ok(sig.lblName && sig.lblFirma, 'Labels «Name / Vorname» + «Firma»');
ok(sig.untFirma === 'Muster Haustechnik AG', 'Firma des Unternehmers aus dem Kopf vorbefüllt');
ok(sig.bhFirma === 'Bauherr GmbH', 'Firma des Bauherrn aus dem Kopf vorbefüllt');

console.log('— Auto-Speichern per-Record (kein Speichern-Button, Badge, abproto:-Pool) —');
const noBtns = await page.evaluate(() => ({
  sigSave: document.querySelectorAll('[data-sig-save]').length,
  footer: (document.querySelector('.footer-actions') || {}).textContent || ''
}));
ok(noBtns.sigSave === 0, 'keine einzelnen Unterschrift-Speichern-Buttons mehr');
ok(noBtns.footer.indexOf('PDF öffnen') >= 0 && noBtns.footer.indexOf('Speichern unter') >= 0 && noBtns.footer.indexOf('Laden') < 0, 'Footer: «PDF öffnen» + «Speichern unter»-Variante (kein Protokoll-Speichern/Laden)');
// Migration beim Boot: leerer Cloud-Pool + lokales Default-Protokoll → hochgeschrieben
ok(cloudWrites.some(r => r && String(r.data_key || '').indexOf('abproto:') === 0), 'Boot: Protokoll als abproto:-Record in die Cloud geschrieben');
// Eingabe → Badge «pending» → Debounce → Pool-Cache + Cloud-Write tragen den Wert
const preWrites = cloudWrites.length;
await page.fill('#ort', 'Basel Auto-Save');
await page.waitForTimeout(250);
ok(await page.evaluate(() => { const el = document.getElementById('saveStatus'); return !!el && !el.classList.contains('hidden'); }), 'Status-Badge erscheint nach der Eingabe (unten rechts)');
await page.waitForTimeout(1700);
const autos = await page.evaluate(() => {
  const pool = JSON.parse(localStorage.getItem('gema_abnahme_proto_pool_v1') || '[]');
  const rec = pool.find(r => r && r.state && r.state.abnahme && r.state.abnahme.ort === 'Basel Auto-Save');
  const el = document.getElementById('saveStatus');
  return { inPool: !!rec, scope: rec ? rec.scopeKey : '', badgeSaved: !!el && el.classList.contains('saved') };
});
ok(autos.inPool, 'Pool-Cache trägt die Eingabe nach dem Debounce (localStorage-first)');
ok(autos.scope === 'gema_abnahme_sia_v1', 'Record gescoped über scopeKey (per-Objekt-Key)');
ok(autos.badgeSaved, 'Badge zeigt «Gespeichert» (saved)');
ok(cloudWrites.length > preWrites && cloudWrites.slice(preWrites).some(r => {
  try { return String(r.data_key).indexOf('abproto:') === 0 && r.payload.data.state.abnahme.ort === 'Basel Auto-Save'; } catch (e) { return false; }
}), 'Cloud-Write (GemaSync.saveRecord) trägt die Eingabe');
// UI-only-Render erzeugt KEINEN weiteren Cloud-Write (Inhalts-Diff)
const preUi = cloudWrites.length;
await page.evaluate(() => window._abRender());
await page.waitForTimeout(1700);
ok(cloudWrites.length === preUi, 'reiner Re-Render ohne Änderung → kein Cloud-Write (Inhalts-Diff)');
// Unterschrift zeichnen → speichert automatisch mit
await page.evaluate(() => document.getElementById('sigUnternehmer').scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.waitForTimeout(350);   // Scroll settlen lassen (scroll-behavior:smooth)
const sigBox = await page.evaluate(() => { const r = document.getElementById('sigUnternehmer').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await page.mouse.move(sigBox.x + 20, sigBox.y + sigBox.h / 2);
await page.mouse.down();
await page.mouse.move(sigBox.x + sigBox.w - 30, sigBox.y + sigBox.h / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(1700);
const sigSaved = await page.evaluate(() => {
  const pool = JSON.parse(localStorage.getItem('gema_abnahme_proto_pool_v1') || '[]');
  const rec = pool.find(r => r && r.state && r.state.abnahme && r.state.abnahme.ort === 'Basel Auto-Save');
  return !!(rec && rec.state.abnahme.sig && rec.state.abnahme.sig.unternehmer && (rec.state.abnahme.sig.unternehmer.dataUrl || '').indexOf('data:image') === 0);
});
ok(sigSaved, 'Unterschrift wird automatisch mitgespeichert (dataUrl im Record)');

console.log('— «Durch wen»-Vorschlag aus dem Unternehmer —');
ok((await page.evaluate(() => window._abCreateItem({}).kuerzel)) === 'Muster Haustechnik AG', 'Neuer Punkt: Durch-wen = Unternehmer (überschreibbar, Legacy-Fallback)');

console.log('— Kopf: Name/Unternehmen-Paare + Freies Objekt + weitere Beteiligte —');
await page.click('#tab_abnahme');
await page.waitForTimeout(200);
await page.fill('#unternehmerName', 'Hans Muster');
await page.fill('#unternehmerFirma', 'Muster Haustechnik AG');
const kopf = await page.evaluate(() => ({ u: window._abState().abnahme.unternehmer, uf: window._abState().abnahme.unternehmerFirma }));
ok(kopf.uf === 'Muster Haustechnik AG' && kopf.u === 'Muster Haustechnik AG, Hans Muster', 'Unternehmer-Paar → zusammengesetzter Daten-Kanal (Firma zuerst)');
ok((await page.evaluate(() => window._abCreateItem({}).kuerzel)) === 'Muster Haustechnik AG', 'Durch-wen-Vorschlag = Unternehmen-Feld');
await page.evaluate(() => toggleObjektInput(true));
ok(await page.evaluate(() => ['bo_gebaeude', 'bo_adresse', 'bo_plzort'].every(id => { const el = document.getElementById(id); return !!el && el.offsetParent !== null; })), 'Freies Objekt → Felder Gebäude/Adresse/PLZ-Ort');
await page.fill('#bo_gebaeude', 'EFH Muster');
await page.fill('#bo_adresse', 'Musterweg 1');
await page.fill('#bo_plzort', '4000 Basel');
ok((await page.evaluate(() => window._abState().abnahme.bauobjekt)) === 'EFH Muster, Musterweg 1, 4000 Basel', 'Teile → zusammengesetztes Bauobjekt');
await page.click('#wbAdd');
await page.waitForTimeout(150);
await page.fill('#wbList [data-wbf="funktion"]', 'Fachbauleitung');
await page.fill('#wbList [data-wbf="name"]', 'F. Fach');
await page.fill('#wbList [data-wbf="firma"]', 'Fach AG');
const wb = await page.evaluate(() => window._abState().abnahme.weitereBeteiligte[0]);
ok(wb && wb.funktion === 'Fachbauleitung' && wb.name === 'F. Fach' && wb.firma === 'Fach AG', 'Weitere Beteiligte erfasst (Funktion/Name/Unternehmen)');
await page.evaluate(() => window._abRender());
const fbSig = await page.evaluate(() => ({ n: document.getElementById('sigFachbauleitungName').value, f: document.getElementById('sigFachbauleitungVisum').value }));
ok(fbSig.n === 'F. Fach' && fbSig.f === 'Fach AG', 'Fachbauleitung-Unterschrift aus «Weitere Beteiligte» vorbefüllt');

console.log('— Arbeitsgattung: NUR BKP-Hauptkapitel + eigene Eingabe —');
const ag = await page.evaluate(() => Array.from(document.querySelectorAll('#arbeitsgattungSel option')).map(o => o.value));
ok(ag.filter(v => v.indexOf('BKP ') === 0).length === 9, 'genau 9 BKP-Hauptkapitel im Select (statt 349er-datalist)');
ok(ag.indexOf('BKP 250 Sanitäranlagen') >= 0 && ag.indexOf('BKP 219 Inlinerarbeiten') >= 0 && ag.indexOf('BKP 257 Löschanlagen') >= 0, 'Liste = Hauptkapitel gemäss Vorgabe (250/219/257 …)');
await page.selectOption('#arbeitsgattungSel', 'BKP 250 Sanitäranlagen');
ok((await page.evaluate(() => window._abState().abnahme.arbeitsgattung)) === 'BKP 250 Sanitäranlagen', 'Auswahl schreibt die Arbeitsgattung');
await page.selectOption('#arbeitsgattungSel', '_manual');
await page.waitForTimeout(120);
ok(await page.evaluate(() => document.getElementById('arbeitsgattung').style.display !== 'none'), '«Eigene Eingabe…» blendet das Freitextfeld ein');
await page.fill('#arbeitsgattung', 'Spezialgewerk XY');
await page.evaluate(() => window._abRender());
const agM = await page.evaluate(() => ({ st: window._abState().abnahme.arbeitsgattung, sel: document.getElementById('arbeitsgattungSel').value, vis: document.getElementById('arbeitsgattung').style.display !== 'none' }));
ok(agM.st === 'Spezialgewerk XY' && agM.sel === '_manual' && agM.vis, 'Eigener Text bleibt erhalten (Select auf «Eigene Eingabe», Feld sichtbar)');
await page.selectOption('#arbeitsgattungSel', 'BKP 250 Sanitäranlagen');

console.log('— Garantie: Dauer 2/5 Jahre + Frist automatisch —');
const heuteStr = (d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`)(new Date());
const frist2 = (d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear() + 2}`)(new Date());
await page.check('#gar2');
let gar = await page.evaluate(() => ({ j: window._abState().abnahme.garantieJahre, chip: document.getElementById('garFrist').textContent, vis: document.getElementById('garFrist').style.display !== 'none' }));
ok(gar.j === 2 && gar.vis, 'Kästchen «2 Jahre» → garantieJahre 2 + Frist-Chip sichtbar');
ok(gar.chip.indexOf(frist2) >= 0, 'Garantiefrist = Abnahmedatum + 2 Jahre («' + gar.chip + '»)');
await page.check('#gar5');
gar = await page.evaluate(() => ({ j: window._abState().abnahme.garantieJahre, g2: document.getElementById('gar2').checked }));
ok(gar.j === 5 && !gar.g2, '«5 Jahre» schaltet um (2er-Kästchen abgewählt)');
await page.uncheck('#gar5');
ok((await page.evaluate(() => window._abState().abnahme.garantieJahre)) === 0, 'Abwählen → keine Garantie-Angabe');

console.log('— Datum: Standard heutiger Tag —');
ok((await page.evaluate(() => document.getElementById('abnahmeDatum').value)) === heuteStr, 'Abnahmedatum = heute (Standard, folgt dem Tag)');
await page.fill('#abnahmeDatum', '01.07.2026');
await page.evaluate(() => window._abRender());
const dat = await page.evaluate(() => ({ v: document.getElementById('abnahmeDatum').value, t: window._abState().abnahme._datumTouched }));
ok(dat.v === '01.07.2026' && dat.t === true, 'manuell gesetztes Datum bleibt fixiert (folgt nicht mehr heute)');

console.log('— Unterschrift bestätigen: einfrieren + Datum/Ort-Stempel —');
await page.evaluate(() => document.querySelector('[data-sig-confirm="unternehmer"]').scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.click('[data-sig-confirm="unternehmer"]');
await page.waitForTimeout(350);
await page.click('.gema-dlg-bg [data-act="ok"]');
await page.waitForTimeout(350);
const conf = await page.evaluate(() => ({
  best: window._abState().abnahme.sig.unternehmer.bestaetigt,
  stamp: document.getElementById('sigStampUnternehmer').textContent,
  stampVis: document.getElementById('sigStampUnternehmer').style.display !== 'none',
  confirmed: document.getElementById('sigCardUnternehmer').classList.contains('confirmed'),
  btnWeg: document.querySelector('[data-sig-confirm="unternehmer"]').style.display === 'none',
  clearWeg: document.querySelector('[data-sig-clear="sigUnternehmer"]').style.display === 'none'
}));
ok(conf.best && conf.best.am === heuteStr && conf.best.ort === 'Basel Auto-Save', 'Bestätigung mit Datum/Ort-Stempel gespeichert');
ok(conf.stampVis && conf.stamp.indexOf('Bestätigt am') >= 0, 'Stempel sichtbar in der Karte');
ok(conf.confirmed && conf.btnWeg && conf.clearWeg, 'Unterschrift eingefroren (kein Bestätigen/Löschen mehr)');
// Zeichnen auf dem eingefrorenen Pad ändert die Unterschrift NICHT
const sigLenBefore = await page.evaluate(() => (window._abState().abnahme.sig.unternehmer.dataUrl || '').length);
await page.evaluate(() => document.getElementById('sigUnternehmer').scrollIntoView({ block: 'center', behavior: 'instant' }));
await page.waitForTimeout(300);
const frozenBox = await page.evaluate(() => { const r = document.getElementById('sigUnternehmer').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await page.mouse.move(frozenBox.x + 30, frozenBox.y + 30);
await page.mouse.down();
await page.mouse.move(frozenBox.x + frozenBox.w - 40, frozenBox.y + frozenBox.h - 30, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(300);
ok((await page.evaluate(() => (window._abState().abnahme.sig.unternehmer.dataUrl || '').length)) === sigLenBefore, 'Pad eingefroren — Zeichnen ohne Wirkung');
// ↩ Fehlklick-Korrektur: Bestätigung aufheben
await page.click('[data-sig-unconfirm="unternehmer"]');
await page.waitForTimeout(350);
await page.click('.gema-dlg-bg [data-act="ok"]');
await page.waitForTimeout(350);
ok(await page.evaluate(() => !window._abState().abnahme.sig.unternehmer.bestaetigt && document.querySelector('[data-sig-confirm="unternehmer"]').style.display !== 'none'), '↩ hebt die Bestätigung auf (wieder bearbeitbar)');

console.log('— Mängel-Summary folgt live dem Beschrieb —');
await page.click('#tab_maengel');
await page.waitForTimeout(300);
await page.click('.mangel-card .mangel-summary');
await page.waitForTimeout(300);
await page.fill('.mangel-detail.open [data-field="mangel"]', 'Neuer Beschrieb ABC');
const sum = await page.evaluate(() => document.querySelector('.mangel-card .mangel-mangel').textContent);
ok(sum === 'Neuer Beschrieb ABC', 'Kopfzeile übernimmt den Mangelbeschrieb LIVE beim Tippen');
await page.click('.mangel-card .mangel-summary');   // wieder schliessen — Folge-Checks öffnen selbst
await page.waitForTimeout(250);

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

/* ════════ Blob-Migration: alter per-Objekt-Blob → abproto:-Records ════════ */
console.log('— Migration: Legacy-Blob wird einmalig in Records gesplittet —');
const LEGACY = JSON.stringify({
  protocols: [{ id: 'p_legacy', name: 'Protokoll Alt', createdAt: '2026-01-05T08:00:00.000Z',
    state: { abnahme: { bauobjekt: 'Altes Objekt', bauleitung: 'Alt BL' }, items: [], check: [] } }],
  activeProtocolId: 'p_legacy'
});
const ctx2 = await browser.newContext();
const migWrites = [];
let cloudProtoRow = null;   // wenn gesetzt: bindCollection-GET liefert diesen abproto:-Record
await ctx2.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
    if (route.request().method() === 'GET' && u.indexOf('data_key=in.') >= 0 && u.indexOf('gema_abnahme_sia_v1') >= 0)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ data_key: 'gema_abnahme_sia_v1', payload: { v: LEGACY } }]) });
    if (cloudProtoRow && route.request().method() === 'GET' && u.indexOf('like.abproto') >= 0)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([cloudProtoRow]) });
    if (route.request().method() === 'POST' && u.indexOf('gema_data') >= 0) {
      try { const b = route.request().postDataJSON(); (Array.isArray(b) ? b : [b]).forEach(r => migWrites.push(r)); } catch (e) {}
    }
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  }
  if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
  return route.abort();
});
await ctx2.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  { gema_orgs_v1: JSON.stringify([ORG]), gema_users_v1: JSON.stringify(USERS), gema_session_v1: JSON.stringify(SESSION) });
const pm = await ctx2.newPage();
const errsM = []; pm.on('pageerror', e => errsM.push(e.message));
await pm.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
await pm.waitForTimeout(2200);
ok(errsM.length === 0, 'Migration-Boot ohne pageerrors (' + errsM.slice(0, 2).join(' | ') + ')');
const mig = await pm.evaluate(() => ({
  proto: window._abActiveProtoId(),
  bl: window._abState().abnahme.bauleitung,
  pool: JSON.parse(localStorage.getItem('gema_abnahme_proto_pool_v1') || '[]')
}));
ok(mig.proto === 'p_legacy' && mig.bl === 'Alt BL', 'Blob-Protokoll geladen (aktiv + Inhalt da)');
ok(mig.pool.some(r => r && r.id === 'p_legacy' && r.scopeKey === 'gema_abnahme_sia_v1'), 'Blob → abproto:-Record im Pool-Cache');
ok(migWrites.some(r => {
  try { return r.data_key === 'abproto:p_legacy' && r.payload.data.name === 'Protokoll Alt' && r.payload.data.state.abnahme.bauleitung === 'Alt BL'; } catch (e) { return false; }
}), 'Blob-Protokoll in die Cloud migriert (abproto:p_legacy)');
await pm.close();

// Zweitgerät-Sicht: Cloud hat inzwischen einen NEUEREN Stand → wird adoptiert
console.log('— Cross-Device: frischer Cloud-Stand gewinnt beim Boot —');
cloudProtoRow = { data_key: 'abproto:p_legacy', payload: { _lm: Date.now(), data: {
  id: 'p_legacy', scopeKey: 'gema_abnahme_sia_v1', objektId: '', orgId: 'org_t',
  name: 'Protokoll Alt', createdAt: '2026-01-05T08:00:00.000Z', updatedAt: new Date().toISOString(),
  state: { abnahme: { bauobjekt: 'Altes Objekt', bauleitung: 'Cloud BL' }, items: [], check: [] }
} } };
const pm2 = await ctx2.newPage();
const errsA = []; pm2.on('pageerror', e => errsA.push(e.message));
await pm2.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
await pm2.waitForTimeout(2200);
ok(errsA.length === 0, 'Adoption-Boot ohne pageerrors (' + errsA.slice(0, 2).join(' | ') + ')');
ok((await pm2.evaluate(() => window._abState().abnahme.bauleitung)) === 'Cloud BL', 'Cloud-Stand adoptiert (bauleitung «Cloud BL»)');
await pm2.close(); await ctx2.close();

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
