// Playwright-Smoke-Test für pm_pruefliste.html — treibt die echte UI:
// Boot ohne pageerror, Tabs, Begehung anlegen, Anlage laden (Default-Punkte),
// Punkt beantworten (Auto-Bewertung + Empfehlung-Vorbelegung), Prüfpunkt
// ergänzen (nur Begehung), Duplikat-Hinweis, Vorschlag→Freigabe-Workflow,
// Standardliste-Verwaltung, Bericht-HTML. Kein-Zugriff für Monteur.
// Aufruf: CHROME=<chromium> node scripts/pruefliste_smoke_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, newPage, seed } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let n = 0, fail = 0;
function ok(name, cond) { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } }

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const errors = [];

async function open(roleIds, opts) {
  const { ctx, page } = await newPage(browser, seed(roleIds, opts));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}

try {
  /* ─── Admin: Vollzugang ─── */
  console.log('■ Boot + Tabs (Admin/Org-Admin)');
  errors.length = 0;
  let { ctx, page } = await open(['role_admin']);
  await page.waitForFunction(() => window._prHooks, null, { timeout: 9000 });
  ok('Root vorhanden (kein «Kein Zugriff»)', await page.$('#prRoot') != null);
  ok('keine pageerrors beim Boot', errors.length === 0 || (console.log('   errs:', errors), false));
  const rechte = await page.evaluate(() => window._prHooks.rechte());
  ok('Admin: begehung+manage+super', rechte.begehung && rechte.manage && rechte.super);
  const tabs = await page.$$eval('#prTabbar button', els => els.map(e => e.textContent));
  ok('2 Tabs (Begehungen + Prüfpunkte)', tabs.length === 2 && /Begehungen/.test(tabs[0]) && /Prüfpunkte/.test(tabs[1]));

  console.log('■ Begehung anlegen + Anlage laden');
  await page.evaluate(() => window.prNeu());
  ok('Editor offen', await page.$eval('#edOv', el => el.classList.contains('open')));
  let begs = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG));
  ok('1 Begehung persistiert', begs.length === 1);
  ok('Nummer BEG-JJJJ-001', /^BEG-\d{4}-001$/.test(begs[0].nr));
  await page.evaluate(() => window.prAddAnlage('gas'));
  begs = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG));
  const anl = begs[0].anlagen[0];
  ok('Anlage «gas» hinzugefügt', anl && anl.anlagenart === 'gas');
  ok('Default-Prüfpunkte geladen (5 Gas-Punkte)', anl.punkte.length === 5);
  ok('Punkt trägt Quelle global', anl.punkte[0].quelle === 'global');
  ok('Snapshot: antworttyp + empfehlungVorlage vorhanden', anl.punkte.some(p => p.empfehlungVorlage));

  console.log('■ Punkt beantworten → Auto-Bewertung + Empfehlung');
  // ersten ja_nein_nb-Punkt suchen (Pendelgasleitung) und mit «nein» beantworten
  const idxJa = await page.evaluate(() => {
    const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
    return b.anlagen[0].punkte.findIndex(p => p.antworttyp === 'ja_nein_nb');
  });
  await page.evaluate(i => window.prSetAntwort(0, i, 'nein'), idxJa);
  begs = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG));
  const pAns = begs[0].anlagen[0].punkte[idxJa];
  ok('Antwort = nein', pAns.antwort === 'nein');
  ok('Auto-Bewertung = schlecht', pAns.bewertung === 'schlecht');
  ok('Empfehlung aus Vorlage vorbefüllt', !!pAns.empfehlung && pAns.empfehlung === pAns.empfehlungVorlage);

  console.log('■ «Prüfpunkt ergänzen» — Duplikat-Hinweis + nur Begehung');
  await page.evaluate(() => window.prAddPktOpen(0));
  ok('Ergänzen-Modal offen', await page.$eval('#addPktBg', el => el.classList.contains('open')));
  // Duplikat-Erkennung
  await page.fill('#apBez', 'Pendelgasleitung vorhanden');
  await page.evaluate(() => window.prAddPktDupCheck());
  ok('Duplikat-Hinweis erscheint', (await page.$eval('#apDup', el => el.textContent)).indexOf('ähnlicher') >= 0);
  // trotzdem als neuer Punkt (nur Begehung)
  await page.fill('#apBez', 'Individueller Testpunkt Begehung');
  await page.evaluate(() => window.prAddPktDupCheck());
  await page.evaluate(() => { const r = document.querySelector('input[name="apScope"][value="begehung"]'); r.checked = true; window.prAddScopeChg(); });
  await page.evaluate(() => window.prAddPktSave());
  begs = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG));
  const last = begs[0].anlagen[0].punkte.slice(-1)[0];
  ok('6. Punkt = individuell/Begehung', begs[0].anlagen[0].punkte.length === 6 && last.individuell && last.quelle === 'begehung');
  ok('nur Begehung → kein Objekt-/Standard-Record', (await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.OBJ).length + window._prHooks.stdOrgAll().length)) === 0);

  console.log('■ Vorschlag → Freigabe-Workflow (Firmen-Standard)');
  await page.evaluate(() => window.prAddPktOpen(0));
  await page.fill('#apBez', 'Firmen-Standard Vorschlag ABC');
  await page.evaluate(() => window.prAddPktDupCheck());
  await page.evaluate(() => { const r = document.querySelector('input[name="apScope"][value="org"]'); r.checked = true; window.prAddScopeChg(); });
  await page.evaluate(() => window.prAddPktSave());
  let vors = await page.evaluate(() => window._prHooks.vorschlaege());
  ok('1 Vorschlag (org) erzeugt', vors.length === 1 && vors[0].scope === 'org' && vors[0].status === 'vorschlag');
  const vid = vors[0].id;
  await page.evaluate(id => window.prVApprove(id), vid);
  const orgStd = await page.evaluate(() => window._prHooks.stdOrgAll());
  ok('nach Freigabe: aktiver Firmen-Standardpunkt', orgStd.some(p => p.id === vid && p.status === 'aktiv' && p.aktiv === true));

  console.log('■ Bericht (HTML)');
  await page.evaluate(() => {
    window.__rep = '';
    window.GemaPrintA4 = null; // Print-A4-Wrapper überspringen
    window.open = function () { return { document: { write: function (h) { window.__rep += h; }, close: function () {} }, print: function () {}, focus: function () {} }; };
  });
  await page.evaluate(() => window.prBericht());
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await page.click('.gema-dlg-bg [data-act="cancel"]'); // «Ohne Markierung»
  await page.waitForFunction(() => (window.__rep || '').length > 0, null, { timeout: 4000 });
  const rep = await page.evaluate(() => window.__rep);
  ok('Bericht enthält Titel «Prüfbericht»', rep.indexOf('Prüfbericht') >= 0);
  ok('Bericht enthält opsz-14-Kanon', rep.indexOf('font-variation-settings:"opsz" 14') >= 0);
  ok('Bericht listet beantworteten Punkt', rep.indexOf('Pendelgasleitung') >= 0 || rep.indexOf('Individueller Testpunkt') >= 0);
  ok('Bericht zeigt Bewertung schlecht', rep.indexOf('schlecht') >= 0);

  console.log('■ Verwaltung — Standardliste + Vorschläge-Tab');
  await page.evaluate(() => window.prCloseEditor());
  await page.evaluate(() => window.prSetTab('verwaltung'));
  const vc = await page.$eval('#vContent', el => el.textContent);
  ok('Standardliste zeigt GEMA-Basis (Pendelgasleitung)', vc.indexOf('Pendelgasleitung') >= 0);
  const stdRows = await page.$$eval('#vContent .vrow', els => els.length);
  ok('mind. 20 Standard-Zeilen', stdRows >= 20);

  console.log('■ Verwaltung — Anlagenarten speichern (updateOrgSettings)');
  await page.evaluate(() => window.prVView('anlagenarten'));
  await page.waitForSelector('#artRows', { timeout: 4000 });
  await page.evaluate(() => window.prArtAdd());
  await page.evaluate(() => {
    const rows = document.getElementById('artRows').children;
    const last = rows[rows.length - 1];
    last.querySelector('.artlbl').value = 'Sonderanlage Test';
    last.querySelector('.artic').value = '🧪';
  });
  await page.evaluate(() => window.prArtSave());
  const savedArts = await page.evaluate(() => {
    const o = GemaAuth.getCurrentOrg && GemaAuth.getCurrentOrg();
    return (o && o.settings && o.settings.pruefliste && o.settings.pruefliste.anlagenarten) || null;
  });
  ok('Anlagenarten in org.settings.pruefliste gespeichert', Array.isArray(savedArts) && savedArts.some(a => a.label === 'Sonderanlage Test'));
  await ctx.close();

  /* ─── Monteur: kein Zugriff ─── */
  console.log('■ Monteur → «Kein Zugriff»');
  const { ctx: c2, page: p2 } = await open(['role_monteur']);
  await p2.waitForTimeout(1200);
  const body2 = await p2.$eval('body', el => el.textContent);
  ok('Monteur: Root weg ODER Kein-Zugriff-Screen', (await p2.$('#prRoot')) == null || /Kein Zugriff|kein zugriff/i.test(body2));
  await c2.close();

} catch (e) {
  fail++; console.error('  ✗ EXCEPTION:', e.message);
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + n + ' fehlgeschlagen') : ('✓ Alle ' + n + ' Smoke-Checks grün')));
process.exit(fail ? 1 : 0);
