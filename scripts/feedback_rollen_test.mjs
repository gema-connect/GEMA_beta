// Drift-Guard: Rollen des Absenders am Feedback (Feedback 06.08.2026)
//
// «beim feedback soll auch immer die rollen des aktuellen nutzers
//  mitgegeben werden, sodass claude code dies im kontext beurteilen kann»
//
// Drei Regeln, die hier festgehalten werden:
//  1. ERFASST WIRD BEIM ABSENDEN (gema_feedback.js), nicht beim Export —
//     Rollen ändern sich, das Feedback gehört zu den damaligen.
//  2. Quelle ist IMMER die Sitzung, nie das frei überschreibbare
//     Autor-Textfeld.
//  3. Rein ADDITIV: ein Alt-Eintrag ohne `rollen` bleibt unverändert und
//     wird im Board/Export als «nicht erfasst» AUSGEWIESEN — eine fehlende
//     Angabe darf nie wie «keine Rollen» aussehen.
//
// Aufruf: CHROME=<chromium> node scripts/feedback_rollen_test.mjs
import { chromium } from 'playwright-core';
import { startServer, wireRoutes, seed, BASE, newPage } from './rolematrix_harness.mjs';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
};

/* ═══ A — statisch ═══════════════════════════════════════════════════════ */
console.log('■ A: Verdrahtung');
const FB = readFileSync('gema_feedback.js', 'utf8');
ok('_rollenKontext existiert', /function _rollenKontext\(\)/.test(FB));
ok('liest die Rollen aus der SITZUNG (GemaAuth), nicht aus dem Autor-Feld',
  /_rollenKontext[\s\S]{0,900}GemaAuth\.getCurrentUser/.test(FB) &&
  /_rollenKontext[\s\S]{0,900}GemaAuth\.getRoles/.test(FB));
ok('Rolle behält ihre ID auch ohne auflösbaren Namen',
  /\{ id: id, name: \(r && r\.name\) \|\| '' \}/.test(FB));
ok('nicht eingeloggt → null (nichts behaupten)',
  /if \(!user\) return null;/.test(FB));
ok('orgAdmin wird mitgegeben (keine roleId, wirkt aber wie eine Rolle)',
  /GemaAuth\.isOrgAdmin/.test(FB) && /k\.orgAdmin/.test(FB));
ok('Erfassung beim ABSENDEN (in submit, auf den entry gestempelt)',
  /var kontext = _rollenKontext\(\);[\s\S]{0,320}entry\.rollen = kontext\.rollen/.test(FB));
ok('additiv: nur gesetzte Felder werden geschrieben',
  /if \(kontext\.orgAdmin\) entry\.orgAdmin = true;/.test(FB));
ok('Test-Hook exportiert', /rollenKontext: _rollenKontext/.test(FB));

const BETA = readFileSync('sys_beta.html', 'utf8');
ok('EIN Formatter für Board + Export (fbRollenText/fbRollenListe)',
  /const fbRollenListe = /.test(BETA) && /const fbRollenText = /.test(BETA));
ok('fehlende Angabe = null (nicht «keine Rollen»)',
  /if \(!c \|\| !Array\.isArray\(c\.rollen\)\) return null;/.test(BETA));
ok('eingeloggt ohne Rolle wird als solches benannt',
  /keine Rolle zugewiesen/.test(BETA));
ok('Board-Karte zeigt die Rollen', /class="fb-rollen"/.test(BETA) && /\.fb-rollen\{/.test(BETA));
ok('Export nennt die Rollen des Absenders',
  /\*\*Rollen des Absenders:\*\*/.test(BETA));
ok('Export weist eine fehlende Angabe AUS statt sie zu verschweigen',
  /nicht erfasst \(vor der Rollen-Erfassung/.test(BETA));

/* ═══ B — Browser ════════════════════════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const ROLLEN = [
  { id: 'role_planer', name: 'Sanitärplaner' },
  { id: 'role_magaziner', name: 'Magaziner' }
];

/* B1 — Absenden stempelt die Rollen auf den Eintrag */
console.log('■ B1: Absenden erfasst die Rollen');
let gespeichert = null;
{
  const s = seed(['role_planer', 'role_magaziner'], { roles: ROLLEN });
  s.gema_orgs_v1[0].name = 'Testfirma AG';
  s.gema_orgs_v1[0].admins = ['u_test'];          // Org-Admin
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/sb_druckverlust.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.GemaFeedback !== 'undefined', null, { timeout: 15000 });

  const res = await page.evaluate(async () => {
    // Speicherweg abfangen statt die Cloud zu raten
    window.__fb = null;
    if (typeof _GemaDB !== 'undefined') {
      _GemaDB.loadFromModule = async () => [];
      _GemaDB.saveToModule = async (mk, dk, arr) => { window.__fb = { mk, dk, arr }; return true; };
    }
    GemaFeedback.init('drift_test', 'Drift-Test');
    GemaFeedback.start();
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('gfb-text').value = 'Testmeldung mit Rollen';
    // Autor bewusst UMBENENNEN: die Rollen müssen trotzdem aus der Sitzung kommen
    document.getElementById('gfb-author').value = 'Ein ganz anderer Name';
    await GemaFeedback.submit();
    await new Promise(r => setTimeout(r, 300));
    return { fb: window.__fb, kontext: window._gfbHooks.rollenKontext() };
  });
  gespeichert = res.fb && res.fb.arr && res.fb.arr[0];
  ok('Eintrag wurde gespeichert', !!gespeichert, res.fb && res.fb.dk);
  ok('rollen mit ID UND Name am Eintrag',
    gespeichert && JSON.stringify(gespeichert.rollen) === JSON.stringify(ROLLEN), gespeichert && gespeichert.rollen);
  ok('Rollen kommen aus der SITZUNG, nicht aus dem geänderten Autor-Feld',
    gespeichert && gespeichert.author === 'Ein ganz anderer Name' && (gespeichert.rollen || []).length === 2);
  ok('orgAdmin erfasst', gespeichert && gespeichert.orgAdmin === true);
  ok('Firma erfasst', gespeichert && gespeichert.orgName === 'Testfirma AG', gespeichert && gespeichert.orgName);
  ok('bestehende Felder unverändert (text/type/ts/moduleId)',
    gespeichert && gespeichert.text === 'Testmeldung mit Rollen' && !!gespeichert.ts && gespeichert.moduleId === 'drift_test');
  await ctx.close();
}

/* B2 — ohne Login wird NICHTS behauptet */
console.log('■ B2: ohne Sitzung keine Rollen-Angabe');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await wireRoutes(ctx);
  const page = await ctx.newPage();
  // sys_login ist die einzige Seite ohne Auth-Redirect — dort GemaFeedback laden
  await page.goto(BASE + '/sys_login.html', { waitUntil: 'domcontentloaded' });
  const k = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 200));
    if (typeof window._gfbHooks === 'undefined') {
      await new Promise((res, rej) => {
        const sc = document.createElement('script');
        sc.src = 'gema_feedback.js'; sc.onload = res; sc.onerror = rej;
        document.head.appendChild(sc);
      });
    }
    return window._gfbHooks.rollenKontext();
  });
  ok('kein Login → null statt erfundener Rollen', k === null, k);
  await ctx.close();
}

