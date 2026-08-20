// Browser-Smoke-Test pm_machbarkeitsstudie.html (Harness: scripts/rolematrix_harness.mjs)
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
await page.goto(BASE + '/pm_machbarkeitsstudie.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);
check('Boot ohne pageerror', errors.length === 0, errors.join(' | '));
check('Listen-Ansicht sichtbar', await page.isVisible('#viewListe'));
check('Leerzustand erklärt sich', (await page.textContent('#listHost')).indexOf('Noch keine Machbarkeitsstudie') >= 0
  || (await page.textContent('#listHost')).indexOf('Studie') >= 0);

// ── 2) Neue Studie ───────────────────────────────────────
await page.click('#btnNeu');
await page.waitForTimeout(600);
check('Studie geöffnet (viewStudie)', await page.isVisible('#viewStudie'));
check('Footer-Bar sichtbar', await page.isVisible('#footBar'));
check('Titel vorbelegt', (await page.inputValue('#stTitel')) === 'Machbarkeitsstudie');
check('Kopf: Verfasser vorbelegt', (await page.evaluate(() => {
  const inps = document.querySelectorAll('#kopfBody input');
  for (const i of inps){ if (i.value && i.value.indexOf('Test User') >= 0) return i.value; }
  return '';
})).indexOf('Testfirma') > 0);
check('13 Kapitel gerendert', await page.locator('#kapHost .kap').count() === 13);

// Gebäudetyp-Toggle
await page.click('.gt-grid button:has-text("Wohngebäude")');
await page.waitForTimeout(150);
check('Gebäudetyp wählbar (✓ + .on)', (await page.textContent('.gt-grid button.on')).indexOf('Wohngebäude') >= 0);

// ── 3) Kapitel 251: Seg-Buttons ──────────────────────────
await page.click('#kap_p251 .kap-hd');
await page.waitForTimeout(200);
check('Kapitel 251 aufgeklappt', await page.evaluate(() => document.getElementById('kap_p251').classList.contains('open')));
const badgeVor = await page.textContent('#kb_p251');
await page.click('#kapbd_p251 .seg button:has-text("Annahme Planer")');
await page.waitForTimeout(200);
check('Seg-Klick markiert (.on + ✓)', (await page.textContent('#kapbd_p251 .seg button.on')).indexOf('Annahme Planer') >= 0);
const badgeNach = await page.textContent('#kb_p251');
check('Kapitel-Badge zählt hoch (' + badgeVor + ' → ' + badgeNach + ')', badgeVor !== badgeNach);

// ── 4) Kapitel 2 (Varianten): Sys-Tabelle + Entscheid → Auswahlgrund ──
await page.click('#kap_varianten .kap-hd');
await page.waitForTimeout(200);
check('Beschichtungssystem-Tabelle gerendert', await page.locator('#kapbd_varianten .sys-tbl').count() === 1);
check('3 System-Karten (Entscheid)', await page.locator('#kapbd_varianten .ent-card').count() === 3);
const agVor = await page.evaluate(() => {
  const ta = document.querySelectorAll('#kapbd_varianten textarea');
  for (const t of ta){ if (t.closest('.frage') && t.closest('.frage').textContent.indexOf('Auswahlgrund') >= 0) return t.value; }
  return null;
});
await page.click('#kapbd_varianten .ent-card:has-text("Promotec")');
await page.waitForTimeout(300);
check('Entscheid-Karte markiert', await page.evaluate(() => {
  const c = document.querySelector('#kapbd_varianten .ent-card.on');
  return c && c.textContent.indexOf('Promotec') >= 0;
}));
const agNach = await page.evaluate(() => {
  const ta = document.querySelectorAll('#kapbd_varianten textarea');
  for (const t of ta){ if (t.closest('.frage') && t.closest('.frage').textContent.indexOf('Auswahlgrund') >= 0) return t.value; }
  return '';
});
check('Auswahlgrund automatisch ergänzt (System-Satz)', agNach !== agVor && /Promotec/.test(agNach), agNach.slice(0, 120));

// Vergleich: Punkt abwählen
const vglItems = await page.locator('#kapbd_varianten .vgl-item').count();
check('Variantenvergleich gerendert (' + vglItems + ' Punkte)', vglItems >= 10);
await page.click('#kapbd_varianten .vgl-item >> nth=0');
await page.waitForTimeout(200);
check('Vergleichspunkt abwählbar (.aus)', await page.locator('#kapbd_varianten .vgl-item.aus').count() === 1);

// ── 5) Kapitel 254: Material + Lebensdauer ───────────────
await page.click('#kap_p254 .kap-hd');
await page.waitForTimeout(200);
const matRows = await page.locator('#kapbd_p254 .mw-row').count();
check('Material-Zeilen vorbelegt (' + matRows + ')', matRows === 5);
check('Default-Verknüpfung zeigt 50 J. (Chromstahl)', (await page.textContent('#kapbd_p254 .mw-row >> nth=0')).indexOf('50 J.') >= 0);

// Einbaujahr 1995 → Lebensende 2045 + Ampel
await page.fill('#kapbd_p254 .mw-row >> nth=0 >> .mw-jahr', '1995');
await page.dispatchEvent('#kapbd_p254 .mw-row >> nth=0 >> .mw-jahr', 'input');
await page.waitForTimeout(300);
const res0 = await page.textContent('#kapbd_p254 .mw-row >> nth=0 >> .mw-result');
check('1995 + 50 Jahre → Lebensende 2045', res0.indexOf('Lebensende 2045') >= 0, res0);
check('Restlebensdauer ausgewiesen', /Restlebensdauer \d+ J\./.test(res0), res0);
check('Ampel-Pill gesetzt', await page.evaluate(() => {
  const row = document.querySelectorAll('#kapbd_p254 .mw-row')[0];
  return !!(row && row.querySelector('.mw-pill.g, .mw-pill.a, .mw-pill.r'));
}));

// Katalog-Picker: Suche + Auswahl
await page.click('#kapbd_p254 .mw-row >> nth=2 >> .mw-link-btn');
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
check('Zeile 3 trägt jetzt Katalog-Chip', (await page.textContent('#kapbd_p254 .mw-row >> nth=2')).indexOf('J.') >= 0);

// ── 6) Kapitel 253: Druckwerte-Warnung ───────────────────
await page.click('#kap_p253 .kap-hd');
await page.waitForTimeout(200);
await page.fill('#kapbd_p253 .dw-inp >> nth=3', '0.8'); // dw_fliess
await page.dispatchEvent('#kapbd_p253 .dw-inp >> nth=3', 'input');
await page.waitForTimeout(250);
check('Fliessdruck < 1 bar → Warnung sichtbar', await page.evaluate(() => {
  const w = document.getElementById('dwwarn_fliess');
  return w && w.classList.contains('show');
}));
await page.fill('#kapbd_p253 .dw-inp >> nth=3', '2.5');
await page.dispatchEvent('#kapbd_p253 .dw-inp >> nth=3', 'input');
await page.waitForTimeout(250);
check('Fliessdruck 2.5 bar → Warnung weg', await page.evaluate(() => !document.getElementById('dwwarn_fliess').classList.contains('show')));

// ── 7) Fotos: Mediathek-Weg + Angaben-Modal ──────────────
check('Foto-Split-Kachel (Kamera + Mediathek)', await page.locator('#kapbd_p253 .photo-add-split .pa-half').count() === 2);
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');
const [fc] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('#kapbd_p253 .pa-half:has-text("Mediathek")')
]);
await fc.setFiles([{ name: 'baustelle.jpg', mimeType: 'image/jpeg', buffer: JPG }]);
await page.waitForTimeout(900);
check('Foto erscheint als Kachel', await page.locator('#kapbd_p253 .foto-tile').count() === 1);
check('Kapitel-Badge zeigt 📷 1', (await page.textContent('#kbf_p253')).indexOf('1') >= 0);
await page.click('#kapbd_p253 .foto-acts button[title="Angaben bearbeiten"]');
await page.waitForTimeout(250);
check('Foto-Angaben-Modal offen', await page.evaluate(() => document.getElementById('fotoModalBg').classList.contains('open')));
await page.fill('#fmBeschreibung', 'Korrosion Steigleitung');
await page.fill('#fmGeschoss', '2. OG');
await page.click('#fotoModalBg button:has-text("Übernehmen")');
await page.waitForTimeout(300);
const capTxt = await page.textContent('#kapbd_p253 .foto-tile .foto-cap');
check('Foto-Beschreibung + Geschoss auf der Kachel', capTxt.indexOf('Korrosion Steigleitung') >= 0 && capTxt.indexOf('2. OG') >= 0, capTxt);

