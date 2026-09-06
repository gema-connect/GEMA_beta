// Drift-Guard «Summenliniendiagramm» (sb_summenlinien.html)
//
// Das Modul ist aus «Warmwasser SIA 385» (Tab ⑤) herausgeloest. Der Guard
// haelt drei Zusagen fest:
//   A) Engine — Profile, Rotation, Ladefenster, Mindestspeicher, Leistung ⇄
//      Aufwaermzeit; inkl. GEGENPROBE gegen die Engine von sb_warmwasser
//      (gleiche Eingaben → gleiches Ergebnis, sonst driften die zwei Module).
//   B) Markup/Kanon — keine type="number", Nav-Kanon, Feedback-init, eigener
//      document.title, isTrusted-Guard, Snapshot-Fallback, Registrierung.
//   C) Browser (Playwright) — Profilwechsel, freie Ueberschreibung der 24
//      Stundenwerte, Fokus-Regel, Canvas, Aufwaermzeit-Umschaltung, ehrliche
//      Meldungen. Layer C wird uebersprungen, wenn playwright-core fehlt.
//
// Aufruf:  node scripts/summenlinien_test.mjs
//          CHROME=<chromium> node scripts/summenlinien_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8917;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-9 : eps);

const HTML = readFileSync(join(ROOT, 'sb_summenlinien.html'), 'utf8');
const WW = readFileSync(join(ROOT, 'sb_warmwasser.html'), 'utf8');

// ── Engine eines Moduls herausschneiden und ausfuehren ────────────────
function engine(src, exportNames) {
  const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
  if (!m) return null;
  const box = {};
  const tail = exportNames.map(n => 'try{this.' + n + '=' + n + ';}catch(e){}').join('');
  new Function(m[1] + ';' + tail).call(box);
  return box;
}

console.log('■ A — Engine');
const E = engine(HTML, ['SL_PROFILE', 'SL_START_DEFAULT', 'slZahl', 'slRotate', 'slSumme', 'slNormiere',
  'slSpitze', 'slProfilEff', 'slClock', 'slT', 'slSegmente', 'slArrays', 'slMinSpeicher', 'slSim',
  'slLaderate', 'slAufwaermzeit', 'slLadeleistung']);
ok(!!E, 'ENGINE-Block extrahierbar und lauffähig');
const W = engine(WW, ['WW_SL_PROFILE', 'WW_TYP_PROFILE', 'wwSlSegmente', 'wwSlArrays', 'wwSlMinSpeicher', 'wwSlSim', 'wwTypProfilEff']);
ok(!!W, 'Warmwasser-Engine als Referenz ladbar');

// A1 — Profile: 24 Werte, Σ = 100 (das leere Profil ist bewusst 0)
let profOk = true, profN = 0;
for (const k of Object.keys(E.SL_PROFILE)) {
  const p = E.SL_PROFILE[k]; profN++;
  if (p.pct.length !== 24) { profOk = false; console.log('    ' + k + ': ' + p.pct.length + ' Werte'); }
  const s = E.slSumme(p.pct);
  if (!p.frei && Math.abs(s - 100) > 0.001) { profOk = false; console.log('    ' + k + ': Σ = ' + s); }
  if (p.frei && s !== 0) { profOk = false; console.log('    ' + k + ': freies Profil ist nicht leer'); }
}
ok(profN >= 15, 'mindestens 15 Profile im Katalog (' + profN + ')');
ok(profOk, 'jedes Profil hat 24 Stundenwerte, Σ = 100 % (freies Profil = 0)');
ok(Object.keys(E.SL_PROFILE).some(k => /hotel/.test(k)) && Object.keys(E.SL_PROFILE).some(k => /wohnbau/.test(k)),
   'Hotel- und Wohnbau-/Mehrfamilienhaus-Profile wählbar');

// A2 — GEGENPROBE Datenherkunft: die VSSH-Blaetter sind 05:00-basiert gedruckt,
// hier stehen sie auf Mitternacht zurueckgedreht. SL[i] = WWSL[(i+19)%24].
const PAARE_VSSH = [['wohnbau_mo_do', 'wohnbau_mo_do'], ['wohnbau_fr', 'wohnbau_fr'], ['wohnbau_sa', 'wohnbau_sa'],
  ['wohnbau_so', 'wohnbau_so'], ['altersheim', 'altersheim'], ['cafe_restaurant', 'cafe_restaurant'],
  ['stadthotel', 'stadthotel'], ['touristenhotel', 'touristenhotel'], ['spital', 'spital']];
