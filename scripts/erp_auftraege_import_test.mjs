// Playwright-Smoke: Auftrags-Import (ERP-Tab «📥 Migration»).
//
// Prüfstein ist die KETTE über drei Exporte: Objekte → Offerten → Aufträge.
// Der Auftrag muss sich an das bestehende Objekt UND an die bereits
// importierte Offerte hängen (beidseitig), obwohl der Auftrags-Export weder
// eine Kundennummer noch Beträge mitliefert.
//
// Aufruf: node scripts/erp_auftraege_import_test.mjs
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

const OBJ_HEAD = ['id', 'strasse', 'strasse2', 'plz', 'ort', 'egid', 'egrid', 'korr_name',
  'name1', 'vorname', 'name1_1', 'vorname_1', 'knummer', 'co_knummer', 'ei_knummer', 'anschrift'];
const OBJ_ROWS = [
  ['4984', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '', '', '', '7330', '', '',
    'Zahlbar durch:_x000D_\nImmobilien Basel-Stadt_x000D_\nHellring 7_x000D_\n4125 Riehen_x000D_\n']
];
const OFF_HEAD = ['Id', 'anschrift', 'offert_nr', 'strasse', 'strasse2', 'plz', 'ort', 'egrid', 'egid',
  'name1', 'korr_name', 'banrede', 'sachb_name', 'obetrag', 'mwstbetrag', 'zbetrag', 'datum', 'rdatum',
  'typ_text', 'mwstbetrag_1', 'exmwstbetrag', 'betrmemo', 'rapport_nr', 'abt_name', 'wohnung', 'wohn_standort'];
const OFF_ROWS = [
  ['9802', 'Immobilien Basel-Stadt_x000D_\nHellring 7_x000D_\n4125 Riehen_x000D_\n', '2026.0231',
    'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '', 'Jäggi',
    '7872.80', '589.90', '0.00', '28.11.2025', '', 'Zuschlag', '589.90', '7282.90',
    'Anschluss Waschmaschine', '9235', 'Spenglerei', '', '']
];

// Auftrags-Export — exakt die 29 Spalten aus Export_Auftrag.xlsx
const AUF_HEAD = ['Id', 'anschrift', 'rapport_nr', 'strasse', 'strasse2', 'plz', 'ort', 'egid', 'egrid',
  'name1', 'korr_name', 'best_datum', 'telefon', 'abt_name', 'sachb_name', 'astatustext', 'rstatustext',
  'arbeit', 'betrifft', 'bemerkung', 'offert_nr', 'rechnung_nr', 'wohnung', 'wohn_standort', 'wohn_tel',
  'besteller', 'best_tel', 'schlussel', 'schlu_tel'];
const ANS3 = 'Immobilien Basel-Stadt_x000D_\nLiegenschaften FV_x000D_\nFischmarkt 10_x000D_\nPostfach_x000D_\n4001 Basel_x000D_\n';
const ANS1 = 'Immobilien Basel-Stadt_x000D_\nHellring 7_x000D_\n4125 Riehen_x000D_\n';
const AUF_ROWS = [
  // 1) Voller Fall: verknüpfte Offerte, Schlüssel, Rechnungs-Nr., Postfach-Anschrift
  ['11487', ANS3, '9554.00', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '',
    '10.04.2026', '061 267 47 00', 'Sanitär', 'Jäggi', 'Erledigt, Rapport zurück', 'Vollständig verrechnet',
    'Hauptauftrag', 'Anschluss Waschmaschine', 'Zutritt via Hauswart', '2026.0231', '2026.0252',
    '', '', '', '', '', 'Safe 3758', ''],
  // 2) «Nicht begonnen» — darf NICHT als «in Arbeit» gelesen werden; ohne Offerte
  ['11772', ANS1, '9820.00', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '',
    '15.07.2026', '', '', 'Jäggi', 'Nicht begonnen', 'Nicht verrechnet',
    'Spülkasten prüfen', 'Sanitär-Service', '', '', '', '', '', '', '', '', '', ''],
  // 3) In Arbeit + Besteller/Bewohner → Bezugspersonen am Objekt
  ['11900', ANS1, '9900.00', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '',
    '01.08.2026', '', 'Spenglerei', 'Meier', 'In Arbeit', 'Teilweise verrechnet',
    'Reparatur', 'Dachrinne', '', '', '', '3. OG links', 'Frau Muster', '079 111 22 33',
    'Herr Hauswart', '061 000 11 22', 'Schlüsselkasten', 'Hauswart 079 …'],
  // 4) Unbekannter Status + Offert-Nr., die es nicht gibt
  ['11950', ANS1, '9950.00', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '',
    '05.08.2026', '', '', 'Jäggi', 'Wiedervorlage', '', 'Kontrolle', 'Nachkontrolle', '',
    '2099.9999', '', '', '', '', '', '', '', '']
];

