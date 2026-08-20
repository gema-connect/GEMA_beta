// Feedback 20.08.2026 (Marc Dischler, Schmutz + Partner AG) — SIA-118-PDF
//
// Der Kunde hat den bestehenden PDF-Export annotiert (7 Kommentare) und einen
// Darstellungsvorschlag für die TITELSEITE mitgeliefert. Dieser Drift-Guard
// hält beides fest:
//
//   1  «Sauber darstellen»                (Logo oben rechts, nie verzerrt)
//   2  «Mehr Abstand / Darstellung anpassen» (Angaben als Tabelle mit Luft)
//   3  «Bitte Satz richtig schreiben»     (SIA-158/161-Zusatz als Norm-REGEL)
//   4  «Nur Unternehmername nicht gesamte Adresse»  (Mängelliste + Unterschr.)
//   5  «Trennung machen»                  («Technikzentrale» bricht mit «-»)
//   6  «Benennung löschen»                (kein «Foto 1: image.jpg» mehr)
//   7  «Auf nächste Seite / bzw. zwei Fotos pro Seite»
//
// Dazu der Titelseiten-Aufbau des Vorschlags: Serif-Titel + «Norm SIA 118»,
// Datum unter dem Logo, Sektionen «Projekt- und Vertragsangaben» /
// «Prüfungs-Protokoll» / «Bemerkungen» / «Entscheid» / «Garantie» /
// «Bestätigung / Unterschriften» mit vier ZENTRIERTEN Spalten.
//
// Das PDF wird wirklich erzeugt (jsPDF + autotable gestubbt) — der Test misst
// die Zeichen-Aufrufe, nicht wie die Library rendert.
//
// Aufruf:  CHROME=<chromium> node scripts/feedback_20260820_2_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8941;
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
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'Marc Dischler', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };

// Ein HOHES Logo (1:3) — damit die Proportions-Prüfung etwas zu prüfen hat.
const LOGO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300" viewBox="0 0 100 300"><rect width="100" height="300" fill="#3f5d2e"/></svg>');
const ORG = { id: 'org_t', name: 'Schmutz + Partner AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'],
  admins: ['u1'], active: true, strasse: 'Dornacherstrasse 210', plz: '4053', ort: 'Basel',
  logoVector: LOGO, settings: { pdfFarben: { primary: '#4c7a2f' } } };

const browser = await chromium.launch({ executablePath: CHROME });

const STUB = `
window.__pdf = { calls: [], tables: [], pages: 1, page: 1 };
function _rec(n){ return function(){ window.__pdf.calls.push({ n:n, a:[].slice.call(arguments), p:window.__pdf.pages }); return this; }; }
function FakeDoc(){
  this.internal = { getNumberOfPages: function(){ return window.__pdf.pages; } };
  var self = this;
  ['setFont','setFontSize','text','line','setLineWidth','addImage'].forEach(function(m){ self[m]=_rec(m); });
  this.setFillColor=_rec('setFillColor'); this.setTextColor=_rec('setTextColor'); this.setDrawColor=_rec('setDrawColor');
  this.rect=_rec('rect');
  // Grobe, aber ECHTE Breitenmessung — sonst liefe die Wort-Trennung nie.
  this.__fs = 10;
  this.getFontSize=function(){ return this.__fs; };
  this.setFontSize=function(s){ this.__fs=s; window.__pdf.calls.push({n:'setFontSize',a:[s],p:window.__pdf.pages}); return this; };
  this.getTextWidth=function(t){ return String(t==null?'':t).length*this.__fs*0.5; };
  this.splitTextToSize=function(t,w){
    var self2=this, out=[];
    String(t==null?'':t).split('\\n').forEach(function(zeile){
      var rest='', worte=zeile.split(' ');
      worte.forEach(function(wo){
        var probe = rest ? rest+' '+wo : wo;
        if(self2.getTextWidth(probe) > w && rest){ out.push(rest); rest=wo; } else rest=probe;
      });
      out.push(rest);
    });
    return out;
  };
  this.addPage=function(){ window.__pdf.pages++; window.__pdf.calls.push({n:'addPage',a:[],p:window.__pdf.pages}); return this; };
  this.setPage=function(p){ window.__pdf.page=p; window.__pdf.calls.push({n:'setPage',a:[p],p:p}); return this; };
  this.autoTable=function(o){ window.__pdf.tables.push(o); this.lastAutoTable={finalY:300}; window.__pdf.calls.push({n:'autoTable',a:[o],p:window.__pdf.pages}); return this; };
  this.output=function(){ return 'blob:fake'; };
  this.save=function(f){ window.__pdf.calls.push({n:'save',a:[f],p:window.__pdf.pages}); };
  this.lastAutoTable={finalY:300};
}
window.jspdf = { jsPDF: FakeDoc };
window.open = function(){ return { closed:false, document:{ write:function(){} }, set location(v){}, close:function(){} }; };
`;

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
await page.waitForTimeout(1800);

