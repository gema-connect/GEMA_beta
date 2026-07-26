// Objekt bearbeiten + «✓ Fertig stellen» darf NICHTS still ändern (Feedback
// 26.07.2026: «plötzlich ist der gesetzte Projektleiter nicht mehr drin»).
// Bug-Klasse: konnte ein Select den gespeicherten Wert nicht darstellen
// (Projektleiter aus der Org des Objekts statt der des Bearbeiters — typisch
// Admin bearbeitet fremde Org —, deaktivierter User, Userliste noch nicht
// geladen, gefiltertes/fehlendes Oberprojekt), fiel es still auf «— Keiner —»
// und saveObjekt schrieb leer. Zwei Schichten im Fix:
//   1) UI: populateTeamSelects nutzt die User der OBJEKT-Org + ergänzt für
//      nicht darstellbare Werte eine ⚠-Option (sichtbar + bewusst abwählbar,
//      Muster sys_admin-Rollen); Team-Chips zeigen fremde/deaktivierte
//      Mitglieder als ⚠-Chip; populateParentSelect ergänzt das gespeicherte
//      Oberprojekt.
//   2) Save-Guard _objSelKeep: liefert ein Select leer, obwohl ein Wert
//      gespeichert ist UND dessen Option nicht existiert, bleibt der Wert.
// Bewusstes Leeren («— Keiner —» wählen) muss weiterhin durchgehen.
//
// Aufruf:  CHROME=<chromium> node scripts/objekt_edit_erhalt_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8893;
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

// ── PostgREST-Row-Mock (Muster objekt_anzeige_test) ──
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

// ── Seed-Daten ──
const OBJ_PARENT={id:'obj_parent',name:'Überbauung Sonnenhalde',strasse:'Sonnenweg 1',plz:'4600',ort:'Olten',orgId:'org_t',status:'aktiv'};
const OBJ_EDIT={id:'obj_edit',name:'Haus A',strasse:'Sonnenweg 3',plz:'4600',ort:'Olten',orgId:'org_t',status:'aktiv',
  bauvorhaben:'Umbau',aktivePhase:'bauprojekt',parentObjektId:'obj_parent',
  projektLeiterId:'u_pl',abteilungsLeiterId:'u_alt',teamUserIds:['u_pl','u_alt'],
  beteiligte:[{rolle:'architekt',firma:'Arch AG',person:'X. Muster',email:'x@arch.ch'}]};
const OBJ_FREMD={id:'obj_fremd',name:'Kunde Fremdbau',strasse:'Weg 9',plz:'3000',ort:'Bern',orgId:'org_x',status:'aktiv',projektLeiterId:'u_x'};
const OBJ_GHOST={id:'obj_ghost',name:'Altbestand',orgId:'org_t',status:'aktiv',projektLeiterId:'u_weg',parentObjektId:'obj_missing'};
const ALLE=[OBJ_PARENT,OBJ_EDIT,OBJ_FREMD,OBJ_GHOST];
function seed(){ store.clear(); ALLE.forEach(o=>store.set('objekte|objekt:'+o.id,{data:o,_lm:'2026-07-01T00:00:00Z'})); }

const FUTURE=new Date(Date.now()+30*86400000).toISOString();
const JWT='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig';
const ORGS=[{id:'org_t',name:'T AG',kategorie:'sanitaerplaner',kategorien:['sanitaerplaner'],admins:['u1'],active:true},
  {id:'org_x',name:'X GmbH',kategorie:'sanitaerplaner',kategorien:['sanitaerplaner'],admins:['u_x'],active:true}];
const USERS=[
  {id:'u1',username:'a@t.ch',name:'Admin A',roleIds:['role_admin'],orgId:'org_t',active:true,profile:{email:'a@t.ch'}},
  {id:'u_pl',username:'p@t.ch',name:'Petra PL',roleIds:['role_planer'],orgId:'org_t',active:true,profile:{email:'p@t.ch'}},
  {id:'u_alt',username:'alt@t.ch',name:'Alt AL',roleIds:['role_planer'],orgId:'org_t',active:false,profile:{email:'alt@t.ch'}},
  {id:'u_x',username:'x@x.ch',name:'Xaver Fremd',roleIds:['role_planer'],orgId:'org_x',active:true,profile:{email:'x@x.ch'}}
];
const OBJ_BLOB={objekte:ALLE,beteiligte:[],activeObjektId:null};

