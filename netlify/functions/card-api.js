/**
 * card-api.js — angemeldete Karten-Aktionen (JWT-gated)
 * ═══════════════════════════════════════════════════════════════════════
 * Gegenstueck zu den oeffentlichen card-*-Endpoints: alles, was ein
 * eingeloggter GEMA-Nutzer mit Karten tut. Ein Aufruf ohne gueltiges
 * Token wird abgelehnt (requireAuth, fail-closed).
 *
 *   GET/POST  ?action=…
 *     me              eigene Karte (Vollsicht) + Statistik
 *     save            eigene Karte speichern
 *     foto            Profilbild setzen (zwei Groessen, clientseitig erzeugt)
 *     foto_del        Profilbild entfernen
 *     projekte        Projekte, denen Beteiligte zugeordnet werden duerfen
 *     kontakt_add     Karte ins eigene Kontaktbuch
 *     kontakt_list    Kontaktbuch (LIVE aus den Profilen — nie kopiert)
 *     kontakt_del     Eintrag entfernen
 *     beteiligt_add   Person einem Projekt zuordnen
 *     beteiligt_list  Beteiligte eines Projekts
 *     beteiligt_del   Beteiligten entfernen
 *     beteiligt_rolle Rolle aendern
 *     meine_projekte  Projekte, in denen ICH Beteiligter bin
 *     reports         offene Meldungen zur eigenen Karte
 *     report_erledigt Meldung abhaken
 *     funnel          Trichter scan→vcard→claim→projekt (§9)
 *     org_austritt    Firmenfelder loeschen (Konzept §6.8)
 *
 * Auch hier gilt die Feld-Whitelist: fremde Karten kommen ausschliesslich
 * durch C.sanitizePublic() heraus — Vollsicht gibt es nur auf die eigene.
 */
'use strict';

const C = require('./_card');
const { requireAuth } = require('./_jwt');

const ROLLEN = ['architekt', 'bauherr', 'pl', 'monteur', 'lieferant', 'planer', 'sonstige'];
// Felder, die der Editor schreiben darf. Alles andere (slug, user_id,
// claim_token, claimed_at, created_by …) wird NIE vom Client uebernommen.
const SAVE_FELDER = ['display_name', 'first_name', 'last_name', 'company', 'company_uid', 'role_title',
  'phone', 'phone_office', 'email', 'website', 'address', 'zip', 'city'];
const FOTO_MAX = 900 * 1024;   // Rohbytes; der Client liefert bereits verkleinert

function s(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }

