// Playwright-Smoke: Stundenerfassung — Feedback 17.07.2026 (27 Checks)
//   - Znüni-Pause bezahlt/unbezahlt (Toggle, Auto-Abzug, Badge, Hint, Roundtrip)
//   - Brückentage/Betriebsferien als Datums-Zeilen mit Bezeichnung (Alt-String-Migration,
//     von>bis-Tausch, Leerzeilen verworfen, Badge mit Name)
//   - Einheits-Boxen (.inpu) hinter den Zahlenfeldern, Eigene-Absenzen-Karten mit
//     beschrifteten Optionen, Wizard-Bar einzeilig + 720px-Modal
//   - Mitarbeiter-Stammdaten: «Std»-Haken → ohneErfassung (Kader ohne Stundenerfassung)
// Ausführen: CHROME=<chromium> node scripts/stunden_feedback_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const MO = '2026-07-13';

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

console.log('■ Boot mit Altdaten (Brückentage als Strings, Betriebsferien-Objekte, Kader-User)');
const s1 = seed(['role_planer']);
s1.gema_users_v1.push({ id: 'u_kader', username: 'k@test.ch', name: 'Kader Chef', roleIds: ['role_planer'], orgId: 'org_test', active: true, profile: { email: 'k@test.ch' } });
s1.gema_orgs_v1[0].settings = { stunden: {
  brueckentage: ['2026-05-15'],                                   // Altdaten: nackter String
  betriebsferien: [{ von: '2026-12-24', bis: '2027-01-02', label: 'Weihnachten' }],
  eigeneAbsenzen: [{ id: 'ea_arzt', name: 'Arzttermin', ic: '🩺', fuelltAuf: true, keineVorholzeit: true, beantragbar: true, nurUserIds: null }]
} };
const { page: p1 } = await newPage(browser, s1);
const errors = [];
p1.on('pageerror', e => errors.push(e.message));
await p1.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
await p1.waitForFunction(() => typeof stRender === 'function' && typeof stOpenSettings === 'function', null, { timeout: 12000 });
await p1.waitForTimeout(700);

console.log('■ ⚙️ Settings: Datums-Zeilen + Znüni-Checkbox vorbelegt');
await p1.evaluate(() => stOpenSettings());
ok(await p1.evaluate(() => document.getElementById('s_pauseBezahlt').checked === true), 'Znüni-Checkbox default AN (bezahlt)');
ok(await p1.evaluate(() => {
  const r = document.querySelectorAll('#s_brueckRows .s-dat-row');
  return r.length === 1 && r[0].querySelector('.s-bk-datum').value === '2026-05-15' && r[0].querySelector('.s-bk-datum').type === 'date';
}), 'Alt-Brückentag (String) als echtes Datumsfeld vorbelegt');
ok(await p1.evaluate(() => {
  const r = document.querySelectorAll('#s_bfRows .s-dat-row');
  return r.length === 1 && r[0].querySelector('.s-bf-von').value === '2026-12-24'
    && r[0].querySelector('.s-bf-bis').value === '2027-01-02'
    && r[0].querySelector('.s-bf-name').value === 'Weihnachten';
}), 'Betriebsferien-Zeile: Von/Bis-Datumsfelder + Bezeichnungs-Textfeld vorbelegt');
ok(await p1.evaluate(() => !document.getElementById('s_brueckentage') && !document.getElementById('s_betriebsferien')), 'Alte Freitext-Textareas sind weg');

console.log('■ Eigene-Absenzen-Karte: beschriftete Optionen');
{
  const t = await p1.evaluate(() => document.querySelector('#s_eigeneRows .s-ea-row .s-ea-opts').textContent);
  ok(/füllt bis Tagessoll/.test(t) && /keine Vorholzeit/.test(t) && /beantragbar/.test(t), 'Checkbox-Beschriftungen sichtbar (nicht nur Tooltips)');
  ok(/Tage\/Jahr/.test(t), 'Limit-Feld mit Einheit «Tage/Jahr»');
  ok(await p1.evaluate(() => document.querySelector('#s_eigeneRows .s-ea-row[data-id=ea_arzt] .s-ea-fuellt').checked), 'Kriterien-Checkbox vorbelegt (fuelltAuf)');
}