const browser=await chromium.launch({executablePath:CHROME});
async function open(){
  const ctx=await browser.newContext();
  await ctx.route('**/*',route=>{ const u=route.request().url();
    if(u.startsWith(BASE))return route.continue();
    if(u.indexOf('/rest/v1/')>=0||u.indexOf('/sb/')>=0||u.indexOf('supabase')>=0)return handleSb(route);
    if(u.indexOf('/api/')>=0||u.indexOf('/.netlify/')>=0)return route.fulfill({contentType:'application/json',body:'{}'});
    return route.abort(); });
  await ctx.addInitScript(s=>{ for(const [k,v] of Object.entries(s)) localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v)); },
    {gema_orgs_v1:ORGS,gema_users_v1:USERS,gema_session_v1:{token:JWT,userId:'u1',expires:FUTURE},gema_objekte_v1:OBJ_BLOB,gema_objpool_v1:ALLE,
     gema_coachmarks_done_pm_objekte:'1'});   // Tour-Backdrop fängt sonst alle Klicks ab
  const page=await ctx.newPage(); page.errs=[]; page.on('pageerror',e=>page.errs.push(e.message));
  await page.goto(BASE+'/pm_objekte.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof openObjektModal==='function',null,{timeout:12000});
  await page.waitForTimeout(1100);
  return {ctx,page};
}
const blobObj=(page,id)=>page.evaluate(i=>{ const b=JSON.parse(localStorage.getItem('gema_objekte_v1')||'{}'); return (b.objekte||[]).find(x=>x.id===i)||null; },id);

console.log('— 1) Bearbeiten + «Fertig stellen» erhält Team/Parent/Phase/Beteiligte —');
{
  seed(); const {ctx,page}=await open();
  await page.evaluate(()=>openObjektModal('obj_edit'));
  const sel=await page.evaluate(()=>({
    pl:document.getElementById('objProjektLeiterId').value,
    al:document.getElementById('objAbteilungsLeiterId').value,
    alWarn:(function(){const s=document.getElementById('objAbteilungsLeiterId');const o=s.options[s.selectedIndex];return o?o.textContent:'';})(),
    parent:document.getElementById('objParentId').value,
    chipWarn:!!document.querySelector('#objTeamChips [data-uid="u_alt"]')
  }));
  ok(sel.pl==='u_pl','PL-Select zeigt die gespeicherte Person (u_pl)');
  ok(sel.al==='u_alt','AL-Select hält den DEAKTIVIERTEN User (u_alt)');
  ok(sel.alWarn.indexOf('⚠')>=0,'… als ⚠-Option (sichtbar statt still verloren)');
  ok(sel.parent==='obj_parent','Oberprojekt vorausgewählt');
  ok(sel.chipWarn,'Team-Chip des deaktivierten Mitglieds sichtbar (⚠)');
  await page.evaluate(()=>{ document.getElementById('objName').value='Haus A — umbenannt'; });
  await page.click('#objWzDone');   // «✓ Fertig stellen» ab Schritt 1
  await page.waitForTimeout(500);
  const o=await blobObj(page,'obj_edit');
  ok(o&&o.name==='Haus A — umbenannt','Name-Änderung gespeichert');
  ok(o.projektLeiterId==='u_pl','Projektleiter BLEIBT (Kern des Feedbacks)');
  ok(o.abteilungsLeiterId==='u_alt','Abteilungsleiter (deaktiviert) bleibt');
  ok((o.teamUserIds||[]).indexOf('u_pl')>=0&&(o.teamUserIds||[]).indexOf('u_alt')>=0,'Team-Mitglieder bleiben');
  ok(o.parentObjektId==='obj_parent','Oberprojekt bleibt');
  ok(o.aktivePhase==='bauprojekt'&&o.bauvorhaben==='Umbau'&&o.status==='aktiv','Phase/Bauvorhaben/Status bleiben');
  ok(o.beteiligte&&o.beteiligte[0]&&o.beteiligte[0].email==='x@arch.ch','Beteiligten-Zusatzfeld (email) übersteht den Roundtrip');
  const cloud=store.get('objekte|objekt:obj_edit');
  const cd=cloud&&(cloud.data||cloud);
  ok(cd&&cd.projektLeiterId==='u_pl','Cloud-Row trägt den Projektleiter weiterhin');

  // Bewusstes Leeren muss weiterhin durchgehen (Guard macht Werte nicht sticky)
  await page.evaluate(()=>openObjektModal('obj_edit'));
  await page.evaluate(()=>{ document.getElementById('objProjektLeiterId').value=''; document.getElementById('objParentId').value=''; _objWzFinish(); });
  await page.waitForTimeout(300);
  const o2=await blobObj(page,'obj_edit');
  ok(o2.projektLeiterId===''&&o2.parentObjektId==='','Bewusst «— Keiner —» gewählt → wird gespeichert');
  ok(page.errs.length===0,'keine JS-Fehler'+(page.errs.length?' ('+page.errs[0]+')':''));
  await ctx.close();
}

