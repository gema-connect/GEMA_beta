/* gema_zefix.js — Handelsregister-Anbindung (Zefix/LINDAS, Bundesverwaltung)
 *
 * Hängt an ein «Firma»-Eingabefeld ein Vorschlags-Dropdown mit den Firmen
 * aus dem Schweizer Handelsregister — MIT ADRESSE, damit man den Betrieb
 * schon in der Liste erkennt und nicht erst nach dem Auswählen.
 *
 * Der Abruf läuft über die JWT-gegatete Netlify-Function
 * /.netlify/functions/zefix (CORS + Zugangsdaten bleiben serverseitig).
 * Ohne erreichbaren Dienst meldet der Helper das im Dropdown — das Feld
 * bleibt normal tippbar (Graceful Degradation wie DataSelect).
 *
 * ── EMPFOHLENE VERWENDUNG: der Einzeiler ────────────────────────────────
 *   GemaZefix.firma({ firma:'o_name', strasse:'o_strasse',
 *                     plz:'o_plz', ort:'o_ort' });
 *
 * Das bindet das Feld an, übernimmt bei der Auswahl den OFFIZIELLEN
 * Firmennamen und die Adresse, zeichnet darunter die grüne Bestätigungs-
 * zeile («✓ Handelsregister: UID · Rechtsform · Sitz») und löst den
 * Handelsregister-Bezug wieder, sobald jemand den Namen umtippt — es soll
 * nie eine UID an einem von Hand geänderten Namen kleben.
 *
 * Optionen (alle ausser `firma` optional):
 *   firma        Firma-Eingabefeld (id oder Element) — PFLICHT
 *   strasse/plz/ort   Zielfelder für die Adresse (id oder Element)
 *   adresse      EIN Feld für die ganze Adresse («Strasse, PLZ Ort»),
 *                für Dialoge ohne getrennte Felder
 *   uid          Zielfeld für die UID (CHE-123.456.789)
 *   rechtsform   Zielfeld für die Rechtsform
 *   hint         Container für die Bestätigungszeile; fehlt er, legt der
 *                Helper ihn selbst direkt unter dem Feld an
 *   nurLeere     true = nur leere Zielfelder füllen (Default false:
 *                übernehmen, was das Register führt — der Nutzer hat die
 *                Firma bewusst ausgewählt; die Felder bleiben editierbar)
 *   onSelect(f)  zusätzlich eigener Code (z.B. dirty-Flag setzen)
 *   onClear()    Name wurde umgetippt — Bezug ist weg
 *
 * Rückgabe: ctx mit ctx.daten() → der zuletzt gewählte Datensatz (oder
 * null), damit das Modul ihn beim Speichern mitschreiben kann.
 *
 * ── Rohe API ────────────────────────────────────────────────────────────
 *   GemaZefix.attach(input, {onSelect, onClear})   volle Kontrolle
 *   GemaZefix.search('muster')   → Promise<Array>
 *   GemaZefix.detail('CHE-…')    → Promise<Object|null>
 *   GemaZefix.selftest()         → Promise<Object>  (s. unten)
 *
 * ── Wenn es «nicht mehr geht» ───────────────────────────────────────────
 * In der Browser-Konsole:
 *   GemaZefix.selftest().then(r => console.log(r.zusammenfassung, r.quellen))
 * Der Selbsttest fragt JEDE Quelle einzeln ab und meldet Status, Dauer und
 * Trefferzahl — man sieht also sofort, ob der Dienst, die Konfiguration
 * oder die Anbindung klemmt, statt zu raten.
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
  // «Bahnhofstrasse 1, 8001 Zürich» — leere Teile fallen weg.
  function _adrText(f) {
    if (!f) return '';
    var ortZeile = [f.plz, f.ort].filter(Boolean).join(' ');
    return [f.strasse, ortZeile].filter(Boolean).join(', ');
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
            : res.status === 401
              ? 'Nicht angemeldet — bitte neu einloggen.'
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
  // Selbsttest: prüft jede Quelle einzeln (s. Kopf).
  function _selftest(name) {
    var qs = 'selftest=1' + (name ? '&name=' + encodeURIComponent(name) : '');
    return fetch(ENDPOINT + '?' + qs, { headers: _authHeaders() })
      .then(function (r) { return r.text().then(function (t) {
        try { return JSON.parse(t); }
        catch (e) { return { ok: false, error: 'Keine JSON-Antwort (HTTP ' + r.status + ')', rohantwort: t.slice(0, 2000) }; }
      }); });
  }
  // Diagnose einer einzelnen Abfrage: liefert zusätzlich die abgesetzte
  // SPARQL-Abfrage und den Anfang der Rohantwort.
  function _debug(opts) {
    opts = opts || {};
    var qs = (opts.uid ? 'uid=' + encodeURIComponent(opts.uid) : 'name=' + encodeURIComponent(opts.name || '')) + '&debug=1';
    return fetch(ENDPOINT + '?' + qs, { headers: _authHeaders() })
      .then(function (r) { return r.text().then(function (t) {
        try { return JSON.parse(t); } catch (e) { return { ok: false, error: 'Keine JSON-Antwort (HTTP ' + r.status + ')', rohantwort: t.slice(0, 2000) }; }
      }); });
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
      // Adresse zuerst — daran erkennt man den Betrieb. Führt das Register
      // keine Adresse (REST-Quellen liefern sie erst im Detail), steht der
      // Sitz da; sie wird beim Auswählen nachgeladen.
      var sub = [_adrText(f) || f.sitz, f.rechtsformKurz || f.rechtsform, f.uidFormatted]
        .filter(Boolean).join(' · ');
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
    // Adresse steht je nach Quelle erst im Detail-Datensatz — nachladen,
    // dann melden. Der Name ist bereits gesetzt, das Nachladen ist also
    // reine Ergänzung und darf ruhig eine Sekunde brauchen.
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
    opts = opts || {};
    if (input._gzAttached) {
      // Zweiter Aufruf (Dialog neu aufgebaut): Handler nicht doppelt binden,
      // aber die Callbacks aktualisieren.
      if (opts.onSelect) input._gzAttached.onSelect = opts.onSelect;
      if (opts.onClear) input._gzAttached.onClear = opts.onClear;
      return input._gzAttached;
    }
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

  // ── Einzeiler für die Module ───────────────────────────────────────────
  // Bindet das Feld an, übernimmt Name + Adresse und zeichnet die
  // Bestätigungszeile. Siehe Kopf für die Optionen.
  function _hintEl(input, opts) {
    var el = _resolve(opts.hint);
    if (el) return el;
    if (input._gzHint && input._gzHint.parentNode) return input._gzHint;
    el = document.createElement('div');
    el.className = '';
    // NACH dem Eingabefeld einhängen — _ensureDrop hat es ggf. in einen
    // relativ positionierten Wrapper gelegt, der Hinweis landet dann darin
    // und rendert als Block direkt darunter.
    if (input.parentNode) input.parentNode.insertBefore(el, input.nextSibling);
    input._gzHint = el;
    return el;
  }

  function _setzen(ziel, wert, nurLeere) {
    var el = _resolve(ziel);
    if (!el || !wert) return false;
    if (nurLeere && String(el.value || '').trim()) return false;
    el.value = wert;
    // Module hängen teils an input/change (AutoSave, dirty-Flags) — die
    // programmatische Zuweisung feuert von sich aus nichts.
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {}
    return true;
  }

  function _firma(opts) {
    opts = opts || {};
    var input = _resolve(opts.firma || opts.input || opts.el);
    if (!input) return null;
    var hint = _hintEl(input, opts);
    var state = { f: null };

    function zeichne(f, uebernommen) {
      if (!hint) return;
      if (!f) { hint.innerHTML = ''; hint.className = ''; return; }
      var teile = [f.uidFormatted || f.uid, f.rechtsformKurz || f.rechtsform, f.sitz || f.ort]
        .filter(Boolean).map(_esc);
      hint.className = 'gema-hr-hint';
      hint.innerHTML = '✓ Handelsregister: ' + teile.join(' · ')
        + (f.aktiv === false ? ' <b>(gelöscht)</b>' : '')
        + (f.zefixUrl ? ' · <a href="' + _esc(f.zefixUrl) + '" target="_blank" rel="noopener">Eintrag ↗</a>' : '')
        + (uebernommen ? '<div class="gema-hr-hint-sub">Adresse übernommen — jederzeit anpassbar.</div>' : '');
    }

    var ctx = _attach(input, {
      onSelect: function (f) {
        state.f = f;
        var nurLeere = opts.nurLeere === true;
        var uebernommen = false;
        if (_setzen(opts.strasse, f.strasse, nurLeere)) uebernommen = true;
        if (_setzen(opts.plz, f.plz, nurLeere)) uebernommen = true;
        if (_setzen(opts.ort, f.ort, nurLeere)) uebernommen = true;
        if (opts.adresse && _setzen(opts.adresse, _adrText(f), nurLeere)) uebernommen = true;
        _setzen(opts.uid, f.uidFormatted || f.uid, nurLeere);
        _setzen(opts.rechtsform, f.rechtsformKurz || f.rechtsform, nurLeere);
        zeichne(f, uebernommen);
        if (typeof opts.onSelect === 'function') {
          try { opts.onSelect(f); } catch (e) { console.warn('[GemaZefix] onSelect:', e); }
        }
      },
      onClear: function () {
        // Name umgetippt ⇒ der Registerbezug gilt nicht mehr. Die bereits
        // übernommene Adresse bleibt stehen (sie ist erfasst, nicht falsch)
        // — nur das Siegel verschwindet.
        state.f = null;
        zeichne(null);
        if (typeof opts.onClear === 'function') { try { opts.onClear(); } catch (e) {} }
      }
    });
    if (!ctx) return null;
    ctx.daten = function () { return state.f; };
    ctx.zeichne = zeichne;
    return ctx;
  }

  document.addEventListener('click', function (e) {
    var drops = document.querySelectorAll('.gema-hr-drop.open');
    Array.prototype.forEach.call(drops, function (d) {
      if (!d.parentNode || !d.parentNode.contains(e.target)) d.classList.remove('open');
    });
  });

  w.GemaZefix = {
    attach: _attach, firma: _firma,
    search: _search, detail: _detail,
    selftest: _selftest, debug: _debug,
    adresseText: _adrText, ENDPOINT: ENDPOINT
  };
})(window);
