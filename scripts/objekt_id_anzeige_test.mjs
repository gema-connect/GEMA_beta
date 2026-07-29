// ═══════════════════════════════════════════════════════════════════════════
// Drift-Guard: Objekt-Anzeige NIE als rohe obj_…-ID (Bugreport 29.07.2026)
//
// Ursache: getAll() liefert NUR status=aktiv — sobald ein Projekt
// «abgeschlossen»/archiviert war (oder das Objekt fehlte), fiel die Anzeige
// in sd_schadensbericht auf die rohe objektId zurück. Kanon seither:
//   - Anzeige-Lookups (objektId → Name bestehender Records) laufen über
//     getAllUnfiltered() bzw. GemaObjekte.getById (alle Status)
//   - Fallback bei fehlendem Objekt: «⚠ Objekt nicht gefunden», nie die ID
//   - getAll() (nur aktive) bleibt NUR für Auswahl-Dropdowns
// Ausführen: CHROME=<chromium> node scripts/objekt_id_anzeige_test.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { startServer, BASE, seed, wireRoutes } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let okN = 0, failN = 0;
function ok(name, cond, extra) {
  if (cond) { okN++; console.log('  ✓ ' + name); }
  else { failN++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
const SRC = p => readFileSync('/home/user/GEMA_beta/' + p, 'utf8');

// ── Statik: kein Modul fällt in der Anzeige auf die rohe objektId zurück ──
console.log('■ Statik');
{
  const api = SRC('gema_objekte_api.js');
  ok('API: getById vorhanden + exportiert (alle Status)', api.includes('function getById') && api.includes('getById: getById'));
  const sd = SRC('sd_schadensbericht.html');
  ok('sd: Anzeige-Pool sdGetObjekteAlle (unfiltered)', sd.includes('function sdGetObjekteAlle') && /sdGetObjekteAlle[\s\S]{0,400}getAllUnfiltered/.test(sd));
  ok('sd: Fallback «⚠ Objekt nicht gefunden» statt ID', sd.includes("return '⚠ Objekt nicht gefunden'") && !/return id \|\| '—'/.test(sd));
  ok('sd: PDF-Export nutzt den unfiltered Pool', sd.includes('sdGetObjekteAlle === \'function\''));
  const rr = SRC('pm_regierapport.html');
  ok('regierapport: rrObjName über getAllUnfiltered', /rrObjName[\s\S]{0,300}getAllUnfiltered/.test(rr));
  ok('regierapport: keine rohe ID in Filter/Option', !rr.includes('||r.objektId;}') && !rr.includes('r.objektName||r.objektId'));
  const pr = SRC('pm_pruefliste.html');
  ok('pruefliste: keine rohe ID im Objekt-Filter', !pr.includes('||b.objektId;'));
  const pab = SRC('pm_planablage.html');
  ok('planablage: objName über getAllUnfiltered', /function objName[\s\S]{0,400}getAllUnfiltered/.test(pab));
  const rev = SRC('pm_revisionsunterlagen.html');
  ok('revisionsunterlagen: _objName über getAllUnfiltered (Dossiers = abgeschlossene Projekte)', /_objName[\s\S]{0,250}getAllUnfiltered/.test(rev));
  const bf = SRC('pm_behoerden_formulare.html');
  ok('behoerden_formulare: Instanz-Auflösung über getAllUnfiltered', /_objName[\s\S]{0,250}getAllUnfiltered/.test(bf));
  const dach = SRC('sp_dachbericht.html');
  ok('dachbericht: Kanon unverändert (unfiltered + Hinweis)', dach.includes('getAllUnfiltered') && dach.includes('⚠ Objekt nicht gefunden'));
}

// ── Browser: Schadensbericht-Liste mit abgeschlossenem + fehlendem Objekt ──
console.log('■ Schadensbericht (Browser)');
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
{
  const objAktiv = { id: 'obj_aktiv1', name: 'Neubau Aktivweg', strasse: 'Aktivweg 1', plz: '4000', ort: 'Basel', status: 'aktiv', orgId: 'org_test' };
  const objAbg   = { id: 'obj_abg1', name: 'MFH Bäumlihof', strasse: 'Bäumlihofstrasse 194', plz: '4058', ort: 'Basel', status: 'abgeschlossen', orgId: 'org_test' };
  const mkSchaden = (id, titel, objektId) => ({
    id: id, typ: 'wasserschaden', titel: titel, objektId: objektId, orgId: 'org_test', phase: 'trocknung',
    beschreibung: '', ursache: '', raeume: ['Bad'], versicherung: {}, erstelltAm: '2026-07-27T10:00:00Z',
    erstelltVon: { userId: 'u_test', name: 'Test User' },
    zustandsanalyse: { massnahmen: [], fotos: [] }, trocknung: { messpunkte: [], geraete: [], fotos: [] }, abschluss: { fotos: [] }
  });
  const schaeden = [
    mkSchaden('sch_1', 'Schaden im abgeschlossenen Projekt', 'obj_abg1'),
    mkSchaden('sch_2', 'Schaden mit fehlendem Objekt', 'obj_1785226512369_x31r9'),
    mkSchaden('sch_3', 'Schaden im aktiven Projekt', 'obj_aktiv1')
  ];
  const rows = (prefix, arr) => arr.map(o => ({ data_key: prefix + o.id, payload: { data: o }, last_modified: new Date().toISOString() }));

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await wireRoutes(ctx);
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (r.request().method() === 'GET') {
      if (/data_key=like\.objekt/.test(u)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(rows('objekt:', [objAktiv, objAbg])) });
      if (/data_key=like\.schaden/.test(u)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(rows('schaden:', schaeden)) });
      return r.fulfill({ contentType: 'application/json', body: '[]' });
    }
    return r.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await ctx.addInitScript(sd => { for (const [k, v] of Object.entries(sd)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed(['role_planer']));
  const page = await ctx.newPage();
  await page.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sd-card, .card, [class*=card]', { timeout: 12000 });
  await page.waitForTimeout(1200);
  const body = await page.evaluate(() => document.body.innerText);
  ok('abgeschlossenes Projekt zeigt den NAMEN (nicht die ID)', body.includes('Bäumlihof'), body.slice(0, 120));
  ok('keine rohe obj_…-ID sichtbar', !/obj_[a-z0-9_]{6,}/i.test(body), (body.match(/obj_[a-z0-9_]+/i) || [])[0]);
  ok('fehlendes Objekt zeigt «⚠ Objekt nicht gefunden»', body.includes('Objekt nicht gefunden'));
  ok('aktives Projekt unverändert', body.includes('Aktivweg'));
  // Auswahl-Dropdown (Picker) zeigt weiterhin NUR aktive Objekte
  const pickerVals = await page.evaluate(() => { try { sdPopulateObjekte(); } catch(e) {}
    const sel = document.getElementById('f_objekt'); return sel ? [...sel.options].map(o => o.value).filter(Boolean) : null; });
  ok('Picker: nur aktive Objekte wählbar', !!pickerVals && pickerVals.includes('obj_aktiv1') && !pickerVals.includes('obj_abg1'), JSON.stringify(pickerVals));
  await ctx.close();
}

await browser.close(); server.close();
console.log('');
console.log(failN === 0 ? '✓ alle ' + okN + ' Checks grün' : '✗ ' + failN + ' von ' + (okN + failN) + ' Checks ROT');
process.exit(failN === 0 ? 0 : 1);
