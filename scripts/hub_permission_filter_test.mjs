/* Drift-Guard — «blende alle Module auch in der Standard-Ansicht aus, wenn die
 * jeweilige Rolle keinen Zugriff hat. Vergiss die Module, welche "bald" kommen,
 * nicht.» (User 24.08.2026)
 *
 * Ausgangslage: NUR index.html filterte (Feedback 21.08.2026). Die vier
 * uebrigen Uebersichtsseiten — sb_index, el_index, pm_ausschreibung, ab_index —
 * zeigten JEDER Rolle alle Kacheln, und ihre Suchen ebenso.
 *
 * Umsetzung: geteilter Helfer gema_kachel_filter.js (statt vier Kopien der
 * Filterlogik). Er loest den Modul-Key ueber FILE_MAP aus dem href auf,
 * behandelt «Bald»-Kacheln als OPT-IN (data-soon-fuer) und zieht Zaehler,
 * leere Kategorien samt Sprunglink und Hero-Zahlen nach.
 *
 * Aufruf: CHROME=<chromium> node scripts/hub_permission_filter_test.mjs
 */
import fs from 'fs';

let ok = 0, fail = 0;
const T = (name, cond, info) => {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? '  → ' + info : '')); }
};

const HUBS = ['sb_index.html', 'el_index.html', 'pm_ausschreibung.html', 'ab_index.html'];

/* ── A) Helfer existiert und traegt die Kernregeln ─────────────────── */
console.log('\n── A) gema_kachel_filter.js ──');
{
  const h = fs.readFileSync('gema_kachel_filter.js', 'utf8');
  T('loest den Modul-Key ueber FILE_MAP aus dem href auf',
    /getFileMap\(\)/.test(h) && /_datei\(href\)/.test(h));
  T('data-module hat Vorrang vor dem href',
    /getAttribute\('data-module'\)\s*\|\|\s*''/.test(h));
  T('«Bald» ist OPT-IN (data-soon-fuer + Recht)',
    /data-soon-fuer/.test(h) && /if\(sk && GemaAuth\.can\(sr,sk\)\) return;/.test(h));
  T('data-soon-recht steuert die Stufe, Default read',
    /getAttribute\('data-soon-recht'\)\|\|'read'/.test(h));
  T('data-perm-recht steuert die Stufe echter Kacheln, Default read',
    /getAttribute\('data-perm-recht'\)\|\|'read'/.test(h));
  T('role_admin sieht alles',
    /roleIds\.indexOf\('role_admin'\)/.test(h));
  T('Gratis-Konto wird gesperrt statt versteckt',
    /isFreeUser/.test(h) && /_sperre/.test(h));
  T('unbekannte Datei bleibt sichtbar (fail-open)',
    /if\(!key\) return;\s*\/\/ fail-open/.test(h));
  // KRITISCH: pm_ausschreibung/ab_index setzen bei leerer Suche display=''
  // auf ALLE .mod-card — ohne !important kaeme eine versteckte Kachel zurueck.
  T('Sichtbarkeit haengt an [data-perm-hidden]{display:none!important}',
    /\[data-perm-hidden\]\{display:none!important\}/.test(h));
  T('Marker data-perm-hidden bleibt gesetzt (wie in index.html)',
    /setAttribute\('data-perm-hidden','1'\)/.test(h));
  T('Zaehler wird nur bei «N Module» angefasst',
    /\^\\s\*\\d\+\\s\+Module\?\\s\*\$/.test(h));
  T('leere Kategorie blendet auch ihren Sprunglink aus',
    /a\[href="#'\+g\.id\+'"\]/.test(h));
  T('Hero: «∞» & Co. werden nie angefasst',
    /\^\\s\*\\d\+\\s\*\$/.test(h));
  T('darfDatei() fuer Suchen ohne DOM-Bezug exportiert',
    /darfDatei:darfDatei/.test(h));
  T('in sw.js registriert',
    /gema_kachel_filter\.js/.test(fs.readFileSync('sw.js', 'utf8')));
}

