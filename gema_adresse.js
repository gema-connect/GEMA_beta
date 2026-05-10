/* gema_adresse.js — globaler Adress-Helper mit swisstopo-Autocomplete
 *
 * Bindet ein Such-Input an den swisstopo geo.admin.ch Adress-Endpunkt.
 * Vorschlaege als Dropdown; bei Auswahl werden die Ziel-Felder
 * (strasse, plz, ort, optional kanton/gemeinde) automatisch befuellt.
 *
 * Verwendung:
 *
 *   1) Manuell:
 *      GemaAdresse.attach('mySearchInput', {
 *        strasse: 'fStrasse',  // ID des Hidden-/Form-Inputs fuer Strasse
 *        plz:     'fPlz',
 *        ort:     'fOrt',
 *        kanton:  'fKanton',     // optional
 *        gemeinde:'fGemeinde',   // optional
 *        onSelect: function(adr){ ... }    // optional callback
 *      });
 *
 *   2) Deklarativ via data-Attribute (Auto-Init bei DOMContentLoaded):
 *      <input data-gema-adresse
 *             data-target-strasse="fStrasse"
 *             data-target-plz="fPlz"
 *             data-target-ort="fOrt"
 *             data-target-kanton="fKanton"   <!-- optional -->
 *             placeholder="Adresse eingeben…">
 *
 *   3) Edit-Mode (vorbefuellen):
 *      GemaAdresse.setDisplayValue('mySearchInput', {strasse, plz, ort});
 *
 * API:
 *   GemaAdresse.attach(input, opts)        — bindet ein Input
 *   GemaAdresse.setDisplayValue(input, a)  — setzt Anzeige-Wert (Edit)
 *   GemaAdresse.scan(root?)                — bindet alle [data-gema-adresse] in root
 */
