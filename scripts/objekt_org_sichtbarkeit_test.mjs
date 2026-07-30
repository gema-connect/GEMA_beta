// Objekte von Kolleg:innen MÜSSEN in der eigenen Firma sichtbar sein
// (Feedback 26.07.2026: «gewisse Objekte sehe ich nicht in meinem Account,
// obwohl sie von jemandem innerhalb der Org erstellt wurden»).
//
// Bug-Klasse: Der Org-Filter verglich stur `(o.orgId||'org_default')` mit der
// eigenen orgId. Ein Objekt OHNE Org-Stempel — pm_objekte stempelte ihn nur
// `if(_currentOrgId)`, also nicht, wenn die Session beim Anlegen noch nicht
// aufgelöst war — bzw. mit dem Sammel-Stempel 'org_default' (den setzt
// `_refreshAuthCtx` für User ohne eigene orgId) war damit für die ganze Firma
// unsichtbar; nur ein GEMA-Admin (role_admin) sah es. Firmen-Admins sind KEINE
// role_admin → sahen es auch nicht.
//
// Fix: Zuordnung wird abgeleitet (GemaObjekte.effektiveOrgId: orgId → Org des
// Erstellers, null = herrenlos → NUR Ersteller/Team, nie fremde Orgs); pm_objekte
// filtert über _objSichtbar; Neuanlage stempelt die orgId immer; Bearbeiten
// und das Wartungs-Panel heilen Altbestand. Fremde Orgs bleiben unsichtbar.
//
// Aufruf:  CHROME=<chromium> node scripts/objekt_org_sichtbarkeit_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8894;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/pm_objekte.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

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
  if(m==='POST'){ let b=[]; try{b=JSON.parse(req.postData()||'[]');}catch(e){} if(!Array.isArray(b))b=[b];
    b.forEach(r=>{ if(r&&r.module_key&&r.data_key) store.set(r.module_key+'|'+r.data_key, r.payload||{}); });
    return route.fulfill({status:201,contentType:'application/json',body:''}); }
  if(m==='DELETE'){ if(mkEq&&dkEq) store.delete(mkEq+'|'+dkEq); return route.fulfill({status:204,body:''}); }
  return route.fulfill({contentType:'application/json',body:'{}'});
}

// ── Objekte: die vier realen Fälle ──
const O_OK    ={id:'o_ok',   name:'Sauber gestempelt', orgId:'org_t', erstelltVon:'u_koll', status:'aktiv'};
const O_NOORG ={id:'o_noorg',name:'Kollege ohne Stempel',            erstelltVon:'u_koll', status:'aktiv'};   // orgId FEHLT
const O_DEF   ={id:'o_def',  name:'Kollege mit org_default', orgId:'org_default', erstelltVon:'u_koll', status:'aktiv'};
const O_FREMD ={id:'o_fremd',name:'Fremde Firma', orgId:'org_x', erstelltVon:'u_x', status:'aktiv'};
const O_WAISE ={id:'o_waise',name:'Herrenlos', erstelltVon:'u_geloescht', status:'aktiv'};                     // nichts auflösbar
const O_WAISE_TEAM={id:'o_waise_team',name:'Herrenlos im Team', erstelltVon:'u_geloescht', teamUserIds:['u_me'], status:'aktiv'}; // herrenlos, aber Team-zugewiesen
const ALLE=[O_OK,O_NOORG,O_DEF,O_FREMD,O_WAISE,O_WAISE_TEAM];
function seed(){ store.clear(); ALLE.forEach(o=>store.set('objekte|objekt:'+o.id,{data:o,_lm:'2026-07-01T00:00:00Z'})); }

const FUTURE=new Date(Date.now()+30*86400000).toISOString();
const JWT='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV9tZSIsIm9yZyI6Im9yZ190Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.testsig';
const ORGS=[{id:'org_t',name:'T AG',kategorie:'sanitaerplaner',kategorien:['sanitaerplaner'],admins:['u_me'],active:true},
  {id:'org_x',name:'X GmbH',kategorie:'sanitaerplaner',kategorien:['sanitaerplaner'],admins:['u_x'],active:true}];
