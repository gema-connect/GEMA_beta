/* Drift-Guard: Feedback 12.08.2026 (Sandro Caso, 3 Punkte)
 *
 *  1. sb_druckerhoehung — Berechnungs-Tabs: erstellen (＋), umbenennen
 *     (Rechtsklick), löschen (rotes ✕ mit Bestätigung, Vorauswahl «Nein»);
 *     jeder Tab hält seine eigene Berechnung (hx_anlagen-Muster).
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
import { readFileSync } from 'node:fs';
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

console.log('— A5: sb_druckerhoehung.html (Berechnungs-Tabs) —');
const de = lese('sb_druckerhoehung.html');
ok(de.includes('<textarea id="de_tabs"'), 'Tab-Zustand im hidden #de_tabs (AutoSave pro Objekt+Phase)');
ok(de.includes('<script src="gema_dialog.js"></script>'), 'gema_dialog.js eingebunden');
ok(de.includes('<div class="de-ctabs no-print" id="deCtabs">'), 'Tab-Leiste über den Einheiten-Toggles');
ok(/window\.deTabNeu=function/.test(de) && /window\.deTabSwitch=function/.test(de)
  && /window\.deTabLoeschen=function/.test(de) && /window\.deTabCtx=function/.test(de),
  'deTabNeu/Switch/Loeschen/Ctx window-exponiert (Inline-Handler)');
ok(de.includes("class=\"de-ctab'") && !/deaRender[\s\S]{0,600}class="g-tab/.test(de),
  'Tab-Buttons als .de-ctab — NICHT .g-tab (globaler g-tab-Listener würfe auf data-tab-lose Tabs)');
ok(de.includes('<span class="de-ctab-x"'), '✕ als SPAN im Button (Button-in-Button ist ungültiges Markup)');
ok(de.includes('focusCancel:true') && de.includes("cancelLabel:'Nein, behalten'"),
  'Lösch-Confirm mit Vorauswahl «Nein»');
ok(/danger:true,focusCancel:true/.test(de), 'Lösch-Confirm ist danger (roter Bestätigen-Button)');
ok(de.includes('@media print') && /\.de-ctabs\s*\{\s*display:\s*none/.test(de),
  'Tab-Leiste nicht im Ausdruck');
ok(de.includes('_pUnit') && de.includes('_fUnit') && /sp==='bar'\?100:1\/100/.test(de),
  'Snapshot merkt sich seine Einheit — Anwenden rechnet bar/kPa + l/s·m³/h um');
ok(de.includes('setVfdKat') && de.includes('setVesKat') && /deaApply/.test(de),
  'LU-Buttons folgen NICHT dem Feldwert → nach dem Anwenden setVfdKat/setVesKat');
ok(de.indexOf('window.deTabSwitch=function') < de.indexOf("GemaAutoSave.init('druckerhoehung')"),
  'Tabs-Block VOR der AutoSave-Init (Defaults werden vor dem Restore eingefroren)');
// Löschen räumt den Snapshot des gelöschten Tabs ab, BEVOR aktiv umgesetzt wird
ok(/DEA\.list=DEA\.list\.filter\(function\(x\)\{return x\.id!==DEA\.aktiv;\}\);\s*delete DEA\.snaps\[DEA\.aktiv\];/.test(de),
  'Löschen entfernt den Snapshot des gelöschten Tabs');

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
  ok(await p1.locator('#deCtabs .de-ctab').count() === 1, 'Start: eine Berechnung («Berechnung 1»)');
  await p1.fill('#vfd_pv', '7.77');
  await p1.click('#deCtabs .de-ctab-add');
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.fill('#_gdInput', 'Variante B');
  await p1.click('.gema-dlg-bg .gema-dlg-confirm');
  await p1.waitForTimeout(400);
  ok(await p1.locator('#deCtabs .de-ctab').count() === 2, '＋ legt zweiten Tab an');
  ok((await p1.locator('#deCtabs .de-ctab.active .de-ctab-name').innerText()) === 'Variante B', 'neuer Tab aktiv + benannt');
  ok((await p1.inputValue('#vfd_pv')) !== '7.77', 'neue Berechnung startet leer (übernimmt NICHT die Werte)');
  await p1.click('#deCtabs .de-ctab >> nth=0');
  await p1.waitForTimeout(300);
  ok((await p1.inputValue('#vfd_pv')) === '7.77', 'Zurückwechseln stellt die Werte des ersten Tabs wieder her');
  // Umbenennen per Rechtsklick
  await p1.click('#deCtabs .de-ctab >> nth=1', { button: 'right' });
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.fill('#_gdInput', 'Windkessel-Variante');
  await p1.click('.gema-dlg-bg .gema-dlg-confirm');
  await p1.waitForTimeout(300);
  ok((await p1.locator('#deCtabs .de-ctab >> nth=1').innerText()).includes('Windkessel-Variante'), 'Rechtsklick benennt um');
  // Löschen: Vorauswahl «Nein» — Enter darf NICHT löschen
  await p1.click('#deCtabs .de-ctab >> nth=1');
  await p1.waitForTimeout(250);
  await p1.click('#deCtabs .de-ctab.active .de-ctab-x');
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.waitForTimeout(200);
  ok(await p1.evaluate(() => (document.activeElement && document.activeElement.className || '').includes('gema-dlg-cancel')),
    'Lösch-Dialog: Abbrechen-Button vorausgewählt (Standard «Nein»)');
  await p1.keyboard.press('Enter');
  await p1.waitForTimeout(300);
  ok(await p1.locator('.gema-dlg-bg').count() === 0 && await p1.locator('#deCtabs .de-ctab').count() === 2,
    'Enter = Nein — Tab bleibt bestehen');
  await p1.click('#deCtabs .de-ctab.active .de-ctab-x');
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.click('.gema-dlg-bg .gema-dlg-danger');
  await p1.waitForTimeout(300);
  ok(await p1.locator('#deCtabs .de-ctab').count() === 1, 'Ja, löschen entfernt den Tab');
  ok(await p1.locator('#deCtabs .de-ctab .de-ctab-x').count() === 0, 'letzter Tab hat kein ✕ (nie alle löschen)');
  // Persistenz über Reload (AutoSave → de_tabs + aktive Felder)
  await p1.click('#deCtabs .de-ctab-add');
  await p1.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await p1.fill('#_gdInput', 'Variante C');
  await p1.click('.gema-dlg-bg .gema-dlg-confirm');
  await p1.waitForTimeout(300);
  await p1.fill('#vfd_pv', '4.44');
  await p1.evaluate(() => GemaAutoSave.save());
  await p1.waitForTimeout(500);
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await p1.waitForTimeout(2400);
  ok(await p1.locator('#deCtabs .de-ctab').count() === 2, 'Reload: beide Tabs wiederhergestellt');
  ok((await p1.locator('#deCtabs .de-ctab.active .de-ctab-name').innerText()) === 'Variante C', 'Reload: aktiver Tab bleibt aktiv');
  ok((await p1.inputValue('#vfd_pv')) === '4.44', 'Reload: Werte des aktiven Tabs da (AutoSave)');
  await p1.click('#deCtabs .de-ctab >> nth=0');
  await p1.waitForTimeout(300);
  ok((await p1.inputValue('#vfd_pv')) === '7.77', 'Reload: Snapshot des ersten Tabs übersteht (de_tabs)');
  await p1.close();

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
