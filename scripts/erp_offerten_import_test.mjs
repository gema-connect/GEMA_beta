// Playwright-Smoke: Offerten-Import (ERP-Tab «📥 Migration»).
//
// Der Kern dieses Tests ist das ZUSAMMENSPIEL der Exporte: zuerst die Objekte
// importieren, dann die Offerten — die Offerte muss sich an das bestehende
// Objekt hängen und dieselbe Adresse wiederverwenden, obwohl der Offert-Export
// KEINE Kundennummer mitliefert (softKey-Abgleich).
//
// Aufruf: node scripts/erp_offerten_import_test.mjs
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { startServer, newPage, seed, BASE, ROOT } from './rolematrix_harness.mjs';

let n = 0, fail = 0;
const t = (name, cond) => { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } };
const eq = (name, a, b) => t(name + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)), JSON.stringify(a) === JSON.stringify(b));

// ── xlsx-Bauer (Kopfzeile + Zeilen, alles als Text) ─────────────────────
function baueXlsx(dest, HEAD, ROWS) {
  const ss = [];
  const si = v => { const i = ss.indexOf(v); if (i >= 0) return i; ss.push(v); return ss.length - 1; };
  const sp = c => (c < 26 ? String.fromCharCode(65 + c) : String.fromCharCode(64 + Math.floor(c / 26)) + String.fromCharCode(65 + (c % 26)));
  const cell = (r, c, v) => `<c r="${sp(c)}${r}" t="s"><v>${si(v)}</v></c>`;
  let sheet = '<row r="1">' + HEAD.map((h, c) => cell(1, c, h)).join('') + '</row>';
  ROWS.forEach((row, i) => {
    sheet += `<row r="${i + 2}">` + row.map((v, c) => v === '' ? '' : cell(i + 2, c, String(v))).join('') + '</row>';
  });
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tabelle1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheet + '</sheetData></worksheet>'
  };
  files['xl/sharedStrings.xml'] = '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + ss.length + '" uniqueCount="' + ss.length + '">' +
    ss.map(v => '<si><t xml:space="preserve">' + v.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</t></si>').join('') + '</sst>';
  const crcT = (() => { const c = []; for (let i = 0; i < 256; i++) { let k = i; for (let j = 0; j < 8; j++) k = k & 1 ? 0xEDB88320 ^ (k >>> 1) : k >>> 1; c[i] = k >>> 0; } return c; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const u16 = v => Buffer.from([v & 255, (v >> 8) & 255]);
  const u32 = v => Buffer.from([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  const names = Object.keys(files), locals = [], central = [];
  let off = 0;
  for (const nm of names) {
    const raw = Buffer.from(files[nm], 'utf8'), def = zlib.deflateRawSync(raw), crc = crc32(raw), nb = Buffer.from(nm, 'utf8');
    const lh = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0), u32(crc), u32(def.length), u32(raw.length), u16(nb.length), u16(0), nb, def]);
    locals.push(lh);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0), u32(crc), u32(def.length), u32(raw.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nb]));
    off += lh.length;
  }
  const cd = Buffer.concat(central);
  fs.writeFileSync(dest, Buffer.concat([Buffer.concat(locals), cd,
    Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(names.length), u16(names.length), u32(cd.length), u32(off), u16(0)])]));
}

// Objekt-Export (wie Export_Objekte.xlsx)
const OBJ_HEAD = ['id', 'strasse', 'strasse2', 'plz', 'ort', 'egid', 'egrid', 'korr_name',
  'name1', 'vorname', 'name1_1', 'vorname_1', 'knummer', 'co_knummer', 'ei_knummer', 'anschrift'];
const OBJ_ROWS = [
  ['4984', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '', '', '', '7330', '', '',
    'Zahlbar durch:_x000D_\nImmobilien Basel-Stadt_x000D_\nHellring 7_x000D_\n4125 Riehen_x000D_\n']
];
// Offert-Export (wie Export_Offerte.xlsx — 26 Spalten, KEINE Kundennummer)
const OFF_HEAD = ['Id', 'anschrift', 'offert_nr', 'strasse', 'strasse2', 'plz', 'ort', 'egrid', 'egid',
  'name1', 'korr_name', 'banrede', 'sachb_name', 'obetrag', 'mwstbetrag', 'zbetrag', 'datum', 'rdatum',
  'typ_text', 'mwstbetrag_1', 'exmwstbetrag', 'betrmemo', 'rapport_nr', 'abt_name', 'wohnung', 'wohn_standort'];
