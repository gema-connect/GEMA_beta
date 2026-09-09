// Drift-Guard — ERP-Migration: Lauf-Speicher (Review-Punkt C11)
//
// poolSichern las vorher für JEDEN Datensatz den ganzen Pool, serialisierte
// ihn komplett nach localStorage und schickte einen eigenen Cloud-Request:
// quadratisch, bei 30 000 Stunden-Tagen ein eingefrorener Tab. Jetzt liegt
// der Pool je Lauf einmal im Speicher, localStorage wird je Pool geflusht
// (alle 500 Schreibungen und am Ende), die Cloud in Blöcken zu 200.
//
// Geprüft wird das SICHTBARE Verhalten: Anzahl Schreibungen, Blockgrösse,
// keine Einzelsends, gleicher Pool-Inhalt, Wiederholungs-Import findet alles
// über den Lauf-Index, und ein grosser Lauf bleibt schnell.
//
// Aufruf:  node scripts/erp_pool_lauf_test.mjs
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
const ST_POOL = 'gema_std_pool_v1', EP_POOL = 'gema_einsatz_pool_v1';

// Speicher-Mock mit Zähler je Schlüssel
function speicher() {
  const m = {}, writes = {};
  return {
    getItem: k => (m[k] == null ? null : m[k]),
    setItem: (k, v) => { m[k] = String(v); writes[k] = (writes[k] || 0) + 1; },
    removeItem: k => { delete m[k]; },
    writes, _m: m
  };
}
// GemaSync-Mock: getCached liest wie das Original zuerst localStorage
function syncMock(ls) {
  const calls = { saveRecords: [], saveRecord: 0 };
  return {
    calls,
    getCached: k => { try { return JSON.parse(ls.getItem(k) || '[]'); } catch (e) { return []; } },
    saveRecords: (mod, recs) => { calls.saveRecords.push({ mod, n: recs.length }); return Promise.resolve({ ok: true }); },
    saveRecord: () => { calls.saveRecord++; return Promise.resolve({ ok: true }); }
  };
}
const AUTH = {
  getCurrentUser: () => ({ id: 'u_admin', orgId: 'org1', name: 'Admin' }),
  getUsers: () => [{ id: 'u_meier', name: 'Hans Meier', orgId: 'org1', active: true },
                   { id: 'u_keller', name: 'Anna Keller', orgId: 'org1', active: true }],
  getCurrentOrg: () => ({ id: 'org1', settings: {} }),
  updateOrgSettings: () => true
};
function ladeImporter(ls, sync) {
  const win = {};
  ['gema_erp_adressen.js', 'gema_erp_import.js'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    new Function('window', 'localStorage', 'GemaSync', 'GemaAuth', 'GemaObjekte', 'DOMParser', src)(
      win, ls, sync, AUTH, undefined, undefined);
    if (win.GemaAdressen) globalThis.GemaAdressen = win.GemaAdressen;
  });
  return win.GemaErpImport;
}
async function lauf(I, sekId, kopf, rows, opts) {
  const map = I.erkenneMapping(kopf, sekId);
  const plan = I.vorbereiten({ sektion: sekId, rows, mapping: map });
  return I.ausfuehren(plan, opts || {});
}
function pool(ls, key) { return JSON.parse(ls.getItem(key) || '[]'); }
function iso(d) { return d.toISOString().slice(0, 10); }

