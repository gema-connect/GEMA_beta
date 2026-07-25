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
// Gültig aussehendes JWT (uid/org-Claims) — GemaAuth löst den User damit
// synchron beim Boot auf (nötig für pm_objekte, das _isAdminUser/_currentOrgId
// im DOMContentLoaded einmal erfasst).
const JWT='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig';
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
    Object.assign({gema_orgs_v1:[ORG],gema_users_v1:USERS,gema_session_v1:{token:JWT,userId:'u1',expires:FUTURE},gema_objekte_v1:OBJ_BLOB,gema_objpool_v1:[OBJ_A,OBJ_B]},extraLs||{}));
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

console.log('— 9) pm_objekte: Karten/Liste + Wizard-Defaults (23.07.2026) —');
{
  // Zusatz-Objekte: obj_c (Name = Adresse → der gemeldete Doppel-Bug), obj_child (Kind von obj_a)
  seed();
  const OBJ_C={id:'obj_c',name:'Musterweg 1, 3000 Bern',strasse:'Musterweg 1',plz:'3000',ort:'Bern',orgId:'org_t',status:'aktiv'};
  const OBJ_CHILD={id:'obj_child',name:'Haus A',parentObjektId:'obj_a',strasse:'Weg 9',plz:'8000',ort:'Zürich',orgId:'org_t',status:'aktiv'};
  [OBJ_C,OBJ_CHILD].forEach(o=>store.set('objekte|objekt:'+o.id,{data:o,_lm:'2026-07-02T00:00:00Z'}));
  const BLOB2={objekte:[OBJ_A,OBJ_B,OBJ_C,OBJ_CHILD],beteiligte:[],activeObjektId:'obj_a'};
  const {ctx,page}=await open('/pm_objekte.html',{gema_objekte_v1:BLOB2,gema_active_objekt_v1:'obj_a'});
  await page.waitForFunction(()=>typeof renderObjekte==='function'&&typeof setObjView==='function'&&typeof openObjektModal==='function',null,{timeout:12000});
  await page.waitForTimeout(600);
  await page.evaluate(()=>{ setObjView('karten'); renderObjekte(); });
  // Karten-Dedup: Objekt, dessen Name = seine Adresse
  {
    const r=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll('#objGrid .obj-card')];
      const cardC=cards.find(c=>c.querySelector('.obj-name')&&c.querySelector('.obj-name').textContent.indexOf('Musterweg 1')>=0);
      const cardA=cards.find(c=>c.querySelector('.obj-name')&&c.querySelector('.obj-name').textContent.indexOf('Neubau Alpha')>=0);
      return {
        cLocs: cardC?[...cardC.querySelectorAll('.obj-loc')].map(e=>e.textContent):null,
        aTitle: cardA?cardA.querySelector('.obj-name').textContent.trim():null,
        aLoc: cardA&&cardA.querySelector('.obj-loc')?cardA.querySelector('.obj-loc').textContent:null
      };
    });
    ok(r.cLocs&&r.cLocs.length===0,'Karte mit Name=Adresse zeigt die Adresse NICHT doppelt (kein Untertitel)');
    ok(r.aTitle&&r.aTitle.indexOf('Neubau Alpha')===0&&r.aTitle.indexOf('Bahnhofstrasse')<0,'Karte: Titel = Bezeichnung (Name-Modus, ohne Adresse)');
    ok(r.aLoc&&r.aLoc.indexOf('Bahnhofstrasse 4')>=0,'Karte: Untertitel = Adresse (unterschiedlich → sichtbar)');
  }
  // Parent-Crumb: Kind-Objekt bekommt padding-right (kollidiert nicht mit Badge)
  ok(await page.evaluate(()=>{
    const c=[...document.querySelectorAll('#objGrid .obj-parent-crumb')][0];
    if(!c)return false;
    const pr=parseFloat(getComputedStyle(c).paddingRight);
    return pr>=80 && c.textContent.indexOf('Neubau Alpha')>=0;
  }),'Kind-Karte: Parent-Crumb hat Badge-Freiraum (padding-right ≥ 80px)');
  // Listenansicht-Umschalter
  await page.evaluate(()=>setObjView('liste'));
  {
    const r=await page.evaluate(()=>({
      tableVisible: getComputedStyle(document.getElementById('objTableWrap')).display!=='none',
      gridHidden: getComputedStyle(document.getElementById('objGrid')).display==='none',
      rows: document.querySelectorAll('#objTableWrap table.obj-table tr.orow').length,
      segOn: document.getElementById('objViewListe').classList.contains('on'),
      stored: localStorage.getItem('gema_obj_view_v1')
    }));
    ok(r.tableVisible&&r.gridHidden,'Liste: Tabelle sichtbar, Karten-Grid ausgeblendet');
    ok(r.rows>=4,'Liste: Objekt-Zeilen gerendert ('+r.rows+')');
    ok(r.segOn&&r.stored==='liste','Umschalter aktiv + pro Gerät gespeichert');
  }
  await page.evaluate(()=>setObjView('karten'));
  ok(await page.evaluate(()=>getComputedStyle(document.getElementById('objGrid')).display!=='none'&&getComputedStyle(document.getElementById('objTableWrap')).display==='none'),'Zurück auf Karten: Grid sichtbar, Tabelle weg');
  // Wizard: übergeordnetes Objekt Default «kein» (trotz aktivem Objekt obj_a)
  await page.evaluate(()=>openObjektModal());
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>document.getElementById('objParentId').value===''),'Wizard: «Übergeordnetes Objekt» Default = Kein (trotz aktivem Objekt)');
  // Wizard: Verantwortlich (Projektleiter) Default = ich selbst
  ok(await page.evaluate(()=>document.getElementById('objProjektLeiterId').value==='u1'),'Wizard: Projektleiter Default = eingeloggter User');
  // Wizard: «Fertig stellen»-Button auf Schritt 1 sichtbar + speichert + schliesst
  ok(await page.evaluate(()=>{const b=document.getElementById('objWzDone');return b&&getComputedStyle(b).display!=='none';}),'Wizard: «Fertig stellen» auf Schritt 1 sichtbar');
  await page.evaluate(()=>{ document.getElementById('objName').value='Blitz-Projekt'; _objWzFinish(); });
  await page.waitForTimeout(300);
  {
    const r=await page.evaluate(()=>{
      const blob=JSON.parse(localStorage.getItem('gema_objekte_v1')||'{}');
      const saved=(blob.objekte||[]).find(o=>o.name==='Blitz-Projekt');
      return { open: document.getElementById('objModal').classList.contains('open'), saved: saved };
    });
    ok(!r.open,'«Fertig stellen» schliesst den Wizard');
    ok(r.saved && !r.saved.parentObjektId && r.saved.projektLeiterId==='u1','«Fertig stellen» speichert (kein Parent, Projektleiter = ich)');
  }
  ok(page.errs.length===0,'keine pageerrors (pm_objekte)'+(page.errs.length?' — '+page.errs[0]:''));
  await ctx.close();
}

