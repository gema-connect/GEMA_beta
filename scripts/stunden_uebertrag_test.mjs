// Drift-Guard — Ferien-/Überzeitübertrag in pm_stunden
//
// GEMA rechnet die Jahresbilanz aus den Tagesrapporten. Ohne Übertrag beginnt
// deshalb jedes Jahr bei null: ein Ferienrest vom 31.12. wäre am 1.1. weg, und
// nach einer Migration stünden alle Mitarbeitenden auf null, weil die Jahre
// davor gar keine Tagesrapporte haben.
//
// Der Übertrag schliesst diese Lücke. Die beiden Fallen dabei:
//
//   1. Das Guthaben des Übertrags ENTHÄLT bereits den Anspruch der neuen
//      Periode (Altsystem: Knopf «Ferienguthaben berechnen»). Wer den
//      Jahresanspruch zusätzlich addiert, gibt jeder Person die Ferien doppelt.
//   2. Das Guthaben steht in STUNDEN, GEMA rechnet in TAGEN. Der Teiler ist das
//      Tagessoll DES MITARBEITERS (inkl. Pensum) — und ohne Vorholzeit, denn
//      die erhöht das Arbeitssoll, nicht den Wert eines Ferientages.
//
// Aufruf:  node scripts/stunden_uebertrag_test.mjs
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
function nah(name, a, b, eps = 0.005) {
  const ok = Math.abs(a - b) <= eps;
  t(name + (ok ? '' : ' → ' + a + ' ≠ ' + b), ok);
}

const html = fs.readFileSync(path.join(ROOT, 'pm_stunden.html'), 'utf8');
const eng = html.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const E = new Function(eng + ';return {stdJahresAuswertung,stdFerienAnspruch,stdParams,' +
  'stdParamsFuerMitarbeiter,stdWochenStart,stdTagSollH,stdTagTyp};')();

const p100 = E.stdParams({ wochenSoll: 40, ferienTage: 25, vorholProWocheH: 0 });
const tag = (d, h) => ({ datum: d, eintraege: [{ von: '08:00', bis: h }], spesen: {} });
const ferientag = (d) => ({ datum: d, eintraege: [], spesen: {}, absenz: { typ: 'ferien' } });

console.log('\n═══ A — ohne Übertrag bleibt alles wie bisher ═══');
{
  const a = E.stdJahresAuswertung([], 2026, p100, {});
  nah('Anspruch = 25 Tage', a.ferienAnspruch, 25);
  t('nicht als Übertrag markiert', a.ferienAusUebertrag === false);
  nah('Saldo startet bei 0', a.saldo, 0);
  t('kein Stichtag ausgewiesen', a.uebertragDatum === '');
}

console.log('\n═══ B — Guthaben in Stunden → Tage über das Tagessoll ═══');
{
  // Der echte Wert aus dem Altbestand: 248.75 h per 01.01.2026.
  const b = E.stdJahresAuswertung([], 2026, p100,
    { uebertrag: { datum: '2026-01-01', ferienH: 248.75, ueberzeitH: 15.25 } });
  nah('248.75 h ÷ 8 h = 31.09 Tage', b.ferienAnspruch, 248.75 / 8);
  t('als Übertrag markiert', b.ferienAusUebertrag === true);
  nah('Überzeit wird zum Startwert des Saldos', b.saldo, 15.25);
  nah('das reine Jahresergebnis bleibt separat', b.saldoJahr, 0);
  t('Stichtag wird ausgewiesen', b.uebertragDatum === '2026-01-01');
  nah('Guthaben in Stunden bleibt abrufbar', b.uebertragFerienH, 248.75);
  // Der Kern: NICHT zusätzlich der Jahresanspruch.
  t('Gegenprobe: 25 Tage werden NICHT aufaddiert',
    Math.abs(b.ferienAnspruch - (248.75 / 8 + 25)) > 1);
}