let rotOk = true;
PAARE_VSSH.forEach(([a, b]) => {
  const src = W.WW_SL_PROFILE[b];
  if (!src) { rotOk = false; console.log('    Warmwasser kennt kein Profil ' + b); return; }
  for (let h = 0; h < 24; h++) {
    if (!near(E.SL_PROFILE[a].pct[h], src.pct[(h + 19) % 24], 1e-9)) {
      rotOk = false; console.log('    ' + a + ' Stunde ' + h + ': ' + E.SL_PROFILE[a].pct[h] + ' ≠ ' + src.pct[(h + 19) % 24]);
      break;
    }
  }
});
ok(rotOk, 'VSSH-Profile decken sich mit sb_warmwasser (auf Mitternacht zurückgedreht)');
// Die mitternachtsbasierten Reihen stehen 1:1 wie in sb_warmwasser
const PAARE_TYP = [['wohnbau_sia', 'wohnbau'], ['stadthotel', 'hotel'], ['touristenhotel', 'hotel_tourist'],
  ['altersheim', 'altersheim'], ['spital', 'spital'], ['cafe_restaurant', 'restaurant'],
  ['altersheim_din', 'altersheim_din'], ['spital_din', 'spital_din'], ['studentenheim', 'studentenheim'],
  ['buero', 'buero'], ['restaurant_din', 'restaurant_din']];
let typOk = true;
PAARE_TYP.forEach(([a, b]) => {
  const src = W.WW_TYP_PROFILE[b];
  if (!src) { typOk = false; console.log('    Warmwasser kennt kein Typ-Profil ' + b); return; }
  for (let h = 0; h < 24; h++) if (!near(E.SL_PROFILE[a].pct[h], src.pct[h], 1e-9)) { typOk = false; console.log('    ' + a + ' ≠ ' + b + ' bei Stunde ' + h); break; }
});
ok(typOk, 'Gebäudetyp-Profile stehen wertgleich zu WW_TYP_PROFILE');
// Ehrlichkeit: das DIN-Restaurantblatt traegt in der Quelle dieselbe Reihe wie
// das Altersheim — unveraendert uebernommen UND als solches gekennzeichnet.
ok(JSON.stringify(E.SL_PROFILE.restaurant_din.pct) === JSON.stringify(E.SL_PROFILE.altersheim_din.pct)
   && E.SL_PROFILE.restaurant_din.gleichWie === 'altersheim_din',
   'doppelte Quellreihe (DIN Restaurant = Altersheim) unverändert und markiert');

// A3 — Rotation auf den Diagrammbeginn
const rot5 = E.slRotate(E.SL_PROFILE.wohnbau_mo_do.pct, 5);
ok(rot5.length === 24 && near(rot5[0], E.SL_PROFILE.wohnbau_mo_do.pct[5]) && near(rot5[23], E.SL_PROFILE.wohnbau_mo_do.pct[4]),
   'slRotate: Index 0 = Diagrammbeginn, Ringschluss stimmt');
ok(near(E.slSumme(rot5), 100, 1e-9), 'Rotation ändert die Summe nicht');
ok(E.SL_START_DEFAULT === 5, 'Diagrammbeginn steht per Vorgabe auf 05:00 (VSSH)');

// A4 — Uhrzeit-Umrechnung ist in beide Richtungen konsistent
let clkOk = true;
[0, 5, 9, 17, 23].forEach(st => {
  for (let t = 0; t < 24; t++) if (Math.abs(E.slT(E.slClock(t, st), st) - t) > 1e-9) { clkOk = false; }
});
ok(clkOk, 'slClock/slT sind für jeden Diagrammbeginn zueinander invers');
ok(E.slClock(0, 5) === '05:00' && E.slClock(19, 5) === '00:00', 'slClock rechnet auf die Uhrzeit (Beginn 05:00)');

// A5 — Spitzenstunden-Überschreibung (Mechanik SIA 385/2)
const basis = E.SL_PROFILE.wohnbau_sia.pct;
const eff = E.slProfilEff(basis, 20);
const kIdx = E.slSpitze(basis).idx;
ok(near(eff[kIdx], 20, 1e-9), 'slProfilEff: Spitzenstunde trägt den vorgegebenen Anteil');
ok(near(E.slSumme(eff), 100, 1e-9), 'slProfilEff: übrige Stunden skalieren auf Σ 100 %');
ok(JSON.stringify(E.slProfilEff(basis, 0)) === JSON.stringify(basis.map(Number)), 'slProfilEff: 0 = keine Überschreibung');
ok(near(E.slProfilEff(basis, 150)[kIdx], 100, 1e-9), 'slProfilEff: > 100 % wird geklemmt statt negativ zu rechnen');
// Gegenprobe zur Excel-Mechanik in sb_warmwasser (gleiches Basisprofil)
const wEff = W.wwTypProfilEff('wohnbau', 20);
let effOk = true;
for (let h = 0; h < 24; h++) if (!near(eff[h], wEff[h], 1e-9)) { effOk = false; break; }
ok(effOk, 'Spitzenstunden-Mechanik deckt sich mit wwTypProfilEff');

