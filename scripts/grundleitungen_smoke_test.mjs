#!/usr/bin/env node
/* Grundleitungen — Playwright-Smoke
 * Deckt ab: Boot + Default-Seeding (1 Fallstrang → 1 Abschnitt → HSK), K-Wahl,
 * DU-Eingabe → Qww-Chip + Ergebnisliste, Zusammenführung zweier Fallstränge
 * (ΣDU summiert, Qww NEU gerechnet), Regenwasser → Mischwasser + SVG wächst,
 * Baum (2. Abschnitt als Zulauf) + keine Verjüngung, Retention-Drossel,
 * dynamisches SVG (Quellen-Boxen, rote Anschluss-Box, HSK), Schema-Klick →
 * Zeilen-Puls, Persistenz-Roundtrip über #gl_rows + AutoSave-Snapshot,
 * graceful Cross-Modul-Links (Cloud leer → Hinweis statt Absturz),
 * Kein-Zugriff für Monteur.
 * Ausführen: CHROME=<chromium> node scripts/grundleitungen_smoke_test.mjs
 */
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
page.on('pageerror', e => { failCount++; console.log('  ✗ PAGEERROR: ' + e.message); });
await page.goto(BASE + '/sb_grundleitungen.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof glRecalc === 'function' && document.querySelectorAll('#glQBody tr').length >= 1, null, { timeout: 9000 });

async function setRowInput(bodySel, row, inpIdx, val) {
  await page.evaluate(([b, r, i, v]) => {
    const tr = document.querySelectorAll(b + ' tr')[r];
    const inp = tr.querySelectorAll('input[type="text"]')[i];
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, [bodySel, row, inpIdx, String(val)]);
}

console.log('■ Boot & Default-Seeding');
{
  ok(await page.evaluate(() => document.querySelectorAll('#glQBody tr').length) === 1, 'Default: 1 Einleitung (WAS-H 1)');
  ok(await page.evaluate(() => document.querySelectorAll('#glABody tr').length) === 1, 'Default: 1 Abschnitt (Grundleitung 1 → HSK)');
  ok(await page.evaluate(() => document.querySelectorAll('#glkRow .glk-opt').length) === 4, 'K-Wahl: 4 Optionen gerendert');
  ok(await page.evaluate(() => document.querySelector('#glkRow .glk-opt.sel .kv').textContent) === '0.5', 'K-Default 0.5 selektiert');
  ok(await page.evaluate(() => JSON.parse(document.getElementById('gl_rows').value).abschnitte.length) === 1, 'Persist-Guard: #gl_rows sofort befüllt');
  ok(await page.evaluate(() => !!document.querySelector('#glSchema svg')), 'SVG-Schema gezeichnet');
}

console.log('■ Fallstrang: DU → Qww-Chip + Ergebnisliste');
{
  await setRowInput('#glQBody', 0, 1, '20');   // input 0 = Name, 1 = ΣDU
  const chip = await page.evaluate(() => document.querySelector('#glQBody .gl-chip.calc').textContent);
  ok(/2\.24/.test(chip), 'Qww-Chip ≈ 2.24 l/s (K·√20): ' + chip);
  const qtot = await page.evaluate(() => document.querySelector('#glResBody tr .qtot').textContent);
  ok(/2\.24/.test(qtot), 'Ergebnisliste Qtot = 2.24 l/s');
  ok(await page.evaluate(() => /DN 110/.test(document.querySelectorAll('#glResBody tr td')[10].textContent)), 'mind. DN 110 (Mindest-DN SW)');
  ok(await page.evaluate(() => document.querySelector('#glResBody tr').classList.contains('anschluss')), 'Einziger Abschnitt = Anschlussleitung (rot markiert)');
  ok(await page.evaluate(() => /Anschlussleitung/.test(document.querySelector('#glSchema svg').innerHTML)), 'SVG: rote Anschlussleitungs-Box');
  ok(await page.evaluate(() => /HSK/.test(document.querySelector('#glSchema svg').innerHTML)), 'SVG: HSK-Kreis beschriftet');
}

console.log('■ Zusammenführung: 2. Fallstrang — DU summieren, Qww NEU rechnen');
{
  await page.click('button.gl-add:has-text("＋ Fallstrang")');
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 2);
  await setRowInput('#glQBody', 1, 1, '30');
  const r = await page.evaluate(() => {
    const tds = document.querySelectorAll('#glResBody tr td');
    return { du: tds[2].textContent, qww: tds[3].textContent };
  });
  ok(/50/.test(r.du), 'ΣDU = 50 (20 + 30)');
  ok(/3\.54/.test(r.qww), 'Qww = 3.54 l/s (0.5·√50 — NICHT 2.24 + 2.74)');
  const svgBoxes = await page.evaluate(() => (document.querySelector('#glSchema svg').innerHTML.match(/data-glziel="q:/g) || []).length);
  ok(svgBoxes === 2, 'SVG: 2 Quellen-Boxen (dynamisch gewachsen)');
}

console.log('■ Regenwasser + Dauerverbraucher → Mischwasser');
{
  await page.click('button.gl-add:has-text("＋ Regenwasser")');
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 3);
  await setRowInput('#glQBody', 2, 1, '3');    // Regen: input 0 = Name, 1 = Q
  await page.click('button.gl-add:has-text("＋ Dauerverbraucher")');
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 4);
  await setRowInput('#glQBody', 3, 1, '0.8');
  const r = await page.evaluate(() => {
    const tr = document.querySelector('#glResBody tr');
    const tds = tr.querySelectorAll('td');
    return { med: tds[1].textContent, qc: tds[4].textContent, qr: tds[5].textContent, qtot: tds[6].textContent };
  });
  ok(/Mischwasser/.test(r.med), 'Medium = Mischwasser');
  ok(/0\.80/.test(r.qc), 'Qc = 0.80 l/s (1:1)');
  ok(/3\.00/.test(r.qr), 'Qr = 3.00 l/s (1:1)');
  ok(/7\.34/.test(r.qtot), 'Qtot = 3.54 + 0.8 + 3 = 7.34 l/s');
  ok(await page.evaluate(() => (document.querySelector('#glSchema svg').innerHTML.match(/data-glziel="q:/g) || []).length) === 4, 'SVG: 4 Quellen-Boxen');
}

console.log('■ Baum: 2. Abschnitt als Zulauf + keine Verjüngung');
{
  await page.click('button.gl-add:has-text("＋ Abschnitt")');
  await page.waitForFunction(() => document.querySelectorAll('#glABody tr').length === 2);
  // Abschnitt 2 mündet in Abschnitt 1; Regenwasser-Quelle dorthin verschieben
  await page.evaluate(() => {
    const a2row = document.querySelectorAll('#glABody tr')[1];
    const ziel = a2row.querySelector('select[data-glziel-sel]');
    ziel.value = JSON.parse(document.getElementById('gl_rows').value).abschnitte[0].id;
    ziel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    const qrow = document.querySelectorAll('#glQBody tr')[2];
    const ziel = qrow.querySelectorAll('select')[1];
    ziel.value = st.abschnitte[1].id;
    ziel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#glResBody tr').length === 2);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#glResBody tr')].map(tr => ({
    name: tr.querySelector('td b').textContent,
    med: tr.querySelectorAll('td')[1].textContent,
    anschluss: tr.classList.contains('anschluss')
  })));
  ok(rows.length === 2 && rows[0].name === 'Grundleitung 2' && !rows[0].anschluss, 'Zulauf-Abschnitt zuerst gelistet (Fliessreihenfolge)');
  ok(/Regenwasser/.test(rows[0].med), 'Zulauf = Regenwasser');
  ok(rows[1].anschluss && /Mischwasser/.test(rows[1].med), 'Anschlussleitung bleibt Mischwasser');
  // keine Verjüngung: Zulauf manuell DN 160 → Anschluss mind. DN 160
  await page.evaluate(() => {
    const a2row = document.querySelectorAll('#glABody tr')[1];
    const dn = a2row.querySelectorAll('select')[1];
    dn.value = '160';
    dn.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const mindDn = await page.evaluate(() => document.querySelectorAll('#glResBody tr')[1].querySelectorAll('td')[10].textContent);
  ok(/160/.test(mindDn), 'Keine Verjüngung: Anschluss mind. DN 160 (Zulauf DN 160)');
}

console.log('■ Retention drosselt den Regenanteil');
{
  await page.evaluate(() => {
    const a2row = document.querySelectorAll('#glABody tr')[1];
    const cb = a2row.querySelector('input[type="checkbox"]');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#glABody tr')[1].querySelectorAll('input[type="text"]').length === 3);
  await setRowInput('#glABody', 1, 2, '1.5');   // Drossel [l/s] (inputs: Name, Gefälle, Drossel)
  const r = await page.evaluate(() => {
    const rows = document.querySelectorAll('#glResBody tr');
    return { qrZu: rows[0].querySelectorAll('td')[5].textContent, qrAn: rows[1].querySelectorAll('td')[5].textContent,
             hin: rows[0].querySelectorAll('td')[12].textContent, svg: document.querySelector('#glSchema svg').innerHTML };
  });
  ok(/1\.50/.test(r.qrZu), 'Zulauf: Qr gedrosselt auf 1.50 l/s');
  ok(/1\.50/.test(r.qrAn), 'Anschluss erhält den gedrosselten Wert');
  ok(/Retention/.test(r.hin), 'Hinweis «Retention …» in der Liste');
  ok(/Retention/.test(r.svg), 'SVG: Retentions-Symbol beschriftet');
}

console.log('■ Schema-Klick → Zeile pulsiert');
{
  await page.evaluate(() => {
    const g = document.querySelector('#glSchema svg [data-glziel^="a:"]');
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  ok(await page.evaluate(() => !!document.querySelector('#glABody tr.gl-puls, #glQBody tr.gl-puls')), 'Klick auf SVG-Element → Tabellen-Zeile pulsiert');
}

console.log('■ Cross-Modul-Links (Cloud leer) — graceful');
{
  await page.click('#glQBody tr button.gl-linkbtn');   // ⇩ DU-Zusammenstellung (Fallstrang Zeile 1)
  await page.waitForFunction(() => !!document.querySelector('.gema-dlg-bg') || !!document.querySelector('.gema-dlg'), null, { timeout: 6000 }).catch(() => {});
  const dlgTxt = await page.evaluate(() => document.body.textContent);
  ok(/DU-Zusammenstellung einmal öffnen|keine gespeicherten DU-Werte/i.test(dlgTxt), 'DU-Link ohne Daten → erklärender Dialog');
  await page.evaluate(() => { document.querySelectorAll('.gema-dlg-bg button, .gema-dlg button').forEach(b => { if (/ok|schliessen/i.test(b.textContent)) b.click(); }); });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#glQBody tr')[2].querySelectorAll('button')].find(x => /Niederschlag/.test(x.textContent)); b.click(); });
  await page.waitForFunction(() => document.getElementById('glPickBg').classList.contains('open'), null, { timeout: 6000 });
  ok(await page.evaluate(() => /Niederschlagsanfall/.test(document.getElementById('glPickList').textContent)), 'Niederschlag-Link ohne Daten → Empty-State im Picker');
  await page.evaluate(() => glPickClose());
}

console.log('■ Persistenz-Roundtrip (AutoSave-Snapshot)');
{
  await page.waitForTimeout(5800);   // AutoSave-Debounce (gema_autosave: 5 s)
  const snap = await page.evaluate(() => localStorage.getItem('gema_grundleitungen'));
  ok(!!snap && snap.indexOf('gl_rows') >= 0, 'AutoSave-Snapshot enthält gl_rows');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof glRecalc === 'function' && document.querySelectorAll('#glQBody tr').length >= 1, null, { timeout: 9000 });
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 4, null, { timeout: 9000 });
  const r = await page.evaluate(() => ({
    q: document.querySelectorAll('#glQBody tr').length,
    a: document.querySelectorAll('#glABody tr').length,
    du: document.querySelectorAll('#glQBody tr')[0].querySelectorAll('input[type="text"]')[1].value,
    qww: document.querySelectorAll('#glResBody tr')[1] ? document.querySelectorAll('#glResBody tr')[1].querySelectorAll('td')[3].textContent : ''
  }));
  ok(r.q === 4 && r.a === 2, 'Nach Reload: 4 Einleitungen + 2 Abschnitte restauriert');
  ok(r.du === '20', 'DU-Wert restauriert');
  ok(/3\.54/.test(r.qww), 'Ergebnis nach Reload identisch (Qww 3.54)');
}

console.log('■ Einstellungen wirken (Mindest-DN)');
{
  await page.evaluate(() => {
    const inp = document.querySelector('[data-cfg="minDnSw"]');
    inp.value = '160';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const mindDn = await page.evaluate(() => document.querySelectorAll('#glResBody tr')[1].querySelectorAll('td')[10].textContent);
  ok(/160|200/.test(mindDn), 'Mindest-DN-Einstellung schlägt durch: ' + mindDn.trim());
}

console.log('■ ⊞ im Schema: Hinzufügen direkt an der Stelle');
{
  // Stand: 2 Abschnitte (Anschluss + Zulauf) → je Abschnitt ein ⊞ + HSK-⊞
  // + seit Feedback 28.07.2026 ein kleines Zwischen-⊞ VOR jeder Quelle
  // (damit auch zwischen zwei Fallsträngen eingefügt werden kann)
  const pinfo = await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    const html = document.querySelector('#glSchema svg').innerHTML;
    const leer = st.abschnitte.filter(a => !st.quellen.some(q => q.ziel === a.id) && !st.abschnitte.some(x => x.ziel === a.id)).length;
    return { alle: (html.match(/data-gladd="/g) || []).length,
             gap: (html.match(/data-gladd="[^"]*@/g) || []).length,
             a: st.abschnitte.length, q: st.quellen.length, leer };
  });
  ok(pinfo.alle === pinfo.a + 1 + pinfo.q + pinfo.leer, '⊞ ueberall: je Abschnitt + HSK + je Quelle + Start-⊞ leerer Straenge (' + pinfo.alle + ')');
  ok(pinfo.gap === pinfo.q, 'Einfuege-⊞ vor jeder Quelle — Box-⊞ am Start, Zwischen-⊞ in den Luecken (' + pinfo.gap + '/' + pinfo.q + ')');
  // 45°-Darstellung (Feedback 28.07.2026): Quellen-Stiche + Zulauf-Einbindungen
  // schraeg in Fliessrichtung, Start-Punkt je Abschnitt, HSK-Anschluss 45°
  const svg45 = await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    const html = document.querySelector('#glSchema svg').innerHTML;
    // Anschluss-Stich der Quelle laeuft in der MEDIUM-Farbe (braun/cyan),
    // nicht in der Typ-Farbe der Box (Feedback 28.07.2026)
    const stich = [...html.matchAll(/stroke="(#[0-9a-f]{6})" stroke-width="3\.2"/g)].map(m => m[1]);
    return { stiche: stich.length, q: st.quellen.length,
             braun: stich.filter(c => c === '#b45309').length,
             typfarbe: stich.filter(c => c === '#334155' || c === '#0d9488').length,
             // altes Junction-Symbol: weisses 16x16-Kaestchen mit rx=3.5
             // (das Legenden-⊞ hat rx=4.5 + hellblauen Fill und zaehlt nicht)
             kaestchen: (html.match(/width="16" height="16" rx="3\.5"/g) || []).length,
             offene: (html.match(/r="4\.5"/g) || []).length,
             seg: (html.match(/class="glseg"/g) || []).length,
             hsk45: /H\d+(?:\.\d+)? L\d/.test(html) };
  });
  ok(svg45.stiche === svg45.q * 2, 'Quellen via eigener Stich-Leitung + 45° (' + svg45.stiche + ' Segmente fuer ' + svg45.q + ' Quellen)');
  ok(svg45.braun >= 2 && svg45.typfarbe === 0, 'Anschluss-Stich in der Leitungsfarbe, nicht in der Box-Typfarbe (' + svg45.braun + ' braun)');
  ok(svg45.kaestchen === 0, 'Zusammenfuehrungen ohne Kaestchen-Symbol — die Leitungen treffen sich normal');
  ok(svg45.offene === 0, 'keine offenen Startpunkte — die Leitung beginnt beim ersten Verbraucher');
  ok(svg45.seg >= 2, 'Teilstrecken-Beschriftung nach jeder Einbindung (' + svg45.seg + ' Wert-Chips)');
  ok(svg45.hsk45, 'HSK-Anschluss ueber 45°-Schenkel');
  await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    document.querySelector('#glSchema svg [data-gladd="' + st.abschnitte[0].id + '"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
  });
  await page.waitForSelector('#glCtxAdd', { timeout: 4000 });
  ok(await page.evaluate(() => document.querySelectorAll('#glCtxAdd button').length) === 4, 'Menü: 3 Verbraucher-Typen + Zulauf-Strang');
  await page.evaluate(() => { [...document.querySelectorAll('#glCtxAdd button')].find(b => /Fallstrang/.test(b.textContent)).click(); });
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 5);
  ok(await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    const q = st.quellen[st.quellen.length - 1];
    return q.typ === 'fallstrang' && q.ziel === st.abschnitte[0].id;
  }), 'Neue Quelle hängt am angeklickten Abschnitt');
  ok(await page.evaluate(() => !document.getElementById('glCtxAdd')), 'Menü nach Auswahl geschlossen');
  ok(await page.evaluate(() => !!document.querySelector('#glQBody tr.gl-puls')), 'Neue Zeile pulsiert (Fokus)');
  // Zulauf-Strang VORSCHALTEN auf den bestehenden Zulauf → 3-stufige Kette
  await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    document.querySelector('#glSchema svg [data-gladd="' + st.abschnitte[1].id + '"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
  });
  await page.waitForSelector('#glCtxAdd', { timeout: 4000 });
  await page.evaluate(() => { [...document.querySelectorAll('#glCtxAdd button')].find(b => /Zulauf-Strang/.test(b.textContent)).click(); });
  await page.waitForFunction(() => document.querySelectorAll('#glABody tr').length === 3);
  ok(await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    return st.abschnitte[2].ziel === st.abschnitte[1].id && st.abschnitte[1].ziel === st.abschnitte[0].id;
  }), 'Strang vor Strang: a3 → a2 → a1 (mehrstufiger Zusammenfluss)');
  ok(await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    const leer = st.abschnitte.filter(a => !st.quellen.some(q => q.ziel === a.id) && !st.abschnitte.some(x => x.ziel === a.id)).length;
    return (document.querySelector('#glSchema svg').innerHTML.match(/data-gladd="/g) || []).length
      === st.abschnitte.length + 1 + st.quellen.length + leer;
  }), 'Neuer (leerer) Strang trägt sofort ein Start-⊞ + End-⊞ (Formel inkl. leerer Straenge)');
  // Zwischen-⊞: fuegt VOR der angeklickten Quelle ein (zwischen zwei Fallstraengen)
  await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    const ziel = st.abschnitte[0].id;
    const qsA = st.quellen.filter(q => q.ziel === ziel);
    const vor = qsA[qsA.length - 1];
    window.__vorQ = vor.id;
    document.querySelector('#glSchema svg [data-gladd="' + ziel + '@' + vor.id + '"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
  });
  await page.waitForSelector('#glCtxAdd', { timeout: 4000 });
  await page.evaluate(() => { [...document.querySelectorAll('#glCtxAdd button')].find(b => /Fallstrang/.test(b.textContent)).click(); });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    const vi = st.quellen.findIndex(q => q.id === window.__vorQ);
    const neu = st.quellen[vi - 1];
    return vi > 0 && neu && neu.typ === 'fallstrang' && neu.ziel === st.abschnitte[0].id;
  }), 'Zwischen-⊞ fuegt den neuen Verbraucher VOR der Quelle ein (Position erhalten)');
  // ⊞ am HSK → weitere Anschlussleitung (direkt, ohne Menü)
  await page.evaluate(() => {
    document.querySelector('#glSchema svg [data-gladd="hsk"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#glABody tr').length === 4);
  ok(await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    return st.abschnitte[3].ziel === 'hsk';
  }), 'HSK-⊞ legt eine weitere Anschlussleitung an (2 Roots)');
  ok(await page.evaluate(() => (document.querySelector('#glSchema svg').innerHTML.match(/Anschlussleitung/g) || []).length) >= 2, 'SVG: 2 rote Anschluss-Boxen');
}

