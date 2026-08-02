/**
 * card-report.js — Meldung «Daten nicht aktuell» + Funnel-Events
 * ═══════════════════════════════════════════════════════════════════════
 * ÖFFENTLICHER ENDPOINT – KEIN JWT. Feld-Whitelist zwingend.
 * Nie `select *` durchreichen.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   POST {slug, reason, detail?, mail?}   → Meldung anlegen
 *   POST {slug, event:'contact_saved'}    → reines Funnel-Event
 *
 * Eine Meldung aendert NIEMALS Daten (Konzept §6.7) — sie landet als
 * Hinweis beim Inhaber, der selbst entscheidet. Rate-Limit 5/h/IP,
 * persistent ueber card_events (ein Container-Neustart darf das Limit
 * nicht zuruecksetzen, sonst ist es wirkungslos).
 */
'use strict';

const C = require('./_card');

const GRUENDE = ['firma_gewechselt', 'nummer_falsch', 'mail_falsch', 'person_unbekannt', 'sonstiges'];
const GRUND_TEXT = {
  firma_gewechselt: 'Firma gewechselt',
  nummer_falsch: 'Telefonnummer stimmt nicht',
  mail_falsch: 'E-Mail stimmt nicht',
  person_unbekannt: 'Person unbekannt',
  sonstiges: 'Sonstiges'
};
const MAX_PRO_STUNDE = 5;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return C.preflight();
  if (event.httpMethod !== 'POST') return C.resp(405, { error: 'Method not allowed' });
  if (!C.configured()) return C.resp(500, { error: 'Server nicht konfiguriert' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return C.resp(400, { error: 'Ungültiger Body' }); }

  const slug = String(body.slug || '').trim();
  if (!C.slugOk(slug)) return C.resp(400, { error: 'Ungültiger Link' });
  const hash = C.uaHash(event);

  /* ── Reines Funnel-Event (kein Missbrauchspotenzial, weiches Limit) ── */
  if (body.event) {
    if (!C.memLimit('ev', C.clientIp(event), 30, 60000)) return C.resp(200, { ok: true });
    await C.logEvent({ slug: slug, event: String(body.event), uaHash: hash });
    return C.resp(200, { ok: true });
  }

  /* ── Meldung ── */
  const reason = GRUENDE.indexOf(String(body.reason || '')) >= 0 ? String(body.reason) : 'sonstiges';
  const detail = String(body.detail || '').trim().slice(0, 500);
  const mail = String(body.mail || '').trim().slice(0, 120).toLowerCase();
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return C.resp(400, { error: 'E-Mail ungültig' });

  if (!C.memLimit('rep', C.clientIp(event), MAX_PRO_STUNDE, 3600000)) {
    return C.resp(429, { error: 'Zu viele Meldungen — bitte später erneut.' });
  }
  if (!(await C.dbLimit('report', hash, MAX_PRO_STUNDE, 3600000))) {
    return C.resp(429, { error: 'Zu viele Meldungen — bitte später erneut.' });
  }

  try {
    const p = await C.profilBySlug(slug);
    if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });

    await C.sbInsert('card_reports', {
      profile_slug: slug, reason: reason, detail: detail || null, reporter_mail: mail || null
    });
    await C.logEvent({ slug: slug, event: 'report', uaHash: hash });

    // Inhaber benachrichtigen (nur wenn die Karte einem Konto gehoert —
    // ein Schattenprofil hat niemanden, der es sehen koennte).
    if (p.user_id) {
      await C.notify({
        empfaengerUserId: p.user_id,
        eventKey: 'card_meldung',
        typ: 'aktion',
        titel: '📇 Hinweis zu deiner GEMA Card',
        text: (GRUND_TEXT[reason] || 'Hinweis') + (detail ? ' — ' + detail.slice(0, 140) : ''),
        link: 'sys_card_reports.html'
      });
    }
    return C.resp(200, { ok: true });
  } catch (e) {
    return C.resp(502, { error: 'Meldung konnte nicht gespeichert werden' });
  }
};

exports._intern = { GRUENDE, GRUND_TEXT };
