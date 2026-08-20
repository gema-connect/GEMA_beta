// Lebensdauer-Katalog + Engine — Drift-Guard für gema_lebensdauer_api.js
// (Paritätische Lebensdauertabelle MV/HEV + S+P-Systemvergleich Innen-
// beschichtung). Prüft die Rechenkette Einbaujahr + Lebensdauer →
// Lebensende/Alter/Rest/Ampel (Referenzbeispiel des Auftrags:
// 1995 + 50 Jahre → 2045), die Nutzungsreduktion (Büro 20 % / Laden 25 % /
// Restaurant 50 %), die Umlaut-feste Suche über die vom Auftrag genannten
// Materialien (Chrom-Nickel-Stahl, PEX, Guss, PE Silent, Kupfer,
// verzinkter Stahl), die Katalog-Integrität (stabile ids, Quellen-
// Ehrlichkeit: GEMA-Richtwerte tragen IMMER einen hinweis), die
// Beschichtungs-Systemwerte 1:1 aus der Machbarkeitsstudie und den
// PUREN Org-Merge ldEffektiv (Override gewinnt, Tombstone blendet aus,
// eigene Einträge hängen an, Defaults bleiben unangetastet).
//
//   node scripts/lebensdauer_engine_test.mjs
//
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const api = require(join(ROOT, 'gema_lebensdauer_api.js'));
const E = api._engine;

let ok = 0, fail = 0;
function t(name, cond, info) {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}

// ───────────────────────────────────────────────────────────────
console.log('— Kern-Berechnung ldBerechne —');
const r = E.ldBerechne(1995, 50, 2026);
t('Referenzbeispiel: 1995 + 50 → Lebensende 2045', r && r.lebensende === 2045, JSON.stringify(r));
t('… Alter 31', r && r.alter === 31);
t('… Rest 19', r && r.rest === 19);
t('… 62 % verbraucht', r && r.verbrauchtPct === 62);
t('… Ampel grün', r && r.ampel === 'gruen');
t('… Eingaben normalisiert zurückgegeben', r && r.einbaujahr === 1995 && r.jahre === 50);

const rRot = E.ldBerechne(1980, 30, 2026);
t('Überschritten: 1980 + 30 @2026 → rest −16, rot', rRot && rRot.rest === -16 && rRot.ampel === 'rot', JSON.stringify(rRot));
t('… Lebensende 2010, 153 % verbraucht', rRot && rRot.lebensende === 2010 && rRot.verbrauchtPct === 153);

const rGelb = E.ldBerechne(2000, 30, 2026);
t('Bald fällig: 2000 + 30 @2026 → rest 4 ≤ max(2, 6), gelb', rGelb && rGelb.rest === 4 && rGelb.ampel === 'gelb', JSON.stringify(rGelb));

const rGrenze = E.ldBerechne(2020, 6, 2026);
t('Grenze rest 0 → rot (nicht gelb)', rGrenze && rGrenze.rest === 0 && rGrenze.ampel === 'rot');

const rZukunft = E.ldBerechne(2030, 50, 2026);
t('Einbau in der Zukunft: Alter klemmt auf 0', rZukunft && rZukunft.alter === 0 && rZukunft.rest === 54);

t('String-Eingaben werden geparst', (() => { const x = E.ldBerechne('1995', '50', '2026'); return x && x.lebensende === 2045; })());
t('heute ohne Angabe = aktuelles Jahr', (() => {
  const now = new Date().getFullYear();
  const x = E.ldBerechne(1995, 50);
  return x && x.lebensende === 2045 && x.alter === now - 1995;
})());

console.log('— Fehlerpfade (kein stiller Deckel) —');
t('Einbaujahr ausserhalb 1800–2200 → null', E.ldBerechne(1750, 50, 2026) === null && E.ldBerechne(2300, 50, 2026) === null);
t('Einbaujahr unlesbar → null', E.ldBerechne('abc', 50, 2026) === null && E.ldBerechne('', 50, 2026) === null && E.ldBerechne(null, 50, 2026) === null);
t('Lebensdauer 0 / negativ / unlesbar → null', E.ldBerechne(1995, 0, 2026) === null && E.ldBerechne(1995, -5, 2026) === null && E.ldBerechne(1995, 'x', 2026) === null);

