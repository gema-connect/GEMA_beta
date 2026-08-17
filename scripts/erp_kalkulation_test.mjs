// Kalkulations-Assistent im ERP (pm_erp.html) — Drift-Guard.
//
// Referenz ist die NPK-Systematik von OF-4000, gegen eine REALE Offerte
// verifiziert (Jäggi-Vollmer, Kapitel 361):
//   361.131  1.7 + 0.25 + 0.25 + 0.2                       = 2.40 h
//            2.40 × 0.6 × 98.00 CHF/h                      = 141.12  (gedruckt 141.10)
//   361.133  1.1 + 0.15 + 0.25 + 0.75 + 0.35 + 0.35 + 0.2 + 0.5 = 3.65 h
//            3.65 × 0.6 × 98.00 CHF/h                      = 214.62  (gedruckt 214.65)
//   Lohnfaktor      (1 + 0.487 + 1.150) × 1.10             = 2.9007
//   Materialfaktor  (1 + 0.18)          × 1.10             = 1.298
// Soziallasten und Lohngemeinkosten werden ADDIERT, Risiko&Gewinn MULTIPLIZIERT.
//
// Teil A  Engine in Node (DOM-frei aus dem /*ENGINE-START*/-Block extrahiert)
// Teil B  Registrierung im Modul (Markup, Knöpfe, Marken, CSS)
// Teil C  Browser-Durchlauf (Playwright) — Modell anlegen, Zielwahl, Übernehmen
//
//   node scripts/erp_kalkulation_test.mjs
//   CHROME=<chromium> node scripts/erp_kalkulation_test.mjs      (mit Teil C)
//
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'pm_erp.html'), 'utf8');

let ok = 0, fail = 0;
function t(name, cond, info) {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}
function near(a, b, tol) { return a != null && isFinite(a) && Math.abs(a - b) <= (tol == null ? 1e-9 : tol); }

// ═══════════════════════════════════════════════════════════
// TEIL A — Engine
// ═══════════════════════════════════════════════════════════
const em = SRC.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!em) { console.error('ENGINE-Block fehlt in pm_erp.html'); process.exit(1); }
const E = {};
new Function('S', em[1] + `
S.erpNum=erpNum; S.erpKalkArtOk=erpKalkArtOk; S.erpKalkKapitel=erpKalkKapitel;
S.erpKalkLohnfaktor=erpKalkLohnfaktor; S.erpKalkMaterialfaktor=erpKalkMaterialfaktor;
S.erpKalkVerkaufslohn=erpKalkVerkaufslohn; S.erpKalkVlQuelle=erpKalkVlQuelle;
S.erpKalkZeitSumme=erpKalkZeitSumme; S.erpKalkZeitProzent=erpKalkZeitProzent;
S.erpKalkPos=erpKalkPos; S.erpPosIstNpk=erpPosIstNpk; S.erpPosFixiert=erpPosFixiert;
S.erpPosAbweichung=erpPosAbweichung; S.erpKalkMatQuelle=erpKalkMatQuelle;
S.erpKalkMatBasis=erpKalkMatBasis; S.erpKalkZeiten=erpKalkZeiten; S.erpKalkKapNr=erpKalkKapNr;
S.erpKalkPlan=erpKalkPlan; S.erpKalkAnwenden=erpKalkAnwenden; S.erpDocTotals=erpDocTotals;
`)(E);

console.log('— A1  Faktoren (die beiden Formeln, gegen OF-4000 verifiziert) —');
const M = { id: 'm1', name: 'Akkord 100 %', verkaufslohn: 98, soziallastenPct: 48.7, lohnGkPct: 115.0,
            risikoGewinnPct: 10, materialGkPct: 18, einkaufsrabattPct: 0, zeitfaktorPct: 60, kapitel: [] };
t('Lohnfaktor = (1+SL+LGK)×(1+R&G) = 2.9007', near(E.erpKalkLohnfaktor(M), 2.9007, 1e-9));
t('Materialfaktor = (1+MGK)×(1+R&G) = 1.298', near(E.erpKalkMaterialfaktor(M), 1.298, 1e-12));
t('SL und LGK werden ADDIERT, nicht multipliziert',
  !near(E.erpKalkLohnfaktor(M), (1 + 0.487) * (1 + 1.15) * 1.10, 1e-6));
t('R&G wirkt MULTIPLIKATIV (ohne R&G = 2.637)',
  near(E.erpKalkLohnfaktor(Object.assign({}, M, { risikoGewinnPct: 0 })), 2.637, 1e-12));
t('leeres Modell → beide Faktoren 1.0',
  near(E.erpKalkLohnfaktor({}), 1) && near(E.erpKalkMaterialfaktor({}), 1));

