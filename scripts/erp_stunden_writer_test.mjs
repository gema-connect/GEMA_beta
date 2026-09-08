// Drift-Guard — ERP-Migration: der Stunden-Writer am FERTIGEN Tagesrecord
//
// Die bisherigen Guards prüften die Bausteine einzeln (absenzArt, Dedupe-
// Schlüssel, Rang) — und waren grün, während der zusammengesetzte Tagesrecord
// falsch war. Dieser Guard treibt darum den echten Ablauf (vorbereiten →
// ausfuehren) mit einem Speicher-Mock und schaut, was im Pool liegt.
//
// Die vier Fehler, die er abfängt (Review 2026-09-08):
//   1. Absenz-Zeile lag als Tag-Absenz UND als Arbeitseintrag → +8 h/Tag.
//   2. Dedupe-Schlüssel mit Tätigkeit → Freigabe traf die mobile Zeile nie,
//      16 h statt 8; zweiter Lauf verdoppelte alle Einträge.
//   3. Reine Korrektur → return vor dem Speichern, Änderung weg.
//   4. Person ohne GEMA-Benutzer: Übertrag mit leerer userId gespeichert und
//      nie gemeldet (findeSachbearbeiter liefert nie null).
//
// Aufruf:  node scripts/erp_stunden_writer_test.mjs
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

// ── Mocks: echter In-Memory-Speicher, minimale Auth ────────────────────
function speicher() {
  const m = {};
  return {
    getItem: k => (m[k] == null ? null : m[k]),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    _m: m
  };
}
const AUTH = {
  getCurrentUser: () => ({ id: 'u_admin', orgId: 'org1', name: 'Admin' }),
  getUsers: () => [
    { id: 'u_meier', name: 'Hans Meier', orgId: 'org1', active: true },
    { id: 'u_ehemalig', name: 'Petra Weg', orgId: 'org1', active: false }
  ],
  getCurrentOrg: () => ({ id: 'org1', settings: {} }),
  updateOrgSettings: () => true
};
function ladeImporter(ls) {
  const win = {};
  // Der Adressstamm muss VOR dem Importer geladen sein: die Abschnitte mit
  // Zeilenschleife (Termine, Überträge) lesen ihn beim Start.
  ['gema_erp_adressen.js', 'gema_erp_import.js'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    new Function('window', 'localStorage', 'GemaSync', 'GemaAuth', 'GemaObjekte', 'DOMParser', src)(
      win, ls, undefined, AUTH, undefined, undefined);
    // Im Browser ist window.X ein Global; im Node-Wrapper nicht. Der Importer
    // spricht den Adressstamm als nacktes `GemaAdressen` an.
    if (win.GemaAdressen) globalThis.GemaAdressen = win.GemaAdressen;
  });
  return win.GemaErpImport;
}
const ST_POOL = 'gema_std_pool_v1';
function pool(ls, key) { return JSON.parse(ls.getItem(key || ST_POOL) || '[]'); }

async function lauf(I, sekId, kopf, rows) {
  const map = I.erkenneMapping(kopf, sekId);
  const plan = I.vorbereiten({ sektion: sekId, rows, mapping: map });
  return I.ausfuehren(plan, {});
}
const K = ['arbname', 'datum', 'stunden', 'rappnr', 'arbtyp', 'absenz', 'quelle'];

// ═══ 1 — Absenz-Tag ═══
{
  console.log('\n═══ 1 — Ferientag: Absenz am Tag, KEIN Arbeitseintrag ═══');
  const ls = speicher(); const I = ladeImporter(ls);
  const rep = await lauf(I, 'stunden', K, [['Hans Meier', '2026-03-03', '8', '', 'Ferien', 'Ferien', 'freigegeben']]);
  const p = pool(ls);
  eq('genau ein Tagesrecord', p.length, 1);
  eq('Absenz-Typ ferien', p[0].absenz && p[0].absenz.typ, 'ferien');
  eq('Absenz trägt ihren Stundenwert', p[0].absenz && p[0].absenz.stunden, 8);
  eq('Gegenprobe: KEIN Arbeitseintrag daneben', (p[0].eintraege || []).length, 0);
  eq('Person zugeordnet', p[0].userId, 'u_meier');
  eq('Bericht zählt die Absenz', rep.absenzen, 1);
  t('keine Person-fehlt-Meldung', !rep.personFehlt);
}

