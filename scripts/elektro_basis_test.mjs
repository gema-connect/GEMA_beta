/* ════════════════════════════════════════════════════════════════════════
   GEMA — Drift-Guard der Elektro-Basis
   ════════════════════════════════════════════════════════════════════════
   Sichert die GEMEINSAME Grundlage aller el_-Module ab, damit sechs parallel
   entwickelte Berechnungen nicht auseinanderlaufen:

     Teil A — gema_elektro.js als reine Fachlogik (Node, ohne Browser):
              κ(t), Querschnittsreihe, Netzsysteme, Zahlen-Helfer.
     Teil B — Registrierung jedes Moduls in ALLEN geteilten Dateien
              (statisch, ohne Browser) — hier failt es, wenn ein Modul
              angelegt, aber irgendwo nicht eingetragen wurde.
     Teil C — Boot jeder Seite im Browser: keine pageerrors, Aufbau nach
              Kanon, Fold-Mechanik, Zugriffsschutz.

   AUSFÜHREN
     node scripts/elektro_basis_test.mjs                  # A + B
     CHROME=/opt/pw-browsers/chromium node scripts/elektro_basis_test.mjs
                                                          # A + B + C

   Ohne playwright-core/Chromium wird Teil C mit Hinweis ÜBERSPRUNGEN —
   nie stillschweigend weggelassen.

   Dieser Test gehört ALLEN Elektro-Modulen. Ein einzelnes Modul bringt
   seinen eigenen Engine-/Smoke-Test mit (<modul>_engine_test.mjs) und
   ändert diese Datei NICHT — ausser beim Eintragen eines NEUEN Moduls
   in MODULE unten.
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

/* Kanon: Datei ⇄ Modul-Key ⇄ AutoSave-Name. Bei einem NEUEN el_-Modul
   hier ergänzen — der Test deckt danach automatisch alle Registrierungen ab. */
const MODULE = [
  { datei: 'el_spannungsfall',   key: 'spannungsfall',   praefix: 'sf' },
  { datei: 'el_belastbarkeit',   key: 'belastbarkeit',   praefix: 'bl' },
  { datei: 'el_kurzschluss',     key: 'kurzschluss',     praefix: 'kz' },
  { datei: 'el_leistungsbedarf', key: 'leistungsbedarf', praefix: 'lb' },
  { datei: 'el_beleuchtung',     key: 'beleuchtung',     praefix: 'bt' },
  { datei: 'el_photovoltaik',    key: 'photovoltaik',    praefix: 'pv' }
];

/* ══ TEIL A — gema_elektro.js (DOM-frei) ═══════════════════════════════ */
console.log('── Teil A: Fachbasis gema_elektro.js ──');
const elSrc = readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8');
const w = {};
new Function('window', elSrc)(w);
const E = w.GemaElektro;
ok(!!E, 'gema_elektro.js exportiert window.GemaElektro');

/* κ bei 20 °C = Katalogwert */
ok(Math.abs(E.elKappa('cu', 20) - 56) < 1e-9, 'κ Cu bei 20 °C = 56');
ok(Math.abs(E.elKappa('cu58', 20) - 58) < 1e-9, 'κ Cu-rein bei 20 °C = 58');
ok(Math.abs(E.elKappa('al', 20) - 36) < 1e-9, 'κ Al bei 20 °C = 36');

/* κ sinkt mit der Temperatur — gegen unabhängig gerechnete Werte:
   56 / (1 + 0.00393 · 50) = 46.799…  ·  36 / (1 + 0.00403 · 50) = 30.0…  */
ok(Math.abs(E.elKappa('cu', 70) - 56 / (1 + 0.00393 * 50)) < 1e-9, 'κ Cu bei 70 °C korrekt');
ok(E.elKappa('cu', 70) < E.elKappa('cu', 20), 'κ sinkt mit steigender Temperatur');
ok(Math.abs(E.elKappa('cu', 70) - 46.8) < 0.05, 'κ Cu bei 70 °C ≈ 46.8 (rund 20 % unter κ₂₀)');
ok(Math.abs(E.elKappa('al', 90) - 36 / (1 + 0.00403 * 70)) < 1e-9, 'κ Al bei 90 °C korrekt');
/* Unbekanntes Material fällt auf den ersten Katalogeintrag zurück, statt NaN */
ok(E.elKappa('gibtsnicht', 20) === 56, 'unbekanntes Material → Fallback Cu (kein NaN)');
ok(isFinite(E.elKappa('cu', undefined)), 'fehlende Temperatur → endlicher Wert');

