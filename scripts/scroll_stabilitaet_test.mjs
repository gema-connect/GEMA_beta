#!/usr/bin/env node
/* Scroll-Stabilität: Dialoge und Listen springen nicht — Drift-Guard
 *
 * Zwei gemeldete Symptome, zwei verschiedene Ursachen:
 *
 *  A) if_wareneingang — beim Abhaken eingegangener Ware sprang die Liste bei
 *     JEDEM Klick zurück an den Anfang. Ursache: weSetEingang/weInc/
 *     weComplete riefen renderLiefModal(), das via showModal() das komplette
 *     Modal-Markup ersetzt — inklusive `.modal-bg`, dem Scroll-Container.
 *     Fix: wePaintPos() zeichnet NUR die betroffene Zeile nach (Muster
 *     paintCells in sb_lu_tabelle). Regel: bei Klick-/Input-Handlern nie die
 *     ganze Liste neu bauen.
 *
 *  B) if_werkzeug (und jede Seite mit Modal) — nach dem Schliessen eines
 *     Dialogs landete man oben und die Seite scrollte sichtbar zurück.
 *     Ursache: der Body-Scroll-Lock nutzte IMMER den position:fixed-Trick
 *     (nötig nur auf iOS); das Dokument steht dabei real auf 0 und muss
 *     zurückgesetzt werden — und weil mehrere Module `scroll-behavior:smooth`
 *     setzen, wurde dieser Rücksprung ANIMIERT.
 *     Fix: ausserhalb von iOS sperrt overflow-y:hidden auf <html> — die
 *     Scroll-Position wird gar nicht erst angefasst. Auf iOS bleibt der
 *     fixed-Weg, der Rücksprung läuft aber ohne Smooth-Animation.
 *
 *  D) if_werkzeug — Detailansicht → «📋 Aktivitäten» → schliessen: die Seite
 *     liess sich danach GAR NICHT mehr scrollen. Ursache: das Aktivitäten-
 *     Modal wird per createElement/appendChild erzeugt und per removeChild
 *     entfernt; der Auto-Hook in gema_scroll.js beobachtet aber NUR Attribut-
 *     Mutationen (kein childList) und sah das Entfernen nie — der Lock der
 *     Detailansicht wurde also nie freigegeben.
 *     Fix (ohne den Lock-Mechanismus anzufassen): GemaActivityLog.openModal
 *     kennt opts.onClose, if_werkzeug holt damit die Detailansicht zurück.
 *     Deren nächstes regulaeres closeView() ist wieder eine Attribut-
 *     Mutation und loest den Lock sauber auf.
 *     GEMESSEN wird UNMITTELBAR nach dem Schliessen der Aktivitäten — die
 *     massgebende Invariante ist «eine Sperre gibt es nur mit sichtbarem
 *     Modal». Ein späterer closeView()-Aufruf taugt als Nachweis NICHT:
 *     classList.add('hidden') ruft setAttribute auch bei unverändertem Wert
 *     und erzeugt damit selbst eine Mutation, die den haengenden Lock
 *     nachträglich aufhebt — er würde das Symptom also maskieren.
 *
 * Ausführen: CHROME=<chromium> node scripts/scroll_stabilitaet_test.mjs
 */
import { chromium } from 'playwright-core';
import { startServer, BASE, seed } from './rolematrix_harness.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}

