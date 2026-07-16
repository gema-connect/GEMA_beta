// Playwright-Smoke: Stundenerfassung — Regeln, Automatik & Indikatoren (07/2026)
// Deckt ab:
//   - km-Spesen ausblendbar (kmAktiv:false → kein km-Feld in der Tageserfassung,
//     keine km-Spalte in der Auswertung)
//   - Auto-Kompensation: früher Feierabend → Rest bis Tagessoll automatisch als
//     Kompensation (stunden-basiert, quelle:auto); Nachführen beim Bearbeiten;
//     manuelle Absenz (z.B. Ferien) übersteuert die Automatik dauerhaft
//   - Absenz-Regel «krank: füllt bis Tagessoll + keine Vorholzeit» → Kappung
//     («Über Tagessoll — nicht angerechnet») in Σ Woche + Freigabe
//   - Kontroll-Indikatoren: rot (über Grenze) in Σ Woche + Freigabe, amber
//     (unter Grenze) nur in der Freigabe
//   - Feiertags-Generator im ⚙️-Modal (Ostern-basiert, Dedup) + Settings-Roundtrip
//   - Ferien-/Absenz-Antrag mit Typ (Militär): Genehmigung trägt Absenzen +
//     Einsatzplan-Eintrag automatisch ein
//   - Absenz-Modal: Schule/ÜK-Typen mit Regel-Hinweis
// Ausführen: CHROME=<chromium> node scripts/stunden_regeln_smoke_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

// Fixe Werktage (Mo/Di), unabhängig vom Ausführungstag
const MO = '2026-07-13', DI = '2026-07-14';

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

console.log('■ Boot mit Regeln/Automatik/Indikatoren (Planer)');
const s1 = seed(['role_planer']);
s1.gema_users_v1.push({ id: 'u_other', username: 'o@test.ch', name: 'Other User', roleIds: ['role_monteur'], orgId: 'org_test', active: true, profile: { email: 'o@test.ch' } });
s1.gema_orgs_v1[0].settings = { stunden: {
  autoKompensation: true, kmAktiv: false,
  indikatoren: { maxH: 8, maxPct: 0, minH: 35, minPct: 0 },
  absenzRegeln: { krank: { fuelltAuf: true, keineVorholzeit: true } },
  eigeneAbsenzen: [
    { id: 'ea_arzt', name: 'Arzttermin', ic: '🩺', fuelltAuf: true, keineVorholzeit: true, beantragbar: true, nurUserIds: null },
    { id: 'ea_schulung', name: 'Interne Schulung', ic: '📚', fuelltAuf: false, keineVorholzeit: false, beantragbar: true, nurUserIds: ['u_other'] },
    { id: 'ea_pflege', name: 'Pflege Angehörige', ic: '❤️', fuelltAuf: false, keineVorholzeit: false, beantragbar: true, maxTageProJahr: 3, nurUserIds: null }
  ]
} };
const { page: p1 } = await newPage(browser, s1);
const errors = [];
p1.on('pageerror', e => errors.push(e.message));
await p1.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
await p1.waitForFunction(() => typeof stRender === 'function' && typeof stAutoKomp === 'function', null, { timeout: 12000 });
await p1.waitForTimeout(700);
await p1.evaluate(mo => { _wkMode = 'woche'; _wkStart = mo; stRender(); }, MO);

ok(await p1.evaluate(() => stParams().autoKompensation === true && stParams().kmAktiv === false), 'Org-Einstellungen geladen (autoKompensation an, kmAktiv aus)');
ok(await p1.evaluate(() => document.querySelectorAll('.spesen-row input[inputmode=decimal]').length) === 0, 'km-Feld ausgeblendet (kmAktiv aus)');
ok(await p1.evaluate(() => document.querySelectorAll('.spesen-row input[type=checkbox]').length) > 0, 'Mittag-Spesen bleiben erfassbar');