/* Querschnittsreihe */
ok(E.EL_QUERSCHNITTE[0] === 1.5, 'Querschnittsreihe beginnt bei 1.5 mm²');
ok(E.elNaechsterQuerschnitt(3.98) === 4, 'nächster Querschnitt zu 3.98 → 4 mm²');
ok(E.elNaechsterQuerschnitt(4) === 4, 'exakter Treffer bleibt 4 mm²');
ok(E.elNaechsterQuerschnitt(4.01) === 6, '4.01 → 6 mm²');
ok(E.elNaechsterQuerschnitt(700) === null, 'über der Reihe → null (KEIN stiller Deckel)');
ok(E.elNaechsterQuerschnitt(0) === null && E.elNaechsterQuerschnitt(-5) === null,
   'nicht-positiver Bedarf → null');
ok(E.elNaechsteSicherung(14) === 16, 'nächste Sicherung zu 14 A → 16 A');
ok(E.elNaechsteSicherung(1000) === null, 'Sicherung über der Reihe → null');

/* Netzsysteme */
const s1 = E.elSystem('1p230'), s3 = E.elSystem('3p400');
ok(s1.u === 230 && s1.fU === 2 && s1.fP === 2, 'einphasig: 230 V, fU 2, fP 2');
ok(s3.u === 400 && Math.abs(s3.fU - Math.sqrt(3)) < 1e-12 && s3.fP === 3,
   'dreiphasig: 400 V, fU √3, fP 3');

/* Gegenprobe der Faktoren an einer bekannten Auslegung:
   400 V / 2.5 mm² / 16 A / 100 m / κ 58 → ΔU 19.11 V, P 529.7 W,
   und P muss gleich 3·I²·R mit R = L/(κ·A) sein. */
{
  const k = 58, A = 2.5, I = 16, L = 100;
  const dU = s3.fU * I * L / (k * A);
  const P = s3.fP * I * I * L / (k * A);
  const R = L / (k * A);
  ok(Math.abs(dU - 19.112) < 0.01, 'Referenz 400 V: ΔU ≈ 19.11 V');
  ok(Math.abs(P - 529.66) < 0.05, 'Referenz 400 V: P ≈ 529.7 W');
  ok(Math.abs(P - 3 * I * I * R) < 1e-9, 'P = 3·I²·R — Faktoren fU/fP konsistent');
}

/* Zahlen-Helfer: Komma und Apostroph dürfen die Rechnung nie zerschiessen */
ok(E.elNum('1’234.5') === 1234.5, 'elNum: Tausender-Apostroph');
ok(E.elNum('0,5') === 0.5, 'elNum: Komma als Dezimaltrennzeichen');
ok(E.elNum('') === 0 && E.elNum(null) === 0 && E.elNum('abc') === 0, 'elNum: leer/ungültig → 0');
ok(E.elFmt(1234.567, 2) === '1’234.57', 'elFmt: 2 Stellen + Apostroph');
ok(E.elFmt(NaN) === '—', 'elFmt: NaN → Gedankenstrich');
ok(E.elRunden(2.005, 2) === 2.01, 'elRunden: kaufmännisch ohne Float-Artefakt');

console.log(`Teil A: ${pass} ok, ${fail} Fehler`);

/* ══ TEIL B — Registrierung in den geteilten Dateien ═══════════════════ */
console.log('\n── Teil B: Registrierung ──');
const auth   = readFileSync(join(ROOT, 'gema_auth.js'), 'utf8');
const idx    = readFileSync(join(ROOT, 'index.html'), 'utf8');
const hub    = readFileSync(join(ROOT, 'el_index.html'), 'utf8');
const sw     = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const recent = readFileSync(join(ROOT, 'gema_recent.js'), 'utf8');
const wsp    = readFileSync(join(ROOT, 'sys_workspace.html'), 'utf8');

ok(existsSync(join(ROOT, 'el_base.css')), 'el_base.css existiert');
ok(existsSync(join(ROOT, 'gema_elektro.js')), 'gema_elektro.js existiert');
ok(sw.indexOf("'/el_base.css'") >= 0 && sw.indexOf("'/gema_elektro.js'") >= 0,
   'sw.js cached el_base.css + gema_elektro.js');
