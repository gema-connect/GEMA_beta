/* ════════════════════════════════════════════════════════════════════════
   GEMA — Engine-Test Beleuchtungsberechnung (el_beleuchtung.html)
   ════════════════════════════════════════════════════════════════════════
   Prüft den ENGINE-Block gegen UNABHÄNGIG gerechnete Werte. Die Erwartungen
   stehen als ausgeschriebene Zahl im Test — eine geänderte Formel in der
   Engine failt damit, statt sich selbst zu bestätigen. Kein Browser nötig.

     node scripts/beleuchtung_engine_test.mjs

   Referenzfall (Büro, von Hand nachgerechnet):
     10 × 6 m · H 3 m · Nutzebene 0.85 m · keine Abhängung
     E_m 500 lx · WF 0.80 · LED-Panel 4320 lm / 36 W · η_B 0.60 · SHR 1.5
       A       = 10 · 6                       = 60 m²
       h_m     = 3 − 0.85 − 0                 = 2.15 m
       k       = 60 / (2.15 · 16)             = 1.744186
       Φ_ges   = 500 · 60 / (0.60 · 0.80)     = 62 500 lm
       n       = 62 500 / 4320 = 14.4676      → 15 Leuchten
       Raster  = 5 × 3 (Felder 2.00 × 2.00 m, keine Überzahl)
       E_ist   = 15 · 4320 · 0.60 · 0.80 / 60 = 518.4 lx
       P       = 15 · 36                      = 540 W → 9.00 W/m²
       I       = 540 / (√3 · 400 · 0.95)      = 0.8204 A → Sicherung 6 A
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const nah = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' — ist ' + a + ', erwartet ' + b);

/* Fachbasis + Engine in denselben Kontext (die Engine ruft GemaElektro). */
const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const html = readFileSync(join(ROOT, 'el_beleuchtung.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function('GemaElektro',
  m[1] + '; return {btCalc, btRaster, btEtaRichtwert, btLeuchte, btReflex,'
       + ' BT_LEUCHTEN, BT_REFLEX, BT_ETA_K, BT_ETA_TAB};')(w.GemaElektro);
const { btCalc, btRaster, btEtaRichtwert, btLeuchte, btReflex,
        BT_LEUCHTEN, BT_REFLEX, BT_ETA_K, BT_ETA_TAB } = E;

const basis = {
  laenge: 10, breite: 6, hoehe: 3, nutz: 0.85, abhaeng: 0,
  em: 500, wf: 0.8, phi: 4320, p: 36,
  refl: 'hell', eta: 0.60, shr: 1.5, netz: '3p400', cos: 0.95
};

console.log('\n════ A · Referenzfall Büro 10 × 6 m ════');
{
  const r = btCalc(basis);
  nah(r.flaeche, 60, 1e-9, 'Fläche 60 m²');
  nah(r.hm, 2.15, 1e-9, 'Nutzhöhe 2.15 m');
  nah(r.k, 1.744186046511628, 1e-9, 'Raumindex k');
  nah(r.eta, 0.60, 1e-9, 'η_B = eigener Wert');
  ok(r.etaEigen === true, 'eigener η_B wird als solcher gemeldet');
  nah(r.phiGes, 62500, 1e-6, 'Gesamtlichtstrom 62 500 lm');
  nah(r.nRoh, 14.467592592592593, 1e-9, 'rechnerische Leuchtenzahl');
  ok(r.n === 15, 'aufgerundet 15 Leuchten — ist ' + r.n);
  ok(r.raster.nl === 5 && r.raster.nb === 3, 'Raster 5 × 3 — ist ' + r.raster.nl + ' × ' + r.raster.nb);
  nah(r.raster.aL, 2, 1e-9, 'Feldlänge 2.00 m');
  nah(r.raster.aB, 2, 1e-9, 'Feldbreite 2.00 m');
  ok(r.raster.ueber === 0, 'keine Überzahl im Raster');
  ok(r.nGesetzt === 15, 'gesetzt werden 15 Leuchten');
  nah(r.eIst, 518.4, 1e-9, 'erreichte Beleuchtungsstärke 518.4 lx');
  nah(r.ueberdeckung, 518.4 / 500, 1e-12, 'Überdeckung 1.0368');
  nah(r.pGes, 540, 1e-9, 'Anschlussleistung 540 W');
  nah(r.spez, 9, 1e-9, 'spezifische Leistung 9.00 W/m²');
  nah(r.lmw, 120, 1e-9, 'Lichtausbeute 120 lm/W');
  nah(r.iBetrieb, 0.8204451193747314, 1e-9, 'Betriebsstrom 0.8204 A');
  ok(r.sicherung === 6, 'nächste Sicherung 6 A — ist ' + r.sicherung);
  ok(r.sicherungWeg === false, 'Sicherungsreihe reicht');
  nah(r.aMax, 2, 1e-9, 'grösster Leuchtenabstand 2.00 m');
  ok(r.shrOk === true, 'a/h_m = 0.930 ≤ 1.5 → Gleichmässigkeit i.O.');
  ok(r.status === 'ok', 'Status ok — ist ' + r.status);
}

console.log('\n════ B · Richtwert für η_B statt eigenem Wert ════');
{
  /* k = 1.744186 liegt zwischen den Stützstellen 1.50 (0.67) und 2.00 (0.72):
     f = (1.744186 − 1.5) / 0.5 = 0.488372
     η = 0.67 + 0.488372 · 0.05 = 0.6944186
     Φ_ges = 500 · 60 / (0.6944186 · 0.8) = 54 002.009 lm
     n     = 54 002.009 / 4320 = 12.5005 → 13 Leuchten
     Raster 5 × 3 = 15 (2 mehr als nötig, dafür quadratische Felder)
     E_ist = 15 · 4320 · 0.6944186 · 0.8 / 60 = 599.978 lx */
  const r = btCalc({ ...basis, eta: 0 });
  ok(r.etaEigen === false, 'ohne Eingabe wird der Richtwert genommen');
  nah(r.eta, 0.6944186046511628, 1e-12, 'η_B interpoliert');
  nah(r.etaRichtwert, 0.6944186046511628, 1e-12, 'Richtwert wird separat ausgewiesen');
  ok(r.etaGeklemmt === '', 'k liegt im Tabellenbereich, keine Klemmung');
  nah(r.phiGes, 54002.0093770931, 1e-6, 'Gesamtlichtstrom 54 002 lm');
  nah(r.nRoh, 12.500465133586365, 1e-9, 'rechnerisch 12.50 Leuchten');
  ok(r.n === 13, 'aufgerundet 13 — ist ' + r.n);
  ok(r.nGesetzt === 15 && r.raster.ueber === 2, 'Raster setzt 15 (2 mehr) — ist '
     + r.nGesetzt + ' / +' + r.raster.ueber);
  nah(r.eIst, 599.9776744186048, 1e-9, 'E_ist folgt der WIRKLICH gesetzten Zahl');
  ok(r.hinweise.some(h => /RICHTWERT/.test(h)), 'Richtwert-Herkunft steht in den Hinweisen');
  ok(r.hinweise.some(h => /Datenblatt/.test(h)), 'Verweis aufs Datenblatt vorhanden');
}

console.log('\n════ C · Richtwert-Tabelle: Stützstellen, Interpolation, Klemmung ════');
{
  /* Exakte Stützstellen müssen exakt getroffen werden. */
  BT_ETA_K.forEach((k, i) => {
    nah(btEtaRichtwert(k, 'hell').eta, BT_ETA_TAB.hell[i], 1e-12,
        'Stützstelle k = ' + k + ' trifft den Tabellenwert');
  });
  /* Mitte zwischen 1.00 (0.58) und 1.25 (0.63) → 0.605 */
  nah(btEtaRichtwert(1.125, 'hell').eta, 0.605, 1e-12, 'lineare Interpolation k = 1.125');
  /* Mitte zwischen 2.00 (0.65) und 2.50 (0.68) bei mittlerer Reflexion → 0.665 */
  nah(btEtaRichtwert(2.25, 'mittel').eta, 0.665, 1e-12, 'Interpolation mittlere Reflexion');
  const u = btEtaRichtwert(0.4, 'hell');
  ok(u.geklemmt === 'unten' && u.eta === 0.45, 'k < 0.6 wird geklemmt UND gemeldet');
  const o = btEtaRichtwert(9, 'dunkel');
  ok(o.geklemmt === 'oben' && o.eta === 0.73, 'k > 5 wird geklemmt UND gemeldet');
  ok(btEtaRichtwert(0, 'hell') === null, 'ohne Raumindex kein Richtwert');
  /* Monotonie: heller Raum darf nie schlechter sein als dunkler. */
  let mono = true;
  BT_ETA_K.forEach((k, i) => {
    if (!(BT_ETA_TAB.hell[i] > BT_ETA_TAB.mittel[i] && BT_ETA_TAB.mittel[i] > BT_ETA_TAB.dunkel[i]))
      mono = false;
    if (i > 0 && !(BT_ETA_TAB.hell[i] > BT_ETA_TAB.hell[i - 1])) mono = false;
  });
  ok(mono, 'Tabelle ist in beide Richtungen monoton');
  ok(BT_ETA_K.length === BT_ETA_TAB.hell.length
     && BT_ETA_K.length === BT_ETA_TAB.mittel.length
     && BT_ETA_K.length === BT_ETA_TAB.dunkel.length, 'alle Reihen gleich lang');
}

console.log('\n════ D · Klemmung im Rechengang, mit Hinweis ════');
{
  /* Schmaler Gang 20 × 1.5 m, h_m = 3.15 → k = 30 / (3.15 · 21.5) = 0.443 < 0.6 */
  const r = btCalc({ ...basis, laenge: 20, breite: 1.5, hoehe: 4, eta: 0 });
  nah(r.k, 0.44296788482835, 1e-9, 'Raumindex 0.443');
  ok(r.etaGeklemmt === 'unten', 'Klemmung nach unten erkannt');
  nah(r.eta, 0.45, 1e-12, 'gerechnet mit dem Randwert 0.45');
  ok(r.hinweise.some(h => /k < 0\.6/.test(h) && /tiefer/.test(h)),
     'Der Hinweis sagt, dass der wirkliche Wert TIEFER liegt (kein stiller Deckel)');
}
{
  /* Grosse Halle 100 × 60 m, h_m = 5 → k = 6000 / (5 · 160) = 7.5 > 5 */
  const r = btCalc({ ...basis, laenge: 100, breite: 60, hoehe: 5, nutz: 0, eta: 0 });
  nah(r.k, 7.5, 1e-9, 'Raumindex 7.5');
  ok(r.etaGeklemmt === 'oben', 'Klemmung nach oben erkannt');
  nah(r.eta, 0.83, 1e-12, 'gerechnet mit dem Randwert 0.83');
  ok(r.hinweise.some(h => /k > 5/.test(h)), 'Klemmung nach oben wird gemeldet');
}

console.log('\n════ E · Raster-Suche ════');
{
  /* 15 Leuchten in 10 × 6 m: 5 × 3 ergibt exakt quadratische Felder. */
  const a = btRaster(15, 10, 6);
  ok(a.nl === 5 && a.nb === 3 && a.ueber === 0, '15 → 5 × 3 ohne Überzahl');
  nah(a.verh, 1, 1e-12, 'Felder exakt quadratisch');
  /* 1 Leuchte ist immer 1 × 1. */
  const b = btRaster(1, 10, 6);
  ok(b.nl === 1 && b.nb === 1 && b.gesamt === 1, 'eine Leuchte → 1 × 1');
  /* Primzahl 7 in einem quadratischen Raum: 4 × 2 = 8 (eine mehr) schlägt
     7 × 1 (verh 7) — Überzahl 1 kostet 0.08, das Seitenverhältnis 6.0. */
  const c = btRaster(7, 10, 10);
  ok(c.gesamt >= 7, 'Raster deckt die verlangte Zahl immer ab — ist ' + c.gesamt);
  ok(c.nl * c.nb === c.gesamt, 'gesamt ist das Produkt der beiden Achsen');
  ok(c.ueber === c.gesamt - 7, 'Überzahl ist ausgewiesen');
  /* Über alle Zahlen 1…60 in verschiedenen Räumen: nie zu wenig Leuchten. */
  let deckt = true, produkt = true;
  [[10, 6], [20, 4], [8, 8], [30, 12], [5, 4.5]].forEach(([A1, B1]) => {
    for (let n = 1; n <= 60; n++) {
      const r = btRaster(n, A1, B1);
      if (r.gesamt < n) deckt = false;
      if (r.nl * r.nb !== r.gesamt) produkt = false;
    }
  });
  ok(deckt, 'in 300 Fällen deckt das Raster nie weniger als die geforderte Zahl');
  ok(produkt, 'in 300 Fällen ist gesamt = n_l · n_b');
  ok(btRaster(0, 10, 6) === null, 'ohne Leuchten kein Raster');
  ok(btRaster(5, 0, 6) === null, 'ohne Raum kein Raster');
}

console.log('\n════ F · Gleichmässigkeit: Abstandsverhältnis a / h_m ════');
{
  /* Halle 20 × 10 m, h_m = 8 m, E_m 150 lx, Hallenstrahler 22 500 lm / 150 W,
     η_B 0.70 → Φ_ges = 150 · 200 / 0.56 = 53 571.4 → n = 2.381 → 3
     Raster 3 × 1 → Felder 6.667 × 10 m → a_max = 10 m
     a_max / h_m = 10 / 8 = 1.25 */
  const halle = { ...basis, laenge: 20, breite: 10, hoehe: 8, nutz: 0,
                  em: 150, phi: 22500, p: 150, eta: 0.70 };
  const gut = btCalc({ ...halle, shr: 1.5 });
  nah(gut.aMax, 10, 1e-9, 'grösster Leuchtenabstand 10 m');
  nah(gut.aMax / gut.hm, 1.25, 1e-9, 'a / h_m = 1.25');
  ok(gut.shrOk === true, 'bei SHR 1.5 eingehalten');
  ok(gut.status === 'ok', 'Status ok');

  const eng = btCalc({ ...halle, shr: 1.0 });
  ok(eng.shrOk === false, 'bei SHR 1.0 verletzt');
  ok(eng.status === 'warn', 'verletzte Gleichmässigkeit → warn, ist ' + eng.status);

  const ohne = btCalc({ ...halle, shr: 0 });
  ok(ohne.shrOk === null, 'ohne SHR-Angabe wird nichts behauptet');
}

console.log('\n════ G · Überdeckung durch Aufrunden ════');
{
  /* Aufgerundet wird auf ganze Leuchten — der Istwert liegt darum IMMER
     über dem geforderten. Ein Raum, in dem das Raster stark überzählt:
     4 × 3 m, E_m 300, WF 0.8, η_B 0.5, Leuchte 6000 lm
     A = 12, Φ_ges = 300 · 12 / 0.4 = 9000 → n = 1.5 → 2 Leuchten
     E_ist = 2 · 6000 · 0.5 · 0.8 / 12 = 400 lx → +33 % */
  const r = btCalc({ ...basis, laenge: 4, breite: 3, hoehe: 3,
                     em: 300, eta: 0.5, phi: 6000, p: 40 });
  nah(r.phiGes, 9000, 1e-9, 'Gesamtlichtstrom 9000 lm');
  ok(r.n === 2, 'aufgerundet 2 Leuchten — ist ' + r.n);
  nah(r.eIst, 400, 1e-9, 'E_ist 400 lx');
  nah(r.ueberdeckung, 400 / 300, 1e-12, 'Überdeckung 1.333');
  ok(r.status === 'warn', 'über 30 % Überdeckung → warn, ist ' + r.status);
  ok(r.hinweise.length > 0, 'Hinweise vorhanden');
}

console.log('\n════ H · Netzsystem, cos φ und Sicherung ════');
{
  /* Einphasig: I = P / (U · cos φ) — der √3-Faktor entfällt.
     540 W / (230 · 0.95) = 2.4714 A */
  const ein = btCalc({ ...basis, netz: '1p230' });
  nah(ein.iBetrieb, 540 / (230 * 0.95), 1e-12, 'einphasig ohne √3');
  ok(ein.netz.leiter === 2, 'Netzsystem meldet 2 Leiter');
  ok(ein.sicherung === 6, 'Sicherung 6 A');

  /* cos φ = 1 wird gemeldet, weil der wirkliche Strom dann höher liegt. */
  const c1 = btCalc({ ...basis, cos: 1 });
  nah(c1.iBetrieb, 540 / (Math.sqrt(3) * 400), 1e-12, 'cos φ = 1 gerechnet');
  ok(c1.hinweise.some(h => /cos φ = 1/.test(h)), 'cos φ = 1 wird als Annahme benannt');
  ok(btCalc({ ...basis }).iBetrieb > c1.iBetrieb,
     'kleinerer cos φ (0.95) ergibt den grösseren Strom als cos φ = 1');

  /* cos φ über 1 ist physikalisch unmöglich und wird auf 1 geklemmt. */
  const c2 = btCalc({ ...basis, cos: 1.4 });
  nah(c2.cos, 1, 1e-12, 'cos φ auf 1 geklemmt');

  /* Fehlender cos φ (0) → mit 1 gerechnet, nicht Division durch null. */
  const c0 = btCalc({ ...basis, cos: 0 });
  ok(isFinite(c0.iBetrieb), 'cos φ = 0 ergibt keine Division durch null');

  /* Einschaltstrom und Belastbarkeit sind NICHT Teil dieser Rechnung —
     das muss dastehen, statt stillschweigend zu fehlen. */
  const r = btCalc(basis);
  ok(r.hinweise.some(h => /Einschalt/.test(h)), 'Einschaltstrom als Grenze benannt');
  ok(r.hinweise.some(h => /Strombelastbarkeit/.test(h)), 'Belastbarkeit als eigene Prüfung benannt');
}
{
  /* KEIN STILLER DECKEL: liegt der Strom über der Sicherungsreihe, wird das
     gemeldet. Künstlich grosse Anlage — es geht um den Wächter, nicht um
     die Praxis: 300 × 200 m, E_m 300 lx, einphasig gerechnet. */
  const r = btCalc({ ...basis, laenge: 300, breite: 200, hoehe: 8, nutz: 0,
                     em: 300, eta: 0.75, phi: 30000, p: 200, netz: '1p230', cos: 1 });
  ok(r.iBetrieb > 400, 'Betriebsstrom über der Reihe — ist ' + Math.round(r.iBetrieb) + ' A');
  ok(r.sicherung === null, 'keine Sicherung wird erfunden');
  ok(r.sicherungWeg === true, 'die Überschreitung wird als Flag gemeldet');
  ok(r.hinweise.some(h => /Stromkreise/.test(h)), 'Hinweis auf Aufteilung in Stromkreise');
}

console.log('\n════ I · Geometrie-Grenzfälle ════');
{
  const leer = btCalc({ ...basis, laenge: 0, breite: 0 });
  ok(leer.flaeche === null && leer.k === null, 'ohne Raum keine Fläche, kein Raumindex');
  ok(leer.status === 'leer', 'Status leer');
  ok(leer.n === null && leer.raster === null, 'ohne Raum keine Leuchtenzahl');

  /* Nutzebene + Abhängung fressen die Raumhöhe auf → h_m ≤ 0. */
  const flach = btCalc({ ...basis, hoehe: 3, nutz: 0.85, abhaeng: 2.5 });
  ok(flach.hm <= 0, 'h_m wird negativ');
  ok(flach.k === null, 'ohne Nutzhöhe kein Raumindex');
  ok(flach.hinweise.some(h => /Nutzhöhe/.test(h)), 'die Geometrie wird beanstandet');

  /* Abhängung verkleinert h_m und damit den Raumindex — das muss wirken. */
  const pendel = btCalc({ ...basis, abhaeng: 0.65, eta: 0 });
  nah(pendel.hm, 1.5, 1e-9, 'Pendelleuchte: h_m = 1.50 m');
  ok(pendel.k > btCalc({ ...basis, eta: 0 }).k, 'kleinere Nutzhöhe → grösserer Raumindex');

  /* Wartungsfaktor über 1 rechnet die Anlage zu klein — Warnung. */
  const wf = btCalc({ ...basis, wf: 1.2 });
  ok(wf.hinweise.some(h => /Wartungsfaktor/.test(h)), 'WF > 1 wird beanstandet');
  const wf0 = btCalc({ ...basis, wf: 0 });
  ok(wf0.phiGes === null, 'ohne Wartungsfaktor kein Gesamtlichtstrom');

  /* η_B über 0.95 ist bei realen Leuchten nicht erreichbar. */
  const eta = btCalc({ ...basis, eta: 0.99 });
  ok(eta.hinweise.some(h => /0\.95/.test(h)), 'unrealistischer η_B wird beanstandet');

  /* Ohne Leuchtendaten bleibt die Zahl offen — es wird nichts geraten. */
  const ohnePhi = btCalc({ ...basis, phi: 0 });
  ok(ohnePhi.phiGes !== null && ohnePhi.n === null,
     'Gesamtlichtstrom steht, Leuchtenzahl bleibt offen');
  const ohneP = btCalc({ ...basis, p: 0 });
  ok(ohneP.pGes === null && ohneP.iBetrieb === null,
     'ohne Leistungsangabe weder Anschlussleistung noch Strom');
}

console.log('\n════ J · Vorlagen und Reflexionsgrade ════');
{
  ok(BT_LEUCHTEN.length >= 10, 'Vorlagen-Katalog vorhanden — ' + BT_LEUCHTEN.length + ' Einträge');
  let plausibel = true, ids = new Set();
  BT_LEUCHTEN.forEach(l => {
    if (ids.has(l.id)) plausibel = false;
    ids.add(l.id);
    const lmw = l.phi / l.p;
    /* LED-Leuchten liegen heute zwischen rund 90 und 160 lm/W. Ein Eintrag
       ausserhalb wäre ein Tippfehler in der Vorlage. */
    if (!(lmw >= 90 && lmw <= 160)) plausibel = false;
  });
  ok(plausibel, 'alle Vorlagen mit eindeutiger id und plausibler Lichtausbeute (90…160 lm/W)');
  ok(btLeuchte('p6060').phi === 4320, 'Vorlage p6060 auffindbar');
  ok(btLeuchte('gibtsnicht') === null, 'unbekannte Vorlage liefert null, nicht die erste');
  ok(BT_REFLEX.length === 3, 'drei Reflexionsgrad-Stufen');
  ok(btReflex('dunkel').id === 'dunkel', 'Reflexionsstufe auffindbar');
  ok(btReflex('gibtsnicht').id === 'hell', 'unbekannte Stufe fällt auf die erste zurück');
  /* Dunklerer Raum → mehr Leuchten. */
  const h = btCalc({ ...basis, eta: 0, refl: 'hell' });
  const d = btCalc({ ...basis, eta: 0, refl: 'dunkel' });
  ok(d.n > h.n, 'dunkler Raum braucht mehr Leuchten — ' + h.n + ' → ' + d.n);
}

console.log('\n════ K · Abgrenzungen stehen im Ergebnis ════');
{
  const r = btCalc(basis);
  ok(r.hinweise.some(h => /MITTLERE/.test(h)), 'mittlere Beleuchtungsstärke wird benannt');
  ok(r.hinweise.some(h => /UGR|Blendung/.test(h)), 'Blendungsbegrenzung als Lücke benannt');
  ok(r.hinweise.some(h => /Tageslicht/.test(h)), 'Tageslicht und Regelung als Lücke benannt');
  ok(r.hinweise.every(h => typeof h === 'string' && h.length > 20),
     'jeder Hinweis ist ein ausformulierter Satz');
}

console.log('\n════ L · Engine ist DOM-frei ════');
{
  const src = m[1];
  const verboten = ['document.', 'window.', 'localStorage', 'getElementById', 'innerHTML'];
  verboten.forEach(v => ok(src.indexOf(v) === -1, 'Engine ohne "' + v + '"'));
  /* Keine eigenen Kopien der Fachbasis. */
  ok(!/var\s+EL_SYSTEME|var\s+EL_SICHERUNGEN|var\s+EL_MATERIAL/.test(src),
     'Engine dupliziert keine GemaElektro-Tabellen');
  ok(/GemaElektro/.test(src), 'Engine nutzt GemaElektro');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + '  ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen\n');
process.exit(fail === 0 ? 0 : 1);
