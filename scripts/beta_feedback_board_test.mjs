// Playwright-Smoke: sys_beta — Feedback-Board-Umbau (Feedback 17.07.2026)
//   - Feedback-Punkte pro Modul als eingeklapptes Voll-Breite-Panel unter der
//     Modul-Zeile (statt enger Tabellenzelle) — Toggle öffnet/schliesst
//   - Screenshots gross (max-height 380px) + Klick öffnet die Lightbox
//   - Checkbox-Mehrfachauswahl («Alle markieren» pro Modul, auch modulübergreifend)
//     + Bulk-Leiste unten: Status gemeinsam wechseln (offen/bearbeitung/erledigt)
//   - Einzel-Status/Löschen weiterhin pro Punkt; Filter versteckt Panels mit
//   - «Meine Feedbacks»-Filter: nur Module + Karten des eingeloggten Users
// Ausführen: CHROME=<chromium> node scripts/beta_feedback_board_test.mjs
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

console.log('■ Boot + Feedback seeden (2 Module, 1 Screenshot)');
const { ctx, page } = await newPage(browser, seed(['role_admin']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/sys_beta.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#catContainer .cat-block', { timeout: 15000 });

// 1×1-px-PNG als Screenshot-Platzhalter
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
await page.evaluate(png => {
  _GemaDB.c['feedback_lu_tabelle'] = JSON.stringify([
    { type: 'fehler', author: 'Robin', text: 'Punkt A — Button tut nichts', ts: '17.07.26, 08:00', screenshot: png },
    { type: 'kommentar', author: 'Robin', text: 'Punkt B — Layout prüfen', ts: '17.07.26, 08:05' }
  ]);
  _GemaDB.c['feedback_druckdispositiv'] = JSON.stringify([
    { type: 'aenderung', author: 'Sandro', text: 'Punkt C — Einheit umstellen', ts: '17.07.26, 09:00' }
  ]);
  renderAll();
}, PNG);

console.log('■ Panel: eingeklappt starten, Voll-Breite-Zeile, Toggle');
ok(await page.evaluate(() => {
  const p = document.getElementById('fbp-lu_tabelle');
  return p && p.style.display === 'none' && p.dataset.open === '0';
}), 'Panel startet eingeklappt');
ok(await page.evaluate(() => {
  const p = document.getElementById('fbp-lu_tabelle');
  return p.tagName === 'TR' && p.querySelector('td').getAttribute('colspan') === '5';
}), 'Panel ist Voll-Breite-Zeile (colspan 5) unter der Modul-Zeile');
ok(await page.evaluate(() => !document.querySelector('.comment-box')), 'Alte enge Kommentar-Box in der Zelle ist weg');
await page.evaluate(() => toggleFbPanel('lu_tabelle'));
ok(await page.evaluate(() => {
  const p = document.getElementById('fbp-lu_tabelle');
  return p.style.display !== 'none' && p.dataset.open === '1';
}), 'Toggle klappt das Panel auf');
ok(await page.evaluate(() => document.querySelectorAll('#cl-lu_tabelle .fb-card').length === 2), 'Beide Feedback-Punkte als Karten gerendert');

console.log('■ Screenshot gross + Lightbox');
{
  const shot = await page.evaluate(() => {
    const img = document.querySelector('#cl-lu_tabelle .fb-shot img');
    if (!img) return null;
    return { maxH: getComputedStyle(img).maxHeight, cursor: getComputedStyle(img).cursor };
  });
  ok(shot && shot.maxH === '380px', 'Screenshot bis 380px hoch (vorher 160px)');
  ok(shot && shot.cursor === 'zoom-in', 'Bild zeigt zoom-in-Cursor');
  await page.click('#cl-lu_tabelle .fb-shot img');
  ok(await page.evaluate(() => document.getElementById('fbLightboxEl').classList.contains('open')), 'Klick öffnet die Lightbox');
  ok(await page.evaluate(() => document.getElementById('fbLightboxImg').src.indexOf('data:image/png') === 0), 'Lightbox zeigt das Bild');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => !document.getElementById('fbLightboxEl').classList.contains('open')), 'ESC schliesst die Lightbox');
}

