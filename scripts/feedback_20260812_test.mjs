/* Drift-Guard: Feedback 12.08.2026 (Sandro Caso, 3 Punkte)
 *
 *  1. Berechnungs-Tabs: erstellen (＋), umbenennen (Rechtsklick), löschen
 *     (rotes ✕ mit Bestätigung, Vorauswahl «Nein»); jeder Tab hält seine
 *     eigene Berechnung (hx_anlagen-Muster). Gefordert war es für die
 *     Druckerhöhung — umgesetzt als geteilter Helfer
 *     `gema_berechnungs_tabs.js` in ALLEN Berechnungsmodulen (Folge-Auftrag
 *     «Die tabs für druckerhöhung soll bei allen berechnungen sein»).
 *  2. sys_workspace — Kachel-Text überlappte die 📄/✕-Knöpfe (lange
 *     Modulnamen liefen ÜBER die Buttons statt umzubrechen).
 *  3. sys_workspace — SIA-Phasen-Wechsel: Bestätigung (Standard «Nein»),
 *     eingefrorener Ordner der alten Phase (nur Lesen/Export, ?phase=…&
 *     eingefroren=1), Berechnungs-Stände in die neue Phase übernommen
 *     (nur wo leer), obj.aktivePhase automatisch nachgeführt. Dazu die
 *     PHASES-Label-Korrektur (SIA 31 Vorprojekt / 32 Bauprojekt — ids
 *     bleiben STABIL, sie stehen in den Storage-Keys).
 *
 * Teil A prüft statisch, Teil B im Browser (Playwright; ohne Chromium wird
 * Teil B mit Hinweis übersprungen, nie still).
 *
 * Ausführen:  CHROME=<chromium> node scripts/feedback_20260812_test.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';

const ROOT = join(new URL('.', import.meta.url).pathname, '..');
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
function lese(f) { return readFileSync(join(ROOT, f), 'utf8'); }

/* ════════ Teil A — statisch ════════ */
console.log('— A1: gema_objekte_api.js (Phasen-Labels, ?phase=/?eingefroren=1) —');
const api = lese('gema_objekte_api.js');
ok(api.includes("label: 'SIA 31 · Vorprojekt'"), 'Label Vorprojekt = SIA 31 (nicht mehr 32)');
ok(api.includes("label: 'SIA 32 · Bauprojekt'"), 'Label Bauprojekt = SIA 32 (nicht mehr 33)');
ok(api.includes("id: 'vorprojekt'") && api.includes("id: 'bauprojekt'"),
  'PHASES-ids UNVERÄNDERT (stehen in den Storage-Keys — nur Labels korrigiert)');
ok(/phaseLabel:\s*phaseLabel/.test(api), 'phaseLabel exportiert');
ok(/isEingefroren:\s*isEingefroren/.test(api), 'isEingefroren exportiert');
ok(api.includes("_pp.has('phase')"), '?phase= via has() geparst (leerer Wert = gültiger Override)');
ok(api.includes("_pp.get('eingefroren') === '1'"), '?eingefroren=1 geparst');
ok(api.includes('if (_urlPhase !== null) return _urlPhase;'),
  'getActivePhase: URL-Override gewinnt (seitenlokal, schreibt nie)');
ok(api.includes('_gemaFrozenBanner') && api.includes('Eingefrorener Stand'),
  'Freeze-Banner vorhanden');
ok(api.includes('el.disabled = true') && api.includes('#gfb-root,.gema-dlg-bg'),
  'Freeze sperrt Felder — Feedback/Dialoge bleiben bedienbar');
ok(api.includes('@media print{.gema-frozen-banner{display:none'),
  'Banner nicht im Ausdruck (Export bleibt sauber)');

console.log('— A2: gema_autosave.js (kein Speichern im eingefrorenen Modus) —');
const asv = lese('gema_autosave.js');
ok(/function _isFrozen\(\)/.test(asv), '_isFrozen-Helfer vorhanden');
ok(/if \(_isFrozen\(\) \|\| _loading \|\| !_initialized\) return;/.test(asv),
  '_save blockt eingefroren (Datums-Stempel bleibt stehen)');
