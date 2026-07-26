// ERP-Positionen: Bild UNTER dem Text + WYSIWYG-Umbrüche (Feedback 26.07.2026:
// «mache die fotos in der offerte und rechnung unter den text, sonst sind es
// enorm viel zeilenumbrüche» + «umbrüche sollten im editor gleich sein wie im
// pdf, sodass man mit Shift+Enter einen Zeilenumbruch machen kann»).
//
// Vorher: Das Positionsbild stand im Editor als Flex-Item NEBEN dem Beschrieb
// und quetschte die Textspalte auf ~140px — der Text brach nach jedem Wort um,
// während er im PDF (94mm) glatt durchlief. Editor und Druck zeigten also
// völlig verschiedene Umbrüche.
//
// Jetzt: Beschrieb-Zelle = PDF-Geometrie (180mm Textbreite − 86mm Zahlen-
// spalten = 94mm, Schrift 9.5pt/1.45, 2×7px Zellpadding), Bild darunter,
// 📷-Knopf in der Quelle-Spalte (kostet weder Text-Breite noch -Höhe).
// Shift+Enter (und Enter) setzen ein sauberes <br>, das Sanitizer, Speichern
// und PDF unverändert überstehen.
//
// Aufruf:  CHROME=<chromium> node scripts/erp_positionsbild_umbrueche_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8897;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/pm_erp.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30*86400000).toISOString();
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig';
// Realer Grosshändler-Langtext (Screenshot des Feedbacks)
const LANG = 'Montagerahmen Mepa SF, 700 x 700 – 1200 x 1200 mm, 13 Füsse, für Duschwannen aus Mineralguss, höhenverstellbar von 60 – 195 mm, Montagerahmen, Schraubfüsse, 1 Rolle Gleitband, 1 Rolle Butyldichtband Aquaproof à 4 m, 1 Rolle Schalldämmstreifen à 4 m, 1 Rolle Fliesentrennstreifen à 4 m, 6 Schalldämmmatten, Befestigungsmaterial';
const IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='110'><rect width='150' height='110' fill='%23e2e8f0'/></svg>";

const browser = await chromium.launch({ executablePath: CHROME });
async function open(){
  const ctx = await browser.newContext({ viewport:{ width:1600, height:1000 } });
  await ctx.route('**/*', route => { const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/')>=0||u.indexOf('/sb/')>=0||u.indexOf('supabase')>=0) return route.fulfill({contentType:'application/json',body:'[]'});
    if (u.indexOf('/api/')>=0||u.indexOf('/.netlify/')>=0) return route.fulfill({contentType:'application/json',body:'{}'});
    return route.abort(); });
  await ctx.addInitScript(s => { for (const [k,v] of Object.entries(s)) localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v)); },
    { gema_orgs_v1:[{id:'org_t',name:'T AG',kategorie:'sanitaerplaner',kategorien:['sanitaerplaner'],admins:['u1'],active:true}],
      gema_users_v1:[{id:'u1',username:'a@t.ch',name:'User A',roleIds:['role_planer'],orgId:'org_t',active:true}],
      gema_session_v1:{token:JWT,userId:'u1',expires:FUTURE},
      gema_coachmarks_done_pm_erp:'1' });
  const page = await ctx.newPage(); page.errs=[]; page.on('pageerror', e=>page.errs.push(e.message));
  await page.goto(BASE+'/pm_erp.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof erpNeu==='function'&&typeof erpRenderPos==='function',null,{timeout:12000});
  await page.waitForTimeout(500);
  return {ctx,page};
}
const MM = 96/25.4;

