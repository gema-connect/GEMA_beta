// Drift-Guard — ERP-Migration: Belegpositionen und Kleinigkeiten aus dem
// Review vom 2026-09-08 (Punkte C8–C10, D12–D14).
//
//   C8  Zuschlags-/Rabattpositionen: pm_erp rechnet sie allein aus wert/modus
//       (erpAufschlagBetrag). Der Import schrieb menge/ep — im Beleg ergab
//       das 0, und die Summenkontrolle des Imports merkte nichts, weil sie
//       ep×menge zählte.
//   C9  Importierte Zeiteinträge tragen nur eine Dauer (dauerMin). Drei
//       Module lasen nur von/bis und zeigten 0 h.
//   C10 Kondition ohne Frist: keine erfundenen 30 Tage — und pm_erp darf aus
//       «leer» keine 0 Tage machen.
//   D12 Bezugspersonen: Objekt-Vergleich beidseitig über objektSchluessel.
//   D13 belegBrutto delegiert an pm_erp, wenn geladen.
//   D14 bestehendeKreditoren/Kataloge = poolEigene.
//
// Aufruf:  node scripts/erp_belege_fixes_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  t(name + (ok ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)), ok);
}
function speicher() {
  const m = {};
  return { getItem: k => (m[k] == null ? null : m[k]), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
}
let orgSettingsGespeichert = null;
const AUTH = {
  getCurrentUser: () => ({ id: 'u_admin', orgId: 'org1', name: 'Admin' }),
  getUsers: () => [{ id: 'u_meier', name: 'Hans Meier', orgId: 'org1', active: true }],
  getCurrentOrg: () => ({ id: 'org1', settings: {} }),
  updateOrgSettings: (orgId, settings) => { orgSettingsGespeichert = { orgId, settings }; return true; }
};
function ladeImporter(ls) {
  const win = {};
  ['gema_erp_adressen.js', 'gema_erp_import.js'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    new Function('window', 'localStorage', 'GemaSync', 'GemaAuth', 'GemaObjekte', 'DOMParser', src)(
      win, ls, undefined, AUTH, undefined, undefined);
    if (win.GemaAdressen) globalThis.GemaAdressen = win.GemaAdressen;
  });
  return { I: win.GemaErpImport, win };
}
const { I, win } = ladeImporter(speicher());
function zeile(sekId, kopf, werte) {
  const map = I.erkenneMapping(kopf, sekId);
  return I.normalisiereZeile(werte, map, sekId);
}
const srcImp = fs.readFileSync(path.join(ROOT, 'gema_erp_import.js'), 'utf8');

console.log('\n═══ C8 — Zuschlag/Rabatt als wert/modus, nicht als menge/ep ═══');
{
  const kopf = ['module_id', 'item_id', 'belegnr', 'postyp', 'bezeichnung', 'menge', 'einheit', 'ep'];
  const zu = I.positionRecord(zeile('positionen', kopf, ['4', '1', '2026.0001', '27', 'Kleinmaterialzuschlag', '', '', '350']));
  eq('postyp 27 → art zuschlag', zu.art, 'zuschlag');
  eq('modus chf', zu.modus, 'chf');
  eq('wert = Betrag', zu.wert, 350);
  t('KEIN ep/menge am Zuschlag (pm_erp läse sie nie)', zu.ep === undefined && zu.menge === undefined);
  const ra = I.positionRecord(zeile('positionen', kopf, ['4', '1', '2026.0001', '27', 'Nachlass', '', '', '-120']));
  eq('negativer Zuschlag wird zum Rabatt', ra.art, 'rabatt');
  eq('mit positivem Wert (GEMA zieht rabatt ab)', ra.wert, 120);
  const fr = I.positionRecord(zeile('positionen', kopf, ['4', '1', '2026.0001', '11', 'Waschtisch', '3', 'Stk', '284.50']));
  eq('normale Position unverändert: menge', fr.menge, 3);
  eq('… ep', fr.ep, 284.5);
  t('… ohne wert/modus', fr.wert === undefined && fr.modus === undefined);
}
{
  // Summenkontrolle rechnet, wie pm_erp rechnet.
  const pos = [
    { art: 'frei', menge: 2, ep: 100 },
    { art: 'zuschlag', modus: 'chf', wert: 50 },
    { art: 'rabatt', modus: 'chf', wert: 30 },
    { art: 'titel', bez: 'Kapitel' }
  ];
  eq('positionenNetto: 200 + 50 − 30', I.positionenNetto(pos), 220);
  // Gegenprobe: ein Zuschlag in der ALTEN Form (menge/ep) zählt nicht mehr —
  // genau so wenig, wie pm_erp ihn zeigen würde.
  eq('Gegenprobe: Zuschlag mit menge/ep zählt 0', I.positionenNetto([{ art: 'zuschlag', menge: 1, ep: 350 }]), 0);
}

