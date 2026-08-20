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
  // Nur grob — reicht, damit Wort-Trennung und Label-Messung wirklich laufen
  this.getTextWidth=function(t){ return String(t==null?'':t).length*4.6; };
  this.getFontSize=function(){ return 10; };
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

const rects = out.calls.filter(c => c.n === 'rect');
// Feedback 03.08.2026: KEIN Verlaufsbalken mehr auf dem Deckblatt.
ok(!rects.some(r => r.a[1] === 0 && r.a[3] === 9), 'kein Primär→Sekundär-Farbband mehr am Kopf');
ok(out.calls.some(c => c.n === 'addImage' && String(c.a[1]) === 'JPEG' && c.a[2] > 400), 'Firmenlogo oben rechts eingebettet');

const texte = out.calls.filter(c => c.n === 'text').map(c => String(c.a[0])).join(' | ');
// Darstellungsvorschlag 20.08.2026: grosser Titel + Norm-Zeile, KEIN
// Versalien-Eyebrow mit dem Firmennamen mehr (die Firma steht im Logo,
// in der Laufzeile und in der Fusszeile).
ok(!/MUSTER HAUSTECHNIK AG/.test(texte), 'kein Versalien-Eyebrow mit dem Firmennamen mehr');
ok(/Norm SIA 118/.test(texte), 'Norm-Zeile unter dem Titel');
// Abschnitts-Titel: Klartext statt Versalien im gefüllten Band
ok(/Prüfungs-Protokoll/.test(texte) && !/PRÜFUNGS-PROTOKOLL/.test(texte), 'Abschnitts-Titel «Prüfungs-Protokoll» als Text, nicht als Band');
ok(/Projekt- und Vertragsangaben/.test(texte), 'Abschnitts-Titel «Projekt- und Vertragsangaben»');
ok(/Bestätigung \/ Unterschriften/.test(texte), 'Abschnitts-Titel «Bestätigung / Unterschriften»');
ok(/Mängel- & Pendenzenliste/.test(texte), 'Abschnitts-Titel «Mängel- & Pendenzenliste»');
ok(!/UNTERSCHRIFTEN/.test(texte), 'kein Unterschriften-Band mehr (Spalten auf Seite 1)');
ok(/Fortschritt: 0 \/ 1 erledigt \(0 %\)/.test(texte), 'Fortschritts-Kachel mit Prozentwert');
ok(/Seite 1 \/ /.test(texte), 'Fusszeile mit Seitenzahl');
ok(/Muster Haustechnik AG {2}\| {2}.*\(SIA 118\)/.test(texte), 'Fusszeile benennt Firma + Dokument');
// BEWUSST invertiert (Darstellungsvorschlag 20.08.2026): die Fusszeile trägt
// nur noch Firma | Dokument links und die Seitenzahl rechts. Die frühere
// mittige Adresse kollidierte mit der langen linken Hälfte und steht ohnehin
// vollständig oben in den Vertragsangaben.
ok(!/Musterweg 4, 4000 Basel/.test(texte), 'Fusszeile ohne mittige Adresse (Vorschlag 20.08.2026)');
ok(out.calls.filter(c => c.n === 'setPage').length >= 2, 'Kopf-/Fusszeile wird auf JEDE Seite gezogen');

ok(out.tables.length >= 2, 'Checklisten- UND Mängel-Tabelle gezeichnet (' + out.tables.length + ')');
ok(out.tables.every(t => !t.alternateRowStyles), 'kein Zebra mehr — die Tabellen folgen dem gedruckten Formular');
ok(out.tables.every(t => !(t.headStyles.fillColor && t.headStyles.fillColor[0] === 29 && t.headStyles.fillColor[1] === 78 && t.headStyles.fillColor[2] === 216)),
   'kein hart codiertes Blau [29,78,216] mehr in den Tabellenköpfen');

console.log('— Anordnung wie der Darstellungsvorschlag —');
// Unterschriften auf Seite 1: vier ZENTRIERTE Spalten, VOR dem ersten addPage
const bisSeite2 = out.calls.slice(0, out.calls.findIndex(c => c.n === 'addPage') + 1 || out.calls.length);
const sigTxt = bisSeite2.filter(c => c.n === 'text').map(c => String(c.a[0]));
const SIG_LBL = ['Unternehmer', 'Bauherr', 'Bauleitung', 'Fachbauleitung'];
SIG_LBL.forEach(l => ok(sigTxt.indexOf(l) >= 0, 'Unterschriften-Spalte «' + l + '» auf Seite 1'));
ok(!/Der Unternehmer|Die Bauleitung|Die Fachbauleitung/.test(texte),
   'Rollen ohne «Der/Die» (Vorschlag — der Artikel liess die Spalte umbrechen)');
