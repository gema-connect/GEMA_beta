// Native Screens (Feedback 26.07.2026): Bottom-Navbar überall, Chat als
// Vollbild-Overlay, Firmenlogo oben links, Favoriten als Kacheln.
//
//  1) Die schwebende Leiste (Mitteilungen · Chat · Übersicht) wird zentral in
//     gema_native_mobil.js injiziert und steht damit auf JEDEM nativen Screen —
//     vorher gab es sie nur auf dem Startbildschirm, Glocke und Chat waren in
//     den Modulen unerreichbar (die .g-nav ist im Native-Modus ausgeblendet).
//  2) Chat: Das Panel beginnt normal bei top:72px (Platz für die .g-nav). Die
//     ist hier weg → dort schaute der Screen durch, auf dem Startbildschirm
//     genau der Avatar: ein Tap landete in sys_profil («ich lande in den
//     Einstellungen»). Jetzt Vollbild über allem, Schliessen navigiert nicht.
//  3) Firmenlogo (org.logoVector || org.logo) oben links.
//
// Aufruf:  CHROME=<chromium> node scripts/native_navbar_chat_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const LOGO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='34'><rect width='120' height='34' fill='%230f766e'/></svg>";
const PHONE = { width: 390, height: 844 };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function open(pfad, extra) {
  const s = seed(['role_admin']);
  s.gema_orgs_v1 = [{ id: 'org_test', name: 'Muster Haustechnik AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_test'], active: true, logo: LOGO }];
  // Coachmark-Touren stilllegen — ihr Backdrop fängt sonst jeden Klick ab
  ['index', 'if_werkzeug', 'pm_stunden', 'pm_einsatzplan', 'if_fahrzeug', 'sys_workspace']
    .forEach(k => { s['gema_coachmarks_done_' + k] = '1'; });
  Object.assign(s, extra || {});
  const { ctx, page } = await newPage(browser, s);
  await page.setViewportSize(PHONE);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + pfad, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}

console.log('■ 1 · Bottom-Navbar auf JEDEM nativen Screen');
for (const [pfad, name] of [['/index.html', 'Startbildschirm'], ['/if_werkzeug.html', 'Werkzeug'], ['/pm_stunden.html', 'Stundenerfassung'], ['/pm_einsatzplan.html', 'Termine'], ['/if_fahrzeug.html', 'Fahrzeug']]) {
  const { ctx, page, errs } = await open(pfad);
  const r = await page.evaluate(() => {
    const bar = document.querySelector('.gn--page .gn-navbar');
    if (!bar) return { da: false };
    const cs = getComputedStyle(bar);
    const rect = bar.getBoundingClientRect();
    return {
      da: true,
      knoepfe: bar.querySelectorAll('.gn-pill-btn').length,
      notify: !!bar.querySelector('[data-nat-notify]'),
      chat: !!bar.querySelector('[data-nat-chat]'),
      home: !!bar.querySelector('[data-nat-nav-home]'),
      sichtbar: cs.display !== 'none' && rect.width > 0,
      untenImBild: rect.bottom <= innerHeight + 1 && rect.top > innerHeight / 2,
      doppelt: document.querySelectorAll('.gn--page .gn-navbar').length
    };
  });
  ok(r.da && r.knoepfe === 3 && r.notify && r.chat && r.home, name + ': Navbar mit Mitteilungen/Chat/Übersicht');
  ok(r.da && r.sichtbar && r.untenImBild, name + ': Leiste sichtbar am unteren Rand');
  ok(r.doppelt === 1, name + ': genau EINE Leiste (keine doppelte Injektion)');
  ok(errs.length === 0, name + ': keine JS-Fehler' + (errs.length ? ' — ' + errs[0].slice(0, 90) : ''));
  await ctx.close();
}

console.log('■ 2 · Navbar überlebt Re-Render und führt Zähler nach');
{
  const notif = [{ id: 'n1', eventKey: 'werkzeug_defekt', empfaengerUserId: 'u_test', modul: 'werkzeug', typ: 'warnung', titel: 'Defekt', text: 'x', gelesen: false, ts: new Date().toISOString() }];
  const { ctx, page, errs } = await open('/if_werkzeug.html', { gema_notifications_v1: JSON.stringify(notif) });
  ok(await page.evaluate(() => (document.querySelector('.gn--page .gn-navbar .gn-pill-dot') || {}).textContent === '1'), 'Ungelesen-Zähler auf der Glocke');
  await page.evaluate(() => { if (window.renderList) renderList(); });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.querySelectorAll('.gn--page .gn-navbar').length === 1), 'nach Re-Render weiterhin genau eine Leiste');
  await page.evaluate(() => GemaNotify.markAllRead());
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.querySelector('.gn--page .gn-navbar .gn-pill-dot')), 'Zähler verschwindet, sobald gelesen (ohne Re-Render)');
  ok(errs.length === 0, 'keine JS-Fehler');
  await ctx.close();
}