console.log('■ Einheiten-Boxen (.inpu) an den Zahlenfeldern');
ok(await p1.evaluate(() => {
  const u = id => { const el = document.getElementById(id); const b = el && el.closest('.inpu'); return b ? b.querySelector('.u').textContent.trim() : ''; };
  return u('s_wochenSoll') === 'h/Woche' && u('s_pause') === 'Min.' && u('s_mittag') === 'CHF/Tag' && u('s_topfGrenze') === 'h/Woche' && u('s_indMaxPct') === '% vom Soll';
}), 'Einheits-Boxen hinter Wochensoll/Znüni/Mittag/Topf/Indikator');

console.log('■ Wizard-Bar einzeilig + grösseres Fenster');
await p1.evaluate(() => stSetMode(true, 6));
{
  const bar = await p1.evaluate(() => {
    const b = document.getElementById('setWizBar');
    const wt = b.querySelector('.wt'), ws = b.querySelector('.ws');
    return { h: b.offsetHeight, txt: ws ? ws.textContent : '', wtStyle: getComputedStyle(wt).whiteSpace, maxW: getComputedStyle(document.querySelector('#setModal .modal')).maxWidth };
  });
  ok(/Schritt 7 \/ 10/.test(bar.txt), 'Schritt-Zähler «Schritt 7 / 10» vorhanden');
  ok(bar.h < 60, 'Schritt-Leiste einzeilig (Höhe ' + bar.h + 'px < 60)');
  ok(bar.wtStyle === 'nowrap', 'Titel bricht nicht um (ellipsis)');
  ok(bar.maxW === '720px', 'Settings-Modal 720px breit');
}
await p1.evaluate(() => stSetMode(true, 9));
{
  const t = await p1.evaluate(() => document.getElementById('s_zusammenfassung').textContent);
  ok(/bezahlt/.test(t), 'Zusammenfassung nennt Znüni bezahlt/unbezahlt');
  ok(/1 Brückentag/.test(t) && /1 Betriebsferien/.test(t), 'Zusammenfassung zählt Brückentage + Betriebsferien');
}
await p1.evaluate(() => stSetMode(false));

console.log('■ Editieren + Roundtrip: Brückentag-Bezeichnung, neue Betriebsferien (von>bis getauscht), Znüni unbezahlt, Kader ohne Erfassung');
await p1.evaluate(() => {
  document.querySelector('#s_brueckRows .s-bk-name').value = 'Tag nach Auffahrt';
  stBrueckAdd();
  const rows = document.querySelectorAll('#s_brueckRows .s-dat-row');
  rows[1].querySelector('.s-bk-datum').value = '2026-12-28';
  rows[1].querySelector('.s-bk-name').value = 'Zwischentag';
  stBfAdd();
  const bf = document.querySelectorAll('#s_bfRows .s-dat-row');
  bf[1].querySelector('.s-bf-von').value = '2026-08-10';   // absichtlich von>bis
  bf[1].querySelector('.s-bf-bis').value = '2026-08-03';
  bf[1].querySelector('.s-bf-name').value = 'Sommerpause';
  stBfAdd();                                                 // leer → wird verworfen
  document.getElementById('s_pauseBezahlt').checked = false;
  const kader = document.querySelector('#s_mitarbeiter .s-mit-row[data-uid=u_kader] .s-mit-erf');
  kader.checked = false; kader.dispatchEvent(new Event('change'));
  stSetSave();
});
await p1.waitForTimeout(300);
{
  const st = await p1.evaluate(() => GemaAuth.getOrgs()[0].settings.stunden);
  ok(st.pauseBezahlt === false, 'pauseBezahlt:false gespeichert');
  ok(st.brueckentage.length === 2 && st.brueckentage[0].datum === '2026-05-15' && st.brueckentage[0].name === 'Tag nach Auffahrt'
    && st.brueckentage[1].datum === '2026-12-28' && st.brueckentage[1].name === 'Zwischentag', 'Brückentage als {datum,name} gespeichert (Alt-String migriert)');
  ok(st.betriebsferien.length === 2 && st.betriebsferien[1].von === '2026-08-03' && st.betriebsferien[1].bis === '2026-08-10'
    && st.betriebsferien[1].label === 'Sommerpause', 'Betriebsferien {von,bis,label} — von>bis automatisch getauscht, Leerzeile verworfen');
  ok(st.mitarbeiter && st.mitarbeiter.u_kader && st.mitarbeiter.u_kader.ohneErfassung === true, 'Kader: ohneErfassung:true gespeichert');
  ok(!st.mitarbeiter.u_test, 'u_test ohne Stammdaten bleibt ungespeichert (empty-check intakt)');
}

