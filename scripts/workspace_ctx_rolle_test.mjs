// Workspace: Rollen-Anzeige, Hub-Gating für Custom-Rollen, Kontextmenü.
// Deckt die drei gemeldeten Fälle ab (07/2026):
//  (1) Custom-Rolle («r_<timestamp>» aus dem Rolleneditor) zeigte im
//      Sidebar-User-Block die rohe ID («r 1784572783108») statt des
//      Rollennamens → _wsRoleName löst über GemaAuth.getRoles() auf.
//  (2) Eine Nur-Prüfliste-Rolle sah die Ausschreibungs-Hub-Kachel
//      (pm_ausschreibung hat keinen FILE_MAP-Eintrag) → HUB_SUBMODS.
//  (3) Rechtsklick auf einen Eimer (Sidebar/Tab/Drawer) öffnet ein
//      Kontextmenü: Öffnen · Modul hinzufügen · Umbenennen · Duplizieren ·
//      Löschen (Duplikat ohne objektId — Ghost-Resurrection-Falle).
//
// Aufruf:  CHROME=<chromium> node scripts/workspace_ctx_rolle_test.mjs
import { chromium } from 'playwright-core';
import { startServer, newPage, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

// Custom-Rolle wie aus dem Rolleneditor (sys_admin: id 'r_'+Date.now()) —
// darf NUR die Prüfliste (+ Objekte lesen), exakt das gemeldete Szenario.
const CUSTOM_ROLE = {
  id: 'r_1784572783108', name: 'Prüf-Fachperson', color: '#0ea5e9',
  permissions: {
    pruefliste: { read: true, write: true, admin: false },
    objekte: { read: true, write: false, admin: false }
  }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });

// ── Kontext 1: Nur-Prüfliste-Rolle — Anzeige, Gating, Kontextmenü ──────
console.log('— 1) Custom-Rolle «Prüf-Fachperson» (nur Prüfliste) —');
const s1 = seed(['r_1784572783108'], { roles: [CUSTOM_ROLE] });
// Coachmarks-Tour würde als .gcm-backdrop alle Klicks abfangen → als erledigt seeden
s1.gema_coachmarks_done_sys_workspace_v2 = '1';
const { ctx: c1, page: p1 } = await newPage(browser, s1);
const errs1 = []; p1.on('pageerror', e => errs1.push(e.message));
await p1.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
await p1.waitForTimeout(900);

ok(errs1.length === 0, 'sys_workspace bootet ohne pageerrors' + (errs1.length ? ' (' + errs1[0].slice(0, 80) + ')' : ''));
const roleTxt = await p1.evaluate(() => {
  const el = document.querySelector('#wsUser .ws-user-role');
  return el ? el.textContent.trim() : null;
});
ok(roleTxt === 'Prüf-Fachperson', 'User-Block zeigt den Rollennamen («' + roleTxt + '»)');
ok(!/\d{6,}/.test(roleTxt || ''), 'keine rohe Rollen-ID/Timestamp im User-Block');

const gate = await p1.evaluate(() => {
  const h = window._wsModulesHook();
  return {
    pruefliste: h.allowed({ id: 'pm_pruefliste' }),
    hub: h.allowed({ id: 'pm_ausschreibung' }),
    erp: h.allowed({ id: 'pm_erp' }),
    stunden: h.allowed({ id: 'pm_stunden' })
  };
});
ok(gate.pruefliste === true, 'Prüfliste für die Rolle sichtbar');
ok(gate.hub === false, 'Ausschreibungs-Hub für Nur-Prüfliste-Rolle AUSGEBLENDET (gemeldeter Bug)');
ok(gate.erp === false, 'ERP ohne Permission ausgeblendet');
ok(gate.stunden === false, 'Stundenerfassung ohne Permission ausgeblendet');

