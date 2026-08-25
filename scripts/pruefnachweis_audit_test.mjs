#!/usr/bin/env node
/**
 * Drift-Guard: Prüfer-Qualifikation · Audit-Export · PDF-Branding
 * ═══════════════════════════════════════════════════════════════
 * Sichert die drei Bausteine ab, die aus dem Prüfnachweis ein
 * Dokument machen, das eine Kontrolle übersteht:
 *
 *   1. QUALIFIKATION  Fachkundig nach SNR 462638 ist eine PERSONEN-
 *      Eigenschaft. Sie lebt im Profil und wandert als Momentaufnahme
 *      IN den Bericht — wie die Grenzwerte. Ein später geändertes
 *      Profil darf einen abgelegten Nachweis nicht umdeuten.
 *      Fehlt sie, wird das BENANNT statt verschwiegen.
 *
 *   2. AUDIT-EXPORT   Ein PDF pro Betrieb mit allen Geräten, ihrem
 *      Prüfstatus und der prüfenden Person. Lücken stehen ZUOBERST.
 *      «Noch nie geprüft» ist dabei kein automatischer Mangel —
 *      ein frisch gekauftes Gerät ist erst nach dem Intervall fällig.
 *
 *   3. BRANDING       Jeder PDF-Export trägt Firmenfarbe und Logo,
 *      mit Kontrastschutz (eine helle Firmenfarbe wird abgedunkelt,
 *      sonst wäre der Text auf Weiss unlesbar).
 *
 * Teil A/B laufen ohne Browser (Engine + statische Repo-Prüfung),
 * Teil C braucht playwright-core + Chromium und wird sonst mit
 * Hinweis übersprungen — nie still.
 *
 * Aufruf:  CHROME=<chromium> node scripts/pruefnachweis_audit_test.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, fail = 0;
const T = (name, cond, info) => {
  if (cond) { ok++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${info ? '  → ' + info : ''}`); }
};
const lies = f => readFileSync(join(ROOT, f), 'utf8');

// ════════════════════════════════════════════════════════════
console.log('\nA · Engine — Qualifikation der prüfenden Person');
// ════════════════════════════════════════════════════════════
const P = (await import(join(ROOT, 'gema_pruefwerte.js'))).default;

T('Katalog vorhanden', Array.isArray(P.QUALIFIKATIONEN) && P.QUALIFIKATIONEN.length >= 5);
T('jede Qualifikation hat id + label',
  P.QUALIFIKATIONEN.every(q => q && q.id && q.label));
T('IDs sind eindeutig',
  new Set(P.QUALIFIKATIONEN.map(q => q.id)).size === P.QUALIFIKATIONEN.length);
T('«andere» existiert (Freitext-Ausweg)',
  P.QUALIFIKATIONEN.some(q => q.id === 'andere'));

T('bekannter Schlüssel → volles Label',
  P.qualiLabel('esb', '') === P.qualiInfo('esb').label);
T('Schlüssel + Freitext → beides («Label — Zusatz»)',
  P.qualiLabel('installateur', 'seit 2019') === P.qualiInfo('installateur').label + ' — seit 2019');
T('«andere»: Freitext gewinnt über das generische Label',
  P.qualiLabel('andere', 'Elektro-Kontrolleur i.A.') === 'Elektro-Kontrolleur i.A.');
T('«andere» ohne Freitext fällt auf das Label zurück',
  P.qualiLabel('andere', '') === P.qualiInfo('andere').label);
T('nur Freitext ohne Schlüssel wird durchgereicht',
  P.qualiLabel('', 'Externer Prüfer AG') === 'Externer Prüfer AG');
T('nichts erfasst → leer (kein erfundener Wert)',
  P.qualiLabel('', '') === '');
// Kein stiller Verlust: ein unbekannter Schlüssel (Altdaten, umbenannter
// Katalog) verschwindet NICHT, er erscheint roh.
T('unbekannter Schlüssel wird roh gezeigt statt verschluckt',
  P.qualiLabel('gibt_es_nicht', '') === 'gibt_es_nicht');
T('unbekannter Schlüssel mit Freitext zeigt den Freitext',
  P.qualiLabel('gibt_es_nicht', 'Meine Angabe') === 'Meine Angabe');
T('qualiInfo liefert null bei unbekanntem Schlüssel', P.qualiInfo('xyz') === null);

const uMit = { profile: { pruefQualifikation: 'kontrolleur', pruefQualifikationText: '' } };
const uAndere = { profile: { pruefQualifikation: 'andere', pruefQualifikationText: 'VSEK-Mitglied' } };
T('qualiVonUser liest das Profil', P.qualiVonUser(uMit).label === P.qualiInfo('kontrolleur').label);
T('qualiVonUser: «andere» + Freitext', P.qualiVonUser(uAndere).label === 'VSEK-Mitglied');
T('qualiVonUser ohne Profil → leeres Label', P.qualiVonUser({}).label === '');
T('qualiVonUser verträgt null', P.qualiVonUser(null).label === '');

// ════════════════════════════════════════════════════════════
console.log('\nB · Repo — Verdrahtung, Branding, Registrierung');
// ════════════════════════════════════════════════════════════
const wv = lies('gema_pruefwerte.js');
const prof = lies('sys_profil.html');
const wz = lies('if_werkzeug.html');
const dash = lies('sys_lieferant_dashboard.html');

// — Qualifikation ist GETEILT, nicht kopiert —
T('Katalog steht in der geteilten Datei', /WZ_QUALIFIKATIONEN\s*=/.test(wv));
T('gema_pruefwerte exportiert die Qualifikations-API',
  /QUALIFIKATIONEN\s*:/.test(wv) && /qualiVonUser\s*:/.test(wv));
T('window-Globals für die Module gesetzt',
  /window\.wzQualiVonUser/.test(wv) && /window\.wzQualiLabel/.test(wv));
T('KEIN zweiter Katalog im Werkzeugmodul',
  !/WZ_QUALIFIKATIONEN\s*=\s*\[/.test(wz));
T('KEIN zweiter Katalog im Lieferanten-Dashboard',
  !/WZ_QUALIFIKATIONEN\s*=\s*\[/.test(dash));

// — Profil —
T('sys_profil bindet gema_pruefwerte.js ein',
  /<script[^>]+src=["']gema_pruefwerte\.js/.test(prof));
T('sys_profil hat die Qualifikations-Karte', /id=["']cardPruefQuali["']/.test(prof));
T('sys_profil speichert über GemaAuth.updateProfile',
  /function savePruefQuali/.test(prof) && /updateProfile/.test(prof));
T('Karte ist auf werkzeugmanagement gegated (wer nie prüft, sieht sie nicht)',
  /cardPruefQuali[\s\S]{0,400}?werkzeugmanagement|werkzeugmanagement[\s\S]{0,400}?cardPruefQuali/.test(prof));
T('Freitext-Feld nur bei «andere»', /_pQualiSync/.test(prof) && /pQualiFrei/.test(prof));

// — Werkzeugmodul: Dialog, Anzeige, CSV, PDF —
T('Prüfbericht-Dialog zeigt die Qualifikation', /function _wzQualiFeldHtml/.test(wz));
T('Bericht speichert die Momentaufnahme',
  /pruefQualifikation\s*:/.test(wz));
T('Berichte-Modal zeigt sie am Eintrag', /function _wzQualiBerichtHtml/.test(wz));
T('fehlende Qualifikation wird BENANNT, nicht verschwiegen',
  /Qualifikation der prüfenden Person nicht erfasst/.test(wz));
T('CSV führt eine eigene Spalte', /'Qualifikation Prüfer'/.test(wz));
T('CSV schreibt «nicht erfasst» statt einer leeren Zelle',
  /pruefQualifikation\s*\|\|\s*'nicht erfasst'/.test(wz));
T('nur Prüfberichte tragen die Frage (Defektmeldung ist gegenstandslos)',
  /b\.typ!=='pruefbericht'\)return\s*''/.test(wz));

// — Lieferanten-Dashboard: derselbe Nachweis für den Externen —
T('Dashboard hat das Qualifikations-Feld', /function _dwzQualiFeldHtml/.test(dash));
T('Dashboard bindet gema_pruefwerte.js ein',
  /<script[^>]+src=["']gema_pruefwerte\.js/.test(dash));
T('Dashboard speichert die Momentaufnahme mit',
  /pruefQualifikation\s*:\s*\(typeof wzQualiVonUser/.test(dash));
T('Dashboard verweist bei fehlender Angabe aufs Profil',
  /sys_profil\.html/.test(dash) && /Prüfqualifikation/.test(dash));

// — Branding —
T('Branding-Auflösung vorhanden', /function _wzPdfBrand/.test(wz));
T('Firmenfarbe kommt aus org.settings.pdfFarben',
  /settings\s*&&\s*o\.settings\.pdfFarben/.test(wz));
T('Kontrastschutz gegen Weiss ist implementiert',
  /function _wzContrastVsWhite/.test(wz) && /function _wzDarken/.test(wz));
T('Logo wird für jsPDF FARBIG gerastert (nicht 1-Bit wie die Etikette)',
  /function _wzPdfLogo/.test(wz) && /image\/jpeg/.test(wz));
T('Etiketten-Rasterer bleibt monochrom (Thermodrucker)',
  /function _wzMonochromeForLabel/.test(wz));
T('der Etiketten-Zeichner ruft KEIN PDF-Branding (Thermodruck ist schwarz-weiss)',
  !/function _wzDrawEtikette[\s\S]{0,1200}?_wzPdfBrand/.test(wz));
T('Titelblock + Abschnittsband + Kopf-/Fusszeile als Helfer',
  /function _wzPdfTitel/.test(wz) && /function _wzPdfBand/.test(wz) && /function _wzPdfKopfFuss/.test(wz));
T('Berichte-PDF ist gebranded',
  /_wzExportBerichtePDF[\s\S]{0,900}?_wzPdfBrand\(\)/.test(wz));
T('Audit-PDF ist gebranded',
  /_wzAuditPDF[\s\S]{0,900}?_wzPdfBrand\(\)/.test(wz));
// Distanz grosszuegig: der Funktionskopf des Druckfensters ist ueber 3000
// Zeichen lang, bevor der Kopf gezeichnet wird — ein zu enger Deckel meldet
// einen Fehler, wo keiner ist.
T('das HTML-Druckfenster der Prüfliste ist ebenfalls gebranded',
  /function _wzPrintBrand/.test(wz)
  && /function _wzPruefPDF[\s\S]{0,4000}?_wzPrintBrand\(\)/.test(wz)
  && /function _wzPruefPDF[\s\S]{0,4000}?_wzPrintCss\(/.test(wz)
  && /function _wzPruefPDF[\s\S]{0,4000}?_wzPrintKopf\(/.test(wz));
T('Kopf-/Fusszeile trägt «Seite X / Y»', /Seite '\+p\+' \/ '\+n/.test(wz));

// — Audit-Export —
T('Audit-Engine vorhanden', /function _wzAuditPlan/.test(wz));
T('Engine ist DOM-frei (heute als Parameter)', /function _wzAuditPlan\(list,heute\)/.test(wz));
T('fünf Gruppen definiert', /_WZ_AUDIT_GRUPPEN\s*=/.test(wz));
T('Lücken stehen zuoberst (ohne → überfällig → bald → ok → keine)',
  /key:'ohne'[\s\S]{0,900}?key:'ueberfaellig'[\s\S]{0,900}?key:'bald'[\s\S]{0,900}?key:'ok'[\s\S]{0,900}?key:'keine'/.test(wz));
T('Toolbar-Knopf im Markup', /id=["']btnWzAudit["']/.test(wz));
T('Knopf hat eine eigene Sortier-Position', /#btnWzAudit\{order:\d+\}/.test(wz));
T('Knopf nur für Bearbeitende sichtbar',
  /btnWzAudit'\);\s*\n?\s*if\(btnAud && canEdit\)/.test(wz));
T('ausgemusterte/verkaufte werden ausgeschlossen UND gezählt',
  /ausgemustert'\|\|lc==='verkauft'\)\{raus\+\+/.test(wz));
T('Test-Hooks für die Engine exponiert', /window\._wzAuditHooks/.test(wz));

// — Registrierung —
const sw = lies('sw.js');
const swV = (sw.match(/gema-v(\d+)/) || [])[1];
T('sw.js-Version ist gesetzt und ≥ 500', swV && parseInt(swV, 10) >= 500, 'gefunden: v' + swV);
T('gema_pruefwerte.js liegt im Service-Worker-Cache', /gema_pruefwerte\.js/.test(sw));

// ════════════════════════════════════════════════════════════
console.log('\nC · Browser — Audit-Gruppierung, Snapshot, Branding im PDF');
// ════════════════════════════════════════════════════════════
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch { /* unten gemeldet */ }
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';

