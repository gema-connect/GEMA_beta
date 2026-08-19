// Drift-Guard: Intelligente Adress-Suche (gema_adresse.js)
//
// Der Fall aus dem Feedback:
//   Gesucht:  Pfirtergasse 47, 4054 Basel
//   Eingabe:  «pfirterg 47»
//   Erwartet: NUR Adressen, deren Strassenname «pfirterg» enthaelt
//             UND deren Hausnummer 47 ist.
//
// Teil A (Node, ohne Browser): der ENGINE-Block von gema_adresse.js —
//   Zerlegung der Eingabe, Filter, Reihenfolge, Nachfrage-Texte.
// Teil B (Playwright): dieselbe Kette im Browser gegen einen NACHGEBAUTEN
//   Typeahead-Backend (nur das LETZTE Wort matcht als Praefix, Limit greift).
//   Damit ist auch die Ursache belegt: «pfirterg 47» findet direkt nichts,
//   weil «pfirterg» kein ganzes Wort im Index ist — erst die zweite Suche
//   (nur das Fragment) und die gezielte Nachfrage «Pfirtergasse 47 4054»
//   liefern die Adresse.
//
// Ausfuehren: node scripts/adresse_suche_test.mjs
//             CHROME=<chromium> node scripts/adresse_suche_test.mjs   (mit Teil B)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

