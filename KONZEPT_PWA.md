# GEMA PWA — Progressive Web App

## Anleitung für Claude Code

**Ziel:** GEMA als installierbare App auf dem Handy verfügbar machen. Kein App Store, kein separater Code — die bestehende Website wird zur App.

---

## 1. Was umgesetzt werden muss

| Datei | Was | Aufwand |
|---|---|---|
| `manifest.json` | App-Metadaten (Name, Icons, Farben, Start-URL) | 15min |
| `sw.js` | Service Worker (Offline-Cache, Push-Vorbereitung) | 2h |
| `icon-192.png` + `icon-512.png` | App-Icons (aus bestehendem GEMA-Logo generieren) | 30min |
| `index.html` | Meta-Tags + Manifest-Link + SW-Registrierung hinzufügen | 15min |
| Alle HTML-Dateien | `<meta name="theme-color">` + Viewport-Tags prüfen | 30min |
| `gema_qr_scanner.js` | QR-Code Scanner via Browser-Kamera-API (für Werkzeugmanagement) | 3h |
| `gema_push.js` | Web Push Nachrichten (Vorbereitung, braucht Server-Endpoint) | 2h |

**Geschätzter Gesamtaufwand: ~8 Stunden**

---

## 2. manifest.json

Datei im Root-Verzeichnis (neben index.html).

```json
{
  "name": "GEMA — Gebäudetechnik-Plattform",
  "short_name": "GEMA",
  "description": "Sanitärplanung, Berechnungen und Ausschreibung für die Schweizer Gebäudetechnik.",
  "start_url": "/index.html",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "lang": "de-CH",
  "categories": ["business", "productivity"],
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

**Icon-Generierung:** Das bestehende GEMA-Logo (Hexagon mit Ketten-Icon, schwarz) auf weissem/dunklem Hintergrund als 192x192 und 512x512 PNG exportieren. `purpose: "any maskable"` sorgt dafür, dass Android das Icon korrekt rund/eckig maskiert.

---

## 3. Service Worker (sw.js)

Der Service Worker cached alle GEMA-Dateien für Offline-Zugriff und bereitet Push-Nachrichten vor.

### Caching-Strategie:
- **App-Shell** (HTML, CSS, JS, Fonts): Cache-First — sofort aus Cache laden, im Hintergrund aktualisieren
- **API-Daten** (Supabase): Network-First — versuche Netzwerk, Fallback auf Cache
- **Bilder/Icons**: Cache-First mit Ablauf (7 Tage)

### Dateien die gecached werden müssen:

```javascript
var CACHE_NAME = 'gema-v1';
var CACHE_FILES = [
  '/',
  '/index.html',
  '/Module.html',
  // Berechnungsmodule
  '/sa_enthaertung.html',
  '/sa_osmose.html',
  '/sa_fettabscheider.html',
  '/sa_frischwasserstation.html',
  '/sa_oelabscheider.html',
  '/sa_schlammsammler.html',
  '/sa_solaranlage.html',
  '/sa_abwasserhebeanlage.html',
  '/sb_lu_tabelle.html',
  '/sb_druckerhoehung.html',
  '/sb_druckverlust.html',
  '/sb_warmwasser.html',
  '/sb_niederschlag.html',
  '/sb_vonroll.html',
  '/sb_grobauslegung.html',
  '/sb_ausstosszeiten.html',
  '/sb_laengenausdehnung.html',
  '/sb_druckdispositiv.html',
  '/sb_apparateliste.html',
  '/sb_du_zusammenstellung.html',
  '/sb_index.html',
  // Projektmanagement
  '/pm_objekte.html',
  '/pm_ausschreibungsunterlagen.html',
  '/pm_terminplan.html',
  // System
  '/sys_login.html',
  '/sys_admin.html',
  '/sys_profil.html',
  '/sys_produktkatalog.html',
  '/sys_lieferanten.html',
  '/sys_lieferant_dashboard.html',
  '/sys_beta.html',
  '/sys_preise.html',
  // JS
  '/gema_auth.js',
  '/gema_db.js',
  '/gema_feedback.js',
  '/gema_autosave.js',
  '/gema_objekte_api.js',
  '/gema_lu_api.js',
  '/gema_produktkatalog_api.js',
  '/gema_wasserdaten.js',
  '/gema_scroll.js',
  '/gema_pdf.js',
  // Fonts (DM Sans via Google Fonts — wird vom Browser gecached)
  // Icons
  '/icon-192.png',
  '/icon-512.png'
];
```

### Service Worker Lifecycle:

```javascript
// Install: Cache alle App-Shell Dateien
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting(); // Sofort aktivieren
});

// Activate: Alte Caches löschen
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim(); // Sofort übernehmen
});

