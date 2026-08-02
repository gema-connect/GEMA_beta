/**
 * card-claim.js — Karte uebernehmen (Claim) + Gratis-Konto anlegen
 * ═══════════════════════════════════════════════════════════════════════
 * ÖFFENTLICHER ENDPOINT – KEIN JWT (der Claim-Token IST der Nachweis).
 * Feld-Whitelist zwingend. Nie `select *` durchreichen.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   POST {action:'claim',    token, password, name?}   ohne Login
 *   POST {action:'claim'}    + Authorization: Bearer   mit Login (verknuepft
 *                                                      das Schattenprofil
 *                                                      mit dem bestehenden Konto)
 *   POST {action:'register', email, password, name}    Karte erstellen = Gratis-Konto
 *
 * ───────────────────────────────────────────────────────────────────────
 * KEIN MAGIC LINK — bewusste Abweichung vom Konzept (§6.5/§6.6)
 * ───────────────────────────────────────────────────────────────────────
 * Das Konzept sieht passwortlose Magic Links vor. GEMA hat KEINEN
 * Mailversand (CLAUDE.md: «E-Mail-Verifikation bewusst zurueckgestellt —
 * kein Mailversand vorhanden; bei Einladungs-only ist der Invite-Token
 * der Nachweis»). Ein Magic Link, den niemand zustellen kann, waere eine
 * Sackgasse. Deshalb:
 *   • Claim: der Token aus dem Link ist der Besitznachweis (48 hex,
 *     nicht erratbar) — die Person setzt direkt ein Passwort. Genau
 *     dasselbe Sicherheitsmodell wie die bestehende Einladungs-
 *     Aktivierung (gema-auth actionActivate).
 *   • Registrierung: E-Mail + Passwort in einem Schritt.
 * Sobald ein Mailversand existiert, kann derselbe Token gemailt werden —
 * der Ablauf bleibt unveraendert.
 *
 * PILOT-SPERRE: Selbst-Registrierung ist wie bei gema-auth.js
 * standardmaessig AUS. Die Karte ist ein eigener Trichter und hat deshalb
 * einen EIGENEN Schalter, damit das Oeffnen der Karten-Registrierung
 * nicht zugleich die volle Org-Registrierung oeffnet:
 *   GEMA_CARD_REGISTRATION_OPEN=1
 * Der Claim (Uebernahme eines fuer die Person angelegten Schattenprofils)
 * ist davon NICHT betroffen — dort hat ein GEMA-Nutzer die Person bewusst
 * eingeladen, das entspricht der Einladungs-Aktivierung.
 */
'use strict';

const crypto = require('crypto');
const C = require('./_card');
const { requireAuth, mintToken, scryptHash } = require('./_jwt');

const CARD_REGISTRATION_OPEN = process.env.GEMA_CARD_REGISTRATION_OPEN === '1';
const FREE_ORG = 'org_free';   // Sammel-Org der Gratis-Konten (keine Firma)
const MAX_PRO_STUNDE = 10;

function s(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
function mailOk(m) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m); }

async function authUsers() {
  const rows = await C.sb('gema_data?module_key=eq.auth&data_key=like.' + C.q('user:') + '*&select=payload');
  return (rows || []).map(r => ((r && r.payload) || {}).data).filter(Boolean);
}
async function mailVergeben(mail) {
  const m = mail.toLowerCase();
  const users = await authUsers();
  return users.find(u => u && (
    (u.username && String(u.username).toLowerCase() === m) ||
    (u.profile && u.profile.email && String(u.profile.email).toLowerCase() === m)
  )) || null;
}
async function putAuth(key, data) {
  await C.sb('gema_data?on_conflict=module_key%2Cdata_key', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ module_key: 'auth', data_key: key, payload: { data: data, _lm: Date.now() } }])
  });
}
async function freeOrgSicherstellen() {
  const rows = await C.sb('gema_data?module_key=eq.auth&data_key=eq.' + C.q('org:' + FREE_ORG) + '&select=payload');
  if (rows && rows.length) return FREE_ORG;
  await putAuth('org:' + FREE_ORG, {
    id: FREE_ORG, name: 'GEMA Card', logo: null, kategorie: 'sonstiges', kategorien: ['sonstiges'],
    adresse: { strasse: '', plz: '', ort: '', kanton: '', land: 'CH' },
    kontakt: { email: '', telefon: '', website: '' },
    admins: [], settings: {}, createdAt: new Date().toISOString(),
    // Sammel-Org fuer Gratis-Konten ohne Firma. Bewusst OHNE Admins —
    // niemand «verwaltet» hier andere; Org-Scoping greift trotzdem.
    hinweis: 'Sammel-Organisation der Gratis-Kartenkonten (role_free).'
  });
  return FREE_ORG;
}

