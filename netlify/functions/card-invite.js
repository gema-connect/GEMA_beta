/**
 * card-invite.js — Schattenprofil anlegen + Projektbeteiligung (JWT-gated)
 * ═══════════════════════════════════════════════════════════════════════
 * Referenz: UMSETZUNG_GEMA_Card.md §6.4 / §6.5
 *
 *   POST {action:'einladen',   projektId, name, email, rolle}
 *   POST {action:'erinnerung', projektId, slug}
 *
 * ───────────────────────────────────────────────────────────────────────
 * KEIN MAILVERSAND — der Einladungs-LINK ist das Ergebnis
 * ───────────────────────────────────────────────────────────────────────
 * Das Konzept sieht eine Einladungsmail vor. GEMA hat keinen Mailversand
 * (CLAUDE.md). Deshalb liefert diese Function den Claim-Link ZURUECK, und
 * die einladende Person teilt ihn selbst (Kopieren / WhatsApp / Mail-
 * Programm) — dasselbe Muster wie die Freigabe-Links in
 * pm_revisionsunterlagen und pm_goodel. Der Link enthaelt den Token, der
 * die Uebernahme freischaltet; sobald ein Mailversand existiert, kann
 * genau dieser Link automatisch verschickt werden.
 *
 * Der ANTWORT-Text fuer die Weitergabe (`einladungstext`) nennt
 * transparent, WER eingeladen hat, WELCHES Projekt es betrifft, WELCHE
 * Daten gespeichert sind und wie man die Loeschung verlangt (nDSG,
 * Konzept §8). Der Loesch-Link ist Teil des Claim-Links: die Kartenseite
 * bietet dort «Daten nicht aktuell / Person unbekannt» an.
 *
 * DEDUPE: existiert bereits ein Profil mit derselben Mail, wird es
 * VERKNUEPFT statt ein zweites angelegt (Konzept §6.4.2 / Akzeptanz
 * «Doppelte Mail erzeugt kein zweites Profil»).
 *
 * Einladungs-Limit (Konzept §8): FREE 10/Tag, ORG 50/Tag.
 */
'use strict';

const C = require('./_card');
const { requireAuth } = require('./_jwt');

const ROLLEN = ['architekt', 'bauherr', 'pl', 'monteur', 'lieferant', 'planer', 'sonstige'];
const LIMIT_FREE = 10;
const LIMIT_ORG = 50;
const ERINNERUNG_TAGE = 7;

function s(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
function mailOk(m) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m); }

function basisUrl(event) {
  if (process.env.GEMA_SITE_URL) return String(process.env.GEMA_SITE_URL).replace(/\/+$/, '');
  if (process.env.URL) return String(process.env.URL).replace(/\/+$/, '');
  const h = event.headers || {};
  const host = h['x-forwarded-host'] || h['host'] || h['Host'] || '';
  return host ? 'https://' + host : '';
}

// Darf der Nutzer Beteiligte fuer dieses Projekt pflegen?
// Gleiche Sicht wie card-api: eigene Org bzw. selbst erstellt.
async function projektOk(user, projektId) {
  const rows = await C.sb('gema_data?module_key=eq.objekte&data_key=eq.' + C.q('objekt:' + projektId) + '&select=payload');
  const o = (rows && rows[0] && rows[0].payload && rows[0].payload.data) || null;
  if (!o) return null;
  const org = String(o.orgId || '');
  const meine = String(user.orgId || '');
  if (org && org !== 'org_default') { if (org !== meine) return null; }
  else if (String(o.erstelltVon || '') !== String(user.id)) return null;
  return o;
}

async function tagesLimit(user) {
  const frei = (user.roleIds || []).indexOf('role_free') >= 0 && (user.roleIds || []).indexOf('role_admin') < 0;
  const max = frei ? LIMIT_FREE : LIMIT_ORG;
  const seit = new Date(Date.now() - 86400000).toISOString();
  const rows = await C.sbSelect('card_events',
    'event=eq.invite_sent&ref_user=eq.' + C.q(user.id) + '&created_at=gte.' + C.q(seit) + '&select=id&limit=' + (max + 1));
  return { ok: rows.length < max, max: max };
}