/* B3 — Board + Export */
console.log('■ B3: Board-Karte und Markdown-Export');
{
  const s = seed(['role_admin'], { roles: [{ id: 'role_admin', name: 'Admin' }].concat(ROLLEN) });
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/sys_beta.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction("typeof fbRollenText === 'function' && typeof _exGenerate === 'function'", null, { timeout: 20000 });

  const r = await page.evaluate(neu => {
    const mit = Object.assign({}, neu, {
      text: 'Mit Rollen', cStatus: 'offen', umsetzen: true, ts: '06.08.26 08:00'
    });
    const ohne = {
      type: 'kommentar', author: 'Alt', text: 'Altbestand ohne Rollen',
      cStatus: 'offen', umsetzen: true, ts: '01.07.26 08:00'
    };
    const leer = {
      type: 'kommentar', author: 'Ohne Rolle', text: 'Eingeloggt, aber ohne Rolle',
      rollen: [], cStatus: 'offen', umsetzen: true, ts: '06.08.26 09:00'
    };
    const modId = FEEDBACK_IDS[0];
    _GemaDB.c['feedback_' + modId] = [mit, ohne, leer];

    // Export-Filter: nur «Offen»
    document.getElementById('exFilterOpen').checked = true;
    document.getElementById('exFilterArbeit').checked = false;
    document.getElementById('exFilterErledigt').checked = false;
    const md = _exGenerate(_exApplyFilter(_exCollectAll()), false);

    return {
      modId,
      textMit: fbRollenText(mit),
      textOhne: fbRollenText(ohne),
      textLeer: fbRollenText(leer),
      karten: renderComments(modId),
      md
    };
  }, {
    type: 'fehler', author: 'Robin', rollen: ROLLEN, orgAdmin: true, orgName: 'Testfirma AG'
  });

  ok('Formatter: Name (ID) je Rolle + Org-Admin',
    r.textMit === 'Sanitärplaner (role_planer) · Magaziner (role_magaziner) · Org-Admin', r.textMit);
  ok('Formatter: Altbestand → null', r.textOhne === null, r.textOhne);
  ok('Formatter: eingeloggt ohne Rolle wird benannt', r.textLeer === 'keine Rolle zugewiesen', r.textLeer);

  ok('Board zeigt die Rollen-Zeile', /fb-rollen/.test(r.karten) && /role_planer/.test(r.karten));
  ok('Board zeigt die Firma', /Testfirma AG/.test(r.karten));
  ok('Board zeigt beim Altbestand KEINE Rollen-Zeile',
    (r.karten.match(/fb-rollen/g) || []).length === 2, (r.karten.match(/fb-rollen/g) || []).length);

  ok('Export nennt die Rollen des Absenders',
    /- \*\*Rollen des Absenders:\*\* Sanitärplaner \(role_planer\) · Magaziner \(role_magaziner\) · Org-Admin/.test(r.md), r.md.slice(0, 400));
  ok('Export nennt die Firma', /- \*\*Firma:\*\* Testfirma AG/.test(r.md));
  ok('Export weist den Altbestand als «nicht erfasst» aus',
    /nicht erfasst \(vor der Rollen-Erfassung/.test(r.md));
  ok('Export nennt «keine Rolle zugewiesen» statt einer Leerstelle',
    /- \*\*Rollen des Absenders:\*\* keine Rolle zugewiesen/.test(r.md));
  ok('bestehende Export-Zeilen unverändert (Datum/Status/Modul-ID)',
    /- \*\*Datum:\*\*/.test(r.md) && /- \*\*Status:\*\*/.test(r.md) && /- \*\*Modul-ID:\*\*/.test(r.md));
  await ctx.close();
}

await browser.close();
try { server.close(); } catch (e) {}
console.log('\n' + n + ' Checks, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