// ─────────────────────────────────────────────────────────────
// Teil A — Engine (DOM-frei)
// ─────────────────────────────────────────────────────────────
const SRC = readFileSync(join(ROOT, 'gema_adresse.js'), 'utf8');
const m = SRC.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.log('  ✗ FAIL: ENGINE-Block in gema_adresse.js nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + `
  return { adrNorm, adrNr, adrTeileStrasse, adrZerlege, adrNrPasst, adrPasst,
           adrRang, adrSortiere, adrFiltere, adrQueries, adrNachfragen,
           ADR_ANZEIGE, ADR_LIMIT, ADR_NACHFRAGEN };`)();

const adr = (strasse, plz, ort) => ({ strasse, plz: String(plz), ort, gemeinde: ort, label: strasse + ' ' + plz + ' ' + ort });

console.log('■ A1 — Eingabe zerlegen');
{
  const z = E.adrZerlege('pfirterg 47');
  ok(z.strasse === 'pfirterg', 'pfirterg 47 → Strasse «pfirterg»');
  ok(z.nr === '47', 'pfirterg 47 → Nr «47»');
  ok(z.plz === '' && z.ort === '', 'pfirterg 47 → keine PLZ/kein Ort erfunden');
}
{
  const z = E.adrZerlege('Pfirtergasse 47, 4054 Basel');
  ok(z.strasse === 'Pfirtergasse' && z.nr === '47', 'Komma-Form: Strasse + Nr');
  ok(z.plz === '4054' && z.ort === 'Basel', 'Komma-Form: PLZ + Ort');
}
{
  const z = E.adrZerlege('im grund 3 4054 basel');
  ok(z.strasse === 'im grund', 'mehrwortige Strasse ohne Komma erkannt');
  ok(z.nr === '3' && z.plz === '4054' && z.ort === 'basel', 'Nr, PLZ und Ort daneben erkannt');
}
{
  const z = E.adrZerlege('4054 basel');
  ok(z.plz === '4054' && z.ort === 'basel' && !z.strasse, '4-stellige Zahl = PLZ (keine Hausnummer)');
}
{
  const z = E.adrZerlege('bahnhofstr 12a');
  ok(z.nr === '12a', 'Hausnummer mit Buchstabe');
  ok(E.adrZerlege('Rue du Nord 5b').nr === '5b', 'auch bei franzoesischem Strassennamen');
}
{
  const z = E.adrZerlege('basel');
  ok(z.strasse === 'basel' && !z.nr && !z.plz && !z.ort, 'blosser Suchbegriff bleibt Strassen-Kandidat');
}

console.log('■ A2 — Strasse und Hausnummer trennen');
ok(E.adrTeileStrasse('Pfirtergasse 47').name === 'Pfirtergasse', 'Name ohne Nummer');
ok(E.adrTeileStrasse('Pfirtergasse 47').nr === '47', 'Nummer separat');
ok(E.adrTeileStrasse('Im Grund 3a').nr === '3a', 'Nummer mit Buchstabe');
ok(E.adrTeileStrasse('Pfirtergasse').nr === '', 'ohne Nummer bleibt leer');
ok(E.adrTeileStrasse('Bahnhofstrasse 47-49').nr === '47-49', 'Bereich bleibt erhalten');

console.log('■ A3 — Hausnummern-Vergleich');
ok(E.adrNrPasst('47', '47') === true, '47 = 47');
ok(E.adrNrPasst('47', '47a') === true, '47 nimmt 47a mit');
ok(E.adrNrPasst('47a', '47') === false, '47a nimmt 47 NICHT');
ok(E.adrNrPasst('47a', '47a') === true, '47a = 47a');
ok(E.adrNrPasst('4', '47') === false, '4 ist nicht 47 (kein Ziffern-Praefix)');
ok(E.adrNrPasst('48', '47-49') === true, '48 liegt im Bereich 47-49');
ok(E.adrNrPasst('50', '47-49') === false, '50 liegt ausserhalb');
ok(E.adrNrPasst('47', '') === false, 'Ergebnis ohne Nummer passt nicht zu einer getippten Nummer');
ok(E.adrNrPasst('', '47') === true, 'ohne getippte Nummer wird nicht gefiltert');

console.log('■ A4 — Der Fall aus dem Feedback');
{
  const liste = [
    adr('Musterweg 47', 4051, 'Basel'),
    adr('Pfirtergasse 4', 4054, 'Basel'),
    adr('Pfirterweg 47', 4123, 'Allschwil'),
    adr('Pfirtergasse 47', 4054, 'Basel'),
    adr('Alte Pfirtergasse 47', 4123, 'Allschwil'),
    adr('Pfirtergasse 47a', 4054, 'Basel')
  ];
  const teil = E.adrZerlege('pfirterg 47');
  const erg = E.adrFiltere(liste, teil);
  const namen = erg.treffer.map(t => t.strasse);
  ok(namen.length === 3, 'genau drei Treffer (47, 47a, Alte …47)');
  ok(!namen.includes('Musterweg 47'), 'fremde Strasse mit Nr. 47 faellt weg');
  ok(!namen.includes('Pfirterweg 47'), 'aehnliche, aber andere Strasse faellt weg');
  ok(!namen.includes('Pfirtergasse 4'), 'gleiche Strasse mit falscher Nummer faellt weg');
  ok(namen[0] === 'Pfirtergasse 47', 'exakter Treffer steht zuoberst');
  ok(namen.indexOf('Pfirtergasse 47a') < namen.indexOf('Alte Pfirtergasse 47'),
     'gleiche Strasse mit Zusatz-Buchstabe vor der nur enthaltenen Strasse');
  ok(!erg.hinweis, 'kein Hinweis noetig, wenn Treffer da sind');
}

console.log('■ A5 — Nichts faellt still weg');
{
  const liste = [adr('Pfirtergasse 4', 4054, 'Basel'), adr('Pfirtergasse 5', 4054, 'Basel')];
  const erg = E.adrFiltere(liste, E.adrZerlege('pfirterg 999'));
  ok(erg.treffer.length === 2, 'ohne Nummern-Treffer werden die uebrigen trotzdem gezeigt');
  ok(/999/.test(erg.hinweis), 'Hinweis nennt die fehlende Nummer');
}
{
  const viele = [];
  for (let i = 1; i <= 20; i++) viele.push(adr('Pfirtergasse ' + i, 4054, 'Basel'));
  const erg = E.adrFiltere(viele, E.adrZerlege('pfirtergasse'));
  ok(erg.treffer.length === E.ADR_ANZEIGE, 'Anzeige gedeckelt');
  ok(erg.gekappt === 20 - E.ADR_ANZEIGE, 'die nicht gezeigten werden gezaehlt (kein stiller Deckel)');
}
{
  // Blosser Suchbegriff (kein Nr/PLZ/Ort): nur sortieren, nicht filtern —
  // «basel» ist ein Ort, kein Strassenname.
  const liste = [adr('Bahnhofstrasse 1', 4051, 'Basel'), adr('Freie Strasse 2', 4051, 'Basel')];
  const erg = E.adrFiltere(liste, E.adrZerlege('basel'));
  ok(erg.treffer.length === 2, 'blosser Suchbegriff filtert die Strassen nicht weg');
  ok(!erg.hinweis, 'und meldet dabei keinen Hinweis (es wurde nichts entfernt)');
}

console.log('■ A6 — Umlaute, Punkte, Abkuerzungen');
{
  const liste = [adr('St. Gallerstrasse 5', 9000, 'St. Gallen'), adr('Bläsiring 153', 4057, 'Basel')];
  ok(E.adrFiltere(liste, E.adrZerlege('st gallerstr 5')).treffer.length === 1, 'Punkte/Leerzeichen egal, «str» trifft «strasse»');
  ok(E.adrFiltere(liste, E.adrZerlege('blaesiring')).treffer.length === 2, 'ae/ä unterscheiden sich nicht (kein Filter-Treffer → alle bleiben)');
  ok(E.adrPasst(liste[1], E.adrZerlege('blasiring 153')), 'Bläsiring wird ohne Umlaut gefunden');
}

console.log('■ A7 — Suchtexte an swisstopo');
{
  const qs = E.adrQueries(E.adrZerlege('pfirterg 47'));
  ok(qs.length === 2, 'zwei Suchtexte');
  ok(qs[0] === 'pfirterg 47', 'erst die Eingabe wie getippt');
  ok(qs[1] === 'pfirterg', 'dann NUR das Strassen-Fragment (Praefix-Suche des Backends)');
  ok(E.adrQueries(E.adrZerlege('pfirtergasse')).length === 1, 'ohne Zusatz nur EINE Abfrage');
}
{
  const rows = [adr('Pfirtergasse 12', 4054, 'Basel'), adr('Pfirtergasse 13', 4054, 'Basel'), adr('Musterweg 3', 4051, 'Basel')];
  const nach = E.adrNachfragen(rows, E.adrZerlege('pfirterg 47'));
  ok(nach.length === 1, 'eine gezielte Nachfrage');
  ok(nach[0] === 'Pfirtergasse 47 4054', 'voller Strassenname + gesuchte Nummer + PLZ');
  ok(E.adrNachfragen(rows, E.adrZerlege('pfirterg')).length === 0, 'ohne Hausnummer keine Nachfrage');
  ok(nach.length <= E.ADR_NACHFRAGEN, 'Nachfragen gedeckelt');
}

console.log('■ A8 — Aufbau');
ok(E.ADR_LIMIT >= 20, 'es werden mehr Zeilen angefragt als angezeigt (Filter braucht Material)');
{
  const ohneKommentar = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/\b(document|window|fetch|localStorage)\b/.test(ohneKommentar), 'ENGINE-Block ist DOM- und netzfrei');
}
ok(/GemaAdresse\s*=\s*\{[\s\S]*suche:\s*_suche/.test(SRC), 'GemaAdresse.suche ist exportiert (Module mit eigenem Dropdown)');
ok(/zerlege:\s*adrZerlege/.test(SRC) && /filtere:\s*adrFiltere/.test(SRC), 'Engine ist exportiert');
{
  const po = readFileSync(join(ROOT, 'pm_objekte.html'), 'utf8');
  ok(/GemaAdresse\.suche/.test(po), 'pm_objekte (Beteiligten-Dialog) nutzt dieselbe Suche');
  ok(/adr-hint/.test(po), 'pm_objekte kann den Hinweis anzeigen');
  ok(po.indexOf('GemaAdresse.suche') < po.indexOf('SearchServer'),
     'die eigene Abfrage in pm_objekte ist nur noch der Rueckfall danach');
  const css = readFileSync(join(ROOT, 'gema_responsive.css'), 'utf8');
  ok(/\.gema-adr-hint\{/.test(css), 'Hinweis-Zeile ist gestylt');
}

console.log('■ A9 — Kein Adressfeld bleibt zurueck (Sweep uebers Repo)');
{
  const { execSync } = await import('child_process');
  const liste = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).split('\n').map(s => s.trim()).filter(Boolean);

  // Jede Seite, die ein Adressfeld anbindet, muss den Helfer auch laden.
  const nutzer = liste("grep -rl 'GemaAdresse\\.attach\\|data-gema-adresse' --include=*.html . || true");
  const ohne = nutzer.filter(f => !readFileSync(join(ROOT, f), 'utf8').includes('src="gema_adresse.js"'));
  ok(ohne.length === 0, 'alle Seiten mit Adressfeld laden gema_adresse.js' + (ohne.length ? ' — fehlt: ' + ohne.join(', ') : ''));

  // gema_hoehe.js bindet selbst an — seine Seiten brauchen den Helfer ebenfalls.
  const hoehe = liste("grep -rl 'src=\"gema_hoehe.js\"' --include=*.html . || true");
  const hOhne = hoehe.filter(f => !readFileSync(join(ROOT, f), 'utf8').includes('src="gema_adresse.js"'));
  ok(hoehe.length > 0 && hOhne.length === 0, 'auch die Hoehen-Module (gema_hoehe.js) laden ihn' + (hOhne.length ? ' — fehlt: ' + hOhne.join(', ') : ''));

  // Es darf keine dritte, eigene Adress-Suche geben. Erlaubt sind nur der
  // Helfer, der Rueckfall in pm_objekte und die beiden programmatischen
  // Geocoder (die loesen EINE fertige Adresse auf, sie schlagen nichts vor).
  const erlaubt = ['./gema_adresse.js', './gema_hoehe.js', './sb_niederschlag.html', './pm_objekte.html'];
  const sucher = liste("grep -rl 'SearchServer' --include=*.html --include=*.js . | grep -v '^./scripts/' || true");
  const fremd = sucher.filter(f => erlaubt.indexOf(f) < 0);
  ok(fremd.length === 0, 'keine zweite Adress-Suche im Repo' + (fremd.length ? ' — ' + fremd.join(', ') : ''));
}

// ─────────────────────────────────────────────────────────────
// Teil B — im Browser, gegen einen nachgebauten Typeahead-Backend
// ─────────────────────────────────────────────────────────────
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch (e) { /* optional */ }
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!chromium) {
  console.log('\n■ Teil B uebersprungen — playwright-core nicht gefunden (Teil A lief vollstaendig)');
} else {
  const { startServer, BASE, seed, newPage } = await import('./rolematrix_harness.mjs');

  // Adressbestand: 60× Pfirtergasse (die 47 liegt WEIT hinten) + Koeder
  const BESTAND = [];
  for (let i = 1; i <= 60; i++) BESTAND.push({ str: 'Pfirtergasse ' + i, plz: 4054, ort: 'Basel' });
  BESTAND.push({ str: 'Pfirterweg 47', plz: 4123, ort: 'Allschwil' });
  BESTAND.push({ str: 'Musterweg 47', plz: 4051, ort: 'Basel' });
  BESTAND.push({ str: 'Bahnhofstrasse 47', plz: 8001, ort: 'Zürich' });

  // Typeahead-Verhalten: alle Woerter muessen treffen, das LETZTE als Praefix.
  function backend(text, limit) {
    const toks = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    return BESTAND.filter(a => {
      const worte = (a.str + ' ' + a.plz + ' ' + a.ort).toLowerCase().split(/\s+/);
      return toks.every((t, i) => worte.some(w => (i === toks.length - 1 ? w.startsWith(t) : w === t)));
    }).slice(0, limit);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const _seed = seed(['role_planer']);
  _seed['gema_coachmarks_done_pm_objekte'] = '1';
  const { ctx, page } = await newPage(browser, _seed);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const anfragen = [];
  await page.route('**/api3.geo.admin.ch/**', route => {
    const u = new URL(route.request().url());
    const text = u.searchParams.get('searchText') || '';
    const limit = parseInt(u.searchParams.get('limit') || '8', 10);
    anfragen.push({ text, limit });
    const rows = backend(text, limit).map(a => ({
      attrs: { label: a.str + ' <b>' + a.plz + ' ' + a.ort + '</b>', plz: a.plz, gemeindename: a.ort, kanton: 'BS' }
    }));
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: rows }) });
  });

  await page.goto(BASE + '/pm_objekte.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof GemaAdresse !== 'undefined' && typeof GemaAdresse.suche === 'function', null, { timeout: 12000 });

  console.log('\n■ B1 — Ursache: die Eingabe allein findet nichts');
  {
    const direkt = await page.evaluate(async () => {
      const r = await fetch('https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=' + encodeURIComponent('pfirterg 47') + '&limit=30');
      return (await r.json()).results.length;
    });
    ok(direkt === 0, '«pfirterg 47» liefert beim Backend 0 Zeilen (Fragment ist kein ganzes Wort)');
  }

  console.log('■ B2 — Die Suche findet die Adresse trotzdem');
  anfragen.length = 0;
  {
    const erg = await page.evaluate(() => GemaAdresse.suche('pfirterg 47'));
    ok(erg.treffer.length === 1, 'genau ein Vorschlag');
    ok(erg.treffer[0].strasse === 'Pfirtergasse 47', 'und zwar die Pfirtergasse 47');
    ok(erg.treffer[0].plz === '4054' && erg.treffer[0].ort === 'Basel', 'mit PLZ und Ort');
    ok(!erg.hinweis, 'ohne Hinweis (es wurde nichts vermisst)');
    const texte = anfragen.map(a => a.text);
    ok(texte.includes('pfirterg 47'), 'Runde 1: die Eingabe wie getippt');
    ok(texte.includes('pfirterg'), 'Runde 1: zusaetzlich nur das Fragment');
    ok(texte.some(t => /^Pfirtergasse 47/.test(t)), 'Runde 2: gezielte Nachfrage mit dem vollen Strassennamen');
    ok(anfragen.every(a => a.limit >= 20), 'es werden mehr Zeilen angefragt als angezeigt');
  }

  console.log('■ B3 — Koeder werden nicht vorgeschlagen');
  {
    const erg = await page.evaluate(() => GemaAdresse.suche('pfirterg 47'));
    const namen = erg.treffer.map(t => t.strasse);
    ok(!namen.includes('Musterweg 47'), 'fremde Strasse mit Nr. 47 nicht dabei');
    ok(!namen.includes('Bahnhofstrasse 47'), 'Bahnhofstrasse 47 nicht dabei');
    ok(!namen.includes('Pfirterweg 47'), 'Pfirterweg 47 nicht dabei');
  }

  console.log('■ B4 — Vollstaendige Eingabe braucht keine Nachfrage');
  anfragen.length = 0;
  {
    const erg = await page.evaluate(() => GemaAdresse.suche('Pfirtergasse 47, 4054 Basel'));
    ok(erg.treffer.length === 1 && erg.treffer[0].strasse === 'Pfirtergasse 47', 'Treffer direkt');
    ok(!anfragen.some(a => /^Pfirtergasse 47 4054$/.test(a.text)), 'keine zusaetzliche Nachfrage abgesetzt');
  }

  console.log('■ B5 — Fehlende Nummer wird gemeldet, nicht verschwiegen');
  {
    const erg = await page.evaluate(() => GemaAdresse.suche('pfirterg 999'));
    ok(erg.treffer.length > 0, 'die uebrigen Adressen der Strasse bleiben sichtbar');
    ok(/999/.test(erg.hinweis || ''), 'Hinweis nennt die fehlende Nummer');
  }

  console.log('■ B6 — Dropdown im Objekt-Dialog (geteilter Helfer)');
  await page.evaluate(() => { openObjektModal(); document.getElementById('objName').value = 'Testprojekt'; _objWzGo(2); });
  await page.waitForTimeout(300);
  await page.click('#objStrasse');
  await page.type('#objStrasse', 'pfirterg 47', { delay: 10 });
  await page.waitForSelector('#objModal .gema-adr-drop.open .gema-adr-item', { timeout: 8000 });
  {
    const items = await page.$$eval('#objModal .gema-adr-drop .gema-adr-item', els => els.map(e => e.textContent));
    ok(items.length === 1, 'genau ein Vorschlag im Dropdown');
    ok(/Pfirtergasse 47/.test(items[0]) && /4054 Basel/.test(items[0]), 'Vorschlag zeigt die gesuchte Adresse');
  }
  await page.$eval('#objModal .gema-adr-drop .gema-adr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await page.waitForTimeout(150);
  {
    const v = await page.evaluate(() => ({
      str: document.getElementById('objStrasse').value,
      plz: document.getElementById('objPlz').value,
      ort: document.getElementById('objOrt').value
    }));
    ok(v.str === 'Pfirtergasse 47', 'Strasse + Nr im Strassen-Feld');
    ok(v.plz === '4054' && v.ort === 'Basel', 'PLZ und Ort in ihren eigenen Feldern');
  }

  console.log('■ B7 — Beteiligten-Dialog (modul-eigenes Dropdown, gleiche Suche)');
  await page.evaluate(() => closeModal('objModal'));
  await page.waitForTimeout(200);
  await page.evaluate(() => openBetModal());
  await page.waitForTimeout(300);
  {
    const da = await page.evaluate(() => !!document.getElementById('betAdrSearch'));
    ok(da, 'Beteiligten-Dialog offen');
  }
  await page.click('#betAdrSearch');
  await page.type('#betAdrSearch', 'pfirterg 47', { delay: 10 });
  await page.waitForSelector('#betAdrDrop.open .adr-item', { timeout: 8000 });
  {
    const items = await page.$$eval('#betAdrDrop .adr-item', els => els.map(e => e.textContent));
    ok(items.length === 1 && /Pfirtergasse 47/.test(items[0]), 'derselbe eine Vorschlag wie im Objekt-Dialog');
  }

  console.log('■ B8 — Keine Skriptfehler');
  ok(errors.length === 0, 'keine pageerrors' + (errors.length ? ' — ' + errors[0] : ''));

  await ctx.close();
  await browser.close();
  await server.close();
}

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