const OFF_ROWS = [
  // Zeile 1: Objekt Hellring 7 existiert bereits aus dem Objekt-Import
  ['9802', 'Immobilien Basel-Stadt_x000D_\nHellring 7_x000D_\n4125 Riehen_x000D_\n', '2025.0887',
    'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '', 'Jäggi',
    '7872.80', '589.90', '0.00', '28.11.2025', '', 'Zuschlag', '589.90', '7282.90',
    'Wasserschaden', '9235', 'Spenglerei', '', ''],
  // Zeile 2: neues Objekt (Hellring 9) + c/o-Adresse + Anrede
  ['9658', 'IBS Liegenschaften FV_x000D_\nc/o S&A - Zentraler Rechnungseingang_x000D_\nPostfach_x000D_\n4001 Basel_x000D_\n',
    '2025.0751', 'Hellring 9', 'Mehrfamilienhaus', '4125', 'Riehen', '', '', 'IBS Liegenschaften FV',
    'IBS Liegenschaften FV', 'Sehr geehrte Damen und Herren', 'Jäggi', '4469.25', '334.90', '0.00',
    '02.10.2025', '', 'Absage', '334.90', '4134.35', 'Filter Rückspülbar und Heizungspumpe ersetzen', '', 'Sanitär', '', ''],
  // Zeile 3: Altbeleg mit 7.7 % MwSt + unbekanntem Status
  ['9100', 'Muster AG_x000D_\nWeg 1_x000D_\n3000 Bern_x000D_\n', '2023.0042', 'Weg 1', '', '3000', 'Bern',
    '', '', 'Muster AG', '', '', 'Muster', '1077.00', '77.00', '0.00', '15.03.2023', '',
    'Wiedervorlage', '77.00', '1000.00', 'Altbeleg', '', 'Sanitär', '', '']
];

const OBJ_X = path.join(ROOT, 'scripts', '.tmp_off_obj.xlsx');
const OFF_X = path.join(ROOT, 'scripts', '.tmp_off_off.xlsx');
baueXlsx(OBJ_X, OBJ_HEAD, OBJ_ROWS);
baueXlsx(OFF_X, OFF_HEAD, OFF_ROWS);

let pw = null;
try { pw = (await import('playwright-core')).chromium; } catch (e) {}
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium', '/usr/bin/chromium']
  .filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!pw || !CHROME) {
  console.log('⏭  ÜBERSPRUNGEN — playwright-core / Chromium fehlt. NICHTS wurde geprüft.');
  [OBJ_X, OFF_X].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
  process.exit(0);
}

const server = await startServer();
const browser = await pw.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// Zwei Personen in der Firma — «Jäggi» muss der richtigen zugeordnet werden
const st = seed(['role_planer']);
st.gema_users_v1.push({ id: 'u_jaeggi', username: 'rj@test.ch', name: 'Robin Jäggi', roleIds: ['role_planer'], orgId: 'org_test', active: true });
st.gema_users_v1.push({ id: 'u_meier', username: 'am@test.ch', name: 'Anna Meier', roleIds: ['role_planer'], orgId: 'org_test', active: true });
const { ctx, page } = await newPage(browser, st);
await page.goto(BASE + '/pm_erp.html');
await page.waitForFunction(() => document.getElementById('mtabs') && document.getElementById('mtabs').children.length, { timeout: 15000 });

async function importiere(sektion, datei) {
  await page.click('#mtabs .mtab:has-text("Migration")');
  await page.click(`.mig-card:has-text("${sektion}")`);
  await page.waitForSelector('#migModal.open');
  await page.setInputFiles('#migFile', datei);
  await page.waitForSelector('.mig-map', { timeout: 10000 });
  await page.click('#migFoot .btn.pri');
  await page.waitForSelector('.mig-tab', { timeout: 10000 });
  const vorschau = await page.textContent('#migBody');
  await page.click('#migGo');
  await page.waitForSelector('.gema-dlg-bg', { timeout: 25000 });
  const bericht = await page.textContent('.gema-dlg-bg');
  await page.click('.gema-dlg-bg button');
  return { vorschau, bericht };
}

console.log('\n═══ 1 — Objekte zuerst (Grundlage) ═══');
await importiere('Objekte', OBJ_X);
eq('1 Objekt + 1 Adresse angelegt',
  await page.evaluate(() => [
    (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll()).length,
    GemaAdressen.list().length]), [1, 1]);