/* ── B) Alle vier Hubs sind verdrahtet ─────────────────────────────── */
console.log('\n── B) Verdrahtung der Hub-Seiten ──');
for (const f of HUBS) {
  const s = fs.readFileSync(f, 'utf8');
  T(f + ': laedt gema_kachel_filter.js', /src="gema_kachel_filter\.js"/.test(s));
  T(f + ': ruft GemaKachelFilter.auto()', /GemaKachelFilter\.auto\(\)/.test(s));
  T(f + ': laedt gema_auth.js (Voraussetzung)', /src="gema_auth\.js"/.test(s));
}
// Suchen, die NICHT ueber das DOM laufen, muessen selbst filtern.
for (const f of ['sb_index.html', 'el_index.html']) {
  const s = fs.readFileSync(f, 'utf8');
  T(f + ': ALL_MODULES-Suche filtert ueber darfDatei',
    /GemaKachelFilter\.darfDatei\(m\.url\)/.test(s));
}
{
  const ab = fs.readFileSync('ab_index.html', 'utf8');
  // ab_pruefungen + ab_pruefung_live teilen den Modul-Key 'pruefungen';
  // Studierende haben read, nur Dozenten write.
  T('ab_index: Dozenten-Cockpit verlangt write',
    /href="ab_pruefungen\.html"[^>]*data-perm-recht="write"/.test(ab));
  T('ab_index: Studierenden-Runner bleibt bei read',
    /href="ab_pruefung_live\.html"[^>]*>/.test(ab) &&
    !/href="ab_pruefung_live\.html"[^>]*data-perm-recht/.test(ab));
  T('ab_index: beide «Bald»-Ausblicke haben einen Stellvertreter',
    (ab.match(/data-status="bald" data-soon-fuer="berufsschule"/g) || []).length === 2);
}