// Die Daten des annotierten Kunden-PDFs — inklusive der Adressen, an denen
// sich die Kommentare 4 und 5 entzündet haben.
const ADRESSE = 'Lüthi Haustechnik AG, Muttenzerstrasse 61, 4127 Birsfelden';
await page.evaluate(adr => {
  const st = window._abState(), A = st.abnahme;
  A.geprueftTyp = 'komplett'; A.gepruefterTeil = 'Gesamtes Werk (Diverse Sanitär- und Heizungsarbeiten)';
  A.bauobjekt = '2024.005 Nebengebäude, Hochbergerstrasse 17, 4057 Basel';
  A.bauherrFirma = 'Robestate AG, Hochbergerstrasse 15, 4057 Basel';
  A.bauleitungName = 'Genadi Fries'; A.bauleitungFirma = 'Vischer Architekten AG, Hardstrasse 10, 4020 Basel';
  A.unternehmerName = 'Baran Koc'; A.unternehmerFirma = adr;
  A.weitereBeteiligte = [{ funktion: 'Fachbauleitung', name: 'Marc Dischler', firma: 'Schmutz + Partner AG, Dornacherstrasse 210, 4053 Basel' }];
  A.arbeitsgattung = 'BKP 250 Sanitäranlagen'; A.vertragVom = '30.03.2026';
  A.datum = '20.08.2026'; A.ort = 'Basel';
  A.art158 = true; A.art161 = true; A.ergebnis = 'unwesentliche'; A.entscheid = 'abgenommen';
  A.docMaengelliste = true; A.garantieJahre = 2;
  A.bemerkungen = 'Fühler Belimo Lüftungsmonoblock wird zu Lasten Lüthi HT AG ersetzt.';
  A.sig.unternehmer.name = 'Baran Koc'; A.sig.unternehmer.visum = adr;
  A.sig.unternehmer.bestaetigt = { am: '20.08.2026', ort: 'Basel' };
  const foto = (t) => 'data:image/jpeg;base64,' + btoa(t.padEnd(40, 'x'));
  st.items = [
    window._abCreateItem({ ort: 'Technikzentrale', mangel: 'Rohrleitung Heizung isolieren', kuerzel: adr }),
    window._abCreateItem({ ort: 'Technikraum', mangel: 'Entfernen Schienenhalterung', kuerzel: adr }),
    window._abCreateItem({ ort: 'Waschküche UG', mangel: 'Anschluss Waschmaschine nicht dicht', kuerzel: adr })
  ];
  st.items[0].photos = [{ dataUrl: foto('a'), name: 'image.jpg' }, { dataUrl: foto('b'), name: 'IMG_4711.jpg' }];
  st.items[1].photos = [{ dataUrl: foto('c'), name: 'image.jpg' }];
  st.items[2].photos = [{ dataUrl: foto('d'), name: 'foto.png' }];
  A.instwandChk = { masse: 'io', schall: 'nio' };
  window._abRender();
}, ADRESSE);
await page.evaluate(() => document.getElementById('exportPdfBtn2').click());
await page.waitForTimeout(2200);
const out = await page.evaluate(() => window.__pdf);
const src = await readFile(join(ROOT, 'pm_abnahme.html'), 'utf8');