console.log('— A2  Verkaufslohn: gesetzt gewinnt vor Herleitung —');
t('gesetzter Verkaufslohn wird genommen', near(E.erpKalkVerkaufslohn(M), 98));
t('Quelle «direkt»', E.erpKalkVlQuelle(M) === 'direkt');
const Mh = Object.assign({}, M, { verkaufslohn: '', nettolohn: 42 });
t('ohne Verkaufslohn: Nettolohn × Lohnfaktor', near(E.erpKalkVerkaufslohn(Mh), 42 * 2.9007, 1e-9));
t('Quelle «hergeleitet»', E.erpKalkVlQuelle(Mh) === 'hergeleitet');
t('beides leer → 0 und Quelle «fehlt»',
  E.erpKalkVerkaufslohn({}) === 0 && E.erpKalkVlQuelle({}) === 'fehlt');

console.log('— A3  Leitfadenzeit: Komponenten EINZELN, nie als Summe —');
const Z1 = [1.7, 0.25, 0.25, 0.2];
const Z2 = [1.1, 0.15, 0.25, 0.75, 0.35, 0.35, 0.2, 0.5];
t('361.131 Summe = 2.40 h', near(E.erpKalkZeitSumme(Z1), 2.40, 1e-9));
t('361.133 Summe = 3.65 h', near(E.erpKalkZeitSumme(Z2), 3.65, 1e-9));
t('benannte Form [{bez,h}] wird gleich gerechnet',
  near(E.erpKalkZeitSumme([{ bez: 'Grundzeit', h: 1.7 }, { bez: 'Montage', h: 0.7 }]), 2.40, 1e-9));
t('einzelner Wert statt Liste bleibt lesbar', near(E.erpKalkZeitSumme(2.4), 2.40, 1e-9));
t('null/leer → 0', E.erpKalkZeitSumme(null) === 0 && E.erpKalkZeitSumme([]) === 0);

console.log('— A4  Referenzfälle gegen die reale Offerte —');
const r131 = E.erpKalkPos(M, { zeiten: Z1, materialBasis: 0 });
t('361.131: 2.40 h × 0.6 = 1.44 h wirksam', near(r131.zeitEff, 1.44, 1e-9));
t('361.131: Lohn = 141.12 CHF', near(r131.lohn, 141.12, 1e-9));
t('361.131: EP = Lohn (kein Material)', near(r131.ep, r131.lohn));
const r133 = E.erpKalkPos(M, { zeiten: Z2, materialBasis: 0 });
t('361.133: 3.65 h × 0.6 = 2.19 h wirksam', near(r133.zeitEff, 2.19, 1e-9));
t('361.133: Lohn = 214.62 CHF', near(r133.lohn, 214.62, 1e-9));
t('Zeitfaktor 100 % → volle Leitfadenzeit',
  near(E.erpKalkPos(Object.assign({}, M, { zeitfaktorPct: 100 }), { zeiten: Z1 }).lohn, 2.40 * 98, 1e-9));

console.log('— A5  Materialstrang: Einkaufsrabatt NEBEN dem Faktor —');
const rm = E.erpKalkPos(M, { zeiten: [], materialBasis: 100, einkaufsrabattPct: 12 });
t('100 × (1−0.12) × 1.298 = 114.224', near(rm.material, 114.224, 1e-9));
t('Materialfaktor bleibt 1.298 — der Rabatt steckt NICHT darin', near(rm.materialfaktor, 1.298, 1e-12));
t('Rabatt getrennt ausgewiesen', near(rm.einkaufsrabattPct, 12) && near(rm.materialNetto, 88, 1e-9));
t('Modell-Rabatt greift ohne Positions-Angabe',
  near(E.erpKalkPos(Object.assign({}, M, { einkaufsrabattPct: 12 }), { materialBasis: 100 }).material, 114.224, 1e-9));
t('EP = Lohn + Material (beide Stränge)',
  near(E.erpKalkPos(M, { zeiten: Z1, materialBasis: 100 }).ep, 141.12 + 129.8, 1e-9));

console.log('— A6  Kapitel-Abweichung des Materialfaktors —');
const Mk = Object.assign({}, M, { kapitel: [{ nr: '426', materialGkPct: 25 }] });
t('Kapitel 426 → (1+0.25)×1.10 = 1.375', near(E.erpKalkMaterialfaktor(Mk, '426'), 1.375, 1e-12));
t('anderes Kapitel → allgemeiner Satz 1.298', near(E.erpKalkMaterialfaktor(Mk, '491'), 1.298, 1e-12));
t('ohne Kapitel-Angabe → allgemeiner Satz', near(E.erpKalkMaterialfaktor(Mk), 1.298, 1e-12));
t('Kapitel-Nr toleriert Leerzeichen', E.erpKalkKapitel(Mk, ' 426 ') != null);
t('Kapitel mit leerem MGK übersteuert NICHT',
  near(E.erpKalkMaterialfaktor({ materialGkPct: 18, risikoGewinnPct: 10, kapitel: [{ nr: '426', materialGkPct: '' }] }, '426'), 1.298, 1e-12));

