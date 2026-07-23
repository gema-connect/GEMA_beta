// Objekt-Anzeige (Bezeichnung ⇄ Adresse), zentral über GemaObjekte.displayName
// — gilt für ALLE Objekt-Dropdowns in allen Modulen. Seit 23.07.2026 mit
// ORG-WEITEM Firmen-Standard (org.settings.objektAnzeige, sys_unternehmen →
// Firmendaten) + persönlicher Übersteuerung im Profil ('bezeichnung'/'adresse';
// Legacy-Stempel 'name' aus früheren Profil-Saves folgt dem Firmen-Standard).
// Plus: universeller Objekt-Preselect (pm_erp) und die sys_profil-Einstellung.
//
// Aufruf:  CHROME=<chromium> node scripts/objekt_anzeige_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8892;
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

const OBJ_A={id:'obj_a',name:'Neubau Alpha',strasse:'Bahnhofstrasse 4',plz:'8000',ort:'Zürich',orgId:'org_t',status:'aktiv'};
const OBJ_B={id:'obj_b',name:'Umbau Beta',strasse:'Seeweg 2',plz:'6000',ort:'Luzern',orgId:'org_t',status:'aktiv'};
const ADR_A='Bahnhofstrasse 4, 8000 Zürich';
function seed(){ store.clear(); [OBJ_A,OBJ_B].forEach(o=>store.set('objekte|objekt:'+o.id,{data:o,_lm:'2026-07-01T00:00:00Z'})); }

const FUTURE=new Date(Date.now()+30*86400000).toISOString();
const ORG={id:'org_t',name:'T AG',kategorie:'sanitaerplaner',kategorien:['sanitaerplaner'],admins:['u1'],active:true};
const USERS=[{id:'u1',username:'a@t.ch',name:'User A',roleIds:['role_admin'],orgId:'org_t',active:true,profile:{email:'a@t.ch'}}];
const OBJ_BLOB={objekte:[OBJ_A,OBJ_B],beteiligte:[],activeObjektId:null};

const browser=await chromium.launch({executablePath:CHROME});
async function open(path, extraLs){
  const ctx=await browser.newContext();
  await ctx.route('**/*',route=>{ const u=route.request().url();
    if(u.startsWith(BASE))return route.continue();
    if(u.indexOf('/rest/v1/')>=0||u.indexOf('/sb/')>=0||u.indexOf('supabase')>=0)return handleSb(route);
    if(u.indexOf('/api/')>=0||u.indexOf('/.netlify/')>=0)return route.fulfill({contentType:'application/json',body:'{}'});
    return route.abort(); });
  await ctx.addInitScript(s=>{ for(const [k,v] of Object.entries(s)) localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v)); },
    Object.assign({gema_orgs_v1:[ORG],gema_users_v1:USERS,gema_session_v1:{token:'x.y.z',userId:'u1',expires:FUTURE},gema_objekte_v1:OBJ_BLOB},extraLs||{}));
  const page=await ctx.newPage(); page.errs=[]; page.on('pageerror',e=>page.errs.push(e.message));
  await page.goto(BASE+path,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1100);
  return {ctx,page};
}

console.log('— 1) GemaObjekte.displayName: Kern-Logik —');
{
  seed(); const {ctx,page}=await open('/pm_planablage.html');
  const r=await page.evaluate((oa)=>({
    nameMode: GemaObjekte.displayName(oa,{modus:'name'}),
    adrMode: GemaObjekte.displayName(oa,{modus:'adresse'}),
    adr: GemaObjekte.objektAdresse(oa),
    fallbackNoName: GemaObjekte.displayName({id:'x',strasse:'Weg 1',plz:'3000',ort:'Bern'},{modus:'name'}),
    fallbackNoAdr: GemaObjekte.displayName({id:'y',name:'Nur Name'},{modus:'adresse'})
  }), OBJ_A);
  ok(r.nameMode==='Neubau Alpha','name-Modus → Bezeichnung');
  ok(r.adrMode===ADR_A,'adresse-Modus → Adresse ('+r.adrMode+')');
  ok(r.adr===ADR_A,'objektAdresse baut Strasse+PLZ+Ort');
  ok(r.fallbackNoName==='Weg 1, 3000 Bern','name-Modus fällt ohne Bezeichnung auf Adresse zurück');
  ok(r.fallbackNoAdr==='Nur Name','adresse-Modus fällt ohne Adresse auf Bezeichnung zurück');
  await ctx.close();
}

