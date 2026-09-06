/* Drift-Guard Feedback 15.08.2026 (Sandro Caso: sb_warmwasser 32 Punkte + gema_sektion
   Kapitel-Chips + pm_ausschreibungsunterlagen 4 Punkte — eigene Dokument-Vorlagen,
   Auswahl-Menü seitlich, Auto-Montage bei Lieferung, BKP-Nr-Breite).
   Browser-Test (Playwright): CHROME=<chromium> node scripts/feedback_20260815_test.mjs
   Deckt die NEUEN Bausteine ab — die bestehenden Guards (speicheropt 147, speicherschema 20+31,
   tagessim 20, kette_e2e) prüfen die Altbestands-Invarianten. */
import { chromium } from 'playwright-core';

const ROOT = '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, fail = 0;
const t = (b, msg) => { if (b) { ok++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
let ignorePageErrors = false; // nur fuers Teardown-Fenster beim Seitenwechsel (s.u.)
page.on('pageerror', e => { if (ignorePageErrors) return; fail++; console.log('  ✗ pageerror: ' + e.message); });
await page.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith('http') && !u.includes('localhost')) return r.abort();
  r.continue();
});

await page.goto('file://' + ROOT + '/sys_login.html');
await page.evaluate(() => {
  const now = Date.now();
  const user = { id: 'u_test', name: 'Test Planer', username: 'test@gema.ch', orgId: 'org_default', roleIds: ['role_planer'], active: true };
  localStorage.setItem('gema_users_v1', JSON.stringify([user]));
  localStorage.setItem('gema_session_v1', JSON.stringify({ userId: 'u_test', token: 'eyJ.fake.tok', expires: now + 864e5, remember: true }));
  const zkRows = [
    { nr: 1, len: 12, e: '', f: '', art: 'kon', ort: 'keller', ovl: '28', dn: 15, mat: 'cu' },
    { nr: 2, len: 8,  e: '', f: '', art: 'kon', ort: 'keller', ovl: '22', dn: 12, mat: 'cu' },
    { nr: 3, len: 6,  e: '', f: '', art: 'RaR', ort: 'schacht', ovl: '35', dn: 18, mat: 'cu' }
  ];
  localStorage.setItem('gema_zirkulation', JSON.stringify({ zk_rows: JSON.stringify(zkRows), zk_tww: '58' }));
});

await page.goto('file://' + ROOT + '/sb_warmwasser.html');
await page.waitForTimeout(1400);

console.log('■ Kapitel-Nummern-Chips (#20/#32, gema_sektion) — im aktiven Tab wt1 messen');
const chips = await page.evaluate(() => {
  const list = [...document.querySelectorAll('.gsek-nr')].map(n => n.textContent.trim());
  const c = document.querySelector('.tab-content.active .gsek-nr--lang');
  const r = c ? c.getBoundingClientRect() : { width: 0 };
  return { n: list.length, hat11: list.includes('1.1'), hat21: list.includes('2.1'), hat61: list.includes('6.1'),
    lang: document.querySelectorAll('.gsek-nr--lang').length, w: r.width, txt: c ? c.textContent : '' };
});
t(chips.hat11 && chips.hat21 && chips.hat61, 'Chips «1.1» «2.1» «6.1» gerendert (gesamt ' + chips.n + ')');
t(chips.lang >= 15, 'Mehrstellige Chips tragen gsek-nr--lang (' + chips.lang + ')');
t(chips.w > 24, 'Chip wächst mit dem Inhalt («' + chips.txt + '» = ' + Math.round(chips.w) + 'px)');

console.log('■ Tab-Leisten (#7 Balken unten)');
t(await page.locator('[data-ww-bottom]').count() === 1, 'untere Tab-Leiste vorhanden');
t(await page.locator('#pdfArea').count() === 1, 'pdfArea-id nur einmal');
await page.locator('[data-ww-bottom] [data-tab="wt2"]').click();
await page.waitForTimeout(300);
const beideAktiv = await page.evaluate(() => {
  const a = [...document.querySelectorAll('.g-tab[data-tab="wt2"]')];
  return a.length === 2 && a.every(b => b.classList.contains('active'));
});
t(beideAktiv, 'Klick unten aktiviert BEIDE Leisten synchron');
t(await page.evaluate(() => document.getElementById('wt2').classList.contains('active')), 'Tab ② offen');