console.log('\n═══ D13 — belegBrutto delegiert an pm_erp ═══');
{
  const doc = { positionen: [{ art: 'frei', menge: 1, ep: 1000 }], mwstPct: 8.1 };
  eq('ohne pm_erp: eigener Fallback (1000 × 1.081)', I.belegBrutto(doc), 1081);
  win.erpDocTotals = () => ({ brutto: 973.8 });
  eq('mit pm_erp: dessen Brutto gewinnt', I.belegBrutto(doc), 973.8);
  delete win.erpDocTotals;
  eq('importSumme schlägt beides', I.belegBrutto({ importSumme: { brutto: 55 }, positionen: doc.positionen }), 55);
}

console.log('\n═══ C10 — Kondition ohne Frist: kein erfundener Wert, keine 0 Tage ═══');
{
  const kopf = ['shortcut', 'description', 'days_netto'];
  const map = I.erkenneMapping(kopf, 'zahlbed');
  const plan = I.vorbereiten({ sektion: 'zahlbed', rows: [['05', 'Sonderkondition', '']], mapping: map });
  const hin = plan.zeilen[0].hinweise;
  t('die Vorschau kündigt den Firmen-Standard an', hin.some(h => /Firmen-Standard/.test(h.text)));
  const rep = await I.ausfuehren(plan, {});
  eq('eine Kondition angelegt', rep.neu, 1);
  const liste = orgSettingsGespeichert && orgSettingsGespeichert.settings.erp.zahlbed;
  t('gespeichert', Array.isArray(liste) && liste.length === 1);
  t('tage bleibt leer (null), nicht 30', liste[0].tage === null);
  // pm_erp darf aus «leer» keine 0 Tage machen.
  const erp = fs.readFileSync(path.join(ROOT, 'pm_erp.html'), 'utf8');
  t('pm_erp fällt bei leerer Frist auf den Firmen-Standard zurück',
    /z\.tage!=null&&z\.tage!==''\)\?z\.tage:erpSettings\(\)\.fristTage/.test(erp));
  t('Gegenprobe: das alte `z.tage||0` ist weg', !/return z\?\(z\.tage\|\|0\)/.test(erp));
}

console.log('\n═══ D12 — Bezugspersonen: Objekt-Schlüssel beidseitig gleich ═══');
{
  const a = I.objektSchluessel({ extId: 'OBJ-4984' });
  const b = I.objektSchluessel({ extId: 'obj-4984' });
  t('Alt-ID mit Trennzeichen: beide Seiten treffen sich', a === b && a === 'ext:obj-4984');
  t('der Writer vergleicht über objektSchluessel auf BEIDEN Seiten',
    /objektSchluessel\(o\)===objektSchluessel\(\{extId:g\.extId\}\)/.test(srcImp));
  t('Gegenprobe: der alte Vergleich mit norm() ist weg', !/objektSchluessel\(o\)==='ext:'\+norm\(g\.extId\)/.test(srcImp));
}

console.log('\n═══ C9 — dauerMin in allen Modulen, die Zeiteinträge lesen ═══');
{
  const pruef = [
    ['pm_erp.html', /min=Math\.max\(0,parseInt\(en\.dauerMin,10\)\|\|0\)/],
    ['pm_einsatzplan.html', /min=Math\.max\(0,parseInt\(en\.dauerMin,10\)\|\|0\)/],
    ['sys_workspace.html', /return Math\.max\(0,parseInt\(e\.dauerMin,10\)\|\|0\)/],
    ['pm_stunden.html', /return Math\.max\(0,parseInt\(e\.dauerMin,10\)\|\|0\)/]
  ];
  pruef.forEach(([f, re]) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    t(f + ' liest dauerMin, wenn von/bis fehlen', re.test(src));
  });
}

console.log('\n═══ D14 — keine Kopien von poolEigene ═══');
{
  t('bestehendeKreditoren = poolEigene(KRED_POOL)', /function bestehendeKreditoren\(\)\{return poolEigene\(KRED_POOL\);\}/.test(srcImp));
  t('bestehendeKataloge = poolEigene(KAT_POOL)', /function bestehendeKataloge\(\)\{return poolEigene\(KAT_POOL\);\}/.test(srcImp));
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen'
                          : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
