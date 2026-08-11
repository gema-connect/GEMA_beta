// Drift-Guard: das Feedback-Board (sys_beta.html) kennt JEDES Modul —
// und der Markdown-Export exportiert es auch.
//
// Zwei getrennte Fallen steckten dahinter:
//   1. MODULES (Board-Anzeige) wurde von Hand gepflegt; die Auto-Discovery
//      warf fehlende Module in einen Sammel-Block OHNE Link (dort suchte
//      niemand sein Modul — «Prüfliste fehlt»).
//   2. FEEDBACK_IDS — die Quelle des Markdown-Exports UND die Liste der
//      data_keys, die _GemaDB ueberhaupt laedt — war eine ZWEITE Handliste.
//      Was dort fehlte, wurde weder geladen noch exportiert.
// Beide leiten sich jetzt ab (gema_auth.getModules + Cloud-Discovery).
//
// Ausfuehren: CHROME=<chromium> node scripts/beta_module_vollstaendig_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_admin']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// Cloud-Mock: ein Feedback-Eintrag unter einer ID, die WEDER im Board noch
// in gema_auth steht (so waehlt ein Modul seinen GemaFeedback.init-Namen
// selbst) — plus einer fuer die Pruefliste.
const EINTRAG = [{ ts: '27.07.2026 09:00', author: 'Sandro', type: 'bug',
                   text: 'Prüfpunkt liess sich nicht speichern', cStatus: 'offen' }];
// IDs, die in der FEEDBACK_IDS-SEED-Liste stehen, aber KEIN gema_auth-Modul
// sind (Startseite, Profil, diese Seite selbst). Genau die hatten nie eine
// Board-Zeile: der Export zeigte ihre Punkte, das Board nicht.
const SEED_MIT_DATEN = ['module', 'profil', 'beta_pruefungen'];
const punkt = id => [{ ts: '05.08.2026 11:00', author: 'Robin', type: 'bug',
                       text: 'PUNKT-' + id, cStatus: 'offen' }];