// ── A) Quellcode-Invarianten ──────────────────────────────────────
console.log('— A) Quellcode-Invarianten —');
{
  const we = readFileSync(join(ROOT, 'if_wareneingang.html'), 'utf8');
  ok(/function wePaintPos/.test(we), 'wePaintPos vorhanden');
  const handlers = we.slice(we.indexOf('window.weSetEingang'), we.indexOf('window.weComplete') + 400);
  // Alle GESCHÜTZTEN Aufrufe rausstreichen — es darf keiner übrig bleiben
  const rest = handlers.replace(/if\(!wePaintPos\(l,posId\)\)renderLiefModal\(l\);/g, '');
  ok(!/renderLiefModal\(/.test(rest), 'kein ungeschützter Voll-Render in den Handlern');
  ok((handlers.match(/wePaintPos\(l,posId\)/g) || []).length === 3,
     'alle drei Handler (setzen/＋1/voll) zeichnen nur die Zeile nach');
  ok(/if\(!wePaintPos\(l,posId\)\)renderLiefModal\(l\)/.test(handlers),
     'Voll-Render bleibt als Fallback (Zeile nicht auffindbar)');
  ok(/data-pid="/.test(we) && /we-eing/.test(we) && /we-st/.test(we), 'Zeile/Feld/Status sind adressierbar');
  ok(/document\.activeElement!==inp/.test(we), 'fokussiertes Mengenfeld wird nicht überschrieben');

  const gs = readFileSync(join(ROOT, 'gema_scroll.js'), 'utf8');
  ok(/_iOS\s*=/.test(gs), 'iOS-Erkennung vorhanden');
  ok(/gema-modal-soft/.test(gs), 'sanfte Sperre (overflow) implementiert');
  ok(/_instantScrollTo/.test(gs) && /scrollBehavior\s*=\s*'auto'/.test(gs),
     'Rücksprung ohne Smooth-Animation (scroll-behavior temporär aus)');
  ok(/if\s*\(wasFixed\)\s*_instantScrollTo/.test(gs), 'zurückgescrollt wird NUR nach dem fixed-Weg');
  ok(/paddingRight/.test(gs), 'Scrollbalken-Breite wird ausgeglichen (kein seitlicher Sprung)');
  const css = readFileSync(join(ROOT, 'gema_responsive.css'), 'utf8');
  ok(/html\.gema-modal-soft\{\s*overflow-y:hidden/.test(css), 'Sperr-Klasse liegt auf <html> (body-overflow propagiert nicht)');

  // D-Invarianten: der Rückweg ins Detail ist verdrahtet — und der
  // Lock-Mechanismus selbst blieb unangetastet (User-Vorgabe).
  const al = readFileSync(join(ROOT, 'gema_aktivitaetslog.js'), 'utf8');
  ok(/opts\.onClose\s*===\s*'function'|typeof opts\.onClose === 'function'/.test(al),
     'GemaActivityLog.openModal ruft opts.onClose beim Schliessen');
  ok(al.indexOf('bg.parentNode.removeChild(bg)') < al.indexOf('opts.onClose'),
     'onClose laeuft NACH dem Entfernen (Aufrufer oeffnet dort seine Ansicht)');
  ok(!/GemaScroll/.test(al), 'das Aktivitäten-Modal fasst den Scroll-Lock NICHT an');
  const wz = readFileSync(join(ROOT, 'if_werkzeug.html'), 'utf8');
  ok(/_wzToolActLog\('\$\{t\.id\}',true\)/.test(wz),
     'Detailansicht öffnet die Aktivitäten mit Rückkehr-Flag');
  ok(/onClose:\s*zurueckInsDetail\s*\?\s*function\(\)\{\s*try\{\s*openViewTool\(toolId\)/.test(wz),
     '_wzToolActLog holt mit dem Flag die Detailansicht zurück');
  ok(!/_wzToolActLog\('\+toolId\+'\),?true|_wzToolActLog\(id,\s*true\)/.test(wz),
     'Scan-Ansicht und natives Sheet bleiben ohne Flag (dort hält niemand einen Lock)');
}

// ── Browser ───────────────────────────────────────────────────────
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
// Lieferung mit vielen Positionen, damit der Dialog wirklich scrollt
const pos = [];
for (let i = 1; i <= 30; i++) {
  pos.push({ id: 'p' + i, sortindex: i - 1, posNr: String(i), artikelNr: 'ART-' + i,
    bezeichnung: 'Testartikel Nummer ' + i, menge: 5, eingegangenMenge: 0, status: 'offen',
    projekt: { objektId: '', name: 'Musterstrasse 1', strasse: 'Musterstrasse 1', plz: '4000', ort: 'Basel' } });
}
const st = seed(['role_admin']);
st.gema_we_pool_v1 = [{ id: 'we_test', orgId: 'org_test', erstelltVon: 'u_test', erstelltVonName: 'Test',
  importDatum: '2026-08-01', lieferantFirma: 'Testlieferant AG', bestellnummer: 'B-1', bestelldatum: '2026-07-20',
  notiz: '', positionen: pos, status: 'offen', updatedAt: '2026-08-01T00:00:00.000Z' }];
// Werkzeug + ein Log-Eintrag fuer Abschnitt D
const TOOL = { id: 'wz_scroll', name: 'Bohrhammer Testgerät', cat: 'bohren', orgId: 'org_test',
  brand: 'Hilti', model: 'TE 30', bought: '2026-01-15', berichte: [] };
const LOG = { id: 'log_1', ts: '2026-08-01T09:00:00.000Z', orgId: 'org_test', modul: 'werkzeug',
  modulRecordId: 'wz_scroll', modulRecordName: 'Bohrhammer Testgerät', aktion: 'erfasst',
  beschreibung: 'Gerät erfasst', userId: 'u_test', userName: 'Test' };
st.gema_werkzeug = [TOOL];
st.gema_aktivitaetslog_v1 = [LOG];
// Coachmark-Tour stilllegen — ihr Backdrop faengt sonst Klicks ab
st.gema_coachmarks_done_werkzeug_erfassen_v1 = '1';
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, st);
/* Die Daten muessen aus der CLOUD kommen: bindCollection überschreibt den
   localStorage-Cache mit der Cloud-Antwort — ein blosser localStorage-Seed
   würde vom leeren Standard-Mock wieder geleert. */
const rows = (arr, pf) => arr.map(r => ({ data_key: pf + r.id, payload: { data: r, _lm: Date.now() } }));
const cloudRow = [{ data_key: 'we:we_test', payload: { data: st.gema_we_pool_v1[0], _lm: Date.now() } }];
await ctx.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith(BASE)) return r.continue();
  if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0) return r.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
  if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
    if (r.request().method() !== 'GET') return r.fulfill({ contentType: 'application/json', body: '{}' });
    let body = '[]';
    if (u.indexOf('module_key=eq.wareneingang') >= 0 && u.indexOf('we%3A') >= 0) body = JSON.stringify(cloudRow);
    else if (u.indexOf('module_key=eq.werkzeugmanagement') >= 0 && u.indexOf('tool%3A') >= 0) body = JSON.stringify(rows([TOOL], 'tool:'));
    else if (u.indexOf('module_key=eq.aktivitaetslog') >= 0) body = JSON.stringify(rows([LOG], 'log:'));
    return r.fulfill({ contentType: 'application/json', body: body });
  }
  return r.abort();
});