// A6 — Normieren erfindet nichts
ok(near(E.slSumme(E.slNormiere([1, 2, 3].concat(new Array(21).fill(0)))), 100, 1e-9), 'slNormiere: Σ wird 100 %');
ok(JSON.stringify(E.slNormiere(new Array(24).fill(0))) === JSON.stringify(new Array(24).fill(0)),
   'slNormiere: Σ = 0 bleibt unverändert (kein erfundener Wert)');

// A7 — Ladefenster
const segA = E.slSegmente([{ aktiv: true, von: '03:00', bis: '07:00' }, { aktiv: false, von: '15:00', bis: '19:00' }], 5);
ok(segA.length === 2 && near(segA[0][0], 0) && near(segA[0][1], 2) && near(segA[1][0], 22) && near(segA[1][1], 24),
   'slSegmente: Fenster über den Diagrammrand wird geteilt, «aus» wird ignoriert');
const segB = E.slSegmente([{ aktiv: true, von: '08:00', bis: '12:00' }, { aktiv: true, von: '10:00', bis: '14:00' }], 5);
ok(segB.length === 1 && near(segB[0][0], 3) && near(segB[0][1], 9), 'slSegmente: überlappende Fenster werden zusammengefasst');
// Gegenprobe: identische Segmente wie sb_warmwasser bei dessen fixem Beginn 05:00
const segW = W.wwSlSegmente([{ aktiv: true, von: '03:00', bis: '07:00' }]);
const segS = E.slSegmente([{ aktiv: true, von: '03:00', bis: '07:00' }], 5);
ok(JSON.stringify(segW) === JSON.stringify(segS), 'Ladefenster-Segmente decken sich mit sb_warmwasser');

// A8 — Mindestspeicher + Simulation: Gegenprobe gegen die Warmwasser-Engine
const pctDia = E.slRotate(E.SL_PROFILE.wohnbau_mo_do.pct, 5);
const pctH = 4.1666;
const As = E.slArrays(pctDia, pctH, [[0, 24]], 12);
const Aw = W.wwSlArrays(W.WW_SL_PROFILE.wohnbau_mo_do.pct, pctH, [[0, 24]], 12);
ok(As.n === Aw.n && near(As.v[As.n], Aw.v[Aw.n], 1e-9), 'slArrays liefert dieselbe Summenlinie wie wwSlArrays');
const msS = E.slMinSpeicher(As.verb, As.lad), msW = W.wwSlMinSpeicher(Aw.verb, Aw.lad);
ok(near(msS.pct, msW.pct, 1e-9) && msS.startIdx === msW.startIdx && msS.endIdx === msW.endIdx,
   'slMinSpeicher deckt sich mit wwSlMinSpeicher (Wert + kritische Spanne)');
ok(msS.pct > 0, 'erforderliches Speichervolumen > 0 bei durchgehender Ladung mit knapper Leistung (' + msS.pct.toFixed(2) + ' %)');
const simS = E.slSim(As.verb, As.lad, msS.pct), simW = W.wwSlSim(Aw.verb, Aw.lad, msW.pct);
ok(near(simS.unmetPct, simW.unmetPct, 1e-9), 'slSim deckt sich mit wwSlSim');
// Genau am Minimum bleibt nur Rundungsrauschen (Speicherdeckelung im
// Zeitschritt) — weit unter der Meldeschwelle der UI von 0.5 %.
ok(simS.unmetPct < 0.01, 'genau das Minimum deckt den Tag (Restrauschen ' + simS.unmetPct.toFixed(4) + ' %)');
// Zu kleiner Speicher wird GEMELDET, nicht stillschweigend geklemmt
const simKlein = E.slSim(As.verb, As.lad, msS.pct / 2);
ok(simKlein.unmetPct > 0 && simKlein.unmetSegs.length > 0, 'zu kleiner Speicher: Unterdeckung wird beziffert und verortet');

// A9 — Leistung ⇄ Aufwärmzeit
const V = 1000, dT = 50;
const tAuf = E.slAufwaermzeit(V, dT, 50);
ok(near(tAuf, 1000 * 4.187 * 50 / (3600 * 50), 1e-9), 'slAufwaermzeit rechnet Q = V·4.187·∆θ');
ok(near(E.slLadeleistung(V, dT, tAuf), 50, 1e-9), 'Leistung ⇄ Aufwärmzeit ist umkehrbar (Rundreise)');
ok(near(E.slLaderate(50, 50), 50 * 3600 / (4.187 * 50), 1e-9), 'slLaderate = P·3600/(4.187·∆θ)');
ok(E.slAufwaermzeit(V, 0, 50) === 0 && E.slLadeleistung(V, 0, 2) === 0 && E.slLaderate(50, 0) === 0,
   '∆θ ≤ 0 liefert 0 statt einer Division durch null');