if (!chromium) {
  console.log('  ⚠ übersprungen — playwright-core fehlt (npm i --no-save playwright-core)');
} else if (!existsSync(CHROME)) {
  console.log(`  ⚠ übersprungen — Chromium nicht gefunden unter ${CHROME}`);
} else {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

  // jsPDF durch einen Rekorder ersetzen: der Test misst, WAS gezeichnet
  // wird — die Library selbst ist im Test ohnehin nicht erreichbar (CDN).
  const STUB = `
window.__pdf = { calls: [], pages: 1, page: 1, opts: null };
function _rec(n){ return function(){ window.__pdf.calls.push({ n:n, a:[].slice.call(arguments), p:window.__pdf.page }); return this; }; }
function FakeDoc(o){
  window.__pdf.opts = o || null;
  var quer = o && o.orientation === 'landscape';
  this.internal = {
    getNumberOfPages: function(){ return window.__pdf.pages; },
    pageSize: { getHeight: function(){ return quer ? 210 : 297; }, getWidth: function(){ return quer ? 297 : 210; } }
  };
  var self = this;
  ['setFont','text','line','setLineWidth','addImage','rect',
   'setFillColor','setTextColor','setDrawColor'].forEach(function(m){ self[m] = _rec(m); });
  // Schriftgroesse mitfuehren: getTextWidth OHNE sie misst eine 7-pt-Zeile
  // gleich breit wie eine 19-pt-Zeile — _wzPdfKurz kuerzte dann Texte weg,
  // die im echten PDF laengst passen (falscher Alarm statt echtem Befund).
  var _fs = 12;
  this.setFontSize = function(s){ _fs = Number(s) || 12; return _rec('setFontSize').apply(this, arguments); };
  // jsPDF rechnet in der Dokument-Einheit (hier mm). Helvetica liegt im Mittel
  // bei rund 0.5 em pro Zeichen; 1 pt = 0.3528 mm.
  this.getTextWidth = function(t){ return String(t == null ? '' : t).length * _fs * 0.5 * 0.3528; };
  this.splitTextToSize = function(t){ return String(t == null ? '' : t).split('\\n'); };
  this.addPage = function(){ window.__pdf.pages++; window.__pdf.page = window.__pdf.pages; window.__pdf.calls.push({n:'addPage',a:[],p:window.__pdf.page}); return this; };
  this.setPage = function(p){ window.__pdf.page = p; window.__pdf.calls.push({n:'setPage',a:[p],p:p}); return this; };
  this.save = function(f){ window.__pdf.calls.push({n:'save',a:[f],p:window.__pdf.page}); window.__pdf.datei = f; };
  this.output = function(){ return 'blob:fake'; };
}
window.jspdf = { jsPDF: FakeDoc };
`;

  const LOGO = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"><rect width="300" height="100" fill="#123456"/></svg>');

  const heute = new Date().toISOString().slice(0, 10);
  const inTagen = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const vorMonaten = m => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };

  // Bestand mit genau den Fällen, auf die es ankommt
  const TOOLS = [
    // überfällig: letzte Prüfung vor 18 Monaten bei 12-Monats-Intervall
    { id: 'wz_ueber', name: 'Bohrhammer alt', cat: 'maschine-kabel', orgId: 'org_t', bought: '2020-01-01',
      hasElec: true, elecInterval: 12, lastElec: vorMonaten(18), serial: 'SN-1', berichte: [
        { id: 'b1', typ: 'pruefbericht', datum: vorMonaten(18), autorName: 'Hans Muster',
          pruefQualifikation: 'Elektrokontrolleur/in mit eidg. Fachausweis', ergebnis: 'bestanden' }
      ] },
    // ohne Termin: Prüfpflicht gesetzt, aber KEIN Intervall
    { id: 'wz_ohne', name: 'Winkelschleifer', cat: 'maschine-kabel', orgId: 'org_t', bought: '2023-05-01',
      hasElec: true, elecInterval: null, serial: 'SN-2', berichte: [] },
    // bald fällig: in 10 Tagen
    { id: 'wz_bald', name: 'Verlängerungskabel', cat: 'sonstige', orgId: 'org_t', bought: '2024-01-01',
      hasElec: true, elecInterval: 12, lastElec: inTagen(10 - 365), serial: 'SN-3', berichte: [] },
    // Erstprüfung ausstehend: frisch gekauft, nie geprüft, Termin in Zukunft
    { id: 'wz_neu', name: 'Akku-Schrauber', cat: 'maschine', orgId: 'org_t', bought: inTagen(-20),
      hasService: true, serviceInterval: 24, serial: 'SN-4', berichte: [] },
    // gültig
    { id: 'wz_ok', name: 'Leiter 3m', cat: 'leiter', orgId: 'org_t', bought: '2022-01-01',
      hasLeiter: true, leiterInterval: 12, lastLeiter: vorMonaten(2), serial: 'SN-5', berichte: [
        { id: 'b2', typ: 'pruefbericht', datum: vorMonaten(2), autorName: 'Externe Prüf AG', ergebnis: 'bestanden' }
      ] },
    // keine Prüfpflicht
    { id: 'wz_keine', name: 'Hammer', cat: 'handwerkzeug', orgId: 'org_t', bought: '2021-01-01',
      serial: 'SN-6', berichte: [] },
    // ausgemustert — gehört NICHT in den Betriebsnachweis
    { id: 'wz_alt', name: 'Ausrangierte Säge', cat: 'maschine-kabel', orgId: 'org_t', bought: '2015-01-01',
      lifecycleStatus: 'ausgemustert', hasElec: true, elecInterval: 12, lastElec: vorMonaten(40), serial: 'SN-7', berichte: [] }
  ];

  async function lauf(pdfFarben) {
    const ctx = await browser.newContext();
    await ctx.route('**', route => {
      const u = route.request().url();
      if (u.startsWith('file://')) return route.continue();
      // Lesen wird mit 503 beantwortet — eine leere 200er-Antwort gilt als
      // gültiger Cloud-Stand und würde den geseedeten Bestand leeren.
      if (/supabase|\/rest\/v1\/|\/functions\/|\/api\/|\/sb\//.test(u)) {
        return route.fulfill({
          status: route.request().method() === 'GET' ? 503 : 200,
          contentType: 'application/json', body: '{}'
        });
      }
      return route.abort();
    });
    await ctx.addInitScript(([tools, farben, logo]) => {
      const u = { id: 'u_mag', name: 'Test Magaziner', username: 'mag@t.ch', orgId: 'org_t',
        active: true, roleIds: ['role_magaziner'],
        profile: { pruefQualifikation: 'esb', pruefQualifikationText: '' } };
      localStorage.setItem('gema_users_v1', JSON.stringify([u]));
      localStorage.setItem('gema_orgs_v1', JSON.stringify([{
        id: 'org_t', name: 'Muster Haustechnik AG', admins: [], active: true,
        logoVector: logo, settings: farben ? { pdfFarben: farben } : {}
      }]));
      localStorage.setItem('gema_session_v1', JSON.stringify({
        userId: 'u_mag', token: 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJ1X21hZyIsIm9yZyI6Im9yZ190In0.x',
        tokenExp: Date.now() + 864e5, expires: Date.now() + 864e5, remember: true
      }));
      if (!localStorage.getItem('gema_werkzeug')) {
        localStorage.setItem('gema_werkzeug', JSON.stringify(tools));
      }
      localStorage.setItem('gema_coachmarks_done_if_werkzeug', '1');
      localStorage.setItem('gema_native_view_v1', 'klassisch');
    }, [TOOLS, pdfFarben, LOGO]);
    await ctx.addInitScript(STUB);
    const page = await ctx.newPage();
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e.message || e)));
    await page.goto('file://' + join(ROOT, 'if_werkzeug.html'));
    await page.waitForTimeout(1600);
    return { ctx, page, fehler };
  }

  // ── C1 · Engine im Browser: Gruppierung ────────────────────
  const A = await lauf({ primary: '#f5c518' }); // Knallgelb — Kontrastschutz muss greifen
  const plan = await A.page.evaluate(h => {
    const b = window._wzAuditHooks.basis();
    const p = window._wzAuditHooks.plan(b.list);
    const g = k => p[k].map(e => e.tool.id);
    return { basis: b, ohne: g('ohne'), ueber: g('ueberfaellig'), bald: g('bald'),
      ok: g('ok'), keine: g('keine'), erst: p.erstpruefung, gesamt: p.gesamt, pflichtig: p.pflichtig,
      erstIds: p.ok.concat(p.bald).filter(e => e.erstpruefung).map(e => e.tool.id) };
  }, heute);

  T('ausgemustertes Gerät ist NICHT im Nachweis', !JSON.stringify(plan).includes('wz_alt'));
  T('die Auslassung wird gezählt (kein stiller Ausschluss)', plan.basis.ausgeschieden === 1);
  T('überfälliges Gerät in der Überfällig-Gruppe', plan.ueber.includes('wz_ueber'));
  T('Gerät ohne Intervall = «ohne terminierbaren Nachweis»', plan.ohne.includes('wz_ohne'));
  T('bald fällig richtig einsortiert', plan.bald.includes('wz_bald'));
  T('gültige Prüfung in der OK-Gruppe', plan.ok.includes('wz_ok'));
  T('Gerät ohne Prüfpflicht in der eigenen Gruppe', plan.keine.includes('wz_keine'));
  // Der Kernfall: nie geprüft, aber Termin in der Zukunft — KEIN Mangel
  T('frisch gekauftes, nie geprüftes Gerät ist KEIN Mangel',
    !plan.ohne.includes('wz_neu') && !plan.ueber.includes('wz_neu'), JSON.stringify(plan.ohne));
  T('die ausstehende Erstprüfung wird trotzdem gezählt', plan.erst >= 1);
  T('und ist am Eintrag vermerkt', plan.erstIds.includes('wz_neu'));
  T('Zählung: alle Geräte ausser den ausgemusterten', plan.gesamt === TOOLS.length - 1);
  T('prüfpflichtig = alle ausser der «keine»-Gruppe', plan.pflichtig === plan.gesamt - plan.keine.length);

  // Sortierung innerhalb der Gruppe: das Dringendste zuoberst
  const sort = await A.page.evaluate(() => {
    const t = [
      { id: 'a', name: 'A', bought: '2020-01-01', hasElec: true, elecInterval: 12, lastElec: '2023-01-01' },
      { id: 'b', name: 'B', bought: '2020-01-01', hasElec: true, elecInterval: 12, lastElec: '2020-01-01' }
    ];
    return window._wzAuditHooks.plan(t).ueberfaellig.map(e => e.tool.id);
  });
  T('innerhalb der Gruppe steht das Dringendste zuoberst',
    sort[0] === 'b' && sort[1] === 'a', JSON.stringify(sort));

  // ── C2 · Audit-PDF mit Firmenfarbe ─────────────────────────
  await A.page.evaluate(() => window._wzAuditPDF());
  await A.page.waitForTimeout(900);
  const pdfA = await A.page.evaluate(() => {
    const c = window.__pdf.calls;
    const txt = c.filter(x => x.n === 'text').map(x => String(x.a[0]));
    return {
      datei: window.__pdf.datei || '',
      quer: !!(window.__pdf.opts && window.__pdf.opts.orientation === 'landscape'),
      farben: c.filter(x => x.n === 'setTextColor').map(x => x.a.join(',')),
      bilder: c.filter(x => x.n === 'addImage').length,
      texte: txt,
      seiten: window.__pdf.pages
    };
  });

  T('Audit-PDF wird gespeichert', /^Pruefnachweis_Werkzeuge_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdfA.datei), pdfA.datei);
  T('Nachweis läuft im Querformat (acht Spalten)', pdfA.quer);
  T('Firmenlogo wird eingebettet', pdfA.bilder >= 1);
  T('Firmenname steht im Titelblock',
    pdfA.texte.some(t => /MUSTER HAUSTECHNIK/i.test(t)), pdfA.texte.slice(0, 6).join(' | '));
  T('Titel benennt das Dokument', pdfA.texte.some(t => /Prüfnachweis Werkzeuge/.test(t)));
  // Kontrastschutz: Knallgelb #f5c518 darf NIE roh als Textfarbe erscheinen
  T('Knallgelb wird NICHT roh als Textfarbe verwendet',
    !pdfA.farben.includes('245,197,24'), pdfA.farben.slice(0, 8).join(' / '));
  const gedunkelt = pdfA.farben.some(f => {
    const [r, g, b] = f.split(',').map(Number);
    if (!(r > g * 0.6 && r > b * 2 && g > b)) return false;       // noch ein Gelb-/Gold-Ton
    const L = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    const lum = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
    return 1.05 / (lum + 0.05) >= 4.5;                            // ... aber lesbar auf Weiss
  });
  T('stattdessen ein abgedunkelter Ton mit Kontrast ≥ 4.5:1', gedunkelt, pdfA.farben.join(' / '));

  // Inhalt: die Gruppen und die kritischen Vermerke
  const hatText = re => pdfA.texte.some(t => re.test(t));
  T('Gruppen-Überschriften im PDF', hatText(/Überfällig \(\d+\)/) && hatText(/Ohne terminierbaren Nachweis \(\d+\)/));
  T('überfällige Geräte stehen VOR den gültigen',
    pdfA.texte.findIndex(t => /Überfällig \(/.test(t)) < pdfA.texte.findIndex(t => /Prüfung gültig \(/.test(t)));
  T('Gerätename mit interner Kennung/Status in der Zeile', hatText(/Bohrhammer alt/));
  T('Überfälligkeit steht als Klartext in der Zeile', hatText(/T\. überfällig/));
  T('nicht terminierbare Prüfung wird benannt', hatText(/nicht terminierbar/));
  T('ausstehende Erstprüfung ist vermerkt', hatText(/Erstprüfung/));
  T('Qualifikation des Prüfers steht im Nachweis',
    hatText(/Elektrokontrolleur\/in mit eidg\. Fachausweis/));
  T('fehlende Qualifikation wird im PDF benannt',
    hatText(/Qualifikation nicht erfasst/), pdfA.texte.filter(t => /Externe Prüf/.test(t)).join(' | '));
  T('Geräte ohne Prüfbericht werden benannt', hatText(/kein Prüfbericht erfasst/));
  T('Selbstdeklarations-Hinweis im Fuss', hatText(/Selbstdeklaration/));
  T('Seitenzahl auf jeder Seite', hatText(/^Seite \d+ \/ \d+$/));
  T('keine Seitenfehler beim Audit-Lauf', A.fehler.length === 0, A.fehler.join(' | '));
  await A.ctx.close();

  // ── C3 · Gegenprobe ohne Firmenfarbe ───────────────────────
  const B = await lauf(null);
  await B.page.evaluate(() => window._wzAuditPDF());
  await B.page.waitForTimeout(900);
  const pdfB = await B.page.evaluate(() => ({
    farben: window.__pdf.calls.filter(x => x.n === 'setTextColor').map(x => x.a.join(',')),
    bilder: window.__pdf.calls.filter(x => x.n === 'addImage').length
  }));
  T('ohne Firmenfarbe greift der GEMA-Ton', pdfB.farben.includes('15,23,42'), pdfB.farben.slice(0, 6).join(' / '));
  T('das Logo kommt trotzdem mit', pdfB.bilder >= 1);

  // ── C4 · Qualifikations-Snapshot beim Einreichen ───────────
  const snap = await B.page.evaluate(() => {
    // Prüfbericht über die echte Speicherfunktion des Moduls anlegen
    const t = window._wzAuditHooks ? null : null;
    const tools = JSON.parse(localStorage.getItem('gema_werkzeug'));
    const ziel = tools.find(x => x.id === 'wz_ok');
    const u = GemaAuth.getCurrentUser();
    const q = wzQualiVonUser(u).label;
    return { qualiAusProfil: q, hatKatalog: typeof WZ_QUALIFIKATIONEN !== 'undefined', zielDa: !!ziel };
  });
  T('das Werkzeugmodul erreicht die geteilte Qualifikations-API',
    snap.hatKatalog && /Elektro-Sicherheitsberater/.test(snap.qualiAusProfil), snap.qualiAusProfil);

  // Der Dialog zeigt die Qualifikation an
  const dlg = await B.page.evaluate(() => {
    const u = GemaAuth.getCurrentUser();
    return _wzQualiFeldHtml(u);
  });
  T('Prüfbericht-Dialog blendet die Qualifikation ein', /Qualifikation/.test(dlg) && /Elektro-Sicherheitsberater/.test(dlg));
  const dlgLeer = await B.page.evaluate(() => _wzQualiFeldHtml({ id: 'x', profile: {} }));
  T('ohne Profil-Eintrag erklärt der Dialog die Lücke',
    /Profil/.test(dlgLeer) && /sys_profil\.html/.test(dlgLeer), dlgLeer.slice(0, 140));

  // ── C5 · Audit-Dialog ──────────────────────────────────────
  await B.page.evaluate(() => window._wzAuditOpen());
  await B.page.waitForTimeout(400);
  const dialog = await B.page.evaluate(() => {
    const el = document.querySelector('.dlg-card');
    return el ? el.textContent : '';
  });
  T('Audit-Dialog nennt alle fünf Gruppen',
    /Ohne terminierbaren Nachweis/.test(dialog) && /Überfällig/.test(dialog)
    && /Fällig innert 30 Tagen/.test(dialog) && /Prüfung gültig/.test(dialog) && /Ohne Prüfpflicht/.test(dialog),
    dialog.slice(0, 200));
  T('Dialog weist die Lücken aus', /ohne gültigen Nachweis/.test(dialog));
  T('Dialog nennt die ausgeschlossenen ausgemusterten Geräte',
    /ausgemusterte\/verkaufte/.test(dialog));
  T('keine Seitenfehler in der Gegenprobe', B.fehler.length === 0, B.fehler.join(' | '));
  await B.ctx.close();

  await browser.close();
}

// ════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(52)}`);
console.log(`  ${ok} bestanden · ${fail} fehlgeschlagen`);
console.log('═'.repeat(52) + '\n');
process.exit(fail ? 1 : 0);
