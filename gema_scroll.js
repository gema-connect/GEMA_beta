/* gema_scroll.js – Scroll-Position wiederherstellen bei Browser-Zurück
   Speichert die Scroll-Position in sessionStorage bevor die Seite verlassen wird.
   Beim Zurückkehren (popstate / back) wird die Position wiederhergestellt. */
(function() {
  var key = 'gema_scroll__' + location.pathname;

  // Speichern bei jeder Scroll-Bewegung (throttled)
  var tid;
  window.addEventListener('scroll', function() {
    clearTimeout(tid);
    tid = setTimeout(function() {
      try { sessionStorage.setItem(key, String(window.scrollY)); } catch(e) {}
    }, 150);
  }, { passive: true });

  // Position wiederherstellen wenn Seite aus dem Cache geladen wird (back/forward)
  window.addEventListener('pageshow', function(e) {
    if (e.persisted) {
      var pos = sessionStorage.getItem(key);
      if (pos) window.scrollTo(0, parseInt(pos, 10));
    }
  });

  // Auch bei normalem Laden prüfen (für Browser die kein bfcache nutzen)
  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  var isBack = nav && nav.type === 'back_forward';
  if (!isBack && window.performance && window.performance.navigation) {
    isBack = window.performance.navigation.type === 2;
  }
  if (isBack) {
    var pos = sessionStorage.getItem(key);
    if (pos) {
      // Kurz warten bis DOM gerendert ist
      requestAnimationFrame(function() {
        window.scrollTo(0, parseInt(pos, 10));
      });
    }
  }
})();

(function(){
  function check(){
    var hasModal=document.querySelector('.modal-bg:not(.hidden)')
      ||document.getElementById('_wzModalOverlay')
      ||document.getElementById('_gorOverlay')
      ||document.getElementById('gnSettingsOverlay');
    if(hasModal)document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
  }
  var obs=new MutationObserver(check);
  document.addEventListener('DOMContentLoaded',function(){
    obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  });
})();