/* ── GEMA-Objekte (Projekte) aus gema_data lesen ─────────────────────── */
// Sichtbarkeit wie GemaObjekte.effektiveOrgId: eigene Org, sonst die Org
// des Erstellers; herrenlose Objekte nur fuer den Ersteller.
async function projekteFuer(user) {
  const rows = await C.sb('gema_data?module_key=eq.objekte&data_key=like.' + C.q('objekt:') + '*&select=payload');
  const alle = (rows || []).map(r => ((r && r.payload) || {}).data).filter(Boolean);
  const meineOrg = String(user.orgId || '');
  return alle.filter(function (o) {
    if (!o || !o.id) return false;
    if (o.status && o.status !== 'aktiv') return false;
    const org = String(o.orgId || '');
    if (org && org !== 'org_default') return org === meineOrg;
    return String(o.erstelltVon || '') === String(user.id);
  }).map(function (o) {
    const adr = [o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return { id: o.id, label: (o.name || adr || o.nummer || o.id) + (o.name && adr ? ' · ' + adr : ''), orgId: o.orgId || '' };
  }).sort((a, b) => a.label.localeCompare(b.label, 'de'));
}
async function projektErlaubt(user, projektId) {
  const p = await projekteFuer(user);
  return p.some(x => x.id === projektId);
}

/* ── Eigene Karte ────────────────────────────────────────────────────── */
async function meineKarte(user, anlegenWennFehlt) {
  let p = await C.profilByUser(user.id);
  if (p || !anlegenWennFehlt) return p;
  // Beim ersten Oeffnen des Editors: Karte aus den GEMA-Stammdaten
  // vorbefuellen. Pflicht ist nur Name + Mail (Grundprinzip 5).
  const mail = (user.profile && user.profile.email) || user.username || '';
  const name = user.name || mail || 'Ohne Namen';
  const teile = String(name).trim().split(/\s+/);
  const slug = await C.slugFrei();
  const rows = await C.sbInsert('card_profiles', {
    user_id: user.id, slug: slug, display_name: name,
    first_name: teile.length > 1 ? teile.slice(0, -1).join(' ') : name,
    last_name: teile.length > 1 ? teile[teile.length - 1] : '',
    email: mail || null,
    phone: (user.profile && user.profile.telefon) || null,
    claimed_at: new Date().toISOString(),
    field_origin: { email: 'org' }
  }, { returning: true });
  return (rows && rows[0]) ? await C.profilById(rows[0].id) : null;
}

/* ── Aktionen ────────────────────────────────────────────────────────── */
const A = {};

A.me = async function (body, user) {
  const p = await meineKarte(user, body.anlegen !== false);
  if (!p) return C.resp(200, { karte: null });
  const offen = await C.sbSelect('card_reports', 'profile_slug=eq.' + C.q(p.slug) + '&resolved_at=is.null&select=id');
  return C.resp(200, { karte: C.sanitizePublic(p, { voll: true }), meldungen: offen.length });
};

A.save = async function (body, user) {
  const p = await meineKarte(user, true);
  if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });
  const d = body.daten || {};
  const patch = {};
  SAVE_FELDER.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(d, f)) patch[f] = s(d[f], f === 'address' ? 160 : 120) || null;
  });
  if (!patch.display_name && !p.display_name) return C.resp(400, { error: 'Name ist Pflicht' });
  if (patch.display_name === null) return C.resp(400, { error: 'Name ist Pflicht' });
  if (patch.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.email)) return C.resp(400, { error: 'E-Mail ungültig' });

  if (d.fields_public && typeof d.fields_public === 'object') {
    const fp = {};
    Object.keys(C.FIELDS_PUBLIC_DEFAULT).forEach(function (k) { fp[k] = d.fields_public[k] === true; });
    patch.fields_public = fp;
  }
  if (d.field_origin && typeof d.field_origin === 'object') {
    const fo = {};
    SAVE_FELDER.forEach(function (f) {
      const v = d.field_origin[f];
      if (v === 'org' || v === 'personal') fo[f] = v;
    });
    patch.field_origin = fo;
  }
  if (!Object.keys(patch).length) return C.resp(200, { ok: true, karte: C.sanitizePublic(p, { voll: true }) });

  const rows = await C.sbUpdate('card_profiles', 'id=eq.' + C.q(p.id), patch);
  const neu = (rows && rows[0]) ? rows[0] : await C.profilById(p.id);
  return C.resp(200, { ok: true, karte: C.sanitizePublic(neu, { voll: true }) });
};

// Foto: der Client liefert ZWEI bereits verkleinerte JPEGs (512px Anzeige,
// 240px fuer die vCard). Serverseitiges Resizing ist nicht moeglich —
// GEMA-Functions haben keine npm-Dependencies.
A.foto = async function (body, user) {
  const p = await meineKarte(user, true);
  if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });
  function buf(dataUrl) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return null;
    const b = Buffer.from(m[2], 'base64');
    return b.length && b.length <= FOTO_MAX ? { buf: b, typ: m[1] } : null;
  }
  const gross = buf(body.gross);
  const klein = buf(body.klein) || gross;
  if (!gross) return C.resp(400, { error: 'Bild fehlt oder ist zu gross' });
  const ext = gross.typ === 'image/png' ? 'png' : 'jpg';
  const pfadG = 'p/' + p.id + '/foto.' + ext;
  const pfadK = 'p/' + p.id + '/foto_s.' + (klein.typ === 'image/png' ? 'png' : 'jpg');
  try {
    await C.storagePut(pfadG, gross.buf, gross.typ);
    await C.storagePut(pfadK, klein.buf, klein.typ);
  } catch (e) {
    if (C.istFehlenderBucket(e) || C.istFehlendeTabelle(e)) return C.fehlerAntwort(e, 'card-api foto');
    console.error('[card-api foto]', e && e.message);
    return C.resp(502, { error: 'Bild konnte nicht gespeichert werden' });
  }
  await C.sbUpdate('card_profiles', 'id=eq.' + C.q(p.id), { photo_path: pfadG, photo_vcard_path: pfadK });
  return C.resp(200, { ok: true });
};

