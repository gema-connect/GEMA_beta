// Playwright-Smoke-Test für das Arbeitskleider-Modul (if_arbeitskleider.html):
// Manager-Sicht (Katalog-CRUD, Bezug aus Katalog + freier Eintrag, Überschreitungs-
// Warnung, Storno, Einstellungen inkl. Overrides), Mitarbeiter-Sicht (eigener Saldo,
// Sicht-Toggle aus) und Zugriffs-Gating für Rollen ohne Permission.
// Aufruf: CHROME=<chromium> node scripts/arbeitskleider_smoke_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};
const MONTEUR = { id: 'u_mont', username: 'm@test.ch', name: 'Marco Meier', roleIds: ['role_monteur'], orgId: 'org_test', active: true, profile: { email: 'm@test.ch' } };

// PostgREST-Mock für die geseedeten Pools: der Harness-Default liefert für
// Supabase-GETs [], womit bindCollection die localStorage-Seeds überschreiben
// würde. Diese Route (nach wireRoutes registriert → gewinnt via LIFO) liefert
// die Pool-Records im echten Row-Format {data_key, payload:{data,_lm}} zurück.
async function wireAkPools(ctx, poolAJson, poolBJson) {
  const rows = (json, pf) => JSON.parse(json || '[]').map(r => ({ data_key: pf + r.id, payload: { data: r, _lm: 1 } }));
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (route.request().method() === 'GET' && u.indexOf('/gema_data') >= 0 && u.indexOf('module_key=eq.arbeitskleider') >= 0) {
      const body = u.indexOf('akart') >= 0 ? rows(poolAJson, 'akart:') : (u.indexOf('akbez') >= 0 ? rows(poolBJson, 'akbez:') : []);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fallback();
  });
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ── Kontext 1: Magaziner verwaltet ──────────────────────────────────
console.log('■ Magaziner: Übersicht, Katalog, Bezüge');
const s1 = seed(['role_magaziner']);
s1.gema_users_v1.push(MONTEUR);
const { ctx: ctx1, page: p1 } = await newPage(browser, s1);
await p1.goto(BASE + '/if_arbeitskleider.html', { waitUntil: 'domcontentloaded' });
await p1.waitForSelector('#akTabs .vtab', { timeout: 12000 });

ok(await p1.evaluate(() => document.querySelectorAll('#akTabs .vtab').length) === 4, 'Manager sieht 4 Tabs');
ok((await p1.evaluate(() => document.getElementById('akContent').textContent)).indexOf('Mitarbeitende') >= 0, 'Übersicht rendert KPIs');
ok(await p1.evaluate(() => window._akHooks.orgUsers().length) === 2, '2 Mitarbeitende in der Org');
ok((await p1.evaluate(() => document.getElementById('akContent').textContent)).indexOf('300.00') >= 0, 'Standard-Budget CHF 300 auf den Karten');

// Katalog: Artikel anlegen
await p1.click('#akTabs .vtab[data-tab="katalog"]');
ok(await p1.evaluate(() => document.getElementById('btnArtikel').style.display !== 'none'), '«＋ Artikel» im Katalog-Tab sichtbar');
await p1.click('#btnArtikel');
await p1.fill('#af_name', 'T-Shirt Basic');
await p1.fill('#af_preis', '25');
await p1.fill('#af_groessen', 'S, M, L');
await p1.evaluate(() => window.akArtikelSave(''));
await p1.waitForTimeout(120);
{
  const t = await p1.evaluate(() => document.getElementById('akContent').textContent);
  ok(t.indexOf('T-Shirt Basic') >= 0 && t.indexOf('25.00') >= 0, 'Artikel erscheint im Katalog mit Preis');
  ok(t.indexOf('S, M, L') >= 0, 'Grössenliste am Artikel');
  ok(await p1.evaluate(() => window._akHooks.artikelAll().length) === 1, 'Artikel-Pool hat 1 Record');
}

// Bezug aus Katalog: 2× T-Shirt M für Marco
await p1.evaluate(() => window.akBezugNeu('u_mont'));
await p1.waitForSelector('#bz_artikel');
const artId = await p1.evaluate(() => window._akHooks.artikelAll()[0].id);
await p1.selectOption('#bz_artikel', artId);
await p1.waitForTimeout(80);
ok(await p1.evaluate(() => document.getElementById('bz_preis').value) === '25', 'Preis wird aus dem Artikel vorbefüllt');
ok(await p1.evaluate(() => document.getElementById('bz_groessen_wrap').style.display !== 'none'), 'Grössen-Chips erscheinen');
await p1.click('#bz_groessen .gchip:nth-child(2)');   // M
await p1.click('.steppr button:last-child');          // Menge 2
await p1.waitForTimeout(60);
{
  const rest = await p1.evaluate(() => document.getElementById('bz_rest').textContent);
  ok(rest.indexOf('250.00') >= 0, 'Live-Vorschau: Rest nach Bezug CHF 250.00 (300 − 2×25)');
}
await p1.click('#bz_save');
await p1.waitForTimeout(150);
{
  const t = await p1.evaluate(() => { window._akHooks.setTab('uebersicht'); return document.getElementById('akContent').textContent; });
  ok(t.indexOf('250.00') >= 0, 'Übersicht: Marco hat Rest CHF 250.00');
  const notif = await p1.evaluate(() => JSON.parse(localStorage.getItem('gema_notifications_v1') || '[]'));
  ok(notif.some(n => n.eventKey === 'kleider_bezug' && n.empfaengerUserId === 'u_mont'), 'Notifikation kleider_bezug an Marco erzeugt');
}

