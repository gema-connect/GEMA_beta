/* Drift-Guard «Ausschreibungs-Workflow nach Skizze» (08/2026, 15 Punkte):
   Devisierungs-Board (Zusatzblatt/Rabattposition, EINE Rechen-Wahrheit
   _upArt/_upBetrag/bkpGroupTotal), echte Beilagen-Dateien (⚠ ohne Datei),
   Freigabe Projektleitung (Soft-Gate vor dem Versand), mailto-Versand,
   Unterlagen-Versionierung (Auto-Bump NUR nach Versand), Offert-PDF-Upload,
   KI-PDF-Gegencheck (claude-offertcheck), Bemerkungen/Planer-Notiz,
   Abgebotsrunde, Dokumentensatz-Druck, Unterschriften (Canvas-Pad),
   Offertanfragen mit Mehrfach-Herstellern/Anhängen/BKP/Vorlagen (gema_offer_request)
   und die BKP-Hauptgruppen-Karten im Offerten-Tab von pm_objekte.

   Teil A: statische Anker (Node-only, laeuft immer).
   Teil B: Browser (Playwright): CHROME=<chromium> node scripts/ausschreibung_skizze_test.mjs */
import { readFileSync, existsSync } from 'fs';

const ROOT = '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let ok = 0, fail = 0;
const t = (b, msg) => { if (b) { ok++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const F = p => readFileSync(ROOT + '/' + p, 'utf8');

// ═══════════════════════════════════════════════════════════════════
console.log('■ Teil A — statische Anker');
// ═══════════════════════════════════════════════════════════════════
const aus = F('pm_ausschreibungsunterlagen.html');

// P5 Devisierungs-Board + geteilte Rechen-Wahrheit
t(aus.includes('function _upArt('), '_upArt (Art-Resolver) vorhanden');
t((aus.match(/function _upArt\(/g) || []).length === 1, '_upArt genau EINMAL definiert (keine Hoisting-Dublette)');
t(aus.includes('function _upBetrag(') && aus.includes('function bkpGroupTotal('), '_upBetrag + bkpGroupTotal (EINE Rechen-Wahrheit)');
t(aus.includes('🧱 Devisierung — Positionen je BKP-Gruppe'), 'Devisierungs-Board-Karte im pdet');
t(aus.includes('function addUpText(') && aus.includes('function addUpRabatt('), 'Zusatzblatt-Text + Rabattposition anlegbar');
t(aus.includes('bkpGroupTotal(a,bg,eTmp).total') || aus.includes('bkpGroupTotal(a, bg, eTmp).total'), 'iSubmitFunktional rechnet über bkpGroupTotal');

// P6 echte Beilagen-Dateien
t(aus.includes('function _beilagenUpload(') && aus.includes("GemaStorage.uploadFile"), 'Beilagen-Upload über GemaStorage.uploadFile');
t(aus.includes("'ausschreibung/'"), 'Upload-Pfad ausschreibung/<orgId> (storage-delete-Org-Grenze)');
t(aus.includes('⚠ ohne Datei'), 'Legacy-Einträge ohne Datei werden markiert, nie still');
t(aus.includes('function _beilagenCardUnternehmer('), 'Beilagen-Karte beim Unternehmer (Download-Links)');

// P9 Freigabe PL (Soft-Gate)
t(aus.includes('function _freigabeErteilt(') && aus.includes('function freigabeErteilen('), 'Freigabe-Funktionen vorhanden');
t(aus.includes('function freigabeAnfragen(') && aus.includes('function freigabeZurueckziehen('), 'Freigabe anfragen/zurückziehen');
t(/if\(!_freigabeErteilt\(a\)\)\{\s*\n?\s*dlgConfirm\('Noch keine Freigabe'/.test(aus), 'vtl() fragt ohne Freigabe nach (Soft-Gate, kein Hard-Block)');
t(aus.includes('✅ Freigabe Projektleitung'), 'Freigabe-Karte im Verteilen-Tab');

// P10 mailto-Versand
t(aus.includes('function versandMail(') && aus.includes('function _versandText('), 'versandMail + _versandText vorhanden');
t(aus.includes('mailto:'), 'echter mailto-Versand (kein Vorschau-Fake)');

// P15 Versionierung
t(aus.includes('function _bumpVersionBeiAenderung(') && aus.includes('function _ausVerteilt('), 'Auto-Versionierung + Verteilt-Guard');
t(aus.includes('function neueVersionMarkieren('), 'manuelle Version');
t(aus.includes('unterlagenVersion:a.version||1'), 'Verteilung/Einreichung stempeln die Version');
t(aus.includes('⚠ Unterlagen geändert'), 'Versions-Warnbanner beim Unternehmer');

// P11 Offert-PDF + Anhänge
t(aus.includes('id="iOffertFiles"') && aus.includes('offertPdf'), 'Offert-PDF-Upload im Einreichungs-Formular');
t(aus.includes('id="iBemerkungen"'), 'Bemerkungsfeld des Unternehmers');

// P12 KI-Gegencheck
t(aus.includes('function pruefeOffertPdf(') && aus.includes('function _erfasstePreiseText(') && aus.includes('function _pdfCheckHtml('), 'KI-Check-Kette im Modul');
t(aus.includes('GemaClaude.checkOfferPdf'), 'Modul ruft GemaClaude.checkOfferPdf');
t(aus.includes('massgebend bleibt das Original-PDF'), 'KI als Einschätzung deklariert');

// P13 Bemerkungen / Planer-Notiz / pvga
t(aus.includes('function _vglZusatzInfos(') && aus.includes('function vglSetNotiz('), 'Zusatzinfos + Planer-Notiz im Offertvergleich');
t(aus.includes('function _vgaBieterInfos('), 'Bieter-Infos im Vergabeantrag');
t(aus.includes('_vgaBieterInfos(a,eins,{mitNotiz:true})'), 'pvga (Planer) MIT interner Notiz');
t(aus.includes('_vgaBieterInfos(a,eins,{mitNotiz:false})'), 'avga (Architekt) OHNE interne Notiz');

// P14 Abgebotsrunde
t(aus.includes('id="mAbgebot"') && aus.includes('function openAbgebot(') && aus.includes('function abgebotSenden('), 'Abgebot-Modal + Start');
t(aus.includes('function abgebotEinreichen(') && aus.includes('function abgebotVerzichten('), 'Unternehmer-Antworten (einreichen/verzichten)');
t(aus.includes('function _abgebotVergleich('), 'Abgebots-Vergleich im pvgl');

// P7 Dokumentensatz + P8 Unterschriften
t(aus.includes('function druckDokumentensatz('), 'Dokumentensatz-Druck vorhanden');
t(aus.includes('pb-bkp'), 'Seitenumbruch je BKP-Gruppe zuschaltbar');
t(aus.includes('Beilagenverzeichnis') && aus.includes('Loszusammenstellung'), 'Dokumentensatz: Beilagenverzeichnis + Loszusammenstellung');
t(aus.includes('id="mSignatur"') && aus.includes('function openSignatur(') && aus.includes('function sigSave('), 'Unterschriften-Pad (Modal + Save)');
t(aus.includes('signatur:window._iSigTmp'), 'Unternehmer-Signatur wandert in die Einreichung');
t(!/druckDokumentensatz[\s\S]*?<script/.test(aus.slice(aus.indexOf('function druckDokumentensatz'), aus.indexOf('function druckDokumentensatz') + 9000)), 'Druckfenster ohne eigenen Script-Block (document.write-Regel)');

// Notify-Registrierung
const notif = F('gema_notify.js');
['ausschreibung_freigabe', 'ausschreibung_abgebot', 'ausschreibung_unterlagen_geaendert'].forEach(k => {
  t(notif.includes(k + ':'), 'EVENT_KEY ' + k + ' registriert');
  t(aus.includes("eventKey:'" + k + "'"), 'Modul pusht ' + k);
});

// KI-Proxy claude-offertcheck
t(existsSync(ROOT + '/netlify/functions/claude-offertcheck.js'), 'netlify/functions/claude-offertcheck.js existiert');
const fn = F('netlify/functions/claude-offertcheck.js');
t(fn.includes("require('./_jwt')") && fn.includes('requireAuth(event)'), 'Function ist JWT-gegated');
t(fn.includes("name: 'offerte_pruefen'") && fn.includes("tool_choice: { type: 'tool', name: 'offerte_pruefen' }"), 'erzwungenes Tool-Use offerte_pruefen');
t(fn.includes("enum: ['ok', 'abweichung', 'unklar']"), 'uebereinstimmung-Enum');
t(fn.includes('MAX_B64 = 4500000'), 'MAX_B64 ~3.3 MB (Netlify-Limit)');
t(/content\.push\(\{ type: 'document'[\s\S]*?content\.push\(\{\s*\n?\s*type: 'text'/.test(fn), 'Dokument-Block VOR dem Text-Block');
const toml = F('netlify.toml');
t(toml.includes('/api/claude-offertcheck') && toml.includes('/.netlify/functions/claude-offertcheck'), 'netlify.toml-Redirect vorhanden');
const gc = F('gema_claude.js');
t(gc.includes('OFFERTCHECK_ENDPOINT') && gc.includes('checkOfferPdf: checkOfferPdf'), 'GemaClaude.checkOfferPdf exportiert');
t(gc.includes("_parseJson(r, 'KI-Offertprüfung')"), 'checkOfferPdf nutzt den zentralen Antwort-Parser');

// P1-3 gema_offer_request (Mehrfach-Hersteller, Anhänge, BKP, Vorlagen)
const gor = F('gema_offer_request.js');
t(gor.includes('empfaenger:[]') || gor.includes('empfaenger: []'), 'Mehrfach-Empfänger-State');
t(gor.includes('org.settings.offertanfrage') && gor.includes('vorlagen'), 'org-weite Anfrage-Vorlagen');
t(gor.includes("'oa/'") || gor.includes('oa/'), 'Anhang-Upload-Pfad oa/<orgId>');
t(gor.includes('opts.bkp'), 'BKP-Feld übernehmbar');

// OA additive Felder + Export
const pk = F('gema_produktkatalog_api.js');
t(pk.includes('bkp: opts.bkp') && pk.includes('anhaenge: Array.isArray(opts.anhaenge)'), 'createOffertanfrage: bkp + anhaenge additiv');
t(/OA_BKP_MAP,/.test(pk), 'OA_BKP_MAP exportiert');

// P4 pm_objekte BKP-Karten
const po = F('pm_objekte.html');
t(po.includes('OFF_BKP_NAMEN') && po.includes('renderOffBkpCards') && po.includes('offNeueAnfrage'), 'Offerten-Tab: BKP-Hauptgruppen-Karten + freie Anfrage');

// SW-Bump
// Numerisch vergleichen, NIE per Ziffern-Regex: das frühere /gema-v4(8\d|9\d)/
// endete stillschweigend bei v499 und war ab v500 rot, obwohl die Version stieg.
t(parseInt((F('sw.js').match(/gema-v(\d+)/) || [])[1] || '0', 10) >= 480, 'sw.js-Version gebumpt (≥ v480)');

console.log('\nTeil A: ' + ok + ' ok, ' + fail + ' fehlgeschlagen');

// ═══════════════════════════════════════════════════════════════════
// Teil B — Browser
// ═══════════════════════════════════════════════════════════════════
if (!existsSync(CHROME)) {
  console.log('\n■ Teil B übersprungen — Chromium nicht gefunden (' + CHROME + '). CHROME=<pfad> setzen.');
  process.exit(fail ? 1 : 0);
}
const { chromium } = await import('playwright-core');
console.log('\n■ Teil B — Browser (Engine-Verhalten)');
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
page.on('pageerror', e => { fail++; console.log('  ✗ pageerror: ' + e.message); });
await page.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith('http') && !u.includes('localhost')) return r.abort();
  r.continue();
});

await page.goto('file://' + ROOT + '/sys_login.html');
await page.evaluate(() => {
  const now = Date.now();
  const user = { id: 'u_test', name: 'Test Planer', username: 'test@gema.ch', orgId: 'org_default', roleIds: ['role_planer'], active: true };
  localStorage.setItem('gema_users_v1', JSON.stringify([user]));
  localStorage.setItem('gema_session_v1', JSON.stringify({ userId: 'u_test', token: 'eyJ.fake.tok', expires: now + 864e5, remember: true }));
});
await page.goto('file://' + ROOT + '/pm_ausschreibungsunterlagen.html');
await page.waitForTimeout(1600);

// Seed: Ausschreibung mit Position/Zusatzblatt/Rabatt + Bieter + Einreichung
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  const a = { id: 'aus_sk1', name: 'Skizze Guard', typ: 'funktional', modell: 'pauschal', modelle: ['pauschal'],
    objekt: 'Testobjekt', orgId: u.orgId, erstelltVonUserId: u.id, lose: [], bkp: [], beteiligte: [],
    abzuege: [{ id: 'sk', name: 'Skonto', typ: 'prozent', aktiv: true }], plaene: [], unterlagen: [], beilagen: [], frist: '2099-01-01' };
  S.ausschreibungen.push(a); S.activeAusId = 'aus_sk1'; ensureLose(a);
  a.bkp = [{ code: '254.0', name: 'Leitungen', unterpositionen: [
    { id: 'u1', name: 'Pos A', art: 'position', menge: 2, einheit: 'Stk' },
    { id: 'u2', name: 'Pos B', art: 'position' },
    { id: 'u3', name: 'Hinweis Baustrom', art: 'text', beschrieb: 'Bauseits vorhanden' },
    { id: 'u4', name: 'Aktionsrabatt', art: 'rabatt' }
  ] }];
  S.beteiligte.push({ id: 'inst-x', typ: 'installateur', firma: 'Muster AG', email: 'muster@test.ch' });
  S.einreichungen.push({ id: 'e1', ausId: 'aus_sk1', installateurId: 'inst-x', firma: 'Muster AG',
    datum: '2026-08-01', total: 1350, rabatt: 0, prices: { '254.0_u1': 1000, '254.0_u2': 500, '254.0_u4': 10 },
    abzugWerte: {}, modell: 'pauschal', bemerkungen: 'Ohne Gewähr', unterlagenVersion: 1, offertPdf: null, anhaenge: [], planerNotiz: '' });
  sv(); buildTabs();
});

console.log('■ Rechen-Wahrheit (_upArt/_upBetrag/bkpGroupTotal)');
const calc = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_sk1'); const bg = a.bkp[0];
  const e = S.einreichungen.find(x => x.id === 'e1');
  const gt = bkpGroupTotal(a, bg, e);
  const eEP = { prices: { '254.0_u1': 100 }, modell: 'einheitspreise' };
  return {
    artP: _upArt(bg.unterpositionen[0]), artT: _upArt(bg.unterpositionen[2]), artR: _upArt(bg.unterpositionen[3]),
    artLegacy: _upArt({ name: 'alt' }),
    sum: gt.sum, rabatt: gt.rabatt, total: gt.total,
    textZaehltNull: _upBetrag(a, bg, bg.unterpositionen[2], e) === 0,
    epBetrag: _upBetrag(a, bg, bg.unterpositionen[0], eEP)
  };
});
t(calc.artP === 'position' && calc.artT === 'text' && calc.artR === 'rabatt', '_upArt klassifiziert position/text/rabatt');
t(calc.artLegacy === 'position', 'Altdaten ohne art-Feld = position (Bestandsschutz)');
t(calc.sum === 1500, 'Gruppensumme 1000+500 = 1500 (Text zählt 0)');
t(calc.rabatt === 150 && calc.total === 1350, 'Rabatt 10% auf Zwischentotal → 150, Total 1350');
t(calc.textZaehltNull, 'Zusatzblatt-Text ergibt nie einen Betrag');
t(calc.epBetrag === 200, 'Einheitspreise: EP 100 × Menge 2 = 200');

console.log('■ Versionierung (Auto-Bump NUR nach Versand)');
const ver = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_sk1');
  _bumpVersionBeiAenderung(a, 'Test vor Versand');
  const v1 = a.version || 1;
  S.verteilungen.push({ id: 'v1', ausId: 'aus_sk1', installateurId: 'inst-x', datum: '2026-08-01', unterlagenVersion: 1 });
  _bumpVersionBeiAenderung(a, 'Test nach Versand');
  return { v1: v1, v2: a.version, hist: (a.versionHistorie || []).length, auto: a.versionHistorie && a.versionHistorie[0] && a.versionHistorie[0].auto === true };
});
t(ver.v1 === 1, 'VOR dem Versand: kein Bump (Version bleibt 1)');
t(ver.v2 === 2 && ver.hist === 1 && ver.auto, 'NACH dem Versand: Bump auf v2 + Auto-Historie');