// Fetch: Cache-First für App-Shell, Network-First für API
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Supabase API-Calls → immer Netzwerk
  if (url.indexOf('supabase.co') >= 0) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Alles andere → Cache-First
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      var fetchPromise = fetch(event.request).then(function(response) {
        // Update Cache im Hintergrund
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() { return cached; });

      return cached || fetchPromise;
    })
  );
});

// Push-Nachrichten (Vorbereitung)
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'GEMA', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' }
    })
  );
});

// Klick auf Push-Nachricht → App öffnen
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
```

---

## 4. HTML-Änderungen

### In index.html (und idealerweise allen HTML-Dateien):

Im `<head>` diese Tags hinzufügen (VOR dem ersten `<script>`):

```html
<!-- PWA Meta -->
<meta name="theme-color" content="#0f172a"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
<meta name="apple-mobile-web-app-title" content="GEMA"/>
<link rel="manifest" href="manifest.json"/>
<link rel="apple-touch-icon" href="icon-192.png"/>
```

### Service Worker Registrierung:

Am Ende von `index.html` (vor `</body>`). **WICHTIG:** Siehe Abschnitt 11 — der SW wird nur auf der produktiven Domain aktiviert, nicht auf Netlify Previews.

```html
<script>
// Service Worker NUR auf Produktion (siehe Abschnitt 11 für Details)
if ('serviceWorker' in navigator && location.hostname === 'gema.ch') {
  navigator.serviceWorker.register('/sw.js').then(function(reg) {
    console.log('[GEMA] Service Worker registriert');
  }).catch(function(err) {
    console.warn('[GEMA] SW Registrierung fehlgeschlagen:', err);
  });
}
</script>
```

**WICHTIG:** Der Service Worker muss nur in `index.html` registriert werden — er gilt dann für alle Seiten unter dem gleichen Scope (`/`). NICHT in jede HTML-Datei einzeln einfügen.

---

## 5. QR-Code Scanner (gema_qr_scanner.js)

Für das Werkzeugmanagement: Monteur scannt QR-Code auf dem Werkzeug → GEMA zeigt Werkzeug-Details, Prüfdatum, Status.

### Technologie:
- **Browser-API:** `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`
- **QR-Decoding:** Bibliothek `jsQR` (3 KB, kein CDN nötig, kann inline eingebettet werden) oder `html5-qrcode` (CDN: `https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js`)
- **Kein nativer Zugriff nötig** — funktioniert in Chrome, Safari, Firefox auf iOS und Android

### QR-Code Format (Vorschlag für Werkzeug-Label):
```
GEMA:WZ:12345
```
Wobei `WZ:12345` die Werkzeug-ID ist. Der Scanner erkennt das Prefix `GEMA:WZ:` und öffnet direkt die Werkzeug-Detailseite.

### Integration:
- Button "📷 QR scannen" im Werkzeugmanagement-Modul
- Öffnet Kamera-Overlay (Vollbild)
- Scannt automatisch
- Bei Treffer: vibration feedback + Weiterleitung zur Werkzeug-Detailseite

---

## 6. Push-Nachrichten (gema_push.js)

### Use Cases:
- "📨 Neue Offertanfrage erhalten" (an Lieferant)
- "✉ Offerte beantwortet" (an Planer)
- "⏰ Offertfrist läuft in 3 Tagen ab" (an Lieferant)
- "📋 Terminplan: Meilenstein fällig" (an alle Beteiligten)

### Architektur:
```
GEMA Frontend
    ↓ (Web Push API)
    Push-Subscription anlegen
    ↓ (Subscription-Daten an Server)
Supabase Edge Function / Netlify Function
    ↓ (Web Push Protocol)
Push-Server (FCM / Web Push)
    ↓
Browser auf dem Handy
    ↓