console.log('\n═══ C — Pensum: Guthaben und Tageswert schrumpfen gemeinsam ═══');
{
  const p80 = E.stdParamsFuerMitarbeiter(p100, { pensum: 80 });
  nah('Tagessoll 80 % = 6.4 h', p80.wochenSoll / 5, 6.4);
  // Das Altsystem führt das Guthaben bereits pensumsreduziert (200 h → 160 h).
  const c = E.stdJahresAuswertung([], 2026, p80,
    { uebertrag: { datum: '2026-01-01', ferienH: 160, ueberzeitH: 0 } });
  nah('160 h bei 6.4 h/Tag = 25 Tage', c.ferienAnspruch, 25);
  // Und 200 h (GAV-Vollzeit) bei Vollzeit ergeben ebenfalls 25 Tage.
  const v = E.stdJahresAuswertung([], 2026, p100,
    { uebertrag: { datum: '2026-01-01', ferienH: 200, ueberzeitH: 0 } });
  nah('200 h bei 8 h/Tag = 25 Tage', v.ferienAnspruch, 25);
}

console.log('\n═══ D — Vorholzeit ist kein Teiler ═══');
{
  // stdTagSollH enthält die Vorholzeit (Arbeitssoll). Als Teiler genommen
  // ergäben 200 h nur noch 23.5 Tage — das Guthaben wäre gekürzt.
  const pv = E.stdParams({ wochenSoll: 40, ferienTage: 25, vorholProWocheH: 2.5 });
  nah('stdTagSollH enthält die Vorholzeit', E.stdTagSollH(pv), 8.5);
  const d = E.stdJahresAuswertung([], 2026, pv,
    { uebertrag: { datum: '2026-01-01', ferienH: 200, ueberzeitH: 0 } });
  nah('200 h bleiben 25 Tage', d.ferienAnspruch, 25);
  t('Gegenprobe: nicht über 8.5 h geteilt',
    Math.abs(d.ferienAnspruch - 200 / 8.5) > 1);
}

console.log('\n═══ E — nur der Stichtag DIESES Jahres zählt ═══');
{
  const e = E.stdJahresAuswertung([], 2026, p100,
    { uebertrag: { datum: '2025-01-01', ferienH: 999, ueberzeitH: 99 } });
  nah('Vorjahres-Übertrag greift nicht', e.ferienAnspruch, 25);
  nah('und schiebt auch den Saldo nicht', e.saldo, 0);
  t('nicht als Übertrag markiert', e.ferienAusUebertrag === false);
}

console.log('\n═══ F — Zählfenster ab Stichtag ═══');
{
  // Ein Ferientag VOR dem Stichtag darf ein Guthaben, das erst ab Oktober
  // gilt, nicht belasten.
  const tage = [ferientag('2026-03-10'), ferientag('2026-11-10')];
  const ganz = E.stdJahresAuswertung(tage, 2026, p100,
    { uebertrag: { datum: '2026-01-01', ferienH: 200, ueberzeitH: 0 } });
  nah('Stichtag 1.1. → beide Tage zählen', ganz.ferienBezogen, 2);
  const ab = E.stdJahresAuswertung(tage, 2026, p100,
    { uebertrag: { datum: '2026-10-01', ferienH: 200, ueberzeitH: 0 } });
  nah('Stichtag 1.10. → nur der Novembertag zählt', ab.ferienBezogen, 1);
  // Ohne Übertrag bleibt das alte Verhalten (ganzes Jahr).
  const ohne = E.stdJahresAuswertung(tage, 2026, p100, {});
  nah('ohne Übertrag zählt das ganze Jahr', ohne.ferienBezogen, 2);
}
{
  // BEWUSST ÜBERSTEUERT (Review 2026-09-08): vorher begann die Zählung am
  // Montag VOR dem Stichtag — Tage, die schon im übernommenen Saldo stecken,
  // zählten doppelt (12-h-Tage Mo–Mi + Übertrag 10 → 22 statt 10). Jetzt
  // zählt jeder Tag für sich, ab dem Stichtag selbst.
  const tage = [tag('2026-09-28', '20:00'), tag('2026-09-29', '20:00'), tag('2026-09-30', '20:00'),
                tag('2026-10-01', '16:00'), tag('2026-10-02', '16:00')];
  const g = E.stdJahresAuswertung(tage, 2026, p100,
    { uebertrag: { datum: '2026-10-01', ferienH: 200, ueberzeitH: 10 } });
  nah('Donnerstags-Stichtag: die 12-h-Tage davor zählen NICHT mehr', g.saldo, 10);
  t('das Zeitfenster beginnt am Stichtag selbst', g.uebertragZeitAb === '2026-10-01');
  // Ein Übertrag nur mit Ferien lässt die Überzeit ganzjährig zählen.
  const nurFerien = E.stdJahresAuswertung(tage, 2026, p100,
    { uebertrag: { datum: '2026-10-01', ferienH: 200 } });
  nah('nur Ferien im Übertrag → Überzeit ohne Fenster (3×4 h Mehrarbeit)', nurFerien.saldo, 12);
}
{
  // Randwochen-Artefakt: ein perfektes Jahr mit exakt 8 h an jedem Werktag
  // ergab −32 h, weil die Wochen um Neujahr gegen ein volles Wochensoll
  // zählten. Diesen Wert hätte der 🧮-Dialog als Startwert ins Folgejahr
  // geschrieben.
  const jahr = [];
  for (let d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() === 2026; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (E.stdTagTyp(iso, []) === 'werktag') jahr.push(tag(iso, '16:00'));
  }
  const pj = E.stdJahresAuswertung(jahr, 2026, p100, {});
  nah('perfektes Jahr → Saldo 0 (Gegenprobe: vorher −32)', pj.saldo, 0);
  nah('Ist = Soll', pj.ist, pj.soll);
}