console.log('■ Freigabe PL');
const frg = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_sk1');
  const vorher = _freigabeErteilt(a);
  freigabeErteilen();
  return { vorher: vorher, nachher: _freigabeErteilt(a), von: a.freigabe.vonName };
});
t(!frg.vorher && frg.nachher, 'freigabeErteilen() setzt den Status');
t(frg.von === 'Test Planer', 'Freigabe trägt die Person (' + frg.von + ')');

console.log('■ Versand-Text (mailto-Grundlage)');
const vt = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_sk1');
  const inst = S.beteiligte.find(b => b.id === 'inst-x');
  return _versandText(a, inst); // {betreff, body, email}
});
t(vt.body.includes('?a=aus_sk1'), 'Deep-Link ?a=<id> im Versand-Text');
t(vt.betreff.includes('Skizze Guard') && vt.email === 'muster@test.ch', 'Betreff + Empfänger-E-Mail im Versand-Text');

console.log('■ Abgebotsrunde (Karte + Vergleich)');
const abg = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_sk1');
  const e = S.einreichungen.find(x => x.id === 'e1');
  e.abgebot = { angefragtAm: '2026-08-10T10:00:00Z', frist: '2099-01-01', mitZielpreis: true, zielpreis: 1200, nachricht: 'Bitte prüfen', status: 'angefragt' };
  const karte = _abgebotKarteUnternehmer(a, e);
  e.abgebot.status = 'eingereicht'; e.abgebot.total = 1200; e.abgebot.eingereichtAm = '2026-08-11T10:00:00Z';
  const vgl = _abgebotVergleich(a, [e]);
  const infoP = _vgaBieterInfos(a, [e], { mitNotiz: true });
  e.planerNotiz = 'intern XY';
  const infoP2 = _vgaBieterInfos(a, [e], { mitNotiz: true });
  const infoA = _vgaBieterInfos(a, [e], { mitNotiz: false });
  return { karteHatFrist: karte.includes('2099-01-01') && karte.includes('Zielpreis'),
    vglHatAbgebot: vgl.includes('Abgebot') && vgl.includes('Muster AG'),
    pMitNotiz: infoP2.includes('intern XY'), aOhneNotiz: !infoA.includes('intern XY'),
    bem: infoP.includes('Ohne Gewähr') };
});
t(abg.karteHatFrist, 'Unternehmer-Karte zeigt Frist + Zielpreis');
t(abg.vglHatAbgebot, 'Abgebots-Vergleich rendert (Firma + Abgebot)');
t(abg.bem, 'Bieter-Infos zeigen die Unternehmer-Bemerkungen');
t(abg.pMitNotiz && abg.aOhneNotiz, 'Planer-Notiz NUR in der Planer-Sicht (nicht beim Architekten)');

