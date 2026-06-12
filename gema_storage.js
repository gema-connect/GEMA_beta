/**
 * gema_storage.js — Bild-/Datei-Upload in Supabase Storage
 *
 * Statt Fotos als Base64 direkt im Datenbank-Record zu speichern (was die
 * Records riesig macht → Request-Groessenlimit, langsame Loads, localStorage-
 * Quota), laedt dieser Helper Bilder als echte Dateien in einen Supabase-
 * Storage-Bucket hoch und liefert eine oeffentliche URL zurueck. Im Record
 * steht dann nur noch die URL.
 *
 * SETUP (einmalig im Supabase-Dashboard noetig — kann der Client nicht):
 *   1. Storage → New bucket → Name: "gema-fotos" → Public bucket: AN
 *   2. Policies → fuer den Bucket eine INSERT-Policy fuer die Rolle "anon"
 *      anlegen (Upload erlauben). Public-Read ist durch den Public-Bucket
 *      schon gegeben.
 *
 * Solange der Bucket fehlt/falsch konfiguriert ist, schlaegt uploadDataUrl
 * fehl (reject) — die aufrufenden Module fallen dann auf Base64 zurueck.
 * Es geht also nichts kaputt, bevor der Bucket existiert.
 */
(function(w){
  'use strict';

  var BUCKET = 'gema-fotos';

  function _sb(){ return (typeof w.GemaSync !== 'undefined') ? w.GemaSync : null; }
  function isConfigured(){ var s=_sb(); return !!(s && s.SB_URL && s.SB_KEY); }

  function publicUrl(path){
    var s=_sb(); if(!s || !s.SB_URL) return null;
    return s.SB_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
  }

  // data:image/jpeg;base64,XXXX  →  { blob, ext }
  // Akzeptiert auch Zusatzparameter (data:image/png;charset=utf-8;base64,)
  // und Newlines im Base64-Teil ([\s\S] statt .).
  function _dataUrlToBlob(dataUrl){
    var m = /^data:([^;,]+)((?:;[^;,]+)*),([\s\S]*)$/.exec(dataUrl || '');
    if(!m) return null;
    var mime = m[1];
    var isB64 = /(^|;)base64$/i.test(m[2] || '') || /;base64(;|$)/i.test(m[2] || '');
    var data = isB64 ? m[3].replace(/\s+/g,'') : m[3];
    var bytes;
    try {
      if(isB64){
        var bin = atob(data);
        bytes = new Uint8Array(bin.length);
        for(var i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(data));
      }
    } catch(e){ return null; }
    var ext = mime.indexOf('png')>=0 ? 'png'
      : (mime.indexOf('webp')>=0 ? 'webp'
      : (mime.indexOf('gif')>=0 ? 'gif' : 'jpg'));
    return { blob: new Blob([bytes], { type: mime }), ext: ext, mime: mime };
  }

  function _rand(){ return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9); }

  // Prueft, ob die oeffentliche URL wirklich ladbar ist (Bucket public +
  // Policy ok). Bild-Load umgeht CORS-Restriktionen (anders als fetch).
  function _verifyLoadable(url){
    return new Promise(function(resolve){
      var done = false;
      var img = new Image();
      var t = setTimeout(function(){ if(!done){ done=true; resolve(false); } }, 9000);
      img.onload = function(){ if(!done){ done=true; clearTimeout(t); resolve(true); } };
      img.onerror = function(){ if(!done){ done=true; clearTimeout(t); resolve(false); } };
      img.src = url + (url.indexOf('?')>=0?'&':'?') + '_v=' + _rand();
    });
  }

  /**
   * Laedt ein Base64-Data-URL als Datei in den Bucket. Liefert
   * Promise<{ url, path }>. Reject bei Fehler (Bucket fehlt, Policy,
   * Netz, oder URL nicht ladbar) — der Aufrufer behaelt dann das Base64.
   *
   * pathHint: optionaler Pfad-Praefix (z.B. 'dach/<orgId>').
   */
  function uploadDataUrl(dataUrl, pathHint){
    var s=_sb();
    if(!s || !s.SB_URL || !s.SB_KEY) return Promise.reject(new Error('Storage nicht konfiguriert'));
    if(typeof dataUrl !== 'string' || dataUrl.indexOf('data:image') !== 0){
      return Promise.reject(new Error('Kein Bild-Data-URL'));
    }
    var parsed = _dataUrlToBlob(dataUrl);
    if(!parsed) return Promise.reject(new Error('Data-URL nicht lesbar'));
    // Groessen-Guard: schuetzt Bucket + Bandbreite vor Ausreissern.
    if(parsed.blob && parsed.blob.size > 12*1024*1024){
      return Promise.reject(new Error('Bild zu gross fuer Upload (max. 12 MB)'));
    }
    var prefix = (pathHint || 'misc').replace(/[^a-zA-Z0-9_\/-]/g,'').replace(/\/{2,}/g,'/').replace(/^\/+|\/+$/g,'');
    if(!prefix) prefix = 'misc'; // Hint bestand nur aus Sonderzeichen
    var path = prefix + '/' + _rand() + '.' + parsed.ext;
    var url = s.SB_URL + '/storage/v1/object/' + BUCKET + '/' + path;
    return fetch(url, {
      method: 'POST',
      headers: {
        'apikey': s.SB_KEY,
        'Authorization': 'Bearer ' + s.SB_KEY,
        'Content-Type': parsed.mime,
        'cache-control': 'max-age=3600'
      },
      body: parsed.blob
    }).then(function(r){
      if(!r.ok){
        // Supabase-Fehlertext mitliefern (z.B. {"error":"Bucket not found"}
        // oder RLS-Hinweis) — sonst sieht man nur den HTTP-Code.
        return r.text().then(function(t){
          var detail = '';
          try{ var j = JSON.parse(t); detail = j.message || j.error || j.msg || ''; }catch(e){ detail = (t||'').slice(0,200); }
          throw new Error('Upload HTTP ' + r.status + (detail ? ' — ' + detail : ''));
        }, function(){ throw new Error('Upload HTTP ' + r.status); });
      }
      var pub = publicUrl(path);
      return _verifyLoadable(pub).then(function(ok){
        if(!ok) throw new Error('Upload nicht oeffentlich ladbar (Bucket/Policy pruefen)');
        return { url: pub, path: path };
      });
    });
  }

  w.GemaStorage = {
    BUCKET: BUCKET,
    isConfigured: isConfigured,
    publicUrl: publicUrl,
    uploadDataUrl: uploadDataUrl
  };
})(window);
