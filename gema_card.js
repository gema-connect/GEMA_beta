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
  function basis() { return location.origin; }
  function kartenUrl(slug) { return basis() + '/p/' + encodeURIComponent(slug); }
  function vcardUrl(slug) { return basis() + '/v/' + encodeURIComponent(slug) + '.vcf'; }
  function fotoUrl(slug, klein) {
    return '/api/card-photo?slug=' + encodeURIComponent(slug) + (klein ? '&v=klein' : '')
      + '&t=' + Date.now();   // Cache-Buster nach dem Hochladen
  }

  /* ── QR-Code ───────────────────────────────────────────────────────── */
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
  /** QR in einen Container zeichnen. Liefert die QRCode-Instanz. */
  function qr(el, text, size) {
    return qrLib().then(function (QR) {
      el.innerHTML = '';
      return new QR(el, {
        text: text, width: size || 200, height: size || 200,
        colorDark: '#0f172a', colorLight: '#ffffff', correctLevel: QR.CorrectLevel.M
      });
    });
  }
  /** QR als PNG-DataURL (fuer Download / Druck). */
  function qrDataUrl(text, size) {
    return qrLib().then(function (QR) {
      var tmp = document.createElement('div');
      tmp.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
      document.body.appendChild(tmp);
      new QR(tmp, {
        text: text, width: size || 512, height: size || 512,
        colorDark: '#0f172a', colorLight: '#ffffff', correctLevel: QR.CorrectLevel.M
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
