// Rollen → Unternehmenskategorien (sys_admin Rolleneditor):
// getAssignableRoleIdsForOrg ist rollen-getrieben — eine Rolle ist bei einer
// Firmen-Kategorie wählbar, wenn ihr `kategorien`-Array (im Rolleneditor
// gepflegt) die Kategorie enthält; System-Rollen ohne Feld folgen der
// Default-Ableitung aus KATEGORIE_ROLLEN. Neu erstellte Rollen erscheinen
// so bei der zugewiesenen Kategorie (früher nur unter «Sonstiges»).
//
// Aufruf:  CHROME=<chromium> node scripts/rollen_kategorien_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8896;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/sys_admin.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── In-Memory-PostgREST ──────────────────────────────────────────────
const store = new Map();
function likeToRe(p){ const e=p.replace(/[.+?^${}()|[\]\\]/g,'\\$&'); return new RegExp('^'+e.replace(/\*/g,'.*').replace(/_/g,'.')+'$'); }
function handleSb(route){
  const req=route.request(); const url=decodeURIComponent(req.url()); const m=req.method();
  const mkEq=(url.match(/module_key=eq\.([^&]+)/)||[])[1];
  const dkEq=(url.match(/data_key=eq\.([^&]+)/)||[])[1];
  const dkLike=(url.match(/data_key=like\.([^&]+)/)||[])[1];
  if(m==='GET'){ const rows=[];
    for(const [k,v] of store){ const i=k.indexOf('|'); const mm=k.slice(0,i),d=k.slice(i+1);
      if(mkEq&&mm!==mkEq)continue; if(dkEq&&d!==dkEq)continue; if(dkLike&&!likeToRe(dkLike).test(d))continue;
      rows.push({module_key:mm,data_key:d,payload:v}); }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(rows)});
  }
  if(m==='POST'){ let body=[]; try{body=JSON.parse(req.postData()||'[]');}catch(e){}
    if(!Array.isArray(body))body=[body];
    body.forEach(r=>{ if(r&&r.module_key&&r.data_key) store.set(r.module_key+'|'+r.data_key,r.payload||{}); });
    return route.fulfill({status:201,contentType:'application/json',body:''});
  }
  if(m==='DELETE'){ if(mkEq&&dkEq)store.delete(mkEq+'|'+dkEq); return route.fulfill({status:204,contentType:'application/json',body:''}); }
  return route.fulfill({contentType:'application/json',body:'{}'});
}

function seed(){
  store.clear();
  const put=(mk,dk,data)=>store.set(mk+'|'+dk,{data,_lm:'2026-07-01T00:00:00Z'});
  // Orgs (org_default + user_admin + System-Rollen kommen aus DEFAULTS via _mergeWithDefaults)
  put('auth','org:org_san',   {id:'org_san',   name:'San AG',   kategorien:['sanitaerplaner'], admins:[], active:true});
  put('auth','org:org_sonst', {id:'org_sonst', name:'Sonst AG', kategorien:['sonstiges'],      admins:[], active:true});
  put('auth','org:org_multi', {id:'org_multi', name:'Multi AG', kategorien:['sanitaerplaner','heizungsplaner'], admins:[], active:true});
  // Custom-Rollen (Cloud-Records, damit sie den Default-Merge überleben)
  put('auth','role:r_custom', {id:'r_custom', name:'Custom Heizung', color:'#dc2626', permissions:{}, kategorien:['heizungsplaner']});
  put('auth','role:r_wide',   {id:'r_wide',   name:'Custom Sanitär', color:'#16a34a', permissions:{}, kategorien:['sanitaerplaner']});
  put('auth','role:r_leer',   {id:'r_leer',   name:'Custom Ohne Kat', color:'#7c3aed', permissions:{}, kategorien:[]});
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
// Session als Super-Admin (user_admin kommt aus DEFAULT_USERS, org_default)
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidXNlcl9hZG1pbiIsIm9yZyI6Im9yZ19kZWZhdWx0Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.sig', userId: 'user_admin', expires: FUTURE };

const browser = await chromium.launch({ executablePath: CHROME });
async function open(){
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { localStorage.setItem('gema_session_v1', s); }, JSON.stringify(SESSION));
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/sys_admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  return { ctx, page };
}

console.log('— 1) getAssignableRoleIdsForOrg: rollen-getrieben —');
{
  seed(); const { ctx, page } = await open();
  ok(page.errs.length === 0, 'sys_admin bootet ohne pageerrors (' + page.errs.slice(0,1).join('') + ')');
  const r = await page.evaluate(() => ({
    san:   GemaAuth.getAssignableRoleIdsForOrg('org_san'),
    sonst: GemaAuth.getAssignableRoleIdsForOrg('org_sonst'),
    multi: GemaAuth.getAssignableRoleIdsForOrg('org_multi')
  }));
  ok(Array.isArray(r.san) && r.san.indexOf('role_planer') >= 0, 'Sanitär-Firma: System-Rolle role_planer wählbar (Default aus KATEGORIE_ROLLEN)');
  ok(r.san.indexOf('r_wide') >= 0, 'Sanitär-Firma: Custom-Rolle mit kategorien=[sanitaerplaner] wählbar');
  ok(r.san.indexOf('r_custom') < 0, 'Sanitär-Firma: Custom-Rolle mit kategorien=[heizungsplaner] NICHT wählbar');
  ok(r.san.indexOf('r_leer') < 0, 'Sanitär-Firma: Custom-Rolle ohne Kategorie NICHT wählbar');
  ok(r.sonst === null, 'Sonstiges-Firma: unbeschränkt (null → alle Rollen)');
  ok(Array.isArray(r.multi) && r.multi.indexOf('role_planer') >= 0 && r.multi.indexOf('r_custom') >= 0 && r.multi.indexOf('r_wide') >= 0, 'Multi-Kategorie-Firma: Vereinigung beider Kategorien');
  await ctx.close();
}

