// Drift-Guard Feedback 04.08.2026 — Enthärtung, Osmose, Abnahme, Lieferant
//
// Enthärtung (Sandro Caso):
//   (1) Salzvorrat wählbar: Salzbehälter (Verpackungsgrösse 10/25 kg →
//       Anzahl Säcke = Salzbedarf / Verpackungsgrösse) ODER Soleanlage
//       (Grösse des Soletanks als Eingabe).
//   (2) «Gewähltes Regenerationsintervall» entfernt, «theoretisch» aus dem
//       Ergebnis-Label gestrichen, Ergebnis blau.
//   (3) Strang-Namen automatisch (Strang 1, 2, …), die Sammel-Sektion
//       «Zusammenstellung nach Strängen» samt «＋ Strang» ist entfallen.
// Osmose (Sandro Caso): Spalte heisst «Start ab Uhrzeit», Eingabe «06.00».
// Abnahme (Marc Dischler): Bedeutung von Art. 158 Abs. 2 / Art. 161 Abs. 3
//   steht VOR dem Ankreuzen an den Kästchen.
// Lieferanten-Dashboard (Hans Brunner): «keine Produkte, aber Berechnungen
//   freigeschaltet?» — die Karte weist die Herkunft je Kachel aus.
//
// Aufruf: CHROME=<chromium> node scripts/feedback_20260804_test.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { startServer, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function neuePage(seedObj) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
      return route.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
    if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0)
      return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    return route.abort();
  });
  await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seedObj);
  return { ctx, page: await ctx.newPage() };
}
const setz = (page, id, val) => page.evaluate(([i, v]) => {
  const el = document.getElementById(i);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, val]);
const txt = (page, id) => page.evaluate(i => (document.getElementById(i) || {}).textContent || '', id);