console.log('■ Stutzen-Chips (#25) — Default kw+wwv+wwr+hvhr = 5');
const stz0 = await page.evaluate(() => ({
  chips: document.querySelectorAll('#wwStzChips .ww-stz-chip').length,
  aktiv: document.querySelectorAll('#wwStzChips .ww-stz-chip.active').length,
  feld: document.getElementById('ww_stutzen').value
}));
t(stz0.chips === 5, '5 Anschluss-Chips gerendert');
t(stz0.aktiv === 4 && stz0.feld === '5', 'Default: 4 Chips aktiv → 5 Stk. (ist ' + stz0.aktiv + '/' + stz0.feld + ')');
await page.evaluate(() => { wwStzToggle('kw'); wwStzToggle('hvhr'); });
await page.waitForTimeout(150);
const stzV = await page.evaluate(() => ({
  v: document.getElementById('ww_stutzen').value,
  hidden: document.getElementById('ww_stutzenChips').value,
  aktiv: document.querySelectorAll('#wwStzChips .ww-stz-chip.active').length,
  feinF: document.getElementById('ww_stutzenF').value
}));
t(stzV.v === '2', 'KW + HV/HR abgewählt → Total 2 Stk. (wwv+wwr, ist: ' + stzV.v + ')');
t(stzV.aktiv === 2, '2 Chips aktiv markiert');
t(stzV.hidden === 'wwv,wwr', 'Auswahl im Hidden-Feld: «' + stzV.hidden + '»');
t(stzV.feinF === '2', 'Feinplanung-Stutzen gespiegelt (#5): ' + stzV.feinF);
await page.locator('#ww_stutzen').fill('7');
await page.locator('#ww_stutzen').dispatchEvent('input');
await page.waitForTimeout(120);
const stzM = await page.evaluate(() => ({
  hidden: document.getElementById('ww_stutzenChips').value,
  aktiv: document.querySelectorAll('#wwStzChips .ww-stz-chip.active').length,
  feinF: document.getElementById('ww_stutzenF').value
}));
t(stzM.aktiv === 0 && !stzM.hidden, 'manueller Wert löst die Chip-Auswahl');
t(stzM.feinF === '7', 'Spiegel folgt dem manuellen Wert (untouched): ' + stzM.feinF);
// Feinplanung-Feld selbst anfassen → Spiegel stoppt
// Nachzug Feedback 05.09.2026 #7 (Sandro Caso): «Anzahl Stutzen» ist mit der Speicher-
// wärmeverlust-Kette aus Karte 4.1 (Tab ④) in die neue Karte 3.3 der FEINPLANUNG (Tab ③)
// gewandert — verschoben, nicht gespiegelt. page.locator().fill() verlangt Sichtbarkeit,
// darum steht hier wt3 statt wt4; die Zusicherung von #5 (eigene Eingabe stoppt den
// Spiegel) bleibt unverändert.
await page.evaluate(() => { document.querySelector('[data-tab="wt3"]').click(); });
await page.locator('#ww_stutzenF').fill('9');
await page.locator('#ww_stutzenF').dispatchEvent('input');
await page.evaluate(() => { document.querySelector('[data-tab="wt2"]').click(); });
await page.locator('#ww_stutzen').fill('4');
await page.locator('#ww_stutzen').dispatchEvent('input');
await page.waitForTimeout(120);
const stzT = await page.evaluate(() => ({ touch: document.getElementById('ww_stutzenFTouch').value, feinF: document.getElementById('ww_stutzenF').value }));
t(stzT.touch === '1' && stzT.feinF === '9', 'eigene Feinplanungs-Eingabe stoppt den Spiegel (touch=' + stzT.touch + ', F=' + stzT.feinF + ')');

console.log('■ 2.2-Texte + Farbzeilen (#26/#8/#22)');
const z22 = await page.evaluate(() => {
  const lbl = id => { const el = document.getElementById(id); const fg = el && el.closest('.fg'); return fg ? fg.querySelector('.fg-lbl').textContent : ''; };
  return { kon: lbl('ww_lKonv'), rar: lbl('ww_lRar'), whb: lbl('ww_lWhb'),
    dots: document.querySelectorAll('#wt2 .ww-cdot').length,
    farbRows: [...document.querySelectorAll('#wt2 .g-result-row')].filter(r => r.style.color).length };
});
t(/Zirkulation konventionell/.test(z22.kon), '2.2 «Zirkulation konventionell»');
t(/Rohr-an-Rohr\/Rohr-in-Rohr/.test(z22.rar), '2.2 «Zirkulation Rohr-an-Rohr/Rohr-in-Rohr»');
t(/Warmhalteband/.test(z22.whb), '2.2 «Warmhalteband»');
t(z22.dots >= 6, 'Farbpunkte an Feldern + Ergebniszeilen (' + z22.dots + ')');
t(z22.farbRows >= 6, 'ganze Ergebniszeilen in Leitungsart-Farbe (' + z22.farbRows + ')');