console.log('— 10) pm_objekte Liste: Filter, Spalten (Resize/Ein-Aus), Kontextmenü (24.07.2026) —');
{
  store.clear();   // nur die zwei Objekte dieser Sektion (kein OBJ_A/OBJ_B)
  const U2={id:'u2',name:'Anna Muster',roleIds:['role_planer'],orgId:'org_t',active:true,profile:{}};
  const O1={id:'lo1',name:'Neubau Weiler',strasse:'Weilerweg 20',plz:'4057',ort:'Basel',kanton:'BS',orgId:'org_t',status:'aktiv',bauvorhaben:'Neubau',projektnummer:'2026-01',projektLeiterId:'u1',createdAt:'2026-05-01T00:00:00Z'};
  const O2={id:'lo2',name:'Sanierung Olten',strasse:'Sonnenweg 3',plz:'4600',ort:'Olten',kanton:'SO',orgId:'org_t',status:'abgeschlossen',bauvorhaben:'Sanierung',projektLeiterId:'u2',createdAt:'2026-05-02T00:00:00Z'};
  [O1,O2].forEach(o=>store.set('objekte|objekt:'+o.id,{data:o,_lm:'2026-07-02T00:00:00Z'}));
  const BLOB={objekte:[O1,O2],beteiligte:[],activeObjektId:'lo1'};
  const RICH=JSON.stringify(['objekt','nummer','bauvorhaben','phase','ort','kanton','projektleiter','beteiligte','status','erstellt','aktionen']);
  const {ctx,page}=await open('/pm_objekte.html',{gema_users_v1:[USERS[0],U2],gema_objekte_v1:BLOB,gema_active_objekt_v1:'lo1',gema_obj_view_v1:'liste',gema_obj_cols_v1:RICH});
  await page.waitForFunction(()=>typeof renderObjekte==='function'&&typeof setObjColFilter==='function'&&typeof _objHeaderCtx==='function',null,{timeout:12000});
  await page.waitForTimeout(700);
  // Status-Filter der Toolbar auf «Alle» (O2 ist abgeschlossen) — die per-Spalte-Filter testen wir separat
  await page.evaluate(()=>setObjFilter('all'));
  await page.waitForTimeout(150);
  // Spalten + Filter vorhanden
  ok(await page.evaluate(()=>document.querySelectorAll('#objTableWrap tr.orow').length===2),'Liste: beide Objekte als Zeilen');
  ok(await page.evaluate(()=>{
    const h=[...document.querySelectorAll('#objTableWrap thead th')].map(t=>t.textContent.replace(/[↔\s]/g,'').replace('👷','Bet'));
    return h.some(x=>x.indexOf('Projektleiter')>=0)&&h.some(x=>x.indexOf('Kanton')>=0)&&h.some(x=>x.indexOf('Nummer')>=0);
  }),'Liste: Rich-Spalten (Nummer/Kanton/Projektleiter) sichtbar');
  ok(await page.evaluate(()=>{
    const r=[...document.querySelectorAll('#objTableWrap tr.orow')].find(x=>x.textContent.indexOf('Weiler')>=0);
    return r && r.textContent.indexOf('User A')>=0;   // Projektleiter-Name (u1) aufgelöst
  }),'Liste: Projektleiter-Name aufgelöst (nicht die ID)');
  ok(await page.evaluate(()=>document.querySelectorAll('.obj-lfilter .lf select').length===7),'Filterzeile: 7 Dropdowns (je filterbare Spalte)');
  // Filter anwenden → narrows + persistiert
  await page.evaluate(()=>setObjColFilter('status','aktiv'));
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>document.querySelectorAll('#objTableWrap tr.orow').length===1),'Filter status=aktiv: nur 1 Zeile');
  ok(await page.evaluate(()=>{const f=JSON.parse(localStorage.getItem('gema_obj_lfilter_v1')||'{}');return f.status==='aktiv';}),'Filter pro Gerät gespeichert');
  ok(await page.evaluate(()=>{const s=[...document.querySelectorAll('.obj-lfilter .lf select')].find(x=>x.value==='aktiv');return !!s && s.classList.contains('act');}),'aktiver Filter-Select markiert (.act)');
  await page.evaluate(()=>clearObjColFilters());
  await page.waitForTimeout(120);
  ok(await page.evaluate(()=>document.querySelectorAll('#objTableWrap tr.orow').length===2),'«Filter zurücksetzen» zeigt wieder alle');
  // Ort-Filter (per-Spalte)
  await page.evaluate(()=>setObjColFilter('ort','Olten'));
  await page.waitForTimeout(120);
  ok(await page.evaluate(()=>{const r=[...document.querySelectorAll('#objTableWrap tr.orow')];return r.length===1&&r[0].textContent.indexOf('Olten')>=0;}),'Ort-Filter «Olten»: nur das Olten-Objekt');
  await page.evaluate(()=>clearObjColFilters());
  await page.waitForTimeout(120);
  // Spaltenbreite per Drag (Nummer-Spalte breiter ziehen)
  {
    const before=await page.evaluate(()=>{const c=document.querySelector('#objTableWrap col[data-col="nummer"]');return c?parseFloat(c.style.width):0;});
    await page.evaluate(()=>{
      const th=[...document.querySelectorAll('#objTableWrap thead th')][1];
      const handle=th.querySelector('.col-rsz'); const rect=th.getBoundingClientRect();
      handle.dispatchEvent(new PointerEvent('pointerdown',{clientX:rect.right,clientY:rect.top+5,bubbles:true,pointerId:1}));
      document.dispatchEvent(new PointerEvent('pointermove',{clientX:rect.right+60,clientY:rect.top+5,bubbles:true,pointerId:1}));
      document.dispatchEvent(new PointerEvent('pointerup',{clientX:rect.right+60,clientY:rect.top+5,bubbles:true,pointerId:1}));
    });
    await page.waitForTimeout(120);
    const after=await page.evaluate(()=>({w:(JSON.parse(localStorage.getItem('gema_obj_colw_v1')||'{}')).nummer,col:parseFloat((document.querySelector('#objTableWrap col[data-col="nummer"]')||{}).style?.width||'0')}));
    ok(after.w && after.w>before+30,'Spaltenbreite per Drag angepasst (Nummer +≈60px) — before '+before+' → '+after.w);
    ok(after.w && Math.abs(after.col-after.w)<2,'neue Breite auch im colgroup + pro Gerät gespeichert');
  }
  // Kopfzeilen-Rechtsklick: Spalte ausblenden
  await page.evaluate(()=>_objHeaderCtx({preventDefault(){},stopPropagation(){},clientX:200,clientY:120}));
  ok(await page.evaluate(()=>document.getElementById('objCtxMenu')&&[...document.querySelectorAll('#objCtxMenu button')].some(b=>b.textContent.indexOf('Kanton')>=0)),'Kopfzeilen-Menü listet die Spalten');
  await page.evaluate(()=>{const b=[...document.querySelectorAll('#objCtxMenu button')].find(x=>x.textContent.indexOf('Kanton')>=0);b.click();});
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>![...document.querySelectorAll('#objTableWrap thead th')].some(t=>t.textContent.indexOf('Kanton')>=0)),'Spalte «Kanton» ausgeblendet');
  ok(await page.evaluate(()=>{const c=JSON.parse(localStorage.getItem('gema_obj_cols_v1')||'[]');return c.indexOf('kanton')<0;}),'Spalten-Sichtbarkeit pro Gerät gespeichert');
  await page.evaluate(()=>{const m=document.getElementById('objCtxMenu');if(m)m.remove();});
  // Zeilen-Rechtsklick: Kontextmenü mit Aktionen
  await page.evaluate(()=>{const r=document.querySelector('#objTableWrap tr.orow');r.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:120,clientY:200}));});
  await page.waitForTimeout(100);
  ok(await page.evaluate(()=>{const m=document.getElementById('objCtxMenu');if(!m)return false;const t=m.textContent;return t.indexOf('Bearbeiten')>=0&&t.indexOf('Duplizieren')>=0&&t.indexOf('Löschen')>=0&&t.toLowerCase().indexOf('selekti')>=0;}),'Zeilen-Rechtsklick: Kontextmenü mit Aktionen');
  await page.evaluate(()=>{const b=[...document.querySelectorAll('#objCtxMenu button')].find(x=>x.textContent.indexOf('Bearbeiten')>=0);b.click();});
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>document.getElementById('objModal').classList.contains('open')),'Kontextmenü «Bearbeiten» öffnet den Editor');
  await page.evaluate(()=>closeModal('objModal'));
  // Karten-Rechtsklick funktioniert ebenso
  await page.evaluate(()=>{setObjView('karten');});
  await page.waitForTimeout(200);
  await page.evaluate(()=>{const c=document.querySelector('#objGrid .obj-card');c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:120,clientY:200}));});
  await page.waitForTimeout(100);
  ok(await page.evaluate(()=>{const m=document.getElementById('objCtxMenu');return m&&m.textContent.indexOf('Duplizieren')>=0;}),'Karten-Rechtsklick: gleiches Kontextmenü');
  await page.evaluate(()=>{const m=document.getElementById('objCtxMenu');if(m)m.remove();});
  ok(page.errs.length===0,'keine pageerrors (Liste-Features)'+(page.errs.length?' — '+page.errs[0]:''));
  await ctx.close();
}

