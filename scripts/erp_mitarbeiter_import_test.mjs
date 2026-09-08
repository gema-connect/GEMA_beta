// Drift-Guard — ERP-Migration: Abschnitt «Mitarbeitende»
//
// Der Betrieb will seine Mitarbeitenden importieren statt von Hand anlegen.
// Sicherheitsregeln, die hier festgenagelt sind:
//   - NIE ein Passwort erfinden (password:null, Einladungs-Token wie
//     inviteBeteiligter; das Passwort setzt die Person selbst)
//   - NIE role_admin — Leitung → Abteilungsleiter, Sachbearbeiter →
//     Unternehmer, sonst Monteur
//   - Ausgetretene INAKTIV — und findeSachbearbeiter findet sie trotzdem,
//     damit ihre Stunden der Vergangenheit eine Person haben
//   - Bestehende Benutzer werden nur ergänzt, nie überschrieben
//   - Pensum nur, wenn es sich gegen das Firmen-Wochensoll (inkl.
//     Vorholzeit) plausibel rechnen lässt; sonst Vermerk + Meldung
//
// Aufruf:  node scripts/erp_mitarbeiter_import_test.mjs
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
// Auth-Mock mit echtem Zustand: getUsers liefert, was saveUsers geschrieben hat.
let users = [{ id: 'u_meier', name: 'Hans Meier', username: 'hans@firma.ch', orgId: 'org1', active: true, roleIds: ['role_monteur'], profile: { email: 'hans@firma.ch' } }];
let orgSettings = { stunden: { wochenSoll: 40, vorholProWocheH: 1.25 } };
const calls = { saveUsers: 0, updateOrgSettings: 0 };
const AUTH = {
  getCurrentUser: () => ({ id: 'u_admin', orgId: 'org1', name: 'Admin' }),
  getUsers: () => users,
  saveUsers: arr => { users = arr; calls.saveUsers++; return Promise.resolve({ ok: true }); },
  getCurrentOrg: () => ({ id: 'org1', settings: orgSettings }),
  updateOrgSettings: (id, patch) => { orgSettings = Object.assign({}, orgSettings, patch); calls.updateOrgSettings++; return true; }
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
const ls = speicher(); const I = ladeImporter(ls);
// Kopfzeile wie der Export 8.15
const K = ['id', 'name1', 'vorname', 'kuerzel', 'email', 'tel1', 'natel', 'abt_name', 'monteur', 'sachbearb', 'manager', 'eintritt', 'austritt', 'wochensoll', 'ferientage', 'ansatz1'];
const rows = [
  ['1', 'Meier', 'Hans', 'HM', 'hans@firma.ch', '', '', 'Sanitär', '1', '0', '0', '2015-03-01', '', '41.25', '', '92'],
  ['2', 'Keller', 'Anna', 'AK', 'anna@firma.ch', '061 000 00 00', '', 'Spenglerei', '1', '0', '0', '2020-08-01', '', '41.25', '', ''],
  ['3', 'Teil', 'Peter', 'PT', 'peter@firma.ch', '', '079 000 00 00', 'Sanitär', '1', '0', '0', '2022-01-01', '', '33', '', ''],
  ['4', 'Weg', 'Fritz', 'FW', 'fritz@firma.ch', '', '', 'Sanitär', '1', '0', '0', '2010-01-01', '2024-06-30', '41.25', '', ''],
  ['5', 'Ohne', 'Nora', 'NO', '', '', '', 'Büro', '0', '1', '0', '2023-05-01', '', '41.25', '', ''],
  ['6', 'Chef', 'Karin', 'KC', 'karin@firma.ch', '', '', 'Leitung', '0', '1', '1', '2005-01-01', '', '41.25', '', ''],
  ['7', 'Kaputt', 'Wert', 'KW', 'wert@firma.ch', '', '', 'Sanitär', '1', '0', '0', '2024-01-01', '', '2475', '', '']   // Minuten statt Stunden
];

console.log('\n═══ 1 — Vorschau: Erkennung, Rollen, Pensum ═══');
const { plan, rep } = await lauf(I, 'mitarbeiter', K, rows);
{
  const z = plan.zeilen.map(x => x.ziel);
  eq('Hans Meier existiert → aktualisiert', plan.zeilen[0].aktion, 'aktualisiert');
  eq('Anna Keller ist neu', plan.zeilen[1].aktion, 'neu');
  eq('Anzeigename Vorname Name (wie die Stunden-Exporte)', z[1].voller, 'Anna Keller');
  eq('Monteur → role_monteur', z[1].rolle, 'role_monteur');
  // BEWUSST ÜBERSTEUERT (Entscheid 2026-09-08): das Büro bekommt die neuen
  // ERP-Rollen. `role_unternehmer` ist plattformweit die Rolle des FREMDEN
  // Unternehmers und kennt weder Objekte noch Termine, Stunden oder Service.
  eq('Sachbearbeiterin → role_erp_sachbearbeiter', z[4].rolle, 'role_erp_sachbearbeiter');
  eq('Leitung schlägt Sachbearbeiter → role_erp_abteilungsleiter', z[5].rolle, 'role_erp_abteilungsleiter');
  t('nirgends role_admin', z.every(x => x.rolle !== 'role_admin'));
  eq('41.25 h gegen 40 + 1.25 → 100 %', z[1].pensum.pensum, 100);
  eq('33 h → 80 %', z[2].pensum.pensum, 80);
  t('2 475 (Minuten statt Stunden) → kein Pensum, Grund genannt', z[6].pensum.pensum === null && /plausib/.test(z[6].pensum.grund));
  t('Ausgetretener ist inaktiv', z[3].aktiv === false);
  t('Vorschau warnt bei fehlender E-Mail', plan.zeilen[4].hinweise.some(h => h.typ === 'warn' && /E-Mail/.test(h.text)));
}

console.log('\n═══ 2 — Schreiben: Benutzer ohne Passwort, mit Einladung ═══');
{
  eq('6 neue Benutzer', rep.neu, 6);
  eq('einmal gespeichert (ganze Liste)', calls.saveUsers, 1);
  eq('7 Benutzer insgesamt (1 bestehend + 6 neu)', users.length, 7);
  const anna = users.find(u => u.name === 'Anna Keller');
  t('password:null — nie erfunden', anna && anna.password === null);
  t('Einladungs-Token vorhanden, Passwort nicht gesetzt', anna && anna.einladung && /^inv_/.test(anna.einladung.token) && anna.einladung.passwortGesetzt === false);
  eq('Login-Name = E-Mail', anna.username, 'anna@firma.ch');
  eq('Rolle', anna.roleIds, ['role_monteur']);
  eq('Firma', anna.orgId, 'org1');
  t('Alt-ID als Quelle', anna.quelle && anna.quelle.extId === '2');
  const fritz = users.find(u => u.name === 'Fritz Weg');
  t('Ausgetretener ist inaktiv angelegt', fritz && fritz.active === false);
  const nora = users.find(u => u.name === 'Nora Ohne');
  t('ohne E-Mail: angelegt, aber ohne Einladung', nora && nora.einladung === null && !/@/.test(nora.username));
  t('Gegenprobe: kein Benutzer mit role_admin', users.every(u => !(u.roleIds || []).includes('role_admin')));
  // Absicht: kein importierter Benutzer trägt ein Passwort (null ODER gar
  // kein Feld — der vorbestehende Hans Meier des Mocks hat keins).
  t('Gegenprobe: kein Benutzer hat ein gesetztes Passwort bekommen', users.filter(u => u.quelle && u.quelle.system === 'ERP-Migration').every(u => u.password == null));
  // BEWUSST ÜBERSTEUERT (Prüfbericht 2026-09-08): Ausgetretene bekommen keine
  // Einladung — der Server lehnt die Aktivierung eines inaktiven Benutzers
  // ohnehin ab, ein «ungültiger» Link verwirrt nur. Fritz Weg ist ausgetreten.
  eq('4 Einladungslinks (Nora hat keine E-Mail, Fritz ist ausgetreten)', rep.einladungen.length, 4);
  eq('Ausgetretener wird als inaktiv gezählt', rep.inaktiv, 1);
  t('Ausgetretener: inaktiv angelegt, ohne Einladung', !!fritz && fritz.active === false && fritz.einladung === null);
  t('Link führt auf die Einladungs-Seite', rep.einladungen.every(e => /^sys_login\.html\?invite=inv_/.test(e.link)));
  eq('1 × ohne E-Mail gemeldet', rep.ohneEmail, 1);
  eq('Rollen gezählt', rep.rollen, { role_monteur: 5, role_erp_sachbearbeiter: 1, role_erp_abteilungsleiter: 1 });
  // Bestehender Benutzer: unverändert (keine Lücke zu füllen)
  const hans = users.find(u => u.id === 'u_meier');
  eq('Hans Meier behält seine Rolle', hans.roleIds, ['role_monteur']);
  t('… und wurde nicht dupliziert', users.filter(u => /hans meier/i.test(u.name)).length === 1);
}

console.log('\n═══ 3 — Stammdaten der Stundenerfassung ═══');
{
  const mit = orgSettings.stunden.mitarbeiter;
  const anna = users.find(u => u.name === 'Anna Keller');
  const peter = users.find(u => u.name === 'Peter Teil');
  const wert = users.find(u => u.name === 'Wert Kaputt');
  eq('Eintritt übernommen', mit[anna.id].eintritt, '2020-08-01');
  eq('Pensum 100', mit[anna.id].pensum, 100);
  eq('Pensum 80', mit[peter.id].pensum, 80);
  eq('Kürzel', mit[anna.id].kuerzel, 'AK');
  t('unplausibles Wochensoll: kein Pensum, Rohwert als Vermerk', mit[wert.id].pensum == null && mit[wert.id].importWochenSoll === 2475);
  eq('… und im Bericht gemeldet', rep.pensumOffen, 1);
  t('Wochensoll-Basis inkl. Vorholzeit (41.25)', plan.zeilen[1].ziel.pensum.basis === 41.25);
  eq('Firmen-Einstellungen geschrieben', calls.updateOrgSettings >= 1, true);
  t('Firmen-Wochensoll selbst unverändert', orgSettings.stunden.wochenSoll === 40);
}

console.log('\n═══ 4 — zweiter Lauf: nichts doppelt ═══');
{
  const r2 = await lauf(I, 'mitarbeiter', K, rows);
  eq('keine neuen Benutzer', r2.rep.neu, 0);
  eq('7 Benutzer bleiben 7', users.length, 7);
  t('alle als aktualisiert/übersprungen', r2.plan.zeilen.every(z => z.aktion === 'aktualisiert'));
  t('keine neuen Einladungen', r2.rep.einladungen.length === 0);
}

console.log('\n═══ 5 — Ausgetretene bekommen ihre Historie ═══');
{
  const KS = ['arbname', 'datum', 'stunden', 'rappnr', 'arbtyp', 'absenz', 'quelle'];
  const { rep: rs } = await lauf(I, 'stunden', KS, [['Fritz Weg', '2023-03-01', '8', '8123', 'Montage', '', 'freigegeben']]);
  t('Stunden des Ausgetretenen finden die (inaktive) Person', !rs.personFehlt);
  const tag = JSON.parse(ls.getItem('gema_std_pool_v1') || '[]').find(d => d.datum === '2023-03-01');
  const fritz = users.find(u => u.name === 'Fritz Weg');
  eq('… mit der richtigen userId', tag && tag.userId, fritz.id);
}

console.log('\n═══ 5b — Pensum: 0 heisst «nicht geführt», direktes Pensum gewinnt ═══');
{
  // Im Bestand sind sollmo..sollfr bei allen 46 Aktiven 0.00 — das ist kein
  // Pensum von 0 %, sondern «nicht geführt». Keine Meldung «unplausibel».
  const K2 = K.concat(['pensum']);
  const I2 = ladeImporter(speicher());
  const map = I2.erkenneMapping(K2, 'mitarbeiter');
  const plan = I2.vorbereiten({ sektion: 'mitarbeiter', rows: [
    ['8', 'Null', 'Nina', 'NN', 'nina@firma.ch', '', '', 'Sanitär', '1', '0', '0', '2024-01-01', '', '0', '', '', ''],
    ['9', 'Direkt', 'Dani', 'DD', 'dani@firma.ch', '', '', 'Sanitär', '1', '0', '0', '2024-01-01', '', '0', '', '', '60'],
    ['10', 'Beides', 'Bea', 'BB', 'bea@firma.ch', '', '', 'Sanitär', '1', '0', '0', '2024-01-01', '', '41.25', '', '', '50']
  ], mapping: map });
  const z = plan.zeilen.map(x => x.ziel);
  t('Wochensoll 0 → kein Wochensoll, kein Pensum', z[0].wochenSoll === null && z[0].pensum.pensum === null);
  t('… und KEINE Unplausibel-Warnung', !plan.zeilen[0].hinweise.some(h => h.typ === 'warn' && /plausib|Wochensoll/.test(h.text)));
  t('… sondern der Hinweis auf 100 %', plan.zeilen[0].hinweise.some(h => /100 %/.test(h.text)));
  eq('direktes Pensum 60 %', z[1].pensum.pensum, 60);
  t('als direkt markiert', z[1].pensum.direkt === true);
  eq('direktes Pensum schlägt das Wochensoll (50 statt 100)', z[2].pensum.pensum, 50);
  // Die Spalte «pctn» des Altsystems wird NICHT automatisch als Pensum gelesen
  // — ihre Bedeutung ist unbelegt.
  const map2 = I2.erkenneMapping(K.concat(['pctn']), 'mitarbeiter');
  t('Gegenprobe: «pctn» wird nicht still zum Pensum', map2.pensumPct == null);
}

console.log('\n═══ 6 — Reihenfolge und Export-Sicherheit ═══');
{
  const r = I.IMPORT_REIHENFOLGE;
  t('Mitarbeitende kommen vor Objekten, Belegen, Terminen und Stunden',
    ['objekte', 'offerten', 'termine', 'stunden', 'uebertraege'].every(s => r.indexOf('mitarbeiter') < r.indexOf(s)));
  const doc = fs.readFileSync(path.join(ROOT, 'KONZEPT_ERP_Migration_Altsystem.md'), 'utf8');
  // Nur den SQL-Block prüfen — der Text darunter zählt die NICHT exportierten
  // Spalten bewusst beim Namen auf.
  const abschnitt = (doc.split('### 8.15')[1] || '').split('###')[0];
  const sql = (abschnitt.split('```sql')[1] || '').split('```')[0];
  t('Export 8.15 vorhanden', sql.length > 100);
  t('Export nennt KEINE Lohn-, AHV-, Bank- oder Passwortspalten',
    !/\b(ahv|gebdat|zivilstand|anzkinder|lohnkonto|bankname1|bankname2|passwrd|aktivlohn|lohnflag)\b/.test(sql));
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen'
                          : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
