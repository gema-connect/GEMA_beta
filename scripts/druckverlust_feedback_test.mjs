// Playwright-Test: Feedback 16.07.2026 — sb_druckverlust (7 Punkte) + sa_osmose (2 Punkte)
//   Druckverlust: gr.LU-Select 3/5 (Default 3) · Feld-Reihenfolge (Leitungstyp
//   nach Dimension) · Q/v/ΔpTS-Chips in der Kopfzeile · Teilstrecken aus-
//   klappbar (kompakte Excel-Liste) · v-Ampel rot/orange(ab 90%)/grün ·
//   neue TS übernimmt letzte Wahl · Medium-Select (Wasser, Vorbereitung)
//   Osmose: Verbraucher-Sektion zuerst (1↔2 getauscht) · Tagesbedarf-Spalte
//   + Σ Total · VA-Hint «bei 10 °C»
// Ausführen: CHROME=<chromium> node scripts/druckverlust_feedback_test.mjs (aus scripts/)
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

// ── sb_druckverlust ─────────────────────────────────────────────────
console.log('■ Druckverlust: Kopfzeile, gr.LU, Klapp-Logik');
const { ctx: ctx1, page: p1 } = await newPage(browser, seed(['role_planer']));
const errors = [];
p1.on('pageerror', e => errors.push(e.message));
await p1.goto(BASE + '/sb_druckverlust.html', { waitUntil: 'domcontentloaded' });
await p1.waitForFunction(() => typeof addRow === 'function' && document.querySelectorAll('.ts-card').length > 0, null, { timeout: 12000 });
await p1.waitForTimeout(400);

{
  const m = await p1.evaluate(() => ({
    exists: !!document.getElementById('inp_medium'),
    val: (document.getElementById('inp_medium') || {}).value,
    opts: Array.from((document.getElementById('inp_medium') || {}).options || []).map(o => o.textContent)
  }));
  ok(m.exists && m.val === 'wasser', 'Medium-Select vorhanden, Standard Wasser');
  ok(m.opts.some(o => o.includes('weitere')), 'Vorbereitung: «weitere folgen» als deaktivierte Option');
}
{
  const labels = await p1.evaluate(() => Array.from(document.querySelector('.ts-card .ts-head').querySelectorAll('.ts-fg > label')).map(l => l.textContent.trim()));
  const iLt = labels.indexOf('Leitungstyp'), iLen = labels.indexOf('Länge'), iDim = labels.indexOf('Dimension'), iLu = labels.indexOf('Anzahl LU');
  ok(iDim >= 0 && iLt > iDim && iLt < iLen, 'Reihenfolge: Leitungstyp direkt nach Dimension, vor Länge');
  ok(iLen < iLu, 'Länge vor Anzahl LU');
  ok(labels.includes('Q') && labels.includes('v') && labels.includes('Δp TS'), 'Wichtige Werte (Q, v, Δp TS) als Chips in der Kopfzeile');
}
{
  const g = await p1.evaluate(() => {
    const sel = document.querySelector('.ts-card select[data-k="grLU"]');
    return sel ? { opts: Array.from(sel.options).map(o => o.value), val: sel.value } : null;
  });
  ok(g && g.opts.join(',') === '3,5', 'gr. LU ist ein Select mit nur 3 oder 5');
  ok(g && g.val === '3', 'Vorschlag automatisch 3 LU');
}
{
  const c = await p1.evaluate(() => {
    const card = document.querySelector('.ts-card');
    return {
      resHidden: card.querySelector('.ts-results').style.display === 'none',
      fitAbsent: !card.querySelector('.ts-fittings'),
      toggle: !!card.querySelector('[data-tstoggle]')
    };
  });
  ok(c.resHidden && c.fitAbsent, 'Teilstrecke startet eingeklappt (kompakte Excel-Liste)');
  ok(c.toggle, '▸-Knopf zum Aufklappen vorhanden');
  await p1.evaluate(() => document.querySelector('.ts-card [data-tstoggle]').click());
  const open = await p1.evaluate(() => {
    const card = document.querySelector('.ts-card');
    return card.querySelector('.ts-results').style.display !== 'none' && !!card.querySelector('.ts-fittings');
  });
  ok(open, 'Aufklappen zeigt Formstücke + volle Ergebnis-Zeile');
  await p1.evaluate(() => document.querySelector('.ts-card [data-tstoggle]').click());
  ok(await p1.evaluate(() => document.querySelector('.ts-card .ts-results').style.display === 'none'), 'Wieder einklappbar');
}

