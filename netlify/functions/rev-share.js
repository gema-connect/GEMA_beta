/* GEMA Revisionsunterlagen — oeffentlicher Freigabe-Endpunkt.
   GET /.netlify/functions/rev-share?t=<token>
   Liest das Dossier per Service-Key (umgeht RLS), sanitisiert es (kein Token,
   keine userIds, keine dataUrl, keine ausgeblendeten Eintraege) und liefert es
   samt Org-Branding fuer den oeffentlichen Viewer sys_revision_ansicht.html.
   ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY (wie gema-auth.js). */
'use strict';

const SB_URL = process.env.SUPABASE_URL || 'https://fjhbqjvaygvhievjgdtm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const TABLE = 'gema_data';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};
function resp(status, obj) {
  return { statusCode: status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, CORS), body: JSON.stringify(obj) };
}

function sbHeaders() {
  const h = { 'apikey': SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.indexOf('eyJ') === 0) h['Authorization'] = 'Bearer ' + SERVICE_KEY;
  return h;
}
async function sb(pathQs) {
  const res = await fetch(SB_URL + '/rest/v1/' + pathQs, { headers: sbHeaders() });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error('Supabase ' + res.status + ': ' + t.slice(0, 160)); }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
function q(s) { return encodeURIComponent(s); }

// Server-seitiges Spiegelbild von revSanitizeForShare (pm_revisionsunterlagen.html)
function sanitize(d) {
  const o = JSON.parse(JSON.stringify(d || {}));
  delete o.freigabe; delete o.sammelStand; delete o.orgId;
  if (o.erstelltVon) delete o.erstelltVon.userId;
  (o.kapitel || []).forEach(function (kap) {
    kap.eintraege = (kap.eintraege || []).filter(function (e) { return !e.ausgeblendet; }).map(function (e) {
      if (e.quelle) { delete e.quelle.ref; }
      if (e.dataUrl && !e.url) { e.nurIntern = true; e.dataUrl = ''; }
      else if (e.dataUrl) { delete e.dataUrl; }
      delete e.autoKey; delete e.lieferantId; delete e.anfrageId; delete e.produktId; delete e.dokId;
      return e;
    });
  });
  return o;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return resp(405, { error: 'Method not allowed' });
  if (!SERVICE_KEY) return resp(500, { error: 'Server nicht konfiguriert' });

  const qs = event.queryStringParameters || {};
  const token = String(qs.t || '').trim();
  if (!/^[a-f0-9]{32,64}$/.test(token)) return resp(400, { error: 'Ungültiger Link' });

  try {
    // Dossier per Token finden
    const rows = await sb(TABLE + '?module_key=eq.revisionsunterlagen&data_key=like.revd:*'
      + '&payload->data->freigabe->>token=eq.' + q(token)
      + '&select=data_key,payload&limit=2');
    if (!rows || !rows.length) return resp(404, { error: 'Nicht gefunden oder deaktiviert' });
    if (rows.length > 1) return resp(404, { error: 'Nicht gefunden' });
    const dossier = (rows[0].payload && rows[0].payload.data) || null;
    if (!dossier || !dossier.freigabe || dossier.freigabe.aktiv !== true || dossier.freigabe.token !== token) {
      return resp(404, { error: 'Nicht gefunden oder deaktiviert' });
    }

    // Org-Branding nachladen (nur die noetigen Felder)
    let branding = { orgName: 'GEMA', logo: '', logoVector: '', pdfFarben: null };
    try {
      if (dossier.orgId) {
        const orgRows = await sb(TABLE + '?module_key=eq.auth&data_key=eq.' + q('org:' + dossier.orgId) + '&select=payload&limit=1');
        const org = orgRows && orgRows.length && orgRows[0].payload && orgRows[0].payload.data;
        if (org) {
          branding = {
            orgName: org.name || 'GEMA',
            logo: org.logo || '',
            logoVector: org.logoVector || '',
            pdfFarben: (org.settings && org.settings.pdfFarben) || null
          };
        }
      }
    } catch (e) { /* Branding ist best-effort */ }

    return resp(200, { dossier: sanitize(dossier), branding: branding });
  } catch (e) {
    return resp(502, { error: 'Serverfehler beim Laden' });
  }
};