/* ── Termine (pm_einsatzplan): der Schnappschuss objektName darf die
      Einstellung nicht überstimmen ── */
console.log('— Termine: Objekt-Anzeige folgt der Einstellung —');
const EINSATZ={id:'ev1',orgId:'org_t',typ:'auftrag',titel:'Montage Sanitär',
  objektId:'obj_a',objektName:'Neubau Alpha',monteurUserId:'u1',monteurName:'User A',
  datum:new Date().toISOString().slice(0,10),dauerTage:1,zeitVon:'07:30',zeitBis:'11:00',
  erstelltVon:{userId:'u1',name:'User A'}};
for (const [modus, lbl] of [['adresse','Adresse'],['bezeichnung','Bezeichnung']]) {
  seed();
  store.set('einsatzplan|einsatz:ev1',{data:EINSATZ,_lm:'2026-07-20T00:00:00Z'});
  const {ctx,page}=await open('/pm_einsatzplan.html',{
    gema_einsatz_pool_v1:[EINSATZ],
    gema_users_v1:[Object.assign({},USERS[0],{profile:{email:'a@t.ch',objektAnzeige:modus}})]
  });
  await page.waitForFunction(()=>typeof epOrtText==='function',null,{timeout:12000});
  await page.waitForTimeout(1200);
  const r=await page.evaluate(()=>({ort:epOrtText((GemaSync.getCached('gema_einsatz_pool_v1')||[])[0]||{objektId:'obj_a',objektName:'Neubau Alpha'}),
                                    nm:epObjName('obj_a','Neubau Alpha')}));
  if(modus==='adresse'){
    ok(r.nm===ADR_A,'Adress-Modus: epObjName liefert die Adresse («'+r.nm+'»)');
    ok(r.ort.indexOf('Neubau Alpha')<0,'Adress-Modus: die Bezeichnung erscheint NICHT in der Wo-Zeile («'+r.ort+'»)');
    ok(r.ort.indexOf('Bahnhofstrasse 4')>=0,'Adress-Modus: die Adresse steht da');
  } else {
    ok(r.nm==='Neubau Alpha','Bezeichnungs-Modus: epObjName liefert die Bezeichnung');
    ok(r.ort.indexOf('Neubau Alpha')>=0&&r.ort.indexOf('Bahnhofstrasse 4')>=0,'Bezeichnungs-Modus: Bezeichnung + Adresse («'+r.ort+'»)');
  }
  ok(page.errs.length===0,'Termine ohne pageerrors ('+lbl+')'+(page.errs.length?' — '+page.errs[0]:''));
  await ctx.close();
}