A.foto_del = async function (body, user) {
  const p = await C.profilByUser(user.id);
  if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });
  if (p.photo_path) await C.storageDelete(p.photo_path);
  if (p.photo_vcard_path && p.photo_vcard_path !== p.photo_path) await C.storageDelete(p.photo_vcard_path);
  await C.sbUpdate('card_profiles', 'id=eq.' + C.q(p.id), { photo_path: null, photo_vcard_path: null });
  return C.resp(200, { ok: true });
};

A.projekte = async function (body, user) {
  return C.resp(200, { projekte: await projekteFuer(user) });
};

/* ── Kontaktbuch ─────────────────────────────────────────────────────── */
/**
 * Der In-App-Scanner laedt die oeffentliche Kartenseite NICHT — er springt
 * direkt in «Kontakt speichern» bzw. «Beteiligte:n hinzufuegen». Ohne
 * eigenes Signal fehlte diesen Faellen die Funnel-Stufe 1, waehrend die
 * spaeteren Stufen zaehlen: die Quoten koennten ueber 100 % steigen.
 */
async function scanGemeldet(body, p, user) {
  if (body.viaScan) await C.logEvent({ slug: p.slug, event: 'scan', refUser: user.id });
}

A.kontakt_add = async function (body, user) {
  const p = await C.profilBySlug(s(body.slug, 30));
  if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });
  if (p.user_id === user.id) return C.resp(400, { error: 'Das ist deine eigene Karte' });
  await C.sbInsert('card_contacts', {
    owner_user_id: user.id, profile_id: p.id, note: s(body.notiz, 300) || null
  }, { upsert: true, onConflict: 'owner_user_id,profile_id' });
  await scanGemeldet(body, p, user);
  await C.logEvent({ slug: p.slug, event: 'contact_saved', refUser: user.id });
  return C.resp(200, { ok: true });
};

A.kontakt_list = async function (body, user) {
  const rows = await C.sbSelect('card_contacts', 'owner_user_id=eq.' + C.q(user.id) + '&select=profile_id,note,created_at&order=created_at.desc&limit=500');
  if (!rows.length) return C.resp(200, { kontakte: [] });
  // KRITISCH: die Kontaktdaten werden LIVE aus den Profilen gelesen, nie
  // beim Speichern kopiert — genau das ist der Mehrwert gegenueber einem
  // normalen Adressbuch (Konzept §2.2 «Live an Profile gekoppelt»).
  const ids = rows.map(r => r.profile_id);
  const profile = await C.sbSelect('card_profiles',
    'id=in.(' + ids.map(C.q).join(',') + ')&select=' + C.PROFILE_COLS);
  const map = {};
  profile.forEach(p => { map[p.id] = p; });
  const out = rows.map(function (r) {
    const p = map[r.profile_id];
    if (!p) return null;
    const k = C.sanitizePublic(p);
    k.notiz = r.note || '';
    k.gespeichertAm = r.created_at;
    return k;
  }).filter(Boolean);
  return C.resp(200, { kontakte: out });
};

A.kontakt_del = async function (body, user) {
  const p = await C.profilBySlug(s(body.slug, 30));
  if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });
  await C.sbDelete('card_contacts', 'owner_user_id=eq.' + C.q(user.id) + '&profile_id=eq.' + C.q(p.id));
  return C.resp(200, { ok: true });
};

/* ── Beteiligte ──────────────────────────────────────────────────────── */
A.beteiligt_add = async function (body, user) {
  const projektId = s(body.projektId, 80);
  if (!projektId) return C.resp(400, { error: 'Projekt fehlt' });
  if (!(await projektErlaubt(user, projektId))) return C.resp(403, { error: 'Kein Zugriff auf dieses Projekt' });
  const p = await C.profilBySlug(s(body.slug, 30));
  if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });
  const rolle = ROLLEN.indexOf(String(body.rolle || '')) >= 0 ? String(body.rolle) : 'sonstige';
  await C.sbInsert('project_participants', {
    project_id: projektId, profile_id: p.id, role: rolle,
    // Ein bestehendes Konto ist sofort «active»; ein Schattenprofil bleibt
    // «invited», bis die Person die Karte uebernimmt (Konzept §6.5).
    status: p.user_id ? 'active' : 'invited',
    org_id: user.orgId || null, invited_by: user.id
  }, { upsert: true, onConflict: 'project_id,profile_id' });
  await scanGemeldet(body, p, user);
  await C.logEvent({ slug: p.slug, event: 'join_project', projectId: projektId, refUser: user.id });
  if (p.user_id && p.user_id !== user.id) {
    await C.notify({
      empfaengerUserId: p.user_id, eventKey: 'card_projekt_beteiligt', typ: 'info',
      absenderUserId: user.id, objektId: projektId,
      titel: '🏗 Du wurdest einem Projekt zugeordnet',
      text: (user.name || 'Jemand') + ' hat dich als Beteiligte:n hinzugefügt.',
      link: 'pm_objekte.html?objekt=' + projektId
    });
  }
  return C.resp(200, { ok: true, status: p.user_id ? 'active' : 'invited' });
};

