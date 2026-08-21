// Browser-Smoke-Test pm_zustandsanalyse.html (Harness: scripts/rolematrix_harness.mjs)
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
let ok = 0, fail = 0;
function check(name, cond, detail){
  if (cond){ ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + String(detail).slice(0, 200) : '')); }
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });

const errors = [];
const { ctx, page } = await newPage(browser, seed(['role_admin']));
page.on('pageerror', e => errors.push(e.message));

// Stateful PostgREST-Mock (nach newPage registriert → gewinnt vor dem wireRoutes-Catch-all):
// POST speichert Rows, GET liefert sie gefiltert zurück — nur so übersteht der
// Reload-Check den «Cloud gewinnt»-Pfad von bindCollection (Kanon der GEMA-Smoke-Tests).
const store = new Map();
await ctx.route('**/rest/v1/gema_data**', route => {
  const req = route.request(), url = req.url();
  if (req.method() === 'POST'){
    try {
      const body = JSON.parse(req.postData() || '[]');
      (Array.isArray(body) ? body : [body]).forEach(r => { if (r && r.data_key) store.set(r.data_key, r); });
    } catch(e){}
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  }
  if (req.method() === 'GET'){
    const m = /module_key=eq\.([^&]+)/.exec(url);
    const pk = /data_key=like\.([^&]+)/.exec(url);
    const mod = m ? decodeURIComponent(m[1]) : '';
    const pre = pk ? decodeURIComponent(pk[1]).replace(/\*$/, '') : '';
    const rows = [...store.values()]
      .filter(r => (!mod || r.module_key === mod) && (!pre || String(r.data_key).indexOf(pre) === 0))
      .map(r => ({ data_key: r.data_key, payload: r.payload }));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (req.method() === 'DELETE'){
    const dk = /data_key=eq\.([^&]+)/.exec(url);
    if (dk) store.delete(decodeURIComponent(dk[1]));
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '[]' });
});

