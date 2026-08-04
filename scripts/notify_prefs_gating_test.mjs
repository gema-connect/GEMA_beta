// Test: Benachrichtigungs-Einstellungen zeigen NUR Gruppen von Modulen,
// auf die das Konto Zugriff hat (gema_notify_ui.js MODUL_ZUGRIFF) — plus
// sys_profil-Gating der Ausschreibungs-Einstellungen (BKP-Karte/-Toggle).
//
//   Layer 1 (Laufzeit-Drift-Guard): jede EVENT_KEYS-Gruppe hat einen
//     MODUL_ZUGRIFF-Eintrag + ein Label, jeder mods-Key existiert als
//     gema_auth-Modul — live aus der App gelesen (kein Regex-Drift).
//   Layer 2 (Playwright): Sichtbarkeits-Matrix pro Rolle + DOM-Check des Panels
//     + Selbstheilung über bereits erhaltene Notifikationen + sys_profil.
//
// Hinweis Rollen-Redirect: sys_profil ist seit 30.07.2026 vom Redirect
// ausgenommen (_KONTO_SEITEN in gema_auth) — die Messorte hier bleiben aber
// unverändert (Planer-Matrix auf sys_workspace, sys_profil-Positivfall mit
// Admin), sie prüfen die Sichtbarkeits-Logik, nicht den Redirect.
//
// Aufruf: CHROME=<chromium> node scripts/notify_prefs_gating_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};
const eqSet = (name, got, want) => {
  const g = [...got].sort().join(','), w = [...want].sort().join(',');
  ok(g === w, name + (g === w ? '' : `\n      erhalten: [${g}]\n      erwartet: [${w}]`));
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

console.log('■ Layer 1 — Laufzeit-Drift-Guard (live aus der App)');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._gnHooks && window.GemaNotify && window.GemaAuth, null, { timeout: 9000 });
  const drift = await page.evaluate(() => {
    const moduls = [...new Set(Object.values(GemaNotify.EVENT_KEYS).map(e => e.modul || 'weitere'))];
    const zugriff = _gnHooks.MODUL_ZUGRIFF, labels = _gnHooks.MODUL_LABELS;
    const authKeys = new Set(GemaAuth.getModules().map(m => m.key));
    const modsKeys = [...new Set(Object.values(zugriff).flatMap(c => c.mods || []))];
    return {
      anzahl: moduls.length,
      ohneZugriff: moduls.filter(m => !zugriff[m]),
      ohneLabel: moduls.filter(m => !labels[m]),
      badMods: modsKeys.filter(k => !authKeys.has(k))
    };
  });
  ok(drift.anzahl >= 25, `EVENT_KEYS-Gruppen live extrahiert (${drift.anzahl})`);
  ok(drift.ohneZugriff.length === 0, 'jede EVENT_KEYS-Gruppe hat einen MODUL_ZUGRIFF-Eintrag' + (drift.ohneZugriff.length ? ' — FEHLT: ' + drift.ohneZugriff.join(',') : ''));
  ok(drift.badMods.length === 0, 'alle mods-Keys existieren als gema_auth-Module' + (drift.badMods.length ? ' — UNBEKANNT: ' + drift.badMods.join(',') : ''));
  ok(drift.ohneLabel.length === 0, 'jede Gruppe hat ein MODUL_LABELS-Label' + (drift.ohneLabel.length ? ' — FEHLT: ' + drift.ohneLabel.join(',') : ''));
  await ctx.close();
}

// Sichtbarkeits-Matrix einer Rolle ermitteln (auf der Landing-Page der Rolle)
async function visibleGroups(roleIds, page_, extraSeed) {
  const s = seed(roleIds);
  if (extraSeed) Object.assign(s, extraSeed);
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/' + page_, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._gnHooks && window.GemaNotify, null, { timeout: 9000 });
  const groups = await page.evaluate(() => {
    const emp = {};
    (GemaNotify.getForCurrentUser() || []).forEach(n => {
      const ev = n && n.eventKey && GemaNotify.EVENT_KEYS[n.eventKey];
      if (ev && ev.modul) emp[ev.modul] = true;
    });
    const moduls = [...new Set(Object.values(GemaNotify.EVENT_KEYS).map(e => e.modul))];
    return moduls.filter(m => _gnHooks.gruppeSichtbar(m, emp));
  });
  return { ctx, page, groups };
}

// Alle 27 Laufzeit-Gruppen (EVENT_KEYS; «objekte» kommt nur in Demo-Seeds vor)
const ALLE = ['ausschreibung','werkzeug','fahrzeug','lu','schadensbericht','trocknung','produktkatalog','bestellungen','erp','regierapport','einsatzplan','goodel','abnahme','legionellen','spuelmanager','immobilien','arbeitskleider','service','stundenerfassung','revisionsunterlagen','behoerden_formulare','planablage','abos','chat','schule','pruefliste','visitenkarte'];