console.log('\n═══ G — negative Überzeit (Minusstunden) ═══');
{
  const h = E.stdJahresAuswertung([], 2026, p100,
    { uebertrag: { datum: '2026-01-01', ferienH: 200, ueberzeitH: -6.75 } });
  nah('Minusstunden werden übernommen', h.saldo, -6.75);
  nah('und beziffert ausgewiesen', h.uebertragUeberzeitH, -6.75);
}

console.log('\n═══ H — Verdrahtung in der Oberfläche ═══');
{
  t('Überträge werden aus dem Pool gelesen', /function stUebertrag\(userId,jahr\)/.test(html));
  t('sie liegen getrennt von den Tagesrapporten',
    /t\.typ==='uebertrag'/.test(html) && /!t\.typ;/.test(html));
  t('die Jahres-Salden übergeben den Übertrag',
    /uebertrag:ub\b/.test(html) || /uebertrag:stUebertrag/.test(html));
  t('der Feriensaldo rechnet mit dem Übertrag',
    /j\.ferienAusUebertrag\?j\.ferienAnspruch/.test(html));
  t('das Zählfenster gilt auch für die bezogenen Tage',
    /if\(ubAb&&String\(t\.datum\)\.slice\(0,10\)<ubAb\)return;/.test(html));
  t('der Übertrag wird beziffert angezeigt', /Übertrag per /.test(html));
  t('ein fehlender Übertrag wird gemeldet',
    /kein Übertrag für /.test(html));
  t('das Jahr lässt sich fortschreiben', /function stUebertragErfassen/.test(html));
  t('die Fortschreibung schreibt auf den 1. Januar', /datum:ziel\+'-01-01'/.test(html));
  t('sie legt Rest + neuen Anspruch zusammen', /ferienH:Math\.round\(\(restH\+neu\)\*100\)\/100/.test(html));
  t('doppelte Überträge werden verhindert',
    /if\(stUebertrag\(userId,ziel\)\)\{toast/.test(html));
  // Der Dialog nutzt `message`, nicht `text` — sonst bliebe die Erklärung leer.
  t('der Dialog füllt message (nicht text)',
    /html:true,\s*\n\s*message:/.test(html));
  const notify = fs.readFileSync(path.join(ROOT, 'gema_notify.js'), 'utf8');
  t('das Ereignis ist in EVENT_KEYS registriert', /stunden_uebertrag:/.test(notify));
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen'
                          : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
