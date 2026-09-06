#!/usr/bin/env node
/* Drift-Guard — Feedback 05.09.2026, Modul sa_abwasserhebeanlage (4 Punkte).
 *
 * #1  Hinweis unten ergaenzen nicht seitlich · kein kleinerer Durchmesser waehlbar
 * #2  Wenn cm dann muessen sich alle Masse anpassen
 * #3  Volumen automatisch berechnen · Farben/Schaltbirnen/Q im Schema · SN 592000
 * #4  Resultat ganz nach unten · Apparate zuerst · SN 592000 · Nummerierung 1.–4.
 *
 * Ausfuehren:  CHROME=<chromium> node scripts/feedback_20260905_abwasserhebeanlage_test.mjs
 */
import { readFileSync } from 'node:fs';
import { startServer, seed, newPage, ROOT, BASE } from './rolematrix_harness.mjs';

let ok_ = 0, bad = 0;
function ok(cond, name, extra) {
  if (cond) { ok_++; console.log('  ok   ' + name); }
  else { bad++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function sec(t) { console.log('\n── ' + t); }

const HB = readFileSync(ROOT + '/sa_abwasserhebeanlage.html', 'utf8');

// ─────────────────────────────────────────────────────────────── statisch
sec('A · Markup & Quelltext');

// #4 — Nummerierung 1.–4. (gema_sektion.js kennt «1. », NICHT «1) »)
ok(/<h2>1\. Angeschlossene Apparate<\/h2>/.test(HB), '#4: Karte 1 = Angeschlossene Apparate');
ok(/<h2>2\. Eingangsdaten<\/h2>/.test(HB),           '#4: Karte 2 = Eingangsdaten');
ok(/<h2>3\. Schachtvolumen<\/h2>/.test(HB),          '#4: Karte 3 = Schachtvolumen');
ok(/<h2>4\. Pumpendruckleitung &amp; Druckverlust<\/h2>/.test(HB), '#4: Karte 4 = Pumpendruckleitung');
ok(!/<h2>\d\) /.test(HB), '#4: keine alte «N)»-Nummerierung mehr (gema_sektion kennt nur «N. »)');

// #4 — Reihenfolge im Quelltext: Apparate VOR Eingangsdaten VOR Resultate
{
  const iApp = HB.indexOf('<h2>1. Angeschlossene Apparate</h2>');
  const iEin = HB.indexOf('<h2>2. Eingangsdaten</h2>');
  const iRes = HB.indexOf('<h2>Resultate</h2>');
  ok(iApp > 0 && iEin > iApp && iRes > iEin,
    '#4: Reihenfolge Apparate → Eingangsdaten → Resultate im Markup', { iApp, iEin, iRes });
}
// Resultate darf nicht mehr als Seitenspalte kleben
ok(!/position:\s*sticky[^}]*top:[^}]*"[^"]*>\s*<div class="g-card-hd">\s*<h2>Resultate/.test(HB),
  '#4: Resultate-Karte ohne sticky-Seitenspalte');

// #1 — Hinweis UNTEN statt seitlich: die Kurzuebersicht-Seitenkarte ist weg
ok(!/Kurz&uuml;bersicht|Kurzübersicht/.test(HB), '#1: Seitenkarte «Kurzübersicht» entfernt');
ok((HB.match(/id="type_box"/g) || []).length === 1, '#1: #type_box existiert genau einmal (verschoben, nicht dupliziert)');
ok(/id="pipe_min_hint"/.test(HB), '#1: Hinweisfeld #pipe_min_hint vorhanden');
{
  const iFelder = HB.indexOf('id="waste_type"');
  const iEmpf   = HB.indexOf('class="dn-empf"');
  ok(iFelder > 0 && iEmpf > iFelder, '#1: Empfehlungsblock steht UNTER den Eingabefeldern', { iFelder, iEmpf });
}