A.beteiligt_list = async function (body, user) {
  const projektId = s(body.projektId, 80);
  if (!projektId) return C.resp(400, { error: 'Projekt fehlt' });
  if (!(await projektErlaubt(user, projektId))) return C.resp(403, { error: 'Kein Zugriff auf dieses Projekt' });
  const rows = await C.sbSelect('project_participants',
    'project_id=eq.' + C.q(projektId) + '&status=neq.removed&select=profile_id,role,status,invited_at,reminded_at&order=invited_at.asc');
  if (!rows.length) return C.resp(200, { beteiligte: [] });
  const ids = rows.map(r => r.profile_id);
  const profile = await C.sbSelect('card_profiles', 'id=in.(' + ids.map(C.q).join(',') + ')&select=' + C.PROFILE_COLS);
  const map = {}; profile.forEach(p => { map[p.id] = p; });
  const out = rows.map(function (r) {
    const p = map[r.profile_id];
    if (!p) return null;
    // Beteiligte sehen die Kontaktdaten der anderen Beteiligten (Konzept
    // §2.3) — aber weiterhin nur die freigegebenen Felder.
    const k = C.sanitizePublic(p);
    k.rolle = r.role; k.status = r.status;
    k.seit = r.invited_at; k.erinnertAm = r.reminded_at;
    k.claim_offen = !p.user_id;
    return k;
  }).filter(Boolean);
  return C.resp(200, { beteiligte: out });
};

A.beteiligt_del = async function (body, user) {
  const projektId = s(body.projektId, 80);
  if (!(await projektErlaubt(user, projektId))) return C.resp(403, { error: 'Kein Zugriff auf dieses Projekt' });
  const p = await C.profilBySlug(s(body.slug, 30));
  if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });
  await C.sbDelete('project_participants', 'project_id=eq.' + C.q(projektId) + '&profile_id=eq.' + C.q(p.id));
  return C.resp(200, { ok: true });
};

A.beteiligt_rolle = async function (body, user) {
  const projektId = s(body.projektId, 80);
  if (!(await projektErlaubt(user, projektId))) return C.resp(403, { error: 'Kein Zugriff auf dieses Projekt' });
  const p = await C.profilBySlug(s(body.slug, 30));
  if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });
  const rolle = ROLLEN.indexOf(String(body.rolle || '')) >= 0 ? String(body.rolle) : 'sonstige';
  await C.sbUpdate('project_participants',
    'project_id=eq.' + C.q(projektId) + '&profile_id=eq.' + C.q(p.id), { role: rolle });
  return C.resp(200, { ok: true });
};

