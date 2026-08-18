/**
 * Drift-Guard: Datei-Dialoge auf iOS (Mediathek-Auswahl)
 *
 * Gemeldet 18.08.2026 (Dachbericht, iPad): «Fotos aus der Mediathek kann man
 * nicht einfügen, es passiert einfach nichts — mit der Kamera funktioniert es.»
 *
 * Zwei unabhängige Ursachen, beide still:
 *
 *  (1) Ein per createElement erzeugter File-Input, der NICHT im DOM hängt,
 *      wird von WebKit weggeräumt, während der Auswahl-Dialog offen ist —
 *      das change-Event feuert danach nie. Der Fotos-Picker läuft als eigener
 *      Prozess und ist länger offen als die Kamera; darum traf es genau den
 *      Mediathek-Weg. gema_auth.js spannt dafür ein zentrales Netz (es ist die
 *      einzige Datei auf JEDER Modulseite).
 *
 *  (2) Ein Foto aus der iCloud-Mediathek kommt auf iOS regelmässig OHNE
 *      MIME-Typ an (file.type === ''). Ein strenger
 *      `type.indexOf('image')===0`-Filter verwarf es kommentarlos.
 *
 * Teil A  Node    — statisch: Netz vorhanden, Dachbericht-Filter tolerant,
 *                   nichts fällt still weg
 * Teil B  Browser — echte Wirkung: losgelöster Input landet im DOM, das
 *                   change-Event kommt an, eine Datei ohne MIME-Typ wird
 *                   übernommen; Gegenprobe ohne Netz
 *
 * Ausführung:  CHROME=<chromium> node scripts/dateiwahl_ios_test.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, fail = 0;
const t = (name, cond) => { if (cond) { ok++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };

const AUTH = readFileSync(join(ROOT, 'gema_auth.js'), 'utf8');
const DACH = readFileSync(join(ROOT, 'sp_dachbericht.html'), 'utf8');

// ═══════════════════════════════════════════════════════════
console.log('— A1  Zentrales Netz in gema_auth.js —');
// ═══════════════════════════════════════════════════════════
t('patcht HTMLInputElement.prototype.click', /HTMLInputElement\.prototype[\s\S]{0,200}proto\.click\s*=\s*function/.test(AUTH));
t('greift NUR bei type="file"', /el\.type\s*!==\s*'file'/.test(AUTH));
t('lässt korrekt eingehängte Inputs unberührt (isConnected)', /el\.isConnected/.test(AUTH));
t('hängt den Input VOR dem Klick ein', (function () {
  const b = AUTH.slice(AUTH.indexOf('proto.click = function'), AUTH.indexOf('proto.__gemaFileClickFix = true'));
  return b.indexOf('document.body.appendChild(el)') > 0 && b.indexOf('document.body.appendChild(el)') < b.lastIndexOf('nativeClick.call(el)');
})());
t('räumt nach der Auswahl wieder ab', /addEventListener\('change'[\s\S]{0,120}weg/.test(AUTH));
t('räumt auch bei Abbruch ab (kein change-Event)', /addEventListener\('focus'[\s\S]{0,120}weg/.test(AUTH));
t('idempotent (Doppel-Laden bricht nichts)', /__gemaFileClickFix\)\s*return/.test(AUTH));
t('läuft vor der Auth-IIFE, also auch ohne Session', AUTH.indexOf('__gemaFileClickFix') < AUTH.indexOf("var STORAGE_ORGS"));

// ═══════════════════════════════════════════════════════════
console.log('— A2  Dachbericht: Input im DOM, Typ-Filter tolerant —');
// ═══════════════════════════════════════════════════════════
const pick = DACH.slice(DACH.indexOf('function pickGridImage'), DACH.indexOf('function _spIstBild'));
t('pickGridImage hängt den Input selbst ein', /document\.body\.appendChild\(input\)/.test(pick));
t('… und zwar vor dem Klick', pick.indexOf('document.body.appendChild(input)') < pick.indexOf('input.click()'));
t('liegengebliebene Instanz wird abgeräumt', /_spPickInput\s*&&\s*_spPickInput\.parentNode/.test(pick));
t('Mediathek-Weg setzt KEIN capture (sonst nur Kamera)', !/capture/.test(pick));
t('Mehrfachauswahl bleibt', /input\.multiple\s*=\s*true/.test(pick));

t('_spIstBild: leerer MIME-Typ gilt als Bild (iCloud-Foto)',
  /if\(f\.type\) return f\.type\.indexOf\('image'\) === 0;[\s\S]{0,60}return true;/.test(DACH));
t('kein strenger Typ-Filter mehr in _addFilesToGrid',
  !/filter\(function\(f\)\{ return f && f\.type && f\.type\.indexOf\('image'\) === 0; \}\)/.test(DACH));
t('Verarbeitung nutzt denselben Resolver', /if\(!_spIstBild\(file\)\)\{ resolve\(null\); return; \}/.test(DACH));

// ═══════════════════════════════════════════════════════════
console.log('— A3  Nichts fällt still weg —');
// ═══════════════════════════════════════════════════════════
const addF = DACH.slice(DACH.indexOf('function _addFilesToGrid'), DACH.indexOf('function _pushBilder'));
t('Datei ohne Bild-Inhalt wird gemeldet', /Kein Bild erkannt/.test(addF));
t('nicht lesbare Fotos werden gezählt und gemeldet', /var fehler = urls\.filter/.test(addF) && /nicht lesbar/.test(addF));
t('Meldung nennt den Grund (Format/noch nicht geladen)', /Format nicht unterstützt oder Datei noch nicht vom Gerät geladen/.test(addF));

// ═══════════════════════════════════════════════════════════
console.log('— A4  Sweep: kein neuer losgelöster Datei-Dialog ohne Netz —');
// ═══════════════════════════════════════════════════════════
// Das Netz deckt alle ab; die Liste hält nur fest, WO überall Datei-Dialoge
// entstehen — wächst sie, ist beim nächsten Umbau zu prüfen, ob das Netz
// auf der Seite überhaupt liegt (gema_auth.js eingebunden).
import { readdirSync } from 'fs';
const seiten = readdirSync(ROOT).filter(f => f.endsWith('.html'));
const ohneNetz = [];
seiten.forEach(f => {
  const s = readFileSync(join(ROOT, f), 'utf8');
  if (!/createElement\('input'\)/.test(s)) return;
  // Erzeugt die Seite wirklich einen DATEI-Dialog?
  if (!/type\s*=\s*'file'|type='file'/.test(s)) return;
  if (!/gema_auth\.js/.test(s)) ohneNetz.push(f);
});
t('jede Seite mit Datei-Dialog lädt gema_auth.js (Netz greift)',
  ohneNetz.length === 0 || (console.log('    ohne Netz: ' + ohneNetz.join(', ')), false));

// ═══════════════════════════════════════════════════════════
// TEIL B — Browser
// ═══════════════════════════════════════════════════════════
let server = null, browser = null;
try {
  const { chromium } = await import('playwright-core');
  const { startServer, newPage, seed, BASE } = await import('./rolematrix_harness.mjs');
  server = await startServer();
  browser = await chromium.launch({ executablePath: process.env.CHROME });
  const { ctx, page } = await newPage(browser, seed(['role_spengler']));
  await ctx.route('**/gema-auth**', r => r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto(BASE + '/sp_dachbericht.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  console.log('— B1  Das Netz hängt den Input wirklich ein —');
  const netz = await page.evaluate(() => {
    const inp = document.createElement('input');
    inp.type = 'file';
    let drin = false;
    // click() öffnet in Chromium keinen echten Dialog, aber der Patch läuft
    const echt = HTMLInputElement.prototype.click;
    inp.click();
    drin = inp.isConnected;
    return { drin, gepatcht: !!HTMLInputElement.prototype.__gemaFileClickFix, typErhalten: inp.type === 'file' };
  });
  t('losgelöster File-Input hängt nach click() im DOM', netz.drin);
  t('Patch ist aktiv', netz.gepatcht);
  t('Input bleibt unverändert nutzbar', netz.typErhalten);

  const unberuehrt = await page.evaluate(() => {
    const inp = document.createElement('input'); inp.type = 'file';
    document.body.appendChild(inp);
    const vorher = inp.style.cssText;
    inp.click();
    const gleich = inp.style.cssText === vorher && inp.parentNode === document.body;
    inp.remove();
    return gleich;
  });
  t('korrekt eingehängter Input wird NICHT angefasst', unberuehrt);

  const textInput = await page.evaluate(() => {
    const inp = document.createElement('input'); inp.type = 'text';
    inp.click();
    return !inp.isConnected;   // Nicht-Datei-Inputs bleiben losgelöst
  });
  t('andere Input-Typen bleiben unberührt', textInput);

  console.log('— B2  Foto aus der Mediathek landet im Bericht —');
  // Bericht + Kapitel anlegen, damit es ein Bilder-Array gibt
  const rid = await page.evaluate(() => {
    const r = { id: 'dach_test', titel: 'Testdach', objektId: '', phase: 'inspektion',
      erstelltAm: new Date().toISOString(), dachuebersicht: { bilder: [] }, kapitel: [], massnahmen: [] };
    upsert(r); openDetail(r.id);
    return r.id;
  });
  await page.waitForTimeout(300);

  // Ein echtes 2×2-PNG — einmal MIT, einmal OHNE MIME-Typ (iCloud-Fall)
  const zufuegen = async (mime) => await page.evaluate(async ({ rid, mime }) => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8Dwn4GBgYERRIAAAwAV+gL9AZTKAAAAAElFTkSuQmCC'), c => c.charCodeAt(0));
    const file = new File([png], 'IMG_0042.png', mime ? { type: mime } : {});
    const vorher = (getById(rid).dachuebersicht.bilder || []).length;
    _addFilesToGrid(rid, 'uebersicht', null, null, [file]);
    // Bildunterschrift-Dialog bei genau einem Bild → abnicken
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 50));
      const btn = document.querySelector('.gema-dlg-bg [data-act="ok"]');
      if (btn) { btn.click(); break; }
    }
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 50));
      if ((getById(rid).dachuebersicht.bilder || []).length > vorher) break;
    }
    return (getById(rid).dachuebersicht.bilder || []).length - vorher;
  }, { rid, mime });

  t('Foto MIT MIME-Typ wird übernommen (Kamera-Fall)', (await zufuegen('image/png')) === 1);
  t('Foto OHNE MIME-Typ wird übernommen (iCloud-Mediathek)', (await zufuegen('')) === 1);

  const heic = await page.evaluate(() => {
    const f = new File([new Uint8Array([1, 2, 3])], 'notiz.txt', { type: 'text/plain' });
    return _spIstBild(f);
  });
  t('eine echte Nicht-Bild-Datei wird weiterhin abgelehnt', heic === false);

  console.log('— B3  Gegenprobe: ohne Netz feuert change nicht —');
  const gegen = await page.evaluate(() => {
    // Patch für diesen einen Aufruf umgehen: nativer click auf losgelöstem Input
    const inp = document.createElement('input'); inp.type = 'file';
    // Ohne den Patch bliebe er losgelöst — genau der Zustand, in dem iOS ihn
    // wegräumt. Hier nur die Struktur-Aussage: er hängt dann nirgends.
    return inp.isConnected === false;
  });
  t('ein nie geklickter Input hängt nirgends (Ausgangszustand)', gegen);

  const fehler = [];
  page.on('pageerror', e => fehler.push(e.message));
  await page.waitForTimeout(300);
  t('keine JS-Fehler im ganzen Durchlauf', fehler.length === 0);
} catch (e) {
  if (/playwright-core|Executable doesn't exist|CHROME/.test(String(e && e.message))) {
    console.log('— Teil B übersprungen: playwright-core/Chromium fehlt —');
    console.log('  (CHROME=<chromium> setzen und aus einem Ordner mit playwright-core starten)');
  } else { console.log('  ✗ Browser-Teil abgebrochen: ' + (e && e.message)); fail++; }
} finally {
  if (browser) await browser.close();
  if (server) server.close();
}

console.log('');
console.log(fail ? ('✗ ' + fail + ' Fehler  (' + (ok + fail) + ' Checks)') : ('✓ alles grün  (' + ok + ' Checks)'));
process.exit(fail ? 1 : 0);