/* ── Einladen ────────────────────────────────────────────────────────── */
async function actionEinladen(body, user, event) {
  const projektId = s(body.projektId, 80);
  const name = s(body.name, 120);
  const email = s(body.email, 120).toLowerCase();
  const rolle = ROLLEN.indexOf(String(body.rolle || '')) >= 0 ? String(body.rolle) : 'sonstige';

  if (!projektId) return C.resp(400, { error: 'Projekt fehlt' });
  if (!name) return C.resp(400, { error: 'Bitte den Namen angeben' });
  if (!mailOk(email)) return C.resp(400, { error: 'Bitte eine gültige E-Mail angeben' });

  const objekt = await projektOk(user, projektId);
  if (!objekt) return C.resp(403, { error: 'Kein Zugriff auf dieses Projekt' });

  const lim = await tagesLimit(user);
  if (!lim.ok) return C.resp(429, { error: 'Tageslimit von ' + lim.max + ' Einladungen erreicht — morgen wieder möglich.' });

  // ── Dedupe: gibt es die Person schon? ──
  const treffer = await C.profilByMail(email);
  let profil = treffer[0] || null;
  let neu = false;

  if (!profil) {
    const teile = name.split(/\s+/);
    const slug = await C.slugFrei();
    const rows = await C.sbInsert('card_profiles', {
      slug: slug, display_name: name,
      first_name: teile.length > 1 ? teile.slice(0, -1).join(' ') : name,
      last_name: teile.length > 1 ? teile[teile.length - 1] : '',
      email: email,
      // Schattenprofil: user_id bleibt NULL, bis die Person die Karte
      // uebernimmt. Nur Name, Mail und Rolle — mehr wird ueber Dritte
      // nicht gespeichert (Konzept §8).
      claim_token: C.tokenNeu(),
      created_by: user.id,
      fields_public: { company: true, role_title: true, phone: true, email: true, website: false, address: false }
    }, { returning: true });
    if (!rows || !rows[0]) return C.resp(502, { error: 'Profil konnte nicht angelegt werden' });
    profil = await C.profilById(rows[0].id);
    neu = true;
  } else if (!profil.user_id && !profil.claim_token) {
    // Altes Schattenprofil ohne (bzw. mit entwertetem) Token → neuen geben.
    const t = C.tokenNeu();
    await C.sbUpdate('card_profiles', 'id=eq.' + C.q(profil.id), { claim_token: t });
    profil.claim_token = t;
  }

  await C.sbInsert('project_participants', {
    project_id: projektId, profile_id: profil.id, role: rolle,
    status: profil.user_id ? 'active' : 'invited',
    org_id: user.orgId || null, invited_by: user.id
  }, { upsert: true, onConflict: 'project_id,profile_id' });

  await C.logEvent({ slug: profil.slug, event: 'invite_sent', projectId: projektId, refUser: user.id });

  const basis = basisUrl(event);
  const projektName = objekt.name || [objekt.strasse, objekt.ort].filter(Boolean).join(', ') || projektId;
  const kartenLink = basis + '/p/' + profil.slug;
  const claimLink = profil.claim_token ? (basis + '/c/' + profil.claim_token) : kartenLink;

  // Hat die Person bereits ein GEMA-Konto → normale Benachrichtigung,
  // dann braucht es gar keinen Link.
  if (profil.user_id && profil.user_id !== user.id) {
    await C.notify({
      empfaengerUserId: profil.user_id, eventKey: 'card_projekt_beteiligt', typ: 'info',
      absenderUserId: user.id, objektId: projektId,
      titel: '🏗 Du wurdest einem Projekt zugeordnet',
      text: (user.name || 'Jemand') + ' hat dich beim Projekt «' + projektName + '» als Beteiligte:n hinzugefügt.',
      link: 'pm_objekte.html?objekt=' + projektId
    });
  }

  return C.resp(200, {
    ok: true,
    neu: neu,
    hatKonto: !!profil.user_id,
    karte: C.sanitizePublic(profil),
    claimLink: profil.user_id ? '' : claimLink,
    kartenLink: kartenLink,
    // Fertiger Text zum Weitergeben (WhatsApp/Mail). Nennt transparent
    // Absender, Projekt, gespeicherte Daten und den Weg zur Loeschung.
    einladungstext: profil.user_id ? '' : (
      'Hallo ' + name + '\n\n'
      + (user.name || 'Ein GEMA-Nutzer') + ' hat dich beim Projekt «' + projektName + '» als Beteiligte:n hinzugefügt.\n\n'
      + 'Damit alle Beteiligten dich erreichen, sind aktuell gespeichert: Name und E-Mail-Adresse.\n\n'
      + 'Über diesen Link kannst du deine Kontaktkarte kostenlos übernehmen und die Daten selbst pflegen:\n'
      + claimLink + '\n\n'
      + 'Wenn du das nicht möchtest: öffne den Link und wähle «Daten nicht mehr aktuell? Melden» → «Person unbekannt». '
      + 'Deine Angaben werden dann gelöscht.'
    )
  });
}

