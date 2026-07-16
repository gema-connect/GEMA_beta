/* GEMA Goodel — oeffentlicher Freigabe-Endpunkt fuer Terminabstimmungen.
   GET  /.netlify/functions/goodel-share?t=<token>
        → liefert GENAU die eine Umfrage des Tokens, serverseitig
          sanitisiert (keine orgId, keine userIds, kein Token, keine
          Einladungsliste, keine extSecrets) fuer sys_goodel_ansicht.html.
   POST /.netlify/functions/goodel-share
        Body {token, name, votes[], partId?, secret?}
        → traegt die Abstimmung eines Externen ein (neu oder Bearbeitung
          der eigenen Antwort via partId+secret) und benachrichtigt den
          Ersteller (notif:-Row, Muster form-watch-cron).
   ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY (wie rev-share.js). */
'use strict';

const SB_URL = process.env.SUPABASE_URL || 'https://fjhbqjvaygvhievjgdtm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const TABLE = 'gema_data';
const MAX_PARTICIPANTS = 200;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
function resp(status, obj) {
  return { statusCode: status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, CORS), body: JSON.stringify(obj) };
}

function sbHeaders(extra) {
  const h = Object.assign({ 'apikey': SERVICE_KEY, 'Content-Type': 'application/json' }, extra || {});
  if (SERVICE_KEY.indexOf('eyJ') === 0) h['Authorization'] = 'Bearer ' + SERVICE_KEY;
  return h;
}
async function sbGet(pathQs) {
  const res = await fetch(SB_URL + '/rest/v1/' + pathQs, { headers: sbHeaders() });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error('Supabase ' + res.status + ': ' + t.slice(0, 160)); }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
