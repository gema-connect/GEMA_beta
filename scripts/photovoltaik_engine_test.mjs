/* ════════════════════════════════════════════════════════════════════════
   GEMA — Engine-Test el_photovoltaik (Node, kein Browser)
   ════════════════════════════════════════════════════════════════════════
   Prüft den /*ENGINE-START*​/-Block von el_photovoltaik.html gegen
   UNABHÄNGIG gerechnete Werte. Die Referenzen unten sind hier eigens
   ausgeschrieben — teils mit anderer Schleifenstruktur als die
   Implementierung — und rufen NICHT die Funktionen des Moduls auf.

   Fachlich abgesichert wird vor allem, wo eine PV-Wirtschaftlichkeits-
   rechnung typischerweise zu günstig wird:
     • Die Gestehungskosten müssen die ENERGIE mit abzinsen. Wer nur die
       Kosten abzinst, rechnet die Anlage systematisch billiger.
     • Die Amortisation darf NICHT aus dem ersten Jahr hochgerechnet
       werden — das unterschlägt die Degradation.
     • Der Speicher darf nur den Überschuss verschieben, den es wirklich
       gibt, und nur so viel, wie die Liegenschaft auch braucht.

   AUSFÜHREN:  node scripts/photovoltaik_engine_test.mjs
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, fail = 0;
const t = (name, cond) => { n++; if (!cond) { fail++; console.error('  ✗ FAIL: ' + name); } };
const near = (name, a, b, eps) => {
  eps = eps == null ? 1e-9 : eps;
  const d = Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
  t(`${name} (${a} ≈ ${b})`, isFinite(a) && d <= eps);
};

/* ── Fachbasis + Engine laden ──────────────────────────────────────────
   gema_elektro.js ist DOM-frei und lässt sich mit einem Mini-window laden;
   der ENGINE-Block wird aus der Seite geschnitten und bekommt GemaElektro
   als Parameter (der `typeof`-Guard im Modul greift dann). */
const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const E = w.GemaElektro;

const html = readFileSync(join(ROOT, 'el_photovoltaik.html'), 'utf8');
const A_MARK = '/*ENGINE-' + 'START*/', E_MARK = '/*ENGINE-' + 'END*/';
const von = html.indexOf(A_MARK), bis = html.indexOf(E_MARK);
t('ENGINE-Block in el_photovoltaik.html gefunden', von >= 0 && bis > von);
const engineSrc = html.slice(von + A_MARK.length, bis);
const { pvCalc, PV_DACH, PV_AUSRICHTUNG } = new Function('GemaElektro',
  engineSrc + '\nreturn { pvCalc:pvCalc, PV_DACH:PV_DACH, PV_AUSRICHTUNG:PV_AUSRICHTUNG };')(E);
t('pvCalc ist eine Funktion', typeof pvCalc === 'function');

/* ── Referenzfall ──────────────────────────────────────────────────────
   Schrägdach 200 m², Belegung 85 % · Modul 1.95 m² bei 22 % · 1000 kWh/kWp
   Süd 30° · EV 30 % · 1600 CHF/kWp · 28 / 9 Rp. · 1 %/a Betrieb
   0.5 %/a Degradation · 25 Jahre · 0 % Zins                              */
const BASIS = {
  modus: 'flaeche', kwp: 0,
  dachFl: 200, dach: 'schraeg', belegung: 0, wgrad: 22, modFl: 1.95,
  spez: 1000, ausricht: 'sued30', verlust: 0, abregel: 0,
  ev: 30, bedarf: 0, battKwh: 0, battZykl: 250, battChf: 0,
  invKwp: 1600, foerder: 0, preis: 28, verg: 9,
  opex: 1, degr: 0.5, jahre: 25, zins: 0,
  netz: '3p400', wr: 97, acdc: 100
};

/* ── Unabhängige Referenzrechnung ──────────────────────────────────── */
const R_BELEG   = 0.85;                       // Richtwert Schrägdach
const R_FL_BEL  = 200 * R_BELEG;              // 170 m²
const R_NMOD    = Math.floor(R_FL_BEL / 1.95);
const R_WP_MOD  = 0.22 * 1.95;                // kW je Modul (1 kW/m² STC)
const R_KWP     = R_NMOD * R_WP_MOD;
const R_ERTRAG  = R_KWP * 1000 * 1.00;

const R_EV_KWH    = R_ERTRAG * 0.30;
const R_EINSP_KWH = R_ERTRAG - R_EV_KWH;

