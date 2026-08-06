// Mischkreuz — Engine-Test gegen die Excel-Vorlage «Mischkreuz.xlsx»
// (Blatt Berechnung: WW=60 °C [Z15], KW=10 °C [Z17], MW=45 °C [Z19] →
// WW-Anteil M23 = 35, KW-Anteil M27 = 15, Spanne M29 = C29 = 50;
// mit Q = 30 l/min → Q_WW V23 = 21 l/min = 0.35 l/s, Q_KW V27 = 9 l/min
// = 0.15 l/s, Kontrolle V29 = 30 l/min) plus Grenzfälle, Fehlerpfade
// («kein stiller Deckel») und die Registrierung in allen geteilten Dateien.
//
//   node scripts/mischkreuz_engine_test.mjs
//
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function engineOf(file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
  if (!m) throw new Error('ENGINE-Block fehlt in ' + file);
  return m[1];
}

const scope = {};
new Function('S', engineOf('sb_mischkreuz.html') + `
S.MK_FLOW_UNITS=MK_FLOW_UNITS; S.mkNum=mkNum; S.mkLeer=mkLeer;
S.mkFlowUnit=mkFlowUnit; S.mkFlowToLmin=mkFlowToLmin; S.mkCalc=mkCalc;
`)(scope);
const E = scope;

let ok = 0, fail = 0;
function t(name, cond, info) {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}
function near(a, b, tol) { return a != null && Math.abs(a - b) <= (tol == null ? 1e-9 : tol); }

console.log('— Zahlen-Helfer & Einheiten —');
t('mkNum: Komma → Punkt', E.mkNum('0,5') === 0.5);
t("mkNum: Apostroph-Tausender", E.mkNum("1'200") === 1200);
t('mkNum: typografischer Apostroph', E.mkNum('1’200,5') === 1200.5);
t('mkNum: leer/ungültig → 0', E.mkNum('') === 0 && E.mkNum('abc') === 0 && E.mkNum(null) === 0);
t('mkLeer erkennt leere Eingaben', E.mkLeer('') && E.mkLeer('  ') && E.mkLeer(null) && !E.mkLeer('0'));
// Feedback 06.08.2026: l/s ist die Standard-Einheit (erste Position = Fallback), m³/h ergänzt.
t('mkFlowUnit: unbekannte id → l/s (Fallback = Standard)', E.mkFlowUnit('xyz').id === 'ls');
t('mkFlowUnit: Altwert l/min bleibt auflösbar (Bestandsschutz)', E.mkFlowUnit('lmin').id === 'lmin');
t('mkFlowToLmin: 30 l/min = 30', near(E.mkFlowToLmin('30', 'lmin'), 30));
t('mkFlowToLmin: 0.5 l/s = 30 l/min', near(E.mkFlowToLmin('0.5', 'ls'), 30));
t('mkFlowToLmin: 1800 l/h = 30 l/min', near(E.mkFlowToLmin('1800', 'lh'), 30));
t('mkFlowToLmin: 1.8 m³/h = 30 l/min', near(E.mkFlowToLmin('1.8', 'm3h'), 30));

console.log('— Mischungskreuz (Excel-Parität: WW 60 / KW 10 / MW 45) —');
const r0 = E.mkCalc({ q: '', qUnit: 'lmin', tw: '60', tk: '10', tm: '45' });
t('WW-Anteil = MW − KW = 35 K (Excel M23)', near(r0.anteilWw, 35));
t('KW-Anteil = WW − MW = 15 K (Excel M27)', near(r0.anteilKw, 15));
t('Spanne = WW − KW = 50 K (Excel C29 = M29)', near(r0.spanne, 50));
t('WW-Anteil 70 % / KW-Anteil 30 %', near(r0.pctWw, 70) && near(r0.pctKw, 30));
t('%-Summe = 100', near(r0.pctWw + r0.pctKw, 100));
t('ohne Q: status leer (grund q), Anteile stehen', r0.status === 'leer' && r0.grund === 'q' && r0.qWwLmin === null);