// ───────────────────────────────────────────────────────────────
console.log('— Ampel ldAmpel —');
t('rest ≤ 0 → rot', E.ldAmpel(0, 50) === 'rot' && E.ldAmpel(-3, 50) === 'rot');
t('20 %-Schwelle: rest 10 von 50 → gelb, rest 11 → grün', E.ldAmpel(10, 50) === 'gelb' && E.ldAmpel(11, 50) === 'gruen');
t('Mindest-Schwelle 2 Jahre bei kurzen Lebensdauern (rest 2 von 6 → gelb)', E.ldAmpel(2, 6) === 'gelb' && E.ldAmpel(3, 6) === 'gruen');
t('ungültige Werte → null', E.ldAmpel(NaN, 50) === null && E.ldAmpel(5, 0) === null && E.ldAmpel(5, -1) === null);
t('AMPEL-Infos vollständig (label + literale Hex-Farben)', ['gruen', 'gelb', 'rot'].every(a => {
  const i = E.LD_AMPEL[a];
  return i && i.label && /^#[0-9a-f]{6}$/i.test(i.farbe) && /^#[0-9a-f]{6}$/i.test(i.bg);
}));

// ───────────────────────────────────────────────────────────────
console.log('— Nutzungsreduktion ldReduktion (Paritätische Tabelle) —');
t('Wohnen: keine Reduktion (20 → 20)', E.ldReduktion(20, 'wohnen') === 20);
t('Büro −20 %: 15 → 12', E.ldReduktion(15, 'buero') === 12);
t('Laden −25 %: 20 → 15', E.ldReduktion(20, 'laden') === 15);
t('Restaurant −50 %: 20 → 10', E.ldReduktion(20, 'restaurant') === 10);
t('mind. 1 Jahr bleibt (1 Jahr Restaurant → 1)', E.ldReduktion(1, 'restaurant') === 1);
t('unbekannte Nutzung = keine Reduktion', E.ldReduktion(20, 'xyz') === 20 && E.ldReduktion(20, null) === 20);
t('ungültige Jahre → null', E.ldReduktion(0, 'buero') === null && E.ldReduktion('x', 'buero') === null);
t('NUTZUNGEN: 4 Stufen mit den paritätischen Sätzen 0/20/25/50', (() => {
  const m = {}; E.LD_NUTZUNGEN.forEach(n => m[n.id] = n.reduktionPct);
  return m.wohnen === 0 && m.buero === 20 && m.laden === 25 && m.restaurant === 50;
})());

// ───────────────────────────────────────────────────────────────
console.log('— Suche ldNorm / ldSucheIn —');
t('ldNorm faltet Umlaute (Küche → kueche)', E.ldNorm('Küche') === 'kueche');
t('ldNorm wirft Satzzeichen (Chrom-Nickel-Stahl → chrom nickel stahl)', E.ldNorm('Chrom-Nickel-Stahl') === 'chrom nickel stahl');
t('leere Suche liefert die ganze Liste', E.ldSucheIn(E.LD_KATALOG, '').length === E.LD_KATALOG.length);

function findet(q, id) {
  return E.ldSucheIn(E.LD_KATALOG, q).some(e => e.id === id);
}
t('«Chrom-Nickel-Stahl» findet die CNS-Wasserleitung', findet('Chrom-Nickel-Stahl', 'lt_kw_chromstahl'));
t('«cns» findet die CNS-Wasserleitung (Tag)', findet('cns', 'lt_kw_chromstahl'));
t('«pex» findet das PEX-Verbundrohr', findet('pex', 'lt_pex_verbund'));
t('«guss» findet die Abwasserleitung Guss', findet('guss', 'lt_aw_guss'));
t('«pe silent» findet die schallgedämmte Abwasserleitung', findet('pe silent', 'lt_aw_pe_silent'));
t('«kupfer» findet die Kupfer-Kaltwasserleitung', findet('kupfer', 'lt_kw_kupfer'));
t('«verzinkt» findet die verzinkte Stahlleitung', findet('verzinkt', 'lt_kw_stahl_verzinkt'));
t('alle Suchwörter müssen treffen («kupfer warmwasser» → nur WW-Leitung)', (() => {
  const res = E.ldSucheIn(E.LD_KATALOG, 'kupfer warmwasser');
  return res.some(e => e.id === 'lt_ww_kupfer') && !res.some(e => e.id === 'lt_kw_kupfer');
})());
t('Suche mit Umlaut-Eingabe («küche») trifft Küchen-Einträge', E.ldSucheIn(E.LD_KATALOG, 'küche').some(e => e.kat === 'kueche'));