console.log('■ Zirkulations-Übernahme (#11, async _GemaDB-Pfad → localStorage-Fallback)');
await page.evaluate(() => { document.querySelector('[data-tab="wt3"]').click(); });
await page.evaluate(() => wwZirkUebernehmen());
await page.waitForTimeout(900);
const dlgTxt = await page.evaluate(() => { const d = document.querySelector('.gema-dlg'); return d ? d.textContent : ''; });
t(/20/.test(dlgTxt) && /Rohr-an-Rohr/.test(dlgTxt), 'Dialog fasst Übernahme zusammen (20 m kon + RaR)');
await page.evaluate(() => { const b = [...document.querySelectorAll('.gema-dlg button')].pop(); if (b) b.click(); });
await page.waitForTimeout(200);
const zw = await page.evaluate(() => ({
  vl: document.getElementById('ww_lVL').value, rl: document.getElementById('ww_lRL').value,
  rar: document.getElementById('ww_lRarF').value,
  oeVL: document.getElementById('ww_oeVL').value, oeRarRL: document.getElementById('ww_oeRarRL').value
}));
t(zw.vl === '20' && zw.rl === '20', 'Σ kon → VL+RL je 20 m (ist ' + zw.vl + '/' + zw.rl + ')');
t(zw.rar === '6', 'Σ RaR → 6 m');
t(parseFloat(zw.oeVL) >= 28, 'ø VL ≥ grösster kon-ø (28): ' + zw.oeVL);
t(parseFloat(zw.oeRarRL) >= 18, 'RaR-RL ≥ grösster DN (18): ' + zw.oeRarRL);

console.log('■ Material-Wahl (#12)');
const matTest = await page.evaluate(() => {
  const sel = document.getElementById('ww_matVL');
  const oe = document.getElementById('ww_oeVL');
  oe.value = '28';
  sel.value = 'pex';
  sel.dispatchEvent(new Event('change', { bubbles: true })); // isTrusted=false → darf NICHT klemmen
  const nachSynth = oe.value;
  wwMatChanged({ isTrusted: true }, 'ww_matVL', ['ww_oeVL']);
  const nachEcht = oe.value;
  // CNS-Wert IN der PEX-Reihe bleibt stehen
  oe.value = '32';
  wwMatChanged({ isTrusted: true }, 'ww_matVL', ['ww_oeVL']);
  return { nachSynth, nachEcht, bleibt: oe.value };
});
t(matTest.nachSynth === '28', 'synthetisches change klemmt NICHT (isTrusted-Guard)');
t(matTest.nachEcht === '32', 'PEX: ø 28 → nächstgrösser 32 (ist ' + matTest.nachEcht + ')');
t(matTest.bleibt === '32', 'Wert in der Reihe bleibt stehen');

console.log('■ Feinplanung 2-zeilig + Farben + σ (#18/#19/#8)');
await page.evaluate(() => {
  window.wwState.fein = [{ ne: 3, n: '50', profil: 'wohnbau' }, { ne: 7, n: '20', profil: 'hotel' }];
  wwRenderTables(); wwRecalc();
});
await page.waitForTimeout(300);
const fein = await page.evaluate(() => {
  const items = [...document.querySelectorAll('#wwFeinBody .ww-fein-item')];
  const first = items[0], second = items[1];
  const sig = first ? first.querySelector('[data-c="sig"]') : null;
  const s1 = first ? first.querySelector('.ww-fein-l1 select') : null;
  const s2 = second ? second.querySelector('.ww-fein-l1 select') : null;
  return {
    n: items.length,
    zweizeilig: !!(first && first.querySelector('.ww-fein-l1') && first.querySelector('.ww-fein-l2')),
    sigTxt: sig ? sig.textContent : '',
    f1: s1 ? s1.style.color : '', f2: s2 ? s2.style.color : '',
    nrChips: items.filter(it => it.querySelector('.ww-nr')).length,
    foot: !!document.querySelector('.ww-fein-foot #ww_out_feinTotal')
  };
});
t(fein.n === 2, '2 Fein-Zeilen als Items');
t(fein.zweizeilig, '2-zeiliges Layout (l1 + l2)');
t(/±/.test(fein.sigTxt), 'σ sichtbar (Ø ± σ): «' + fein.sigTxt + '»');
t(!!fein.f1 && !!fein.f2 && fein.f1 !== fein.f2, 'Zeilen-Selects in Diagramm-Farben: ' + fein.f1 + ' / ' + fein.f2);
t(fein.nrChips === 2, 'fortlaufende Zeilen-Nummern');
t(fein.foot, 'statischer Total-Footer (keine Duplikat-ids)');