// u_me = Firmen-Admin (org.admins) mit Planer-Rolle — bewusst NICHT role_admin
const USERS=[
  {id:'u_me',username:'me@t.ch',name:'Ich Chef',roleIds:['role_planer'],orgId:'org_t',active:true,profile:{email:'me@t.ch'}},
  {id:'u_koll',username:'k@t.ch',name:'Kollege K',roleIds:['role_planer'],orgId:'org_t',active:true,profile:{email:'k@t.ch'}},
  {id:'u_x',username:'x@x.ch',name:'Xaver Fremd',roleIds:['role_planer'],orgId:'org_x',active:true,profile:{email:'x@x.ch'}}
];

const browser=await chromium.launch({executablePath:CHROME});
async function open(page_='/pm_objekte.html', extraLs){
  const ctx=await browser.newContext();
  await ctx.route('**/*',route=>{ const u=route.request().url();
    if(u.startsWith(BASE))return route.continue();
    if(u.indexOf('/rest/v1/')>=0||u.indexOf('/sb/')>=0||u.indexOf('supabase')>=0)return handleSb(route);
    if(u.indexOf('/api/')>=0||u.indexOf('/.netlify/')>=0)return route.fulfill({contentType:'application/json',body:'{}'});
    return route.abort(); });
  await ctx.addInitScript(s=>{ for(const [k,v] of Object.entries(s)) localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v)); },
    Object.assign({gema_orgs_v1:ORGS,gema_users_v1:USERS,gema_session_v1:{token:JWT,userId:'u_me',expires:FUTURE},
      gema_objekte_v1:{objekte:ALLE,beteiligte:[],activeObjektId:null},gema_objpool_v1:ALLE,
      gema_coachmarks_done_pm_objekte:'1'},extraLs||{}));
  const page=await ctx.newPage(); page.errs=[]; page.on('pageerror',e=>page.errs.push(e.message));
  await page.goto(BASE+page_,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1200);
  return {ctx,page};
}
const visIds=page=>page.evaluate(()=>_objDelHooks.alle().filter(_objDelHooks.sichtbar).map(o=>o.id));
const cardHtml=page=>page.evaluate(()=>(document.getElementById('objGrid').innerHTML||'')+(document.getElementById('objTableWrap')?document.getElementById('objTableWrap').innerHTML:''));

console.log('— 1) Firmen-Admin (kein role_admin) sieht die Objekte der Kolleg:innen —');
{
  seed(); const {ctx,page}=await open();
  const vis=await visIds(page);
  ok(vis.indexOf('o_ok')>=0,'sauber gestempeltes Objekt sichtbar');
  ok(vis.indexOf('o_noorg')>=0,'Objekt OHNE orgId sichtbar (Kern des Feedbacks)');
  ok(vis.indexOf('o_def')>=0,'Objekt mit Sammel-Stempel org_default sichtbar (Ersteller entscheidet)');
  ok(vis.indexOf('o_waise')<0,'herrenloses Objekt OHNE Bezug nicht mehr sichtbar (Datenleck-Fix 30.07.2026 — erschien vorher in JEDER Org)');
  ok(vis.indexOf('o_waise_team')>=0,'herrenloses Objekt MIT Team-Zuweisung bleibt sichtbar (Anti-Verlust)');
  ok(vis.indexOf('o_fremd')<0,'Objekt einer FREMDEN Firma bleibt unsichtbar (kein Leak)');
  ok(await page.evaluate(()=>!GemaAuth.isAdmin()),'Testkonto ist bewusst kein GEMA-Admin');
  const html=await cardHtml(page);
  ok(html.indexOf('o_noorg')>=0&&html.indexOf('o_def')>=0,'… und sie stehen wirklich in der gerenderten Liste');
  ok(html.indexOf('o_fremd')<0,'Fremd-Objekt nicht in der Liste');
  const badge=await page.evaluate(()=>document.getElementById('badgeObj').textContent);
  ok(badge==='4','Badge zählt die 4 sichtbaren Objekte ('+badge+')');
  ok(page.errs.length===0,'keine JS-Fehler'+(page.errs.length?' ('+page.errs[0]+')':''));
  await ctx.close();
}