// Freier Eintrag mit Überschreitung
console.log('■ Freier Eintrag + Überschreitungs-Warnung');
await p1.evaluate(() => window.akBezugNeu('u_mont'));
await p1.waitForSelector('#bz_seg_frei');
await p1.click('#bz_seg_frei');
await p1.fill('#bz_frei_name', 'Sicherheitsschuhe (Quittung)');
await p1.evaluate(() => { const s = document.getElementById('bz_frei_kat'); s.value = 'schuhe'; s.dispatchEvent(new Event('change')); });
await p1.fill('#bz_preis', '400');
await p1.evaluate(() => window.akBzPreis('400'));
await p1.waitForTimeout(60);
{
  const box = await p1.evaluate(() => ({ cls: document.getElementById('bz_rest').className, txt: document.getElementById('bz_rest').textContent }));
  ok(box.cls.indexOf('neg') >= 0, 'Rest-Box wird rot (Überschreitung)');
  ok(box.txt.indexOf('Budget wird überschritten') >= 0, 'Warntext «Budget wird überschritten»');
}
await p1.click('#bz_save');
await p1.waitForTimeout(150);
{
  const t = await p1.evaluate(() => document.getElementById('akContent').textContent);
  ok(t.indexOf('−150.00') >= 0, 'Bezug trotzdem erfasst — Marco Rest −150.00');
  ok(await p1.evaluate(() => window._akHooks.saldoFor('u_mont').negativ) === true, 'Saldo-Flag negativ gesetzt');
  const kpi = await p1.evaluate(() => document.querySelector('.kpi.warn .v').textContent);
  ok(kpi === '1', 'KPI «Überzogen» zählt 1');
}

// Log + Storno
console.log('■ Log + Storno');
await p1.click('#akTabs .vtab[data-tab="log"]');
{
  const t = await p1.evaluate(() => document.getElementById('akContent').textContent);
  ok(t.indexOf('Sicherheitsschuhe') >= 0 && t.indexOf('T-Shirt Basic') >= 0, 'Log listet beide Bezüge');
  ok(t.indexOf('frei') >= 0, 'freier Eintrag im Log markiert');
  ok(t.indexOf('Test User') >= 0, 'Log zeigt «Erfasst von»');
}
await p1.evaluate(() => { window.GemaDialog = window.GemaDialog || {}; GemaDialog.prompt = () => Promise.resolve('Falsch erfasst'); });
const schuhId = await p1.evaluate(() => window._akHooks.bezuegeAll().find(b => b.typ === 'frei').id);
await p1.evaluate(id => window.akStorno(id), schuhId);
await p1.waitForTimeout(150);
{
  ok(await p1.evaluate(() => window._akHooks.bezuegeAll().find(b => b.typ === 'frei').storniert.grund) === 'Falsch erfasst', 'Storno mit Grund gespeichert');
  ok(Math.abs(await p1.evaluate(() => window._akHooks.saldoFor('u_mont').rest) - 250) < 0.001, 'Storno zählt nicht mehr — Rest wieder 250');
  const t = await p1.evaluate(() => document.getElementById('akContent').textContent);
  ok(t.indexOf('storniert') >= 0, 'Log zeigt Storno-Badge (Eintrag bleibt sichtbar)');
}

