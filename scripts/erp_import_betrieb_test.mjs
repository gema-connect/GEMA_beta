// Drift-Guard — ERP-Migration: Betriebstauglichkeit des Importers
//
// Vier Prüfberichte (2026-09-08) fanden Lücken, die nicht die Daten, sondern
// den LAUF betrafen: Belege liefen an der Lauf-Speicherung vorbei (26 000
// Einzel-Requests, stiller Quota-Verlust), ein zweiter Klick startete einen
// zweiten Lauf in denselben Speicher, nichts war abbrechbar, eine 200-MB-
// Datei lief in den Speicherüberlauf, 15 888 Artikel landeten in EINEM
// Record, 220 neue Benutzer in EINER Anfrage (Server-Deckel 200), der
// Kreditor-Verlauf hatte die falsche Form, «bezahlt» kam ohne Zahlung an.
//
// Absicht, nicht Wortlaut: geprüft wird das Verhalten am fertigen Datensatz
// bzw. an der Schnittstelle, nie ein Code-Ausdruck.
//
// Aufruf:  node scripts/erp_import_betrieb_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
let n = 0, fail = 0;
function t(name, cond, detail) { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name + (detail ? ' → ' + detail : '')); } }
function eq(name, a, b) { const ok = JSON.stringify(a) === JSON.stringify(b); t(name + (ok ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)), ok); }

function speicher() { const m = {}; return { getItem: k => (m[k] == null ? null : m[k]), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; }
function ladeImporter(ls, sync, auth) {
  const win = { ERP_ZAHLBED_DEFAULT: [{ id: 'netto30', label: '30 Tage netto', tage: 30 }] };
  ['gema_erp_adressen.js', 'gema_erp_import.js'].forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    new Function('window', 'localStorage', 'GemaSync', 'GemaAuth', 'GemaObjekte', 'DOMParser', src)(win, ls, sync, auth, undefined, undefined);
    if (win.GemaAdressen) globalThis.GemaAdressen = win.GemaAdressen;
  });
  return win.GemaErpImport;
}
function authMock(extra) {
  const orgSettings = { erp: {}, stunden: {} };
  const users = [{ id: 'u_meier', name: 'Hans Meier', orgId: 'org1', active: true }];
  const saveCalls = [];
  return Object.assign({
    getCurrentUser: () => ({ id: 'u_admin', orgId: 'org1', name: 'Admin' }),
    getUsers: () => users,
    getCurrentOrg: () => ({ id: 'org1', settings: orgSettings }),
    updateOrgSettings: (id, patch) => { Object.assign(orgSettings, patch); return true; },
    saveUsers: (liste) => { saveCalls.push(liste.length); return { ok: true }; },
    _saveCalls: saveCalls, _settings: orgSettings
  }, extra || {});
}
function syncMock() {
  const cache = {}; const posts = []; const setCachedCalls = [];
  return {
    getCached: k => (cache[k] ? JSON.parse(cache[k]) : []),
    setCached: (k, arr) => { cache[k] = JSON.stringify(arr); setCachedCalls.push(k); },
    saveRecords: (m, block) => { posts.push({ m, n: block.length }); return Promise.resolve({ ok: true }); },
    saveRecord: (m, k, d) => { posts.push({ m, k, n: 1, einzel: true }); return Promise.resolve({ ok: true }); },
    _posts: posts, _setCached: setCachedCalls, _cache: cache
  };
}
async function lauf(I, sekId, kopf, rows, opts) {
  const map = I.erkenneMapping(kopf, sekId);
  const plan = I.vorbereiten({ sektion: sekId, rows, mapping: map });
  return I.ausfuehren(plan, opts || {});
}
const KO = ['id', 'offert_nr', 'datum', 'betrmemo', 'status_text', 'obetrag', 'mwstbetrag', 'name1', 'strasse', 'plz', 'ort', 'zahlbedid', 'bemerkung'];
const KR = ['id', 'nr', 'rapport_nr', 'datum', 'betrifft', 'debistatus_text', 'rbetrag', 'mwstbetrag', 'name1', 'strasse', 'plz', 'ort', 'faelligdatum', 'bemerkung'];

