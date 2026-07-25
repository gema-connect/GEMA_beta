// Playwright-Test: Benutzerverwaltung meldet «gespeichert» NUR nach Server-OK
//
// Fehlerbild: Rolle bei einem Nutzer hinzufügen + Speichern → grüner Toast,
// Modal zu, Rolle in der Liste — nach dem Reload war sie weg. Ursache: die
// Auth-Saves laufen über die gema-auth-Function mit serverseitiger
// Rechteprüfung; eine Ablehnung (403) oder ein Netzfehler wurde vom
// synchronen `return true` verschluckt.
//
// Ausführen: CHROME=<chromium> node scripts/admin_save_feedback_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// Öffnet sys_admin als GEMA-Admin mit einem zweiten User in derselben Org.
async function admin(serverAntwort) {
  const s = seed(['role_admin']);
  const me = s['gema_users_v1'][0];
  s['gema_users_v1'].push({ id: 'u_ziel', username: 'ziel@test.ch', name: 'Ziel Person',
    roleIds: ['role_monteur'], active: true, orgId: me.orgId, profile: { email: 'ziel@test.ch' } });
  const { ctx, page } = await newPage(browser, s);
  const gesendet = [];
  await page.route('**/functions/gema-auth*', route => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'persist_auth') {
      gesendet.push(body.records || []);
      if (serverAntwort) return route.fulfill(serverAntwort);
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.goto(BASE + '/sys_admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof saveUser === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(700);
  return { ctx, page, gesendet };
}

// Rolle anhaken + speichern; liefert die angehakte Rollen-ID
async function rolleHinzufuegenUndSpeichern(page) {
  await page.evaluate(() => openUserModal('u_ziel'));
  await page.waitForTimeout(250);
  const neu = await page.evaluate(() => {
    const cb = Array.from(document.querySelectorAll('#u_roles_checkboxes input')).find(c => !c.checked);
    if (!cb) return null;
    cb.checked = true;
    return cb.value;
  });
  await page.evaluate(() => saveUser());
  await page.waitForTimeout(900);
  return neu;
}

const zustand = (page) => page.evaluate(() => ({
  modalOffen: document.getElementById('userModal').classList.contains('open'),
  fehler: (document.getElementById('userErr') || {}).textContent || '',
  gespeichert: (JSON.parse(localStorage.getItem('gema_users_v1') || '[]').find(u => u.id === 'u_ziel') || {}).roleIds || [],
  imSpeicher: ((typeof GemaAuth !== 'undefined' && GemaAuth.getUsers() || []).find(u => u.id === 'u_ziel') || {}).roleIds || []
}));

// ══════════════ 1) Server akzeptiert ══════════════
console.log('■ Server akzeptiert');
{
  const { ctx, page, gesendet } = await admin(null);
  const neu = await rolleHinzufuegenUndSpeichern(page);
  ok(!!neu, 'Rolle konnte angehakt werden (' + neu + ')');
  ok(gesendet.some(rs => rs.some(r => r.key === 'user:u_ziel' && (r.data.roleIds || []).indexOf(neu) >= 0)),
     'Rolle wird an den Server gesendet');
  const z = await zustand(page);
  ok(z.modalOffen === false, 'Modal schliesst');
  ok(z.gespeichert.indexOf(neu) >= 0, 'Rolle ist lokal gespeichert');
  ok(z.fehler === '', 'keine Fehlermeldung');
  await ctx.close();
}

// ══════════════ 2) Server lehnt ab (Berechtigung) ══════════════
console.log('■ Server lehnt ab (403 Berechtigung)');
{
  const { ctx, page } = await admin({ status: 403, contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'role_admin kann nur der GEMA-Admin vergeben' }) });
  const neu = await rolleHinzufuegenUndSpeichern(page);
  const z = await zustand(page);
  ok(z.modalOffen === true, 'Modal bleibt offen — die Eingabe geht nicht verloren');
  ok(/role_admin kann nur der GEMA-Admin vergeben/.test(z.fehler), 'Der ECHTE Grund steht im Dialog: «' + z.fehler.trim() + '»');
  ok(/⛔/.test(z.fehler), 'als Berechtigungsproblem markiert (nicht als Verbindungsfehler)');
  ok(z.gespeichert.indexOf(neu) < 0, 'Rolle NICHT lokal als gespeichert eingetragen');
  ok(z.imSpeicher.indexOf(neu) < 0, 'auch der In-Memory-Stand zeigt sie nicht (keine Scheinänderung)');
  const toast = await page.evaluate(() => (document.getElementById('toast') || document.querySelector('.toast') || {}).textContent || '');
  ok(!/gespeichert/i.test(toast), 'KEIN «✓ gespeichert»-Toast');
  await ctx.close();
}

// ══════════════ 3) Server nicht erreichbar ══════════════
console.log('■ Server nicht erreichbar (500)');
{
  const { ctx, page } = await admin({ status: 500, contentType: 'text/html', body: '<html>Fehler</html>' });
  const neu = await rolleHinzufuegenUndSpeichern(page);
  const z = await zustand(page);
  ok(z.modalOffen === true, 'Modal bleibt offen');
  ok(/⚠/.test(z.fehler) && z.fehler.length > 3, 'Fehlermeldung sichtbar: «' + z.fehler.trim() + '»');
  ok(z.gespeichert.indexOf(neu) < 0, 'Rolle nicht als gespeichert eingetragen');
  const toast = await page.evaluate(() => (document.getElementById('toast') || document.querySelector('.toast') || {}).textContent || '');
  ok(!/gespeichert/i.test(toast), 'KEIN Erfolgs-Toast');
  await ctx.close();
}

// ══════════════ 4) API-Kontrakt ══════════════
console.log('■ API: saveUsers/saveOrgs/saveRoles liefern ein Ergebnis');
{
  const { ctx, page } = await admin(null);
  const r = await page.evaluate(() => {
    const p = GemaAuth.saveUsers(GemaAuth.getUsers());
    return !!(p && typeof p.then === 'function');
  });
  ok(r, 'saveUsers liefert ein Promise (Aufrufer können auf das Ergebnis warten)');
  const r2 = await page.evaluate(() => Promise.resolve(GemaAuth.saveRoles(GemaAuth.getRoles())).then(x => x && x.ok === true));
  ok(r2, 'Ergebnis trägt ok:true bei Erfolg');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks');
process.exit(fail === 0 ? 0 : 1);
