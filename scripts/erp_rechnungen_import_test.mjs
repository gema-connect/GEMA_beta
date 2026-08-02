// Playwright-Smoke: Rechnungs-Import (ERP-Tab «📥 Migration»).
//
// Prüfstein ist die VOLLE Kette über vier Exporte:
// Objekte → Offerten → Aufträge → Rechnungen. Die Rechnung muss sich an den
// bereits importierten Auftrag hängen, dessen Offerte mitnehmen, ihre
// ESR-Referenz für den Nachdruck behalten und einen leeren Auftrag mit dem
// tatsächlich verrechneten Betrag ergänzen.
//
// Aufruf: node scripts/erp_rechnungen_import_test.mjs
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { startServer, newPage, seed, BASE, ROOT } from './rolematrix_harness.mjs';

let n = 0, fail = 0;
const t = (name, cond) => { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } };
const eq = (name, a, b) => t(name + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)), JSON.stringify(a) === JSON.stringify(b));

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

const ANS = 'Immobilien Basel-Stadt_x000D_\nHellring 7_x000D_\n4125 Riehen_x000D_\n';
const OBJ_HEAD = ['id', 'strasse', 'strasse2', 'plz', 'ort', 'egid', 'egrid', 'korr_name', 'name1', 'vorname', 'name1_1', 'vorname_1', 'knummer', 'co_knummer', 'ei_knummer', 'anschrift'];
const OBJ_ROWS = [['4984', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '', '', '', '7330', '', '',
  'Zahlbar durch:_x000D_\nImmobilien Basel-Stadt_x000D_\nHellring 7_x000D_\n4125 Riehen_x000D_\n']];

const OFF_HEAD = ['Id', 'anschrift', 'offert_nr', 'strasse', 'strasse2', 'plz', 'ort', 'egrid', 'egid', 'name1', 'korr_name', 'banrede',
  'sachb_name', 'obetrag', 'mwstbetrag', 'zbetrag', 'datum', 'rdatum', 'typ_text', 'mwstbetrag_1', 'exmwstbetrag', 'betrmemo', 'rapport_nr', 'abt_name', 'wohnung', 'wohn_standort'];
const OFF_ROWS = [['9802', ANS, '2026.0231', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '', 'Jäggi',
  '7872.80', '589.90', '0.00', '10.03.2026', '', 'Zuschlag', '589.90', '7282.90', 'Anschluss Waschmaschine', '', 'Sanitär', '', '']];

const AUF_HEAD = ['Id', 'anschrift', 'rapport_nr', 'strasse', 'strasse2', 'plz', 'ort', 'egid', 'egrid', 'name1', 'korr_name', 'best_datum',
  'telefon', 'abt_name', 'sachb_name', 'astatustext', 'rstatustext', 'arbeit', 'betrifft', 'bemerkung', 'offert_nr', 'rechnung_nr',
  'wohnung', 'wohn_standort', 'wohn_tel', 'besteller', 'best_tel', 'schlussel', 'schlu_tel'];
const AUF_ROWS = [
  // A) mit Offerte → Auftrag HAT Positionen (7282.90)
  ['11487', ANS, '9554.00', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '10.04.2026', '', 'Sanitär',
    'Jäggi', 'Erledigt, Rapport zurück', 'Vollständig verrechnet', 'Hauptauftrag', 'Anschluss Waschmaschine', '', '2026.0231', '2026.0252', '', '', '', '', '', 'Safe 3758', ''],
  // B) ohne Offerte → Auftrag ist LEER
  ['11772', ANS, '9820.00', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '15.05.2026', '', 'Sanitär',
    'Jäggi', 'In Arbeit', 'Teilweise verrechnet', 'Service', 'Sanitär-Service', '', '', '', '', '', '', '', '', '', '']
];

// Rechnungs-Export — exakt die 33 Spalten aus export_Rechnung.xlsx
const RE_HEAD = ['Id', 'anschrift', 'nr', 'rapport_nr', 'strasse', 'strasse2', 'plz', 'ort', 'egrid', 'egid', 'extref1', 'extref2',
  'name1', 'korr_name', 'typ_text', 'besteller', 'datum', 'adr_id', 'ausgef', 'typ_text_1', 'zahlbedid', 'print_info',
  'post_info_date', 'arbeit', 'betrifft', 'mwstcode', 'esr_ref', 'rbetrag', 'mwstbetrag', 'exmwstbetrag', 'abt_name', 'wohnung', 'wohn_standort'];