/**
 * Konto anlegen (Gratis-Karte). Legt user: + cred: an und liefert ein
 * Token in derselben Form wie gema-auth.js.
 */
async function kontoAnlegen(mail, password, name) {
  const orgId = await freeOrgSicherstellen();
  const uid = 'user_card_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const user = {
    id: uid, username: mail, name: name || mail,
    roleIds: ['role_free'], orgId: orgId, active: true,
    createdAt: new Date().toISOString(),
    profile: { email: mail, telefon: '', sprache: 'de', benachrichtigungen: true },
    herkunft: 'gema_card'
  };
  await putAuth('cred:' + uid, { alg: 'scrypt', src: 'plain', hash: scryptHash(password), setAt: new Date().toISOString() });
  await putAuth('user:' + uid, user);
  return user;
}

/**
 * Merge nach dem Claim (Konzept §6.5):
 *  • Profil bekommt user_id, claimed_at; claim_token wird entwertet.
 *  • Alle Beteiligungen dieses Profils gehen auf «active».
 *  • Mehrere Profile mit derselben Mail werden zusammengefuehrt:
 *    das AELTESTE gewinnt, die neueren fuellen nur Luecken und werden
 *    danach entfernt (ihre Beteiligungen/Kontakte wandern mit).
 */
async function claimMerge(profil, user) {
  await C.sbUpdate('card_profiles', 'id=eq.' + C.q(profil.id), {
    user_id: user.id, claimed_at: new Date().toISOString(), claim_token: null
  });
  await C.sbUpdate('project_participants', 'profile_id=eq.' + C.q(profil.id) + '&status=eq.invited', { status: 'active' });

  const mail = String(profil.email || (user.profile && user.profile.email) || '').toLowerCase();
  if (!mail) return profil;

  const gleiche = (await C.profilByMail(mail)).filter(p => p.id !== profil.id);
  if (!gleiche.length) return await C.profilById(profil.id);

  const ziel = await C.profilById(profil.id);
  const patch = {};
  // Luecken fuellen — vorhandene Werte des Ziels werden NIE ueberschrieben.
  ['first_name', 'last_name', 'company', 'company_uid', 'role_title', 'phone', 'phone_office',
    'website', 'address', 'zip', 'city', 'photo_path', 'photo_vcard_path'].forEach(function (f) {
      if (ziel[f]) return;
      const quelle = gleiche.find(p => p[f]);
      if (quelle) patch[f] = quelle[f];
    });
  if (Object.keys(patch).length) await C.sbUpdate('card_profiles', 'id=eq.' + C.q(ziel.id), patch);

  for (const alt of gleiche) {
    // Beteiligungen umhaengen (Konflikte ignorieren — das Ziel hat sie schon)
    const bet = await C.sbSelect('project_participants', 'profile_id=eq.' + C.q(alt.id) + '&select=project_id,role,status,org_id,invited_by,invited_at');
    for (const b of bet) {
      try {
        await C.sbInsert('project_participants', {
          project_id: b.project_id, profile_id: ziel.id, role: b.role,
          status: b.status === 'removed' ? 'removed' : 'active',
          org_id: b.org_id, invited_by: b.invited_by, invited_at: b.invited_at
        }, { upsert: true, onConflict: 'project_id,profile_id' });
      } catch (e) { /* Duplikat — Ziel gewinnt */ }
    }
    const kon = await C.sbSelect('card_contacts', 'profile_id=eq.' + C.q(alt.id) + '&select=owner_user_id,note,created_at');
    for (const k of kon) {
      try {
        await C.sbInsert('card_contacts', {
          owner_user_id: k.owner_user_id, profile_id: ziel.id, note: k.note, created_at: k.created_at
        }, { upsert: true, onConflict: 'owner_user_id,profile_id' });
      } catch (e) { /* egal */ }
    }
    // Der alte Slug verschwindet damit. Das ist der einzige Fall, in dem
    // ein Kartenlink ungueltig wird — er zeigte auf ein Duplikat DERSELBEN
    // Person, die jetzt genau eine Karte hat.
    await C.sbDelete('card_profiles', 'id=eq.' + C.q(alt.id));
  }
  return await C.profilById(ziel.id);
}

