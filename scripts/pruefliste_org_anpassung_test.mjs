// Playwright-Suite: GEMA-Standardpunkte pro Org anpassbar (Firmen-Anpassung
// mit basisId, 31.07.2026) — treibt die echte UI in pm_pruefliste.html:
//  A) Org-Admin (role_planer + org.admins, NICHT Super): Standardliste zeigt
//     ✏️ auch auf GEMA-Punkten (Titel «Für die eigene Firma anpassen»),
//     Hinweiszeile, KEIN 🗑/Inaktiv-Global für Nicht-Super.
//  B) Begehung + Anlage «gas» VOR der Anpassung (Zeilen unter GEMA-Ids).
//  C) prPkEdit(global) als Org-Admin → Editor «GEMA-Punkt für Firma anpassen»
//     mit amber Hinweis → Save → NEUER org-Record mit basisId, GEMA-Record
//     unverändert, effektive Liste ersetzt (keine Duplikate, weiter 5 Punkte).
//  D) Badges: GEMA-Zeile gedimmt + «✎ durch Firma angepasst» + «↺ Anpassung
//     entfernen»; Org-Zeile «✎ Anpassung eines GEMA-Punkts» + ↺ statt 🗑.
//  E) Erneutes ✏️ auf dem GEMA-Punkt bearbeitet die BESTEHENDE Anpassung
//     (nie eine zweite Kopie; Version zählt hoch).
//  F) Offene Begehung wieder öffnen → prSyncPunkte zieht die Anpassung über
//     das basisId-Match nach: weiter 5 Punkte (kein Duplikat), Bezeichnung
//     nachgezogen, punktId bleibt die GEMA-Id, Antwort unangetastet.
//  G) prPkResetAnpassung → org-Record weg, GEMA-Original wieder wirksam.
//  H) Super-Admin (role_admin) bearbeitet den GLOBALEN Punkt weiterhin direkt
//     («Prüfpunkt bearbeiten», kein basisId-Umweg).
// Aufruf: CHROME=<chromium> node scripts/pruefliste_org_anpassung_test.mjs
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
  await page.waitForFunction(() => window._prHooks, null, { timeout: 9000 });
  return { ctx, page };
}