const OBJ_X = path.join(ROOT, 'scripts', '.tmp_auf_obj.xlsx');
const OFF_X = path.join(ROOT, 'scripts', '.tmp_auf_off.xlsx');
const AUF_X = path.join(ROOT, 'scripts', '.tmp_auf_auf.xlsx');
baueXlsx(OBJ_X, OBJ_HEAD, OBJ_ROWS);
baueXlsx(OFF_X, OFF_HEAD, OFF_ROWS);
baueXlsx(AUF_X, AUF_HEAD, AUF_ROWS);
const AUFRAEUMEN = () => [OBJ_X, OFF_X, AUF_X].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });

let pw = null;
try { pw = (await import('playwright-core')).chromium; } catch (e) {}
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium', '/usr/bin/chromium']
  .filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!pw || !CHROME) {
  console.log('⏭  ÜBERSPRUNGEN — playwright-core / Chromium fehlt. NICHTS wurde geprüft.');
  AUFRAEUMEN();
  process.exit(0);
}

const server = await startServer();
const browser = await pw.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
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

console.log('\n═══ 1 — Engine: Status-Erkennung (die Reihenfolge-Falle) ═══');
const stat = await page.evaluate(() => {
  const f = t => GemaErpImport.auftragStatus(t);
  return {
    nichtBegonnen: f('Nicht begonnen'),
    erledigt: f('Erledigt, Rapport zurück'),
    inArbeit: f('In Arbeit'),
    offen: f('Offen'),
    abg: f('Abgeschlossen'),
    storno: f('Storniert'),
    leer: f(''),
    unbekannt: f('Wiedervorlage')
  };
});
eq('«Nicht begonnen» → offen (NICHT in_arbeit)', [stat.nichtBegonnen.status, stat.nichtBegonnen.erkannt], ['offen', true]);
eq('«Erledigt, Rapport zurück» → abgeschlossen', stat.erledigt.status, 'abgeschlossen');
eq('«In Arbeit» → in_arbeit', stat.inArbeit.status, 'in_arbeit');
eq('«Offen» → offen', stat.offen.status, 'offen');
eq('«Abgeschlossen» → abgeschlossen', stat.abg.status, 'abgeschlossen');
eq('«Storniert» → abgeschlossen', stat.storno.status, 'abgeschlossen');
eq('Leer → offen, nicht als erkannt markiert', [stat.leer.status, stat.leer.erkannt], ['offen', false]);
eq('Unbekannt → offen + Hinweis', [stat.unbekannt.status, stat.unbekannt.erkannt], ['offen', false]);

console.log('\n═══ 2 — Engine: Postfach-Zeile im Anschrift-Block ═══');
const adr = await page.evaluate(() => ({
  pf: GemaErpImport.parseAdressBlock(['Immobilien Basel-Stadt', 'Liegenschaften FV', 'Fischmarkt 10', 'Postfach', '4001 Basel']),
  ohne: GemaErpImport.parseAdressBlock(['Immobilien Basel-Stadt Liegenschaften FV', 'Fischmarkt 10', '4001 Basel']),
  nurPf: GemaErpImport.parseAdressBlock(['Muster AG', 'Postfach', '3000 Bern'])
}));
eq('Postfach wird NICHT zur Strasse', [adr.pf.strasse, adr.pf.strasse2], ['Fischmarkt 10', 'Postfach']);
eq('Firma + Kontaktperson getrennt', [adr.pf.firma, adr.pf.kontakt], ['Immobilien Basel-Stadt', 'Liegenschaften FV']);
eq('PLZ / Ort aus der letzten Zeile', [adr.pf.plz, adr.pf.ort], ['4001', 'Basel']);
eq('Block ohne Postfach unverändert', [adr.ohne.firma, adr.ohne.strasse, adr.ohne.kontakt], ['Immobilien Basel-Stadt Liegenschaften FV', 'Fischmarkt 10', '']);
eq('Nur Postfach, keine Strasse', [adr.nurPf.firma, adr.nurPf.strasse], ['Muster AG', 'Postfach']);

