/**
 * gema_card.js — geteilte Client-Logik der GEMA Card
 * ═══════════════════════════════════════════════════════════════════════
 * Referenz: UMSETZUNG_GEMA_Card.md §4.2
 *
 * Genutzt von sys_card_editor.html, sys_kontakte.html,
 * sys_card_reports.html und dem Beteiligten-Widget in pm_objekte.html.
 * Die oeffentliche Seite sys_card.html bringt ihre Logik BEWUSST selbst
 * mit — sie soll ohne jede zusaetzliche Datei in unter 1 s stehen.
 *
 * window.GemaCard = {
 *   api, apiPublic,            Function-Aufrufe (mit/ohne Token)
 *   kartenUrl, vcardUrl, fotoUrl,
 *   qr, qrDataUrl,             QR-Code (qrcodejs, lazy vom CDN)
 *   slugAusScan,               Slug aus einem gescannten Code
 *   bildVerkleinern,           Canvas-Resize → {gross, klein}
 *   nfcSchreiben, nfcMoeglich,
 *   teilen, kopieren,
 *   merkeSlug, meinSlug        lokaler Merker fuer sys_card.html
 * }
 */
(function (w) {
  'use strict';

  var QR_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  var LS_MINE = 'gema_card_mine_v1';

  /* ── Function-Aufrufe ──────────────────────────────────────────────── */
  // /api/-Redirect zuerst; ist die Route (noch) nicht deployed, auf den
  // Functions-Pfad ausweichen — Muster sys_goodel_ansicht.html.
  function token() {
    try {
      if (w.GemaAuth && w.GemaAuth.getToken) { var t = w.GemaAuth.getToken(); if (t) return t; }
      var s = JSON.parse(localStorage.getItem('gema_session_v1') || 'null');
      return (s && s.token) || '';
    } catch (e) { return ''; }
  }

  function ruf(name, method, payload, mitToken) {
    var pfade = ['/api/' + name, '/.netlify/functions/' + name];
    var i = 0;
    function next() {
      var url = pfade[i];
      var opt = { method: method, headers: {} };
      if (method === 'GET') {
        var qs = Object.keys(payload || {})
          .filter(function (k) { return payload[k] != null && payload[k] !== ''; })
          .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]); }).join('&');
        if (qs) url += '?' + qs;
      } else {
        opt.headers['Content-Type'] = 'application/json';
        opt.body = JSON.stringify(payload || {});
      }
      if (mitToken) {
        var t = token();
        if (!t) return Promise.resolve({ status: 401, data: { error: 'Nicht angemeldet' } });
        opt.headers['Authorization'] = 'Bearer ' + t;
      }
      return fetch(url, opt).then(function (r) {
        return r.text().then(function (txt) {
          var d = null;
          try { d = txt ? JSON.parse(txt) : null; } catch (e) { }
          // Kein JSON → der Redirect existiert nicht (Netlify liefert die
          // HTML-404-Seite). Auf den direkten Functions-Pfad ausweichen.
          if (d === null && i < pfade.length - 1) { i++; return next(); }
          return { status: r.status, data: d };
        });
      }).catch(function (e) {
        if (i < pfade.length - 1) { i++; return next(); }
        throw e;
      });
    }
    return next();
  }
  function api(action, payload, method) {
    var body = Object.assign({ action: action }, payload || {});
    return ruf('card-api', method || 'POST', body, true);
  }
  function apiPublic(name, method, payload) { return ruf(name, method, payload, false); }
  // Beliebige Card-Function MIT Token aufrufen (z.B. card-invite).
  function call(name, method, payload) { return ruf(name, method, payload, true); }

  /* ── URLs ──────────────────────────────────────────────────────────── */
  function basis() { return w.location.origin; }
  function kartenUrl(slug) { return basis() + '/p/' + encodeURIComponent(slug); }
  function vcardUrl(slug) { return basis() + '/v/' + encodeURIComponent(slug) + '.vcf'; }
  function fotoUrl(slug, klein) {
    return '/api/card-photo?slug=' + encodeURIComponent(slug) + (klein ? '&v=klein' : '')
      + '&t=' + Date.now();   // Cache-Buster nach dem Hochladen
  }

  /* ══ QR-Code ════════════════════════════════════════════════════════
     EIN Modus: im QR steht die URL /p/<slug>, sonst nichts (~45 Byte).

     Das Konzept (§6.4) sah daneben einen «Kontakt-QR» vor, der die vCard
     direkt im Code trägt — die Kamera zeigt dann ohne Netz sofort
     «Kontakt sichern». Bewusst NICHT gebaut (Entscheid 08/2026):

       · Internet ist heute eine geringe Hürde; Bild, aktuelle Firma und
         der Beteiligten-Flow sind mehr wert als der eingesparte Ladeschritt.
       · Die eingebettete vCard wäre ein Schnappschuss und würde ohne
         Zutun veralten.
       · Ein Scan, den das Betriebssystem abfängt, lädt die Seite nie —
         er taucht in keiner Statistik auf. Mit nur einem Modus ist der
         Trichter (§9) vollständig statt halb blind.

     Weil der Code so klein bleibt, rechnet er mit Fehlerkorrektur H
     (30 % Redundanz) — nur deshalb verträgt er die GEMA-Marke in der
     Mitte, ohne unlesbar zu werden.
     ══════════════════════════════════════════════════════════════════ */
  var _qrP = null;
  function qrLib() {
    if (w.QRCode) return Promise.resolve(w.QRCode);
    if (_qrP) return _qrP;
    _qrP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = QR_CDN;
      s.onload = function () { w.QRCode ? res(w.QRCode) : rej(new Error('QR-Bibliothek nicht geladen')); };
      s.onerror = function () { rej(new Error('QR-Bibliothek nicht erreichbar')); };
      document.head.appendChild(s);
    });
    return _qrP;
  }

  /**
   * Slug aus einem gescannten Code lesen.
   * Sucht die Kartenadresse IRGENDWO im Text — damit funktioniert der
   * In-App-Scanner auch, wenn der Link in etwas anderem steckt (eine
   * fremde vCard mit URL:-Feld, eine kopierte Signatur, ein NFC-Tag).
   */
  function slugAusScan(text) {
    var m = /\/p\/([1-9A-HJ-NP-Za-km-z]{6,24})/.exec(String(text || ''));
    return m ? m[1] : '';
  }

  function _payload(textOderKarte) {
    return (typeof textOderKarte === 'string') ? textOderKarte : kartenUrl(textOderKarte.slug);
  }

  /**
   * QR in einen Container zeichnen.
   * opts = {logo:false} unterdrückt die Marke in der Mitte.
   */
  function qr(el, textOderKarte, size, opts) {
    opts = opts || {};
    var text = _payload(textOderKarte);
    var px = size || 200;
    return qrLib().then(function (QR) {
      el.innerHTML = '';
      new QR(el, {
        text: text, width: px, height: px,
        colorDark: '#0f172a', colorLight: '#ffffff', correctLevel: QR.CorrectLevel.H
      });
      if (opts.logo !== false) _logoOverlay(el, px);
      return true;
    });
  }

  // Weisses Feld mit der GEMA-Raute in der QR-Mitte. Rein dekorativ als
  // DOM-Overlay: so bleibt der QR selbst unangetastet (der Download
  // rastert ihn separat) und ein fehlgeschlagenes Overlay macht nie den
  // Code kaputt.
  function _logoOverlay(el, px) {
    try {
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      var d = Math.round(px * 0.22);
      var o = document.createElement('div');
      o.className = 'gema-qr-logo';
      o.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'
        + 'width:' + d + 'px;height:' + d + 'px;background:#fff;border-radius:' + Math.round(d * 0.26) + 'px;'
        + 'display:flex;align-items:center;justify-content:center;pointer-events:none';
      o.innerHTML = '<svg viewBox="0 0 100 100" width="' + Math.round(d * 0.72) + '" height="' + Math.round(d * 0.72) + '" aria-hidden="true">'
        + '<path fill="#0f172a" d="M50 6 92 30v40L50 94 8 70V30z"/>'
        + '<path fill="#fff" d="M58 40c-1.4-1.4-3.2-2.5-5.1-3.1l-5.6 5.6c4.7-.3 8.5 4 7.4 8.7-.6 2.9-7.2 8.7-13.1 14.8-2.8 2.8-7.3 2.8-10.1 0s-2.8-7.3 0-10.1l6.3-6.3c-.8-2.9-.6-6 .4-8.7L26.3 52.7c-5.1 5.1-5.1 13.3 0 18.4s13.4 5.1 18.5 0L58 58c5.1-5 5.2-13.2 0-18z"/>'
        + '<path fill="#fff" d="M74.2 42.3c2.5-2.5 3.8-5.7 3.8-9.2 0-7.2-5.8-13-13-13-3.5 0-6.8 1.4-9.2 3.8L38.4 40.2c-5 5-5.1 13.3 0 18.4 1.4 1.4 3.2 2.5 5.1 3.1l5.6-5.6c-2-.1-4-1-5.5-2.4-2.8-2.8-2.8-7.3 0-10.1l14.2-14.2c2.8-2.8 7.3-2.8 10.1 0s2.8 7.3 0 10.1l-6.3 6.3c.8 3 .6 6-.4 8.7z"/></svg>';
      el.appendChild(o);
    } catch (e) { /* Deko — nie den QR blockieren */ }
  }

  /** QR als PNG-DataURL (für Download / Druck). */
  function qrDataUrl(textOderKarte, size) {
    var text = _payload(textOderKarte);
    var px = size || 512;
    return qrLib().then(function (QR) {
      var tmp = document.createElement('div');
      tmp.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
      document.body.appendChild(tmp);
      new QR(tmp, {
        text: text, width: px, height: px,
        colorDark: '#0f172a', colorLight: '#ffffff', correctLevel: QR.CorrectLevel.H
      });
      // qrcodejs rendert je nach Browser Canvas ODER <img>
      var out = '';
      var cv = tmp.querySelector('canvas');
      if (cv) out = cv.toDataURL('image/png');
      else { var im = tmp.querySelector('img'); out = im ? im.src : ''; }
      tmp.remove();
      return out;
    });
  }

  /* ── Bild verkleinern (Canvas, kein Build-Step) ─────────────────────
     Zwei Groessen, weil die Functions KEINE npm-Dependencies haben und
     serverseitig nicht skalieren koennen:
       gross  512 px → Anzeige auf der Kartenseite
       klein  240 px → PHOTO-Feld der vCard (Ziel ~15 KB, sonst lehnen
                       manche Adressbuecher die Karte ab)
  */
  function bildVerkleinern(file) {
    return new Promise(function (res, rej) {
      if (!file) return rej(new Error('Keine Datei'));
      if (!/^image\//.test(file.type)) return rej(new Error('Bitte ein Bild wählen (JPG oder PNG)'));
      var fr = new FileReader();
      fr.onerror = function () { rej(new Error('Bild konnte nicht gelesen werden')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { rej(new Error('Bild konnte nicht gelesen werden')); };
        img.onload = function () {
          try {
            res({ gross: quadrat(img, 512, 0.85), klein: quadrat(img, 240, 0.72) });
          } catch (e) { rej(new Error('Bild konnte nicht verarbeitet werden')); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  // Mittigen Quadrat-Ausschnitt skalieren (Profilbilder sind rund).
  function quadrat(img, size, qual) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    var s = Math.min(img.naturalWidth, img.naturalHeight);
    var sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
    return c.toDataURL('image/jpeg', qual);
  }

  /* ── NFC ───────────────────────────────────────────────────────────
     Web-NFC gibt es nur auf Android-Chrome. Muster wie if_werkzeug:
     NIE ein write() armieren, das auf einen Tag wartet — sonst haengt
     sich der Chrome-NFC-Stack auf. Hier ist der Vorgang einmalig und
     kurz (eine URL), deshalb genuegt ein write() mit hartem Timeout und
     AbortController; der Abbruch raeumt zuverlaessig auf.
  */
  function nfcMoeglich() { return typeof w.NDEFReader !== 'undefined'; }
  function nfcSchreiben(url, timeoutMs) {
    if (!nfcMoeglich()) {
      return Promise.reject(new Error('Dieses Gerät kann keine NFC-Tags beschreiben. Web-NFC gibt es nur in Chrome auf Android.'));
    }
    var ac = new AbortController();
    var t = setTimeout(function () { try { ac.abort(); } catch (e) { } }, timeoutMs || 30000);
    return new w.NDEFReader().write({ records: [{ recordType: 'url', data: url }] }, { signal: ac.signal })
      .then(function () { clearTimeout(t); return true; })
      .catch(function (e) {
        clearTimeout(t);
        // NotAllowedError heisst beim Schreiben meist «Tag ist gesperrt»,
        // nicht «Berechtigung verweigert» (Erfahrung aus if_werkzeug).
        if (e && e.name === 'NotAllowedError') throw new Error('Der Tag ist schreibgeschützt oder die NFC-Berechtigung fehlt.');
        if (e && e.name === 'AbortError') throw new Error('Zeit abgelaufen — Tag ans Gerät halten und erneut versuchen.');
        throw new Error('Schreiben fehlgeschlagen: ' + ((e && e.message) || 'unbekannt'));
      });
  }

  /* ── Teilen / Kopieren ─────────────────────────────────────────────── */
  function teilen(url, titel) {
    if (navigator.share) {
      return navigator.share({ title: titel || 'Meine GEMA Card', url: url })
        .then(function () { return 'geteilt'; })
        .catch(function () { return 'abgebrochen'; });
    }
    return kopieren(url).then(function () { return 'kopiert'; });
  }
  function kopieren(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        res();
      } catch (e) { rej(e); }
    });
  }

  /* ── Lokaler Merker des eigenen Slugs ───────────────────────────────
     Damit sys_card.html den «Karte bearbeiten»-Knopf ohne API-Aufruf
     zeigen kann. Reine Anzeige-Optimierung — der Editor prueft die
     Berechtigung serverseitig.
  */
  function merkeSlug(slug) {
    try {
      var s = JSON.parse(localStorage.getItem('gema_session_v1') || 'null');
      localStorage.setItem(LS_MINE, JSON.stringify({ userId: (s && s.userId) || '', slug: slug || '' }));
    } catch (e) { }
  }
  function meinSlug() {
    try {
      var v = JSON.parse(localStorage.getItem(LS_MINE) || 'null');
      var s = JSON.parse(localStorage.getItem('gema_session_v1') || 'null');
      return (v && s && v.userId === s.userId) ? (v.slug || '') : '';
    } catch (e) { return ''; }
  }

  w.GemaCard = {
    api: api, apiPublic: apiPublic, call: call,
    kartenUrl: kartenUrl, vcardUrl: vcardUrl, fotoUrl: fotoUrl,
    qr: qr, qrDataUrl: qrDataUrl,
    slugAusScan: slugAusScan,
    bildVerkleinern: bildVerkleinern,
    nfcMoeglich: nfcMoeglich, nfcSchreiben: nfcSchreiben,
    teilen: teilen, kopieren: kopieren,
    merkeSlug: merkeSlug, meinSlug: meinSlug,
    ROLLEN: [
      { id: 'architekt', label: 'Architekt' }, { id: 'bauherr', label: 'Bauherrschaft' },
      { id: 'pl', label: 'Projektleitung' }, { id: 'planer', label: 'Planer' },
      { id: 'monteur', label: 'Monteur' }, { id: 'lieferant', label: 'Lieferant' },
      { id: 'sonstige', label: 'Sonstige' }
    ]
  };
})(window);