try {
  /* ─── A) Org-Admin ohne Super: Rechte + Standardlisten-UI ─── */
  console.log('■ A) Org-Admin (Planer, org.admins) — Rechte + Standardliste');
  errors.length = 0;
  const { ctx, page } = await open(['role_planer']);
  const rechte = await page.evaluate(() => window._prHooks.rechte());
  ok('Persona: manage JA, super NEIN (Org-Admin via org.admins)', rechte.manage === true && rechte.super === false && rechte.begehung === true);

  /* ─── B) Begehung + Anlage «gas» VOR der Anpassung ─── */
  console.log('■ B) Begehung mit Anlage «gas» (Zeilen unter GEMA-Ids)');
  await page.evaluate(() => { window.prNeu(); window.prAddAnlage('gas'); });
  let begs = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG));
  const begId = begs[0].id;
  ok('Anlage «gas» mit 5 GEMA-Punkten', begs[0].anlagen[0].punkte.length === 5);
  ok('Zeile läuft unter GEMA-Id prstd_def_0', begs[0].anlagen[0].punkte.some(p => p.punktId === 'prstd_def_0'));
  // eine Antwort erfassen — sie muss den Sync später ÜBERLEBEN
  const idx0 = await page.evaluate(() => {
    const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
    return b.anlagen[0].punkte.findIndex(p => p.punktId === 'prstd_def_0');
  });
  await page.evaluate(i => window.prSetAntwort(0, i, 'ja'), idx0);
  await page.evaluate(() => window.prCloseEditor());

  console.log('■ A2) Standardliste: ✏️ auf GEMA-Punkten, kein 🗑 für Nicht-Super');
  await page.evaluate(() => { window.prSetTab('verwaltung'); window.prVView('standard'); });
  await page.waitForSelector('#vContent .vrow', { timeout: 6000 });
  const vHtml = await page.$eval('#vContent', el => el.innerHTML);
  ok('Hinweiszeile «passt einen GEMA-Punkt für deine Firma an»', vHtml.indexOf('passt einen GEMA-Punkt für deine Firma an') >= 0);
  ok('✏️ mit Titel «Für die eigene Firma anpassen»', vHtml.indexOf('Für die eigene Firma anpassen') >= 0);
  ok('KEIN prPkDelGlobal-🗑 für Nicht-Super', vHtml.indexOf('prPkDelGlobal') < 0);
  ok('KEIN prPkToggleGlobal für Nicht-Super', vHtml.indexOf('prPkToggleGlobal') < 0);
  ok('«Für Firma ausblenden» weiterhin da (Hide-Override)', vHtml.indexOf('prPkHideForOrg') >= 0);

  /* ─── C) GEMA-Punkt für Firma anpassen ─── */
  console.log('■ C) prPkEdit(global) → Firmen-Kopie mit basisId');
  await page.evaluate(() => window.prPkEdit('prstd_def_0', 'global'));
  ok('Editor offen', await page.$eval('#pkEditBg', el => el.classList.contains('open')));
  ok('Titel «GEMA-Punkt für Firma anpassen»', (await page.$eval('#pkEditTitle', el => el.textContent)) === 'GEMA-Punkt für Firma anpassen');
  ok('amber Hinweis «gilt nur für deine Firma»', (await page.$eval('#pkEditBody', el => el.textContent)).indexOf('gilt nur für deine Firma') >= 0);
  const origBez = await page.$eval('#pkBez', el => el.value);
  ok('Bezeichnung aus dem GEMA-Original vorbefüllt', origBez === 'Pendelgasleitung vorhanden?');
  await page.fill('#pkBez', 'Pendelgasleitung vorhanden? (inkl. Firmen-Zusatz Manometer)');
  await page.fill('#pkEmpf', 'Firmen-Empfehlung: Manometer-Kontrolle dokumentieren.');
  await page.evaluate(() => window.prPkSave());
  await page.waitForFunction(() => window._prHooks.stdOrgAll().some(p => p.basisId === 'prstd_def_0'), null, { timeout: 4000 });

  const anp = await page.evaluate(() => window._prHooks.stdOrgAll().filter(p => p.basisId === 'prstd_def_0')[0]);
  ok('org-Record mit basisId prstd_def_0 angelegt', !!anp);
  ok('NEUE Record-Id (nie unter der GEMA-Id gespeichert!)', anp.id !== 'prstd_def_0' && /^prstd_/.test(anp.id));
  ok('scope org + orgId der eigenen Firma', anp.scope === 'org' && anp.orgId === 'org_test');
  ok('Version 1 + Log-Grund «GEMA-Punkt für Firma angepasst»', anp.version === 1 && anp.log && anp.log[0] && anp.log[0].grund === 'GEMA-Punkt für Firma angepasst');
  const glob0 = await page.evaluate(() => window._prHooks.stdGlobalMerged().filter(p => p.id === 'prstd_def_0')[0]);
  ok('GEMA-Original UNVERÄNDERT (andere Orgs unberührt)', !!glob0 && glob0.bezeichnung === 'Pendelgasleitung vorhanden?');
  const eff = await page.evaluate(() => window._prHooks.effektivePunkte('gas', ''));
  ok('effektiv weiter 5 Gas-Punkte (Ersetzung, kein Duplikat)', eff.length === 5);
  ok('effektive Liste zeigt die Firmen-Fassung', eff.some(p => /Firmen-Zusatz Manometer/.test(p.bezeichnung)));
  ok('GEMA-Original in der effektiven Liste unterdrückt', !eff.some(p => p.id === 'prstd_def_0'));

  /* ─── D) Badges + Buttons in der Standardliste ─── */
  console.log('■ D) Standardliste: Badges + ↺');
  const vHtml2 = await page.$eval('#vContent', el => el.innerHTML);
  ok('GEMA-Zeile: Badge «✎ durch Firma angepasst»', vHtml2.indexOf('✎ durch Firma angepasst') >= 0);
  ok('GEMA-Zeile: «↺ Anpassung entfernen»-Button', vHtml2.indexOf('↺ Anpassung entfernen') >= 0);
  ok('Org-Zeile: Badge «✎ Anpassung eines GEMA-Punkts»', vHtml2.indexOf('✎ Anpassung eines GEMA-Punkts') >= 0);
  const gedimmt = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#vContent .vrow'));
    const r = rows.find(x => x.textContent.indexOf('durch Firma angepasst') >= 0);
    return r ? r.classList.contains('inaktiv') : null;
  });
  ok('angepasste GEMA-Zeile gedimmt (.inaktiv)', gedimmt === true);
  const anpRowHtml = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#vContent .vrow'));
    const r = rows.find(x => x.textContent.indexOf('Anpassung eines GEMA-Punkts') >= 0);
    return r ? r.innerHTML : '';
  });
  ok('Anpassungs-Zeile: ↺ statt 🗑 (Reset statt Löschen)', anpRowHtml.indexOf('prPkResetAnpassung') >= 0 && anpRowHtml.indexOf('prPkDelOrg') < 0);

  /* ─── E) Erneutes ✏️ bearbeitet die BESTEHENDE Anpassung ─── */
  console.log('■ E) Re-Edit routet auf die bestehende Anpassung');
  await page.evaluate(() => window.prPkEdit('prstd_def_0', 'global'));
  ok('Titel «Firmen-Anpassung bearbeiten»', (await page.$eval('#pkEditTitle', el => el.textContent)) === 'Firmen-Anpassung bearbeiten');
  await page.fill('#pkBez', 'Pendelgasleitung vorhanden? (Firmen-Fassung v2)');
  await page.evaluate(() => window.prPkSave());
  await page.waitForFunction(() => window._prHooks.stdOrgAll().some(p => p.basisId === 'prstd_def_0' && /Firmen-Fassung v2/.test(p.bezeichnung)), null, { timeout: 4000 });
  const anpAll = await page.evaluate(() => window._prHooks.stdOrgAll().filter(p => p.basisId === 'prstd_def_0'));
  ok('weiterhin GENAU EINE Anpassung (keine zweite Kopie)', anpAll.length === 1);
  ok('gleiche Record-Id, Version hochgezählt', anpAll[0].id === anp.id && anpAll[0].version === 2);

  /* ─── F) Sync in die offene Begehung (basisId-Match) ─── */
  console.log('■ F) Offene Begehung: Anpassung nachgezogen, kein Duplikat');
  await page.evaluate(id => window.prOpen(id), begId);
  await page.waitForFunction(() => {
    const c = window.prCurrent(); return c && c.anlagen && c.anlagen[0];
  }, null, { timeout: 4000 });
  const anl = await page.evaluate(() => window.prCurrent().anlagen[0]);
  ok('weiter 5 Punkte (basisId-Match statt Anhängen)', anl.punkte.length === 5);
  const row0 = anl.punkte.find(p => p.punktId === 'prstd_def_0');
  ok('Zeile behält punktId prstd_def_0', !!row0);
  ok('Bezeichnung auf Firmen-Fassung nachgezogen', !!row0 && /Firmen-Fassung v2/.test(row0.bezeichnung));
  ok('Empfehlungs-Vorlage nachgezogen', !!row0 && /Manometer-Kontrolle/.test(row0.empfehlungVorlage));
  ok('erfasste Antwort bleibt unangetastet', !!row0 && row0.antwort === 'ja');
  await page.evaluate(() => window.prCloseEditor());

  /* ─── G) Anpassung entfernen → GEMA-Standard wieder wirksam ─── */
  console.log('■ G) prPkResetAnpassung stellt das Original wieder her');
  await page.evaluate(() => { window.prSetTab('verwaltung'); window.prVView('standard'); });
  await page.evaluate(() => window.prPkResetAnpassung('prstd_def_0'));
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  ok('Confirm nennt die Anpassung + «gilt … wieder unverändert»', (await page.$eval('.gema-dlg-bg', el => el.textContent)).indexOf('wieder unverändert') >= 0);
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForFunction(() => !window._prHooks.stdOrgAll().some(p => p.basisId === 'prstd_def_0'), null, { timeout: 4000 });
  ok('org-Anpassungs-Record gelöscht', true);
  const eff2 = await page.evaluate(() => window._prHooks.effektivePunkte('gas', ''));
  ok('GEMA-Original wieder in der effektiven Liste', eff2.some(p => p.id === 'prstd_def_0' && p.bezeichnung === 'Pendelgasleitung vorhanden?'));
  ok('weiter 5 Punkte, keine Firmen-Fassung mehr', eff2.length === 5 && !eff2.some(p => /Firmen-Fassung/.test(p.bezeichnung)));
  ok('keine pageerrors im Org-Admin-Durchlauf', errors.length === 0 || (console.log('   errs:', errors), false));
  await ctx.close();

  /* ─── H) Super-Admin bearbeitet global weiterhin DIREKT ─── */
  console.log('■ H) Super-Admin: ✏️ auf GEMA-Punkt bleibt Direkt-Bearbeitung');
  const { ctx: c2, page: p2 } = await open(['role_admin']);
  await p2.evaluate(() => { window.prSetTab('verwaltung'); window.prVView('standard'); });
  await p2.waitForSelector('#vContent .vrow', { timeout: 6000 });
  await p2.evaluate(() => window.prPkEdit('prstd_def_0', 'global'));
  ok('Titel «Prüfpunkt bearbeiten» (kein basisId-Umweg)', (await p2.$eval('#pkEditTitle', el => el.textContent)) === 'Prüfpunkt bearbeiten');
  await p2.fill('#pkBez', 'Pendelgasleitung vorhanden? (GEMA-weit präzisiert)');
  await p2.evaluate(() => window.prPkSave());
  await p2.waitForFunction(() => window._prHooks.stdGlobalMerged().some(p => p.id === 'prstd_def_0' && /GEMA-weit präzisiert/.test(p.bezeichnung)), null, { timeout: 4000 });
  ok('Save überschreibt den GLOBALEN Record (Cloud-Override des Seeds)', true);
  ok('keine org-Anpassung entstanden', await p2.evaluate(() => !window._prHooks.stdOrgAll().some(p => p.basisId === 'prstd_def_0')));
  await c2.close();

} catch (e) {
  fail++; console.error('  ✗ EXCEPTION:', e.message, e.stack && e.stack.split('\n')[1]);
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + n + ' fehlgeschlagen') : ('✓ Alle ' + n + ' Org-Anpassungs-Checks grün')));
process.exit(fail ? 1 : 0);