/* ── Aktionen ────────────────────────────────────────────────────────── */
async function actionClaim(body, event) {
  const token = s(body.token, 80);
  if (!C.tokenOk(token)) return C.resp(400, { error: 'Ungültiger Übernahme-Link' });
  const profil = await C.profilByClaimToken(token);
  if (!profil) return C.resp(404, { error: 'Übernahme-Link ungültig oder bereits verwendet' });
  if (profil.user_id) return C.resp(409, { error: 'Diese Karte wurde bereits übernommen — bitte anmelden.' });

  // Weg 1: bereits eingeloggt → Karte einfach mit dem Konto verknuepfen.
  const claims = requireAuth(event);
  if (claims && claims.uid) {
    const user = await C.gemaUser(claims.uid);
    if (!user || user.active === false) return C.resp(401, { error: 'Konto inaktiv' });
    const schon = await C.profilByUser(user.id);
    if (schon && schon.id !== profil.id) {
      // Der Nutzer hat schon eine Karte: das Schattenprofil wird in seine
      // bestehende Karte gemerged, statt eine zweite anzulegen.
      const zusammen = await claimMerge(schon, user);
      await C.sbUpdate('card_profiles', 'id=eq.' + C.q(profil.id), { claim_token: null });
      await C.sbUpdate('project_participants', 'profile_id=eq.' + C.q(profil.id), { status: 'active' });
      await C.logEvent({ slug: profil.slug, event: 'claim_done', refUser: user.id });
      return C.resp(200, { ok: true, karte: C.sanitizePublic(zusammen, { voll: true }), bestehendesKonto: true });
    }
    const fertig = await claimMerge(profil, user);
    await C.logEvent({ slug: fertig.slug, event: 'claim_done', refUser: user.id });
    return C.resp(200, { ok: true, karte: C.sanitizePublic(fertig, { voll: true }), bestehendesKonto: true });
  }

  // Weg 2: ohne Login → Konto anlegen. Der Token ist der Nachweis.
  const password = String(body.password || '');
  if (password.length < 8) return C.resp(400, { error: 'Bitte ein Passwort mit mindestens 8 Zeichen wählen' });
  const mail = s(body.email, 120).toLowerCase() || String(profil.email || '').toLowerCase();
  if (!mail || !mailOk(mail)) return C.resp(400, { error: 'Bitte eine gültige E-Mail angeben' });

  const vorhanden = await mailVergeben(mail);
  if (vorhanden) {
    // Identitaet ist ueber den Token belegt, aber NICHT ueber die Mail —
    // ein bestehendes Konto darf hier keinesfalls uebernommen werden.
    return C.resp(409, {
      error: 'Für diese E-Mail gibt es bereits ein GEMA-Konto. Bitte anmelden — danach kannst du die Karte mit einem Klick übernehmen.',
      anmelden: true
    });
  }

  const name = s(body.name, 120) || profil.display_name || mail;
  const user = await kontoAnlegen(mail, password, name);
  const fertig = await claimMerge(profil, user);
  if (!fertig.email) await C.sbUpdate('card_profiles', 'id=eq.' + C.q(fertig.id), { email: mail });
  await C.logEvent({ slug: fertig.slug, event: 'claim_done', refUser: user.id });

  // Einladende Person informieren, dass die Karte jetzt lebt.
  if (profil.created_by && profil.created_by !== user.id) {
    await C.notify({
      empfaengerUserId: profil.created_by, eventKey: 'card_claim', typ: 'erfolg',
      titel: '📇 Karte wurde übernommen',
      text: (fertig.display_name || name) + ' hat die Karte übernommen und pflegt die Daten ab jetzt selbst.',
      link: '/p/' + fertig.slug
    });
  }
  const t = mintToken(user);
  return C.resp(200, { ok: true, token: t.token, exp: t.exp, user: user, karte: C.sanitizePublic(fertig, { voll: true }) });
}