console.log('■ Stunden-Tabelle der Feinplanungs-Summenlinien (#17 + Foto-Referenz 16.08.2026)');
const slh = await page.evaluate(() => {
  const tb = document.querySelector('#wwFeinSlTable table.ww-slh');
  if (!tb) return { da: false };
  const rows = [...tb.querySelectorAll('tbody tr')].map(r => r.cells[0] ? r.cells[0].textContent.trim() : '');
  // Foto-Layout: die Tabelle steht ÜBER dem Diagramm (VSSH-Blatt: Stundenzeile
  // + %-Zeile + Σ%-Zeile, darunter das Summenliniendiagramm)
  const host = document.getElementById('wwFeinSlTable');
  const canvas = document.getElementById('wwFeinSlCanvas');
  const vorCanvas = !!(host && canvas &&
    (host.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING));
  return { da: true, koepfe: tb.rows[0].cells.length, zeilen: rows, vorCanvas };
});
t(slh.da, 'Stunden-Tabelle gerendert');
// Feedback 19.08.2026 #2 (Sandro) übersteuert bewusst: die Tabelle trägt seither
// eine unsichtbare Pad-Spalte (= padR des Canvas), damit sie EXAKT mit dem
// Diagramm fluchtet → 26 Spalten (Stunde + 24 + Pad).
t(slh.da && slh.koepfe === 26, '26 Spalten (Stunde + 24 + Pad), ist ' + (slh.da ? slh.koepfe : 0));
t(slh.da && slh.vorCanvas, 'Tabelle steht ÜBER dem Diagramm (Foto-Layout)');
// Feedback 05.09.2026 #22 (Sandro) übersteuert die REIHENFOLGE bewusst: die
// Prozent-Zeilen stehen jetzt zusammen oben, die Liter-Zeilen darunter (und sind
// rot) — «Zeile nach oben schieben». Die Zusicherung von 15.08.2026 bleibt:
// es sind dieselben vier kompakten Referenz-Zeilen.
t(slh.da && slh.zeilen.join('|') === '%|Σ %|l|Σ l',
  'kompakte Referenz-Labels % / Σ % / l / Σ l (ist ' + (slh.da ? slh.zeilen.join('|') : '—') + ')');

// Rotation der SI-1991-Profile: WW_TYP_PROFILE (mitternachtsbasiert) MUSS exakt
// das 05:00-basierte VSSH-Original aus WW_SL_PROFILE sein — pct[h] = SL[(h+19)%24].
// Bis 16.08.2026 sass jede Spitze eine Stunde zu früh (04:00-Rotation).
const rot = await page.evaluate(() => {
  const map = { hotel: 'stadthotel', hotel_tourist: 'touristenhotel', altersheim: 'altersheim', spital: 'spital', restaurant: 'cafe_restaurant' };
  const fails = [];
  Object.keys(map).forEach(typKey => {
    const typ = window.WW_TYP_PROFILE ? WW_TYP_PROFILE[typKey] : null;
    const sl = window.WW_SL_PROFILE ? WW_SL_PROFILE[map[typKey]] : null;
    if (!typ || !sl) { fails.push(typKey + ': Profil fehlt'); return; }
    for (let h = 0; h < 24; h++) {
      if (Math.abs(typ.pct[h] - sl.pct[(h + 19) % 24]) > 1e-9) { fails.push(typKey + ' @h' + h); return; }
    }
    if (typ.pct[typ.peakIdx] !== Math.max(...typ.pct)) fails.push(typKey + ': peakIdx');
  });
  return fails;
});
t(rot.length === 0, 'SI-1991-Profile = VSSH-Rotation (05:00 → Mitternacht): ' + (rot.length ? rot.join(', ') : 'alle 5 exakt'));