// ── B) Wareneingang: Abhaken scrollt nicht ────────────────────────
console.log('— B) Wareneingang: Abhaken lässt die Liste stehen —');
{
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/if_wareneingang.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.weOpenLief === 'function', null, { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.weOpenLief('we_test'));
  await page.waitForTimeout(400);
  ok(await page.$('.modal-bg tr[data-pid="p20"]') !== null, 'Dialog offen, 30 Positionen gerendert');

  // Scroll-Container des Dialogs nach unten fahren
  await page.evaluate(() => { document.querySelector('.modal-bg').scrollTop = 600; });
  await page.waitForTimeout(200);
  const vor = await page.evaluate(() => document.querySelector('.modal-bg').scrollTop);
  ok(vor > 100, 'Dialog ist gescrollt (scrollTop ' + vor + ')');

  // Identität des Scroll-Containers merken — wird er ersetzt, ist die
  // Position weg (genau das war der Fehler)
  await page.evaluate(() => { document.querySelector('.modal-bg').dataset.probe = 'x'; });

  await page.click('tr[data-pid="p20"] button[onclick*="weInc"]');
  await page.waitForTimeout(300);
  const nach = await page.evaluate(() => {
    const bg = document.querySelector('.modal-bg');
    const tr = document.querySelector('tr[data-pid="p20"]');
    return {
      scrollTop: bg ? bg.scrollTop : -1,
      selbesElement: bg ? bg.dataset.probe === 'x' : false,
      wert: tr ? tr.querySelector('.we-eing').value : '',
      status: tr ? tr.querySelector('.we-st').textContent.trim() : '',
      liefStatus: (document.getElementById('weLiefStatus') || {}).textContent || ''
    };
  });
  ok(nach.selbesElement, 'Scroll-Container wurde NICHT ersetzt');
  ok(nach.scrollTop === vor, 'Scroll-Position unverändert (' + vor + ' → ' + nach.scrollTop + ')');
  ok(nach.wert === '1', 'Menge hochgezählt — ' + nach.wert);
  ok(/[Tt]eilweise/.test(nach.status), 'Zeilen-Status nachgezogen — ' + nach.status);
  ok(/[Tt]eilweise/.test(nach.liefStatus), 'Gesamtstatus im Kopf nachgezogen — ' + nach.liefStatus);

  // «✓ voll» ebenso
  await page.click('tr[data-pid="p20"] button[onclick*="weComplete"]');
  await page.waitForTimeout(300);
  const n2 = await page.evaluate(() => {
    const bg = document.querySelector('.modal-bg'), tr = document.querySelector('tr[data-pid="p20"]');
    return { scrollTop: bg.scrollTop, wert: tr.querySelector('.we-eing').value, status: tr.querySelector('.we-st').textContent.trim() };
  });
  ok(n2.scrollTop === vor, '«✓ voll» scrollt ebenfalls nicht (' + n2.scrollTop + ')');
  ok(n2.wert === '5', 'Position komplett — ' + n2.wert);
  ok(/[Ee]ingegangen/.test(n2.status), 'Status «eingegangen» — ' + n2.status);
  ok(errors.length === 0, 'keine pageerrors' + (errors.length ? ' — ' + errors[0] : ''));
  await page.close();
}