const txt = out.calls.filter(c => c.n === 'text');
const alle = txt.map(c => String(c.a[0])).join(' | ');
// Fliesstext-Sicht: jsPDF setzt einen umbrochenen Absatz als MEHRERE
// text()-Aufrufe. Wer einen ganzen Satz prüfen will, muss darum über die
// Zeilengrenzen hinweg lesen — sonst prüft er nur, wo zufällig umbrochen wird.
const fliess = txt.map(c => String(c.a[0])).join(' ').replace(/\s+/g, ' ');
const seite1 = out.calls.filter(c => c.p === 1);
const s1txt = seite1.filter(c => c.n === 'text').map(c => String(c.a[0]));

ok(errs.length === 0, 'PDF-Erzeugung ohne pageerror (' + errs.slice(0, 2).join(' | ') + ')');

console.log('\n— Kommentar 1: «Sauber darstellen» (Logo) —');
const bilder = out.calls.filter(c => c.n === 'addImage' && c.p === 1);
ok(bilder.length >= 1, 'Logo auf der Titelseite eingebettet');
if (bilder.length) {
  const [, , x, , w, h] = bilder[0].a;
  ok(Math.abs((w / h) - (100 / 300)) < 0.02, 'Logo behält sein Seitenverhältnis (' + w.toFixed(1) + '×' + h.toFixed(1) + ')');
  ok(x + w <= 556, 'Logo endet am rechten Satzspiegel (x+b = ' + (x + w).toFixed(1) + ')');
  ok(h <= 58 && w <= 132, 'Logo bleibt im Höhen-/Breiten-Deckel');
}
ok(/LH_MAX=58, LW_MAX=132/.test(src) && /lw>LW_MAX\)\{ lw=LW_MAX; lh=lw\/logo\.ratio; \}/.test(src),
   'die Breite deckelt über das Seitenverhältnis (nie die Höhe kappen)');
// Datum steht unter dem Logo, rechtsbündig
const datumR = seite1.filter(c => c.n === 'text' && String(c.a[0]) === '20.08.2026' && c.a[3] && c.a[3].align === 'right');
ok(datumR.length === 1, 'Datum rechtsbündig unter dem Logo (Vorschlag)');

console.log('\n— Kommentar 2: «Mehr Abstand / Darstellung anpassen» —');
ok(s1txt.indexOf('Projekt- und Vertragsangaben') >= 0, 'Sektion «Projekt- und Vertragsangaben»');
ok(s1txt.indexOf('Prüfungs-Protokoll') >= 0, 'Sektion «Prüfungs-Protokoll»');
ok(s1txt.indexOf('Bemerkungen') >= 0 && s1txt.indexOf('Entscheid') >= 0, 'Sektionen «Bemerkungen» + «Entscheid»');
ok(s1txt.indexOf('Garantie') >= 0 && s1txt.indexOf('Bestätigung / Unterschriften') >= 0, 'Sektionen «Garantie» + «Bestätigung / Unterschriften»');
ok(s1txt.indexOf('Norm SIA 118') >= 0, 'Norm-Zeile unter dem grossen Titel');
ok(!/SCHMUTZ \+ PARTNER AG/.test(alle), 'kein Versalien-Eyebrow mit dem Firmennamen mehr');
// Angaben als Tabelle: Labels an EINER x-Position, Werte an EINER x-Position,
// darunter je eine Trennlinie über die volle Textbreite.
const lbl = seite1.filter(c => c.n === 'text' && !c.a[3] && /^(Bauobjekt|Bauherr|Bauleitung|Unternehmer|Arbeitsgattung|Vertrag vom|Geprüfter Teil|Dokumentation)$/.test(String(c.a[0])));
ok(lbl.length >= 8, 'alle Angaben tragen ein eigenes Tabellen-Label (' + lbl.length + ')');
ok(new Set(lbl.map(c => c.a[1])).size === 1, 'die Labels stehen exakt untereinander (x = ' + lbl[0].a[1] + ')');
ok(!/Bauobjekt:|Arbeitsgattung:|Geprüfter Teil:/.test(alle), 'Tabellen-Labels ohne Doppelpunkt');
const trenn = seite1.filter(c => c.n === 'line' && c.a[0] === 40 && c.a[2] === 555 && c.a[1] === c.a[3]);
ok(trenn.length >= 12, 'jede Angaben-Zeile hat ihre Trennlinie (' + trenn.length + ')');
// Zeilenhöhe: mindestens 20pt Abstand zwischen zwei Labels — das ist die «Luft»
const lblY = lbl.map(c => c.a[2]).sort((a, b) => a - b);
const abst = lblY.slice(1).map((v, i) => v - lblY[i]).filter(d => d > 0 && d < 60);
ok(abst.length && Math.min(...abst) >= 20, 'Zeilen mit Luft (kleinster Abstand ' + Math.min(...abst).toFixed(1) + ' pt)');
ok(/const AB_TAB_PADY=/.test(src) && /function _abTabZeile/.test(src), 'Angaben-Tabelle als Helfer mit einstellbarer Luft');
// Ergebnis bleibt eine Ankreuzzeile (Feedback 03.08.2026) — aber IN der Tabelle
ok(s1txt.indexOf('Ergebnis') >= 0 && /unwesentliche Mängel/.test(alle), 'Ergebnis als Tabellenzeile mit Ankreuzkästchen');
const boxen = seite1.filter(c => c.n === 'rect' && c.a[2] === 9 && c.a[3] === 9);
ok(boxen.length >= 3, 'die Kästchen werden GEZEICHNET (jsPDF-Fonts sind latin1)');
// … und stossen nicht mehr aneinander: die drei Kästchen stehen in einer Zeile
const boxZeile = boxen.filter(c => Math.abs(c.a[1] - boxen[0].a[1]) < 1);
ok(boxZeile.length === 3, 'die drei Ergebnis-Kästchen stehen auf EINER Zeile');
const bx = boxZeile.map(c => c.a[0]).sort((a, b) => a - b);
ok(bx[2] + 9 + 6 + 100 <= 556, 'auch das dritte Kästchen samt Beschriftung bleibt im Satzspiegel');

