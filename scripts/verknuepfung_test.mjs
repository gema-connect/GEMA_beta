#!/usr/bin/env node
/**
 * scripts/verknuepfung_test.mjs — Drift-Guard fuer das Verknuepfungs-Werkzeug
 *
 * Teil A (Node, immer): Werte-Katalog, Registrierung in allen Modulen,
 *   Nummernvergabe und der Markdown-Export (die Arbeitsanweisung fuer
 *   Claude Code — sie MUSS Ziel, Quelle, Lesekanal und Bedingung tragen).
 * Teil B (Browser, wenn playwright verfuegbar): der echte Erfassungs-Weg —
 *   Knopf nur fuer den Admin, Feld anklicken, Quelle waehlen, speichern,
 *   Export.
 *
 * Aufruf:  node scripts/verknuepfung_test.mjs
 *          CHROME=<pfad> node scripts/verknuepfung_test.mjs   (eigener Browser)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, fehler = 0;

function pruef(bedingung, text, zusatz) {
  if (bedingung) { ok++; return true; }
  fehler++;
  console.log('  ✗ ' + text + (zusatz ? '\n      → ' + zusatz : ''));
  return false;
}
function abschnitt(t) { console.log('\n' + t); }

/* ═══════════════════════════════════════════════════════════
   TEIL A — Node
   ═══════════════════════════════════════════════════════════ */

abschnitt('A1 · Werte-Katalog');

pruef(existsSync(join(ROOT, 'gema_werte_katalog.js')), 'gema_werte_katalog.js existiert',
  'erzeugen mit: node scripts/werte_katalog_gen.mjs');

/* Der Katalog muss zum aktuellen Stand der Module passen — sonst zeigt die
   Auswahlliste Werte, die es nicht mehr gibt (oder neue fehlen). */
let katalogAktuell = true;
try {
  execFileSync('node', [join(ROOT, 'scripts', 'werte_katalog_gen.mjs'), '--check'], { cwd: ROOT, stdio: 'pipe' });
} catch (e) { katalogAktuell = false; }
pruef(katalogAktuell, 'Katalog ist auf dem aktuellen Stand der Module',
  'neu erzeugen mit: node scripts/werte_katalog_gen.mjs');

/* Katalog in einen Mini-Kontext laden */
const KAT = (() => {
  const w = {};
  new Function('window', readFileSync(join(ROOT, 'gema_werte_katalog.js'), 'utf8'))(w);
  return w.GemaWerteKatalog;
})();

pruef(KAT && KAT.module, 'Katalog exportiert GemaWerteKatalog');
const modulAnzahl = Object.keys(KAT.module).length;
pruef(modulAnzahl >= 40, 'Katalog deckt die Berechnungsmodule ab (' + modulAnzahl + ')');

/* Wert-IDs muessen eindeutig sein — sie sind der Anker jeder Verknuepfung */
const gesehen = new Set(); let doppelt = [];
Object.keys(KAT.module).forEach(mk => KAT.module[mk].werte.forEach(v => {
  if (gesehen.has(v.id)) doppelt.push(v.id); else gesehen.add(v.id);
}));
pruef(!doppelt.length, 'Alle Wert-IDs sind eindeutig', doppelt.slice(0, 3).join(', '));

/* ID-Schema: sprechend, <modulKey>.<feld>. Feld-IDs duerfen Umlaute tragen —
   die Solaranlage hat Monatsfelder wie «tm_Mär». */
const abweichend = [...gesehen].filter(id => !/^[a-z0-9_]+\.[\p{L}0-9_\-]+$/u.test(id));
pruef(!abweichend.length, 'Wert-IDs folgen dem Schema <modulKey>.<feldId>',
  abweichend.slice(0, 3).join(', '));

abschnitt('A2 · Kernwerte des Datenflusses (das Beispiel aus der Anforderung)');

/* Die Druckerhoehung kann fuer Kaltwasser ODER fuer Regenwasser ausgelegt
   werden — beide Volumenstroeme muessen als Quelle waehlbar sein. */
const kw = KAT.byId('lu_tabelle.q_kw_api');
const rw = KAT.byId('lu_tabelle.q_gw_api');
pruef(kw, 'Spitzenvolumenstrom Kaltwasser ist im Katalog');
pruef(rw, 'Spitzenvolumenstrom Regenwasser ist im Katalog');
pruef(kw && /getSpitzenvolumenstrom\(objektId,'kw'\)/.test(kw.wert.api), 'Kaltwasser traegt seinen Lesekanal');
pruef(rw && /getSpitzenvolumenstrom\(objektId,'gw'\)/.test(rw.wert.api), 'Regenwasser traegt seinen Lesekanal');
pruef(kw && kw.wert.einheit === 'l/s', 'Einheit ist erfasst (l/s)');