// ── C) Werkzeug: Dialog auf/zu bewegt die Seite nicht ─────────────
console.log('— C) Werkzeug: Dialog auf/zu lässt die Seite stehen —');
{
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  // Genug Inhalt zum Scrollen erzwingen — Layout MUSS vor dem Scrollen
  // durch sein, sonst klemmt scrollTo auf die alte Dokumenthöhe
  await page.evaluate(() => { document.body.style.minHeight = '4000px'; });
  await page.waitForTimeout(300);
  // OHNE Smooth scrollen — die Seite setzt html{scroll-behavior:smooth},
  // ein normales scrollTo() würde noch animieren und die Messung verfälschen
  await page.evaluate(() => {
    const de = document.documentElement, prev = de.style.scrollBehavior;
    de.style.scrollBehavior = 'auto'; window.scrollTo(0, 900); de.style.scrollBehavior = prev;
  });
  await page.waitForTimeout(300);
  const vor = await page.evaluate(() => window.scrollY);
  ok(vor > 500, 'Seite ist gescrollt (scrollY ' + vor + ')');

  await page.evaluate(() => { if (typeof window.openAdd === 'function') window.openAdd(); });
  await page.waitForTimeout(500);
  const auf = await page.evaluate(() => ({
    y: window.scrollY,
    soft: document.documentElement.classList.contains('gema-modal-soft'),
    fixed: getComputedStyle(document.body).position === 'fixed',
    offen: !!document.querySelector('.modal-bg:not(.hidden)')
  }));
  ok(auf.offen, 'Dialog ist offen');
  ok(auf.soft, 'sanfte Sperre aktiv (html.gema-modal-soft)');
  ok(!auf.fixed, 'Body NICHT auf position:fixed (kein Sprung auf 0)');
  ok(auf.y === vor, 'Scroll-Position beim Öffnen unverändert (' + vor + ' → ' + auf.y + ')');

  // Schliessen — und dabei jede Bewegung mitschreiben
  await page.evaluate(() => {
    window.__ys = [];
    window.__t = setInterval(() => window.__ys.push(window.scrollY), 8);
  });
  await page.evaluate(() => { if (typeof window.closeAdd === 'function') window.closeAdd(); });
  await page.waitForTimeout(700);
  const zu = await page.evaluate(() => {
    clearInterval(window.__t);
    return { y: window.scrollY, min: Math.min.apply(null, window.__ys.concat([window.scrollY])),
             soft: document.documentElement.classList.contains('gema-modal-soft'),
             proben: window.__ys.length };
  });
  ok(zu.y === vor, 'Scroll-Position nach dem Schliessen unverändert (' + zu.y + ')');
  ok(!zu.soft, 'Sperre wieder aufgehoben');
  ok(zu.min === vor, 'Seite ist zwischendurch NIE nach oben gesprungen (min ' + zu.min + ' bei ' + zu.proben + ' Messungen)');
  ok(errors.length === 0, 'keine pageerrors' + (errors.length ? ' — ' + errors[0] : ''));
  await page.close();
}

