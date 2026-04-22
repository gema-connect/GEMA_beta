/* gema_notify_ui.js — UI-Schicht fuer GemaNotify
   -----------------------------------------------
   - Auto-Inject einer Glocke in .g-nav-actions/.g-nav-right
   - Dropdown-Panel mit Liste + Badge fuer ungelesene
   - Toast oben rechts bei neuen Notifikationen (Cross-Tab)
   - Polling 30s
*/
(function(w,d){
  'use strict';
  if(typeof w.GemaNotify==='undefined'){
    console.warn('[GemaNotifyUI] GemaNotify fehlt — Skript nicht geladen');
    return;
  }

  var POLL_MS = 30000;
  var TYP_COLORS = {
    info:    {bg:'#eff6ff', fg:'#1d4ed8', icon:'💬', border:'#bfdbfe'},
    aktion:  {bg:'#fff7ed', fg:'#c2410c', icon:'⚡', border:'#fed7aa'},
    erfolg:  {bg:'#f0fdf4', fg:'#15803d', icon:'✓',  border:'#bbf7d0'},
    warnung: {bg:'#fef2f2', fg:'#b91c1c', icon:'⚠',  border:'#fecaca'}
  };

  var _lastKnownIds = {}; // fuer Toast-Detection neuer Notifikationen
  var _btnEl=null, _badgeEl=null, _panelEl=null, _toastWrap=null;
  var _open=false;

  // ── Style-Injection (einmalig) ──────────────────────────────
  function _injectStyle(){
    if(d.getElementById('gema-notify-style'))return;
    var css=''
      +'.gn-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:32px;padding:0;border-radius:8px;border:1px solid var(--brd2,#c8cfdf);background:#fff;color:var(--txt2,#334155);font-size:16px;cursor:pointer;transition:.15s;font-family:inherit}'
      +'.gn-btn:hover{background:var(--bg2,#f1f5f9)}'
      +'.gn-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#dc2626;color:#fff;font-size:10px;font-weight:800;display:none;align-items:center;justify-content:center;line-height:1;box-shadow:0 0 0 2px #fff}'
      +'.gn-badge.has{display:flex}'
      +'.gn-panel{position:fixed;top:56px;right:12px;width:380px;max-width:calc(100vw - 24px);max-height:70vh;background:#fff;border:1.5px solid var(--brd,#e2e8f0);border-radius:12px;box-shadow:0 12px 40px -8px rgba(0,0,0,.2);z-index:9999;display:none;flex-direction:column;overflow:hidden;font-family:var(--sans,"DM Sans",sans-serif)}'
      +'.gn-panel.open{display:flex}'
      +'.gn-hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--brd,#e2e8f0);background:#f8fafc}'
      +'.gn-hd-title{font-size:13px;font-weight:800;color:var(--txt,#0f172a);flex:1}'
      +'.gn-hd-btn{font-size:11px;color:var(--mut,#64748b);background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:5px;font-family:inherit}'
      +'.gn-hd-btn:hover{background:#e2e8f0;color:var(--txt,#0f172a)}'
      +'.gn-list{flex:1;overflow-y:auto;padding:4px}'
      +'.gn-empty{padding:40px 16px;text-align:center;color:var(--mut,#94a3b8);font-size:12.5px}'
      +'.gn-item{display:flex;gap:10px;padding:11px 12px;border-radius:8px;cursor:pointer;border:1px solid transparent;margin-bottom:2px;transition:.12s}'
      +'.gn-item:hover{background:#f1f5f9}'
      +'.gn-item.unread{background:#eff6ff;border-color:#bfdbfe}'
      +'.gn-item.unread:hover{background:#dbeafe}'
      +'.gn-ic{flex-shrink:0;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}'
      +'.gn-body{flex:1;min-width:0}'
      +'.gn-title{font-size:12.5px;font-weight:700;color:var(--txt,#0f172a);margin-bottom:2px;line-height:1.3}'
      +'.gn-text{font-size:11.5px;color:var(--txt2,#475569);line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}'
      +'.gn-meta{font-size:10px;color:var(--mut,#94a3b8);margin-top:4px;display:flex;align-items:center;gap:6px}'
      +'.gn-dot{width:6px;height:6px;border-radius:50%;background:#3b82f6;flex-shrink:0}'
      +'.gn-del{opacity:0;font-size:10px;color:var(--mut,#94a3b8);background:none;border:none;cursor:pointer;padding:2px 6px;margin-left:auto;transition:.12s;font-family:inherit}'
      +'.gn-item:hover .gn-del{opacity:1}'
      +'.gn-del:hover{color:#dc2626}'
      +'.gn-toast-wrap{position:fixed;top:66px;right:16px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:360px}'
      +'.gn-toast{pointer-events:auto;background:#fff;border:1.5px solid;border-radius:10px;padding:12px 14px;box-shadow:0 10px 30px -10px rgba(0,0,0,.25);display:flex;gap:10px;align-items:flex-start;animation:gnIn .25s ease-out;font-family:var(--sans,"DM Sans",sans-serif);cursor:pointer;max-width:360px}'
      +'.gn-toast.leave{animation:gnOut .2s ease-in forwards}'
      +'@keyframes gnIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}'
      +'@keyframes gnOut{to{transform:translateX(20px);opacity:0}}'
      +'@media (max-width:640px){.gn-panel{right:8px;left:8px;width:auto;max-width:none}.gn-toast-wrap{left:8px;right:8px;max-width:none}.gn-toast{max-width:none}}';
    var st=d.createElement('style');
    st.id='gema-notify-style';
    st.textContent=css;
    d.head.appendChild(st);
  }

  // ── Zeit-Helper ─────────────────────────────────────────────
  function _fmtTime(ts){
    if(!ts)return '';
    var t=Date.parse(ts); if(isNaN(t))return '';
    var diff=(Date.now()-t)/1000;
    if(diff<60)return 'jetzt';
    if(diff<3600)return Math.floor(diff/60)+'min';
    if(diff<86400)return Math.floor(diff/3600)+'h';
    if(diff<604800)return Math.floor(diff/86400)+'d';
    var dt=new Date(t);
    var dd=('0'+dt.getDate()).slice(-2);
    var mm=('0'+(dt.getMonth()+1)).slice(-2);
    return dd+'.'+mm+'.';
  }
  function _esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}

  // ── Glocke + Badge injizieren ───────────────────────────────
  function _injectButton(){
    // Suche nach .g-nav-actions oder .g-nav-right
    var host=d.querySelector('.g-nav-actions')||d.querySelector('.g-nav-right');
    if(!host)return false;
    if(host.querySelector('.gn-btn'))return true; // schon da
    _btnEl=d.createElement('button');
    _btnEl.className='gn-btn no-print';
    _btnEl.setAttribute('aria-label','Benachrichtigungen');
    _btnEl.innerHTML='🔔<span class="gn-badge" id="gnBadge">0</span>';
    _btnEl.addEventListener('click',function(e){
      e.stopPropagation();
      _toggle();
    });
    // vor dem Feedback-Button einsetzen, wenn vorhanden
    var fb=host.querySelector('#feedbackBtn');
    if(fb) host.insertBefore(_btnEl,fb);
    else   host.appendChild(_btnEl);
    _badgeEl=_btnEl.querySelector('#gnBadge');
    return true;
  }

  function _ensurePanel(){
    if(_panelEl)return _panelEl;
    _panelEl=d.createElement('div');
    _panelEl.className='gn-panel';
    _panelEl.innerHTML=''
      +'<div class="gn-hd">'
      +'  <div class="gn-hd-title">🔔 Benachrichtigungen</div>'
      +'  <button class="gn-hd-btn" id="gnAllRead">Alle gelesen</button>'
      +'  <button class="gn-hd-btn" id="gnSettings" title="Einstellungen">⚙</button>'
      +'</div>'
      +'<div class="gn-list" id="gnList"></div>';
    d.body.appendChild(_panelEl);
    _panelEl.querySelector('#gnAllRead').addEventListener('click',function(e){
      e.stopPropagation();
      w.GemaNotify.markAllRead(); _renderPanel(); _renderBadge();
    });
    _panelEl.querySelector('#gnSettings').addEventListener('click',function(e){
      e.stopPropagation();
      _openSettings();
    });
    // Klick ausserhalb schliesst
    d.addEventListener('click',function(e){
      if(!_open)return;
      if(_panelEl.contains(e.target)||(_btnEl&&_btnEl.contains(e.target)))return;
      _close();
    });
    // ESC schliesst
    d.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&_open)_close();
    });
    return _panelEl;
  }

  function _toggle(){ _open?_close():_openPanel(); }
  function _openPanel(){
    _ensurePanel();
    _panelEl.classList.add('open');
    _open=true;
    _renderPanel();
  }
  function _close(){
    if(_panelEl)_panelEl.classList.remove('open');
    _open=false;
  }

  function _renderBadge(){
    if(!_badgeEl)return;
    var c=w.GemaNotify.getUnreadCount();
    _badgeEl.textContent=c>99?'99+':String(c);
    if(c>0) _badgeEl.classList.add('has');
    else    _badgeEl.classList.remove('has');
  }

  function _renderPanel(){
    if(!_panelEl)return;
    var list=_panelEl.querySelector('#gnList');
    var items=w.GemaNotify.getForCurrentUser();
    if(!items.length){
      list.innerHTML='<div class="gn-empty">Keine Benachrichtigungen</div>';
      return;
    }
    list.innerHTML=items.map(function(n){
      var col=TYP_COLORS[n.typ]||TYP_COLORS.info;
      return '<div class="gn-item'+(n.gelesen?'':' unread')+'" data-id="'+_esc(n.id)+'" data-link="'+_esc(n.link)+'">'
        +'<div class="gn-ic" style="background:'+col.bg+';color:'+col.fg+'">'+col.icon+'</div>'
        +'<div class="gn-body">'
        +  '<div class="gn-title">'+_esc(n.titel)+'</div>'
        +  '<div class="gn-text">'+_esc(n.text)+'</div>'
        +  '<div class="gn-meta">'
        +    (n.gelesen?'':'<span class="gn-dot"></span>')
        +    '<span>'+_fmtTime(n.ts)+'</span>'
        +    (n.modul?'<span>· '+_esc(n.modul)+'</span>':'')
        +    '<button class="gn-del" data-del="'+_esc(n.id)+'" title="Löschen">✕</button>'
        +  '</div>'
        +'</div>'
        +'</div>';
    }).join('');
    // Event-Delegation
    list.querySelectorAll('.gn-item').forEach(function(el){
      el.addEventListener('click',function(e){
        if(e.target.hasAttribute('data-del')){
          e.stopPropagation();
          w.GemaNotify.remove(el.getAttribute('data-del'));
          _renderPanel(); _renderBadge();
          return;
        }
        var id=el.getAttribute('data-id');
        var link=el.getAttribute('data-link');
        w.GemaNotify.markRead(id);
        if(link) w.location.href=link;
        else { _renderPanel(); _renderBadge(); }
      });
    });
  }

  // ── Toast fuer neue Notifikationen ──────────────────────────
  function _ensureToastWrap(){
    if(_toastWrap)return _toastWrap;
    _toastWrap=d.createElement('div');
    _toastWrap.className='gn-toast-wrap no-print';
    d.body.appendChild(_toastWrap);
    return _toastWrap;
  }
  function _showToast(n){
    _ensureToastWrap();
    var col=TYP_COLORS[n.typ]||TYP_COLORS.info;
    var el=d.createElement('div');
    el.className='gn-toast';
    el.style.borderColor=col.border;
    el.innerHTML=''
      +'<div class="gn-ic" style="background:'+col.bg+';color:'+col.fg+';width:32px;height:32px;font-size:14px">'+col.icon+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'  <div style="font-size:12.5px;font-weight:800;color:#0f172a;margin-bottom:2px">'+_esc(n.titel)+'</div>'
      +'  <div style="font-size:11.5px;color:#475569;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">'+_esc(n.text)+'</div>'
      +'</div>'
      +'<button style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 4px;flex-shrink:0">✕</button>';
    el.addEventListener('click',function(e){
      if(e.target.tagName==='BUTTON'){ _dismissToast(el); return; }
      w.GemaNotify.markRead(n.id);
      if(n.link) w.location.href=n.link;
      else _dismissToast(el);
    });
    _toastWrap.appendChild(el);
    setTimeout(function(){_dismissToast(el);},8000);
  }
  function _dismissToast(el){
    if(!el||!el.parentNode)return;
    el.classList.add('leave');
    setTimeout(function(){ if(el.parentNode)el.parentNode.removeChild(el); },250);
  }

  // ── Neue Notifikationen erkennen (fuer Toast) ────────────────
  function _detectNew(){
    var u=w.GemaNotify._getAll?w.GemaNotify._getAll():[];
    var items=w.GemaNotify.getForCurrentUser();
    var newOnes=[];
    items.forEach(function(n){
      if(!_lastKnownIds[n.id]){
        // Erster Durchlauf: nur markieren, keine Toasts
        if(_lastKnownIdsInitialized && !n.gelesen) newOnes.push(n);
        _lastKnownIds[n.id]=true;
      }
    });
    _lastKnownIdsInitialized=true;
    newOnes.slice(0,3).forEach(_showToast); // max 3 gleichzeitig
  }
  var _lastKnownIdsInitialized=false;

  // ── Settings-Dialog (Abo-Preferences) ────────────────────────
  function _openSettings(){
    _close();
    var overlay=d.getElementById('gnSettingsOverlay');
    if(overlay)overlay.remove();
    overlay=d.createElement('div');
    overlay.id='gnSettingsOverlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;font-family:var(--sans,"DM Sans",sans-serif)';
    var keys=Object.keys(w.GemaNotify.EVENT_KEYS);
    var rows=keys.map(function(k){
      var ev=w.GemaNotify.EVENT_KEYS[k];
      var on=w.GemaNotify.isEventEnabled(k);
      return '<label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:8px;cursor:pointer;margin-bottom:8px;background:'+(on?'#f0fdf4':'#fff')+'">'
        +'<input type="checkbox" data-ev="'+_esc(k)+'" '+(on?'checked':'')+' style="width:18px;height:18px;cursor:pointer"/>'
        +'<div style="flex:1"><div style="font-size:13px;font-weight:700;color:#0f172a">'+_esc(ev.label)+'</div>'
        +'<div style="font-size:11px;color:#64748b;margin-top:2px">Modul: '+_esc(ev.modul||'—')+'</div></div>'
        +'</label>';
    }).join('');
    overlay.innerHTML=''
      +'<div style="background:#fff;border-radius:14px;padding:24px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px -10px rgba(0,0,0,.3)">'
      +'  <h3 style="margin:0 0 6px;font-size:17px;font-weight:800">🔔 Benachrichtigungs-Einstellungen</h3>'
      +'  <p style="margin:0 0 16px;font-size:12px;color:#64748b">Wähle, welche Benachrichtigungen du erhalten möchtest. Änderungen gelten ab sofort.</p>'
      +'  <div id="gnPrefList">'+rows+'</div>'
      +'  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
      +'    <button id="gnPrefClose" style="padding:8px 18px;border-radius:8px;border:1.5px solid #c8cfdf;background:#fff;color:#334155;cursor:pointer;font-weight:600;font-family:inherit">Schliessen</button>'
      +'  </div>'
      +'</div>';
    d.body.appendChild(overlay);
    d.body.classList.add('modal-open');
    overlay.querySelector('#gnPrefClose').addEventListener('click',function(){overlay.remove();d.body.classList.remove('modal-open');});
    overlay.querySelectorAll('input[type=checkbox]').forEach(function(cb){
      cb.addEventListener('change',function(){
        w.GemaNotify.setPref(cb.getAttribute('data-ev'), cb.checked);
        cb.parentElement.style.background=cb.checked?'#f0fdf4':'#fff';
      });
    });
  }

  // ── Init ────────────────────────────────────────────────────
  function _init(){
    _injectStyle();
    var ok=_injectButton();
    if(!ok){
      // Navigation nicht da — warten bis DOM fertig
      setTimeout(_init,200);
      return;
    }
    _renderBadge();
    w.GemaNotify.onChange(function(){ _renderBadge(); if(_open)_renderPanel(); });
    // Polling
    setInterval(function(){
      _renderBadge();
      _detectNew();
      if(_open)_renderPanel();
    }, POLL_MS);
    // initial
    _detectNew();
  }

  if(d.readyState==='loading') d.addEventListener('DOMContentLoaded',_init);
  else _init();

})(window, document);
