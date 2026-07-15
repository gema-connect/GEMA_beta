#!/usr/bin/env node
/* Planablage — Playwright-Smoke-Test
 * Deckt ab: Zugriff/Gating (Planer, Monteur read, Garagist deny, cross-org
 * Freigabe via E-Mail), Upload-Flow (Storage-Mock inkl. 413-LIMIT-Branch),
 * PDF-Viewer-Annotation (pdf.js gestubbt: Rechteck zeichnen → normierte
 * Koordinaten → Autosave in den Annot-Pool, Undo), Pin→Pendenz-Preset,
 * Pendenzen-Statusmaschine im UI (Monteur erledigt, Verwalter prüft/weist
 * zurück) + Notifications, Deep-Link ?p=.
 * PostgREST-Mock liefert geseedete Pools im Row-Format (Muster if_arbeitskleider).
 * Ausführen: CHROME=<chromium> node scripts/planablage_smoke_test.mjs  (aus scripts/)
 */
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}

// pdf.js-Stub: 2 Seiten à 800×600 @scale 1 — kein Netz, kein Worker.
const PDFJS_STUB = 'window.pdfjsLib={GlobalWorkerOptions:{},getDocument:function(){return{promise:Promise.resolve({numPages:2,getPage:function(){return Promise.resolve({getViewport:function(o){return{width:800*o.scale,height:600*o.scale}},render:function(){return{promise:Promise.resolve()}}})}})}}};';

// Geseedete Cloud-Pools als PostgREST-Rows (bindCollection-Format)
function rows(prefix, arr) {
  return arr.map(r => ({ data_key: prefix + r.id, payload: { data: r, _lm: 1 } }));
}
const DOK = {
  id: 'd1', orgId: 'org_test', objektId: '', objektName: '', name: 'Grundriss EG Sanitär',
  kategorie: 'plan', datei: { name: 'grundriss_eg.pdf', url: BASE + '/fake.pdf', size: 4200000, mime: 'application/pdf' },
  freigaben: [{ email: 'extern@partner.ch', recht: 'lesen' }, { email: 'chef@partner.ch', recht: 'bearbeiten' }],
  kommentare: [], hochgeladenVon: { userId: 'u_x', name: 'PL' }, hochgeladenAm: '2026-07-10T08:00:00.000Z'
};
const PEND = {
  id: 'p1', orgId: 'org_test', status: 'offen', titel: 'Durchbruch Steigzone fehlt',
  beschrieb: 'Kernbohrung 120 mm gemäss Plan', objektId: '', objektName: '', dokId: 'd1', seite: 1,
  pin: { x: 0.4, y: 0.3 }, prioritaet: 'hoch', fotos: [], kommentare: [],
  zustaendig: { userId: '', name: '', email: 'monteur@firma.ch' },
  erstelltVon: { userId: 'u_ersteller', name: 'Projektleiterin' }, erstelltAm: '2026-07-12T08:00:00.000Z'
};

