// pm_abnahme — das SIA-118-PDF trägt das Firmen-Branding
//
// Feedback 28.07.2026: «das PDF ist gar nicht im Stil wie Schadensbericht,
// Prüfliste etc. — ergänze das mit dem Logo, Brand, den Farben».
// Vorher: nacktes jsPDF, Tabellenköpfe hart auf Blau [29,78,216], kein
// Farbband, keine Laufzeile, keine Seitenzahlen.
//
// Der Test erzeugt das PDF wirklich (jsPDF + autotable lokal gestubbt) und
// prüft die Aufrufe: Farbband, Logo, Abschnitts-Bänder, Tabellenköpfe in
// der Firmenfarbe, Zebra-Tint, Kopf-/Fusszeile mit Seitenzahl. Zusätzlich
// die Kontrastschutz-Regel: eine helle Firmenfarbe (Gelb) darf NIE 1:1 als
// Textfarbe/Fläche unter weisser Schrift landen.
//
// Aufruf:  CHROME=<chromium> node scripts/abnahme_pdf_brand_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8923;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/pm_abnahme.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };

const browser = await chromium.launch({ executablePath: CHROME });

// jsPDF/autotable durch einen Rekorder ersetzen — der Test misst, WAS
// gezeichnet wird, nicht wie die Library rendert.
const STUB = `
window.__pdf = { calls: [], tables: [], pages: 1, page: 1 };
function _rec(n){ return function(){ window.__pdf.calls.push({ n:n, a:[].slice.call(arguments) }); return this; }; }
function FakeDoc(){
  this.internal = { getNumberOfPages: function(){ return window.__pdf.pages; } };
  var self = this;
  ['setFont','setFontSize','text','line','setLineWidth','addImage'].forEach(function(m){ self[m]=_rec(m); });
  this.setFillColor=_rec('setFillColor'); this.setTextColor=_rec('setTextColor'); this.setDrawColor=_rec('setDrawColor');
  this.rect=_rec('rect');
  this.splitTextToSize=function(t){ return String(t==null?'':t).split('\\n'); };
  this.addPage=function(){ window.__pdf.pages++; window.__pdf.calls.push({n:'addPage',a:[]}); return this; };
  this.setPage=function(p){ window.__pdf.page=p; window.__pdf.calls.push({n:'setPage',a:[p]}); return this; };
  this.autoTable=function(o){ window.__pdf.tables.push(o); this.lastAutoTable={finalY:300}; window.__pdf.calls.push({n:'autoTable',a:[o]}); return this; };
  this.output=function(){ return 'blob:fake'; };
  this.save=function(f){ window.__pdf.calls.push({n:'save',a:[f]}); };
  this.lastAutoTable={finalY:300};
}
window.jspdf = { jsPDF: FakeDoc };
window.open = function(){ return { closed:false, document:{ write:function(){} }, set location(v){}, close:function(){} }; };
`;

async function pdfMit(pdfFarben) {
  const ORG = { id: 'org_t', name: 'Muster Haustechnik AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'],
    admins: ['u1'], active: true, strasse: 'Musterweg 4', plz: '4000', ort: 'Basel',
    logoVector: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"><rect width="300" height="100" fill="#123"/></svg>'),
    settings: pdfFarben ? { pdfFarben } : {} };
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
      if (route.request().method() === 'GET') return route.fulfill({ contentType: 'application/json', body: '[]' });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, {
    gema_orgs_v1: JSON.stringify([ORG]), gema_users_v1: JSON.stringify(USERS),
    gema_session_v1: JSON.stringify(SESSION), gema_coachmarks_done_abnahme: '1'
  });
  await ctx.addInitScript(STUB);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  // Etwas Inhalt, damit Mängel-Tabelle + Unterschriften gezeichnet werden
  await page.evaluate(() => {
    const st = window._abState();
    st.abnahme.bauobjekt = 'Neubau Sonnhalde';
    st.abnahme.arbeitsgattung = 'BKP 250 Sanitäranlagen';
    st.items = [window._abCreateItem({ ort: 'WC', mangel: 'Dichtung fehlt' })];
    st.abnahme.instwandChk = { masse: 'io', schall: 'nio' };
    window._abRender();
  });
  await page.evaluate(() => document.getElementById('exportPdfBtn2').click());
  await page.waitForTimeout(1800);
  const out = await page.evaluate(() => window.__pdf);
  await ctx.close();
  return { out, errs };
}

console.log('— Ohne Firmenfarben: GEMA-Default —');
let { out, errs } = await pdfMit(null);
ok(errs.length === 0, 'PDF-Erzeugung ohne pageerror (' + errs.slice(0, 2).join(' | ') + ')');
ok(out.calls.length > 40, 'PDF wurde wirklich gezeichnet (' + out.calls.length + ' Aufrufe)');