const r1 = E.mkCalc({ q: '30', qUnit: 'lmin', tw: '60', tk: '10', tm: '45' });
t('Q_WW = 21.00 l/min (Excel V23)', near(r1.qWwLmin, 21));
t('Q_WW = 0.35 l/s (Excel Z23)', near(r1.qWwLs, 0.35));
t('Q_KW = 9.00 l/min (Excel V27)', near(r1.qKwLmin, 9));
t('Q_KW = 0.15 l/s (Excel Z27)', near(r1.qKwLs, 0.15));
t('Kontrolle: Summe = 30.00 l/min (Excel V29)', near(r1.qSumLmin, 30));
t('Kontrolle: Summe = 0.50 l/s (Excel Z29)', near(r1.qSumLs, 0.5));
t('Q-Spiegel: 30 l/min = 0.5 l/s (Excel Z13)', near(r1.qLmin, 30) && near(r1.qLs, 0.5));
t('Wärmebilanz: Q_WW·WW + Q_KW·KW = Q·MW', near(r1.qWwLmin * 60 + r1.qKwLmin * 10, 30 * 45, 1e-9));
t('status ok', r1.status === 'ok' && r1.fehler.length === 0);

console.log('— Einheiten der Eingabe —');
const rLs = E.mkCalc({ q: '0.5', qUnit: 'ls', tw: '60', tk: '10', tm: '45' });
t('Eingabe 0.5 l/s → identisch zu 30 l/min', near(rLs.qWwLmin, 21) && near(rLs.qKwLmin, 9));
const rLh = E.mkCalc({ q: '1800', qUnit: 'lh', tw: '60', tk: '10', tm: '45' });
t('Eingabe 1800 l/h → identisch zu 30 l/min', near(rLh.qWwLmin, 21) && near(rLh.qKwLmin, 9));
const rK = E.mkCalc({ q: '0,5', qUnit: 'ls', tw: '60', tk: '10', tm: '45' });
t('Komma-Eingabe «0,5» l/s wird geparst', near(rK.qWwLmin, 21));

console.log('— Grenzfälle —');
const rTk = E.mkCalc({ q: '30', qUnit: 'lmin', tw: '60', tk: '10', tm: '10' });
t('MW = KW → Q_WW = 0, Q_KW = Q', near(rTk.qWwLmin, 0) && near(rTk.qKwLmin, 30) && rTk.status === 'ok');
const rTw = E.mkCalc({ q: '30', qUnit: 'lmin', tw: '60', tk: '10', tm: '60' });
t('MW = WW → Q_WW = Q, Q_KW = 0', near(rTw.qWwLmin, 30) && near(rTw.qKwLmin, 0) && rTw.status === 'ok');
const rNeg = E.mkCalc({ q: '-5', qUnit: 'lmin', tw: '60', tk: '10', tm: '45' });
t('negatives Q → leer (grund q), keine Volumenströme', rNeg.status === 'leer' && rNeg.grund === 'q' && rNeg.qWwLmin === null);
const rZ0 = E.mkCalc({ q: '0', qUnit: 'lmin', tw: '60', tk: '10', tm: '45' });
t('Q = 0 (Excel-Beispiel Z12) → leer, Anteile stehen', rZ0.status === 'leer' && near(rZ0.anteilWw, 35));

console.log('— Fehlerpfade (kein stiller Deckel — gemeldet statt geklemmt) —');
const rE1 = E.mkCalc({ q: '30', qUnit: 'lmin', tw: '10', tk: '10', tm: '10' });
t('WW = KW → fehler ww_kw (Division durch 0 verhindert)', rE1.status === 'fehler' && rE1.fehler.indexOf('ww_kw') >= 0);
const rE2 = E.mkCalc({ q: '30', qUnit: 'lmin', tw: '10', tk: '60', tm: '45' });
t('WW < KW → fehler ww_kw', rE2.status === 'fehler' && rE2.fehler.indexOf('ww_kw') >= 0);
const rE3 = E.mkCalc({ q: '30', qUnit: 'lmin', tw: '60', tk: '10', tm: '5' });
t('MW < KW → fehler tm_bereich (kein negativer Anteil)', rE3.status === 'fehler' && rE3.fehler.indexOf('tm_bereich') >= 0);
const rE4 = E.mkCalc({ q: '30', qUnit: 'lmin', tw: '60', tk: '10', tm: '65' });
t('MW > WW → fehler tm_bereich', rE4.status === 'fehler' && rE4.fehler.indexOf('tm_bereich') >= 0);
t('im Fehlerfall keine Anteile/Volumenströme', rE3.anteilWw === null && rE3.qWwLmin === null);
const rLeer = E.mkCalc({ q: '', qUnit: 'lmin', tw: '', tk: '', tm: '' });
t('alle Temperaturen leer → leer (grund temp), kein Fehler', rLeer.status === 'leer' && rLeer.grund === 'temp');