console.log('■ Multi-Select + Bulk-Statuswechsel');
await page.evaluate(() => fbSelAll('lu_tabelle'));
ok(await page.evaluate(() => fbSelCount() === 2), '«Alle markieren» wählt beide Punkte');
ok(await page.evaluate(() => document.getElementById('fbBulkbar').classList.contains('show')), 'Bulk-Leiste erscheint');
ok(await page.evaluate(() => document.getElementById('fbBulkCount').textContent.indexOf('2 Punkte') === 0), 'Leiste zählt 2 Punkte');
// modulübergreifend: dritten Punkt aus druckdispositiv dazu
await page.evaluate(() => {
  toggleFbPanel('druckdispositiv');
  document.querySelector('#cl-druckdispositiv .fb-check').click();
});
ok(await page.evaluate(() => fbSelCount() === 3 && document.getElementById('fbBulkCount').textContent.indexOf('3 Punkte') === 0), 'Auswahl funktioniert modulübergreifend (3 Punkte)');
await page.evaluate(() => fbBulkStatus('bearbeitung'));
{
  const st = await page.evaluate(() => ({
    lu: JSON.parse(_GemaDB.c['feedback_lu_tabelle']).map(e => e.cStatus || 'offen'),
    dd: JSON.parse(_GemaDB.c['feedback_druckdispositiv']).map(e => e.cStatus || 'offen'),
    sel: fbSelCount(),
    bar: document.getElementById('fbBulkbar').classList.contains('show')
  }));
  ok(st.lu.join() === 'bearbeitung,bearbeitung' && st.dd.join() === 'bearbeitung', 'Bulk setzt alle 3 Punkte auf «In Arbeit» (beide Module gespeichert)');
  ok(st.sel === 0 && !st.bar, 'Auswahl geleert, Leiste verschwindet');
}
// «In Arbeit» ist auf Modulebene GELB, nicht rot — rot bleibt den wirklich
// offenen Punkten vorbehalten (sonst sieht ein Modul, an dem gerade
// gearbeitet wird, gleich dringend aus wie ein unangetastetes).
{
  const b = await page.evaluate(() => {
    const btn = document.querySelector('tr[data-id=lu_tabelle] .comment-toggle');
    const a = btn.querySelector('.cb-c-arbeit');
    return { arbeit: a && a.textContent, gelb: a && getComputedStyle(a).backgroundColor, rot: !!btn.querySelector('.cb-c-open') };
  });
  ok(b.arbeit === '2', 'Modul-Zeile zählt die 2 Punkte «In Arbeit» separat');
  ok(b.gelb === 'rgb(217, 119, 6)', 'und zeigt sie GELB (--amb) statt rot' + (b.gelb ? ' — ist ' + b.gelb : ''));
  ok(!b.rot, 'Kein roter Offen-Zähler mehr, sobald nichts mehr offen ist');
}
// Bulk erneut: alle auf erledigt → Zähler-Badge grün
await page.evaluate(() => { fbSelAll('lu_tabelle'); fbBulkStatus('erledigt'); });
ok(await page.evaluate(() => JSON.parse(_GemaDB.c['feedback_lu_tabelle']).every(e => e.cStatus === 'erledigt')), 'Zweiter Bulk-Lauf: beide Punkte erledigt');
ok(await page.evaluate(() => {
  const btn = document.querySelector('tr[data-id=lu_tabelle] .comment-toggle');
  return btn && btn.querySelector('.cb-c-done') && !btn.querySelector('.cb-c-open');
}), 'Zähler-Badge der Modul-Zeile nur noch grün (0 offen)');

