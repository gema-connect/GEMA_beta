// Test kiArtNrRepair (if_wareneingang): vervollständigt Artikelnummern, denen die
// KI-Extraktion einen führenden Nummernblock abgeschnitten hat (Grosshändler-Format
// «3612 272.000.000»), OHNE Mengen-, Pos-Nr- oder Preis-Blöcke fälschlich anzuhängen.
//
// Aufruf (benötigt playwright-core + Chromium; ESM sucht node_modules aufwärts):
//   CHROME=<chromium> GEMA_ROOT=<repo> node wareneingang_artnr_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8894;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const seed = {
  gema_orgs_v1: [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerinstallateur', kategorien: ['sanitaerinstallateur'], admins: ['u_t'], active: true }],
  gema_users_v1: [{ id: 'u_t', username: 'l@t.ch', name: 'Lager', roleIds: ['role_lagerist'], orgId: 'org_t', active: true, profile: { email: 'l@t.ch' } }],
  gema_session_v1: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig', userId: 'u_t', expires: FUTURE }
};
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0)
    return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
  if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  return route.abort();
});
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seed);
const page = await ctx.newPage();
await page.goto(BASE + '/if_wareneingang.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };
const repair = (positionen, text) => page.evaluate(a => {
  const n = window._weHooks.kiArtNrRepair(a.positionen, a.text);
  return { n, arts: a.positionen.map(p => p.artikelNr) };
}, { positionen, text });

ok(await page.evaluate(() => typeof window._weHooks.kiArtNrRepair === 'function'), 'Hook kiArtNrRepair vorhanden');

// ── 1) Grosshändler-Offerte (Screenshot-Szenario): Block «3612 » teils abgeschnitten ──
const stText = [
  '10 3612 272.000.000 Anschlussbogen Geberit-Silent 90mm 42.50 425.00',
  '3 3612 110.000.000 Schallschutz Iso-Set Hafner PG 10 18.20 54.60',
  '3 3612 500.000.000 Rueckwandbefestigungssatz 12.00 36.00',
  '1 3612 500.000.000 Rueckwandbefestigungssatz 12.00 12.00',
  '1 3612 115.000.000 Bade- Duschenwannenelement 890.00 890.00'
].join('\n');
{
  const r = await repair([
    { artikelNr: '272.000.000', bezeichnung: 'Anschlussbogen', menge: 10, posNr: '' },
    { artikelNr: '110.000.000', bezeichnung: 'Schallschutz', menge: 3, posNr: '' },
    { artikelNr: '3612 500.000.000', bezeichnung: 'Rückwand', menge: 3, posNr: '' },
    { artikelNr: '500.000.000', bezeichnung: 'Rückwand', menge: 1, posNr: '' },
    { artikelNr: '3612 115.000.000', bezeichnung: 'Wanne', menge: 1, posNr: '' }
  ], stText);
  ok(r.n === 3, '3 gekürzte Nummern repariert (n=' + r.n + ')');
  ok(r.arts[0] === '3612 272.000.000' && r.arts[1] === '3612 110.000.000' && r.arts[3] === '3612 500.000.000',
    'Block «3612 » vorangestellt: ' + r.arts.slice(0, 2).join(' | '));
  ok(r.arts[2] === '3612 500.000.000' && r.arts[4] === '3612 115.000.000', 'bereits vollständige Nummern unverändert');
}

// ── 2) Mengen-Falle: 3-stellige Stückzahl direkt vor der Nummer ──
{
  const r = await repair(
    [{ artikelNr: '272.000.000', bezeichnung: 'X', menge: 100, posNr: '' },
     { artikelNr: '110.000.000', bezeichnung: 'Y', menge: 100, posNr: '' }],
    '100 272.000.000 Anschlussbogen\n100 110.000.000 Iso-Set');
  ok(r.n === 0 && r.arts[0] === '272.000.000', 'Menge (100) wird nie als Präfix angehängt');
}

// ── 3) Pos-Nr-Falle: laufende Positionsnummern (einmalig) vor der Nummer ──
{
  const r = await repair(
    [{ artikelNr: '272.000.000', bezeichnung: 'X', menge: 2, posNr: '' }],
    '010 272.000.000 Anschlussbogen 2 Stk');
  ok(r.n === 0 && r.arts[0] === '272.000.000', 'einmaliger Block (Pos-Nr 010) wird nicht übernommen');
  const r2 = await repair(
    [{ artikelNr: '272.000.000', bezeichnung: 'X', menge: 2, posNr: '110' }],
    '110 272.000.000 Anschlussbogen\n110 348.000.000 Element');
  ok(r2.n === 0, 'Block == Pos-Nr der Zeile wird nie übernommen (auch bei Mehrfach-Vorkommen)');
}

// ── 4) Preis-Falle: Dezimalzahl vor der Nummer ──
{
  const r = await repair(
    [{ artikelNr: '272.000.000', bezeichnung: 'X', menge: 1, posNr: '' },
     { artikelNr: '348.000.000', bezeichnung: 'Y', menge: 1, posNr: '' }],
    'Total 425.00 272.000.000 Bogen\nTotal 318.00 348.000.000 Element');
  ok(r.n === 0, 'Preisblöcke («425.00 …») werden nie als Präfix übernommen');
}

// ── 5) Inkonsistenz: Nummer kommt im Text auch OHNE Block vor ──
{
  const r = await repair(
    [{ artikelNr: '272.000.000', bezeichnung: 'X', menge: 1, posNr: '' },
     { artikelNr: '110.000.000', bezeichnung: 'Y', menge: 1, posNr: '' }],
    '3612 272.000.000 Bogen\nArtikel 272.000.000 im Rueckstand\n3612 110.000.000 Set\n3612 110.000.000 Set');
  ok(r.n === 1 && r.arts[0] === '272.000.000' && r.arts[1] === '3612 110.000.000',
    'uneinheitliche Vorkommen bleiben unangetastet, konsistente werden repariert');
}

// ── 6) Punkt-Format: «3612.272.000.000» ──
{
  const r = await repair(
    [{ artikelNr: '272.000.000', bezeichnung: 'X', menge: 1, posNr: '' },
     { artikelNr: '348.000.000', bezeichnung: 'Y', menge: 2, posNr: '' }],
    '1 3612.272.000.000 Bogen\n2 3612.348.000.000 Element');
  ok(r.n === 2 && r.arts[0] === '3612.272.000.000' && r.arts[1] === '3612.348.000.000',
    'Punkt-getrennter Block wird über candCount≥2 repariert');
}

// ── 7) Integration: kiApplyResult repariert gegen IMP.kiPdfText + Toast-Hinweis ──
{
  const res = await page.evaluate(t => {
    const H = window._weHooks;
    const imp = H.newImp();
    imp.kiPdfText = t;
    H.setImp(imp);
    H.kiApplyResult({ positionen: [
      { artikelNr: '272.000.000', bezeichnung: 'Anschlussbogen', menge: 10 },
      { artikelNr: '3612 500.000.000', bezeichnung: 'Rückwand', menge: 3 }
    ], lieferant: 'Sanitas Troesch AG' });
    const I = H.getImp();
    return { arts: I.positionen.map(p => p.artikelNr), rep: I.__kiRepariert, schritt: I.schritt };
  }, stText);
  ok(res.arts[0] === '3612 272.000.000' && res.arts[1] === '3612 500.000.000', 'kiApplyResult: Nummern im Review-Grid vollständig');
  ok(res.rep === 1 && res.schritt === 3, 'Reparatur-Zähler gesetzt, Wizard in Schritt 3');
}

console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
