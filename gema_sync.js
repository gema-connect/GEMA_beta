/**
 * gema_sync.js — GEMA Cloud-First Sync v1
 *
 * Single source of truth: Supabase.
 * Pro Datensatz eine eigene Row in `gema_data`:
 *   module_key='<modul>'  data_key='<entity>:<id>'  payload={ data, _lm, _id }
 *
 * Saves gehen IMMER zuerst gegen die Cloud. Bei Erfolg wird der lokale
 * In-Memory-Cache aktualisiert. Bei Misserfolg (offline / Netz-Fehler)
 * wird der Aufrufer per Reject benachrichtigt — der Save findet NICHT
 * statt, weder lokal noch remote. localStorage wird fuer diese
 * Datenklassen NICHT mehr beschrieben.
 *
 * Der Aufrufer sieht eine Promise-API. Module die synchron auf Daten
 * zugreifen, halten ihren eigenen In-Memory-Snapshot, der nach jedem
 * erfolgreichen Save aktualisiert wird.
 */
(function(w){
  'use strict';

  var SB_URL = 'https://fjhbqjvaygvhievjgdtm.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaGJxanZheWd2aGlldmpnZHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODk5OTUsImV4cCI6MjA4ODI2NTk5NX0.n3AbrEKTWWhI2tnDaf7-Z-QI9o9pJiP1E7BsHVuZY9k';
  var SB_TABLE = 'gema_data';

  // ── Same-Origin-Proxy-Fallback (netlify.toml: /sb/* → supabase) ──────
  // Auf manchen Geraeten ist *.supabase.co blockiert (Firewall/Werbe-
  // blocker/DNS-Filter/Antivirus), waehrend die GEMA-Domain selbst laeuft
  // («Failed to fetch» trotz Internet). Die Probe erkennt das und schaltet
  // automatisch auf den Same-Origin-Weg /sb/* um (und zurueck, sobald der
  // direkte Weg wieder geht). Der Zustand ueberlebt Reloads (localStorage).
  var PROXY_FLAG = 'gema_sb_proxy_v1';
  var _sbProxy = false;
  try{
    _sbProxy = typeof localStorage !== 'undefined'
      && localStorage.getItem(PROXY_FLAG) === '1'
      && typeof location !== 'undefined' && /^https?:/.test(location.origin);
  }catch(e){}
  function _proxyBase(){ return location.origin + '/sb'; }
  function _sbBase(){ return _sbProxy ? _proxyBase() : SB_URL; }
  function _setProxy(on){
    if(_sbProxy === on) return;
    _sbProxy = on;
    try{ if(on) localStorage.setItem(PROXY_FLAG, '1'); else localStorage.removeItem(PROXY_FLAG); }catch(e){}
    try{ console.info('[GemaSync] Verbindungsweg gewechselt → ' + (on ? 'Same-Origin-Proxy /sb (supabase.co blockiert?)' : 'direkt supabase.co')); }catch(e){}
  }

  var _online = (typeof navigator !== 'undefined' && 'onLine' in navigator) ? navigator.onLine : true;
  var _lastReachable = _online; // Echte Cloud-Erreichbarkeit (nicht nur navigator.onLine)
  var _connListeners = [];
  var _failStreak = 0;          // aufeinanderfolgende echte Netz-/Server-Fehler
  function _setReachable(state){
    if(state === _lastReachable) return;
    _lastReachable = state;
    _bannerSnoozeUntil = 0;   // echter Zustandswechsel darf wieder melden
    _connListeners.forEach(function(cb){ try{ cb(state); }catch(e){} });
    _broadcastBanner(state);
    // Verbindung zurueck → die Outbox (nicht synchronisierte Saves) leeren.
    if(state) _scheduleFlush(400);
  }
  // Erfolgreiche Cloud-Antwort: Fehlerzaehler zuruecksetzen, online.
  function _noteSuccess(){ _failStreak = 0; _setReachable(true); }
  // Fehlerklassifikation (Punkt E): Ein 4xx (ausser 408/429) ist KEIN
  // Verbindungsproblem, sondern eine abgelehnte Anfrage — typisch 413
  // (Payload zu gross, bei bildlastigen Records). Das darf NICHT auf
  // "offline" schalten, sonst sieht der User faelschlich "Offline", obwohl
  // das Internet einwandfrei laeuft. Echte Netz-/Server-Fehler (fetch wirft,
  // 5xx, 408, 429) schalten erst nach ZWEI Fehlern in Folge auf offline —
  // ein einzelner Aussetzer soll das Banner nicht ausloesen.
  var _lastFailMsg = '';   // letzter echter Fehler — fuer die Banner-Diagnose
  // KRITISCH (Bugreport 28.07.2026 «Schadensbericht meldet offline, obwohl
  // die ganze Zeit Internet da war»): Ein fehlgeschlagener SCHREIBVORGANG ist
  // KEIN Beweis fuer eine fehlende Verbindung. Bildlastige Records (Schadens-/
  // Dachbericht) erzeugen mehrere MB grosse Requests — die koennen an einer
  // Groessengrenze scheitern oder in einen Timeout laufen und werfen dann
  // dieselbe Exception wie ein echter Netzausfall. Zwei davon in Folge
  // schalteten frueher direkt auf «Offline». Jetzt entscheidet eine BILLIGE
  // Gegenprobe (_probeOnce): antwortet der Server, bleibt der Zustand online
  // und der Nutzer sieht stattdessen den ehrlichen Upload-Hinweis.
  function _noteFailure(e){
    var msg = (e && e.message) || '';
    var m = /HTTP (\d+)/.exec(msg);
    if(m){
      var code = +m[1];
      if(code >= 400 && code < 500 && code !== 408 && code !== 429){
        // Abgelehnte Anfrage (413/403/400 …): kein Verbindungsproblem — aber
        // der GRUND muss fuer die Diagnose sichtbar bleiben. Frueher lief
        // dieser Pfad ohne Aufzeichnung: die Details-Box zeigte «alles
        // antwortet», obwohl jeder Upload abgelehnt wurde — genau der blinde
        // Fleck des Bugreports 28.07.2026.
        _lastFailMsg = msg;
        return;
      }
    }
    _markFail(msg);
    if(_failStreak >= 2 && !_probing) _probeOnce();   // Verifikation entscheidet
  }
  // Fehler nur buchen (ohne Gegenprobe) — von der Probe selbst benutzt,
  // damit sie sich nicht rekursiv aufruft.
  function _markFail(msg){
    _lastFailMsg = msg || 'Netzwerkfehler';
    _failStreak++;
  }
  if(typeof window !== 'undefined'){
    window.addEventListener('online',  function(){ _online = true;  _probeOnce(); });
    window.addEventListener('offline', function(){ _online = false; _setReachable(false); });
  }

  // ── GEMA Secure v1: JWT aus der Session (gema-auth Netlify Function) ──
  // Nach dem Login liegt ein Supabase-kompatibles JWT in der Session; alle
  // REST-Calls laufen damit als role=authenticated (RLS). Ohne Token wird
  // der anon-Key gesendet — vor RLS-Aktivierung voll funktionsfaehig,
  // nach Aktivierung bewusst wirkungslos.
  var AUTH_FN = '/.netlify/functions/gema-auth';
  var _authFnMissing = false;   // 404 → Function (noch) nicht deployed → Legacy-Pfad
  var _expiredShown = false;
  function _authToken(){
    try{
      var s = JSON.parse(localStorage.getItem('gema_session_v1') || 'null');
      return (s && s.token) || '';
    }catch(e){ return ''; }
  }
  // Session vorhanden, aber KEIN Token (Anmeldung aus der Zeit vor GEMA
  // Secure v1, oder Token nach einem 401 entfernt): Reads laufen dann mit
  // dem anon-Key. Unter aktivem RLS liefert das LEERE Pools mit HTTP 200 —
  // kein Fehler, kein Redirect. Solche leeren Antworten sind NICHT
  // vertrauenswuerdig (Praxisfall 17.07.: «es zeigt mir keine Daten mehr
  // an» — Werkzeug/Fahrzeug/Schadensberichte leer, nach Neuanmeldung
  // alles wieder da).
  function _tokenlessSession(){
    try{
      var s = JSON.parse(localStorage.getItem('gema_session_v1') || 'null');
      return !!(s && s.userId) && !(s && s.token);
    }catch(e){ return false; }
  }
  // Sichtbarer Hinweis statt stiller Leere: die Session hat kein gueltiges
  // Anmelde-Token mehr — Cloud-Daten koennen nicht geladen werden.
  var _reloginBanner = null;
  function _showRelogin(){
    if(_reloginBanner || typeof document === 'undefined') return;
    try{ if(/sys_login\.html/i.test((typeof location !== 'undefined' && location.pathname) || '')) return; }catch(e){}
    _reloginBanner = document.createElement('div');
    _reloginBanner.id = 'gema-sync-relogin-banner';
    Object.assign(_reloginBanner.style, {
      position:'fixed', top:'0', left:'0', right:'0', zIndex:'10001',
      background:'#b45309', color:'#fff', textAlign:'center',
      padding:'8px 14px', paddingTop:'calc(8px + env(safe-area-inset-top, 0px))',
      fontFamily:'DM Sans,system-ui,sans-serif',
      fontSize:'13px', fontWeight:'600',
      boxShadow:'0 2px 6px rgba(0,0,0,.18)'
    });
    var btnCss = 'margin-left:10px;padding:3px 10px;border:1px solid rgba(255,255,255,.6);border-radius:7px;background:transparent;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer';
    _reloginBanner.innerHTML = '<span>⚠ Deine Sitzung hat kein gueltiges Anmelde-Token mehr — Cloud-Daten koennen nicht geladen werden.</span>'
      + '<button type="button" id="gema-sync-relogin-btn" style="' + btnCss + '">Neu anmelden</button>';
    _reloginBanner.querySelector('#gema-sync-relogin-btn').onclick = function(){
      try{ location.href = 'sys_login.html?r=' + encodeURIComponent(location.href); }catch(e){}
    };
    if(document.body) document.body.appendChild(_reloginBanner);
    else document.addEventListener('DOMContentLoaded', function(){ if(_reloginBanner && !_reloginBanner.parentNode) document.body.appendChild(_reloginBanner); });
  }
  // «Automatisch ausloggen, wenn kein gueltiges Token mehr» (User-Wunsch
  // 17.07.): Eine Session mit userId aber OHNE Token ist unter GEMA Secure
  // ungueltig — statt stiller leerer Pools wird der Nutzer ausgeloggt und
  // zum Login geleitet (wie beim 401 einer abgelaufenen Session).
  // Loop-Bremse (KRITISCH): erzeugt die Anmeldung selbst wieder eine
  // token-lose Session (Legacy-Kompatibilitaetsmodus ohne gema-auth-
  // Function), wuerde der Auto-Logout endlos kreisen — deshalb (a) vorab
  // ein diag-Check: nur ausloggen, wenn die Function deployed ist
  // (Status != 404), und (b) hoechstens 1 Auto-Logout pro 10 Minuten,
  // danach nur noch der sichtbare Banner.
  var RELOGIN_TS_KEY = 'gema_sync_relogin_ts_v1';
  function _autoLogout(){
    try{
      var last = parseInt(localStorage.getItem(RELOGIN_TS_KEY) || '0', 10);
      if(Date.now() - last < 10 * 60 * 1000) return false;
      localStorage.setItem(RELOGIN_TS_KEY, String(Date.now()));
    }catch(e){}
    try{ localStorage.removeItem('gema_session_v1'); }catch(e){}
    try{ alert('Deine Sitzung ist abgelaufen — bitte neu anmelden.'); }catch(e){}
    try{ location.href = 'sys_login.html?r=' + encodeURIComponent(location.href); }catch(e){}
    return true;
  }
  function _tokenlessBootCheck(){
    if(!_tokenlessSession()) return;
    try{ if(/sys_login\.html/i.test((typeof location !== 'undefined' && location.pathname) || '')) return; }catch(e){}
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var t = ctl ? setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, 6000) : null;
    fetch(AUTH_FN + '?action=diag', { signal: ctl ? ctl.signal : undefined })
      .then(function(r){
        if(t) clearTimeout(t);
        if(r.status === 404){ _authFnMissing = true; return; }  // Legacy — kein Logout
        if(!_autoLogout()) _showRelogin();                      // Bremse aktiv → Hinweis
      })
      .catch(function(){ if(t) clearTimeout(t); });             // offline/unklar — kein Logout
  }
  if(typeof document !== 'undefined' && typeof fetch !== 'undefined'){
    setTimeout(_tokenlessBootCheck, 1200);
  }
  function _handle401(){
    if(_expiredShown || !_authToken()) return;
    _expiredShown = true;
    try{
      var s = JSON.parse(localStorage.getItem('gema_session_v1') || 'null') || {};
      delete s.token;
      localStorage.setItem('gema_session_v1', JSON.stringify(s));
    }catch(e){}
    try{ alert('Deine Sitzung ist abgelaufen — bitte neu anmelden.'); }catch(e){}
    try{ location.href = 'sys_login.html?r=' + encodeURIComponent(location.href); }catch(e){}
  }
  function _isAuthKey(k){ return /^(user:|org:|role:)/.test(String(k || '')); }
  // Auth-Collection-Writes laufen ueber die gema-auth-Function (Service-Key,
  // serverseitige Berechtigungspruefung) — RLS blockt sie direkt an der DB.
  function _persistAuthViaFn(records, deletes){
    return fetch(AUTH_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _authToken() },
      body: JSON.stringify({ action: 'persist_auth', records: records || [], deletes: deletes || [] })
    }).then(function(r){
      if(r.status === 404){ _authFnMissing = true; var e = new Error('gema-auth Function nicht deployed'); e.fnMissing = true; throw e; }
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok || !j.ok){
          var e = new Error((j && j.error) || ('HTTP ' + r.status));
          e.denied = (r.status === 401 || r.status === 403);
          throw e;
        }
        _noteSuccess();
        return j;
      });
    });
  }
  function _routeAuthWrite(records, deletes, directFallback){
    if(_authFnMissing || !_authToken()) return directFallback();
    return _persistAuthViaFn(records, deletes).catch(function(e){
      if(e && e.fnMissing) return directFallback();
      throw e;
    });
  }

  function _hdrs(extra){
    var tok = _authToken();
    var h = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + (tok || SB_KEY),
      'Content-Type': 'application/json'
    };
    if(extra) for(var k in extra) h[k] = extra[k];
    return h;
  }

  function _now(){ return new Date().toISOString(); }

  // Sichtbares Banner wenn die Verbindung weg ist (eine Zeile oben).
  // Nur beim ersten Verbindungsverlust gerendert; verschwindet bei Online.
  // Mit «Erneut pruefen» + «Details»-Selbsttest (Supabase vs. Netlify-
  // Function getrennt): zeigt, ob die Cloud-Datenbank von DIESEM Geraet
  // blockiert ist (Firewall/Werbeblocker/DNS), obwohl das Internet laeuft —
  // haeufigster Fall des «Offline trotz Internet»-Reports. Solange das
  // Banner steht, probt ein Timer alle 20s automatisch (selbstheilend).
  var _banner = null, _reprobeTimer = null;
  function _startReprobe(){
    if(_reprobeTimer || typeof setInterval === 'undefined') return;
    _reprobeTimer = setInterval(function(){ if(!_lastReachable) _probeOnce(); }, 20000);
  }
  function _stopReprobe(){ if(_reprobeTimer){ clearInterval(_reprobeTimer); _reprobeTimer = null; } }
  function _selfTest(){
    var out = { supabase:'', fn:'' };
    var p1 = fetch(SB_URL + '/rest/v1/' + SB_TABLE + '?select=module_key&limit=1', { headers: _hdrs() })
      .then(function(r){ out.supabase = 'antwortet (HTTP ' + r.status + ')'; out.sbOk = true; })
      .catch(function(e){ out.supabase = 'NICHT erreichbar — ' + ((e && e.message) || e); out.sbOk = false; });
    var p2 = fetch(AUTH_FN + '?action=diag')
      .then(function(r){ out.fn = 'antwortet (HTTP ' + r.status + ')'; out.fnOk = true; })
      .catch(function(e){ out.fn = 'NICHT erreichbar — ' + ((e && e.message) || e); out.fnOk = false; });
    return Promise.all([p1, p2]).then(function(){ return out; });
  }
  // Banner-Text: sagt WAS mit den Daten passiert. Sie sind lokal dauerhaft
  // gesichert (Outbox) und gehen automatisch in die Cloud, sobald wieder
  // Verbindung besteht — der frueher hier stehende Satz «Aenderungen werden
  // nicht gespeichert» war falsch und hat unnoetig Angst gemacht.
  function _bannerText(){
    var n = _outboxCount();
    var warten = n ? (' (' + n + ' ' + (n === 1 ? 'Aenderung' : 'Aenderungen') + ')') : '';
    // Verbindung steht, aber ein Upload kommt nicht durch (z.B. sehr grosser
    // bildlastiger Datensatz): dann NICHT «Offline» behaupten — das war der
    // Bugreport 28.07.2026 aus dem Schadensbericht.
    if(_lastReachable){
      return '⏳ Noch nicht hochgeladen' + warten + ' — lokal gesichert, GEMA versucht es automatisch weiter.'
        + ' Die Verbindung ist in Ordnung; bei sehr grossen Datensaetzen (viele Fotos) kann es mehrere Anlaeufe brauchen.';
    }
    return '⚠ Cloud nicht erreichbar — Ihre Aenderungen werden lokal gespeichert'
      + (n ? ' (' + n + ' ' + (n === 1 ? 'Aenderung wartet' : 'Aenderungen warten') + ')' : '')
      + ' und automatisch hochgeladen, sobald die Verbindung wieder da ist.';
  }
  function _bannerRefresh(){
    if(!_banner) return;
    var el = _banner.querySelector('#gema-sync-msg');
    if(el) el.textContent = _bannerText();
    _banner.style.background = _lastReachable ? '#0f766e' : '#b45309';
  }
  // ── Ruhe-Regeln (Nachtrag Bugreport 28.07.2026 «das nervt») ──
  // Der Upload-Rueckstand-Hinweis soll NIE bei einem kurzen Aussetzer
  // aufblitzen: die schnellen automatischen Wiederholungen (2 s / 15 s)
  // raeumen einen Huepfer lautlos weg. Sichtbar wird der Hinweis erst, wenn
  // (a) mindestens ein Nachsende-Versuch WIRKLICH gescheitert ist UND
  // (b) der aelteste wartende Eintrag laenger als BANNER_GRACE_MS liegt.
  // Dazu ist jeder Banner per ✕ stummschaltbar (Snooze; ein echter
  // Zustandswechsel online⇄offline hebt den Snooze wieder auf).
  var BANNER_GRACE_MS = 30000;          // via GemaSync.bannerGraceMs testbar
  var _flushFailed = false;             // in dieser Sitzung ist ein Flush gescheitert
  var _bannerSnoozeUntil = 0;
  var _bannerRecheckTimer = null;
  function _bannerRecheck(delay){
    if(typeof setTimeout === 'undefined') return;
    // Bewusst NEU planen (nicht abwehren): ein frueher gesetzter, laengerer
    // Timer wuerde sonst die kuerzere Rest-Frist ueberdecken. Die Anzeige
    // haengt nicht am Timer — jeder _broadcastBanner-Aufruf prueft die
    // Bedingung selbst, der Timer ist nur das Sicherheitsnetz fuer Ruhe.
    if(_bannerRecheckTimer) clearTimeout(_bannerRecheckTimer);
    _bannerRecheckTimer = setTimeout(function(){
      _bannerRecheckTimer = null;
      _broadcastBanner(_lastReachable);
    }, delay || 4000);
  }
  function _outboxOldestMs(){
    var ob = _outboxLoad(), oldest = 0;
    Object.keys(ob).forEach(function(k){
      var t = Date.parse(ob[k].lm || '') || 0;
      if(t && (!oldest || t < oldest)) oldest = t;
    });
    return oldest;
  }
  function _bannerRemove(){ if(_banner){ try{ _banner.remove(); }catch(e){} _banner = null; } }
  // Banner zeigen/verstecken. `reachable` = Cloud erreichbar. Bei erreichbarer
  // Cloud bleibt der Hinweis nur stehen, solange noch etwas in der Outbox
  // liegt (ehrlicher Upload-Rueckstand statt falscher Offline-Meldung).
  function _broadcastBanner(reachable){
    if(typeof document === 'undefined') return;
    if(reachable){
      _stopReprobe();
      if(!_outboxCount()){ _flushFailed = false; _bannerRemove(); return; }
      // Rueckstand vorhanden — aber erst melden, wenn er WIRKLICH haengt.
      if(!_flushFailed){ _bannerRemove(); _bannerRecheck(); return; }
      var oldest = _outboxOldestMs();
      var age = oldest ? (Date.now() - oldest) : 0;
      if(age < BANNER_GRACE_MS){
        _bannerRemove();
        _bannerRecheck(Math.max(500, BANNER_GRACE_MS - age + 500));
        return;
      }
    } else {
      _startReprobe();
    }
    if(Date.now() < _bannerSnoozeUntil){ _bannerRemove(); return; }
    if(_banner){ _bannerRefresh(); return; }
    _banner = document.createElement('div');
    _banner.id = 'gema-sync-offline-banner';
    Object.assign(_banner.style, {
      position:'fixed', top:'0', left:'0', right:'0', zIndex:'10000',
      background:'#b45309', color:'#fff', textAlign:'center',
      padding:'8px 14px', paddingTop:'calc(8px + env(safe-area-inset-top, 0px))',
      fontFamily:'DM Sans,system-ui,sans-serif',
      fontSize:'13px', fontWeight:'600',
      boxShadow:'0 2px 6px rgba(0,0,0,.18)'
    });
    var btnCss = 'margin-left:10px;padding:3px 10px;border:1px solid rgba(255,255,255,.6);border-radius:7px;background:transparent;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer';
    _banner.innerHTML = '<span id="gema-sync-msg">' + _bannerText() + '</span>'
      + '<button type="button" id="gema-sync-retry" style="' + btnCss + '">↻ Erneut pruefen</button>'
      + '<button type="button" id="gema-sync-diag" style="' + btnCss + '">Details</button>'
      + '<button type="button" id="gema-sync-hide" title="Hinweis 10 Minuten ausblenden — Daten bleiben lokal gesichert und werden weiter automatisch hochgeladen" style="' + btnCss + ';border:none;font-size:14px;padding:3px 8px">✕</button>'
      + '<div id="gema-sync-diag-out" style="display:none;margin-top:6px;font-weight:400;font-size:12px;text-align:left;max-width:640px;margin-left:auto;margin-right:auto;background:rgba(0,0,0,.18);border-radius:8px;padding:8px 10px"></div>';
    _banner.querySelector('#gema-sync-retry').onclick = function(){
      var b = this; b.textContent = '…';
      _probeOnce().then(function(ok){ if(!ok && b) b.textContent = '↻ Erneut pruefen'; });
    };
    _banner.querySelector('#gema-sync-hide').onclick = function(){
      _bannerSnoozeUntil = Date.now() + 10 * 60 * 1000;
      _bannerRemove();
    };
    _banner.querySelector('#gema-sync-diag').onclick = function(){
      var box = _banner && _banner.querySelector('#gema-sync-diag-out');
      if(!box) return;
      box.style.display = ''; box.textContent = 'Pruefe Verbindung …';
      _selfTest().then(function(t){
        if(!box || !_banner) return;
        var esc = function(s){ return String(s == null ? '' : s).replace(/[<>&]/g, ''); };
        var pend = _pendingInfo();
        var hatFehler = pend.some(function(p){ return p.err; });
        var hint;
        if(!t.sbOk && t.fnOk) hint = '→ Internet funktioniert, aber die Cloud-Datenbank (supabase.co) ist von diesem Geraet aus blockiert. GEMA weicht automatisch auf den GEMA-Server-Proxy aus («Erneut pruefen» klicken); dauerhaft besser: Firewall, Werbeblocker (AdGuard/uBlock), Antivirus oder DNS-Filter pruefen.';
        else if(!t.sbOk && !t.fnOk) hint = '→ Keine Verbindung zum Server — Internet/WLAN/VPN pruefen.';
        else if(pend.length && hatFehler) hint = '→ Die Verbindung ist in Ordnung — der Upload selbst wird abgelehnt (Gruende unten pro Eintrag). «⬆ Jetzt hochladen» versucht es sofort erneut.';
        else if(pend.length) hint = '→ Verbindung in Ordnung — «⬆ Jetzt hochladen» klicken.';
        else hint = '→ Verbindung scheint wieder da — «Erneut pruefen» klicken.';
        var pendHtml = '';
        if(pend.length){
          pendHtml = '<div style="margin-top:6px;font-weight:700">Wartende Uploads (' + pend.length + '):</div>'
            + pend.slice(0, 6).map(function(p){
                var grund = '';
                if(/413|payload|too large|exceed/i.test(p.err)) grund = ' → Datensatz zu gross; GEMA lagert die Fotos automatisch aus und sendet erneut';
                else if(/403/.test(p.err)) grund = ' → Zugriff abgelehnt — bitte einmal ab- und wieder anmelden; besteht das weiter, den Administrator informieren';
                return '<div>• ' + esc(p.module) + ' / ' + esc(p.key) + ' — ' + p.kb + ' KB — '
                  + p.tries + ' Versuche' + (p.err ? ' — ' + esc(p.err) : '') + esc(grund) + '</div>';
              }).join('')
            + (pend.length > 6 ? '<div>… und ' + (pend.length - 6) + ' weitere</div>' : '')
            + '<button type="button" id="gema-sync-upnow" style="margin-top:6px;padding:3px 10px;border:1px solid rgba(255,255,255,.6);border-radius:7px;background:transparent;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer">⬆ Jetzt hochladen</button>';
        }
        box.innerHTML = '<div>Cloud-Datenbank (Supabase, direkt): ' + t.supabase + '</div>'
          + '<div>GEMA-Server (Netlify): ' + t.fn + '</div>'
          + '<div>Aktiver Verbindungsweg: ' + (_sbProxy ? 'GEMA-Server-Proxy (/sb)' : 'direkt (supabase.co)') + '</div>'
          + (_lastFailMsg ? '<div>Letzter Fehler: ' + esc(_lastFailMsg) + '</div>' : '')
          + '<div style="margin-top:4px;font-weight:600">' + hint + '</div>'
          + pendHtml;
        var up = box.querySelector('#gema-sync-upnow');
        if(up) up.onclick = function(){
          up.textContent = '…laedt hoch';
          _outboxFlush().then(function(){
            var rest = _outboxCount();
            if(up) up.textContent = rest ? ('⬆ Jetzt hochladen (' + rest + ' verbleiben)') : '✓ alles oben';
          });
        };
      });
    };
    if(document.body) document.body.appendChild(_banner);
    else document.addEventListener('DOMContentLoaded', function(){ if(_banner && !_banner.parentNode) document.body.appendChild(_banner); });
  }

  // Einmaliger Reachability-Check via leichter HEAD-Anfrage.
  // KRITISCH — gleiche Fehlerklassifikation wie _noteFailure: JEDE
  // HTTP-Antwort heisst "Server erreichbar". Ein 401 (abgelaufenes/
  // ungueltiges Session-Token — typisch auf einem lange unbenutzten
  // Zweit-PC) ist KEIN Verbindungsproblem; frueher schaltete die Probe
  // hier sofort auf "Offline", obwohl das Internet einwandfrei lief
  // (Ausloeser z.B. das window-'online'-Event nach WLAN-Reconnect).
  // 401 loest stattdessen die Session-abgelaufen-Behandlung aus.
  var _probing = false;
  // Probe-Fetch mit hartem 6s-Timeout — haengende Verbindungen (Proxy/AV)
  // sollen den Weg-Wechsel nicht beliebig verzoegern.
  function _probeFetch(url){
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    // 12s statt 6s: laeuft parallel ein grosser Upload (Fotos), ist die
    // Leitung ausgelastet — eine zu knapp abgebrochene Probe wuerde faelsch
    // «unerreichbar» melden.
    var t = ctl ? setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, 12000) : null;
    return fetch(url, { headers: _hdrs(), method: 'GET', signal: ctl ? ctl.signal : undefined })
      .finally(function(){ if(t) clearTimeout(t); });
  }
  // Antwortet der ALTERNATIVE Weg brauchbar? PostgREST-typische Antworten
  // zaehlen (2xx/400/401/403/406); 404 heisst «Proxy-Route nicht deployed»,
  // 5xx «Server krank» — beides KEIN gueltiger Ausweichweg.
  function _altUsable(r){
    return r.ok || r.status === 400 || r.status === 401 || r.status === 403 || r.status === 406;
  }
  function _probeOnce(){
    if(_probing) return Promise.resolve(_lastReachable);
    _probing = true;
    var qs = '/rest/v1/' + SB_TABLE + '?select=module_key&limit=1';
    return _probeFetch(_sbBase() + qs).then(function(r){
      if(r.status === 401) _handle401();
      if(r.ok || (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429)){
        _noteSuccess();          // Server hat geantwortet → erreichbar
        return true;
      }
      _markFail('HTTP ' + r.status);               // 5xx/408/429 → Streak-Regel
      if(_failStreak >= 2) _setReachable(false);
      return false;
    }).catch(function(){
      // Aktueller Weg wirft (wirklich unerreichbar) → anderen Weg testen:
      // direkt blockiert? → Same-Origin-Proxy /sb. Proxy kaputt? → direkt.
      var toProxy = !_sbProxy;
      var httpOrigin = (typeof location !== 'undefined') && /^https?:/.test(location.origin || '');
      if(toProxy && !httpOrigin){ _setReachable(false); return false; }
      var alt = (toProxy ? _proxyBase() : SB_URL) + qs;
      return _probeFetch(alt).then(function(r){
        if(!_altUsable(r)){ _setReachable(false); return false; }
        _setProxy(toProxy);
        if(r.status === 401) _handle401();
        _noteSuccess();
        return true;
      }).catch(function(){
        _setReachable(false);    // beide Wege tot → Cloud wirklich unerreichbar
        return false;
      });
    }).finally(function(){ _probing = false; });
  }

  /**
   * Lädt alle Records eines Moduls mit gegebenem data_key-Prefix.
   * Liefert Array<{key, data, lm}>. Reject bei Netz-Fehler.
   *
   * PAGINIERT (KRITISCH): PostgREST/Supabase deckelt jede Antwort auf
   * db-max-rows (Hosted-Default 1000). Ohne Pagination wurde eine
   * Collection ab dem 1001. Record STILL abgeschnitten — und weil
   * bindCollection den lokalen Cache mit dem (unvollstaendigen) Cloud-
   * Stand ueberschreibt, «verschwanden» Datensaetze scheinbar. Darum:
   * deterministische Reihenfolge (order=data_key.asc) + limit/offset-
   * Schleife, bis eine Seite nicht mehr voll ist. Sicherheits-Deckel
   * LOAD_MAX_PAGES gegen Endlosschleifen (mit console.warn — nie still).
   *
   * opts (optional, alle Bestands-Aufrufer unveraendert):
   *   - filter:  zusaetzliches PostgREST-Query-Fragment (bereits encodiert),
   *              z.B. 'or=(payload->data->>empfaengerUserId.eq.u1,...)' —
   *              genutzt vom Notify-Empfaenger-Filter.
   *   - maxRows: weiches Limit — Schleife stoppt, sobald so viele Rows
   *              geladen sind (z.B. Retention-Scans).
   */
  var LOAD_PAGE = 1000;      // = PostgREST db-max-rows Default (mehr kommt eh nie)
  var LOAD_MAX_PAGES = 30;   // Deckel: 30'000 Rows pro Collection-Pull
  // In-Flight-Dedupe: identische PARALLELE Pulls (gleiches Modul/Prefix/
  // Filter) teilen sich EINE Netzwerk-Anfrage. Beim Seitenstart fragen sonst
  // mehrere Schichten (bindCollection, Modul-Direktaufrufe, Prefetch)
  // dieselbe Collection gleichzeitig ab — jede Anfrage kostet einen vollen
  // Roundtrip. Jeder Aufrufer bekommt eine EIGENE flache Array-Kopie
  // (niemand haengt dem anderen Ergebnis-Mutationen an); ein Reject raeumt
  // den Eintrag ab, damit ein Retry eine frische Anfrage startet.
  var _loadInflight = {};
  function loadCollection(moduleKey, prefix, opts){
    opts = opts || {};
    var ik = moduleKey + '|' + prefix + '|' + (opts.filter || '') + '|' + (opts.maxRows || 0);
    var run = _loadInflight[ik];
    if(!run){
      run = _loadCollectionPages(moduleKey, prefix, opts);
      _loadInflight[ik] = run;
      var clear = function(){ if(_loadInflight[ik] === run) delete _loadInflight[ik]; };
      run.then(clear, clear);
    }
    return run.then(function(rows){ return rows.slice(); });
  }
  function _loadCollectionPages(moduleKey, prefix, opts){
    opts = opts || {};
    var base = _sbBase() + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=like.' + encodeURIComponent(prefix) + '*'
      + (opts.filter ? '&' + opts.filter : '')
      + '&select=data_key,payload'
      + '&order=data_key.asc';
    var maxRows = (typeof opts.maxRows === 'number' && opts.maxRows > 0) ? opts.maxRows : 0;
    var out = [];
    function _page(offset, pageNr){
      var url = base + '&limit=' + LOAD_PAGE + (offset ? ('&offset=' + offset) : '');
      return fetch(url, { headers: _hdrs() })
        .then(function(r){
          if(r.status === 401) _handle401();   // abgelaufene Session → Login (wie Writes)
          if(!r.ok) throw new Error('HTTP ' + r.status);
          _noteSuccess();
          return r.json();
        })
        .then(function(rows){
          if(!Array.isArray(rows)) rows = [];
          for(var i = 0; i < rows.length; i++){
            var p = rows[i].payload || {};
            out.push({ key: rows[i].data_key, data: p.data, lm: p._lm || null });
          }
          var vollePage = rows.length >= LOAD_PAGE;
          if(vollePage && maxRows && out.length >= maxRows) return out;
          if(vollePage && pageNr + 1 >= LOAD_MAX_PAGES){
            try{ console.warn('[GemaSync] loadCollection: Seiten-Deckel erreicht (' + moduleKey + '/' + prefix + ', ' + out.length + ' Rows) — Ergebnis evtl. unvollstaendig'); }catch(e){}
            return out;
          }
          if(vollePage) return _page(offset + LOAD_PAGE, pageNr + 1);
          return out;
        });
    }
    return _page(0, 0).catch(function(e){
      _noteFailure(e);
      throw e;
    });
  }

  // ── Delta-Sync: nur GEAENDERTE Rows laden statt der ganzen Collection ──
  // Jede Row traegt payload._lm (ISO-Zeitstempel, von _postRecords gesetzt).
  // ISO-Strings vergleichen lexikografisch == chronologisch, also kann
  // PostgREST serverseitig filtern: payload->>_lm=gt.<letzter Stand>.
  // Beim zweiten Besuch einer Seite kommen so statt 450 Records nur die
  // paar geaenderten uebers Netz — die Ladezeit waechst damit NICHT mehr
  // linear mit dem Datenbestand.
  //
  // Absicherung (Delta kann Loeschungen nicht sehen — die Row ist weg):
  //   1. Parallel laeuft eine billige Zaehl-Abfrage (Prefer: count=exact,
  //      limit=1 → Content-Range-Header). Stimmt die Server-Zahl nicht mit
  //      dem gemergten Stand ueberein (Loeschung, _lm-lose SQL-Seeds,
  //      Uhren-Drift jenseits der Kulanz), laeuft sofort ein Full-Resync.
  //   2. Waehrend fuer die Collection OUTBOX-Eintraege warten, ist die
  //      Zaehl-Kontrolle NICHT aussagekraeftig (lokale Records fehlen
  //      serverseitig) → Kontrolle aussetzen, sonst wuerde jeder Boot
  //      einen sinnlosen Full-Resync ausloesen.
  //   3. Uhren-Kulanz DELTA_SKEW_MS: das Delta fragt ab (letzter _lm −
  //      10 min) — doppelt gelieferte Rows sind idempotent (Merge per id).
  //   4. Spätestens alle FULL_RESYNC_MS (24 h) ein erzwungener Full-Pull —
  //      selbst ein uebersehener Randfall heilt sich damit von selbst.
  //   5. Kleine Collections (< DELTA_MIN_ROWS) bleiben beim Full-Pull:
  //      dort spart das Delta nichts, kostet aber die Zaehl-Abfrage.
  // Rows OHNE _lm (per SQL geseedet) sind fuer das Delta unsichtbar —
  // Aenderungen daran holt die Zaehl-Kontrolle bzw. der 24-h-Resync.
  var META_KEY = 'gema_sync_meta_v1';
  var DELTA_MIN_ROWS = 40;
  var DELTA_SKEW_MS = 10 * 60 * 1000;
  var FULL_RESYNC_MS = 24 * 60 * 60 * 1000;
  var _metaMem = null;
  function _metaLoad(){
    if(_metaMem) return _metaMem;
    _metaMem = {};
    try{
      if(typeof localStorage !== 'undefined'){
        var raw = localStorage.getItem(META_KEY);
        if(raw){ var o = JSON.parse(raw); if(o && typeof o === 'object' && !Array.isArray(o)) _metaMem = o; }
      }
    }catch(e){ _metaMem = {}; }
    return _metaMem;
  }
  function _metaGet(storageKey){ return _metaLoad()[storageKey] || null; }
  function _metaSet(storageKey, meta){
    var all = _metaLoad();
    all[storageKey] = meta;
    try{ if(typeof localStorage !== 'undefined') localStorage.setItem(META_KEY, JSON.stringify(all)); }
    catch(e){ /* Memory-Spiegel _metaMem haelt den Stand fuer diese Sitzung */ }
  }
  function _isoMinus(iso, ms){
    var t = Date.parse(iso);
    if(!isFinite(t)) return iso;
    try{ return new Date(t - ms).toISOString(); }catch(e){ return iso; }
  }
  // Server-Row-Zahl einer Collection, OHNE die Rows zu laden: limit=1 +
  // Prefer: count=exact → Content-Range "0-0/450" bzw. "*/0". Fehlender/
  // unlesbarer Header → null (NIE als 0 deuten — null heisst "unbekannt",
  // der Aufrufer laesst die Kontrolle dann aus).
  function _countCollection(moduleKey, prefix){
    var url = _sbBase() + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=like.' + encodeURIComponent(prefix) + '*'
      + '&select=data_key&limit=1';
    return fetch(url, { headers: _hdrs({ 'Prefer': 'count=exact' }) })
      .then(function(r){
        if(r.status === 401) _handle401();
        if(!r.ok) throw new Error('HTTP ' + r.status);
        _noteSuccess();
        var cr = r.headers.get('content-range') || '';
        var m = /\/(\d+)\s*$/.exec(cr);
        return m ? parseInt(m[1], 10) : null;
      });
  }
  // Voller Pull + Sync-Meta neu setzen. ghost = Rows ohne verwertbares
  // data/idField (z.B. Roh-Seeds) — sie stehen nie im Cache, zaehlen aber
  // in der Server-Zahl; die Delta-Kontrolle rechnet sie wieder dazu.
  function _fullPull(moduleKey, storageKey, prefix, idField){
    return loadCollection(moduleKey, prefix).then(function(rows){
      rows = rows || [];
      var maxLm = '', valid = 0;
      for(var i = 0; i < rows.length; i++){
        var r = rows[i];
        if(r.lm && r.lm > maxLm) maxLm = r.lm;
        if(r.data && r.data[idField] != null) valid++;
      }
      _metaSet(storageKey, {
        lm: maxLm || null, n: rows.length, ghost: rows.length - valid,
        full: Date.now(), chk: Date.now()
      });
      return { rows: rows, arr: null, delta: false };
    });
  }
  function _syncRun(moduleKey, storageKey, prefix, idField){
    var meta = _metaGet(storageKey);
    var cached = _readCache(storageKey);
    var now = Date.now();
    var canDelta = !!(meta && meta.lm && meta.full
      && (now - meta.full) < FULL_RESYNC_MS
      && cached.length >= DELTA_MIN_ROWS
      && _authToken() && !_tokenlessSession());
    if(!canDelta) return _fullPull(moduleKey, storageKey, prefix, idField);
    var filter = 'payload->>_lm=gt.' + encodeURIComponent(_isoMinus(meta.lm, DELTA_SKEW_MS));
    var deltaP = loadCollection(moduleKey, prefix, { filter: filter });
    var countP = _outboxHasFor(moduleKey, prefix)
      ? Promise.resolve(null)
      : _countCollection(moduleKey, prefix).catch(function(){ return null; });
    return Promise.all([deltaP, countP]).then(function(res){
      var rows = res[0] || [], serverN = res[1];
      // Merge per id UEBER den Cache — Reihenfolge des Caches bleibt
      // erhalten, neue Records werden hinten angehaengt (Module sortieren
      // ohnehin selbst).
      var byId = {}, order = [];
      for(var i = 0; i < cached.length; i++){
        var it = cached[i];
        if(it && it[idField] != null){
          var k = String(it[idField]);
          if(!(k in byId)) order.push(k);
          byId[k] = it;
        }
      }
      var maxLm = meta.lm, invalid = 0;
      for(var n = 0; n < rows.length; n++){
        var d = rows[n].data;
        if(!d || d[idField] == null){ invalid++; continue; }
        var kk = String(d[idField]);
        if(!(kk in byId)) order.push(kk);
        byId[kk] = d;
        if(rows[n].lm && rows[n].lm > maxLm) maxLm = rows[n].lm;
      }
      // Delta-Row ohne verwertbare Daten → ghost-Buchhaltung waere ab jetzt
      // unsicher (neu oder aktualisiert? nicht unterscheidbar) → Full-Pull.
      if(invalid > 0) return _fullPull(moduleKey, storageKey, prefix, idField);
      var merged = order.map(function(k2){ return byId[k2]; });
      var ghost = meta.ghost || 0;
      if(serverN != null && serverN !== merged.length + ghost){
        // Loeschung / _lm-lose Aenderung / Drift → einmal voll neu laden.
        return _fullPull(moduleKey, storageKey, prefix, idField);
      }
      _metaSet(storageKey, {
        lm: maxLm, n: (serverN != null ? serverN : meta.n), ghost: ghost,
        full: meta.full, chk: now
      });
      return { rows: null, arr: merged, delta: true, changed: rows.length };
    });
  }
  // Pro storageKey laeuft immer nur EIN Sync — ein echter Bind und ein
  // gleichzeitiger Hintergrund-Prefetch teilen sich dasselbe Ergebnis.
  var _syncInflight = {};
  function _syncCollection(moduleKey, storageKey, prefix, idField){
    var run = _syncInflight[storageKey];
    if(run) return run;
    run = _syncRun(moduleKey, storageKey, prefix, idField);
    _syncInflight[storageKey] = run;
    var clear = function(){ if(_syncInflight[storageKey] === run) delete _syncInflight[storageKey]; };
    run.then(clear, clear);
    return run;
  }

  /**
   * Lädt eine einzelne Record-Row (key inklusive Prefix).
   */
  function loadRecord(moduleKey, dataKey){
    var url = _sbBase() + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=eq.' + encodeURIComponent(dataKey)
      + '&select=payload';
    return fetch(url, { headers: _hdrs() })
      .then(function(r){
        if(r.status === 401) _handle401();   // abgelaufene Session → Login (wie Writes)
        if(!r.ok) throw new Error('HTTP ' + r.status);
        _noteSuccess();
        return r.json();
      })
      .then(function(rows){
        if(!Array.isArray(rows) || !rows.length) return null;
        var p = rows[0].payload || {};
        return { key: dataKey, data: p.data, lm: p._lm || null };
      })
      .catch(function(e){
        _noteFailure(e);
        throw e;
      });
  }

  /**
   * Schreibt einen einzelnen Record. Reject bei Netz-Fehler / non-2xx.
   * Setzt automatisch _lm = jetzt.
   */
  // Low-Level: schreibt ein fertiges Body-Array (jeder Eintrag traegt sein
  // eigenes payload inkl. _lm). Wird von saveRecord/saveRecords UND vom
  // Outbox-Flush genutzt. Zentrale Stelle fuer Reachability-Buchhaltung.
  function _postRecords(body, opts){
    return fetch(_sbBase() + '/rest/v1/' + SB_TABLE + '?on_conflict=module_key%2Cdata_key', {
      method: 'POST',
      headers: _hdrs({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(body),
      keepalive: !!(opts && opts.keepalive)
    }).then(function(r){
      if(r.status === 401) _handle401();
      if(!r.ok){
        // Antwort-Text mitnehmen (PostgREST erklaert den Grund als JSON) —
        // ohne ihn ist ein abgelehnter Upload in der Diagnose unsichtbar.
        return r.text().then(function(t){
          throw new Error('HTTP ' + r.status + (t ? ' — ' + String(t).slice(0, 220) : ''));
        }, function(){ throw new Error('HTTP ' + r.status); });
      }
      _noteSuccess();
      return true;
    }).catch(function(e){
      _noteFailure(e);
      throw e;
    });
  }

  // KRITISCH — verlustfreies Speichern fuer JEDEN Schreibweg:
  // Scheitert der Cloud-Push (offline, Timeout, 413, 5xx), landet die
  // Operation in der Outbox und wird automatisch nachgesendet. Ohne das
  // ginge ein Datensatz verloren, sobald bindCollection beim naechsten
  // Seitenstart den Cloud-Stand in den lokalen Cache schreibt — der lokal
  // gespeicherte, nie hochgeladene Record waere dann weg. Betrifft ALLE
  // per-Record-Pools (ERP, Regierapport, Termine, Stunden, Immobilien,
  // Planablage, Pruefliste, …), die ueber saveRecord/deleteRecord gehen.
  //   opts.noQueue  → nicht einreihen (nutzt persistCollection intern,
  //                   das seine eigene Outbox-Buchung macht)
  // Ausgenommen sind auth-Records: die laufen ueber die gema-auth-Function
  // (Rechtepruefung) und sind per RLS direkt gar nicht schreibbar — sie
  // wuerden die Outbox nur dauerhaft verstopfen.
  function _queueOnFail(moduleKey, upserts, delKeys, e, opts){
    if(opts && opts.noQueue) return Promise.reject(e);
    if(moduleKey === 'auth') return Promise.reject(e);
    _outboxEnqueue(moduleKey, upserts, delKeys);
    _scheduleFlush(2000);
    _outboxSync();
    var err = new Error('Sync verzoegert — lokal gespeichert, wird automatisch nachgeholt');
    err.queued = true; err.cause = e;
    return Promise.reject(err);
  }

  function saveRecord(moduleKey, dataKey, data, opts){
    var lm = _now();
    if(moduleKey === 'auth' && _isAuthKey(dataKey)){
      return _routeAuthWrite([{ key: dataKey, data: data }], [], function(){
        return _postRecords([{ module_key: 'auth', data_key: dataKey, payload: { data: data, _lm: lm } }], opts)
          .then(function(){ return { ok:true, lm: lm }; });
      }).then(function(){ return { ok:true, lm: lm }; });
    }
    var body = [{ module_key: moduleKey, data_key: dataKey, payload: { data: data, _lm: lm } }];
    return _postRecords(body, opts).then(function(){
      // Ein aelterer Outbox-Eintrag desselben Records darf den jetzt
      // frischen Cloud-Stand spaeter nicht wieder ueberschreiben.
      _outboxClear(moduleKey, [dataKey]);
      return { ok:true, lm: lm };
    }).catch(function(e){
      return _queueOnFail(moduleKey, [{ key: dataKey, data: data }], [], e, opts);
    });
  }

  /**
   * Schreibt mehrere Records in einer einzigen POST-Anfrage. Reject bei
   * Netz-Fehler. Atomar im Sinne der Anfrage; bei Teilversagen
   * (sehr selten) gibt PostgREST einen Status zurueck.
   */
  function saveRecords(moduleKey, records, opts){
    if(!records || !records.length) return Promise.resolve({ ok:true, count:0 });
    var lm = _now();
    if(moduleKey === 'auth' && records.some(function(r){ return _isAuthKey(r.key); })){
      return _routeAuthWrite(records.map(function(r){ return { key: r.key, data: r.data }; }), [], function(){
        return _postRecords(records.map(function(rec){
          return { module_key: 'auth', data_key: rec.key, payload: { data: rec.data, _lm: lm } };
        }), opts);
      }).then(function(){ return { ok:true, count: records.length, lm: lm }; });
    }
    var body = records.map(function(rec){
      return {
        module_key: moduleKey,
        data_key: rec.key,
        payload: { data: rec.data, _lm: lm }
      };
    });
    return _postRecords(body, opts).then(function(){
      _outboxClear(moduleKey, records.map(function(r){ return r.key; }));
      return { ok:true, count: records.length, lm: lm };
    }).catch(function(e){
      return _queueOnFail(moduleKey, records.map(function(r){ return { key: r.key, data: r.data }; }), [], e, opts);
    });
  }

  /**
   * Hartes Loeschen einer einzelnen Record-Row.
   */
  function deleteRecord(moduleKey, dataKey, opts){
    if(moduleKey === 'auth' && _isAuthKey(dataKey)){
      return _routeAuthWrite([], [dataKey], function(){
        return _deleteRecordDirect(moduleKey, dataKey, opts);
      }).then(function(){ return { ok:true }; });
    }
    return _deleteRecordDirect(moduleKey, dataKey, opts);
  }
  function _deleteRecordDirect(moduleKey, dataKey, opts){
    var url = _sbBase() + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=eq.' + encodeURIComponent(dataKey);
    return fetch(url, { method:'DELETE', headers: _hdrs(), keepalive: !!(opts && opts.keepalive) })
      .then(function(r){
        if(r.status === 401) _handle401();
        if(!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
        _noteSuccess();
        _outboxClear(moduleKey, [dataKey]);
        return { ok:true };
      })
      .catch(function(e){
        _noteFailure(e);
        // Auch Loeschungen verlustfrei nachholen — sonst taucht ein offline
        // geloeschter Datensatz beim naechsten Cloud-Pull wieder auf.
        return _queueOnFail(moduleKey, [], [dataKey], e, opts);
      });
  }

  /**
   * Hartes Loeschen mehrerer Rows (eine Anfrage pro Key — PostgREST kann
   * keine Bulk-Deletes ueber mehrere Schluessel in einer Anfrage).
   */
  function deleteRecords(moduleKey, dataKeys, opts){
    if(!dataKeys || !dataKeys.length) return Promise.resolve({ ok:true, count:0 });
    return Promise.all(dataKeys.map(function(k){ return deleteRecord(moduleKey, k, opts); }))
      .then(function(){ return { ok:true, count: dataKeys.length }; });
  }

  /**
   * Diff zweier Arrays nach idField. Gibt zurueck welche Records neu/
   * geaendert sind (ohne deep-equal — alle die im neuen Array sind und
   * sich vom alten unterscheiden) und welche entfernt wurden.
   */
  function diffArrays(oldArr, newArr, idField){
    oldArr = Array.isArray(oldArr) ? oldArr : [];
    newArr = Array.isArray(newArr) ? newArr : [];
    var oldMap = {};
    oldArr.forEach(function(o){ if(o && o[idField] != null) oldMap[o[idField]] = o; });
    var newIds = {};
    var toUpsert = [];
    newArr.forEach(function(n){
      if(!n || n[idField] == null) return;
      newIds[n[idField]] = true;
      var prev = oldMap[n[idField]];
      if(!prev || JSON.stringify(prev) !== JSON.stringify(n)){
        toUpsert.push(n);
      }
    });
    var toDelete = [];
    oldArr.forEach(function(o){
      if(o && o[idField] != null && !newIds[o[idField]]) toDelete.push(o[idField]);
    });
    return { toUpsert: toUpsert, toDelete: toDelete };
  }

  // Eine Promise-Variante des Diff-Saves: bekommt altes/neues Array,
  // schreibt nur die geaenderten Records, loescht die entfernten.
  // Liefert { upserted, deleted } oder reject bei Fehler.
  function saveDiff(moduleKey, prefix, oldArr, newArr, idField, opts){
    var d = diffArrays(oldArr, newArr, idField);
    if(!d.toUpsert.length && !d.toDelete.length){
      return Promise.resolve({ upserted:0, deleted:0 });
    }
    var upserts = d.toUpsert.map(function(it){
      return { key: prefix + it[idField], data: it };
    });
    return saveRecords(moduleKey, upserts, opts).then(function(){
      if(!d.toDelete.length) return { upserted: upserts.length, deleted: 0 };
      var keys = d.toDelete.map(function(id){ return prefix + id; });
      return deleteRecords(moduleKey, keys, opts).then(function(){
        return { upserted: upserts.length, deleted: keys.length };
      });
    });
  }

  // ── Collection-Helper (wiederverwendbar fuer Module) ─────────────
  // bindCollection: laedt eine Collection aus der Cloud, schreibt sie
  //                 in localStorage[storageKey] als sync-Cache. Migriert
  //                 alte Blob-Rows automatisch. Liefert Promise<Array>.
  // persistCollection: nimmt newArr, vergleicht mit localStorage[storageKey],
  //                    pusht nur geaenderte Records, loescht entfernte.
  //                    Bei Erfolg wird der Cache aktualisiert. Bei Offline:
  //                    KEIN Save, Reject mit klarer Fehlermeldung.
  function _legacyBlobFetch(moduleKey, storageKey){
    var url = _sbBase() + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=eq.' + encodeURIComponent(storageKey)
      + '&select=payload';
    return fetch(url, { headers: _hdrs() })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(rows){
        if(!Array.isArray(rows) || !rows.length) return null;
        var p = rows[0].payload;
        if(!p) return null;
        // Alte Blob-Form: { v: '<json>' } oder { v: <object> }
        if(p.v != null){
          try{
            var v = typeof p.v === 'string' ? JSON.parse(p.v) : p.v;
            return Array.isArray(v) ? v : null;
          }catch(e){ return null; }
        }
        return null;
      })
      .catch(function(){ return null; });
  }

  // In-Memory-Spiegel der Collection-Caches. Schluessel: storageKey ->
  // JSON-String des zuletzt synchronisierten Arrays. Ueberlebt einen
  // fehlgeschlagenen localStorage-Write (Quota). Wird ueber getCached()
  // bereitgestellt, damit Module ihre Diff-Baseline / fremde Records
  // verlaesslich beziehen koennen (opts.baseline) — auch wenn der
  // localStorage-Cache bei bildlastigen Berichten am Quota gescheitert ist.
  // OHNE diese verlaessliche Baseline wuerde der naechste Save ALLE Records
  // statt nur der geaenderten in EINEM riesigen POST hochladen und an der
  // Server-Groessengrenze scheitern (413 → "Speichern fehlgeschlagen").
  var _memCache = {};
  function _writeCache(storageKey, arr){
    var json;
    try{ json = JSON.stringify(arr||[]); }catch(e){ json = '[]'; }
    _memCache[storageKey] = json;
    _idbPut(storageKey, json);
    if(typeof localStorage === 'undefined') return;
    try{ localStorage.setItem(storageKey, json); }
    catch(e){
      // Haeufigster Fall: QuotaExceededError, wenn die Collection grosse
      // Base64-Bilder enthaelt (Dach-/Schadensberichte). Der In-Memory-
      // Spiegel haelt den aktuellen Stand fuer diese Sitzung. Den (evtl.
      // veralteten, nur teilweise passenden) localStorage-Eintrag JETZT
      // entfernen, damit er nicht weiter das knappe Quota belegt — sonst
      // koennen andere localStorage-Nutzer auf derselben Seite (Feedback,
      // Auth, kleinere Module) ebenfalls nicht mehr schreiben. Beim
      // naechsten Seitenstart laedt bindCollection ohnehin frisch aus der
      // Cloud (Single Source of Truth), der Cache ist nur Beschleuniger.
      try{ localStorage.removeItem(storageKey); }catch(_e){}
      try{ console.warn('[GemaSync] _writeCache('+storageKey+') fehlgeschlagen (Quota?) — localStorage-Cache entfernt, In-Memory-Spiegel aktiv:', e && e.name); }catch(_e2){}
    }
  }
  // KANONISCHER Lese-Pfad fuer Collection-Caches (auch als
  // GemaSync.getCached exponiert — Module sollen NIE direkt
  // localStorage.getItem fuer Cloud-Collections nutzen):
  //   1. localStorage zuerst — kann von anderen Tabs aktualisiert worden
  //      sein und ist im Normalfall identisch mit dem Spiegel.
  //   2. In-Memory-Spiegel als Fallback — greift, wenn der localStorage-
  //      Eintrag fehlt (z.B. nach Quota-Fehler von _writeCache entfernt).
  //      Der Spiegel haelt immer den zuletzt synchronisierten Cloud-Stand.
  // Da _writeCache bei Quota-Fehler den localStorage-Eintrag ENTFERNT
  // (statt ihn veraltet stehen zu lassen), ist localStorage entweder
  // frisch oder abwesend — diese Reihenfolge ist daher immer korrekt.
  // Dient auch als Diff-Baseline in _doPersist.
  function _readCache(storageKey){
    if(typeof localStorage !== 'undefined'){
      try{
        var raw = localStorage.getItem(storageKey);
        if(raw != null){
          var arr = JSON.parse(raw);
          if(Array.isArray(arr)) return arr;
        }
      }catch(e){ /* fallthrough zum Spiegel */ }
    }
    if(_memCache[storageKey] != null){
      try{
        var m = JSON.parse(_memCache[storageKey]);
        if(Array.isArray(m)) return m;
      }catch(e){ /* noop */ }
    }
    return [];
  }

  // ── IndexedDB-Zweitschicht fuer Collection-Caches ────────────────────
  // localStorage ist v.a. auf iOS auf ~5 MB gedeckelt: bildlastige Pools
  // (Werkzeug-Kaufbelege, Berichte) fliegen beim Quota-Fehler aus dem
  // localStorage — der naechste Seitenstart fand dann KEINEN Cache und
  // musste den kompletten Cloud-Pull abwarten (DER Hauptgrund fuer
  // «3–4 Sekunden bis Daten sichtbar sind»). IndexedDB hat dieses Limit
  // nicht. Regeln:
  //   - localStorage bleibt FUEHREND (kann von anderen Tabs frischer
  //     sein); IndexedDB fuellt _memCache beim Boot NUR fuer Keys, die im
  //     localStorage FEHLEN (Quota-Opfer).
  //   - _idbReady rejected NIE (resolve(false) bei Fehler/Timeout 2.5 s)
  //     — bindCollection wartet darauf, darf aber nie daran haengen.
  //   - Schreiben ist fire-and-forget (best effort).
  var IDB_NAME = 'gema_sync_cache_v1', IDB_STORE = 'collections';
  var _idb = null;
  var _idbReady = (function(){
    if(typeof indexedDB === 'undefined') return Promise.resolve(false);
    return new Promise(function(resolve){
      var done = false;
      function fin(ok){ if(!done){ done = true; resolve(ok); } }
      var to = setTimeout(function(){ fin(false); }, 2500);
      try{
        var req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = function(){ try{ req.result.createObjectStore(IDB_STORE); }catch(e){} };
        req.onerror = function(){ clearTimeout(to); fin(false); };
        req.onblocked = function(){ clearTimeout(to); fin(false); };
        req.onsuccess = function(){
          _idb = req.result;
          try{
            var tx = _idb.transaction(IDB_STORE, 'readonly');
            var cur = tx.objectStore(IDB_STORE).openCursor();
            cur.onsuccess = function(ev){
              var c = ev.target.result;
              if(!c){ clearTimeout(to); fin(true); return; }
              var k = String(c.key);
              var inLs = false;
              try{ inLs = typeof localStorage !== 'undefined' && localStorage.getItem(k) != null; }catch(e){}
              if(!inLs && _memCache[k] == null && typeof c.value === 'string') _memCache[k] = c.value;
              c.continue();
            };
            cur.onerror = function(){ clearTimeout(to); fin(true); };
          }catch(e){ clearTimeout(to); fin(true); }
        };
      }catch(e){ clearTimeout(to); fin(false); }
    });
  })();
  function _idbPut(storageKey, json){
    if(!_idb) return;
    try{ _idb.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(json, storageKey); }
    catch(e){ /* best effort */ }
  }

  function bindCollection(moduleKey, storageKey, prefix, idField, _opts){
    if(!idField) idField = 'id';
    var reg = (_collReg[moduleKey] = _collReg[moduleKey] || []);
    if(!reg.some(function(r){ return r.prefix === prefix; })) reg.push({ storageKey: storageKey, prefix: prefix, idField: idField });
    _bindregNote(moduleKey, storageKey, prefix, idField, !!(_opts && _opts.prefetch));
    return _idbReady.then(function(){
      return _syncCollection(moduleKey, storageKey, prefix, idField);
    }).then(function(res){
      // Delta-Pfad: nur die geaenderten Rows kamen uebers Netz; res.arr ist
      // der fertig gemergte Vollstand (Zaehl-Kontrolle war in Ordnung).
      if(res && res.delta){
        var arrD = _outboxApplyTo(moduleKey, prefix, idField, res.arr);
        _writeCache(storageKey, arrD);
        return arrD;
      }
      var rows = res ? res.rows : [];
      if(rows && rows.length){
        var arr = rows.map(function(r){ return r.data; }).filter(function(d){ return d && d[idField] != null; });
        // Noch nicht synchronisierte (Outbox-)Aenderungen ueberlagern den
        // Cloud-Stand → lokal gesicherte Eintraege bleiben nach Reload sichtbar.
        arr = _outboxApplyTo(moduleKey, prefix, idField, arr);
        _writeCache(storageKey, arr);
        return arr;
      }
      // GEMA Secure (KRITISCH): eine token-lose Session liest mit dem
      // anon-Key — unter RLS kommt dann 200 + LEER zurueck, obwohl die
      // Daten in der Cloud liegen. Ein GEFUELLTER lokaler Cache wird von
      // so einem Read NIE geleert; stattdessen Cache behalten und zur
      // Neuanmeldung auffordern. (Leerer Cache: Verhalten wie bisher —
      // betrifft nur frische Geraete, dort gibt es nichts zu schuetzen.)
      if(_tokenlessSession()){
        var kept = _readCache(storageKey);
        if(kept.length){ _showRelogin(); return kept; }
      }
      // Keine Per-Record-Daten — pruefe ob alte Blob-Row da ist
      return _legacyBlobFetch(moduleKey, storageKey).then(function(blob){
        if(!Array.isArray(blob) || !blob.length){
          // loadCollection war erfolgreich (Cloud erreichbar) und liefert
          // 0 Per-Record-Rows, und es gibt keine alte Blob-Row → die
          // Collection ist in der Cloud WIRKLICH leer (z.B. der letzte
          // Datensatz wurde geloescht). Den lokalen Cache JETZT leeren,
          // sonst zeigt das Geraet geloeschte/veraltete Datensaetze
          // dauerhaft weiter (Cloud gewinnt). Bei Offline laeuft dieser
          // Pfad nicht — dann rejected loadCollection und der aeussere
          // .catch behaelt den Cache.
          var emptied = _outboxApplyTo(moduleKey, prefix, idField, []);
          _writeCache(storageKey, emptied);
          return emptied;
        }
        var records = blob.filter(function(it){ return it && it[idField] != null; })
                          .map(function(it){ return { key: prefix + it[idField], data: it }; });
        if(!records.length){ _writeCache(storageKey, []); return []; }
        return saveRecords(moduleKey, records).then(function(){
          return deleteRecord(moduleKey, storageKey).then(function(){
            _writeCache(storageKey, blob);
            console.info('[GemaSync] Migration: '+moduleKey+'/'+storageKey+' → '+records.length+' Records');
            return blob;
          });
        });
      });
    }).catch(function(e){
      console.warn('[GemaSync] bindCollection('+moduleKey+'/'+storageKey+') fehlgeschlagen:', e && e.message);
      return _readCache(storageKey);
    });
  }

  // ── Hintergrund-Prefetch: haeufige Collections leise warmhalten ──────
  // Persistente Bind-Registry (welche Collections dieses Geraet zuletzt
  // wirklich gebunden hat, Cap 24 nach Recency). ~6 s nach dem Seitenstart
  // werden die zuletzt genutzten Collections im Leerlauf nachgeladen —
  // der NAECHSTE Modul-Besuch rendert dann aus einem frischen Cache und
  // der Delta-Sync dort hat fast nichts mehr zu holen. Regeln:
  //   - Nur echte Binds aktualisieren die Recency (ein Prefetch haelt
  //     sich sonst selbst fuer immer «zuletzt genutzt»).
  //   - Sequenziell mit 400 ms Abstand, Cap 12 pro Seite — nie ein
  //     Request-Sturm neben der eigentlichen Seiten-Arbeit.
  //   - Nur mit Token, sichtbarem Tab und erreichbarer Cloud; pro
  //     Collection hoechstens alle 5 min (meta.chk).
  var BINDREG_KEY = 'gema_sync_bindreg_v1', BINDREG_MAX = 24;
  var PREFETCH_DELAY_MS = 6000, PREFETCH_GAP_MS = 400, PREFETCH_MAX = 12,
      PREFETCH_MIN_MS = 5 * 60 * 1000;
  var _boundThisPage = {};
  function _bindregLoad(){
    try{
      if(typeof localStorage !== 'undefined'){
        var raw = localStorage.getItem(BINDREG_KEY);
        if(raw){ var o = JSON.parse(raw); if(o && typeof o === 'object' && !Array.isArray(o)) return o; }
      }
    }catch(e){}
    return {};
  }
  function _bindregNote(moduleKey, storageKey, prefix, idField, isPrefetch){
    _boundThisPage[storageKey] = 1;
    if(isPrefetch) return;   // Prefetch haelt die Recency NICHT frisch
    try{
      var reg = _bindregLoad();
      reg[storageKey] = { m: moduleKey, p: prefix, id: idField, ts: Date.now() };
      var keys = Object.keys(reg);
      if(keys.length > BINDREG_MAX){
        keys.sort(function(a, b){ return (reg[b].ts || 0) - (reg[a].ts || 0); });
        keys.slice(BINDREG_MAX).forEach(function(k){ delete reg[k]; });
      }
      if(typeof localStorage !== 'undefined') localStorage.setItem(BINDREG_KEY, JSON.stringify(reg));
    }catch(e){}
  }
  function _bgPrefetch(){
    if(!_authToken() || _tokenlessSession()) return Promise.resolve(0);
    if(typeof document !== 'undefined' && document.visibilityState === 'hidden') return Promise.resolve(0);
    if(!_lastReachable) return Promise.resolve(0);
    var reg = _bindregLoad();
    var now = Date.now();
    var kand = Object.keys(reg).filter(function(k){
      if(_boundThisPage[k]) return false;
      var meta = _metaGet(k);
      if(meta && meta.chk && (now - meta.chk) < PREFETCH_MIN_MS) return false;
      return !!(reg[k] && reg[k].m && reg[k].p);
    });
    kand.sort(function(a, b){ return (reg[b].ts || 0) - (reg[a].ts || 0); });
    kand = kand.slice(0, PREFETCH_MAX);
    if(!kand.length) return Promise.resolve(0);
    var done = 0, chain = Promise.resolve();
    kand.forEach(function(k){
      chain = chain.then(function(){
        var r = reg[k];
        return bindCollection(r.m, k, r.p, r.id || 'id', { prefetch: true })
          .catch(function(){ return null; })
          .then(function(){
            done++;
            return new Promise(function(res){ setTimeout(res, PREFETCH_GAP_MS); });
          });
      });
    });
    return chain.then(function(){ return done; });
  }

  // ── Outbox: verlustfreie Warteschlange fuer nicht synchronisierte Saves ──
  // Jeder fehlgeschlagene Cloud-Push landet hier dauerhaft (localStorage) und
  // wird automatisch nachgesendet — bei Reconnect, periodisch, beim Seiten-
  // start und vor dem Entladen. Schluessel: moduleKey|dataKey, neueste
  // Operation gewinnt. Dadurch geht eine Aenderung NIE verloren, selbst wenn
  // der Cloud-POST scheitert (Netz, 413, Timeout) oder die Seite neu laedt.
  var OUTBOX_KEY = 'gema_sync_outbox_v1';
  var _outboxMem = null;
  function _outboxLoad(){
    if(_outboxMem) return _outboxMem;
    _outboxMem = {};
    try{
      if(typeof localStorage !== 'undefined'){
        var raw = localStorage.getItem(OUTBOX_KEY);
        if(raw){ var o = JSON.parse(raw); if(o && o.ops) _outboxMem = o.ops; }
      }
    }catch(e){ _outboxMem = {}; }
    return _outboxMem;
  }
  function _outboxPersist(){
    if(typeof localStorage === 'undefined') return;
    try{ localStorage.setItem(OUTBOX_KEY, JSON.stringify({ ops: _outboxMem || {} })); }
    catch(e){ /* In-Memory-Spiegel haelt den Stand fuer diese Sitzung */ }
  }
  function _outboxEnqueue(moduleKey, upserts, delKeys){
    var ob = _outboxLoad();
    var lm = _now();
    (upserts || []).forEach(function(rec){
      ob[moduleKey + '|' + rec.key] = { m: moduleKey, key: rec.key, type: 'up', data: rec.data, lm: lm };
    });
    (delKeys || []).forEach(function(k){
      ob[moduleKey + '|' + k] = { m: moduleKey, key: k, type: 'del', lm: lm };
    });
    _outboxPersist();
  }
  function _outboxCount(){ return Object.keys(_outboxLoad()).length; }
  // Liegt fuer diese Collection noch ein NICHT gepushter lokaler Record in
  // der Outbox? Dann ist die Server-Zaehlung als Drift-Kontrolle wertlos
  // (lokal gibt es Records, die der Server noch gar nicht kennt) — der
  // Delta-Sync ueberspringt die Zaehl-Kontrolle dann, sonst wuerde JEDER
  // Seitenstart einen sinnlosen Voll-Resync ausloesen.
  function _outboxHasFor(moduleKey, prefix){
    var ob = _outboxLoad();
    var ks = Object.keys(ob);
    for(var i = 0; i < ks.length; i++){
      var op = ob[ks[i]];
      if(op && op.m === moduleKey && String(op.key).indexOf(prefix) === 0) return true;
    }
    return false;
  }
  // Sichtbare Diagnose der wartenden Uploads: Modul, Schluessel, Groesse,
  // Versuche und der LETZTE ECHTE FEHLER pro Eintrag — damit «es laedt nicht
  // hoch» nie wieder ein Blindflug ist (Details-Box im Banner + Test-Hook).
  function _pendingInfo(){
    var ob = _outboxLoad();
    return Object.keys(ob).map(function(k){
      var o = ob[k];
      var kb = 0;
      try{ kb = o.data ? Math.round(JSON.stringify(o.data).length / 1024) : 0; }catch(e){}
      return { module: o.m, key: o.key, type: o.type, kb: kb,
               tries: o.tries || 0, err: o.err || '', seit: o.lm || '' };
    }).sort(function(a, b){ return a.seit < b.seit ? -1 : 1; });
  }
  // Org-Claim aus dem JWT — nur fuer den Storage-Pfad der Auto-Verkleinerung.
  function _claimOrg(){
    try{
      var tok = _authToken(); if(!tok) return '';
      var p = JSON.parse(atob(String(tok.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/')));
      return p.org || '';
    }catch(e){ return ''; }
  }
  // ── Auto-Verkleinerung (Nachtrag Bugreport 28.07.2026 «es laedt nicht
  // hoch, aber alle Verbindungen funktionieren») ──
  // Haeufigste Ursache eines DAUERHAFT abgelehnten Uploads: der Record traegt
  // eingebettete Base64-Fotos (Storage-Upload war beim Erfassen offline/
  // gescheitert) und ist damit zu gross fuer den Write. GEMA repariert das
  // jetzt selbst: grosse data:-Strings werden in den Foto-Storage ausgelagert
  // (GemaStorage, Muster url||dataUrl wie in den Modulen) und der geschrumpfte
  // Record sofort erneut gesendet. Ersetzt wird NUR ein verifizierter Upload;
  // scheitert einer, bleibt das Feld unveraendert (kein Datenverlust).
  var SHRINK_MIN_CHARS = 60000;   // ~45 KB Bild — darunter lohnt sich nichts
  function _shrinkRecordData(data){
    if(typeof GemaStorage === 'undefined' || !GemaStorage.uploadDataUrl) return Promise.resolve(false);
    var jobs = [];
    function walk(node, tiefe){
      if(!node || typeof node !== 'object' || tiefe > 12) return;
      if(Array.isArray(node)){ for(var i = 0; i < node.length; i++) walk(node[i], tiefe + 1); return; }
      Object.keys(node).forEach(function(k){
        var v = node[k];
        if(typeof v === 'string' && v.length > SHRINK_MIN_CHARS && /^data:(image\/|application\/pdf)/.test(v)){
          jobs.push({ obj: node, key: k, val: v });
        } else if(v && typeof v === 'object'){ walk(v, tiefe + 1); }
      });
    }
    walk(data, 0);
    if(!jobs.length) return Promise.resolve(false);
    var org = _claimOrg() || 'unbekannt';
    var chain = Promise.resolve(), changed = false;
    jobs.forEach(function(j){
      chain = chain.then(function(){
        return GemaStorage.uploadDataUrl(j.val, 'sync/' + org).then(function(res){
          if(!res || !res.url) return;
          changed = true;
          // Modul-Kanon url||dataUrl: dataUrl-Felder wandern ins url-Feld,
          // freie String-Felder (z.B. m.foto) werden zur URL.
          if(j.key === 'dataUrl'){ j.obj.url = res.url; delete j.obj.dataUrl; }
          else if(j.key === 'pdfDataUrl'){ j.obj.pdfUrl = res.url; delete j.obj.pdfDataUrl; }
          else if(j.key === 'bildDataUrl'){ j.obj.bildUrl = res.url; delete j.obj.bildDataUrl; }
          else j.obj[j.key] = res.url;
        }, function(){ /* einzelner Upload-Fehler → Feld unveraendert lassen */ });
      });
    });
    return chain.then(function(){ return changed; });
  }
  // bindCollection registriert moduleKey→storageKey — damit kann die
  // Auto-Verkleinerung den lokalen Cache-Record mit-aktualisieren (sonst
  // wuerde der naechste Save denselben grossen Stand erneut einreihen).
  var _collReg = {};
  function _cacheUpdateRecord(moduleKey, dataKey, data){
    var regs = _collReg[moduleKey] || [];
    for(var i = 0; i < regs.length; i++){
      var r = regs[i];
      if(dataKey.indexOf(r.prefix) !== 0) continue;
      var id = dataKey.slice(r.prefix.length);
      var arr = _readCache(r.storageKey);
      var hit = false;
      for(var n = 0; n < arr.length; n++){
        if(arr[n] && String(arr[n][r.idField]) === id){ arr[n] = data; hit = true; break; }
      }
      if(hit) _writeCache(r.storageKey, arr);
    }
  }
  // Outbox-Stand hat sich geaendert → Banner neu bewerten (erscheint bei
  // Rueckstand trotz Verbindung, verschwindet sobald alles oben ist).
  function _outboxSync(){ try{ _broadcastBanner(_lastReachable); }catch(e){} }
  // Entfernt Eintraege fuer bereits erfolgreich gepushte Records — sonst
  // koennte ein spaeter geflushter, veralteter Outbox-Eintrag den frischen
  // Cloud-Stand desselben Records ueberschreiben (Regression).
  function _outboxClear(moduleKey, keys){
    var ob = _outboxLoad(), changed = false;
    (keys || []).forEach(function(k){ var kk = moduleKey + '|' + k; if(ob[kk]){ delete ob[kk]; changed = true; } });
    if(changed) _outboxPersist();
  }

  var _flushTimer = null, _flushing = false, _flushStart = 0;
  function _scheduleFlush(delay){
    if(_flushTimer || _flushing) return;
    if(typeof setTimeout === 'undefined') return;
    if(!_outboxCount()) return;
    _flushTimer = setTimeout(function(){ _flushTimer = null; _outboxFlush(); }, delay || 4000);
  }
  // Sendet alle eingereihten Operationen, gruppiert nach Modul. Erfolgreich
  // gesendete Eintraege werden aus der Outbox entfernt; fehlgeschlagene
  // bleiben fuer den naechsten Versuch. opts.keepalive fuer den Unload-Pfad.
  //
  // KRITISCH — EIN Problem-Record darf NIE alle anderen blockieren (Nachtrag
  // Bugreport 28.07.2026): Der Sammel-POST pro Modul schickte frueher alle
  // wartenden Records in EINER Anfrage. Ein einziger uebergrosser/haengender
  // Datensatz liess damit die GANZE Anfrage scheitern — nichts wurde je
  // hochgeladen, der Rueckstand wuchs, der Hinweis blieb fuer immer stehen
  // («es hat immer geklappt und jetzt nicht mehr»). Jetzt: scheitert der
  // Sammel-POST, wird jeder Record EINZELN gesendet — nur der wirklich
  // problematische bleibt in der Warteschlange, alles andere geht hoch.
  function _outboxFlush(opts){
    if(_flushing){
      // Watchdog: ein haengender Upload (fetch ohne Timeout) darf den Flush
      // nicht fuer den Rest der Sitzung blockieren.
      if(Date.now() - _flushStart < 180000) return Promise.resolve();
      _flushing = false;
    }
    var ob = _outboxLoad();
    var keys = Object.keys(ob);
    if(!keys.length) return Promise.resolve();
    _flushing = true; _flushStart = Date.now();
    var byModule = {};
    keys.forEach(function(k){ var op = ob[k]; (byModule[op.m] = byModule[op.m] || []).push(op); });
    var chain = Promise.resolve();
    Object.keys(byModule).forEach(function(m){
      chain = chain.then(function(){
        var ops = byModule[m];
        var ups = ops.filter(function(o){ return o.type === 'up'; });
        var dels = ops.filter(function(o){ return o.type === 'del'; });
        var step = Promise.resolve();
        if(ups.length){
          var body = ups.map(function(o){ return { module_key: m, data_key: o.key, payload: { data: o.data, _lm: o.lm } }; });
          step = step.then(function(){ return _postRecords(body, opts); }).then(function(){
            ups.forEach(function(o){ delete _outboxMem[m + '|' + o.key]; });
          }, function(batchErr){
            // Einzeln nachsenden — nur wirklich abgelehnte Records bleiben.
            var single = Promise.resolve(), anyFail = false;
            function sendOne(o){
              return _postRecords([{ module_key: m, data_key: o.key, payload: { data: o.data, _lm: o.lm } }], opts);
            }
            ups.forEach(function(o){
              single = single.then(function(){
                return sendOne(o).then(function(){ delete _outboxMem[m + '|' + o.key]; }, function(err){
                  o.tries = (o.tries || 0) + 1;
                  o.err = String((err && err.message) || err || '').slice(0, 220);
                  // RLS-Heilung (Praxisfall 28.07.2026): Die org-gescopten
                  // Policies (gema_rls_v2) verlangen payload->data->>orgId =
                  // JWT-org — ein Record OHNE orgId-Feld wird mit 403
                  // «row-level security» abgelehnt, fuer immer. Fehlt das
                  // Feld, stempelt GemaSync die EIGENE Org nach und sendet
                  // sofort erneut. Ein Record mit FREMDER orgId wird bewusst
                  // NIE umgestempelt (kein Cross-Org-Ueberschreiben).
                  if(/row.level security|42501/i.test(o.err)
                     && o.data && typeof o.data === 'object' && !Array.isArray(o.data)
                     && !o.data.orgId){
                    var org = _claimOrg();
                    if(org){
                      o.data.orgId = org;
                      _cacheUpdateRecord(m, o.key, o.data);
                      return sendOne(o).then(function(){ delete _outboxMem[m + '|' + o.key]; }, function(e3){
                        o.tries++; o.err = String((e3 && e3.message) || e3 || '').slice(0, 220);
                        anyFail = true;
                      });
                    }
                  }
                  // Dauerhaft abgelehnter GROSSER Record → Base64-Fotos in den
                  // Storage auslagern und den geschrumpften Stand SOFORT
                  // erneut senden (haeufigste Ursache: «Verbindung ok, aber
                  // es laedt nicht hoch»).
                  // Abgelehnt (4xx) → immer Verkleinerung versuchen (die
                  // Suche nach Base64-Feldern ist billig; ohne Fund passiert
                  // nichts). Reiner Netzfehler → erst ab dem 2. Versuch und
                  // nur bei wirklich grossen Records (Timeout-Verdacht).
                  var gross = false;
                  try{ gross = JSON.stringify(o.data || '').length > 300000; }catch(e){}
                  var abgelehnt = /HTTP 4\d\d/.test(o.err) || /payload|too large|exceed/i.test(o.err);
                  if(!(abgelehnt || (gross && o.tries >= 2))){ anyFail = true; return; }
                  return _shrinkRecordData(o.data).then(function(changed){
                    if(!changed){ anyFail = true; return; }
                    _cacheUpdateRecord(m, o.key, o.data);   // naechster Save bleibt klein
                    return sendOne(o).then(function(){ delete _outboxMem[m + '|' + o.key]; }, function(e2){
                      o.tries++; o.err = String((e2 && e2.message) || e2 || '').slice(0, 220);
                      anyFail = true;
                    });
                  }, function(){ anyFail = true; });
                });
              });
            });
            return single.then(function(){ if(anyFail) throw batchErr; });
          });
        }
        if(dels.length){
          // deleteRecords loescht bereits pro Key (Promise.all) — Teilerfolge
          // raeumt der jeweilige _outboxClear im Erfolgspfad selbst ab.
          step = step.then(function(){ return deleteRecords(m, dels.map(function(o){ return o.key; }), opts); }).then(function(){
            dels.forEach(function(o){ delete _outboxMem[m + '|' + o.key]; });
          });
        }
        // Ein scheiterndes Modul darf die uebrigen Module nicht ueberspringen.
        return step.catch(function(){});
      });
    });
    function _done(){
      _flushing = false; _outboxPersist();
      if(_outboxCount()){ _flushFailed = true; _scheduleFlush(15000); }
      else _flushFailed = false;
      _outboxSync();
    }
    return chain.then(_done, _done);
  }
  // Legt ausstehende (noch nicht synchronisierte) Outbox-Operationen ueber ein
  // frisch aus der Cloud geladenes Array — so bleiben lokal gespeicherte, aber
  // noch nicht hochgeladene Aenderungen nach einem Reload sichtbar, bis der
  // Flush sie in die Cloud bringt.
  function _outboxApplyTo(moduleKey, prefix, idField, arr){
    var ob = _outboxLoad();
    var keys = Object.keys(ob).filter(function(k){ return ob[k].m === moduleKey; });
    if(!keys.length) return arr || [];
    var byId = {};
    (arr || []).forEach(function(it){ if(it && it[idField] != null) byId[it[idField]] = it; });
    keys.forEach(function(k){
      var op = ob[k];
      var id = (op.key.indexOf(prefix) === 0) ? op.key.slice(prefix.length) : op.key;
      if(op.type === 'del'){ delete byId[id]; }
      else if(op.type === 'up' && op.data){ byId[id] = op.data; }
    });
    return Object.keys(byId).map(function(id){ return byId[id]; });
  }

  function persistCollection(moduleKey, storageKey, prefix, idField, newArr, opts){
    if(!idField) idField = 'id';
    // opts.baseline: explizite Diff-Baseline (voller zuletzt-synchronisierter
    // Satz). Module, die aus dem Cloud-Array rendern, uebergeben sie, damit
    // der Diff nicht den (evtl. leeren) localStorage-Cache als Baseline nimmt.
    var oldArr = (opts && Array.isArray(opts.baseline)) ? opts.baseline : _readCache(storageKey);
    var d = diffArrays(oldArr, newArr, idField);

    // ── A: Lokale Persistenz IMMER zuerst ──────────────────────────────
    // Der neue Stand ist sofort dauerhaft (localStorage + In-Memory-Spiegel),
    // unabhaengig davon ob der Cloud-Push gleich klappt. Damit geht bei einem
    // fehlgeschlagenen POST (Netz, 413, Timeout) oder einem Reload NIE etwas
    // verloren — die fehlenden Records holt die Outbox spaeter nach.
    _writeCache(storageKey, newArr);

    if(!d.toUpsert.length && !d.toDelete.length){
      return Promise.resolve({ upserted:0, deleted:0, queued:false });
    }
    var upserts = d.toUpsert.map(function(it){ return { key: prefix + it[idField], data: it }; });
    var delKeys = d.toDelete.map(function(id){ return prefix + id; });

    // noQueue: saveRecords/deleteRecords sollen NICHT selbst einreihen —
    // persistCollection bucht Upserts UND Deletes gemeinsam in _queueAndReject.
    var innerOpts = {};
    Object.keys(opts || {}).forEach(function(k){ innerOpts[k] = opts[k]; });
    innerOpts.noQueue = true;

    function _push(){
      return saveRecords(moduleKey, upserts, innerOpts).then(function(){
        if(!delKeys.length) return null;
        return deleteRecords(moduleKey, delKeys, innerOpts);
      }).then(function(){
        // Erfolgreich in der Cloud → evtl. aeltere Outbox-Eintraege fuer
        // dieselben Records verwerfen, damit sie den frischen Stand nicht
        // spaeter ueberschreiben.
        _outboxClear(moduleKey, upserts.map(function(r){ return r.key; }).concat(delKeys));
        return { upserted: upserts.length, deleted: delKeys.length, queued:false };
      });
    }
    // ── B: Cloud-Push scheitert → in die Outbox (verlustfrei nachsenden) ──
    function _queueAndReject(e){
      _outboxEnqueue(moduleKey, upserts, delKeys);
      _scheduleFlush(2000);
      var err = new Error('Sync verzoegert — lokal gespeichert, wird automatisch nachgeholt');
      err.queued = true; err.cause = e;
      return Promise.reject(err);
    }

    // keepalive-Saves (Seite wird entladen) nicht durch einen Probe verzoegern.
    if(!_lastReachable && !(opts && opts.keepalive)){
      return _probeOnce().then(function(reachable){
        if(!reachable) return _queueAndReject(new Error('offline'));
        return _push().catch(_queueAndReject);
      });
    }
    return _push().catch(_queueAndReject);
  }

  // Public API
  w.GemaSync = {
    // GEMA Secure v1
    getAuthToken: _authToken,
    authFnUrl: AUTH_FN,
    SB_KEY: SB_KEY,
    SB_TABLE: SB_TABLE,

    isOnline: function(){ return _online && _lastReachable; },
    isReachable: function(){ return _lastReachable; },
    probe: _probeOnce,
    onConnectivityChange: function(cb){ if(typeof cb === 'function') _connListeners.push(cb); },

    loadCollection: loadCollection,
    loadRecord: loadRecord,
    saveRecord: saveRecord,
    saveRecords: saveRecords,
    deleteRecord: deleteRecord,
    deleteRecords: deleteRecords,
    diffArrays: diffArrays,
    saveDiff: saveDiff,

    // Wiederverwendbar fuer Module
    bindCollection: bindCollection,
    persistCollection: persistCollection,
    // Liefert den zuletzt synchronisierten Stand einer Collection aus dem
    // In-Memory-Spiegel (Fallback: localStorage). Wird gebraucht, wenn ein
    // Modul beim Persistieren fremde Records (z.B. andere Orgs) aus dem
    // vollen Cloud-Satz erhalten muss — verlaesslich auch wenn der
    // localStorage-Cache am Quota gescheitert/entfernt wurde.
    getCached: function(storageKey){ return _readCache(storageKey); },

    // Outbox: nicht synchronisierte Saves manuell nachsenden / Anzahl abfragen.
    flushOutbox: function(opts){ return _outboxFlush(opts); },
    pendingCount: _outboxCount,
    pendingInfo: _pendingInfo,

    // Delta-Sync/Cache-Diagnose + Prefetch-Hooks (Tests, Konsole).
    cacheReady: _idbReady,
    syncMeta: function(storageKey){ return _metaGet(storageKey); },
    prefetchNow: function(){ return _bgPrefetch(); },

    // BEIDE Verbindungswege (aktiver zuerst): direkt supabase.co und der
    // Same-Origin-Proxy /sb. Wer eine gespeicherte Datei-URL laedt, kann
    // damit den jeweils anderen Weg versuchen, wenn einer blockiert ist —
    // eine im Record abgelegte URL zeigt IMMER auf den Weg, der beim
    // Speichern aktiv war, und der muss beim Lesen nicht mehr gelten
    // (anderes Geraet, Firewall, Werbeblocker). Konsument: GemaStorage.
    sbBasen: function(){
      var out = [_sbBase()];
      var alt = _sbProxy ? SB_URL : (/^https?:/.test((typeof location!=='undefined'&&location.origin)||'') ? _proxyBase() : null);
      if(alt && out.indexOf(alt) < 0) out.push(alt);
      return out;
    }
  };
  // SB_URL folgt dem aktiven Verbindungsweg (direkt supabase.co ODER
  // Same-Origin-Proxy /sb) — als Getter, damit alle Konsumenten
  // (gema_auth/_storage/_autosave/_db/_objekte_api lesen zur Laufzeit)
  // den automatischen Weg-Wechsel mitmachen, ohne eigenen Code.
  try{
    Object.defineProperty(w.GemaSync, 'SB_URL', { get: _sbBase });
  }catch(e){ w.GemaSync.SB_URL = SB_URL; }
  // Ruhe-Frist des Upload-Rueckstand-Hinweises (Test-Hook — die Drift-Guards
  // verkuerzen sie, um das Banner-Verhalten ohne 30-s-Wartezeit zu pruefen).
  try{
    Object.defineProperty(w.GemaSync, 'bannerGraceMs', {
      get: function(){ return BANNER_GRACE_MS; },
      set: function(v){ if(typeof v === 'number' && v >= 0) BANNER_GRACE_MS = v; }
    });
  }catch(e){}

  // ── C: Flush-Ausloeser ──────────────────────────────────────────────
  // Outbox bei jeder Gelegenheit leeren, damit nicht synchronisierte Saves
  // verlaesslich in die Cloud kommen — Webhooks/Events decken nicht alles ab.
  if(typeof window !== 'undefined'){
    // Beim Verlassen/Verstecken der Seite: keepalive-Flush, damit der letzte
    // Save eine Navigation ueberlebt (fetch keepalive laeuft nach Unload weiter).
    var _flushOnHide = function(){ try{ _outboxFlush({ keepalive:true }); }catch(e){} };
    window.addEventListener('pagehide', _flushOnHide);
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'hidden') _flushOnHide();
    });
    // Sichtbar/aktiv geworden → erneut versuchen.
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible') _scheduleFlush(800);
    });
    // Periodisches Sicherheitsnetz.
    if(typeof setInterval !== 'undefined'){
      setInterval(function(){ if(_outboxCount() && (_online || _lastReachable)) _outboxFlush(); }, 60000);
    }
    // Hintergrund-Prefetch der zuletzt genutzten Collections — im Leerlauf,
    // deutlich nach dem Boot, damit die eigentliche Seiten-Arbeit Vorrang hat.
    setTimeout(function(){
      var kick = function(){ try{ _bgPrefetch(); }catch(e){} };
      if(typeof requestIdleCallback === 'function') requestIdleCallback(kick, { timeout: 4000 });
      else kick();
    }, PREFETCH_DELAY_MS);
    // Seitenstart: evtl. liegt noch etwas aus einer fruerheren Sitzung herum.
    _scheduleFlush(2500);
  }

})(window);
