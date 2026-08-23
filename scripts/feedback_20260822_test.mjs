// Drift-Guard: Feedback-Runde 22.08.2026
//
// Teil A — Lieferanten-Dashboard (Feedback 19.08.2026, BWT AQUA AG):
//   1) «für alle rubriken soll es ein suchfeld geben, live filterung»
//   2) «dieser kontainer ganz unten» (Berechnungen zu meinem Sortiment)
//
// Teil B — Abnahmeprotokoll SIA (Feedback 22.08.2026, Baran Koc, Monteur):
//   3) «wenn ich der bin, der die mängel beheben soll, kann ich dennoch
//      angaben vom projekt und auch die unterschriften ändern, das darf
//      nicht sein»
//   4) «wenn man hier die mängel sieht, welche man beheben soll, brauch es
//      den gesamten abschnit darunte (neues protokoll erstellen nicht.)
//      dann soll dieser nur die mängel sehen und das projekt um das es
//      geht, sowie die anagaben zum projekt, also planer etc.»
//
// Ausfuehren: CHROME=<chromium> node scripts/feedback_20260822_test.mjs
import { chromium } from 'playwright-core';
import { startServer, seed, newPage, BASE } from './rolematrix_harness.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  ✗ ' + msg); } }

// ── Seed: Anlagenlieferant mit vollem Sortiment (alle Rubriken sichtbar) ──
const LIEF = {
  id: 'lief_t', firma: 'Testlieferant AG', orgId: 'org_test', status: 'aktiv',
  // Kategorien schalten die Tabs «Rohrsysteme & Armaturen» + «🔧 Werkzeuge» frei
  lieferantKategorien: ['enthaertung', 'rohrsysteme', 'werkzeuge'],
  adresse: { ort: 'Basel' }, abo: { typ: 'basis', status: 'aktiv' }
};
const PRODUKTE = [
  { id: 'p1', lieferantId: 'lief_t', lieferantFirma: 'Testlieferant AG', kategorie: 'enthaertung',
    status: 'verifiziert', daten: { serie: 'AQA perla', modell: 'M', familie: 'Weichwasser' } },
  { id: 'p2', lieferantId: 'lief_t', lieferantFirma: 'Testlieferant AG', kategorie: 'enthaertung',
    status: 'entwurf', daten: { serie: 'Rondomat', modell: 'Duo 3', familie: 'Weichwasser' } },
  { id: 'p3', lieferantId: 'lief_t', lieferantFirma: 'Testlieferant AG', kategorie: 'rohrsystem',
    status: 'verifiziert', daten: { serie: 'Optipress', material: 'Edelstahl', rauhigkeit: 0.0015 } }
];
const OAS = [
  { id: 'oa1', lieferantId: 'lief_t', status: 'offen', produktName: 'AQA perla M',
    kategorie: 'enthaertung', absenderFirma: 'Planer Nord AG', absenderName: 'Anna Meier',
    erstelltAm: '2026-08-10T08:00:00Z',
    nachricht: 'Bitte Offerte für Neubau', projekt: { name: 'Neubau Sonnenhalde', objektId: 'o1' } },
  { id: 'oa2', lieferantId: 'lief_t', status: 'offen', produktName: 'Rondomat Duo 3',
    kategorie: 'enthaertung', absenderFirma: 'Suedplan GmbH', absenderName: 'Beat Kunz',
    erstelltAm: '2026-08-11T08:00:00Z',
    nachricht: 'Sanierung Schulhaus', projekt: { name: 'Schulhaus Riedmatt', objektId: 'o2' } }
];
const BESTELLUNGEN = [
  { id: 'b1', nr: 'BST-2026-001', lieferantId: 'lief_t', status: 'offen', produktName: 'AQA perla M',
    bestellerFirma: 'Installateur Nord AG', objektName: 'Neubau Sonnenhalde',
    lieferadresse: 'Sonnenweg 4, 4051 Basel', bestelltAm: '2026-08-01T09:00:00Z' },
  { id: 'b2', nr: 'BST-2026-002', lieferantId: 'lief_t', status: 'bestaetigt', produktName: 'Rondomat Duo 3',
    bestellerFirma: 'Sued Haustechnik', objektName: 'Schulhaus Riedmatt',
    lieferadresse: 'Riedmattstrasse 9, 6300 Zug', bestelltAm: '2026-08-02T09:00:00Z' }
];
const REVISIONEN = [
  { id: 'r1', lieferantId: 'lief_t', status: 'offen', produktName: 'AQA perla M',
    objektName: 'Neubau Sonnenhalde', dokTypen: ['datenblatt'],
    angefordertVon: { firma: 'Planer Nord AG', name: 'Anna Meier' }, angefordertAm: '2026-08-10T08:00:00Z' },
  { id: 'r2', lieferantId: 'lief_t', status: 'offen', produktName: 'Rondomat Duo 3',
    objektName: 'Schulhaus Riedmatt', dokTypen: ['anleitung'],
    angefordertVon: { firma: 'Suedplan GmbH', name: 'Beat Kunz' }, angefordertAm: '2026-08-11T08:00:00Z' }
];
const ARMATUREN = [
  { id: 'a1', lieferantId: 'lief_t', typ: 'kugelhahn', name: 'Kugelhahn Messing', serie: 'KH-1',
    status: 'verifiziert', zeta: { 22: 0.3 } },
  { id: 'a2', lieferantId: 'lief_t', typ: 'rueckflussverhinderer', name: 'Rückflussverhinderer', serie: 'RV-9',
    status: 'entwurf', zeta: { 28: 2.4 } }
];
const WERKZEUGE = [
  { id: 'wz1', orgId: 'org_kunde', name: 'Pressmaschine', internKennung: 'WZ-001', brand: 'Novopress',
    model: 'ACO 203', supplierId: 'u_test', cat: 'presse',
    hasElec: true, elecInterval: 12, lastElec: '2020-01-01' },
  { id: 'wz2', orgId: 'org_kunde', name: 'Bohrhammer', internKennung: 'WZ-002', brand: 'Hilti',
    model: 'TE 30', supplierId: 'u_test', cat: 'bohren',
    hasElec: true, elecInterval: 12, lastElec: '2020-01-01' }
];