console.log('\n— Kommentar 3: «Bitte Satz richtig schreiben, sonst heraus nehmen» (SIA 158/161) —');
// Nachtrag vom 20.08.2026 (Marc Dischler): «diesen Text noch entfernen» — der
// Kunde hat den zweiten Ast seines eigenen Kommentars gewählt. Der
// Art.-158-Abs.-2-Zusatz erscheint darum GAR NICHT mehr im Protokoll; welcher
// Artikel für die Prüfung gilt, steht weiterhin in der Zeile «Prüfung gemäss»
// und im Tooltip des Kästchens im Kopf.
ok(!/Zusatz nach SIA 118 Art\. 158/.test(alle), 'Art.-158-Abs.-2-Zusatz aus dem Protokoll entfernt');
ok(!/Monatsfrist seit Empfang der Vollendungsanzeige/.test(fliess), 'auch der Normtext dazu erscheint nicht mehr');
ok(/Prüfung gemäss/.test(alle) && /Art\. 158 Abs\. 2/.test(alle), 'welcher Artikel gilt, steht weiterhin in der Zeile «Prüfung gemäss»');
ok(/Wird auf die Wiederholung der Prüfung verzichtet, gilt das Werk als abgenommen, sobald die gerügten wesentlichen Mängel behoben sind/.test(fliess),
   'Art. 161 Abs. 3 als Norm-REGEL im Konditionalsatz');
ok(!/ist .{0,40}unterblieben —/.test(fliess) && !/wurde .{0,40}verzichtet —/.test(fliess),
   'keine Tatsachenbehauptung im Perfekt mit Gedankenstrich mehr');
ok(!/Nach SIA 118:/.test(alle), 'kein eigener Block «Nach SIA 118:» mehr (Vorschlag: Fliesstext)');
ok(!/• Zusatz nach SIA 118/.test(alle), 'keine Aufzählungspunkte mehr');
// Der verbliebene Zusatz-Text steht am Entscheid-Satz, nicht irgendwo darunter
const iEnt = s1txt.findIndex(t => /Das Werk gilt als abgenommen/.test(t));
// Gesucht wird der ANFANG des Zusatz-Absatzes: der Satz selbst bricht um und
// steht darum in keiner einzelnen text()-Zeile vollständig.
const iZus = s1txt.findIndex(t => /Zusatz nach SIA 118 Art\. 161/.test(t));
ok(iEnt >= 0 && iZus > iEnt && iZus - iEnt <= 6, 'die SIA-Erläuterung steht direkt unter dem Entscheid-Satz');