console.log('■ Auto-Kompensation (früher Feierabend → Rest bis Tagessoll)');
await p1.evaluate(mo => {
  stEinNeu(mo);
  document.getElementById('ein_von').value = '07:00';
  document.getElementById('ein_bis').value = '12:00';
  document.getElementById('ein_pause').value = '0';
  stEinSave();
}, MO);
await p1.waitForTimeout(300);
{
  const t = await p1.evaluate(mo => stTagFor(mo, 'u_test'), MO);
  ok(!!t.absenz && t.absenz.typ === 'kompensation' && t.absenz.quelle === 'auto', 'Auto-Absenz «Kompensation» ergänzt');
  ok(Math.abs((t.absenz.stunden || 0) - 3) < 0.01, '5 h gearbeitet → 3 h Kompensation (Tagessoll 8 h)');
  const karte = await p1.evaluate(() => document.getElementById('viewWrap').innerHTML);
  ok(karte.includes('3.00 h auto'), 'Badge zeigt den Auto-Stundenwert');
}
// Eintrag auf volle 8 h verlängern → Auto-Absenz verschwindet
await p1.evaluate(mo => {
  const t = stTagFor(mo, 'u_test');
  stEinEdit(mo, t.eintraege[0].id);
  document.getElementById('ein_bis').value = '15:00';
  stEinSave();
}, MO);
await p1.waitForTimeout(200);
ok(await p1.evaluate(mo => !stTagFor(mo, 'u_test').absenz, MO), 'Volle 8 h → Auto-Kompensation wieder entfernt');
// Wieder verkürzen, dann manuell auf Ferien umstellen — Automatik übersteuert nie
await p1.evaluate(mo => {
  const t = stTagFor(mo, 'u_test');
  stEinEdit(mo, t.eintraege[0].id);
  document.getElementById('ein_bis').value = '12:00';
  stEinSave();
}, MO);
await p1.waitForTimeout(200);
{
  const lbl = await p1.evaluate(mo => { stAbsOpen(mo); return document.getElementById('abs_datumLbl').textContent; }, MO);
  ok(/automatisch als Kompensation/.test(lbl), 'Absenz-Modal weist auf die Automatik hin');
  await p1.evaluate(() => {
    document.getElementById('abs_typ').value = 'ferien';
    document.getElementById('abs_anteil').value = '0.5';
    stAbsSave();
  });
  await p1.waitForTimeout(200);
  const t = await p1.evaluate(mo => stTagFor(mo, 'u_test'), MO);
  ok(t.absenz.typ === 'ferien' && !t.absenz.quelle && !t.absenz.stunden, 'Manuell auf Ferien geändert (Automatik übersteuert)');
  await p1.evaluate(mo => {
    const t2 = stTagFor(mo, 'u_test');
    stEinEdit(mo, t2.eintraege[0].id);
    stEinSave();
  }, MO);
  await p1.waitForTimeout(200);
  ok(await p1.evaluate(mo => stTagFor(mo, 'u_test').absenz.typ === 'ferien', MO), 'Erneutes Speichern tastet die manuelle Ferien-Absenz nicht an');
}

console.log('■ Krank-Regel: füllt bis Tagessoll + keine Vorholzeit (Kappung)');
await p1.evaluate(di => {
  stEinNeu(di);
  document.getElementById('ein_von').value = '07:00';
  document.getElementById('ein_bis').value = '16:00';
  document.getElementById('ein_pause').value = '0';
  stEinSave();
  stAbsOpen(di);
  document.getElementById('abs_typ').value = 'krank';
  document.getElementById('abs_anteil').value = '0.5';
  stAbsSave();
}, DI);
await p1.waitForTimeout(300);
{
  const html = await p1.evaluate(() => document.getElementById('viewWrap').innerHTML);
  ok(html.includes('Über Tagessoll — nicht angerechnet'), 'Σ Woche weist die Kappung aus (9 h trotz ½ krank)');
  ok(html.includes('⚠'), 'Roter Indikator in Σ Woche (Woche über 8-h-Grenze)');
  ok(!html.includes('▼'), 'Amber-Indikator (zu wenig) erscheint NICHT beim Mitarbeiter');
}

console.log('■ Freigabe: Indikatoren + Kappung + Absenz-Suffix');
await p1.evaluate(() => {
  meineTage().forEach(t => { if (stTagHatDaten(t)) { t.status = 'eingereicht'; poolSave(t); } });
  _view = 'freigabe'; stRender();
});
await p1.waitForTimeout(200);
{
  const html = await p1.evaluate(() => document.getElementById('viewWrap').innerHTML);
  ok(html.includes('⚠') && html.includes('▼'), 'Freigabe zeigt roten UND amber Indikator');
  ok(html.includes('Über Tagessoll — nicht angerechnet'), 'Freigabe weist die Kappung aus');
  ok(html.includes('(½)'), 'Absenz-Suffix ½ in der Tages-Zeile');
}