console.log('■ Erfasste-Preise-Text + KI-Ergebnis-Render');
const ki = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_sk1');
  const e = S.einreichungen.find(x => x.id === 'e1');
  const txt = _erfasstePreiseText(a, e);
  const html = _pdfCheckHtml({ am: '2026-08-12T08:00:00Z', ergebnis: { gesamtbetrag_pdf: 1400, uebereinstimmung: 'abweichung', fazit: 'Total weicht ab.', abweichungen: [{ position: 'Total', pdf_wert: 'CHF 1400', erfasst_wert: 'CHF 1350', hinweis: 'prüfen' }] } });
  return { hatBkp: txt.includes('254.0'), hatNetto: /netto/i.test(txt),
    pill: html.includes('Abweichungen'), fazit: html.includes('Total weicht ab.'), hinweis: html.includes('massgebend bleibt das Original-PDF') };
});
t(ki.hatBkp && ki.hatNetto, '_erfasstePreiseText enthält BKP-Gruppe + Netto');
t(ki.pill && ki.fazit && ki.hinweis, '_pdfCheckHtml rendert Pill + Fazit + Massgeblichkeits-Hinweis');

console.log('■ Beilagen (Legacy ohne Datei)');
const beil = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_sk1');
  a.plaene.push({ name: 'Altplan.pdf', datum: '2026-01-01' });
  a.unterlagen.push({ name: 'Neu.pdf', datum: '2026-08-01', url: 'https://x/neu.pdf', size: 1234 });
  _beilagenSyncLegacy(a);
  return { dok: renderDokumente(a), un: _beilagenCardUnternehmer(a), legacy: (a.beilagen || []).join('|') };
});
t(beil.dok.includes('⚠ ohne Datei'), 'Legacy-Plan ohne url → ⚠-Markierung beim Planer');
t(beil.un.includes('Altplan.pdf') && beil.un.includes('Neu.pdf'), 'Unternehmer-Karte listet beide Beilagen');
t(beil.legacy.includes('Altplan.pdf') && beil.legacy.includes('Neu.pdf'), 'a.beilagen-Namensliste synchron (Alt-Leser)');