/* ── C) Browser: wer sieht was ─────────────────────────────────────────
 *
 * TESTROLLEN — KRITISCH, sonst prueft der Browser-Teil NICHTS:
 * Alle vier Hubs stehen in gema_auth._isLoginOnly und unterliegen damit
 * dem ROLLEN-REDIRECT. Er schickt jede Rolle auf ihre Landing-Seite,
 * ausser die Landing ist index.html (bzw. die Person ist role_admin):
 *
 *   dozent · magaziner · monteur · free  → index.html  → KEIN Redirect
 *   planer · elektro_planer · student    → sys_workspace.html → weg
 *
 * Ein role_planer landet auf sb_index also NIE — die Seite hat dann 0
 * Kacheln und jeder Check darauf ist ein Scheinbeleg (genau so ist der
 * erste Lauf dieses Guards durchgefallen). Wir testen darum mit Rollen,
 * die den Hub wirklich erreichen; wo Fachrechte noetig sind, wird
 * role_dozent kombiniert — er hebt den Redirect auf, ohne die Rechte
 * der zweiten Rolle zu veraendern (can() ist die Vereinigung).
 */
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch (e) { }
if (!chromium || !process.env.CHROME) {
  console.log('\n⏭  Browser-Teil übersprungen (playwright-core/CHROME fehlt) — nie still: Teil A+B liefen.');
} else {
  const { startServer, BASE, seed } = await import('./rolematrix_harness.mjs');
  const srv = await startServer();
  const br = await chromium.launch({ executablePath: process.env.CHROME });

  async function sicht(rollen, seite, opts) {
    const ctx = await br.newContext();
    await ctx.route('**/*', r => r.request().url().startsWith(BASE)
      ? r.continue()
      : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await ctx.addInitScript(st => {
      for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, seed(rollen, opts));
    const p = await ctx.newPage();
    await p.goto(BASE + '/' + seite, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    const r = await p.evaluate(() => {
      const sic = el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
      const kachelSel = '.mod-card, .mod';
      const titel = c => ((c.querySelector('.mod-title') || c.querySelector('h3') || {}).textContent || '?').trim();

      /* Kern-Invariante: keine sichtbare Kachel, die man nicht oeffnen kann. */
      const unerreichbar = [];
      const sichtbar = [];
      document.querySelectorAll(kachelSel).forEach(c => {
        if (!sic(c)) return;
        sichtbar.push(titel(c));
        if (c.getAttribute('data-perm-locked')) return;   // Upsell-Kachel: Absicht
        const dm = c.getAttribute('data-module');
        const href = c.getAttribute('href');
        if (!dm && !href) {
          const soon = c.getAttribute('data-soon-fuer');
          const recht = c.getAttribute('data-soon-recht') || 'read';
          if (!soon || !GemaAuth.can(recht, soon)) unerreichbar.push(titel(c) + ' [Ausblick]');
          return;
        }
        let key = dm;
        if (!key) {
          const datei = String(href).split('#')[0].split('?')[0].replace(/^.*\//, '').replace(/\.html?$/i, '');
          key = (GemaAuth.getFileMap() || {})[datei];
          if (!key) return;                                // fail-open
        }
        const recht = c.getAttribute('data-perm-recht') || 'read';
        if (!GemaAuth.can(recht, key)) unerreichbar.push(titel(c) + ' [' + key + '/' + recht + ']');
      });

      /* Zaehler + leere Kategorien + Sprunglinks */
      const gruppen = [];
      const seen = [];
      document.querySelectorAll('.cat-section').forEach(g => { if (seen.indexOf(g) < 0) { seen.push(g); gruppen.push(g); } });
      document.querySelectorAll('.cat-hd').forEach(h => {
        if (h.closest('.cat-section')) return;
        const g = h.parentElement;
        if (g && seen.indexOf(g) < 0) { seen.push(g); gruppen.push(g); }
      });
      const zaehlerFalsch = [], leereSichtbar = [], toteLinks = [];
      let gruppenSichtbar = 0;
      gruppen.forEach(g => {
        const echte = [...g.querySelectorAll(kachelSel)].filter(c => sic(c) && (c.getAttribute('data-module') || c.getAttribute('href'))).length;
        const ausb = [...g.querySelectorAll(kachelSel)].filter(c => sic(c) && !c.getAttribute('data-module') && !c.getAttribute('href')).length;
        if (!sic(g)) {
          if (echte + ausb > 0) leereSichtbar.push('versteckt trotz ' + (echte + ausb) + ' Kacheln');
          return;
        }
        gruppenSichtbar++;
        if (echte + ausb === 0) leereSichtbar.push((g.id || g.className) + ' ist leer, aber sichtbar');
        const z = g.querySelector('.cat-count, .cat-count-badge');
        const m = z && (z.textContent || '').match(/^\s*(\d+)\s+Module?\s*$/);
        if (m && +m[1] !== echte) zaehlerFalsch.push((g.id || g.className) + ': Badge ' + m[1] + ' / echte ' + echte);
      });
      document.querySelectorAll('.cat-nav a[href^="#"]').forEach(a => {
        if (!sic(a)) return;
        const ziel = document.getElementById(a.getAttribute('href').slice(1));
        if (ziel && !sic(ziel)) toteLinks.push(a.getAttribute('href'));
      });

      /* Hero */
      const hero = {};
      document.querySelectorAll('.hero-stat').forEach(st => {
        const n = st.querySelector('.hero-stat-num');
        if (!n) return;
        hero[(st.textContent || '').replace(/\s+/g, ' ').trim()] = n.textContent.trim();
      });

      const alleEchtSichtbar = [...document.querySelectorAll(kachelSel)]
        .filter(c => sic(c) && (c.getAttribute('data-module') || c.getAttribute('href'))).length;
      const alleAusbSichtbar = [...document.querySelectorAll(kachelSel)]
        .filter(c => sic(c) && !c.getAttribute('data-module') && !c.getAttribute('href')).length;

      return { unerreichbar, zaehlerFalsch, leereSichtbar, toteLinks, hero,
               sichtbar, echt: alleEchtSichtbar, ausblick: alleAusbSichtbar,
               gruppen: gruppenSichtbar, gesamt: document.querySelectorAll(kachelSel).length,
               seite: location.pathname };
    });
    await ctx.close();
    /* Der Rollen-Redirect wuerde jeden Check zum Scheinbeleg machen —
       lieber laut scheitern als still 0 Kacheln melden. */
    if (r.seite.indexOf(seite) < 0) { fail++; console.log('  ✗ WEGGELEITET von ' + seite + ' → ' + r.seite + ' (Testrolle hat die falsche Landing-Seite)'); }
    return r;
  }

  async function suche(rollen, seite, wort, opts) {
    const ctx = await br.newContext();
    await ctx.route('**/*', r => r.request().url().startsWith(BASE)
      ? r.continue()
      : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await ctx.addInitScript(st => {
      for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, seed(rollen, opts));
    const p = await ctx.newPage();
    await p.goto(BASE + '/' + seite, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2200);
    await p.fill('#searchInp', wort);
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const res = document.getElementById('searchResults');
      const sichtbarRes = res ? getComputedStyle(res).display !== 'none' : null;
      const treffer = res ? [...res.querySelectorAll('.sr-item')].filter(e => e.offsetParent !== null).length : null;
      // Seiten ohne Ergebnis-Liste filtern die Kacheln direkt (pm/ab).
      const kacheln = [...document.querySelectorAll('.mod-card, .mod')].filter(c => c.offsetParent !== null).length;
      return { sichtbarRes, treffer, kacheln };
    });
    await ctx.close();
    return r;
  }

  console.log('\n── C1) sb_index — Monteur (keine Sanitaerberechnung) ──');
  const m = await sicht(['role_monteur'], 'sb_index.html');
  T('29 Kacheln im Markup vorhanden (sonst prueft der Test nichts)', m.gesamt === 29, JSON.stringify(m.gesamt));
  T('KEINE Kachel sichtbar', m.echt === 0, m.sichtbar.join(' · '));
  T('alle Kategorien ausgeblendet', m.gruppen === 0, String(m.gruppen));
  T('keine toten Sprunglinks', m.toteLinks.length === 0, m.toteLinks.join(' · '));
  T('Hero «Module» steht auf 0', m.hero['29 Module'] === undefined && Object.entries(m.hero).some(([k, v]) => /Module$/.test(k) && v === '0'), JSON.stringify(m.hero));
  T('Hero «Kategorien» steht auf 0', Object.entries(m.hero).some(([k, v]) => /Kategorien$/.test(k) && v === '0'), JSON.stringify(m.hero));
  T('KEINE unerreichbare Kachel', m.unerreichbar.length === 0, m.unerreichbar.join(' · '));

  // role_dozent hat alle CALC_CATS-Module (inkl. «Sanitärberechnungen»)
  // read+write UND landet auf index.html — er erreicht den Hub also.
  console.log('\n── C2) sb_index — Dozent (volle Sanitaer-Rechte) sieht seine Module ──');
  const pl = await sicht(['role_dozent'], 'sb_index.html');
  T('Kacheln sichtbar', pl.echt > 0, JSON.stringify(pl.echt));
  T('KEINE unerreichbare Kachel', pl.unerreichbar.length === 0, pl.unerreichbar.join(' · '));
  T('Kategorie-Zaehler passen', pl.zaehlerFalsch.length === 0, pl.zaehlerFalsch.join(' · '));
  T('keine leere Kategorie sichtbar', pl.leereSichtbar.length === 0, pl.leereSichtbar.join(' · '));
  T('keine toten Sprunglinks', pl.toteLinks.length === 0, pl.toteLinks.join(' · '));

  console.log('\n── C3) sb_index — Admin sieht alles (Gegenprobe) ──');
  const ad = await sicht(['role_admin'], 'sb_index.html');
  T('alle 29 Kacheln sichtbar', ad.echt === 29, String(ad.echt));
  T('alle 5 Kategorien sichtbar', ad.gruppen === 5, String(ad.gruppen));
  T('Hero unveraendert bei 29', Object.entries(ad.hero).some(([, v]) => v === '29'), JSON.stringify(ad.hero));

  console.log('\n── C4) el_index — Monteur vs. Elektroplaner ──');
  const em = await sicht(['role_monteur'], 'el_index.html');
  T('Monteur: keine Kachel', em.echt === 0, em.sichtbar.join(' · '));
  T('Monteur: keine Kategorie', em.gruppen === 0, String(em.gruppen));
  T('Monteur: KEINE unerreichbare Kachel', em.unerreichbar.length === 0, em.unerreichbar.join(' · '));
  // «Elektroberechnungen» steht NICHT in CALC_CATS — der Dozent allein hat
  // die Module nicht. role_elektro_planer hat sie (_allPerms), landet aber
  // im Workspace; die Kombination gibt Rechte UND Erreichbarkeit.
  const ep = await sicht(['role_dozent', 'role_elektro_planer'], 'el_index.html');
  T('Elektroplaner: Kacheln sichtbar', ep.echt > 0, String(ep.echt));
  T('Elektroplaner: KEINE unerreichbare Kachel', ep.unerreichbar.length === 0, ep.unerreichbar.join(' · '));
  T('Elektroplaner: Zaehler passen', ep.zaehlerFalsch.length === 0, ep.zaehlerFalsch.join(' · '));

  console.log('\n── C5) pm_ausschreibung — Monteur ──');
  const pm = await sicht(['role_monteur'], 'pm_ausschreibung.html');
  T('KEINE unerreichbare Kachel', pm.unerreichbar.length === 0, pm.unerreichbar.join(' · '));
  T('keine leere Kategorie sichtbar', pm.leereSichtbar.length === 0, pm.leereSichtbar.join(' · '));
  T('Zaehler passt', pm.zaehlerFalsch.length === 0, pm.zaehlerFalsch.join(' · '));
  // KRITISCH: die Suche setzt bei leerem Feld display='' auf alle .mod-card.
  const pmS = await suche(['role_monteur'], 'pm_ausschreibung.html', 'honorar');
  T('Suche holt keine gesperrte Kachel zurueck', pmS.kacheln === pm.echt + pm.ausblick,
    'nach Suche ' + pmS.kacheln + ' / vorher ' + (pm.echt + pm.ausblick));

  console.log('\n── C6) ab_index — read vs. write, Monteur, Dozent ──');
  // ab_pruefungen (Cockpit) und ab_pruefung_live (Runner) teilen den Key
  // 'pruefungen'; NUR das data-perm-recht="write" am Cockpit trennt sie.
  // role_student traegt genau diese Rechte, landet aber im Workspace —
  // wir bilden sie darum an role_dozent nach (Redirect haengt an der
  // roleId, die Rechte an der gespeicherten Rollen-Definition; ein
  // gesetzter Permission-Key wird von _mergeWithDefaults nie ueberschrieben).
  const nurLesen = { roles: [{ id: 'role_dozent', name: 'Nur-Lesen (Testrolle)', permissions: {
    klassen:    { read: true, write: false, admin: false },
    pruefungen: { read: true, write: false, admin: false },
    quiz:       { read: true, write: true,  admin: false }
  } }] };
  const st = await sicht(['role_dozent'], 'ab_index.html', nurLesen);
  T('nur Lesen: KEINE unerreichbare Kachel', st.unerreichbar.length === 0, st.unerreichbar.join(' · '));
  T('nur Lesen: Dozenten-Cockpit (write) ist WEG',
    !st.sichtbar.some(t => /Dozenten-Cockpit/.test(t)), st.sichtbar.join(' · '));
  T('nur Lesen: eigener Pruefungs-Runner (read) ist DA',
    st.sichtbar.some(t => /Meine Prüfungen/.test(t)), st.sichtbar.join(' · '));
  T('nur Lesen: «Bald»-Ausblicke sind WEG', st.ausblick === 0, String(st.ausblick));
  T('nur Lesen: Zaehler passen', st.zaehlerFalsch.length === 0, st.zaehlerFalsch.join(' · '));

  const mo = await sicht(['role_monteur'], 'ab_index.html');
  T('Monteur: KEINE unerreichbare Kachel', mo.unerreichbar.length === 0, mo.unerreichbar.join(' · '));
  T('Monteur: «Bald»-Ausblicke sind WEG', mo.ausblick === 0, String(mo.ausblick));
  T('Monteur: keine leere Kategorie sichtbar', mo.leereSichtbar.length === 0, mo.leereSichtbar.join(' · '));

  const dz = await sicht(['role_dozent'], 'ab_index.html');
  T('Dozent: Dozenten-Cockpit ist DA',
    dz.sichtbar.some(t => /Dozenten-Cockpit/.test(t)), dz.sichtbar.join(' · '));
  T('Dozent: KEINE unerreichbare Kachel', dz.unerreichbar.length === 0, dz.unerreichbar.join(' · '));

  const aa = await sicht(['role_admin'], 'ab_index.html');
  T('Admin: Roadmap vollstaendig (beide «Bald» da)', aa.ausblick === 2, String(aa.ausblick));
  T('Admin: Hero «in Entwicklung» = 2',
    Object.entries(aa.hero).some(([k, v]) => /Entwicklung$/.test(k) && v === '2'), JSON.stringify(aa.hero));
  T('Admin: Hero «bereits aktiv» = 5',
    Object.entries(aa.hero).some(([k, v]) => /aktiv$/.test(k) && v === '5'), JSON.stringify(aa.hero));

  console.log('\n── C7) Suche in sb_index folgt der Rolle ──');
  const sm = await suche(['role_monteur'], 'sb_index.html', 'osmose');
  T('Monteur findet «osmose» NICHT', sm.treffer === 0 || sm.sichtbarRes === false,
    JSON.stringify(sm));
  const sp = await suche(['role_dozent'], 'sb_index.html', 'osmose');
  T('Berechtigter findet «osmose»', sp.treffer > 0, JSON.stringify(sp));
  const sb = await suche(['role_dozent'], 'sb_index.html', 'wassererwärmung');
  T('«bald»-Eintrag ohne url bleibt auch dem Berechtigten verborgen',
    sb.treffer === 0 || sb.sichtbarRes === false, JSON.stringify(sb));

  console.log('\n── C8) Gegenprobe: ohne den Helfer waere alles sichtbar ──');
  {
    const ctx = await br.newContext();
    await ctx.route('**/*', r => {
      if (r.request().url().indexOf('gema_kachel_filter.js') >= 0) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      return r.request().url().startsWith(BASE) ? r.continue()
        : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await ctx.addInitScript(st => {
      for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, seed(['role_monteur']));
    const p = await ctx.newPage();
    await p.goto(BASE + '/sb_index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2000);
    const n = await p.evaluate(() => [...document.querySelectorAll('.mod')].filter(c => c.offsetParent !== null).length);
    await ctx.close();
    T('ohne Helfer saehe der Monteur alle 29 (belegt, dass der Test greift)', n === 29, String(n));
  }

  await br.close();
  srv.close();
}

console.log('\n────────────────────────────');
console.log(ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
