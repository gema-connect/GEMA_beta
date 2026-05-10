/* gema_pwa.js — PWA-Install-Helper (globaler Singleton)
 *
 * Faengt beforeinstallprompt-Event ein und exponiert eine API zum
 * spaeteren Triggern. Notwendig, weil das Event nur einmalig vom
 * Browser gefeuert wird — wir muessen es daher global zwischen-
 * speichern, damit der "Installieren"-Button auf der Profilseite
 * jederzeit verfuegbar ist.
 *
 * Browser-Support:
 *   - Chrome/Edge auf Android + Desktop: feuert beforeinstallprompt
 *   - Safari (iOS/macOS): feuert NICHT — getStatus() liefert
 *     'manual_ios' und der UI-Code zeigt eine "Teilen → Zum Home-
 *     Bildschirm"-Anleitung an.
 *   - Firefox: kein Auto-Prompt, aber "App installieren" via Menu
 *
 * API:
 *   GemaPWA.isInstalled()   -> bool
 *   GemaPWA.canPrompt()     -> bool (Browser hat Prompt geliefert)
 *   GemaPWA.getStatus()     -> 'installed' | 'ready' | 'manual_ios' | 'unavailable'
 *   GemaPWA.install()       -> Promise<{ outcome: 'accepted'|'dismissed'|'unavailable' }>
 *   GemaPWA.onChange(fn)    -> Listener fuer Status-Aenderungen
 */
(function(w){
  if(w.GemaPWA) return;

  var _deferredPrompt = null;
  var _listeners = [];

  function _isStandalone(){
    try{
      if(w.matchMedia && w.matchMedia('(display-mode:standalone)').matches) return true;
      if(w.navigator && w.navigator.standalone === true) return true; // iOS Safari
    }catch(e){}
    return false;
  }

  function _isIOS(){
    try{
      var ua = w.navigator.userAgent || '';
      // iPad on iOS 13+ identifies as Mac, distinguish via touch
      var isIPadOS = ua.indexOf('Mac') >= 0 && w.navigator.maxTouchPoints > 1;
      return /iPhone|iPad|iPod/i.test(ua) || isIPadOS;
    }catch(e){ return false; }
  }

  function _notify(){
    _listeners.forEach(function(fn){ try{ fn(GemaPWA.getStatus()); }catch(e){} });
  }

  w.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    _deferredPrompt = e;
    _notify();
  });

  w.addEventListener('appinstalled', function(){
    _deferredPrompt = null;
    try{ localStorage.setItem('gema_pwa_installed_at', new Date().toISOString()); }catch(e){}
    _notify();
  });

  var GemaPWA = {
    isInstalled: _isStandalone,
    canPrompt: function(){ return !!_deferredPrompt; },
    isIOS: _isIOS,
    getStatus: function(){
      if(_isStandalone()) return 'installed';
      if(_deferredPrompt) return 'ready';
      if(_isIOS()) return 'manual_ios';
      return 'unavailable';
    },
    install: function(){
      if(_isStandalone()) return Promise.resolve({ outcome: 'installed' });
      if(!_deferredPrompt) return Promise.resolve({ outcome: 'unavailable' });
      var p = _deferredPrompt;
      _deferredPrompt = null;
      try{ p.prompt(); }catch(e){ return Promise.resolve({ outcome: 'unavailable' }); }
      return p.userChoice.then(function(choice){
        _notify();
        return { outcome: (choice && choice.outcome) || 'dismissed' };
      });
    },
    onChange: function(fn){
      if(typeof fn === 'function') _listeners.push(fn);
      return function(){ _listeners = _listeners.filter(function(x){ return x!==fn; }); };
    }
  };

  w.GemaPWA = GemaPWA;
})(window);