const RE_ROWS = [
  // 1) Schlussrechnung auf Auftrag A (der HAT Positionen → darf nicht angefasst werden)
  ['11554', ANS, '2026.0252', '9554.00', 'Hellring 7', '', '4125', 'Riehen', '', '', 'REF-A', '', 'Immobilien Basel-Stadt', '',
    'Schlussrechnung', '', '21.04.2026', '267', 'vom 14.04.2026 bis 16.04.2026', 'Versandt', '01', '',
    '24.04.2026 07:53:24', 'Hauptauftrag', 'Anschluss Waschmaschine', 'UStN', '384400000000000000202602523',
    '1159', '86.85', '1072.15', 'Sanitär', '', ''],
  // 2)+3) Akonto + Schluss auf Auftrag B (LEER → wird mit der SUMME ergänzt)
  ['11600', ANS, '2026.0300', '9820.00', 'Hellring 7', '', '4125', 'Riehen', '', '', '', '', 'Immobilien Basel-Stadt', '',
    'Akontorechnung', '', '20.05.2026', '267', '', 'Versandt', '01', '', '', 'Service', 'Sanitär-Service', 'UStN',
    '384400000000000000202603005', '540.50', '40.50', '500', 'Sanitär', '', ''],
  ['11601', ANS, '2026.0301', '9820.00', 'Hellring 7', '', '4125', 'Riehen', '', '', '', '', 'Immobilien Basel-Stadt', '',
    'Schlussrechnung', '', '30.05.2026', '267', '', 'Versandt', '01', '', '', 'Service', 'Sanitär-Service', 'UStN',
    '384400000000000000202603010', '756.70', '56.70', '700', 'Sanitär', '', ''],
  // 4) ohne Auftrag, unbekannte Art + Status, UNGÜLTIGE ESR-Referenz, Bezugspersonen
  ['11700', ANS, '2026.0400', '', 'Hellring 7', '', '4125', 'Riehen', '', '', '', 'REF-B', 'Immobilien Basel-Stadt', '',
    'Verrechnungsschein', 'Herr Hauswart', '10.06.2026', '267', '', 'Wiedervorlage', '10 Tage', '', '', 'Diverses', 'Kleinreparatur',
    'UStN', '384400000000000000202604008', '108.10', '8.10', '100', 'Sanitär', '2. OG', 'Frau Muster'],
  // 5) Altbeleg für den Stichtag-Test (7.7 % MwSt)
  ['10900', ANS, '2025.0100', '', 'Hellring 7', '', '4125', 'Riehen', '', '', '', '', 'Immobilien Basel-Stadt', '',
    'Schlussrechnung', '', '15.03.2025', '267', '', 'Versandt', '01', '', '', 'Alt', 'Altbeleg', 'UStN',
    '384400000000000000202501004', '1077', '77', '1000', 'Sanitär', '', '']
];

const X = f => path.join(ROOT, 'scripts', f);
baueXlsx(X('.tmp_re_obj.xlsx'), OBJ_HEAD, OBJ_ROWS);
baueXlsx(X('.tmp_re_off.xlsx'), OFF_HEAD, OFF_ROWS);
baueXlsx(X('.tmp_re_auf.xlsx'), AUF_HEAD, AUF_ROWS);
baueXlsx(X('.tmp_re_re.xlsx'), RE_HEAD, RE_ROWS);
const AUFRAEUMEN = () => ['.tmp_re_obj.xlsx', '.tmp_re_off.xlsx', '.tmp_re_auf.xlsx', '.tmp_re_re.xlsx']
  .forEach(f => { try { fs.unlinkSync(X(f)); } catch (e) {} });

let pw = null;
try { pw = (await import('playwright-core')).chromium; } catch (e) {}
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium', '/usr/bin/chromium']
  .filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!pw || !CHROME) {
  console.log('⏭  ÜBERSPRUNGEN — playwright-core / Chromium fehlt. NICHTS wurde geprüft.');
  AUFRAEUMEN(); process.exit(0);
}