const fills = out.calls.filter(c => c.n === 'setFillColor').map(c => c.a.join(','));
const rects = out.calls.filter(c => c.n === 'rect');
ok(rects.some(r => r.a[1] === 0 && r.a[3] === 9), 'Farbband am Kopf des Deckblatts');
ok(fills.length > 10, 'Farbband ist ein Verlauf (viele Farbschritte: ' + fills.length + ')');
ok(out.calls.some(c => c.n === 'addImage' && String(c.a[1]) === 'JPEG' && c.a[2] > 400), 'Firmenlogo oben rechts eingebettet');

const texte = out.calls.filter(c => c.n === 'text').map(c => String(c.a[0])).join(' | ');
ok(/MUSTER HAUSTECHNIK AG/.test(texte), 'Firmenname als Eyebrow über dem Titel');
ok(/PRÜFUNGS-PROTOKOLL/.test(texte), 'Abschnitts-Band «Prüfungs-Protokoll»');
ok(/MÄNGEL- & PENDENZENLISTE/.test(texte), 'Abschnitts-Band «Mängel- & Pendenzenliste»');
ok(/UNTERSCHRIFTEN/.test(texte), 'Abschnitts-Band «Unterschriften»');
ok(/Fortschritt: 0 \/ 1 erledigt \(0 %\)/.test(texte), 'Fortschritts-Kachel mit Prozentwert');
ok(/Seite 1 \/ /.test(texte), 'Fusszeile mit Seitenzahl');
ok(/Muster Haustechnik AG · Musterweg 4, 4000 Basel/.test(texte), 'Fusszeile nennt Firma + Adresse');
ok(out.calls.filter(c => c.n === 'setPage').length >= 2, 'Kopf-/Fusszeile wird auf JEDE Seite gezogen');

ok(out.tables.length >= 2, 'Checklisten- UND Mängel-Tabelle gezeichnet (' + out.tables.length + ')');
ok(out.tables.every(t => t.alternateRowStyles && t.alternateRowStyles.fillColor), 'jede Tabelle hat einen Zebra-Tint');
ok(out.tables.every(t => !(t.headStyles.fillColor[0] === 29 && t.headStyles.fillColor[1] === 78 && t.headStyles.fillColor[2] === 216)),
   'kein hart codiertes Blau [29,78,216] mehr in den Tabellenköpfen');

console.log('— Mit Firmenfarben: Marke schlägt durch —');
({ out, errs } = await pdfMit({ primary: '#7c3aed', secondary: '#0891b2' }));
ok(errs.length === 0, 'PDF mit Branding ohne pageerror');
const kopf = out.tables[0].headStyles.fillColor;
ok(kopf[0] === 124 && kopf[1] === 58 && kopf[2] === 237, 'Tabellenkopf trägt die Firmen-Primärfarbe (' + kopf.join(',') + ')');
const zebra = out.tables[0].alternateRowStyles.fillColor;
ok(zebra[0] > 230 && zebra[1] > 225 && zebra[2] > 245, 'Zebra ist ein heller Ton DERSELBEN Farbe (' + zebra.join(',') + ')');
const bandFills = out.calls.filter(c => c.n === 'setFillColor').map(c => c.a.join(','));
ok(bandFills.indexOf('124,58,237') >= 0, 'Abschnitts-Bänder in der Firmenfarbe');
ok(bandFills.some(f => /^8,145,178/.test(f)) || bandFills.some(f => f.split(',').map(Number)[2] > 150),
   'Sekundärfarbe fliesst als Verlauf-Ende ins Farbband');

console.log('— Kontrastschutz: helle Marke wird nie 1:1 verwendet —');
({ out, errs } = await pdfMit({ primary: '#f5c518' }));   // helles Gelb
const gelbKopf = out.tables[0].headStyles.fillColor;
ok(!(gelbKopf[0] === 245 && gelbKopf[1] === 197 && gelbKopf[2] === 24), 'helles Gelb landet NICHT roh im Tabellenkopf');
const lum = 0.2126 * Math.pow(gelbKopf[0] / 255, 2.2) + 0.7152 * Math.pow(gelbKopf[1] / 255, 2.2) + 0.0722 * Math.pow(gelbKopf[2] / 255, 2.2);
ok(1.05 / (lum + 0.05) >= 4.0, 'abgedunkelte Marke ist gegen Weiss lesbar (Kontrast ' + (1.05 / (lum + 0.05)).toFixed(1) + ':1)');
ok(gelbKopf[0] > gelbKopf[2], 'der Farbton (Gold) bleibt erhalten');

console.log('— Statische Absicherung —');
const src = await readFile(join(ROOT, 'pm_abnahme.html'), 'utf8');
ok(/function _abBrand/.test(src), '_abBrand liest org.settings.pdfFarben');
ok(/function _abCoverBar/.test(src) && /function _abBand/.test(src), 'Farbband + Abschnitts-Bänder als Helfer');
ok(/function _abKopfFuss/.test(src), 'Kopf-/Fusszeile als Helfer');
ok(!/fillColor:\[29,78,216\]/.test(src), 'kein hart codiertes Blau mehr im Quelltext');

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