(function(w){
  if(w.GemaAdresse) return;

  var SWISSTOPO_URL = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';
  var DEBOUNCE_MS = 250;
  var _cache = {};

  function _resolve(idOrEl){
    if(!idOrEl) return null;
    if(typeof idOrEl === 'string') return document.getElementById(idOrEl);
    return idOrEl;
  }

  function _esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function _parseResults(rows){
    return (rows || []).map(function(r){
      var a = r.attrs || {};
      var label = (a.label || '').replace(/<\/?b>/g,'');
      var strasse='', plz='', ort='', gemeinde='', kanton='';
      var parts = label.split(',').map(function(s){return s.trim();});
      if(parts.length >= 2){
        strasse = parts[0];
        var m = parts[parts.length-1].match(/^(\d{4})\s+(.+)/);
        if(m){ plz = m[1]; ort = m[2]; } else { ort = parts[parts.length-1]; }
      } else {
        var m2 = label.match(/^(.+?\s+\d+\w?)\s+(\d{4})\s+(.+)$/);
        if(m2){ strasse = m2[1]; plz = m2[2]; ort = m2[3]; } else { strasse = label; }
      }
      if(a.plz) plz = String(a.plz);
      if(a.gemeindename) gemeinde = a.gemeindename;
      if(a.kanton) kanton = a.kanton;
      return {
        strasse: strasse, plz: plz, ort: ort,
        gemeinde: gemeinde || (kanton ? ort + ' (' + kanton + ')' : ''),
        kanton: kanton, label: label,
        lon: a.lon, lat: a.lat
      };
    });
  }

  function _ensureDropdown(input){
    // Drop-Container direkt nach dem Input. Wenn Input nicht in einem
    // position:relative-Wrapper steckt, wrappen wir ihn.
    var existing = input._gemaDrop;
    if(existing && existing.parentNode) return existing;
    var parent = input.parentNode;
    if(!parent) return null;
    var cs = w.getComputedStyle(parent);
    if(cs.position === 'static'){
      // Wrappe Input in span mit position:relative, damit Drop richtig sitzt
      var wrap = document.createElement('span');
      wrap.style.cssText = 'position:relative;display:block;width:100%';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
      parent = wrap;
    }
    var drop = document.createElement('div');
    drop.className = 'gema-adr-drop';
    drop.setAttribute('role','listbox');
    parent.appendChild(drop);
    input._gemaDrop = drop;
    return drop;
  }

  function _renderResults(results, drop, ctx){
    if(!results.length){
      drop.innerHTML = '<div class="gema-adr-loading">Keine Adresse gefunden</div>';
      drop.classList.add('open');
      return;
    }
    drop.innerHTML = results.map(function(r,i){
      return '<div class="gema-adr-item" data-idx="'+i+'" role="option">'
        + '<div class="gema-adr-main">' + _esc(r.strasse) + '</div>'
        + '<div class="gema-adr-sub">' + _esc(r.plz) + ' ' + _esc(r.ort)
        + (r.gemeinde && r.gemeinde !== r.ort ? ' · ' + _esc(r.gemeinde) : '')
        + '</div></div>';
    }).join('');
    drop.classList.add('open');
    drop._results = results;
    drop._activeIdx = -1;
    // Click-Bindings (mousedown statt click, damit Input nicht vorher
    // den Blur-Pfad triggert).
    Array.prototype.forEach.call(drop.querySelectorAll('.gema-adr-item'), function(el){
      el.addEventListener('mousedown', function(e){
        e.preventDefault();
        _select(parseInt(el.getAttribute('data-idx'),10), drop, ctx);
      });
      el.addEventListener('mouseenter', function(){
        drop._activeIdx = parseInt(el.getAttribute('data-idx'),10);
        _highlight(drop);
      });
    });
  }

  function _highlight(drop){
    var items = drop.querySelectorAll('.gema-adr-item');
    Array.prototype.forEach.call(items, function(el, i){
      el.classList.toggle('active', i === drop._activeIdx);
    });
    var active = drop.querySelector('.gema-adr-item.active');
    if(active) try { active.scrollIntoView({block:'nearest'}); } catch(e){}
  }

  function _clearTargets(ctx){
    var keys = ['strasse','plz','ort','kanton','gemeinde'];
    keys.forEach(function(k){
      var el = ctx.targets[k];
      if(el) el.value = '';
    });
  }

  function _select(idx, drop, ctx){
    var results = drop._results;
    if(!results || !results[idx]) return;
    var r = results[idx];
    if(ctx.targets.strasse) ctx.targets.strasse.value = r.strasse || '';
    if(ctx.targets.plz)     ctx.targets.plz.value     = r.plz || '';
    if(ctx.targets.ort)     ctx.targets.ort.value     = r.ort || '';
    if(ctx.targets.kanton)  ctx.targets.kanton.value  = r.kanton || '';
    if(ctx.targets.gemeinde)ctx.targets.gemeinde.value= r.gemeinde || '';
    // change-Events triggern, damit Frameworks/Listener mitkriegen
    Object.keys(ctx.targets).forEach(function(k){
      var el = ctx.targets[k];
      if(el) try { el.dispatchEvent(new Event('change', {bubbles:true})); } catch(e){}
    });
    var display = (r.strasse ? r.strasse : '') + (r.plz || r.ort ? ', ' : '') + (r.plz || '') + (r.plz && r.ort ? ' ' : '') + (r.ort || '');
    ctx.input.value = display;
    drop.classList.remove('open');
    drop._activeIdx = -1;
    if(typeof ctx.onSelect === 'function'){
      try { ctx.onSelect(r); } catch(e) { console.warn('[GemaAdresse] onSelect error', e); }
    }
  }

  function _fetch(q, drop, ctx){
    if(_cache[q]){ _renderResults(_cache[q], drop, ctx); return; }
    drop.innerHTML = '<div class="gema-adr-loading">Suche…</div>';
    drop.classList.add('open');
    var url = SWISSTOPO_URL + '?searchText=' + encodeURIComponent(q)
      + '&type=locations&origins=address&limit=8&lang=de';
    fetch(url).then(function(r){
      if(!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function(data){
      var results = _parseResults(data.results);
      _cache[q] = results;
      _renderResults(results, drop, ctx);
    }).catch(function(e){
      drop.innerHTML = '<div class="gema-adr-loading">Adress-API nicht erreichbar</div>';
      console.warn('[GemaAdresse] swisstopo:', e);
    });
  }

  function _attach(input, opts){
    input = _resolve(input);
    if(!input) return null;
    if(input._gemaAdresseAttached) return input._gemaAdresseAttached;
    opts = opts || {};
    var ctx = {
      input: input,
      targets: {
        strasse: _resolve(opts.strasse),
        plz: _resolve(opts.plz),
        ort: _resolve(opts.ort),
        kanton: _resolve(opts.kanton),
        gemeinde: _resolve(opts.gemeinde)
      },
      onSelect: opts.onSelect
    };
    input.setAttribute('autocomplete','off');
    if(!input.classList.contains('gema-adr-input')) input.classList.add('gema-adr-input');
    var drop = _ensureDropdown(input);
    if(!drop) return null;
    var timer = null;
    input.addEventListener('input', function(){
      var q = input.value.trim();
      _clearTargets(ctx);
      if(q.length < 2){ drop.classList.remove('open'); return; }
      clearTimeout(timer);
      timer = setTimeout(function(){ _fetch(q, drop, ctx); }, DEBOUNCE_MS);
    });
    input.addEventListener('keydown', function(ev){
      var results = drop._results || [];
      if(!drop.classList.contains('open') || !results.length) return;
      if(ev.key === 'ArrowDown'){
        ev.preventDefault();
        drop._activeIdx = Math.min((drop._activeIdx == null ? -1 : drop._activeIdx) + 1, results.length - 1);
        _highlight(drop);
      } else if(ev.key === 'ArrowUp'){
        ev.preventDefault();
        drop._activeIdx = Math.max((drop._activeIdx == null ? 0 : drop._activeIdx) - 1, 0);
        _highlight(drop);
      } else if(ev.key === 'Enter'){
        if(drop._activeIdx != null && drop._activeIdx >= 0){
          ev.preventDefault();
          _select(drop._activeIdx, drop, ctx);
        }
      } else if(ev.key === 'Escape'){
        drop.classList.remove('open');
      }
    });
    input._gemaAdresseAttached = ctx;
    return ctx;
  }

  function _setDisplayValue(input, adr){
    input = _resolve(input);
    if(!input) return;
    if(!adr){ input.value = ''; return; }
    var s = (adr.strasse || '');
    var po = [adr.plz, adr.ort].filter(Boolean).join(' ');
    input.value = s + (s && po ? ', ' : '') + po;
  }

  function _scan(root){
    root = root || document;
    var els = root.querySelectorAll('input[data-gema-adresse]');
    Array.prototype.forEach.call(els, function(input){
      _attach(input, {
        strasse:  input.getAttribute('data-target-strasse'),
        plz:      input.getAttribute('data-target-plz'),
        ort:      input.getAttribute('data-target-ort'),
        kanton:   input.getAttribute('data-target-kanton'),
        gemeinde: input.getAttribute('data-target-gemeinde')
      });
    });
  }

  // Click ausserhalb → Drop schliessen
  document.addEventListener('click', function(e){
    var drops = document.querySelectorAll('.gema-adr-drop.open');
    Array.prototype.forEach.call(drops, function(d){
      if(!d.parentNode || !d.parentNode.contains(e.target)) d.classList.remove('open');
    });
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ _scan(); });
  } else {
    _scan();
  }

  w.GemaAdresse = {
    attach: _attach,
    setDisplayValue: _setDisplayValue,
    scan: _scan
  };
})(window);