// ═══ 1 — Belege laufen über den Lauf-Speicher: Blöcke statt Einzel-Requests, Cache über setCached ═══
{
  console.log('\n═══ 1 — Belege gebündelt, Cache über GemaSync.setCached ═══');
  const ls = speicher(), sync = syncMock(); const I = ladeImporter(ls, sync, authMock());
  const rows = []; for (let i = 0; i < 25; i++) rows.push([String(100 + i), 'O-' + (100 + i), '2026-01-1' + (i % 9), 'Boiler ' + i, 'Offen', '1081', '81', 'Kunde ' + i, 'Weg ' + i, '4000', 'Basel', '', '']);
  const rep = await lauf(I, 'offerten', KO, rows, { objekteAnlegen: false });
  eq('25 Offerten neu', rep.neu, 25);
  // Adressen gehen weiterhin einzeln (GemaAdressen.save) — die Belege nicht mehr.
  const einzel = sync._posts.filter(p => p.einzel && p.m === 'erp' && String(p.k).indexOf('erpdok:') === 0).length;
  eq('keine Einzel-Requests für Belege', einzel, 0);
  t('Belege kamen gebündelt (saveRecords erp)', sync._posts.some(p => p.m === 'erp' && !p.einzel && p.n >= 25));
  t('Cache über setCached nachgeführt (nicht nur localStorage)', sync._setCached.indexOf('gema_erp_dok_pool_v1') >= 0, sync._setCached.join(','));
  eq('Cloud-Bilanz im Bericht', rep.cloud && rep.cloud.gesendet, 25);
  // Gegenprobe: zweiter Lauf derselben Datei legt nichts Neues an (Dedupe sieht den Lauf-Stand)
  const rep2 = await lauf(I, 'offerten', KO, rows, { objekteAnlegen: false });
  eq('Wiederholung: 0 neu', rep2.neu, 0);
}

// ═══ 2 — Ein Lauf zur Zeit, Abbruch hält an ═══
{
  console.log('\n═══ 2 — Lauf-Sperre und Abbruch ═══');
  const ls = speicher(), sync = syncMock(); const I = ladeImporter(ls, sync, authMock());
  const rows = []; for (let i = 0; i < 450; i++) rows.push([String(i), 'O-' + i, '2026-02-01', 'X', 'Offen', '10', '0', 'K', 'W ' + i, '4000', 'Basel', '', '']);
  const map = I.erkenneMapping(KO, 'offerten');
  const plan = I.vorbereiten({ sektion: 'offerten', rows, mapping: map });
  const p1 = I.ausfuehren(plan, { objekteAnlegen: false, onFortschritt: (i) => { if (i === 210) I.abbrechen(); } });
  t('während des Laufs: laeuft() = true', I.laeuft());
  let zweiter = null;
  await I.ausfuehren(plan, {}).catch(e => { zweiter = e; });
  t('zweiter Lauf wird abgewiesen, solange der erste läuft', !!zweiter && /bereits/.test(zweiter.message));
  const rep = await p1;
  t('Abbruch im Bericht mit Zeile', !!rep.abgebrochen && rep.abgebrochen.zeile > 0 && rep.abgebrochen.zeile < 450, JSON.stringify(rep.abgebrochen));
  t('bis zum Abbruch Geschriebenes ist gesichert (Flush)', rep.neu > 0 && sync._cache['gema_erp_dok_pool_v1'] && JSON.parse(sync._cache['gema_erp_dok_pool_v1']).length === rep.neu, String(rep.neu));
  t('nach dem Lauf: laeuft() = false', !I.laeuft());
}

// ═══ 3 — Dateigrenze, Sektion aus dem Dateinamen ═══
{
  console.log('\n═══ 3 — Grössen-Sperre und Dateiname ═══');
  const ls = speicher(), sync = syncMock(); const I = ladeImporter(ls, sync, authMock());
  let err = null;
  await I.leseDatei({ name: '10_positionen.tsv', size: 200 * 1024 * 1024, text: () => Promise.resolve('') }).catch(e => { err = e; });
  t('200-MB-Datei wird VOR dem Lesen abgewiesen, mit Hinweis auf Jahresscheiben', !!err && /Jahresscheiben/.test(err.message), err && err.message);
  const erk = I.erkenneSektion(['arb_name', 'datum', 'stunden', 'rappnr', 'arbtyp', 'absenz', 'quelle'], '15_stunden_freigegeben.tsv');
  t('Dateiname des Pakets ordnet die Sektion sicher zu', erk.sicher && erk.beste.sekId === 'stunden' && erk.quelle === 'dateiname');
  const erkF = I.erkenneSektion(['arb_name', 'datum', 'stunden'], '07_offerten.tsv');
  t('falsch benannte Datei: Pflichtfelder fehlen → NICHT über den Namen zugeordnet', !(erkF.sicher && erkF.beste && erkF.beste.sekId === 'offerten' && erkF.quelle === 'dateiname'));
}