console.log('■ 3 · Chat: Vollbild-Overlay, Schliessen bleibt am selben Ort');
{
  const { ctx, page, errs } = await open('/if_werkzeug.html');
  const vorher = page.url();
  await page.click('.gn--page .gn-navbar [data-nat-chat]');
  await page.waitForTimeout(500);
  const c = await page.evaluate(() => {
    const p = document.querySelector('.gc-panel');
    if (!p) return { da: false };
    const cs = getComputedStyle(p), r = p.getBoundingClientRect();
    return {
      da: true, offen: p.classList.contains('open'),
      top: r.top, left: r.left, breite: r.width, hoehe: r.height,
      z: +cs.zIndex, vw: innerWidth, vh: innerHeight,
      // Liegt an der Stelle des Panels wirklich das Panel (nichts klickt durch)?
      obenTrifft: (document.elementFromPoint(innerWidth - 30, 30) || {}).closest ? !!document.elementFromPoint(innerWidth - 30, 30).closest('.gc-panel') : false
    };
  });
  ok(c.da && c.offen, 'Chat-Panel öffnet');
  ok(c.top === 0, 'Panel beginnt bei top:0 — VOLLBILD (vorher 72px Lücke)');
  ok(c.breite >= c.vw - 1 && c.hoehe >= c.vh - 1, 'Panel deckt den ganzen Screen (' + Math.round(c.breite) + '×' + Math.round(c.hoehe) + ')');
  ok(c.z > 900, 'Panel liegt über dem nativen Screen (z-index ' + c.z + ')');
  ok(c.obenTrifft, 'oben rechts trifft das Panel — kein Durchtippen auf den Avatar darunter');
  // Schliessen → gleiche Seite, kein Sprung in die Einstellungen
  await page.evaluate(() => { try { GemaChat.close(); } catch (e) {} });
  await page.waitForTimeout(500);
  ok(page.url() === vorher, 'nach dem Schliessen dieselbe Seite (nicht sys_profil)');
  ok(await page.evaluate(() => !!document.querySelector('.gn--page') && getComputedStyle(document.querySelector('.gn--page')).display !== 'none'), 'nativer Screen wieder da');
  ok(errs.length === 0, 'keine JS-Fehler');
  await ctx.close();
}

console.log('■ 4 · Chat vom Startbildschirm: Avatar liegt NICHT mehr frei');
{
  const { ctx, page, errs } = await open('/index.html');
  const vorher = page.url();
  await page.click('.gn--page .gn-navbar [data-nat-chat]');
  await page.waitForTimeout(500);
  const t = await page.evaluate(() => {
    const av = document.querySelector('.gn--page .gn-avatar');
    const r = av.getBoundingClientRect();
    const treffer = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { avatarVerdeckt: !!(treffer && treffer.closest && treffer.closest('.gc-panel')) };
  });
  ok(t.avatarVerdeckt, 'Chat verdeckt den Avatar (früher führte ein Tap dort in die Einstellungen)');
  await page.evaluate(() => { try { GemaChat.close(); } catch (e) {} });
  await page.waitForTimeout(600);
  ok(page.url() === vorher && /index\.html/.test(page.url()), 'Schliessen bleibt auf dem Startbildschirm');
  ok(errs.length === 0, 'keine JS-Fehler');
  await ctx.close();
}

console.log('■ 5 · Firmenlogo oben links');
for (const [pfad, name, sel] of [['/index.html', 'Startbildschirm', '.gn-header'], ['/if_werkzeug.html', 'Modul-Screen', '.gn-toolbar']]) {
  const { ctx, page } = await open(pfad);
  const l = await page.evaluate((sel) => {
    const img = document.querySelector('.gn--page .gn-orglogo');
    if (!img) return { da: false };
    const r = img.getBoundingClientRect();
    const host = img.closest(sel);
    const hr = host ? host.getBoundingClientRect() : null;
    return { da: true, src: img.getAttribute('src').slice(0, 22), imHost: !!host, abstand: hr ? r.left - hr.left : 0,
      // Startbildschirm: ganz links. Modul-Screen: direkt NACH der Zurück-Taste
      // (die bleibt iOS-konform am linken Rand) — daher der grössere Spielraum.
      links: hr ? (r.left - hr.left) < 90 : false, oben: r.top < innerHeight / 3, hoehe: r.height };
  }, sel);
  ok(l.da, name + ': Logo vorhanden');
  ok(l.da && l.imHost && l.links, name + ': sitzt links im ' + sel + ' (' + Math.round(l.abstand || 0) + 'px vom Rand)');
  ok(l.da && l.oben && l.hoehe > 10, name + ': oben und sichtbar (' + Math.round(l.hoehe || 0) + 'px hoch)');
  await ctx.close();
}
{
  // Ohne hinterlegtes Logo: KEIN Platzhalter
  const s = seed(['role_admin']);
  ['index', 'if_werkzeug'].forEach(k => { s['gema_coachmarks_done_' + k] = '1'; });
  const { ctx, page } = await newPage(browser, s);
  await page.setViewportSize(PHONE);
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  ok(await page.evaluate(() => !document.querySelector('.gn--page .gn-orglogo')), 'ohne Firmenlogo bleibt der Kopf leer (kein Platzhalter)');
  await ctx.close();
}

console.log('■ 6 · Desktop-Gegenprobe (nichts davon greift am grossen Bildschirm)');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !document.querySelector('.gn--page .gn-navbar') || getComputedStyle(document.querySelector('.gn--page')).display === 'none'), 'Desktop: keine native Leiste');
  ok(await page.evaluate(() => !document.documentElement.classList.contains('gn-native-on')), 'Desktop: klassische Ansicht');
  await ctx.close();
}

await browser.close(); server.close();
console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + (pass + fail) + ' Checks FEHLGESCHLAGEN') : ('✅ ' + (pass + fail) + '/' + (pass + fail) + ' Checks')));
process.exit(fail ? 1 : 0);
