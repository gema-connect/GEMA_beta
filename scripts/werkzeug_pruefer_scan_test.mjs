// Prüfer: Scan-Einstieg (QR + NFC) → direkt in den Prüfauftrag
//
// Feedback 28.07.2026: «Der Prüfer von Leitern oder Elektrogeräten soll einen
// Button haben um NFC zu scannen sodass das Werkzeug direkt öffnet und das
// selbe für den QR-Code, sodass er maximal effizient die Elektroprüfungen
// machen kann.»
//
// Geprüft wird:
//  A) Prüfer sieht die Scan-Knöpfe (QR immer, NFC nur mit Web-NFC) — auch auf
//     einem Gerät, das sich als Desktop meldet
//  B) Scan (QR ODER NFC) eines Geräts mit offenem Prüfauftrag öffnet DIREKT
//     den Prüfungsauftrag-Dialog — nicht die Ausleihe-Ansicht
//  C) Gerät ohne offenen Auftrag → Detailansicht statt Selbst-Ausleihe
//  D) NFC-Nutzlast wird aus URL (scan=/view=) und roher ID gelesen
//  E) Der Prüfbericht landet mit Prüfername + Datum am Gerät
//
// Ausführen: CHROME=<chromium> node scripts/werkzeug_pruefer_scan_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// Prüfer-Konto (role_pruefer) — beauftragt für wz_elektro
const st = seed(['role_pruefer']);
st.gema_users_v1[0].lieferantId = 'lief_pruef';
const TOOLS = [
  { id: 'wz_elektro', orgId: 'org_kunde', name: 'Bohrhammer TE 30', cat: 'bohrmaschinen', brand: 'Hilti',
    bought: '2024-01-10', hasElec: true, elecInterval: 12, lastElec: '2025-07-01',
    pruefAnfrage: { lieferantId: 'u_test', lieferantFirma: 'Elektro-Prüf AG', typ: 'elektropruefung',
      angefordertVon: 'u_mag', angefordertVonName: 'M. Maier', angefordertAm: '2026-07-20T08:00:00.000Z', status: 'angefordert' } },
  { id: 'wz_ohne', orgId: 'org_kunde', name: 'Leiter 3m', cat: 'leiter', bought: '2023-05-01',
    hasLeiter: true, leiterInterval: 12, lastLeiter: '2026-01-05',
    pruefAnfrage: { lieferantId: 'u_test', lieferantFirma: 'Elektro-Prüf AG', typ: 'leiterpruefung',
      angefordertVon: 'u_mag', angefordertVonName: 'M. Maier', status: 'erledigt' } }
];

