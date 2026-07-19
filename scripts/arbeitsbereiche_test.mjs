// Playwright-Smoke: Arbeitsbereiche + Garantie-Auswertung (07/2026)
//   - org.settings.arbeitsbereiche [{id,name,farbe}]: Editor in den ERP- und
//     Einsatzplan-Einstellungen (IDs bleiben beim Umbenennen stabil)
//   - Offerte bekommt bereichId → «Zu Auftrag» vererbt → Einsatz aus Auftrag
//     vererbt → Kalender-Karte (Woche/Monat/Meine) in der Bereichsfarbe
//   - Einsatz-Flag «Garantiearbeit» (🛡) + Jahres-Auswertung: Stunden aus der
//     Stundenerfassung (eintrag.einsatzId), Material aus verknüpften
//     Regierapporten (eintrag.rapportId), CSV
// Ausführen: CHROME=<chromium> node scripts/arbeitsbereiche_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ═══ A) ERP: Bereiche definieren + Offerte → Auftrag vererbt ═══
console.log('■ ERP: Arbeitsbereiche-Editor in den ⚙️-Einstellungen');
const s1 = seed(['role_planer']);
const { ctx: c1, page: p1 } = await newPage(browser, s1);
const errors1 = [];
p1.on('pageerror', e => errors1.push(e.message));
await p1.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await p1.waitForFunction(() => typeof erpOpenSettings === 'function', null, { timeout: 12000 });
await p1.waitForTimeout(500);

await p1.evaluate(() => erpOpenSettings());
ok(await p1.evaluate(() => !!document.getElementById('s_abRows')), 'Einstellungen haben die Arbeitsbereiche-Sektion');
await p1.evaluate(() => {
  abRowAdd('s_abRows');
  const r1 = document.querySelectorAll('#s_abRows .ab-row')[0];
  r1.querySelector('.ab-name').value = 'Sanitär';
  r1.querySelector('.ab-farbe').value = '#16a34a';
  abRowAdd('s_abRows');
  const r2 = document.querySelectorAll('#s_abRows .ab-row')[1];
  r2.querySelector('.ab-name').value = 'Sanitärservice';
  r2.querySelector('.ab-farbe').value = '#d97706';
  erpSetSave();
});
await p1.waitForTimeout(300);
{
  const st = await p1.evaluate(() => GemaAuth.getOrgs()[0].settings.arbeitsbereiche);
  ok(Array.isArray(st) && st.length === 2 && st[0].name === 'Sanitär' && st[0].farbe === '#16a34a', 'Bereiche als [{id,name,farbe}] gespeichert (top-level org.settings)');
  ok(st[0].id === 'ab_sanitaer' && st[1].id === 'ab_sanitaerservice', 'Slug-IDs (Umlaut → ae)');
}
// Umbenennen behält die ID
await p1.evaluate(() => {
  erpOpenSettings();
  document.querySelectorAll('#s_abRows .ab-row')[1].querySelector('.ab-name').value = 'Service';
  erpSetSave();
});
await p1.waitForTimeout(200);
ok(await p1.evaluate(() => {
  const st = GemaAuth.getOrgs()[0].settings.arbeitsbereiche;
  return st[1].id === 'ab_sanitaerservice' && st[1].name === 'Service';
}), 'Umbenennen behält die stabile ID (Zuweisungen bleiben verknüpft)');

console.log('■ ERP: Offerte mit Bereich → Auftrag erbt');
await p1.evaluate(() => {
  erpNeu('offerte');
  cur.titel = 'Boiler ersetzen';
  cur.kundeSnapshot = { firma: 'Muster AG' };
  document.getElementById('e_bereich').value = 'ab_sanitaer';
  document.getElementById('e_bereich').dispatchEvent(new Event('change'));
  erpSaveCur(true);
});
ok(await p1.evaluate(() => !!document.getElementById('e_bereich')), 'Offerten-Editor zeigt das Arbeitsbereich-Feld');
ok(await p1.evaluate(() => cur.bereichId === 'ab_sanitaer'), 'Offerte trägt bereichId');
await p1.evaluate(() => erpZuAuftrag());
await p1.waitForTimeout(300);
{
  const r = await p1.evaluate(() => ({ typ: cur.typ, bereich: cur.bereichId }));
  ok(r.typ === 'auftrag' && r.bereich === 'ab_sanitaer', '«Zu Auftrag» vererbt den Bereich');
}
const auftragId = await p1.evaluate(() => cur.id);
// Karte zeigt den Chip
await p1.evaluate(() => { erpCloseEditor(); _tab = 'auftrag'; erpRenderAll(); });
ok(await p1.evaluate(() => document.querySelector('#docList .ab-chip') && document.querySelector('#docList .ab-chip').textContent.indexOf('Sanitär') >= 0), 'Auftrags-Karte zeigt den Bereich-Chip');
// Akonto-Rechnung erbt ebenfalls
await p1.evaluate(id => { erpOpen(id); }, auftragId);
await p1.evaluate(() => {
  const re = _erpNeueRechnung(cur, 'akonto', [{ id: 'p1', art: 'akonto', bez: 'Akonto', menge: 1, einheit: 'pausch.', ep: 500 }], 'Akonto');
  window._testReId = re.id;
});
ok(await p1.evaluate(() => (GemaSync.getCached('gema_erp_dok_pool_v1') || []).find(d => d.id === window._testReId).bereichId === 'ab_sanitaer'), 'Rechnung erbt den Bereich vom Auftrag');
ok(errors1.length === 0, 'ERP ohne JS-Fehler' + (errors1.length ? ' — ' + errors1[0] : ''));