// ═══ 2 — Halbtag ═══
{
  console.log('\n═══ 2 — Halbtag: 4 h Ferien + 4 h Arbeit ═══');
  const ls = speicher(); const I = ladeImporter(ls);
  await lauf(I, 'stunden', K, [
    ['Hans Meier', '2026-03-04', '4', '', 'Ferien', 'Ferien', 'freigegeben'],
    ['Hans Meier', '2026-03-04', '4', '8123', 'Montage', '', 'freigegeben']
  ]);
  const p = pool(ls);
  eq('ein Tag', p.length, 1);
  eq('Absenz mit 4 h', p[0].absenz && p[0].absenz.stunden, 4);
  eq('ein Arbeitseintrag mit 240 min', (p[0].eintraege || []).map(e => e.dauerMin), [240]);
}

// ═══ 3 — Freigabe schlägt mobile Erfassung, Korrektur wird GESPEICHERT ═══
{
  console.log('\n═══ 3 — Freigabe korrigiert die mobile Zeit — und bleibt gespeichert ═══');
  const ls = speicher(); const I = ladeImporter(ls);
  // Erst die Handy-Datei (andere Tätigkeits-Beschriftung!), dann das Stundenmodul.
  await lauf(I, 'stunden', K, [['Hans Meier', '2026-03-05', '8', '8123', 'Boiler getauscht', '', 'erfasst']]);
  const rep2 = await lauf(I, 'stunden', K, [['Hans Meier', '2026-03-05', '7.5', '8123', 'Montage', '', 'freigegeben']]);
  const p = pool(ls);
  eq('ein Tag', p.length, 1);
  eq('EIN Eintrag, nicht zwei (16 h)', (p[0].eintraege || []).length, 1);
  const e = p[0].eintraege[0];
  eq('freigegebener Wert gilt: 450 min', e.dauerMin, 450);
  eq('Quelle ist die Freigabe', e.importQuelle, 'freigegeben');
  eq('der mobile Wert bleibt als Vermerk', e.importErfasst, 480);
  eq('Bericht: 1 × korrigiert', rep2.stundenKorrigiert, 1);
  t('Gegenprobe: die Korrektur liegt im POOL, nicht nur im Bericht',
    JSON.parse(ls.getItem(ST_POOL))[0].eintraege[0].dauerMin === 450);
}

// ═══ 4 — Wiederholungs-Import verdoppelt nichts ═══
{
  console.log('\n═══ 4 — zweiter Lauf derselben Datei: keine Dubletten ═══');
  const ls = speicher(); const I = ladeImporter(ls);
  const rows = [
    ['Hans Meier', '2026-03-06', '8', '8123', '', '', 'freigegeben'],          // leere Tätigkeit — die Falle
    ['Hans Meier', '2026-03-06', '1.5', '', 'Werkstatt', 'Werkstatt', 'freigegeben'],
    ['Hans Meier', '2026-03-09', '8', '8124', 'Montage', '', 'freigegeben']
  ];
  const r1 = await lauf(I, 'stunden', K, rows);
  const vorher = JSON.stringify(pool(ls).map(d => [d.datum, (d.eintraege || []).map(e => e.dauerMin)]));
  const r2 = await lauf(I, 'stunden', K, rows);
  const nachher = JSON.stringify(pool(ls).map(d => [d.datum, (d.eintraege || []).map(e => e.dauerMin)]));
  eq('erster Lauf: 2 Tage, 3 Einträge', [r1.stundenTage, r1.stundenEintraege], [2, 3]);
  eq('zweiter Lauf legt nichts Neues an', r2.stundenEintraege || 0, 0);
  t('Pool nach dem zweiten Lauf identisch', vorher === nachher);
  eq('zweiter Lauf meldet die Tage als übersprungen', r2.uebersprungen, 2);
  const tag = pool(ls).find(d => d.datum === '2026-03-06');
  t('Schlüssel am Eintrag gespeichert', tag.eintraege.every(e => typeof e.importKey === 'string' && e.importKey.length > 2));
}