const R_INVEST = R_KWP * 1600;
const R_OPEX   = R_INVEST * 0.01;
const R_PREIS  = 0.28, R_VERG = 0.09;
const R_EIN_J1 = R_ERTRAG * (0.30 * R_PREIS + 0.70 * R_VERG);

/* Zahlungsreihe — hier bewusst als getrennte Arrays aufgebaut, nicht als
   ein Durchlauf wie in der Implementierung. */
const jahre = 25, degr = 0.005, zins = 0;
const rEnergie = [], rCf = [];
for (let j = 1; j <= jahre; j++) {
  const e = R_ERTRAG * Math.pow(1 - degr, j - 1);
  rEnergie.push(e);
  rCf.push(e * (0.30 * R_PREIS + 0.70 * R_VERG) - R_OPEX);
}
const disk = j => Math.pow(1 + zins, -j);
const R_BW_ENERGIE = rEnergie.reduce((s, e, i) => s + e * disk(i + 1), 0);
const R_BW_OPEX    = rEnergie.reduce((s, _, i) => s + R_OPEX * disk(i + 1), 0);
const R_BW_CF      = rCf.reduce((s, c, i) => s + c * disk(i + 1), 0);
const R_ENERGIE_GES = rEnergie.reduce((s, e) => s + e, 0);
const R_LCOE = (R_INVEST + R_BW_OPEX) / R_BW_ENERGIE * 100;
const R_NPV  = R_BW_CF - R_INVEST;

/* Amortisation: kumulieren und im Schnittjahr linear interpolieren. */
let R_AMOR = null;
{
  let kum = 0;
  for (let j = 1; j <= jahre; j++) {
    const vor = kum;
    kum += rCf[j - 1] * disk(j);
    if (R_AMOR === null && kum >= R_INVEST) R_AMOR = (j - 1) + (R_INVEST - vor) / (kum - vor);
  }
}

const r = pvCalc(BASIS);

console.log('— Anlagenleistung aus der Fläche —');
near('belegbare Fläche = 200 m² · 85 %', r.flBel, R_FL_BEL);
t('Belegungsgrad kommt aus der Dachform', r.belegungAuto === true);
near('Modulzahl = ⌊170 / 1.95⌋', r.nMod, R_NMOD);
t('Modulzahl wird ABGERUNDET, nicht gerundet', r.nMod === 87 && R_FL_BEL / 1.95 > 87);
near('Leistung je Modul = η · A (1 kW/m² STC)', r.wpMod, R_WP_MOD);
near('Anlagenleistung', r.kWp, R_KWP);
{
  /* Gegenprobe: bei 20 % Wirkungsgrad und gleicher Fläche muss die
     Leistung im Verhältnis der Wirkungsgrade stehen. */
  const b = pvCalc({ ...BASIS, wgrad: 20 });
  near('Leistung skaliert mit dem Wirkungsgrad', b.kWp / r.kWp, 20 / 22, 1e-9);
}
{
  const b = pvCalc({ ...BASIS, dach: 'flach' });
  near('Flachdach nutzt den kleineren Belegungsgrad', b.belegung, 0.55);
  t('und ergibt damit weniger Leistung', b.kWp < r.kWp);
}
{
  const b = pvCalc({ ...BASIS, belegung: 70 });
  near('eigener Belegungsgrad übersteuert den Richtwert', b.flBel, 200 * 0.70);
  t('und wird als eigener Wert markiert', b.belegungAuto === false);
}
{
  const b = pvCalc({ ...BASIS, modus: 'kwp', kwp: 30 });
  near('Modus «Leistung direkt» übernimmt den Wert', b.kWp, 30);
  t('dann gibt es keine Flächenrechnung', b.nMod === null && b.flBel === null);
}
{
  const b = pvCalc({ ...BASIS, dachFl: 1 });
  t('zu kleine Fläche: kein Modul', b.nMod === 0 && b.kWp === 0);
  t('und das wird gemeldet', b.hinweise.some(h => /kein einziges Modul/.test(h)));
}

console.log('— Jahresertrag —');
near('Ertrag = P · e_spez · f_Ausrichtung', r.ertragJ1, R_ERTRAG);
{
  const b = pvCalc({ ...BASIS, ausricht: 'ow30' });
  near('Ost/West 30° rechnet mit Faktor 0.80', b.ertragJ1, R_ERTRAG * 0.80);
}
{
  const b = pvCalc({ ...BASIS, verlust: 10, abregel: 5 });
  near('Systemverluste und Abregelung wirken multiplikativ',
    b.ertragJ1, R_ERTRAG * 0.90 * 0.95);
  t('die Abregelung wird als Eingabe ausgewiesen',
    b.hinweise.some(h => /Zeitreihensimulation/.test(h)));
}
t('alle Ausrichtungs-Faktoren liegen zwischen 0 und 1',
  PV_AUSRICHTUNG.every(a => a.f > 0 && a.f <= 1));