ok(/if \(_loading \|\| _isFrozen\(\)\) return;/.test(asv), '_onChange blockt eingefroren');
ok(/if \(!_isFrozen\(\)\) try \{/.test(asv),
  'Phasen-Wechsel-Handler schreibt eingefroren nichts (Pfad läuft an _save vorbei)');

console.log('— A3: gema_dialog.js (focusCancel = Vorauswahl «Nein») —');
const dlg = lese('gema_dialog.js');
ok(dlg.includes('opts.focusCancel') && dlg.includes(".querySelector('.gema-dlg-cancel')"),
  'focusCancel fokussiert den Abbrechen-Button (Enter = Nein)');
ok(dlg.indexOf('opts.focusCancel && bg.querySelector') <
   dlg.indexOf("bg.querySelector('.gema-dlg-confirm') || bg.querySelector('.gema-dlg-danger')"),
  'Cancel-Vorzug steht VOR dem Confirm/Danger-Fallback');

console.log('— A4: sys_workspace.html (Kachel-Fix + Phasen-Wechsel) —');
const ws = lese('sys_workspace.html');
ok(/\.ws-mod-tile-name\{[^}]*overflow-wrap:anywhere/.test(ws),
  'Kachel-Titel bricht um (overflow-wrap:anywhere) statt über die Buttons zu laufen');
ok(/\.ws-icon-btn\{[^}]*flex-shrink:0/.test(ws),
  'Icon-Buttons schrumpfen nicht (flex-shrink:0)');
ok(ws.includes('flex:1;min-width:0;overflow:hidden'),
  'Kachel-Textblock clippt (min-width:0 + overflow:hidden)');
ok(/\['members','modules','activity','beteiligte','notes','phasen'\]/.test(ws),
  "'phasen' in der Load-Normalisierung (unvollständiger Cloud-Record reisst den Render nicht ab)");
ok(/function _wsPhaseSelHtml\(/.test(ws) && ws.includes('_wsPhaseSelHtml(b)'),
  'Phasen-Auswahl im Eimer-Kopf gerendert');
ok(/window\._wsPhaseWechsel=function/.test(ws), '_wsPhaseWechsel window-exponiert (onchange)');
ok(/function _wsPhaseSwitch\(/.test(ws), '_wsPhaseSwitch vorhanden');
ok(/function _wsPhasenHtml\(/.test(ws) && ws.includes('_wsPhasenHtml(b)'),
  'Ordner-Sektion «Frühere Phasen» gerendert');
ok(/window\._wsPhasenToggle=function/.test(ws), '_wsPhasenToggle window-exponiert');
ok(ws.includes('focusCancel:true') && /confirmLabel:'Ja, Phase wechseln'/.test(ws),
  'Phasen-Confirm mit Vorauswahl «Nein» (focusCancel)');
ok(ws.includes("sel.value=alt;return;"), 'Nein stellt die Auswahl zurück (Browser hat visuell schon gewechselt)');
ok(ws.includes("'&eingefroren=1'") || ws.includes('&eingefroren=1'),
  'Ordner-Kacheln öffnen mit ?phase=<alt>&eingefroren=1');
ok(/function zielFrei\(/.test(ws), 'Mitnehmen NUR wo die Ziel-Phase leer ist (bestehende Daten gewinnen)');
ok(ws.includes("'Prefer':'resolution=merge-duplicates'"), 'Cloud-Kopie als Upsert (merge-duplicates)');
ok(ws.includes('payload:r.payload'), 'Cloud-Kopie übernimmt den ROH-Payload 1:1 (AutoSave {v}, GemaSync {data}, _GemaDB)');
ok(/base\.indexOf\('__'\)<0/.test(ws),
  'verschachtelte Geräte-Keys (base mit __) werden übersprungen');
ok(/b\.phasen=b\.phasen\.filter\(function\(p\)\{return \(p\.phase\|\|''\)!==neu;\}\)/.test(ws),
  'Ordner der ZIEL-Phase wird entfernt (deren Stand ist wieder der lebende)');
ok(ws.includes('ws-mod-tile--frozen'), 'eingefrorene Kacheln eigener Stil (gedimmt, Schloss)');

console.log('— A5: gema_berechnungs_tabs.js (geteilter Helfer) —');
const gbt = lese('gema_berechnungs_tabs.js');
ok(/var LEISTE_ID = 'gbtLeiste'/.test(gbt) && /var TA_ID\s+= 'gbt_tabs'/.test(gbt),
  'feste ids gbtLeiste/gbt_tabs — die Textarea sichert GemaAutoSave als textarea[id]');
ok(/ta\.id = TA_ID/.test(gbt) && /leiste\.id = LEISTE_ID/.test(gbt),
  'Leiste UND Zustands-Textarea werden zur Laufzeit injiziert (kein Markup pro Modul)');
ok(/if \(!w\.GemaAutoSave \|\| !GemaAutoSave\.save\) return false;/.test(gbt),
  'ohne GemaAutoSave kein Einhängen (Tabs ohne Speicherkanal wären ein halbes Feature)');
ok(/if \(!document\.getElementById\('metaObjektDropdown'\)\) return false;/.test(gbt),
  'nur mit Projekt-Auswahl — dort IST der Schnappschuss die Berechnung eines Projekts');
ok(/class="gbt-tab/.test(gbt) && !/class="g-tab/.test(gbt),
  'Tab-Buttons als .gbt-tab — NICHT .g-tab (globaler g-tab-Listener würfe auf data-tab-lose Tabs)');
ok(/<span class="gbt-x"/.test(gbt), '✕ als SPAN im Button (Button-in-Button ist ungültiges Markup)');
ok(/danger: true, focusCancel: true/.test(gbt), 'Lösch-Confirm danger + Vorauswahl «Nein»');
ok(/@media print\{#' \+ LEISTE_ID \+ '\{display:none!important\}\}/.test(gbt),
  'Tab-Leiste nicht im Ausdruck');
ok(/akt && mehrere && !frozen/.test(gbt), '✕ nur am aktiven Tab und nie am letzten (nie alle löschen)');
ok(/delete S\.snaps\[S\.aktiv\];/.test(gbt), 'Löschen entfernt den Snapshot des gelöschten Tabs');
ok(/_vorgabe = felderLesen\(\)/.test(gbt),
  'Boot-Defaults werden VOR dem AutoSave-Restore eingefroren (neue Berechnung startet leer)');
ok(/function blobLesen\(/.test(gbt) && /function blobSetzen\(/.test(gbt)
  && /w\._objReload === 'function'/.test(gbt),
  'Module mit eigenem _GemaDB-Blob: Blob wandert mit + Neuzeichnen über window._objReload');
ok(/eingefroren\(\)/.test(gbt) && /nur Lesen — eingefrorener Stand/.test(gbt),
  'eingefrorener Phasen-Stand: keine ＋/✕/Umbenennen, sichtbarer Hinweis');
ok(/dispatchEvent\(new Event\('input'/.test(gbt) && /dispatchEvent\(new Event\('change'/.test(gbt),
  'Anwenden feuert input+change (Muster GemaAutoSave._restore — Modul-Handler laufen selbst)');

console.log('— A6: Verteilung in ALLE Berechnungsmodule —');
/* Der Sweep liest das Repo — ein NEUES Berechnungsmodul failt damit
   automatisch, statt still ohne Tabs zu bleiben. */
const AUSNAHMEN = {
  'lt_hx_diagramm.html':    'hat die eigene Anlagen-Verwaltung (#hx_anlagen)',
  'sb_druckverlust.html':   'hat die eigene Berechnungs-Verwaltung (#calcTabBar/switchCalc)',
  'br_vkf_formular.html':   'Formular-Renderer, AutoSave-Key wechselt zur Laufzeit (vkf_<formKey>)',
  'sb_vonroll.html':        'kein GemaAutoSave (reines _GemaDB) — der Helfer hängt sich dort nicht ein',
  'sa_oelabscheider.html':  'kein #metaObjektDropdown (eigene Legacy-Speicherung)'
};
const alleHtml = readdirSync(ROOT).filter(f => /\.html$/.test(f));
const kandidaten = alleHtml.filter(f => {
  if (!/^(sb_|sa_|hz_|lt_|el_|br_)/.test(f) && f !== 'pm_wirtschaftlichkeit.html') return false;
  const t = lese(f);
  return t.includes('gema_autosave.js') && t.includes('id="metaObjektDropdown"');
});
ok(kandidaten.length >= 45, 'Sweep findet die Berechnungsmodule (' + kandidaten.length + ')');
const ohne = kandidaten.filter(f => !lese(f).includes('gema_berechnungs_tabs.js') && !AUSNAHMEN[f]);
ok(ohne.length === 0, 'jedes Berechnungsmodul bindet den Helfer ein'
  + (ohne.length ? ' — FEHLT in: ' + ohne.join(', ') : ''));
Object.keys(AUSNAHMEN).forEach(f => {
  if (alleHtml.indexOf(f) < 0) return;
  ok(!lese(f).includes('gema_berechnungs_tabs.js'), 'bewusst ohne Tabs: ' + f + ' (' + AUSNAHMEN[f] + ')');
});
/* Module mit eigenem _GemaDB-Blob brauchen window._objReload — und wo ihr
   Loader bei fehlendem Stand aussteigt (`if(!d) return;`) zusätzlich einen
   Grundzustands-Zweig, sonst erbt die neue Berechnung (bzw. ein leeres
   Projekt) die Zeilen der vorherigen. */
['sb_du_zusammenstellung.html', 'sa_fettabscheider.html'].forEach(f => {
  const t = lese(f);
  ok(/function resetSaved\(/.test(t) && /if\(_leer\) resetSaved\(\)/.test(t),
    f + ': _objReload stellt bei leerem Blob den Grundzustand her');
});
['sa_abwasserhebeanlage.html', 'sa_solaranlage.html', 'sb_laengenausdehnung.html',
 'sb_apparateliste.html', 'sb_lu_tabelle.html', 'sb_niederschlag.html'].forEach(f => {
  ok(/window\._objReload\s*=/.test(lese(f)), f + ': window._objReload vorhanden (Blob folgt dem Tab)');
});

/* Reihenfolge: der Helfer registriert beim DOMContentLoaded und muss VOR dem
   Modul-Boot laufen, damit er die unberührten Defaults sieht. */
const falscheReihenfolge = kandidaten.filter(f => {
  const t = lese(f);
  const i = t.indexOf('gema_berechnungs_tabs.js');
  return i >= 0 && i < t.indexOf('gema_autosave.js');
});
ok(falscheReihenfolge.length === 0,
  'Helfer NACH gema_autosave.js eingebunden' + (falscheReihenfolge.length ? ' — falsch: ' + falscheReihenfolge.join(', ') : ''));

console.log('— A7: sb_druckerhoehung.html (Eigenbau entfernt, Einheiten-Fix) —');
const de = lese('sb_druckerhoehung.html');
ok(de.includes('<script src="gema_berechnungs_tabs.js"></script>'), 'nutzt den geteilten Helfer');
ok(!/de-ctab|deCtabs|de_tabs|deTabNeu|deTabSwitch/.test(de),
  'Eigenbau-Tabs restlos entfernt (keine Doppel-Leiste)');
/* Einheiten-Umschalter dürfen NUR bei echter Benutzer-Wahl umrechnen — der
   AutoSave-/Tab-Restore feuert synthetische Events (isTrusted false) und
   multiplizierte die Werte sonst bei jedem Laden erneut. */
ok(/function echt\(ev\)\{\s*return !ev \|\| ev\.isTrusted !== false; \}/.test(de),
  'echt(ev) prüft isTrusted (GEMA-Kanon für Einheiten-Umschalter)');
ok(/function setPressureUnit\(next, umrechnen\)/.test(de) && /function setFlowUnit\(next, umrechnen\)/.test(de),
  'setPressureUnit/setFlowUnit nehmen den Umrechnen-Schalter entgegen');
ok(/togglePressure\(this\.checked, event\)/.test(de) && /toggleFlow\(this\.checked, event\)/.test(de),
  'Inline-Handler reichen das Event durch');

/* ════════ Teil B — Browser ════════ */
let chromium = null;
for (const k of ['playwright-core', 'playwright', '/opt/node22/lib/node_modules/playwright/index.js']) {
  try { const m = await import(k); chromium = m.chromium || (m.default && m.default.chromium); if (chromium) break; } catch (e) {}
}
if (!chromium) {
  console.log('\n⚠ Teil B übersprungen: playwright-core/Chromium nicht verfügbar.');
  console.log('  (CHROME=<chromium-binary> und ein Ordner mit node_modules/playwright-core nötig)');
  abschluss();
} else {
  await browserTeil();
}

async function browserTeil() {
  const PORT = 8946, BASE = 'http://localhost:' + PORT;
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = await new Promise(r => {
    const s = createServer((req, res) => {
      try {
        let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
        const b = readFileSync(join(ROOT, p));
        res.writeHead(200, { 'Content-Type': MIME[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' });
        res.end(b);
      } catch (e) { res.writeHead(404); res.end('nf'); }
    });
    s.listen(PORT, () => r(s));
  });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.'
    + b64({ iat: now, exp: now + 999999, uid: 'u_test', org: 'org_test', role: 'authenticated' }) + '.sig';

  // Workspace-Eimer kommen als PostgREST-Rows aus dem Mock (bindCollection
  // würde einen nur lokal geseedeten Pool-Cache mit der leeren Cloud-Antwort
  // überschreiben — Cloud gewinnt).
  const wsRows = JSON.stringify([
    { module_key: 'workspace', data_key: 'ws:b1', payload: { data: {
      id: 'b1', name: 'Kachel-Eimer', type: 'project', ownerType: 'personal', createdBy: 'u_test',
      org: 'org_test', members: ['TU'], modules: [{ mod: 'pm_abnahme', status: 'offen' }, { mod: 'sb_lu_tabelle', status: 'offen' }, { mod: 'sb_druckverlust', status: 'offen' }],
      activity: [], beteiligte: [], notes: [], objektId: null, createdAt: '2026-08-01T08:00:00.000Z'
    }, _lm: '2026-08-01T08:00:00.000Z' } },
    { module_key: 'workspace', data_key: 'ws:b2', payload: { data: {
      id: 'b2', name: 'Phasen-Eimer', type: 'project', ownerType: 'personal', createdBy: 'u_test',
      org: 'org_test', members: ['TU'], modules: [{ mod: 'sb_druckerhoehung', status: 'offen' }],
      activity: [], beteiligte: [], notes: [], objektId: 'obj_w1', createdAt: '2026-08-01T08:00:00.000Z'
    }, _lm: '2026-08-01T08:00:00.000Z' } }
  ]);

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.includes('/rest/v1/') || u.includes('/sb/') || u.includes('supabase')) {
      if (route.request().method() === 'GET' && u.includes('module_key=eq.workspace'))
        return route.fulfill({ contentType: 'application/json', body: wsRows });
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    }
    return route.abort();
  });
  await ctx.addInitScript(j => {
    localStorage.setItem('gema_orgs_v1', JSON.stringify([{ id: 'org_test', name: 'Testfirma AG', kategorie: 'sanitaerplaner', admins: ['u_test'], active: true }]));
    localStorage.setItem('gema_users_v1', JSON.stringify([{ id: 'u_test', username: 'u@test.ch', name: 'Test User', roleIds: ['role_admin'], orgId: 'org_test', active: true }]));
    localStorage.setItem('gema_session_v1', JSON.stringify({ userId: 'u_test', expires: new Date(Date.now() + 9e9).toISOString(), token: j, remember: true }));
    localStorage.setItem('gema_objekte_v1', JSON.stringify({
      objekte: [
        { id: 'obj_t1', name: 'Tab-Testobjekt', status: 'aktiv', orgId: 'org_test' },
        { id: 'obj_w1', name: 'Phasen-Testobjekt', status: 'aktiv', orgId: 'org_test' }
      ], beteiligte: [], activeObjektId: ''
    }));
    // AutoSave-Stand der alten (phasenlosen) Ansicht — die Quelle des Mitnehmens
    localStorage.setItem('gema_druckerhoehung__obj_w1', JSON.stringify({ vfd_pv: '3', _ts: 1 }));
    localStorage.setItem('gema_coachmarks_done_sys_workspace_v2', '1');
  }, jwt);

  const fehler = [];

  /* ── B1: Berechnungs-Tabs in sb_druckerhoehung ── */
  console.log('— B1: Druckerhöhung — Tabs erstellen/isolieren/umbenennen/löschen —');
  const p1 = await ctx.newPage();
  p1.on('pageerror', e => fehler.push('druckerhoehung: ' + e.message));
  await p1.goto(BASE + '/sb_druckerhoehung.html?objekt=obj_t1', { waitUntil: 'domcontentloaded' });
  await p1.waitForTimeout(2200);
  ok(await p1.locator('#gbtLeiste .gbt-tab').count() === 1, 'Start: eine Berechnung («Berechnung 1»)');
  await p1.fill('#vfd_pv', '7.77');
  await p1.click('#gbtLeiste .gbt-add');
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.fill('#_gdInput', 'Variante B');
  await p1.click('.gema-dlg-bg .gema-dlg-confirm');
  await p1.waitForTimeout(400);
  ok(await p1.locator('#gbtLeiste .gbt-tab').count() === 2, '＋ legt zweiten Tab an');
  ok((await p1.locator('#gbtLeiste .gbt-tab.active .gbt-name').innerText()) === 'Variante B', 'neuer Tab aktiv + benannt');
  ok((await p1.inputValue('#vfd_pv')) !== '7.77', 'neue Berechnung startet leer (übernimmt NICHT die Werte)');
  await p1.click('#gbtLeiste .gbt-tab >> nth=0');
  await p1.waitForTimeout(300);
  ok((await p1.inputValue('#vfd_pv')) === '7.77', 'Zurückwechseln stellt die Werte des ersten Tabs wieder her');
  // Umbenennen per Rechtsklick
  await p1.click('#gbtLeiste .gbt-tab >> nth=1', { button: 'right' });
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.fill('#_gdInput', 'Windkessel-Variante');
  await p1.click('.gema-dlg-bg .gema-dlg-confirm');
  await p1.waitForTimeout(300);
  ok((await p1.locator('#gbtLeiste .gbt-tab >> nth=1').innerText()).includes('Windkessel-Variante'), 'Rechtsklick benennt um');
  // Löschen: Vorauswahl «Nein» — Enter darf NICHT löschen
  await p1.click('#gbtLeiste .gbt-tab >> nth=1');
  await p1.waitForTimeout(250);
  await p1.click('#gbtLeiste .gbt-tab.active .gbt-x');
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.waitForTimeout(200);
  ok(await p1.evaluate(() => (document.activeElement && document.activeElement.className || '').includes('gema-dlg-cancel')),
    'Lösch-Dialog: Abbrechen-Button vorausgewählt (Standard «Nein»)');
  await p1.keyboard.press('Enter');
  await p1.waitForTimeout(300);
  ok(await p1.locator('.gema-dlg-bg').count() === 0 && await p1.locator('#gbtLeiste .gbt-tab').count() === 2,
    'Enter = Nein — Tab bleibt bestehen');
  await p1.click('#gbtLeiste .gbt-tab.active .gbt-x');
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.click('.gema-dlg-bg .gema-dlg-danger');
  await p1.waitForTimeout(300);
  ok(await p1.locator('#gbtLeiste .gbt-tab').count() === 1, 'Ja, löschen entfernt den Tab');
  ok(await p1.locator('#gbtLeiste .gbt-tab .gbt-x').count() === 0, 'letzter Tab hat kein ✕ (nie alle löschen)');
  // Persistenz über Reload (AutoSave → gbt_tabs + aktive Felder)
  await p1.click('#gbtLeiste .gbt-add');
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.fill('#_gdInput', 'Variante C');
  await p1.click('.gema-dlg-bg .gema-dlg-confirm');
  await p1.waitForTimeout(300);
  await p1.fill('#vfd_pv', '4.44');
  await p1.evaluate(() => GemaAutoSave.save());
  await p1.waitForTimeout(500);
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForTimeout(2400);
  ok(await p1.locator('#gbtLeiste .gbt-tab').count() === 2, 'Reload: beide Tabs wiederhergestellt');
  ok((await p1.locator('#gbtLeiste .gbt-tab.active .gbt-name').innerText()) === 'Variante C', 'Reload: aktiver Tab bleibt aktiv');
  ok((await p1.inputValue('#vfd_pv')) === '4.44', 'Reload: Werte des aktiven Tabs da (AutoSave)');
  await p1.click('#gbtLeiste .gbt-tab >> nth=0');
  await p1.waitForTimeout(300);
  ok((await p1.inputValue('#vfd_pv')) === '7.77', 'Reload: Snapshot des ersten Tabs übersteht (gbt_tabs)');
  /* Einheiten-Umschalter: ECHTER Klick rechnet um, ein programmatisches
     change (AutoSave-Restore, Tab-Wechsel) NICHT — ohne diesen Guard wurde
     der Wert bei jedem Neuladen erneut mal 100 genommen (3 bar → 30'000). */
  const schalter = 'label.g-switch:has(#unitPressureToggle) .g-switch-slider';
  await p1.click(schalter);                       // Playwright klickt trusted
  await p1.waitForTimeout(250);
  const kpa = await p1.inputValue('#vfd_pv');
  ok(Math.abs(parseFloat(kpa) - 777) < 0.5,
    'echter Klick rechnet um (7.77 bar → 777 kPa), war ' + kpa);
  await p1.evaluate(() => GemaAutoSave.save());
  await p1.waitForTimeout(400);
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForTimeout(2400);
  const nachReload = await p1.inputValue('#vfd_pv');
  ok(Math.abs(parseFloat(nachReload) - 777) < 0.5,
    'Reload rechnet NICHT nochmals um (isTrusted-Regel), war ' + nachReload);
  ok(await p1.isChecked('#unitPressureToggle'), 'Reload: Einheit bleibt kPa');
  /* Und die Gegenprobe im Tab-Wechsel: der Snapshot merkt sich seine Einheit,
     der zweite Tab steht noch auf bar. */
  await p1.click('#gbtLeiste .gbt-tab >> nth=0');
  await p1.waitForTimeout(500);
  const tab1 = await p1.inputValue('#vfd_pv');
  ok(Math.abs(parseFloat(tab1) - 777) < 0.5 || Math.abs(parseFloat(tab1) - 7.77) < 0.01,
    'Tab-Wechsel liefert den Wert in einer der beiden Einheiten, nicht mal 100 (war ' + tab1 + ')');
  await p1.close();

  /* ── B1b: derselbe Helfer in einem strukturell anderen Modul ── */
  console.log('— B1b: gleicher Helfer in sb_grundleitungen (Zeilen in JSON-Textarea) —');
  const p1b = await ctx.newPage();
  p1b.on('pageerror', e => fehler.push('grundleitungen: ' + e.message));
  await p1b.goto(BASE + '/sb_grundleitungen.html?objekt=obj_t1', { waitUntil: 'domcontentloaded' });
  await p1b.waitForTimeout(2600);
  ok(await p1b.locator('#gbtLeiste .gbt-tab').count() === 1, 'Leiste hängt sich selbst ein (kein Modul-Markup)');
  await p1b.evaluate(() => { if (window.glQAdd) glQAdd('fallstrang', 'a1'); });
  await p1b.waitForTimeout(600);
  const zeilenA = await p1b.evaluate(() => (document.getElementById('gl_rows') || {}).value || '');
  await p1b.click('#gbtLeiste .gbt-add');
  await p1b.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1b.click('.gema-dlg-bg .gema-dlg-confirm');
  await p1b.waitForTimeout(900);
  const zeilenNeu = await p1b.evaluate(() => (document.getElementById('gl_rows') || {}).value || '');
  ok(zeilenNeu !== zeilenA && zeilenNeu.length < zeilenA.length,
    'neue Berechnung startet mit dem Grundzustand (dynamische Zeilen weg)');
  await p1b.click('#gbtLeiste .gbt-tab >> nth=0');
  await p1b.waitForTimeout(900);
  ok((await p1b.evaluate(() => (document.getElementById('gl_rows') || {}).value || '')) === zeilenA,
    'Zurückwechseln stellt die Zeilen wieder her (Modul-Restore läuft über input/change selbst)');
  await p1b.close();

  /* ── B1c: Modul mit eigenem _GemaDB-Blob (Zustand NICHT im AutoSave) ── */
  console.log('— B1c: gleicher Helfer in sb_du_zusammenstellung (_GemaDB-Blob) —');
  const p1c = await ctx.newPage();
  p1c.on('pageerror', e => fehler.push('du_zusammenstellung: ' + e.message));
  await p1c.goto(BASE + '/sb_du_zusammenstellung.html?objekt=obj_t1', { waitUntil: 'domcontentloaded' });
  await p1c.waitForTimeout(2600);
  const setzeDu = (v) => p1c.evaluate(val => {
    const el = document.getElementById('qty_URW');
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  await setzeDu('5');
  await p1c.waitForTimeout(700);
  await p1c.click('#gbtLeiste .gbt-add');
  await p1c.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1c.click('.gema-dlg-bg .gema-dlg-confirm');
  await p1c.waitForTimeout(1100);
  ok((await p1c.inputValue('#qty_URW')) === '',
    'neue Berechnung startet leer — auch wenn der Zustand im Blob liegt (resetSaved)');
  await setzeDu('12');
  await p1c.waitForTimeout(700);
  await p1c.click('#gbtLeiste .gbt-tab >> nth=0');
  await p1c.waitForTimeout(1200);
  ok((await p1c.inputValue('#qty_URW')) === '5', 'Zurückwechseln holt den Blob des ersten Tabs');
  await p1c.click('#gbtLeiste .gbt-tab >> nth=1');
  await p1c.waitForTimeout(1200);
  ok((await p1c.inputValue('#qty_URW')) === '12', 'und wieder den des zweiten (Blob wandert mit)');
  await p1c.close();

  /* ── B2: Workspace — Kachel-Text überlappt die Buttons nicht ── */
  console.log('— B2: Workspace — Kachel-Layout (Titel vs. 📄/✕) —');
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => fehler.push('workspace: ' + e.message));
  await p2.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2000);
  await p2.click('.ws-bucket-row:has-text("Kachel-Eimer")');
  await p2.waitForTimeout(900);
  const overlap = await p2.evaluate(() => {
    const res = [];
    document.querySelectorAll('.ws-mod-tile:not(.ws-mod-tile--add)').forEach(tile => {
      const name = tile.querySelector('.ws-mod-tile-name');
      if (!name) return;
      const nr = name.getBoundingClientRect();
      tile.querySelectorAll('.ws-icon-btn').forEach(btn => {
        const br = btn.getBoundingClientRect();
        const x = Math.max(0, Math.min(nr.right, br.right) - Math.max(nr.left, br.left));
        const y = Math.max(0, Math.min(nr.bottom, br.bottom) - Math.max(nr.top, br.top));
        if (x > 1 && y > 1) res.push(name.textContent.trim() + ' überlappt Button um ' + Math.round(x) + 'px');
      });
    });
    return res;
  });
  ok(overlap.length === 0, 'kein Kachel-Titel überlappt die Icon-Buttons' + (overlap.length ? ' — ' + overlap.join('; ') : ''));
  ok(await p2.locator('.ws-mod-tile').count() >= 3, 'Kacheln gerendert (Messung hat Substanz)');

  /* ── B3: Workspace — Phasen-Wechsel ── */
  console.log('— B3: Workspace — Phasen-Wechsel mit eingefrorener Kopie —');
  await p2.click('.ws-bucket-row:has-text("Phasen-Eimer")');
  await p2.waitForTimeout(900);
  ok(await p2.locator('#wsPhaseSel').count() === 1, 'Phasen-Auswahl im Eimer-Kopf');
  ok((await p2.inputValue('#wsPhaseSel')) === '', 'Start: Keine Phase');
  // Nein-Weg: Auswahl wird zurückgestellt
  await p2.selectOption('#wsPhaseSel', 'vorprojekt');
  await p2.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p2.waitForTimeout(200);
  ok(await p2.evaluate(() => (document.activeElement && document.activeElement.className || '').includes('gema-dlg-cancel')),
    'Phasen-Dialog: Abbrechen vorausgewählt (Standard «Nein»)');
  await p2.click('.gema-dlg-bg .gema-dlg-cancel');
  await p2.waitForTimeout(300);
  ok((await p2.inputValue('#wsPhaseSel')) === '', 'Nein stellt die Auswahl zurück');
  ok(!(await p2.evaluate(() => localStorage.getItem('gema_druckerhoehung__obj_w1@vorprojekt'))), 'Nein kopiert nichts');
  // Ja-Weg
  await p2.selectOption('#wsPhaseSel', 'vorprojekt');
  await p2.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p2.click('.gema-dlg-bg .gema-dlg-confirm');
  await p2.waitForTimeout(1200);
  const nachher = await p2.evaluate(() => ({
    kopie: localStorage.getItem('gema_druckerhoehung__obj_w1@vorprojekt'),
    orig: localStorage.getItem('gema_druckerhoehung__obj_w1'),
    aktivePhase: (function(){ try {
      var d = JSON.parse(localStorage.getItem('gema_objekte_v1') || '{}');
      var o = (d.objekte || []).find(x => x.id === 'obj_w1');
      return o ? (o.aktivePhase || '') : '?';
    } catch(e) { return 'err'; } })(),
    selWert: (document.getElementById('wsPhaseSel') || {}).value
  }));
  ok(!!nachher.kopie && nachher.kopie.includes('"vfd_pv":"3"'), 'Berechnungs-Stand in die neue Phase übernommen (@vorprojekt-Kopie)');
  ok(!!nachher.orig && nachher.orig.includes('"vfd_pv":"3"'), 'alter Stand bleibt physisch liegen (eingefroren, nichts wegkopiert)');
  ok(nachher.aktivePhase === 'vorprojekt', 'obj.aktivePhase automatisch nachgeführt («Phase in der Berechnung passt sich an»)');
  ok(nachher.selWert === 'vorprojekt', 'Auswahl zeigt die neue Phase');
  ok(await p2.locator('.ws-phasen:has-text("Ohne Phase")').count() === 1, 'Ordner «Ohne Phase» unten aufrufbar');
  await p2.click('.ws-phasen-head');
  await p2.waitForTimeout(400);
  const frozenHref = await p2.evaluate(() => {
    const a = document.querySelector('.ws-mod-tile--frozen'); return a ? a.getAttribute('href') : '';
  });
  ok(frozenHref.includes('objekt=obj_w1') && frozenHref.includes('phase=') && frozenHref.includes('eingefroren=1'),
    'eingefrorene Kachel öffnet ?objekt&phase&eingefroren=1 — ' + frozenHref);
  ok(await p2.locator('.ws-mod-tile--frozen .ws-icon-btn').count() === 0, 'eingefrorene Kachel ohne Entfernen/Feedback-Knöpfe');
  // Zurückwechseln: bestehende Ziel-Daten GEWINNEN (nichts überschreiben)
  await p2.evaluate(() => localStorage.setItem('gema_druckerhoehung__obj_w1@vorprojekt', JSON.stringify({ vfd_pv: '9', _ts: 2 })));
  await p2.selectOption('#wsPhaseSel', '');
  await p2.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p2.click('.gema-dlg-bg .gema-dlg-confirm');
  await p2.waitForTimeout(1200);
  const zurueck = await p2.evaluate(() => ({
    orig: localStorage.getItem('gema_druckerhoehung__obj_w1'),
    ordner: Array.from(document.querySelectorAll('.ws-phasen-name')).map(e => e.textContent.trim())
  }));
  ok(zurueck.orig.includes('"vfd_pv":"3"'), 'Zurückwechseln überschreibt bestehende Daten NICHT (Ziel war belegt)');
  ok(zurueck.ordner.some(t => t.includes('Vorprojekt')), 'Ordner der verlassenen Phase (SIA 31 · Vorprojekt) angelegt');
  ok(!zurueck.ordner.some(t => t === 'Ohne Phase'), 'Ordner der ZIEL-Phase entfernt (deren Stand ist wieder der lebende)');
  await p2.close();

  /* ── B4: eingefrorene Modul-Ansicht ── */
  console.log('— B4: Modulseite mit ?phase=…&eingefroren=1 (nur Lesen, Export bleibt) —');
  const p3 = await ctx.newPage();
  p3.on('pageerror', e => fehler.push('frozen: ' + e.message));
  await p3.goto(BASE + '/sb_druckerhoehung.html?objekt=obj_w1&phase=vorprojekt&eingefroren=1', { waitUntil: 'domcontentloaded' });
  await p3.waitForTimeout(2400);
  ok(await p3.locator('#_gemaFrozenBanner').count() === 1, 'Banner «Eingefrorener Stand» sichtbar');
  ok((await p3.locator('#_gemaFrozenBanner').innerText()).includes('Vorprojekt'), 'Banner nennt die Phase');
  ok(await p3.evaluate(() => document.getElementById('vfd_pv').disabled), 'Eingabefelder gesperrt');
  const frozenSave = await p3.evaluate(() => {
    const key = 'gema_druckerhoehung__obj_w1@vorprojekt';
    const vorher = localStorage.getItem(key);
    try { GemaAutoSave.save(); } catch(e) {}
    return { unveraendert: localStorage.getItem(key) === vorher,
             frozen: GemaObjekte.isEingefroren(), phase: GemaObjekte.getActivePhase() };
  });
  ok(frozenSave.frozen === true, 'GemaObjekte.isEingefroren() aktiv');
  ok(frozenSave.phase === 'vorprojekt', 'getActivePhase folgt dem URL-Override');
  ok(frozenSave.unveraendert, 'GemaAutoSave.save() ist ein No-Op — Datums-Stempel bleibt auf dem eingefrorenen Stand');
  const pdfKnopf = await p3.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => /PDF|Druck/i.test(x.textContent || ''));
    return b ? !b.disabled : null;
  });
  ok(pdfKnopf !== false, 'Export-/Druck-Knöpfe bleiben bedienbar (nur Felder gesperrt)');
  await p3.close();

  ok(fehler.length === 0, 'keine Seitenfehler' + (fehler.length ? ' — ' + fehler.join(' | ') : ''));
  await browser.close();
  server.close();
  abschluss();
}

function abschluss() {
  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
  process.exit(fail ? 1 : 0);
}