// ═══ 4 — Rechnungen: MwSt 0 ist eine Aussage, «bezahlt» bringt eine Zahlung, Fälligkeit aus dem Altsystem ═══
{
  console.log('\n═══ 4 — Rechnungen ═══');
  const ls = speicher(), sync = syncMock(); const I = ladeImporter(ls, sync, authMock());
  await lauf(I, 'rechnungen', KR, [
    ['1', 'R-1', '', '2025-03-01', 'Sanitär', 'Bezahlt', '1000', '0', 'Kunde A', 'Weg 1', '4000', 'Basel', '2025-04-15', 'Bitte per Post'],
    ['2', 'R-2', '', '2025-03-02', 'Sanitär', 'Offen', '1081', '81', 'Kunde B', 'Weg 2', '4000', 'Basel', '', '']
  ], { objekteAnlegen: false, auftragErgaenzen: false });
  const docs = sync.getCached('gema_erp_dok_pool_v1');
  const r1 = docs.find(d => d.nr === 'R-1'), r2 = docs.find(d => d.nr === 'R-2');
  eq('MwSt 0 % wird als 0 gespeichert (nicht leer)', r1.mwstPct, 0);
  eq('«Bezahlt» ohne Datum → Zahlung über den Betrag, auf das Rechnungsdatum datiert', r1.zahlungen && r1.zahlungen.length === 1 && r1.zahlungen[0].betrag === 1000 && r1.zahlungen[0].datum === '2025-03-01', true);
  t('… und die Zahlung sagt, woher ihr Datum stammt', /Altsystem/.test(r1.zahlungen[0].bemerkung));
  eq('Fälligkeit des Altsystems wird zur Zahlungsfrist', r1.frist, '2025-04-15');
  eq('Bemerkung landet als Notiz', r1.notiz, 'Bitte per Post');
  eq('offene Rechnung ohne Zahlung', (r2.zahlungen || []).length, 0);
  eq('8.1 % erkannt', r2.mwstPct, 8.1);
}

// ═══ 5 — Zahlungsbedingungen ergänzen die Vorgaben, statt sie zu ersetzen ═══
{
  console.log('\n═══ 5 — Zahlungsbedingungen ═══');
  const ls = speicher(), sync = syncMock(); const A = authMock(); const I = ladeImporter(ls, sync, A);
  await lauf(I, 'zahlbed', ['shortcut', 'description', 'days_netto', 'days1', 'skonto1', 'fibucode'], [['01', '30 Tage netto', '30', '0', '0', ''], ['00', '60 Tage netto', '60', '0', '0', '']]);
  const l = A._settings.erp.zahlbed;
  t('Vorgabe netto30 bleibt erhalten', l.some(z => z.id === 'netto30'));
  t('importierte «00» = 60 Tage vorhanden', l.some(z => z.importKuerzel === '00' && z.tage === 60));
}

// ═══ 6 — Katalog wird in Teile geschnitten ═══
{
  console.log('\n═══ 6 — Artikel: höchstens 400 je Katalog-Record ═══');
  const ls = speicher(), sync = syncMock(); const I = ladeImporter(ls, sync, authMock());
  const rows = []; for (let i = 0; i < 1000; i++) rows.push(['Sanitär', 'g' + i, 'A' + i, 'Artikel ' + i, 'Stk', '12.5']);
  const rep = await lauf(I, 'artikel', ['katalog', 'guid', 'artref', 'text', 'unit', 'price'], rows);
  const kats = sync.getCached('gema_erp_kat_pool_v1');
  eq('1000 Artikel übernommen', rep.artikel, 1000);
  eq('drei Teil-Kataloge', kats.length, 3);
  t('kein Record über 400 Artikel', kats.every(k => k.artikel.length <= 400), kats.map(k => k.artikel.length).join(','));
  t('Teile hängen am Basisnamen', kats.every(k => k.importBasisName === 'Sanitär'));
  const rep2 = await lauf(I, 'artikel', ['katalog', 'guid', 'artref', 'text', 'unit', 'price'], rows);
  eq('Wiederholung: nichts doppelt', rep2.artikel, 0);
}

