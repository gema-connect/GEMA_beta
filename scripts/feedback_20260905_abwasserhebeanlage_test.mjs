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


// ── #3 · Volumen automatisch berechnen ───────────────────────────────────
ok(/function hoeheAusVolumen\s*\(/.test(HB), '#3: hoeheAusVolumen() vorhanden (h = V / Querschnitt)');
ok(/function schAutoSync\s*\(/.test(HB),     '#3: schAutoSync() vorhanden');
ok(/function schAutoChip\s*\(/.test(HB),     '#3: schAutoChip() vorhanden (Herkunfts-Chip)');
ok(/window\.schAutoZurueck\s*=\s*schAutoZurueck/.test(HB),
  '#3: schAutoZurueck window-exponiert (Inline-onclick, Cross-Block-Regel)');
ok(/let schAuto\s*=\s*\{\s*nutz:\s*true\s*,\s*res:\s*true\s*\}/.test(HB),
  '#3: Auto-Flags starten auf true (neue Berechnung rechnet)');

// Reihenfolge in recalcAll: Auto-Fill VOR der Volumen-Rechnung, Hoehen danach frisch aus dem DOM
{
  const iSync = HB.indexOf('schAutoSync(qtot_ls)');
  const iNutz = HB.indexOf('st.inputs.schacht.nutz_m = schToM($("sch_nutz").value)');
  ok(iSync > 0 && iNutz > iSync,
    '#3: schAutoSync läuft VOR dem Nachziehen der Höhen aus dem DOM', { iSync, iNutz });
}

// isTrusted-Regel: nur eine ECHTE Eingabe löst die Automatik
ok(/if\s*\(\s*ev\s*&&\s*ev\.isTrusted\s*\)\s*\{[\s\S]{0,200}?schAuto\.nutz\s*=\s*false/.test(HB),
  '#3: Automatik wird NUR bei ev.isTrusted gelöst (Restore/Auto-Fill lösen nie)');
{
  // Die Flags müssen VOR recalcAll() fallen — sonst überschreibt der Auto-Fill den Tastendruck
  const m = HB.match(/if\s*\(\s*ev\s*&&\s*ev\.isTrusted\s*\)\s*\{[\s\S]*?\}\s*recalcAll\(\);/);
  ok(!!m, '#3: Flag-Löschung steht VOR recalcAll() im selben Handler');
}

// Bestandsschutz: ein Stand ohne die Flags gilt als «eigene Eingabe»
ok(/schAuto\s*=\s*\{\s*nutz:\s*st\.inputs\?\.schacht\?\.nutz_auto\s*===\s*true/.test(HB),
  '#3: Bestandsschutz — alter Stand ohne Flags wird als «eigene Eingabe» gelesen (=== true)');

// Richtwert-Deklaration im UI (keine erfundenen Normwerte)
ok(/Richtwert — massgebend ist die zulässige Schalthäufigkeit der Pumpe/.test(HB),
  '#3: t_Schalt ist im UI als Richtwert deklariert (Pumpen-Datenblatt)');
ok(/Projektvorgabe, kein Normwert/.test(HB),
  '#3: f_res ist im UI als Projektvorgabe deklariert — kein Normwert');

// Zonenfarben + Schaltbirnen im Schema (NUR literale Hex)
ok(/lbl:'Pumpensumpf',\s*v:d\.v_ps,\s*f:'#bbf7d0'/.test(HB),   '#3: Pumpensumpf grün (#bbf7d0)');
ok(/lbl:'Nutzvolumen',\s*v:d\.v_nutz,\s*f:'#bfdbfe'/.test(HB),  '#3: Nutzvolumen blau (#bfdbfe)');
ok(/lbl:'Reservevolumen',\s*v:d\.v_res,\s*f:'#fed7aa'/.test(HB),'#3: Reservevolumen orange (#fed7aa)');
{
  // Reihenfolge von unten: ps → nz → res
  const s = HB.indexOf("{k:'ps',"), n = HB.indexOf("{k:'nz',"), r = HB.indexOf("{k:'res',");
  ok(s > 0 && n > s && r > n, '#3: Zonen von unten Pumpensumpf → Nutzvolumen → Reservevolumen', { s, n, r });
}
ok(/ellipse cx="'\+b\.x\+'"[\s\S]{0,120}?fill="#111827"/.test(HB), '#3: Schaltbirnen schwarz (#111827)');
ok(/lbl:'Ein'/.test(HB) && /lbl:'Aus'/.test(HB), '#3: Schaltpunkte Ein/Aus beschriftet');
ok(/Pumpendruckleitung Q '\+F\(d\.qtot,2\)\+' l\/s/.test(HB),
  '#3: Volumenstrom steht an der Pumpendruckleitung');
ok(/Schaltpunkte \(Ein\/Aus\) nach SN 592000/.test(HB),
  '#3 (orange): Schema-Notiz nennt SN 592000');
ok(/xDim\s*=/.test(HB) && /Massband der Zone/.test(HB),
  '#3: eigene Vermassung je Zone (folgt den gerechneten Volumen)');

// ── #2 · Einheiten-Wahl gilt für ALLE Masse ──────────────────────────────
ok(/var hTxt=function\(m\)\{\s*return \(d\.unit==='cm'\)/.test(HB),
  '#2: EINE Höhen-Formatierung im Schema, die der Einheiten-Wahl folgt');
ok((HB.match(/hTxt\(/g) || []).length >= 4,
  '#2: hTxt wird an allen Höhen-Beschriftungen verwendet (Zonen-Höhe, Zonen-Label, Massband, Gesamthöhe)',
  (HB.match(/hTxt\(/g) || []).length);
{
  // t_Schalt (s) und f_res (%) duerfen NIE mit-umgerechnet werden
  const m = HB.match(/const felder\s*=\s*\[([^\]]*)\]/);
  const f = m ? m[1] : '';
  ok(/sch_d/.test(f) && /sch_nutz/.test(f) && !/sch_tschalt/.test(f) && !/sch_fres/.test(f),
    '#2: setSchUnit rechnet nur Längen um — t_Schalt (s) und f_res (%) bleiben aussen vor', f);
}

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

    // ── #3 · Auto-Rechnung + Herkunfts-Chip ──────────────────────────────
    await page.evaluate(() => { const b = document.querySelector('.g-tab[data-tab="tab3"]'); if (b) b.click(); });
    await page.waitForTimeout(250);

    // Ausgangslage MIT Apparaten — sonst ist Q_tot 0 und die Gegenrechnung
    // unten prueft 0 === 0 (Scheinbeleg statt Nachweis).
    const seedQ = await page.evaluate(() => {
      const q = document.querySelector('input[data-kind="qty"][data-idx="19"]');   // WC-Anlage, DU 2.0
      if (!q) return null;
      q.value = '5';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      const t = document.getElementById('out');
      const raw = t ? (t.value || t.textContent || '') : '';
      try { return JSON.parse(raw).qtot_ls; } catch (e) { return null; }
    });
    ok(seedQ > 1, '#3: Ausgangslage traegt Apparate (5 x WC-Anlage)', seedQ);

    const auto = await page.evaluate(() => {
      const g = id => document.getElementById(id);
      // Bekannte Ausgangslage: Q_tot aus einem Apparat, d = 0.80 m, t = 60 s, f = 25 %
      g('sch_d').value = '0.80';
      g('sch_tschalt').value = '60';
      g('sch_fres').value = '25';
      ['sch_d', 'sch_tschalt', 'sch_fres'].forEach(id => g(id).dispatchEvent(new Event('input', { bubbles: true })));
      const raw = (document.getElementById('out').value || document.getElementById('out').textContent || '');
      let q = null; try { q = JSON.parse(raw).qtot_ls; } catch (e) {}
      return {
        q,
        nutz: g('sch_nutz').value, res: g('sch_res').value,
        vNutz: (g('v_nutz') || {}).textContent, vRes: (g('v_res') || {}).textContent,
        chipNutz: (document.querySelector('#sch_nutz_src .sch-src-chip') || {}).textContent,
        chipRes: (document.querySelector('#sch_res_src .sch-src-chip') || {}).textContent,
        hinweis: (document.getElementById('sch_nutz_src') || {}).textContent || ''
      };
    });
    ok(auto.chipNutz === 'auto' && auto.chipRes === 'auto',
      '#3: beide Höhen starten mit dem Herkunfts-Chip «auto»', { n: auto.chipNutz, r: auto.chipRes });
    {
      // V_nutz = Q · t  → h = V/(π·(d/2)²).  Gegenrechnung mit denselben Zahlen.
      const q = auto.q || 0, vN = q * 60, vR = vN * 0.25, A = Math.PI * 0.8 * 0.8 / 4;
      const hN = A > 0 ? (vN / 1000) / A : 0, hR = A > 0 ? (vR / 1000) / A : 0;
      ok(q > 0, '#3: Q_tot > 0 (Ausgangslage trägt Apparate)', q);
      ok(Math.abs(parseFloat(auto.nutz) - hN) < 0.02,
        '#3: Nutzvolumen-Höhe = V_nutz / Querschnitt (nachgerechnet)', { ist: auto.nutz, soll: hN.toFixed(3) });
      ok(Math.abs(parseFloat(auto.res) - hR) < 0.02,
        '#3: Reservevolumen-Höhe = V_nutz × f_res / Querschnitt (nachgerechnet)', { ist: auto.res, soll: hR.toFixed(3) });
      ok(/V_nutz = Q × t_Schalt/.test(auto.hinweis) && /l$|l\b/.test(auto.hinweis.trim()),
        '#3: der Chip nennt die Formel samt Liter-Wert', auto.hinweis.trim());
    }

    // Echte Benutzer-Eingabe löst die Automatik (isTrusted über CDP)
    await page.fill('#sch_nutz', '1.25');
    await page.waitForTimeout(200);
    const manuell = await page.evaluate(() => ({
      wert: document.getElementById('sch_nutz').value,
      chip: (document.querySelector('#sch_nutz_src .sch-src-chip') || {}).textContent,
      klasse: (document.querySelector('#sch_nutz_src .sch-src-chip') || {}).className,
      btn: !!document.querySelector('#sch_nutz_src .sch-src-btn'),
      resChip: (document.querySelector('#sch_res_src .sch-src-chip') || {}).textContent
    }));
    ok(manuell.wert === '1.25', '#3: eine eigene Eingabe wird NICHT vom Auto-Fill überschrieben', manuell.wert);
    ok(manuell.chip === 'eigene Eingabe' && /manuell/.test(manuell.klasse || ''),
      '#3: Chip wechselt auf «eigene Eingabe»', manuell);
    ok(manuell.btn === true, '#3: «↺ auto» erscheint als Rückweg (kein Einbahn-Override)');
    ok(manuell.resChip === 'auto', '#3: das Reservevolumen bleibt unabhängig davon auf auto', manuell.resChip);

    // Rückweg. Geklickt wird der LIVE abgefragte Knopf: `schAutoChip` schreibt
    // `#sch_nutz_src.innerHTML` bei JEDEM recalcAll neu — ein von aussen
    // aufgelöster Knoten ist bis zum Zustellen der Maus-Events veraltet.
    // Geprüft wird damit die echte Verdrahtung (onclick-Attribut → window-
    // exponierte Funktion → recalcAll), nur nicht der Maus-Zeiger selbst.
    const geklickt = await page.evaluate(() => {
      const b = document.querySelector('#sch_nutz_src .sch-src-btn');
      if (!b) return false;
      b.click();
      return true;
    });
    ok(geklickt === true, '#3: «↺ auto» ist als Knopf im DOM klickbar');
    await page.waitForTimeout(200);
    const zurueck = await page.evaluate(() => ({
      wert: document.getElementById('sch_nutz').value,
      chip: (document.querySelector('#sch_nutz_src .sch-src-chip') || {}).textContent
    }));
    ok(zurueck.chip === 'auto' && Math.abs(parseFloat(zurueck.wert) - parseFloat(auto.nutz)) < 0.01,
      '#3: «↺ auto» stellt den gerechneten Wert wieder her', zurueck);

    // ── #2 · Einheiten-Wahl schlägt auf ALLE Masse durch ─────────────────
    const inM = await page.evaluate(() => {
      const t = document.getElementById('schSchema').textContent || '';
      return { txt: t, m: (t.match(/ m\b/g) || []).length, cm: (t.match(/ cm\b/g) || []).length };
    });
    ok(inM.m >= 3 && inM.cm === 0, '#2: Schema beschriftet in m, solange m gewählt ist', { m: inM.m, cm: inM.cm });

    await page.click('.sch-unit-btn[data-schunit="cm"]');
    await page.waitForTimeout(300);
    const inCm = await page.evaluate(() => {
      const t = document.getElementById('schSchema').textContent || '';
      return {
        m: (t.match(/[\d.] m\b/g) || []).length, cm: (t.match(/ cm\b/g) || []).length,
        felder: ['sch_d_unit', 'sch_ps_unit', 'sch_nutz_unit', 'sch_res_unit']
          .map(id => (document.getElementById(id) || {}).textContent),
        tschalt: (document.getElementById('sch_tschalt') || {}).value
      };
    });
    ok(inCm.cm >= 3 && inCm.m === 0,
      '#2: nach dem Umschalten trägt JEDES Höhenmass im Schema «cm» (nicht nur der Ø)', inCm);
    ok(inCm.felder.every(u => u === 'cm'), '#2: alle Feld-Einheiten folgen mit', inCm.felder);
    ok(inCm.tschalt === '60',
      '#2: t_Schalt (Sekunden) wird NICHT mit-umgerechnet', inCm.tschalt);

    // ── #3 · Zonen + Schaltbirnen im gezeichneten SVG ────────────────────
    const svg = await page.evaluate(() => {
      const h = document.getElementById('schSchema');
      const rects = Array.from(h.querySelectorAll('rect')).map(r => r.getAttribute('fill'));
      const ell = Array.from(h.querySelectorAll('ellipse')).map(e => e.getAttribute('fill'));
      return { rects, ell, txt: h.textContent || '', note: (document.getElementById('schSchemaNote') || {}).textContent || '' };
    });
    ok(svg.rects.includes('#bbf7d0') && svg.rects.includes('#bfdbfe') && svg.rects.includes('#fed7aa'),
      '#3: alle drei Zonenfarben sind gezeichnet', svg.rects.filter(Boolean).slice(0, 8));
    ok(svg.ell.filter(f => f === '#111827').length >= 2,
      '#3: zwei schwarze Schaltbirnen gezeichnet', svg.ell);
    ok(/Ein/.test(svg.txt) && /Aus/.test(svg.txt), '#3: Schaltpunkte Ein/Aus beschriftet (gerendert)');
    ok(/Pumpendruckleitung Q/.test(svg.txt), '#3: Q steht an der Pumpendruckleitung (gerendert)');
    ok(/SN 592000/.test(svg.note), '#3: Schema-Notiz nennt SN 592000 (gerendert)', svg.note);
  }
} finally {
  if (browser) await browser.close();
  server.close();
}

console.log('\n' + ok_ + ' ok, ' + bad + ' fehlgeschlagen');
process.exit(bad ? 1 : 0);