ok(sw.indexOf("'/el_index.html'") >= 0, 'sw.js cached el_index.html');
ok(auth.indexOf("cat:'Elektroberechnungen'") >= 0, 'gema_auth kennt die Kategorie Elektroberechnungen');
ok(wsp.indexOf("{id:'elektro',") >= 0, 'sys_workspace: MODULE_CATS-Eintrag elektro');
ok(/zap:'<path/.test(wsp), 'sys_workspace: Icon «zap» vorhanden');

for (const m of MODULE) {
  const f = m.datei + '.html';
  const p = join(ROOT, f);
  if (!existsSync(p)) { ok(false, f + ' fehlt'); continue; }
  const src = readFileSync(p, 'utf8');

  /* Registrierung */
  ok(auth.indexOf("'" + m.datei + "':'" + m.key + "'") >= 0, f + ': in FILE_MAP');
  ok(new RegExp("key:'" + m.key + "'").test(auth), f + ': in MODULES');
  ok(sw.indexOf("'/" + f + "'") >= 0, f + ': in sw.js');
  ok(new RegExp("'" + m.datei + "':").test(recent), f + ': in gema_recent PAGE_LABELS');
  ok(wsp.indexOf("id:'" + m.datei + "'") >= 0, f + ': im Workspace-Katalog');
  ok(wsp.indexOf(m.datei + ':{data:') >= 0, f + ': in _WS_STATUS_CFG');
  ok(idx.indexOf('data-module="' + m.key + '"') >= 0, f + ': Kachel auf index.html');
  ok(hub.indexOf(f) >= 0, f + ': Kachel auf el_index.html');

  /* Aufbau nach Kanon */
  ok(src.indexOf('el_base.css') >= 0, f + ': bindet el_base.css ein');
  ok(src.indexOf('gema_elektro.js') >= 0, f + ': bindet gema_elektro.js ein');
  ok(src.indexOf('gema_responsive.css') > src.indexOf('el_base.css'),
     f + ': gema_responsive.css NACH el_base.css (Cascade)');
  ok(src.indexOf('/*ENGINE-START*/') >= 0 && src.indexOf('/*ENGINE-END*/') >= 0,
     f + ': ENGINE-Block vorhanden');
  ok(src.indexOf('metaObjektDropdown') >= 0, f + ': Objekt-Bezug in der Projekt-Leiste');
  ok(new RegExp("GemaAutoSave\\.init\\('" + m.key + "'").test(src), f + ': AutoSave auf «' + m.key + '»');
  ok(src.indexOf('el_index.html') >= 0, f + ': Breadcrumb zeigt auf den Hub');

  /* Inputs: type="number" ist in GEMA verboten */
  /* Nur echte Felder prüfen — im Kommentar steht der Merksatz «NIE type="number"». */
  ok(!/<input[^>]*type="number"/.test(src), f + ': kein type="number" an einem Feld');
  const zahlfelder = src.match(/inputmode="decimal"/g) || [];
  if (zahlfelder.length) {
    ok(/onblur="fixLeadingZero\(this\)"/.test(src), f + ': Zahlenfelder mit fixLeadingZero');
  }
  /* Fold-Zustand gehört NIE in den AutoSave-Snapshot */
  ok(src.indexOf('gema_el_fold_v1') >= 0, f + ': Fold-Zustand in gema_el_fold_v1 (Geräte-UI)');
  /* Ohne gewähltes Objekt macht GemaAutoSave KEINEN Initial-Restore — ohne
     Snapshot-Fallback wären die Eingaben nach einem Reload weg. */
  ok(new RegExp(m.praefix + 'SnapshotLoad').test(src), f + ': Snapshot-Fallback vorhanden');
  ok(/isTrusted/.test(src), f + ': Snapshot-Fallback respektiert echte Eingaben (isTrusted)');
  /* Namensraum: jedes Modul hat seinen eigenen Präfix */
  ok(new RegExp('function ' + m.praefix + 'Calc\\(').test(src), f + ': Engine-Funktion ' + m.praefix + 'Calc');
}
console.log(`Teil A+B: ${pass} ok, ${fail} Fehler`);

/* ══ TEIL C — Boot im Browser ═════════════════════════════════════════ */
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let pw = null;
try { pw = await import('playwright-core'); }
catch { console.log('\n⚠ Teil C ÜBERSPRUNGEN — playwright-core fehlt (npm i --no-save playwright-core).'); }

if (pw) {
  console.log('\n── Teil C: Boot im Browser ──');
  const { startServer, wireRoutes, seed, BASE } = await import('./rolematrix_harness.mjs');
  const server = await startServer();
  const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

  async function seite(datei, roleIds) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await wireRoutes(ctx);
    const st = seed(roleIds);
    await ctx.addInitScript(s => {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, st);
    const page = await ctx.newPage();
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e)));
    await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    return { page, ctx, fehler };
  }

  /* Hub — mit role_admin geprüft: el_index steht (wie sb_index/ab_index) in
     _isLoginOnly, und der Rollen-Redirect schickt Rollen mit eigener Landing-
     Page von JEDER Hub-Seite dorthin. Das ist bestehendes Verhalten und wird
     unten ausdrücklich mitgeprüft, statt es zu umgehen. */
  {
    const { page, ctx, fehler } = await seite('el_index.html', ['role_admin']);
    ok(fehler.length === 0, 'el_index: keine pageerrors — ' + fehler.join(' | '));
    ok(await page.locator('.mod').count() === 7, 'el_index: 7 Modul-Kacheln');
    const dreier = await page.$$eval('.mod .mod-pts', ls => ls.every(l => l.children.length === 3));
    ok(dreier, 'el_index: jede Kachel hat GENAU 3 Stichpunkte (Kachel-Kanon)');
    await page.fill('#searchInp', 'kurzschluss');
    await page.waitForTimeout(150);
    ok(await page.locator('#searchResults .sr-item').count() >= 1, 'el_index: Suche findet «Kurzschluss»');
    await ctx.close();
  }

  /* Jedes Modul */
  for (const m of MODULE) {
    const f = m.datei + '.html';
    const { page, ctx, fehler } = await seite(f, ['role_elektro_planer']);
    ok(fehler.length === 0, f + ': keine pageerrors — ' + fehler.join(' | '));
    ok(await page.locator('.gema-hero-title').count() === 1, f + ': Hero vorhanden');
    ok(await page.locator('#metaObjektDropdown').count() === 1, f + ': Objekt-Auswahl vorhanden');
    ok(await page.locator('.el-card').count() >= 3, f + ': mind. 3 Schritt-Karten');

    /* Fachbasis ist geladen und liefert Werte */
    const kappa = await page.evaluate(() => window.GemaElektro && window.GemaElektro.elKappa('cu', 70));
    ok(kappa > 46 && kappa < 47, f + ': GemaElektro im Modul verfügbar (κ 70 °C)');

    /* Fold: zuklappen persistiert, Print zeigt trotzdem alles (CSS-Kanon) */
    await page.locator('.el-card .el-card-hd').first().click();
    await page.waitForTimeout(120);
    ok(await page.locator('.el-card.zu').count() === 1, f + ': Karte klappt zu');
    const gespeichert = await page.evaluate(() => localStorage.getItem('gema_el_fold_v1'));
    ok(!!gespeichert && gespeichert.indexOf(m.datei) >= 0, f + ': Fold-Zustand gespeichert');
    const imSnapshot = await page.evaluate(k => {
      const s = localStorage.getItem('gema_' + k);
      return s ? s.indexOf('fold') >= 0 : false;
    }, m.key);
    ok(!imSnapshot, f + ': Fold-Zustand NICHT im AutoSave-Snapshot');
    await ctx.close();
  }

  /* Zugriffsschutz: eine Rolle ohne Elektro-Recht sieht «Kein Zugriff» */
  {
    const { page, ctx } = await seite('el_spannungsfall.html', ['role_monteur']);
    const txt = await page.textContent('body');
    ok(/Kein Zugriff/i.test(txt || ''), 'Monteur: «Kein Zugriff» auf el_spannungsfall');
    await ctx.close();
  }

  /* Der Elektroplaner erreicht die MODULE direkt (das ist der Arbeitsweg);
     der Hub unterliegt wie jede Login-only-Seite dem Rollen-Redirect. */
  {
    const { page, ctx, fehler } = await seite('el_spannungsfall.html', ['role_elektro_planer']);
    ok(fehler.length === 0, 'Elektroplaner: el_spannungsfall lädt ohne Fehler');
    ok(await page.locator('#metaObjektDropdown').count() === 1,
       'Elektroplaner: voller Zugriff auf das Modul');
    await ctx.close();
  }
  {
    const { page, ctx } = await seite('el_index.html', ['role_elektro_planer']);
    ok(/sys_workspace\.html$/.test(page.url()),
       'Hub el_index: Rollen-Redirect auf die Landing-Page (wie sb_index) — ' + page.url());
    await ctx.close();
  }

  await browser.close();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