console.log('■ Einzel-Aktionen + manuelle Kommentare weiter intakt');
await page.evaluate(() => {
  document.getElementById('cta-lu_tabelle').value = 'Manueller Hinweis';
  document.getElementById('cauthor-lu_tabelle').value = 'Tester';
  addComment('lu_tabelle', 'LU / Spitzenvolumenstrom');
});
ok(await page.evaluate(() => document.querySelectorAll('#cl-lu_tabelle .fb-card').length === 3), 'Manueller Kommentar erscheint als dritte Karte');
await page.evaluate(() => setCommentStatus('lu_tabelle', 'm', 0, 'bearbeitung'));
ok(await page.evaluate(() => (state.mods.lu_tabelle.comments[0].cStatus) === 'bearbeitung'), 'Einzel-Statuswechsel pro Punkt funktioniert weiter');
// Bulk auf gemischte Quellen (Feedback + manuell)
await page.evaluate(() => { fbSelAll('lu_tabelle'); fbBulkStatus('offen'); });
ok(await page.evaluate(() =>
  JSON.parse(_GemaDB.c['feedback_lu_tabelle']).every(e => e.cStatus === 'offen') &&
  state.mods.lu_tabelle.comments[0].cStatus === 'offen'
), 'Bulk deckt Feedback- UND manuelle Punkte ab');

console.log('■ Filter versteckt Panel mit; Suche findet Feedback-Text');
await page.evaluate(() => { document.getElementById('searchInp').value = 'Einheit umstellen'; filterRows(); });
{
  const r = await page.evaluate(() => ({
    dd: document.querySelector('tr[data-id=druckdispositiv]').style.display,
    ddPanel: document.getElementById('fbp-druckdispositiv').style.display,
    lu: document.querySelector('tr[data-id=lu_tabelle]').style.display,
    luPanel: document.getElementById('fbp-lu_tabelle').style.display
  }));
  ok(r.dd !== 'none' && r.ddPanel !== 'none', 'Suche nach Feedback-Text findet das Modul (Panel bleibt offen)');
  ok(r.lu === 'none' && r.luPanel === 'none', 'Gefiltertes Modul versteckt auch sein offenes Panel');
}
await page.evaluate(() => { document.getElementById('searchInp').value = ''; filterRows(); });
ok(await page.evaluate(() => document.getElementById('fbp-lu_tabelle').style.display !== 'none'), 'Filter weg → offenes Panel wieder sichtbar');

console.log('■ «Meine Feedbacks»-Filter (nur eigene Punkte)');
// eigenen Feedback-Punkt (author = Name des eingeloggten Users «Test User») ergänzen
await page.evaluate(() => {
  const arr = JSON.parse(_GemaDB.c['feedback_lu_tabelle']);
  arr.push({ type: 'kommentar', author: 'Test User', text: 'Mein eigener Punkt', ts: '17.07.26, 10:00' });
  _GemaDB.c['feedback_lu_tabelle'] = JSON.stringify(arr);
  renderAll();
});
await page.click('.fb[data-f="mine"]');
ok(await page.evaluate(() => document.body.classList.contains('beta-mine-only')), 'Body-Klasse beta-mine-only aktiv');
{
  const r = await page.evaluate(() => ({
    lu: document.querySelector('tr[data-id=lu_tabelle]').style.display,
    dd: document.querySelector('tr[data-id=druckdispositiv]').style.display,
    open: document.getElementById('fbp-lu_tabelle').dataset.open,
    mineVis: (() => { const c = document.querySelector('#cl-lu_tabelle .fb-card.fb-mine'); return !!c && getComputedStyle(c).display !== 'none'; })(),
    otherHidden: (() => { const c = document.querySelector('#cl-lu_tabelle .fb-card:not(.fb-mine)'); return !!c && getComputedStyle(c).display === 'none'; })()
  }));
  ok(r.lu !== 'none', 'Modul mit eigenem Feedback bleibt sichtbar');
  ok(r.dd === 'none', 'Modul nur mit fremdem Feedback wird ausgeblendet');
  ok(r.open === '1', 'Panel des eigenen Moduls automatisch aufgeklappt');
  ok(r.mineVis, 'Eigene Feedback-Karte (.fb-mine) sichtbar');
  ok(r.otherHidden, 'Fremde Feedback-Karten ausgeblendet');
}
await page.evaluate(() => document.querySelector('.fb[data-f="all"]').click());
ok(await page.evaluate(() => !document.body.classList.contains('beta-mine-only')
  && document.querySelector('tr[data-id=druckdispositiv]').style.display !== 'none'), 'Filter «Alle» → beta-mine-only weg, fremde Module wieder sichtbar');