Notification erscheint
```

### Was jetzt vorbereitet wird:
1. `gema_push.js` — Client-seitige Logik: Permission anfragen, Subscription erstellen, an Server senden
2. Subscription in Supabase speichern (Tabelle `push_subscriptions`)
3. Server-Endpoint (Supabase Edge Function) der Push-Nachrichten auslöst

### Was NICHT jetzt implementiert wird:
- Der Server-Endpoint kommt später — erfordert Supabase Edge Functions oder Netlify Functions
- VAPID-Keys müssen generiert werden (einmalig, per CLI)

### Client-Vorbereitung:

```javascript
// gema_push.js — Web Push Client
(function(w) {
  'use strict';

  var VAPID_PUBLIC_KEY = ''; // Wird später gesetzt

  var GemaPush = {
    // Prüfe ob Push unterstützt wird
    isSupported: function() {
      return 'serviceWorker' in navigator && 'PushManager' in window;
    },

    // Permission anfragen
    requestPermission: async function() {
      if (!this.isSupported()) return 'unsupported';
      var result = await Notification.requestPermission();
      return result; // 'granted', 'denied', 'default'
    },

    // Subscription erstellen und an Server senden
    subscribe: async function() {
      if (!VAPID_PUBLIC_KEY) { console.warn('[GemaPush] VAPID Key fehlt'); return null; }
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY
      });
      // TODO: sub an Supabase senden
      console.log('[GemaPush] Subscription:', JSON.stringify(sub));
      return sub;
    }
  };

  w.GemaPush = GemaPush;
})(window);
```

---

## 7. Offline-Verhalten

### Was offline funktioniert:
- Alle Berechnungsmodule (rein clientseitig, localStorage)
- BKP-Checkliste ansehen (aus Cache)
- Werkzeug-Liste ansehen (aus letztem Sync)
- Bereits geladene Projekte/Objekte

### Was offline NICHT funktioniert:
- Neue Daten aus Supabase laden
- Offertanfragen senden
- Lieferanten-Katalog durchsuchen (braucht aktuelle Daten)
- Push-Nachrichten empfangen

### Offline-Indikator:
Wenn `navigator.onLine === false` → kleiner Banner oben: "⚡ Offline — Änderungen werden gespeichert und beim nächsten Verbinden synchronisiert."

```javascript
window.addEventListener('online', function() {
  // Banner ausblenden, Sync auslösen
  if (typeof GemaProdukte !== 'undefined') GemaProdukte.save(); // Trigger Supabase sync
});
window.addEventListener('offline', function() {
  // Banner einblenden
});
```

---

## 8. App-Icons generieren

Das bestehende GEMA-Logo (Hexagon mit Ketten-Symbol) soll als App-Icon verwendet werden.

### Anforderungen:
- `icon-192.png` — 192×192 px, PNG, transparenter oder dunkler Hintergrund (#0f172a)
- `icon-512.png` — 512×512 px, PNG, gleich
- **Safe Zone für maskable:** Das Logo muss innerhalb der inneren 80% des Icons liegen (Android schneidet die äusseren 10% pro Seite ab für runde Icons)
- Kein Text "GEMA" im Icon nötig — der App-Name wird vom OS darunter angezeigt

### Generierung:
Das SVG-Logo existiert bereits in allen HTML-Dateien (das GEMA-Hexagon). Es kann mit einem Canvas-Script oder manuell in einem Grafikprogramm auf die richtigen Grössen exportiert werden.

---

## 9. Implementierungs-Reihenfolge

| Schritt | Was | Abhängigkeiten |
|---|---|---|
| **1** | `manifest.json` erstellen | Keine |
| **2** | Icons generieren (192 + 512) | GEMA-Logo SVG |
| **3** | Meta-Tags in `index.html` einfügen | manifest.json |
| **4** | `sw.js` erstellen (Caching) | Keine |
| **5** | SW-Registrierung in `index.html` | sw.js |
| **6** | Testen: "Zum Homescreen hinzufügen" auf Android/iOS | Schritt 1–5 |
| **7** | Offline-Banner (online/offline Events) | sw.js |
| **8** | `gema_qr_scanner.js` (Kamera + QR-Decode) | html5-qrcode CDN |
| **9** | `gema_push.js` (Client-Vorbereitung) | VAPID-Keys (später) |

**Schritt 1–6 machen GEMA sofort installierbar.** Schritt 7–9 sind Erweiterungen.

---

## 10. Was ist der Service Worker (sw.js)?

Ein Service Worker ist ein kleines JavaScript das **zwischen** der Website und dem Internet sitzt — wie ein Türsteher. Er fängt jeden Netzwerk-Request ab und entscheidet: "Habe ich das schon lokal gespeichert? Dann liefere ich es sofort aus dem Cache. Wenn nicht, hole ich es aus dem Internet, speichere es, und liefere es."

```
User öffnet GEMA
      ↓
  Service Worker (sw.js)
      ↓
  "Habe ich das schon gespeichert?"
    ↓ JA → aus Cache liefern (sofort, auch offline)
    ↓ NEIN → aus Internet holen, speichern, liefern