// ───────────────────────────────────────────────────────────────
console.log('— Katalog-Integrität —');
const ids = new Set();
let dupe = null;
E.LD_KATALOG.forEach(e => { if (ids.has(e.id)) dupe = e.id; ids.add(e.id); });
t('ids eindeutig (' + E.LD_KATALOG.length + ' Einträge)', dupe === null, 'doppelt: ' + dupe);
t('Katalog umfangreich (≥ 150 Einträge)', E.LD_KATALOG.length >= 150, String(E.LD_KATALOG.length));
const katIds = new Set(E.LD_KATEGORIEN.map(k => k.id));
t('jede kat existiert in LD_KATEGORIEN', E.LD_KATALOG.every(e => katIds.has(e.kat)),
  E.LD_KATALOG.filter(e => !katIds.has(e.kat)).map(e => e.id).join(','));
t('jahre überall > 0 und ganzzahlig', E.LD_KATALOG.every(e => Number.isInteger(e.jahre) && e.jahre > 0),
  E.LD_KATALOG.filter(e => !(Number.isInteger(e.jahre) && e.jahre > 0)).map(e => e.id).join(','));
t('quelle überall gültig (mv/mbs/gema)', E.LD_KATALOG.every(e => ['mv', 'mbs', 'gema'].indexOf(e.quelle) >= 0),
  E.LD_KATALOG.filter(e => ['mv', 'mbs', 'gema'].indexOf(e.quelle) < 0).map(e => e.id).join(','));
t('Quellen-Ehrlichkeit: JEDE gema-Quelle trägt einen hinweis', E.LD_KATALOG.filter(e => e.quelle === 'gema').every(e => e.hinweis && e.hinweis.length > 10),
  E.LD_KATALOG.filter(e => e.quelle === 'gema' && !(e.hinweis && e.hinweis.length > 10)).map(e => e.id).join(','));
t('mbs-Quellen (Beschichtungen) tragen den Hersteller-/Garantie-Hinweis', E.LD_KATALOG.filter(e => e.quelle === 'mbs').every(e => e.hinweis && /Hersteller/.test(e.hinweis)));
t('Namen mit echten Umlauten (kein ae/oe/ue im UI-Text)', E.LD_KATALOG.some(e => /[äöü]/.test(e.name)) && !E.LD_KATALOG.some(e => /\b(Kueche|Waende|Tuere)\b/.test(e.name)));

// Stichproben gegen die Paritätische Tabelle (Werte 1:1 aus dem PDF)
function wert(id) { const e = E.LD_KATALOG.find(x => x.id === id); return e ? e.jahre : null; }
t('MV: Kaltwasser Stahl verzinkt 30 J.', wert('lt_kw_stahl_verzinkt') === 30);
t('MV: Wasserleitung Chromstahl 50 J.', wert('lt_kw_chromstahl') === 50);
t('MV: Kaltwasser Kupfer 50 J. / Warmwasser Kupfer 50 J.', wert('lt_kw_kupfer') === 50 && wert('lt_ww_kupfer') === 50);
t('MV: PEX-Verbundrohr 30 J.', wert('lt_pex_verbund') === 30);
t('MV: Gasleitung Stahl 50 J. / Heizungsleitungen Metall 50 J.', wert('lt_gas_stahl') === 50 && wert('lt_hz_metall') === 50);
t('GEMA-Richtwert: Abwasser Guss 50 J. / PE Silent 50 J.', wert('lt_aw_guss') === 50 && wert('lt_aw_pe_silent') === 50);
t('MV: Elektroboiler 20 J. / Einzelboiler 15 J.', wert('ww_elektroboiler') === 20 && wert('ww_einzelboiler') === 15);
t('MV: Keramik-Apparate 35 J. / Mischbatterie 20 J.', wert('bd_keramik') === 35 && wert('bd_mischbatterie') === 20);
t('MV: Kittfugen Bad 8 J. / Spülkasten UP 40 J.', wert('bd_fugen') === 8 && wert('bd_spuelkasten_up') === 40);
t('MV: Radiator 50 J. / Bodenheizung 30 J. / Wärmepumpe 20 J.', wert('hz_radiator') === 50 && wert('hz_bodenheizung') === 30 && wert('hz_waermepumpe') === 20);
t('MV: Massivparkett 40 J. / Laminat 31 10 J.', wert('bo_massivparkett') === 40 && wert('bo_laminat31') === 10);
t('MV: Elektroleitungen 40 J. / Liftanlage 30 J.', wert('el_leitungen') === 40 && wert('ab_lift') === 30);
t('MV: Enthärtungsanlage 20 J.', wert('ge_enthaertung') === 20);

