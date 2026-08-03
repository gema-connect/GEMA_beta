// Drift-Guard der GEMA Card (UMSETZUNG_GEMA_Card.md).
// Prüft die sicherheits- und formatkritischen Teile OHNE Browser/Netz:
//   A  vCard-Erzeugung (Format 3.0, Feld-Whitelist, Faltung, PHOTO, REV, Dateiname)
//   B  Feld-Whitelist der öffentlichen Sicht (sanitizePublic)
//   C  Slug (Format, Nicht-Enumerierbarkeit, Validierung)
//   D  Kein anon/authenticated-Zugriff auf die Karten-Tabellen (SQL)
//   E  Registrierung im System (sw.js, FILE_MAP, MODULES, netlify.toml, Rollen)
//   F  Öffentliche Endpoints tragen den Warn-Kommentar + sind fail-closed
// Aufruf: node scripts/card_test.mjs
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const R = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

let n = 0, fail = 0;
function t(name, cond, extra) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (extra ? '\n      → ' + extra : '')); }
}

// ── Module laden (die Functions brauchen keine Env, solange wir nur die
//    reinen Helfer benutzen; SERVICE_KEY bleibt leer = kein Netz) ──
const C = require('../netlify/functions/_card.js');
const VC = require('../netlify/functions/card-vcard.js');
const V = VC._intern;

/* ══ A — vCard ══════════════════════════════════════════════════════ */
console.log('— A: vCard-Erzeugung —');

const profil = {
  slug: 'aB3dE5gH7k',
  display_name: 'Robin Jäggi',
  first_name: 'Robin', last_name: 'Jäggi',
  company: 'Jäggi Vollmer GmbH', role_title: 'Geschäftsführer',
  phone: '+41 79 000 00 00', phone_office: '+41 61 000 00 00',
  email: 'robin@example.ch', website: 'www.example.ch',
  address: 'Horburgstrasse 96', zip: '4057', city: 'Basel',
  fields_public: { company: true, role_title: true, phone: true, phone_office: true, email: true, website: false, address: false },
  updated_at: '2026-08-02T10:15:00.000Z'
};
const vcf = V.buildVCard(profil, { basis: 'https://gema-connect.ch' });

t('BEGIN/END:VCARD vorhanden', /^BEGIN:VCARD\r\n/.test(vcf) && /END:VCARD\r\n$/.test(vcf));
t('VERSION:3.0 (max. Kompatibilität iOS/Android/Outlook)', vcf.includes('VERSION:3.0'));
t('CRLF als Zeilenende (RFC 2426)', vcf.includes('\r\n') && !/[^\r]\n/.test(vcf));
t('N: Nachname;Vorname;;;', vcf.includes('N:Jäggi;Robin;;;'));
t('FN mit echtem Umlaut (UTF-8, kein ae/oe/ue)', vcf.includes('FN:Robin Jäggi'));
t('ORG gesetzt (company ist öffentlich)', vcf.includes('ORG:Jäggi Vollmer GmbH'));
t('TITLE gesetzt', vcf.includes('TITLE:Geschäftsführer'));
t('TEL;TYPE=CELL', vcf.includes('TEL;TYPE=CELL:+41 79 000 00 00'));
t('TEL;TYPE=WORK', vcf.includes('TEL;TYPE=WORK:+41 61 000 00 00'));
t('EMAIL;TYPE=WORK', vcf.includes('EMAIL;TYPE=WORK:robin@example.ch'));
t('Kartenlink als URL', vcf.includes('URL:https://gema-connect.ch/p/aB3dE5gH7k'));
t('NOTE nennt den permanenten Kartenlink', /NOTE:.*gema-connect\.ch\/p\/aB3dE5gH7k/.test(vcf));
t('REV = updated_at (Adressbuch erkennt neuere Fassung)', vcf.includes('REV:2026-08-02T10:15:00Z'));

// Feld-Whitelist: website/address sind NICHT öffentlich → dürfen fehlen
t('website NICHT in der vCard (fields_public.website=false)', !/URL;TYPE=WORK/.test(vcf) && !vcf.includes('example.ch\r\nURL;'));
t('ADR NICHT in der vCard (fields_public.address=false)', !vcf.includes('ADR'));
t('PLZ/Ort lecken nicht durch', !vcf.includes('4057') && !vcf.includes('Basel'));

// Gegenprobe: freigeschaltet → erscheinen
const offen = JSON.parse(JSON.stringify(profil));
offen.fields_public.website = true; offen.fields_public.address = true;
const vcf2 = V.buildVCard(offen, { basis: 'https://gema-connect.ch' });
t('ADR erscheint, sobald address freigegeben ist', /ADR;TYPE=WORK:;;Horburgstrasse 96;Basel;;4057;/.test(vcf2));
t('URL;TYPE=WORK erscheint, sobald website freigegeben ist', vcf2.includes('URL;TYPE=WORK:www.example.ch'));

// Gegenprobe: alles gesperrt
const zu = JSON.parse(JSON.stringify(profil));
zu.fields_public = { company: false, role_title: false, phone: false, phone_office: false, email: false, website: false, address: false };
const vcf3 = V.buildVCard(zu, { basis: 'https://x.ch' });
t('Alles gesperrt → keine Telefonnummer', !vcf3.includes('TEL'));
t('Alles gesperrt → keine E-Mail', !vcf3.includes('EMAIL'));
t('Alles gesperrt → keine Firma', !vcf3.includes('ORG:'));
t('Alles gesperrt → Name bleibt (Zweck der Karte)', vcf3.includes('FN:Robin Jäggi'));

// Escaping
const esc = V.buildVCard({
  slug: 'aB3dE5gH7k', display_name: 'Muster; Firma, AG\\Test',
  first_name: 'A', last_name: 'B', company: 'X; Y, Z',
  fields_public: { company: true }, updated_at: '2026-01-01T00:00:00Z'
}, { basis: 'https://x.ch' });
t('Semikolon im Wert maskiert (\\;)', esc.includes('FN:Muster\\; Firma\\, AG\\\\Test'));
t('Komma im ORG maskiert (\\,)', esc.includes('ORG:X\\; Y\\, Z'));
const nl = V.buildVCard({ slug: 'aB3dE5gH7k', display_name: 'A', first_name: 'A', last_name: '',
  role_title: 'Zeile1\nZeile2', fields_public: {}, updated_at: '2026-01-01T00:00:00Z' }, {});
