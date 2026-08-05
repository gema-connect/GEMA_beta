// Drift-Guard zum Feedback vom 05.08.2026 (Sandro Caso, 16 Punkte / 4 Module)
//
//   Druckerhöhung   (1) PDF-Titel je Modul statt «Druckerhöhung» überall
//                   (2) Schreibfehler «Förderköhe» → «Förderhöhe»
//                   (3) Kesselvolumen V_B als Zwischenergebnis über der Wahl
//   Frischwasserst. (4) Kaskaden-Schema ist DAS Anlagenschema — immer sichtbar,
//                       weiter oben; das frühere Durchlauf-Schema ist entfernt
//   Prüfliste       (5) PDF trägt die Adresse als Titel
//                   (6) Bauteil-Angaben zweizeilig eingerückt
//                   (7) Zustand «normal» (4. Stufe) + «nicht beurteilbar»
//   Workspace       (8) Aktivität mit ECHTER Zeit + Tag statt «gerade eben»
//                   (9) Mitgliederübersicht anwählbar
//                  (10) Übungs-/Lernraum-Eimer bei der Klasse einordnen
//                  (11) Lernmittel wählbar · markierbar · seitenweise teilbar
//                  (12) Lerngruppe: Dozent einladen + Feedback an der Berechnung
//
// Aufruf: CHROME=<chromium> node scripts/feedback_20260805_test.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { startServer, BASE, seed } from './rolematrix_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, i) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (i !== undefined ? ' — ' + JSON.stringify(i) : '')); } };
const lies = f => readFileSync(join(ROOT, f), 'utf8');