// ═══ 5 — Arbeitskategorie bleibt Arbeit ═══
{
  console.log('\n═══ 5 — «Werkstatt» ist Arbeit, keine Absenz ═══');
  const ls = speicher(); const I = ladeImporter(ls);
  await lauf(I, 'stunden', K, [['Hans Meier', '2026-03-10', '8', '', 'Werkstatt', 'Werkstatt', 'freigegeben']]);
  const p = pool(ls);
  t('keine Tag-Absenz', !p[0].absenz);
  eq('ein Arbeitseintrag mit 480 min', (p[0].eintraege || []).map(e => e.dauerMin), [480]);
  eq('Kategorie als Vermerk am Eintrag', p[0].eintraege[0].importAbsenz, 'Werkstatt');
}

// ═══ 6 — Person ohne GEMA-Benutzer wird gemeldet ═══
{
  console.log('\n═══ 6 — unbekannte Person: erfasst, aber gemeldet ═══');
  const ls = speicher(); const I = ladeImporter(ls);
  const rep = await lauf(I, 'stunden', K, [['Niemand Bekannt', '2026-03-11', '8', '8123', 'Montage', '', 'freigegeben']]);
  eq('Stunden: personFehlt = 1', rep.personFehlt, 1);
  eq('Datensatz ohne userId', pool(ls)[0].userId, '');
  // Überträge: hier war der Zähler toter Code (findeSachbearbeiter gibt nie null).
  const KU = ['arbname', 'datum', 'totarbeit', 'totferien'];
  const ru = await lauf(I, 'uebertraege', KU, [['Niemand Bekannt', '2026-01-01', '5', '200']]);
  eq('Übertrag: personFehlt = 1', ru.personFehlt, 1);
  const ub = pool(ls).find(d => d.typ === 'uebertrag');
  t('der Übertrag ist trotzdem erfasst (nichts geht verloren)', !!ub && ub.ferienH === 200);
  // Termine: neuer Zähler.
  const KT = ['guid', 'datum', 'von60', 'arbeit', 'arbname'];
  const rt = await lauf(I, 'termine', KT, [['g9', '2026-03-12', '07:00', 'Montage', 'Niemand Bekannt']]);
  eq('Termin: monteurFehlt = 1', rt.monteurFehlt, 1);
  const rt2 = await lauf(I, 'termine', KT, [['g10', '2026-03-13', '07:00', 'Montage', 'Hans Meier']]);
  t('bekannter Monteur löst keine Meldung aus', !rt2.monteurFehlt);
}

// ═══ 7 — Absenz gewinnt nie über eine schon vorhandene Absenz ═══
{
  console.log('\n═══ 7 — bestehende Absenz am Tag wird nicht überschrieben ═══');
  const ls = speicher(); const I = ladeImporter(ls);
  ls.setItem(ST_POOL, JSON.stringify([{ id: 'std_x', orgId: 'org1', userId: 'u_meier', userName: 'Hans Meier',
    datum: '2026-03-16', eintraege: [], spesen: {}, status: 'freigegeben', absenz: { typ: 'krank' } }]));
  const rep = await lauf(I, 'stunden', K, [['Hans Meier', '2026-03-16', '8', '', 'Ferien', 'Ferien', 'freigegeben']]);
  eq('krank bleibt krank', pool(ls)[0].absenz.typ, 'krank');
  eq('nichts angehängt', (pool(ls)[0].eintraege || []).length, 0);
  eq('der Tag gilt als übersprungen', rep.uebersprungen, 1);
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen'
                          : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