const server = await startServer();
const browser = await pw.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const st = seed(['role_planer']);
st.gema_users_v1.push({ id: 'u_jaeggi', username: 'rj@test.ch', name: 'Robin Jäggi', roleIds: ['role_planer'], orgId: 'org_test', active: true });
const { ctx, page } = await newPage(browser, st);
await page.goto(BASE + '/pm_erp.html');
await page.waitForFunction(() => document.getElementById('mtabs') && document.getElementById('mtabs').children.length, { timeout: 15000 });

async function importiere(sektion, datei, opts) {
  opts = opts || {};
  await page.click('#mtabs .mtab:has-text("Migration")');
  await page.click(`.mig-card:has-text("${sektion}")`);
  await page.waitForSelector('#migModal.open');
  await page.setInputFiles('#migFile', X(datei));
  await page.waitForSelector('.mig-map', { timeout: 10000 });
  const zug = await page.evaluate(() => {
    const bl = window._mig.sheets[window._mig.blatt];
    return { n: Object.keys(window._mig.mapping).length, sp: (bl.rows[window._mig.kopfIdx] || []).length };
  });
  await page.click('#migFoot .btn.pri');
  await page.waitForSelector('.mig-tab', { timeout: 10000 });
  if (opts.bezahltVor) { await page.fill('#migBezVor', opts.bezahltVor); await page.waitForTimeout(250); }
  if (opts.ohneAufBetrag) await page.uncheck('#migOptAufBetrag');
  const vorschau = await page.textContent('#migBody');
  await page.click('#migGo');
  await page.waitForSelector('.gema-dlg-bg', { timeout: 25000 });
  const bericht = (await page.textContent('.gema-dlg-bg')).replace(/\s+/g, ' ');
  await page.click('.gema-dlg-bg button');
  return { vorschau, bericht, zug };
}

console.log('\n═══ 1 — Engine: Status, Art, ESR, Frist ═══');
const e = await page.evaluate(() => {
  const I = GemaErpImport;
  return {
    st: ['Versandt', 'Entwurf', 'Storniert', 'Bezahlt', 'Gemahnt', 'Wiedervorlage', ''].map(x => [x, I.rechnungStatus(x)]),
    art: ['Schlussrechnung', 'Akontorechnung', 'Teilrechnung', 'Abschlagsrechnung', 'Verrechnungsschein', ''].map(x => [x, I.rechnungArt(x)]),
    esr: ['384400000000000000202602523', '384400000000000000202604008', '38440000000000000020260252', 'abc', ''].map(x => [x, I.esrGueltig(x)]),
    frist: [I.fristTage('01', 45), I.fristTage('10 Tage', 45), I.fristTage('XX', 45), I.fristTage('', 45)],
    add: [I.addTage('2026-04-21', 30), I.addTage('2026-12-20', 30), I.addTage('', 30)]
  };
});
eq('«Versandt» → gestellt', e.st[0][1], { status: 'gestellt', erkannt: true });
eq('«Entwurf» → entwurf', e.st[1][1].status, 'entwurf');
eq('«Storniert» → storniert', e.st[2][1].status, 'storniert');
eq('«Bezahlt» → bezahlt', e.st[3][1].status, 'bezahlt');
eq('«Gemahnt» → gestellt (noch offen)', e.st[4][1].status, 'gestellt');
eq('Unbekannt → gestellt + Hinweis', e.st[5][1], { status: 'gestellt', erkannt: false });
eq('Leer → gestellt, nicht als erkannt markiert', e.st[6][1], { status: 'gestellt', erkannt: false });
eq('«Schlussrechnung» → schluss', e.art[0][1], { art: 'schluss', erkannt: true });
eq('«Akontorechnung» → akonto', e.art[1][1].art, 'akonto');
eq('«Teilrechnung» → teil', e.art[2][1].art, 'teil');
eq('«Abschlagsrechnung» → akonto', e.art[3][1].art, 'akonto');
eq('Unbekannte Art → einzel + Hinweis', e.art[4][1], { art: 'einzel', erkannt: false });
t('Gültige ESR-Referenz erkannt', e.esr[0][1] === true);
t('Falsche Prüfziffer erkannt', e.esr[1][1] === false);
t('Zu kurze Referenz erkannt', e.esr[2][1] === false);
t('Text ist keine Referenz', e.esr[3][1] === false && e.esr[4][1] === false);
eq('Zahlbedingung «01» = 30 Tage', e.frist[0], 30);
eq('«10 Tage» wird gelesen', e.frist[1], 10);
eq('Unbekannte Bedingung → Firmen-Standard', [e.frist[2], e.frist[3]], [45, 45]);
eq('Frist über den Monat', e.add[0], '2026-05-21');
eq('Frist über den Jahreswechsel', e.add[1], '2027-01-19');
eq('Ohne Datum keine Frist', e.add[2], '');