// PostgREST-Mock NACH newPage registrieren (LIFO — gewinnt vor wireRoutes)
async function mockPools(ctx, opts) {
  opts = opts || {};
  await ctx.route('**/*', route => {
    const u = route.request().url();
    const meth = route.request().method();
    if (u.includes('/gema_data') && meth === 'GET' && u.includes('module_key=eq.planablage')) {
      let body = [];
      if (u.includes('pabd')) body = rows('pabd:', opts.doks || []);
      else if (u.includes('pabp')) body = rows('pabp:', opts.pends || []);
      else if (u.includes('paba')) body = rows('paba:', opts.annots || []);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (u.includes('cdnjs.cloudflare.com') && u.includes('pdf.min.js')) {
      return route.fulfill({ contentType: 'text/javascript', body: PDFJS_STUB });
    }
    if (u.includes('/storage/v1/object/') && meth === 'POST') {
      if (opts.storage413) return route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fallback();
  });
}

async function openPage(browser, roleIds, opts) {
  const seedObj = seed(roleIds);
  if (opts && opts.userPatch) Object.assign(seedObj.gema_users_v1[0], opts.userPatch);
  const { ctx, page } = await newPage(browser, seedObj);
  await mockPools(ctx, opts);
  await page.goto(BASE + '/pm_planablage.html' + ((opts && opts.query) || ''), { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}
async function waitBoot(page) {
  await page.waitForFunction(() => window._pabHooks && window._pabHooks.cloudLoaded(), null, { timeout: 9000 });
}
async function dlgConfirm(page) {
  await page.waitForSelector('.gema-dlg-bg .gema-dlg-btn[data-act="ok"]', { timeout: 5000 });
  await page.click('.gema-dlg-bg .gema-dlg-btn[data-act="ok"]');
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });

// ── 1) Planer: Boot, Karten, Freigaben, Kommentar ────────────────────
console.log('■ Planer (write) — Boot, Dokument-Karte, Freigaben');
{
  const { ctx, page } = await openPage(browser, ['role_planer'], { doks: [DOK], pends: [PEND] });
  await waitBoot(page);
  ok(await page.evaluate(() => _pabHooks.dokAll().length) === 1, 'geseedetes Dokument aus dem Cloud-Pull sichtbar');
  ok(await page.evaluate(() => document.body.textContent.includes('Grundriss EG Sanitär')), 'Dokument-Karte gerendert');
  ok(await page.evaluate(() => document.body.textContent.includes('4.0 MB')), 'Dateigrösse formatiert (pabFmtSize)');
  ok(await page.evaluate(() => document.getElementById('btnUpload').style.display !== 'none'), 'Upload-Button für Planer sichtbar');
  ok(await page.evaluate(() => _pabHooks.kannBearbeiten(_pabHooks.dokById('d1'))), 'Planer (eigene Org, write) darf bearbeiten');

  // Freigaben-Modal: bestehende Freigaben gelistet, neue E-Mail ergänzen
  await page.evaluate(() => pabFreigaben('d1'));
  await page.waitForSelector('#frgList');
  ok(await page.evaluate(() => document.querySelectorAll('#frgList .frg-row').length) === 2, 'bestehende Freigaben im Modal (2 Zeilen)');
  await page.fill('#frg_mail', 'Neu@Extern.CH');
  await page.evaluate(() => pabFreiAdd());
  ok(await page.evaluate(() => !!document.querySelector('#frgList .frg-row[data-mail="neu@extern.ch"]')), 'neue E-Mail normalisiert als Zeile ergänzt');
  await page.evaluate(() => pabFreiSave('d1'));
  const frei = await page.evaluate(() => _pabHooks.dokById('d1').freigaben);
  ok(frei.length === 3 && frei.some(f => f.email === 'neu@extern.ch' && f.recht === 'lesen'), 'Freigaben gespeichert (neue Adresse mit «lesen»)');

  // Kommentar
  await page.evaluate(() => pabKommentare('d1'));
  await page.fill('#km_text', 'Bitte Version B beachten');
  await page.evaluate(() => pabKommentarSave('d1'));
  ok(await page.evaluate(() => (_pabHooks.dokById('d1').kommentare || []).length) === 1, 'Kommentar am Dokument gespeichert');
  await page.evaluate(() => pabCloseModal());

  // Pendenzen-Tab: KPI + Karte + Statusmaschine (prüfen als Verwalter)
  await page.evaluate(() => _pabHooks.setTab('pend'));
  ok(await page.evaluate(() => document.body.textContent.includes('Durchbruch Steigzone fehlt')), 'Pendenz-Karte gerendert');
  const kannPruefenVorher = await page.evaluate(() => !!document.querySelector('#pend_p1 button[onclick*="pruefen"]'));
  ok(!kannPruefenVorher, 'offene Pendenz zeigt kein «Geprüft» (erst nach Erledigung)');
  await page.evaluate(() => pabPendAktion('p1', 'erledigen'));
  await dlgConfirm(page);
  await page.waitForFunction(() => _pabHooks.pendById('p1').status === 'erledigt');
  ok(true, 'Pendenz offen → erledigt (Confirm-Dialog)');
  await page.evaluate(() => pabPendAktion('p1', 'pruefen'));
  await dlgConfirm(page);
  await page.waitForFunction(() => _pabHooks.pendById('p1').status === 'geprueft');
  ok(true, 'Pendenz erledigt → geprüft (Verwalter)');
  // Zurückweisen (Prompt mit Grund) → offen + Kommentar
  await page.evaluate(() => pabPendAktion('p1', 'zurueckweisen'));
  await page.waitForSelector('.gema-dlg-input');
  await page.fill('.gema-dlg-input', 'Bohrung an falscher Stelle');
  await page.click('.gema-dlg-bg .gema-dlg-btn[data-act="ok"]');
  await page.waitForFunction(() => _pabHooks.pendById('p1').status === 'offen');
  const kom = await page.evaluate(() => _pabHooks.pendById('p1').kommentare);
  ok(kom.some(k => k.text === 'Bohrung an falscher Stelle'), 'Zurückweisen → offen + Grund als Kommentar');
  await ctx.close();
}

// ── 2) PDF-Viewer: Annotation zeichnen, Autosave, Undo, Pin ──────────
console.log('■ Viewer — Rechteck zeichnen → Annot-Pool, Undo, Pin→Pendenz');
{
  const { ctx, page } = await openPage(browser, ['role_planer'], { doks: [DOK], pends: [PEND] });
  await waitBoot(page);
  await page.evaluate(() => pabViewerOpen('d1'));
  await page.waitForFunction(() => document.getElementById('pvWrap').classList.contains('open') && document.getElementById('pvCanvas').width > 100, null, { timeout: 6000 });
  ok(true, 'Viewer offen, Canvas gerendert (pdf.js-Stub)');
  ok(await page.evaluate(() => document.getElementById('pvPg').textContent) === 'Seite 1 / 2', 'Seitenzähler «Seite 1 / 2»');
  ok(await page.evaluate(() => document.querySelectorAll('#pvSvg .pv-pin').length) === 1, 'Pendenz-Pin der Seite 1 im Overlay');

  // Rechteck über Pointer-Events zeichnen
  await page.evaluate(() => pabTool('rect'));
  const box = await page.evaluate(() => { const r = document.getElementById('pvSvg').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.6, box.y + box.h * 0.5, { steps: 4 });
  await page.mouse.up();
  const shp = await page.evaluate(() => _pabHooks.seiteShapes());
  ok(shp.length === 1 && shp[0].typ === 'rect', 'Rechteck-Shape angelegt');
  ok(shp[0].x1 > 0.1 && shp[0].x1 < 0.3 && shp[0].x2 > 0.5 && shp[0].x2 < 0.7, 'Koordinaten normiert 0..1 (zoom-unabhängig)');
  ok(shp[0].von && shp[0].von.userId === 'u_test', 'Shape trägt Autor (von.userId)');
  await page.waitForFunction(() => (_pabHooks.annotFor('d1') || {}).seiten && _pabHooks.annotFor('d1').seiten['1'] && _pabHooks.annotFor('d1').seiten['1'].length === 1, null, { timeout: 4000 });
  ok(true, 'Autosave: Annotation im Pool-Record (paba, Seite «1»)');

  // Undo entfernt das eigene Shape
  await page.evaluate(() => pabUndo());
  ok(await page.evaluate(() => _pabHooks.seiteShapes().length) === 0, 'Undo entfernt letztes eigenes Shape');

  // Pin-Werkzeug öffnet die Pendenz-Erfassung mit Preset
  await page.evaluate(() => pabTool('pin'));
  await page.mouse.click(box.x + box.w * 0.35, box.y + box.h * 0.7);
  await page.waitForSelector('#pd_pin', { state: 'attached', timeout: 4000 });
  const pin = await page.evaluate(() => JSON.parse(document.getElementById('pd_pin').value));
  ok(pin && pin.x > 0.25 && pin.x < 0.45 && pin.y > 0.6 && pin.y < 0.8, 'Pin-Klick → Pendenz-Modal mit normiertem Pin-Preset');
  ok(await page.evaluate(() => document.getElementById('pd_dok').value) === 'd1', 'Plan im Pendenz-Modal vorgewählt');
  await page.fill('#pd_titel', 'Neuer Punkt aus Pin');
  await page.evaluate(() => pabPendSave());
  await page.waitForFunction(() => _pabHooks.pendAll().some(p => p.titel === 'Neuer Punkt aus Pin' && p.pin && p.dokId === 'd1'));
  ok(true, 'Pendenz aus Pin gespeichert (dokId + pin persistiert)');
  await ctx.close();
}

// ── 3) Monteur: read-only Verwaltung, darf aber erledigen ────────────
console.log('■ Monteur — kein Upload/Verwalten, Pendenz abarbeiten erlaubt');
{
  const { ctx, page } = await openPage(browser, ['role_monteur'], { doks: [DOK], pends: [PEND] });
  await waitBoot(page);
  ok(await page.evaluate(() => !!document.getElementById('pabContent')), 'Monteur hat Zugriff (read)');
  ok(await page.evaluate(() => document.getElementById('btnUpload').style.display === 'none'), 'Upload-Button für Monteur ausgeblendet');
  ok(await page.evaluate(() => !_pabHooks.kannBearbeiten(_pabHooks.dokById('d1'))), 'Monteur darf Dokument nicht bearbeiten (kein write)');
  await page.evaluate(() => _pabHooks.setTab('pend'));
  ok(await page.evaluate(() => !!document.querySelector('#pend_p1 button[onclick*="erledigen"]')), '«✓ Erledigt»-Button für Monteur sichtbar');
  ok(await page.evaluate(() => !document.querySelector('#pend_p1 button[onclick*="\'pruefen\'"]')), 'kein «Geprüft»-Button (nur Verwalter)');
  await page.evaluate(() => pabPendAktion('p1', 'erledigen'));
  await dlgConfirm(page);
  await page.waitForFunction(() => _pabHooks.pendById('p1').status === 'erledigt');
  const p1 = await page.evaluate(() => _pabHooks.pendById('p1'));
  ok(p1.erledigtVon && p1.erledigtVon.userId === 'u_test', 'Monteur als Erlediger gestempelt');
  // Prüfen als Monteur wird hart geblockt (Guard vor der Statusmaschine)
  await page.evaluate(() => pabPendAktion('p1', 'pruefen'));
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => _pabHooks.pendById('p1').status) === 'erledigt', 'pruefen als Monteur bleibt wirkungslos (Guard)');
  const notif = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_notifications_v1') || '[]'));
  ok(notif.some(n => n.eventKey === 'plan_pendenz_erledigt' && n.empfaengerUserId === 'u_ersteller'), 'Notify plan_pendenz_erledigt an Ersteller');
  await ctx.close();
}

// ── 4) Cross-Org: Freigabe per E-Mail-Match ──────────────────────────
console.log('■ Cross-Org — Freigabe «lesen» vs. «bearbeiten» via E-Mail');
{
  const { ctx, page } = await openPage(browser, ['role_unternehmer'], {
    doks: [DOK], pends: [], userPatch: { orgId: 'org_fremd', username: 'chef@partner.ch', profile: { email: 'chef@partner.ch' } }
  });
  await waitBoot(page);
  ok(await page.evaluate(() => _pabHooks.dokAll().length) === 1, 'fremde Org sieht das freigegebene Dokument (E-Mail-Match)');
  ok(await page.evaluate(() => document.body.textContent.includes('für dich freigegeben')), 'Badge «für dich freigegeben»');
  ok(await page.evaluate(() => _pabHooks.kannBearbeiten(_pabHooks.dokById('d1'))), 'Freigabe «bearbeiten» → darf markieren');
  await ctx.close();

  const r2 = await openPage(browser, ['role_unternehmer'], {
    doks: [DOK], pends: [], userPatch: { orgId: 'org_fremd', username: 'extern@partner.ch', profile: { email: 'extern@partner.ch' } }
  });
  await waitBoot(r2.page);
  ok(await r2.page.evaluate(() => _pabHooks.dokAll().length) === 1, 'Freigabe «lesen»: Dokument sichtbar');
  ok(await r2.page.evaluate(() => !_pabHooks.kannBearbeiten(_pabHooks.dokById('d1'))), 'Freigabe «lesen»: bearbeiten verweigert');
  await r2.ctx.close();

  const r3 = await openPage(browser, ['role_unternehmer'], {
    doks: [DOK], pends: [], userPatch: { orgId: 'org_fremd', username: 'niemand@anders.ch', profile: { email: 'niemand@anders.ch' } }
  });
  await waitBoot(r3.page);
  ok(await r3.page.evaluate(() => _pabHooks.dokAll().length) === 0, 'ohne Freigabe: fremde Org sieht NICHTS');
  await r3.ctx.close();
}

// ── 5) Upload: Erfolg + 413-LIMIT-Branch ─────────────────────────────
console.log('■ Upload — Storage-Mock (Erfolg) und 413 → Limit-Dialog');
{
  const { ctx, page } = await openPage(browser, ['role_planer'], { doks: [] });
  await waitBoot(page);
  await page.evaluate(() => pabUploadOpen());
  await page.waitForSelector('#up_file');
  await page.setInputFiles('#up_file', { name: 'testplan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') });
  await page.fill('#up_name', 'Testplan OG');
  await page.evaluate(() => pabUploadStart());
  await page.waitForFunction(() => _pabHooks.dokAll().length === 1, null, { timeout: 6000 });
  const d = await page.evaluate(() => _pabHooks.dokAll()[0]);
  ok(d.name === 'Testplan OG' && d.kategorie === 'plan', 'Upload legt Dokument-Record an');
  ok(/\/storage\/v1\/object\/public\/gema-fotos\/planablage\/org_test\//.test(d.datei.url), 'Storage-URL im Record (public-Pfad, orgId-Ordner)');
  ok(d.datei.size === 13 && d.datei.mime === 'application/pdf', 'Grösse + MIME übernommen');
  await ctx.close();
}
{
  const { ctx, page } = await openPage(browser, ['role_planer'], { doks: [], storage413: true });
  await waitBoot(page);
  await page.evaluate(() => pabUploadOpen());
  await page.waitForSelector('#up_file');
  await page.setInputFiles('#up_file', { name: 'riesig.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 huge') });
  await page.evaluate(() => pabUploadStart());
  await page.waitForSelector('.gema-dlg-bg', { timeout: 6000 });
  ok(await page.evaluate(() => document.querySelector('.gema-dlg-bg').textContent.includes('Datei zu gross')), '413 → Limit-Dialog mit Supabase-Hinweis');
  ok(await page.evaluate(() => _pabHooks.dokAll().length) === 0, 'kein Record bei fehlgeschlagenem Upload');
  await ctx.close();
}

// ── 6b) Gewerk-Layer: Farben, Panel, 👁, Extern-Sicht, Autosave-Integrität ──
console.log('■ Layer — Multi-Farbe, Panel/👁-Toggle, Extern-Filter, kein Datenverlust');
const DOKL = Object.assign({}, DOK, { freigaben: [{ email: 'elektriker@ext.ch', recht: 'bearbeiten', gewerk: 'elektro' }] });
const ANNOT = { id: 'd1', orgId: 'org_test', aktualisiertAm: '2026-07-14T08:00:00.000Z', seiten: { '1': [
  { id: 's1', typ: 'rect', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3, farbe: '#111827', layer: 'sanitaer', von: { userId: 'u_x' } },
  { id: 's2', typ: 'rect', x1: 0.5, y1: 0.5, x2: 0.7, y2: 0.7, farbe: '#16a34a', layer: 'elektro', von: { userId: 'u_y' } },
  { id: 's3', typ: 'text', x1: 0.2, y1: 0.85, text: 'Alt ohne Layer', von: { userId: 'u_x' } }
] } };
const PSAN = Object.assign({}, PEND, { id: 'p_san', titel: 'Sanitär-Punkt', layer: 'sanitaer', pin: { x: 0.2, y: 0.2 }, zustaendig: null });
const PALT = Object.assign({}, PEND, { id: 'p_alt', titel: 'Allgemeiner Punkt', pin: { x: 0.8, y: 0.8 }, zustaendig: null });
{
  // Eigentümer-Org (Planer, Org-Kategorie sanitaerplaner)
  const { ctx, page } = await openPage(browser, ['role_planer'], { doks: [DOKL], pends: [PSAN, PALT], annots: [ANNOT] });
  await waitBoot(page);
  await page.evaluate(() => pabViewerOpen('d1'));
  await page.waitForFunction(() => document.getElementById('pvWrap').classList.contains('open') && document.getElementById('pvCanvas').width > 100, null, { timeout: 6000 });
  ok(await page.evaluate(() => _pabHooks.PV.sicht) === null, 'Eigentümer-Org: Layer-Sicht = alle (null)');
  ok(await page.evaluate(() => _pabHooks.PV.drawLayer) === 'sanitaer', 'Zeichen-Layer aus Org-Kategorie sanitaerplaner');
  ok(await page.evaluate(() => document.querySelectorAll('#pvSvg .shp').length) === 3, 'alle 3 Shapes sichtbar (3 Layer)');
  ok(await page.evaluate(() => _pabHooks.multi()), 'Multi-Layer-Modus aktiv (>1 Layer auf der Seite)');
  ok(await page.evaluate(() => document.querySelector('#pvSvg [data-sid="s1"]').getAttribute('stroke')) === '#16a34a', 'Multi-Blick: Sanitär-Shape in GEWERKFARBE (grün) statt freier Farbe');
  ok(await page.evaluate(() => document.querySelectorAll('#pvSvg .pv-pin').length) === 2, 'beide Pendenz-Pins sichtbar');
  // Layer-Panel: Elektro + Allgemein ausblenden → nur Sanitär → freie Farbe
  await page.evaluate(() => { pabLayerPanel(); pabLayerToggle('elektro', false); pabLayerToggle('allgemein', false); });
  ok(await page.evaluate(() => document.querySelectorAll('#pvSvg .shp').length) === 1, 'Layer-Toggle: nur noch Sanitär-Shape sichtbar');
  ok(await page.evaluate(() => document.querySelector('#pvSvg [data-sid="s1"]').getAttribute('stroke')) === '#111827', 'EIN Layer aktiv → frei gewählte Farbe');
  ok(await page.evaluate(() => document.querySelectorAll('#pvSvg .pv-pin').length) === 1, 'Allgemein-Pin ausgeblendet, Sanitär-Pin bleibt');
  // 👁 Master-Toggle: sauberer Plan
  await page.evaluate(() => pabEye());
  ok(await page.evaluate(() => document.querySelectorAll('#pvSvg .shp, #pvSvg .pv-pin').length) === 0, '👁: ALLE Markierungen + Pins ausgeblendet (sauberer Plan)');
  await page.evaluate(() => pabEye());
  ok(await page.evaluate(() => document.querySelectorAll('#pvSvg .shp').length) === 1, '👁 erneut: Markierungen wieder da (Layer-Wahl erhalten)');
  // Neues Shape landet auf dem gewählten Zeichen-Layer
  await page.evaluate(() => pabTool('rect'));
  const bx = await page.evaluate(() => { const r = document.getElementById('pvSvg').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.move(bx.x + bx.w * 0.75, bx.y + bx.h * 0.1);
  await page.mouse.down();
  await page.mouse.move(bx.x + bx.w * 0.9, bx.y + bx.h * 0.25, { steps: 3 });
  await page.mouse.up();
  ok(await page.evaluate(() => _pabHooks.seiteShapes().slice(-1)[0].layer) === 'sanitaer', 'neues Shape trägt den Zeichen-Layer (sanitaer)');
  await ctx.close();
}
{
  // Externer Elektriker (Freigabe «bearbeiten», Gewerk elektro, Default-Sicht)
  const { ctx, page } = await openPage(browser, ['role_unternehmer'], {
    doks: [DOKL], pends: [PSAN, PALT], annots: [ANNOT],
    userPatch: { orgId: 'org_fremd', username: 'elektriker@ext.ch', profile: { email: 'elektriker@ext.ch' } }
  });
  await waitBoot(page);
  const pend = await page.evaluate(() => _pabHooks.pendAll().map(p => p.titel));
  ok(pend.includes('Allgemeiner Punkt') && !pend.includes('Sanitär-Punkt'), 'Pendenzenliste: Elektriker sieht Sanitär-Pendenz NICHT (Layer-Grenze)');
  await page.evaluate(() => pabViewerOpen('d1'));
  await page.waitForFunction(() => document.getElementById('pvWrap').classList.contains('open') && document.getElementById('pvCanvas').width > 100, null, { timeout: 6000 });
  ok(JSON.stringify(await page.evaluate(() => _pabHooks.PV.sicht)) === JSON.stringify(['elektro', 'allgemein']), 'Extern-Sicht = eigenes Gewerk + Allgemein');
  ok(await page.evaluate(() => document.querySelectorAll('#pvSvg .shp').length) === 2, 'Sanitär-Shape für Elektriker NICHT gerendert');
  ok(await page.evaluate(() => !document.querySelector('#pvSvg [data-sid="s1"]')), 's1 (Sanitär) fehlt im Overlay');
  ok(await page.evaluate(() => _pabHooks.PV.drawLayer) === 'elektro', 'Zeichen-Layer fix aus der Freigabe (elektro)');
  ok(await page.evaluate(() => !document.getElementById('pvLayerSel')), 'kein Layer-Wechsel-Select für Externe');
  await page.evaluate(() => pabLayerPanel());
  ok(await page.evaluate(() => document.querySelectorAll('#pvLayerPanel .lyr-row').length) === 3, 'Layer-Panel zeigt nur die 2 erlaubten Layer (+ 👁-Zeile)');
  // Fremdes Shape (s2, anderer Autor) lässt sich nicht selektieren
  const bx2 = await page.evaluate(() => { const r = document.getElementById('pvSvg').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.click(bx2.x + bx2.w * 0.6, bx2.y + bx2.h * 0.6);
  ok(await page.evaluate(() => _pabHooks.PV.sel) === null, 'Extern: fremde Markierung nicht selektierbar (kein Löschen fremder Shapes)');
  // Eigenes Rechteck zeichnen → Autosave darf die UNSICHTBAREN Layer nicht wegwerfen
  await page.evaluate(() => pabTool('rect'));
  await page.mouse.move(bx2.x + bx2.w * 0.78, bx2.y + bx2.h * 0.7);
  await page.mouse.down();
  await page.mouse.move(bx2.x + bx2.w * 0.9, bx2.y + bx2.h * 0.82, { steps: 3 });
  await page.mouse.up();
  ok(await page.evaluate(() => _pabHooks.seiteShapes().slice(-1)[0].layer) === 'elektro', 'Extern zeichnet auf seinem Gewerk-Layer');
  await page.waitForFunction(() => { const a = _pabHooks.annotFor('d1'); return a && a.seiten && a.seiten['1'] && a.seiten['1'].length === 4; }, null, { timeout: 5000 });
  ok(await page.evaluate(() => _pabHooks.annotFor('d1').seiten['1'].some(s => s.id === 's1')), 'KRITISCH: Autosave des Externen erhält den (für ihn unsichtbaren) Sanitär-Layer');
  await ctx.close();
}
{
  // Freigabe-Dialog: Gewerk + Layer-Sicht Roundtrip
  const { ctx, page } = await openPage(browser, ['role_planer'], { doks: [DOKL] });
  await waitBoot(page);
  await page.evaluate(() => pabFreigaben('d1'));
  await page.waitForSelector('#frgList .frg-row');
  ok(await page.evaluate(() => document.querySelector('#frgList .frg-gewerk').value) === 'elektro', 'Gewerk-Select mit gespeichertem Wert (elektro)');
  ok(await page.evaluate(() => document.querySelector('#frgList .frg-sicht').value) === 'eigene', 'Layer-Sicht Default «Eigenes + Allgemein»');
  await page.evaluate(() => { document.querySelector('#frgList .frg-sicht').value = 'alle'; pabFreiSave('d1'); });
  ok(await page.evaluate(() => _pabHooks.dokById('d1').freigaben[0].layers) === 'alle', 'Sicht «Alle Layer» gespeichert (layers=alle)');
  // explizite Auswahl per Chips
  await page.evaluate(() => pabFreigaben('d1'));
  await page.waitForSelector('#frgList .frg-row');
  await page.evaluate(() => {
    const row = document.querySelector('#frgList .frg-row');
    row.querySelector('.frg-sicht').value = 'auswahl';
    row.querySelector('.lyr-chip[data-lyr="sanitaer"]').classList.add('on');
    row.querySelector('.lyr-chip[data-lyr="heizung"]').classList.add('on');
    pabFreiSave('d1');
  });
  ok(JSON.stringify(await page.evaluate(() => _pabHooks.dokById('d1').freigaben[0].layers)) === JSON.stringify(['sanitaer', 'heizung']), 'explizite Layer-Auswahl als Array gespeichert');
  await ctx.close();
}

// ── 6) Deep-Link + Gating ────────────────────────────────────────────
console.log('■ Deep-Link ?p= und Kein-Zugriff (Garagist)');
{
  const { ctx, page } = await openPage(browser, ['role_planer'], { doks: [DOK], pends: [PEND], query: '?p=p1' });
  await waitBoot(page);
  await page.waitForSelector('#pend_p1', { timeout: 5000 });
  ok(true, 'Deep-Link ?p= öffnet den Pendenzen-Tab mit der Karte');
  await ctx.close();
}
{
  const { ctx, page } = await openPage(browser, ['role_garagist'], {});
  await page.waitForTimeout(1600);
  ok(await page.evaluate(() => !document.getElementById('pabContent') || document.body.textContent.indexOf('Kein Zugriff') >= 0), 'Garagist → «Kein Zugriff»');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
