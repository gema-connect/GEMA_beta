// GEMA Native — iPhone-Ansicht der MODULÜBERSICHT (index.html, Screen «Home»).
//
// Der Launcher folgt der Home-Zeile der Klassen-Kurzreferenz (README-native.md):
//   .gn-header · .gn-search (Command-Palette) · .gn-quick/.gn-chip ·
//   .gn-label + .gn-grid/.gn-tile je Kategorie · .gn-pill
// Kern der Prüfung: die Kacheln kommen AUS DEM DOM der Übersicht — sie folgen
// damit automatisch der Permission-Filterung und jeder neuen Modul-Kachel
// (ein zweiter Katalog würde driften). Dazu: Suche, Favoriten (Chips + Stern +
// Long-Press-Umschalten), Pill-Aktionen (Glocke/Chat/Workspace), Coachmarks
// stillgelegt, Desktop bleibt klassisch.
//
// Aufruf:  CHROME=<chromium> node scripts/native_home_smoke_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8893;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗ FAIL:', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'Muster Haustechnik AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [
  { id: 'u1', username: 'a@t.ch', name: 'Robin Muster', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } },
  { id: 'u2', username: 'm@t.ch', name: 'Max Keller', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'm@t.ch' } }
];
const jwt = uid => 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
  + Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 2592000, uid, org: 'org_t', role: 'authenticated' })).toString('base64url')
  + '.testsig';

function seed(uid, extra) {
  return Object.assign({
    gema_orgs_v1: JSON.stringify([ORG]),
    gema_users_v1: JSON.stringify(USERS),
    gema_session_v1: JSON.stringify({ userId: uid, expires: FUTURE, token: jwt(uid) }),
    gema_recent_v1: JSON.stringify([{ key: 'pm_objekte', ts: Date.now() }, { key: 'pm_erp', ts: Date.now() - 1000 }])
  }, extra || {});
}
function routeAll(c) {
  return c.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0)
      return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function open(uid, extra, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 390, height: 844 } });
  await routeAll(ctx);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed(uid, extra));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}
const natVisible = p => p.evaluate(() => { const r = document.querySelector('.gn--page'); return !!r && r.style.display !== 'none'; });

