// Node-Test der Netlify-Function goodel-share.js (gemockter Supabase-fetch)
// Aufruf: node scripts/goodel_share_test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

process.env.SUPABASE_SERVICE_KEY = 'eyJtest_service_key';
process.env.SUPABASE_URL = 'https://mock.supabase.local';

let n = 0, fail = 0;
function t(name, cond, extra) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ ' + name + (extra != null ? ' — ' + String(extra).slice(0, 240) : '')); }
}

const TOKEN = 'a'.repeat(48);
function basePoll(over) {
  return Object.assign({
    id: 'pl1', orgId: 'org_geheim', title: 'Kick-off', desc: 'D', ort: 'Basel',
    created: '2026-07-08T09:00:00Z',
    erstelltVon: { userId: 'u_p', name: 'Robin Jäggi' },
    eingeladen: ['u_m'],
    freigabe: { token: TOKEN, aktiv: true, erstelltAm: '2026-07-10' },
    options: [{ date: '2026-07-20', time: '08:00' }, { date: '2026-07-21', time: '' }, { date: '2026-07-23', time: '10:00' }],
    participants: [{ id: 'pt1', name: 'Robin Jäggi', userId: 'u_p', votes: ['ja', null, 'maybe'] }]
  }, over || {});
}

// fetch-Mock: GET auf gema_data mit Token-Filter → aktuelle rows; POST → capture
let state = { poll: basePoll(), upserts: [] };
global.fetch = async (url, opts) => {
  const u = String(url); const method = (opts && opts.method) || 'GET';
  const ok = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  if (method === 'GET' && u.includes('module_key=eq.goodel')) {
    const m = u.match(/freigabe->>token=eq\.([a-f0-9]+)/);
    const tok = m ? decodeURIComponent(m[1]) : '';
    const p = state.poll;
    const hit = p && p.freigabe && p.freigabe.token === tok;
    return ok(hit ? [{ data_key: 'goodel:' + p.id, payload: { data: JSON.parse(JSON.stringify(p)) } }] : []);
  }
  if (method === 'POST' && u.includes('on_conflict')) {
    const rows = JSON.parse(opts.body);
    state.upserts.push(...rows);
    rows.forEach(r => { if (r.module_key === 'goodel') state.poll = r.payload.data; });
    return ok([]);
  }
  return ok([]);
};

const { handler } = require('../netlify/functions/goodel-share.js');
const GET = tkn => handler({ httpMethod: 'GET', queryStringParameters: { t: tkn } });
const POST = body => handler({ httpMethod: 'POST', body: JSON.stringify(body) });
const J = r => JSON.parse(r.body);

console.log('— GET —');
{
  let r = await GET('zzz');
  t('Ungültiges Token-Format → 400', r.statusCode === 400, r.statusCode);
  r = await GET('b'.repeat(48));
  t('Unbekanntes Token → 404', r.statusCode === 404, r.statusCode);
  state.poll = basePoll({ freigabe: { token: TOKEN, aktiv: false } });
  r = await GET(TOKEN);
  t('Deaktivierte Freigabe → 404', r.statusCode === 404, r.statusCode);
  state.poll = basePoll();
  r = await GET(TOKEN);
  const d = J(r);
  t('Aktive Freigabe → 200', r.statusCode === 200, r.body);
  const raw = JSON.stringify(d);
  t('Sanitisiert: keine orgId', !raw.includes('org_geheim'));
  t('Sanitisiert: kein Token', !raw.includes(TOKEN));
  t('Sanitisiert: keine Einladungsliste/userIds/Secrets', !raw.includes('eingeladen') && !raw.includes('u_p') && !raw.includes('extSecret'), raw.slice(0, 200));
  t('Ersteller-Name bleibt', d.umfrage.erstelltVonName === 'Robin Jäggi');
  t('Optionen + Teilnehmer da', d.umfrage.options.length === 3 && d.umfrage.participants.length === 1);
}