t('Zeilenumbruch im Wert wird zu \\n (bricht die vCard nicht)', nl.includes('TITLE:Zeile1\\nZeile2') && !/TITLE:Zeile1\r?\nZeile2/.test(nl));

// Faltung — der kritische Teil für das eingebettete Foto
const b64 = 'A'.repeat(400);
const mitFoto = V.buildVCard(profil, { basis: 'https://x.ch', fotoB64: b64, fotoTyp: 'JPEG' });
t('PHOTO;ENCODING=b;TYPE=JPEG vorhanden', mitFoto.includes('PHOTO;ENCODING=b;TYPE=JPEG:'));
const photoZeilen = mitFoto.split('\r\n').filter(l => l.startsWith('PHOTO') || (l.startsWith(' ') && /^[ A]+$/.test(l)));
t('Base64 ist gefaltet (mehrere Zeilen)', photoZeilen.length > 3, photoZeilen.length + ' Zeilen');
t('Folgezeilen beginnen mit genau einem Leerzeichen',
  mitFoto.split('\r\n').filter(l => l.startsWith(' ')).every(l => !l.startsWith('  ')));
t('Keine Zeile über 75 Oktette',
  mitFoto.split('\r\n').every(l => Buffer.byteLength(l, 'utf8') <= 75),
  'längste: ' + Math.max(...mitFoto.split('\r\n').map(l => Buffer.byteLength(l, 'utf8'))));
// Rückbau: entfalten muss exakt das Original ergeben
const entfaltet = mitFoto.replace(/\r\n /g, '');
t('Entfalten liefert das Base64 unverändert zurück', entfaltet.includes('PHOTO;ENCODING=b;TYPE=JPEG:' + b64));

// UTF-8-Sicherheit der Faltung: ein sehr langer Umlaut-Wert darf kein
// Zeichen mitten im Bytepaar zerreissen.
const lang = V.buildVCard({ slug: 'aB3dE5gH7k', display_name: 'Ä'.repeat(90),
  first_name: '', last_name: 'Ä'.repeat(90), fields_public: {}, updated_at: '2026-01-01T00:00:00Z' }, {});
t('Umlaut-Faltung erzeugt gültiges UTF-8 (kein zerrissenes Zeichen)',
  !lang.includes('�') && Buffer.from(lang, 'utf8').toString('utf8') === lang);
t('Entfalteter Umlaut-Wert ist vollständig', lang.replace(/\r\n /g, '').includes('FN:' + 'Ä'.repeat(90)));

// Dateiname
t('Dateiname transliteriert Umlaute (GEMA-Konvention)', V.dateiname(profil) === 'Robin_Jaeggi.vcf');
t('Dateiname ohne Sonderzeichen', V.dateiname({ display_name: 'Öz/Über\\Mann' }) === 'Oez_Ueber_Mann.vcf');
t('Dateiname-Fallback', V.dateiname({}) === 'Kontakt.vcf');
t('REV ohne Millisekunden', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(V.rev('2026-08-02T10:15:00.123Z')));
t('REV bei kaputtem Datum fällt auf jetzt zurück', /^\d{4}-/.test(V.rev('kein-datum')));