console.log('— A7  Rechenblatt: jede Zeile nachvollziehbar —');
const rb = E.erpKalkPos(M, { zeiten: Z1, materialBasis: 100, einkaufsrabattPct: 12 });
t('Schritte für beide Stränge vorhanden',
  rb.schritte.some(s => s.grp === 'lohn') && rb.schritte.some(s => s.grp === 'material'));
t('erste Lohn-Zeile nennt die Zeit-Komponenten einzeln',
  /1\.7 \+ 0\.25 \+ 0\.25 \+ 0\.2/.test(rb.schritte.find(s => s.grp === 'lohn').formel));
t('jede Schritt-Zeile hat Beschriftung und Wert',
  rb.schritte.every(s => typeof s.lbl === 'string' && s.lbl && isFinite(s.wert)));
t('Rabatt-Schritt erscheint nur bei gesetztem Rabatt',
  rb.schritte.some(s => /Einkaufsrabatt/.test(s.lbl)) &&
  !E.erpKalkPos(M, { materialBasis: 100 }).schritte.some(s => /Einkaufsrabatt/.test(s.lbl)));
t('Zeitfaktor-Schritt entfällt bei 100 %',
  !E.erpKalkPos(Object.assign({}, M, { zeitfaktorPct: 100 }), { zeiten: Z1 }).schritte.some(s => /Zeitfaktor/.test(s.lbl)));

console.log('— A8  Fixierung: freie Positionen sind ab Werk fixiert —');
t('freie Position (kein NPK) = fixiert', E.erpPosFixiert({ id: 'a', art: 'frei', ep: 50 }) === true);
t('DataSelect-Position = fixiert', E.erpPosFixiert({ id: 'b', produktId: 'ds:123', ep: 50 }) === true);
t('NPK-Position = NICHT fixiert', E.erpPosFixiert({ id: 'c', npk: { nr: '361.131', kat: '361' } }) === false);
t('p.fixiert=false übersteuert die Vorgabe', E.erpPosFixiert({ id: 'd', art: 'frei', fixiert: false }) === false);
t('p.fixiert=true übersteuert auch bei NPK', E.erpPosFixiert({ id: 'e', npk: { nr: '1' }, fixiert: true }) === true);
t('erpPosIstNpk erkennt nur echte NPK-Angaben',
  E.erpPosIstNpk({ npk: { nr: '361.131' } }) && E.erpPosIstNpk({ npk: { kat: '426' } }) && !E.erpPosIstNpk({ npk: {} }) && !E.erpPosIstNpk({}));

console.log('— A9  Katalog-Abweichung wird NUR belegt behauptet —');
t('kein katalogEp → keine Behauptung', E.erpPosAbweichung({ ep: 80 }) === null);
t('gleicher Preis → keine Marke', E.erpPosAbweichung({ ep: 100, katalogEp: 100 }) === null);
const aA = E.erpPosAbweichung({ ep: 110, katalogEp: 100 });
t('aufgerechnet: +10.00 / +10 %', aA && near(aA.diff, 10) && near(aA.pct, 10));
const aB = E.erpPosAbweichung({ ep: 92, katalogEp: 100 });
t('reduziert: −8.00 / −8 %', aB && near(aB.diff, -8) && near(aB.pct, -8));
t('Rappen-Rauschen erzeugt keine Marke', E.erpPosAbweichung({ ep: 100.002, katalogEp: 100 }) === null);

console.log('— A10 Materialbasis-Kette (macht die Rechnung idempotent) —');
t('Reihenfolge kalk > npk > katalog > ep',
  E.erpKalkMatQuelle({ kalk: { materialBasis: 10 }, npk: { materialBasis: 20 }, katalogEp: 30, ep: 40 }) === 'kalk' &&
  E.erpKalkMatQuelle({ npk: { materialBasis: 20 }, katalogEp: 30, ep: 40 }) === 'npk' &&
  E.erpKalkMatQuelle({ katalogEp: 30, ep: 40 }) === 'katalog' &&
  E.erpKalkMatQuelle({ ep: 40 }) === 'ep');
t('ohne alles → «keine» und Basis 0',
  E.erpKalkMatQuelle({ art: 'frei' }) === 'keine' && E.erpKalkMatBasis({ art: 'frei' }) === 0);