function liefSeed() {
  const s = seed(['role_lieferant']);
  s.gema_users_v1[0].lieferantId = 'lief_t';
  s.gema_users_v1[0].name = 'Hans Muster';
  // Zweiter Mitarbeiter derselben Firma — fuer die Mitarbeiter-Suche
  s.gema_users_v1.push({
    id: 'u_zwei', name: 'Petra Zweit', username: 'petra@test.ch', active: true,
    orgId: 'org_test', roleIds: ['role_lieferant_produkte'], lieferantId: 'lief_t'
  });
  s.gema_lief_mods_v1 = { userId: 'u_test', mods: ['enthaertungsanlage'], ts: Date.now() };
  s.gema_pk_lief_pool_v1 = [LIEF];
  s.gema_pk_prod_pool_v1 = PRODUKTE;
  s.gema_pk_oa_pool_v1 = OAS;
  s.gema_best_pool_v1 = BESTELLUNGEN;
  s.gema_rev_anfr_pool_v1 = REVISIONEN;
  s.gema_armaturen_pool_v1 = ARMATUREN;
  s.gema_werkzeug = WERKZEUGE;
  s.gema_orgs_v1.push({ id: 'org_kunde', name: 'Kunde Bau AG', admins: [] });
  // Coachmark-Tour stilllegen — ihr Backdrop faengt sonst JEDEN Klick ab
  // (Muster workspace_ctx_rolle_test).
  s.gema_coachmarks_done_lieferant_dashboard_v1 = '1';
  return s;
}