/* ── Wareneingang: Projektname folgt der Einstellung + Projekt-Aufstellung ── */
console.log('— Wareneingang: Projektname + Aufstellung pro Lieferung —');
const LIEF={id:'we1',orgId:'org_t',lieferantFirma:'Sanitas Troesch',bestellnummer:'B-4711',
  importDatum:'2026-07-20',bestelldatum:'2026-07-18',status:'teilweise',
  positionen:[
    {id:'p1',sortindex:0,posNr:'1',artikelNr:'A1',bezeichnung:'Waschtisch',menge:4,eingegangenMenge:4,status:'eingegangen',projekt:{objektId:'obj_a',name:'Neubau Alpha',strasse:'Bahnhofstrasse 4',plz:'8000',ort:'Zürich'}},
    {id:'p2',sortindex:1,posNr:'2',artikelNr:'A2',bezeichnung:'Armatur',menge:4,eingegangenMenge:1,status:'teilweise',projekt:{objektId:'obj_a',name:'Neubau Alpha',strasse:'Bahnhofstrasse 4',plz:'8000',ort:'Zürich'}},
    {id:'p3',sortindex:2,posNr:'3',artikelNr:'B1',bezeichnung:'WC',menge:2,eingegangenMenge:0,status:'offen',projekt:{objektId:'obj_b',name:'Umbau Beta',strasse:'Seeweg 2',plz:'6000',ort:'Luzern'}},
    {id:'p4',sortindex:3,posNr:'4',artikelNr:'C1',bezeichnung:'Dichtungen',menge:10,eingegangenMenge:10,status:'eingegangen',projekt:{objektId:'',istLager:true,name:'Lager / kein Projekt',strasse:'',plz:'',ort:''}}
  ]};
{
  seed();
  store.set('wareneingang|we:we1',{data:LIEF,_lm:'2026-07-20T00:00:00Z'});
  const {ctx,page}=await open('/if_wareneingang.html',{
    gema_we_pool_v1:[LIEF],
    gema_users_v1:[Object.assign({},USERS[0],{profile:{email:'a@t.ch',objektAnzeige:'adresse'}})]
  });
  await page.waitForFunction(()=>window._weHooks&&typeof _weHooks.liefProjGruppen==='function',null,{timeout:12000});
  await page.waitForTimeout(1200);
  const g=await page.evaluate(()=>_weHooks.liefProjGruppen(_weHooks.liefById('we1')).map(x=>({n:_weHooks.projName(x.projekt),pos:x.pos,voll:x.voll,soll:x.soll,ist:x.ist,lager:x.lager})));
  ok(g.length===3,'drei Projekt-Gruppen (2 Objekte + Lager)');
  ok(g[0].n===ADR_A,'Adress-Modus schlägt auf den Projekt-Schnappschuss durch («'+g[0].n+'»)');
  ok(g[0].pos===2&&g[0].voll===1,'Gruppe A: 2 Positionen, 1 vollständig geliefert');
  ok(g[0].soll===8&&g[0].ist===5,'Gruppe A: Menge 5 von 8');
  ok(g[1].pos===1&&g[1].voll===0,'Gruppe B: 1 Position, nichts geliefert');
  ok(g[2].lager===true&&g[2].voll===1,'Lager-Gruppe erkannt und vollständig');
  const html=await page.evaluate(()=>_weHooks.liefCardHtml(_weHooks.liefById('we1')));
  ok(html.indexOf('lc-projs')>=0,'die Karte zeigt die Projekt-Aufstellung');
  ok((html.match(/lc-proj"/g)||[]).length===3,'eine Zeile pro Projekt');
  ok(html.indexOf('2 Pos. · 1 geliefert')>=0,'Positionszahl + gelieferte Positionen stehen auf der Karte');
  ok(html.indexOf('Menge 5/8')>=0,'Teilmenge wird ausgewiesen');
  ok(html.indexOf('Neubau Alpha')<0&&html.indexOf('Bahnhofstrasse 4')>=0,'im Adress-Modus steht die Adresse, nicht die Bezeichnung');
  ok(html.indexOf('3 Projekte')>=0,'Kopfzeile nennt die Anzahl Projekte');
  ok(page.errs.length===0,'Wareneingang ohne pageerrors'+(page.errs.length?' — '+page.errs[0]:''));
  await ctx.close();
}
{
  seed();
  store.set('wareneingang|we:we1',{data:LIEF,_lm:'2026-07-20T00:00:00Z'});
  const {ctx,page}=await open('/if_wareneingang.html',{
    gema_we_pool_v1:[LIEF],
    gema_users_v1:[Object.assign({},USERS[0],{profile:{email:'a@t.ch',objektAnzeige:'bezeichnung'}})]
  });
  await page.waitForFunction(()=>window._weHooks&&typeof _weHooks.liefCardHtml==='function',null,{timeout:12000});
  await page.waitForTimeout(1200);
  const html=await page.evaluate(()=>_weHooks.liefCardHtml(_weHooks.liefById('we1')));
  ok(html.indexOf('Neubau Alpha')>=0,'Bezeichnungs-Modus: die Bezeichnung steht auf der Karte');
  const f=await page.evaluate(()=>_weHooks.uniqueProj([_weHooks.liefById('we1')]));
  ok(f.indexOf('Neubau Alpha')>=0,'Projekt-Filter listet die Bezeichnung');
  await ctx.close();
}

console.log('');
console.log(pass+' passed, '+fail+' failed');
await browser.close(); server.close();
process.exit(fail?1:0);