console.log('— 1) Editor: Beschrieb hat die A4-Textbreite, Bild steht darunter —');
const {ctx,page} = await open();
await page.evaluate(({LANG,IMG})=>{
  erpNeu('offerte');
  cur.positionen=[
    {id:'p1',art:'frei',bez:LANG,menge:1,einheit:'Stk',ep:391,produktId:'ds:1',bildDataUrl:IMG},
    {id:'p2',art:'frei',bez:'Kurz ohne Bild',menge:2,einheit:'Stk',ep:45},
    {id:'p3',art:'frei',bez:'Zeile eins<br>Zeile zwei',menge:1,einheit:'Stk',ep:12}
  ];
  erpRenderPos();
},{LANG,IMG});
await page.waitForTimeout(400);
{
  const g = await page.evaluate(()=>{
    const cell=document.querySelector('#posBody td.bezcell');
    const wrap=cell.querySelector('.bezwrap'), pc=cell.querySelector('.pcell.bezflex'), img=cell.querySelector('.pos-bild');
    const cs=getComputedStyle(pc);
    return { wrapW:wrap.getBoundingClientRect().width,
      contentW:pc.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),
      fs:parseFloat(cs.fontSize), lh:cs.lineHeight,
      imgTop:img.getBoundingClientRect().top, txtBottom:pc.getBoundingClientRect().bottom,
      imgLeft:img.getBoundingClientRect().left, txtLeft:pc.getBoundingClientRect().left,
      fotoInQuelle:!!document.querySelector('#posBody tr:nth-child(2) td:nth-child(3) .pos-foto'),
      fotoInBez:!!document.querySelector('#posBody td.bezcell .pos-foto') };
  });
  ok(Math.abs(g.wrapW-94*MM)<1.5, 'Beschrieb-Spalte = 94mm wie im PDF ('+g.wrapW.toFixed(0)+'px)');
  ok(Math.abs(g.contentW-(94*MM-14))<1.5, 'Textbreite = PDF-Textbreite (94mm − 2×7px Zellpadding)');
  ok(Math.abs(g.fs-9.5*96/72)<0.2, 'Schriftgrösse 9.5pt wie in der PDF-Tabelle');
  ok(parseFloat(g.lh)/g.fs>1.4&&parseFloat(g.lh)/g.fs<1.5, 'Zeilenhöhe 1.45 wie im PDF');
  ok(g.imgTop>=g.txtBottom-1, 'Bild steht UNTER dem Text (nicht mehr daneben)');
  ok(Math.abs(g.imgLeft-g.txtLeft)<8, 'Bild linksbündig zum Text');
  ok(g.fotoInQuelle&&!g.fotoInBez, '📷-Knopf sitzt in der Quelle-Spalte (kostet keine Textbreite/-höhe)');
}

console.log('— 2) Umbrüche Editor == Umbrüche PDF (derselbe Langtext) —');
let pdfPage=null;
{
  const [popup] = await Promise.all([ ctx.waitForEvent('page'), page.evaluate(()=>erpPdf()) ]);
  pdfPage = popup;
  await pdfPage.waitForLoadState('domcontentloaded');
  await pdfPage.waitForTimeout(900);
  const pdfG = await pdfPage.evaluate(()=>{
    const tds=[...document.querySelectorAll('table.pos tbody tr td:nth-child(2)')];
    const td=tds.find(t=>(t.textContent||'').indexOf('Montagerahmen Mepa')>=0);
    if(!td) return null;
    const cs=getComputedStyle(td);
    const r=td.getBoundingClientRect();
    const innen=td.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    return { w:r.width, contentW:td.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),
      fs:parseFloat(cs.fontSize), zeilen:Math.round(innen/parseFloat(cs.lineHeight)),
      html:td.innerHTML };
  });
  ok(!!pdfG, 'PDF-Fenster enthält die Position');
  const edG = await page.evaluate(()=>{
    const pc=document.querySelector('#posBody td.bezcell .pcell.bezflex');
    const cs=getComputedStyle(pc);
    const innen=pc.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    return { contentW:pc.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),
      fs:parseFloat(cs.fontSize), zeilen:Math.round(innen/parseFloat(cs.lineHeight)) };
  });
  ok(Math.abs(pdfG.contentW-edG.contentW)<2, 'gleiche Textbreite in Editor und PDF ('+edG.contentW.toFixed(0)+' vs '+pdfG.contentW.toFixed(0)+'px)');
  ok(Math.abs(pdfG.fs-edG.fs)<0.2, 'gleiche Schriftgrösse in Editor und PDF');
  ok(pdfG.zeilen===edG.zeilen, 'GLEICHE Zeilenzahl → identische Umbrüche (Editor '+edG.zeilen+', PDF '+pdfG.zeilen+')');
  // Bild im PDF: eigene Zeile unter der Position
  const pdfImg = await pdfPage.evaluate(()=>{
    const br=document.querySelector('table.pos tr.bildrow');
    if(!br) return null;
    const prev=br.previousElementSibling;
    return { hatBildzeile:true, vorgaengerHatText:!!prev&&(prev.textContent||'').indexOf('Montagerahmen Mepa')>=0,
      imgUnten:br.querySelector('img')?br.querySelector('img').getBoundingClientRect().top>=prev.getBoundingClientRect().bottom-1:false };
  });
  ok(pdfImg&&pdfImg.hatBildzeile&&pdfImg.vorgaengerHatText, 'PDF: Bild als eigene Zeile direkt unter seiner Position');
  ok(pdfImg&&pdfImg.imgUnten, 'PDF: Bild liegt unterhalb des Beschriebs');
}