// ── 1) Boot ──────────────────────────────────────────────
await page.goto(BASE + '/pm_zustandsanalyse.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
check('Boot ohne pageerror', errors.length === 0, errors.join(' | '));
check('Listen-Ansicht sichtbar', await page.isVisible('#viewListe'));
check('Leerzustand erklärt sich', (await page.textContent('#listHost')).indexOf('Noch keine Zustandsanalyse') >= 0);

// ── 2) Neue Analyse ──────────────────────────────────────
await page.click('#btnNeu');
await page.waitForTimeout(600);
check('Analyse geöffnet (viewStudie)', await page.isVisible('#viewStudie'));
check('Footer-Bar sichtbar', await page.isVisible('#footBar'));
check('Titel vorbelegt', (await page.inputValue('#stTitel')) === 'Zustandsanalyse');
check('Kopf: Verfasser vorbelegt (User + Firma)', (await page.evaluate(() => {
  const inps = document.querySelectorAll('#kopfBody input');
  for (const i of inps){ if (i.value && i.value.indexOf('Test User') >= 0) return i.value; }
  return '';
})).indexOf('Testfirma') > 0);
check('12 Kapitel gerendert', await page.locator('#kapHost .kap').count() === 12);
check('Kopf: Titelbild-Foto-Kachel (Kamera + Mediathek)', await page.locator('#kopfBody .photo-add-split .pa-half').count() === 2);

// Bauherrschaft von Hand erfassen (fürs Deckblatt-Meta)
await page.evaluate(() => {
  const inps = document.querySelectorAll('#kopfBody .grid2 input');
  inps[2].value = 'Muster Immobilien AG';
  inps[2].dispatchEvent(new Event('input', { bubbles: true }));
});

// ── 3) Optischer Eindruck: Bereiche + Zustand + Feststellungen ──
await page.click('#kap_eindruck .kap-hd');
await page.waitForTimeout(200);
check('4 Bereiche vorbelegt', await page.locator('#kapbd_eindruck .ber-box').count() === 4);
check('Erster Bereich heisst Technikraum Sanitär', (await page.evaluate(() => document.querySelector('#kapbd_eindruck .ber-box input').value)) === 'Technikraum Sanitär');
await page.click('#kapbd_eindruck .ber-box >> nth=0 >> .zseg button:has-text("Zustand gut")');
await page.waitForTimeout(200);
check('Zustands-Ampel wählbar (.on)', (await page.textContent('#kapbd_eindruck .ber-box >> nth=0 >> .zseg button.on')).indexOf('gut') >= 0);
await page.click('#kapbd_eindruck .ber-box >> nth=0 >> .fest button >> nth=0');
await page.waitForTimeout(200);
check('Feststellung antippbar (.on)', await page.locator('#kapbd_eindruck .ber-box >> nth=0 >> .fest button.on').count() === 1);
const fest0 = await page.textContent('#kapbd_eindruck .ber-box >> nth=0 >> .fest button.on');

// ── 4) Kapitel 1: Komponenten + Risiko mit Handlungsbedarf ──
await page.click('#kap_k1 .kap-hd');
await page.waitForTimeout(200);
check('5 Komponenten vorbelegt', await page.locator('#kapbd_k1 .komp-box').count() === 5);
check('Warmwasserspeicher mit Standardtext', (await page.evaluate(() => {
  const boxes = document.querySelectorAll('#kapbd_k1 .komp-box');
  for (const b of boxes){ if (b.textContent.indexOf('Warmwasserspeicher') >= 0) return b.querySelector('textarea').value; }
  return '';
})).length > 10);
await page.click('#kapbd_k1 .komp-box >> nth=0 >> .risk button:has-text("mittel")');
await page.waitForTimeout(200);
const kompRisk = await page.textContent('#kapbd_k1 .komp-box >> nth=0 >> .risk button.on');
check('Komponenten-Risiko wählbar + Handlungsbedarf am Knopf', kompRisk.indexOf('mittel') >= 0 && kompRisk.indexOf('5 – 10 Jahre') >= 0, kompRisk);

// ── 5) Kapitel 2: Materialtabelle + Lebensdauer-Katalog + Rest-Ampel ──
await page.click('#kap_k2 .kap-hd');
await page.waitForTimeout(200);
check('3 Material-Zeilen vorbelegt (KW/WW/Zirkulation)', await page.locator('#kapbd_k2 .mtb-row').count() === 3);
check('Kapitel-Badge k2 startet 0/2', (await page.textContent('#kb_k2')) === '0/2');
check('Ohne Verknüpfung: Hinweis-Pill statt Ampel', (await page.textContent('#kapbd_k2 .mtb-row >> nth=0 >> .mw-result')).indexOf('Kein Katalog-Material verknüpft') >= 0);

// Katalog-Picker: Suche + Auswahl (PEX 30 Jahre)
await page.click('#kapbd_k2 .mtb-row >> nth=0 >> .mtb-pick');
await page.waitForTimeout(250);
check('Material-Modal offen', await page.evaluate(() => document.getElementById('mwModalBg').classList.contains('open')));
await page.fill('#mwmSuche', 'pex');
await page.dispatchEvent('#mwmSuche', 'input');
await page.waitForTimeout(250);
const optCount = await page.locator('#mwmListe .mwm-opt').count();
check('Suche «pex» liefert Treffer (' + optCount + ')', optCount >= 1);
await page.click('#mwmListe .mwm-opt >> nth=0');
await page.waitForTimeout(300);
check('Modal geschlossen nach Auswahl', !(await page.evaluate(() => document.getElementById('mwModalBg').classList.contains('open'))));
const matVal = await page.evaluate(() => document.querySelector('#kapbd_k2 .mtb-row .mtb-mat input').value);
check('Material aus Katalog vorbefüllt', /pex/i.test(matVal), matVal);
check('Katalog-Chip mit Jahren', /\d+ J\./.test(await page.textContent('#kapbd_k2 .mtb-row >> nth=0 >> .mw-result')));
const ldJahre = await page.evaluate(() => {
  const m = /(\d+) J\./.exec(document.querySelector('#kapbd_k2 .mtb-row .mw-result').textContent);
  return m ? parseInt(m[1], 10) : 0;
});

// Alter → Rest-Ampel (grün), dann Lebensdauer überschritten (rot)
const alterGruen = Math.max(1, Math.round(ldJahre * 0.3));
await page.fill('#kapbd_k2 .mtb-row >> nth=0 >> input[oninput*="alter"]', String(alterGruen));
await page.waitForTimeout(250);
const resGruen = await page.textContent('#kapbd_k2 .mtb-row >> nth=0 >> .mw-result');
check('Alter ' + alterGruen + ' J. → Restlebensdauer ~' + (ldJahre - alterGruen) + ' J.', resGruen.indexOf('Restlebensdauer ~' + (ldJahre - alterGruen) + ' J.') >= 0, resGruen);
check('Ampel grün', await page.locator('#kapbd_k2 .mtb-row >> nth=0 >> .mw-pill.g').count() === 1);
await page.fill('#kapbd_k2 .mtb-row >> nth=0 >> input[oninput*="alter"]', String(ldJahre + 5));
await page.waitForTimeout(250);
const resRot = await page.textContent('#kapbd_k2 .mtb-row >> nth=0 >> .mw-result');
check('Alter über Lebensdauer → «überschritten seit 5 J.» + rot', resRot.indexOf('überschritten seit 5 J.') >= 0
  && await page.locator('#kapbd_k2 .mtb-row >> nth=0 >> .mw-pill.r').count() === 1, resRot);

// Zeilen-Risiko + Kapitel-Risiko (zählt im Badge)
await page.click('#kapbd_k2 .mtb-row >> nth=0 >> .risk button:has-text("hoch") >> nth=0');
await page.waitForTimeout(200);
check('Zeilen-Risiko markiert', await page.locator('#kapbd_k2 .mtb-row >> nth=0 >> .risk button.on').count() === 1);
const kapRiskFrage = '#kapbd_k2 .frage:has-text("Risiko Kalt- und Warmwasserleitungen")';
await page.click(kapRiskFrage + ' .risk button:has-text("sehr hoch")');
await page.waitForTimeout(200);
check('Kapitel-Risiko wählbar (0 – 1 Jahr)', (await page.textContent(kapRiskFrage + ' .risk button.on')).indexOf('0 – 1 Jahr') >= 0);
check('Kapitel-Badge zählt hoch (1/2)', (await page.textContent('#kb_k2')) === '1/2');

// ── 6) Kapitel 9: Kostenschätzung mit Auto-Totalen ───────
await page.click('#kap_k9 .kap-hd');
await page.waitForTimeout(200);
check('Beide Kosten-Varianten gerendert', await page.evaluate(() => {
  const t = document.getElementById('kapbd_k9').textContent;
  return t.indexOf('Variante 1') >= 0 && t.indexOf('Variante 2') >= 0;
}));
await page.fill('#kapbd_k9 .kos-chf input >> nth=0', '180000');
await page.waitForTimeout(250);
check('Total Ausführung gerechnet (Fr. 180\'000.–)', (await page.textContent('#zakos_ausf_v1')).indexOf("180'000.–") >= 0, await page.textContent('#zakos_ausf_v1'));
await page.fill('#kapbd_k9 .kos-chf input >> nth=7', '20000');
await page.waitForTimeout(250);
check('Nebenkosten 1.0 % → Honorar-Total Fr. 20\'200.–', (await page.textContent('#zakos_hontot_v1')).indexOf("20'200.–") >= 0, await page.textContent('#zakos_hontot_v1'));
check('Gesamttotal Fr. 200\'200.–', (await page.textContent('#zakos_ges_v1')).indexOf("200'200.–") >= 0, await page.textContent('#zakos_ges_v1'));
await page.click('#kapbd_k9 .fest button >> nth=0');
await page.waitForTimeout(200);
check('Nicht enthaltene Leistung antippbar', await page.locator('#kapbd_k9 .fest button.on').count() === 1);

// ── 7) Kapitel 10: Empfehlung + Massnahmen-Vorlagen ──────
await page.click('#kap_k10 .kap-hd');
await page.waitForTimeout(200);
await page.click('#kapbd_k10 .seg button:has-text("Variante 1")');
await page.waitForTimeout(200);
check('Empfohlene Variante wählbar', (await page.textContent('#kapbd_k10 .seg button.on')).indexOf('Variante 1') >= 0);
await page.click('#kapbd_k10 .stdbar button:has-text("📋") >> nth=0');
await page.waitForTimeout(250);
const msnVal = await page.evaluate(() => {
  const r = document.querySelector('#kapbd_k10 .zl-row input');
  return r ? r.value : '';
});
check('Massnahmen-Vorlage übernommen', msnVal.length > 10, msnVal);
check('Vorlage nicht doppelt einfügbar', await page.evaluate(() => {
  const btn = document.querySelector('#kapbd_k10 .stdbar button[onclick*="zaMsnVorlage"]');
  btn.click();
  return document.querySelectorAll('#kapbd_k10 .zl-row').length;
}) === 1);

// ── 8) Fotos: Titelbild (Kopf) + Kapitel-Foto mit Angaben ──
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');
const [fcKopf] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('#kopfBody .pa-half:has-text("Mediathek")')
]);
await fcKopf.setFiles([{ name: 'fassade.jpg', mimeType: 'image/jpeg', buffer: JPG }]);
await page.waitForTimeout(900);
check('Titelbild erscheint als Kachel im Kopf', await page.locator('#kopfBody .foto-tile').count() === 1);