// ═══ 7 — Mitarbeitende in Tranchen, Ausgetretene ohne Einladung ═══
{
  console.log('\n═══ 7 — Mitarbeitende ═══');
  const ls = speicher(), sync = syncMock(); const A = authMock(); const I = ladeImporter(ls, sync, A);
  const rows = []; for (let i = 0; i < 250; i++) rows.push([String(i), 'Person' + i, 'Vor' + i, 'p' + i + '@x.ch', '0', '0', '2020-01-01', i < 10 ? '2024-06-30' : '']);
  const rep = await lauf(I, 'mitarbeiter', ['id', 'name1', 'vorname', 'email', 'monteur', 'sachbearb', 'eintritt', 'austritt'], rows);
  eq('250 Benutzer neu', rep.neu, 250);
  t('in mehreren Tranchen gespeichert (Server-Deckel 200)', A._saveCalls.length >= 3, A._saveCalls.join(','));
  t('keine Tranche fügt mehr als 120 neue hinzu', A._saveCalls.every((n, i, arr) => n - (i ? arr[i - 1] : 1) <= 120), A._saveCalls.join(','));
  eq('Ausgetretene: keine Einladung, aber gezählt', rep.inaktiv, 10);
  eq('Einladungen nur für Aktive', rep.einladungen.length, 240);
}

// ═══ 8 — Kreditoren: Verlauf in pm_erp-Form, Mehrfach-Zuteilung gemeldet, ESR-Nr. kommt an ═══
{
  console.log('\n═══ 8 — Kreditoren ═══');
  const ls = speicher(), sync = syncMock(); const I = ladeImporter(ls, sync, authMock());
  const K = ['id', 'nr', 'name1', 'belegnr', 'datum', 'faelligdatum', 'betrag', 'kredistatustext', 'esr_nr', 'rapport_nr', 'zuteilungen'];
  const rep = await lauf(I, 'kreditoren', K, [
    ['1', 'K1', 'Lieferant AG', 'LR-1', '2026-01-05', '2026-02-05', '500', 'Offen', '210000000003139471430009017', '', '3'],
    ['2', 'K2', 'Lieferant AG', 'LR-2', '2026-01-06', '2026-02-06', '100', 'Bezahlt', '', '', '1']
  ]);
  const ks = sync.getCached('gema_erp_kred_pool_v1');
  const k1 = ks.find(k => k.rechnungsNr === 'LR-1');
  t('Verlauf-Eintrag: {am, von:"Name", text} — kein Objekt in von', k1.verlauf.length === 1 && typeof k1.verlauf[0].von === 'string' && typeof k1.verlauf[0].text === 'string');
  eq('Zuteilungen als Vermerk', k1.importZuteilungen, 3);
  eq('Mehrfach-Zuteilung gemeldet', rep.kreditorMehrfach, 1);
  eq('ESR-Nr. der Lieferantenrechnung kommt als Vermerk an', k1.importEsrRef, '210000000003139471430009017');
}

// ═══ 9 — Arbeitsbereich in der Form der Einstellungen ═══
{
  console.log('\n═══ 9 — Arbeitsbereich {id, name, farbe} ═══');
  const ls = speicher(), sync = syncMock(); const A = authMock(); const I = ladeImporter(ls, sync, A);
  await lauf(I, 'offerten', KO.concat(['abt_name']), [['9', 'O-9', '2026-01-01', 'X', 'Offen', '10', '0', 'K', 'W 9', '4000', 'Basel', '', '', 'Spenglerei']], { objekteAnlegen: false });
  const ab = (A._settings.arbeitsbereiche || []);
  t('Bereich angelegt mit `name` (so lesen sv_service, Plantafel, Stunden, ERP)', ab.length === 1 && ab[0].name === 'Spenglerei' && !!ab[0].id);
}