// Zweimal rechnen darf NICHT zweimal aufschlagen
const pi = { id: 'p1', art: 'frei', menge: 1, ep: 100, fixiert: false };
let plA = E.erpKalkPlan({ positionen: [pi] }, M, null, {});
E.erpKalkAnwenden(plA.zeilen[0], M, 'test');
const epNach1 = pi.ep;
let plB = E.erpKalkPlan({ positionen: [pi] }, M, null, {});
E.erpKalkAnwenden(plB.zeilen[0], M, 'test');
t('erster Lauf: 100 × 1.298 = 129.80', near(epNach1, 129.80, 1e-9));
t('zweiter Lauf ändert NICHTS (idempotent)', near(pi.ep, 129.80, 1e-9));
t('Materialbasis bleibt der Ausgangswert 100', near(pi.kalk.materialBasis, 100, 1e-9));

console.log('— A11 Zeiten/Kapitel einer Position auflösen —');
t('Zeiten aus dem NPK', E.erpKalkZeiten({ npk: { zeiten: Z1 } }).length === 4);
t('Zeiten aus der letzten Kalkulation gewinnen',
  E.erpKalkZeiten({ kalk: { zeiten: [1] }, npk: { zeiten: Z1 } }).length === 1);
t('ohne beides → leere Liste', E.erpKalkZeiten({}).length === 0);
t('Kapitel-Nr aus dem NPK', E.erpKalkKapNr({ npk: { kat: '426' } }) === '426');

console.log('— A12 Plan: Zielwahl, Vorschau, nichts fällt still weg —');
const doc = { positionen: [
  { id: 'x1', art: 'frei', bez: 'A', menge: 2, ep: 100, fixiert: false },
  { id: 'x2', art: 'frei', bez: 'B', menge: 1, ep: 50 },                         // fixiert (Vorgabe)
  { id: 'x3', npk: { nr: '361.131', kat: '361', zeiten: Z1 }, bez: 'C', menge: 1, ep: 0 },
  { id: 'x4', art: 'titel', bez: 'Kapitel' },
  { id: 'x5', art: 'text', bez: 'Hinweis' },
  { id: 'x6', art: 'rabatt', modus: 'pct', wert: 5 },
  { id: 'x7', art: 'frei', bez: 'V', menge: 1, ep: 30, fixiert: false, variante: true },
  { id: 'x8', art: 'frei', bez: 'leer', menge: 1, ep: 0, fixiert: false }
] };
const pAlle = E.erpKalkPlan(doc, M, null, {});
t('Titel/Text/Rabatt sind keine Kalkulationsziele',
  !pAlle.zeilen.concat(pAlle.uebersprungen.map(u => ({ pos: u.pos }))).some(z => ['titel', 'text', 'rabatt'].indexOf(z.pos.art) >= 0));
t('fixierte Position wird übersprungen und BENANNT',
  pAlle.uebersprungen.some(u => u.pos.id === 'x2' && u.grund === 'fixiert'));
t('Variante wird übersprungen und benannt',
  pAlle.uebersprungen.some(u => u.pos.id === 'x7' && u.grund === 'variante'));
t('Position ohne Zeiten UND ohne Basis wird benannt',
  pAlle.uebersprungen.some(u => u.pos.id === 'x8' && u.grund === 'ohne_basis') && pAlle.ohneBasis === 1);
t('gerechnet werden x1 (Material) und x3 (NPK-Lohn)',
  pAlle.zeilen.length === 2 && pAlle.zeilen.map(z => z.pos.id).sort().join(',') === 'x1,x3');
t('Vorschau trägt alten UND neuen EP', pAlle.zeilen.every(z => 'epAlt' in z && 'epNeu' in z));
t('Summen über die Menge gerechnet',
  near(pAlle.zeilen.find(z => z.pos.id === 'x1').betragNeu, 129.80 * 2, 1e-9));
t('fixMit rechnet die fixierte Position mit',
  E.erpKalkPlan(doc, M, null, { fixMit: true }).zeilen.some(z => z.pos.id === 'x2'));
const pSel = E.erpKalkPlan(doc, M, ['x1'], {});
t('Zielwahl: nur die übergebene ID', pSel.zeilen.length === 1 && pSel.zeilen[0].pos.id === 'x1');
t('Zielwahl mit fixierter ID rechnet ohne fixMit nicht',
  E.erpKalkPlan(doc, M, ['x2'], {}).zeilen.length === 0);
t('Plan verändert das Dokument NICHT', doc.positionen[0].ep === 100 && !doc.positionen[0].kalk);

console.log('— A13 Anwenden: Herleitung wird mitgespeichert —');
const pz = { id: 'y1', art: 'frei', menge: 1, ep: 200, fixiert: false, npk: { kat: '426', zeiten: Z1, materialBasis: 100 } };
const plan13 = E.erpKalkPlan({ positionen: [pz] }, Mk, null, {});
E.erpKalkAnwenden(plan13.zeilen[0], Mk, 'Testerin');
t('EP auf 2 Rappen gerundet gesetzt', near(pz.ep, Math.round((141.12 + 137.5) * 100) / 100, 1e-9));
t('Zeiten EINZELN gespeichert (nicht als Summe)', Array.isArray(pz.kalk.zeiten) && pz.kalk.zeiten.length === 4);
t('Materialbasis und Einkaufsrabatt getrennt gespeichert',
  near(pz.kalk.materialBasis, 100) && pz.kalk.einkaufsrabattPct === 0);