console.log('— 2) setAnzeigeModus persistiert (Profil + Cache) —');
{
  seed(); const {ctx,page}=await open('/pm_planablage.html');
  const r=await page.evaluate(()=>{
    GemaObjekte.setAnzeigeModus('adresse');
    var u=GemaAuth.getCurrentUser();
    var cache=JSON.parse(localStorage.getItem('gema_obj_anzeige_v1')||'null');
    return { modus:GemaObjekte.getAnzeigeModus(), profil:u&&u.profile&&u.profile.objektAnzeige, cache:cache&&cache.modus };
  });
  ok(r.modus==='adresse','getAnzeigeModus() = adresse');
  ok(r.profil==='adresse','user.profile.objektAnzeige gesetzt (cross-device)');
  ok(r.cache==='adresse','localStorage-Cache gesetzt');
  await ctx.close();
}

console.log('— 3) Calc-Modul-Dropdown (sb_lu_tabelle) folgt der Einstellung —');
{
  seed(); const {ctx,page}=await open('/sb_lu_tabelle.html');
  await page.evaluate(()=>{ GemaObjekte.setAnzeigeModus('name'); GemaObjekte.refreshAnzeigeModus(); populateObjektDropdown(); });
  let opts=await page.evaluate(()=>Array.from(document.querySelectorAll('#metaObjektDropdown option')).map(o=>o.textContent));
  ok(opts.some(t=>t==='Neubau Alpha'),'name-Modus: Option zeigt Bezeichnung');
  ok(!opts.some(t=>t.indexOf('Bahnhofstrasse')>=0),'name-Modus: keine Adresse');
  await page.evaluate(()=>{ GemaObjekte.setAnzeigeModus('adresse'); GemaObjekte.refreshAnzeigeModus(); populateObjektDropdown(); });
  opts=await page.evaluate(()=>Array.from(document.querySelectorAll('#metaObjektDropdown option')).map(o=>o.textContent));
  ok(opts.some(t=>t===ADR_A),'adresse-Modus: Option zeigt Adresse');
  ok(!opts.some(t=>t==='Neubau Alpha'),'adresse-Modus: keine Bezeichnung');
  ok(page.errs.length===0,'keine pageerrors (calc)');
  await ctx.close();
}

console.log('— 4) pm_planablage-Filter folgt der Einstellung —');
{
  seed(); const {ctx,page}=await open('/pm_planablage.html');
  await page.evaluate(()=>{ GemaObjekte.setAnzeigeModus('adresse'); GemaObjekte.refreshAnzeigeModus(); if(window._pabHooks)window._pabHooks.render(); });
  const opts=await page.evaluate(()=>Array.from(document.querySelectorAll('#pabObjFilter option')).map(o=>o.textContent));
  ok(opts.some(t=>t===ADR_A),'adresse-Modus: pabObjFilter zeigt Adresse');
  await ctx.close();
}

console.log('— 5) pm_erp: Dropdown-Anzeige + Objekt-Preselect —');
{
  // Dokument mit objektId, damit erpObjekte() die Objekte kennt
  seed();
  store.set('erp|erpdok:d1',{data:{id:'d1',typ:'offerte',nr:'OF-1',orgId:'org_t',objektId:'obj_a',objektName:'Neubau Alpha',positionen:[]},_lm:'2026-07-02T00:00:00Z'});
  const {ctx,page}=await open('/pm_erp.html?objekt=obj_a');
  await page.waitForTimeout(900);
  const pre=await page.evaluate(()=>({ filterVal:(document.getElementById('fObjekt')||{}).value, opts:Array.from(document.querySelectorAll('#fObjekt option')).map(o=>o.textContent) }));
  ok(pre.filterVal==='obj_a','Preselect: #fObjekt steht auf dem ?objekt-Projekt');
  ok(pre.opts.some(t=>t==='Neubau Alpha'),'name-Modus: ERP-Option zeigt Bezeichnung');
  await page.evaluate(()=>{ GemaObjekte.setAnzeigeModus('adresse'); GemaObjekte.refreshAnzeigeModus(); erpRenderToolbar(); });
  const opts=await page.evaluate(()=>Array.from(document.querySelectorAll('#fObjekt option')).map(o=>o.textContent));
  ok(opts.some(t=>t===ADR_A),'adresse-Modus: ERP-Option zeigt Adresse');
  ok(page.errs.length===0,'keine pageerrors (erp)');
  await ctx.close();
}

console.log('— 6) sys_profil-Einstellung schreibt ins Profil —');
{
  seed(); const {ctx,page}=await open('/sys_profil.html');
  await page.waitForTimeout(500);
  const r=await page.evaluate(()=>{
    var sel=document.getElementById('pObjektAnzeige');
    if(!sel) return {noSel:true};
    sel.value='adresse'; sel.dispatchEvent(new Event('change',{bubbles:true}));
    var u=GemaAuth.getCurrentUser();
    return { modus:(typeof GemaObjekte!=='undefined'?GemaObjekte.getAnzeigeModus():null), profil:u&&u.profile&&u.profile.objektAnzeige,
      opts:Array.from(sel.options).map(o=>o.value) };
  });
  ok(!r.noSel,'Einstellungs-Select vorhanden');
  ok(r.modus==='adresse','onchange setzt GemaObjekte-Modus');
  ok(r.profil==='adresse','Profil bekommt objektAnzeige=adresse');
  ok(r.opts.join(',')===',bezeichnung,adresse','Optionen: Firmen-Standard / bezeichnung / adresse');
  ok(page.errs.length===0,'keine pageerrors (profil)');
  await ctx.close();
}

