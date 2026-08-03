// pm_abnahme — Speicher-Schlüssel folgt dem gewählten Objekt (Datenverlust 28.07.2026)
//
// Vorfall: Ein Nutzer hat eine komplette Abnahme erfasst, danach war sie «weg».
// Ursache: STORAGE_KEY (= gema_abnahme_sia_v1__<objektId>[@phase]) wurde EINMAL
// beim Seitenstart berechnet und fror ein. onObjektSelect() füllte nur die
// Formularfelder — weder wurde das aktive Objekt gesetzt noch der Schlüssel neu
// berechnet. Die Abnahme landete damit unter dem BOOT-Schlüssel; beim nächsten
// Öffnen mit dem richtigen Objekt filterte _abProtoFromPool() auf einen anderen
// scopeKey → leeres Protokoll (Daten unsichtbar, aber vorhanden).
//
// Dieser Test sichert BEIDE Seiten ab:
//   A) Der Schlüssel folgt der Objektwahl (Ursachen-Fix) und eine bereits
//      begonnene, objektlose Abnahme WANDERT mit ins gewählte Projekt.
//   B) Ein unter einem fremden Schlüssel liegendes Protokoll ist über
//      «🔍 Suchen» auffindbar und zurückholbar (Rettung).
//
// Aufruf:  CHROME=<chromium> node scripts/abnahme_scope_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8917;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/pm_abnahme.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };
const OBJEKTE = [
  { id: 'obj_a', name: 'Neubau Sonnhalde', nummer: '25-01', strasse: 'Sonnweg 3', plz: '4000', ort: 'Basel', orgId: 'org_t', erstelltVon: 'u1', status: 'aktiv' },
  { id: 'obj_b', name: 'Umbau Rebgasse', nummer: '25-02', strasse: 'Rebgasse 8', plz: '4058', ort: 'Basel', orgId: 'org_t', erstelltVon: 'u1', status: 'aktiv' }
];

// In-Memory-PostgREST: hält die abproto:-Rows, damit ein Reload den echten
// Cloud-Weg nimmt (nicht nur den localStorage-Cache).
const cloud = new Map();   // data_key -> row
function rowsFor(url) {
  const like = /data_key=like\.([^&]+)/.exec(url);
  const mod = /module_key=eq\.([^&]+)/.exec(url);
  let out = [...cloud.values()];
  if (mod) out = out.filter(r => r.module_key === decodeURIComponent(mod[1]));
  if (like) {
    const pat = decodeURIComponent(like[1]).replace(/\*/g, '');
    out = out.filter(r => r.data_key.indexOf(pat) === 0);
  }
  return out;
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const req = route.request(), u = req.url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
    if (req.method() === 'POST') {
      let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
      if (!Array.isArray(body)) body = [body];
      body.forEach(r => { if (r && r.data_key) cloud.set(r.module_key + '|' + r.data_key, r); });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (req.method() === 'DELETE') {
      const mod = /module_key=eq\.([^&]+)/.exec(u), key = /data_key=eq\.([^&]+)/.exec(u);
      if (mod && key) cloud.delete(decodeURIComponent(mod[1]) + '|' + decodeURIComponent(key[1]));
      return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rowsFor(u)) });
  }
  if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
  return route.abort();
});
const seed = {
  gema_orgs_v1: JSON.stringify([ORG]),
  gema_users_v1: JSON.stringify(USERS),
  gema_session_v1: JSON.stringify(SESSION),
  gema_objpool_v1: JSON.stringify(OBJEKTE),
  gema_objekte_v1: JSON.stringify({ objekte: OBJEKTE, beteiligte: [], activeObjektId: '' }),
  gema_coachmarks_done_abnahme: '1'
};
// NUR beim ersten Laden seeden — ein erneutes Setzen von gema_objekte_v1
// (mit activeObjektId:'') wuerde beim Reload das aktive Objekt zuruecksetzen
// und die Realitaet verfaelschen.
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, seed);

async function neueSeite() {
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  return { page, errs };
}

// ── A) Ursache: Schlüssel folgt der Objektwahl ────────────────────────────
console.log('— A) Schlüssel folgt dem gewählten Objekt —');
let { page, errs } = await neueSeite();
ok(errs.length === 0, 'keine pageerrors beim Boot (' + errs.slice(0, 2).join(' | ') + ')');

