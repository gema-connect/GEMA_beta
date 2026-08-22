/**
 * gema_storage.js — Bild-/Datei-Upload in Supabase Storage
 *
 * Statt Fotos als Base64 direkt im Datenbank-Record zu speichern (was die
 * Records riesig macht → Request-Groessenlimit, langsame Loads, localStorage-
 * Quota), laedt dieser Helper Bilder als echte Dateien in einen Supabase-
 * Storage-Bucket hoch und liefert eine oeffentliche URL zurueck. Im Record
 * steht dann nur noch die URL.
 *
 * Akzeptiert Bilder (data:image/*) UND PDFs (data:application/pdf) —
 * letztere fuer Lieferanten-Offerten (sys_lieferant_dashboard.html).
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
    var ext = mime.indexOf('pdf')>=0 ? 'pdf'
      : (mime.indexOf('png')>=0 ? 'png'
      : (mime.indexOf('webp')>=0 ? 'webp'
      : (mime.indexOf('gif')>=0 ? 'gif' : 'jpg')));
    return { blob: new Blob([bytes], { type: mime }), ext: ext, mime: mime };
  }

  function _rand(){ return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9); }

  // Verifikation fuer Nicht-Bilder (PDF): HEAD-Request auf die Public-URL.
  // Supabase-Storage liefert fuer Public-Buckets CORS-Header (*), damit
  // klappt fetch. Fallback GET mit Range, falls HEAD blockiert ist.
  function _verifyFetchable(url){
    return fetch(url, { method:'HEAD' }).then(function(r){
      if(r.ok) return true;
      return fetch(url, { method:'GET', headers:{ 'Range':'bytes=0-0' } })
        .then(function(r2){ return r2.ok; }, function(){ return false; });
    }, function(){
      return fetch(url, { method:'GET', headers:{ 'Range':'bytes=0-0' } })
        .then(function(r2){ return r2.ok; }, function(){ return false; });
    });
  }

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
  function uploadDataUrl(dataUrl, pathHint, opts){
    var isImage = typeof dataUrl === 'string' && dataUrl.indexOf('data:image') === 0;
    var isPdf   = typeof dataUrl === 'string' && dataUrl.indexOf('data:application/pdf') === 0;
    if(!isImage && !isPdf){
      return Promise.reject(new Error('Kein Bild-/PDF-Data-URL'));
    }
    var parsed = _dataUrlToBlob(dataUrl);
    if(!parsed) return Promise.reject(new Error('Data-URL nicht lesbar'));
    return _uploadBlob(parsed.blob, parsed.ext, parsed.mime, pathHint, opts);
  }

  /**
   * Laedt eine DATEI (File/Blob) direkt in den Bucket — ohne den
   * Base64-Umweg von uploadDataUrl. Liefert Promise<{url, path}>.
   *
   * KRITISCH fuer grosse Dateien: uploadDataUrl liest die Datei erst als
   * Data-URL ein (Base64 ist ~33 % groesser), dekodiert sie mit atob in
   * einen String und kopiert sie Byte fuer Byte in ein Uint8Array. Ein
   * 7-MB-PDF belegt so kurzzeitig gegen 30 MB und braucht auf einem
   * Tablet spuerbar Zeit — auf mobilem Safari reicht das, damit der
   * Upload scheitert oder der Nutzer laengst aufgegeben hat. Eine File
   * IST bereits ein Blob und kann unveraendert gesendet werden.
   *
   * opts.onProgress(pct, geladen, total) — nur hier verfuegbar (XHR);
   * fetch kennt keinen Upload-Fortschritt.
   * opts.maxMb — Groessen-Guard (Default 12).
   */
  function uploadFile(file, pathHint, opts){
    if(!file || typeof file.size !== 'number') return Promise.reject(new Error('Keine Datei'));
    var mime = file.type || 'application/octet-stream';
    var ext = _extFor(mime, file.name);
    return _uploadBlob(file, ext, mime, pathHint, opts);
  }

  function _extFor(mime, name){
    mime = String(mime||'');
    if(mime.indexOf('pdf')>=0) return 'pdf';
    if(mime.indexOf('png')>=0) return 'png';
    if(mime.indexOf('webp')>=0) return 'webp';
    if(mime.indexOf('gif')>=0) return 'gif';
    if(mime.indexOf('image/')===0) return 'jpg';
    var m = /\.([a-zA-Z0-9]{1,5})$/.exec(String(name||''));
    return m ? m[1].toLowerCase() : 'bin';
  }

  // Gemeinsamer Kern von uploadDataUrl und uploadFile.
  function _uploadBlob(blob, ext, mime, pathHint, opts){
    opts = opts || {};
    var s=_sb();
    if(!s || !s.SB_URL || !s.SB_KEY) return Promise.reject(new Error('Storage nicht konfiguriert'));
    if(!blob) return Promise.reject(new Error('Keine Daten'));
    // Groessen-Guard: schuetzt Bucket + Bandbreite vor Ausreissern.
    var maxMb = opts.maxMb || 12;
    if(blob.size > maxMb*1024*1024){
      return Promise.reject(new Error('Datei zu gross fuer Upload (max. ' + maxMb + ' MB)'));
    }
    var prefix = (pathHint || 'misc').replace(/[^a-zA-Z0-9_\/-]/g,'').replace(/\/{2,}/g,'/').replace(/^\/+|\/+$/g,'');
    if(!prefix) prefix = 'misc'; // Hint bestand nur aus Sonderzeichen
    var path = prefix + '/' + _rand() + '.' + ext;
    var url = s.SB_URL + '/storage/v1/object/' + BUCKET + '/' + path;
    var tok = (s.getAuthToken && s.getAuthToken()) || s.SB_KEY;
    var isPdf = String(mime).indexOf('pdf') >= 0;

    return new Promise(function(resolve, reject){
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('apikey', s.SB_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
      xhr.setRequestHeader('Content-Type', mime);
      xhr.setRequestHeader('cache-control', 'max-age=3600');
      if(xhr.upload && typeof opts.onProgress === 'function'){
        xhr.upload.onprogress = function(ev){
          if(ev.lengthComputable){
            var pct = Math.max(0, Math.min(100, Math.round(ev.loaded/ev.total*100)));
            try{ opts.onProgress(pct, ev.loaded, ev.total); }catch(e){}
          }
        };
      }
      xhr.onload = function(){
        if(xhr.status >= 200 && xhr.status < 300){ resolve(true); return; }
        // Supabase-Fehlertext mitliefern (z.B. {"error":"Bucket not found"}
        // oder RLS-Hinweis) — sonst sieht man nur den HTTP-Code.
        var detail = '';
        try{ var j = JSON.parse(xhr.responseText||''); detail = j.message || j.error || j.msg || ''; }
        catch(e){ detail = (xhr.responseText||'').slice(0,200); }
        // Das Groessenlimit setzt der Bucket im Supabase-Dashboard — der
        // Klartext hilft mehr als «HTTP 413».
        if(xhr.status === 413 || /exceeded|maximum allowed size|too large|payload/i.test(detail)){
          reject(new Error('Datei zu gross fuer den Bucket — Limit im Supabase-Dashboard (Storage → gema-fotos → Settings) erhoehen.'));
          return;
        }
        reject(new Error('Upload HTTP ' + xhr.status + (detail ? ' — ' + detail : '')));
      };
      xhr.onerror = function(){ reject(new Error('Upload fehlgeschlagen (Netzwerk)')); };
      xhr.onabort = function(){ reject(new Error('Upload abgebrochen')); };
      if(typeof opts.onXhr === 'function'){ try{ opts.onXhr(xhr); }catch(e){} }
      xhr.send(blob);
    }).then(function(){
      // Fortschritt steht bei 100 %, aber die Datei muss auch wirklich
      // oeffentlich ladbar sein (Bucket public + Policy).
      if(typeof opts.onProgress === 'function'){ try{ opts.onProgress(100, blob.size, blob.size); }catch(e){} }
      var pub = publicUrl(path);
      var verify = isPdf ? _verifyFetchable(pub) : _verifyLoadable(pub);
      return verify.then(function(ok){
        if(!ok) throw new Error('Upload nicht oeffentlich ladbar (Bucket/Policy pruefen)');
        return { url: pub, path: path };
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // LOESCHEN — Dateien eines Datensatzes mit entfernen
  // ═══════════════════════════════════════════════════════════════
  // Wird ein Datensatz geloescht (Schadensbericht, Dachbericht …), muessen
  // auch seine hochgeladenen Bilder weg — sonst bleiben sie fuer immer im
  // Bucket liegen: unsichtbar fuer die App, aber Speicherplatz kostend.
  // Der Browser darf per RLS bewusst nicht loeschen (nur INSERT+SELECT auf
  // dem Bucket); das erledigt die Netlify-Function /api/storage-delete mit
  // dem Service-Key (JWT-gated, nur im Ordner der eigenen Firma).

  var DEL_FN = '/api/storage-delete';
  var PUB_MARKER = '/storage/v1/object/public/' + BUCKET + '/';

  function _esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /**
   * Storage-Pfad aus einer oeffentlichen URL. Erkennt auch den
   * Same-Origin-Proxy-Weg (/sb/storage/v1/object/public/…), auf den
   * gema_sync.js umschaltet, wenn supabase.co blockiert ist.
   * Liefert null, wenn die URL nicht auf unseren Bucket zeigt.
   */
  function pathFromUrl(url){
    if(typeof url !== 'string') return null;
    var i = url.indexOf(PUB_MARKER);
    if(i < 0) return null;
    var p = url.slice(i + PUB_MARKER.length).split('?')[0].split('#')[0];
    try{ p = decodeURIComponent(p); }catch(e){}
    return p || null;
  }

  /**
   * Sammelt ALLE Storage-Dateien eines Datensatzes — rekursiv ueber das
   * ganze Objekt. Bewusst generisch statt Feld fuer Feld: die Foto-Felder
   * heissen je nach Modul anders (foto.url, bilder[].url, m.foto, bildUrl,
   * beleg.url, pdfUrl …) und kommen laufend dazu. Was wie eine Bucket-URL
   * aussieht, wird gefunden — auch in kuenftigen Feldern.
   *
   * Liefert [{ path, url, label, ext }] (nach Pfad dedupliziert).
   * Base64-Fotos (dataUrl) sind NICHT enthalten — die stecken im Record
   * selbst und verschwinden mit ihm.
   */
  function collectFiles(rec){
    var out = [], seen = {};
    function beschriftung(o){
      if(!o || typeof o !== 'object') return '';
      return String(o.kommentar || o.name || o.titel || o.bez || o.bezeichnung || o.dateiname || '').trim();
    }
    function walk(v, label, tiefe){
      if(v == null || tiefe > 14) return;
      if(typeof v === 'string'){
        var p = pathFromUrl(v);
        if(p && !seen[p]){
          seen[p] = 1;
          var m = /\.([a-zA-Z0-9]{1,5})$/.exec(p);
          out.push({ path: p, url: v, label: label || '', ext: m ? m[1].toLowerCase() : 'dat' });
        }
        return;
      }
      if(Array.isArray(v)){
        for(var i = 0; i < v.length; i++) walk(v[i], label, tiefe + 1);
        return;
      }
      if(typeof v === 'object'){
        var eigen = beschriftung(v) || label;
        for(var k in v){ if(Object.prototype.hasOwnProperty.call(v, k)) walk(v[k], eigen, tiefe + 1); }
      }
    }
    walk(rec, '', 0);
    return out;
  }

  /**
   * Loescht die uebergebenen Dateien (Objekte aus collectFiles ODER reine
   * Pfad-Strings). Wirft NIE — Loeschen ist best-effort: der Datensatz ist
   * zu diesem Zeitpunkt bereits weg, ein Fehlschlag darf den Ablauf nicht
   * abbrechen (es bleibt dann eine Datei-Leiche liegen, mehr nicht).
   * Liefert { ok, geloescht, fehler }.
   */
  function deleteFiles(files){
    var paths = (files || []).map(function(f){
      return typeof f === 'string' ? (pathFromUrl(f) || f) : (f && f.path);
    }).filter(Boolean);
    if(!paths.length) return Promise.resolve({ ok:true, geloescht:0 });
    var s = _sb();
    var tok = (s && s.getAuthToken && s.getAuthToken()) || '';
    var h = { 'Content-Type':'application/json' };
    if(tok) h['Authorization'] = 'Bearer ' + tok;
    return fetch(DEL_FN, { method:'POST', headers:h, body: JSON.stringify({ paths: paths }) })
      .then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(j){
          if(!r.ok) return { ok:false, geloescht:0, fehler:(j && j.error) || ('HTTP ' + r.status) };
          return { ok:true, geloescht: (j && j.geloescht) || 0 };
        });
      })
      .catch(function(e){ return { ok:false, geloescht:0, fehler:(e && e.message) || 'Netzwerkfehler' }; });
  }

  // ── ZIP-Export (STORE, ohne externe Library) ────────────────────
  // Bilder sind bereits komprimiert (JPEG/PNG) — Deflate braeuchte eine
  // CDN-Library und braechte praktisch nichts. Ein STORE-ZIP ist ein paar
  // Zeilen, laeuft offline und oeffnet in jedem Betriebssystem.
  var _crcTab = null;
  function _crcTable(){
    if(_crcTab) return _crcTab;
    var t = new Uint32Array(256);
    for(var n = 0; n < 256; n++){
      var c = n;
      for(var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    _crcTab = t; return t;
  }
  function _crc32(buf){
    var t = _crcTable(), c = 0xFFFFFFFF;
    for(var i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function _zipBlob(entries){
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    entries.forEach(function(e){
      var nb = enc.encode(e.name), crc = _crc32(e.bytes), len = e.bytes.length;
      var lh = new Uint8Array(30 + nb.length), dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true);                 // UTF-8-Dateinamen
      dv.setUint16(8, 0, true);                      // STORE
      dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, len, true); dv.setUint32(22, len, true);
      dv.setUint16(26, nb.length, true); dv.setUint16(28, 0, true);
      lh.set(nb, 30);
      parts.push(lh, e.bytes);
      var ch = new Uint8Array(46 + nb.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, len, true); cv.setUint32(24, len, true);
      cv.setUint16(28, nb.length, true); cv.setUint32(42, offset, true);
      ch.set(nb, 46);
      central.push(ch);
      offset += lh.length + len;
    });
    var cdSize = central.reduce(function(a, c){ return a + c.length; }, 0);
    var eo = new Uint8Array(22), ev = new DataView(eo.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [eo]), { type:'application/zip' });
  }
  function _safeName(s){
    return String(s || '').replace(/[^\wÀ-ſ .\-]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  /**
   * Laedt die Dateien herunter und bietet sie als EIN ZIP zum Speichern an.
   * onProgress(fertig, total) fuer eine Fortschrittsanzeige.
   * Liefert { ok, dabei, fehlend }.
   */
  function zipDownload(files, zipName, onProgress){
    var list = (files || []).filter(function(f){ return f && f.url; });
    if(!list.length) return Promise.resolve({ ok:false, dabei:0, fehlend:0 });
    var fertig = 0, entries = [], fehlend = 0;
    if(onProgress) onProgress(0, list.length);
    return list.reduce(function(kette, f, i){
      return kette.then(function(){
        return fetch(f.url).then(function(r){
          if(!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        }).then(function(buf){
          var nr = String(i + 1).padStart(2, '0');
          var basis = _safeName(f.label) || 'datei';
          entries.push({ name: nr + '_' + basis + '.' + (f.ext || 'dat'), bytes: new Uint8Array(buf) });
        }).catch(function(){ fehlend++; }).then(function(){
          fertig++; if(onProgress) onProgress(fertig, list.length);
        });
      });
    }, Promise.resolve()).then(function(){
      if(!entries.length) return { ok:false, dabei:0, fehlend: fehlend };
      var blob = _zipBlob(entries);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (_safeName(zipName) || 'GEMA-Dateien') + '.zip';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      return { ok:true, dabei: entries.length, fehlend: fehlend };
    });
  }

  /**
   * Bietet mehrere TEXT-Dateien (z. B. CSV-Tabellen) als EIN ZIP an —
   * ohne Bibliothek, ohne Netz, ueber denselben STORE-Schreiber wie
   * zipDownload (eine Wahrheit). dateien = [{name, text}].
   * Liefert true, wenn der Download angestossen wurde.
   */
  function zipTexte(dateien, zipName){
    var enc = new TextEncoder();
    var entries = (dateien || [])
      .filter(function(d){ return d && d.name; })
      .map(function(d){ return { name: d.name, bytes: enc.encode(String(d.text == null ? '' : d.text)) }; });
    if(!entries.length) return false;
    var blob = _zipBlob(entries);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (_safeName(zipName) || 'GEMA-Export') + '.zip';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return true;
  }

  /**
   * Bestaetigungs-Dialog vor dem Loeschen eines Datensatzes: nennt die
   * Anzahl der zugehoerigen Dateien, listet sie auf und bietet an, sie
   * vorher als ZIP zu sichern. Muster wie die Objekt-Loeschung in
   * pm_objekte (GemaDialog mit html:true).
   *
   * opts: { files, title, message, confirmLabel, zipName }
   * Liefert Promise<bool> — true = loeschen. Die Dateien loescht der
   * Aufrufer danach selbst mit deleteFiles(files) (erst den Datensatz).
   */
  var _zipPending = null;
  function confirmDelete(opts){
    opts = opts || {};
    var files = opts.files || [];
    var n = files.length;
    var msg = '<div style="margin-bottom:' + (n ? '12px' : '0') + '">' + _esc(opts.message || 'Wirklich löschen?') + '</div>';
    if(n){
      _zipPending = { files: files, name: opts.zipName || 'GEMA-Dateien' };
      var bilder = files.filter(function(f){ return ['jpg','jpeg','png','webp','gif'].indexOf(f.ext) >= 0; }).length;
      var wort = n === 1 ? (bilder ? 'Foto' : 'Datei') : (bilder === n ? 'Fotos' : 'Dateien');
      var liste = files.slice(0, 8).map(function(f, i){
        var ic = ['jpg','jpeg','png','webp','gif'].indexOf(f.ext) >= 0 ? '🖼' : (f.ext === 'pdf' ? '📄' : '📎');
        return '<li style="margin:2px 0">' + ic + ' ' + _esc(f.label || ('Datei ' + (i + 1)))
             + ' <span style="opacity:.6">· ' + _esc(f.ext.toUpperCase()) + '</span></li>';
      }).join('');
      if(n > 8) liste += '<li style="margin:2px 0;opacity:.7">… und ' + (n - 8) + ' weitere</li>';
      msg += '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:11px 13px;font-size:13.5px;color:#92400e">'
           + '<div style="font-weight:700;margin-bottom:6px">' + n + ' ' + wort + ' werden mitgelöscht</div>'
           + '<ul style="margin:0 0 10px;padding-left:18px;max-height:170px;overflow:auto">' + liste + '</ul>'
           + '<button type="button" id="gsZipBtn" onclick="GemaStorage._zipFromDialog(this)" '
           + 'style="border:1px solid #92400e;background:#fff;color:#92400e;border-radius:6px;'
           + 'padding:6px 12px;font:600 12.5px/1.2 inherit;cursor:pointer">⬇ Vorher als ZIP herunterladen</button>'
           + '</div>';
    }
    return GemaDialog.confirm({
      title: opts.title || 'Löschen',
      message: msg,
      html: true,
      confirmLabel: opts.confirmLabel || (n ? 'Löschen (inkl. ' + n + ')' : 'Löschen'),
      danger: true
    }).then(function(ok){ _zipPending = null; return !!ok; });
  }
  // Handler des ZIP-Buttons im Dialog (der Dialog bleibt dabei offen).
  function _zipFromDialog(btn){
    if(!_zipPending || !btn) return;
    var orig = btn.textContent;
    btn.disabled = true;
    zipDownload(_zipPending.files, _zipPending.name, function(f, t){
      btn.textContent = 'Lade ' + f + ' / ' + t + ' …';
    }).then(function(res){
      btn.textContent = res.ok
        ? ('✓ Heruntergeladen' + (res.fehlend ? ' (' + res.fehlend + ' nicht erreichbar)' : ''))
        : '✕ Download fehlgeschlagen';
      setTimeout(function(){ if(btn.isConnected){ btn.textContent = orig; btn.disabled = false; } }, 3500);
    });
  }

  w.GemaStorage = {
    BUCKET: BUCKET,
    isConfigured: isConfigured,
    publicUrl: publicUrl,
    uploadDataUrl: uploadDataUrl,
    pathFromUrl: pathFromUrl,
    collectFiles: collectFiles,
    deleteFiles: deleteFiles,
    zipDownload: zipDownload,
    zipTexte: zipTexte,
    confirmDelete: confirmDelete,
    _zipFromDialog: _zipFromDialog
  };
})(window);
