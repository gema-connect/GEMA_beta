// Playwright-Test für die beiden Feedback-Tool-Erweiterungen (Feedback 14.07., Folge):
//  A) gema_feedback.js — Annotation mit Werkzeugen Stift/Pfeil/Rechteck/Text
//     (Vektor-Shapes, Drag-Preview, Inline-Text-Input, Undo pro Objekt, Merge).
//  B) sys_beta.html — Markdown-Export: exportiert werden NUR Punkte, die im
//     Board mit «Feedback umsetzen» angehakt sind; der Status-Filter startet
//     auf «Offen» (in Arbeit NICHT vorausgewählt); nicht angehakte Punkte
//     werden im Modal ausgewiesen statt stillschweigend weggelassen. Danach
//     fragt der Dialog pro exportiertem offenen Punkt, ob er auf «In
//     Bearbeitung» soll (Download UND Kopieren); erledigt wird nie
//     zurückgestuft, Abwahl einzelner Punkte möglich.
// Aufruf: CHROME=<chromium> node scripts/feedback_tools_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ═════════════════════════════════════════════════════════════════
// A) ANNOTATION — Stift / Pfeil / Rechteck / Text
// ═════════════════════════════════════════════════════════════════
console.log('■ Annotation: Werkzeuge Stift / Pfeil / Rechteck / Text');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await page.goto(BASE + '/sb_druckanstieg.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._gfbHooks && document.getElementById('gfb-annot'), null, { timeout: 12000 });

  // Test-Screenshot (heller Canvas als Bild) öffnen
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 240;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f6fb'; g.fillRect(0, 0, 400, 240);
    g.fillStyle = '#334155'; g.font = '16px sans-serif'; g.fillText('Testinhalt', 30, 40);
    window.__origShot = c.toDataURL('image/png');
    _gfbHooks.openAnnotation(window.__origShot);
  });
  await page.waitForSelector('#gfb-annot-canvas', { state: 'attached', timeout: 8000 });
  ok(await page.evaluate(() => document.getElementById('gfb-annot').style.display === 'flex'), 'Annotation-Overlay offen (flex)');
  ok(await page.evaluate(() => _gfbHooks.tool() === 'pen'), 'Default-Werkzeug ist Stift');
  ok(await page.evaluate(() => document.querySelectorAll('#gfb-tools .gfb-tool').length === 4), 'Toolbar hat 4 Werkzeuge');

  const box = await (await page.$('#gfb-annot-canvas')).boundingBox();
  const drag = async (x1, y1, x2, y2) => {
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    await page.mouse.move(box.x + (x1 + x2) / 2, box.y + (y1 + y2) / 2, { steps: 4 });
    await page.mouse.move(box.x + x2, box.y + y2, { steps: 4 });
    await page.mouse.up();
  };

  // Stift
  await drag(20, 20, 90, 70);
  ok(await page.evaluate(() => _gfbHooks.shapes().length === 1 && _gfbHooks.shapes()[0].tool === 'pen' && _gfbHooks.shapes()[0].points.length > 2), 'Stift-Zug als pen-Shape mit Punkten committet');

  // Rechteck — Werkzeugwechsel über den Toolbar-BUTTON (testet das Binding)
  await page.click('#gfb-tools .gfb-tool[data-tool="rect"]');
  ok(await page.evaluate(() => _gfbHooks.tool() === 'rect'), 'Toolbar-Klick wechselt auf Rechteck');
  ok(await page.evaluate(() => {
    // Inline-Style prüfen (getComputedStyle liefert wegen transition:.15s
    // direkt nach dem Klick noch einen Zwischenwert)
    const akt = document.querySelector('#gfb-tools .gfb-tool[data-tool="rect"]');
    const pas = document.querySelector('#gfb-tools .gfb-tool[data-tool="pen"]');
    return akt.style.background === 'rgb(220, 38, 38)' && pas.style.background !== 'rgb(220, 38, 38)';
  }), 'aktiver Werkzeug-Button rot hervorgehoben');
  await drag(120, 30, 220, 110);
  ok(await page.evaluate(() => {
    const s = _gfbHooks.shapes(); const r = s[s.length - 1];
    return s.length === 2 && r.tool === 'rect' && Math.abs(r.x2 - r.x1) > 6 && Math.abs(r.y2 - r.y1) > 6;
  }), 'Rechteck committet (aufgezogen)');

  // Mini-Drag unter der Schwelle darf NICHT committen
  await drag(200, 200, 202, 201);
  ok(await page.evaluate(() => _gfbHooks.shapes().length === 2), 'Mini-Drag (<6px) erzeugt kein Geister-Rechteck');

  // Pfeil
  await page.evaluate(() => _gfbHooks.setTool('arrow'));
  ok(await page.evaluate(() => (document.getElementById('gfb-annot-hint').textContent || '').indexOf('Pfeilspitze') >= 0), 'Hint-Text folgt dem Werkzeug');
  await drag(40, 180, 180, 140);
  ok(await page.evaluate(() => {
    const s = _gfbHooks.shapes(); const a = s[s.length - 1];
    return s.length === 3 && a.tool === 'arrow' && a.x2 > a.x1;
  }), 'Pfeil committet (x1/y1 → x2/y2)');

  // Rote Pixel auf dem Canvas (alle drei Formen gezeichnet)
  const redCount = await page.evaluate(() => {
    const c = document.getElementById('gfb-annot-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90 && d[i + 3] > 100) n++;
    return n;
  });
  ok(redCount > 200, 'Shapes sichtbar gezeichnet (' + redCount + ' rote Pixel)');

  // Text: Klick platziert Inline-Input, Enter übernimmt
  await page.evaluate(() => _gfbHooks.setTool('text'));
  ok(await page.evaluate(() => document.getElementById('gfb-annot-canvas').style.cursor === 'text'), 'Text-Werkzeug setzt Text-Cursor');
  await page.mouse.click(box.x + 60, box.y + 100);
  await page.waitForSelector('#gfb-annot-textinp', { state: 'attached', timeout: 4000 });
  await page.keyboard.type('Fehler 1');
  await page.keyboard.press('Enter');
  ok(await page.evaluate(() => !document.getElementById('gfb-annot-textinp')), 'Enter schliesst das Text-Input');
  ok(await page.evaluate(() => {
    const s = _gfbHooks.shapes(); const t = s[s.length - 1];
    return s.length === 4 && t.tool === 'text' && t.text === 'Fehler 1' && t.size >= 16;
  }), 'Text-Shape committet («Fehler 1»)');

  // ESC im Text-Input bricht NUR das Input ab (Overlay bleibt offen)
  await page.mouse.click(box.x + 240, box.y + 190);
  await page.waitForSelector('#gfb-annot-textinp', { state: 'attached', timeout: 4000 });
  await page.keyboard.type('abc');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() =>
    !document.getElementById('gfb-annot-textinp') &&
    _gfbHooks.shapes().length === 4 &&
    document.getElementById('gfb-annot').style.display === 'flex'
  ), 'ESC im Text-Input: Input weg, kein Shape, Overlay bleibt offen');

  // Undo pro Objekt
  await page.evaluate(() => _gfbHooks.undo());
  ok(await page.evaluate(() => _gfbHooks.shapes().length === 3), 'Undo entfernt genau das letzte Objekt');

  // Fertig → Merge in den Screenshot + Formular öffnet
  await page.click('#gfb-annot-done');
  await page.waitForFunction(() => document.getElementById('gfb-modal').style.display === 'flex', null, { timeout: 4000 });
  const merged = await page.evaluate(() => ({
    shot: _gfbHooks.screenshot(),
    orig: window.__origShot,
    overlay: document.getElementById('gfb-annot').style.display
  }));
  ok(merged.overlay === 'none', '«Fertig» schliesst das Overlay');
  ok(merged.shot.indexOf('data:image/jpeg') === 0 && merged.shot !== merged.orig, 'Annotation in den Screenshot gemergt (JPEG)');

  // Preview-Klick → erneut annotieren startet mit leerer Shape-Liste
  await page.click('#gfb-preview');
  await page.waitForFunction(() => document.getElementById('gfb-annot').style.display === 'flex', null, { timeout: 4000 });
  ok(await page.evaluate(() => _gfbHooks.shapes().length === 0), 'Re-Annotation startet mit leerer Shape-Liste (Altes ist im Bild)');
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════
// B) SYS_BETA — Status-Dialog nach Markdown-Export
// ═════════════════════════════════════════════════════════════════
console.log('■ sys_beta: Export nur mit «Feedback umsetzen» + Dialog «In Bearbeitung»');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await page.goto(BASE + '/sys_beta.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#catContainer .cat-block', { timeout: 15000 });

  ok(await page.evaluate(() => !document.getElementById('exAutoMarkArbeit')), 'stille Auto-Mark-Checkbox entfernt');

  // Feedback-Cache seeden (wie von gema_feedback.js geschrieben).
  // A = offen + angehakt · B = erledigt + angehakt · D = offen OHNE Haken
  // C = offen + angehakt · E = in Arbeit + angehakt
  await page.evaluate(() => {
    _GemaDB.c['feedback_lu_tabelle'] = JSON.stringify([
      { type: 'fehler', author: 'Robin', text: 'Punkt A — Button tut nichts', ts: '14.07.26, 08:00', umsetzen: true },
      { type: 'kommentar', author: 'Robin', text: 'Punkt B — bereits erledigt', ts: '14.07.26, 08:05', cStatus: 'erledigt', umsetzen: true },
      { type: 'kommentar', author: 'Robin', text: 'Punkt D — noch nicht entschieden', ts: '14.07.26, 08:10' }
    ]);
    _GemaDB.c['feedback_druckdispositiv'] = JSON.stringify([
      { type: 'aenderung', author: 'Sandro', text: 'Punkt C — Einheit umstellen', ts: '14.07.26, 09:00', umsetzen: true },
      { type: 'fehler', author: 'Sandro', text: 'Punkt E — läuft bereits', ts: '14.07.26, 09:05', cStatus: 'bearbeitung', umsetzen: true }
    ]);
    openExportModal();
  });
  await page.waitForFunction(() => (document.getElementById('exStats').textContent || '').length > 0, null, { timeout: 5000 });

  // Default-Filter: nur «Offen» — «In Bearbeitung» ist NICHT vorausgewählt
  ok(await page.evaluate(() =>
    document.getElementById('exFilterOpen').checked === true &&
    document.getElementById('exFilterArbeit').checked === false &&
    document.getElementById('exFilterErledigt').checked === false
  ), 'Default-Filter: nur «Offen» — «In Arbeit» nicht markiert');

  ok(await page.evaluate(() => document.getElementById('exStats').textContent.indexOf('2 Einträge') >= 0), 'Export-Vorschau: 2 Einträge (A + C — erledigt/in Arbeit/ohne Haken raus)');
  {
    const md = await page.evaluate(() => document.getElementById('exPreview').value);
    ok(md.indexOf('Punkt A') >= 0 && md.indexOf('Punkt C') >= 0, 'angehakte offene Punkte A + C stehen im Markdown');
    ok(md.indexOf('Punkt D') < 0, 'NICHT angehakter Punkt D fehlt im Markdown');
    ok(md.indexOf('Punkt E') < 0, 'Punkt «In Arbeit» fehlt im Default-Export');
    ok(md.indexOf('nur Punkte mit «Feedback umsetzen»') >= 0, 'Markdown-Kopf weist die Auswahl aus');
  }
  // Nicht angehakte Punkte werden BENANNT statt stillschweigend weggelassen
  ok(await page.evaluate(() => {
    const h = document.getElementById('exUmHint');
    return h && h.textContent.indexOf('1 weiterer Punkt') >= 0 && h.textContent.indexOf('nicht angehakt') >= 0;
  }), 'Hinweis nennt den 1 nicht angehakten Punkt (D)');

  // «In Arbeit» dazuschalten holt E rein — der Default ist eine Vorauswahl,
  // keine Sperre.
  await page.evaluate(() => { document.getElementById('exFilterArbeit').checked = true; refreshExportPreview(); });
  ok(await page.evaluate(() =>
    document.getElementById('exStats').textContent.indexOf('3 Einträge') >= 0 &&
    document.getElementById('exPreview').value.indexOf('Punkt E') >= 0
  ), 'Filter «In Arbeit» manuell zuschalten holt Punkt E dazu');
  await page.evaluate(() => { document.getElementById('exFilterArbeit').checked = false; refreshExportPreview(); });

  // Download → Dialog erscheint mit den 2 OFFENEN Punkten
  await page.evaluate(() => downloadExport());
  await page.waitForFunction(() => document.getElementById('exMarkModal').style.display === 'flex', null, { timeout: 5000 });
  ok(true, 'Dialog öffnet nach .md-Download');
  ok(await page.evaluate(() => document.querySelectorAll('#exMarkList .exmark-cb').length === 2), 'Dialog listet genau die 2 offenen Punkte (erledigt fehlt)');
  ok(await page.evaluate(() => document.getElementById('exMarkList').textContent.indexOf('Punkt B') < 0), 'erledigter Punkt erscheint nicht');
  ok(await page.evaluate(() => document.getElementById('exMarkApply').textContent.indexOf('2 Punkte setzen') >= 0), 'Apply-Button zählt 2 vorausgewählte Punkte');

  // Alle ab-/anwählen
  await page.evaluate(() => exMarkToggleAll());
  ok(await page.evaluate(() =>
    document.getElementById('exMarkApply').disabled === true &&
    document.getElementById('exMarkToggleAll').textContent.indexOf('Alle auswählen') >= 0
  ), 'Alle abwählen: Apply deaktiviert, Toggle wechselt Label');
  await page.evaluate(() => exMarkToggleAll());

  // Einen Punkt (druckdispositiv) abwählen → nur lu_tabelle wird gesetzt
  await page.evaluate(() => {
    const k = window._exMarkPending.findIndex(e => e.modId === 'druckdispositiv');
    const cb = document.querySelector('#exMarkList .exmark-cb[data-k="' + k + '"]');
    cb.checked = false; exMarkUpdateCount();
  });
  ok(await page.evaluate(() => document.getElementById('exMarkApply').textContent.indexOf('1 Punkt setzen') >= 0), 'Abwahl aktualisiert den Zähler (1 Punkt)');
  await page.evaluate(() => exMarkApply());
  await page.waitForFunction(() => document.getElementById('exMarkModal').style.display === 'none', null, { timeout: 4000 });

  const st = await page.evaluate(() => ({
    lu: JSON.parse(_GemaDB.c['feedback_lu_tabelle']).map(e => e.cStatus || 'offen'),
    dd: JSON.parse(_GemaDB.c['feedback_druckdispositiv']).map(e => e.cStatus || 'offen')
  }));
  ok(st.lu[0] === 'bearbeitung', 'angewählter Punkt A → «In Bearbeitung»');
  ok(st.lu[1] === 'erledigt', 'erledigter Punkt B bleibt erledigt (nie zurückgestuft)');
  ok(st.lu[2] === 'offen', 'nie exportierter Punkt D bleibt unangetastet');
  ok(st.dd[0] === 'offen', 'abgewählter Punkt C bleibt offen');

  // Kopieren-Pfad öffnet den Dialog ebenfalls (nur noch der offene Punkt C)
  await page.evaluate(() => copyExport());
  await page.waitForFunction(() => document.getElementById('exMarkModal').style.display === 'flex', null, { timeout: 5000 });
  ok(await page.evaluate(() => document.querySelectorAll('#exMarkList .exmark-cb').length === 1), 'Dialog nach Kopieren: nur noch 1 offener Punkt');
  // «Nicht setzen» lässt alles unangetastet
  await page.evaluate(() => closeExMarkDialog());
  ok(await page.evaluate(() =>
    document.getElementById('exMarkModal').style.display === 'none' &&
    (JSON.parse(_GemaDB.c['feedback_druckdispositiv'])[0].cStatus || 'offen') === 'offen'
  ), '«Nicht setzen» ändert keine Status');

  /* ── Ziel «Erledigt» (Feedback 11.08.2026) ──────────────────
     «beim MD-Export soll es die Möglichkeit geben, die Punkte direkt als
     erledigt zu markieren». Stand hier: A = in Arbeit, C = offen.
     «In Arbeit» dazuschalten, damit A ueberhaupt mit exportiert wird. */
  await page.evaluate(() => {
    document.getElementById('exFilterArbeit').checked = true;
    refreshExportPreview(); downloadExport();
  });
  await page.waitForFunction(() => document.getElementById('exMarkModal').style.display === 'flex', null, { timeout: 5000 });
  ok(await page.evaluate(() => window._exMarkZiel === 'bearbeitung'),
    'Ziel startet auf «In Bearbeitung», solange offene Punkte dabei sind (Altverhalten)');
  ok(await page.evaluate(() => document.querySelectorAll('#exMarkList .exmark-cb').length === 1),
    '… und listet dafür nur den offenen Punkt C');

  await page.evaluate(() => exMarkSetZiel('erledigt'));
  ok(await page.evaluate(() => document.querySelectorAll('#exMarkList .exmark-cb').length === 3),
    'Ziel «Erledigt» nimmt offene UND laufende Punkte auf (C offen + A und E in Arbeit)');
  ok(await page.evaluate(() => document.getElementById('exMarkApply').textContent.indexOf('3 Punkte setzen') >= 0),
    'Zähler folgt dem Ziel');
  ok(await page.evaluate(() => document.getElementById('exMarkList').textContent.indexOf('in Arbeit') >= 0),
    'laufende Punkte sind als solche markiert (offen und in Arbeit stehen nebeneinander)');
  ok(await page.evaluate(() => document.getElementById('exMarkTitel').textContent.indexOf('erledigt') >= 0
    && document.getElementById('exMarkZielE').classList.contains('on')),
    'Titel und Umschalter zeigen das gewählte Ziel');

  await page.evaluate(() => exMarkApply());
  await page.waitForFunction(() => document.getElementById('exMarkModal').style.display === 'none', null, { timeout: 4000 });
  {
    const s = await page.evaluate(() => ({
      lu: JSON.parse(_GemaDB.c['feedback_lu_tabelle']),
      dd: JSON.parse(_GemaDB.c['feedback_druckdispositiv'])
    }));
    ok(s.lu[0].cStatus === 'erledigt' && s.dd[0].cStatus === 'erledigt' && s.dd[1].cStatus === 'erledigt',
      'alle drei sind erledigt — auch die, die schon in Arbeit waren (A, E)');
    ok(/^\d{2}\.\d{2}\.\d{2},/.test(s.lu[0].erledigtAm || ''),
      'Erledigt-Datum ist gestempelt, MIT Jahr (sonst greift die 3-Tage-Frist der Bereinigung nie)',
      s.lu[0].erledigtAm);
    ok((s.lu[2].cStatus || 'offen') === 'offen', 'nicht exportierter Punkt D bleibt offen');
  }
  // Zurueckstufen loescht den Stempel — sonst waere ein spaeter erneut
  // abgehakter Punkt mit dem alten Datum sofort aufraeumbar.
  await page.evaluate(() => setCommentStatus('lu_tabelle', 'fb', 0, 'bearbeitung'));
  ok(await page.evaluate(() => JSON.parse(_GemaDB.c['feedback_lu_tabelle'])[0].erledigtAm === undefined),
    'Zurückstufen entfernt den Erledigt-Stempel wieder');

  /* Nur noch laufende Punkte im Export: dann waere «In Bearbeitung» leer und
     der Dialog erschiene frueher gar nicht — der Weg zum Abhaken fehlte. */
  await page.evaluate(() => { refreshExportPreview(); downloadExport(); });
  await page.waitForFunction(() => document.getElementById('exMarkModal').style.display === 'flex', null, { timeout: 5000 });
  ok(await page.evaluate(() => window._exMarkZiel === 'erledigt'
    && document.querySelectorAll('#exMarkList .exmark-cb').length === 1),
    'ohne offene Punkte steht «Erledigt» vorn (statt dass der Dialog ausbleibt)');
  await page.evaluate(() => { closeExMarkDialog(); document.getElementById('exFilterArbeit').checked = false; refreshExportPreview(); });

  // Kein offener Punkt mehr → Export öffnet den Dialog gar nicht
  await page.evaluate(() => {
    const fb = JSON.parse(_GemaDB.c['feedback_druckdispositiv']);
    fb[0].cStatus = 'erledigt';
    _GemaDB.c['feedback_druckdispositiv'] = JSON.stringify(fb);
    const lu = JSON.parse(_GemaDB.c['feedback_lu_tabelle']);
    lu[0].cStatus = 'erledigt';
    _GemaDB.c['feedback_lu_tabelle'] = JSON.stringify(lu);
    refreshExportPreview();
    downloadExport();
  });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('exMarkModal').style.display !== 'flex'), 'ohne offene Punkte erscheint kein Dialog');

  // Leerer Export erklärt sich: Punkt D wäre offen, ist aber nicht angehakt
  ok(await page.evaluate(() => {
    const md = document.getElementById('exPreview').value;
    return md.indexOf('nicht mit «Feedback umsetzen» angehakt') >= 0;
  }), 'leerer Export nennt den Grund (nicht angehakt) statt nur «keine Einträge»');

  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
