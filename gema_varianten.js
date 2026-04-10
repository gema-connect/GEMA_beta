/**
 * gema_varianten.js — GEMA Variantenvergleich v1
 *
 * Generischer Side-by-Side-Vergleich für sa_/sb_-Berechnungsmodule.
 * Speichert Snapshot aller Felder (input/select/textarea + KPI/Result-Spans)
 * pro Modul + Objekt + Phase. Bietet Vergleich-Modal mit Diff-Spalte.
 *
 * Einbindung (nach gema_objekte_api.js):
 *   <script src="gema_varianten.js"></script>
 *   <script>GemaVarianten.init({modul:'enthaertung', titel:'Enthärtungsanlage'});</script>
 *
 * Public API:
 *   GemaVarianten.save(name)        // Variante mit Namen speichern
 *   GemaVarianten.list()            // alle Varianten (für aktives Objekt+Phase)
 *   GemaVarianten.load(id)          // Variante in Formular laden
 *   GemaVarianten.delete(id)        // Variante löschen
 *   GemaVarianten.openVergleich()   // Modal öffnen
 */
(function(w){
  'use strict';

  var _modul = '';
  var _titel = '';
  var _initialized = false;

  // ─── Storage ───
  function _baseKey(){ return 'gema_varianten_'+_modul; }
  function _key(){
    if(typeof GemaObjekte !== 'undefined' && GemaObjekte.storageKey){
      return GemaObjekte.storageKey(_baseKey());
    }
    return _baseKey();
  }
  function _load(){
    try {
      var raw = localStorage.getItem(_key());
      if(raw) return JSON.parse(raw) || [];
    } catch(e){}
    return [];
  }
  function _save(list){
    try { localStorage.setItem(_key(), JSON.stringify(list)); } catch(e){}
  }

  // ─── Snapshot (alle Felder + KPIs/Results) ───
  // Sammelt input/select/textarea Werte UND .g-kpi-val / [data-result] / [id^='k_'] Texte
  function _snapshot(){
    var snap = { inputs:{}, results:{}, ts: Date.now() };
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(function(el){
      if(el.closest('.modal-bg, .modal, #gfb-root, .gema-feedback-overlay, #gema-varianten-modal')) return;
      if(el.type === 'button' || el.type === 'submit' || el.type === 'file') return;
      if(el.type === 'checkbox' || el.type === 'radio'){
        snap.inputs[el.id] = el.checked;
      } else {
        snap.inputs[el.id] = el.value;
      }
    });
    // Results: alles mit class g-kpi-val, k-val, oder id beginnend mit k_/r_/result_
    document.querySelectorAll('.g-kpi-val, .g-result-val, [data-variant-result]').forEach(function(el){
      var id = el.id || el.getAttribute('data-variant-result');
      if(id) snap.results[id] = (el.textContent||'').trim();
    });
    document.querySelectorAll('[id^="k_"], [id^="r_"], [id^="res_"]').forEach(function(el){
      if(snap.results[el.id]) return;
      var t = (el.textContent||'').trim();
      if(t && t.length < 60) snap.results[el.id] = t;
    });
    return snap;
  }

  // ─── Restore Snapshot ───
  function _restore(snap){
    if(!snap || !snap.inputs) return;
    Object.keys(snap.inputs).forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      if(el.type === 'checkbox' || el.type === 'radio'){
        el.checked = !!snap.inputs[id];
      } else {
        el.value = snap.inputs[id] != null ? snap.inputs[id] : '';
      }
      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch(e){}
    });
  }

  // ─── API ───
  function save(name){
    var list = _load();
    var snap = _snapshot();
    snap.id = 'var_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    snap.name = (name||'').trim() || ('Variante '+(list.length+1));
    list.push(snap);
    _save(list);
    _renderBadge();
    _toast('💾 Variante "'+snap.name+'" gespeichert');
    return snap;
  }
  function list(){ return _load(); }
  function loadVariante(id){
    var v = _load().find(function(x){ return x.id === id; });
    if(!v){ _toast('⚠ Variante nicht gefunden'); return; }
    _restore(v);
    _toast('✓ Variante "'+v.name+'" geladen');
  }
  function deleteVariante(id){
    var l = _load().filter(function(x){ return x.id !== id; });
    _save(l);
    _renderBadge();
    var modal = document.getElementById('gema-varianten-modal');
    if(modal && modal.style.display !== 'none') openVergleich();
  }

  // ─── Field-Label Resolver ───
  // Versucht, ein nutzerfreundliches Label für eine field-id zu finden.
  function _label(id){
    var el = document.getElementById(id);
    if(!el) return id;
    // 1. <label for="id">
    var lbl = document.querySelector('label[for="'+id+'"]');
    if(lbl) return (lbl.textContent||'').trim();
    // 2. nächstgelegenes <label> Parent
    var parentLbl = el.closest('label');
    if(parentLbl){
      // Klone und entferne Inputs für sauberen Text
      var c = parentLbl.cloneNode(true);
      c.querySelectorAll('input,select,textarea').forEach(function(x){ x.remove(); });
      var t = (c.textContent||'').trim();
      if(t) return t;
    }
    // 3. Fallback: id schöner machen
    return id.replace(/^meta/,'').replace(/_/g,' ').replace(/([A-Z])/g,' $1').trim();
  }

  // ─── Vergleich-Modal ───
  function openVergleich(){
    var list = _load();
    var modal = document.getElementById('gema-varianten-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'gema-varianten-modal';
      modal.className = 'no-print';
      Object.assign(modal.style, {
        position:'fixed', inset:'0', background:'rgba(15,23,42,.7)',
        zIndex:'10000', display:'flex', alignItems:'flex-start', justifyContent:'center',
        padding:'40px 20px', overflowY:'auto'
      });
      modal.addEventListener('click', function(e){ if(e.target === modal) modal.style.display='none'; });
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';

    if(!list.length){
      modal.innerHTML = _wrap('<div style="padding:40px;text-align:center;color:#64748b">Noch keine Varianten gespeichert. Klicke <b>💾 Variante</b> in der Toolbar, um die aktuelle Berechnung als Variante zu sichern.</div>');
      return;
    }

    // Spalten = Varianten + Diff (wenn ≥ 2)
    var cols = list.slice();
    var hasDiff = cols.length >= 2;

    // Sammle alle KPI-IDs (results) und alle relevanten Input-IDs
    var resKeys = {};
    var inpKeys = {};
    cols.forEach(function(v){
      Object.keys(v.results||{}).forEach(function(k){ resKeys[k] = true; });
      Object.keys(v.inputs||{}).forEach(function(k){
        // Nur "interessante" Inputs (skip leer/UI-Helper)
        var val = v.inputs[k];
        if(val == null || val === '' || val === false) return;
        if(/^(metaObjektDropdown|objComboBtn|search|filterSort|t_|tab)/.test(k)) return;
        inpKeys[k] = true;
      });
    });

    var resList = Object.keys(resKeys).sort();
    var inpList = Object.keys(inpKeys).sort();

    function _diff(values){
      // Numerische Werte → Diff zwischen erstem und letztem
      var nums = values.map(function(v){ return parseFloat(String(v).replace(/,/g,'.').replace(/[^\d.-]/g,'')); }).filter(function(n){ return !isNaN(n); });
      if(nums.length < 2) return '';
      var d = nums[nums.length-1] - nums[0];
      if(d === 0) return '<span style="color:#64748b">±0</span>';
      var cls = d > 0 ? '#16a34a' : '#dc2626';
      var sign = d > 0 ? '+' : '';
      return '<span style="color:'+cls+';font-weight:700">'+sign+d.toFixed(2)+'</span>';
    }

    function _row(label, values, isResult){
      var cells = values.map(function(v){
        return '<td style="padding:7px 11px;border-bottom:1px solid #e5e7eb;font-size:12.5px;'+(isResult?'font-weight:700;background:#f8fafc':'')+'">'+
          (v == null || v === '' ? '<span style="color:#cbd5e1">—</span>' : _esc(String(v))) +
        '</td>';
      }).join('');
      var diffCell = hasDiff ? '<td style="padding:7px 11px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right">'+_diff(values)+'</td>' : '';
      return '<tr><td style="padding:7px 11px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#475569;font-weight:600">'+_esc(label)+'</td>'+cells+diffCell+'</tr>';
    }

    var headCells = cols.map(function(v){
      return '<th style="padding:10px 11px;background:#0f172a;color:#fff;font-size:12px;font-weight:700;text-align:left">'+
        _esc(v.name)+
        '<div style="font-weight:400;font-size:10px;color:#94a3b8;margin-top:2px">'+(new Date(v.ts).toLocaleString('de-CH'))+'</div>'+
      '</th>';
    }).join('');
    var diffHead = hasDiff ? '<th style="padding:10px 11px;background:#0f172a;color:#fff;font-size:12px;font-weight:700;text-align:right">Δ (1→letzte)</th>' : '';

    var actionCells = cols.map(function(v){
      return '<td style="padding:7px 11px;background:#f1f5f9">'+
        '<button onclick="GemaVarianten.load(\''+v.id+'\')" style="padding:4px 9px;border-radius:5px;border:1px solid #2563eb;background:#2563eb;color:#fff;font-size:11px;cursor:pointer;font-weight:600;margin-right:4px">📥 Laden</button>'+
        '<button onclick="if(confirm(\'Variante &laquo;'+_esc(v.name).replace(/'/g,"\\'")+'&raquo; wirklich löschen?\'))GemaVarianten.delete(\''+v.id+'\')" style="padding:4px 9px;border-radius:5px;border:1px solid #dc2626;background:#fff;color:#dc2626;font-size:11px;cursor:pointer;font-weight:600">🗑</button>'+
      '</td>';
    }).join('');

    var resRows = resList.map(function(id){
      return _row(_label(id), cols.map(function(v){ return (v.results||{})[id]; }), true);
    }).join('');
    var inpRows = inpList.map(function(id){
      return _row(_label(id), cols.map(function(v){ return (v.inputs||{})[id]; }), false);
    }).join('');

    var html =
      '<div style="display:flex;align-items:center;gap:12px;padding:18px 24px;border-bottom:2px solid #e5e7eb;background:#f8fafc">'+
        '<div style="font-size:18px;font-weight:800;color:#0f172a;flex:1">📊 Variantenvergleich · '+_esc(_titel||_modul)+'</div>'+
        '<div style="font-size:12px;color:#64748b">'+cols.length+' '+(cols.length===1?'Variante':'Varianten')+'</div>'+
        '<button onclick="document.getElementById(\'gema-varianten-modal\').style.display=\'none\'" style="padding:6px 14px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;color:#475569;font-size:13px;cursor:pointer;font-weight:600">✕ Schliessen</button>'+
      '</div>'+
      '<div style="overflow-x:auto;max-height:75vh">'+
        '<table style="width:100%;border-collapse:collapse;font-family:DM Sans,system-ui,sans-serif">'+
          '<thead><tr>'+
            '<th style="padding:10px 11px;background:#0f172a;color:#fff;font-size:12px;font-weight:700;text-align:left;width:200px">Feld</th>'+
            headCells+diffHead+
          '</tr></thead>'+
          '<tbody>'+
            '<tr><td colspan="'+(cols.length+1+(hasDiff?1:0))+'" style="padding:8px 11px;background:#dbeafe;font-size:11px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:.5px">Aktionen</td></tr>'+
            '<tr><td></td>'+actionCells+(hasDiff?'<td></td>':'')+'</tr>'+
            (resRows ? '<tr><td colspan="'+(cols.length+1+(hasDiff?1:0))+'" style="padding:8px 11px;background:#dcfce7;font-size:11px;font-weight:700;color:#14532d;text-transform:uppercase;letter-spacing:.5px">Resultate / KPIs</td></tr>'+resRows : '')+
            (inpRows ? '<tr><td colspan="'+(cols.length+1+(hasDiff?1:0))+'" style="padding:8px 11px;background:#fef3c7;font-size:11px;font-weight:700;color:#78350f;text-transform:uppercase;letter-spacing:.5px">Eingaben</td></tr>'+inpRows : '')+
          '</tbody>'+
        '</table>'+
      '</div>';

    modal.innerHTML = _wrap(html);
  }

  function _wrap(inner){
    return '<div style="background:#fff;border-radius:12px;max-width:1200px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden">'+inner+'</div>';
  }

  // ─── Toolbar Buttons (auto-inject in .g-nav-right oder .project-bar) ───
  function _renderBadge(){
    var btn = document.getElementById('gema-vergleich-btn');
    if(btn){
      var n = _load().length;
      btn.innerHTML = '📊 Vergleich' + (n ? ' ('+n+')' : '');
      btn.disabled = (n === 0);
      btn.style.opacity = n === 0 ? '0.55' : '1';
      btn.style.cursor = n === 0 ? 'not-allowed' : 'pointer';
    }
  }

  function _injectButtons(){
    if(document.getElementById('gema-variante-btn')) return;
    var host = document.querySelector('.g-nav-right');
    if(!host) return;

    var saveBtn = document.createElement('button');
    saveBtn.id = 'gema-variante-btn';
    saveBtn.className = 'g-nav-btn no-print';
    saveBtn.title = 'Aktuellen Stand als Variante speichern';
    saveBtn.innerHTML = '💾 Variante';
    saveBtn.onclick = function(){
      var n = prompt('Name der Variante:', 'Variante '+(_load().length+1));
      if(n !== null) save(n);
    };

    var cmpBtn = document.createElement('button');
    cmpBtn.id = 'gema-vergleich-btn';
    cmpBtn.className = 'g-nav-btn no-print';
    cmpBtn.title = 'Side-by-Side-Vergleich öffnen';
    cmpBtn.onclick = openVergleich;

    // Vor dem PDF/Drucken/Feedback einfügen, falls vorhanden
    var insertBefore = host.querySelector('.gema-feedback-btn') || host.firstChild;
    host.insertBefore(saveBtn, insertBefore);
    host.insertBefore(cmpBtn, insertBefore);

    _renderBadge();
  }

  // ─── Toast ───
  var _toastEl = null, _toastTimer = null;
  function _toast(msg){
    if(!_toastEl){
      _toastEl = document.createElement('div');
      Object.assign(_toastEl.style, {
        position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
        background:'#0f172a', color:'#fff', padding:'10px 18px', borderRadius:'10px',
        fontSize:'13px', fontWeight:'600', zIndex:'10001',
        boxShadow:'0 4px 20px rgba(0,0,0,.3)', opacity:'0', transition:'opacity .25s',
        pointerEvents:'none'
      });
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.style.opacity = '1';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function(){ _toastEl.style.opacity = '0'; }, 2200);
  }

  function _esc(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Init ───
  function init(opts){
    if(_initialized) return;
    opts = opts || {};
    _modul = opts.modul || (document.title.toLowerCase().match(/[a-zäöü]+/g)||['modul']).pop();
    _titel = opts.titel || document.title.replace(/GEMA[^a-zA-ZäöüÄÖÜ]*/,'').trim();
    _initialized = true;

    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', _injectButtons);
    } else {
      _injectButtons();
    }
    // Re-inject bei spät erstellter Nav
    try {
      var mo = new MutationObserver(function(){ _injectButtons(); });
      mo.observe(document.documentElement, { childList:true, subtree:true });
      setTimeout(function(){ try { mo.disconnect(); } catch(e){} }, 6000);
    } catch(e){}

    // Bei Objekt/Phase-Wechsel Badge aktualisieren
    window.addEventListener('gema-objekt-changed', _renderBadge);
    window.addEventListener('gema-phase-changed', _renderBadge);
  }

  w.GemaVarianten = {
    init: init,
    save: save,
    list: list,
    load: loadVariante,
    delete: deleteVariante,
    openVergleich: openVergleich
  };

  // ── Auto-Init für Berechnungsmodule (sb_*, sa_*) ──
  function _autoInit(){
    if(_initialized) return;
    var fname = (location.pathname.split('/').pop()||'').toLowerCase();
    if(!/^(sb_|sa_)/.test(fname)) return;            // nur Berechnungsmodule
    if(fname === 'sb_index.html') return;            // Hub-Seite skippen
    if(!document.querySelector('.g-nav-right')) return;
    var modul = fname.replace(/\.html?$/,'').replace(/^(sb_|sa_)/,'');
    var titel = '';
    var t = document.querySelector('.gema-hero-title, .hero-title');
    if(t) titel = (t.textContent||'').trim();
    init({ modul: modul, titel: titel });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _autoInit);
  } else {
    _autoInit();
  }
})(window);