/* Das Zielfeld aus dem Beispiel */
const ziel = KAT.byId('druckerhoehung.vfd_LU');
pruef(ziel, 'Zielfeld druckerhoehung.vfd_LU ist im Katalog');
pruef(ziel && ziel.wert.art === 'eingabe', 'Zielfeld ist als Eingabe erkannt');
pruef(KAT.module.druckerhoehung && KAT.module.druckerhoehung.autosave === 'druckerhoehung',
  'Modul kennt seinen AutoSave-Snapshot (Lesekanal fuer Eingabewerte)');

/* Ergebniswerte stehen in der Suche zuoberst — sie sind der typische Fall */
const treffer = KAT.suche('volumenstrom');
pruef(treffer.length > 3, 'Suche findet Volumenstrom-Werte (' + treffer.length + ')');
pruef(treffer[0] && treffer[0].wert.art === 'ergebnis', 'Ergebniswerte stehen in der Suche zuoberst');

abschnitt('A3 · Registrierung');

const module = readdirSync(ROOT).filter(f => f.endsWith('.html'))
  .filter(f => readFileSync(join(ROOT, f), 'utf8').includes('gema_sektion.js'));
const ohne = module.filter(f => !readFileSync(join(ROOT, f), 'utf8').includes('gema_verknuepfung.js'));
pruef(!ohne.length, 'Alle ' + module.length + ' Berechnungsmodule binden gema_verknuepfung.js ein',
  ohne.slice(0, 5).join(', '));

const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
pruef(sw.includes('/gema_verknuepfung.js'), 'sw.js cached gema_verknuepfung.js');
pruef(sw.includes('/gema_werte_katalog.js'), 'sw.js cached gema_werte_katalog.js');

const helper = readFileSync(join(ROOT, 'gema_verknuepfung.js'), 'utf8');
pruef(/if\s*\(!istAdmin\(\)\)\s*return/.test(helper),
  'Knopf wird nur fuer den GEMA-Admin gebaut (fail-closed)');
pruef(helper.includes("'role_admin'"), 'Admin-Rolle wird geprueft');
pruef(!/GemaSync\.persistCollection\s*\(/.test(helper),
  'Kein persistCollection-AUFRUF — der Pool ist org-uebergreifend, es wird per-Record gespeichert');
pruef(/GemaSync\.saveRecord/.test(helper), 'Speichert per-Record ueber GemaSync');
pruef(/replace\(\/\[&<>"'\]\/g/.test(helper.replace(/\\/g, '')) || helper.includes(`[&<>"']`),
  'Voll-Escaper deckt & < > " \' ab');
/* Der Katalog ist gross — er darf nicht auf jeder Seite mitlaufen */
pruef(/createElement\('script'\)[\s\S]{0,200}KATALOG_DATEI|s\.src = KATALOG_DATEI/.test(helper),
  'Katalog wird erst bei Bedarf nachgeladen (lazy)');

abschnitt('A4 · Markdown-Export');

/* Den Helper in einem Mini-DOM laden, damit die Export-Logik echt laeuft */
function helperLaden(pool) {
  const speicher = { gema_vk_pool_v1: JSON.stringify(pool || []) };
  const stub = {
    GemaWerteKatalog: KAT,
    localStorage: {
      getItem: k => (k in speicher ? speicher[k] : null),
      setItem: (k, v) => { speicher[k] = String(v); },
      removeItem: k => { delete speicher[k]; }
    },
    location: { pathname: '/sb_druckerhoehung.html' },
    addEventListener() {}, setTimeout() {},
    GemaAuth: { getCurrentUser: () => ({ id: 'u1', name: 'Test', roleIds: ['role_admin'], orgId: 'o1' }),
                getFileMap: () => ({ sb_druckerhoehung: 'druckerhoehung' }) },
    navigator: {}, Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} }
  };
  const dok = {
    readyState: 'complete', documentElement: { classList: { add() {}, remove() {} } },
    head: { appendChild() {} }, body: { appendChild() {} },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {} }, addEventListener() {}, appendChild() {}, setAttribute() {} }),
    addEventListener() {}, removeEventListener() {}
  };
  new Function('window', 'document', 'localStorage', 'navigator', 'location', 'setTimeout',
    readFileSync(join(ROOT, 'gema_verknuepfung.js'), 'utf8'))
    (stub, dok, stub.localStorage, stub.navigator, stub.location, () => {});
  return stub.GemaVerknuepfung;
}