// #1 — Sperr-Logik im Code
ok(/function wasteIdMin\s*\(/.test(HB),     '#1: wasteIdMin() vorhanden');
ok(/function pipeSelectSync\s*\(/.test(HB), '#1: pipeSelectSync() vorhanden');
ok(/pipeSelectSync\(\);\s*\/\/ Feedback 05\.09\.2026 #1/.test(HB),
  '#1: pipeSelectSync läuft in recalcAll VOR getState');
ok(/opt\.disabled\s*=\s*zuKlein/.test(HB), '#1: zu kleine Optionen werden disabled (nicht entfernt)');

// #4/#3 — Norm-Bezug SN 592000 an den beiden markierten Stellen
ok(/Q<sub>ww<\/sub> = K × √\(ΣDU\) nach SN 592000/.test(HB),
  '#4 (orange): Qww-Hinweis nennt SN 592000');

console.log('\n  (Bewusst NICHT geaendert: Hero-Badge «SN EN 12056-4 + SIA 190» und der\n   v-Bereich im Druckleitungs-Diagramm — vom Kunden nicht markiert, EN-12056-4-Inhalt.)');

// ─────────────────────────────────────────────────────────────── Browser
sec('B · Browser');
const server = await startServer();
let browser = null;
try {
  const chrome = process.env.CHROME;
  if (!chrome) { console.log('  (uebersprungen — CHROME nicht gesetzt)'); }
  else {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    const { page } = await newPage(browser, seed(['role_planer']));
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(BASE + '/sa_abwasserhebeanlage.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    ok(errs.length === 0, 'Boot ohne pageerror', errs.slice(0, 3));

    // #4 — geometrische Reihenfolge im tab1.  gema_sektion.js adoptiert die
    // «1. » in einen Nummern-Chip → der h2-Text traegt danach nur noch «1Titel».
    const geo = await page.evaluate(() => {
      const h2 = teil => {
        const e = Array.from(document.querySelectorAll('#tab1 h2')).find(x => x.textContent.indexOf(teil) >= 0);
        return e ? Math.round(e.getBoundingClientRect().top) : -1;
      };
      const chip = teil => {
        const e = Array.from(document.querySelectorAll('#tab1 h2')).find(x => x.textContent.indexOf(teil) >= 0);
        const c = e && e.querySelector('.gsek-nr');
        return c ? c.textContent.trim() : null;
      };
      return {
        app: h2('Angeschlossene Apparate'), ein: h2('Eingangsdaten'), res: h2('Resultate'),
        chipApp: chip('Angeschlossene Apparate'), chipEin: chip('Eingangsdaten')
      };
    });
    ok(geo.app > 0 && geo.ein > geo.app && geo.res > geo.ein,
      '#4: Apparate stehen oben, Resultate ganz unten (gemessen)', geo);
    ok(geo.chipApp === '1' && geo.chipEin === '2',
      '#4: gema_sektion.js adoptiert die Nummern als Chip 1/2 (Kanon wie andere Module)', geo);

    // #1 — Empfehlung liegt unter den Feldern, nicht daneben (tab2 aktivieren!)
    const empf = await page.evaluate(() => {
      // tab2 = «Pumpendruckleitung» (dort liegen Abwasserart + Dimension)
      const btn = document.querySelector('.g-tab[data-tab="tab2"]');
      if (btn) btn.click();
      const f = document.getElementById('waste_type');
      const e = document.querySelector('#tab2 .dn-empf');
      if (!f || !e) return null;
      const rf = f.getBoundingClientRect(), re = e.getBoundingClientRect();
      return { fTop: Math.round(rf.top), eTop: Math.round(re.top), fLeft: Math.round(rf.left), eLeft: Math.round(re.left) };
    });
    ok(empf && empf.eTop > empf.fTop && Math.abs(empf.eLeft - empf.fLeft) < 40,
      '#1: Empfehlung UNTER dem Feld (gleiche Spalte), nicht seitlich', empf);

    // #1 — Sperre: fäkalienhaltig ohne Zerkleinerung → Id_min 75 mm
    const sperre = await page.evaluate(() => {
      const wt = document.getElementById('waste_type');
      const pi = document.getElementById('pipe_id');
      const res = {};
      // Ausgangslage: Typ 0 (Id_min 34) → 40 erlaubt, 32 gesperrt
      wt.value = '0'; wt.dispatchEvent(new Event('change', { bubbles: true }));
      res.typ0 = Array.from(pi.options).filter(o => o.disabled).map(o => o.value);
      pi.value = '40'; pi.dispatchEvent(new Event('change', { bubbles: true }));
      res.typ0Wert = pi.value;
      // Umschalten auf Typ 1 (Id_min 75) → 40 muss gesperrt UND angehoben werden
      wt.value = '1'; wt.dispatchEvent(new Event('change', { bubbles: true }));
      res.typ1Gesperrt = Array.from(pi.options).filter(o => o.disabled).map(o => o.value);
      res.typ1Wert = pi.value;
      res.hint = (document.getElementById('pipe_min_hint') || {}).textContent || '';
      return res;
    });
    ok(sperre.typ0.includes('32') && !sperre.typ0.includes('40'),
      '#1: Typ 0 (Id_min 34) sperrt ID 32, laesst ID 40 zu', sperre.typ0);
    ok(sperre.typ1Gesperrt.includes('40') && sperre.typ1Gesperrt.includes('70') && !sperre.typ1Gesperrt.includes('80'),
      '#1: Typ 1 (Id_min 75) sperrt alles unter 80 mm', sperre.typ1Gesperrt);
    ok(sperre.typ1Wert === '80',
      '#1: unzulaessige Dimension wird auf die kleinste erlaubte angehoben', sperre.typ1Wert);
    ok(/angehoben/i.test(sperre.hint) && /75/.test(sperre.hint),
      '#1: Anhebung + Id_min werden im Klartext benannt (kein stiller Deckel)', sperre.hint);

    // Rechnung laeuft danach mit der angehobenen Dimension
    const nachSperre = await page.evaluate(() => {
      const t = document.getElementById('out');
      const raw = t ? (t.value || t.textContent || '') : '';
      try { const j = JSON.parse(raw); return j.druckleitung && (j.druckleitung.id_mm ?? j.druckleitung.innen_mm ?? null); }
      catch (e) { return null; }
    });
    ok(nachSperre === 80, '#1: Export-JSON traegt die angehobene Dimension', nachSperre);
  }
} finally {
  if (browser) await browser.close();
  server.close();
}

console.log('\n' + ok_ + ' ok, ' + bad + ' fehlgeschlagen');
process.exit(bad ? 1 : 0);