console.log('■ «Feedback umsetzen» — Export-Freigabe pro Punkt');
{
  await page.evaluate(() => {
    _GemaDB.c['feedback_lu_tabelle'] = JSON.stringify([
      { type: 'fehler', author: 'Robin', text: 'Umsetzen-Punkt 1', ts: '17.07.26, 11:00' },
      { type: 'kommentar', author: 'Robin', text: 'Umsetzen-Punkt 2', ts: '17.07.26, 11:05' }
    ]);
    mState('lu_tabelle').comments = [];
    renderAll();
    toggleFbPanel('lu_tabelle');
  });
  ok(await page.evaluate(() => {
    const b = [...document.querySelectorAll('#cl-lu_tabelle .um-lbl input')];
    return b.length === 2 && b.every(x => !x.checked);
  }), 'Jeder Feedback-Punkt hat eine Checkbox — standardmässig NICHT angehakt');
  ok(await page.evaluate(() => (document.querySelector('#cl-lu_tabelle .um-lbl').textContent || '').trim() === 'Feedback umsetzen'), 'Beschriftung lautet «Feedback umsetzen»');
  ok(await page.evaluate(() => document.querySelectorAll('#cl-lu_tabelle .fb-card.fb-um').length === 0), 'Ohne Haken keine Umsetzen-Markierung an der Karte');

  // Anhaken → landet im Datensatz, Karte + Kopfzeile ziehen nach
  await page.evaluate(() => document.querySelector('#cl-lu_tabelle .um-lbl input').click());
  ok(await page.evaluate(() => JSON.parse(_GemaDB.c['feedback_lu_tabelle'])[0].umsetzen === true), 'Haken wird als umsetzen:true im Feedback-Datensatz gespeichert');
  ok(await page.evaluate(() => {
    const c = document.querySelector('#cl-lu_tabelle .fb-card');
    return c.classList.contains('fb-um') && c.querySelector('.um-lbl').classList.contains('on');
  }), 'Karte wird sichtbar als «wird umgesetzt» markiert');
  ok(await page.evaluate(() => (document.getElementById('umc-lu_tabelle').textContent || '').indexOf('1 für Umsetzung markiert') >= 0), 'Panel-Kopf zählt die markierten Punkte');

  // Fokus-Regel: nur die betroffene Karte wird nachgezogen, die Liste NICHT
  // neu gebaut (sonst reisst das Durchklicken den Scroll-Stand).
  await page.evaluate(() => { document.querySelectorAll('#cl-lu_tabelle .fb-card')[1].dataset.probe = '1'; });
  await page.evaluate(() => document.querySelector('#cl-lu_tabelle .um-lbl input').click());
  ok(await page.evaluate(() => document.querySelectorAll('#cl-lu_tabelle .fb-card')[1].dataset.probe === '1'), 'Klick zeichnet nur die Karte nach (kein Listen-Rebuild)');
  ok(await page.evaluate(() => {
    const e = JSON.parse(_GemaDB.c['feedback_lu_tabelle'])[0];
    return !('umsetzen' in e) && !document.querySelector('#cl-lu_tabelle .fb-card').classList.contains('fb-um');
  }), 'Abhaken entfernt das Feld wieder');

  // Haken überlebt einen vollen Re-Render
  await page.evaluate(() => {
    document.querySelector('#cl-lu_tabelle .um-lbl input').click();
    renderAll();
    toggleFbPanel('lu_tabelle');
  });
  ok(await page.evaluate(() =>
    document.querySelector('#cl-lu_tabelle .um-lbl input').checked === true &&
    document.querySelector('#cl-lu_tabelle .fb-card').classList.contains('fb-um') &&
    (document.getElementById('umc-lu_tabelle').textContent || '').indexOf('1 für Umsetzung') >= 0
  ), 'Haken + Zähler überleben renderAll()');

  // Bulk über die Mehrfachauswahl
  await page.evaluate(() => { fbSelAll('lu_tabelle'); fbBulkUmsetzen(true); });
  ok(await page.evaluate(() => JSON.parse(_GemaDB.c['feedback_lu_tabelle']).every(e => e.umsetzen === true)), 'Bulk «🎯 Umsetzen» markiert alle ausgewählten Punkte');
  ok(await page.evaluate(() => fbSelCount() === 0 && !document.getElementById('fbBulkbar').classList.contains('show')), 'Bulk leert die Auswahl und schliesst die Leiste');
  await page.evaluate(() => { fbSelAll('lu_tabelle'); fbBulkUmsetzen(false); });
  ok(await page.evaluate(() => JSON.parse(_GemaDB.c['feedback_lu_tabelle']).every(e => !('umsetzen' in e))), 'Bulk «☐ Nicht umsetzen» entfernt die Markierung wieder');

  // Manuelle Board-Kommentare kennen keine Umsetzung (der Export liest sie nicht)
  await page.evaluate(() => {
    document.getElementById('cta-lu_tabelle').value = 'Nur eine Notiz';
    document.getElementById('cauthor-lu_tabelle').value = 'Tester';
    addComment('lu_tabelle', 'LU / Spitzenvolumenstrom');
  });
  ok(await page.evaluate(() =>
    document.querySelectorAll('#cl-lu_tabelle .fb-card').length === 3 &&
    document.querySelectorAll('#cl-lu_tabelle .um-lbl').length === 2
  ), 'Manueller Kommentar bekommt KEINE «Feedback umsetzen»-Checkbox');
}

