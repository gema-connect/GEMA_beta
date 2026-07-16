/**
 * netlify/functions/form-watch-cron.js
 *
 * Geplante Function (Schedule in netlify.toml): prüft periodisch server-seitig
 * ALLE hinterlegten Behördenformular-URLs (bformdef:-Pool-Definitionen) und
 * meldet Änderungen dem GEMA-Admin — auch wenn niemand das Modul öffnet.
 *
 * Ablauf: Records via Service-Key laden → je sourceUrl den Inhalt hashen →
 * bei Abweichung vom gespeicherten sourceHash das Record markieren
 * (sourceChanged) + eine Notifikation für role_admin schreiben.
 *
 * ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY (wie rev-share.js / gema-auth.js).
 * Ohne Service-Key beendet sich die Function ohne Fehler (No-Op).
 */
'use strict';
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

const SB_URL = process.env.SUPABASE_URL || 'https://fjhbqjvaygvhievjgdtm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const TABLE = 'gema_data';
const MAX_URLS = 300;

function sbHeaders(extra){ const h = { 'apikey':SERVICE_KEY, 'Content-Type':'application/json' }; if (SERVICE_KEY.indexOf('eyJ')===0) h['Authorization']='Bearer '+SERVICE_KEY; return Object.assign(h, extra||{}); }
async function sb(pathQs, opts){ opts = opts||{}; const r = await fetch(SB_URL+'/rest/v1/'+pathQs, Object.assign({}, opts, { headers: sbHeaders(opts.headers) })); if(!r.ok){ const t=await r.text().catch(function(){return '';}); throw new Error('Supabase '+r.status+': '+t.slice(0,160)); } const txt = await r.text(); return txt?JSON.parse(txt):null; }
function q(s){ return encodeURIComponent(s); }

// SSRF-Schutz wie form-watch.js (Review S2): DNS-Aufloesung + manuelle
// Redirect-Verfolgung — die gespeicherten sourceUrls sind Nutzereingaben.
function _isPrivateIp(ip){
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0]===10 || p[0]===127 || p[0]===0 || (p[0]===192&&p[1]===168) || (p[0]===169&&p[1]===254) || (p[0]===172&&p[1]>=16&&p[1]<=31) || p[0]>=224;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l==='::1' || l==='::' || l.indexOf('fc')===0 || l.indexOf('fd')===0 || l.indexOf('fe80')===0 || l.indexOf('::ffff:')===0;
  }
  return true;
}
async function _resolvesPublic(hostname){
  let addrs;
  try { addrs = await dns.lookup(hostname, { all:true, verbatim:true }); } catch(e){ return false; }
  if (!addrs || !addrs.length) return false;
  return addrs.every(a => !_isPrivateIp(a.address));
}
async function _safeUrl(raw){
  let u; try{ u=new URL(raw); }catch(e){ return null; }
  if(u.protocol!=='http:'&&u.protocol!=='https:')return null;
  if(u.username||u.password)return null;
  const h=u.hostname.toLowerCase();
  if(!h||h==='localhost'||h.endsWith('.localhost')||h==='0.0.0.0')return null;
  const bare=h.replace(/^\[|\]$/g,'');
  if(net.isIP(bare)){ if(_isPrivateIp(bare))return null; return u.toString(); }
  if(!(await _resolvesPublic(bare)))return null;
  return u.toString();
}
async function _probe(url){
  const ctrl=new AbortController(); const to=setTimeout(function(){ctrl.abort();},12000);
  try{
    let cur=url;
    for(let i=0;i<4;i++){
      const r=await fetch(cur,{method:'GET',redirect:'manual',signal:ctrl.signal,headers:{'User-Agent':'GEMA-FormWatch/1.0'}});
      if(r.status>=300&&r.status<400&&r.headers.get('location')){
        let nextUrl;
        try{ nextUrl=new URL(r.headers.get('location'),cur).toString(); }catch(e){ throw new Error('Ungueltiges Redirect-Ziel'); }
        const safe=await _safeUrl(nextUrl);
        if(!safe)throw new Error('Unsicheres Redirect-Ziel');
        cur=safe; continue;
      }
      const buf=Buffer.from(await r.arrayBuffer());
      return { ok:r.ok, status:r.status, hash:crypto.createHash('sha256').update(buf).digest('hex'), etag:r.headers.get('etag')||'', lastModified:r.headers.get('last-modified')||'' };
    }
    throw new Error('Zu viele Redirects');
  } finally { clearTimeout(to); }
}

async function _putRecord(moduleKey, dataKey, data){
  await sb(TABLE+'?on_conflict=module_key%2Cdata_key', { method:'POST', headers:{ 'Prefer':'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ module_key:moduleKey, data_key:dataKey, payload:{ data:data, _lm:Date.now() } }]) });
}
async function _notifyAdmin(form){
  var id = 'notif_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  var n = { id:id, ts:new Date().toISOString(), eventKey:'behoerde_formular_geaendert',
    empfaengerRoleId:'role_admin', empfaengerOrgId:null, empfaengerUserId:null,
    modul:'behoerden_formulare', typ:'warnung',
    titel:'Behördenformular geändert', text:(form.name||form.titel||form.behoerde||'Formular')+': die Quelle unter der hinterlegten URL hat sich geändert.',
    link:'pm_behoerden_formulare.html'+(form.id?('?d='+form.id):''), objektId:'', gelesen:false, gelesenAt:null };
  await _putRecord('notify', 'notif:'+id, n);
}

exports.handler = async function () {
  if (!SERVICE_KEY) return { statusCode:200, body:JSON.stringify({ ok:false, skipped:'no service key' }) };
  let checked=0, changed=0, errors=0;
  try {
    const rows = await sb(TABLE+'?module_key=eq.behoerden_formulare&data_key=like.'+q('bformdef:')+'*&select=data_key,payload&limit='+MAX_URLS);
    for (let i=0; i<(rows||[]).length; i++){
      const form = (rows[i].payload && rows[i].payload.data) || null;
      if (!form) continue;
      if (!form.sourceUrl || !form.sourceHash) continue; // nur URLs mit gesetzter Baseline überwachen
      const url = await _safeUrl(form.sourceUrl || '');
      if (!url) continue;
      checked++;
      try {
        const res = await _probe(url);
        if (!res.ok) { errors++; continue; }
        form.sourceLastChecked = new Date().toISOString();
        if (res.hash !== form.sourceHash) {
          if (!form.sourceChanged) { // nur beim Übergang melden
            form.sourceChanged = true; form.sourceChangedAt = new Date().toISOString();
            form.sourceHashPrev = form.sourceHash; form.sourceHash = res.hash;
            form.sourceLastModified = res.lastModified || form.sourceLastModified;
            await _putRecord('behoerden_formulare', rows[i].data_key, form);
            await _notifyAdmin(form);
            changed++;
          } else {
            // schon markiert — nur Prüfzeit aktualisieren
            await _putRecord('behoerden_formulare', rows[i].data_key, form);
          }
        } else {
          await _putRecord('behoerden_formulare', rows[i].data_key, form);
        }
      } catch(e){ errors++; }
    }
    return { statusCode:200, body:JSON.stringify({ ok:true, checked:checked, changed:changed, errors:errors }) };
  } catch(e) {
    return { statusCode:200, body:JSON.stringify({ ok:false, error:(e.message||String(e)) }) };
  }
};
