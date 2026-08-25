// Drift-Guard: Lieferanten-Dashboard als GEMA-Modul + Berechnungs-
// Freischaltung nach Sortiment (08/2026).
//
// Sichert die vier Zusagen des Umbaus ab:
//   A) Das Dashboard ist ein normales Modul (MODULES/FILE_MAP/Uebersicht/
//      Workspace-Katalog) und laeuft ueber die Modul-Permission.
//   B) Lieferanten-Rollen starten im WORKSPACE wie alle anderen.
//   C) Ein Lieferant sieht genau die Berechnungen seines Sortiments —
//      nicht mehr (Guards) und nicht weniger (Kategorie-Abdeckung).
//   D) Die Dashboard-Seite bietet den Einstieg in diese Berechnungen.
//
// Laeuft OHNE Browser (Node-VM-Harness) — ausfuehren mit:
//   node scripts/lieferant_modul_test.mjs
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadAuth, sessionFor, permCode, buildMatrix, ROOT } from './auth_node_harness.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  ✗ ' + msg); } }
const read = f => readFileSync(join(ROOT, f), 'utf8');

const LIEF_ROLLEN = [
  'role_lieferant', 'role_lieferant_admin', 'role_lieferant_produkte',
  'role_lieferant_verify', 'role_lieferant_offerten', 'role_lieferant_intern',
  'role_produktlieferant_admin', 'role_produktlieferant_produkte',
  'role_produktlieferant_offerten', 'role_produktlieferant_intern',
  'role_pruefer', 'role_leiterpruefer'
];