const hatHooks = await page.evaluate(() => ({
  switchScope: typeof window._abSwitchScope === 'function',
  suchen: typeof window.abProtokolleSuchen === 'function',
  holen: typeof window.abProtokollHolen === 'function',
  btn: !!document.getElementById('protoFindBtn')
}));
ok(hatHooks.switchScope, '_abSwitchScope ist window-exponiert');
ok(hatHooks.suchen && hatHooks.holen, 'Such-/Hol-Funktionen sind window-exponiert');
ok(hatHooks.btn, '«🔍 Suchen»-Button in der Protokoll-Leiste vorhanden');

// Ohne Objekt starten, Abnahme befüllen
const startOhneObjekt = await page.evaluate(() => {
  const sel = document.getElementById('metaObjektDropdown');
  return { wert: sel ? sel.value : null, optionen: sel ? sel.options.length : 0 };
});
ok(startOhneObjekt.wert === '', 'Start ohne Objekt (freies Objekt)');
ok(startOhneObjekt.optionen >= 3, 'Objekt-Dropdown kennt die Projekte (' + startOhneObjekt.optionen + ')');

await page.evaluate(() => {
  const g = document.getElementById('arbeitsgattung') || document.getElementById('arbeitsgattungSel');
  const inp = document.getElementById('arbeitsgattung');
  if (inp) { inp.value = 'Sanitär Rohbau'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }
  const t = document.getElementById('gepruefterTeil');
  if (t) { t.value = 'Steigzone Haus A'; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); }
});
await page.waitForTimeout(300);
const vorher = await page.evaluate(() => {
  const st = (window._abState && window._abState()) || null;
  return { gattung: st && st.abnahme && st.abnahme.arbeitsgattung, teil: st && st.abnahme && st.abnahme.gepruefterTeil };
});
ok(vorher.gattung === 'Sanitär Rohbau', 'Arbeitsgattung erfasst');
ok(vorher.teil === 'Steigzone Haus A', 'Geprüfter Teil erfasst');