/* ════════ 1 · Aufbau nach der Home-Spezifikation ════════ */
console.log('— Home-Screen: Aufbau —');
{
  const { ctx, page, errs } = await open('u1');
  ok(errs.length === 0, 'Boot ohne pageerrors' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''));
  ok(await natVisible(page), 'Native-Screen sichtbar (Phone 390×844)');
  ok(await page.evaluate(() => document.documentElement.classList.contains('gn-native-on')), 'html.gn-native-on gesetzt (klassische Nav ausgeblendet)');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.g-nav')).display === 'none'), '.g-nav ist im Native-Modus wirklich unsichtbar');

  const s = await page.evaluate(() => {
    const r = document.querySelector('.gn--page');
    return {
      header: !!r.querySelector('.gn-header .gn-hello') && !!r.querySelector('.gn-header .gn-name'),
      name: (r.querySelector('.gn-name') || {}).textContent,
      hello: (r.querySelector('.gn-hello') || {}).textContent,
      avatar: (r.querySelector('.gn-avatar') || {}).textContent,
      such: !!r.querySelector('.gn-search[data-gn-cmd-open]'),
      kbd: (r.querySelector('.gn-search kbd') || {}).textContent,
      label: r.querySelectorAll('.gn-screen > .gn-label').length,
      grids: r.querySelectorAll('.gn-grid').length,
      tiles: r.querySelectorAll('.gn-tile').length,
      pill: r.querySelectorAll('.gn-pill .gn-pill-btn').length,
      scroll: !!r.querySelector('[data-gn-scroll]')
    };
  });
  ok(s.header, '.gn-header mit Gruss + Name');
  ok(s.name === 'Robin Muster', 'Name des eingeloggten Users («' + s.name + '»)');
  ok(/Gute[nr]? (Morgen|Tag|Nachmittag|Abend)|Gute Nacht/.test(s.hello) && s.hello.indexOf('Muster Haustechnik AG') >= 0, 'Gruss + Firma («' + s.hello + '»)');
  ok(s.avatar === 'RM', 'Avatar zeigt die Initialen');
  ok(s.such, '.gn-search öffnet die Command-Palette');
  ok(+s.kbd > 20, 'Modul-Zähler im Suchfeld (' + s.kbd + ')');
  ok(s.grids >= 8 && s.tiles > 20, 'Springboard: ' + s.grids + ' Kategorien / ' + s.tiles + ' Kacheln');
  ok(s.label >= s.grids, 'jede Kachelgruppe hat ein .gn-label');
  ok(s.pill === 3, 'Schwebende Leiste mit 3 Aktionen');
  ok(s.scroll, 'Scrollfläche [data-gn-scroll] vorhanden (Position bleibt beim Re-Render)');

  /* KEINE Zurück-Taste auf dem Startbildschirm (der Screen IST die Wurzel) */
  ok(await page.evaluate(() => !document.querySelector('.gn--page [data-gn-back]')), 'Startbildschirm ohne Zurück-Taste');

  /* Kacheln = genau die sichtbaren Modul-Kacheln der Übersicht (kein zweiter Katalog) */
  const cmp = await page.evaluate(() => {
    const dom = Array.from(document.querySelectorAll('main a.mod-card[data-module]'))
      .filter(a => !a.getAttribute('data-perm-hidden') && !a.closest('#fav'))
      .map(a => a.getAttribute('href'));
    const nat = Array.from(document.querySelectorAll('.gn--page .gn-tile')).map(t => t.getAttribute('data-nat-href'));
    return { dom: dom.length, nat: nat.length, fehlt: dom.filter(h => nat.indexOf(h) < 0) };
  });
  ok(cmp.nat === cmp.dom && cmp.fehlt.length === 0, 'Kacheln 1:1 aus der Übersicht (' + cmp.nat + '/' + cmp.dom + ')' + (cmp.fehlt.length ? ' fehlt: ' + cmp.fehlt.join(',') : ''));

  /* Kategorie-Farbverläufe */
  const grad = await page.evaluate(() => {
    const g = {};
    document.querySelectorAll('.gn--page .gn-grid').forEach(gr => {
      const lbl = gr.previousElementSibling ? gr.previousElementSibling.textContent : '';
      const ic = gr.querySelector('.gn-tile-ic');
      if (ic) g[lbl] = ic.style.getPropertyValue('--gn-tile-bg');
    });
    return g;
  });
  ok(Object.values(grad).every(v => /^var\(--gn-c-/.test(v)), 'jede Kachel trägt einen Kit-Farbverlauf');
  ok(new Set(Object.values(grad)).size >= 6, 'Kategorien sind farblich unterscheidbar (' + new Set(Object.values(grad)).size + ' Verläufe)');
  ok(await page.evaluate(() => {
    const bg = getComputedStyle(document.querySelector('.gn--page .gn-tile-ic')).backgroundImage;
    return /gradient/.test(bg);
  }), 'Verlauf ist wirklich gerendert (nicht nur als Variable gesetzt)');

  /* Coachmarks: die Tour zeigt auf Filter-/Suchleiste, die unter dem Screen liegen */
  ok(await page.evaluate(() => localStorage.getItem('gema_coachmarks_done_index') === '1'), 'Coachmarks-Tour im Native-Modus stillgelegt');

  await ctx.close();
}