ok(E.slAufwaermzeit(0, dT, 50) === 0 && E.slLadeleistung(0, dT, 2) === 0, 'ohne Volumen kein erfundener Wert');
// Komma-Eingaben und Apostroph-Tausender werden gelesen
ok(near(E.slZahl("1'250,5"), 1250.5, 1e-9) && E.slZahl('') === 0 && E.slZahl('abc') === 0, 'slZahl liest Komma/Apostroph, Unsinn wird 0');

console.log('■ B — Markup & Kanon');
ok(!/type="number"/.test(HTML), 'kein type="number" in der Datei');
const numInputs = HTML.match(/<input[^>]*inputmode="decimal"[^>]*>/g) || [];
ok(numInputs.length >= 9 && numInputs.every(t => /onblur="fixLeadingZero\(this\)"/.test(t)),
   'jedes Zahlenfeld trägt inputmode="decimal" + fixLeadingZero (' + numInputs.length + ')');
ok(/<title>Summenliniendiagramm – GEMA<\/title>/.test(HTML), 'eigener document.title (= PDF-Dateiname)');
ok((HTML.match(/<a class="g-nav-logo" href="index\.html">/g) || []).length === 1, 'genau eine Logo-Variante in der Nav, href=index.html');
ok(/class="bc-cat" href="sb_index\.html">Sanitärberechnungen<[\s\S]{0,200}class="bc-cur">Summenliniendiagramm</.test(HTML),
   'Breadcrumb-Kanon: Sanitärberechnungen › Summenliniendiagramm');