console.log('■ Devisierungs-Board im pdet');
await page.evaluate(() => nav('pdet'));
await page.waitForTimeout(300);
t(await page.evaluate(() => document.body.textContent.includes('Devisierung — Positionen je BKP-Gruppe')), 'Board-Karte gerendert');
t(await page.evaluate(() => document.body.textContent.includes('Zusatzblatt-Text')), 'Zusatzblatt-Button sichtbar');
const board = await page.evaluate(() => {
  const a = S.ausschreibungen.find(x => x.id === 'aus_sk1');
  const n0 = a.bkp[0].unterpositionen.length;
  addUpText(0);
  const up = a.bkp[0].unterpositionen[a.bkp[0].unterpositionen.length - 1];
  return { plus1: a.bkp[0].unterpositionen.length === n0 + 1, art: up.art };
});
t(board.plus1 && board.art === 'text', 'addUpText legt eine text-Position an');

console.log('■ Dokumentensatz-Druck (window.open-Stub)');
const dok = await page.evaluate(() => {
  let cap = null;
  const orig = window.open;
  window.open = function () { return { document: { write: h => { cap = h; }, close() {} }, close() {} }; };
  druckDokumentensatz();
  window.open = orig;
  return cap || '';
});
t(dok.includes('Dokumentensatz'), 'Druckfenster geschrieben');
t(dok.includes('Skizze Guard') && dok.includes('254.0'), 'Titel + LV-Gruppe im Dokument');
t(dok.includes('pb-bkp'), 'Seitenumbruch-Schalter (pb-bkp) im Fenster');
t(dok.includes('Leistungsverzeichnis') && dok.includes('Beilagenverzeichnis') && dok.includes('Unterschriften'), 'alle Abschnitte vorhanden');
t(dok.includes('Version 2'), 'Unterlagen-Version auf dem Titelblatt');
t(dok.includes('✓ erteilt von'), 'Freigabe-Status auf dem Titelblatt');
t(dok.includes('Aktionsrabatt') && dok.includes('Hinweis Baustrom'), 'Rabatt- und Text-Positionen im LV');
t(!/<script/i.test(dok), 'kein Script-Block im Druckfenster (Inline-Handler-Regel)');