console.log('— 2) Cross-Modul-API (Dropdowns aller Module) —');
{
  seed(); const {ctx,page}=await open('/pm_planablage.html');
  const r=await page.evaluate(()=>({
    all:(GemaObjekte.getAll()||[]).map(o=>o.id),
    effNo:GemaObjekte.effektiveOrgId({id:'x',erstelltVon:'u_koll'}),
    effDef:GemaObjekte.effektiveOrgId({id:'y',orgId:'org_default',erstelltVon:'u_koll'}),
    effOwn:GemaObjekte.effektiveOrgId({id:'z',orgId:'org_x',erstelltVon:'u_koll'}),
    effNull:GemaObjekte.effektiveOrgId({id:'w'})
  }));
  ok(r.all.indexOf('o_noorg')>=0&&r.all.indexOf('o_def')>=0,'GemaObjekte.getAll() liefert die Kollegen-Objekte');
  ok(r.all.indexOf('o_fremd')<0,'getAll() blendet die fremde Firma aus');
  ok(r.all.indexOf('o_waise')<0,'getAll() blendet herrenlose Objekte ohne Bezug aus (Leak-Fix)');
  ok(r.all.indexOf('o_waise_team')>=0,'getAll() behält herrenlose Objekte mit Team-Zuweisung');
  ok(r.effNo==='org_t','effektiveOrgId: ohne orgId → Org des Erstellers');
  ok(r.effDef==='org_t','effektiveOrgId: org_default → Org des Erstellers');
  ok(r.effOwn==='org_x','effektiveOrgId: echter Stempel gewinnt (wird nie überschrieben)');
  ok(r.effNull===null,'effektiveOrgId: nichts auflösbar → null (herrenlos)');
  await ctx.close();
}

console.log('— 3) Ursache: Neuanlage stempelt die orgId IMMER —');
{
  seed(); const {ctx,page}=await open();
  // Session-Kontext künstlich «unaufgelöst» wie beim langsamen Boot
  await page.evaluate(()=>{ _currentOrgId=null; openObjektModal(); document.getElementById('objName').value='Frisch erfasst'; _objWzFinish(); });
  await page.waitForTimeout(400);
  const neu=await page.evaluate(()=>_objDelHooks.alle().find(o=>o.name==='Frisch erfasst')||null);
  ok(neu&&neu.orgId==='org_t','neues Objekt bekommt den Org-Stempel trotz null-Kontext');
  ok(neu&&neu.erstelltVon==='u_me','Ersteller gestempelt (Basis der Ableitung)');
  await ctx.close();
}

console.log('— 4) Heilung: Bearbeiten stempelt fehlende orgId nach —');
{
  seed(); const {ctx,page}=await open();
  await page.evaluate(()=>{ openObjektModal('o_noorg'); _objWzFinish(); });
  await page.waitForTimeout(400);
  const o=await page.evaluate(()=>_objDelHooks.alle().find(x=>x.id==='o_noorg'));
  ok(o&&o.orgId==='org_t','fehlender Stempel wird beim Speichern gesetzt');
  const fremd=await page.evaluate(()=>{ const f=_objDelHooks.alle().find(x=>x.id==='o_fremd'); return f&&f.orgId; });
  ok(fremd==='org_x','fremder Stempel bleibt unangetastet');
  await ctx.close();
}