await page.click('#kap_k2 .kap-hd'); // sicherstellen, dass k2 offen bleibt fürs Foto — Toggle zurück
await page.waitForTimeout(150);
await page.click('#kap_k2 .kap-hd');
await page.waitForTimeout(150);
const [fcK2] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('#kapbd_k2 .pa-half:has-text("Mediathek")')
]);
await fcK2.setFiles([{ name: 'leitung.jpg', mimeType: 'image/jpeg', buffer: JPG }]);
await page.waitForTimeout(900);
check('Kapitel-Foto erscheint als Kachel', await page.locator('#kapbd_k2 .foto-tile').count() === 1);
check('Kapitel-Badge zeigt 📷 1', (await page.textContent('#kbf_k2')).indexOf('1') >= 0);
await page.click('#kapbd_k2 .foto-acts button[title="Angaben bearbeiten"]');
await page.waitForTimeout(250);
check('Foto-Angaben-Modal offen', await page.evaluate(() => document.getElementById('fotoModalBg').classList.contains('open')));
await page.fill('#fmBeschreibung', 'Korrosion Steigleitung');
await page.fill('#fmGeschoss', '2. OG');
await page.click('#fotoModalBg button:has-text("Übernehmen")');
await page.waitForTimeout(300);
const capTxt = await page.textContent('#kapbd_k2 .foto-tile .foto-cap');
check('Foto-Beschreibung + Geschoss auf der Kachel', capTxt.indexOf('Korrosion Steigleitung') >= 0 && capTxt.indexOf('2. OG') >= 0, capTxt);

