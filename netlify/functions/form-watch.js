/**
 * netlify/functions/form-watch.js
 *
 * Prüft server-seitig, ob sich ein Behördenformular unter seiner URL geändert
 * hat (der Browser kann fremde URLs wegen CORS nicht laden). Lädt die URL,
 * bildet einen SHA-256-Hash des Inhalts und liefert zusätzlich ETag,
 * Last-Modified und Grösse. Der Client vergleicht mit dem gespeicherten Stand.
 *
 *   GET /.netlify/functions/form-watch?url=<encoded>
 *   → { ok, status, hash, etag, lastModified, size }
 */
'use strict';
const crypto = require('crypto');

const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Allow-Methods':'GET, OPTIONS' };
function resp(status, obj){ return { statusCode:status, headers:Object.assign({'Content-Type':'application/json','Cache-Control':'no-store'},CORS), body:JSON.stringify(obj) }; }

// Einfacher SSRF-Schutz: nur http/https, keine internen Hosts.
function _safeUrl(raw){
  let u;
  try { u = new URL(raw); } catch(e){ return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase();
  if (h==='localhost' || h==='::1' || h==='0.0.0.0') return null;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return null;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return null;
  return u.toString();
}

async function _probe(url){
  const ctrl = new AbortController();
  const to = setTimeout(function(){ ctrl.abort(); }, 12000);
  try {
    const r = await fetch(url, { method:'GET', redirect:'follow', signal:ctrl.signal, headers:{ 'User-Agent':'GEMA-FormWatch/1.0' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    return {
      ok: r.ok, status: r.status, hash: hash, size: buf.length,
      etag: r.headers.get('etag') || '', lastModified: r.headers.get('last-modified') || '',
      contentType: r.headers.get('content-type') || ''
    };
  } finally { clearTimeout(to); }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:CORS, body:'' };
  if (event.httpMethod !== 'GET') return resp(405, { ok:false, error:'Method not allowed' });
  const qs = event.queryStringParameters || {};
  const url = _safeUrl(String(qs.url || ''));
  if (!url) return resp(400, { ok:false, error:'Ungültige oder nicht erlaubte URL' });
  try {
    const res = await _probe(url);
    if (!res.ok) return resp(200, { ok:false, status:res.status, error:'HTTP '+res.status });
    return resp(200, { ok:true, status:res.status, hash:res.hash, etag:res.etag, lastModified:res.lastModified, size:res.size, contentType:res.contentType });
  } catch(e) {
    return resp(200, { ok:false, error: (e && e.name==='AbortError') ? 'Zeitüberschreitung' : ('Nicht erreichbar: '+(e.message||String(e))) });
  }
};

// Gemeinsame Helfer für die geplante Variante (form-watch-cron.js)
exports._safeUrl = _safeUrl;
exports._probe = _probe;