/* ════════ 2 · Command-Palette (Suche) ════════ */
console.log('— Command-Palette —');
{
  const { ctx, page, errs } = await open('u1');
  await page.click('.gn--page .gn-search');
  await page.waitForTimeout(350);
  ok(await page.evaluate(() => document.querySelector('.gn--page .gn-cmd').classList.contains('is-open')), 'Palette öffnet');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('gn-cmd-input')), 'Eingabefeld ist fokussiert');
  const alle = await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-res] .gn-cmd-item').length);
  ok(alle > 20, 'ohne Eingabe stehen alle Module in der Liste (' + alle + ')');
  ok(await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-res] .gn-cmd-group').length >= 8), 'Treffer nach Kategorie gruppiert');

  await page.fill('.gn--page .gn-cmd-input', 'fahrzeug');
  await page.waitForTimeout(200);
  const t1 = await page.evaluate(() => Array.from(document.querySelectorAll('.gn--page [data-nat-res] .gn-cmd-item')).map(i => i.getAttribute('data-nat-href')));
  ok(t1.length >= 1 && t1.length < 8, 'Suche «fahrzeug» grenzt ein (' + t1.length + ' Treffer)');
  ok(t1.indexOf('if_fahrzeug.html') >= 0, 'passender Treffer dabei («' + t1.join(', ') + '»)');

  /* Volltext: die Suche greift auf den ganzen Kachel-Text (Stichpunkte/Normen) */
  await page.fill('.gn--page .gn-cmd-input', 'QR-Rechnung');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('.gn--page [data-nat-res] .gn-cmd-item'));
    return a.length > 0 && a.some(x => x.getAttribute('data-nat-href') === 'pm_erp.html');
  }), 'Volltextsuche findet über Stichpunkte (QR-Rechnung → ERP)');

  await page.fill('.gn--page .gn-cmd-input', 'xyzgibtsnicht');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => /Kein Modul gefunden/.test(document.querySelector('.gn--page [data-nat-res]').textContent)), 'klare Meldung ohne Treffer');

  /* Treffer öffnet das Modul */
  await page.fill('.gn--page .gn-cmd-input', 'Objekte');
  await page.waitForTimeout(200);
  await page.click('.gn--page [data-nat-res] .gn-cmd-item[data-nat-href="pm_objekte.html"]');
  await page.waitForTimeout(900);
  ok(/pm_objekte\.html/.test(page.url()), 'Klick auf einen Treffer öffnet das Modul (' + page.url().split('/').pop() + ')');
  ok(errs.length === 0, 'keine pageerrors' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''));
  await ctx.close();
}