// ── 9) Bericht (Druckfenster) ────────────────────────────
const [pop] = await Promise.all([
  ctx.waitForEvent('page'),
  page.click('#footBar button:has-text("Bericht (PDF)")')
]);
await pop.waitForLoadState('domcontentloaded');
await pop.waitForTimeout(500);
const popTitle = await pop.title();
check('Fenstertitel = PDF-Dateiname («… – Zustandsanalyse»)', popTitle.indexOf('Zustandsanalyse') >= 0, popTitle);
const popBody = await pop.evaluate(() => document.body.textContent);
check('Deckblatt: Bauherrschaft im Meta-Block', popBody.indexOf('Muster Immobilien AG') >= 0);
check('Deckblatt: Titelbild eingebettet', await pop.locator('.cv-img img').count() === 1);
check('Bericht: Optischer Eindruck mit ☒-Zustand', popBody.indexOf('Optischer Eindruck') >= 0 && popBody.indexOf('☒ gut') >= 0);
check('Bericht: angehakte Feststellung als Aufzählung', popBody.indexOf(fest0.trim()) >= 0, fest0);
check('Bericht: Risiko-Tabelle mit Handlungsbedarf', popBody.indexOf('Handlungsbedarf') >= 0 && popBody.indexOf('5 – 10 Jahre') >= 0);
check('Bericht: Material «überschritten seit 5 J.»', popBody.indexOf('überschritten seit 5 J.') >= 0);
check('Bericht: Kapitel-Risiko sehr hoch (0 – 1 Jahr)', popBody.indexOf('0 – 1 Jahr') >= 0);
check('Bericht: Gesamttotal Fr. 200\'200.–', popBody.indexOf("200'200.–") >= 0);
check('Bericht: Kurzfristige Massnahmen + Vorlage', popBody.indexOf('Kurzfristige Massnahmen 1 – 5 Jahre') >= 0 && popBody.indexOf(msnVal.slice(0, 30)) >= 0);
check('Bericht: leere Massnahmen-Gruppe = «Keine»', popBody.indexOf('Langfristige Massnahmen 10 – 20 Jahre') >= 0 && popBody.indexOf('Keine') >= 0);
check('Bericht: Foto samt Beschreibung eingebettet', popBody.indexOf('Korrosion Steigleitung') >= 0 && await pop.locator('.bft img').count() >= 1);
check('Bericht: Variantenvergleich enthalten', popBody.indexOf('Vor- und Nachteile im Vergleich') >= 0);
check('Bericht: Toolbar mit Drucken-Knopf', await pop.locator('.no-print button').count() === 2);
await pop.close();