/* ── Erinnerung ──────────────────────────────────────────────────────── */
async function actionErinnerung(body, user, event) {
  const projektId = s(body.projektId, 80);
  if (!(await projektOk(user, projektId))) return C.resp(403, { error: 'Kein Zugriff auf dieses Projekt' });
  const profil = await C.profilBySlug(s(body.slug, 30));
  if (!profil) return C.resp(404, { error: 'Person nicht gefunden' });
  if (profil.user_id) return C.resp(400, { error: 'Diese Person hat die Karte bereits übernommen.' });

  const rows = await C.sbSelect('project_participants',
    'project_id=eq.' + C.q(projektId) + '&profile_id=eq.' + C.q(profil.id) + '&select=reminded_at&limit=1');
  const letzte = rows[0] && rows[0].reminded_at ? new Date(rows[0].reminded_at).getTime() : 0;
  // Konzept §2.3: max. 1x pro 7 Tage — verhindert, dass eine nicht
  // reagierende Person mit Erinnerungen zugeschuettet wird.
  if (letzte && Date.now() - letzte < ERINNERUNG_TAGE * 86400000) {
    const rest = Math.ceil((ERINNERUNG_TAGE * 86400000 - (Date.now() - letzte)) / 86400000);
    return C.resp(429, { error: 'Erst in ' + rest + ' Tag' + (rest === 1 ? '' : 'en') + ' wieder möglich.' });
  }

  let token = profil.claim_token;
  if (!token) {
    token = C.tokenNeu();
    await C.sbUpdate('card_profiles', 'id=eq.' + C.q(profil.id), { claim_token: token });
  }
  await C.sbUpdate('project_participants',
    'project_id=eq.' + C.q(projektId) + '&profile_id=eq.' + C.q(profil.id),
    { reminded_at: new Date().toISOString() });

  return C.resp(200, { ok: true, claimLink: basisUrl(event) + '/c/' + token });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return C.preflight();
  if (event.httpMethod !== 'POST') return C.resp(405, { error: 'Method not allowed' });
  if (!C.configured()) return C.resp(500, { error: 'Server nicht konfiguriert' });

  const claims = requireAuth(event);
  if (!claims || !claims.uid) return C.resp(401, { error: 'Nicht angemeldet' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return C.resp(400, { error: 'Ungültiger Body' }); }

  const user = await C.gemaUser(claims.uid);
  if (!user || user.active === false) return C.resp(401, { error: 'Konto inaktiv' });
  // Gratis-Konten duerfen keine Projekte bestuecken (Konzept §2.3).
  const frei = (user.roleIds || []).indexOf('role_free') >= 0 && (user.roleIds || []).indexOf('role_admin') < 0;
  if (frei) return C.resp(403, { error: 'Mit einem Gratis-Konto lassen sich keine Beteiligten hinzufügen.' });

  try {
    if (body.action === 'einladen') return await actionEinladen(body, user, event);
    if (body.action === 'erinnerung') return await actionErinnerung(body, user, event);
    return C.resp(400, { error: 'Unbekannte action' });
  } catch (e) {
    return C.fehlerAntwort(e, 'card-invite');
  }
};
