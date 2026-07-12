// Cross-Modul-Workflow-E2E für die drei Datenfluss-Ketten («einmal
// erfassen, überall verknüpft») — fängt stille Brüche an den Übergabe-
// stellen ab (falscher Payload-Key, toter Scope, fehlendes Pool-Bind):
//
//   Kette C — LU → Osmose → Enthärtung:
//     OW-Verbraucher aus der LU landen in sa_osmose (BW nicht — Doppel-
//     zählungs-Schutz), recalc() schreibt via GemaOsmose.save nach
//     localStorage, sa_enthaertung übernimmt Permeat+Konzentrat als
//     Zeile + die BW-Verbraucher (OW nie direkt).
//   Kette A — Offertanfrage → Vormerkung:
//     getVormerkungen leitet Vormerkungen aus beantworteten OAs ab
//     (cloud-synct) — der localStorage-Store des Lieferanten-Geräts
//     erreicht den Planer nie.
//   Kette B — Ausschreibung → Bestellung:
//     pm_ausschreibungsunterlagen + pm_revisionsunterlagen booten ohne
//     Fehler und binden den GemaBest-Pool.
//
// AUSFÜHREN (benötigt playwright-core + Chromium; ESM sucht node_modules
// aufwärts — z.B. aus einem Ordner mit playwright-core starten):
//   CHROME=<chromium-binary> node scripts/kette_e2e_test.mjs
import { chromium } from 'playwright-core';
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0, n = 0;
function check(name, cond) {
  n++;
  if (cond) console.log('  ok ' + n + ' — ' + name);
  else { fails++; console.error('  FAIL ' + n + ' — ' + name); }
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// Seed: Planer + Objekt + LU-Daten (1 OW-Verbraucher 0.5 l/s, 1 BW-Verbraucher 0.2 l/s)
const st = seed(['role_planer']);
st.gema_objekte_v1 = {
  objekte: [{ id: 'obj_e2e', name: 'E2E Haus', strasse: 'Musterweg 1', plz: '4000', ort: 'Basel', orgId: 'org_test', status: 'aktiv' }],
  beteiligte: []
};
st.gema_active_objekt_v1 = 'obj_e2e';
st['lu_spitzenvolumenstrom_dropdown_v3__obj_e2e'] = {
  devices: [], maxLU: {},
  special: [
    { label: 'Labor RO', freiName: 'Labor RO', medium: 'ow', qty: 1, flow: 0.5 },
    { label: 'Dusche BW', freiName: 'Dusche BW', medium: 'bw', qty: 1, flow: 0.2 }
  ],
  dauer: [],
  _stammdaten: { devices: [] }
};

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await wireRoutes(ctx);
await ctx.addInitScript(s => {
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
}, st);

const errors = [];
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));