// ── 10) Persistenz über Reload ───────────────────────────
await page.click('#footBar button:has-text("Übersicht")');
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const cards = await page.locator('#listHost .st-card').count();
check('Analyse übersteht Reload (Pool-Cache)', cards === 1);
check('Karte zeigt Titel', (await page.textContent('#listHost .st-card')).indexOf('Zustandsanalyse') >= 0);

// Wieder öffnen: Werte noch da?
await page.click('#listHost .st-card');
await page.waitForTimeout(500);
await page.click('#kap_k2 .kap-hd');
await page.waitForTimeout(250);
check('Alter nach Reload erhalten', (await page.inputValue('#kapbd_k2 .mtb-row >> nth=0 >> input[oninput*="alter"]')) === String(ldJahre + 5));
check('Rest-Ampel nach Reload rot', await page.locator('#kapbd_k2 .mtb-row >> nth=0 >> .mw-pill.r').count() === 1);
await page.click('#kap_k9 .kap-hd');
await page.waitForTimeout(250);
check('Kosten-Total nach Reload', (await page.textContent('#zakos_ges_v1')).indexOf("200'200.–") >= 0);
await page.click('#kap_eindruck .kap-hd');
await page.waitForTimeout(250);
check('Zustand + Feststellung nach Reload', (await page.locator('#kapbd_eindruck .zseg button.on').count()) === 1
  && (await page.locator('#kapbd_eindruck .fest button.on').count()) === 1);

check('Keine pageerrors über den ganzen Lauf', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log('\n' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
