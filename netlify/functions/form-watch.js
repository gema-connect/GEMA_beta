/**
 * netlify/functions/form-watch.js
 *
 * Prüft server-seitig, ob sich ein Behördenformular unter seiner URL geändert
 * hat (der Browser kann fremde URLs wegen CORS nicht laden). Lädt die URL,
 * bildet einen SHA-256-Hash des Inhalts und liefert zusätzlich ETag,
 * Last-Modified und Grösse. Der Client vergleicht mit dem gespeicherten Stand.
 *
 *   GET /.netlify/functions/form-watch?url=<encoded>   (Authorization: Bearer <GEMA-JWT>)
 *   → { ok, status, hash, etag, lastModified, size }
 *
 * Sicherheits-Review 2026-07 (S2/S3):
 *  - SSRF-Schutz mit DNS-Aufloesung: JEDER Hostname wird aufgeloest und jede
 *    IP gegen private/link-local/multicast-Bereiche geprueft (String-Muster
 *    allein liessen sich mit Dezimal-/Hex-IPs und DNS-Rebinding umgehen).
 *  - Redirects werden NICHT mehr blind verfolgt (redirect:'manual'); jedes
 *    Redirect-Ziel durchlaeuft erneut die volle Pruefung.
 *  - Endpoint nur noch fuer eingeloggte GEMA-User (JWT wie gema-auth.js) —
 *    Form-Watch ist eine Admin-Funktion, kein oeffentlicher Proxy.
 */
'use strict';
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { requireAuth } = require('./_jwt');

const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type, Authorization', 'Access-Control-Allow-Methods':'GET, OPTIONS' };
function resp(status, obj){ return { statusCode:status, headers:Object.assign({'Content-Type':'application/json','Cache-Control':'no-store'},CORS), body:JSON.stringify(obj) }; }

// ── SSRF-Schutz ──────────────────────────────────────────────────────────
function _isPrivateIp(ip){
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0]===10 || p[0]===127 || p[0]===0 ||
           (p[0]===192 && p[1]===168) || (p[0]===169 && p[1]===254) ||
           (p[0]===172 && p[1]>=16 && p[1]<=31) || p[0]>=224;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l==='::1' || l==='::' || l.indexOf('fc')===0 || l.indexOf('fd')===0 ||
           l.indexOf('fe80')===0 || l.indexOf('::ffff:')===0;
  }
  return true; // unbekanntes Format → blocken
}
// Hostname → alle IPs aufloesen; jede muss oeffentlich sein. Deckt auch
// nicht-literale Schreibweisen ab (http://2130706433 = 127.0.0.1 dezimal):
// dns.lookup normalisiert numerische Hosts, ohne echtes DNS zu fragen.
async function _resolvesPublic(hostname){
  let addrs;
  try { addrs = await dns.lookup(hostname, { all:true, verbatim:true }); }
  catch(e){ return false; }
  if (!addrs || !addrs.length) return false;
  return addrs.every(a => !_isPrivateIp(a.address));
}
async function _safeUrl(raw){
  let u;
  try { u = new URL(raw); } catch(e){ return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h || h==='localhost' || h.endsWith('.localhost') || h==='0.0.0.0') return null;
  // Literale IPs direkt pruefen ([::1] kommt ohne Klammern aus u.hostname)
  const bare = h.replace(/^\[|\]$/g, '');
  if (net.isIP(bare)) { if (_isPrivateIp(bare)) return null; return u.toString(); }
  if (!(await _resolvesPublic(bare))) return null;
  return u.toString();
}

// Redirects manuell folgen; jedes Ziel erneut komplett pruefen.
async function _probe(url){
  const ctrl = new AbortController();
  const to = setTimeout(function(){ ctrl.abort(); }, 12000);
  try {
    let cur = url;
    for (let i = 0; i < 4; i++) {
      const r = await fetch(cur, { method:'GET', redirect:'manual', signal:ctrl.signal, headers:{ 'User-Agent':'GEMA-FormWatch/1.0' } });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        let nextUrl;
        try { nextUrl = new URL(r.headers.get('location'), cur).toString(); }
        catch(e){ throw new Error('Ungueltiges Redirect-Ziel'); }
        const safe = await _safeUrl(nextUrl);
        if (!safe) throw new Error('Unsicheres Redirect-Ziel');
        cur = safe;
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      return {
        ok: r.ok, status: r.status, hash: hash, size: buf.length,
        etag: r.headers.get('etag') || '', lastModified: r.headers.get('last-modified') || '',
        contentType: r.headers.get('content-type') || ''
      };
    }
    throw new Error('Zu viele Redirects');
  } finally { clearTimeout(to); }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:CORS, body:'' };
  if (event.httpMethod !== 'GET') return resp(405, { ok:false, error:'Method not allowed' });
  if (!requireAuth(event)) return resp(401, { ok:false, error:'Nicht angemeldet' });
  const qs = event.queryStringParameters || {};
  const url = await _safeUrl(String(qs.url || ''));
  if (!url) return resp(400, { ok:false, error:'Ungültige oder nicht erlaubte URL' });
  try {
    const res = await _probe(url);
    if (!res.ok) return resp(200, { ok:false, status:res.status, error:'HTTP '+res.status });
    return resp(200, { ok:true, status:res.status, hash:res.hash, etag:res.etag, lastModified:res.lastModified, size:res.size, contentType:res.contentType });
  } catch(e) {
    return resp(200, { ok:false, error: (e && e.name==='AbortError') ? 'Zeitüberschreitung' : ('Nicht erreichbar: '+(e.message||String(e))) });
  }
};

// Gemeinsame Helfer für die geplante Variante (form-watch-cron.js haelt
// eigene Kopien — diese Exporte bleiben fuer Tests/Wiederverwendung)
exports._safeUrl = _safeUrl;
exports._probe = _probe;
exports._isPrivateIp = _isPrivateIp;