// ══════════════════════════════════════════════════════════════════════
// TEIL A — statisch
// ══════════════════════════════════════════════════════════════════════
console.log('■ A: Statische Verdrahtung');
{
  // (1) Jedes Modul hat seinen EIGENEN PDF-Titel (Copy-Paste-Fehler).
  //     Seit dem Umbau auf die A4-Druckansicht (Feedback 05.08.2026, Teil 2)
  //     steht der Titel im GemaPrint.open-Aufruf statt in GemaPDF.export —
  //     die Anforderung ist unverändert: der Titel wird zum Fenstertitel und
  //     damit zum PDF-Dateinamen, er darf sich zwischen Modulen nie doppeln.
  const titel = {};
  ['lt_hx_diagramm', 'hz_waermegruppen', 'sb_druckerhoehung', 'sb_fluessiggas',
   'hz_heizlast', 'hz_ausdehnungsgefaess', 'sb_druckanstieg'].forEach(f => {
    const src = lies(f + '.html');
    const m = /Gema(?:Print\.open|PDF\.export)\(\{\s*title:'([^']*)'/.exec(src);
    titel[f] = m ? m[1] : null;
  });
  ok(Object.values(titel).every(Boolean), 'alle 7 Module haben einen PDF-Titel', titel);
  ok(new Set(Object.values(titel)).size === 7, 'jeder PDF-Titel ist eigenständig', titel);
  ok(!Object.values(titel).some(t => /\uFFFD|Druckerh\?/.test(t || '')), 'keine kaputten Umlaute im Titel', titel);

  // (2) Schreibfehler
  const de = lies('sb_druckerhoehung.html');
  ok(!/Förderköhe/.test(de), 'Schreibfehler «Förderköhe» entfernt');
  // (3) V_B über der Behälterwahl
  ok(/data-demirror="ves_out_VB"/.test(de), 'V_B als Inline-Zwischenergebnis über der Behälterwahl');

  // (4) Frischwasserstation: EIN Schema, ohne display:none
  const fw = lies('sa_frischwasserstation.html');
  ok(!/_fwSchemaDraw/.test(fw) && !/id="fwSchema"/.test(fw), 'altes Durchlauf-Schema restlos entfernt');
  ok(/id="fwkSchemaCard"/.test(fw) && !/display:none;?"\s+id="fwkSchemaCard"/.test(fw), 'Anlagenschema-Karte ohne display:none');
  ok(/window\._fwKaskadeDraw=function\(res,k,kaskade\)/.test(fw)
     && /_fwKaskadeDraw\(res,k,true\)/.test(fw) && /_fwKaskadeDraw\(res,k,false\)/.test(fw),
     'Draw-Hook kennt den Kaskaden-Zustand');

  // (5)–(7) Prüfliste
  const pr = lies('pm_pruefliste.html');
  ok(/var titelBasis=adrKurz/.test(pr), 'Bericht-Titel baut auf der Adresse auf');
  ok(/btz-ein/.test(pr), 'Bauteil-Zeile mit Einrückung (zweizeilig)');
  ok(/normal:/.test(pr) && /nicht_beurteilbar:/.test(pr), 'Zustands-Stufen «normal» + «nicht beurteilbar»');
  ok(/PR_ZUSTAND_CHIPS/.test(pr) && /prZustandChips/.test(pr), 'Chip-Liste je Skala vorhanden');

  // (8)–(12) Workspace
  const ws = lies('sys_workspace.html');
  ok(!/when:'gerade eben'/.test(ws), 'kein fest gespeichertes «gerade eben» mehr');
  ok(/function _wsWann\(a\)/.test(ws) && /gestern, /.test(ws), 'Zeitangabe wird beim Rendern gerechnet');
  ok(/ws-meta-chip--btn/.test(ws) && /_wsMitglieder/.test(ws), 'Mitgliederübersicht ist anwählbar');
  ok(/_wsSubOfPick/.test(ws) && /_wsSubOfClear/.test(ws), 'Eimer bei einer Klasse einordnen');
  ok(/lerngruppe:\{label:'Lerngruppe'/.test(ws), 'Eimer-Typ «Lerngruppe»');
  ok(/_wsDozentEinladen/.test(ws) && /_wsDozentAdd/.test(ws), 'Dozent einladen');
  ok(/_wsModFeedback/.test(ws) && /_wsFbSenden/.test(ws), 'Feedback an der Berechnung');

  // Notify-Keys
  const nt = lies('gema_notify.js');
  ok(/schule_lerngruppe_einladung/.test(nt) && /schule_lerngruppe_feedback/.test(nt), 'beide Lerngruppen-Events registriert');
  ok(/schule_lerngruppe_einladung[\s\S]{0,120}modul:'schule'/.test(nt), 'Lerngruppen-Events hängen an der bestehenden Schul-Gruppe');

  // Lernmittel-Notizen im Schul-API
  const sa = lies('gema_schule_api.js');
  ok(/notizen:\s*\{prefix:'smatan:'/.test(sa), 'Notiz-Pool registriert');
  ok(/'klassen','material','aufgaben','pruefungen','notizen'/.test(sa), 'Notiz-Pool wird beim Boot gebunden');
  ok(/notizSeitenBereich/.test(sa) && /notizSichtbar/.test(sa), 'Sichtbarkeit + Seitenbereich als LESE-Regel');
  const ab = lies('ab_klassen.html');
  ok(/lmOpen/.test(ab) && /Öffnen &amp; markieren/.test(ab), 'Lernmittel öffnet im Reader');
  ok(/lmTeilenOpen/.test(ab) && /Nur Seiten/.test(ab), 'Teilen komplett ODER seitenweise');
}

// ══════════════════════════════════════════════════════════════════════
// TEIL B — im Browser
// ══════════════════════════════════════════════════════════════════════
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const KLASSE = { id: 'kl1', name: 'Kaltwasser HF 2026', orgId: 'org_test', archiviert: false,
  dozentIds: ['u_doz'], studentIds: ['u_test', 'u_kol'], module: [], erstelltAm: '2026-08-01T08:00:00Z' };
const MAT = { id: 'mat1', klasseId: 'kl1', orgId: 'org_test', titel: 'Skript Kaltwasser',
  datei: { name: 'skript.svg', type: 'image/svg+xml', url: BASE + '/icon-192.svg' },
  erstelltAm: '2026-08-01T09:00:00Z', von: 'u_doz', vonName: 'Dozent Test' };
const FREMD = { id: 'man_mat1__u_kol', matId: 'mat1', klasseId: 'kl1', userId: 'u_kol', userName: 'Kollegin Muster',
  orgId: 'org_test', seiten: { '1': [{ id: 's1', typ: 'marker', farbe: '#dc2626', x1: .1, y1: .1, x2: .5, y2: .16 }] },
  geteilt: { aktiv: true, modus: 'seiten', von: 1, bis: 1, anKlasse: true, anUserIds: [] } };
const PRIVAT = { id: 'man_mat1__u_fremd', matId: 'mat1', klasseId: 'kl1', userId: 'u_fremd', userName: 'Nicht Klasse',
  orgId: 'org_test', seiten: { '1': [{ id: 'sx', typ: 'marker', farbe: '#000', x1: .2, y1: .2, x2: .3, y2: .3 }] }, geteilt: null };
const USERS = [
  { id: 'u_test', username: 's@t.ch', name: 'Studi Test', roleIds: ['role_student'], orgId: 'org_test', active: true },
  { id: 'u_kol', username: 'k@t.ch', name: 'Kollegin Muster', roleIds: ['role_student'], orgId: 'org_test', active: true },
  { id: 'u_doz', username: 'd@t.ch', name: 'Dozent Test', roleIds: ['role_dozent'], orgId: 'org_test', active: true }
];
const ORG = { id: 'org_test', name: 'HF Schule', kategorie: 'schule', kategorien: ['schule'], admins: [], active: true };

const store = new Map();
const notifs = [];
function routes() {
  return async route => {
    const req = route.request(), u = req.url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
      if (req.method() === 'POST') {
        let rows = []; try { rows = JSON.parse(req.postData() || '[]'); } catch (e) {}
        if (!Array.isArray(rows)) rows = [rows];
        rows.forEach(r => {
          if (!r || !r.module_key || !r.data_key) return;
          store.set(r.module_key + '|' + r.data_key, (r.payload && r.payload.data) || null);
          if (r.module_key === 'notify') notifs.push((r.payload && r.payload.data) || {});
        });
        return route.fulfill({ contentType: 'application/json', body: '{}' });
      }
      if (req.method() === 'GET') {
        const gm = /module_key=eq\.([^&]+)/.exec(u);
        if (gm) {
          const mk = decodeURIComponent(gm[1]);
          const lk = /data_key=like\.([^&]+)/.exec(u);
          const pref = lk ? decodeURIComponent(lk[1]).replace(/\*$/, '') : '';
          const rows = [];
          store.forEach((data, key) => { const i = key.indexOf('|');
            if (key.slice(0, i) === mk && (!pref || key.slice(i + 1).indexOf(pref) === 0)) rows.push({ data_key: key.slice(i + 1), payload: { data } }); });
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
        }
        return route.fulfill({ contentType: 'application/json', body: '[]' });
      }
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    return route.abort();
  };
}
async function seite(datei, userId, roles, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.route('**/*', routes());
  const st = seed(roles);
  st.gema_users_v1 = USERS; st.gema_orgs_v1 = [ORG];
  st.gema_session_v1 = Object.assign({}, st.gema_session_v1, { userId: userId });
  st.gema_coachmarks_done_sys_workspace_v2 = '1';
  st.gema_schule_klassen_pool_v1 = JSON.stringify([KLASSE]);
  Object.assign(st, extra || {});
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, st);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  return { ctx, page, errs };
}

try {
  // ── B1: Frischwasserstation ──────────────────────────────────────────
  console.log('\n■ B1: Frischwasserstation — EIN Anlagenschema, immer sichtbar');
  {
    // eigener Planer-Benutzer: u_test ist in der Schul-Liste ein Studierender (harte Modul-Sperre)
    const { ctx, page, errs } = await seite('sa_frischwasserstation.html', 'u_pl', ['role_planer'], {
      gema_users_v1: [{ id: 'u_pl', username: 'p@t.ch', name: 'Planer Test', roleIds: ['role_planer'], orgId: 'org_test', active: true }]
    });
    ok(await page.$eval('#fwkSchemaCard', e => getComputedStyle(e).display !== 'none'), 'Schema ohne Kaskade sichtbar');
    ok(await page.$$eval('#fwkSchema svg', n => n.length) === 1, 'Schema gezeichnet');
    const eine = await page.$$eval('#fwkSchema text', n => n.filter(t => /^(FWS|W\d)$/.test(t.textContent)).length);
    ok(eine === 1, 'ohne Kaskade genau EINE Station', eine);
    ok(await page.evaluate(() => {
      const c = document.getElementById('fwkSchemaCard');
      const s2 = Array.from(document.querySelectorAll('.g-card h2')).find(h => /^2 · /.test(h.textContent));
      return !!(c && s2 && (c.compareDocumentPosition(s2) & Node.DOCUMENT_POSITION_FOLLOWING));
    }), 'Schema steht vor Abschnitt 2');
    await page.evaluate(() => { const c = document.getElementById('fwk_on'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(350);
    await page.evaluate(() => { const s = document.getElementById('fwk_n'); s.value = '3'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(350);
    const drei = await page.$$eval('#fwkSchema text', n => n.filter(t => /^W\d$/.test(t.textContent)).length);
    ok(drei === 3, 'mit Kaskade drei Stationen', drei);
    ok(errs.length === 0, 'keine JS-Fehler (' + errs.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ── B2: Workspace — Zeit, Mitglieder, Einordnen ──────────────────────
  console.log('\n■ B2: Workspace — Zeitangabe, Mitglieder, Einordnen');
  {
    const jetzt = Date.now(), iso = t => new Date(jetzt - t).toISOString();
    const KL = { id: 'ws_kl1', name: 'Klasse HF25', type: 'training', ownerType: 'org', ownerOrgId: 'org_test',
      createdBy: 'u_test', pinned: true, autoTyp: 'klasse', members: ['AB', 'CD'], modules: [],
      activity: [], beteiligte: [], notes: [], objektId: null, createdAt: iso(9e8) };
    const UE = { id: 'ws_ue1', name: 'Übungsumgebung', type: 'training', ownerType: 'personal',
      createdBy: 'u_test', members: ['SC'], modules: [],
      beteiligte: [{ name: 'Studi Test', role: 'Studierende', intern: true }],
      notes: [], objektId: null, createdAt: iso(8e8),
      activity: [
        { who: 'Studi', text: 'hat den Eimer erstellt', ts: iso(30 * 60 * 1000) },
        { who: 'Studi', text: 'hat Modul hinzugefügt', ts: iso(26 * 3600 * 1000) },
        { who: 'Studi', text: 'Uralt-Eintrag', when: 'gerade eben' }
      ] };
    store.set('workspace|ws:ws_kl1', KL); store.set('workspace|ws:ws_ue1', UE);
    const { ctx, page, errs } = await seite('sys_workspace.html', 'u_test', ['role_student'],
      { gema_ws_pool_v1: JSON.stringify([KL, UE]) });
    await page.evaluate(() => window._wsOpen('ws_ue1'));
    await page.waitForTimeout(500);
    const zeiten = await page.$$eval('.ws-activity-time', n => n.map(x => x.textContent.trim()));
    ok(zeiten.some(t => /vor 30 Min\..*heute \d\d:\d\d/.test(t)), 'heute mit Minuten + Uhrzeit', zeiten);
    ok(zeiten.some(t => /gestern, \d\d:\d\d/.test(t)), 'gestern mit Uhrzeit', zeiten);
    ok(zeiten.filter(t => /gerade eben/.test(t)).length === 1, 'Alt-Eintrag ohne ts behält seinen Text', zeiten);
    const chip = await page.$('.ws-meta-chip--btn');
    ok(!!chip, 'Mitglieder-Chip ist ein Button');
    await chip.click(); await page.waitForTimeout(350);
    const modal = await page.evaluate(() => document.getElementById('wsModalRoot').innerHTML);
    ok(/Mitglieder ·/.test(modal) && /Studi Test/.test(modal), 'Mitglieder-Modal listet die Personen');
    await page.evaluate(() => window._wsCloseModal()); await page.waitForTimeout(200);
    await page.evaluate(() => window._wsSubOfSet('ws_ue1', 'ws_kl1'));
    await page.waitForTimeout(450);
    const reihen = await page.$$eval('#wsOrgBuckets .ws-bucket-row', n => n.map(x => ({
      t: x.querySelector('.ws-bucket-row__name').textContent, sub: x.className.indexOf('--sub') >= 0 })));
    ok(reihen.length === 2 && reihen[1].t === 'Übungsumgebung' && reihen[1].sub, 'Übungs-Eimer eingerückt unter der Klasse', reihen);
    ok(await page.$$eval('#wsPersonal .ws-bucket-row', n => n.length) === 0, 'nicht doppelt in der persönlichen Liste');
    await page.evaluate(() => window._wsSubOfClear('ws_ue1'));
    await page.waitForTimeout(400);
    ok(await page.$$eval('#wsPersonal .ws-bucket-row', n => n.length) === 1, 'Aufheben bringt ihn zurück');
    ok(errs.length === 0, 'keine JS-Fehler (' + errs.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ── B3: Lernmittel — markieren & seitenweise teilen ──────────────────
  console.log('\n■ B3: Lernmittel — markieren, beschreiben, teilen');
  {
    store.set('schule|sklasse:kl1', KLASSE);
    store.set('schule|smat:mat1', MAT);
    store.set('schule|smatan:man_mat1__u_kol', FREMD);
    store.set('schule|smatan:man_mat1__u_fremd', PRIVAT);
    const { ctx, page, errs } = await seite('ab_klassen.html', 'u_test', ['role_student']);
    await page.evaluate(() => window.klOpen('kl1'));
    await page.waitForTimeout(600);
    const liste = await page.evaluate(() => document.getElementById('ovBody').innerHTML);
    ok(/Öffnen &amp; markieren/.test(liste), 'Lernmittel ist wählbar («Öffnen & markieren»)');
    ok(/1 geteilt/.test(liste), 'geteilte Notiz wird an der Zeile ausgewiesen');
    await page.evaluate(() => window.lmOpen('mat1'));
    await page.waitForTimeout(1400);
    ok(await page.$eval('#lmOv', e => e.classList.contains('on')), 'Reader öffnet');
    ok(await page.$$eval('#lmSvg .lm-fremd', n => n.length) === 1, 'nur die GETEILTE fremde Notiz erscheint');
    const box = await page.$eval('#lmSvg', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await page.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w * 0.6, box.y + box.h * 0.46, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1400);
    const eigen = await page.evaluate(() => (window._lmHooks.LM.shapes['1'] || [])[0] || null);
    ok(eigen && eigen.typ === 'marker', 'eigene Markierung erfasst', eigen && eigen.typ);
    ok(eigen && eigen.x1 > 0 && eigen.x1 < 1 && eigen.y1 > 0 && eigen.y1 < 1, 'Markierung auf 0..1 normiert', eigen);
    ok(!!store.get('schule|smatan:man_mat1__u_test'), 'Notiz unter deterministischer id gespeichert');
    await page.evaluate(() => window.lmTeilenOpen());
    await page.waitForTimeout(300);
    const dlg = await page.evaluate(() => (document.querySelector('.gema-dlg') || {}).innerHTML || '');
    ok(/Komplettes Lernmittel/.test(dlg) && /Nur Seiten/.test(dlg), 'Teilen: komplett ODER Seiten');
    ok(/Dozent Test/.test(dlg), 'Dozent als Empfänger wählbar');
    await page.evaluate(() => {
      const s = document.getElementById('lmModSeiten'); s.checked = true; s.dispatchEvent(new Event('change', { bubbles: true }));
      const p = document.querySelector('.lm-pers[value="u_doz"]'); p.checked = true; p.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => Array.from(document.querySelectorAll('.gema-dlg-btn')).find(b => /Teilen|aktualisieren/.test(b.textContent)).click());
    await page.waitForTimeout(900);
    const g = await page.evaluate(() => window._lmHooks.LM.notiz.geteilt);
    ok(g && g.modus === 'seiten' && g.anUserIds.indexOf('u_doz') >= 0 && g.anKlasse === false,
       'Freigabe seitenweise, gezielt an den Dozenten', g);
    const rec = store.get('schule|smatan:man_mat1__u_test');
    ok(rec && rec.seiten && (rec.seiten['1'] || []).length === 1,
       'Record trägt ALLE Seiten — Freigabe ist nur Lese-Regel');
    const regel = await page.evaluate(() => ({
      privat: GemaSchule.notizSichtbar({ userId: 'u_x', klasseId: 'kl1', geteilt: null }),
      klasse: GemaSchule.notizSichtbar({ userId: 'u_kol', klasseId: 'kl1', geteilt: { aktiv: true, anKlasse: true } }),
      bereich: GemaSchule.notizSeitenBereich({ userId: 'u_kol', geteilt: { aktiv: true, modus: 'seiten', von: 2, bis: 4 } })
    }));
    ok(regel.privat === false && regel.klasse === true, 'Sichtbarkeits-Regel greift', regel);
    ok(regel.bereich && regel.bereich.von === 2 && regel.bereich.bis === 4, 'Seitenbereich wird gelesen', regel.bereich);
    ok(errs.length === 0, 'keine JS-Fehler (' + errs.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ── B4: Lerngruppe — Dozent einladen + Feedback ──────────────────────
  console.log('\n■ B4: Lerngruppe — Dozent einladen, Feedback an der Berechnung');
  let gid = null;
  {
    const { ctx, page, errs } = await seite('sys_workspace.html', 'u_test', ['role_student']);
    gid = await page.evaluate(() => window._wsNatCreate('Lerngruppe Kaltwasser', 'lerngruppe'));
    await page.waitForTimeout(400);
    const g = await page.evaluate(id => _wsHooks.buckets().find(b => b.id === id), gid);
    ok(g && g.type === 'lerngruppe', 'Eimer-Typ «Lerngruppe»');
    ok(g && Array.isArray(g.accessControl.nurUserIds) && g.accessControl.nurUserIds.length === 1,
       'Lerngruppe ist auf die Eingeladenen beschränkt', g && g.accessControl);
    await page.evaluate(id => { const b = _wsHooks.buckets().find(x => x.id === id);
      b.modules.push({ mod: 'sb_lu_tabelle', status: 'offen' }); _wsHooks.save(); _wsHooks.load(); }, gid);
    await page.waitForTimeout(400);
    ok((await page.evaluate(() => _wsHooks.dozKandidaten())).some(d => d.id === 'u_doz'), 'Dozent der eigenen Klasse einladbar');
    ok(await page.evaluate(() => !!Array.from(document.querySelectorAll('.ws-btn')).find(b => /Dozent einladen/.test(b.textContent))), 'Knopf «Dozent einladen»');
    ok(await page.evaluate(() => !!document.querySelector('.ws-fb-btn')), 'Feedback-Knopf an der Modul-Kachel');
    await page.evaluate(() => window._wsDozentAdd('u_doz'));
    await page.waitForTimeout(600);
    const nach = await page.evaluate(id => _wsHooks.buckets().find(b => b.id === id), gid);
    ok((nach.beteiligte || []).some(p => p.userId === 'u_doz' && p.role === 'Dozent'), 'Dozent als Beteiligter erfasst');
    ok((nach.accessControl.nurUserIds || []).indexOf('u_doz') >= 0, 'Dozent im Zugriff freigeschaltet');
    ok(notifs.some(n => n.eventKey === 'schule_lerngruppe_einladung' && n.empfaengerUserId === 'u_doz'), 'Einladung gemeldet');
    await page.evaluate(() => _wsHooks.flush());
    await page.waitForTimeout(700);
    ok(!!store.get('workspace|ws:' + gid), 'Lerngruppe in der Cloud');
    ok(errs.length === 0, 'keine JS-Fehler (' + errs.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await seite('sys_workspace.html', 'u_doz', ['role_dozent']);
    const sicht = await page.evaluate(id => { const b = _wsHooks.buckets().find(x => x.id === id); return { da: !!b, ok: b ? _wsHooks.canSee(b) : null }; }, gid);
    ok(sicht.da && sicht.ok, 'Dozent sieht die Lerngruppe', sicht);
    await page.evaluate(id => window._wsOpen(id), gid);
    await page.waitForTimeout(500);
    await page.evaluate(() => window._wsModFeedback('sb_lu_tabelle'));
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => !!document.getElementById('wsFbText')), 'Feedback-Dialog öffnet');
    await page.evaluate(() => { const t = document.getElementById('wsFbText'); if (t) t.value = 'Gleichzeitigkeit nochmals prüfen.'; window._wsFbSenden('sb_lu_tabelle'); });
    await page.waitForTimeout(700);
    const fb = await page.evaluate(id => _wsHooks.fbListe(_wsHooks.buckets().find(x => x.id === id), 'sb_lu_tabelle'), gid);
    ok(fb.length === 1 && /Gleichzeitigkeit/.test(fb[0].text), 'Feedback am Modul gespeichert', fb);
    ok(fb[0] && fb[0].ts && fb[0].rolle, 'Feedback trägt Zeit + Rolle', fb[0]);
    ok(notifs.some(n => n.eventKey === 'schule_lerngruppe_feedback' && n.empfaengerUserId === 'u_test'), 'Studentin benachrichtigt');
    ok(await page.evaluate(() => !!document.querySelector('.ws-mod-fb')), 'Kachel zeigt den Feedback-Zähler');
    ok(errs.length === 0, 'keine JS-Fehler (' + errs.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }
  {
    const { ctx, page } = await seite('sys_workspace.html', 'u_kol', ['role_student']);
    const fremd = await page.evaluate(id => { const b = _wsHooks.buckets().find(x => x.id === id); return b ? _wsHooks.canSee(b) : 'weg'; }, gid);
    ok(fremd === false, 'nicht eingeladene Mitstudentin sieht die Lerngruppe NICHT', fremd);
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}

console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