// Foto-Werte (VSSH-Blatt Touristenhotel): eine reine hotel_tourist-Zeile →
// %-Zeile = Originalprofil (Spitze 20.5 % in der Stunde 18–19, 00–01 = 1 %),
// Σ%-Zeile endet exakt bei 100.
await page.evaluate(() => {
  window.wwState.fein = [{ ne: 7, n: '20', profil: 'hotel_tourist' }];
  wwRenderTables(); wwRecalc();
});
await page.waitForTimeout(300);
const foto = await page.evaluate(() => {
  const tb = document.querySelector('#wwFeinSlTable table.ww-slh');
  if (!tb) return { da: false };
  const num = s => parseFloat(String(s).replace(/’|'/g, '').replace(',', '.'));
  const koepfe = [...tb.rows[0].cells].map(c => c.textContent.trim());
  const zeilen = [...tb.querySelectorAll('tbody tr')];
  const pz = zeilen.find(r => r.cells[0].textContent.trim() === '%');
  const sz = zeilen.find(r => r.cells[0].textContent.trim() === 'Σ %');
  if (!pz || !sz) return { da: false };
  return {
    da: true,
    kopf19: koepfe[19],
    spitze: num(pz.cells[19].textContent),
    h0: num(pz.cells[1].textContent),
    sumEnde: num(sz.cells[24].textContent)
  };
});
t(foto.da, 'Tabelle mit reiner hotel_tourist-Zeile gerendert');
t(foto.da && foto.kopf19 === '18–19', 'Spalte 19 = Stunde 18–19 (ist ' + (foto.da ? foto.kopf19 : '—') + ')');
t(foto.da && Math.abs(foto.spitze - 20.5) < 0.05, 'Spitze 20.5 % in der Stunde 18–19 wie im VSSH-Blatt (ist ' + (foto.da ? foto.spitze : '—') + ')');
t(foto.da && Math.abs(foto.h0 - 1) < 0.05, '00–01 Uhr = 1 % (ist ' + (foto.da ? foto.h0 : '—') + ')');
t(foto.da && Math.abs(foto.sumEnde - 100) < 0.05, 'Σ%-Zeile endet bei 100 (ist ' + (foto.da ? foto.sumEnde : '—') + ')');

// Seed für die Folge-Sektionen wiederherstellen
await page.evaluate(() => {
  window.wwState.fein = [{ ne: 3, n: '50', profil: 'wohnbau' }, { ne: 7, n: '20', profil: 'hotel' }];
  wwRenderTables(); wwRecalc();
});
await page.waitForTimeout(300);

console.log('■ Wohnungen aus Grobauslegung (#14) → Zeit-Selects (#10)');
await page.evaluate(() => {
  window.wwState.grobWhg = [{ whg: '10', anf: '80' }, { whg: '4', anf: '120' }];
  window.wwState.whg = [];
  wwRenderTables(); wwRecalc();
  wwWhgAusGrob();
});
await page.waitForTimeout(400);
await page.evaluate(() => { const b = [...document.querySelectorAll('.gema-dlg button')].pop(); if (b) b.click(); });
await page.waitForTimeout(300);
const whg = await page.evaluate(() => ({
  n: window.wwState.whg.length,
  zeitSel: document.querySelectorAll('#wwAusstossWohnBody select.ww-zeit').length
}));
t(whg.n === 2, 'Wohnungszeilen übernommen (' + whg.n + ')');
t(whg.zeitSel === 2, 'Ausstosszeit-Select je Wohnungszeile (' + whg.zeitSel + ')');
await page.evaluate(() => wwWhgZeitSet(0, '15'));
await page.waitForTimeout(200);
const zeit = await page.evaluate(() => {
  const sel = document.querySelector('#wwAusstossWohnBody select.ww-zeit');
  return { v: sel ? sel.value : '', state: window.wwState.whg[0].zeitA };
});
t(zeit.v === '15' && zeit.state === '15', 'eigene Ausstosszeit pro Zeile wirkt (' + zeit.v + ')');

console.log('■ θKW/θWW-Kacheln in 1.4 (#28) — braucht Grob-Daten');
await page.evaluate(() => {
  window.wwState.grob = [{ ne: 1, n: '20' }];
  wwRenderTables(); wwRecalc();
});
await page.waitForTimeout(200);
const kpi = await page.evaluate(() => {
  const host = document.getElementById('ww_out_einheiten');
  return { tiles: host ? host.querySelectorAll('.ww-kpi').length : 0, txt: host ? host.textContent : '' };
});
t(kpi.tiles >= 2 && /θKW/.test(kpi.txt) && /θWW/.test(kpi.txt), 'Einheiten + θ-Kacheln (' + kpi.tiles + ')');

console.log('■ Speicherschema-Zeitraffer (#1 blau)');
await page.evaluate(() => {
  document.getElementById('ww_leistung').value = '50';
  wwRecalc();
  document.querySelector('[data-tab="wt4"]').click();
});
await page.waitForTimeout(800);
const zr = await page.evaluate(() => ({
  btn: !!document.querySelector('[data-wwsp="zrBtn"]'),
  ov: document.querySelectorAll('[data-wwsp="zrOv"]').length,
  clock: !!document.querySelector('[data-wwsp="zrClock"]'),
  hooks: !!(window._wwSimHooks && window._wwSimHooks.data && window._wwSimHooks.data())
}));
t(zr.hooks, 'Sim-Daten vorhanden (Bedarf + Leistung)');
t(zr.btn, 'Zeitraffer-Knopf im Schema');
t(zr.ov >= 1, 'Overlay-Rects vorhanden (' + zr.ov + ')');
t(zr.clock, 'Uhr-Text getaggt (Regex-Tagging funktioniert)');
if (zr.btn) {
  await page.evaluate(() => wwSpZrToggle());
  await page.waitForTimeout(1300);
  const lauf = await page.evaluate(() => {
    const ov = document.querySelector('[data-wwsp="zrOv"]');
    const clk = document.querySelector('[data-wwsp="zrClock"]');
    return { op: ov ? parseFloat(ov.getAttribute('opacity')) : 0, clock: clk ? clk.textContent : '' };
  });
  t(lauf.op > 0, 'Animation läuft (Overlay opacity ' + lauf.op + ')');
  t(/Uhr/.test(lauf.clock), 'Uhr zählt: «' + lauf.clock + '»');
  await page.evaluate(() => wwSpZrToggle());
  await page.waitForTimeout(200);
  const stopp = await page.evaluate(() => {
    const ov = document.querySelector('[data-wwsp="zrOv"]');
    return ov ? parseFloat(ov.getAttribute('opacity')) : -1;
  });
  t(stopp === 0, 'Stopp blendet Overlay aus');
}

console.log('■ Serie (2 Speicher): Overlay pro Behälter');
await page.evaluate(() => wwSpSetAnzahl(2));
await page.waitForTimeout(500);
const serie = await page.evaluate(() => document.querySelectorAll('[data-wwsp="zrOv"]').length);
t(serie === 2, 'Serie: 2 Overlay-Rects (' + serie + ')');

console.log('■ Verlustzahl-Ampel (#21) + Grob-Echo (#29) + Ausstoss-Abwahl (#23)');
await page.evaluate(() => { document.querySelector('[data-tab="wt2"]').click(); });
const vz = await page.evaluate(() => {
  const el = document.getElementById('ww_out_vz');
  const tot = document.getElementById('ww_out_grobTotal2');
  return { farbe: el ? el.style.color : '', tot: tot ? tot.textContent : '' };
});
t(!!vz.farbe, 'Verlustzahl trägt Ampel-Farbe: ' + vz.farbe);
t(vz.tot !== '–' && vz.tot !== '', 'Tagesbedarf-Echo in ② gefüllt: ' + vz.tot);
const ab = await page.evaluate(() => {
  const cb = document.getElementById('ww_ausstossAktiv');
  const vorher = parseFloat((document.getElementById('ww_out_vz') || {}).textContent) || 0;
  cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
  const wrap = document.getElementById('wwAusstossWrap24');
  const nachher = parseFloat((document.getElementById('ww_out_vz') || {}).textContent) || 0;
  return { off: wrap.classList.contains('ww-card-off'), vorher, nachher };
});
t(ab.off, 'abgewählt → Sektion ausgegraut');
t(ab.nachher < ab.vorher, 'Verlustzahl ohne Ausstoss kleiner (' + ab.vorher + ' → ' + ab.nachher + ')');

// ═══════════════════════════════════════════════════════════════════
// pm_ausschreibungsunterlagen — 4 Punkte (Sandro Caso 15.08.2026):
// #1 eigene Dokument-Vorlagen · #2 Auswahl-Menü seitlich ·
// #3 Auto-Montage bei Lieferung · #4 BKP-Nr nicht abgeschnitten
// ═══════════════════════════════════════════════════════════════════
console.log('\n■ pm_ausschreibungsunterlagen — Boot + Testdaten');
await page.setViewportSize({ width: 1280, height: 900 });
// Teardown-Fenster: die abgebrochenen Netz-Routen dieses Tests lassen beim
// Verlassen der Warmwasser-Seite deren pagehide-Flush-Fetches als unhandled
// rejection stranden (reines Test-Artefakt der abort-Routen, nicht die App —
// den Aus-Boot prueft kette_e2e strikt mit echten Route-Mocks). Waehrend des
// Wechsels ueber about:blank zaehlen pageerrors deshalb nicht.
ignorePageErrors = true;
await page.goto('about:blank');
await page.waitForTimeout(500);
ignorePageErrors = false;
await page.goto('file://' + ROOT + '/pm_ausschreibungsunterlagen.html');
await page.waitForTimeout(1600);
t(await page.evaluate(() => typeof GemaDialog !== 'undefined'), 'gema_dialog.js eingebunden (GemaDialog verfügbar)');
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  const a = { id: 'aus_g1', name: 'Guard 1', typ: 'funktional', orgId: u.orgId, erstelltVonUserId: u.id, lose: [], bkp: [], beteiligte: [] };
  S.ausschreibungen.push(a); S.activeAusId = 'aus_g1';
  ensureLose(a); sv(); buildTabs();
});

