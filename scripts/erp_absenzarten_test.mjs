// Drift-Guard — ERP-Migration: unbekannte Absenzarten werden eigene Typen
//
// Entscheid des Betriebs (2026-09-08): jede Absenzart des Altsystems, die GEMA
// nicht kennt (Kurs, Arztbesuch, Privat, «Bezahlte Absenzen» …), wird beim
// Import als EIGENE Absenzart der Stundenerfassung angelegt. Vorher fielen
// solche Tage als «Arbeitszeit mit Vermerk» durch — und im Terminplan als
// Abwesenheit ohne Typ.
//
// Geprüft am fertigen Datensatz UND an den Firmen-Einstellungen:
//   - Typ wird in org.settings.stunden.eigeneAbsenzen angelegt (ID wie
//     stEaSlug in pm_stunden, Regeln bewusst «aus», als importiert markiert)
//   - der Tag trägt den neuen Typ, kein Arbeitseintrag daneben
//   - Arbeit («Werkstatt») und Feiertage bekommen KEINEN Typ
//   - zweiter Lauf legt nichts doppelt an, die Vorschau kennt den Typ
//   - Termine tragen den Typ als Vermerk
//
// Aufruf:  node scripts/erp_absenzarten_test.mjs
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
// Firmen-Einstellungen, die der Import beschreibt und beim nächsten Lauf liest
let orgSettings = {};
const orgCalls = [];
const AUTH = {
  getCurrentUser: () => ({ id: 'u_admin', orgId: 'org1', name: 'Admin' }),
  getUsers: () => [{ id: 'u_meier', name: 'Hans Meier', orgId: 'org1', active: true }],
  getCurrentOrg: () => ({ id: 'org1', settings: orgSettings }),
  updateOrgSettings: (orgId, patch) => { orgSettings = Object.assign({}, orgSettings, patch); orgCalls.push(patch); return true; }
};
function ladeImporter(ls) {
  const win = {};
  ['gema_erp_adressen.js', 'gema_erp_import.js'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    new Function('window', 'localStorage', 'GemaSync', 'GemaAuth', 'GemaObjekte', 'DOMParser', src)(
      win, ls, undefined, AUTH, undefined, undefined);
    if (win.GemaAdressen) globalThis.GemaAdressen = win.GemaAdressen;
  });
  return win.GemaErpImport;
}
async function lauf(I, sekId, kopf, rows) {
  const map = I.erkenneMapping(kopf, sekId);
  const plan = I.vorbereiten({ sektion: sekId, rows, mapping: map });
  return { plan, rep: await I.ausfuehren(plan, {}) };
}
const ST_POOL = 'gema_std_pool_v1', EP_POOL = 'gema_einsatz_pool_v1';
const pool = (ls, k) => JSON.parse(ls.getItem(k) || '[]');
const K = ['arbname', 'datum', 'stunden', 'rappnr', 'arbtyp', 'absenz', 'quelle'];
const rows = [
  ['Hans Meier', '2026-04-01', '8', '', 'Kurs', 'Kurs', 'freigegeben'],
  ['Hans Meier', '2026-04-02', '2', '', 'Arztbesuch', 'Arztbesuch', 'freigegeben'],
  ['Hans Meier', '2026-04-02', '6', '8123', 'Montage', '', 'freigegeben'],
  ['Hans Meier', '2026-04-03', '8', '', 'Werkstatt', 'Werkstatt', 'freigegeben'],
  ['Hans Meier', '2026-04-06', '8', '', 'Bezahlte Absenzen', 'Bezahlte Absenzen', 'freigegeben'],
  ['Hans Meier', '2026-04-07', '8', '', 'Ferien', 'Ferien', 'freigegeben'],
  ['Hans Meier', '2026-04-08', '8', '', 'Feiertage', 'Feiertage', 'freigegeben']
];