console.log('\n═══ 3 — Grundlage: Objekte + Offerten importieren ═══');
await importiere('Objekte', OBJ_X);
await importiere('Offerten', OFF_X);
eq('1 Objekt, 1 Offerte',
  await page.evaluate(() => [
    (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll()).length,
    (GemaSync.getCached('gema_erp_dok_pool_v1') || []).filter(d => d.typ === 'offerte').length]), [1, 1]);

console.log('\n═══ 4 — Aufträge: Zuordnung & Vorschau ═══');
await page.click('#mtabs .mtab:has-text("Migration")');
await page.click('.mig-card:has-text("Aufträge")');
await page.waitForSelector('#migModal.open');
t('Abschnitt ist freigeschaltet (kein «Export ausstehend»)',
  !(await page.textContent('#migBody')).includes('Export ausstehend'));
await page.setInputFiles('#migFile', AUF_X);
await page.waitForSelector('.mig-map', { timeout: 10000 });
const zug = await page.evaluate(() => Object.keys(window._mig.mapping).length);
t('alle 29 Spalten automatisch zugeordnet (' + zug + ')', zug === 29);
const mapTxt = await page.textContent('#migBody');
t('Keine Spalte bleibt unbenutzt', !/nicht importiert/.test(mapTxt));
await page.click('#migFoot .btn.pri');
await page.waitForSelector('.mig-tab', { timeout: 10000 });
const vs = await page.textContent('#migBody');
t('Auftrags-Nr. in der Vorschau', /9554\.00/.test(vs));
t('Betrifft als Titel', /Anschluss Waschmaschine/.test(vs));
t('«Arbeit» als Zusatz sichtbar', /Hauptauftrag/.test(vs));
t('Status übersetzt', /Abgeschlossen/.test(vs) && /In Arbeit/.test(vs) && /Offen/.test(vs));
t('Rechnungsstatus als Vermerk', /Vollständig verrechnet/.test(vs));
t('Offert-Nr. ausgewiesen', /2026\.0231/.test(vs));
t('Rechnungs-Nr. ausgewiesen', /2026\.0252/.test(vs));
t('Schlüssel ausgewiesen', /Safe 3758/.test(vs));
t('Unbekannter Status markiert', /Wiedervorlage|\?/.test(vs));
t('Hinweis auf fehlende Offerte-Verknüpfung', /ohne Positionen/.test(vs));
t('Option «Positionen aus der Offerte» vorhanden', await page.isVisible('#migOptPos'));
t('Option «Fehlende Objekte anlegen» vorhanden', await page.isVisible('#migOptObj'));
await page.click('#migGo');
await page.waitForSelector('.gema-dlg-bg', { timeout: 25000 });
const ber = (await page.textContent('.gema-dlg-bg')).replace(/\s+/g, ' ');
t('Bericht: 4 neu', /4 neu/.test(ber));
t('Bericht nennt die übernommenen Positionen', /Positionen aus der Offerte/.test(ber));
t('Bericht meldet die NICHT gefundene Offerte', /nicht gefunden/.test(ber));
await page.click('.gema-dlg-bg button');

