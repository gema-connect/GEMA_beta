// Playwright-Smoke-Test für pm_pruefliste.html — treibt die echte UI:
// Boot ohne pageerror, Tabs, Begehung anlegen, Anlage laden (Default-Punkte),
// Punkt beantworten (Auto-Bewertung + Empfehlung-Vorbelegung), Prüfpunkt
// ergänzen (Bemerkung, nur Begehung), Duplikat-Hinweis + Anpassungs-Vorschlag
// (aenderungZu → Freigabe aktualisiert den Ziel-Punkt), Vorschlag→Freigabe,
// Inline-Bewertung Zahl/Text, Editor-Close-Flush, transiente _open-Flags,
// Objekt-Prüfpunkte (erstellen/verwalten/löschen), Standardliste, Anlagen-
// arten (updateOrgSettings), Bericht-HTML, Deep-Link ?tab=verwaltung,
// Kein-Zugriff für Monteur.
// Aufruf: CHROME=<chromium> node scripts/pruefliste_smoke_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, newPage, seed } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let n = 0, fail = 0;
function ok(name, cond) { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } }

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const errors = [];

async function open(roleIds, query) {
  const { ctx, page } = await newPage(browser, seed(roleIds));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/pm_pruefliste.html' + (query || ''), { waitUntil: 'domcontentloaded' });
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

  console.log('■ «Prüfpunkt ergänzen» — Bemerkung, Duplikat-Hinweis, nur Begehung');
  await page.evaluate(() => window.prAddPktOpen(0));
  ok('Ergänzen-Modal offen', await page.$eval('#addPktBg', el => el.classList.contains('open')));
  ok('Bemerkung-Feld vorhanden (item 1)', await page.$('#apBem') != null);
  ok('Objekt-Option ohne Objekt AUSGEBLENDET', await page.$('input[name="apScope"][value="objekt"]') == null);
  await page.fill('#apBez', 'Pendelgasleitung vorhanden');
  await page.evaluate(() => window.prAddPktDupCheck());
  ok('Duplikat-Hinweis erscheint', (await page.$eval('#apDup', el => el.textContent)).indexOf('ähnlicher') >= 0);
  ok('«✎ Anpassung»-Option im Duplikat-Hinweis (item 6)', await page.$('#apDup button[onclick*="prAddAnpassung"]') != null);
  await page.fill('#apBez', 'Individueller Testpunkt Begehung');
  await page.evaluate(() => window.prAddPktDupCheck());
  await page.fill('#apBem', 'Nur vor Ort sichtbar');
  await page.evaluate(() => { const r = document.querySelector('input[name="apScope"][value="begehung"]'); r.checked = true; window.prAddScopeChg(); });
  await page.evaluate(() => window.prAddPktSave());
  begs = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG));
  const last = begs[0].anlagen[0].punkte.slice(-1)[0];
  ok('6. Punkt = individuell/Begehung', begs[0].anlagen[0].punkte.length === 6 && last.individuell && last.quelle === 'begehung');
  ok('Bemerkung aus Modal übernommen', last.bemerkung === 'Nur vor Ort sichtbar');
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

  console.log('■ Anpassungs-Vorschlag (Duplikat → Ziel-Punkt aktualisieren)');
  await page.evaluate(() => window.prAddPktOpen(0));
  await page.fill('#apBez', 'Pendelgasleitung vorhanden und gekennzeichnet?');
  await page.evaluate(() => window.prAddPktDupCheck());
  await page.evaluate(() => window.prAddAnpassung('prstd_def_0'));
  ok('Änderungsmodus-Hinweis sichtbar', (await page.$eval('#apDup', el => el.textContent)).indexOf('Änderungsvorschlag') >= 0);
  await page.evaluate(() => window.prAddPktSave());
  let aend = await page.evaluate(() => window._prHooks.vorschlaege().filter(v => v.aenderungZu));
  ok('Änderungs-Vorschlag mit aenderungZu erzeugt', aend.length === 1 && aend[0].aenderungZu.id === 'prstd_def_0');
  ok('Punkt mit neuem Wortlaut in Begehung übernommen', (await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].anlagen[0].punkte.some(p => /gekennzeichnet/.test(p.bezeichnung)))));
  await page.evaluate(id => window.prVApprove(id), aend[0].id);
  const globNow = await page.evaluate(() => window._prHooks.stdGlobalMerged().filter(p => p.id === 'prstd_def_0')[0]);
  ok('Ziel-Punkt aktualisiert (neuer Wortlaut, Version ≥ 2)', globNow && /gekennzeichnet/.test(globNow.bezeichnung) && (globNow.version || 1) >= 2);
  ok('Protokoll-Eintrag «Anpassung übernommen»', (globNow.log || []).some(e => /Anpassung übernommen/.test(e.grund || '')));
  ok('Vorschlag nach Übernahme entfernt', (await page.evaluate(() => window._prHooks.vorschlaege().length)) === 0);

  console.log('■ Inline-Bewertung für Zahl-/Text-Punkte + _open-Strip');
  await page.evaluate(() => window.prAddAnlage('trinkwasser'));
  const zi = await page.evaluate(() => {
    const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
    const ai = b.anlagen.length - 1;
    return { ai, pi: b.anlagen[ai].punkte.findIndex(p => p.antworttyp === 'zahl') };
  });
  ok('Zahl-Punkt vorhanden (Warmwassertemperatur)', zi.pi >= 0);
  const chips = await page.$$eval('#pkt_' + zi.ai + '_' + zi.pi + ' .ans .ans-btn', els => els.length);
  ok('3 Inline-Bewertungs-Chips beim Zahl-Punkt', chips === 3);
  await page.evaluate(z => { window.prTogglePkt(z.ai, z.pi); window.prSetBewertung(z.ai, z.pi, 'schlecht'); }, zi);
  const zp = await page.evaluate(z => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].anlagen[z.ai].punkte[z.pi], zi);
  ok('Bewertung schlecht + Empfehlung vorbefüllt', zp.bewertung === 'schlecht' && !!zp.empfehlung);
  ok('transiente _open-Flags nicht persistiert', !('_open' in zp));

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

  console.log('■ Editor-Schliessen flusht pending Debounce-Save');
  await page.evaluate(() => { window.prEField('titel', 'Flush-Test'); window.prCloseEditor(); });
  ok('letzte Eingabe trotz Debounce gespeichert', (await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].titel)) === 'Flush-Test');

  console.log('■ Objekt-Prüfpunkt erstellen + verwalten + löschen (item 7)');
  await page.evaluate(() => window.prOpen(window._prHooks.cached(window._prHooks.POOLS.BEG)[0].id));
  await page.evaluate(() => window.prEObjekt('obj_test'));
  await page.evaluate(() => window.prAddPktOpen(0));
  ok('Objekt-Option MIT Objekt sichtbar', await page.$('input[name="apScope"][value="objekt"]') != null);
  await page.fill('#apBez', 'Provisorisch verschlossenen Anschluss prüfen');
  await page.evaluate(() => window.prAddPktDupCheck());
  await page.evaluate(() => { const r = document.querySelector('input[name="apScope"][value="objekt"]'); r.checked = true; window.prAddScopeChg(); });
  await page.evaluate(() => window.prAddPktSave());
  const objRecs = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.OBJ));
  ok('Objekt-Punkt-Record mit objektId erzeugt', objRecs.length === 1 && objRecs[0].objektId === 'obj_test');
  await page.evaluate(() => window.prCloseEditor());
  await page.evaluate(() => { window.prSetTab('verwaltung'); window.prVView('objekt'); });
  ok('Objekt-Punkte-Segment listet den Punkt', (await page.$eval('#vContent', el => el.textContent)).indexOf('Provisorisch verschlossenen') >= 0);
  const objId = objRecs[0].id;
  await page.evaluate(id => window.prObjPktDel(id), objId);
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForFunction(() => window._prHooks.cached(window._prHooks.POOLS.OBJ).length === 0, null, { timeout: 4000 });
  ok('Objekt-Punkt gelöscht', true);

  console.log('■ Verwaltung — Standardliste');
  await page.evaluate(() => window.prVView('standard'));
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

  /* ─── Deep-Link ?tab=verwaltung (Ziel der Vorschlag-Notify) ─── */
  console.log('■ Deep-Link ?tab=verwaltung');
  const { ctx: c3, page: p3 } = await open(['role_admin'], '?tab=verwaltung');
  await p3.waitForFunction(() => window._prHooks, null, { timeout: 9000 });
  await p3.waitForSelector('#vContent', { timeout: 6000 });
  ok('Verwaltung via Deep-Link geöffnet', await p3.$('#vContent') != null);
  await c3.close();

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
