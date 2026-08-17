/**
 * gema_nfc_scanner.js — Zentraler NFC- und QR-Scanner-Helper
 *
 * Web-NFC steht nur auf Android Chrome zur Verfuegung ('NDEFReader' in window).
 * Auf iPhone Safari und Desktop ist NFC im Browser nicht moeglich — der
 * Helper faellt automatisch auf den QR-Scanner aus gema_qr_scanner.js
 * zurueck (Kamera + html5-qrcode).
 *
 * iPhone-Hinweis: iOS scannt NFC-Tags via Hintergrund-Erkennung der
 * Camera-App. Wenn der Tag eine URL enthaelt (was bei uns der Fall ist,
 * z.B. 'if_trocknung.html?id=tg_xxx'), oeffnet Safari die Seite
 * automatisch. Im Browser-Kontext (Modal) ist die direkte NFC-Lese-API
 * aber nicht verfuegbar — dort steht der QR-Fallback bereit.
 *
 * QR IST AUF ANDROID IMMER ERREICHBAR (KRITISCH): 'auto' waehlt dort
 * zwangslaeufig NFC, weil NDEFReader vorhanden ist. Nicht jedes Geraet
 * traegt aber einen NFC-Tag — viele haben nur die gedruckte QR-Etikette.
 * Darum blendet der NFC-Modus IMMER den Umschalter «📷 Stattdessen
 * QR-Code scannen» ein (siehe _startNfc). Wer die Wahl schon in der
 * Oberflaeche anbietet, ruft direkt mit mode:'qr' bzw. mode:'nfc' auf.
 *
 * Verwendung:
 *   GemaNFC.scan({
 *     mode: 'auto'|'nfc'|'qr',   // default 'auto' (NFC wenn moeglich,
 *                                //  mit Umschalter auf QR im Overlay)
 *     statusEl: HTMLElement,     // optional: Element fuer Status-Text
 *     onScan: function(payload),  // bekommt String (URL oder QR-Inhalt)
 *     onError: function(err)
 *   });
 *   GemaNFC.stop();
 *
 * Plus Helper:
 *   GemaNFC.parseTgUrl(payload) → 'tg_xxx' aus URL oder String, oder null
 */