// Alle drei Status gleichzeitig: rot · gelb · grün nebeneinander.
// Steht bewusst zuletzt — der Block setzt die Kommentare des Moduls neu.
console.log('■ Ampel auf Modulebene: offen · in Arbeit · erledigt');
{
  const drei = await page.evaluate(() => {
    // Zustand vollständig neu setzen (nicht den gewachsenen weiterverwenden),
    // damit der Check unabhängig von den Schritten davor ist.
    _GemaDB.c['feedback_lu_tabelle'] = JSON.stringify([
      { type: 'fehler', author: 'Robin', text: 'noch offen', ts: '17.07.26, 08:00', cStatus: 'offen' },
      { type: 'kommentar', author: 'Robin', text: 'wird bearbeitet', ts: '17.07.26, 08:05', cStatus: 'bearbeitung' }
    ]);
    mState('lu_tabelle').comments = [{ id: 'x1', text: 'fertig', author: 'T', ts: Date.now(), cStatus: 'erledigt' }];
    renderAll();
    const btn = document.querySelector('tr[data-id=lu_tabelle] .comment-toggle');
    return {
      o: (btn.querySelector('.cb-c-open') || {}).textContent,
      a: (btn.querySelector('.cb-c-arbeit') || {}).textContent,
      d: (btn.querySelector('.cb-c-done') || {}).textContent,
      filter: countOpenComments('lu_tabelle')
    };
  });
  ok(drei.o === '1' && drei.a === '1' && drei.d === '1', 'Alle drei Status nebeneinander (1 offen · 1 in Arbeit · 1 erledigt)');
  // Der Filter «Offene Kommentare» zählt weiterhin beides — in Arbeit ist
  // noch nicht erledigt, nur eben nicht mehr rot.
  ok(drei.filter === 2, 'Filter «Offene Kommentare» zählt «In Arbeit» weiterhin mit');
}

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
