/* gema_adresse.js — globaler Adress-Helper mit swisstopo-Autocomplete
 *
 * Bindet ein Such-Input an den swisstopo geo.admin.ch Adress-Endpunkt.
 * Vorschlaege als Dropdown; bei Auswahl werden die Ziel-Felder
 * (strasse, plz, ort, optional kanton/gemeinde) automatisch befuellt.
 *
 * INTELLIGENTE SUCHE (siehe ENGINE-Block):
 *   Die Eingabe wird in Strassenname / Hausnummer / PLZ / Ort ZERLEGT.
 *   Daraus gehen mehrere Suchtexte an swisstopo, und die Antwort wird
 *   hier gefiltert und sortiert. «pfirterg 47» zeigt damit die
 *   Pfirtergasse 47 — und nur Adressen, deren Strassenname «pfirterg»
 *   enthaelt und deren Hausnummer 47 ist.
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
 *   4) Nur die Suche (eigenes Dropdown, z.B. pm_objekte-Beteiligte):
 *      GemaAdresse.suche('pfirterg 47').then(function(erg){ erg.treffer … });
 *
 * API:
 *   GemaAdresse.attach(input, opts)        — bindet ein Input
 *   GemaAdresse.setDisplayValue(input, a)  — setzt Anzeige-Wert (Edit)
 *   GemaAdresse.scan(root?)                — bindet alle [data-gema-adresse] in root
 *   GemaAdresse.suche(text)                — Promise<{treffer,alle,gekappt,hinweis,teil,fehler}>
 *   GemaAdresse.zerlege/passt/sortiere/…   — Engine (DOM-frei, Node-testbar)
 */