console.log('— POST: neue externe Antwort —');
{
  state = { poll: basePoll(), upserts: [] };
  const r = await POST({ token: TOKEN, name: 'Hans Extern', votes: ['ja', 'quatsch', 'maybe', 'ja', 'ja'] });
  const d = J(r);
  t('Neue Antwort → 200 mit partId+secret', r.statusCode === 200 && d.ok && d.partId && /^[a-f0-9]{32}$/.test(d.secret || ''), r.body);
  const saved = state.poll.participants.find(p => p.id === d.partId);
  t('Teilnehmer gespeichert mit extern:true + Secret', !!saved && saved.extern === true && saved.extSecret === d.secret);
  t('Votes normalisiert (ungültig→null, Länge=Optionen)', JSON.stringify(saved.votes) === JSON.stringify(['ja', null, 'maybe']), JSON.stringify(saved.votes));
  const notif = state.upserts.find(u => u.module_key === 'notify');
  t('Notifikation an Ersteller geschrieben', !!notif && notif.payload.data.empfaengerUserId === 'u_p' && notif.payload.data.eventKey === 'goodel_abgestimmt', JSON.stringify(notif || {}).slice(0, 160));
  t('Notif-Link mit Deep-Link', notif.payload.data.link === 'pm_goodel.html?poll=pl1');

  const r2 = await POST({ token: TOKEN, name: 'hans extern', votes: ['ja'] });
  t('Duplikat-Name (case-insensitive) → 409', r2.statusCode === 409, r2.statusCode);
}

console.log('— POST: eigene Antwort bearbeiten —');
{
  state = { poll: basePoll(), upserts: [] };
  const r1 = await POST({ token: TOKEN, name: 'Hans Extern', votes: ['ja', null, null] });
  const { partId, secret } = J(r1);
  state.upserts = [];
  const r2 = await POST({ token: TOKEN, name: 'Hans E.', votes: ['nein', 'ja', null], partId, secret });
  const d2 = J(r2);
  t('Edit mit korrektem Secret → 200 ohne neues Secret', r2.statusCode === 200 && d2.ok && !d2.secret, r2.body);
  const saved = state.poll.participants.find(p => p.id === partId);
  t('Name + Stimmen aktualisiert', saved.name === 'Hans E.' && saved.votes[0] === 'nein' && saved.votes[1] === 'ja');
  t('Kein Duplikat entstanden', state.poll.participants.filter(p => p.extern).length === 1);
  t('Edit erzeugt KEINE weitere Notifikation', !state.upserts.some(u => u.module_key === 'notify'));
  const r3 = await POST({ token: TOKEN, name: 'X', votes: [], partId, secret: 'f'.repeat(32) });
  t('Falsches Secret → 403', r3.statusCode === 403, r3.statusCode);
  const r4 = await POST({ token: TOKEN, name: '', votes: [] });
  t('Leerer Name → 400', r4.statusCode === 400, r4.statusCode);
}

console.log('— POST: Grenzen —');
{
  const many = basePoll();
  many.participants = Array.from({ length: 200 }, (_, i) => ({ id: 'p' + i, name: 'N' + i, votes: [] }));
  state = { poll: many, upserts: [] };
  const r = await POST({ token: TOKEN, name: 'Einer zu viel', votes: [] });
  t('Teilnehmer-Limit → 409', r.statusCode === 409, r.statusCode);
  state = { poll: basePoll({ freigabe: { token: TOKEN, aktiv: false } }), upserts: [] };
  const r2 = await POST({ token: TOKEN, name: 'Hans', votes: [] });
  t('POST auf deaktivierte Freigabe → 404', r2.statusCode === 404, r2.statusCode);
  const r3 = await handler({ httpMethod: 'PUT', body: '{}' });
  t('PUT → 405', r3.statusCode === 405, r3.statusCode);
}

console.log('');
console.log(fail ? '✗ ' + fail + ' von ' + n + ' Tests FEHLGESCHLAGEN' : '✓ Alle ' + n + ' Tests grün');
process.exit(fail ? 1 : 0);