console.log('\n— Kommentar 4: «Nur Unternehmername nicht gesamte Adresse» —');
const mTab = out.tables[out.tables.length - 1];
const iWer = mTab.head[0].indexOf('Durch wen');
ok(iWer >= 0, 'Mängelliste hat die Spalte «Durch wen»');
const werte = mTab.body.map(r => String(r[iWer]));
ok(werte.every(v => /Lüthi Haustechnik AG/.test(v)), 'der Firmenname steht in der Spalte');
ok(werte.every(v => !/Muttenzerstrasse|4127|Birsfelden/.test(v)), 'die ADRESSE steht NICHT mehr in der Spalte');
// Unterschriften: Name + Firma, keine Adresse
ok(s1txt.indexOf('Baran Koc') >= 0, 'Unterschrift zeigt den Namen');
ok(s1txt.some(t => t === 'Lüthi Haustechnik AG'), 'Unterschrift zeigt die Firma');
// In den zentrierten Unterschriften-Spalten darf KEINE Adresse stehen
const zentriert = seite1.filter(c => c.n === 'text' && c.a[3] && c.a[3].align === 'center').map(c => String(c.a[0]));
ok(zentriert.length > 0 && !zentriert.some(t => /Muttenzerstrasse|Hardstrasse|Dornacherstrasse|\d{4} \w/.test(t)),
   'die Adresse steht nicht in der Unterschriften-Spalte');