console.log('\n═══ 1 — erster Lauf: drei neue Typen, richtig am Tag ═══');
const ls = speicher(); const I = ladeImporter(ls);
{
  const { plan, rep } = await lauf(I, 'stunden', K, rows);
  // Vorschau vor dem Anlegen: Hinweis statt Warnung, nichts ausgeschlossen
  const hinKurs = plan.zeilen[0].hinweise;
  t('Vorschau kündigt das Anlegen an', hinKurs.some(h => h.typ === 'info' && /eigene Absenzart/.test(h.text)));
  t('… und nichts wird als Fehler ausgeschlossen', !plan.zeilen.some(z => z.aktion === 'fehler'));
  eq('drei Typen angelegt, in Reihenfolge des Auftretens', rep.absenzartenNeu, ['Kurs', 'Arztbesuch', 'Bezahlte Absenzen']);
  const ea = (orgSettings.stunden || {}).eigeneAbsenzen || [];
  eq('IDs wie stEaSlug', ea.map(e => e.id), ['ea_kurs', 'ea_arztbesuch', 'ea_bezahlte_absenzen']);
  eq('Namen im Klartext', ea.map(e => e.name), ['Kurs', 'Arztbesuch', 'Bezahlte Absenzen']);
  t('Regeln bewusst aus, als importiert markiert',
    ea.every(e => e.fuelltAuf === false && e.keineVorholzeit === false && e.beantragbar === false && e.importiert === true));
  eq('Firmen-Einstellungen genau einmal geschrieben', orgCalls.length, 1);
  t('Gegenprobe: bekannte Typen (Ferien) und Feiertage werden NICHT angelegt',
    !ea.some(e => /ferien|feiertag/i.test(e.name)));
  t('… und Arbeit (Werkstatt) auch nicht', !ea.some(e => /werkstatt/i.test(e.name)));

  const p = pool(ls, ST_POOL);
  const tag = d => p.find(x => x.datum === d);
  eq('Kurs-Tag: Absenz mit neuem Typ', tag('2026-04-01').absenz && tag('2026-04-01').absenz.typ, 'ea_kurs');
  eq('Kurs-Tag: kein Arbeitseintrag daneben', (tag('2026-04-01').eintraege || []).length, 0);
  eq('Arztbesuch: Absenz 2 h + 6 h Arbeit', [tag('2026-04-02').absenz.typ, tag('2026-04-02').absenz.stunden, tag('2026-04-02').eintraege.map(e => e.dauerMin)],
    ['ea_arztbesuch', 2, [360]]);
  t('Werkstatt bleibt Arbeit ohne Absenz', !tag('2026-04-03').absenz && tag('2026-04-03').eintraege[0].dauerMin === 480);
  eq('Bezahlte Absenzen → eigener Typ', tag('2026-04-06').absenz.typ, 'ea_bezahlte_absenzen');
  eq('Ferien bleiben der eingebaute Typ', tag('2026-04-07').absenz.typ, 'ferien');
  t('Feiertag: kein Absenztyp, kein Arbeitseintrag (GEMA führt ihn im Kalender)',
    !tag('2026-04-08').absenz && (tag('2026-04-08').eintraege || []).every(e => e.importAbsenz === 'Feiertage'));
}

console.log('\n═══ 2 — zweiter Lauf: nichts doppelt, Vorschau kennt den Typ ═══');
{
  const { plan, rep } = await lauf(I, 'stunden', K, rows);
  t('keine neuen Typen', !rep.absenzartenNeu || rep.absenzartenNeu.length === 0);
  eq('Firmen-Einstellungen nicht erneut geschrieben', orgCalls.length, 1);
  eq('immer noch drei eigene Typen', orgSettings.stunden.eigeneAbsenzen.length, 3);
  t('Vorschau zeigt den vorhandenen Typ statt «kennt GEMA nicht»',
    plan.zeilen[0].hinweise.some(h => /ea_kurs/.test(h.text)) && !plan.zeilen[0].hinweise.some(h => /noch nicht/.test(h.text)));
  t('Pool unverändert (alle Tage übersprungen)', rep.uebersprungen >= 6);
}

console.log('\n═══ 3 — neue Sitzung: absenzArt kennt die Typen aus den Einstellungen ═══');
{
  const I2 = ladeImporter(speicher());
  // Vor vorbereiten ist die Map leer; vorbereiten lädt sie.
  const map = I2.erkenneMapping(K, 'stunden');
  const plan = I2.vorbereiten({ sektion: 'stunden', rows: [rows[0]], mapping: map });
  eq('Kurs wird direkt dem eigenen Typ zugeordnet', plan.zeilen[0].ziel.absenzTyp, 'ea_kurs');
  const a = I2.absenzArt('Kurs');
  t('absenzArt: erkannt, eigen', a.erkannt === true && a.eigen === true && a.typ === 'ea_kurs');
  t('auch über die ID selbst', I2.absenzArt('ea_kurs').typ === 'ea_kurs');
}

console.log('\n═══ 4 — Termine tragen den Typ als Vermerk ═══');
{
  const KT = ['guid', 'datum', 'von60', 'arbeit', 'arbname', 'absenz'];
  const { rep } = await lauf(I, 'termine', KT, [
    ['g1', '2026-04-09', '07:00', '', 'Hans Meier', 'Arztbesuch'],
    ['g2', '2026-04-10', '07:00', '', 'Hans Meier', 'Privat']
  ]);
  eq('«Privat» ist der vierte neue Typ', rep.absenzartenNeu, ['Privat']);
  const ev = pool(ls, EP_POOL);
  eq('beide als «Abwesend»', ev.map(e => e.typ), ['ferien', 'ferien']);
  eq('mit Absenztyp als Vermerk', ev.map(e => e.importAbsenzTyp), ['ea_arztbesuch', 'ea_privat']);
}

console.log('\n═══ 5 — Slug-Regeln ═══');
{
  const src = fs.readFileSync(path.join(ROOT, 'gema_erp_import.js'), 'utf8');
  t('Slug-Form entspricht stEaSlug (ea_, Umlaute, 24 Zeichen, Suffix bei Kollision)',
    /function absenzSlug\(name,vergeben\)/.test(src) && /\.slice\(0,24\)/.test(src) && /while\(vergeben\[sl\]\)sl=b\+'_'\+\(i\+\+\)/.test(src));
  const st = fs.readFileSync(path.join(ROOT, 'pm_stunden.html'), 'utf8');
  t('pm_stunden liest eigene Typen über die id (stdEigeneAbsenz)', /function stdEigeneAbsenz\(p,typ\)/.test(st));
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen'
                          : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