console.log('— 2) Admin bearbeitet Objekt einer FREMDEN Org (Ursprungs-Szenario) —');
{
  seed(); const {ctx,page}=await open();
  await page.evaluate(()=>openObjektModal('obj_fremd'));
  const sel=await page.evaluate(()=>({
    pl:document.getElementById('objProjektLeiterId').value,
    hatFremdUser:Array.from(document.getElementById('objProjektLeiterId').options).some(o=>o.textContent.indexOf('Xaver Fremd')>=0)
  }));
  ok(sel.pl==='u_x','PL der Fremd-Org ist vorausgewählt');
  ok(sel.hatFremdUser,'Dropdown listet die User der OBJEKT-Org (nicht der Admin-Org)');
  await page.evaluate(()=>_objWzFinish());
  await page.waitForTimeout(300);
  const o=await blobObj(page,'obj_fremd');
  ok(o&&o.projektLeiterId==='u_x','Fremd-Org-Projektleiter bleibt nach «Fertig stellen»');
  ok(o.orgId==='org_x','orgId des Objekts unangetastet');
  await ctx.close();
}

console.log('— 3) Nicht mehr auflösbare Referenzen (gelöschter User / fehlendes Oberprojekt) —');
{
  seed(); const {ctx,page}=await open();
  await page.evaluate(()=>openObjektModal('obj_ghost'));
  const sel=await page.evaluate(()=>({
    pl:document.getElementById('objProjektLeiterId').value,
    plTxt:(function(){const s=document.getElementById('objProjektLeiterId');const o=s.options[s.selectedIndex];return o?o.textContent:'';})(),
    parent:document.getElementById('objParentId').value
  }));
  ok(sel.pl==='u_weg','PL-Wert ohne User-Record bleibt darstellbar');
  ok(sel.plTxt.indexOf('⚠')>=0,'… als ⚠-Option markiert');
  ok(sel.parent==='obj_missing','fehlendes Oberprojekt bleibt darstellbar (⚠-Option)');
  await page.evaluate(()=>_objWzFinish());
  await page.waitForTimeout(300);
  const o=await blobObj(page,'obj_ghost');
  ok(o.projektLeiterId==='u_weg'&&o.parentObjektId==='obj_missing','beide Referenzen überleben das Speichern');
  await ctx.close();
}

console.log('— 4) Neues Objekt: Defaults unverändert (PL = ich, kein Oberprojekt) —');
{
  seed(); const {ctx,page}=await open();
  await page.evaluate(()=>openObjektModal());
  const sel=await page.evaluate(()=>({
    pl:document.getElementById('objProjektLeiterId').value,
    parent:document.getElementById('objParentId').value
  }));
  ok(sel.pl==='u1','Erfassen: Projektleiter = eingeloggter User (Default 23.07.)');
  ok(sel.parent==='','Erfassen: Oberprojekt «Kein»');
  ok(page.errs.length===0,'keine JS-Fehler');
  await ctx.close();
}

await browser.close(); server.close();
console.log('\n'+(fail?('✗ '+fail+' von '+(pass+fail)+' Checks FEHLGESCHLAGEN'):('✅ '+(pass+fail)+'/'+(pass+fail)+' Checks')));
process.exit(fail?1:0);