ok(!/\(Lüthi Haustechnik AG, Muttenzerstrasse/.test(fliess), 'kein abgeschnittener «(Firma, Strasse …»-Rest mehr');
// die Vertragsangaben tragen die volle Adresse weiterhin (sie geht nicht verloren)
ok(/Baran Koc — Lüthi Haustechnik AG, Muttenzerstrasse 61, 4127 Birsfelden/.test(fliess),
   'die volle Adresse steht weiterhin in den Vertragsangaben');
// _nurFirma kürzt NUR, wenn hinter dem Komma etwas Adressartiges steht —
// ein Firmenname wie «Meier, Müller & Co.» muss ganz bleiben. Funktional
// geprüft, nicht am Quelltext abgelesen.
const nf = await page.evaluate(() => [
  window._nurFirma('Lüthi Haustechnik AG, Muttenzerstrasse 61, 4127 Birsfelden'),
  window._nurFirma('Meier, Müller & Co.'),
  window._nurFirma('Robestate AG'),
  window._nurFirma('')
]);
ok(nf[0] === 'Lüthi Haustechnik AG', '_nurFirma schneidet die Adresse ab (' + nf[0] + ')');
ok(nf[1] === 'Meier, Müller & Co.', '_nurFirma lässt einen Firmennamen mit Komma ganz (' + nf[1] + ')');
ok(nf[2] === 'Robestate AG' && nf[3] === '', '_nurFirma lässt Namen ohne Komma und Leerwerte unberührt');

console.log('\n— Kommentar 5: «Trennung machen» —');
const iOrt = mTab.head[0].indexOf('Ort/Raum');
const ortW = mTab.columnStyles[String(iOrt)].cellWidth;
ok(iOrt >= 0 && ortW >= 70, 'die Spalte «Ort/Raum» ist breiter geworden (' + ortW + ' pt)');
ok(Object.keys(mTab.columnStyles).reduce((s, k) => s + mTab.columnStyles[k].cellWidth, 0) <= 515,
   'die Summe der Spaltenbreiten passt weiterhin in die Textbreite');
ok(/function _abTrenn/.test(src), 'Wort-Trennung als Helfer');
// Funktionale Gegenprobe mit dem ECHTEN Helfer (Hook `window._abTrenn`):
// ein Wort, das breiter ist als die Spalte, bekommt eine Trennstelle mit
// Bindestrich; ein Wort, das passt, wird nicht angefasst.
const trennProbe = await page.evaluate(() => {
  const d = new window.jspdf.jsPDF();          // gestubbt: 0.5 * fontSize je Zeichen
  return {
    lang: window._abTrenn(d, 'Technikzentrale', 40, 8),   // 15 Zeichen ≈ 60 pt > 40
    kurz: window._abTrenn(d, 'Technikraum', 200, 8),
    satz: window._abTrenn(d, 'Waschküche UG', 40, 8),
    leer: window._abTrenn(d, '', 40, 8)
  };
});
// Die Teile werden mit einem LEERZEICHEN verbunden — nur dort darf autoTable
// umbrechen; der Bindestrich bleibt am Zeilenende stehen.
ok(/- /.test(trennProbe.lang) && trennProbe.lang.replace(/[- ]/g, '') === 'Technikzentrale',
   'zu langes Wort wird mit Bindestrich getrennt (' + JSON.stringify(trennProbe.lang) + ')');
ok(trennProbe.kurz === 'Technikraum', 'ein passendes Wort bleibt unangetastet');
ok(trennProbe.satz.indexOf('Waschküche') >= 0 && trennProbe.leer === '',
   'mehrteiliger Text und Leerwert bleiben brauchbar');
ok(/_abTrenn\(doc,it\.ort\|\|''/.test(src) && /_abTrenn\(doc,_nurFirma/.test(src),
   'Ort/Raum UND «Durch wen» laufen durch die Trennung');
ok(/teile\.push\(rest\.slice\(0,n-1\)\+'-'\)/.test(src), 'die Trennstelle bekommt einen Bindestrich');
ok(/if\(n<=3\) break;/.test(src), 'ein Wort wird nie auf Einzelbuchstaben zerlegt');

console.log('\n— Kommentar 6: «Benennung löschen» —');
ok(!/image\.jpg|IMG_4711|foto\.png/.test(alle), 'kein Dateiname mehr im Foto-Anhang');
ok(!/Foto \d+:/.test(alle), 'kein «Foto N:»-Vorspann mehr');
ok(/Nr\. 1 – Technikzentrale/.test(alle), 'die Zuordnung zum Mängelpunkt bleibt');
ok(/\(Fortsetzung\)/.test(alle), 'ein Folgefoto bleibt seinem Punkt zugeordnet');

console.log('\n— Kommentar 7: «zwei Fotos pro Seite» —');
const anhangSeite = (out.calls.find(c => c.n === 'text' && String(c.a[0]) === 'Foto-Anhang') || {}).p;
ok(anhangSeite >= 2, 'Foto-Anhang beginnt auf einer eigenen Seite (Seite ' + anhangSeite + ')');
const fotoBilder = out.calls.filter(c => c.n === 'addImage' && c.p >= anhangSeite);
ok(fotoBilder.length === 4, 'alle vier Fotos sind im Anhang (' + fotoBilder.length + ')');
const proSeite = {};
fotoBilder.forEach(c => { proSeite[c.p] = (proSeite[c.p] || 0) + 1; });
ok(Object.values(proSeite).every(n => n <= 2), 'nie mehr als zwei Fotos pro Seite (' + JSON.stringify(proSeite) + ')');
// Titel und sein Foto stehen IMMER auf derselben Seite
[1, 2, 3].forEach(nr => {
  const t = out.calls.find(c => c.n === 'text' && new RegExp('^Nr\\. ' + nr + ' – ').test(String(c.a[0])));
  const naechstesBild = fotoBilder.find(c => out.calls.indexOf(c) > out.calls.indexOf(t));
  ok(t && naechstesBild && t.p === naechstesBild.p, 'Titel «Nr. ' + nr + '» steht auf derselben Seite wie sein Foto');
});
ok(/const fotos=\[\];/.test(src) && /erst:erst/.test(src),
   'die Fotos werden VOR dem Setzen flach gelegt (Titel hängt am ersten Foto)');
ok(/M\+\(515-w\)\/2/.test(src), 'die Fotos stehen horizontal zentriert');

console.log('\n— Darstellungsvorschlag: Unterschriften-Spalten —');
const SIG = ['Unternehmer', 'Bauherr', 'Bauleitung', 'Fachbauleitung'];
const sigCalls = seite1.filter(c => c.n === 'text' && SIG.indexOf(String(c.a[0])) >= 0 && c.a[3] && c.a[3].align === 'center');
ok(sigCalls.length === 4, 'vier zentrierte Rollen-Spalten auf der Titelseite');
ok(!/Der Unternehmer|Die Bauleitung|Die Fachbauleitung/.test(alle), 'Rollen ohne «Der/Die»');
const sigY = sigCalls.map(c => c.a[2]);
ok(new Set(sigY).size === 1, 'die vier Spalten stehen auf derselben Höhe');
const sigX = sigCalls.map(c => c.a[1]).sort((a, b) => a - b);
ok(sigX[0] > 40 && sigX[3] < 555, 'die Spalten liegen im Satzspiegel (' + sigX.map(v => v.toFixed(0)).join(', ') + ')');
ok(s1txt.indexOf('Ort, Datum:') >= 0, '«Ort, Datum:» über den Spalten');
ok(/Bestätigt 20\.08\.2026/.test(alle), 'Bestätigungs-Stempel je Spalte');
// Unterschriftenlinien: vier, gleich lang, unter den Spalten
const sigLine = seite1.filter(c => c.n === 'line' && Math.abs(c.a[2] - c.a[0] - 104) < 0.5);
ok(sigLine.length === 4, 'vier gleich lange Unterschriftenlinien');
ok(sigLine.every(c => c.a[2] <= 556 && c.a[0] >= 40), 'die Linien bleiben im Satzspiegel');

console.log('\n— Seitenkopf: keine Doppellinie (Nachtrag 20.08.2026) —');
/* Die Laufzeile zieht ihre Linie bei y=34 über die volle Satzbreite. Der
   Abschnitts-Titel (_abBand) zog seine zuvor bei y-10 und landete damit rund
   12 pt darunter — zwei parallele Striche im Kopf. Gemessen wird deshalb der
   ABSTAND zwischen der Laufzeilen-Linie und jeder weiteren Volllinie derselben
   Seite: darunter darf im Kopfbereich nichts mehr liegen. */
const kopfLinien = out.calls.filter(c => c.n === 'line' && c.a[0] === 40 && c.a[2] === 555 && c.a[1] === c.a[3] && c.p > 1);
const lauf = kopfLinien.filter(c => Math.abs(c.a[1] - 34) < 0.5);
ok(lauf.length >= 1, 'Laufzeile ab Seite 2 mit ihrer Trennlinie (' + lauf.length + ')');
const nahe = kopfLinien.filter(c => c.a[1] > 34.5 && c.a[1] < 60);
ok(nahe.length === 0, 'keine zweite Volllinie dicht unter der Laufzeile' + (nahe.length ? ' (bei y=' + nahe.map(c => c.a[1]).join(', ') + ')' : ''));
// … und der Abschnitts-Strich steht jetzt UNTER seinem Titel (wie _abTitelBand)
const bandTitel = out.calls.filter(c => c.n === 'text' && c.p > 1 && /^(Mängel- & Pendenzenliste|Foto-Anhang|Anhang|Checkliste zur Kontrolle der Installationswände)$/.test(String(c.a[0])));
ok(bandTitel.length >= 1, 'Abschnitts-Titel auf den Inhaltsseiten (' + bandTitel.length + ')');
ok(bandTitel.every(t => kopfLinien.some(l => l.p === t.p && l.a[1] > t.a[2] && l.a[1] - t.a[2] < 10)),
   'jeder Abschnitts-Titel trägt seine Linie DARUNTER');

console.log('\n— Fusszeile —');
ok(/Schmutz \+ Partner AG {2}\| {2}Werkprüfung \/ Schlussabnahme \(SIA 118\)/.test(alle), 'Fusszeile benennt Firma + Dokument');
ok(/Seite 1 \/ /.test(alle), 'Seitenzahl bleibt');

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
await ctx.close(); await browser.close(); server.close();
process.exit(fail ? 1 : 0);