console.log('■ Re-Open: Kader gedimmt + ans Ende sortiert, Haken wieder setzbar');
await p1.evaluate(() => stOpenSettings());
{
  const r = await p1.evaluate(() => {
    const rows = [].slice.call(document.querySelectorAll('#s_mitarbeiter .s-mit-row'));
    const last = rows[rows.length - 1];
    return { lastUid: last.getAttribute('data-uid'), dim: last.style.opacity, chk: last.querySelector('.s-mit-erf').checked,
      pause: document.getElementById('s_pauseBezahlt').checked };
  });
  ok(r.lastUid === 'u_kader' && r.dim === '0.55' && r.chk === false, 'Kader-Zeile gedimmt am Listenende, Haken aus');
  ok(r.pause === false, 'Znüni-Checkbox spiegelt gespeicherten Zustand (aus)');
}
await p1.evaluate(() => stClose('setModal'));

console.log('■ Wirkung: unbezahlte Znüni wird vom Tag abgezogen (Badge + Σ)');
await p1.evaluate(mo => { _wkMode = 'woche'; _wkStart = mo; stRender(); }, MO);
await p1.evaluate(mo => {
  stEinNeu(mo);
  document.getElementById('ein_von').value = '07:00';
  document.getElementById('ein_bis').value = '12:00';
  document.getElementById('ein_pause').value = '0';
  stEinSave();
}, MO);
await p1.waitForTimeout(300);
{
  const h = await p1.evaluate(mo => stdTagStunden(stTagFor(mo, 'u_test'), stParams()), MO);
  ok(Math.abs(h - 4.75) < 0.01, '5 h erfasst − 15′ Znüni = 4.75 h angerechnet');
  const html = await p1.evaluate(() => document.getElementById('viewWrap').innerHTML);
  ok(html.includes('− 15′ Znüni'), 'Tages-Badge «− 15′ Znüni» sichtbar');
  ok(html.includes('4.75 h'), 'Tages-Σ zeigt 4.75 h');
  const hint = await p1.evaluate(mo => { stEinNeu(mo); return document.getElementById('ein_pauseHint').textContent; }, '2026-07-14');
  ok(/automatisch abgezogen/.test(hint), 'Eintrag-Hint erklärt den Auto-Abzug');
  await p1.evaluate(() => stClose('einModal'));
}

console.log('■ Brückentag-Badge mit Bezeichnung');
await p1.evaluate(() => { _wkStart = '2026-12-28'; stRender(); });
await p1.waitForTimeout(200);
{
  const html = await p1.evaluate(() => document.getElementById('viewWrap').innerHTML);
  ok(html.includes('🌉 Zwischentag'), 'Badge zeigt die Brückentag-Bezeichnung statt Generikum');
}

ok(errors.length === 0, 'Keine JS-Fehler in pm_stunden' + (errors.length ? ' — ' + errors[0] : ''));

await browser.close();
server.close();
console.log('\n' + (fail ? '✗ ' + fail + ' FEHLER, ' : '') + pass + '/' + (pass + fail) + ' Checks bestanden');
process.exit(fail ? 1 : 0);
