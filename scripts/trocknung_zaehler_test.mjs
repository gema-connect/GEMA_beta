// Playwright-Test: Trocknungsgeräte — Zähler-Typ konsequent + Typ-Prefill + Duplizieren
// Deckt ab (Feedback 07/2026):
//   - Eingabemaske: 'kein' → kein Zählerstand-Feld; 'kwh' → kWh-Label
//   - Typ-Auswahl übernimmt Werte (inkl. Zähler-Typ/Service) vom zuletzt
//     erfassten Gerät desselben Typs (nur Neuerfassung, leere Felder)
//   - Duplizieren: Kopie mit leerer Kennung/Serien-Nr./Zählerstand
//   - Einsetzen/Zurücknehmen: Feld + Einheit folgen dem Zähler-Typ des
//     Geräts; kWh-Zähler = direkte Differenz (KEINE kW-Multiplikation)
//   - Schadensbericht: Gerät ohne Zähler (mit kW) → automatisch
//     Laufzeit-Erfassung; kwh direkt; Release schreibt Laufzeit-Historie
// Ausführen: CHROME=<chromium> node scripts/trocknung_zaehler_test.mjs (aus scripts/)
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

// ── Kontext 1: Geräteverwaltung (Magaziner) ─────────────────────────
console.log('■ if_trocknung: Eingabemaske folgt dem Zähler-Typ');
const s1 = seed(['role_magaziner']);
s1['gema_schadensbericht_v1'] = [{ id: 'sch_1', titel: 'Wasserschaden Muster', objektId: 'obj_1', objektName: 'MFH Muster', phase: 'trocknung', orgId: 'org_test' }];
const { ctx: ctx1, page: p1 } = await newPage(browser, s1);
const errors = [];
p1.on('pageerror', e => errors.push(e.message));
await p1.goto(BASE + '/if_trocknung.html', { waitUntil: 'domcontentloaded' });
await p1.waitForFunction(() => typeof window.openAdd === 'function' && typeof window.openDuplicate === 'function', null, { timeout: 12000 });
await p1.waitForTimeout(400);
// Der Boot-Bind überschreibt den Schaden-Cache mit dem Mock ([]) —
// nach dem Boot erneut seeden, damit das Einsatz-Dropdown Projekte hat.
await p1.evaluate(() => localStorage.setItem('gema_schadensbericht_v1', JSON.stringify([{ id: 'sch_1', titel: 'Wasserschaden Muster', objektId: 'obj_1', objektName: 'MFH Muster', phase: 'trocknung', orgId: 'org_test' }])));