async function sbUpsert(rows) {
  const res = await fetch(SB_URL + '/rest/v1/' + TABLE + '?on_conflict=module_key%2Cdata_key', {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows)
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error('Supabase ' + res.status + ': ' + t.slice(0, 160)); }
}
function q(s) { return encodeURIComponent(s); }
function randHex(bytes) {
  const crypto = require('crypto');
  return crypto.randomBytes(bytes).toString('hex');
}
// Konstante-Zeit-Vergleich fuer das externe Secret (Review S7).
function timingSafeEq(a, b) {
  const crypto = require('crypto');
  const x = Buffer.from(String(a == null ? '' : a)), y = Buffer.from(String(b == null ? '' : b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* Umfrage per Token laden (nur aktive Freigaben). Liefert {key, poll} */
async function loadByToken(token) {
  const rows = await sbGet(TABLE + '?module_key=eq.goodel&data_key=like.goodel:*'
    + '&payload->data->freigabe->>token=eq.' + q(token)
    + '&select=data_key,payload&limit=2');
  if (!rows || rows.length !== 1) return null;
  const poll = (rows[0].payload && rows[0].payload.data) || null;
  if (!poll || !poll.freigabe || poll.freigabe.aktiv !== true || poll.freigabe.token !== token) return null;
  return { key: rows[0].data_key, poll: poll };
}

/* Oeffentliche Sicht: NUR was der Externe sehen darf */
function sanitize(p) {
  return {
    id: p.id,
    title: p.title || '',
    desc: p.desc || '',
    ort: p.ort || '',
    created: p.created || '',
    erstelltVonName: (p.erstelltVon && p.erstelltVon.name) || '',
    options: (p.options || []).map(o => ({ date: o.date || '', time: o.time || '' })),
    participants: (p.participants || []).map(pt => ({
      id: pt.id, name: pt.name || '', votes: pt.votes || [], extern: !!pt.extern
    }))
  };
}

function normVotes(votes, optCount) {
  const ok = { ja: 1, nein: 1, maybe: 1 };
  const arr = Array.isArray(votes) ? votes.slice(0, optCount) : [];
  while (arr.length < optCount) arr.push(null);
  return arr.map(v => (ok[v] ? v : null));
}

async function notifyErsteller(poll, name) {
  try {
    const uid = poll.erstelltVon && poll.erstelltVon.userId;
    if (!uid) return;
    const now = new Date().toISOString();
    const n = {
      id: 'n_' + Date.now().toString(36) + '_' + randHex(3),
      ts: now,
      eventKey: 'goodel_abgestimmt',
      empfaengerUserId: uid,
      empfaengerRoleId: '',
      empfaengerOrgId: '',
      absenderUserId: '',
      modul: 'goodel',
      typ: 'info',
      titel: '🗓 Neue Antwort auf Terminabstimmung',
      text: name + ' hat bei «' + (poll.title || '') + '» abgestimmt (über den externen Link).',
      link: 'pm_goodel.html?poll=' + poll.id,
      objektId: '',
      gelesen: false,
      gelesenAt: null
    };
    await sbUpsert([{ module_key: 'notify', data_key: 'notif:' + n.id, payload: { data: n, _lm: now } }]);
  } catch (e) { /* Benachrichtigung ist best-effort */ }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (!SERVICE_KEY) return resp(500, { error: 'Server nicht konfiguriert' });

  /* ── GET: Umfrage abrufen ── */
  if (event.httpMethod === 'GET') {
    const token = String((event.queryStringParameters || {}).t || '').trim();
    if (!/^[a-f0-9]{32,64}$/.test(token)) return resp(400, { error: 'Ungültiger Link' });
    try {
      const hit = await loadByToken(token);
      if (!hit) return resp(404, { error: 'Nicht gefunden oder deaktiviert' });
      return resp(200, { umfrage: sanitize(hit.poll) });
    } catch (e) {
      return resp(502, { error: 'Abruf fehlgeschlagen' });
    }
  }

  /* ── POST: Abstimmung eintragen ── */
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' });
  let body = null;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { error: 'Ungültiger Body' }); }
  const token = String(body.token || '').trim();
  if (!/^[a-f0-9]{32,64}$/.test(token)) return resp(400, { error: 'Ungültiger Link' });
  const name = String(body.name || '').trim().slice(0, 50);
  if (!name) return resp(400, { error: 'Bitte Namen angeben' });

  try {
    const hit = await loadByToken(token);
    if (!hit) return resp(404, { error: 'Nicht gefunden oder deaktiviert' });
    const poll = hit.poll;
    poll.participants = poll.participants || [];
    const votes = normVotes(body.votes, (poll.options || []).length);

    let partId = String(body.partId || '');
    let secret = String(body.secret || '');
    let isNew = false;

    if (partId && secret) {
      // Eigene externe Antwort bearbeiten (Identität via Secret)
      const mine = poll.participants.find(pt => pt.id === partId && pt.extern === true);
      if (!mine || !mine.extSecret || !timingSafeEq(mine.extSecret, secret)) return resp(403, { error: 'Antwort kann nicht bearbeitet werden' });
      mine.name = name;
      mine.votes = votes;
    } else {
      if (poll.participants.length >= MAX_PARTICIPANTS) return resp(409, { error: 'Maximale Teilnehmerzahl erreicht' });
      if (poll.participants.some(pt => String(pt.name || '').toLowerCase() === name.toLowerCase())) {
        return resp(409, { error: 'Dieser Name hat bereits abgestimmt.' });
      }
      partId = 'ext_' + randHex(6);
      secret = randHex(16);
      poll.participants.push({ id: partId, name: name, votes: votes, extern: true, extSecret: secret, ts: new Date().toISOString() });
      isNew = true;
    }

    await sbUpsert([{ module_key: 'goodel', data_key: hit.key, payload: { data: poll, _lm: new Date().toISOString() } }]);
    if (isNew) await notifyErsteller(poll, name);
    return resp(200, isNew ? { ok: true, partId: partId, secret: secret } : { ok: true, partId: partId });
  } catch (e) {
    return resp(502, { error: 'Speichern fehlgeschlagen' });
  }
};
