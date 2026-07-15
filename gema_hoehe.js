/* gema_hoehe.js — Höhen-Übernahme ab Karte (swisstopo)
 *
 * Ermittelt die Terrainhöhe [m ü.M.] am Projektstandort über den offiziellen
 * swisstopo-Höhendienst (GeoAdmin API, swissALTI3D — Gelände OHNE Gebäude):
 *   https://api3.geo.admin.ch/rest/services/height?easting=E&northing=N&sr=2056
 * Adresse → Geocoding (SearchServer, wie GemaAdresse) → LV95 → Höhe.
 * Der Punkt ist auf einer gezoomten Luftbild-Karte sichtbar und im Vollbild
 * verschiebbar (Strasse/Trottoir statt Gebäudemitte) — jede Verschiebung
 * fragt die Höhe neu ab. «Übernehmen» schreibt den Wert ins Modul-Feld.
 *
 * Verwendung (pro Modul ein Widget):
 *   <div id="ddHoehe"></div>
 *   GemaHoehe.attach({
 *     container:  '#ddHoehe',
 *     stateId:    'ddGhState',            // ID des Hidden-State-Inputs (AutoSave!)
 *     applyLabel: '→ Höhe Verteilbatterie übernehmen',
 *     mode:       'm',                    // 'm' (m ü.M.) oder 'mbar' (Luftdruck)
 *     onApply:    function(res){ ... }    // res = {hoehe, mbar, e, n, lat, lon, adresse, korrigiert}
 *   });
 *
 * Persistenz: Zustand als JSON im Hidden-Input <stateId> — wird von
 * GemaAutoSave pro Objekt gespeichert/wiederhergestellt (Muster #zk_rows).
 * Offline/API-Fehler: klare Meldung, manuelle Eingabe im Modul bleibt möglich.
 * Test-Hooks: window._ghHooks.
 */