// ═══ 10 — Anlagen mit längst überfälliger Wartung kommen inaktiv ═══
{
  console.log('\n═══ 10 — Anlagen: überfällige Wartung → inaktiv (keine Auftragsflut) ═══');
  const ls = speicher(), sync = syncMock(); const I = ladeImporter(ls, sync, authMock());
  const KA = ['kom_id', 'kom_name', 'kom_last_rev', 'kom_rev_int', 'ser_strasse', 'ser_plz', 'ser_ort'];
  const heute = new Date();
  const kuerzlich = new Date(heute.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const rep = await lauf(I, 'anlagen', KA, [
    ['1', 'Boiler alt', '2015-06-01', '12', 'Weg 1', '4000', 'Basel'],      // Revision 2016 → längst fällig
    ['2', 'Boiler aktuell', kuerzlich, '12', 'Weg 2', '4000', 'Basel'],     // nächste erst in 11 Monaten
    ['3', 'Ohne Intervall', '2015-06-01', '', 'Weg 3', '4000', 'Basel']     // kein Termin → bleibt aktiv
  ], { objekteAnlegen: false });
  const anl = sync.getCached('gema_sv_anlagen_pool_v1');
  const alt = anl.find(a => a.name === 'Boiler alt');
  const neu = anl.find(a => a.name === 'Boiler aktuell');
  const ohne = anl.find(a => a.name === 'Ohne Intervall');
  eq('überfällige Anlage ist inaktiv', alt.status, 'inaktiv');
  t('… mit nachlesbarem Grund am Datensatz', /inaktiv/i.test(alt.importInaktivGrund || '') && /Revision/.test(alt.importInaktivGrund || ''));
  eq('gemeldet', rep.anlagenInaktiv, 1);
  eq('Anlage mit künftiger Revision bleibt aktiv', neu.status, 'aktiv');
  eq('Anlage ohne Intervall bleibt aktiv (sie erzeugt ohnehin keinen Termin)', ohne.status, 'aktiv');
  // Gegenprobe: Abschalten der Regel lässt alles aktiv
  const ls2 = speicher(), sync2 = syncMock(); const I2 = ladeImporter(ls2, sync2, authMock());
  await lauf(I2, 'anlagen', KA, [['1', 'Boiler alt', '2015-06-01', '12', 'Weg 1', '4000', 'Basel']], { objekteAnlegen: false, anlagenAltInaktiv: false });
  eq('Gegenprobe: mit anlagenAltInaktiv=false bleibt sie aktiv', sync2.getCached('gema_sv_anlagen_pool_v1')[0].status, 'aktiv');
}

// ═══ 11 — Spesen der App landen am Eintrag (Auswertung je Auftrag) ═══
{
  console.log('\n═══ 11 — Spesen am Eintrag, nicht nur am Tag ═══');
  const ls = speicher(), sync = syncMock(); const I = ladeImporter(ls, sync, authMock());
  const KS = ['arb_name', 'datum', 'stunden', 'rappnr', 'arbtyp', 'absenz', 'hrs_spesen', 'quelle'];
  await lauf(I, 'stunden', KS, [
    ['Hans Meier', '2026-04-01', '4', '8123', 'Montage', '', '12.50', 'erfasst'],
    ['Hans Meier', '2026-04-01', '4', '8124', 'Montage', '', '7.50', 'erfasst']
  ]);
  const tag = sync.getCached('gema_std_pool_v1').find(x => x.datum === '2026-04-01');
  eq('Tagessumme wie bisher', tag.spesen.importBetrag, 20);
  eq('Betrag je Eintrag erhalten (für die Auswertung nach Auftrag)',
    tag.eintraege.map(e => [e.importAuftragNr, e.importSpesen]), [['8123', 12.5], ['8124', 7.5]]);
}

// ═══ 12 — Rollen des Büros: die neuen ERP-Rollen, nie Administrator ═══
{
  console.log('\n═══ 12 — Rollenzuordnung ═══');
  const ls = speicher(), sync = syncMock(); const A = authMock(); const I = ladeImporter(ls, sync, A);
  const KM = ['id', 'name1', 'vorname', 'email', 'monteur', 'sachbearb', 'manager', 'eintritt', 'austritt'];
  const rep = await lauf(I, 'mitarbeiter', KM, [
    ['1', 'Monteur', 'Max', 'max@x.ch', '1', '0', '0', '2020-01-01', ''],
    ['2', 'Buero', 'Bea', 'bea@x.ch', '0', '1', '0', '2020-01-01', ''],
    ['3', 'Leitung', 'Lea', 'lea@x.ch', '0', '1', '1', '2020-01-01', '']
  ]);
  eq('Sachbearbeiter → ERP Sachbearbeiter, Leitung → ERP Abteilungsleiter',
    rep.rollen, { role_monteur: 1, role_erp_sachbearbeiter: 1, role_erp_abteilungsleiter: 1 });
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen' : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