console.log('■ #2 Auswahl-Menü seitlich (≥981px) — schmale Screens horizontal');
const lay = await page.evaluate(() => {
  const tb = document.getElementById('tabBar'), pa = document.getElementById('PA');
  const cs = getComputedStyle(tb), r1 = tb.getBoundingClientRect(), r2 = pa.getBoundingClientRect();
  return { dir: cs.flexDirection, pos: cs.position, links: r1.right <= r2.left + 1, tabs: tb.querySelectorAll('.tab-btn').length };
});
t(lay.dir === 'column', 'Tab-Leiste vertikal (flex-direction column)');
t(lay.pos === 'sticky', 'Seitenmenü sticky');
t(lay.links, 'Menü steht LINKS neben dem Inhalt');
t(lay.tabs >= 10, 'alle Planer-Tabs im Menü (' + lay.tabs + ')');
await page.setViewportSize({ width: 800, height: 900 });
await page.waitForTimeout(150);
t(await page.evaluate(() => getComputedStyle(document.getElementById('tabBar')).flexDirection) === 'row', 'unter 981px: horizontale Leiste (unverändert)');
await page.setViewportSize({ width: 1280, height: 900 });

console.log('■ #3 Auto-Montage + #4 BKP-Nr — BKP-Checkliste');
await page.evaluate(() => nav('pbkp'));
await page.waitForTimeout(250);
const am = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_g1'); const l = a.lose[0];
  const find = t => l.positionen.findIndex(p => p.titel === t);
  const iL = find('Lieferung Wasserzähler'), iM = find('Montage Wasserzähler');
  const nVorher = l.positionen.length;
  // Klick-Weg: Gruppe öffnen, Checkbox der 252.0-Zeile klicken
  document.querySelectorAll('.bkp-group').forEach(g => g.classList.add('open'));
  let inp = [...document.querySelectorAll('.bkp-row input[type=text]')].find(x => x.value === '252.0');
  const row = inp && inp.closest('.bkp-row');
  if (row) row.querySelector('input[type=checkbox]').click();
  const l2 = S.ausschreibungen.find(x => x.id === 'aus_g1').lose[0];
  return {
    daIdx: iL >= 0 && iM >= 0,
    liefOhneModul: !l.positionen[iL]?.lieferungTyp,
    montageChecked: l2.positionen.find(p => p.titel === 'Montage Wasserzähler')?.checked === true,
    keinDuplikat: l2.positionen.filter(p => p.titel === 'Montage Wasserzähler').length === 1,
    countGleich: l2.positionen.length === nVorher
  };
});
t(am.daIdx, 'Katalog-Paar 252.0/252.1 vorhanden');
t(am.liefOhneModul, '252.0 hat KEINE Modul-Verknüpfung (der frühere Gate-Fall)');
t(am.montageChecked, 'Lieferung angehakt → «Montage Wasserzähler» automatisch mit angewählt');
t(am.keinDuplikat && am.countGleich, 'bestehende Montage-Position wiederverwendet — kein Duplikat');
const am2 = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_g1'); const l = a.lose[0];
  const iL = l.positionen.findIndex(p => p.titel === 'Lieferung Fettabscheider');
  toggleBKP(l.id, iL, true);
  const l2 = S.ausschreibungen.find(x => x.id === 'aus_g1').lose[0];
  const iL2 = l2.positionen.findIndex(p => p.titel === 'Lieferung Wasserzähler');
  toggleBKP(l2.id, iL2, false); // Abwahl der Lieferung lässt Montage stehen
  const l3 = S.ausschreibungen.find(x => x.id === 'aus_g1').lose[0];
  return {
    modulPfad: l2.positionen.find(p => p.titel === 'Montage Fettabscheider')?.checked === true,
    montageBleibt: l3.positionen.find(p => p.titel === 'Montage Wasserzähler')?.checked === true
  };
});
t(am2.modulPfad, 'Modul-Lieferung (252.4) hakt 252.5 weiterhin mit an');
t(am2.montageBleibt, 'Abwahl der Lieferung lässt die Montage-Position stehen');
const nr = await page.evaluate(() => {
  document.querySelectorAll('.bkp-group').forEach(g => g.classList.add('open'));
  const inp = [...document.querySelectorAll('.bkp-row input[type=text]')].find(x => x.value === '252.0');
  if (!inp) return null;
  return { w: inp.clientWidth, passt: inp.scrollWidth <= inp.clientWidth };
});
t(nr && nr.w >= 60, 'BKP-Nr-Feld breit genug (' + (nr && nr.w) + 'px)');
t(nr && nr.passt, '«252.0» wird nicht abgeschnitten (scrollWidth ≤ clientWidth)');