console.log('\n═══ 2 — Grundlage: Objekte → Offerten → Aufträge ═══');
await importiere('Objekte', '.tmp_re_obj.xlsx');
await importiere('Offerten', '.tmp_re_off.xlsx');
await importiere('Aufträge', '.tmp_re_auf.xlsx');
eq('1 Objekt, 1 Offerte, 2 Aufträge', await page.evaluate(() => {
  const p = GemaSync.getCached('gema_erp_dok_pool_v1') || [];
  return [(GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll()).length,
    p.filter(d => d.typ === 'offerte').length, p.filter(d => d.typ === 'auftrag').length];
}), [1, 1, 2]);
eq('Auftrag A hat Positionen aus der Offerte, Auftrag B ist leer', await page.evaluate(() => {
  const p = (GemaSync.getCached('gema_erp_dok_pool_v1') || []).filter(d => d.typ === 'auftrag');
  return [p.find(d => d.nr === '9554.00').positionen.length, p.find(d => d.nr === '9820.00').positionen.length];
}), [1, 0]);

console.log('\n═══ 3 — Rechnungen: Zuordnung & Vorschau ═══');
const w = await importiere('Rechnungen', '.tmp_re_re.xlsx', { bezahltVor: '2026-01-01' });
t('Abschnitt ist freigeschaltet', !/Export ausstehend/.test(w.vorschau));
t('alle 33 Spalten automatisch zugeordnet (' + w.zug.n + '/' + w.zug.sp + ')', w.zug.n === 33 && w.zug.sp === 33);
t('Rechnungs-Nr. in der Vorschau', /2026\.0252/.test(w.vorschau));
t('Auftrags-Nr. ausgewiesen', /9554\.00/.test(w.vorschau));
t('Rechnungsart übersetzt', /Schluss/.test(w.vorschau) && /Akonto/.test(w.vorschau));
t('Unbekannte Art markiert', /Verrechnungsschein|\?/.test(w.vorschau));
t('Gültige ESR-Referenz markiert', /✓ ESR/.test(w.vorschau));
t('Ungültige ESR-Referenz gemeldet', /ungültig/.test(w.vorschau));
t('Ausführungs-Zeitraum sichtbar', /vom 14\.04\.2026 bis 16\.04\.2026/.test(w.vorschau));
t('Hinweis: Export enthält keine Zahlungsinformation', /keine Zahlungsinformation/.test(w.vorschau));
t('Warnung, wie viele überfällig erscheinen würden', /überfällig erscheinen/.test(w.vorschau));
t('Option «Leere Aufträge ergänzen» vorhanden', /Leere Aufträge mit dem verrechneten Betrag ergänzen/.test(w.vorschau));
t('Option «Fehlende Objekte anlegen» vorhanden', /Fehlende Objekte automatisch anlegen/.test(w.vorschau));
t('Bericht: 5 neu', /5 neu/.test(w.bericht));
t('Bericht nennt den Stichtag-Effekt', /als bezahlt übernommen/.test(w.bericht));
t('Bericht nennt die ergänzten Aufträge', /leere Aufträge mit dem verrechneten Betrag/.test(w.bericht));

