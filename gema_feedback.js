/**
 * gema_feedback.js  —  GEMA Feedback-System v3
 * Features: Snipping-Screenshot + Rotstift-Annotation + Feedback-Formular
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

  // ── Annotation state ──
  let _annotCanvas = null, _annotCtx = null;
  let _annotDrawing = false, _annotPaths = [];

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
        '<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 22px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:9001;pointer-events:none;white-space:nowrap">' +
          'Bereich ausw&auml;hlen — Maus gedr&uuml;ckt halten und Rechteck ziehen &nbsp;&middot;&nbsp; ESC zum Abbrechen' +
        '</div>' +
        '<div id="gfb-sel" style="display:none;position:fixed;border:2.5px solid #3b82f6;background:rgba(59,130,246,.12);pointer-events:none"></div>' +
      '</div>' +

      /* ── ANNOTATION OVERLAY ── */
      '<div id="gfb-annot" style="display:none;position:fixed;inset:0;z-index:9050;background:rgba(15,23,42,.85);backdrop-filter:blur(4px)">' +
        '<div style="position:fixed;top:0;left:0;right:0;z-index:9052;background:#0f172a;padding:10px 20px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.3)">' +
          '<span style="font-size:14px">🖊</span>' +
          '<span style="color:#fff;font-size:13px;font-weight:700;flex:1">Mit Rotstift markieren — Klick &amp; ziehen zum Zeichnen</span>' +
        '</div>' +
        '<div id="gfb-annot-wrap" style="position:absolute;top:52px;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:auto;padding:20px;gap:12px">' +
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
            // Save scroll position before capture
            var sx = Math.round(window.scrollX);
            var sy = Math.round(window.scrollY);
            // Force html2canvas to render from top-left of document (no scroll offset)
            var fullCanvas = await html2canvas(document.body, {
              scrollX: 0, scrollY: 0,
              windowWidth: document.documentElement.scrollWidth,
              windowHeight: document.documentElement.scrollHeight,
              scale: 1.5, logging: false, useCORS: true, allowTaint: true
            });
            // _snipRect is viewport-relative (clientX/Y), add scroll for document coords
            var sc = 1.5;
            var cropX = Math.round((_snipRect.x + sx) * sc);
            var cropY = Math.round((_snipRect.y + sy) * sc);
            var cropW = Math.round(_snipRect.w * sc);
            var cropH = Math.round(_snipRect.h * sc);
            // Clamp to canvas bounds
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
  // ANNOTATION
  // ═══════════════════════════════════════════
  function _openAnnotation(dataUrl) {
    var annot = document.getElementById('gfb-annot');
    var img   = document.getElementById('gfb-annot-img');
    if (!annot || !img) { _showModal(); return; }

    _annotPaths = [];
    _annotDrawing = false;

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

      // ── Drawing events ──
      var currentPath = null;

      function getPos(e) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = canvas.width / rect.width;
        var scaleY = canvas.height / rect.height;
        var touch = e.touches ? e.touches[0] : e;
        return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
      }

      canvas.addEventListener('mousedown', function(e) {
        e.preventDefault();
        _annotDrawing = true;
        var pos = getPos(e);
        currentPath = [pos];
        _annotPaths.push(currentPath);
        _annotCtx.beginPath();
        _annotCtx.moveTo(pos.x, pos.y);
      });

      canvas.addEventListener('mousemove', function(e) {
        if (!_annotDrawing) return;
        e.preventDefault();
        var pos = getPos(e);
        currentPath.push(pos);
        _annotCtx.strokeStyle = '#dc2626';
        _annotCtx.lineWidth = Math.max(3, canvas.width / 180);
        _annotCtx.lineCap = 'round';
        _annotCtx.lineJoin = 'round';
        _annotCtx.lineTo(pos.x, pos.y);
        _annotCtx.stroke();
      });

      canvas.addEventListener('mouseup', function() { _annotDrawing = false; currentPath = null; });
      canvas.addEventListener('mouseleave', function() { _annotDrawing = false; currentPath = null; });

      // Touch
      canvas.addEventListener('touchstart', function(e) {
        e.preventDefault();
        _annotDrawing = true;
        var pos = getPos(e);
        currentPath = [pos];
        _annotPaths.push(currentPath);
        _annotCtx.beginPath();
        _annotCtx.moveTo(pos.x, pos.y);
      }, {passive:false});

      canvas.addEventListener('touchmove', function(e) {
        if (!_annotDrawing) return;
        e.preventDefault();
        var pos = getPos(e);
        currentPath.push(pos);
        _annotCtx.strokeStyle = '#dc2626';
        _annotCtx.lineWidth = Math.max(3, canvas.width / 180);
        _annotCtx.lineCap = 'round';
        _annotCtx.lineJoin = 'round';
        _annotCtx.lineTo(pos.x, pos.y);
        _annotCtx.stroke();
      }, {passive:false});

      canvas.addEventListener('touchend', function() { _annotDrawing = false; currentPath = null; });
    };
    img.src = dataUrl;
    annot.style.display = 'block';
  }

  function _redrawAnnotation() {
    if (!_annotCtx || !_annotCanvas) return;
    _annotCtx.clearRect(0, 0, _annotCanvas.width, _annotCanvas.height);
    _annotCtx.strokeStyle = '#dc2626';
    _annotCtx.lineWidth = Math.max(3, _annotCanvas.width / 200);
    _annotCtx.lineCap = 'round';
    _annotCtx.lineJoin = 'round';
    _annotPaths.forEach(function(path) {
      if (path.length < 2) return;
      _annotCtx.beginPath();
      _annotCtx.moveTo(path[0].x, path[0].y);
      for (var i = 1; i < path.length; i++) {
        _annotCtx.lineTo(path[i].x, path[i].y);
      }
      _annotCtx.stroke();
    });
  }

  function _undoAnnotation() {
    if (_annotPaths.length > 0) {
      _annotPaths.pop();
      _redrawAnnotation();
    }
  }

  function _clearAnnotation() {
    _annotPaths = [];
    _redrawAnnotation();
  }

  function _finishAnnotation() {
    // Merge annotation onto screenshot
    if (_annotCanvas && _annotPaths.length > 0) {
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
    var authorEl = document.getElementById('gfb-author');
    if (authorEl && !authorEl.value) {
      try {
        if (typeof GemaAuth !== 'undefined') {
          var user = GemaAuth.getCurrentUser();
          if (user) authorEl.value = user.name || user.username || '';
        }
      } catch(e) {}
    }
    var modal = document.getElementById('gfb-modal');
    if (modal) modal.style.display = 'flex';
  }

  function start() {
    _snipRect = null;
    _screenshotDataUrl = '';
    _annotPaths = [];
    var p = document.getElementById('gfb-preview');
    if (p) { p.src = ''; p.style.display = 'none'; }
    var ov = document.getElementById('gfb-overlay');
    if (ov) { ov.style.display = 'block'; document.body.style.cursor = 'crosshair'; }
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
      var auEl = document.getElementById('gfb-author');
      if (taEl) taEl.value = '';
      if (auEl) auEl.value = '';
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

  w.GemaFeedback = { init: init, start: start, close: close, submit: submit };

})(window);