// ── D) Werkzeug: Detail → Aktivitäten → schliessen ────────────────
// Der gemeldete Weg. Entscheidend ist die LETZTE Prüfung: die Seite muss
// sich danach wieder scrollen lassen.
console.log('— D) Werkzeug: Detail → Aktivitäten → zurück ins Detail —');
{
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.openViewTool === 'function', null, { timeout: 15000 });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { document.body.style.minHeight = '4000px'; });
  await page.waitForTimeout(200);

  await page.evaluate(() => window.openViewTool('wz_scroll'));
  await page.waitForTimeout(400);
  const d1 = await page.evaluate(() => ({
    detail: !document.getElementById('viewModal').classList.contains('hidden'),
    knopf: !!document.querySelector('#vm_actions_grid button[onclick*="_wzToolActLog"]'),
    soft: document.documentElement.classList.contains('gema-modal-soft')
  }));
  ok(d1.detail, 'Detailansicht ist offen');
  ok(d1.knopf, '«📋 Aktivitäten» im Aktionen-Block vorhanden');
  ok(d1.soft, 'Detailansicht hält den Scroll-Lock');

  await page.click('#vm_actions_grid button[onclick*="_wzToolActLog"]');
  await page.waitForTimeout(500);
  const d2 = await page.evaluate(() => ({
    log: !!document.getElementById('gema-actlog-modal'),
    detail: !document.getElementById('viewModal').classList.contains('hidden'),
    eintrag: (document.getElementById('actlogBody') || {}).textContent || ''
  }));
  ok(d2.log, 'Aktivitäten-Modal ist offen');
  ok(!d2.detail, 'Detailansicht ist dahinter geschlossen');
  ok(/Bohrhammer/.test(d2.eintrag), 'Log ist auf DIESES Gerät vorgefiltert');

  // UNMITTELBAR nach dem Schliessen messen — hier haengt der Lock ohne den Fix
  // fest. Ein closeView() davor wuerde ihn selbst wieder aufloesen (Attribut-
  // Mutation) und das Symptom verdecken.
  await page.click('#actlogClose');
  await page.waitForTimeout(500);
  const d3 = await page.evaluate(() => {
    function sichtbar(el){
      if (!el || !el.classList) return false;
      if (el.classList.contains('open')) return true;
      if (el.classList.contains('hidden')) return false;
      const d = getComputedStyle(el).display;
      return !!d && d !== 'none';
    }
    const offen = Array.prototype.filter.call(document.querySelectorAll('.modal-bg'), sichtbar);
    const de = document.documentElement;
    // Was den Nutzer wirklich blockiert. window.scrollTo taugt als Nachweis
    // NICHT — bei overflow:hidden bleibt programmatisches Scrollen erlaubt,
    // nur die Geste des Nutzers ist tot.
    const gesperrt = de.classList.contains('gema-modal-soft')
      || getComputedStyle(de).overflowY === 'hidden'
      || document.body.classList.contains('gema-modal-open');
    return {
      log: !!document.getElementById('gema-actlog-modal'),
      detail: !document.getElementById('viewModal').classList.contains('hidden'),
      titel: (document.getElementById('vm_name') || {}).textContent || '',
      locked: !!(window.GemaScroll && window.GemaScroll.isLocked()),
      offene: offen.length,
      gesperrt: gesperrt
    };
  });
  ok(!d3.log, 'Aktivitäten-Modal geschlossen');
  ok(d3.detail, 'man ist wieder in der Detailansicht');   // ← der Fix
  ok(d3.detail && /Bohrhammer/.test(d3.titel), 'Detailansicht zeigt dasselbe Gerät');
  // Das eigentliche Symptom: gesperrt, obwohl nichts mehr offen ist.
  ok(!d3.locked || d3.offene > 0,
     'kein GemaScroll-Lock ohne sichtbares Modal (locked=' + d3.locked + ', offene Modals=' + d3.offene + ')');
  ok(!d3.gesperrt || d3.offene > 0,
     'die Seite ist nur gesperrt, solange ein Modal offen ist (gesperrt=' + d3.gesperrt + ', offene Modals=' + d3.offene + ')');

  await page.evaluate(() => window.closeView());
  await page.waitForTimeout(400);
  const d4 = await page.evaluate(() => {
    const de = document.documentElement, prev = de.style.scrollBehavior;
    de.style.scrollBehavior = 'auto'; window.scrollTo(0, 800); de.style.scrollBehavior = prev;
    return { soft: de.classList.contains('gema-modal-soft'),
             locked: !!(window.GemaScroll && window.GemaScroll.isLocked()),
             y: window.scrollY };
  });
  ok(!d4.soft, 'Scroll-Sperre nach dem Schliessen aufgehoben');
  ok(!d4.locked, 'GemaScroll meldet keinen offenen Lock mehr');
  ok(d4.y > 500, 'die Seite laesst sich wieder scrollen (scrollY ' + d4.y + ')');
  ok(errors.length === 0, 'keine pageerrors' + (errors.length ? ' — ' + errors[0] : ''));
  await page.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
await server.close();
process.exit(fail ? 1 : 0);