console.log('\n═══ 5 — Ergebnis im ERP ═══');
const erg = await page.evaluate(() => {
  const pool = GemaSync.getCached('gema_erp_dok_pool_v1') || [];
  const objs = (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll());
  return {
    auf: pool.filter(d => d.typ === 'auftrag').map(d => ({
      nr: d.nr, datum: d.datum, titel: d.titel, status: d.status, extId: d.extId,
      objektId: d.objektId, objektName: d.objektName,
      kunde: d.kundeSnapshot && d.kundeSnapshot.firma, kontakt: d.kundeSnapshot && d.kundeSnapshot.kontakt,
      sb: d.sachbearbeiter, bereichId: d.bereichId, notiz: d.notiz,
      schluessel: d.schluessel, wohnung: d.wohnung,
      arbeit: d.importArbeit, statusText: d.importStatusText,
      rstat: d.importRechnungsstatus, reNr: d.importRechnungNr,
      offerteId: d.verknuepfung && d.verknuepfung.offerteId,
      pos: (d.positionen || []).length, brutto: erpDocTotals(d).brutto
    })),
    off: pool.filter(d => d.typ === 'offerte').map(d => ({ nr: d.nr, auftragId: d.verknuepfung && d.verknuepfung.auftragId })),
    objAnz: objs.length,
    bp: (objs[0].bezugspersonen || []).map(p => ({ name: p.name, typen: p.typen, tel: p.tel, wohnung: p.wohnung })),
    adressen: GemaAdressen.list().map(a => ({ nr: a.nr, firma: a.firma, kontakt: a.kontakt, strasse: a.strasse, strasse2: a.strasse2, plz: a.plz, tel: a.tel })),
    bereiche: (((GemaAuth.getCurrentOrg() || {}).settings || {}).arbeitsbereiche || []).map(b => b.label)
  };
});
eq('4 Aufträge angelegt', erg.auf.length, 4);
const a1 = erg.auf.find(a => a.nr === '9554.00');
const a2 = erg.auf.find(a => a.nr === '9820.00');
const a3 = erg.auf.find(a => a.nr === '9900.00');
const a4 = erg.auf.find(a => a.nr === '9950.00');
eq('Bestelldatum dd.mm.yyyy → ISO', a1.datum, '2026-04-10');
eq('Betrifft wird zum Titel', a1.titel, 'Anschluss Waschmaschine');
eq('«Erledigt …» → abgeschlossen', a1.status, 'abgeschlossen');
eq('«Nicht begonnen» → offen', a2.status, 'offen');
eq('«In Arbeit» → in_arbeit', a3.status, 'in_arbeit');
eq('Unbekannter Status → offen', a4.status, 'offen');
eq('Alt-ID übernommen', a1.extId, '11487');
eq('Schlüssel/Zutritt übernommen', a1.schluessel, { code: 'Safe 3758', info: '' });
eq('Schlüssel mit Zusatz-Info', a3.schluessel, { code: 'Schlüsselkasten', info: 'Hauswart 079 …' });
eq('Bemerkung als Notiz', a1.notiz, 'Zutritt via Hauswart');
eq('«Arbeit» bleibt als Vermerk erhalten', a1.arbeit, 'Hauptauftrag');
eq('Original-Statustext bleibt erhalten', a1.statusText, 'Erledigt, Rapport zurück');
eq('Rechnungsstatus als Vermerk (nicht als Beleg)', a1.rstat, 'Vollständig verrechnet');
eq('Rechnungs-Nr. für den späteren Import vermerkt', a1.reNr, '2026.0252');
eq('Wohnung übernommen', a3.wohnung, '3. OG links');
eq('Sachbearbeiter «Jäggi» aufgelöst', a1.sb, { userId: 'u_jaeggi', name: 'Robin Jäggi' });
eq('Sachbearbeiter «Meier» aufgelöst', a3.sb, { userId: 'u_meier', name: 'Anna Meier' });
t('Abteilung → Arbeitsbereich', !!a1.bereichId && erg.bereiche.indexOf('Sanitär') >= 0 && erg.bereiche.indexOf('Spenglerei') >= 0);

console.log('\n═══ 6 — Verknüpfungen (der eigentliche Prüfstein) ═══');
t('Auftrag hängt am BESTEHENDEN Objekt (keine Dublette)', !!a1.objektId && erg.objAnz === 1);
t('Alle 4 Aufträge zeigen auf dasselbe Objekt',
  erg.auf.every(a => a.objektId === a1.objektId));
t('Offerte 2026.0231 verknüpft', a1.offerteId && erg.off[0].nr === '2026.0231');
t('Gegenrichtung gesetzt: Offerte zeigt auf einen Auftrag', !!erg.off[0].auftragId);
t('… und zwar auf GENAU diesen Auftrag',
  await page.evaluate(nr => {
    const p = GemaSync.getCached('gema_erp_dok_pool_v1') || [];
    const a = p.find(d => d.typ === 'auftrag' && d.nr === nr);
    const o = p.find(d => d.typ === 'offerte');
    return !!(a && o && o.verknuepfung && o.verknuepfung.auftragId === a.id && a.verknuepfung.offerteId === o.id);
  }, '9554.00'));