(function(w){
  'use strict';

  // EIN persistenter NDEFReader mit EINEM scan()-Aufruf pro Seite; die
  // Sessions tauschen nur den aktiven Handler (_state.handler). Frueher
  // erzeugte jeder scan()-Aufruf einen neuen Reader und stop() rief eine
  // NICHT existierende API (NDEFReader hat kein .stop()) — die Reader
  // lauschten ewig weiter, stapelten sich und wedgten den Chrome-NFC-Stack
  // auf Android (Haenger). Handler weg = Session zu; der Reader bleibt.
  var _state = { nodes: [], statusEl: null, handler: null, scanPromise: null };

  // Eingehaengte Overlay-Knoten merken, damit stop() ALLE wieder abraeumt
  // (Banner, «NFC beenden», «Stattdessen QR» — frueher nur die ersten zwei;
  // ein vergessener Knopf blieb als Geist auf der Seite stehen).
  function _addNode(el){ document.body.appendChild(el); _state.nodes.push(el); return el; }

  function _ensureReader(){
    if(!_state.scanPromise){
      _state.scanPromise = (function(){
        var r = new NDEFReader();
        return r.scan().then(function(){
          r.addEventListener('reading', function(ev){
            if(_state.handler) _state.handler(ev);
          });
        });
      })().catch(function(e){
        _state.scanPromise = null; // Fehlstart: spaeterer Versuch darf neu starten
        throw e;
      });
    }
    return _state.scanPromise;
  }

  function isAvailable(){
    return typeof window !== 'undefined' && 'NDEFReader' in window;
  }
  function isIos(){
    if(typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent || '');
  }

  // Extrahiert die Geraete-ID aus einer NFC/QR-Payload. Akzeptiert:
  //   - vollstaendige URLs mit ?id=tg_xxx, ?scan=tg_xxx oder ?view=tg_xxx
  //   - 'GEMA:WZ:xxx'-Format vom QR-Scanner (gibt 'xxx' zurueck)
  //   - direkte tg_xxx-Strings
  // Liefert die ID oder null wenn nichts erkannt wird.
  function parseTgUrl(payload){
    if(!payload) return null;
    payload = String(payload).trim();
    // GEMA:WZ:xxx (Werkzeug-QR) — gibt rohe ID zurueck
    if(payload.indexOf('GEMA:') === 0){
      var parts = payload.split(':');
      if(parts.length >= 3) return parts.slice(2).join(':');
    }
    // URL mit Query-Param
    try{
      var u = new URL(payload, (typeof location !== 'undefined' ? location.href : 'http://x/'));
      var p = u.searchParams.get('id') || u.searchParams.get('scan') || u.searchParams.get('view');
      if(p) return p;
    }catch(e){
      // payload ist keine valide URL — direkt als ID versuchen
    }
    // Direkter tg_-ID-String
    if(/^tg_[A-Za-z0-9_-]+$/.test(payload)) return payload;
    // Anderer Direkt-ID-String (z.B. wz_, fz_)
    if(/^[a-z]{2,5}_[A-Za-z0-9_-]+$/.test(payload)) return payload;
    return null;
  }

  function _setStatus(text, color){
    if(!_state.statusEl) return;
    _state.statusEl.textContent = text || '';
    if(color) _state.statusEl.style.color = color;
  }

  // Stop alle aktiven Scan-Modi (NFC-Session = Handler entfernen; der
  // persistente Reader bleibt bewusst bestehen — kein abort-Churn)
  function stop(){
    _state.handler = null;
    _state.nodes.forEach(function(el){ try{ el.remove(); }catch(e){} });
    _state.nodes = [];
    // Auch GemaQR sicher stoppen (falls aktiv)
    try{ if(w.GemaQR && w.GemaQR.stop) w.GemaQR.stop(); }catch(e){}
  }

  function _startNfc(opts){
    _state.statusEl = opts.statusEl || null;
    _setStatus('📡 NFC-Tag jetzt scannen …', '#1d4ed8');

    // Schwebendes Banner unten — wie _wzSammelScanNFC in if_werkzeug.html
    var overlay = document.createElement('div');
    overlay.id = 'gemaNfcStatus';
    overlay.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
      + 'background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;'
      + 'font-weight:700;z-index:11000;box-shadow:0 4px 16px rgba(0,0,0,.2);font-family:DM Sans,system-ui,sans-serif';
    overlay.textContent = '📡 NFC-Tag jetzt scannen …';
    _addNode(overlay);

    // Umschalter auf die Kamera — der WICHTIGE Ausweg auf Android:
    // dort existiert NDEFReader immer, 'auto' entscheidet sich also IMMER
    // fuer NFC. Ohne diesen Knopf kaeme man an einem Geraet, das nur eine
    // gedruckte QR-Etikette traegt (kein NFC-Tag), gar nicht mehr zum
    // Scanner. Steht VOR «NFC beenden», weil er die haeufigere Absicht ist.
    if(w.GemaQR && w.GemaQR.scan){
      var qrBtn = document.createElement('button');
      qrBtn.id = 'gemaNfcToQr';
      qrBtn.textContent = '📷 Stattdessen QR-Code scannen';
      qrBtn.style.cssText = 'position:fixed;bottom:176px;left:50%;transform:translateX(-50%);'
        + 'background:#1e3a5f;color:#fff;border:2px solid #1e3a5f;padding:9px 20px;border-radius:10px;'
        + 'font-size:13px;font-weight:800;z-index:11000;cursor:pointer;min-height:44px;'
        + 'font-family:DM Sans,system-ui,sans-serif';
      qrBtn.onclick = function(){
        var o = opts;            // stop() raeumt die Knoten ab, opts bleibt
        stop();
        _startQr(o);
      };
      _addNode(qrBtn);
    }

    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'NFC beenden';
    closeBtn.style.cssText = 'position:fixed;bottom:130px;left:50%;transform:translateX(-50%);'
      + 'background:#fff;color:#1d4ed8;border:2px solid #1d4ed8;padding:8px 20px;border-radius:10px;'
      + 'font-size:13px;font-weight:700;z-index:11000;cursor:pointer;min-height:40px;'
      + 'font-family:DM Sans,system-ui,sans-serif';
    closeBtn.onclick = function(){ stop(); };
    _addNode(closeBtn);

    try{
      // Session-Handler setzen — die erste gueltige Lesung beendet die
      // Session sofort (Single-shot; verhindert Doppel-Fires desselben Taps)
      _state.handler = function(ev){
        var payload = '';
        try{
          ev.message.records.forEach(function(r){
            if(r.recordType === 'url' || r.recordType === 'text'){
              payload = new TextDecoder().decode(r.data);
            }
          });
        }catch(e){}
        if(payload){
          _state.handler = null;
          overlay.textContent = '✅ Gescannt!';
          overlay.style.background = '#15803d';
          if(navigator.vibrate) try{ navigator.vibrate(100); }catch(e){}
          try{ if(opts.onScan) opts.onScan(payload); }catch(e){ if(opts.onError) opts.onError(e); }
          // Nach kurzer Anzeige Overlay schliessen — neuer Scan kann
          // bei Bedarf erneut gestartet werden (Single-shot Verhalten)
          setTimeout(stop, 700);
        }
      };
      _ensureReader().catch(function(err){
        stop();
        if(opts.onError) opts.onError(err);
        else if(typeof alert === 'function') alert('NFC-Fehler: ' + (err && err.message || err));
      });
    }catch(err){
      stop();
      if(opts.onError) opts.onError(err);
    }
  }

  function _startQr(opts){
    if(typeof w.GemaQR === 'undefined' || !w.GemaQR.scan){
      var msg = 'QR-Scanner nicht geladen (gema_qr_scanner.js fehlt).';
      if(opts.onError) opts.onError(new Error(msg));
      else if(typeof alert === 'function') alert(msg);
      return;
    }
    _setStatus('📷 QR-Code scannen …', '#1d4ed8');
    w.GemaQR.scan(function(code){
      if(navigator.vibrate) try{ navigator.vibrate(100); }catch(e){}
      _setStatus('✅ Gescannt!', '#15803d');
      try{ if(opts.onScan) opts.onScan(code); }catch(e){ if(opts.onError) opts.onError(e); }
    });
  }

  function scan(opts){
    opts = opts || {};
    var mode = opts.mode || 'auto';
    if(mode === 'auto') mode = isAvailable() ? 'nfc' : 'qr';
    if(mode === 'nfc'){
      if(!isAvailable()){
        // Hard-Fallback: User hat explizit NFC angefragt, aber Browser
        // unterstuetzt es nicht → QR statt nichts.
        return _startQr(opts);
      }
      return _startNfc(opts);
    }
    return _startQr(opts);
  }

  w.GemaNFC = {
    isAvailable: isAvailable,
    isIos: isIos,
    parseTgUrl: parseTgUrl,
    scan: scan,
    stop: stop
  };

})(window);