console.log('\n═══ 4 — Ergebnis im ERP ═══');
const erg = await page.evaluate(() => {
  const p = GemaSync.getCached('gema_erp_dok_pool_v1') || [];
  return {
    re: p.filter(d => d.typ === 'rechnung').map(d => {
      const auf = p.find(x => x.id === (d.verknuepfung || {}).auftragId);
      const off = p.find(x => x.id === (d.verknuepfung || {}).offerteId);
      return {
        nr: d.nr, art: d.rechnungsArt, status: d.status, datum: d.datum, frist: d.frist,
        mwstPct: d.mwstPct, extId: d.extId, ref1: d.externeRef1, ref2: d.externeRef2,
        pos: d.positionen.length, ep: d.positionen[0] && d.positionen[0].ep,
        brutto: Math.round(erpDocTotals(d).brutto * 100) / 100,
        esr: d.importEsrRef || '', esrRoh: d.importEsrRefRoh || '', qrRef: erpRefFuer(d),
        ausgef: d.importAusgefuehrt, versandt: d.importVersandtAm, mwstCode: d.importMwstCode,
        zahlbed: d.importZahlbed, adrId: d.importAdrId, artText: d.importArtText, statusText: d.importStatusText,
        auftrag: auf && auf.nr, offerte: off && off.nr, sb: d.sachbearbeiter && d.sachbearbeiter.name,
        zahlungen: (d.zahlungen || []).length, anzeige: erpRechnungAnzeigeStatus(d, '2026-08-01')
      };
    }),
    auf: p.filter(d => d.typ === 'auftrag').map(d => ({
      nr: d.nr, pos: d.positionen.length, netto: d.positionen.map(x => x.ep),
      fakt: erpAuftragFakt(p, d.id)
    })),
    bp: ((GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll())[0].bezugspersonen || [])
      .map(x => [x.name, x.typen.join(',')])
  };
});
eq('5 Rechnungen angelegt', erg.re.length, 5);
const r1 = erg.re.find(x => x.nr === '2026.0252');
const r2 = erg.re.find(x => x.nr === '2026.0300');
const r3 = erg.re.find(x => x.nr === '2026.0301');
const r4 = erg.re.find(x => x.nr === '2026.0400');
const r5 = erg.re.find(x => x.nr === '2025.0100');
eq('Rechnungsdatum dd.mm.yyyy → ISO', r1.datum, '2026-04-21');
eq('Zahlungsfrist aus «01» = +30 Tage', r1.frist, '2026-05-21');
eq('Frist aus «10 Tage»', r4.frist, '2026-06-20');
eq('Schlussrechnung erkannt', r1.art, 'schluss');
eq('Akontorechnung erkannt', r2.art, 'akonto');
eq('Unbekannte Art → einzel', r4.art, 'einzel');
eq('Sammelposition mit Nettobetrag', [r1.pos, r1.ep], [1, 1072.15]);
eq('Total stimmt mit dem Altsystem überein', r1.brutto, 1159);
eq('MwSt-Satz aus dem Beleg (8.1 %)', r1.mwstPct, 8.1);
eq('Altbeleg behält seine 7.7 %', r5.mwstPct, 7.7);
eq('Altbeleg-Total', r5.brutto, 1077);
eq('Alt-ID übernommen', r1.extId, '11554');
eq('Externe Referenzen übernommen', [r1.ref1, r4.ref2], ['REF-A', 'REF-B']);
eq('Ausgeführt-Zeitraum als Vermerk', r1.ausgef, 'vom 14.04.2026 bis 16.04.2026');
eq('Versand-Zeitpunkt als Vermerk', r1.versandt, '24.04.2026 07:53:24');
eq('MwSt-Code / Zahlbedingung / Adress-ID als Vermerk', [r1.mwstCode, r1.zahlbed, r1.adrId], ['UStN', '01', '267']);
eq('Original-Art und -Status bleiben erhalten', [r4.artText, r4.statusText], ['Verrechnungsschein', 'Wiedervorlage']);

console.log('\n═══ 5 — ESR-Referenz für den Nachdruck ═══');
eq('Gültige Referenz wird übernommen', r1.esr, '384400000000000000202602523');
eq('… und im QR-Code verwendet', r1.qrRef, '384400000000000000202602523');
eq('Ungültige Referenz wird NICHT übernommen', r4.esr, '');
eq('… der Rohwert bleibt aber als Vermerk', r4.esrRoh, '384400000000000000202604008');
t('… und GEMA erzeugt eine eigene, gültige Referenz',
  r4.qrRef.length === 27 && r4.qrRef !== r4.esrRoh);

console.log('\n═══ 6 — Verknüpfungen (der eigentliche Prüfstein) ═══');
eq('Rechnung hängt am Auftrag', r1.auftrag, '9554.00');
eq('… und nimmt dessen Offerte mit', r1.offerte, '2026.0231');
eq('Beide Teilrechnungen hängen am selben Auftrag', [r2.auftrag, r3.auftrag], ['9820.00', '9820.00']);
t('Ohne Auftrags-Nr. keine Verknüpfung', !r4.auftrag && !r4.offerte);
eq('Sachbearbeiter vom Auftrag geerbt (Export führt keinen)', r1.sb, 'Robin Jäggi');

