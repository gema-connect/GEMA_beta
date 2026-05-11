/* gema_dialog.js — eigene Alert/Confirm/Prompt-Dialoge im GEMA-Style
 *
 * API:
 *   GemaDialog.alert({title, message, label})         -> Promise<void>
 *   GemaDialog.confirm({title, message, confirmLabel,
 *                       cancelLabel, danger})         -> Promise<bool>
 *   GemaDialog.prompt({title, message, placeholder,
 *                      defaultValue, label})          -> Promise<string|null>
 *
 * Globaler Override:
 *   window.alert(msg) wird automatisch durch GemaDialog.alert ersetzt,
 *   sodass bestehender Code sofort schoenere Dialoge zeigt. Da alert
 *   keinen Rueckgabewert braucht, ist das transparent.
 *
 * Hinweis zu confirm/prompt: NICHT global ueberschrieben, weil
 * bestehender Code wie `if (!confirm())` synchronen Rueckgabewert
 * erwartet. Native bleibt als Fallback, neue Stellen sollen
 * GemaDialog.confirm/prompt nutzen.
 */
(function(w){
  if(w.GemaDialog) return;

  function _esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function _build(opts, type){
    opts = opts || {};
    var bg = document.createElement('div');
    bg.className = 'gema-dlg-bg';
    var card = document.createElement('div');
    card.className = 'gema-dlg';
    var titleHtml = opts.title ? '<div class="gema-dlg-title">'+_esc(opts.title)+'</div>' : '';
    var msgHtml = opts.message
      ? '<div class="gema-dlg-msg">'+_esc(opts.message).replace(/\n/g,'<br>')+'</div>'
      : '';
    var inputHtml = '';
    if(type === 'prompt'){
      inputHtml = '<input type="text" class="gema-dlg-input" id="_gdInput"'
        + ' placeholder="'+_esc(opts.placeholder||'')+'"'
        + ' value="'+_esc(opts.defaultValue||'')+'"'
        + ' autocomplete="off">';
    }
    var actions = '';
    if(type === 'alert'){
      actions = '<button class="gema-dlg-btn gema-dlg-confirm" data-act="ok">'+_esc(opts.label||'OK')+'</button>';
    } else if(type === 'confirm'){
      var confirmCls = opts.danger ? 'gema-dlg-btn gema-dlg-danger' : 'gema-dlg-btn gema-dlg-confirm';
      actions = '<button class="gema-dlg-btn gema-dlg-cancel" data-act="cancel">'+_esc(opts.cancelLabel||'Abbrechen')+'</button>'
              + '<button class="'+confirmCls+'" data-act="ok">'+_esc(opts.confirmLabel||'Bestätigen')+'</button>';
    } else { // prompt
      actions = '<button class="gema-dlg-btn gema-dlg-cancel" data-act="cancel">'+_esc(opts.cancelLabel||'Abbrechen')+'</button>'
              + '<button class="gema-dlg-btn gema-dlg-confirm" data-act="ok">'+_esc(opts.label||'OK')+'</button>';
    }
    card.innerHTML = titleHtml + msgHtml + inputHtml
      + '<div class="gema-dlg-actions">' + actions + '</div>';
    bg.appendChild(card);
    return bg;
  }

  function _show(opts, type){
    return new Promise(function(resolve){
      var bg = _build(opts, type);
      document.body.appendChild(bg);
      // Focus management — Input bei prompt, sonst Confirm-Button
      setTimeout(function(){
        try {
          var input = bg.querySelector('#_gdInput');
          if(input){ input.focus(); input.select && input.select(); }
          else {
            var btn = bg.querySelector('.gema-dlg-confirm') || bg.querySelector('.gema-dlg-danger');
            if(btn) btn.focus();
          }
        } catch(e){}
      }, 30);

      function close(result){
        try { bg.remove(); } catch(e){}
        // Falls noch andere offene Dialoge: Body-Lock bleibt; Auto-Hook
        // in gema_scroll.js erkennt das via .modal-bg-Klasse. Da unser
        // Dialog NICHT .modal-bg ist (eigene Klasse), kuemmern wir uns
        // selbst nicht um Body-Scroll-Lock.
        resolve(result);
      }

      bg.addEventListener('click', function(ev){
        var t = ev.target;
        if(t && t.dataset && t.dataset.act){
          var act = t.dataset.act;
          if(type === 'alert')   close();
          if(type === 'confirm') close(act === 'ok');
          if(type === 'prompt'){
            if(act === 'ok'){
              var v = bg.querySelector('#_gdInput');
              close(v ? v.value : '');
            } else close(null);
          }
        } else if(t === bg){
          // Klick auf Backdrop = Cancel (nur fuer confirm/prompt;
          // alert braucht expliziten Klick auf OK)
          if(type !== 'alert'){
            if(type === 'confirm') close(false);
            else close(null);
          }
        }
      });

      // Enter/Escape
      bg.addEventListener('keydown', function(ev){
        if(ev.key === 'Escape'){
          if(type === 'alert')   close();
          else if(type === 'confirm') close(false);
          else                   close(null);
        } else if(ev.key === 'Enter'){
          // Bei prompt: Enter bestaetigt; bei confirm/alert: nur wenn
          // der Confirm-Button fokussiert ist (Default-Verhalten von
          // <button>).
          if(type === 'prompt' && ev.target && ev.target.id === '_gdInput'){
            ev.preventDefault();
            var v = bg.querySelector('#_gdInput');
            close(v ? v.value : '');
          }
        }
      });
    });
  }

  w.GemaDialog = {
    alert:   function(opts){ return _show(typeof opts==='string'?{message:opts}:(opts||{}), 'alert'); },
    confirm: function(opts){ return _show(typeof opts==='string'?{message:opts}:(opts||{}), 'confirm'); },
    prompt:  function(opts){ return _show(typeof opts==='string'?{message:opts}:(opts||{}), 'prompt'); }
  };

  // ── Globaler Override fuer window.alert ──
  // Bestehender Code mit alert('...') zeigt automatisch den schoenen
  // Modal-Dialog statt der nativen Browser-Box. alert braucht keinen
  // Rueckgabewert, daher transparent.
  // window.confirm / window.prompt werden NICHT ueberschrieben (sync-
  // return-Pattern wuerde brechen).
  try {
    var _native = w.alert;
    w.alert = function(msg){
      // Wenn das DOM noch nicht da ist, faellt das auf nativ zurueck.
      if(!document.body){ try { _native(msg); } catch(e){} return; }
      GemaDialog.alert({ message: String(msg == null ? '' : msg) });
    };
  } catch(e){}
})(window);