const beispiel = [{
  id: 'vk_1', nr: 'VK-0001', orgId: 'o1',
  zielModul: 'druckerhoehung', zielFeld: 'vfd_LU', zielWertId: 'druckerhoehung.vfd_LU',
  zielLabel: 'Anzahl LU', zielEinheit: 'LU',
  quellen: [
    { wertId: 'lu_tabelle.q_kw_api', bedingung: 'Anlage für Kaltwasser', umrechnung: '' },
    { wertId: 'lu_tabelle.q_gw_api', bedingung: 'Anlage für Regenwasser | Nutzwasser', umrechnung: 'l/s → m³/h (×3.6)' }
  ],
  modus: 'vorschlag', hinweis: 'Beide Netze möglich.', status: 'offen',
  erstelltAm: '2026-08-11T10:00:00.000Z', erstelltVon: { userId: 'u1', name: 'Robin' }
}];

const VK = helperLaden(beispiel);
pruef(VK, 'GemaVerknuepfung laedt in Node');

const mdText = VK ? VK.markdown() : '';
pruef(mdText.includes('VK-0001'), 'Export nennt die Verknuepfungs-Nummer');
pruef(mdText.includes('druckerhoehung.vfd_LU'), 'Export nennt die Ziel-Wert-ID');
pruef(mdText.includes('lu_tabelle.q_kw_api') && mdText.includes('lu_tabelle.q_gw_api'),
  'Export nennt BEIDE Quellen (Auswahl-Fall)');
pruef(mdText.includes("getSpitzenvolumenstrom(objektId,'gw')"),
  'Export nennt den Lesekanal — Claude Code muss nicht suchen');
pruef(mdText.includes('Anlage für Regenwasser'), 'Export nennt die Bedingung');
pruef(mdText.includes('×3.6'), 'Export nennt die Umrechnung');
pruef(/Datei: `sb_druckerhoehung\.html`/.test(mdText), 'Export nennt die Zieldatei');
pruef(mdText.includes('gema_druckerhoehung__<objektId>'), 'Export nennt den AutoSave-Snapshot des Zielmoduls');
pruef(mdText.includes('Beide Netze möglich.'), 'Export traegt den Hinweis');
/* Ein Pipe im Freitext wuerde die Markdown-Tabelle zerreissen — er MUSS
   als \| ankommen, sonst entsteht mitten in der Zeile eine neue Spalte. */
const pipeZeile = mdText.split('\n').find(l => l.includes('Nutzwasser')) || '';
pruef(pipeZeile.includes('Regenwasser \\| Nutzwasser'),
  'Pipe im Freitext ist maskiert (Tabelle bleibt heil)', pipeZeile.slice(0, 120));
pruef(/^\| 1 \|/m.test(mdText) && /^\| 2 \|/m.test(mdText), 'Quellen sind nummeriert');

/* Nummernvergabe */
pruef(VK.naechsteNummer() === 'VK-0002', 'Naechste Nummer zaehlt fortlaufend weiter',
  'geliefert: ' + VK.naechsteNummer());
const leer = helperLaden([]);
pruef(leer.naechsteNummer() === 'VK-0001', 'Erste Nummer ist VK-0001');
pruef(leer.markdown().includes('Noch keine Verknüpfungen erfasst'),
  'Leerer Export erklaert sich, statt leer zu bleiben');

/* ═══════════════════════════════════════════════════════════
   TEIL B — Browser
   ═══════════════════════════════════════════════════════════ */

abschnitt('B · Browser-Durchlauf');

/* playwright-core (Repo-Kanon) oder ein global installiertes playwright.
   Global liegt es als CJS vor — dort steckt chromium im default-Export. */
let chromium = null;
const kandidaten = ['playwright-core', 'playwright'];
if (process.env.PLAYWRIGHT_PFAD) kandidaten.push(process.env.PLAYWRIGHT_PFAD);
for (const g of ['/opt/node22/lib/node_modules/playwright/index.js',
                 '/usr/lib/node_modules/playwright/index.js',
                 '/usr/local/lib/node_modules/playwright/index.js']) {
  if (existsSync(g)) kandidaten.push(g);
}
for (const paket of kandidaten) {
  try {
    const m = await import(paket);
    chromium = (m.chromium) || (m.default && m.default.chromium) || null;
    if (chromium) break;
  } catch (e) { /* naechster Versuch */ }
}

