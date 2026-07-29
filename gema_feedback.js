/**
 * gema_feedback.js  —  GEMA Feedback-System v4
 * Features: Snipping-Screenshot + Annotation (Stift / Pfeil / Rechteck / Text
 * wie in PDF-Programmen, Vektor-Shapes mit Undo pro Objekt) + Feedback-Formular
 * Benoetigt: gema_db.js (muss vorher eingebunden sein)
 * html2canvas wird bei Bedarf automatisch nachgeladen.
 */
(function (w) {
  'use strict';

  const BETA_KEY = 'gema_beta_pruefungen_v1';
  const H2C_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  let _moduleId = null, _moduleName = null;
  let _screenshotDataUrl = '';
  let _snipStart = null, _snipRect = null, _dragging = false;

  // ── Annotation state (Vektor-Shapes: pen/arrow/rect/text) ──
  let _annotCanvas = null, _annotCtx = null;
  let _annotDrawing = false, _annotShapes = [], _annotTemp = null;
  let _annotTool = 'pen', _annotTextInput = null;
  // Zeichenfarbe (Feedback 28.07.2026 «verschiedene Farben waeren noch cool»).
  // Jede Form merkt sich ihre Farbe (s.c) — Altformen ohne Feld bleiben rot.
  const GFB_COLORS = [
    { c: '#dc2626', n: 'Rot' },
    { c: '#f59e0b', n: 'Orange' },
    { c: '#16a34a', n: 'Gruen' },
    { c: '#2563eb', n: 'Blau' },
    { c: '#0f172a', n: 'Schwarz' }
  ];
  let _annotColor = GFB_COLORS[0].c;

  function init(moduleId, moduleName) {
    _moduleId   = moduleId;
    _moduleName = moduleName;
    _ensureHtml2canvas();
    _injectHTML();
    _bindEvents();
  }

  // ── Load html2canvas if not present ──
  function _ensureHtml2canvas() {
    if (typeof html2canvas === 'function') return;
    var s = document.createElement('script');
    s.src = H2C_CDN;
    s.async = true;
    document.head.appendChild(s);
  }

  // ── Inject overlay + annotation + modal HTML ──
  function _injectHTML() {
    if (document.getElementById('gfb-root')) return;
    var root = document.createElement('div');
    root.id = 'gfb-root';
    root.innerHTML =
      /* ── SNIPPING OVERLAY ── */
      '<div id="gfb-overlay" style="display:none;position:fixed;inset:0;z-index:9000;cursor:crosshair">' +
        '<div style="position:absolute;inset:0;background:rgba(0,0,0,.38)"></div>' +
        '<div style="position:fixed;top:calc(20px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 22px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:9001;pointer-events:none;white-space:nowrap">' +
          'Bereich ausw&auml;hlen — Maus gedr&uuml;ckt halten und Rechteck ziehen &nbsp;&middot;&nbsp; ESC zum Abbrechen' +
        '</div>' +
        '<div id="gfb-sel" style="display:none;position:fixed;border:2.5px solid #3b82f6;background:rgba(59,130,246,.12);pointer-events:none"></div>' +
      '</div>' +

      /* ── ANNOTATION OVERLAY ── */
      '<div id="gfb-annot" style="display:none;position:fixed;inset:0;z-index:9050;background:rgba(15,23,42,.85);backdrop-filter:blur(4px);flex-direction:column">' +
        '<div style="flex-shrink:0;background:#0f172a;padding:8px 16px;padding-top:calc(8px + env(safe-area-inset-top,0px));display:flex;align-items:center;gap:10px;flex-wrap:wrap;box-shadow:0 2px 12px rgba(0,0,0,.3)">' +
          '<span style="font-size:14px">🖊</span>' +
          '<div id="gfb-tools" style="display:flex;gap:6px;flex-wrap:wrap">' +
            '<button type="button" class="gfb-tool" data-tool="pen" style="padding:6px 12px;border-radius:8px;border:1.5px solid #475569;background:rgba(255,255,255,.08);color:#cbd5e1;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s">✏️ Stift</button>' +
            '<button type="button" class="gfb-tool" data-tool="arrow" style="padding:6px 12px;border-radius:8px;border:1.5px solid #475569;background:rgba(255,255,255,.08);color:#cbd5e1;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s">↗ Pfeil</button>' +
            '<button type="button" class="gfb-tool" data-tool="rect" style="padding:6px 12px;border-radius:8px;border:1.5px solid #475569;background:rgba(255,255,255,.08);color:#cbd5e1;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s">▭ Rechteck</button>' +
            '<button type="button" class="gfb-tool" data-tool="text" style="padding:6px 12px;border-radius:8px;border:1.5px solid #475569;background:rgba(255,255,255,.08);color:#cbd5e1;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s">T Text</button>' +
          '</div>' +
          '<div id="gfb-colors" style="display:flex;gap:5px;align-items:center">' +
            GFB_COLORS.map(function(x) {
              return '<button type="button" class="gfb-col" data-col="' + x.c + '" title="' + x.n + '" ' +
                'style="width:26px;height:26px;border-radius:50%;border:2.5px solid transparent;background:' + x.c + ';cursor:pointer;padding:0;box-shadow:0 0 0 1.5px rgba(255,255,255,.25) inset"></button>';
            }).join('') +
          '</div>' +
          '<span id="gfb-annot-hint" style="color:#94a3b8;font-size:12px;font-weight:600;flex:1;min-width:150px">Klick &amp; ziehen zum Zeichnen</span>' +
        '</div>' +
        '<div id="gfb-annot-wrap" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:auto;padding:20px;gap:12px;min-height:0">' +
          '<div id="gfb-annot-container" style="position:relative;display:inline-block;border-radius:8px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.4)">' +
            '<img id="gfb-annot-img" style="display:block;max-width:100%;max-height:calc(100vh - 180px)" />' +
            '<canvas id="gfb-annot-canvas" style="position:absolute;top:0;left:0;cursor:crosshair"></canvas>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' +
            '<button id="gfb-annot-undo" style="padding:7px 16px;border-radius:8px;border:1.5px solid #475569;background:rgba(255,255,255,.08);color:#cbd5e1;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s">↩ Rückgängig</button>' +
            '<button id="gfb-annot-clear" style="padding:7px 16px;border-radius:8px;border:1.5px solid #475569;background:rgba(255,255,255,.08);color:#cbd5e1;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s">✕ Alles löschen</button>' +
            '<button id="gfb-annot-skip" style="padding:7px 16px;border-radius:8px;border:1.5px solid #475569;background:rgba(255,255,255,.08);color:#cbd5e1;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s">Überspringen →</button>' +
            '<button id="gfb-annot-done" style="padding:7px 20px;border-radius:8px;border:none;background:#dc2626;color:#fff;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;transition:.15s">✓ Fertig</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ── FEEDBACK MODAL ── */
      '<div id="gfb-modal" style="display:none;position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:20px">' +
        '<div style="background:#fff;border-radius:18px;width:100%;max-width:560px;box-shadow:0 24px 64px rgba(0,0,0,.2);overflow:hidden;font-family:\'DM Sans\',ui-sans-serif,sans-serif">' +
          '<div style="padding:16px 20px;border-bottom:1px solid #e0e4ef;display:flex;align-items:center;gap:10px;background:#f7f8fc">' +
            '<span style="font-size:18px">🔴</span>' +
            '<div style="font-size:15px;font-weight:800;color:#0f172a;flex:1">Feedback — <span id="gfb-modname"></span></div>' +
            '<button onclick="GemaFeedback.close()" style="width:32px;height:32px;border-radius:8px;border:1.5px solid #c8cfdf;background:#fff;font-size:14px;cursor:pointer;font-family:inherit">✕</button>' +
          '</div>' +
          '<div style="padding:18px 20px">' +
            '<img id="gfb-preview" style="width:100%;border-radius:8px;border:1.5px solid #e0e4ef;margin-bottom:14px;display:none;max-height:200px;object-fit:contain;background:#eaecf4;cursor:pointer" src="" alt="Screenshot" title="Klick: erneut annotieren" />' +
            '<div style="margin-bottom:10px"><label style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#64748b;display:block;margin-bottom:5px">Typ</label>' +
            '<select id="gfb-type" style="width:100%;padding:8px 11px;border:1.5px solid #c8cfdf;border-radius:9px;font-size:13.5px;background:#eaecf4;color:#0f172a;outline:none;min-height:40px;font-family:inherit">' +
              '<option value="kommentar">💬 Kommentar</option>' +
              '<option value="aenderung">✏️ Änderungsvorschlag</option>' +
              '<option value="fehler">🐛 Fehler / Bug</option>' +
            '</select></div>' +
            '<div style="margin-bottom:10px"><label style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#64748b;display:block;margin-bottom:5px">Kommentar / Beschreibung</label>' +
            '<textarea id="gfb-text" style="width:100%;padding:9px 11px;border:1.5px solid #c8cfdf;border-radius:9px;font-size:13.5px;background:#eaecf4;color:#0f172a;outline:none;resize:vertical;min-height:80px;line-height:1.5;font-family:inherit" placeholder="Was f&auml;llt auf? Was soll ge&auml;ndert werden?"></textarea></div>' +
            '<div><label style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#64748b;display:block;margin-bottom:5px">Dein Name</label>' +
            '<input id="gfb-author" type="text" style="width:100%;padding:8px 11px;border:1.5px solid #c8cfdf;border-radius:9px;font-size:13.5px;background:#eaecf4;color:#0f172a;outline:none;min-height:40px;font-family:inherit" placeholder="Vor- und Nachname"/></div>' +
          '</div>' +
          '<div style="padding:14px 20px;border-top:1px solid #e0e4ef;display:flex;gap:8px;justify-content:flex-end;background:#f7f8fc">' +
            '<button onclick="GemaFeedback.close()" style="padding:9px 16px;border-radius:9px;border:1.5px solid #c8cfdf;background:#fff;color:#334155;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Abbrechen</button>' +
            '<button id="gfb-submit" onclick="GemaFeedback.submit()" style="padding:9px 20px;border-radius:9px;border:none;background:#1d4ed8;color:#fff;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit">📤 Feedback senden</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    var el = document.getElementById('gfb-modname');
    if (el) el.textContent = _moduleName || '';
  }

  // ── Bind events ──
  function _bindEvents() {
    var overlay = document.getElementById('gfb-overlay');
    var sel     = document.getElementById('gfb-sel');
    if (!overlay || !sel) return;

    // ── Snipping events ──
    overlay.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      _dragging = true;
      _snipStart = { x: e.clientX, y: e.clientY };
      Object.assign(sel.style, { left:e.clientX+'px', top:e.clientY+'px', width:'0', height:'0', display:'block' });
    });
    overlay.addEventListener('mousemove', function(e) {
      if (!_dragging) return;
      var x = Math.min(e.clientX, _snipStart.x), y = Math.min(e.clientY, _snipStart.y);
      var w = Math.abs(e.clientX - _snipStart.x), h = Math.abs(e.clientY - _snipStart.y);
      Object.assign(sel.style, { left:x+'px', top:y+'px', width:w+'px', height:h+'px' });
      _snipRect = { x:x, y:y, w:w, h:h };
    });
    overlay.addEventListener('mouseup', async function() {
      if (!_dragging) return;
      _dragging = false;
      overlay.style.display = 'none';
      sel.style.display = 'none';
      document.body.style.cursor = '';
      _screenshotDataUrl = '';
      if (_snipRect && _snipRect.w >= 10 && _snipRect.h >= 10) {
        try {
          if (typeof html2canvas === 'function') {
            var sc = 1.5;
            // Der Ausschnitt ist VIEWPORT-relativ (clientX/Y) — deshalb wird
            // auch der Viewport erfasst (siehe _captureViewport). Fruehere
            // Fassung rendete das ganze Dokument ab (0,0) und addierte den
            // Seiten-Scroll auf die Crop-Koordinaten: bei Inhalt in einem
            // position:fixed-Overlay (Vollbild-Editoren wie Pruefliste, ERP,
            // Schadensbericht) lag der Ausschnitt dann um den Scroll-Offset
            // daneben — bis hin zum komplett weissen Bild.
            var fullCanvas = await _captureViewport(sc);
            var cropX = Math.round(_snipRect.x * sc);
            var cropY = Math.round(_snipRect.y * sc);
            var cropW = Math.round(_snipRect.w * sc);
            var cropH = Math.round(_snipRect.h * sc);
            // Clamp to canvas bounds
            cropW = Math.min(cropW, fullCanvas.width);
            cropH = Math.min(cropH, fullCanvas.height);
            cropX = Math.max(0, Math.min(cropX, fullCanvas.width - cropW));
            cropY = Math.max(0, Math.min(cropY, fullCanvas.height - cropH));
            var cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            cropCanvas.getContext('2d').drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            _screenshotDataUrl = cropCanvas.toDataURL('image/jpeg', 0.82);
          }
        } catch(e) { console.warn('[GemaFeedback] Screenshot:', e); }
      }
      if (_screenshotDataUrl) {
        _openAnnotation(_screenshotDataUrl);
      } else {
        _showModal();
      }
    });

    // ── Annotation events ──
    var doneBtn  = document.getElementById('gfb-annot-done');
    var skipBtn  = document.getElementById('gfb-annot-skip');
    var undoBtn  = document.getElementById('gfb-annot-undo');
    var clearBtn = document.getElementById('gfb-annot-clear');
    if (doneBtn) doneBtn.addEventListener('click', _finishAnnotation);
    if (skipBtn) skipBtn.addEventListener('click', _finishAnnotation);
    if (undoBtn) undoBtn.addEventListener('click', _undoAnnotation);
    if (clearBtn) clearBtn.addEventListener('click', _clearAnnotation);

    // ── Werkzeug-Auswahl (Stift / Pfeil / Rechteck / Text) ──
    document.querySelectorAll('#gfb-tools .gfb-tool').forEach(function(b) {
      b.addEventListener('click', function() { _setAnnotTool(b.dataset.tool); });
    });

    // ── Farbwahl ──
    document.querySelectorAll('#gfb-colors .gfb-col').forEach(function(b) {
      b.addEventListener('click', function() { _setAnnotColor(b.dataset.col); });
    });

    // ── Preview click → re-annotate ──
    var preview = document.getElementById('gfb-preview');
    if (preview) preview.addEventListener('click', function() {
      if (_screenshotDataUrl) {
        document.getElementById('gfb-modal').style.display = 'none';
        _openAnnotation(_screenshotDataUrl);
      }
    });

    // ── ESC key ──
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var annot = document.getElementById('gfb-annot');
        if (annot && annot.style.display !== 'none') {
          _finishAnnotation();
          return;
        }
        overlay.style.display = 'none';
        document.body.style.cursor = '';
        _dragging = false; sel.style.display = 'none';
        close();
      }
    });
  }

  // ═══════════════════════════════════════════
  // ANNOTATION — Vektor-Shapes (Stift/Pfeil/Rechteck/Text) wie in
  // PDF-Programmen: jede Form ist ein eigenes Objekt (Undo pro Objekt),
  // Drag zeigt eine Live-Vorschau, Text als Inline-Input direkt am Bild.
  // ═══════════════════════════════════════════
  function _setAnnotTool(t) {
    _commitTextInput();
    _annotTool = t;
    var hints = {
      pen:   'Klick & ziehen zum Zeichnen',
      arrow: 'Ziehen — die Pfeilspitze zeigt zum Endpunkt',
      rect:  'Rechteck über den Bereich aufziehen',
      text:  'Auf die Stelle klicken, Text tippen, Enter'
    };
    var h = document.getElementById('gfb-annot-hint');
    if (h) h.textContent = hints[t] || '';
    document.querySelectorAll('#gfb-tools .gfb-tool').forEach(function(b) {
      var on = b.dataset.tool === t;
      b.style.background  = on ? '#dc2626' : 'rgba(255,255,255,.08)';
      b.style.borderColor = on ? '#dc2626' : '#475569';
      b.style.color       = on ? '#fff'    : '#cbd5e1';
    });
    if (_annotCanvas) _annotCanvas.style.cursor = (t === 'text') ? 'text' : 'crosshair';
  }

  // ── Zeichenfarbe waehlen (gilt fuer die naechste Form; bestehende bleiben) ──
  function _setAnnotColor(c) {
    _commitTextInput();
    _annotColor = c;
    document.querySelectorAll('#gfb-colors .gfb-col').forEach(function(b) {
      var on = b.dataset.col === c;
      b.style.borderColor = on ? '#fff' : 'transparent';
      b.style.transform   = on ? 'scale(1.12)' : 'scale(1)';
    });
  }

  function _annotLW() {
    return Math.max(3, (_annotCanvas ? _annotCanvas.width : 600) / 180);
  }
  function _annotFontPx() {
    return Math.max(16, Math.round((_annotCanvas ? _annotCanvas.width : 600) / 26));
  }

  function _drawShape(ctx, s, lw) {
    var col = s.c || '#dc2626';   // Altformen ohne Farbe bleiben rot
    ctx.strokeStyle = col;
    ctx.fillStyle   = col;
    ctx.lineWidth   = lw;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    if (s.tool === 'pen') {
      if (!s.points || s.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (var i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    } else if (s.tool === 'rect') {
      ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
    } else if (s.tool === 'arrow') {
      var dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      if (Math.sqrt(dx * dx + dy * dy) < 1) return;
      var ang  = Math.atan2(dy, dx);
      var head = Math.max(10, lw * 3.2);
      // Linie endet kurz vor der Spitze, damit die gefuellte Spitze sauber schliesst
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2 - Math.cos(ang) * head * 0.6, s.y2 - Math.sin(ang) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(ang - 0.42), s.y2 - head * Math.sin(ang - 0.42));
      ctx.lineTo(s.x2 - head * Math.cos(ang + 0.42), s.y2 - head * Math.sin(ang + 0.42));
      ctx.closePath();
      ctx.fill();
    } else if (s.tool === 'text') {
      if (!s.text) return;
      ctx.font = '700 ' + s.size + 'px "DM Sans",ui-sans-serif,system-ui,sans-serif';
      ctx.textBaseline = 'top';
      // Weisser Halo fuer Lesbarkeit auf beliebigem Screenshot-Hintergrund
      ctx.lineWidth = Math.max(2, s.size / 7);
      ctx.strokeStyle = 'rgba(255,255,255,.88)';
      ctx.strokeText(s.text, s.x, s.y);
      ctx.fillStyle = col;
      ctx.fillText(s.text, s.x, s.y);
    }
  }

  // ── Inline-Text-Input direkt an der Klickposition ──
  function _openTextInput(pos) {
    _commitTextInput();
    var container = document.getElementById('gfb-annot-container');
    if (!container || !_annotCanvas) return;
    var rect = _annotCanvas.getBoundingClientRect();
    var dispScale  = rect.width / _annotCanvas.width;  // Canvas-px → Anzeige-px
    var fontCanvas = _annotFontPx();
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'gfb-annot-textinp';
    inp.placeholder = 'Text…';
    inp.autocomplete = 'off';
    inp.style.cssText = 'position:absolute;z-index:5;left:' + Math.round(pos.x * dispScale) + 'px;top:' + Math.round(pos.y * dispScale) + 'px;' +
      'font:700 ' + Math.max(11, fontCanvas * dispScale) + 'px "DM Sans",ui-sans-serif,sans-serif;color:' + _annotColor + ';' +
      'background:rgba(255,255,255,.92);border:1.5px dashed ' + _annotColor + ';border-radius:4px;padding:1px 4px;outline:none;min-width:70px;max-width:92%';
    inp._gfbMeta = { x: pos.x, y: pos.y, size: fontCanvas, c: _annotColor };
    inp.addEventListener('keydown', function(e) {
      e.stopPropagation();  // ESC/Enter nicht an den globalen Handler durchreichen
      if (e.key === 'Enter') _commitTextInput();
      else if (e.key === 'Escape') _cancelTextInput();
    });
    inp.addEventListener('blur', function() { _commitTextInput(); });
    inp.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    inp.addEventListener('touchstart', function(e) { e.stopPropagation(); });
    container.appendChild(inp);
    _annotTextInput = inp;
    try { inp.focus(); } catch(e) {}  // synchron — iOS braucht den User-Gesture-Stack
  }

  function _commitTextInput() {
    var inp = _annotTextInput;
    if (!inp) return;
    _annotTextInput = null;  // vor remove() — blur wuerde sonst rekursiv committen
    var val  = (inp.value || '').trim();
    var meta = inp._gfbMeta;
    try { inp.remove(); } catch(e) {}
    if (val && meta) {
      _annotShapes.push({ tool: 'text', x: meta.x, y: meta.y, text: val, size: meta.size, c: meta.c || _annotColor });
      _redrawAnnotation();
    }
  }

  function _cancelTextInput() {
    var inp = _annotTextInput;
    if (!inp) return;
    _annotTextInput = null;
    try { inp.remove(); } catch(e) {}
  }

  function _openAnnotation(dataUrl) {
    var annot = document.getElementById('gfb-annot');
    var img   = document.getElementById('gfb-annot-img');
    if (!annot || !img) { _showModal(); return; }

    _annotShapes = [];
    _annotTemp = null;
    _annotDrawing = false;
    _cancelTextInput();
    var stray = document.getElementById('gfb-annot-textinp');
    if (stray) stray.remove();

    img.onload = function() {
      // Create fresh canvas each time
      var container = document.getElementById('gfb-annot-container');
      var oldCanvas = document.getElementById('gfb-annot-canvas');
      if (oldCanvas) oldCanvas.remove();

      var canvas = document.createElement('canvas');
      canvas.id = 'gfb-annot-canvas';
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.style.cssText = 'position:absolute;top:0;left:0;cursor:crosshair;width:' + img.clientWidth + 'px;height:' + img.clientHeight + 'px;';
      container.appendChild(canvas);

      _annotCanvas = canvas;
      _annotCtx = canvas.getContext('2d');
      _setAnnotTool(_annotTool || 'pen');

      // ── Zeichen-Logik (alle Werkzeuge) ──
      var downPos = null, moved = false;

      function getPos(e) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = canvas.width / rect.width;
        var scaleY = canvas.height / rect.height;
        var touch = e.touches ? e.touches[0] : e;
        return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
      }

      function startShape(pos) {
        _commitTextInput();
        downPos = pos; moved = false;
        if (_annotTool === 'pen') {
          _annotTemp = { tool: 'pen', points: [pos], c: _annotColor };
        } else if (_annotTool === 'arrow' || _annotTool === 'rect') {
          _annotTemp = { tool: _annotTool, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y, c: _annotColor };
        } else {
          _annotTemp = null;  // Text: wird beim Loslassen platziert
        }
        _annotDrawing = true;
      }

      function moveShape(pos) {
        if (!_annotDrawing) return;
        if (downPos && (Math.abs(pos.x - downPos.x) > 3 || Math.abs(pos.y - downPos.y) > 3)) moved = true;
        if (_annotTemp) {
          if (_annotTemp.tool === 'pen') _annotTemp.points.push(pos);
          else { _annotTemp.x2 = pos.x; _annotTemp.y2 = pos.y; }
          _redrawAnnotation();
        }
      }

      function endShape() {
        if (!_annotDrawing) return;
        _annotDrawing = false;
        if (_annotTool === 'text') {
          if (downPos && !moved) _openTextInput(downPos);
        } else if (_annotTemp) {
          var keep = (_annotTemp.tool === 'pen')
            ? _annotTemp.points.length > 1
            : (Math.abs(_annotTemp.x2 - _annotTemp.x1) > 6 || Math.abs(_annotTemp.y2 - _annotTemp.y1) > 6);
          if (keep) _annotShapes.push(_annotTemp);
        }
        _annotTemp = null;
        downPos = null;
        _redrawAnnotation();
      }

      canvas.addEventListener('mousedown', function(e) { e.preventDefault(); startShape(getPos(e)); });
      canvas.addEventListener('mousemove', function(e) { if (_annotDrawing) { e.preventDefault(); moveShape(getPos(e)); } });
      canvas.addEventListener('mouseup',    endShape);
      canvas.addEventListener('mouseleave', endShape);

      // Touch
      canvas.addEventListener('touchstart', function(e) { e.preventDefault(); startShape(getPos(e)); }, {passive:false});
      canvas.addEventListener('touchmove',  function(e) { if (_annotDrawing) { e.preventDefault(); moveShape(getPos(e)); } }, {passive:false});
      canvas.addEventListener('touchend',   endShape);
    };
    img.src = dataUrl;
    annot.style.display = 'flex';
    _setAnnotTool(_annotTool || 'pen');
    _setAnnotColor(_annotColor);
  }

  function _redrawAnnotation() {
    if (!_annotCtx || !_annotCanvas) return;
    _annotCtx.clearRect(0, 0, _annotCanvas.width, _annotCanvas.height);
    var lw = _annotLW();
    _annotShapes.forEach(function(s) { _drawShape(_annotCtx, s, lw); });
    if (_annotTemp) _drawShape(_annotCtx, _annotTemp, lw);
  }

  function _undoAnnotation() {
    if (_annotTextInput) { _cancelTextInput(); return; }
    if (_annotShapes.length > 0) {
      _annotShapes.pop();
      _redrawAnnotation();
    }
  }

  function _clearAnnotation() {
    _cancelTextInput();
    _annotShapes = [];
    _annotTemp = null;
    _redrawAnnotation();
  }

  function _finishAnnotation() {
    _commitTextInput();  // offenes Textfeld noch uebernehmen
    // Merge annotation onto screenshot
    if (_annotCanvas && _annotShapes.length > 0) {
      var img = document.getElementById('gfb-annot-img');
      var mergeCanvas = document.createElement('canvas');
      mergeCanvas.width  = _annotCanvas.width;
      mergeCanvas.height = _annotCanvas.height;
      var ctx = mergeCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0, mergeCanvas.width, mergeCanvas.height);
      ctx.drawImage(_annotCanvas, 0, 0);
      _screenshotDataUrl = mergeCanvas.toDataURL('image/jpeg', 0.82);
    }
    // Close annotation
    var annot = document.getElementById('gfb-annot');
    if (annot) annot.style.display = 'none';
    _showModal();
  }

  // ═══════════════════════════════════════════
  // MODAL
  // ═══════════════════════════════════════════
  function _showModal() {
    var preview = document.getElementById('gfb-preview');
    if (preview && _screenshotDataUrl) {
      preview.src = _screenshotDataUrl;
      preview.style.display = 'block';
    } else if (preview) {
      preview.style.display = 'none';
    }
    // Auto-fill name from logged-in user
    _prefillAuthor();
    // Defensiv: falls irgendein Pfad das Namensfeld leert (z.B. beim
    // Typ-Wechsel auf «Fehler/Bug» beobachtet), beim Select-Change neu füllen.
    var typeEl = document.getElementById('gfb-type');
    if (typeEl && !typeEl._gfbNameGuard) {
      typeEl._gfbNameGuard = true;
      typeEl.addEventListener('change', _prefillAuthor);
    }
    var modal = document.getElementById('gfb-modal');
    if (modal) modal.style.display = 'flex';
  }

  function start() {
    _snipRect = null;
    _screenshotDataUrl = '';
    _annotShapes = [];
    _annotTemp = null;
    _cancelTextInput();
    var p = document.getElementById('gfb-preview');
    if (p) { p.src = ''; p.style.display = 'none'; }

    // Touch-Device (iPhone, iPad, Tablet): Snipping funktioniert dort
    // nicht (kein Mouse-Drag), deshalb direkt einen Fullscreen-Screenshot
    // der aktuellen Viewport-Ansicht machen und zur Annotation weiterleiten.
    var isTouchDevice = ('ontouchstart' in w) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
      _captureFullScreen();
      return;
    }

    // Desktop: Snipping-Overlay oeffnen (Bereich mit Maus auswaehlen)
    var ov = document.getElementById('gfb-overlay');
    if (ov) { ov.style.display = 'block'; document.body.style.cursor = 'crosshair'; }
  }

  // ── Feedback mit FERTIGEM Bild starten (Feedback 28.07.2026) ──
  // Fuer Inhalte, die in einem EIGENEN Fenster stehen (Druckfenster wie der
  // Pruefbericht): dort gibt es kein GemaFeedback, das Fenster erfasst sich
  // selbst und uebergibt das Bild hierher. Ohne Bild geht es direkt ins
  // Formular — Feedback ist so aus jeder Ansicht moeglich.
  function startWithImage(dataUrl, opts) {
    _snipRect = null;
    _annotShapes = [];
    _annotTemp = null;
    _cancelTextInput();
    _screenshotDataUrl = (typeof dataUrl === 'string' && dataUrl.indexOf('data:image') === 0) ? dataUrl : '';
    var p = document.getElementById('gfb-preview');
    if (p) { p.src = ''; p.style.display = 'none'; }
    var t = document.getElementById('gfb-text');
    if (t && opts && opts.text) t.value = opts.text;
    try { w.focus(); } catch (e) {}
    if (_screenshotDataUrl) _openAnnotation(_screenshotDataUrl);
    else _showModal();
  }

  // ── Viewport erfassen (EINE Wahrheit fuer Snip + Fullscreen) ──
  // KRITISCH: nur den SICHTBAREN Viewport rendern, nicht das ganze Dokument.
  // Nur so landen position:fixed-Elemente (Vollbild-Editoren, Modals, Nav)
  // dort im Bild, wo sie auf dem Bildschirm stehen — und Bildkoordinaten
  // entsprechen 1:1 den Viewport-Koordinaten (clientX/Y) der Auswahl.
  // KRITISCH #2: NUR x/y/width/height setzen — scrollX/scrollY bleiben auf
  // ihrem Default (pageXOffset/pageYOffset). html2canvas rechnet die Bounds
  // jedes Elements als clientRect + windowBounds(scrollX,scrollY); ein
  // zusaetzliches scrollX:-scrollX zaehlt den Offset doppelt und liefert bei
  // gescrollter Seite ein WEISSES Bild (per Varianten-Vergleich verifiziert).
  // KRITISCH #3 (Feedback 29.07.2026, iPad-Pruefliste): steht ein OPAKER
  // Vollbild-Editor (position:fixed, deckt den Viewport) offen, wird DIESES
  // ELEMENT direkt erfasst statt document.body. Hintergrund: html2canvas
  // scrollt sein Clone-iframe — auf iOS-Safari expandieren iframes aber auf
  // Inhaltshoehe (Scroll wird ignoriert), fixed-Elemente landen damit am
  // Dokument-ANFANG, waehrend der Crop bei scrollY beginnt → oben fehlte der
  // Editor-Kopf, unten war das Bild weiss. Die Element-Erfassung braucht
  // keinerlei Scroll-Mathematik (Element-Ursprung = Viewport-Ursprung);
  // halbtransparente Modal-Backdrops behalten bewusst den Body-Pfad (dort
  // soll die Seite hinter dem Modal mit aufs Bild).
  function _fullscreenOverlayEl() {
    try {
      var vw = w.innerWidth, vh = w.innerHeight;
      if (!document.elementsFromPoint) return null;
      var stack = document.elementsFromPoint(Math.floor(vw / 2), Math.floor(vh / 2)) || [];
      for (var i = 0; i < stack.length; i++) {
        var el = stack[i];
        if (!el || el === document.documentElement || el === document.body) continue;
        if (el.closest && el.closest('#gfb-root')) continue;  // eigenes Feedback-UI
        var cs = getComputedStyle(el);
        if (cs.position !== 'fixed') continue;
        var r = el.getBoundingClientRect();
        if (r.top > 2 || r.left > 2 || r.width < vw - 4 || r.height < vh - 4) continue;
        var m = String(cs.backgroundColor || '').match(/rgba?\(([^)]+)\)/);
        var parts = m ? m[1].split(',') : null;
        var alpha = parts ? (parts[3] !== undefined ? parseFloat(parts[3]) : 1) : 0;
        if (!(alpha >= 0.99)) continue;   // Backdrop (rgba .5) → Body-Pfad
        return el;
      }
    } catch (e) {}
    return null;
  }
  function _captureViewport(scale) {
    var ov = _fullscreenOverlayEl();
    if (ov) {
      return html2canvas(ov, {
        width: w.innerWidth, height: w.innerHeight,
        scale: scale, logging: false, useCORS: true, allowTaint: true,
        backgroundColor: '#ffffff'
      });
    }
    return html2canvas(document.body, {
      x: w.scrollX, y: w.scrollY,
      width: w.innerWidth, height: w.innerHeight,
      scale: scale, logging: false, useCORS: true, allowTaint: true
    });
  }

  // Fullscreen-Screenshot fuer Touch-Devices: erfasst den sichtbaren
  // Viewport (keine Auswahl noetig), zeigt dann die Rotstift-Annotation.
  async function _captureFullScreen() {
    // Kurze Verzoegerung, damit das UI sich beruhigt (z.B. Button-Ripple,
    // Touch-Highlight verschwindet) bevor der Screenshot gemacht wird.
    await new Promise(function(r){ setTimeout(r, 150); });
    try {
      if (typeof html2canvas !== 'function') {
        _showModal(); return;
      }
      // Nur den sichtbaren Viewport erfassen (nicht die ganze Seite),
      // damit der User genau sieht, was er beim Klick auf Feedback
      // vor sich hatte.
      var fullCanvas = await _captureViewport(Math.min(2, w.devicePixelRatio || 1));
      _screenshotDataUrl = fullCanvas.toDataURL('image/jpeg', 0.82);
      if (_screenshotDataUrl) {
        _openAnnotation(_screenshotDataUrl);
      } else {
        _showModal();
      }
    } catch(e) {
      console.warn('[GemaFeedback] Fullscreen capture:', e);
      _showModal();
    }
  }

  function _prefillAuthor() {
    var authorEl = document.getElementById('gfb-author');
    if (authorEl && !authorEl.value) {
      try {
        if (typeof GemaAuth !== 'undefined') {
          var user = GemaAuth.getCurrentUser();
          if (user) authorEl.value = user.name || user.username || '';
        }
      } catch(e) {}
    }
  }

  function close() {
    var m = document.getElementById('gfb-modal');
    if (m) m.style.display = 'none';
    var a = document.getElementById('gfb-annot');
    if (a) a.style.display = 'none';
    _snipRect = null;
  }

  async function submit() {
    var text   = (document.getElementById('gfb-text')?.value || '').trim();
    var type   = document.getElementById('gfb-type')?.value || 'kommentar';
    var author = (document.getElementById('gfb-author')?.value || '').trim() || 'Anonym';
    if (!text) { _toast('⚠ Bitte Kommentar eingeben'); return; }

    var btn = document.getElementById('gfb-submit');
    if (btn) { btn.disabled = true; btn.textContent = '⧗ Wird gespeichert…'; }

    var ts = new Date().toLocaleString('de-CH', {
      day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'
    });
    var entry = {
      type: type, author: author, text: text,
      screenshot: (_screenshotDataUrl && _screenshotDataUrl.length < 400000) ? _screenshotDataUrl : null,
      ts: ts, source: _moduleName, moduleId: _moduleId
    };

    var ok = false;
    var dataKey = 'feedback_' + _moduleId;

    // Try GemaDB first
    if (typeof _GemaDB !== 'undefined' && _GemaDB.loadFromModule) {
      try {
        var existing = await _GemaDB.loadFromModule(BETA_KEY, dataKey) || [];
        if (!Array.isArray(existing)) existing = [];
        existing.unshift(entry);
        if (existing.length > 100) existing = existing.slice(0, 100);
        ok = await _GemaDB.saveToModule(BETA_KEY, dataKey, existing);
      } catch(e) { console.warn('[GemaFeedback] GemaDB save error:', e); }
    }

    // Fallback: localStorage
    if (!ok) {
      try {
        var lsKey = 'gema_feedback_' + _moduleId;
        var existing = JSON.parse(localStorage.getItem(lsKey) || '[]');
        existing.unshift(entry);
        if (existing.length > 50) existing = existing.slice(0, 50);
        localStorage.setItem(lsKey, JSON.stringify(existing));
        ok = true;
      } catch(e) { console.warn('[GemaFeedback] localStorage save error:', e); }
    }

    if (btn) { btn.disabled = false; btn.textContent = '📤 Feedback senden'; }
    if (ok) {
      var taEl = document.getElementById('gfb-text');
      if (taEl) taEl.value = '';
      // Name bewusst NICHT leeren — er wird beim nächsten Öffnen sonst als
      // «leer» wahrgenommen (Feedback 14.07.); Prefill greift nur bei leerem Feld.
      close();
      _toast('✓ Feedback gespeichert');
    } else {
      _toast('⚠ Fehler beim Speichern');
    }
  }

  var _toastEl = null, _toastTimer;
  function _toast(msg) {
    if (!_toastEl) {
      _toastEl = document.createElement('div');
      Object.assign(_toastEl.style, {
        position:'fixed', bottom:'24px', left:'50%',
        transform:'translateX(-50%) translateY(40px)',
        background:'#0f172a', color:'#fff', padding:'11px 22px',
        borderRadius:'10px', fontSize:'13.5px', fontWeight:'700',
        boxShadow:'0 8px 32px rgba(0,0,0,.25)', opacity:'0',
        transition:'.25s', pointerEvents:'none', zIndex:'9999', whiteSpace:'nowrap'
      });
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.style.opacity = '1';
    _toastEl.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function() {
      _toastEl.style.opacity = '0';
      _toastEl.style.transform = 'translateX(-50%) translateY(40px)';
    }, 2800);
  }

  w.GemaFeedback = { init: init, start: start, startWithImage: startWithImage, close: close, submit: submit, H2C_CDN: H2C_CDN };

  // Test-Hooks (Playwright) — kein Public API
  w._gfbHooks = {
    openAnnotation: _openAnnotation,
    setColor: _setAnnotColor,
    color: function() { return _annotColor; },
    colors: GFB_COLORS,
    setTool: _setAnnotTool,
    tool: function() { return _annotTool; },
    shapes: function() { return _annotShapes; },
    undo: _undoAnnotation,
    clear: _clearAnnotation,
    finish: _finishAnnotation,
    commitText: _commitTextInput,
    screenshot: function() { return _screenshotDataUrl; }
  };

})(window);