// Einstellungen: Budget 500, Override Marco 100, Mitarbeiter-Sicht AUS
console.log('■ Einstellungen: Standard + Ausnahme + Sicht-Toggle');
await p1.click('#akTabs .vtab[data-tab="einstellungen"]');
await p1.fill('#st_budget', '500');
await p1.fill('[data-ov-betrag="u_mont"]', '100');
await p1.evaluate(() => { document.getElementById('st_sicht').checked = false; });
await p1.evaluate(() => window.akSettingsSave());
await p1.waitForTimeout(120);
{
  const cfg = await p1.evaluate(() => (GemaAuth.getOrgs()[0].settings || {}).arbeitskleider);
  ok(cfg && cfg.budget === 500, 'Org-Settings: Standard-Budget 500 gespeichert');
  ok(cfg && cfg.budgets.u_mont && cfg.budgets.u_mont.betrag === 100, 'Override Marco 100 gespeichert');
  ok(cfg && cfg.mitarbeiterSicht === false, 'Mitarbeiter-Sicht deaktiviert gespeichert');
  await p1.evaluate(() => window._akHooks.setTab('uebersicht'));
  const t = await p1.evaluate(() => document.getElementById('akContent').textContent);
  ok(t.indexOf('50.00') >= 0, 'Marco: Rest 50.00 (Override 100 − 50 bezogen)');
  ok(t.indexOf('500.00') >= 0, 'Manager selbst: Rest 500.00 (neues Standard-Budget, keine Bezüge)');
}
// Zustand für Kontext 2/3 exportieren
const poolA = await p1.evaluate(() => localStorage.getItem('gema_ak_artikel_pool_v1'));
const poolB = await p1.evaluate(() => localStorage.getItem('gema_ak_bezug_pool_v1'));
const orgsJson = await p1.evaluate(() => localStorage.getItem('gema_orgs_v1'));
await ctx1.close();

// ── Kontext 2: Monteur bei deaktivierter Mitarbeiter-Sicht ─────────
console.log('■ Monteur: Mitarbeiter-Sicht deaktiviert (Variante «nur Magaziner»)');
const s2 = seed(['role_monteur']);
s2.gema_users_v1 = JSON.parse(JSON.stringify(s2.gema_users_v1));
s2.gema_users_v1.push(MONTEUR);
s2.gema_session_v1 = { userId: 'u_mont', expires: s2.gema_session_v1.expires };
s2.gema_orgs_v1 = JSON.parse(orgsJson);
s2['gema_ak_artikel_pool_v1'] = JSON.parse(poolA);
s2['gema_ak_bezug_pool_v1'] = JSON.parse(poolB);
const { ctx: ctx2, page: p2 } = await newPage(browser, s2);
await wireAkPools(ctx2, poolA, poolB);
await p2.goto(BASE + '/if_arbeitskleider.html', { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(900);
{
  const t = await p2.evaluate(() => (document.getElementById('akContent') || {}).textContent || document.body.textContent);
  ok(t.indexOf('für Mitarbeitende deaktiviert') >= 0, 'Monteur sieht Deaktiviert-Hinweis');
  ok(await p2.evaluate(() => { const tb = document.getElementById('akToolbar'); return !tb || tb.style.display === 'none'; }), 'keine Tabs/Toolbar für Monteur');
}
await ctx2.close();

// ── Kontext 3: Monteur mit aktiver Mitarbeiter-Sicht ────────────────
console.log('■ Monteur: eigener Saldo + eigenes Log (Variante «Magaziner erfasst, alle sehen sich»)');
const s3 = JSON.parse(JSON.stringify(s2));
s3.gema_orgs_v1[0].settings.arbeitskleider.mitarbeiterSicht = true;
const { ctx: ctx3, page: p3 } = await newPage(browser, s3);
await wireAkPools(ctx3, poolA, poolB);
await p3.goto(BASE + '/if_arbeitskleider.html', { waitUntil: 'domcontentloaded' });
await p3.waitForTimeout(900);
{
  const t = await p3.evaluate(() => document.getElementById('akContent').textContent);
  ok(t.indexOf('Mein Kleiderbudget') >= 0, 'Monteur sieht «Mein Kleiderbudget»');
  ok(t.indexOf('50.00') >= 0, 'eigener Rest CHF 50.00 sichtbar');
  ok(t.indexOf('T-Shirt Basic') >= 0 && t.indexOf('Sicherheitsschuhe') >= 0, 'eigene Bezüge gelistet (inkl. stornierter)');
  ok(t.indexOf('storniert') >= 0, 'stornierter Eintrag als solcher markiert');
  ok(t.indexOf('Test User') < 0, 'keine fremden Mitarbeiter-Daten in der Sicht');
  ok(await p3.evaluate(() => { const tb = document.getElementById('akToolbar'); return !tb || tb.style.display === 'none'; }), 'kein Bezug-Erfassen-Button für Monteur');
  await p3.evaluate(() => window.akBezugNeu('u_mont'));
  ok(await p3.evaluate(() => !document.querySelector('#akModalHost .modal')), 'akBezugNeu ist für Monteur wirkungslos (Manager-Guard)');
}
await ctx3.close();

// ── Kontext 4: Rolle ohne Permission → Kein Zugriff ────────────────
console.log('■ Zugriffs-Gating');
const { ctx: ctx4, page: p4 } = await newPage(browser, seed(['role_unternehmer']));
await p4.goto(BASE + '/if_arbeitskleider.html', { waitUntil: 'domcontentloaded' });
await p4.waitForTimeout(900);
ok((await p4.evaluate(() => document.body.textContent)).indexOf('Kein Zugriff') >= 0, 'Unternehmer ohne Permission → «Kein Zugriff»-Screen');
await ctx4.close();

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