console.log('■ ⚙️ Feiertags-Generator + Settings-Roundtrip');
await p1.evaluate(() => stOpenSettings());
{
  ok(await p1.evaluate(() => document.querySelectorAll('#s_ftDefs .s-ft-def').length >= 12), 'Feiertags-Definitionen als Checkboxen');
  ok(await p1.evaluate(() => document.getElementById('s_kmAktiv').checked === false), 'km-Checkbox spiegelt Einstellung (aus)');
  ok(await p1.evaluate(() => document.getElementById('s_autoKomp').checked === true), 'Auto-Kompensation-Checkbox an');
  ok(await p1.evaluate(() => document.querySelector('#s_absenzRegeln .s-regel-row[data-typ=krank] .s-regel-fuellt').checked), 'Krank-Regel «füllt bis Tagessoll» vorbelegt');
  ok(await p1.evaluate(() => document.querySelector('#s_absenzRegeln .s-regel-row[data-typ=schule] .s-regel-kv').checked), 'Schule-Regel «keine Vorholzeit» (Default) vorbelegt');
  await p1.evaluate(() => {
    document.getElementById('s_ftJahr').value = '2026';
    stFeiertageEinfuegen();
  });
  const liste = await p1.evaluate(() => document.getElementById('s_feiertage').value);
  ok(liste.includes('2026-04-03') && liste.includes('2026-05-14') && liste.includes('2026-08-01'), 'Karfreitag/Auffahrt/1. August 2026 eingefügt (Ostern-Berechnung)');
  await p1.evaluate(() => stFeiertageEinfuegen());
  const liste2 = await p1.evaluate(() => document.getElementById('s_feiertage').value);
  ok(liste2 === liste, 'Zweites Einfügen dedupliziert (keine Duplikate)');
  await p1.evaluate(() => stSetSave());
  await p1.waitForTimeout(300);
  const st = await p1.evaluate(() => GemaAuth.getOrgs()[0].settings.stunden);
  ok(st.kmAktiv === false && st.autoKompensation === true && st.maxTagessoll === false, 'Roundtrip: kmAktiv/autoKompensation/maxTagessoll gespeichert');
  ok(st.feiertage.indexOf('2026-04-03') >= 0, 'Generierte Feiertage gespeichert');
  ok(st.absenzRegeln.krank.fuelltAuf === true && st.absenzRegeln.krank.keineVorholzeit === true, 'Absenz-Regeln gespeichert');
  ok(st.indikatoren.maxH === 8 && st.indikatoren.minH === 35, 'Indikator-Grenzen gespeichert');
  ok(Array.isArray(st.feiertagAutoSel) && st.feiertagAutoSel.indexOf('auffahrt') >= 0, 'Feiertags-Auswahl gespeichert');
}

console.log('■ Absenz-Antrag mit Typ (Militär) → Genehmigung trägt alles ein');
await p1.evaluate(() => { _view = 'woche'; stRender(); stFerienOpen(); });
{
  const typen = await p1.evaluate(() => [].map.call(document.querySelectorAll('#fa_typ option'), o => o.value));
  ok(typen.includes('militaer') && typen.includes('schule') && typen.includes('uek'), 'Antrags-Typen: Militär/Schule/ÜK verfügbar');
  await p1.evaluate(() => {
    document.getElementById('fa_typ').value = 'militaer';
    document.getElementById('fa_von').value = '2026-07-20';
    document.getElementById('fa_bis').value = '2026-07-21';
    stFerienCalc();
    stFerienSubmit();
  });
  await p1.waitForTimeout(200);
  const antrag = await p1.evaluate(() => poolRead().find(x => x.typ === 'ferienantrag'));
  ok(antrag && antrag.absenzTyp === 'militaer' && antrag.tage === 2, 'Antrag mit absenzTyp militaer (2 Werktage)');
  await p1.evaluate(id => stFerienEntscheid(id, true), antrag.id);
  await p1.waitForTimeout(300);
  const tage = await p1.evaluate(() => [stTagFor('2026-07-20', 'u_test'), stTagFor('2026-07-21', 'u_test')]);
  ok(tage.every(t => t && t.absenz && t.absenz.typ === 'militaer' && t.absenz.quelle === 'antrag'), 'Militär-Absenzen automatisch im Kalender (quelle antrag)');
  const ev = await p1.evaluate(() => (GemaSync.getCached('gema_einsatz_pool_v1') || []).find(e => e.ferienAntragId));
  ok(ev && ev.titel === '🎖 Militär' && ev.datum === '2026-07-20' && ev.dauerTage === 2, 'Einsatzplan-Eintrag «🎖 Militär» angelegt');
}