console.log('\n═══ 2 — Offerten: Zuordnung & Vorschau ═══');
await page.click('#mtabs .mtab:has-text("Migration")');
await page.click('.mig-card:has-text("Offerten")');
await page.waitForSelector('#migModal.open');
await page.setInputFiles('#migFile', OFF_X);
await page.waitForSelector('.mig-map', { timeout: 10000 });
const zug = await page.evaluate(() => Object.keys(window._mig.mapping).length);
t('22 von 26 Spalten automatisch zugeordnet (' + zug + ')', zug === 22);
const mapTxt = await page.textContent('#migBody');
t('Nicht importierte Spalten werden benannt', /nicht importiert/.test(mapTxt));
t('… und namentlich aufgeführt', /zbetrag/.test(mapTxt) && /mwstbetrag_1/.test(mapTxt));
await page.click('#migFoot .btn.pri');
await page.waitForSelector('.mig-tab', { timeout: 10000 });
const vs = await page.textContent('#migBody');
t('Offert-Nr. in der Vorschau', /2025\.0887/.test(vs));
t('Status «Zuschlag» erkannt', /Zuschlag/.test(vs));
t('Status «Absage» erkannt', /Absage/.test(vs));
t('Unbekannter Status markiert', /Wiedervorlage|\?/.test(vs));
t('Nettobetrag in der Vorschau', /7282\.90/.test(vs));
t('Netto-Summe ausgewiesen', /Summe netto/.test(vs));
t('Option «Fehlende Objekte anlegen» vorhanden', await page.isVisible('#migOptObj'));
t('7.7 % (Altsatz bis 2023) löst KEINE Warnung aus', !/MwSt-Satz 7\.7/.test(vs));
await page.click('#migGo');
await page.waitForSelector('.gema-dlg-bg', { timeout: 25000 });
const ber = await page.textContent('.gema-dlg-bg');
t('Bericht: 3 neu', /3<\/b> neu|3 neu/.test(ber.replace(/\s+/g, ' ')));
await page.click('.gema-dlg-bg button');

console.log('\n═══ 3 — Ergebnis im ERP ═══');
const erg = await page.evaluate(() => {
  const docs = (GemaSync.getCached('gema_erp_dok_pool_v1') || []).filter(d => d.typ === 'offerte');
  const objs = (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll());
  return {
    docs: docs.map(d => ({
      nr: d.nr, datum: d.datum, titel: d.titel, status: d.status, mwstPct: d.mwstPct,
      extId: d.extId, objektId: d.objektId, objektName: d.objektName,
      kunde: d.kundeSnapshot && d.kundeSnapshot.firma, kontakt: d.kundeSnapshot && d.kundeSnapshot.kontakt,
      sb: d.sachbearbeiter, bereichId: d.bereichId, anrede: d.anrede, ref1: d.externeRef1,
      pos: d.positionen.length, ep: d.positionen[0] && d.positionen[0].ep,
      brutto: erpDocTotals(d).brutto
    })),
    objAnz: objs.length,
    objNamen: objs.map(o => o.name),
    adressen: GemaAdressen.list().map(a => ({ nr: a.nr, firma: a.firma })),
    bereiche: (((GemaAuth.getCurrentOrg() || {}).settings || {}).arbeitsbereiche || []).map(b => b.label)
  };
});
eq('3 Offerten angelegt', erg.docs.length, 3);
const d1 = erg.docs.find(d => d.nr === '2025.0887');
const d2 = erg.docs.find(d => d.nr === '2025.0751');
const d3 = erg.docs.find(d => d.nr === '2023.0042');
eq('Datum dd.mm.yyyy → ISO', d1.datum, '2025-11-28');
eq('Projekt/Betreff als Titel', d2.titel, 'Filter Rückspülbar und Heizungspumpe ersetzen');
eq('Zuschlag → angenommen', d1.status, 'angenommen');
eq('Absage → abgelehnt', d2.status, 'abgelehnt');
eq('Unbekannter Status → versendet', d3.status, 'versendet');
eq('MwSt-Satz aus dem Beleg (8.1 %)', d1.mwstPct, 8.1);
eq('Altbeleg behält seine 7.7 %', d3.mwstPct, 7.7);
eq('Sammelposition mit Nettobetrag', [d1.pos, d1.ep], [1, 7282.9]);
eq('Total stimmt mit dem Altsystem überein', Math.round(d1.brutto * 100) / 100, 7872.8);
eq('Altbeleg-Total (7.7 %)', Math.round(d3.brutto * 100) / 100, 1077);
eq('Briefanrede übernommen', d2.anrede, 'Sehr geehrte Damen und Herren');
eq('Externe Referenz übernommen', d1.ref1, '9235');