/* ════════ 3 · Favoriten + Zuletzt verwendet ════════ */
console.log('— Schnellzugriff: Favoriten & zuletzt verwendet —');
{
  const { ctx, page, errs } = await open('u1', { gema_favourites_u1: JSON.stringify(['pm_erp.html', 'pm_stunden.html']) });
  // Favoriten sind seit 26.07.2026 KACHELN (gelber Rahmen) und stehen NUR oben
  const q = await page.evaluate(() => {
    const r = document.querySelector('.gn--page');
    const favGrid = r.querySelector('.gn-grid--fav');
    const rows = Array.from(r.querySelectorAll('.gn-quick'));
    const alle = Array.from(r.querySelectorAll('.gn-tile')).map(t => t.getAttribute('data-nat-href'));
    return {
      favLabel: favGrid ? favGrid.previousElementSibling.textContent : '',
      favs: favGrid ? Array.from(favGrid.querySelectorAll('.gn-tile')).map(c => c.getAttribute('data-nat-href')) : [],
      favKlasse: favGrid ? Array.from(favGrid.querySelectorAll('.gn-tile')).every(t => t.classList.contains('gn-tile--fav')) : false,
      quickReihen: rows.length,
      quickLabel: rows[0] ? rows[0].previousElementSibling.textContent : '',
      recent: rows[0] ? Array.from(rows[0].querySelectorAll('.gn-chip')).map(c => c.getAttribute('data-nat-href')) : [],
      // Doppelte: eine href darf nur EINMAL als Kachel vorkommen
      doppelt: alle.filter((h, i) => alle.indexOf(h) !== i)
    };
  });
  ok(q.favLabel === 'Favoriten' && q.favs.length === 2, 'Favoriten als eigene Kachel-Gruppe');
  ok(q.favs.indexOf('pm_erp.html') >= 0 && q.favs.indexOf('pm_stunden.html') >= 0, 'Favoriten-Kacheln aus dem per-User-Cache');
  ok(q.favKlasse, 'Favoriten-Kacheln tragen .gn-tile--fav (gelber Rahmen)');
  ok(!q.doppelt.length, 'KEIN Favorit erscheint doppelt in seiner Kategorie (' + (q.doppelt.join(', ') || 'keine Doppel') + ')');
  ok(q.quickReihen === 1 && q.quickLabel === 'Zuletzt verwendet', 'nur noch eine Chip-Zeile («Zuletzt verwendet»)');
  ok(q.recent.indexOf('pm_objekte.html') >= 0, 'zuletzt verwendet aus GemaRecent');
  ok(q.recent.indexOf('pm_erp.html') < 0, 'ein Favorit erscheint nicht doppelt in «Zuletzt»');

  /* Long-Press (Desktop: Rechtsklick) → Kontextmenü mit Favoriten-Umschalter */
  await page.dispatchEvent('.gn--page .gn-tile[data-nat-href="pm_erp.html"]', 'contextmenu');
  await page.waitForTimeout(350);
  const c1 = await page.evaluate(() => ({
    offen: document.querySelector('.gn--page .gn-ctx-backdrop').classList.contains('is-open'),
    titel: document.querySelector('.gn--page [data-gn-ctx-title]').textContent,
    fav: document.querySelector('.gn--page [data-nat-favlabel]').textContent.trim()
  }));
  ok(c1.offen, 'Kontextmenü öffnet');
  ok(/Offerten|Aufträge|Rechnungen/.test(c1.titel), 'Modulname in der Vorschau («' + c1.titel + '»)');
  ok(/Favorit entfernen/.test(c1.fav), 'Beschriftung folgt dem Favoriten-Stand');

  await page.click('.gn--page [data-nat-ctx="fav"]');
  await page.waitForTimeout(500);
  const nachher = await page.evaluate(() => {
    const fg = document.querySelector('.gn--page .gn-grid--fav');
    return {
      liste: (window._favHooks && _favHooks.get()) || [],
      favKacheln: fg ? Array.from(fg.querySelectorAll('.gn-tile')).map(c => c.getAttribute('data-nat-href')) : [],
      markiert: !!document.querySelector('.gn--page .gn-tile[data-nat-href="pm_erp.html"].gn-tile--fav'),
      wiederInKategorie: !!document.querySelector('.gn--page .gn-grid:not(.gn-grid--fav) .gn-tile[data-nat-href="pm_erp.html"]')
    };
  });
  ok(nachher.liste.indexOf('pm_erp.html') < 0, 'Favorit wurde entfernt (im echten Favoriten-Store)');
  ok(!nachher.markiert, 'gelber Rahmen von der Kachel verschwunden');
  ok(nachher.favKacheln.length === 1 && nachher.favKacheln[0] === 'pm_stunden.html', 'Favoriten-Gruppe neu gezeichnet (nur noch 1 Kachel)');
  ok(nachher.wiederInKategorie, 'entfernter Favorit steht wieder in seiner Kategorie');

  /* umgekehrt: neuen Favoriten setzen */
  await page.dispatchEvent('.gn--page .gn-tile[data-nat-href="pm_objekte.html"]', 'contextmenu');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => /Als Favorit/.test(document.querySelector('.gn--page [data-nat-favlabel]').textContent)), 'Beschriftung «Als Favorit» bei Nicht-Favorit');
  await page.click('.gn--page [data-nat-ctx="fav"]');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => ((window._favHooks && _favHooks.get()) || []).indexOf('pm_objekte.html') >= 0), 'neuer Favorit gesetzt');
  ok(await page.evaluate(() => !!document.querySelector('.gn--page .gn-grid--fav .gn-tile[data-nat-href="pm_objekte.html"].gn-tile--fav')), 'neue Favoriten-Kachel mit gelbem Rahmen erscheint');
  ok(await page.evaluate(() => localStorage.getItem('gema_favourites_u1').indexOf('pm_objekte.html') >= 0), 'im per-User-Cache gespeichert');

  /* Long-Press darf nicht navigieren */
  ok(/index\.html/.test(page.url()), 'Long-Press öffnet das Modul NICHT');
  ok(errs.length === 0, 'keine pageerrors' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''));
  await ctx.close();
}