console.log('— Weitere Rechenprobe (WW 55 / KW 12 / MW 38, Q = 0.4 l/s) —');
const r2 = E.mkCalc({ q: '0.4', qUnit: 'ls', tw: '55', tk: '12', tm: '38' });
t('Anteile 26 / 17 / 43 K', near(r2.anteilWw, 26) && near(r2.anteilKw, 17) && near(r2.spanne, 43));
t('Q_WW = 24·26/43 l/min', near(r2.qWwLmin, 24 * 26 / 43, 1e-9));
t('Q_KW = 24·17/43 l/min', near(r2.qKwLmin, 24 * 17 / 43, 1e-9));
t('Summe = Q', near(r2.qSumLmin, 24, 1e-9));
t('Wärmebilanz geht auf', near(r2.qWwLmin * 55 + r2.qKwLmin * 12, 24 * 38, 1e-9));

console.log('— Registrierung in den geteilten Dateien (Drift-Guard) —');
const auth = readFileSync(join(ROOT, 'gema_auth.js'), 'utf8');
t("gema_auth MODULES: key 'mischkreuz'", auth.indexOf("key:'mischkreuz'") >= 0);
t("gema_auth FILE_MAP: 'sb_mischkreuz'", auth.indexOf("'sb_mischkreuz':'mischkreuz'") >= 0);
const idx = readFileSync(join(ROOT, 'sb_index.html'), 'utf8');
t('sb_index: Kachel verlinkt', idx.indexOf('href="sb_mischkreuz.html"') >= 0);
t('sb_index: ALL_MODULES-Eintrag', idx.indexOf('url:"sb_mischkreuz.html"') >= 0);
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
t('sw.js: im Cache-Array', sw.indexOf("'/sb_mischkreuz.html'") >= 0);
const rec = readFileSync(join(ROOT, 'gema_recent.js'), 'utf8');
t('gema_recent: PAGE_LABELS', rec.indexOf("'sb_mischkreuz'") >= 0);
const ws = readFileSync(join(ROOT, 'sys_workspace.html'), 'utf8');
t('sys_workspace: MODULES-Eintrag', ws.indexOf("id:'sb_mischkreuz'") >= 0);
t('sys_workspace: _WS_STATUS_CFG', ws.indexOf("sb_mischkreuz:{data:'gema_mischkreuz'}") >= 0);
const page = readFileSync(join(ROOT, 'sb_mischkreuz.html'), 'utf8');
t('Modul: kein type="number"', page.indexOf('type="number"') < 0);
t('Modul: fixLeadingZero an den Zahlenfeldern', page.indexOf('fixLeadingZero') >= 0);
t('Modul: GemaAutoSave.init(\'mischkreuz\')', page.indexOf("GemaAutoSave.init('mischkreuz')") >= 0);
t('Modul: Snapshot-Fallback mkSnapshotLoad', page.indexOf('function mkSnapshotLoad') >= 0);
t('Modul: Schema window-exponiert (_mkSchemaDraw)', page.indexOf('window._mkSchemaDraw') >= 0);
t('Modul: gema_sektion + gema_print eingebunden', page.indexOf('gema_sektion.js') >= 0 && page.indexOf('gema_print.js') >= 0);
t('Modul: Breadcrumb-Kanon (sb_index → Sanitärberechnungen)', /bc-cat" href="sb_index\.html">Sanitärberechnungen</.test(page));

console.log('\n' + ok + ' ok, ' + fail + ' fehlgeschlagen');
if (fail) process.exit(1);