// ── A) Modul-Registrierung ────────────────────────────────────────────
console.log('── A: Registrierung als Modul ──');
{
  const { GemaAuth } = loadAuth();
  const mods = GemaAuth.getModules();
  const m = mods.find(x => x.key === 'lieferant_dashboard');
  ok(!!m, 'lieferant_dashboard in GemaAuth.getModules()');
  ok(m && m.cat === 'Lieferanten', 'Kategorie «Lieferanten» (ist: ' + (m && m.cat) + ')');
  const fm = GemaAuth.getFileMap();
  ok(fm['sys_lieferant_dashboard'] === 'lieferant_dashboard', 'FILE_MAP sys_lieferant_dashboard → lieferant_dashboard');

  const auth = read('gema_auth.js');
  const lo = auth.match(/function _isLoginOnly\(\)\{return \[([^\]]*)\]/)[1];
  ok(lo.indexOf('sys_lieferant_dashboard') < 0,
    '_isLoginOnly enthaelt sys_lieferant_dashboard NICHT mehr (laeuft ueber Permission)');

  // Modulübersicht
  const idx = read('index.html');
  ok(/data-cat="lief"/.test(idx), 'index.html: Sektion data-cat="lief"');
  ok(/data-module="lieferant_dashboard"/.test(idx), 'index.html: Kachel mit data-module (Permission-Gating)');
  ok(/href="sys_lieferant_dashboard\.html"/.test(idx), 'index.html: Kachel verlinkt das Dashboard');
  ok(/data-filter="lief"/.test(idx), 'index.html: Filter-Knopf für die Kategorie');
  ok(/\.acc-lief\{/.test(idx) && /\.ico-lief\{/.test(idx), 'index.html: Akzent-/Icon-CSS der Kategorie');
  const gradM = idx.match(/var GRAD=\{[\s\S]*?\};/);
  ok(gradM && /lief:'lief'/.test(gradM[0]), 'index.html: GRAD-Map kennt «lief» (Handy-Kacheln)');
  ok(/--gn-c-lief:/.test(read('gema-native.css')), 'gema-native.css: Farbverlauf --gn-c-lief');

  // Workspace-Katalog
  const ws = read('sys_workspace.html');
  ok(/\{id:'lief',label:'Lieferanten'/.test(ws), 'sys_workspace: MODULE_CATS-Eintrag');
  ok(/id:'sys_lieferant_dashboard'/.test(ws), 'sys_workspace: MODULES-Eintrag (Eimer-Picker)');

  // Mindest-Version NUMERISCH prüfen, nicht per Ziffern-Regex: ein
  // Bereich wie «v4[4-9]\d» endet stillschweigend bei v499 und schlägt
  // beim nächsten Hochzählen fehl, obwohl die Version gestiegen ist.
  const swV = parseInt((read('sw.js').match(/gema-v(\d+)/) || [])[1] || '0', 10);
  ok(swV >= 437, `sw.js: Cache-Version hochgezogen (v${swV} ≥ v437)`);
}

// ── B) Landing-Page = Workspace ───────────────────────────────────────
console.log('── B: Alle starten im Workspace ──');
for (const rid of LIEF_ROLLEN) {
  const { GemaAuth } = loadAuth({ storage: sessionFor(rid) });
  ok(GemaAuth.getLandingPage() === 'sys_workspace.html',
    rid + ': Landing = sys_workspace.html (ist: ' + GemaAuth.getLandingPage() + ')');
}
{
  // Gegenprobe: Garagist behaelt bewusst sein Dashboard (User-Entscheid)
  const { GemaAuth } = loadAuth({ storage: sessionFor('role_garagist') });
  ok(GemaAuth.getLandingPage() === 'sys_garagist_dashboard.html', 'role_garagist: unveraendert eigenes Dashboard');
}

// ── C) Rechte am Dashboard ────────────────────────────────────────────
console.log('── C: Dashboard-Rechte je Rolle ──');
{
  const { matrix } = buildMatrix();
  const NUR_LESEN = ['role_lieferant_intern', 'role_produktlieferant_intern'];
  for (const rid of LIEF_ROLLEN) {
    const soll = NUR_LESEN.indexOf(rid) >= 0 ? 'r' : 'rw';
    ok(matrix[rid].lieferant_dashboard === soll,
      rid + ': lieferant_dashboard = ' + soll + ' (ist: ' + matrix[rid].lieferant_dashboard + ')');
  }
  ok(matrix['role_admin'].lieferant_dashboard === 'rwa', 'role_admin: volle Rechte (Vorschau-Modus)');
  // Planer haben KEIN Lieferanten-Profil — die Kachel waere eine Sackgasse
  ['role_planer', 'role_hlkk_planer', 'role_lueftung_planer', 'role_elektro_planer', 'role_abteilungsleiter']
    .forEach(r => ok(matrix[r].lieferant_dashboard === '-', r + ': Dashboard bewusst gesperrt'));
  ok(matrix['role_monteur'].lieferant_dashboard === '-', 'role_monteur: kein Dashboard-Zugriff');

  // Golden-Abgleich: die Matrix darf NUR beim neuen Modul abweichen
  const golden = JSON.parse(read('scripts/rolematrix_golden.json'));
  let drift = 0;
  for (const rid of Object.keys(matrix)) for (const k of Object.keys(matrix[rid])) {
    if (!golden[rid] || golden[rid][k] !== matrix[rid][k]) drift++;
  }
  ok(drift === 0, 'rolematrix_golden.json deckt sich mit der Laufzeit-Matrix (' + drift + ' Abweichungen)');
}

// ── C2) Berechnungs-Freischaltung nach Sortiment ──────────────────────
console.log('── C2: Freischaltung nach Sortiment ──');
{
  const mit = (rid, mods, uid) => {
    const st = sessionFor(rid);
    st.gema_lief_mods_v1 = JSON.stringify({ userId: uid || 'u_test', mods, ts: Date.now() });
    return loadAuth({ storage: st }).GemaAuth;
  };
  // fail-closed ohne Cache
  const ohne = loadAuth({ storage: sessionFor('role_lieferant') }).GemaAuth;
  ok(permCode(ohne, 'enthaertungsanlage') === '-', 'ohne Sortiment-Cache: Berechnung gesperrt (fail-closed)');
  ok(ohne.getLieferantModule().length === 0, 'ohne Cache: getLieferantModule() leer');

  // freigeschaltet = read UND write (er muss rechnen und speichern koennen)
  const a = mit('role_lieferant', ['enthaertungsanlage', 'osmose']);
  ok(permCode(a, 'enthaertungsanlage') === 'rw', 'freigeschaltet: read+write (rechnen + speichern)');
  ok(permCode(a, 'osmose') === 'rw', 'zweite Kategorie ebenfalls offen');
  ok(permCode(a, 'druckerhoehung') === '-', 'nicht gefuehrte Anlage bleibt gesperrt');
  ok(a.getLieferantModule().sort().join(',') === 'enthaertungsanlage,osmose', 'getLieferantModule() liefert die Liste');

  // Guards
  ok(permCode(mit('role_lieferant', ['erp']), 'erp') === '-',
    'Guard: nur BERECHNUNGS-Module freischaltbar (erp bleibt zu)');
  ok(permCode(mit('role_lieferant', ['objekte']), 'objekte') === '-',
    'Guard: PM-Module nicht ueber das Sortiment erreichbar');
  ok(permCode(mit('role_monteur', ['osmose']), 'osmose') === '-',
    'Guard: manipulierter Cache wirkt nur fuer Lieferanten-Rollen');
  ok(permCode(mit('role_lieferant', ['osmose'], 'fremder_user'), 'osmose') === '-',
    'Guard: Cache eines anderen Kontos greift nicht');

  // Prüfer sind KEINE Lieferanten — Sortiment-Freischaltung gilt fuer sie nicht
  ok(permCode(mit('role_pruefer', ['osmose']), 'osmose') === '-',
    'role_pruefer: keine Sortiment-Freischaltung (kein Produktkatalog)');
}

// ── C3) Kategorie → Modul: Abdeckung + Gueltigkeit ────────────────────
console.log('── C3: Sortiment-Map vollstaendig ──');
{
  const { GemaAuth } = loadAuth();
  const map = GemaAuth.getLieferantKatModule();
  const modKeys = GemaAuth.getModules().map(m => m.key);
  const calcCats = GemaAuth.getCalcCats();
  const calcKeys = GemaAuth.getModules().filter(m => calcCats.indexOf(m.cat) >= 0).map(m => m.key);

  let badKey = 0, badCalc = 0;
  for (const kat of Object.keys(map)) for (const mk of map[kat]) {
    if (modKeys.indexOf(mk) < 0) { badKey++; console.error('    unbekannter Modul-Key: ' + kat + ' → ' + mk); }
    else if (calcKeys.indexOf(mk) < 0) { badCalc++; console.error('    kein Berechnungsmodul: ' + kat + ' → ' + mk); }
  }
  ok(badKey === 0, 'alle Ziel-Module existieren in MODULES');
  ok(badCalc === 0, 'alle Ziel-Module sind Berechnungsmodule (sonst greift _liefModAllowed nie)');

  // Jede ANLAGEN-Kategorie des Firmenprofils braucht eine Berechnung
  const pk = read('gema_produktkatalog_api.js');
  const lk = pk.match(/var LIEF_KATEGORIEN = \[([\s\S]*?)\n\];/)[1];
  const anlagen = [...lk.matchAll(/\{id:'([a-z_]+)',label:'[^']*',gruppe:'(anlagen|material)'\}/g)].map(m => m[1]);
  ok(anlagen.length >= 18, 'LIEF_KATEGORIEN gelesen (' + anlagen.length + ' Anlagen-/Material-Kategorien)');
  anlagen.forEach(k => ok(!!map[k], 'Firmenprofil-Kategorie gemappt: ' + k));

  // Produktkategorien (ausser reinen Werkzeug-Sortimenten)
  const prodKats = [...pk.matchAll(/^KATEGORIEN\.([a-zA-Zä-ü_]+) = \{/gm)].map(m => m[1])
    .filter(k => k !== 'werkzeuge');
  prodKats.forEach(k => ok(!!map[k], 'Produktkategorie gemappt: ' + k));
}

// ── D) Dashboard-Seite ────────────────────────────────────────────────
console.log('── D: Einstieg auf der Dashboard-Seite ──');
{
  const d = read('sys_lieferant_dashboard.html');
  ok(/<a class="bc-cat" href="index\.html#lief">Lieferanten<\/a>/.test(d),
    'Breadcrumb «Lieferanten» → index.html#lief (Nav-Kanon)');
  ok(/\.bc-cat\{/.test(d), 'bc-cat-Styling vorhanden');
  ok(/id="meineBerechnungen"/.test(d), 'Karte «Berechnungen zu meinem Sortiment» im Markup');
  ok(/function renderMeineBerechnungen\(\)/.test(d), 'Renderer vorhanden');
  ok(/function _liefBerechnungenRefresh\(\)/.test(d), 'Refresh-Funktion vorhanden');
  // Refresh an allen drei Aenderungspunkten: Init, Kategorie-Toggle, Produkt-Anlage
  const refs = (d.match(/_liefBerechnungenRefresh\(\)/g) || []).length;
  ok(refs >= 4, 'Refresh an Init + Kategorie-Wechsel + Produkt-Anlage verdrahtet (' + refs + ' Aufrufe)');
  ok(/GemaAuth\.setLieferantModuleAusKategorien/.test(d),
    'meldet die Kategorien an die zentrale GemaAuth-API (kein zweiter Cloud-Roundtrip)');
  ok(/function _liefMeineKategorien\(\)/.test(d),
    'Kategorien-Quelle = Firmenprofil ∪ erfasste Produkte');
  ok(/renderMeineBerechnungen\(\); \}catch/.test(d), 'Renderer in try/catch (reisst die Übersicht nicht ab)');
}

// ── E) Empty-Read-Guard in der Refresh-Logik ──────────────────────────
console.log('── E: Empty-Read-Guard ──');
{
  const auth = read('gema_auth.js');
  const fn = auth.match(/function _liefModsRefresh\(user,cb\)\{[\s\S]*?\n  \}/)[0];
  ok(/if\(!rows\|\|!rows\.length\)\{cb\(null\);return;\}/.test(fn),
    'leere Katalog-Antwort schreibt den Cache NICHT (kein Rechteverlust bei Offline/RLS)');
  ok(/_liefModsWrite\(user,\[\]\)/.test(fn),
    'aber: Records da und keiner gehört mir → Cache wird geleert (echtes «kein Profil»)');
}

console.log('\n' + (fail ? '✗ ' + fail + ' Fehler, ' : '✓ ') + pass + ' Checks bestanden');
process.exit(fail ? 1 : 0);