// Org-Settings + Auftrag für den Einsatzplan-Kontext mitnehmen
const orgSettings = await p1.evaluate(() => GemaAuth.getOrgs()[0].settings);
const erpPool = await p1.evaluate(() => GemaSync.getCached('gema_erp_dok_pool_v1'));
await c1.close();

// ═══ B) Einsatzplan: Vererbung, Farbe, Garantie, Auswertung ═══
console.log('■ Einsatzplan: Einsatz aus Auftrag erbt Bereich, Karte in Bereichsfarbe');
const s2 = seed(['role_planer']);
s2.gema_users_v1.push({ id: 'u_mont', username: 'm@test.ch', name: 'Marco Monteur', roleIds: ['role_monteur'], orgId: 'org_test', active: true, profile: { email: 'm@test.ch' } });
s2.gema_orgs_v1[0].settings = orgSettings;
const { ctx: c2, page: p2 } = await newPage(browser, s2);
const errors2 = [];
p2.on('pageerror', e => errors2.push(e.message));
await p2.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
await p2.waitForFunction(() => typeof epRender === 'function' && typeof epGarantieAuswertung === 'function', null, { timeout: 12000 });
await p2.waitForTimeout(600);
// ERP-Pool NACH dem Boot seeden (der gemockte leere Cloud-Pull würde ihn sonst überschreiben)
await p2.evaluate(pool => { localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(pool)); epRender(); }, erpPool);

// Pool-Karte VOR dem Einplanen prüfen — der Auftrags-Pool zeigt nur noch Uneingeplante
ok(await p2.evaluate(() => {
  const j = document.querySelector('.job .ab-chip');
  return !!j && j.textContent.indexOf('Sanitär') >= 0;
}), 'Pool-Auftrag zeigt den Bereich-Chip');

const MO = '2026-07-13';
await p2.evaluate((args) => {
  _anker = args.mo;
  const a = epAuftraege().find(x => x.id === args.auftragId);
  epNeuAusAuftrag(a, 'u_mont', args.mo);
}, { mo: MO, auftragId });
await p2.waitForTimeout(300);
const evId = await p2.evaluate(() => epAll()[0].id);
{
  const ev = await p2.evaluate(() => epAll()[0]);
  ok(ev.bereichId === 'ab_sanitaer' && ev.garantie === false, 'Einsatz aus Auftrag erbt bereichId (garantie default aus)');
}
{
  const card = await p2.evaluate(() => {
    const el = document.querySelector('.ev');
    return { style: el ? el.getAttribute('style') || '' : null, bc: el ? getComputedStyle(el).borderTopColor : '' };
  });
  ok(card.style && card.style.indexOf('border-color:#16a34a') >= 0, 'Wochen-Karte trägt die Bereichsfarbe (Rand grün)');
  ok(card.bc === 'rgb(22, 163, 74)', 'Farbstil greift im Rendering');
}
console.log('■ Garantie-Flag im Einsatz-Modal');
await p2.evaluate(id => epEvOpen(id), evId);
ok(await p2.evaluate(() => document.getElementById('evBereichWrap').style.display !== 'none' && document.getElementById('ev_bereich').value === 'ab_sanitaer'), 'Modal: Bereich-Select vorbelegt');
await p2.evaluate(() => {
  document.getElementById('ev_garantie').checked = true;
  epEvSave();
});
await p2.waitForTimeout(300);
ok(await p2.evaluate(() => epAll()[0].garantie === true), 'Garantie-Häkchen gespeichert');
ok(await p2.evaluate(() => document.querySelector('.ev') && document.querySelector('.ev').innerHTML.indexOf('🛡') >= 0), 'Wochen-Karte zeigt 🛡');
await p2.evaluate(() => { _view = 'monat'; epRender(); });
ok(await p2.evaluate(() => {
  const d = [...document.querySelectorAll('.mdot')].find(x => x.textContent.indexOf('🛡') >= 0);
  return !!d && (d.getAttribute('style') || '').indexOf('inset 3px 0 0 #16a34a') >= 0;
}), 'Monats-Punkt: 🛡 + Bereichsfarbe');