t('genau eine Ausrichtung ist die optimale (Faktor 1.0)',
  PV_AUSRICHTUNG.filter(a => a.f === 1).length === 1);

console.log('— Eigenverbrauch und Speicher —');
near('Eigenverbrauch = Ertrag · Anteil', r.evKWh, R_EV_KWH);
near('Einspeisung = Rest', r.einspKWh, R_EINSP_KWH);
near('wirksamer Anteil ohne Speicher = Eingabe', r.evAnteilEff, 0.30);
t('ohne Bedarf kein Autarkiegrad', r.autarkie === null);
{
  /* Speicher 10 kWh × 250 Zyklen = 2500 kWh Durchsatz; Überschuss ist
     deutlich grösser, es begrenzt also der Speicher. */
  const b = pvCalc({ ...BASIS, battKwh: 10, battChf: 12000 });
  near('Zusatz-Eigenverbrauch = Kapazität · Zyklen', b.zusatzEv, 2500);
  t('Grenze ist der Speicher', b.battLimit === 'speicher');
  near('Eigenverbrauch steigt um genau diesen Betrag', b.evKWh, R_EV_KWH + 2500);
  near('Einspeisung sinkt um denselben Betrag', b.einspKWh, R_EINSP_KWH - 2500);
  /* Nutzen ist die DIFFERENZ der Preise, nicht der volle Strompreis. */
  near('Speicher-Mehrertrag = Zusatz · (Preis − Vergütung)',
    b.battNutzen, 2500 * (R_PREIS - R_VERG));
  near('Speicher-Amortisation = Mehrkosten / Mehrertrag',
    b.battAmor, 12000 / (2500 * (R_PREIS - R_VERG)));
}
{
  /* Riesiger Speicher: mehr Durchsatz als Überschuss vorhanden ist. */
  const b = pvCalc({ ...BASIS, battKwh: 200, battChf: 100000 });
  near('mehr als der Überschuss geht nicht', b.zusatzEv, R_EINSP_KWH);
  t('Grenze ist der Überschuss', b.battLimit === 'ueberschuss');
  near('dann ist alles Eigenverbrauch', b.evKWh, R_ERTRAG);
  near('und nichts wird eingespeist', b.einspKWh, 0);
}
{
  /* 15000 kWh Verbrauch: der Direktverbrauch deckt davon 11196.9, es
     bleiben 3803.1 — mehr als die 2500 des Speichers. Der Bedarf begrenzt
     hier also NICHT. */
  const b = pvCalc({ ...BASIS, bedarf: 15000, battKwh: 10, battChf: 12000 });
  near('Rest-Bedarf über dem Speicher-Durchsatz: es begrenzt der Speicher',
    b.zusatzEv, 2500);
  t('Grenze bleibt der Speicher', b.battLimit === 'speicher');
}
{
  /* 13000 kWh Verbrauch: Rest-Bedarf 1803.1 < 2500 Durchsatz — was die
     Liegenschaft nicht braucht, kann der Speicher nicht sinnvoll lagern. */
  const b = pvCalc({ ...BASIS, bedarf: 13000, battKwh: 10, battChf: 12000 });
  near('der Rest-Bedarf begrenzt den Speicher', b.zusatzEv, 13000 - R_EV_KWH);
  t('Grenze ist der Bedarf', b.battLimit === 'bedarf');
  t('und das wird gemeldet', b.hinweise.some(h => /Rest-Bedarf/.test(h)));
  t('der Mehrertrag folgt dem kleineren Wert',
    Math.abs(b.battNutzen - (13000 - R_EV_KWH) * (R_PREIS - R_VERG)) < 1e-9);
}
{
  const b = pvCalc({ ...BASIS, bedarf: 20000 });
  near('Autarkiegrad = Eigenverbrauch / Bedarf', b.autarkie, R_EV_KWH / 20000);
}
{
  /* Kein Preisunterschied: Verschieben bringt nichts. */
  const b = pvCalc({ ...BASIS, verg: 28, battKwh: 10, battChf: 12000 });
  t('ohne Preisdifferenz kein Speicher-Nutzen', b.battAmor === null);
  t('und der Grund wird benannt', b.battGrund === 'kein_spread');
}

