/* Drift-Guard — Feedback 21.08.2026 (Robin), Punkte 1 + 2
 *
 *  1. «wenn ich als monteur eingeloggt bin, sehe ich die auslastungsplanungs-
 *     modul in planung, das soll weg»
 *     → «Bald»-Ausblicke hatten kein data-module und liefen darum an der
 *       Permission-Filterung der Übersicht komplett vorbei. Sie tragen jetzt
 *       ein Stellvertreter-Modul (data-soon-fuer [+ data-soon-recht]) und
 *       folgen damit derselben Matrix wie jede echte Kachel.
 *  2. «ebenso soll der banner unten mit impressum adresse etc. ebenfalls
 *     entfernt werden»
 *     → Der Footer (Firmenname, tote Impressum-/Datenschutz-/Cookies-Links,
 *       Adresse) ist aus allen drei Hub-Seiten raus.
 *
 *  Nachtrag desselben Tages: «Module ohne Zugriff sollen gar nicht angezeigt
 *  werden — es ist nur in der normalen Ansicht, in der nativen ist es richtig.»
 *     → Ein Ausblick ist seither OPT-IN: eine Kachel OHNE data-module ist nur
 *       mit data-soon-fuer + passendem Recht sichtbar. Damit zeigt die
 *       Uebersicht genau das, was die App-Ansicht ohnehin zeigt: nur Kacheln,
 *       die man auch oeffnen kann. role_admin sieht die Roadmap weiterhin ganz.
 *
 *  Punkt 3 (Monteur-Feedback erschien nicht im Beta-Board) hat einen eigenen
 *  Guard: scripts/feedback_zustellung_test.mjs
 *
 *  Aufruf: CHROME=<chromium> node scripts/feedback_20260821_test.mjs
 */
import fs from 'fs';

let ok = 0, fail = 0;
const T = (name, cond, info) => {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? '  → ' + info : '')); }
};

const HUBS = ['index.html', 'pm_ausschreibung.html', 'ab_index.html'];