console.log('— 7) Firmen-Standard (org.settings.objektAnzeige) + Override-Auflösung —');
{
  seed();
  const ORG_ADR=Object.assign({},ORG,{settings:{objektAnzeige:'adresse'}});
  const {ctx,page}=await open('/pm_planablage.html',{gema_orgs_v1:[ORG_ADR]});
  const r=await page.evaluate((oa)=>{
    var out={};
    // (a) kein persönlicher Override → Firmen-Standard adresse greift
    out.orgStd=GemaObjekte.refreshAnzeigeModus();
    out.orgGet=GemaObjekte.getOrgAnzeigeModus();
    out.label=GemaObjekte.displayName(oa);
    // (b) bewusste Übersteuerung 'bezeichnung' gewinnt gegen Org-adresse
    GemaObjekte.setAnzeigeModus('bezeichnung');
    out.overrideBez=GemaObjekte.getAnzeigeModus();
    out.profilBez=(GemaAuth.getCurrentUser().profile||{}).objektAnzeige;
    // (c) '' = «Wie Firmen-Standard» kehrt zum Org-Standard zurück
    GemaObjekte.setAnzeigeModus('');
    out.backToOrg=GemaObjekte.getAnzeigeModus();
    // (d) Legacy-Stempel 'name' (alte Profil-Saves) zählt NICHT als Override
    GemaAuth.updateProfile(GemaAuth.getCurrentUser().id,{objektAnzeige:'name'});
    out.legacyName=GemaObjekte.refreshAnzeigeModus();
    // (e) Override 'adresse' bleibt Override, auch wenn Org auf name stünde
    GemaObjekte.setAnzeigeModus('adresse');
    out.overrideAdr=GemaObjekte.getAnzeigeModus();
    return out;
  }, OBJ_A);
  ok(r.orgStd==='adresse','ohne Override greift der Firmen-Standard (adresse)');
  ok(r.orgGet==='adresse','getOrgAnzeigeModus() liest org.settings');
  ok(r.label===ADR_A,'displayName folgt dem Firmen-Standard');
  ok(r.overrideBez==='name','Override bezeichnung schlägt Org-adresse');
  ok(r.profilBez==='bezeichnung','Override wird als \'bezeichnung\' im Profil gespeichert');
  ok(r.backToOrg==='adresse','\'\' (Wie Firmen-Standard) kehrt zum Org-Standard zurück');
  ok(r.legacyName==='adresse','Legacy-Stempel \'name\' folgt dem Firmen-Standard (kein Override)');
  ok(r.overrideAdr==='adresse','Override adresse bleibt persönlich wirksam');
  ok(page.errs.length===0,'keine pageerrors (org-standard)');
  await ctx.close();
}

console.log('— 8) sys_unternehmen: Firmen-Standard-Select schreibt org.settings —');
{
  seed(); const {ctx,page}=await open('/sys_unternehmen.html');
  await page.waitForTimeout(600);
  const r=await page.evaluate(()=>{
    var sel=document.getElementById('orgObjAnzeige');
    if(!sel) return {noSel:true};
    var initial=sel.value;
    sel.value='adresse';
    saveOrgInfo();
    var org=GemaAuth.getCurrentOrg();
    return { initial:initial, saved:(org.settings||{}).objektAnzeige,
      modus:(typeof GemaObjekte!=='undefined'?GemaObjekte.getAnzeigeModus():null),
      orgGet:(typeof GemaObjekte!=='undefined'?GemaObjekte.getOrgAnzeigeModus():null) };
  });
  ok(!r.noSel,'Firmen-Standard-Select vorhanden');
  ok(r.initial==='name','Default zeigt Fokus Bezeichnung');
  ok(r.saved==='adresse','saveOrgInfo schreibt org.settings.objektAnzeige');
  ok(r.modus==='adresse','aufgelöster Modus folgt sofort dem neuen Standard');
  ok(r.orgGet==='adresse','getOrgAnzeigeModus() liefert den neuen Standard');
  ok(page.errs.length===0,'keine pageerrors (unternehmen)');
  await ctx.close();
}

console.log('');
console.log(pass+' passed, '+fail+' failed');
await browser.close(); server.close();
process.exit(fail?1:0);