console.log('■ Unterschrift Planer (Canvas-Pad)');
await page.evaluate(() => openSignatur('planer'));
await page.waitForTimeout(300);
t(await page.evaluate(() => document.getElementById('mSignatur').classList.contains('open') || getComputedStyle(document.getElementById('mSignatur')).display !== 'none'), 'Signatur-Modal offen');
const sig = await page.evaluate(() => {
  const c = document.getElementById('sigCanvas');
  const ctx = c.getContext('2d');
  ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(120, 60); ctx.stroke();
  _sigZiel.drawn = true;
  document.getElementById('sigName').value = 'Hans Muster';
  sigSave();
  const a = S.ausschreibungen.find(x => x.id === 'aus_sk1');
  return { hat: !!(a.unterschrift && a.unterschrift.dataUrl && a.unterschrift.dataUrl.indexOf('data:image/png') === 0), name: a.unterschrift && a.unterschrift.name };
});
t(sig.hat, 'a.unterschrift als PNG-DataURL gespeichert');
t(sig.name === 'Hans Muster', 'Name/Visum gespeichert');
await page.waitForTimeout(250);
t(await page.evaluate(() => document.body.textContent.includes('✍️ Unterschrieben ✓')), 'pdet-Kopf zeigt «Unterschrieben ✓»');