async function actionRegister(body, event) {
  if (!CARD_REGISTRATION_OPEN) {
    return C.resp(403, { error: 'Die Karten-Registrierung ist derzeit geschlossen — bitte wende dich an deinen GEMA-Ansprechpartner.' });
  }
  if (!C.memLimit('reg', C.clientIp(event), MAX_PRO_STUNDE, 3600000)) {
    return C.resp(429, { error: 'Zu viele Registrierungen von dieser Verbindung — bitte später erneut.' });
  }
  const mail = s(body.email, 120).toLowerCase();
  const name = s(body.name, 120);
  const password = String(body.password || '');
  if (!mailOk(mail)) return C.resp(400, { error: 'Bitte eine gültige E-Mail angeben' });
  if (!name) return C.resp(400, { error: 'Bitte den Namen angeben' });
  if (password.length < 8) return C.resp(400, { error: 'Bitte ein Passwort mit mindestens 8 Zeichen wählen' });
  if (await mailVergeben(mail)) {
    return C.resp(409, { error: 'Für diese E-Mail gibt es bereits ein GEMA-Konto. Bitte anmelden.', anmelden: true });
  }

  // Gibt es fuer diese Mail bereits ein Schattenprofil (jemand hat die
  // Person schon eingeladen)? Dann wird DAS uebernommen statt ein zweites
  // anzulegen — sonst haette die Person zwei Karten (Konzept §6.4).
  const schatten = (await C.profilByMail(mail)).filter(p => !p.user_id);
  const user = await kontoAnlegen(mail, password, name);

  let karte;
  if (schatten.length) {
    karte = await claimMerge(schatten[0], user);
    if (name && karte.display_name !== name) {
      await C.sbUpdate('card_profiles', 'id=eq.' + C.q(karte.id), { display_name: name });
      karte = await C.profilById(karte.id);
    }
  } else {
    const teile = name.split(/\s+/);
    const slug = await C.slugFrei();
    const rows = await C.sbInsert('card_profiles', {
      user_id: user.id, slug: slug, display_name: name,
      first_name: teile.length > 1 ? teile.slice(0, -1).join(' ') : name,
      last_name: teile.length > 1 ? teile[teile.length - 1] : '',
      email: mail, claimed_at: new Date().toISOString()
    }, { returning: true });
    karte = rows && rows[0] ? await C.profilById(rows[0].id) : null;
  }
  if (!karte) return C.resp(502, { error: 'Karte konnte nicht angelegt werden' });

  await C.logEvent({ slug: karte.slug, event: 'claim_done', refUser: user.id });
  const t = mintToken(user);
  return C.resp(200, { ok: true, token: t.token, exp: t.exp, user: user, karte: C.sanitizePublic(karte, { voll: true }) });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return C.preflight();
  if (event.httpMethod !== 'POST') return C.resp(405, { error: 'Method not allowed' });
  if (!C.configured()) return C.resp(500, { error: 'Server nicht konfiguriert' });
  if (!process.env.GEMA_JWT_SECRET) return C.resp(500, { error: 'Server nicht konfiguriert (JWT)' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return C.resp(400, { error: 'Ungültiger Body' }); }

  try {
    if (body.action === 'claim') return await actionClaim(body, event);
    if (body.action === 'register') return await actionRegister(body, event);
    return C.resp(400, { error: 'Unbekannte action' });
  } catch (e) {
    return C.fehlerAntwort(e, 'card-claim');
  }
};
