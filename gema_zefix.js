/* gema_zefix.js — Handelsregister-Anbindung (Zefix, Bundesverwaltung)
 *
 * Hängt an ein «Firma»-Eingabefeld ein Vorschlags-Dropdown mit den
 * Treffern aus dem Schweizer Handelsregister. Bei Auswahl liefert der
 * Helper den vollständigen Datensatz (offizieller Name, UID, Rechtsform,
 * Sitz, Adresse) — was das Modul damit befüllt, entscheidet es selbst
 * im onSelect-Callback.
 *
 * Der Abruf läuft über die JWT-gegatete Netlify-Function
 * /.netlify/functions/zefix (CORS + Zugangsdaten bleiben serverseitig).
 * Ohne konfigurierten Zefix-Zugang meldet der Helper das im Dropdown —
 * das Feld bleibt normal tippbar (Graceful Degradation wie DataSelect).
 *
 * Verwendung:
 *   GemaZefix.attach('k_firma', {
 *     onSelect: function(f){ … },        // f = normalisierter Datensatz
 *     onClear:  function(){ … }          // optional: User tippt wieder
 *   });
 *
 *   GemaZefix.search('muster')     → Promise<Array>   (Liste ohne Adresse)
 *   GemaZefix.detail('CHE-…')      → Promise<Object|null> (inkl. Adresse)
 *
 * Datensatz: {name, uid, uidFormatted, chid, sitz, rechtsform,
 *             rechtsformKurz, status, aktiv, zefixUrl, strasse, plz, ort}
 */