console.log('— 3) Shift+Enter: echter Zeilenumbruch, der bis ins PDF durchhält —');
{
  await pdfPage.close();
  // Beschrieb öffnen (Doppelklick) und mit Shift+Enter umbrechen
  await page.evaluate(()=>{ erpCellEdit('p2','bez'); });
  await page.waitForTimeout(250);
  const ed = await page.$('#posBody .rich-ed[data-id="p2"]');
  ok(!!ed, 'Beschrieb-Feld ist im Bearbeiten-Modus offen');
  await ed.click();
  await page.keyboard.press('End');
  await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift');
  await page.keyboard.type('zweite Zeile');
  await page.evaluate(()=>{ var e=document.querySelector('#posBody .rich-ed[data-id="p2"]'); if(e) e.blur(); });
  await page.waitForTimeout(350);
  const gespeichert = await page.evaluate(()=>cur.positionen.find(p=>p.id==='p2').bez);
  ok(/<br>/i.test(gespeichert), 'Shift+Enter speichert ein sauberes <br> ('+gespeichert.replace(/</g,'‹').slice(0,60)+')');
  ok(!/<div|<p[ >]/i.test(gespeichert), '… und KEINE <div>/<p>-Verschachtelung');
  ok(/zweite Zeile/.test(gespeichert), 'Text nach dem Umbruch ist erhalten');
  const zeilenEd = await page.evaluate(()=>{
    const tr=[...document.querySelectorAll('#posBody tr')].find(t=>(t.textContent||'').indexOf('Kurz ohne Bild')>=0);
    const pc=tr.querySelector('.pcell.bezflex'); const cs=getComputedStyle(pc);
    const innen=pc.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    return Math.round(innen/parseFloat(cs.lineHeight));
  });
  ok(zeilenEd===2, 'Editor zeigt den Umbruch als 2 Zeilen');
  const [popup2] = await Promise.all([ ctx.waitForEvent('page'), page.evaluate(()=>erpPdf()) ]);
  await popup2.waitForLoadState('domcontentloaded'); await popup2.waitForTimeout(700);
  const pdfZ = await popup2.evaluate(()=>{
    const tds=[...document.querySelectorAll('table.pos tbody tr td:nth-child(2)')];
    const td=tds.find(t=>(t.textContent||'').indexOf('Kurz ohne Bild')>=0);
    if(!td) return null;
    const cs=getComputedStyle(td);
    const innen=td.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    return { br:/<br>/i.test(td.innerHTML), zeilen:Math.round(innen/parseFloat(cs.lineHeight)) };
  });
  ok(pdfZ&&pdfZ.br, 'PDF enthält den <br>-Umbruch');
  ok(pdfZ&&pdfZ.zeilen===zeilenEd, 'PDF zeigt dieselbe Zeilenzahl wie der Editor ('+pdfZ.zeilen+')');
  await popup2.close();
}

console.log('— 4) Keine Regression an den übrigen Zeilentypen —');
{
  await page.evaluate(()=>{
    cur.positionen=[
      {id:'t1',art:'titel',bkp:'254',bez:'Sanitärapparate'},
      {id:'x1',art:'text',bez:'Freier Beschrieb über die Breite'},
      {id:'p9',art:'frei',bez:'Position',menge:1,einheit:'Stk',ep:10},
      {id:'r1',art:'rabatt',bez:'Schlussrabatt',modus:'pct',wert:5},
      {id:'s1',art:'seitenumbruch'}
    ];
    erpRenderPos();
  });
  await page.waitForTimeout(300);
  const r = await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('#posBody tr')];
    const cols=rows.map(tr=>[...tr.children].reduce((n,td)=>n+(td.colSpan||1),0));
    return { rows:rows.length, cols:cols, titel:!!document.querySelector('#posBody .pcell.bkp'),
      umbruch:(document.querySelector('#posBody').textContent||'').indexOf('Seitenumbruch')>=0 };
  });
  ok(r.rows===5,'alle 5 Zeilentypen gerendert');
  ok(r.cols.every(c=>c===r.cols[0]),'alle Zeilen haben dieselbe Spaltenzahl ('+r.cols.join('/')+')');
  ok(r.titel,'Titelzeile mit BKP-Feld intakt');
  ok(r.umbruch,'Seitenumbruch-Zeile intakt');
  ok(page.errs.length===0,'keine JS-Fehler'+(page.errs.length?' ('+page.errs[0]+')':''));
}

await ctx.close(); await browser.close(); server.close();
console.log('\n'+(fail?('✗ '+fail+' von '+(pass+fail)+' Checks FEHLGESCHLAGEN'):('✅ '+(pass+fail)+'/'+(pass+fail)+' Checks')));
process.exit(fail?1:0);