// ── 8) Bericht (Druckfenster) ────────────────────────────
const [pop] = await Promise.all([
  ctx.waitForEvent('page'),
  page.click('#footBar button:has-text("Bericht (PDF)")')
]);
await pop.waitForLoadState('domcontentloaded');
await pop.waitForTimeout(500);
const popTitle = await pop.title();
check('Fenstertitel = PDF-Dateiname («… – Machbarkeitsstudie»)', popTitle.indexOf('Machbarkeitsstudie') >= 0, popTitle);
const popBody = await pop.evaluate(() => document.body.textContent);
check('Bericht: Kapitel 251 enthalten', popBody.indexOf('Sanitärapparate') >= 0);
check('Bericht: Lebensende 2045 in der Materialtabelle', popBody.indexOf('2045') >= 0);
check('Bericht: gewähltes System Promotec', popBody.indexOf('Promotec') >= 0);
check('Bericht: Vergleichstabelle + Legende', popBody.indexOf('Haltbarkeitsdauer gemäss Hersteller') >= 0);
check('Bericht: Druck-Warnung NICHT mehr drin (2.5 bar ok)', popBody.indexOf('unter dem Mindestwert') < 0);
check('Bericht: Toolbar mit Drucken-Knopf', await pop.locator('.no-print button').count() === 2);
check('Bericht: Foto samt Beschreibung eingebettet', popBody.indexOf('Korrosion Steigleitung') >= 0 && await pop.locator('.bft img').count() === 1);
const abgewaehlt = await pop.evaluate(() => document.body.textContent.indexOf('Wenige Öffnungen der Steigzonen nötig'));
check('Abgewählter Vergleichspunkt fehlt im Bericht', abgewaehlt < 0);
await pop.close();

// ── 9) Persistenz über Reload ────────────────────────────
await page.click('#footBar button:has-text("Übersicht")');
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const cards = await page.locator('#listHost .st-card').count();
check('Studie übersteht Reload (Pool-Cache)', cards === 1);
const cardTxt = await page.textContent('#listHost .st-card');
check('Karte zeigt Titel + Stand', cardTxt.indexOf('Machbarkeitsstudie') >= 0);

// Wieder öffnen: Werte noch da?
await page.click('#listHost .st-card');
await page.waitForTimeout(500);
await page.click('#kap_p254 .kap-hd');
await page.waitForTimeout(250);
check('Einbaujahr 1995 nach Reload erhalten', (await page.inputValue('#kapbd_p254 .mw-row >> nth=0 >> .mw-jahr')) === '1995');
check('Lebensende 2045 nach Reload', (await page.textContent('#kapbd_p254 .mw-row >> nth=0 >> .mw-result')).indexOf('2045') >= 0);

check('Keine pageerrors über den ganzen Lauf', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log('\n' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
