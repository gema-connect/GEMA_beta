#!/usr/bin/env node
/* Drift-Guard — Feedback 05.09.2026, Modul sb_warmwasser (29 Punkte).
 *
 * Etappe 1 — Tab ④ Speicher & Leistung:
 *   #8  Verlustfaktor nur 2 Nachkommastellen · fsto-Bauarten neu benannt
 *       (WE mit innenliegendem Register 1.25 · WE mit externem Tauscher 1.1 ·
 *        WE mit externem Tauscher ohne Misch- und Kaltzone 1.0)
 *   #3  Misch-/Reserve-Prozent im Speicherschema muss zum gewaehlten fsto passen
 *
 * Etappe 2 — Tab ③ Feinplanung, 3.4 Ausstosswaermeverluste:
 *   #10 Ø-Personenbelegung + Verlust je Entnahme + Verlust je Nutzungseinheit
 *   #11 Zeit-Select schneidet «Standard (10 s)» nicht mehr ab
 *   #12 Beschriftung + Hinweis nebeneinander, kleines Auswahlfeld, Schnellwahl 10/15 s
 *
 * Etappe 3 — Tab ③ Feinplanung, 3.3 Warmgehaltene Leitungen:
 *   #14 kWh/d je Zeile in der Farbe ihrer Leitungsart (Kanon 2.2)
 *   #17 ø-Auswahl folgt dem Material (PEX 12/16/20/25/32 · CNS 15…108),
 *       gespeicherter ø ausserhalb der Reihe bleibt als «(bisherig)» waehlbar

 *
 * Etappe 4 — Tab ① Nutzwarmwasserbedarf (reine Darstellung):
 *   #26 Total-Spalte [l/d à 60°C] je Nutzungseinheit fett
 *   #27 die drei Ergebniswerte in 1.3 gleich gross (Q'W verliert .big, behaelt die Farbe)
 *   #28 Label Kaltwasser gruen · Warmwasser rot
 *   #29 «⬇ In Büro-Zeile übernehmen» rechtsbuendig wie der Knopf in 1.1
 *
 * Etappe 5 — Tab ③ Feinplanung + Tab ④ (Beschriftung/Reihenfolge):
 *   #6  Titel 4.2 ohne Norm-Suffix («Speicherauslegung», nicht «… (SIA 385/2)»)
 *   #16 Tabelle 3.3: Laenge VOR Material (Leitung | Laenge | Material | Aussen-ø | kWh/d)
 *   #20 «Heizlast frei gewaehlt» steht UNTER den Ergebniszeilen ueber die volle Breite
 *   #21 «⇩ Angaben Wohnungen aus Grobauslegung» steht VOR der Tabelle 3.2
 *
 * Etappe 6 — Tab ② Verlustzahl + Tab ① Ergebnis:
 *   #24 «Fixwert» steht als eigene Spalte VOR dem Wert, die Zahlenwerte in 2.2
 *       fluchten dadurch mit den Verlust-Werten darunter (Kanon Feedback 19.08.2026 #5)
 *   #25 Ergebnis 1.4 zeigt eine Kachel je NUTZUNGSEINHEIT statt einer Sammelzahl je Einheit
 *
 * Etappe 7 — Tab ③ Feinplanung, 3.3 Warmgehaltene Leitungen:
 *   #13 Staerke des Warmhaltebands waehlbar (Domotec 6 · Raychem 7 · Systec Therm AG 7.5 mm);
 *       der Zuschlag laeuft ueber DIESELBE wwRarTab-Treppe wie Rohr-an-Rohr
 *   #18 Temperaturen je Warmhaltetyp (konv · RaR · WHB) statt EINEM Paar fuer alle;
 *       RaR/WHB spiegeln die konventionellen Werte, bis eine ECHTE Eingabe sie loest
 *
 * Etappe 8 — Tab ③ Feinplanung (3.1 / 3.3 / 3.4):
 *   #9  Entnahmen je NE mit Vorschlag 2 (auto-Chip) + Rechenweg-Spalte
 *       perE x entn x n — die Doppelzaehlung wird dadurch sichtbar
 *   #15 beide Uebernahme-Knoepfe stehen VOR der Tabelle 3.3;
 *       «⇩ Laengen aus Grobauslegung (2.2)» legt die EINE konventionelle Laenge
 *       GANZ in den Vorlauf und sagt es im Dialog (GEMA raet die VL/RL-Teilung nicht)
 *   #23 sichtbare Beschriftung ueber den drei Auswahlfeldern der Feinplanung
 *       («Nutzungseinheit» / «Hinweis» / «Stundenspitze») +
 *       «⇩ Als Nutzungseinheiten uebernehmen» in der Grob-Echo-Box;
 *       zugeordnet wird ueber den NORMWERT (Ø l/d), nicht ueber den Namen
 *
 * Etappe 9 — Diagramme (Tab ③ Summenlinien / Tab ④ Ladestunden):
 *   #22 Summenlinien-Karte: JEDE Stunde als «00 / 01 / 02 …», Legende untereinander,
 *       Liter-Werte rot (Tabelle + linke Achse), Prozent schwarz belassen,
 *       Zeilenfolge % · Σ % · l · Σ l — die padL|24xW/24|padR-Geometrie der
 *       Stunden-Tabelle bleibt unangetastet (Kanon Feedback 19.08.2026 #2)
 *   #5  Ladestunden-Diagramm: die Spitzendeckung laeuft PARALLEL zur Verbrauchs-
 *       kurve (verbCum+pk) statt als waagrechte Linie, beide Achsen zeigen
 *       zusaetzlich Prozent des Tagesbedarfs, X-Achse stuendlich «00 / 01 / 02 …»
 *
 * Ausfuehren:  CHROME=<chromium> node scripts/feedback_20260905_warmwasser_test.mjs
 */
import { readFileSync } from 'node:fs';
import { startServer, seed, newPage, ROOT, BASE } from './rolematrix_harness.mjs';

let ok_ = 0, bad = 0;
function ok(cond, name, extra) {
  if (cond) { ok_++; console.log('  ok   ' + name); }
  else { bad++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function sec(t) { console.log('\n── ' + t); }

const WW = readFileSync(ROOT + '/sb_warmwasser.html', 'utf8');

// ─────────────────────────────────────────────────────────────── statisch
sec('A · Markup & Quelltext');

// #8 — die drei Bauarten mit den vom Kunden vorgegebenen Faktoren
ok(/data-fsto="1\.25"[^>]*data-bauart="register_innen"/.test(WW),
  '#8: Kachel 1 = register_innen mit fsto 1.25');
ok(/data-fsto="1\.1"[^>]*data-bauart="tauscher_extern"/.test(WW),
  '#8: Kachel 2 = tauscher_extern mit fsto 1.1');
ok(/data-fsto="1"[^>]*data-bauart="tauscher_extern_ohne"/.test(WW),
  '#8: Kachel 3 = tauscher_extern_ohne mit fsto 1.0');
ok(WW.includes('WE mit innenliegendem Register'),  '#8: Beschriftung «WE mit innenliegendem Register»');
ok(WW.includes('WE mit externem Tauscher</div>')
   || /WE mit externem Tauscher<\/div>/.test(WW),  '#8: Beschriftung «WE mit externem Tauscher»');
ok(WW.includes('WE mit externem Tauscher ohne Misch- und Kaltzone'),
  '#8: Beschriftung «WE mit externem Tauscher ohne Misch- und Kaltzone»');
ok(!/data-fsto="1\.5"/.test(WW), '#8: keine 1.5-Kachel mehr (alte Bauart «Liegend» abgeloest)');

// #8 — der Default-Merker zeigt auf eine EXISTIERENDE Bauart
{
  const m = WW.match(/id="ww_fsto_bauart"[^>]*value="([^"]*)"/);
  ok(!!m && WW.includes('data-bauart="' + (m ? m[1] : '') + '"'),
    '#8: hidden ww_fsto_bauart-Default entspricht einer Kachel', m ? m[1] : null);
}

// #8 — Verlustfaktor auf 2 Nachkommastellen (Rundung + beide Vorschau-Chips)
ok(/Math\.round\(v\*100\)\/100/.test(WW),                '#8: wwVfSet rundet auf 2 Nachkommastellen');
ok(!/Math\.round\(v\*1000\)\/1000/.test(WW),             '#8: keine 3-Stellen-Rundung mehr');
ok(/setTxt\('ww_vfGrob'[^)]*wwFmt\(1\+res\.vz\/100,2\)/.test(WW),   '#8: Chip Grobauslegung mit 2 NK');
ok(/setTxt\('ww_vfFein'[^)]*wwFmt\(1\+res\.vzFein\/100,2\)/.test(WW), '#8: Chip Feinplanung mit 2 NK');

// #6 — der Norm-Zusatz ist aus dem Titel raus (die Norm steht im Hero)
ok(/<h2>4\.2 Speicherauslegung<\/h2>/.test(WW),
  '#6: Titel 4.2 heisst nur noch «Speicherauslegung»');
ok(!/4\.2 Speicherauslegung \(SIA 385\/2\)/.test(WW),
  '#6: der Klammer-Zusatz «(SIA 385/2)» ist entfernt');

// #16 — Kopfzeile von 3.3: Laenge steht VOR Material
{
  const kopf = (WW.match(/<thead><tr><th>Leitung<\/th>[\s\S]*?<\/tr><\/thead>/) || [''])[0];
  const iL = kopf.indexOf('Länge'), iM = kopf.indexOf('Material'), iO = kopf.indexOf('Aussen-ø');
  ok(iL > 0 && iM > 0 && iO > 0, '#16: Kopfzeile 3.3 gefunden', kopf.slice(0, 120));
  ok(iL < iM, '#16: Kopfzeile — Länge steht vor Material', { iL, iM });
  ok(iM < iO, '#16: Kopfzeile — Material steht vor Aussen-ø', { iM, iO });
}

// #3 — Schema kennt den fsto und rechnet die Misch-Zone gegen die Bereitschaft
ok(/fsto:wwNum\('ww_fsto'\)/.test(WW),        '#3: fsto wandert in den _wwSpSchemaDraw-Payload');
ok(/pctBasis:d\.vcont/.test(WW),              '#3: Misch-Zone traegt pctBasis = Bereitschaftsvolumen');
ok(/m\.pctBasis>0\)\?m\.pctBasis:Z\.vtot/.test(WW),
  '#3: Render-Loop nimmt pctBasis, faellt sonst auf das Total zurueck');
