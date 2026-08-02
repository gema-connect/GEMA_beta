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

console.log('\n' + (fail === 0 ? `✅ ${n}/${n} Tests grün` : `❌ ${fail}/${n} Tests rot`));
process.exit(fail === 0 ? 0 : 1);