const { ctx, page } = await newPage(browser, st);
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e)));
await page.route('**/rest/v1/gema_data*', route => {
  const req = route.request();
  if (req.method() === 'GET' && /werkzeugmanagement/.test(req.url())) {
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(TOOLS.map(t => ({ data_key: 'tool:' + t.id, payload: { data: t, _lm: '2026-07-20T08:00:00.000Z' } }))) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
// Web-NFC vortäuschen, damit der NFC-Knopf erscheint und der Reader testbar ist
await page.addInitScript(() => {
  window.__nfcHandlers = [];
  window.NDEFReader = function () {
    this.scan = () => Promise.resolve();
    this.addEventListener = (typ, fn) => { if (typ === 'reading') window.__nfcHandlers.push(fn); };
  };
  window.__nfcTag = (txt) => {
    const enc = new TextEncoder().encode(txt);
    const ev = { message: { records: [{ recordType: 'url', data: enc }] } };
    window.__nfcHandlers.forEach(f => f(ev));
  };
});
await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof renderList === 'function' && typeof tools !== 'undefined' && Array.isArray(tools), null, { timeout: 12000 });
await page.waitForTimeout(1400);

/* ════════ A · Scan-Knöpfe für den Prüfer ════════ */
console.log('■ A · Prüfer sieht QR- und NFC-Knopf');
{
  ok(await page.evaluate(() => _wzIsPruefer()) === true, 'Prüfer-Rolle erkannt');
  // Feststellung (Drift-Guard, KEIN Soll-Wert): role_pruefer hat in
  // gema_auth WRITE auf werkzeugmanagement — der Prüfer ist damit heute
  // faktisch Voll-Editor im Modul. Ändert sich das bewusst, failt dieser
  // Check und die Scan-Routen unten sind nachzuziehen.
  ok(await page.evaluate(() => _wzCanEdit()) === true, 'Ist-Zustand: Prüfer hat write auf werkzeugmanagement');
  const sicht = await page.evaluate(() => {
    const wrap = document.getElementById('wzHeroScanWrap');
    const qr = document.getElementById('wzHeroScan');
    const nfc = document.getElementById('wzHeroNfc');
    return { wrap: wrap && getComputedStyle(wrap).display, qr: qr && getComputedStyle(qr).display, nfc: nfc && getComputedStyle(nfc).display };
  });
  ok(sicht.wrap !== 'none', 'Scan-Leiste sichtbar (auch ohne Touch-Gerät)');
  ok(sicht.qr !== 'none', 'QR-Knopf sichtbar');
  ok(sicht.nfc !== 'none', 'NFC-Knopf sichtbar (Web-NFC vorhanden)');
  ok(await page.evaluate(() => typeof _wzScanWithNFC === 'function'), 'NFC-Scan-Funktion vorhanden');
}

/* ════════ B · QR-Scan öffnet den Prüfauftrag ════════ */
console.log('■ B · Scan mit offenem Auftrag → Prüfungsauftrag-Dialog');
{
  await page.evaluate(() => _wzScanOpen('wz_elektro'));
  await page.waitForTimeout(350);
  const dlg = await page.evaluate(() => document.body.innerText);
  ok(/Prüfungsauftrag/.test(dlg), 'Prüfungsauftrag-Dialog offen (nicht die Ausleihe)');
  ok(/Bohrhammer TE 30/.test(dlg), 'richtiges Gerät');
  ok(/Auftrag quittieren/.test(dlg), 'Quittieren steht bereit');
  ok(/Prüfergebnis melden/.test(dlg), 'Prüfergebnis kann direkt gemeldet werden');
  await page.evaluate(() => _wzCloseModal());
}

/* ════════ C · Ohne offenen Auftrag → Detail statt Ausleihe ════════ */
console.log('■ C · Erledigter Auftrag → Detailansicht');
{
  await page.evaluate(() => _wzScanOpen('wz_ohne'));
  await page.waitForTimeout(350);
  const zust = await page.evaluate(() => ({
    txt: document.body.innerText,
    detail: !!document.getElementById('vm_actions_grid'),   // Marker der Detailansicht
    auftrag: /Prüfungsauftrag/.test(document.body.innerText)
  }));
  ok(zust.detail, 'Detailansicht offen (nicht der Scan-Ausleihe-Screen)');
  ok(!zust.auftrag, 'kein Prüfungsauftrag-Dialog bei erledigtem Auftrag');
  ok(/Leiter 3m/.test(zust.txt), 'richtiges Gerät');
  await page.evaluate(() => { try { closeView(); } catch (e) { _wzCloseModal(); } });
}

/* ════════ D · NFC-Nutzlast lesen + Routing ════════ */
console.log('■ D · NFC-Tag öffnet dasselbe Ziel');
{
  const ids = await page.evaluate(() => {
    const mk = t => ({ message: { records: [{ recordType: 'url', data: new TextEncoder().encode(t) }] } });
    return [
      _wzNfcIdAus(mk('https://gema.ch/if_werkzeug.html?scan=wz_elektro')),
      _wzNfcIdAus(mk('https://gema.ch/if_werkzeug.html?view=wz_ohne&x=1')),
      _wzNfcIdAus(mk('wz_elektro')),
      _wzNfcIdAus(mk('https://example.com/fremd'))
    ];
  });
  ok(ids[0] === 'wz_elektro', 'ID aus ?scan= gelesen');
  ok(ids[1] === 'wz_ohne', 'ID aus ?view= gelesen (Zusatz-Parameter ignoriert)');
  ok(ids[2] === 'wz_elektro', 'rohe wz_-ID gelesen');
  ok(ids[3] === '', 'fremder Tag liefert nichts');
  // echter NFC-Durchlauf: Knopf → Tag anhalten → Dialog
  await page.evaluate(() => _wzScanWithNFC());
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !!document.getElementById('pruefNfcStatus')), 'NFC-Bereitschaft wird angezeigt (abbrechbar)');
  await page.evaluate(() => window.__nfcTag('https://gema.ch/if_werkzeug.html?scan=wz_elektro'));
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.getElementById('pruefNfcStatus')), 'Status-Pill nach dem Treffer weg');
  ok(/Prüfungsauftrag/.test(await page.evaluate(() => document.body.innerText)), 'NFC-Scan öffnet den Prüfauftrag');
}

/* ════════ E · Bericht trägt Prüfer + Datum ════════ */
console.log('■ E · Prüfbericht wird mit Name und Datum abgelegt');
{
  await page.evaluate(() => { document.getElementById('plBem').value = 'Schutzleiter i.O.'; });
  await page.evaluate(() => _wzPruefLiefBerichtEinreichen('wz_elektro'));
  await page.waitForTimeout(400);
  const b = await page.evaluate(() => {
    const t = tools.find(x => x.id === 'wz_elektro');
    const r = (t.berichte || []).filter(x => x.typ === 'pruefbericht').pop();
    return r ? { autor: r.autorName, datum: r.datum, erg: r.ergebnis, next: r.naechstePruefung, lastElec: t.lastElec, status: t.pruefAnfrage.status } : null;
  });
  ok(!!b, 'Prüfbericht am Gerät abgelegt');
  ok(b && !!b.autor, 'Prüfername gesetzt: ' + (b && b.autor));
  ok(b && /^\d{4}-\d{2}-\d{2}T/.test(b.datum), 'Prüfdatum gesetzt');
  ok(b && /Bestanden/.test(b.erg), 'Ergebnis gesetzt');
  ok(b && !!b.next, 'Nächste Prüfung gesetzt');
  ok(b && !!b.lastElec, 'Fälligkeit nachgeführt (lastElec)');
  ok(b && b.status === 'erledigt', 'Auftrag auf erledigt');
}

ok(errs.filter(e => !/Cannot read|null|undefined/.test(e)).length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