console.log('■ Absenz-Modal: Schule/ÜK mit Regel-Hinweis');
await p1.evaluate(() => {
  stAbsOpen('2026-07-15');
  document.getElementById('abs_typ').value = 'schule';
  stAbsHint();
});
ok(await p1.evaluate(() => /keine Vorholzeit/.test(document.getElementById('abs_hint').textContent)), 'Schule-Hint nennt die aktive Regel «keine Vorholzeit»');
await p1.evaluate(() => stClose('absModal'));

console.log('■ km-Spalte in der Auswertung ausgeblendet');
await p1.evaluate(() => { _view = 'auswertung'; _monat = '2026-07'; stRender(); });
await p1.waitForTimeout(200);
{
  const heads = await p1.evaluate(() => [].map.call(document.querySelectorAll('.t thead th'), x => x.textContent.trim()));
  ok(heads.length > 0 && heads.indexOf('km') < 0, 'Auswertungs-Tabelle ohne km-Spalte (kmAktiv aus, keine Altwerte)');
}

console.log('■ Eigene Absenz-Typen (Sichtbarkeit + Erfassung + Antrag)');
{
  const ea = await p1.evaluate(() => GemaAuth.getOrgs()[0].settings.stunden.eigeneAbsenzen);
  ok(ea.length === 3 && ea[0].id === 'ea_arzt' && (ea[1].nurUserIds || []).join() === 'u_other' && ea[2].maxTageProJahr === 3, 'Geseedete Typen überleben den Settings-Roundtrip (IDs, Sichtbarkeit + Limit stabil)');
  await p1.evaluate(() => { _view = 'woche'; stRender(); stAbsOpen('2026-07-16'); });
  const absOpts = await p1.evaluate(() => [].map.call(document.querySelectorAll('#abs_typ option'), o => o.value));
  ok(absOpts.includes('ea_arzt'), 'Eigener Typ «Arzttermin» im Absenz-Modal wählbar');
  ok(!absOpts.includes('ea_schulung'), 'Auf u_other eingeschränkter Typ für u_test NICHT sichtbar');
  await p1.evaluate(() => { document.getElementById('abs_typ').value = 'ea_arzt'; stAbsHint(); });
  ok(await p1.evaluate(() => /Arzttermin/.test(document.getElementById('abs_hint').textContent) && /keine Vorholzeit/.test(document.getElementById('abs_hint').textContent)), 'Hint nennt eigenen Typ + aktive Kriterien');
  await p1.evaluate(() => { document.getElementById('abs_anteil').value = '1'; stAbsSave(); });
  await p1.waitForTimeout(200);
  ok(await p1.evaluate(() => stTagFor('2026-07-16', 'u_test').absenz.typ === 'ea_arzt'), 'Absenz mit eigenem Typ gespeichert');
  ok(await p1.evaluate(() => document.getElementById('viewWrap').innerHTML.includes('Arzttermin')), 'Wochen-Badge zeigt den eigenen Typ');
  await p1.evaluate(() => stFerienOpen());
  const faOpts = await p1.evaluate(() => [].map.call(document.querySelectorAll('#fa_typ option'), o => o.value));
  ok(faOpts.includes('ea_arzt') && !faOpts.includes('ea_schulung'), 'Antrag: beantragbarer eigener Typ dabei, eingeschränkter nicht');
  await p1.evaluate(() => stClose('ferienModal'));
}