console.log('\n── A) Footer-Banner ist weg ──');
for (const f of HUBS) {
  const s = fs.readFileSync(f, 'utf8');
  T(f + ': kein <footer class="footer">', !/<footer class="footer">/.test(s));
  T(f + ': kein Impressum / Datenschutz / Cookies', !/Impressum|Datenschutz|Cookies/.test(s));
  T(f + ': keine Firmenadresse', !/Lindenstrasse|GEMA connect GmbH/.test(s));
  T(f + ': verwaistes .footer-CSS entfernt', !/^\.footer\s*\{/m.test(s));
}
T('index.html: verwaiste Cloudflare-Mail-Entschlüsselung entfernt',
  !/cloudflare-static\/email-decode/.test(fs.readFileSync('index.html', 'utf8')));
T('kein __cf_email__ mehr im Repo',
  !HUBS.some(f => /__cf_email__/.test(fs.readFileSync(f, 'utf8'))));

console.log('\n── B) «Bald»-Ausblicke folgen der Permission-Matrix ──');
{
  const idx = fs.readFileSync('index.html', 'utf8');
  T('Filter greift jede Kachel OHNE data-module',
    /querySelectorAll\('\.mod-card:not\(\[data-module\]\)'\)/.test(idx));
  T('data-soon-recht steuert die Stufe (Default read)',
    /getAttribute\('data-soon-recht'\) \|\| 'read'/.test(idx));
  T('gefilterte Ausblicke tragen data-perm-hidden (wie echte Kacheln)',
    /:not\(\[data-module\]\)[\s\S]{0,500}data-perm-hidden/.test(idx));
  T('Auslastungsplanung hängt an einsatzplan/write',
    /data-soon-fuer="einsatzplan" data-soon-recht="write"[\s\S]{0,400}Auslastungsplanung/.test(idx));
  // OPT-IN: ohne Stellvertreter-Modul ist ein Ausblick weg (frueher umgekehrt).
  T('ohne data-soon-fuer ist ein Ausblick WEG (opt-in)',
    /if\(key && GemaAuth\.can\(recht, key\)\) return;/.test(idx));
  T('der alte Opt-out-Kommentar ist raus',
    !/nichts wird stillschweigend verborgen/.test(idx));
  T('ein freigeschalteter Ausblick haelt seine Sektion offen',
    /visible===0 && ausblick===0/.test(idx));
  // Die App-Ansicht bleibt unangetastet: sie liest nur echte, verlinkte
  // Kacheln — sie hat Ausblicke nie gezeigt und darf sich nicht aendern.
  T('native Ansicht liest weiterhin nur a.mod-card[data-module]',
    /a\.mod-card\[data-module\]/.test(idx));
}

/* ── C) Browser: wer sieht was ────────────────────────────────────── */
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch (e) { }
if (!chromium || !process.env.CHROME) {
  console.log('\n⏭  Browser-Teil übersprungen (playwright-core/CHROME fehlt) — nie still: Teil A+B liefen.');
} else {
  const { startServer, BASE, seed } = await import('./rolematrix_harness.mjs');
  const srv = await startServer();
  const br = await chromium.launch({ executablePath: process.env.CHROME });

  async function sicht(rollen) {
    const ctx = await br.newContext();
    await ctx.route('**/*', r => r.request().url().startsWith(BASE)
      ? r.continue()
      : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await ctx.addInitScript(st => {
      for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, seed(rollen));
    const p = await ctx.newPage();
    await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const sicht = el => el.offsetParent !== null;
      const titel = c => ((c.querySelector('.mod-title') || {}).textContent || '?').trim();
      const map = {};
      document.querySelectorAll('.mod-card.disabled').forEach(c => { map[titel(c)] = sicht(c); });

      /* Kern-Invariante: in der Uebersicht steht KEINE Kachel, die man nicht
         oeffnen kann. Bewusste Ausnahme sind die gesperrten Upsell-Kacheln des
         Gratis-Kontos (data-perm-locked) — die sind Absicht und kein Leck. */
      const unerreichbar = [];
      document.querySelectorAll('.mod-card').forEach(c => {
        if (!sicht(c)) return;
        if (c.getAttribute('data-perm-locked')) return;
        const key = c.getAttribute('data-module');
        if (key) {
          if (key === 'sanitaerberechnungen' || key === 'beta_pruefungen') return;
          if (!GemaAuth.can('read', key)) unerreichbar.push(titel(c) + ' [' + key + ']');
        } else {
          const soon = c.getAttribute('data-soon-fuer');
          const recht = c.getAttribute('data-soon-recht') || 'read';
          if (!soon || !GemaAuth.can(recht, soon)) unerreichbar.push(titel(c) + ' [Ausblick]');
        }
      });

      /* Der Sektions-Zaehler muss zu dem passen, was man sieht — die frueher
         durchrutschenden Ausblicke machten aus «3 Module» vier Kacheln. */
      const zaehlerFalsch = [];
      document.querySelectorAll('.cat-section').forEach(sec => {
        if (!sicht(sec)) return;
        const b = ((sec.querySelector('.cat-count-badge') || {}).textContent || '').match(/\d+/);
        if (!b) return;
        const echte = [...sec.querySelectorAll('.mod-card[data-module]')].filter(sicht).length;
        const alle  = [...sec.querySelectorAll('.mod-card')].filter(sicht).length;
        // Ein bewusst freigegebener Ausblick darf zusaetzlich stehen.
        const ausblick = [...sec.querySelectorAll('.mod-card:not([data-module])')].filter(sicht).length;
        if (+b[0] !== echte || alle !== echte + ausblick) {
          zaehlerFalsch.push(sec.getAttribute('data-cat') + ': Badge ' + b[0] + ' / echte ' + echte + ' / total ' + alle);
        }
      });

      return {
        ausblicke: map,
        unerreichbar, zaehlerFalsch,
        footer: !!document.querySelector('footer.footer'),
        impressum: document.body.innerText.includes('Impressum'),
        adresse: document.body.innerText.includes('Lindenstrasse'),
        planSichtbar: !!(document.querySelector('#plan') || {}).offsetParent
      };
    });
    await ctx.close();
    return r;
  }

  console.log('\n── C1) Monteur ──');
  const m = await sicht(['role_monteur']);
  T('Planung & Management ist für ihn offen (sonst prüft der Test nichts)', m.planSichtbar, JSON.stringify(m));
  T('Auslastungsplanung ist WEG', m.ausblicke['Auslastungsplanung'] === false, JSON.stringify(m.ausblicke));
  T('Duschschlauch-Manager ist WEG', m.ausblicke['Duschschlauch-Manager'] === false, JSON.stringify(m.ausblicke));
  T('KEINE unerreichbare Kachel sichtbar', m.unerreichbar.length === 0, m.unerreichbar.join(' · '));
  T('Sektions-Zähler passt zu den Kacheln', m.zaehlerFalsch.length === 0, m.zaehlerFalsch.join(' · '));
  T('kein Footer gerendert', !m.footer);
  T('kein «Impressum» auf der Seite', !m.impressum);
  T('keine Firmenadresse auf der Seite', !m.adresse);

  console.log('\n── C2) Magaziner (plant Einsätze) sieht den Ausblick weiterhin ──');
  const g = await sicht(['role_magaziner']);
  T('Auslastungsplanung sichtbar', g.ausblicke['Auslastungsplanung'] === true, JSON.stringify(g.ausblicke));
  T('Duschschlauch-Manager trotzdem WEG (kein Stellvertreter)',
    g.ausblicke['Duschschlauch-Manager'] === false, JSON.stringify(g.ausblicke));
  T('KEINE unerreichbare Kachel sichtbar', g.unerreichbar.length === 0, g.unerreichbar.join(' · '));
  T('Sektions-Zähler passt zu den Kacheln', g.zaehlerFalsch.length === 0, g.zaehlerFalsch.join(' · '));
  T('kein Footer gerendert', !g.footer);

  console.log('\n── C3) Admin sieht alle Ausblicke ──');
  const a = await sicht(['role_admin']);
  T('Auslastungsplanung sichtbar', a.ausblicke['Auslastungsplanung'] === true, JSON.stringify(a.ausblicke));
  T('Roadmap bleibt für den Admin vollständig',
    a.ausblicke['Kälte & Klimaanlagen'] === true
    && a.ausblicke['Gebäudeautomation'] === true
    && a.ausblicke['Duschschlauch-Manager'] === true, JSON.stringify(a.ausblicke));
  T('kein Footer gerendert', !a.footer);

  /* ── C4) App-Ansicht bleibt, wie sie war ────────────────────────── */
  console.log('\n── C4) Native Ansicht (Monteur, Phone) unverändert ──');
  {
    const st = seed(['role_monteur']);
    st.gema_users_v1[0].profile.nativeAnsicht = true;
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.route('**/*', r => r.request().url().startsWith(BASE)
      ? r.continue()
      : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await ctx.addInitScript(x => {
      for (const [k, v] of Object.entries(x)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, st);
    const p = await ctx.newPage();
    await p.goto(BASE + '/index.html?native=1', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    const n = await p.evaluate(() => ({
      aktiv: document.documentElement.classList.contains('gn-native-on'),
      kats: window._natHome ? window._natHome.modules().length : -1,
      text: (document.querySelector('.gn') || document.body).innerText
    }));
    T('App-Ansicht ist aktiv', n.aktiv, JSON.stringify({ aktiv: n.aktiv, kats: n.kats }));
    T('App-Ansicht rendert Kategorien', n.kats > 0, String(n.kats));
    T('kein Ausblick in der App-Ansicht (war schon immer so)',
      !/Auslastungsplanung|Duschschlauch-Manager|Gebäudeautomation/.test(n.text));
    await ctx.close();
  }

  await br.close(); srv.close();
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
