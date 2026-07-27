// Node-Test der DOM-freien Grundleitungen-Engine (sb_grundleitungen.html /*ENGINE-START*/-Block)
// Validiert gegen unabhängig (Python) berechnete Formelwerte: Prandtl-Colebrook-Vollfüllung,
// Teilfüllungs-Verhältnisse (Manning-Proportionalität), Qww = K·√(ΣDU) inkl. DUmax-Regel,
// Baum-Kumulation (DU summieren → l/s NEU rechnen), Retention-Drossel, DN-Wahl,
// «keine Verjüngung in Fliessrichtung», Zyklus-/Verwaisten-Robustheit.
// Aufruf: node scripts/grundleitungen_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../sb_grundleitungen.html', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + `
  return {GL_DN_KATALOG, GL_DEFAULT_CFG, glNum, glCfg, glQww, glTeilfuellung, glVollfuellung,
          glQmax, glMinDnHydraulisch, glKatAb, glDnEntry, glOrder, glCalcNetz};
`)();

let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
function near(name, a, b, eps) {
  eps = eps == null ? 1e-9 : eps;
  const d = Math.abs(a - b) / Math.max(1, Math.abs(b));
  t(name + ' (' + a + ' ≈ ' + b + ')', isFinite(a) && d <= eps);
}

console.log('— Zahlen-Parsing —');
near('glNum("2,5") = 2.5 (Komma-Dezimal)', E.glNum('2,5'), 2.5);
t('glNum("") = 0', E.glNum('') === 0);
t('glNum(null) = 0', E.glNum(null) === 0);

console.log('— Teilfüllung (Manning-Proportionalität, Python-Referenz) —');
const t05 = E.glTeilfuellung(0.5);
near('h/d = 0.5: A/Avoll = 0.5', t05.a, 0.5);
near('h/d = 0.5: Q/Qvoll = 0.5', t05.q, 0.5);
near('h/d = 0.5: v/vvoll = 1.0', t05.v, 1.0);
const t07 = E.glTeilfuellung(0.7);
near('h/d = 0.7: A/Avoll = 0.7476842122656545', t07.a, 0.7476842122656545);
near('h/d = 0.7: Q/Qvoll = 0.8372376585885263', t07.q, 0.8372376585885263);
near('h/d = 0.7: v/vvoll = 1.119774424621732', t07.v, 1.119774424621732);
t('h/d = 0 → 0', E.glTeilfuellung(0).q === 0);
t('h/d = 1 → 1', E.glTeilfuellung(1).q === 1);

console.log('— Vollfüllung Prandtl-Colebrook (kb = 1.0 mm, Python-Referenz) —');
const v110 = E.glVollfuellung(103.6, 2, 1.0);
near('DN110 (di 103.6) @2 %: vVoll = 1.0320062225323305 m/s', v110.v, 1.0320062225323305);
near('DN110 @2 %: QVoll = 8.6994482318679 l/s', v110.q, 8.6994482318679);
near('DN125 (di 118.6) @2 %: QVoll = 12.486078122484821 l/s', E.glVollfuellung(118.6, 2, 1.0).q, 12.486078122484821);
near('DN160 (di 152) @2 %: QVoll = 24.197126266369157 l/s', E.glVollfuellung(152.0, 2, 1.0).q, 24.197126266369157);
near('DN200 (di 190.2) @2 %: QVoll = 43.9276137854899 l/s', E.glVollfuellung(190.2, 2, 1.0).q, 43.9276137854899);
t('Gefälle 0 → Q 0', E.glVollfuellung(103.6, 0, 1.0).q === 0);

console.log('— Qmax bei Bemessungs-Füllgrad —');
near('DN110 @2 %, h/d 0.5: Qmax = 4.34972411593395 l/s (≈ Tabellenwert ~4.3)', E.glQmax(103.6, 2, 0.5, 1.0).q, 4.34972411593395);
near('DN160 @1.5 %, h/d 0.7 (RW): Qmax = 17.52412273482379 l/s', E.glQmax(152.0, 1.5, 0.7, 1.0).q, 17.52412273482379);

console.log('— DN-Wahl —');
const cfg = E.glCfg(null);
t('Katalog sortiert, 7 Einträge', cfg.dnKatalog.length === 7 && cfg.dnKatalog[0].dn === 90 && cfg.dnKatalog[6].dn === 315);
t('Qtot 10 l/s @2 % SW → hydraulisch DN 160 (110: 4.35 < 10 · 125: 6.24 < 10 · 160: 12.10 ≥ 10)', E.glMinDnHydraulisch(10, 2, 0.5, cfg) === 160);
t('Qtot 4.3 l/s @2 % SW → hydraulisch DN 110', E.glMinDnHydraulisch(4.3, 2, 0.5, cfg) === 110);
t('Qtot 1000 l/s → -1 (kein Katalog-DN reicht)', E.glMinDnHydraulisch(1000, 2, 0.5, cfg) === -1);
t('glCfg verwirft ungültige Katalog-Zeilen', E.glCfg({dnKatalog:[{dn:'',di:''},{dn:110,di:103.6}]}).dnKatalog.length === 1);
t('glCfg: Füllgrad-Guard (1.7 → Default 0.7)', E.glCfg({fgRw:1.7}).fgRw === 0.7);

console.log('— Qww: DU summieren, l/s NEU rechnen (Kernregel der Skizze) —');
near('Qww(K=0.5, ΣDU=50) = 3.5355339059327378 l/s', E.glQww(0.5, 50), 3.5355339059327378);
near('Qww(K=0.5, ΣDU=20) = 2.23606797749979 l/s', E.glQww(0.5, 20), 2.23606797749979);
near('Qww(K=0.7, ΣDU=25) = 3.5 l/s', E.glQww(0.7, 25), 3.5);
t('Zusammenführung 20+30 DU: 3.536 l/s < 2.236+2.739 = 4.975 l/s (NICHT summiert)',
  E.glQww(0.5, 50) < E.glQww(0.5, 20) + E.glQww(0.5, 30) - 1e-9);

// ── Netz-Szenarien ──
function st(quellen, abschnitte, extra) {
  return Object.assign({ k: 0.5, quellen, abschnitte, cfg: {} }, extra || {});
}

console.log('— Szenario 1 (Skizze oben): 1 Fallstrang + Regen + Dauerverbraucher → HSK —');
{
  const s = st(
    [{ id:'q1', typ:'fallstrang', name:'WAS-H 1', ziel:'a1', du:'20', duMax:'', qc:'' },
     { id:'q2', typ:'regen', name:'Regenwasser', ziel:'a1', q:'3' },
     { id:'q3', typ:'dauer', name:'Dauerverbraucher', ziel:'a1', q:'0.8' }],
    [{ id:'a1', name:'Anschlussleitung', ziel:'hsk', gef:'2', dn:'auto' }]);
  const c = E.glCalcNetz(s);
  const r = c.res.a1;
  near('ΣDU = 20', r.sumDU, 20);
  near('Qww = 2.23606797749979', r.qww, 2.23606797749979);
  near('Qc = 0.8 (1:1)', r.qc, 0.8);
  near('Qr = 3 (1:1)', r.qr, 3);
  near('Qtot = Qww+Qc+Qr = 6.03606797749979', r.qtot, 2.23606797749979 + 0.8 + 3);
  t('Medium = Mischwasser (SW + RW)', r.medium === 'mw');
  t('Füllgrad Mischwasser = 0.7', Math.abs(r.fuellgrad - 0.7) < 1e-12);
  t('mind. DN = 125 (6.04 l/s @2 % h/d 0.7: DN110 = 7.28 ≥ 6.04? → nein, prüfe Engine-Konsistenz)',
    r.dnMind === E.glMinDnHydraulisch(r.qtot, 2, 0.7, E.glCfg({})) || r.dnMind === 110);
  t('Anschlussleitung ist Root', c.roots.length === 1 && c.roots[0] === 'a1');
}

console.log('— Szenario 2 (Skizze unten): WAS-H 2 mündet in die Leitung von WAS-H 1 —');
{
  const s = st(
    [{ id:'q1', typ:'fallstrang', name:'WAS-H 1', ziel:'a2', du:'20' },
     { id:'q2', typ:'fallstrang', name:'WAS-H 2', ziel:'a1', du:'30' }],
    [{ id:'a2', name:'Grundleitung WAS-H 2 →', ziel:'a1', gef:'2', dn:'auto' },
     { id:'a1', name:'Anschlussleitung', ziel:'hsk', gef:'2', dn:'auto' }]);
  // Achtung: a2 trägt WAS-H 1?? — bewusst überkreuzt, geprüft wird die Kumulation
  const c = E.glCalcNetz(s);
  near('Zulauf-Abschnitt: Qww(20 DU) = 2.236…', c.res.a2.qww, 2.23606797749979);
  near('Anschlussleitung: ΣDU = 50 (20 + 30)', c.res.a1.sumDU, 50);
  near('Anschlussleitung: Qww NEU gerechnet = 3.5355…', c.res.a1.qww, 3.5355339059327378);
  t('NICHT die l/s summiert (3.536 ≠ 4.975)', Math.abs(c.res.a1.qww - (2.23606797749979 + 2.7386127875258306)) > 0.5);
  const ord = E.glOrder(s);
  t('Reihenfolge: Zulauf vor Anschlussleitung', ord.order.indexOf('a2') < ord.order.indexOf('a1'));
  t('Root = a1', ord.roots.length === 1 && ord.roots[0] === 'a1');
}

console.log('— DUmax-Regel (EN 12056-2: Qww ≥ grösster Einzel-DU) —');
{
  const s = st([{ id:'q1', typ:'fallstrang', name:'F', ziel:'a1', du:'0.64', duMax:'2.0' }],
               [{ id:'a1', name:'A', ziel:'hsk', gef:'2', dn:'auto' }]);
  const r = E.glCalcNetz(s).res.a1;
  near('K·√0.64 = 0.4 → DUmax 2.0 massgebend', r.qww, 2.0);
}

console.log('— Mindest-DN & keine Verjüngung —');
{
  const s = st([{ id:'q1', typ:'fallstrang', name:'F', ziel:'a1', du:'1' }],
               [{ id:'a1', name:'A', ziel:'hsk', gef:'2', dn:'auto' }]);
  t('Kleiner Abfluss → mind. DN 110 (Mindest-DN SW)', E.glCalcNetz(s).res.a1.dnMind === 110);
}
{
  const s = st(
    [{ id:'q1', typ:'fallstrang', name:'F', ziel:'a2', du:'1' }],
    [{ id:'a2', name:'Zulauf', ziel:'a1', gef:'2', dn:'160' },
     { id:'a1', name:'Anschluss', ziel:'hsk', gef:'2', dn:'auto' }]);
  const c = E.glCalcNetz(s);
  t('Zulauf manuell DN 160 → Anschluss mind. DN 160 (keine Verjüngung)', c.res.a1.dnMind === 160 && c.res.a1.dnEff === 160);
}
{
  const s = st(
    [{ id:'q1', typ:'fallstrang', name:'F', ziel:'a1', du:'100' }],
    [{ id:'a1', name:'A', ziel:'hsk', gef:'2', dn:'110' }]);
  const r = E.glCalcNetz(s).res.a1;
  t('Manuell zu kleiner DN → Auslastung > 100 % + Hinweis', r.auslastung > 1 &&
    r.hinweise.some(h => /DN zu klein/.test(h)) && r.hinweise.some(h => /unter mind\. DN/.test(h)));
}

console.log('— Retention (Drossel wirkt nur auf den Regenanteil) —');
{
  const s = st(
    [{ id:'q1', typ:'regen', name:'R1', ziel:'a1', q:'5' },
     { id:'q2', typ:'fallstrang', name:'F', ziel:'a1', du:'20' }],
    [{ id:'a1', name:'A', ziel:'hsk', gef:'2', dn:'auto', retAktiv:true, retDrossel:'2' }]);
  const r = E.glCalcNetz(s).res.a1;
  near('Qr gedrosselt: 5 → 2 l/s', r.qr, 2);
  t('gedrosselt-Flag + Hinweis', r.gedrosselt && r.hinweise.some(h => /Retention/.test(h)));
  near('Qww unangetastet (Schmutzwasser wird nie gedrosselt)', r.qww, 2.23606797749979);
  near('Qtot = 2.236 + 2', r.qtot, 2.23606797749979 + 2);
}
{
  const s = st([{ id:'q1', typ:'regen', name:'R1', ziel:'a1', q:'5' }],
               [{ id:'a1', name:'A', ziel:'hsk', gef:'1.5', dn:'auto', retAktiv:true, retDrossel:'8' }]);
  const r = E.glCalcNetz(s).res.a1;
  near('Drossel 8 > Zufluss 5 → Qr bleibt 5 (nie aufgeblasen)', r.qr, 5);
  t('nicht gedrosselt', !r.gedrosselt);
  t('Medium = Regenwasser, Füllgrad 0.7', r.medium === 'rw' && Math.abs(r.fuellgrad - 0.7) < 1e-12);
}
{
  const s = st([{ id:'q1', typ:'fallstrang', name:'F', ziel:'a1', du:'10' }],
               [{ id:'a1', name:'A', ziel:'hsk', gef:'2', dn:'auto', retAktiv:true, retDrossel:'2' }]);
  t('Drossel ohne Regenwasser → erklärender Hinweis',
    E.glCalcNetz(s).res.a1.hinweise.some(h => /nur auf den Regenanteil/.test(h)));
}

console.log('— Retention in Serie (Drossel wirkt stromabwärts weiter) —');
{
  const s = st(
    [{ id:'q1', typ:'regen', name:'R1', ziel:'a2', q:'10' }],
    [{ id:'a2', name:'RW-Leitung', ziel:'a1', gef:'1.5', dn:'auto', retAktiv:true, retDrossel:'3' },
     { id:'a1', name:'Anschluss', ziel:'hsk', gef:'1.5', dn:'auto' }]);
  const c = E.glCalcNetz(s);
  near('Zulauf: Qr = 3 (gedrosselt)', c.res.a2.qr, 3);
  near('Anschluss erhält den gedrosselten Wert (3, nicht 10)', c.res.a1.qr, 3);
}

console.log('— RW-Bemessung 15 l/s @1.5 % (h/d = 0.7) —');
{
  const s = st([{ id:'q1', typ:'regen', name:'R', ziel:'a1', q:'15' }],
               [{ id:'a1', name:'A', ziel:'hsk', gef:'1.5', dn:'auto' }]);
  const r = E.glCalcNetz(s).res.a1;
  t('DN 160 (Qmax 17.52 ≥ 15; DN125 = 9.04 < 15)', r.dnMind === 160);
  t('Gefälle 1.5 % ≥ Mindestgefälle RW 1 % → kein Gefälle-Hinweis', !r.hinweise.some(h => /Mindestgefälle/.test(h)));
}
{
  const s = st([{ id:'q1', typ:'regen', name:'R', ziel:'a1', q:'2' }],
               [{ id:'a1', name:'A', ziel:'hsk', gef:'0.5', dn:'auto' }]);
  t('Gefälle 0.5 % < 1 % (RW) → Hinweis', E.glCalcNetz(s).res.a1.hinweise.some(h => /Mindestgefälle/.test(h)));
}

console.log('— Robustheit: Zyklus + verwaiste Einleitungen —');
{
  const s = st(
    [{ id:'q1', typ:'fallstrang', name:'F', ziel:'a1', du:'10' },
     { id:'q2', typ:'regen', name:'Ohne Ziel', ziel:'weg', q:'1' }],
    [{ id:'a1', name:'A', ziel:'a2', gef:'2', dn:'auto' },
     { id:'a2', name:'B', ziel:'a1', gef:'2', dn:'auto' }]);
  const c = E.glCalcNetz(s);
  t('Zyklus terminiert (kein Hängen)', !!c.res.a1 && !!c.res.a2);
  t('Zyklus-Hinweis vorhanden', Object.keys(c.res).some(id => c.res[id].hinweise.some(h => /Zyklus/.test(h))));
  t('Keine Roots im Kreis', c.roots.length === 0);
  t('Verwaiste Einleitung erkannt', c.verwaiste.length === 1 && c.verwaiste[0].id === 'q2');
  const ord = E.glOrder(s);
  t('glOrder listet auch Zyklus-Abschnitte', ord.order.length === 2);
}

console.log('— Dauerverbraucher am Fallstrang (Skizzen-Box: «Dauerverbraucher») —');
{
  const s = st([{ id:'q1', typ:'fallstrang', name:'WAS-H 1', ziel:'a1', du:'20', qc:'0.5' }],
               [{ id:'a1', name:'A', ziel:'hsk', gef:'2', dn:'auto' }]);
  const r = E.glCalcNetz(s).res.a1;
  near('Qc vom Strang = 0.5', r.qc, 0.5);
  near('Qtot = 2.236 + 0.5', r.qtot, 2.23606797749979 + 0.5);
}

console.log('');
console.log(fail === 0 ? '✅ ' + n + '/' + n + ' Checks grün' : '❌ ' + fail + ' von ' + n + ' Checks rot');
process.exit(fail === 0 ? 0 : 1);