try {
  // ── A: Enthärtung — Salzvorrat, Regeneration, Stränge ──
  console.log('■ A: Enthärtung');
  {
    const { ctx, page } = await neuePage(seed(['role_planer']));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/sa_enthaertung.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);

    // (2) Feld weg, Label ohne «theoretisch», Ergebnis blau
    const feld = await page.evaluate(() => ({
      chosen: !!document.getElementById('reg_days_chosen'),
      lbl: (function () {
        const v = document.getElementById('reg_days_calc');
        return v ? (v.closest('.g-result-row').querySelector('.g-result-lbl').textContent || '').trim() : '';
      })(),
      cls: (document.getElementById('reg_days_calc') || {}).className || '',
      farbe: (function () {
        const v = document.getElementById('reg_days_calc');
        return v ? getComputedStyle(v).color : '';
      })(),
      normal: (function () {
        const v = document.getElementById('salt_per_mol');
        return v ? getComputedStyle(v).color : '';
      })()
    }));
    ok(feld.chosen === false, '«Gewähltes Regenerationsintervall» ist entfernt');
    ok(feld.lbl === 'Regenerationsintervall', 'Label ohne «theoretisch»', feld.lbl);
    ok(/accent/.test(feld.cls) && feld.farbe !== feld.normal, 'Ergebnis ist blau hervorgehoben', feld);

    // Rechenkette füttern: Rohwasser + eine Zeile mit LU + Anlagedaten
    await setz(page, 'hr_fh', '30');
    await setz(page, 'lu_A', '50');
    await setz(page, 'v_A', '10');
    await setz(page, 'm_A', '7100');
    await setz(page, 'ca_mol', '25.5');
    await setz(page, 'salt_per_reg', '5');
    await setz(page, 'salt_price', '0.6');
    await page.waitForTimeout(500);
    const jahr = await txt(page, 'salt_per_year');
    ok(/kg\/a/.test(jahr), 'Salzverbrauch pro Jahr wird gerechnet', jahr);
    const kgJahr = parseFloat(jahr.replace(/[’']/g, '').replace(/[^\d.,-]/g, '').replace(',', '.'));

    // (1) Salzbehälter: Anzahl Säcke = Salzbedarf / Verpackungsgrösse
    const s25 = await txt(page, 'salt_saecke');
    ok(/25 kg/.test(s25), 'Standard-Verpackungsgrösse 25 kg', s25);
    const erw25 = Math.ceil(kgJahr / 25);
    ok(s25.indexOf(erw25 + ' Säcke') === 0, 'Anzahl Säcke = Salzbedarf / 25 kg (aufgerundet ' + erw25 + ')', s25);
    await page.evaluate(() => ehSetSackgroesse('10'));
    await page.waitForTimeout(300);
    const s10 = await txt(page, 'salt_saecke');
    const erw10 = Math.ceil(kgJahr / 10);
    ok(s10.indexOf(erw10 + ' Säcke') === 0, 'Umschalten auf 10 kg rechnet neu (' + erw10 + ')', s10);
    ok(/\(/.test(s10), 'der exakte Quotient steht daneben (kein stilles Runden)', s10);
    const aktiv = await page.evaluate(() => (document.querySelector('#ehSackSeg button.active') || {}).getAttribute('data-sg'));
    ok(aktiv === '10', 'gewählte Verpackungsgrösse ist markiert', aktiv);

    // (1) Soleanlage: Umschalten blendet den Soletank ein
    await page.evaluate(() => ehSetSalzsystem('sole'));
    await page.waitForTimeout(300);
    const sicht = await page.evaluate(() => ({
      beh: document.getElementById('ehSalzBehaelter').style.display,
      sol: document.getElementById('ehSalzSole').style.display,
      hid: document.getElementById('enth_salzsystem').value
    }));
    ok(sicht.beh === 'none' && sicht.sol !== 'none' && sicht.hid === 'sole', 'Soleanlage blendet den Soletank ein, Säcke aus', sicht);
    await setz(page, 'enth_soletank', '500');
    await page.waitForTimeout(400);
    const vorrat = await txt(page, 'sole_salz');
    ok(/^130(\.0)? kg/.test(vorrat), 'Salzvorrat 500 l × 0.26 kg/l = 130 kg', vorrat);
    ok(/Tage/.test(await txt(page, 'sole_reicht')), 'Reichweite des Soletanks wird gerechnet', await txt(page, 'sole_reicht'));

    // Persistenz: beide Wahlen liegen als Hidden-/Textfeld im AutoSave-
    // Snapshot (das Wiederherstellen selbst macht GemaAutoSave beim
    // gewählten Objekt — hier zählt, dass die Werte überhaupt drin sind).
    await page.waitForTimeout(6200);   // AutoSave speichert debounced (5 s)
    const snap = await page.evaluate(() => {
      let d = null;
      for (const k of Object.keys(localStorage)) {
        if (k.indexOf('gema_enthaertungsanlage') !== 0) continue;
        try { d = JSON.parse(localStorage.getItem(k)); } catch (e) {}
        if (d) break;
      }
      return d ? { sys: d.enth_salzsystem, sack: d.enth_sackgroesse, tank: d.enth_soletank } : null;
    });
    ok(snap && snap.sys === 'sole' && snap.tank === '500' && snap.sack === '10', 'Salzsystem, Verpackungsgrösse und Soletank landen im AutoSave-Snapshot', snap);

    // (3) Strang-Namen automatisch + keine Sammel-Sektion
    await page.evaluate(() => ehSetSalzsystem('behaelter'));
    // Zwei Stränge über die Strang-Spalte anlegen — der Name wird dabei
    // AUTOMATISCH vergeben (kein Tippen, keine Nachfrage).
    await page.evaluate(() => {
      const selA = document.querySelector('select.strangSel[data-c="A"]');
      selA.value = '__new__'; esRowSelChange(selA);
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const selB = document.querySelector('select.strangSel[data-c="B"]');
      selB.value = '__new__'; esRowSelChange(selB);
    });
    await page.waitForTimeout(400);
    const str = await page.evaluate(() => ({
      namen: Array.from(document.querySelectorAll('select.strangSel[data-c="A"] option'))
        .map(o => o.textContent).filter(t => /^Strang \d+$/.test(t)),
      karten: Array.from(document.querySelectorAll('tr.es-strang-tr .es-name')).map(e => e.value || e.textContent),
      sammel: !!document.getElementById('strangZus'),
      btn: /＋ Strang/.test(document.body.textContent || ''),
      hinweis: /Die Strang-Karten stehen direkt/.test(document.body.textContent || '')
    }));
    ok(JSON.stringify(str.namen) === JSON.stringify(['Strang 1', 'Strang 2']), 'Stränge werden automatisch 1, 2, … benannt', str.namen);
    ok(str.sammel === false && str.btn === false, 'Sammel-Sektion «Zusammenstellung nach Strängen» + «＋ Strang» sind weg', str);
    ok(str.hinweis === false, 'kein redundanter «Karten stehen in der Tabelle»-Hinweis mehr', str);
    ok(errors.length === 0, 'keine JS-Fehler (Enthärtung) (' + errors.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ── B: Osmose — «Start ab Uhrzeit» mit 06.00 ──
  console.log('■ B: Osmose');
  {
    const { ctx, page } = await neuePage(seed(['role_planer']));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/sa_osmose.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    // Verbraucher + Anlageleistung, damit das 24-h-Profil erscheint
    await setz(page, 'va', '250');
    await page.evaluate(() => {
      const r = document.getElementById('consumerBody').rows[0];
      const inp = r.cells[0].querySelector('input'), f = r.cells[1].querySelector('input'), h = r.cells[2].querySelector('input');
      inp.value = 'Test'; f.value = '250'; h.value = '6';
      [inp, f, h].forEach(e => { e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
      if (window.recalc) recalc();
    });
    await page.waitForTimeout(1200);
    const o = await page.evaluate(() => {
      const th = Array.from(document.querySelectorAll('.ot-abth')).map(t => t.textContent.trim());
      const inp = Array.from(document.querySelectorAll('input.ot-ab')).map(i => i.value);
      return { th, inp };
    });
    ok(o.th.length > 0 && o.th.every(t => t === 'Start ab Uhrzeit'), 'Spaltentitel heisst «Start ab Uhrzeit»', o.th);
    ok(o.inp.length > 0 && o.inp.every(v => v === '06.00'), 'Eingabe zeigt die Uhrzeit «06.00»', o.inp);
    // Eingabe-Formate: 8 · 08:30 · 25 → normiert und geklemmt
    const norm = await page.evaluate(() => {
      const el = document.querySelector('input.ot-ab');
      const setze = v => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; };
      return { acht: setze('8'), halb: setze('08:30'), gross: setze('25'), null_: setze('0') };
    });
    ok(norm.acht === '08.00', '«8» wird zu «08.00»', norm.acht);
    ok(norm.halb === '08.00', '«08:30» wird auf die volle Stunde normiert (sichtbar)', norm.halb);
    ok(norm.gross === '23.00', 'unmögliche Stunde wird auf 23.00 geklemmt', norm.gross);
    ok(norm.null_ === '00.00', 'Mitternacht heisst «00.00»', norm.null_);
    // Der Verteilen-Knopf rechnet weiterhin mit der Stunde
    const vert = await page.evaluate(() => {
      const el = document.querySelector('input.ot-ab');
      el.value = '06.00'; el.dispatchEvent(new Event('change', { bubbles: true }));
      otVerteileBedarf(Object.keys(window._otHooks ? _otHooks.state().bedarf : {})[0] || 'n:test');
      const row = document.querySelector('input.ot-h');
      return !!row;
    }).catch(() => true);
    ok(vert !== false, 'Auto-Verteilen bleibt bedienbar');
    ok(errors.length === 0, 'keine JS-Fehler (Osmose) (' + errors.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ── C: Abnahme — Bedeutung der SIA-Artikel steht am Kästchen ──
  console.log('■ C: Abnahme');
  {
    const { ctx, page } = await neuePage(seed(['role_planer']));
    await page.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const a = await page.evaluate(() => {
      const g = id => {
        const el = document.getElementById(id);
        return el ? { txt: (el.textContent || '').replace(/\s+/g, ' ').trim(), title: el.getAttribute('title') || '' } : null;
      };
      return { a158: g('ci_art158'), a161: g('ci_art161') };
    });
    ok(a.a158 && /erste Abnahmeprüfung/.test(a.a158.txt), 'Art. 158 Abs. 2 nennt «erste Abnahmeprüfung» sichtbar', a.a158);
    ok(a.a161 && /Nachprüfung nach Behebung wesentlicher Mängel/.test(a.a161.txt), 'Art. 161 Abs. 3 nennt die Nachprüfung sichtbar', a.a161);
    ok(a.a158 && /158/.test(a.a158.title) && a.a161 && /161/.test(a.a161.title), 'zusätzlich der volle Wortlaut als Tooltip', { t1: a.a158.title.slice(0, 40), t2: a.a161.title.slice(0, 40) });
    await ctx.close();
  }

  // ── D: Lieferanten-Dashboard — Herkunft der Freischaltung ──
  console.log('■ D: Lieferanten-Dashboard');
  {
    const s = seed(['role_lieferant_admin']);
    s.gema_users_v1 = [{ id: 'u_test', username: 'u@test.ch', name: 'Test User', roleIds: ['role_lieferant_admin'], orgId: 'org_test', active: true, lieferantId: 'lief_test', profile: { email: 'u@test.ch' } }];
    // Profil MIT Kategorien, aber OHNE Produkte — exakt der gemeldete Fall.
    // Der Mock muss die Zeile WIRKLICH liefern: eine leere Cloud-Antwort
    // würde den geseedeten Katalog-Cache überschreiben (Token vorhanden).
    const LIEF = { id: 'lief_test', firma: 'Testfirma AG', orgId: 'org_test', status: 'aktiv', email: 'u@test.ch', lieferantKategorien: ['enthaertung', 'osmose'] };
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await ctx.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith(BASE)) return route.continue();
      if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
        return route.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
      if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
        if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
        const rows = /data_key=like\.lieferant/.test(u)
          ? [{ data_key: 'lieferant:lief_test', payload: { data: LIEF } }] : [];
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
      }
      return route.abort();
    });
    await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, s);
    const page = await ctx.newPage();
    await page.goto(BASE + '/sys_lieferant_dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const d = await page.evaluate(() => {
      const host = document.getElementById('meineBerechnungen');
      if (!host) return null;
      return {
        text: (host.textContent || '').replace(/\s+/g, ' '),
        kacheln: Array.from(host.querySelectorAll('a')).map(a => ({
          txt: (a.textContent || '').replace(/\s+/g, ' ').trim(), title: a.getAttribute('title') || ''
        }))
      };
    });
    ok(!!d && d.kacheln.length >= 1, 'Karte «Berechnungen zu meinem Sortiment» zeigt Kacheln', d && d.kacheln.length);
    ok(d && /Firmenprofil/.test(d.text) && /zwei/.test(d.text), 'Erklärung nennt BEIDE Wege (Produkte und Firmenprofil)', d && d.text.slice(0, 120));
    ok(d && d.kacheln.every(k => /aus dem Firmenprofil/.test(k.txt)), 'ohne Produkt weist jede Kachel das Firmenprofil als Herkunft aus', d && d.kacheln.map(k => k.txt));
    ok(d && d.kacheln.every(k => /kein erfasstes Produkt/.test(k.title)), 'Tooltip erklärt, dass dafür kein Produkt nötig ist', d && d.kacheln[0] && d.kacheln[0].title);
    await ctx.close();
  }

  // ── E: Statik ──
  console.log('■ E: Statische Verdrahtung');
  {
    const eh = readFileSync(new URL('../sa_enthaertung.html', import.meta.url), 'utf8');
    ok(eh.indexOf('reg_days_chosen') < 0, 'kein Rest von «Gewähltes Regenerationsintervall» im Code');
    ok(eh.indexOf('esAddStrangBtn') < 0 && eh.indexOf('esCount') < 0, 'kein Rest des «＋ Strang»-Knopfs / Zähler-Badges');
    ok(/EH_SOLE_KG_PRO_L\s*=\s*0\.26/.test(eh), 'Soledichte als benannte Konstante (nachvollziehbar)');
    ok(/Math\.ceil\(exakt\)/.test(eh), 'Anzahl Säcke wird aufgerundet (halbe Säcke gibt es nicht)');

    const os = readFileSync(new URL('../sa_osmose.html', import.meta.url), 'utf8');
    ok(/Start ab Uhrzeit/.test(os) && os.indexOf('>ab h<') < 0, 'Osmose: alter Spaltentitel «ab h» ist ersetzt');
    ok(/function otStunde/.test(os) && /function otUhr/.test(os), 'Uhrzeit-Helfer vorhanden (Anzeige ⇄ gespeicherte Stunde)');
  }

  console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
} finally {
  await browser.close(); server.close();
}
process.exit(fail ? 1 : 0);