// ── 1) sa_osmose: LU-Prefill → recalc → GemaOsmose.save ──────────────
await page.goto(BASE + '/sa_osmose.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200); // Meta-Boot + LU-Prefill (200ms-Timer)

check('Osmose: Objekt-Dropdown auf obj_e2e', await page.evaluate(() => (document.getElementById('metaObjektDropdown') || {}).value) === 'obj_e2e');
const rows = await page.evaluate(() => {
  const tb = document.getElementById('consumerBody');
  return Array.from(tb.rows).map(r => ({
    name: r.cells[0].querySelector('input').value,
    flow: r.cells[1].querySelector('input').value
  }));
});
check('Osmose: OW-Verbraucher aus LU übernommen (0.5 l/s → 1800 l/h)',
  rows.some(r => r.name.indexOf('Labor RO') >= 0 && Math.abs(parseFloat(r.flow) - 1800) < 1));
check('Osmose: BW-Verbraucher NICHT übernommen (Doppelzählungs-Schutz)',
  !rows.some(r => r.name.indexOf('Dusche BW') >= 0));

// «↻ LU-Daten laden»-Button (war tot: IIFE-lokale Funktion im inline onclick)
// — VOR der Dateneingabe testen: der Reload leert die Betriebsstunden.
const btnOk = await page.evaluate(() => {
  if (typeof window._osmoseLuReload !== 'function') return false;
  try { document.getElementById('luInfoBtn').click(); return true; } catch (e) { return false; }
});
check('Osmose: «↻ LU-Daten laden»-Button funktioniert (window._osmoseLuReload)', btnOk);

// Betriebsdaten ergänzen → recalc → Cross-Modul-Save
await page.evaluate(() => {
  const tb = document.getElementById('consumerBody');
  tb.rows[0].cells[2].querySelector('input').value = '12'; // h/Tag
  document.getElementById('phi').value = '75';             // Recovery %
  document.getElementById('va').value = '2000';            // Anlagenleistung l/h
  recalc();
});
const osmRes = await page.evaluate(() => {
  const raw = localStorage.getItem('gema_osmose_results_v1__obj_e2e');
  return raw ? JSON.parse(raw) : null;
});
check('Osmose: GemaOsmose.save schreibt Ergebnis-Record (vorher: stiller ReferenceError, NIE gespeichert)', !!osmRes);
check('Osmose: permeat_lh = 2000 (VA waehrend Laufzeit)', osmRes && Math.abs(osmRes.permeat_lh - 2000) < 1);
check('Osmose: konzentrat_lh = 666.7 (bei 75% Recovery)', osmRes && Math.abs(osmRes.konzentrat_lh - 666.7) < 1);

// ── 2) sa_enthaertung: bw-Verbraucher + Osmose-Ergebnis ─────────────
const page2 = await ctx.newPage();
page2.on('pageerror', e => errors.push(e.message));
await page2.goto(BASE + '/sa_enthaertung.html', { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(1400);

const enth = await page2.evaluate(() => {
  const out = [];
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(c => {
    const l = document.getElementById('lbl_' + c), v = document.getElementById('n_' + c);
    if (l && l.value) out.push({ name: l.value, ls: v ? v.value : '' });
  });
  return out;
});
check('Enthärtung: Osmose-Zeile (Permeat + Konzentrat) übernommen',
  enth.some(r => r.name.indexOf('Osmose-Anlage') >= 0));
const osmRow = enth.find(r => r.name.indexOf('Osmose-Anlage') >= 0);
check('Enthärtung: Osmose-Eingang = Permeat+Konzentrat = 0.741 l/s',
  !!osmRow && Math.abs(parseFloat(osmRow.ls) - (2666.67 / 3600)) < 0.01);
check('Enthärtung: BW-Verbraucher (0.2 l/s) übernommen',
  enth.some(r => r.name.indexOf('Dusche BW') >= 0 && Math.abs(parseFloat(r.ls) - 0.2) < 0.001));
check('Enthärtung: OW-Verbraucher NICHT direkt drin (nur via Osmose-Ergebnis)',
  !enth.some(r => r.name.indexOf('Labor RO') >= 0));

// ── 3) Kette A: Vormerkung-Ableitung im Browser ─────────────────────
// OA senden (Planer-Gerät) + Antwort wie vom Cloud-Sync gemerged (ohne
// lokales addVormerkung) → getVormerkungen liefert die abgeleitete VM.
const vmChk = await page2.evaluate(() => {
  const oa = GemaProdukte.createOffertanfrage({
    lieferantId: 'lief_x', lieferantFirma: 'BWT', produktId: 'p1', produktName: 'AQA perla',
    kategorie: 'enthaertung', berechnungswerte: { durchfluss: '9 l/min' },
    projekt: { name: 'E2E Haus', ort: '', objektId: 'obj_e2e' }
  });
  oa.status = 'beantwortet';
  oa.antwort = { bruttoPreis: 4200, beantwortetAm: new Date().toISOString() };
  const vms = GemaProdukte.getVormerkungen('obj_e2e');
  return { count: vms.length, id: vms[0] && vms[0].id, bkp: vms[0] && vms[0].bkpCode, preis: vms[0] && vms[0].bruttoPreis };
});
check('Kette A: Vormerkung aus cloud-synchter OA abgeleitet', vmChk.count === 1 && vmChk.preis === 4200);
check('Kette A: bkpCode 253.0 (Lieferung Enthärtungsanlage)', vmChk.bkp === '253.0');

// ── 4) Kette B: pm_ausschreibungsunterlagen bootet + GemaBest da ────
const page3 = await ctx.newPage();
const errors3 = [];
page3.on('pageerror', e => errors3.push(e.message));
await page3.goto(BASE + '/pm_ausschreibungsunterlagen.html', { waitUntil: 'domcontentloaded' });
await page3.waitForTimeout(1500);
check('Kette B: pm_ausschreibungsunterlagen bootet ohne Fehler', errors3.length === 0);
check('Kette B: GemaBest geladen (Bind beim Boot)', await page3.evaluate(() => typeof GemaBest !== 'undefined'));

// ── 5) pm_revisionsunterlagen bootet ohne Fehler ─────────────────────
const page4 = await ctx.newPage();
const errors4 = [];
page4.on('pageerror', e => errors4.push(e.message));
await page4.goto(BASE + '/pm_revisionsunterlagen.html', { waitUntil: 'domcontentloaded' });
await page4.waitForTimeout(1200);
check('pm_revisionsunterlagen bootet ohne Fehler', errors4.length === 0);

if (errors.length) console.log('  [Hinweis] pageerrors Osmose/Enthärtung:', errors.slice(0, 4));
check('Keine JS-Fehler in sa_osmose/sa_enthaertung', errors.length === 0);

await browser.close();
server.close();
console.log(fails ? ('\n' + fails + ' FEHLER') : ('\nAlle ' + n + ' E2E-Checks gruen'));
process.exit(fails ? 1 : 0);