// 1 200 Stundenzeilen: 2 Personen × 300 Werktage × 2 Einträge
const K = ['arbname', 'datum', 'stunden', 'rappnr', 'arbtyp', 'absenz', 'quelle'];
const rows = [];
{
  let d = new Date(Date.UTC(2025, 0, 6)), tage = 0;
  while (tage < 300) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) {
      for (const p of ['Hans Meier', 'Anna Keller']) {
        rows.push([p, iso(d), '4', '8' + (tage % 50), 'Montage', '', 'freigegeben']);
        rows.push([p, iso(d), '4', '9' + (tage % 30), 'Service', '', 'freigegeben']);
      }
      tage++;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

console.log('\n═══ 1 — 1 200 Zeilen: gebündelt statt je Datensatz ═══');
{
  const ls = speicher(); const sync = syncMock(ls); const I = ladeImporter(ls, sync);
  const t0 = Date.now();
  let fortschritt = 0;
  const rep = await lauf(I, 'stunden', K, rows, { onFortschritt: () => { fortschritt++; } });
  const dauer = Date.now() - t0;
  eq('600 Person-Tage geschrieben', rep.stundenTage, 600);
  eq('1 200 Einträge', rep.stundenEintraege, 1200);
  eq('Pool enthält 600 Records', pool(ls, ST_POOL).length, 600);
  t('localStorage höchstens 3× geschrieben (600 Records / 500 pro Flush + Ende), war: ' + ls.writes[ST_POOL],
    ls.writes[ST_POOL] <= 3);
  t('kein einziger Einzel-Send', sync.calls.saveRecord === 0);
  // Zwischen-Flush nach 500 Schreibungen (200+200+100), Rest am Ende (100).
  const blocks = sync.calls.saveRecords.filter(c => c.mod === 'stundenerfassung');
  eq('Cloud in Blöcken: 600 Records, kein Block über 200', blocks.reduce((a, c) => a + c.n, 0), 600);
  t('jeder Block ≤ 200, höchstens 4 Blöcke: ' + JSON.stringify(blocks.map(c => c.n)),
    blocks.every(c => c.n <= 200) && blocks.length <= 4);
  t('Fortschritt wurde gemeldet (600 Gruppen)', fortschritt === 600);
  t('schnell: unter 4 s (war: ' + dauer + ' ms)', dauer < 4000);
}

console.log('\n═══ 2 — Wiederholungs-Import findet alles über den Lauf-Index ═══');
{
  const ls = speicher(); const sync = syncMock(ls); const I = ladeImporter(ls, sync);
  await lauf(I, 'stunden', K, rows);
  const vorher = JSON.stringify(pool(ls, ST_POOL).map(d => [d.datum, d.userId, d.eintraege.map(e => e.dauerMin)]));
  sync.calls.saveRecords.length = 0;
  const rep2 = await lauf(I, 'stunden', K, rows);
  eq('zweiter Lauf: nichts Neues', rep2.stundenEintraege || 0, 0);
  eq('alle 600 Tage übersprungen', rep2.uebersprungen, 600);
  t('Pool unverändert', JSON.stringify(pool(ls, ST_POOL).map(d => [d.datum, d.userId, d.eintraege.map(e => e.dauerMin)])) === vorher);
  t('Gegenprobe: ohne Änderung geht nichts in die Cloud', sync.calls.saveRecords.length === 0);
}

console.log('\n═══ 3 — Termine: Lauf-Index statt linearer Suche, keine Dubletten ═══');
{
  const ls = speicher(); const sync = syncMock(ls); const I = ladeImporter(ls, sync);
  const KT = ['guid', 'datum', 'von60', 'arbeit', 'arbname'];
  const term = [];
  for (let i = 0; i < 300; i++) term.push(['g' + i, iso(new Date(Date.UTC(2026, 0, 5 + i))), '07:00', 'Montage ' + i, i % 2 ? 'Hans Meier' : 'Anna Keller']);
  const r1 = await lauf(I, 'termine', KT, term);
  eq('300 Termine neu', r1.neu, 300);
  const r2 = await lauf(I, 'termine', KT, term);
  eq('zweiter Lauf: 300 aktualisiert, 0 neu', [r2.neu, r2.aktualisiert], [0, 300]);
  eq('Pool hat 300 Termine, nicht 600', pool(ls, EP_POOL).length, 300);
  const blocks = sync.calls.saveRecords.filter(c => c.mod === 'einsatzplan');
  t('Cloud gebündelt (Blöcke ≤ 200): ' + JSON.stringify(blocks.map(c => c.n)), blocks.every(c => c.n <= 200) && blocks.length <= 4);
}

console.log('\n═══ 4 — Flush auch im Fehlerpfad ═══');
{
  const ls = speicher(); const sync = syncMock(ls); const I = ladeImporter(ls, sync);
  // Erst gültige Zeilen, dann eine, die im Writer scheitert (Datum fehlt →
  // wird schon in der Vorschau als Fehler ausgeschlossen). Der Lauf muss
  // trotzdem sauber enden und das Gelungene schreiben.
  const rep = await lauf(I, 'stunden', K, [
    ['Hans Meier', '2026-02-02', '8', '8123', 'Montage', '', 'freigegeben'],
    ['Hans Meier', '', '8', '8123', 'Montage', '', 'freigegeben']
  ]);
  eq('eine Zeile übersprungen (Vorschau-Fehler)', rep.uebersprungen, 1);
  eq('der gültige Tag ist im Pool', pool(ls, ST_POOL).length, 1);
  t('… und in der Cloud', sync.calls.saveRecords.some(c => c.mod === 'stundenerfassung' && c.n === 1));
}

console.log('\n═══ 5 — ohne laufenden Import schreibt poolSichern sofort ═══');
{
  const src = fs.readFileSync(path.join(ROOT, 'gema_erp_import.js'), 'utf8');
  t('Sofort-Pfad vorhanden (kein Lauf → saveRecord wie früher)',
    /if\(!P\)\{[\s\S]{0,600}GemaSync\.saveRecord\(mod\|\|'erp',prefix\+rec\.id,rec\)/.test(src));
  // Absicht: der Lauf beginnt in ausfuehren, vor jedem Schreiben — nicht,
  // welche Vorbereitungszeile direkt davor steht.
  t('ausfuehren startet den Lauf', /function ausfuehren\(plan,opts\)\{[\s\S]{0,900}laufStart\(\);/.test(src));
  t('jeder Rückgabepfad flusht', (src.match(/\.then\(abschluss\)/g) || []).length >= 7);
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen'
                          : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