// ───────────────────────────────────────────────────────────────
console.log('— Beschichtungs-Systeme (S+P-Systemvergleich, 1:1) —');
const besch = {}; E.LD_BESCHICHTUNGEN.forEach(b => besch[b.id] = b);
t('3 Systeme: Promotec, Anrosan, Risan', E.LD_BESCHICHTUNGEN.length === 3 && besch.promotec && besch.anrosan && besch.risan);
t('Promotec: Garantie 5 J., Haltbarkeit 30 J., organisch/Epoxidharz', besch.promotec.garantieJahre === 5 && besch.promotec.haltbarkeitJahre === 30 && besch.promotec.art === 'organisch');
t('Anrosan: Garantie 5 J., Haltbarkeit 35 J., anorganisch/Zement', besch.anrosan.garantieJahre === 5 && besch.anrosan.haltbarkeitJahre === 35 && besch.anrosan.art === 'anorganisch');
t('Risan: Garantie 10 J., Haltbarkeit 10 J.', besch.risan.garantieJahre === 10 && besch.risan.haltbarkeitJahre === 10);
t('Kriterien-Matrix: nur Risan saniert Kupfer + Edelstahl', besch.risan.kriterien.sanierbarKupfer === '+' && besch.risan.kriterien.sanierbarEdelstahl === '+'
  && besch.promotec.kriterien.sanierbarKupfer === '-' && besch.anrosan.kriterien.sanierbarKupfer === '-');
t('Kriterien-Matrix: alle drei sanieren verzinkten Stahl, keines Kunststoff', E.LD_BESCHICHTUNGEN.every(b => b.kriterien.sanierbarVerzinkt === '+' && b.kriterien.sanierbarKunststoff === '-'));
t('Kriterien-Matrix: SVGW/DVGW-Zulassung bei keinem System', E.LD_BESCHICHTUNGEN.every(b => b.kriterien.zulassung === '-'));
t('Kriterien-Matrix: nur Risan dauerhaft über 65 °C', besch.risan.kriterien.tempDauer65 === '+' && besch.promotec.kriterien.tempDauer65 === '-' && besch.anrosan.kriterien.tempDauer65 === '-');
t('jedes System beantwortet ALLE Kriterien mit +/o/-', E.LD_BESCHICHTUNGEN.every(b => E.LD_BESCH_KRITERIEN.every(k => ['+', 'o', '-'].indexOf(b.kriterien[k.id]) >= 0)));
t('jedes System trägt einen Auswahlgrund-Standardtext', E.LD_BESCHICHTUNGEN.every(b => b.auswahlgrund && b.auswahlgrund.length > 50));
t('Katalog-Einträge decken sich mit den Systemwerten (Haltbarkeit)', wert('be_promotec') === 30 && wert('be_anrosan') === 35 && wert('be_risan') === 10);

// ───────────────────────────────────────────────────────────────
console.log('— Org-Merge ldEffektiv (PURE) —');
const defaults = [
  { id: 'a', kat: 'leitungen', gruppe: 'G', name: 'Alpha', jahre: 30, quelle: 'mv' },
  { id: 'b', kat: 'leitungen', gruppe: 'G', name: 'Beta', jahre: 50, quelle: 'mv', hinweis: 'orig' }
];
const tiefKopie = JSON.stringify(defaults);

const m1 = E.ldEffektiv(defaults, [{ id: 'ldo_org1_a', basisId: 'a', jahre: 45, hinweis: 'angepasst' }]);
t('Override gewinnt: jahre 45, hinweis übernommen', m1[0].jahre === 45 && m1[0].hinweis === 'angepasst');
t('Override: quelle wird org, basisId + orgRecordId gesetzt', m1[0].quelle === 'org' && m1[0].basisId === 'a' && m1[0].orgRecordId === 'ldo_org1_a');
t('Override: unangefasste Felder bleiben (name Alpha)', m1[0].name === 'Alpha' && m1[0].id === 'a');
t('nicht überschriebene Einträge unverändert (b bleibt mv)', m1[1].quelle === 'mv' && m1[1].jahre === 50);

const m2 = E.ldEffektiv(defaults, [{ id: 'ldo_org1_b', basisId: 'b', deleted: true }]);
t('Tombstone blendet den Standard aus', m2.length === 1 && m2[0].id === 'a');

const m3 = E.ldEffektiv(defaults, [{ id: 'ldn_1', name: 'Eigenes Rohr', kat: 'leitungen', jahre: 40 }]);
t('eigener Eintrag wird angehängt (quelle org)', m3.length === 3 && m3[2].id === 'ldn_1' && m3[2].quelle === 'org' && m3[2].jahre === 40);
t('eigener Eintrag: Defaults für fehlende Felder', m3[2].gruppe === '' && Array.isArray(m3[2].tags));