t('Kapitel-Materialfaktor 1.375 gespeichert', near(pz.kalk.materialfaktor, 1.375, 1e-9));
t('Lohn und Material getrennt ausgewiesen', near(pz.kalk.lohn, 141.12, 1e-6) && near(pz.kalk.material, 137.5, 1e-6));
t('Modellname, Zeitpunkt und Person gespeichert',
  pz.kalk.modellName === 'Akkord 100 %' && !!pz.kalk.am && pz.kalk.von === 'Testerin');
t('fixiert wird AUSDRÜCKLICH auf false gesetzt (nicht gelöscht)', pz.fixiert === false);

console.log('— A14 Bestehende Dokument-Rechnung bleibt unberührt —');
const d14 = { positionen: [{ id: 'z1', art: 'frei', menge: 2, ep: 100, fixiert: false }], mwstPct: 8.1 };
const vor = E.erpDocTotals(d14).zwischen;
const pl14 = E.erpKalkPlan(d14, M, null, {});
t('Zwischentotal vor dem Anwenden unverändert', near(E.erpDocTotals(d14).zwischen, vor));
E.erpKalkAnwenden(pl14.zeilen[0], M, '');
t('Zwischentotal folgt danach dem neuen EP', near(E.erpDocTotals(d14).zwischen, 259.60, 1e-9));