```

- Ohne Service Worker: Kein Internet = Seite lädt nicht.
- Mit Service Worker: Kein Internet = Seite kommt aus dem lokalen Speicher.

Das ist der einzige Grund warum eine PWA offline funktioniert und warum sie sich wie eine App anfühlt — der Service Worker cached die Dateien lokal auf dem Gerät, genau wie eine installierte App.

**Wichtig für Claude Code:** Der Service Worker (`sw.js`) wird als eigene Datei im Root-Verzeichnis erstellt (neben `index.html`). Er wird NUR in `index.html` registriert — nicht in jede HTML-Datei einfügen. Der SW gilt automatisch für alle Seiten unter dem gleichen Scope (`/`).

---

## 11. Verhalten bei Netlify Deploys (Entwicklung vs. Produktion)

### Das Problem

Der Service Worker cached alle Dateien. Wenn du mit Claude Code Änderungen machst und auf Netlify deployest, sieht der User weiterhin die **alte, gecachte Version** — bis der SW im Hintergrund das Update bemerkt. Der User ist immer **einen Besuch hinterher**.

### Lösung: SW nur auf produktiver Domain aktivieren

Die SW-Registrierung in `index.html` soll **nur auf der produktiven Domain** greifen, nicht auf Netlify Deploy Previews:

```javascript
// Service Worker NUR auf Produktion registrieren
// Auf Netlify Previews (*.netlify.app) → kein SW → immer neueste Version
if ('serviceWorker' in navigator && location.hostname === 'gema.ch') {
  navigator.serviceWorker.register('/sw.js').then(function(reg) {
    console.log('[GEMA] Service Worker registriert');

    // Update-Banner wenn neue Version verfügbar
    reg.addEventListener('updatefound', function() {
      var newSW = reg.installing;
      newSW.addEventListener('statechange', function() {
        if (newSW.state === 'activated') {
          // Banner zeigen
          var banner = document.createElement('div');
          banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1e3a5f;color:#fff;padding:12px 24px;font-size:13px;font-weight:700;z-index:9999;display:flex;align-items:center;justify-content:center;gap:12px;font-family:system-ui';
          banner.innerHTML = '🔄 Neue GEMA-Version verfügbar <button onclick="location.reload()" style="background:#fff;color:#1e3a5f;border:none;padding:6px 14px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px">Jetzt aktualisieren</button>';
          document.body.appendChild(banner);
        }
      });
    });

  }).catch(function(err) {
    console.warn('[GEMA] SW Registrierung fehlgeschlagen:', err);
  });
}
```

### Cache-Versionierung

Bei jedem produktiven Deploy muss der Cache-Name in `sw.js` hochgezählt werden:

```javascript
var CACHE_NAME = 'gema-v1'; // → 'gema-v2', 'gema-v3' etc. bei jedem Deploy
```

Der neue SW erkennt den alten Cache-Namen, löscht ihn im `activate` Event, und cached alle Dateien neu. Dies passiert automatisch im Hintergrund.

### Zusammenfassung Deploy-Verhalten

| Umgebung | SW aktiv? | Cache? | Verhalten |
|---|---|---|---|
| `deploy-preview-42--gema.netlify.app` | ✕ Nein | ✕ Nein | Immer neueste Version — ideal für Entwicklung |
| `gema.ch` (Produktion) | ✓ Ja | ✓ Ja | Cache-First + Update-Banner — ideal für User |
| `localhost` | ✕ Nein | ✕ Nein | Immer neueste Version — ideal für lokale Tests |

**Während der aktiven Entwicklung mit Claude Code:** Testen über Netlify Preview-URLs. Kein Cache-Problem. Der Service Worker greift erst wenn GEMA auf der finalen Domain live ist.

---

## 12. Testen

### Android (Chrome):
1. Öffne GEMA-URL in Chrome
2. Chrome zeigt automatisch "App installieren" Banner
3. Oder: Menü (⋮) → "App installieren"
4. GEMA-Icon erscheint auf Homescreen

### iOS (Safari):
1. Öffne GEMA-URL in Safari
2. Teilen-Button (□↑) → "Zum Home-Bildschirm"
3. GEMA-Icon erscheint auf Homescreen
4. Öffnet als Standalone-App (ohne Safari-UI)

### Desktop (Chrome/Edge):
1. Adressleiste zeigt Install-Icon (⊕)
2. Klick → GEMA öffnet als eigenständiges Fenster

---

## 13. GEMA-Konventionen (wie bei allen Modulen)

- **Dateinamen:** `sw.js`, `manifest.json`, `gema_qr_scanner.js`, `gema_push.js`
- **Keine Umlaute in Dateinamen**
- **Echte Umlaute in UI-Texten** (Ä, Ö, Ü)
- **DM Sans Font** (wird vom Service Worker gecached)
- **Kein Framework** — Vanilla JS wie der gesamte GEMA-Code
- **Service Worker wird NUR in index.html registriert** (nicht in jedem Modul)

---

## 14. Spätere Erweiterungen (nicht jetzt)

| Feature | Wann | Was nötig |
|---|---|---|
| **App Store (Capacitor)** | Wenn GEMA verkauft wird | Capacitor Wrapper, Apple Dev Account (CHF 99/a), Google Play ($25) |
| **Push-Server** | Wenn Offertanfragen live gehen | Supabase Edge Function + VAPID-Keys |
| **Background Sync** | Wenn Offline-Bearbeitung wichtig wird | Service Worker Sync API |
| **NFC-Scan** | Wenn NFC-Tags auf Werkzeugen gewünscht | Nur mit nativer App (Capacitor) |