(function(w){
  if(w.GemaAdresse) return;

  var SWISSTOPO_URL = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';
  var DEBOUNCE_MS = 250;
  var _cache = {};

  /*ENGINE-START*/
  /* Reine Datenlogik — kein DOM, kein fetch. Wird vom Drift-Guard
     scripts/adresse_suche_test.mjs direkt geprueft. */

  var ADR_ANZEIGE    = 8;   // sichtbare Vorschlaege
  var ADR_LIMIT      = 30;  // von swisstopo angefragte Zeilen (frueher 8)
  var ADR_NACHFRAGEN = 2;   // gezielte Nachfragen «<voller Strassenname> <Nr>»

  var _UML = {'ä':'a','ö':'o','ü':'u','à':'a','á':'a','â':'a','è':'e','é':'e',
              'ê':'e','ë':'e','ì':'i','í':'i','î':'i','ò':'o','ó':'o','ô':'o',
              'ù':'u','ú':'u','û':'u','ç':'c','ñ':'n','ß':'ss'};

  /* Vergleichsform: klein, Umlaute gefaltet, Satz-/Leerzeichen weg.
     Damit trifft «st gallerstr» die «St. Gallerstrasse» und
     «pfirterg» die «Pfirtergasse» als reiner Teilstring. */
  function adrNorm(s){
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[äöüàáâèéêëìíîòóôùúûçñß]/g, function(c){ return _UML[c] || c; })
      .replace(/[^a-z0-9]+/g, '');
  }

  /* Hausnummer lesen: '47' · '47a' · '47-49' · '12 b' → {von,bis,buchstabe,roh} */
  function adrNr(s){
    var t = String(s == null ? '' : s).trim().toLowerCase().replace(/\.$/, '');
    var m = t.match(/^(\d{1,4})\s*([a-z])?(?:\s*[-–\/]\s*(\d{1,4})\s*([a-z])?)?$/);
    if(!m) return null;
    return {
      von: parseInt(m[1], 10),
      bis: m[3] ? parseInt(m[3], 10) : parseInt(m[1], 10),
      buchstabe: (m[2] || '').toLowerCase(),
      roh: t.replace(/\s+/g, '')
    };
  }

  /* 'Pfirtergasse 47' → {name:'Pfirtergasse', nr:'47'} */
  function adrTeileStrasse(s){
    var t = String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
    var m = t.match(/^(.*\S)\s+(\d{1,4}\s?[a-zA-Z]?(?:\s?[-–\/]\s?\d{1,4}\s?[a-zA-Z]?)?)$/);
    if(m) return { name: m[1], nr: m[2].replace(/\s+/g, '') };
    return { name: t, nr: '' };
  }

  function _tok(s){ return String(s == null ? '' : s).split(/[\s,]+/).filter(Boolean); }

  /* Eingabe zerlegen.
     Regel fuer Zahlen: genau 4 Ziffern (1000–9999) = PLZ, 1–3 Ziffern
     (optional mit Buchstabe/Bereich) = Hausnummer. Eine 4-stellige
     Hausnummer gibt es in der Schweiz praktisch nicht; steht doch eine
     da, greift der Rueckfall-Hinweis statt einer stillen Fehlzuordnung. */
  function adrZerlege(q){
    var roh = String(q == null ? '' : q).trim().replace(/\s+/g, ' ');
    var teil = { roh: roh, strasse: '', nr: '', plz: '', ort: '' };
    if(!roh) return teil;

    var ki = roh.indexOf(',');
    var vorn = _tok(ki >= 0 ? roh.slice(0, ki) : roh);
    var hinten = ki >= 0 ? _tok(roh.slice(ki + 1)) : [];
    var alle = ki >= 0 ? hinten : vorn;

    var iPlz = -1, i;
    for(i = 0; i < alle.length; i++){
      if(/^\d{4}$/.test(alle[i]) && +alle[i] >= 1000){ iPlz = i; teil.plz = alle[i]; break; }
    }

    var iNr = -1;
    for(i = vorn.length - 1; i >= 0; i--){
      if(ki < 0 && i === iPlz) continue;
      if(/^\d{1,3}\s?[a-zA-Z]?(?:[-–\/]\d{1,3}[a-zA-Z]?)?$/.test(vorn[i])){
        iNr = i; teil.nr = vorn[i].toLowerCase(); break;
      }
    }

    var grenze = vorn.length;
    if(iNr >= 0) grenze = Math.min(grenze, iNr);
    if(ki < 0 && iPlz >= 0) grenze = Math.min(grenze, iPlz);
    teil.strasse = vorn.slice(0, grenze).join(' ');

    if(ki >= 0){
      teil.ort = hinten.filter(function(t, j){ return j !== iPlz && !/^\d/.test(t); }).join(' ');
    } else {
      var rest = vorn.slice(grenze).filter(function(t, j){
        var abs = grenze + j;
        return abs !== iNr && abs !== iPlz && !/^\d/.test(t);
      });
      if(rest.length) teil.ort = rest.join(' ');
    }
    return teil;
  }

  /* Hausnummer-Vergleich. Ohne getippte Nummer wird nicht gefiltert;
     '47' nimmt auch '47a' mit (Zusatz-Buchstaben sind kein Ausschluss),
     '47a' aber nicht '47'. Ein Bereich '47-49' deckt die 48 mit ab. */
  function adrNrPasst(gesucht, gefunden){
    var g = adrNr(gesucht);
    if(!g) return true;
    var f = adrNr(gefunden);
    if(!f) return false;
    if(g.buchstabe && g.buchstabe !== f.buchstabe) return false;
    return g.von >= f.von && g.von <= f.bis;
  }

  function adrPasst(adr, teil){
    if(!adr || !teil) return false;
    var st = adrTeileStrasse(adr.strasse || '');
    if(teil.strasse){
      var f = adrNorm(teil.strasse);
      if(f && adrNorm(st.name).indexOf(f) < 0) return false;
    }
    if(teil.nr && !adrNrPasst(teil.nr, st.nr)) return false;
    if(teil.plz && String(adr.plz || '') !== String(teil.plz)) return false;
    if(teil.ort){
      var o = adrNorm(teil.ort);
      if(o && adrNorm(adr.ort || '').indexOf(o) < 0 && adrNorm(adr.gemeinde || '').indexOf(o) < 0) return false;
    }
    return true;
  }

  /* kleiner = weiter oben */
  function adrRang(adr, teil){
    var st = adrTeileStrasse(adr.strasse || '');
    var name = adrNorm(st.name), f = adrNorm(teil.strasse || '');
    var r = 0;
    if(f){ var p = name.indexOf(f); r += (p === 0 ? 0 : (p > 0 ? 10 : 30)); }
    var gf = adrNr(teil.nr), ff = adrNr(st.nr);
    if(gf && ff && gf.roh !== ff.roh) r += 2;
    if(teil.plz && String(adr.plz || '') === String(teil.plz)) r -= 1;
    if(teil.ort && adrNorm(adr.ort || '').indexOf(adrNorm(teil.ort)) === 0) r -= 1;
    return r;
  }

  function adrSortiere(list, teil){
    return (list || []).slice().sort(function(a, b){
      var d = adrRang(a, teil) - adrRang(b, teil);
      if(d) return d;
      var na = adrTeileStrasse(a.strasse || ''), nb = adrTeileStrasse(b.strasse || '');
      if(na.name !== nb.name) return na.name < nb.name ? -1 : 1;
      var xa = adrNr(na.nr), xb = adrNr(nb.nr);
      if(xa && xb && xa.von !== xb.von) return xa.von - xb.von;
      return String(a.label || '') < String(b.label || '') ? -1 : 1;
    });
  }

  function _hinweisText(teil){
    var t = [];
    if(teil.nr) t.push('Nr. ' + teil.nr);
    if(teil.plz) t.push(teil.plz);
    if(teil.ort) t.push(teil.ort);
    return 'Keine Adresse mit ' + t.join(' · ') + ' — weitere Treffer:';
  }

  /* Filtern + Reihenfolge. Bleibt nach dem Filter nichts uebrig, werden
     die uebrigen Treffer trotzdem gezeigt — mit Hinweis, was fehlte
     (nichts faellt still weg). Bei einer Eingabe OHNE Nummer/PLZ/Ort
     (blosser Suchbegriff) wird nur sortiert, nicht gefiltert. */
  function adrFiltere(list, teil){
    var alle = adrSortiere(list || [], teil);
    var strukturiert = !!(teil.nr || teil.plz || teil.ort);
    var treffer = alle.filter(function(a){ return adrPasst(a, teil); });
    var hinweis = '';
    if(!treffer.length){
      treffer = alle;
      if(strukturiert && alle.length) hinweis = _hinweisText(teil);
    }
    var gekappt = Math.max(0, treffer.length - ADR_ANZEIGE);
    return { treffer: treffer.slice(0, ADR_ANZEIGE), alle: alle, gekappt: gekappt, hinweis: hinweis, teil: teil };
  }

  /* Suchtexte fuer swisstopo.
     Der zweite Text traegt NUR das Strassen-Fragment: bei einer
     Typeahead-Suche bekommt das LETZTE Wort die Platzhalter-Behandlung —
     «pfirterg 47» findet die Pfirtergasse darum oft nicht, «pfirterg» schon. */
  function adrQueries(teil){
    var qs = [];
    if(teil.roh) qs.push(teil.roh);
    if(teil.strasse && qs.indexOf(teil.strasse) < 0) qs.push(teil.strasse);
    return qs;
  }

  /* Gezielte Nachfrage, wenn die Hausnummer in der ersten Runde fehlte:
     aus den Treffern den VOLLEN Strassennamen lernen und «Pfirtergasse 47
     4054» nachschlagen. Ohne das haengt es am Zufall, ob die 47 unter den
     ersten Zeilen der Strasse liegt. */
  function adrNachfragen(list, teil){
    if(!teil.nr || !teil.strasse) return [];
    var f = adrNorm(teil.strasse), out = [], gesehen = {};
    adrSortiere(list || [], teil).forEach(function(a){
      var st = adrTeileStrasse(a.strasse || '');
      if(!st.name) return;
      if(f && adrNorm(st.name).indexOf(f) < 0) return;
      if(teil.plz && String(a.plz || '') !== String(teil.plz)) return;
      var k = adrNorm(st.name) + '|' + (a.plz || '');
      if(gesehen[k]) return;
      gesehen[k] = 1;
      var q = st.name + ' ' + teil.nr;
      if(a.plz) q += ' ' + a.plz;
      else if(a.ort) q += ' ' + a.ort;
      out.push(q);
    });
    return out.slice(0, ADR_NACHFRAGEN);
  }
  /*ENGINE-END*/

  function _resolve(idOrEl){
    if(!idOrEl) return null;
    if(typeof idOrEl === 'string') return document.getElementById(idOrEl);
    return idOrEl;
  }

  function _esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
      var st = adrTeileStrasse(strasse);
      return {
        strasse: strasse, plz: plz, ort: ort,
        strName: st.name, hausNr: st.nr,
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

  function _renderResults(erg, drop, ctx){
    var liste = (erg && erg.treffer) || [];
    if(!liste.length){
      drop.innerHTML = '<div class="gema-adr-loading">Keine Adresse gefunden</div>';
      drop.classList.add('open');
      drop._results = [];
      return;
    }
    var html = '';
    if(erg.hinweis) html += '<div class="gema-adr-hint">' + _esc(erg.hinweis) + '</div>';
    html += liste.map(function(r,i){
      return '<div class="gema-adr-item" data-idx="'+i+'" role="option">'
        + '<div class="gema-adr-main">' + _esc(r.strasse) + '</div>'
        + '<div class="gema-adr-sub">' + _esc(r.plz) + ' ' + _esc(r.ort)
        + (r.gemeinde && r.gemeinde !== r.ort ? ' · ' + _esc(r.gemeinde) : '')
        + '</div></div>';
    }).join('');
    if(erg.gekappt) html += '<div class="gema-adr-hint">… und ' + erg.gekappt + ' weitere — Suche verfeinern</div>';
    drop.innerHTML = html;
    drop.classList.add('open');
    drop._results = liste;
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

  /* Eine einzelne Abfrage — Ergebnis pro Suchtext gecacht, damit die
     mehreren Texte einer Eingabe (und die naechsten Tastendruecke)
     nicht mehrfach ans Netz gehen. */
  function _holeEine(text, st){
    var t = String(text == null ? '' : text).trim();
    if(!t) return Promise.resolve([]);
    if(_cache[t]) return Promise.resolve(_cache[t]);
    var url = SWISSTOPO_URL + '?searchText=' + encodeURIComponent(t)
      + '&type=locations&origins=address&limit=' + ADR_LIMIT + '&lang=de';
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function(data){
      var rows = _parseResults(data.results);
      _cache[t] = rows;
      return rows;
    }).catch(function(e){
      if(st) st.fehler = true;
      console.warn('[GemaAdresse] swisstopo:', e);
      return [];
    });
  }

  function _mergeKey(a){ return adrNorm((a.strasse||'') + '|' + (a.plz||'') + '|' + (a.ort||'')); }

  function _merge(sets){
    var out = [], gesehen = {};
    (sets || []).forEach(function(rows){
      (rows || []).forEach(function(a){
        var k = _mergeKey(a);
        if(gesehen[k]) return;
        gesehen[k] = 1;
        out.push(a);
      });
    });
    return out;
  }

  /* Suche fuer einen Eingabetext. Runde 1: die Suchtexte aus adrQueries.
     Runde 2 nur, wenn eine Hausnummer getippt wurde und in Runde 1 keine
     Adresse mit dieser Nummer kam — dann wird der volle Strassenname aus
     Runde 1 gelernt und gezielt nachgefragt. */
  function _suche(q){
    var teil = adrZerlege(q);
    var st = { fehler: false };
    return Promise.all(adrQueries(teil).map(function(t){ return _holeEine(t, st); }))
      .then(function(sets){
        var rows = _merge(sets);
        var hatNr = teil.nr && rows.some(function(a){ return adrPasst(a, teil); });
        if(!teil.nr || hatNr) return rows;
        var nach = adrNachfragen(rows, teil);
        if(!nach.length) return rows;
        return Promise.all(nach.map(function(t){ return _holeEine(t, st); }))
          .then(function(s2){ return _merge([rows].concat(s2)); });
      })
      .then(function(rows){
        var erg = adrFiltere(rows, teil);
        erg.fehler = st.fehler;
        erg.rohzeilen = rows;
        return erg;
      });
  }

  function _fetch(q, drop, ctx){
    var lauf = (ctx._lauf = (ctx._lauf || 0) + 1);
    drop.innerHTML = '<div class="gema-adr-loading">Suche…</div>';
    drop.classList.add('open');
    _suche(q).then(function(erg){
      if(ctx._lauf !== lauf) return;   // veraltete Antwort verwerfen
      if(!erg.treffer.length && erg.fehler){
        drop.innerHTML = '<div class="gema-adr-loading">Adress-API nicht erreichbar</div>';
        drop.classList.add('open');
        drop._results = [];
        return;
      }
      _renderResults(erg, drop, ctx);
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
    scan: _scan,
    suche: _suche,
    parse: _parseResults,
    // Engine (DOM-frei) — auch fuer Module mit eigenem Dropdown
    norm: adrNorm,
    nr: adrNr,
    teileStrasse: adrTeileStrasse,
    zerlege: adrZerlege,
    nrPasst: adrNrPasst,
    passt: adrPasst,
    rang: adrRang,
    sortiere: adrSortiere,
    filtere: adrFiltere,
    queries: adrQueries,
    nachfragen: adrNachfragen,
    ANZEIGE: ADR_ANZEIGE,
    LIMIT: ADR_LIMIT
  };
})(window);