console.log('■ Offertvergleich (pvgl) — Bemerkungen/Notiz/Abgebot sichtbar');
await page.evaluate(() => nav('pvgl'));
await page.waitForTimeout(300);
const pvgl = await page.evaluate(() => ({
  bem: document.body.textContent.includes('Ohne Gewähr'),
  abgebotBtn: document.body.textContent.includes('Abgebotsrunde'),
  notiz: !!document.querySelector('textarea[onblur*="vglSetNotiz"]')
}));
t(pvgl.bem, 'Unternehmer-Bemerkung im Vergleich');
t(pvgl.abgebotBtn, 'Abgebotsrunde-Knopf im Vergleich');
t(pvgl.notiz, 'Planer-Notiz-Feld vorhanden');

console.log('■ Vergabeantrag (pvga) — Bieter-Infos');
await page.evaluate(() => nav('pvga'));
await page.waitForTimeout(300);
t(await page.evaluate(() => document.body.textContent.includes('Bemerkungen & Zusatzinfos der Bieter')), 'Bieter-Infos-Sektion im Vergabeantrag');
t(await page.evaluate(() => document.body.textContent.includes('intern XY')), 'interne Planer-Notiz in der Planer-Sicht');

await browser.close();
console.log('\n══════════════════════════════');
console.log((fail ? '✗ ' : '✓ ') + ok + ' Checks ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