console.log('■ v-Ampel (Beispiel Ausstossleitung, Grenzwert 4.0 m/s)');
{
  const vClassFor = async q => await p1.evaluate(qd => {
    state.rows[0].flowMode = 'direct';
    state.rows[0].q_direct = qd;
    state.rows[0].leitungstyp = 'ausstoss';
    render();
    const chips = Array.from(document.querySelector('.ts-card .ts-head').querySelectorAll('.hd-res'));
    const vChip = chips.find(c => c.querySelector('label').textContent.trim() === 'v');
    return { cls: vChip.querySelector('.hd-val').className, txt: vChip.querySelector('.hd-val').textContent, err: document.querySelector('.ts-card').className.includes('has-error') };
  }, q);
  // di 19.6 mm → A=3.017e-4 m²: v = Q/A
  const gruen = await vClassFor(1.0);    // v ≈ 3.31 < 3.6 → grün
  ok(gruen.cls.includes('ok') && !gruen.cls.includes('warn'), 'v ≈ 3.31 m/s < 3.60 → grün (' + gruen.txt.trim() + ')');
  const orange = await vClassFor(1.15);  // v ≈ 3.81 (3.60–4.00) → orange
  ok(orange.cls.includes('warn'), 'v ≈ 3.81 m/s in 3.60–4.00 → orange');
  const rot = await vClassFor(1.25);     // v ≈ 4.14 > 4.00 → rot
  ok(rot.cls.includes('err'), 'v ≈ 4.14 m/s > 4.00 → rot');
  ok(rot.err, 'Karte über dem Grenzwert markiert (has-error)');
}

console.log('■ Neue Teilstrecke übernimmt letzte Wahl');
{
  const r = await p1.evaluate(() => {
    const last = state.rows[state.rows.length - 1];
    const sys = SYSTEMS.find(s => s.id === last.sysId);
    last.dimDn = sys.dims[Math.min(3, sys.dims.length - 1)].dn;
    last.leitungstyp = 'stockwerk';
    last.grLU = 5;
    render();
    const before = state.rows.length;
    addRow();
    const neu = state.rows[state.rows.length - 1];
    return { added: state.rows.length === before + 1, sysOk: neu.sysId === last.sysId, dimOk: neu.dimDn === last.dimDn, ltOk: neu.leitungstyp === 'stockwerk', grOk: neu.grLU === 5, lenDefault: neu.length_m === 5 };
  });
  ok(r.added && r.sysOk && r.dimOk, 'Rohrsystem + Dimension von der letzten TS übernommen');
  ok(r.ltOk && r.grOk, 'Leitungstyp + gr. LU übernommen');
  ok(r.lenDefault, 'Länge bleibt Standardwert (bewusst nicht kopiert)');
}
await ctx1.close();

// ── sa_osmose ───────────────────────────────────────────────────────
console.log('■ Osmose: Sektions-Reihenfolge + Tagesbedarf-Total + 10-°C-Hint');
const { ctx: ctx2, page: p2 } = await newPage(browser, seed(['role_planer']));
const errors2 = [];
p2.on('pageerror', e => errors2.push(e.message));
await p2.goto(BASE + '/sa_osmose.html', { waitUntil: 'domcontentloaded' });
await p2.waitForFunction(() => typeof addConsumerRow === 'function' && typeof recalc === 'function', null, { timeout: 12000 });
await p2.waitForTimeout(400);
{
  const s = await p2.evaluate(() => {
    const secs = Array.from(document.querySelectorAll('.g-section'));
    return secs.slice(0, 2).map(x => ({
      num: (x.querySelector('.g-section-num') || {}).textContent,
      titel: (x.querySelector('.g-section-title') || {}).textContent
    }));
  });
  ok(s[0].num === '1' && s[0].titel.includes('Verbraucher'), 'Sektion 1 = Verbraucher (getauscht)');
  ok(s[1].num === '2' && s[1].titel.includes('Grunddaten'), 'Sektion 2 = Grunddaten Anlage');
}
{
  const t = await p2.evaluate(() => {
    // bestehende Zeilen leeren, eine definierte Zeile erfassen
    const tbody = document.getElementById('consumerBody');
    while (tbody.rows.length) tbody.removeChild(tbody.lastElementChild);
    addConsumerRow('Spülmaschine', '50', '4');
    addConsumerRow('Labor', '25', '8');
    recalc();
    return {
      head: document.querySelector('.consumer-tbl thead').textContent,
      z1: tbody.rows[0].querySelector('.c-tagesbedarf').textContent,
      z2: tbody.rows[1].querySelector('.c-tagesbedarf').textContent,
      tot: document.getElementById('consumerTotal').textContent
    };
  });
  ok(t.head.includes('Tagesbedarf'), 'Neue Spalte «Tagesbedarf [l/Tag]»');
  ok(t.z1.includes('200'), 'Zeile 1: 50 l/h × 4 h = 200 l sichtbar');
  ok(t.z2.includes('200'), 'Zeile 2: 25 l/h × 8 h = 200 l sichtbar');
  ok(t.tot.includes('400'), 'Σ Total 400 l/Tag sichtbar');
}
ok(await p2.evaluate(() => document.body.textContent.includes('Leistung bei 10 °C Wassertemperatur')), 'VA-Hint nennt die 10 °C Wassertemperatur');
await ctx2.close();

if (errors.length) console.log('  [pageerrors dv]', errors.slice(0, 5));
if (errors2.length) console.log('  [pageerrors os]', errors2.slice(0, 5));
ok(errors.length === 0 && errors2.length === 0, 'Keine JS-Fehler in beiden Modulen');

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
