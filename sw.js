/* GEMA Service Worker — Offline Cache + Push Vorbereitung */
var CACHE_NAME = 'gema-v3';
var CACHE_FILES = [
  '/', '/index.html', '/sb_index.html',
  '/sa_enthaertung.html', '/sa_osmose.html', '/sa_fettabscheider.html',
  '/sa_frischwasserstation.html', '/sa_oelabscheider.html', '/sa_schlammsammler.html',
  '/sa_solaranlage.html', '/sa_abwasserhebeanlage.html',
  '/sb_lu_tabelle.html', '/sb_druckerhoehung.html', '/sb_druckverlust.html',
  '/sb_warmwasser.html', '/sb_niederschlag.html', '/sb_vonroll.html',
  '/sb_grobauslegung.html', '/sb_ausstosszeiten.html', '/sb_laengenausdehnung.html',
  '/sb_druckdispositiv.html', '/sb_apparateliste.html', '/sb_du_zusammenstellung.html',
  '/pm_objekte.html', '/pm_ausschreibungsunterlagen.html', '/pm_ausschreibung.html',
  '/pm_terminplan.html', '/pm_besprechung.html', '/pm_baustelle.html',
  '/pm_abnahme.html', '/pm_kostenkontrolle.html', '/pm_honorar.html',
  '/hy_w12.html', '/hy_inspektion.html', '/hy_spuelmanager.html',
  '/ab_index.html', '/ab_sephir.html', '/ab_berufsschule.html', '/ab_quiz.html',
  '/sys_login.html', '/sys_admin.html', '/sys_profil.html',
  '/sys_produktkatalog.html', '/sys_lieferanten.html', '/sys_lieferant_dashboard.html',
  '/sys_preise.html', '/sys_beta.html',
  '/br_vkf_formulare.html', '/br_vkf_formular.html',
  '/el_angaben.html', '/if_fahrzeug.html', '/if_werkzeug.html',
  '/pm_goodel.html', '/pm_schnellausschreibung.html', '/pm_crbx.html',
  '/gema_auth.js', '/gema_db.js', '/gema_feedback.js', '/gema_autosave.js',
  '/gema_objekte_api.js', '/gema_produktkatalog_api.js', '/gema_armaturen_api.js',
  '/gema_scroll.js', '/gema_pdf.js',
  '/icon-192.svg', '/icon-512.svg', '/manifest.json'
];

// Install: Cache alle App-Shell Dateien
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting();
});

// Activate: Alte Caches loeschen
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Cache-First fuer App-Shell, Network-First fuer API
self.addEventListener('fetch', function(event) {
  var url = event.request.url;
  // Supabase API → immer Netzwerk
  if (url.indexOf('supabase.co') >= 0 || url.indexOf('supabase.in') >= 0) {
    event.respondWith(
      fetch(event.request).catch(function() { return caches.match(event.request); })
    );
    return;
  }
  // Google Fonts → Network-First
  if (url.indexOf('fonts.googleapis.com') >= 0 || url.indexOf('fonts.gstatic.com') >= 0) {
    event.respondWith(
      fetch(event.request).then(function(r) {
        if (r.ok) { var c = r.clone(); caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, c); }); }
        return r;
      }).catch(function() { return caches.match(event.request); })
    );
    return;
  }
  // HTML & JS → Network-First (immer frisch laden, Cache als Fallback)
  if (url.indexOf('.html') >= 0 || url.indexOf('.js') >= 0) {
    event.respondWith(
      fetch(event.request).then(function(r) {
        if (r.ok) { var c = r.clone(); caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, c); }); }
        return r;
      }).catch(function() { return caches.match(event.request); })
    );
    return;
  }
  // CSS, Bilder, Fonts → Cache-First mit Background-Update
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      var fetchP = fetch(event.request).then(function(response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function() { return cached; });
      return cached || fetchP;
    })
  );
});

// Push-Nachrichten
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'GEMA', {
      body: data.body || '',
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