// JETZT das Objekt wählen — genau der Moment, in dem früher alles wegkippte
await page.evaluate(() => {
  const sel = document.getElementById('metaObjektDropdown');
  sel.value = 'obj_a';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(900);

const nachWahl = await page.evaluate(() => {
  const st = (window._abState && window._abState()) || null;
  return {
    aktivesObjekt: (typeof GemaObjekte !== 'undefined') ? GemaObjekte.getActiveId() : null,
    gattung: st && st.abnahme && st.abnahme.arbeitsgattung,
    teil: st && st.abnahme && st.abnahme.gepruefterTeil,
    pool: JSON.parse(localStorage.getItem('gema_abnahme_proto_pool_v1') || '[]')
  };
});
ok(nachWahl.aktivesObjekt === 'obj_a', 'Objektwahl setzt das aktive GEMA-Objekt');
ok(nachWahl.gattung === 'Sanitär Rohbau', 'erfasste Arbeitsgattung überlebt die Objektwahl');
ok(nachWahl.teil === 'Steigzone Haus A', 'erfasster Prüfteil überlebt die Objektwahl');
const recA = nachWahl.pool.filter(r => r && r.scopeKey === 'gema_abnahme_sia_v1__obj_a');
ok(recA.length === 1, 'Protokoll liegt unter dem Schlüssel des gewählten Objekts (' + recA.length + ')');
ok(!nachWahl.pool.some(r => r && r.scopeKey === 'gema_abnahme_sia_v1'), 'kein Rest unter dem objektlosen Boot-Schlüssel');
ok(recA.length === 1 && recA[0].state && recA[0].state.abnahme.arbeitsgattung === 'Sanitär Rohbau', 'Inhalt ist im umgehängten Record');
ok(recA.length === 1 && recA[0].objektId === 'obj_a', 'objektId am Record mitgezogen');
const protoId = recA.length ? recA[0].id : '';

// Reload MIT gesetztem Objekt → Abnahme muss da sein (das war «weg»)
await page.close();
({ page, errs } = await neueSeite());
await page.waitForTimeout(900);
const nachReload = await page.evaluate(() => {
  const st = (window._abState && window._abState()) || null;
  const sel = document.getElementById('metaObjektDropdown');
  return { gattung: st && st.abnahme && st.abnahme.arbeitsgattung, dropdown: sel ? sel.value : null };
});
ok(errs.length === 0, 'Reload ohne pageerror');
ok(nachReload.gattung === 'Sanitär Rohbau', 'nach Reload ist die Abnahme wieder da (Kern des Vorfalls)');
ok(nachReload.dropdown === 'obj_a', 'Objekt-Dropdown zeigt das Projekt');

// Objektwechsel A → B: A-Protokoll darf NICHT mitwandern
await page.evaluate(() => {
  const sel = document.getElementById('metaObjektDropdown');
  sel.value = 'obj_b';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(900);
const nachB = await page.evaluate(() => {
  const st = (window._abState && window._abState()) || null;
  return {
    gattung: (st && st.abnahme && st.abnahme.arbeitsgattung) || '',
    pool: JSON.parse(localStorage.getItem('gema_abnahme_proto_pool_v1') || '[]')
  };
});
ok(nachB.gattung !== 'Sanitär Rohbau', 'Projekt B startet mit leerem Protokoll (kein Übertrag A→B)');
ok(nachB.pool.some(r => r && r.scopeKey === 'gema_abnahme_sia_v1__obj_a' && r.state.abnahme.arbeitsgattung === 'Sanitär Rohbau'),
   'Protokoll von Projekt A bleibt unter A erhalten');

console.log('— B) Rettung: fremd zugeordnetes Protokoll finden & holen —');
// Ein Protokoll unter einem Fremd-Schlüssel in die Cloud legen (so lag die
// verschwundene Abnahme des Vorfalls da)
cloud.set('abnahme|abproto:verschollen1', {
  module_key: 'abnahme', data_key: 'abproto:verschollen1',
  payload: { data: {
    id: 'verschollen1', scopeKey: 'gema_abnahme_sia_v1__obj_a@2', objektId: 'obj_a', orgId: 'org_t',
    name: 'Protokoll 1', createdAt: '2026-07-28T07:00:00.000Z', updatedAt: '2026-07-28T15:00:00.000Z',
    state: { items: [{ id: 'm1', titel: 'Leck', mangel: 'Leck bei Steigleitung' }],
             abnahme: { arbeitsgattung: '250 Sanitäranlagen', bauobjekt: 'Neubau Sonnhalde', datum: '28.07.2026', gepruefterTeil: 'Steigzone' },
             sig: {} } } }
});
await page.close();
({ page, errs } = await neueSeite());
await page.waitForTimeout(900);

await page.evaluate(() => window.abProtokolleSuchen());
await page.waitForTimeout(1200);
const such = await page.evaluate(() => {
  const c = document.getElementById('abSuchCard');
  return { offen: !!(document.getElementById('abSuchBg') && document.getElementById('abSuchBg').style.display !== 'none'),
           txt: c ? c.textContent : '', holBtns: c ? c.querySelectorAll('[onclick^="abProtokollHolen"]').length : 0 };
});
ok(such.offen, 'Such-Modal öffnet');
ok(/Phase 2/.test(such.txt), 'fremde Zuordnung wird lesbar angezeigt (Phase)');
ok(/1 Mängel|1 Mängel\/Pendenzen/.test(such.txt) || /Mängel/.test(such.txt), 'Inhalt des Fundes wird beziffert');
ok(such.holBtns >= 1, '«In dieses Projekt holen» wird angeboten');

const geklickt = await page.evaluate(() => {
  // gezielt die Karte des verschollenen Protokolls (nicht irgendeine)
  const cards = [...document.querySelectorAll('#abSuchCard > div > div')];
  const c = cards.find(d => /250 Sanitäranlagen/.test(d.textContent));
  const b = c && c.querySelector('[onclick^="abProtokollHolen"]');
  if (b) { b.click(); return true; }
  return false;
});
ok(geklickt, 'Karte des verschollenen Protokolls gefunden und geholt');
await page.waitForTimeout(900);
const geholt = await page.evaluate(() => {
  const st = (window._abState && window._abState()) || null;
  return {
    items: st && Array.isArray(st.items) ? st.items.length : 0,
    gattung: st && st.abnahme && st.abnahme.arbeitsgattung,
    origNochDa: JSON.parse(localStorage.getItem('gema_abnahme_proto_pool_v1') || '[]')
      .some(r => r && r.id === 'verschollen1' && r.scopeKey === 'gema_abnahme_sia_v1__obj_a@2')
  };
});
ok(geholt.items === 1, 'geholtes Protokoll bringt seine Mängel mit');
ok(geholt.gattung === '250 Sanitäranlagen', 'geholtes Protokoll bringt seine Kopfdaten mit');
ok(geholt.origNochDa, 'das Original bleibt unter seiner alten Zuordnung erhalten (Kopie, kein Verschieben)');

// ── D) Keine Demo-Mängel in einer echten Abnahme ─────────────────────────
console.log('— D) Neues Protokoll startet LEER (keine Demo-Mängel) —');
// Bis 28.07.2026 füllte ensureDemo() jedes leere Protokoll mit 5 als «Offen»
// markierten Punkten («Installationshöhe Vorwandelement prüfen» …). Die sahen
// aus wie echte Feststellungen, landeten so in Cloud und PDF — der Nutzer
// konnte Demo nicht von Erfassung unterscheiden.
await page.close();
({ page, errs } = await neueSeite());
await page.waitForTimeout(700);
const nachNeu = await page.evaluate(() => {
  window.newProtocol();
  const st = (window._abState && window._abState()) || null;
  return {
    items: st && Array.isArray(st.items) ? st.items.length : -1,
    leerText: (document.getElementById('items') || {}).textContent || '',
    btn: !!document.getElementById('btnBeispiel')
  };
});
ok(nachNeu.items === 0, 'neues Protokoll hat 0 Mängel (' + nachNeu.items + ')');
ok(/Keine Punkte/.test(nachNeu.leerText), 'Mängelliste zeigt den Leer-Zustand');
ok(nachNeu.btn, '«＋ Standardpunkte» steht als bewusste Aktion bereit');

const nachVorlage = await page.evaluate(() => {
  window.abBeispielPunkte();
  const st = (window._abState && window._abState()) || null;
  return { items: st && st.items ? st.items.length : -1, erste: st && st.items[0] ? st.items[0].mangel : '' };
});
ok(nachVorlage.items === 5, 'Standardpunkte fügen genau 5 Punkte ein');
ok(/Installationshöhe Vorwandelement/.test(nachVorlage.erste), 'die bekannten Prüfpunkte bleiben verfügbar');
const nochmal = await page.evaluate(() => { window.abBeispielPunkte(); const st = window._abState(); return st.items.length; });
ok(nochmal === 10, 'erneutes Einfügen hängt an, überschreibt nie (' + nochmal + ')');

// ── E) Bewusste Protokoll-Wahl + Stammdaten-Übernahme ────────────────────
// Feedback 03.08.2026: «man soll via Button das entsprechende Protokoll
// bewusst auswählen, da sonst oft ein neues erstellt wird oder man im
// falschen schreibt» — ein «+ Neu» direkt neben einem Dropdown wurde zu oft
// versehentlich getroffen. Und: ein zweites Protokoll fürs selbe Projekt
// soll den Kopf nicht erneut abtippen müssen.
console.log('— E) Protokoll-Wahl über den Dialog + Stammdaten-Übernahme —');
await page.close();
({ page, errs } = await neueSeite());
await page.waitForTimeout(700);

// Erstes Protokoll mit vollem Kopf, einem Mangel, Ergebnis und Unterschrift
await page.evaluate(() => {
  const st = window._abState();
  Object.assign(st.abnahme, {
    bauobjekt: 'Neubau Sonnhalde, Sonnweg 3, 4000 Basel',
    bauherrName: 'Meier Hans', bauherrFirma: 'Bau AG',
    bauleitungName: 'Weber Anna', bauleitungFirma: 'Planer GmbH',
    unternehmerName: 'Koch Peter', unternehmerFirma: 'Sanitär Koch',
    arbeitsgattung: '250 Sanitäranlagen', ort: 'Basel',
    weitereBeteiligte: [{ funktion: 'Fachbauleitung', name: 'Suter', firma: 'FBL AG' }],
    gepruefterTeil: 'Steigzone A', ergebnis: 'unwesentliche', entscheid: 'abgenommen',
    sig: { unternehmer: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', name: 'Koch Peter' } }
  });
  st.items = [window._abCreateItem({ mangel: 'Rohrschelle fehlt' })];
  window._abRender();
});
await page.waitForTimeout(300);

ok(await page.evaluate(() => !!document.getElementById('protoPickBtn')), 'Protokoll-Wahl ist ein Knopf (kein Dropdown)');
ok(await page.evaluate(() => !document.getElementById('protoSelect')), 'das versehentlich treffbare Dropdown existiert nicht mehr');
const knopfTxt = await page.evaluate(() => (document.getElementById('protoPickBtn') || {}).textContent || '');
ok(/250 Sanitäranlagen/.test(knopfTxt), 'der Knopf zeigt das GEÖFFNETE Protokoll (' + knopfTxt.trim().slice(0, 60) + ')');

// Dialog öffnen — er zeigt das aktive Protokoll und legt NICHTS an
const vorherId = await page.evaluate(() => window._abActiveProtoId());
await page.evaluate(() => window.abProtoWaehlen());
await page.waitForTimeout(250);
const dlg = await page.evaluate(id => {
  const bg = document.getElementById('abSuchBg');
  const rows = [...document.querySelectorAll('#abSuchCard .proto-row')];
  return {
    offen: !!bg && bg.style.display !== 'none',
    zeilen: rows.length,
    aktMark: rows.filter(r => r.classList.contains('akt')).length,
    aktIstAktiv: rows.some(r => r.classList.contains('akt') && r.dataset.pid === id),
    text: (document.getElementById('abSuchCard') || {}).textContent || ''
  };
}, vorherId);
ok(dlg.offen, 'Klick auf den Knopf öffnet den Auswahl-Dialog');
ok(dlg.zeilen >= 1 && dlg.aktMark === 1 && dlg.aktIstAktiv, 'der Dialog listet die Protokolle, das offene ist markiert');
ok(/Neues Protokoll/.test(dlg.text), 'Neu anlegen steht IM Dialog (nicht mehr neben dem Wahl-Element)');
ok(/übernommen/.test(dlg.text), 'der Dialog sagt, was beim Neuanlegen übernommen wird');

// Neues Protokoll fürs selbe Projekt
await page.evaluate(() => window.abProtoNeu());
await page.waitForTimeout(600);
const neu = await page.evaluate(() => {
  const st = window._abState(), a = st.abnahme || {};
  return {
    id: window._abActiveProtoId(),
    name: (document.querySelector('#protoPickBtn .pc-txt') || {}).textContent || '',
    bauobjekt: a.bauobjekt || '', bauherrName: a.bauherrName || '', bauherrFirma: a.bauherrFirma || '',
    bauleitungName: a.bauleitungName || '', unternehmerFirma: a.unternehmerFirma || '',
    gattung: a.arbeitsgattung || '', ort: a.ort || '',
    weitere: Array.isArray(a.weitereBeteiligte) ? a.weitereBeteiligte.length : 0,
    // bewusst NICHT übernommen:
    teil: a.gepruefterTeil || '', ergebnis: a.ergebnis || '', entscheid: a.entscheid || '',
    sig: Object.keys(a.sig || {}).filter(k => (a.sig[k] || {}).dataUrl).length,
    items: Array.isArray(st.items) ? st.items.length : -1,
    anzahl: (window._abProtokolle ? window._abProtokolle().length : 0),
    dlgZu: !document.getElementById('abSuchBg') || document.getElementById('abSuchBg').style.display === 'none'
  };
});
ok(neu.id !== vorherId, 'das neue Protokoll ist geöffnet');
ok(neu.dlgZu, 'der Dialog schliesst sich nach der Wahl');
ok(neu.bauobjekt === 'Neubau Sonnhalde, Sonnweg 3, 4000 Basel', 'Bauobjekt übernommen');
ok(neu.bauherrName === 'Meier Hans' && neu.bauherrFirma === 'Bau AG', 'Bauherr (Name + Firma) übernommen');
ok(neu.bauleitungName === 'Weber Anna' && neu.unternehmerFirma === 'Sanitär Koch', 'Bauleitung + Unternehmer übernommen');
ok(neu.gattung === '250 Sanitäranlagen' && neu.ort === 'Basel', 'Arbeitsgattung + Ort übernommen');
ok(neu.weitere === 1, 'weitere Beteiligte übernommen');
ok(neu.items === 0, 'Mängel werden NICHT übernommen (' + neu.items + ')');
ok(!neu.ergebnis && !neu.entscheid && !neu.teil, 'Ergebnis/Entscheid/geprüfter Teil bleiben leer — das ist die neue Abnahme');
ok(neu.sig === 0, 'Unterschriften werden NIE mitkopiert (wäre eine Fälschung)');
ok(neu.name === 'Protokoll ' + neu.anzahl, 'der Knopf zeigt jetzt das neue Protokoll («' + neu.name + '»)');

// Zurückwechseln über den Dialog — das alte Protokoll ist unverändert
await page.evaluate(() => window.abProtoWaehlen());
await page.waitForTimeout(250);
const zeilenJetzt = await page.evaluate(() => document.querySelectorAll('#abSuchCard .proto-row').length);
ok(zeilenJetzt === dlg.zeilen + 1, 'das neue Protokoll steht mit zur Wahl (' + zeilenJetzt + ')');
const zurueck = await page.evaluate(async (alt) => {
  const ziel = document.querySelector('#abSuchCard .proto-row[data-pid="' + alt + '"]');
  if (!ziel) return null;
  ziel.click();
  await new Promise(r => setTimeout(r, 500));
  const st = window._abState();
  const s = (st.abnahme || {}).sig || {};
  return { id: window._abActiveProtoId(), items: st.items.length, sig: Object.keys(s).filter(k => (s[k] || {}).dataUrl).length };
}, vorherId);
ok(zurueck && zurueck.id === vorherId, 'Klick auf eine Zeile öffnet genau dieses Protokoll');
// Umbenennen: «Protokoll 1/2/3» sagt beim Wählen wenig
const umbenannt = await page.evaluate(async id => {
  window.renameProtocol(id);
  await new Promise(r => setTimeout(r, 250));
  const inp = document.getElementById('_gdInput');
  if (!inp) return { fehlt: true };
  inp.value = 'Steigzone A';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  const okBtn = document.querySelector('.gema-dlg-btn[data-act="ok"]');
  if (!okBtn) return { fehlt: true };
  okBtn.click();
  await new Promise(r => setTimeout(r, 350));
  const p = window._abProtokolle().find(x => x.id === id);
  return { name: p && p.name, knopf: (document.querySelector('#protoPickBtn .pc-txt') || {}).textContent || '' };
}, vorherId);
ok(umbenannt && umbenannt.name === 'Steigzone A', 'Protokoll umbenennen über den Dialog (' + (umbenannt && (umbenannt.name || 'kein Prompt')) + ')');
ok(umbenannt && umbenannt.knopf === 'Steigzone A', 'der Knopf übernimmt den neuen Namen');
ok(zurueck && zurueck.items === 1, 'das erste Protokoll hat seinen Mangel behalten');
ok(zurueck && zurueck.sig === 1, 'und seine Unterschrift');
ok(errs.length === 0, 'keine pageerrors bei Wahl/Neuanlage (' + errs.slice(0, 2).join(' | ') + ')');

console.log('— C) Statische Absicherung —');
const src = await readFile(join(ROOT, 'pm_abnahme.html'), 'utf8');
ok(/AB_STAMM_FELDER/.test(src) && /function _abStammUebernehmen/.test(src), 'Stammdaten-Whitelist als Helfer');
ok(!/AB_STAMM_FELDER\s*=\s*\[[^\]]*'sig'/.test(src), '«sig» steht NICHT in der Stammdaten-Whitelist');
ok(!/\bid="protoSelect"/.test(src), 'kein Protokoll-Dropdown mehr im Markup');
ok(/function switchProtocol\(id\)\{\s*var ziel=String\(id\|\|''\)/.test(src.replace(/\/\/[^\n]*\n/g, '')), 'switchProtocol wechselt nur mit ausdrücklicher id');
ok(/function _abScopeKey\(\)/.test(src), 'STORAGE_KEY wird über _abScopeKey() berechnet (friert nicht ein)');
ok(!/const\s+STORAGE_KEY/.test(src), 'STORAGE_KEY ist nicht mehr const');
ok(/scopeKey:p\._scope\|\|STORAGE_KEY/.test(src), 'scopeKey hängt am Protokoll, nicht am globalen Schlüssel');
ok(/addEventListener\('gema-objekt-changed'/.test(src), 'externer Objektwechsel wird nachgezogen');
ok(/GemaObjekte\.setActiveId\(sel\.value/.test(src), 'Objektwahl im Modul setzt das aktive Objekt');
ok(!/ensureDemo/.test(src), 'kein ensureDemo mehr — nichts wird automatisch in die Mängelliste geschrieben');
ok(/AB_BEISPIEL_PUNKTE/.test(src), 'Standardpunkte existieren als bewusst aufrufbare Vorlage');

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