if (!chromium) {
  console.log('  ⚠ uebersprungen — weder playwright-core noch playwright gefunden.');
  console.log('    (Teil A ist gelaufen; fuer Teil B: npm i -D playwright-core)');
} else {
  const PORT = 8917, BASE = 'http://localhost:' + PORT;
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = await new Promise(r => {
    const s = createServer(async (req, res) => {
      try {
        let p = req.url.split('?')[0];
        if (p === '/') p = '/index.html';
        const daten = readFileSync(join(ROOT, p));
        res.writeHead(200, { 'Content-Type': MIME[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' });
        res.end(daten);
      } catch (e) { res.writeHead(404); res.end('nf'); }
    });
    s.listen(PORT, () => r(s));
  });

  const start = { executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] };
  let browser;
  try { browser = await chromium.launch(start); }
  catch (e) {
    console.log('  ⚠ uebersprungen — Chromium liess sich nicht starten: ' + String(e.message).slice(0, 90));
    server.close();
  }

  if (browser) {
    const jwt = (() => {
      const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ iat: now, exp: now + 2592000, uid: 'u_test', org: 'org_test', role: 'authenticated' }) + '.sig';
    })();
    const seed = rollen => ({
      gema_orgs_v1: [{ id: 'org_test', name: 'Testfirma AG', kategorie: 'sanitaerplaner', admins: ['u_test'], active: true }],
      gema_users_v1: [{ id: 'u_test', username: 'u@test.ch', name: 'Test User', roleIds: rollen, orgId: 'org_test', active: true }],
      gema_session_v1: { userId: 'u_test', expires: new Date(Date.now() + 30 * 86400000).toISOString(), token: jwt },
      gema_coachmarks_done_index: '1'
    });

    /* In-Memory-Cloud: POST speichert, GET liefert zurueck. Nur so testet
       der Reload wirklich die Persistenz — ein Mock, der stur [] liefert,
       wuerde den lokalen Cache leeren und einen Fehler vortaeuschen, den es
       gegen die echte Cloud nicht gibt. */
    const cloud = new Map();   /* module_key|data_key -> payload */

    async function seite(rollen) {
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
      await ctx.route('**/*', route => {
        const req = route.request();
        const u = req.url();
        if (u.startsWith(BASE)) return route.continue();
        if (u.includes('/rest/v1/') || u.includes('supabase') || u.includes('/sb/')) {
          if (req.method() === 'GET') {
            const mk = (/module_key=eq\.([^&]+)/.exec(u) || [])[1];
            const like = (/data_key=like\.([^&]+)/.exec(u) || [])[1];
            const eq = (/data_key=eq\.([^&]+)/.exec(u) || [])[1];
            const rows = [];
            cloud.forEach((payload, schluessel) => {
              const [m, dk] = schluessel.split('|');
              if (mk && m !== decodeURIComponent(mk)) return;
              if (like) {
                const prefix = decodeURIComponent(like).replace(/\*$/, '');
                if (dk.indexOf(prefix) !== 0) return;
              }
              if (eq && dk !== decodeURIComponent(eq)) return;
              rows.push({ module_key: m, data_key: dk, payload });
            });
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
          }
          if (req.method() === 'POST') {
            let body = [];
            try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
            (Array.isArray(body) ? body : [body]).forEach(r => {
              if (r && r.module_key && r.data_key) cloud.set(r.module_key + '|' + r.data_key, r.payload);
            });
            return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
          }
          if (req.method() === 'DELETE') {
            const mk = decodeURIComponent((/module_key=eq\.([^&]+)/.exec(u) || [])[1] || '');
            const dk = decodeURIComponent((/data_key=eq\.([^&]+)/.exec(u) || [])[1] || '');
            cloud.delete(mk + '|' + dk);
            return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
          }
          return route.fulfill({ contentType: 'application/json', body: '{}' });
        }
        if (u.includes('/.netlify/functions/') || u.includes('/api/')) {
          return route.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
        }
        return route.abort();
      });
      await ctx.addInitScript(st => {
        for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }, seed(rollen));
      const p = await ctx.newPage();
      await p.goto(BASE + '/sb_druckerhoehung.html', { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1800);
      return { ctx, p };
    }

    /* ── Sichtbarkeit ── */
    const planer = await seite(['role_planer']);
    pruef(await planer.p.locator('#gvkBtn').count() === 0,
      'Planer sieht den Verknuepfungs-Knopf NICHT');
    pruef(await planer.p.locator('.gema-feedback-btn').count() > 0,
      'Der Feedback-Knopf ist davon unberuehrt');
    await planer.ctx.close();

    const { ctx, p } = await seite(['role_admin']);
    pruef(await p.locator('#gvkBtn').count() === 1, 'Admin sieht den Knopf');
    pruef((await p.locator('#gvkBtn').textContent() || '').includes('Verknüpfung'), 'Knopf ist beschriftet');
    /* Nav-Kanon: JEDER sichtbare .g-nav-btn ist exakt 34px hoch (die Metriken
       kommen zentral aus gema_responsive.css, per-Seite-CSS setzt nur Farben).
       Genau das prueft scripts/nav_uniform_test.mjs fuer alle Seiten. */
    const hoehe = await p.evaluate(() => Math.round(document.getElementById('gvkBtn').getBoundingClientRect().height));
    pruef(hoehe === 34, 'Knopf folgt dem Nav-Kanon (34px)', 'gemessen: ' + hoehe);

    /* ── Panel ── */
    await p.click('#gvkBtn');
    await p.waitForTimeout(900);
    pruef(await p.locator('#gvkPanel').count() === 1, 'Panel oeffnet');
    pruef((await p.locator('#gvkPanel').textContent() || '').includes('Druckerhöhung'),
      'Panel nennt das aktuelle Modul');
    pruef(await p.evaluate(() => !!window.GemaWerteKatalog), 'Werte-Katalog wurde nachgeladen');

    /* ── Zielwahl: Feld im Modul anklicken ── */
    await p.click('#gvkPanel .gvk-b.prim');
    await p.waitForTimeout(250);
    pruef(await p.locator('#gvkZielBar').count() === 1, 'Zielwahl-Modus zeigt seine Leiste');
    pruef(await p.evaluate(() => document.documentElement.classList.contains('gvk-zielmodus')),
      'Felder werden im Zielmodus markiert');
    /* Das Panel MUSS beiseite treten — sonst sind die Felder darunter
       nicht anklickbar (genau daran ist der Test zuerst gescheitert). */
    pruef(!await p.locator('#gvkPanel').isVisible(),
      'Panel tritt waehrend der Feldwahl beiseite');
    pruef(await p.evaluate(() => {
      var f = document.getElementById('vfd_LU');
      if (!f) return false;
      var r = f.getBoundingClientRect();
      var oben = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!(oben && (oben === f || f.contains(oben)));
    }), 'Zielfeld ist wirklich anklickbar (nichts liegt darueber)');

    await p.click('#vfd_LU');
    await p.waitForTimeout(350);
    pruef(await p.locator('#gvkDlg').count() === 1, 'Klick aufs Feld oeffnet den Dialog');
    const dlgText = await p.locator('#gvkDlg').textContent();
    pruef(dlgText.includes('druckerhoehung.vfd_LU'), 'Dialog kennt die Ziel-Wert-ID');
    pruef(/VK-\d{4}/.test(dlgText), 'Dialog vergibt eine Verknuepfungs-Nummer');
    /* Die Beschriftung wird LIVE aus dem DOM gelesen. Herkunfts-Tags stehen
       dort versteckt im Label («LU ↗», display:none) und duerfen nicht
       mitkommen — sonst steht im Export «Total LULU ↗Summe aller …». */
    const zielName = await p.evaluate(() => {
      const b = document.querySelector('#gvkDlg .gvk-dlg-bd > div');
      return b ? (b.textContent || '') : '';
    });
    pruef(/Total LU/.test(zielName) && !/↗/.test(zielName),
      'Feld-Beschriftung ist sauber gelesen (ohne verstecktes Herkunfts-Tag)', zielName.slice(0, 100));
    pruef(!await p.evaluate(() => document.documentElement.classList.contains('gvk-zielmodus')),
      'Zielmodus endet nach der Wahl');

    /* ── Quelle 1: Kaltwasser ── */
    await p.click('#gvkDlg .gvk-qbox .gvk-b');
    await p.waitForTimeout(250);
    pruef(await p.locator('#gvkSuche').count() === 1, 'Quellen-Suche erscheint');
    await p.fill('#gvkSuche', 'Spitzenvolumenstrom Kaltwasser');
    await p.waitForTimeout(300);
    const trefferZahl = await p.locator('#gvkDlg .gvk-tr').count();
    pruef(trefferZahl > 0, 'Suche liefert Treffer (' + trefferZahl + ')');
    await p.click('#gvkDlg .gvk-tr:has-text("Kaltwasser (KW)") >> nth=0');
    await p.waitForTimeout(250);
    pruef((await p.locator('#gvkDlg').textContent()).includes('lu_tabelle.q_kw_api'),
      'Kaltwasser-Volumenstrom ist als Quelle uebernommen');

    /* Bedingung erfassen */
    await p.fill('#gvkDlg .gvk-qbox input.gvk-inp >> nth=0', 'Anlage für Kaltwasser');

    /* ── Quelle 2: Regenwasser (der Auswahl-Fall) ── */
    await p.click('#gvkDlg .gvk-dlg-bd > button.gvk-b');
    await p.waitForTimeout(300);
    await p.fill('#gvkSuche', 'Spitzenvolumenstrom Regenwasser');
    await p.waitForTimeout(300);
    await p.click('#gvkDlg .gvk-tr:has-text("Regenwasser (RW)") >> nth=0');
    await p.waitForTimeout(250);
    const dlg2 = await p.locator('#gvkDlg').textContent();
    pruef(dlg2.includes('lu_tabelle.q_gw_api'), 'Zweite Quelle (Regenwasser) uebernommen');
    pruef(dlg2.includes('Quelle 1 von 2'), 'Dialog zeigt die Auswahl-Variante an');

    /* ── Speichern ── */
    await p.click('#gvkDlg .gvk-fuss .gvk-b.prim');
    await p.waitForTimeout(600);
    pruef(await p.locator('#gvkDlg').count() === 0, 'Dialog schliesst nach dem Speichern');
    const panelText = await p.locator('#gvkPanel').textContent();
    pruef(/VK-\d{4}/.test(panelText), 'Verknuepfung erscheint als Karte im Panel');
    pruef(panelText.includes('2 Quellen zur Auswahl'), 'Karte weist die Auswahl aus');
    pruef(panelText.includes('Anzahl LU') || panelText.includes('vfd_LU'), 'Karte nennt das Zielfeld');

    /* Gespeichert? */
    const gespeichert = await p.evaluate(() => JSON.parse(localStorage.getItem('gema_vk_pool_v1') || '[]'));
    pruef(gespeichert.length === 1, 'Verknuepfung liegt im Pool');
    pruef(gespeichert[0] && gespeichert[0].quellen.length === 2, 'Beide Quellen gespeichert');
    pruef(gespeichert[0] && gespeichert[0].quellen[0].bedingung === 'Anlage für Kaltwasser',
      'Bedingung gespeichert');
    pruef(gespeichert[0] && gespeichert[0].orgId === 'org_test', 'Org ist gestempelt (RLS-Regel)');

    /* ── Export ── */
    const mdBrowser = await p.evaluate(() => window.GemaVerknuepfung.markdown());
    pruef(mdBrowser.includes('druckerhoehung.vfd_LU'), 'Export enthaelt die erfasste Verknuepfung');
    pruef(mdBrowser.includes("getSpitzenvolumenstrom(objektId,'kw')"), 'Export enthaelt den Lesekanal');

    /* ── Ueberlebt einen Reload ── */
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1800);
    await p.click('#gvkBtn');
    await p.waitForTimeout(700);
    pruef((await p.locator('#gvkPanel').textContent() || '').includes('VK-'),
      'Erfasste Verknuepfung ist nach dem Reload noch da');

    /* ── Keine Seitenfehler ── */
    const fehlerAufSeite = [];
    p.on('pageerror', e => fehlerAufSeite.push(e.message));
    await p.waitForTimeout(300);
    pruef(!fehlerAufSeite.length, 'Keine Seitenfehler', fehlerAufSeite[0]);

    await ctx.close();
    await browser.close();
    server.close();
  }
}

/* ═══════════════════════════════════════════════════════════ */
console.log('\n' + '─'.repeat(52));
console.log(fehler ? `✗ ${fehler} Fehler · ${ok} ok` : `✓ alle ${ok} Prüfungen bestanden`);
process.exit(fehler ? 1 : 0);