ok(/sub:'fsto-Zuschlag '/.test(WW),           '#3: Unterzeile behaelt den Begriff «fsto-Zuschlag»');
ok(/l Bereitschaft'/.test(WW),                '#3: Unterzeile nennt die Bezugsgroesse');

// nur literale Hex-Farben in den neuen Kacheln (GemaPDF-Regel)
{
  const blk = WW.slice(WW.indexOf('id="wwFstoTiles"'), WW.indexOf('id="wwFstoTiles"') + 6000);
  ok(!/var\(--/.test(blk.slice(0, blk.indexOf('</div>\n        </div>') + 40) || blk),
    'Kachel-SVG ohne var()-Farben (literale Hex)');
}

// ── Etappe 8 · statisch ──────────────────────────────────────────────────────

// #9 — «Entnahmen» meint die Zahl JE Nutzungseinheit, nicht die Gesamtzahl.
//      Der Screenshot des Kunden zeigt 27.8 = 2 x 13.9 im Feld: die Gesamtzahl
//      wurde erfasst und danach nochmals mit n multipliziert (Doppelzaehlung).
{
  ok(/var WW_ENTN_AUTO=2;/.test(WW), '#9: Vorschlagswert 2 Entnahmen je NE als eigene Konstante');
  const kopf = (WW.match(/Entnahmen\/NE[\s\S]{0,400}?<\/tr>/) || [''])[0];
  ok(/Entnahmen\/NE/.test(WW),  '#9: Spaltentitel sagt «/NE» statt nur «Entnahmen»');
  ok(/Entnahmen JE Nutzungseinheit/.test(WW),
    '#9: der Kopf-Tooltip benennt die Verwechslung ausdruecklich');
  ok(/>Rechenweg</.test(kopf), '#9: eigene Rechenweg-Spalte in 3.4', kopf.slice(0, 160));
  ok(/data-c="weg"/.test(WW),  '#9: Rechenweg-Zelle wird pro Zeile bemalt');
  ok(/data-c="entnMark"/.test(WW) && /ww-auto-tag/.test(WW),
    '#9: «auto»-Chip markiert den Vorschlag (kein stiller Default)');
  ok(/\.ww-auto-tag\{/.test(WW) && /\.ww \.ww-weg\{/.test(WW), '#9: CSS fuer Chip und Rechenweg-Spalte');
  ok(/eigen\?\(parseFloat\(r\.entnahmen\)\|\|0\):WW_ENTN_AUTO/.test(WW),
    '#9: eine eigene Eingabe gewinnt IMMER ueber den Vorschlag (Bestandsschutz)');
}

// #15 — beide Uebernahmen stehen VOR der Tabelle (Muster 3.2, Feedback #21)
{
  const i33  = WW.indexOf('3.3 Warmgehaltene Leitungen');
  const blk  = WW.slice(i33, i33 + 4200);
  const iGr  = blk.indexOf('wwLeitAusGrob()');
  const iZk  = blk.indexOf('wwZirkUebernehmen()');
  const iTab = blk.indexOf('<table');
  ok(i33 > 0 && iGr > 0 && iZk > 0 && iTab > 0, '#15: Karte 3.3 mit beiden Knoepfen gefunden',
    { i33, iGr, iZk, iTab });
  ok(iGr < iTab, '#15: «⇩ Längen aus Grobauslegung» steht VOR der Tabelle', { iGr, iTab });
  ok(iZk < iTab, '#15: «⇩ aus Zirkulationsberechnung» steht VOR der Tabelle', { iZk, iTab });
  ok(blk.slice(iTab).indexOf('wwZirkUebernehmen()') < 0,
    '#15: der Zirkulations-Knopf steht NICHT mehr unter der Tabelle');
  ok(/window\.wwLeitAusGrob=function/.test(WW), '#15: Uebernahme-Funktion vorhanden');
  ok(/das ist die GESAMTE Länge aus 2\.2/.test(WW),
    '#15: der Dialog sagt, dass die eine Länge GANZ in den Vorlauf geht (keine geratene Teilung)');
}

// #23 — sichtbare Beschriftung + Uebernahme aus der Grobauslegung
{
  ok(/<span class="k">Nutzungseinheit<\/span>/.test(WW), '#23: Beschriftung «Nutzungseinheit»');
  ok(/<span class="k">Hinweis<\/span>/.test(WW),         '#23: Beschriftung «Hinweis»');
  ok(/<span class="k">Stundenspitze<\/span>/.test(WW),   '#23: Beschriftung «Stundenspitze»');
  ok(/\.ww-fein-sel\{/.test(WW) && /\.ww-fein-l1\{display:flex;align-items:flex-end/.test(WW),
    '#23: CSS — Beschriftung waechst nach oben, Felder bleiben auf einer Linie');
  ok(/window\.wwFeinAusGrob=function/.test(WW), '#23: Uebernahme-Funktion vorhanden');
  ok(/onclick="wwFeinAusGrob\(\)"/.test(WW),    '#23: Knopf verdrahtet');
  {
    const iEcho = WW.indexOf("echo.innerHTML=");
    const iBtn  = WW.indexOf('wwFeinAusGrob()', iEcho);
    ok(iEcho > 0 && iBtn > iEcho && iBtn - iEcho < 1400,
      '#23: der Knopf steht IN der Grob-Echo-Box (dort steht die Auswahl, die uebernommen wird)',
      { iEcho, iBtn });
  }
  const map = (WW.match(/var WW_GROB2FEIN=\[([^\]]*)\]/) || [])[1];
  ok(!!map, '#23: Zuordnungstabelle GROB → FEIN vorhanden');
  if (map) {
    const arr = map.split(',').map(x => x.trim());
    ok(arr.length === 14, '#23: die Tabelle deckt alle 14 Grob-Nutzungen ab', arr.length);
    ok(arr[3] === 'null', '#23: «Gastronomie» hat kein Fein-Pendant und wird NICHT geraten', arr[3]);
    ok(arr[0] === '0' && arr[1] === '3' && arr[13] === '25',
      '#23: zugeordnet wird ueber den Normwert (EFH→0, MFH→3, Baden→25)', arr.slice(0, 2).concat(arr[13]));
  }
  ok(/NICHT übernommen \(kein Pendant in der Feinplanung\)/.test(WW),
    '#23: eine nicht zuordenbare Zeile wird BENANNT (no-silent-Regel)');
  ok(/Abweichender Normwert/.test(WW),
    '#23: eine abweichende Norm-Stufe wird ausgewiesen statt still uebernommen');
  ok(/altProfil\[r\.ne\]=r\.profil/.test(WW),
    '#23: eine bereits gewaehlte Stundenspitze ueberlebt das Ersetzen (Kundenwunsch)');
}

// ── Etappe 9 · statisch ─────────────────────────────────────────────────────

// #22 — Summenlinien der Nutzungseinheiten (Tab ③)
{
  ok(/\.ww-slfein-legend\{[^}]*flex-direction:column/.test(WW),
    '#22: Legende untereinander (flex-direction:column)');
  ok(/\.ww-slh tr\.ww-lit td,\.ww-slh tr\.ww-lit td\.lead\{color:#dc2626\}/.test(WW),
    '#22: Liter-Zeilen der Stunden-Tabelle rot');
  ok(/function reihe\(lbl,tip,fn,dec,cls\)/.test(WW),
    '#22: reihe() nimmt eine Zeilen-Klasse entgegen');
  const rows = [...WW.matchAll(/\+reihe\('([^']+)'/g)].map(m => m[1]);
  ok(rows.join('|') === '%|Σ %|l|Σ l',
    '#22: Zeilenfolge Prozent zuerst, Liter darunter', rows);
  {
    // jede +reihe(...)-Zeile steht fuer sich — so muss der Regex nicht ueber die
    // Klammern der inline-Funktion hinweglesen
    const rz = WW.split('\n').filter(l => l.includes("+reihe('"));
    const lit = rz.filter(l => l.includes("'ww-lit'"));
    ok(rz.length === 4 && lit.length === 2
       && lit[0].includes("reihe('l',") && lit[1].includes("reihe('Σ l',"),
      '#22: nur die beiden Liter-Zeilen tragen .ww-lit', rz.map(l => l.trim()));
  }
  ok(/var slotW=W\/24,lblStep=slotW>=22\?1:\(slotW>=13\?2:3\);/.test(WW),
    '#22: die Beschriftung duennt bei schmalen Slots aus — das Format bleibt');
  ok(/ctx\.fillText\(\('0'\+\(t1%24\)\)\.slice\(-2\),x,padT\+H\+15\);/.test(WW),
    '#22: X-Achse zweistellig «00 / 01 / 02 …»');
  ok(!/'03:00'|:00'/.test(WW.slice(WW.indexOf('var slotW=W/24'), WW.indexOf('var slotW=W/24') + 400)),
    '#22: keine gemischte «03:00»-Beschriftung mehr');
  {
    // der CSS-Kommentar weiter oben beginnt gleich — erst die volle Zeile ist eindeutig
    const i = WW.indexOf('#22: Liter-Werte rot, Prozent-Werte schwarz belassen');
    const blk = WW.slice(i, i + 420);
    ok(/ctx\.fillStyle='#dc2626';[\s\S]{0,120}' l'/.test(blk),
      '#22: linke Achse (Liter) rot', blk.slice(0, 200));
    ok(/ctx\.fillStyle='#94a3b8';[\s\S]{0,140}' %'/.test(blk),
      '#22: rechte Achse (Prozent) schwarz belassen');
  }
  // Kanon Feedback 19.08.2026 #2: die Tabelle fluchtet ueber DIESELBE Geometrie
  // wie das Diagramm — padL | 24 gleiche Stunden-Spalten | padR bei Breite cssW.
  // #22 aendert nur Beschriftung/Farbe/Zeilenfolge; DIESE Zeilen bleiben unberuehrt.
  ok(WW.includes(`var cols='<colgroup><col style="width:'+padL+'px">';`),
    '#22: colgroup beginnt unveraendert mit der padL-Lead-Spalte');
  ok(WW.includes("for(var c=0;c<24;c++)cols+='<col>';"),
    '#22: colgroup hat unveraendert 24 gleich breite Stunden-Spalten');
  ok(WW.includes(`cols+='<col style="width:'+padR+'px"></colgroup>';`),
    '#22: colgroup schliesst unveraendert mit der padR-Pad-Spalte');
  ok(/style="width:'\+cssW\+'px"/.test(WW),
    '#22: Tabelle behaelt die Canvas-Breite (Spaltengrenzen bleiben auf X(h))');
}

// #5 — Ladestunden-Diagramm (Tab ④)
{
  const i = WW.indexOf('function wwSoDraw(');
  const blk = WW.slice(i, i + 9000);
  ok(i > 0, '#5: wwSoDraw gefunden');
  // Nachzug Feedback 05.09.2026 #4: die Skala fasst seither BEIDE Kurven
  // (Verbrauch + kumulierte Ladung) — geprueft wird die ABSICHT, nicht der
  // wortwoertliche Ausdruck, damit #4 die Zusicherung von #5 nicht bricht.
  ok(/var verbMax=[^;]*verbTot\+\(pk>0\?pk:0\)/.test(blk),
    '#5: die Skala reicht mindestens bis Tagesbedarf + Spitzendeckung (nichts wird abgeschnitten)');
  ok(/function YV\(v\)\{return padT\+H-\(v\/verbMax\)\*H;\}/.test(blk),
    '#5: eigene Verbrauchs-Skala YV()');
  ok(/for\(var tp=0;tp<=24;tp\+\+\)/.test(blk) && /YV\(verbCum\[tp\]\+pk\)/.test(blk),
    '#5: die Spitzendeckung laeuft als Kurve verbCum+pk');
  ok(!/ctx\.moveTo\(padL,Y\(pk\)\)/.test(blk),
    '#5: die frühere waagrechte Spitzendeckungs-Linie ist weg');
  ok(/'\+ Spitzendeckung '/.test(blk),
    '#5: die Kurve ist als «+ Spitzendeckung» beschriftet');
  ok(/Math\.round\(yv\/verbTot\*100\)\+' %'/.test(blk),
    '#5: linke Achse zeigt zusaetzlich Prozent des Tagesbedarfs');
  ok(/Math\.round\(vv\/verbTot\*100\)\+' %'/.test(blk),
    '#5: rechte Achse in Prozent (vorher dieselben Liter-Werte wie links)');
  ok(/var soSlotW=W\/24,soLblStep=soSlotW>=22\?1:\(soSlotW>=13\?2:3\);/.test(blk),
    '#5: dieselbe Ausduenn-Regel wie in den Summenlinien');
  ok(/ctx\.fillText\(\('0'\+\(t3%24\)\)\.slice\(-2\),x,padT\+H\+15\);/.test(blk),
    '#5: X-Achse stuendlich «00 / 01 / 02 …»');
  ok(!/':00'/.test(blk), '#5: keine «hh:00»-Beschriftung mehr');
}

// ── Etappe 10 · statisch ────────────────────────────────────────────────────
// #4 — kumulierte Ladung im Ladestunden-Diagramm (Tab ④)
{
  const i = WW.indexOf('function wwSoDraw(');
  const blk = WW.slice(i, i + 9000);
  ok(/var ladCum=\[0\],ls=0;/.test(blk) && /so\.rows\.forEach\(function\(r\)\{ls\+=r\.prod;ladCum\.push\(ls\);\}\);/.test(blk),
    '#4: die Ladung wird kumuliert (ladCum aus r.prod)');
  ok(/var verbMax=Math\.max\(verbTot\+\(pk>0\?pk:0\),ls\);/.test(blk),
    '#4: die Skala fasst BEIDE Kurven — eine reichliche Ladung wird nie stillschweigend abgeschnitten');
  ok(/ctx\.strokeStyle='#1d4ed8';/.test(blk) && /YV\(ladCum\[tl\]\)/.test(blk),
    '#4: die Ladelinie laeuft auf DERSELBEN YV()-Skala wie der Verbrauch');
  ok(/'Σ Ladung '/.test(blk), '#4: die Ladelinie ist als «Σ Ladung» beschriftet');
  ok(/if\(ls>0\)\{/.test(blk),
    '#4: ohne markierte Ladestunde wird keine leere Linie gezeichnet');
}

// #2 — Zeitraffer im Speicherschema (Karte 4.4)
{
  const i = WW.indexOf('window._wwSpSchemaDraw=function(d){');
  const blk = WW.slice(i, i + 30000);
  ok(/data-wwsp="zrMark"/.test(blk),
    '#2: eigener Fuellhoehen-Marker (nicht die Zonen-Rects umgefaerbt)');
  ok(!/fill="#bfdbfe"[^>]*data-wwsp="zrMark"/.test(blk),
    '#2: der Marker traegt NICHT die Overlay-Farbe #bfdbfe');
  // Die drei Knoepfe entstehen aus EINER Schleife — im Quelltext steht das
  // Attribut darum nur einmal; die Dreizahl prueft der Browser-Teil.
  ok(/\[1,2,5\]\.forEach\(function\(sp,si\)\{/.test(blk),
    '#2: Tempo-Stufen 1× / 2× / 5×');
  ok(/onclick="wwSpZrTempo\('\+sp\+'\)"/.test(blk),
    '#2: die Knoepfe rufen wwSpZrTempo(sp)');
  ok(/var ZR=\{timer:0,t:0,on:false,sp:1\};/.test(WW),
    '#2: Tempo im Zustand, Standard 1× (Bestandsschutz)');
  ok(/ZR\.t\+=0\.22\*\(ZR\.sp\|\|1\);/.test(WW),
    '#2: das Tempo skaliert den Fortschritt, nicht die Bildrate');
  ok(/window\.wwSpZrTempo=function\(sp\)\{/.test(WW),
    '#2: wwSpZrTempo ist window-exponiert (Inline-onclick, Cross-Block-Regel)');
  ok(/'\[data-wwsp="zrOv"\],\[data-wwsp="zrMark"\]'/.test(WW),
    '#2: zrStop raeumt den Marker mit ab');
  ok(/var dPct=inhalt-vor, lad=dPct>1e-9, ent=dPct<-1e-9;/.test(WW),
    '#2: Laden/Entnehmen kommt aus der Simulation (Vorzeichen von inhalt−vor), nichts wird geraten');
  ok(/'#16a34a':\(ent\?'#dc2626':'#94a3b8'\)/.test(WW),
    '#2: gruen = Ladung, rot = Entnahme, grau = Ruhe');
  ok(/\\u2191 Ladung /.test(WW) && /\\u2193 Entnahme /.test(WW),
    '#2: der Chip nennt die aktuelle Ladung/Entnahme in l/h');
}

// ─────────────────────────────────────────────────────────────── Browser
sec('B · Browser');
const srv = await startServer();
let browser = null;
try {
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  const { page } = await newPage(browser, seed(['role_planer']));
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/sb_warmwasser.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof wwRecalc === 'function' && typeof window._wwSpSchemaDraw === 'function',
    null, { timeout: 12000 });

  // Bedarf seeden (50 P Mehrfamilienhaus) — ohne Bedarf zeichnet Tab ④ nur den Hinweis
  await page.evaluate(() => { wwState.fein.push({ ne: 3, n: '50', profil: 'wohnbau' }); wwRenderTables(); wwRecalc(); });
  await page.evaluate(() => { const e = document.querySelector('[data-tab="wt4"]'); if (e) e.click(); });
  await page.waitForTimeout(400);

  // #8 — drei Kacheln, korrekte Faktoren, Klick setzt Wert UND Merker
  const tiles = await page.$$eval('#wwFstoTiles .ww-fsto-tile',
    els => els.map(e => ({ f: e.dataset.fsto, b: e.dataset.bauart, t: (e.querySelector('.t') || {}).textContent })));
  ok(tiles.length === 3, '#8: genau drei Bauart-Kacheln', tiles.length);
  ok(tiles.map(t => t.f).join('|') === '1.25|1.1|1', '#8: Faktoren 1.25 / 1.1 / 1.0', tiles.map(t => t.f));

  await page.evaluate(() => { const e = document.querySelector('[data-bauart="tauscher_extern"]'); if (e) e.click(); });
  await page.waitForTimeout(300);
  const nach = await page.evaluate(() => ({
    v: document.getElementById('ww_fsto').value,
    b: document.getElementById('ww_fsto_bauart').value,
    akt: [...document.querySelectorAll('#wwFstoTiles .ww-fsto-tile.active')].map(e => e.dataset.bauart)
  }));
  ok(nach.v === '1.1',                    '#8: Klick setzt fsto 1.1', nach.v);
  ok(nach.b === 'tauscher_extern',        '#8: Klick setzt den Bauart-Merker', nach.b);
  ok(nach.akt.join() === 'tauscher_extern', '#8: genau die geklickte Kachel ist aktiv', nach.akt);

  // Bestandsschutz: ein Alt-Wert 1.5 bleibt stehen und markiert KEINE Kachel
  await page.evaluate(() => {
    const f = document.getElementById('ww_fsto'), b = document.getElementById('ww_fsto_bauart');
    b.value = ''; f.value = '1.5';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const alt = await page.evaluate(() => ({
    v: document.getElementById('ww_fsto').value,
    n: document.querySelectorAll('#wwFstoTiles .ww-fsto-tile.active').length
  }));
  ok(alt.v === '1.5', '#8 Bestandsschutz: Alt-Wert 1.5 bleibt erhalten', alt.v);
  ok(alt.n === 0,     '#8 Bestandsschutz: Alt-Wert markiert keine Kachel', alt.n);

  // #3 — Misch-Prozent = fsto-Zuschlag auf die Bereitschaft
  await page.evaluate(() => { const e = document.querySelector('[data-bauart="register_innen"]'); if (e) e.click(); });
  await page.waitForTimeout(300);
  const schema = await page.evaluate(() => {
    const svg = document.querySelector('#wwSpSchemaWrap svg');
    const t = svg ? [...svg.querySelectorAll('text')].map(e => e.textContent) : [];
    return { txt: t.join(' § ') };
  });
  const mPct = schema.txt.match(/Liter · \+(\d+) %/);
  ok(!!mPct && Number(mPct[1]) === 25,
    '#3: Misch-Zone zeigt «+25 %» (fsto 1.25 auf die Bereitschaft)', mPct ? mPct[1] : schema.txt.slice(0, 300));
  ok(/fsto-Zuschlag 1\.25 auf .* l Bereitschaft/.test(schema.txt),
    '#3: Unterzeile nennt Faktor und Bezugsgroesse', schema.txt.match(/fsto-Zuschlag[^§]*/) || null);
  // die Zonen IM Behaelter bleiben auf das Total bezogen (Summe 100 %)
  ok(!/Liter · \+\d+ %.*Liter · \+\d+ %/.test(schema.txt),
    '#3: nur die Misch-Zone traegt das «+» (Spitze/Steuer bleiben auf das Total bezogen)');

  // ── Etappe 2 — Tab ③ Feinplanung, 3.4 Ausstosswaermeverluste ───────────
  await page.evaluate(() => {
    wwState.whg = [{ whg: '5', anf: '65' }, { whg: '5', anf: '85' }, { whg: '3', anf: '105' }];
    wwRenderTables(); wwRecalc();
  });
  await page.evaluate(() => { const e = document.querySelector('[data-tab="wt3"]'); if (e) e.click(); });
  await page.waitForTimeout(300);

  // #10 — drei zusaetzliche Spalten in der Wohnungen-Tabelle
  const sp = await page.evaluate(() => {
    const tb = document.getElementById('wwAusstossWohnBody');
    const tab = tb ? tb.closest('table') : null;
    const kopf = tab ? [...tab.querySelectorAll('thead th')].map(e => e.textContent.trim()) : [];
    const z1 = tb ? [...tb.querySelectorAll('tr')][0] : null;
    const zellen = z1 ? [...z1.children].map(e => e.textContent.trim()) : [];
    const tot = tb ? [...tb.querySelectorAll('tr')].pop() : null;
    return { kopf, zellen, totN: tot ? tot.children.length : 0 };
  });
  ok(sp.kopf.length === 8, '#10: Wohnungen-Tabelle hat 8 Spalten', sp.kopf);
  ok(sp.kopf[1] === 'Ø Personenbelegung',
    '#10: Spalte «Ø Personenbelegung» steht zwischen Wohnungstyp und Anz. Whg', sp.kopf[1]);
  ok(sp.kopf[5] === 'Wärmeverluste pro Entnahme',
    '#10: Spalte «Wärmeverluste pro Entnahme» nach «Zeit [s]»', sp.kopf[5]);
  ok(sp.kopf[6] === 'Wärmeverluste pro Nutzungseinheit',
    '#10: Spalte «Wärmeverluste pro Nutzungseinheit» direkt vor kWh/d', sp.kopf[6]);
  ok(sp.totN === 8, '#10: Total-Fusszeile hat dieselbe Spaltenzahl', sp.totN);
  const bel = parseFloat(String(sp.zellen[1]).replace(',', '.'));
  ok(bel > 1 && bel < 6, '#10: Ø-Belegung ist ein plausibler Wert', sp.zellen[1]);
  const perE = parseFloat(String(sp.zellen[5]).replace(',', '.'));
  const perNE = parseFloat(String(sp.zellen[6]).replace(',', '.'));
  const entn = parseFloat(String(sp.zellen[3]).replace(',', '.'));
  ok(perE > 0 && perE < 1, '#10: Verlust je Entnahme ist ein kWh-Wert < 1', sp.zellen[5]);
  ok(Math.abs(perNE - entn * perE) < 0.02,
    '#10: Verlust je Nutzungseinheit = Entnahmen × Verlust je Entnahme', [entn, perE, perNE]);
  const nw = parseFloat(String(sp.zellen[2]).replace(',', '.'));
  const tag = parseFloat(String(sp.zellen[7]).replace(',', '.'));
  ok(Math.abs(tag - perNE * nw) < 0.05,
    '#10: kWh/d bleibt Verlust je Nutzungseinheit × Anzahl (Rechenkette unveraendert)', [perNE, nw, tag]);

  // #11 — das Zeit-Select wird nicht mehr abgeschnitten
  const zt = await page.evaluate(() => {
    const s = document.querySelector('#wwAusstossWohnBody select.ww-zeit');
    if (!s) return null;
    const cs = getComputedStyle(s);
    return { w: s.getBoundingClientRect().width, over: s.scrollWidth - s.clientWidth,
             font: cs.fontSize, txt: s.options[0].textContent };
  });
  ok(!!zt && zt.over === 0, '#11: Zeit-Select schneidet nichts ab (kein Overflow)', zt);
  ok(!!zt && zt.font === '16px',
    '#11: gemessen gegen die global erzwungenen 16px, nicht gegen die deklarierten 12.5px', zt && zt.font);
  ok(!!zt && zt.w >= 118, '#11: Breite traegt «Standard (10 s)»', zt && zt.w);

  // #12 — Beschriftung + Hinweis nebeneinander, Auswahlfeld klein, Schnellwahl
  const kf = await page.evaluate(() => {
    const sel = document.getElementById('ww_zeitWohn');
    const fg = sel ? sel.closest('.fg') : null;
    const lbl = fg ? fg.querySelector('.fg-lbl') : null;
    const chips = [...document.querySelectorAll('.ww-zeitwahl .ww-quick')];
    return {
      lblRow: !!(lbl && lbl.classList.contains('fg-lbl-row')),
      lblH: lbl ? Math.round(lbl.getBoundingClientRect().height) : 0,
      lblW: lbl ? Math.round(lbl.getBoundingClientRect().width) : 0,
      selW: sel ? Math.round(sel.getBoundingClientRect().width) : 0,
      selKurz: !!(sel && sel.classList.contains('ww-sel-kurz')),
      chips: chips.map(c => c.getAttribute('data-sec') + ':' + (c.classList.contains('active') ? 'a' : '-')),
      val: sel ? sel.value : null
    };
  });
  ok(kf.lblRow && kf.chips.length === 2, '#12: Schnellwahl 10 s / 15 s neben dem Auswahlfeld', kf.chips);
  ok(kf.lblH > 0 && kf.lblH <= 26,
    '#12: Beschriftung + Hinweis auf EINER Zeile (nicht mehr Wort fuer Wort umgebrochen)', kf.lblH);
  ok(kf.lblW > 400, '#12: die Beschriftungs-Spalte ist nicht mehr auf ~150px gequetscht', kf.lblW);
  ok(kf.selKurz && kf.selW < 260,
    '#12: Auswahlfeld auf Inhaltsbreite (.ww-sel-kurz statt .g-sel{width:100%})', kf.selW);
  ok(kf.chips.join(',') === '10:a,15:-', '#12: die aktive Marke folgt dem Auswahlwert', kf.chips);

  await page.evaluate(() => { const b = document.querySelector('.ww-zeitwahl .ww-quick[data-sec="15"]'); if (b) b.click(); });
  await page.waitForTimeout(250);
  const nach2 = await page.evaluate(() => ({
    val: (document.getElementById('ww_zeitWohn') || {}).value,
    chips: [...document.querySelectorAll('.ww-zeitwahl .ww-quick')].map(c => c.getAttribute('data-sec') + ':' + (c.classList.contains('active') ? 'a' : '-')),
    std: (document.querySelector('#wwAusstossWohnBody select.ww-zeit') || { options: [{}] }).options[0].textContent
  }));
  ok(nach2.val === '15', '#12: Klick auf «15 s» setzt den Wert', nach2.val);
  ok(nach2.chips.join(',') === '10:-,15:a', '#12: die aktive Marke wandert mit', nach2.chips);
  ok(/Standard \(15 s\)/.test(nach2.std),
    '#12: die Zeilen uebernehmen den neuen Standard (change wurde gefeuert)', nach2.std);

  /* ── Etappe 3 · 3.3 Warmgehaltene Leitungen (#14, #17) ── */
  console.log('\n── Etappe 3 · 3.3 Warmgehaltene Leitungen ──');

  // #14 — die kWh/d tragen die Farbe ihrer Leitungsart (exakt die Farbpunkt-Toene aus 2.2)
  const farb = await page.evaluate(() => {
    const c = id => {
      const e = document.getElementById(id);
      if (!e) return null;
      const dot = e.closest('tr').querySelector('.ww-cdot');
      return { zelle: getComputedStyle(e).color, punkt: dot ? getComputedStyle(dot).backgroundColor : null };
    };
    return { vl: c('ww_out_qVL'), rl: c('ww_out_qRL'), rar: c('ww_out_qRarF'), whb: c('ww_out_qWhbF') };
  });
  ok(farb.vl && farb.vl.zelle === 'rgb(217, 119, 6)', '#14: Vorlauf konventionell amber (#d97706)', farb.vl);
  ok(farb.rl && farb.rl.zelle === 'rgb(217, 119, 6)', '#14: Ruecklauf konventionell amber (#d97706)', farb.rl);
  ok(farb.rar && farb.rar.zelle === 'rgb(220, 38, 38)', '#14: Rohr-an-Rohr rot (#dc2626)', farb.rar);
  ok(farb.whb && farb.whb.zelle === 'rgb(37, 99, 235)', '#14: Warmhalteband blau (#2563eb)', farb.whb);
  ok(['vl', 'rl', 'rar', 'whb'].every(k => farb[k] && farb[k].zelle === farb[k].punkt),
    '#14: die Wertfarbe ist EXAKT der Farbpunkt der Zeile (kein zweiter Farbkanon)',
    Object.keys(farb).map(k => k + ':' + (farb[k] && farb[k].zelle === farb[k].punkt)).join(' '));

  // #17 — ø-Reihe folgt dem Material
  const dims = id => page.evaluate(i => [...document.getElementById(i).options].map(o => o.value).join(','), id);

  ok(await dims('ww_oeVL') === '15,18,22,28,35,42,54,64,76.1,108',
    '#17: CNS zeigt die Edelstahl-Reihe (76.1 statt der nicht existierenden 78.1)', await dims('ww_oeVL'));
  ok(await dims('ww_oeRarRL') === '15,18,22,28,35,42,54,64,76.1,108',
    '#17: auch RaR-RL folgt dem Material (die alte Sonderliste 12…63 ist weg)', await dims('ww_oeRarRL'));

  await page.evaluate(() => {
    const m = document.getElementById('ww_matRL');
    m.value = 'pex';
    m.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  // synthetisch (isTrusted false) = Boot/Restore-Pfad → kein Klemmen, Wert bleibt
  const pex = await page.evaluate(() => {
    const s = document.getElementById('ww_oeRL');
    return {
      opts: [...s.options].map(o => o.value).join(','),
      val: s.value,
      alt: [...s.options].filter(o => o.classList.contains('ww-oe-alt')).map(o => o.textContent).join('|')
    };
  });
  ok(pex.opts.indexOf('12,16,20,25,32') === 0, '#17: PEX zeigt 12/16/20/25/32', pex.opts);
  ok(pex.val === '22' && /22 \(bisherig\)/.test(pex.alt),
    '#17: der gespeicherte ø 22 bleibt als «(bisherig)» erhalten (Bestandsschutz, kein stilles Kappen)', pex);

  /* echte Benutzer-Wahl → klemmt auf den naechstgroesseren Wert der Reihe.
     KRITISCH: page.selectOption() feuert ein SYNTHETISCHES change (isTrusted false)
     und traefe damit den Restore-Pfad von oben. Eine echte Wahl entsteht im Test nur
     ueber die CDP-Tastatur (Kanon: HX_KLIMA-Stationswahl in lt_hx_diagramm). */
  await page.focus('#ww_matWhb');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const whb = await page.evaluate(() => {
    const s = document.getElementById('ww_oeWhb');
    return { opts: [...s.options].map(o => o.value).join(','), val: s.value };
  });
  ok(whb.opts === '12,16,20,25,32', '#17: echte Wahl baut die Reihe ohne Alt-Option um', whb.opts);
  ok(whb.val === '25', '#17: der ø 22 klemmt auf den naechstgroesseren PEX-Wert 25', whb.val);

  await page.focus('#ww_matWhb');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  ok(await dims('ww_oeWhb') === '15,18,22,28,35,42,54,64,76.1,108',
    '#17: zurueck auf CNS stellt die Edelstahl-Reihe wieder her', await dims('ww_oeWhb'));

  // Rechenkette unveraendert: ein PEX-ø ohne eigenen Faktor nimmt den naechstgroesseren Tabellenwert
  const faktor = await page.evaluate(() => ({ f12: wwOeFaktor(12), f15: wwOeFaktor(15), f16: wwOeFaktor(16), f18: wwOeFaktor(18) }));
  ok(faktor.f12 === faktor.f15, '#17: PEX 12 nimmt den naechstgroesseren Faktor (15) — kein erfundener Zwischenwert', faktor);
  ok(faktor.f16 === faktor.f18, '#17: PEX 16 unveraendert auf dem 18er-Faktor (Bestandsverhalten)', faktor);

  /* ── Etappe 4 · Tab ① Nutzwarmwasserbedarf (#26, #27, #28, #29) ── */
  console.log('\n── Etappe 4 · Tab ① Nutzwarmwasserbedarf ──');

  // #16 — GERENDERTE Spaltenreihenfolge in 3.3 (jede der vier Zeilen)
  const sp16 = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('table.ww')]
      .find(t => /Totaler Leitungsverlust/.test(t.textContent));
    if (!tab) return null;
    const kopf = [...tab.querySelectorAll('thead th')].map(t => t.textContent.trim());
    const rows = [...tab.querySelectorAll('tbody tr')].filter(r => !r.classList.contains('ww-sumrow'));
    const art = el => {
      const id = el.id || (el.querySelector('[id]') || {}).id || '';
      if (/^ww_l/.test(id)) return 'laenge';
      if (/^ww_mat/.test(id)) return 'material';
      if (/^ww_oe/.test(id)) return 'oe';
      if (/^ww_out_q/.test(id)) return 'kwh';
      return 'text';
    };
    const sum = tab.querySelector('tbody tr.ww-sumrow td');
    return {
      kopf,
      zeilen: rows.map(r => [...r.children].map(art).join('|')),
      colspan: sum ? sum.getAttribute('colspan') : null
    };
  });
  ok(sp16 !== null, '#16: Tabelle 3.3 im DOM gefunden', sp16);
  ok(sp16 && sp16.kopf.length === 5 && /Länge/.test(sp16.kopf[1]) && /Material/.test(sp16.kopf[2]) && /Aussen/.test(sp16.kopf[3]),
    '#16: gerenderte Kopfzeile = Leitung | Länge | Material | Aussen-ø | kWh/d', sp16 && sp16.kopf);
  ok(sp16 && sp16.zeilen.length === 4, '#16: vier Leitungs-Zeilen', sp16 && sp16.zeilen.length);
  ok(sp16 && sp16.zeilen.every(z => z === 'text|laenge|material|oe|kwh'),
    '#16: JEDE Zeile traegt die Zellen in derselben Reihenfolge wie die Kopfzeile', sp16 && sp16.zeilen);
  ok(sp16 && sp16.colspan === '4', '#16: Summenzeile spannt weiterhin ueber vier Spalten', sp16 && sp16.colspan);

  // #20 — das freie Heizlast-Feld steht UNTER den Ergebniszeilen, ueber die volle Breite
  const hz = await page.evaluate(() => {
    const inp = document.getElementById('ww_heizFrei');
    const fg = inp && inp.closest('.fg');
    const erg = document.getElementById('ww_out_heizlast');
    const zeile = erg && erg.closest('.g-result-row');
    const grid = document.querySelector('.g-card-bd > .g-main-grid, .g-main-grid');
    if (!fg || !zeile) return null;
    const rf = fg.getBoundingClientRect(), rz = zeile.getBoundingClientRect();
    // Referenz: das Zweispalten-Raster darueber nimmt die volle Inhaltsbreite ein
    // (gegen die Karten-Aussenbreite zu messen waere falsch — sie traegt Padding)
    const ref = fg.previousElementSibling && fg.previousElementSibling.classList.contains('g-main-grid')
      ? fg.previousElementSibling
      : [...(fg.closest('.g-card-bd') || document).querySelectorAll('.g-main-grid')].pop();
    const rr = ref ? ref.getBoundingClientRect() : null;
    return {
      unterhalb: Math.round(rf.top - rz.bottom),
      imGrid: !!(grid && grid.contains(fg)),
      breiteFeld: Math.round(rf.width),
      breiteRef: rr ? Math.round(rr.width) : null
    };
  });
  ok(hz !== null, '#20: Feld und Ergebniszeile vorhanden', hz);
  ok(hz && hz.unterhalb > 0, '#20: das Feld steht UNTER der Zeile «Massgebende Heizlast»', hz && hz.unterhalb);
  ok(hz && hz.imGrid === false, '#20: es sitzt nicht mehr in der Spalte des Zweispalten-Rasters', hz);
  ok(hz && hz.breiteRef && Math.abs(hz.breiteFeld - hz.breiteRef) <= 2,
    '#20: es nimmt die volle Breite ein (gleich breit wie das Raster darueber)', hz);

  // #21 — der Uebernahme-Knopf steht VOR der Tabelle 3.2
  const ub = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button.ww-add')]
      .find(x => /aus Grobauslegung/.test(x.textContent));
    const tb = document.getElementById('wwWhgBody');
    const tabelle = tb && tb.closest('table');
    if (!b || !tabelle) return null;
    const rb = b.getBoundingClientRect(), rt = tabelle.getBoundingClientRect();
    return {
      abstand: Math.round(rt.top - rb.bottom),
      vorher: (b.compareDocumentPosition(tabelle) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      justify: getComputedStyle(b.parentElement).justifyContent
    };
  });
  ok(ub !== null, '#21: Knopf und Wohnungs-Tabelle vorhanden', ub);
  ok(ub && ub.vorher, '#21: der Knopf steht im Markup VOR der Tabelle 3.2', ub);
  ok(ub && ub.abstand >= 0, '#21: er liegt geometrisch oberhalb der Tabelle', ub && ub.abstand);
  ok(ub && ub.justify === 'flex-end', '#21: er bleibt rechtsbuendig', ub && ub.justify);

  await page.evaluate(() => { const e = document.querySelector('[data-tab="wt1"]'); if (e) e.click(); });
  await page.waitForTimeout(250);

  // #26 — die Total-Werte je Nutzungseinheit sind fett
  const tot = await page.evaluate(() => {
    const z = [...document.querySelectorAll('#wwGrobBody tr[data-kind="grob"] td[data-c="tot"]')];
    return z.map(t => ({ w: getComputedStyle(t).fontWeight, txt: t.textContent.trim() }));
  });
  ok(tot.length >= 1, '#26: die Bedarfstabelle 1.3 hat Nutzungseinheiten-Zeilen', tot.length);
  ok(tot.length > 0 && tot.every(t => parseInt(t.w, 10) >= 700),
    '#26: jeder Total-Wert [l/d à 60°C] ist fett', tot.map(t => t.w).join(','));
  ok(tot.length > 0 && tot.every(t => t.txt !== ''),
    '#26: die Total-Spalte traegt weiterhin ihren gerechneten Wert (Rechenkette unberuehrt)', tot.map(t => t.txt).join(','));

  // #27 — die drei Ergebniswerte in 1.3 sind gleich gross, die Akzentfarbe bleibt
  const erg = await page.evaluate(() => {
    const g = id => { const e = document.getElementById(id); return e ? { fs: getComputedStyle(e).fontSize, col: getComputedStyle(e).color, cls: e.className } : null; };
    // Referenz: ein Wert, der unveraendert .big und damit var(--accent) traegt.
    const ref = document.getElementById('ww_out_wrgRed');
    return { vwu: g('ww_out_grobTotal2'), qw: g('ww_out_qw'),
             akzent: ref ? getComputedStyle(ref).color : null };
  });
  ok(erg.vwu && erg.qw, '#27: beide Ergebniswerte in 1.3 vorhanden', erg);
  ok(erg.vwu && erg.qw && erg.vwu.fs === erg.qw.fs,
    '#27: V\'W,u und Q\'W haben dieselbe Schriftgroesse', erg.vwu && (erg.vwu.fs + ' vs ' + erg.qw.fs));
  ok(erg.qw && !/\bbig\b/.test(erg.qw.cls), '#27: Q\'W traegt kein .big mehr', erg.qw && erg.qw.cls);
  ok(erg.qw && erg.akzent && erg.qw.col === erg.akzent,
    '#27: Q\'W behaelt die Akzentfarbe (nur die Groesse war das Problem)',
    erg.qw && (erg.qw.col + ' vs Akzent ' + erg.akzent));

  // #28 — Kaltwasser gruen, Warmwasser rot
  const temp = await page.evaluate(() => {
    const lbl = id => { const i = document.getElementById(id); const l = i && i.closest('.fg') && i.closest('.fg').querySelector('.fg-lbl'); return l ? getComputedStyle(l).color : null; };
    return { kw: lbl('ww_tKw'), ww: lbl('ww_tWw') };
  });
  ok(temp.kw === 'rgb(22, 163, 74)', '#28: Label Kaltwasser-Temperatur ist gruen (#16a34a)', temp.kw);
  ok(temp.ww === 'rgb(220, 38, 38)', '#28: Label WW-Vorlauftemperatur ist rot (#dc2626)', temp.ww);

  // #29 — der Buero-Uebernehmen-Knopf steht rechts wie sein Pendant in 1.1
  const btn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button.ww-add')].find(x => /In Büro-Zeile/.test(x.textContent));
    const ref = [...document.querySelectorAll('button.ww-add')].find(x => /Als Anzahl übernehmen/.test(x.textContent));
    if (!b || !ref) return null;
    const rb = b.getBoundingClientRect(), pb = b.parentElement.getBoundingClientRect();
    const rr = ref.getBoundingClientRect(), pr = ref.parentElement.getBoundingClientRect();
    return {
      justify: getComputedStyle(b.parentElement).justifyContent,
      abstandRechts: Math.round(pb.right - rb.right),
      refAbstandRechts: Math.round(pr.right - rr.right),
      linksBuendig: Math.round(rb.left - pb.left) < 4
    };
  });
  ok(btn !== null, '#29: beide Uebernehmen-Knoepfe vorhanden', btn);
  ok(btn && btn.justify === 'flex-end', '#29: der Knopf sitzt in einem rechtsbuendigen Wrapper', btn && btn.justify);
  ok(btn && !btn.linksBuendig, '#29: er klebt nicht mehr am linken Rand', btn);
  ok(btn && Math.abs(btn.abstandRechts - btn.refAbstandRechts) <= 2,
    '#29: gleicher rechter Abstand wie der Knopf in 1.1 («dito oben bei Wohnungen»)', btn);

  /* ── Etappe 6 · #24 Fixwert-Spalte, #25 Kacheln je Nutzungseinheit ── */
  console.log('\n── Etappe 6 · Tab ② Verlustzahl + Tab ① Ergebnis ──');

  // #24 — Tab ② oeffnen und die Geometrie der drei Fixwert-Zeilen in 2.2 messen.
  await page.evaluate(() => { const e = document.querySelector('[data-tab="wt2"]'); if (e) e.click(); });
  const fix = await page.evaluate(() => {
    const zeile = el => el && el.closest('.g-result-row');
    const rowOf = id => zeile(document.getElementById(id));
    // Die drei Fixwert-Zeilen (Wärmeverlust pro Meter) und ihre Verlust-Pendants darunter.
    const fixRows = [...document.querySelectorAll('.g-result-row')]
      .filter(r => /Wärmeverlust pro Meter/.test(r.textContent) && r.querySelector('.ww-fix-tag'));
    const konv = rowOf('ww_out_qKonv');
    const wertL = r => { const v = r && r.querySelector('.g-result-val'); return v ? Math.round(v.getBoundingClientRect().left) : null; };
    const badge = r => { const b = r && r.querySelector('.ww-fix-tag'); return b ? { left: Math.round(b.getBoundingClientRect().left), w: Math.round(b.getBoundingClientRect().width), direkt: b.parentElement === r } : null; };
    const chip = konv && konv.querySelector('.frml');
    return {
      anzahl: fixRows.length,
      badges: fixRows.map(badge),
      werte: fixRows.map(wertL),
      verlustWert: wertL(konv),
      chipLeft: chip ? Math.round(chip.getBoundingClientRect().left) : null,
      chipW: chip ? Math.round(chip.getBoundingClientRect().width) : null
    };
  });
  ok(fix.anzahl === 3, '#24: drei Fixwert-Zeilen in 2.2 gefunden', fix.anzahl);
  ok(fix.badges.every(b => b && b.direkt),
    '#24: das «Fixwert»-Badge ist direktes Kind der Zeile (eigene Spalte, nicht mehr im Wert)', fix.badges);
  ok(fix.werte.length === 3 && fix.werte.every(w => w !== null && w === fix.werte[0]),
    '#24: die drei Fixwert-Zahlenwerte fluchten untereinander', fix.werte);
  ok(fix.verlustWert !== null && fix.werte[0] === fix.verlustWert,
    '#24: sie fluchten auch mit den Verlust-Werten darunter («Zahlenwerte untereinander»)',
    { fixwert: fix.werte[0], verlust: fix.verlustWert });
  ok(fix.chipLeft !== null && fix.badges[0] && fix.badges[0].left === fix.chipLeft,
    '#24: das Badge sitzt in derselben Spalte wie die Formel-Chips', { badge: fix.badges[0], chipLeft: fix.chipLeft });
  ok(fix.chipW !== null && fix.badges[0] && fix.badges[0].w === fix.chipW,
    '#24: Badge- und Chip-Spalte sind gleich breit (92 px Kanon)', { badgeW: fix.badges[0] && fix.badges[0].w, chipW: fix.chipW });

  // #25 — zwei verschiedene Nutzungen mit DERSELBEN Einheit «P»: frueher eine
  // Sammelkachel «52 Personen», neu eine Kachel je Nutzungseinheit.
  const kach = await page.evaluate(() => {
    wwState.grob = [{ ne: 1, n: '40' }, { ne: 2, n: '12' }];   // Mehrfamilienhaus + Büros
    wwRenderTables(); wwRecalc();
    const e = document.querySelector('[data-tab="wt1"]'); if (e) e.click();
    const host = document.getElementById('ww_out_einheiten');
    const kacheln = [...host.querySelectorAll('.ww-kpi')].map(k => ({
      v: (k.querySelector('.v') || {}).textContent,
      l: (k.querySelector('.l') || {}).textContent,
      s: (k.querySelector('.s') || {}).textContent
    }));
    return { kacheln, zeilen: (wwCalc().einheitenZeilen || []).map(z => ({ label: z.label, n: z.n, einheit: z.einheit })),
             summe: (wwCalc().einheiten || {}) };
  });
  const nutz = kach.kacheln.filter(k => !/aus 1\.3/.test(k.s || ''));
  ok(kach.zeilen.length === 2, '#25: wwCalc liefert eine Zeile je Nutzungseinheit', kach.zeilen);
  ok(kach.zeilen.every(z => z.n === 40 || z.n === 12),
    '#25: die Anzahlen bleiben getrennt (40 + 12, nicht 52)', kach.zeilen.map(z => z.n));
  ok(kach.summe.P === 52, '#25: res.einheiten bleibt als Summe je Einheit erhalten (Bestandsschutz)', kach.summe);
  ok(nutz.length === 2, '#25: zwei Kacheln statt einer Sammelkachel', nutz);
  ok(nutz.some(k => /Mehrfamilienhaus/.test(k.l)) && nutz.some(k => /Büros/.test(k.l)),
    '#25: jede Kachel nennt ihre Nutzungseinheit', nutz.map(k => k.l));
  ok(nutz.every(k => /\[P\]/.test(k.s || '')),
    '#25: das Einheiten-Kuerzel steht weiterhin dabei', nutz.map(k => k.s));

  // ────────────────────────────────────────────────────────────────────────
  // #13 — «Stärke des Warmhaltebands muss wählbar sein. Der Durchmesser vom Rohr
  //       plus die Dicke des Warmhaltebands ergibt den nächst grösseren
  //       Durchmesser für die Verlustrechnung.» (Domotec 6 · Raychem 7 · Systec 7.5)
  // ────────────────────────────────────────────────────────────────────────
  const band = await page.evaluate(() => {
    const e = document.querySelector('[data-tab="wt3"]'); if (e) e.click();
    const sel = document.getElementById('ww_whbBand');
    const opts = sel ? [...sel.options].map(o => ({ v: o.value, t: o.textContent })) : null;
    // Bestandsschutz: Default «ohne Zuschlag» → wirksamer ø = Rohr-ø
    document.getElementById('ww_lWhbF').value = '10';
    document.getElementById('ww_oeWhb').value = '35';
    if (sel) sel.value = '0';
    wwRecalc();
    const r0 = wwCalc();
    const ohne = { tab: r0.whbTab, q: r0.qWhbF, info: (document.getElementById('ww_out_whbInfo') || {}).textContent };
    // 35 + 6 = 41 → nächstgrösserer Tabellenwert 42
    if (sel) sel.value = '6';
    wwRecalc();
    const r6 = wwCalc();
    const info6 = (document.getElementById('ww_out_whbInfo') || {}).textContent;
    // 35 + 7.5 = 42.5 → nächstgrösserer Tabellenwert 54
    if (sel) sel.value = '7.5';
    wwRecalc();
    const r75 = wwCalc();
    return {
      opts, ohne,
      mit6: { tab: r6.whbTab, q: r6.qWhbF, info: info6 },
      mit75: { tab: r75.whbTab, q: r75.qWhbF },
      inZelle: !!(sel && sel.closest('td') === document.getElementById('ww_oeWhb').closest('td'))
    };
  });
  ok(!!band.opts, '#13: Auswahlfeld für die Bandstärke vorhanden', band.opts);
  ok(band.opts && band.opts.length === 4 && band.opts[0].v === '0',
    '#13: «ohne Zuschlag» steht zuerst und ist der Default (Bestandsschutz)', band.opts && band.opts[0]);
  ok(band.opts && ['6', '7', '7.5'].every(v => band.opts.some(o => o.v === v)),
    '#13: die drei Fabrikate des Kunden sind wählbar (6 · 7 · 7.5 mm)', band.opts);
  ok(band.opts && /Domotec/.test(band.opts.map(o => o.t).join('|'))
    && /Raychem/.test(band.opts.map(o => o.t).join('|'))
    && /Systec/.test(band.opts.map(o => o.t).join('|')),
    '#13: die Fabrikate sind benannt (Domotec · Raychem · Systec Therm AG)', band.opts && band.opts.map(o => o.t));
  ok(band.inZelle, '#13: die Bandstärke steht in derselben Zelle wie der Rohr-ø');
  ok(band.ohne.tab === 35, '#13: ohne Zuschlag rechnet der reine Rohr-ø weiter (Bestandsschutz)', band.ohne);
  ok(band.mit6.tab === 42, '#13: ø 35 + 6 mm = 41 → nächstgrösserer Tabellenwert 42 mm', band.mit6);
  ok(band.mit75.tab === 54, '#13: ø 35 + 7.5 mm = 42.5 → nächstgrösserer Tabellenwert 54 mm', band.mit75);
  ok(band.mit6.q > band.ohne.q, '#13: der Zuschlag erhöht den Verlust (er wird wirklich gerechnet)',
    { ohne: band.ohne.q, mit6: band.mit6.q });
  ok(/35/.test(band.mit6.info || '') && /42/.test(band.mit6.info || ''),
    '#13: die Herleitung steht unter dem Zeilentitel (kein stiller Sprung)', band.mit6.info);

  // ────────────────────────────────────────────────────────────────────────
  // #18 — «Temperaturen sollen pro Warmhaltetyp wählbar sein. Wenn die Werte beim
  //       ersten (konventionell) gewählt werden übernommen werden und anschliessend
  //       anpassbar sein.»
  // ────────────────────────────────────────────────────────────────────────
  const t0 = await page.evaluate(() => {
    const e = document.querySelector('[data-tab="wt3"]'); if (e) e.click();
    return {
      felder: ['ww_tWwL', 'ww_tRaum', 'ww_tWwRar', 'ww_tRaumRar', 'ww_tWwWhb', 'ww_tRaumWhb']
        .map(id => !!document.getElementById(id)),
      dtZellen: ['ww_out_dtLeitung', 'ww_out_dtRar', 'ww_out_dtWhb'].map(id => !!document.getElementById(id)),
      tab: !!document.querySelector('.ww-temptab'),
      punkte: [...document.querySelectorAll('.ww-temptab .ww-cdot')].map(d => d.style.background)
    };
  });
  ok(t0.felder.every(Boolean), '#18: θWW und θR je Warmhaltetyp erfassbar', t0.felder);
  ok(t0.dtZellen.every(Boolean), '#18: ∆T wird je Zeile ausgewiesen', t0.dtZellen);
  ok(t0.tab, '#18: die drei Typen stehen als Tabelle (nicht als sechs Einzelfelder)');
  ok(t0.punkte.length === 3, '#18: ein Farbpunkt je Warmhaltetyp — dieselbe Zuordnung wie die Leitungstabelle', t0.punkte);

  // Übernahme: konventionell aendern -> RaR/WHB folgen
  const t1 = await page.evaluate(async () => {
    const w = document.getElementById('ww_tWwL'), r = document.getElementById('ww_tRaum');
    w.value = '65'; w.dispatchEvent(new Event('input', { bubbles: true }));
    r.value = '15'; r.dispatchEvent(new Event('input', { bubbles: true }));
    wwRecalc();
    const g = id => (document.getElementById(id) || {}).value;
    const c = wwCalc();
    return {
      rar: [g('ww_tWwRar'), g('ww_tRaumRar')], whb: [g('ww_tWwWhb'), g('ww_tRaumWhb')],
      dt: [c.dtLeitung, c.dtRar, c.dtWhb],
      mark: (document.getElementById('ww_tRarMark') || {}).textContent.trim()
    };
  });
  ok(t1.rar[0] === '65' && t1.rar[1] === '15' && t1.whb[0] === '65' && t1.whb[1] === '15',
    '#18: Rohr-an-Rohr und Warmhalteband übernehmen die konventionellen Werte', t1);
  ok(t1.dt[0] === 50 && t1.dt[1] === 50 && t1.dt[2] === 50,
    '#18: ∆T folgt der Übernahme (65 − 15 = 50 K in allen drei Zeilen)', t1.dt);
  ok(/auto/.test(t1.mark), '#18: die uebernommene Zeile ist als «auto» markiert', t1.mark);

  // Eigene Eingabe (isTrusted) gewinnt und wird NICHT mehr ueberschrieben
  await page.click('#ww_tRaumRar', { clickCount: 3 });
  await page.keyboard.type('10');
  await page.evaluate(() => wwRecalc());
  const t2 = await page.evaluate(() => {
    const w = document.getElementById('ww_tWwL');
    w.value = '55'; w.dispatchEvent(new Event('input', { bubbles: true }));   // konv. erneut aendern
    wwRecalc();
    const g = id => (document.getElementById(id) || {}).value;
    const c = wwCalc();
    return {
      touch: (document.getElementById('ww_tRarTouch') || {}).value,
      rar: [g('ww_tWwRar'), g('ww_tRaumRar')], whb: [g('ww_tWwWhb'), g('ww_tRaumWhb')],
      dt: [c.dtLeitung, c.dtRar, c.dtWhb],
      mark: (document.getElementById('ww_tRarMark') || {}).textContent.trim(),
      reset: !!document.querySelector('#ww_tRarMark .ww-treset')
    };
  });
  ok(t2.touch === '1', '#18: eine echte Eingabe (isTrusted) löst die Automatik NUR dieser Zeile', t2.touch);
  ok(t2.rar[1] === '10', '#18: die eigene Raumtemperatur bleibt erhalten (kein Überschreiben)', t2.rar);
  ok(t2.whb[0] === '55', '#18: die noch nicht angefasste Zeile folgt weiterhin der konventionellen', t2.whb);
  ok(t2.dt[1] === 55 && t2.dt[2] === 40,
    '#18: jede Zeile rechnet mit IHREM ∆T (RaR 65−10 = 55 K, WHB 55−15 = 40 K)', t2.dt);
  ok(t2.reset, '#18: die gelöste Zeile bietet den Rückweg «↺ auto» an', t2.mark);

  // ∆T wirkt wirklich je Zeile auf die kWh
  const t3 = await page.evaluate(() => {
    document.getElementById('ww_lRarF').value = '10';
    document.getElementById('ww_oeRarVL').value = '22';
    document.getElementById('ww_oeRarRL').value = '22';
    wwRecalc();
    const c = wwCalc();
    return { dtRar: c.dtRar, dtWhb: c.dtWhb, qRar: c.qRarF, tab: c.rarTab };
  });
  const erwartetRar = 10 * t3.dtRar * 0.003633333;   // Σ 44 → Tabellenwert 54 mm
  ok(t3.tab === 54 && Math.abs(t3.qRar - erwartetRar) < 1e-6,
    '#18: die RaR-Zeile rechnet mit ihrem eigenen ∆T', { ist: t3.qRar, soll: erwartetRar, tab: t3.tab });

  // Rueckweg stellt die Automatik wieder her
  const t4 = await page.evaluate(() => {
    wwTempReset('rar');
    const g = id => (document.getElementById(id) || {}).value;
    return {
      touch: (document.getElementById('ww_tRarTouch') || {}).value,
      rar: [g('ww_tWwRar'), g('ww_tRaumRar')],
      mark: (document.getElementById('ww_tRarMark') || {}).textContent.trim()
    };
  });
  ok(t4.touch !== '1' && t4.rar[0] === '55' && t4.rar[1] === '15',
    '#18: «↺ auto» holt die konventionellen Werte zurück', t4);
  ok(/auto/.test(t4.mark) && !/↺/.test(t4.mark), '#18: danach steht die Zeile wieder auf «auto»', t4.mark);

  // ── Etappe 8 · Browser ────────────────────────────────────────────────────

  sec('C · Etappe 8 — #9 / #15 / #23');

  // Dialoge abfangen: die drei Uebernahmen melden ueber GemaDialog. Ohne Stub
  // wuerde der Test auf einen echten Dialog warten.
  await page.evaluate(() => {
    window.__dlg = [];
    window.__dlgAntwort = true;
    window.GemaDialog = {
      alert: function (o) { window.__dlg.push(String((o && o.message) || '')); return Promise.resolve(true); },
      confirm: function (o) { window.__dlg.push('CONFIRM:' + String((o && o.message) || '')); return Promise.resolve(window.__dlgAntwort); },
      prompt: function () { return Promise.resolve(null); }
    };
  });

  // #9 — Vorschlag 2 je NE, «auto»-Chip, Rechenweg
  const e9 = await page.evaluate(() => {
    const e = document.querySelector('[data-tab="wt3"]'); if (e) e.click();
    wwState.ausstoss = [{ kat: 'Wohneinheiten', n: '10', entnahmen: '', zeit: '10' }];
    wwRenderTables(); wwRecalc();
    const r = wwCalc().ausstoss[0] || {};
    const tr = document.querySelector('#wwAusstossBody tr');
    const chip = tr && tr.querySelector('[data-c="entnMark"]');
    const weg = tr && tr.querySelector('[data-c="weg"]');
    return {
      perE: r.perE, entn: r.entn, n: r.n, tot: r.tot, auto: r.auto,
      chip: chip ? getComputedStyle(chip).display : 'fehlt',
      weg: weg ? weg.textContent.trim() : ''
    };
  });
  ok(e9.entn === 2 && e9.auto === true,
    '#9: ein leeres Feld nimmt den Vorschlag 2 Entnahmen je NE', e9);
  ok(Math.abs(e9.tot - e9.perE * 2 * e9.n) < 1e-9,
    '#9: gerechnet wird perE × Entnahmen je NE × Anzahl NE', e9);
  ok(e9.chip !== 'none' && e9.chip !== 'fehlt', '#9: der «auto»-Chip ist sichtbar', e9.chip);
  ok(/×/.test(e9.weg) && e9.weg.split('×').length === 3,
    '#9: die Rechenweg-Zelle zeigt alle drei Faktoren', e9.weg);

  const e9b = await page.evaluate(() => {
    wwState.ausstoss[0].entnahmen = '5';
    wwRenderTables(); wwRecalc();
    const r = wwCalc().ausstoss[0] || {};
    const chip = document.querySelector('#wwAusstossBody [data-c="entnMark"]');
    return { entn: r.entn, auto: r.auto, tot: r.tot, perE: r.perE, n: r.n,
             chip: chip ? getComputedStyle(chip).display : 'fehlt' };
  });
  ok(e9b.entn === 5 && e9b.auto === false, '#9: eine eigene Eingabe gewinnt', e9b);
  ok(e9b.chip === 'none', '#9: der «auto»-Chip verschwindet bei eigener Eingabe', e9b.chip);
  ok(Math.abs(e9b.tot - e9b.perE * 5 * e9b.n) < 1e-9,
    '#9: der eigene Wert geht in dieselbe Rechnung', e9b);

  // #15 — die eine konventionelle Laenge aus 2.2 geht GANZ in den Vorlauf
  const e15 = await page.evaluate(async () => {
    window.__dlg = [];
    const set = (id, v) => { const el = document.getElementById(id); el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('ww_lKonv', '40'); set('ww_lRar', '12'); set('ww_lWhb', '7');
    set('ww_lVL', '0'); set('ww_lRL', '0'); set('ww_lRarF', '0'); set('ww_lWhbF', '0');
    wwLeitAusGrob();
    await new Promise(r => setTimeout(r, 60));
    const v = id => document.getElementById(id).value;
    return { vl: v('ww_lVL'), rl: v('ww_lRL'), rar: v('ww_lRarF'), whb: v('ww_lWhbF'),
             txt: (window.__dlg[0] || '') };
  });
  ok(e15.vl === '40', '#15: die konventionelle Länge landet GANZ im Vorlauf', e15);
  ok(e15.rar === '12' && e15.whb === '7', '#15: RaR und Warmhalteband werden mit übernommen', e15);
  ok(e15.rl === '0', '#15: der Rücklauf wird NICHT geraten (bleibt unverändert)', e15);
  ok(/GESAMTE Länge/.test(e15.txt) && /Rücklauf/.test(e15.txt),
    '#15: der Dialog erklärt die Vor-/Rücklauf-Aufteilung', e15.txt.slice(0, 200));
  ok(/40/.test(e15.txt) && /12/.test(e15.txt) && /7/.test(e15.txt),
    '#15: der Dialog nennt jeden übernommenen Wert', e15.txt.slice(0, 240));

  const e15b = await page.evaluate(async () => {
    window.__dlg = []; window.__dlgAntwort = false;   // «Abbrechen» → nichts ersetzen
    wwLeitAusGrob();
    await new Promise(r => setTimeout(r, 60));
    const first = window.__dlg[0] || '';
    window.__dlgAntwort = true;
    return { confirm: /^CONFIRM:/.test(first), vl: document.getElementById('ww_lVL').value };
  });
  ok(e15b.confirm, '#15: bei bereits erfassten Längen wird vor dem Ersetzen gefragt', e15b);
  ok(e15b.vl === '40', '#15: «Abbrechen» lässt die erfassten Längen unangetastet', e15b);

  // #23 — Beschriftung sichtbar + Uebernahme aus der Grobauslegung
  // Die Feinplanung liegt in Tab ③ — Geometrie lässt sich nur an einem
  // SICHTBAREN Element messen (versteckt liefert getBoundingClientRect() Nullen).
  await page.evaluate(() => {
    wwState.fein = [{ ne: 3, n: '50', profil: 'wohnbau' }];
    wwRenderTables(); wwRecalc();
    const t = document.querySelector('[data-tab="wt3"]'); if (t) t.click();
  });
  await page.waitForTimeout(300);

  const e23 = await page.evaluate(() => {
    // die Zeilen der Feinplanung sind <div data-kind>, kein <tr>
    const tr = document.querySelector('#wwFeinBody [data-kind]');
    const l1 = tr && tr.querySelector('.ww-fein-l1');
    const caps = l1 ? [].map.call(l1.querySelectorAll('.ww-fein-sel .k'), n => n.textContent.trim()) : [];
    const sel = l1 ? l1.querySelectorAll('select') : [];
    const boxen = [].map.call(sel, s => s.getBoundingClientRect());
    const capB = l1 ? [].map.call(l1.querySelectorAll('.ww-fein-sel .k'), n => n.getBoundingClientRect()) : [];
    return {
      caps: caps,
      selN: sel.length,
      // die Beschriftung steht ÜBER dem Feld, nicht daneben
      ueber: capB.length === 3 && boxen.length === 3 &&
             capB.every((c, i) => c.bottom <= boxen[i].top + 1),
      // alle drei Felder stehen auf derselben Linie
      linie: boxen.length === 3 && Math.abs(boxen[0].top - boxen[1].top) < 2 &&
             Math.abs(boxen[1].top - boxen[2].top) < 2,
      breit: boxen.length === 3 && boxen.every(b => b.width > 120)
    };
  });
  ok(e23.caps.join('|') === 'Nutzungseinheit|Hinweis|Stundenspitze',
    '#23: alle drei Auswahlfelder tragen eine sichtbare Beschriftung', e23.caps);
  ok(e23.ueber, '#23: die Beschriftung steht ÜBER ihrem Feld', e23);
  ok(e23.linie, '#23: die drei Felder fluchten weiterhin auf einer Linie', e23);
  ok(e23.breit, '#23: kein Feld wird durch die Beschriftung gequetscht', e23);

  const e23b = await page.evaluate(async () => {
    window.__dlg = [];
    // Grobauslegung: EFH (0) · Gastronomie (3, kein Pendant) · Cafeteria (4, 15 → 20 l/d)
    wwState.grob = [{ ne: 0, n: '4' }, { ne: 3, n: '2' }, { ne: 4, n: '30' }];
    wwState.fein = [{ ne: 3, n: '50', profil: 'wohnbau' }];   // MFH bereits erfasst
    wwRenderTables(); wwRecalc();
    window.__dlgAntwort = true;                                 // «Ersetzen»
    wwFeinAusGrob();
    await new Promise(r => setTimeout(r, 80));
    return {
      rows: wwState.fein.map(r => ({ ne: r.ne, n: r.n, profil: r.profil })),
      txt: window.__dlg.join('\n')
    };
  });
  ok(e23b.rows.length === 2, '#23: nur die zuordenbaren Zeilen werden übernommen', e23b.rows);
  ok(e23b.rows[0] && e23b.rows[0].ne === 0 && e23b.rows[0].n === '4',
    '#23: EFH 4 P wandert 1:1 in die Feinplanung', e23b.rows[0]);
  ok(e23b.rows[1] && e23b.rows[1].ne === 6 && e23b.rows[1].n === '30',
    '#23: Cafeteria landet auf der kleinsten Fein-Stufe (Normwert 20 l/d)', e23b.rows[1]);
  ok(/Gastronomie/.test(e23b.txt) && /NICHT übernommen/.test(e23b.txt),
    '#23: die nicht zuordenbare Zeile wird namentlich BENANNT', e23b.txt.slice(0, 400));
  ok(/Abweichender Normwert/.test(e23b.txt) && /15 → 20/.test(e23b.txt),
    '#23: die abweichende Norm-Stufe wird ausgewiesen', e23b.txt.slice(0, 500));
  ok(/Stundenspitzen-Profil bleibt Ihre Wahl/.test(e23b.txt),
    '#23: der Dialog sagt, dass die Stundenspitze Sache des Planers bleibt');

  const e23c = await page.evaluate(async () => {
    window.__dlg = [];
    wwState.fein = [{ ne: 0, n: '4', profil: 'hotel' }];        // eigene Wahl der Stundenspitze
    wwState.grob = [{ ne: 0, n: '9' }];
    wwRenderTables(); wwRecalc();
    window.__dlgAntwort = true;
    wwFeinAusGrob();
    await new Promise(r => setTimeout(r, 80));
    return wwState.fein.map(r => ({ ne: r.ne, n: r.n, profil: r.profil }));
  });
  ok(e23c.length === 1 && e23c[0].n === '9' && e23c[0].profil === 'hotel',
    '#23: die bereits gewählte Stundenspitze überlebt das Ersetzen', e23c);

  // ── Etappe 9 · Browser ────────────────────────────────────────────────────

  sec('D · Etappe 9 — #22 / #5');

  // #22 — Summenlinien-Karte (Tab ③): Legende, Liter-Farbe, Zeilenfolge
  const e22 = await page.evaluate(async () => {
    const e = document.querySelector('[data-tab="wt3"]'); if (e) e.click();
    wwState.fein = [
      { ne: 3, n: '50', profil: 'wohnbau' },
      { ne: 6, n: '30', profil: 'restaurant' }
    ];
    wwRenderTables(); wwRecalc();
    await new Promise(r => setTimeout(r, 250));
    const lg   = document.getElementById('wwFeinSlLegend');
    const tbl  = document.querySelector('#wwFeinSlTable table.ww-slh');
    const cv   = document.getElementById('wwFeinSlCanvas');
    const leads = tbl ? [...tbl.querySelectorAll('tbody td.lead')].map(td => td.textContent.trim()) : [];
    const litTd = tbl ? tbl.querySelector('tbody tr.ww-lit td') : null;
    const pctTd = tbl ? tbl.querySelector('tbody tr:not(.ww-lit) td') : null;
    const cols  = tbl ? [...tbl.querySelectorAll('colgroup col')].length : 0;
    const kopf  = tbl ? [...tbl.querySelectorAll('thead th')].length : 0;
    return {
      dir: lg ? getComputedStyle(lg).flexDirection : 'fehlt',
      items: lg ? lg.querySelectorAll('.it').length : 0,
      leads,
      litColor: litTd ? getComputedStyle(litTd).color : '',
      pctColor: pctTd ? getComputedStyle(pctTd).color : '',
      cols, kopf,
      tblW: tbl ? Math.round(tbl.getBoundingClientRect().width) : 0,
      cvW:  cv  ? Math.round(cv.getBoundingClientRect().width)  : 0
    };
  });
  ok(e22.dir === 'column', '#22: Legende steht untereinander', e22.dir);
  ok(e22.items >= 2, '#22: Legende zeigt die Serien', e22.items);
  ok(e22.leads.join('|') === '%|Σ %|l|Σ l',
    '#22: Zeilenfolge im DOM — Prozent oben, Liter darunter', e22.leads);
  ok(/^rgb\(220,\s*38,\s*38\)$/.test(e22.litColor), '#22: Liter-Zeilen rot', e22.litColor);
  ok(!/^rgb\(220,\s*38,\s*38\)$/.test(e22.pctColor),
    '#22: Prozent-Zeilen NICHT rot (schwarz belassen)', e22.pctColor);
  ok(e22.cols === 26 && e22.kopf === 26,
    '#22: colgroup + Kopfzeile unveraendert (padL | 24 Stunden | padR)', e22);
  ok(e22.tblW > 0 && Math.abs(e22.tblW - e22.cvW) <= 2,
    '#22: Tabelle und Diagramm sind exakt gleich breit (Spalten fluchten)', e22);

  // #5 — Ladestunden-Diagramm (Tab ④): parallele Spitzendeckung, Prozent, Stunden
  const e5 = await page.evaluate(async () => {
    const e = document.querySelector('[data-tab="wt4"]'); if (e) e.click();
    await new Promise(r => setTimeout(r, 120));
    const cv = document.getElementById('wwSoCanvas');
    const ctx = cv.getContext('2d');
    const log = { texts: [], paths: [] };
    let pts = [];
    const oMove = ctx.moveTo.bind(ctx), oLine = ctx.lineTo.bind(ctx);
    const oStroke = ctx.stroke.bind(ctx), oText = ctx.fillText.bind(ctx);
    ctx.moveTo = function (x, y) { pts = [[x, y]]; return oMove(x, y); };
    ctx.lineTo = function (x, y) { pts.push([x, y]); return oLine(x, y); };
    ctx.stroke = function () { log.paths.push({ st: String(ctx.strokeStyle), pts: pts.slice() }); return oStroke(); };
    ctx.fillText = function (t, x, y) { log.texts.push({ t: String(t), x: Math.round(x), y: Math.round(y) }); return oText(t, x, y); };
    wwRecalc();
    await new Promise(r => setTimeout(r, 200));
    ctx.moveTo = oMove; ctx.lineTo = oLine; ctx.stroke = oStroke; ctx.fillText = oText;
    const lang = log.paths.filter(p => p.pts.length === 25);
    const rot  = lang.find(p => p.st === '#dc2626');
    const org  = lang.find(p => p.st === '#d97706');
    let dy = [];
    if (rot && org) for (let i = 0; i < 25; i++) dy.push(+(org.pts[i][1] - rot.pts[i][1]).toFixed(4));
    const stunden = log.texts.filter(t => /^\d\d$/.test(t.t)).map(t => t.t);
    return {
      hatRot: !!rot, hatOrg: !!org, dy,
      stunden,
      pct: log.texts.filter(t => / %$/.test(t.t)).map(t => ({ t: t.t, x: t.x })),
      lit: log.texts.filter(t => / l$/.test(t.t)).map(t => t.t),
      spitze: log.texts.some(t => /^\+ Spitzendeckung/.test(t.t)),
      sigma:  log.texts.some(t => /^Σ Verbrauch/.test(t.t))
    };
  });
  ok(e5.hatRot && e5.hatOrg,
    '#5: Verbrauchs-Summenlinie UND Spitzendeckungs-Kurve werden gezeichnet', {
      rot: e5.hatRot, org: e5.hatOrg });
  ok(e5.dy.length === 25 && e5.dy.every(d => Math.abs(d - e5.dy[0]) < 0.01) && e5.dy[0] > 1,
    '#5: die Spitzendeckung laeuft PARALLEL ueber der Verbrauchskurve (konstanter Abstand)',
    e5.dy.slice(0, 4).concat(e5.dy.slice(-2)));
  ok(e5.spitze, '#5: die Kurve ist als «+ Spitzendeckung» beschriftet');
  ok(e5.sigma,  '#5: die Verbrauchskurve ist als «Σ Verbrauch» beschriftet');
  ok(e5.stunden.length >= 20 && e5.stunden[0] === '00' && e5.stunden.includes('01'),
    '#5: X-Achse stuendlich zweistellig beschriftet', e5.stunden.slice(0, 6));
  {
    const links = e5.pct.filter(p => p.x < 120), rechts = e5.pct.filter(p => p.x >= 120);
    ok(links.length >= 5 && rechts.length >= 5,
      '#5: BEIDE Achsen zeigen Prozent des Tagesbedarfs',
      { links: links.length, rechts: rechts.length });
    ok(links.some(p => p.t === '0 %') && rechts.some(p => p.t === '0 %'),
      '#5: beide Prozent-Achsen beginnen bei 0 %');
  }
  ok(e5.lit.length >= 5, '#5: die linke Achse fuehrt weiterhin die Liter-Werte', e5.lit.slice(0, 3));

  sec('E · Etappe 10 — #2 / #4');

  // #4 — die Ladelinie laeuft auf derselben Skala wie der Verbrauch
  const e4 = await page.evaluate(async () => {
    const e = document.querySelector('[data-tab="wt4"]'); if (e) e.click();
    await new Promise(r => setTimeout(r, 120));
    if (!wwState.so || !Array.isArray(wwState.so.h)) wwState.so = { h: [] };
    wwState.so.h = []; [4, 5, 22].forEach(h => { wwState.so.h[h] = true; });
    const cv = document.getElementById('wwSoCanvas');
    const ctx = cv.getContext('2d');
    const log = { texts: [], paths: [] };
    let pts = [];
    const oMove = ctx.moveTo.bind(ctx), oLine = ctx.lineTo.bind(ctx);
    const oStroke = ctx.stroke.bind(ctx), oText = ctx.fillText.bind(ctx);
    ctx.moveTo = function (x, y) { pts = [[x, y]]; return oMove(x, y); };
    ctx.lineTo = function (x, y) { pts.push([x, y]); return oLine(x, y); };
    ctx.stroke = function () { log.paths.push({ st: String(ctx.strokeStyle), pts: pts.slice() }); return oStroke(); };
    ctx.fillText = function (t, x, y) { log.texts.push({ t: String(t), x: Math.round(x), y: Math.round(y) }); return oText(t, x, y); };
    wwRecalc();
    await new Promise(r => setTimeout(r, 200));
    ctx.moveTo = oMove; ctx.lineTo = oLine; ctx.stroke = oStroke; ctx.fillText = oText;
    const lang = log.paths.filter(p => p.pts.length === 25);
    const rot  = lang.find(p => p.st === '#dc2626');   // Verbrauch
    const blau = lang.find(p => p.st === '#1d4ed8');   // Ladung
    return {
      hatBlau: !!blau,
      // gleiche Zeitachse: X-Werte deckungsgleich mit der Verbrauchskurve
      xGleich: !!(rot && blau) && rot.pts.every((_, i) => Math.abs(rot.pts[i][0] - blau.pts[i][0]) < 0.01),
      // steigt monoton (kumuliert) und ist zwischen den Ladestunden waagrecht
      monoton: !!blau && blau.pts.every((p, i) => i === 0 || p[1] <= blau.pts[i - 1][1] + 0.01),
      flach:   !!blau && Math.abs(blau.pts[10][1] - blau.pts[9][1]) < 0.01,
      steil:   !!blau && (blau.pts[4][1] - blau.pts[5][1]) > 1,
      label:   log.texts.some(t => /^Σ Ladung /.test(t.t))
    };
  });
  ok(e4.hatBlau, '#4: die kumulierte Ladung wird als eigene Kurve gezeichnet');
  ok(e4.xGleich, '#4: sie laeuft auf derselben Zeitachse wie die Verbrauchskurve');
  ok(e4.monoton, '#4: sie faellt nie (kumulierte Ladung)');
  ok(e4.flach,   '#4: waagrecht in einer Stunde OHNE Ladung');
  ok(e4.steil,   '#4: steil in einer markierten Ladestunde');
  ok(e4.label,   '#4: als «Σ Ladung … l» beschriftet');

  // #2 — Tempo-Knoepfe + Fuellhoehen-Marker im Speicherschema
  const e2 = await page.evaluate(async () => {
    const e = document.querySelector('[data-tab="wt4"]'); if (e) e.click();
    await new Promise(r => setTimeout(r, 150));
    const wrap = document.getElementById('wwSpSchemaWrap');
    const sp   = wrap ? [...wrap.querySelectorAll('[data-wwsp="zrSp"]')] : [];
    const lab  = sp.map(g => (g.querySelector('text') || {}).textContent || '');
    const aktiv = () => sp.map(g => (g.querySelector('rect') || {}).getAttribute
      ? g.querySelector('rect').getAttribute('stroke') : '');
    const vorher = aktiv();
    if (typeof wwSpZrTempo === 'function') wwSpZrTempo(5);
    const nachher = aktiv();
    return {
      n: sp.length, lab,
      marker: wrap ? wrap.querySelectorAll('[data-wwsp="zrMark"]').length : 0,
      vorher, nachher,
      hatTempo: typeof wwSpZrTempo === 'function'
    };
  });
  ok(e2.n === 3, '#2: drei Tempo-Knoepfe im Speicherschema', e2.n);
  ok(e2.lab.join('|') === '1×|2×|5×', '#2: beschriftet 1× / 2× / 5×', e2.lab);
  ok(e2.marker >= 1, '#2: Fuellhoehen-Marker vorhanden', e2.marker);
  ok(e2.hatTempo && e2.vorher.join() !== e2.nachher.join(),
    '#2: die Tempo-Wahl faerbt den aktiven Knopf um', { vorher: e2.vorher, nachher: e2.nachher });

  ok(errs.length === 0, 'Keine JS-Fehler auf der Seite', errs.slice(0, 3));
} finally {
  if (browser) await browser.close();
  srv.close();
}

console.log('\n' + ok_ + ' ok, ' + bad + ' fehlgeschlagen');
process.exit(bad ? 1 : 0);