eq('Positionen aus der Offerte übernommen', a1.pos, 1);
eq('Total entspricht der Offerte', Math.round(a1.brutto * 100) / 100, 7872.8);
eq('Ohne Offerte keine Positionen', [a2.pos, a3.pos, a4.pos], [0, 0, 0]);
t('Nicht gefundene Offert-Nr. verknüpft nichts', !a4.offerteId);

console.log('\n═══ 7 — Bezugspersonen am Objekt ═══');
const best = erg.bp.find(p => p.name === 'Herr Hauswart');
const bewo = erg.bp.find(p => p.name === 'Frau Muster');
t('Besteller als Bezugsperson angelegt', !!best);
eq('… mit Typ «Besteller» und Telefon', best && [best.typen, best.tel], [['besteller'], '061 000 11 22']);
t('Bewohner als Bezugsperson angelegt', !!bewo);
eq('… mit Typ «Bewohner», Telefon und Wohnung', bewo && [bewo.typen, bewo.tel, bewo.wohnung], [['bewohner'], '079 111 22 33', '3. OG links']);

console.log('\n═══ 8 — Adressen: Postfach-Adresse sauber erfasst ═══');
const fisch = erg.adressen.find(a => /Fischmarkt/.test(a.strasse || ''));
t('Adresse mit Fischmarkt 10 angelegt', !!fisch);
eq('Postfach im Adresszusatz, nicht in der Strasse', fisch && [fisch.strasse, fisch.strasse2], ['Fischmarkt 10', 'Postfach']);
eq('Kontaktperson aus dem Block', fisch && fisch.kontakt, 'Liegenschaften FV');
eq('Telefon des Kunden übernommen', fisch && fisch.tel, '061 267 47 00');

console.log('\n═══ 9 — Zweiter Lauf ist idempotent ═══');
await page.evaluate(() => {
  const p = GemaSync.getCached('gema_erp_dok_pool_v1') || [];
  const a = p.find(d => d.typ === 'auftrag' && d.nr === '9554.00');
  a.titel = 'Von Hand geändert';
  a.positionen.push({ id: 'p_manuell', art: 'frei', bez: 'Von Hand ergänzt', menge: 1, einheit: 'Std', ep: 120 });
  localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(p));
});
const w2 = await importiere('Aufträge', AUF_X);
t('Vorschau erkennt alle 4 als bereits vorhanden', /4 werden ergänzt/.test(w2.vorschau));
const nach = await page.evaluate(() => {
  const p = (GemaSync.getCached('gema_erp_dok_pool_v1') || []).filter(d => d.typ === 'auftrag');
  const a = p.find(d => d.nr === '9554.00');
  return {
    anz: p.length, titel: a.titel, pos: a.positionen.length,
    objAnz: (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll()).length,
    adrAnz: GemaAdressen.list().length,
    bpAnz: ((GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll())[0].bezugspersonen || []).length
  };
});
eq('Weiterhin 4 Aufträge (keine Dubletten)', nach.anz, 4);
eq('Von Hand geänderter Titel bleibt', nach.titel, 'Von Hand geändert');
eq('Von Hand ergänzte Position bleibt unangetastet', nach.pos, 2);
eq('Keine neuen Objekte', nach.objAnz, erg.objAnz);
eq('Keine neuen Adressen', nach.adrAnz, erg.adressen.length);
eq('Keine doppelten Bezugspersonen', nach.bpAnz, erg.bp.length);

console.log('\n═══ 10 — Aufträge erscheinen im ERP-Tab ═══');
await page.click('#mtabs .mtab:has-text("Aufträge")');
await page.waitForTimeout(400);
const liste = await page.textContent('#docList');
t('Auftrag 9554.00 in der Liste', /9554\.00/.test(liste));
t('Auftrag 9820.00 in der Liste', /9820\.00/.test(liste));
t('Kunde in der Liste', /Immobilien Basel-Stadt/.test(liste));

await ctx.close(); await browser.close(); await server.close(); AUFRAEUMEN();
console.log(fail ? `\n✗ ${fail} von ${n} Checks fehlgeschlagen` : `\n✓ alle ${n} Checks bestanden`);
process.exit(fail ? 1 : 0);