ok(/gema-feedback-btn[^>]*onclick="GemaFeedback\.start\(\)"/.test(HTML) && /GemaFeedback\.init\('summenlinien'/.test(HTML),
   'Feedback-Knopf + GemaFeedback.init vorhanden');
ok(HTML.indexOf('gema_responsive.css') > HTML.lastIndexOf('</style>'), 'gema_responsive.css steht NACH dem eigenen <style>');
ok(/gema_berechnungs_tabs\.js/.test(HTML), 'gema_berechnungs_tabs.js eingebunden (mehrere Berechnungen pro Objekt)');
ok(/GemaAutoSave\.init\('summenlinien'\)/.test(HTML), 'AutoSave auf den Modul-Key summenlinien');
ok(/function slSnapshotLoad\(\)/.test(HTML) && /\[700,1800,3500\]/.test(HTML), 'Snapshot-Fallback (700/1800/3500 ms) vorhanden');
// isTrusted-Guard: der Profilwechsel darf die 24 Werte NUR bei echter
// Benutzeraktion ueberschreiben (AutoSave-Restore feuert synthetische Events).
const profHandler = (HTML.match(/function slProfilGewaehlt\(ev\)\{[\s\S]*?\n\}/) || [''])[0];
ok(/ev&&ev\.isTrusted/.test(profHandler), 'slProfilGewaehlt hat den isTrusted-Guard');
// Fokus-Regel: slUpdate darf das Stundenraster nicht neu bauen
const upd = (HTML.match(/function slUpdate\(\)\{[\s\S]*?\n\}\n<\/script>/) || [''])[0];
ok(upd.length > 500 && !/slHourGrid[^\n]*innerHTML/.test(upd) && !/slBaueStundenfelder\(\)/.test(upd),
   'slUpdate baut die 24 Stundenfelder NICHT neu (Fokus-Regel)');
ok(/if\(el===document\.activeElement\)return;/.test(HTML), 'Snapshot-Fallback fasst ein aktives Feld nicht an');
// Canvas/SVG: nur literale Farben
const drawSrc = HTML.slice(HTML.indexOf('var SL_COL='), HTML.indexOf('function slTabelle'));
ok(drawSrc.length > 1000 && !/var\(--/.test(drawSrc), 'Canvas-Zeichnung nutzt nur literale Farben (GemaPDF-Regel)');
const simSrc = HTML.slice(HTML.indexOf('var S={t:0,playing'), HTML.indexOf('window._slSimHooks'));
ok(simSrc.length > 1000 && !/var\(--/.test(simSrc), 'Simulations-SVG nutzt nur literale Farben');
// Escaper deckt &<>"' ab
ok(/function slEsc\(s\)\{return String\(s==null\?'':s\)\.replace\(\/\[&<>"'\]\/g/.test(HTML), 'slEsc deckt & < > " \' ab');
// Cross-Modul: nur lesend, defensiv
ok(/function slWwSnapshot\(\)/.test(HTML) && !/persistCollection/.test(HTML), 'Warmwasser-Bezug ist rein lesend (kein Fremd-Write)');
ok(/Für dieses Objekt ist noch kein Stand aus/.test(HTML), 'fehlender Warmwasser-Stand wird benannt statt geraten');
// Ehrliche Meldungen statt stiller Deckel
['Kein Tagesgang erfasst', 'Tagesbedarf ist 0', 'Temperaturerhöhung ∆θ ist 0 oder negativ',
 'Unterdeckung von', 'deckt den Tagesbedarf nicht'].forEach(t => ok(HTML.indexOf(t) >= 0, 'Warnung vorhanden: «' + t + '»'));
ok(/wird nicht verwendet — es führt die Ladeleistung/.test(HTML), 'ungenutztes Aufwärmzeit-Feld wird benannt (kein stiller Wert)');
// Unterdeckung: die URSACHE wird benannt, nicht pauschal der Speicher beschuldigt
ok(/das erfasste Speichervolumen \('\+slFmt\(P\.speicherL,0\)/.test(HTML)
   && /sie kommt von der zu kleinen Ladekapazität, nicht vom Speicher/.test(HTML),
   'Unterdeckung unterscheidet zu kleinen Speicher von zu kleiner Ladekapazität');
ok(/gilt erst, wenn die Ladekapazität den Tagesbedarf deckt/.test(HTML),
   'Mindest-Speichervolumen wird qualifiziert, solange die Ladekapazität nicht deckt');

console.log('■ B2 — Registrierung des Moduls');
const AUTH = readFileSync(join(ROOT, 'gema_auth.js'), 'utf8');
ok(/'sb_summenlinien':'summenlinien'/.test(AUTH), 'FILE_MAP kennt sb_summenlinien');
ok(/key:'summenlinien',/.test(AUTH), 'MODULES kennt den Modul-Key summenlinien');
const WS = readFileSync(join(ROOT, 'sys_workspace.html'), 'utf8');
ok(/id:'sb_summenlinien'/.test(WS), 'sys_workspace-Katalog kennt das Modul');
ok(/sb_summenlinien:\{data:'gema_summenlinien'\}/.test(WS), '_WS_STATUS_CFG kennt den Datenschlüssel');
ok(/'sb_summenlinien':'Summenliniendiagramm'/.test(readFileSync(join(ROOT, 'gema_recent.js'), 'utf8')), 'gema_recent kennt das Label');
ok(/sb_summenlinien\.html/.test(readFileSync(join(ROOT, 'sw.js'), 'utf8')), 'Service-Worker cacht die Seite');
ok(/href="sb_summenlinien\.html"/.test(readFileSync(join(ROOT, 'sb_index.html'), 'utf8')), 'Kachel im Sanitär-Hub');
const WWSRC = readFileSync(join(ROOT, 'sb_warmwasser.html'), 'utf8');
ok(/href="sb_summenlinien\.html"/.test(WWSRC), 'Warmwasser verweist auf das ausgelagerte Diagramm');
ok(/feinTotal:r\.feinTotal\|\|0/.test(WWSRC) && /vstoEff:r\.vstoEff\|\|0/.test(WWSRC) && /leistung:parseFloat/.test(WWSRC),
   'wwSummary trägt Feinplanung, eff. Speicher und Leistung für die Übernahme (ADD-ONLY)');

// ── Layer C: Browser ─────────────────────────────────────────────────
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch (e) { chromium = null; }
if (!chromium || !existsSync(CHROME)) {
  console.log('■ C — Browser: übersprungen (playwright-core oder CHROME fehlt)');
} else {
  console.log('■ C — Browser');
  const server = createServer(async (req, res) => {
    try {
      let p = req.url.split('?')[0]; if (p === '/') p = '/sb_summenlinien.html';
      const d = await readFile(join(ROOT, p));
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
    } catch (e) { res.writeHead(404); res.end('nf'); }
  });
  await new Promise(r => server.listen(PORT, r));

  const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
  const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
  const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
  const SESSION = { token: 'x.y.z', userId: 'u1', expires: FUTURE };

  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return route.fulfill({ contentType: 'application/json', body: '[]' });
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); },
    { gema_orgs_v1: [ORG], gema_users_v1: USERS, gema_session_v1: SESSION });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/sb_summenlinien.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  ok(errs.length === 0, 'Seite bootet ohne pageerrors' + (errs.length ? ' — ' + errs[0] : ''));

  // C1 — Vorbefüllung aus dem Profil
  const start = await page.evaluate(() => {
    const v = []; for (let h = 0; h < 24; h++) v.push(parseFloat(document.getElementById('sl_p' + h).value) || 0);
    return { v, sum: v.reduce((a, b) => a + b, 0), profil: document.getElementById('sl_profil').value,
             chip: document.getElementById('sl_herkChip').textContent, sumTxt: document.getElementById('sl_sumTxt').textContent };
  });
  ok(Math.abs(start.sum - 100) < 0.01, '24 Stundenfelder sind aus dem Profil vorbefüllt (Σ ' + start.sum.toFixed(1) + ' %)');
  ok(/auto/.test(start.chip), 'Herkunfts-Chip steht auf «auto»');

  // C2 — Profilwechsel füllt die Werte neu — aber NUR bei echter Benutzeraktion.
  // Gegenprobe zum isTrusted-Guard: ein programmatisch gesetzter Wert (so
  // verhält sich der AutoSave-Restore) darf die 24 Felder NICHT überschreiben.
  await page.evaluate(() => {
    const s = document.getElementById('sl_profil');
    s.value = 'buero'; s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const synth = await page.evaluate(() => ({ p11: document.getElementById('sl_p11').value, profil: document.getElementById('sl_profil').value }));
  ok(synth.profil === 'buero' && Math.abs(parseFloat(synth.p11) - 5) < 1e-6,
     'isTrusted-Guard: synthetischer Profilwechsel überschreibt die Stundenwerte nicht');
  // Echte Benutzeraktion: Tastatur im nativen Select erzeugt ein trusted change
  await page.focus('#sl_profil');
  await page.keyboard.press('t');
  await page.waitForTimeout(250);
  const hotel = await page.evaluate(() => {
    const v = []; for (let h = 0; h < 24; h++) v.push(parseFloat(document.getElementById('sl_p' + h).value) || 0);
    return { v, sum: v.reduce((a, b) => a + b, 0), peak: document.getElementById('sl_peakTxt').textContent };
  });
  ok(Math.abs(hotel.v[18] - 20.5) < 1e-6, 'Profilwechsel «Touristenhotel» setzt die Spitzenstunde 18–19 Uhr auf 20.5 %');
  ok(Math.abs(hotel.sum - 100) < 0.01 && /18:00–19:00/.test(hotel.peak), 'Σ bleibt 100 %, Spitzenstunde wird ausgewiesen');

  // C3 — Einzelner Stundenwert frei überschreibbar + Fokus-Regel
  await page.click('#sl_p9', { clickCount: 3 });
  await page.type('#sl_p9', '12.5', { delay: 40 });
  await page.waitForTimeout(200);
  const fokus = await page.evaluate(() => ({
    wert: document.getElementById('sl_p9').value,
    aktiv: document.activeElement && document.activeElement.id,
    chip: document.getElementById('sl_herkChip').textContent,
    resetAus: document.getElementById('sl_herkReset').disabled,
    sum: document.getElementById('sl_sumTxt').textContent
  }));
  ok(fokus.wert === '12.5', 'getippter Stundenwert bleibt vollständig stehen (Fokus-Regel)');
  ok(fokus.aktiv === 'sl_p9', 'das Feld behält den Fokus während der Eingabe');
  ok(/eigene Eingabe/.test(fokus.chip) && fokus.resetAus === false, 'Herkunfts-Chip springt auf «eigene Eingabe», ↺ auto wird aktiv');
  ok(!/^100/.test(fokus.sum.trim()), 'abweichende Summe wird ausgewiesen statt still normiert (' + fokus.sum.trim() + ')');

  // C4 — ↺ auto holt das Profil zurück, Normieren korrigiert die Summe
  await page.evaluate(() => document.getElementById('sl_p9').blur());
  await page.click('#sl_herkReset');
  await page.waitForTimeout(200);
  const zurueck = await page.evaluate(() => ({ p9: document.getElementById('sl_p9').value, chip: document.getElementById('sl_herkChip').textContent }));
  ok(Math.abs(parseFloat(zurueck.p9) - 7) < 1e-6 && /auto/.test(zurueck.chip), '↺ auto stellt den Profilwert wieder her');
  await page.evaluate(() => { document.getElementById('sl_p9').value = '20'; document.getElementById('sl_p9').dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('button[onclick="slNormieren()"]');
  await page.waitForTimeout(200);
  const norm = await page.evaluate(() => {
    let s = 0; for (let h = 0; h < 24; h++) s += parseFloat(document.getElementById('sl_p' + h).value) || 0;
    return s;
  });
  ok(Math.abs(norm - 100) < 0.02, '«Σ auf 100 % normieren» skaliert alle Werte proportional');

  // C5 — Tagesbedarf, Leistung, Canvas
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('sl_bedarf', '2400'); set('sl_leistung', '30'); set('sl_tkw', '10'); set('sl_tsp', '60');
  });
  await page.waitForTimeout(300);
  const werte = await page.evaluate(() => {
    const cv = document.getElementById('slCanvas');
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let farbig = 0; for (let i = 0; i < d.length; i += 400) if (d[i + 3] > 0) farbig++;
    return {
      gemalt: farbig, breite: cv.width,
      bedarf: document.getElementById('sl_out_bedarf').textContent,
      dt: document.getElementById('sl_out_dt').textContent,
      rate: document.getElementById('sl_out_rate').textContent,
      speicher: document.getElementById('sl_out_speicher').textContent,
      tauf: document.getElementById('sl_out_tauf').textContent,
      vref: document.getElementById('sl_out_vref').textContent,
      msg: document.getElementById('sl_msg').textContent,
      tabelle: (document.querySelectorAll('#slTabelle td') || []).length
    };
  });
  ok(werte.gemalt > 50 && werte.breite > 400, 'Canvas wird tatsächlich gezeichnet (' + werte.gemalt + ' Stichproben mit Farbe)');
  ok(/2’400|2'400|2\.400/.test(werte.bedarf), 'Tagesbedarf steht als 100-%-Marke (' + werte.bedarf.slice(0, 24) + ')');
  ok(/50,0 K|50.0 K/.test(werte.dt), '∆θ = 50 K aus den beiden Temperaturen');
  ok(/30\.0 kW/.test(werte.rate) && /516 l\/h/.test(werte.rate) && /%\/h/.test(werte.rate),
     'Laderate wird aus Leistung und ∆θ gebildet (' + werte.rate.replace(/<[^>]*>/g, '').trim() + ')');
  ok(/%\s*=\s*[\d’.]+ l/.test(werte.speicher), 'erforderliches Speichervolumen wird in % und Litern beziffert (' + werte.speicher.trim() + ')');
  ok(werte.tabelle >= 72, 'Stundentabelle unter dem Diagramm ist gefüllt (' + werte.tabelle + ' Zellen)');
  // Reicht die Leistung in jeder Stunde, ist das Minimum 0 l — dann fehlt das
  // Bezugsvolumen der Aufwärmzeit. Das wird BENANNT, nicht als «–» versteckt.
  ok(/kein Bezugsvolumen/.test(werte.vref) && /nicht bestimmbar/.test(werte.tauf),
     'ohne Bezugsvolumen wird der Grund genannt statt still «–» gezeigt');
  ok(/Erforderliches Speichervolumen 0 l/.test(werte.msg), 'Minimum 0 l wird erklärt (Leistung deckt jede Stunde)');
  // Mit erfasstem Speicher folgt die Aufwärmzeit aus der Ladeleistung
  await page.evaluate(() => {
    const e = document.getElementById('sl_speicher'); e.value = '900'; e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  const auf = await page.evaluate(() => ({ tauf: document.getElementById('sl_out_tauf').textContent, vref: document.getElementById('sl_out_vref').textContent }));
  const sollH = 900 * 4.187 * 50 / (3600 * 30);          // = 1.7446 h → «1 h 45 min»
  ok(auf.tauf.indexOf(Math.floor(sollH) + ' h ' + String(Math.round((sollH % 1) * 60)).padStart(2, '0') + ' min') === 0,
     'Aufwärmzeit folgt aus Ladeleistung und Speichervolumen (' + auf.tauf.replace(/<[^>]*>/g, '').trim() + ')');
  ok(/900 l/.test(auf.vref), 'Bezugsvolumen = erfasstes Speichervolumen');
  const marken = await page.evaluate(() => ({
    p: document.getElementById('sl_markP').textContent, t: document.getElementById('sl_markT').textContent,
    fP: document.getElementById('sl_frmlP').style.display, fT: document.getElementById('sl_frmlT').style.display,
    dimT: document.getElementById('slRowZeit').classList.contains('sl-folgt')
  }));
  ok(marken.p === 'führt' && marken.t === 'folgt' && marken.dimT,
     'die führende Grösse ist markiert, die folgende gedämpft');
  ok(marken.fP === 'none' && marken.fT === 'inline', 'die Formel steht nur an der Zeile, die sie nutzt');

  // C6 — Aufwärmzeit führt: Leistung folgt
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('sl_speicher', '1000'); set('sl_aufwaerm', '2');
  });
  await page.selectOption('#sl_lead', 'zeit');
  await page.waitForTimeout(250);
  const lead = await page.evaluate(() => ({
    p: document.getElementById('sl_out_p').textContent,
    vref: document.getElementById('sl_out_vref').textContent
  }));
  const soll = 1000 * 4.187 * 50 / (3600 * 2);           // = 29.076… kW → «29.1 kW» (de-CH)
  ok(lead.p.indexOf(soll.toFixed(1)) >= 0, 'Vorgabe «Aufwärmzeit» errechnet die nötige Ladeleistung (' + lead.p.replace(/<[^>]*>/g, '').trim() + ')');
  ok(/1’000|1'000|1\.000/.test(lead.vref), 'Bezugsvolumen der Aufwärmzeit wird ausgewiesen');

  // C7 — Ehrliche Meldungen
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('sl_speicher', '0');
  });
  await page.waitForTimeout(250);
  const meld = await page.evaluate(() => {
    const m = document.getElementById('sl_msg');
    return { sicht: m.style.display !== 'none', txt: m.textContent };
  });
  ok(meld.sicht && /Speichervolumen/.test(meld.txt), 'Vorgabe «Aufwärmzeit» ohne Speichervolumen wird benannt statt geraten');
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    document.getElementById('sl_lead').value = 'leistung';
    document.getElementById('sl_lead').dispatchEvent(new Event('change', { bubbles: true }));
    set('sl_tsp', '5');
  });
  await page.waitForTimeout(250);
  const dtWarn = await page.evaluate(() => ({ dt: document.getElementById('sl_out_dt').textContent, msg: document.getElementById('sl_msg').textContent }));
  ok(/∆θ ≤ 0/.test(dtWarn.dt) && /Speichertemperatur muss über der Kaltwassertemperatur/.test(dtWarn.msg),
     'Speichertemperatur unter Kaltwasser: klare Meldung statt negativer Laderate');

  // C8 — Ladefenster + Unterdeckung
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('sl_tsp', '60'); set('sl_leistung', '8');
  });
  await page.selectOption('#sl_modus', 'fenster');
  await page.waitForTimeout(300);
  const fenster = await page.evaluate(() => ({
    box: document.getElementById('slFensterBox').style.display !== 'none',
    kap: document.getElementById('sl_out_kap').textContent,
    sperr: document.getElementById('sl_out_sperr').textContent,
    speicher: document.getElementById('sl_out_speicher').textContent,
    msg: document.getElementById('sl_msg').textContent
  }));
  ok(fenster.box, 'Ladefenster-Felder erscheinen im Fenster-Betrieb');
  ok(/deckt nicht/.test(fenster.kap), 'ungenügende Ladekapazität wird als «deckt nicht» ausgewiesen');
  ok(/Ladepause|Ladung je Fenster/.test(fenster.sperr), 'Bedarf je Sperrzeit und Ladung je Fenster werden aufgeschlüsselt');
  ok(/min\. .* kW/.test(fenster.msg), 'die nötige Mindest-Ladeleistung wird beziffert');
  ok(/gilt erst, wenn die Ladekapazität den Tagesbedarf deckt/.test(fenster.speicher),
     'Mindest-Speichervolumen wird qualifiziert, solange nicht genug geladen werden kann');
  ok(/zu kleinen Ladekapazität, nicht vom Speicher/.test(fenster.msg),
     'Unterdeckung nennt die Ladekapazität als Ursache (nicht pauschal den Speicher)');

  // C9 — Diagrammbeginn frei wählbar
  await page.selectOption('#sl_start', '0');
  await page.waitForTimeout(300);
  const beginn = await page.evaluate(() => ({
    tab: document.querySelector('#slTabelle .lbl-hint').textContent,
    err: window._slData ? window._slData.P.startH : -1
  }));
  ok(beginn.err === 0 && /ab 00:00 Uhr/.test(beginn.tab), 'Diagrammbeginn ist frei wählbar (00:00 übernommen)');

  // C10 — Simulation
  await page.selectOption('#sl_modus', 'durchgehend');
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('sl_leistung', '30'); set('sl_speicher', '900');
  });
  await page.waitForTimeout(400);
  const sim = await page.evaluate(() => {
    window._slSimHooks.setT(8);
    const svg = document.querySelector('#slSimWrap svg');
    return { svg: !!svg, zeit: document.getElementById('slSimZeit').textContent,
             lvl: svg ? (svg.querySelector('[data-sim="lvlTxt"]') || {}).textContent : '' };
  });
  ok(sim.svg, 'Tagesablauf-Simulation zeichnet den Speicher');
  ok(/^\d\d:\d\d$/.test(sim.zeit) && /l ·/.test(sim.lvl || ''), 'Simulation zeigt Uhrzeit und Speicherinhalt (' + sim.zeit + ' · ' + (sim.lvl || '').trim() + ')');
  ok(errs.length === 0, 'keine pageerrors über den ganzen Durchlauf' + (errs.length ? ' — ' + errs[0] : ''));

  await browser.close();
  server.close();
}

console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