console.log('■ Layer 2 — Sichtbarkeits-Matrix pro Rolle');
{
  let r = await visibleGroups(['role_admin'], 'index.html');
  eqSet('Admin sieht alle 27 Gruppen', r.groups, ALLE);
  await r.ctx.close();

  r = await visibleGroups(['role_planer'], 'sys_workspace.html');
  eqSet('Planer sieht alle 27 Gruppen (Vollzugang)', r.groups, ALLE);
  await r.ctx.close();

  r = await visibleGroups(['role_monteur'], 'index.html');
  eqSet('Monteur: nur seine 16 Gruppen (kein Fahrzeug/Ausschreibung/Bestellungen …)', r.groups,
    ['werkzeug','trocknung','schadensbericht','regierapport','einsatzplan','goodel','abnahme','legionellen','spuelmanager','arbeitskleider','service','stundenerfassung','planablage','abos','chat','visitenkarte']);
  await r.ctx.close();

  r = await visibleGroups(['role_garagist'], 'sys_garagist_dashboard.html');
  eqSet('Garagist: nur Fahrzeug + Abos + Chat + eigene Karte', r.groups, ['fahrzeug','abos','chat','visitenkarte']);
  await r.ctx.close();

  r = await visibleGroups(['role_student'], 'ab_klassen.html');
  // Studierende OHNE GEMA Card (User-Entscheid 08/2026): keine visitenkarte-Gruppe
  eqSet('Studierende: nur Schule + Abos + Chat (KEINE Karte)', r.groups, ['schule','abos','chat']);
  await r.ctx.close();

  r = await visibleGroups(['role_lieferant'], 'sys_lieferant_dashboard.html');
  eqSet('Anlagenlieferant: Dashboard-Scope (OA/Werkzeug/Bestellungen/Revision/Ausschreibung)', r.groups,
    ['ausschreibung','produktkatalog','werkzeug','bestellungen','revisionsunterlagen','abos','chat','visitenkarte']);
  await r.ctx.close();

  r = await visibleGroups(['role_bauherrschaft'], 'sys_workspace.html');
  eqSet('Bauherrschaft: Freigabe-Scope inkl. Vergabeantrag (roles-Ausnahme)', r.groups,
    ['ausschreibung','regierapport','goodel','abnahme','revisionsunterlagen','planablage','abos','chat','visitenkarte']);
  await r.ctx.close();
}

console.log('■ Layer 2 — Selbstheilung: bereits erhaltene Notifikationen bleiben einstellbar');
{
  const notif = [{ id: 'n_test1', ts: '2026-07-14T08:00:00.000Z', eventKey: 'bestellung_bestaetigt',
    empfaengerUserId: 'u_test', modul: 'bestellungen', typ: 'info', titel: 'Test', text: '', gelesen: true }];
  const r = await visibleGroups(['role_monteur'], 'index.html', { gema_notifications_v1: notif });
  ok(r.groups.includes('bestellungen'), 'Monteur MIT erhaltener Bestell-Notifikation sieht die Gruppe «Bestellungen»');
  ok(!r.groups.includes('fahrzeug'), 'andere fremde Gruppen bleiben trotzdem ausgeblendet');
  await r.ctx.close();
}

console.log('■ Layer 2 — Panel-DOM (Monteur) + Hinweiszeile');
{
  const { ctx, page } = await newPage(browser, seed(['role_monteur']));
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._gnHooks && window.GemaNotify, null, { timeout: 9000 });
  await page.evaluate(() => _gnHooks.openSettings());
  await page.waitForSelector('#gnSettingsOverlay', { timeout: 5000 });
  const txt = await page.$eval('#gnPrefList', el => el.textContent);
  ok(txt.includes('Werkzeugmanagement'), 'Panel zeigt Werkzeug-Gruppe (Monteur hat Zugriff)');
  ok(!txt.includes('Fahrzeugmanagement'), 'Panel zeigt KEINE Fahrzeug-Gruppe');
  ok(!txt.includes('Ausschreibung & Vergabe'), 'Panel zeigt KEINE Ausschreibungs-Gruppe');
  ok(await page.$('#gnPrefHint') != null, 'Hinweiszeile «nur Module mit Zugriff» vorhanden');
  const sektionen = await page.$$eval('#gnPrefList > div', els => els.filter(e => e.id !== 'gnPrefHint').length);
  ok(sektionen === 16, 'genau 16 Gruppen-Sektionen gerendert (' + sektionen + ')');
  await ctx.close();
}

console.log('■ Layer 2 — Admin-Panel unverändert (alle Gruppen, keine Hinweiszeile)');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._gnHooks && window.GemaNotify, null, { timeout: 9000 });
  await page.evaluate(() => _gnHooks.openSettings());
  await page.waitForSelector('#gnSettingsOverlay', { timeout: 5000 });
  const sektionen = await page.$$eval('#gnPrefList > div', els => els.filter(e => e.id !== 'gnPrefHint').length);
  ok(sektionen === 27, 'Admin: alle 27 Gruppen-Sektionen (' + sektionen + ')');
  ok(await page.$('#gnPrefHint') == null, 'keine Hinweiszeile, wenn nichts ausgeblendet ist');
  await ctx.close();
}

console.log('■ sys_profil — Ausschreibungs-Einstellungen nur mit Modul-Zugriff');
{
  let { ctx, page } = await newPage(browser, seed(['role_monteur']));
  await page.goto(BASE + '/sys_profil.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  ok(await page.$eval('#cardBkpDefaults', el => el.style.display === 'none'), 'Monteur: Karte «Standard BKP-Auswahl» ausgeblendet');
  ok(await page.$eval('#rowDynBKP', el => el.style.display === 'none'), 'Monteur: Toggle «Dynamische BKP-Nummerierung» ausgeblendet');
  await ctx.close();

  // Positivfall mit Admin — reine Planer werden von sys_profil per
  // Rollen-Redirect nach sys_workspace geleitet (bestehendes Verhalten).
  ({ ctx, page } = await newPage(browser, seed(['role_admin'])));
  await page.goto(BASE + '/sys_profil.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  ok(await page.$eval('#cardBkpDefaults', el => el.style.display !== 'none'), 'Admin (mit Ausschreibungs-Zugriff): BKP-Karte sichtbar');
  ok(await page.$eval('#rowDynBKP', el => el.style.display !== 'none'), 'Admin: BKP-Toggle sichtbar');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail === 0 ? `✅ ${pass}/${pass + fail} Checks grün` : `❌ ${fail}/${pass + fail} rot`));
process.exit(fail === 0 ? 0 : 1);