console.log('— Investition und Förderung —');
near('Investition = Leistung · CHF/kWp', r.investBrutto, R_INVEST);
near('ohne Förderung ist netto gleich brutto', r.investNetto, R_INVEST);
{
  const b = pvCalc({ ...BASIS, foerder: 15000 });
  near('Förderung senkt die Nettoinvestition', b.investNetto, R_INVEST - 15000);
  t('Amortisation wird dadurch kürzer', b.amor < r.amor);
}
{
  const b = pvCalc({ ...BASIS, foerder: 999999 });
  near('Förderung über der Investition wird bei 0 gekappt', b.investNetto, 0);
  t('kein Gewinn behauptet', b.foerderGekappt === true);
  t('und das wird gemeldet', b.hinweise.some(h => /übersteigt die Investition/.test(h)));
}
{
  const b = pvCalc({ ...BASIS, battKwh: 10, battChf: 12000 });
  near('Speicher-Mehrkosten zählen zur Investition', b.investBrutto, R_INVEST + 12000);
}

console.log('— Zahlungsreihe, Barwert und Amortisation —');
t('die Reihe hat ein Element je Jahr', r.reihe.length === 25);
near('Ertrag im ersten Jahr', r.einnahmeJ1, R_EIN_J1);
near('Betriebskosten je Jahr = 1 % der Bruttoinvestition', r.opexJahr, R_OPEX);
near('Energie im letzten Jahr folgt der Degradation',
  r.reihe[24].energie, R_ERTRAG * Math.pow(1 - degr, 24));
near('Gesamtenergie über 25 Jahre', r.energieGes, R_ENERGIE_GES);
near('Barwert der Energie', r.bwEnergie, R_BW_ENERGIE);
near('Barwert der Erträge minus Investition (NPV)', r.npv, R_NPV);
near('Amortisation mit Interpolation im Schnittjahr', r.amor, R_AMOR);
t('Amortisation liegt innerhalb der Betrachtungsdauer', r.amor > 0 && r.amor < 25);
{
  /* Kontrollrechnung: genau bei der Amortisation muss der kumulierte
     Ertrag die Nettoinvestition erreichen. Zwischen den Stützstellen wird
     linear interpoliert — die Prüfung nutzt dieselbe Interpolation. */
  const j = Math.floor(r.amor);
  const kumVor  = j === 0 ? 0 : r.reihe[j - 1].kum;
  const kumNach = r.reihe[j].kum;
  const kumBeiAmor = kumVor + (kumNach - kumVor) * (r.amor - j);
  near('kumulierter Ertrag deckt bei t_amor genau die Investition',
    kumBeiAmor, r.investNetto, 1e-9);
}

console.log('— KERN: Amortisation wird NIE hochgerechnet —');
{
  /* Teure Anlage, magerer Ertrag: in 25 Jahren nicht amortisiert. */
  const b = pvCalc({ ...BASIS, invKwp: 6000 });
  t('keine Amortisation innerhalb der Betrachtungsdauer', b.amor === null);
  t('der Grund wird benannt statt extrapoliert', b.amorGrund === 'ausserhalb');
  t('Status err', b.status === 'err');
  /* Die naive Hochrechnung aus dem ersten Jahr wäre kürzer und falsch —
     sie unterschlägt die Degradation. */
  const naiv = b.investNetto / (b.einnahmeJ1 - b.opexJahr);
  t('die naive Hochrechnung läge unter der echten Deckung', naiv > 25);
  t('sie wird nicht ausgegeben', b.amor === null);
}
{
  /* Betriebskosten übersteigen den Ertrag: nie amortisiert. */
  const b = pvCalc({ ...BASIS, opex: 20 });
  t('negativer Cashflow: keine Amortisation', b.amor === null);
  t('und der Grund ist ein anderer', b.amorGrund === 'negativ');
  t('NPV ist negativ', b.npv < 0);
}