/* ════════ 4 · Schwebende Leiste (Glocke / Chat / Workspace) ════════ */
console.log('— Schwebende Aktionsleiste —');
{
  const notif = [
    { id: 'n1', eventKey: 'regie_eingereicht', empfaengerUserId: 'u1', modul: 'regierapport', typ: 'aktion', titel: 'Rapport', text: 'neu', gelesen: false, ts: new Date().toISOString() },
    { id: 'n2', eventKey: 'regie_eingereicht', empfaengerUserId: 'u1', modul: 'regierapport', typ: 'aktion', titel: 'Rapport 2', text: 'neu', gelesen: false, ts: new Date().toISOString() }
  ];
  const { ctx, page, errs } = await open('u1', { gema_notifications_v1: JSON.stringify(notif) });
  ok(await page.evaluate(() => (document.querySelector('.gn--page .gn-pill-dot') || {}).textContent === '2'), 'Ungelesen-Zähler auf der Glocke');
  await page.click('.gn--page [data-nat-notify]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => {
    const p = document.querySelector('.gn-panel');
    return !!p && p.classList.contains('open') && getComputedStyle(p).display !== 'none';
  }), 'Mitteilungs-Panel öffnet ÜBER dem Screen (Glocke wäre sonst unerreichbar)');
  ok(await page.evaluate(() => +getComputedStyle(document.querySelector('.gn-panel')).zIndex > 900), 'Panel liegt über dem Native-Screen');

  await page.evaluate(() => { const b = document.querySelector('.g-nav .gn-btn'); if (b) b.click(); });   // Panel schliessen
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__chatOpen = 0; if (window.GemaChat) { const o = GemaChat.open; GemaChat.open = function () { window.__chatOpen++; return o.apply(this, arguments); }; } });
  await page.click('.gn--page [data-nat-chat]');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__chatOpen === 1), 'Chat-Knopf ruft GemaChat.open()');
  ok(await page.evaluate(() => {
    const p = document.querySelector('.gc-panel');
    return !!p && p.classList.contains('open') && +getComputedStyle(p).zIndex > 900;
  }), 'Chat-Panel liegt über dem Native-Screen');
  await page.evaluate(() => { try { GemaChat.close(); } catch (e) {} });
  await page.waitForTimeout(300);

  await page.click('.gn--page .gn-navbar [data-nat-nav-home]');
  await page.waitForTimeout(900);
  ok(/sys_workspace\.html/.test(page.url()), 'Workspace-Knopf navigiert');
  ok(errs.length === 0, 'keine pageerrors' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''));
  await ctx.close();
}