// «Bauherr»/«Bauleitung»/«Unternehmer» stehen zusätzlich als Tabellen-Label
// in den Vertragsangaben — die Unterschriften-Spalten erkennt man an der
// Zentrierung (a[3].align), nicht am Text.
const sigCalls = bisSeite2.filter(c => c.n === 'text' && SIG_LBL.indexOf(String(c.a[0])) >= 0 && c.a[3] && c.a[3].align === 'center');
const sigX = sigCalls.map(c => c.a[1]);
ok(new Set(sigX).size === 4 && Math.max(...sigX) > 400, 'die vier Unterschriften stehen NEBENEINANDER (x: ' + sigX.join(', ') + ')');
ok(sigCalls.length === 4, 'die Spalten sind zentriert (Vorschlag)');
ok(sigTxt.indexOf('Ort, Datum:') >= 0, 'Ort/Datum steht über den Unterschriften');
/* Angaben als TABELLE (Vorschlag «Mehr Abstand / Darstellung anpassen»):
   Label fett in der linken Spalte OHNE Doppelpunkt, Wert an fester
   x-Position, jede Zeile mit Trennlinie darunter. */
const lblX = bisSeite2.filter(c => c.n === 'text' && !c.a[3] && /^(Bauobjekt|Bauherr|Bauleitung|Unternehmer|Arbeitsgattung|Vertrag vom)$/.test(String(c.a[0])));
ok(lblX.length >= 6 && new Set(lblX.map(c => c.a[1])).size === 1, 'Angaben als Label-Spalte (sauber untereinander)');
ok(!/Bauobjekt:|Arbeitsgattung:/.test(texte), 'Tabellen-Labels tragen keinen Doppelpunkt mehr');
const trennL = bisSeite2.filter(c => c.n === 'line' && c.a[0] === 40 && c.a[2] === 555 && c.a[1] === c.a[3]);
ok(trennL.length >= 8, 'jede Angaben-Zeile hat eine Trennlinie (' + trennL.length + ')');
// Ankreuzzeile statt rohem Schlüsselwort — jetzt IN der Tabellenzeile «Ergebnis»
ok(/\| Ergebnis \|/.test('| ' + texte + ' |') && /unwesentliche Mängel/.test(texte), 'Ergebnis als eigene Tabellenzeile mit Ankreuzkästchen');
ok(bisSeite2.some(c => c.n === 'rect' && c.a[2] === 9 && c.a[3] === 9), 'die Kästchen werden gezeichnet (jsPDF-Fonts sind latin1)');
ok(!/Ergebnis: *unwesentliche/.test(texte), 'kein rohes «Ergebnis: unwesentliche» mehr');
// Checkliste auf EIGENER Seite: zwischen Unterschriften und Checklisten-Tabelle liegt ein addPage
const iSig = out.calls.findIndex(c => c.n === 'text' && String(c.a[0]) === 'Unternehmer');
const iChk = out.calls.findIndex(c => c.n === 'text' && /^Checkliste zur Kontrolle/.test(String(c.a[0])));
ok(iSig >= 0 && iChk > iSig, 'Checkliste kommt NACH den Unterschriften');
ok(out.calls.slice(iSig, iChk).some(c => c.n === 'addPage'), 'Checkliste steht auf einer eigenen Seite');
ok(/Legende Checkliste/.test(texte), 'Legende als eigener Block «Legende Checkliste»');
// Kleines Foto in der Mängelzeile (Feedback 03.08.2026)
const mTab = out.tables[out.tables.length - 1];
ok(mTab.head[0].indexOf('Foto') >= 0, 'Mängelliste hat eine Foto-Spalte');
// Die Callbacks überleben die JSON-Serialisierung aus dem Browser nicht —
// sie werden weiter unten statisch am Quelltext geprüft.
ok(mTab.body[0].length === mTab.head[0].length, 'Kopf und Zeilen haben gleich viele Spalten');
ok(Object.keys(mTab.columnStyles).reduce((s, k) => s + mTab.columnStyles[k].cellWidth, 0) <= 515,
   'Spaltenbreiten passen in die Textbreite');
const chkTab = out.tables[0];
ok(chkTab.head[0][0] === '' && chkTab.body[0][0] === '•', 'Checkliste: Aufzählungspunkt in eigener Spalte (Hängeeinzug)');