console.log('■ Garantie-Jahres-Auswertung (Stunden + Material)');
// Stundenerfassung: 2 Zeiteinträge auf den Garantie-Einsatz (5h + 3h, einer mit Rapport);
// Regierapport mit Material 2×45 + 1×120 = 210 CHF
await p2.evaluate((args) => {
  const tag = { id: 't_1', orgId: 'org_test', userId: 'u_mont', userName: 'Marco Monteur', datum: args.mo,
    eintraege: [
      { id: 'e1', von: '07:00', bis: '12:15', pauseMin: 15, objektId: '', taetigkeit: 'Nachbesserung', einsatzId: args.evId, rapportId: 'rap_1' },
      { id: 'e2', von: '13:00', bis: '16:00', pauseMin: 0, objektId: '', taetigkeit: 'Nachbesserung', einsatzId: args.evId }
    ], spesen: {}, status: 'offen' };
  const fremd = { id: 't_2', orgId: 'org_test', userId: 'u_mont', userName: 'Marco', datum: args.mo,
    eintraege: [{ id: 'e3', von: '07:00', bis: '17:00', pauseMin: 0, einsatzId: 'ev_anderer' }], spesen: {}, status: 'offen' };
  localStorage.setItem('gema_std_pool_v1', JSON.stringify([tag, fremd]));
  const rap = { id: 'rap_1', orgId: 'org_test', nr: 'R-001', status: 'ausgewiesen',
    stunden: [{ kategorie: 'Monteur', std: 5, ansatz: 95 }],
    material: [{ id: 'm1', bez: 'Dichtung', menge: 2, einheit: 'Stk', ep: 45 }, { id: 'm2', bez: 'Mischer', menge: 1, einheit: 'Stk', ep: 120 }] };
  localStorage.setItem('gema_regie_pool_v1', JSON.stringify([rap]));
  _epGarBound = true;   // Lazy-Bind übersteuern — der gemockte leere Cloud-Pull würde die geseedeten Pools wischen
  _view = 'garantie'; _anker = args.mo; epRender();
}, { mo: MO, evId });
await p2.waitForTimeout(400);
{
  const res = await p2.evaluate(() => _epGarantieDaten());
  ok(res.anzahl === 1, 'Auswertung findet den Garantie-Einsatz');
  ok(Math.abs(res.totalStunden - 8) < 0.01, 'Stunden: 5h (07:00–12:15 −15′) + 3h = 8.00 h (fremder Einsatz zählt nicht)');
  ok(Math.abs(res.totalMaterial - 210) < 0.01 && res.totalRapporte === 1, 'Material CHF 210 aus dem verknüpften Regierapport');
  const html = await p2.evaluate(() => document.getElementById('viewWrap').innerHTML);
  ok(html.indexOf('8 h') >= 0 && html.indexOf('210.00') >= 0, 'KPIs zeigen Stunden + Material');
  ok(html.indexOf('CSV exportieren') >= 0, 'CSV-Export-Button vorhanden');
  ok(await p2.evaluate(() => document.getElementById('periodLbl').textContent === 'Garantiearbeiten 2026'), 'Perioden-Label zeigt das Jahr');
}
// Jahres-Navigation: ‹ wechselt das Jahr, Vorjahr ist leer
await p2.evaluate(() => epNav(-1));
ok(await p2.evaluate(() => document.getElementById('periodLbl').textContent === 'Garantiearbeiten 2025' && _epGarantieDaten().anzahl === 0), '‹ navigiert aufs Vorjahr (leer)');
await p2.evaluate(() => epNav(1));

// Monteur sieht den Garantie-Tab nicht
console.log('■ Rechte: Monteur ohne Garantie-Tab');
const s3 = seed(['role_monteur']);
s3.gema_orgs_v1[0].settings = orgSettings;
const { ctx: c3, page: p3 } = await newPage(browser, s3);
await p3.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
await p3.waitForFunction(() => typeof epRender === 'function', null, { timeout: 12000 });
await p3.waitForTimeout(400);
ok(await p3.evaluate(() => document.getElementById('vtabs').textContent.indexOf('Garantie') < 0), 'Monteur: kein 🛡-Tab (Auswertung enthält Beträge)');
await c3.close();

// Einsatzplan-Einstellungen: Bereiche editierbar + andere Settings bleiben
console.log('■ Einsatzplan-Einstellungen teilen dieselbe Bereichsliste');
await p2.evaluate(() => epOpenSettings());
ok(await p2.evaluate(() => document.querySelectorAll('#ep_abRows .ab-row').length === 2), 'Einsatzplan-⚙️ zeigt die im ERP definierten Bereiche');
await p2.evaluate(() => {
  abRowAdd('ep_abRows');
  const rows = document.querySelectorAll('#ep_abRows .ab-row');
  rows[rows.length - 1].querySelector('.ab-name').value = 'Heizung';
  epSetSave();
});
await p2.waitForTimeout(300);
{
  const st = await p2.evaluate(() => GemaAuth.getOrgs()[0].settings);
  ok(st.arbeitsbereiche.length === 3 && st.arbeitsbereiche[2].name === 'Heizung', 'Neuer Bereich aus dem Einsatzplan gespeichert');
  ok(st.erp && st.erp.mwstPct != null, 'ERP-Einstellungen bleiben unangetastet');
}
ok(errors2.length === 0, 'Einsatzplan ohne JS-Fehler' + (errors2.length ? ' — ' + errors2[0] : ''));

await c2.close();
await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
