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
  T('Filter kennt data-soon-fuer', /querySelectorAll\('\.mod-card\[data-soon-fuer\]'\)/.test(idx));
  T('data-soon-recht steuert die Stufe (Default read)',
    /getAttribute\('data-soon-recht'\) \|\| 'read'/.test(idx));
  T('gefilterte Ausblicke tragen data-perm-hidden (wie echte Kacheln)',
    /\[data-soon-fuer\][\s\S]{0,400}data-perm-hidden/.test(idx));
  T('Auslastungsplanung hängt an einsatzplan/write',
    /data-soon-fuer="einsatzplan" data-soon-recht="write"[\s\S]{0,400}Auslastungsplanung/.test(idx));
  // Ohne Angabe bleibt ein Ausblick sichtbar — nichts wird still verborgen.
  T('Ausblicke ohne Angabe bleiben unangetastet',
    /Ohne die Angabe bleibt der Ausblick wie bisher fuer alle\s*\n?\s*.{0,20}sichtbar/.test(idx)
    || /nichts wird stillschweigend verborgen/.test(idx));
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
      const map = {};
      document.querySelectorAll('.mod-card.disabled').forEach(c => {
        map[((c.querySelector('.mod-title') || {}).textContent || '?').trim()] = c.offsetParent !== null;
      });
      return {
        ausblicke: map,
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
  T('kein Footer gerendert', !m.footer);
  T('kein «Impressum» auf der Seite', !m.impressum);
  T('keine Firmenadresse auf der Seite', !m.adresse);

  console.log('\n── C2) Magaziner (plant Einsätze) sieht den Ausblick weiterhin ──');
  const g = await sicht(['role_magaziner']);
  T('Auslastungsplanung sichtbar', g.ausblicke['Auslastungsplanung'] === true, JSON.stringify(g.ausblicke));
  T('kein Footer gerendert', !g.footer);

  console.log('\n── C3) Admin sieht alle Ausblicke ──');
  const a = await sicht(['role_admin']);
  T('Auslastungsplanung sichtbar', a.ausblicke['Auslastungsplanung'] === true, JSON.stringify(a.ausblicke));
  T('kein Footer gerendert', !a.footer);

  await br.close(); srv.close();
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