console.log('■ ⚙️ Editor für eigene Typen + Einrichtungs-Assistent');
await p1.evaluate(() => stOpenSettings());
{
  ok(await p1.evaluate(() => document.getElementById('setWizBar').style.display === 'none'), 'Bestehende Einstellungen → Listen-Modus (kein Auto-Wizard)');
  ok(await p1.evaluate(() => document.querySelectorAll('#s_eigeneRows .s-ea-row').length === 3), 'Editor zeigt alle drei eigenen Typen');
  ok(await p1.evaluate(() => document.querySelector('#s_eigeneRows .s-ea-row[data-id=ea_pflege] .s-ea-limit').value === '3'), 'Limit-Feld (3 T/J) beim eigenen Typ vorbelegt');
  ok(await p1.evaluate(() => !document.querySelector('#s_absenzRegeln .s-regel-row[data-typ=ferien] .s-regel-limit')), 'Ferien ohne Limit-Feld (eigenes Konto — «—»)');
  await p1.evaluate(() => { document.querySelector('#s_absenzRegeln .s-regel-row[data-typ=militaer] .s-regel-limit').value = '10'; });
  ok(await p1.evaluate(() => document.querySelector('#s_eigeneRows .s-ea-row[data-id=ea_schulung] .s-ea-userbtn').textContent.trim() === '👥 1'), 'Sichtbarkeits-Knopf zeigt «👥 1» beim eingeschränkten Typ');
  await p1.evaluate(() => {
    stEaAdd();
    const rows = document.querySelectorAll('#s_eigeneRows .s-ea-row');
    const r = rows[rows.length - 1];
    r.querySelector('.s-ea-name').value = 'Zügeltag';
    r.querySelector('.s-ea-ic').value = '📦';
  });
  await p1.evaluate(() => stSetMode(true, 0));
  ok(await p1.evaluate(() => document.querySelectorAll('#setModal .set-sec.cur').length === 1 && document.getElementById('setWizBar').style.display !== 'none'), 'Assistent: genau eine Sektion sichtbar + Schritt-Leiste');
  ok(await p1.evaluate(() => document.getElementById('setWizBar').textContent.includes('Schritt 1 / 10')), 'Schritt-Zähler 1/10');
  await p1.evaluate(() => { stSetWizGo(1); stSetWizGo(1); });
  ok(await p1.evaluate(() => document.querySelector('#setModal .set-sec.cur').getAttribute('data-sec') === 'spesen'), 'Weiter ×2 → Schritt «Spesen»');
  await p1.evaluate(() => stSetMode(false));
  ok(await p1.evaluate(() => document.getElementById('setWizBar').style.display === 'none' && document.querySelectorAll('#setModal .set-sec.cur').length === 0), '«≡ Liste» beendet den Assistenten (alle Sektionen sichtbar)');
  await p1.evaluate(() => stSetMode(true, 9));
  ok(await p1.evaluate(() => {
    const t = document.getElementById('s_zusammenfassung').textContent;
    return t.includes('Arzttermin') && t.includes('Zügeltag') && t.includes('Auto-Kompensation');
  }), 'Zusammenfassung listet eigene Typen + Automatik');
  ok(await p1.evaluate(() => document.getElementById('setFt').textContent.includes('Speichern')), 'Letzter Schritt bietet «💾 Speichern»');
  await p1.evaluate(() => stSetSave());
  await p1.waitForTimeout(300);
  const ea2 = await p1.evaluate(() => GemaAuth.getOrgs()[0].settings.stunden.eigeneAbsenzen);
  ok(ea2.length === 4 && ea2[3].id === 'ea_zuegeltag' && ea2[3].name === 'Zügeltag', 'Neuer Typ mit Slug-ID ea_zuegeltag gespeichert (Umlaut → ue)');
  ok(ea2[0].id === 'ea_arzt' && ea2[1].id === 'ea_schulung' && (ea2[1].nurUserIds || []).join() === 'u_other', 'Bestehende IDs + Sichtbarkeit unverändert (Altdaten bleiben verknüpft)');
  ok(ea2[2].maxTageProJahr === 3, 'Limit des eigenen Typs überlebt den Roundtrip');
  ok(await p1.evaluate(() => GemaAuth.getOrgs()[0].settings.stunden.absenzRegeln.militaer.maxTageProJahr === 10), 'Built-in-Limit (Militär 10 T/J) gespeichert');
}

