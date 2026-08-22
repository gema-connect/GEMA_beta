// CSV-Vollexport fuer Werkzeug + Fahrzeug (Feedback 22.08.2026:
// «Csv export soll bei fahrzeugen und werkzeug moeglich sein mit komplett
// allen daten»):
//   A) Statik — beide Module laden den ZIP-Schreiber, der Werkzeug-Knopf
//      existiert (exportCSV hatte dort JAHRELANG gar keinen Aufrufer) und
//      gema_storage.js exportiert zipTexte.
//   B) Werkzeug — Knopf nur fuer Berechtigte, Dialog nennt jede Tabelle mit
//      ihrer Zeilenzahl, die Bestandsliste traegt ALLE Felder, jede Zelle
//      ist gequotet (Semikolon/Zeilenumbruch/Anfuehrungszeichen im Text
//      zerreissen die Zeile nicht) und die Detail-Tabellen haben eine Zeile
//      pro Bericht / Pruefung / Koffer-Teil.
//   C) Fahrzeug — dasselbe; hier war das Quoting nachweislich kaputt (nur
//      «Notizen» war gequotet), darum die Gegenprobe mit Semikolon im Modell.
//   D) Leere Detail-Tabelle wird trotzdem erzeugt (Kopfzeile) — eine
//      fehlende Datei liest sich wie ein Fehler.
//   E) Filter-Bezug: exportiert wird die aktuelle Ansicht, «alle» ist
//      ausdruecklich waehlbar.
//   G) Der KNOPF liefert wirklich eine Datei — die Abschnitte davor messen
//      nur die Daten; ein Fehler im Download-Weg (Blob, a.download, ZIP)
//      faellt dort gar nicht auf. Hier wird die Datei GELESEN.
//
// Aufruf:  CHROME=<chromium> node scripts/csv_export_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { Buffer } from 'buffer';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8901;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