// Gerät A: Bautrockner mit kWh-Zähler
await p1.evaluate(() => window.openAdd());
await p1.evaluate(() => { const t = document.getElementById('f_typ'); t.value = 'bautrockner'; t.dispatchEvent(new Event('change')); });
ok(await p1.evaluate(() => document.getElementById('f_typ_prefill_hint').style.display) === 'none', 'kein Prefill-Hint ohne bestehende Geräte des Typs');
await p1.fill('#f_name', 'Bautrockner TTK 175');
await p1.fill('#f_marke', 'Trotec');
await p1.fill('#f_modell', 'TTK 175 S');
await p1.fill('#f_kw', '1.2');
await p1.evaluate(() => { const z = document.getElementById('f_zaehlerTyp'); z.value = 'kwh'; z.dispatchEvent(new Event('change')); });
ok(await p1.evaluate(() => document.getElementById('f_aktuellerStand_label').textContent) === 'Aktueller Zählerstand (kWh)', 'kwh gewählt → Formular-Label «Aktueller Zählerstand (kWh)»');
// Zwischentest: 'kein' blendet das Zählerstand-Feld komplett aus
await p1.evaluate(() => { const z = document.getElementById('f_zaehlerTyp'); z.value = 'kein'; z.dispatchEvent(new Event('change')); });
ok(await p1.evaluate(() => document.getElementById('f_aktuellerStand_wrap').style.display) === 'none', '«Kein Zähler» → Zählerstand-Feld ausgeblendet');
await p1.evaluate(() => { const z = document.getElementById('f_zaehlerTyp'); z.value = 'kwh'; z.dispatchEvent(new Event('change')); });
await p1.fill('#f_aktuellerStand', '500');
await p1.evaluate(() => { const s = document.getElementById('f_hasService'); s.checked = true; window.toggleService(); });
await p1.fill('#f_serviceInterval', '12');
await p1.evaluate(() => window.saveDevice());
await p1.waitForTimeout(200);
const devA = await p1.evaluate(() => window._tgHooksDevices ? null : (function(){ const d = JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]'); return d.find(x => x.name === 'Bautrockner TTK 175'); })());
ok(devA && devA.zaehlerTyp === 'kwh' && devA.aktuellerZaehlerstand === 500, 'Gerät A gespeichert (kwh-Zähler, Stand 500)');

console.log('■ Typ-Auswahl übernimmt Werte vom bestehenden Gerät');
await p1.evaluate(() => window.openAdd());
await p1.evaluate(() => { const t = document.getElementById('f_typ'); t.value = 'bautrockner'; t.dispatchEvent(new Event('change')); });
{
  const f = await p1.evaluate(() => ({
    marke: document.getElementById('f_marke').value,
    modell: document.getElementById('f_modell').value,
    kw: document.getElementById('f_kw').value,
    zTyp: document.getElementById('f_zaehlerTyp').value,
    service: document.getElementById('f_hasService').checked,
    interval: document.getElementById('f_serviceInterval').value,
    hint: document.getElementById('f_typ_prefill_hint').style.display !== 'none',
    hintTxt: document.getElementById('f_typ_prefill_hint').textContent,
    stand: document.getElementById('f_aktuellerStand').value,
    name: document.getElementById('f_name').value
  }));
  ok(f.marke === 'Trotec' && f.modell === 'TTK 175 S', 'Marke + Modell übernommen');
  ok(f.kw === '1.2', 'Leistung übernommen');
  ok(f.zTyp === 'kwh', 'Zähler-Typ-Einstellung übernommen');
  ok(f.service === true && f.interval === '12', 'Service-Einstellungen übernommen');
  ok(f.hint && f.hintTxt.includes('Bautrockner TTK 175'), 'Hint nennt das Quell-Gerät');
  ok(f.name === '' && f.stand === '', 'Name + Zählerstand bleiben leer (geräte-spezifisch)');
}
// Bereits Getipptes wird NICHT überschrieben
await p1.evaluate(() => {
  document.getElementById('f_marke').value = 'Dantherm';
  const t = document.getElementById('f_typ'); t.value = ''; t.dispatchEvent(new Event('change'));
  t.value = 'bautrockner'; t.dispatchEvent(new Event('change'));
});
ok(await p1.evaluate(() => document.getElementById('f_marke').value) === 'Dantherm', 'bereits getippte Marke wird beim Typ-Wechsel nicht überschrieben');
await p1.evaluate(() => window.closeAdd());

console.log('■ Duplizieren');
const idA = devA.id;
await p1.evaluate(id => window.openDuplicate(id), idA);
{
  const f = await p1.evaluate(() => ({
    title: document.getElementById('mhd_title').textContent,
    name: document.getElementById('f_name').value,
    marke: document.getElementById('f_marke').value,
    kw: document.getElementById('f_kw').value,
    zTyp: document.getElementById('f_zaehlerTyp').value,
    intern: document.getElementById('f_intern').value,
    serial: document.getElementById('f_serial').value,
    stand: document.getElementById('f_aktuellerStand').value,
    service: document.getElementById('f_hasService').checked,
    hint: document.getElementById('f_typ_prefill_hint').textContent
  }));
  ok(f.title === 'Gerät duplizieren', 'Modal-Titel «Gerät duplizieren»');
  ok(f.name === 'Bautrockner TTK 175' && f.marke === 'Trotec' && f.kw === '1.2', 'Name/Marke/kW kopiert');
  ok(f.zTyp === 'kwh' && f.service === true, 'Zähler-Typ + Service kopiert');
  ok(f.intern === '' && f.serial === '' && f.stand === '', 'Kennung/Serien-Nr./Zählerstand bewusst leer');
  ok(f.hint.includes('Kopie von'), 'Kopie-Hinweis sichtbar');
}
await p1.fill('#f_intern', 'TR-02');
await p1.fill('#f_aktuellerStand', '120');
await p1.evaluate(() => window.saveDevice());
await p1.waitForTimeout(200);
{
  const devs = await p1.evaluate(() => JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]'));
  const kopie = devs.find(d => d.internKennung === 'TR-02');
  ok(devs.length === 2, 'Duplikat als zweites Gerät gespeichert');
  ok(kopie && kopie.marke === 'Trotec' && kopie.zaehlerTyp === 'kwh' && kopie.aktuellerZaehlerstand === 120 && !kopie.serienNr, 'Kopie trägt eigene Werte, geerbte Einstellungen');
}

console.log('■ Gerät ohne Zähler (kein) — Formular + Einsatz + Rücknahme');
await p1.evaluate(() => window.openAdd());
await p1.evaluate(() => { const t = document.getElementById('f_typ'); t.value = 'ventilator'; t.dispatchEvent(new Event('change')); });
await p1.fill('#f_name', 'Ventilator TTV');
await p1.fill('#f_kw', '0.2');
await p1.evaluate(() => { const z = document.getElementById('f_zaehlerTyp'); z.value = 'kein'; z.dispatchEvent(new Event('change')); });
ok(await p1.evaluate(() => document.getElementById('f_aktuellerStand_wrap').style.display) === 'none', 'Ventilator ohne Zähler: kein Zählerstand-Feld');
await p1.evaluate(() => window.saveDevice());
await p1.waitForTimeout(200);
const idC = await p1.evaluate(() => (JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]').find(d => d.name === 'Ventilator TTV') || {}).id);
ok(!!idC, 'Gerät ohne Zähler gespeichert (aktuellerZaehlerstand null)');

// Einsatz kWh-Gerät: Label kWh + Vorbefüllung
await p1.evaluate(id => window.openEinsatz(id), idA);
{
  const e = await p1.evaluate(() => ({
    lbl: document.getElementById('e_zaehlerStart_label').textContent,
    val: document.getElementById('e_zaehlerStart').value,
    vis: document.getElementById('e_zaehlerStart_wrap').style.display
  }));
  ok(e.lbl === 'Zählerstand Start (kWh)', 'Einsatz-Dialog: Label «Zählerstand Start (kWh)»');
  ok(e.val === '500' && e.vis !== 'none', 'Startwert 500 kWh vorbefüllt');
}
await p1.evaluate(() => { document.getElementById('e_schaden').value = 'sch_1'; document.getElementById('e_raum').value = 'Bad EG'; });
await p1.evaluate(() => window.saveEinsatz());
await p1.waitForTimeout(150);

// Rücknahme kWh: direkter Verbrauch, KEINE kW-Multiplikation
await p1.evaluate(id => window.openReturn(id), idA);
{
  const r = await p1.evaluate(() => ({
    lbl: document.getElementById('r_zaehlerEnde_label').textContent,
    info: document.getElementById('return_info').textContent
  }));
  ok(r.lbl === 'Zählerstand Ende (kWh)', 'Rücknahme: Label «Zählerstand Ende (kWh)»');
  ok(r.info.includes('500 kWh'), 'Info-Box zeigt Start in kWh');
  ok(!r.info.includes('Leistung'), 'kWh-Zähler: keine irreführende Leistungs-Zeile');
}
await p1.fill('#r_zaehlerEnde', '560');
await p1.evaluate(() => window.calcKwh());
{
  const k = await p1.evaluate(() => ({ val: document.getElementById('kwh_val').textContent, det: document.getElementById('kwh_detail').textContent }));
  ok(k.val === '60.0', 'kWh = 560 − 500 = 60.0 (direkt, nicht × kW)');
  ok(k.det.includes('Direktzähler'), 'Detail nennt Direktzähler');
}
await p1.evaluate(() => window.saveReturn());
await p1.waitForTimeout(150);
{
  const d = await p1.evaluate(() => JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]').find(x => x.name === 'Bautrockner TTK 175'));
  const h = d.einsatzHistorie[d.einsatzHistorie.length - 1];
  ok(h.kwhTotal === 60 && h.betriebsstunden == null && h.zaehlerTyp === 'kwh', 'Historie: 60 kWh direkt, keine Betriebsstunden');
  ok(d.aktuellerZaehlerstand === 560, 'Aktueller Zählerstand nachgeführt (560 kWh)');
}

// Einsatz+Rücknahme ohne Zähler: Felder weg, Hinweis auf Bericht
await p1.evaluate(id => window.openEinsatz(id), idC);
ok(await p1.evaluate(() => document.getElementById('e_zaehlerStart_wrap').style.display) === 'none', 'Einsatz ohne Zähler: kein Zählerstand-Feld');
await p1.evaluate(() => { document.getElementById('e_schaden').value = 'sch_1'; document.getElementById('e_raum').value = 'Flur'; });
await p1.evaluate(() => window.saveEinsatz());
await p1.waitForTimeout(150);
await p1.evaluate(id => window.openReturn(id), idC);
{
  const r = await p1.evaluate(() => ({
    vis: document.getElementById('r_zaehlerEnde_wrap').style.display,
    info: document.getElementById('return_info').textContent
  }));
  ok(r.vis === 'none', 'Rücknahme ohne Zähler: kein Zählerstand-Feld');
  ok(r.info.includes('Kein Zähler') && r.info.includes('Laufzeit'), 'Hinweis: Verbrauch wird im Schadensbericht über die Laufzeit erfasst');
}
await p1.evaluate(() => window.saveReturn());
await p1.waitForTimeout(150);
{
  const d = await p1.evaluate(() => JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]').find(x => x.name === 'Ventilator TTV'));
  const h = d.einsatzHistorie[d.einsatzHistorie.length - 1];
  ok(d.status === 'verfuegbar' && h && h.kwhTotal == null, 'Rücknahme ohne Zähler funktioniert ohne Pflicht-Eingabe');
}

// Detail-Modal: Zähler-Typ + Stand mit Einheit
await p1.evaluate(id => window.openDetail(id), idA);
{
  const t = await p1.evaluate(() => document.getElementById('dm_body').textContent);
  ok(t.includes('kWh-Zähler (direkt)'), 'Detail zeigt den Zähler-Typ');
  ok(t.includes('560 kWh'), 'Detail zeigt aktuellen Stand mit kWh-Einheit');
}
const poolTg = await p1.evaluate(() => localStorage.getItem('gema_trocknung_v1'));
await ctx1.close();

// ── Kontext 2: Schadensbericht — Mapping «kein Zähler» → Laufzeit ──
console.log('■ Schadensbericht: Gerät ohne Zähler → automatische Laufzeit-Berechnung');
const s2 = seed(['role_planer']);
s2['gema_trocknung_v1'] = JSON.parse(poolTg).map(d => { d.status = 'verfuegbar'; d.einsatz = null; return d; });
const { ctx: ctx2, page: p2 } = await newPage(browser, s2);
await p2.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
await p2.waitForFunction(() => typeof _sdDefaultZaehlerTyp === 'function' && typeof sdComputeKwh === 'function', null, { timeout: 12000 });
await p2.waitForTimeout(700);
// Trocknungs-Pool nach dem Boot erneut seeden (Bind-Mock leert Caches)
await p2.evaluate(pool => localStorage.setItem('gema_trocknung_v1', pool), JSON.stringify(JSON.parse(poolTg).map(d => { d.status = 'verfuegbar'; d.einsatz = null; return d; })));

{
  const m = await p2.evaluate(() => {
    const r = {};
    r.keinMitKw = _sdDefaultZaehlerTyp({ typ: 'bautrockner', zaehlerTyp: 'kein', kw: 1.2 });
    r.messgeraet = _sdDefaultZaehlerTyp({ typ: 'messgeraet', zaehlerTyp: 'kein', kw: 0 });
    r.messgeraetAlt = _sdDefaultZaehlerTyp({ typ: 'messgeraet' });
    r.kwhTyp = _sdDefaultZaehlerTyp({ typ: 'bautrockner', zaehlerTyp: 'kwh', kw: 1.2 });
    r.alt = _sdDefaultZaehlerTyp({ typ: 'bautrockner' });
    return r;
  });
  ok(m.keinMitKw === 'laufzeit', 'TG «kein Zähler» + kW → Bericht-Typ «laufzeit» (Stunden-Erfassung)');
  ok(m.messgeraet === 'kein' && m.messgeraetAlt === 'kein', 'Messgerät (0 kW) bleibt «kein» — kein Verbrauchs-Tracking');
  ok(m.kwhTyp === 'kwh' && m.alt === 'stunden', 'kwh/Altbestand unverändert');
}
{
  const ui = await p2.evaluate(() => {
    _sdApplyZaehlerTyp('laufzeit');
    const a = {
      lz: document.getElementById('devLaufzeitWrap').style.display,
      start: document.getElementById('devStartWrap').style.display
    };
    _sdApplyZaehlerTyp('kwh');
    a.kwhLbl = document.getElementById('devStartLabel').textContent;
    a.kwhStart = document.getElementById('devStartWrap').style.display;
    return a;
  });
  ok(ui.lz !== 'none' && ui.start === 'none', 'laufzeit: Stunden-Felder sichtbar, Zählerstand versteckt');
  ok(ui.kwhLbl === 'Zählerstand Start (kWh)' && ui.kwhStart !== 'none', 'kwh: Zählerstand-Feld mit kWh-Label');
}
{
  const c = await p2.evaluate(() => ({
    kwhDirekt: sdComputeKwh({ zaehlerTyp: 'kwh', zaehlerStart: 100, zaehlerEnde: 160, kw: 5 }, {}),
    lzTotal: sdComputeKwh({ zaehlerTyp: 'laufzeit', kw: 2, stundenTotal: 48 }, {}),
    lzTage: sdComputeHours({ zaehlerTyp: 'laufzeit', stundenProTag: 24, eingesetztAm: '2026-07-10', entferntAm: '2026-07-12' }, {})
  }));
  ok(c.kwhDirekt === 60, 'Bericht: kWh-Zähler = 160 − 100 = 60 (KEINE ×kW-Multiplikation)');
  ok(c.lzTotal === 96, 'Bericht: Laufzeit 48 h × 2 kW = 96 kWh');
  ok(c.lzTage === 72, 'Laufzeit über Tage: 3 Tage (inkl.) × 24 h/Tag = 72 h');
}
// Picker-Übernahme: Ventilator (kein Zähler, 0.2 kW) → Formular springt auf Laufzeit
{
  const pick = await p2.evaluate(() => {
    const devs = _sdLoadAvailableTgDevices();
    const vent = devs.find(d => d.name === 'Ventilator TTV');
    if (!vent) return { err: 'Ventilator nicht im Pool' };
    document.getElementById('devName').value = vent.name;
    document.getElementById('devKw').value = vent.kw || '';
    document.getElementById('devLinkedTgId').value = vent.id;
    const t = _sdDefaultZaehlerTyp(vent);
    _sdApplyZaehlerTyp(t);
    return {
      typ: t,
      sel: document.getElementById('devZaehlerTyp').value,
      lz: document.getElementById('devLaufzeitWrap').style.display,
      start: document.getElementById('devStartWrap').style.display
    };
  });
  ok(pick.typ === 'laufzeit' && pick.sel === 'laufzeit', 'Picker: Ventilator ohne Zähler landet als «laufzeit» im Formular');
  ok(pick.lz !== 'none' && pick.start === 'none', 'Stunden-Eingabe erscheint automatisch, kein Zählerstand-Feld');
}
// Release: Laufzeit-Gerät schreibt Stunden + kWh in die Geräte-Historie
{
  const rel = await p2.evaluate(() => {
    const devs = JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]');
    const vent = devs.find(d => d.name === 'Ventilator TTV');
    vent.status = 'im_einsatz';
    vent.einsatz = { schadenId: 'sch_x', schadenTitel: 'Test', raum: 'Flur', eingesetztAm: '2026-07-10', zaehlerStart: 0 };
    localStorage.setItem('gema_trocknung_v1', JSON.stringify(devs));
    _sdReleaseTgDevice(vent.id, { zaehlerTyp: 'laufzeit', kw: 0.2, stundenTotal: 100, tgDeviceId: vent.id }, {});
    const after = JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]').find(d => d.id === vent.id);
    return { status: after.status, hist: after.einsatzHistorie[after.einsatzHistorie.length - 1] };
  });
  ok(rel.status === 'verfuegbar', 'Release: Gerät wieder verfügbar');
  ok(rel.hist.zaehlerTyp === 'laufzeit' && rel.hist.betriebsstunden === 100 && rel.hist.kwhTotal === 20, 'Historie: 100 h Laufzeit × 0.2 kW = 20 kWh (statt null)');
}
await ctx2.close();

if (errors.length) console.log('  [pageerrors]', errors.slice(0, 5));
ok(errors.length === 0, 'Keine JS-Fehler in if_trocknung');

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