console.log('■ Jahres-Limit (Pflege Angehörige → 3 Tage/Jahr)');
{
  await p1.evaluate(() => { _view = 'woche'; stRender(); stAbsOpen('2026-08-03'); document.getElementById('abs_typ').value = 'ea_pflege'; stAbsHint(); });
  ok(await p1.evaluate(() => /max\. 3\.0 Tage\/Jahr/.test(document.getElementById('abs_hint').textContent)), 'Hint nennt das Limit (max. 3.0 Tage/Jahr)');
  await p1.evaluate(() => { document.getElementById('abs_anteil').value = '1'; stAbsSave(); });
  await p1.evaluate(() => { stAbsOpen('2026-08-04'); document.getElementById('abs_typ').value = 'ea_pflege'; document.getElementById('abs_anteil').value = '1'; stAbsSave(); });
  await p1.evaluate(() => { stAbsOpen('2026-08-05'); document.getElementById('abs_typ').value = 'ea_pflege'; document.getElementById('abs_anteil').value = '0.5'; stAbsSave(); });
  await p1.waitForTimeout(200);
  ok(await p1.evaluate(() => ['2026-08-03', '2026-08-04', '2026-08-05'].every(d => ((stTagFor(d, 'u_test') || {}).absenz || {}).typ === 'ea_pflege')), '2.5 Tage «Pflege Angehörige» erfasst');
  await p1.evaluate(() => { stAbsOpen('2026-08-06'); document.getElementById('abs_typ').value = 'ea_pflege'; document.getElementById('abs_anteil').value = '1'; stAbsSave(); });
  await p1.waitForTimeout(200);
  ok(await p1.evaluate(() => !(stTagFor('2026-08-06', 'u_test') || {}).absenz), 'Ganzer Tag über dem Limit wird gestoppt (2.5 + 1 > 3)');
  ok(await p1.evaluate(() => document.getElementById('absModal').classList.contains('open')), 'Modal bleibt offen (Korrektur möglich)');
  await p1.evaluate(() => { document.getElementById('abs_anteil').value = '0.5'; stAbsSave(); });
  await p1.waitForTimeout(200);
  ok(await p1.evaluate(() => ((stTagFor('2026-08-06', 'u_test') || {}).absenz || {}).anteil === 0.5), '½ Tag bis exakt ans Limit erlaubt (3.0 / 3)');
  await p1.evaluate(() => { stAbsOpen('2026-08-07'); document.getElementById('abs_typ').value = 'ea_pflege'; document.getElementById('abs_anteil').value = '0.5'; stAbsSave(); });
  await p1.waitForTimeout(200);
  ok(await p1.evaluate(() => !(stTagFor('2026-08-07', 'u_test') || {}).absenz), 'Limit voll → weitere Selbst-Erfassung blockiert');
  await p1.evaluate(() => stClose('absModal'));
  await p1.evaluate(() => { stFerienOpen(); document.getElementById('fa_typ').value = 'ea_pflege'; document.getElementById('fa_von').value = '2026-08-10'; document.getElementById('fa_bis').value = '2026-08-11'; stFerienCalc(); });
  ok(await p1.evaluate(() => /Jahres-Limit/.test(document.getElementById('fa_calc').textContent) && /übersteigt das Jahres-Limit/.test(document.getElementById('fa_calc').textContent)), 'Antrags-Vorschau zeigt Limit-Stand + Warnung');
  await p1.evaluate(() => stFerienSubmit());
  await p1.waitForTimeout(200);
  await p1.evaluate(() => { _view = 'freigabe'; stRender(); });
  ok(await p1.evaluate(() => /Jahres-Limit «Pflege Angehörige»/.test(document.getElementById('viewWrap').textContent)), 'Freigabe-Karte zeigt den Limit-Stand des Mitarbeiters');
}

console.log('■ Erst-Einrichtung startet automatisch als Assistent');
{
  const s2 = seed(['role_planer']);
  const { page: p2 } = await newPage(browser, s2);
  await p2.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => typeof stOpenSettings === 'function', null, { timeout: 12000 });
  await p2.waitForTimeout(500);
  await p2.evaluate(() => stOpenSettings());
  ok(await p2.evaluate(() => document.querySelector('#setModal .modal').classList.contains('wiz')), 'Ohne gespeicherte Einstellungen öffnet der Assistent automatisch');
  ok(await p2.evaluate(() => document.getElementById('setWizBar').textContent.includes('Arbeitszeit')), 'Erster Schritt: Arbeitszeit & Ferien');
}

ok(errors.length === 0, 'Keine JS-Fehler in pm_stunden' + (errors.length ? ' — ' + errors[0] : ''));

await browser.close();
server.close();
console.log('\n' + (fail ? '✗ ' + fail + ' von ' + (pass + fail) + ' Checks fehlgeschlagen' : pass + '/' + (pass + fail) + ' Checks bestanden'));
process.exit(fail ? 1 : 0);