// Projekte, in denen ICH Beteiligter bin (Free-Konto: lesende Sicht).
A.meine_projekte = async function (body, user) {
  const p = await C.profilByUser(user.id);
  if (!p) return C.resp(200, { projekte: [] });
  const rows = await C.sbSelect('project_participants',
    'profile_id=eq.' + C.q(p.id) + '&status=neq.removed&select=project_id,role,status,invited_at&order=invited_at.desc&limit=200');
  if (!rows.length) return C.resp(200, { projekte: [] });
  const objs = await C.sb('gema_data?module_key=eq.objekte&data_key=like.' + C.q('objekt:') + '*&select=payload');
  const map = {};
  (objs || []).forEach(function (r) {
    const o = ((r && r.payload) || {}).data;
    if (o && o.id) map[o.id] = o;
  });
  return C.resp(200, {
    projekte: rows.map(function (r) {
      const o = map[r.project_id];
      const adr = o ? [o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
      return {
        id: r.project_id, rolle: r.role, status: r.status, seit: r.invited_at,
        name: (o && o.name) || adr || r.project_id, adresse: adr
      };
    })
  });
};

/* ── Meldungen zur eigenen Karte ─────────────────────────────────────── */
A.reports = async function (body, user) {
  const p = await C.profilByUser(user.id);
  if (!p) return C.resp(200, { meldungen: [] });
  const rows = await C.sbSelect('card_reports',
    'profile_slug=eq.' + C.q(p.slug) + '&select=id,reason,detail,reporter_mail,resolved_at,created_at&order=created_at.desc&limit=100');
  return C.resp(200, { meldungen: rows, slug: p.slug });
};

A.report_erledigt = async function (body, user) {
  const p = await C.profilByUser(user.id);
  if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });
  const id = parseInt(body.id, 10);
  if (!id) return C.resp(400, { error: 'id fehlt' });
  // Der Slug-Filter ist die Berechtigungspruefung: fremde Meldungen
  // lassen sich damit nicht abhaken.
  await C.sbUpdate('card_reports', 'id=eq.' + id + '&profile_slug=eq.' + C.q(p.slug),
    { resolved_at: new Date().toISOString() });
  return C.resp(200, { ok: true });
};

/* ══ Funnel / KPI (Konzept §9) ═══════════════════════════════════════
   Die Kette, die zaehlt: scan → vcard → claim_start → claim_done →
   join_project. Jede Stufe misst genau EINE Frage:

     scan          Wie oft wurde die Karte ueberhaupt geoeffnet?
     vcard         Wie viele davon haben den Kontakt gespeichert?
     claim_start   Wie viele haben «Das bin ich» angetippt?
     claim_done    Wie viele haben die Karte wirklich uebernommen?
     join_project  Wie viele sind danach in einem Projekt gelandet?

   'scan' ist eine ZUSAMMENFASSUNG aus view+scan: card-public loggt beim
   Ausliefern 'view', der Client meldet zusaetzlich 'scan', wenn er den
   Aufruf einem QR zuordnen kann. Fuer die Trichter-Frage «wie oft
   geoeffnet» sind das dieselbe Stufe — getrennt gezaehlt waere die
   Quote schlicht falsch.
   ═══════════════════════════════════════════════════════════════════ */
const FUNNEL = [
  { id: 'scan', label: 'Karte geöffnet', events: ['view', 'scan'] },
  { id: 'vcard', label: 'Kontakt gespeichert', events: ['vcard', 'contact_saved'] },
  { id: 'claim_start', label: '«Das bin ich» getippt', events: ['claim_start'] },
  { id: 'claim_done', label: 'Karte übernommen', events: ['claim_done'] },
  { id: 'join_project', label: 'In Projekt aufgenommen', events: ['join_project'] }
];
const FUNNEL_TAGE = { 7: 7, 30: 30, 90: 90, 0: 0 };   // 0 = seit Beginn

/**
 * funnel — Trichter fuer die EIGENE Karte; role_admin sieht zusaetzlich
 * das ganze System. Der Systemwert ist bewusst eine reine Zaehlung ohne
 * Slug-Bezug: eine Liste «wer wurde wie oft gescannt» waere ein
 * Bewegungsprofil ueber fremde Personen und hat hier nichts zu suchen.
 */
A.funnel = async function (body, user) {
  const tage = FUNNEL_TAGE[String(parseInt(body.tage, 10) || 30)] != null
    ? (parseInt(body.tage, 10) || 30) : 30;
  const seit = tage > 0 ? new Date(Date.now() - tage * 86400000).toISOString() : '';
  const zeitFilter = seit ? '&created_at=gte.' + encodeURIComponent(seit) : '';
  const admin = Array.isArray(user.roleIds) && user.roleIds.indexOf('role_admin') >= 0;

  // Gezaehlt wird ueber den Content-Range-Header, NICHT ueber die Laenge
  // geladener Zeilen: PostgREST liefert hoechstens db-max-rows (1000)
  // Zeilen aus, `.length` waere ab da stillschweigend falsch.
  async function zaehle(extra) {
    return await Promise.all(FUNNEL.map(async function (st) {
      const inList = st.events.map(function (e) { return C.q(e); }).join(',');
      const c = await C.sbCount('card_events', 'event=in.(' + inList + ')' + zeitFilter + extra);
      return { id: st.id, label: st.label, wert: c == null ? 0 : c };
    }));
  }

  const p = await C.profilByUser(user.id);
  const meine = p ? await zaehle('&profile_slug=eq.' + C.q(p.slug)) : null;
  const system = admin ? await zaehle('') : null;
  return C.resp(200, { tage: tage, slug: p ? p.slug : '', meine: meine, system: system, admin: admin });
};