(function(w){
  'use strict';
  if (w.GemaHoehe) return;

  var API_HOEHE = 'https://api3.geo.admin.ch/rest/services/height';
  var API_SEARCH = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';
  var TILE_LUFT = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg';
  var TILE_KARTE = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg';
  var LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  var LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';

/*ENGINE-START*/
// ── WGS84 → LV95 (offizielle swisstopo-Näherungsformeln, ~1 m genau) ──
// identisch mit rkWGS84toLV95 in sb_niederschlag (RK-Engine)
function ghWgs84ToLV95(lat, lng){
  var p = (lat * 3600 - 169028.66) / 10000;
  var l = (lng * 3600 - 26782.5) / 10000;
  var E = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l * l * l;
  var N = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p * p * p;
  return { E: E, N: N };
}
// ── Höhe → Luftdruck [mbar] (barometrische Höhenformel, wie sb_saugpumpe) ──
function ghLuftdruckMbar(h){
  return 101325 * Math.pow((288 - (0.0065 * (h || 0))) / 288, 5.255) / 100;
}
// ── Distanz zweier WGS84-Punkte in Metern (äquirektangulare Näherung, Kurzstrecke) ──
function ghDistM(lat1, lon1, lat2, lon2){
  var R = 6371000, rad = Math.PI / 180;
  var x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  var y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * R;
}
// ── Schweizer Koordinaten-Format: 2611234 → 2'611'234 ──
function ghFmtCoord(v){
  return String(Math.round(Number(v))).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}
// ── Plausibilität: Punkt grob in der Schweiz? (WGS84-Bounding-Box) ──
function ghInCH(lat, lon){
  return isFinite(lat) && isFinite(lon) && lat > 45.5 && lat < 48.1 && lon > 5.7 && lon < 10.8;
}
/*ENGINE-END*/

  // ── Styles (einmalig injiziert) ──
  var CSS = ''
    + '.gh-card{border:1.5px solid var(--border,#e2e7f0);border-radius:12px;background:var(--surface2,#f8faff);margin:8px 0 4px;overflow:hidden}'
    + '.gh-hd{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border,#e2e7f0)}'
    + '.gh-hd .t{font-size:12px;font-weight:800;color:var(--text,#111827);flex:1}'
    + '.gh-hd .src{font-size:10px;color:var(--muted,#6b7280);white-space:nowrap}'
    + '.gh-bd{padding:10px 12px}'
    + '.gh-adr-row{display:flex;gap:6px;align-items:stretch}'
    + '.gh-adr-row>span{flex:1}'
    + '.gh-adr{width:100%;padding:7px 10px;border:1.5px solid var(--border2,#cdd4e4);border-radius:8px;font-size:12.5px;font-family:inherit;color:var(--text,#111827);background:var(--surface,#fff);outline:none}'
    + '.gh-adr:focus{border-color:var(--accent,#2563eb);box-shadow:0 0 0 3px rgba(37,99,235,.08)}'
    + '.gh-btn{padding:7px 10px;border:1.5px solid var(--border2,#cdd4e4);border-radius:8px;background:var(--surface,#fff);color:var(--text2,#374151);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;transition:.15s}'
    + '.gh-btn:hover{background:var(--bg2,#edf0f7)}'
    + '.gh-btn.pri{background:var(--accent,#2563eb);border-color:var(--accent-dk,#1d4ed8);color:#fff}'
    + '.gh-btn.pri:hover{background:var(--accent-dk,#1d4ed8)}'
    + '.gh-btn[disabled]{opacity:.5;cursor:default}'
    + '.gh-res{display:flex;gap:12px;margin-top:10px;align-items:stretch}'
    + '.gh-mapwrap{position:relative;width:46%;min-width:180px;height:172px;border-radius:10px;overflow:hidden;border:1.5px solid var(--border2,#cdd4e4);background:#e5e7eb;flex-shrink:0}'
    + '.gh-map{position:absolute;inset:0;z-index:1}'
    + '.gh-map-overlay{position:absolute;inset:0;z-index:540;cursor:pointer;display:flex;align-items:flex-end;justify-content:flex-end;background:transparent;border:none;width:100%;padding:8px}'
    + '.gh-map-overlay .zoombtn{background:rgba(255,255,255,.95);border:1px solid var(--border2,#cdd4e4);border-radius:8px;padding:4px 9px;font-size:11px;font-weight:700;color:var(--text2,#374151);box-shadow:0 2px 8px rgba(0,0,0,.15);pointer-events:none}'
    + '.gh-attr{position:absolute;right:5px;top:4px;z-index:520;font-size:9.5px;color:#334155;background:rgba(255,255,255,.75);border-radius:5px;padding:0 5px;pointer-events:none}'
    + '.gh-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#64748b;text-align:center;padding:10px;z-index:2}'
    + '.gh-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}'
    + '.gh-val{font-size:23px;font-weight:800;color:var(--accent-dk,#1d4ed8);line-height:1.1;font-variant-numeric:tabular-nums}'
    + '.gh-val small{font-size:12px;font-weight:700;color:var(--muted,#6b7280)}'
    + '.gh-val2{font-size:13px;font-weight:700;color:var(--text2,#374151);font-variant-numeric:tabular-nums}'
    + '.gh-sub{font-size:10.5px;color:var(--muted,#6b7280);line-height:1.45;font-variant-numeric:tabular-nums}'
    + '.gh-badge{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;background:#fffbeb;border:1px solid #fde68a;color:#d97706}'
    + '.gh-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:6px}'
    + '.gh-actions .gh-btn{white-space:normal;max-width:100%;text-align:left;line-height:1.35}'
    + '.gh-msg{margin-top:8px;font-size:11.5px;color:var(--muted,#6b7280);line-height:1.5}'
    + '.gh-msg.err{color:#dc2626}'
    + '.gh-print-line{display:none;font-size:11px;color:#111;margin-top:6px}'
    + '.gh-pin{position:relative;width:26px;height:34px}'
    + '.gh-pin .b{position:absolute;left:50%;top:0;transform:translateX(-50%);width:22px;height:22px;border-radius:50% 50% 50% 0;background:#dc2626;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);transform:translateX(-50%) rotate(-45deg)}'
    + '.gh-pin .c{position:absolute;left:50%;top:6px;transform:translateX(-50%);width:7px;height:7px;border-radius:50%;background:#fff}'
    + '.gh-modal-bg{position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.6);display:none;align-items:center;justify-content:center;padding:20px}'
    + '.gh-modal-bg.open{display:flex}'
    + '.gh-modal{background:var(--surface,#fff);width:100%;max-width:1100px;height:86vh;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.35)}'
    + '.gh-modal-hd{display:flex;align-items:center;gap:12px;padding:calc(12px + env(safe-area-inset-top,0px)) 18px 12px;border-bottom:1px solid var(--border,#e2e7f0);flex-wrap:wrap}'
    + '.gh-modal-title{font-size:15px;font-weight:800}'
    + '.gh-modal-sub{font-size:11.5px;color:var(--muted,#6b7280);margin-top:1px}'
    + '.gh-modal-x{margin-left:auto;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted,#6b7280);padding:4px 8px}'
    + '.gh-seg{display:inline-flex;background:var(--bg2,#edf0f7);padding:3px;border-radius:9px;border:1.5px solid var(--border,#e2e7f0)}'
    + '.gh-seg button{padding:4px 11px;border-radius:7px;border:none;background:transparent;color:var(--muted,#6b7280);font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit}'
    + '.gh-seg button.on{background:var(--surface,#fff);color:var(--accent,#2563eb);box-shadow:0 1px 3px rgba(0,0,0,.1)}'
    + '.gh-modal-map{flex:1;min-height:0}'
    + '.gh-modal-ft{display:flex;align-items:center;gap:12px;padding:10px 18px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border,#e2e7f0);flex-wrap:wrap}'
    + '.gh-modal-val{font-size:17px;font-weight:800;color:var(--accent-dk,#1d4ed8);font-variant-numeric:tabular-nums}'
    + '.gh-modal-coord{font-size:11px;color:var(--muted,#6b7280);font-variant-numeric:tabular-nums}'
    + '.gh-modal-ft .sp{flex:1}'
    + '@media(max-width:640px){.gh-res{flex-direction:column}.gh-mapwrap{width:100%}.gh-modal-bg{padding:0}.gh-modal{max-width:none;height:100%;border-radius:0}}'
    + '@media print{.gh-hd,.gh-bd>.gh-adr-row,.gh-res,.gh-msg{display:none!important}.gh-card{border:none;background:none;margin:0}.gh-print-line{display:block}}';

  function injectCss(){
    if (document.getElementById('_ghCss')) return;
    var s = document.createElement('style');
    s.id = '_ghCss';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── Leaflet lazy laden (nur wenn Karte gebraucht wird) ──
  var _leafletPromise = null;
  function ensureLeaflet(){
    if (w.L) return Promise.resolve(true);
    if (_leafletPromise) return _leafletPromise;
    _leafletPromise = new Promise(function(resolve){
      try {
        if (!document.querySelector('link[href*="leaflet"]')){
          var l = document.createElement('link');
          l.rel = 'stylesheet'; l.href = LEAFLET_CSS;
          document.head.appendChild(l);
        }
        var sc = document.createElement('script');
        sc.src = LEAFLET_JS;
        sc.onload = function(){ resolve(!!w.L); };
        sc.onerror = function(){ resolve(false); };
        document.head.appendChild(sc);
        setTimeout(function(){ resolve(!!w.L); }, 8000);
      } catch(e){ resolve(false); }
    });
    return _leafletPromise;
  }

  // ── API-Aufrufe ──
  function fetchHoehe(E, N, signal){
    var u = API_HOEHE + '?easting=' + encodeURIComponent(Math.round(E * 10) / 10)
      + '&northing=' + encodeURIComponent(Math.round(N * 10) / 10) + '&sr=2056';
    return fetch(u, { signal: signal }).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(j){
      var h = parseFloat(j && j.height);
      if (!isFinite(h)) throw new Error('Keine Höhe in der Antwort');
      return h;
    });
  }
  function geocode(text){
    var u = API_SEARCH + '?type=locations&origins=address,zipcode,gg25&limit=1&lang=de&searchText=' + encodeURIComponent(text);
    return fetch(u).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
      var a = j && j.results && j.results[0] && j.results[0].attrs;
      if (!a || a.lat == null || a.lon == null) return null;
      return { lat: Number(a.lat), lon: Number(a.lon), label: String(a.label || '').replace(/<[^>]+>/g, '') };
    });
  }

  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function projektAdresseText(){
    try {
      if (typeof GemaObjekte === 'undefined' || !GemaObjekte.getActive) return null;
      var o = GemaObjekte.getActive(); if (!o) return null;
      var t = [(o.strasse || '').trim(), [(o.plz || '').trim(), (o.ort || '').trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      return t || null;
    } catch(e){ return null; }
  }

  var _instances = {};
  var _modal = null; // shared Vollbild-Modal {bg, map, marker, layerLuft, layerKarte, inst}

  // ═══════════════ Widget-Instanz ═══════════════
  function attach(opts){
    injectCss();
    opts = opts || {};
    var cont = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!cont) return null;
    var key = opts.stateId || 'ghState';
    var mode = opts.mode === 'mbar' ? 'mbar' : 'm';

    var inst = {
      key: key, mode: mode, opts: opts, cont: cont,
      state: null,          // {lat, lon, e, n, hoehe, adresse, origLat, origLon, korrigiert}
      mini: null, miniMarker: null,
      abort: null, busy: false
    };
    _instances[key] = inst;

    // ── DOM ──
    cont.innerHTML = ''
      + '<div class="gh-card">'
      + '  <div class="gh-hd"><span>🗺️</span><span class="t">' + esc(opts.titel || 'Höhe ab Karte (Strassenniveau)') + '</span><span class="src">swisstopo · swissALTI3D</span></div>'
      + '  <div class="gh-bd">'
      + '    <div class="gh-adr-row">'
      + '      <span><input class="gh-adr" id="' + key + '_adr" type="text" placeholder="Adresse suchen …" autocomplete="off"/></span>'
      + '      <button type="button" class="gh-btn" id="' + key + '_btnObj" title="Adresse des aktiven Objekts übernehmen">📍 Projektadresse</button>'
      + '    </div>'
      + '    <div class="gh-res" id="' + key + '_res" style="display:none">'
      + '      <div class="gh-mapwrap"><div class="gh-map" id="' + key + '_map"></div><div class="gh-attr">© swisstopo</div>'
      + '        <div class="gh-ph" id="' + key + '_ph" style="display:none"></div>'
      + '        <button type="button" class="gh-map-overlay" id="' + key + '_open" title="Karte öffnen — Punkt verschieben"><span class="zoombtn">Karte öffnen ⤢</span></button>'
      + '      </div>'
      + '      <div class="gh-info">'
      + '        <div class="gh-val" id="' + key + '_val">–</div>'
      + (mode === 'mbar' ? '<div class="gh-val2" id="' + key + '_val2">–</div>' : '')
      + '        <div class="gh-sub" id="' + key + '_sub"></div>'
      + '        <span class="gh-badge" id="' + key + '_badge" style="display:none">📌 Punkt manuell korrigiert</span>'
      + '        <div class="gh-actions">'
      + '          <button type="button" class="gh-btn pri" id="' + key + '_apply">' + esc(opts.applyLabel || '→ Höhe übernehmen') + '</button>'
      + '        </div>'
      + '      </div>'
      + '    </div>'
      + '    <div class="gh-msg" id="' + key + '_msg">Adresse suchen oder «📍 Projektadresse» — der Punkt lässt sich im Vollbild aufs Strassenniveau schieben (Luftbild zeigt Strasse/Trottoir/Garten/Gebäude).</div>'
      + '    <div class="gh-print-line" id="' + key + '_print"></div>'
      + '    <input type="hidden" id="' + key + '"/>'
      + '  </div>'
      + '</div>';

    var elAdr = document.getElementById(key + '_adr');
    var elState = document.getElementById(key);

    function el(sub){ return document.getElementById(key + (sub ? '_' + sub : '')); }
    function msg(text, isErr){
      var m = el('msg'); if (!m) return;
      m.textContent = text || '';
      m.style.display = text ? '' : 'none';
      m.className = 'gh-msg' + (isErr ? ' err' : '');
    }

    // ── State → UI ──
    function render(){
      var s = inst.state;
      var res = el('res');
      if (!s || !isFinite(s.hoehe)){
        if (res) res.style.display = 'none';
        var p0 = el('print'); if (p0) p0.textContent = '';
        return;
      }
      if (res) res.style.display = '';
      var v = el('val');
      if (v) v.innerHTML = (Math.round(s.hoehe * 10) / 10).toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' <small>m ü.M.</small>';
      if (mode === 'mbar'){
        var v2 = el('val2');
        if (v2) v2.textContent = '→ Luftdruck ' + Math.round(ghLuftdruckMbar(s.hoehe)) + ' mbar';
      }
      var sub = el('sub');
      if (sub) sub.innerHTML = 'LV95 ' + ghFmtCoord(s.e) + ' / ' + ghFmtCoord(s.n) + (s.adresse ? '<br>' + esc(s.adresse) : '');
      var b = el('badge'); if (b) b.style.display = s.korrigiert ? '' : 'none';
      var pl = el('print');
      if (pl) pl.textContent = 'Höhe ab Karte (swisstopo swissALTI3D): ' + (Math.round(s.hoehe * 10) / 10).toLocaleString('de-CH', { minimumFractionDigits: 1 })
        + ' m ü.M.' + (mode === 'mbar' ? ' → ' + Math.round(ghLuftdruckMbar(s.hoehe)) + ' mbar' : '')
        + ' · LV95 ' + ghFmtCoord(s.e) + ' / ' + ghFmtCoord(s.n)
        + (s.korrigiert ? ' · Punkt manuell korrigiert' : '');
      renderMini();
    }

    function persist(){
      if (!elState) return;
      try { elState.value = inst.state ? JSON.stringify(inst.state) : ''; } catch(e){}
      // AutoSave über bestehende Listener triggern (input mit id, bubbles)
      try { elState.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
    }
    function restoreFromInput(){
      var raw = (elState && elState.value || '').trim();
      var s = null;
      if (raw){ try { s = JSON.parse(raw); } catch(e){ s = null; } }
      // Fallback: direkt aus dem AutoSave-Snapshot lesen (Muster bgLoadFromSnapshot,
      // br_gasloeschung) — die _restore-Event-Kette ist timing-anfällig, wenn das
      // Widget nach dem AutoSave-Restore gerendert wird.
      if ((!s || !isFinite(s.hoehe)) && opts.autosaveModul){
        var snap = readSnapshotState();
        if (snap){ s = snap; if (elState){ try { elState.value = JSON.stringify(snap); } catch(e){} } }
      }
      inst.state = (s && isFinite(s.hoehe)) ? s : null;
      if (inst.state) msg('');
      render();
    }
    function readSnapshotState(){
      var base = 'gema_' + opts.autosaveModul;
      var keys = [base];
      try {
        if (typeof GemaObjekte !== 'undefined' && GemaObjekte.storageKey){
          var k = GemaObjekte.storageKey(base);
          if (k && keys.indexOf(k) < 0) keys.unshift(k);
        }
      } catch(e){}
      for (var i = 0; i < keys.length; i++){
        try {
          var rawSnap = localStorage.getItem(keys[i]);
          if (!rawSnap) continue;
          var d = JSON.parse(rawSnap);
          var v = d && d[key];
          if (!v) continue;
          var s = JSON.parse(v);
          if (s && isFinite(s.hoehe)) return s;
        } catch(e){}
      }
      return null;
    }

    // ── Punkt setzen (Geocode-Treffer oder Korrektur) → Höhe abfragen ──
    function setPoint(lat, lon, adresseLabel, isCorrection){
      if (!ghInCH(lat, lon)){ msg('Punkt liegt ausserhalb der Schweiz — der swisstopo-Höhendienst deckt nur die Schweiz ab.', true); return Promise.resolve(null); }
      var lv = ghWgs84ToLV95(lat, lon);
      if (inst.abort){ try { inst.abort.abort(); } catch(e){} }
      var ac = ('AbortController' in w) ? new AbortController() : null;
      inst.abort = ac;
      inst.busy = true;
      msg('Höhe wird abgefragt …');
      return fetchHoehe(lv.E, lv.N, ac && ac.signal).then(function(h){
        inst.busy = false;
        var prev = inst.state;
        var orig = isCorrection && prev ? { origLat: prev.origLat, origLon: prev.origLon } : { origLat: lat, origLon: lon };
        var korr = isCorrection ? (ghDistM(orig.origLat, orig.origLon, lat, lon) > 1.5) : false;
        inst.state = {
          lat: lat, lon: lon, e: Math.round(lv.E * 10) / 10, n: Math.round(lv.N * 10) / 10,
          hoehe: h,
          adresse: adresseLabel != null ? adresseLabel : (prev ? prev.adresse : ''),
          origLat: orig.origLat, origLon: orig.origLon,
          korrigiert: korr
        };
        msg('');
        persist();
        render();
        syncModal();
        return inst.state;
      }).catch(function(err){
        inst.busy = false;
        if (err && err.name === 'AbortError') return null;
        msg('Höhendienst nicht erreichbar (' + (err && err.message || 'Netzwerk') + ') — Höhe bitte manuell im Feld eingeben.', true);
        return null;
      });
    }

    // ── Geocoding ──
    function searchAdresse(text){
      if (!text || !text.trim()){ msg('Bitte eine Adresse eingeben.', true); return; }
      msg('Adresse wird gesucht …');
      geocode(text.trim()).then(function(r){
        if (!r){ msg('Adresse nicht gefunden — bitte präzisieren (Strasse Nr, PLZ Ort).', true); return; }
        if (elAdr && r.label) elAdr.value = r.label;
        setPoint(r.lat, r.lon, r.label || text.trim(), false);
      }).catch(function(){
        msg('Adresssuche nicht erreichbar — bitte Verbindung prüfen.', true);
      });
    }

    // GemaAdresse-Autocomplete, wenn geladen — sonst Enter = Suche
    if (w.GemaAdresse && GemaAdresse.attach){
      GemaAdresse.attach(elAdr, { onSelect: function(r){
        if (r && r.lon != null && r.lat != null){
          setPoint(Number(r.lat), Number(r.lon), r.label || ((r.strasse || '') + ', ' + (r.plz || '') + ' ' + (r.ort || '')).trim(), false);
        } else if (r){
          searchAdresse([(r.strasse || ''), [(r.plz || ''), (r.ort || '')].filter(Boolean).join(' ')].filter(Boolean).join(', '));
        }
      }});
    }
    if (elAdr){
      elAdr.addEventListener('keydown', function(ev){
        if (ev.key === 'Enter'){ ev.preventDefault(); searchAdresse(elAdr.value); }
      });
    }

    var btnObj = el('btnObj');
    if (btnObj) btnObj.addEventListener('click', function(){
      var t = projektAdresseText();
      if (!t){ msg('Kein aktives Objekt mit Adresse — Objekt oben wählen oder Adresse eintippen.', true); return; }
      if (elAdr) elAdr.value = t;
      searchAdresse(t);
    });

    var btnApply = el('apply');
    if (btnApply) btnApply.addEventListener('click', function(){ doApply(); });
    function doApply(){
      var s = inst.state;
      if (!s || !isFinite(s.hoehe)) return;
      var res = {
        hoehe: Math.round(s.hoehe * 10) / 10,
        mbar: Math.round(ghLuftdruckMbar(s.hoehe)),
        e: s.e, n: s.n, lat: s.lat, lon: s.lon,
        adresse: s.adresse || '', korrigiert: !!s.korrigiert
      };
      try { if (typeof opts.onApply === 'function') opts.onApply(res); } catch(e){}
      if (btnApply){
        var old = btnApply.textContent;
        btnApply.textContent = '✓ übernommen';
        btnApply.disabled = true;
        setTimeout(function(){ btnApply.textContent = old; btnApply.disabled = false; }, 1600);
      }
    }

    // ── Mini-Karte (nur Anzeige; Klick → Vollbild) ──
    function renderMini(){
      var s = inst.state;
      var mapEl = el('map'), ph = el('ph');
      if (!s || !mapEl) return;
      ensureLeaflet().then(function(ok){
        if (!ok){
          if (ph){ ph.style.display = ''; ph.textContent = 'Karte nicht verfügbar — Höhe wurde trotzdem ermittelt.'; }
          return;
        }
        if (ph) ph.style.display = 'none';
        try {
          if (!inst.mini){
            inst.mini = L.map(mapEl, {
              zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
              boxZoom: false, keyboard: false, touchZoom: false, attributionControl: false
            });
            L.tileLayer(TILE_LUFT, { maxNativeZoom: 19, maxZoom: 20 }).addTo(inst.mini);
          }
          inst.mini.setView([s.lat, s.lon], 18);
          if (!inst.miniMarker){
            inst.miniMarker = L.marker([s.lat, s.lon], { icon: pinIcon(), interactive: false }).addTo(inst.mini);
          } else inst.miniMarker.setLatLng([s.lat, s.lon]);
          setTimeout(function(){ try { inst.mini.invalidateSize(); } catch(e){} }, 120);
        } catch(e){}
      });
    }
    var btnOpen = el('open');
    if (btnOpen) btnOpen.addEventListener('click', function(){ openModal(inst); });

    // ── AutoSave-Restore / Objektwechsel ──
    if (elState) elState.addEventListener('change', restoreFromInput);
    w.addEventListener('gema-objekt-changed', function(){
      setTimeout(function(){ restoreFromInput(); if (!inst.state) autoPrefill(); }, 400);
    });

    // ── Auto-Vorbefüllung aus dem aktiven Objekt (nur wenn alles leer) ──
    function autoPrefill(){
      if (opts.autoPrefill === false) return;
      if (inst.state) return;
      if (elAdr && elAdr.value.trim()) return;
      var t = projektAdresseText();
      if (!t) return;
      elAdr.value = t;
      searchAdresse(t);
    }
    // Restore aus AutoSave abwarten (mehrstufig, timing-robust), danach ggf. vorbefüllen
    setTimeout(function(){ if (!inst.state) restoreFromInput(); }, 300);
    setTimeout(function(){ if (!inst.state) restoreFromInput(); }, 900);
    setTimeout(function(){ if (!inst.state) autoPrefill(); }, 1800);

    inst.render = render;
    inst.setPoint = setPoint;
    inst.doApply = doApply;
    inst.restoreFromInput = restoreFromInput;
    return inst;
  }

  function pinIcon(){
    return L.divIcon({ className: '', html: '<div class="gh-pin"><div class="b"></div><div class="c"></div></div>',
      iconSize: [26, 34], iconAnchor: [13, 32] });
  }

  // ═══════════════ Vollbild-Modal (eine geteilte Instanz) ═══════════════
  function buildModal(){
    if (_modal) return _modal;
    var bg = document.createElement('div');
    bg.className = 'gh-modal-bg';
    bg.innerHTML = ''
      + '<div class="gh-modal">'
      + '  <div class="gh-modal-hd">'
      + '    <div><div class="gh-modal-title">📍 Punkt aufs Strassenniveau setzen</div>'
      + '    <div class="gh-modal-sub">Marker ziehen oder Karte anklicken — die Höhe wird bei jeder Verschiebung neu abgefragt (Gelände ohne Gebäude).</div></div>'
      + '    <div class="gh-seg"><button type="button" id="ghSegLuft" class="on">🛰 Luftbild</button><button type="button" id="ghSegKarte">🗺 Karte</button></div>'
      + '    <button type="button" class="gh-modal-x" id="ghModalX" title="Schliessen">✕</button>'
      + '  </div>'
      + '  <div class="gh-modal-map" id="ghModalMap"></div>'
      + '  <div class="gh-modal-ft">'
      + '    <div><div class="gh-modal-val" id="ghModalVal">–</div><div class="gh-modal-coord" id="ghModalCoord"></div></div>'
      + '    <span class="gh-badge" id="ghModalBadge" style="display:none">📌 Punkt manuell korrigiert</span>'
      + '    <span class="sp"></span>'
      + '    <button type="button" class="gh-btn" id="ghModalClose">Schliessen</button>'
      + '    <button type="button" class="gh-btn pri" id="ghModalApply">✓ Übernehmen</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(bg);
    _modal = { bg: bg, map: null, marker: null, layerLuft: null, layerKarte: null, inst: null };

    function close(){
      bg.classList.remove('open');
      _modal.inst = null;
    }
    bg.addEventListener('click', function(ev){ if (ev.target === bg) close(); });
    document.getElementById('ghModalX').addEventListener('click', close);
    document.getElementById('ghModalClose').addEventListener('click', close);
    document.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && bg.classList.contains('open')) close(); });
    document.getElementById('ghModalApply').addEventListener('click', function(){
      if (_modal.inst){ _modal.inst.doApply(); }
      close();
    });
    document.getElementById('ghSegLuft').addEventListener('click', function(){ setLayer('luft'); });
    document.getElementById('ghSegKarte').addEventListener('click', function(){ setLayer('karte'); });
    function setLayer(which){
      if (!_modal.map) return;
      document.getElementById('ghSegLuft').classList.toggle('on', which === 'luft');
      document.getElementById('ghSegKarte').classList.toggle('on', which === 'karte');
      try {
        if (which === 'luft'){ _modal.map.removeLayer(_modal.layerKarte); _modal.layerLuft.addTo(_modal.map); }
        else { _modal.map.removeLayer(_modal.layerLuft); _modal.layerKarte.addTo(_modal.map); }
      } catch(e){}
    }
    _modal.close = close;
    return _modal;
  }

  function syncModal(){
    if (!_modal || !_modal.inst || !_modal.bg.classList.contains('open')) return;
    var s = _modal.inst.state;
    if (!s) return;
    var v = document.getElementById('ghModalVal');
    if (v) v.textContent = (Math.round(s.hoehe * 10) / 10).toLocaleString('de-CH', { minimumFractionDigits: 1 }) + ' m ü.M.'
      + (_modal.inst.mode === 'mbar' ? ' → ' + Math.round(ghLuftdruckMbar(s.hoehe)) + ' mbar' : '');
    var c = document.getElementById('ghModalCoord');
    if (c) c.textContent = 'LV95 ' + ghFmtCoord(s.e) + ' / ' + ghFmtCoord(s.n);
    var b = document.getElementById('ghModalBadge');
    if (b) b.style.display = s.korrigiert ? '' : 'none';
    if (_modal.marker){ try { _modal.marker.setLatLng([s.lat, s.lon]); } catch(e){} }
  }

  function openModal(inst){
    var s = inst.state;
    if (!s) return;
    ensureLeaflet().then(function(ok){
      if (!ok){
        try { alert('Karte nicht verfügbar — bitte Internetverbindung prüfen. Die Höhe kann trotzdem übernommen oder manuell eingegeben werden.'); } catch(e){}
        return;
      }
      var m = buildModal();
      m.inst = inst;
      m.bg.classList.add('open');
      if (!m.map){
        m.map = L.map('ghModalMap', { zoomControl: true, attributionControl: true, maxZoom: 20 });
        m.map.attributionControl.setPrefix(false);
        m.layerLuft = L.tileLayer(TILE_LUFT, { maxNativeZoom: 19, maxZoom: 20, attribution: '© swisstopo (swissimage / swissALTI3D)' });
        m.layerKarte = L.tileLayer(TILE_KARTE, { maxNativeZoom: 18, maxZoom: 20, attribution: '© swisstopo' });
        m.layerLuft.addTo(m.map);
        m.map.on('click', function(ev){
          if (m.inst) m.inst.setPoint(ev.latlng.lat, ev.latlng.lng, null, true);
        });
      } else {
        // Layer-Segment auf Luftbild zurückstellen
        document.getElementById('ghSegLuft').classList.add('on');
        document.getElementById('ghSegKarte').classList.remove('on');
        try { m.map.removeLayer(m.layerKarte); } catch(e){}
        try { m.layerLuft.addTo(m.map); } catch(e){}
      }
      if (m.marker){ try { m.map.removeLayer(m.marker); } catch(e){} }
      m.marker = L.marker([s.lat, s.lon], { icon: pinIcon(), draggable: true }).addTo(m.map);
      m.marker.on('dragend', function(){
        var ll = m.marker.getLatLng();
        if (m.inst) m.inst.setPoint(ll.lat, ll.lng, null, true);
      });
      m.map.setView([s.lat, s.lon], 19);
      setTimeout(function(){ try { m.map.invalidateSize(); m.map.setView([s.lat, s.lon], 19); } catch(e){} }, 150);
      syncModal();
    });
  }

  // ── Public API + Test-Hooks ──
  w.GemaHoehe = { attach: attach };
  w._ghHooks = {
    instances: _instances,
    get: function(key){ return _instances[key] || null; },
    state: function(key){ var i = _instances[key]; return i ? i.state : null; },
    setPoint: function(key, lat, lon){ var i = _instances[key]; return i ? i.setPoint(lat, lon, null, true) : Promise.resolve(null); },
    apply: function(key){ var i = _instances[key]; if (i) i.doApply(); },
    engine: { ghWgs84ToLV95: ghWgs84ToLV95, ghLuftdruckMbar: ghLuftdruckMbar, ghDistM: ghDistM, ghFmtCoord: ghFmtCoord, ghInCH: ghInCH }
  };
})(window);