t('leere Override-Felder gewinnen NICHT (jahre undefined/null/"")', (() => {
  const m = E.ldEffektiv(defaults, [{ id: 'ldo_org1_a', basisId: 'a', jahre: null, name: '' }]);
  return m[0].jahre === 30 && m[0].name === 'Alpha' && m[0].quelle === 'org';
})());
t('ohne Records = Defaults 1:1', (() => {
  const m = E.ldEffektiv(defaults, []);
  return m.length === 2 && m[0] === defaults[0] && m[1] === defaults[1];
})());
t('gelöschter eigener Eintrag erscheint nicht', E.ldEffektiv(defaults, [{ id: 'ldn_2', name: 'X', deleted: true }]).length === 2);
t('Defaults bleiben unmutiert (kein Seiteneffekt)', JSON.stringify(defaults) === tiefKopie);

// ───────────────────────────────────────────────────────────────
console.log('— Öffentliche API (ohne Browser) —');
t('alle() liefert den Standard-Katalog (keine Org ohne Login)', api.alle().length === E.LD_KATALOG.length);
t('byId löst auf', api.byId('lt_kw_chromstahl') && api.byId('lt_kw_chromstahl').jahre === 50);
t('suche mit Kategorie-Filter', api.suche('kupfer', { kat: 'leitungen' }).every(e => e.kat === 'leitungen'));
t('kategorie() + quelleLabel()', api.kategorie('leitungen').label.indexOf('Leitungen') === 0 && api.quelleLabel('mv').indexOf('Paritätische') === 0);
t('berechneFuer: CNS ab 1995 → 2045, grün', (() => {
  const x = api.berechneFuer('lt_kw_chromstahl', 1995, 2026);
  return x && x.lebensende === 2045 && x.ampel === 'gruen' && x.eintrag.id === 'lt_kw_chromstahl' && x.nutzungId === 'wohnen';
})());
t('berechneFuer mit Nutzung Restaurant: 50 → 25 J.', (() => {
  const x = api.berechneFuer('lt_kw_chromstahl', 2010, 2026, 'restaurant');
  return x && x.jahre === 25 && x.jahreBasis === 50 && x.lebensende === 2035 && x.nutzungId === 'restaurant';
})());
t('berechneFuer: unbekannte id → null', api.berechneFuer('gibts_nicht', 1995, 2026) === null);
t('speichern/entfernen ohne Org → null/false (fail-closed)', api.speichern({ basisId: 'lt_kw_kupfer', jahre: 45 }) === null && api.entfernen('lt_kw_kupfer') === false);
t('ampelInfo liefert Label', api.ampelInfo('rot').label.indexOf('überschritten') > 0 && api.ampelInfo('xx') === null);

// ───────────────────────────────────────────────────────────────
console.log('— Registrierung (geteilte Dateien) —');
function file(p) { try { return readFileSync(join(ROOT, p), 'utf8'); } catch (e) { return ''; } }
const auth = file('gema_auth.js');
t('gema_auth: MODULES kennt lebensdauer + machbarkeitsstudie', auth.indexOf("'lebensdauer'") >= 0 && auth.indexOf("'machbarkeitsstudie'") >= 0);
t('gema_auth: FILE_MAP kennt pm_lebensdauer + pm_machbarkeitsstudie', auth.indexOf("'pm_lebensdauer'") >= 0 && auth.indexOf("'pm_machbarkeitsstudie'") >= 0);
const sw = file('sw.js');
t('sw.js cached beide Seiten + die API', sw.indexOf('/pm_lebensdauer.html') >= 0 && sw.indexOf('/pm_machbarkeitsstudie.html') >= 0 && sw.indexOf('/gema_lebensdauer_api.js') >= 0);
const idx = file('index.html');
t('index.html: beide Kacheln registriert', idx.indexOf('data-module="lebensdauer"') >= 0 && idx.indexOf('data-module="machbarkeitsstudie"') >= 0);
const rec = file('gema_recent.js');
t('gema_recent: PAGE_LABELS für beide Seiten', rec.indexOf("'pm_lebensdauer'") >= 0 && rec.indexOf("'pm_machbarkeitsstudie'") >= 0);
const ws = file('sys_workspace.html');
t('sys_workspace: MODULES kennt beide Seiten', ws.indexOf("id:'pm_lebensdauer'") >= 0 && ws.indexOf("id:'pm_machbarkeitsstudie'") >= 0);

console.log('');
console.log('Ergebnis: ' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