/* ════════ 4b · Rote Zahl am Modul (iPhone-Kanon) ════════ */
console.log('— Offene Mitteilungen als rote Zahl am Modul —');
{
  const t = new Date().toISOString();
  const notif = [
    // per Deep-Link zugeordnet
    { id: 'n1', eventKey: 'regie_eingereicht', empfaengerUserId: 'u1', modul: 'regierapport', typ: 'aktion', titel: 'Rapport', text: 'a', link: 'pm_regierapport.html?rr=1', gelesen: false, ts: t },
    { id: 'n2', eventKey: 'regie_eingereicht', empfaengerUserId: 'u1', modul: 'regierapport', typ: 'aktion', titel: 'Rapport', text: 'b', link: 'pm_regierapport.html?rr=2', gelesen: false, ts: t },
    { id: 'n3', eventKey: 'regie_freigegeben', empfaengerUserId: 'u1', modul: 'regierapport', typ: 'erfolg', titel: 'Rapport', text: 'c', link: 'pm_regierapport.html?rr=3', gelesen: false, ts: t },
    // ohne Link → über das modul-Feld
    { id: 'n4', eventKey: 'werkzeug_defekt', empfaengerUserId: 'u1', modul: 'werkzeug', typ: 'warnung', titel: 'Defekt', text: 'd', link: '', gelesen: false, ts: t },
    // gelesen → zählt nicht
    { id: 'n5', eventKey: 'werkzeug_defekt', empfaengerUserId: 'u1', modul: 'werkzeug', typ: 'warnung', titel: 'Defekt', text: 'e', link: '', gelesen: true, ts: t },
    // Modul ohne Kachel (Chat) → zählt nicht mit
    { id: 'n6', eventKey: 'chat_nachricht', empfaengerUserId: 'u1', modul: 'chat', typ: 'info', titel: 'Chat', text: 'f', link: 'index.html?chat=1', gelesen: false, ts: t }
  ];
  const { ctx, page, errs } = await open('u1', {
    gema_notifications_v1: JSON.stringify(notif),
    gema_favourites_u1: JSON.stringify(['pm_regierapport.html'])
  });
  const b = await page.evaluate(() => {
    const g = h => document.querySelector('.gn--page .gn-tile[data-nat-href="' + h + '"] .gn-badge-ios');
    const favB = document.querySelector('.gn--page .gn-grid--fav .gn-tile[data-nat-href="pm_regierapport.html"] .gn-badge-ios');
    const st = g('pm_regierapport.html') ? getComputedStyle(g('pm_regierapport.html')) : null;
    return {
      regie: g('pm_regierapport.html') ? g('pm_regierapport.html').textContent : '',
      wz: g('if_werkzeug.html') ? g('if_werkzeug.html').textContent : '',
      erp: !!g('pm_erp.html'),
      chip: favB ? favB.textContent : '',
      farbe: st ? st.backgroundColor : '',
      rund: st ? st.borderRadius : '',
      total: document.querySelectorAll('.gn--page .gn-tile .gn-badge-ios').length
    };
  });
  ok(b.regie === '3', 'Regierapporte trägt die «3» (Deep-Link-Zuordnung)');
  ok(b.wz === '1', 'Werkzeug trägt die «1» (Zuordnung über das modul-Feld)');
  ok(!b.erp, 'Module ohne offene Meldung bleiben ohne Abzeichen');
  ok(b.total === 2, 'genau 2 Kacheln mit Abzeichen — Chat hat keine Kachel und zählt nicht (Favoriten stehen nur einmal)');
  ok(b.chip === '3', 'auch die Favoriten-Kachel trägt die Zahl');
  ok(/rgb\(255,\s*59,\s*48\)/.test(b.farbe), 'iOS-Rot (' + b.farbe + ')');

  /* Favoriten-Markierung ist der gelbe Rahmen (kein ★ mehr) — die Zahl rechts
     oben bleibt frei stehen und wird vom Rahmen nicht verdeckt. */
  const pos = await page.evaluate(() => {
    const t = document.querySelector('.gn--page .gn-grid--fav .gn-tile[data-nat-href="pm_regierapport.html"]');
    const ic = t.querySelector('.gn-tile-ic');
    const n = ic.querySelector('.gn-badge-ios').getBoundingClientRect();
    const r = ic.getBoundingClientRect();
    return { rahmen: getComputedStyle(ic).boxShadow, keinStern: !ic.querySelector('.gn-tile-fav'), badgeRechts: n.left > r.left + r.width / 2 };
  });
  ok(/f5c04a|245,\s*192,\s*74/.test(pos.rahmen), 'Favoriten-Kachel hat den gelben Rahmen (' + pos.rahmen.slice(0, 42) + '…)');
  ok(pos.keinStern, 'kein ★ mehr — der Rahmen ist die Markierung');
  ok(pos.badgeRechts, 'Mitteilungs-Zahl sitzt weiterhin rechts oben');

  /* Live: gelesen markieren → Abzeichen verschwindet OHNE Re-Render */
  await page.evaluate(() => { window.__cmdMarker = 1; GemaNotify.markAllRead(); });
  await page.waitForTimeout(400);
  const nach = await page.evaluate(() => ({
    tiles: document.querySelectorAll('.gn--page .gn-tile .gn-badge-ios').length,
    pill: !!document.querySelector('.gn--page .gn-pill-dot'),
    marker: window.__cmdMarker            // überlebt = kein Re-Render der Seite
  }));
  ok(nach.tiles === 0 && !nach.pill, 'Abzeichen verschwinden, sobald alles gelesen ist');
  ok(nach.marker === 1, 'Aktualisierung läuft im DOM (kein Re-Render, offene Suche bliebe erhalten)');
  ok(errs.length === 0, 'keine pageerrors' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''));
  await ctx.close();
}