// Cloud-GETs auf die geseedeten Pools umlenken — bindCollection wuerde den
// localStorage-Seed sonst mit [] ueberschreiben (Muster lieferant_modul_smoke).
async function wirePools(ctx) {
  const rows = (arr, pf) => arr.map(r => ({ data_key: pf + r.id, payload: { data: r, _lm: 1 } }));
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (route.request().method() === 'GET' && u.indexOf('/gema_data') >= 0) {
      let body = null;
      if (u.indexOf('module_key=eq.produktkatalog') >= 0) {
        // Auf den data_key-PREFIX pruefen, nicht auf lose Teilstrings:
        // «module_key=eq.produktkatalog» enthaelt selbst das Wort «produkt»
        // und verschluckte sonst die Offertanfragen-Abfrage.
        if (u.indexOf('like.lieferant') >= 0) body = rows([LIEF], 'lieferant:');
        else if (u.indexOf('like.produkt') >= 0) body = rows(PRODUKTE, 'produkt:');
        else if (u.indexOf('like.oa') >= 0) body = rows(OAS, 'oa:');
        else body = [];
      } else if (u.indexOf('module_key=eq.bestellungen') >= 0) body = rows(BESTELLUNGEN, 'best:');
      else if (u.indexOf('module_key=eq.revisionsunterlagen') >= 0) body = rows(REVISIONEN, 'reva:');
      else if (u.indexOf('module_key=eq.armaturen') >= 0) body = rows(ARMATUREN, 'arm:');
      else if (u.indexOf('module_key=eq.werkzeugmanagement') >= 0) body = rows(WERKZEUGE, 'tool:');
      if (body) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fallback();
  });
}