console.log('— KERN: Gestehungskosten zinsen die ENERGIE mit ab —');
near('LCOE bei 0 % Zins = (Invest + Betriebskosten) / Energie', r.lcoe, R_LCOE);
{
  const z = 3;                                     // 3 % Kalkulationszins
  const b = pvCalc({ ...BASIS, zins: z });
  /* Referenz mit abgezinster Energie … */
  const dz = j => Math.pow(1 + z / 100, -j);
  const bwE = rEnergie.reduce((s, e, i) => s + e * dz(i + 1), 0);
  const bwO = rEnergie.reduce((s, _, i) => s + R_OPEX * dz(i + 1), 0);
  near('LCOE mit Zins: Kosten UND Energie abgezinst',
    b.lcoe, (R_INVEST + bwO) / bwE * 100);

  /* … und die verbreitete FALSCHE Variante: Kosten abzinsen, Energie nicht. */
  const falsch = (R_INVEST + bwO) / R_ENERGIE_GES * 100;
  t('die Variante ohne Energie-Abzinsung läge tiefer', falsch < b.lcoe);
  t('das Modul liefert sie nicht', Math.abs(b.lcoe - falsch) > 1e-6);
  t('mit Zins sind die Gestehungskosten höher als ohne', b.lcoe > r.lcoe);
  t('Amortisation dauert mit Zins länger', b.amor > r.amor);
}
{
  const b = pvCalc({ ...BASIS, zins: 0 });
  near('bei 0 % Zins bleibt die einfache Rechnung erhalten', b.lcoe, R_LCOE);
}

console.log('— AC-Seite —');
{
  /* 3-phasig 400 V: I = P/(√3·U) mit P_AC = kWp · AC/DC · η_WR */
  const pAc = R_KWP * 1.00 * 0.97;
  near('AC-Leistung', r.pAc, pAc);
  near('Bemessungsstrom dreiphasig', r.iAc, pAc * 1000 / (Math.sqrt(3) * 400));
  t('nächste Sicherung aus der Reihe', r.sicherung === E.elNaechsteSicherung(r.iAc));
  t('Sicherung deckt den Strom', r.sicherung >= r.iAc);
  t('cos φ = 1 wird als Annahme benannt', r.hinweise.some(h => /cos φ = 1/.test(h)));
  t('die Strombelastbarkeit wird abgegrenzt',
    r.hinweise.some(h => /Strombelastbarkeit/.test(h)));
}
{
  const b = pvCalc({ ...BASIS, acdc: 85 });
  near('Überbelegung senkt die AC-Leistung', b.pAc, R_KWP * 0.85 * 0.97);
  t('und damit den Strom', b.iAc < r.iAc);
}
{
  const b = pvCalc({ ...BASIS, netz: '1p230' });
  near('einphasig ohne √3', b.iAc, b.pAc * 1000 / 230);
}
{
  /* Sehr grosse Anlage: über der Sicherungsreihe — kein stiller Deckel. */
  const b = pvCalc({ ...BASIS, modus: 'kwp', kwp: 5000 });
  t('über der Sicherungsreihe kommt kein Wert zurück', b.sicherung === null);
  t('das wird gemeldet', b.sicherungWeg === true);
  t('mit erklärendem Hinweis', b.hinweise.some(h => /Sicherungsreihe/.test(h)));
}

console.log('— Unvollständige Eingaben —');
{
  const b = pvCalc({ ...BASIS, spez: 0 });
  t('ohne spezifischen Ertrag kein Jahresertrag', b.ertragJ1 === null);
  t('und kein Status', b.status === 'leer');
  t('keine Amortisation behauptet', b.amor === null && b.amorGrund === '');
}
{
  const b = pvCalc({ ...BASIS, invKwp: 0 });
  t('ohne Investition keine Wirtschaftlichkeit', b.investNetto === null);
  t('kein LCOE', b.lcoe === null);
  t('kein NPV', b.npv === null);
  t('Status leer', b.status === 'leer');
}
{
  const b = pvCalc({ ...BASIS, jahre: 0 });
  t('ohne Betrachtungsdauer keine Reihe', b.reihe.length === 0);
  t('Status leer', b.status === 'leer');
}

console.log('— Bewertung —');
t('Referenzfall amortisiert sich gut', r.status === 'ok');
{
  /* Amortisation über 80 % der Betrachtungsdauer → Warnung.
     2500 CHF/kWp ergibt rund 22 Jahre — noch innerhalb der 25, aber spät. */
  const b = pvCalc({ ...BASIS, invKwp: 2500 });
  t('späte Amortisation liegt noch innerhalb der Dauer', b.amor > 20 && b.amor <= 25);
  t('und wird als Warnung eingestuft', b.status === 'warn');
}

console.log('— Annahmen werden immer ausgewiesen —');
t('konstante Preise werden benannt', r.hinweise.some(h => /KONSTANTEN Preisen/.test(h)));
t('die Energie-Abzinsung wird erklärt',
  r.hinweise.some(h => /nur die Kosten\s*\n?\s*abzinst|nur die Kosten abzinst/.test(h)));
t('nicht Enthaltenes wird aufgezählt',
  r.hinweise.some(h => /Wechselrichters/.test(h) && /Rückbau/.test(h)));

console.log(`\n${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