/**
 * org_austritt — Firmenfelder loeschen (Konzept §6.8).
 * Wird gerufen, wenn ein Org-Admin jemanden aus der Firma nimmt.
 * Es verschwinden NUR Felder mit field_origin === 'org'; persoenliche
 * Felder (Mobile, private Mail) und vor allem SLUG und Karte selbst
 * bleiben — im Adressbuch Gespeicherte kommen weiter zur richtigen Karte.
 */
A.org_austritt = async function (body, user) {
  const zielUserId = s(body.userId, 80);
  if (!zielUserId) return C.resp(400, { error: 'userId fehlt' });
  // Nur GEMA-Admin oder Org-Admin der betroffenen Firma.
  const admin = (user.roleIds || []).indexOf('role_admin') >= 0;
  const ziel = await C.gemaUser(zielUserId);
  if (!admin) {
    const org = ziel && ziel.orgId ? await C.sb('gema_data?module_key=eq.auth&data_key=eq.' + C.q('org:' + ziel.orgId) + '&select=payload') : null;
    const admins = (org && org[0] && org[0].payload && org[0].payload.data && org[0].payload.data.admins) || [];
    if (admins.indexOf(user.id) < 0) return C.resp(403, { error: 'Keine Berechtigung' });
  }
  const p = await C.profilByUser(zielUserId);
  if (!p) return C.resp(200, { ok: true, geleert: 0 });
  const fo = p.field_origin || {};
  const patch = {};
  SAVE_FELDER.forEach(function (f) { if (fo[f] === 'org') patch[f] = null; });
  if (!Object.keys(patch).length) return C.resp(200, { ok: true, geleert: 0 });
  patch.field_origin = Object.keys(fo).reduce(function (acc, k) { if (fo[k] !== 'org') acc[k] = fo[k]; return acc; }, {});
  await C.sbUpdate('card_profiles', 'id=eq.' + C.q(p.id), patch);
  if (p.user_id) {
    await C.notify({
      empfaengerUserId: p.user_id, eventKey: 'card_firmenwechsel', typ: 'aktion',
      titel: '📇 Firmenangaben deiner Karte entfernt',
      text: 'Deine Karte zeigt keine Firmendaten mehr. Dein Link und QR-Code bleiben unverändert — neue Firma jetzt hinterlegen?',
      link: 'sys_card_editor.html'
    });
  }
  return C.resp(200, { ok: true, geleert: Object.keys(patch).length - 1 });
};

/* ── Handler ─────────────────────────────────────────────────────────── */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return C.preflight();
  if (!C.configured()) return C.resp(500, { error: 'Server nicht konfiguriert' });

  const claims = requireAuth(event);
  if (!claims || !claims.uid) return C.resp(401, { error: 'Nicht angemeldet' });

  let body = {};
  if (event.httpMethod === 'POST') {
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return C.resp(400, { error: 'Ungültiger Body' }); }
  } else if (event.httpMethod === 'GET') {
    body = Object.assign({}, event.queryStringParameters || {});
  } else {
    return C.resp(405, { error: 'Method not allowed' });
  }

  const fn = A[String(body.action || '')];
  if (!fn) return C.resp(400, { error: 'Unbekannte action' });

  // Der User kommt aus der DATENBANK, nie aus dem Token-Payload — das
  // Token traegt nur uid/org/adm, Rollen und Profil koennten veraltet sein.
  const user = await C.gemaUser(claims.uid);
  if (!user || user.active === false) return C.resp(401, { error: 'Konto inaktiv' });

  try {
    return await fn(body, user);
  } catch (e) {
    return C.fehlerAntwort(e, 'card-api ' + body.action);
  }
};

exports._intern = { ROLLEN, SAVE_FELDER, FUNNEL };