console.log('— Mit Firmenfarben: Marke schlägt durch —');
({ out, errs } = await pdfMit({ primary: '#7c3aed', secondary: '#0891b2' }));
ok(errs.length === 0, 'PDF mit Branding ohne pageerror');
// Titel tragen die Primärfarbe (setTextColor vor dem Abschnitts-Titel)
const txtFarben = out.calls.filter(c => c.n === 'setTextColor').map(c => c.a.join(','));
ok(txtFarben.indexOf('124,58,237') >= 0, 'Abschnitts-Titel in der Firmen-Primärfarbe');
// Die Sekundärfarbe darf NIRGENDS mehr auftauchen (weder als Fläche noch als Text)
const alleFarben = out.calls.filter(c => /^set(Fill|Text|Draw)Color$/.test(c.n)).map(c => c.a.join(','));
ok(alleFarben.indexOf('8,145,178') < 0, 'Sekundärfarbe wird gar nicht mehr verwendet (kein Fade)');
const mkopf = out.tables[out.tables.length - 1].headStyles;
ok(mkopf.textColor && mkopf.textColor[0] === 124, 'Tabellenkopf: Text in der Primärfarbe');
ok(mkopf.fillColor && mkopf.fillColor[0] > 230, 'Tabellenkopf: nur ein heller Ton als Fläche (' + mkopf.fillColor.join(',') + ')');

console.log('— Kontrastschutz: helle Marke wird nie 1:1 verwendet —');
({ out, errs } = await pdfMit({ primary: '#f5c518' }));   // helles Gelb
const gelbKopf = out.tables[out.tables.length - 1].headStyles.textColor;
ok(!(gelbKopf[0] === 245 && gelbKopf[1] === 197 && gelbKopf[2] === 24), 'helles Gelb landet NICHT roh als Textfarbe');
const lum = 0.2126 * Math.pow(gelbKopf[0] / 255, 2.2) + 0.7152 * Math.pow(gelbKopf[1] / 255, 2.2) + 0.0722 * Math.pow(gelbKopf[2] / 255, 2.2);
ok(1.05 / (lum + 0.05) >= 4.0, 'abgedunkelte Marke ist gegen Weiss lesbar (Kontrast ' + (1.05 / (lum + 0.05)).toFixed(1) + ':1)');
ok(gelbKopf[0] > gelbKopf[2], 'der Farbton (Gold) bleibt erhalten');

console.log('— Statische Absicherung —');
const src = await readFile(join(ROOT, 'pm_abnahme.html'), 'utf8');
ok(/function _abBrand/.test(src), '_abBrand liest org.settings.pdfFarben');
ok(/function _abBand/.test(src) && !/function _abCoverBar/.test(src), 'Abschnitts-Titel als Helfer, Verlaufsbalken entfernt');
ok(!/pf\.secondary/.test(src), 'die Sekundärfarbe wird nicht mehr ausgewertet');
ok(/function _abKopfFuss/.test(src), 'Kopf-/Fusszeile als Helfer');
ok(/function _abMetaZeile/.test(src), 'Label/Wert-Raster als Helfer');
ok(/function _abTabZeile/.test(src) && /function _abTitelBand/.test(src), 'Angaben-Tabelle + Sektions-Titel der Titelseite als Helfer');
ok(/function _nurFirma/.test(src) && /function _abTrenn/.test(src), 'Firmenname-Kürzung + Wort-Trennung als Helfer');
ok(/function _abBox/.test(src) && /latin1/.test(src), 'Ankreuzkästchen werden GEZEICHNET (jsPDF-Fonts sind latin1)');
ok(/function _abThumb/.test(src) && /function _abFotoDataUrl/.test(src), 'Vorschaubild + EINE Foto-Auflösungskette als Helfer');
ok(/didDrawCell:d=>\{[\s\S]{0,400}addImage/.test(src), 'das Vorschaubild wird in die Foto-Zelle gezeichnet');
ok(/didParseCell:d=>\{[\s\S]{0,200}minCellHeight/.test(src), 'die Zeilenhöhe wird VOR der Berechnung reserviert');
ok(/_abThumb\(src,AB_THUMB\*3\)/.test(src), 'das Foto wird für die Zelle verkleinert (kein Vollbild im PDF)');
ok(!/fillColor:\[29,78,216\]/.test(src), 'kein hart codiertes Blau mehr im Quelltext');

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