// Eimer anlegen + Picker: nur erlaubte Module
await p1.evaluate(() => window._wsQuickCreate('project'));
await p1.waitForTimeout(300);
await p1.evaluate(() => window._wsOpenModulePicker());
await p1.waitForTimeout(200);
const picker = await p1.evaluate(() => Array.from(document.querySelectorAll('.ws-modpicker .ws-modpicker-name')).map(n => n.textContent.trim()));
ok(picker.indexOf('Prüfliste') >= 0, 'Picker enthält «Prüfliste»');
ok(picker.indexOf('Ausschreibung') < 0, 'Picker enthält KEINE «Ausschreibung»-Hub-Kachel');
ok(picker.indexOf('Offerten / Aufträge / Rechnungen') < 0, 'Picker enthält kein ERP');
await p1.evaluate(() => window._wsCloseModal());

// ── Kontextmenü ──
const anchors = await p1.evaluate(() => ({
  row: !!document.querySelector('#wsOrgBuckets .ws-bucket-row[oncontextmenu]'),
  tab: !!document.querySelector('.ws-tab[oncontextmenu]')
}));
ok(anchors.row, 'Sidebar-Eimer-Zeile trägt oncontextmenu');
ok(anchors.tab, 'Tab-Leisten-Tab trägt oncontextmenu');

await p1.locator('#wsOrgBuckets .ws-bucket-row').first().click({ button: 'right' });
await p1.waitForTimeout(150);
const menu = await p1.evaluate(() => {
  const m = document.querySelector('.ws-ctx');
  if (!m) return null;
  const btns = Array.from(m.querySelectorAll('button'));
  return {
    labels: btns.map(b => b.textContent.trim()),
    seps: m.querySelectorAll('.ws-ctx-sep').length,
    dangerLast: btns.length ? btns[btns.length - 1].className.indexOf('danger') >= 0 : false
  };
});
ok(!!menu, 'Rechtsklick öffnet das Kontextmenü (.ws-ctx)');
ok(menu && menu.labels.join('|') === 'Öffnen|Modul hinzufügen|Umbenennen|Duplizieren|Löschen',
  'Menüeinträge: Öffnen · Modul hinzufügen · Umbenennen · Duplizieren · Löschen');
ok(menu && menu.seps === 1, 'Trenner vor «Löschen»');
ok(menu && menu.dangerLast, '«Löschen» ist als danger markiert');

await p1.keyboard.press('Escape');
await p1.waitForTimeout(100);
ok(await p1.evaluate(() => !document.querySelector('.ws-ctx')), 'Escape schliesst das Menü');

// Umbenennen (Enter-Pfad)
await p1.locator('#wsOrgBuckets .ws-bucket-row').first().click({ button: 'right' });
await p1.locator('.ws-ctx button', { hasText: 'Umbenennen' }).click();
await p1.waitForTimeout(200);
const preName = await p1.evaluate(() => (document.getElementById('wsRenameInp') || {}).value || '');
ok(preName === 'Mein erstes Bauprojekt', 'Umbenennen-Modal ist mit dem aktuellen Namen vorbefüllt');
await p1.fill('#wsRenameInp', 'Neubau Testweg 7');
await p1.keyboard.press('Enter');
await p1.waitForTimeout(200);
const renamed = await p1.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('#wsOrgBuckets .ws-bucket-row .ws-bucket-row__name')).map(n => n.textContent.trim());
  return { rows, modal: !!document.querySelector('.ws-modal') };
});
ok(renamed.rows.indexOf('Neubau Testweg 7') >= 0, 'Enter speichert den neuen Namen');
ok(!renamed.modal, 'Umbenennen-Modal ist geschlossen');