// Kein Cache — die vCard MUSS bei jedem Abruf frisch entstehen
const vsrc = R('netlify/functions/card-vcard.js');
t('vCard-Antwort trägt Cache-Control: no-store', /Cache-Control': 'no-store/.test(vsrc));
t('vCard wird nirgends gespeichert (kein sbInsert/sbUpdate im vCard-Endpoint)',
  !/sbInsert|sbUpdate\(/.test(vsrc.replace(/logEvent[\s\S]{0,200}/g, '')));

/* ══ B — Feld-Whitelist der öffentlichen Sicht ══════════════════════ */
console.log('\n— B: Feld-Whitelist (sanitizePublic) —');

const roh = Object.assign({}, profil, {
  id: 'uuid-1', user_id: 'user_x', claim_token: 'a'.repeat(48),
  created_by: 'user_y', photo_path: 'p/1/foto.jpg', photo_vcard_path: 'p/1/foto_s.jpg',
  field_origin: { company: 'org' }
});
const oeff = C.sanitizePublic(roh);
const j = JSON.stringify(oeff);
t('claim_token verlässt den Server NIE', !j.includes('claim_token') && !j.includes('a'.repeat(48)));
t('user_id nicht in der öffentlichen Sicht', oeff.user_id === undefined);
t('interne id nicht in der öffentlichen Sicht', oeff.id === undefined);
t('created_by nicht in der öffentlichen Sicht', !j.includes('created_by'));
t('Storage-Pfad nicht in der öffentlichen Sicht', !j.includes('photo_path') && !j.includes('foto.jpg'));
t('field_origin nicht in der öffentlichen Sicht', oeff.field_origin === undefined);
t('website (nicht öffentlich) fehlt', oeff.website === undefined);
t('address/zip/city (nicht öffentlich) fehlen', oeff.address === undefined && oeff.zip === undefined && oeff.city === undefined);
t('phone (öffentlich) ist da', oeff.phone === '+41 79 000 00 00');
t('display_name immer da', oeff.display_name === 'Robin Jäggi');
t('hat_foto als Flag statt Pfad', oeff.hat_foto === true);
t('schatten=false bei verknüpftem Konto', oeff.schatten === false);
t('schatten=true ohne user_id', C.sanitizePublic(Object.assign({}, roh, { user_id: null })).schatten === true);

const voll = C.sanitizePublic(roh, { voll: true });
t('Vollsicht (eigene Karte) zeigt auch gesperrte Felder', voll.website === 'www.example.ch' && voll.address === 'Horburgstrasse 96');
t('Vollsicht liefert fields_public für den Editor', !!voll.fields_public && voll.fields_public.website === false);
t('Vollsicht enthält NIE den claim_token', !JSON.stringify(voll).includes('a'.repeat(48)));

t('zip/city folgen dem address-Schalter', C.feldOeffentlich({ fields_public: { address: true } }, 'zip') === true
  && C.feldOeffentlich({ fields_public: { address: false } }, 'city') === false);
t('company_uid folgt dem company-Schalter', C.feldOeffentlich({ fields_public: { company: true } }, 'company_uid') === true);
t('Default konservativ: website/address aus', C.FIELDS_PUBLIC_DEFAULT.website === false && C.FIELDS_PUBLIC_DEFAULT.address === false);
t('Default: fehlendes fields_public → Defaults greifen', C.feldOeffentlich({}, 'phone') === true && C.feldOeffentlich({}, 'address') === false);

/* ══ C — Slug ═══════════════════════════════════════════════════════ */
console.log('\n— C: Slug —');
const slugs = new Set();
let formatOk = true;
for (let i = 0; i < 3000; i++) {
  const s = C.slugNeu(10);
  if (!/^[1-9A-HJ-NP-Za-km-z]{10}$/.test(s)) formatOk = false;
  slugs.add(s);
}
t('Slug ist 10 Zeichen base58 (ohne 0/O/I/l)', formatOk);
t('3000 Slugs ohne Kollision', slugs.size === 3000, slugs.size + ' verschieden');
t('slugOk akzeptiert gültige Slugs', C.slugOk('aB3dE5gH7k') === true);
t('slugOk lehnt verbotene Zeichen ab (0/O/I/l)', !C.slugOk('aB3dE5gH70') && !C.slugOk('IIIIIIIIII'));
t('slugOk lehnt Injection-Versuche ab',
  !C.slugOk("a' or 1=1--") && !C.slugOk('a*') && !C.slugOk('../../etc') && !C.slugOk(''));
t('slugOk lehnt zu lange Werte ab', !C.slugOk('a'.repeat(40)));
t('tokenOk akzeptiert 48-hex', C.tokenOk('a1b2c3'.repeat(8)) === true);
t('tokenOk lehnt Nicht-Hex ab', !C.tokenOk('zzzz') && !C.tokenOk(''));
const tk = new Set(); for (let i = 0; i < 500; i++) tk.add(C.tokenNeu());
t('Claim-Token sind 48 hex und eindeutig', tk.size === 500 && [...tk].every(x => /^[a-f0-9]{48}$/.test(x)));

/* ══ D — SQL: kein anon/authenticated-Zugriff ═══════════════════════ */
console.log('\n— D: Datenbank-Zugriff (fail-closed) —');
const sql = R('supabase/gema_card_v1.sql');
const TAB = ['card_profiles', 'project_participants', 'card_contacts', 'card_reports', 'card_events'];
TAB.forEach(tab => t('RLS aktiv auf ' + tab, new RegExp('alter table public\\.' + tab + '\\s+enable row level security').test(sql)));
t('KEIN grant an anon (sonst wäre die Feld-Whitelist umgehbar)', !/grant\s+[a-z, ]*\s+on\s+public\.card_\w+\s+to\s+[^;]*anon/i.test(sql));
t('KEIN grant an authenticated', !/grant\s+[a-z, ]*\s+on\s+public\.card_\w+\s+to\s+[^;]*authenticated/i.test(sql));
t('revoke-Sicherheitsnetz für anon/authenticated vorhanden', /revoke all on public\.card_profiles\s+from anon, authenticated/.test(sql));
TAB.forEach(tab => t('service_role hat Rechte auf ' + tab, new RegExp('grant all on public\\.' + tab + '\\s+to service_role').test(sql)));
t('Keine Policy angelegt (nur Service-Key kommt heran)', !/create policy/i.test(sql));
t('Dedupe-Index auf lower(email)', /create index[^;]*card_profiles \(lower\(email\)\)/.test(sql));
t('Slug ist unique', /slug\s+text unique not null/.test(sql));
t('photo_vcard_path für die kleine vCard-Fassung vorhanden', /photo_vcard_path/.test(sql));
t('Bucket card-photos ist PRIVAT', /insert into storage\.buckets[\s\S]*?'card-photos'[\s\S]*?false\)/.test(sql));
t('Rollback-Skript vorhanden', fs.existsSync(new URL('../supabase/gema_card_rollback.sql', import.meta.url)));