console.log('— 5) Wartungs-Panel: «ohne Firma» sichtbar + reparierbar —');
{
  seed(); const {ctx,page}=await open();
  await page.evaluate(()=>_objWartungOpen());
  await page.waitForTimeout(300);
  const r=await page.evaluate(()=>{
    const rows=_objDelHooks.wartungRows(null);
    const noorg=rows.find(x=>x.id==='o_noorg');
    return { hat:!!noorg, flag:noorg&&noorg.ohneOrg, eff:noorg&&noorg.effOrg,
      html:document.getElementById('objWartungBody').innerHTML.indexOf('ohne Firma')>=0,
      btn:document.getElementById('objWartungBody').innerHTML.indexOf('_objOrgZuordnen')>=0 };
  });
  ok(r.hat,'Panel listet das Objekt ohne Firmen-Stempel');
  ok(r.flag===true,'… mit ohneOrg-Flag');
  ok(r.eff==='org_t','… und abgeleiteter Firma');
  ok(r.html,'Badge «⚠ ohne Firma» im Panel');
  ok(r.btn,'Reparatur-Button vorhanden');
  await page.evaluate(()=>_objOrgZuordnen('o_noorg'));
  await page.waitForTimeout(300);
  const o=await page.evaluate(()=>_objDelHooks.alle().find(x=>x.id==='o_noorg'));
  ok(o&&o.orgId==='org_t','«Zuordnen» stempelt die eigene Firma');
  const cloud=store.get('objekte|objekt:o_noorg'); const cd=cloud&&(cloud.data||cloud);
  ok(cd&&cd.orgId==='org_t','… und schreibt es in die Cloud (auch für die Kolleg:innen)');
  ok(page.errs.length===0,'keine JS-Fehler');
  await ctx.close();
}

console.log('— 6) Gegenprobe: fremde Firma sieht unsere Objekte nicht —');
{
  seed();
  const ctx=await browser.newContext();
  await ctx.route('**/*',route=>{ const u=route.request().url();
    if(u.startsWith(BASE))return route.continue();
    if(u.indexOf('/rest/v1/')>=0||u.indexOf('/sb/')>=0||u.indexOf('supabase')>=0)return handleSb(route);
    if(u.indexOf('/api/')>=0||u.indexOf('/.netlify/')>=0)return route.fulfill({contentType:'application/json',body:'{}'});
    return route.abort(); });
  const JWT_X='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV94Iiwib3JnIjoib3JnX3giLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig';
  await ctx.addInitScript(s=>{ for(const [k,v] of Object.entries(s)) localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v)); },
    {gema_orgs_v1:ORGS,gema_users_v1:USERS,gema_session_v1:{token:JWT_X,userId:'u_x',expires:FUTURE},
     gema_objekte_v1:{objekte:ALLE,beteiligte:[],activeObjektId:null},gema_objpool_v1:ALLE,gema_coachmarks_done_pm_objekte:'1'});
  const page=await ctx.newPage();
  await page.goto(BASE+'/pm_objekte.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1200);
  const vis=await visIds(page);
  ok(vis.indexOf('o_fremd')>=0,'Fremd-Firma sieht ihr eigenes Objekt');
  ok(vis.indexOf('o_ok')<0&&vis.indexOf('o_noorg')<0&&vis.indexOf('o_def')<0,'… aber KEINES unserer Objekte (auch nicht die ungestempelten)');
  ok(vis.indexOf('o_waise')<0&&vis.indexOf('o_waise_team')<0,'… und auch keine HERRENLOSEN Objekte (der gemeldete Leak: «in einer anderen Org sehe ich meine Projekte»)');
  await ctx.close();
}

await browser.close(); server.close();
console.log('\n'+(fail?('✗ '+fail+' von '+(pass+fail)+' Checks FEHLGESCHLAGEN'):('✅ '+(pass+fail)+'/'+(pass+fail)+' Checks')));
process.exit(fail?1:0);
