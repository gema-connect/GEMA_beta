// Nav-Vereinheitlichungs-Test (Drift-Guard): prüft auf ALLEN Seiten mit
// <nav class="g-nav">, dass Logo, Buttons und Breadcrumbs dem Kanon folgen.
//
// Layer A (statisch, ohne Browser):
//   - genau EINE Logo-Variante (Markup-Hash) über alle Seiten, href="index.html"
//   - Feedback-Button-Kanon: class="gema-feedback-btn no-print" + «🔴 Feedback»
//   - keine toten br_index-Links, keine «← »-Links, kein redundanter GEMA-Crumb
//   - Breadcrumb-Labels: sb_index→«Sanitärberechnungen»,
//     pm_ausschreibung→«Planung & Management», ab_index→«Ausbildung»
// Layer B (Playwright, gerendert): Nav 72px, Logo-SVG 40px, alle sichtbaren
//   Nav-Buttons exakt 34px hoch (Kanon aus gema_responsive.css).
//
// Ausführen: CHROME=<chromium> node scripts/nav_uniform_test.mjs
// (playwright-core wird via node_modules aufwärts gesucht — wie rolematrix_test)
import { readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { startServer, wireRoutes, seed, BASE, ROOT } from './rolematrix_harness.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }

const files = readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
const navPages = [];

// ── Layer A: statische Markup-Prüfung ──
console.log('── Layer A: Markup-Kanon ──');
const logoHashes = new Set();
for (const f of files) {
  const html = readFileSync(ROOT + '/' + f, 'utf8');
  const navM = html.match(/<nav[^>]*class="[^"]*g-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/);
  if (!navM) continue;
  navPages.push(f);
  const nav = navM[1];

  const logoM = nav.match(/<a[^>]*class="[^"]*g-nav-logo[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
  ok(!!logoM, f + ': g-nav-logo-Anker fehlt');
  if (logoM) {
    ok(logoM[1] === 'index.html', f + ': Logo-href "' + logoM[1] + '" ≠ index.html');
    logoHashes.add(createHash('md5').update(logoM[2].replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8));
  }

  // Feedback-Button-Kanon (jede Nav hat genau einen)
  const fb = nav.match(/<button[^>]*class="([^"]*)"[^>]*>([^<]*Feedback[^<]*)<\/button>/);
  ok(!!fb, f + ': Feedback-Button fehlt in der Nav');
  if (fb) {
    ok(/gema-feedback-btn/.test(fb[1]) && /no-print/.test(fb[1]), f + ': Feedback-Button-Klasse "' + fb[1] + '" ≠ Kanon');
    ok(fb[2].trim() === '🔴 Feedback', f + ': Feedback-Text "' + fb[2].trim() + '" ≠ «🔴 Feedback»');
  }

  // Tote/verbotene Links
  ok(nav.indexOf('br_index.html') < 0, f + ': toter br_index.html-Link');
  ok(!/<a[^>]*>\s*←/.test(nav), f + ': «← …»-Link in der Nav (Konvention: entfernt)');
  ok(!/<a href="index.html">GEMA<\/a>/.test(nav), f + ': redundanter GEMA-Crumb');

  // Breadcrumb-Label-Kanon je Ziel
  const canon = {
    'sb_index.html': 'Sanitärberechnungen',
    'pm_ausschreibung.html': 'Planung & Management',
    'ab_index.html': 'Ausbildung',
    'index.html#hei': 'Heizung & Wärmeerzeugung',
    'index.html#lueft': 'Lüftung & Klimatisierung',
    'index.html#brand': 'Brandschutz & Sprinkler'
  };
  for (const [target, label] of Object.entries(canon)) {
    const re = new RegExp('<a[^>]*href="' + target.replace(/[.#]/g, '\\$&') + '"[^>]*>([^<]*)</a>', 'g');
    let m;
    while ((m = re.exec(nav))) {
      const txt = m[1].replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      if (txt === '⚙️') continue; // Hub-Settings-Links ausgenommen
      ok(txt === label, f + ': Breadcrumb «' + txt + '» → ' + target + ' (Kanon: «' + label + '»)');
    }
  }
}
ok(logoHashes.size === 1, 'Logo-Varianten: ' + logoHashes.size + ' (Kanon: genau 1)');
console.log('Layer A: ' + pass + ' ok, ' + fail + ' Fehler — ' + navPages.length + ' Seiten mit g-nav');

// ── Layer B: gerenderte Metriken ──
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const { chromium } = await import('playwright-core');
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await wireRoutes(ctx);
const seedObj = seed(['role_admin']);
await ctx.addInitScript(st => {
  for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
}, seedObj);

console.log('── Layer B: gerenderte Metriken (Admin-Seed) ──');
const page = await ctx.newPage();
for (const f of navPages) {
  try {
    await page.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(350);
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav.g-nav');
      if (!nav) return { nav: 0 };
      const svg = nav.querySelector('.g-nav-mark svg');
      const btns = Array.from(nav.querySelectorAll('.g-nav-btn, .gema-feedback-btn'))
        .filter(b => b.offsetParent !== null)
        .map(b => Math.round(b.getBoundingClientRect().height));
      return {
        nav: Math.round(nav.getBoundingClientRect().height),
        svg: svg ? Math.round(svg.getBoundingClientRect().height) : 0,
        btns: btns
      };
    });
    ok(m.nav === 72, f + ': Nav-Höhe ' + m.nav + ' ≠ 72');
    ok(m.svg === 40, f + ': Logo-SVG ' + m.svg + ' ≠ 40');
    const off = (m.btns || []).filter(h => h !== 34);
    ok(off.length === 0, f + ': Button-Höhen abweichend [' + off.join(',') + '] ≠ 34');
  } catch (e) {
    fail++; console.error('  ✗ ' + f + ': ' + String(e).slice(0, 120));
  }
}

await browser.close();
server.close();
console.log('\n' + (fail ? 'FEHLER: ' + fail + ' — ' + pass + ' ok' : 'ALLE ' + pass + ' CHECKS GRÜN (' + navPages.length + ' Seiten)'));
process.exit(fail ? 1 : 0);
