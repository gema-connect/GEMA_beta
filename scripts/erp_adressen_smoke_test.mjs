// Playwright-Smoke: Adressstamm (ERP-Tab «Adressen») + Migrations-Assistent.
//
// Prüft die ganze Kette im echten Modul: Tab rendert · Adresse erfassen mit
// Mehrfach-Typ · Suche/Filter · Import-Assistent (Datei → Zuordnung → Vorschau
// → Übernehmen) legt Objekte UND Adressen an · zweiter Lauf ist idempotent.
//
// Aufruf: node scripts/erp_adressen_smoke_test.mjs
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { startServer, newPage, seed, BASE, ROOT } from './rolematrix_harness.mjs';

let n = 0, fail = 0;
const t = (name, cond) => { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } };
const eq = (name, a, b) => t(name + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)), JSON.stringify(a) === JSON.stringify(b));

// ── Testdatei: exakt die Struktur des echten Exports (16 Spalten) ────────
function baueExport(dest) {
  const HEAD = ['id', 'strasse', 'strasse2', 'plz', 'ort', 'egid', 'egrid', 'korr_name',
    'name1', 'vorname', 'name1_1', 'vorname_1', 'knummer', 'co_knummer', 'ei_knummer', 'anschrift'];
  const ROWS = [
    ['4984', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '', '', '', '7330', '', '',
      'Zahlbar durch:_x000D_\nImmobilien Basel-Stadt_x000D_\nHellring 7_x000D_\n4125 Riehen_x000D_\n'],
    ['5280', 'Hellring 3', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt', '', '', '', '', '7685', '', '',
      'Zahlbar durch:_x000D_\nImmobilien Basel-Stadt_x000D_\nHellring 3_x000D_\n4125 Riehen_x000D_\n'],
    // Dritte Zeile mit Bezugsperson + Korrespondenz- und Eigentümer-Slot
    ['6001', 'Bahnhofstrasse 12', 'Haus B', '8001', 'Zürich', '1234', 'CH1', 'Muster AG',
      'Siebert', 'Florian', 'Brodmann', 'Anna', '9001', '9002', '9003',
      'Zahlbar durch:_x000D_\nMuster AG_x000D_\nBahnhofstrasse 12_x000D_\n8001 Zürich_x000D_\n' +
      'Korrespondenzadresse:_x000D_\nTreuhand Meier_x000D_\nPostfach 12_x000D_\n3000 Bern_x000D_\n' +
      'Eigentümer:_x000D_\nErbengemeinschaft Muster_x000D_\n8001 Zürich_x000D_\n']
  ];
  const ss = [];
  const si = v => { const i = ss.indexOf(v); if (i >= 0) return i; ss.push(v); return ss.length - 1; };
  const cell = (r, c, v) => `<c r="${String.fromCharCode(65 + c)}${r}" t="s"><v>${si(v)}</v></c>`;
  let sheet = '<row r="1">' + HEAD.map((h, c) => cell(1, c, h)).join('') + '</row>';
  ROWS.forEach((row, i) => {
    sheet += `<row r="${i + 2}">` + row.map((v, c) => v === '' ? '' : cell(i + 2, c, v)).join('') + '</row>';
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

const XLSX = path.join(ROOT, 'scripts', '.tmp_erp_export.xlsx');
baueExport(XLSX);

let pw = null;
try { pw = (await import('playwright-core')).chromium; } catch (e) {}
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium', '/usr/bin/chromium']
  .filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!pw || !CHROME) {
  console.log('⏭  ÜBERSPRUNGEN — playwright-core / Chromium fehlt. NICHTS wurde geprüft.');
  try { fs.unlinkSync(XLSX); } catch (e) {}
  process.exit(0);
}

const server = await startServer();
const browser = await pw.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
await page.goto(BASE + '/pm_erp.html');
await page.waitForFunction(() => document.getElementById('mtabs') && document.getElementById('mtabs').children.length, { timeout: 15000 });

console.log('\n═══ 1 — Adressen-Tab ═══');
const tabs = await page.$$eval('#mtabs .mtab', els => els.map(e => e.textContent.replace(/\d+$/, '').trim()));
t('Tab heisst «Adressen» (nicht mehr «Kunden»)', tabs.some(x => x.indexOf('Adressen') >= 0));
t('Migrations-Tab vorhanden', tabs.some(x => x.indexOf('Migration') >= 0));
await page.click('#mtabs .mtab:has-text("Adressen")');
t('Leerzustand verweist auf die Migration',
  /Migration/.test(await page.textContent('#docList')));
t('Button «＋ Neue Adresse»', await page.isVisible('#toolbar button:has-text("Neue Adresse")'));

console.log('\n═══ 2 — Adresse erfassen (Mehrfach-Typ) ═══');
await page.click('#toolbar button:has-text("Neue Adresse")');
await page.waitForSelector('#kundeModal.open');
const typAnz = await page.$$eval('#k_typen label', e => e.length);
eq('20 Kontakt-Typen aus dem Altsystem angeboten', typAnz, 20);
t('Kunden-Nr. schlägt die nächste freie vor',
  /automatisch/.test(await page.getAttribute('#k_nr', 'placeholder')));
await page.fill('#k_firma', 'Brodmann Dienstleistungen GmbH');
await page.fill('#k_tel', '061 711 77 69');
await page.fill('#k_email', 'info@brodmann.net');
await page.check('#k_typen input[value="bewohner"]');
await page.check('#k_typen input[value="hauswart"]');
await page.click('#kundeModal .btn.grn');
await page.waitForSelector('#kundeModal.open', { state: 'hidden' });
const gespeichert = await page.evaluate(() => GemaAdressen.list());
eq('1 Adresse gespeichert', gespeichert.length, 1);
eq('Beide Typen gespeichert', gespeichert[0].typen, ['bewohner', 'hauswart']);
eq('Kundennummer automatisch vergeben', gespeichert[0].nr, '1');
t('Karte zeigt die Typ-Chips', /Bewohner/.test(await page.textContent('#docList')));
t('Karte zeigt die Kundennummer', await page.isVisible('#docList .adr-nr'));

console.log('\n═══ 3 — Suche & Typ-Filter ═══');
await page.fill('#fAdrQ', 'brodmann');
t('Suche findet die Adresse', /Brodmann/.test(await page.textContent('#docList')));
await page.fill('#fAdrQ', 'xyzxyz');
t('Suche ohne Treffer meldet das', /Keine Adresse gefunden/.test(await page.textContent('#docList')));
await page.fill('#fAdrQ', '');
await page.selectOption('#fAdrTyp', 'bewohner');
t('Typ-Filter greift', /Brodmann/.test(await page.textContent('#docList')));
await page.selectOption('#fAdrTyp', '');

console.log('\n═══ 4 — Migration: Assistent ═══');
await page.click('#mtabs .mtab:has-text("Migration")');
const karten = await page.$$eval('.mig-card', e => e.map(x => x.className));
eq('5 Abschnitts-Karten', karten.length, 5);
eq('3 Abschnitte warten auf den Export', karten.filter(c => /aus/.test(c)).length, 3);
await page.click('.mig-card:has-text("Objekte")');
await page.waitForSelector('#migModal.open');
await page.setInputFiles('#migFile', XLSX);
await page.waitForSelector('.mig-map', { timeout: 10000 });
t('Schritt 2: Spalten-Zuordnung erscheint', await page.isVisible('.mig-map'));
const zugeordnet = await page.evaluate(() => Object.keys(window._mig.mapping).length);
t('Automatische Zuordnung erkennt ≥15 Spalten (' + zugeordnet + ')', zugeordnet >= 15);
eq('3 Datenzeilen erkannt',
  await page.evaluate(() => window._mig.sheets[0].rows.length - window._mig.kopfIdx - 1), 3);

await page.click('#migFoot .btn.pri');
await page.waitForSelector('.mig-tab', { timeout: 10000 });
console.log('\n═══ 5 — Vorschau ═══');
const vorschau = await page.textContent('#migBody');
t('Vorschau: 3 neu', /3 neu/.test(vorschau));
t('Vorschau nennt die neuen Adressen', /neue Adressen/.test(vorschau));
t('Zahlbar-durch aufgelöst', /Immobilien Basel-Stadt/.test(vorschau));
t('Korrespondenz-Slot erkannt', /Treuhand Meier/.test(vorschau));
t('Eigentümer-Slot erkannt', /Erbengemeinschaft Muster/.test(vorschau));
t('Bezugspersonen erkannt', /Florian Siebert/.test(vorschau));
t('Adresszusatz übernommen', /Haus B/.test(vorschau));

console.log('\n═══ 6 — Übernehmen ═══');
await page.click('#migGo');
await page.waitForSelector('.gema-dlg-bg', { timeout: 20000 });
const bericht = await page.textContent('.gema-dlg-bg');
t('Abschlussmeldung: 3 neu angelegt', /3<\/b> neu|3 neu/.test(bericht.replace(/\s+/g, ' ')));
await page.click('.gema-dlg-bg button');

const erg = await page.evaluate(() => ({
  adressen: GemaAdressen.list().map(a => ({ nr: a.nr, firma: a.firma, typen: a.typen })),
  objekte: (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll())
    .filter(o => o.quelle && o.quelle.typ === 'import')
    .map(o => ({ name: o.name, strasse: o.strasse, plz: o.plz, extId: o.extId, egid: o.egid,
      slots: Object.keys(o.adressen || {}), bp: (o.bezugspersonen || []).length, status: o.status }))
}));
eq('3 Objekte importiert', erg.objekte.length, 3);
eq('Objektname aus der Strasse', erg.objekte[0].name, 'Hellring 7');
eq('extId (alte ERP-ID) gespeichert', erg.objekte[0].extId, '4984');
eq('Status «aktiv» — sofort überall wählbar', erg.objekte[0].status, 'aktiv');
eq('Objekt 3: alle drei Adress-Slots', erg.objekte[2].slots.sort(), ['eigentuemer', 'korrespondenz', 'zahler']);
eq('Objekt 3: EGID übernommen', erg.objekte[2].egid, '1234');
eq('Objekt 3: 2 Bezugspersonen', erg.objekte[2].bp, 2);
// 1 von Hand + 5 aus dem Import (7330, 7685, 9001, 9002, 9003)
eq('Adressstamm: 6 Einträge', erg.adressen.length, 6);
t('Kundennummern aus dem Altsystem behalten',
  ['7330', '7685', '9001', '9002', '9003'].every(nr => erg.adressen.some(a => a.nr === nr)));
t('Gleiche Firma mit zwei Kundennummern bleibt getrennt',
  erg.adressen.filter(a => a.firma === 'Immobilien Basel-Stadt').length === 2);
t('Korrespondenz-Adresse trägt den passenden Typ',
  erg.adressen.some(a => a.nr === '9002' && (a.typen || []).indexOf('korrespondenzadresse') >= 0));
t('Von Hand erfasste Adresse unangetastet',
  erg.adressen.some(a => a.firma === 'Brodmann Dienstleistungen GmbH'));

console.log('\n═══ 7 — Zweiter Lauf ist idempotent ═══');
// Eine gepflegte Ergänzung, die der Import NICHT überschreiben darf
await page.evaluate(async () => {
  const a = GemaAdressen.list().find(x => x.nr === '7330');
  a.tel = '061 000 00 00'; a.kontakt = 'Von Hand gepflegt';
  await GemaAdressen.save(a);
});
await page.click('#mtabs .mtab:has-text("Migration")');
await page.click('.mig-card:has-text("Objekte")');
await page.waitForSelector('#migModal.open');
await page.setInputFiles('#migFile', XLSX);
await page.waitForSelector('.mig-map', { timeout: 10000 });
await page.click('#migFoot .btn.pri');
await page.waitForSelector('.mig-tab', { timeout: 10000 });
const v2 = await page.textContent('#migBody');
t('Vorschau erkennt alle 3 als bereits vorhanden', /3 werden ergänzt/.test(v2));
t('Keine neuen Adressen mehr nötig', !/neue Adressen/.test(v2));
await page.click('#migGo');
await page.waitForSelector('.gema-dlg-bg', { timeout: 20000 });
await page.click('.gema-dlg-bg button');
const erg2 = await page.evaluate(() => ({
  objekte: (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll()).filter(o => o.quelle && o.quelle.typ === 'import').length,
  adressen: GemaAdressen.list().length,
  a7330: GemaAdressen.list().find(x => x.nr === '7330'),
  bp: ((GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll()).find(o => o.extId === '6001') || {}).bezugspersonen || []
}));
eq('Weiterhin 3 Objekte (keine Dubletten)', erg2.objekte, 3);
eq('Weiterhin 6 Adressen (keine Dubletten)', erg2.adressen, 6);
eq('Gepflegte Telefonnummer überlebt den Import', erg2.a7330.tel, '061 000 00 00');
eq('Gepflegte Kontaktperson überlebt den Import', erg2.a7330.kontakt, 'Von Hand gepflegt');
eq('Bezugspersonen werden nicht dupliziert', erg2.bp.length, 2);

console.log('\n═══ 8 — Objekt-Seite: Adress-Slots & Bezugspersonen ═══');
await page.goto(BASE + '/pm_objekte.html');
await page.waitForFunction(() => typeof window.openObjektModal === 'function', { timeout: 15000 });
// Der Cloud-Mock der Harness liefert [] — der Bind leert den lokalen Cache
// also (in Produktion korrekt: Cloud gewinnt). Für diesen Abschnitt legen wir
// die Adresse deshalb NACH dem Bind direkt in der Seite an.
await page.evaluate(async () => {
  await GemaAdressen.ready;
  await GemaAdressen.save({ nr: '7330', firma: 'Immobilien Basel-Stadt',
    strasse: 'Hellring 7', plz: '4125', ort: 'Riehen', typen: ['eigentuemer'] });
});
await page.waitForFunction(() => GemaAdressen.list().length > 0, { timeout: 10000 });
await page.evaluate(() => openObjektModal());
await page.waitForSelector('#objModal.open, #objModal.show, #objModal', { state: 'visible', timeout: 8000 });
await page.evaluate(() => _objWzGo(4));
const slotAnz = await page.$$eval('#objAdrSlots select', e => e.length);
eq('Drei Adress-Slots im Objekt-Formular', slotAnz, 3);
const slotLabels = await page.textContent('#objAdrSlots');
t('Slot «Zahlbar durch»', /Zahlbar durch/.test(slotLabels));
t('Slot «Korrespondenzadresse»', /Korrespondenzadresse/.test(slotLabels));
t('Slot «Eigentümer»', /Eigent/.test(slotLabels));
t('Adressen aus dem Stamm wählbar (mit Kunden-Nr.)',
  /7330/.test(await page.$eval('#objAdrSlots select', e => e.innerHTML)));

// Slot setzen + Bezugsperson erfassen
const adrId = await page.evaluate(() => GemaAdressen.list().find(a => a.nr === '7330').id);
await page.evaluate(id => _objAdrSet('zahler', id), adrId);
t('Snapshot der Adresse wird mitgespeichert',
  await page.evaluate(() => !!(_objAdrHooks.slots().zahler && _objAdrHooks.slots().zahler.snapshot && _objAdrHooks.slots().zahler.snapshot.firma)));
t('Slot zeigt die Adresse als Klartext',
  /Immobilien Basel-Stadt/.test(await page.textContent('#objAdrSlots')));
await page.evaluate(() => _objBpAdd());
const bpTypen = await page.$$eval('#objBpList button', e => e.length);
t('Bezugsperson bietet die Kontakt-Typen an (' + (bpTypen - 1) + ')', bpTypen - 1 === 20);
// Über die Inline-Setter — genau der Pfad, den die Eingabefelder nehmen
await page.evaluate(() => {
  _objBpSet(0, 'vorname', 'Florian'); _objBpSet(0, 'name', 'Siebert'); _objBpSet(0, 'tel', '061 267 9923');
  _objBpTyp(0, 'besteller'); _objBpTyp(0, 'bewohner');
});
// Felder liegen auf Wizard-Schritt 1/2 (hier nicht sichtbar) — direkt setzen
await page.evaluate(() => {
  document.getElementById('objName').value = 'Testobjekt Hellring';
  document.getElementById('objStrasse').value = 'Hellring 7';
});
await page.evaluate(() => saveObjekt());
await page.waitForTimeout(700);
const obj = await page.evaluate(() => (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll())
  .find(o => o.name === 'Testobjekt Hellring'));
t('Objekt gespeichert', !!obj);
eq('Adress-Slot am Objekt gespeichert', obj.adressen.zahler.nr, '7330');
eq('Bezugsperson gespeichert', [obj.bezugspersonen[0].vorname, obj.bezugspersonen[0].name], ['Florian', 'Siebert']);
eq('Mehrfach-Typ gespeichert', obj.bezugspersonen[0].typen, ['besteller', 'bewohner']);
// Erneutes Öffnen muss die Zuordnung zeigen (kein stiller Verlust)
await page.evaluate(id => openObjektModal(id), obj.id);
await page.evaluate(() => _objWzGo(4));
eq('Slot beim Bearbeiten wieder vorausgewählt',
  await page.$eval('#objAdrSlots select', e => e.selectedIndex > 0), true);
eq('Bezugsperson beim Bearbeiten wieder da',
  await page.$$eval('#objBpList > div', e => e.length), 1);

// Regression: das Modul ist eine async-IIFE — Inline-Handler erreichen den
// Zustand nur über exportierte Setter. Vorher schrieben die Beteiligten-
// Felder in einen ReferenceError, die Eingabe war wirkungslos.
await page.evaluate(() => { _objAdrHooks.beteiligte().push({ rolle: 'bauherr', firma: '', person: '' }); });
await page.evaluate(() => { _objBetSet(0, 'firma', 'Tippen wirkt'); });
eq('Beteiligten-Eingabe wirkt (Inline-Setter)',
  await page.evaluate(() => _objAdrHooks.beteiligte()[0].firma), 'Tippen wirkt');

await ctx.close(); await browser.close(); server.close();
try { fs.unlinkSync(XLSX); } catch (e) {}
console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen' : '✓ alle ' + n + ' Checks bestanden'));
process.exit(fail ? 1 : 0);