console.log('\n═══ 7 — Auftragswert & Fakturierungsstand ═══');
const aA = erg.auf.find(x => x.nr === '9554.00');
const aB = erg.auf.find(x => x.nr === '9820.00');
eq('Auftrag MIT Positionen bleibt unangetastet', [aA.pos, aA.netto], [1, [7282.9]]);
eq('Leerer Auftrag bekommt die SUMME seiner Rechnungen', [aB.pos, aB.netto], [1, [1200]]);
eq('… und steht damit auf 100 % verrechnet', aB.fakt.pct, 100);
t('Kein «überverrechnet»-Hinweis mehr',
  !(aB.fakt.hinweise || []).some(h => h.code === 'ueberverrechnet'));

console.log('\n═══ 8 — Zahlungen: nur der Stichtag entscheidet ═══');
eq('Altbeleg vor dem Stichtag → bezahlt', r5.status, 'bezahlt');
eq('… mit hinterlegter Zahlung', r5.zahlungen, 1);
eq('Belege nach dem Stichtag bleiben gestellt', [r1.status, r2.status, r4.status], ['gestellt', 'gestellt', 'gestellt']);
eq('… und erscheinen fristgerecht als überfällig', r1.anzeige, 'ueberfaellig');
eq('Bezahlter Beleg erscheint NICHT als überfällig', r5.anzeige, 'bezahlt');

console.log('\n═══ 9 — Bezugspersonen aus der Rechnung ═══');
t('Besteller angelegt', erg.bp.some(x => x[0] === 'Herr Hauswart' && x[1] === 'besteller'));
t('Bewohner angelegt', erg.bp.some(x => x[0] === 'Frau Muster' && x[1] === 'bewohner'));

console.log('\n═══ 10 — Zweiter Lauf ist idempotent ═══');
await page.evaluate(() => {
  const p = GemaSync.getCached('gema_erp_dok_pool_v1') || [];
  const r = p.find(d => d.typ === 'rechnung' && d.nr === '2026.0252');
  r.titel = 'Von Hand geändert';
  r.positionen.push({ id: 'p_manuell', art: 'frei', bez: 'Von Hand ergänzt', menge: 1, einheit: 'Std', ep: 90 });
  localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(p));
});
const w2 = await importiere('Rechnungen', '.tmp_re_re.xlsx');
t('Vorschau erkennt alle 5 als bereits vorhanden', /5 werden ergänzt/.test(w2.vorschau));
const nach = await page.evaluate(() => {
  const p = GemaSync.getCached('gema_erp_dok_pool_v1') || [];
  const r = p.find(d => d.typ === 'rechnung' && d.nr === '2026.0252');
  const b = p.find(d => d.typ === 'auftrag' && d.nr === '9820.00');
  return {
    anz: p.filter(d => d.typ === 'rechnung').length, titel: r.titel, pos: r.positionen.length,
    status: r.status, aufPos: b.positionen.length, aufEp: b.positionen[0].ep,
    objAnz: (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll()).length,
    adrAnz: GemaAdressen.list().length
  };
});
eq('Weiterhin 5 Rechnungen (keine Dubletten)', nach.anz, 5);
eq('Von Hand geänderter Titel bleibt', nach.titel, 'Von Hand geändert');
eq('Von Hand ergänzte Position bleibt unangetastet', nach.pos, 2);
eq('Status bleibt (kein Rückfall auf den Export)', nach.status, 'gestellt');
eq('Der ergänzte Auftrag wird nicht ein zweites Mal befüllt', [nach.aufPos, nach.aufEp], [1, 1200]);
eq('Keine neuen Objekte', nach.objAnz, 1);
eq('Keine neuen Adressen', nach.adrAnz, 1);

console.log('\n═══ 11 — Rechnungen erscheinen im ERP-Tab ═══');
await page.click('#mtabs .mtab:has-text("Rechnungen")');
await page.waitForTimeout(400);
const liste = await page.textContent('#docList');
t('Rechnung 2026.0252 in der Liste', /2026\.0252/.test(liste));
t('Rechnung 2025.0100 in der Liste', /2025\.0100/.test(liste));

await ctx.close(); await browser.close(); await server.close(); AUFRAEUMEN();
console.log(fail ? `\n✗ ${fail} von ${n} Checks fehlgeschlagen` : `\n✓ alle ${n} Checks bestanden`);
process.exit(fail ? 1 : 0);