console.log('— 2) getRoleKategorien: gespeichert bzw. Default —');
{
  seed(); const { ctx, page } = await open();
  const r = await page.evaluate(() => {
    const roles = GemaAuth.getRoles();
    const byId = id => roles.find(x => x.id === id);
    return {
      custom: GemaAuth.getRoleKategorien(byId('r_custom')),
      planerDefault: GemaAuth.getRoleKategorien(byId('role_planer')),   // kein kategorien-Feld → Default
      leer: GemaAuth.getRoleKategorien(byId('r_leer'))
    };
  });
  ok(JSON.stringify(r.custom) === JSON.stringify(['heizungsplaner']), 'r_custom: gespeichertes kategorien-Array');
  ok(r.planerDefault.indexOf('sanitaerplaner') >= 0, 'role_planer ohne Feld: Default-Ableitung aus KATEGORIE_ROLLEN (sanitaerplaner)');
  ok(Array.isArray(r.leer) && r.leer.length === 0, 'r_leer: leeres Array bleibt leer (nicht Default)');
  await ctx.close();
}

console.log('— 3) Rolleneditor: Kategorie-Checkboxen + Round-Trip —');
{
  seed(); const { ctx, page } = await open();
  await page.evaluate(() => openRoleModal('r_custom'));
  await page.waitForTimeout(300);
  const pre = await page.evaluate(() => ({
    heiz: !!document.querySelector('#roleKatRows .rolekat-cb[value="heizungsplaner"]')?.checked,
    san:  !!document.querySelector('#roleKatRows .rolekat-cb[value="sanitaerplaner"]')?.checked,
    count: document.querySelectorAll('#roleKatRows .rolekat-cb').length
  }));
  ok(pre.count >= 10, 'Kategorie-Checkboxen gerendert (' + pre.count + ')');
  ok(pre.heiz === true, 'heizungsplaner vorangehakt (aus role.kategorien)');
  ok(pre.san === false, 'sanitaerplaner NICHT vorangehakt');
  // sanitaerplaner anhaken + speichern
  await page.evaluate(() => { const cb = document.querySelector('#roleKatRows .rolekat-cb[value="sanitaerplaner"]'); cb.checked = true; });
  await page.evaluate(() => saveRole());
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const role = GemaAuth.getRoles().find(x => x.id === 'r_custom');
    return { kat: role.kategorien, assignSan: GemaAuth.getAssignableRoleIdsForOrg('org_san') };
  });
  ok(after.kat.indexOf('sanitaerplaner') >= 0 && after.kat.indexOf('heizungsplaner') >= 0, 'Nach Speichern: r_custom.kategorien enthält beide');
  ok(after.assignSan.indexOf('r_custom') >= 0, 'r_custom ist jetzt bei Sanitär-Firmen wählbar');
  ok(page.errs.length === 0, 'keine pageerrors (Round-Trip)');
  await ctx.close();
}

console.log('— 4) Neue Rolle: Standard ohne Kategorie → nur «Sonstiges» —');
{
  seed(); const { ctx, page } = await open();
  await page.evaluate(() => openRoleModal());   // neue Rolle
  await page.waitForTimeout(250);
  const noneChecked = await page.evaluate(() => Array.from(document.querySelectorAll('#roleKatRows .rolekat-cb')).every(cb => !cb.checked));
  ok(noneChecked, 'neue Rolle: keine Kategorie vorangehakt');
  await page.evaluate(() => { document.getElementById('r_name').value = 'Ganz Neu'; saveRole(); });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const role = GemaAuth.getRoles().find(x => x.name === 'Ganz Neu');
    return { has: !!role, id: role && role.id, kat: role ? role.kategorien : null, san: GemaAuth.getAssignableRoleIdsForOrg('org_san'), sonst: GemaAuth.getAssignableRoleIdsForOrg('org_sonst') };
  });
  ok(r.has && Array.isArray(r.kat) && r.kat.length === 0, 'neue Rolle gespeichert mit kategorien=[]');
  ok(Array.isArray(r.san) && r.san.indexOf(r.id) < 0, 'neue Rolle NICHT bei Sanitär-Firmen');
  ok(r.sonst === null, 'aber bei «Sonstiges»-Firmen sichtbar (unbeschränkt)');
  await ctx.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