await ctx.route('**/rest/v1/gema_data*', route => {
  const u = route.request().url();
  if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
  if (/feedback_/.test(decodeURIComponent(u))) {
    const rows = [
      { data_key: 'feedback_pruefliste',       payload: { data: EINTRAG, v: JSON.stringify(EINTRAG), _lm: 1 } },
      { data_key: 'feedback_ein_altes_modul',  payload: { data: [], v: '[]', _lm: 1 } },
      // 'preise' steht ebenfalls in der Seed-Liste, traegt aber KEINE Daten
      // → darf keine leere Karteileiche im Board erzeugen.
      { data_key: 'feedback_preise',           payload: { data: [], v: '[]', _lm: 1 } }
    ];
    SEED_MIT_DATEN.forEach(id => rows.push({ data_key: 'feedback_' + id,
      payload: { data: punkt(id), v: JSON.stringify(punkt(id)), _lm: 1 } }));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  return route.fulfill({ contentType: 'application/json', body: '[]' });
});

await page.goto(BASE + '/sys_beta.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof MODULES !== 'undefined' && typeof FEEDBACK_IDS !== 'undefined', null, { timeout: 12000 });
await page.waitForTimeout(2200);

console.log('■ Board kennt jedes registrierte Modul');
{
  const r = await page.evaluate(() => {
    const ids = []; MODULES.forEach(c => (c.items || []).forEach(i => { ids.push(i.id); (i.sub || []).forEach(s => ids.push(s.id)); }));
    const auth = GemaAuth.getModules().map(m => m.key);
    return { fehlt: auth.filter(k => ids.indexOf(k) < 0), authAnzahl: auth.length, boardAnzahl: ids.length };
  });
  ok(r.fehlt.length === 0, 'kein gema_auth-Modul fehlt im Board (' + r.authAnzahl + ' Module)' + (r.fehlt.length ? ' — fehlt: ' + r.fehlt.join(', ') : ''));
  ok(r.boardAnzahl >= r.authAnzahl, 'Board deckt mindestens alle registrierten Module ab');
}
{
  const p = await page.evaluate(() => {
    for (const c of MODULES) { const it = (c.items || []).find(i => i.id === 'pruefliste'); if (it) return { cat: c.cat, href: it.href, name: it.name }; }
    return null;
  });
  ok(!!p, 'Prüfliste ist im Board');
  ok(p && /Projektmanagement/.test(p.cat), 'Prüfliste steht in ihrer echten Kategorie (' + (p && p.cat) + ')');
  ok(p && p.href === 'pm_pruefliste.html', 'Prüfliste hat den richtigen Link (' + (p && p.href) + ')');
}
// Auto-erkannte Module bekommen ihren echten Link aus FILE_MAP — nie geraten
ok(await page.evaluate(() => {
  const fm = GemaAuth.getFileMap(); const rev = {};
  Object.keys(fm).forEach(f => { if (!rev[fm[f]]) rev[fm[f]] = f + '.html'; });
  let schlecht = [];
  MODULES.forEach(c => (c.items || []).forEach(i => {
    if (i._autoDiscovered && i.href && rev[i.id] && i.href !== rev[i.id]) schlecht.push(i.id);
  }));
  return schlecht.length === 0;
}), 'auto-erkannte Links stammen aus FILE_MAP (keine geratenen 404)');

console.log('■ FEEDBACK_IDS: Quelle des Exports, vollständig');
{
  const r = await page.evaluate(() => ({
    fehlt: GemaAuth.getModules().map(m => m.key).filter(k => FEEDBACK_IDS.indexOf(k) < 0),
    anzahl: FEEDBACK_IDS.length,
    cloudId: FEEDBACK_IDS.indexOf('ein_altes_modul') >= 0,
    cloudImBoard: MODULES.some(c => (c.items || []).some(i => i.id === 'ein_altes_modul'))
  }));
  ok(r.fehlt.length === 0, 'jedes registrierte Modul kann Feedback tragen' + (r.fehlt.length ? ' — fehlt: ' + r.fehlt.join(', ') : ''));
  ok(r.cloudId, 'in der Cloud gefundene Feedback-ID wird ergänzt (auch wenn sie nirgends registriert ist)');
  ok(r.cloudImBoard, 'diese ID erscheint auch im Board — sonst läge Feedback nur im Export');
}

console.log('■ Jeder Feedback-Punkt ist im Board erreichbar (nicht nur im Export)');
{
  // Die Kern-Invariante: was der Export sieht, MUSS das Board zeigen.
  // Der Export iteriert FEEDBACK_IDS, das Board rendert nur MODULES-Zeilen —
  // Seed-IDs ohne Modul (Startseite/Profil/diese Seite) fielen genau hier
  // durch und waren unsichtbar, obwohl «Daten geladen» stand.
  const r = await page.evaluate(() => {
    const board = {}; MODULES.forEach(c => (c.items || []).forEach(i => {
      board[i.id] = i; (i.sub || []).forEach(s => { board[s.id] = s; }); }));
    const mitDaten = FEEDBACK_IDS.filter(id => { try { return (getFeedback(id) || []).length > 0; } catch (e) { return false; } });
    const hint = document.getElementById('fbLueckeHint');
    const zeile = id => { const it = board[id]; return it ? { name: it.name, href: it.href } : null; };
    return {
      ohneZeile: mitDaten.filter(id => !board[id]),
      mitDatenAnzahl: mitDaten.length,
      startseite: zeile('module'), profil: zeile('profil'),
      leerHatZeile: !!board['preise'],
      hintSichtbar: !!hint && hint.style.display !== 'none',
      hintText: hint ? hint.textContent : '',
      // Sichtbar heisst: die Karte steht wirklich im DOM, nicht nur im State
      startseiteKarteImDom: (function () {
        try { toggleFbPanel('module'); } catch (e) { }
        return document.body.innerText.indexOf('PUNKT-module') >= 0;
      })()
    };
  });
  ok(r.ohneZeile.length === 0, 'jede Feedback-ID mit Daten hat eine Board-Zeile ('
    + r.mitDatenAnzahl + ' mit Daten)' + (r.ohneZeile.length ? ' — ohne Zeile: ' + r.ohneZeile.join(', ') : ''));
  ok(!!r.startseite, 'Startseiten-Feedback («module») hat eine Zeile');
  ok(r.startseite && /Startseite/.test(r.startseite.name), 'die Zeile heisst sprechend statt «Module» (' + (r.startseite && r.startseite.name) + ')');
  ok(r.startseite && r.startseite.href === 'index.html', 'sie verlinkt auf index.html (' + (r.startseite && r.startseite.href) + ')');
  ok(r.profil && r.profil.href === 'sys_profil.html', 'Profil-Feedback verlinkt auf sys_profil.html');
  ok(!r.leerHatZeile, 'eine Seed-ID OHNE Feedback bekommt KEINE leere Zeile');
  ok(r.startseiteKarteImDom, 'die Feedback-Karte der Startseite steht wirklich im DOM');
  ok(r.hintSichtbar, 'die Lücke wird sichtbar gemeldet statt still geschlossen');
  ok(/module/.test(r.hintText) && /profil/.test(r.hintText), 'der Hinweis nennt die betroffenen Bereiche');
}

console.log('■ Markdown-Export enthält das Modul');
{
  const md = await page.evaluate(() => {
    // Feedback direkt in den _GemaDB-Cache legen (der Mock liefert die Rows,
    // das Format des Payloads unterscheidet sich je nach Ladeweg).
    // umsetzen:true = im Board für die Umsetzung freigegeben; ohne den Haken
    // nimmt der Export einen Punkt bewusst nicht mit.
    _GemaDB.c['feedback_pruefliste'] = JSON.stringify([{ ts: '27.07.2026 09:00', author: 'Sandro',
      type: 'bug', text: 'Prüfpunkt liess sich nicht speichern', cStatus: 'offen', umsetzen: true }]);
    return _exGenerate(_exCollectAll(), false);
  });
  ok(/## pruefliste/.test(md), 'Export enthält die Modul-Sektion «pruefliste»');
  ok(/Prüfliste/.test(md), 'Export nennt den Anzeigenamen (' + (md.match(/## pruefliste — (.*)/) || [])[1] + ')');
  ok(/Prüfpunkt liess sich nicht speichern/.test(md), 'der Feedback-Text steht im Export');
}
ok(await page.evaluate(() => _exModuleLabel('erp') !== 'erp'), 'unbekannte Board-ID bekommt das gema_auth-Label statt der rohen ID');
ok(await page.evaluate(() => _exModuleLabel('gibt_es_nicht') === 'Gibt es nicht'), 'völlig unbekannte ID wird lesbar gemacht');

ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''));

await ctx.close(); await browser.close(); server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