/* ══ E — Registrierung im System ════════════════════════════════════ */
console.log('\n— E: Registrierung im System —');
const auth = R('gema_auth.js');
t("MODULES enthält 'visitenkarte'", /\{key:'visitenkarte'/.test(auth));
t("MODULES enthält 'kontakte'", /\{key:'kontakte'/.test(auth));
t("FILE_MAP: sys_card_editor → visitenkarte", /'sys_card_editor':'visitenkarte'/.test(auth));
t("FILE_MAP: sys_kontakte → kontakte", /'sys_kontakte':'kontakte'/.test(auth));
t("FILE_MAP: sys_card_reports → visitenkarte", /'sys_card_reports':'visitenkarte'/.test(auth));
t('sys_card.html ist BEWUSST nicht in FILE_MAP (öffentliche Seite)', !/'sys_card':/.test(auth));
t('Rolle role_free definiert', /id:'role_free'/.test(auth));
t('Migration gema_auth_card_free_v1 vorhanden', /gema_auth_card_free_v1/.test(auth));
t('role_free landet auf index.html (kein Workspace-Redirect ins Nichts)',
  /role_free'\)>=0\)return'index\.html'/.test(auth));
t('GemaAuth.isFreeUser exportiert', /isFreeUser:_isFreeUser/.test(auth));

const sw = R('sw.js');
['sys_card.html', 'sys_card_editor.html', 'sys_card_reports.html', 'sys_kontakte.html', 'gema_card.js']
  .forEach(f => t('sw.js cached /' + f, sw.includes("'/" + f + "'")));

const toml = R('netlify.toml');
t('Redirect /p/* → sys_card.html', /from = "\/p\/\*"[\s\S]{0,80}sys_card\.html\?u=:splat/.test(toml));
t('Redirect /v/* → card-vcard', /from = "\/v\/\*"[\s\S]{0,90}card-vcard\?slug=:splat/.test(toml));
t('Redirect /c/* → sys_card.html?claim=', /from = "\/c\/\*"[\s\S]{0,90}sys_card\.html\?claim=:splat/.test(toml));
['card-public', 'card-photo', 'card-claim', 'card-report', 'card-invite', 'card-api']
  .forEach(f => t('API-Redirect /api/' + f, toml.includes('/api/' + f)));

const rec = R('gema_recent.js');
t('gema_recent kennt die Karten-Seiten', /'sys_card_editor':/.test(rec) && /'sys_kontakte':/.test(rec));
t('gema_recent überspringt die öffentliche Kartenseite', /SKIP=\['sys_login','sys_card'\]/.test(rec));

const idx = R('index.html');
t('index.html: Kachel «Meine Karte»', /data-module="visitenkarte"/.test(idx));
t('index.html: Kachel «Kontaktbuch»', /data-module="kontakte"/.test(idx));
t('index.html: Filter-Knopf GEMA Card', /data-filter="card"/.test(idx));
t('index.html: Gratis-Konten sehen gesperrte statt versteckter Kacheln', /_freeUser\)\{ _lockCard\(card\); return; \}/.test(idx));

// Rollen-Golden muss die neuen Keys kennen (sonst failt rolematrix_test)
const golden = require('./rolematrix_golden.json');
t('Golden kennt role_free', !!golden.role_free);
t('Golden: visitenkarte bei allen Rollen', Object.keys(golden).every(r => 'visitenkarte' in golden[r]));
t('Golden: kontakte bei allen Rollen', Object.keys(golden).every(r => 'kontakte' in golden[r]));
t('Golden: role_free ohne Schreibrecht auf objekte (Upsell-Punkt)', golden.role_free.objekte === 'r');
t('Golden: role_free hat KEINE Fachmodule', golden.role_free.druckverlust === '-' && golden.role_free.erp === '-');
t('Golden: Monteur hat eine eigene Karte (persönlich, nicht fachlich)', golden.role_monteur.visitenkarte === 'rw');

/* ══ F — Öffentliche Endpoints ══════════════════════════════════════ */
console.log('\n— F: Öffentliche Endpoints —');
['card-public', 'card-vcard', 'card-photo', 'card-claim', 'card-report'].forEach(f => {
  const s = R('netlify/functions/' + f + '.js');
  t(f + '.js trägt den Warn-Kommentarblock',
    /ÖFFENTLICHER ENDPOINT – KEIN JWT/.test(s) && /Feld-Whitelist zwingend/.test(s));
  t(f + '.js reicht kein `select \\*` durch', !/select=\*/.test(s));
});
['card-api', 'card-invite'].forEach(f => {
  const s = R('netlify/functions/' + f + '.js');
  t(f + '.js ist JWT-gated (requireAuth)', /requireAuth\(event\)/.test(s) && /Nicht angemeldet/.test(s));
});
const capi = R('netlify/functions/card-api.js');
t('card-api liest den User aus der DB, nicht aus dem Token-Payload', /gemaUser\(claims\.uid\)/.test(capi));
t('card-api: fremde Karten nur durch sanitizePublic (ohne voll)', /sanitizePublic\(p\)/.test(capi));
const cinv = R('netlify/functions/card-invite.js');
t('card-invite sperrt Gratis-Konten aus (Konzept §2.3)', /Gratis-Konto lassen sich keine Beteiligten/.test(cinv));
t('card-invite dedupliziert über die Mail', /profilByMail\(email\)/.test(cinv));
const ccl = R('netlify/functions/card-claim.js');
t('card-claim: bestehendes Konto wird NICHT übernommen', /anmelden: true/.test(ccl) && /bereits ein GEMA-Konto/.test(ccl));
t('card-claim: Registrierung hinter eigenem Schalter (Pilot-Sperre)', /GEMA_CARD_REGISTRATION_OPEN/.test(ccl));
t('card-claim: Passwort mind. 8 Zeichen', /password\.length < 8/.test(ccl));
t('card-claim: Merge führt Doppel-Profile zusammen', /claimMerge/.test(ccl));
const crep = R('netlify/functions/card-report.js');
t('card-report ändert NIE Daten (nur Insert in card_reports)', !/sbUpdate\('card_profiles/.test(crep));
t('card-report ist ratenbegrenzt (5/h, persistent)', /dbLimit\('report'/.test(crep));

// Meldegründe müssen zwischen Function und Oberfläche übereinstimmen
const gr = require('../netlify/functions/card-report.js')._intern.GRUENDE;
const cardHtml = R('sys_card.html');
t('sys_card.html kennt genau dieselben Meldegründe',
  gr.every(g => cardHtml.includes("'" + g + "'")), gr.join(', '));
const repHtml = R('sys_card_reports.html');
t('sys_card_reports.html kennt genau dieselben Meldegründe', gr.every(g => repHtml.includes(g + ':')));

// Die öffentliche Seite darf gema_auth.js NICHT einbinden (würde jeden
// Besucher ohne Session auf die Login-Seite werfen).
t('sys_card.html bindet gema_auth.js NICHT ein', !/<script src="gema_auth\.js"/.test(cardHtml));
t('sys_card.html bindet gema_sync.js NICHT ein', !/<script src="gema_sync\.js"/.test(cardHtml));
t('sys_card.html erkennt die Session passiv aus dem localStorage', /gema_session_v1/.test(cardHtml));

/* ══ G — QR (ein Modus) ═════════════════════════════════════════════ */
console.log('\n— G: QR —');

// gema_card.js ist ein Browser-IIFE — ein Mini-window genügt, weil die
// geprüften Funktionen weder DOM noch Netz anfassen.
const winStub = { location: { origin: 'https://gema.ch' } };
new Function('window', R('gema_card.js') + '\nreturn window;')(winStub);
const GC = winStub.GemaCard;
const gcSrc = R('gema_card.js');

t('gema_card.js exportiert kartenUrl + Scan-Parser',
  GC && typeof GC.kartenUrl === 'function' && typeof GC.slugAusScan === 'function');
t('Im QR steht nur die Kartenadresse',
  GC.kartenUrl('Ab3xK9mZq7') === 'https://gema.ch/p/Ab3xK9mZq7');

// Entscheid 08/2026: der «Kontakt-QR» (vCard im Code) ist bewusst NICHT
// gebaut. Er wäre ein Schnappschuss und für die Statistik unsichtbar.
t('kein zweiter QR-Modus mehr im Client',
  !/qrPayload|vcardMinimal|qrStufe/.test(gcSrc) && !/modus/.test(gcSrc));
t('der Entscheid ist im Code begründet, nicht nur entfernt',
  /Kontakt-QR/.test(gcSrc) && /Entscheid 08\/2026/.test(gcSrc));
t('QR rechnet immer mit Fehlerkorrektur H',
  (gcSrc.match(/CorrectLevel\.H/g) || []).length === 2 && !/CorrectLevel\.M/.test(gcSrc));
t('die GEMA-Marke sitzt in der QR-Mitte (§5.1)',
  /opts\.logo !== false\) _logoOverlay/.test(gcSrc));

const edHtml = R('sys_card_editor.html');
t('Editor hat keinen Modus-Umschalter mehr',
  !/data-modus|qrSeg|qrModus|QR_MODUS_KEY/.test(edHtml));
t('Editor hat die «Scan mich»-Vollbildansicht (§5.1)',
  /id="scanFs"/.test(edHtml) && /btnScanMich/.test(edHtml));

// Der Scan-Parser bleibt tolerant: er findet die Adresse auch, wenn sie in
// etwas anderem steckt (fremde vCard, kopierte Signatur, NFC-Tag).
t('slugAusScan liest die Kartenadresse', GC.slugAusScan('https://gema.ch/p/Ab3xK9mZq7') === 'Ab3xK9mZq7');
t('slugAusScan findet die Adresse auch eingebettet',
  GC.slugAusScan('BEGIN:VCARD\r\nURL:https://gema.ch/p/Ab3xK9mZq7\r\nEND:VCARD') === 'Ab3xK9mZq7');
t('slugAusScan weist Fremdcodes ab', GC.slugAusScan('https://example.com/x') === ''
  && GC.slugAusScan('') === '' && GC.slugAusScan(null) === '');
t('pm_objekte nutzt den geteilten Scan-Parser', /GemaCard\.slugAusScan\(text\)/.test(R('pm_objekte.html')));
t('sys_kontakte nutzt den geteilten Scan-Parser', /GemaCard\.slugAusScan\(text\)/.test(R('sys_kontakte.html')));

/* ══ H — Funnel / KPI (Konzept §9) ══════════════════════════════════ */
console.log('\n— H: Funnel —');
const FN = require('../netlify/functions/card-api.js')._intern.FUNNEL;
const ccard = R('netlify/functions/_card.js');
t('Funnel hat genau die fünf Stufen des Konzepts',
  FN.map(s => s.id).join('>') === 'scan>vcard>claim_start>claim_done>join_project',
  FN.map(s => s.id).join('>'));
// Zwei Wege führen zu «Karte geöffnet»: die öffentliche Seite (view, vom
// Server geloggt) und der In-App-Scanner, der die Seite gar nicht lädt
// (scan, aus card-api). Getrennt gezählt wäre jede Quote darunter falsch —
// ohne den Scan-Weg könnten die späteren Stufen sogar über 100 % steigen.
t('Stufe 1 fasst view und scan zusammen',
  FN[0].events.includes('view') && FN[0].events.includes('scan'));
t('der In-App-Scanner meldet Stufe 1 mit', /async function scanGemeldet/.test(capi)
  && (capi.match(/await scanGemeldet\(body, p, user\);/g) || []).length === 2);
t('pm_objekte meldet den Scan', /viaScan:!!viaScan/.test(R('pm_objekte.html')));
t('sys_kontakte meldet den Scan', /viaScan:true/.test(R('sys_kontakte.html')));
t('Stufe 2 fasst vcard-Download und Client-Meldung zusammen',
  FN[1].events.includes('vcard') && FN[1].events.includes('contact_saved'));
t('Jede Funnel-Stufe hat ein Label für die Oberfläche', FN.every(s => s.label && s.label.length > 3));
t('card-api: funnel ist eine eigene Aktion', /^A\.funnel = /m.test(capi));
t('card-api: Systemzahlen nur für role_admin',
  /roleIds\.indexOf\('role_admin'\) >= 0/.test(capi) && /const system = admin \? await zaehle/.test(capi));
t('card-api: die eigene Auswertung ist auf den eigenen Slug gefiltert',
  /profile_slug=eq\.' \+ C\.q\(p\.slug\)/.test(capi));
// PostgREST liefert hoechstens db-max-rows (1000) Zeilen aus — wer die
// Zeilen laedt und `.length` zaehlt, bekommt ab 1001 stillschweigend eine
// falsche Zahl. Der Funnel MUSS ueber den Count-Header gehen.
t('card-api zählt über den Count-Header, nicht über geladene Zeilen',
  /C\.sbCount\('card_events'/.test(capi) && !/sbSelect\('card_events'/.test(capi));
t('_card.sbCount liest die echte Gesamtzahl aus Content-Range',
  /Prefer': 'count=exact'/.test(ccard) && /content-range/.test(ccard));
t('_card.sbCount liefert null statt einer falschen 0', /return m \? parseInt\(m\[1\], 10\) : null;/.test(ccard));
// Ohne Whitelist könnte jeder beliebige Event-Namen einkippen und die
// Auswertung damit wertlos machen. Stufe 1 ist von aussen gar nicht
// meldbar — sie kommt ausschliesslich vom Server.
t('card-report nimmt nur bekannte Funnel-Events an',
  /EVENTS_OEFFENTLICH\.indexOf\(String\(body\.event\)\) < 0/.test(crep));
t('Stufe 1 ist von aussen nicht aufblasbar',
  /const EVENTS_OEFFENTLICH = \['contact_saved'\];/.test(crep));
t('sys_card.html meldet «Kontakt gespeichert»', /event:'contact_saved'/.test(cardHtml));
t('Editor zeigt den Trichter', /GemaCard\.api\('funnel'/.test(edHtml) && /id="funBox"/.test(edHtml));

/* ══ I — Darstellung & ehrliche Fehler ══════════════════════════════ */
console.log('\n— I: Darstellung & Fehlermeldungen —');

// Ohne gema_responsive.css faellt das Mobile-Menue (.gema-menu-panel liegt
// dort) in den Textfluss — die Seite sah auf dem iPhone zerlegt aus.
const CARD_SEITEN = ['sys_card.html', 'sys_card_editor.html', 'sys_kontakte.html', 'sys_card_reports.html'];
CARD_SEITEN.forEach(function (f) {
  const h = R(f);
  t(f + ' bindet gema_responsive.css ein', /<link rel="stylesheet" href="gema_responsive\.css"\/>/.test(h));
  t(f + ' laedt es NACH dem eigenen <style> (Kaskade)',
    h.lastIndexOf('</style>') < h.indexOf('gema_responsive.css'));
  t(f + ' bindet es im <head> ein', h.indexOf('gema_responsive.css') < h.indexOf('</head>'));
});
t('gema_responsive.css enthaelt die Mobile-Menue-Stile',
  /\.gema-menu-panel\s*\{/.test(R('gema_responsive.css')));

// Der Server hat geantwortet → nie die Verbindung beschuldigen.
const cardjs = R('netlify/functions/_card.js');
t('_card erkennt eine fehlende Tabelle', /function istFehlendeTabelle/.test(cardjs)
  && /PGRST205/.test(cardjs) && /42P01/.test(cardjs));
t('_card erkennt einen fehlenden Bucket', /function istFehlenderBucket/.test(cardjs));
t('sb\(\) haengt Status und Rohtext an den Fehler', /err\.status = res\.status; err\.body = t;/.test(cardjs));
t('fehlerAntwort nennt die noetige Migration',
  /gema_card_v1\.sql/.test(cardjs) && /setup: true/.test(cardjs));

['card-api', 'card-claim', 'card-invite', 'card-public', 'card-report', 'card-vcard'].forEach(function (fn) {
  t(fn + ' meldet den echten Grund statt «Aktion fehlgeschlagen»',
    /C\.fehlerAntwort\(/.test(R('netlify/functions/' + fn + '.js')));
});

const ed = R('sys_card_editor.html');
t('Editor unterscheidet Server-Antwort von Netzfehler',
  /ladeFehler\(r\.data\)/.test(ed) && /ladeFehler\(null\)/.test(ed));
t('Editor zeigt die Einrichtungs-Anleitung bei setup:true', /d&&d\.setup/.test(ed));
// Vorher hiess es pauschal «Internetverbindung pruefen» — auch wenn der
// Server geantwortet und einen Grund geliefert hatte.
t('Editor beschuldigt die Verbindung nur ohne Server-Antwort',
  ed.split('Internetverbindung').length - 1 === 1);
['sys_kontakte.html', 'sys_card_reports.html'].forEach(function (f) {
  const h = R(f);
  t(f + ' prueft den Status, statt eine leere Liste zu zeigen', /r\.status!==200\|\|!r\.data/.test(h));
  t(f + ' hat den Einrichtungs-Hinweis', /d&&d\.setup/.test(h));
});
t('sys_card.html benennt fehlende Einrichtung eigens', /r\.data&&r\.data\.setup/.test(R('sys_card.html')));

// QR in den Einstellungen — zwischen Avatar und App-Installation.
const pro = R('sys_profil.html');
t('sys_profil bindet gema_card.js ein', /<script src="gema_card\.js"><\/script>/.test(pro));
t('sys_profil hat die Karten-Sektion', /id="cardQrCard"/.test(pro) && /renderCardQr\(\)/.test(pro));
t('QR-Sektion steht zwischen Avatar und App-Installation',
  pro.indexOf('id="avatarFile"') < pro.indexOf('id="cardQrCard"')
  && pro.indexOf('id="cardQrCard"') < pro.indexOf('id="pwaInstallBtn"'));
t('QR-Sektion nur mit Karten-Recht', /can\('read','visitenkarte'\)/.test(pro));
t('Einstellungen legen ungefragt KEINE Karte an', /'me', \{anlegen:false\}/.test(pro));
t('QR laesst sich gross zeigen', /function cardQrGross/.test(pro));
t('sys_profil escapt vollstaendig (&<>"\')',
  /replace\(\/>\/g,'&gt;'\).*replace\(\/"\/g,'&quot;'\).*replace\(\/'\/g,'&#039;'\)/s.test(pro));

/* ══ J — Kurz-URLs: der Slug MUSS aus dem Pfad kommen ═══════════════ */
console.log('\n— J: Kurz-URLs /p/ /c/ /v/ —');

// Der erste echte QR-Scan lief in «Link unvollstaendig»: /p/<slug> ist ein
// Netlify-Rewrite mit status=200, der Browser behaelt die URL /p/<slug> und
// die Query aus dem `to` (?u=:splat) erreicht den Client NIE.
t('/p/ und /c/ sind status-200-Rewrites (URL bleibt stehen)',
  /from = "\/p\/\*"[\s\S]{0,120}status = 200/.test(toml)
  && /from = "\/c\/\*"[\s\S]{0,120}status = 200/.test(toml));
t('sys_card.html liest den Slug aus dem Pfad', /\^\\\/p\\\/\(\[\^\\\/\?#\]\+\)/.test(cardHtml));
t('sys_card.html liest den Claim-Token aus dem Pfad', /\^\\\/c\\\/\(\[\^\\\/\?#\]\+\)/.test(cardHtml));
t('Der Query-Weg bleibt zusaetzlich gueltig', /P\.get\('u'\)\|\|P\.get\('slug'\)/.test(cardHtml));

// Verhalten nachrechnen — mit derselben Logik wie in der Seite.
(function () {
  const m = /var P=new URLSearchParams\(location\.search\);([\s\S]*?)var \$=function/.exec(cardHtml);
  t('Parse-Block in sys_card.html gefunden', !!m);
  if (!m) return;
  const fn = new Function('location', 'URLSearchParams',
    'var P=new URLSearchParams(location.search);' + m[1] + 'return {slug:slug,claim:claim};');
  const parse = (pathname, search) => fn({ pathname, search }, URLSearchParams);
  t('/p/<slug> liefert den Slug', parse('/p/7Xk2mQpL9a', '').slug === '7Xk2mQpL9a');
  t('/c/<token> liefert den Token', parse('/c/abc123def456', '').claim === 'abc123def456');
  t('sys_card.html?u=… funktioniert weiterhin',
    parse('/sys_card.html', '?u=7Xk2mQpL9a').slug === '7Xk2mQpL9a');
  t('Query gewinnt vor dem Pfad', parse('/p/ausPfad', '?u=ausQuery').slug === 'ausQuery');
  t('/p/ ohne Slug bleibt leer (echter Fehlerfall)', parse('/p/', '').slug === '');
})();

// Die vCard muss bei JEDEM Abruf frisch sein (Konzept §5) — /v/ traegt keine
// Endung und fiel sonst in den Cache-First-Zweig des Service-Workers.
t('SW haelt die vCard vom Cache fern',
  sw.includes('if (/^\\/v\\/[^/]+$/.test(cardPfad)) { event.respondWith(fetch(event.request)); return; }'));
t('SW behandelt /p/ und /c/ als Network-First',
  sw.includes('/^\\/(p|c)\\/[^/]+$/.test(cardPfad)'));
t('SW prueft nur same-origin (CDN-Pfade mit /p/ fallen nicht hinein)',
  sw.includes('u.origin === self.location.origin'));
t('SW cacht keine POSTs der Karten-API', sw.includes("event.request.method === 'GET'"));

/* ══ K — Kartenkopf: Firmenfarben + nicht abgeschnittenes Foto ══════ */
console.log('\n— K: Kartenkopf (Foto, Firmenfarben) —');

// Der Avatar ragt mit bottom:-44px bewusst aus dem Kopf; ein overflow:hidden
// auf .chd schnitt ihn unten ab (Praxisbefund am ersten echten Scan).
const chd = /\.chd\{[\s\S]*?\}/.exec(cardHtml);
t('.chd-Regel gefunden', !!chd);
t('.chd schneidet den Avatar NICHT mehr ab (kein overflow:hidden)',
  !!chd && !/overflow\s*:\s*hidden/.test(chd[0]));
t('Der Kopf-Verlauf ist ueber Variablen steuerbar',
  !!chd && /--hd1:/.test(chd[0]) && /var\(--hd1\)/.test(chd[0]));
t('Ohne Firmenfarbe bleiben die GEMA-Toene', !!chd && /--hd1:#0f172a/.test(chd[0]));
t('Auch die Deko-Ecke folgt der Marke', /radial-gradient\([^)]*var\(--hd3\)/.test(cardHtml));
t('sys_card.html faerbt den Kopf aus karte.brand',
  /function brandAnwenden/.test(cardHtml) && /brandAnwenden\(k\.brand\)/.test(cardHtml));

// Weisse Schrift auf dem Kopf → die Firmenfarbe muss abgedunkelt werden.
(function () {
  const m = /function hexRgb\(h\)\{[\s\S]*?function dunkelFuerWeiss\(hex,ziel\)\{[\s\S]*?\n  \}/.exec(cardHtml);
  t('Kontrast-Helfer in sys_card.html gefunden', !!m);
  if (!m) return;
  const H = new Function(m[0] + '; return {dunkelFuerWeiss:dunkelFuerWeiss,hexRgb:hexRgb,kontrastWeiss:kontrastWeiss};')();
  const pruef = (hex) => {
    const d = H.dunkelFuerWeiss(hex, 5.5);
    return d && H.kontrastWeiss(H.hexRgb(d)) >= 5.5;
  };
  t('Knallgelb wird lesbar abgedunkelt', pruef('#f5c518'));
  t('Reines Gelb wird lesbar abgedunkelt', pruef('#ffff00'));
  t('Weiss als Firmenfarbe bleibt lesbar', pruef('#ffffff'));
  t('Eine bereits dunkle Farbe bleibt unveraendert',
    H.dunkelFuerWeiss('#1e3a5f', 5.5) === '#1e3a5f');
  t('Unsinn ergibt keine Farbe (Kopf bleibt GEMA)',
    H.dunkelFuerWeiss('nope', 5.5) === null);
})();

// Der Server liefert NUR zwei geprüfte Hex-Werte — nie ein Settings-Objekt.
t('brand ist eine Spalte von card_profiles', /brand\s+jsonb/.test(sql));
t('brand wird auch in bestehenden Installationen nachgezogen',
  /alter table public\.card_profiles add column if not exists brand jsonb;/.test(sql));
t('brand wird mitgelesen', /field_origin,brand,/.test(ccard));
t('brand steht in der oeffentlichen Sicht', /brand: markeOeffentlich\(p\.brand\)/.test(ccard));
t('Nur echte Hex-Werte gehen raus', C.markeOeffentlich({ primary: '#1e3a5f' }).primary === '#1e3a5f');
t('Sekundaerfarbe optional', !('secondary' in C.markeOeffentlich({ primary: '#1e3a5f' })));
t('Kein CSS-Einschleusen ueber die Farbe',
  C.markeOeffentlich({ primary: 'red;background:url(x)' }) === null
  && C.markeOeffentlich({ primary: '#fff' }) === null
  && C.markeOeffentlich({ primary: '#1e3a5f', secondary: 'javascript:alert(1)' }).secondary === undefined);
t('Kein Durchreichen fremder Settings-Felder',
  JSON.stringify(C.markeOeffentlich({ primary: '#1e3a5f', geheim: 'x' })) === '{"primary":"#1e3a5f"}');
t('Ohne Firmenfarbe kommt null', C.markeOeffentlich(null) === null && C.markeOeffentlich({}) === null);
t('Die Farbe kommt aus org.settings.pdfFarben', /settings && org\.settings\.pdfFarben/.test(capi));
t('Farbwechsel der Firma greift beim Oeffnen des Editors', /const marke = await orgMarke\(user\)/.test(capi));
t('Beim Firmenaustritt wird die Farbe geleert', /if \(p\.brand\) patch\.brand = null;/.test(capi));

/* ══ L — vCard: «Kontakt speichern» ═════════════════════════════════ */
console.log('\n— L: vCard-Abruf —');

// /v/<slug>.vcf ist derselbe Rewrite-Fall wie /p/ — das ?slug=:splat kam
// nicht an, die Function sah einen leeren Slug: «Ungültiger Link».
t('card-vcard liest den Slug pfad-tolerant', /C\.slugAusEvent\(event, 'v'\)/.test(R('netlify/functions/card-vcard.js')));
t('Query hat weiterhin Vorrang',
  C.slugAusEvent({ queryStringParameters: { slug: 'ausQuery' }, path: '/v/ausPfad.vcf' }, 'v') === 'ausQuery');
t('Ohne Query kommt der Slug aus event.path',
  C.slugAusEvent({ path: '/v/7Xk2mQpL9a.vcf' }, 'v') === '7Xk2mQpL9a.vcf');
t('Ohne Query und ohne path hilft rawUrl',
  C.slugAusEvent({ rawUrl: 'https://gema.ch/v/7Xk2mQpL9a.vcf' }, 'v') === '7Xk2mQpL9a.vcf');
t('.vcf wird abgeschnitten und der Slug ist gueltig',
  C.slugOk(C.slugAusEvent({ path: '/v/7Xk2mQpL9a.vcf' }, 'v').replace(/\.vcf$/i, '')));
t('Leerer Aufruf bleibt ungueltig (echter Fehlerfall)',
  C.slugAusEvent({ path: '/v/' }, 'v') === '' && !C.slugOk(''));
// «UngÃ¼ltiger Link» im Screenshot: die JSON-Antwort trug kein charset.
// Der Code fragt jetzt die Spalte «brand» ab. Laeuft die Migration noch
// nicht, muss die Meldung sagen, was zu tun ist — statt «Aktion fehlgeschlagen».
t('Eine fehlende Spalte wird als Einrichtungsfall erkannt',
  C.istFehlendeSpalte({ body: '{"code":"42703","message":"column card_profiles.brand does not exist"}' })
  && C.istFehlendeSpalte({ body: 'PGRST204' }));
t('Eine fehlende Spalte ist KEINE fehlende Tabelle',
  !C.istFehlendeTabelle({ body: 'column card_profiles.brand does not exist' }));
(function () {
  const a = C.fehlerAntwort({ body: '42703 column card_profiles.brand does not exist' }, 'test');
  const d = JSON.parse(a.body);
  t('Sie nennt die Migrationsdatei', a.statusCode === 503 && d.setup === true
    && /gema_card_v1\.sql/.test(d.detail));
})();
t('JSON-Antworten deklarieren UTF-8 (keine Mojibake)',
  /'Content-Type': 'application\/json; charset=utf-8'/.test(ccard));
t('Umlaut ueberlebt die Antwort',
  Buffer.from(JSON.parse(C.resp(400, { error: 'Ungültiger Link' }).body).error, 'utf8').toString('utf8') === 'Ungültiger Link');

/* ══ M — Foto im gespeicherten Kontakt ══════════════════════════════ */
console.log('\n— M: Foto in der vCard —');

// Bugreport 03.08.2026: «Bild der Kontaktkarte wird nicht im Kontakt
// mitgeneriert.» Ursache war die Kombination aus EINEM Versuch (nur
// photo_vcard_path, kein Rueckfall) und einer 40-KB-Grenze, die das
// 512-px-Anzeigebild regelmaessig riss. Beides ist unsichtbar gescheitert.
const mkBuf = (kb) => ({ buf: Buffer.alloc(kb * 1024, 0xAB), type: 'image/jpeg' });
const profFoto = { photo_vcard_path: 'p/1/foto_s.jpg', photo_path: 'p/1/foto.jpg' };

t('Limit deckt das 512-px-Anzeigebild ab (40 KB war zu knapp)',
  V.FOTO_MAX_BYTES >= 128 * 1024, V.FOTO_MAX_BYTES + ' Bytes');

await (async function () {
  // Normalfall: die kleine Fassung gewinnt (kleinste vCard, beste Kompatibilität)
  const a = await V.fotoLaden(profFoto, async (pf) => mkBuf(pf.includes('_s') ? 14 : 70));
  t('Normalfall: die kleine Fassung wird eingebettet', !!a && a.pfad === 'p/1/foto_s.jpg');

  // Die kleine Fassung fehlt im Bucket → Anzeigebild statt gar nichts
  const b = await V.fotoLaden(profFoto, async (pf) => (pf.includes('_s') ? null : mkBuf(70)));
  t('Kleine Fassung fehlt → Rückfall auf das Anzeigebild', !!b && b.pfad === 'p/1/foto.jpg');

  // Der Abruf wirft (Netz/Storage kurz weg) → ebenfalls Rückfall
  const c = await V.fotoLaden(profFoto, async (pf) => {
    if (pf.includes('_s')) throw new Error('Storage 500');
    return mkBuf(70);
  });
  t('Fehler beim Laden → Rückfall statt Aufgabe', !!c && c.pfad === 'p/1/foto.jpg');

  // Kleine Fassung ist in Wahrheit das grosse Bild (klein-Upload fiel auf
  // gross zurück) → 70 KB müssen durchgehen, früher flog es raus
  const d = await V.fotoLaden(profFoto, async () => mkBuf(70));
  t('70 KB werden eingebettet (früher stillschweigend verworfen)', !!d);

  // Absurd grosses Bild auf beiden Pfaden → bewusst kein Foto
  const e = await V.fotoLaden(profFoto, async () => mkBuf(900));
  t('Absurd grosses Bild wird weiterhin abgewiesen', e === null);

  // Kein Bild hinterlegt → null, ohne Storage-Abruf
  let abrufe = 0;
  const f = await V.fotoLaden({}, async () => { abrufe++; return mkBuf(10); });
  t('Ohne hinterlegtes Bild kein Storage-Abruf', f === null && abrufe === 0);

  // Beide Spalten zeigen auf dieselbe Datei → nur EIN Abruf
  abrufe = 0;
  await V.fotoLaden({ photo_path: 'p/1/foto.jpg', photo_vcard_path: 'p/1/foto.jpg' },
    async () => { abrufe++; return null; });
  t('Identische Pfade werden nur einmal abgerufen', abrufe === 1, abrufe + ' Abrufe');

  // Das geladene Foto landet auch wirklich in der Karte
  const g = await V.fotoLaden(profFoto, async () => mkBuf(2));
  const vcfF = V.buildVCard(profil, { basis: 'https://x.ch', fotoB64: g.b64, fotoTyp: g.typ });
  t('PHOTO landet in der erzeugten vCard',
    vcfF.includes('PHOTO;ENCODING=b;TYPE=JPEG:')
    && vcfF.replace(/\r\n /g, '').includes(g.b64));
})();

// Die Kartenseite darf aus demselben Grund nicht bildlos bleiben
const cphoto = R('netlify/functions/card-photo.js');
t('card-photo probiert beide Fassungen', /for \(const pfad of reihe\)/.test(cphoto));

// Storage prüft den Authorization-Header — ein blosser apikey genügt ihm
// nicht. Mit einem neuen sb_secret_-Key (kein JWT) setzte sbHeaders() kein
// Bearer: Storage hätte 401 geantwortet und JEDES Bild wäre lautlos weg.
t('Storage-Aufrufe senden IMMER Bearer (auch für sb_secret_-Keys)',
  /'Authorization': 'Bearer ' \+ SERVICE_KEY/.test(ccard.split('storageHeaders')[1] || ''));
t('Storage nutzt eigene Header, nicht die PostgREST-Header',
  /function storageGet[\s\S]{0,200}storageHeaders\(\)/.test(ccard)
  && !/function storageGet[\s\S]{0,200}sbHeaders\(\)/.test(ccard));
t('Ein fehlgeschlagener Storage-Abruf wird protokolliert',
  /\[card storage\] GET/.test(ccard));

console.log('\n' + (fail === 0 ? `✅ ${n}/${n} Tests grün` : `❌ ${fail}/${n} Tests rot`));
process.exit(fail === 0 ? 0 : 1);