console.log('■ #1 Eigene Dokument-Vorlagen (Vorbedingungen)');
await page.evaluate(() => { GemaDialog.prompt = () => Promise.resolve('Standard Sanitär'); });
const v1 = await page.evaluate(async () => {
  editVB();
  const sel = document.getElementById('vbModus');
  const optsVorher = sel.querySelectorAll('optgroup').length;
  // Kapitel-Text erfassen und als Vorlage speichern
  document.getElementById('vbRichEditor').innerHTML = '<p>Mein Standardtext Kapitel 1</p>';
  vbVorlageSpeichern();
  await new Promise(r => setTimeout(r, 120));
  const list = ldDokVorlagen();
  const sel2 = document.getElementById('vbModus');
  return {
    optsVorher, saveBtn: !!document.querySelector('button[onclick="vbVorlageSpeichern()"]'),
    n: list.length, name: list[0]?.name, kapHtml: list[0]?.kapitel?.[0]?.html || '',
    optgroup: sel2.querySelectorAll('optgroup').length === 1,
    selektiert: sel2.value === 'vorl:' + (list[0] || {}).id,
    delSichtbar: document.getElementById('vbVorlDel').style.display !== 'none',
    imStorage: (localStorage.getItem('gema_ausschreibung_dokvorl_v1__org_' + GemaAuth.getCurrentUser().orgId) || '').includes('Standard Sanitär')
  };
});
t(v1.optsVorher === 0 && v1.saveBtn, 'Editor: «Als Vorlage»-Knopf da, noch keine eigene Vorlage gelistet');
t(v1.n === 1 && v1.name === 'Standard Sanitär', 'Vorlage gespeichert (Name aus GemaDialog.prompt)');
t(v1.kapHtml.includes('Mein Standardtext'), 'Vorlage trägt die Kapitel-Texte (Rich-Text-HTML)');
t(v1.optgroup && v1.selektiert, 'Select: optgroup «Eigene Vorlagen» + neue Vorlage vorselektiert');
t(v1.delSichtbar, '🗑-Knopf sichtbar, solange eigene Vorlage gewählt');
t(v1.imStorage, 'org-gescopter Storage-Key gefüllt (dokVorlSK)');
const v2 = await page.evaluate(async () => {
  const tplId = ldDokVorlagen()[0].id;
  saveVB();
  const a1 = S.ausschreibungen.find(x => x.id === 'aus_g1');
  // Zweites Dokument: Vorlage muss dort ebenfalls wählbar sein + übernehmen
  const u = GemaAuth.getCurrentUser();
  const a2 = { id: 'aus_g2', name: 'Guard 2', typ: 'funktional', orgId: u.orgId, erstelltVonUserId: u.id, lose: [], bkp: [], beteiligte: [] };
  S.ausschreibungen.push(a2); S.activeAusId = 'aus_g2'; ensureLose(a2); sv();
  editVB();
  const sel = document.getElementById('vbModus');
  const waehlbar = [...sel.querySelectorAll('option')].some(o => o.value === 'vorl:' + tplId);
  sel.value = 'vorl:' + tplId; vbModusChanged();
  await new Promise(r => setTimeout(r, 120));
  const uebernommen = (_vbKapitel[0] || {}).html.includes('Mein Standardtext');
  saveVB();
  const a2n = S.ausschreibungen.find(x => x.id === 'aus_g2');
  return {
    doc1: a1.vorbedingungen.vorlageId === tplId && a1.vorbedingungen.modus === 'gema',
    doc1Kap: (a1.vorbedingungen.kapitelListe[0] || {}).html.includes('Mein Standardtext'),
    waehlbar, uebernommen,
    doc2: a2n.vorbedingungen.vorlageId === tplId
  };
});
t(v2.doc1 && v2.doc1Kap, 'Dokument 1 gespeichert: modus gema + vorlageId + Kapitel-HTML');
t(v2.waehlbar, 'Vorlage bei ANDEREM Dokument wählbar (org-weit, «bei allen Dokumenten»)');
t(v2.uebernommen, 'Auswahl übernimmt die Vorlagen-Kapitel (leeres Dokument ohne Rückfrage)');
t(v2.doc2, 'Dokument 2 merkt sich die gewählte Vorlage individuell');
const v3 = await page.evaluate(async () => {
  const tplId = ldDokVorlagen()[0].id;
  editVB(); // aus_g2 erneut öffnen
  const preselect = document.getElementById('vbModus').value === 'vorl:' + tplId;
  // Abbruch-Fall: Dokument MIT Inhalt, Vorlage übernehmen → Nein
  GemaDialog.confirm = () => Promise.resolve(false);
  _vbVorlageId = null; vbSyncModusSelect();
  document.getElementById('vbRichEditor').innerHTML = '<p>Eigener Inhalt XYZ</p>';
  vbApplyVorlage(tplId);
  await new Promise(r => setTimeout(r, 120));
  const unveraendert = document.getElementById('vbRichEditor').innerHTML.includes('XYZ');
  const zurueck = document.getElementById('vbModus').value === 'gema';
  // Löschen: Vorlage weg, Dokument-Kapitel bleiben
  GemaDialog.confirm = () => Promise.resolve(true);
  _vbVorlageId = tplId; vbSyncModusSelect();
  vbVorlageLoeschen();
  await new Promise(r => setTimeout(r, 120));
  const sel = document.getElementById('vbModus');
  return {
    preselect, unveraendert, zurueck,
    geloescht: ldDokVorlagen().length === 0,
    keinOptgroup: sel.querySelectorAll('optgroup').length === 0,
    inhaltBleibt: document.getElementById('vbRichEditor').innerHTML.includes('XYZ')
  };
});
t(v3.preselect, 'Wieder öffnen: gespeicherte Vorlage vorselektiert');
t(v3.unveraendert && v3.zurueck, 'Abbruch der Übernahme: Inhalt unverändert, Select zurückgestellt');
t(v3.geloescht && v3.keinOptgroup, 'Vorlage gelöscht → aus dem Select verschwunden');
t(v3.inhaltBleibt, 'Löschen der Vorlage lässt die Dokument-Kapitel unangetastet');
const v4 = await page.evaluate(() => { editVB(); return document.getElementById('vbModus').value; });
t(v4 === 'gema', 'Dokument mit gelöschter Vorlagen-Referenz fällt sauber auf GEMA-Vorlage zurück');

await browser.close();
console.log('\n═══ ' + ok + ' OK, ' + fail + ' FAIL ═══');
process.exit(fail ? 1 : 0);