console.log('\n═══ 4 — Verknüpfungen (der eigentliche Prüfstein) ═══');
t('Offerte hängt am BESTEHENDEN Objekt (keine Dublette für Hellring 7)',
  !!d1.objektId && erg.objNamen.filter(x => /Hellring 7/.test(x)).length === 1);
eq('1 vorhandenes + 2 neue Objekte', erg.objAnz, 3);
eq('Adresse wiederverwendet trotz fehlender Kunden-Nr.',
  erg.adressen.filter(a => a.firma === 'Immobilien Basel-Stadt').length, 1);
eq('Kundennummer aus dem Objekt-Import bleibt erhalten',
  (erg.adressen.find(a => a.firma === 'Immobilien Basel-Stadt') || {}).nr, '7330');
eq('c/o-Zeile als Kontaktperson übernommen', d2.kontakt, 'c/o S&A - Zentraler Rechnungseingang');
eq('Sachbearbeiter «Jäggi» der richtigen Person zugeordnet', d1.sb.name, 'Robin Jäggi');
t('Sachbearbeiter mit User-ID verknüpft', d1.sb.userId === 'u_jaeggi');
t('Unbekannter Sachbearbeiter bleibt als Name erhalten', d3.sb.name === 'Muster' && !d3.sb.userId);
// Die Org-Settings sind im Test-Harness nicht schreibbar (die Auth-Function
// ist gemockt und der Save wird zurückgerollt) — geprüft wird deshalb die
// Wirkung am Dokument: jede Abteilung ergibt einen eigenen, aus dem Label
// abgeleiteten Bereich.
t('Offerte trägt einen Arbeitsbereich', !!d1.bereichId && !!d2.bereichId);
t('Abteilung «Spenglerei» → eigener Bereich', /spenglerei/i.test(d1.bereichId));
t('Abteilung «Sanitär» → eigener Bereich', /sanitaer|sanitär/i.test(d2.bereichId));
t('Verschiedene Abteilungen ⇒ verschiedene Bereiche', d1.bereichId !== d2.bereichId);

console.log('\n═══ 5 — Offerten-Tab zeigt die Belege ═══');
await page.evaluate(() => { _tab = 'offerte'; erpRenderAll(); });
const liste = await page.textContent('#docList');
t('Offerte 2025.0887 in der Liste', /2025\.0887/.test(liste));
t('Betrag in der Liste', /7.?872\.80/.test(liste));

console.log('\n═══ 6 — Zweiter Lauf ist idempotent ═══');
// Position von Hand ergänzen — der Wiederholungs-Import darf sie NICHT anfassen
await page.evaluate(() => {
  const pool = GemaSync.getCached('gema_erp_dok_pool_v1').slice();
  const d = pool.find(x => x.nr === '2025.0887');
  d.positionen.push({ id: 'p_manuell', art: 'frei', bez: 'Von Hand ergänzt', menge: 2, einheit: 'Std', ep: 100 });
  d.titel = 'Von Hand angepasst';
  localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(pool));
});
const r2 = await importiere('Offerten', OFF_X);
t('Vorschau erkennt alle 3 als bereits vorhanden', /3 werden ergänzt/.test(r2.vorschau));
const erg2 = await page.evaluate(() => {
  const docs = (GemaSync.getCached('gema_erp_dok_pool_v1') || []).filter(d => d.typ === 'offerte');
  const d = docs.find(x => x.nr === '2025.0887');
  return { anz: docs.length, pos: d.positionen.length, titel: d.titel,
    objAnz: (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll()).length,
    adr: GemaAdressen.list().length };
});
eq('Weiterhin 3 Offerten (keine Dubletten)', erg2.anz, 3);
eq('Von Hand ergänzte Position bleibt unangetastet', erg2.pos, 2);
eq('Von Hand geänderter Titel bleibt', erg2.titel, 'Von Hand angepasst');
eq('Keine neuen Objekte', erg2.objAnz, 3);
eq('Keine neuen Adressen', erg2.adr, 3);

await ctx.close(); await browser.close(); server.close();
[OBJ_X, OFF_X].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen' : '✓ alle ' + n + ' Checks bestanden'));
process.exit(fail ? 1 : 0);