console.log('■ Vollbild: öffnen, zoomen, ⊞ im Vollbild, schliessen');
{
  await page.click('button:has-text("⛶ Vollbild")');
  await page.waitForFunction(() => document.getElementById('glFsBg').classList.contains('open'));
  ok(true, 'Vollbild öffnet');
  ok(await page.evaluate(() => !!document.querySelector('#glFsHost svg')), 'SVG im Vollbild gerendert');
  const w1 = await page.evaluate(() => parseFloat(document.querySelector('#glFsHost svg').style.width));
  await page.click('.gl-fs-tools button[title="Vergrössern"]');
  const w2 = await page.evaluate(() => parseFloat(document.querySelector('#glFsHost svg').style.width));
  ok(w2 > w1, 'Zoom ＋ vergrössert das SVG (' + w1 + ' → ' + w2 + ' px)');
  ok(await page.evaluate(() => /%/.test(document.getElementById('glFsPct').textContent)), 'Zoom-Prozentanzeige aktualisiert');
  await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    document.querySelector('#glFsHost svg [data-gladd="' + st.abschnitte[0].id + '"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 400 }));
  });
  await page.waitForSelector('#glCtxAdd', { timeout: 4000 });
  const qn0 = await page.evaluate(() => document.querySelectorAll('#glQBody tr').length);
  await page.evaluate(() => { [...document.querySelectorAll('#glCtxAdd button')].find(b => /Regenwasser/.test(b.textContent)).click(); });
  await page.waitForFunction(n => document.querySelectorAll('#glQBody tr').length === n + 1, qn0);
  ok(await page.evaluate(() => document.getElementById('glFsBg').classList.contains('open')), 'Vollbild bleibt beim Hinzufügen offen');
  ok(await page.evaluate(n => (document.querySelector('#glFsHost svg').innerHTML.match(/data-glziel="q:/g) || []).length === n + 1, qn0), 'Vollbild-SVG zeigt die neue Quelle sofort');
  await page.evaluate(() => {
    document.querySelector('#glFsHost svg [data-glziel^="q:"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForFunction(() => !document.getElementById('glFsBg').classList.contains('open'));
  ok(true, 'Box-Klick im Vollbild schliesst und springt zur Zeile');
  ok(await page.evaluate(() => !!document.querySelector('#glQBody tr.gl-puls, #glABody tr.gl-puls')), 'Zeile pulsiert nach dem Vollbild-Sprung');
  await page.click('button:has-text("⛶ Vollbild")');
  await page.waitForFunction(() => document.getElementById('glFsBg').classList.contains('open'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('glFsBg').classList.contains('open'));
  ok(true, 'ESC schliesst das Vollbild');
}

console.log('■ Kein Zugriff für Monteur');
{
  const { page: p2 } = await newPage(browser, seed(['role_monteur']));
  await p2.goto(BASE + '/sb_grundleitungen.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1600);
  const txt = await p2.evaluate(() => document.body.textContent || '');
  ok(/Kein Zugriff|kein Zugriff/.test(txt), 'Monteur sieht den Kein-Zugriff-Screen');
  await p2.context().close();
}

await browser.close();
server.close();
console.log('');
console.log(failCount === 0 ? '✅ ' + okCount + '/' + okCount + ' Checks grün' : '❌ ' + failCount + ' von ' + (okCount + failCount) + ' Checks rot');
process.exit(failCount === 0 ? 0 : 1);