(function (w) {
  if (w.GemaZefix) return;

  var ENDPOINT = '/.netlify/functions/zefix';
  var DEBOUNCE_MS = 320;   // Behörden-API — bewusst träger als das Adress-Autocomplete
  var MIN_LEN = 3;
  var _cache = {};

  function _resolve(x) {
    if (!x) return null;
    return typeof x === 'string' ? document.getElementById(x) : x;
  }
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function _authHeaders() {
    var h = { 'Accept': 'application/json' };
    try {
      var t = (w.GemaSync && GemaSync.getAuthToken && GemaSync.getAuthToken())
        || (w.GemaAuth && GemaAuth.getToken && GemaAuth.getToken()) || '';
      if (t) h['Authorization'] = 'Bearer ' + t;
    } catch (e) {}
    return h;
  }

  // Antwort IMMER defensiv parsen: bei fehlendem Deploy/Proxy-Fehler kommt
  // HTML statt JSON zurück — dann eine lesbare Meldung statt «Unexpected token <».
  function _req(qs) {
    return fetch(ENDPOINT + '?' + qs, { headers: _authHeaders() }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = JSON.parse(txt); } catch (e) {}
        if (!data) {
          throw new Error(res.status === 404
            ? 'Handelsregister-Dienst nicht verfügbar (Function nicht deployed).'
            : 'Handelsregister antwortet unerwartet (HTTP ' + res.status + ').');
        }
        if (!data.ok) throw new Error(data.error || 'Handelsregister-Abfrage fehlgeschlagen.');
        return data;
      });
    });
  }

  function _search(name) {
    var q = String(name || '').trim();
    if (q.length < MIN_LEN) return Promise.resolve([]);
    if (_cache[q]) return Promise.resolve(_cache[q]);
    return _req('name=' + encodeURIComponent(q)).then(function (d) {
      _cache[q] = d.firmen || [];
      return _cache[q];
    });
  }
  function _detail(uid) {
    var u = String(uid || '').trim();
    if (!u) return Promise.resolve(null);
    return _req('uid=' + encodeURIComponent(u)).then(function (d) {
      return (d.firmen && d.firmen[0]) || null;
    });
  }

  function _ensureDrop(input) {
    if (input._gzDrop && input._gzDrop.parentNode) return input._gzDrop;
    var parent = input.parentNode;
    if (!parent) return null;
    if (w.getComputedStyle(parent).position === 'static') {
      var wrap = document.createElement('span');
      wrap.style.cssText = 'position:relative;display:block;width:100%';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
      parent = wrap;
    }
    var drop = document.createElement('div');
    drop.className = 'gema-hr-drop';
    drop.setAttribute('role', 'listbox');
    parent.appendChild(drop);
    input._gzDrop = drop;
    return drop;
  }

  function _msg(drop, text) {
    drop.innerHTML = '<div class="gema-hr-loading">' + _esc(text) + '</div>';
    drop.classList.add('open');
    drop._results = [];
  }

  function _render(list, drop, ctx) {
    if (!list.length) { _msg(drop, 'Kein Handelsregister-Eintrag gefunden'); return; }
    drop.innerHTML = list.map(function (f, i) {
      var sub = [f.rechtsformKurz || f.rechtsform, f.sitz, f.uidFormatted].filter(Boolean).join(' · ');
      return '<div class="gema-hr-item' + (f.aktiv ? '' : ' geloescht') + '" data-idx="' + i + '" role="option">'
        + '<div class="gema-hr-main">' + _esc(f.name) + (f.aktiv ? '' : ' <span class="gema-hr-tag">gelöscht</span>') + '</div>'
        + '<div class="gema-hr-sub">' + _esc(sub) + '</div></div>';
    }).join('');
    drop.classList.add('open');
    drop._results = list;
    drop._activeIdx = -1;
    Array.prototype.forEach.call(drop.querySelectorAll('.gema-hr-item'), function (el) {
      el.addEventListener('mousedown', function (e) {
        e.preventDefault();
        _select(parseInt(el.getAttribute('data-idx'), 10), drop, ctx);
      });
      el.addEventListener('mouseenter', function () {
        drop._activeIdx = parseInt(el.getAttribute('data-idx'), 10);
        _highlight(drop);
      });
    });
  }

  function _highlight(drop) {
    var items = drop.querySelectorAll('.gema-hr-item');
    Array.prototype.forEach.call(items, function (el, i) { el.classList.toggle('active', i === drop._activeIdx); });
    var a = drop.querySelector('.gema-hr-item.active');
    if (a) try { a.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  function _select(idx, drop, ctx) {
    var list = drop._results || [];
    var f = list[idx];
    if (!f) return;
    ctx.input.value = f.name || ctx.input.value;
    drop.classList.remove('open');
    drop._activeIdx = -1;
    ctx.suppress = true;   // programmatisches Setzen darf onClear nicht auslösen
    // Adresse steht erst im Detail-Datensatz — nachladen, dann melden.
    var done = function (full) {
      ctx.suppress = false;
      if (typeof ctx.onSelect === 'function') {
        try { ctx.onSelect(full || f); } catch (e) { console.warn('[GemaZefix] onSelect:', e); }
      }
    };
    if (f.uid && !f.strasse) {
      _detail(f.uid).then(function (full) {
        done(full ? Object.assign({}, f, full) : f);
      }).catch(function () { done(f); });
    } else done(f);
  }

  function _attach(input, opts) {
    input = _resolve(input);
    if (!input) return null;
    if (input._gzAttached) return input._gzAttached;
    opts = opts || {};
    var ctx = { input: input, onSelect: opts.onSelect, onClear: opts.onClear, suppress: false };
    input.setAttribute('autocomplete', 'off');
    input.classList.add('gema-hr-input');
    var drop = _ensureDrop(input);
    if (!drop) return null;
    var timer = null, seq = 0;

    input.addEventListener('input', function () {
      if (!ctx.suppress && typeof ctx.onClear === 'function') {
        try { ctx.onClear(); } catch (e) {}
      }
      var q = input.value.trim();
      clearTimeout(timer);
      if (q.length < MIN_LEN) { drop.classList.remove('open'); return; }
      var my = ++seq;
      timer = setTimeout(function () {
        _msg(drop, 'Handelsregister wird abgefragt…');
        _search(q).then(function (list) {
          if (my !== seq) return;
          _render(list, drop, ctx);
        }).catch(function (e) {
          if (my !== seq) return;
          _msg(drop, e && e.message ? e.message : 'Handelsregister nicht erreichbar');
        });
      }, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function (ev) {
      var list = drop._results || [];
      if (!drop.classList.contains('open') || !list.length) return;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        drop._activeIdx = Math.min((drop._activeIdx == null ? -1 : drop._activeIdx) + 1, list.length - 1);
        _highlight(drop);
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        drop._activeIdx = Math.max((drop._activeIdx == null ? 0 : drop._activeIdx) - 1, 0);
        _highlight(drop);
      } else if (ev.key === 'Enter') {
        if (drop._activeIdx != null && drop._activeIdx >= 0) { ev.preventDefault(); _select(drop._activeIdx, drop, ctx); }
      } else if (ev.key === 'Escape') {
        drop.classList.remove('open');
      }
    });

    input._gzAttached = ctx;
    return ctx;
  }

  document.addEventListener('click', function (e) {
    var drops = document.querySelectorAll('.gema-hr-drop.open');
    Array.prototype.forEach.call(drops, function (d) {
      if (!d.parentNode || !d.parentNode.contains(e.target)) d.classList.remove('open');
    });
  });

  w.GemaZefix = { attach: _attach, search: _search, detail: _detail, ENDPOINT: ENDPOINT };
})(window);