// Duplizieren → Kopie ohne objektId (Ghost-Resurrection-Falle)
await p1.locator('#wsOrgBuckets .ws-bucket-row', { hasText: 'Neubau Testweg 7' }).first().click({ button: 'right' });
await p1.locator('.ws-ctx button', { hasText: 'Duplizieren' }).click();
await p1.waitForTimeout(250);
const dup = await p1.evaluate(() => {
  const buckets = JSON.parse(localStorage.getItem('gema_workspace_v1') || '[]');
  const orig = buckets.find(b => b.name === 'Neubau Testweg 7');
  const copy = buckets.find(b => b.name === 'Neubau Testweg 7 (Kopie)');
  return {
    n: buckets.length,
    hasCopy: !!copy,
    copyObjektId: copy ? copy.objektId : 'fehlt',
    origObjektId: orig ? orig.objektId : 'fehlt',
    distinctIds: !!(copy && orig && copy.id !== orig.id)
  };
});
ok(dup.n === 2 && dup.hasCopy, 'Duplizieren erzeugt «… (Kopie)»');
ok(dup.copyObjektId === null, 'Kopie hat objektId null (kein geteiltes Auto-Objekt)');
ok(typeof dup.origObjektId === 'string' && dup.origObjektId.indexOf('obj_ws_') === 0, 'Original behält sein eigenes obj_ws_-Objekt');
ok(dup.distinctIds, 'Kopie hat eine eigene Bucket-ID');

// Löschen via Kontextmenü → Bestätigungs-Modal → weg
await p1.locator('#wsOrgBuckets .ws-bucket-row', { hasText: '(Kopie)' }).first().click({ button: 'right' });
await p1.locator('.ws-ctx button', { hasText: 'Löschen' }).click();
await p1.waitForTimeout(200);
const delModal = await p1.evaluate(() => {
  const m = document.querySelector('.ws-modal');
  return m ? { title: (m.querySelector('.ws-modal-title') || {}).textContent || '', danger: !!m.querySelector('.ws-btn-danger') } : null;
});
ok(delModal && delModal.title === 'Eimer löschen', 'Löschen öffnet das Bestätigungs-Modal');
ok(delModal && delModal.danger, 'Bestätigungs-Modal hat den roten Löschen-Button');
await p1.locator('.ws-modal .ws-btn-danger').click();
await p1.waitForTimeout(250);
const afterDel = await p1.evaluate(() => {
  const buckets = JSON.parse(localStorage.getItem('gema_workspace_v1') || '[]');
  const toast = (document.querySelector('#wsToastRoot .ws-toast') || {}).textContent || '';
  return { n: buckets.length, names: buckets.map(b => b.name), toast };
});
ok(afterDel.n === 1 && afterDel.names[0] === 'Neubau Testweg 7', 'Kopie gelöscht, Original bleibt');
ok(afterDel.toast.indexOf('gelöscht') >= 0, 'Toast bestätigt das Löschen');
ok(errs1.length === 0, 'keine pageerrors nach allen Kontextmenü-Aktionen');
await c1.close();

// ── Kontext 2: Mehrfach-Rollen → «Erste +N» (wie Nav-Badge) ────────────
console.log('— 2) Mehrfach-Rollen —');
const s2 = seed(['r_1784572783108', 'role_monteur'], {
  roles: [CUSTOM_ROLE, { id: 'role_monteur', name: 'Monteur', color: '#64748b', permissions: {} }]
});
const { ctx: c2, page: p2 } = await newPage(browser, s2);
await p2.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(700);
const roleTxt2 = await p2.evaluate(() => (document.querySelector('#wsUser .ws-user-role') || {}).textContent || '');
ok(roleTxt2.trim() === 'Prüf-Fachperson +1', 'Mehrfach-Rollen als «Prüf-Fachperson +1» («' + roleTxt2.trim() + '»)');
await c2.close();

// ── Kontext 3: Rollen-ID nicht auflösbar (gelöschte Rolle) ─────────────
console.log('— 3) Unauflösbare Rollen-ID —');
const s3 = seed(['r_9999999999999']);
const { ctx: c3, page: p3 } = await newPage(browser, s3);
await p3.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
await p3.waitForTimeout(700);
const roleTxt3 = await p3.evaluate(() => (document.querySelector('#wsUser .ws-user-role') || {}).textContent || '');
ok(roleTxt3.trim() === 'Mitglied', 'gelöschte Custom-Rolle fällt auf «Mitglied» zurück («' + roleTxt3.trim() + '»)');
ok(!/\d{6,}/.test(roleTxt3), 'auch im Fallback keine rohe ID sichtbar');
await c3.close();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