/* ════════ 5 · Kachel öffnet das Modul ════════ */
console.log('— Navigation —');
{
  const { ctx, page } = await open('u1');
  await page.click('.gn--page .gn-tile[data-nat-href="pm_objekte.html"]');
  await page.waitForTimeout(900);
  ok(/pm_objekte\.html/.test(page.url()), 'Kachel öffnet das Modul');
  await ctx.close();
}
{
  const { ctx, page } = await open('u1');
  await page.click('.gn--page .gn-avatar');
  await page.waitForTimeout(900);
  ok(/sys_profil\.html/.test(page.url()), 'Avatar führt ins Profil');
  await ctx.close();
}

/* ════════ 6 · Berechtigungen: der Screen erbt die Filterung der Übersicht ════════ */
console.log('— Rollen-Filterung —');
{
  const { ctx, page } = await open('u2');   // Monteur
  const m = await page.evaluate(() => {
    const r = document.querySelector('.gn--page');
    return {
      tiles: Array.from(r.querySelectorAll('.gn-tile')).map(t => t.getAttribute('data-nat-href')),
      labels: Array.from(r.querySelectorAll('.gn-screen > .gn-label')).map(l => l.textContent),
      kbd: (r.querySelector('.gn-search kbd') || {}).textContent
    };
  });
  ok(m.tiles.length > 0, 'Monteur sieht seine Module (' + m.tiles.length + ')');
  ok(m.tiles.indexOf('sys_admin.html') < 0 && m.labels.indexOf('Admin') < 0, 'keine Admin-Kategorie für den Monteur');
  ok(m.tiles.indexOf('pm_erp.html') < 0, 'kein ERP für den Monteur');
  ok(m.tiles.indexOf('if_werkzeug.html') >= 0, 'Werkzeugmanagement ist dabei');
  ok(+m.kbd === m.tiles.length, 'Zähler im Suchfeld = Anzahl freigeschalteter Module (' + m.kbd + ')');
  const p = await page.evaluate(() => {
    const doms = Array.from(document.querySelectorAll('main a.mod-card[data-module]'));
    return { versteckt: doms.filter(a => a.getAttribute('data-perm-hidden')).length };
  });
  ok(p.versteckt > 10, 'die Übersicht hat für den Monteur wirklich gefiltert (' + p.versteckt + ' Kacheln versteckt)');
  await ctx.close();
}

/* ════════ 7 · Einstellung + Desktop ════════ */
console.log('— Einstellung «App-Ansicht» und Desktop —');
{
  const { ctx, page } = await open('u1', { gema_native_view_v1: 'klassisch' });
  ok(!(await natVisible(page)), 'Einstellung «klassisch» → klassische Übersicht');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.g-nav')).display !== 'none'), 'Nav bleibt sichtbar');
  ok(await page.evaluate(() => document.querySelectorAll('main .mod-card').length > 20), 'klassische Kacheln gerendert');
  await ctx.close();
}
{
  const { ctx, page } = await open('u1', null, { width: 1280, height: 900 });
  ok(!(await natVisible(page)), 'Desktop (1280px) bleibt klassisch');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks');
process.exit(fail === 0 ? 0 : 1);