// ── RFC-4180-Parser: die eine Wahrheit, an der das Quoting gemessen wird ──
function csvParse(text, sep) {
  sep = sep || ';';
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── In-Memory-PostgREST ──────────────────────────────────────────────
const store = new Map();
function likeToRe(p) {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + esc.replace(/\*/g, '.*').replace(/_/g, '.') + '$');
}
function handleSb(route) {
  const req = route.request();
  const url = decodeURIComponent(req.url());
  const method = req.method();
  const mkEq = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const dkEq = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
  const dkLike = (url.match(/data_key=like\.([^&]+)/) || [])[1];
  if (method === 'GET') {
    const rows = [];
    for (const [k, v] of store) {
      const i = k.indexOf('|');
      const m = k.slice(0, i), d = k.slice(i + 1);
      if (mkEq && m !== mkEq) continue;
      if (dkEq && d !== dkEq) continue;
      if (dkLike && !likeToRe(dkLike).test(d)) continue;
      rows.push({ module_key: m, data_key: d, payload: v });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = [];
    try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(r => { if (r && r.module_key && r.data_key) store.set(r.module_key + '|' + r.data_key, r.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') { if (mkEq && dkEq) store.delete(mkEq + '|' + dkEq); return route.fulfill({ status: 204, body: '' }); }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

// ── Seeds ────────────────────────────────────────────────────────────
// «Gemein» befuellt: Semikolon, Zeilenumbruch und Anfuehrungszeichen in den
// Freitexten — genau daran ist der alte Fahrzeug-Export zerbrochen.
const GEMEIN = 'Regal B; Fach 2 — "hinten"\nzweite Zeile';
const TOOLS = [
  { id: 't_1700000000001', name: 'Bohrhammer TE 30', internKennung: 'WZ-014', cat: 'bohren', brand: 'Hilti', model: 'TE 30-AVR',
    serial: 'SN-4711', supplier: 'Hilti AG; Adliswil', supplierId: 'u_lief', bought: '2024-03-01', warranty: '2026-03-01',
    notes: GEMEIN, lifecycleStatus: 'aktiv', orgId: 'org_t',
    hasService: true, serviceInterval: 12, lastService: '2026-01-10',
    hasElec: true, elecInterval: 12, lastElec: '2026-02-01',
    elecHistory: [{ date: '2025-02-01', pruefer: 'Elektro AG', note: 'i.O.' }, { date: '2026-02-01', pruefer: 'Elektro AG', note: 'i.O.; Kabel neu' }],
    zugewiesenAn: { typ: 'user', userId: 'u_a', name: 'Anna Ammann', seit: '2026-05-01' },
    ausgeliehenAn: { userId: 'u_b', name: 'Beat Brunner', seit: '2026-08-01' },
    kaufbeleg: { rechnungsNr: 'R-2024-88', betrag: '1290.50', bestellNr: 'B-77', lieferdatum: '2024-03-05', datei: { name: 'beleg.pdf' } },
    berichte: [
      { id: 'b1', typ: 'defekt', datum: '2026-06-01T09:00:00Z', autorName: 'Beat Brunner', titel: 'Kabel defekt',
        beschreibung: 'Isolation offen; bitte prüfen', schweregrad: 'schwer', erledigt: false },
      { id: 'b2', typ: 'pruefbericht', datum: '2026-02-01T09:00:00Z', autorName: 'Elektro AG', titel: 'NIV-Prüfung',
        ergebnis: 'bestanden', fehlendeTeile: [], naechstePruefung: '2027-02-01', vonLieferant: true }
    ],
    ersatzAnfragen: [{ id: 'ea1', erstelltAm: '2026-06-02T10:00:00Z', typ: 'ersatz', lieferantFirma: 'Hilti AG',
      status: 'beantwortet', nachricht: 'Ersatz nötig', antwort: { preis: '1350.00', nachricht: 'Lieferbar', pdfName: 'offerte.pdf' } }],
    pruefAnfrage: { lieferantFirma: 'Elektro AG', typ: 'elektropruefung', wunschtermin: '2027-01-15', status: 'angefordert', angefordertAm: '2026-08-01T08:00:00Z' }
  },
  { id: 't_1700000000002', name: 'Leiter 3m', internKennung: 'WZ-002', cat: 'leiter', brand: 'Zarges', model: 'Z600',
    serial: '', supplier: '', bought: '2023-05-01', notes: '', lifecycleStatus: 'aktiv', orgId: 'org_t',
    hasLeiter: true, leiterInterval: 12, lastLeiter: '2026-03-01',
    leiterHistory: [{ date: '2026-03-01', pruefer: 'Leiterprüf GmbH', note: 'EKAS ok' }],
    zugewiesenAn: { typ: 'platz', platz: 'Lager Halle B', name: 'Lager Halle B', seit: '2026-01-02' }
  },
  { id: 't_1700000000003', name: 'Montagekoffer Sanitär', internKennung: 'KO-001', cat: 'koffer', istKoffer: true,
    bought: '2024-01-01', orgId: 'org_t', lifecycleStatus: 'aktiv',
    kofferInhalt: ['t_1700000000001', 't_nicht_da'],
    letzteKofferKontrolle: { am: '2026-08-10T07:30:00Z', von: 'Magaziner M', geprueft: 1, vollstaendig: false, fehlend: [{ id: 't_nicht_da', name: 'Wasserwaage' }] }
  }
];
const VEHICLES = [
  { id: 'v_1700000000001_a', nr: '30', plate: 'BS 30030', model: 'VW Crafter; L3H2', year: '2022', fuel: 'Diesel', color: 'weiss',
    type: 'Monteurfahrzeug', assignment: 'fix', driver: 'Zora Zimmerli', dept: 'Sanitär', status: 'aktiv',
    buildout: 'Werkstattausbau', equipment: 'Bohrhammer; Leiter', km: '90000', kmUpdatedAt: '2026-08-01T06:00:00Z',
    serviceKm: '30000', serviceMonths: '12', lastService: '2026-01-10', lastServiceKm: '80000', mfk: '2027-05-01',
    garage: 'Garage Meier AG', garagistUserId: 'u_gar', versicherungFreiFuerGaragist: true,
    stellplatz: 'Halle 2; Platz 4', tankkarten: [{ nr: '7008-1', netz: 'Migrol' }, { nr: '7008-2', netz: 'Shell' }],
    tires: 'Winter Michelin', tiresSeason: 'winter', tireStorage: 'Pneuhaus Blau', tireChangeDate: '2026-04-15',
    kaufbeleg: { rechnungsNr: 'FR-99', betrag: '48000', bestellNr: 'BF-12', lieferdatum: '2022-02-01' },
    versicherung: { gesellschaft: 'Mobiliar', policeNr: 'P-123', deckung: 'Vollkasko', ablauf: '2027-01-01' },
    ausgeliehenAn: { userId: 'u_a', name: 'Anna Ammann', seit: '2026-08-05' },
    hasAHK: true, hasRoof: false, hasNav: true, hasCam: false, hasLabel: true,
    notes: GEMEIN, orgId: 'org_t', createdAt: '2022-02-01T08:00:00Z', updatedAt: '2026-08-01T06:00:00Z',
    garageStatus: { eingebuchtAm: '2026-08-12T07:00:00Z', eingebuchtVonName: 'Gustav Garagist', werkstatt: 'Garage Meier AG', grund: 'Bremsen; Service' },
    events: [
      { type: 'defekt', date: '2026-07-01T10:00:00Z', label: 'Defekt: Bremse', detail: 'quietscht; hinten links', prio: 'hoch', resolved: false },
      { type: 'kosten', date: '2026-07-05T10:00:00Z', label: 'Treibstoff: CHF 120.00', detail: '05.07.2026 | 90000 km' }
    ],
    serviceHistorie: [{ id: 'svc_1', datum: '2026-01-10', km: '80000', art: 'Service', beschreibung: 'Grosser Service; Öl',
      kosten: '890', werkstatt: 'Garage Meier AG', erledigtVonName: 'Gustav Garagist', erstelltAm: '2026-01-10T16:00:00Z', photos: [] }],
    followUps: [{ id: 'fu_1', dueDate: '2026-12-01', beschreibung: 'Bremsscheiben prüfen', completed: false,
      plannedAt: '2026-01-10T16:00:00Z', plannedByName: 'Gustav Garagist', plannedFromEntryId: 'svc_1' }]
  },
  { id: 'v_1700000000002_b', nr: '10', plate: 'BS 10010', model: 'Ford Transit', type: 'Servicefahrzeug',
    assignment: 'sharing', driver: '', dept: '', status: 'aktiv', km: '120000', mfk: '2027-02-01', orgId: 'org_t',
    createdAt: '2023-02-05T08:00:00Z' }
];
function seedStore() {
  store.clear();
  TOOLS.forEach(t => store.set('werkzeugmanagement|tool:' + t.id, { data: JSON.parse(JSON.stringify(t)), _lm: '2026-08-01T00:00:00Z' }));
  VEHICLES.forEach(v => store.set('fahrzeugmanagement|vehicle:' + v.id, { data: JSON.parse(JSON.stringify(v)), _lm: '2026-08-01T00:00:00Z' }));
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true };
const TEAM = [
  { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch', nativeAnsicht: false } },
  { id: 'u_a', username: 'anna@t.ch', name: 'Anna Ammann', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'anna@t.ch', nativeAnsicht: false } },
  { id: 'u_b', username: 'beat@t.ch', name: 'Beat Brunner', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'beat@t.ch', nativeAnsicht: false } }
];

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(datei, opts) {
  opts = opts || {};
  const cOpt = { acceptDownloads: true };
  if (opts.viewport) { cOpt.viewport = opts.viewport; cOpt.isMobile = !!opts.mobile; cOpt.hasTouch = !!opts.mobile; }
  const ctx = await browser.newContext(cOpt);
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  const seed = { gema_orgs_v1: [ORG], gema_users_v1: TEAM,
    gema_session_v1: { token: 'x.y.z', userId: opts.userId || 'u_mag', expires: FUTURE } };
  if (opts.extra) Object.assign(seed, opts.extra);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const spalte = (rows, name) => rows[0].indexOf(name);

// ══════════════════════════════════════════════════════════════════
console.log('— A) Statik: Knopf, ZIP-Schreiber, Einbindung —');
{
  const wz = await readFile(join(ROOT, 'if_werkzeug.html'), 'utf8');
  const fz = await readFile(join(ROOT, 'if_fahrzeug.html'), 'utf8');
  const st = await readFile(join(ROOT, 'gema_storage.js'), 'utf8');

  ok(/id="btnWzExport"[^>]*onclick="_wzExportOpen\(\)"/.test(wz), 'Werkzeug: CSV-Knopf in der Toolbar (frueher hatte exportCSV GAR keinen Aufrufer)');
  ok(/var btnExp=document\.getElementById\('btnWzExport'\);\s*\n\s*if\(btnExp && canEdit\)/.test(wz), 'Werkzeug: CSV-Knopf haengt an canEdit');
  ok(/#btnWzExport\{order:23\}/.test(wz) && /\.toolbar #btnWzExport,/.test(wz), 'Werkzeug: CSV-Knopf ist im Handy-Layout der Toolbar eingeplant');
  ok(/onclick="exportCSV\(\)"/.test(fz), 'Fahrzeug: CSV-Knopf im Hero bleibt erhalten');

  ok(/function zipTexte\(dateien, zipName\)/.test(st), 'gema_storage: zipTexte vorhanden');
  ok(/zipTexte: zipTexte,/.test(st), 'gema_storage: zipTexte ist oeffentliche API');
  ok(/zipTexte[\s\S]{0,400}_zipBlob\(entries\)/.test(st), 'gema_storage: zipTexte nutzt DENSELBEN ZIP-Schreiber wie zipDownload');
  ok(/<script src="gema_storage\.js"><\/script>/.test(wz), 'Werkzeug bindet gema_storage.js ein');
  ok(/<script src="gema_storage\.js"><\/script>/.test(fz), 'Fahrzeug bindet gema_storage.js ein');

  // Der alte Fahrzeug-Export quotete NUR die Notizen — genau der Bug.
  ok(!/const rows=vehicles\.map\(v=>\[v\.nr,v\.plate/.test(fz), 'Fahrzeug: der alte, halb gequotete Export ist weg');
  ok(!/rows\.push\(\[t\.id,t\.name,t\.brand,t\.model,t\.supplier,CATS/.test(wz), 'Werkzeug: der alte 13-Spalten-Export ist weg');
}

// ══════════════════════════════════════════════════════════════════
console.log('— B) Werkzeug: Dialog, Bestandsliste, Detail-Tabellen —');
{
  seedStore();
  const { ctx, page } = await openPage('if_werkzeug.html');

  const sichtbar = await page.evaluate(() => {
    const b = document.getElementById('btnWzExport');
    return !!b && getComputedStyle(b).display !== 'none';
  });
  ok(sichtbar, 'Magaziner sieht den CSV-Knopf');

  await page.evaluate(() => _wzExportOpen());
  await page.waitForTimeout(200);
  const dlg = await page.evaluate(() => {
    const o = document.getElementById('_wzModalOverlay');
    return o ? o.innerText : '';
  });
  ok(/CSV-Export/.test(dlg), 'Dialog oeffnet');
  ok(/Bestandsliste/.test(dlg) && /Berichte & Defekte/.test(dlg) && /Prüfhistorie/.test(dlg)
     && /Koffer-Inhalt/.test(dlg) && /Ersatzanfragen/.test(dlg), 'Dialog nennt alle 5 Tabellen');
  ok(/3\s*Zeilen/.test(dlg), 'Dialog nennt die Zeilenzahl der Bestandsliste (3 Werkzeuge)');
  ok(/Nur Bestandsliste/.test(dlg) && /Alles \(ZIP\)/.test(dlg), 'Dialog bietet Einzel-CSV und ZIP');
  await page.evaluate(() => _wzCloseModal());

  // ── Bestandsliste ──
  const csv = await page.evaluate(() => _wzCsvTabelle(_WZ_CSV_BESTAND_KOPF, _wzViewBase().map(_wzCsvBestandZeile)));
  ok(csv.charCodeAt(0) === 0xFEFF, 'Bestandsliste beginnt mit UTF-8-BOM (Excel-Kanon)');
  ok(csv.split('\r\n')[0].indexOf(';') > 0, 'Semikolon als Trennzeichen');
  const rows = csvParse(csv);
  ok(rows.length === 4, 'Bestandsliste: Kopfzeile + 3 Werkzeuge (' + rows.length + ' Zeilen)');
  ok(rows.every(r => r.length === rows[0].length), 'Alle Zeilen haben gleich viele Spalten (' + rows[0].length + ')');
  ok(rows[0].length >= 60, 'Bestandsliste hat ' + rows[0].length + ' Spalten (frueher 13)');

  const bohr = rows.find(r => r[spalte(rows, 'Bezeichnung')] === 'Bohrhammer TE 30');
  const feld = n => bohr[spalte(rows, n)];
  ok(!!bohr, 'Werkzeug-Zeile gefunden');
  ok(feld('Interne Kennung') === 'WZ-014', 'Interne Kennung exportiert');
  ok(feld('Serien-Nr.') === 'SN-4711', 'Serien-Nr. exportiert');
  ok(feld('Lieferant') === 'Hilti AG; Adliswil', 'Lieferant MIT Semikolon unbeschaedigt');
  ok(feld('Standort / Notizen') === GEMEIN, 'Freitext mit Semikolon, Zeilenumbruch UND Anfuehrungszeichen unbeschaedigt');
  ok(feld('Zuweisung Art') === 'Person' && feld('Zuweisung an') === 'Anna Ammann', 'Zuweisung exportiert');
  ok(feld('Ausgeliehen an') === 'Beat Brunner' && feld('Ausgeliehen seit') === '2026-08-01', 'Ausleihe exportiert');
  ok(feld('Service aktiv') === 'Ja' && feld('Nächster Service') === '2027-01-10', 'Service inkl. gerechnetem naechstem Termin');
  ok(feld('Elektroprüfungen erfasst') === '2', 'Zahl der erfassten Elektropruefungen');
  ok(feld('Beleg Rechnungs-Nr.') === 'R-2024-88' && feld('Beleg Betrag') === '1290.50' && feld('Beleg Datei') === 'beleg.pdf', 'Kaufbeleg exportiert');
  ok(feld('Defekte offen') === '1' && feld('Berichte gesamt') === '2', 'Berichte gezaehlt');
  ok(/Kabel defekt/.test(feld('Berichte')) && /Prüfbericht/.test(feld('Berichte')), 'Berichte als lesbare Zusammenfassung in ihrer Zelle');
  ok(feld('Prüfanfrage Lieferant') === 'Elektro AG' && feld('Prüfanfrage Status') === 'angefordert', 'Pruefanfrage exportiert');
  ok(feld('Ersatzanfragen') === '1' && /Hilti AG/.test(feld('Ersatzanfragen Detail')), 'Ersatzanfragen exportiert');
  ok(feld('Org-ID') === 'org_t', 'Org-ID exportiert');
  ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(feld('Erfasst am')), 'Erfasst am aus der Record-ID abgeleitet (' + feld('Erfasst am') + ')');

  const leiter = rows.find(r => r[spalte(rows, 'Bezeichnung')] === 'Leiter 3m');
  ok(leiter[spalte(rows, 'Zuweisung Art')] === 'Platz' && leiter[spalte(rows, 'Zuweisung an')] === 'Lager Halle B', 'Platz-Zuweisung als solche exportiert');
  ok(leiter[spalte(rows, 'Leiterprüfung aktiv')] === 'Ja' && leiter[spalte(rows, 'Letzte Leiterprüfung')] === '2026-03-01', 'Leiterpruefung exportiert');

  const koffer = rows.find(r => r[spalte(rows, 'Bezeichnung')] === 'Montagekoffer Sanitär');
  ok(koffer[spalte(rows, 'Art')] === 'Koffer', 'Koffer als Art ausgewiesen');
  ok(koffer[spalte(rows, 'Koffer Teile')] === '2', 'Koffer-Teilezahl exportiert');
  ok(/Bohrhammer TE 30 \(SN SN-4711\)/.test(koffer[spalte(rows, 'Koffer Inhalt')]), 'Koffer-Inhalt mit Serien-Nr.');
  ok(/⚠/.test(koffer[spalte(rows, 'Koffer Inhalt')]), 'Nicht auffindbares Teil wird MARKIERT, nicht verschwiegen');
  ok(koffer[spalte(rows, 'Koffer-Kontrolle vollständig')] === 'Nein' && /Wasserwaage/.test(koffer[spalte(rows, 'Koffer-Kontrolle fehlend')]), 'Letzte Koffer-Kontrolle exportiert');
  ok(bohr[spalte(rows, 'Im Koffer')] === 'Montagekoffer Sanitär', 'Teil weist seinen Koffer aus');

  // ── Detail-Tabellen ──
  const tabs = await page.evaluate(() => _wzCsvTabellen(_wzViewBase()).map(t => ({ name: t.name, label: t.label, anzahl: t.anzahl, text: t.text })));
  ok(tabs.length === 5, '5 Tabellen (' + tabs.map(t => t.name).join(', ') + ')');
  const ber = csvParse(tabs[1].text);
  ok(tabs[1].anzahl === 2 && ber.length === 3, 'Berichte-Tabelle: 2 Zeilen');
  ok(ber[0].indexOf('Beschreibung') >= 0 && ber.some(r => /Isolation offen; bitte prüfen/.test(r.join('|'))), 'Bericht-Beschreibung mit Semikolon unbeschaedigt');
  const pr = csvParse(tabs[2].text);
  ok(tabs[2].anzahl === 3 && pr.length === 4, 'Pruefhistorie: 3 Zeilen (2 Elektro + 1 Leiter)');
  ok(pr.some(r => r.indexOf('Leiterprüfung') >= 0) && pr.some(r => r.indexOf('Elektroprüfung') >= 0), 'Pruefart je Zeile benannt');
  const kof = csvParse(tabs[3].text);
  ok(tabs[3].anzahl === 2 && kof.length === 3, 'Koffer-Inhalt: 2 Zeilen');
  ok(kof.some(r => r[kof[0].indexOf('Teil vorhanden')] === 'Nein'), 'Fehlendes Koffer-Teil als «nicht vorhanden» ausgewiesen');
  ok(tabs[4].anzahl === 1, 'Ersatzanfragen: 1 Zeile');

  ok(page.errs.length === 0, 'keine pageerrors (' + page.errs.join(' | ') + ')');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— C) Fahrzeug: Bestandsliste + Detail-Tabellen (Quoting-Bug) —');
{
  seedStore();
  const { ctx, page } = await openPage('if_fahrzeug.html');

  await page.evaluate(() => exportCSV());
  await page.waitForTimeout(200);
  const dlg = await page.evaluate(() => { const o = document.getElementById('_fzCsvOverlay'); return o ? o.innerText : ''; });
  ok(/CSV-Export/.test(dlg), 'Dialog oeffnet');
  ok(/Ereignisse & Defekte/.test(dlg) && /Service-Historie/.test(dlg) && /Folgetermine/.test(dlg) && /Tankkarten/.test(dlg), 'Dialog nennt alle Detail-Tabellen');
  await page.evaluate(() => _fzCsvClose());

  // if_fahrzeug ist eine async-IIFE — nur ueber die window-Hooks erreichbar.
  const csv = await page.evaluate(() => _fzCsvHooks.tabelle(_fzCsvHooks.kopf, _fzPermHooks.vehicles().map(_fzCsvHooks.zeile)));
  ok(csv.charCodeAt(0) === 0xFEFF, 'UTF-8-BOM');
  const rows = csvParse(csv);
  ok(rows.length === 3, 'Kopfzeile + 2 Fahrzeuge (' + rows.length + ' Zeilen)');
  ok(rows.every(r => r.length === rows[0].length), 'Alle Zeilen gleich lang (' + rows[0].length + ' Spalten)');
  ok(rows[0].length >= 55, 'Bestandsliste hat ' + rows[0].length + ' Spalten (frueher 18)');

  const v = rows.find(r => r[spalte(rows, 'Nr.')] === '30');
  const f = n => v[spalte(rows, n)];
  ok(f('Marke/Modell') === 'VW Crafter; L3H2', 'Modell MIT Semikolon unbeschaedigt (das war der Bug)');
  ok(f('Ausrüstung') === 'Bohrhammer; Leiter', 'Ausruestung mit Semikolon unbeschaedigt');
  ok(f('Notizen') === GEMEIN, 'Notizen mit Zeilenumbruch und Anfuehrungszeichen unbeschaedigt');
  ok(f('Nächster Service') === '2027-01-10', 'Naechster Service gerechnet');
  ok(f('Garage / Werkstatt') === 'Garage Meier AG' && f('Garagist-Konto') === 'u_gar', 'Garage + Garagist-Konto');
  ok(f('In Garage seit') === '2026-08-12 07:00' && f('In Garage Grund') === 'Bremsen; Service', 'Garage-Status exportiert');
  ok(/7008-1 · Migrol/.test(f('Tankkarten')) && /7008-2 · Shell/.test(f('Tankkarten')), 'Beide Tankkarten in der Zelle');
  ok(f('Police-Nr.') === 'P-123' && f('Versicherung Ablauf') === '2027-01-01', 'Versicherung exportiert');
  ok(f('Beleg Betrag') === '48000', 'Kaufbeleg exportiert');
  ok(f('Ausgeliehen an') === 'Anna Ammann', 'Ausleihe exportiert');
  ok(f('AHK') === 'Ja' && f('Dachträger') === 'Nein', 'Ausstattungs-Haken als Ja/Nein');
  ok(f('Defekte offen') === '1' && f('Ereignisse gesamt') === '2', 'Ereignisse gezaehlt');
  ok(/Defekt: Bremse/.test(f('Ereignisse')) && /Treibstoff/.test(f('Ereignisse')), 'Ereignisse als Zusammenfassung');
  ok(f('Service-Einträge') === '1' && /Garage Meier AG/.test(f('Service-Historie')), 'Service-Historie als Zusammenfassung');
  ok(f('Folgetermine offen') === '1' && /Bremsscheiben/.test(f('Folgetermine')), 'Folgetermine als Zusammenfassung');
  ok(f('Org-ID') === 'org_t' && f('Geändert am') === '2026-08-01 06:00', 'Org-ID + Zeitstempel');

  const tabs = await page.evaluate(() => _fzCsvHooks.tabellen(_fzPermHooks.vehicles()).map(t => ({ name: t.name, anzahl: t.anzahl, text: t.text })));
  ok(tabs.length === 5, '5 Tabellen (' + tabs.map(t => t.name).join(', ') + ')');
  const ev = csvParse(tabs[1].text);
  ok(tabs[1].anzahl === 2 && ev.length === 3, 'Ereignisse: 2 Zeilen');
  ok(ev.some(r => r[ev[0].indexOf('Detail')] === 'quietscht; hinten links'), 'Ereignis-Detail mit Semikolon unbeschaedigt');
  ok(ev.some(r => r[ev[0].indexOf('Priorität')] === 'hoch' && r[ev[0].indexOf('Behoben')] === 'Nein'), 'Defekt-Prioritaet und offener Zustand');
  const sh = csvParse(tabs[2].text);
  ok(tabs[2].anzahl === 1 && /Grosser Service; Öl/.test(sh[1].join('|')), 'Service-Historie: Beschreibung mit Semikolon unbeschaedigt');
  ok(tabs[3].anzahl === 1, 'Folgetermine: 1 Zeile');
  ok(tabs[4].anzahl === 2, 'Tankkarten: 2 Zeilen');

  ok(page.errs.length === 0, 'keine pageerrors (' + page.errs.join(' | ') + ')');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— D) Leere Detail-Tabelle wird trotzdem erzeugt —');
{
  store.clear();
  // Ein einziges Fahrzeug ohne jede Unterliste
  store.set('fahrzeugmanagement|vehicle:v_leer', { data: { id: 'v_leer', nr: '99', plate: 'BS 99', model: 'Leer', orgId: 'org_t' }, _lm: '2026-08-01T00:00:00Z' });
  const { ctx, page } = await openPage('if_fahrzeug.html');
  const tabs = await page.evaluate(() => _fzCsvHooks.tabellen(_fzPermHooks.vehicles()).map(t => ({ name: t.name, anzahl: t.anzahl, text: t.text })));
  ok(tabs.length === 5, 'auch ohne Unterlisten kommen alle 5 Tabellen (' + tabs.length + ')');
  ok(tabs.slice(1).every(t => t.anzahl === 0), 'Detail-Tabellen sind leer');
  ok(tabs.slice(1).every(t => csvParse(t.text).length === 1 && csvParse(t.text)[0].length > 3), 'jede leere Tabelle hat trotzdem ihre Kopfzeile');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— E) Bezug zur Ansicht: gefiltert vs. ganzer Bestand —');
{
  seedStore();
  const { ctx, page } = await openPage('if_werkzeug.html');
  await page.evaluate(() => { document.getElementById('searchInp').value = 'Bohrhammer'; renderList(); });
  await page.waitForTimeout(150);
  const gefiltert = await page.evaluate(() => _wzCsvListe().length);
  ok(gefiltert === 1, 'Export folgt der aktuellen Suche (' + gefiltert + ' Werkzeug)');
  await page.evaluate(() => _wzExportOpen());
  await page.waitForTimeout(150);
  const txt = await page.evaluate(() => document.getElementById('_wzModalOverlay').innerText);
  ok(/\b1\s+von\s+3\s+Werkzeugen\b/.test(txt), 'Dialog nennt Umfang «1 von 3»');
  ok(/Alle 3 Werkzeuge exportieren/.test(txt), 'Dialog bietet «alle exportieren» an, wenn gefiltert ist');
  await page.evaluate(() => _wzCsvSetAlle(true));
  await page.waitForTimeout(150);
  const alle = await page.evaluate(() => _wzCsvListe().length);
  ok(alle === 3, 'Umschalten auf «alle» exportiert den ganzen Bestand');
  await page.evaluate(() => { _wzCsvSetAlle(false); _wzCloseModal(); });
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— F) Monteur sieht den CSV-Knopf nicht —');
{
  seedStore();
  const { ctx, page } = await openPage('if_werkzeug.html', { userId: 'u_a' });
  const sichtbar = await page.evaluate(() => {
    const b = document.getElementById('btnWzExport');
    return !!b && getComputedStyle(b).display !== 'none';
  });
  ok(!sichtbar, 'Monteur: kein CSV-Knopf (Toolbar ist fuer ihn ohnehin ausgeblendet)');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— G) Der Knopf liefert wirklich eine Datei —');
async function holeDownload(page, klick) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), klick()]);
  const pfad = await dl.path();
  return { name: dl.suggestedFilename(), bytes: await readFile(pfad) };
}
// Ein STORE-ZIP ohne Bibliothek pruefen: Namen stehen im Local-Header im Klartext.
function zipNamen(buf) {
  const n = []; let i = 0;
  while ((i = buf.indexOf('PK\x03\x04', i, 'latin1')) >= 0) {
    const len = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28);
    n.push(buf.toString('utf8', i + 30, i + 30 + len));
    i += 30 + len + extra;
  }
  return n;
}
{
  seedStore();
  const { ctx, page } = await openPage('if_werkzeug.html');
  await page.evaluate(() => _wzExportOpen());
  await page.waitForTimeout(150);
  const einzel = await holeDownload(page, () => page.click('#_wzModalOverlay button:has-text("Nur Bestandsliste")'));
  ok(/^GEMA_Werkzeuge_\d{4}-\d{2}-\d{2}\.csv$/.test(einzel.name), 'Einzel-Download heisst ' + einzel.name);
  const txt = einzel.bytes.toString('utf8');
  ok(txt.charCodeAt(0) === 0xFEFF, 'die HERUNTERGELADENE Datei traegt den BOM');
  ok(csvParse(txt).length === 4, 'die heruntergeladene Datei hat Kopfzeile + 3 Werkzeuge');
  ok(!(await page.evaluate(() => !!document.getElementById('_wzModalOverlay'))), 'Dialog schliesst nach dem Export');

  await page.evaluate(() => _wzExportOpen());
  await page.waitForTimeout(150);
  const zip = await holeDownload(page, () => page.click('#_wzModalOverlay button:has-text("Alles (ZIP)")'));
  ok(/\.zip$/.test(zip.name), 'ZIP-Download heisst ' + zip.name);
  ok(zip.bytes.slice(0, 2).toString('latin1') === 'PK', 'es ist wirklich ein ZIP');
  const namen = zipNamen(zip.bytes);
  ok(namen.length === 5, 'ZIP enthaelt 5 Dateien (' + namen.join(', ') + ')');
  ok(namen[0] === '01_Bestand.csv' && namen[4] === '05_Ersatzanfragen.csv', 'ZIP-Inhalt vollstaendig benannt');
  ok(page.errs.length === 0, 'keine pageerrors (' + page.errs.join(' | ') + ')');
  await ctx.close();
}
{
  seedStore();
  const { ctx, page } = await openPage('if_fahrzeug.html');
  await page.evaluate(() => exportCSV());
  await page.waitForTimeout(150);
  const zip = await holeDownload(page, () => page.click('#_fzCsvOverlay button:has-text("Alles (ZIP)")'));
  ok(/^GEMA_Fahrzeuge_\d{4}-\d{2}-\d{2}\.zip$/.test(zip.name), 'Fahrzeug-ZIP heisst ' + zip.name);
  const namen = zipNamen(zip.bytes);
  ok(namen.length === 5 && namen[4] === '05_Tankkarten.csv', 'Fahrzeug-ZIP enthaelt 5 Dateien (' + namen.join(', ') + ')');
  const bestand = zip.bytes.indexOf('01_Bestand.csv') >= 0;
  ok(bestand, 'Bestandsliste liegt im ZIP');
  ok(page.errs.length === 0, 'keine pageerrors (' + page.errs.join(' | ') + ')');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