// ═══════════════════════════════════════════════════════════
// TEIL B — Registrierung im Modul
// ═══════════════════════════════════════════════════════════
console.log('— B  Registrierung in pm_erp.html —');
t('Engine liegt IM ENGINE-Block (Node-testbar)', /function erpKalkPos\(/.test(em[1]));
t('kein DOM-Zugriff im Kalkulations-Teil der Engine',
  !/document\.|window\./.test(em[1].slice(em[1].indexOf('function erpKalkArtOk'))));
t('Dialog-Markup vorhanden', /id="kalkModal"/.test(SRC) && /id="kalkRechnen"/.test(SRC) && /id="kalkModelle"/.test(SRC));
t('Knopf in der Aktionsleiste', /onclick="erpKalkStart\(\)"[^>]*>🧮 Kalkulation|🧮 Kalkulation<\/button>/.test(SRC));
t('Kontextmenü: kalkulieren', /t:'Mit Modell kalkulieren'/.test(SRC));
t('Kontextmenü: fixieren/lösen', /'Fixierung aufheben':'Preis fixieren'/.test(SRC));
t('Kontextmenü: Rechenweg', /t:'Rechenweg anzeigen'/.test(SRC));
t('Marken in der Quelle-Spalte (🧮 / 🔒 / ▲▼)',
  /class="kalkb rech"/.test(SRC) && /class="kalkb fix"/.test(SRC) && /kalkb '\+\(auf\?'auf':'ab'\)/.test(SRC));
t('Quelle-Spalte rendert die Marken mit', /\+src\+kalkB\+fotoBtn/.test(SRC));
t('CSS für Marken und Dialog vorhanden',
  /\.pos \.kalkb\{/.test(SRC) && /\.kalk-tbl\{/.test(SRC) && /\.kalk-blatt\{/.test(SRC));
t('Modelle liegen ORG-WEIT (org.settings.erp.kalkModelle)',
  /s\.kalkModelle=/.test(SRC) && /settings&&erpOrg\(\)\.settings\.erp\)\|\|\{\};[\s\S]{0,120}kalkModelle/.test(SRC));
t('updateOrgSettings mit orgId als ERSTEM Argument',
  /GemaAuth\.updateOrgSettings\(org\.id,\{erp:s\}\)/.test(SRC.slice(SRC.indexOf('function erpKalkModelleSave'), SRC.indexOf('function erpKalkModelleSave') + 500)));
t('bestehende erp-Config wird gemergt (kein Feldverlust)',
  /Object\.assign\(\{\},\(org\.settings&&org\.settings\.erp\)\|\|\{\}\)/.test(SRC.slice(SRC.indexOf('function erpKalkModelleSave'), SRC.indexOf('function erpKalkModelleSave') + 500)));
t('Katalogpreis wird beim Einfügen gestempelt',
  /if\(p\.katalogEp==null&&erpNum\(p\.ep\)>0&&\(p\.produktId\|\|p\.eigenArtikelId\|\|p\.dsArtnr\)\)p\.katalogEp=erpNum\(p\.ep\)/.test(SRC));
t('Live-Vorschau der Faktoren zeichnet NUR die Faktor-Zeile nach (Fokus-Regel)',
  /function erpKalkModLive\(\)\{[\s\S]{0,200}km_fak/.test(SRC) && !/function erpKalkModLive\(\)\{[\s\S]{0,200}erpKalkRender\(\)/.test(SRC));
t('Lösch-Dialog mit focusCancel (Vorauswahl Nein)',
  /function erpKalkModDel[\s\S]{0,400}focusCancel:true/.test(SRC));
t('Vorgabe-Modell erfindet KEINE Prozentsätze',
  /function erpKalkModellNeu[\s\S]{0,400}soziallastenPct:'',lohnGkPct:''/.test(SRC));
t('Anwenden schreibt einen Verlaufs-Eintrag', /erpVerlauf\(cur,'Kalkuliert: '/.test(SRC));
// Die Marken teilen sich die Quelle-Spalte mit Herkunfts-Badge und 📷. Ihre
// Breite steht NUR in ERP_POSCOLS — die Kopfzeile trug sie früher zusätzlich
// als feste Zahl im Markup und lief bei jeder Änderung still auseinander.
t('Spaltenbreiten stehen nur in ERP_POSCOLS (keine zweite Wahrheit im <th>)',
  !/<th[^>]*style="width:\d+px"[^>]*>(Pos\.|Quelle|Betrag)</.test(SRC) &&
  /function _pcW\(id\)\{var c=erpPosColById\(id\)/.test(SRC));
// Die Editor-Tabelle füllt ihr Fenster bereits exakt aus (Bezeichnung ist per
// --pos-bezw gepinnt) — die Quelle-Spalte darf darum nur wachsen, wenn die
// Zahlenspalten dieselbe Breite abgeben.
t('Summe der Standard-Spaltenbreiten unverändert (kein neuer Rollbalken)', (function () {
  const reg = SRC.slice(SRC.indexOf('var ERP_POSCOLS='), SRC.indexOf('var ERP_POSCOLS_DEFAULT'));
  const std = ['posnr', 'quelle', 'menge', 'einheit', 'ep', 'betrag'];
  let sum = 0;
  std.forEach(id => { const m = reg.match(new RegExp("id:'" + id + "'[^}]*edW:(\\d+)")); if (m) sum += +m[1]; });
  return sum === 512;   // 44+144+68+88+82+86 — Ausgangswert vor den Marken: 44+104+76+88+104+96
})());

// ═══════════════════════════════════════════════════════════
// TEIL C — Browser
// ═══════════════════════════════════════════════════════════
let server = null, browser = null;
try {
  const { startServer, newPage, seed, BASE } = await import('./rolematrix_harness.mjs');
  const { chromium } = await import('playwright-core');
  const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  server = await startServer();
  browser = await chromium.launch({ executablePath: CHROME });
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  // Auth-Function bejahen — sonst rollt gema_auth den optimistischen
  // In-Memory-Stand nach dem gescheiterten Cloud-Save wieder zurück und die
  // org-weite Modell-Ablage wäre im Test nicht prüfbar.
  await ctx.route('**/gema-auth**', r => r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }));

  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + '/pm_erp.html');
  await page.waitForTimeout(1800);

  console.log('— C1  Boot und Dialog —');
  t('Seite bootet ohne Fehler', errors.length === 0, errors[0]);
  // Beleg mit drei Positionen anlegen (direkt im Zustand — der Editor rendert daraus)
  await page.evaluate(() => {
    cur = { id: 'dtest', typ: 'offerte', nr: 'OF-TEST', status: 'entwurf', orgId: 'org_test',
      datum: new Date().toISOString().slice(0, 10), mwstPct: 8.1, positionen: [
        { id: 'p1', art: 'frei', bez: 'Katalogartikel', menge: 2, einheit: 'Stk', ep: 100, katalogEp: 100, produktId: 'ds:1' },
        { id: 'p2', art: 'frei', bez: 'Rohrleitung NPK', menge: 1, einheit: 'm', ep: 0,
          npk: { nr: '361.131', kat: '361', zeiten: [1.7, 0.25, 0.25, 0.2], materialBasis: 40 } },
        { id: 'p3', art: 'frei', bez: 'Handeingabe', menge: 1, einheit: 'Stk', ep: 60 }
      ], schluss: [] };
    erpOpenEditor();
  });
  await page.waitForTimeout(500);
  t('Editor offen', await page.locator('#edOv.open').count() === 1);
  t('🧮-Knopf in der Aktionsleiste', (await page.locator('#edFt button:has-text("Kalkulation")').count()) === 1);
  t('freie Positionen zeigen die 🔒-Marke',
    (await page.locator('#posBody .kalkb.fix').count()) >= 2);
  t('NPK-Position ist NICHT fixiert (🔓)',
    await page.evaluate(() => erpPosFixiert(cur.positionen.find(p => p.id === 'p2')) === false));

  console.log('— C2  Modell org-weit anlegen —');
  await page.locator('#edFt button:has-text("Kalkulation")').click();
  await page.waitForTimeout(350);
  t('Dialog offen', await page.locator('#kalkModal.open').count() === 1);
  t('ohne Modell startet der Reiter «Modelle»',
    await page.evaluate(() => document.getElementById('kalkModelle').style.display !== 'none'));
  await page.locator('#kalkModelle button:has-text("Neues Modell")').click();
  await page.waitForTimeout(250);
  await page.fill('#km_name', 'Akkord 100 %');
  await page.fill('#km_vl', '98');
  await page.fill('#km_sl', '48.7');
  await page.fill('#km_gk', '115');
  await page.fill('#km_rg', '10');
  await page.fill('#km_mgk', '18');
  await page.fill('#km_zf', '60');
  await page.locator('#km_fak').evaluate(el => el.scrollIntoView());
  await page.evaluate(() => erpKalkModLive());
  t('Faktoren erscheinen live beim Erfassen',
    /2\.9007/.test(await page.locator('#km_fak').innerText()) && /1\.298/.test(await page.locator('#km_fak').innerText()));
  await page.locator('#kalkModelle button:has-text("Speichern")').click();
  await page.waitForTimeout(400);
  t('Modell liegt in org.settings.erp.kalkModelle',
    await page.evaluate(() => {
      const o = GemaAuth.getCurrentOrg();
      return !!(o && o.settings && o.settings.erp && (o.settings.erp.kalkModelle || []).some(m => m.name === 'Akkord 100 %'));
    }));
  t('bestehende erp-Einstellungen überleben das Speichern',
    await page.evaluate(() => {
      const s = GemaAuth.getCurrentOrg().settings.erp;
      return s.kalkModelle.length === 1 && typeof s === 'object';
    }));

  console.log('— C3  Zielwahl (0 / 1 / mehrere markiert) —');
  await page.locator('#ktRech').click();
  await page.waitForTimeout(300);
  let txt = await page.locator('#kalkRechnen').innerText();
  t('ohne Markierung: Hinweis + Wahl «Alle Positionen»', /Alle Positionen/.test(txt) && /nichts markiert/i.test(txt));
  // Spaltenköpfe stehen per CSS in Versalien — innerText gibt sie so zurück
  t('aktueller EP steht als Vergleich in der Vorschau', /EP aktuell/i.test(txt) && /EP neu/i.test(txt));
  t('fixierte Positionen werden benannt statt still übergangen', /fixiert/i.test(txt));
  // Eine markieren
  await page.evaluate(() => { erpKalkClose(); _selIds = ['p1']; _selAnchor = 'p1'; erpApplySelClasses(); erpKalkStart(); });
  await page.waitForTimeout(350);
  txt = await page.locator('#kalkRechnen').innerText();
  t('1 markiert → gefragt: nur die markierte ODER alle',
    /Nur die markierte Position/.test(txt) && /Alle Positionen/.test(txt));
  // Zwei markieren
  await page.evaluate(() => { erpKalkClose(); _selIds = ['p1', 'p3']; _selAnchor = 'p3'; erpApplySelClasses(); erpKalkStart(); });
  await page.waitForTimeout(350);
  txt = await page.locator('#kalkRechnen').innerText();
  t('≥2 markiert → eindeutig, keine Rückfrage',
    /2 Positionen markiert/.test(txt) && !/Alle Positionen/.test(txt));

  console.log('— C4  Fixierung und Übernehmen —');
  // p1 und p3 sind fixiert → ohne «mitrechnen» passiert nichts
  t('fixierte Auswahl: Übernehmen-Knopf zählt 0',
    /0 Positionen übernehmen/.test(await page.locator('#kalkFt').innerText()));
  await page.locator('#kalkRechnen input[type=checkbox]').check();
  await page.waitForTimeout(300);
  t('«Fixierte mitrechnen» schaltet beide frei',
    /2 Positionen übernehmen/.test(await page.locator('#kalkFt').innerText()));
  const vorschau = await page.evaluate(() => {
    const pl = erpKalkPlan(cur, erpKalkModelle()[0], ['p1', 'p3'], { fixMit: true });
    return pl.zeilen.map(z => ({ id: z.pos.id, alt: z.epAlt, neu: Math.round(z.epNeu * 100) / 100 }));
  });
  t('Vorschau p1: 100 → 129.80', vorschau.find(z => z.id === 'p1').neu === 129.80);
  t('Vorschau p3: 60 → 77.88', vorschau.find(z => z.id === 'p3').neu === 77.88);
  await page.locator('#kalkFt button:has-text("übernehmen")').click();
  await page.waitForTimeout(500);
  t('Dialog geschlossen', await page.locator('#kalkModal.open').count() === 0);
  t('EP von p1 übernommen', await page.evaluate(() => cur.positionen.find(p => p.id === 'p1').ep) === 129.80);
  t('Herleitung gespeichert',
    await page.evaluate(() => { const k = cur.positionen.find(p => p.id === 'p1').kalk; return !!(k && k.modellName && k.materialfaktor === 1.298 && k.materialBasis === 100); }));
  t('nicht gewählte Position p2 unverändert',
    await page.evaluate(() => cur.positionen.find(p => p.id === 'p2').ep) === 0);
  t('🧮-Marke erscheint an den kalkulierten Zeilen',
    (await page.locator('#posBody .kalkb.rech').count()) === 2);
  // Die Marke ist ein Hinweis und darf gerundet sein — der EXAKTE Prozentsatz
  // und die beiden Frankenbeträge müssen aber vollständig im Tooltip stehen,
  // sonst wäre es eine stille Kürzung.
  t('Abweichungs-Marke zeigt die Aufrechnung gegenüber dem Katalogpreis',
    /▲\+30 ?%/.test(await page.locator('#posBody').innerText()));
  const abwTitel = await page.locator('#posBody .kalkb.auf').first().getAttribute('title');
  t('Tooltip nennt Katalogpreis, aktuellen Preis und den exakten Prozentsatz',
    /100\.00/.test(abwTitel) && /129\.80/.test(abwTitel) && /29\.8 %/.test(abwTitel));
  // Die Marken dürfen die Zeile nicht auftürmen: höchstens zwei Zeilen in der
  // Quelle-Spalte, und die Tabelle darf dafür nicht waagrecht scrollen.
  const lay = await page.evaluate(() => {
    const w = document.querySelector('.pos-wrap');
    let max = 0;
    document.querySelectorAll('#posBody .kalkb.rech').forEach(b => {
      const grp = b.parentElement;
      // align-items:center → gleich hohe Zeile, aber je Element ein anderes
      // offsetTop. Zeilen darum über die MITTE clustern.
      const mitten = [...grp.children].map(k => Math.round(k.offsetTop + k.offsetHeight / 2));
      const zeilen = [];
      mitten.forEach(m => { if (!zeilen.some(z => Math.abs(z - m) < 8)) zeilen.push(m); });
      max = Math.max(max, zeilen.length);
    });
    return { zeilen: max, scroll: w.scrollWidth - w.clientWidth };
  });
  t('Marken-Gruppe bleibt bei höchstens zwei Zeilen', lay.zeilen > 0 && lay.zeilen <= 2);
  t('Positionstabelle scrollt deswegen nicht waagrecht', lay.scroll <= 1);

  console.log('— C5  Fixierungs-Toggle und Rechenweg —');
  await page.evaluate(() => erpPosFixToggle(1));   // p2 (NPK, nicht fixiert) → fixieren
  await page.waitForTimeout(250);
  t('Toggle fixiert die NPK-Position', await page.evaluate(() => cur.positionen[1].fixiert === true));
  await page.evaluate(() => erpPosFixToggle(1));
  await page.waitForTimeout(250);
  t('Toggle speichert false AUSDRÜCKLICH (nicht delete)',
    await page.evaluate(() => cur.positionen[1].fixiert === false));
  await page.evaluate(() => erpPosKalkInfo(0));
  await page.waitForTimeout(350);
  const dlg = await page.locator('.gema-dlg-bg').innerText().catch(() => '');
  t('Rechenweg-Dialog zeigt Materialbasis und Faktor', /Materialbasis/.test(dlg) && /Materialfaktor/.test(dlg));
  t('Rechenweg nennt das verwendete Modell', /Akkord 100 %/.test(dlg));

  console.log('— C6  Zweiter Lauf ändert nichts (Idempotenz im UI) —');
  const epVor = await page.evaluate(() => cur.positionen.find(p => p.id === 'p1').ep);
  await page.evaluate(() => {
    const m = erpKalkModelle()[0];
    const pl = erpKalkPlan(cur, m, ['p1'], { fixMit: true });
    pl.zeilen.forEach(z => erpKalkAnwenden(z, m, 'test'));
  });
  t('EP bleibt bei ' + epVor, await page.evaluate(() => cur.positionen.find(p => p.id === 'p1').ep) === epVor);
  t('keine JS-Fehler im ganzen Durchlauf', errors.length === 0, errors[0]);
  await ctx.close();
} catch (e) {
  console.log('  ⓘ Teil C übersprungen (' + String(e.message || e).slice(0, 90) + ')');
  console.log('    Browser-Prüfung: CHROME=<chromium> node scripts/erp_kalkulation_test.mjs');
} finally {
  if (browser) await browser.close();
  if (server) server.close();
}

console.log('\n' + (fail ? '✗ ' + fail + ' Fehler' : '✓ alles grün') + '  (' + ok + ' Checks)');
process.exit(fail ? 1 : 0);