// Cloud-Mock fuer den Maengellisten-Pool (Teil B). bindCollection wuerde den
// localStorage-Seed sonst mit [] ueberschreiben — dieselbe Falle wie bei den
// Produktkatalog-Pools oben.
async function wireMl(ctx, ml) {
  await ctx.route('**/*', route => {
    const req = route.request(), u = req.url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
      if (req.method() !== 'GET') {
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      }
      const body = (u.indexOf('module_key=eq.abnahme') >= 0 && u.indexOf('like.abml') >= 0)
        ? (ml || []).map(r => ({ data_key: 'abml:' + r.id, payload: { data: r, _lm: 1 } }))
        : [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) {
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    return route.abort();
  });
}

async function tabOeffnen(page, id) {
  await page.evaluate(t => { try { switchToTab(t); } catch (e) {} }, id);
  await page.waitForTimeout(250);
}

const server = await startServer();
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

try {
  // ══════════════════════════════════════════════════════════════════════
  // TEIL A — Lieferanten-Dashboard
  // ══════════════════════════════════════════════════════════════════════

  // ── A1) Jede Rubrik hat ein Suchfeld ──
  console.log('── A1: Suchfeld in jeder Rubrik ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed());
    await wirePools(ctx);
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e)));
    await page.goto(BASE + '/sys_lieferant_dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);

    // Jede Rubrik mit einer Liste bekommt ein Suchfeld — die Übersicht und
    // das Firmenprofil bewusst NICHT (dort gibt es nichts zu filtern).
    const rubriken = [
      { tab: 'produkte', feld: 'suchProd' },
      { tab: 'anfragen', feld: 'suchOa' },
      { tab: 'bestellungen', feld: 'suchBest' },
      { tab: 'revision', feld: 'suchRev' },
      { tab: 'rohrsysteme', feld: 'suchRs' },
      { tab: 'werkzeuge', feld: 'suchWz' },
      { tab: 'mitarbeiter', feld: 'suchMa' }
    ];
    for (const r of rubriken) {
      await tabOeffnen(page, r.tab);
      const st = await page.evaluate(id => {
        const el = document.getElementById(id);
        if (!el) return { da: false };
        const cs = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        return { da: true, sichtbar: cs.display !== 'none' && b.width > 0, breite: Math.round(b.width) };
      }, r.feld);
      ok(st.da, 'Rubrik «' + r.tab + '» hat ein Suchfeld (#' + r.feld + ')');
      ok(st.da && st.sichtbar, 'Suchfeld «' + r.feld + '» ist sichtbar');
      // Die Breitenbegrenzung gehoert ins CSS — .fc ist width:100%
      ok(st.da && st.breite > 100 && st.breite <= 280,
        'Suchfeld «' + r.feld + '» hat eine sinnvolle Breite (ist: ' + st.breite + 'px)');
    }
    ok(fehler.length === 0, 'keine JS-Fehler beim Öffnen aller Rubriken (' + fehler.join(' | ') + ')');
    await ctx.close();
  }

  // ── A2) Live-Filterung: tippen filtert sofort, ohne Absende-Klick ──
  console.log('── A2: Live-Filterung ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed());
    await wirePools(ctx);
    await page.goto(BASE + '/sys_lieferant_dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);

    // Produkte: 2 Enthärter + 1 Rohrsystem
    await tabOeffnen(page, 'produkte');
    const vorher = await page.$$eval('#prodList .prod-row', els => els.length);
    ok(vorher === 3, 'Produktkatalog zeigt zunächst alle 3 Produkte (ist: ' + vorher + ')');
    await page.fill('#suchProd', 'rondomat');
    await page.waitForTimeout(200);
    const nachher = await page.$$eval('#prodList .prod-row', els => els.length);
    ok(nachher === 1, 'Suche «rondomat» filtert live auf 1 Treffer (ist: ' + nachher + ')');
    const txt = await page.textContent('#prodList');
    ok(/Rondomat/.test(txt) && !/AQA/.test(txt), 'gefiltert wird der richtige Datensatz');

    // Mehrere Wörter sind UND-verknüpft
    await page.fill('#suchProd', 'weichwasser aqa');
    await page.waitForTimeout(200);
    const undTreffer = await page.$$eval('#prodList .prod-row', els => els.length);
    ok(undTreffer === 1, 'zwei Wörter sind UND-verknüpft (ist: ' + undTreffer + ')');
    await page.fill('#suchProd', 'weichwasser optipress');
    await page.waitForTimeout(200);
    const undLeer = await page.$$eval('#prodList .prod-row', els => els.length);
    ok(undLeer === 0, 'Wörter aus verschiedenen Datensätzen ergeben keinen Treffer');

    // Kein Treffer: der Leerzustand nennt den Filter, statt «nichts vorhanden»
    // zu behaupten (No-silent-caps-Regel).
    const leer = await page.textContent('#prodList');
    ok(/Keine Treffer/.test(leer) && /optipress/i.test(leer),
      'Leerzustand nennt den Suchbegriff');
    ok(/Suche zurücksetzen/.test(leer), 'Leerzustand bietet den Weg zurück an');
    await page.click('#prodList button');
    await page.waitForTimeout(250);
    const zurueck = await page.$$eval('#prodList .prod-row', els => els.length);
    ok(zurueck === 3, '«Suche zurücksetzen» stellt die volle Liste her (ist: ' + zurueck + ')');

    // Offertanfragen
    await tabOeffnen(page, 'anfragen');
    await page.fill('#suchOa', 'schulhaus');
    await page.waitForTimeout(200);
    const oaTxt = await page.textContent('#oaList');
    ok(/Riedmatt/.test(oaTxt) && !/Sonnenhalde/.test(oaTxt),
      'Offertanfragen: Suche über den Projektnamen greift');
    await page.fill('#suchOa', 'suedplan');
    await page.waitForTimeout(200);
    ok(/Riedmatt/.test(await page.textContent('#oaList')),
      'Offertanfragen: Suche über die Absender-Firma greift');

    // Bestellungen
    await tabOeffnen(page, 'bestellungen');
    await page.fill('#suchBest', 'BST-2026-002');
    await page.waitForTimeout(200);
    const bTxt = await page.textContent('#bestList');
    ok(/BST-2026-002/.test(bTxt) && !/BST-2026-001/.test(bTxt),
      'Bestellungen: Suche über die Bestell-Nr. greift');
    await page.fill('#suchBest', 'zug');
    await page.waitForTimeout(200);
    ok(/BST-2026-002/.test(await page.textContent('#bestList')),
      'Bestellungen: Suche über die Lieferadresse greift');

    // Revisionsanfragen
    await tabOeffnen(page, 'revision');
    await page.fill('#suchRev', 'sonnenhalde');
    await page.waitForTimeout(200);
    const rTxt = await page.textContent('#revAnfragenList');
    ok(/AQA/.test(rTxt) && !/Rondomat/.test(rTxt),
      'Revisionsanfragen: Suche über das Projekt greift');

    // Rohrsysteme & Armaturen — EIN Feld für beide Listen der Rubrik
    await tabOeffnen(page, 'rohrsysteme');
    await page.fill('#suchRs', 'optipress');
    await page.waitForTimeout(250);
    const rsTxt = await page.textContent('#rsListe');
    const armTxt = await page.textContent('#armListe');
    ok(/Optipress/.test(rsTxt), 'Rohrsysteme: Treffer bleibt stehen');
    ok(/Keine Treffer/.test(armTxt),
      'dasselbe Feld filtert auch die Armaturen-Liste (Leerzustand mit Filterbezug)');
    await page.fill('#suchRs', 'kugelhahn');
    await page.waitForTimeout(250);
    ok(/Kugelhahn/.test(await page.textContent('#armListe')), 'Armaturen: Suche greift');

    // Mitarbeiter
    await tabOeffnen(page, 'mitarbeiter');
    await page.fill('#suchMa', 'petra');
    await page.waitForTimeout(200);
    const maTxt = await page.textContent('#liefUserList');
    ok(/Petra/.test(maTxt) && !/Hans Muster/.test(maTxt), 'Mitarbeiter: Suche über den Namen greift');
    await ctx.close();
  }

  // ── A3) Fokus-Regel: das Suchfeld überlebt jeden Tastendruck ──
  console.log('── A3: Fokus bleibt beim Tippen ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed());
    await wirePools(ctx);
    await page.goto(BASE + '/sys_lieferant_dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await tabOeffnen(page, 'produkte');
    await page.click('#suchProd');
    // Zeichen fuer Zeichen tippen — der Renderer ersetzt bei JEDEM Zeichen
    // die Liste; das Suchfeld liegt ausserhalb und darf den Fokus behalten.
    await page.type('#suchProd', 'rondomat', { delay: 30 });
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => ({
      aktiv: document.activeElement && document.activeElement.id,
      wert: (document.getElementById('suchProd') || {}).value,
      pos: (document.getElementById('suchProd') || {}).selectionStart
    }));
    ok(st.aktiv === 'suchProd', 'Fokus bleibt im Suchfeld (ist: ' + st.aktiv + ')');
    ok(st.wert === 'rondomat', 'jedes Zeichen kommt an (ist: «' + st.wert + '»)');
    ok(st.pos === 8, 'Cursor steht am Ende (ist: ' + st.pos + ')');
    await ctx.close();
  }

  // ── A4) KPI-Kachel leert die Suche des Ziel-Tabs ──
  console.log('── A4: KPI-Kachel vs. aktive Suche ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed());
    await wirePools(ctx);
    await page.goto(BASE + '/sys_lieferant_dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await tabOeffnen(page, 'produkte');
    await page.fill('#suchProd', 'rondomat');
    await page.waitForTimeout(200);
    // Die KPI-Kachel verspricht «N Produkte» — mit stehengebliebener Suche
    // wuerde die Liste diese Zahl nicht decken.
    await tabOeffnen(page, 'uebersicht');
    await page.evaluate(() => _kpiGo('produkte', 'prodStatusFilter', ''));
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({
      q: (document.getElementById('suchProd') || {}).value,
      n: document.querySelectorAll('#prodList .prod-row').length
    }));
    ok(s.q === '', 'KPI-Klick leert das Suchfeld (ist: «' + s.q + '»)');
    ok(s.n === 3, 'die Liste zeigt danach wieder alle Produkte (ist: ' + s.n + ')');
    await ctx.close();
  }

  // ── A5) Karte «Berechnungen zu meinem Sortiment» steht ZULETZT ──
  console.log('── A5: Sortiment-Karte ganz unten ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed());
    await wirePools(ctx);
    await page.goto(BASE + '/sys_lieferant_dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const pos = await page.evaluate(() => {
      const tab = document.getElementById('tb-uebersicht');
      if (!tab) return null;
      const karten = Array.from(tab.querySelectorAll(':scope > .card'));
      const idx = karten.findIndex(c => c.id === 'cardMeineBerechnungen');
      return { anzahl: karten.length, idx: idx, ids: karten.map(c => c.id || '(ohne id)') };
    });
    ok(pos && pos.anzahl >= 3, 'Übersicht hat mehrere Karten (ist: ' + (pos ? pos.anzahl : '—') + ')');
    ok(pos && pos.idx === pos.anzahl - 1,
      'Karte «Berechnungen zu meinem Sortiment» steht ZULETZT (ist Platz ' +
      (pos ? (pos.idx + 1) + ' von ' + pos.anzahl : '—') + ')');
    // Der Inhalt bleibt erreichbar — verschoben, nicht entfernt
    ok(!!(await page.$('#meineBerechnungen')), 'Karteninhalt (#meineBerechnungen) unverändert vorhanden');
    await ctx.close();
  }

  // ══════════════════════════════════════════════════════════════════════
  // TEIL B — Abnahmeprotokoll: Sicht des Mängel-Bearbeiters
  // ══════════════════════════════════════════════════════════════════════
  console.log('── B: Abnahme — Sicht des Mängel-Bearbeiters ──');
  {
    // Ein Monteur, dem eine Mängelliste übergeben wurde, arbeitet sie ab —
    // er darf das Protokoll dabei nicht verändern.
    // Die User-ID bleibt bewusst 'u_test' — sie steckt auch in der Session,
    // und der Boot-Check verwirft eine Sitzung ohne passenden Benutzer.
    const s = seed(['role_monteur']);
    s.gema_users_v1[0].name = 'Baran Koc';
    s.gema_coachmarks_done_abnahme = '1';
    s.gema_abnahme_ml_pool_v1 = [{
      id: 'ml1', orgId: 'org_test', protoId: 'pr1', protoName: 'Protokoll 1',
      objektId: 'o1', objektName: 'Neubau Sonnenhalde',
      monteurUserId: 'u_test', monteurName: 'Baran Koc',
      verantwortlich: { userId: 'u_pl', name: 'Anna Meier', firma: 'Planer Nord AG' },
      status: 'offen', erstelltAm: '2026-08-22T09:00:00Z',
      projekt: {
        adresse: 'Sonnenweg 4, 4051 Basel',
        arbeitsgattung: '250 Sanitäranlagen',
        beteiligte: [
          { rolle: 'Bauherrschaft', name: 'Hans Bauer', firma: 'Bauherr AG' },
          { rolle: 'Fachbauleitung', name: 'Anna Meier', firma: 'Planer Nord AG' }
        ]
      },
      items: [
        { itemId: 'm1', ort: 'Bad EG', mangel: 'Silikonfuge unsauber', status: 'offen', fixFotos: [] },
        { itemId: 'm2', ort: 'Küche', mangel: 'Eckventil undicht', status: 'offen', fixFotos: [] }
      ]
    }];
    const { ctx, page } = await newPage(browser, s);
    // Ohne Cloud-Mock wuerde bindCollection den ML-Seed mit [] ueberschreiben.
    await wireMl(ctx, s.gema_abnahme_ml_pool_v1);
    const fehler = [];
    page.on('pageerror', e => fehler.push(String(e)));
    await page.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    ok(fehler.length === 0, 'pm_abnahme öffnet ohne JS-Fehler (' + fehler.join(' | ') + ')');

    // Die Mängelliste selbst ist da
    const tasks = await page.textContent('#abTasks').catch(() => '');
    ok(/Silikonfuge/.test(tasks), 'die zu behebenden Mängel sind sichtbar');

    const sicht = await page.evaluate(() => {
      const sichtbar = el => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        return el.getBoundingClientRect().height > 0;
      };
      return {
        nurMaengel: !!(document.body.classList.contains('ab-nur-maengel')),
        protoLeiste: sichtbar(document.querySelector('.proto-sel')),
        tabs: sichtbar(document.querySelector('.tabs-bar')),
        abnahmeView: sichtbar(document.getElementById('view_abnahme')),
        maengelView: sichtbar(document.getElementById('view_maengel')),
        footer: sichtbar(document.querySelector('.footer-bar')),
        // Projektangaben kommen als Info-Block IN der Aufgaben-Sektion
        projektInfo: !!document.querySelector('#abTasks .ab-projinfo')
      };
    });
    ok(sicht.nurMaengel, 'Body trägt den Modus «nur Mängel»');
    ok(!sicht.protoLeiste, 'Protokoll-Verwaltung (neues Protokoll erstellen) ist weg');
    ok(!sicht.tabs, 'die Protokoll-Tabs sind weg');
    ok(!sicht.abnahmeView, 'der Protokollkopf mit den Projektangaben ist weg');
    ok(!sicht.maengelView, 'die bearbeitbare Mängel-Tabelle des Protokolls ist weg');
    ok(!sicht.footer, 'die Fusszeile (Reset / PDF) ist weg');
    ok(sicht.projektInfo, 'stattdessen stehen die Projektangaben kompakt in der Mängelliste');

    // Projektangaben inhaltlich: Objekt, Adresse und die Beteiligten
    const info = await page.textContent('#abTasks .ab-projinfo').catch(() => '');
    ok(/Sonnenhalde/.test(info), 'Projektangaben nennen das Objekt');
    ok(/Sonnenweg 4/.test(info), 'Projektangaben nennen die Adresse');
    ok(/Anna Meier/.test(info), 'Projektangaben nennen die Beteiligten (Planer etc.)');

    // KERN: nichts am Protokoll ist änderbar
    const eingaben = await page.evaluate(() => {
      const felder = Array.from(document.querySelectorAll(
        '#view_abnahme input, #view_abnahme select, #view_abnahme textarea,' +
        '#view_maengel input, #view_maengel select, #view_maengel textarea,' +
        '.proto-sel input, .proto-sel select'));
      // sichtbar UND bedienbar?
      return felder.filter(el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (el.getBoundingClientRect().height === 0) return false;
        return !el.disabled && !el.readOnly;
      }).length;
    });
    ok(eingaben === 0, 'kein bedienbares Eingabefeld des Protokolls erreichbar (ist: ' + eingaben + ')');

    // Unterschriften: weder Pad noch Namensfelder
    const sig = await page.evaluate(() => {
      const c = document.querySelector('canvas.sig');
      if (!c) return { da: false };
      const cs = getComputedStyle(c);
      return {
        da: true,
        sichtbar: cs.display !== 'none' && c.getBoundingClientRect().height > 0,
        events: cs.pointerEvents
      };
    });
    ok(!sig.da || !sig.sichtbar, 'kein Unterschriften-Pad bedienbar');

    // Gegenprobe: der Planer/Ersteller sieht das volle Protokoll
    await ctx.close();
  }

  console.log('── B2: Gegenprobe — der Planer sieht alles ──');
  {
    const s = seed(['role_planer']);
    const { ctx, page } = await newPage(browser, s);
    await page.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const sicht = await page.evaluate(() => {
      const sichtbar = el => !!el && getComputedStyle(el).display !== 'none' &&
        el.getBoundingClientRect().height > 0;
      return {
        nurMaengel: document.body.classList.contains('ab-nur-maengel'),
        protoLeiste: sichtbar(document.querySelector('.proto-sel')),
        tabs: sichtbar(document.querySelector('.tabs-bar')),
        abnahmeView: sichtbar(document.getElementById('view_abnahme'))
      };
    });
    ok(!sicht.nurMaengel, 'Planer: kein «nur Mängel»-Modus');
    ok(sicht.protoLeiste, 'Planer: Protokoll-Verwaltung sichtbar');
    ok(sicht.tabs, 'Planer: Tabs sichtbar');
    ok(sicht.abnahmeView, 'Planer: Protokollkopf bearbeitbar');
    await ctx.close();
  }

} finally {
  await browser.close();
  await server.close();
}

console.log('\n' + (fail ? '✗ ' + fail + ' fehlgeschlagen, ' : '✓ ') + pass + ' Checks bestanden');
process.exit(fail ? 1 : 0);
